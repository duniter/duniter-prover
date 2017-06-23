"use strict";
const co = require('co');
const moment = require('moment');
const hashf = require('duniter-common').hashf;
const dos2unix = require('duniter-common').dos2unix;
const querablep = require('querablep');
const constants = require('./constants');
const keyring = require('duniter-common').keyring;
const rawer = require('duniter-common').rawer;

const PAUSES_PER_TURN = 5;

// This value can be changed
let TURN_DURATION_IN_MILLISEC = 100;

let computing = querablep(Promise.resolve(null));
let askedStop = false;

// By default, we do not prefix the PoW by any number
let prefix = 0;

let signatureFunc, lastSecret, currentCPU = 1;

process.on('uncaughtException', (err) => {
  console.error(err.stack || Error(err));
  process.send({error: err});
});

process.on('message', (message) => co(function*() {

  switch (message.command) {

    case 'newPoW':
      co(function*() {
        askedStop = true
        yield computing;
        const res = yield beginNewProofOfWork(message.value);
        answer(message, res);
      });
      break;

    case 'cancel':
      if (!computing.isFulfilled()) {
        askedStop = true;
      }
      break;

    case 'conf':
      if (message.value.cpu !== undefined) {
        currentCPU = message.value.cpu
      }
      if (message.value.prefix !== undefined) {
        prefix = message.value.prefix
      }
      answer(message, { currentCPU, prefix });
      break;
  }

}));

function beginNewProofOfWork(stuff) {
  askedStop = false;
  computing = querablep(co(function*() {

    /*****************
     * PREPARE POW STUFF
     ****************/

    let nonce = 0;
    const conf = stuff.conf;
    const block = stuff.block;
    const nonceBeginning = stuff.nonceBeginning;
    const nbZeros = stuff.zeros;
    const pair = stuff.pair;
    const forcedTime = stuff.forcedTime;
    currentCPU = conf.cpu || constants.DEFAULT_CPU;
    prefix = parseInt(conf.prefix || prefix) * 10 * constants.NONCE_RANGE;
    const highMark = stuff.highMark;
    const turnDuration = stuff.turnDuration || TURN_DURATION_IN_MILLISEC
    let sigFunc = null;
    if (signatureFunc && lastSecret === pair.sec) {
      sigFunc = signatureFunc;
    }
    else {
      lastSecret = pair.sec;
      sigFunc = keyring.Key(pair.pub, pair.sec).signSync;
    }
    signatureFunc = sigFunc;
    let pow = "", sig = "", raw = "";

    /*****************
     * GO!
     ****************/

    let testsCount = 0;
    let found = false;
    let score = 0;
    let turn = 0;

    while (!found && !askedStop) {

      /*****************
       * A TURN
       ****************/

      yield Promise.race([

        // I. Stop the turn if it exceeds `turnDuration` ms
        countDown(turnDuration),

        // II. Process the turn's PoW
        co(function*() {

          /*****************
           * A TURN OF POW ~= 100ms by default
           * --------------------
           *
           * The concept of "turn" is required to limit the CPU usage.
           * We need a time reference to have the speed = nb tests / period of time.
           * Here we have:
           *
           *   - speed = testsCount / turn
           *
           * We have taken 1 turn = 100ms to control the CPU usage after 100ms of PoW. This means that during the
           * very first 100ms of the PoW, CPU usage = 100%. Then it becomes controlled to the %CPU set.
           ****************/

            // Prove
          let i = 0;
          const thisTurn = turn;
          const pausePeriod = score ? score / PAUSES_PER_TURN : 10; // number of pauses per turn
          // We limit the number of tests according to CPU usage
          const testsPerRound = score ? Math.floor(score * currentCPU) : 1000 * 1000 * 1000

          // Time is updated regularly during the proof
          block.time = getBlockTime(block, conf, forcedTime)
          if (block.number === 0) {
            block.medianTime = block.time
          }
          block.inner_hash = getBlockInnerHash(block);

          /*****************
           * Iterations of a turn
           ****************/

          while(!found && i < testsPerRound && thisTurn === turn && !askedStop) {

            // Nonce change (what makes the PoW change if the time field remains the same)
            nonce++

            /*****************
             * A PROOF OF WORK
             ****************/

            // The final nonce is composed of 3 parts
            block.nonce = prefix + nonceBeginning + nonce
            raw = dos2unix("InnerHash: " + block.inner_hash + "\nNonce: " + block.nonce + "\n")
            sig = dos2unix(sigFunc(raw))
            pow = hashf("InnerHash: " + block.inner_hash + "\nNonce: " + block.nonce + "\n" + sig + "\n").toUpperCase()

            /*****************
             * Check the POW result
             ****************/

            let j = 0, charOK = true;
            while (j < nbZeros && charOK) {
              charOK = pow[j] === '0';
              j++;
            }
            if (charOK) {
              found = pow[nbZeros].match(new RegExp('[0-' + highMark + ']'));
            }
            if (!found && nbZeros > 0 && j - 1 >= constants.POW_MINIMAL_TO_SHOW) {
              pSend({ pow: { pow: pow, block: block, nbZeros: nbZeros }});
            }

            /*****************
             * - Update local vars
             * - Allow to receive stop signal
             ****************/

            if (!found && !askedStop) {
              i++;
              testsCount++;
              if (i % pausePeriod === 0) {
                yield countDown(0); // Very low pause, just the time to process eventual end of the turn
              }
            }
          }

          /*****************
           * Check the POW result
           ****************/
          if (!found) {

            // CPU speed recording
            if (turn > 0 && !score) {
              score = testsCount;
            }

            /*****************
             * UNLOAD CPU CHARGE
             ****************/
            // We wait for a maximum time of `turnDuration`.
            // This will trigger the end of the turn by the concurrent race I. During that time, the proof.js script
            // just does nothing: this gives of a bit of breath to the CPU. Tthe amount of "breath" depends on the "cpu"
            // parameter.
            yield countDown(turnDuration);
          }
        })
      ]);

      // Next turn
      turn++
    }

    /*****************
     * POW IS OVER
     * -----------
     *
     * We either have found a valid POW or a stop event has been detected.
     ****************/

    if (askedStop) {

      // PoW stopped
      askedStop = false;
      return null

    } else {

      // PoW success
      block.hash = pow
      block.signature = sig
      return {
        pow: {
          block: block,
          testsCount: testsCount,
          pow: pow
        }
      }
    }
  }));

  return computing;
}

function countDown(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function getBlockInnerHash(block) {
  const raw = rawer.getBlockInnerPart(block);
  return hash(raw);
}

function hash(str) {
  return hashf(str).toUpperCase();
}

function getBlockTime (block, conf, forcedTime) {
  if (forcedTime) {
    return forcedTime;
  }
  const now = moment.utc().unix();
  const maxAcceleration = require('duniter-common').rules.HELPERS.maxAcceleration(conf);
  const timeoffset = block.number >= conf.medianTimeBlocks ? 0 : conf.rootoffset || 0;
  const medianTime = block.medianTime;
  const upperBound = block.number === 0 ? medianTime : Math.min(medianTime + maxAcceleration, now - timeoffset);
  return Math.max(medianTime, upperBound);
}

function answer(message, answer) {
  return pSend({
    uuid: message.uuid,
    answer
  })
}

function pSend(stuff) {
  return new Promise(function (resolve, reject) {
    process.send(stuff, function (error) {
      !error && resolve();
      error && reject();
    });
  });
}

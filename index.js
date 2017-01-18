"use strict";

const co = require('co');
const async = require('async');
const contacter = require('duniter-crawler').duniter.methods.contacter;
const constants = require('./lib/constants');
const Prover = require('./lib/prover');
const blockGenerator = require('./lib/blockGenerator');
const blockProver = require('./lib/blockProver');

module.exports = {

  duniter: {

    /*********** Permanent prover **************/
    config: {
      onLoading: (server, conf) => co(function*() {
        if (conf.cpu === null || conf.cpu === undefined) {
          conf.cpu = constants.DEFAULT_CPU;
        }
        conf.powSecurityRetryDelay = constants.POW_SECURITY_RETRY_DELAY;
        conf.powMaxHandicap = constants.POW_MAXIMUM_ACCEPTABLE_HANDICAP;
      }),
      beforeSave: (server, conf) => co(function*() {
        delete conf.powSecurityRetryDelay;
        delete conf.powMaxHandicap;
      })
    },

    service: {
      output: (server, conf, logger) => new Prover(server, conf, logger)
    },

    methods: {
      prover: (server, conf, logger) => new Prover(server, conf, logger),
      blockGenerator: (server, conf, logger) => blockGenerator(server),
      generateTheNext: (server, block, trial, manualValues) => co(function*() {
        const prover = blockProver(server);
        const generator = blockGenerator(server, prover);
        return generator.makeNextBlock(block, trial, manualValues);
      })
    },

    /*********** CLI gen-next + gen-root **************/

    cliOptions: [
      {value: '--show', desc: 'With gen-next or gen-root commands, displays the generated block.'},
      {value: '--check', desc: 'With gen-next: just check validity of generated block.'}
    ],

    cli: [{
      name: 'gen-next [host] [port] [difficulty]',
      desc: 'Tries to generate the next block of the blockchain.',
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        const generator = blockGenerator(server, null);
        return generateAndSend(program, host, port, difficulty, server, (server) => generator.nextBlock);
      })
    }, {
      name: 'gen-root [host] [port] [difficulty]',
      desc: 'Tries to generate root block, with choice of root members.',
      onDatabaseExecute: (server, conf, program, params, startServices, stopServices) => co(function*() {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        if (!host) {
          throw 'Host is required.';
        }
        if (!port) {
          throw 'Port is required.';
        }
        if (!difficulty) {
          throw 'Difficulty is required.';
        }
        const generator = blockGenerator(server, null);
        return generateAndSend(program, host, port, difficulty, server, (server) => generator.manualRoot);
      })
    }]
  }
}

function generateAndSend(program, host, port, difficulty, server, getGenerationMethod) {
  const logger = server.logger;
  return new Promise((resolve, reject) => {
    async.waterfall([
      function (next) {
        const method = getGenerationMethod(server);
        co(function*(){
          try {
            const block = yield method();
            next(null, block);
          } catch(e) {
            next(e);
          }
        });
      },
      function (block, next) {
        if (program.check) {
          block.time = block.medianTime;
          program.show && console.log(block.getRawSigned());
          co(function*(){
            try {
              const parsed = server.lib.parsers.parseBlock.syncWrite(block.getRawSigned());
              yield server.BlockchainService.checkBlock(parsed, false);
              logger.info('Acceptable block');
              next();
            } catch (e) {
              next(e);
            }
          });
        }
        else {
          logger.debug('Block to be sent: %s', block.quickDescription());
          async.waterfall([
            function (next) {
              proveAndSend(program, server, block, server.conf.pair.pub, parseInt(difficulty), host, parseInt(port), next);
            }
          ], next);
        }
      }
    ], (err, data) => {
      err && reject(err);
      !err && resolve(data);
    });
  });
}

function proveAndSend(program, server, block, issuer, difficulty, host, port, done) {
  const logger = server.logger;
  async.waterfall([
    function (next) {
      block.issuer = issuer;
      program.show && console.log(block.getRawSigned());
      co(function*(){
        try {
          const prover = blockProver(server);
          const proven = yield prover.prove(block, difficulty);
          next(null, proven);
        } catch(e) {
          next(e);
        }
      });
    },
    function (block, next) {
      const Peer = server.lib.peer;
      const peer = new Peer({
        endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
      });
      program.show && console.log(block.getRawSigned());
      logger.info('Posted block ' + block.quickDescription());
      co(function*(){
        try {
          yield contacter.sendBlock(peer, block);
          const p = Peer.statics.peerize(peer);
          const contact = contacter(p.getHostPreferDNS(), p.getPort(), opts);
          yield contact.postBlock(block.getRaw());
          next();
        } catch(e) {
          next(e);
        }
      });
    }
  ], done);
}

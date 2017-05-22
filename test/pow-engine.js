"use strict";

const co = require('co');
const should = require('should');
const engine = require('../lib/engine');

describe('PoW Engine', () => {

  it('should start with status "ready", then "idle"', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.status()).should.equal('ready');
    yield e1.setValue('autokillTimeout', 10);
  }));

  it('should automatically close itself if no signal is sent', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.status()).should.equal('ready');
    yield e1.setValue('autokillTimeout', 50);
    (yield e1.status()).should.equal('ready');
    (yield e1.status()).should.equal('ready');
    yield new Promise((res) => setTimeout(res, 100));
    e1.isConnected().should.equal(false);
  }));

  it('should NOT automatically close itself too early', () => co(function*(){
    const e1 = engine();
    e1.isConnected().should.equal(false);
    (yield e1.status()).should.equal('ready');
    e1.isConnected().should.equal(true);
    (yield e1.status()).should.equal('ready');
    yield e1.setValue('autokillTimeout', 200);
    yield new Promise((res) => setTimeout(res, 100));
    e1.isConnected().should.equal(true);
    yield new Promise((res) => setTimeout(res, 50));
    e1.isConnected().should.equal(true);
    yield new Promise((res) => setTimeout(res, 50));
    e1.isConnected().should.equal(true);
    yield new Promise((res) => setTimeout(res, 30));
    e1.isConnected().should.equal(false);
  }));

  it('should be identifiable', () => co(function*(){
    const e1 = engine();
    e1.isConnected().should.equal(false);
    (yield e1.status()).should.equal('ready');
    e1.isConnected().should.equal(true);
    (yield e1.setValue('identify', { pubkey: 'pub1', identifier: 'id1' })).should.equal('OK');
    (yield e1.getValue('pubkey')).should.equal('pub1');
    (yield e1.getValue('id')).should.equal('id1');
    yield new Promise((res) => setTimeout(res, 10));
  }));

  it('should be configurable', () => co(function*(){
    const e1 = engine();
    e1.isConnected().should.equal(false);
    (yield e1.status()).should.equal('ready');
    e1.isConnected().should.equal(true);
    (yield e1.setValue('conf', { cpu: 0.2, prefix: '34' })).should.deepEqual({ currentCPU: 0.2, prefix: 34000000000000 });
    (yield e1.getValue('cpu')).should.equal(0.2);
    (yield e1.getValue('prefix')).should.equal(34000000000000);
  }));

  it('should be able to make a proof', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.setValue('identify', { pubkey: 'pub1', identifier: 'id1' })).should.equal('OK');
    const block = { number: 35 };
    const nonceBeginning = 0;
    const zeros = 2;
    const highMark = 'A';
    const pair = {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    };
    const forcedTime = 1;
    const medianTimeBlocks = 20;
    const avgGenTime = 5 * 60;
    const proof = yield e1.prove(block, nonceBeginning, zeros, highMark, pair, forcedTime, medianTimeBlocks, avgGenTime);
    proof.should.deepEqual({
      pow: {
        block: {
          number: 35,
          time: 1,
          inner_hash: '51937F1192447A96537D10968689F4F48859E2DD6F8F9E8DE1006C9697C6C940',
          nonce: 212,
          hash: '009A52E6E2E4EA7DE950A2DA673114FA55B070EBE350D75FF0C62C6AAE9A37E5',
          signature: 'bkmLGX7LNVkuOUMc+/HT6fXJajQtR5uk87fetIntMbGRZjychzu0whl5+AOOGlf+ilp/ara5UK6ppxyPcJIJAg=='
        },
        testsCount: 211,
        pow: '009A52E6E2E4EA7DE950A2DA673114FA55B070EBE350D75FF0C62C6AAE9A37E5',
      }
    });
  }));

  it('should be able to stop a proof', () => co(function*(){
    const e1 = engine();
    (yield e1.status()).should.equal('ready');
    (yield e1.setValue('identify', { pubkey: 'pub1', identifier: 'id1' })).should.equal('OK');
    const block = { number: 26 };
    const nonceBeginning = 0;
    const zeros = 10; // Requires hundreds of thousands of tries probably
    const highMark = 'A';
    const pair = {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    };
    const forcedTime = 1;
    const medianTimeBlocks = 20;
    const proofPromise = e1.prove(block, nonceBeginning, zeros, highMark, pair, forcedTime, medianTimeBlocks);
    yield new Promise((res) => setTimeout(res, 100));
    (yield e1.cancel()).should.equal('cancelling');
    (yield e1.cancel()).should.equal('cancelling');
    const proof = yield proofPromise;
    (yield e1.cancel()).should.equal('ready');
    should.not.exist(proof);
  }));
});

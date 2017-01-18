"use strict";

const co = require('co');
const util = require('util');
const stream = require('stream');
const permanentProver = require('./permanentProver');

module.exports = Prover;

function Prover(server) {

  const permaProver = this.permaProver = permanentProver(server);

  stream.Transform.call(this, { objectMode: true });

  this._write = function (obj, enc, done) {
    // Never close the stream
    if (obj && obj.membersCount) {
      permaProver.blockchainChanged(obj);
    }
    done && done();
  };

  this.startService = () => co(function*() {
    permaProver.allowedToStart();
  });

  this.stopService = () => co(function*() {
    permaProver.stopEveryting();
  });
}

util.inherits(Prover, stream.Transform);

"use strict";

const co = require('co');
const stack = require('duniter').statics.autoStack();

co(function*() {
  try {
    yield stack.executeStack(process.argv);
  } catch(e) {
    console.error(e);
  }
  process.exit();
});

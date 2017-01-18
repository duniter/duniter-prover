"use strict";

module.exports = {
  POW_MINIMAL_TO_SHOW: 2,
  DEFAULT_CPU: 0.6,

  NONCE_RANGE: 1000 * 1000 * 1000 * 100,

  POW_MAXIMUM_ACCEPTABLE_HANDICAP: 64,

  // When to trigger the PoW process again if no PoW is triggered for a while. In milliseconds.
  POW_SECURITY_RETRY_DELAY: 10 * 60 * 1000
};

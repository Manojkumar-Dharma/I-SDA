/**
 * helpers/harness.js - the one `check()` every test file shares (I-120).
 *
 * Before I-120 each of the 149 test files carried its own copy of `check()` and
 * its own `failures` counter. The output format is unchanged, so `run.js` (and the
 * `grep -c '^  ok  -'` / `grep -n '^FAIL'` habits) keep working:
 *
 *     ok  - <label>        (passing check)
 *   FAIL  - <label>        (failing check, counted)
 *
 * Usage in a test file:
 *     const { check, failureCount } = require('./helpers/harness');
 *     ...
 *     process.exit(failureCount() === 0 ? 0 : 1);
 */
'use strict';

let failures = 0;

/** Record one check. Prints exactly what the per-file copies printed. */
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

/** Number of failed checks so far in this process. */
function failureCount() {
  return failures;
}

module.exports = { check, failureCount };

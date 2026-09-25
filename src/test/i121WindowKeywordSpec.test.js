/**
 * i121WindowKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", WINDOW slice.
 * WINDOW's own closed six-keyword mutex used to live as a hand-written
 * array (WINDOW_MUTEX_KEYWORDS) beside DspfWriter.windowMutexConflictReason
 * (Task I-47's own doc comment). It now lives once, as data, in
 * keywordSpec.js's RECORD_TYPES.WINDOW.mutex, and windowMutexConflictReason
 * delegates to KeywordSpec.isMutex for both directions of the check.
 *
 * Unlike the USRDFN slice's whitelist shape ("only these are allowed"),
 * WINDOW's rule is a genuine bidirectional mutex ("none of these six may
 * coexist with WINDOW, in either direction on the same record") - this
 * file exercises isMutex accordingly, checked from both directions, rather
 * than isWhitelisted's single-direction shape.
 *
 * This file verifies:
 *  1. keywordSpec.js's own WINDOW entry matches WINDOW's DDS Reference text
 *     verbatim (the six-keyword mutex list).
 *  2. DspfWriter.windowMutexConflictReason agrees with the spec on every
 *     keyword in KEYWORD-LOOKUP.json (the full known-keyword universe), in
 *     both directions (WINDOW-record + candidate keyword; candidate-keyword
 *     record + WINDOW being added).
 *  3. The explicit SFLCTL exception (named in WINDOW's own DDS Reference
 *     text, deliberately NOT in the mutex list) is unaffected in either
 *     direction.
 *
 * Run with: node src/test/i121WindowKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
const windowRec = [k('WINDOW')];

// ===========================================================================
// Part 1 - the spec entry itself matches the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.WINDOW');
{
  const spec = KeywordSpec.RECORD_TYPES.WINDOW;
  const expectedMutex = ['ALWROL', 'ASSUME', 'MNUBAR', 'PULLDOWN', 'SFL', 'USRDFN'];
  check('mutex has exactly the 6 DDS-Reference-named keywords, no more no less',
    spec.mutex.length === expectedMutex.length &&
    expectedMutex.every((name) => spec.mutex.indexOf(name) !== -1));
  check('WINDOW itself is not in its own mutex list (a record cannot conflict with itself)',
    spec.mutex.indexOf('WINDOW') === -1);
  check('SFLCTL (the DDS Reference\'s explicit exception) is not in the mutex list',
    spec.mutex.indexOf('SFLCTL') === -1);
  check('PASSRCD (a separate, already-fixed I-24 restriction) is not in this mutex list',
    spec.mutex.indexOf('PASSRCD') === -1);
  check('ddsReference cites the exact mutex wording', spec.ddsReference.indexOf('ALWROL, ASSUME, MNUBAR, PULLDOWN, SFL, USRDFN') !== -1);
}

// ===========================================================================
// Part 2 - DspfWriter.windowMutexConflictReason agrees with the spec, for
// every keyword name the codebase actually knows about, in BOTH directions.
// ===========================================================================
console.log('\nDspfWriter.windowMutexConflictReason vs. keywordSpec.js - full keyword sweep');
{
  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  check('KEYWORD-LOOKUP.json has a substantial keyword set to sweep (sanity check on the fixture itself)', allKeywordNames.length > 100);

  // Direction A: record already has WINDOW, candidate keyword is being added.
  let mismatchesA = [];
  allKeywordNames.forEach((name) => {
    if (name === 'WINDOW') return; // WINDOW-on-WINDOW isn't a mutex question
    const specSaysConflict = KeywordSpec.isMutex('WINDOW', name);
    const fnSaysConflict = !!DspfWriter.windowMutexConflictReason(name, windowRec);
    if (specSaysConflict !== fnSaysConflict) mismatchesA.push(name);
  });
  check('windowMutexConflictReason agrees with the spec, WINDOW-record direction (' + (allKeywordNames.length - 1) + ' checked)',
    mismatchesA.length === 0);

  // Direction B: record already has the candidate keyword, WINDOW is being added.
  let mismatchesB = [];
  allKeywordNames.forEach((name) => {
    if (name === 'WINDOW') return;
    const rec = [k(name)];
    const specSaysConflict = KeywordSpec.isMutex('WINDOW', name);
    const fnSaysConflict = !!DspfWriter.windowMutexConflictReason('WINDOW', rec);
    if (specSaysConflict !== fnSaysConflict) mismatchesB.push(name);
  });
  check('windowMutexConflictReason agrees with the spec, WINDOW-being-added direction (' + (allKeywordNames.length - 1) + ' checked)',
    mismatchesB.length === 0);

  // A record with neither WINDOW nor any mutex keyword is never restricted.
  const plainRec = [k('RECORD')];
  check('a plain record is never restricted', !DspfWriter.windowMutexConflictReason('TEXT', plainRec) && !DspfWriter.windowMutexConflictReason('WINDOW', plainRec));
}

// ===========================================================================
// Part 3 - the explicit SFLCTL exception (named in WINDOW's own DDS
// Reference text, deliberately excluded from the mutex list) is unaffected
// in either direction.
// ===========================================================================
console.log('\nSFLCTL exception (WINDOW\'s own DDS Reference text)');
{
  check('SFLCTL is not flagged when adding to a WINDOW record', !DspfWriter.windowMutexConflictReason('SFLCTL', windowRec));
  const sflctlRec = [k('SFLCTL')];
  check('WINDOW is not flagged when adding to an SFLCTL record', !DspfWriter.windowMutexConflictReason('WINDOW', sflctlRec));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

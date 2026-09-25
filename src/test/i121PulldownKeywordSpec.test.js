/**
 * i121PulldownKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", PULLDOWN slice.
 * PULLDOWN's own closed 27-keyword mutex used to live as a hand-written
 * array (PULLDOWN_CONFLICT_KEYWORDS) beside DspfWriter.pulldownConflictReason
 * (Task I-13's own doc comment). It now lives once, as data, in
 * keywordSpec.js's RECORD_TYPES.PULLDOWN.mutex, and pulldownConflictReason
 * delegates to KeywordSpec.isMutex for both directions of the check - the
 * same mutex shape I-121's WINDOW slice introduced, just a much larger list.
 *
 * This file verifies:
 *  1. keywordSpec.js's own PULLDOWN entry matches PULLDOWN's DDS Reference
 *     text verbatim (the 27-keyword mutex list).
 *  2. DspfWriter.pulldownConflictReason agrees with the spec on every
 *     keyword in KEYWORD-LOOKUP.json (the full known-keyword universe), in
 *     both directions (PULLDOWN-record + candidate keyword; candidate-
 *     keyword record + PULLDOWN being added).
 *
 * Run with: node src/test/i121PulldownKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
const pulldownRec = [k('PULLDOWN')];

// ===========================================================================
// Part 1 - the spec entry itself matches the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.PULLDOWN');
{
  const spec = KeywordSpec.RECORD_TYPES.PULLDOWN;
  const expectedMutex = [
    'ALARM', 'ALTNAME', 'ALWGPH', 'ALWROL', 'ASSUME', 'CLEAR', 'CLRL',
    'ERASE', 'ERASEINP', 'FRCDTA', 'HLPCLR', 'HLPSEQ', 'INVITE', 'INZRCD',
    'MDTOFF', 'MNUBAR', 'OVERLAY', 'OVRATR', 'OVRDTA', 'PUTOVR',
    'PUTRETAIN', 'RTNDTA', 'SFL', 'SLNO', 'USRDFN', 'WDWTITLE', 'WINDOW'
  ];
  check('mutex has exactly the 27 DDS-Reference-named keywords, no more no less',
    spec.mutex.length === expectedMutex.length &&
    expectedMutex.every((name) => spec.mutex.indexOf(name) !== -1));
  check('PULLDOWN itself is not in its own mutex list (a record cannot conflict with itself)',
    spec.mutex.indexOf('PULLDOWN') === -1);
  check('ddsReference cites the exact mutex wording', spec.ddsReference.indexOf('WDWTITLE, WINDOW') !== -1);
}

// ===========================================================================
// Part 2 - DspfWriter.pulldownConflictReason agrees with the spec, for
// every keyword name the codebase actually knows about, in BOTH directions.
// ===========================================================================
console.log('\nDspfWriter.pulldownConflictReason vs. keywordSpec.js - full keyword sweep');
{
  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  check('KEYWORD-LOOKUP.json has a substantial keyword set to sweep (sanity check on the fixture itself)', allKeywordNames.length > 100);

  // Direction A: record already has PULLDOWN, candidate keyword is being added.
  let mismatchesA = [];
  allKeywordNames.forEach((name) => {
    if (name === 'PULLDOWN') return;
    const specSaysConflict = KeywordSpec.isMutex('PULLDOWN', name);
    const fnSaysConflict = !!DspfWriter.pulldownConflictReason(name, pulldownRec);
    if (specSaysConflict !== fnSaysConflict) mismatchesA.push(name);
  });
  check('pulldownConflictReason agrees with the spec, PULLDOWN-record direction (' + (allKeywordNames.length - 1) + ' checked)',
    mismatchesA.length === 0);

  // Direction B: record already has the candidate keyword, PULLDOWN is being added.
  let mismatchesB = [];
  allKeywordNames.forEach((name) => {
    if (name === 'PULLDOWN') return;
    const rec = [k(name)];
    const specSaysConflict = KeywordSpec.isMutex('PULLDOWN', name);
    const fnSaysConflict = !!DspfWriter.pulldownConflictReason('PULLDOWN', rec);
    if (specSaysConflict !== fnSaysConflict) mismatchesB.push(name);
  });
  check('pulldownConflictReason agrees with the spec, PULLDOWN-being-added direction (' + (allKeywordNames.length - 1) + ' checked)',
    mismatchesB.length === 0);

  // A record with neither PULLDOWN nor any mutex keyword is never restricted.
  const plainRec = [k('RECORD')];
  check('a plain record is never restricted', !DspfWriter.pulldownConflictReason('TEXT', plainRec) && !DspfWriter.pulldownConflictReason('PULLDOWN', plainRec));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

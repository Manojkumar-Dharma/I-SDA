/**
 * i121DftGroupKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", DFT/DFTVAL/EDTCDE/
 * EDTWRD slice. dftGroupConflictReason's (L81/L82) own
 * DFT_DFTVAL_CONFLICT_GROUP array - a full 4-way mutual exclusion, not a
 * pairwise owner-and-partners relationship - now lives as keywordSpec.js's
 * `MUTEX_GROUPS`, evaluated via the new `groupMutexKeywords(keywordName)`
 * accessor. This is a new shape from every RECORD_TYPES entry so far: a
 * flat list of groups where every member excludes every OTHER member,
 * rather than one "owner" keyword's own partner list.
 *
 * This file verifies:
 *  1. groupMutexKeywords returns the other 3 group members for each of
 *     DFT/DFTVAL/EDTCDE/EDTWRD, and an empty array for a keyword in no
 *     group.
 *  2. dftGroupConflictReason still enforces the group correctly from
 *     every one of the four keywords' own perspective (not just DFT),
 *     plus the separate floating-point block, which is untouched by this
 *     refactor.
 *
 * Run with: node src/test/i121DftGroupKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

const GROUP = ['DFT', 'DFTVAL', 'EDTCDE', 'EDTWRD'];

// ===========================================================================
// Part 1 - groupMutexKeywords
// ===========================================================================
console.log('\nKeywordSpec.groupMutexKeywords');
{
  GROUP.forEach((name) => {
    const others = GROUP.filter((n) => n !== name);
    const result = KeywordSpec.groupMutexKeywords(name);
    check(name + ' returns exactly the other 3 group members',
      result.length === others.length && others.every((n) => result.indexOf(n) !== -1));
  });
  check('a keyword in no group returns an empty array', KeywordSpec.groupMutexKeywords('COLOR').length === 0);
}

// ===========================================================================
// Part 2 - dftGroupConflictReason, from every one of the four perspectives
// ===========================================================================
console.log('\nDspfWriter.dftGroupConflictReason');
{
  check('DFT is blocked when DFTVAL is already on the field', !!DspfWriter.dftGroupConflictReason('DFT', [k('DFTVAL')], 'A'));
  check('DFT is blocked when EDTCDE is already on the field', !!DspfWriter.dftGroupConflictReason('DFT', [k('EDTCDE')], 'A'));
  check('DFT is blocked when EDTWRD is already on the field', !!DspfWriter.dftGroupConflictReason('DFT', [k('EDTWRD')], 'A'));
  check('DFTVAL is blocked when DFT is already on the field (reverse direction)', !!DspfWriter.dftGroupConflictReason('DFTVAL', [k('DFT')], 'A'));
  check('EDTCDE is blocked when DFT is already on the field (L82\'s own reused guard)', !!DspfWriter.dftGroupConflictReason('EDTCDE', [k('DFT')], 'A'));
  check('EDTCDE is blocked when DFTVAL is already on the field', !!DspfWriter.dftGroupConflictReason('EDTCDE', [k('DFTVAL')], 'A'));
  check('EDTWRD is blocked when EDTCDE is already on the field', !!DspfWriter.dftGroupConflictReason('EDTWRD', [k('EDTCDE')], 'A'));
  check('DFT is allowed on a clean field with none of the other three', !DspfWriter.dftGroupConflictReason('DFT', [k('ALIAS')], 'A'));
  check('DFT names ALL present conflicts at once when more than one is on the field', DspfWriter.dftGroupConflictReason('DFT', [k('DFTVAL'), k('EDTCDE')], 'A').indexOf('DFTVAL') !== -1 && DspfWriter.dftGroupConflictReason('DFT', [k('DFTVAL'), k('EDTCDE')], 'A').indexOf('EDTCDE') !== -1);
  check('a keyword never conflicts with its own already-present self', !DspfWriter.dftGroupConflictReason('DFT', [k('DFT')], 'A'));
  check('an unrelated keyword like ALIAS never triggers this check', !DspfWriter.dftGroupConflictReason('ALIAS', [k('DFT'), k('DFTVAL'), k('EDTCDE'), k('EDTWRD')], 'A'));

  check('the separate floating-point block is untouched by this refactor', DspfWriter.dftGroupConflictReason('DFT', [], 'F').indexOf('floating-point') !== -1);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

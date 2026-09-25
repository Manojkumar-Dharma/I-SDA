/**
 * i121SflnxtchgDspmodKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLNXTCHG/
 * SFLMSGRCD + DSPMOD/SFL slice. Two more small, closed-form record-level
 * pairs, each already its own dedicated guard function:
 * sflNxtchgSflMsgRcdConflictReason (I-23, a plain symmetric single-
 * keyword mutex) and dspmodSflConflictReason (genuinely one-directional -
 * DSPMOD cannot be added to an already-SFL record; the DDS Reference
 * never states the reverse, and the pre-existing code never checked it
 * either).
 *
 * This file verifies:
 *  1. Both spec entries match their own DDS Reference text verbatim.
 *  2. DspfWriter.sflNxtchgSflMsgRcdConflictReason agrees with the spec in
 *     BOTH directions (it's symmetric).
 *  3. DspfWriter.dspmodSflConflictReason agrees with the spec, and stays
 *     one-directional (adding SFL to a record with DSPMOD already
 *     present is NOT checked by this function - a keyword name gate,
 *     not this slice's own SFL/DSPMOD scoping, and unaffected by this
 *     refactor either way).
 *
 * Run with: node src/test/i121SflnxtchgDspmodKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// Part 1 - the spec entries match the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.SFLNXTCHG / RECORD_TYPES.DSPMOD');
{
  check('SFLNXTCHG.mutex is exactly [SFLMSGRCD]', KeywordSpec.mutexKeywords('SFLNXTCHG').length === 1 && KeywordSpec.isMutex('SFLNXTCHG', 'SFLMSGRCD'));
  check('SFLNXTCHG ddsReference cites the exact DDS Reference wording', KeywordSpec.RECORD_TYPES.SFLNXTCHG.ddsReference.indexOf('cannot specify SFLNXTCHG with the SFLMSGRCD keyword') !== -1);

  check('DSPMOD.mutex is exactly [SFL]', KeywordSpec.mutexKeywords('DSPMOD').length === 1 && KeywordSpec.isMutex('DSPMOD', 'SFL'));
  check('DSPMOD ddsReference cites the exact one-directional DDS Reference wording', KeywordSpec.RECORD_TYPES.DSPMOD.ddsReference.indexOf('cannot be specified on a subfile record') !== -1);
}

// ===========================================================================
// Part 2 - DspfWriter.sflNxtchgSflMsgRcdConflictReason, both directions
// ===========================================================================
console.log('\nDspfWriter.sflNxtchgSflMsgRcdConflictReason');
{
  check('SFLNXTCHG is blocked when SFLMSGRCD is already present', !!DspfWriter.sflNxtchgSflMsgRcdConflictReason('SFLNXTCHG', [k('SFLMSGRCD')]));
  check('SFLMSGRCD is blocked when SFLNXTCHG is already present (symmetric)', !!DspfWriter.sflNxtchgSflMsgRcdConflictReason('SFLMSGRCD', [k('SFLNXTCHG')]));
  check('SFLNXTCHG is allowed on a record with neither keyword', !DspfWriter.sflNxtchgSflMsgRcdConflictReason('SFLNXTCHG', [k('SFL')]));
  check('SFLMSGRCD is allowed on a record with neither keyword', !DspfWriter.sflNxtchgSflMsgRcdConflictReason('SFLMSGRCD', [k('SFL')]));
}

// ===========================================================================
// Part 3 - DspfWriter.dspmodSflConflictReason, one-directional
// ===========================================================================
console.log('\nDspfWriter.dspmodSflConflictReason');
{
  check('DSPMOD is blocked on a record that already has SFL', !!DspfWriter.dspmodSflConflictReason('DSPMOD', [k('SFL')]));
  check('DSPMOD is allowed on a record without SFL', !DspfWriter.dspmodSflConflictReason('DSPMOD', [k('TEXT')]));
  check('this function only gates DSPMOD itself - SFL being added to a record with DSPMOD is untouched (one-directional, matches the DDS Reference\'s own wording)', !DspfWriter.dspmodSflConflictReason('SFL', [k('DSPMOD')]));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

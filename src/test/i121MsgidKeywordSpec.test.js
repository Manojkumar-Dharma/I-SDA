/**
 * i121MsgidKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", MSGID slice.
 * msgidExclusionConflictReason/msgidExclusionNewConflictReason's (I-91)
 * own MSGID_EXCLUDED_KEYWORDS array (a 5-keyword field-level mutex) plus
 * msgidSflRecordReason's (I-92) separate SFL record-level exclusion now
 * come from keywordSpec.js's RECORD_TYPES.MSGID - same shape as the HTML
 * slice (`mutex` plus `notAllowedInRecordType`).
 *
 * This file verifies:
 *  1. The spec entry matches the DDS Reference text verbatim - both the
 *     5-keyword field-level list and the SFL record exclusion.
 *  2. msgidExclusionConflictReason (add-time, both directions) and
 *     msgidExclusionNewConflictReason (diff-based backstop) agree with the
 *     spec, plus a full keyword sweep on the add-time function.
 *  3. msgidSflRecordReason (via msgidExclusionConflictReason and
 *     msgidSflNewConflictReason) still refuses MSGID on an SFL record's
 *     field, and is one-directional (SFLCTL, not SFL, is untouched).
 *
 * Run with: node src/test/i121MsgidKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

const EXPECTED_MUTEX = ['DFT', 'DFTVAL', 'FLTFIXDEC', 'FLTPCN', 'MSGCON'];

// ===========================================================================
// Part 1 - the spec entry matches the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.MSGID');
{
  check('MSGID.mutex is exactly the 5 DDS-Reference-named field-level keywords',
    KeywordSpec.mutexKeywords('MSGID').length === EXPECTED_MUTEX.length &&
    EXPECTED_MUTEX.every((n) => KeywordSpec.isMutex('MSGID', n)));
  check('MSGID ddsReference cites the exact field-level mutex wording', KeywordSpec.RECORD_TYPES.MSGID.ddsReference.indexOf('DFT, DFTVAL, FLTFIXDEC, FLTPCN, MSGCON') !== -1);
  check('MSGID.notAllowedInRecordType is SFL', KeywordSpec.notAllowedInRecordType('MSGID') === 'SFL');
  check('MSGID ddsReference cites the exact SFL exclusion wording', KeywordSpec.RECORD_TYPES.MSGID.ddsReference.indexOf('You cannot specify MSGID in a subfile record format (SFL keyword)') !== -1);
}

// ===========================================================================
// Part 2 - msgidExclusionConflictReason (add-time), both directions, full sweep
// ===========================================================================
console.log('\nDspfWriter.msgidExclusionConflictReason - field-level mutex');
{
  EXPECTED_MUTEX.forEach((name) => {
    check('MSGID is blocked when ' + name + ' is already on the field', !!DspfWriter.msgidExclusionConflictReason('MSGID', [k(name)], []));
    check(name + ' is blocked when MSGID is already on the field (reverse direction)', !!DspfWriter.msgidExclusionConflictReason(name, [k('MSGID')], []));
  });

  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  let mismatches = [];
  allKeywordNames.forEach((name) => {
    if (name === 'MSGID') return;
    const specSaysConflict = KeywordSpec.isMutex('MSGID', name);
    const codeSaysConflict = !!DspfWriter.msgidExclusionConflictReason(name, [k('MSGID')], []);
    if (specSaysConflict !== codeSaysConflict) mismatches.push(name);
  });
  check('msgidExclusionConflictReason agrees with the spec for every known non-MSGID keyword (' + allKeywordNames.length + ' checked)', mismatches.length === 0);

  check('MSGID is allowed on a field with an unrelated keyword', !DspfWriter.msgidExclusionConflictReason('MSGID', [k('CHECK')], []));
}

// ===========================================================================
// Part 3 - msgidExclusionNewConflictReason (diff-based backstop)
// ===========================================================================
console.log('\nDspfWriter.msgidExclusionNewConflictReason');
{
  check('adding DFT to a field that already has MSGID is blocked', !!DspfWriter.msgidExclusionNewConflictReason([k('MSGID')], [k('MSGID'), k('DFT')]));
  check('adding MSGID to a field that already has FLTPCN is blocked', !!DspfWriter.msgidExclusionNewConflictReason([k('FLTPCN')], [k('FLTPCN'), k('MSGID')]));
  check('a pre-existing conflict (hand-written) is not re-reported on an unrelated edit', !DspfWriter.msgidExclusionNewConflictReason([k('MSGID'), k('DFT')], [k('MSGID'), k('DFT'), k('ALIAS')]));
  check('removing the conflicting keyword is always allowed', !DspfWriter.msgidExclusionNewConflictReason([k('MSGID'), k('DFT')], [k('MSGID')]));
}

// ===========================================================================
// Part 4 - the SFL record exclusion (msgidExclusionConflictReason's SFL
// branch, and msgidSflNewConflictReason), one-directional
// ===========================================================================
console.log('\nDspfWriter MSGID SFL record exclusion');
{
  check('MSGID is blocked on a field of an SFL record (add-time)', !!DspfWriter.msgidExclusionConflictReason('MSGID', [], [k('SFL')]));
  check('MSGID is allowed on a field of an SFLCTL record - not the same record type', !DspfWriter.msgidExclusionConflictReason('MSGID', [], [k('SFLCTL')]));
  check('msgidSflNewConflictReason blocks MSGID introduced onto a field of an SFL record', !!DspfWriter.msgidSflNewConflictReason([], [k('MSGID')], [k('SFL')]));
  check('msgidSflNewConflictReason does not re-report a pre-existing MSGID on an SFL record when the edit does not add another', !DspfWriter.msgidSflNewConflictReason([k('MSGID')], [k('MSGID'), k('ALIAS')], [k('SFL')]));
  check('SFL being added to a record with an existing MSGID field is untouched (one-directional, matches the DDS Reference\'s own wording)', !DspfWriter.msgidExclusionConflictReason('SFL', [k('MSGID')], []));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

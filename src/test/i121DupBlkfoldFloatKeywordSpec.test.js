/**
 * i121DupBlkfoldFloatKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", DUP/BLKFOLD-
 * floating-point slice. `floatIncompatibleKeywordNewConflictReason`
 * (I-72/I-96) already implements "this keyword cannot be specified on a
 * floating-point field" correctly for both DUP and BLKFOLD, but which
 * keywords that rule applies to lived only as two separate one-line
 * wrapper functions (`dupFloatNewConflictReason`/
 * `blkfoldFloatNewConflictReason`), each hard-coding its own single
 * keyword name with no browsable per-keyword fact anywhere.
 *
 * DUP's own DDS Reference section (line ~5490) and BLKFOLD's own (line
 * ~2392) each independently state "You cannot specify the [keyword]
 * keyword on a floating-point field (F in position 35)".
 *
 * This file verifies:
 *  1. keywordSpec.js's DUP/BLKFOLD entries each carry
 *     notAllowedOnFloatingPointField: true and the exact citation text,
 *     and no other RECORD_TYPES entry does.
 *  2. KeywordSpec.isNotAllowedOnFloatingPointField agrees with that flag
 *     for both names plus an unrelated name.
 *  3. DspfWriter.floatIncompatibleKeywordNewConflictReason/
 *     dupFloatNewConflictReason/blkfoldFloatNewConflictReason are
 *     themselves unchanged by this refactor: both directions (adding the
 *     keyword to an already-float field; changing the data type to F on
 *     a field that already carries the keyword), the not-introduced-by-
 *     this-edit fail-open case, and a no-op for an unrelated keyword
 *     name (now that the function asserts against the spec instead of
 *     trusting every caller).
 *
 * Run with: node src/test/i121DupBlkfoldFloatKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

// ===========================================================================
// Part 1 - the spec entries carry notAllowedOnFloatingPointField
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.{DUP,BLKFOLD}.notAllowedOnFloatingPointField');
{
  const expectedCitations = {
    DUP: 'You cannot specify the DUP keyword on a floating-point field (F in position 35).',
    BLKFOLD: 'You cannot specify the BLKFOLD keyword on a floating-point field (F in position 35).'
  };
  Object.keys(expectedCitations).forEach(function (name) {
    const spec = KeywordSpec.RECORD_TYPES[name];
    check(name + '.notAllowedOnFloatingPointField is true', spec.notAllowedOnFloatingPointField === true);
    check(name + '.floatDdsReference matches its own DDS Reference wording verbatim', spec.floatDdsReference === expectedCitations[name]);
  });

  // Task I-125 later extended this same flag to COMP/RANGE/VALUES (a
  // deferred finding this slice itself raised) - DUP and BLKFOLD are
  // still the only two flagged by asserting membership directly, since
  // "no OTHER entry is ever flagged" is no longer this slice's own fact
  // to assert once a later task legitimately extends the same field.
  const flaggedNames = Object.keys(KeywordSpec.RECORD_TYPES).filter(function (name) {
    return KeywordSpec.RECORD_TYPES[name].notAllowedOnFloatingPointField;
  });
  check('DUP and BLKFOLD both carry notAllowedOnFloatingPointField', flaggedNames.indexOf('DUP') >= 0 && flaggedNames.indexOf('BLKFOLD') >= 0);
}

// ===========================================================================
// Part 2 - KeywordSpec.isNotAllowedOnFloatingPointField
// ===========================================================================
console.log('\nKeywordSpec.isNotAllowedOnFloatingPointField');
{
  ['DUP', 'BLKFOLD'].forEach(function (name) {
    check(name + ' is not-allowed-on-floating-point-field', KeywordSpec.isNotAllowedOnFloatingPointField(name) === true);
  });
  check('an unrelated keyword (TEXT) is not flagged', KeywordSpec.isNotAllowedOnFloatingPointField('TEXT') === false);
  check('a keyword with no spec entry at all is not flagged (fails open, false)', KeywordSpec.isNotAllowedOnFloatingPointField('NOSUCHKEYWORD') === false);
  // Task I-125 closed this gap - COMP IS now flagged too (see
  // i125FloatIncompatibleValidityCheckGuard.test.js for that task's own
  // coverage). This slice's own scope was only ever DUP/BLKFOLD.
  check('COMP is flagged too, since I-125 (this test\'s own deferred finding)', KeywordSpec.isNotAllowedOnFloatingPointField('COMP') === true);
}

// ===========================================================================
// Part 3 - DspfWriter.floatIncompatibleKeywordNewConflictReason and its
//          two named wrappers, unchanged behavior
// ===========================================================================
console.log('\nDspfWriter.floatIncompatibleKeywordNewConflictReason / dupFloatNewConflictReason / blkfoldFloatNewConflictReason (unchanged behavior)');
{
  ['DUP', 'BLKFOLD'].forEach(function (name) {
    const withKw = [{ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] }];

    // Forward: keyword being added (via `updates.keywords`) while the field is already F.
    check(name + ' - adding it to an already-floating-point field is blocked', !!DspfWriter.floatIncompatibleKeywordNewConflictReason(name, { dataType: 'F', keywords: [] }, { keywords: withKw }));
    // Reverse: data type being changed to F while the keyword is already present.
    check(name + ' - changing the data type to F while it is already present is blocked', !!DspfWriter.floatIncompatibleKeywordNewConflictReason(name, { dataType: 'A', keywords: withKw }, { dataType: 'F' }));
    // Already-invalid hand-written field: not re-reported when the edit is unrelated.
    check(name + ' - an already-invalid hand-written F field is not re-reported for an unrelated edit', !DspfWriter.floatIncompatibleKeywordNewConflictReason(name, { dataType: 'F', keywords: withKw }, { text: 'unrelated' }));
    // Non-float field: never blocked.
    check(name + ' - a non-floating-point field is never blocked', !DspfWriter.floatIncompatibleKeywordNewConflictReason(name, { dataType: 'A', keywords: [] }, { keywords: withKw }));
  });

  check('an unrelated keyword name is a no-op (not spec-flagged)', !DspfWriter.floatIncompatibleKeywordNewConflictReason('TEXT', { dataType: 'A', keywords: [] }, { dataType: 'F', keywords: [{ name: 'TEXT', parameters: '', conditions: [], raw: '', sourceLines: [] }] }));

  const dupKw = [{ name: 'DUP', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  check('dupFloatNewConflictReason still delegates to the generic helper for DUP', !!DspfWriter.dupFloatNewConflictReason({ dataType: 'F', keywords: [] }, { keywords: dupKw }));
  const blkfoldKw = [{ name: 'BLKFOLD', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  check('blkfoldFloatNewConflictReason still delegates to the generic helper for BLKFOLD', !!DspfWriter.blkfoldFloatNewConflictReason({ dataType: 'F', keywords: [] }, { keywords: blkfoldKw }));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

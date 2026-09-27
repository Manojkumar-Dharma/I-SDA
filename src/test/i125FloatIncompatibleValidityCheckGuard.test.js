/**
 * i125FloatIncompatibleValidityCheckGuard.test.js
 *
 * Task I-125 - COMP/RANGE/VALUES/CHECK(AB) "not on a floating-point
 * field" restriction is unenforced. Opened from a deferred finding
 * raised by I-121's DUP/BLKFOLD-floating-point slice: RANGE, COMP,
 * VALUES, and CHECK(AB) each independently state the identical "cannot
 * be specified on a floating-point field (F in position 35)" restriction
 * DUP/BLKFOLD's own sections state, with no guard anywhere in the
 * codebase before this task.
 *
 * This file verifies the DspfWriter-level (backend) logic only - see
 * i125FloatCheckWebviewGuard.test.js for the real UI-flow coverage
 * (the validity-check instances picker, the repeatable CHECK-codes
 * picker, and the Basic-tab data-type select).
 *
 *  1. keywordSpec.js's RANGE/COMP/VALUES entries each carry
 *     notAllowedOnFloatingPointField: true and the exact citation text,
 *     and (together with DUP/BLKFOLD from I-121) no other RECORD_TYPES
 *     entry does.
 *  2. rangeFloatNewConflictReason/compFloatNewConflictReason/
 *     valuesFloatNewConflictReason: both directions (adding the keyword
 *     to an already-float field; changing the data type to F on a field
 *     that already carries the keyword), the not-introduced-by-this-edit
 *     fail-open case, and a non-float field is never blocked.
 *  3. checkAbFloatIncompatibleNewConflictReason: the same shape, but
 *     fires ONLY for the AB code - a CHECK(M10)/CHECK(ME) field (any
 *     other code) is never blocked, in either direction.
 *
 * Run with: node src/test/i125FloatIncompatibleValidityCheckGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

function kw(name, parameters) {
  return { name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] };
}

// ===========================================================================
// Part 1 - the spec entries carry notAllowedOnFloatingPointField
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.{RANGE,COMP,VALUES}.notAllowedOnFloatingPointField');
{
  const expectedCitations = {
    RANGE: 'You cannot specify RANGE on a floating-point field (F in position 35).',
    COMP: 'You cannot specify the COMP keyword on a floating-point field (F in position 35).',
    VALUES: 'You cannot specify VALUES on a floating-point field (F in position 35).'
  };
  Object.keys(expectedCitations).forEach(function (name) {
    const spec = KeywordSpec.RECORD_TYPES[name];
    check(name + '.notAllowedOnFloatingPointField is true', spec.notAllowedOnFloatingPointField === true);
    check(name + '.floatDdsReference matches its own DDS Reference wording verbatim', spec.floatDdsReference === expectedCitations[name]);
  });

  const flaggedNames = Object.keys(KeywordSpec.RECORD_TYPES).filter(function (name) {
    return KeywordSpec.RECORD_TYPES[name].notAllowedOnFloatingPointField;
  });
  check('exactly DUP/BLKFOLD (I-121) plus RANGE/COMP/VALUES (I-125) carry notAllowedOnFloatingPointField', flaggedNames.length === 5);
}

// ===========================================================================
// Part 2 - rangeFloatNewConflictReason / compFloatNewConflictReason /
//          valuesFloatNewConflictReason
// ===========================================================================
console.log('\nDspfWriter.{rangeFloatNewConflictReason,compFloatNewConflictReason,valuesFloatNewConflictReason}');
{
  const fns = {
    RANGE: DspfWriter.rangeFloatNewConflictReason,
    COMP: DspfWriter.compFloatNewConflictReason,
    VALUES: DspfWriter.valuesFloatNewConflictReason
  };
  Object.keys(fns).forEach(function (name) {
    const fn = fns[name];
    const withKw = [kw(name)];

    check(name + ' - adding it to an already-floating-point field is blocked', !!fn({ dataType: 'F', keywords: [] }, { keywords: withKw }));
    check(name + ' - changing the data type to F while it is already present is blocked', !!fn({ dataType: 'A', keywords: withKw }, { dataType: 'F' }));
    check(name + ' - an already-invalid hand-written F field is not re-reported for an unrelated edit', !fn({ dataType: 'F', keywords: withKw }, { text: 'unrelated' }));
    check(name + ' - a non-floating-point field is never blocked', !fn({ dataType: 'A', keywords: [] }, { keywords: withKw }));
  });

  check('rangeFloatNewConflictReason delegates to the generic helper unchanged', !!DspfWriter.floatIncompatibleKeywordNewConflictReason('RANGE', { dataType: 'F', keywords: [] }, { keywords: [kw('RANGE')] }));
}

// ===========================================================================
// Part 3 - checkAbFloatIncompatibleNewConflictReason
// ===========================================================================
console.log('\nDspfWriter.checkAbFloatIncompatibleNewConflictReason');
{
  const abKw = [kw('CHECK', 'AB')];
  const m10Kw = [kw('CHECK', 'M10')];
  const multiCodeAbKw = [kw('CHECK', 'M10 AB')];

  check('adding CHECK(AB) to an already-floating-point field is blocked', !!DspfWriter.checkAbFloatIncompatibleNewConflictReason({ dataType: 'F', keywords: [] }, { keywords: abKw }));
  check('changing the data type to F while CHECK(AB) is already present is blocked', !!DspfWriter.checkAbFloatIncompatibleNewConflictReason({ dataType: 'A', keywords: abKw }, { dataType: 'F' }));
  check('an already-invalid hand-written F field with CHECK(AB) is not re-reported for an unrelated edit', !DspfWriter.checkAbFloatIncompatibleNewConflictReason({ dataType: 'F', keywords: abKw }, { text: 'unrelated' }));
  check('a non-floating-point field with CHECK(AB) is never blocked', !DspfWriter.checkAbFloatIncompatibleNewConflictReason({ dataType: 'A', keywords: [] }, { keywords: abKw }));
  check('a multi-code CHECK(M10 AB) instance is still recognized as carrying AB', !!DspfWriter.checkAbFloatIncompatibleNewConflictReason({ dataType: 'F', keywords: [] }, { keywords: multiCodeAbKw }));

  check('adding CHECK(M10) (a different code) to a floating-point field is NOT blocked', !DspfWriter.checkAbFloatIncompatibleNewConflictReason({ dataType: 'F', keywords: [] }, { keywords: m10Kw }));
  check('changing the data type to F while CHECK(M10) (a different code) is present is NOT blocked', !DspfWriter.checkAbFloatIncompatibleNewConflictReason({ dataType: 'A', keywords: m10Kw }, { dataType: 'F' }));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

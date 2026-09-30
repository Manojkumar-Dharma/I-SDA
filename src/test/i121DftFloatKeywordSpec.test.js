/**
 * i121DftFloatKeywordSpec.test.js
 *
 * Task I-121 (DFT/DFTVAL floating-point slice) - dftGroupConflictReason's
 * (L81/L82) "not valid on floating-point fields" clause was a literal
 * `dataType === 'F'` test applied to whichever keyword it was handed. It is
 * now a spec fact: RECORD_TYPES.{DFT,DFTVAL,EDTCDE,EDTWRD}
 * .notAllowedOnFloatingPointField (DFT/DFTVAL from their own DDS Reference
 * sentences; EDTCDE/EDTWRD from their Y-only / Y-or-blank eligibility
 * sentences), read through KeywordSpec.isNotAllowedOnFloatingPointField.
 * Pure refactor for the four group members; behavior for the group is
 * unchanged.
 *
 *  1. the four spec entries: flag + citation text.
 *  2. the guard: all four still blocked on an F field, none on other types,
 *     message wording unchanged, and the mutex behavior is untouched.
 *  3. a keyword outside the group is no longer blindly float-blocked.
 *
 * Run with: node src/test/i121DftFloatKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

console.log('=== 1. spec entries ===');
{
  const cites = {
    DFT: /^The DFT keyword is not valid on floating point fields\.$/,
    DFTVAL: /or on a floating-point field\.$/,
    EDTCDE: /valid only for fields with Y or blank in position 35/,
    EDTWRD: /valid for numeric only fields \(Y specified in position 35\)/,
  };
  Object.keys(cites).forEach((n) => {
    const spec = KeywordSpec.RECORD_TYPES[n];
    check(n + ' has a spec entry flagged notAllowedOnFloatingPointField', !!spec && spec.notAllowedOnFloatingPointField === true);
    check(n + ' carries its DDS Reference citation', !!spec && cites[n].test(spec.floatDdsReference));
    check(n + ' answers isNotAllowedOnFloatingPointField', KeywordSpec.isNotAllowedOnFloatingPointField(n) === true);
  });
  check('EDTCDE\'s pre-existing noFillCodes fact survived', !!KeywordSpec.RECORD_TYPES.EDTCDE.noFillCodes);
  check('the whole-keyword flag still does not include CHECK (token-qualified only)', KeywordSpec.isNotAllowedOnFloatingPointField('CHECK') === false);
}

console.log('=== 2. dftGroupConflictReason ===');
['DFT', 'DFTVAL', 'EDTCDE', 'EDTWRD'].forEach((n) => {
  check(n + ' is blocked on a floating-point field, wording unchanged',
    DspfWriter.dftGroupConflictReason(n, [], 'F') === n + ' is not valid on floating-point fields (per the DDS Reference).');
  check(n + ' floating-point test is case-insensitive', !!DspfWriter.dftGroupConflictReason(n, [], 'f'));
  check(n + ' is not float-blocked on any non-F type (A, S, P, B, blank, undefined)',
    ['A', 'S', 'P', 'B', '', undefined].every((dt) => DspfWriter.dftGroupConflictReason(n, [], dt) === null));
});
check('the float message wins over the mutex message on an F field that also carries a conflicting keyword',
  /not valid on floating-point fields/.test(DspfWriter.dftGroupConflictReason('DFT', [k('DFTVAL')], 'F')));
check('the mutex behavior is untouched (DFT vs DFTVAL on a non-float field)',
  /cannot be specified together with DFTVAL/.test(DspfWriter.dftGroupConflictReason('DFT', [k('DFTVAL')], 'A')));

console.log('=== 3. outside the group ===');
check('a keyword in no group and not flagged is not float-blocked by this function', DspfWriter.dftGroupConflictReason('COLOR', [], 'F') === null);

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

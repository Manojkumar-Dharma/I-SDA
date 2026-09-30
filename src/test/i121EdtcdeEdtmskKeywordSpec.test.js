/**
 * i121EdtcdeEdtmskKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", EDTCDE/EDTMSK slice.
 *
 * EDTCDE's own DDS Reference section: asterisk fill or a floating currency
 * symbol may be specified "with edit codes 1 through 4, A through D, and J
 * through Q" - so W, X, Y and Z cannot take one (a hand-written
 * EDTCDE_NO_FILL_CODES array before this slice). EDTMSK's own section: "The
 * field containing the EDTMSK keyword must be usage I or usage B. It must
 * also contain the EDTCDE or EDTWRD keywords." (hard-coded in
 * editMaskConflictReason, I-31). Both now read keywordSpec.js: a new
 * `noFillCodes` fact on RECORD_TYPES.EDTCDE, and the existing CHKMSGID
 * `qualifyingNames`/`qualifyingListText` + `definitionRequirements.usage`
 * shapes, reused unchanged, on RECORD_TYPES.EDTMSK.
 *
 * Verifies:
 *  1. Both spec entries and citations, that each carries only its own
 *     facts, and that only EDTCDE has `noFillCodes`.
 *  2. The accessors, including case-insensitivity and fail-safe inputs.
 *  3. editCodeFillConflictReason unchanged (message wording included).
 *  4. editMaskConflictReason unchanged (order of the two checks, wording).
 *
 * Run with: node src/test/i121EdtcdeEdtmskKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

console.log('\nRECORD_TYPES.EDTCDE / EDTMSK');
{
  const C = KeywordSpec.RECORD_TYPES.EDTCDE, M = KeywordSpec.RECORD_TYPES.EDTMSK;
  check('EDTCDE entry exists', !!C);
  check('EDTMSK entry exists', !!M);
  check('EDTCDE no-fill codes are exactly W, X, Y, Z', C.noFillCodes.codes.join() === 'W,X,Y,Z');
  check('EDTCDE allowed-codes wording', C.noFillCodes.allowedText === '1-4, A-D and J-Q');
  check('EDTCDE citation', /1 through 4, A through D, and J through Q/.test(C.noFillCodes.ddsReference));
  check('EDTCDE carries only noFillCodes plus (I-121 DFT float slice) the floating-point flag and its citation',
    Object.keys(C).sort().join() === 'floatDdsReference,noFillCodes,notAllowedOnFloatingPointField');
  check('EDTMSK qualifying names', M.qualifyingNames.join() === 'EDTCDE,EDTWRD');
  check('EDTMSK qualifying list text', M.qualifyingListText === 'EDTCDE or EDTWRD');
  check('EDTMSK usage I/B', M.definitionRequirements.usage.join() === 'I,B');
  check('EDTMSK citation', /must be usage I or usage B/.test(M.ddsReference) && /EDTCDE or EDTWRD/.test(M.ddsReference));
  check('EDTMSK carries no fill/mutex facts', !M.noFillCodes && !M.mutex && !M.qualifyingCheckKeyword);
  const withFill = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].noFillCodes);
  check('only EDTCDE has noFillCodes', withFill.join() === 'EDTCDE');
}

console.log('\nAccessors');
{
  ['W', 'X', 'Y', 'Z', 'w', ' z '].forEach((c) => check('isNoFillEditCode(EDTCDE, ' + c + ')', KeywordSpec.isNoFillEditCode('EDTCDE', c) === true));
  ['1', '4', 'A', 'D', 'J', 'Q', '5', '9', 'V', 'R', '', null, undefined].forEach((c) => check('isNoFillEditCode(EDTCDE, ' + String(c) + ') false', KeywordSpec.isNoFillEditCode('EDTCDE', c) === false));
  check('isNoFillEditCode(EDTWRD, W) false', KeywordSpec.isNoFillEditCode('EDTWRD', 'W') === false);
  check('isNoFillEditCode(unknown) false', KeywordSpec.isNoFillEditCode('NOPE', 'W') === false && KeywordSpec.isNoFillEditCode(null, 'W') === false);
  check('fillAllowedCodesText(EDTCDE)', KeywordSpec.fillAllowedCodesText('EDTCDE') === '1-4, A-D and J-Q');
  check('fillAllowedCodesText(EDTMSK/unknown) empty', KeywordSpec.fillAllowedCodesText('EDTMSK') === '' && KeywordSpec.fillAllowedCodesText('NOPE') === '');
  check('hasQualifyingKeyword(EDTMSK) with EDTCDE', KeywordSpec.hasQualifyingKeyword('EDTMSK', [k('EDTCDE', 'Y')]) === true);
  check('hasQualifyingKeyword(EDTMSK) with EDTWRD', KeywordSpec.hasQualifyingKeyword('EDTMSK', [k('EDTWRD', "'0  '")]) === true);
  check('hasQualifyingKeyword(EDTMSK) with neither', KeywordSpec.hasQualifyingKeyword('EDTMSK', [k('DFT', "'x'")]) === false);
  check('hasQualifyingKeyword(EDTMSK) with no keywords', KeywordSpec.hasQualifyingKeyword('EDTMSK', []) === false && KeywordSpec.hasQualifyingKeyword('EDTMSK', null) === false);
}

console.log('\neditCodeFillConflictReason (unchanged behavior)');
{
  const r = DspfWriter.editCodeFillConflictReason;
  check('blank fill: nothing reported', r('EDTCDE', 'W', '') === null && r('', 'W', '  ') === null && r('EDTCDE', 'W', null) === null);
  check('fill with EDTWRD kind', r('EDTWRD', 'J', '*') === '"Replace leading zeros with" applies only to an EDTCDE edit code.');
  check('fill with no kind', r('', 'J', '*') === '"Replace leading zeros with" applies only to an EDTCDE edit code.');
  check('multi-char fill', /must be a single character/.test(r('EDTCDE', 'J', '**')));
  check('quote/paren fill', /must be a single character/.test(r('EDTCDE', 'J', '(')) && /must be a single character/.test(r('EDTCDE', 'J', "'")));
  check('blank code with fill', r('EDTCDE', '', '*') === 'Enter an edit code before choosing what replaces leading zeros.');
  ['W', 'X', 'Y', 'Z', 'y'].forEach((c) => {
    const want = 'Asterisk fill or a floating currency symbol can be specified only with edit codes 1-4, A-D and J-Q, not ' + c.toUpperCase() + ' (per the DDS Reference).';
    check('no-fill code ' + c + ' blocked with exact wording', r('EDTCDE', c, '*') === want);
  });
  ['1', '2', '3', '4', 'A', 'B', 'C', 'D', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', '5', '9'].forEach((c) => {
    check('code ' + c + ' takes fill', r('EDTCDE', c, '*') === null);
  });
  check('currency-symbol fill on a J code', r('EDTCDE', 'J', '$') === null);
}

console.log('\neditMaskConflictReason (unchanged behavior)');
{
  const r = DspfWriter.editMaskConflictReason;
  const usageMsg = 'EDTMSK requires field usage I or B (per the DDS Reference).';
  const kwMsg = 'EDTMSK requires the field to also carry EDTCDE or EDTWRD (per the DDS Reference).';
  check('usage I + EDTCDE ok', r([k('EDTCDE', 'Y')], 'I') === null);
  check('usage B + EDTWRD ok', r([k('EDTWRD', "'0  '")], 'B') === null);
  check('lowercase usage accepted', r([k('EDTCDE', 'Y')], 'b') === null);
  ['O', 'H', 'M', 'P', '', null, undefined].forEach((u) => check('usage ' + String(u) + ' blocked', r([k('EDTCDE', 'Y')], u) === usageMsg));
  check('no edit keyword blocked', r([], 'I') === kwMsg && r(null, 'B') === kwMsg && r([k('DFT', "'x'")], 'I') === kwMsg);
  check('usage checked before keywords (both wrong -> usage message)', r([], 'O') === usageMsg);
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

/**
 * i121WrdwrapIgcalttypEligibilitySpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", WRDWRAP/IGCALTTYP
 * field-eligibility slice. WRDWRAP's usage (I or B) and nine blocked keyboard
 * shifts, and IGCALTTYP's usage (B) and allowed keyboard shifts (A/N/X/W/I),
 * previously lived as WRDWRAP_BLOCKED_SHIFTS / IGCALTTYP_ALLOWED_SHIFTS and
 * literal usage tests in dspfWriter.js (plus a second copy of WRDWRAP's nine
 * shifts in webviewClientHelpers.js). They now live on keywordSpec.js's
 * RECORD_TYPES.WRDWRAP / RECORD_TYPES.IGCALTTYP. Pure refactor, no behavior
 * change.
 *
 * Run with: node src/test/i121WrdwrapIgcalttypEligibilitySpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nspec entries (DDS_Keyword_V7r6.txt WRDWRAP ~line 13788, IGCALTTYP ~line 14968)');
{
  check('WRDWRAP.allowedUsage is I, B', same(KeywordSpec.allowedUsage('WRDWRAP'), ['I', 'B']));
  check('WRDWRAP.blockedDataTypes is the nine listed shifts', same(KeywordSpec.blockedDataTypes('WRDWRAP'), ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G']));
  check('WRDWRAP has no allowedDataTypes (IBM states it as a block list)', KeywordSpec.allowedDataTypes('WRDWRAP') === null);
  check('IGCALTTYP.allowedUsage is B', same(KeywordSpec.allowedUsage('IGCALTTYP'), ['B']));
  check('IGCALTTYP.allowedDataTypes is A, N, X, W, I', same(KeywordSpec.allowedDataTypes('IGCALTTYP'), ['A', 'N', 'X', 'W', 'I']));
  check('IGCALTTYP has no blockedDataTypes (IBM states it as an allow list)', KeywordSpec.blockedDataTypes('IGCALTTYP') === null);
  ['DUP', 'CHRID', 'NOSUCHKEYWORD', '', null, undefined].forEach((n) => {
    check('no eligibility facts for ' + String(n),
      KeywordSpec.allowedUsage(n) === null && KeywordSpec.blockedDataTypes(n) === null && KeywordSpec.allowedDataTypes(n) === null);
  });
  const a = KeywordSpec.blockedDataTypes('WRDWRAP');
  a.push('Z');
  check('accessors return copies (mutating one does not change the spec)', KeywordSpec.blockedDataTypes('WRDWRAP').indexOf('Z') < 0);
  // The two opposite-polarity data-type lists must agree with the DBCS statements
  const igcAllowed = KeywordSpec.allowedDataTypes('IGCALTTYP');
  ['J', 'E', 'O', 'G'].forEach((c) => {
    check('DBCS shift ' + c + ' is neither IGCALTTYP-allowed nor WRDWRAP-allowed', igcAllowed.indexOf(c) < 0 && KeywordSpec.blockedDataTypes('WRDWRAP').indexOf(c) >= 0);
  });
}

console.log('\nWRDWRAP reasons over the spec (unchanged behavior)');
{
  // Reasons are exercised through the public Basic-tab guard, which calls both
  const guard = DspfWriter.wrdwrapBasicEditConflictReason;
  const kw = [{ name: 'WRDWRAP', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  // guard(fieldKeywords, oldDataType, oldUsage, newDataType, newUsage): start from a
  // valid A/B field and change one property (an unchanged property is never checked).
  const withWrap = (upd) => guard(kw, 'A', 'B',
    upd.dataType !== undefined ? upd.dataType : 'A',
    upd.usage !== undefined ? upd.usage : 'B');
  ['I'].forEach((u) => check('usage ' + u + ' allowed', guard(kw, 'A', 'O', 'A', u) === null));
  check('usage B allowed (from I)', guard(kw, 'A', 'I', 'A', 'B') === null);
  ['O', 'H', 'M', 'P'].forEach((u) => {
    const r = withWrap({ usage: u });
    check('usage ' + u + ' blocked with the WRDWRAP usage wording', /WRDWRAP can only be specified on input-only \(I\) or input\/output \(B\) fields/.test(r || ''));
  });
  KeywordSpec.blockedDataTypes('WRDWRAP').forEach((d) => {
    const r = withWrap({ dataType: d });
    check('shift ' + d + ' blocked', /WRDWRAP cannot be specified on a field with keyboard shift\/data type/.test(r || '') && (r || '').indexOf(' ' + d + ' ') >= 0);
  });
  ['A', 'N', 'X', 'W', 'I', 'L', 'T', 'Z', 'P', 'B', 'H'].forEach((d) => check('shift ' + d + ' not blocked', withWrap({ dataType: d }) === null));
  check('lowercase data type is normalized', /WRDWRAP cannot be specified/.test(withWrap({ dataType: 's' }) || ''));
  check('blank data type fails open', withWrap({ dataType: '' }) === null);
}

console.log('\nIGCALTTYP reasons over the spec (unchanged behavior)');
{
  const r = DspfWriter.igcalttypEligibilityReason;
  check('usage B + shift A eligible', r('B', 'A', false) === null);
  ['A', 'N', 'X', 'W', 'I'].forEach((d) => check('shift ' + d + ' eligible', r('B', d, false) === null));
  ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G', 'L', 'T', 'Z', 'P', 'B', 'H'].forEach((d) => {
    check('shift ' + d + ' ineligible with the shift wording', /IGCALTTYP can only be specified on a field whose keyboard shift type is A, N, X, W or I, not /.test(r('B', d, false) || ''));
  });
  ['I', 'O', 'H', 'M', 'P'].forEach((u) => {
    check('usage ' + u + ' ineligible with the usage wording', r(u, 'A', false) === 'IGCALTTYP can only be specified on input- and output-capable (usage B) fields (per the DDS Reference).');
  });
  check('lowercase usage b accepted', r('b', 'a', false) === null);
  check('blank usage and blank shift fail open', r('', '', false) === null && r(null, undefined, false) === null);
  check('constant fields never eligible', /not valid on constant fields/.test(r('B', 'A', true) || ''));
  check('usage checked before data type', /usage B/.test(r('O', 'S', false) || ''));
}

console.log('\nwebview data-type row filter reads the same spec');
{
  const helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
  const fn = helpers && helpers.generalFieldKeywordRowMatchesDataType;
  if (typeof fn === 'function') {
    KeywordSpec.blockedDataTypes('WRDWRAP').forEach((d) => check('row hidden for shift ' + d, fn('wrdwrap-shifts', d) === false));
    ['A', 'N', 'X', 'W', 'I', 'L', ''].forEach((d) => check('row shown for shift ' + (d || '(blank)'), fn('wrdwrap-shifts', d) === true));
  } else {
    console.log('  (generalFieldKeywordRowMatchesDataType not exported from Node require - covered by the webview-level tests)');
  }
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

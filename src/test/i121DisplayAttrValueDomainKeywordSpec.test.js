/**
 * i121DisplayAttrValueDomainKeywordSpec.test.js
 *
 * Task I-121 (DSPATR/COLOR/WDWBORDER/CHGINPDFT value-domain slice) - the
 * closed value sets of four display-attribute keywords now live in
 * keywordSpec.js, each from its own DDS Reference section. The webview keeps
 * its own panel display order; this test ties every one of its hand-kept
 * lists to the spec so a mistyped or missing value cannot drift in silently.
 * Pure addition, no behavior change.
 *
 *  1. the facts: exact values (IBM order), input-capable-only subset, citations.
 *  2. cross-checks inside the spec: CHGINPDFT's parts are members of DSPATR /
 *     CHECK, WDWBORDER's attributes are members of DSPATR.
 *  3. the webview's four lists equal the spec domains as sets ('' = the
 *     panel's own "unspecified" colour choice).
 *  4. accessors: copies, fail-safe.
 *
 * Run with: node src/test/i121DisplayAttrValueDomainKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const web = fs.readFileSync(path.join(__dirname, '../webviewClientHelpers.js'), 'utf8');
const j = (a) => JSON.stringify(a);
const sameSet = (a, b) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();
function listIn(name) {
  const m = web.match(new RegExp('var ' + name + ' = \\[([^\\]]*)\\];'));
  return m ? (m[1].match(/'[^']*'/g) || []).map((s) => s.slice(1, -1)) : null;
}
const R = KeywordSpec.RECORD_TYPES;

console.log('=== 1. the facts ===');
check('DSPATR values (IBM order)', j(R.DSPATR.validValues) === j(['BL', 'CS', 'HI', 'ND', 'PC', 'RI', 'UL', 'MDT', 'OID', 'PR', 'SP']));
check('DSPATR input-capable-only subset', j(R.DSPATR.inputCapableOnlyValues) === j(['MDT', 'OID', 'PR', 'SP']));
check('COLOR values (IBM order)', j(R.COLOR.validValues) === j(['GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK', 'BLU']));
check('WDWBORDER display attributes', j(R.WDWBORDER.displayAttributeValues) === j(['BL', 'CS', 'HI', 'ND', 'RI', 'UL']));
check('WDWBORDER colour comes from COLOR', R.WDWBORDER.colorValuesFrom === 'COLOR' && KeywordSpec.validValues('COLOR').length === 7);
check('CHGINPDFT values', j(R.CHGINPDFT.validValues) === j(['BL', 'CS', 'HI', 'RI', 'UL', 'FE', 'LC', 'ME', 'MF']));
['DSPATR', 'COLOR', 'WDWBORDER', 'CHGINPDFT'].forEach((k) => check(k + ' carries a citation', typeof R[k].ddsReference === 'string' && R[k].ddsReference.length > 30));

console.log('\n=== 2. cross-checks inside the spec ===');
check('input-capable-only values are DSPATR values', R.DSPATR.inputCapableOnlyValues.every((v) => R.DSPATR.validValues.indexOf(v) >= 0));
check('CHGINPDFT = its DSPATR part + its CHECK part', sameSet(R.CHGINPDFT.validValues, R.CHGINPDFT.dspatrValues.concat(R.CHGINPDFT.checkCodes)));
check('CHGINPDFT DSPATR part are DSPATR values', R.CHGINPDFT.dspatrValues.every((v) => R.DSPATR.validValues.indexOf(v) >= 0));
check('CHGINPDFT CHECK part are CHECK codes', R.CHGINPDFT.checkCodes.every((c) => KeywordSpec.checkCodes().indexOf(c) >= 0));
check('WDWBORDER attributes are DSPATR values', R.WDWBORDER.displayAttributeValues.every((v) => R.DSPATR.validValues.indexOf(v) >= 0));
check('WDWBORDER attributes are all-field DSPATR values', R.WDWBORDER.displayAttributeValues.every((v) => R.DSPATR.inputCapableOnlyValues.indexOf(v) < 0));

console.log('\n=== 3. the webview lists ===');
// Task I-121r - the four lists are no longer literals: they are read from
// the spec on first use (screen order kept). The test now asks the helpers
// for them instead of regex-parsing source text.
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const dspatr = Helpers.dspatrAttrs();
const color = Helpers.colorValues();
const border = Helpers.wdwBorderAttrs();
const chg = Helpers.chgInpDftCodes();
check('DSPATR list = DSPATR values', sameSet(dspatr, R.DSPATR.validValues));
check('COLOR list = \'\' + COLOR values', color.indexOf('') === 0 && sameSet(color.slice(1), R.COLOR.validValues));
check('WDWBORDER list = WDWBORDER display attributes', sameSet(border, R.WDWBORDER.displayAttributeValues));
check('CHGINPDFT list = CHGINPDFT values', sameSet(chg, R.CHGINPDFT.validValues));
// Screen order is presentation and must not move (the pre-I-121r literals, verbatim).
check('DSPATR screen order unchanged', j(dspatr) === j(['HI', 'RI', 'CS', 'BL', 'ND', 'UL', 'PC', 'MDT', 'PR', 'OID', 'SP']));
check('COLOR screen order unchanged', j(color) === j(['', 'BLU', 'RED', 'WHT', 'GRN', 'TRQ', 'YLW', 'PNK']));
check('WDWBORDER screen order unchanged', j(border) === j(['HI', 'RI', 'CS', 'BL', 'ND', 'UL']));
check('CHGINPDFT screen order unchanged', j(chg) === j(['HI', 'RI', 'CS', 'BL', 'UL', 'LC', 'ME', 'MF', 'FE']));
check('the writer exposes the WDWBORDER accessor as a copy', j(DspfWriter.displayAttributeValues('WDWBORDER')) === j(R.WDWBORDER.displayAttributeValues) && DspfWriter.displayAttributeValues('WDWBORDER') !== R.WDWBORDER.displayAttributeValues);
check('a keyword with no display-attribute fact gives []', DspfWriter.displayAttributeValues('DUP').length === 0);
// The spec is the owner: a value the spec adds and the screen order does not name is appended, never dropped.
check('specValuesInScreenOrder appends a spec value the screen order lacks', j(Helpers.specValuesInScreenOrder(['A', 'B', 'C'], ['C', 'A'])) === j(['C', 'A', 'B']));
check('specValuesInScreenOrder drops a screen value the spec no longer has', j(Helpers.specValuesInScreenOrder(['A'], ['C', 'A'])) === j(['A']));
const labels = (web.match(/var CHGINPDFT_LABELS = \{([\s\S]*?)\n  \}/) || [])[1] || '';
check('every CHGINPDFT value has a label', R.CHGINPDFT.validValues.every((v) => new RegExp('\\b' + v + ':').test(labels)));

console.log('\n=== 4. accessors ===');
KeywordSpec.validValues('COLOR').push('ZZZ');
check('validValues returns a copy', KeywordSpec.validValues('COLOR').length === 7);
check('isValidValue works for the new keywords', KeywordSpec.isValidValue('DSPATR', 'PC') && KeywordSpec.isValidValue('COLOR', 'TRQ') && !KeywordSpec.isValidValue('COLOR', 'BLK') && !KeywordSpec.isValidValue('CHGINPDFT', 'ND'));
check('WDWBORDER has no plain validValues', KeywordSpec.validValues('WDWBORDER').length === 0);

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

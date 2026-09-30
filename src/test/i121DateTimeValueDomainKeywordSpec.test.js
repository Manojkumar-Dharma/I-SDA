/**
 * i121DateTimeValueDomainKeywordSpec.test.js
 *
 * Task I-121 (date/time value-domain slice) - DATFMT / DATSEP / TIMFMT /
 * TIMSEP get a `validValues` fact (from each keyword's own DDS Reference
 * section) and the webview's four hand-kept value arrays now derive from it
 * through DspfWriter.dateTimeValidValues. Pure refactor, no behavior change.
 *
 *  1. the facts: exact values and order per keyword, TIMFMT without *JOB,
 *     TIMSEP without the slash, citations, only these four carry the fact.
 *  2. accessors: copy semantics, isValidValue, fail-safe input.
 *  3. cross-checks: fixed-separator formats and the engine's DATFMT width
 *     table are members/equal to the declared formats; every declared value
 *     has a label in the webview.
 *  4. the webview's rendered selects offer exactly '' + the spec values.
 *
 * Run with: node src/test/i121DateTimeValueDomainKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const j = (a) => JSON.stringify(a);

console.log('=== 1. the facts ===');
check('DATFMT values', j(KeywordSpec.validValues('DATFMT')) === j(['*JOB', '*MDY', '*DMY', '*YMD', '*JUL', '*ISO', '*USA', '*EUR', '*JIS']));
check('TIMFMT values (no *JOB)', j(KeywordSpec.validValues('TIMFMT')) === j(['*HMS', '*ISO', '*USA', '*EUR', '*JIS']));
check('DATSEP values', j(KeywordSpec.validValues('DATSEP')) === j(['*JOB', '/', '-', '.', ',', ' ']));
check('TIMSEP values (no slash)', j(KeywordSpec.validValues('TIMSEP')) === j(['*JOB', ':', '.', ',', ' ']));
['DATFMT', 'DATSEP', 'TIMFMT', 'TIMSEP'].forEach((k) => {
  check(k + ' carries a citation', typeof KeywordSpec.RECORD_TYPES[k].valuesDdsReference === 'string' && KeywordSpec.RECORD_TYPES[k].valuesDdsReference.length > 20);
});
const holders = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].validValues);
check('the four date/time keywords all carry validValues', ['DATFMT', 'DATSEP', 'TIMFMT', 'TIMSEP'].every((k) => holders.indexOf(k) >= 0));

console.log('\n=== 2. accessors ===');
KeywordSpec.validValues('DATFMT').push('*ZZZ');
check('validValues returns a copy', KeywordSpec.validValues('DATFMT').length === 9);
check('unrelated / unknown keyword gives []', KeywordSpec.validValues('DUP').length === 0 && KeywordSpec.validValues('NOPE').length === 0);
check('isValidValue accepts declared values', KeywordSpec.isValidValue('DATFMT', '*JUL') && KeywordSpec.isValidValue('DATSEP', '-') && KeywordSpec.isValidValue('TIMSEP', ' '));
check('special values are case-insensitive, separators are not padded', KeywordSpec.isValidValue('DATFMT', '*jul') && !KeywordSpec.isValidValue('DATSEP', '  '));
check('rejects the other keyword\'s values', !KeywordSpec.isValidValue('TIMFMT', '*JOB') && !KeywordSpec.isValidValue('TIMSEP', '/') && KeywordSpec.isValidValue('DATSEP', '/'));
check('isValidValue fail-safe', [null, undefined, ''].every((v) => KeywordSpec.isValidValue('DATFMT', v) === false)
  && KeywordSpec.isValidValue('DUP', '*ISO') === false && KeywordSpec.isValidValue('constructor', 'x') === false);
check('DspfWriter.dateTimeValidValues reads the spec', j(DspfWriter.dateTimeValidValues('TIMSEP')) === j(KeywordSpec.validValues('TIMSEP')));

console.log('\n=== 3. cross-checks ===');
['DATSEP', 'TIMSEP'].forEach((k) => {
  const partner = KeywordSpec.RECORD_TYPES[k].fixedSeparatorPartner;
  check(k + ' fixed-separator formats are declared formats of ' + partner,
    KeywordSpec.RECORD_TYPES[k].fixedSeparatorFormats.every((f) => KeywordSpec.validValues(partner).indexOf(f) >= 0));
});
const eng = read('dspfEngine.js');
const table = (eng.match(/var DATFMT_LENGTHS = \{([\s\S]*?)\};/) || [])[1] || '';
const engineKeys = (table.match(/'\*[A-Z]+'/g) || []).map((s) => s.replace(/'/g, ''));
check('engine width table covers exactly the declared DATFMT values', engineKeys.length === 9 && j(engineKeys.slice().sort()) === j(KeywordSpec.validValues('DATFMT').slice().sort()));
const web = read('webviewClientHelpers.js');
[['DATE_FORMAT_LABELS', 'DATFMT'], ['TIME_FORMAT_LABELS', 'TIMFMT'], ['DATE_SEP_LABELS', 'DATSEP'], ['TIME_SEP_LABELS', 'TIMSEP']].forEach(([label, kw]) => {
  const body = (web.match(new RegExp('var ' + label + ' = \\{(.*?)\\};')) || [])[1] || '';
  const keys = (body.match(/'([^']*)': /g) || []).map((s) => s.slice(1, s.indexOf("'", 1)));
  check(label + ' has a label for every declared ' + kw + ' value (and \'\')',
    KeywordSpec.validValues(kw).concat(['']).every((v) => keys.indexOf(v) >= 0) && keys.length === KeywordSpec.validValues(kw).length + 1);
});
check('webview no longer hand-keeps the four value arrays', !/var (DATE|TIME)_(FORMAT|SEP)_VALUES\b/.test(web));

console.log('\n=== 4. rendered selects ===');
// Render through the real helper module when it is loadable in node.
// The helper module reads DspfWriter as a browser global.
global.DspfWriter = DspfWriter;
let helpers = null;
try { helpers = require(path.join(__dirname, '../webviewClientHelpers.js')); } catch (e) { /* browser-only module */ }
if (helpers && typeof helpers.dateTimeFormatHtml === 'function') {
  const opts = (html, id) => (html.match(new RegExp('id="[^"]*-' + id + '">([\\s\\S]*?)</select>')) || [, ''])[1].match(/value="([^"]*)"/g).map((s) => s.slice(7, -1));
  const dateHtml = helpers.dateTimeFormatHtml([], 'o', 'L', {});
  const timeHtml = helpers.dateTimeFormatHtml([], 'o', 'T', {});
  check('date panel offers \'\' + DATFMT values', j(opts(dateHtml, 'datfmt')) === j([''].concat(KeywordSpec.validValues('DATFMT'))));
  check('date panel offers \'\' + DATSEP values', j(opts(dateHtml, 'datsep')) === j([''].concat(KeywordSpec.validValues('DATSEP'))));
  check('time panel offers \'\' + TIMFMT values', j(opts(timeHtml, 'timfmt')) === j([''].concat(KeywordSpec.validValues('TIMFMT'))));
  check('time panel offers \'\' + TIMSEP values', j(opts(timeHtml, 'timsep')) === j([''].concat(KeywordSpec.validValues('TIMSEP'))));
} else {
  check('webviewClientHelpers loads in node and exposes dateTimeFormatHtml', false);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

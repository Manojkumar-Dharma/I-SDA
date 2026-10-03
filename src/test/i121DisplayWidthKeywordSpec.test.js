/**
 * i121DisplayWidthKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", display-width slice.
 * dspfEngine.js kept three hand-written width tables: DATFMT_LENGTHS (the
 * "Field length" column of DATFMT's format table), EDTCDE_COMMAS and
 * EDTCDE_SIGN_WIDTH (the Commas / Sign columns of "Table 6. Summary chart for
 * IBM i edit codes"), plus a bare `return 8` for every time field and a
 * literal `'W' || 'Y'` for the date-edit codes. They are now facts on the
 * DATFMT / TIMFMT / EDTCDE entries in keywordSpec.js, read through
 * KeywordSpec accessors.
 *
 * Pure refactor: every value must equal the old literal, and the engine's
 * widths must not move.
 *
 * Run with: node src/test/i121DisplayWidthKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const { check, failureCount } = require('./helpers/harness');

const j = (a) => JSON.stringify(a);
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// The literals this slice removed from dspfEngine.js, kept here as the
// baseline the spec must reproduce word for word.
const OLD_DATFMT_LENGTHS = { '*ISO': 10, '*USA': 10, '*EUR': 10, '*JIS': 10, '*JOB': 10, '*MDY': 8, '*DMY': 8, '*YMD': 8, '*JUL': 6 };
const OLD_COMMAS = { 1: true, 2: true, A: true, B: true, J: true, K: true, N: true, O: true };
const OLD_SIGN_WIDTH = { 1: 0, 2: 0, 3: 0, 4: 0, A: 2, B: 2, C: 2, D: 2, J: 1, K: 1, L: 1, M: 1, N: 1, O: 1, P: 1, Q: 1, X: 0, Z: 0 };

console.log('\n=== 1. DATFMT lengths ===');
Object.keys(OLD_DATFMT_LENGTHS).forEach((f) => {
  check('DATFMT ' + f + ' -> ' + OLD_DATFMT_LENGTHS[f], KeywordSpec.datfmtDisplayLength(f) === OLD_DATFMT_LENGTHS[f]);
});
check('the spec table holds exactly the nine old entries', j(Object.keys(KeywordSpec.RECORD_TYPES.DATFMT.displayLengths).sort()) === j(Object.keys(OLD_DATFMT_LENGTHS).sort()));
check('lookup is case- and space-insensitive', KeywordSpec.datfmtDisplayLength(' *mdy ') === 8 && KeywordSpec.datfmtDisplayLength('*jul') === 6);
check('unknown / blank / null -> null (caller applies the default)', ['*NOPE', '', null, undefined, 'constructor', '__proto__'].every((v) => KeywordSpec.datfmtDisplayLength(v) === null));
check('the no-DATFMT default is *ISO, 10', KeywordSpec.RECORD_TYPES.DATFMT.defaultFormat === '*ISO' && KeywordSpec.datfmtDefaultDisplayLength() === 10);
check('every declared DATFMT value has a length (no value left without one)', KeywordSpec.validValues('DATFMT').every((v) => KeywordSpec.datfmtDisplayLength(v) != null));
check('*JOB reserves 10 although it resolves to a shorter format', KeywordSpec.datfmtDisplayLength('*JOB') === 10);
check('citation present', /Field length/.test(KeywordSpec.RECORD_TYPES.DATFMT.displayLengthDdsReference) && /\*ISO/.test(KeywordSpec.RECORD_TYPES.DATFMT.displayLengthDdsReference));

console.log('\n=== 2. TIMFMT length ===');
check('every time field is 8 positions', KeywordSpec.timfmtDisplayLength() === 8);
check('citation present', /8/.test(KeywordSpec.RECORD_TYPES.TIMFMT.displayLengthDdsReference));

console.log('\n=== 3. EDTCDE comma / sign / runtime-separator codes ===');
const ALL = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
check('comma codes equal the old EDTCDE_COMMAS for every character', ALL.every((c) => KeywordSpec.editCodeInsertsCommas(c) === !!OLD_COMMAS[c]));
check('sign widths equal the old EDTCDE_SIGN_WIDTH for every character', ALL.every((c) => KeywordSpec.editCodeSignWidth(c) === (OLD_SIGN_WIDTH[c] != null ? OLD_SIGN_WIDTH[c] : null)));
check('sign-width table holds exactly the eighteen old entries', j(Object.keys(KeywordSpec.RECORD_TYPES.EDTCDE.editCodeDisplay.signWidth).sort()) === j(Object.keys(OLD_SIGN_WIDTH).map(String).sort()));
check('CR codes A-D reserve 2; minus codes J-Q reserve 1; 1-4, X, Z reserve 0',
  'ABCD'.split('').every((c) => KeywordSpec.editCodeSignWidth(c) === 2)
  && 'JKLMNOPQ'.split('').every((c) => KeywordSpec.editCodeSignWidth(c) === 1)
  && '1234XZ'.split('').every((c) => KeywordSpec.editCodeSignWidth(c) === 0));
check('lowercase and padded codes resolve', KeywordSpec.editCodeSignWidth(' a ') === 2 && KeywordSpec.editCodeInsertsCommas('k') === true);
check('blank / null / unknown / inherited names are inert', ['', null, undefined, '5', 'constructor', '__proto__'].every((c) => KeywordSpec.editCodeSignWidth(c) === null && KeywordSpec.editCodeInsertsCommas(c) === false));
check('W and Y are the runtime-separator codes, nothing else', ALL.every((c) => KeywordSpec.isRuntimeSeparatorEditCode(c) === (c === 'W' || c === 'Y')));
check('W / Y carry no comma or sign entry (their width is not computed)', ['W', 'Y'].every((c) => !KeywordSpec.editCodeInsertsCommas(c) && KeywordSpec.editCodeSignWidth(c) === null));
check('every code the no-fill rule excludes or admits is a known IBM code', KeywordSpec.RECORD_TYPES.EDTCDE.noFillCodes.codes.every((c) => 'WXYZ'.indexOf(c) >= 0));
check('citation present', /Table 6/.test(KeywordSpec.RECORD_TYPES.EDTCDE.editCodeDisplay.ddsReference));

console.log('\n=== 4. engine widths unchanged ===');
const num = (len, dec, kws, dataType) => ({ length: len, decimalPositions: dec, dataType: dataType || 'S', keywords: kws || [] });
const w = (f) => DspfEngine.displayLength(f, {}, {});
// IBM's own EDTCDE worked examples (see the engine's comment).
check('PRICE 5,2 EDTCDE(J) -> 7', w(num(5, 2, [{ name: 'EDTCDE', parameters: 'J' }])) === 7);
check('SALES 7,2 EDTCDE(K $) -> 11', w(num(7, 2, [{ name: 'EDTCDE', parameters: 'K $' }])) === 11);
check('SALARY 8,2 EDTCDE(1 *) -> 10', w(num(8, 2, [{ name: 'EDTCDE', parameters: '1 *' }])) === 10);
check('EDTCDE(A) 6,0: one comma + CR (2) -> 9', w(num(6, 0, [{ name: 'EDTCDE', parameters: 'A' }])) === 9);
check('EDTCDE(3) 6,0 adds nothing: 6', w(num(6, 0, [{ name: 'EDTCDE', parameters: '3' }])) === 6);
check('EDTCDE(Z) 6,2 only the point: 7', w(num(6, 2, [{ name: 'EDTCDE', parameters: 'Z' }])) === 7);
// Task I-154: IBM's EDTCDE table (notes 2 and 3) fixes how many slashes W and Y
// insert for each digit count (only the separator CHARACTER is a run-time job
// attribute), so the width is exact: W 6 digits -> nnnn/nn = 7, Y 8 digits ->
// nn/nn/nnnn = 10. A digit count IBM gives no pattern for, or a field with
// decimals, keeps its coded length.
check('EDTCDE(W) 6 digits -> nnnn/nn = 7, EDTCDE(Y) 8 digits -> nn/nn/nnnn = 10', w(num(6, 0, [{ name: 'EDTCDE', parameters: 'W' }])) === 7 && w(num(8, 0, [{ name: 'EDTCDE', parameters: 'y' }])) === 10);
check('EDTCDE(Y) / (W) with a digit count IBM lists no pattern for keep the coded length', w(num(9, 0, [{ name: 'EDTCDE', parameters: 'Y' }])) === 9 && w(num(4, 0, [{ name: 'EDTCDE', parameters: 'W' }])) === 4 && w(num(6, 2, [{ name: 'EDTCDE', parameters: 'Y' }])) === 6);
check('EDTCDE(5) user-defined adds nothing but decimals', w(num(6, 2, [{ name: 'EDTCDE', parameters: '5' }])) === 7);
check('lowercase edit code still resolves', w(num(5, 2, [{ name: 'EDTCDE', parameters: 'j' }])) === 7);
check('comma grouping tracks integer digits: 10,0 EDTCDE(2) -> 13', w(num(10, 0, [{ name: 'EDTCDE', parameters: '2' }])) === 13);
check('no commas at 3 integer digits: 3,0 EDTCDE(1) -> 3', w(num(3, 0, [{ name: 'EDTCDE', parameters: '1' }])) === 3);
const dat = (kws) => ({ length: 10, decimalPositions: 0, dataType: 'L', keywords: kws || [] });
check('date field, no DATFMT -> 10', w(dat()) === 10);
check('date field per format', Object.keys(OLD_DATFMT_LENGTHS).every((f) => w(dat([{ name: 'DATFMT', parameters: f }])) === OLD_DATFMT_LENGTHS[f]));
check('date field, lowercase / padded DATFMT parameter', w(dat([{ name: 'DATFMT', parameters: ' *jul ' }])) === 6);
check('date field, unrecognised DATFMT falls back to the *ISO default', w(dat([{ name: 'DATFMT', parameters: '*BOGUS' }])) === 10);
check('time field -> 8 with or without TIMFMT', w({ length: 8, dataType: 'T', keywords: [] }) === 8 && w({ length: 8, dataType: 'T', keywords: [{ name: 'TIMFMT', parameters: '*USA' }] }) === 8);

console.log('\n=== 5. engine keeps no private copy ===');
const eng = src('dspfEngine.js');
check('DATFMT_LENGTHS literal gone', !/\bDATFMT_LENGTHS\b\s*=/.test(eng) && !/DATFMT_LENGTHS\[/.test(eng));
check('EDTCDE_COMMAS / EDTCDE_SIGN_WIDTH literals gone', !/\bEDTCDE_COMMAS\b\s*=/.test(eng) && !/\bEDTCDE_SIGN_WIDTH\b\s*=/.test(eng) && !/EDTCDE_(COMMAS|SIGN_WIDTH)\[/.test(eng));
check('the engine reads the spec accessors', /KeywordSpec\.datfmtDisplayLength/.test(eng) && /KeywordSpec\.timfmtDisplayLength/.test(eng) && /KeywordSpec\.editCodeInsertsCommas/.test(eng) && /KeywordSpec\.editCodeSignWidth/.test(eng) && /KeywordSpec\.isRuntimeSeparatorEditCode/.test(eng));
check('no other module keeps a copy of the width tables', ['dspfWriter.js', 'webviewClientHelpers.js', 'buildWebviewTemplate.js', 'buildMenuWebviewTemplate.js'].every((f) => !/var (DATFMT_LENGTHS|EDTCDE_COMMAS|EDTCDE_SIGN_WIDTH)\b/.test(src(f))));

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

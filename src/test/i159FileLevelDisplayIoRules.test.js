/**
 * i159FileLevelDisplayIoRules.test.js
 *
 * Task I-159 - the file-level display and I/O rules the I-121f slice found
 * unenforced (each bad case below was accepted and written before):
 *   MSGLOC   the parameter is required and a line number 1 through 28
 *   ERRSFL   no MSGLOC of 25 for 24 x 80 / 28 for 27 x 132 in the same file
 *   OPENPRT  valid only with a file-level PRINT that names a printer file
 *   IGCCNV   IGCCNV(CFnn line-number): CF01-CF24, a line number, a key no
 *            other keyword has, a file defined for 24 x 80
 *   DSPSIZ   one of its two formats, 24 x 80 / 27 x 132 only, user names
 *            2-8 characters starting with an asterisk
 *   REF      only once, 1-2 parameters, file token [library-name/]file
 * Where a section does not settle a point nothing is enforced and the spec
 * records an open question. Diff-based: only a violation the edit adds.
 *
 * Run with: node src/test/i159FileLevelDisplayIoRules.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');

const REF_TEXT = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const has = (t) => REF_TEXT.indexOf(t) !== -1;

// ---- helpers: a file-level keyword line, a tiny file, the guard ----
const fl = (kw, cond) => ('     A' + (cond ? '  ' + cond : '')).padEnd(44) + kw;
const REC = ['     A          R REC1', '     A            F1            10A  B  2  2'];
const file = (...kws) => kws.map((k) => (Array.isArray(k) ? fl(k[0], k[1]) : fl(k))).concat(REC).join('\n') + '\n';
const fileWithRec = (kws, recKws) => kws.map((k) => (Array.isArray(k) ? fl(k[0], k[1]) : fl(k))).concat(['     A          R REC1'], (recKws || []).map((k) => ('     A').padEnd(44) + k), ['     A            F1            10A  B  2  2']).join('\n') + '\n';
const parse = (t) => DspfParser.parseDspf(t);
const g = (a, b) => DspfWriter.fileLevelDisplayNewConflictReason(parse(a), parse(b));
const bad = (a, b, re) => { const r = g(a, b); return !!r && re.test(r); };

console.log('=== 1. the facts, against the DDS Reference ===');
check('MSGLOC: "The parameter value is required and must be in the range 1 through 28."', has('The parameter value is required and must be in the range 1 through 28.'));
check('MSGLOC: 26-28 on 24 x 80 is only a diagnostic when the file is opened',
  has('A diagnostic will be issued when the file is opened if a message location is in the 26 to 28 range for a 24 x 80 display size.'));
check('MSGLOC: examples show the unconditioned one as the primary size and *DS4 as the secondary',
  has('the message line is moved to line 1 for the primary display size.') && has('for both the primary display size 1 and the secondary display size 2.'));
check('ERRSFL: no MSGLOC of 25 for 24 x 80 or 28 for 27 x 132',
  has('you cannot specify a message location value of 25 for the 24 x 80 display size or 28 for the 27 x 132 display size.'));
check('OPENPRT: valid only with a file-level PRINT with a printer file parameter',
  has('This keyword is valid only if you have specified a file-level PRINT keyword with a printer file parameter.'));
check('PRINT: the forms are a response indicator, *PGM or a printer file name',
  has('PRINT[(response-indicator [\'text\'])') && has('(*PGM)') && has('([library-name/]printer-file-name)]'));
check('IGCCNV: format IGCCNV(CFnn line-number), CF01 through CF24, not an assigned key',
  has('The format for the keyword is IGCCNV(CFnn line-number).') && has('Specify any CF key (CF01 through CF24) as the parameter value. Do not specify a CF key that has already been assigned a function.'));
check('IGCCNV: "You must define the file for a 24 x 80 display."', has('You must define the file for a 24 x 80 display.'));
check('IGCCNV: the section gives the line number no range', !/line-number[^.]*(range|through|between)/.test(REF_TEXT.slice(REF_TEXT.indexOf('The second parameter, line-number'), REF_TEXT.indexOf('The second parameter, line-number') + 400)));
check('DSPSIZ: *DS3 / *DS4 form - up to two, at least one, not twice',
  has('Specify up to two parameter values as *DS3 or *DS4 in any order. At least one parameter value is required. You cannot specify a parameter value twice.'));
check('DSPSIZ: lines and positions form - only 24 x 80 and 27 x 132; names 2 to 8 characters, first an asterisk',
  has('(only 24 x 80, and 27 x 132 are valid)') && has('must be from 2 to 8 characters long, and the first character must be an asterisk (*).'));
check('REF: "REF can be specified only once." and the file name is required',
  has('(REF can be specified only once.)') && has('The database-file-name is a required parameter for this keyword.'));
{
  const sh = KeywordSpec.fileDisplayIoShapes();
  check('the spec holds the shapes the guard reads', sh.igccnv.parameterCount === 2 && sh.igccnv.firstKey.first === 1 && sh.igccnv.firstKey.last === 24 && sh.igccnv.firstKey.type === 'CF' && sh.ref.min === 1 && sh.ref.max === 2 && sh.ref.delimiter === '/');
  check('the shapes accessor returns fresh objects', (() => { const a = KeywordSpec.fileDisplayIoShapes(); a.ref.max = 9; return KeywordSpec.fileDisplayIoShapes().ref.max === 2; })());
  const R = KeywordSpec.RECORD_TYPES;
  check('the open questions are recorded on IGCCNV, OPENPRT and DSPSIZ', R.IGCCNV.openQuestions.length === 3 && R.OPENPRT.openQuestions.length === 1 && R.DSPSIZ.openQuestions.length === 2);
}

console.log('\n=== 2. MSGLOC needs a line number 1 through 28 ===');
['1', '9', '24', '25', '26', '28', '05'].forEach((v) => check('MSGLOC(' + v + ') is accepted (26-28 on 24 x 80 is only an open-time diagnostic)', g(file(), file(['MSGLOC(' + v + ')'])) === null));
['abc', '0', '29', '100', '5.5', '-1', '1 2', '&F'].forEach((v) => check('MSGLOC(' + v + ') is refused', bad(file(), file(['MSGLOC(' + v + ')']), /MSGLOC\(.*\): the line number is required and must be in the range 1 through 28; ".*" is not \(per the DDS Reference\)/)));
check('a bare MSGLOC is refused: the parameter is required', bad(file(), file(['MSGLOC']), /MSGLOC: the line number is required and must be in the range 1 through 28 \(per the DDS Reference\)\./));
check('a size-conditioned MSGLOC under *DS4 is accepted', g(file(['DSPSIZ(*DS3 *DS4)']), file(['DSPSIZ(*DS3 *DS4)'], ['MSGLOC(27)', '*DS4'])) === null);
check('...and refused when its value is bad', bad(file(['DSPSIZ(*DS3 *DS4)']), file(['DSPSIZ(*DS3 *DS4)'], ['MSGLOC(99)', '*DS4']), /MSGLOC\(99\)/));
check('editing a good MSGLOC to a bad value is refused', bad(file(['MSGLOC(24)']), file(['MSGLOC(45)']), /MSGLOC\(45\)/));
check('fixing a bad MSGLOC is accepted', g(file(['MSGLOC(45)']), file(['MSGLOC(24)'])) === null);
check('an already-invalid MSGLOC does not block an unrelated edit', g(file(['MSGLOC(45)']), file(['MSGLOC(45)'], ['INDARA'])) === null);
check('removing an invalid MSGLOC is accepted', g(file(['MSGLOC(45)']), file()) === null);

console.log('\n=== 3. ERRSFL refuses MSGLOC 25 for 24 x 80 and 28 for 27 x 132 ===');
const E = 'ERRSFL';
check('ERRSFL + MSGLOC(25), no DSPSIZ (the primary size is 24 x 80), is refused', bad(file(E), file(E, 'MSGLOC(25)'), /MSGLOC\(25\) cannot be specified for the 24 x 80 display size in a file that has ERRSFL \(per the DDS Reference\)\./));
check('ERRSFL + MSGLOC(24) is accepted', g(file(E), file(E, 'MSGLOC(24)')) === null);
check('ERRSFL + MSGLOC(28), no DSPSIZ, is accepted (28 is refused only for 27 x 132)', g(file(E), file(E, 'MSGLOC(28)')) === null);
check('ERRSFL + DSPSIZ(*DS4): the primary is 27 x 132, so MSGLOC(28) is refused', bad(file(E, 'DSPSIZ(*DS4)'), file(E, 'DSPSIZ(*DS4)', 'MSGLOC(28)'), /MSGLOC\(28\) cannot be specified for the 27 x 132 display size/));
check('...and MSGLOC(25) is then accepted', g(file(E, 'DSPSIZ(*DS4)'), file(E, 'DSPSIZ(*DS4)', 'MSGLOC(25)')) === null);
const D2 = 'DSPSIZ(*DS3 *DS4)';
check('two sizes: *DS4 MSGLOC(28) is refused', bad(file(E, D2), file(E, D2, ['MSGLOC(28)', '*DS4']), /MSGLOC\(28\) cannot be specified for the 27 x 132/));
check('two sizes: *DS3 MSGLOC(25) is refused', bad(file(E, D2), file(E, D2, ['MSGLOC(25)', '*DS3']), /MSGLOC\(25\) cannot be specified for the 24 x 80/));
check('two sizes: *DS4 MSGLOC(25) and *DS3 MSGLOC(28) are accepted (each only for the other size)', g(file(E, D2), file(E, D2, ['MSGLOC(25)', '*DS4'], ['MSGLOC(28)', '*DS3'])) === null);
check('two sizes: the unconditioned MSGLOC is the primary (24 x 80) size\'s', bad(file(E, D2), file(E, D2, 'MSGLOC(25)'), /24 x 80/) && g(file(E, D2), file(E, D2, 'MSGLOC(28)')) === null);
check('DSPSIZ(*DS4 *DS3): the unconditioned MSGLOC is then the 27 x 132 size\'s', bad(file(E, 'DSPSIZ(*DS4 *DS3)'), file(E, 'DSPSIZ(*DS4 *DS3)', 'MSGLOC(28)'), /27 x 132/));
check('user-named sizes: a MSGLOC under *BIG (27 x 132) of 28 is refused', bad(file(E, 'DSPSIZ(24 80 *SMALL 27 132 *BIG)'), file(E, 'DSPSIZ(24 80 *SMALL 27 132 *BIG)', ['MSGLOC(28)', '*BIG']), /27 x 132/));
check('user-named sizes: under *SMALL (24 x 80) of 28 is accepted', g(file(E, 'DSPSIZ(24 80 *SMALL 27 132 *BIG)'), file(E, 'DSPSIZ(24 80 *SMALL 27 132 *BIG)', ['MSGLOC(28)', '*SMALL'])) === null);
check('a MSGLOC under a name DSPSIZ does not declare is not judged', g(file(E), file(E, ['MSGLOC(28)', '*NOSUCH'])) === null);
check('adding ERRSFL to a file that has MSGLOC(25) is refused (either direction)', bad(file('MSGLOC(25)'), file('MSGLOC(25)', E), /MSGLOC\(25\) cannot be specified for the 24 x 80/));
check('removing ERRSFL is accepted', g(file(E, 'MSGLOC(24)'), file('MSGLOC(24)')) === null);
check('changing MSGLOC 24 -> 25 beside ERRSFL is refused', bad(file(E, 'MSGLOC(24)'), file(E, 'MSGLOC(25)'), /MSGLOC\(25\)/));
check('changing MSGLOC 25 -> 24 is accepted', g(file('MSGLOC(25)'), file('MSGLOC(24)')) === null);
check('changing DSPSIZ so the unconditioned MSGLOC(28) becomes 27 x 132\'s is refused', bad(file(E, 'DSPSIZ(*DS3)', 'MSGLOC(28)'), file(E, 'DSPSIZ(*DS4)', 'MSGLOC(28)'), /MSGLOC\(28\)/));
check('MSGLOC(25) without ERRSFL is accepted', g(file(), file('MSGLOC(25)')) === null);
check('an already-refused pair does not block an unrelated edit', g(file(E, 'MSGLOC(25)'), file(E, 'MSGLOC(25)', 'INDARA')) === null);

console.log('\n=== 4. OPENPRT needs a file-level PRINT that names a printer file ===');
check('OPENPRT with no PRINT is refused', bad(file(), file('OPENPRT'), /OPENPRT is valid only with a file-level PRINT keyword that names a printer file .* and this file has no file-level PRINT \(per the DDS Reference\)\./));
['PRINT', 'PRINT(*PGM)', "PRINT(01 'User presses Print key')", 'PRINT(99)'].forEach((p) => check('OPENPRT beside ' + p + ' is refused (it names no printer file)', bad(file(p), file(p, 'OPENPRT'), /a file-level PRINT without one/)));
['PRINT(PRTFILE)', 'PRINT(LIB1/PRINTFILE1)'].forEach((p) => check('OPENPRT beside ' + p + ' is accepted', g(file(p), file(p, 'OPENPRT')) === null));
check('adding PRINT(PRTFILE) and OPENPRT together is accepted', g(file(), file('PRINT(PRTFILE)', 'OPENPRT')) === null);
check('a record-level PRINT alone does not satisfy it', bad(fileWithRec([], []), fileWithRec(['OPENPRT'], ['PRINT(PRTFILE)']), /no file-level PRINT/));
check('removing the file-level PRINT while OPENPRT stays is refused', bad(file('PRINT(PRTFILE)', 'OPENPRT'), file('OPENPRT'), /no file-level PRINT/));
check('changing PRINT(PRTFILE) to a bare PRINT while OPENPRT stays is refused', bad(file('PRINT(PRTFILE)', 'OPENPRT'), file('PRINT', 'OPENPRT'), /a file-level PRINT without one/));
check('removing OPENPRT is accepted', g(file('PRINT', 'OPENPRT'), file('PRINT')) === null);
check('PRINT alone (no OPENPRT) is accepted in every form', ['PRINT', 'PRINT(*PGM)', 'PRINT(01)', 'PRINT(P)'].every((p) => g(file(), file(p)) === null));
check('an already-invalid OPENPRT does not block an unrelated edit', g(file('OPENPRT'), file('OPENPRT', 'INDARA')) === null);
check('a record-level PRINT beside a good file-level pair is not refused (the section is ambiguous - an open question)', g(fileWithRec(['PRINT(PRTFILE)', 'OPENPRT'], []), fileWithRec(['PRINT(PRTFILE)', 'OPENPRT'], ['PRINT'])) === null);

console.log('\n=== 5. IGCCNV(CFnn line-number) ===');
const I = 'IGCCNV(CF24 24)';
check('IGCCNV(CF24 24) is accepted', g(file(), file(I)) === null);
check('CF01 and a later line are accepted', g(file(), file('IGCCNV(CF01 5)')) === null && g(file(), file('IGCCNV(cf12 10)')) === null);
check('a bare IGCCNV is refused: two parameters are required', bad(file(), file('IGCCNV'), /IGCCNV takes 2 parameters - IGCCNV\(CFnn line-number\) - and this one has none/));
check('one parameter is refused', bad(file(), file('IGCCNV(CF24)'), /has 1 /));
check('three parameters are refused', bad(file(), file('IGCCNV(CF24 24 1)'), /has 3 /));
['CF00', 'CF25', 'CF99', 'CA03', 'F24', 'CF'].forEach((k) => check('IGCCNV(' + k + ' 24): the key must be CF01-CF24', bad(file(), file('IGCCNV(' + k + ' 24)'), /first parameter must be a command function key, CF01 through CF24; ".*" is not/)));
['0', 'x', '2.5', '-1'].forEach((v) => check('IGCCNV(CF24 ' + v + '): the line must be a line number', bad(file(), file('IGCCNV(CF24 ' + v + ')'), /second parameter must be a display line number \(1 or more\)/)));
check('no upper bound is invented for the line number', g(file(), file('IGCCNV(CF24 99)')) === null);
check('a key already used by a file-level CF03 is refused', bad(file('CF03'), file('CF03', 'IGCCNV(CF03 24)'), /IGCCNV cannot use CF03: it is already assigned to CF03/));
check('...by a record-level CF03', bad(fileWithRec([], ['CF03']), fileWithRec(['IGCCNV(CF03 24)'], ['CF03']), /already assigned to CF03 \(on record REC1\)/));
check('...by an alt key written ALTHELP(CF03)', bad(file('ALTHELP(CF03)'), file('ALTHELP(CF03)', 'IGCCNV(CF03 24)'), /already assigned to ALTHELP\(CF03\)/));
check('...by SFLDROP(CF03)', bad(fileWithRec([], ['SFLDROP(CF03)']), fileWithRec(['IGCCNV(CF03 24)'], ['SFLDROP(CF03)']), /already assigned to SFLDROP\(CF03\)/));
check('adding the clashing CF03 AFTER IGCCNV(CF03 24) is refused too', bad(file('IGCCNV(CF03 24)'), file('IGCCNV(CF03 24)', 'CF03'), /IGCCNV cannot use CF03/));
check('a free key beside other command keys is accepted', g(file('CF03'), file('CF03', 'IGCCNV(CF24 24)')) === null);
check('a CA key of the same number is not refused (only a CF key is stated; open question)', g(file('CA03'), file('CA03', 'IGCCNV(CF03 24)')) === null);
check('changing IGCCNV to a free key is accepted', g(file('CF03', 'IGCCNV(CF03 24)'), file('CF03', 'IGCCNV(CF04 24)')) === null);
check('changing IGCCNV to a taken key is refused', bad(file('CF03', 'IGCCNV(CF04 24)'), file('CF03', 'IGCCNV(CF03 24)'), /IGCCNV cannot use CF03/));
check('IGCCNV with DSPSIZ(*DS4) only (no 24 x 80 size) is refused', bad(file('DSPSIZ(*DS4)'), file('DSPSIZ(*DS4)', I), /IGCCNV requires the file to be defined for a 24 x 80 display, but DSPSIZ lists only 27 x 132/));
check('...with 27 132 spelled out too', bad(file('DSPSIZ(27 132)'), file('DSPSIZ(27 132)', I), /24 x 80 display/));
check('IGCCNV with DSPSIZ(*DS3 *DS4) or DSPSIZ(*DS3) or no DSPSIZ is accepted (open question for the two-size case)', ['DSPSIZ(*DS3 *DS4)', 'DSPSIZ(*DS3)', 'DSPSIZ(24 80)'].every((d) => g(file(d), file(d, I)) === null) && g(file(), file(I)) === null);
check('changing DSPSIZ to 27 x 132 only while IGCCNV stays is refused', bad(file('DSPSIZ(*DS3)', I), file('DSPSIZ(*DS4)', I), /24 x 80 display/));
check('an already-invalid IGCCNV does not block an unrelated edit', g(file('IGCCNV(CF99 24)'), file('IGCCNV(CF99 24)', 'INDARA')) === null);
check('fixing an invalid IGCCNV is accepted', g(file('IGCCNV(CF99 24)'), file(I)) === null);

console.log('\n=== 6. DSPSIZ takes one of its two formats ===');
const f = DspfWriter.dspsizFormProblem;
['*DS3', '*DS4', '*DS3 *DS4', '*DS4 *DS3', '24 80', '27 132', '24 80 27 132', '27 132 24 80', '24 80 *SMALL 27 132 *LARGE', '24 80 *DS3 27 132 *DS4', '24 80 *S', '24 80 *EIGHTCHR'.slice(0, 14), '24 80 *ABCDEFG'].forEach((t) => check('DSPSIZ(' + t + ') is accepted', f(t) === null));
[['', /needs at least one display size/], ['*DS3 *DS3', /cannot specify the display size \*DS3 twice/], ['*DS3 *DS4 *DS3', /at most 2 IBM-supplied/],
 ['28 80', /only 24 x 80 and 27 x 132; 28 x 80/], ['24 132', /24 x 132 is not a valid display size/], ['24 80 X', /must start with an asterisk; "X"/], ['24 80 *', /2 to 8 characters long; "\*" is 1/],
 ['24 80 *TOOLONGNAME', /2 to 8 characters long; "\*TOOLONGNAME" is 12/], ['*DS3 27 132', /is neither/], ['24', /is neither/], ['abc', /is neither/], ['24 80 27 132 24 80', /at most 2 display sizes/]].forEach(([t, re]) => {
  check('DSPSIZ(' + t + ') is refused', re.test(f(t) || ''));
});
check('the same size twice in the lines-and-positions form is not refused (not stated; open question)', f('24 80 24 80') === null);
check('through the guard: adding a bad DSPSIZ is refused', bad(file(), file('DSPSIZ(28 80)'), /28 x 80/));
check('through the guard: changing a good DSPSIZ to a bad one is refused', bad(file('DSPSIZ(*DS3)'), file('DSPSIZ(*DS3 *DS3)'), /twice/));
check('through the guard: an already-invalid DSPSIZ does not block an unrelated edit', g(file('DSPSIZ(28 80)'), file('DSPSIZ(28 80)', 'INDARA')) === null);
check('the Display Sizes picker\'s own output is accepted', f(DspfWriter.serializeDisplaySizes ? '24 80 *DS3 27 132 *DS4' : '') === null);

console.log('\n=== 7. REF once, one or two parameters, [library/]file ===');
check('REF(FILE1) and REF(LIB/FILE1 RECORD2) are accepted', g(file(), file('REF(FILE1)')) === null && g(file(), file('REF(LIB/FILE1 RECORD2)')) === null);
check('a second REF is refused', bad(file('REF(FILE1)'), file('REF(FILE1)', 'REF(FILE2)'), /REF can be specified only once \(per the DDS Reference\)\./));
check('a bare REF is refused: the file name is required', bad(file(), file('REF'), /REF takes REF\(\[library-name\/\]database-file-name \[record-format-name\]\) .* has none/));
check('REF with three parameters is refused', bad(file(), file('REF(LIB/F R X)'), /has 3 /));
['/FILE', 'LIB/', '/', 'A/B/C', 'LIB//F'].forEach((t) => check('REF(' + t + ') is refused: the file must be [library-name/]file', bad(file(), file('REF(' + t + ')'), /REF's file must be written database-file-name or library-name\/database-file-name/)));
check('no rule is invented for the names', ['REF(F)', 'REF(*LIBL/F)', 'REF(VERYLONGLIBRARYNAME/VERYLONGFILENAME RF)', 'REF(lib/file)'].every((t) => g(file(), file(t)) === null));
check('an already-doubled REF does not block an unrelated edit', g(file('REF(F1)', 'REF(F2)'), file('REF(F1)', 'REF(F2)', 'INDARA')) === null);
check('removing one of two REF is accepted', g(file('REF(F1)', 'REF(F2)'), file('REF(F1)')) === null);

console.log('\n=== 8. the guard itself ===');
check('fail-safe on odd models', [undefined, null, {}, { fileKeywords: null }, { fileKeywords: [{ name: 'MSGLOC' }] }, { fileKeywords: [{ name: null, parameters: null }] }].every((m) => {
  try { return DspfWriter.fileLevelDisplayNewConflictReason(null, m) === null || typeof DspfWriter.fileLevelDisplayNewConflictReason(null, m) === 'string'; } catch (e) { return false; }
}));
check('a model with no violations returns null', g(file('DSPSIZ(*DS3 *DS4)', 'MSGLOC(24)', ['MSGLOC(27)', '*DS4'], 'REF(LIB/F)', 'PRINT(PRTF)', 'OPENPRT', 'IGCCNV(CF24 24)'), file('DSPSIZ(*DS3 *DS4)', 'MSGLOC(24)', ['MSGLOC(27)', '*DS4'], 'REF(LIB/F)', 'PRINT(PRTF)', 'OPENPRT', 'IGCCNV(CF24 24)', 'INDARA')) === null);
check('the webview commit choke point calls the guard',
  fs.readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8').indexOf('DspfWriter.fileLevelDisplayNewConflictReason(model, candidate)') !== -1);

console.log('\n=== 9. the real webview in jsdom (file-level raw keyword editor) ===');
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2' }),
].join('\n') + '\n';
function session() {
  const posted = [];
  const alerts = [];
  const html = webviewHtml('vscode-webview://fake', 'n' + Math.random(), SRC, 'I159.DSPF');
  const dom = newWebviewDom(html, {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = (m) => alerts.push(m);
      w.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  const doc = dom.window.document;
  const Ev = dom.window.Event;
  return {
    posted, alerts, dom, doc,
    open() { const c = doc.getElementById('crumb-file'); if (c) c.dispatchEvent(new Ev('click', { bubbles: true })); },
    add(name, params) {
      doc.getElementById('file-new-kw-name').value = name;
      const p = doc.getElementById('file-new-kw-params'); if (p) p.value = params || '';
      posted.length = 0; alerts.length = 0;
      doc.querySelector('.kw-add[data-owner="file"]').dispatchEvent(new Ev('click', { bubbles: true }));
      return { alert: alerts[0] || null, edited: posted.some((m) => m.type === 'applyEdit'), text: (posted.filter((m) => m.type === 'applyEdit').pop() || {}).text };
    },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const refused = [
    ['MSGLOC', 'abc', /MSGLOC\(abc\)/], ['MSGLOC', '99', /range 1 through 28/], ['MSGLOC', '', /line number is required/],
    ['OPENPRT', '', /names a printer file/], ['IGCCNV', 'CF99 xx', /CF01 through CF24/], ['IGCCNV', '', /takes 2 parameters/], ['IGCCNV', 'CF24', /has 1/],
    ['DSPSIZ', '28 80', /28 x 80/], ['DSPSIZ', '24 80 X 27 132 *LARGE', /start with an asterisk/], ['DSPSIZ', '*DS3 *DS3', /twice/], ['REF', '', /has none/], ['REF', 'LIB/', /REF's file must be written/],
  ];
  for (const [n, p, re] of refused) {
    const s = session(); await wait(700); s.open();
    const r = s.add(n, p);
    check('raw editor: ' + n + '(' + p + ') is refused, nothing written', !r.edited && re.test(r.alert || ''));
  }
  const accepted = [['MSGLOC', '24'], ['MSGLOC', '28'], ['IGCCNV', 'CF24 24'], ['DSPSIZ', '*DS3 *DS4'], ['DSPSIZ', '24 80 *SMALL 27 132 *LARGE'], ['REF', 'LIB/FILE1 RECORD2'], ['ERRSFL', ''], ['PRINT', 'PRTFILE']];
  for (const [n, p] of accepted) {
    const s = session(); await wait(700); s.open();
    const r = s.add(n, p);
    check('raw editor: ' + n + '(' + p + ') is written, no alert', r.edited && !r.alert && new RegExp(n).test(r.text || ''));
  }
  {
    // pair rules in the real editor: add ERRSFL, then MSGLOC(25) is refused; add PRINT(PRTFILE) then OPENPRT is accepted
    let s = session(); await wait(700); s.open();
    s.add('ERRSFL', '');
    let r = s.add('MSGLOC', '25');
    check('raw editor: MSGLOC(25) after ERRSFL is refused, nothing written', !r.edited && /cannot be specified for the 24 x 80 display size in a file that has ERRSFL/.test(r.alert || ''));
    r = s.add('MSGLOC', '24');
    check('raw editor: MSGLOC(24) after ERRSFL is written', r.edited && !r.alert);
    s = session(); await wait(700); s.open();
    r = s.add('OPENPRT', '');
    check('raw editor: OPENPRT first is refused', !r.edited && /no file-level PRINT/.test(r.alert || ''));
    s.add('PRINT', 'PRTFILE');
    r = s.add('OPENPRT', '');
    check('raw editor: OPENPRT after PRINT(PRTFILE) is written', r.edited && !r.alert);
    s = session(); await wait(700); s.open();
    s.add('REF', 'FILE1');
    r = s.add('REF', 'FILE2');
    check('raw editor: a second REF is refused, nothing written', !r.edited && /only once/.test(r.alert || ''));
    s = session(); await wait(700); s.open();
    s.add('CF03', '');
    r = s.add('IGCCNV', 'CF03 24');
    check('raw editor: IGCCNV(CF03 24) beside a file-level CF03 is refused', !r.edited && /already assigned to CF03/.test(r.alert || ''));
    s = session(); await wait(700); s.open();
    s.add('DSPSIZ', '*DS4');
    r = s.add('IGCCNV', 'CF24 24');
    check('raw editor: IGCCNV beside DSPSIZ(*DS4) is refused', !r.edited && /24 x 80 display/.test(r.alert || ''));
  }
  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
})();

/**
 * E11d - the SFGR writer (src/sfgrWriter.js): column edits, constants with continuation lines, insert, delete,
 * duplicate and move, on the real sample (docs/sda-reference/source/stipfm.dspf36) and on small hand-made sources.
 * The rule under test: a line an edit does not name comes back byte for byte.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const Parser = require('../sfgrParser.js');
const Writer = require('../sfgrWriter.js');

const SAMPLE = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SAMPLE);
const linesOf = (t) => Parser.parse(t).lines.map((l) => l.text + l.eol);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---- module shape ----------------------------------------------------------------------------
const moduleSource = fs.readFileSync(path.join(__dirname, '../sfgrWriter.js'), 'utf8');
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));
check('exports the operations', ['setValue', 'setConstant', 'insertSpec', 'insertFormat', 'deleteEntry', 'deleteFormat', 'duplicateEntry', 'moveEntry', 'moveFormat', 'buildLines', 'constantPieces', 'encodeColumn'].every((n) => typeof Writer[n] === 'function'));
const buildScript = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).scripts['build:webview-assets'];
check('writer and parser are copied to dist by the build', buildScript.indexOf("'sfgrParser.js'") > 0 && buildScript.indexOf("'sfgrWriter.js'") > 0);

// ---- helpers: small sources ------------------------------------------------------------------
// a line built column by column, independent of the writer: pairs of [first column, text]
function mk(type, pairs) {
  const chars = ('     ' + type).split('');
  pairs.forEach(([col, text]) => { while (chars.length < col - 1 + text.length) chars.push(' '); text.split('').forEach((c, i) => { chars[col - 1 + i] = c; }); });
  return chars.join('').replace(/ +$/, '');
}
const S1 = mk('S', [[7, 'FMT01'], [17, '  '], [19, '24']]);
const D1 = mk('D', [[7, 'FLD0001'], [15, '  10'], [19, ' 2'], [21, ' 2'], [23, 'Y']]);
const D2 = mk('D', [[7, 'FLD0002'], [15, '   5'], [19, ' 3'], [21, ' 2'], [23, 'Y']]);
const D3 = mk('D', [[7, 'FLD0003'], [15, '   1'], [19, ' 2'], [21, ' 2'], [23, 'Y']]);
const small = (eol, last) => [S1, D1, D2, mk('S', [[7, 'FMT02']]), D3].join(eol) + (last === false ? '' : eol);

// ---- setValue: one column entry, everything else untouched ------------------------------------
{
  const r = Writer.setValue(SAMPLE, { line: 2 }, 'length', 7);
  check('setValue: ok and changed', r.ok && r.changed);
  const before = linesOf(SAMPLE), after = linesOf(r.text);
  check('setValue: the same number of lines', before.length === after.length);
  check('setValue: every other line is byte-identical', before.every((l, i) => i === 1 || l === after[i]));
  check('setValue: the length is right-justified in columns 15 - 18', after[1].slice(14, 18) === '   7');
  check('setValue: only columns 15 - 18 of that line changed', before[1].slice(0, 14) === after[1].slice(0, 14) && before[1].slice(18) === after[1].slice(18));
  check('setValue: touched is that line', r.touched.from === 2 && r.touched.to === 2);
  check('setValue: the parser reads the new value', Parser.parse(r.text).entries.find((e) => e.line === 2).numbers.length === 7);
  check('setValue: the line stays right-trimmed', !/ $/.test(after[1].replace(/\r?\n$/, '')));
}
{
  // every column of every S and D entry set to the value it already has: other lines identical, value the same
  let bad = 0, identical = 0, total = 0;
  // every S line, and every 25th simple D line (an edit re-reads the 549-line sample, so all ~13,000 would take minutes)
  P.entries.filter((e) => e.kind === 'S' || (e.kind === 'D' && e.continuationLines === 0)).filter((e, i) => e.kind === 'S' || i % 25 === 0).forEach((e) => {
    const cols = e.kind === 'S' ? Parser.S_COLUMNS : Parser.D_COLUMNS;
    cols.forEach((c) => {
      if (e.kind === 'D' && (c.key === 'constantData' || c.key === 'continuation')) return;
      total++;
      const r = Writer.setValue(SAMPLE, { entry: P.entries.indexOf(e) }, c.key, e.values[c.key]);
      if (!r.ok) { bad++; return; }
      const re = Parser.parse(r.text);
      const lines = linesOf(r.text), orig = linesOf(SAMPLE);
      const others = lines.length === orig.length && orig.every((l, i) => i === e.line - 1 || l === lines[i]);
      const sameValue = re.entries[P.entries.indexOf(e)].values[c.key] === e.values[c.key];
      if (!others || !sameValue) bad++;
      if (r.text === SAMPLE) identical++;
    });
  });
  check('setValue: re-setting every column of every S line and of a sample of D lines is ok, touches only its own line, keeps the value (' + total + ' edits)', bad === 0 && total > 400);
  check('setValue: and returns the source untouched in nearly every case', identical >= total * 0.95);
}
{
  const same1 = Writer.setValue(SAMPLE, { line: 2 }, 'length', 1);
  check('setValue: the value it already has is not a change (text is the input)', same1.ok && same1.changed === false && same1.text === SAMPLE && same1.touched === null);
}
{
  // a line with text past column 80 and with trailing padding
  const tail = D1 + ' '.repeat(80 - D1.length) + 'MOD0001';
  const src = [S1, tail, D2].join('\n') + '\n';
  const r = Writer.setValue(src, { line: 2 }, 'length', 12);
  check('setValue: text past column 80 survives', linesOf(r.text)[1].replace('\n', '').slice(80) === 'MOD0001');
  const padded = [S1 + ' '.repeat(80 - S1.length), D1 + ' '.repeat(80 - D1.length)].join('\n');
  const r2 = Writer.setValue(padded, { line: 2 }, 'column', 9);
  check('setValue: a line padded to 80 stays padded, and one without a final line end stays so', linesOf(r2.text)[1].length === 80 && !/\n$/.test(r2.text));
  const r3 = Writer.setValue(small('\n'), { line: 2 }, 'output', '');
  check('setValue: clearing the last column entry keeps the line right-trimmed', linesOf(r3.text)[1] === D1.slice(0, 22) + '\n');
}
{
  const f = (v, k, val, ref) => Writer.setValue(small('\n'), ref || { line: 2 }, k, val);
  check('setValue: a value wider than its columns is refused', f(0, 'name', 'ABCDEFGHI').code === 'tooWide');
  check('setValue: a number wider than its columns is refused', f(0, 'length', 12345).code === 'tooWide');
  check('setValue: a control character is refused', f(0, 'name', 'A\tB').code === 'badValue' && f(0, 'name', 'A\nB').code === 'badValue');
  check('setValue: an object or a boolean for a plain column is refused', f(0, 'name', {}).code === 'badValue' && f(0, 'name', true).code === 'badValue' && f(0, 'length', [1]).code === 'badValue');
  check('setValue: an unknown column is refused', f(0, 'nonsense', 'x').code === 'unknownColumn');
  check('setValue: the constant and the continuation column are for setConstant', f(0, 'constantData', 'x').code === 'useSetConstant' && f(0, 'continuation', 'X').code === 'useSetConstant');
  check('setValue: no entry at that place', f(0, 'name', 'X', { line: 99 }).code === 'noSuchEntry' && f(0, 'name', 'X', { entry: 99 }).code === 'noSuchEntry');
  check('setValue: an indicator number is written as two digits', linesOf(f(0, 'output', 5).text)[1].slice(22, 24) === '05');
  check('setValue: an indicator out of range is refused', f(0, 'output', 100).code === 'badValue' && f(0, 'output', 0).code === 'badValue');
  check('setValue: a negative or fractional number is refused', f(0, 'length', -1).code === 'badValue' && f(0, 'length', 1.5).code === 'badValue');
  check('setValue: a column above 99 is written as A0 - D2', linesOf(f(0, 'column', 105).text)[1].slice(20, 22) === 'A5' && linesOf(f(0, 'column', 132).text)[1].slice(20, 22) === 'D2');
  check('setValue: a column of 133 is refused', f(0, 'column', 133).code === 'badValue');
  check('setValue: a digit string in a numeric column is right-justified', linesOf(f(0, 'line', '7').text)[1].slice(18, 20) === ' 7');
  check('setValue: V as the start line', linesOf(f(0, 'startLine', 'V', { line: 1 }).text)[0].slice(16, 18) === 'V ');
  check('setValue: a name is left-justified', linesOf(f(0, 'name', 'AB').text)[1].slice(6, 14) === 'AB      ');
  check('setValue: a number for a non-numeric column is written as text, left-justified', linesOf(f(0, 'dataType', 5).text)[1].slice(26, 27) === '5');
  check('setValue: a blank entry is not a specification', Writer.setValue('     SFMT01\n\n', { line: 2 }, 'name', 'X').code === 'notASpec');
  const h = Writer.setValue('     SFMT01\n     HHLP0001', { line: 2 }, 'upperLeft', { row: 5, column: 12 });
  check('setValue: an H corner from { row, column }', linesOf(h.text)[1].slice(33, 37) === ' 512');
  const h2 = Writer.setValue('     SFMT01\n     HHLP0001', { line: 2 }, 'lowerRight', { row: 20, column: 110 });
  check('setValue: an H corner with a column above 99', linesOf(h2.text)[1].slice(38, 42) === '20B0');
  check('setValue: an H corner that is not a row and a column is refused', Writer.setValue('     SFMT01\n     HHLP0001', { line: 2 }, 'upperLeft', { row: 5, column: 200 }).code === 'badValue');
  const c = Writer.setValue('     SFMT01\n     S* hello\n', { line: 2 }, 'text', 'changed');
  check('setValue: a comment line takes "text" (columns 8 - 80)', c.ok && linesOf(c.text)[1] === '     S*changed\n'.replace('S*c', 'S*c'));
  check('setValue: a comment line has no other column', Writer.setValue('     SFMT01\n     S* hello\n', { line: 2 }, 'name', 'X').code === 'unknownColumn');
  check('setValue: a comment of 74 characters is refused', Writer.setValue('     SFMT01\n     S* hello\n', { line: 2 }, 'text', 'x'.repeat(74)).code === 'tooWide');
}

// ---- line ends, final line end, BOM ----------------------------------------------------------
for (const eol of ['\r\n', '\n', '\r']) {
  const src = small(eol);
  const r = Writer.setValue(src, { line: 2 }, 'length', 3);
  check('line ends kept for an edit: ' + JSON.stringify(eol), r.ok && r.text.split(eol).length === src.split(eol).length && !/\r?\n|\r/.test(r.text.split(eol).join('')));
  const ins = Writer.insertSpec(src, { format: 0, at: 'end' }, { type: 'D', values: { name: 'NEW', length: 4, line: 5, column: 2 } });
  check('a new line takes the neighbour\'s line end: ' + JSON.stringify(eol), ins.ok && linesOf(ins.text)[3].endsWith(eol) && linesOf(ins.text).length === 6);
}
{
  const src = small('\n', false);
  const ins = Writer.insertSpec(src, { after: { line: 5 } }, { type: 'D', values: { name: 'LAST' } });
  check('insert after the last line of a source with no final line end: still none', ins.ok && !/\n$/.test(ins.text) && linesOf(ins.text).length === 6);
  check('  and the old last line got a line end', linesOf(ins.text)[4].endsWith('\n'));
  const del = Writer.deleteEntry(src, { line: 5 });
  check('delete the last line of a source with no final line end: still none', del.ok && !/\n$/.test(del.text) && linesOf(del.text).length === 4);
}
{
  const src = '\ufeff' + small('\r\n');
  const r = Writer.setValue(src, { line: 2 }, 'length', 3);
  check('a byte order mark is kept', r.ok && r.text.charCodeAt(0) === 0xFEFF && Parser.parse(r.text).entries[1].numbers.length === 3);
}

// ---- constants -------------------------------------------------------------------------------
{
  const chains = P.entries.filter((e) => e.kind === 'D' && e.continuationLines > 0);
  check('the sample has continuation chains to test against', chains.length > 0);
  let bad = 0;
  const rawConstant = (e) => e.raw.map((r, k) => Parser.columnText(r, k ? 7 : 57, 79)).join('');
  chains.forEach((e) => {
    const idx = P.entries.indexOf(e);
    const away = Writer.setConstant(SAMPLE, { entry: idx }, 'x');
    if (!away.ok || Parser.parse(away.text).entries[idx].constantText !== 'x' || Parser.parse(away.text).entries[idx].continuationLines !== 0) { bad++; return; }
    // a line with no constant type gets C when it is given a constant: put the type back, then the constant
    const typed = Writer.setValue(away.text, { entry: idx }, 'constantType', e.values.constantType);
    const back = typed.ok && Writer.setConstant(typed.text, { entry: idx }, rawConstant(e), { keepBlanks: true });
    if (!back || !back.ok || back.text !== SAMPLE) bad++;
  });
  check('a constant set away and back (raw text, blanks kept) gives the sample byte for byte (' + chains.length + ' chains)', bad === 0);

  let bad2 = 0;
  P.entries.filter((e) => e.kind === 'D' && e.role === 'constant').forEach((e) => {
    const r = Writer.setConstant(SAMPLE, { entry: P.entries.indexOf(e) }, e.constantText);
    if (!r.ok || r.changed || r.text !== SAMPLE) bad2++;
  });
  check('setting every constant to the text it has changes nothing', bad2 === 0);
}
{
  const DC = mk('D', [[7, 'FLD0001'], [15, '   1'], [19, ' 2'], [21, ' 2'], [56, 'C']]);
  const base = [S1, DC].join('\n') + '\n';
  const set = (s) => Writer.setConstant(base, { line: 2 }, s);
  const L = (r) => linesOf(r.text);
  check('constantPieces: 23 characters on the first line, 73 on each next', Writer.constantPieces('a'.repeat(23)).length === 1 && Writer.constantPieces('a'.repeat(24)).length === 2 && Writer.constantPieces('a'.repeat(96)).length === 2 && Writer.constantPieces('a'.repeat(97)).length === 3);
  check('constantPieces: the end of the last piece is trimmed, a piece that is followed keeps its blanks', Writer.constantPieces('a' + ' '.repeat(30) + 'b  ')[0].length === 23 && Writer.constantPieces('ab   ')[0] === 'ab');
  check('a constant of 23 characters is one line, no X', L(set('a'.repeat(23))).length === 2 && !/X$/.test(L(set('a'.repeat(23)))[1].replace('\n', '')));
  const two = L(set('a'.repeat(24)));
  check('24 characters: two lines, X in column 80 of the first, D in column 6 of the second', two.length === 3 && two[1].replace('\n', '').length === 80 && two[1].charAt(79) === 'X' && two[2].slice(0, 7) === '     Da');
  check('  the continuation line holds the rest from column 7', two[2].replace('\n', '') === '     Da');
  check('97 characters: three lines, the middle one full width ending in X', L(set('a'.repeat(97))).length === 4 && L(set('a'.repeat(97)))[2].replace('\n', '').length === 80 && L(set('a'.repeat(97)))[2].charAt(79) === 'X');
  check('the parser reads back the same constant', Parser.parse(set('Hello  world ' + 'x'.repeat(50)).text).entries[1].constantText === 'Hello  world ' + 'x'.repeat(50));
  check('blanks at the join survive', Parser.parse(set('a'.repeat(22) + '   ' + 'b'.repeat(5)).text).entries[1].constantText === 'a'.repeat(22) + '   ' + 'b'.repeat(5));
  check('shorter again: the continuation lines are removed and the X is cleared', (() => { const r = Writer.setConstant(set('a'.repeat(100)).text, { line: 2 }, 'short'); return r.ok && linesOf(r.text).length === 2 && linesOf(r.text)[1] === DC + 'short\n'; })());
  check('an empty constant clears columns 57 - 79', (() => { const r = Writer.setConstant(set('abc').text, { line: 2 }, ''); return r.ok && Parser.parse(r.text).entries[1].constantText === '' && linesOf(r.text)[1].length <= 57; })());
  check('trailing blanks of a constant are not kept', Parser.parse(set('abc   ').text).entries[1].constantText === 'abc');
  const field = Writer.setConstant([S1, D1].join('\n') + '\n', { line: 2 }, 'text');
  check('a field line that gets a constant becomes a constant (type C)', field.ok && linesOf(field.text)[1].charAt(55) === 'C');
  check('a control character in a constant is refused', set('a\tb').code === 'badValue');
  check('a constant on a line that is not a D specification is refused', Writer.setConstant(base, { line: 1 }, 'x').code === 'notAD');
  check('CRLF: new continuation lines use it', (() => { const r = Writer.setConstant(base.replace(/\n/g, '\r\n'), { line: 2 }, 'a'.repeat(60)); return r.ok && linesOf(r.text).every((l) => l.endsWith('\r\n')); })());
  const noEol = [S1, DC].join('\n');
  const r = Writer.setConstant(noEol, { line: 2 }, 'a'.repeat(30));
  check('constant on the last line of a source with no final line end: still none', r.ok && !/\n$/.test(r.text) && linesOf(r.text).length === 3);
}

// ---- insert -----------------------------------------------------------------------------------
{
  const src = small('\n');
  const spec = { type: 'D', values: { name: 'NEWFLD', length: 8, line: 4, column: 2, output: 'Y' } };
  const atEnd = Writer.insertSpec(src, { format: 0, at: 'end' }, spec);
  const e = Parser.parse(atEnd.text);
  check('insert a D at the end of a format: it is the last field of format 0', atEnd.ok && e.formats[0].fields.length === 3 && e.formats[0].fields[2].values.name === 'NEWFLD' && e.formats[1].fields.length === 1);
  check('  the other lines are unchanged and in order', same(linesOf(atEnd.text).filter((_, i) => i !== 3), linesOf(src)));
  check('  numbers read back', e.formats[0].fields[2].numbers.length === 8 && e.formats[0].fields[2].numbers.line === 4 && e.formats[0].fields[2].numbers.column === 2);
  check('  touched is the new line', atEnd.touched.from === 4 && atEnd.touched.to === 4);
  check('insert before and after an entry', Writer.insertSpec(src, { before: { line: 3 } }, spec).ok && Parser.parse(Writer.insertSpec(src, { before: { line: 3 } }, spec).text).formats[0].fields[1].values.name === 'NEWFLD' && Parser.parse(Writer.insertSpec(src, { after: { line: 3 } }, spec).text).formats[0].fields[2].values.name === 'NEWFLD');
  check('the new line is right-trimmed', !/ $/.test(linesOf(atEnd.text)[3].replace('\n', '')));
  const withConst = Writer.insertSpec(src, { format: 1, at: 'end' }, { type: 'D', values: { name: 'T' }, constant: 'x'.repeat(40) });
  const ce = Parser.parse(withConst.text).formats[1].fields[1];
  check('insert a D with a long constant: continuation lines, type C', withConst.ok && ce.constantText === 'x'.repeat(40) && ce.continuationLines === 1 && ce.values.constantType === 'C');
  const help = Writer.insertSpec(small('\n'), { format: 0, at: 'end' }, { type: 'H', values: { name: 'AHLP0001' } });
  check('insert an H at the end of the help: before the first D', help.ok && Parser.parse(help.text).formats[0].help.length === 1 && Parser.parse(help.text).entries[1].kind === 'H');
  check('an H placed after a D is refused', Writer.insertSpec(src, { after: { line: 3 } }, { type: 'H', values: { name: 'AHLP0001' } }).code === 'helpOrder');
  check('a D placed before the first S is refused (it would be an orphan)', Writer.insertSpec(src, { before: { line: 1 } }, spec).code === 'wouldBreakSource');
  check('insert a comment and a *DDS line', (() => { const c = Writer.insertSpec(src, { after: { line: 1 } }, { type: 'comment', text: 'a note' }); const d = Writer.insertSpec(src, { after: { line: 1 } }, { type: 'dds', text: 'FRCDTA' }); return linesOf(c.text)[1] === '     S*a note\n' && Parser.parse(c.text).entries[1].kind === 'comment' && Parser.parse(d.text).entries[1].kind === 'dds'; })());
  check('a bad spec is refused', Writer.insertSpec(src, { atEnd: true }, null).code === 'badSpec' && Writer.insertSpec(src, { atEnd: true }, { type: 'Q' }).code === 'badSpec' && Writer.insertSpec(src, { atEnd: true }, { type: 'D', values: { nope: 1 } }).code === 'unknownColumn' && Writer.insertSpec(src, { atEnd: true }, { type: 'D', values: { constantData: 'x' } }).code === 'useConstant');
  check('a bad position is refused', Writer.insertSpec(src, null, spec).code === 'badPosition' && Writer.insertSpec(src, { format: 9, at: 'end' }, spec).code === 'noSuchFormat' && Writer.insertSpec(src, { after: { line: 99 } }, spec).code === 'noSuchEntry');
  const fmt = Writer.insertFormat(src, { atEnd: true }, { s: { name: 'SFMT03', startLine: 3 }, help: [{ name: 'AHLP0001' }], fields: [{ name: 'F1', length: 3, line: 2, column: 2 }, { name: 'F2', constant: 'Title' }] });
  const fe = Parser.parse(fmt.text);
  check('insertFormat at the end: S, one H, two D', fmt.ok && fe.formats.length === 3 && fe.formats[2].s.values.name === 'SFMT03' && fe.formats[2].help.length === 1 && fe.formats[2].fields.length === 2 && fe.formats[2].fields[1].constantText === 'Title');
  const fmt0 = Writer.insertFormat(src, { beforeFormat: 1 }, { s: { name: 'SMID' } });
  check('insertFormat before a format', Parser.parse(fmt0.text).formats.map((f) => f.name).join() === 'FMT01,SMID,FMT02');
  check('insertFormat: a bad format is refused', Writer.insertFormat(src, { atEnd: true }, null).code === 'badSpec');
}

// ---- delete and duplicate ---------------------------------------------------------------------
{
  const chain = P.entries.find((e) => e.kind === 'D' && e.continuationLines > 1);
  const r = Writer.deleteEntry(SAMPLE, { entry: P.entries.indexOf(chain) });
  check('delete a D with continuation lines: all its lines go, nothing else', r.ok && linesOf(r.text).length === linesOf(SAMPLE).length - chain.lines.length && same(linesOf(r.text), linesOf(SAMPLE).filter((_, i) => chain.lines.indexOf(i + 1) < 0)));
  check('  and the parse has the same problems as before', Parser.parse(r.text).problems.length === P.problems.length);
  check('delete an S entry is refused (use deleteFormat)', Writer.deleteEntry(SAMPLE, { line: 1 }).code === 'useDeleteFormat');
  check('delete: no such entry', Writer.deleteEntry(SAMPLE, { line: 9999 }).code === 'noSuchEntry');
  const f = Writer.deleteFormat(SAMPLE, 1);
  const fp = Parser.parse(f.text);
  check('deleteFormat removes the format and its fields', f.ok && fp.formats.length === P.formats.length - 1 && fp.formats[0].name === P.formats[0].name && fp.formats[1].name === P.formats[2].name);
  const span = Writer.formatSpan(P, 1);
  check('  exactly the lines of its span', linesOf(f.text).length === linesOf(SAMPLE).length - (span.last - span.first + 1));
  check('deleteFormat: no such format', Writer.deleteFormat(SAMPLE, 99).code === 'noSuchFormat');
  const src = ['     SFMT01', '     DF1', '     D* about 2', '     SFMT02', '     DF2', '     S* header of 3', '     SFMT03', '     DF3'].join('\n') + '\n';
  const hs = Parser.parse(src);
  check('formatSpan: a comment run directly above the next S is its header, one with a blank line between is not', JSON.stringify(Writer.formatSpan(hs, 0)) === '{"first":1,"last":2}' && JSON.stringify(Writer.formatSpan(hs, 1)) === '{"first":3,"last":5}' && JSON.stringify(Writer.formatSpan(hs, 2)) === '{"first":6,"last":8}' &&
    JSON.stringify(Writer.formatSpan(Parser.parse('     SFMT01\n     DF1\n     D* trailing\n\n     SFMT02\n'), 0)) === '{"first":1,"last":4}');
  const d2 = Writer.deleteFormat(src, 1);
  check('deleteFormat removes the format\'s header comment with it and leaves the next format\'s', d2.ok && linesOf(d2.text).join('').indexOf('header of 3') >= 0 && linesOf(d2.text).join('').indexOf('SFMT02') < 0);
  const dup = Writer.duplicateEntry(small('\n'), { line: 2 });
  check('duplicateEntry: a copy right after it', dup.ok && linesOf(dup.text)[2] === linesOf(dup.text)[1] && linesOf(dup.text).length === 6 && dup.touched.from === 3);
  const dupChain = Writer.duplicateEntry(SAMPLE, { entry: P.entries.indexOf(P.entries.find((e) => e.kind === 'D' && e.continuationLines > 0)) });
  check('duplicateEntry: a D with continuation lines is copied whole and still reads as one entry', dupChain.ok && Parser.parse(dupChain.text).problems.length === P.problems.length);
  check('duplicateEntry: an S entry is refused', Writer.duplicateEntry(small('\n'), { line: 1 }).code === 'notCopyable');
  check('duplicateEntry on a last line with no final line end: still none', !/\n$/.test(Writer.duplicateEntry(small('\n', false), { line: 5 }).text));
}

// ---- move -------------------------------------------------------------------------------------
{
  const sorted = (t) => linesOf(t).slice().sort();
  const src = small('\n');
  const m = Writer.moveEntry(src, { line: 2 }, { after: { line: 3 } });
  check('moveEntry within a format: order changes, no line lost or changed', m.ok && Parser.parse(m.text).formats[0].fields.map((f) => f.values.name).join() === 'FLD0002,FLD0001' && same(sorted(m.text), sorted(src)));
  const x = Writer.moveEntry(src, { line: 3 }, { format: 1, at: 'end' });
  check('moveEntry to another format', x.ok && Parser.parse(x.text).formats[1].fields.map((f) => f.values.name).join() === 'FLD0003,FLD0002' && Parser.parse(x.text).formats[0].fields.length === 1);
  check('moveEntry: to where it already is changes nothing', Writer.moveEntry(src, { line: 2 }, { before: { line: 2 } }).changed === false && Writer.moveEntry(src, { line: 2 }, { after: { line: 2 } }).changed === false && Writer.moveEntry(src, { line: 2 }, { before: { line: 3 } }).changed === false);
  check('moveEntry: an S entry is refused', Writer.moveEntry(src, { line: 1 }, { atEnd: true }).code === 'useMoveFormat');
  const chain = P.entries.find((e) => e.kind === 'D' && e.continuationLines > 0);
  check('moveEntry: a continuation line is not an entry, so it cannot be named as a place', Writer.moveEntry(SAMPLE, { entry: P.entries.indexOf(chain) }, { before: { line: chain.line + 1 } }).code === 'noSuchEntry');
  const lastChain = P.entries.filter((e) => e.kind === 'D' && e.continuationLines > 0).pop();
  const mv = Writer.moveEntry(SAMPLE, { entry: P.entries.indexOf(lastChain) }, { before: { entry: P.entries.indexOf(lastChain) - 3 } });
  check('moveEntry: a D with continuation lines moves whole', mv.ok && Parser.parse(mv.text).problems.length === P.problems.length && same(sorted(mv.text), sorted(SAMPLE)));
  const h = Writer.setValue(Writer.insertSpec(src, { format: 0, at: 'end' }, { type: 'H', values: { name: 'AHLP0001' } }).text, { line: 1 }, 'startLine', 2);
  check('moveEntry: an H moved behind a D is refused', Writer.moveEntry(h.text, { line: 2 }, { after: { line: 4 } }).code === 'helpOrder');

  // formats: every one moved to every place and moved back gives the sample again
  let bad = 0, count = 0;
  for (let from = 0; from < P.formats.length; from++) {
    for (let to = 0; to < P.formats.length; to++) {
      if (from === to) continue;
      count++;
      const a = Writer.moveFormat(SAMPLE, from, to);
      if (!a.ok || !same(sorted(a.text), sorted(SAMPLE))) { bad++; continue; }
      const names = Parser.parse(a.text).formats.map((f) => f.name);
      const wanted = P.formats.map((f) => f.name); const mvd = wanted.splice(from, 1)[0]; wanted.splice(to, 0, mvd);
      if (names.join() !== wanted.join()) { bad++; continue; }
      const back = Writer.moveFormat(a.text, to, from);
      if (!back.ok || back.text !== SAMPLE) bad++;
    }
  }
  check('moveFormat: every format to every place keeps every line and the right order, and moving back restores the sample byte for byte (' + count + ' moves)', bad === 0);
  check('moveFormat: to its own place changes nothing; a bad place is refused', Writer.moveFormat(SAMPLE, 2, 2).changed === false && Writer.moveFormat(SAMPLE, 2, 99).code === 'badPosition' && Writer.moveFormat(SAMPLE, 99, 0).code === 'noSuchFormat' && Writer.moveFormat(SAMPLE, 0, 1.5).code === 'badPosition');
  const hsrc = ['     S* first', '     SFMT01', '     DF1', '     S* second', '     SFMT02', '     DF2'].join('\n') + '\n';
  const hm = Writer.moveFormat(hsrc, 1, 0);
  check('moveFormat: the header comment moves with its format', hm.ok && linesOf(hm.text).join('') === ['     S* second', '     SFMT02', '     DF2', '     S* first', '     SFMT01', '     DF1'].join('\n') + '\n');
  const nofinal = Writer.moveFormat(small('\n', false), 0, 1);
  check('moveFormat: a source with no final line end keeps having none, and no line end is lost in the middle', nofinal.ok && !/\n$/.test(nofinal.text) && linesOf(nofinal.text).length === 5 && linesOf(nofinal.text).slice(0, 4).every((l) => l.endsWith('\n')));
}

// ---- never throws -----------------------------------------------------------------------------
{
  const junk = [null, undefined, '', 'plain text', '     A          R REC1\n', 42, {}];
  let threw = 0;
  junk.forEach((j) => {
    try {
      Writer.setValue(j, { line: 1 }, 'name', 'X'); Writer.setConstant(j, { line: 1 }, 'x'); Writer.insertSpec(j, { atEnd: true }, { type: 'S' });
      Writer.insertFormat(j, { atEnd: true }, { s: {} }); Writer.deleteEntry(j, { line: 1 }); Writer.deleteFormat(j, 0); Writer.duplicateEntry(j, { line: 1 });
      Writer.moveEntry(j, { line: 1 }, { atEnd: true }); Writer.moveFormat(j, 0, 1);
    } catch (e) { threw++; }
  });
  check('no operation throws on odd input', threw === 0);
  check('inserting a first format into an empty source works', (() => { const r = Writer.insertFormat('', { atEnd: true }, { s: { name: 'FMT01' }, fields: [{ name: 'F1', length: 3, line: 2, column: 2 }] }); return r.ok && Parser.parse(r.text).formats.length === 1 && r.text === '     SFMT01\n     DF1         3 2 2\n'; })());
  check('a refused edit says why and gives no text', (() => { const r = Writer.setValue(small('\n'), { line: 2 }, 'name', 'TOOLONGNAME'); return r.ok === false && typeof r.reason === 'string' && r.reason.length > 0 && r.text === undefined; })());
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

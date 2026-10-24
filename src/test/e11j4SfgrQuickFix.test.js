/**
 * E11j4 - quick-fixes for the E11j1 problems of SFGR source (src/sfgrQuickFix.js, SfgrWriter.setContinuation) and
 * their wiring. Pure Node: no vscode (the provider runs against a fake of the API, as in the DDS quick-fix tests).
 *
 *  1. setContinuation in the writer;
 *  2. a value out of range: letters, numbers, names, key mask, help corners;
 *  3. a missing continuation line, a duplicate name;
 *  4. every fix removes the problem it is for and leaves every other line byte-identical; the edit is the replacement
 *     of the changed lines and nothing more;
 *  5. the real sample (no fix needed, nothing offered), junk input;
 *  6. the VS Code provider and the host wiring.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const Quick = require('../sfgrQuickFix.js');
const Writer = require('../sfgrWriter.js');
const Diagnostics = require('../sfgrDiagnostics.js');
const Parser = require('../sfgrParser.js');

const root = path.join(__dirname, '..', '..');
const sample = fs.readFileSync(path.join(root, 'docs', 'sda-reference', 'source', 'stipfm.dspf36'), 'utf8');

function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const S = (name, extra) => mk('S', [[7, name]].concat(extra || []));
const F = (name, line, col, len, extra) => mk('D', [[7, name], [15, String(len).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)], [23, 'Y']].concat(extra || []));
const C = (name, line, col, text, extra) => mk('D', [[7, name], [15, String(text.length).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)], [23, 'Y'], [56, 'C'], [57, text]].concat(extra || []));
const H = (name, extra) => mk('H', [[7, name]].concat(extra || []));
const src = (lines, eol) => lines.join(eol || '\n') + (eol || '\n');

const problems = (text) => Diagnostics.analyze(text).diagnostics || Diagnostics.analyze(text);
const withCode = (text, code) => problems(text).filter((d) => d.code === code);
/** Apply an edit { startLine, ... newText } to text. */
function apply(text, e) {
  const rows = text.split(/(\r\n|\n|\r)/);   // pieces and their line ends alternate
  const lineStarts = [];
  let off = 0;
  for (let i = 0; i < rows.length; i += 2) { lineStarts.push(off); off += rows[i].length + (rows[i + 1] ? rows[i + 1].length : 0); }
  const at = (l, c) => (lineStarts[l] === undefined ? text.length : lineStarts[l]) + c;
  return text.slice(0, at(e.startLine, e.startCharacter)) + e.newText + text.slice(at(e.endLine, e.endCharacter));
}
const fixOf = (text, d, titleRe) => Quick.fixesFor(text, d).find((f) => titleRe.test(f.title));
const diagOf = (text, code, n) => withCode(text, code)[n || 0];

// ---- 1. the writer -------------------------------------------------------------------------------------------------
{
  const x = [S('F1'), C('A', 2, 2, 'HELLO', [[80, 'X']]), S('NEXT')];
  const text = src(x, '\r\n');
  const add = Writer.setContinuation(text, { line: 2 }, 'add');
  check('writer: add puts a blank D line after the X line, with the source\'s own line end', add.ok && add.changed && add.text === src([x[0], x[1], '     D', x[2]], '\r\n'));
  check('writer: add leaves the problem gone', withCode(add.text, 'isda.sfgrContinuation').length === 0);
  const rem = Writer.setContinuation(text, { line: 2 }, 'remove');
  check('writer: remove takes the X away and nothing else', rem.ok && rem.changed && Parser.columnText(rem.text.split('\r\n')[1], 80, 80) === ' ' && rem.text.split('\r\n')[0] === x[0] && rem.text.split('\r\n')[2] === x[2]);
  const endless = src(x.slice(0, 2)).replace(/\n$/, '');
  const a2 = Writer.setContinuation(endless, { line: 2 }, 'add');
  check('writer: add at the end of a source with no final line end keeps it without one', a2.ok && a2.text === x[0] + '\n' + x[1] + '\n     D');
  check('writer: nothing to do without an X, or when a D line already follows', Writer.setContinuation(src([S('F1'), F('A', 2, 2, 5)]), { line: 2 }, 'add').changed === false &&
    Writer.setContinuation(src([S('F1'), C('A', 2, 2, 'HI', [[80, 'X']]), mk('D', [[7, 'more']])]), { line: 2 }, 'add').changed === false);
  check('writer: a wrong mode, a wrong entry and a non-D entry are refused', Writer.setContinuation(text, { line: 2 }, 'x').ok === false && Writer.setContinuation(text, { line: 99 }, 'add').ok === false && Writer.setContinuation(text, { line: 1 }, 'add').ok === false);
}

// ---- 2. values -----------------------------------------------------------------------------------------------------
{
  const text = src([
    S('F1', [[17, '30'], [19, '30'], [27, 'y'], [28, 'Q'], [64, 'C?V 1']]),
    F('A', 0, 2, 2000),
    mk('D', [[7, 'B'], [15, '   5'], [19, ' 2'], [21, 'D5'], [23, 'Y']]),
    H('HELP0001', [[34, ' 1D5'], [39, '1580']])
  ]);
  const d = (code, line, col) => ({ code, line, column: col });
  const val = 'isda.sfgrValue';
  const f = (line, col) => Quick.fixesFor(text, d(val, line, col));
  check('a lowercase letter becomes its capital', f(1, 27).length === 1 && f(1, 27)[0].title === 'Change "y" to "Y"' && /^     S.*Y/.test(apply(text, f(1, 27)[0].edit).split('\n')[0]) === true);
  check('a letter that is no value is cleared (blank is the default)', /Clear enable command keys/.test(f(1, 28)[0].title) && Parser.columnText(apply(text, f(1, 28)[0].edit).split('\n')[0], 28, 28) === ' ');
  check('a start line past the screen is set to the last line', f(1, 17)[0].title === 'Set the start line to 24' && Parser.columnText(apply(text, f(1, 17)[0].edit).split('\n')[0], 17, 18) === '24');
  check('lines to clear past the screen is set to the last line', f(1, 19)[0].title === 'Set the lines to clear to 24');
  check('a key mask loses the characters that are no keys', /Keep only the keys/.test(f(1, 64)[0].title) && Parser.columnText(apply(text, f(1, 64)[0].edit).split('\n')[0], 64, 79).trim() === 'CV1' && f(1, 64)[0].title === 'Keep only the keys: CV1');
  check('a field length past 1919 is set to 1919', f(2, 15)[0].title === 'Set the field length to 1919');
  check('a line of 0 is set to 1', f(2, 19)[0].title === 'Set the line to 1');
  check('a column past 132 is set to 132 (D2)', f(3, 21)[0].title === 'Set the column to 132' && /D2/.test(apply(text, f(3, 21)[0].edit).split('\n')[2]));
  check('a help corner out of range is set to the nearest row and column', f(4, 34).length === 1 && f(4, 34)[0].title === 'Set the corner to row 1, column 132' && /D2/.test(apply(text, f(4, 34)[0].edit).split('\n')[3]));
  const wide = src([S('W', [[39, 'Y']]), F('A', 2, 2, 3000)]);
  check('on a 132-column format the field length goes up to 3563', Quick.fixesFor(wide, d(val, 2, 15)).length === 0);
  const names = src([S('1BAD'), S('A B'), F('X', 2, 2, 5), S("Q'S"), S('')]);
  const nf = (line) => Quick.fixesFor(names, d(val, line, 7));
  check('a name that starts with a digit gets a # in front position', nf(1).length === 1 && nf(1)[0].title === 'Change the name to "#BAD"');
  check('a blank or quote inside a name becomes #', Quick.fixesFor(names, d(val, 4, 7))[0].title === 'Change the name to "Q#S"');
  check('a blank format name has no fix (a name is not made up)', nf(5).length === 0);
  check('a value that is fine gets no fix', Quick.fixesFor(src([S('OK', [[27, 'Y']]), F('A', 2, 2, 5)]), d(val, 1, 27)).length === 0);
}

// ---- 3. continuation and duplicates --------------------------------------------------------------------------------
{
  const text = src([S('F1'), C('A', 2, 2, 'HELLO', [[80, 'X']]), S('F2'), F('B', 2, 2, 5)]);
  const dg = diagOf(text, 'isda.sfgrContinuation');
  check('E11j1 reports the X without a continuation line', !!dg);
  const fixes = Quick.fixesFor(text, dg);
  check('two fixes: add the line (preferred) and remove the X', fixes.length === 2 && fixes[0].title === 'Add the continuation line' && fixes[0].preferred && /Remove the X/.test(fixes[1].title) && !fixes[1].preferred);
  const added = apply(text, fixes[0].edit);
  check('adding the line clears the problem and changes only that', withCode(added, 'isda.sfgrContinuation').length === 0 && added === src([S('F1'), C('A', 2, 2, 'HELLO', [[80, 'X']]), '     D', S('F2'), F('B', 2, 2, 5)]));
  const removed = apply(text, fixes[1].edit);
  check('removing the X clears the problem', withCode(removed, 'isda.sfgrContinuation').length === 0 && removed.split('\n')[2] === S('F2'));
  const dup = src([S('SAME'), F('A', 2, 2, 5), S('SAME'), F('B', 2, 2, 5), S('SAME01')]);
  const dd = diagOf(dup, 'isda.sfgrDuplicateName');
  const rf = Quick.fixesFor(dup, dd);
  check('a duplicate name is renamed to a free name, not one already used', rf.length === 1 && rf[0].title === 'Rename the format to SAME02' && rf[0].preferred);
  const renamed = apply(dup, rf[0].edit);
  check('renaming clears the duplicate and touches only the S line', withCode(renamed, 'isda.sfgrDuplicateName').length === 0 && renamed.split('\n').filter((l, i) => l !== dup.split('\n')[i]).length === 1);
  check('a long name keeps 6 characters and the two digits', Quick.fixesFor(src([S('ABCDEFGH'), S('ABCDEFGH')]), diagOf(src([S('ABCDEFGH'), S('ABCDEFGH')]), 'isda.sfgrDuplicateName'))[0].title === 'Rename the format to ABCDEF01');
}

// ---- 4. byte-identical and minimal ---------------------------------------------------------------------------------
{
  for (const eol of ['\n', '\r\n', '\r']) {
    const text = src([S('F1', [[27, 'y']]), '', mk('D', [[7, '* a comment']]), C('A', 2, 2, 'HI', [[80, 'X']]), S('F1', [[28, 'Z']]), F('B', 2, 2, 5), H('HELP0001')], eol);
    let every = true, onlyChanged = true, count = 0;
    problems(text).forEach((d) => {
      Quick.fixesFor(text, d).forEach((fx) => {
        count++;
        const out = apply(text, fx.edit);
        const a = text.split(/\r\n|\n|\r/), b = out.split(/\r\n|\n|\r/);
        const same = a.filter((l) => b.indexOf(l) >= 0).length;
        if (!(out !== text)) every = false;
        if (a.length - same > 2) onlyChanged = false;
        if (!out.includes(eol) && text.includes(eol)) every = false;
      });
    });
    check('every fix is a real change and keeps the line ends (' + JSON.stringify(eol) + ', ' + count + ' fixes)', every && count >= 4);
    check('every fix changes at most the lines it is about (' + JSON.stringify(eol) + ')', onlyChanged);
  }
  const text = src([S('F1', [[27, 'y']]), F('A', 2, 2, 5), F('B', 3, 2, 5)]);
  const fx = Quick.fixesFor(text, diagOf(text, 'isda.sfgrValue'))[0];
  check('the edit is the one changed line and no more', fx.edit.startLine === 0 && fx.edit.endLine === 0 && fx.edit.startCharacter === 0 && fx.edit.newText.split('\n').length === 1);
  const same = Quick.editBetween('a\nb\nc\n', 'a\nB\nc\n');
  check('editBetween: the replacement of the changed line', same.startLine === 1 && same.startCharacter === 0 && same.endLine === 1 && same.endCharacter === 1 && same.newText === 'B');
  const astral = src([S('A\u{1F600}', [[27, 'y']]), F('B', 2, 2, 5)]);
  const af = Quick.fixesFor(astral, diagOf(astral, 'isda.sfgrValue'));
  check('an astral character in the line is not cut in two', af.length === 1 && /^[\s\S]*A\u{1F600}[\s\S]*Y/u.test(apply(astral, af[0].edit)));
}

// ---- 5. sample, junk --------------------------------------------------------------------------------------------------
{
  const offered = problems(sample).reduce((n, d) => n + Quick.fixesFor(sample, d).length, 0);
  check('the sample has no problem to fix, so nothing is offered', offered === 0);
  check('junk gives nothing', [null, undefined, 3, {}].every((x) => Quick.fixesFor(x, { code: 'isda.sfgrValue', line: 1, column: 1 }).length === 0) && Quick.fixesFor('x', null).length === 0 && Quick.fixesFor('x', { code: 'isda.other', line: 1, column: 1 }).length === 0);
  check('a diagnostic that points at nothing gives nothing', Quick.fixesFor(src([S('A')]), { code: 'isda.sfgrValue', line: 9, column: 27 }).length === 0 && Quick.fixesFor(src([S('A')]), { code: 'isda.sfgrContinuation', line: 9, column: 80 }).length === 0);
  check('an overlap warning has no fix, nor has a field with a column past the screen (a field past the last row has two since E12c)', Quick.fixesFor(src([S('A'), F('B', 2, 2, 5), F('C', 2, 2, 5)]), { code: 'isda.sfgrOverlap', line: 3, column: 15 }).length === 0 && Quick.fixesFor(src([S('A'), F('B', 2, 90, 5)]), { code: 'isda.sfgrOutsideScreen', line: 2, column: 21 }).length === 0);
}

// ---- 6. provider and host ---------------------------------------------------------------------------------------------
{
  class Range { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } }
  class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } }
  class WorkspaceEdit { constructor() { this.edits = []; } replace(uri, range, text) { this.edits.push({ uri, range, text }); } }
  const api = { Range, CodeAction, WorkspaceEdit, CodeActionKind: { QuickFix: 'quickfix' } };
  const text = src([S('F1', [[27, 'y']]), F('A', 2, 2, 5)]);
  const document = { getText: () => text, uri: { id: 'doc' } };
  let settings = { enable: true }, accept = true;
  const provider = Quick.createProvider(api, { getSettings: () => settings, shouldProvide: () => accept });
  const diag = { source: 'iSDA', code: 'isda.sfgrValue', range: new Range(0, 26, 0, 27) };
  const actions = provider.provideCodeActions(document, null, { diagnostics: [diag] });
  check('provider: a quick-fix action with the edit and its diagnostic', actions.length === 1 && actions[0].kind === 'quickfix' && actions[0].diagnostics[0] === diag && actions[0].edit.edits.length === 1 && actions[0].edit.edits[0].uri === document.uri);
  check('provider: the edit makes the source right', apply(text, { startLine: actions[0].edit.edits[0].range.start.line, startCharacter: actions[0].edit.edits[0].range.start.character, endLine: actions[0].edit.edits[0].range.end.line, endCharacter: actions[0].edit.edits[0].range.end.character, newText: actions[0].edit.edits[0].text }).split('\n')[0].charAt(26) === 'Y');
  check('provider: other sources and other codes are left alone', provider.provideCodeActions(document, null, { diagnostics: [Object.assign({}, diag, { source: 'x' }), Object.assign({}, diag, { code: 'isda.sfgrOverlap' }), { source: 'iSDA', code: 'isda.something' }] }).length === 0);
  settings = { enable: false };
  check('provider: isda.quickFix.enable = false gives nothing', provider.provideCodeActions(document, null, { diagnostics: [diag] }).length === 0);
  settings = { enable: true }; accept = false;
  check('provider: a document that is not SFGR gets nothing', provider.provideCodeActions(document, null, { diagnostics: [diag] }).length === 0);

  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const sfgrAt = ext.indexOf('SfgrQuickFix.createProvider(vscode');
  const ddsAt = ext.indexOf('DdsQuickFix.createProvider(vscode');
  check('host: the SFGR quick-fix uses isda.quickFix.enable and the SFGR filter', /SfgrQuickFix\.createProvider\(vscode,[\s\S]{0,300}quickFix\.enable[\s\S]{0,120}shouldProvide: isSfgrTextDocument/.test(ext));
  check('host: registered before the DDS quick-fix (the DDS one stays the last code action provider)', sfgrAt > 0 && ddsAt > sfgrAt);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  check('build: sfgrQuickFix.js is in the copy list', /'sfgrQuickFix\.js'/.test(pkg.scripts['build:webview-assets']));
}

process.exit(failureCount() === 0 ? 0 : 1);

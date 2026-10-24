/**
 * E12c - quick-fix, second slice, for System/36 SFGR source (src/sfgrQuickFix.js, src/sfgrDiagnostics.js) and the
 * fix-all over the file (source.fixAll.isda).
 *
 *  1. two new rules: isda.sfgrOrder (an H after a D) and isda.sfgrKeyMask (keys the enable column does not apply to);
 *  2. the order fix;
 *  3. the key mask fix;
 *  4. the fixes for a field past the last row (two choices, none preferred);
 *  5. which fixes are safe, and fixAll: what it applies, what it leaves, re-reading after a fix that moves lines,
 *     idempotence, every untouched line byte-identical, line ends, a big source;
 *  6. the VS Code provider (source.fixAll, quick-fix only requests) and the real extension host.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.call(this, request, parent, isMain);
};

const vscodeMock = require('./vscode-mock.js');
const { check, failureCount } = require('./helpers/harness');
const Quick = require('../sfgrQuickFix.js');
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
const H = (name) => mk('H', [[7, name], [34, ' 1 2'], [39, ' 3 9']]);
const src = (lines, eol) => lines.join(eol || '\n') + (eol || '\n');

const problems = (text, options) => Diagnostics.analyze(text, options).diagnostics;
const withCode = (text, code) => problems(text).filter((d) => d.code === code);
const linesOf = (text) => text.split(/\r\n|\n|\r/);
function apply(text, e) {
  const rows = text.split(/(\r\n|\n|\r)/);
  const lineStarts = [];
  let off = 0;
  for (let i = 0; i < rows.length; i += 2) { lineStarts.push(off); off += rows[i].length + (rows[i + 1] ? rows[i + 1].length : 0); }
  const at = (l, c) => (lineStarts[l] === undefined ? text.length : lineStarts[l]) + c;
  return text.slice(0, at(e.startLine, e.startCharacter)) + e.newText + text.slice(at(e.endLine, e.endCharacter));
}
const diagOf = (text, code, n) => withCode(text, code)[n || 0];
const fixesOf = (text, code, n) => Quick.fixesFor(text, diagOf(text, code, n));
const ORDER = 'isda.sfgrOrder', KEYMASK = 'isda.sfgrKeyMask', OUTSIDE = 'isda.sfgrOutsideScreen', VALUE = 'isda.sfgrValue';

// ---- 1. the two rules ----------------------------------------------------------------------------------------------
console.log('\n1. the rules');
{
  const text = src([S('F1'), F('A', 2, 2, 5), H('HELP0001'), F('B', 3, 2, 5)]);
  const d = withCode(text, ORDER);
  check('order: an H after a D is reported on its line, at column 6, as an error', d.length === 1 && d[0].line === 3 && d[0].column === 6 && d[0].severity === 'error' && /line 2/.test(d[0].message) && /S, then H, then D/.test(d[0].message));
  check('order: S, H, D in order is not reported', withCode(src([S('F1'), H('HELP0001'), F('A', 2, 2, 5)]), ORDER).length === 0);
  check('order: a format without D specifications has nothing to be after', withCode(src([S('F1'), H('HELP0001')]), ORDER).length === 0);
  check('order: each H after the first D is reported', withCode(src([S('F1'), F('A', 2, 2, 5), H('HELP0001'), H('HELP0002')]), ORDER).length === 2);
  check('order: the second format is judged on its own', withCode(src([S('F1'), H('HELP0001'), F('A', 2, 2, 5), S('F2'), F('B', 2, 2, 5), H('HELP0002')]), ORDER).map((x) => x.line).join() === '6');
  check('order: the real sample has none', withCode(sample, ORDER).length === 0 && withCode(sample, KEYMASK).length === 0);
  check('order: the setting can move or drop it', problems(text, { severity: { [ORDER]: 'warning' } }).find((x) => x.code === ORDER).severity === 'warning' && problems(text, { severity: { [ORDER]: 'off' } }).every((x) => x.code !== ORDER));
}
{
  const k = (extra) => withCode(src([S('F1', extra)]), KEYMASK);
  const a = k([[28, 'Y'], [64, '12CV']]);
  check('key mask: function keys with column 27 blank are reported (warning, on the mask columns)', a.length === 1 && a[0].severity === 'warning' && a[0].column === 64 && a[0].endColumn === 80 && /function keys 12 \(column 27 is blank\)/.test(a[0].message) && !/command keys/.test(a[0].message));
  const b = k([[27, 'Y'], [64, '12CV']]);
  check('key mask: command keys with column 28 blank are reported, function keys with Y are not', b.length === 1 && /command keys CV \(column 28 is blank\)/.test(b[0].message) && !/function keys/.test(b[0].message));
  check('key mask: R (retain) ignores the mask too', k([[27, 'R'], [28, 'R'], [64, '1C']]).length === 1 && /column 27 is R/.test(k([[27, 'R'], [28, 'R'], [64, '1C']])[0].message));
  check('key mask: both kinds ignored is still one diagnostic', k([[64, '1C']]).length === 1 && /function keys 1 .* and the command keys C/.test(k([[64, '1C']])[0].message));
  check('key mask: Y and N apply the mask, so there is nothing to report', k([[27, 'Y'], [28, 'N'], [64, '12CV']]).length === 0 && k([[27, 'N'], [28, 'Y'], [64, '1C']]).length === 0);
  check('key mask: no keys, or only characters that are no keys, is not this rule (those are isda.sfgrValue)', k([[64, '']]).length === 0 && k([[64, '??']]).length === 0 && withCode(src([S('F1', [[64, '??']])]), VALUE).length === 1);
  check('key mask: the setting can drop it', problems(src([S('F1', [[64, '1']])]), { severity: { [KEYMASK]: 'off' } }).every((x) => x.code !== KEYMASK));
  check('key mask: eight rule codes now, all isda.sfgr*, none a DDS code', Diagnostics.allCodes().length === 8 && Diagnostics.allCodes().includes(ORDER) && Diagnostics.allCodes().includes(KEYMASK));
}

// ---- 2. the order fix ----------------------------------------------------------------------------------------------
console.log('\n2. the order fix');
{
  const lines = [S('F1'), F('A', 2, 2, 5), H('HELP0001'), F('B', 3, 2, 5)];
  const text = src(lines);
  const fixes = fixesOf(text, ORDER);
  check('order fix: one fix, preferred and safe', fixes.length === 1 && fixes[0].preferred === true && fixes[0].safe === true && /Move the H specification up/.test(fixes[0].title));
  const fixed = apply(text, fixes[0].edit);
  check('order fix: the H goes right after the S and every other line is as it was', fixed === src([lines[0], lines[2], lines[1], lines[3]]));
  check('order fix: the problem is gone and no new one came', problems(fixed).length === 0);
  check('order fix: the edit is the changed lines only', fixes[0].edit.startLine === 1 && fixes[0].edit.endLine === 2);
}
{
  const lines = [S('F1'), H('HELP0001'), F('A', 2, 2, 5), H('HELP0002'), F('B', 3, 2, 5)];
  const text = src(lines);
  const fixed = apply(text, fixesOf(text, ORDER)[0].edit);
  check('order fix: it goes after the last H that is already in place', fixed === src([lines[0], lines[1], lines[3], lines[2], lines[4]]));
}
{
  const lines = [S('F1'), '     *  a comment', F('A', 2, 2, 5), H('HELP0001')];
  const text = src(lines, '\r\n');
  const fixed = apply(text, fixesOf(text, ORDER)[0].edit);
  check('order fix: a comment stays where it was, the line end is the source\'s own (CRLF)', fixed === src([lines[0], lines[3], lines[1], lines[2]], '\r\n') && !/[^\r]\n/.test(fixed));
}
{
  const lines = [S('F1'), F('A', 2, 2, 5), H('HELP0001')];
  const text = lines.join('\n');   // no final line end
  const fixed = apply(text, fixesOf(text, ORDER)[0].edit);
  check('order fix: a source with no final line end still has none', fixed === [lines[0], lines[2], lines[1]].join('\n'));
}
check('order fix: an H with no D in its format has nothing to move', Quick.fixesFor(src([S('F1'), H('HELP0001')]), { code: ORDER, line: 2, column: 6 }).length === 0);

// ---- 3. the key mask fix -------------------------------------------------------------------------------------------
console.log('\n3. the key mask fix');
{
  const text = src([S('F1', [[28, 'Y'], [64, '12CV']]), F('A', 2, 2, 5)]);
  const fixes = fixesOf(text, KEYMASK);
  check('key mask fix: one fix, not preferred, not safe', fixes.length === 1 && !fixes[0].preferred && fixes[0].safe === false && /function keys out of the key mask \(12/.test(fixes[0].title));
  const fixed = apply(text, fixes[0].edit);
  check('key mask fix: only the ignored keys go, the others stay in their order', fixed === src([S('F1', [[28, 'Y'], [64, 'CV']]), F('A', 2, 2, 5)]));
  check('key mask fix: the warning is gone', withCode(fixed, KEYMASK).length === 0 && problems(fixed).length === 0);
}
{
  const text = src([S('F1', [[64, '1C2D']])]);
  const fixed = apply(text, fixesOf(text, KEYMASK)[0].edit);
  check('key mask fix: both kinds ignored empties the mask', fixed === src([S('F1')]) && /function and command keys/.test(fixesOf(text, KEYMASK)[0].title));
  const crlf = src([S('F1', [[27, 'Y'], [64, '1C']]), F('A', 2, 2, 5)], '\r\n');
  const f2 = apply(crlf, fixesOf(crlf, KEYMASK)[0].edit);
  check('key mask fix: the other kind stays when its column applies, CRLF kept', f2 === src([S('F1', [[27, 'Y'], [64, '1']]), F('A', 2, 2, 5)], '\r\n') && !/[^\r]\n/.test(f2));
}

// ---- 4. a field past the last row ----------------------------------------------------------------------------------
console.log('\n4. past the last row');
{
  const lines = [S('F1', [[17, '20']]), F('A', 3, 2, 5), F('B', 6, 2, 5)];
  const text = src(lines);
  const d = diagOf(text, OUTSIDE);
  const fixes = Quick.fixesFor(text, d);
  check('outside: row 25 of 24 is reported on the line column of B', d.line === 3 && d.column === 19 && /row 25/.test(d.message));
  check('outside: two choices, none preferred, none safe', fixes.length === 2 && fixes.every((f) => !f.preferred && f.safe === false));
  const field = fixes.find((f) => /Move the field/.test(f.title));
  const format = fixes.find((f) => /Move the format up/.test(f.title));
  check('outside: the field goes to the last row it fits on (line 5 from start line 20)', !!field && /line 5/.test(field.title) && apply(text, field.edit) === src([lines[0], lines[1], F('B', 5, 2, 5)]));
  check('outside: the format moves up so that its lowest field is on the last row (start line 19)', !!format && /start line 19/.test(format.title) && apply(text, format.edit) === src([S('F1', [[17, '19']]), lines[1], lines[2]]));
  check('outside: either fix removes the problem', withCode(apply(text, field.edit), OUTSIDE).length === 0 && withCode(apply(text, format.edit), OUTSIDE).length === 0);
}
{
  const blank = src([S('F1'), F('A', 30, 2, 5)]);
  const f1 = fixesOf(blank, OUTSIDE);
  check('outside: a blank start line cannot be lowered, so only the field fix is offered (line 24)', f1.length === 1 && /line 24/.test(f1[0].title) && apply(blank, f1[0].edit) === src([S('F1'), F('A', 24, 2, 5)]));
  const variable = src([S('F1', [[17, 'V']]), F('A', 30, 2, 5)]);
  check('outside: a V start line is not lowered either', fixesOf(variable, OUTSIDE).every((f) => !/format up/.test(f.title)));
  const low = src([S('F1', [[17, ' 3']]), F('A', 30, 2, 5)]);
  const f3 = fixesOf(low, OUTSIDE);
  check('outside: no format fix when the start line would go below 1; the field fix stays', f3.length === 1 && /line 22/.test(f3[0].title));
  const worst = src([S('F1', [[17, ' 5']]), F('A', 20, 2, 5), F('B', 24, 2, 5)]);
  const f4 = fixesOf(worst, OUTSIDE).find((f) => /format up/.test(f.title));
  check('outside: the format moves by what the lowest field needs (start 5 to 1), the other field still fits', !!f4 && /start line 1/.test(f4.title) && withCode(apply(worst, f4.edit), OUTSIDE).length === 0);
  const wide = src([S('F1', [[17, '25'], [39, 'Y']]), F('A', 5, 2, 5)]);
  const f5 = fixesOf(wide, OUTSIDE);
  check('outside: a 132-column format has 27 lines', f5.length === 2 && f5.some((f) => /line 3 /.test(f.title)) && f5.some((f) => /start line 23/.test(f.title)));
  const wrap = src([S('F1'), F('A', 23, 70, 100)]);
  const dw = diagOf(wrap, OUTSIDE);
  check('outside: a field that wraps past the last row is reported but gets no fix (not what this slice covers)', !!dw && /runs on to row/.test(dw.message) && Quick.fixesFor(wrap, dw).length === 0);
  const col = src([S('F1'), F('A', 2, 90, 5)]);
  check('outside: a column past the screen gets no fix', Quick.fixesFor(col, diagOf(col, OUTSIDE)).length === 0);
  const wrapRow = src([S('F1', [[17, '20']]), F('A', 6, 70, 100)]);
  const fr = fixesOf(wrapRow, OUTSIDE);
  const frField = fr.find((f) => /Move the field/.test(f.title));
  const frFormat = fr.find((f) => /format up/.test(f.title));
  check('outside: a field that also wraps keeps its extra rows on the screen (line 3, not 5; start line 17, not 19)', fr.length === 2 && /line 3 /.test(frField.title) && /start line 17/.test(frFormat.title) &&
    withCode(apply(wrapRow, frField.edit), OUTSIDE).length === 0 && withCode(apply(wrapRow, frFormat.edit), OUTSIDE).length === 0);
}

// ---- 5. fixAll ------------------------------------------------------------------------------------------------------
console.log('\n5. fixAll');
{
  const mixed = [
    S('F1', [[17, '20'], [27, 'y'], [64, 'C?V']]),
    F('A', 2, 2, 5),
    H('HELP0001'),
    F('B', 3, 2, 5, [[80, 'X']]),
    S('F1')
  ];
  const text = src(mixed);
  const before = problems(text).map((d) => d.code).sort();
  const r = Quick.fixAll(text);
  check('fixAll: changed, with the list of what it did in source order', r.changed && r.applied.length === 4 && r.applied.map((a) => a.title).join('|') === 'Change "y" to "Y"|Keep only the keys: CV|Move the H specification up, before the first D specification|Add the continuation line');
  const out = linesOf(r.text);
  check('fixAll: the H moved up, the continuation line was added, the capital and the mask are right', out[0] === S('F1', [[17, '20'], [27, 'Y'], [64, 'CV']]) && out[1] === H('HELP0001') && out[2] === mixed[1] && out[3] === mixed[3] && out[4] === '     D' && out[5] === mixed[4]);
  const left = problems(r.text).map((d) => d.code);
  check('fixAll: what it left is what is not safe (the duplicate name, the ignored command keys)', left.sort().join() === ['isda.sfgrDuplicateName', KEYMASK].sort().join() && before.length > left.length);
  check('fixAll: the edit turns the source into the result', apply(text, r.edit) === r.text);
  const again = Quick.fixAll(r.text);
  check('fixAll: a second run changes nothing', again.changed === false && again.applied.length === 0 && again.edit === null && again.text === r.text);
}
{
  const unsafe = src([
    S('9BAD', [[17, '20'], [28, 'Q']]),
    F('A', 3, 2, 5),
    F('B', 6, 2, 5)
  ]);
  const r = Quick.fixAll(unsafe);
  check('fixAll: no rename, no clearing to blank, no choice between two fixes (start 20 with a field past the last row)', r.changed === false && r.text === unsafe);
  const keys = src([S('F1', [[64, '12']])]);
  check('fixAll: the ignored keys of a key mask are left for the person to decide', Quick.fixAll(keys).changed === false);
  const dup = src([S('F1'), F('A', 2, 2, 5), S('F1'), F('B', 2, 2, 5)]);
  check('fixAll: a duplicate format name is not renamed (programs may refer to it)', Quick.fixAll(dup).changed === false);
  const one = src([S('F1', [[17, '30']]), F('A', 0, 2, 2000), F('B', 2, 2, 5)]);
  const ro = Quick.fixAll(one);
  const rl = linesOf(ro.text);
  const fa = Parser.parse(ro.text).entries.find((e) => e.line === 2).numbers;
  check('fixAll: numbers go to the end of the range they missed (start line 30 to 24, line 0 to 1, length 2000 to 1919)', ro.changed && rl[0] === S('F1', [[17, '24']]) && fa.line === 1 && fa.length === 1919 && fa.column === 2 && rl[2] === F('B', 2, 2, 5));
}
{
  const lines = [S('F1', [[27, 'y']]), F('A', 2, 2, 5), H('HELP0001'), H('HELP0002'), F('B', 3, 2, 5)];
  const text = src(lines, '\r\n');
  const r = Quick.fixAll(text);
  const out = r.text.split('\r\n');
  check('fixAll: two H specifications after a D are both moved up, in their own order, and the line end is CRLF throughout', out[0] === S('F1', [[27, 'Y']]) && out[1] === lines[2] && out[2] === lines[3] && out[3] === lines[1] && out[4] === lines[4] && !/[^\r]\n/.test(r.text));
  check('fixAll: nothing but the changed lines differ (the unchanged D lines are byte-identical)', out[3] === lines[1] && out[4] === lines[4]);
  const endless = [S('F1', [[27, 'y']]), F('A', 2, 2, 5)].join('\n');
  check('fixAll: a source with no final line end still has none', Quick.fixAll(endless).text === [S('F1', [[27, 'Y']]), F('A', 2, 2, 5)].join('\n'));
}
{
  const r = Quick.fixAll(sample);
  check('fixAll: the real sample has nothing to fix', r.changed === false && r.text === sample && r.edit === null);
  check('fixAll: junk input gives nothing and does not throw', [null, undefined, 42, {}, ''].every((x) => { const y = Quick.fixAll(x); return y.changed === false && y.applied.length === 0 && y.edit === null; }));
  const many = [S('F1')];
  for (let i = 0; i < 150; i++) many.push(F('F' + String(i).padStart(3, '0'), 1 + (i % 24), 2 + (i % 4) * 15, 10, [[23, 'y']]));
  const bigText = src(many);
  const big = Quick.fixAll(bigText, { budgetMs: Infinity });
  check('fixAll: 150 lowercase letters are all put right in one go, none left, nothing cut short', big.applied.length === 150 && withCode(big.text, VALUE).length === 0 && big.truncated === false);

  // a clock that moves 10 ms every time it is read: the budget of 35 ms lets exactly three fixes through
  const realNow = Date.now;
  let tick = 0;
  Date.now = () => (tick += 10);
  let part;
  try { part = Quick.fixAll(bigText, { budgetMs: 35 }); } finally { Date.now = realNow; }
  check('fixAll: past its time budget it stops, says so, and what it did is a valid source (three fixes)', part.truncated === true && part.applied.length === 3 && part.changed && withCode(part.text, VALUE).length === 147);
  const rest = Quick.fixAll(part.text, { budgetMs: Infinity });
  check('fixAll: running it again does the rest and ends where one full run ends', rest.applied.length === 147 && rest.truncated === false && rest.text === big.text);
  check('fixAll: a budget already spent does nothing', (() => { tick = 0; Date.now = () => (tick += 1000); try { const z = Quick.fixAll(bigText, { budgetMs: 10 }); return z.truncated === true && z.changed === false && z.applied.length === 0 && z.edit === null; } finally { Date.now = realNow; } })());

  // 500 lines on 96 places: hundreds of overlap warnings and not one fix; they must not cost a re-read each
  const crowded = [S('F1')];
  for (let i = 0; i < 500; i++) crowded.push(F('F' + String(i).padStart(3, '0'), 1 + (i % 24), 2 + (i % 4) * 15, 10));
  const t0 = realNow();
  const none = Quick.fixAll(src(crowded));
  const ms = realNow() - t0;
  check('fixAll: hundreds of problems that have no safe fix are not looked at one by one (' + problems(src(crowded)).length + ' problems, ' + ms + ' ms, loose ceiling 10 s)', none.changed === false && ms < 10000);
}

// ---- 6. the provider and the host ------------------------------------------------------------------------------------
console.log('\n6. provider and host');
{
  class Range { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } }
  class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } }
  class WorkspaceEdit { constructor() { this.edits = []; } replace(uri, range, text) { this.edits.push({ uri, range, text }); } }
  const Kind = vscodeMock.CodeActionKind.SourceFixAll.constructor;
  const api = { Range, CodeAction, WorkspaceEdit, CodeActionKind: vscodeMock.CodeActionKind };
  const text = src([S('F1', [[27, 'y']]), F('A', 2, 2, 5), H('HELP0001')]);
  const document = { getText: () => text, uri: { id: 'doc' } };
  let settings = { enable: true }, accept = true;
  const provider = Quick.createProvider(api, { getSettings: () => settings, shouldProvide: () => accept });
  const fixAllKind = vscodeMock.CodeActionKind.SourceFixAll.append('isda');
  check('provider: the fix-all kind is source.fixAll.isda', fixAllKind.value === 'source.fixAll.isda' && Quick.fixAllKind(api).value === 'source.fixAll.isda');

  const asked = provider.provideCodeActions(document, null, { diagnostics: [], only: vscodeMock.CodeActionKind.SourceFixAll });
  check('provider: a source.fixAll request gets one action of kind source.fixAll.isda with one edit over the changed lines', asked.length === 1 && asked[0].kind.value === 'source.fixAll.isda' && asked[0].edit.edits.length === 1 && /fix all safe problems/.test(asked[0].title) && /\(2\)/.test(asked[0].title));
  const e = asked[0].edit.edits[0];
  check('provider: the edit turns the source into the fixAll result', apply(text, { startLine: e.range.start.line, startCharacter: e.range.start.character, endLine: e.range.end.line, endCharacter: e.range.end.character, newText: e.text }) === Quick.fixAll(text).text);
  check('provider: the request for the kind itself, or for all source actions, is answered too', provider.provideCodeActions(document, null, { diagnostics: [], only: fixAllKind }).length === 1 && provider.provideCodeActions(document, null, { diagnostics: [], only: new Kind('source') }).length === 1);
  check('provider: a request for another source action is not', provider.provideCodeActions(document, null, { diagnostics: [], only: new Kind('source.organizeImports') }).length === 0);

  const diag = { source: 'iSDA', code: 'isda.sfgrValue', range: new Range(0, 26, 0, 27) };
  const plain = provider.provideCodeActions(document, null, { diagnostics: [diag] });
  check('provider: with no kind asked, the quick-fixes come as before and no fix-all', plain.length === 1 && plain[0].kind === 'quickfix');
  const qfOnly = provider.provideCodeActions(document, null, { diagnostics: [diag], only: 'quickfix' });
  check('provider: a quick-fix request gets the quick-fixes and no fix-all', qfOnly.length === 1 && qfOnly[0].kind === 'quickfix');
  const srcOnly = provider.provideCodeActions(document, null, { diagnostics: [diag], only: vscodeMock.CodeActionKind.SourceFixAll });
  check('provider: a source request gets the fix-all and no quick-fix', srcOnly.length === 1 && srcOnly[0].kind.value === 'source.fixAll.isda');

  const orderDiag = { source: 'iSDA', code: ORDER, range: new Range(2, 5, 2, 6) };
  const oa = provider.provideCodeActions(document, null, { diagnostics: [orderDiag] });
  check('provider: the order problem gets "Move the H specification up", preferred', oa.length === 1 && /Move the H specification up/.test(oa[0].title) && oa[0].isPreferred === true && oa[0].diagnostics[0] === orderDiag);
  const km = src([S('F1', [[64, '1']])]);
  const ka = provider.provideCodeActions({ getText: () => km, uri: {} }, null, { diagnostics: [{ source: 'iSDA', code: KEYMASK, range: new Range(0, 63, 0, 79) }] });
  check('provider: the key mask warning gets its fix', ka.length === 1 && /key mask/.test(ka[0].title) && ka[0].isPreferred === false);
  const oc = src([S('F1', [[17, '20']]), F('A', 6, 2, 5)]);
  const oa2 = provider.provideCodeActions({ getText: () => oc, uri: {} }, null, { diagnostics: [{ source: 'iSDA', code: OUTSIDE, range: new Range(1, 18, 1, 20) }] });
  check('provider: a field past the last row gets two actions and none is preferred', oa2.length === 2 && oa2.every((a) => a.isPreferred === false));
  check('provider: the overlap warning still has no fix', provider.provideCodeActions(document, null, { diagnostics: [{ source: 'iSDA', code: 'isda.sfgrOverlap', range: new Range(1, 14, 1, 22) }] }).length === 0);

  const clean = { getText: () => src([S('F1'), F('A', 2, 2, 5)]), uri: {} };
  check('provider: a source with nothing to fix gets no fix-all action', provider.provideCodeActions(clean, null, { diagnostics: [], only: vscodeMock.CodeActionKind.SourceFixAll }).length === 0);
  settings = { enable: false };
  check('provider: isda.quickFix.enable = false gives nothing, fix-all included', provider.provideCodeActions(document, null, { diagnostics: [diag], only: vscodeMock.CodeActionKind.SourceFixAll }).length === 0 && provider.provideCodeActions(document, null, { diagnostics: [diag] }).length === 0);
  settings = { enable: true }; accept = false;
  check('provider: a document that is not SFGR gets nothing, fix-all included', provider.provideCodeActions(document, null, { diagnostics: [diag], only: vscodeMock.CodeActionKind.SourceFixAll }).length === 0);
  const noApi = Quick.createProvider({ Range, CodeAction, WorkspaceEdit, CodeActionKind: { QuickFix: 'quickfix' } }, { getSettings: () => ({ enable: true }), shouldProvide: () => true });
  check('provider: an API without SourceFixAll still gives the quick-fixes', noApi.provideCodeActions(document, null, { diagnostics: [diag] }).length === 1 && noApi.provideCodeActions(document, null, { diagnostics: [], only: 'source.fixAll' }).length === 0);
}
{
  const ext = require(path.join(root, 'dist', 'extension.js'));
  const SFGR_TEXT = src([S('F1', [[27, 'y']]), F('A', 2, 2, 5), H('HELP0001')]);
  const mkDoc = (text, p) => {
    const lines = text.split(/\r?\n/);
    return { uri: new vscodeMock.Uri('file', p), fileName: p, languageId: 'dds', version: 1, getText: () => text, lineCount: lines.length, lineAt: (n) => ({ text: lines[typeof n === 'number' ? n : n.line] || '', lineNumber: typeof n === 'number' ? n : n.line }), positionAt: (o) => ({ line: 0, character: o }), offsetAt: () => 0, isUntitled: false };
  };
  ext.activate(vscodeMock.__mockExtensionContext());
  vscodeMock.__setLanguageMatch(() => 1);
  const kindsOf = (entry) => ((entry.metadata && entry.metadata.providedCodeActionKinds) || []).map((k) => (k && k.value) || String(k));
  const entry = vscodeMock.__registeredCodeActionProviders.find((x) => kindsOf(x).includes('source.fixAll.isda'));
  check('host: activate() registers one code action provider that offers quick-fixes and source.fixAll.isda', !!entry && kindsOf(entry).join() === 'quickfix,source.fixAll.isda');
  const onSfgr = entry.provider.provideCodeActions(mkDoc(SFGR_TEXT, '/w/T.dspf36'), null, { diagnostics: [], only: vscodeMock.CodeActionKind.SourceFixAll });
  check('host: on DSPF36 source a source.fixAll request is answered with the fixed text', onSfgr.length === 1 && onSfgr[0].edit.edits[0].newText.length > 0);
  const onDds = entry.provider.provideCodeActions(mkDoc('     A          R REC1\n     A            F1            10A  B  2  2', '/w/T.dspf'), null, { diagnostics: [], only: vscodeMock.CodeActionKind.SourceFixAll });
  check('host: on DDS source the SFGR fix-all stays silent', onDds.length === 0);
  vscodeMock.__setLanguageMatch(null);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const severitySetting = JSON.stringify(pkg.contributes.configuration.properties['isda.diagnostics.severity']);
  check('host: package.json lists every SFGR rule code in the severity setting, the two new ones too', Diagnostics.allCodes().every((c) => severitySetting.indexOf('"' + c + '"') >= 0));
  const build = pkg.scripts['build:webview-assets'];
  check('host: sfgrQuickFix.js and sfgrDiagnostics.js are in the build copy list', /'sfgrQuickFix\.js'/.test(build) && /'sfgrDiagnostics\.js'/.test(build));
}

process.exit(failureCount() === 0 ? 0 : 1);

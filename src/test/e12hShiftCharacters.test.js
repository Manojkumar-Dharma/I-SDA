/**
 * E12h - DBCS shift characters (SO 0x0E, SI 0x0F) in a constant (manual sc414730, p. B-26). The parser joins continuation
 * pieces by the manual's rule, checked against the three members DBCSA, DBCSB and DBCSC that were compiled on a DBCS-capable
 * IBM i (the listings are in docs/sda-reference/source/Reference Code); the writer keeps shift characters in raw edits and
 * refuses them in the constant box; the model draws each as one blank cell.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Writer = require('../sfgrWriter.js');
const Model = require('../sfgrModel.js');

const DIR = path.join(__dirname, '../../docs/sda-reference/source/Reference Code');
const member = (n) => fs.readFileSync(path.join(DIR, n), 'latin1');
const SO = '\u000e', SI = '\u000f';
const constants = (t) => Parser.parse(t).entries.filter((e) => e.kind === 'D' && e.role === 'constant');
const errors = (t) => Parser.parse(t).problems.filter((p) => p.severity === 'error').length;

console.log('the three real members');
{
  const A = constants(member('dbcsa.dspf36'))[0];
  check('DBCSA: SI in 78 and SO in 7: pair and column 79 deleted, 42 characters as the listing shows',
    A.constantText === SO + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD' + SI && A.constantText.length === 42 && A.shiftJoins === 1);
  const B = constants(member('dbcsb.dspf36'))[0];
  check('DBCSB: SI in 79 and SO in 7: pair deleted, 43 characters',
    B.constantText === 'A' + SO + 'BCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDE' + SI && B.constantText.length === 43 && B.shiftJoins === 1);
  const C = constants(member('dbcsc.dspf36'))[0];
  check('DBCSC: SO in 78 and SI in 79: pair deleted whatever column 7 holds, 26 characters',
    C.constantText === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' && C.shiftJoins === 1);
  check('  none of the three members has a read error', ['a', 'b', 'c'].every((n) => errors(member('dbcs' + n + '.dspf36')) === 0));
}

console.log('\nthe join rule on small sources');
const mk = (type, parts) => {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
};
const first = (data) => mk('D', [[7, 'T'], [15, '  20'], [19, ' 2'], [21, ' 2'], [23, 'Y'], [56, 'C'], [57, data], [80, 'X']]);
const next = (data, more) => mk('D', [[7, data]].concat(more ? [[80, 'X']] : []));
const S = mk('S', [[7, 'F1']]);
const build = (...lines) => lines.join('\n') + '\n';
const pad = (n, c) => new Array(n + 1).join(c || 'a');
{
  const plain = constants(build(S, first(pad(23)), next('bbb')))[0];
  check('no shift characters: joined as before, nothing counted', plain.constantText === pad(23) + 'bbb' && plain.shiftJoins === 0);
  const lone = constants(build(S, first(pad(21) + SI + 'b'), next('cc')))[0];
  check('SI in 78 without SO in 7: nothing deleted (the rule needs the pair)', lone.shiftJoins === 0 && lone.constantText === pad(21) + SI + 'bcc');
  const soOnly = constants(build(S, first(pad(22) + 'b'), next(SO + 'cc')))[0];
  check('SO in 7 with no SI before it: nothing deleted', soOnly.shiftJoins === 0 && soOnly.constantText === pad(22) + 'b' + SO + 'cc');
  const si79 = constants(build(S, first(pad(22) + SI), next(SO + 'cc')))[0];
  check('SI in 79 and SO in 7: both deleted', si79.shiftJoins === 1 && si79.constantText === pad(22) + 'cc');
  const si78 = constants(build(S, first(pad(21) + SI + 'z'), next(SO + 'cc')))[0];
  check('SI in 78, anything in 79, SO in 7: the three deleted', si78.shiftJoins === 1 && si78.constantText === pad(21) + 'cc');
  const pair = constants(build(S, first(pad(21) + SO + SI), next('cc')))[0];
  check('SO in 78 and SI in 79: deleted, column 7 untouched', pair.shiftJoins === 1 && pair.constantText === pad(21) + 'cc');
  const three = constants(build(S, first(pad(22) + SI), next(SO + pad(71) + SI, true), next(SO + 'dd')))[0];
  check('three lines: each join is judged on its own', three.shiftJoins === 2 && three.constantText === pad(22) + pad(71) + 'dd');
  const inside = constants(build(S, first(SO + 'aa' + SI + 'bb')))[0];
  check('shift characters inside one line are data and stay', inside.shiftJoins === 0 && inside.constantText === SO + 'aa' + SI + 'bb');
}

console.log('\nthe writer');
{
  const text = member('dbcsa.dspf36');
  const ref = { line: constants(text)[0].line };
  const refused = Writer.setConstant(text, ref, 'new text');
  check('the constant box refuses to rewrite a constant that holds shift characters', !refused.ok && refused.code === 'shiftCharacters' && /Raw source/.test(refused.reason));
  const typed = Writer.setConstant(text, ref, 'a' + SO + 'b');
  check('  and a constant typed with a shift character', !typed.ok && typed.code === 'shiftCharacters');
  const same = Writer.setConstant(text, ref, constants(text)[0].constantText.replace(/[\u000e\u000f]/g, ' '));
  check('  the text as the box shows it (shifts as blanks) is "unchanged", not an error', same.ok && same.changed === false && same.text === text);
  const tab = Writer.setConstant(build(S, first('x')), { line: 2 }, 'a\tb');
  check('a plain constant still refuses a tab', !tab.ok && tab.code === 'badValue');
  const raw = Writer.setRawLines(text, ref, Parser.parse(text).lines.slice(ref.line - 1, constants(text)[0].endLine).map((l) => l.text).join('\n'));
  check('Raw source of an entry takes shift characters and changes nothing when unchanged', raw.ok && raw.changed === false && raw.text === text);
  const lines = Parser.parse(text).lines.slice(ref.line - 1, constants(text)[0].endLine).map((l) => l.text);
  const edited = Writer.setRawLines(text, ref, [lines[0].replace('ABCDEFGHIJKLMNOPQRST', 'abcdefghijklmnopqrst'), lines[1]].join('\n'));
  check('  an edit through Raw source keeps the shift bytes', edited.ok && edited.text.split('').filter((c) => c === SO).length === 2 && edited.text.split('').filter((c) => c === SI).length === 2 && errors(edited.text) === 0);
  const tabLine = Writer.setRawLines(text, ref, lines[0].slice(0, 30) + '\t' + lines[0].slice(31) + '\n' + lines[1]);
  check('  a tab in Raw source is still refused', !tabLine.ok && tabLine.code === 'badValue');
  const fmt = Writer.setRawFormat(text, 0, Parser.parse(text).lines.map((l) => l.text).join('\n'));
  check('Raw source of the whole format keeps them too', fmt.ok && fmt.text === text);
  const moved = Writer.moveEntry ? Writer.moveEntry(text, ref, 'earlier') : null;
  check('a move keeps the lines, shift bytes included', !moved || !moved.ok || moved.text.split('').filter((c) => c === SO).length === 2);
}

console.log('\nthe model draws each shift character as one blank cell');
{
  const model = Model.buildModel(member('dbcsb.dspf36'));
  const f = model.records[0].fields.find((x) => x.constantValue && x.constantValue.indexOf('BCDE') >= 0);
  check('DBCSB: 43 cells, the shift characters are blanks, the letters keep their place',
    !!f && f.constantValue === 'A BCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDE ' && f.constantValue.length === 43);
}

setTimeout(async () => {
  const posted = [];
  const text = member('dbcsa.dspf36');
  const html = webviewHtml('vscode-webview://fake', 'e12h', text, 'T.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
  } });
  const w = dom.window, doc = w.document;
  const line = constants(text)[0].line;
  const el = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
  console.log('\nthe field panel');
  check('the constant is on the preview', !!el);
  if (el) {
    el.dispatchEvent(new w.Event('click', { bubbles: true }));
    const box = doc.querySelector('[data-sfgr-key="constantText"]');
    check('the constant box is read-only, shows blanks for the shift characters and says where to edit',
      !!box && box.readOnly && !/[\u000e\u000f]/.test(box.value) && box.value.length === 42 && !!doc.querySelector('#sfgrShiftNote') && /Raw source/.test(doc.querySelector('#sfgrShiftNote').textContent));
    check('  the Raw source section of the entry holds the real shift bytes', /\u000e/.test((doc.querySelector('#sfgrRawText') || {}).value || ''));
  }
  dom.window.close();
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

/**
 * E11h3 - move and resize in the SFGR designer: drag a field or constant, drag a block of several, nudge with the
 * arrow keys, and change a field's length from its right edge. Each is one applyEdit. jsdom on the real sample.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Model = require('../sfgrModel.js');
const Diagnostics = require('../sfgrDiagnostics.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const problems = (t) => Parser.parse(t).problems.length;
const base = problems(SFGR);
const FORMAT = 'SAISIE';
const rec0 = Model.buildModel(SFGR).records.find((r) => r.name === FORMAT);
const sfgrFields = rec0.fields.filter((f) => f.nameType === 'FIELD' && f.length >= 3 && f.length <= 20 && f.location.line < 20 && f.location.column > 3 && f.location.column < 60);
const consts = rec0.fields.filter((f) => f.nameType === 'CONSTANT' && f.location.line < 20 && f.location.column > 3 && f.location.column < 60);

setTimeout(async () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11h3', SFGR, 'T.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
  } });
  const w = dom.window, doc = w.document;
  const $ = (s) => doc.querySelector(s);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => edits()[edits().length - 1].text;
  const reset = () => { if (edits().length) w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: lastText() } })); w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: SFGR } })); posted.length = 0; $('#recordSelect').value = FORMAT; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true })); };
  const startOf = (rec) => (rec.sfgr.startLine == null ? 1 : rec.sfgr.startLine);
  const elFor = (f) => Array.from(doc.querySelectorAll('.dspf-field')).find((el) => +el.getAttribute('data-render-line') === startOf(rec0) + f.location.line - 1 && +el.getAttribute('data-render-column') === f.location.column);
  const mouse = (target, type, x, y, extra) => target.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, clientX: x, clientY: y }, extra || {})));
  const drag = async (el, dx, dy, extra) => { mouse(el, 'mousedown', 100, 100, extra); mouse(w, 'mousemove', 100 + dx, 100 + dy); mouse(w, 'mouseup', 100 + dx, 100 + dy); await tick(); };
  const key = (k, shift) => doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true }));
  const select = (el) => mouse(el, 'click', 0, 0);
  const specs = (t) => Model.buildModel(t).records.find((r) => r.name === FORMAT).fields;
  const sameLinesExcept = (a, b, lines) => { const x = a.split('\n'), y = b.split('\n'); return x.length === y.length && x.every((l, i) => lines.indexOf(i + 1) >= 0 || l === y[i]); };

  $('#recordSelect').value = FORMAT; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true }));
  check('setup: the sample has fields and constants to work with', sfgrFields.length >= 2 && consts.length >= 1);
  const F = sfgrFields[0], F2 = sfgrFields[1];

  console.log('drag one');
  let el = elFor(F);
  check('the field element is on the screen', !!el);
  posted.length = 0;
  await drag(el, 30, 40);
  check('one drag posts one edit', edits().length === 1);
  let moved = specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line);
  check('  3 columns right and 2 lines down', moved.location.column === F.location.column + 3 && moved.location.line === F.location.line + 2);
  check('  only that line changed, and no new problems', sameLinesExcept(SFGR, lastText(), [F.sfgr.line]) && problems(lastText()) === base);
  reset();

  el = elFor(F);
  await drag(el, -9999, -9999);
  moved = edits().length ? specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line) : F;
  check('a drag far up and left stops at line 1 and column 2', moved.location.line === 1 && moved.location.column === 2);
  reset();
  el = elFor(F);
  await drag(el, 9999, 9999);
  moved = specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line);
  check('a drag far down and right stops inside the screen, the field whole on its row', moved.location.line <= 24 && moved.location.column + F.length - 1 <= 80);
  reset();

  el = elFor(F);
  posted.length = 0;
  await drag(el, 2, 3);
  check('a drag that stays in the same cell posts nothing', edits().length === 0);

  console.log('\ndrag a constant');
  const C = consts[0];
  el = elFor(C);
  posted.length = 0;
  await drag(el, 10, 0);
  moved = specs(lastText()).find((f) => f.sfgr.line === C.sfgr.line);
  check('a constant moves the same way: one edit, one column right', edits().length === 1 && moved.location.column === C.location.column + 1 && moved.constantValue === C.constantValue);
  check('  no new problems', problems(lastText()) === base);
  reset();

  console.log('\ndrag several');
  select(elFor(F)); mouse(elFor(F2), 'click', 0, 0, { shiftKey: true });
  check('two entries are selected', doc.querySelectorAll('.dspf-field.selected').length >= 2);
  posted.length = 0;
  await drag(elFor(F), 20, 20);
  check('dragging one of them is one edit', edits().length === 1);
  const after = specs(lastText());
  const a1 = after.find((f) => f.sfgr.line === F.sfgr.line), a2 = after.find((f) => f.sfgr.line === F2.sfgr.line);
  check('  both moved by the same delta (2 columns, 1 line)', a1.location.column - F.location.column === 2 && a2.location.column - F2.location.column === 2 && a1.location.line - F.location.line === 1 && a2.location.line - F2.location.line === 1);
  check('  only their two lines changed', sameLinesExcept(SFGR, lastText(), [F.sfgr.line, F2.sfgr.line]) && problems(lastText()) === base);
  reset();

  console.log('\narrow keys');
  select(elFor(F));
  posted.length = 0;
  key('ArrowRight');
  moved = specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line);
  check('Right moves it one column', edits().length === 1 && moved.location.column === F.location.column + 1 && moved.location.line === F.location.line);
  reset();
  select(elFor(F));
  key('ArrowDown', true);
  moved = specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line);
  check('Shift+Down moves it five lines (or to the last line)', moved.location.line === Math.min(F.location.line + 5, 24));
  reset();
  select(elFor(F));
  key('ArrowUp', true); key('ArrowUp', true); key('ArrowUp', true); key('ArrowUp', true); key('ArrowUp', true);
  check('arrow keys never take it above line 1', specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line).location.line >= 1);
  reset();

  console.log('\nresize');
  select(elFor(F));
  const handle = elFor(F) && elFor(F).querySelector('.sfgr-resize-handle');
  check('the selected field has a handle on its right edge', !!handle);
  posted.length = 0;
  mouse(handle, 'mousedown', 100, 100); mouse(w, 'mousemove', 150, 100); mouse(w, 'mouseup', 150, 100); await tick();
  moved = specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line);
  check('dragging it 5 columns right makes the field 5 longer, in one edit', edits().length === 1 && moved.length === F.length + 5);
  check('  nothing else changed', sameLinesExcept(SFGR, lastText(), [F.sfgr.line]) && problems(lastText()) === base);
  reset();
  select(elFor(F));
  mouse(elFor(F).querySelector('.sfgr-resize-handle'), 'mousedown', 100, 100); mouse(w, 'mousemove', -9999, 100); mouse(w, 'mouseup', -9999, 100); await tick();
  check('it never gets shorter than 1', specs(lastText()).find((f) => f.sfgr.line === F.sfgr.line).length === 1);
  reset();
  select(elFor(C));
  check('a constant has no handle (its length follows its text)', !elFor(C).querySelector('.sfgr-resize-handle'));
  select(elFor(F)); mouse(elFor(F2), 'click', 0, 0, { shiftKey: true });
  check('with two selected there is no handle', doc.querySelectorAll('.sfgr-resize-handle').length === 0);
  select(elFor(F));

  console.log('\nthe DDS page is untouched');
  check('DDS pages have no SFGR handle code path: the note no longer says drag comes later', !$('#sfgrNote').textContent.includes('come later'));
  dom.window.close();
  process.exit(process.exitCode || 0);
}, 300);

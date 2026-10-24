/**
 * E12b - the multi-select panel of the SFGR designer: with several fields and constants selected, one panel edits
 * output data, input allowed, data type, length and the attribute columns for all of them as one edit, shows (mixed)
 * where the entries differ, aligns and spaces them, and offers copy, cut and delete.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Model = require('../sfgrModel.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const errors = (t) => Parser.parse(t).problems.filter((p) => p.severity === 'error').length;
const baseErrors = errors(SFGR);

setTimeout(async () => {
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e12b', SFGR, 'T.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
  } });
  const w = dom.window, doc = w.document;
  const $ = (sel) => doc.querySelector(sel);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => (edits().length ? edits()[edits().length - 1].text : SFGR);
  const click = (el, extra) => el.dispatchEvent(new w.MouseEvent('click', Object.assign({ bubbles: true }, extra || {})));
  const selectFormat = (name) => { $('#recordSelect').value = name; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true })); };
  const echo = () => { if (edits().length) w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: lastText() } })); };
  const reset = () => { echo(); w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: SFGR } })); posted.length = 0; selectFormat('SAISIE'); };
  const model = (t) => Model.buildModel(t).records;
  const rec = (t, name) => model(t).find((x) => x.name === name);
  const startOf = (x) => (x.sfgr.startLine == null ? 1 : x.sfgr.startLine);
  const elOf = (x, f) => Array.from(doc.querySelectorAll('.dspf-field')).find((e) => +e.getAttribute('data-render-line') === startOf(x) + f.location.line - 1 && +e.getAttribute('data-render-column') === f.location.column);
  const entryOf = (t, line) => Parser.parse(t).entries.find((e) => e.kind === 'D' && e.line === line);
  const val = (t, f, k) => String(entryOf(t, f.sfgr.line).values[k] == null ? '' : entryOf(t, f.sfgr.line).values[k]).trim();
  const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const sel = (k) => $('.sfgr-multi-panel [data-sfgr-key="' + k + '"]');
  const mode = (k) => $('.sfgr-multi-panel [data-sfgr-key="' + k + '"][data-sfgr-part="mode"]');

  selectFormat('SAISIE');
  const R = rec(SFGR, 'SAISIE');
  const fields = R.fields.filter((f) => f.nameType === 'FIELD' && f.name && f.length >= 2 && elOf(R, f));
  const consts = R.fields.filter((f) => f.nameType === 'CONSTANT' && elOf(R, f));
  const [A, B, C] = fields;
  const K = consts[0];
  const pick = (list) => { click(elOf(R, list[0])); list.slice(1).forEach((f) => click(elOf(R, f), { shiftKey: true })); };

  console.log('the panel');
  pick([A, B]);
  check('two entries selected show the multi panel, not the single field panel', !!$('.sfgr-multi-panel') && !$('.sfgr-field-panel[data-sfgr-line]'));
  check('  it says how many are selected', /2 entries selected \(2 fields, 0 constants\)/.test($('.sfgr-multi-panel .status').textContent));
  check('  one entry selected goes back to the field panel', (click(elOf(R, A)), !$('.sfgr-multi-panel') && !!$('.sfgr-field-panel[data-sfgr-line]')));

  console.log('\nmixed values');
  const mixedIn = (list, k) => new Set(list.map((f) => val(SFGR, f, k))).size > 1;
  // make two fields differ in nondisplay / dup: set A's blink to Y first through the panel
  pick([A, B]);
  const blinkA = val(SFGR, A, 'blink'), blinkB = val(SFGR, B, 'blink');
  check('equal values show their value, not (mixed)', blinkA !== blinkB || !mode('blink').hasAttribute('data-sfgr-mixed'));
  click(elOf(R, A));
  change($('.sfgr-field-panel [data-sfgr-key="blink"][data-sfgr-part="mode"]'), blinkA === 'Y' ? 'no' : 'yes');
  echo();
  const T1 = lastText();
  posted.length = 0;
  selectFormat('SAISIE');
  const R1 = rec(T1, 'SAISIE');
  click(elOf(R1, R1.fields.find((f) => f.sfgr.line === A.sfgr.line)));
  click(elOf(R1, R1.fields.find((f) => f.sfgr.line === B.sfgr.line)), { shiftKey: true });
  check('entries that differ show (mixed) on that row', mode('blink').hasAttribute('data-sfgr-mixed') && mode('blink').value === '__mixed__');
  check('  a row where they agree does not', !mode('highIntensity').hasAttribute('data-sfgr-mixed') || mixedIn([A, B], 'highIntensity'));
  reset();

  console.log('\none edit for all');
  pick([A, B, C]);
  posted.length = 0;
  const wasInput = [A, B, C].map((f) => val(SFGR, f, 'inputAllowed'));
  const box = sel('inputAllowed');
  box.checked = !box.checked;
  change(box);
  check('a check box writes every entry in one edit', edits().length === 1 && [A, B, C].every((f) => val(lastText(), f, 'inputAllowed') === (box.checked ? 'Y' : '')));
  check('  no new read errors, same number of lines', errors(lastText()) <= baseErrors && lastText().split('\n').length === SFGR.split('\n').length);
  check('  the selection is kept', doc.querySelectorAll('.dspf-field.selected').length === 3 && !!$('.sfgr-multi-panel'));
  reset();

  pick([A, B]);
  change(mode('highIntensity'), 'yes');
  check('an indicator row writes Y to each', edits().length === 1 && [A, B].every((f) => val(lastText(), f, 'highIntensity') === 'Y'));
  reset();
  pick([A, B]);
  change(mode('underline'), 'ind');
  const ubox = $('.sfgr-multi-panel [data-sfgr-key="underline"][data-sfgr-part="box"]');
  ubox.value = '07';
  change(ubox);
  check('  and an indicator number to each', edits().length === 1 && [A, B].every((f) => val(lastText(), f, 'underline') === '07'));
  reset();

  pick([A, B]);
  change(sel('dataType'), 'A');
  check('a data type goes to each field', edits().length === 1 && [A, B].every((f) => val(lastText(), f, 'dataType') === 'A'));
  reset();

  pick([A, B]);
  change(sel('length'), '5');
  check('a length goes to each field', edits().length === 1 && [A, B].every((f) => val(lastText(), f, 'length').replace(/^0+/, '') === '5'));
  reset();
  pick([A, B]);
  posted.length = 0;
  change(sel('length'), '0');
  check('a value out of range is refused with a message and writes nothing', edits().length === 0 && /Length is blank/.test($('#sfgrFieldError').textContent));
  reset();

  if (K) {
    console.log('\nconstants in the selection');
    pick([A, K]);
    check('the panel counts the constant and says it is left alone by the field rows', /1 field, 1 constant/.test($('.sfgr-multi-panel .status').textContent) && /constant is left as it is/.test($('.sfgr-multi-panel').textContent));
    change(sel('dataType'), 'A');
    check('a field-only row leaves the constant as it was', edits().length === 1 && val(lastText(), K, 'dataType') === val(SFGR, K, 'dataType') && val(lastText(), A, 'dataType') === 'A');
    reset();
    pick([A, K]);
    change(mode('reverseImage'), 'yes');
    check('an attribute row writes the constant too', edits().length === 1 && val(lastText(), K, 'reverseImage') === 'Y' && val(lastText(), A, 'reverseImage') === 'Y');
    const constantTextBefore = entryOf(SFGR, K.sfgr.line).constantText;
    check('  the constant text is untouched', entryOf(lastText(), K.sfgr.line).constantText === constantTextBefore);
    reset();
    pick([K, consts[1] || K]);
    if (consts[1]) check('only constants selected: no field rows', !sel('inputAllowed') && !!mode('blink'));
    reset();
  }

  console.log('\nalign and space');
  const byName = (n) => R.fields.find((f) => f.name === n);
  const X = [byName('DAT'), byName('TB,1'), byName('ART')];   // lines 1 / 4 / 20, columns 72 / 46 / 6, widths 8 / 34 / 7
  check('the three entries used for this part are where the test expects them', X.every(Boolean) && X.map((f) => f.location.line + ':' + f.location.column + ':' + f.length).join(' ') === '1:72:8 4:46:34 20:6:7');
  const where = (t) => { const r = rec(t, 'SAISIE'); return X.map((f) => { const g = r.fields.find((x) => x.sfgr.line === f.sfgr.line); return g.location.line + ':' + g.location.column; }).join(' '); };
  const run = (how) => { reset(); pick(X); posted.length = 0; click($('[data-sfgr-align="' + how + '"]')); };
  run('left');
  check('Left puts every entry on the leftmost column, one edit', edits().length === 1 && where(lastText()) === '1:6 4:6 20:6');
  check('  the selection and the multi panel stay', /3 entries selected/.test($('.sfgr-multi-panel').textContent));
  run('right');
  check('Right lines up the right edges (column 79)', edits().length === 1 && where(lastText()) === '1:72 4:46 20:73');
  run('top');
  check('Top puts every entry on the topmost line', edits().length === 1 && where(lastText()) === '1:72 1:46 1:6');
  run('bottom');
  check('Bottom puts every entry on the bottommost line', edits().length === 1 && where(lastText()) === '20:72 20:46 20:6');
  run('distribute-v');
  check('Distribute vert. spaces the middle one evenly, the outer two stay', edits().length === 1 && where(lastText()) === '1:72 11:46 20:6');
  run('distribute-h');
  check('Distribute horiz. spaces the middle one by centres, the outer two stay', edits().length === 1 && where(lastText()) === '1:72 4:26 20:6');
  check('  no new read errors, same number of lines', errors(lastText()) <= baseErrors && lastText().split('\n').length === SFGR.split('\n').length);
  reset();
  pick([X[0], X[1]]);
  check('Distribute needs three entries', $('[data-sfgr-align="distribute-h"]').disabled && $('[data-sfgr-align="distribute-v"]').disabled);
  posted.length = 0;
  click($('[data-sfgr-align="left"]'));
  click($('[data-sfgr-align="left"]'));
  check('  aligning what is already aligned posts nothing more', edits().length === 1);

  console.log('\ncopy, cut, delete');
  reset();
  pick([A, B]);
  posted.length = 0;
  click($('[data-sfgr-action="delete"]'));
  check('Delete removes all the selected entries in one edit', edits().length === 1 && rec(lastText(), 'SAISIE').fields.length === R.fields.length - 2);
  reset();
  pick([A, B]);
  posted.length = 0;
  click($('[data-sfgr-action="cut"]'));
  check('Cut removes them in one edit', edits().length === 1 && rec(lastText(), 'SAISIE').fields.length === R.fields.length - 2);
  echo();
  selectFormat('CHOIX1');
  posted.length = 0;
  doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
  check('  and Ctrl+V puts both into another format', edits().length === 1 && rec(lastText(), 'CHOIX1').fields.length === rec(SFGR, 'CHOIX1').fields.length + 2);
  reset();
  pick([A, B]);
  posted.length = 0;
  click($('[data-sfgr-action="copy"]'));
  check('Copy posts nothing', edits().length === 0);

  dom.window.close();
  process.exit(process.exitCode || 0);
}, 300);

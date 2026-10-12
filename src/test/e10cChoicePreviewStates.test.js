/**
 * e10cChoicePreviewStates.test.js
 *
 * Task E10c - the preview draws a choice in the state its CHCCTL control value gives
 * (0 available, 1 selected, 2 / 3 / 4 unavailable), with CHCAVAIL / CHCSLT / CHCUNAVAIL applied.
 *  1. keys and names
 *  2. no preview state: the markup as before (plus CHCAVAIL where present)
 *  3. selection field (radio and checkbox): selected, unavailable, 2 / 3 / 4 alike, colour keywords, conditions
 *  4. push button
 *  5. the webview: the selector, the redraw, the reset
 * Run with: node src/test/e10cChoicePreviewStates.test.js
 */
'use strict';
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

const rec = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' });
const fld = (kind) => buildLine({ seq: '00020', name: 'SEL', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '2', col: '2', func: kind });
const k = (seq, func, extra) => buildLine(Object.assign({ seq: String(seq).padStart(5, '0'), func }, extra || {}));
const ctl = buildLine({ seq: '00090', name: 'CTL1', length: '1', dataType: 'Y', decimals: '0', usage: 'H' });

function html(lines, states, indicators) {
  const model = DspfParser.parseDspf(lines.join('\n') + '\n');
  if (states) model.choicePreviewStates = states;
  return DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(model, 'SCR1', indicators || new Set()));
}
const rows = (h) => h.split('<div class="dspf-choice-row').slice(1).map((r) => '<div class="dspf-choice-row' + r.split('</div>')[0] + '</div>');
const radio = (extra) => [rec, fld('SNGCHCFLD'), k(30, "CHOICE(1 'Undo')"), k(40, "CHOICE(2 'Mark')"), k(50, 'CHCCTL(1 &CTL1)')].concat(extra || [], [ctl]);
const KEY = (id) => DspfEngine.choiceStateKey('SCR1', 'SEL', id);

console.log('=== 1. keys and names ===');
check('the key is record|field|number, case-insensitive', DspfEngine.choiceStateKey('scr1', 'sel', '1') === 'SCR1|SEL|1');
check('1 is selected, 2 - 4 unavailable, anything else available', DspfEngine.choiceStateName(1) === 'selected' && [2, 3, 4].every((v) => DspfEngine.choiceStateName(v) === 'unavailable') && DspfEngine.choiceStateName(0) === 'available' && DspfEngine.choiceStateName(9) === 'available');

console.log('=== 2. no preview state ===');
let r = rows(html(radio()));
check('the first single-choice entry is marked, the rest not (as before)', /\u25CF/.test(r[0]) && !/\u25CF/.test(r[1]));
check('nothing extra: no state class, no style', r.every((x) => !/dspf-choice-(unavailable|selected|colored)/.test(x) && !/style=/.test(x)));
r = rows(html(radio([k(60, 'CHCAVAIL((*COLOR YLW))')])));
check('CHCAVAIL colours an available choice', r.every((x) => /--dspf-fg:#ffe14d/.test(x) && /dspf-choice-colored/.test(x)));
r = rows(html([rec, fld('MLTCHCFLD'), k(30, "CHOICE(1 'A')"), k(40, "CHOICE(2 'B')"), ctl]));
check('a checkbox group has no box marked', r.every((x) => /\[ \]/.test(x)));
check('a state set for another field changes nothing', rows(html(radio(), { 'SCR1|OTHER|1': 3, 'OTH|SEL|1': 3 })).join() === rows(html(radio())).join());

console.log('=== 3. selection field ===');
r = rows(html(radio(), { [KEY(2)]: 1 }));
check('selected: the choice is marked, the others not', /\u25CF/.test(r[1]) && !/\u25CF/.test(r[0]) && /dspf-choice-selected/.test(r[1]));
r = rows(html(radio(), { [KEY(1)]: 3 }));
check('unavailable: class and the default blue', /dspf-choice-unavailable/.test(r[0]) && /--dspf-fg:#4a9eff/.test(r[0]) && !/dspf-choice-unavailable/.test(r[1]));
check('an unavailable choice is not marked', !/\u25CF/.test(r[0]));
check('2, 3 and 4 draw the same', html(radio(), { [KEY(1)]: 2 }) === html(radio(), { [KEY(1)]: 3 }) && html(radio(), { [KEY(1)]: 3 }) === html(radio(), { [KEY(1)]: 4 }));
r = rows(html(radio([k(60, 'CHCUNAVAIL((*COLOR RED) (*DSPATR UL))')]), { [KEY(1)]: 4 }));
check('CHCUNAVAIL colour and attribute apply', /--dspf-fg:#ff5c5c/.test(r[0]) && /dspf-underline/.test(r[0]));
r = rows(html(radio([k(60, 'CHCSLT((*COLOR YLW) (*DSPATR RI))')]), { [KEY(1)]: 1 }));
check('CHCSLT colour and attribute apply to a selected choice', /--dspf-fg:#ffe14d/.test(r[0]) && /dspf-reverse/.test(r[0]) && /dspf-choice-selected/.test(r[0]));
r = rows(html(radio([k(60, 'CHCSLT((*COLOR YLW))')]), { [KEY(1)]: 0 }));
check('value 0 is available and unmarked, and CHCSLT does not apply', !/\u25CF/.test(r[0]) && !/--dspf-fg/.test(r[0]));
r = rows(html(radio([k(60, 'CHCUNAVAIL((*COLOR RED))', { ind1: '10' })]), { [KEY(1)]: 2 }, new Set()));
check('a CHCUNAVAIL whose indicator is off falls back to the default colour', /--dspf-fg:#4a9eff/.test(r[0]));
r = rows(html(radio([k(60, 'CHCUNAVAIL((*COLOR RED))', { ind1: '10' })]), { [KEY(1)]: 2 }, new Set(['10'])));
check('with its indicator on, it applies', /--dspf-fg:#ff5c5c/.test(r[0]));
r = rows(html([rec, fld('MLTCHCFLD'), k(30, "CHOICE(1 'A')"), k(40, "CHOICE(2 'B')"), k(50, 'CHCCTL(1 &CTL1)'), ctl], { [KEY(1)]: 1 }));
check('a checkbox shows [X] for selected', /\[X\]/.test(r[0]) && /\[ \]/.test(r[1]));
r = rows(html(radio([k(60, 'CHCAVAIL((*DSPATR ND))')])));
check('ND hides the choice', r.every((x) => /dspf-choice-nd/.test(x)));

console.log('=== 4. push button ===');
const pb = (extra) => [rec, buildLine({ seq: '00020', name: 'BTN', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '2', col: '2', func: 'PSHBTNFLD' }),
  k(30, "PSHBTNCHC(1 'OK')"), k(40, "PSHBTNCHC(2 'Cancel')"), k(50, 'CHCCTL(1 &CTL1)')].concat(extra || [], [ctl]);
const btn = (h) => h.split('<button').slice(1).map((b) => '<button' + b.split('</button>')[0]);
const BK = (id) => DspfEngine.choiceStateKey('SCR1', 'BTN', id);
let b = btn(html(pb()));
check('no state: the buttons are as before', b.length === 2 && b.every((x) => !/dspf-choice-/.test(x)));
b = btn(html(pb(), { [BK(1)]: 2 }));
check('unavailable: that button only, default blue', /dspf-choice-unavailable/.test(b[0]) && /#4a9eff/.test(b[0]) && !/dspf-choice-unavailable/.test(b[1]));
b = btn(html(pb([k(60, 'CHCUNAVAIL((*COLOR PNK))')]), { [BK(2)]: 3 }));
check('CHCUNAVAIL colours it', /#ff6ec7/.test(b[1]) && !/#ff6ec7/.test(b[0]));
b = btn(html(pb(), { [BK(1)]: 1 }));
check('selected: its own class', /dspf-choice-selected/.test(b[0]));
b = btn(html(pb([k(60, 'CHCAVAIL((*COLOR RED))')])));
check('CHCAVAIL colours the available buttons', b.every((x) => /#ff5c5c/.test(x)));

console.log('=== 5. the webview ===');
const { leaseDspfPage } = require('./helpers/common');
const SRC = radio().join('\n') + '\n';
const dom = leaseDspfPage(SRC, 'E10C.DSPF');
setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const canvasRows = () => doc.querySelectorAll('.dspf-choice-row');
  const stateSelects = () => doc.querySelectorAll('select[data-choice-id]');
  const pick = () => Array.from(doc.querySelectorAll('.dspf-field')).find((e) => e.getAttribute('data-field') === 'SEL');
  check('the canvas draws the choices as before', canvasRows().length === 2 && /\u25CF/.test(canvasRows()[0].textContent));
  check('setup: the choice field is on the canvas', !!pick());
  pick().dispatchEvent(new w.Event('click', { bubbles: true }));
  const selects = Array.from(stateSelects()).filter((e) => /-chcstate/.test(e.className));
  check('selecting the field shows the preview-state selector for the choice that has a CHCCTL only', selects.length === 1 && selects[0].getAttribute('data-choice-id') === '1');
  if (selects.length === 1) {
    check('it offers default and the values 0 - 4', selects[0].options.length === 6 && selects[0].value === '');
    selects[0].value = '3';
    selects[0].dispatchEvent(new w.Event('change', { bubbles: true }));
    check('picking 3 draws choice 1 unavailable', /dspf-choice-unavailable/.test(canvasRows()[0].className) && !/dspf-choice-unavailable/.test(canvasRows()[1].className));
    pick().dispatchEvent(new w.Event('click', { bubbles: true }));
    const again = Array.from(stateSelects()).filter((e) => /-chcstate/.test(e.className))[0];
    check('the pick is kept when the panel is drawn again', !!again && again.value === '3');
    again.value = '';
    again.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('default clears it', !/dspf-choice-unavailable/.test(canvasRows()[0].className) && /\u25CF/.test(canvasRows()[0].textContent));
    again.value = '1';
    again.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'resetViewState', text: SRC } }));
  check('resetViewState puts the default back', canvasRows().length === 2 && !/dspf-choice-selected/.test(canvasRows()[0].className) && /\u25CF/.test(canvasRows()[0].textContent));
  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}, 0);

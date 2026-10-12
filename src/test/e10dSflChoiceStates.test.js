/**
 * e10dSflChoiceStates.test.js
 *
 * Task E10d - SFLCHCCTL: a selection-list subfile (SFLSNGCHC / SFLMLTCHC) previews each row in the state its
 * control value gives, one value per row.
 *  1. rows: available / selected / unavailable, colour keywords, 2 / 3 / 4 alike
 *  2. the selection indicator (*SLTIND only; radio for single, check box for multiple)
 *  3. what must not change (no control field, no list keyword, other record's states)
 *  4. the webview: the per-row selector, the redraw, the reset
 * Run with: node src/test/e10dSflChoiceStates.test.js
 */
'use strict';
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

const k = (seq, func, extra) => buildLine(Object.assign({ seq: String(seq).padStart(5, '0'), func }, extra || {}));
function src(opts) {
  const o = Object.assign({ list: 'SFLSNGCHC', ctl: true, extra: [] }, opts || {});
  return [
    buildLine({ seq: '00010', nameType: 'R', name: 'SFLRCD', func: 'SFL' }),
    o.ctl ? buildLine({ seq: '00020', name: 'CTLFLD', length: '1', dataType: 'Y', decimals: '0', usage: 'H', func: 'SFLCHCCTL' }) : buildLine({ seq: '00020', name: 'CTLFLD', length: '1', dataType: 'Y', decimals: '0', usage: 'H' }),
    buildLine({ seq: '00030', name: 'F1', length: '10', dataType: 'A', usage: 'O', line: '6', col: '10' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'SFLCTLRCD', func: 'SFLCTL(SFLRCD)' }),
    k(50, o.list ? o.list + (o.sltind ? '(*SLTIND)' : '') : 'SFLCLR'),
    k(60, 'SFLPAG(3) SFLSIZ(3)'), k(70, 'SFLDSP SFLDSPCTL'),
  ].concat(o.extra);
}
function rowsOf(lines, states, indicators) {
  const model = DspfParser.parseDspf(lines.join('\n') + '\n');
  if (states) model.choicePreviewStates = states;
  const html = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(model, 'SFLCTLRCD', indicators || new Set()));
  return html.split('<div class="dspf-field').filter((d) => /data-field="F1"/.test(d)).map((d) => '<div class="dspf-field' + d.split('>')[0] + '>');
}
const KEY = (row) => DspfEngine.choiceStateKey('SFLRCD', 'CTLFLD', row);

console.log('=== 1. rows ===');
let r = rowsOf(src());
check('three rows are drawn', r.length === 3);
check('no state set: nothing extra on any row', r.every((x) => !/dspf-choice-|data-choice-marker|--dspf-fg/.test(x)));
r = rowsOf(src(), { [KEY(2)]: 3, [KEY(3)]: 1 });
check('row 1 (no value) is available', !/dspf-choice-/.test(r[0]));
check('row 2 (3) is unavailable, in the default blue', /dspf-choice-unavailable/.test(r[1]) && /--dspf-fg:#4a9eff/.test(r[1]));
check('row 3 (1) is selected', /dspf-choice-selected/.test(r[2]));
check('2, 3 and 4 draw the same', JSON.stringify(rowsOf(src(), { [KEY(1)]: 2 })) === JSON.stringify(rowsOf(src(), { [KEY(1)]: 3 })) && JSON.stringify(rowsOf(src(), { [KEY(1)]: 3 })) === JSON.stringify(rowsOf(src(), { [KEY(1)]: 4 })));
r = rowsOf(src({ extra: [k(80, 'CHCUNAVAIL((*COLOR RED) (*DSPATR UL))'), k(81, 'CHCSLT((*COLOR YLW) (*DSPATR RI))'), k(82, 'CHCAVAIL((*COLOR TRQ))')] }), { [KEY(2)]: 2, [KEY(3)]: 1 });
check('CHCAVAIL colours an available row', /--dspf-fg:#4ee3d8|--dspf-fg:#[0-9a-f]{6}/.test(r[0]) && /--dspf-fg/.test(r[0]));
check('CHCUNAVAIL colour and attribute apply to an unavailable row', /--dspf-fg:#ff5c5c/.test(r[1]) && /dspf-underline/.test(r[1]));
check('CHCSLT colour and attribute apply to the selected row', /--dspf-fg:#ffe14d/.test(r[2]) && /dspf-reverse/.test(r[2]));
r = rowsOf(src({ list: 'SFLMLTCHC' }), { [KEY(1)]: 1, [KEY(2)]: 4 });
check('a multiple-choice list takes the same states', /dspf-choice-selected/.test(r[0]) && /dspf-choice-unavailable/.test(r[1]));

console.log('=== 2. the selection indicator ===');
r = rowsOf(src());
check('*NOSLTIND (the default): no indicator', r.every((x) => !/data-choice-marker/.test(x)));
r = rowsOf(src({ sltind: true }));
check('*SLTIND single choice: an empty radio button on every row', r.length === 3 && r.every((x) => /data-choice-marker="\( \)"/.test(x)));
r = rowsOf(src({ sltind: true }), { [KEY(2)]: 1 });
check('the selected row\'s radio button is marked, the others not', /data-choice-marker="\(\u25CF\)"/.test(r[1]) && /data-choice-marker="\( \)"/.test(r[0]) && /data-choice-marker="\( \)"/.test(r[2]));
r = rowsOf(src({ list: 'SFLMLTCHC', sltind: true }), { [KEY(1)]: 1 });
check('*SLTIND multiple choice: check boxes, [X] when selected', /data-choice-marker="\[X\]"/.test(r[0]) && /data-choice-marker="\[ \]"/.test(r[1]));
r = rowsOf(src({ sltind: true }), { [KEY(1)]: 3 });
check('an unavailable row is not marked', /data-choice-marker="\( \)"/.test(r[0]));

console.log('=== 3. what must not change ===');
const plain = rowsOf(src({ list: null }));
check('no list keyword: states are ignored', JSON.stringify(rowsOf(src({ list: null }), { [KEY(1)]: 3 })) === JSON.stringify(plain));
check('no SFLCHCCTL field: states are ignored', JSON.stringify(rowsOf(src({ ctl: false }), { [KEY(1)]: 3 })) === JSON.stringify(rowsOf(src({ ctl: false }))));
check('another record\'s / field\'s states change nothing', JSON.stringify(rowsOf(src(), { 'SFLRCD|OTHER|1': 3, 'OTH|CTLFLD|1': 3 })) === JSON.stringify(rowsOf(src())));
check('the hidden control field itself is not drawn', !/data-field="CTLFLD"/.test(DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(DspfParser.parseDspf(src().join('\n') + '\n'), 'SFLCTLRCD', new Set()))));

console.log('=== 4. the webview ===');
const { leaseDspfPage } = require('./helpers/common');
const SRC = src({ sltind: true }).join('\n') + '\n';
const dom = leaseDspfPage(SRC, 'E10D.DSPF');
setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const fieldEls = () => Array.from(doc.querySelectorAll('.dspf-field')).filter((e) => e.getAttribute('data-field') === 'F1');
  const rs = doc.getElementById('recordSelect');
  rs.value = 'SFLCTLRCD';
  rs.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('three rows are drawn, each with its radio button', fieldEls().length === 3 && fieldEls().every((e) => /^\( \)$/.test(e.getAttribute('data-choice-marker'))));
  const tab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
  check('setup: the SFLCTL tab is there', !!tab);
  if (tab) tab.dispatchEvent(new w.Event('click', { bubbles: true }));
  const sels = () => Array.from(doc.querySelectorAll('select[data-choice-id]')).filter((e) => /-sflchc-chcstate/.test(e.className));
  check('the panel has one selector per previewed row', sels().length === 3 && sels()[0].getAttribute('data-choice-id') === '1');
  if (sels().length === 3) {
    check('each offers default and 0 - 4', sels()[0].options.length === 6 && sels()[0].value === '');
    sels()[1].value = '2';
    sels()[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    check('picking 2 for row 2 draws that row unavailable only', /dspf-choice-unavailable/.test(fieldEls()[1].className) && !/dspf-choice-unavailable/.test(fieldEls()[0].className) && !/dspf-choice-unavailable/.test(fieldEls()[2].className));
    const again = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
    if (again) again.dispatchEvent(new w.Event('click', { bubbles: true }));
    check('the pick is kept when the panel is drawn again', sels().length === 3 && sels()[1].value === '2');
    sels()[0].value = '1';
    sels()[0].dispatchEvent(new w.Event('change', { bubbles: true }));
    check('picking 1 for row 1 marks its radio button', fieldEls()[0].getAttribute('data-choice-marker') === '(\u25CF)');
  }
  w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'resetViewState', text: SRC } }));
  rs.value = 'SFLCTLRCD';
  rs.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('resetViewState puts the default back', fieldEls().length === 3 && fieldEls().every((e) => !/dspf-choice-/.test(e.className) && /^\( \)$/.test(e.getAttribute('data-choice-marker'))));
  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}, 0);

/**
 * e10fStoredControlValue.test.js
 *
 * Task E10f - the CHCCTL / SFLCHCCTL control value is a design-time value in the E3f store, kept per file by the
 * extension host (workspaceState) and edited with the control-value selector; it is no longer a preview-only,
 * session-only choice.
 *  1. a selection field: the selector writes the store (and posts it), a stored value draws, default removes it
 *  2. a value loaded from the extension host is drawn and shown in the selector, and is listed in the simulator panel
 *  3. removing a value in the simulator panel puts the preview back
 *  4. a selection-list subfile (SFLCHCCTL): one stored value per row
 *  5. nothing is written to the DDS source; an invalid stored value is ignored
 *
 * Run with: node src/test/e10fStoredControlValue.test.js
 */
'use strict';

const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { leaseDspfPage } = require('./helpers/common');

const k = (seq, func, extra) => buildLine(Object.assign({ seq: String(seq).padStart(5, '0'), func }, extra || {}));
const FIELD_SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
  buildLine({ seq: '00020', name: 'SEL', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '2', col: '2', func: 'SNGCHCFLD' }),
  k(30, "CHOICE(1 'Undo')"), k(40, "CHOICE(2 'Mark')"), k(50, 'CHCCTL(1 &CTL1)'),
  buildLine({ seq: '00090', name: 'CTL1', length: '1', dataType: 'Y', decimals: '0', usage: 'H' }),
].join('\n') + '\n';

const SFL_SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'SFLRCD', func: 'SFL' }),
  buildLine({ seq: '00020', name: 'CTLFLD', length: '1', dataType: 'Y', decimals: '0', usage: 'H', func: 'SFLCHCCTL' }),
  buildLine({ seq: '00030', name: 'F1', length: '10', dataType: 'A', usage: 'O', line: '6', col: '10' }),
  buildLine({ seq: '00040', nameType: 'R', name: 'SFLCTLRCD', func: 'SFLCTL(SFLRCD)' }),
  k(50, 'SFLSNGCHC(*SLTIND)'), k(60, 'SFLPAG(3) SFLSIZ(3)'), k(70, 'SFLDSP SFLDSPCTL'),
].join('\n') + '\n';

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0));

(async () => {
  await tick(0);
  const posted = [];
  const dom = leaseDspfPage(FIELD_SRC, 'E10F.DSPF', { posted: posted });
  await tick(0);
  const w = dom.window;
  const doc = w.document;
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const msg = (data) => w.dispatchEvent(new w.MessageEvent('message', { data: data }));
  const saves = () => posted.filter((m) => m.type === 'saveSimulatorState');
  const lastSave = () => saves()[saves().length - 1];
  const canvasRows = () => doc.querySelectorAll('.dspf-choice-row');
  const pick = () => Array.from(doc.querySelectorAll('.dspf-field')).find((e) => e.getAttribute('data-field') === 'SEL');
  const stateSelect = () => Array.from(doc.querySelectorAll('select[data-choice-id]')).filter((e) => /-chcstate/.test(e.className))[0];
  const selectField = () => pick().dispatchEvent(new w.Event('click', { bubbles: true }));
  const simRows = () => Array.from(doc.getElementById('indicatorList').querySelectorAll('.sim-value-row'));

  console.log('=== 1. a selection field ===');
  check('setup: two choices drawn, none unavailable', canvasRows().length === 2 && !/dspf-choice-unavailable/.test(canvasRows()[0].className));
  check('nothing stored to start with', simRows().length === 0 && saves().length === 0);
  selectField();
  stateSelect().value = '3';
  fire(stateSelect(), 'change');
  check('picking 3 draws choice 1 unavailable, as before', /dspf-choice-unavailable/.test(canvasRows()[0].className) && !/dspf-choice-unavailable/.test(canvasRows()[1].className));
  check('and posts it to the extension host as a choice control value', saves().length === 1 && JSON.stringify(lastSave().values) === JSON.stringify({ choiceControl: { 'SCR1|SEL|1': 3 } }));
  check('the post carries the scenarios too (none)', Array.isArray(lastSave().scenarios) && lastSave().scenarios.length === 0);
  check('the simulator panel lists the stored value', simRows().length === 1 && /SCR1\.SEL \(choice \/ row 1\)/.test(simRows()[0].textContent) && /= 3/.test(simRows()[0].textContent));
  selectField();
  check('the pick is kept when the panel is drawn again', stateSelect().value === '3');
  stateSelect().value = '1';
  fire(stateSelect(), 'change');
  check('changing it replaces the stored value', JSON.stringify(lastSave().values) === JSON.stringify({ choiceControl: { 'SCR1|SEL|1': 1 } }) && /dspf-choice-selected/.test(canvasRows()[0].className));
  selectField();
  stateSelect().value = '';
  fire(stateSelect(), 'change');
  check('default removes the stored value and posts an empty store', JSON.stringify(lastSave().values) === '{}' && simRows().length === 0 && !/dspf-choice-(unavailable|selected)/.test(canvasRows()[0].className));
  check('0 is a stored value (it is not the same as default)', (() => { selectField(); stateSelect().value = '0'; fire(stateSelect(), 'change'); const ok = JSON.stringify(lastSave().values) === JSON.stringify({ choiceControl: { 'SCR1|SEL|1': 0 } }); selectField(); return ok && stateSelect().value === '0'; })());
  stateSelect().value = '';
  fire(stateSelect(), 'change');

  console.log('=== 2. a value loaded from the extension host ===');
  const n = saves().length;
  msg({ type: 'simulatorState', scenarios: [], values: { choiceControl: { 'SCR1|SEL|2': 4 } } });
  check('the stored value is drawn on load: choice 2 unavailable', /dspf-choice-unavailable/.test(canvasRows()[1].className) && !/dspf-choice-unavailable/.test(canvasRows()[0].className));
  check('loading posts nothing back', saves().length === n);
  selectField();
  const sel2 = Array.from(doc.querySelectorAll('select[data-choice-id]')).filter((e) => /-chcstate/.test(e.className))[0];
  check('the selector shows the stored value for its choice', !!sel2 && sel2.getAttribute('data-choice-id') === '1' && sel2.value === '');
  msg({ type: 'simulatorState', scenarios: [], values: { choiceControl: { 'SCR1|SEL|1': 3, 'SCR1|SEL|2': 4 } } });
  selectField();
  check('after a reload with a value for choice 1 the selector shows it', stateSelect().value === '3' && /dspf-choice-unavailable/.test(canvasRows()[0].className));
  check('an invalid stored value is ignored', (() => { msg({ type: 'simulatorState', scenarios: [], values: { choiceControl: { 'SCR1|SEL|1': 9, 'SCR1|SEL|2': 'x' } } }); return canvasRows().length === 2 && !/dspf-choice-unavailable/.test(canvasRows()[0].className) && simRows().length === 0; })());

  console.log('=== 3. removing it in the simulator panel ===');
  msg({ type: 'simulatorState', scenarios: [], values: { choiceControl: { 'SCR1|SEL|1': 3 } } });
  check('setup: choice 1 is unavailable', /dspf-choice-unavailable/.test(canvasRows()[0].className) && simRows().length === 1);
  simRows()[0].querySelector('.sim-value-remove').click();
  check('removing the row puts the preview back and posts the store without it', !/dspf-choice-unavailable/.test(canvasRows()[0].className) && JSON.stringify(lastSave().values) === '{}');
  check('the DDS source was never edited', posted.filter((m) => m.type === 'applyEdit').length === 0);

  console.log('=== 4. a selection-list subfile ===');
  const posted2 = [];
  const dom2 = leaseDspfPage(SFL_SRC, 'E10F2.DSPF', { posted: posted2 });
  await tick(0);
  const w2 = dom2.window;
  const doc2 = w2.document;
  const fire2 = (el, type) => el.dispatchEvent(new w2.Event(type, { bubbles: true }));
  const rs = doc2.getElementById('recordSelect');
  rs.value = 'SFLCTLRCD';
  fire2(rs, 'change');
  const fieldEls = () => Array.from(doc2.querySelectorAll('.dspf-field')).filter((e) => e.getAttribute('data-field') === 'F1');
  check('setup: three rows, none unavailable', fieldEls().length === 3 && fieldEls().every((e) => !/dspf-choice-unavailable/.test(e.className)));
  w2.dispatchEvent(new w2.MessageEvent('message', { data: { type: 'simulatorState', scenarios: [], values: { choiceControl: { 'SFLRCD|CTLFLD|2': 2, 'SFLRCD|CTLFLD|3': 1 } } } }));
  check('stored per-row values draw: row 2 unavailable, row 3 selected', /dspf-choice-unavailable/.test(fieldEls()[1].className) && fieldEls()[2].getAttribute('data-choice-marker') === '(●)' && !/dspf-choice-unavailable/.test(fieldEls()[0].className));
  const simRows2 = () => Array.from(doc2.getElementById('indicatorList').querySelectorAll('.sim-value-row'));
  check('the simulator panel lists both rows', simRows2().length === 2 && /SFLRCD\.CTLFLD \(choice \/ row 2\)/.test(simRows2()[0].textContent));
  const tab = Array.from(doc2.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
  if (tab) tab.dispatchEvent(new w2.Event('click', { bubbles: true }));
  const sels = () => Array.from(doc2.querySelectorAll('select[data-choice-id]')).filter((e) => /-sflchc-chcstate/.test(e.className));
  check('the per-row selectors show the stored values', sels().length === 3 && sels()[0].value === '' && sels()[1].value === '2' && sels()[2].value === '1');
  sels()[0].value = '4';
  fire2(sels()[0], 'change');
  const lastSave2 = posted2.filter((m) => m.type === 'saveSimulatorState').pop();
  check('picking a value for row 1 stores it with the others', !!lastSave2 && Object.keys(lastSave2.values.choiceControl).sort().map((key) => key + '=' + lastSave2.values.choiceControl[key]).join() === 'SFLRCD|CTLFLD|1=4,SFLRCD|CTLFLD|2=2,SFLRCD|CTLFLD|3=1' && /dspf-choice-unavailable/.test(fieldEls()[0].className));
  doc2.getElementById('indicatorList').querySelector('.sim-values-clear').click();
  check('clearing all stored values puts every row back', fieldEls().every((e) => !/dspf-choice-/.test(e.className)) && posted2.filter((m) => m.type === 'saveSimulatorState').pop().values && JSON.stringify(posted2.filter((m) => m.type === 'saveSimulatorState').pop().values) === '{}');

  console.log('=== 5. reset ===');
  w2.dispatchEvent(new w2.MessageEvent('message', { data: { type: 'simulatorState', scenarios: [], values: { choiceControl: { 'SFLRCD|CTLFLD|1': 2 } } } }));
  w2.dispatchEvent(new w2.MessageEvent('message', { data: { type: 'resetViewState', text: SFL_SRC } }));
  rs.value = 'SFLCTLRCD';
  fire2(rs, 'change');
  check('resetViewState drops the stored values from the page', fieldEls().length === 3 && fieldEls().every((e) => !/dspf-choice-/.test(e.className)) && simRows2().length === 0);

  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
})();

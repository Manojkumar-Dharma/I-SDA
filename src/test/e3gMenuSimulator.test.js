/**
 * e3gMenuSimulator.test.js
 *
 * Task E3g - the indicator simulator panel in the menu designer. A menu's option rows are DDS constants and carry
 * option indicators, so the preview is drawn under the indicators switched on in the panel.
 *  1. the preview follows the indicators (before: always every indicator off)
 *  2. the list: INDTXT labels, scope (this screen / whole file), show all 99
 *  3. scenarios: save, apply, overwrite, rename, delete, the messages
 *  4. what is posted to the extension host, and what a 'simulatorState' message loads
 *  5. the stored run-time values editor (values written by the DSPF designer are listed here too)
 *  6. the DDS source is never written by the panel; the Options list is unchanged
 *  7. the extension host handles the two messages for the menu designer
 *
 * Run with: node src/test/e3gMenuSimulator.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, menuWebviewHtml } = require('./helpers/common');

const src = [
  buildLine({ seq: '00010', nameType: 'R', name: 'MENU1' }),
  buildLine({ seq: '00011', func: "INDTXT(10 'Month end open')" }),
  buildLine({ seq: '00012', func: "INDTXT(30 'Cust <b> on hold')" }),
  buildLine({ seq: '00020', line: '1', col: '2', func: "'MAIN MENU'" }),
  buildLine({ seq: '00030', line: '4', col: '5', func: "'1. Work with orders'" }),
  buildLine({ seq: '00040', ind1: '10', line: '5', col: '5', func: "'2. Close month'" }),
  buildLine({ seq: '00050', ind1: 'N10', line: '5', col: '5', func: "'2. Close month (locked)'" }),
  buildLine({ seq: '00060', ind1: '30', line: '6', col: '5', func: "'3. Hold report'" }),
  buildLine({ seq: '00070', nameType: 'R', name: 'MENU2' }),
  buildLine({ seq: '00080', ind1: '44', line: '3', col: '5', func: "'Second screen only'" }),
].join('\n') + '\n';

const posted = [];
const html = menuWebviewHtml('vscode-webview://fake', 'testnonce', src, '0001 WRKORD\n', 'E3GMENU.MNUDDS', 'E3GMENUQQ.MNUCMD', 'loaded');
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
  },
});

setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const panel = () => doc.getElementById('indicatorList');
  const screenText = () => doc.getElementById('screenOutput').textContent;
  const nums = () => Array.from(panel().querySelectorAll('.sim-ind-list label')).map((l) => l.querySelector('span').textContent.replace('Ind ', ''));
  const rowFor = (n) => Array.from(panel().querySelectorAll('.sim-ind-list label')).find((l) => l.querySelector('span').textContent === 'Ind ' + n);
  const toggle = (n, on) => { const box = rowFor(n).querySelector('input'); box.checked = on; fire(box, 'change'); };
  const checkedNums = () => Array.from(panel().querySelectorAll('.sim-ind-list label')).filter((l) => l.querySelector('input').checked).map((l) => l.querySelector('span').textContent.replace('Ind ', ''));
  const saves = () => posted.filter((m) => m.type === 'saveSimulatorState');
  const lastSave = () => saves()[saves().length - 1];
  const msg = (data) => w.dispatchEvent(new w.MessageEvent('message', { data: data }));
  const scn = () => panel().querySelector('.sim-scn-select');
  const edits = () => posted.filter((m) => m.type === 'applyEdit').length;

  console.log('=== 1. the preview follows the indicators ===');
  check('setup: the panel exists in the left panel', !!panel() && !!doc.getElementById('indicatorSimToggle'));
  check('the page announced itself', posted.some((m) => m.type === 'ready'));
  check('no indicator on: the N10 option text is drawn', screenText().indexOf('2. Close month (locked)') !== -1);
  check('no indicator on: the indicator-10 option text is not drawn', screenText().replace('2. Close month (locked)', '').indexOf('2. Close month') === -1);
  check('no indicator on: the indicator-30 option is not drawn', screenText().indexOf('3. Hold report') === -1);
  check('the unconditioned option is always drawn', screenText().indexOf('1. Work with orders') !== -1);
  toggle('10', true);
  check('10 on: the indicator-10 text replaces the N10 text', screenText().indexOf('2. Close month') !== -1 && screenText().indexOf('(locked)') === -1);
  check('10 on: its checkbox stays ticked after the redraw', checkedNums().join() === '10');
  toggle('30', true);
  check('30 on too: the hold report appears', screenText().indexOf('3. Hold report') !== -1 && checkedNums().join() === '10,30');
  toggle('10', false);
  toggle('30', false);
  check('both off again: back to the all-off screen', screenText().indexOf('(locked)') !== -1 && screenText().indexOf('3. Hold report') === -1);

  console.log('=== 2. the list ===');
  check('this screen: the previewed record\'s indicators', nums().join() === '10,30');
  const row10 = rowFor('10');
  check('an INDTXT label is shown beside its indicator', !!row10.querySelector('.ind-text') && row10.querySelector('.ind-text').textContent === 'Month end open');
  const row30 = rowFor('30');
  check('a label with markup is escaped, not interpreted', row30.querySelector('.ind-text').textContent === 'Cust <b> on hold' && !row30.querySelector('.ind-text b'));
  panel().querySelector('.sim-scope').value = 'file';
  fire(panel().querySelector('.sim-scope'), 'change');
  check('whole file: every indicator the file uses', nums().join() === '10,30,44');
  panel().querySelector('.sim-scope').value = 'screen';
  fire(panel().querySelector('.sim-scope'), 'change');
  const showAll = () => panel().querySelector('.sim-showall');
  showAll().checked = true;
  fire(showAll(), 'change');
  check('show all 99: ninety-nine rows, the unused ones dimmed', nums().length === 99 && rowFor('44').style.opacity === '0.55' && rowFor('10').style.opacity !== '0.55');
  showAll().checked = false;
  fire(showAll(), 'change');
  check('show all off: back to the used ones', nums().join() === '10,30');

  console.log('=== 2b. switching record keeps the indicators ===');
  toggle('10', true);
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'MENU2';
  fire(recordSelect, 'change');
  check('MENU2: its own indicator is listed', nums().join() === '44');
  check('MENU2: the second-screen text is not drawn while 44 is off', screenText().indexOf('Second screen only') === -1);
  toggle('44', true);
  check('MENU2: 44 on draws it', screenText().indexOf('Second screen only') !== -1);
  recordSelect.value = 'MENU1';
  fire(recordSelect, 'change');
  check('back on MENU1: 10 and 44 are both still on', screenText().indexOf('(locked)') === -1 && screenText().indexOf('2. Close month') !== -1);
  panel().querySelector('.sim-scope').value = 'file';
  fire(panel().querySelector('.sim-scope'), 'change');
  check('whole file lists the ticked ones as ticked', checkedNums().join() === '10,44');
  toggle('44', false);
  panel().querySelector('.sim-scope').value = 'screen';
  fire(panel().querySelector('.sim-scope'), 'change');
  toggle('10', false);

  console.log('=== 3. scenarios ===');
  check('no scenario yet, Rename and Delete disabled', scn().options.length === 1 && panel().querySelector('.sim-scn-rename').disabled && panel().querySelector('.sim-scn-delete').disabled);
  toggle('10', true);
  panel().querySelector('.sim-scn-name').value = 'Month end';
  fire(panel().querySelector('.sim-scn-save'), 'click');
  check('Save stores the ticked indicators under the name', scn().options.length === 2 && scn().value === 'Month end' && /Month end \(1\)/.test(scn().options[1].textContent));
  check('Save posts the scenarios to the host', !!lastSave() && JSON.stringify(lastSave().scenarios) === JSON.stringify([{ name: 'Month end', indicators: ['10'] }]));
  toggle('30', true);
  panel().querySelector('.sim-scn-name').value = 'Both';
  fire(panel().querySelector('.sim-scn-save'), 'click');
  check('a second scenario', scn().options.length === 3 && lastSave().scenarios.length === 2);
  toggle('10', false);
  toggle('30', false);
  check('everything off', checkedNums().length === 0 && screenText().indexOf('(locked)') !== -1);
  scn().value = 'Both';
  fire(scn(), 'change');
  check('choosing a scenario turns exactly its indicators on', checkedNums().join() === '10,30' && screenText().indexOf('3. Hold report') !== -1 && screenText().indexOf('(locked)') === -1);
  scn().value = 'Month end';
  fire(scn(), 'change');
  check('choosing another replaces the set', checkedNums().join() === '10' && screenText().indexOf('3. Hold report') === -1);
  check('choosing a scenario posts nothing (it is not a change to what is stored)', saves().length === 2);
  panel().querySelector('.sim-scn-name').value = 'month END';
  fire(panel().querySelector('.sim-scn-rename'), 'click');
  check('renaming to the same name in another case is allowed on itself', scn().options.length === 3 && scn().value === 'month END');
  panel().querySelector('.sim-scn-name').value = 'Both';
  fire(panel().querySelector('.sim-scn-rename'), 'click');
  check('renaming onto another scenario is refused with a message', panel().querySelector('.sim-scn-msg').textContent !== '' && scn().options.length === 3);
  panel().querySelector('.sim-scn-name').value = 'Both';
  scn().value = 'Both';
  fire(scn(), 'change');
  toggle('30', false);
  fire(panel().querySelector('.sim-scn-save'), 'click');
  check('saving over an existing name overwrites it in place', scn().options.length === 3 && JSON.stringify(lastSave().scenarios.find((s) => s.name === 'Both').indicators) === JSON.stringify(['10']));
  fire(panel().querySelector('.sim-scn-delete'), 'click');
  const confirmBtn = doc.querySelector('.confirm-dialog-confirm');
  check('Delete asks for confirmation', !!confirmBtn);
  const before = saves().length;
  fire(confirmBtn, 'click');
  check('confirmed: the scenario is gone and the host is told', scn().options.length === 2 && saves().length === before + 1 && lastSave().scenarios.length === 1);

  console.log('=== 4. what a simulatorState message loads ===');
  const n = saves().length;
  msg({ type: 'simulatorState', scenarios: [{ name: 'From disk', indicators: ['30', '1'] }, { name: 'from DISK', indicators: [] }, 'junk'], values: { choiceControl: { 'MENU1|SEL|1': 3, bad: 1 } } });
  check('scenarios are normalised: duplicates and junk dropped', scn().options.length === 2 && scn().options[1].textContent.indexOf('From disk') === 0);
  check('the loaded indicators are normalised (1 becomes 01)', /\(2\)/.test(scn().options[1].textContent));
  check('loading posts nothing back', saves().length === n);
  scn().value = 'From disk';
  fire(scn(), 'change');
  check('applying the loaded one draws the screen', checkedNums().join() === '30' && screenText().indexOf('3. Hold report') !== -1);
  toggle('30', false);

  console.log('=== 5. stored run-time values ===');
  const rowsOf = () => Array.from(panel().querySelectorAll('.sim-value-row'));
  check('a value written by the DSPF designer is listed here', rowsOf().length === 1 && /MENU1/.test(rowsOf()[0].textContent) && /3/.test(rowsOf()[0].textContent));
  msg({ type: 'simulatorState', scenarios: [], values: { choiceControl: { 'MENU1|SEL|2': 3, 'MENU1|SEL|1': 1, BAD: 1 } } });
  check('invalid keys are dropped, valid ones listed', rowsOf().length === 2);
  const m = saves().length;
  rowsOf()[0].querySelector('.sim-value-remove').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('removing one posts the store without it', saves().length === m + 1 && rowsOf().length === 1 && Object.keys(lastSave().values.choiceControl || {}).length === 1);
  panel().querySelector('.sim-values-clear').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('Clear all empties the store and the editor disappears', rowsOf().length === 0 && !panel().querySelector('.sim-values') && saves().length === m + 2);

  console.log('=== 6. nothing written to the source, Options list unchanged ===');
  check('no edit was posted by any panel action', edits() === 0);
  const rows = Array.from(doc.querySelectorAll('.option-row'));
  check('the Options list still shows one row per option number (3 of them)', rows.length === 3);
  const toggleBtn = doc.getElementById('indicatorSimToggle');
  toggle('10', true);
  fire(toggleBtn, 'click');
  check('collapsing hides the panel', panel().classList.contains('hidden') && panel().innerHTML === '');
  check('collapsed: the screen is still drawn under the ticked indicator', screenText().indexOf('(locked)') === -1 && screenText().indexOf('2. Close month') !== -1);
  fire(toggleBtn, 'click');
  check('expanding shows it again with 10 ticked', !panel().classList.contains('hidden') && checkedNums().join() === '10');
  toggle('10', false);

  console.log('=== 7. the extension host ===');
  const host = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
  const menuProvider = host.slice(host.indexOf('class MenuDesignerEditorProvider') >= 0 ? host.indexOf('class MenuDesignerEditorProvider') : host.indexOf('setUiTheme', host.indexOf('applyMenuCmdOptionEdit')));
  check('the menu designer handler saves the simulator state', /saveSimulatorState[\s\S]*saveFileState\(this\.context\.workspaceState, document\.uri\.toString\(\)/.test(menuProvider));
  check('it posts the file\'s state when the page is ready', /type === 'ready'[\s\S]{0,400}loadFileState\(this\.context\.workspaceState, document\.uri\.toString\(\)\)[\s\S]{0,300}type: 'simulatorState'/.test(menuProvider));
  const roadmap = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/FEATURE-ROADMAP.md'), 'utf8');
  check('the roadmap has an E3g results section', /### E3g results/.test(roadmap));

  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}, 50);

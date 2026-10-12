/**
 * e3SimulatorPanel.test.js
 *
 * Tasks E3b / E3c / E3f - the indicator simulator panel in the designer (aside list and the toolbar copy).
 *  1. the list: INDTXT labels, scope (this screen / whole file), show all 99
 *  2. scenarios: save, apply, overwrite, rename, delete, the messages
 *  3. what is posted to the extension host, and what a 'simulatorState' message loads
 *  4. the stored run-time values editor
 *  5. reset
 *
 * Run with: node src/test/e3SimulatorPanel.test.js
 */
'use strict';

const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { leaseDspfPage } = require('./helpers/common');

const src = [
  buildLine({ seq: '00005', ind1: '71', func: 'CA03(03)' }),
  buildLine({ seq: '00006', func: "INDTXT(71 'Exit requested')" }),
  buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
  buildLine({ seq: '00020', ind1: '51', func: 'ALARM' }),
  buildLine({ seq: '00021', func: "INDTXT(51 'Customer on hold <b>')" }),
  buildLine({ seq: '00030', ind1: '52', name: 'NAME', dataType: 'A', length: '10', usage: 'B', line: '4', col: '5' }),
  buildLine({ seq: '00040', nameType: 'R', name: 'SCR2' }),
  buildLine({ seq: '00050', name: 'OTHER', dataType: 'A', length: '5', usage: 'O', line: '1', col: '1' }),
  buildLine({ seq: '00051', ind1: '54', func: 'DSPATR(RI)' }),
].join('\n') + '\n';

const posted = [];
const dom = leaseDspfPage(src, 'E3PANEL.DSPF', { posted: posted });

setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const aside = () => doc.getElementById('indicatorList');
  const toolbar = () => doc.getElementById('toolbarIndicatorList');
  const nums = (c) => Array.from(c.querySelectorAll('.sim-ind-list label')).map((l) => l.querySelector('span').textContent.replace('Ind ', ''));
  const checkedNums = (c) => Array.from(c.querySelectorAll('.sim-ind-list label')).filter((l) => l.querySelector('input').checked).map((l) => l.querySelector('span').textContent.replace('Ind ', ''));
  const saves = () => posted.filter((m) => m.type === 'saveSimulatorState');
  const lastSave = () => saves()[saves().length - 1];
  const msg = (data) => w.dispatchEvent(new w.MessageEvent('message', { data: data }));
  const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0));

  (async () => {
    console.log('=== 1. the list ===');
    check('setup: both copies exist', !!aside() && !!toolbar());
    check('this screen: the previewed record\'s indicators plus the file-level one', nums(aside()).join() === '51,52,71');
    check('the toolbar copy lists the same', nums(toolbar()).join() === '51,52,71');
    const row51 = Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 51'));
    check('an INDTXT label is shown beside its indicator, escaped', !!row51.querySelector('.ind-text') && row51.querySelector('.ind-text').textContent === 'Customer on hold <b>' && !row51.querySelector('.ind-text b'));
    const row52 = Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 52'));
    check('an indicator without INDTXT shows no label', !row52.querySelector('.ind-text'));
    check('the indicator is still its own "Ind NN" span', Array.from(aside().querySelectorAll('span')).map((s) => s.textContent.trim()).includes('Ind 51'));

    aside().querySelector('.sim-scope').value = 'file';
    fire(aside().querySelector('.sim-scope'), 'change');
    check('whole file: every indicator the file uses', nums(aside()).join() === '51,52,54,71');
    check('whole file: the toolbar copy follows', nums(toolbar()).join() === '51,52,54,71' && toolbar().querySelector('.sim-scope').value === 'file');
    aside().querySelector('.sim-scope').value = 'screen';
    fire(aside().querySelector('.sim-scope'), 'change');
    check('back to this screen', nums(aside()).join() === '51,52,71');

    const showAll = () => aside().querySelector('.sim-showall');
    showAll().checked = true;
    fire(showAll(), 'change');
    check('show all 99: ninety-nine rows', nums(aside()).length === 99 && nums(toolbar()).length === 99 && toolbar().querySelector('.sim-showall').checked);
    const unused = Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 54'));
    const used = Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 51'));
    check('show all: a row the screen does not use is dimmed, a used one is not', /opacity:\s*0\.55/.test(unused.style.cssText) && !/opacity:\s*0\.55/.test(used.style.cssText));
    Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 54')).querySelector('input').checked = true;
    fire(Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 54')).querySelector('input'), 'change');
    check('an unused indicator can be turned on from the full list', checkedNums(aside()).join() === '54');
    const box54 = () => Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 54')).querySelector('input');
    box54().checked = false;
    fire(box54(), 'change');
    check('and off again', checkedNums(aside()).length === 0);
    showAll().checked = false;
    fire(showAll(), 'change');
    check('show all off: only the ones in use again', nums(aside()).join() === '51,52,71');
    check('no state was posted for view-only changes', saves().length === 0);

    console.log('=== 2. scenarios ===');
    const sel = () => aside().querySelector('.sim-scn-select');
    const name = () => aside().querySelector('.sim-scn-name');
    const button = (cls) => aside().querySelector('.sim-scn-' + cls);
    const toggle = (n) => { const l = Array.from(aside().querySelectorAll('.sim-ind-list label')).find((x) => x.textContent.includes('Ind ' + n)); l.querySelector('input').checked = !l.querySelector('input').checked; fire(l.querySelector('input'), 'change'); };
    check('no scenarios yet: the picker holds only its prompt, Rename and Delete are off', sel().options.length === 1 && button('rename').disabled && button('delete').disabled);

    button('save').click();
    check('saving with no name says so and posts nothing', /name/i.test(aside().querySelector('.sim-scn-msg').textContent) && saves().length === 0);

    toggle('51'); toggle('52');
    name().value = 'Error state';
    button('save').click();
    check('saving posts the indicators that are ON under the name', saves().length === 1 && lastSave().scenarios.length === 1 && lastSave().scenarios[0].name === 'Error state' && lastSave().scenarios[0].indicators.join() === '51,52' && lastSave().scenarios[0].indicators.indexOf('54') < 0);
    check('the post carries the values store (empty) too', JSON.stringify(lastSave().values) === '{}');
    check('the saved scenario is offered and chosen in both copies', sel().options.length === 2 && sel().value === 'Error state' && toolbar().querySelector('.sim-scn-select').value === 'Error state');
    check('the option shows how many indicators it sets', /\(2\)/.test(sel().options[1].textContent));
    check('Rename and Delete are on once one is chosen', !button('rename').disabled && !button('delete').disabled);

    toggle('51'); toggle('52');
    check('setup: both are now off', checkedNums(aside()).length === 0);
    sel().value = 'Error state';
    fire(sel(), 'change');
    check('choosing a scenario turns exactly its indicators ON', checkedNums(aside()).join() === '51,52' && checkedNums(toolbar()).join() === '51,52');
    check('choosing a scenario posts nothing (it is not a change to the stored state)', saves().length === 1);

    toggle('52');
    name().value = 'error STATE';
    button('save').click();
    check('saving an existing name (any case) overwrites it', saves().length === 2 && lastSave().scenarios.length === 1 && lastSave().scenarios[0].name === 'error STATE' && lastSave().scenarios[0].indicators.join() === '51');

    toggle('52');
    name().value = 'Both on';
    button('save').click();
    check('a second scenario is added after the first', lastSave().scenarios.map((s) => s.name).join() === 'error STATE,Both on');

    sel().value = 'error STATE';
    fire(sel(), 'change');
    check('choosing the first scenario switches the indicators', checkedNums(aside()).join() === '51');
    name().value = 'both on';
    button('rename').click();
    check('renaming onto another scenario\'s name is refused with a message', /already exists/.test(aside().querySelector('.sim-scn-msg').textContent) && lastSave().scenarios.map((s) => s.name).join() === 'error STATE,Both on');
    name().value = 'Quiet';
    button('rename').click();
    check('renaming posts the new name, in place', lastSave().scenarios.map((s) => s.name).join() === 'Quiet,Both on' && sel().value === 'Quiet');
    check('the message is cleared after a good action', aside().querySelector('.sim-scn-msg').textContent === '');

    button('delete').click();
    const overlay = doc.querySelector('.confirm-overlay');
    check('delete asks first', !!overlay && /Quiet/.test(overlay.textContent) && lastSave().scenarios.length === 2);
    overlay.querySelector('.confirm-dialog-cancel').click();
    check('cancelling keeps it', lastSave().scenarios.length === 2 && sel().options.length === 3);
    button('delete').click();
    doc.querySelector('.confirm-dialog-confirm').click();
    check('confirming deletes it and posts', lastSave().scenarios.map((s) => s.name).join() === 'Both on' && sel().options.length === 2 && sel().value === '');
    check('nothing is chosen after a delete, so Rename and Delete are off again', button('rename').disabled && button('delete').disabled);
    check('the DDS source was never edited by any of it', posted.filter((m) => m.type === 'applyEdit').length === 0);

    console.log('=== 3. loading from the extension host ===');
    const before = saves().length;
    msg({ type: 'simulatorState', scenarios: [{ name: 'From disk', indicators: ['54', '1'] }, { name: 'from DISK', indicators: [] }, 'junk'], values: { choiceControl: { 'SCR1|SEL|1': 3, 'bad': 1 } } });
    check('loaded scenarios replace the list, cleaned', sel().options.length === 2 && sel().options[1].value === 'From disk' && /\(2\)/.test(sel().options[1].textContent));
    check('loading is not a change: nothing is posted back', saves().length === before);
    sel().value = 'From disk';
    fire(sel(), 'change');
    check('a loaded scenario applies; an indicator outside this screen is on but not listed', checkedNums(aside()).join() === '');
    aside().querySelector('.sim-scope').value = 'file';
    fire(aside().querySelector('.sim-scope'), 'change');
    check('whole file shows it on', checkedNums(aside()).join() === '54' && nums(aside()).includes('54'));
    aside().querySelector('.sim-scope').value = 'screen';
    fire(aside().querySelector('.sim-scope'), 'change');
    msg({ type: 'simulatorState', scenarios: [], values: {} });
    check('a state without the chosen scenario clears the choice', sel().options.length === 1 && sel().value === '');

    console.log('=== 4. stored run-time values ===');
    check('no stored values: no editor', !aside().querySelector('.sim-values'));
    msg({ type: 'simulatorState', scenarios: [], values: { choiceControl: { 'SCR1|SEL|2': 3, 'SCR1|SEL|1': 1, 'BAD': 1 } } });
    const rowsOf = () => Array.from(aside().querySelectorAll('.sim-value-row'));
    check('stored values are listed, readable, in key order', rowsOf().length === 2 && /SCR1\.SEL \(choice \/ row 1\)/.test(rowsOf()[0].textContent) && /= 1/.test(rowsOf()[0].textContent) && /= 3/.test(rowsOf()[1].textContent));
    check('the toolbar copy lists them too', toolbar().querySelectorAll('.sim-value-row').length === 2);
    const n = saves().length;
    rowsOf()[0].querySelector('.sim-value-remove').click();
    check('removing one posts the store without it', saves().length === n + 1 && JSON.stringify(lastSave().values) === JSON.stringify({ choiceControl: { 'SCR1|SEL|2': 3 } }) && rowsOf().length === 1);
    aside().querySelector('.sim-values-clear').click();
    check('clearing all posts an empty store and removes the editor', JSON.stringify(lastSave().values) === '{}' && !aside().querySelector('.sim-values') && !toolbar().querySelector('.sim-values'));

    console.log('=== 5. reset ===');
    msg({ type: 'simulatorState', scenarios: [{ name: 'Keep?', indicators: ['51'] }], values: { choiceControl: { 'SCR1|SEL|1': 2 } } });
    aside().querySelector('.sim-scope').value = 'file';
    fire(aside().querySelector('.sim-scope'), 'change');
    aside().querySelector('.sim-showall').checked = true;
    fire(aside().querySelector('.sim-showall'), 'change');
    msg({ type: 'resetViewState', text: src });
    await tick(0);
    check('reset: scope and show-all are back, scenarios and stored values are gone', aside().querySelector('.sim-scope').value === 'screen' && !aside().querySelector('.sim-showall').checked && nums(aside()).join() === '51,52,71' && aside().querySelector('.sim-scn-select').options.length === 1 && !aside().querySelector('.sim-values'));

    if (failureCount() > 0) process.exit(1);
    console.log('\nALL CHECKS PASSED');
    process.exit(0);
  })();
}, 0);

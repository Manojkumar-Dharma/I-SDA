/**
 * e10bControlFieldAdvisory.test.js
 *
 * Task E10b - CHCCTL: a non-blocking advisory for a control field that is not defined in the record, and
 * the control-value help line under the control field.
 *  1. the spec's shared value table (CHCCTL and SFLCHCCTL)
 *  2. the help text, read from that table
 *  3. the undefined-control-field notes (pure function)
 *  4. the selection-field panel
 *  5. the push-button panel
 *
 * Run with: node src/test/e10bControlFieldAdvisory.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
global.KeywordSpec = KeywordSpec;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check, failureCount } = require('./helpers/harness');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
const root = () => document.getElementById('root');

const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const SNG = kw('SNGCHCFLD');
const CHOICE1 = kw('CHOICE', "1 'Undo'");
const CHOICE2 = kw('CHOICE', "2 'Mark'");
const f = (name) => ({ name: name });

console.log('=== 1. the spec value table ===');
const t = KeywordSpec.choiceControlValues('CHCCTL');
check('CHCCTL has five rows, values 0 - 4', t && t.rows.map((r) => r.value).join() === '0,1,2,3,4');
check('0 is available on output and unselected on input', t.rows[0].onOutput === 'available' && t.rows[0].onInput === 'unselected');
check('2, 3 and 4 are unavailable', [2, 3, 4].every((v) => /^unavailable/.test(t.rows[v].onOutput)));
check('the cursor note is set', t.cursorNote === true);
const s = KeywordSpec.choiceControlValues('SFLCHCCTL');
check('SFLCHCCTL shares the same table', JSON.stringify(s) === JSON.stringify(t));
check('a keyword with no table gives null', KeywordSpec.choiceControlValues('CHOICE') === null && KeywordSpec.choiceControlValues('NOPE') === null);
t.rows[0].onOutput = 'changed';
check('the table is a copy', KeywordSpec.choiceControlValues('CHCCTL').rows[0].onOutput === 'available');

console.log('=== 2. the help text ===');
const help = DspfWriter.choiceControlValueHelp('CHCCTL');
check('names 0 available and 1 selected', /0 available \(input: unselected\)/.test(help) && /1 selected \(input: selected\)/.test(help));
check('names 2, 3 and 4 as unavailable', /2 unavailable/.test(help) && /3 unavailable/.test(help) && /4 unavailable/.test(help));
check('carries the enhanced-interface note and the preview remark', /enhanced interface/.test(help) && /draws 2, 3 and 4 the same/.test(help));
check('SFLCHCCTL gives the same text', DspfWriter.choiceControlValueHelp('SFLCHCCTL') === help);
check('no table, no text', DspfWriter.choiceControlValueHelp('CHOICE') === '');

console.log('=== 3. undefined control field notes ===');
const notes = DspfWriter.chcctlUndefinedControlFieldNotes;
let n = notes([SNG, CHOICE1, kw('CHCCTL', '1 &CTL1')], [f('F1')]);
check('a control field not in the record gives one note', n.length === 1 && n[0].id === '1' && n[0].field === 'CTL1');
check('the note says what the field must be', /not defined in this record yet/.test(n[0].text) && /data type Y, length 1, 0 decimal positions, usage H/.test(n[0].text) && /Not refused/.test(n[0].text));
check('a defined control field gives none', notes([SNG, CHOICE1, kw('CHCCTL', '1 &CTL1')], [f('F1'), f('CTL1')]).length === 0);
check('the match ignores case', notes([SNG, CHOICE1, kw('CHCCTL', '1 &ctl1')], [f('Ctl1')]).length === 0);
check('no CHCCTL, no note', notes([SNG, CHOICE1], [f('F1')]).length === 0);
check('a CHCCTL with no control field yet gives none (the existing guard covers it)', notes([SNG, CHOICE1, kw('CHCCTL', '1')], [f('F1')]).length === 0);
n = notes([SNG, CHOICE1, CHOICE2, kw('CHCCTL', '1 &CTL1'), kw('CHCCTL', '2 &CTL2')], [f('CTL1')]);
check('one defined and one not: one note, for the right choice', n.length === 1 && n[0].id === '2' && n[0].field === 'CTL2');
check('no record fields given: no notes, no crash', notes([SNG, CHOICE1, kw('CHCCTL', '1 &CTL1')], undefined).length === 1 && notes(undefined, undefined).length === 0);

console.log('=== 4. the selection-field panel ===');
const kws = [SNG, CHOICE1, kw('CHCCTL', '1 &CTL1')];
root().innerHTML = Helpers.choiceKeywordsListHtml(kws, 'c', new Set(), [], [f('F1')]);
check('the help line is shown', root().querySelectorAll('.chcctl-values').length === 1);
check('an undefined control field gets a warning', root().querySelectorAll('.hint-small.warn.chcctl-undefined[data-choice-id="1"]').length === 1);
root().innerHTML = Helpers.choiceKeywordsListHtml(kws, 'c', new Set(), [], [f('F1'), f('CTL1')]);
check('a defined control field gets none', root().querySelectorAll('.chcctl-undefined').length === 0 && root().querySelectorAll('.chcctl-values').length === 1);
root().innerHTML = Helpers.choiceKeywordsListHtml(kws, 'c', new Set(), []);
check('without the record fields there is no warning', root().querySelectorAll('.chcctl-undefined').length === 0);

console.log('=== 5. the push-button panel ===');
const pb = [kw('PSHBTNFLD'), kw('PSHBTNCHC', "1 'OK'"), kw('CHCCTL', '1 &CTLOK')];
root().innerHTML = Helpers.pshbtnChoiceControlHtml(pb, 'p', [f('F1')]);
check('the help line is shown', root().querySelectorAll('.chcctl-values').length === 1);
check('an undefined control field gets a warning', root().querySelectorAll('.chcctl-undefined').length === 1);
root().innerHTML = Helpers.pshbtnChoiceControlHtml(pb, 'p', [f('F1'), f('CTLOK')]);
check('a defined control field gets none', root().querySelectorAll('.chcctl-undefined').length === 0);
root().innerHTML = Helpers.pshbtnChoiceControlHtml(pb, 'p');
check('without the record fields there is no warning', root().querySelectorAll('.chcctl-undefined').length === 0);

if (failureCount() > 0) process.exit(1);
console.log('\nALL CHECKS PASSED');

/**
 * i172ChoicePanelRows.test.js
 *
 * Task I-172 - raised by I-171. The choice panels no longer offer a row the I-171 guard would then
 * refuse: the CHCACCEL accelerator input (single-choice field in a pull-down record only) and the
 * CHCAVAIL / CHCUNAVAIL / CHCSLT colour-state rows (a CHOICE / PSHBTNCHC / MNUBARCHC on the field;
 * CHCSLT with CHOICE also needs PULLDOWN(*NOSLTIND)). The row-hiding reason is the guard's own
 * (DspfWriter.choiceFieldCompanionReason), and a keyword already in the source keeps its row.
 *
 * Covers: 1. the shared reason  2. guard parity  3. colour-state rows  4. accelerator input
 *         5. Apply with hidden rows leaves the source untouched
 *
 * Run with: node src/test/i172ChoicePanelRows.test.js
 */
'use strict';

const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check } = require('./helpers/harness');
const { JSDOM } = require('jsdom');
const DspfParser = require('../../dist/dspfParser.js');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
const root = () => document.getElementById('root');

const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const PULLDOWN = [kw('PULLDOWN')];
const NOSLT = [kw('PULLDOWN', '(*NOSLTIND)')];
const SNG = kw('SNGCHCFLD');
const MLT = kw('MLTCHCFLD');
const CHOICE = kw('CHOICE', "1 'Undo'");
const AVAIL = kw('CHCAVAIL', '((*COLOR YLW))');

console.log('=== 1. the shared companion reason ===');
const why = DspfWriter.choiceFieldCompanionReason;
check('CHCACCEL on a single-choice field in a pull-down record: no problem', why('CHCACCEL', [SNG, CHOICE], PULLDOWN) === '');
check('CHCACCEL on a multiple-choice field: needs SNGCHCFLD', /needs SNGCHCFLD/.test(why('CHCACCEL', [MLT, CHOICE], PULLDOWN)));
check('CHCACCEL in a record with no PULLDOWN: needs PULLDOWN', /needs PULLDOWN on record format/.test(why('CHCACCEL', [SNG, CHOICE], [])));
check('CHCACCEL with the record unknown skips the record rule', why('CHCACCEL', [SNG, CHOICE]) === '');
check('CHCAVAIL on a field with CHOICE: no problem', why('CHCAVAIL', [SNG, CHOICE], []) === '');
check('CHCAVAIL on a field with no choice keyword: needs one', /needs PSHBTNCHC, CHOICE or MNUBARCHC/.test(why('CHCAVAIL', [SNG], [])));
check('CHCUNAVAIL on a field with only MNUBARCHC: needs CHOICE or PSHBTNCHC', /needs CHOICE or PSHBTNCHC/.test(why('CHCUNAVAIL', [kw('MNUBARCHC', "1 P 'X'")], [])));
check('CHCSLT with CHOICE needs PULLDOWN(*NOSLTIND) on the record', /needs PULLDOWN\(\*NOSLTIND\)/.test(why('CHCSLT', [SNG, CHOICE], PULLDOWN)));
check('CHCSLT with CHOICE and PULLDOWN(*NOSLTIND): no problem', why('CHCSLT', [SNG, CHOICE], NOSLT) === '');
check('CHCSLT with MNUBARCHC needs no *NOSLTIND', why('CHCSLT', [kw('MNUBARCHC', "1 P 'X'")], []) === '');
check('an unrelated keyword has no companion rule', why('DUP', [SNG], []) === '');

console.log('\n=== 2. guard parity (panel and I-171 guard use one function) ===');
{
  const A = '     A';
  const src = [
    A + '          R PULLEDIT                  PULLDOWN',
    A + '            F1             2Y 0B  1  2MLTCHCFLD',
    A + "                                      CHOICE(1 'Undo')",
    A + "                                      CHCACCEL(1 'F4')",
  ].join('\n') + '\n';
  const m = DspfParser.parseDspf(src);
  const field = m.records[0].fields[0];
  const guardText = DspfWriter.choiceMenuBarNewConflictReason(DspfParser.parseDspf(src.replace(/ *CHCACCEL.*\n/, '')), m);
  check('the guard still refuses CHCACCEL on a MLTCHCFLD field', /CHCACCEL on field F1 needs SNGCHCFLD/.test(guardText || ''));
  check('the panel reason for the same field is the same sentence', why('CHCACCEL', field.keywords, m.records[0].keywords, 'F1', m.records[0].name) === guardText);
}

console.log('\n=== 3. colour-state rows ===');
{
  const states = (k, rec, keys) => Helpers.visibleChoiceColorStates(k, keys, rec).map((s) => s.keyword).join();
  check('a choice field with no CHOICE yet offers no colour states', states([SNG], PULLDOWN) === '');
  check('with a CHOICE, CHCAVAIL and CHCUNAVAIL are offered; CHCSLT waits for *NOSLTIND', states([SNG, CHOICE], PULLDOWN) === 'CHCAVAIL,CHCUNAVAIL');
  check('with PULLDOWN(*NOSLTIND) all three are offered', states([SNG, CHOICE], NOSLT) === 'CHCAVAIL,CHCUNAVAIL,CHCSLT');
  check('a state already in the source keeps its row even when invalid', states([SNG, AVAIL], PULLDOWN) === 'CHCAVAIL');
  check('a push-button field with PSHBTNCHC offers avail / unavail only', states([kw('PSHBTNFLD'), kw('PSHBTNCHC', "1 'OK'")], [], Helpers.pshbtnChoiceColorStateKeys()) === 'CHCAVAIL,CHCUNAVAIL');
  check('a push-button field with no PSHBTNCHC offers none', states([kw('PSHBTNFLD')], [], Helpers.pshbtnChoiceColorStateKeys()) === '');

  root().innerHTML = Helpers.choiceColorStatesHtml([SNG], 'a', new Set(), undefined, PULLDOWN);
  check('no row: the panel says a choice keyword is needed first', /need a choice keyword/.test(root().innerHTML) && !root().querySelector('#a-ccs-avail-on'));
  check('no row: no Apply button either', !root().querySelector('.a-ccs-apply'));
  root().innerHTML = Helpers.choiceColorStatesHtml([SNG, CHOICE], 'b', new Set(), undefined, PULLDOWN);
  check('with a CHOICE the avail row and Apply are drawn, selected row is not', !!root().querySelector('#b-ccs-avail-on') && !!root().querySelector('#b-ccs-unavail-on') && !root().querySelector('#b-ccs-slt-on') && !!root().querySelector('.b-ccs-apply'));
}

console.log('\n=== 4. accelerator input ===');
{
  root().innerHTML = Helpers.choiceKeywordsListHtml([SNG, CHOICE], 'c', new Set(), PULLDOWN);
  check('single-choice field in a pull-down record: accelerator input offered', !!root().querySelector('.c-choicekw-accel'));
  root().innerHTML = Helpers.choiceKeywordsListHtml([MLT, CHOICE], 'd', new Set(), PULLDOWN);
  check('multiple-choice field: accelerator input hidden, control input still there', !root().querySelector('.d-choicekw-accel') && !!root().querySelector('.d-choicekw-ctrl'));
  root().innerHTML = Helpers.choiceKeywordsListHtml([SNG, CHOICE], 'e', new Set(), []);
  check('record without PULLDOWN: accelerator input hidden', !root().querySelector('.e-choicekw-accel'));
  root().innerHTML = Helpers.choiceKeywordsListHtml([SNG, CHOICE], 'f', new Set());
  check('record unknown (older callers): accelerator input kept', !!root().querySelector('.f-choicekw-accel'));
  root().innerHTML = Helpers.choiceKeywordsListHtml([MLT, CHOICE, kw('CHCACCEL', "1 'F4'")], 'g', new Set(), PULLDOWN);
  check('an existing CHCACCEL keeps its input so it can be cleared', !!root().querySelector('.g-choicekw-accel'));
}

console.log('\n=== 5. Apply with a hidden accelerator input ===');
{
  const keywords = [MLT, CHOICE];
  root().innerHTML = Helpers.choiceKeywordsListHtml(keywords, 'h', new Set(), PULLDOWN);
  let committed = null;
  Helpers.wireChoiceKeywordsListEditor(keywords, (next) => { committed = next; }, 'h', new Set(), () => {}, PULLDOWN);
  document.querySelector('.h-choicekw-apply').click();
  check('Apply does not throw and adds no CHCACCEL', committed !== null && !committed.some((k) => k.name === 'CHCACCEL'));
  check('Apply keeps the CHOICE', committed.some((k) => k.name === 'CHOICE'));
}

if (require('./helpers/harness').failureCount() > 0) process.exit(1);
console.log('\nALL CHECKS PASSED');

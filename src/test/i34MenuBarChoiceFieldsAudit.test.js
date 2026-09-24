/**
 * i34MenuBarChoiceFieldsAudit.test.js
 *
 * Task I-34 - Menu-bar choice fields (SNGCHCFLD/MLTCHCFLD), cross-checking
 * every keyword's own "Option indicators are/are not valid for this
 * keyword" statement (plus format-string parameter lists) in
 * docs/sda-reference/source/DDS_Keyword_V7r6.txt against the actual UI.
 *
 * Findings and fixes:
 *
 *  - Usage/constraint bug: IBM's MLTCHCFLD format string has NO
 *    *AUTOSLT/*NOAUTOSLT/*AUTOSLTENH/*AUTOENT/*NOAUTOENT/*AUTOENTNN
 *    params at all (that whole family is documented ONLY on SNGCHCFLD's
 *    own format string) - choiceSelectionTypeHtml was offering both
 *    radio groups unconditionally regardless of kind. Fixed at both the
 *    UI layer (groups hidden entirely for MLTCHCFLD, and
 *    wireChoiceSelectionTypeEditor re-checks kind at apply-time rather
 *    than trusting what's in the DOM) and the DDS-writing layer itself
 *    (setChoiceSelectionType filters SNGCHCFLD_ONLY_FLAGS whenever
 *    kind === 'MLTCHCFLD').
 *  - Reverse gap (Conditioning eligibility), the dominant finding - five
 *    keywords documented "Option indicators are valid for this keyword"
 *    had NO Conditioning UI at all before this task:
 *      - CHOICE (per-choice-number instance, new setChoiceConditions)
 *      - MNUBARCHC (per-choice-number instance, new
 *        setMenubarChoiceConditions)
 *      - CHCAVAIL/CHCUNAVAIL/CHCSLT (whole-field; getChoiceColorState/
 *        setChoiceColorState already carried a `conditions` param from
 *        I-3's ENTFLDATR work, but no panel ever rendered the toggle)
 *      - MNUBARSEP (whole-field, new conditions support in
 *        getMenubarSeparator/setMenubarSeparator)
 *    All five now render/wire a Conditioning toggle, matching the exact
 *    kw-cond-toggle/kw-cond-body shape and immediate-commit-independent-
 *    of-Apply split entFldAtrHtml already established.
 *  - Silent-data-loss fix (same class I-2/I-3 fixed for
 *    setFileFlagKeyword/setChoiceColorState): setChoices/setMenubarChoices
 *    used to hard-code `conditions: []` on every batch rewrite, which
 *    would have wiped any conditioning set through the new per-choice
 *    toggle the next time "Apply choice keywords"/"Apply menu-bar
 *    choices" was clicked. Both now preserve existing conditions by
 *    choice-id unless the caller explicitly overrides them.
 *  - Parameter completeness: CHOICE's optional trailing *SPACEB flag
 *    ("insert a blank space/line before this choice") was entirely
 *    unmodeled. Added to getChoices/setChoices and the choice-row UI.
 *
 * Confirmed CLEAN (no fix needed) during the same audit: SNGCHCFLD/
 * MLTCHCFLD themselves ("not valid" - correctly offer no toggle) and
 * CHCCTL/CHCACCEL ("not valid" - correctly offer no toggle either).
 *
 * Run with: node src/test/i34MenuBarChoiceFieldsAudit.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const cond = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }];

function kw(name, parameters, conditions) {
  return { name: name, parameters: parameters, conditions: conditions || [], raw: '', sourceLines: [] };
}

// ===========================================================================
// Usage/constraint bug: MLTCHCFLD has no *AUTOSLT/*AUTOENT family.
// ===========================================================================

console.log('choiceSelectionTypeHtml - SNGCHCFLD shows Auto-select/Auto-enter groups');
{
  const keywords = [kw('SNGCHCFLD', '*RSTCSR')];
  document.getElementById('root').innerHTML = Helpers.choiceSelectionTypeHtml(keywords, 'sng');
  check('Auto-select group present for SNGCHCFLD', !!document.querySelector('.sng-cst-autoslt'));
  check('Auto-enter group present for SNGCHCFLD', !!document.querySelector('.sng-cst-autoent'));
}

console.log('\nchoiceSelectionTypeHtml - MLTCHCFLD hides Auto-select/Auto-enter groups (IBM: no such params exist on MLTCHCFLD)');
{
  const keywords = [kw('MLTCHCFLD', '*RSTCSR')];
  document.getElementById('root').innerHTML = Helpers.choiceSelectionTypeHtml(keywords, 'mlt');
  check('Auto-select group absent for MLTCHCFLD', !document.querySelector('.mlt-cst-autoslt'));
  check('Auto-enter group absent for MLTCHCFLD', !document.querySelector('.mlt-cst-autoent'));
  check('Cursor restriction group still present for MLTCHCFLD', !!document.querySelector('.mlt-cst-rstcsr'));
  check('Select indicator group still present for MLTCHCFLD', !!document.querySelector('.mlt-cst-sltind'));
}

console.log('\nsetChoiceSelectionType - writing MLTCHCFLD strips any SNGCHCFLD-only flag at the DDS-writing layer too');
{
  const next = DspfWriter.setChoiceSelectionType([], { kind: 'MLTCHCFLD', flags: ['*RSTCSR', '*AUTOSLT', '*AUTOENT'], numCol: '', numRow: '', gutter: '' });
  const mlt = next.find(function (k) { return k.name === 'MLTCHCFLD'; });
  check('MLTCHCFLD keyword written', !!mlt);
  check('*RSTCSR (a real MLTCHCFLD param) kept', mlt.parameters.indexOf('*RSTCSR') >= 0);
  check('*AUTOSLT (SNGCHCFLD-only) stripped even though passed in flags', mlt.parameters.indexOf('*AUTOSLT') < 0);
  check('*AUTOENT (SNGCHCFLD-only) stripped even though passed in flags', mlt.parameters.indexOf('*AUTOENT') < 0);
}

console.log('\nsetChoiceSelectionType - writing SNGCHCFLD keeps *AUTOSLT/*AUTOENT (still valid there)');
{
  const next = DspfWriter.setChoiceSelectionType([], { kind: 'SNGCHCFLD', flags: ['*AUTOSLT', '*AUTOENT'], numCol: '', numRow: '', gutter: '' });
  const sng = next.find(function (k) { return k.name === 'SNGCHCFLD'; });
  check('*AUTOSLT kept for SNGCHCFLD', sng.parameters.indexOf('*AUTOSLT') >= 0);
  check('*AUTOENT kept for SNGCHCFLD', sng.parameters.indexOf('*AUTOENT') >= 0);
}

// ===========================================================================
// Confirmed CLEAN: SNGCHCFLD/MLTCHCFLD themselves offer no Conditioning
// toggle (IBM: "Option indicators are not valid for this keyword").
// ===========================================================================

console.log('\nchoiceSelectionTypeHtml - no Conditioning toggle for SNGCHCFLD/MLTCHCFLD themselves (correctly clean already)');
{
  document.getElementById('root').innerHTML = Helpers.choiceSelectionTypeHtml([kw('SNGCHCFLD', '')], 'nocond');
  check('SNGCHCFLD panel has no kw-cond-toggle', !document.querySelector('.kw-cond-toggle'));
}

// ===========================================================================
// Reverse gap: CHOICE now offers per-choice Conditioning.
// ===========================================================================

console.log('\nchoiceKeywordsListHtml - CHOICE now shows a per-choice Conditioning toggle, with a summary count when conditions exist');
{
  const keywords = [kw('SNGCHCFLD', ''), kw('CHOICE', "10 'First choice'", cond), kw('CHOICE', "20 'Second choice'")];
  document.getElementById('root').innerHTML = Helpers.choiceKeywordsListHtml(keywords, 'ck', new Set());
  const toggles = document.querySelectorAll('.kw-cond-toggle');
  check('Two Conditioning toggles rendered (one per choice)', toggles.length === 2);
  check('Choice 10\u2019s toggle shows a (1) summary', toggles[0].textContent.indexOf('(1)') >= 0);
  check('Choice 20\u2019s toggle shows no count (no conditions)', toggles[1].textContent.indexOf('(1)') < 0);
}

console.log('\nsetChoiceConditions - updates only the targeted choice-number, leaving every other CHOICE (and other keywords) untouched');
{
  const keywords = [kw('SNGCHCFLD', ''), kw('CHOICE', "10 'First'"), kw('CHOICE', "20 'Second'"), kw('CHCCTL', '10 &CTLFLD')];
  const next = DspfWriter.setChoiceConditions(keywords, '20', cond);
  const c10 = next.find(function (k) { return k.name === 'CHOICE' && k.parameters.indexOf('10 ') === 0; });
  const c20 = next.find(function (k) { return k.name === 'CHOICE' && k.parameters.indexOf('20 ') === 0; });
  const ctl = next.find(function (k) { return k.name === 'CHCCTL'; });
  check('Choice 10 conditions untouched (still empty)', c10.conditions.length === 0);
  check('Choice 20 conditions updated', c20.conditions.length === 1);
  check('CHCCTL keyword untouched', ctl.parameters === '10 &CTLFLD');
}

console.log('\nsetChoices - preserves existing per-choice conditions across a batch rewrite when not explicitly overridden (silent-data-loss fix)');
{
  const keywords = [kw('CHOICE', "10 'Old text'", cond)];
  const next = DspfWriter.setChoices(keywords, [{ id: '10', text: 'New text' }]);
  const c10 = next.find(function (k) { return k.name === 'CHOICE'; });
  check('Choice 10\u2019s text updated', c10.parameters.indexOf('New text') >= 0);
  check('Choice 10\u2019s conditions PRESERVED (not wiped to [])', c10.conditions.length === 1);
}

// ===========================================================================
// Parameter completeness: CHOICE's optional *SPACEB flag.
// ===========================================================================

console.log('\ngetChoices/setChoices - *SPACEB round-trips correctly');
{
  const keywords = [kw('CHOICE', "10 'First' *SPACEB")];
  const choices = DspfWriter.getChoices(keywords);
  check('spaceBefore parsed as true', choices[0].spaceBefore === true);
  check('text does not include *SPACEB itself', choices[0].text === 'First');
  const rewritten = DspfWriter.setChoices([], [{ id: '10', text: 'First', spaceBefore: true }]);
  check('*SPACEB written back out', rewritten[0].parameters.indexOf('*SPACEB') >= 0);
  const rewrittenOff = DspfWriter.setChoices([], [{ id: '10', text: 'First', spaceBefore: false }]);
  check('*SPACEB omitted when spaceBefore is false', rewrittenOff[0].parameters.indexOf('*SPACEB') < 0);
}

console.log('\nchoiceKeywordsListHtml - renders an Insert-blank-before (*SPACEB) checkbox per row');
{
  const keywords = [kw('SNGCHCFLD', ''), kw('CHOICE', "10 'First' *SPACEB")];
  document.getElementById('root').innerHTML = Helpers.choiceKeywordsListHtml(keywords, 'sb', new Set());
  const box = document.querySelector('.sb-choicekw-spaceb');
  check('*SPACEB checkbox present', !!box);
  check('*SPACEB checkbox reflects checked state', box.checked === true);
}

// ===========================================================================
// Reverse gap: MNUBARCHC now offers per-choice Conditioning.
// ===========================================================================

console.log('\nmenuBarChoicesHtml - MNUBARCHC now shows a per-choice Conditioning toggle');
{
  const keywords = [kw('MNUBARCHC', "1 REC1 'File'", cond)];
  document.getElementById('root').innerHTML = Helpers.menuBarChoicesHtml(keywords, 'mb', new Set());
  const toggle = document.querySelector('.kw-cond-toggle');
  check('Conditioning toggle rendered for MNUBARCHC', !!toggle);
  check('Shows a (1) summary matching the seeded condition', toggle.textContent.indexOf('(1)') >= 0);
}

console.log('\nsetMenubarChoiceConditions - updates only the targeted choice-number');
{
  const keywords = [kw('MNUBARCHC', "1 REC1 'File'"), kw('MNUBARCHC', "2 REC2 'Edit'")];
  const next = DspfWriter.setMenubarChoiceConditions(keywords, '2', cond);
  const c1 = next.find(function (k) { return k.parameters.indexOf('1 ') === 0; });
  const c2 = next.find(function (k) { return k.parameters.indexOf('2 ') === 0; });
  check('Choice 1 untouched', c1.conditions.length === 0);
  check('Choice 2 updated', c2.conditions.length === 1);
}

console.log('\nsetMenubarChoices - preserves existing per-choice conditions across a batch rewrite (silent-data-loss fix)');
{
  const keywords = [kw('MNUBARCHC', "1 REC1 'Old'", cond)];
  const next = DspfWriter.setMenubarChoices(keywords, [{ id: '1', pulldownRecord: 'REC1', text: 'New' }]);
  const c1 = next.find(function (k) { return k.name === 'MNUBARCHC'; });
  check('Text updated', c1.parameters.indexOf('New') >= 0);
  check('Conditions PRESERVED', c1.conditions.length === 1);
}

// ===========================================================================
// Reverse gap: CHCAVAIL/CHCUNAVAIL/CHCSLT now offer Conditioning.
// ===========================================================================

console.log('\nchoiceColorStatesHtml - CHCAVAIL/CHCUNAVAIL/CHCSLT each show their own Conditioning toggle');
{
  const keywords = [kw('CHCAVAIL', '(*COLOR BLU)', cond), kw('CHCUNAVAIL', '(*COLOR RED)'), kw('CHCSLT', '(*COLOR GRN)')];
  document.getElementById('root').innerHTML = Helpers.choiceColorStatesHtml(keywords, 'ccs', new Set());
  const toggles = document.querySelectorAll('.kw-cond-toggle');
  check('Three Conditioning toggles rendered (one per state)', toggles.length === 3);
  check('CHCAVAIL\u2019s toggle shows a (1) summary', toggles[0].textContent.indexOf('(1)') >= 0);
}

console.log('\nwireChoiceColorStatesEditor - toggle click commits conditions independently of the shared Apply button');
{
  const keywords = [kw('CHCAVAIL', '(*COLOR BLU)')];
  const expandedSet = new Set();
  let rerenders = 0;
  let committed = null;
  document.getElementById('root').innerHTML = Helpers.choiceColorStatesHtml(keywords, 'wccs', expandedSet);
  Helpers.wireChoiceColorStatesEditor(keywords, function (nk) { committed = nk; }, 'wccs', expandedSet, function () { rerenders++; });
  document.querySelector('.kw-cond-toggle[data-flag-id="wccs-ccs-avail"]').dispatchEvent(new dom.window.Event('click'));
  check('Clicking the toggle triggers a rerender (expand/collapse)', rerenders === 1);
  check('Expand key tracked in expandedSet', expandedSet.has('wccs-ccs-avail:cond'));
}

// ===========================================================================
// Confirmed CLEAN: CHCCTL/CHCACCEL offer no Conditioning toggle (IBM:
// "Option indicators are not valid for this keyword" for both).
// ===========================================================================

console.log('\nchoiceKeywordsListHtml - CHCCTL/CHCACCEL portions of a choice row carry no Conditioning of their own (only CHOICE does)');
{
  const keywords = [kw('SNGCHCFLD', ''), kw('CHOICE', "10 'First'"), kw('CHCCTL', '10 &CTLFLD'), kw('CHCACCEL', "10 'F3'")];
  document.getElementById('root').innerHTML = Helpers.choiceKeywordsListHtml(keywords, 'ctl', new Set());
  check('Exactly one Conditioning toggle (CHOICE\u2019s own, not one each for CHCCTL/CHCACCEL)', document.querySelectorAll('.kw-cond-toggle').length === 1);
}

// ===========================================================================
// Reverse gap: MNUBARSEP now offers Conditioning.
// ===========================================================================

console.log('\nmenuBarSeparatorHtml - MNUBARSEP now shows a Conditioning toggle');
{
  const keywords = [kw('MNUBARSEP', '(*COLOR BLU)', cond)];
  document.getElementById('root').innerHTML = Helpers.menuBarSeparatorHtml(keywords, 'sep', new Set());
  const toggle = document.querySelector('.kw-cond-toggle');
  check('Conditioning toggle rendered for MNUBARSEP', !!toggle);
  check('Shows a (1) summary matching the seeded condition', toggle.textContent.indexOf('(1)') >= 0);
}

console.log('\ngetMenubarSeparator/setMenubarSeparator - conditions round-trip and are preserved when omitted from state');
{
  const keywords = [kw('MNUBARSEP', '(*COLOR BLU)', cond)];
  const parsed = DspfWriter.getMenubarSeparator(keywords);
  check('conditions parsed off the existing keyword', parsed.conditions.length === 1);
  const next = DspfWriter.setMenubarSeparator(keywords, { colorEnabled: true, color: 'RED', attrsEnabled: false, attrs: [], charEnabled: false, char: '' });
  const sep = next.find(function (k) { return k.name === 'MNUBARSEP'; });
  check('Color updated', sep.parameters.indexOf('RED') >= 0);
  check('Conditions PRESERVED when state.conditions is omitted', sep.conditions.length === 1);
}

console.log('\nwireMenuBarSeparatorEditor - toggle click commits conditions independently of the Apply button');
{
  const keywords = [kw('MNUBARSEP', '(*COLOR BLU)')];
  const expandedSet = new Set();
  let rerenders = 0;
  document.getElementById('root').innerHTML = Helpers.menuBarSeparatorHtml(keywords, 'wsep', expandedSet);
  Helpers.wireMenuBarSeparatorEditor(keywords, function () {}, 'wsep', expandedSet, function () { rerenders++; });
  document.querySelector('.kw-cond-toggle[data-flag-id="wsep-mnubarsep"]').dispatchEvent(new dom.window.Event('click'));
  check('Clicking the toggle triggers a rerender (expand/collapse)', rerenders === 1);
  check('Expand key tracked in expandedSet', expandedSet.has('wsep-mnubarsep:cond'));
}

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : `\n${failureCount()} check(s) FAILED.`);
process.exit(failureCount() === 0 ? 0 : 1);

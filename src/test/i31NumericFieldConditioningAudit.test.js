/**
 * i31NumericFieldConditioningAudit.test.js
 *
 * Task I-31 - Numeric fields, the second task in the field-level series
 * (I-30 through I-35). I-30 already covered the 8 categories shared with
 * character fields (Colors & Attributes, Keying Options, Validity Check,
 * Input Keywords, General Keywords, Database Reference, Error Messages,
 * Message ID) via the same shared code paths, so this task's own scope is
 * what's actually numeric-specific:
 *
 *  - Editing Keywords (EDTCDE/EDTWRD/EDTMSK) - real SDA's numeric "Select
 *    Field Keywords" screen (docs/sda-reference/screens/field-level/
 *    numeric/_menu/image173.png) lists this as its own category, "Numeric
 *    Output or Both" - already correctly gated by
 *    fieldKeywordCategoryVisibility's editingKeywords (Task D3, confirmed
 *    clean here, not re-fixed).
 *  - Conditioning: EDTCDE/EDTWRD/EDTMSK each individually state "Option
 *    indicators are not valid for this keyword" in the DDS Reference.
 *    Confirmed clean - editKeywordSectionHtml never offered a Conditioning
 *    toggle for any of the three, before or after this task's own fix
 *    below.
 *  - Real bug found and fixed: EDTMSK used to live in the SAME mutually-
 *    exclusive 'kind' group as EDTCDE/EDTWRD (getEditKeyword/
 *    setEditKeyword's old EDIT_KEYWORDS constant listed all three), but
 *    IBM's own DDS Reference states EDTMSK "must also contain the EDTCDE
 *    or EDTWRD keywords" - it can never stand alone - and separately "must
 *    be usage I or usage B" (narrower than editingKeywords' own O-or-B
 *    category gate). Treating EDTMSK as a third alternative meant
 *    selecting it always wiped out whichever of EDTCDE/EDTWRD the field
 *    already carried (and vice versa), so the old UI could never actually
 *    produce a valid EDTCDE+EDTMSK or EDTWRD+EDTMSK combination. Fixed:
 *    EDTMSK now has its own independent getEditMask/setEditMask pair and
 *    its own editMaskConflictReason guard, wired to a separate input in
 *    editKeywordSectionHtml/wireValidityAndEdit (dspfWebview.test.js's
 *    "Numeric field picker (Task D3)" scenario covers the end-to-end UI
 *    flow; this file covers the pure DspfWriter/webviewClientHelpers
 *    logic in isolation).
 *  - isNumericField (webviewClientHelpers.js, gates the Keying Options
 *    shift-value picker list) used to also test dataType === 'B'/'P' -
 *    dead code, since neither letter is a real position-35 value: IBM's
 *    own "Data type and keyboard shift for display files (position 35)"
 *    table has no B or P row, and the Basic tab's own Data type dropdown
 *    (buildWebviewTemplate.js) only ever writes one of '', 'A', 'X', 'N',
 *    'S', 'Y', 'I', 'D', 'M', 'F', 'L', 'T', 'Z' - so dataType can never
 *    equal 'B' or 'P' in practice. Removed both dead arms.
 *  - L/T/Z (Date/Time/Timestamp) grouping confirmed correct as-is: real
 *    SDA has no separate screen category for date/time/timestamp fields
 *    (docs/sda-reference/screens/field-level has exactly four categories
 *    - character/numeric/constant/menu-bar-choice), so L/T/Z fields fall
 *    under "numeric" for every field-level UI purpose in real SDA,
 *    including this keyboard-shift picker - no split needed.
 *  - Validity Check's existing float exclusion (validityAndErrorMessage:
 *    isIOB && dataType !== 'F') confirmed correct per IBM's RANGE, COMP,
 *    VALUES, and CHECK(AB)/CHECK(M10)/CHECK(M11) sections, each of which
 *    individually states the keyword cannot be specified on a
 *    floating-point field - already implemented, not re-fixed here.
 *
 * Run with: node src/test/i31NumericFieldConditioningAudit.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function kw(name, parameters, conditions) {
  return { name: name, parameters: parameters, conditions: conditions || [], raw: '', sourceLines: [] };
}

const cond = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }];

// ===========================================================================
// fieldKeywordCategoryVisibility - editingKeywords gate (Task D3, confirmed
// clean - not re-fixed by this task, spot-checked against real SDA's own
// numeric "Select Field Keywords" screen table).
// ===========================================================================

console.log('fieldKeywordCategoryVisibility - editingKeywords matches real SDA\'s "Numeric Output or Both" column');
[
  ['O', true],
  ['B', true],
  ['I', false],
  ['H', false],
].forEach(function (pair) {
  const vis = Helpers.fieldKeywordCategoryVisibility(pair[0], 'S');
  check('usage ' + pair[0] + ' -> editingKeywords ' + pair[1], vis.editingKeywords === pair[1]);
});

console.log('\nfieldKeywordCategoryVisibility - validityAndErrorMessage still excludes float (dataType F), confirmed not re-fixed');
check('usage I, dataType F -> validityAndErrorMessage false', Helpers.fieldKeywordCategoryVisibility('I', 'F').validityAndErrorMessage === false);
check('usage I, dataType S -> validityAndErrorMessage true', Helpers.fieldKeywordCategoryVisibility('I', 'S').validityAndErrorMessage === true);

// ===========================================================================
// EDTCDE/EDTWRD/EDTMSK conditioning - all three "not valid" per IBM, all
// three confirmed to never offer a Conditioning toggle.
// ===========================================================================

console.log('\neditKeywordSectionHtml (via validityAndEditHtml) - EDTCDE/EDTWRD/EDTMSK never show a Conditioning toggle');
[
  kw('EDTCDE', 'J', cond),
  kw('EDTWRD', "'  DR  CR'", cond),
].forEach(function (k) {
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml([k], 'ek' + k.name, { includeValidity: false }, new Set());
  check(k.name + ' has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
});
{
  const keywords = [kw('EDTCDE', 'J'), kw('EDTMSK', "'(999) 999-9999'", cond)];
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml(keywords, 'ekmask', { includeValidity: false }, new Set());
  check('EDTMSK has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
}

// ===========================================================================
// Real bug fix: EDTMSK split out of the EDTCDE/EDTWRD kind selector.
// ===========================================================================

console.log('\neditKeywordSectionHtml - the kind selector only offers EDTCDE/EDTWRD, no EDTMSK option');
{
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml([], 'ekopts', { includeValidity: false }, new Set());
  const select = document.querySelector('select[id$="-ec-kind"]');
  check('kind selector exists', !!select);
  const values = Array.from(select.options).map(function (o) { return o.value; }).sort().join(',');
  check('options are exactly ["", "EDTCDE", "EDTWRD"]', values === ',EDTCDE,EDTWRD');
}

console.log('\neditKeywordSectionHtml - a separate Edit mask (EDTMSK) input always renders alongside the kind selector');
{
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml([kw('EDTCDE', 'J'), kw('EDTMSK', "'(999) 999-9999'")], 'ekboth', { includeValidity: false }, new Set());
  const maskInput = document.querySelector('input[id$="-em-mask"]');
  check('the mask input exists', !!maskInput);
  check('it is pre-populated from the existing EDTMSK keyword', maskInput.value === "'(999) 999-9999'");
  const kindSelect = document.querySelector('select[id$="-ec-kind"]');
  check('the kind selector independently reflects EDTCDE', kindSelect.value === 'EDTCDE');
}

console.log('\nDspfWriter.getEditMask/setEditMask - independent of getEditKeyword/setEditKeyword');
{
  const withBoth = [kw('EDTCDE', 'J'), kw('EDTMSK', "'(999) 999-9999'")];
  check('getEditMask reads EDTMSK independently of EDTCDE being present', DspfWriter.getEditMask(withBoth).text === "'(999) 999-9999'");
  check('getEditKeyword still reads EDTCDE fine alongside EDTMSK', DspfWriter.getEditKeyword(withBoth).kind === 'EDTCDE');

  const afterClearMask = DspfWriter.setEditMask(withBoth, '');
  check('setEditMask(\'\') removes EDTMSK', !afterClearMask.some(function (k) { return k.name === 'EDTMSK'; }));
  check('setEditMask(\'\') leaves EDTCDE untouched', afterClearMask.some(function (k) { return k.name === 'EDTCDE'; }));

  const afterSwitchKind = DspfWriter.setEditKeyword(withBoth, 'EDTWRD', "'  DR  CR'");
  check('setEditKeyword switching EDTCDE->EDTWRD leaves EDTMSK untouched', afterSwitchKind.some(function (k) { return k.name === 'EDTMSK'; }));
  check('...and the old EDTCDE is gone', !afterSwitchKind.some(function (k) { return k.name === 'EDTCDE'; }));

  const fromScratch = DspfWriter.setEditMask(DspfWriter.setEditKeyword([], 'EDTCDE', 'J'), "'(999) 999-9999'");
  check('building up from empty keywords produces both EDTCDE and EDTMSK together', fromScratch.some(function (k) { return k.name === 'EDTCDE'; }) && fromScratch.some(function (k) { return k.name === 'EDTMSK'; }));
}

console.log('\nDspfWriter.editMaskConflictReason - both of EDTMSK\'s own documented requirements');
{
  check('usage O is rejected (requires I or B)', typeof DspfWriter.editMaskConflictReason([kw('EDTCDE', 'J')], 'O') === 'string');
  check('usage H is rejected (requires I or B)', typeof DspfWriter.editMaskConflictReason([kw('EDTCDE', 'J')], 'H') === 'string');
  check('blank/undefined usage is rejected (constants have no usage)', typeof DspfWriter.editMaskConflictReason([kw('EDTCDE', 'J')], undefined) === 'string');
  check('usage I is accepted when EDTCDE is present', DspfWriter.editMaskConflictReason([kw('EDTCDE', 'J')], 'I') === null);
  check('usage B is accepted when EDTWRD is present', DspfWriter.editMaskConflictReason([kw('EDTWRD', "'  DR  CR'")], 'B') === null);
  check('usage B with NEITHER EDTCDE nor EDTWRD is rejected (requires one of them)', typeof DspfWriter.editMaskConflictReason([], 'B') === 'string');
  check('the usage reason is checked before the EDTCDE/EDTWRD reason (matches IBM\'s own statement order)', /usage/i.test(DspfWriter.editMaskConflictReason([], 'O')));
}

// ===========================================================================
// isNumericField (Keying Options shift-value picker) - dead 'B'/'P' arms
// removed; L/T/Z grouping confirmed correct as-is.
// ===========================================================================

console.log('\nkeyingOptionsHtml - S/Y/F/L/T/Z all get the numeric shift-value list');
['S', 'Y', 'F', 'L', 'T', 'Z'].forEach(function (dt) {
  const owner = 'shift' + dt;
  document.getElementById('root').innerHTML = Helpers.keyingOptionsHtml([], owner, new Set(), dt);
  const select = document.querySelector('.' + owner + '-keyboard-shift');
  const values = select ? Array.from(select.options).map(function (o) { return o.value; }).sort().join(',') : null;
  check('dataType ' + dt + ' -> numeric shift-value list', values === ',D,I,N,S,Y');
});

console.log('\nkeyingOptionsHtml - character types (and the now-dead B/P letters, which never occur in practice) fall back to the character shift-value list');
['A', 'X', 'N', 'W', 'M', 'B', 'P', ''].forEach(function (dt) {
  const owner = 'cshift' + (dt || 'blank');
  document.getElementById('root').innerHTML = Helpers.keyingOptionsHtml([], owner, new Set(), dt);
  const select = document.querySelector('.' + owner + '-keyboard-shift');
  const values = select ? Array.from(select.options).map(function (o) { return o.value; }).sort().join(',') : null;
  check('dataType ' + (dt || '(blank)') + ' -> character shift-value list', values === ',A,D,E,G,I,J,M,N,O,W,X');
});

console.log('\nDspfWriter.dateTimeUsageConflictReason - L/T/Z\'s own narrower Usage restriction (O/B/I only, no H/M/P)');
{
  ['L', 'T', 'Z'].forEach(function (dt) {
    check(dt + ' + usage H is rejected', typeof DspfWriter.dateTimeUsageConflictReason(dt, 'H') === 'string');
    check(dt + ' + usage M is rejected', typeof DspfWriter.dateTimeUsageConflictReason(dt, 'M') === 'string');
    check(dt + ' + usage P is rejected', typeof DspfWriter.dateTimeUsageConflictReason(dt, 'P') === 'string');
    check(dt + ' + usage O is accepted', DspfWriter.dateTimeUsageConflictReason(dt, 'O') === null);
    check(dt + ' + usage B is accepted', DspfWriter.dateTimeUsageConflictReason(dt, 'B') === null);
    check(dt + ' + usage I is accepted', DspfWriter.dateTimeUsageConflictReason(dt, 'I') === null);
  });
  check('non-date/time types (e.g. S) are never subject to this restriction, even with usage H', DspfWriter.dateTimeUsageConflictReason('S', 'H') === null);
  check('character types (e.g. A) are never subject to this restriction, even with usage M', DspfWriter.dateTimeUsageConflictReason('A', 'M') === null);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

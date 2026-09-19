/**
 * i59EntfldatrBareAndCursorVisible.test.js
 *
 * Task I-59 - follow-up from I-42 (ENTFLDATR became reachable at field
 * level, exposing two pre-existing limitations of the shared ENTFLDATR
 * editor, entFldAtrHtml/wireEntFldAtrEditor, built on the generic
 * getChoiceColorState/setChoiceColorState primitive it shares with
 * CHCAVAIL/CHCUNAVAIL/CHCSLT):
 *
 *  1. A bare ENTFLDATR (IBM's own "F1" example - no parameters at all,
 *     all documented defaults apply) could never survive a single Apply
 *     click, in either direction: checking the box with nothing else set
 *     and clicking Apply wrote nothing (old rule: "write only if color or
 *     attrs is set"), and opening a DSPF with a hand-written bare
 *     ENTFLDATR already on it, then clicking Apply with the checkbox
 *     still showing checked, silently dropped it the same way.
 *  2. The cursor-visible parameter (*CURSOR/*NOCURSOR, IBM's own "F3"
 *     example) was entirely unmodeled - never read back for the checkbox
 *     to reflect, and silently discarded on every Apply regardless of
 *     what the underlying DDS actually had.
 *
 * Fix: getChoiceColorState gained `present` (true whenever the keyword
 * exists at all) and `cursorVisible` ('' / 'CURSOR' / 'NOCURSOR');
 * setChoiceColorState gained matching `cursorVisible`/`forcePresent`
 * trailing params (both harmless no-ops for the three existing
 * CHCAVAIL/CHCUNAVAIL/CHCSLT callers, which never pass either). Only
 * *NOCURSOR is ever written back out (*CURSOR is the documented default,
 * never re-serialized, matching this codebase's own convention
 * elsewhere). A new advisory-only (never blocking) hint appears at the
 * field level only when *NOCURSOR is checked and the field's own data
 * type isn't I, per IBM's own "the default is used" (not rejected) text.
 *
 * Runs webviewClientHelpers.js's own exported functions directly against
 * a plain jsdom document (same lightweight harness as
 * i20RecordIndicatorConditioningAudit.test.js /
 * i55RepeatableInstanceWhitelistGuard.test.js).
 * Run with: node src/test/i59EntfldatrBareAndCursorVisible.test.js
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

function setup(initialKeywords, dataType) {
  let keywords = initialKeywords;
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(); wire(); }
  function render() { document.getElementById('root').innerHTML = Helpers.entFldAtrHtml(keywords, 'ef', new Set(), dataType); }
  function wire() { Helpers.wireEntFldAtrEditor(getKeywords, onChange, 'ef', new Set(), function () {}); }
  render();
  wire();
  return { getKeywords, click: function () { document.querySelector('.ef-apply').dispatchEvent(new dom.window.Event('click', { bubbles: true })); } };
}

function entflda(ctx) { return ctx.getKeywords().find((k) => k.name === 'ENTFLDATR'); }

// ===========================================================================
// Bare ENTFLDATR (IBM's own "F1" example)
// ===========================================================================

console.log('Checking the box with nothing else set, then Apply: writes a bare ENTFLDATR (parameters empty)');
{
  const ctx = setup([]);
  document.getElementById('ef-on').checked = true;
  ctx.click();
  const kw = entflda(ctx);
  check('ENTFLDATR was written', !!kw);
  check('parameters are empty (bare form)', kw && kw.parameters === '');
}

console.log('\nRe-rendering a bare ENTFLDATR: checkbox shows checked (not the old "unchecked" bug)');
{
  const ctx = setup([{ name: 'ENTFLDATR', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  check('checkbox is checked', document.getElementById('ef-on').checked === true);
}

console.log('\nClicking Apply again with the bare ENTFLDATR checkbox still checked and nothing else touched: still present (not silently dropped)');
{
  const ctx = setup([{ name: 'ENTFLDATR', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  ctx.click();
  const kw = entflda(ctx);
  check('ENTFLDATR survives an untouched re-Apply', !!kw && kw.parameters === '');
}

console.log('\nUnchecking the box and clicking Apply: ENTFLDATR is removed entirely (unchanged behavior)');
{
  const ctx = setup([{ name: 'ENTFLDATR', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  document.getElementById('ef-on').checked = false;
  ctx.click();
  check('ENTFLDATR removed', !entflda(ctx));
}

// ===========================================================================
// Color/attrs still work exactly as before (no regression)
// ===========================================================================

console.log('\nSetting color + one attribute still commits normally (pre-existing behavior unaffected)');
{
  const ctx = setup([]);
  document.getElementById('ef-on').checked = true;
  document.getElementById('ef-color').value = 'RED';
  document.querySelector('.ef-attr[value="HI"]').checked = true;
  ctx.click();
  const kw = entflda(ctx);
  check('ENTFLDATR written with COLOR and DSPATR', !!kw && kw.parameters.indexOf('*COLOR RED') !== -1 && kw.parameters.indexOf('*DSPATR HI') !== -1);
}

// ===========================================================================
// *CURSOR / *NOCURSOR (IBM's own "F3" example)
// ===========================================================================

console.log('\nChecking "Hide the cursor" (*NOCURSOR) and Apply: written into the parameters');
{
  const ctx = setup([]);
  document.getElementById('ef-on').checked = true;
  document.getElementById('ef-nocursor').checked = true;
  ctx.click();
  const kw = entflda(ctx);
  check('ENTFLDATR written with *NOCURSOR', !!kw && kw.parameters.indexOf('*NOCURSOR') !== -1);
}

console.log('\nAn existing ENTFLDATR(*NOCURSOR (*DSPATR HI RI)) (IBM\'s own F3 order, cursor token BEFORE the DSPATR group) parses correctly and round-trips on an untouched Apply');
{
  const ctx = setup([{ name: 'ENTFLDATR', parameters: '*NOCURSOR (*DSPATR HI RI)', conditions: [], raw: '', sourceLines: [] }]);
  check('*NOCURSOR checkbox reflects existing state', document.getElementById('ef-nocursor').checked === true);
  check('DSPATR checkboxes reflect existing state (HI)', document.querySelector('.ef-attr[value="HI"]').checked === true);
  check('DSPATR checkboxes reflect existing state (RI)', document.querySelector('.ef-attr[value="RI"]').checked === true);
  ctx.click();
  const kw = entflda(ctx);
  check('*NOCURSOR survives an untouched re-Apply (previously silently dropped)', !!kw && kw.parameters.indexOf('*NOCURSOR') !== -1);
  check('DSPATR group survives too', !!kw && kw.parameters.indexOf('*DSPATR') !== -1 && kw.parameters.indexOf('HI') !== -1 && kw.parameters.indexOf('RI') !== -1);
}

console.log('\n*CURSOR (the documented default) is never re-written even if the underlying DDS has it explicit - unchecking has no *CURSOR to write, and the (default) state is simply "no cursor token at all"');
{
  const ctx = setup([{ name: 'ENTFLDATR', parameters: '*CURSOR', conditions: [], raw: '', sourceLines: [] }]);
  check('*NOCURSOR checkbox is unchecked (an explicit *CURSOR is not *NOCURSOR)', document.getElementById('ef-nocursor').checked === false);
  ctx.click();
  const kw = entflda(ctx);
  check('re-Apply keeps ENTFLDATR present', !!kw);
  check('re-Apply does not write *NOCURSOR', kw && kw.parameters.indexOf('*NOCURSOR') === -1);
}

// ===========================================================================
// Data-type advisory hint (field level only)
// ===========================================================================

console.log('\nField-level render (dataType passed) with *NOCURSOR checked on a non-I field: shows the advisory hint');
{
  document.getElementById('root').innerHTML = Helpers.entFldAtrHtml(
    [{ name: 'ENTFLDATR', parameters: '*NOCURSOR', conditions: [], raw: '', sourceLines: [] }], 'ef2', new Set(), 'A'
  );
  check('advisory hint about data type I is shown', document.getElementById('root').textContent.indexOf('requires data type I') !== -1);
}

console.log('\nField-level render with *NOCURSOR checked on an I field: no advisory hint');
{
  document.getElementById('root').innerHTML = Helpers.entFldAtrHtml(
    [{ name: 'ENTFLDATR', parameters: '*NOCURSOR', conditions: [], raw: '', sourceLines: [] }], 'ef3', new Set(), 'I'
  );
  check('no advisory hint shown for data type I', document.getElementById('root').textContent.indexOf('requires data type I') === -1);
}

console.log('\nFile/record-level render (dataType omitted) with *NOCURSOR checked: no advisory hint (no single field to check)');
{
  document.getElementById('root').innerHTML = Helpers.entFldAtrHtml(
    [{ name: 'ENTFLDATR', parameters: '*NOCURSOR', conditions: [], raw: '', sourceLines: [] }], 'ef4', new Set()
  );
  check('no advisory hint shown when dataType is omitted', document.getElementById('root').textContent.indexOf('requires data type I') === -1);
}

// ===========================================================================
// Conditioning: editing conditioning alone (via wireEntFldAtrEditor's own
// wireFlagRowConditioning callback) must not silently drop the bare/
// cursor-visible state - the exact class of bug this task fixed.
// ===========================================================================

console.log('\nEditing Conditioning alone preserves a bare ENTFLDATR and its *NOCURSOR setting');
{
  let keywords = [{ name: 'ENTFLDATR', parameters: '*NOCURSOR', conditions: [], raw: '', sourceLines: [] }];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; }
  document.getElementById('root').innerHTML = Helpers.entFldAtrHtml(keywords, 'ef5', new Set());
  Helpers.wireEntFldAtrEditor(getKeywords, onChange, 'ef5', new Set(), function () {});
  // wireFlagRowConditioning's own onChange callback (passed as the second
  // arg to wireEntFldAtrEditor's internal wireFlagRowConditioning call) is
  // exercised directly here, the same way the conditioning UI itself would
  // invoke it, rather than simulating the toggle/add-group/add-indicator
  // click sequence through selectors this test doesn't own the shape of.
  const current = DspfWriter.getChoiceColorState(getKeywords(), 'ENTFLDATR');
  onChange(DspfWriter.setChoiceColorState(getKeywords(), 'ENTFLDATR', current.color, current.attrs, [{ number: '25', negate: false }], current.cursorVisible, current.present));
  const kw = keywords.find((k) => k.name === 'ENTFLDATR');
  check('ENTFLDATR still present after a conditioning-only edit', !!kw);
  check('*NOCURSOR still present after a conditioning-only edit (previously silently dropped)', kw && kw.parameters.indexOf('*NOCURSOR') !== -1);
  check('the new conditioning was actually applied', kw && kw.conditions.length === 1 && kw.conditions[0].number === '25');
}

// ===========================================================================
// Direct unit checks on the underlying primitives (belt and suspenders -
// isolates the writer logic from the DOM-driven scenarios above).
// ===========================================================================

console.log('\nUnit: getChoiceColorState/setChoiceColorState round-trip a bare keyword and *NOCURSOR directly');
{
  const bare = DspfWriter.setChoiceColorState([], 'ENTFLDATR', '', [], undefined, '', true);
  check('forcePresent alone writes a bare keyword', bare.length === 1 && bare[0].parameters === '');
  const withNocursor = DspfWriter.setChoiceColorState([], 'ENTFLDATR', '', [], undefined, 'NOCURSOR', true);
  check('cursorVisible=NOCURSOR is written', withNocursor[0].parameters.indexOf('*NOCURSOR') !== -1);
  const state = DspfWriter.getChoiceColorState(withNocursor, 'ENTFLDATR');
  check('getChoiceColorState reads it back as NOCURSOR', state.cursorVisible === 'NOCURSOR');
  check('getChoiceColorState reports present:true', state.present === true);
  const empty = DspfWriter.setChoiceColorState([], 'ENTFLDATR', '', [], undefined, '', false);
  check('forcePresent=false with nothing else set writes nothing (unchanged old behavior)', empty.length === 0);
}

console.log('\nUnit: the three pre-existing CHCAVAIL/CHCUNAVAIL/CHCSLT callers are unaffected (new params omitted entirely)');
{
  const withColor = DspfWriter.setChoiceColorState([], 'CHCAVAIL', 'BLU', ['HI'], undefined);
  check('CHCAVAIL still writes normally with no new params passed', withColor.length === 1 && withColor[0].parameters.indexOf('*COLOR BLU') !== -1);
  const stateNoColor = DspfWriter.getChoiceColorState([], 'CHCUNAVAIL');
  check('CHCUNAVAIL with nothing set reports present:false, cursorVisible: \'\'', stateNoColor.present === false && stateNoColor.cursorVisible === '');
  const removedWhenEmpty = DspfWriter.setChoiceColorState([{ name: 'CHCSLT', parameters: '(*COLOR RED)', conditions: [], raw: '', sourceLines: [] }], 'CHCSLT', '', []);
  check('CHCSLT is still removed entirely when color/attrs are both cleared and forcePresent is omitted', removedWhenEmpty.length === 0);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

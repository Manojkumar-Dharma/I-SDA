/**
 * colorAttrPgmField.test.js
 *
 * Regression coverage for the DSPATR "program-to-system field" (hidden
 * field) case: real DDS lets a DSPATR keyword's parameter be the name of a
 * hidden (USAGE(P)) field instead of - or alongside PC, which a P-field
 * can't cover - the usual HI/RI/... literal codes (see real SDA's own
 * "Select Display Attributes" screen, docs/sda-reference/screens/
 * field-level/character/display-attributes, which shows a dedicated
 * "Program-to-system field" entry above the attribute checkboxes).
 *
 * Before this fix, WebviewClientHelpers.colorAttrStatesHtml/
 * wireColorAttrStatesEditor (and the older single-pair colorAttrEditorHtml/
 * wireColorAttrEditor) only understood the fixed DSPATR_ATTRS checkbox
 * codes:
 *   - a hidden field's name never rendered as anything in the panel (bug:
 *     "not displaying it correctly"), and
 *   - any edit to that panel (e.g. toggling an unrelated checkbox) silently
 *     DROPPED the hidden field name, since commit() only ever read the
 *     known checkboxes back out.
 *
 * This file exercises the fix in jsdom the same way
 * repeatableConditionedInstances.test.js does for the underlying shell.
 *
 * Run with: node src/test/colorAttrPgmField.test.js
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
const { Event } = dom.window;

// webviewClientHelpers.js is a UMD-ish module (same as dspfEngine.js/
// dspfWriter.js) meant to be embedded as a plain <script> tag alongside the
// others, so its colorAttr* functions reference `DspfWriter` as a bare free
// variable rather than requiring it - matching that here the same way the
// real webview's script-tag load order does.
global.DspfWriter = DspfWriter;

const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

// ===========================================================================
// Multi-state picker (colorAttrStatesHtml/wireColorAttrStatesEditor) - the
// one actually wired into the field/constant props panel.
// ===========================================================================

console.log('colorAttrStatesHtml - a DSPATR referencing a hidden (program-to-system) field renders its own input, not silently dropped');
{
  // FLDATR is a hidden USAGE(P) field's name - not one of DSPATR_ATTRS -
  // sitting alongside a real literal code (PC, which a P-field can't cover,
  // is the one attribute real DDS still needs a separate literal entry
  // for - see midrange DDS write-ups on P-fields).
  let kw = DspfWriter.setColorAttrStates([], [{ conditions: [], color: '', attrs: ['FLDATR', 'PC'] }]);
  check('setColorAttrStates writes the hidden field name straight through, unfiltered', kw[0].name === 'DSPATR' && kw[0].parameters === 'FLDATR PC');

  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(kw, 'fld1', new Set());
  const pgmFieldInput = document.getElementById('fld1-colorattr-inst0-pgmfield');
  check('the Program-to-system field input is present', !!pgmFieldInput);
  check('...and pre-filled with the hidden field name (not silently dropped from view)', pgmFieldInput && pgmFieldInput.value === 'FLDATR');
  const pcCheck = document.querySelector('.fld1-colorattr-inst0-attr[value="PC"]');
  check('the PC checkbox is present and pre-checked, alongside the field name', !!pcCheck && pcCheck.checked === true);
  const bogusCheckbox = document.querySelector('.fld1-colorattr-inst0-attr[value="FLDATR"]');
  check('the hidden field name is NOT rendered as a bogus extra checkbox', !bogusCheckbox);
}

console.log('\nwireColorAttrStatesEditor - editing an UNRELATED checkbox on the card no longer drops the hidden field name');
{
  let kw = DspfWriter.setColorAttrStates([], [{ conditions: [], color: '', attrs: ['FLDATR'] }]);
  let latest = kw;
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(kw, 'fld2', new Set());
  Helpers.wireColorAttrStatesEditor(kw, function (newKeywords) { latest = newKeywords; }, 'fld2', new Set(), function rerender() {});

  const hiCheck = document.querySelector('.fld2-colorattr-inst0-attr[value="HI"]');
  check('setup: the HI checkbox is present', !!hiCheck);
  hiCheck.checked = true;
  hiCheck.dispatchEvent(new Event('change', { bubbles: true }));

  const dspatrK = latest.find((k) => k.name === 'DSPATR');
  check('committing after toggling HI keeps the hidden field name in the written DSPATR keyword (previously lost)', !!dspatrK && dspatrK.parameters.indexOf('FLDATR') >= 0);
  check('...and adds HI alongside it', !!dspatrK && dspatrK.parameters.indexOf('HI') >= 0);
}

console.log('\nwireColorAttrStatesEditor - typing a hidden field name into the Program-to-system field input commits it');
{
  let kw = [];
  let latest = kw;
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(kw, 'fld3', new Set());
  Helpers.wireColorAttrStatesEditor(kw, function (newKeywords) { latest = newKeywords; }, 'fld3', new Set(), function rerender() {});

  const stagingPgmField = document.getElementById('fld3-colorattr-new-pgmfield');
  check('setup: the staging row\'s Program-to-system field input is present', !!stagingPgmField);
  stagingPgmField.value = 'myattr';
  const addBtn = document.querySelector('.repeat-inst-add[data-prefix="fld3-colorattr"]');
  addBtn.dispatchEvent(new Event('click', { bubbles: true }));

  const dspatrK = latest.find((k) => k.name === 'DSPATR');
  check('the new state writes DSPATR with the field name, uppercased to match DDS convention', !!dspatrK && dspatrK.parameters === 'MYATTR');
}

// ===========================================================================
// Legacy single always-unconditioned pair (colorAttrEditorHtml/
// wireColorAttrEditor) - kept for API completeness; same fix applies.
// ===========================================================================

console.log('\ncolorAttrEditorHtml/wireColorAttrEditor - the single-pair legacy editor gets the same fix');
{
  let kw = DspfWriter.setColorAttr([], '', ['FLDATR']);
  document.getElementById('root').innerHTML = Helpers.colorAttrEditorHtml(kw, 'legacy1');
  const pgmFieldInput = document.getElementById('legacy1-pgmfield');
  check('the Program-to-system field input is present and pre-filled', !!pgmFieldInput && pgmFieldInput.value === 'FLDATR');

  let latest = kw;
  Helpers.wireColorAttrEditor(kw, function (newKeywords) { latest = newKeywords; }, 'legacy1');
  const ulCheck = document.querySelector('.legacy1-attr[value="UL"]');
  ulCheck.checked = true;
  ulCheck.dispatchEvent(new Event('change', { bubbles: true }));
  const dspatrK = latest.find((k) => k.name === 'DSPATR');
  check('toggling UL keeps the hidden field name (previously lost)', !!dspatrK && dspatrK.parameters.indexOf('FLDATR') >= 0 && dspatrK.parameters.indexOf('UL') >= 0);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);

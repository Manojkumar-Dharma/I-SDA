/**
 * i56RtncsrlocWhitelistGuard.test.js
 *
 * Task I-56 - gap found while implementing I-54: RTNCSRLOC's own two
 * hand-rolled record-level commit IIFEs (wireRtncsrlocRecName/
 * wireRtncsrlocWindowMouse in webviewClientHelpers.js, Task L77) had no
 * guard of any kind - not sflWhitelistConflictReason, not
 * mnubarWhitelistConflictReason, nothing - even though RTNCSRLOC is not
 * on SFL's own whitelist (I-46) or MNUBAR's own whitelist (I-48), and it
 * bypasses all three shared guarded-wiring functions the same way
 * ENTFLDATR/PRINT did before I-53/I-54.
 *
 * Fix: a small shared rtncsrlocConflictReason() helper, checked at the
 * top of BOTH IIFEs' own commit() before either setRtncsrlocRecNameFields
 * or setRtncsrlocWindowMouseFields is called - same alert-and-revert
 * idiom as every other guard in this file, reverting all of that
 * variant's own fields back to their last-committed values on block.
 * USRDFN is deliberately left unchecked here (I-8's own audit already
 * individually considered RTNCSRLOC and found no incompatibility
 * statement - see rtncsrlocConflictReason's own doc comment).
 *
 * Runs webviewClientHelpers.js's own exported functions directly against
 * a plain jsdom document (same lightweight harness as
 * i20RecordIndicatorConditioningAudit.test.js /
 * i55RepeatableInstanceWhitelistGuard.test.js).
 * Run with: node src/test/i56RtncsrlocWhitelistGuard.test.js
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

function render(keywords, expandedSet) {
  document.getElementById('root').innerHTML = Helpers.recordKeywordsPanelsHtml(keywords, 'rk', expandedSet || new Set()).general;
}

function wire(getKeywords, onChange, expandedSet, rerender) {
  Helpers.wireRecordKeywordsPanels('rk', getKeywords, onChange, expandedSet || new Set(), rerender || function () {});
}

function withAlertCapture(fn) {
  let alertMessage = null;
  const originalAlert = global.window.alert;
  global.window.alert = function (msg) { alertMessage = msg; };
  fn();
  global.window.alert = originalAlert;
  return alertMessage;
}

function setup(initialKeywords) {
  let keywords = initialKeywords;
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  return { getKeywords, onChange };
}

// ===========================================================================
// *RECNAME variant (wireRtncsrlocRecName)
// ===========================================================================

console.log('RTNCSRLOC *RECNAME: blocked on a plain SFL record, fields revert');
{
  const ctx = setup([{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  const onEl = document.getElementById('rk-rtncsrloc-rn-on');
  const recEl = document.getElementById('rk-rtncsrloc-rn-rec');
  const fldEl = document.getElementById('rk-rtncsrloc-rn-fld');
  check('setup: *RECNAME checkbox present', !!onEl);
  onEl.checked = true;
  recEl.value = 'MYREC';
  fldEl.value = 'MYFLD';
  const msg = withAlertCapture(function () { onEl.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check('blocked with an alert naming subfile (SFL)', !!msg && msg.indexOf('subfile (SFL)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
  check('checkbox reverted to unchecked', document.getElementById('rk-rtncsrloc-rn-on').checked === false);
}

console.log('\nRTNCSRLOC *RECNAME: blocked on a MNUBAR record, fields revert');
{
  const ctx = setup([{ name: 'MNUBAR', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  const onEl = document.getElementById('rk-rtncsrloc-rn-on');
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-rn-rec').value = 'MYREC';
  document.getElementById('rk-rtncsrloc-rn-fld').value = 'MYFLD';
  const msg = withAlertCapture(function () { onEl.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check('blocked with an alert naming menu-bar (MNUBAR)', !!msg && msg.indexOf('menu-bar (MNUBAR)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
}

console.log('\nRTNCSRLOC *RECNAME: still commits normally on a plain record (unaffected)');
{
  const ctx = setup([]);
  const onEl = document.getElementById('rk-rtncsrloc-rn-on');
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-rn-rec').value = 'MYREC';
  document.getElementById('rk-rtncsrloc-rn-fld').value = 'MYFLD';
  const msg = withAlertCapture(function () { onEl.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check('no alert fired', !msg);
  const kw = ctx.getKeywords().find((k) => k.name === 'RTNCSRLOC');
  check('RTNCSRLOC (*RECNAME variant) committed', !!kw && kw.parameters.indexOf('MYREC') !== -1 && kw.parameters.indexOf('MYFLD') !== -1);
}

// ===========================================================================
// *WINDOW/*MOUSE variant (wireRtncsrlocWindowMouse)
// ===========================================================================

console.log('\nRTNCSRLOC *WINDOW/*MOUSE: blocked on a plain SFL record, fields revert');
{
  const ctx = setup([{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  const onEl = document.getElementById('rk-rtncsrloc-wm-on');
  check('setup: *WINDOW/*MOUSE checkbox present', !!onEl);
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  document.getElementById('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg = withAlertCapture(function () { onEl.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check('blocked with an alert naming subfile (SFL)', !!msg && msg.indexOf('subfile (SFL)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
  check('checkbox reverted to unchecked', document.getElementById('rk-rtncsrloc-wm-on').checked === false);
}

console.log('\nRTNCSRLOC *WINDOW/*MOUSE: blocked on a MNUBAR record, fields revert');
{
  const ctx = setup([{ name: 'MNUBAR', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  const onEl = document.getElementById('rk-rtncsrloc-wm-on');
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  document.getElementById('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg = withAlertCapture(function () { onEl.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check('blocked with an alert naming menu-bar (MNUBAR)', !!msg && msg.indexOf('menu-bar (MNUBAR)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
}

console.log('\nRTNCSRLOC *WINDOW/*MOUSE: still commits normally on a plain record (unaffected)');
{
  const ctx = setup([]);
  const onEl = document.getElementById('rk-rtncsrloc-wm-on');
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  document.getElementById('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg = withAlertCapture(function () { onEl.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check('no alert fired', !msg);
  const kw = ctx.getKeywords().find((k) => k.name === 'RTNCSRLOC');
  check('RTNCSRLOC (*WINDOW variant) committed', !!kw && kw.parameters.indexOf('ROWFLD') !== -1 && kw.parameters.indexOf('COLFLD') !== -1);
}

console.log('\nRTNCSRLOC: both variants independent - blocking one on SFL leaves the other alone (unrelated to this guard, sanity check on the shared closure)');
{
  const ctx = setup([{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
  const rnOn = document.getElementById('rk-rtncsrloc-rn-on');
  rnOn.checked = true;
  withAlertCapture(function () { rnOn.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  const wmOn = document.getElementById('rk-rtncsrloc-wm-on');
  wmOn.checked = true;
  withAlertCapture(function () { wmOn.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  check('neither variant was added (both blocked independently)', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

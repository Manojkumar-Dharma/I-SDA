/**
 * i77RtncsrlocUsrdfnGuard.test.js
 *
 * Task I-77 - follow-up from I-56/I-60. I-56 guarded RTNCSRLOC's two
 * hand-rolled record-level commits (*RECNAME and *WINDOW/*MOUSE) against
 * SFL and MNUBAR records but deliberately left USRDFN out, citing I-8's
 * audit ("no incompatibility statement found").
 *
 * That reasoning is wrong once USRDFN's own DDS Reference text is read
 * as the closed whitelist I-44/I-49 established: "No file- or
 * record-level keywords apply to this record except INVITE, KEEP,
 * PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT." RTNCSRLOC is
 * not on it - and RTNCSRLOC's own parameters must be hidden fields of
 * the same record, while USRDFN's text also says "No fields are valid
 * for this record".
 *
 * Fix: rtncsrlocConflictReason now also consults
 * DspfWriter.usrdfnWhitelistConflictReason (I-49) - on the ON-transition
 * only, so a hand-edited USRDFN record that already carries RTNCSRLOC
 * can still have it removed.
 *
 * Runs webviewClientHelpers.js's own exported functions directly against
 * a plain jsdom document (same lightweight harness as
 * i56RtncsrlocWhitelistGuard.test.js).
 * Run with: node src/test/i77RtncsrlocUsrdfnGuard.test.js
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

function kwd(name, parameters) {
  return { name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] };
}

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

function fire(el) {
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

// ===========================================================================
// Unit: the shared whitelist function itself (also what the raw editor uses)
// ===========================================================================

console.log('usrdfnWhitelistConflictReason: RTNCSRLOC is not whitelisted, TEXT is');
{
  const usr = [kwd('USRDFN')];
  const r = DspfWriter.usrdfnWhitelistConflictReason('RTNCSRLOC', usr);
  check('RTNCSRLOC on a USRDFN record returns a reason naming user-defined (USRDFN)', !!r && r.indexOf('user-defined (USRDFN)') !== -1);
  check('reason names RTNCSRLOC itself', !!r && r.indexOf('RTNCSRLOC') !== -1);
  check('TEXT (whitelisted) on a USRDFN record returns null', DspfWriter.usrdfnWhitelistConflictReason('TEXT', usr) === null);
  check('RTNCSRLOC on a non-USRDFN record returns null', DspfWriter.usrdfnWhitelistConflictReason('RTNCSRLOC', []) === null);
}

// ===========================================================================
// *RECNAME variant (wireRtncsrlocRecName)
// ===========================================================================

console.log('\nRTNCSRLOC *RECNAME: blocked on a USRDFN record, fields revert');
{
  const ctx = setup([kwd('USRDFN')]);
  const onEl = document.getElementById('rk-rtncsrloc-rn-on');
  check('setup: *RECNAME checkbox present on a USRDFN record', !!onEl);
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-rn-rec').value = 'MYREC';
  document.getElementById('rk-rtncsrloc-rn-fld').value = 'MYFLD';
  const msg = withAlertCapture(function () { fire(onEl); });
  check('blocked with an alert naming user-defined (USRDFN)', !!msg && msg.indexOf('user-defined (USRDFN)') !== -1);
  check('alert names RTNCSRLOC itself', !!msg && msg.indexOf('RTNCSRLOC') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
  check('checkbox reverted to unchecked', document.getElementById('rk-rtncsrloc-rn-on').checked === false);
  check('USRDFN itself still present', ctx.getKeywords().some((k) => k.name === 'USRDFN'));
}

// ===========================================================================
// *WINDOW/*MOUSE variant (wireRtncsrlocWindowMouse)
// ===========================================================================

console.log('\nRTNCSRLOC *WINDOW/*MOUSE: blocked on a USRDFN record, fields revert');
{
  const ctx = setup([kwd('USRDFN')]);
  const onEl = document.getElementById('rk-rtncsrloc-wm-on');
  check('setup: *WINDOW/*MOUSE checkbox present on a USRDFN record', !!onEl);
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  document.getElementById('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg = withAlertCapture(function () { fire(onEl); });
  check('blocked with an alert naming user-defined (USRDFN)', !!msg && msg.indexOf('user-defined (USRDFN)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
  check('checkbox reverted to unchecked', document.getElementById('rk-rtncsrloc-wm-on').checked === false);
}

console.log('\nRTNCSRLOC *MOUSE type selection is blocked on a USRDFN record too');
{
  const ctx = setup([kwd('USRDFN')]);
  const onEl = document.getElementById('rk-rtncsrloc-wm-on');
  const typeEl = document.getElementById('rk-rtncsrloc-wm-type');
  onEl.checked = true;
  typeEl.value = 'MOUSE';
  document.getElementById('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  document.getElementById('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg = withAlertCapture(function () { fire(typeEl); });
  check('blocked with an alert naming user-defined (USRDFN)', !!msg && msg.indexOf('user-defined (USRDFN)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
}

// ===========================================================================
// Turning OFF is never blocked (hand-edited USRDFN record already has it)
// ===========================================================================

console.log('\nUSRDFN record with pre-existing (hand-edited) RTNCSRLOC *RECNAME: turning it OFF is not blocked');
{
  const ctx = setup([kwd('USRDFN'), kwd('RTNCSRLOC', '&RCD &FLD')]);
  const onEl = document.getElementById('rk-rtncsrloc-rn-on');
  check('setup: *RECNAME checkbox rendered checked', !!onEl && onEl.checked === true);
  onEl.checked = false;
  const msg = withAlertCapture(function () { fire(onEl); });
  check('no alert fired when turning RTNCSRLOC off', !msg);
  check('RTNCSRLOC actually removed', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
  check('USRDFN itself still present after the removal', ctx.getKeywords().some((k) => k.name === 'USRDFN'));
}

console.log('\nUSRDFN record with pre-existing (hand-edited) RTNCSRLOC *WINDOW/*MOUSE: turning it OFF is not blocked');
{
  const ctx = setup([kwd('USRDFN'), kwd('RTNCSRLOC', '*MOUSE &ROW &COL')]);
  const onEl = document.getElementById('rk-rtncsrloc-wm-on');
  check('setup: *WINDOW/*MOUSE checkbox rendered checked', !!onEl && onEl.checked === true);
  onEl.checked = false;
  const msg = withAlertCapture(function () { fire(onEl); });
  check('no alert fired when turning RTNCSRLOC off', !msg);
  check('RTNCSRLOC actually removed', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
  check('USRDFN itself still present after the removal', ctx.getKeywords().some((k) => k.name === 'USRDFN'));
}

// ===========================================================================
// No regression: I-56's SFL/MNUBAR guards and plain records
// ===========================================================================

console.log('\nno regression: SFL record still blocked (I-56)');
{
  const ctx = setup([kwd('SFL')]);
  const onEl = document.getElementById('rk-rtncsrloc-rn-on');
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-rn-rec').value = 'MYREC';
  document.getElementById('rk-rtncsrloc-rn-fld').value = 'MYFLD';
  const msg = withAlertCapture(function () { fire(onEl); });
  check('blocked with an alert naming subfile (SFL)', !!msg && msg.indexOf('subfile (SFL)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
}

console.log('\nno regression: MNUBAR record still blocked (I-56)');
{
  const ctx = setup([kwd('MNUBAR')]);
  const onEl = document.getElementById('rk-rtncsrloc-wm-on');
  onEl.checked = true;
  document.getElementById('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  document.getElementById('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg = withAlertCapture(function () { fire(onEl); });
  check('blocked with an alert naming menu-bar (MNUBAR)', !!msg && msg.indexOf('menu-bar (MNUBAR)') !== -1);
  check('no RTNCSRLOC keyword was added', !ctx.getKeywords().some((k) => k.name === 'RTNCSRLOC'));
}

console.log('\nno regression: plain record still commits both variants normally');
{
  const ctx = setup([]);
  const rnOn = document.getElementById('rk-rtncsrloc-rn-on');
  rnOn.checked = true;
  document.getElementById('rk-rtncsrloc-rn-rec').value = 'MYREC';
  document.getElementById('rk-rtncsrloc-rn-fld').value = 'MYFLD';
  const msg1 = withAlertCapture(function () { fire(rnOn); });
  check('no alert fired for *RECNAME', !msg1);
  const wmOn = document.getElementById('rk-rtncsrloc-wm-on');
  wmOn.checked = true;
  document.getElementById('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  document.getElementById('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg2 = withAlertCapture(function () { fire(wmOn); });
  check('no alert fired for *WINDOW/*MOUSE', !msg2);
  const all = ctx.getKeywords().filter((k) => k.name === 'RTNCSRLOC');
  check('both RTNCSRLOC instances committed', all.length === 2);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

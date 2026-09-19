/**
 * i84RtncsrlocOnTransitionOnly.test.js
 *
 * Task I-84 - follow-up from I-77. rtncsrlocConflictReason (the record-level
 * RTNCSRLOC commit guard in wireRecordKeywordsPanels) was
 *
 *   (turningOn && USRDFN check) || SFL check || MNUBAR check
 *
 * so only USRDFN's check (added by I-77) was on-transition-only: I-56's SFL
 * and MNUBAR checks ran on EVERY commit. On an SFL or MNUBAR record that
 * already carries a hand-edited RTNCSRLOC, UN-ticking the box was blocked
 * with a misleading "cannot be added" alert (the only way out was the raw
 * keyword editor's chip), and so was merely editing the existing keyword's
 * parameters.
 *
 * Fix: all three checks are now gated on a real turn-on - and "turning on" is
 * the actual TRANSITION for that variant (its checkbox is now ticked AND the
 * keyword variant was NOT already present), not just the checkbox state. That
 * is the same diff-based posture as I-58 / I-61 / I-62 / I-81: only an edit
 * that INTRODUCES the conflict is blocked; a record that was already invalid
 * is never re-reported, and removing the keyword is always allowed. The two
 * RTNCSRLOC variants (*RECNAME and *WINDOW/*MOUSE) are independent, so
 * turning the OTHER variant on is still an addition and is still blocked.
 *
 * Runs webviewClientHelpers.js's own exported functions directly against a
 * plain jsdom document (same lightweight harness as
 * i77RtncsrlocUsrdfnGuard.test.js).
 * Run with: node src/test/i84RtncsrlocOnTransitionOnly.test.js
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
const el = (id) => document.getElementById(id);
const rtn = (ctx) => ctx.getKeywords().filter((k) => k.name === 'RTNCSRLOC');
const has = (ctx, name) => ctx.getKeywords().some((k) => k.name === name);

// The two variants: [label, checkbox id, hand-edited parameters]
const RN = { label: '*RECNAME', on: 'rk-rtncsrloc-rn-on', params: '&RCD &FLD' };
const WM = { label: '*WINDOW/*MOUSE', on: 'rk-rtncsrloc-wm-on', params: '*MOUSE &ROW &COL' };

// ===========================================================================
// Group A - the bug: UN-ticking a hand-edited RTNCSRLOC on SFL / MNUBAR
// ===========================================================================
[['SFL', 'subfile (SFL)'], ['MNUBAR', 'menu-bar (MNUBAR)']].forEach(([recType, recWord]) => {
  [RN, WM].forEach((v) => {
    console.log('\n' + recType + ' record with a hand-edited RTNCSRLOC ' + v.label + ': un-ticking it is not blocked');
    const ctx = setup([kwd(recType), kwd('RTNCSRLOC', v.params)]);
    const onEl = el(v.on);
    check('setup: the ' + v.label + ' checkbox is rendered checked', !!onEl && onEl.checked === true);
    if (onEl) {
      onEl.checked = false;
      const msg = withAlertCapture(function () { fire(onEl); });
      check('no alert fired (no misleading "cannot be added")', !msg);
      check('RTNCSRLOC actually removed', rtn(ctx).length === 0);
      check(recType + ' itself still present', has(ctx, recType));
    }
  });
});

// ===========================================================================
// Group B - editing the parameters of an EXISTING RTNCSRLOC is not an addition
// ===========================================================================
console.log('\nSFL record with a hand-edited RTNCSRLOC *RECNAME: editing its record name is not blocked');
{
  const ctx = setup([kwd('SFL'), kwd('RTNCSRLOC', RN.params)]);
  const recEl = el('rk-rtncsrloc-rn-rec');
  check('setup: the checkbox is checked and the record-name field shows &RCD', !!recEl && el(RN.on).checked === true && recEl.value === '&RCD');
  if (recEl) {
    recEl.value = 'NEWRCD';
    const msg = withAlertCapture(function () { fire(recEl); });
    check('no alert fired', !msg);
    const k = rtn(ctx)[0];
    check('the keyword was updated to the new record name', !!k && /NEWRCD/.test(k.parameters));
    check('still exactly one RTNCSRLOC', rtn(ctx).length === 1);
  }
}

console.log('\nMNUBAR record with a hand-edited RTNCSRLOC *MOUSE: editing its row field is not blocked');
{
  const ctx = setup([kwd('MNUBAR'), kwd('RTNCSRLOC', WM.params)]);
  const rowEl = el('rk-rtncsrloc-wm-row1');
  check('setup: the checkbox is checked and the row field shows &ROW', !!rowEl && el(WM.on).checked === true && rowEl.value === '&ROW');
  if (rowEl) {
    rowEl.value = 'NEWROW';
    const msg = withAlertCapture(function () { fire(rowEl); });
    check('no alert fired', !msg);
    const k = rtn(ctx)[0];
    check('the keyword was updated to the new row field', !!k && /NEWROW/.test(k.parameters));
    check('still exactly one RTNCSRLOC', rtn(ctx).length === 1);
  }
}

console.log('\nUSRDFN record with a hand-edited RTNCSRLOC *RECNAME: editing its record name is not blocked either');
{
  const ctx = setup([kwd('USRDFN'), kwd('RTNCSRLOC', RN.params)]);
  const recEl = el('rk-rtncsrloc-rn-rec');
  if (recEl) {
    recEl.value = 'NEWRCD';
    const msg = withAlertCapture(function () { fire(recEl); });
    check('no alert fired', !msg);
    check('the keyword was updated', rtn(ctx).length === 1 && /NEWRCD/.test(rtn(ctx)[0].parameters));
  } else {
    check('setup: the record-name field is rendered', false);
  }
}

// ===========================================================================
// Group C - no regression: turning it ON is still blocked, and the control reverts
// ===========================================================================
[['SFL', 'subfile (SFL)'], ['MNUBAR', 'menu-bar (MNUBAR)'], ['USRDFN', 'user-defined (USRDFN)']].forEach(([recType, recWord]) => {
  [RN, WM].forEach((v) => {
    console.log('\nno regression: turning ' + v.label + ' ON is still blocked on a ' + recType + ' record');
    const ctx = setup([kwd(recType)]);
    const onEl = el(v.on);
    onEl.checked = true;
    if (v === RN) {
      el('rk-rtncsrloc-rn-rec').value = 'MYREC';
      el('rk-rtncsrloc-rn-fld').value = 'MYFLD';
    } else {
      el('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
      el('rk-rtncsrloc-wm-col1').value = 'COLFLD';
    }
    const msg = withAlertCapture(function () { fire(onEl); });
    check('blocked with an alert naming ' + recWord, !!msg && msg.indexOf(recWord) !== -1);
    check('alert names RTNCSRLOC', !!msg && msg.indexOf('RTNCSRLOC') !== -1);
    check('no RTNCSRLOC keyword was added', rtn(ctx).length === 0);
    check('the checkbox reverted to unchecked', el(v.on).checked === false);
  });
});

// ===========================================================================
// Group D - the two variants are independent: turning the OTHER one on is an addition
// ===========================================================================
console.log('\nSFL record that already has RTNCSRLOC *RECNAME: turning *WINDOW/*MOUSE ON is still blocked');
{
  const ctx = setup([kwd('SFL'), kwd('RTNCSRLOC', RN.params)]);
  const wmOn = el(WM.on);
  check('setup: *RECNAME is checked and *WINDOW/*MOUSE is not', el(RN.on).checked === true && wmOn.checked === false);
  wmOn.checked = true;
  el('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  el('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg = withAlertCapture(function () { fire(wmOn); });
  check('blocked with an alert naming subfile (SFL)', !!msg && msg.indexOf('subfile (SFL)') !== -1);
  check('the existing *RECNAME instance is untouched and no second one was added', rtn(ctx).length === 1 && rtn(ctx)[0].parameters === RN.params);
  check('the *WINDOW/*MOUSE checkbox reverted to unchecked', el(WM.on).checked === false);
}

// ===========================================================================
// Group E - no regression: a plain record
// ===========================================================================
console.log('\nno regression: plain record commits both variants, and removing one keeps the other');
{
  const ctx = setup([]);
  const rnOn = el(RN.on);
  rnOn.checked = true;
  el('rk-rtncsrloc-rn-rec').value = 'MYREC';
  el('rk-rtncsrloc-rn-fld').value = 'MYFLD';
  const msg1 = withAlertCapture(function () { fire(rnOn); });
  check('no alert fired for *RECNAME', !msg1);
  const wmOn = el(WM.on);
  wmOn.checked = true;
  el('rk-rtncsrloc-wm-row1').value = 'ROWFLD';
  el('rk-rtncsrloc-wm-col1').value = 'COLFLD';
  const msg2 = withAlertCapture(function () { fire(wmOn); });
  check('no alert fired for *WINDOW/*MOUSE', !msg2);
  check('both RTNCSRLOC instances committed', rtn(ctx).length === 2);
  const rnOff = el(RN.on);
  rnOff.checked = false;
  const msg3 = withAlertCapture(function () { fire(rnOff); });
  check('un-ticking *RECNAME fires no alert', !msg3);
  check('only the *WINDOW/*MOUSE instance remains', rtn(ctx).length === 1 && /\*MOUSE|\*WINDOW/.test(rtn(ctx)[0].parameters));
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
if (failures) process.exitCode = 1;

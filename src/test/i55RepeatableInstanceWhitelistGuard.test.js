/**
 * i55RepeatableInstanceWhitelistGuard.test.js
 *
 * Task I-55 - follow-up from I-53. I-53's own exhaustive checkbox sweep
 * only covered the plain flag/two-field/bespoke-commit rows on the
 * General/Indicator/Help/Output/Input/Overlay/Print tabs; the generic
 * repeatable-instance editor (repeatableConditionedInstancesHtml/
 * wireRepeatableConditionedInstances - MNUBARDSP, the record Indicator-
 * keywords model, MOUBTN, Color & attributes, Error messages, Message ID,
 * SFLMSG/SFLMSGID, CHECK, HLPTITLE) was explicitly out of that task's own
 * scope, logged here as its own follow-up.
 *
 * Fix, two parts:
 *  1. wireRepeatableConditionedInstances gained a new optional trailing
 *     `addGuardFn(freshInstance) -> reason|null`, checked once on every
 *     "+ Add" click (the only "on transition" this generic component
 *     itself performs) - same alert-and-no-op idiom as every other
 *     SFL/MNUBAR whitelist guard in this codebase. Wired at MNUBARDSP's
 *     own call site (wireMnubardspPanel) against sflWhitelistConflictReason
 *     (I-46's finding: MNUBARDSP is not on SFL's own whitelist).
 *     USRDFN is deliberately NOT checked - I-8's own record-level audit
 *     explicitly named MNUBARDSP among the keywords individually checked
 *     against USRDFN's DDS Reference text with no incompatibility found
 *     ("left alone rather than guessed at"), and I-55's own keywordFixes.md
 *     row scopes this to the SFL whitelist only. mnubarWhitelistConflictReason
 *     is also NOT checked there - MNUBARDSP IS on MNUBAR's own whitelist.
 *  2. The record Indicator-keywords model's own per-row "kind" dropdown
 *     can change AFTER an instance already exists (unlike MNUBARDSP,
 *     whose instance identity never changes), so the addGuardFn hook
 *     alone wouldn't catch that - generalized I-20's own CLEAR-vs-
 *     PULLDOWN-only guardedUpdate check (recordIndicatorKindConflictReason)
 *     to also run sflWhitelistConflictReason/mnubarWhitelistConflictReason
 *     for whichever kind is being set, and generalized the CLEAR/HOME
 *     makeDefaultInstance fallback into an ordered list ending at INDTXT
 *     (confirmed safe on every whitelist this component can encounter),
 *     so "+ Add indicator keyword" still always seeds something on every
 *     record type instead of silently no-op'ing.
 *
 * Runs webviewClientHelpers.js's own exported functions directly against
 * a plain jsdom document (same lightweight harness as
 * i20RecordIndicatorConditioningAudit.test.js) rather than the full
 * generated webview bundle.
 * Run with: node src/test/i55RepeatableInstanceWhitelistGuard.test.js
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
  document.getElementById('root').innerHTML = Helpers.recordKeywordsPanelsHtml(keywords, 'rk', expandedSet || new Set()).general +
    Helpers.recordKeywordsPanelsHtml(keywords, 'rk', expandedSet || new Set()).indicatorKeywords;
}

function wire(getKeywords, onChange, expandedSet, rerender) {
  Helpers.wireRecordKeywordsPanels('rk', getKeywords, onChange, expandedSet || new Set(), rerender || function () {});
}

function clickAddCapturingAlert(selector) {
  let alertMessage = null;
  const originalAlert = global.window.alert;
  global.window.alert = function (msg) { alertMessage = msg; };
  const btn = document.querySelector(selector);
  const missing = !btn;
  if (btn) btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  global.window.alert = originalAlert;
  return { alertMessage, missing };
}

// ===========================================================================
// Part 1: MNUBARDSP's own "+ Add" button, guarded via the new addGuardFn.
// ===========================================================================

console.log('MNUBARDSP "+ Add": blocked on a plain SFL record (not on SFL\'s own whitelist)');
{
  let keywords = [{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const before = keywords.length;
  const result = clickAddCapturingAlert('.repeat-inst-add[data-prefix="rk-mnubardsp-rep"]');
  check('setup: "+ Add" button is present', !result.missing);
  check('blocked with an alert naming subfile (SFL)', !!result.alertMessage && result.alertMessage.indexOf('subfile (SFL)') !== -1);
  check('no MNUBARDSP instance was added', keywords.length === before && !keywords.some((k) => k.name === 'MNUBARDSP'));
}

console.log('\nMNUBARDSP "+ Add": still commits normally on a USRDFN record (I-8\'s own audit deliberately did not find MNUBARDSP individually documented as incompatible with USRDFN - "left alone rather than guessed at" - so this is intentionally unguarded here, unlike SFL)');
{
  let keywords = [{ name: 'USRDFN', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const result = clickAddCapturingAlert('.repeat-inst-add[data-prefix="rk-mnubardsp-rep"]');
  check('no alert fired for MNUBARDSP on a USRDFN record', !result.alertMessage);
  check('MNUBARDSP instance was added', keywords.some((k) => k.name === 'MNUBARDSP'));
}

console.log('\nMNUBARDSP "+ Add": still commits normally on a MNUBAR record (MNUBARDSP IS on MNUBAR\'s own whitelist)');
{
  let keywords = [{ name: 'MNUBAR', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const result = clickAddCapturingAlert('.repeat-inst-add[data-prefix="rk-mnubardsp-rep"]');
  check('no alert fired for MNUBARDSP on a MNUBAR record', !result.alertMessage);
  check('MNUBARDSP instance was added', keywords.some((k) => k.name === 'MNUBARDSP'));
}

console.log('\nMNUBARDSP "+ Add": still commits normally on a plain record (unaffected)');
{
  let keywords = [];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const result = clickAddCapturingAlert('.repeat-inst-add[data-prefix="rk-mnubardsp-rep"]');
  check('no alert fired for MNUBARDSP on a plain record', !result.alertMessage);
  check('MNUBARDSP instance was added', keywords.some((k) => k.name === 'MNUBARDSP'));
}

// ===========================================================================
// Part 2: the record Indicator-keywords model - "+ Add" always seeds a
// safe kind, and explicitly switching kind afterward is blocked.
// ===========================================================================

console.log('\nRecord Indicator keywords "+ Add" on a plain SFL record: falls back to CHANGE (first whitelist-safe kind), not CLEAR, with no alert');
{
  let keywords = [{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const result = clickAddCapturingAlert('.repeat-inst-add[data-prefix="rk-recind-rep"]');
  check('no alert fired (a safe kind was auto-selected)', !result.alertMessage);
  const added = keywords.find((k) => ['CLEAR', 'HOME', 'PAGEDOWN', 'PAGEUP', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'].indexOf(k.name) !== -1);
  check('an indicator keyword was added', !!added);
  check('the auto-selected kind is CHANGE (on SFL\'s own whitelist)', added && added.name === 'CHANGE');
}

console.log('\nRecord Indicator keywords: explicitly switching kind to HOME on an SFL record is blocked');
{
  let keywords = [
    { name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] },
    { name: 'CHANGE', parameters: '10', conditions: [], raw: '', sourceLines: [] },
  ];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const kindSel = document.querySelector('.rk-recind-rep-inst0-kind');
  check('setup: kind dropdown for the existing CHANGE row is present', !!kindSel);
  let alertMessage = null;
  const originalAlert = global.window.alert;
  global.window.alert = function (msg) { alertMessage = msg; };
  kindSel.value = 'HOME';
  kindSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  global.window.alert = originalAlert;
  check('blocked with an alert naming subfile (SFL)', !!alertMessage && alertMessage.indexOf('subfile (SFL)') !== -1);
  check('the underlying keyword is still CHANGE, not HOME', keywords.some((k) => k.name === 'CHANGE') && !keywords.some((k) => k.name === 'HOME'));
}

console.log('\nRecord Indicator keywords "+ Add" on a MNUBAR record: still defaults to CLEAR (CLEAR IS on MNUBAR\'s own whitelist)');
{
  let keywords = [
    { name: 'MNUBAR', parameters: '', conditions: [], raw: '', sourceLines: [] },
  ];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const result = clickAddCapturingAlert('.repeat-inst-add[data-prefix="rk-recind-rep"]');
  check('no alert fired', !result.alertMessage);
  check('CLEAR was added', keywords.some((k) => k.name === 'CLEAR'));
}

console.log('\nRecord Indicator keywords: explicitly switching kind to SETOF on a MNUBAR record is blocked (SETOF not on MNUBAR\'s own whitelist)');
{
  let keywords = [
    { name: 'MNUBAR', parameters: '', conditions: [], raw: '', sourceLines: [] },
    { name: 'CLEAR', parameters: '10', conditions: [], raw: '', sourceLines: [] },
  ];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const kindSel = document.querySelector('.rk-recind-rep-inst0-kind');
  check('setup: kind dropdown for the existing CLEAR row is present', !!kindSel);
  let alertMessage = null;
  const originalAlert = global.window.alert;
  global.window.alert = function (msg) { alertMessage = msg; };
  kindSel.value = 'SETOF';
  kindSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  global.window.alert = originalAlert;
  check('blocked with an alert naming menu-bar (MNUBAR)', !!alertMessage && alertMessage.indexOf('menu-bar (MNUBAR)') !== -1);
  check('the underlying keyword is still CLEAR, not SETOF', keywords.some((k) => k.name === 'CLEAR') && !keywords.some((k) => k.name === 'SETOF'));
}

console.log('\nRecord Indicator keywords "+ Add" on a plain (non-SFL, non-MNUBAR) record: unaffected, still defaults to CLEAR');
{
  let keywords = [];
  function getKeywords() { return keywords; }
  function onChange(next) { keywords = next; render(keywords); wire(getKeywords, onChange); }
  render(keywords);
  wire(getKeywords, onChange);
  const result = clickAddCapturingAlert('.repeat-inst-add[data-prefix="rk-recind-rep"]');
  check('no alert fired', !result.alertMessage);
  check('CLEAR was added', keywords.some((k) => k.name === 'CLEAR'));
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

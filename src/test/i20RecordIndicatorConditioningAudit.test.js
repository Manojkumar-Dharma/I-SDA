/**
 * i20RecordIndicatorConditioningAudit.test.js
 *
 * Task I-20 - the repeatable Indicator-instance model (Task L5d's record-
 * level "Define Indicator Keywords" panel - CLEAR/PAGEDOWN/PAGEUP/HOME/
 * HELP/HLPRTN/VLDCMDKEY/SETOF/CHANGE/INDTXT, see webviewClientHelpers.js's
 * recordIndicatorInstancesHtml/wireRecordIndicatorInstances) was flagged by
 * both I-7 and I-13 as not kind-aware: the shared repeatable-instance
 * component (repeatableConditionedInstancesHtml/
 * wireRepeatableConditionedInstances) always rendered a Conditioning
 * toggle for every instance regardless of `kind`, even though the DDS
 * Reference states, in each keyword's own opening text, "Option
 * indicators are not valid for this keyword" for VLDCMDKEY, SETOF,
 * CHANGE, and INDTXT specifically - the other six kinds (CLEAR/PAGEDOWN/
 * PAGEUP/HOME/HELP/HLPRTN) instead say "Option indicators are valid for
 * this keyword".
 *
 * Fix: the two shared primitives now take an OPTIONAL per-instance
 * `isConditionable(inst)` predicate (defaulting to "always true" so every
 * OTHER caller - Color & attributes, Validity check, MOUBTN, SFLMSG/
 * SFLMSGID - is unaffected), and recordIndicatorInstancesHtml/
 * wireRecordIndicatorInstances now pass one that rejects the four
 * no-conditioning kinds.
 *
 * Covers both layers:
 *  - The shared primitive's own `isConditionable` behavior in isolation
 *    (a synthetic mixed list, not tied to the record-indicator keyword
 *    set at all).
 *  - The real record-indicator wiring's per-kind behavior across all ten
 *    kinds, plus confirmation that an instance whose Conditioning toggle
 *    is hidden still round-trips any conditions it already carried
 *    (existing-invalid-data-preserved convention, same as I-14's own
 *    MNUBAR fix).
 *
 * Run with: node src/test/i20RecordIndicatorConditioningAudit.test.js
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

// recordIndicatorInstancesHtml/wireRecordIndicatorInstances reference the
// bare `DspfWriter` identifier as a global (in the real webview it's
// injected as part of one bundled script - see buildWebviewTemplate.js) -
// set it here the same way before requiring webviewClientHelpers.js.
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

// ===========================================================================
// Shared primitive: `isConditionable` predicate, tested in isolation with a
// synthetic payload shape (not the record-indicator keyword set) so this
// coverage is clearly about the generic mechanism, not any one caller.
// ===========================================================================

console.log('repeatableConditionedInstancesHtml - isConditionable predicate (generic, synthetic instances)');
{
  function renderPayload(inst, instIdPrefix) {
    return '<span id="' + instIdPrefix + '-label">' + inst.label + '</span>';
  }
  function onlyBAllowsConditioning(inst) { return inst.label === 'B'; }

  const instances = [
    { label: 'A', conditions: [] },
    { label: 'B', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }] },
  ];
  document.getElementById('root').innerHTML = Helpers.repeatableConditionedInstancesHtml(
    instances, 'gen', renderPayload, new Set(), undefined, undefined, onlyBAllowsConditioning
  );
  const cards = document.querySelectorAll('.repeat-inst');
  check('both instances still render as cards', cards.length === 2);
  check('non-conditionable instance (A) has no Conditioning toggle', !cards[0].querySelector('.repeat-inst-cond-toggle'));
  check('non-conditionable instance (A) shows the "not valid" hint instead', cards[0].textContent.indexOf('Option indicators are not valid for this keyword') >= 0);
  check('conditionable instance (B) DOES have a Conditioning toggle', !!cards[1].querySelector('.repeat-inst-cond-toggle'));
  check("B's existing condition count still shows", cards[1].querySelector('.repeat-inst-cond-toggle').textContent.indexOf('(1)') >= 0);

  // A stale expandedSet entry for the non-conditionable row must not force
  // its accordion body open - the predicate wins even if some other code
  // path (e.g. a leftover Set entry from before this fix) marked it
  // expanded.
  document.getElementById('root').innerHTML = Helpers.repeatableConditionedInstancesHtml(
    instances, 'gen2', renderPayload, new Set(['gen2:0']), undefined, undefined, onlyBAllowsConditioning
  );
  check('stale expandedSet entry on a non-conditionable row does not open its accordion body', document.querySelectorAll('.repeat-inst-cond-body').length === 0);
}

console.log('\nrepeatableConditionedInstancesHtml - omitting isConditionable entirely behaves exactly as before (every other existing caller)');
{
  function renderPayload(inst, instIdPrefix) {
    return '<span id="' + instIdPrefix + '-label">' + inst.label + '</span>';
  }
  const instances = [{ label: 'X', conditions: [] }];
  document.getElementById('root').innerHTML = Helpers.repeatableConditionedInstancesHtml(instances, 'nopred', renderPayload, new Set());
  check('Conditioning toggle still renders when isConditionable is omitted', !!document.querySelector('.repeat-inst-cond-toggle'));
}

console.log('\nwireRepeatableConditionedInstances - a non-conditionable instance never wires a toggle click handler (there is none in the DOM to wire)');
{
  function renderPayload(inst, instIdPrefix) { return '<span id="' + instIdPrefix + '-label">' + inst.label + '</span>'; }
  function neverConditionable() { return false; }
  const instances = [{ label: 'A', conditions: [] }];
  const expandedSet = new Set();
  document.getElementById('root').innerHTML = Helpers.repeatableConditionedInstancesHtml(instances, 'nowire', renderPayload, expandedSet, undefined, undefined, neverConditionable);
  let rerenderCalls = 0;
  Helpers.wireRepeatableConditionedInstances('nowire', instances, function () {}, null, expandedSet, function () { rerenderCalls++; }, null, neverConditionable);
  check('no cond-toggle elements exist to click', document.querySelectorAll('.repeat-inst-cond-toggle[data-prefix="nowire"]').length === 0);
  check('expandedSet was never touched (nothing to wire)', !expandedSet.has('nowire:0') && rerenderCalls === 0);
}

// ===========================================================================
// Real record-indicator wiring: all ten kinds, per the DDS Reference's own
// "Option indicators are/are not valid for this keyword" statements.
// ===========================================================================

const CONDITIONABLE_KINDS = ['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'HELP', 'HLPRTN'];
const NO_CONDITIONING_KINDS = ['VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'];

console.log('\nrecordIndicatorInstancesHtml - CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN each still offer a Conditioning toggle ("Option indicators are valid")');
CONDITIONABLE_KINDS.forEach(function (kind, i) {
  const kw = [{ name: kind, parameters: '1' + i, conditions: [], raw: '', sourceLines: [] }];
  const instances = DspfWriter.getRecordIndicatorInstances(kw);
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, 'ck' + i, new Set());
  check(kind + ' shows a Conditioning toggle', !!document.querySelector('.repeat-inst-cond-toggle'));
  check(kind + ' does NOT show the "not valid" hint', document.getElementById('root').textContent.indexOf('Option indicators are not valid for this keyword') < 0);
});

console.log('\nrecordIndicatorInstancesHtml - VLDCMDKEY/SETOF/CHANGE/INDTXT each hide the Conditioning toggle ("Option indicators are not valid")');
NO_CONDITIONING_KINDS.forEach(function (kind, i) {
  const params = kind === 'INDTXT' ? "2" + i + " 'text'" : '2' + i;
  const kw = [{ name: kind, parameters: params, conditions: [], raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, 'nk' + i, new Set());
  check(kind + ' has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
  check(kind + ' shows the "not valid" hint instead', document.getElementById('root').textContent.indexOf('Option indicators are not valid for this keyword') >= 0);
});

console.log('\nrecordIndicatorInstancesHtml/wireRecordIndicatorInstances - a mixed list only shows the toggle on the conditionable rows, and a stale expandedSet entry for a non-conditionable row stays collapsed');
{
  const kw = [
    { name: 'CLEAR', parameters: '10', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '01', not: false }] }], raw: '', sourceLines: [] },
    { name: 'VLDCMDKEY', parameters: '25', conditions: [], raw: '', sourceLines: [] },
    { name: 'SETOF', parameters: '30', conditions: [], raw: '', sourceLines: [] },
  ];
  // Stale expand markers for BOTH rows - only CLEAR's (idx 0) should ever
  // actually expand; VLDCMDKEY's (idx 1) must stay collapsed regardless.
  const expandedSet = new Set(['mix-rep:0', 'mix-rep:1']);
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, 'mix', expandedSet);
  const toggles = document.querySelectorAll('.repeat-inst-cond-toggle');
  check('exactly one Conditioning toggle rendered (CLEAR only)', toggles.length === 1);
  check('exactly one accordion body rendered (CLEAR only, despite VLDCMDKEY also being in expandedSet)', document.querySelectorAll('.repeat-inst-cond-body').length === 1);
  check('two "not valid" hints rendered (VLDCMDKEY and SETOF)', (document.getElementById('root').textContent.match(/Option indicators are not valid for this keyword/g) || []).length === 2);
}

console.log('\nwireRecordIndicatorInstances - editing resp on a no-conditioning-kind instance leaves its (already-invalid) pre-existing conditions untouched, not stripped');
{
  // This instance already carries conditioning even though VLDCMDKEY
  // doesn't allow it (simulating a pre-existing file written before this
  // fix, or by some other tool) - the UI must not silently strip it just
  // because it can no longer be edited through this panel; it should only
  // be impossible to ADD NEW conditioning here.
  const preExistingCondition = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '77', not: false }] }];
  const kw = [{ name: 'VLDCMDKEY', parameters: '25', conditions: preExistingCondition, raw: '', sourceLines: [] }];
  const expandedSet = new Set();
  const p = 'preserve';
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, p, expandedSet);
  check('no Conditioning toggle offered for the invalid-but-pre-existing VLDCMDKEY conditioning', !document.querySelector('.repeat-inst-cond-toggle'));

  let committedKeywords = null;
  Helpers.wireRecordIndicatorInstances(kw, function (nextKw) { committedKeywords = nextKw; }, p, expandedSet, function () {}, null);
  const respEl = document.querySelector('.' + p + '-rep-inst0-resp');
  respEl.value = '26';
  respEl.dispatchEvent(new dom.window.Event('change'));

  check('the edit committed', !!committedKeywords);
  const vldcmdkey = committedKeywords.find(function (k) { return k.name === 'VLDCMDKEY'; });
  check('resp was updated to 26', vldcmdkey && vldcmdkey.parameters.trim() === '26');
  check('the pre-existing (invalid) conditioning on indicator 77 survived the edit unchanged', vldcmdkey && vldcmdkey.conditions.length === 1 && vldcmdkey.conditions[0].indicators[0].number === '77');
}

console.log('\nwireRecordIndicatorInstances - switching a kind FROM a conditionable kind TO a no-conditioning kind keeps that instance\\u2019s existing conditions (kind-switch does not touch conditions)');
{
  const kw = [{ name: 'CLEAR', parameters: '10', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '05', not: false }] }], raw: '', sourceLines: [] }];
  const expandedSet = new Set();
  const p = 'switchkind';
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, p, expandedSet);
  let committedKeywords = null;
  Helpers.wireRecordIndicatorInstances(kw, function (nextKw) { committedKeywords = nextKw; }, p, expandedSet, function () {}, null);

  const kindEl = document.querySelector('.' + p + '-rep-inst0-kind');
  kindEl.value = 'SETOF';
  kindEl.dispatchEvent(new dom.window.Event('change'));

  const setof = committedKeywords.find(function (k) { return k.name === 'SETOF'; });
  check('the row is now written as SETOF', !!setof);
  check('the resp carried through unchanged', setof && setof.parameters.trim() === '10');
  check('the pre-existing conditioning from when it was CLEAR is still attached to the instance (not stripped by the kind switch itself)', setof && setof.conditions.length === 1 && setof.conditions[0].indicators[0].number === '05');
}

// ===========================================================================
// I-20 finding (b): I-13's own PULLDOWN audit found CLEAR on PULLDOWN's
// 27-keyword forbidden list, but couldn't wire pulldownConflictReason onto
// it because CLEAR lives in this same not-kind-aware shared component -
// deferred to this task alongside finding (a) above.
// ===========================================================================

console.log('\nwireRecordIndicatorInstances - switching an instance\\u2019s kind TO CLEAR is blocked when the record already carries PULLDOWN');
{
  const kw = [
    { name: 'PULLDOWN', parameters: '', conditions: [], raw: '', sourceLines: [] },
    { name: 'HOME', parameters: '10', conditions: [], raw: '', sourceLines: [] },
  ];
  const expandedSet = new Set();
  const p = 'pdclear';
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, p, expandedSet);
  let committedKeywords = null;
  let alerted = null;
  const savedAlert = dom.window.alert;
  dom.window.alert = function (msg) { alerted = msg; };
  global.window = dom.window;
  Helpers.wireRecordIndicatorInstances(kw, function (nextKw) { committedKeywords = nextKw; }, p, expandedSet, function () {}, null);

  const kindEl = document.querySelector('.' + p + '-rep-inst0-kind');
  kindEl.value = 'CLEAR';
  kindEl.dispatchEvent(new dom.window.Event('change'));

  check('the switch to CLEAR was blocked - no edit committed', committedKeywords === null);
  check('an alert naming the PULLDOWN conflict was shown', !!alerted && alerted.indexOf('PULLDOWN') >= 0 && alerted.indexOf('CLEAR') >= 0);
  check('the kind select reverted back to HOME', kindEl.value === 'HOME');
  dom.window.alert = savedAlert;
}

console.log('\nwireRecordIndicatorInstances - "+ Add indicator keyword" falls back to a HOME default (instead of CLEAR) when the record already carries PULLDOWN, so Add still always seeds something');
{
  const kw = [{ name: 'PULLDOWN', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  const expandedSet = new Set();
  const p = 'pdadd';
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, p, expandedSet);
  let committedKeywords = null;
  global.window = dom.window;
  Helpers.wireRecordIndicatorInstances(kw, function (nextKw) { committedKeywords = nextKw; }, p, expandedSet, function () {}, null);

  document.querySelector('.repeat-inst-add[data-prefix="' + p + '-rep"]').dispatchEvent(new dom.window.Event('click'));

  check('a HOME(10) instance was added instead of the usual CLEAR default', !!committedKeywords && committedKeywords.some((k) => k.name === 'HOME' && k.parameters.trim() === '10'));
  check('no CLEAR instance was ever created', !committedKeywords.some((k) => k.name === 'CLEAR'));
}

console.log('\nwireRecordIndicatorInstances - CLEAR still works fine, and "+ Add" still seeds a default CLEAR instance, on a record with no PULLDOWN');
{
  const kw = [];
  const expandedSet = new Set();
  const p = 'noclearblock';
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw, p, expandedSet);
  let committedKeywords = null;
  global.window = dom.window;
  Helpers.wireRecordIndicatorInstances(kw, function (nextKw) { committedKeywords = nextKw; }, p, expandedSet, function () {}, null);

  document.querySelector('.repeat-inst-add[data-prefix="' + p + '-rep"]').dispatchEvent(new dom.window.Event('click'));

  check('a default CLEAR(10) instance was added with no PULLDOWN present', !!committedKeywords && committedKeywords.some((k) => k.name === 'CLEAR' && k.parameters.trim() === '10'));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

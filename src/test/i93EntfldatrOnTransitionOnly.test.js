/**
 * i93EntfldatrOnTransitionOnly.test.js
 *
 * Task I-93 - follow-up from I-84. wireEntFldAtrEditor's record-level
 * add-guard (I-53/I-54/I-60: the SFL / MNUBAR / USRDFN whitelist checks)
 * fired whenever the ENTFLDATR checkbox was ticked at Apply - not only
 * when ENTFLDATR was actually being ADDED. So on an SFL, MNUBAR or USRDFN
 * record that already carried a hand-edited ENTFLDATR, changing its
 * colour and pressing Apply was refused with "cannot be added" and the
 * keyword left unchanged (I-84 fixed the same flaw for RTNCSRLOC).
 *
 * Fix: the guard now runs only on the real transition (box ticked AND
 * ENTFLDATR not already present). Removing it was never guarded.
 *
 * Same lightweight jsdom harness as I-84's test.
 * Run with: node src/test/i93EntfldatrOnTransitionOnly.test.js
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
const el = (id) => document.getElementById(id);
const ent = (ctx) => ctx.getKeywords().filter((k) => k.name === 'ENTFLDATR');
const has = (ctx, name) => ctx.getKeywords().some((k) => k.name === name);
function apply(checked, color) {
  const on = el('rk-entfldatr-on');
  const btn = document.querySelector('.rk-entfldatr-apply');
  if (!on || !btn) return { missing: true };
  on.checked = checked;
  if (color !== undefined) el('rk-entfldatr-color').value = color;
  const alertMessage = withAlertCapture(function () { btn.dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  return { alertMessage };
}

const TYPES = [['SFL', 'subfile (SFL)'], ['MNUBAR', 'menu-bar (MNUBAR)'], ['USRDFN', 'user-defined (USRDFN)']];

// ===========================================================================
// Group A - the bug: editing / removing a hand-edited ENTFLDATR
// ===========================================================================
TYPES.forEach(([recType]) => {
  console.log('\n' + recType + ' record with a hand-edited ENTFLDATR: changing its colour is not blocked');
  {
    const ctx = setup([kwd(recType), kwd('ENTFLDATR', '(*COLOR RED)')]);
    check('setup: the ENTFLDATR box is rendered checked with RED selected', !!el('rk-entfldatr-on') && el('rk-entfldatr-on').checked === true && el('rk-entfldatr-color').value === 'RED');
    const r = apply(true, 'BLU');
    check('setup: Apply button present', !r.missing);
    check('no alert fired (no misleading "cannot be added")', !r.alertMessage);
    const k = ent(ctx)[0];
    check('the keyword was updated to BLU', !!k && /BLU/.test(k.parameters) && !/RED/.test(k.parameters));
    check('still exactly one ENTFLDATR', ent(ctx).length === 1);
    check(recType + ' itself still present', has(ctx, recType));
  }

  console.log('\n' + recType + ' record with a hand-edited ENTFLDATR: un-ticking it (Apply) removes it, no alert');
  {
    const ctx = setup([kwd(recType), kwd('ENTFLDATR', '(*COLOR RED)')]);
    const r = apply(false);
    check('no alert fired', !r.missing && !r.alertMessage);
    check('ENTFLDATR removed', ent(ctx).length === 0);
    check(recType + ' itself still present', has(ctx, recType));
  }

  console.log('\n' + recType + ' record WITHOUT ENTFLDATR: adding it is still blocked (the real transition)');
  {
    const ctx = setup([kwd(recType)]);
    const r = apply(true, 'RED');
    check('setup: Apply button present', !r.missing);
    check('blocked with an alert naming ENTFLDATR', !!r.alertMessage && r.alertMessage.indexOf('ENTFLDATR') !== -1);
    check('alert names the record type', !!r.alertMessage && r.alertMessage.indexOf(recType) !== -1);
    check('no ENTFLDATR was added', ent(ctx).length === 0);
  }
});

// ===========================================================================
// Group B - a plain record is unaffected
// ===========================================================================
console.log('\nplain record: add, edit and remove ENTFLDATR all work');
{
  const ctx = setup([]);
  let r = apply(true, 'RED');
  check('adding ENTFLDATR: no alert, keyword present', !r.missing && !r.alertMessage && ent(ctx).length === 1);
  r = apply(true, 'GRN');
  check('editing it: no alert, colour updated, still one keyword', !r.alertMessage && ent(ctx).length === 1 && /GRN/.test(ent(ctx)[0].parameters));
  r = apply(false);
  check('removing it: no alert, keyword gone', !r.alertMessage && ent(ctx).length === 0);
}

if (failures === 0) {
  console.log('\nALL CHECKS PASSED');
} else {
  console.log('\n' + failures + ' CHECK(S) FAILED');
  process.exitCode = 1;
}

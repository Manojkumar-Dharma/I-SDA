/**
 * i107CheckRecordGuard.test.js
 *
 * Task I-107 (I-104 finding B) - the record-level CHECK(AB) and CHECK(RL)
 * checkboxes (Input subtab) were hand-wired with no guard, so ticking either on
 * a MNUBAR or USRDFN record was ACCEPTED although CHECK is on neither closed
 * whitelist. SFL's list includes CHECK, so that stays accepted.
 *
 * Fix: each row is passed recordCheckGuard, which consults usrdfnConflictReason / pulldownConflictReason /
 * sflWhitelistConflictReason / mnubarWhitelistConflictReason, only on a real
 * turn-on of THAT variant (not already present - the I-84 lesson), so a hand-edited
 * record that already carries the variant can still remove it; turning the OTHER
 * variant on is still an addition and is still refused.
 *
 * Run with: node src/test/i107CheckRecordGuard.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

let failures = 0;
function check(label, condition) {
  if (condition) console.log('  ok  -', label);
  else { failures++; console.log('FAIL  -', label); }
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function kwd(name, parameters) {
  return { name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] };
}
function render(keywords) {
  const panels = Helpers.recordKeywordsPanelsHtml(keywords, 'rk', new Set());
  document.getElementById('root').innerHTML = panels.general + panels.input;
}
function wire(getKeywords, onChange) {
  Helpers.wireRecordKeywordsPanels('rk', getKeywords, onChange, new Set(), function () {});
}
function withAlertCapture(fn) {
  let msg = null;
  const orig = global.window.alert;
  global.window.alert = function (m) { msg = m; };
  fn();
  global.window.alert = orig;
  return msg;
}
function setup(initial) {
  let keywords = initial;
  const ctx = { getKeywords: () => keywords, changes: 0 };
  function onChange(next) { ctx.changes++; keywords = next; render(keywords); wire(ctx.getKeywords, onChange); }
  render(keywords);
  wire(ctx.getKeywords, onChange);
  return ctx;
}
const el = (id) => document.getElementById(id);
function tick(box, on) {
  box.checked = on;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
const has = (ctx, v) => DspfWriter.getFileFlagKeyword(ctx.getKeywords(), 'CHECK', v).present;
const VARIANTS = [['AB', 'rk-check-ab-on'], ['RL', 'rk-check-rl-on']];

for (const type of ['USRDFN', 'MNUBAR']) {
  for (const [v, id] of VARIANTS) {
    console.log('\n' + type + ' record, CHECK(' + v + ')');
    let ctx = setup([kwd(type)]);
    let msg = withAlertCapture(() => tick(el(id), true));
    check(type + ' / ' + v + ': ticking is refused with an alert naming CHECK', !!msg && /CHECK/.test(msg));
    check(type + ' / ' + v + ': box reverted, nothing added, no onChange', !el(id).checked && !has(ctx, v) && ctx.changes === 0);

    // Already-invalid (hand-edited) record: removal stays possible.
    ctx = setup([kwd(type), kwd('CHECK', v)]);
    msg = withAlertCapture(() => tick(el(id), false));
    check(type + ' already carrying CHECK(' + v + '): removing it is allowed', msg === null && !has(ctx, v));

    // ...but turning the OTHER variant on is still an addition.
    const other = VARIANTS.find((x) => x[0] !== v);
    ctx = setup([kwd(type), kwd('CHECK', v)]);
    msg = withAlertCapture(() => tick(el(other[1]), true));
    check(type + ' already carrying CHECK(' + v + '): adding CHECK(' + other[0] + ') is still refused', !!msg && /CHECK/.test(msg) && !has(ctx, other[0]) && has(ctx, v));
  }
}

for (const [label, base] of [['SFL', [kwd('SFL')]], ['plain', []]]) {
  for (const [v, id] of VARIANTS) {
    console.log('\n' + label + ' record, CHECK(' + v + ')');
    const ctx = setup(base.slice());
    let msg = withAlertCapture(() => tick(el(id), true));
    check(label + ' / ' + v + ': ticking is accepted', msg === null && has(ctx, v));
    msg = withAlertCapture(() => tick(el(id), false));
    check(label + ' / ' + v + ': removal is accepted', msg === null && !has(ctx, v));
  }
}

console.log('\n' + (failures === 0 ? 'All I-107 checks passed.' : failures + ' I-107 check(s) FAILED.'));
process.exit(failures === 0 ? 0 : 1);

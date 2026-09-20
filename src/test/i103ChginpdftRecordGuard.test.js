/**
 * i103ChginpdftRecordGuard.test.js
 *
 * Task I-103 - the record-level CHGINPDFT row (General subtab) was wired with
 * wireChgInpDftFlag, which took no guard, so ticking it on a USRDFN or MNUBAR
 * record was ACCEPTED although CHGINPDFT is on neither closed whitelist
 * (USRDFN: INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, TEXT;
 * MNUBAR: its own 27-keyword list). SFL's list allows CHGINPDFT.
 *
 * Fix: wireChgInpDftFlag / wireFlagRow take an OPTIONAL guard, passed only by
 * the record-level call (the row builder is shared with the field, file and
 * SFLMSG levels, which must not change). The guard fires only on a real
 * turn-on (CHGINPDFT not already present - the I-84 lesson), so a hand-edited
 * record that already carries CHGINPDFT can still remove it / edit its codes.
 *
 * Run with: node src/test/i103ChginpdftRecordGuard.test.js
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
global.Event = dom.window.Event; // wireChgInpDftFlag's sub-code boxes use a bare `new Event(...)`
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function kwd(name, parameters) {
  return { name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] };
}
function render(keywords) {
  document.getElementById('root').innerHTML = Helpers.recordKeywordsPanelsHtml(keywords, 'rk', new Set()).general;
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
const chg = (ctx) => ctx.getKeywords().filter((k) => k.name === 'CHGINPDFT');
const codeBox = (code) => document.querySelector('.rk-chginpdft-code[value="' + code + '"]');

for (const type of ['USRDFN', 'MNUBAR']) {
  console.log('\n' + type + ' record');
  let ctx = setup([kwd(type)]);
  let msg = withAlertCapture(() => tick(el('rk-chginpdft-on'), true));
  check(type + ': ticking CHGINPDFT is refused with an alert naming it', !!msg && /CHGINPDFT/.test(msg));
  check(type + ': box reverted, nothing added, no onChange', !el('rk-chginpdft-on').checked && chg(ctx).length === 0 && ctx.changes === 0);

  ctx = setup([kwd(type)]);
  msg = withAlertCapture(() => tick(codeBox('HI'), true));
  check(type + ': ticking a sub-code (HI) is refused too', !!msg && /CHGINPDFT/.test(msg));
  check(type + ': sub-code, main box and hidden params all reverted, nothing added',
    !codeBox('HI').checked && !el('rk-chginpdft-on').checked && el('rk-chginpdft-params').value === '' && chg(ctx).length === 0 && ctx.changes === 0);

  // Already-invalid (hand-edited) record: removal and parameter edits stay possible.
  ctx = setup([kwd(type), kwd('CHGINPDFT', 'HI')]);
  msg = withAlertCapture(() => tick(codeBox('RI'), true));
  check(type + ' already carrying CHGINPDFT: editing its codes is NOT refused', msg === null);
  check(type + ' already carrying CHGINPDFT: parameters updated to HI RI', chg(ctx).length === 1 && chg(ctx)[0].parameters === 'HI RI');
  msg = withAlertCapture(() => tick(el('rk-chginpdft-on'), false));
  check(type + ' already carrying CHGINPDFT: removing it is allowed', msg === null && chg(ctx).length === 0);
}

for (const [label, base] of [['SFL', [kwd('SFL')]], ['plain', []]]) {
  console.log('\n' + label + ' record');
  let ctx = setup(base.slice());
  let msg = withAlertCapture(() => tick(el('rk-chginpdft-on'), true));
  check(label + ': ticking CHGINPDFT is accepted', msg === null && chg(ctx).length === 1);
  msg = withAlertCapture(() => tick(codeBox('MF'), true));
  check(label + ': a sub-code is accepted', msg === null && chg(ctx)[0].parameters === 'MF');
  msg = withAlertCapture(() => tick(el('rk-chginpdft-on'), false));
  check(label + ': removal is accepted', msg === null && chg(ctx).length === 0);
}

console.log('\n' + (failures === 0 ? 'All I-103 checks passed.' : failures + ' I-103 check(s) FAILED.'));
process.exit(failures === 0 ? 0 : 1);

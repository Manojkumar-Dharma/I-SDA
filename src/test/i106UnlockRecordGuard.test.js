/**
 * i106UnlockRecordGuard.test.js
 *
 * Task I-106 (I-104 finding A) - the record-level UNLOCK checkbox (Input
 * subtab) was hand-wired with no guard, so ticking it on an SFL record or a
 * USRDFN record was ACCEPTED although UNLOCK is on neither whitelist (SFL's
 * "also valid" list; USRDFN's INVITE/KEEP/PASSRCD/HLPRTN/HELP/HLPCLR/PRINT/
 * OPENPRT/TEXT). MNUBAR's list does include UNLOCK, so that stays accepted.
 *
 * Fix: commitUnlock consults usrdfnConflictReason / pulldownConflictReason /
 * sflWhitelistConflictReason / mnubarWhitelistConflictReason, only on a real
 * turn-on (UNLOCK not already present - the I-84 lesson), so a hand-edited
 * record that already carries UNLOCK can still remove it or edit its
 * *ERASE / *MDTOFF values.
 *
 * Run with: node src/test/i106UnlockRecordGuard.test.js
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
const unlock = (ctx) => ctx.getKeywords().filter((k) => k.name === 'UNLOCK');

for (const type of ['USRDFN', 'SFL']) {
  console.log('\n' + type + ' record');
  let ctx = setup([kwd(type)]);
  let msg = withAlertCapture(() => tick(el('rk-unlock-on'), true));
  check(type + ': ticking UNLOCK is refused with an alert naming it', !!msg && /UNLOCK/.test(msg));
  check(type + ': box reverted, nothing added, no onChange', !el('rk-unlock-on').checked && unlock(ctx).length === 0 && ctx.changes === 0);

  // Already-invalid (hand-edited) record: removal and value edits stay possible.
  ctx = setup([kwd(type), kwd('UNLOCK', '*ERASE')]);
  msg = withAlertCapture(() => tick(el('rk-unlock-mdtoff'), true));
  check(type + ' already carrying UNLOCK: editing its values is NOT refused', msg === null);
  check(type + ' already carrying UNLOCK: parameters updated to *ERASE *MDTOFF', unlock(ctx).length === 1 && unlock(ctx)[0].parameters === '*ERASE *MDTOFF');
  msg = withAlertCapture(() => tick(el('rk-unlock-on'), false));
  check(type + ' already carrying UNLOCK: removing it is allowed', msg === null && unlock(ctx).length === 0);
}

for (const [label, base] of [['MNUBAR', [kwd('MNUBAR')]], ['plain', []]]) {
  console.log('\n' + label + ' record');
  const ctx = setup(base.slice());
  let msg = withAlertCapture(() => tick(el('rk-unlock-on'), true));
  check(label + ': ticking UNLOCK is accepted', msg === null && unlock(ctx).length === 1);
  msg = withAlertCapture(() => tick(el('rk-unlock-mdtoff'), true));
  check(label + ': *MDTOFF value is accepted', msg === null && unlock(ctx)[0].parameters === '*MDTOFF');
  msg = withAlertCapture(() => tick(el('rk-unlock-on'), false));
  check(label + ': removal is accepted', msg === null && unlock(ctx).length === 0);
}

console.log('\n' + (failures === 0 ? 'All I-106 checks passed.' : failures + ' I-106 check(s) FAILED.'));
process.exit(failures === 0 ? 0 : 1);

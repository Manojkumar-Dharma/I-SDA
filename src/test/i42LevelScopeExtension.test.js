/**
 * i42LevelScopeExtension.test.js
 *
 * Task I-42 - extends the level-scope of keywords whose DDS Reference scope
 * is wider than what iSDA offered (audit Finding C):
 *   MOUBTN  - file, record          -> adds record-level
 *   VALNUM  - file, record, field   -> adds record + field
 *   WRDWRAP - file, record, field   -> adds record + field
 *   ENTFLDATR - file, record, field -> adds field
 *   USRDSPMGT - the audit listed it as "file, record", but the DDS Reference
 *     says "file-level keyword" in BOTH of its sections (verified against
 *     docs/sda-reference/source/DDS_Keyword_V7r6.txt), so it is deliberately
 *     left file-level only. Asserted below so nobody "fixes" it by mistake.
 *
 * Part 1-3 run webviewClientHelpers.js/dspfWriter.js directly against a
 * plain jsdom document (same lightweight harness as
 * i55RepeatableInstanceWhitelistGuard.test.js); Part 4 runs the real
 * generated webview to prove the field-level accordions are actually built.
 * Run with: node src/test/i42LevelScopeExtension.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

const { check, failureCount } = require('./helpers/harness');
const { kwd, newWebviewDom, webviewHtml } = require('./helpers/common');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));


function withCapturedAlert(fn) {
  let msg = null;
  const orig = global.window.alert;
  global.window.alert = function (m) { msg = m; };
  try { fn(); } finally { global.window.alert = orig; }
  return msg;
}

function fire(el, type) { el.dispatchEvent(new dom.window.Event(type, { bubbles: true })); }

// --------------------------------------------------------------------------
// Record-level harness
// --------------------------------------------------------------------------
function recordSession(initial) {
  const s = { keywords: initial };
  const getKeywords = () => s.keywords;
  function render() {
    const panels = Helpers.recordKeywordsPanelsHtml(s.keywords, 'rk', new Set());
    document.getElementById('root').innerHTML = panels.general + panels.indicatorKeywords;
  }
  function wire() { Helpers.wireRecordKeywordsPanels('rk', getKeywords, onChange, new Set(), () => {}); }
  function onChange(next) { s.keywords = next; render(); wire(); }
  render();
  wire();
  s.has = (name) => s.keywords.some((k) => k.name === name);
  return s;
}

function toggle(id, on) {
  const el = document.getElementById(id);
  if (!el) return { missing: true, alertMessage: null };
  el.checked = on;
  const alertMessage = withCapturedAlert(() => fire(el, 'change'));
  return { missing: false, alertMessage };
}

function clickAdd(prefix) {
  const btn = document.querySelector('.repeat-inst-add[data-prefix="' + prefix + '"]');
  if (!btn) return { missing: true, alertMessage: null };
  const alertMessage = withCapturedAlert(() => fire(btn, 'click'));
  return { missing: false, alertMessage };
}

// ===========================================================================
// Part 1: record-level VALNUM / WRDWRAP checkboxes
// ===========================================================================
for (const name of ['VALNUM', 'WRDWRAP']) {
  const lower = name.toLowerCase();
  console.log('\nRecord-level ' + name + ': plain record commits, and turning it off removes it');
  {
    const s = recordSession([]);
    const on = toggle('rk-' + lower + '-on', true);
    check('setup: the ' + name + ' checkbox is rendered', !on.missing);
    check('no alert on a plain record', !on.alertMessage);
    check(name + ' is now on the record', s.has(name));
    const off = toggle('rk-' + lower + '-on', false);
    check('turning it off is not blocked', !off.alertMessage && !s.has(name));
  }
  console.log('Record-level ' + name + ': no Conditioning toggle (option indicators not valid)');
  {
    recordSession([]);
    check('no conditioning toggle rendered for ' + name, !document.querySelector('.kw-cond-toggle[data-flag-id="rk-' + lower + '"]'));
  }
  for (const [label, host, expectText] of [
    ['USRDFN', 'USRDFN', 'user-defined'],
    ['SFL', 'SFL', 'subfile'],
    ['MNUBAR', 'MNUBAR', 'menu-bar'],
  ]) {
    console.log('Record-level ' + name + ': blocked on a ' + label + ' record (not on its closed whitelist)');
    const s = recordSession([kwd(host)]);
    const r = toggle('rk-' + lower + '-on', true);
    check('blocked with an alert naming the record type', !!r.alertMessage && r.alertMessage.toLowerCase().indexOf(expectText) !== -1);
    check(name + ' was not added', !s.has(name));
    check('checkbox reverted to off', document.getElementById('rk-' + lower + '-on').checked === false);
  }
}

// ===========================================================================
// Part 2: record-level MOUBTN "+ Add"
// ===========================================================================
console.log('\nRecord-level MOUBTN: "+ Add" commits on a plain record with the same placeholder as file level');
{
  const s = recordSession([]);
  const r = clickAdd('rk-moubtn-rep');
  check('setup: the "+ Add mouse button event" button is rendered', !r.missing);
  check('no alert', !r.alertMessage);
  const m = s.keywords.find((k) => k.name === 'MOUBTN');
  check('a MOUBTN instance was added', !!m);
  check('with the *ULP CF01 placeholder', m && m.parameters === '*ULP CF01');
  const again = clickAdd('rk-moubtn-rep');
  check('a second instance can be added (repeatable)', s.keywords.filter((k) => k.name === 'MOUBTN').length === 2 && !again.alertMessage);
}
for (const [label, host, expectText] of [
  ['USRDFN', 'USRDFN', 'user-defined'],
  ['SFL', 'SFL', 'subfile'],
  ['MNUBAR', 'MNUBAR', 'menu-bar'],
]) {
  console.log('Record-level MOUBTN: "+ Add" blocked on a ' + label + ' record');
  const s = recordSession([kwd(host)]);
  const r = clickAdd('rk-moubtn-rep');
  // A USRDFN record's Indicator tab is hidden by the designer itself (Task R2),
  // but the panel builder still renders it here, so the guard is what's tested.
  check('setup: button present', !r.missing);
  check('blocked with an alert naming the record type', !!r.alertMessage && r.alertMessage.toLowerCase().indexOf(expectText) !== -1);
  check('no MOUBTN was added', !s.has('MOUBTN'));
}

console.log('\nFile-level MOUBTN is unchanged (no guard, still adds)');
{
  let fileKeywords = [];
  const getKeywords = () => fileKeywords;
  function render() { document.getElementById('root').innerHTML = Helpers.fileKeywordsPanelsHtml(fileKeywords, new Set()).indicatorKeywords; }
  function onChange(next) { fileKeywords = next; render(); Helpers.wireFileKeywordsPanels(getKeywords, onChange, new Set(), () => {}, () => ({})); }
  render();
  Helpers.wireFileKeywordsPanels(getKeywords, onChange, new Set(), () => {}, () => ({}));
  const r = clickAdd('fk-moubtn-rep');
  check('file-level "+ Add" still works with no alert', !r.missing && !r.alertMessage && fileKeywords.some((k) => k.name === 'MOUBTN'));
}

// ===========================================================================
// Part 3: field-level VALNUM / WRDWRAP rows
// ===========================================================================
function fieldSession(keywords, dataType, usage, isConstant, recordKeywords) {
  const s = { keywords };
  const rec = recordKeywords || [];
  function render() {
    document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(s.keywords, 'f', new Set(), dataType, usage, rec, !!isConstant);
  }
  function onChange(next) { s.keywords = next; render(); wire(); }
  function wire() { Helpers.wireGeneralFieldKeywordsEditor(s.keywords, onChange, 'f', new Set(), () => {}, dataType, !!isConstant, usage, rec); }
  render();
  wire();
  s.row = (name) => document.getElementById('f-gen-' + name.toLowerCase() + '-on');
  s.has = (name) => s.keywords.some((k) => k.name === name);
  return s;
}

console.log('\nField-level VALNUM visibility: needs data type Y AND an input-capable usage');
{
  check('shown for Y / B', !!fieldSession([], 'Y', 'B').row('VALNUM'));
  check('shown for Y / I', !!fieldSession([], 'Y', 'I').row('VALNUM'));
  check('shown for Y with blank usage (still drafting - fails open)', !!fieldSession([], 'Y', '').row('VALNUM'));
  check('hidden for A / B', !fieldSession([], 'A', 'B').row('VALNUM'));
  check('hidden for S / B', !fieldSession([], 'S', 'B').row('VALNUM'));
  check('hidden for Y / O (output-only is not input-capable)', !fieldSession([], 'Y', 'O').row('VALNUM'));
  check('hidden for Y / H', !fieldSession([], 'Y', 'H').row('VALNUM'));
  check('hidden for a constant', !fieldSession([], 'Y', 'B', true).row('VALNUM'));
  check('hidden for Y / M and Y / P (M/P have fixed short keyword lists)', !fieldSession([], 'Y', 'M').row('VALNUM') && !fieldSession([], 'Y', 'P').row('VALNUM'));
}

console.log('Field-level VALNUM: toggles on/off, no params, no conditioning');
{
  const s = fieldSession([], 'Y', 'B');
  const on = s.row('VALNUM'); on.checked = true;
  const a = withCapturedAlert(() => fire(on, 'change'));
  check('turning on commits VALNUM with no alert', !a && s.has('VALNUM'));
  check('written as a bare keyword (no parameters)', s.keywords.find((k) => k.name === 'VALNUM').parameters === '');
  check('no params box rendered', !document.getElementById('f-gen-valnum-params'));
  check('no conditioning toggle rendered', !document.querySelector('.kw-cond-toggle[data-flag-id="f-gen-valnum"]'));
  const off = s.row('VALNUM'); off.checked = false;
  fire(off, 'change');
  check('turning off removes it', !s.has('VALNUM'));
}

console.log('\nField-level WRDWRAP visibility: input-capable, and not on the nine excluded shifts');
{
  check('shown for A / B', !!fieldSession([], 'A', 'B').row('WRDWRAP'));
  check('shown for A / I', !!fieldSession([], 'A', 'I').row('WRDWRAP'));
  check('shown for X / B and N / B (shifts not on IBM\'s exclusion list)', !!fieldSession([], 'X', 'B').row('WRDWRAP') && !!fieldSession([], 'N', 'B').row('WRDWRAP'));
  check('shown for blank data type (still drafting)', !!fieldSession([], '', 'B').row('WRDWRAP'));
  for (const dt of ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G']) {
    check('hidden for data type ' + dt, !fieldSession([], dt, 'B').row('WRDWRAP'));
  }
  check('hidden for A / O (output-only)', !fieldSession([], 'A', 'O').row('WRDWRAP'));
  check('hidden for A / H', !fieldSession([], 'A', 'H').row('WRDWRAP'));
  check('hidden for a constant', !fieldSession([], 'A', 'B', true).row('WRDWRAP'));
}

console.log('\nField-level WRDWRAP: plain field commits and can be turned off');
{
  const s = fieldSession([], 'A', 'B');
  const on = s.row('WRDWRAP'); on.checked = true;
  const a = withCapturedAlert(() => fire(on, 'change'));
  check('no alert', !a);
  check('WRDWRAP added', s.has('WRDWRAP'));
  const off = s.row('WRDWRAP'); off.checked = false;
  const b = withCapturedAlert(() => fire(off, 'change'));
  check('turning off is never blocked', !b && !s.has('WRDWRAP'));
}

console.log('\nField-level WRDWRAP: blocked while a documented mutually exclusive keyword is on the field');
for (const [label, kws, needle] of [
  ['DUP', [kwd('DUP')], 'DUP'],
  ['FLTFIXDEC', [kwd('FLTFIXDEC')], 'FLTFIXDEC'],
  ['IGCALTTYP', [kwd('IGCALTTYP', '1')], 'IGCALTTYP'],
  ['AUTO(RAZ)', [kwd('AUTO', 'RAZ')], 'AUTO(RAZ)'],
  ['AUTO(RAB)', [kwd('AUTO', 'RAB')], 'AUTO(RAB)'],
  ['CHECK(RB)', [kwd('CHECK', 'RB')], 'CHECK(RB)'],
  ['CHECK(RLTB)', [kwd('CHECK', 'RLTB')], 'CHECK(RLTB)'],
  ['CHECK(ME MF) - conflict hidden among several codes', [kwd('CHECK', 'ME MF')], 'CHECK(MF)'],
  ['CHGINPDFT(MF)', [kwd('CHGINPDFT', 'MF')], 'CHGINPDFT(MF)'],
  ['DSPATR(OID)', [kwd('DSPATR', 'OID')], 'DSPATR(OID)'],
  ['DSPATR(HI SP)', [kwd('DSPATR', 'HI SP')], 'DSPATR(SP)'],
]) {
  const s = fieldSession(kws, 'A', 'B');
  const on = s.row('WRDWRAP'); on.checked = true;
  const alertMessage = withCapturedAlert(() => fire(on, 'change'));
  check(label + ': blocked with an alert naming it', !!alertMessage && alertMessage.indexOf(needle) !== -1);
  check(label + ': WRDWRAP not added, checkbox reverted', !s.has('WRDWRAP') && s.row('WRDWRAP').checked === false);
}

console.log('\nField-level WRDWRAP: NOT blocked by keywords that are not on the conflict list');
for (const [label, kws] of [
  ['CHECK(ME)', [kwd('CHECK', 'ME')]],
  ['CHECK(AB)', [kwd('CHECK', 'AB')]],
  ['CHGINPDFT(FE)', [kwd('CHGINPDFT', 'FE')]],
  ['DSPATR(HI UL)', [kwd('DSPATR', 'HI UL')]],
  ['AUTO(RAZ) absent, other keyword', [kwd('DFT', "'X'")]],
]) {
  const s = fieldSession(kws, 'A', 'B');
  const on = s.row('WRDWRAP'); on.checked = true;
  const alertMessage = withCapturedAlert(() => fire(on, 'change'));
  check(label + ': commits with no alert', !alertMessage && s.has('WRDWRAP'));
}

console.log('\nField-level WRDWRAP: blocked on a subfile (SFL) record\'s field ("Subfiles do not support WRDWRAP")');
{
  const s = fieldSession([], 'A', 'B', false, [kwd('SFL')]);
  const on = s.row('WRDWRAP'); on.checked = true;
  const alertMessage = withCapturedAlert(() => fire(on, 'change'));
  check('blocked with an alert naming subfile', !!alertMessage && alertMessage.toLowerCase().indexOf('subfile') !== -1);
  check('WRDWRAP not added', !s.has('WRDWRAP'));
  const ctl = fieldSession([], 'A', 'B', false, [kwd('SFLCTL', 'DETAIL')]);
  const on2 = ctl.row('WRDWRAP'); on2.checked = true;
  const a2 = withCapturedAlert(() => fire(on2, 'change'));
  check('a subfile CONTROL record\'s field is not blocked (only the SFL detail record is)', !a2 && ctl.has('WRDWRAP'));
}

console.log('\nDspfWriter.wrdwrapFieldConflictReason: direct unit checks');
{
  const f = DspfWriter.wrdwrapFieldConflictReason;
  check('null for any keyword other than WRDWRAP', f('VALNUM', [kwd('DUP')], 'S', 'O', [kwd('SFL')]) === null);
  check('null on a clean input field', f('WRDWRAP', [], 'A', 'I', []) === null);
  check('blank usage/data type never blocks', f('WRDWRAP', [], '', '', []) === null);
  check('usage O blocked', !!f('WRDWRAP', [], 'A', 'O', []));
  check('usage H blocked', !!f('WRDWRAP', [], 'A', 'H', []));
  check('lowercase data type is normalized', !!f('WRDWRAP', [], 'y', 'B', []));
  check('CHECK with parenthesized/comma params is tokenized', !!f('WRDWRAP', [kwd('CHECK', '(ME,RZ)')], 'A', 'B', []));
  check('several conflicts are all named', /DUP/.test(f('WRDWRAP', [kwd('DUP'), kwd('FLTFIXDEC')], 'A', 'B', [])) && /FLTFIXDEC/.test(f('WRDWRAP', [kwd('DUP'), kwd('FLTFIXDEC')], 'A', 'B', [])));
}

// ===========================================================================
// USRDSPMGT stays file-level only (the audit's claim was a false positive)
// ===========================================================================
console.log('\nUSRDSPMGT: deliberately NOT added at record level (DDS Reference: "file-level keyword")');
{
  const s = recordSession([]);
  check('no record-level USRDSPMGT checkbox is rendered', !document.querySelector('[id*="usrdspmgt"]'));
  const fileHtml = Helpers.fileKeywordsPanelsHtml([], new Set()).general;
  check('the file-level row is still there', fileHtml.indexOf('fk-usrdspmgt') !== -1);
  void s;
}

// ===========================================================================
// Part 4: the real generated webview - field-level accordions are built
// ===========================================================================
const { buildLine } = require('../fixtures/lineBuilder');

const source = [
  buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
  buildLine({ seq: '00020', name: 'TXTFLD', length: '40', dataType: 'A', usage: 'B', line: '2', col: '2' }),
  buildLine({ seq: '00030', name: 'NUMFLD', length: '5', dataType: 'Y', decimals: '0', usage: 'B', line: '4', col: '2' }),
  buildLine({ seq: '00040', name: 'OUTFLD', length: '10', dataType: 'A', usage: 'O', line: '6', col: '2' }),
].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', source, 'I42.DSPF');
const posted = [];
const wdom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
  },
});

setTimeout(() => {
  const { document: doc, Event: WEvent } = wdom.window;
  function select(name) {
    const el = doc.querySelector('.dspf-field[data-field="' + name + '"]');
    if (!el) return false;
    el.dispatchEvent(new WEvent('click', { bubbles: true }));
    return true;
  }
  const q = (suffix) => doc.querySelector('[id$="' + suffix + '"]');
  const originalAlert = wdom.window.alert;
  wdom.window.alert = () => {};

  console.log('\nReal webview: character input/output field (TXTFLD)');
  {
    check('setup: TXTFLD is selectable', select('TXTFLD'));
    const entOn = q('-entfldatr-on');
    check('field-level "Entry field attribute" (ENTFLDATR) editor is rendered', !!entOn);
    check('WRDWRAP row is rendered (input/output, data type A)', !!q('-gen-wrdwrap-on'));
    check('VALNUM row is NOT rendered (data type is not Y)', !q('-gen-valnum-on'));
  }

  console.log('\nReal webview: applying ENTFLDATR on the field posts it on THAT field only');
  {
    posted.length = 0;
    const on = q('-entfldatr-on');
    on.checked = true;
    const color = q('-entfldatr-color');
    color.value = 'RED';
    const hi = doc.querySelector('input.' + on.id.replace(/-on$/, '') + '-attr[value="HI"]');
    if (hi) hi.checked = true;
    const apply = doc.querySelector('button.' + on.id.replace(/-on$/, '') + '-apply');
    check('setup: Apply button present', !!apply);
    if (apply) apply.dispatchEvent(new WEvent('click', { bubbles: true }));
    const last = posted[posted.length - 1];
    const text = (last && last.text || '').replace(/[+-]\r?\n.{44}/g, '');
    check('an applyEdit was posted', !!last && last.type === 'applyEdit');
    check('the source now carries ENTFLDATR with the chosen color', /ENTFLDATR\(\(\*COLOR RED\)/.test(text));
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => l.indexOf('TXTFLD') !== -1);
    check('ENTFLDATR sits on the TXTFLD line', idx >= 0 && /ENTFLDATR/.test(lines.slice(idx, idx + 2).join('')));
    check('NUMFLD and OUTFLD are untouched', lines.filter((l) => /ENTFLDATR/.test(l)).length === 1);
  }

  console.log('\nReal webview: numeric-only input field (NUMFLD)');
  {
    check('setup: NUMFLD is selectable', select('NUMFLD'));
    const numRows = { valnum: !!q('-gen-valnum-on'), wrdwrap: !!q('-gen-wrdwrap-on'), ent: !!q('-entfldatr-on') };
    check('VALNUM row is rendered for data type Y', numRows.valnum);
    check('WRDWRAP row is NOT rendered for data type Y', !numRows.wrdwrap);
    check('ENTFLDATR editor is rendered (input-capable)', numRows.ent);
    posted.length = 0;
    const v = q('-gen-valnum-on');
    if (v) { v.checked = true; v.dispatchEvent(new WEvent('change', { bubbles: true })); }
    const last = posted[posted.length - 1];
    check('checking VALNUM posts an edit that contains VALNUM', !!last && /VALNUM/.test(last.text || ''));
  }

  console.log('\nReal webview: output-only field (OUTFLD) - none of the three apply');
  {
    check('setup: OUTFLD is selectable', select('OUTFLD'));
    check('ENTFLDATR editor NOT rendered (not input-capable)', !q('-entfldatr-on'));
    check('VALNUM row NOT rendered', !q('-gen-valnum-on'));
    check('WRDWRAP row NOT rendered', !q('-gen-wrdwrap-on'));
  }

  wdom.window.alert = originalAlert;
  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}, 100);

/**
 * i104RecordKeywordRowSweep.test.js
 *
 * Task I-104 - a table-driven sweep over EVERY keyword row the record-level
 * "Select Record Keywords" panels offer, on a USRDFN record, an SFL record, a
 * MNUBAR record and a plain record (the control).
 *
 * Why: I-44 assumed which rows a USRDFN record shows and wired the guards by
 * NAME; I-53 and I-54 then swept SFL and MNUBAR by hand. Nobody swept USRDFN,
 * which is how CHGINPDFT (accepted although not allowed, I-103) and HLPCLR
 * (refused although allowed, I-102) went unnoticed. A test that WALKS the rows
 * instead of naming them catches both, and catches the next row someone adds
 * without a guard.
 *
 * How: the exported recordKeywordsPanelsHtml() / wireRecordKeywordsPanels()
 * are mounted in a plain jsdom document with all seven panels at once - so
 * R2's USRDFN tab narrowing (which is applied by buildWebviewTemplate, not by
 * these helpers) is bypassed by construction. Each row is driven the way a user
 * drives it (tick a checkbox; tick + Apply; type into the inputs; "+ Add ...";
 * switch the Indicator row's kind) on a FRESH record, and the outcome
 * (refused with an alert / accepted / nothing happened) is compared with an
 * oracle: refused if and only if the keyword is NOT on that record type's
 * whitelist. The whitelists in this file are typed in from the DDS Reference
 * (and cross-checked against the reference text and against the guard
 * functions themselves), NOT read from the code under test.
 *
 * Nothing is silently skipped: every control the panels render must be
 * classified below or the test fails ("a new row fails the test until it is
 * classified"), every classified row must still exist, a driver that ran but
 * changed nothing is a failure, and the number of rows driven per record type
 * is asserted.
 *
 * KNOWN_GAPS lists the rows the sweep itself found unguarded. Each is asserted
 * to STILL be a gap; the day someone guards it the test fails with "gap
 * closed - remove it from KNOWN_GAPS", which is the point.
 *
 * Run with: node src/test/i104RecordKeywordRowSweep.test.js
 */
const fs = require('fs');
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

// ===========================================================================
// The oracle - typed in from the DDS Reference
// ===========================================================================
const ALLOWED = {
  // USRDFN: "No file- or record-level keywords apply to this record except
  // INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT."
  USRDFN: new Set(['INVITE', 'KEEP', 'PASSRCD', 'HLPRTN', 'HELP', 'HLPCLR', 'PRINT', 'OPENPRT', 'TEXT', 'USRDFN']),
  // SFL: "For all other subfiles (at the record level): CHANGE, LOGINP,
  // CHECK(AB), CHECK(RL), LOGOUT, SETOF, CHGINPDFT, SETOFF, INDTXT, SFLNXTCHG,
  // KEEP, TEXT" (besides SFL itself).
  SFL: new Set(['SFL', 'CHANGE', 'LOGINP', 'CHECK', 'LOGOUT', 'SETOF', 'SETOFF', 'CHGINPDFT', 'INDTXT', 'SFLNXTCHG', 'KEEP', 'TEXT']),
  // MNUBAR: "The following keywords are allowed on a record containing the
  // MNUBAR keyword:" CAnn, CFnn, CLEAR, CLRL, CSRLOC, DSPMOD, HELP, HLPCLR,
  // HLPCMDKEY, HLPRTN, HLPTITLE, HOME, INDTXT, INVITE, KEEP, LOCK, MNUBARDSP,
  // MNUBARSEP, MNUBARSW, MNUCNL, OVERLAY, PAGEDOWN/PAGEUP, PRINT, PROTECT,
  // ROLLUP/ROLLDOWN, TEXT, UNLOCK, VLDCMDKEY.
  MNUBAR: new Set(['MNUBAR', 'CLEAR', 'CLRL', 'CSRLOC', 'DSPMOD', 'HELP', 'HLPCLR', 'HLPCMDKEY', 'HLPRTN', 'HLPTITLE', 'HOME', 'INDTXT', 'INVITE', 'KEEP', 'LOCK', 'MNUBARDSP', 'MNUBARSEP', 'MNUBARSW', 'MNUCNL', 'OVERLAY', 'PAGEDOWN', 'PAGEUP', 'PRINT', 'PROTECT', 'ROLLUP', 'ROLLDOWN', 'TEXT', 'UNLOCK', 'VLDCMDKEY']),
};
const KINDS = ['USRDFN', 'SFL', 'MNUBAR', 'PLAIN'];
const BASE = { USRDFN: ['USRDFN'], SFL: ['SFL'], MNUBAR: ['MNUBAR'], PLAIN: [] };
const allowed = (kind, kw) => kind === 'PLAIN' || ALLOWED[kind].has(kw) || (kind === 'MNUBAR' && /^C[AF]\d\d$/.test(kw));

// ===========================================================================
// Row classification - every control the seven panels render
// ===========================================================================
/** `rec-<stem>-on` checkboxes that commit on tick. stem -> keyword. */
const CHECKBOX_ROWS = {
  inzrcd: 'INZRCD', keep: 'KEEP', assume: 'ASSUME', alwrol: 'ALWROL', retkey: 'RETKEY', retcmdkey: 'RETCMDKEY',
  csrinponly: 'CSRINPONLY', chginpdft: 'CHGINPDFT', valnum: 'VALNUM', wrdwrap: 'WRDWRAP',
  'rtncsrloc-rn': 'RTNCSRLOC', 'rtncsrloc-wm': 'RTNCSRLOC',
  hlpclr: 'HLPCLR', hlpcmdkey: 'HLPCMDKEY',
  blink: 'BLINK', alarm: 'ALARM', msgalarm: 'MSGALARM', lock: 'LOCK', logout: 'LOGOUT', invite: 'INVITE',
  alwgph: 'ALWGPH', frcdta: 'FRCDTA', dspmod: 'DSPMOD', slno: 'SLNO', clrl: 'CLRL',
  loginp: 'LOGINP', unlock: 'UNLOCK', getretain: 'GETRETAIN', retlcksts: 'RETLCKSTS',
  'check-ab': 'CHECK', 'check-rl': 'CHECK', rtndta: 'RTNDTA',
  overlay: 'OVERLAY', putretain: 'PUTRETAIN', protect: 'PROTECT', putovr: 'PUTOVR', ovrdta: 'OVRDTA', ovratr: 'OVRATR',
  inzinp: 'INZINP', mdtoff: 'MDTOFF', eraseinp: 'ERASEINP', erase: 'ERASE',
  print: 'PRINT',
};
/** Rows that commit through an Apply button: tick, then press it. */
const APPLY_ROWS = { entfldatr: { keyword: 'ENTFLDATR', apply: '.rec-entfldatr-apply' } };
/** Rows with no checkbox: they commit when their inputs change. */
const INPUT_ROWS = {
  text: { keyword: 'TEXT', fill: { 'rec-text': 'A description' }, fire: 'rec-text' },
  altname: { keyword: 'ALTNAME', fill: { 'rec-altname': 'ALT1' }, fire: 'rec-altname' },
  hlpseq: { keyword: 'HLPSEQ', fill: { 'rec-hlpseq-group': 'G1', 'rec-hlpseq-num': '1' }, fire: 'rec-hlpseq-num' },
  csrloc: { keyword: 'CSRLOC', fill: { 'rec-csrloc-row': '5', 'rec-csrloc-col': '10' }, fire: 'rec-csrloc-col' },
};
/** "+ Add ..." buttons that create a repeatable instance. */
const ADD_ROWS = {
  'rec-mnubardsp-rep': 'MNUBARDSP',
  'rec-hlptitle-rep': 'HLPTITLE',
  'rec-moubtn-rep': 'MOUBTN',
  'rec-recind-rep': null, // the kind it creates is the record type's default - read from the outcome
};
/** The Indicator row's kind dropdown. A kind is switched TO on an existing
 *  instance that is legal for the record type. */
const INDICATOR_KINDS = ['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'];
const INDICATOR_START = { USRDFN: 'HELP', SFL: 'CHANGE', MNUBAR: 'HELP', PLAIN: 'HELP' };
/** Controls that only parameterise or refine a row above (never add a keyword). */
const PARAM_IDS = new Set([
  'rec-chginpdft-params', 'rec-entfldatr-color', 'rec-entfldatr-nocursor',
  'rec-rtncsrloc-rn-rec', 'rec-rtncsrloc-rn-fld', 'rec-rtncsrloc-rn-pos',
  'rec-rtncsrloc-wm-type', 'rec-rtncsrloc-wm-row1', 'rec-rtncsrloc-wm-col1', 'rec-rtncsrloc-wm-row2', 'rec-rtncsrloc-wm-col2',
  'rec-dspmod-params', 'rec-slno-params', 'rec-clrl-params', 'rec-mdtoff-params', 'rec-eraseinp-params',
  'rec-unlock-erase', 'rec-unlock-mdtoff',
  'rec-print-params', 'rec-print-file', 'rec-print-library',
]);
const INPUT_ROW_IDS = new Set(Object.keys(INPUT_ROWS).reduce((a, k) => a.concat(Object.keys(INPUT_ROWS[k].fill)), []));
const PANELS = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'];
const USRDFN_VISIBLE_PANELS = ['general', 'help', 'print']; // R2's narrowing, buildWebviewTemplate.js

/** Rows this sweep found unguarded (see the I-104 section of keywordFixes.md).
 *  Each is asserted to STILL be a gap. */
const KNOWN_GAPS = {
  'USRDFN|cb:chginpdft': 'I-103', 'MNUBAR|cb:chginpdft': 'I-103',
  'USRDFN|cb:unlock': 'finding A', 'SFL|cb:unlock': 'finding A',
  'USRDFN|cb:check-ab': 'finding B', 'USRDFN|cb:check-rl': 'finding B',
  'MNUBAR|cb:check-ab': 'finding B', 'MNUBAR|cb:check-rl': 'finding B',
  'USRDFN|input:altname': 'finding C', 'SFL|input:altname': 'finding C', 'MNUBAR|input:altname': 'finding C',
  'USRDFN|add:rec-recind-rep': 'finding D',
  'USRDFN|kind:CLEAR': 'finding D', 'USRDFN|kind:PAGEDOWN': 'finding D', 'USRDFN|kind:PAGEUP': 'finding D',
  'USRDFN|kind:HOME': 'finding D', 'USRDFN|kind:VLDCMDKEY': 'finding D', 'USRDFN|kind:SETOF': 'finding D',
  'USRDFN|kind:CHANGE': 'finding D', 'USRDFN|kind:INDTXT': 'finding D',
  'USRDFN|add:rec-mnubardsp-rep': 'finding E', 'USRDFN|add:rec-hlptitle-rep': 'finding E', 'SFL|add:rec-hlptitle-rep': 'finding E',
};

// ===========================================================================
// Harness - the exported helpers in a plain jsdom document
// ===========================================================================
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const ev = (n) => new dom.window.Event(n, { bubbles: true });
const kwd = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
// DSPMOD is only legal on a file that declares two display sizes.
const FILE_KEYWORDS = [kwd('DSPSIZ', '24 80 *DS3 27 132 *DS4')];

function mount(baseNames, extraKeywords) {
  const st = { keywords: baseNames.map((n) => kwd(n)).concat(extraKeywords || []), changes: 0, alerts: [] };
  const expanded = new Set();
  const root = document.getElementById('root');
  function render() {
    const panels = Helpers.recordKeywordsPanelsHtml(st.keywords, 'rec', expanded);
    root.innerHTML = PANELS.map((k) => '<div data-panel="' + k + '">' + panels[k] + '</div>').join('');
    Helpers.wireRecordKeywordsPanels('rec', () => st.keywords, onChange, expanded, render, () => FILE_KEYWORDS);
  }
  function onChange(next) { st.keywords = next; st.changes++; render(); }
  window.alert = (m) => st.alerts.push(String(m));
  render();
  return st;
}
const $ = (id) => document.getElementById(id);
const panelOf = (el) => { const p = el && el.closest('[data-panel]'); return p ? p.getAttribute('data-panel') : null; };
const has = (st, name) => st.keywords.some((k) => k.name === name);
function outcome(st, expectKw) {
  const kwOfMsg = st.alerts.length ? (/^([A-Z][A-Z0-9]*)\b/.exec(st.alerts[0]) || [])[1] || null : null;
  if (st.alerts.length) return { status: 'refused', keyword: kwOfMsg, msg: st.alerts[0], mutated: st.changes > 0 };
  if (st.changes > 0) return { status: 'accepted', keyword: expectKw, mutated: true };
  return { status: 'noop', keyword: expectKw, msg: '' };
}

// ---- drivers: each returns an outcome, on a FRESH record ----
function driveCheckbox(kind, stem) {
  const st = mount(BASE[kind]);
  const cb = $('rec-' + stem + '-on');
  if (!cb) return { status: 'missing' };
  const p = panelOf(cb);
  cb.checked = true;
  cb.dispatchEvent(ev('change'));
  const o = outcome(st, CHECKBOX_ROWS[stem]);
  o.panel = p;
  if (o.status === 'accepted' && !has(st, CHECKBOX_ROWS[stem])) o.status = 'noop';
  return o;
}
function driveApply(kind, stem) {
  const row = APPLY_ROWS[stem];
  const st = mount(BASE[kind]);
  const cb = $('rec-' + stem + '-on');
  const btn = document.querySelector(row.apply);
  if (!cb || !btn) return { status: 'missing' };
  const p = panelOf(cb);
  cb.checked = true;
  btn.dispatchEvent(ev('click'));
  const o = outcome(st, row.keyword);
  o.panel = p;
  if (o.status === 'accepted' && !has(st, row.keyword)) o.status = 'noop';
  return o;
}
function driveInputRow(kind, name) {
  const row = INPUT_ROWS[name];
  const st = mount(BASE[kind]);
  const ids = Object.keys(row.fill);
  if (ids.some((i) => !$(i))) return { status: 'missing' };
  const p = panelOf($(ids[0]));
  ids.forEach((i) => { $(i).value = row.fill[i]; });
  $(row.fire).dispatchEvent(ev('change'));
  const o = outcome(st, row.keyword);
  o.panel = p;
  if (o.status === 'accepted' && !has(st, row.keyword)) o.status = 'noop';
  return o;
}
function driveAdd(kind, prefix) {
  const st = mount(BASE[kind]);
  const btn = document.querySelector('.repeat-inst-add[data-prefix="' + prefix + '"]');
  if (!btn) return { status: 'missing' };
  const p = panelOf(btn);
  btn.dispatchEvent(ev('click'));
  const before = BASE[kind];
  const added = st.keywords.map((k) => k.name).filter((n) => before.indexOf(n) < 0);
  const o = outcome(st, ADD_ROWS[prefix] || added[0] || null);
  o.panel = p;
  o.added = added;
  if (o.status === 'accepted' && added.length === 0) o.status = 'noop';
  if (o.status === 'accepted') o.keyword = ADD_ROWS[prefix] || added[0];
  return o;
}
function driveKind(kind, target) {
  const start = INDICATOR_START[kind];
  // '55' = a response indicator, so the switched instance is written out.
  const st = mount(BASE[kind], [kwd(start, '55')]);
  const sel = document.querySelector('select[class$="-kind"]');
  if (!sel) return { status: 'missing' };
  const p = panelOf(sel);
  sel.value = target;
  sel.dispatchEvent(ev('change'));
  const o = outcome(st, target);
  o.panel = p;
  if (o.status === 'accepted' && !has(st, target)) o.status = 'noop';
  return o;
}

// ===========================================================================
// Part A - the oracle itself
// ===========================================================================
console.log('\nPart A. the whitelist oracle agrees with the guards and with the DDS Reference');
{
  const probe = new Set();
  Object.keys(CHECKBOX_ROWS).forEach((s) => probe.add(CHECKBOX_ROWS[s]));
  Object.keys(APPLY_ROWS).forEach((s) => probe.add(APPLY_ROWS[s].keyword));
  Object.keys(INPUT_ROWS).forEach((s) => probe.add(INPUT_ROWS[s].keyword));
  INDICATOR_KINDS.forEach((k) => probe.add(k));
  ['MNUBARDSP', 'HLPTITLE', 'MOUBTN', 'SETOFF', 'SFLNXTCHG', 'OPENPRT', 'PASSRCD', 'HELP', 'HLPRTN'].forEach((k) => probe.add(k));
  const list = Array.from(probe);
  const agree = (fn, kind) => list.filter((k) => (fn(k, BASE[kind].map((n) => kwd(n))) === null) !== allowed(kind, k));
  const dUsr = agree(DspfWriter.usrdfnWhitelistConflictReason, 'USRDFN');
  const dSfl = agree(DspfWriter.sflWhitelistConflictReason, 'SFL');
  const dMnu = agree(DspfWriter.mnubarWhitelistConflictReason, 'MNUBAR');
  check('usrdfnWhitelistConflictReason agrees with the oracle on all ' + list.length + ' keywords' + (dUsr.length ? ' (differs: ' + dUsr.join(',') + ')' : ''), dUsr.length === 0);
  check('sflWhitelistConflictReason agrees with the oracle' + (dSfl.length ? ' (differs: ' + dSfl.join(',') + ')' : ''), dSfl.length === 0);
  check('mnubarWhitelistConflictReason agrees with the oracle' + (dMnu.length ? ' (differs: ' + dMnu.join(',') + ')' : ''), dMnu.length === 0);
  check('CAnn / CFnn are allowed on MNUBAR only', allowed('MNUBAR', 'CA03') && allowed('MNUBAR', 'CF24') && !allowed('USRDFN', 'CA03') && !allowed('SFL', 'CF01'));

  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
  const anyHeading = /^\f?[A-Z][A-Za-z0-9/]+ \([^)\n]*\)[^\n]*\bkeywords?\b/m;
  function sectionText(name) {
    const out = [];
    const rx = new RegExp('^\\f?' + name + ' \\(', 'mg');
    let m;
    while ((m = rx.exec(ref))) {
      const rest = ref.slice(m.index + 20, m.index + 60000);
      const nxt = anyHeading.exec(rest);
      out.push(ref.slice(m.index, m.index + 20 + (nxt ? nxt.index : 60000)).replace(/\s+/g, ' '));
    }
    return out.join(' ');
  }
  const usrdfn = sectionText('USRDFN');
  check('USRDFN section: the whitelist sentence is there and names all nine keywords', /No file- or record-level keywords apply to this record except/.test(usrdfn) && ['INVITE', 'KEEP', 'PASSRCD', 'HLPRTN', 'HELP', 'HLPCLR', 'PRINT', 'OPENPRT', 'TEXT'].every((k) => usrdfn.indexOf(k) >= 0));
  const sfl = sectionText('SFL');
  check('SFL section: "For all other subfiles" list is there and names the eleven keywords', /For all other subfiles/.test(sfl) && ['CHANGE', 'LOGINP', 'CHECK(AB)', 'CHECK(RL)', 'LOGOUT', 'SETOF', 'CHGINPDFT', 'SETOFF', 'INDTXT', 'SFLNXTCHG', 'KEEP', 'TEXT'].every((k) => sfl.indexOf(k) >= 0));
  const mnu = sectionText('MNUBAR');
  check('MNUBAR section: "allowed on a record containing the MNUBAR keyword" and every listed keyword appears', /allowed on a record containing the MNUBAR keyword/.test(mnu) && Array.from(ALLOWED.MNUBAR).filter((k) => k !== 'MNUBAR' && k !== 'ROLLUP' && k !== 'ROLLDOWN' && k !== 'PAGEDOWN' && k !== 'PAGEUP').every((k) => mnu.indexOf(k) >= 0));
}

// ===========================================================================
// Part B - completeness: nothing rendered goes unclassified
// ===========================================================================
console.log('\nPart B. every control the record panels render is classified (a new row fails here until it is)');
{
  const st = mount([]);
  void st;
  const panelsHtml = Helpers.recordKeywordsPanelsHtml([], 'rec', new Set());
  check('the panels object has exactly the seven known panels', Object.keys(panelsHtml).sort().join(',') === PANELS.slice().sort().join(','));
  const controls = Array.from(document.querySelectorAll('#root [id^="rec-"]')).filter((e) => /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.tagName));
  const unclassified = [];
  const seenRows = new Set();
  controls.forEach((c) => {
    const id = c.id;
    const m = /^rec-(.+)-on$/.exec(id);
    if (m && c.type === 'checkbox') {
      if (CHECKBOX_ROWS[m[1]] || APPLY_ROWS[m[1]]) seenRows.add(m[1]);
      else unclassified.push(id);
    } else if (PARAM_IDS.has(id) || INPUT_ROW_IDS.has(id)) {
      // classified
    } else unclassified.push(id);
  });
  check('every id-bearing control is a row, an input row or a row parameter' + (unclassified.length ? ' - UNCLASSIFIED: ' + unclassified.join(', ') : ''), unclassified.length === 0);
  const missing = Object.keys(CHECKBOX_ROWS).concat(Object.keys(APPLY_ROWS)).filter((s) => !seenRows.has(s));
  check('every classified checkbox row still exists' + (missing.length ? ' - MISSING: ' + missing.join(', ') : ''), missing.length === 0);
  const inputMissing = Array.from(INPUT_ROW_IDS).filter((i) => !$(i));
  check('every classified input row still exists' + (inputMissing.length ? ' - MISSING: ' + inputMissing.join(', ') : ''), inputMissing.length === 0);
  const paramMissing = Array.from(PARAM_IDS).filter((i) => !$(i));
  check('every classified parameter control still exists' + (paramMissing.length ? ' - MISSING: ' + paramMissing.join(', ') : ''), paramMissing.length === 0);
  const addButtons = Array.from(document.querySelectorAll('#root .repeat-inst-add')).map((b) => b.getAttribute('data-prefix'));
  const unknownAdds = addButtons.filter((p) => !(p in ADD_ROWS));
  const goneAdds = Object.keys(ADD_ROWS).filter((p) => addButtons.indexOf(p) < 0);
  check('every "+ Add ..." button is classified' + (unknownAdds.length ? ' - UNCLASSIFIED: ' + unknownAdds.join(', ') : ''), unknownAdds.length === 0);
  check('every classified "+ Add ..." button still exists' + (goneAdds.length ? ' - MISSING: ' + goneAdds.join(', ') : ''), goneAdds.length === 0);
  const otherButtons = Array.from(document.querySelectorAll('#root button')).filter((b) => !b.classList.contains('repeat-inst-add') && !b.classList.contains('rec-entfldatr-apply'));
  check('no other buttons in the panels (they would need a driver)' + (otherButtons.length ? ' - FOUND: ' + otherButtons.map((b) => b.className + ':' + b.textContent.trim()).join(' | ') : ''), otherButtons.length === 0);
  check('the Indicator row offers exactly the ten classified kinds', (() => {
    const s2 = mount(BASE.PLAIN, [kwd('HELP', '55')]);
    void s2;
    const sel = document.querySelector('select[class$="-kind"]');
    const got = sel ? Array.from(sel.options).map((o) => o.value).sort().join(',') : '';
    return got === INDICATOR_KINDS.slice().sort().join(',');
  })());
}

// ===========================================================================
// Part C - the sweep
// ===========================================================================
const EXPECTED_ROWS = Object.keys(CHECKBOX_ROWS).length + Object.keys(APPLY_ROWS).length + Object.keys(INPUT_ROWS).length + Object.keys(ADD_ROWS).length + (INDICATOR_KINDS.length - 1);
const gapLog = [];

function verdict(kind, rowKey, label, o, keyword) {
  const want = allowed(kind, keyword) ? 'accepted' : 'refused';
  const gap = KNOWN_GAPS[kind + '|' + rowKey];
  if (o.status === 'missing') { check(kind + ' / ' + label + ': the control exists', false); return false; }
  if (o.status === 'noop') { check(kind + ' / ' + label + ': the driver ran but NOTHING happened (no edit, no alert)', false); return true; }
  if (gap) {
    const stillGap = o.status === 'accepted' && want === 'refused';
    check(kind + ' / ' + label + ': KNOWN GAP (' + gap + ') - ' + (stillGap ? 'still accepted although ' + keyword + ' is not allowed on this record' : 'GAP CLOSED - remove it from KNOWN_GAPS (or the row no longer behaves as recorded)'), stillGap);
    if (stillGap) gapLog.push({ kind, rowKey, keyword, gap, reachable: kind !== 'USRDFN' || USRDFN_VISIBLE_PANELS.indexOf(o.panel) >= 0, panel: o.panel });
    return true;
  }
  if (want === 'refused') {
    const good = o.status === 'refused' && !o.mutated;
    check(kind + ' / ' + label + ': ' + keyword + ' is not allowed here -> refused with an alert, record untouched' + (o.status === 'accepted' ? ' (ACCEPTED instead)' : ''), good);
    if (good) check(kind + ' / ' + label + ': the alert names ' + keyword, o.keyword === keyword);
  } else {
    check(kind + ' / ' + label + ': ' + keyword + ' is allowed here -> accepted' + (o.status === 'refused' ? ' (REFUSED instead: ' + (o.msg || '').slice(0, 70) + ')' : ''), o.status === 'accepted');
  }
  return true;
}

KINDS.forEach((kind) => {
  console.log('\nPart C. ' + kind + ' record' + (kind === 'PLAIN' ? ' (the control: nothing may be refused for whitelist reasons)' : ''));
  let driven = 0;
  Object.keys(CHECKBOX_ROWS).forEach((stem) => {
    const o = driveCheckbox(kind, stem);
    if (verdict(kind, 'cb:' + stem, 'rec-' + stem + '-on (' + CHECKBOX_ROWS[stem] + ')', o, CHECKBOX_ROWS[stem])) driven++;
  });
  Object.keys(APPLY_ROWS).forEach((stem) => {
    const o = driveApply(kind, stem);
    if (verdict(kind, 'apply:' + stem, 'rec-' + stem + ' tick + Apply (' + APPLY_ROWS[stem].keyword + ')', o, APPLY_ROWS[stem].keyword)) driven++;
  });
  Object.keys(INPUT_ROWS).forEach((name) => {
    const o = driveInputRow(kind, name);
    if (verdict(kind, 'input:' + name, 'input row ' + name + ' (' + INPUT_ROWS[name].keyword + ')', o, INPUT_ROWS[name].keyword)) driven++;
  });
  Object.keys(ADD_ROWS).forEach((prefix) => {
    const o = driveAdd(kind, prefix);
    // The Indicator row's Add creates the record type's default kind; whatever it
    // creates (or, if refused, names) is what must be legal here.
    const named = ADD_ROWS[prefix] || (o.status === 'refused' ? o.keyword : (o.added && o.added[0]));
    if (verdict(kind, 'add:' + prefix, '+ Add on ' + prefix + ' (' + named + ')', o, named)) driven++;
  });
  INDICATOR_KINDS.forEach((target) => {
    if (target === INDICATOR_START[kind]) return;
    const o = driveKind(kind, target);
    if (verdict(kind, 'kind:' + target, 'Indicator row ' + INDICATOR_START[kind] + ' -> ' + target, o, target)) driven++;
  });
  check(kind + ': every classified row was driven (' + driven + ' of ' + EXPECTED_ROWS + ')', driven === EXPECTED_ROWS);
});

console.log('\nSummary of the known gaps this sweep asserts (reachable = the row is on a tab the record type actually shows):');
gapLog.forEach((g) => console.log('  ' + g.kind.padEnd(7) + g.rowKey.padEnd(28) + g.keyword.padEnd(10) + g.gap.padEnd(10) + (g.reachable ? 'reachable' : 'latent (tab hidden by R2)') + ' [' + g.panel + ']'));
check('every KNOWN_GAPS entry was exercised', Object.keys(KNOWN_GAPS).every((k) => gapLog.some((g) => g.kind + '|' + g.rowKey === k)));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);

/**
 * i102UsrdfnWhitelistAwareGuard.test.js
 *
 * Task I-102 - found by a direct check of a USRDFN record's keyword rows.
 * USRDFN's own DDS Reference text is a WHITELIST: "No file- or record-level
 * keywords apply to this record except INVITE, KEEP, PASSRCD, HLPRTN, HELP,
 * HLPCLR, PRINT, OPENPRT, and TEXT." But DspfWriter.usrdfnConflictReason -
 * called by wirePulldownGuardedFlag, wireUsrdfnGuardedFlag and
 * wireUsrdfnGuardedTwoField - refused EVERY keyword on a USRDFN record.
 * I-44 made that call unconditional on the stated premise that "none of
 * this function's 15 call sites is on the whitelist"; HLPCLR and INVITE were
 * routed through wirePulldownGuardedFlag afterwards (I-51 wired their
 * Conditioning toggles there), so ticking either on a USRDFN record was
 * refused with "cannot be specified on a user-defined (USRDFN) record
 * format" although both are allowed.
 *
 * Fix: usrdfnConflictReason now consults USRDFN_WHITELIST_KEYWORDS itself
 * (a whitelisted keyword returns null). That closes the gap for every caller
 * by construction, not just these two, and keeps the existing refusal
 * wording for everything else, so no other test or caller changes.
 *
 * Part 1: unit checks of the writer function. Part 2: the exported record
 * panels driven directly in a plain jsdom document (R2's tab narrowing
 * bypassed, so INVITE - whose row is in a panel a USRDFN record hides - is
 * reachable). Part 3: the real generated designer.
 * Run with: node src/test/i102UsrdfnWhitelistAwareGuard.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const WHITELIST = ['INVITE', 'KEEP', 'PASSRCD', 'HLPRTN', 'HELP', 'HLPCLR', 'PRINT', 'OPENPRT', 'TEXT'];
// Keywords the record panels wire through the three guard functions, none of
// them on the whitelist (I-44's 15 wirePulldownGuardedFlag callers, plus the
// wireUsrdfnGuardedFlag ones).
const PULLDOWN_GUARDED = ['inzrcd', 'alarm', 'alwgph', 'frcdta', 'slno', 'clrl', 'rtndta', 'overlay', 'putretain', 'putovr', 'ovrdta', 'ovratr', 'mdtoff', 'eraseinp', 'erase'];
const USRDFN_GUARDED = ['assume', 'alwrol', 'retkey', 'retcmdkey', 'csrinponly', 'valnum', 'wrdwrap', 'hlpcmdkey', 'blink', 'msgalarm', 'lock', 'logout', 'dspmod', 'loginp', 'getretain', 'retlcksts', 'protect', 'inzinp'];

// ===========================================================================
// Part 1 - unit checks
// ===========================================================================
console.log('\nDspfWriter.usrdfnConflictReason: whitelist-aware');
const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const usrdfn = [k('USRDFN')];
{
  WHITELIST.concat(['USRDFN']).forEach((n) => {
    check('whitelisted ' + n + ' on a USRDFN record -> not refused', DspfWriter.usrdfnConflictReason(n, usrdfn) === null);
  });
  const blocked = PULLDOWN_GUARDED.concat(USRDFN_GUARDED, ['HLPSEQ', 'CSRLOC', 'CHGINPDFT']).map((n) => n.toUpperCase());
  let allRefused = true;
  let wordingKept = true;
  blocked.forEach((n) => {
    const r = DspfWriter.usrdfnConflictReason(n, usrdfn);
    if (!r) allRefused = false;
    if (r !== n + ' cannot be specified on a user-defined (USRDFN) record format (per the DDS Reference).') wordingKept = false;
  });
  check('all ' + blocked.length + ' non-whitelisted keywords on a USRDFN record are still refused', allRefused);
  check('...with exactly the existing wording (so no caller or wording test changes)', wordingKept);

  const plainOnes = [[], [k('SFL')], [k('MNUBAR')], [k('SFLCTL', 'X')], [k('PULLDOWN')]];
  let never = true;
  plainOnes.forEach((kws) => { WHITELIST.concat(blocked).forEach((n) => { if (DspfWriter.usrdfnConflictReason(n, kws) !== null) never = false; }); });
  check('on a record that is NOT USRDFN nothing is ever refused by it', never);

  // it now agrees with the whitelist function on which keywords are blocked
  let agree = true;
  WHITELIST.concat(blocked, ['USRDFN']).forEach((n) => {
    const a = DspfWriter.usrdfnConflictReason(n, usrdfn) === null;
    const b = DspfWriter.usrdfnWhitelistConflictReason(n, usrdfn) === null;
    if (a !== b) agree = false;
  });
  check('it agrees with usrdfnWhitelistConflictReason on every keyword (they differ only in wording)', agree);
  check('the whitelist constant itself is unchanged', WHITELIST.every((n) => DspfWriter.usrdfnWhitelistConflictReason(n, usrdfn) === null) && !!DspfWriter.usrdfnWhitelistConflictReason('ASSUME', usrdfn));
}

// ===========================================================================
// Part 2 - the record panels driven directly
// ===========================================================================
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function allPanelsHtml(keywords) {
  const o = Helpers.recordKeywordsPanelsHtml(keywords, 'rk', new Set());
  return Object.keys(o).map((key) => (typeof o[key] === 'string' ? o[key] : '')).join('');
}
function mount(initial) {
  const st = { keywords: initial };
  const get = () => st.keywords;
  function render() { document.getElementById('root').innerHTML = allPanelsHtml(st.keywords); }
  function onChange(next) { st.keywords = next; render(); Helpers.wireRecordKeywordsPanels('rk', get, onChange, new Set(), function () {}); }
  render();
  Helpers.wireRecordKeywordsPanels('rk', get, onChange, new Set(), function () {});
  return st;
}
function tick(st, row, on) {
  const cb = document.getElementById('rk-' + row + '-on');
  if (!cb) return { found: false };
  let alertMessage = null;
  const original = global.window.alert;
  global.window.alert = function (m) { alertMessage = m; };
  cb.checked = on;
  cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  global.window.alert = original;
  const after = document.getElementById('rk-' + row + '-on');
  return { found: true, alertMessage, checkedAfter: after ? after.checked : null };
}
const has = (st, name) => st.keywords.some((x) => x.name === name);

console.log('\nUSRDFN record, panels driven directly: whitelisted keywords are accepted');
['hlpclr', 'invite'].forEach((row) => {
  const NAME = row.toUpperCase();
  const st = mount([k('USRDFN')]);
  const r = tick(st, row, true);
  check(NAME + ': the row is rendered', r.found);
  check(NAME + ': ticking it fires no alert', r.found && !r.alertMessage);
  check(NAME + ': the keyword is added to the record', has(st, NAME));
  check(NAME + ': the checkbox stays checked', r.found && r.checkedAfter === true);
  const off = tick(st, row, false);
  check(NAME + ': un-ticking it fires no alert and removes it', !off.alertMessage && !has(st, NAME));
  check(NAME + ': USRDFN itself is still on the record', has(st, 'USRDFN'));
});

console.log('\nUSRDFN record: a hand-written HLPCLR / INVITE that is already there can be edited and removed');
{
  const st = mount([k('USRDFN'), k('HLPCLR'), k('INVITE')]);
  check('setup: both boxes render checked', document.getElementById('rk-hlpclr-on').checked && document.getElementById('rk-invite-on').checked);
  const a = tick(st, 'hlpclr', false);
  check('un-ticking HLPCLR fires no alert and removes it', !a.alertMessage && !has(st, 'HLPCLR'));
  const b = tick(st, 'invite', false);
  check('un-ticking INVITE fires no alert and removes it', !b.alertMessage && !has(st, 'INVITE'));
}

console.log('\nUSRDFN record: every non-whitelisted keyword wired through the guards is still refused');
PULLDOWN_GUARDED.concat(USRDFN_GUARDED).forEach((row) => {
  const NAME = row.toUpperCase();
  const st = mount([k('USRDFN')]);
  const r = tick(st, row, true);
  if (!r.found) { check(NAME + ': row is rendered', false); return; }
  check(NAME + ': refused with the USRDFN alert, nothing added, box put back',
    !!r.alertMessage && /cannot be specified on a user-defined \(USRDFN\) record format/.test(r.alertMessage) && !has(st, NAME) && r.checkedAfter === false);
});

console.log('\ncontrol: a plain record still accepts them (nothing here is USRDFN-only behaviour)');
['hlpclr', 'invite', 'alarm', 'assume'].forEach((row) => {
  const NAME = row.toUpperCase();
  const st = mount([]);
  const r = tick(st, row, true);
  check(NAME + ' on a plain record: no alert, added', r.found && !r.alertMessage && has(st, NAME));
});

// ===========================================================================
// Part 3 - the real generated designer
// ===========================================================================
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'USRREC', func: 'USRDFN' }),
].join('\n') + '\n';
const html = getWebviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I102.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);
const posted = [];
const errors = [];
const webDom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const d = webDom.window.document;
  const sel = d.getElementById('recordSelect');
  sel.value = 'USRREC';
  sel.dispatchEvent(new webDom.window.Event('change', { bubbles: true }));

  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = webDom.window.alert;
    webDom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    webDom.window.alert = original;
    return { alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  const setBox = (id, on) => act(() => { const c = d.getElementById(id); c.checked = on; c.dispatchEvent(new webDom.window.Event('change', { bubbles: true })); });
  const recordKeywords = (text) => { const r = DspfParser.parseDspf(text).records.find((x) => x.name === 'USRREC'); return r ? r.keywords.map((x) => x.name) : []; };

  console.log('\nreal designer, USRDFN record: HLPCLR (Help subtab) can be turned on and off');
  check('setup: the HLPCLR row is on the USRDFN record', !!d.getElementById('rk-USRREC-hlpclr-on'));
  {
    const r = setBox('rk-USRREC-hlpclr-on', true);
    check('ticking HLPCLR fires no alert and commits an edit', !r.alertMessage && !!r.applyEdit);
    const names = r.applyEdit ? recordKeywords(r.applyEdit.text) : [];
    check('...HLPCLR is written, USRDFN kept', names.includes('HLPCLR') && names.includes('USRDFN'));
    const off = setBox('rk-USRREC-hlpclr-on', false);
    check('un-ticking it fires no alert and removes it', !off.alertMessage && !!off.applyEdit && !recordKeywords(off.applyEdit.text).includes('HLPCLR'));
  }
  console.log('\nreal designer, USRDFN record: a non-whitelisted General row is still refused');
  {
    const r = setBox('rk-USRREC-assume-on', true);
    check('ASSUME is refused with the USRDFN alert and no edit', !!r.alertMessage && /USRDFN/.test(r.alertMessage) && !r.applyEdit);
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  if (failures) process.exitCode = 1;
}, 600);

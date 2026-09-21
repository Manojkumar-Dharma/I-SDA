/**
 * i101RecordLevelNoOptionIndicators.test.js
 *
 * Task I-101, batch 2 - the record-level-only keywords. Batch 1 (v0.10.180)
 * closed the raw keyword editor's Conditioning toggle for the 14 file-level-only
 * keywords; this batch adds the 29 record-level-only keywords whose own section
 * of DDS_Keyword_V7r6.txt says, plainly, "Option indicators are not valid for
 * this keyword" (30 with SFLMODE, added once its "valid" sentence was traced to
 * the neighbouring SFLMSG/SFLMSGID text):
 *   plain (24):  ALWROL ASSUME CLRL GETRETAIN GRDRCD HLPCMDKEY HLPSEQ INZRCD
 *                LOGINP MNUBAR PULLDOWN RTNCSRLOC RTNDTA SETOF SFL SFLCTL
 *                SFLENTER SFLMLTCHC SFLMODE SFLRNA SFLRTNSEL SFLSNGCHC SLNO
 *                UNLOCK USRDFN
 *   display size (5): SFLLIN SFLMSGRCD SFLPAG SFLSIZ WINDOW - same sentence, but
 *                display size condition names are valid (the MSGLOC shape).
 * Held back on purpose: CSRLOC (its section says option indicators ARE valid).
 *
 * Part 1: the table, checked AGAINST the reference text itself.
 * Part 2: the raw editor in a plain jsdom document.
 * Part 3: no structured record panel puts a Conditioning toggle on any of them
 *         (a pin - the raw editor is the only door this batch had to close).
 * Part 4: the real generated designer's record-level raw editor.
 * Run with: node src/test/i101RecordLevelNoOptionIndicators.test.js
 */
const fs = require('fs');
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

const PLAIN = ['ALWROL', 'ASSUME', 'CLRL', 'GETRETAIN', 'GRDRCD', 'HLPCMDKEY', 'HLPSEQ', 'INZRCD', 'LOGINP', 'MNUBAR', 'PULLDOWN', 'RTNCSRLOC', 'RTNDTA', 'SETOF', 'SFL', 'SFLCTL', 'SFLENTER', 'SFLMLTCHC', 'SFLMODE', 'SFLRNA', 'SFLRTNSEL', 'SFLSNGCHC', 'SLNO', 'UNLOCK', 'USRDFN'];
const DSIZE = ['SFLLIN', 'SFLMSGRCD', 'SFLPAG', 'SFLSIZ', 'WINDOW'];
const BATCH = PLAIN.concat(DSIZE);
const FILE_LEVEL = ['ALTHELP', 'ALTPAGEDWN', 'ALTPAGEUP', 'DSPRL', 'DSPSIZ', 'ERRSFL', 'HLPFULL', 'HLPSCHIDX', 'INDARA', 'MSGLOC', 'OPENPRT', 'PASSRCD', 'REF', 'USRDSPMGT'];

// ===========================================================================
// Part 1 - the table, against the DDS Reference
// ===========================================================================
console.log('\nPart 1a. the table');
{
  const names = DspfWriter.noOptionIndicatorKeywordNames();
  check('every batch keyword is listed (30 = 25 plain + 5 display-size)', BATCH.length === 30 && BATCH.every((n) => names.indexOf(n) >= 0));
  check('batch 1 (14 file-level) and IGCALTTYP are still listed', FILE_LEVEL.every((n) => names.indexOf(n) >= 0) && names.indexOf('IGCALTTYP') >= 0);
  check('the file-level and record-level entries add up (45 = 30 + 14 + IGCALTTYP; batch 3 adds the field-level ones - see i101FieldLevelNoOptionIndicators)', names.length >= BATCH.length + FILE_LEVEL.length + 1);
  check('each reason names its keyword and says "not valid"', BATCH.every((n) => {
    const r = DspfWriter.noOptionIndicatorsReason(n);
    return !!r && r.indexOf(n) >= 0 && /not valid/.test(r);
  }));
  check('the five display-size reasons also say display size condition names are valid', DSIZE.every((n) => /display size condition/.test(DspfWriter.noOptionIndicatorsReason(n))));
  check('the 24 plain reasons do not', PLAIN.every((n) => !/display size/.test(DspfWriter.noOptionIndicatorsReason(n))));
  check('lookup is case-insensitive and trims', DspfWriter.noOptionIndicatorsReason(' sflsiz ') === DspfWriter.noOptionIndicatorsReason('SFLSIZ'));
  const G1 = [{ indicators: [{ number: '01', not: false }] }];
  check('the diff check fires for a batch keyword that gains an indicator', BATCH.every((n) => !!DspfWriter.noOptionIndicatorsNewConflictReason(n, [], G1)));
  check('...but not for one that only loses it or is unchanged', BATCH.every((n) => DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, []) === null && DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, G1) === null));
  check('...nor for a display-size condition, which is not an option indicator', DSIZE.every((n) => DspfWriter.noOptionIndicatorsNewConflictReason(n, [], [{ displaySizeCondition: { name: '*DS4', not: false }, indicators: [] }]) === null));
  check('held back: CSRLOC is not in the table', !DspfWriter.noOptionIndicatorsReason('CSRLOC'));
  check('unlisted keywords stay null (HLPTITLE, CA01, MSGID, CHECK, KEEP, HELP)', ['HLPTITLE', 'CA01', 'MSGID', 'CHECK', 'KEEP', 'HELP'].every((n) => DspfWriter.noOptionIndicatorsReason(n) === null));
}

console.log('\nPart 1b. every entry is backed by its own record-level section of DDS_Keyword_V7r6.txt');
{
  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
  const anyHeading = /^\f?[A-Z][A-Za-z0-9/]+ \([^)\n]*\)[^\n]*\bkeywords?\b/m;
  function sections(name) {
    const out = [];
    const rx = new RegExp('^\\f?' + name + ' \\(', 'mg');
    let m;
    while ((m = rx.exec(ref))) {
      const rest = ref.slice(m.index + 20, m.index + 14000);
      const nxt = anyHeading.exec(rest);
      out.push((nxt ? ref.slice(m.index, m.index + 20 + nxt.index) : ref.slice(m.index, m.index + 14000)).replace(/\s+/g, ' '));
    }
    return out;
  }
  // The table-of-contents / index fragments share the heading; the real
  // section is the one that describes itself as a "<level>-level keyword".
  const levelOf = (s) => { const m = /\b(file|record|field|help[- ]specification)[- ]?level keyword/i.exec(s.slice(0, 700)); return m ? m[1].toLowerCase() : null; };
  BATCH.forEach((n) => {
    const secs = sections(n).filter((s) => levelOf(s));
    const rec = secs.filter((s) => levelOf(s) === 'record');
    check(n + ': described as a record-level keyword, and no section of it describes another level', rec.length >= 1 && rec.length === secs.length);
    // SFLMODE's extracted text runs on into the NEXT keyword (SFLMSG/SFLMSGID),
    // whose "Option indicators are valid for these keywords" sentence is not
    // SFLMODE's: cut its own text at its own "Example" (asserted just below).
    const text = n === 'SFLMODE' ? rec[0].split(' Example The following example')[0] : rec.join(' ');
    const plain = /Option indicators are not valid for (?:this|these) keywords?[.;]/.test(text);
    check(n + ': its section says "Option indicators are not valid for this keyword"', plain);
    check(n + ': no record-level section of it says option indicators ARE valid', !/Option indicators are (?:valid|allowed)/i.test(text));
    const dsz = /display size condition/i.test(text);
    check(n + ': ' + (DSIZE.indexOf(n) >= 0 ? 'its section mentions display size conditions' : 'its section does not mention display size conditions'), dsz === (DSIZE.indexOf(n) >= 0));
  });
  const csrloc = sections('CSRLOC').filter((s) => levelOf(s) === 'record').join(' ');
  check('CSRLOC (held back): its record-level section says option indicators ARE valid', /Option indicators are valid for this keyword/.test(csrloc));
  const sflmode = sections('SFLMODE').filter((s) => levelOf(s) === 'record').join(' ');
  check('SFLMODE: the "valid" sentence after its own text belongs to SFLMSG/SFLMSGID (its Example follows), not to SFLMODE',
    /Option indicators are not valid for this keyword\. Example The following example shows how to specify the SFLMODE and SFLCSRRRN keywords/.test(sflmode) &&
    /Option indicators are valid for these keywords\. \d+ IBM i: Programming Example The following example shows how to specify the SFLMSG and SFLMSGID keywords/.test(sflmode));
}

// ===========================================================================
// Part 2 - the raw editor helpers in a plain jsdom document
// ===========================================================================
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function kwd(name, parameters, conditions) {
  return { name: name, parameters: parameters || '', conditions: conditions || [], raw: '', sourceLines: [] };
}
const G = (...nums) => ({ indicators: nums.map((n) => ({ number: n, not: false })) });
const DS = (name) => ({ displaySizeCondition: { name: name, not: false }, indicators: [] });

function mount(keywords) {
  const state = { keywords: keywords, changes: 0 };
  const expanded = new Set();
  const root = document.getElementById('root');
  function render() {
    root.innerHTML = Helpers.keywordEditorHtml(state.keywords, 'kwt', expanded);
    Helpers.wireKeywordEditor(state.keywords, onChange, 'kwt', expanded, render);
  }
  function onChange(next) { state.keywords = next; state.changes++; render(); }
  render();
  return state;
}
function withAlertCapture(fn) {
  let msg = null;
  const original = global.window.alert;
  global.window.alert = function (m) { msg = m; };
  try { fn(); } finally { global.window.alert = original; }
  return msg;
}
const click = (el) => el.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
const toggleOf = (idx) => document.querySelector('.kw-cond-toggle[data-owner="kwt"][data-idx="' + idx + '"]');
const rowOf = (idx) => { const t = document.querySelector('.kw-remove[data-owner="kwt"][data-idx="' + idx + '"]'); return t ? t.closest('.kw-row') : null; };
const indicatorsOf = (k) => (k.conditions || []).reduce((n, g) => n + ((g.indicators || []).length), 0);

console.log('\nPart 2a. each of the 29, with no condition: no Conditioning toggle, a note instead');
BATCH.forEach((n) => {
  mount([kwd(n), kwd('DUP')]);
  check(n + ': no Conditioning toggle', !toggleOf(0));
  check(n + ': shows the "No option indicators" note', !!rowOf(0) && /No option indicators/.test(rowOf(0).textContent));
  check(n + ': the neighbouring unlisted keyword keeps its toggle', !!toggleOf(1));
  check(n + ': no warning', !document.querySelector('.kw-cond-warning'));
});

console.log('\nPart 2b. each of the 29, hand-written WITH an indicator: toggle kept, warning names the keyword, adding refused, removing allowed');
BATCH.forEach((n) => {
  const st = mount([kwd(n, '', [G('01')])]);
  check(n + ': the toggle is kept (so the indicator can be removed)', !!toggleOf(0));
  check(n + ': a warning names ' + n, !!document.querySelector('.kw-cond-warning') && document.querySelector('.kw-cond-warning').textContent.indexOf(n) >= 0);
  click(toggleOf(0));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '02';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check(n + ': adding indicator 02 is refused with an alert naming it', !!msg && msg.indexOf(n) >= 0 && st.changes === before && indicatorsOf(st.keywords[0]) === 1);
  const msg2 = withAlertCapture(() => click(document.querySelector('.cond-ind-remove')));
  check(n + ': removing the indicator is allowed, no alert', !msg2 && indicatorsOf(st.keywords[0]) === 0 && st.keywords.length === 1);
  check(n + ': with none left the toggle is gone again', !toggleOf(0));
});

console.log('\nPart 2c. adding a batch keyword through "+ Add keyword" still works, and it starts with no toggle');
{
  const st = mount([]);
  document.getElementById('kwt-new-kw-name').value = 'INZRCD';
  document.getElementById('kwt-new-kw-params').value = '';
  const msg = withAlertCapture(() => click(document.querySelector('.kw-add[data-owner="kwt"]')));
  check('no alert', !msg);
  check('added, unconditioned, no toggle', st.keywords.length === 1 && st.keywords[0].name === 'INZRCD' && !toggleOf(0));
  click(document.querySelector('.kw-remove[data-owner="kwt"][data-idx="0"]'));
  check('and it can be removed again', st.keywords.length === 0);
}

console.log('\nPart 2d. the display-size five keep a toggle while they carry a *DS condition, and refuse an option indicator on top');
DSIZE.forEach((n) => {
  const st = mount([kwd(n, '', [DS('*DS4')])]);
  check(n + ': a size-conditioned one KEEPS its toggle (the condition stays visible and removable)', !!toggleOf(0) && /\(1\)/.test(toggleOf(0).textContent));
  check(n + ': no "No option indicators" note while it has a toggle', !/No option indicators/.test(rowOf(0).textContent));
  check(n + ': no warning - it carries no OPTION indicator', !document.querySelector('.kw-cond-warning'));
  click(toggleOf(0));
  const before = st.changes;
  click(document.querySelector('.cond-add-group'));
  const numInput = document.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
  if (numInput) {
    numInput.value = '05';
    const msg = withAlertCapture(() => click(document.querySelector('.cond-group[data-group="pending"] .cond-ind-add')));
    check(n + ': adding an OPTION indicator on top of the size condition is refused', !!msg && msg.indexOf(n) >= 0 && st.changes === before && indicatorsOf(st.keywords[0]) === 0);
  } else {
    check(n + ': setup: the pending-condition row exists', false);
  }
});
{
  const st = mount([kwd('SFLSIZ', '10', [DS('*DS4')])]);
  click(toggleOf(0));
  const msg = withAlertCapture(() => click(document.querySelector('.cond-group-remove')));
  check('removing the size condition is allowed, then the toggle is gone', !msg && st.keywords[0].conditions.length === 0 && !toggleOf(0));
}

console.log('\nPart 2e. keywords outside the batch are unchanged (CSRLOC is held back on purpose)');
{
  const st = mount([kwd('CSRLOC', 'ROW COL', [G('01')]), kwd('KEEP', '', [G('02')]), kwd('DUP', '', [G('03')])]);
  check('no warnings on CSRLOC / KEEP / DUP', !document.querySelector('.kw-cond-warning'));
  check('all three keep their toggles', !!toggleOf(0) && !!toggleOf(1) && !!toggleOf(2));
  click(toggleOf(0));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '09';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('an indicator can still be added to CSRLOC (its section says they are valid)', !msg && st.changes === before + 1);
}

// ===========================================================================
// Part 3 - no structured record panel conditions any of them
// ===========================================================================
console.log('\nPart 3. structured record panels: no Conditioning toggle on any batch keyword');
{
  const all = BATCH.map((n) => kwd(n, ''));
  const expanded = new Set();
  const toggleIds = (panels) => {
    const html = Object.keys(panels).map((k) => (typeof panels[k] === 'string' ? panels[k] : '')).join('');
    const d = new dom.window.DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    return Array.from(d.querySelectorAll('.kw-cond-toggle')).map((e) => e.getAttribute('data-flag-id'));
  };
  const builders = {
    'record keywords (all seven subtabs)': toggleIds(Helpers.recordKeywordsPanelsHtml(all, 'rk-R', expanded)),
    'SFL tab': toggleIds(Helpers.sflKeywordsPanelsHtml([kwd('SFL')], 'sfl-R', expanded)),
    'SFLCTL tab': toggleIds(Helpers.sflCtlPanelsHtml({ name: 'R', keywords: [kwd('SFLCTL')], fields: [] }, 'sflctl-R', expanded, [])),
    'SFLMSG tab': toggleIds(Helpers.sflMsgPanelsHtml({ name: 'R', keywords: [kwd('SFL'), kwd('SFLMSGRCD', 'X')], fields: [] }, expanded, [])),
    'MNUBAR tab': toggleIds(Helpers.mnuBarPanelsHtml([kwd('MNUBAR')], 'mnubar-R', expanded, [])),
    'Pull-down tab': toggleIds(Helpers.pulldownPanelsHtml([kwd('PULLDOWN')], 'rpd-R', expanded)),
    'Window tab': toggleIds(Helpers.windowPanelsHtml([kwd('WINDOW', '1 1 5 5')], 'rw-R', expanded)),
  };
  const lower = BATCH.map((n) => n.toLowerCase());
  Object.keys(builders).forEach((label) => {
    const hits = builders[label].filter((id) => lower.some((l) => id === null ? false : id.slice(id.lastIndexOf('-') + 1) === l));
    check(label + ': no toggle belongs to a batch keyword (' + builders[label].length + ' toggles, hits: ' + (hits.join(',') || 'none') + ')', hits.length === 0);
  });
  check('pin: the same scan does find the CSRLOC toggle (held back), so it can see them', builders['record keywords (all seven subtabs)'].some((id) => /-csrloc$/.test(id)));
  const rec = Helpers.recordIndicatorInstancesHtml([kwd('SETOF', '10')], 'rk-R-recind', expanded);
  check('a SETOF row in the record-indicator list has no Conditioning toggle (I-20), only the hint', !/repeat-inst-cond-toggle/.test(rec) && /Option indicators are not valid/.test(rec));
}

// ===========================================================================
// Part 4 - the real generated designer, record-level raw editor
// ===========================================================================
const SRC = [
  buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
  buildLine({ seq: '00020', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
  buildLine({ seq: '00030', nameType: 'R', name: 'CTLREC', func: 'SFLCTL(SFLREC)' }),
  buildLine({ seq: '00040', func: 'SFLSIZ(10)' }),
  buildLine({ seq: '00050', ind1: '20', func: 'SFLPAG(5)' }),
  buildLine({ seq: '00060', func: 'SFLPAG(8)', sizeCondition: '*DS4' }),
  buildLine({ seq: '00070', func: 'CSRLOC(ROW COL)', ind1: '30' }),
  buildLine({ seq: '00080', nameType: 'R', name: 'PLAINREC', func: 'INZRCD' }),
].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce101b', SRC, 'I101B.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);
const errors = [];
const webDom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    window.alert = () => {};
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const d = webDom.window.document;
  const parsed = DspfParser.parseDspf(SRC);
  const ctl = parsed.records.find((r) => r.name === 'CTLREC');
  console.log('\nPart 4. real designer, record-level raw editor');
  check('setup: CTLREC parsed with SFLCTL, SFLSIZ, SFLPAG (x2) and CSRLOC', !!ctl && ctl.keywords.map((k) => k.name).join(',') === 'SFLCTL,SFLSIZ,SFLPAG,SFLPAG,CSRLOC');
  const sel = d.getElementById('recordSelect');
  const open = (name) => { sel.value = name; sel.dispatchEvent(new webDom.window.Event('change', { bubbles: true })); };
  open('CTLREC');
  const owner = 'record-CTLREC';
  const tog = (idx) => d.querySelector('.kw-cond-toggle[data-owner="' + owner + '"][data-idx="' + idx + '"]');
  const rowText = (idx) => { const b = d.querySelector('.kw-remove[data-owner="' + owner + '"][data-idx="' + idx + '"]'); return b ? b.closest('.kw-row').textContent : ''; };
  check('SFLCTL chip: no Conditioning toggle, note shown', /SFLCTL/.test(rowText(0)) && !tog(0) && /No option indicators/.test(rowText(0)));
  check('SFLSIZ(10) chip: no Conditioning toggle, note shown', /SFLSIZ/.test(rowText(1)) && !tog(1) && /No option indicators/.test(rowText(1)));
  check('SFLPAG(5) with indicator 20 (hand-written): toggle kept, warning names SFLPAG', /SFLPAG/.test(rowText(2)) && !!tog(2) && /SFLPAG/.test(d.querySelector('.kw-row .kw-cond-warning') ? d.querySelector('.kw-row .kw-cond-warning').textContent : ''));
  check('SFLPAG(8) under *DS4 keeps its toggle, no note', /SFLPAG/.test(rowText(3)) && !!tog(3) && !/No option indicators/.test(rowText(3)));
  check('CSRLOC chip (held back) keeps its Conditioning toggle', /CSRLOC/.test(rowText(4)) && !!tog(4));
  open('PLAINREC');
  const t2 = d.querySelector('.kw-cond-toggle[data-owner="record-PLAINREC"][data-idx="0"]');
  const r2 = d.querySelector('.kw-remove[data-owner="record-PLAINREC"][data-idx="0"]');
  check('INZRCD chip on another record: no toggle, note shown', !!r2 && /INZRCD/.test(r2.closest('.kw-row').textContent) && !t2 && /No option indicators/.test(r2.closest('.kw-row').textContent));
  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 500);

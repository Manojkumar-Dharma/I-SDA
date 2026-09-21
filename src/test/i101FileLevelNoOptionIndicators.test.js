/**
 * i101FileLevelNoOptionIndicators.test.js
 *
 * Task I-101, batch 1 - the file-level-only keywords. I-95 added the raw
 * keyword editor's option-indicator guard (NO_OPTION_INDICATOR_KEYWORDS, a
 * name -> message table) but seeded it with IGCALTTYP alone, because the DDS
 * Reference has ~90 keywords with an "Option indicators are not valid"
 * sentence and that sentence is sometimes conditional, so the table cannot be
 * filled mechanically. This batch adds the 14 keywords that (a) exist at the
 * file level only, so a name-keyed entry is exactly right, and (b) say it
 * plainly in their own section:
 *   ALTHELP ALTPAGEDWN ALTPAGEUP DSPRL DSPSIZ ERRSFL HLPFULL HLPSCHIDX
 *   INDARA MSGLOC OPENPRT PASSRCD REF USRDSPMGT
 *
 * Part 1: the table, checked AGAINST the reference text itself (so a wrong
 *         entry fails here rather than in someone's file).
 * Part 2: the raw editor in a plain jsdom document - all 14, plus the
 *         display-size edge (MSGLOC legitimately takes *DS3/*DS4 conditions).
 * Part 3: the real generated designer's file-level raw editor.
 * Run with: node src/test/i101FileLevelNoOptionIndicators.test.js
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

const BATCH = ['ALTHELP', 'ALTPAGEDWN', 'ALTPAGEUP', 'DSPRL', 'DSPSIZ', 'ERRSFL', 'HLPFULL', 'HLPSCHIDX', 'INDARA', 'MSGLOC', 'OPENPRT', 'PASSRCD', 'REF', 'USRDSPMGT'];

// ===========================================================================
// Part 1 - the table, against the DDS Reference
// ===========================================================================
console.log('\nPart 1a. the table');
{
  const names = DspfWriter.noOptionIndicatorKeywordNames();
  check('every batch keyword is listed', BATCH.every((n) => names.indexOf(n) >= 0));
  check('IGCALTTYP (I-95) is still listed', names.indexOf('IGCALTTYP') >= 0);
  check('nothing from the file level or IGCALTTYP is missing (later batches add more entries - see i101RecordLevelNoOptionIndicators)', names.length >= BATCH.length + 1);
  check('each reason names its keyword and says "not valid"', BATCH.every((n) => {
    const r = DspfWriter.noOptionIndicatorsReason(n);
    return !!r && r.indexOf(n) >= 0 && /not valid/.test(r);
  }));
  check('lookup is case-insensitive and trims', DspfWriter.noOptionIndicatorsReason(' msgloc ') === DspfWriter.noOptionIndicatorsReason('MSGLOC'));
  check('the diff check fires for a batch keyword that gains an indicator', BATCH.every((n) => !!DspfWriter.noOptionIndicatorsNewConflictReason(n, [], [{ indicators: [{ number: '01', not: false }] }])));
  check('...but not for one that only loses it or is unchanged', BATCH.every((n) => {
    const g = [{ indicators: [{ number: '01', not: false }] }];
    return DspfWriter.noOptionIndicatorsNewConflictReason(n, g, []) === null && DspfWriter.noOptionIndicatorsNewConflictReason(n, g, g) === null;
  }));
  check('a display-size condition is not an option indicator', DspfWriter.noOptionIndicatorsNewConflictReason('MSGLOC', [], [{ displaySizeCondition: { name: '*DS4', not: false }, indicators: [] }]) === null);
  ['TEXT', 'KEEP', 'CHGINPDFT', 'INDTXT', 'HLPTITLE', 'CA01', 'HELP', 'PRINT', 'DFT', 'MSGID', 'CHECK'].forEach((n) => {
    check(n + ' is NOT listed (multi-level, conditional or allowed - later batches / never)', DspfWriter.noOptionIndicatorsReason(n) === null);
  });
}

console.log('\nPart 1b. every entry is backed by its own section of DDS_Keyword_V7r6.txt');
{
  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
  const heading = { ALTPAGEDWN: 'ALTPAGEDWN/ALTPAGEUP', ALTPAGEUP: 'ALTPAGEDWN/ALTPAGEUP' };
  const anyHeading = /^\f?[A-Z][A-Za-z0-9/]+ \([^)\n]*\)[^\n]*\bkeywords?\b/m;
  function sections(name) {
    const out = [];
    const rx = new RegExp('^\\f?' + (heading[name] || name).replace('/', '\\/') + ' \\(', 'mg');
    let m;
    while ((m = rx.exec(ref))) {
      const rest = ref.slice(m.index + 20, m.index + 14000);
      const nxt = anyHeading.exec(rest);
      out.push((nxt ? ref.slice(m.index, m.index + 20 + nxt.index) : ref.slice(m.index, m.index + 14000)).replace(/\s+/g, ' '));
    }
    return out;
  }
  BATCH.forEach((n) => {
    const secs = sections(n);
    const plain = secs.some((s) => /Option indicators are not valid for (?:this|these) keywords?\./.test(s));
    const contradicted = secs.some((s) => /Option indicators are (?:valid|allowed) (?:for|with) (?:this|these) keywords?\./.test(s));
    check(n + ': its section says "Option indicators are not valid for this keyword"', plain);
    check(n + ': no section of it says option indicators ARE valid', !contradicted);
  });
  const fileLevel = (n) => sections(n).some((s) => /file-level keywords?/.test(s.slice(0, 700)));
  BATCH.forEach((n) => {
    check(n + ': described as a file-level keyword', fileLevel(n) || n === 'USRDSPMGT' || n === 'OPENPRT' || n === 'HLPFULL');
  });
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

console.log('\nPart 2a. each of the 14, with no condition: no Conditioning toggle, a note instead');
BATCH.forEach((n) => {
  const st = mount([kwd(n), kwd('DUP')]);
  check(n + ': no Conditioning toggle', !toggleOf(0));
  check(n + ': shows the "No option indicators" note', !!rowOf(0) && /No option indicators/.test(rowOf(0).textContent));
  check(n + ': the neighbouring unlisted keyword keeps its toggle', !!toggleOf(1));
  check(n + ': no warning', !document.querySelector('.kw-cond-warning'));
  void st;
});

console.log('\nPart 2b. each of the 14, hand-written WITH an indicator: toggle kept, warning names the keyword, adding refused, removing allowed');
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
  document.getElementById('kwt-new-kw-name').value = 'ERRSFL';
  document.getElementById('kwt-new-kw-params').value = '';
  const msg = withAlertCapture(() => click(document.querySelector('.kw-add[data-owner="kwt"]')));
  check('no alert', !msg);
  check('added, unconditioned, no toggle', st.keywords.length === 1 && st.keywords[0].name === 'ERRSFL' && !toggleOf(0));
  click(document.querySelector('.kw-remove[data-owner="kwt"][data-idx="0"]'));
  check('and it can be removed again', st.keywords.length === 0);
}

console.log('\nPart 2d. the display-size edge: MSGLOC legitimately takes *DS3/*DS4 conditions');
{
  const st = mount([kwd('MSGLOC', '27', [DS('*DS4')])]);
  check('a MSGLOC carrying only a display-size condition KEEPS its toggle (so it stays visible and removable)', !!toggleOf(0));
  check('the toggle shows the condition count', !!toggleOf(0) && /\(1\)/.test(toggleOf(0).textContent));
  check('no "No option indicators" note while it has a toggle', !/No option indicators/.test(rowOf(0).textContent));
  check('no warning - it carries no OPTION indicator', !document.querySelector('.kw-cond-warning'));
  click(toggleOf(0));
  check('the size condition is shown in the editor', /\*DS4/.test(document.querySelector('.kw-cond-body').textContent));
  const msg = withAlertCapture(() => click(document.querySelector('.cond-group-remove')));
  check('removing the size condition is allowed', !msg && st.keywords[0].conditions.length === 0);
  check('with nothing left the toggle is gone again', !toggleOf(0));
}
{
  const st = mount([kwd('MSGLOC', '27', [DS('*DS4')])]);
  click(toggleOf(0));
  document.getElementById('kwt-kw0-cond-groups');
  const before = st.changes;
  click(document.querySelector('.cond-add-group'));
  const numInput = document.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
  if (numInput) {
    numInput.value = '05';
    const msg = withAlertCapture(() => click(document.querySelector('.cond-group[data-group="pending"] .cond-ind-add')));
    check('adding an OPTION indicator on top of the size condition is refused', !!msg && /MSGLOC/.test(msg) && st.changes === before && indicatorsOf(st.keywords[0]) === 0);
  } else {
    check('setup: the pending-condition row exists', false);
  }
}

console.log('\nPart 2e. keywords outside the batch are unchanged');
{
  const st = mount([kwd('TEXT', "'x'", [G('01')]), kwd('CHGINPDFT', '', [G('02')]), kwd('HLPTITLE', "'t'", [G('03')])]);
  check('no warnings on TEXT / CHGINPDFT / HLPTITLE (later batches will decide them)', !document.querySelector('.kw-cond-warning'));
  check('all three keep their toggles', !!toggleOf(0) && !!toggleOf(1) && !!toggleOf(2));
  click(toggleOf(0));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '09';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('an indicator can still be added to TEXT (this batch does not touch it)', !msg && st.changes === before + 1);
}

// ===========================================================================
// Part 3 - the real generated designer, file-level raw editor
// ===========================================================================
const SRC = [
  buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
  buildLine({ seq: '00020', func: 'ERRSFL' }),
  buildLine({ seq: '00030', func: 'MSGLOC(24)' }),
  buildLine({ seq: '00040', sizeCondition: '*DS4', func: 'MSGLOC(27)' }),
  buildLine({ seq: '00050', func: "CA03(03 'Exit')" }),
  buildLine({ seq: '00060', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00070', name: 'F1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2' }),
].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce101', SRC, 'I101.DSPF').replace(
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
  // The file-level Properties view is opened from the "File" breadcrumb.
  const crumb = d.getElementById('crumb-file');
  if (crumb) crumb.dispatchEvent(new webDom.window.Event('click', { bubbles: true }));
  const parsed = DspfParser.parseDspf(SRC);
  const fk = parsed.fileKeywords || [];
  console.log('\nPart 3. real designer, file-level raw editor');
  check('setup: the file has 5 file-level keywords in source order', fk.length === 5 && fk.map((k) => k.name).join(',') === 'DSPSIZ,ERRSFL,MSGLOC,MSGLOC,CA03');
  const tog = (idx) => d.querySelector('.kw-cond-toggle[data-owner="file"][data-idx="' + idx + '"]');
  const rowText = (idx) => { const b = d.querySelector('.kw-remove[data-owner="file"][data-idx="' + idx + '"]'); return b ? b.closest('.kw-row').textContent : ''; };
  check('DSPSIZ chip: no Conditioning toggle, note shown', /DSPSIZ/.test(rowText(0)) && !tog(0) && /No option indicators/.test(rowText(0)));
  check('ERRSFL chip: no Conditioning toggle, note shown', /ERRSFL/.test(rowText(1)) && !tog(1) && /No option indicators/.test(rowText(1)));
  check('MSGLOC(24) chip: no Conditioning toggle, note shown', /MSGLOC/.test(rowText(2)) && !tog(2) && /No option indicators/.test(rowText(2)));
  check('the parsed MSGLOC(27) carries a display-size condition, not an option indicator', !!fk[3] && fk[3].conditions.length === 1 && !!fk[3].conditions[0].displaySizeCondition && indicatorsOf(fk[3]) === 0);
  check('MSGLOC(27) under *DS4 KEEPS its Conditioning toggle', !!tog(3));
  check('CA03 chip (unlisted) keeps its Conditioning toggle', /CA03/.test(rowText(4)) && !!tog(4));

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 500);

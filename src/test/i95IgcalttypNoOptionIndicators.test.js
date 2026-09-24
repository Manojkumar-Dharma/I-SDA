/**
 * i95IgcalttypNoOptionIndicators.test.js
 *
 * Task I-95 - follow-up from I-71. IGCALTTYP's DDS Reference section says
 * "Option indicators are not allowed with IGCALTTYP." I-30 made the General
 * row for it non-conditionable, but the raw keyword editor - shared by the
 * file, field, record and help-entry levels - draws a "Conditioning" toggle
 * on EVERY keyword chip whatever its name, so an indicator could still be put
 * on a raw-added IGCALTTYP, and a hand-written one carrying an indicator was
 * never flagged.
 *
 * Fix: a generic NO_OPTION_INDICATOR_KEYWORDS table in dspfWriter.js (no such
 * list existed - the per-row `conditionable` flags only cover the structured
 * panels), seeded with IGCALTTYP, and two functions over it:
 *   noOptionIndicatorsReason(name)             - is this keyword listed?
 *   noOptionIndicatorsNewConflictReason(name, oldConditions, newConditions)
 *                                              - diff-based: blocks only an
 *                                                edit that ADDS option
 *                                                indicators to a listed keyword.
 * The raw editor (keywordEditorHtml / wireKeywordEditor) uses them: a listed
 * keyword with no indicators gets no Conditioning toggle at all, a listed
 * keyword that already carries indicators (hand-written) keeps its toggle so
 * they can be removed and shows a warning, and adding an indicator to it is
 * refused with an alert. Removing indicators is always allowed, and
 * unlisted keywords are untouched.
 *
 * Part 1: pure unit checks. Part 2: the exported raw-editor helpers in a plain
 * jsdom document (same lightweight harness as i77 / i84). Part 3: the real
 * generated DSPF designer in jsdom, to prove the compiled webview carries it.
 * Run with: node src/test/i95IgcalttypNoOptionIndicators.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { kwd, newWebviewDom, webviewHtml, withAlertCapture } = require('./helpers/common');

// ===========================================================================
// Part 1 - pure unit checks
// ===========================================================================
console.log('\nDspfWriter.noOptionIndicatorsReason / noOptionIndicatorsNewConflictReason: unit checks');
check('noOptionIndicatorsReason is exported', typeof DspfWriter.noOptionIndicatorsReason === 'function');
check('noOptionIndicatorsNewConflictReason is exported', typeof DspfWriter.noOptionIndicatorsNewConflictReason === 'function');
{
  const list = DspfWriter.noOptionIndicatorsReason || (() => null);
  const diff = DspfWriter.noOptionIndicatorsNewConflictReason || (() => null);
  const grp = (...nums) => ({ indicators: nums.map((n) => ({ number: n, not: false })) });

  const r = list('IGCALTTYP') || '';
  check('IGCALTTYP is listed, and the reason names it and the DDS Reference', /IGCALTTYP/.test(r) && /Option indicators are not allowed/.test(r) && /DDS Reference/.test(r));
  check('lowercase name is normalised', !!list('igcalttyp'));
  ['DUP', 'COLOR', 'DSPATR', 'KEEP', 'IGCCNV', 'DFTVAL', 'PUTRETAIN', '', null, undefined].forEach((n) => {
    check('unlisted keyword ' + JSON.stringify(n) + ' is not listed', !list(n));
  });

  // adding indicators to a listed keyword
  check('adding a first indicator (no conditions -> [01]) is blocked', !!diff('IGCALTTYP', [], [grp('01')]));
  check('adding a second indicator to the same group ([01] -> [01 AND 02]) is blocked', !!diff('IGCALTTYP', [grp('01')], [grp('01', '02')]));
  check('adding a new OR group ([01] -> [01] OR [02]) is blocked', !!diff('IGCALTTYP', [grp('01')], [grp('01'), grp('02')]));
  check('adding a NOT indicator is blocked too', !!diff('IGCALTTYP', [], [{ indicators: [{ number: '01', not: true }] }]));
  check('the blocked reason names IGCALTTYP', /IGCALTTYP/.test(diff('IGCALTTYP', [], [grp('01')]) || ''));
  check('null/undefined old conditions count as none', !!diff('IGCALTTYP', null, [grp('01')]) && !!diff('IGCALTTYP', undefined, [grp('01')]));

  // removal / no change is always allowed
  check('removing the only indicator ([01] -> []) is allowed', diff('IGCALTTYP', [grp('01')], []) === null);
  check('removing one of two ANDed indicators is allowed', diff('IGCALTTYP', [grp('01', '02')], [grp('01')]) === null);
  check('removing one of two OR groups is allowed', diff('IGCALTTYP', [grp('01'), grp('02')], [grp('01')]) === null);
  check('no change ([01] -> [01]) is allowed (an already-invalid keyword is not re-reported)', diff('IGCALTTYP', [grp('01')], [grp('01')]) === null);
  check('no conditions before or after is allowed', diff('IGCALTTYP', [], []) === null && diff('IGCALTTYP', null, null) === null);

  // a display-size condition is not an option indicator
  check('a display-size condition group is not an option indicator (allowed)', diff('IGCALTTYP', [], [{ displaySizeCondition: { name: '*DS3', not: false } }]) === null);

  // unlisted keywords are never affected
  check('DUP: adding indicators is allowed', diff('DUP', [], [grp('01')]) === null && diff('DUP', [grp('01')], [grp('01', '02')]) === null);
  check('unknown keyword: adding indicators is allowed', diff('FOO', [], [grp('01')]) === null);
  check('null/undefined name is safe', diff(null, [], [grp('01')]) === null && diff(undefined, [], [grp('01')]) === null);
}

// ===========================================================================
// Part 2 - the exported raw-editor helpers, plain jsdom document
// ===========================================================================
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const G = (...nums) => ({ indicators: nums.map((n) => ({ number: n, not: false })) });

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
const click = (el) => el.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
const toggleOf = (idx) => document.querySelector('.kw-cond-toggle[data-owner="kwt"][data-idx="' + idx + '"]');
const rowOf = (idx) => { const t = document.querySelector('.kw-remove[data-owner="kwt"][data-idx="' + idx + '"]'); return t ? t.closest('.kw-row') : null; };
const indicatorsOf = (k) => (k.conditions || []).reduce((n, g) => n + ((g.indicators || []).length), 0);

console.log('\nraw keyword editor: IGCALTTYP with no indicators has no Conditioning toggle');
{
  const st = mount([kwd('IGCALTTYP'), kwd('DUP')]);
  check('setup: two chips rendered', !!rowOf(0) && !!rowOf(1));
  check('IGCALTTYP (chip 0) has NO Conditioning toggle', !toggleOf(0));
  check('IGCALTTYP shows a note saying no option indicators', !!rowOf(0) && /No option indicators/.test(rowOf(0).textContent));
  check('DUP (chip 1) still has its Conditioning toggle', !!toggleOf(1));
  check('DUP shows no such note', !!rowOf(1) && !/No option indicators/.test(rowOf(1).textContent));
  check('IGCALTTYP shows no warning when it carries no indicators', !document.querySelector('.kw-cond-warning'));
}

console.log('\nraw keyword editor: a hand-written IGCALTTYP that already carries an indicator');
{
  const st = mount([kwd('IGCALTTYP', '', [G('01')])]);
  check('the Conditioning toggle is kept so the indicator can be removed', !!toggleOf(0));
  check('the toggle shows the indicator count', !!toggleOf(0) && /\(1\)/.test(toggleOf(0).textContent));
  check('a warning is shown that option indicators are not allowed with IGCALTTYP', !!document.querySelector('.kw-cond-warning') && /Option indicators are not allowed with IGCALTTYP/.test(document.querySelector('.kw-cond-warning').textContent));
  click(toggleOf(0));
  check('clicking the toggle expands the conditions editor', !!document.querySelector('.cond-ind-add'));

  // adding another indicator is refused
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '02';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('adding indicator 02 is blocked with an alert naming IGCALTTYP', !!msg && /IGCALTTYP/.test(msg));
  check('no change was committed', st.changes === before && indicatorsOf(st.keywords[0]) === 1);

  // removing it is allowed and clears the toggle again
  const msg2 = withAlertCapture(() => click(document.querySelector('.cond-ind-remove')));
  check('removing the indicator fires no alert', !msg2);
  check('the indicator is gone from the keyword', indicatorsOf(st.keywords[0]) === 0);
  check('IGCALTTYP is still there', st.keywords.length === 1 && st.keywords[0].name === 'IGCALTTYP');
  check('with no indicators left the Conditioning toggle is gone again', !toggleOf(0));
  check('and the warning is gone', !document.querySelector('.kw-cond-warning'));
}

console.log('\nraw keyword editor: two hand-written indicators - removing one is allowed, adding is not');
{
  const st = mount([kwd('IGCALTTYP', '', [G('01', '02')])]);
  click(toggleOf(0));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '03';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('adding a third indicator is blocked', !!msg && st.changes === before && indicatorsOf(st.keywords[0]) === 2);
  const msg2 = withAlertCapture(() => click(document.querySelector('.cond-ind-remove')));
  check('removing one indicator is allowed with no alert', !msg2 && indicatorsOf(st.keywords[0]) === 1);
}

console.log('\nraw keyword editor: an unlisted keyword is unaffected');
{
  const st = mount([kwd('DUP', '', [G('01')])]);
  check('DUP with an indicator shows no warning', !document.querySelector('.kw-cond-warning'));
  click(toggleOf(0));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '02';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('adding an indicator to DUP commits with no alert', !msg && st.changes === before + 1 && indicatorsOf(st.keywords[0]) === 2);
}

console.log('\nraw keyword editor: adding and removing the IGCALTTYP keyword itself still works');
{
  const st = mount([]);
  document.getElementById('kwt-new-kw-name').value = 'IGCALTTYP';
  document.getElementById('kwt-new-kw-params').value = '';
  const msg = withAlertCapture(() => click(document.querySelector('.kw-add[data-owner="kwt"]')));
  check('+ Add keyword IGCALTTYP fires no alert', !msg);
  check('the keyword was added with no conditions', st.keywords.length === 1 && st.keywords[0].name === 'IGCALTTYP' && indicatorsOf(st.keywords[0]) === 0);
  check('the freshly added IGCALTTYP has no Conditioning toggle', !toggleOf(0));
  click(document.querySelector('.kw-remove[data-owner="kwt"][data-idx="0"]'));
  check('the remove button still removes it', st.keywords.length === 0);
}

// ===========================================================================
// Part 3 - the real generated DSPF designer in jsdom
// ===========================================================================
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2', func: 'IGCALTTYP' }),
  buildLine({ seq: '00030', name: 'F2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '2', func: 'DUP' }),
  buildLine({ seq: '00040', name: 'F3', length: '10', dataType: 'A', usage: 'B', line: '7', col: '2' }),
  buildLine({ seq: '00050', ind1: '01', func: 'IGCALTTYP' }),
].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I95.DSPF');
const errors = [];
const webDom = newWebviewDom(html, {
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
  function selectField(line) {
    const box = d.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    return true;
  }
  const tog = (line, idx) => d.querySelector('.kw-cond-toggle[data-owner="field-' + line + '"][data-idx="' + idx + '"]');
  const rowText = (line, idx) => { const b = d.querySelector('.kw-remove[data-owner="field-' + line + '"][data-idx="' + idx + '"]'); return b ? b.closest('.kw-row').textContent : ''; };

  console.log('\nreal designer: F1 (field IGCALTTYP, no indicators) - the raw editor offers no Conditioning toggle');
  if (selectField(2)) {
    check('the raw editor shows the IGCALTTYP chip', /IGCALTTYP/.test(rowText(2, 0)));
    check('it has NO Conditioning toggle', !tog(2, 0));
    check('it shows the "No option indicators" note', /No option indicators/.test(rowText(2, 0)));
  }
  console.log('\nreal designer: F2 (field DUP) - unchanged');
  if (selectField(3)) {
    check('the DUP chip still has its Conditioning toggle', !!tog(3, 0));
  }
  console.log('\nreal designer: F3 (hand-written IGCALTTYP conditioned by indicator 01)');
  if (selectField(4)) {
    const parsed = DspfParser.parseDspf(SRC).records[0].fields.find((f) => f.name === 'F3');
    const k = parsed && parsed.keywords.find((x) => x.name === 'IGCALTTYP');
    check('setup: the parsed IGCALTTYP carries an indicator', !!k && indicatorsOf(k) === 1);
    check('the toggle is kept and shows the count', !!tog(4, 0) && /\(1\)/.test(tog(4, 0).textContent));
    check('a warning is shown in the row', /Option indicators are not allowed with IGCALTTYP/.test(rowText(4, 0)));
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  if (failureCount()) process.exitCode = 1;
}, 500);

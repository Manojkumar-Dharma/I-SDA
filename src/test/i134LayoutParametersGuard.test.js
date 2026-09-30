/**
 * i134LayoutParametersGuard.test.js
 *
 * Task I-134 - opened from a deferred finding logged by I-133. The Choice
 * selection type and Push-button field panels refuse three invalid layout
 * combinations before writing (*NUMCOL with *NUMROW, a *GUTTER below 2, and -
 * SNGCHCFLD / MLTCHCFLD only - a *GUTTER with neither), but the raw keyword
 * editor and every other path through commitEdit checked none of them.
 * DspfWriter.layoutParametersNewConflictReason (diff-based) is now wired into
 * commitEdit's keywords block.
 *
 * A. pure functions: spec fact, layoutParameterProblems, the diff guard.
 * B. real webview (jsdom): the raw editor's add is blocked / allowed, and a
 *    hand-written field that is ALREADY invalid stays editable.
 *
 * Run with: node src/test/i134LayoutParametersGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, parameters) => [{ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] }];
const codes = (kw, p) => DspfWriter.layoutParameterProblems(kw, p).map((x) => x.code).join();

// ===========================================================================
console.log('\nA1. spec fact');
{
  check('SNGCHCFLD / MLTCHCFLD need *NUMCOL or *NUMROW for a gutter', KeywordSpec.gutterRequiresLayout('SNGCHCFLD') && KeywordSpec.gutterRequiresLayout('MLTCHCFLD'));
  check('PSHBTNFLD does not (its section says so)', !KeywordSpec.gutterRequiresLayout('PSHBTNFLD'));
  check('unknown / blank / null -> false', !KeywordSpec.gutterRequiresLayout('NOSUCH') && !KeywordSpec.gutterRequiresLayout('') && !KeywordSpec.gutterRequiresLayout(null));
}

console.log('\nA2. layoutParameterProblems');
{
  ['SNGCHCFLD', 'MLTCHCFLD', 'PSHBTNFLD'].forEach((kw) => {
    check(kw + ': no parameters -> fine', codes(kw, '') === '');
    check(kw + ': (*NUMCOL 3) alone -> fine', codes(kw, '(*NUMCOL 3)') === '');
    check(kw + ': (*NUMROW 2) (*GUTTER 2) -> fine', codes(kw, '(*NUMROW 2) (*GUTTER 2)') === '');
    check(kw + ': NUMCOL with NUMROW -> colsAndRows', codes(kw, '(*NUMCOL 2) (*NUMROW 3)') === 'colsAndRows');
    check(kw + ': gutter 1 with NUMCOL -> gutterMinimum', codes(kw, '(*NUMCOL 2) (*GUTTER 1)') === 'gutterMinimum');
    check(kw + ': gutter 0 with NUMCOL -> gutterMinimum', codes(kw, '(*NUMCOL 2) (*GUTTER 0)') === 'gutterMinimum');
    check(kw + ': legacy *NUMCOL(2) *NUMROW(3) shape is read too', codes(kw, '*NUMCOL(2) *NUMROW(3)') === 'colsAndRows');
    check(kw + ': flags around the layout do not matter', codes(kw, '*RSTCSR (*NUMCOL 2) *SLTIND') === '');
  });
  check('SNGCHCFLD: gutter 3 alone -> gutterNeedsLayout', codes('SNGCHCFLD', '(*GUTTER 3)') === 'gutterNeedsLayout');
  check('MLTCHCFLD: gutter 3 alone -> gutterNeedsLayout', codes('MLTCHCFLD', '(*GUTTER 3)') === 'gutterNeedsLayout');
  check('PSHBTNFLD: gutter 3 alone -> fine (unlike SNGCHCFLD)', codes('PSHBTNFLD', '(*GUTTER 3)') === '');
  check('SNGCHCFLD: gutter 1 alone reports both problems', codes('SNGCHCFLD', '(*GUTTER 1)') === 'gutterMinimum,gutterNeedsLayout');
  check('PSHBTNFLD: gutter 1 alone -> gutterMinimum only', codes('PSHBTNFLD', '(*GUTTER 1)') === 'gutterMinimum');
  check('every reason names the keyword and the DDS Reference', DspfWriter.layoutParameterProblems('MLTCHCFLD', '(*NUMCOL 2) (*NUMROW 3) (*GUTTER 1)').every((p) => /MLTCHCFLD/.test(p.reason) && /DDS Reference/.test(p.reason)));
  check('other keywords / blank / null are never checked', codes('DSPATR', '(*NUMCOL 2) (*NUMROW 3)') === '' && codes('', '(*GUTTER 1)') === '' && codes(null, '(*GUTTER 1)') === '');
}

console.log('\nA3. layoutParametersNewConflictReason (diff-based)');
{
  const g = DspfWriter.layoutParametersNewConflictReason;
  check('adding a bad PSHBTNFLD is reported', /not both/.test(g([], k('PSHBTNFLD', '(*NUMCOL 2) (*NUMROW 3)'))));
  check('adding a bad SNGCHCFLD gutter is reported', /at least 2/.test(g([], k('SNGCHCFLD', '(*NUMCOL 2) (*GUTTER 1)'))));
  check('adding a gutter with no layout to MLTCHCFLD is reported', /only be specified together/.test(g([], k('MLTCHCFLD', '(*GUTTER 3)'))));
  check('a valid keyword is not reported', g([], k('SNGCHCFLD', '(*NUMCOL 2) (*GUTTER 2)')) === null);
  check('a PSHBTNFLD gutter alone is not reported', g([], k('PSHBTNFLD', '(*GUTTER 3)')) === null);
  const bad = k('SNGCHCFLD', '(*GUTTER 3)');
  check('a problem already there is not re-reported on an unrelated edit', g(bad, k('SNGCHCFLD', '(*GUTTER 3) *RSTCSR')) === null);
  check('fixing it is never blocked', g(bad, k('SNGCHCFLD', '(*NUMCOL 2) (*GUTTER 3)')) === null);
  check('removing the keyword is never blocked', g(bad, []) === null);
  check('a NEW problem on an already-invalid keyword is still blocked', /at least 2/.test(g(bad, k('SNGCHCFLD', '(*GUTTER 1)')) || ''));
  check('the same problem on a second keyword type is not masked by the first', /PSHBTNFLD/.test(g(k('SNGCHCFLD', '(*GUTTER 3)'), k('SNGCHCFLD', '(*GUTTER 3)').concat(k('PSHBTNFLD', '(*NUMCOL 1) (*NUMROW 1)'))) || ''));
  check('no keywords / null lists are safe', g(null, null) === null && g(undefined, []) === null);
}

// ===========================================================================
// B. Real webview
// ===========================================================================
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '3', col: '2', func: "CHOICE(1 'One')" }),
  buildLine({ seq: '00030', name: 'F2', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '5', col: '2', func: 'PSHBTNFLD' }),
  buildLine({ seq: '00031', func: "PSHBTNCHC(1 'OK')" }),
  // F3: hand-written and ALREADY invalid - a gutter with no layout on SNGCHCFLD
  buildLine({ seq: '00040', name: 'F3', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '7', col: '2', func: 'SNGCHCFLD((*GUTTER 3))' }),
  buildLine({ seq: '00041', func: "CHOICE(1 'One')" }),
].join('\n') + '\n';

const reparsedField = (text, name) => {
  const out = [];
  DspfParser.parseDspf(text).records.forEach((r) => r.fields.forEach((f) => out.push(f)));
  return out.find((f) => f.name === name);
};
const kwParams = (f, name) => ((f && f.keywords.find((x) => x.name === name)) || {}).parameters;

const posted = [];
const errors = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I134.DSPF'), {
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
  const doc = dom.window.document;
  const { Event } = dom.window;
  const el = (id) => doc.getElementById(id);
  const selectField = (line) => {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    return true;
  };
  const act = (fn) => {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  };
  const rawAdd = (line, name, params) => act(() => {
    el('field-' + line + '-new-kw-name').value = name;
    const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  });
  const removeKw = (line, name) => act(() => {
    const chips = Array.from(doc.querySelectorAll('.kw-remove[data-owner="field-' + line + '"]'));
    const chip = chips.find((b) => new RegExp('^' + name).test(b.parentElement.textContent));
    if (chip) chip.dispatchEvent(new Event('click', { bubbles: true }));
    else errors.push(new Error('no ' + name + ' chip on line ' + line));
  });
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  console.log('\nB1. raw keyword editor, F1 (Y 2 B with a CHOICE): adding SNGCHCFLD');
  [['(*NUMCOL 2) (*NUMROW 3)', /not both/], ['(*NUMCOL 2) (*GUTTER 1)', /at least 2/], ['(*GUTTER 3)', /only be specified together/]].forEach(([params, re]) => {
    selectField(2);
    check('SNGCHCFLD(' + params + ') is blocked with an alert, no applyEdit', blocked(rawAdd(2, 'SNGCHCFLD', params), re));
  });

  console.log('\nB2. raw keyword editor, F2 (already PSHBTNFLD + a PSHBTNCHC): adding a second-instance is judged the same way');
  selectField(3);
  {
    const r = rawAdd(3, 'PSHBTNFLD', '(*NUMCOL 2) (*NUMROW 3)');
    console.log('  (alert: ' + r.alertMessage + ')');
    check('a bad PSHBTNFLD added by hand is blocked by THIS guard (its own wording), never written', blocked(r, /Specify either \*NUMCOL or \*NUMROW on PSHBTNFLD, not both/));
  }

  console.log('\nB3. F3 (hand-written, ALREADY has SNGCHCFLD((*GUTTER 3))): unrelated edits are not blocked, and it can be fixed');
  if (selectField(5)) {
    check('setup: the fixture parsed F3 with the gutter-only SNGCHCFLD', kwParams(reparsedField(SRC, 'F3'), 'SNGCHCFLD') === '(*GUTTER 3)');
    const r = rawAdd(5, 'TEXT', "'x'");
    check('adding an unrelated keyword is not blocked', allowed(r));
    check('  ...the existing gutter-only SNGCHCFLD is kept untouched', kwParams(r.applyEdit && reparsedField(r.applyEdit.text, 'F3'), 'SNGCHCFLD') === '(*GUTTER 3)');
  }
  selectField(5);
  {
    const r = removeKw(5, 'SNGCHCFLD');
    check('removing the invalid keyword is not blocked', allowed(r));
  }

  // Last on purpose: a successful add inserts a source line, shifting every
  // later field down by one.
  console.log('\nB4. raw keyword editor, F1: a valid SNGCHCFLD is not blocked');
  selectField(2);
  {
    const r = rawAdd(2, 'SNGCHCFLD', '(*NUMCOL 2) (*GUTTER 2)');
    check('a valid SNGCHCFLD(*NUMCOL 2, *GUTTER 2) is NOT blocked', allowed(r));
    check('  ...written as typed', kwParams(r.applyEdit && reparsedField(r.applyEdit.text, 'F1'), 'SNGCHCFLD') === '(*NUMCOL 2) (*GUTTER 2)');
  }

  check('no uncaught errors', errors.length === 0);
  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  setTimeout(() => process.exit(fails ? 1 : 0), 50);
}, 500);

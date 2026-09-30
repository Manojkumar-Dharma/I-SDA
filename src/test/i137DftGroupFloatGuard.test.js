/**
 * i137DftGroupFloatGuard.test.js
 *
 * Task I-137 - DFT / DFTVAL / EDTCDE / EDTWRD are barred on a floating-point
 * field (RECORD_TYPES entries, I-121 DFT/DFTVAL slice) but were only checked
 * when their own row was switched ON. dftGroupFloatNewConflictReason is the
 * diff-based guard for the other two ways in, wired at the Basic-tab Apply
 * handler and the commitEdit backstop:
 *   1. pure function: both directions per keyword, wording, already-invalid
 *      fields not re-reported, fix paths, non-F fields untouched.
 *   2. the real generated webview in jsdom: raw editor add to an F field and
 *      Basic-tab data type change to F while the field carries one.
 *
 * Fixture (source line = field order + 1):
 *  F1 (line 2): floating-point (F), no group keyword.
 *  F2..F5 (lines 3-6): character (A) field WITH DFT / DFTVAL / EDTCDE / EDTWRD.
 *  F6 (line 7): hand-written and ALREADY INVALID: floating-point WITH DFT.
 *
 * Run with: node src/test/i137DftGroupFloatGuard.test.js
 */
const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const kw = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const NAMES = ['DFT', 'DFTVAL', 'EDTCDE', 'EDTWRD'];

console.log('=== 1. dftGroupFloatNewConflictReason (pure) ===');
{
  const f = DspfWriter.dftGroupFloatNewConflictReason;
  NAMES.forEach((n) => {
    const add = f({ dataType: 'F', keywords: [] }, { keywords: [kw(n, '1')] });
    check('adding ' + n + ' to a float field is blocked and names it', !!add && add.indexOf(n + ' cannot be specified on a floating-point field') === 0);
    const chg = f({ dataType: 'A', keywords: [kw(n, '1')] }, { dataType: 'F' });
    check('changing to F while carrying ' + n + ' is blocked and names it', !!chg && /^The data type cannot be changed to F/.test(chg) && chg.indexOf('Remove ' + n + ' first.') > 0);
    check('an already-invalid F field with ' + n + ' is not re-reported', !f({ dataType: 'F', keywords: [kw(n, '1')] }, { length: 5 }));
    check(n + ' on a non-float field is never blocked', !f({ dataType: 'A', keywords: [] }, { keywords: [kw(n, '1')] }));
    check('fixing it by changing the type away from F is never blocked', !f({ dataType: 'F', keywords: [kw(n, '1')] }, { dataType: 'S' }));
    check('removing ' + n + ' from a float field is never blocked', !f({ dataType: 'F', keywords: [kw(n, '1')] }, { keywords: [] }));
  });
  check('a keyword outside the group (ALIAS) on a float field is not this guard\'s business', !f({ dataType: 'F', keywords: [] }, { keywords: [kw('ALIAS', 'X')] }));
  const two = f({ dataType: 'F', keywords: [] }, { keywords: [kw('EDTWRD', "' 0 '"), kw('DFTVAL', "'A'")] });
  check('two group keywords added at once: the first in group order (DFTVAL) is named', !!two && two.indexOf('DFTVAL') === 0);
  check('no old field tolerated', !f(null, { dataType: 'A', keywords: [kw('DFT', '1')] }));
  check('the guard covers exactly the spec-flagged group members', ['DFT', 'DFTVAL', 'EDTCDE', 'EDTWRD'].every((n) => require(path.join(__dirname, '../keywordSpec.js')).isNotAllowedOnFloatingPointField(n)));
}

console.log('=== 2. webview ===');
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '3', col: '2' }),
  buildLine({ seq: '00030', name: 'F2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '2', func: "DFT('X')" }),
  buildLine({ seq: '00040', name: 'F3', length: '10', dataType: 'A', usage: 'B', line: '7', col: '2', func: "DFTVAL('X')" }),
  buildLine({ seq: '00050', name: 'F4', length: '6', dataType: 'Y', decimals: '0', usage: 'B', line: '9', col: '2', func: 'EDTCDE(1)' }),
  buildLine({ seq: '00060', name: 'F5', length: '6', dataType: 'Y', decimals: '0', usage: 'B', line: '11', col: '2', func: "EDTWRD(' 0 ')" }),
  buildLine({ seq: '00070', name: 'F6', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '13', col: '2', func: "DFT('X')" }),
].join('\n') + '\n';
function reparsedField(text, name) {
  const out = [];
  DspfParser.parseDspf(text).records.forEach((r) => r.fields.forEach((x) => out.push(x)));
  return out.find((x) => x.name === name);
}
const kwNames = (x) => (x ? x.keywords.map((k) => k.name) : []);

const html = webviewHtml('vscode-webview://fake', 'testnonce137', SRC, 'I137.DSPF');
const posted = [];
const errors = [];
const dom = newWebviewDom(html, {
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
  const val = (id) => { const e = el(id); return e ? e.value : undefined; };
  function selectField(line) {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    return true;
  }
  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  function apply(values) {
    if (!el('p-apply')) return { alertMessage: null, applyEdit: undefined, missing: true };
    return act(() => {
      Object.keys(values).forEach((id) => { const e = el(id); if (e) e.value = values[id]; });
      el('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  function rawAdd(line, name, params) {
    return act(() => {
      el('field-' + line + '-new-kw-name').value = name;
      const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
      doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  console.log('\nF1 (floating-point, no group keyword): adding each is blocked via the raw editor');
  [['DFT', "'X'"], ['DFTVAL', "'X'"], ['EDTCDE', '1'], ['EDTWRD', "' 0 '"]].forEach(([name, params]) => {
    selectField(2);
    const r = rawAdd(2, name, params);
    check('raw keyword editor: adding ' + name + ' is blocked with an alert naming it, no applyEdit', blocked(r, new RegExp(name + ' cannot be specified on a floating-point field')));
  });
  selectField(2);
  {
    const r = rawAdd(2, 'ALIAS', 'X');
    check('raw keyword editor: an unrelated keyword (ALIAS) on the float field is NOT blocked', allowed(r));
  }

  [['F2', 3, 'DFT'], ['F3', 4, 'DFTVAL'], ['F4', 5, 'EDTCDE'], ['F5', 6, 'EDTWRD']].forEach(([fname, line, name]) => {
    console.log('\n' + fname + ' (WITH ' + name + '): changing its data type to F is blocked');
    if (selectField(line)) {
      const r = apply({ 'p-type': 'F', 'p-dec': '2', 'p-length': '8' });
      check('data type F blocked with an alert naming ' + name + ', no applyEdit', blocked(r, new RegExp(name)));
      check('the typed length is still in the form (an early return, no re-render wiped it)', val('p-length') === '8');
    }
    selectField(line);
    {
      const r = apply({ 'p-length': '11' });
      check('an unrelated edit (length only) commits with no alert', allowed(r));
      const f = r.applyEdit && reparsedField(r.applyEdit.text, fname);
      check('  ...' + name + ' kept', !!f && kwNames(f).includes(name));
    }
  });

  console.log('\nF6 (hand-written, ALREADY floating-point with DFT): unrelated edits are not blocked, and it can be fixed');
  selectField(7);
  {
    const r = apply({ 'p-length': '9' });
    check('an unrelated edit commits with no alert (not re-reported)', allowed(r));
  }
  selectField(7);
  {
    const r = apply({ 'p-type': 'S', 'p-dec': '0' });
    check('fixing it by changing the data type away from F commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F6');
    check('  ...data type S written, DFT kept', !!f && f.dataType === 'S' && kwNames(f).includes('DFT'));
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  setTimeout(() => process.exit(failureCount() === 0 ? 0 : 1), 50);
}, 500);

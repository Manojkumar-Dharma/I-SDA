/**
 * i138EdtDataTypeEligibility.test.js
 *
 * Task I-138 - EDTCDE ("valid only for fields with Y or blank in position
 * 35") and EDTWRD ("valid for numeric only fields (Y specified in position
 * 35)") were checked against F only (I-137). RECORD_TYPES.{EDTCDE,EDTWRD}
 * .allowedDataTypes = ['Y'] (a blank data type passes: the DDS default rules
 * turn blank + decimals + an editing keyword into Y) and two diff-based writer
 * guards enforce it: editKeywordDataTypeNewConflictReason (an edit that
 * introduces one, judged on the data type AFTER the edit) and
 * editKeywordDataTypeBasicEditConflictReason (a Basic-tab data type change on
 * a field already carrying one).
 *   1. spec facts and bridge.
 *   2. both pure guards.
 *   3. the real generated webview in jsdom.
 *
 * Fixture (source line = field order + 1):
 *  F1 (line 2): character (A), no edit keyword.
 *  F2 (line 3): numeric-only (Y) WITH EDTCDE.
 *  F3 (line 4): numeric-only (Y) WITH EDTWRD.
 *  F4 (line 5): blank data type + 2 decimals, no edit keyword.
 *  F5 (line 6): hand-written and ALREADY INVALID: character (A) WITH EDTCDE.
 *
 * Run with: node src/test/i138EdtDataTypeEligibility.test.js
 */
const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const kw = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const NAMES = ['EDTCDE', 'EDTWRD'];

console.log('=== 1. spec ===');
NAMES.forEach((n) => {
  check(n + ' allows exactly data type Y', JSON.stringify(KeywordSpec.allowedDataTypes(n)) === '["Y"]');
  check(n + ' still carries its float flag (I-121/I-137)', KeywordSpec.isNotAllowedOnFloatingPointField(n) === true);
  check(n + ': Y allowed, blank allowed, undefined allowed', ['Y', 'y', '', ' ', undefined].every((t) => DspfWriter.keywordAllowedDataTypeAllows(n, t)));
  check(n + ': every other display-file type refused', ['A', 'X', 'N', 'S', 'I', 'D', 'M', 'F', 'L', 'T', 'Z'].every((t) => !DspfWriter.keywordAllowedDataTypeAllows(n, t)));
});
check('a keyword with no allow-list is always allowed', DspfWriter.keywordAllowedDataTypeAllows('DFT', 'A') === true);

console.log('=== 2. pure guards ===');
{
  const add = DspfWriter.editKeywordDataTypeNewConflictReason;
  const basic = DspfWriter.editKeywordDataTypeBasicEditConflictReason;
  NAMES.forEach((n) => {
    const r = add([], [kw(n, '1')], { dataType: 'A' });
    check('introducing ' + n + ' on a character field is blocked and names it, wording', !!r && r.indexOf(n + ' can only be specified on a field with data type Y (or a blank data type), not A') === 0);
    check('introducing ' + n + ' on data type Y is allowed', !add([], [kw(n, '1')], { dataType: 'Y' }));
    check('introducing ' + n + ' on a blank data type is allowed', !add([], [kw(n, '1')], { dataType: '' }));
    check('an already-invalid field keeping ' + n + ' is not re-reported', !add([kw(n, '1')], [kw(n, '1'), kw('DUP')], { dataType: 'A' }));
    check('removing ' + n + ' is never blocked', !add([kw(n, '1')], [], { dataType: 'A' }));
    const b = basic([kw(n, '1')], { dataType: 'Y' }, { dataType: 'X' });
    check('changing a ' + n + ' field to X is blocked, "Remove ' + n + ' first."', !!b && b.indexOf('not X') > 0 && /Remove .* first\.$/.test(b) && b.indexOf('Remove ' + n + ' first.') > 0);
    check('changing a ' + n + ' field to blank / Y is allowed', !basic([kw(n, '1')], { dataType: 'A' }, { dataType: '' }) && !basic([kw(n, '1')], { dataType: 'A' }, { dataType: 'Y' }));
    check('an unrelated edit (no dataType key) on an invalid ' + n + ' field is allowed', !basic([kw(n, '1')], { dataType: 'A' }, { length: 4 }));
    check('re-submitting the unchanged data type is allowed', !basic([kw(n, '1')], { dataType: 'A' }, { dataType: 'A' }));
  });
  check('a field with neither keyword is never blocked on any type', !basic([kw('DUP')], { dataType: 'Y' }, { dataType: 'A' }) && !add([], [kw('DUP')], { dataType: 'A' }));
  const two = add([], [kw('EDTWRD', "' 0 '"), kw('EDTCDE', '1')], { dataType: 'A' });
  check('both introduced at once: the first in group order (EDTCDE) is named', !!two && two.indexOf('EDTCDE') === 0);
  check('no field kind is tolerated (blank)', !add([], [kw('EDTCDE', '1')], undefined));
}

console.log('=== 3. webview ===');
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2' }),
  buildLine({ seq: '00030', name: 'F2', length: '6', dataType: 'Y', decimals: '0', usage: 'B', line: '5', col: '2', func: 'EDTCDE(1)' }),
  buildLine({ seq: '00040', name: 'F3', length: '6', dataType: 'Y', decimals: '0', usage: 'B', line: '7', col: '2', func: "EDTWRD(' 0 ')" }),
  buildLine({ seq: '00050', name: 'F4', length: '6', decimals: '2', usage: 'B', line: '9', col: '2' }),
  buildLine({ seq: '00060', name: 'F5', length: '6', dataType: 'A', usage: 'B', line: '11', col: '2', func: 'EDTCDE(1)' }),
].join('\n') + '\n';
function reparsedField(text, name) {
  const out = [];
  DspfParser.parseDspf(text).records.forEach((r) => r.fields.forEach((x) => out.push(x)));
  return out.find((x) => x.name === name);
}
const kwNames = (x) => (x ? x.keywords.map((k) => k.name) : []);

const html = webviewHtml('vscode-webview://fake', 'testnonce138', SRC, 'I138.DSPF');
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

  console.log('\nF1 (character, usage B): raw-editor add');
  [['EDTCDE', '1'], ['EDTWRD', "' 0 '"]].forEach(([name, params]) => {
    selectField(2);
    const r = rawAdd(2, name, params);
    check('adding ' + name + ' to a character field is blocked with an alert naming it, no applyEdit', blocked(r, new RegExp(name + ' can only be specified on a field with data type Y')));
  });

  // Applied edits can shift the source lines BELOW the edited field, so the
  // fields are exercised bottom-up (F5, F4, F3, F2) after the blocked-only F1 block.
  console.log('\nF5 (hand-written, ALREADY character with EDTCDE): unrelated edits are not blocked, and it can be fixed');
  selectField(6);
  {
    const r = apply({ 'p-length': '8' });
    check('an unrelated edit commits with no alert (not re-reported)', allowed(r));
  }
  selectField(6);
  {
    const r = apply({ 'p-type': 'Y', 'p-dec': '0' });
    check('fixing it by changing the data type to Y commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F5');
    check('  ...data type Y written, EDTCDE kept', !!f && f.dataType === 'Y' && kwNames(f).includes('EDTCDE'));
  }

  console.log('\nF4 (blank data type + 2 decimals): raw-editor add is allowed');
  [['EDTCDE', '1'], ['EDTWRD', "' 0 . '"]].forEach(([name, params]) => {
    selectField(5);
    const r = rawAdd(5, name, params);
    check('adding ' + name + ' to a blank-type numeric field commits', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F4');
    check('  ...' + name + ' written', !!f && kwNames(f).includes(name));
  });

  [['F3', 4, 'EDTWRD'], ['F2', 3, 'EDTCDE']].forEach(([fname, line, name]) => {
    console.log('\n' + fname + ' (Y WITH ' + name + '): Basic-tab data type change');
    selectField(line);
    {
      const r = apply({ 'p-type': 'A', 'p-length': '9' });
      check('changing to A is blocked with an alert naming ' + name + ', no applyEdit', blocked(r, new RegExp(name + ' can only be specified on a field with data type Y')));
      check('the typed length is still in the form (early return, no re-render wiped it)', val('p-length') === '9');
    }
    selectField(line);
    {
      const r = apply({ 'p-length': '7' });
      check('an unrelated edit (length only) commits with no alert', allowed(r));
      const f = r.applyEdit && reparsedField(r.applyEdit.text, fname);
      check('  ...' + name + ' kept', !!f && kwNames(f).includes(name));
    }
    selectField(line);
    {
      const r = apply({ 'p-type': '', 'p-dec': '2' });
      check('changing to blank (with decimals) commits with no alert', allowed(r));
    }
  });

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  setTimeout(() => process.exit(failureCount() === 0 ? 0 : 1), 50);
}, 500);

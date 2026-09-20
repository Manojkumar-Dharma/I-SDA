/**
 * i72DupFloatingPointGuard.test.js
 *
 * Task I-72 - follow-up from I-30. DUP's DDS Reference section says: "You
 * cannot specify the DUP keyword on a floating-point field (F in position
 * 35)." Nothing in iSDA enforced it: the Input keywords panel shows the DUP
 * row for every field (it takes no data type, unlike the General rows I-39
 * gated with dtScope), the raw keyword editor accepted it, and the Basic tab
 * would happily change a DUP field's data type to F. Both directions:
 *   A. adding DUP to a field whose data type is F;
 *   B. changing the data type of a field that already carries DUP to F.
 * (DUP's validity-check wording - CHECK/COMP/RANGE/VALUES "can be specified
 * with the DUP keyword" but have no effect if the Dup key was pressed - is
 * NOT an exclusion, so nothing is blocked for it.)
 *
 * Fix: new DspfWriter.dupFloatNewConflictReason(oldField, updates), a
 * diff-based check called from commitEdit - the one choke point every
 * field-level write goes through (the Input keywords checkbox, the raw
 * keyword editor, the Basic tab) - and again from the Basic tab's Apply
 * handler as an early return so the panel keeps the user's other pending
 * edits (same split as I-61 / I-62). A field that was ALREADY floating-point
 * with DUP (hand-written) is not re-reported, so unrelated edits to it are
 * never blocked, and fixing it (removing DUP, or changing the data type) is
 * always allowed.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i72DupFloatingPointGuard.test.js
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

// === Group A: pure unit checks ===
console.log('\nDspfWriter.dupFloatNewConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.dupFloatNewConflictReason === 'function');
{
  const f = DspfWriter.dupFloatNewConflictReason || (() => null);
  const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
  const DUP = k('DUP');
  const TXT = k('TEXT', "'x'");
  const flt = { dataType: 'F', keywords: [] };
  const chr = { dataType: 'A', keywords: [] };
  const chrDup = { dataType: 'A', keywords: [DUP] };
  const fltDup = { dataType: 'F', keywords: [DUP] };

  // direction A: adding DUP
  const addOnFloat = f(flt, { keywords: [DUP] }) || '';
  check('A: adding DUP to a floating-point field is blocked', !!addOnFloat);
  check('A: reason names DUP and floating-point / F', /DUP/.test(addOnFloat) && /floating-point/.test(addOnFloat) && /\bF\b/.test(addOnFloat));
  ['A', 'S', 'P', 'B', 'L', 'T', 'Z', 'Y', 'X', 'N', ''].forEach((t) => {
    check('A: adding DUP to data type ' + JSON.stringify(t) + ' is allowed', f({ dataType: t, keywords: [] }, { keywords: [DUP] }) === null);
  });
  check('A: adding DUP with a parameter (response indicator text) to a float field is blocked', !!f(flt, { keywords: [k('DUP', "16 'FLDA was duped'")] }));

  // direction B: changing the data type to F while DUP is present
  const toFloat = f(chrDup, { dataType: 'F' }) || '';
  check('B: changing a DUP field to data type F is blocked', !!toFloat);
  check('B: reason names DUP and floating-point / F', /DUP/.test(toFloat) && /floating-point/.test(toFloat) && /\bF\b/.test(toFloat));
  check('the two directions give different messages', toFloat !== addOnFloat);
  check('B: changing a field WITHOUT DUP to data type F is allowed', f(chr, { dataType: 'F' }) === null);
  check('B: changing a DUP field to another non-float type is allowed', f(chrDup, { dataType: 'S' }) === null);

  // both at once
  check('adding DUP AND changing to F in the same edit is blocked', !!f(chr, { dataType: 'F', keywords: [DUP] }));
  check('removing DUP AND changing to F in the same edit is allowed', f(chrDup, { dataType: 'F', keywords: [] }) === null);
  check('changing to F while DUP stays in the keywords is blocked', !!f(chrDup, { dataType: 'F', keywords: [DUP] }));

  // untouched
  check('no DUP anywhere and no float -> never blocks', f(chr, { keywords: [TXT] }) === null && f(chr, {}) === null);
  check('a float field with other keywords added is allowed', f(flt, { keywords: [TXT] }) === null);
  check('unrelated edit (no data type, no keywords) on a DUP field is allowed', f(chrDup, { length: 9 }) === null);

  // diff-based: an already-invalid hand-written field
  check('pre-existing float + DUP, nothing changed -> not re-reported', f(fltDup, {}) === null);
  check('pre-existing float + DUP, values re-sent unchanged -> not re-reported', f(fltDup, { dataType: 'F', keywords: [DUP] }) === null);
  check('pre-existing float + DUP, an unrelated keyword added -> not re-reported', f(fltDup, { keywords: [DUP, TXT] }) === null);
  check('pre-existing float + DUP: removing DUP (the fix) is allowed', f(fltDup, { keywords: [] }) === null);
  check('pre-existing float + DUP: changing the data type (the other fix) is allowed', f(fltDup, { dataType: 'S' }) === null);

  check('lowercase data type is normalised', !!f({ dataType: 'a', keywords: [DUP] }, { dataType: 'f' }));
  check('null/undefined inputs are safe', f(null, null) === null && f(undefined, undefined) === null && f({}, {}) === null && f(null, { keywords: [DUP] }) === null);
}

// === DOM scenarios ===
// F1 (source line 2): floating-point field, no DUP.
// F2 (line 3): character field WITH DUP.
// F3 (line 4): hand-written and ALREADY INVALID: floating-point WITH DUP.
// F4 (line 5): plain character field.
// F5 (line 6): a second already-invalid float + DUP field (to test the type fix).
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '3', col: '2' }),
  buildLine({ seq: '00030', name: 'F2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '2', func: 'DUP' }),
  buildLine({ seq: '00040', name: 'F3', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '7', col: '2', func: 'DUP' }),
  buildLine({ seq: '00050', name: 'F4', length: '10', dataType: 'A', usage: 'B', line: '9', col: '2' }),
  buildLine({ seq: '00060', name: 'F5', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '11', col: '2', func: 'DUP' }),
].join('\n') + '\n';

function reparsedField(text, name) {
  const parsed = DspfParser.parseDspf(text);
  const out = [];
  parsed.records.forEach((r) => r.fields.forEach((f) => out.push(f)));
  return out.find((f) => f.name === name);
}
const kwNames = (f) => (f ? f.keywords.map((x) => x.name) : []);

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I72.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);
const posted = [];
const errors = [];
const dom = new JSDOM(html, {
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
  const doc = dom.window.document;
  const { Event } = dom.window;
  const el = (id) => doc.getElementById(id);
  const val = (id) => { const e = el(id); return e ? e.value : undefined; };

  // Select by SOURCE LINE (F1=2, F2=3, F3=4, F4=5, F5=6): against unfixed
  // code an edit can change a field's data type or hide it, so an
  // index-based lookup would shift.
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
  function tick(line, kw, on) {
    return act(() => {
      const c = el('field-' + line + '-inp-' + kw + '-on');
      c.checked = on;
      c.dispatchEvent(new Event('change', { bubbles: true }));
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
  const isChecked = (line, kw) => { const c = el('field-' + line + '-inp-' + kw + '-on'); return c ? c.checked : undefined; };

  // === Group B: F1 (float, no DUP) - direction A ===
  console.log('\nF1 (floating-point, no DUP): adding DUP is blocked');
  if (selectField(2)) {
    check('setup: the Input keywords DUP checkbox is shown and unchecked', isChecked(2, 'dup') === false);
    const r = tick(2, 'dup', true);
    check('ticking DUP blocked with an alert naming DUP and floating-point, no applyEdit', blocked(r, /DUP/) && /floating-point/.test(r.alertMessage || ''));
    check('  ...and the checkbox is put back to unchecked by the re-render', isChecked(2, 'dup') === false);
  }
  selectField(2);
  {
    const r = rawAdd(2, 'DUP', '');
    check('raw keyword editor: adding DUP blocked with an alert naming DUP, no applyEdit', blocked(r, /DUP/));
  }
  selectField(2);
  {
    const r = tick(2, 'blanks', true);
    check('an unrelated keyword (BLANKS) on the float field still commits', allowed(r));
  }

  // === Group C: F2 (character + DUP) - direction B via the Basic tab ===
  console.log('\nF2 (character field WITH DUP): changing its data type to F is blocked');
  if (selectField(3)) {
    check('setup: the DUP checkbox is checked and the data type is A', isChecked(3, 'dup') === true && val('p-type') === 'A');
    const r = apply({ 'p-type': 'F' });
    check('data type F blocked with an alert naming DUP and floating-point, no applyEdit', blocked(r, /DUP/) && /floating-point/.test(r.alertMessage || ''));
  }
  selectField(3);
  {
    const r = apply({ 'p-length': '12', 'p-type': 'F' });
    check('blocked (length edit + data type F)', blocked(r, /DUP/));
    check('the typed length is still in the form (an early return, no re-render wiped it)', val('p-length') === '12');
  }

  console.log('\nF2 (character field WITH DUP): other edits still commit');
  selectField(3);
  {
    const r = apply({ 'p-length': '12' });
    check('a length change commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('  ...length written and DUP kept', !!f && f.length === 12 && kwNames(f).includes('DUP'));
  }
  selectField(3);
  {
    const r = apply({ 'p-type': 'S', 'p-dec': '0' });
    check('data type A -> S commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('  ...data type S written and DUP kept', !!f && f.dataType === 'S' && kwNames(f).includes('DUP'));
  }

  // === Group D: F4 (plain character) - both directions on one field ===
  console.log('\nF4 (plain character field): the same field walked through both states');
  selectField(5);
  {
    const r = tick(5, 'dup', true);
    check('adding DUP to a character field commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F4');
    check('  ...DUP written', !!f && kwNames(f).includes('DUP'));
    const r2 = (selectField(5), apply({ 'p-type': 'F', 'p-dec': '2', 'p-length': '8' }));
    check('now that it carries DUP, changing it to data type F is blocked', blocked(r2, /DUP/));
    const r3 = (selectField(5), tick(5, 'dup', false));
    check('un-ticking DUP commits', allowed(r3));
    const r4 = (selectField(5), apply({ 'p-type': 'F', 'p-dec': '2', 'p-length': '8' }));
    check('with DUP gone, changing it to data type F commits', allowed(r4));
    const f4 = r4.applyEdit && reparsedField(r4.applyEdit.text, 'F4');
    check('  ...data type F written, no DUP', !!f4 && f4.dataType === 'F' && !kwNames(f4).includes('DUP'));
    const r5 = (selectField(5), tick(5, 'dup', true));
    check('and now that it is floating-point, adding DUP is blocked again', blocked(r5, /DUP/) && /floating-point/.test(r5.alertMessage || ''));
  }

  // === Group E: F3 / F5 hand-written and already invalid (float + DUP) ===
  console.log('\nF3 (hand-written, ALREADY floating-point with DUP): unrelated edits are not blocked');
  if (selectField(4)) {
    check('setup: the DUP checkbox is checked and the data type is F', isChecked(4, 'dup') === true && val('p-type') === 'F');
    const r = apply({ 'p-name': 'F3B' });
    check('a rename-only Apply is not blocked (nothing was changed to a bad value)', allowed(r));
  }
  selectField(4);
  {
    const r = apply({ 'p-length': '9' });
    check('a length-only Apply is not blocked either', allowed(r));
  }
  selectField(4);
  {
    const r = tick(4, 'blanks', true);
    check('adding an unrelated keyword (BLANKS) is not blocked', allowed(r));
  }
  selectField(4);
  {
    const r = tick(4, 'dup', false);
    check('fixing it by removing DUP commits', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F3B');
    check('  ...DUP gone, data type F kept', !!f && f.dataType === 'F' && !kwNames(f).includes('DUP'));
  }
  console.log('\nF5 (a second hand-written float + DUP field): changing the data type is the other fix');
  if (selectField(6)) {
    const r = apply({ 'p-type': 'S', 'p-dec': '0' });
    check('changing the data type F -> S commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F5');
    check('  ...data type S written and DUP kept', !!f && f.dataType === 'S' && kwNames(f).includes('DUP'));
  }

  check('no uncaught errors', errors.length === 0);
  if (errors.length) console.log('        first error:', String((errors[0] && errors[0].stack) || errors[0]).split('\n').slice(0, 4).join(' | '));
  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

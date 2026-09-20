/**
 * i82BlkfoldFloatingPointGuard.test.js
 *
 * Task I-82 - follow-up from I-39, closing the "belt and suspenders" half
 * of BLKFOLD's own DDS Reference restriction: "You cannot specify the
 * BLKFOLD keyword on a floating-point field (F in position 35)." I-39's
 * `dtScope` ('non-float') already keeps the General keywords row from
 * being OFFERED on a float field, so this only mattered for a field whose
 * data type is changed to F AFTER BLKFOLD is already set (the Basic tab),
 * or BLKFOLD typed directly into the raw keyword editor on an existing
 * float field. Both directions:
 *   A. adding BLKFOLD to a field whose data type is F;
 *   B. changing the data type of a field that already carries BLKFOLD to F.
 *
 * Fix: new DspfWriter.blkfoldFloatNewConflictReason(oldField, updates) -
 * same exact shape as I-72's dupFloatNewConflictReason (a diff-based check
 * called from commitEdit, the one choke point every field-level write goes
 * through, and again from the Basic tab's Apply handler as an early
 * return). A field that was ALREADY floating-point with BLKFOLD
 * (hand-written) is not re-reported, so unrelated edits to it are never
 * blocked, and fixing it (removing BLKFOLD, or changing the data type) is
 * always allowed.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i72DupFloatingPointGuard.test.js).
 * Run with: node src/test/i82BlkfoldFloatingPointGuard.test.js
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
console.log('\nDspfWriter.blkfoldFloatNewConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.blkfoldFloatNewConflictReason === 'function');
{
  const f = DspfWriter.blkfoldFloatNewConflictReason || (() => null);
  const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
  const BLKFOLD = k('BLKFOLD');
  const TXT = k('TEXT', "'x'");
  const flt = { dataType: 'F', keywords: [] };
  const chr = { dataType: 'A', keywords: [] };
  const chrBlkfold = { dataType: 'A', keywords: [BLKFOLD] };
  const fltBlkfold = { dataType: 'F', keywords: [BLKFOLD] };

  // direction A: adding BLKFOLD
  const addOnFloat = f(flt, { keywords: [BLKFOLD] }) || '';
  check('A: adding BLKFOLD to a floating-point field is blocked', !!addOnFloat);
  check('A: reason names BLKFOLD and floating-point / F', /BLKFOLD/.test(addOnFloat) && /floating-point/.test(addOnFloat) && /\bF\b/.test(addOnFloat));
  ['A', 'S', 'P', 'B', 'L', 'T', 'Z', 'Y', 'X', 'N', ''].forEach((t) => {
    check('A: adding BLKFOLD to data type ' + JSON.stringify(t) + ' is allowed', f({ dataType: t, keywords: [] }, { keywords: [BLKFOLD] }) === null);
  });

  // direction B: changing the data type to F while BLKFOLD is present
  const toFloat = f(chrBlkfold, { dataType: 'F' }) || '';
  check('B: changing a BLKFOLD field to data type F is blocked', !!toFloat);
  check('B: reason names BLKFOLD and floating-point / F', /BLKFOLD/.test(toFloat) && /floating-point/.test(toFloat) && /\bF\b/.test(toFloat));
  check('the two directions give different messages', toFloat !== addOnFloat);
  check('B: changing a field WITHOUT BLKFOLD to data type F is allowed', f(chr, { dataType: 'F' }) === null);
  check('B: changing a BLKFOLD field to another non-float type is allowed', f(chrBlkfold, { dataType: 'S' }) === null);

  // both at once
  check('adding BLKFOLD AND changing to F in the same edit is blocked', !!f(chr, { dataType: 'F', keywords: [BLKFOLD] }));
  check('removing BLKFOLD AND changing to F in the same edit is allowed', f(chrBlkfold, { dataType: 'F', keywords: [] }) === null);
  check('changing to F while BLKFOLD stays in the keywords is blocked', !!f(chrBlkfold, { dataType: 'F', keywords: [BLKFOLD] }));

  // untouched
  check('no BLKFOLD anywhere and no float -> never blocks', f(chr, { keywords: [TXT] }) === null && f(chr, {}) === null);
  check('a float field with other keywords added is allowed', f(flt, { keywords: [TXT] }) === null);
  check('unrelated edit (no data type, no keywords) on a BLKFOLD field is allowed', f(chrBlkfold, { length: 9 }) === null);

  // diff-based: an already-invalid hand-written field
  check('pre-existing float + BLKFOLD, nothing changed -> not re-reported', f(fltBlkfold, {}) === null);
  check('pre-existing float + BLKFOLD, values re-sent unchanged -> not re-reported', f(fltBlkfold, { dataType: 'F', keywords: [BLKFOLD] }) === null);
  check('pre-existing float + BLKFOLD, an unrelated keyword added -> not re-reported', f(fltBlkfold, { keywords: [BLKFOLD, TXT] }) === null);
  check('pre-existing float + BLKFOLD: removing BLKFOLD (the fix) is allowed', f(fltBlkfold, { keywords: [] }) === null);
  check('pre-existing float + BLKFOLD: changing the data type (the other fix) is allowed', f(fltBlkfold, { dataType: 'S' }) === null);

  check('lowercase data type is normalised', !!f({ dataType: 'a', keywords: [BLKFOLD] }, { dataType: 'f' }));
  check('null/undefined inputs are safe', f(null, null) === null && f(undefined, undefined) === null && f({}, {}) === null && f(null, { keywords: [BLKFOLD] }) === null);
}

// === DOM scenarios ===
// F1 (source line 2): floating-point field, no BLKFOLD.
// F2 (line 3): character field WITH BLKFOLD.
// F3 (line 4): hand-written and ALREADY INVALID: floating-point WITH BLKFOLD.
// F4 (line 5): plain character field.
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '3', col: '2' }),
  buildLine({ seq: '00030', name: 'F2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '2', func: 'BLKFOLD' }),
  buildLine({ seq: '00040', name: 'F3', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '7', col: '2', func: 'BLKFOLD' }),
  buildLine({ seq: '00050', name: 'F4', length: '10', dataType: 'A', usage: 'B', line: '9', col: '2' }),
].join('\n') + '\n';

function reparsedField(text, name) {
  const parsed = DspfParser.parseDspf(text);
  const out = [];
  parsed.records.forEach((r) => r.fields.forEach((f) => out.push(f)));
  return out.find((f) => f.name === name);
}
const kwNames = (f) => (f ? f.keywords.map((x) => x.name) : []);

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I82.DSPF').replace(
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

  // Select by SOURCE LINE (F1=2, F2=3, F3=4, F4=5): against unfixed code
  // an edit can change a field's data type, so an index-based lookup
  // would shift.
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
  // BLKFOLD is a General keywords row (dtScope-gated), not an Input
  // keywords row like DUP - its checkbox id uses the '-gen-' segment
  // (see GENERAL_FIELD_KEYWORD_ROWS / generalFieldKeywordsHtml's own
  // 'field-' + line + '-gen-' + key convention).
  function tickGen(line, key, on) {
    return act(() => {
      const c = el('field-' + line + '-gen-' + key + '-on');
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
  const isChecked = (line, key) => { const c = el('field-' + line + '-gen-' + key + '-on'); return c ? c.checked : undefined; };

  // === Group B: F1 (float, no BLKFOLD) - direction A ===
  console.log('\nF1 (floating-point, no BLKFOLD): the General row is not even offered (I-39 dtScope), so the guard is exercised via the raw editor instead');
  selectField(2);
  check('setup: the General keywords BLKFOLD row is hidden on a float field (I-39)', el('field-2-gen-blkfold-on') === null);
  {
    const r = rawAdd(2, 'BLKFOLD', '');
    check('raw keyword editor: adding BLKFOLD blocked with an alert naming BLKFOLD and floating-point, no applyEdit', blocked(r, /BLKFOLD/) && /floating-point/.test(r.alertMessage || ''));
  }
  selectField(2);
  {
    const r = tickGen(2, 'noccsid', true);
    check('an unrelated General row (NOCCSID) on the float field still commits', allowed(r));
  }

  // === Group C: F2 (character + BLKFOLD) - direction B via the Basic tab ===
  console.log('\nF2 (character field WITH BLKFOLD): changing its data type to F is blocked');
  if (selectField(3)) {
    check('setup: the BLKFOLD row is checked and the data type is A', isChecked(3, 'blkfold') === true && val('p-type') === 'A');
    const r = apply({ 'p-type': 'F' });
    check('data type F blocked with an alert naming BLKFOLD and floating-point, no applyEdit', blocked(r, /BLKFOLD/) && /floating-point/.test(r.alertMessage || ''));
  }
  selectField(3);
  {
    const r = apply({ 'p-length': '12', 'p-type': 'F' });
    check('blocked (length edit + data type F)', blocked(r, /BLKFOLD/));
    check('the typed length is still in the form (an early return, no re-render wiped it)', val('p-length') === '12');
  }

  console.log('\nF2 (character field WITH BLKFOLD): other edits still commit');
  selectField(3);
  {
    const r = apply({ 'p-length': '12' });
    check('a length change commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('  ...length written and BLKFOLD kept', !!f && f.length === 12 && kwNames(f).includes('BLKFOLD'));
  }
  selectField(3);
  {
    const r = apply({ 'p-type': 'S', 'p-dec': '0' });
    check('data type A -> S commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('  ...data type S written and BLKFOLD kept', !!f && f.dataType === 'S' && kwNames(f).includes('BLKFOLD'));
  }

  // === Group D: F4 (plain character) - both directions on one field ===
  console.log('\nF4 (plain character field): the same field walked through both states');
  selectField(5);
  {
    const r = tickGen(5, 'blkfold', true);
    check('adding BLKFOLD to a character field commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F4');
    check('  ...BLKFOLD written', !!f && kwNames(f).includes('BLKFOLD'));
    const r2 = (selectField(5), apply({ 'p-type': 'F', 'p-dec': '2', 'p-length': '8' }));
    check('now that it carries BLKFOLD, changing it to data type F is blocked', blocked(r2, /BLKFOLD/));
    const r3 = (selectField(5), tickGen(5, 'blkfold', false));
    check('un-ticking BLKFOLD commits', allowed(r3));
    const r4 = (selectField(5), apply({ 'p-type': 'F', 'p-dec': '2', 'p-length': '8' }));
    check('with BLKFOLD gone, changing it to data type F commits', allowed(r4));
    const f4 = r4.applyEdit && reparsedField(r4.applyEdit.text, 'F4');
    check('  ...data type F written, no BLKFOLD', !!f4 && f4.dataType === 'F' && !kwNames(f4).includes('BLKFOLD'));
    check('  ...and the General row for BLKFOLD is now hidden on the canvas (I-39 dtScope, no regression)', (selectField(5), el('field-5-gen-blkfold-on') === null));
  }

  // === Group E: F3 hand-written and already invalid (float + BLKFOLD) ===
  console.log('\nF3 (hand-written, ALREADY floating-point with BLKFOLD): unrelated edits are not blocked');
  if (selectField(4)) {
    check('setup: data type is F (the row itself is hidden per I-39, but the raw keyword is still there)', val('p-type') === 'F');
    const r = apply({ 'p-length': '10' });
    check('an unrelated length edit still commits (not re-reported)', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F3');
    check('  ...length written and BLKFOLD (hand-written) kept', !!f && f.length === 10 && kwNames(f).includes('BLKFOLD'));
  }
  selectField(4);
  {
    const r = apply({ 'p-type': 'S', 'p-dec': '0' });
    check('fixing it by changing the data type away from F is allowed', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F3');
    check('  ...data type S written, BLKFOLD kept', !!f && f.dataType === 'S' && kwNames(f).includes('BLKFOLD'));
  }

  check('no uncaught errors', errors.length === 0);
  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

/**
 * i79SflchcctlStructuralRules.test.js
 *
 * Task I-79 - follow-up from I-39. SFLCHCCTL's own DDS Reference section
 * says the control field: "must be the first field defined in the subfile
 * record", "must have a length of 1, data type of Y, decimal positions of
 * zero, and have a usage of H", and "Only one SFLCHCCTL keyword can be used
 * in one subfile record." I-39 added the keyword itself with hint text
 * only; none of the three rules were hard-blocked.
 *
 * Fix (same split I-57/I-62 used for PSHBTNFLD):
 *   - field-shape (length/type/decimals/usage) is silently rewritten to the
 *     required 1/Y/0/H shape when the checkbox is turned ON
 *     (DspfWriter.sflchcctlDefinitionUpdates), and guarded against being
 *     broken afterward via the Basic tab's Apply
 *     (DspfWriter.sflchcctlBasicEditConflictReason);
 *   - first-field and one-per-record are structural facts about the record
 *     this edit cannot silently fix, so turning the checkbox ON is BLOCKED
 *     when either is violated (DspfWriter.sflchcctlFieldConflictReason).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i79SflchcctlStructuralRules.test.js
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
console.log('\nDspfWriter.sflchcctlDefinitionUpdates: direct unit checks');
check('function is exported', typeof DspfWriter.sflchcctlDefinitionUpdates === 'function');
{
  const f = DspfWriter.sflchcctlDefinitionUpdates;
  check('already-correct shape (Y/1/0/H) needs no updates', f({ dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' }) === null);
  check('wrong data type is corrected', f({ dataType: 'A', length: 1, decimalPositions: 0, usage: 'H' }).dataType === 'Y');
  check('wrong length is corrected', f({ dataType: 'Y', length: 4, decimalPositions: 0, usage: 'H' }).length === 1);
  check('wrong decimals is corrected', f({ dataType: 'Y', length: 1, decimalPositions: 2, usage: 'H' }).decimalPositions === 0);
  check('null decimals is corrected', f({ dataType: 'Y', length: 1, decimalPositions: null, usage: 'H' }).decimalPositions === 0);
  check('wrong usage is corrected', f({ dataType: 'Y', length: 1, decimalPositions: 0, usage: 'O' }).usage === 'H');
  check('everything wrong: all four corrected', (() => {
    const u = f({ dataType: 'A', length: 4, decimalPositions: 2, usage: 'O' });
    return u.dataType === 'Y' && u.length === 1 && u.decimalPositions === 0 && u.usage === 'H';
  })());
  check('lowercase data type/usage still recognized as correct', f({ dataType: 'y', length: 1, decimalPositions: 0, usage: 'h' }) === null);
  check('null/undefined field is treated as fully wrong', (() => {
    const u = f(null);
    return u.dataType === 'Y' && u.length === 1 && u.decimalPositions === 0 && u.usage === 'H';
  })());
}

console.log('\nDspfWriter.sflchcctlFieldConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.sflchcctlFieldConflictReason === 'function');
{
  const f = DspfWriter.sflchcctlFieldConflictReason;
  const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
  check('not the first field -> blocked, names "first field"', /first field/.test(f(false, [])));
  check('first field, no sibling has it -> allowed (empty string)', f(true, []) === '');
  check('first field, a sibling already has SFLCHCCTL -> blocked, names "one"', /Only one SFLCHCCTL/.test(f(true, [[k('SFLCHCCTL')]])));
  check('first field, siblings with unrelated keywords only -> allowed', f(true, [[k('TEXT')], [k('SFLROLVAL')]]) === '');
  check('not first field takes priority over sibling check (message says first field)', /first field/.test(f(false, [[k('SFLCHCCTL')]])));
  check('null/undefined siblings are safe', f(true, null) === '' && f(true, undefined) === '');
}

console.log('\nDspfWriter.sflchcctlBasicEditConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.sflchcctlBasicEditConflictReason === 'function');
{
  const f = DspfWriter.sflchcctlBasicEditConflictReason;
  const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
  const CHCCTL = [k('SFLCHCCTL')];
  const shapedField = { dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' };
  check('no SFLCHCCTL on the field -> never blocks, whatever the edit', f([], shapedField, { dataType: 'A' }) === null);
  check('SFLCHCCTL present, changing an unrelated property (name) is allowed', f(CHCCTL, shapedField, { name: 'NEWNAME' }) === null);
  check('SFLCHCCTL present, no updates at all is allowed', f(CHCCTL, shapedField, {}) === null);
  check('changing data type away from Y is blocked', /data type A \(must be Y\)/.test(f(CHCCTL, shapedField, { dataType: 'A' }) || ''));
  check('changing length away from 1 is blocked', /length 4 \(must be 1\)/.test(f(CHCCTL, shapedField, { length: 4 }) || ''));
  check('changing decimals away from 0 is blocked', /decimal positions 2 \(must be 0\)/.test(f(CHCCTL, shapedField, { decimalPositions: 2 }) || ''));
  check('changing usage away from H is blocked', /usage O \(must be H\)/.test(f(CHCCTL, shapedField, { usage: 'O' }) || ''));
  check('setting data type to Y explicitly (no-op) is allowed', f(CHCCTL, shapedField, { dataType: 'Y' }) === null);
  check('changing multiple properties away from shape reports all of them', (() => {
    const r = f(CHCCTL, shapedField, { dataType: 'A', length: 4, decimalPositions: 2, usage: 'O' }) || '';
    return /data type A/.test(r) && /length 4/.test(r) && /decimal positions 2/.test(r) && /usage O/.test(r);
  })());
  check('a hand-written already-invalid field (usage O) is not re-reported when an unrelated property changes', f(CHCCTL, { dataType: 'Y', length: 1, decimalPositions: 0, usage: 'O' }, { name: 'X' }) === null);
  check('a hand-written already-invalid field: changing the SAME already-wrong property to another wrong value IS blocked (does not fix it)', /usage I \(must be H\)/.test(f(CHCCTL, { dataType: 'Y', length: 1, decimalPositions: 0, usage: 'O' }, { usage: 'I' }) || ''));
  check('a hand-written already-invalid field: fixing the property is allowed', f(CHCCTL, { dataType: 'Y', length: 1, decimalPositions: 0, usage: 'O' }, { usage: 'H' }) === null);
  check('blank length is treated as null and reported as blank', /length blank \(must be 1\)/.test(f(CHCCTL, shapedField, { length: '' }) || ''));
}

// === DOM scenarios ===
// Visible fields (usage O) get a line/col so they render on the canvas as
// clickable .dspf-field elements. Per the DDS Reference ("You cannot
// specify a location for hidden ... fields") a usage-H field has NO
// location and is selected instead via the record props panel's own
// "Hidden fields" tab list (see buildWebviewTemplate.js's own
// hiddenFieldsSectionHtml/wireHiddenFieldsSection comments) - FC (already
// H) and FE (hand-written H) both go through that path.
const visibleFld = (seq, n, len, dt, dec, usage, col) => buildLine({ seq: seq, name: n, length: len, dataType: dt, decimals: dec, usage: usage, line: '5', col: col });
const hiddenFld = (seq, n, len, dt, dec, usage, func) => buildLine({ seq: seq, name: n, length: len, dataType: dt, decimals: dec, usage: usage, func: func });
// DTLA: FA is the first field (wrong shape: 4A, usage O), FB is second (normal field).
// DTLC: FC is the first field, already correctly shaped (1Y 0H), no SFLCHCCTL yet.
// DTLD: FD is the first field (normal), FE is second and hand-written with SFLCHCCTL already
//       (an already-invalid record, used only to exercise the "already elsewhere" branch).
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'DTLA', func: 'SFL' }),
  visibleFld('00020', 'FA', '4', 'A', '', 'O', '2'),
  visibleFld('00030', 'FB', '4', 'A', '', 'O', '10'),
  buildLine({ seq: '00040', nameType: 'R', name: 'CTLA', func: 'SFLCTL(DTLA)' }),

  buildLine({ seq: '00050', nameType: 'R', name: 'DTLC', func: 'SFL' }),
  hiddenFld('00060', 'FC', '1', 'Y', '0', 'H', ''),
  buildLine({ seq: '00070', nameType: 'R', name: 'CTLC', func: 'SFLCTL(DTLC)' }),

  buildLine({ seq: '00080', nameType: 'R', name: 'DTLD', func: 'SFL' }),
  visibleFld('00090', 'FD', '4', 'A', '', 'O', '2'),
  hiddenFld('00100', 'FE', '1', 'Y', '0', 'H', 'SFLCHCCTL'),
  buildLine({ seq: '00110', nameType: 'R', name: 'CTLD', func: 'SFLCTL(DTLD)' }),
].join('\n') + '\n';

function fieldByName(text, recName, fieldName) {
  const r = DspfParser.parseDspf(text).records.find((x) => x.name === recName);
  return r ? r.fields.find((f) => f.name === fieldName) : null;
}
function fieldKeywordNames(text, recName, fieldName) {
  const f = fieldByName(text, recName, fieldName);
  return f ? f.keywords.map((k) => k.name) : null;
}

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I79.DSPF').replace(
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

  function selectRecord(name) {
    const sel = doc.getElementById('recordSelect');
    sel.value = name;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Visible (usage O) fields render as a clickable .dspf-field[data-field]
  // on the canvas. Clicking one calls setSingleSelection + render(), which
  // brings up that field's own props panel (see buildWebviewTemplate.js's
  // .dspf-field click handler).
  function selectVisibleField(recName, fieldName) {
    selectRecord(recName);
    const marker = doc.querySelector('.dspf-field[data-field="' + fieldName + '"]');
    if (marker) marker.dispatchEvent(new Event('click', { bubbles: true }));
  }
  // Hidden (usage H) fields have no on-screen position (per the DDS
  // Reference) and are selected via the record props panel's own "Hidden
  // fields" tab list instead - see hiddenFieldsSectionHtml/
  // wireHiddenFieldsSection's own comments in buildWebviewTemplate.js. The
  // row is present in the DOM (just not the active tab panel), so it can
  // be clicked directly without switching tabs first.
  function selectHiddenField(recName, sourceLine) {
    selectRecord(recName);
    const row = doc.querySelector('.field-order-row[data-source-line="' + sourceLine + '"]');
    if (row) row.dispatchEvent(new Event('click', { bubbles: true }));
  }
  const el = (id) => doc.getElementById(id);
  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  function setChcctl(fieldSourceLine, on) {
    return act(() => {
      const c = el('field-' + fieldSourceLine + '-sflchcctl');
      c.checked = on;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  // === Group B: DTLA - first field (FA) vs second field (FB) ===
  console.log('\nDTLA: FA is the first field, FB is the second');
  const fa = fieldByName(SRC, 'DTLA', 'FA');
  const fb = fieldByName(SRC, 'DTLA', 'FB');
  selectVisibleField('DTLA', 'FB');
  check('setup: FB is selected and its checkbox is unchecked', !!el('field-' + fb.sourceLine + '-sflchcctl') && el('field-' + fb.sourceLine + '-sflchcctl').checked === false);

  {
    const r = setChcctl(fb.sourceLine, true);
    check('turning SFLCHCCTL on for the SECOND field (FB) is blocked, alert names "first field"', blocked(r, /first field/i));
    check('  ...and the checkbox is reverted by the re-render', el('field-' + fb.sourceLine + '-sflchcctl').checked === false);
  }

  selectVisibleField('DTLA', 'FA');
  {
    const r = setChcctl(fa.sourceLine, true);
    check('turning SFLCHCCTL on for the FIRST field (FA) is allowed, no alert', allowed(r));
    const names = r.applyEdit && fieldKeywordNames(r.applyEdit.text, 'DTLA', 'FA');
    check('  ...SFLCHCCTL is written', !!names && names.includes('SFLCHCCTL'));
    const updated = r.applyEdit && fieldByName(r.applyEdit.text, 'DTLA', 'FA');
    check('  ...and FA\'s own shape was silently rewritten to length 1 / type Y / 0 decimals / usage H (was 4A O)',
      !!updated && Number(updated.length) === 1 && updated.dataType === 'Y' && Number(updated.decimalPositions) === 0 && updated.usage === 'H');
  }

  // === Group C: DTLC - already-correct shape, turn on ===
  console.log('\nDTLC: FC already has the correct 1Y0H shape (hidden field, selected via the Hidden fields tab)');
  const fc = fieldByName(SRC, 'DTLC', 'FC');
  selectHiddenField('DTLC', fc.sourceLine);
  {
    const r = setChcctl(fc.sourceLine, true);
    check('turning SFLCHCCTL on for the (already correctly shaped) first field is allowed', allowed(r));
    const updated = r.applyEdit && fieldByName(r.applyEdit.text, 'DTLC', 'FC');
    check('  ...shape is unchanged (still 1Y0H)', !!updated && Number(updated.length) === 1 && updated.dataType === 'Y' && Number(updated.decimalPositions) === 0 && updated.usage === 'H');
  }

  console.log('\nDspfWriter.sflchcctlBasicEditConflictReason is wired to the Basic tab Apply (via the pure function above) - confirmed by unit checks in Group A.');

  // === Group D: DTLD - "already elsewhere" (one-per-record) ===
  console.log('\nDTLD: FE (second field) is hand-written with SFLCHCCTL already; turning it on for FD (the first field) hits the one-per-record guard');
  const fd = fieldByName(SRC, 'DTLD', 'FD');
  selectVisibleField('DTLD', 'FD');
  {
    const r = setChcctl(fd.sourceLine, true);
    check('blocked, alert names "Only one SFLCHCCTL"', blocked(r, /Only one SFLCHCCTL/));
    check('  ...and the checkbox is reverted', el('field-' + fd.sourceLine + '-sflchcctl').checked === false);
  }

  check('no uncaught errors', errors.length === 0);
  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

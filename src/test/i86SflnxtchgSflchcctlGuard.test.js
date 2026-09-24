/**
 * i86SflnxtchgSflchcctlGuard.test.js
 *
 * Task I-86 - SFLCHCCTL's own DDS Reference section adds a fourth rule
 * beyond the field-shape/first-field/one-per-record trio I-79 closed:
 * "SFLNXTCHC keyword cannot be specified in a record that contains a
 * field with the SFLCHCCTL keyword." ("SFLNXTCHC" is read as SFLNXTCHG -
 * the DDS Reference spells it SFLNXTCHG 15 other times in the same
 * document, including its own section header a few hundred lines later;
 * this one occurrence is a single dropped letter, not a second keyword.)
 *
 * SFLNXTCHG is itself record-level, on the subfile (SFL) record. Two
 * directions, guarded at three call sites:
 *   - Turning SFLCHCCTL ON on a field is blocked if the owning record
 *     already has SFLNXTCHG (DspfWriter.sflchcctlFieldConflictReason's own
 *     recordKeywords check, extended by this task).
 *   - Turning SFLNXTCHG ON is blocked if any field in the record already
 *     has SFLCHCCTL - on the plain SFL record's own panel
 *     (DspfWriter.sflNxtchgSflchcctlConflictReason, wired into
 *     wireSflKeywordsPanels), AND on the SFLCTL record's own panel, which
 *     needs to resolve the LINKED subfile record via SFLCTL(name) first
 *     (DspfWriter.sflctlNxtchgSflchcctlConflictReason, wired into
 *     wireSflCtlPanels) since SFLCHCCTL never lives on the control
 *     record's own fields.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i79SflchcctlStructuralRules.test.js).
 * Run with: node src/test/i86SflnxtchgSflchcctlGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// === Group A: pure unit checks ===
console.log('\nDspfWriter.sflNxtchgSflchcctlConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.sflNxtchgSflchcctlConflictReason === 'function');
{
  const f = DspfWriter.sflNxtchgSflchcctlConflictReason;
  const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
  check('no field has SFLCHCCTL -> allowed (empty string)', f([]) === '');
  check('no field has SFLCHCCTL (unrelated keywords only) -> allowed', f([[k('TEXT')], [k('SFLROLVAL')]]) === '');
  check('a field has SFLCHCCTL -> blocked, names SFLNXTCHG', /SFLNXTCHG cannot be added/.test(f([[k('SFLCHCCTL')]])));
  check('null/undefined fieldsKeywords is safe', f(null) === '' && f(undefined) === '');
}

console.log('\nDspfWriter.sflchcctlFieldConflictReason: I-86\'s own recordKeywords extension');
{
  const f = DspfWriter.sflchcctlFieldConflictReason;
  const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
  check('first field, no siblings, no SFLNXTCHG on the record -> allowed', f(true, [], []) === '');
  check('first field, record already has SFLNXTCHG -> blocked, names SFLNXTCHG', /SFLNXTCHG/.test(f(true, [], [k('SFLNXTCHG')])));
  check('first field, record has unrelated keywords only -> allowed', f(true, [], [k('TEXT'), k('SFL')]) === '');
  check('not-first-field takes priority over the SFLNXTCHG check (message says first field)', /first field/.test(f(false, [], [k('SFLNXTCHG')])));
  check('one-per-record takes priority over the SFLNXTCHG check (message says "Only one")', /Only one SFLCHCCTL/.test(f(true, [[k('SFLCHCCTL')]], [k('SFLNXTCHG')])));
  check('missing recordKeywords (old 2-arg call site) is safe - no SFLNXTCHG check applied', f(true, []) === '');
}

console.log('\nDspfWriter.sflctlNxtchgSflchcctlConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.sflctlNxtchgSflchcctlConflictReason === 'function');
{
  const f = DspfWriter.sflctlNxtchgSflchcctlConflictReason;
  const k = (name, params) => ({ name: name, parameters: params || '', conditions: [], raw: '', sourceLines: [] });
  const fld = (kws) => ({ name: 'F', keywords: kws });
  const records = [
    { name: 'DTLX', fields: [fld([k('SFLCHCCTL')]), fld([])] },
    { name: 'DTLY', fields: [fld([]), fld([])] },
  ];
  check('SFLCTL points at a record with no SFLCHCCTL field -> allowed', f([k('SFLCTL', 'DTLY')], records) === '');
  check('SFLCTL points at a record WITH an SFLCHCCTL field -> blocked', /SFLNXTCHG cannot be added/.test(f([k('SFLCTL', 'DTLX')], records)));
  check('no SFLCTL keyword at all -> allowed (nothing to resolve)', f([], records) === '');
  check('SFLCTL points at a record not found in the list -> allowed (nothing to check against)', f([k('SFLCTL', 'NOPE')], records) === '');
  check('combined-record case: SFLCTL naming its OWN record resolves back to itself', /SFLNXTCHG cannot be added/.test(f([k('SFLCTL', 'DTLX'), k('SFLCHCCTL')], [{ name: 'DTLX', fields: [fld([k('SFLCHCCTL')])] }])));
}

// === DOM scenarios ===
const visibleFld = (seq, n, len, dt, dec, usage, col) => buildLine({ seq: seq, name: n, length: len, dataType: dt, decimals: dec, usage: usage, line: '5', col: col });
// DTLA / CTLA: plain SFL+SFLCTL pair, FA has no SFLCHCCTL yet - SFLNXTCHG
//   should be freely toggleable from either panel.
// DTLB / CTLB: FB is hand-written WITH SFLCHCCTL - turning SFLNXTCHG on
//   from either the SFL panel (DTLB) or the SFLCTL panel (CTLB, which has
//   to resolve DTLB via SFLCTL(DTLB) first) must be blocked.
// DTLC / CTLC: SFLNXTCHG is hand-written on the record already - turning
//   SFLCHCCTL on for FC (the first field) must be blocked (reverse
//   direction).
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'DTLA', func: 'SFL' }),
  visibleFld('00020', 'FA', '4', 'A', '', 'O', '2'),
  buildLine({ seq: '00030', nameType: 'R', name: 'CTLA', func: 'SFLCTL(DTLA)' }),
  buildLine({ seq: '00040', name: '', func: 'SFLSIZ(10)' }),
  buildLine({ seq: '00050', name: '', func: 'SFLPAG(10)' }),

  buildLine({ seq: '00060', nameType: 'R', name: 'DTLB', func: 'SFL' }),
  buildLine({ seq: '00070', name: 'FB', length: '1', dataType: 'Y', decimals: '0', usage: 'H', func: 'SFLCHCCTL' }),
  buildLine({ seq: '00080', nameType: 'R', name: 'CTLB', func: 'SFLCTL(DTLB)' }),
  buildLine({ seq: '00090', name: '', func: 'SFLSIZ(10)' }),
  buildLine({ seq: '00100', name: '', func: 'SFLPAG(10)' }),

  buildLine({ seq: '00110', nameType: 'R', name: 'DTLC', func: 'SFL SFLNXTCHG' }),
  visibleFld('00120', 'FC', '4', 'A', '', 'O', '2'),
  buildLine({ seq: '00130', nameType: 'R', name: 'CTLC', func: 'SFLCTL(DTLC)' }),
  buildLine({ seq: '00140', name: '', func: 'SFLSIZ(10)' }),
  buildLine({ seq: '00150', name: '', func: 'SFLPAG(10)' }),
].join('\n') + '\n';

function fieldByName(text, recName, fieldName) {
  const r = DspfParser.parseDspf(text).records.find((x) => x.name === recName);
  return r ? r.fields.find((f) => f.name === fieldName) : null;
}
function recordKeywordNames(text, recName) {
  const r = DspfParser.parseDspf(text).records.find((x) => x.name === recName);
  return r ? r.keywords.map((k) => k.name) : null;
}

// Sanity-check the fixture itself parses the way this test assumes before
// wiring up jsdom - cheap to verify and saves a confusing failure trail if
// the SFL/SFLNXTCHG-on-one-line syntax above doesn't parse as expected.
check('fixture sanity: DTLC record itself carries SFL and SFLNXTCHG', (() => {
  const names = recordKeywordNames(SRC, 'DTLC');
  return !!names && names.includes('SFL') && names.includes('SFLNXTCHG');
})());
check('fixture sanity: DTLB\'s FB field carries SFLCHCCTL', (() => {
  const f = fieldByName(SRC, 'DTLB', 'FB');
  return !!f && f.keywords.some((k) => k.name === 'SFLCHCCTL');
})());

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I86.DSPF');
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

  function selectRecord(name) {
    const sel = doc.getElementById('recordSelect');
    sel.value = name;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function selectVisibleField(recName, fieldName) {
    selectRecord(recName);
    const marker = doc.querySelector('.dspf-field[data-field="' + fieldName + '"]');
    if (marker) marker.dispatchEvent(new Event('click', { bubbles: true }));
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
  function toggleCheckbox(id, on) {
    return act(() => {
      const c = el(id);
      c.checked = on;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  // === Group B: DTLA/CTLA - no SFLCHCCTL anywhere, SFLNXTCHG freely toggleable ===
  console.log('\nDTLA/CTLA: no field has SFLCHCCTL - SFLNXTCHG is freely toggleable from either panel');
  selectRecord('DTLA');
  {
    const r = toggleCheckbox('sfl-DTLA-sflnxtchg-on', true);
    check('SFL panel: turning SFLNXTCHG on is allowed, no alert', allowed(r));
    check('  ...SFLNXTCHG actually written to DTLA', !!r.applyEdit && (recordKeywordNames(r.applyEdit.text, 'DTLA') || []).includes('SFLNXTCHG'));
  }
  selectRecord('CTLA');
  {
    const r = toggleCheckbox('sflctl-CTLA-sflnxtchg-on', true);
    check('SFLCTL panel: turning SFLNXTCHG on is allowed, no alert', allowed(r));
    check('  ...SFLNXTCHG actually written to CTLA', !!r.applyEdit && (recordKeywordNames(r.applyEdit.text, 'CTLA') || []).includes('SFLNXTCHG'));
  }

  // === Group C: DTLB/CTLB - FB has SFLCHCCTL, SFLNXTCHG blocked both ways ===
  console.log('\nDTLB/CTLB: FB carries SFLCHCCTL - turning SFLNXTCHG on is blocked from BOTH panels');
  selectRecord('DTLB');
  {
    const r = toggleCheckbox('sfl-DTLB-sflnxtchg-on', true);
    check('SFL panel: blocked, alert names SFLCHCCTL', blocked(r, /SFLCHCCTL/));
    check('  ...checkbox reverted', el('sfl-DTLB-sflnxtchg-on').checked === false);
  }
  selectRecord('CTLB');
  {
    const r = toggleCheckbox('sflctl-CTLB-sflnxtchg-on', true);
    check('SFLCTL panel: blocked too (resolves the LINKED record DTLB via SFLCTL(DTLB)), alert names SFLCHCCTL', blocked(r, /SFLCHCCTL/));
    check('  ...checkbox reverted', el('sflctl-CTLB-sflnxtchg-on').checked === false);
  }

  // === Group D: DTLC - SFLNXTCHG already present, SFLCHCCTL blocked (reverse direction) ===
  console.log('\nDTLC: SFLNXTCHG already present on the record - turning SFLCHCCTL on for the first field is blocked (reverse direction)');
  // Earlier groups' ALLOWED edits (Group B) actually mutate this same
  // webview's live in-memory model (needed for its own instant re-render),
  // which can shift every later record's source line numbers - so the
  // checkbox is found by its live DOM id here rather than by a source
  // line computed from a static parse of the original, pre-edit fixture.
  selectVisibleField('DTLC', 'FC');
  const chcctlEl = doc.querySelector('[id$="-sflchcctl"]');
  check('setup: DTLC/FC\'s SFLCHCCTL checkbox is present and unchecked', !!chcctlEl && chcctlEl.checked === false);
  {
    const r = toggleCheckbox(chcctlEl.id, true);
    check('blocked, alert names SFLNXTCHG', blocked(r, /SFLNXTCHG/));
    check('  ...checkbox reverted', doc.querySelector('[id$="-sflchcctl"]').checked === false);
  }

  check('no uncaught errors', errors.length === 0);
  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

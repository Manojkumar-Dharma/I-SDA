/**
 * i81SflrtnselRequiresChoiceList.test.js
 *
 * Task I-81 - follow-up from I-39. SFLRTNSEL's DDS Reference section says:
 * "If this keyword is specified then SFLMLTCHC or SFLSNGCHC must be
 * specified." I-39 added SFLRTNSEL on the SFLCTL record with only a HINT
 * when neither is selected; nothing hard-blocked it, in either direction:
 *   A. adding SFLRTNSEL to a record that has neither SFLSNGCHC nor SFLMLTCHC;
 *   B. removing the LAST of SFLSNGCHC / SFLMLTCHC while SFLRTNSEL is present.
 *
 * Fix: new DspfWriter.sflrtnselNewConflictReason(oldKeywords, newKeywords),
 * a diff-based backstop called from commitRecordEdit - ONE choke point for
 * every record-level path (the SFLCTL panel's SFLRTNSEL checkbox, its type
 * selector, and the raw keyword editor, whose Remove has no guard hook of
 * its own), the same shape as I-58's / I-64's field-level backstops in
 * commitEdit. Conflicts already present before an edit (a hand-written
 * file that was already invalid) are not re-reported, so unrelated edits to
 * such a record are never blocked. On a block the panel is re-rendered from
 * the model, which puts the checkbox / selector back.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i81SflrtnselRequiresChoiceList.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// === Group A: pure unit checks ===
console.log('\nDspfWriter.sflrtnselNewConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.sflrtnselNewConflictReason === 'function');
{
  const f = DspfWriter.sflrtnselNewConflictReason || (() => null);
  const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
  const SNG = k('SFLSNGCHC');
  const MLT = k('SFLMLTCHC');
  const RTN = k('SFLRTNSEL');
  const CTL = k('SFLCTL', 'DTL');
  const TXT = k('TEXT', "'x'");

  // direction A: adding SFLRTNSEL
  const addNone = f([CTL], [CTL, RTN]) || '';
  check('A: adding SFLRTNSEL with neither choice keyword is blocked', !!addNone);
  check('A: reason names SFLRTNSEL and both SFLSNGCHC and SFLMLTCHC', /SFLRTNSEL/.test(addNone) && /SFLSNGCHC/.test(addNone) && /SFLMLTCHC/.test(addNone));
  check('A: adding SFLRTNSEL to an empty keyword list is blocked', !!f([], [RTN]));
  check('A: adding SFLRTNSEL when SFLSNGCHC is present is allowed', f([CTL, SNG], [CTL, SNG, RTN]) === null);
  check('A: adding SFLRTNSEL when SFLMLTCHC is present is allowed', f([CTL, MLT], [CTL, MLT, RTN]) === null);
  check('A: adding SFLRTNSEL and SFLSNGCHC in the same edit is allowed', f([CTL], [CTL, SNG, RTN]) === null);
  check('A: adding SFLRTNSEL and SFLMLTCHC in the same edit is allowed', f([CTL], [CTL, RTN, MLT]) === null);

  // direction B: removing the last choice keyword while SFLRTNSEL stays
  const rmSng = f([CTL, SNG, RTN], [CTL, RTN]) || '';
  check('B: removing SFLSNGCHC while SFLRTNSEL stays is blocked', !!rmSng);
  check('B: reason names SFLRTNSEL and says remove', /SFLRTNSEL/.test(rmSng) && /remov/i.test(rmSng));
  check('B: removing SFLMLTCHC while SFLRTNSEL stays is blocked', !!f([CTL, MLT, RTN], [CTL, RTN]));
  check('B: removing SFLSNGCHC when SFLMLTCHC also present (one remains) is allowed', f([CTL, SNG, MLT, RTN], [CTL, MLT, RTN]) === null);
  check('B: switching SFLSNGCHC -> SFLMLTCHC with SFLRTNSEL kept is allowed', f([CTL, SNG, RTN], [CTL, MLT, RTN]) === null);
  check('B: switching SFLMLTCHC -> SFLSNGCHC with SFLRTNSEL kept is allowed', f([CTL, MLT, RTN], [CTL, SNG, RTN]) === null);
  check('B: removing SFLRTNSEL AND the choice keyword together is allowed', f([CTL, SNG, RTN], [CTL]) === null);
  check('B: removing SFLRTNSEL alone is allowed', f([CTL, SNG, RTN], [CTL, SNG]) === null);
  check('the two directions give different messages', addNone !== rmSng);

  // neither keyword involved
  check('no SFLRTNSEL before or after -> never blocks', f([CTL, SNG], [CTL]) === null && f([CTL], [CTL, TXT]) === null && f([], []) === null);
  check('removing a choice keyword when SFLRTNSEL was never there is allowed', f([CTL, MLT], [CTL]) === null);
  check('unrelated edit on a valid record is allowed', f([CTL, SNG, RTN], [CTL, SNG, RTN, TXT]) === null);

  // diff-based: an already-invalid hand-written record
  check('pre-existing SFLRTNSEL without a choice keyword, unchanged -> not re-reported', f([CTL, RTN], [CTL, RTN]) === null);
  check('pre-existing invalid record + an unrelated keyword added -> not re-reported', f([CTL, RTN], [CTL, RTN, TXT]) === null);
  check('pre-existing invalid record: fixing it by adding SFLSNGCHC is allowed', f([CTL, RTN], [CTL, RTN, SNG]) === null);
  check('pre-existing invalid record: fixing it by removing SFLRTNSEL is allowed', f([CTL, RTN], [CTL]) === null);

  check('parameters and conditions on the keywords do not matter', f([CTL, k('SFLSNGCHC', '*RSTCSR'), RTN], [CTL, RTN]) !== null);
  check('null/undefined inputs are safe', f(null, null) === null && f(undefined, undefined) === null && f(null, [RTN]) !== null && f([RTN], null) === null);
}

// === DOM scenarios ===
const fld = (seq, n) => buildLine({ seq, name: n, length: '4', dataType: 'A', usage: 'O', line: '5', col: '2' });
// CTLA: valid (SFLSNGCHC + SFLRTNSEL).  CTLB: neither keyword.
// CTLC: SFLMLTCHC only.  CTLD: hand-written and ALREADY invalid (SFLRTNSEL only).
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'DTLA', func: 'SFL' }), fld('00020', 'FA'),
  buildLine({ seq: '00030', nameType: 'R', name: 'CTLA', func: 'SFLCTL(DTLA)' }),
  buildLine({ seq: '00040', func: 'SFLSNGCHC' }),
  buildLine({ seq: '00050', func: 'SFLRTNSEL' }),
  buildLine({ seq: '00060', nameType: 'R', name: 'DTLB', func: 'SFL' }), fld('00070', 'FB'),
  buildLine({ seq: '00080', nameType: 'R', name: 'CTLB', func: 'SFLCTL(DTLB)' }),
  buildLine({ seq: '00090', nameType: 'R', name: 'DTLC', func: 'SFL' }), fld('00100', 'FC'),
  buildLine({ seq: '00110', nameType: 'R', name: 'CTLC', func: 'SFLCTL(DTLC)' }),
  buildLine({ seq: '00120', func: 'SFLMLTCHC' }),
  buildLine({ seq: '00130', nameType: 'R', name: 'DTLD', func: 'SFL' }), fld('00140', 'FD'),
  buildLine({ seq: '00150', nameType: 'R', name: 'CTLD', func: 'SFLCTL(DTLD)' }),
  buildLine({ seq: '00160', func: 'SFLRTNSEL' }),
].join('\n') + '\n';

function recordKeywordNames(text, recName) {
  const r = DspfParser.parseDspf(text).records.find((x) => x.name === recName);
  return r ? r.keywords.map((k) => k.name) : null;
}

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I81.DSPF');
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
  const el = (id) => doc.getElementById(id);
  // run an action, capturing an alert and the applyEdit it posted
  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  function setType(rec, value) {
    return act(() => { const s = el('sflctl-' + rec + '-selchc-type'); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  function setRtnsel(rec, on) {
    return act(() => { const c = el('sflctl-' + rec + '-sflrtnsel'); c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  function rawAdd(rec, name, params) {
    return act(() => {
      el('record-' + rec + '-new-kw-name').value = name;
      el('record-' + rec + '-new-kw-params').value = params || '';
      doc.querySelector('.kw-add[data-owner="record-' + rec + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  // raw-editor chip of a keyword, found by its position among the record's keywords
  function rawRemove(rec, idx) {
    return act(() => {
      const b = doc.querySelector('.kw-remove[data-owner="record-' + rec + '"][data-idx="' + idx + '"]');
      if (b) b.dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  // === Group B: CTLA (valid: SFLSNGCHC + SFLRTNSEL) - direction B ===
  console.log('\nCTLA (SFLSNGCHC + SFLRTNSEL): removing the last choice keyword is blocked');
  selectRecord('CTLA');
  check('setup: selector shows SFLSNGCHC and SFLRTNSEL checkbox is checked',
    !!el('sflctl-CTLA-selchc-type') && el('sflctl-CTLA-selchc-type').value === 'SFLSNGCHC' && el('sflctl-CTLA-sflrtnsel').checked === true);
  {
    const r = setType('CTLA', '');
    check('type selector -> (none) blocked with an alert naming SFLRTNSEL, no applyEdit', blocked(r, /SFLRTNSEL/));
    check('  ...and the selector is put back to SFLSNGCHC by the re-render', !!el('sflctl-CTLA-selchc-type') && el('sflctl-CTLA-selchc-type').value === 'SFLSNGCHC');
  }
  selectRecord('CTLA');
  {
    const r = rawRemove('CTLA', 1); // chips: 0 SFLCTL, 1 SFLSNGCHC, 2 SFLRTNSEL
    check('raw editor: removing SFLSNGCHC blocked with an alert naming SFLRTNSEL, no applyEdit', blocked(r, /SFLRTNSEL/));
  }

  console.log('\nCTLA: allowed edits still commit');
  selectRecord('CTLA');
  {
    const r = setType('CTLA', 'SFLMLTCHC');
    check('switching SFLSNGCHC -> SFLMLTCHC commits with no alert', allowed(r));
    const names = r.applyEdit && recordKeywordNames(r.applyEdit.text, 'CTLA');
    check('  ...SFLMLTCHC written, SFLSNGCHC gone, SFLRTNSEL kept', !!names && names.includes('SFLMLTCHC') && !names.includes('SFLSNGCHC') && names.includes('SFLRTNSEL'));
  }
  selectRecord('CTLA');
  {
    const r = setRtnsel('CTLA', false);
    check('turning SFLRTNSEL off commits with no alert', allowed(r));
    const names = r.applyEdit && recordKeywordNames(r.applyEdit.text, 'CTLA');
    check('  ...SFLRTNSEL gone, the choice keyword kept', !!names && !names.includes('SFLRTNSEL') && names.includes('SFLMLTCHC'));
  }
  selectRecord('CTLA');
  {
    const r = setType('CTLA', '');
    check('with SFLRTNSEL off, choosing (none) is now allowed', allowed(r));
    const names = r.applyEdit && recordKeywordNames(r.applyEdit.text, 'CTLA');
    check('  ...neither keyword remains', !!names && !names.includes('SFLMLTCHC') && !names.includes('SFLSNGCHC') && !names.includes('SFLRTNSEL'));
  }

  // === Group C: CTLB (neither keyword) - direction A ===
  console.log('\nCTLB (neither keyword): adding SFLRTNSEL is blocked');
  selectRecord('CTLB');
  {
    const panel = el('sflctl-CTLB-selchc-type') && el('sflctl-CTLB-selchc-type').parentNode;
    check('hint tells the user to choose a type first', !!panel && /SFLRTNSEL requires SFLSNGCHC or SFLMLTCHC - choose one above first/.test(panel.textContent));
  }
  {
    const r = setRtnsel('CTLB', true);
    check('checking the SFLRTNSEL box blocked with an alert naming SFLSNGCHC and SFLMLTCHC, no applyEdit', blocked(r, /SFLRTNSEL/) && /SFLSNGCHC/.test(r.alertMessage || '') && /SFLMLTCHC/.test(r.alertMessage || ''));
    check('  ...and the checkbox is put back to unchecked by the re-render', !!el('sflctl-CTLB-sflrtnsel') && el('sflctl-CTLB-sflrtnsel').checked === false);
  }
  selectRecord('CTLB');
  {
    const r = rawAdd('CTLB', 'SFLRTNSEL', '');
    check('raw editor: adding SFLRTNSEL blocked with an alert naming SFLRTNSEL, no applyEdit', blocked(r, /SFLRTNSEL/));
  }

  console.log('\nCTLB: the right order works');
  selectRecord('CTLB');
  {
    const r = setType('CTLB', 'SFLMLTCHC');
    check('choosing SFLMLTCHC first commits with no alert', allowed(r));
  }
  selectRecord('CTLB');
  {
    const r = setRtnsel('CTLB', true);
    check('then checking SFLRTNSEL commits with no alert', allowed(r));
    const names = r.applyEdit && recordKeywordNames(r.applyEdit.text, 'CTLB');
    check('  ...both SFLMLTCHC and SFLRTNSEL written', !!names && names.includes('SFLMLTCHC') && names.includes('SFLRTNSEL'));
  }

  // === Group D: CTLC (SFLMLTCHC only) ===
  console.log('\nCTLC (SFLMLTCHC only): adding SFLRTNSEL is allowed straight away');
  selectRecord('CTLC');
  {
    const r = setRtnsel('CTLC', true);
    check('checking SFLRTNSEL commits with no alert', allowed(r));
  }
  selectRecord('CTLC');
  {
    const r = rawAdd('CTLC', 'TEXT', "'note'");
    check('an unrelated raw-editor add (TEXT) still commits', allowed(r));
  }

  // === Group E: CTLD (hand-written, ALREADY invalid: SFLRTNSEL only) ===
  console.log('\nCTLD (hand-written, already invalid: SFLRTNSEL without a choice keyword): unrelated edits are not blocked');
  selectRecord('CTLD');
  {
    {
      const panel = el('sflctl-CTLD-selchc-type') && el('sflctl-CTLD-selchc-type').parentNode;
      check('hint flags the hand-written record as invalid DDS', !!panel && /invalid DDS/.test(panel.textContent));
    }
    check('setup: selector shows (none) and SFLRTNSEL is checked', !!el('sflctl-CTLD-selchc-type') && el('sflctl-CTLD-selchc-type').value === '' && el('sflctl-CTLD-sflrtnsel').checked === true);
    const r = rawAdd('CTLD', 'TEXT', "'note'");
    check('an unrelated raw-editor add (TEXT) commits, the pre-existing conflict is not re-reported', allowed(r));
  }
  selectRecord('CTLD');
  {
    const r = setType('CTLD', 'SFLSNGCHC');
    check('fixing it by choosing SFLSNGCHC commits', allowed(r));
    const names = r.applyEdit && recordKeywordNames(r.applyEdit.text, 'CTLD');
    check('  ...SFLSNGCHC and SFLRTNSEL both present', !!names && names.includes('SFLSNGCHC') && names.includes('SFLRTNSEL'));
  }

  check('no uncaught errors', errors.length === 0);
  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

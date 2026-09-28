/**
 * i128SflChoiceListReverseGuard.test.js
 *
 * Task I-128 - deferred finding from I-121's SFLSNGCHC/SFLMLTCHC slice.
 * SFLMLTCHC's and SFLSNGCHC's own DDS Reference sections say SFLDROP,
 * SFLFOLD and the other choice keyword "cannot be specified on a record
 * with" them. I-26's sflChoiceListConflictReason only runs when the choice
 * keyword is being turned ON; adding SFLDROP / SFLFOLD (or the other choice
 * keyword) to a record that ALREADY carries SFLSNGCHC / SFLMLTCHC - through
 * the SFLCTL panel's SFLDROP / SFLFOLD rows or the raw keyword editor - was
 * unblocked anywhere.
 *
 * Fix: new DspfWriter.sflChoiceListNewConflictReason(oldKeywords,
 * newKeywords), a diff-based backstop called from commitRecordEdit (the
 * same choke point and shape as I-81's sflrtnselNewConflictReason), reading
 * the partner lists from KeywordSpec.mutexKeywords so the forward and
 * reverse directions cannot disagree. Compared PER PAIR: an already-invalid
 * hand-written record is not re-reported on an unrelated edit, removing
 * either side of an existing pair is always allowed, but introducing a NEW
 * bad pair is still blocked.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i128SflChoiceListReverseGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// === Group A: pure unit checks ===
console.log('\nDspfWriter.sflChoiceListNewConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.sflChoiceListNewConflictReason === 'function');
{
  const f = DspfWriter.sflChoiceListNewConflictReason || (() => null);
  const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
  const CTL = k('SFLCTL', 'DTL');
  const SNG = k('SFLSNGCHC'), MLT = k('SFLMLTCHC');
  const DRP = k('SFLDROP', 'CA05'), FLD = k('SFLFOLD', 'CA06'), PAG = k('SFLPAG', '5');
  const msg = (added, other) => added + ' cannot be specified on the same record as ' + other + ' (mutually exclusive per the DDS Reference).';

  // the reverse direction this task closes
  check('adding SFLDROP to a SFLSNGCHC record is blocked, naming the added keyword first',
    f([CTL, SNG], [CTL, SNG, DRP]) === msg('SFLDROP', 'SFLSNGCHC'));
  check('adding SFLFOLD to a SFLSNGCHC record is blocked', f([CTL, SNG], [CTL, SNG, FLD]) === msg('SFLFOLD', 'SFLSNGCHC'));
  check('adding SFLDROP to a SFLMLTCHC record is blocked', f([CTL, MLT], [CTL, MLT, DRP]) === msg('SFLDROP', 'SFLMLTCHC'));
  check('adding SFLFOLD to a SFLMLTCHC record is blocked', f([CTL, MLT], [CTL, MLT, FLD]) === msg('SFLFOLD', 'SFLMLTCHC'));
  check('adding SFLMLTCHC to a SFLSNGCHC record is blocked', f([CTL, SNG], [CTL, SNG, MLT]) === msg('SFLMLTCHC', 'SFLSNGCHC'));
  check('adding SFLSNGCHC to a SFLMLTCHC record is blocked', f([CTL, MLT], [CTL, MLT, SNG]) === msg('SFLSNGCHC', 'SFLMLTCHC'));
  check('adding a choice keyword to a record that has SFLDROP is blocked, naming the choice keyword',
    f([CTL, DRP], [CTL, DRP, SNG]) === msg('SFLSNGCHC', 'SFLDROP'));
  check('adding both sides at once is blocked', f([CTL], [CTL, SNG, DRP]) !== null);
  check('parameters and conditions do not matter', f([CTL, k('SFLSNGCHC', '*X')], [CTL, k('SFLSNGCHC', '*X'), k('SFLDROP', 'CF03')]) !== null);

  // allowed
  check('adding SFLDROP to a record with no choice keyword is allowed', f([CTL], [CTL, DRP]) === null);
  check('adding SFLFOLD to a record with no choice keyword is allowed', f([CTL, PAG], [CTL, PAG, FLD]) === null);
  check('SFLDROP and SFLFOLD together (no choice keyword) is allowed', f([CTL, DRP], [CTL, DRP, FLD]) === null);
  check('adding a choice keyword to a clean record is allowed', f([CTL], [CTL, SNG]) === null);
  check('switching SFLSNGCHC for SFLMLTCHC in one edit is allowed', f([CTL, SNG], [CTL, MLT]) === null);
  check('unrelated edit on a valid record is allowed', f([CTL, SNG], [CTL, SNG, PAG]) === null);
  check('removing SFLDROP from a SFLSNGCHC record is allowed', f([CTL, SNG, DRP], [CTL, SNG]) === null);
  check('removing the choice keyword from a record with SFLDROP is allowed', f([CTL, SNG, DRP], [CTL, DRP]) === null);
  check('no keywords / empty lists never block', f([], []) === null && f([CTL], [CTL]) === null);

  // diff-based, per pair
  check('pre-existing SFLSNGCHC+SFLDROP, unchanged -> not re-reported', f([CTL, SNG, DRP], [CTL, SNG, DRP]) === null);
  check('pre-existing invalid record + unrelated keyword added -> not re-reported', f([CTL, SNG, DRP], [CTL, SNG, DRP, PAG]) === null);
  check('pre-existing SFLSNGCHC+SFLDROP, then a NEW pair SFLFOLD is still blocked', f([CTL, SNG, DRP], [CTL, SNG, DRP, FLD]) === msg('SFLFOLD', 'SFLSNGCHC'));
  check('pre-existing invalid record: fixing it by removing SFLDROP is allowed', f([CTL, SNG, DRP], [CTL, SNG]) === null);

  // spec is the source of the partner list
  check('partner list comes from the spec (same set as the forward direction)',
    DspfWriter.sflChoiceListConflictReason('SFLSNGCHC', [DRP]) !== '' && f([CTL, SNG], [CTL, SNG, DRP]) !== null);
  check('null/undefined inputs are safe', f(null, null) === null && f(undefined, undefined) === null && f(null, [SNG, DRP]) !== null && f([SNG, DRP], null) === null);
}

// === DOM scenarios ===
const fld = (seq, n) => buildLine({ seq, name: n, length: '4', dataType: 'A', usage: 'O', line: '5', col: '2' });
// CTLA: SFLSNGCHC.  CTLB: SFLMLTCHC.  CTLC: neither.  CTLD: hand-written, ALREADY invalid (SFLSNGCHC + SFLDROP).
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'DTLA', func: 'SFL' }), fld('00020', 'FA'),
  buildLine({ seq: '00030', nameType: 'R', name: 'CTLA', func: 'SFLCTL(DTLA)' }),
  buildLine({ seq: '00040', func: 'SFLSNGCHC' }),
  buildLine({ seq: '00050', nameType: 'R', name: 'DTLB', func: 'SFL' }), fld('00060', 'FB'),
  buildLine({ seq: '00070', nameType: 'R', name: 'CTLB', func: 'SFLCTL(DTLB)' }),
  buildLine({ seq: '00080', func: 'SFLMLTCHC' }),
  buildLine({ seq: '00090', nameType: 'R', name: 'DTLC', func: 'SFL' }), fld('00100', 'FC'),
  buildLine({ seq: '00110', nameType: 'R', name: 'CTLC', func: 'SFLCTL(DTLC)' }),
  buildLine({ seq: '00120', nameType: 'R', name: 'DTLD', func: 'SFL' }), fld('00130', 'FD'),
  buildLine({ seq: '00140', nameType: 'R', name: 'CTLD', func: 'SFLCTL(DTLD)' }),
  buildLine({ seq: '00150', func: 'SFLSNGCHC' }),
  buildLine({ seq: '00160', func: 'SFLDROP(CA05)' }),
].join('\n') + '\n';

function recordKeywordNames(text, recName) {
  const r = DspfParser.parseDspf(text).records.find((x) => x.name === recName);
  return r ? r.keywords.map((k) => k.name) : null;
}

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I128.DSPF');
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
  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  function rawAdd(rec, name, params) {
    return act(() => {
      el('record-' + rec + '-new-kw-name').value = name;
      el('record-' + rec + '-new-kw-params').value = params || '';
      doc.querySelector('.kw-add[data-owner="record-' + rec + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  function setType(rec, value) {
    return act(() => { const s = el('sflctl-' + rec + '-selchc-type'); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  // the SFLCTL panel's SFLDROP / SFLFOLD flag-row checkbox (found by suffix so
  // the test does not depend on the exact panel id prefix)
  function panelFlag(rec, kw, on) {
    const box = doc.querySelector('[id$="-' + kw.toLowerCase() + '-on"][type="checkbox"]');
    return act(() => { if (!box) throw new Error('no ' + kw + ' checkbox for ' + rec); box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  // === Group B: CTLA (SFLSNGCHC) ===
  console.log('\nCTLA (SFLSNGCHC): adding SFLDROP / SFLFOLD / SFLMLTCHC is blocked');
  selectRecord('CTLA');
  check('setup: selector shows SFLSNGCHC', !!el('sflctl-CTLA-selchc-type') && el('sflctl-CTLA-selchc-type').value === 'SFLSNGCHC');
  {
    const r = rawAdd('CTLA', 'SFLDROP', 'CA05');
    check('raw editor: adding SFLDROP blocked with an alert naming SFLDROP and SFLSNGCHC, no applyEdit', blocked(r, /SFLDROP/) && /SFLSNGCHC/.test(r.alertMessage || ''));
  }
  selectRecord('CTLA');
  {
    const r = rawAdd('CTLA', 'SFLFOLD', 'CA06');
    check('raw editor: adding SFLFOLD blocked with an alert naming SFLFOLD and SFLSNGCHC, no applyEdit', blocked(r, /SFLFOLD/) && /SFLSNGCHC/.test(r.alertMessage || ''));
  }
  selectRecord('CTLA');
  {
    const r = rawAdd('CTLA', 'SFLMLTCHC', '');
    check('raw editor: adding SFLMLTCHC blocked, no applyEdit', blocked(r, /SFLMLTCHC/));
  }
  selectRecord('CTLA');
  {
    const r = panelFlag('CTLA', 'SFLDROP', true);
    check('SFLCTL panel: ticking SFLDROP blocked with an alert naming SFLDROP, no applyEdit', blocked(r, /SFLDROP/));
    check('  ...and the checkbox is put back to unchecked by the re-render',
      !doc.querySelector('[id$="-sfldrop-on"][type="checkbox"]') || doc.querySelector('[id$="-sfldrop-on"][type="checkbox"]').checked === false);
  }
  selectRecord('CTLA');
  {
    const r = panelFlag('CTLA', 'SFLFOLD', true);
    check('SFLCTL panel: ticking SFLFOLD blocked with an alert naming SFLFOLD, no applyEdit', blocked(r, /SFLFOLD/));
  }

  console.log('\nCTLA: allowed edits still commit');
  selectRecord('CTLA');
  {
    const r = rawAdd('CTLA', 'TEXT', "'note'");
    check('an unrelated raw-editor add (TEXT) commits with no alert', allowed(r));
  }
  selectRecord('CTLA');
  {
    const r = setType('CTLA', 'SFLMLTCHC');
    check('switching SFLSNGCHC -> SFLMLTCHC through the type selector commits with no alert', allowed(r));
  }

  // === Group C: CTLB (SFLMLTCHC) ===
  console.log('\nCTLB (SFLMLTCHC): adding SFLDROP is blocked');
  selectRecord('CTLB');
  {
    const r = rawAdd('CTLB', 'SFLDROP', 'CA05');
    check('raw editor: adding SFLDROP blocked with an alert naming SFLDROP and SFLMLTCHC, no applyEdit', blocked(r, /SFLDROP/) && /SFLMLTCHC/.test(r.alertMessage || ''));
  }

  // === Group D: CTLC (neither) - SFLDROP is fine; the forward direction still guards ===
  console.log('\nCTLC (no choice keyword): SFLDROP is allowed, then the forward direction (I-26) still blocks the choice keyword');
  selectRecord('CTLC');
  {
    const r = rawAdd('CTLC', 'SFLDROP', 'CA05');
    check('adding SFLDROP commits with no alert', allowed(r));
    const names = r.applyEdit && recordKeywordNames(r.applyEdit.text, 'CTLC');
    check('  ...SFLDROP written', !!names && names.includes('SFLDROP'));
  }
  selectRecord('CTLC');
  {
    const r = rawAdd('CTLC', 'SFLSNGCHC', '');
    check('adding a choice keyword to a record that has SFLDROP is now blocked by the raw editor too', blocked(r, /SFLSNGCHC/) && /SFLDROP/.test(r.alertMessage || ''));
  }

  // === Group E: CTLD (hand-written, ALREADY invalid: SFLSNGCHC + SFLDROP) ===
  console.log('\nCTLD (hand-written, already invalid): unrelated edits are not blocked, a new bad pair still is');
  selectRecord('CTLD');
  {
    const r = rawAdd('CTLD', 'TEXT', "'note'");
    check('an unrelated raw-editor add (TEXT) commits, the pre-existing conflict is not re-reported', allowed(r));
  }
  selectRecord('CTLD');
  {
    const r = rawAdd('CTLD', 'SFLFOLD', 'CA06');
    check('adding a NEW bad pair (SFLFOLD) is still blocked', blocked(r, /SFLFOLD/));
  }

  check('no uncaught errors', errors.length === 0);
  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

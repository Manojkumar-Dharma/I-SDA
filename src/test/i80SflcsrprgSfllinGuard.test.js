/**
 * i80SflcsrprgSfllinGuard.test.js
 *
 * Task I-80 - SFLCSRPRG's DDS Reference section ends "The SFLLIN keyword is
 * not allowed in a record that contains the SFLCSRPRG." I-39 added
 * SFLCSRPRG with only a hint. Read literally the rule is unsatisfiable
 * (SFLCSRPRG is a field-level keyword in the subfile record; SFLLIN is a
 * record-level keyword on the subfile-CONTROL record), so what is enforced
 * is the association the two records already have through SFLCTL(sfl-rec):
 * a subfile record with a SFLCSRPRG field cannot be shown by a control
 * record carrying SFLLIN. Both directions:
 *   field side  - introducing SFLCSRPRG on a field of a subfile record
 *                 whose control record has SFLLIN   (commitEdit)
 *   record side - introducing SFLLIN on a control record (or pointing a
 *                 control record that has it at a subfile record via
 *                 SFLCTL) when that subfile record has a SFLCSRPRG field
 *                 (commitRecordEdit)
 * Diff-based: an already-invalid hand-written file never blocks an
 * unrelated edit, and fixing it is always allowed.
 * Run with: node src/test/i80SflcsrprgSfllinGuard.test.js
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
const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const fld = (name, kws) => ({ name, keywords: kws || [] });
const recd = (name, keywords, fields) => ({ name, keywords: keywords || [], fields: fields || [] });

// ===========================================================================
// A. Pure functions
// ===========================================================================
console.log('A1. sflcsrprgFieldEditConflictReason (field side)');
{
  const f = DspfWriter.sflcsrprgFieldEditConflictReason;
  const withLin = [recd('DTL', [k('SFL')], [fld('S1')]), recd('CTL', [k('SFLCTL', 'DTL'), k('SFLLIN', '5')])];
  const noLin = [recd('DTL', [k('SFL')], [fld('S1')]), recd('CTL', [k('SFLCTL', 'DTL'), k('SFLPAG', '5')])];
  const csr = [k('SFLCSRPRG')];
  const reason = f('DTL', [], csr, withLin);
  check('introducing SFLCSRPRG under a control record with SFLLIN is blocked', !!reason);
  check('the reason names the subfile record, the control record and both keywords', /DTL/.test(reason) && /CTL/.test(reason) && /SFLLIN/.test(reason) && /SFLCSRPRG/.test(reason) && /Remove SFLLIN first/.test(reason));
  check('without SFLLIN it is allowed', f('DTL', [], csr, noLin) === null);
  check('a control record for a DIFFERENT subfile record is irrelevant', f('OTHER', [], csr, withLin) === null);
  check('a field that already had SFLCSRPRG is not re-reported (unrelated edit)', f('DTL', csr, csr.concat([k('DSPATR', 'HI')]), withLin) === null);
  check('removing SFLCSRPRG is never blocked', f('DTL', csr, [], withLin) === null);
  check('SFLLIN with a display size condition still counts (any SFLLIN instance)', !!f('DTL', [], csr, [recd('C2', [k('SFLCTL', 'DTL'), { name: 'SFLLIN', parameters: '5', conditions: [{ indicators: [], displaySizeCondition: '*DS4' }] }])]));
  check('null/undefined inputs are safe', f('DTL', null, null, null) === null && f('DTL', undefined, csr, undefined) === null);
}

console.log('\nA2. sfllinRecordEditConflictReason (record side)');
{
  const f = DspfWriter.sfllinRecordEditConflictReason;
  const dtlCsr = recd('DTL', [k('SFL')], [fld('S1'), fld('S2', [k('SFLCSRPRG')])]);
  const dtlPlain = recd('DTL', [k('SFL')], [fld('S1')]);
  const ctlBefore = recd('CTL', [k('SFLCTL', 'DTL'), k('SFLPAG', '5')]);
  const after = [k('SFLCTL', 'DTL'), k('SFLPAG', '5'), k('SFLLIN', '5')];
  const reason = f(ctlBefore, after, [dtlCsr, ctlBefore]);
  check('adding SFLLIN when the subfile record has a SFLCSRPRG field is blocked', !!reason);
  check('the reason names the subfile record and the offending field', /DTL/.test(reason) && /S2/.test(reason) && /Remove SFLCSRPRG first/.test(reason));
  check('adding SFLLIN when no field has SFLCSRPRG is allowed', f(ctlBefore, after, [dtlPlain, ctlBefore]) === null);
  check('an edit that never has SFLLIN is never reported', f(ctlBefore, [k('SFLCTL', 'DTL'), k('SFLPAG', '9')], [dtlCsr, ctlBefore]) === null);
  check('SFLLIN on a record with no SFLCTL is not reported (SFLLIN belongs on the control record)', f(recd('X', []), [k('SFLLIN', '5')], [dtlCsr]) === null);
  check('a SFLCTL naming a record that does not exist is not reported', f(recd('X', []), [k('SFLCTL', 'GONE'), k('SFLLIN', '5')], [dtlCsr]) === null);
  const retarget = recd('CTL2', [k('SFLCTL', 'DTLPLAIN'), k('SFLLIN', '5')]);
  check('pointing a control record that already has SFLLIN at a SFLCSRPRG subfile record via SFLCTL is blocked',
    !!f(retarget, [k('SFLCTL', 'DTL'), k('SFLLIN', '5')], [dtlCsr, retarget]));
  const already = recd('CTLBAD', [k('SFLCTL', 'DTL'), k('SFLLIN', '5')]);
  check('an ALREADY-invalid record is not re-reported for an unrelated edit', f(already, already.keywords.concat([k('TEXT', "'x'")]), [dtlCsr, already]) === null);
  check('...and changing the SFLLIN spacing on it is allowed', f(already, [k('SFLCTL', 'DTL'), k('SFLLIN', '8')], [dtlCsr, already]) === null);
  check('...and fixing it by removing SFLLIN is allowed', f(already, [k('SFLCTL', 'DTL')], [dtlCsr, already]) === null);
  check('null/undefined inputs are safe', f(null, null, null) === null && f(undefined, [k('SFLLIN', '5')], undefined) === null);
}

// ===========================================================================
// B. Real generated webview
// ===========================================================================
const line = (seq, name, extra) => buildLine(Object.assign({ seq, name, length: '4', dataType: 'A', usage: 'B', line: '5', col: '2' }, extra || {}));
const R = (seq, name, func) => buildLine({ seq, nameType: 'R', name, func });
const K = (seq, func) => buildLine({ seq, func });
const SRC = [
  // DTLA/CTLA: control record HAS SFLLIN; subfile record has no SFLCSRPRG yet
  R('00010', 'DTLA', 'SFL'), line('00020', 'FA'),
  R('00030', 'CTLA', 'SFLCTL(DTLA)'), K('00040', 'SFLPAG(5)'), K('00050', 'SFLSIZ(20)'), K('00060', 'SFLLIN(5)'),
  // DTLB/CTLB: subfile record HAS a SFLCSRPRG field; control record has no SFLLIN yet
  R('00070', 'DTLB', 'SFL'), line('00080', 'FB', { func: 'SFLCSRPRG' }),
  R('00090', 'CTLB', 'SFLCTL(DTLB)'), K('00100', 'SFLPAG(5)'), K('00110', 'SFLSIZ(20)'),
  // DTLC/CTLC: plain pair, neither keyword
  R('00120', 'DTLC', 'SFL'), line('00130', 'FC'),
  R('00140', 'CTLC', 'SFLCTL(DTLC)'), K('00150', 'SFLPAG(5)'), K('00160', 'SFLSIZ(20)'),
  // DTLE/CTLE: plain pair kept separate from DTLC/CTLC (B2 ticks SFLCSRPRG on FC, which would
  // legitimately make a later SFLLIN on CTLC a violation - the webview keeps its own updated model)
  R('00240', 'DTLE', 'SFL'), line('00250', 'FE'),
  R('00260', 'CTLE', 'SFLCTL(DTLE)'), K('00270', 'SFLPAG(5)'), K('00280', 'SFLSIZ(20)'),
  // DTLD/CTLD: hand-written and ALREADY invalid (SFLCSRPRG under SFLLIN)
  R('00170', 'DTLD', 'SFL'), line('00180', 'FD', { func: 'SFLCSRPRG' }), line('00190', 'FD2', { col: '12' }),
  R('00200', 'CTLD', 'SFLCTL(DTLD)'), K('00210', 'SFLPAG(5)'), K('00220', 'SFLSIZ(20)'), K('00230', 'SFLLIN(5)'),
].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I80.DSPF').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
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
    window.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} });
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const el = (id) => doc.getElementById(id);
  function selectRecord(name) {
    const sel = el('recordSelect');
    sel.value = name;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function selectField(name) {
    const f = doc.querySelector('.dspf-field[data-field="' + name + '"]');
    if (!f) return null;
    f.dispatchEvent(new Event('click', { bubbles: true }));
    return 'field-' + f.getAttribute('data-source-line');
  }
  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage, applyEdit: posted.filter((m) => m.type === 'applyEdit').pop() || null };
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;
  const csrprgBox = (owner) => el(owner + '-sflcsrprg');
  function tick(owner, on) {
    return act(() => { const c = csrprgBox(owner); c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  function rawAdd(rec, name, params) {
    return act(() => {
      el('record-' + rec + '-new-kw-name').value = name;
      el('record-' + rec + '-new-kw-params').value = params || '';
      doc.querySelector('.kw-add[data-owner="record-' + rec + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  const fieldKeywordNames = (text, rec, field) => {
    const r = DspfParser.parseDspf(text).records.find((x) => x.name === rec);
    const f = r && r.fields.find((x) => x.name === field);
    return f ? f.keywords.map((kw) => kw.name) : null;
  };
  const recordKeywordNames = (text, rec) => {
    const r = DspfParser.parseDspf(text).records.find((x) => x.name === rec);
    return r ? r.keywords.map((kw) => kw.name) : null;
  };

  console.log('\nB1. Field side: SFLCSRPRG under a control record that has SFLLIN');
  selectRecord('DTLA');
  {
    const owner = selectField('FA');
    check('setup: FA selected and its SFLCSRPRG checkbox is rendered, unchecked', !!owner && !!csrprgBox(owner) && csrprgBox(owner).checked === false);
    const r = tick(owner, true);
    check('ticking it is blocked with an alert naming the control record and SFLLIN', blocked(r, /CTLA/) && /SFLLIN/.test(r.alertMessage));
    check('...and the checkbox is put back to unchecked by the re-render', !!csrprgBox(owner) && csrprgBox(owner).checked === false);
  }

  console.log('\nB2. Field side: a plain pair still allows it');
  selectRecord('DTLC');
  {
    const owner = selectField('FC');
    const r = tick(owner, true);
    check('ticking SFLCSRPRG with no SFLLIN anywhere is allowed and written', allowed(r) && (fieldKeywordNames(r.applyEdit.text, 'DTLC', 'FC') || []).indexOf('SFLCSRPRG') !== -1);
  }

  console.log('\nB3. Record side: SFLLIN on a control record whose subfile record has a SFLCSRPRG field');
  selectRecord('CTLB');
  {
    const r = rawAdd('CTLB', 'SFLLIN', '5');
    check('the raw editor add is blocked with an alert naming the subfile record and field', blocked(r, /DTLB/) && /FB/.test(r.alertMessage) && /SFLCSRPRG/.test(r.alertMessage));
    check('...and CTLB still has no SFLLIN in the source', recordKeywordNames(SRC, 'CTLB').indexOf('SFLLIN') === -1);
  }
  selectRecord('CTLE');
  {
    const r = rawAdd('CTLE', 'SFLLIN', '5');
    check('SFLLIN on a control record whose subfile record has no SFLCSRPRG is allowed', allowed(r) && recordKeywordNames(r.applyEdit.text, 'CTLE').indexOf('SFLLIN') !== -1);
  }

  console.log('\nB4. An already-invalid hand-written pair stays editable');
  selectRecord('CTLD');
  {
    const r = rawAdd('CTLD', 'TEXT', "'Detail list'");
    check('an unrelated keyword can still be added to the control record (CTLD)', allowed(r) && recordKeywordNames(r.applyEdit.text, 'CTLD').indexOf('TEXT') !== -1);
  }
  selectRecord('DTLD');
  {
    const owner = selectField('FD');
    check('setup: FD renders with SFLCSRPRG checked', !!owner && csrprgBox(owner).checked === true);
    const off = tick(owner, false);
    check('unticking SFLCSRPRG (fixing it) is never blocked', allowed(off) && (fieldKeywordNames(off.applyEdit.text, 'DTLD', 'FD') || []).indexOf('SFLCSRPRG') === -1);
  }
  selectRecord('DTLD');
  {
    const owner2 = selectField('FD2');
    const r = tick(owner2, true);
    check('ticking it on ANOTHER field under the same SFLLIN is still blocked (that edit introduces it)', blocked(r, /CTLD/));
  }

  check('no uncaught errors', errors.length === 0);
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
}, 500);

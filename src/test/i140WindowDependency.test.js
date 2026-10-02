/**
 * i140WindowDependency.test.js
 *
 * Task I-140 - found by the I-122 batch 1 tests. RMVWDW and USRRSTDSP each
 * require a WINDOW keyword on the same record format (DDS Reference, RMVWDW
 * and USRRSTDSP sections). Before this task the raw keyword editor accepted
 * either on a plain record, and removing WINDOW left them behind.
 *
 * Covers:
 *  1. the spec fact (RECORD_TYPES.WINDOW.requiredFor, with its citation)
 *  2. DspfWriter.windowDependencyNewConflictReason - diff semantics
 *  3. the committed-edit hook in jsdom (raw keyword editor add / remove)
 *
 * Run with: node src/test/i140WindowDependency.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require('../../dist/dspfParser.js');

console.log('=== 1. spec fact ===');
check('requiredFor is exactly RMVWDW, USRRSTDSP', KeywordSpec.windowDependentKeywords().join() === 'RMVWDW,USRRSTDSP');
check('the accessor returns a copy', (() => { const a = KeywordSpec.windowDependentKeywords(); a.push('X'); return KeywordSpec.windowDependentKeywords().length === 2; })());
check('the DDS citation names both keywords', /RMVWDW/.test(KeywordSpec.RECORD_TYPES.WINDOW.requiredForDdsReference) && /USRRSTDSP/.test(KeywordSpec.RECORD_TYPES.WINDOW.requiredForDdsReference));
check('the dependents are not on the mutex list (they may coexist with WINDOW)', KeywordSpec.windowDependentKeywords().every((k) => !KeywordSpec.isMutex('WINDOW', k)));

console.log('\n=== 2. windowDependencyNewConflictReason ===');
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const rec = (name, keywords) => ({ name, keywords, fields: [] });
const model = (...records) => ({ fileKeywords: [], records });
const reason = (a, b) => DspfWriter.windowDependencyNewConflictReason(a, b);

const plain = model(rec('R1', []));
check('adding RMVWDW to a plain record is refused', /RMVWDW cannot be specified on record format R1 without a WINDOW/.test(reason(plain, model(rec('R1', [kw('RMVWDW')]))) || ''));
check('adding USRRSTDSP to a plain record is refused', /USRRSTDSP cannot be specified on record format R1/.test(reason(plain, model(rec('R1', [kw('USRRSTDSP')]))) || ''));
check('the message cites the DDS Reference', /per the DDS Reference/.test(reason(plain, model(rec('R1', [kw('RMVWDW')]))) || ''));

const win = model(rec('W1', [kw('WINDOW', '6 15 9 30')]));
check('adding RMVWDW to a window record is accepted', reason(win, model(rec('W1', [kw('WINDOW', '6 15 9 30'), kw('RMVWDW')]))) === null);
check('adding USRRSTDSP to a window record is accepted', reason(win, model(rec('W1', [kw('WINDOW', '6 15 9 30'), kw('USRRSTDSP')]))) === null);
check('WINDOW naming a record format (reference form) is not refused - IBM says it only does not function', reason(model(rec('W2', [kw('WINDOW', 'W1')])), model(rec('W2', [kw('WINDOW', 'W1'), kw('RMVWDW')]))) === null);

const withDep = model(rec('W1', [kw('WINDOW', '6 15 9 30'), kw('RMVWDW'), kw('USRRSTDSP')]));
check('removing WINDOW while RMVWDW is present is refused', /cannot be specified on record format W1 without a WINDOW/.test(reason(withDep, model(rec('W1', [kw('RMVWDW'), kw('USRRSTDSP')]))) || ''));
check('removing WINDOW together with the dependents is accepted', reason(withDep, model(rec('W1', []))) === null);
check('removing WINDOW from a record with no dependents is accepted', reason(win, model(rec('W1', []))) === null);
check('lower-impact edit: changing WINDOW geometry keeps it accepted', reason(withDep, model(rec('W1', [kw('WINDOW', '2 2 5 20'), kw('RMVWDW'), kw('USRRSTDSP')]))) === null);

const already = model(rec('R1', [kw('RMVWDW')]), rec('R2', []));
check('an already-invalid record does not block an unrelated edit on it', reason(already, model(rec('R1', [kw('RMVWDW'), kw('PUTOVR')]), rec('R2', []))) === null);
check('an already-invalid record does not block an edit on another record', reason(already, model(rec('R1', [kw('RMVWDW')]), rec('R2', [kw('CA03')]))) === null);
check('but a second, new violation is still reported', /USRRSTDSP/.test(reason(already, model(rec('R1', [kw('RMVWDW')]), rec('R2', [kw('USRRSTDSP')]))) || ''));
check('the same keyword on a different record is a new violation', /record format R2/.test(reason(already, model(rec('R1', [kw('RMVWDW')]), rec('R2', [kw('RMVWDW')]))) || ''));
check('fail-safe: null / empty / odd models give null', [undefined, null, {}, { records: null }, model(rec('R', null))].every((m) => reason(null, m) === null));

console.log('\n=== 3. the committed-edit hook (jsdom) ===');
const dspfSource = [
  '     A          R PLAIN1',
  "     A                                  1  2'PLAIN'",
  '     A          R WIN1                      WINDOW(6 15 9 30)',
  "     A                                  1  2'WINDOW'",
].join('\n') + '\n';
const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;
  function withAlert(fn) {
    const orig = dom.window.alert;
    let msg = null;
    dom.window.alert = (m) => { msg = m; };
    fn();
    dom.window.alert = orig;
    return msg;
  }
  const lastEdit = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e && DspfParser.parseDspf(e.text); };
  function selectRecord(name) {
    const sel = doc.getElementById('recordSelect');
    sel.value = name;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function rawAdd(record, name) {
    doc.getElementById('record-' + record + '-new-kw-name').value = name;
    const params = doc.getElementById('record-' + record + '-new-kw-params');
    if (params) params.value = '';
    return withAlert(() => doc.querySelector('.kw-add[data-owner="record-' + record + '"]').dispatchEvent(new Event('click', { bubbles: true })));
  }
  function rawRemove(record, name) {
    const btns = Array.from(doc.querySelectorAll('.kw-remove[data-owner="record-' + record + '"]'));
    const rec = DspfParser.parseDspf(posted.length ? posted.filter((m) => m.type === 'applyEdit').pop().text : dspfSource).records.find((r) => r.name === record);
    const idx = rec.keywords.findIndex((k) => k.name === name);
    return withAlert(() => btns[idx].dispatchEvent(new Event('click', { bubbles: true })));
  }

  console.log('  -- plain record');
  selectRecord('PLAIN1');
  posted.length = 0;
  {
    const msg = rawAdd('PLAIN1', 'RMVWDW');
    check('raw-adding RMVWDW to a plain record is refused with the DDS wording', /RMVWDW cannot be specified on record format PLAIN1 without a WINDOW/.test(msg || ''));
    check('no applyEdit was posted', !posted.some((m) => m.type === 'applyEdit'));
  }
  {
    const msg = rawAdd('PLAIN1', 'USRRSTDSP');
    check('raw-adding USRRSTDSP to a plain record is refused', /USRRSTDSP cannot be specified/.test(msg || '') && !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('  -- window record');
  selectRecord('WIN1');
  posted.length = 0;
  {
    const msg = rawAdd('WIN1', 'RMVWDW');
    const r = lastEdit();
    const w = r && r.records.find((x) => x.name === 'WIN1');
    check('raw-adding RMVWDW to a window record is accepted, no alert', msg === null && !!w && w.keywords.some((k) => k.name === 'RMVWDW'));
  }
  {
    const msg = rawRemove('WIN1', 'WINDOW');
    check('removing WINDOW while RMVWDW is on the record is refused', /RMVWDW cannot be specified on record format WIN1 without a WINDOW/.test(msg || ''));
    const w = lastEdit().records.find((x) => x.name === 'WIN1');
    check('and WINDOW is still on the record afterwards', w.keywords.some((k) => k.name === 'WINDOW') && w.keywords.some((k) => k.name === 'RMVWDW'));
  }
  {
    const msg = rawRemove('WIN1', 'RMVWDW');
    const w = lastEdit().records.find((x) => x.name === 'WIN1');
    check('removing RMVWDW itself is always accepted', msg === null && !w.keywords.some((k) => k.name === 'RMVWDW'));
  }
  {
    const msg = rawRemove('WIN1', 'WINDOW');
    const w = lastEdit().records.find((x) => x.name === 'WIN1');
    check('with no dependents left, removing WINDOW is accepted', msg === null && !w.keywords.some((k) => k.name === 'WINDOW'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

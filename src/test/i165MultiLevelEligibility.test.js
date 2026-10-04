/**
 * i165MultiLevelEligibility.test.js
 *
 * Task I-165 - raised by I-121j. The multi-level keyword eligibility rules the
 * spec recorded as facts are now enforced:
 *   OVRATR     field level only on usage I / O / B and constant fields
 *   OVRDTA     field level only on usage O / B / M, never on a constant
 *   TEXT       not on a SFLMSGKEY or SFLPGMQ field
 *   PUTRETAIN  needs OVERLAY on the record (record level or any field)
 *   PUTRETAIN with DSPMOD is an advisory note, not a refusal (IBM: "warning")
 *
 * Covers: 1. spec accessors  2. model guard (diff semantics)  3. field panel
 * rows  4. the advisory  5. the committed-edit hook (jsdom, raw keyword editor)
 *
 * Run with: node src/test/i165MultiLevelEligibility.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require('../../dist/dspfParser.js');

console.log('=== 1. spec accessors ===');
const elig = (n) => KeywordSpec.fieldLevelEligibility(n);
check('OVRATR: usage I,O,B and constants', elig('OVRATR').allowedUsage.join() === 'I,O,B' && elig('OVRATR').constantFields === true);
check('OVRDTA: usage O,B,M and no constants', elig('OVRDTA').allowedUsage.join() === 'O,B,M' && elig('OVRDTA').constantFields === false);
check('TEXT: not on SFLMSGKEY / SFLPGMQ fields', elig('TEXT').notOnFieldsWithKeyword.join() === 'SFLMSGKEY,SFLPGMQ');
check('other keywords give null', elig('DUP') === null && elig('CHANGE') === null && elig('') === null);
check('accessor returns copies', (() => { elig('OVRATR').allowedUsage.pop(); return elig('OVRATR').allowedUsage.length === 3; })());
check('PUTRETAIN rules: OVERLAY required, DSPMOD warns', KeywordSpec.putretainRecordRules().requiresRecordKeyword === 'OVERLAY' && KeywordSpec.putretainRecordRules().warnsAtCreationWith.join() === 'DSPMOD');

console.log('\n=== 2. multiLevelEligibilityNewConflictReason ===');
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const fld = (name, usage, keywords, extra) => Object.assign({ name, usage, keywords: keywords || [] }, extra || {});
const rec = (name, keywords, fields) => ({ name, keywords: keywords || [], fields: fields || [] });
const model = (...records) => ({ fileKeywords: [], records });
const reason = (a, b) => DspfWriter.multiLevelEligibilityNewConflictReason(a, b);
const withField = (f, recKw) => model(rec('R1', recKw || [], [f]));
const base = (usage) => withField(fld('F1', usage, []));

['I', 'O', 'B', ''].forEach((u) => check('OVRATR on usage ' + (u || 'blank') + ' is accepted', reason(base(u), withField(fld('F1', u, [kw('OVRATR')]))) === null));
check('OVRATR on a hidden field is refused', /OVRATR on field F1 needs usage I, O, B .*usage H/.test(reason(base('H'), withField(fld('F1', 'H', [kw('OVRATR')]))) || ''));
check('OVRATR on a constant is accepted', reason(withField(fld('', '', [], { nameType: 'CONSTANT' })), withField(fld('', '', [kw('OVRATR')], { nameType: 'CONSTANT' }))) === null);
['O', 'B', 'M'].forEach((u) => check('OVRDTA on usage ' + u + ' is accepted', reason(base(u), withField(fld('F1', u, [kw('OVRDTA')]))) === null));
['I', 'H'].forEach((u) => check('OVRDTA on usage ' + u + ' is refused', /OVRDTA on field F1 needs usage O, B, M/.test(reason(base(u), withField(fld('F1', u, [kw('OVRDTA')]))) || '')));
check('OVRDTA on a constant is refused', /OVRDTA cannot be specified on constant field/.test(reason(withField(fld('', '', [], { nameType: 'CONSTANT' })), withField(fld('', '', [kw('OVRDTA')], { nameType: 'CONSTANT' }))) || ''));
check('changing the usage to a refused one is a new violation (I -> H with OVRATR)', /OVRATR on field F1/.test(reason(withField(fld('F1', 'I', [kw('OVRATR')])), withField(fld('F1', 'H', [kw('OVRATR')]))) || ''));
check('TEXT on an ordinary field is accepted', reason(base('O'), withField(fld('F1', 'O', [kw('TEXT', "'Customer'")]))) === null);
['SFLMSGKEY', 'SFLPGMQ'].forEach((k) => {
  check('TEXT beside ' + k + ' is refused', /TEXT cannot be specified on field F1, a .* field/.test(reason(withField(fld('F1', 'M', [kw(k)])), withField(fld('F1', 'M', [kw(k), kw('TEXT', "'x'")]))) || ''));
  check('adding ' + k + ' to a field that has TEXT is refused too', /TEXT cannot be specified on field F1/.test(reason(withField(fld('F1', 'M', [kw('TEXT', "'x'")])), withField(fld('F1', 'M', [kw('TEXT', "'x'"), kw(k)]))) || ''));
});
check('PUTRETAIN at record level without OVERLAY is refused', /PUTRETAIN cannot be specified on record format R1 without OVERLAY.*ignored/.test(reason(model(rec('R1')), model(rec('R1', [kw('PUTRETAIN')]))) || ''));
check('PUTRETAIN at record level with OVERLAY is accepted', reason(model(rec('R1', [kw('OVERLAY')])), model(rec('R1', [kw('OVERLAY'), kw('PUTRETAIN')]))) === null);
check('PUTRETAIN on a field without OVERLAY on the record is refused', /PUTRETAIN cannot be specified on record format R1 without OVERLAY/.test(reason(base('O'), withField(fld('F1', 'O', [kw('PUTRETAIN')]))) || ''));
check('PUTRETAIN on a field with OVERLAY on the record is accepted', reason(withField(fld('F1', 'O', []), [kw('OVERLAY')]), withField(fld('F1', 'O', [kw('PUTRETAIN')]), [kw('OVERLAY')])) === null);
check('removing OVERLAY while PUTRETAIN is present is refused', /PUTRETAIN cannot be specified on record format R1 without OVERLAY/.test(reason(model(rec('R1', [kw('OVERLAY'), kw('PUTRETAIN')])), model(rec('R1', [kw('PUTRETAIN')]))) || ''));
check('removing OVERLAY together with PUTRETAIN is accepted', reason(model(rec('R1', [kw('OVERLAY'), kw('PUTRETAIN')])), model(rec('R1'))) === null);
check('PUTRETAIN with DSPMOD is NOT refused (the reference says warning)', reason(model(rec('R1', [kw('OVERLAY'), kw('DSPMOD', '*DS4')])), model(rec('R1', [kw('OVERLAY'), kw('DSPMOD', '*DS4'), kw('PUTRETAIN')]))) === null);
const bad = withField(fld('F1', 'H', [kw('OVRATR')]));
check('an already-invalid field does not block an unrelated edit', reason(bad, withField(fld('F1', 'H', [kw('OVRATR'), kw('TEXT', "'x'")]))) === null);
check('a second, new violation is still reported', /OVRDTA/.test(reason(bad, model(rec('R1', [], [fld('F1', 'H', [kw('OVRATR')]), fld('F2', 'I', [kw('OVRDTA')])]))) || ''));
check('the same keyword on another field is a new violation', /field F2/.test(reason(bad, model(rec('R1', [], [fld('F1', 'H', [kw('OVRATR')]), fld('F2', 'H', [kw('OVRATR')])]))) || ''));
check('messages cite the DDS Reference', [reason(base('H'), withField(fld('F1', 'H', [kw('OVRATR')]))), reason(model(rec('R1')), model(rec('R1', [kw('PUTRETAIN')])))].every((m) => /per the DDS Reference/.test(m || '')));
check('fail-safe: null / empty / odd models give null', [undefined, null, {}, { records: null }, model(rec('R', null, null))].every((m) => reason(null, m) === null));

console.log('\n=== 3. field panel rows ===');
function rowShown(name, usage, keywords, isConstant) {
  const html = WebviewClientHelpers.generalFieldKeywordsHtml(keywords || [], 'x', new Set(), 'A', usage, [], !!isConstant, '');
  return html.indexOf('x-gen-' + name.toLowerCase()) !== -1;
}
check('OVRATR: shown for I / O / B, hidden for H', ['I', 'O', 'B'].every((u) => rowShown('OVRATR', u)) && !rowShown('OVRATR', 'H'));
check('OVRATR: shown for a constant', rowShown('OVRATR', '', [], true));
check('OVRDTA: shown for O / B / M, hidden for I and H', ['O', 'B', 'M'].every((u) => rowShown('OVRDTA', u)) && !rowShown('OVRDTA', 'I') && !rowShown('OVRDTA', 'H'));
check('OVRDTA: hidden for a constant', !rowShown('OVRDTA', '', [], true));
check('TEXT: shown ordinarily, hidden on a SFLMSGKEY / SFLPGMQ field', rowShown('TEXT', 'O') && !rowShown('TEXT', 'M', [kw('SFLMSGKEY')]) && !rowShown('TEXT', 'M', [kw('SFLPGMQ')]));
check('a hand-written invalid field still shows the ticked row so it can be un-ticked', rowShown('OVRATR', 'H', [kw('OVRATR')]) && rowShown('OVRDTA', 'I', [kw('OVRDTA')]) && rowShown('TEXT', 'M', [kw('SFLMSGKEY'), kw('TEXT', "'x'")]));
check('blank usage fails open (it is output)', rowShown('OVRATR', '') && rowShown('OVRDTA', ''));

console.log('\n=== 4. PUTRETAIN / DSPMOD advisory ===');
const adv = (k, f) => DspfWriter.putretainDspmodAdvisory(k, f);
check('PUTRETAIN + DSPMOD on the record gives the advisory', /PUTRETAIN with DSPMOD.*warning.*RSTDSP\(\*YES\)/.test(adv([kw('OVERLAY'), kw('PUTRETAIN'), kw('DSPMOD', '*DS4')], []) || ''));
check('PUTRETAIN on a field + DSPMOD on the record gives it too', !!adv([kw('OVERLAY'), kw('DSPMOD', '*DS4')], [fld('F1', 'O', [kw('PUTRETAIN')])]));
check('DSPMOD alone or PUTRETAIN alone gives none', adv([kw('DSPMOD', '*DS4')], []) === null && adv([kw('OVERLAY'), kw('PUTRETAIN')], []) === null);
const recPanel = WebviewClientHelpers.recordKeywordsPanelsHtml
  ? Object.values(WebviewClientHelpers.recordKeywordsPanelsHtml([kw('OVERLAY'), kw('PUTRETAIN'), kw('DSPMOD', '*DS4')], 'rk-R', new Set())).join('')
  : '';
check('the record Overlay panel shows the advisory when both are present', /PUTRETAIN with DSPMOD/.test(recPanel));

console.log('\n=== 5. the committed-edit hook (jsdom) ===');
const dspfSource = [
  '     A          R REC1',
  "     A                                  1  2'TEXT'",
  '     A          R REC2                      OVERLAY',
  "     A                                  1  2'TEXT'",
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
    const rec = DspfParser.parseDspf(posted.filter((m) => m.type === 'applyEdit').pop().text).records.find((r) => r.name === record);
    const idx = rec.keywords.findIndex((k) => k.name === name);
    return withAlert(() => btns[idx].dispatchEvent(new Event('click', { bubbles: true })));
  }

  console.log('  -- record without OVERLAY');
  selectRecord('REC1');
  posted.length = 0;
  {
    const msg = rawAdd('REC1', 'PUTRETAIN');
    check('raw-adding PUTRETAIN to a record without OVERLAY is refused with the DDS wording', /PUTRETAIN cannot be specified on record format REC1 without OVERLAY/.test(msg || ''));
    check('no applyEdit was posted', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('  -- record with OVERLAY');
  selectRecord('REC2');
  posted.length = 0;
  {
    const msg = rawAdd('REC2', 'PUTRETAIN');
    const r = lastEdit();
    const rr = r && r.records.find((x) => x.name === 'REC2');
    check('raw-adding PUTRETAIN to a record with OVERLAY is accepted, no alert', msg === null && !!rr && rr.keywords.some((k) => k.name === 'PUTRETAIN'));
  }
  {
    const msg = rawRemove('REC2', 'OVERLAY');
    check('removing OVERLAY while PUTRETAIN is present is refused', /PUTRETAIN cannot be specified on record format REC2 without OVERLAY/.test(msg || ''));
    const rr = lastEdit().records.find((x) => x.name === 'REC2');
    check('and OVERLAY is still on the record afterwards', rr.keywords.some((k) => k.name === 'OVERLAY'));
  }
  {
    const msg = rawAdd('REC2', 'DSPMOD');
    const rr = lastEdit().records.find((x) => x.name === 'REC2');
    check('adding DSPMOD beside PUTRETAIN is not refused by this guard (advisory only)', !/PUTRETAIN/.test(msg || '') || rr.keywords.some((k) => k.name === 'DSPMOD'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

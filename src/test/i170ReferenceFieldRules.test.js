/**
 * i170ReferenceFieldRules.test.js
 *
 * Task I-170 - raised by I-121o. The rules the I-121o spec entries record, now
 * enforced in one model-diff guard (DspfWriter.referenceFieldNewConflictReason):
 *   REFFLD / DLTCHK / DLTEDT  valid only with R in position 29
 *   ALIAS   different from every other alternative name and every field name
 *   HLPID   constant fields only, required, a number 1-999, unique per record
 * and turning the reference flag off now drops DLTCHK / DLTEDT with REFFLD.
 *
 * Covers: 1. spec accessor  2. model guard (diff semantics)  3. applyReffldState
 * 4. the committed-edit hook and the reference toggle (jsdom)  5. sweep
 *
 * Run with: node src/test/i170ReferenceFieldRules.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

console.log('=== 1. spec accessor ===');
const rules = KeywordSpec.referenceFieldRules();
check('keywords that need R in position 29: REFFLD, DLTCHK, DLTEDT', rules.requireReferenceFlag.join() === 'REFFLD,DLTCHK,DLTEDT');
check('ALIAS names must be unique', rules.aliasUnique === true);
check('HLPID: 1-999, unique, constant-only, required', rules.help.min === 1 && rules.help.max === 999 && rules.help.unique === true && rules.help.constantOnly === true && rules.help.required === true);
rules.requireReferenceFlag.pop(); rules.help.max = 1;
check('the accessor returns a fresh object', KeywordSpec.referenceFieldRules().requireReferenceFlag.length === 3 && KeywordSpec.referenceFieldRules().help.max === 999);

console.log('\n=== 2. referenceFieldNewConflictReason ===');
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const fld = (name, keywords, extra) => Object.assign({ name, usage: 'B', nameType: 'FIELD', isReference: false, keywords: keywords || [] }, extra || {});
const cst = (keywords) => ({ name: '', usage: null, nameType: 'CONSTANT', keywords: keywords || [] });
const model = (...fields) => ({ fileKeywords: [], records: [{ name: 'R1', keywords: [], fields }] });
const reason = (a, b) => DspfWriter.referenceFieldNewConflictReason(a, b);
const REF = { isReference: true };

console.log('  -- R in position 29');
['REFFLD', 'DLTCHK', 'DLTEDT'].forEach((k) => {
  const p = k === 'REFFLD' ? 'ITEM FILEX' : '';
  check(k + ' on a plain field is refused', new RegExp(k + ' cannot be specified on field F1.*R is specified in position 29').test(reason(model(fld('F1')), model(fld('F1', [kw(k, p)]))) || ''));
  check(k + ' on a reference field is accepted', reason(model(fld('F1', [], REF)), model(fld('F1', [kw(k, p)], REF))) === null);
  check(k + ' on a constant is refused', /cannot be specified on a constant field/.test(reason(model(cst()), model(cst([kw(k, p)]))) || ''));
});
check('clearing the reference flag while DLTCHK stays is refused', /DLTCHK cannot be specified on field F1/.test(reason(model(fld('F1', [kw('DLTCHK')], REF)), model(fld('F1', [kw('DLTCHK')]))) || ''));
check('clearing the flag and dropping DLTCHK / DLTEDT / REFFLD together is accepted', reason(model(fld('F1', [kw('DLTCHK'), kw('DLTEDT'), kw('REFFLD', 'A B')], REF)), model(fld('F1', []))) === null);
check('a hand-written invalid field does not block an unrelated edit', reason(model(fld('F1', [kw('DLTCHK')])), model(fld('F1', [kw('DLTCHK'), kw('TEXT', "'x'")]))) === null);
check('a record with no keywords of these kinds is accepted', reason(model(fld('F1')), model(fld('F1'), fld('F2'))) === null);

console.log('  -- ALIAS');
check('ALIAS equal to another field name is refused', /ALIAS\(F2\) on field F1.*different from all DDS field names/.test(reason(model(fld('F1'), fld('F2')), model(fld('F1', [kw('ALIAS', 'F2')]), fld('F2'))) || ''));
check('ALIAS equal to the field\'s own name is refused too', /ALIAS\(F1\) on field F1/.test(reason(model(fld('F1')), model(fld('F1', [kw('ALIAS', 'F1')]))) || ''));
check('ALIAS equal to another field\'s alias is refused', /ALIAS\(LONG\).*different from all other alternative names.*already uses it/.test(reason(model(fld('F1'), fld('F2', [kw('ALIAS', 'LONG')])), model(fld('F1', [kw('ALIAS', 'LONG')]), fld('F2', [kw('ALIAS', 'LONG')]))) || ''));
check('the comparison ignores case', /ALIAS\(LONG\)/.test(reason(model(fld('F1'), fld('F2', [kw('ALIAS', 'LONG')])), model(fld('F1', [kw('ALIAS', 'long')]), fld('F2', [kw('ALIAS', 'LONG')]))) || ''));
check('a quoted alias is compared by its name', /ALIAS\(F2\)/.test(reason(model(fld('F1'), fld('F2')), model(fld('F1', [kw('ALIAS', "'F2'")]), fld('F2'))) || ''));
check('a distinct alias is accepted', reason(model(fld('F1'), fld('F2')), model(fld('F1', [kw('ALIAS', 'CUSTNAME')]), fld('F2', [kw('ALIAS', 'ORDNAME')]))) === null);
check('the same alias in another record format is accepted', reason({ fileKeywords: [], records: [{ name: 'R1', keywords: [], fields: [fld('F1', [kw('ALIAS', 'X1')])] }, { name: 'R2', keywords: [], fields: [fld('F1')] }] },
  { fileKeywords: [], records: [{ name: 'R1', keywords: [], fields: [fld('F1', [kw('ALIAS', 'X1')])] }, { name: 'R2', keywords: [], fields: [fld('F1', [kw('ALIAS', 'X1')])] }] }) === null);
check('a bare ALIAS is left to the parameter checks (no alias clash)', reason(model(fld('F1')), model(fld('F1', [kw('ALIAS')]))) === null);
check('an existing clash does not block an unrelated edit', reason(model(fld('F1', [kw('ALIAS', 'F2')]), fld('F2')), model(fld('F1', [kw('ALIAS', 'F2')]), fld('F2', [kw('TEXT', "'x'")]))) === null);

console.log('  -- HLPID');
const withH = (...params) => model(...params.map((p) => cst(p === null ? [] : [kw('HLPID', p)])));
['1', '5', '999'].forEach((n) => check('HLPID(' + n + ') is accepted', reason(withH(null), withH(n)) === null));
['0', '1000', '-3', 'FOO', '1.5', 'FLDHELP1'].forEach((n) => check('HLPID(' + n + ') is refused as out of range', /HLPID\(.*\) is not a valid help identifier.*from 1 to 999/.test(reason(withH(null), withH(n)) || '')));
check('a bare HLPID is refused (the parameter is required)', /HLPID needs a help-identifier parameter/.test(reason(withH(null), withH('')) || ''));
check('a second constant with the same identifier is refused', /HLPID\(5\) is already used by another constant field in record format R1/.test(reason(withH('5', null), withH('5', '5')) || ''));
check('05 and 5 are the same identifier', /already used/.test(reason(withH('5', null), withH('5', '05')) || ''));
check('different identifiers are accepted', reason(withH('5', null), withH('5', '6')) === null);
check('the same identifier in another record format is accepted', reason({ fileKeywords: [], records: [{ name: 'R1', keywords: [], fields: [cst([kw('HLPID', '5')])] }, { name: 'R2', keywords: [], fields: [] }] },
  { fileKeywords: [], records: [{ name: 'R1', keywords: [], fields: [cst([kw('HLPID', '5')])] }, { name: 'R2', keywords: [], fields: [cst([kw('HLPID', '5')])] }] }) === null);
check('HLPID on a named field is refused (constant fields only)', /HLPID cannot be specified on field F1: it is a constant field keyword/.test(reason(model(fld('F1')), model(fld('F1', [kw('HLPID', '7')]))) || ''));
check('a second HLPID instance on one constant is checked too', /HLPID\(1000\)/.test(reason(model(cst([kw('HLPID', '5')])), model(cst([kw('HLPID', '5'), kw('HLPID', '1000')]))) || ''));
check('an existing bad identifier does not block an unrelated edit', reason(withH('1000', null), withH('1000', '7')) === null);
check('moving the bad identifier is not a new violation', reason(withH('1000', '7'), withH('7', '1000')) === null);

console.log('\n=== 3. applyReffldState with the flag off ===');
{
  const kws = [kw('REFFLD', 'A FILE'), kw('DLTCHK'), kw('DLTEDT'), kw('TEXT', "'x'"), kw('ALIAS', 'AL')];
  const off = DspfWriter.applyReffldState(kws, 'F1', { isReference: false }).map((k) => k.name);
  check('flag off drops REFFLD, DLTCHK and DLTEDT', off.join() === 'TEXT,ALIAS');
  const on = DspfWriter.applyReffldState(kws, 'F1', { isReference: true, fieldName: 'A', file: 'FILE' }).map((k) => k.name);
  check('flag on keeps DLTCHK and DLTEDT and rewrites REFFLD', on.indexOf('DLTCHK') >= 0 && on.indexOf('DLTEDT') >= 0 && on.filter((n) => n === 'REFFLD').length === 1);
  check('the result is accepted by the guard', reason(model(fld('F1', kws, REF)), model(fld('F1', DspfWriter.applyReffldState(kws, 'F1', { isReference: false })))) === null);
}

console.log('\n=== 4. committed edits (jsdom) ===');
function buildLine(o) {
  const seq = (o.seq || '     ').padEnd(5, ' ');
  const line = ' '.repeat(80).split('');
  const put = (col, text) => { for (let i = 0; i < text.length; i++) line[col - 1 + i] = text[i]; };
  put(1, seq);
  put(6, 'A');
  if (o.nameType) put(17, o.nameType);
  if (o.name) put(19, o.name);
  if (o.ref) put(29, 'R');
  if (o.length) put(35 - o.length.length, o.length);
  if (o.dataType) put(35, o.dataType);
  if (o.usage) put(38, o.usage);
  if (o.line) put(41 - o.line.length + 1, o.line);
  if (o.col) put(44 - o.col.length + 1, o.col);
  if (o.func) put(45, o.func);
  return line.join('').replace(/\s+$/, '');
}
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'REC1' }),
  buildLine({ seq: '00020', name: 'F1', length: '10', dataType: 'A', usage: 'B', line: '2', col: '2' }),
  buildLine({ seq: '00030', name: 'F2', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2', func: 'ALIAS(LONGNAME)' }),
  buildLine({ seq: '00040', name: 'F3', ref: true, usage: 'B', line: '4', col: '2', func: 'REFFLD(X FILE1) DLTCHK DLTEDT' }),
  buildLine({ seq: '00050', line: '6', col: '2', func: "'Hi' HLPID(5)" }),
  buildLine({ seq: '00060', line: '7', col: '2', func: "'Yo'" }),
].join('\n') + '\n';
const m0 = DspfParser.parseDspf(SRC);
check('fixture: F3 is a reference field with DLTCHK, DLTEDT and REFFLD', m0.records[0].fields[2].isReference === true && m0.records[0].fields[2].keywords.map((k) => k.name).join() === 'REFFLD,DLTCHK,DLTEDT');

const webviewFor = () => {
  const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I170.DSPF');
  const posted = [], alerts = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
      window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
    },
  });
  return { dom, posted, alerts };
};
const CASES = [
  // [source line, keyword, parameters, expected refusal, label]
  [2, 'DLTCHK', '', /DLTCHK cannot be specified on field F1.*position 29/, 'DLTCHK on a plain field'],
  [2, 'DLTEDT', '', /DLTEDT cannot be specified on field F1/, 'DLTEDT on a plain field'],
  [2, 'REFFLD', 'F1 FILE1', /REFFLD cannot be specified on field F1/, 'REFFLD on a plain field'],
  [2, 'ALIAS', 'F2', /ALIAS\(F2\) on field F1/, 'ALIAS equal to a field name'],
  [2, 'ALIAS', 'longname', /ALIAS\(LONGNAME\)/, 'ALIAS equal to another alias'],
  [2, 'HLPID', '7', /HLPID cannot be specified on field F1/, 'HLPID on a named field'],
  [6, 'HLPID', '1000', /not a valid help identifier/, 'HLPID(1000)'],
  [6, 'HLPID', 'FOO', /not a valid help identifier/, 'HLPID(FOO)'],
  [6, 'HLPID', '5', /already used by another constant field/, 'HLPID duplicating another constant\'s'],
  [6, 'HLPID', '', /HLPID needs a help-identifier parameter/, 'a bare HLPID'],
  [4, 'ALIAS', 'F1', /ALIAS\(F1\) on field F3/, 'ALIAS equal to a field name on a reference field'],
  // accepted
  [4, 'TEXT', "'Item'", null, 'TEXT on the reference field (unrelated edit beside DLTCHK / DLTEDT)'],
  [2, 'ALIAS', 'CUSTNAME', null, 'a distinct ALIAS'],
  [6, 'HLPID', '6', null, 'HLPID(6)'],
  [6, 'HLPID', '999', null, 'HLPID(999)'],
];
let pending = CASES.length + 1;
const finish = () => { if (--pending === 0) { const fails = failureCount(); console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed'); process.exit(fails ? 1 : 0); } };
CASES.forEach(([line, name, params, re, label], i) => {
  setTimeout(() => {
    const { dom, posted, alerts } = webviewFor();
    setTimeout(() => {
      const doc = dom.window.document, { Event } = dom.window;
      const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
      if (!box) { check('setup: source line ' + line + ' is on the canvas', false); return finish(); }
      box.click(); posted.length = 0; alerts.length = 0;
      doc.getElementById('field-' + line + '-new-kw-name').value = name;
      const pe = doc.getElementById('field-' + line + '-new-kw-params'); if (pe) pe.value = params;
      doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
      const edit = posted.filter((m) => m.type === 'applyEdit').pop();
      if (re) check('raw-adding ' + label + ' is refused with the DDS wording', alerts.length === 1 && re.test(alerts[0]) && !edit);
      else check('raw-adding ' + label + ' is accepted', !!edit && alerts.length === 0);
      finish();
    }, 350);
  }, i * 5);
});

// The reference toggle: unticking "This field's length/type/decimals ..." must drop DLTCHK / DLTEDT / REFFLD in one accepted edit.
{
  const { dom, posted, alerts } = webviewFor();
  setTimeout(() => {
    const doc = dom.window.document, { Event } = dom.window;
    doc.querySelector('.dspf-field[data-source-line="4"]').click(); posted.length = 0; alerts.length = 0;
    const on = doc.getElementById('field-4-reffld-on');
    check('the reference checkbox is on for F3', !!on && on.checked);
    on.checked = false; on.dispatchEvent(new Event('change', { bubbles: true }));
    const edit = posted.filter((m) => m.type === 'applyEdit').pop();
    check('unticking the reference flag is not refused', alerts.length === 0 && !!edit);
    const f3 = edit && DspfParser.parseDspf(edit.text).records[0].fields.find((f) => f.name === 'F3');
    check('F3 is no longer a reference field and carries none of REFFLD / DLTCHK / DLTEDT', !!f3 && f3.isReference === false && !f3.keywords.some((k) => ['REFFLD', 'DLTCHK', 'DLTEDT'].indexOf(k.name) >= 0));
    check('the HLPID placeholder asks for a number', WebviewClientHelpers.generalFieldKeywordsHtml([], 'k', new Set(), 'A', 'B', [], true, undefined).indexOf('help identifier, 1-999') >= 0);
    finish();
  }, 400);
}

console.log('\n=== 5. sweep over KEYWORD-LOOKUP.json ===');
{
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
  const own = ['REFFLD', 'DLTCHK', 'DLTEDT', 'ALIAS', 'HLPID'];
  Object.keys(lookup).filter((n) => n.charAt(0) !== '*').forEach((n) => {
    const r = reason(model(fld('F1'), cst()), model(fld('F1', [kw(n, 'X')]), cst([kw(n, 'X')])));
    check(n + ': ' + (own.indexOf(n) >= 0 ? 'is one of the five rules\' keywords (guard may speak)' : 'never triggers the reference-field guard'), own.indexOf(n) >= 0 || r === null);
  });
}

/**
 * i148InitRetainReturnRelations.test.js
 *
 * Task I-148 - the initialize / retain / return relations the I-121b slice
 * found unenforced (every case below was accepted and written before):
 *   GETRETAIN needs UNLOCK with no parameters (UNLOCK(any parameter) makes
 *   the system ignore GETRETAIN); RTNDTA cannot be with UNLOCK; INZINP needs
 *   PUTOVR, OVERLAY and ERASEINP(*ALL) on the record.
 * The guard is spec-driven (KeywordSpec.recordRequires / requiresBareKeyword /
 * recordExcludes) and diff-based (the I-140 / I-151 shape): it reports only a
 * violation the edit adds, in either direction, so an already-invalid file
 * never blocks an unrelated edit.
 *
 * Run with: node src/test/i148InitRetainReturnRelations.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) put(9, o.ind);
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const parse = (t) => DspfParser.parseDspf(t);
const rec = (...kws) => src(dds({ rec: 1, name: 'REC1' }), ...kws.map((k) => dds({ fn: k })));
const guard = (a, b) => DspfWriter.initRetainReturnNewConflictReason(parse(a), parse(b));
const INZ_ALL = ['PUTOVR', 'OVERLAY', 'ERASEINP(*ALL)'];

console.log('=== 1. the facts, against the DDS Reference ===');
check('INZINP requires PUTOVR, OVERLAY and ERASEINP(*ALL)',
  has('This keyword requires the PUTOVR, OVERLAY, and ERASEINP(*ALL) keywords') && KeywordSpec.recordRequires('INZINP').join() === INZ_ALL.join());
check('GETRETAIN needs UNLOCK without parameters',
  has('You must specify the UNLOCK keyword without any parameters when using GETRETAIN.') && KeywordSpec.requiresBareKeyword('GETRETAIN') === 'UNLOCK' && KeywordSpec.recordRequires('GETRETAIN').join() === 'UNLOCK');
check('UNLOCK(any parameter) makes GETRETAIN an error',
  has('if the GETRETAIN keyword is specified with UNLOCK(any parameter)'));
check('RTNDTA cannot be with UNLOCK',
  has('If the UNLOCK keyword is specified, the RTNDTA keyword cannot be specified.') && KeywordSpec.recordExcludes('RTNDTA').join() === 'UNLOCK');

console.log('\n=== 2. GETRETAIN needs a bare UNLOCK ===');
check('adding GETRETAIN with no UNLOCK is refused, with the DDS wording',
  /GETRETAIN cannot be specified on record format REC1 without UNLOCK \(with no parameters\) on the same record format \(per the DDS Reference\)/.test(guard(rec(), rec('GETRETAIN')) || ''));
check('adding GETRETAIN beside a bare UNLOCK is accepted', guard(rec('UNLOCK'), rec('UNLOCK', 'GETRETAIN')) === null);
check('adding both together is accepted', guard(rec(), rec('UNLOCK', 'GETRETAIN')) === null);
['UNLOCK(*ERASE)', 'UNLOCK(*MDTOFF)', 'UNLOCK(*ERASE *MDTOFF)'].forEach((u) => {
  check('GETRETAIN beside ' + u + ' is refused (UNLOCK must have no parameters)',
    /GETRETAIN on record format REC1 requires UNLOCK with no parameters, but UNLOCK is specified with \(\*[A-Z *]+\)/.test(guard(rec(u), rec(u, 'GETRETAIN')) || ''));
});
check('changing a bare UNLOCK to UNLOCK(*ERASE) while GETRETAIN stays is refused',
  /requires UNLOCK with no parameters/.test(guard(rec('UNLOCK', 'GETRETAIN'), rec('UNLOCK(*ERASE)', 'GETRETAIN')) || ''));
check('removing UNLOCK while GETRETAIN stays is refused',
  /GETRETAIN cannot be specified on record format REC1 without UNLOCK/.test(guard(rec('UNLOCK', 'GETRETAIN'), rec('GETRETAIN')) || ''));
check('removing GETRETAIN itself is accepted', guard(rec('UNLOCK', 'GETRETAIN'), rec('UNLOCK')) === null);
check('a bare UNLOCK carrying an option indicator still counts',
  guard(rec(), src(dds({ rec: 1, name: 'REC1' }), dds({ ind: '30', fn: 'UNLOCK' }), dds({ fn: 'GETRETAIN' }))) === null);
check('UNLOCK with parameters but no GETRETAIN is accepted', guard(rec(), rec('UNLOCK(*ERASE)')) === null);
check('a bare UNLOCK beside a parameterised one satisfies GETRETAIN', guard(rec('UNLOCK', 'UNLOCK(*ERASE)'), rec('UNLOCK', 'UNLOCK(*ERASE)', 'GETRETAIN')) === null);

console.log('\n=== 3. RTNDTA and UNLOCK ===');
check('adding UNLOCK to a record with RTNDTA is refused',
  /RTNDTA and UNLOCK cannot be specified on the same record format \(REC1\) \(per the DDS Reference\)/.test(guard(rec('RTNDTA'), rec('RTNDTA', 'UNLOCK')) || ''));
check('adding RTNDTA to a record with UNLOCK is refused (either direction)', /RTNDTA and UNLOCK cannot/.test(guard(rec('UNLOCK'), rec('UNLOCK', 'RTNDTA')) || ''));
check('RTNDTA with UNLOCK(*ERASE) is refused too', /RTNDTA and UNLOCK cannot/.test(guard(rec('UNLOCK(*ERASE)'), rec('UNLOCK(*ERASE)', 'RTNDTA')) || ''));
check('either alone is accepted', guard(rec(), rec('RTNDTA')) === null && guard(rec(), rec('UNLOCK')) === null);
check('removing one of the pair is accepted', guard(rec('RTNDTA', 'UNLOCK'), rec('RTNDTA')) === null);
check('the pair on different records is accepted',
  guard(src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'RTNDTA' }), dds({ rec: 1, name: 'B1' })),
    src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'RTNDTA' }), dds({ rec: 1, name: 'B1' }), dds({ fn: 'UNLOCK' }))) === null);
check('an already-invalid pair does not block an unrelated edit', guard(rec('RTNDTA', 'UNLOCK'), rec('RTNDTA', 'UNLOCK', 'ALARM')) === null);

console.log('\n=== 4. INZINP needs PUTOVR, OVERLAY and ERASEINP(*ALL) ===');
check('adding INZINP with nothing is refused, naming the first missing keyword',
  /INZINP cannot be specified on record format REC1 without a PUTOVR keyword on the same record format \(per the DDS Reference\)/.test(guard(rec(), rec('INZINP')) || ''));
check('adding INZINP with all three is accepted', guard(rec(...INZ_ALL), rec(...INZ_ALL, 'INZINP')) === null);
check('adding all four together is accepted', guard(rec(), rec(...INZ_ALL, 'INZINP')) === null);
INZ_ALL.forEach((missing) => {
  const rest = INZ_ALL.filter((k) => k !== missing);
  const label = missing;
  check('INZINP without ' + label + ' is refused',
    new RegExp('INZINP cannot be specified on record format REC1 without an? ' + label.replace(/[()*]/g, '\\$&') + ' keyword').test(guard(rec(...rest), rec(...rest, 'INZINP')) || ''));
  check('removing ' + label + ' while INZINP stays is refused',
    new RegExp('INZINP cannot be specified on record format REC1 without an? ' + label.replace(/[()*]/g, '\\$&') + ' keyword').test(guard(rec(...INZ_ALL, 'INZINP'), rec(...rest, 'INZINP')) || ''));
});
['ERASEINP', 'ERASEINP(*MDTON)'].forEach((e) => {
  check('INZINP beside ' + e + ' (not *ALL) is refused',
    /without an ERASEINP\(\*ALL\) keyword/.test(guard(rec('PUTOVR', 'OVERLAY', e), rec('PUTOVR', 'OVERLAY', e, 'INZINP')) || ''));
});
check('changing ERASEINP(*ALL) to ERASEINP(*MDTON) while INZINP stays is refused',
  /without an ERASEINP\(\*ALL\) keyword/.test(guard(rec(...INZ_ALL, 'INZINP'), rec('PUTOVR', 'OVERLAY', 'ERASEINP(*MDTON)', 'INZINP')) || ''));
check('a second, differently-parameterised ERASEINP does not hide ERASEINP(*ALL)',
  guard(rec('PUTOVR', 'OVERLAY', 'ERASEINP(*ALL)', 'ERASEINP(*MDTON)'), rec('PUTOVR', 'OVERLAY', 'ERASEINP(*ALL)', 'ERASEINP(*MDTON)', 'INZINP')) === null);
check('removing INZINP itself is accepted', guard(rec(...INZ_ALL, 'INZINP'), rec(...INZ_ALL)) === null);
check('an already-invalid INZINP does not block an unrelated edit', guard(rec('INZINP'), rec('INZINP', 'ALARM')) === null);
check('...but a second, new violation is reported', /GETRETAIN cannot/.test(guard(rec('INZINP'), rec('INZINP', 'GETRETAIN')) || ''));
check('INZRCD, RETLCKSTS, RETKEY and RETCMDKEY need nothing here',
  ['INZRCD', 'RETLCKSTS', 'RETKEY', 'RETCMDKEY'].every((k) => guard(rec(), rec(k)) === null));

console.log('\n=== 5. the guard itself ===');
check('fail-safe on odd models', [undefined, null, {}, { records: null }, { records: [{ name: 'R', keywords: null }] }].every((m) => DspfWriter.initRetainReturnNewConflictReason(null, m) === null));
check('every keyword the guard checks is one the spec holds a relation for',
  KeywordSpec.initRetainReturnRelationKeywords().every((n) => KeywordSpec.recordRequires(n).length || KeywordSpec.recordExcludes(n).length) && KeywordSpec.initRetainReturnRelationKeywords().join() === 'INZINP,GETRETAIN,RTNDTA');
check('RETKEY / RETCMDKEY record exclusions are left to I-149', guard(rec(), rec('RETKEY', 'PRINT')) === null && guard(rec(), rec('RETCMDKEY', 'SFLDROP')) === null);
check('the webview commit choke point calls the guard',
  fs.readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8').indexOf('DspfWriter.initRetainReturnNewConflictReason(model, candidate)') !== -1);

console.log('\n=== 6. the commit hook (jsdom) ===');
const SOURCE = src(
  dds({ rec: 1, name: 'PLAIN1' }),
  dds({ rec: 1, name: 'FULL1' }),
  dds({ fn: 'PUTOVR' }),
  dds({ fn: 'OVERLAY' }),
  dds({ fn: 'ERASEINP(*ALL)' }),
  dds({ fn: 'INZINP' }),
  dds({ rec: 1, name: 'RET1' }),
  dds({ fn: 'UNLOCK' }),
  dds({ fn: 'GETRETAIN' }),
  dds({ rec: 1, name: 'NEXT1' })
);
const html = webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF');
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});
setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const selectRecord = (n) => { const s = doc.getElementById('recordSelect'); s.value = n; fire(s); };
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  function withAlert(fn) {
    const orig = dom.window.alert; let msg = null;
    dom.window.alert = (m) => { msg = m; }; fn(); dom.window.alert = orig; return msg;
  }
  function rawAdd(record, name, params) {
    const owner = 'record-' + record;
    doc.getElementById(owner + '-new-kw-name').value = name;
    const p = doc.getElementById(owner + '-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click'));
  }
  function rawRemove(record, name) {
    const btns = Array.from(doc.querySelectorAll('.kw-remove[data-owner="record-' + record + '"]'));
    const text = lastText() || SOURCE;
    const idx = parse(text).records.find((r) => r.name === record).keywords.findIndex((k) => k.name === name);
    posted.length = 0;
    return withAlert(() => btns[idx].dispatchEvent(new Event('click', { bubbles: true })));
  }

  selectRecord('PLAIN1');
  let msg = rawAdd('PLAIN1', 'GETRETAIN');
  check('raw-adding GETRETAIN to a record with no UNLOCK is refused, nothing written',
    /GETRETAIN cannot be specified on record format PLAIN1 without UNLOCK/.test(msg || '') && lastText() === null);
  msg = rawAdd('PLAIN1', 'INZINP');
  check('raw-adding INZINP to a bare record is refused, nothing written',
    /INZINP cannot be specified on record format PLAIN1 without a PUTOVR/.test(msg || '') && lastText() === null);
  msg = rawAdd('PLAIN1', 'UNLOCK', '*ERASE');
  check('raw-adding UNLOCK(*ERASE) goes through', msg === null && /UNLOCK\(\*ERASE\)/.test(lastText() || ''));
  msg = rawAdd('PLAIN1', 'RTNDTA');
  check('...and RTNDTA is then refused beside it', /RTNDTA and UNLOCK cannot be specified on the same record format/.test(msg || '') && lastText() === null);

  selectRecord('RET1');
  msg = rawRemove('RET1', 'UNLOCK');
  check('removing UNLOCK while GETRETAIN stays is refused, nothing written',
    /GETRETAIN cannot be specified on record format RET1 without UNLOCK/.test(msg || '') && lastText() === null);
  msg = rawRemove('RET1', 'GETRETAIN');
  check('removing GETRETAIN is accepted', msg === null && lastText() !== null && !/GETRETAIN/.test(lastText()));

  selectRecord('FULL1');
  msg = rawRemove('FULL1', 'ERASEINP');
  check('removing ERASEINP(*ALL) while INZINP stays is refused, nothing written',
    /INZINP cannot be specified on record format FULL1 without an ERASEINP\(\*ALL\)/.test(msg || '') && lastText() === null);
  msg = rawRemove('FULL1', 'INZINP');
  check('removing INZINP is accepted', msg === null && lastText() !== null && !/INZINP/.test(lastText()));

  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

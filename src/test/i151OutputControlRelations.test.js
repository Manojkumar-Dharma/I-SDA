/**
 * i151OutputControlRelations.test.js
 *
 * Task I-151 - the output-control keyword relations the I-121a slice found
 * unenforced (probe, v0.10.296: every case below was accepted and written):
 *   ERASE / ERASEINP / MDTOFF / PROTECT need OVERLAY on the record;
 *   PUTOVR and PUTRETAIN cannot share a record; ERASE names at most 20
 *   record formats; CSRLOC and FRCDTA appear once per record format.
 * The guard is spec-driven (KeywordSpec.recordKeywordFacts) and diff-based
 * (the I-140 / I-145 / I-146 shape): it reports only a violation the edit
 * adds, in either direction, so an already-invalid file never blocks an
 * unrelated edit.
 *
 * Run with: node src/test/i151OutputControlRelations.test.js
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
// A keyword is a string (one line) or an array of already-built lines (a
// '+'-continued keyword such as a long ERASE).
const rec = (...kws) => src(dds({ rec: 1, name: 'REC1' }), ...[].concat(...kws.map((k) => (Array.isArray(k) ? k : [dds({ fn: k })]))));
const guard = (a, b) => DspfWriter.outputControlNewConflictReason(parse(a), parse(b));
const names20 = Array.from({ length: 20 }, (_, i) => 'R' + (i + 1)).join(' ');
const names21 = names20 + ' R21';
// ERASE(<n names>) as '+'-continued DDS lines, six names to a line.
function E(n, sep) {
  const list = Array.from({ length: n }, (_, i) => 'R' + (i + 1));
  const chunks = [];
  for (let i = 0; i < list.length; i += 6) chunks.push(list.slice(i, i + 6).join(sep || ' '));
  return chunks.map((c, i) => dds({ fn: (i === 0 ? 'ERASE(' : '') + c + (i < chunks.length - 1 ? ' +' : ')') }));
}

console.log('=== 1. the facts, against the DDS Reference ===');
const F = (n) => KeywordSpec.recordKeywordFacts(n);
check('"OVERLAY must be specified" for ERASE', has('The OVERLAY keyword must be specified whenever the ERASE keyword is specified.') && F('ERASE').requiresRecordKeyword === 'OVERLAY');
check('"OVERLAY must be specified" for ERASEINP', has('The OVERLAY keyword must be specified whenever ERASEINP is specified.') && F('ERASEINP').requiresRecordKeyword === 'OVERLAY');
check('PROTECT needs OVERLAY in the same record format', has('The OVERLAY keyword must be specified in the record format in which PROTECT is specified.') && F('PROTECT').requiresRecordKeyword === 'OVERLAY');
check('MDTOFF is valid where OVERLAY is also specified', has('It is valid for all other record formats for which OVERLAY keyword is also specified.') && F('MDTOFF').requiresRecordKeyword === 'OVERLAY');
check('PUTRETAIN and PUTOVR cannot share a record', has('The PUTRETAIN keyword and the PUTOVR keyword cannot be specified on the same record format.') && F('PUTOVR').mutex.join() === 'PUTRETAIN');
check('ERASE takes at most 20 record names', has('ERASE(record-name-1 [record-name-2 ...[record-name-20]])') && F('ERASE').parameterCount.max === 20 && F('ERASE').repeatable === true);
check('CSRLOC once per record format', has('Specify the CSRLOC keyword only once per record format.') && F('CSRLOC').oncePerRecordFormat === true);
check('FRCDTA once per record format', has('The FRCDTA keyword can be specified once for each record format.') && F('FRCDTA').oncePerRecordFormat === true);
const pdStart = REF.indexOf('The following keywords cannot be specified on a record with the PULLDOWN keyword:');
const pdBlock = REF.slice(pdStart, pdStart + 700);
check('PULLDOWN\'s own sentence lists ERASE, ERASEINP, MDTOFF, OVERLAY but not PROTECT',
  pdStart > 0 && ['ERASE', 'ERASEINP', 'MDTOFF', 'OVERLAY'].every((n) => new RegExp('\\b' + n + '\\b').test(pdBlock)) && !/\bPROTECT\b/.test(pdBlock.slice(0, pdBlock.indexOf('Option indicators') > 0 ? pdBlock.indexOf('Option indicators') : 700)) &&
  ['ERASE', 'ERASEINP', 'MDTOFF', 'OVERLAY'].every((n) => KeywordSpec.isMutex('PULLDOWN', n)) && !KeywordSpec.isMutex('PULLDOWN', 'PROTECT'));

console.log('\n=== 2. OVERLAY is required ===');
['ERASE(REC2)', 'ERASEINP', 'ERASEINP(*ALL)', 'MDTOFF', 'MDTOFF(*ALL)', 'PROTECT'].forEach((k) => {
  const nm = k.replace(/\(.*/, '');
  check('adding ' + k + ' with no OVERLAY is refused, with the DDS wording',
    new RegExp(nm + ' cannot be specified on record format REC1 without an OVERLAY keyword on the same record format \\(per the DDS Reference\\)').test(guard(rec(), rec(k)) || ''));
  check('adding ' + k + ' to a record that has OVERLAY is accepted', guard(rec('OVERLAY'), rec('OVERLAY', k)) === null);
  check('removing OVERLAY while ' + nm + ' stays is refused', /without an OVERLAY keyword/.test(guard(rec('OVERLAY', k), rec(k)) || ''));
  check('removing ' + nm + ' itself is accepted', guard(rec('OVERLAY', k), rec('OVERLAY')) === null);
});
check('adding OVERLAY and ERASE together is accepted', guard(rec(), rec('OVERLAY', 'ERASE(REC2)')) === null);
check('removing both together is accepted', guard(rec('OVERLAY', 'ERASE(REC2)', 'PROTECT'), rec()) === null);
check('an OVERLAY carrying an option indicator still counts', guard(rec(), src(dds({ rec: 1, name: 'REC1' }), dds({ ind: '30', fn: 'OVERLAY' }), dds({ fn: 'ERASE(REC2)' }))) === null);
check('ALARM, BLINK, LOCK and OVERLAY itself need no OVERLAY', ['ALARM', 'BLINK', 'LOCK', 'OVERLAY', 'PUTOVR', 'FRCDTA', 'CSRLOC(A B)'].every((k) => guard(rec(), rec(k)) === null));
check('already-invalid: ERASE with no OVERLAY does not block an unrelated edit', guard(rec('ERASE(REC2)'), rec('ERASE(REC2)', 'ALARM')) === null);
check('...but a second, new violation is reported', /PROTECT cannot/.test(guard(rec('ERASE(REC2)'), rec('ERASE(REC2)', 'PROTECT')) || ''));
check('PROTECT on a PULLDOWN record is refused through the OVERLAY rule (PULLDOWN forbids OVERLAY)',
  /PROTECT cannot be specified on record format REC1 without an OVERLAY/.test(guard(rec('PULLDOWN'), rec('PULLDOWN', 'PROTECT')) || '') && DspfWriter.pulldownConflictReason('OVERLAY', parse(rec('PULLDOWN')).records[0].keywords) !== null);

console.log('\n=== 3. PUTOVR and PUTRETAIN ===');
check('adding PUTOVR to a record with PUTRETAIN is refused',
  /PUTOVR and PUTRETAIN cannot be specified on the same record format \(REC1\) \(per the DDS Reference\)/.test(guard(rec('PUTRETAIN'), rec('PUTRETAIN', 'PUTOVR')) || ''));
check('adding PUTRETAIN to a record with PUTOVR is refused too (either direction)', /PUTOVR and PUTRETAIN cannot/.test(guard(rec('PUTOVR'), rec('PUTOVR', 'PUTRETAIN')) || ''));
check('either alone is accepted', guard(rec(), rec('PUTOVR')) === null && guard(rec(), rec('PUTRETAIN')) === null);
check('removing one of an invalid pair is accepted', guard(rec('PUTOVR', 'PUTRETAIN'), rec('PUTOVR')) === null);
check('the pair on different records is accepted', guard(src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'PUTOVR' }), dds({ rec: 1, name: 'B1' })), src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'PUTOVR' }), dds({ rec: 1, name: 'B1' }), dds({ fn: 'PUTRETAIN' }))) === null);
check('an already-invalid pair does not block an unrelated edit', guard(rec('PUTOVR', 'PUTRETAIN'), rec('PUTOVR', 'PUTRETAIN', 'ALARM')) === null);

console.log('\n=== 4. ERASE: at most 20 record names ===');
check('the continuation helper really builds a 21-name ERASE', parse(rec('OVERLAY', E(21))).records[0].keywords.find((k) => k.name === 'ERASE').parameters.split(/\s+/).filter(Boolean).length === 21);
check('ERASE with 20 names is accepted', guard(rec('OVERLAY'), rec('OVERLAY', E(20))) === null);
check('ERASE with 21 names is refused, naming the count and the limit',
  /ERASE names 21 record formats on record format REC1; at most 20 are allowed \(per the DDS Reference\)/.test(guard(rec('OVERLAY'), rec('OVERLAY', E(21))) || ''));
check('names separated by commas are counted too', /names 21/.test(guard(rec('OVERLAY'), rec('OVERLAY', E(21, ','))) || ''));
check('growing an ERASE from 20 to 21 names is refused', /names 21/.test(guard(rec('OVERLAY', E(20)), rec('OVERLAY', E(21))) || ''));
check('shrinking an over-long ERASE is accepted', guard(rec('OVERLAY', E(21)), rec('OVERLAY', E(20))) === null);
check('ERASE may repeat: two ERASEs of 20 names each are accepted', guard(rec('OVERLAY'), rec('OVERLAY', E(20), E(20))) === null);
check('an already-too-long ERASE does not block an unrelated edit', guard(rec('OVERLAY', E(21)), rec('OVERLAY', E(21), 'ALARM')) === null);

console.log('\n=== 5. CSRLOC and FRCDTA once per record format ===');
['CSRLOC(R C)', 'FRCDTA'].forEach((k) => {
  const nm = k.replace(/\(.*/, '');
  check('a second ' + nm + ' is refused', new RegExp(nm + ' can be specified only once per record format, and record format REC1 has 2 \\(per the DDS Reference\\)').test(guard(rec(k), rec(k, k)) || ''));
  check('a first ' + nm + ' is accepted', guard(rec(), rec(k)) === null);
  check('a third ' + nm + ' to an already-doubled record does not block', guard(rec(k, k), rec(k, k, 'ALARM')) === null);
  check('removing the extra ' + nm + ' is accepted', guard(rec(k, k), rec(k)) === null);
  check(nm + ' on two different records is accepted', guard(src(dds({ rec: 1, name: 'A1' }), dds({ fn: k }), dds({ rec: 1, name: 'B1' })), src(dds({ rec: 1, name: 'A1' }), dds({ fn: k }), dds({ rec: 1, name: 'B1' }), dds({ fn: k }))) === null);
});
check('ERASE, ALARM and the other keywords are not once-only', guard(rec('OVERLAY', 'ERASE(A)'), rec('OVERLAY', 'ERASE(A)', 'ERASE(B)')) === null && guard(rec('ALARM'), rec('ALARM', 'ALARM')) === null);

console.log('\n=== 6. the guard itself ===');
check('fail-safe on odd models', [undefined, null, {}, { records: null }, { records: [{ name: 'R', keywords: null }] }].every((m) => DspfWriter.outputControlNewConflictReason(null, m) === null));
check('the guard reads the spec: every keyword with a relation is one the spec holds',
  KeywordSpec.outputControlKeywords().filter((n) => F(n).requiresRecordKeyword || F(n).mutex || F(n).oncePerRecordFormat || (F(n).parameterCount && F(n).repeatable)).join() === 'CSRLOC,ERASE,ERASEINP,PUTOVR,FRCDTA,PROTECT,MDTOFF');
check('UNLOCK, GETRETAIN and RTNDTA are left to I-148', guard(rec(), rec('UNLOCK', 'RTNDTA')) === null && guard(rec(), rec('GETRETAIN')) === null);
check('the webview commit choke point calls the guard', fs.readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8').indexOf('DspfWriter.outputControlNewConflictReason(model, candidate)') !== -1);

console.log('\n=== 7. the commit hook (jsdom) ===');
const SOURCE = src(
  dds({ rec: 1, name: 'PLAIN1' }),
  dds({ rec: 1, name: 'FULL1' }),
  dds({ fn: 'OVERLAY' }),
  dds({ fn: 'ERASE(PLAIN1)' }),
  dds({ fn: 'PUTRETAIN' }),
  dds({ fn: 'CSRLOC(R C)' }),
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
  let msg = rawAdd('PLAIN1', 'PROTECT');
  check('raw-adding PROTECT to a record with no OVERLAY is refused, nothing written', /PROTECT cannot be specified on record format PLAIN1 without an OVERLAY/.test(msg || '') && lastText() === null);
  msg = rawAdd('PLAIN1', 'OVERLAY');
  check('raw-adding OVERLAY goes through', msg === null && /OVERLAY/.test(lastText() || ''));
  msg = rawAdd('PLAIN1', 'PROTECT');
  check('...and PROTECT is then accepted', msg === null && /PROTECT/.test(lastText() || ''));
  msg = rawAdd('PLAIN1', 'ERASE', names21);
  check('raw-adding an ERASE of 21 names is refused', /ERASE names 21 record formats/.test(msg || '') && lastText() === null);
  msg = rawAdd('PLAIN1', 'FRCDTA');
  check('raw-adding a first FRCDTA goes through', msg === null && /FRCDTA/.test(lastText() || ''));
  msg = rawAdd('PLAIN1', 'FRCDTA');
  check('raw-adding a second FRCDTA is refused', /FRCDTA can be specified only once/.test(msg || ''));
  msg = rawAdd('PLAIN1', 'PUTRETAIN');
  check('PUTRETAIN alone is accepted', msg === null && /PUTRETAIN/.test(lastText() || ''));
  msg = rawAdd('PLAIN1', 'PUTOVR');
  check('PUTOVR beside PUTRETAIN is refused', /PUTOVR and PUTRETAIN cannot be specified on the same record format/.test(msg || ''));

  selectRecord('FULL1');
  msg = rawAdd('FULL1', 'CSRLOC', 'R2 C2');
  check('raw-adding a second CSRLOC is refused', /CSRLOC can be specified only once per record format/.test(msg || ''));
  msg = rawRemove('FULL1', 'OVERLAY');
  check('removing OVERLAY while ERASE stays is refused, nothing written', /ERASE cannot be specified on record format FULL1 without an OVERLAY/.test(msg || '') && lastText() === null);
  msg = rawRemove('FULL1', 'ERASE');
  check('removing ERASE is accepted', msg === null && lastText() !== null && !/ERASE\(/.test(lastText()));

  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

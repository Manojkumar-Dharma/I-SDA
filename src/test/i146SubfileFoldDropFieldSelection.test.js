/**
 * i146SubfileFoldDropFieldSelection.test.js
 *
 * Task I-146 - SFLDROP / SFLFOLD pairing and the SFLSIZ = SFLPAG / field
 * selection rules, from the DDS Reference:
 *  (1) field selection ("When subfile page equals subfile size, you can specify
 *      option indicators for fields in the subfile record format") makes SFLDROP,
 *      SFLFOLD, SFLINZ, SFLLIN, SFLRCDNBR, SFLRNA and SFLROLVAL not valid on the
 *      subfile-control record (the spec held five of the seven);
 *  (2) SFLFOLD with SFLSIZ equal to SFLPAG is a stated severity-20 error -
 *      SFLDROP and SFLROLVAL are only "ignored" there, so they are not refused;
 *  (3) SFLDROP and SFLFOLD on one record "must use the same key".
 *
 * Run with: node src/test/i146SubfileFoldDropFieldSelection.test.js
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
  .replace(/\f/g, '').replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) put(9, o.ind);
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.subfileFoldDropNewConflictReason(parse(a), parse(b));

console.log('=== 1. spec facts, against the reference ===');
const SEVEN = ['SFLDROP', 'SFLFOLD', 'SFLINZ', 'SFLLIN', 'SFLRCDNBR', 'SFLRNA', 'SFLROLVAL'];
check('the field-selection list is the seven the SFLPAG section names', KeywordSpec.excludedWithFieldSelection().join() === SEVEN.join());
check('the reference lists them, with SFLRNA "because SFLINZ is not valid"', has('the following keywords are not valid on the subfile- control record format: SFLDROP SFLFOLD SFLINZ SFLLIN SFLRCDNBR SFLRNA (because SFLINZ is not valid) SFLROLVAL') || has('the following keywords are not valid on the subfile-control record format: SFLDROP SFLFOLD SFLINZ SFLLIN SFLRCDNBR SFLRNA (because SFLINZ is not valid) SFLROLVAL'));
check('field selection is defined as option indicators on subfile-record fields when page equals size', has('When subfile page equals subfile size, you can specify option indicators for fields in the subfile record format. This is called field selection.'));
check('SFLFOLD is the one with a stated error when size equals page', KeywordSpec.sizeEqualsPageErrors().join() === 'SFLFOLD' && has('If subfile size equals subfile page, an error message (severity 20) is issued and SFLFOLD is ignored.'));
check('SFLDROP and SFLROLVAL are "ignored" there', KeywordSpec.sizeEqualsPageIgnored().join() === 'SFLDROP,SFLROLVAL' && has('If subfile size equals subfile page, SFLDROP is ignored.') && has('If subfile size equals subfile page, SFLROLVAL is ignored.'));
check('SFLDROP and SFLFOLD share one key: the reference says so', has('Both keywords must use the same key.') && KeywordSpec.RECORD_TYPES.SFLDROP.pairedWith.sameKeyRequired === true);
check('the accessors return copies', (() => { const a = KeywordSpec.sizeEqualsPageErrors(); a.push('X'); const b = KeywordSpec.excludedWithFieldSelection(); b.pop(); return KeywordSpec.sizeEqualsPageErrors().length === 1 && KeywordSpec.excludedWithFieldSelection().length === 7; })());

console.log('\n=== 2. field selection ===');
const SUB = (fieldInd) => [dds({ rec: 1, name: 'SFLR', fn: 'SFL' }), dds({ ind: fieldInd, name: 'F1', len: 10, type: 'A', usage: 'O', line: 1, pos: 2 })];
const CTL = (...kws) => [dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(10)' }), dds({ fn: 'SFLPAG(5)' })].concat(kws.map((k) => dds({ fn: k })));
const file = (fieldInd, ...kws) => src(...SUB(fieldInd), ...CTL(...kws));
check('the parser reads the field indicator as a condition on the field', parse(file('30')).records[0].fields[0].conditions.length > 0 && parse(file('')).records[0].fields[0].conditions.length === 0);
SEVEN.forEach((k) => {
  const arg = k === 'SFLDROP' || k === 'SFLFOLD' ? k + '(CA03)' : k === 'SFLLIN' ? 'SFLLIN(2)' : k === 'SFLRCDNBR' ? 'SFLRCDNBR(CURSOR)' : k;
  const msg = guard(file('30'), file('30', arg));
  check('adding ' + k + ' to the control record of a field-selection subfile is refused, with the DDS wording',
    new RegExp(k + ' cannot be specified on subfile-control record format CTL: subfile record SFLR uses field selection \\(field F1 has an option indicator\\) \\(per the DDS Reference\\)').test(msg || ''));
  check('...but accepted when the subfile has no field selection', k === 'SFLFOLD' ? true : guard(file(''), file('', arg)) === null);
});
check('adding the indicator to a field while SFLINZ is present is refused too', /SFLINZ cannot be specified/.test(guard(file('', 'SFLINZ'), file('30', 'SFLINZ')) || ''));
check('removing the indicator is accepted', guard(file('30', 'SFLINZ'), file('', 'SFLINZ')) === null);
check('removing the keyword is accepted', guard(file('30', 'SFLINZ'), file('30')) === null);
check('an indicator on a field KEYWORD (DSPATR) is not field selection', (() => {
  const t = src(...SUB('').concat([dds({ ind: '30', fn: 'DSPATR(RI)' })]), ...CTL('SFLINZ'));
  return guard(src(...SUB(''), ...CTL('SFLINZ')), t) === null;
})());
check('an indicator on a constant is not field selection', (() => {
  const t = src(dds({ rec: 1, name: 'SFLR', fn: 'SFL' }), dds({ name: 'F1', len: 10, type: 'A', usage: 'O', line: 1, pos: 2 }), dds({ ind: '30', line: 2, pos: 2, fn: "'X'" }), ...CTL('SFLINZ'));
  return guard(file('', 'SFLINZ'), t) === null;
})());
check('a display size on the field is not an option indicator', DspfWriter.hasOptionIndicator([{ relation: 'AND', indicators: [], displaySizeCondition: { name: '*DS3', not: false } }]) === false);
check('an already-invalid file does not block an unrelated edit', guard(file('30', 'SFLINZ'), file('30', 'SFLINZ', 'PUTOVR')) === null);
check('a second, new violation is reported', /SFLROLVAL cannot/.test(guard(file('30', 'SFLINZ'), file('30', 'SFLINZ', 'SFLROLVAL')) || ''));
check('a control record naming no subfile record is left alone', (() => {
  const t = src(dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(NOSUCH)' }), dds({ fn: 'SFLINZ' }));
  return guard(src(dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(NOSUCH)' })), t) === null;
})());

console.log('\n=== 3. SFLFOLD when SFLSIZ equals SFLPAG ===');
const eqFile = (...kws) => src(...SUB(''), dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(5)' }), dds({ fn: 'SFLPAG(5)' }), ...kws.map((k) => dds({ fn: k })));
check('adding SFLFOLD when SFLSIZ equals SFLPAG is refused, naming the severity-20 error', /SFLFOLD cannot be specified when SFLSIZ equals SFLPAG \(both 5\) - the system issues a severity-20 error \(per the DDS Reference\)/.test(guard(eqFile(), eqFile('SFLFOLD(CA03)')) || ''));
check('making SFLSIZ equal SFLPAG while SFLFOLD is present is refused', /SFLFOLD cannot be specified when SFLSIZ equals SFLPAG/.test(guard(file('', 'SFLFOLD(CA03)'), eqFile('SFLFOLD(CA03)')) || ''));
check('SFLFOLD with SFLSIZ different from SFLPAG is accepted', guard(file(''), file('', 'SFLFOLD(CA03)')) === null);
check('SFLDROP when SFLSIZ equals SFLPAG is NOT refused (the reference says it is only ignored)', guard(eqFile(), eqFile('SFLDROP(CA03)')) === null);
check('SFLROLVAL when SFLSIZ equals SFLPAG is NOT refused (ignored)', guard(eqFile(), eqFile('SFLROLVAL')) === null);
check('a non-numeric SFLSIZ (a field) never counts as equal', guard(file(''), src(...SUB(''), dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(&N)' }), dds({ fn: 'SFLPAG(5)' }), dds({ fn: 'SFLFOLD(CA03)' }))) === null);
check('equality at one display size only is still reported, naming the size', (() => {
  const t = src(...SUB(''), dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(20)' }), dds({ ind: '', fn: 'SFLSIZ(5)' }), dds({ fn: 'SFLPAG(5)' }), dds({ fn: 'SFLFOLD(CA03)' }));
  const m = guard(file('', 'SFLFOLD(CA03)'), t);
  return m === null || /SFLFOLD cannot be specified when SFLSIZ equals SFLPAG/.test(m);
})());

console.log('\n=== 4. the same key ===');
check('SFLDROP(CA03) with SFLFOLD(CA04) is refused', /SFLDROP and SFLFOLD on record format CTL must use the same key \(found CA03 and CA04\) \(per the DDS Reference\)/.test(guard(file('', 'SFLDROP(CA03)'), file('', 'SFLDROP(CA03)', 'SFLFOLD(CA04)')) || ''));
check('the same key on both is accepted (case-insensitive)', guard(file('', 'SFLDROP(CA03)'), file('', 'SFLDROP(CA03)', 'SFLFOLD(ca03)')) === null);
check('either one alone is accepted', guard(file(''), file('', 'SFLDROP(CA03)')) === null && guard(file(''), file('', 'SFLFOLD(CA03)')) === null);
check('changing the key on one of a matching pair is refused', /same key/.test(guard(file('', 'SFLDROP(CA03)', 'SFLFOLD(CA03)'), file('', 'SFLDROP(CA03)', 'SFLFOLD(CF03)')) || ''));
check('fixing a mismatch is accepted', guard(file('', 'SFLDROP(CA03)', 'SFLFOLD(CA04)'), file('', 'SFLDROP(CA03)', 'SFLFOLD(CA03)')) === null);
check('two option-indicator instances with one shared key are accepted', guard(file(''), src(...SUB(''), ...CTL('SFLDROP(CA03)'), dds({ ind: '40', fn: 'SFLFOLD(CA03)' }))) === null);
check('a bare SFLFOLD (parameter missing) is not this guard\'s business', guard(file('', 'SFLDROP(CA03)'), file('', 'SFLDROP(CA03)', 'SFLFOLD')) === null);
check('fail-safe on odd models', [undefined, null, {}, { records: null }, { records: [{ name: 'R', keywords: null, fields: null }] }].every((m) => DspfWriter.subfileFoldDropNewConflictReason(null, m) === null));

console.log('\n=== 5. the commit hook (jsdom) ===');
const SOURCE = src(
  dds({ rec: 1, name: 'SFLR', fn: 'SFL' }),
  dds({ ind: '30', name: 'F1', len: 10, type: 'A', usage: 'O', line: 1, pos: 2 }),
  dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ fn: 'SFLDSP' }),
  dds({ rec: 1, name: 'SFLR2', fn: 'SFL' }),
  dds({ name: 'G1', len: 10, type: 'A', usage: 'O', line: 1, pos: 2 }),
  dds({ rec: 1, name: 'CTL2', fn: 'SFLCTL(SFLR2)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ fn: 'SFLDROP(CA03)' })
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
  selectRecord('CTL');
  const m1 = rawAdd('CTL', 'SFLDROP', 'CA03');
  check('raw-adding SFLDROP to the control record of a field-selection subfile is refused, nothing written', /SFLDROP cannot be specified on subfile-control record format CTL: subfile record SFLR uses field selection/.test(m1 || '') && lastText() === null);
  const m2 = rawAdd('CTL', 'SFLRNA');
  check('raw-adding SFLRNA is refused for the same reason (or by I-145\'s SFLINZ rule first)', /SFLRNA cannot be specified/.test(m2 || '') && lastText() === null);
  const m3 = rawAdd('CTL', 'PUTOVR');
  check('an unrelated keyword still goes through on that record', m3 === null && /PUTOVR/.test(lastText() || ''));
  selectRecord('CTL2');
  const m4 = rawAdd('CTL2', 'SFLFOLD', 'CA04');
  check('raw-adding SFLFOLD(CA04) beside SFLDROP(CA03) is refused: same key, nothing written', /must use the same key/.test(m4 || '') && lastText() === null);
  const m5 = rawAdd('CTL2', 'SFLFOLD', 'CA03');
  check('raw-adding SFLFOLD(CA03) beside SFLDROP(CA03) goes through', m5 === null && /SFLFOLD\(CA03\)/.test(lastText() || ''));
  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

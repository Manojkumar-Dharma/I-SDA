/**
 * i157SubfileControlRequiresSflctl.test.js
 *
 * Task I-157 - the finding I-147 deferred: SFLDROP, SFLENTER, SFLFOLD, SFLMODE
 * and SFLRNA (spec entries with onRecordType 'SFLCTL') were accepted on a
 * record with no SFLCTL because they were not in SFLCTL.requiredFor. Each
 * section's wording was re-read first; all five say they are used on the
 * subfile-control record format. The existing I-141 / I-147 dependency check
 * (diff-based, both directions) now covers them.
 *
 * Run with: node src/test/i157SubfileControlRequiresSflctl.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const NORM = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const has = (t) => NORM.indexOf(t) !== -1;
/** The real section: a heading occurrence whose following text contains `must`. */
function section(heading, must) {
  let from = 0;
  for (;;) {
    const at = NORM.indexOf(heading, from);
    if (at < 0) return '';
    const body = NORM.slice(at, at + 1800);
    if (must.test(body)) return body;
    from = at + 1;
  }
}

const FIVE = ['SFLDROP', 'SFLENTER', 'SFLFOLD', 'SFLMODE', 'SFLRNA'];
const KW = { SFLDROP: 'SFLDROP(CF05)', SFLENTER: 'SFLENTER(CF06)', SFLFOLD: 'SFLFOLD(CF05)', SFLMODE: 'SFLMODE(&MODE)', SFLRNA: 'SFLRNA' };

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
const guard = (a, b) => DspfWriter.sflctlDependencyNewConflictReason(parse(a), parse(b));
const reason = (k) => new RegExp(k + ' cannot be specified on record format REC1 without an SFLCTL keyword on the same record format \\(per the DDS Reference\\)');

console.log('=== 1. the facts, against the DDS Reference ===');
['SFLDROP (Subfile Drop)', 'SFLFOLD (Subfile Fold)', 'SFLMODE (Subfile Mode)', 'SFLENTER (Subfile Enter)'].forEach((h) => {
  const body = section(h + ' keyword for display files', /You use this record-level keyword on the subfile-control record format/);
  check(h.split(' ')[0] + ': "You use this record-level keyword on the subfile-control record format"', /^[A-Z]+ \(.*?\) keyword for display files You use this record-level keyword on the subfile-control record format/.test(body));
});
check('SFLENTER also says "valid only for the subfile-control record format"', has('This optional keyword is valid only for the subfile-control record format.'));
check('SFLRNA is used with SFLINZ on the subfile-control record format',
  /^SFLRNA \(Subfile Records Not Active\) keyword for display files You use this record-level keyword with the Subfile Initialize \(SFLINZ\) keyword on the subfile-control record format/.test(
    section('SFLRNA (Subfile Records Not Active) keyword for display files', /with the Subfile Initialize/)));
check('all five spec entries are on the subfile-control record type', FIVE.every((k) => KeywordSpec.RECORD_TYPES[k].onRecordType === 'SFLCTL'));
check('SFLCTL.requiredFor now lists the five, after the eight of I-141 / I-147',
  KeywordSpec.sflctlDependentKeywords().join() === 'SFLCSRRRN,SFLDLT,SFLINZ,SFLPAG,SFLCLR,SFLDSP,SFLDSPCTL,SFLEND,' + FIVE.join());
check('the citation names every one of the five',
  FIVE.every((k) => new RegExp(k).test(KeywordSpec.RECORD_TYPES.SFLCTL.requiredForDdsReference)));
check('every spec keyword whose entry is on the control record is in the list',
  Object.keys(KeywordSpec.RECORD_TYPES).every((k) => KeywordSpec.RECORD_TYPES[k].onRecordType !== 'SFLCTL' || KeywordSpec.sflctlDependentKeywords().indexOf(k) !== -1));
check('SFLMSGRCD (subfile record) is not in the list', KeywordSpec.sflctlDependentKeywords().indexOf('SFLMSGRCD') === -1 && KeywordSpec.RECORD_TYPES.SFLMSGRCD.onRecordType !== 'SFLCTL');

console.log('\n=== 2. the guard ===');
FIVE.forEach((k) => {
  check('adding ' + k + ' to a record with no SFLCTL is refused, with the DDS wording', reason(k).test(guard(rec(), rec(KW[k])) || ''));
  check('adding ' + k + ' to a record that has SFLCTL is accepted', guard(rec('SFLCTL(SFL1)'), rec('SFLCTL(SFL1)', KW[k])) === null);
  check('adding SFLCTL and ' + k + ' together is accepted', guard(rec(), rec('SFLCTL(SFL1)', KW[k])) === null);
  check('removing SFLCTL while ' + k + ' stays is refused', reason(k).test(guard(rec('SFLCTL(SFL1)', KW[k]), rec(KW[k])) || ''));
  check('removing ' + k + ' itself is accepted', guard(rec('SFLCTL(SFL1)', KW[k]), rec('SFLCTL(SFL1)')) === null);
  check('an already-invalid ' + k + ' does not block an unrelated edit', guard(rec(KW[k]), rec(KW[k], 'ALARM')) === null);
});
check('removing SFLCTL with all five present reports a violation', /cannot be specified on record format REC1 without an SFLCTL/.test(guard(rec('SFLCTL(SFL1)', ...FIVE.map((k) => KW[k])), rec(...FIVE.map((k) => KW[k]))) || ''));
check('an option indicator on SFLDROP still counts as the keyword',
  reason('SFLDROP').test(guard(rec(), src(dds({ rec: 1, name: 'REC1' }), dds({ ind: '10', fn: 'SFLDROP(CF05)' }))) || ''));
check('the keywords on different records are judged per record',
  guard(src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'SFLCTL(S1)' }), dds({ rec: 1, name: 'B1' })),
    src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'SFLCTL(S1)' }), dds({ fn: 'SFLMODE(&MODE)' }), dds({ rec: 1, name: 'B1' }))) === null);
check('...and one on the record without SFLCTL is refused',
  /SFLMODE cannot be specified on record format B1 without an SFLCTL/.test(guard(
    src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'SFLCTL(S1)' }), dds({ rec: 1, name: 'B1' })),
    src(dds({ rec: 1, name: 'A1' }), dds({ fn: 'SFLCTL(S1)' }), dds({ rec: 1, name: 'B1' }), dds({ fn: 'SFLMODE(&MODE)' }))) || ''));
check('SFLMSGRCD on a plain record is not this guard\'s business', guard(rec(), rec('SFLMSGRCD(10)')) === null);
check('fail-safe on odd models', [undefined, null, {}, { records: null }, { records: [{ name: 'R', keywords: null }] }].every((m) => DspfWriter.sflctlDependencyNewConflictReason(null, m) === null));
check('the webview commit choke point calls the dependency guard',
  fs.readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8').indexOf('DspfWriter.sflctlDependencyNewConflictReason(model, candidate)') !== -1);

console.log('\n=== 3. the commit hook (jsdom) ===');
const SOURCE = src(
  dds({ rec: 1, name: 'SFL1' }),
  dds({ fn: 'SFL' }),
  dds({ name: 'FLD1', fn: '' }),
  dds({ rec: 1, name: 'CTL1' }),
  dds({ fn: 'SFLCTL(SFL1)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ fn: 'SFLDSP' }),
  dds({ fn: 'SFLMODE(&MODE)' }),
  dds({ rec: 1, name: 'PLAIN1' })
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
  const paramsOf = { SFLDROP: 'CF05', SFLENTER: 'CF06', SFLFOLD: 'CF05', SFLMODE: '&MODE', SFLRNA: '' };
  FIVE.forEach((k) => {
    const msg = rawAdd('PLAIN1', k, paramsOf[k]);
    check('raw-adding ' + k + ' to a record with no SFLCTL is refused, nothing written',
      new RegExp(k + ' cannot be specified on record format PLAIN1 without an SFLCTL').test(msg || '') && lastText() === null);
  });
  selectRecord('CTL1');
  let msg = rawAdd('CTL1', 'SFLENTER', 'CF06');
  check('raw-adding SFLENTER to the SFLCTL record goes through', msg === null && /SFLENTER\(CF06\)/.test(lastText() || ''));
  msg = rawRemove('CTL1', 'SFLCTL');
  check('removing SFLCTL while SFLMODE stays is refused, nothing written',
    /cannot be specified on record format CTL1 without an SFLCTL/.test(msg || '') && lastText() === null);
  msg = rawRemove('CTL1', 'SFLMODE');
  check('removing SFLMODE is accepted', msg === null && lastText() !== null && !/SFLMODE/.test(lastText()));

  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

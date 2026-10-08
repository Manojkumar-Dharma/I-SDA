/**
 * i187MnuKeyNumberClaims.test.js
 *
 * Task I-187 (opened from I-122h). MNUBARSW and MNUCNL each say that, with the keyword on a record, "the
 * CAnn key or default CA10 / CA12 key can be used only as a CA key on other records, not as a CF key", and a
 * file-level MNUBARSW / MNUCNL extends to every record. The CA / CF number guard (I-169) saw only the plain
 * CAnn / CFnn keywords, so the key these two keywords claim (explicit or default) could be reused as a CF key.
 *
 * Covers: 1. the facts against the DDS Reference and the spec  2. the guard (both directions, default keys,
 * the file level, diff semantics, neighbours that stay allowed)  3. the committed-edit hook in jsdom
 *
 * Run with: node src/test/i187MnuKeyNumberClaims.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const RAWREF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const REF = RAWREF.replace(/\f/g, ' ').replace(/\s+/g, ' ').replace(/- /g, '-');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
// A record line plus one keyword line per extra keyword (the first keyword sits on the R line).
const R = (name, ...fns) => [dds({ t: 'R', name, fn: fns[0] })].concat(fns.slice(1).map((f) => dds({ fn: f }))).join('\n');
const K = (fn) => dds({ fn });
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.commandKeyNumberNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');


console.log('=== 1. the facts, against the DDS Reference ===');
check('MNUBARSW: "CAnn key or default CA10 key can be used only as a CA key on other records, not as a CF key"', has('If the MNUBARSW keyword is specified on the record, the CAnn key or default CA10 key can be used only as a CA key on other records, not as a CF key.'));
check('MNUCNL: "CAnn key or default CA12 key can be used only as a CA key on other records, not as a CF key"', has('If the MNUCNL keyword is specified on the record, the CAnn key or default CA12 key can be used only as a CA key on other records, not as a CF key.'));
check('both sections: the file-level keyword extends to all records', has('Because MNUBARSW at the file level extends to all records in the file') && has('Because MNUCNL at the file-level extends to all records in the file'));
check('the spec records the rule on both entries with file scope', ['MNUBARSW', 'MNUCNL'].every((n) => KeywordSpec.RECORD_TYPES[n].sameKeyNumberAsOtherType === 'notAllowed' && KeywordSpec.RECORD_TYPES[n].sameKeyNumberScope === 'file'));
const cl = (n, p) => KeywordSpec.commandKeyNumberClaim(n, p);
check('commandKeyNumberClaim: MNUBARSW with no parameter claims CA10, MNUCNL CA12 (the defaults)', cl('MNUBARSW', '').type === 'CA' && cl('MNUBARSW', '').number === '10' && cl('MNUCNL', undefined).number === '12' && cl('MNUCNL', '   ').type === 'CA');
check('commandKeyNumberClaim: an explicit key wins over the default, and MNUCNL\'s response indicator is ignored', cl('MNUBARSW', 'CA05').number === '05' && cl('mnucnl', 'ca07 12').number === '07' && cl('MNUCNL', 'CA07 12').scope === 'file');
check('commandKeyNumberClaim: plain CAnn / CFnn answer as commandKeyNumberClash does', cl('CA03', '').other === 'CF' && cl('CF24', '').other === 'CA');
check('commandKeyNumberClaim: out-of-range, CF-typed and unrelated names claim nothing', [['MNUBARSW', 'CA25'], ['MNUBARSW', 'CA00'], ['MNUBARSW', 'CF05'], ['MNUCNL', 'CF12'], ['MNUBARSW', 'junk'], ['SFLDROP', 'CA05'], ['ALTHELP', ''], ['CLEAR', ''], [undefined, ''], [null, null]].every((a) => cl(a[0], a[1]) === null));

console.log('\n=== 2. commandKeyNumberNewConflictReason ===');
let r;
r = guard(src(R('REC1'), R('REC2')), src(R('REC1', 'MNUBARSW(CA10)'), R('REC2', 'CF10')));
check('MNUBARSW(CA10) on one record, CF10 on another: refused, naming both places', say(/CA10 and CF10 cannot both be specified in the same display file \(CA10 is on record format REC1, CF10 on record format REC2\)/, r));
check('the message cites the DDS Reference', say(/per the DDS Reference/, r));
check('adding CF10 to a record when another record has MNUBARSW(CA10) is refused', say(/CA10 and CF10/, guard(src(R('REC1', 'MNUBARSW(CA10)'), R('REC2')), src(R('REC1', 'MNUBARSW(CA10)'), R('REC2', 'CF10')))));
check('adding MNUBARSW(CA10) when another record has CF10 is refused (the other direction)', say(/CA10 and CF10/, guard(src(R('REC1'), R('REC2', 'CF10')), src(R('REC1', 'MNUBARSW(CA10)'), R('REC2', 'CF10')))));
check('a default MNUBARSW (CA10) with CF10 on the same record: refused', say(/CA10 and CF10/, guard(src(R('REC1', 'CF10')), src(R('REC1', 'CF10'), K('MNUBARSW')))) || say(/CA10 and CF10/, guard(src(R('REC1', 'CF10')), src(R('REC1', 'CF10', 'MNUBARSW')))));
check('a default MNUBARSW added to a record that already has CF10: refused', say(/CA10 and CF10/, guard(src(R('REC1', 'CF10')), src(R('REC1', 'CF10'), K('MNUBARSW')))));
check('a default MNUCNL (CA12) at record level with a file-level CF12: refused', say(/CA12 and CF12 .*file level/, guard(src(K('CF12'), R('REC1')), src(K('CF12'), R('REC1', 'MNUCNL')))));
check('a file-level MNUCNL(CA07 12) with CF07 on a record: refused (file level extends to every record)', say(/CA07 and CF07 .*file level/, guard(src(R('REC1', 'CF07')), src(K('MNUCNL(CA07 12)'), R('REC1', 'CF07')))));
check('a file-level default MNUBARSW with CF10 added to a record: refused', say(/CA10 and CF10/, guard(src(K('MNUBARSW'), R('REC1')), src(K('MNUBARSW'), R('REC1', 'CF10')))));
check('the explicit key is what counts: MNUBARSW(CA05) refuses CF05 but not CF10', say(/CA05 and CF05/, guard(src(R('REC1', 'MNUBARSW(CA05)')), src(R('REC1', 'MNUBARSW(CA05)', 'CF05')))) && guard(src(R('REC1', 'MNUBARSW(CA05)')), src(R('REC1', 'MNUBARSW(CA05)', 'CF10'))) === null);
check('lower-case keyword and key are matched too', say(/CA05 and CF05/, guard(src(R('REC1', 'mnubarsw(ca05)')), src(R('REC1', 'mnubarsw(ca05)', 'CF05')))));
check('changing MNUBARSW(CA05) to MNUBARSW(CA06) when CF06 exists is refused', say(/CA06 and CF06/, guard(src(R('REC1', 'MNUBARSW(CA05)', 'CF06')), src(R('REC1', 'MNUBARSW(CA06)', 'CF06')))));

console.log('  -- neighbours that stay allowed');
check('MNUBARSW(CA10) with CA10 elsewhere: same type, not this rule', guard(src(R('REC1', 'MNUBARSW(CA10)'), R('REC2')), src(R('REC1', 'MNUBARSW(CA10)'), R('REC2', 'CA10'))) === null);
check('MNUBARSW and MNUCNL on different keys with CF on a third number', guard(src(R('REC1', 'MNUBARSW(CA10)', 'MNUCNL(CA12)')), src(R('REC1', 'MNUBARSW(CA10)', 'MNUCNL(CA12)', 'CF11'))) === null);
check('default MNUBARSW (CA10) beside CF12 (MNUCNL\'s number, no MNUCNL present) is allowed', guard(src(R('REC1', 'MNUBARSW')), src(R('REC1', 'MNUBARSW', 'CF12'))) === null);
check('a CF-typed or out-of-range parameter claims nothing here (I-186 reports it)', guard(src(R('REC1', 'CF05')), src(R('REC1', 'CF05', 'MNUBARSW(CF05)'))) === null && guard(src(R('REC1', 'CF25')), src(R('REC1', 'CF25', 'MNUBARSW(CA25)'))) === null);
check('plain CA / CF behaviour (I-169) is unchanged', say(/CA03 and CF03/, guard(src(K('CA03'), R('REC1')), src(K('CA03'), R('REC1', 'CF03')))) && guard(src(K('CA03'), R('REC1')), src(K('CA03'), R('REC1', 'CF04'))) === null);

console.log('  -- removal and diff semantics');
check('removing the MNUBARSW (or the CF key) is always accepted', guard(src(R('REC1', 'MNUBARSW(CA10)', 'CF10')), src(R('REC1', 'CF10'))) === null && guard(src(R('REC1', 'MNUBARSW(CA10)', 'CF10')), src(R('REC1', 'MNUBARSW(CA10)'))) === null);
check('an already-clashing hand-written file does not block an unrelated edit', guard(src(R('REC1', 'MNUBARSW(CA10)', 'CF10')), src(K('CA04'), R('REC1', 'MNUBARSW(CA10)', 'CF10'))) === null);
check('a second, new clash is still reported', say(/CA12 and CF12/, guard(src(R('REC1', 'MNUBARSW(CA10)', 'CF10')), src(R('REC1', 'MNUBARSW(CA10)', 'CF10', 'MNUCNL(CA12)', 'CF12')))));
check('fail-safe: null / empty keyword lists give null', [{ records: [{ name: 'R', keywords: [{ name: 'MNUBARSW' }] }] }, { fileKeywords: [{ name: 'MNUCNL', parameters: null }], records: null }].every((m) => DspfWriter.commandKeyNumberNewConflictReason(null, m) === null));

console.log('\n=== 3. the committed-edit hook (jsdom) ===');
const SOURCE = src(K('MNUBARSW'), R('REC1'), R('REC2', 'CF12'), R('BAR', 'MNUBAR')); // I-196: MNUBARSW / MNUCNL need a menu-bar record in the file
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
  function withAlert(fn) {
    const orig = dom.window.alert; let msg = null;
    dom.window.alert = (m) => { msg = m; }; fn(); dom.window.alert = orig; return msg;
  }
  const lastEdit = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e && parse(e.text); };
  function selectRecord(name) { const sel = doc.getElementById('recordSelect'); sel.value = name; fire(sel); }
  function rawAddRecord(record, name, params) {
    doc.getElementById('record-' + record + '-new-kw-name').value = name;
    const p = doc.getElementById('record-' + record + '-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="record-' + record + '"]'), 'click'));
  }
  function rawAddFile(name, params) {
    doc.getElementById('file-new-kw-name').value = name;
    const p = doc.getElementById('file-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="file"]'), 'click'));
  }

  console.log('  -- record raw keyword editor');
  selectRecord('REC1');
  let msg = rawAddRecord('REC1', 'CF10');
  check('adding CF10 to a record when the file has a default MNUBARSW is refused with the DDS wording', say(/CA10 and CF10 cannot both be specified in the same display file/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'MNUCNL');
  check('adding a default MNUCNL (CA12) when another record has CF12 is refused', say(/CA12 and CF12/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'CF11');
  const r1 = lastEdit() && lastEdit().records.find((x) => x.name === 'REC1');
  check('adding CF11 (a number nobody claims as CA) is accepted, no alert', msg === null && !!r1 && r1.keywords.some((k) => k.name === 'CF11'));

  console.log('  -- file raw keyword editor');
  fire(doc.getElementById('crumb-file'), 'click');
  msg = rawAddFile('CF10');
  check('adding CF10 at file level when the file has a default MNUBARSW is refused', say(/CA10 and CF10/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('MNUCNL', 'CA11');
  check('adding file-level MNUCNL(CA11) when REC1 has CF11 is refused', say(/CA11 and CF11/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('MNUCNL', 'CA13');
  check('adding file-level MNUCNL(CA13) (no CF13 anywhere) is accepted', msg === null && !!lastEdit() && lastEdit().fileKeywords.some((k) => k.name === 'MNUCNL'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

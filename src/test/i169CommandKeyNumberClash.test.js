/**
 * i169CommandKeyNumberClash.test.js
 *
 * Task I-169 (opened from the I-160 deferred finding). The CAnn and CFnn sections each say a key
 * number cannot be both a command attention and a command function key - "CA02 and CF02 are not
 * valid in the same display file" - and that file-level keys extend to the record level. The
 * stated scope is the whole display file, so a clash is refused at file level versus record, on
 * one record, and between two different records.
 *
 * Covers: 1. the facts against the DDS Reference text  2. the guard (both directions, diff
 * semantics, neighbours that stay allowed)  3. the committed-edit hook in jsdom (file and
 * record raw keyword editors)
 *
 * Run with: node src/test/i169CommandKeyNumberClash.test.js
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
const R = (name, fn) => dds({ t: 'R', name, fn });
const K = (fn) => dds({ fn });
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.commandKeyNumberNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');

console.log('=== 1. the facts, against the DDS Reference ===');
check('CAnn: "CA02 and CF02 are not valid in the same display file"', has('you cannot specify the same key number as both CA and CF keys. For example, CA02 and CF02 are not valid in the same display file.'));
check('CFnn: "CA01 and CF01 are not valid in the same display file"', has('you cannot specify the same key number as both command attention and command function. For example, CA01 and CF01 are not valid in the same display file.'));
check('both sections: file-level keys extend to the record level (CA02 file + CF02 record is an error)', (REF.match(/File level CA and CF keys are extended to the record level/g) || []).length === 2);
check('the spec records the rule on both entries with file scope', ['CA01-CA24', 'CF01-CF24'].every((n) => KeywordSpec.RECORD_TYPES[n].sameKeyNumberAsOtherType === 'notAllowed' && KeywordSpec.RECORD_TYPES[n].sameKeyNumberScope === 'file'));
check('commandKeyNumberClash: CA03 pairs with CF, CF24 with CA', KeywordSpec.commandKeyNumberClash('CA03').other === 'CF' && KeywordSpec.commandKeyNumberClash('CF24').other === 'CA' && KeywordSpec.commandKeyNumberClash('CA03').number === '03');
check('commandKeyNumberClash: not a key (CA00, CA25, CA3, CLEAR, SFLDROP, junk) gives null', ['CA00', 'CA25', 'CA3', 'CLEAR', 'SFLDROP', '', undefined, null].every((t) => KeywordSpec.commandKeyNumberClash(t) === null));

console.log('\n=== 2. commandKeyNumberNewConflictReason ===');
let r;
r = guard(src(R('REC1')), src(K('CA03'), R('REC1', 'CF03')));
check('CA03 at file level, then CF03 on a record: refused, naming both places', say(/CA03 and CF03 cannot both be specified in the same display file \(CA03 is on the file level, CF03 on record format REC1\)/, r));
check('the message cites the DDS Reference', say(/per the DDS Reference/, r));
check('(the I-160 probe) adding CF03 to a record when the file has CA03 is refused', say(/CA03 and CF03/, guard(src(K('CA03'), R('REC1')), src(K('CA03'), R('REC1', 'CF03')))));
check('adding CA03 at file level when a record has CF03 is refused (the other direction)', say(/CA03 and CF03/, guard(src(R('REC1', 'CF03')), src(K('CA03'), R('REC1', 'CF03')))));
check('CA05 and CF05 on the same record: refused', say(/CA05 and CF05/, guard(src(R('REC1', 'CA05')), src(R('REC1', 'CA05'), K('CF05')))));
check('both at the file level: refused', say(/CA05 and CF05 .*file level.*file level/, guard(src(K('CA05'), R('REC1')), src(K('CA05'), K('CF05'), R('REC1')))));
check('CA03 on one record and CF03 on another: refused (the section says "in the same display file")', say(/CA03 is on record format REC1, CF03 on record format REC2/, guard(src(R('REC1', 'CA03'), R('REC2')), src(R('REC1', 'CA03'), R('REC2', 'CF03')))));
check('the two-digit form: CA10 / CF10 refused, CA01 / CF01 refused', say(/CA10 and CF10/, guard(src(K('CA10'), R('REC1')), src(K('CA10'), R('REC1', 'CF10')))) && say(/CA01 and CF01/, guard(src(K('CF01'), R('REC1')), src(K('CF01'), R('REC1', 'CA01')))));
check('lower-case keyword names are matched too', say(/CA03 and CF03/, guard(src(K('CA03'), R('REC1')), src(K('CA03'), R('REC1', 'cf03')))));

console.log('  -- neighbours that stay allowed');
check('different key numbers: CA03 and CF04 together', guard(src(R('REC1', 'CA03')), src(R('REC1', 'CA03'), K('CF04'))) === null);
check('the same type twice is not this rule: CA03 at file level and CA03 on a record', guard(src(K('CA03'), R('REC1')), src(K('CA03'), R('REC1', 'CA03'))) === null);
check('CA and CF with different numbers across records', guard(src(R('REC1', 'CA03'), R('REC2')), src(R('REC1', 'CA03'), R('REC2', 'CF05'))) === null);
check('other keywords that merely name a key are not CA / CF keys: SFLDROP(CF03) beside CA03', guard(src(K('CA03'), R('REC1')), src(K('CA03'), R('REC1', 'SFLDROP(CF03)'))) === null);
check('CLEAR, HELP and friends are never confused with a key number', guard(src(K('CA03'), R('REC1')), src(K('CA03'), R('REC1', 'CLEAR'))) === null);

console.log('  -- removal and diff semantics');
check('removing one of the clashing keys is always accepted', guard(src(K('CA03'), R('REC1', 'CF03')), src(K('CA03'), R('REC1'))) === null);
check('an already-clashing hand-written file does not block an unrelated edit', guard(src(K('CA03'), R('REC1', 'CF03')), src(K('CA03'), K('CA04'), R('REC1', 'CF03'))) === null);
check('moving the clash to another record is not a new violation (same key number, still one clash)', guard(src(K('CA03'), R('REC1', 'CF03'), R('REC2')), src(K('CA03'), R('REC1'), R('REC2', 'CF03'))) === null);
r = guard(src(K('CA03'), R('REC1', 'CF03')), src(K('CA03'), K('CA07'), R('REC1', 'CF03', 'CF07')));
r = guard(src(K('CA03'), R('REC1', 'CF03')), src(K('CA03'), R('REC1', 'CF03'), K('CA07'), R('REC2', 'CF07')));
check('but a second, new clash (CA07 / CF07) is still reported', say(/CA07 and CF07/, r));
check('fail-safe: null / empty / odd models give null', [undefined, null, {}, { records: null }, { fileKeywords: null, records: [{ name: 'R', keywords: null }] }].every((m) => DspfWriter.commandKeyNumberNewConflictReason(null, m) === null));

console.log('\n=== 3. the committed-edit hook (jsdom) ===');
const SOURCE = src(K('CA03'), R('REC1'), R('REC2', 'CF05'));
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
  function rawAddRecord(record, name) {
    doc.getElementById('record-' + record + '-new-kw-name').value = name;
    const p = doc.getElementById('record-' + record + '-new-kw-params'); if (p) p.value = '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="record-' + record + '"]'), 'click'));
  }
  function rawAddFile(name) {
    doc.getElementById('file-new-kw-name').value = name;
    const p = doc.getElementById('file-new-kw-params'); if (p) p.value = '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="file"]'), 'click'));
  }

  console.log('  -- record raw keyword editor');
  selectRecord('REC1');
  let msg = rawAddRecord('REC1', 'CF03');
  check('adding CF03 to a record when the file has CA03 is refused with the DDS wording', say(/CA03 and CF03 cannot both be specified in the same display file/, msg));
  check('and nothing was posted', !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'CA05');
  check('adding CA05 to a record when another record has CF05 is refused (same display file)', say(/CA05 and CF05/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'CF04');
  const r1 = lastEdit() && lastEdit().records.find((x) => x.name === 'REC1');
  check('adding CF04 (a number nobody uses as CA) is accepted, no alert', msg === null && !!r1 && r1.keywords.some((k) => k.name === 'CF04'));

  console.log('  -- file raw keyword editor');
  fire(doc.getElementById('crumb-file'), 'click');
  msg = rawAddFile('CA04');
  check('adding CA04 at file level when REC1 has CF04 is refused', say(/CA04 and CF04/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('CF03');
  check('adding CF03 at file level when the file has CA03 is refused', say(/CA03 and CF03/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('CA06');
  check('adding CA06 at file level (no CF06 anywhere) is accepted', msg === null && !!lastEdit() && lastEdit().fileKeywords.some((k) => k.name === 'CA06'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

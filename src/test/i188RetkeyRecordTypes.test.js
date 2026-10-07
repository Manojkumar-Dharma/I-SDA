/**
 * i188RetkeyRecordTypes.test.js
 *
 * Task I-188 (opened from I-122h). The DDS Reference's "Considerations for specifying RETKEY and RETCMDKEY
 * keywords" say "Neither keyword is allowed on a subfile format (SFL keyword) or on a user-defined record (USRDFN
 * keyword)". The spec records it (notOnRecordTypes) but retKeyViolations never read it, so RETKEY / RETCMDKEY
 * on an SFL or USRDFN record was accepted.
 *
 * Covers: 1. the facts against the DDS Reference and the spec  2. the guard (both directions, both keywords,
 * both record types, diff semantics, neighbours that stay allowed)  3. the committed-edit hook in jsdom
 *
 * Run with: node src/test/i188RetkeyRecordTypes.test.js
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
check('the Reference: "Neither keyword is allowed on a subfile format (SFL keyword) or on a user-defined record (USRDFN keyword)"', has('Neither keyword is allowed on a subfile format (SFL keyword) or on a user-defined record (USRDFN keyword).'));
check('the spec records SFL and USRDFN for both keywords', ['RETKEY', 'RETCMDKEY'].every((n) => KeywordSpec.notOnRecordTypes(n).join() === 'SFL,USRDFN'));

console.log('\n=== 2. retKeyNewConflictReason ===');
const IN = K('INDARA');
const rk = (a, b) => DspfWriter.retKeyNewConflictReason(parse(a), parse(b));
const SFLMSG = (n, rec) => new RegExp('^' + n + ' cannot be specified on a subfile \\(SFL\\) record format \\(' + rec + '\\) \\(per the DDS Reference\\)\\.$');
const USRMSG = (n, rec) => new RegExp('^' + n + ' cannot be specified on a user-defined \\(USRDFN\\) record format \\(' + rec + '\\) \\(per the DDS Reference\\)\\.$');
['RETKEY', 'RETCMDKEY'].forEach((n) => {
  check(n + ' added to an SFL record: refused with the reference wording', say(SFLMSG(n, 'REC1'), rk(src(IN, R('REC1', 'SFL')), src(IN, R('REC1', 'SFL', n)))));
  check(n + ' added to a USRDFN record: refused', say(USRMSG(n, 'REC1'), rk(src(IN, R('REC1', 'USRDFN')), src(IN, R('REC1', 'USRDFN', n)))));
  check('SFL added to a record that has ' + n + ' (the other direction): refused', say(SFLMSG(n, 'REC1'), rk(src(IN, R('REC1', n)), src(IN, R('REC1', n, 'SFL')))));
  check('USRDFN added to a record that has ' + n + ': refused', say(USRMSG(n, 'REC1'), rk(src(IN, R('REC1', n)), src(IN, R('REC1', n, 'USRDFN')))));
  check(n + ' on an ordinary record in a file that also has an SFL record elsewhere: accepted', rk(src(IN, R('REC1', 'SFL'), R('REC2')), src(IN, R('REC1', 'SFL'), R('REC2', n))) === null);
  check(n + ' on a SFLCTL record is not a record-type clash of this rule', rk(src(IN, R('REC1', 'SFLCTL')), src(IN, R('REC1', 'SFLCTL', n))) === null);
  check('lower-case ' + n.toLowerCase() + ' / sfl are matched too', say(SFLMSG(n, 'REC1'), rk(src(IN, R('REC1', 'sfl')), src(IN, R('REC1', 'sfl', n.toLowerCase())))) || say(/cannot be specified on a subfile/i, rk(src(IN, R('REC1', 'sfl')), src(IN, R('REC1', 'sfl', n.toLowerCase())))));
  check('removing ' + n + ' or the record type is never blocked, and an existing clash is not re-reported',
    rk(src(IN, R('REC1', 'SFL', n)), src(IN, R('REC1', 'SFL'))) === null &&
    rk(src(IN, R('REC1', 'SFL', n)), src(IN, R('REC1', n))) === null &&
    rk(src(IN, R('REC1', 'SFL', n)), src(IN, R('REC1', 'SFL', n), K('TEXT'))) === null);
});
check('a record with both SFL and USRDFN reports a violation for each type (two distinct problems)', (() => {
  const a = rk(src(IN, R('REC1', 'RETKEY')), src(IN, R('REC1', 'RETKEY', 'SFL')));
  const b = rk(src(IN, R('REC1', 'RETKEY', 'SFL')), src(IN, R('REC1', 'RETKEY', 'SFL', 'USRDFN')));
  return say(/subfile \(SFL\)/, a) && say(/user-defined \(USRDFN\)/, b);
})());
check('the existing rules still answer: RETKEY on a record in a file without INDARA', say(/requires the file to specify INDARA/, rk(src(R('REC1')), src(R('REC1', 'RETKEY')))));
check('RETKEY on an ordinary record in an INDARA file is still accepted', rk(src(IN, R('REC1')), src(IN, R('REC1', 'RETKEY'))) === null);
check('fail-safe: null / empty models give null', DspfWriter.retKeyNewConflictReason(null, null) === null && DspfWriter.retKeyNewConflictReason({ records: [{ name: 'R', keywords: [{ name: 'RETKEY' }] }] }, { fileKeywords: [{ name: 'INDARA' }], records: null }) === null);

console.log('\n=== 3. the committed-edit hook (jsdom) ===');
const SOURCE = src(IN, R('REC1', 'SFL'), R('REC2', 'USRDFN'), R('REC3'));
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
  selectRecord('REC1');
  let msg = rawAddRecord('REC1', 'RETKEY');
  // Adding the keyword to an SFL / USRDFN record is also stopped earlier by the raw editor's own record-type whitelist
  // (its message differs); the new guard is what stops the other direction and every path that skips the whitelist.
  check('raw editor: RETKEY on the SFL record is refused (record-type whitelist), nothing posted', say(/RETKEY cannot be added to a subfile \(SFL\) record format/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'RETCMDKEY');
  check('raw editor: RETCMDKEY on the SFL record is refused (record-type whitelist)', say(/RETCMDKEY cannot be added to a subfile/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  selectRecord('REC2');
  msg = rawAddRecord('REC2', 'RETKEY');
  check('raw editor: RETKEY on the USRDFN record is refused (record-type whitelist)', say(/RETKEY cannot be added to a user-defined/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  selectRecord('REC3');
  msg = rawAddRecord('REC3', 'RETKEY');
  const r3 = lastEdit() && lastEdit().records.find((x) => x.name === 'REC3');
  check('raw editor: RETKEY on an ordinary record in an INDARA file is accepted, no alert', msg === null && !!r3 && r3.keywords.some((k) => k.name === 'RETKEY'));
  msg = rawAddRecord('REC3', 'SFL');
  check('raw editor (the other direction): SFL added to the record that now has RETKEY is refused', say(/RETKEY cannot be specified on a subfile \(SFL\) record format \(REC3\)/, msg) && !posted.some((m) => m.type === 'applyEdit'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

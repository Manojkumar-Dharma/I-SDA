/**
 * i196MenuBarRecordRequired.test.js
 *
 * Task I-196 (opened from I-189). MNUBARSW's and MNUCNL's own sections end "The MNUBARSW / MNUCNL keyword is
 * allowed only in a file containing a menu-bar record". I-189 recorded it as requiresMenuBarRecordInFile in both
 * spec entries, but no guard read it. DspfWriter.menuBarRecordRequiredNewConflictReason now does, diff-based, from
 * either side (adding the keyword to a file with no menu-bar record; removing or retyping the last menu-bar record).
 *
 * Covers: 1. the facts against the DDS Reference and the spec  2. the guard (both keywords, both levels, both
 * directions, diff semantics, neighbours that stay allowed)  3. the committed-edit hook in jsdom
 *
 * Run with: node src/test/i196MenuBarRecordRequired.test.js
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
const g = (a, b) => DspfWriter.menuBarRecordRequiredNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');
const MSG = (n) => new RegExp('^' + n + ' (on record format \\w+ )?is allowed only in a file containing a menu-bar record \\(a record format with MNUBAR\\); this file has none \\(per the DDS Reference\\)\\.$');

console.log('=== 1. the facts, against the DDS Reference ===');
check('the Reference: "The MNUBARSW keyword is allowed only in a file containing a menu-bar record."', has('The MNUBARSW keyword is allowed only in a file containing a menu-bar record.'));
check('the Reference: "The MNUCNL keyword is allowed only in a file containing a menu-bar record."', has('The MNUCNL keyword is allowed only in a file containing a menu-bar record.'));
check('the spec accessor names exactly MNUBARSW and MNUCNL', KeywordSpec.requiresMenuBarRecordInFile().slice().sort().join() === 'MNUBARSW,MNUCNL');

console.log('\n=== 2. menuBarRecordRequiredNewConflictReason ===');
['MNUBARSW', 'MNUCNL'].forEach((n) => {
  check(n + ' added to a record in a file with no menu-bar record: refused with the reference wording', say(MSG(n), g(src(R('REC1')), src(R('REC1', n)))));
  check(n + ' added at file level in a file with no menu-bar record: refused', say(MSG(n), g(src(R('REC1')), src(K(n), R('REC1')))));
  check(n + ' with a parameter (CA05) is judged the same way', say(MSG(n), g(src(R('REC1')), src(R('REC1', n + '(CA05)')))));
  check(n + ' added in a file that has a menu-bar record: accepted', g(src(R('REC1'), R('BAR', 'MNUBAR')), src(R('REC1', n), R('BAR', 'MNUBAR'))) === null);
  check(n + ' added at file level in a file that has a menu-bar record: accepted', g(src(R('REC1'), R('BAR', 'MNUBAR')), src(K(n), R('REC1'), R('BAR', 'MNUBAR'))) === null);
  check(n + ' and the MNUBAR record added in the same edit: accepted (the file ends up valid)', g(src(R('REC1')), src(R('REC1', n, 'MNUBAR'))) === null);
  check('the last MNUBAR record removed while ' + n + ' remains (the other direction): refused', say(MSG(n), g(src(R('REC1', n), R('BAR', 'MNUBAR')), src(R('REC1', n), R('BAR')))));
  check('the last MNUBAR record removed while file-level ' + n + ' remains: refused', say(MSG(n), g(src(K(n), R('BAR', 'MNUBAR')), src(K(n), R('BAR')))));
  check('one of two MNUBAR records removed: accepted (a menu-bar record is still in the file)', g(src(R('REC1', n), R('BAR1', 'MNUBAR'), R('BAR2', 'MNUBAR')), src(R('REC1', n), R('BAR1', 'MNUBAR'), R('BAR2'))) === null);
  check('removing ' + n + ' is never blocked, and an existing violation is not re-reported',
    g(src(R('REC1', n)), src(R('REC1'))) === null &&
    g(src(R('REC1', n)), src(R('REC1', n), K('TEXT'))) === null &&
    g(src(K(n), R('REC1')), src(K(n), R('REC1'), R('REC2'))) === null);
  check('lower-case ' + n.toLowerCase() + ' is matched too', say(MSG(n), g(src(R('REC1')), src(R('REC1', n.toLowerCase())))) || say(/allowed only in a file containing a menu-bar record/i, g(src(R('REC1')), src(R('REC1', n.toLowerCase())))));
});
check('the reason names the record when the keyword is on a record', say(/^MNUBARSW on record format REC1 is allowed only/, g(src(R('REC1')), src(R('REC1', 'MNUBARSW')))));
check('the reason does not name a record at file level', say(/^MNUCNL is allowed only/, g(src(R('REC1')), src(K('MNUCNL'), R('REC1')))));
check('files with neither keyword are never blocked, with or without a menu-bar record', g(src(R('REC1')), src(R('REC1'), K('TEXT'))) === null && g(src(R('BAR', 'MNUBAR')), src(R('BAR'))) === null);
check('a retyped record: the last MNUBAR keyword turned into something else while MNUBARSW remains is refused', say(MSG('MNUBARSW'), g(src(R('REC1', 'MNUBARSW'), R('BAR', 'MNUBAR')), src(R('REC1', 'MNUBARSW'), R('BAR', 'USRDFN')))));
check('fail-safe: null models give null; a file-level keyword over a model with no records is judged', DspfWriter.menuBarRecordRequiredNewConflictReason(null, null) === null && DspfWriter.menuBarRecordRequiredNewConflictReason({ records: [] }, { fileKeywords: [{ name: 'MNUBARSW' }], records: null }) !== null);

console.log('\n=== 3. the committed-edit hook (jsdom) ===');
const SOURCE = src(R('REC1'), R('REC2'));
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
  let msg = rawAddRecord('REC1', 'MNUBARSW');
  check('raw editor: MNUBARSW on a record in a file with no menu-bar record is refused with the new reason, nothing posted',
    say(/^MNUBARSW on record format REC1 is allowed only in a file containing a menu-bar record/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'MNUCNL');
  check('raw editor: MNUCNL likewise', say(/^MNUCNL on record format REC1 is allowed only in a file containing a menu-bar record/, msg) && !posted.some((m) => m.type === 'applyEdit'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

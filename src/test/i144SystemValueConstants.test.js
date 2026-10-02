/**
 * i144SystemValueConstants.test.js
 *
 * Task I-144 - found by the I-121m probe and an engine measurement.
 *  (1) DATE / TIME / USER / SYSNAME: "Positions 17 through 38 must be blank" (an
 *      unnamed constant) - the raw editor accepted them on a named field.
 *  (2) TIME / USER / SYSNAME / NOCCSID "have no parameters" and DATE's
 *      parameters are [*JOB|*SYS] [*Y|*YY] - none of it was checked.
 *  (3) The preview gave every system-value constant length 1, so it was drawn
 *      one column wide and every later relatively-positioned field shifted.
 *
 * Run with: node src/test/i144SystemValueConstants.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.rel !== undefined) put(42, '+' + String(o.rel).padStart(2));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const parse = (text) => DspfParser.parseDspf(text);
const guard = (a, b) => DspfWriter.systemValueKeywordNewConflictReason(parse(a), parse(b));

console.log('=== 1. spec facts ===');
check('USER 10, SYSNAME 8, TIME 8 (default edit word), DATE 6 by default',
  KeywordSpec.systemValueConstantWidth('USER') === 10 && KeywordSpec.systemValueConstantWidth('SYSNAME') === 8 &&
  KeywordSpec.systemValueConstantWidth('TIME') === 8 && KeywordSpec.systemValueConstantWidth('DATE') === 6);
check('DATE: *YY 8, EDTCDE(Y) adds the two separators (8, and 10 with *YY)',
  KeywordSpec.systemValueConstantWidth('DATE', { dateParameters: '*SYS *YY' }) === 8 &&
  KeywordSpec.systemValueConstantWidth('DATE', { editCode: 'Y' }) === 8 &&
  KeywordSpec.systemValueConstantWidth('DATE', { dateParameters: '*YY', editCode: 'y' }) === 10 &&
  KeywordSpec.systemValueConstantWidth('DATE', { dateParameters: '*JOB *Y' }) === 6);
check('an EDTWRD template replaces DATE and TIME widths, not USER / SYSNAME',
  KeywordSpec.systemValueConstantWidth('DATE', { editWordWidth: 12 }) === 12 && KeywordSpec.systemValueConstantWidth('TIME', { editWordWidth: 22 }) === 22 &&
  KeywordSpec.systemValueConstantWidth('USER', { editWordWidth: 99 }) === 10);
check('null for MSGCON, other keywords and non-strings', ['MSGCON', 'DUP', '', null, undefined, 7].every((n) => KeywordSpec.systemValueConstantWidth(n) === null));
check('the TIME default edit word is the one the reference states', REF.indexOf("The edit word '0_:__:__' (_ represents a blank) is assumed for a TIME field") >= 0 && KeywordSpec.RECORD_TYPES.TIME.displayWidth.defaultEditWord === '0_:__:__');
check('the DATE example the figures come from is in the reference', REF.indexOf('mmddyy to mm/dd/yy') >= 0 && REF.indexOf('If you specify *Y, 2 digits are used') >= 0 && REF.indexOf('If you specify *YY, 4 digits are used') >= 0);
check('USER is 10 and SYSNAME 8 in their sections', REF.indexOf('that is 10 characters long') >= 0 && REF.indexOf('that is 8 characters long') >= 0);
check('the no-parameter field keywords are TIME, USER, SYSNAME, NOCCSID (not the record-level ones)', KeywordSpec.fieldKeywordsWithoutParameters().join() === 'TIME,USER,SYSNAME,NOCCSID');
check('...and the accessor returns a fresh array', (() => { const a = KeywordSpec.fieldKeywordsWithoutParameters(); a.push('X'); return KeywordSpec.fieldKeywordsWithoutParameters().length === 4; })());

console.log('\n=== 2. the preview: width and relative positions ===');
function screenOf(text) { return DspfEngine.resolveScreen(parse(text), 'S', new Set()); }
function lenOf(fn, extra) {
  const text = src(dds({ rec: 1, name: 'S' }), dds({ line: 1, pos: 2, fn }), extra || '');
  return screenOf(text).fields.find((f) => f.nameType === 'CONSTANT').length;
}
check('USER previews 10 columns wide (was 1)', lenOf('USER') === 10);
check('SYSNAME 8', lenOf('SYSNAME') === 8);
check('TIME 8', lenOf('TIME') === 8);
check('DATE 6; DATE(*SYS *YY) 8; DATE with EDTCDE(Y) 8', lenOf('DATE') === 6 && lenOf('DATE(*SYS *YY)') === 8 && lenOf('DATE EDTCDE(Y)') === 8);
{
  const text = src(dds({ rec: 1, name: 'S' }), dds({ line: 1, pos: 2, fn: 'DATE(*YY)' }), dds({ fn: 'EDTCDE(Y)' }));
  check('DATE(*YY) + EDTCDE(Y) on the continuation line is 10', screenOf(text).fields.find((f) => f.nameType === 'CONSTANT').length === 10);
}
check('an EDTWRD template still wins (the existing rule)', lenOf('DATE', '') !== null && (() => {
  const text = src(dds({ rec: 1, name: 'S' }), dds({ line: 1, pos: 2, fn: "EDTWRD('  /  /  ')" }), dds({ fn: 'DATE' }));
  return screenOf(text).fields.find((f) => f.nameType === 'CONSTANT').length === 8;
})());
check('a literal constant is unchanged (its text length)', (() => {
  const text = src(dds({ rec: 1, name: 'S' }), dds({ line: 1, pos: 2, fn: "'HELLO'" }));
  return screenOf(text).fields.find((f) => f.nameType === 'CONSTANT').length === 5;
})());
{
  // The field after a USER constant, positioned relative to it, used to start one column in.
  const text = src(dds({ rec: 1, name: 'S' }), dds({ line: 1, pos: 2, fn: 'USER' }), dds({ line: 1, rel: 1, fn: "'X'" }));
  const f = screenOf(text).fields;
  const lit = f.filter((x) => x.nameType === 'CONSTANT')[1];
  check('a relatively-positioned field after USER starts after its 10 columns (col 2 + 10 + 1 = 13)', lit && lit.column === 13);
}
check('a named field is untouched by the system-value width', (() => {
  const text = src(dds({ rec: 1, name: 'S' }), dds({ name: 'F1', len: 7, type: 'A', usage: 'O', line: 1, pos: 2 }));
  return screenOf(text).fields.find((f) => f.name === 'F1').length === 7;
})());

console.log('\n=== 3. the guard (pure) ===');
const HEAD = dds({ rec: 1, name: 'S' });
const named = (fn) => src(HEAD, dds({ name: 'F1', len: 10, type: 'A', usage: 'O', line: 1, pos: 2, fn }));
const constant = (fn) => src(HEAD, dds({ line: 1, pos: 2, fn }));
['DATE', 'TIME', 'USER', 'SYSNAME'].forEach((k) => {
  const msg = guard(named(''), named(k));
  check('adding ' + k + ' to a named field is refused, with the DDS wording', new RegExp(k + ' cannot be specified on the named field F1 \\(record format S\\).*positions 17 through 38 must be blank').test(msg || ''));
  check('adding ' + k + ' to an unnamed constant is accepted', guard(constant("'X'"), constant(k)) === null);
});
['TIME', 'USER', 'SYSNAME'].forEach((k) => {
  check(k + '(JUNK) is refused: no parameters', new RegExp(k + ' has no parameters - ' + k + '\\(JUNK\\) is not valid').test(guard(constant(k), constant(k + '(JUNK)')) || ''));
});
check('NOCCSID(X) on a field is refused: no parameters', /NOCCSID has no parameters/.test(guard(named('NOCCSID'), named('NOCCSID(X)')) || ''));
check('bare NOCCSID is accepted', guard(named(''), named('NOCCSID')) === null);
check('DATE(JUNK) is refused with the format', /DATE\(JUNK\) is not a valid parameter - the format is DATE\(\[\*JOB\|\*SYS\] \[\*Y\|\*YY\]\)/.test(guard(constant('DATE'), constant('DATE(JUNK)')) || ''));
check('DATE(*SYS *SYS) and DATE(*Y *YY) are refused (one of each group)', /one of \*JOB \/ \*SYS/.test(guard(constant('DATE'), constant('DATE(*JOB *SYS)')) || '') && /one of \*Y \/ \*YY/.test(guard(constant('DATE'), constant('DATE(*Y *YY)')) || ''));
check('every valid DATE form is accepted', ['DATE', 'DATE(*JOB)', 'DATE(*SYS)', 'DATE(*Y)', 'DATE(*YY)', 'DATE(*SYS *YY)', 'DATE(*YY *SYS)', 'DATE(*job *yy)'].every((d) => guard(constant("'X'"), constant(d)) === null));
check('an already-invalid file does not block an unrelated edit', guard(named('DATE'), named('DATE COLOR(RED)')) === null);
check('...a second, new violation is reported', /named field F2/.test(guard(named('DATE'), src(named('DATE').trimEnd(), dds({ name: 'F2', len: 8, type: 'A', usage: 'O', line: 3, pos: 2, fn: 'USER' }))) || ''));
check('fixing a violation is accepted', guard(named('DATE'), named('')) === null && guard(constant('USER(JUNK)'), constant('USER')) === null);
check('inserting a record above an invalid field does not make it "new"', guard(named('DATE'), src(dds({ rec: 1, name: 'FIRST' }), named('DATE'))) === null);
check('fail-safe on odd models', [undefined, null, {}, { records: null }, { records: [{ name: 'R', fields: null }] }].every((m) => DspfWriter.systemValueKeywordNewConflictReason(null, m) === null));

console.log('\n=== 4. the commit hook (jsdom) ===');
const SOURCE = src(
  dds({ rec: 1, name: 'S' }),
  dds({ line: 1, pos: 2, fn: 'USER' }),
  dds({ name: 'NAMED1', len: 10, type: 'A', usage: 'O', line: 3, pos: 2 }),
  dds({ line: 5, pos: 2, fn: 'TIME' })
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
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  function withAlert(fn) {
    const orig = dom.window.alert; let msg = null;
    dom.window.alert = (m) => { msg = m; }; fn(); dom.window.alert = orig; return msg;
  }
  const boxes = () => Array.from(doc.querySelectorAll('.dspf-field'));
  check('setup: three field boxes (USER, NAMED1, TIME)', boxes().length === 3);
  const userBox = boxes()[0];
  check('the USER constant box spans 10 grid columns (was 1)', /grid-column:\s*\d+ \/ span 10;/.test(userBox.getAttribute('style') || ''));
  // Raw keyword editor on the named field.
  boxes()[1].click();
  const owners = Array.from(doc.querySelectorAll('.kw-add')).map((b) => b.getAttribute('data-owner'));
  const owner = owners.find((o) => /^field-/.test(o));
  check('the named field has a raw keyword editor', !!owner);
  if (owner) {
    const add = (name, params) => {
      doc.getElementById(owner + '-new-kw-name').value = name;
      const p = doc.getElementById(owner + '-new-kw-params'); if (p) p.value = params || '';
      posted.length = 0;
      return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click'));
    };
    const msg = add('DATE');
    check('raw-adding DATE to the named field is refused, nothing written', /DATE cannot be specified on the named field NAMED1/.test(msg || '') && lastText() === null);
    const msg2 = add('NOCCSID', 'X');
    check('raw-adding NOCCSID(X) is refused, nothing written', /NOCCSID has no parameters/.test(msg2 || '') && lastText() === null);
    const msg3 = add('NOCCSID');
    check('raw-adding a bare NOCCSID goes through', msg3 === null && /NOCCSID/.test(lastText() || ''));
  }
  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

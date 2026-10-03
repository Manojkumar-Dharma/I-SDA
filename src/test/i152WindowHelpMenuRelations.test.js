/**
 * i152WindowHelpMenuRelations.test.js
 *
 * Task I-152 - the window, menu-bar, help and logging relations the I-121e
 * slice found unenforced (probe, v0.10.296: every case below was accepted and
 * written). The guard is spec-driven (KeywordSpec hlpseqLimits,
 * notOnRecordTypes, fileExcludes, recordRequires, requiresHelpSpecification,
 * mnubardspFieldShapes) and diff-based (the I-140 / I-148 / I-151 shape): it
 * reports only a violation the edit adds, so an already-invalid hand-written
 * file never blocks an unrelated edit.
 *
 * Run with: node src/test/i152WindowHelpMenuRelations.test.js
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
  .replace(/\f/g, ' ').replace(/\s+/g, ' ').replace(/- /g, '-');
// The reference wraps lines at hyphens ("user- defined"); both sides are normalised the same way.
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ').replace(/- /g, '-')) !== -1;

// One DDS line. o.t = col 17 (R record, H help spec), o.ind = col 9 option indicator,
// o.name/o.len/o.type/o.dec/o.use = a field, o.fn = a keyword (or the function column).
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) put(9, o.ind);
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.len) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec != null) put(36, String(o.dec).padStart(2));
  if (o.use) put(38, o.use);
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const R = (name) => dds({ t: 'R', name });
const K = (fn, ind) => dds({ fn, ind });
const HELP = dds({ t: 'H', fn: 'HLPARA(1 2 1 10)' });
const FIELD = (name, len, type, dec, use) => dds({ name, len, type, dec, use });
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.windowHelpMenuNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');
// A bare keyword string becomes a keyword line; a ready-built DDS line (starts with the A spec) is used as is.
const one = (...kws) => src(R('REC1'), ...kws.map((k) => (/^ {5}A/.test(k) ? k : K(k))));

console.log('=== 1. the facts, against the DDS Reference ===');
check('HLPCMDKEY: not on SFL / SFLCTL / USRDFN, not in a USRDSPMGT file',
  has('You cannot specify HLPCMDKEY on subfile (SFL keyword), subfile control (SFLCTL keyword), or user-defined (USRDFN keyword) record formats. You cannot specify the HLPCMDKEY keyword in a file containing the USRDSPMGT keyword.') &&
  KeywordSpec.notOnRecordTypes('HLPCMDKEY').join() === 'SFL,SFLCTL,USRDFN' && KeywordSpec.fileExcludes('HLPCMDKEY').join() === 'USRDSPMGT');
check('HLPSEQ: group 1-10 characters, sequence 0-99, no duplicates in a group, not on SFL / USRDFN',
  has('The group name is a 1- to 10-character name') && has('The sequence number is a numeric value (0 to 99)') && has('Duplicate numbers within a group are not allowed.') &&
  has('You cannot specify HLPSEQ on subfile (SFL keyword) or user-defined (USRDFN keyword) record formats.') &&
  JSON.stringify(KeywordSpec.hlpseqLimits()) === JSON.stringify({ groupNameMaxLength: 10, sequenceMin: 0, sequenceMax: 99 }) && KeywordSpec.notOnRecordTypes('HLPSEQ').join() === 'SFL,USRDFN');
check('HLPCLR needs a help specification on the record', has('The record specifying the HLPCLR keyword must contain at least one help specification.') && KeywordSpec.requiresHelpSpecification('HLPCLR'));
check('WDWTITLE needs a WINDOW; a referencing WINDOW only warns', has('The WDWTITLE keyword can only be specified on a record that contains a WINDOW keyword (in the definition format). If a WINDOW keyword that references another window is also specified, a warning message is issued.') && KeywordSpec.recordRequires('WDWTITLE').join() === 'WINDOW');
check('MNUBARDSP: the form, the hidden field shapes, optioned repeats',
  has('MNUBARDSP(menu-bar-record &choice-field [&pull-down-input])') && has('more than one MNUBARDSP keyword can be specified on the record if all are optioned') &&
  JSON.stringify(KeywordSpec.mnubardspFieldShapes().choiceField) === JSON.stringify({ usage: 'H', length: 2, decimals: 0, keyboardShift: 'Y' }) &&
  KeywordSpec.mnubardspFieldShapes().pullDownInput.keyboardShift === 'S');

console.log('\n=== 2. HLPCMDKEY and HLPSEQ: record types and the file ===');
['HLPCMDKEY', 'HLPSEQ(GRP1 1)'].forEach((k) => {
  const nm = k.replace(/\(.*/, '');
  // The record types come from the spec: HLPSEQ's section does not list SFLCTL.
  KeywordSpec.notOnRecordTypes(nm).map((m) => (m === 'SFLCTL' ? 'SFLCTL(SF1)' : m)).forEach((m) => {
    const mn = m.replace(/\(.*/, '');
    check('adding ' + nm + ' to a ' + mn + ' record is refused, with the DDS wording', say(new RegExp(nm + ' cannot be specified on a .*\\(' + mn + '\\) record format \\(REC1\\) \\(per the DDS Reference\\)'), guard(one(m), one(m, k))));
    check('adding ' + mn + ' to a record that has ' + nm + ' is refused', say(new RegExp(nm + ' cannot be specified on a'), guard(one(k), one(k, m))));
  });
  check(nm + ' on a plain record is accepted', guard(one(), one(k)) === null);
  if (nm === 'HLPSEQ') check('HLPSEQ is not refused on an SFLCTL record (its section does not list it)', guard(one('SFLCTL(SF1)'), one('SFLCTL(SF1)', k)) === null);
  check('already-invalid: ' + nm + ' on SFLCTL does not block an unrelated edit', guard(one('SFLCTL(SF1)', k), one('SFLCTL(SF1)', k, 'ALARM')) === null);
});
const withFile = (...fileKws) => src(...fileKws.map((f) => K(f)), R('REC1'), K('HLPCMDKEY'));
check('adding HLPCMDKEY in a USRDSPMGT file is refused', say(/HLPCMDKEY cannot be specified on record format REC1 in a file with USRDSPMGT \(per the DDS Reference\)/, guard(src(K('USRDSPMGT'), R('REC1')), src(K('USRDSPMGT'), R('REC1'), K('HLPCMDKEY')))));
check('adding USRDSPMGT at the file level while a record has HLPCMDKEY is refused (the other direction)', say(/HLPCMDKEY cannot be specified on record format REC1 in a file with USRDSPMGT/, guard(src(R('REC1'), K('HLPCMDKEY')), withFile('USRDSPMGT'))));
check('HLPCMDKEY in a file without USRDSPMGT is accepted', guard(one(), one('HLPCMDKEY')) === null);

console.log('\n=== 3. WDWTITLE needs a WINDOW ===');
const T = '(*TEXT \'T\')';
const wt = 'WDWTITLE(' + T + ')';
check('adding WDWTITLE with no WINDOW is refused', say(/WDWTITLE cannot be specified on record format REC1 without a WINDOW keyword on the same record format \(per the DDS Reference\)/, guard(one(), one(wt))));
check('WDWTITLE beside a defining WINDOW is accepted', guard(one('WINDOW(*DFT 10 40)'), one('WINDOW(*DFT 10 40)', wt)) === null);
check('WDWTITLE beside a REFERENCING WINDOW is accepted (IBM only warns)', guard(one('WINDOW(OTHERWDW)'), one('WINDOW(OTHERWDW)', wt)) === null);
check('removing the WINDOW while WDWTITLE stays is refused', say(/WDWTITLE cannot be specified/, guard(one('WINDOW(*DFT 10 40)', wt), one(wt))));
check('removing both is accepted', guard(one('WINDOW(*DFT 10 40)', wt), one()) === null);
check('a second WDWTITLE (the keyword may repeat) with the WINDOW is accepted', guard(one('WINDOW(*DFT 10 40)', wt), one('WINDOW(*DFT 10 40)', wt, 'WDWTITLE(*CENTER)')) === null);
check('already-invalid does not block an unrelated edit', guard(one(wt), one(wt, 'ALARM')) === null);

console.log('\n=== 4. HLPSEQ group name and sequence number ===');
check('a 10-character group name is accepted', guard(one(), one('HLPSEQ(ABCDEFGHIJ 1)')) === null);
check('an 11-character group name is refused, with the count and the limit', say(/HLPSEQ group name ABCDEFGHIJK on record format REC1 is 11 characters; at most 10 are allowed \(per the DDS Reference\)/, guard(one(), one('HLPSEQ(ABCDEFGHIJK 1)'))));
['0', '99'].forEach((n) => check('sequence ' + n + ' is accepted', guard(one(), one('HLPSEQ(GRP ' + n + ')')) === null));
['100', '-1', '150'].forEach((n) => check('sequence ' + n + ' is refused', say(/HLPSEQ sequence number .* must be 0 to 99 \(per the DDS Reference\)/, guard(one(), one('HLPSEQ(GRP ' + n + ')')))));
check('a non-numeric or missing sequence is left alone (grammar is not this task)', guard(one(), one('HLPSEQ(GRP)')) === null && guard(one(), one('HLPSEQ(GRP X)')) === null);
const two = (a, b) => src(R('H1'), K(a), R('H2'), K(b));
check('the same group and number on two records is refused, naming the group, number and records', say(/HLPSEQ sequence number 5 is used more than once in help group GRP \(H1, H2\); duplicate numbers within a group are not allowed/, guard(two('HLPSEQ(GRP 5)', 'HLPSEQ(GRP 6)'), two('HLPSEQ(GRP 5)', 'HLPSEQ(GRP 5)'))));
check('the group match ignores case', say(/used more than once/, guard(two('HLPSEQ(grp 5)', 'HLPSEQ(GRP 6)'), two('HLPSEQ(grp 5)', 'HLPSEQ(GRP 5)'))));
check('the same number in a different group is accepted', guard(two('HLPSEQ(GRP 5)', 'HLPSEQ(OTHER 6)'), two('HLPSEQ(GRP 5)', 'HLPSEQ(OTHER 5)')) === null);
check('a different number in the same group is accepted', guard(two('HLPSEQ(GRP 5)', 'HLPSEQ(GRP 6)'), two('HLPSEQ(GRP 5)', 'HLPSEQ(GRP 7)')) === null);
check('removing one of a duplicate pair is accepted', guard(two('HLPSEQ(GRP 5)', 'HLPSEQ(GRP 5)'), src(R('H1'), K('HLPSEQ(GRP 5)'), R('H2'))) === null);
check('an already-invalid duplicate does not block an unrelated edit', guard(two('HLPSEQ(GRP 5)', 'HLPSEQ(GRP 5)'), src(R('H1'), K('HLPSEQ(GRP 5)'), R('H2'), K('HLPSEQ(GRP 5)'), K('ALARM'))) === null);

console.log('\n=== 5. HLPCLR needs a help specification ===');
check('adding HLPCLR to a record with no help specification is refused', say(/HLPCLR on record format REC1 requires the record to contain at least one help specification \(per the DDS Reference\)/, guard(one(), one('HLPCLR'))));
check('HLPCLR on a record with a help specification is accepted', guard(src(R('REC1'), HELP), src(R('REC1'), K('HLPCLR'), HELP)) === null);
check('removing the last help specification while HLPCLR stays is refused', say(/HLPCLR on record format REC1 requires/, guard(src(R('REC1'), K('HLPCLR'), HELP), src(R('REC1'), K('HLPCLR')))));
check('the help specification on a different record does not count', say(/HLPCLR on record format REC1/, guard(src(R('REC1'), R('REC2'), HELP), src(R('REC1'), K('HLPCLR'), R('REC2'), HELP))));
check('already-invalid does not block an unrelated edit', guard(one('HLPCLR'), one('HLPCLR', 'ALARM')) === null);

console.log('\n=== 6. MNUBARDSP ===');
const bar = (name) => dds({ t: 'R', name, fn: 'MNUBAR' });
// Record-level keywords come before the first field (a keyword line after a field line belongs to the field).
const good = () => src(R('APP'), K('ALARM'), FIELD('CHC', 2, 'Y', 0, 'H'), FIELD('PDI', 2, 'S', 0, 'H'), bar('BAR1'));
const withDsp = (p, fields) => src(R('APP'), K('MNUBARDSP(' + p + ')'), ...(fields || [FIELD('CHC', 2, 'Y', 0, 'H'), FIELD('PDI', 2, 'S', 0, 'H')]), bar('BAR1'));
check('a correct MNUBARDSP is accepted', guard(good(), withDsp('BAR1 &CHC &PDI')) === null);
check('...also without the & prefix (the panel writes bare names)', guard(good(), withDsp('BAR1 CHC PDI')) === null);
check('...and with the pull-down input left out', guard(good(), withDsp('BAR1 &CHC')) === null);
check('a menu-bar record that does not exist is refused', say(/MNUBARDSP on record format APP names NOBAR, which is not a menu-bar \(MNUBAR\) record format in this file \(per the DDS Reference\)/, guard(good(), withDsp('NOBAR &CHC'))));
check('naming a record that is not a MNUBAR record is refused', say(/names APP, which is not a menu-bar/, guard(good(), withDsp('APP &CHC'))));
check('a missing choice field is refused', say(/MNUBARDSP field NOCHC on record format APP is not a field of the record/, guard(good(), withDsp('BAR1 &NOCHC'))));
check('a choice field of the wrong length is refused', say(/MNUBARDSP field CHC on record format APP must be 2 long/, guard(good(), withDsp('BAR1 &CHC', [FIELD('CHC', 3, 'Y', 0, 'H')]))));
check('a choice field that is not hidden is refused', say(/must be hidden \(usage H\)/, guard(good(), withDsp('BAR1 &CHC', [FIELD('CHC', 2, 'Y', 0, 'B')]))));
check('a choice field of the wrong data type is refused', say(/must be data type Y/, guard(good(), withDsp('BAR1 &CHC', [FIELD('CHC', 2, 'S', 0, 'H')]))));
check('a pull-down input of the wrong shape is refused', say(/MNUBARDSP field PDI on record format APP must be data type S/, guard(good(), withDsp('BAR1 &CHC &PDI', [FIELD('CHC', 2, 'Y', 0, 'H'), FIELD('PDI', 2, 'Y', 0, 'H')]))));
check('a pull-down input that is missing is refused', say(/field PDI on record format APP is not a field of the record/, guard(good(), withDsp('BAR1 &CHC &PDI', [FIELD('CHC', 2, 'Y', 0, 'H')]))));
check('removing the menu-bar record while MNUBARDSP names it is refused', say(/names BAR1, which is not a menu-bar/, guard(withDsp('BAR1 &CHC &PDI'), src(R('APP'), K('MNUBARDSP(BAR1 &CHC &PDI)'), FIELD('CHC', 2, 'Y', 0, 'H'), FIELD('PDI', 2, 'S', 0, 'H')))));
check('removing the MNUBAR keyword from the named record is refused', say(/names BAR1/, guard(withDsp('BAR1 &CHC'), src(R('APP'), K('MNUBARDSP(BAR1 &CHC)'), FIELD('CHC', 2, 'Y', 0, 'H'), FIELD('PDI', 2, 'S', 0, 'H'), R('BAR1')))));
check('the name match ignores case', guard(good(), withDsp('bar1 &chc')) === null);
check('a blank MNUBARDSP on a plain record (the panel\'s placeholder) is accepted', guard(good(), src(R('APP'), K('MNUBARDSP'), FIELD('CHC', 2, 'Y', 0, 'H'), bar('BAR1'))) === null);
check('one name only (grammar is not this task) is left alone', guard(good(), withDsp('BAR1')) === null);
// On a MNUBAR record the form is [&pull-down-input].
const onBar = (p, fields) => src(dds({ t: 'R', name: 'BAR1', fn: 'MNUBAR' }), K('MNUBARDSP' + (p === undefined ? '' : '(' + p + ')')), ...(fields || [FIELD('PDI', 2, 'S', 0, 'H')]));
check('MNUBARDSP(&pull-down) on a MNUBAR record with a correct hidden field is accepted', guard(src(dds({ t: 'R', name: 'BAR1', fn: 'MNUBAR' }), FIELD('PDI', 2, 'S', 0, 'H')), onBar('&PDI')) === null);
check('a bare MNUBARDSP on a MNUBAR record is accepted', guard(src(dds({ t: 'R', name: 'BAR1', fn: 'MNUBAR' })), onBar(undefined, [])) === null);
check('a MNUBAR record\'s pull-down input of the wrong shape is refused', say(/MNUBARDSP field PDI on record format BAR1 must be data type S/, guard(src(dds({ t: 'R', name: 'BAR1', fn: 'MNUBAR' })), onBar('&PDI', [FIELD('PDI', 2, 'Y', 0, 'H')]))));
// Several MNUBARDSP: all must be optioned.
const multi = (a, b, ia, ib) => src(R('APP'), K('MNUBARDSP(' + a + ')', ia), K('MNUBARDSP(' + b + ')', ib), FIELD('CHC', 2, 'Y', 0, 'H'), bar('BAR1'), bar('BAR2'));
check('two MNUBARDSP, both optioned, are accepted', guard(src(R('APP'), K('MNUBARDSP(BAR1 &CHC)', '30'), FIELD('CHC', 2, 'Y', 0, 'H'), bar('BAR1'), bar('BAR2')), multi('BAR1 &CHC', 'BAR2 &CHC', '30', '31')) === null);
check('two MNUBARDSP, one not optioned, are refused', say(/More than one MNUBARDSP can be specified on record format APP only if every one carries an option indicator \(per the DDS Reference\)/, guard(src(R('APP'), K('MNUBARDSP(BAR1 &CHC)', '30'), FIELD('CHC', 2, 'Y', 0, 'H'), bar('BAR1'), bar('BAR2')), multi('BAR1 &CHC', 'BAR2 &CHC', '30', undefined))));
check('two un-optioned MNUBARDSP are refused', say(/only if every one carries an option indicator/, guard(src(R('APP'), K('MNUBARDSP(BAR1 &CHC)'), FIELD('CHC', 2, 'Y', 0, 'H'), bar('BAR1'), bar('BAR2')), multi('BAR1 &CHC', 'BAR2 &CHC'))));
check('a single un-optioned MNUBARDSP is accepted', guard(good(), withDsp('BAR1 &CHC')) === null);
check('a blank second MNUBARDSP (placeholder) beside an un-optioned first is accepted', guard(withDsp('BAR1 &CHC'), src(R('APP'), K('MNUBARDSP(BAR1 &CHC)'), K('MNUBARDSP'), FIELD('CHC', 2, 'Y', 0, 'H'), bar('BAR1'))) === null);
check('already-invalid does not block an unrelated edit', guard(withDsp('NOBAR &CHC'), src(R('APP'), K('MNUBARDSP(NOBAR &CHC)'), K('ALARM'), FIELD('CHC', 2, 'Y', 0, 'H'), FIELD('PDI', 2, 'S', 0, 'H'), bar('BAR1'))) === null);

console.log('\n=== 7. the guard itself ===');
check('fail-safe on odd models', [undefined, null, {}, { records: null }, { records: [{ name: 'R', keywords: null }] }, { records: [{ name: 'R', keywords: [{ name: 'MNUBARDSP', parameters: null }], fields: null, helpEntries: null }] }].every((m) => DspfWriter.windowHelpMenuNewConflictReason(null, m) === null));
check('the other I-121e keywords are not constrained here (RMVWDW / USRRSTDSP are the earlier window guard; LOGINP, LOGOUT, SETOF, ALTNAME, none)', ['RMVWDW', 'USRRSTDSP', 'LOGINP', 'LOGOUT', 'SETOF(30)', 'ALTNAME(\'X\')'].every((k) => guard(one(), one(k)) === null));
check('the webview commit choke point calls the guard', fs.readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8').indexOf('DspfWriter.windowHelpMenuNewConflictReason(model, candidate)') !== -1);

console.log('\n=== 8. the commit hook (jsdom) ===');
const SOURCE = src(
  R('PLAIN1'),
  R('SCTL1') + '', 
  R('WIN1'),
  K('WINDOW(*DFT 10 40)'), K(wt),
  R('NEXT1')
).replace(R('SCTL1') + '\n', dds({ t: 'R', name: 'SCTL1', fn: 'SFLCTL(SF1)' }) + '\n');
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

  selectRecord('SCTL1');
  let msg = rawAdd('SCTL1', 'HLPCMDKEY');
  check('raw-adding HLPCMDKEY to an SFLCTL record is refused, nothing written', say(/HLPCMDKEY cannot be specified on a subfile-control \(SFLCTL\) record format \(SCTL1\)/, msg) && lastText() === null);
  selectRecord('PLAIN1');
  msg = rawAdd('PLAIN1', 'WDWTITLE', T);
  check('raw-adding WDWTITLE to a record with no WINDOW is refused', say(/WDWTITLE cannot be specified on record format PLAIN1 without a WINDOW/, msg) && lastText() === null);
  msg = rawAdd('PLAIN1', 'HLPSEQ', 'ABCDEFGHIJK 1');
  check('raw-adding HLPSEQ with an 11-character group is refused', say(/is 11 characters; at most 10/, msg) && lastText() === null);
  msg = rawAdd('PLAIN1', 'HLPSEQ', 'GRP 100');
  check('raw-adding HLPSEQ with sequence 100 is refused', say(/must be 0 to 99/, msg) && lastText() === null);
  msg = rawAdd('PLAIN1', 'HLPCLR');
  check('raw-adding HLPCLR with no help specification is refused', say(/requires the record to contain at least one help specification/, msg) && lastText() === null);
  msg = rawAdd('PLAIN1', 'MNUBARDSP', 'NOBAR CHC');
  check('raw-adding MNUBARDSP naming a missing menu-bar record is refused', say(/names NOBAR, which is not a menu-bar/, msg) && lastText() === null);
  msg = rawAdd('PLAIN1', 'HLPSEQ', 'GRP 5');
  check('raw-adding a valid HLPSEQ goes through', msg === null && /HLPSEQ\(GRP 5\)/.test(lastText() || ''));
  selectRecord('NEXT1');
  msg = rawAdd('NEXT1', 'HLPSEQ', 'GRP 5');
  check('raw-adding the same group and number on another record is refused', say(/used more than once in help group GRP/, msg));
  selectRecord('WIN1');
  msg = rawRemove('WIN1', 'WINDOW');
  check('removing WINDOW while WDWTITLE stays is refused, nothing written', say(/WDWTITLE cannot be specified on record format WIN1 without a WINDOW/, msg) && lastText() === null);
  msg = rawRemove('WIN1', 'WDWTITLE');
  check('removing WDWTITLE is accepted', msg === null && lastText() !== null);

  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

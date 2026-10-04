/**
 * i160FileHelpRelations.test.js
 *
 * Task I-160 - the file-level help and USRDSPMGT relations the I-121g slice
 * found unenforced (probe, v0.10.309: every case below was accepted and
 * written). The guard (DspfWriter.fileHelpNewConflictReason) is spec-driven
 * (KeywordSpec requiresInFile / excludesInFile / requiresKeywordAtLevels /
 * usrdspmgtForbiddenKeywords / parameters) and diff-based (the I-140 / I-148 /
 * I-152 shape): it reports only a violation the edit adds, in either direction,
 * so an already-invalid hand-written file never blocks an unrelated edit.
 *
 *  1. the facts, against the DDS Reference.
 *  2. the guard on parsed DDS: HLPFULL, HLPSCHIDX, USRDSPMGT, HLPRCD, PASSRCD.
 *  3. the commit hook, in the real webview (file panel and raw keyword editor).
 *
 * Run with: node src/test/i160FileHelpRelations.test.js
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
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ').replace(/- /g, '-')) !== -1;

// One DDS line. o.t = col 17 (R record, H help spec), o.name = record/field name, o.fn = keyword.
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
const H = (fn) => dds({ t: 'H', fn });
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.fileHelpNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');

console.log('=== 1. the facts, against the DDS Reference ===');
check('HLPFULL: HLPPNLGRP must be at the file level or at the help specification level',
  has('When you specify the HLPFULL keyword, you must specify the HLPPNLGRP keyword either at the file level or at the help specification level.') &&
  KeywordSpec.RECORD_TYPES.HLPFULL.requiresKeywordAtLevels.keyword === 'HLPPNLGRP');
check('HLPSCHIDX: valid only with at least one HLPPNLGRP, cannot be with HLPSHELF',
  has('HLPSCHIDX is valid only when at least one HLPPNLGRP keyword is specified in the file.') && has('HLPSCHIDX keyword cannot be specified with the HLPSHELF keyword.') &&
  KeywordSpec.fileRequires('HLPSCHIDX').join() === 'HLPPNLGRP' && KeywordSpec.fileExcludes('HLPSCHIDX').join() === 'HLPSHELF');
check('HLPSHELF has no section of its own in the reference: only HLPSCHIDX names it (so it is matched at any level)',
  (RAWREF.match(/HLPSHELF/g) || []).length === 1);
check('USRDSPMGT: its own section forbids eight keywords; the guard reads exactly that list',
  has('You cannot use USRDSPMGT in display files containing any of the following keywords: ASSUME ERASE HLPCMDKEY IGCCNV KEEP PUTRETAIN SFL SFLCTL') &&
  KeywordSpec.usrdspmgtForbiddenKeywords().own.join() === 'ASSUME,ERASE,HLPCMDKEY,IGCCNV,KEEP,PUTRETAIN,SFL,SFLCTL');
check('HLPRCD: the record format name is a required parameter',
  has('HLPRCD(record-format-name [[library-name/]file-name])') && KeywordSpec.RECORD_TYPES.HLPRCD.parameters.recordFormatName.required === true);
check('PASSRCD: the record format name is required and must exist in the file',
  has('record-format-name is a required parameter value for this keyword and must exist in the file') && KeywordSpec.RECORD_TYPES.PASSRCD.parameters.recordFormatName.mustExistInFile === true);

console.log('\n=== 2. the guard on parsed DDS ===');
const PNL = K('HLPPNLGRP(GENERAL LIBA/PNL1)');
{
  let r = guard(src(R('REC1')), src(K('HLPFULL'), R('REC1')));
  check('adding HLPFULL with no HLPPNLGRP anywhere is refused', say(/HLPFULL requires HLPPNLGRP/, r));
  check('adding HLPFULL with a file-level HLPPNLGRP is accepted', guard(src(PNL, R('REC1')), src(PNL, K('HLPFULL'), R('REC1'))) === null);
  check('adding HLPFULL with HLPPNLGRP on a help specification is accepted', guard(src(R('REC1'), H('HLPARA(1 2 1 10)'), K('HLPPNLGRP(NAMETAG LIBA/PNL1)')), src(K('HLPFULL'), R('REC1'), H('HLPARA(1 2 1 10)'), K('HLPPNLGRP(NAMETAG LIBA/PNL1)'))) === null);
  r = guard(src(PNL, K('HLPFULL'), R('REC1')), src(K('HLPFULL'), R('REC1')));
  check('removing the file-level HLPPNLGRP while HLPFULL stays is refused (the other direction)', say(/HLPFULL requires HLPPNLGRP/, r));
  check('removing HLPFULL itself is accepted', guard(src(PNL, K('HLPFULL'), R('REC1')), src(PNL, R('REC1'))) === null);
  check('an already-invalid file (HLPFULL, no HLPPNLGRP) does not block an unrelated edit', guard(src(K('HLPFULL'), R('REC1')), src(K('HLPFULL'), K('DSPRL'), R('REC1'))) === null);

  r = guard(src(R('REC1')), src(K('HLPSCHIDX(LIBA/SEARCH1)'), R('REC1')));
  check('adding HLPSCHIDX with no HLPPNLGRP is refused', say(/HLPSCHIDX is valid only when at least one HLPPNLGRP keyword is specified in the file/, r));
  check('adding HLPSCHIDX with a file-level HLPPNLGRP is accepted', guard(src(PNL, R('REC1')), src(PNL, K('HLPSCHIDX(LIBA/SEARCH1)'), R('REC1'))) === null);
  check('adding HLPSCHIDX with HLPPNLGRP on a help specification is accepted', guard(src(R('REC1'), H('HLPARA(1 2 1 10)'), K('HLPPNLGRP(NAMETAG LIBA/PNL1)')), src(K('HLPSCHIDX(LIBA/SEARCH1)'), R('REC1'), H('HLPARA(1 2 1 10)'), K('HLPPNLGRP(NAMETAG LIBA/PNL1)'))) === null);
  r = guard(src(PNL, K('HLPSHELF(X)'), R('REC1')), src(PNL, K('HLPSHELF(X)'), K('HLPSCHIDX(LIBA/SEARCH1)'), R('REC1')));
  check('adding HLPSCHIDX to a file with HLPSHELF is refused', say(/HLPSCHIDX cannot be specified with the HLPSHELF keyword/, r));
  r = guard(src(PNL, K('HLPSCHIDX(LIBA/SEARCH1)'), R('REC1')), src(PNL, K('HLPSCHIDX(LIBA/SEARCH1)'), K('HLPSHELF(X)'), R('REC1')));
  check('adding HLPSHELF to a file with HLPSCHIDX is refused (the other direction)', say(/HLPSCHIDX cannot be specified with the HLPSHELF keyword/, r));
  r = guard(src(PNL, K('HLPSCHIDX(LIBA/SEARCH1)'), R('REC1')), src(K('HLPSCHIDX(LIBA/SEARCH1)'), R('REC1')));
  check('removing the last HLPPNLGRP while HLPSCHIDX stays is refused', say(/HLPSCHIDX is valid only when/, r));
}
{
  // USRDSPMGT: each of the eight, in the form it takes (keyword line, file-level keyword, record type).
  const HOW = {
    ASSUME: (u) => src(u, R('REC1', 'ASSUME')), ERASE: (u) => src(u, R('REC1'), K('ERASE(REC2)')),
    HLPCMDKEY: (u) => src(u, R('REC1'), K('HLPCMDKEY')), IGCCNV: (u) => src(K('IGCCNV(CF03 24)'), u, R('REC1')),
    KEEP: (u) => src(u, R('REC1'), K('KEEP')), PUTRETAIN: (u) => src(u, R('REC1'), K('PUTRETAIN')),
    SFL: (u) => src(u, R('REC1', 'SFL')), SFLCTL: (u) => src(u, R('REC1', 'SFLCTL(SF1)'))
  };
  KeywordSpec.usrdspmgtForbiddenKeywords().own.forEach((n) => {
    const without = HOW[n]('');
    const wasBuilt = HOW[n](K('USRDSPMGT'));
    const base = without.replace(/^\n/, '');
    const r = guard(base, wasBuilt);
    check('adding USRDSPMGT to a file that has ' + n + ' is refused', say(new RegExp('USRDSPMGT cannot be used in a display file that contains ' + n), r));
    check('adding ' + n + ' to a file that has USRDSPMGT is refused (the other direction)', say(new RegExp('USRDSPMGT cannot be used in a display file that contains ' + n), guard(src(K('USRDSPMGT'), R('REC1')), wasBuilt)));
  });
  check('USRDSPMGT alone is accepted', guard(src(R('REC1')), src(K('USRDSPMGT'), R('REC1'))) === null);
  // The twelve-name System/36 list is an open question: its four extra names are NOT enforced.
  ['ERRSFL', 'MNUBAR', 'PULLDOWN', 'SNGCHCFLD'].forEach((n) => {
    const extra = KeywordSpec.usrdspmgtForbiddenKeywords().considerations.indexOf(n) >= 0 && KeywordSpec.usrdspmgtForbiddenKeywords().own.indexOf(n) < 0;
    const withN = n === 'ERRSFL' ? src(K('USRDSPMGT'), K('ERRSFL'), R('REC1')) : src(K('USRDSPMGT'), R('REC1'), K(n));
    check(n + ' (only in the twelve-name list) is not refused with USRDSPMGT - the two-list question is still open', extra && guard(src(K('USRDSPMGT'), R('REC1')), withN) === null);
  });
  check('an already-invalid file (USRDSPMGT + KEEP) does not block an unrelated edit', guard(HOW.KEEP(K('USRDSPMGT')), HOW.KEEP(K('USRDSPMGT')).replace('USRDSPMGT', 'USRDSPMGT\n' + K('DSPRL'))) === null);
}
{
  let r = guard(src(R('REC1')), src(K('HLPRCD'), R('REC1')));
  check('adding HLPRCD with no record format name is refused', say(/HLPRCD needs a record format name/, r));
  check('adding HLPRCD(HELP1) is accepted', guard(src(R('REC1')), src(K('HLPRCD(HELP1)'), R('REC1'))) === null);
  check('adding HLPRCD(HELP1 LIBA/HELPFILE) is accepted', guard(src(R('REC1')), src(K('HLPRCD(HELP1 LIBA/HELPFILE)'), R('REC1'))) === null);

  r = guard(src(R('REC1')), src(K('PASSRCD(NOPE)'), R('REC1')));
  check('adding PASSRCD naming a record format that does not exist is refused', say(/PASSRCD names record format NOPE, which is not a record format in this file/, r));
  check('adding PASSRCD naming an existing record format is accepted', guard(src(R('REC1')), src(K('PASSRCD(REC1)'), R('REC1'))) === null);
  r = guard(src(K('PASSRCD(REC1)'), R('REC1'), R('REC2')), src(K('PASSRCD(REC1)'), R('REC2')));
  check('deleting the record format PASSRCD names is refused (the other direction)', say(/PASSRCD names record format REC1/, r));
  check('an already-invalid file (PASSRCD names a missing record) does not block an unrelated edit', guard(src(K('PASSRCD(NOPE)'), R('REC1')), src(K('PASSRCD(NOPE)'), K('DSPRL'), R('REC1'))) === null);
}

console.log('\n=== 3. the commit hook (jsdom) ===');
const SOURCE = src(K('DSPSIZ(24 80 *DS3)'), R('REC1'), K('KEEP'), R('REC2'));
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
  const toFile = () => fire(doc.getElementById('crumb-file'), 'click');
  function rawAddFile(name, params) {
    doc.getElementById('file-new-kw-name').value = name;
    const p = doc.getElementById('file-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="file"]'), 'click'));
  }
  function tick(id) {
    const el = doc.getElementById(id); el.checked = true; posted.length = 0;
    return withAlert(() => fire(el, 'change'));
  }

  toFile();
  let msg = tick('fk-hlpfull-on');
  check('ticking HLPFULL on the file panel with no HLPPNLGRP is refused, nothing written', say(/HLPFULL requires HLPPNLGRP/, msg) && lastText() === null);
  msg = rawAddFile('HLPSCHIDX', 'LIBA/SEARCH1');
  check('raw-adding HLPSCHIDX with no HLPPNLGRP is refused, nothing written', say(/HLPSCHIDX is valid only when at least one HLPPNLGRP/, msg) && lastText() === null);
  toFile();
  msg = tick('fk-usrdspmgt-on');
  check('ticking USRDSPMGT in a file whose record has KEEP is refused, nothing written', say(/USRDSPMGT cannot be used in a display file that contains KEEP/, msg) && lastText() === null);
  toFile();
  msg = rawAddFile('PASSRCD', 'NOPE');
  check('raw-adding PASSRCD naming a missing record format is refused, nothing written', say(/PASSRCD names record format NOPE/, msg) && lastText() === null);
  msg = rawAddFile('HLPRCD', '');
  check('raw-adding HLPRCD with no record format name is refused, nothing written', say(/HLPRCD needs a record format name/, msg) && lastText() === null);
  msg = rawAddFile('PASSRCD', 'REC2');
  check('raw-adding PASSRCD naming an existing record format goes through', msg === null && /PASSRCD\(REC2\)/.test(lastText() || ''));
  toFile();
  msg = rawAddFile('HLPPNLGRP', 'GENERAL LIBA/PNL1');
  check('raw-adding HLPPNLGRP goes through', msg === null && /HLPPNLGRP\(GENERAL LIBA\/PNL1\)/.test(lastText() || ''));

  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

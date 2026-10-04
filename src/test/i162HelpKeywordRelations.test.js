/**
 * i162HelpKeywordRelations.test.js
 *
 * Task I-162 - HELP's two relations to the other help keywords are enforced
 * (DDS_Keyword_V7r6.txt, HELP section ~line 6564):
 *   1. "When a response indicator is specified on the HELP keyword, no H
 *      specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords can be
 *      specified in the file."
 *   2. "HELP (with no response indicator) is required if the file contains H
 *      specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords."
 *
 * Covers the model-diff guard (every direction, both levels, the weakest
 * reading of relation 2, diff behaviour on already-invalid files) and the real
 * generated webview in jsdom (file- and record-level raw editors).
 *
 * Run with: node src/test/i162HelpKeywordRelations.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').replace(/\f/g, ' ').replace(/\s+/g, ' ');
const K = (t) => '     A                                      ' + t;
const R = (n, kw) => '     A          R ' + n.padEnd(10) + '                  ' + (kw || '');
const F = (n) => '     A            ' + n.padEnd(10) + '    10A  B  2  2';
const H = (kw) => '     A          H                           ' + kw;
const src = (...l) => l.join('\n') + '\n';
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.helpKeywordRelationNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');
const PLAIN = src(R('R1'), F('A1'));

console.log('\n1. the rules against the reference text');
{
  check('relation 1 sentence is in the reference', REF.indexOf('When a response indicator is specified on the HELP keyword, no H specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords can be specified in the file') >= 0);
  check('relation 2 sentence is in the reference', REF.indexOf('HELP (with no response indicator) is required if the file contains H specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords') >= 0);
  const r = KeywordSpec.helpRelations();
  check('the guard reads the four keywords and the H-specification flags from the spec', r.withResponseIndicatorExcludesInFile.join() === 'HLPRCD,HLPPNLGRP,HLPDOC,HLPRTN' && r.withoutResponseIndicatorRequiredWhenFileContains.join() === r.withResponseIndicatorExcludesInFile.join() && r.withResponseIndicatorExcludesHelpSpecifications && r.withoutResponseIndicatorRequiredWhenFileHasHelpSpecifications);
}

console.log('\n2. relation 1: a response indicator on HELP excludes the help keywords');
{
  const withHelp95 = src(K('HELP(95)'), R('R1'), F('A1'));
  ['HLPRCD(HELP1)', 'HLPPNLGRP(GENERAL LIB/PNL)', 'HLPDOC(START GENERAL.HLP HELP.F1)', 'HLPRTN'].forEach((kw) => {
    const name = kw.split('(')[0];
    // adding the keyword beside HELP(95)
    check('adding ' + name + ' to a file whose HELP names an indicator is refused', say(new RegExp('^' + name + ' cannot be specified in a display file whose HELP names a response indicator \\(HELP\\(95\\)\\)'), guard(withHelp95, src(K('HELP(95)'), K(kw), R('R1'), F('A1')))));
    // adding HELP(95) to a file that has the keyword (plus a bare HELP before so relation 2 is quiet, then it becomes HELP(95))
    check('giving HELP an indicator while ' + name + ' is in the file is refused', say(new RegExp('^' + name + ' cannot be specified'), guard(src(K('HELP'), K(kw), R('R1'), F('A1')), src(K('HELP(95)'), K(kw), R('R1'), F('A1')))));
  });
  check('a record-level HLPRTN with a file-level HELP(95) is refused too ("in the file")', say(/^HLPRTN cannot be specified/, guard(withHelp95, src(K('HELP(95)'), R('R1', 'HLPRTN'), F('A1')))));
  check('a record-level HELP(95) names an indicator as well', say(/^HLPRCD cannot be specified/, guard(src(K('HLPRCD(H1)'), K('HELP'), R('R1'), F('A1')), src(K('HLPRCD(H1)'), R('R1', 'HELP(95)'), F('A1')))));
  check('HELP with an indicator and option indicators: the indicator is the parameter text, not the condition', guard(PLAIN, src(R('R1', 'HELP(95)'), F('A1'))) === null);
  check('HELP(95) alone in a file with no other help keyword is fine', guard(PLAIN, withHelp95.replace('R1', 'R1')) === null);
  check('HELP(95 \'text\') is an indicator too', say(/^HLPRCD cannot/, guard(src(K("HELP(95 'Help')"), R('R1'), F('A1')), src(K("HELP(95 'Help')"), K('HLPRCD(H1)'), R('R1'), F('A1')))));
  check('an H specification beside HELP(95) is refused (the sentence names H specifications)', say(/^H specifications cannot be specified in a display file whose HELP names a response indicator/, guard(withHelp95, src(K('HELP(95)'), R('R1'), F('A1'), H('HLPARA(1 1 3 10)')))));
}

console.log('\n3. relation 2: HELP with no response indicator is required');
{
  ['HLPRCD(HELP1)', 'HLPPNLGRP(GENERAL LIB/PNL)', 'HLPDOC(START GENERAL.HLP HELP.F1)', 'HLPRTN'].forEach((kw) => {
    const name = kw.split('(')[0];
    check('adding ' + name + ' to a file with no HELP is refused, naming the keyword', say(new RegExp('^A file that contains ' + name + ' needs the HELP keyword with no response indicator'), guard(PLAIN, src(K(kw), R('R1'), F('A1')))));
    check('adding ' + name + ' to a file that has a bare HELP is allowed', guard(src(K('HELP'), R('R1'), F('A1')), src(K('HELP'), K(kw), R('R1'), F('A1'))) === null);
    check('removing the last bare HELP while ' + name + ' stays is refused', say(/needs the HELP keyword with no response indicator/, guard(src(K('HELP'), K(kw), R('R1'), F('A1')), src(K(kw), R('R1'), F('A1')))));
  });
  check('an H specification in a file with no HELP is refused', say(/^A file that contains H specifications needs the HELP/, guard(PLAIN, src(R('R1'), F('A1'), H('HLPARA(1 1 3 10)')))));
  check('an H specification in a file with a bare HELP is allowed', guard(src(K('HELP'), R('R1'), F('A1')), src(K('HELP'), R('R1'), F('A1'), H('HLPARA(1 1 3 10)'))) === null);
  check('the weakest reading: a bare HELP at record level satisfies it (the section names no level)', guard(PLAIN, src(K('HLPRCD(H1)'), R('R1', 'HELP'), F('A1'))) === null);
  check('and a bare HELP at file level satisfies it for a record-level HLPRTN', guard(PLAIN, src(K('HELP'), R('R1', 'HLPRTN'), F('A1'))) === null);
  const KC = (t) => '     A  10' + ' '.repeat(34) + t;   // keyword conditioned by indicator 10
  check('HELP conditioned by an option indicator is still "no response indicator" (satisfies relation 2)', guard(PLAIN, src(KC('HELP'), K('HLPRCD(H1)'), R('R1'), F('A1'))) === null);
  check('...and HELP(95) conditioned by an option indicator still names a response indicator (relation 1)', say(/^HLPRCD cannot be specified/, guard(src(KC('HELP(95)'), R('R1'), F('A1')), src(KC('HELP(95)'), K('HLPRCD(H1)'), R('R1'), F('A1')))));
  check('giving the only bare HELP an indicator is refused (HLPRCD cannot be with HELP(95))', say(/^HLPRCD cannot be specified/, guard(src(K('HELP'), K('HLPRCD(H1)'), R('R1'), F('A1')), src(K('HELP(95)'), K('HLPRCD(H1)'), R('R1'), F('A1')))));
  check('the HELP-required message says to add HELP first', say(/add HELP first/, guard(PLAIN, src(K('HLPRTN'), R('R1'), F('A1')))));
  check('a file with none of the help keywords needs no HELP', guard(PLAIN, src(K('DSPSIZ(24 80 *DS3)'), R('R1'), F('A1'))) === null);
}

console.log('\n4. diff behaviour');
{
  const bad1 = src(K('HLPRCD(HELP1)'), R('R1'), F('A1'));                       // relation 2 broken by hand
  const bad2 = src(K('HELP(95)'), K('HLPRCD(HELP1)'), R('R1'), F('A1'));          // relation 1 broken by hand
  check('an already-invalid file (no HELP, has HLPRCD) does not block an unrelated edit', guard(bad1, src(K('HLPRCD(HELP1)'), K('KEEP'), R('R1'), F('A1'))) === null);
  check('an already-invalid file (HELP(95) + HLPRCD) does not block an unrelated edit', guard(bad2, src(K('HELP(95)'), K('HLPRCD(HELP1)'), K('KEEP'), R('R1'), F('A1'))) === null);
  check('but a second help keyword added beside the broken pair is reported', say(/^HLPRTN cannot be specified/, guard(bad2, src(K('HELP(95)'), K('HLPRCD(HELP1)'), K('HLPRTN'), R('R1'), F('A1')))));
  check('removing the offending keyword is always allowed', guard(bad2, src(K('HELP(95)'), R('R1'), F('A1'))) === null);
  check('adding the missing HELP is always allowed', guard(bad1, src(K('HELP'), K('HLPRCD(HELP1)'), R('R1'), F('A1'))) === null);
  check('null / empty models do not throw', DspfWriter.helpKeywordRelationNewConflictReason(null, null) === null && DspfWriter.helpKeywordRelationNewConflictReason({}, { fileKeywords: [{ name: 'HLPRTN', parameters: '' }], records: [] }) !== null);
  check('keywords with odd parameters (null / undefined) do not throw', DspfWriter.helpKeywordRelationNewConflictReason({ fileKeywords: [], records: [] }, { fileKeywords: [{ name: 'HELP', parameters: null }, { name: 'HLPRTN' }], records: [] }) === null);
}

console.log('\n5. the real webview in jsdom');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function session(source) {
  const posted = [], alerts = [];
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'n' + Math.random(), source, 'I162.DSPF'), {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = (m) => alerts.push(m);
      w.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
    },
  });
  const doc = dom.window.document;
  const Ev = dom.window.Event;
  return {
    posted, alerts, doc, dom,
    toFile() { doc.getElementById('crumb-file').dispatchEvent(new Ev('click', { bubbles: true })); },
    toRecord(name) { const sel = doc.getElementById('recordSelect'); sel.value = name; sel.dispatchEvent(new Ev('change', { bubbles: true })); },
    rawAdd(owner, name, params) {
      posted.length = 0; alerts.length = 0;
      doc.getElementById(owner + '-new-kw-name').value = name;
      const p = doc.getElementById(owner + '-new-kw-params'); if (p) p.value = params || '';
      doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new Ev('click', { bubbles: true }));
      return { alert: alerts[0] || null, edited: posted.some((m) => m.type === 'applyEdit') };
    },
  };
}
(async () => {
  let s = session(src(K('HELP(95)'), R('R1'), F('A1')));
  await sleep(1000); s.toFile();
  let r = s.rawAdd('file', 'HLPRCD', 'HELP1');
  check('file-level raw editor: HLPRCD beside HELP(95) is refused with the relation-1 reason', !r.edited && /^HLPRCD cannot be specified in a display file whose HELP names a response indicator/.test(r.alert || ''));
  r = s.rawAdd('file', 'HLPDOC', 'START GENERAL.HLP HELP.F1');
  check('file-level raw editor: HLPDOC beside HELP(95) is refused too', !r.edited && /^HLPDOC cannot be specified/.test(r.alert || ''));

  s = session(PLAIN);
  await sleep(1000); s.toFile();
  r = s.rawAdd('file', 'HLPRCD', 'HELP1');
  check('file-level raw editor: HLPRCD with no HELP in the file is refused with the relation-2 reason', !r.edited && /needs the HELP keyword with no response indicator/.test(r.alert || ''));
  r = s.rawAdd('file', 'HELP', '');
  check('file-level raw editor: a bare HELP is written', r.edited && !r.alert);

  s = session(src(K('HELP'), K('HLPRCD(HELP1)'), R('R1'), F('A1')));
  await sleep(1000); s.toFile();
  r = s.rawAdd('file', 'HLPRTN', '');
  check('file-level raw editor: HLPRTN beside a bare HELP and HLPRCD is allowed', r.edited && !r.alert);

  s = session(src(K('HELP'), K('HLPRCD(HELP1)'), R('R1'), F('A1')));
  await sleep(1000); s.toFile();
  const helpBox = s.doc.getElementById('fk-help-on');
  let tabbed = !!helpBox;
  if (!tabbed) for (const t of Array.from(s.doc.querySelectorAll('.props-tab'))) { t.dispatchEvent(new s.dom.window.Event('click', { bubbles: true })); if (s.doc.getElementById('fk-help-on')) { tabbed = true; break; } }
  const box = s.doc.getElementById('fk-help-on');
  check('setup: the file-level HELP row is there and ticked', !!box && box.checked === true);
  if (box) {
    s.posted.length = 0; s.alerts.length = 0;
    box.checked = false; box.dispatchEvent(new s.dom.window.Event('change', { bubbles: true }));
    check('unticking the only bare HELP while HLPRCD stays is refused', !s.posted.some((m) => m.type === 'applyEdit') && /needs the HELP keyword with no response indicator/.test(s.alerts[0] || ''));
    s.alerts.length = 0; s.posted.length = 0;
    const ind = s.doc.getElementById('fk-help-ind');
    if (ind) {
      ind.value = '95'; ind.dispatchEvent(new s.dom.window.Event('change', { bubbles: true }));
      check('giving that HELP a response indicator while HLPRCD stays is refused', !s.posted.some((m) => m.type === 'applyEdit') && /HLPRCD cannot be specified/.test(s.alerts[0] || ''));
    }
  }

  s = session(src(R('R1'), F('A1')));
  await sleep(1000); s.toRecord('R1');
  r = s.rawAdd('record-R1', 'HLPRTN', '');
  check('record-level raw editor: HLPRTN in a file with no HELP is refused', !r.edited && /^A file that contains HLPRTN needs the HELP/.test(r.alert || ''));
  r = s.rawAdd('record-R1', 'HELP', '');
  check('record-level raw editor: a bare HELP is written', r.edited && !r.alert);

  s = session(src(K('HLPRCD(HELP1)'), K('HELP'), R('R1'), F('A1')));
  await sleep(1000); s.toRecord('R1');
  r = s.rawAdd('record-R1', 'HELP', '95');
  check('record-level raw editor: a HELP(95) on a record of a file with HLPRCD is refused', !r.edited && /^HLPRCD cannot be specified/.test(r.alert || ''));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();

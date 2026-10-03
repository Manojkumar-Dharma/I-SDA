/**
 * i154SystemValueIbmRules.test.js
 *
 * Task I-154 - the DATE / TIME / USER / SYSNAME constants against the DDS
 * Reference's own patterns and examples (DDS_Keyword_V7r6.txt):
 *  1. EDTCDE table notes 2 and 3 give the exact slash patterns of the W and Y
 *     edit codes by digit count, so a DATE (and a numeric field) with W or Y
 *     has an exact width, not "the coded length".
 *  2. The preview text is IBM's format at the real width: TIME is its default
 *     edit word '0_:__:__' poured over hhmmss ("11:06:45", IBM's example); DATE
 *     with no editing is the bare digits, EDTCDE(Y) / (W) pour them into IBM's
 *     pattern with IBM's zero suppression - never longer than the field.
 *  3. TIME's section says "You can specify ONLY the location of the field,
 *     TIME, and optionally EDTCDE, EDTWRD, COLOR, DSPATR, or TEXT": any other
 *     keyword on a TIME field is refused (DATE, USER and SYSNAME say
 *     "optionally" without "only" and stay open).
 *
 * Run with: node src/test/i154SystemValueIbmRules.test.js
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
const at = (y, mo, d, h, mi, s) => new Date(y, mo - 1, d, h, mi, s);

console.log('\n1. IBM\'s W / Y patterns');
{
  // The ten patterns, each as printed in the reference.
  const Y = { 3: 'nn/n', 4: 'nn/nn', 5: 'nn/nn/n', 6: 'nn/nn/nn', 7: 'nnn/nn/nn', 8: 'nn/nn/nnnn' };
  const W = { 5: 'nn/nnn', 6: 'nnnn/nn', 7: 'nnnn/nnn', 8: 'nnnn/nn/nn' };
  Object.keys(Y).forEach((n) => check('Y, ' + n + ' digits: ' + Y[n] + ' (and "' + Y[n] + '" is in the reference)', KeywordSpec.dateEditCodePattern('Y', Number(n)) === Y[n] && REF.indexOf(Y[n]) >= 0));
  Object.keys(W).forEach((n) => check('W, ' + n + ' digits: ' + W[n] + ' (and "' + W[n] + '" is in the reference)', KeywordSpec.dateEditCodePattern('W', Number(n)) === W[n] && REF.indexOf(W[n]) >= 0));
  check('widths are the pattern lengths', KeywordSpec.dateEditCodeWidth('Y', 6) === 8 && KeywordSpec.dateEditCodeWidth('Y', 8) === 10 && KeywordSpec.dateEditCodeWidth('W', 8) === 10 && KeywordSpec.dateEditCodeWidth('W', 5) === 6);
  check('lower case and padding are accepted', KeywordSpec.dateEditCodePattern(' y ', 6) === 'nn/nn/nn' && KeywordSpec.dateEditCodePattern('w', 5) === 'nn/nnn');
  check('a digit count IBM lists no pattern for is null (Y 2 and 9, W 3 and 4)', [['Y', 2], ['Y', 9], ['W', 3], ['W', 4]].every((a) => KeywordSpec.dateEditCodePattern(a[0], a[1]) === null));
  check('other codes, odd names and prototype keys are null', ['', 'A', '5', 'toString', '__proto__', 'constructor', null, undefined, 5].every((c) => KeywordSpec.dateEditCodePattern(c, 6) === null));
  check('odd digit counts are null', [undefined, null, NaN, '6x', 0, -1, 'constructor'].every((n) => KeywordSpec.dateEditCodePattern('Y', n) === null));
  check('digits: TIME 6, DATE 6 / 8 by *Y / *YY, others null', KeywordSpec.systemValueDigits('TIME') === 6 && KeywordSpec.systemValueDigits('DATE', '') === 6 && KeywordSpec.systemValueDigits('DATE', '*SYS *YY') === 8 && KeywordSpec.systemValueDigits('USER') === null && KeywordSpec.systemValueDigits('MSGCON') === null);
}

console.log('\n2. widths');
{
  const w = (n, o) => KeywordSpec.systemValueConstantWidth(n, o);
  check('DATE 6, DATE(*YY) 8 (the digits)', w('DATE', {}) === 6 && w('DATE', { dateParameters: '*YY' }) === 8);
  check('DATE EDTCDE(Y): *Y 8 (mm/dd/yy, the reference\'s own example), *YY 10', w('DATE', { editCode: 'Y' }) === 8 && w('DATE', { editCode: 'y', dateParameters: '*YY' }) === 10);
  check('"mm/dd/yy" is in the reference', REF.indexOf('mm/dd/yy') >= 0);
  check('DATE EDTCDE(W): *YY 10 (nnnn/nn/nn); *Y 7 (nnnn/nn)', w('DATE', { editCode: 'W', dateParameters: '*YY' }) === 10 && w('DATE', { editCode: 'W' }) === 7);
  check('TIME 8 (the default edit word 0_:__:__)', w('TIME', {}) === 8);
  check('an EDTWRD width wins over everything', w('TIME', { editWordWidth: 22 }) === 22 && w('DATE', { editWordWidth: 12, editCode: 'Y' }) === 12);
  check('a user-defined edit code 5-9 on TIME keeps the default\'s 8 (its editing is defined on the system)', ['5', '6', '7', '8', '9'].every((c) => w('TIME', { editCode: c }) === 8));
  check('USER 10, SYSNAME 8, others null', w('USER', {}) === 10 && w('SYSNAME', {}) === 8 && w('MSGCON', {}) === null && w('DFT', {}) === null);

  // through the engine
  function widthOf(kws) {
    const src = ['     A          R REC1', '     A                                  2  2' + kws[0]]
      .concat(kws.slice(1).map((k) => '     A                                      ' + k)).join('\n') + '\n     A                                  2 40\'AFTER\'\n';
    const r = DspfEngine.resolveScreen(DspfParser.parseDspf(src), 'REC1');
    return { len: r.fields[0].length, text: r.fields[0].text, next: r.fields[1].column, fits: r.fields[0].text.length <= r.fields[0].length };
  }
  check('engine: DATE(*YY) EDTCDE(W) is 10 wide (was 8)', widthOf(['DATE(*YY)', 'EDTCDE(W)']).len === 10);
  check('engine: TIME with IBM\'s own EDTWRD example is 22 wide (IBM shows "11 HRS 06 MINS 45 SECS")', widthOf(['TIME', "EDTWRD('0 &HRS&; &MINS&; &SECS')"]).len === 22 && 'xx HRS xx MINS xx SECS'.length === 22);
  check('engine: DATE EDTCDE(1) (any other IBM code) goes through the numeric edit-code rules', widthOf(['DATE', 'EDTCDE(1)']).len === 7 && widthOf(['TIME', 'EDTCDE(Z)']).len === 6);
  check('engine: a relatively positioned field after it is not shifted into it', widthOf(['DATE(*YY)', 'EDTCDE(Y)']).next === 40);

  // numeric fields share the same pattern fact
  const num = (len, dec, code) => {
    const src = '     A          R R1\n     A            N1             ' + len + 'S ' + dec + 'B  2  2EDTCDE(' + code + ')\n';
    return DspfEngine.resolveScreen(DspfParser.parseDspf(src), 'R1').fields[0].length;
  };
  check('numeric 6,0 EDTCDE(Y) 8; 8,0 Y 10; 5,0 W 6; 8,0 W 10', num(6, 0, 'Y') === 8 && num(8, 0, 'Y') === 10 && num(5, 0, 'W') === 6 && num(8, 0, 'W') === 10);
  check('numeric 9,0 EDTCDE(Y) (no IBM pattern) and a field with decimals keep the coded length', num(9, 0, 'Y') === 9 && num(6, 2, 'Y') === 6);
}

console.log('\n3. preview text');
{
  const t = (n, o, when) => KeywordSpec.systemValuePreviewText(n, o, when);
  const oct3 = at(2026, 10, 3, 11, 6, 45), mar5 = at(2026, 3, 5, 2, 3, 4);
  check('TIME is IBM\'s own example: 11:06:45', t('TIME', {}, oct3) === '11:06:45');
  check('"11:06:45" is in the reference', REF.indexOf('11:06:45') >= 0);
  check('TIME keeps its leading zero (the edit word starts with 0): 02:03:04', t('TIME', {}, mar5) === '02:03:04');
  check('DATE with no editing is the bare digits: 100326, *YY 10032026', t('DATE', {}, oct3) === '100326' && t('DATE', { dateParameters: '*YY' }, oct3) === '10032026');
  check('DATE EDTCDE(Y) pours mm/dd/yy; *YY mm/dd/yyyy', t('DATE', { editCode: 'Y' }, oct3) === '10/03/26' && t('DATE', { editCode: 'Y', dateParameters: '*YY' }, oct3) === '10/03/2026');
  check('Y suppresses the farthest left zero: Mar 5 -> " 3/05/26"', t('DATE', { editCode: 'Y' }, mar5) === ' 3/05/26' && t('DATE', { editCode: 'Y', dateParameters: '*YY' }, mar5) === ' 3/05/2026');
  check('W is correct for a YMD date with a four digit year: 2026/10/03', t('DATE', { editCode: 'W', dateParameters: '*YY' }, oct3) === '2026/10/03');
  check('W with a two digit year pours nnnn/nn (6 digits)', t('DATE', { editCode: 'W' }, oct3) === '2610/03');
  check('an edit word or another edit code previews the bare digits', t('DATE', { editWordWidth: 12 }, oct3) === '100326' && t('TIME', { editCode: '5' }, oct3) === '110645' && t('TIME', { editWordWidth: 22 }, oct3) === '110645');
  check('USER, SYSNAME and others have no generated preview (the engine keeps *USER / *SYSNAME)', ['USER', 'SYSNAME', 'MSGCON', 'DFT', null].every((n) => t(n, {}, oct3) === null));
  check('the date argument is optional', /^\d\d:\d\d:\d\d$/.test(t('TIME', {})) && /^\d{6}$/.test(t('DATE', {})));
  check('a non-Date "now" falls back to the current time', /^\d{6}$/.test(t('DATE', {}, 'x')));
  // never longer than the width, every combination, every month and a spread of days
  let worst = null;
  const combos = [{}, { dateParameters: '*YY' }, { editCode: 'Y' }, { editCode: 'Y', dateParameters: '*YY' }, { editCode: 'W' }, { editCode: 'W', dateParameters: '*YY' }, { editCode: '5' }, { editCode: 'Z' }];
  for (let m = 1; m <= 12; m++) for (const d of [1, 9, 10, 28]) for (const n of ['DATE', 'TIME']) for (const o of combos) {
    const when = at(2026, m, d, m, d, 59);
    const txt = t(n, o, when), width = KeywordSpec.systemValueConstantWidth(n, o);
    if (txt.length > width) worst = worst || (n + JSON.stringify(o) + ' ' + JSON.stringify(txt) + ' > ' + width);
  }
  check('the preview text is never longer than the field is drawn (' + (worst || 'all combinations') + ')', worst === null);
  check('the engine passes it through unchanged', (() => {
    const src = '     A          R REC1\n     A                                  2  2DATE(*YY)\n     A                                      EDTCDE(Y)\n';
    const f = DspfEngine.resolveScreen(DspfParser.parseDspf(src), 'REC1').fields[0];
    return /^\d\d\/\d\d\/\d{4}$/.test(f.text.replace(/^ /, '0')) && f.text.length === f.length;
  })());
}

console.log('\n4. TIME\'s "only" rule');
{
  const base = '     A          R R1\n     A                                  2  2TIME\n';
  const parse = (extra) => DspfParser.parseDspf(base + extra);
  const reason = (extra) => DspfWriter.systemValueKeywordNewConflictReason(parse(''), parse(extra));
  check('the section says "only" (and not for the others)', REF.indexOf('You can specify only the location of the field, TIME, and optionally') >= 0 && KeywordSpec.companionsStatedAsOnly('TIME') && !KeywordSpec.companionsStatedAsOnly('DATE'));
  ['COLOR(RED)', 'EDTCDE(Y)', "EDTWRD('0 &HRS&; &MINS&; &SECS')", 'DSPATR(HI)', "TEXT('t')"].forEach((k) => {
    check('TIME + ' + k + ' is allowed', reason('     A                                      ' + k + '\n') === null);
  });
  ["DFT('X')", 'DATE', 'USER', 'HTML(\'<b>\')', 'DUP', 'CHECK(ME)'].forEach((k) => {
    const r = reason('     A                                      ' + k + '\n');
    check('TIME + ' + k + ' is refused and says "only"', typeof r === 'string' && /specify only the location of the field, TIME/.test(r) && /per the DDS Reference/.test(r));
  });
  check('the reason names the refused keyword first', /^DFT cannot be specified on a field with TIME/.test(reason('     A                                      DFT(\'X\')\n')));
  const d = '     A          R R1\n     A                                  2  2DATE\n';
  check('DATE + DFT is not refused by this rule ("optionally" is not "only" - left open)', DspfWriter.systemValueKeywordNewConflictReason(DspfParser.parseDspf(d), DspfParser.parseDspf(d + '     A                                      DFT(\'X\')\n')) === null);
  // diff-based
  const bad = base + "     A                                      DFT('X')\n";
  check('an already-invalid hand-written TIME + DFT does not block an unrelated edit', DspfWriter.systemValueKeywordNewConflictReason(DspfParser.parseDspf(bad), DspfParser.parseDspf(bad + '     A                                      COLOR(RED)\n')) === null);
  check('a second refused keyword beside the invalid pair is reported', /^DUP cannot/.test(DspfWriter.systemValueKeywordNewConflictReason(DspfParser.parseDspf(bad), DspfParser.parseDspf(bad + '     A                                      DUP\n'))));
  check('removing the refused keyword is allowed', DspfWriter.systemValueKeywordNewConflictReason(DspfParser.parseDspf(bad), parse('')) === null);
}

console.log('\n5. the real webview in jsdom');
const SRC = [
  '     A          R RECORD1',
  '     A                                  2  2TIME',
  '     A                                  3  2DATE',
  "     A                                  4  2'LIT'",
].join('\n') + '\n';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const posted = [], alerts = [];
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'n1', SRC, 'I154.DSPF'), {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = (m) => alerts.push(m);
      w.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
    },
  });
  await wait(1200);
  const doc = dom.window.document;
  const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
  check('setup: three field boxes', boxes.length === 3);
  const shown = boxes.map((b) => b.textContent.trim());
  check('the TIME box shows hh:mm:ss and the DATE box six digits (not a locale string)', /^\d\d:\d\d:\d\d$/.test(shown[0]) && /^\d{6}$/.test(shown[1]));
  boxes[0].click();
  function rawAdd(line, name, params) {
    posted.length = 0; alerts.length = 0;
    doc.getElementById('field-' + line + '-new-kw-name').value = name;
    const pe = doc.getElementById('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    return { alert: alerts[0] || null, edited: posted.some((m) => m.type === 'applyEdit') };
  }
  let r = rawAdd(2, 'DFT', "'X'");
  check('raw editor: DFT onto the TIME constant is refused with the "only" reason', !r.edited && /specify only the location of the field, TIME/.test(r.alert || ''));
  boxes[0].click();
  r = rawAdd(2, 'COLOR', 'RED');
  check('raw editor: COLOR onto the TIME constant is allowed', r.edited && !r.alert);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();

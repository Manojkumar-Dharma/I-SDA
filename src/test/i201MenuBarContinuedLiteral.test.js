/**
 * i201MenuBarContinuedLiteral.test.js
 *
 * Task I-201 - the MNUBARCHC 12-line count (I-173) is taken from the parser's joined keyword text, and
 * a literal split over continuation lines was never run through it. IBM's DDS keyword rules: '-'
 * continues at position 45 of the next line (its leading blanks are part of the value), '+' continues
 * with the first nonblank character of the next line, and blanks before the sign are kept. The parser
 * used to put an extra blank after '+' and keep the next line's leading blanks, so a '+'-split literal
 * read longer than the compiler sees it and the count could refuse an edit that fits.
 *
 * Covers: 1. the parser join  2. the counter on continued literals  3. the model guard at the 12-line
 * boundary  4. the committed-edit hook (jsdom, raw keyword editor)
 *
 * Run with: node src/test/i201MenuBarContinuedLiteral.test.js
 */
'use strict';

const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
global.DspfWriter = DspfWriter;
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require('../../dist/dspfParser.js');

const A = '     A';
const L = (s) => A + s;
const KW = (s) => L('                                      ' + s);
const X = (n) => 'X'.repeat(n);
const mk = (t) => DspfParser.parseDspf(t);
const head = [L('          R MENUBAR                   MNUBAR'), L('            MNUFLD         2Y 0B  1  2')];
const field = (m) => m.records[0].fields.filter((f) => f.name === 'MNUFLD')[0];
const params = (lines) => { const m = mk(head.concat(lines).join('\n') + '\n'); return field(m).keywords.filter((k) => k.name === 'MNUBARCHC')[0].parameters; };
const textOf = (lines) => DspfEngine.parseMenubarChoice(params(lines)).text;

console.log('=== 1. the parser join follows the DDS continuation rules ===');
check("'+' : the next line's leading blanks are dropped and no blank is added", textOf([KW("MNUBARCHC(1 P 'ABC+"), KW("   DEF')")]) === 'ABCDEF');
check("'-' : the next line starts at position 45, so its leading blanks are kept", textOf([KW("MNUBARCHC(1 P 'ABC-"), KW("   DEF')")]) === 'ABC   DEF');
check("blanks before the sign are part of the value for both signs", textOf([KW("MNUBARCHC(1 P 'ABC  +"), KW("DEF')")]) === 'ABC  DEF' && textOf([KW("MNUBARCHC(1 P 'ABC  -"), KW("DEF')")]) === 'ABC  DEF');
check("'+' between parameters keeps the blank written before it and adds none", params([KW("MNUBARCHC(1 P +"), KW("'ABC')")]) === "1 P 'ABC'");
check("'+' with no blank before it joins the tokens exactly as written (no blank invented)", params([KW("MNUBARCHC(1 P+"), KW("'ABC')")]) === "1 P'ABC'");
check("three lines: '+' then '-' each apply to their own join", textOf([KW("MNUBARCHC(1 P 'A+"), KW("  B-"), KW("  C')")]) === 'AB  C');
check("the '+'-split 36-character literal (4 leading blanks on line 2) parses to 36 characters", textOf([KW("MNUBARCHC(1 P '" + X(18) + "+"), KW('    ' + X(18) + "')")]).length === 36);

// n MNUBARCHC choices, each a 36-character literal split over two lines (18 + 18) with the given sign
function src(n, sign, o) {
  o = o || {};
  const out = head.slice();
  for (let i = 1; i <= n; i++) {
    out.push(KW('MNUBARCHC(' + i + " P '" + X(18) + (sign || '+')));
    out.push(KW((sign === '-' ? '' : '    ') + X(18) + "')"));
  }
  return out.join('\n') + '\n';
}
const countOf = (t) => { const m = mk(t); return DspfWriter.menuBarFieldLineCount(m, m.records[0], field(m)); };
const reason = (a, b) => DspfWriter.choiceMenuBarNewConflictReason(mk(a), mk(b));

console.log('\n=== 2. the counter on continued literals ===');
check('a continued literal counts at its real length: 2 x 36 + 3 = 75 fits the 76-position line (2 choices, 1 line)', countOf(src(2)).text === 1);
check('three of them need 2 lines (36 + 3 + 36 + 3 + 36 > 76)', countOf(src(3)).text === 2);
check('22 continued choices = 11 lines + the separator = 12', (() => { const c = countOf(src(22)); return c.text === 11 && c.total === 12; })());
check('23 continued choices = 12 lines + the separator = 13', countOf(src(23)).total === 13);
check("'-' split without leading blanks counts the same as '+' split with them", countOf(src(22, '-')).total === countOf(src(22, '+')).total);
// the same 22 choices as 36-position &field text (no continuation involved)
const fieldSrc = (n) => {
  const out = [head[0], L('            TXA           36A  P'), head[1]];
  for (let i = 1; i <= n; i++) out.push(KW('MNUBARCHC(' + i + ' P &TXA)'));
  return out.join('\n') + '\n';
};
check('the count equals the count of the same choices written as 36-position &field text', [2, 3, 11, 22, 23].every((n) => countOf(src(n)).total === countOf(fieldSrc(n)).total && countOf(src(n)).text === countOf(fieldSrc(n)).text));

console.log('\n=== 3. model guard at the 12-line boundary ===');
check('11 -> 12 continued choices is not refused (6 lines + separator; counting the extra blanks would say 13)', reason(src(11), src(12)) === null);
check('22 -> 23 continued choices is refused with the DDS wording (13 lines)', /would occupy 13 lines \(12 for the choices plus the separator line\)/.test(reason(src(22), src(23)) || ''));
check('22 continued choices already at the limit, nothing added, is not refused', reason(src(22), src(22)) === null);

console.log('\n=== 4. the committed-edit hook (jsdom, raw keyword editor) ===');
const SRC = src(22);
const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I201.DSPF');
const posted = [];
const alerts = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => alerts.push(m);
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const el = (id) => doc.getElementById(id);
  const box = doc.querySelector('.dspf-field[data-source-line="2"]');
  check('fixture: the menu-bar field is on the canvas', !!box);
  if (!box) { process.exit(1); }
  box.click();
  posted.length = 0; alerts.length = 0;
  function rawAdd(line, name, p) {
    el('field-' + line + '-new-kw-name').value = name;
    const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = p || '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  }
  rawAdd(2, 'MNUBARCHC', "23 P '" + X(18) + "'");
  check('raw-adding a 23rd choice to the 22 continued ones (a 12th line + the separator = 13) is refused with the DDS wording and posts nothing',
    alerts.length === 1 && /would occupy 13 lines \(12 for the choices plus the separator line\)/.test(alerts[0]) && !posted.some((m) => m.type === 'applyEdit'));
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

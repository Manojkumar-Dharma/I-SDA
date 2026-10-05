/**
 * i173MenuBarLineLimit.test.js
 *
 * Task I-173 - opened from I-172's deferred finding. A menu-bar field may occupy at most 12 lines,
 * the separator line included (MNUBARCHC section). The reference gives the count formula (choice-text
 * lengths plus 3 blanks between choices) but not the line width or the wrapping, so two decisions are
 * recorded in the spec and tested here: a line holds (smallest DSPSIZ width - 4) text positions (76 on
 * 80 columns, 128 on 132) and a choice that does not fit moves whole to the next line; the separator
 * counts as one of the 12 unless the record's MNUBAR says *NOSEPARATOR.
 *
 * Covers: 1. spec accessor  2. the line counter  3. model guard (diff semantics)  4. the committed-edit hook (jsdom)
 *
 * Run with: node src/test/i173MenuBarLineLimit.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require('../../dist/dspfParser.js');

console.log('=== 1. spec accessor ===');
const rules = KeywordSpec.menuBarLineRules();
check('12 lines, 3 blanks between choices, width = columns - 4, separator counts', rules.maxLines === 12 && rules.blanksBetweenChoices === 3 && rules.columnsMinus === 4 && rules.separatorCountsAsLine === true);
const maxLen = KeywordSpec.RECORD_TYPES.MNUBARCHC.choiceText.maxLength;
check('columns - 4 reproduces the reference\'s own 76 (80 columns) and 128 (132 columns) maximums', 80 - rules.columnsMinus === maxLen['24x80'] && 132 - rules.columnsMinus === maxLen['27x132']);
check('the accessor returns a fresh object', (() => { const r = KeywordSpec.menuBarLineRules(); r.maxLines = 1; return KeywordSpec.menuBarLineRules().maxLines === 12; })());

const A = '     A';
const L = (s) => A + s;
const KW = (s) => L('                                      ' + s);
const X = (n) => 'X'.repeat(n);
const mk = (t) => DspfParser.parseDspf(t);
// DDS keyword text stops at column 80 (the parser cuts there), so a one-line MNUBARCHC holds at most an
// 18-character literal: that is the default choice here. Longer choices come from &field text fields.
//   o.len     literal length (default 18)          o.trail   trailing blanks added to each literal
//   o.fields  [lengths]: define TXA, TXB, ... (character, usage P) and use &TXA, &TXB, ... as the choices
function src(count, o) {
  o = o || {};
  const lines = [];
  if (o.dspsiz) lines.push(KW('DSPSIZ(' + o.dspsiz + ')'));
  lines.push(L('          R MENUBAR                   MNUBAR' + (o.nosep ? '(*NOSEPARATOR)' : '')));
  (o.fields || []).forEach((n, i) => lines.push(L('            ' + ('TX' + String.fromCharCode(65 + i)).padEnd(11, ' ') + String(n).padStart(5, ' ') + 'A  P')));
  lines.push(L('            MNUFLD         2Y 0B  1  2'));
  for (let i = 1; i <= count; i++) {
    const text = o.fields ? '&TX' + String.fromCharCode(65 + ((i - 1) % o.fields.length)) : "'" + X(o.len || 18) + ' '.repeat(o.trail || 0) + "'";
    lines.push(KW('MNUBARCHC(' + i + ' P ' + text + ')'));
  }
  return lines.join('\n') + '\n';
}
const countOf = (t) => { const m = mk(t); const r = m.records[0]; return DspfWriter.menuBarFieldLineCount(m, r, r.fields.filter((f) => f.name === 'MNUFLD')[0]); };
const reason = (a, b) => DspfWriter.choiceMenuBarNewConflictReason(mk(a), mk(b));

console.log('\n=== 2. the line counter ===');
check('no MNUBARCHC on the field -> null', countOf(src(0)) === null);
check('one choice -> 1 line + separator = 2', (() => { const c = countOf(src(1)); return c.text === 1 && c.separator === true && c.total === 2; })());
check('18 + 3 + 18 + 3 + 18 = 60 fits 76: three choices share a line', countOf(src(3)).text === 1);
check('a fourth 18-character choice does not fit (60 + 3 + 18 > 76): it moves whole to line 2', countOf(src(4)).text === 2);
check('seven choices need three lines (3 + 3 + 1)', countOf(src(7)).text === 3);
check('boundary: 36 + 3 + 37 = 76 fits on one line', countOf(src(2, { fields: [36, 37] })).text === 1);
check('boundary: 36 + 3 + 38 = 77 does not fit', countOf(src(2, { fields: [36, 38] })).text === 2);
check('trailing blanks of a literal are not counted (5 x 10 + 4 x 3 = 62 on one line, not 5 x 16)', countOf(src(5, { len: 10, trail: 6 })).text === 1);
check('on 27x132 (capacity 128) six 18-character choices fit one line (123)', countOf(src(6, { dspsiz: '27 132 *DS4' })).text === 1 && countOf(src(7, { dspsiz: '27 132 *DS4' })).text === 2);
check('the SMALLEST declared width wins: 24x80 beside 27x132 still wraps at 76', countOf(src(6, { dspsiz: '24 80 *DS3 27 132 *DS4' })).text === 2);
check('no DSPSIZ means 24x80', countOf(src(6)).text === countOf(src(6, { dspsiz: '24 80 *DS3' })).text);
check('the reference example: five choices of 15 with 3 between (78 positions) occupy 2 lines on 24x80', countOf(src(5, { len: 15 })).text === 2 && 5 * 15 + 3 === 78);
check('*NOSEPARATOR: the separator is not counted', (() => { const c = countOf(src(2, { nosep: true })); return c.separator === false && c.total === c.text; })());
check('a &field choice counts at the field\'s own length (40 + 3 + 40 > 76 -> 2 lines)', countOf(src(2, { fields: [40] })).text === 2);
check('a &field that does not exist is skipped, not counted', countOf(src(2).replace(/'X+'/g, '&MISSING')).text === 0);
check('a single choice longer than a line is counted as one line, not many', countOf(src(1, { fields: [200] })).text === 1);
check('choices are laid out in ascending choice-number order, not source order', (() => {
  const t = [L('          R MENUBAR                   MNUBAR'), L('            MNUFLD         2Y 0B  1  2'),
    KW("MNUBARCHC(3 P '" + X(18) + "')"), KW("MNUBARCHC(1 P '" + X(18) + "')"), KW("MNUBARCHC(2 P '" + X(18) + "')"), KW("MNUBARCHC(4 P '" + X(18) + "')")].join('\n') + '\n';
  return countOf(t).text === 2;
})());

console.log('\n=== 3. model guard (diff semantics) ===');
check('33 choices = 11 lines + the separator = 12 is accepted', reason(src(32), src(33)) === null && countOf(src(33)).total === 12);
const over = reason(src(33), src(34));
check('a 12th line of choices + the separator = 13 is refused with the DDS wording', /Menu-bar field MNUFLD in record format MENUBAR would occupy 13 lines \(12 for the choices plus the separator line\), but a menu-bar field can occupy at most 12 lines, separator line included/.test(over || ''));
check('with *NOSEPARATOR 12 lines of choices are accepted (36 choices)', reason(src(35, { nosep: true }), src(36, { nosep: true })) === null);
check('with *NOSEPARATOR 13 lines of choices are refused (37 choices)', /would occupy 13 lines, but/.test(reason(src(36, { nosep: true }), src(37, { nosep: true })) || ''));
check('adding the separator back (dropping *NOSEPARATOR) on a 36-choice menu bar is refused', /would occupy 13 lines/.test(reason(src(36, { nosep: true }), src(36)) || ''));
check('lengthening the choice text field so that the count passes 12 is refused (34 lines)', /would occupy 34 lines/.test(reason(src(33, { fields: [18] }), src(33, { fields: [40] })) || ''));
check('on 27x132 the same 34 choices fit (6 per line -> 6 lines)', reason(src(33, { dspsiz: '27 132 *DS4' }), src(34, { dspsiz: '27 132 *DS4' })) === null);
check('removing 27x132 (so 80 columns apply) on a 34-choice menu bar is refused', /would occupy 13 lines/.test(reason(src(34, { dspsiz: '27 132 *DS4' }), src(34)) || ''));
check('an already-over-limit hand-written file does not block an unrelated edit', reason(src(34), src(34).replace('MNUFLD         2Y 0B  1  2', 'MNUFLD         2Y 0B  1  3')) === null);
check('...and is not reported twice', reason(src(34), src(34)) === null);
check('a record with no MNUBAR keyword has no separator line', countOf(src(34).replace('MNUBAR', '      ')).separator === false);
check('a null / empty model is harmless', DspfWriter.choiceMenuBarNewConflictReason(null, null) === null);

console.log('\n=== 4. the committed-edit hook (jsdom, raw keyword editor) ===');
const SRC = src(32);
const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I173.DSPF');
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
  const lastEdit = () => posted.filter((m) => m.type === 'applyEdit').pop();
  const box = doc.querySelector('.dspf-field[data-source-line="2"]');
  check('fixture: the menu-bar field is on the canvas', !!box);
  if (!box) { process.exit(1); }
  box.click();
  posted.length = 0; alerts.length = 0;
  function rawAdd(line, name, params) {
    el('field-' + line + '-new-kw-name').value = name;
    const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  }
  rawAdd(2, 'MNUBARCHC', "33 P '" + X(18) + "'");
  check('raw-adding the 33rd choice (11 lines + the separator = 12) is accepted, no alert', alerts.length === 0 && !!lastEdit());
  posted.length = 0;
  doc.querySelector('.dspf-field[data-source-line="2"]').click();
  posted.length = 0; alerts.length = 0;
  rawAdd(2, 'MNUBARCHC', "34 P '" + X(18) + "'");
  check('raw-adding the 34th choice (a 12th line + the separator = 13) is refused with the DDS wording and posts nothing', alerts.length === 1 && /would occupy 13 lines \(12 for the choices plus the separator line\)/.test(alerts[0]) && !lastEdit());
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

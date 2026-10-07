/**
 * i183ChoiceKeywordValueRules.test.js
 *
 * Task I-183 - the value rules the choice keywords' DDS Reference sections state, enforced by the model-diff
 * guard choiceMenuBarNewConflictReason (every source change, whichever editor made it):
 *
 *   CHCAVAIL / CHCUNAVAIL / CHCSLT   "one parameter must be specified"; (*COLOR x) one of BLU GRN PNK RED TRQ
 *                                    YLW WHT; (*DSPATR ...) each of BL CS HI ND RI UL; only those two groups,
 *                                    one of each per keyword; on a field and on a subfile control record
 *   CHCACCEL                         choice number 1-99; the accelerator text is required, a quoted string or
 *                                    a &field (an existing one must be character, usage P)
 *   CHCCTL                           choice number 1-99 (a range error, not "needs a CHOICE"); the control
 *                                    field is required (its own sentence); a message id needs a message file;
 *                                    an existing &field message id / file / library must be character, usage
 *                                    P, 7 / 10 long
 *   decision                         a missing control field gets its own sentence ("needs a control field"),
 *                                    and no longer the unrelated "needs a CHOICE ..." one; one group per
 *                                    parameter slot inside one keyword (as WDWBORDER / WDWTITLE, I-182)
 *
 * Diff-based: a hand-written file that already breaks a rule stays editable. Not covered: the accelerator
 * text's combined width with the longest choice text, and option indicators on CHCACCEL / CHCCTL.
 *
 * Run with: node src/test/i183ChoiceKeywordValueRules.test.js
 */
'use strict';
const path = require('path');
const W = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, s) => { for (let i = 0; i < s.length; i++) a[c - 1 + i] = s[i]; };
  put(6, 'A');
  if (o.r) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.use) put(38, o.use);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.col !== undefined) put(42, String(o.col).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const K = (fn) => dds({ fn });
const model = (...ls) => DspfParser.parseDspf(ls.join('\n') + '\n');
const FIELDS = [
  dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' }),
  dds({ name: 'MSGID', len: 7, type: 'A', use: 'P' }),
  dds({ name: 'MSGF', len: 10, type: 'A', use: 'P' }),
  dds({ name: 'BADID', len: 5, type: 'A', use: 'P' }),
  dds({ name: 'BADF', len: 10, type: 'A', use: 'O', line: 9, col: 2 }),
  dds({ name: 'TXT', len: 10, type: 'A', use: 'P' }),
  dds({ name: 'BADTXT', len: 10, type: 'A', use: 'O', line: 10, col: 2 }),
];
const fieldLines = (kws) => [dds({ name: 'F1', use: 'B', line: 2, col: 2, fn: 'SNGCHCFLD' }), K("CHOICE(1 'One')")].concat(kws.map(K));
const mk = (...kws) => model(dds({ r: 1, name: 'PD1', fn: 'PULLDOWN(*NOSLTIND)' }), ...fieldLines(kws), ...FIELDS);
const base = mk();
const g = (before, after) => W.choiceMenuBarNewConflictReason(before, after);
const adds = (kw, re, label) => { const r = g(base, mk(kw)); check(label || (kw + ' is refused'), !!r && re.test(r)); };
const okAdd = (kw, label) => check(label || (kw + ' is accepted'), g(base, mk(kw)) === null);

console.log('=== spec facts ===');
{
  const c = KeywordSpec.choiceStateValueRules('CHCAVAIL');
  check('CHCAVAIL / CHCUNAVAIL / CHCSLT state "one parameter" and the colour and display-attribute lists',
    ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].every((k) => { const r = KeywordSpec.choiceStateValueRules(k); return r.minParameters === 1 && r.colors.join() === 'BLU,GRN,PNK,RED,TRQ,YLW,WHT' && r.displayAttributes.join() === 'BL,CS,HI,ND,RI,UL'; }) && !!c);
  check('a keyword with no such facts has none', KeywordSpec.choiceStateValueRules('BLANKS') === null && KeywordSpec.choiceNumberRange('BLANKS') === null);
  const a = KeywordSpec.choiceNumberRange('CHCACCEL'), b = KeywordSpec.choiceNumberRange('CHCCTL');
  check('CHCACCEL and CHCCTL state the choice number range 1 to 99', a.min === 1 && a.max === 99 && b.min === 1 && b.max === 99);
  const s = KeywordSpec.choiceTextAndMessageRules();
  check('the accelerator text field is A / P; the message id field A / P / 7 and the file / library field A / P / 10; a file is required with an id',
    s.acceleratorTextField.dataType === 'A' && s.acceleratorTextField.usage === 'P' && s.messageIdField.length === 7 && s.messageFileField.length === 10 && s.messageFileRequiredWithId === true);
}

console.log('\n=== CHCAVAIL / CHCUNAVAIL / CHCSLT: one parameter ===');
{
  ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].forEach((k) => {
    adds(k, new RegExp(k + ' on field F1 needs a parameter'), 'a bare ' + k + ' is refused');
    adds(k + '()', /needs a parameter/, 'an empty ' + k + '() is refused');
    okAdd(k + '((*COLOR RED))', k + ' with one colour is accepted');
  });
  okAdd('CHCAVAIL((*DSPATR HI))', 'CHCAVAIL with only a display attribute is accepted');
  okAdd('CHCAVAIL((*COLOR RED) (*DSPATR HI UL))', 'a colour and display attributes together are accepted');
}

console.log('\n=== CHCAVAIL / CHCUNAVAIL / CHCSLT: value lists and forms ===');
{
  ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'YLW', 'WHT'].forEach((c) => okAdd('CHCAVAIL((*COLOR ' + c + '))'));
  ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].forEach((k) => {
    adds(k + '((*COLOR XYZ))', new RegExp(k + ' on field F1: \\(\\*COLOR XYZ\\) is not valid; give one colour: BLU, GRN'));
    adds(k + '((*DSPATR QQ))', new RegExp(k + ' on field F1: display attribute QQ is not valid; use BL, CS, HI, ND, RI, UL'));
  });
  adds('CHCAVAIL((*COLOR))', /is not valid/, 'a (*COLOR) with no value is refused');
  adds('CHCAVAIL((*COLOR RED BLU))', /is not valid/, 'a (*COLOR RED BLU) with two values is refused');
  adds('CHCAVAIL((*DSPATR HI QQ))', /display attribute QQ/, 'one bad value among good display attributes is refused, naming it');
  okAdd('CHCAVAIL((*COLOR red))', 'lower-case colour is accepted');
  okAdd('CHCAVAIL((*DSPATR BL CS HI ND RI UL))', 'all six display attributes are accepted');
  adds('CHCAVAIL(*TOP)', /\*TOP, which is not a parameter of this keyword; use \(\*COLOR/, 'a bare token is refused');
  adds("CHCAVAIL((*CHAR 'x'))", /\(\*CHAR \.\.\.\), which is not a parameter/, 'a (*CHAR ...) group is refused');
  adds('CHCAVAIL((*COLOR RED) (*COLOR BLU))', /more than one \*COLOR group/, 'two colour groups in one keyword are refused (decision)');
  adds('CHCAVAIL((*DSPATR HI) (*DSPATR UL))', /more than one \*DSPATR group/, 'two display-attribute groups in one keyword are refused (decision)');
}

console.log('\n=== CHCAVAIL / CHCSLT on a subfile control record ===');
{
  const sfl = (kw) => model(dds({ r: 1, name: 'SFL1', fn: 'SFL' }), dds({ name: 'S1', len: 2, type: 'Y', dec: 0, use: 'O', line: 5, col: 2 }), dds({ r: 1, name: 'CTL1X', fn: 'SFLCTL(SFL1)' }), K('SFLSNGCHC'), kw ? K(kw) : K('SFLDSP'));
  check('record-level CHCAVAIL((*COLOR YLW)) with SFLSNGCHC is accepted', g(sfl(''), sfl('CHCAVAIL((*COLOR YLW))')) === null);
  const r = g(sfl(''), sfl('CHCAVAIL((*COLOR XYZ))'));
  check('record-level CHCAVAIL((*COLOR XYZ)) is refused, naming the record format', !!r && /CHCAVAIL on record format CTL1X: \(\*COLOR XYZ\) is not valid/.test(r));
  const b = g(sfl(''), sfl('CHCAVAIL'));
  check('a bare record-level CHCAVAIL is refused', !!b && /CHCAVAIL on record format CTL1X needs a parameter/.test(b));
}

console.log('\n=== CHCACCEL ===');
{
  okAdd("CHCACCEL(1 'F4')", "CHCACCEL(1 'F4') is accepted");
  okAdd("CHCACCEL(99 'Alt+X')", 'choice number 99 is accepted');
  okAdd("CHCACCEL(01 'F4')", 'a leading zero is accepted (as for CHOICE)');
  adds("CHCACCEL(100 'F4')", /CHCACCEL\(100\) on field F1: the choice number must be a whole number from 1 to 99/, 'CHCACCEL(100 ...) is a range error');
  adds("CHCACCEL(0 'F4')", /CHCACCEL\(0\).*from 1 to 99/, 'CHCACCEL(0 ...) is a range error');
  adds("CHCACCEL(abc 'F4')", /CHCACCEL\(abc\).*from 1 to 99/, 'a non-numeric choice number is refused');
  adds('CHCACCEL(1)', /CHCACCEL\(1\) on field F1 needs the accelerator text/, 'CHCACCEL(1) with no text is refused');
  adds('CHCACCEL', /CHCACCEL on field F1 needs a choice number \(1 to 99\)/, 'a bare CHCACCEL is refused');
  adds('CHCACCEL(1 F4)', /accelerator text must be a character string in single quotes or a &field-name/, 'unquoted text (CHCACCEL(1 F4)) is refused');
  okAdd("CHCACCEL(1 'it''s')", 'a doubled quote inside the text is accepted');
  okAdd('CHCACCEL(1 &TXT)', 'a &field text that is character, usage P is accepted');
  adds('CHCACCEL(1 &BADTXT)', /accelerator text field BADTXT must be usage P \(per the DDS Reference\)/, 'a &field text with usage O is refused');
  okAdd('CHCACCEL(1 &NOTYET)', 'a &field text that does not exist yet is a forward reference, accepted');
}

console.log('\n=== CHCCTL ===');
{
  okAdd('CHCCTL(1 &CTL1)', 'CHCCTL(1 &CTL1) is accepted');
  okAdd('CHCCTL(01 &CTL1)', 'a leading zero still matches CHOICE 1');
  adds('CHCCTL(100 &CTL1)', /CHCCTL\(100\) on field F1: the choice number must be a whole number from 1 to 99/, 'CHCCTL(100 ...) is a range error');
  adds('CHCCTL(0 &CTL1)', /CHCCTL\(0\).*from 1 to 99/, 'CHCCTL(0 ...) is a range error');
  const none = g(base, mk('CHCCTL(1)'));
  check('CHCCTL(1) with no control field gets its own sentence', !!none && /CHCCTL\(1\) on field F1 needs a control field \(&field-name\) after the choice number/.test(none));
  check('...and not the unrelated "needs a CHOICE" one', !/needs a CHOICE/.test(none || ''));
  adds('CHCCTL', /CHCCTL on field F1 needs a choice number/, 'a bare CHCCTL is refused');
  adds('CHCCTL(2 &CTL1)', /CHCCTL\(2\) on field F1 needs a CHOICE or PSHBTNCHC keyword with the same choice number/, 'a number with no matching CHOICE is still refused for that');
  adds('CHCCTL(1 &CTL1 MSG0001)', /gives message MSG0001 without a message file/, 'a message id with no message file is refused');
  okAdd('CHCCTL(1 &CTL1 MSG0001 MYLIB/MYMSGF)', 'a message id and a qualified message file are accepted');
  okAdd('CHCCTL(1 &CTL1 &MSGID &MSGF)', '&field message id / file that are character, usage P, 7 / 10 long are accepted');
  adds('CHCCTL(1 &CTL1 &BADID &MSGF)', /message id field BADID must be 7 long \(per the DDS Reference\)/, 'a &field message id 5 long is refused');
  adds('CHCCTL(1 &CTL1 &MSGID &BADF)', /message file \/ library field BADF must be usage P/, 'a &field message file with usage O is refused');
  okAdd('CHCCTL(1 &CTL1 &MSGID &NOTYET)', 'a &field message file that does not exist yet is a forward reference, accepted');
  okAdd('CHCCTL(1 &CTL1 MSG0001 &MSGF/&MSGF)', 'a &library/&file pair of valid fields is accepted');
}

console.log('\n=== diff-based: hand-written problems stay editable ===');
{
  const bad = mk('CHCAVAIL((*COLOR XYZ))', "CHCACCEL(100 'F4')");
  check('an unrelated keyword added next to existing bad values is accepted', g(bad, mk('CHCAVAIL((*COLOR XYZ))', "CHCACCEL(100 'F4')", 'CHCSLT((*COLOR RED))')) === null);
  check('removing the bad keywords is accepted', g(bad, base) === null);
  check('changing the bad colour to a good one is accepted; to another bad one is refused',
    g(bad, mk('CHCAVAIL((*COLOR RED))', "CHCACCEL(100 'F4')")) === null && !!g(bad, mk('CHCAVAIL((*COLOR QQQ))', "CHCACCEL(100 'F4')")));
  check('null / undefined models do not throw', g(null, null) === null && g(undefined, base) === null);
}

console.log('\n=== webview: raw keyword editor (jsdom) ===');
const SOURCE = [dds({ r: 1, name: 'PD1', fn: 'PULLDOWN(*NOSLTIND)' })].concat(fieldLines([]), FIELDS).join('\n') + '\n';
const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'I183.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (t) => { alerts.push(String(t)); };
  },
});
setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (e, type) => e.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const sel = doc.getElementById('recordSelect');
  const rawAdd = (name, params) => {
    sel.value = 'PD1'; fire(sel);
    const box = doc.querySelector('.dspf-field[data-field="F1"]');
    if (!box) { check('setup: F1 is on the canvas', false); return; }
    box.click();
    const owner = 'field-' + box.getAttribute('data-source-line');
    doc.getElementById(owner + '-new-kw-name').value = name;
    const pe = doc.getElementById(owner + '-new-kw-params'); if (pe) pe.value = params || '';
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
  };
  const refused = (re) => lastText() === null && alerts.some((a) => re.test(a));
  const f1 = (t) => { const r = DspfParser.parseDspf(t).records[0]; return r.fields.find((f) => f.name === 'F1'); };

  rawAdd('CHCAVAIL', '');
  check('raw-adding a bare CHCAVAIL is refused: no edit, "needs a parameter"', refused(/CHCAVAIL on field F1 needs a parameter/));
  rawAdd('CHCAVAIL', '(*COLOR XYZ)');
  check('raw-adding CHCAVAIL((*COLOR XYZ)) is refused', refused(/\(\*COLOR XYZ\) is not valid/));
  rawAdd('CHCACCEL', "100 'F4'");
  check("raw-adding CHCACCEL(100 'F4') is refused as a range error", refused(/from 1 to 99/));
  rawAdd('CHCACCEL', '1');
  check('raw-adding CHCACCEL(1) is refused (text required)', refused(/needs the accelerator text/));
  rawAdd('CHCCTL', '1');
  check('raw-adding CHCCTL(1) is refused with the control-field sentence', refused(/needs a control field/));
  rawAdd('CHCAVAIL', '(*COLOR YLW) (*DSPATR HI)');
  {
    const f = lastText() && f1(lastText());
    check('a valid CHCAVAIL((*COLOR YLW) (*DSPATR HI)) is accepted and written, with no alert', alerts.length === 0 && !!f && f.keywords.some((k) => k.name === 'CHCAVAIL'));
  }
  rawAdd('CHCACCEL', "1 'F4'");
  {
    const f = lastText() && f1(lastText());
    check("a valid CHCACCEL(1 'F4') is accepted and written", alerts.length === 0 && !!f && f.keywords.some((k) => k.name === 'CHCACCEL'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

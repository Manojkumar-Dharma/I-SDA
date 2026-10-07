/**
 * i182WindowBorderTitleRules.test.js
 *
 * Task I-182 - the WDWBORDER and WDWTITLE rules their DDS Reference sections state, enforced through the
 * model-diff guard windowHelpMenuNewConflictReason (every source change, whichever editor made it):
 *
 *   record level   WDWBORDER needs WINDOW or PULLDOWN on the same record (WDWTITLE needs WINDOW: I-152)
 *   parameters     "At least one parameter must be specified" for both keywords (file level too)
 *   values         (*COLOR x) one of BLU GRN WHT RED TRQ YLW PNK; (*DSPATR ...) each of BL CS HI ND RI UL
 *   forms          WDWBORDER takes (*COLOR) (*DSPATR) (*CHAR); WDWTITLE takes (*TEXT) (*COLOR) (*DSPATR),
 *                  *CENTER / *LEFT / *RIGHT and *TOP / *BOTTOM; anything else is refused
 *   decision       the format line has ONE slot per parameter, so two colours, two alignments or two
 *                  positions inside ONE keyword (WDWTITLE(*TOP *BOTTOM)) are refused; several keyword
 *                  instances still combine and are not compared
 *
 * Diff-based: a hand-written file that already breaks a rule stays editable.
 *
 * Run with: node src/test/i182WindowBorderTitleRules.test.js
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
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const R = (name, fn) => dds({ r: 1, name, fn });
const K = (fn) => dds({ fn });
const model = (...ls) => DspfParser.parseDspf(ls.join('\n') + '\n');
const win = (kw) => model(R('W1'), K('WINDOW(5 5 10 40)'), K(kw));
const base = model(R('W1'), K('WINDOW(5 5 10 40)'));
const g = (before, after) => W.windowHelpMenuNewConflictReason(before, after);
const adds = (kw, re, label) => { const r = g(base, win(kw)); check(label || (kw + ' is refused'), !!r && re.test(r)); };
const okAdd = (kw, label) => check(label || (kw + ' is accepted'), g(base, win(kw)) === null);

console.log('=== spec facts ===');
{
  const v = KeywordSpec.wdwborderVocabulary();
  check('WDWBORDER states its colour list (the seven of its section), display attributes and the WINDOW / PULLDOWN requirement',
    v.colors.join() === 'BLU,GRN,WHT,RED,TRQ,YLW,PNK' && v.displayAttributes.join() === 'BL,CS,HI,ND,RI,UL' && v.requiresOneOfOnRecord.join() === 'WINDOW,PULLDOWN');
  check('minParameters is 1 for WDWBORDER and WDWTITLE and 0 for a keyword that states none', KeywordSpec.minParameters('WDWBORDER') === 1 && KeywordSpec.minParameters('WDWTITLE') === 1 && KeywordSpec.minParameters('BLANKS') === 0);
}

console.log('\n=== record-level WDWBORDER needs WINDOW or PULLDOWN ===');
{
  const plain = model(R('R1'));
  const r = g(plain, model(R('R1'), K('WDWBORDER((*COLOR BLU))')));
  check('WDWBORDER on a record with neither is refused, naming WINDOW or PULLDOWN', !!r && /WDWBORDER/.test(r) && /WINDOW or PULLDOWN/.test(r));
  okAdd('WDWBORDER((*COLOR BLU))', 'WDWBORDER on a WINDOW record is accepted');
  check('WDWBORDER on a PULLDOWN record is accepted', g(model(R('P1'), K('PULLDOWN')), model(R('P1'), K('PULLDOWN'), K('WDWBORDER((*COLOR BLU))'))) === null);
  const both = model(R('W1'), K('WINDOW(5 5 10 40)'), K('WDWBORDER((*COLOR BLU))'));
  check('removing the WINDOW from a record that has WDWBORDER is refused', !!g(both, model(R('W1'), K('WDWBORDER((*COLOR BLU))'))));
  check('file-level WDWBORDER needs no WINDOW / PULLDOWN', g(plain, model(K('WDWBORDER((*COLOR GRN))'), R('R1'))) === null);
}

console.log('\n=== at least one parameter ===');
{
  adds('WDWBORDER', /needs at least one parameter/, 'a bare record-level WDWBORDER is refused');
  adds('WDWTITLE', /needs at least one parameter/, 'a bare WDWTITLE is refused');
  const r = g(model(R('R1')), model(K('WDWBORDER'), R('R1')));
  check('a bare file-level WDWBORDER is refused ("at the file level")', !!r && /at the file level needs at least one parameter/.test(r));
  okAdd("WDWTITLE(' My Window ')", "WDWTITLE with only a quoted title is accepted (the form the title box writes)");
}

console.log('\n=== value lists ===');
{
  ['BLU', 'GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK'].forEach((c) => { okAdd('WDWBORDER((*COLOR ' + c + '))'); okAdd('WDWTITLE((*COLOR ' + c + '))'); });
  adds('WDWBORDER((*COLOR XYZ))', /\(\*COLOR XYZ\) is not valid; give one colour: BLU, GRN/);
  adds('WDWTITLE((*COLOR XYZ))', /WDWTITLE.*\(\*COLOR XYZ\) is not valid/);
  adds('WDWBORDER((*COLOR))', /is not valid/, 'a (*COLOR) with no value is refused');
  adds('WDWBORDER((*COLOR RED BLU))', /is not valid/, 'a (*COLOR RED BLU) with two values is refused');
  okAdd('WDWBORDER((*COLOR red))', 'lower-case colour is accepted');
  okAdd('WDWBORDER((*DSPATR BL CS HI ND RI UL))', 'all six display attributes together are accepted');
  adds('WDWBORDER((*DSPATR XX))', /display attribute XX is not valid; use BL, CS, HI, ND, RI, UL/);
  adds('WDWBORDER((*DSPATR HI QQ))', /display attribute QQ/, 'one bad value among good ones is refused, naming it');
  adds('WDWTITLE((*DSPATR HI QQ))', /WDWTITLE.*display attribute QQ/);
  okAdd('WDWBORDER((*DSPATR))', 'a (*DSPATR) with no value is accepted (the format brackets the values)');
  okAdd("WDWBORDER((*CHAR '12345678'))", 'a (*CHAR ...) group is accepted');
  okAdd('WDWBORDER((*COLOR RED) (*DSPATR HI UL) (*CHAR \'.:.::.:.\'))', 'all three WDWBORDER groups together are accepted');
}

console.log('\n=== parameter forms ===');
{
  adds('WDWBORDER((*FOO X))', /not a parameter of this keyword; use \*COLOR, \*DSPATR, \*CHAR/);
  adds('WDWBORDER(*TOP)', /not a valid parameter/, 'a bare *TOP on WDWBORDER is refused');
  adds("WDWBORDER((*TEXT 'x'))", /not a parameter of this keyword/, '(*TEXT ...) on WDWBORDER is refused');
  adds("WDWBORDER('x')", /not title text/, 'quoted text on WDWBORDER is refused');
  adds('WDWTITLE(*MIDDLE)', /\*MIDDLE, which is not a valid parameter/);
  adds("WDWTITLE((*CHAR 'x'))", /not a parameter of this keyword; use \*TEXT, \*COLOR, \*DSPATR/, '(*CHAR ...) on WDWTITLE is refused');
  ['*CENTER', '*LEFT', '*RIGHT', '*TOP', '*BOTTOM'].forEach((t) => okAdd('WDWTITLE(' + t + ')'));
  okAdd("WDWTITLE((*TEXT 'Hi') (*COLOR RED) (*DSPATR HI) *LEFT *BOTTOM)", 'every WDWTITLE parameter kind together is accepted');
  okAdd('WDWTITLE((*TEXT &TTL) *BOTTOM)', '(*TEXT &field) is accepted');
  okAdd("WDWTITLE(('Old Title'))", 'the parenthesised quoted title the title box also writes is accepted');
  okAdd("WDWTITLE((*TEXT 'a (b) c'))", 'parentheses and a doubled quote inside the title text do not confuse the parameter split');
  okAdd("WDWTITLE((*TEXT 'it''s') *TOP)", 'a doubled quote inside the title is read as one character');
}

console.log('\n=== decision: one value per slot inside one keyword ===');
{
  adds('WDWTITLE(*TOP *BOTTOM)', /more than one position \(\*TOP \/ \*BOTTOM\) in one keyword/);
  adds('WDWTITLE(*LEFT *RIGHT)', /more than one alignment/);
  adds('WDWTITLE((*COLOR RED) (*COLOR BLU))', /more than one \*COLOR group/);
  adds("WDWTITLE((*TEXT 'a') (*TEXT 'b'))", /more than one title text|more than one \*TEXT group/);
  adds('WDWBORDER((*COLOR RED) (*COLOR BLU))', /more than one \*COLOR group/);
  adds("WDWBORDER((*CHAR 'a') (*CHAR 'b'))", /more than one \*CHAR group/);
  okAdd('WDWTITLE(*LEFT *TOP)', 'one alignment plus one position is accepted');
  const two = model(R('W1'), K('WINDOW(5 5 10 40)'), K('WDWTITLE(*TOP)'), K('WDWTITLE(*BOTTOM)'));
  check('two WDWTITLE keywords with different positions combine and are accepted (the first value wins)', g(base, two) === null);
  const two2 = model(R('W1'), K('WINDOW(5 5 10 40)'), K('WDWBORDER((*COLOR RED))'), K('WDWBORDER((*COLOR BLU))'));
  check('two WDWBORDER keywords with different colours combine and are accepted', g(base, two2) === null);
}

console.log('\n=== file level ===');
{
  const plain = model(R('R1'));
  ['(*COLOR XYZ)', '(*DSPATR XX)', '(*FOO X)'].forEach((p) => {
    check('file-level WDWBORDER(' + p + ') is refused', !!g(plain, model(K('WDWBORDER(' + p + ')'), R('R1'))));
  });
  check('file-level WDWBORDER((*COLOR GRN) (*DSPATR HI)) is accepted', g(plain, model(K('WDWBORDER((*COLOR GRN) (*DSPATR HI))'), R('R1'))) === null);
  check('the same keyword on the file and on a window record is judged per place',
    g(plain, model(K('WDWBORDER((*COLOR GRN))'), R('W1'), K('WINDOW(5 5 10 40)'), K('WDWBORDER((*COLOR RED))'))) === null);
}

console.log('\n=== diff-based: hand-written problems stay editable ===');
{
  const bad = model(R('W1'), K('WINDOW(5 5 10 40)'), K('WDWTITLE((*COLOR XYZ))'), K('WDWBORDER'));
  check('an unrelated edit to a record that already has bad WDWTITLE / bare WDWBORDER values is accepted',
    g(bad, model(R('W1'), K('WINDOW(5 5 10 40)'), K('WDWTITLE((*COLOR XYZ))'), K('WDWBORDER'), K('RMVWDW'))) === null);
  check('removing the bad keywords is accepted', g(bad, base) === null);
  check('changing the bad colour to a good one is accepted; to another bad one is refused',
    g(bad, model(R('W1'), K('WINDOW(5 5 10 40)'), K('WDWTITLE((*COLOR RED))'), K('WDWBORDER'))) === null &&
    !!g(bad, model(R('W1'), K('WINDOW(5 5 10 40)'), K('WDWTITLE((*COLOR QQQ))'), K('WDWBORDER'))));
  check('a model with no WDWBORDER / WDWTITLE and null models do not throw', g(base, base) === null && g(null, null) === null && g(undefined, base) === null);
}

console.log('\n=== webview: raw keyword editors (jsdom) ===');
const SOURCE = [R('R1'), dds({ fn: "'plain'" }), R('W1'), K('WINDOW(5 5 10 40)'), K("WDWTITLE((*TEXT 'Hi'))"), K('WDWBORDER((*COLOR GRN))')].join('\n') + '\n';
const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'I182.DSPF'), {
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
  const rawAdd = (record, name, params) => {
    sel.value = record; fire(sel);
    const owner = 'record-' + record;
    doc.getElementById(owner + '-new-kw-name').value = name;
    const pe = doc.getElementById(owner + '-new-kw-params'); if (pe) pe.value = params || '';
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
  };
  const refused = (re) => lastText() === null && alerts.some((a) => re.test(a));
  const recFrom = (t, n) => (t ? DspfParser.parseDspf(t).records.find((r) => r.name === n) : null);

  rawAdd('R1', 'WDWBORDER', '(*COLOR BLU)');
  check('raw-adding WDWBORDER to R1 (no WINDOW / PULLDOWN) is refused: no edit, message names WINDOW or PULLDOWN', refused(/WINDOW or PULLDOWN/));
  rawAdd('W1', 'WDWBORDER', '');
  check('a bare WDWBORDER on the window record is refused (the existing one stays; message says at least one parameter)', refused(/needs at least one parameter/) || refused(/more than one|at least one/));
  rawAdd('W1', 'WDWTITLE', '');
  check('a bare WDWTITLE on the window record is refused', refused(/needs at least one parameter/));
  rawAdd('W1', 'WDWBORDER', '(*COLOR XYZ)');
  check('WDWBORDER((*COLOR XYZ)) is refused', refused(/\(\*COLOR XYZ\) is not valid/));
  rawAdd('W1', 'WDWBORDER', '(*DSPATR XX)');
  check('WDWBORDER((*DSPATR XX)) is refused', refused(/display attribute XX/));
  rawAdd('W1', 'WDWTITLE', '(*COLOR XYZ)');
  check('WDWTITLE((*COLOR XYZ)) is refused', refused(/WDWTITLE.*\(\*COLOR XYZ\)/));
  rawAdd('W1', 'WDWTITLE', '*TOP *BOTTOM');
  check('WDWTITLE(*TOP *BOTTOM) is refused', refused(/more than one position/));
  rawAdd('W1', 'WDWTITLE', '*BOTTOM');
  {
    const t = lastText();
    const r = recFrom(t, 'W1');
    check('a valid second WDWTITLE(*BOTTOM) on W1 is accepted and written, with no alert', alerts.length === 0 && !!r && r.keywords.filter((k) => k.name === 'WDWTITLE').length === 2);
  }
  rawAdd('W1', 'WDWBORDER', '(*DSPATR HI)');
  {
    const r = recFrom(lastText(), 'W1');
    check('a valid second WDWBORDER((*DSPATR HI)) on W1 is accepted and written', alerts.length === 0 && !!r && r.keywords.filter((k) => k.name === 'WDWBORDER').length === 2);
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

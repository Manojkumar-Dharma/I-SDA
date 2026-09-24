/**
 * i66PshbtnchcTextValidation.test.js
 *
 * Task I-66 (raised by I-57) - PSHBTNCHC choice-text validation. The
 * DDS Reference's PSHBTNCHC section says: within the choice text a > marks
 * the mnemonic ("the character to the right of the > is the mnemonic"),
 * >> is a literal >; "The mnemonic character indicated must be a
 * single-byte character and must not be a blank. Only one mnemonic is
 * allowed in the choice text, and the same mnemonic character should not
 * be specified for more than one choice"; and "The choice text must fit on
 * one line of the display for the smallest display size specified for the
 * file" (depending on the field position, text length, gutter, number of
 * columns, smallest display size and window width). The editor only
 * checked the choice number and that the text was non-blank.
 *
 * Fix: DspfWriter.analyzePshbtnchcText / pshbtnchcTextProblem /
 * pshbtnchcParamsProblem (hard errors, enforced by the row editor and the
 * raw keyword editor), pshbtnchcFieldIssues and pshbtnchcFitProblem
 * (warnings shown in the panel: duplicate mnemonics, which IBM defines a
 * fallback for, and an ESTIMATED fit check).
 *
 * Run with: node src/test/i66PshbtnchcTextValidation.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');
const DspfWriter = require('../../dist/dspfWriter.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const kwd = (name, parameters) => ({ name: name, parameters: parameters, conditions: [], raw: '', sourceLines: [] });
const chc = (id, text, extra) => kwd('PSHBTNCHC', id + " '" + text + "'" + (extra ? ' ' + extra : ''));

// === Group A: analyzePshbtnchcText - IBM's own examples and rules ===
console.log('\nanalyzePshbtnchcText: IBM examples and rules');
{
  const a = DspfWriter.analyzePshbtnchcText;
  let r = a('>Help');
  check("'>Help' -> shows Help, mnemonic H", r.visible === 'Help' && r.mnemonic === 'H' && r.problem === null);
  r = a('F2=>File');
  check("'F2=>File' -> F2=File, mnemonic F (IBM example)", r.visible === 'F2=File' && r.mnemonic === 'F' && r.problem === null);
  r = a('F3=F>inish');
  check("'F3=F>inish' -> F3=Finish, mnemonic i (IBM example)", r.visible === 'F3=Finish' && r.mnemonic === 'i' && r.problem === null);
  r = a('>Enter');
  check("'>Enter' -> Enter (IBM example)", r.visible === 'Enter' && r.mnemonic === 'E');
  r = a('X >>= 1');
  check("'X >>= 1' -> X >= 1 with NO mnemonic (IBM example)", r.visible === 'X >= 1' && r.mnemonic === '' && r.markers === 0 && r.problem === null);
  r = a('X >>>= 1');
  check("'X >>>= 1' -> X >= 1 (IBM example); literal > then a mnemonic marker on =", r.visible === 'X >= 1' && r.mnemonic === '=' && r.problem === null);
  r = a('>>');
  check("'>>' alone is one literal >, no mnemonic", r.visible === '>' && r.mnemonic === '' && r.problem === null);
  r = a('No mnemonic at all');
  check('plain text: no mnemonic, no problem', r.visible === 'No mnemonic at all' && r.mnemonic === '' && r.problem === null);
  check('blank text is not this check\'s business (the row editor checks that)', a('').problem === null);

  console.log('  the rules');
  r = a('>Ok >Cancel');
  check('two mnemonics -> "only one mnemonic" problem', /only one mnemonic/.test(r.problem));
  r = a('>A>B>C');
  check('three markers -> the same problem', /only one mnemonic/.test(r.problem));
  r = a('Help>');
  check('a trailing > has no mnemonic character', /must be followed by the mnemonic character/.test(r.problem));
  r = a('>>>');
  check("'>>>' = literal > + a trailing marker -> no mnemonic character", /must be followed by the mnemonic character/.test(r.problem));
  r = a('> Help');
  check('a blank mnemonic is rejected', /must not be a blank/.test(r.problem));
  r = a('>\u3042Help');
  check('a double-byte mnemonic is rejected', /single-byte/.test(r.problem));
  r = a('>\u00e9lan');
  check('a single-byte accented mnemonic (Latin-1) is fine', r.problem === null && r.mnemonic === '\u00e9');
  r = a('>>Help');
  check("'>>Help' is a literal > then Help - NOT a > mnemonic and not an error", r.visible === '>Help' && r.mnemonic === '' && r.problem === null);
  r = a('&F3');
  check('a &FIELD text is resolved at run time - never checked', r.problem === null && r.visible === '&F3');
  r = a('&F3>>>');
  check('...even with stray > after it', r.problem === null);
}

// === Group B: the guards ===
console.log('\npshbtnchcParamsProblem (raw keyword editor guard)');
{
  const g = DspfWriter.pshbtnchcParamsProblem;
  check("PSHBTNCHC(1 '>Ok >Cancel') blocked", /only one mnemonic/.test(g('PSHBTNCHC', "1 '>Ok >Cancel'")));
  check('lowercase name still checked', /only one mnemonic/.test(g('pshbtnchc', "1 '>Ok >Cancel'")));
  check("PSHBTNCHC(1 '>Ok') allowed", g('PSHBTNCHC', "1 '>Ok'") === null);
  check('PSHBTNCHC(2 &F3 CA03) allowed (field text)', g('PSHBTNCHC', '2 &F3 CA03') === null);
  check("PSHBTNCHC(1 '>Ok' HELP *SPACEB) allowed (trailing parameters ignored)", g('PSHBTNCHC', "1 '>Ok' HELP *SPACEB") === null);
  check("an escaped apostrophe does not confuse it: PSHBTNCHC(1 'Don''t >Go')", g('PSHBTNCHC', "1 'Don''t >Go'") === null);
  check('any other keyword is a safe no-op', g('CHOICE', "1 '>A >B'") === null && g('TEXT', "'>A >B'") === null && g('', '') === null);
}

console.log('\npshbtnchcFieldIssues (panel review of hand-written sources)');
{
  const f = DspfWriter.pshbtnchcFieldIssues;
  let r = f([chc(1, '>Save'), chc(2, '>Send'), chc(3, '>Quit')]);
  check('choices 1 and 2 both use S -> one duplicate entry [1,2]', r.duplicateMnemonics.length === 1 && r.duplicateMnemonics[0].mnemonic === 'S' && r.duplicateMnemonics[0].ids.join() === '1,2');
  check('...and no text problems', r.textProblems.length === 0);
  r = f([chc(1, '>Yes'), chc(2, '>No')]);
  check('distinct mnemonics -> nothing to report', r.duplicateMnemonics.length === 0 && r.textProblems.length === 0);
  r = f([chc(1, 'Bad>'), chc(2, '>Ok >Two'), chc(3, '>Fine')]);
  check('per-choice text problems are attributed to the right choice number', r.textProblems.length === 2 && r.textProblems[0].id === '1' && r.textProblems[1].id === '2');
  r = f([kwd('PSHBTNCHC', '1 &TXT1'), kwd('PSHBTNCHC', '2 &TXT2'), chc(3, '>Go')]);
  check('&FIELD choices are ignored (never a duplicate, never a problem)', r.duplicateMnemonics.length === 0 && r.textProblems.length === 0);
  r = f([chc(1, '>Save'), chc(2, '>save')]);
  check('mnemonics are compared as the exact character (the reference does not say they are case-blind)', r.duplicateMnemonics.length === 0);
  r = f([]);
  check('no choices -> nothing', r.duplicateMnemonics.length === 0 && r.textProblems.length === 0);
}

console.log('\npshbtnchcFitProblem (an estimate, per the designer\'s own layout)');
{
  const f = DspfWriter.pshbtnchcFitProblem;
  const pf = (params) => kwd('PSHBTNFLD', params || '');
  const fifteen = 'Fifteen chars!!';
  check('no column -> cannot tell -> null', f([pf(), chc(1, 'OK')], { column: null }) === null);
  check('no choices -> null', f([pf()], { column: 5 }) === null);
  check('short buttons fit comfortably', f([pf(), chc(1, 'OK'), chc(2, 'Cancel')], { column: 5 }) === null);
  let r = f([pf(), chc(1, 'x'.repeat(80))], { column: 5 });
  check('an 80-character choice at column 5 cannot fit an 80-column display (82 needed, 76 available)', !!r && /about 82 columns/.test(r) && /76 are available/.test(r) && /80 columns/.test(r));
  r = f([pf(), chc(1, 'x'.repeat(100))], { column: 5, fileKeywords: [kwd('DSPSIZ', '*DS4')] });
  check('the same wide-screen-only file (DSPSIZ *DS4 = 27x132) leaves room for 100 characters', r === null);
  r = f([pf(), chc(1, 'x'.repeat(100))], { column: 5, fileKeywords: [kwd('DSPSIZ', '*DS3 *DS4')] });
  check('...but with the 24x80 size ALSO declared, the SMALLEST size governs', !!r && /80 columns/.test(r));
  r = f([pf('(*NUMCOL 4)'), chc(1, fifteen), chc(2, fifteen), chc(3, fifteen), chc(4, fifteen)], { column: 10 });
  check('*NUMCOL 4 of 17-wide buttons + 3 gutters = 77 columns does not fit from column 10', !!r && /about 77 columns/.test(r) && /4 buttons across/.test(r) && /71 are available/.test(r));
  r = f([pf('(*NUMCOL 4)'), chc(1, fifteen), chc(2, fifteen), chc(3, fifteen), chc(4, fifteen)], { column: 2 });
  check('...but does fit from column 2', r === null);
  r = f([pf('(*NUMCOL 4) (*GUTTER 8)'), chc(1, fifteen), chc(2, fifteen), chc(3, fifteen), chc(4, fifteen)], { column: 2 });
  check('a wider *GUTTER 8 pushes it over (4*17 + 3*8 = 92)', !!r && /about 92 columns/.test(r) && /8 blanks apart/.test(r));
  r = f([pf(), chc(1, fifteen), chc(2, fifteen), chc(3, fifteen), chc(4, fifteen), chc(5, fifteen), chc(6, fifteen)], { column: 10 });
  check('with no *NUMCOL/*NUMROW the buttons wrap, so only ONE button has to fit', r === null);
  r = f([pf('(*NUMCOL 5)'), chc(1, fifteen), chc(2, fifteen)], { column: 10 });
  check('*NUMCOL 5 with only 2 choices only ever uses 2 columns (2*17+3 = 37)', r === null);
  r = f([pf('(*NUMROW 2)'), chc(1, fifteen), chc(2, fifteen), chc(3, fifteen), chc(4, fifteen), chc(5, fifteen), chc(6, fifteen)], { column: 25 });
  check('*NUMROW 2 with 6 choices = 3 columns (3*17+6 = 57) does not fit from column 25 (56 available)', !!r && /about 57 columns/.test(r) && /3 buttons across/.test(r));
  const four = [chc(1, 'x'.repeat(18)), chc(2, 'x'.repeat(18)), chc(3, 'x'.repeat(18)), chc(4, 'x'.repeat(18))];
  check('*NUMROW 2 with 4 choices = 2 columns (2*20+3 = 43) fits from column 20', f([pf('(*NUMROW 2)')].concat(four), { column: 20 }) === null);
  const spaced = [four[0], kwd('PSHBTNCHC', "2 '" + 'x'.repeat(18) + "' *SPACEB"), four[2], four[3]];
  check('...but a *SPACEB blank slot makes it 5 slots = 3 columns (66) and it no longer fits', /about 66 columns/.test(f([pf('(*NUMROW 2)')].concat(spaced), { column: 20 }) || ''));
  r = f([pf(), chc(1, 'x'.repeat(44))], { column: 3, recordKeywords: [kwd('WINDOW', '*DFT 10 40')] });
  check('in a 40-column window a 46-wide button does not fit', !!r && /40-column window/.test(r) && /38 are available/.test(r));
  r = f([pf(), chc(1, 'x'.repeat(44))], { column: 3, recordKeywords: [kwd('WINDOW', '2 5 10 60')] });
  check('a positioned 60-column window leaves room', r === null);
  r = f([pf(), chc(1, 'x'.repeat(44))], { column: 3, recordKeywords: [kwd('WINDOW', 'OTHERREC')] });
  check('a window that references another record has unknown width -> falls back to the display size', r === null);
  r = f([pf(), kwd('PSHBTNCHC', '1 &TXT'), kwd('PSHBTNCHC', '2 &TXT2')], { column: 70 });
  check('&FIELD-only choices are unknowable at design time -> null', r === null);
  r = f([pf(), kwd('PSHBTNCHC', '1 &TXT'), chc(2, 'x'.repeat(30))], { column: 60 });
  check('a mix uses only the known text (32-wide from column 60 = 21 available)', !!r && /21 are available/.test(r));
  r = f([pf(), chc(1, '>' + 'x'.repeat(40))], { column: 39 });
  check('the mnemonic marker takes no width: 40 visible + 2 = 42 fits the 42 columns from column 39', r === null);
  r = f([pf(), chc(1, 'x'.repeat(39) + '>>')], { column: 39 });
  check('...and a doubled >> counts as ONE character: also 42, so it also fits', r === null);
  r = f([pf(), chc(1, 'x'.repeat(41))], { column: 39 });
  check('...one more visible character (43) does not', !!r && /about 43 columns/.test(r));
}

// === DOM scenarios ===
function makeDom(src) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'I66.DSPF');
  const posted = [];
  const errors = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = () => {};
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  return { dom: dom, posted: posted, errors: errors };
}

const KW = '     A                                      ';
const SRC = [
  '     A          R RECORD1',
  // F1: hand-written source that already breaks the rules (duplicate S, a trailing >)
  '     A            F1             2Y 0B  3  5PSHBTNFLD',
  KW + "PSHBTNCHC(1 '>Save')",
  KW + "PSHBTNCHC(2 '>Send')",
  KW + "PSHBTNCHC(3 'Bad>')",
  // F2: clean
  '     A            F2             2Y 0B  6  5PSHBTNFLD',
  KW + "PSHBTNCHC(1 '>Yes')",
  KW + "PSHBTNCHC(2 '>No')",
  // F3: four wide buttons in 4 columns starting at column 10 (does not fit 80 columns)
  '     A            F3             2Y 0B  9 10PSHBTNFLD((*NUMCOL 4))',
  KW + "PSHBTNCHC(1 'Fifteen chars!!')",
  KW + "PSHBTNCHC(2 'Fifteen chars!!')",
  KW + "PSHBTNCHC(3 'Fifteen chars!!')",
  KW + "PSHBTNCHC(4 'Fifteen chars!!')",
].join('\n') + '\n';

const paramsOf = (keywords, name) => keywords.filter((k) => k.name === name).map((k) => k.parameters.replace(/\s+/g, ' '));
function fieldOf(text, name) {
  return DspfParser.parseDspf(text).records[0].fields.find((f) => f.name === name);
}

const { dom, posted, errors } = makeDom(SRC);
setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  function selectField(idx) {
    const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
    boxes[idx].click();
    return 'field-' + boxes[idx].getAttribute('data-source-line');
  }
  function panelText(owner) {
    const el = doc.querySelector('[data-accordion-key="' + owner + '::push-button-field"]');
    return el ? el.textContent : '';
  }
  function attempt(action) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    action();
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  function editRowText(owner, idx, value) {
    return attempt(() => {
      const el = doc.querySelector('.' + owner + '-pbc-rep-inst' + idx + '-text');
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  console.log('\nPanel warnings on a hand-written field that already breaks the rules (F1)');
  let owner = selectField(0);
  let text = panelText(owner);
  check('the duplicate mnemonic S is called out for choices 1, 2', /Choices 1, 2 all use the mnemonic S/.test(text));
  check('choice 3\'s trailing > is called out against choice 3', /Choice 3: A mnemonic marker/.test(text));

  console.log('\nPanel on a clean field (F2)');
  owner = selectField(1);
  text = panelText(owner);
  check('no mnemonic/fit warnings at all', !/mnemonic/.test(text) && !/probably do not fit/.test(text));

  console.log('\nPanel on the wide multi-column field (F3)');
  owner = selectField(2);
  text = panelText(owner);
  check('the estimated-fit warning appears', /The push buttons probably do not fit/.test(text) && /4 buttons across/.test(text) && /71 are available/.test(text));

  console.log('\nRow editor on F2: hard errors block the edit');
  owner = selectField(1);
  let r = editRowText(owner, 0, '>Ok >Cancel');
  check('two mnemonics -> alert, nothing posted', !!r.alertMessage && /only one mnemonic/.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(1);
  r = editRowText(owner, 0, 'Ok>');
  check('a trailing > -> alert, nothing posted', !!r.alertMessage && /must be followed by the mnemonic character/.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(1);
  r = editRowText(owner, 0, '> Ok');
  check('a blank mnemonic -> alert, nothing posted', !!r.alertMessage && /must not be a blank/.test(r.alertMessage) && !r.applyEdit);

  console.log('\nRow editor on F2: valid texts still commit');
  owner = selectField(1);
  r = editRowText(owner, 0, 'E>xit');
  let f2 = r.applyEdit && fieldOf(r.applyEdit.text, 'F2');
  check("'E>xit' commits with its mnemonic marker intact", !r.alertMessage && !!f2 && paramsOf(f2.keywords, 'PSHBTNCHC')[0] === "1 'E>xit'");
  owner = selectField(1);
  r = editRowText(owner, 1, 'X >>= 1');
  f2 = r.applyEdit && fieldOf(r.applyEdit.text, 'F2');
  check("'X >>= 1' (literal >, no mnemonic) commits", !r.alertMessage && !!f2 && paramsOf(f2.keywords, 'PSHBTNCHC').indexOf("2 'X >>= 1'") >= 0);
  owner = selectField(1);
  r = editRowText(owner, 1, '&NOTE');
  f2 = r.applyEdit && fieldOf(r.applyEdit.text, 'F2');
  check('a &FIELD text commits without any mnemonic check', !r.alertMessage && !!f2 && paramsOf(f2.keywords, 'PSHBTNCHC').indexOf('2 &NOTE') >= 0);

  console.log('\nRow editor: an unrelated edit to an already-invalid row is not blocked (F1 choice 3, "Bad>")');
  owner = selectField(0);
  r = attempt(() => {
    const el = doc.querySelector('.' + owner + '-pbc-rep-inst2-key');
    el.value = 'CA03';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const f1 = r.applyEdit && fieldOf(r.applyEdit.text, 'F1');
  check('changing only the command key commits with no alert', !r.alertMessage && !!f1);
  check('...and the row keeps its (invalid) text untouched for the user to fix', !!f1 && paramsOf(f1.keywords, 'PSHBTNCHC').some((p) => /^3 'Bad>' CA03$/.test(p)));
  owner = selectField(0);
  r = editRowText(owner, 2, 'Two>a>b');
  check('...while typing NEW text that is still invalid IS blocked', !!r.alertMessage && /only one mnemonic/.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(0);
  r = editRowText(owner, 2, 'Go>od');
  const f1b = r.applyEdit && fieldOf(r.applyEdit.text, 'F1');
  check('fixing it with valid text commits', !r.alertMessage && !!f1b && paramsOf(f1b.keywords, 'PSHBTNCHC').some((p) => /^3 'Go>od'/.test(p)));

  console.log('\nRaw keyword editor guard');
  function addRaw(owner, name, params) {
    doc.getElementById(owner + '-new-kw-name').value = name;
    doc.getElementById(owner + '-new-kw-params').value = params || '';
    return attempt(() => doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new Event('click', { bubbles: true })));
  }
  owner = selectField(1);
  r = addRaw(owner, 'PSHBTNCHC', "3 '>A >B'");
  check('PSHBTNCHC with two mnemonics is blocked', !!r.alertMessage && /only one mnemonic/.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(1);
  r = addRaw(owner, 'PSHBTNCHC', "3 'Trailing>'");
  check('PSHBTNCHC with a trailing > is blocked', !!r.alertMessage && /must be followed by the mnemonic character/.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(1);
  r = addRaw(owner, 'PSHBTNCHC', "3 '>Maybe'");
  check('a valid PSHBTNCHC still adds', !r.alertMessage && !!r.applyEdit);
  owner = selectField(1);
  r = addRaw(owner, 'PSHBTNCHC', '4 &TXT4');
  check('a &FIELD PSHBTNCHC still adds', !r.alertMessage && !!r.applyEdit);

  check('no uncaught errors', errors.length === 0);
  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 600);

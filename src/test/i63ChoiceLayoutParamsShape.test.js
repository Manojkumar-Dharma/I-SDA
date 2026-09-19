/**
 * i63ChoiceLayoutParamsShape.test.js
 *
 * Task I-63 (raised by I-57) - SNGCHCFLD/MLTCHCFLD's layout parameters
 * were written and read in the wrong shape. IBM's own format string is
 *   [(*NUMCOL nbr-of-cols) | (*NUMROW nbr-of-rows)] [(*GUTTER gutter-width)]
 * - parenthesized groups with a space. setChoiceSelectionType wrote
 * `*NUMCOL(3) *GUTTER(2)` (invalid DDS) and getChoiceSelectionType could
 * not read IBM's own `(*NUMCOL 3)` (whitespace tokenizing split it into
 * `(*NUMCOL` / `3)`), so Apply on a hand-written field silently dropped
 * the parameters.
 *
 * Fix: both now use the shared readChoiceLayoutNumber /
 * stripChoiceLayoutParams helpers (also used by getPshbtnfld); the writer
 * emits IBM's shape, NUMCOL-or-NUMROW (never both), and GUTTER only
 * alongside one of them; the old `*NUMCOL(3)` shape is still READ so
 * sources written by earlier iSDA versions load and are corrected on the
 * next Apply. The editor's Apply also blocks the three invalid layout
 * combinations, exactly like the PSHBTNFLD editor already did.
 *
 * Run with: node src/test/i63ChoiceLayoutParamsShape.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfParser = require('../../dist/dspfParser.js');
const DspfWriter = require('../../dist/dspfWriter.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}
const kw = (name, parameters) => [{ name: name, parameters: parameters, conditions: [], raw: '', sourceLines: [] }];
const paramsOf = (keywords, name) => (keywords.find((k) => k.name === name) || {}).parameters;

// === Group A: getChoiceSelectionType reads IBM's shape ===
console.log('\ngetChoiceSelectionType: IBM shape, legacy shape, edge cases');
{
  const g = DspfWriter.getChoiceSelectionType;
  let r = g(kw('SNGCHCFLD', '*RSTCSR (*NUMCOL 3) (*GUTTER 2)'));
  check('IBM shape: numCol 3, gutter 2, flag kept', r.numCol === '3' && r.gutter === '2' && r.numRow === '' && r.flags.join() === '*RSTCSR');
  r = g(kw('MLTCHCFLD', '(*NUMROW 4) (*GUTTER 5)'));
  check('IBM shape on MLTCHCFLD: numRow 4, gutter 5', r.numRow === '4' && r.gutter === '5' && r.numCol === '');
  r = g(kw('SNGCHCFLD', '*AUTOENT *SLTIND (*NUMCOL 12)'));
  check('flags around a layout group are all still read', r.flags.join() === '*AUTOENT,*SLTIND' && r.numCol === '12');
  r = g(kw('SNGCHCFLD', '*NUMCOL(3) *GUTTER(2)'));
  check('legacy shape (earlier iSDA output) still reads', r.numCol === '3' && r.gutter === '2');
  r = g(kw('SNGCHCFLD', '*NOSLTIND *NUMROW(2)'));
  check('legacy NUMROW + flag still reads', r.numRow === '2' && r.flags.join() === '*NOSLTIND');
  r = g(kw('SNGCHCFLD', '(*numcol 3) (*gutter 2) *rstcsr'));
  check('layout groups are case-insensitive', r.numCol === '3' && r.gutter === '2');
  r = g(kw('SNGCHCFLD', '( *NUMCOL   3 )'));
  check('extra whitespace inside the group is tolerated', r.numCol === '3');
  r = g(kw('SNGCHCFLD', ''));
  check('no parameters -> all blank', r.kind === 'SNGCHCFLD' && r.numCol === '' && r.numRow === '' && r.gutter === '' && r.flags.length === 0);
  r = g([]);
  check('no keyword -> blank kind', r.kind === '');
}

// === Group B: setChoiceSelectionType writes IBM's shape ===
console.log('\nsetChoiceSelectionType: IBM shape and the layout rules');
{
  const s = DspfWriter.setChoiceSelectionType;
  let out = paramsOf(s([], { kind: 'SNGCHCFLD', flags: ['*AUTOENT'], numCol: '3', numRow: '', gutter: '2' }), 'SNGCHCFLD');
  check('writes flags then (*NUMCOL 3) (*GUTTER 2)', out === '*AUTOENT (*NUMCOL 3) (*GUTTER 2)');
  check('never the invalid *NUMCOL(3) shape', !/\*(NUMCOL|NUMROW|GUTTER)\(/.test(out));
  out = paramsOf(s([], { kind: 'MLTCHCFLD', flags: ['*RSTCSR'], numCol: '', numRow: '4', gutter: '' }), 'MLTCHCFLD');
  check('MLTCHCFLD writes (*NUMROW 4)', out === '*RSTCSR (*NUMROW 4)');
  out = paramsOf(s([], { kind: 'SNGCHCFLD', flags: [], numCol: '3', numRow: '4', gutter: '' }), 'SNGCHCFLD');
  check('NUMCOL and NUMROW both given -> NUMCOL wins, never both', out === '(*NUMCOL 3)');
  out = paramsOf(s([], { kind: 'SNGCHCFLD', flags: [], numCol: '', numRow: '', gutter: '2' }), 'SNGCHCFLD');
  check('GUTTER without NUMCOL/NUMROW is dropped', out === '');
  out = paramsOf(s([], { kind: 'SNGCHCFLD', flags: [], numCol: '0', numRow: '', gutter: '' }), 'SNGCHCFLD');
  check('a zero/non-positive count is not written', out === '');
  out = paramsOf(s([], { kind: 'MLTCHCFLD', flags: ['*AUTOSLT', '*RSTCSR'], numCol: '2', numRow: '', gutter: '3' }), 'MLTCHCFLD');
  check('I-34 behaviour intact: MLTCHCFLD still strips SNGCHCFLD-only flags', out === '*RSTCSR (*NUMCOL 2) (*GUTTER 3)');
  check('blank kind still removes the keyword', s(kw('SNGCHCFLD', '(*NUMCOL 3)'), { kind: '', flags: [] }).length === 0);

  console.log('  round trip set -> get');
  const st = { kind: 'SNGCHCFLD', flags: ['*NORSTCSR', '*AUTOENT'], numCol: '', numRow: '5', gutter: '4' };
  const back = DspfWriter.getChoiceSelectionType(s([], st));
  check('numRow/gutter/flags survive', back.numRow === '5' && back.gutter === '4' && back.numCol === '' && back.flags.join() === '*NORSTCSR,*AUTOENT');
  const legacyFixed = paramsOf(s(kw('SNGCHCFLD', '*NUMCOL(3) *GUTTER(2)'), DspfWriter.getChoiceSelectionType(kw('SNGCHCFLD', '*NUMCOL(3) *GUTTER(2)'))), 'SNGCHCFLD');
  check('legacy-shaped keyword is rewritten to IBM shape by a get -> set pass', legacyFixed === '(*NUMCOL 3) (*GUTTER 2)');
}

// === Group C: getPshbtnfld refactor did not change behaviour ===
console.log('\ngetPshbtnfld (now sharing the reader): unchanged');
{
  const g = DspfWriter.getPshbtnfld;
  let r = g(kw('PSHBTNFLD', '*RSTCSR (*NUMCOL 2) (*GUTTER 3)'));
  check('IBM shape', r.restrict === '*RSTCSR' && r.numCol === '2' && r.gutter === '3' && r.numRow === '');
  r = g(kw('PSHBTNFLD', '*NUMROW(2)'));
  check('legacy shape', r.numRow === '2');
  r = g(kw('PSHBTNFLD', ''));
  check('bare PSHBTNFLD', r.present && r.numCol === '' && r.numRow === '' && r.gutter === '');
}

// === Group D: full source round trip through the parser + writer ===
console.log('\nSource round trip: parse -> get -> set -> applyFieldUpdate -> reparse');
{
  const src = [
    '     A          R RECORD1',
    '     A            F1             2Y 0B  3  5SNGCHCFLD(*AUTOENT +',
    '     A                                      (*NUMCOL 3) (*GUTTER 2))',
    '     A                                      CHOICE(1 \'One\')',
  ].join('\n') + '\n';
  const parsed = DspfParser.parseDspf(src);
  const f1 = parsed.records[0].fields.find((f) => f.name === 'F1');
  const st = DspfWriter.getChoiceSelectionType(f1.keywords);
  check('hand-written IBM-shaped source reads numCol 3 / gutter 2 (used to read blanks)', st.numCol === '3' && st.gutter === '2' && st.flags.join() === '*AUTOENT');
  const lines = src.split('\n');
  DspfWriter.applyFieldUpdate(f1, lines, { keywords: DspfWriter.setChoiceSelectionType(f1.keywords, st) });
  const text = lines.join('\n');
  const re = DspfParser.parseDspf(text).records[0].fields.find((f) => f.name === 'F1');
  check('re-applying unchanged state keeps *AUTOENT (*NUMCOL 3) (*GUTTER 2) (reparsed parameters, whitespace-normalised: a hand-written '+' continuation doubles the blank)', paramsOf(re.keywords, 'SNGCHCFLD').replace(/\s+/g, ' ') === '*AUTOENT (*NUMCOL 3) (*GUTTER 2)');
  check('...and never writes the invalid shape', !/\*(NUMCOL|NUMROW|GUTTER)\(/.test(paramsOf(re.keywords, 'SNGCHCFLD')));
  const st2 = DspfWriter.getChoiceSelectionType(re.keywords);
  check('reparsed field still reads the same values', st2.numCol === '3' && st2.gutter === '2' && st2.flags.join() === '*AUTOENT');
  check('CHOICE keyword untouched', re.keywords.some((k) => k.name === 'CHOICE'));
}

// === DOM scenarios ===
function makeDom(src) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'I63.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
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

const SRC = [
  '     A          R RECORD1',
  '     A            F1             2Y 0B  3  5SNGCHCFLD(*AUTOENT +',
  '     A                                      (*NUMCOL 3) (*GUTTER 2))',
  '     A                                      CHOICE(1 \'One\')',
  '     A            F2             2Y 0B  8  5SNGCHCFLD(*NUMCOL(4) *GUTTER(2))',
  '     A                                      CHOICE(1 \'One\')',
  '     A            F3             2Y 0B 12  5SNGCHCFLD',
  '     A                                      CHOICE(1 \'One\')',
].join('\n') + '\n';

runDomScenario();
function runDomScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    function selectField(idx) {
      const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
      boxes[idx].click();
      return 'field-' + boxes[idx].getAttribute('data-source-line');
    }
    function setVal(id, v) {
      const el = doc.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function apply(owner) {
      posted.length = 0;
      let alertMessage = null;
      const original = dom.window.alert;
      dom.window.alert = (m) => { alertMessage = m; };
      doc.querySelector('.' + owner + '-cst-apply').dispatchEvent(new Event('click', { bubbles: true }));
      dom.window.alert = original;
      return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
    }
    function fieldOf(text, name) {
      return DspfParser.parseDspf(text).records[0].fields.find((f) => f.name === name);
    }

    console.log('\nEditor on a hand-written IBM-shaped field (F1)');
    let owner = selectField(0);
    check('Columns input is pre-filled with 3 (used to be blank)', doc.getElementById(owner + '-cst-numcol').value === '3');
    check('Gutter input is pre-filled with 2 (used to be blank)', doc.getElementById(owner + '-cst-gutter').value === '2');
    let r = apply(owner);
    check('Apply with no changes posts an edit and no alert', !r.alertMessage && !!r.applyEdit);
    // The writer wraps a long keyword across lines with a '-' continuation
    // (valid DDS, even mid-token), so assert on the REPARSED parameter
    // string rather than on raw source text.
    const p1 = r.applyEdit && paramsOf(fieldOf(r.applyEdit.text, 'F1').keywords, 'SNGCHCFLD');
    check('...whose SNGCHCFLD parameters are exactly IBM-shaped and complete (used to silently drop the layout)', p1 === '*AUTOENT (*NUMCOL 3) (*GUTTER 2)');
    check('...and never the invalid shape', !!p1 && !/\*(NUMCOL|NUMROW|GUTTER)\(/.test(p1));
    console.log('  changing only the gutter keeps the untouched Columns value');
    owner = selectField(0);
    setVal(owner + '-cst-gutter', '4');
    r = apply(owner);
    const p1b = r.applyEdit && paramsOf(fieldOf(r.applyEdit.text, 'F1').keywords, 'SNGCHCFLD');
    check('edit posted; parameters are now *AUTOENT (*NUMCOL 3) (*GUTTER 4)', p1b === '*AUTOENT (*NUMCOL 3) (*GUTTER 4)');

    console.log('\nEditor on a legacy-shaped field (F2, written by earlier iSDA versions)');
    owner = selectField(1);
    check('legacy *NUMCOL(4) still pre-fills Columns with 4', doc.getElementById(owner + '-cst-numcol').value === '4');
    r = apply(owner);
    const f2 = r.applyEdit && fieldOf(r.applyEdit.text, 'F2');
    check('Apply rewrites it to IBM shape', !!f2 && paramsOf(f2.keywords, 'SNGCHCFLD') === '(*NUMCOL 4) (*GUTTER 2)');
    check('...and the reparsed field reads numCol 4 / gutter 2', !!f2 && DspfWriter.getChoiceSelectionType(f2.keywords).numCol === '4' && DspfWriter.getChoiceSelectionType(f2.keywords).gutter === '2');

    console.log('\nEditor: a new layout on a plain choice field (F3)');
    owner = selectField(2);
    setVal(owner + '-cst-numrow', '3');
    setVal(owner + '-cst-gutter', '4');
    r = apply(owner);
    const f3 = r.applyEdit && fieldOf(r.applyEdit.text, 'F3');
    check('writes (*NUMROW 3) (*GUTTER 4)', !!f3 && paramsOf(f3.keywords, 'SNGCHCFLD') === '(*NUMROW 3) (*GUTTER 4)');

    console.log('\nEditor: the three invalid layout combinations are blocked');
    owner = selectField(2);
    setVal(owner + '-cst-numcol', '2');
    setVal(owner + '-cst-numrow', '3');
    r = apply(owner);
    check('Columns AND Rows both set -> alert, nothing posted', !!r.alertMessage && /NUMCOL/.test(r.alertMessage) && /NUMROW/.test(r.alertMessage) && !r.applyEdit);
    owner = selectField(2);
    setVal(owner + '-cst-numcol', '2');
    setVal(owner + '-cst-numrow', '');
    setVal(owner + '-cst-gutter', '1');
    r = apply(owner);
    check('Gutter of 1 -> alert, nothing posted', !!r.alertMessage && /GUTTER/.test(r.alertMessage) && !r.applyEdit);
    owner = selectField(2);
    setVal(owner + '-cst-numcol', '');
    setVal(owner + '-cst-numrow', '');
    setVal(owner + '-cst-gutter', '3');
    r = apply(owner);
    check('Gutter without Columns/Rows -> alert, nothing posted', !!r.alertMessage && /GUTTER/.test(r.alertMessage) && !r.applyEdit);

    console.log('\nEditor: switching the type to (not a choice field) is never blocked by layout rules');
    owner = selectField(2);
    setVal(owner + '-cst-numcol', '2');
    setVal(owner + '-cst-numrow', '3');
    setVal(owner + '-cst-kind', '');
    r = apply(owner);
    check('removing the choice type applies without a layout alert', !r.alertMessage && !!r.applyEdit);

    check('no uncaught errors', errors.length === 0);
    if (failures === 0) {
      console.log('\nALL CHECKS PASSED');
    } else {
      console.log('\n' + failures + ' CHECK(S) FAILED');
      process.exitCode = 1;
    }
  }, 500);
}

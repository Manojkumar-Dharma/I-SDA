/**
 * i41HtmlConstantKeyword.test.js
 *
 * Task I-41 (part 1 of 2 - PSHBTNFLD/PSHBTNCHC split off as I-57): the
 * HTML keyword was entirely missing from iSDA. Per the DDS Reference,
 * HTML is a field-level keyword on an UNNAMED CONSTANT field
 * (HTML('value') or HTML(&program-to-system-field)) that is NOT among
 * IBM's own six documented "Constant fields" value sources (explicit/
 * implicit DFT, DATE, TIME, SYSNAME, USER, MSGCON) - a seventh,
 * structurally identical way to give a constant a keyword-driven value,
 * added to the DDS language after that enumeration was written. Mirrors
 * I-33's own MSGCON precedent: a new "Value source" dropdown option at
 * both constant-creation and constant-editing time, reusing the existing
 * generic DspfWriter.getFileQuotedText/setFileQuotedText/quoteDdsLiteral
 * helpers directly (HTML's own grammar is a single quoted-literal
 * parameter, the same shape those already handle - no new parse/format
 * functions needed).
 *
 * Also fixed: HTML's own two DDS Reference restrictions - (1) mutually
 * exclusive with COLOR/DATE/DFT/DSPATR/EDTCDE/EDTWRD/HLPID/MSGCON/
 * NOCCSID/OVRATR/PUTRETAIN/SYSNAME/TIME/USER on the SAME field, and (2)
 * not allowed in a field of a subfile (SFL) record - both via new
 * DspfWriter.htmlConflictReason(keywordName, fieldKeywords,
 * recordKeywords), wired into the field-level raw keyword editor's
 * addGuardFn (previously unguarded entirely, unlike the record-level one
 * which already has four chained checks by I-49/I-46/I-47/I-48).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i41HtmlConstantKeyword.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfParser = require('../../dist/dspfParser.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

function makeDom(src) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'HTML.DSPF').replace(
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

// === Group A: an existing HTML constant is editable via its own dedicated form ===
runScenario1();
function runScenario1() {
  const src =
    [
      '     A          R RECORD1',
      "     A                                  1 10HTML('<TITLE>')",
      "     A                                  2  2'Hello'",
    ].join('\n') + '\n';
  const { dom, posted, errors } = makeDom(src);

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    console.log('\nExisting HTML constant: dedicated form, not a Text input');
    const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
    check('setup: 2 field boxes on screen (HTML constant, the literal constant)', boxes.length === 2);
    boxes[0].click();
    check('HTML tag input present and pre-filled', doc.getElementById('p-const-html-text') && doc.getElementById('p-const-html-text').value === '<TITLE>');
    check('no Text input rendered for an HTML constant', !doc.getElementById('p-const-text'));

    console.log('  clicking Apply WITHOUT touching anything must NOT corrupt the line');
    doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    check("HTML line round-trips with its original quoted text", /HTML\('<TITLE>'\)/.test(applyEdit.text));
    check('no invalid double-literal-plus-keyword line was written', !/''HTML|""HTML/.test(applyEdit.text));
    let reparsed = DspfParser.parseDspf(applyEdit.text);
    let rec1 = reparsed.records.find((r) => r.name === 'RECORD1');
    const htmlField = rec1.fields.find((f) => f.keywords.some((k) => k.name === 'HTML'));
    check('re-parses as a CONSTANT with a null constantValue (no literal text)', htmlField && htmlField.nameType === 'CONSTANT' && htmlField.constantValue == null);
    posted.length = 0;

    console.log('  editing the HTML tag text and applying rewrites HTML\'s own parameter');
    doc.getElementById('p-const-html-text').value = '</TITLE>';
    doc.getElementById('p-const-html-text').dispatchEvent(new Event('change', { bubbles: true }));
    doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    const applyEdit2 = posted.find((m) => m.type === 'applyEdit');
    check('HTML now carries the new tag text', /HTML\('<\/TITLE>'\)/.test(applyEdit2.text));

    check('no uncaught errors during this scenario', errors.length === 0);
    finishOne();
  }, 500);
}

// === Group B: "+ Add constant" can create a new HTML constant ===
runScenario2();
function runScenario2() {
  const src = ['     A          R RECORD1', "     A                                  2  2'Hello'"].join('\n') + '\n';
  const { dom, posted, errors } = makeDom(src);

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    console.log('\n"+ Add constant" can create a new HTML constant via the HTML tag value-source option');
    const placeConstantBtn = doc.getElementById('placeConstantBtn');
    placeConstantBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const screenEl = doc.querySelector('.dspf-screen');
    screenEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 95 }));
    const constKindSelect = doc.getElementById('p-place-const-kind');
    constKindSelect.value = 'html';
    constKindSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('switching to "html" hides the Text input', doc.getElementById('p-place-text-wrap').style.display === 'none');
    check('...and shows the HTML form instead', doc.getElementById('p-place-html-wrap').style.display !== 'none');
    doc.getElementById('p-place-html-text').value = '<B>';
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    const reparsed = DspfParser.parseDspf(applyEdit.text);
    const rec1 = reparsed.records.find((r) => r.name === 'RECORD1');
    const newHtmlField = rec1.fields.find((f) => f.keywords.some((k) => k.name === 'HTML' && /<B>/.test(k.parameters)));
    check('new HTML constant created, with a null constantValue (no literal alongside it)', newHtmlField && newHtmlField.nameType === 'CONSTANT' && newHtmlField.constantValue == null);

    check('no uncaught errors during this scenario', errors.length === 0);
    finishOne();
  }, 500);
}

// === Group C: raw keyword editor guard - mutual exclusion, both directions ===
runScenario3();
function runScenario3() {
  const src =
    [
      '     A          R RECORD1',
      "     A                                  1 10DSPATR(HI)",
      "     A                                  2 10HTML('<B>')",
    ].join('\n') + '\n';
  const { dom, posted, errors } = makeDom(src);

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    function selectField(idx) {
      const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
      boxes[idx].click();
      return boxes[idx].getAttribute('data-source-line');
    }

    function addRawKeyword(ownerKey, name, params) {
      const nameInput = doc.getElementById(ownerKey + '-new-kw-name');
      const paramsInput = doc.getElementById(ownerKey + '-new-kw-params');
      const addBtn = doc.querySelector('.kw-add[data-owner="' + ownerKey + '"]');
      nameInput.value = name;
      paramsInput.value = params || '';
      posted.length = 0;
      let alertMessage = null;
      const originalAlert = dom.window.alert;
      dom.window.alert = (msg) => { alertMessage = msg; };
      addBtn.dispatchEvent(new Event('click', { bubbles: true }));
      dom.window.alert = originalAlert;
      return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
    }

    console.log('\nRaw editor: HTML blocked on a field that already has DSPATR');
    const lineA = selectField(0);
    const ownerA = 'field-' + lineA;
    check('setup: found the DSPATR field via data-source-line', !!lineA);
    const resultA = addRawKeyword(ownerA, 'HTML', "'<I>'");
    check('HTML blocked with an alert naming DSPATR', !!resultA.alertMessage && resultA.alertMessage.indexOf('DSPATR') !== -1);
    check('no applyEdit was posted', !resultA.applyEdit);

    console.log('\nRaw editor: DSPATR blocked (reverse direction) on a field that already has HTML');
    const lineB = selectField(1);
    const ownerB = 'field-' + lineB;
    const resultB = addRawKeyword(ownerB, 'DSPATR', 'HI');
    check('DSPATR blocked with an alert naming HTML', !!resultB.alertMessage && resultB.alertMessage.indexOf('HTML') !== -1);
    check('no applyEdit was posted', !resultB.applyEdit);

    console.log('\nRaw editor: an unrelated keyword still adds normally on the HTML field (no regression)');
    const resultC = addRawKeyword(ownerB, 'CHECK', 'ME');
    check('CHECK commits normally', !!resultC.applyEdit);
    check('no alert fired for CHECK', !resultC.alertMessage);

    check('no uncaught errors during this scenario', errors.length === 0);
    finishOne();
  }, 500);
}

// === Group D: HTML blocked on a field of a subfile (SFL) record ===
runScenario4();
function runScenario4() {
  const src =
    [
      '     A          R SFLREC                    SFL',
      "     A            FLD1           10A  O  1  2",
      "     A                                  2 10'const text'",
    ].join('\n') + '\n';
  const { dom, posted, errors } = makeDom(src);

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    console.log('\nRaw editor: HTML blocked on a field of an SFL record');
    const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
    const constBox = boxes[boxes.length - 1]; // the plain constant field, last placed
    constBox.click();
    const line = constBox.getAttribute('data-source-line');
    const ownerKey = 'field-' + line;
    const nameInput = doc.getElementById(ownerKey + '-new-kw-name');
    const paramsInput = doc.getElementById(ownerKey + '-new-kw-params');
    const addBtn = doc.querySelector('.kw-add[data-owner="' + ownerKey + '"]');
    check('setup: raw keyword editor found for the constant field', !!nameInput && !!addBtn);
    nameInput.value = 'HTML';
    paramsInput.value = "'<B>'";
    posted.length = 0;
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    dom.window.alert = originalAlert;
    check('HTML blocked with an alert naming subfile (SFL)', !!alertMessage && alertMessage.indexOf('subfile (SFL)') !== -1);
    check('no applyEdit was posted', !posted.some((m) => m.type === 'applyEdit'));

    check('no uncaught errors during this scenario', errors.length === 0);
    finishOne();
  }, 500);
}

let scenariosRemaining = 4;
function finishOne() {
  scenariosRemaining--;
  if (scenariosRemaining === 0) {
    if (failures === 0) {
      console.log('\nALL CHECKS PASSED');
    } else {
      console.log('\n' + failures + ' CHECK(S) FAILED');
      process.exitCode = 1;
    }
  }
}

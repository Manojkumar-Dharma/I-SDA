/**
 * i65PshbtnChoiceControlColors.test.js
 *
 * Task I-65 (raised by I-57) - CHCAVAIL, CHCUNAVAIL and CHCCTL are all
 * allowed on a PSHBTNFLD field (per the DDS Reference's own PSHBTNFLD
 * list), but their editors (Choice keywords, Choice colors & attributes)
 * only appeared for SNGCHCFLD/MLTCHCFLD fields, so on a push-button field
 * they were reachable only through the raw keyword editor.
 *
 * Fix: a push-button field now gets (1) a CHCCTL-only editor, one row per
 * PSHBTNCHC choice number - NOT the choice editor, which also edits
 * CHOICE/CHCACCEL (forbidden on PSHBTNFLD) - and (2) the existing
 * available/unavailable colour editor restricted to those two states,
 * because CHCSLT is not on PSHBTNFLD's list either.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i65PshbtnChoiceControlColors.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');
const DspfWriter = require('../../dist/dspfWriter.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const KW = '     A                                      ';
const SRC = [
  '     A          R RECORD1',
  // F1: push-button field with two choices, a hand-written CHCCTL on button 1 and a CHCAVAIL
  '     A            F1             2Y 0B  3  5PSHBTNFLD',
  KW + "PSHBTNCHC(1 'OK')",
  KW + "PSHBTNCHC(2 'Cancel')",
  KW + 'CHCCTL(1 &CTLOK MSG1 QUSER/QMSG)',
  KW + 'CHCAVAIL((*COLOR GRN))',
  // F2: a single-choice field (regression - must keep the choice editors)
  '     A            F2             2Y 0B  6  5SNGCHCFLD',
  KW + "CHOICE(1 'One')",
  // F3: a plain field
  '     A            F3            10A  B  8  5',
  // F4: push-button field with an ORPHAN CHCCTL (no PSHBTNCHC 9)
  '     A            F4             2Y 0B 10  5PSHBTNFLD',
  KW + "PSHBTNCHC(1 'Go')",
  KW + 'CHCCTL(9 &CTLX)',
  // F5: push-button field with a (forbidden) hand-written CHCSLT
  '     A            F5             2Y 0B 12  5PSHBTNFLD',
  KW + "PSHBTNCHC(1 'Go')",
  KW + 'CHCSLT((*COLOR BLU))',
  // F6: push-button field with no choices yet
  '     A            F6             2Y 0B 14  5PSHBTNFLD',
].join('\n') + '\n';

function makeDom(src) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'I65.DSPF');
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
  function hasAccordion(owner, suffix) {
    return !!doc.querySelector('[data-accordion-key="' + owner + '::' + suffix + '"]');
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
  function setVal(cls, idx, v) {
    const els = doc.querySelectorAll('.' + cls);
    els[idx].value = v;
  }
  function applyCtl(pb) { return attempt(() => doc.querySelector('.' + pb + '-pbctl-apply').dispatchEvent(new Event('click', { bubbles: true }))); }
  function applyColors(pb) { return attempt(() => doc.querySelector('.' + pb + '-ccs-apply').dispatchEvent(new Event('click', { bubbles: true }))); }

  console.log('\nPush-button field F1: which editors appear');
  let owner = selectField(0);
  let pb = owner + '-pbx';
  check('CHCCTL accordion is present', hasAccordion(owner, 'pshbtn-choice-control'));
  check('avail/unavail colours accordion is present', hasAccordion(owner, 'pshbtn-choice-colors'));
  check('the CHOICE/CHCCTL/CHCACCEL choice editor is NOT shown (CHOICE/CHCACCEL are forbidden here)', !hasAccordion(owner, 'choice-keywords'));
  check('the SNGCHCFLD/MLTCHCFLD colours editor (which offers CHCSLT) is NOT shown', !hasAccordion(owner, 'choice-colors-attrs'));

  console.log('\nCHCCTL rows');
  const blocks = doc.querySelectorAll('#' + pb + '-pbctl-rows .pbctl-row-block');
  check('one row per PSHBTNCHC choice (2)', blocks.length === 2);
  check('button 1 is pre-filled from the hand-written CHCCTL', doc.querySelectorAll('.' + pb + '-pbctl-ctrl')[0].value === '&CTLOK'
    && doc.querySelectorAll('.' + pb + '-pbctl-msgid')[0].value === 'MSG1'
    && doc.querySelectorAll('.' + pb + '-pbctl-msgfile')[0].value === 'QMSG'
    && doc.querySelectorAll('.' + pb + '-pbctl-lib')[0].value === 'QUSER');
  check('button 2 (no CHCCTL yet) starts blank', doc.querySelectorAll('.' + pb + '-pbctl-ctrl')[1].value === '');
  check('the row header names the choice text', /Button 1 - OK/.test(blocks[0].textContent) && /Button 2 - Cancel/.test(blocks[1].textContent));

  console.log('\nCHCCTL: add a control field to button 2');
  setVal(pb + '-pbctl-ctrl', 1, 'CTLCAN');
  let r = applyCtl(pb);
  check('Apply posts an edit with no alert', !r.alertMessage && !!r.applyEdit);
  let f1 = r.applyEdit && fieldOf(r.applyEdit.text, 'F1');
  check('CHCCTL 2 written with the & prefix added', !!f1 && paramsOf(f1.keywords, 'CHCCTL').indexOf('2 &CTLCAN') >= 0);
  check('the existing CHCCTL 1 (with its message) is preserved', !!f1 && paramsOf(f1.keywords, 'CHCCTL').indexOf('1 &CTLOK MSG1 QUSER/QMSG') >= 0);
  check('both PSHBTNCHC and the CHCAVAIL are untouched', !!f1 && paramsOf(f1.keywords, 'PSHBTNCHC').length === 2 && paramsOf(f1.keywords, 'CHCAVAIL').length === 1);
  check('no CHOICE / CHCACCEL / CHCSLT keyword was introduced', !!f1 && !f1.keywords.some((k) => ['CHOICE', 'CHCACCEL', 'CHCSLT'].indexOf(k.name) >= 0));
  check('PSHBTNFLD itself is still there', !!f1 && f1.keywords.some((k) => k.name === 'PSHBTNFLD'));

  console.log('\nCHCCTL: clear button 1 removes its CHCCTL');
  owner = selectField(0);
  ['ctrl', 'msgid', 'msgfile', 'lib'].forEach((c) => setVal(pb + '-pbctl-' + c, 0, ''));
  r = applyCtl(pb);
  f1 = r.applyEdit && fieldOf(r.applyEdit.text, 'F1');
  check('CHCCTL 1 removed; the CHCCTL 2 added earlier remains (the webview applies edits cumulatively)', !!f1 && paramsOf(f1.keywords, 'CHCCTL').join('|') === '2 &CTLCAN');
  check('the other keywords survive', !!f1 && paramsOf(f1.keywords, 'PSHBTNCHC').length === 2);

  console.log('\nCHCCTL: validation (per the DDS Reference)');
  owner = selectField(0);
  setVal(pb + '-pbctl-ctrl', 1, '');
  setVal(pb + '-pbctl-msgid', 1, 'MSG9');
  r = applyCtl(pb);
  check('message ID with no control field -> alert, nothing posted', !!r.alertMessage && /control field/i.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(0);
  setVal(pb + '-pbctl-ctrl', 1, '&CTLCAN');
  setVal(pb + '-pbctl-msgid', 1, 'MSG9');
  setVal(pb + '-pbctl-msgfile', 1, '');
  r = applyCtl(pb);
  check('message ID with no message file -> alert, nothing posted', !!r.alertMessage && /message file/i.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(0);
  setVal(pb + '-pbctl-ctrl', 1, '&CTLCAN');
  setVal(pb + '-pbctl-msgid', 1, '');
  setVal(pb + '-pbctl-msgfile', 1, 'QMSG');
  r = applyCtl(pb);
  check('message file with no message ID -> alert, nothing posted', !!r.alertMessage && /message ID/i.test(r.alertMessage) && !r.applyEdit);
  owner = selectField(0);
  setVal(pb + '-pbctl-ctrl', 1, '&CTLCAN');
  setVal(pb + '-pbctl-msgid', 1, '&MSG');
  setVal(pb + '-pbctl-msgfile', 1, '&MSGF');
  setVal(pb + '-pbctl-lib', 1, '&LIB');
  r = applyCtl(pb);
  f1 = r.applyEdit && fieldOf(r.applyEdit.text, 'F1');
  check('program-to-system message fields (&MSG &LIB/&MSGF) are accepted and written', !!f1 && paramsOf(f1.keywords, 'CHCCTL').indexOf('2 &CTLCAN &MSG &LIB/&MSGF') >= 0);

  console.log('\nColours: only Available / Unavailable are offered');
  owner = selectField(0);
  pb = owner + '-pbx';
  check('Available editor present, pre-filled from CHCAVAIL (checked)', !!doc.getElementById(pb + '-ccs-avail-on') && doc.getElementById(pb + '-ccs-avail-on').checked);
  check('Available colour reads GRN', doc.getElementById(pb + '-ccs-avail-color').value === 'GRN');
  check('Unavailable editor present, unchecked', !!doc.getElementById(pb + '-ccs-unavail-on') && !doc.getElementById(pb + '-ccs-unavail-on').checked);
  check('Selected (CHCSLT) editor is NOT offered', !doc.getElementById(pb + '-ccs-slt-on'));
  doc.getElementById(pb + '-ccs-unavail-on').checked = true;
  doc.getElementById(pb + '-ccs-unavail-color').value = 'RED';
  r = applyColors(pb);
  f1 = r.applyEdit && fieldOf(r.applyEdit.text, 'F1');
  check('CHCUNAVAIL written with RED', !!f1 && paramsOf(f1.keywords, 'CHCUNAVAIL').length === 1 && /RED/.test(paramsOf(f1.keywords, 'CHCUNAVAIL')[0]));
  check('CHCAVAIL GRN preserved', !!f1 && paramsOf(f1.keywords, 'CHCAVAIL').length === 1 && /GRN/.test(paramsOf(f1.keywords, 'CHCAVAIL')[0]));
  check('no CHCSLT introduced', !!f1 && !f1.keywords.some((k) => k.name === 'CHCSLT'));
  owner = selectField(0);
  doc.getElementById(pb + '-ccs-avail-on').checked = false;
  r = applyColors(pb);
  f1 = r.applyEdit && fieldOf(r.applyEdit.text, 'F1');
  check('unticking Available removes CHCAVAIL', !!f1 && paramsOf(f1.keywords, 'CHCAVAIL').length === 0);

  console.log('\nRegression: single-choice field F2 keeps its own editors');
  owner = selectField(1);
  check('F2 still gets the choice keywords editor', hasAccordion(owner, 'choice-keywords'));
  check('F2 still gets the three-state colours editor (incl. Selected)', hasAccordion(owner, 'choice-colors-attrs') && !!doc.getElementById(owner + '-ccs-slt-on'));
  check('F2 gets no push-button editors', !hasAccordion(owner, 'pshbtn-choice-control') && !hasAccordion(owner, 'pshbtn-choice-colors'));

  console.log('\nRegression: a plain field F3');
  owner = selectField(2);
  check('F3 gets none of the choice or push-button editors', !hasAccordion(owner, 'pshbtn-choice-control') && !hasAccordion(owner, 'pshbtn-choice-colors') && !hasAccordion(owner, 'choice-keywords') && !hasAccordion(owner, 'choice-colors-attrs'));

  console.log('\nOrphan CHCCTL (choice number 9 has no PSHBTNCHC) on F4');
  owner = selectField(3);
  pb = owner + '-pbx';
  const orphanBlocks = doc.querySelectorAll('#' + pb + '-pbctl-rows .pbctl-row-block');
  check('two rows: the orphan (9) and the real choice (1)', orphanBlocks.length === 2);
  const orphan = Array.from(orphanBlocks).find((b) => b.getAttribute('data-choice-id') === '9');
  check('the orphan row is flagged as having no matching PSHBTNCHC', !!orphan && /No PSHBTNCHC/.test(orphan.textContent));
  r = applyCtl(pb);
  const f4 = r.applyEdit && fieldOf(r.applyEdit.text, 'F4');
  check('an unchanged Apply neither drops nor invents anything (orphan preserved)', !r.applyEdit || (paramsOf(f4.keywords, 'CHCCTL').join('|') === '9 &CTLX'));

  console.log('\nHand-written CHCSLT on a push-button field (F5) is left alone by the colours Apply');
  owner = selectField(4);
  pb = owner + '-pbx';
  check('no Selected editor is offered', !doc.getElementById(pb + '-ccs-slt-on'));
  doc.getElementById(pb + '-ccs-avail-on').checked = true;
  doc.getElementById(pb + '-ccs-avail-color').value = 'YLW';
  r = applyColors(pb);
  const f5 = r.applyEdit && fieldOf(r.applyEdit.text, 'F5');
  check('CHCAVAIL added', !!f5 && paramsOf(f5.keywords, 'CHCAVAIL').length === 1);
  check('the pre-existing CHCSLT is untouched (still there, still BLU)', !!f5 && paramsOf(f5.keywords, 'CHCSLT').length === 1 && /BLU/.test(paramsOf(f5.keywords, 'CHCSLT')[0]));

  console.log('\nPush-button field with no choices (F6)');
  owner = selectField(5);
  pb = owner + '-pbx';
  check('the CHCCTL panel explains a choice is needed first', /Add a push-button choice/.test((doc.querySelector('[data-accordion-key="' + owner + '::pshbtn-choice-control"]') || { textContent: '' }).textContent));
  check('...and offers no rows or Apply button', !doc.getElementById(pb + '-pbctl-rows') && !doc.querySelector('.' + pb + '-pbctl-apply'));

  check('no uncaught errors', errors.length === 0);
  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 600);

/**
 * i26SflChoiceListAudit.test.js
 *
 * Task I-26 - SFLSNGCHC/SFLMLTCHC (Subfile Single/Multiple Choice
 * Selection List, record-level SFLCTL keywords) and SFLSCROLL (field-level,
 * a hidden numeric field within the SFLCTL record). I-15's own audit found
 * SFLSNGCHC/SFLMLTCHC entirely absent from iSDA; this task adds them
 * (sflChoiceListPanelHtml/wireSflChoiceListPanel in the SFLCTL "General"
 * tab, DspfWriter.getSflSngChcKeyword/setSflSngChcKeyword/
 * getSflMltChcKeyword/setSflMltChcKeyword) plus SFLSCROLL alongside its
 * existing SFLRCDNBR/SFLROLVAL siblings on the Subfile keywords field
 * panel (subfileFieldKeywordsHtml/wireSubfileFieldKeywords).
 *
 * Covers:
 *  - SFLSNGCHC/SFLMLTCHC are mutually exclusive with each other and with
 *    SFLDROP/SFLFOLD (DspfWriter.sflChoiceListConflictReason).
 *  - Each writes its own *RSTCSR/*NORSTCSR/*SLTIND (and SFLSNGCHC's own
 *    *AUTOSLT/*NOAUTOSLT/*AUTOSLTENH) sub-parameters correctly, including
 *    leaving a group unwritten when left at "(default)".
 *  - SFLMLTCHC's own optional &number-selected field-name parameter.
 *  - SFLSCROLL is mutually exclusive with SFLROLVAL/SFLRCDNBR on the SAME
 *    field, and unique across the whole record (DspfWriter.
 *    sflScrollFieldConflictReason).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i25KeepConsolidationAudit.test.js).
 * Run with: node src/test/i26SflChoiceListAudit.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SFLREC                     SFL',
    "     A            FLD1          10A  O  4  2",
    '     A          R SFLCTLR                    SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(17)',
    '     A                                      SFLPAG(17)',
    "     A            NUMSEL         4S 0H",
    "     A            SCRL1          5S 0H",
    "     A            SCRL2          5S 0H",
    '     A          R PDNCTLR                    SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(17)',
    '     A                                      SFLPAG(17)',
    '     A                                      PULLDOWN',
    '     A          R DROPCTLR                   SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(17)',
    '     A                                      SFLPAG(17)',
    '     A                                      SFLDROP(CF03)',
  ].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');

const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

function clickTabByLabel(doc, Event, label) {
  const btn = Array.prototype.slice.call(doc.querySelectorAll('.props-tab'))
    .find(function (el) { return (el.textContent || '').trim() === label; });
  if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
  return btn;
}

function selectHiddenFieldByName(doc, Event, recordName, name) {
  const hiddenTabBtn = Array.prototype.slice.call(doc.querySelectorAll('.props-tab')).find(function (b) { return b.getAttribute('data-tab') === 'hidden'; });
  if (!hiddenTabBtn) return false;
  hiddenTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
  const row = Array.prototype.slice.call(doc.querySelectorAll('.field-order-row[data-source-line]')).find(function (el) { return el.textContent.indexOf(name) !== -1; });
  if (!row) return false;
  row.dispatchEvent(new Event('click', { bubbles: true }));
  return true;
}

setTimeout(() => {
  const { document: doc, Event } = dom.window;
  const recordSelect = doc.getElementById('recordSelect');

  // --- SFLCTLR: plain (non-pulldown) subfile control record ---
  recordSelect.value = 'SFLCTLR';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  clickTabByLabel(doc, Event, 'SFLCTL');

  const typeSelect = doc.getElementById('sflctl-SFLCTLR-selchc-type');
  check('setup: Selection List type selector present', !!typeSelect);
  check('starts at (none)', typeSelect.value === '');

  console.log('\nswitching to SFLSNGCHC reveals its own sub-controls and hides SFLMLTCHC\'s');
  doc.getElementById('sflctl-SFLCTLR-selchc-type').value = 'SFLSNGCHC';
  doc.getElementById('sflctl-SFLCTLR-selchc-type').dispatchEvent(new Event('change', { bubbles: true }));
  let applyEdit = posted.find((m) => m.type === 'applyEdit');
  check('an edit was posted', !!applyEdit);
  let reparsed = DspfParser.parseDspf(applyEdit.text);
  let ctlRec = reparsed.records.find((r) => r.name === 'SFLCTLR');
  check('SFLSNGCHC was written', ctlRec.keywords.some((k) => k.name === 'SFLSNGCHC'));
  posted.length = 0;

  const sngchcDiv = doc.getElementById('sflctl-SFLCTLR-selchc-sngchc');
  const mltchcDiv = doc.getElementById('sflctl-SFLCTLR-selchc-mltchc');
  check('SFLSNGCHC sub-controls now visible', sngchcDiv && sngchcDiv.style.display !== 'none');
  check('SFLMLTCHC sub-controls stay hidden', mltchcDiv && mltchcDiv.style.display === 'none');

  console.log('\nsetting *RSTCSR/*SLTIND/*AUTOSLT explicitly on SFLSNGCHC');
  doc.getElementById('sflctl-SFLCTLR-selchc-sngchc-rstcsr').value = 'RSTCSR';
  doc.getElementById('sflctl-SFLCTLR-selchc-sngchc-rstcsr').dispatchEvent(new Event('change', { bubbles: true }));
  posted.length = 0;
  doc.getElementById('sflctl-SFLCTLR-selchc-sngchc-sltind').checked = true;
  doc.getElementById('sflctl-SFLCTLR-selchc-sngchc-sltind').dispatchEvent(new Event('change', { bubbles: true }));
  posted.length = 0;
  doc.getElementById('sflctl-SFLCTLR-selchc-sngchc-autoslt').value = 'NOAUTOSLT';
  doc.getElementById('sflctl-SFLCTLR-selchc-sngchc-autoslt').dispatchEvent(new Event('change', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = DspfParser.parseDspf(applyEdit.text);
  ctlRec = reparsed.records.find((r) => r.name === 'SFLCTLR');
  const sngchcKw = ctlRec.keywords.find((k) => k.name === 'SFLSNGCHC');
  check('*RSTCSR written', /\*RSTCSR\b/.test(sngchcKw.parameters));
  check('*SLTIND written', /\*SLTIND\b/.test(sngchcKw.parameters));
  check('*NOAUTOSLT written (explicit override, not just omitted)', /\*NOAUTOSLT\b/.test(sngchcKw.parameters));
  posted.length = 0;

  console.log('\nswitching to SFLMLTCHC removes SFLSNGCHC and writes SFLMLTCHC instead (mutually exclusive)');
  doc.getElementById('sflctl-SFLCTLR-selchc-type').value = 'SFLMLTCHC';
  doc.getElementById('sflctl-SFLCTLR-selchc-type').dispatchEvent(new Event('change', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = DspfParser.parseDspf(applyEdit.text);
  ctlRec = reparsed.records.find((r) => r.name === 'SFLCTLR');
  check('SFLSNGCHC removed', !ctlRec.keywords.some((k) => k.name === 'SFLSNGCHC'));
  check('SFLMLTCHC written', ctlRec.keywords.some((k) => k.name === 'SFLMLTCHC'));
  posted.length = 0;

  console.log('\nSFLMLTCHC\'s own &number-selected field-name parameter commits');
  const numselEl = doc.getElementById('sflctl-SFLCTLR-selchc-mltchc-numsel');
  check('number-selected input present', !!numselEl);
  numselEl.value = 'NUMSEL';
  numselEl.dispatchEvent(new Event('change', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = DspfParser.parseDspf(applyEdit.text);
  ctlRec = reparsed.records.find((r) => r.name === 'SFLCTLR');
  const mltchcKw = ctlRec.keywords.find((k) => k.name === 'SFLMLTCHC');
  check('&NUMSEL written', /&NUMSEL\b/i.test(mltchcKw.parameters));
  posted.length = 0;

  console.log('\nswitching back to (none) removes SFLMLTCHC entirely');
  doc.getElementById('sflctl-SFLCTLR-selchc-type').value = '';
  doc.getElementById('sflctl-SFLCTLR-selchc-type').dispatchEvent(new Event('change', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = DspfParser.parseDspf(applyEdit.text);
  ctlRec = reparsed.records.find((r) => r.name === 'SFLCTLR');
  check('SFLMLTCHC removed', !ctlRec.keywords.some((k) => k.name === 'SFLMLTCHC'));
  check('SFLSNGCHC still absent too', !ctlRec.keywords.some((k) => k.name === 'SFLSNGCHC'));
  posted.length = 0;

  // --- DROPCTLR: already carries SFLDROP - turning on either choice-list keyword must be blocked ---
  recordSelect.value = 'DROPCTLR';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  clickTabByLabel(doc, Event, 'SFLCTL');
  console.log('\nTask I-26: SFLSNGCHC is blocked (alert + revert) on a record that already carries SFLDROP');
  const dropTypeSelect = doc.getElementById('sflctl-DROPCTLR-selchc-type');
  check('setup: type selector present on DROPCTLR', !!dropTypeSelect);
  dropTypeSelect.value = 'SFLSNGCHC';
  dropTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  check('reverted back to (none) after the blocked attempt', dropTypeSelect.value === '');
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  check('no edit was posted for the blocked attempt', !applyEdit);
  posted.length = 0;

  // --- PDNCTLR: a pulldown SFLCTL record - defaults hint should reflect that ---
  recordSelect.value = 'PDNCTLR';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  clickTabByLabel(doc, Event, 'SFLCTL');
  console.log('\nTask I-26: on a pulldown SFLCTL record, the RSTCSR/AUTOSLT "(default)" option text reflects the pulldown-flipped defaults');
  const pdnTypeSelect = doc.getElementById('sflctl-PDNCTLR-selchc-type');
  pdnTypeSelect.value = 'SFLSNGCHC';
  pdnTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  posted.length = 0;
  const pdnRstcsrOptions = Array.prototype.slice.call(doc.getElementById('sflctl-PDNCTLR-selchc-sngchc-rstcsr').options).map((o) => o.textContent);
  const pdnAutosltOptions = Array.prototype.slice.call(doc.getElementById('sflctl-PDNCTLR-selchc-sngchc-autoslt').options).map((o) => o.textContent);
  check('RSTCSR default hint mentions *RSTCSR (this record is in a pull-down)', pdnRstcsrOptions.some((t) => /default.*\*RSTCSR.*pull-down/i.test(t)));
  check('AUTOSLT default hint mentions *AUTOSLT (this record is in a pull-down)', pdnAutosltOptions.some((t) => /default.*\*AUTOSLT.*pull-down/i.test(t)));

  // --- SFLSCROLL field-level checks (SFLCTLR's own fields: SCRL1/SCRL2) ---
  recordSelect.value = 'SFLCTLR';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('\nTask I-26: SFLSCROLL commits on a plain hidden field within an SFLCTL record');
  check('SCRL1 is selectable on the canvas', selectHiddenFieldByName(doc, Event, 'SFLCTLR', 'SCRL1'));
  const scrl1ScrollEl = Array.prototype.slice.call(doc.querySelectorAll('input[type="checkbox"]')).find((el) => el.id.endsWith('-sflscroll'));
  check('SFLSCROLL checkbox present for SCRL1', !!scrl1ScrollEl);
  scrl1ScrollEl.checked = true;
  scrl1ScrollEl.dispatchEvent(new Event('change', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = DspfParser.parseDspf(applyEdit.text);
  let scrl1Field = reparsed.records.find((r) => r.name === 'SFLCTLR').fields.find((f) => f.name === 'SCRL1');
  check('SFLSCROLL written to SCRL1', scrl1Field.keywords.some((k) => k.name === 'SFLSCROLL'));
  posted.length = 0;

  console.log('\nTask I-26: a second SFLSCROLL on another field in the SAME record is blocked (alert + revert) - "only one per record"');
  doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
  check('SCRL2 is selectable on the canvas', selectHiddenFieldByName(doc, Event, 'SFLCTLR', 'SCRL2'));
  const scrl2ScrollEl = Array.prototype.slice.call(doc.querySelectorAll('input[type="checkbox"]')).find((el) => el.id.endsWith('-sflscroll'));
  check('SFLSCROLL checkbox present for SCRL2', !!scrl2ScrollEl);
  scrl2ScrollEl.checked = true;
  scrl2ScrollEl.dispatchEvent(new Event('change', { bubbles: true }));
  check('SCRL2\'s own SFLSCROLL reverted back to unchecked', scrl2ScrollEl.checked === false);
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  check('no edit was posted for the blocked attempt', !applyEdit);
  posted.length = 0;

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 0);

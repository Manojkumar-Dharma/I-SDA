/**
 * i22SflDisplayLayoutConditioning.test.js
 *
 * Task I-22 - SFLSIZ/SFLPAG/SFLLIN display-size (*DSx) conditioning. Per
 * keywordFixes.md's I-22 section: all three keywords are individually
 * documented by the DDS Reference as accepting a display-size condition
 * name for a second value that applies only to the file's secondary
 * DSPSIZ size (required if the value actually differs between the two).
 * SFLSIZ alone also accepts a program-to-system field name in place of a
 * number, but its own text is explicit that a size-conditioned SFLSIZ
 * value must be a plain number - see
 * DspfWriter.sflsizConditionedFieldNameConflictReason's own doc comment.
 *
 * This confirms the fix: getSflDisplayLayout/setSflDisplayLayout's new
 * {primary, bySizeName} shape (same as getSflMsgRcdLines/
 * getFileMsgLocLines), the per-size input rows only rendered when the
 * file has 2+ DSPSIZ sizes, that editing any one input in the panel
 * still commits everything currently there (Task L75's own established
 * behavior, extended rather than replaced), and the SFLSIZ field-name
 * guard (alert + revert, same idiom as I-8/I-11/I-12/I-13).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i22SflDisplayLayoutConditioning.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfParser = require('../../dist/dspfParser.js');
const { buildLine } = require('../fixtures/lineBuilder.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// Two declared display sizes (*DS3/*DS4) so the new per-size rows render.
// SFLSIZ: unconditioned primary (17) + a *DS4-conditioned value (20).
// SFLPAG: unconditioned primary (17) only - no *DS4-conditioned entry yet,
// so its own ds1 input should pre-fill blank.
// SFLLIN: no unconditioned entry at all, only a *DS4-conditioned one (2) -
// confirms the primary being entirely absent doesn't break the per-size
// reads, same "any of the three independently absent" contract the old
// single-instance version already had.
const dspfSource =
  [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00030', name: 'FLD1', length: '10', dataType: 'A', usage: 'O', line: '4', col: '2' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00050', func: 'SFLSIZ(17)' }),
    buildLine({ seq: '00060', sizeCondition: '*DS4', func: 'SFLSIZ(20)' }),
    buildLine({ seq: '00070', func: 'SFLPAG(17)' }),
    buildLine({ seq: '00080', sizeCondition: '*DS4', func: 'SFLLIN(2)' }),
    buildLine({ seq: '00090', func: 'SFLDSP' }),
    buildLine({ seq: '00100', func: 'SFLDSPCTL' }),
  ].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);

let posted = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({
      getState: () => null,
      setState: () => {},
      postMessage: (m) => posted.push(m),
    });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  function selectRecord(name) {
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = name;
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  selectRecord('SFLCTLR');
  const p = 'sflctl-SFLCTLR';

  console.log('\nSFLCTL Display Layout: per-size rows render for a file with 2 display sizes, pre-filled from the existing DDS');
  check('SFLSIZ primary pre-filled (17)', doc.getElementById(p + '-sflsiz').value === '17');
  check('SFLSIZ *DS4 (ds1) pre-filled (20)', doc.getElementById(p + '-sflsiz-ds1').value === '20');
  check('SFLPAG primary pre-filled (17)', doc.getElementById(p + '-sflpag').value === '17');
  check('SFLPAG *DS4 (ds1) pre-fills blank (no conditioned entry exists yet)', doc.getElementById(p + '-sflpag-ds1').value === '');
  check('SFLLIN primary pre-fills blank (no unconditioned entry exists)', doc.getElementById(p + '-sfllin').value === '');
  check('SFLLIN *DS4 (ds1) pre-filled (2)', doc.getElementById(p + '-sfllin-ds1').value === '2');

  console.log('\nediting one field commits every value currently in the panel (Task L75\u2019s own established behavior, extended to the new per-size inputs)');
  posted.length = 0;
  doc.getElementById(p + '-sflpag').value = '19';
  doc.getElementById(p + '-sflpag-ds1').value = '22';
  doc.getElementById(p + '-sflpag-ds1').dispatchEvent(new Event('change', { bubbles: true }));
  let applyEdit = posted.find((m) => m.type === 'applyEdit');
  let reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLCTLR');
  check('an applyEdit was posted', !!applyEdit);
  check('SFLSIZ primary (17) survived, untouched by editing SFLPAG', reparsed.keywords.find((k) => k.name === 'SFLSIZ' && !(k.conditions || []).some((g) => g.displaySizeCondition)).parameters.trim() === '17');
  check('SFLSIZ *DS4-conditioned value (20) survived, untouched', reparsed.keywords.find((k) => k.name === 'SFLSIZ' && (k.conditions || []).some((g) => g.displaySizeCondition && g.displaySizeCondition.name === '*DS4')).parameters.trim() === '20');
  check('SFLPAG primary updated to 19', reparsed.keywords.find((k) => k.name === 'SFLPAG' && !(k.conditions || []).some((g) => g.displaySizeCondition)).parameters.trim() === '19');
  check('SFLPAG *DS4-conditioned value now 22', reparsed.keywords.find((k) => k.name === 'SFLPAG' && (k.conditions || []).some((g) => g.displaySizeCondition && g.displaySizeCondition.name === '*DS4')).parameters.trim() === '22');
  check('SFLLIN *DS4-conditioned value (2) survived, untouched', reparsed.keywords.find((k) => k.name === 'SFLLIN' && (k.conditions || []).some((g) => g.displaySizeCondition && g.displaySizeCondition.name === '*DS4')).parameters.trim() === '2');

  console.log('\nSFLSIZ accepts a program-to-system field name in its unconditioned (primary) slot');
  posted.length = 0;
  doc.getElementById(p + '-sflsiz').value = 'SIZEFLD';
  doc.getElementById(p + '-sflsiz').dispatchEvent(new Event('change', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLCTLR');
  check('SFLSIZ primary now the field name SIZEFLD', !!reparsed && reparsed.keywords.find((k) => k.name === 'SFLSIZ' && !(k.conditions || []).some((g) => g.displaySizeCondition)).parameters.trim() === 'SIZEFLD');

  console.log('\na size-conditioned SFLSIZ value must be a plain number - a field name there is hard-blocked (alert + revert), per the DDS Reference');
  posted.length = 0;
  let alertMessage = null;
  const originalAlert = dom.window.alert;
  dom.window.alert = (msg) => { alertMessage = msg; };
  doc.getElementById(p + '-sflsiz-ds1').value = 'BOGUSFLD';
  doc.getElementById(p + '-sflsiz-ds1').dispatchEvent(new Event('change', { bubbles: true }));
  dom.window.alert = originalAlert;
  check('blocked with an alert naming SFLSIZ', /SFLSIZ/.test(alertMessage || ''));
  check('the *DS4 input reverted back to its previous numeric value (20)', doc.getElementById(p + '-sflsiz-ds1').value === '20');
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLCTLR');
  check('the *DS4-conditioned SFLSIZ value in the DDS is still 20, not BOGUSFLD', !!reparsed && reparsed.keywords.find((k) => k.name === 'SFLSIZ' && (k.conditions || []).some((g) => g.displaySizeCondition && g.displaySizeCondition.name === '*DS4')).parameters.trim() === '20');

  console.log('\nSFLPAG/SFLLIN have no field-name form at all, so their own per-size inputs are NOT numeric-only (no guard fires for a non-numeric value)');
  posted.length = 0;
  alertMessage = null;
  dom.window.alert = (msg) => { alertMessage = msg; };
  doc.getElementById(p + '-sfllin-ds1').value = 'ANYTHING';
  doc.getElementById(p + '-sfllin-ds1').dispatchEvent(new Event('change', { bubbles: true }));
  dom.window.alert = originalAlert;
  check('no alert fired for SFLLIN\u2019s own per-size input', alertMessage === null);
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLCTLR');
  check('SFLLIN *DS4-conditioned value committed as-is (no guard for this keyword)', !!reparsed && reparsed.keywords.find((k) => k.name === 'SFLLIN' && (k.conditions || []).some((g) => g.displaySizeCondition && g.displaySizeCondition.name === '*DS4')).parameters.trim() === 'ANYTHING');

  console.log('\n--- Single-display-size record: no per-size rows at all (no regression from the new feature) ---');
  const singleSizeSource =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SFLREC2', func: 'SFL' }),
      buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'O', line: '4', col: '2' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'SFLCTLR2', func: 'SFLCTL(SFLREC2)' }),
      buildLine({ seq: '00040', func: 'SFLSIZ(10)' }),
      buildLine({ seq: '00050', func: 'SFLPAG(10)' }),
      buildLine({ seq: '00060', func: 'SFLDSP' }),
      buildLine({ seq: '00070', func: 'SFLDSPCTL' }),
    ].join('\n') + '\n';
  const singleHtml = getWebviewHtml('vscode-webview://fake', 'testnonce2', singleSizeSource, 'MYSCR2.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  let posted2 = [];
  const dom2 = new JSDOM(singleHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({
        getState: () => null,
        setState: () => {},
        postMessage: (m) => posted2.push(m),
      });
      window.alert = () => {};
    },
  });
  setTimeout(() => {
    const doc2 = dom2.window.document;
    const recordSelect2 = doc2.getElementById('recordSelect');
    recordSelect2.value = 'SFLCTLR2';
    recordSelect2.dispatchEvent(new dom2.window.Event('change', { bubbles: true }));
    const p2 = 'sflctl-SFLCTLR2';
    check('SFLSIZ primary pre-filled (10)', doc2.getElementById(p2 + '-sflsiz').value === '10');
    check('no SFLSIZ per-size row exists for a single-size file', !doc2.getElementById(p2 + '-sflsiz-ds0'));
    check('no SFLPAG per-size row exists for a single-size file', !doc2.getElementById(p2 + '-sflpag-ds0'));
    check('no SFLLIN per-size row exists for a single-size file', !doc2.getElementById(p2 + '-sfllin-ds0'));

    // Editing the primary still commits normally, unaffected by the new
    // per-size machinery (mirrors dspfWebview.test.js's own pre-existing
    // Display Layout scenario, kept passing unmodified by this task).
    posted2.length = 0;
    doc2.getElementById(p2 + '-sflpag').value = '9';
    doc2.getElementById(p2 + '-sflpag').dispatchEvent(new dom2.window.Event('change', { bubbles: true }));
    const applyEdit2 = posted2.find((m) => m.type === 'applyEdit');
    const reparsed2 = applyEdit2 && DspfParser.parseDspf(applyEdit2.text).records.find((r) => r.name === 'SFLCTLR2');
    check('SFLPAG committed normally on a single-size file', !!reparsed2 && reparsed2.keywords.find((k) => k.name === 'SFLPAG').parameters.trim() === '9');

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 50);
}, 50);

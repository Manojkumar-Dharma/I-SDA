/**
 * i48MnubarRawKeywordEditorWhitelist.test.js
 *
 * Task I-48 - re-read MNUBAR's own DDS Reference section fresh (split off
 * from I-44's original USRDFN finding, same investigation shape as I-46's
 * own SFL/SFLCTL re-read and I-47's own WINDOW re-read). MNUBAR's own
 * section states outright: "The following keywords are allowed on a
 * record containing the MNUBAR keyword:" followed by a closed, 27-entry
 * list - the exact same closed-whitelist shape as USRDFN's own "except"
 * text and SFL's own "also valid" text (see
 * DspfWriter.mnubarWhitelistConflictReason's own doc comment for the
 * full citation and keyword list). I-19's own field-shape rule (exactly
 * one menu-bar field, no other displayable fields) is a separate,
 * already-fixed concern, out of this task's own scope.
 *
 * Fix: same catch-all shape I-49/I-46/I-47 each built - wireKeywordEditor's
 * existing addGuardFn(name, params) hook, at the SAME record-level call
 * site, now also consults DspfWriter.mnubarWhitelistConflictReason. An
 * exhaustive sweep of the structured per-keyword checkboxes across the
 * General/Indicator/Output/Input/Overlay/Print tabs (the same "much
 * larger undertaking" I-46 split off as I-53 for SFL's own whitelist) is
 * logged separately as I-54, not attempted here.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i48MnubarRawKeywordEditorWhitelist.test.js
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

const dspfSource =
  [
    '     A          R MB                          MNUBAR',
    "     A            MNUFLD         2Y 0B 1  2",
    '     A                                      MNUBARCHC(1 PULLREC \'File\')',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
  ].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYMENU.DSPF').replace(
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

  function reparsedRecord(text, recordName) {
    return DspfParser.parseDspf(text).records.find((r) => r.name === recordName);
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

  // === Group A: non-whitelisted keywords are blocked on a MNUBAR record ===
  selectRecord('MB');
  const mbOwner = 'record-MB';
  console.log('\nMNUBAR record: raw editor blocks a non-whitelisted keyword add');
  ['RETKEY', 'DSPATR', 'BLINK', 'ASSUME', 'SLNO'].forEach(function (name) {
    const result = addRawKeyword(mbOwner, name);
    check(name + ' blocked with an alert naming menu-bar (MNUBAR)', !!result.alertMessage && result.alertMessage.indexOf('menu-bar (MNUBAR)') !== -1);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !result.applyEdit);
  });

  // === Group B: whitelisted keywords still add normally on a MNUBAR record ===
  console.log('\nMNUBAR record: raw editor still allows whitelisted keywords through');
  ['CLRL', 'DSPMOD', 'KEEP', 'PROTECT'].forEach(function (name) {
    const result = addRawKeyword(mbOwner, name);
    check(name + ' (whitelisted) commits normally on a MNUBAR record', !!result.applyEdit);
    const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'MB');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  // === Group C: CAnn/CFnn command-key names are whitelisted by pattern ===
  console.log('\nMNUBAR record: CAnn/CFnn command-key names are whitelisted by pattern');
  ['CA01', 'CF12'].forEach(function (name) {
    const result = addRawKeyword(mbOwner, name, '99');
    check(name + ' commits normally (matched by the CAnn/CFnn pattern)', !!result.applyEdit);
    check('no alert fired for ' + name, !result.alertMessage);
  });

  // === Group D: no regression - a non-MNUBAR record's raw editor is unaffected ===
  console.log('\nnon-MNUBAR record: raw editor is completely unaffected (no guard wired there)');
  selectRecord('PLAINREC');
  const pOwner = 'record-PLAINREC';
  ['DSPATR', 'BLINK', 'ASSUME'].forEach(function (name) {
    const result = addRawKeyword(pOwner, name);
    check(name + ' commits normally on a non-MNUBAR record', !!result.applyEdit);
    check('no alert fired for ' + name + ' on a non-MNUBAR record', !result.alertMessage);
    const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'PLAINREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

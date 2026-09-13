/**
 * i12WindowConflictAudit.test.js
 *
 * Task I-12 - WINDOW record-level keyword audit. Per keywordFixes.md's
 * I-12 section: WINDOW's own DDS Reference section states "The WINDOW
 * keyword is not allowed on a record format that has any one of the
 * following keywords specified: ALWROL, ASSUME, MNUBAR, PULLDOWN, SFL,
 * USRDFN." Of these, MNUBAR/PULLDOWN/SFL/USRDFN are each their own
 * record TYPE picked once at creation time and never reachable as an
 * on-transition against an existing WINDOW record through this UI -
 * only ALWROL/ASSUME are plain General-tab toggles (I-7's own set,
 * reused unchanged for WINDOW records) that WERE reachable, unguarded,
 * before this task (see DspfWriter.windowConflictReason's own doc
 * comment). This test confirms the fix: turning either ON is
 * hard-blocked (alert + revert, no edit posted) on a WINDOW record,
 * while the exact same rows still work normally on an ordinary
 * (non-WINDOW) record - same "confirmed NOT-valid / confirmed-valid, no
 * regression" shape as i8UsrdfnConflictAudit.test.js.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i12WindowConflictAudit.test.js
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
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R WINREC                     WINDOW(3 10 8 30)',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
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

  // Sanity: WINREC really parsed with a WINDOW keyword.
  const parsedInitial = DspfParser.parseDspf(dspfSource);
  check('setup: WINREC carries WINDOW', parsedInitial.records.find((r) => r.name === 'WINREC').keywords.some((k) => k.name === 'WINDOW'));

  function selectRecord(name) {
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = name;
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function withAlertCapture(fn) {
    const originalAlert = dom.window.alert;
    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    fn();
    dom.window.alert = originalAlert;
    return alertMessage;
  }

  // --- WINDOW record: ALWROL/ASSUME must be hard-blocked ---
  selectRecord('WINREC');
  const wP = 'rk-WINREC';

  console.log('\nWINDOW record: General-tab keywords ALWROL/ASSUME are blocked from being turned on');
  ['alwrol', 'assume'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const box = doc.getElementById(wP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' blocked with an alert naming WINDOW', /WINDOW/.test(alertMessage || ''));
    check(name + ' checkbox reverted back off', doc.getElementById(wP + '-' + suffix + '-on').checked === false);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !posted.some((m) => m.type === 'applyEdit'));
  });

  console.log('\nWINDOW record: an unrelated, still-valid General keyword commits normally (guard is scoped to ALWROL/ASSUME only)');
  {
    const retkeyOn = doc.getElementById(wP + '-retkey-on');
    check('setup: RETKEY checkbox is present', !!retkeyOn);
    posted.length = 0;
    retkeyOn.checked = true;
    retkeyOn.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('RETKEY commits normally (edit posted, no alert path)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WINREC');
    check('RETKEY actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'RETKEY'));
  }

  // --- Plain (non-WINDOW) record: ALWROL/ASSUME must be unaffected ---
  selectRecord('PLAINREC');
  const pP = 'rk-PLAINREC';

  console.log('\nnon-WINDOW record: ALWROL/ASSUME still turn on normally (no regression from the new guard, and the pre-existing USRDFN guard still doesn\'t fire either)');
  ['alwrol', 'assume'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const box = doc.getElementById(pP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present on PLAINREC', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' triggered no alert on a non-WINDOW record', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(name + ' commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PLAINREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 50);

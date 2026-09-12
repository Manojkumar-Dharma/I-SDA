/**
 * i8UsrdfnConflictAudit.test.js
 *
 * Task I-8 - USRDFN record-level keyword audit. Per keywordFixes.md's I-8
 * section: checked every keyword in USRDFN's own narrowed General/Help/
 * Print subset (isUsrDfnRecord's own doc comment in
 * webviewClientHelpers.js) against IBM's own DDS Reference text and found
 * four keywords each individually documented as incompatible with a
 * user-defined (USRDFN keyword) record format - ALWROL, ASSUME, HLPSEQ,
 * HLPCMDKEY (see DspfWriter.usrdfnConflictReason's own doc comment for the
 * citations). This test confirms the fix: turning any of the four ON is
 * hard-blocked (alert + revert, no edit posted) on a USRDFN record, while
 * the exact same rows still work normally on an ordinary (non-USRDFN)
 * record - same "confirmed NOT-valid / confirmed-valid, no regression"
 * shape as i7RecordConditioningAudit.test.js, plus the alert+revert
 * mechanics i11's own dspfWebview.test.js block already established for
 * SFLNXTCHG/SFLMSGRCD.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i8UsrdfnConflictAudit.test.js
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
    '     A          R USRREC                     USRDFN',
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

  // Sanity: USRREC really parsed as a USRDFN record and its own DDS
  // example shape (bare USRDFN, no fields) round-trips.
  const parsedInitial = DspfParser.parseDspf(dspfSource);
  check('setup: USRREC carries USRDFN', parsedInitial.records.find((r) => r.name === 'USRREC').keywords.some((k) => k.name === 'USRDFN'));

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

  // --- USRDFN record: the four guarded keywords must be hard-blocked ---
  selectRecord('USRREC');
  const uP = 'rk-USRREC';

  console.log('\nUSRDFN record: General-tab keywords ALWROL/ASSUME are blocked from being turned on');
  ['alwrol', 'assume'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const box = doc.getElementById(uP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' blocked with an alert naming USRDFN', /USRDFN/.test(alertMessage || ''));
    check(name + ' checkbox reverted back off', doc.getElementById(uP + '-' + suffix + '-on').checked === false);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !posted.some((m) => m.type === 'applyEdit'));
  });

  console.log('\nUSRDFN record: Help-tab HLPCMDKEY is blocked from being turned on');
  {
    const box = doc.getElementById(uP + '-hlpcmdkey-on');
    check('setup: HLPCMDKEY checkbox is present', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('HLPCMDKEY blocked with an alert naming USRDFN', /USRDFN/.test(alertMessage || ''));
    check('HLPCMDKEY checkbox reverted back off', doc.getElementById(uP + '-hlpcmdkey-on').checked === false);
    check('no applyEdit was posted for the blocked HLPCMDKEY attempt', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('\nUSRDFN record: Help-tab HLPSEQ is blocked from being set (no on/off checkbox - presence is either box being non-blank)');
  {
    const groupEl = doc.getElementById(uP + '-hlpseq-group');
    const numEl = doc.getElementById(uP + '-hlpseq-num');
    check('setup: HLPSEQ group/number boxes are present', !!groupEl && !!numEl);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      groupEl.value = 'HGROUP1';
      groupEl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('HLPSEQ blocked with an alert naming USRDFN', /USRDFN/.test(alertMessage || ''));
    check('HLPSEQ group box reverted back blank', doc.getElementById(uP + '-hlpseq-group').value === '');
    check('no applyEdit was posted for the blocked HLPSEQ attempt', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('\nUSRDFN record: an unrelated, still-valid General keyword commits normally (guard is scoped to the four flagged keywords only)');
  {
    const retkeyOn = doc.getElementById(uP + '-retkey-on');
    check('setup: RETKEY checkbox is present', !!retkeyOn);
    posted.length = 0;
    retkeyOn.checked = true;
    retkeyOn.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('RETKEY commits normally (edit posted, no alert path)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'USRREC');
    check('RETKEY actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'RETKEY'));
  }

  // --- Plain (non-USRDFN) record: same four keywords must be unaffected ---
  selectRecord('PLAINREC');
  const pP = 'rk-PLAINREC';

  console.log('\nnon-USRDFN record: ALWROL/ASSUME/HLPCMDKEY still turn on normally (no regression from the new guard)');
  ['alwrol', 'assume', 'hlpcmdkey'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const box = doc.getElementById(pP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present on PLAINREC', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' triggered no alert on a non-USRDFN record', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(name + ' commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PLAINREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  console.log('\nnon-USRDFN record: HLPSEQ still commits normally (no regression from the new guard)');
  {
    const groupEl = doc.getElementById(pP + '-hlpseq-group');
    const numEl = doc.getElementById(pP + '-hlpseq-num');
    check('setup: HLPSEQ group/number boxes are present on PLAINREC', !!groupEl && !!numEl);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      groupEl.value = 'HGROUP1';
      groupEl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('HLPSEQ triggered no alert on a non-USRDFN record', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('HLPSEQ commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PLAINREC');
    check('HLPSEQ actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'HLPSEQ' && k.parameters.trim() === 'HGROUP1'));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 50);

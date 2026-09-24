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
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R USRREC                     USRDFN',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
    '     A          R PLAINREC2',
    "     A                                  1  2'PLAIN SCREEN 2'",
    '     A          R PLAINREC3',
    "     A                                  1  2'PLAIN SCREEN 3'",
  ].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');

let posted = [];
const dom = newWebviewDom(html, {
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

  // --- USRDFN record: the four inapplicable keywords are no longer offered ---
  // Task I-105 (option (a)): a USRDFN record hides every row that is not on
  // its closed whitelist instead of showing it and refusing the tick. The
  // refusal itself (usrdfnConflictReason / usrdfnWhitelistConflictReason) is
  // still in place for the raw editor and any full-row-set caller, and is
  // exercised there by i102/i104/i111 and dspfWriter.test.js; what this test
  // now pins is that the row is simply not there.
  selectRecord('USRREC');
  const uP = 'rk-USRREC';

  console.log('\nUSRDFN record (Task I-105): ALWROL / ASSUME / HLPCMDKEY / HLPSEQ rows are hidden, not shown-and-refused');
  ['alwrol', 'assume', 'hlpcmdkey'].forEach(function (suffix) {
    check(suffix.toUpperCase() + ' checkbox is not rendered on a USRDFN record', !doc.getElementById(uP + '-' + suffix + '-on'));
  });
  check('HLPSEQ group/number boxes are not rendered on a USRDFN record', !doc.getElementById(uP + '-hlpseq-group') && !doc.getElementById(uP + '-hlpseq-num'));

  console.log('\nUSRDFN record: a keyword genuinely on USRDFN\'s own whitelist still commits normally (I-44 note: RETKEY used to be this test\'s "unrelated, still-valid" example, back when the guard was scoped to just four keywords by name rather than USRDFN\'s own blanket whitelist rule - RETKEY is correctly guarded now too, see i44UsrdfnRecordLevelAudit.test.js, so KEEP - one of the nine keywords USRDFN\'s own DDS Reference text explicitly excepts, and still on the General tab USRDFN records keep - replaces it here)');
  {
    const keepOn = doc.getElementById(uP + '-keep-on');
    check('setup: KEEP checkbox is present', !!keepOn);
    posted.length = 0;
    keepOn.checked = true;
    keepOn.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('KEEP commits normally (edit posted, no alert path)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'USRREC');
    check('KEEP actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'KEEP'));
  }

  // --- Plain (non-USRDFN) record: same four keywords must be unaffected ---
  // Each of ALWROL/ASSUME/HLPCMDKEY gets its own separate plain record
  // (PLAINREC/PLAINREC2/PLAINREC3) rather than sharing one - since I-31,
  // ALWROL and ASSUME are mutually exclusive with each other on the SAME
  // record (per the DDS Reference), so turning both on sequentially on
  // one record would trip that guard and isn't what this test is after;
  // this test is only about the USRDFN-vs-these-four relationship.
  const plainRecordFor = { alwrol: 'PLAINREC', assume: 'PLAINREC2', hlpcmdkey: 'PLAINREC3' };

  console.log('\nnon-USRDFN record: ALWROL/ASSUME/HLPCMDKEY still turn on normally (no regression from the new guard)');
  ['alwrol', 'assume', 'hlpcmdkey'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const recordName = plainRecordFor[suffix];
    selectRecord(recordName);
    const box = doc.getElementById('rk-' + recordName + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present on ' + recordName, !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' triggered no alert on a non-USRDFN record', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(name + ' commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === recordName);
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  console.log('\nnon-USRDFN record: HLPSEQ still commits normally (no regression from the new guard)');
  {
    selectRecord('PLAINREC');
    const pP = 'rk-PLAINREC';
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

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 50);

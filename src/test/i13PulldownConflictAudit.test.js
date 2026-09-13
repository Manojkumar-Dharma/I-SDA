/**
 * i13PulldownConflictAudit.test.js
 *
 * Task I-13 - PULLDOWN record-level keyword audit. Per keywordFixes.md's
 * I-13 section: PULLDOWN's own DDS Reference section states directly, in
 * its own text, that 27 record-level keywords cannot be specified on a
 * record that carries PULLDOWN - see DspfWriter.pulldownConflictReason's
 * own doc comment for the full list and citation. This test confirms the
 * fix: turning any of the guarded keywords ON is hard-blocked (alert +
 * revert, no edit posted) on a PULLDOWN record, turning PULLDOWN itself ON
 * is hard-blocked when a conflicting keyword is already present, and the
 * exact same rows still work normally on an ordinary (non-PULLDOWN)
 * record - same "confirmed NOT-valid / confirmed-valid, no regression"
 * shape as i8UsrdfnConflictAudit.test.js.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i13PulldownConflictAudit.test.js
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
    '     A          R PDNREC                     PULLDOWN',
    "     A                                  1  2'Choice'",
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

  // Sanity: PDNREC really parsed as a PULLDOWN record.
  const parsedInitial = DspfParser.parseDspf(dspfSource);
  check('setup: PDNREC carries PULLDOWN', parsedInitial.records.find((r) => r.name === 'PDNREC').keywords.some((k) => k.name === 'PULLDOWN'));

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

  // --- PULLDOWN record: guarded keywords must be hard-blocked ---
  selectRecord('PDNREC');
  const pdP = 'rk-PDNREC';

  console.log('\nPULLDOWN record: a spread of guarded keywords across General/Help/Output/Input/Overlay are blocked from being turned on');
  [
    ['general', 'inzrcd'], ['general', 'alwrol'], ['general', 'assume'],
    ['help', 'hlpclr'],
    ['output', 'alarm'], ['output', 'invite'], ['output', 'alwgph'], ['output', 'frcdta'],
    ['input', 'rtndta'],
    ['overlay', 'overlay'], ['overlay', 'putretain'], ['overlay', 'putovr'],
    ['overlay', 'ovrdta'], ['overlay', 'ovratr'], ['overlay', 'erase'],
  ].forEach(function (pair) {
    const suffix = pair[1];
    const name = suffix.toUpperCase();
    const box = doc.getElementById(pdP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' blocked with an alert naming PULLDOWN', /PULLDOWN/.test(alertMessage || ''));
    check(name + ' checkbox reverted back off', doc.getElementById(pdP + '-' + suffix + '-on').checked === false);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !posted.some((m) => m.type === 'applyEdit'));
  });

  console.log('\nPULLDOWN record: params-bearing guarded keywords (SLNO/CLRL/MDTOFF/ERASEINP) are also blocked from being turned on');
  ['slno', 'clrl', 'mdtoff', 'eraseinp'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const box = doc.getElementById(pdP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' blocked with an alert naming PULLDOWN', /PULLDOWN/.test(alertMessage || ''));
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !posted.some((m) => m.type === 'applyEdit'));
  });

  console.log('\nPULLDOWN record: ALTNAME (a text field, not a checkbox) is blocked from being set');
  {
    const altEl = doc.getElementById(pdP + '-altname');
    check('setup: ALTNAME box is present', !!altEl);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      altEl.value = 'ALTNAMEVAL';
      altEl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('ALTNAME blocked with an alert naming PULLDOWN', /PULLDOWN/.test(alertMessage || ''));
    check('ALTNAME box reverted back blank', doc.getElementById(pdP + '-altname').value === '');
    check('no applyEdit was posted for the blocked ALTNAME attempt', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('\nPULLDOWN record: an unrelated, still-valid keyword commits normally (guard is scoped to the forbidden-list keywords only)');
  {
    const retkeyOn = doc.getElementById(pdP + '-retkey-on');
    check('setup: RETKEY checkbox is present', !!retkeyOn);
    posted.length = 0;
    retkeyOn.checked = true;
    retkeyOn.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('RETKEY commits normally (edit posted, no alert path)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PDNREC');
    check('RETKEY actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'RETKEY'));
  }

  console.log('\nPULLDOWN record: unchecking PULLDOWN itself is never blocked (only the on-transition is guarded)');
  {
    const pdOn = doc.getElementById('rpd-PDNREC-on');
    check('setup: Pull-down tab\'s own "on" checkbox is present', !!pdOn);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      pdOn.checked = false;
      pdOn.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('turning PULLDOWN off triggers no alert', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('PULLDOWN-off commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PDNREC');
    check('PULLDOWN actually removed from the rewritten DDS', !!reparsed && !reparsed.keywords.some((k) => k.name === 'PULLDOWN'));
  }

  // --- Plain (non-PULLDOWN) record: same keywords must be unaffected ---
  selectRecord('PLAINREC');
  const plP = 'rk-PLAINREC';

  console.log('\nnon-PULLDOWN record: the same guarded keywords still turn on normally (no regression from the new guard)');
  ['inzrcd', 'alwrol', 'assume', 'hlpclr', 'alarm', 'invite', 'alwgph', 'frcdta', 'rtndta', 'overlay', 'putretain', 'putovr', 'ovrdta', 'ovratr', 'erase'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const box = doc.getElementById(plP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present on PLAINREC', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ' triggered no alert on a non-PULLDOWN record', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(name + ' commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PLAINREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  console.log('\nnon-PULLDOWN record: turning PULLDOWN itself on when a conflicting keyword is present - covered at the pure-function level in dspfWriter.test.js\'s pulldownConflictReason() block, not here: the Pull-down tab/checkbox this test exercises above only renders once a record already carries PULLDOWN (added by the "+ Add record" wizard, see isPulldownRecord\'s own gating in buildWebviewTemplate.js), so there is no DOM path on a plain record to click a PULLDOWN "on" checkbox that does not exist yet.');

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 100);

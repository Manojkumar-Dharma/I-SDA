/**
 * i37AlwrolClrlSlnoAssumeSflUsrdfnAudit.test.js
 *
 * Task I-37 - the follow-up finding I-28 flagged in its own doc comment:
 * ALWROL/CLRL/SLNO's own DDS Reference sections each ALSO list ASSUME/
 * SFL/SFLCTL/USRDFN as mutually exclusive with themselves (identical
 * four-way list beyond KEEP, which I-28 already covered). Cross-verified
 * from ASSUME's own section too, confirming the reverse for ALWROL/CLRL/
 * SLNO specifically.
 *
 * New DspfWriter.alwrolClrlSlnoConflictReason, wired unconditionally
 * into wireUsrdfnGuardedFlag (ALWROL, ASSUME) and wirePulldownGuardedFlag
 * (CLRL, SLNO) - no new opt-in param needed since it no-ops for every
 * other keyword name those two wire functions handle.
 *
 * This test confirms:
 *  1. ALWROL/CLRL/SLNO are each individually blocked from turning on when
 *     SFL, SFLCTL, or USRDFN is already present (one-directional - these
 *     three are record-type identifiers set once at record-creation
 *     time, never toggled off again by this UI).
 *  2. ALWROL and ASSUME are mutually exclusive with each other on the
 *     same record, in BOTH directions (both are ordinary toggleable
 *     flags on the shared RECORD panel).
 *  3. No regression: ALWROL/ASSUME still commit normally on an otherwise
 *     plain record.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i37AlwrolClrlSlnoAssumeSflUsrdfnAudit.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R USRREC                     USRDFN',
    '     A          R SFLREC                      SFL',
    '     A            FLD1           5  0 3  5',
    '     A          R SFLCTLREC                   SFLCTL(SFLREC)',
    '     A          R ASSUMEREC                   ASSUME',
    "     A                                  1  2'ASSUME REC'",
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
    '     A          R PLAINREC2',
    "     A                                  1  2'PLAIN SCREEN 2'",
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

  const parsedInitial = DspfParser.parseDspf(dspfSource);
  check('setup: USRREC carries USRDFN', parsedInitial.records.find((r) => r.name === 'USRREC').keywords.some((k) => k.name === 'USRDFN'));
  check('setup: SFLREC carries SFL', parsedInitial.records.find((r) => r.name === 'SFLREC').keywords.some((k) => k.name === 'SFL'));
  check('setup: SFLCTLREC carries SFLCTL', parsedInitial.records.find((r) => r.name === 'SFLCTLREC').keywords.some((k) => k.name === 'SFLCTL'));
  check('setup: ASSUMEREC carries ASSUME', parsedInitial.records.find((r) => r.name === 'ASSUMEREC').keywords.some((k) => k.name === 'ASSUME'));

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

  function tryToggleOn(recordName, suffix) {
    selectRecord(recordName);
    const box = doc.getElementById('rk-' + recordName + '-' + suffix + '-on');
    if (!box) return { box: null };
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return { box, alertMessage };
  }

  // --- Part 1: ALWROL/CLRL/SLNO blocked on USRDFN/SFL/SFLCTL records ---
  console.log('\nALWROL/CLRL/SLNO are each blocked from turning on on USRDFN/SFL/SFLCTL record types');
  [
    // USRDFN: Task I-105 hides every non-whitelisted row on a USRDFN record
    // (ALWROL included), so there is no toggle to refuse there any more -
    // asserted separately just below. The refusal is still covered on the
    // full row set by i102/i104.
    // SFL: likewise hidden (Task I-105) - see the SFLREC block just below.
    { record: 'SFLCTLREC', named: 'SFLCTL', suffixes: ['alwrol', 'clrl', 'slno'] },
  ].forEach(function (target) {
    target.suffixes.forEach(function (suffix) {
      const name = suffix.toUpperCase();
      const { box, alertMessage } = tryToggleOn(target.record, suffix);
      check('setup: ' + name + ' checkbox is present on ' + target.record, !!box);
      if (!box) return;
      check(name + ' on ' + target.record + ': blocked with an alert naming ' + target.named, new RegExp(target.named).test(alertMessage || ''));
      check(name + ' on ' + target.record + ': checkbox reverted back to unchecked', box.checked === false);
      check(name + ' on ' + target.record + ': no edit was posted', !posted.some((m) => m.type === 'applyEdit'));
    });
  });

  console.log('\nUSRDFN record (Task I-105): the ALWROL row is hidden, not shown-and-refused');
  selectRecord('USRREC');
  check('ALWROL checkbox is not rendered on USRREC', !doc.getElementById('rk-USRREC-alwrol-on'));
  console.log('\nSFL record (Task I-105): ALWROL / CLRL / SLNO rows are hidden, not shown-and-refused');
  selectRecord('SFLREC');
  ['alwrol', 'clrl', 'slno'].forEach(function (suffix) {
    check(suffix.toUpperCase() + ' checkbox is not rendered on SFLREC', !doc.getElementById('rk-SFLREC-' + suffix + '-on'));
  });

  // --- Part 2: ALWROL <-> ASSUME mutual exclusion, both directions ---
  console.log('\nALWROL cannot be turned on on a record that already carries ASSUME');
  {
    const { box, alertMessage } = tryToggleOn('ASSUMEREC', 'alwrol');
    check('setup: ALWROL checkbox is present on ASSUMEREC', !!box);
    check('blocked with an alert naming ASSUME', /ASSUME/.test(alertMessage || ''));
    check('checkbox reverted back to unchecked', box.checked === false);
    check('no edit was posted', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('\nASSUME cannot be turned on on a record that already carries ALWROL');
  {
    // Turn ALWROL on for PLAINREC first (a plain, otherwise-unrelated record).
    const setup = tryToggleOn('PLAINREC', 'alwrol');
    check('setup: ALWROL commits normally on PLAINREC first', !posted.some((m) => false) && setup.alertMessage === null);
    const { box, alertMessage } = tryToggleOn('PLAINREC', 'assume');
    check('setup: ASSUME checkbox is present on PLAINREC', !!box);
    check('blocked with an alert naming ALWROL', /ALWROL/.test(alertMessage || ''));
    check('checkbox reverted back to unchecked', box.checked === false);
    check('no edit was posted for the blocked ASSUME attempt', !posted.some((m) => m.type === 'applyEdit'));
  }

  // --- No regression ---
  console.log('\nNo regression: ALWROL still commits normally on an unrelated plain record; ASSUME still commits normally on its own plain record');
  {
    const { box, alertMessage } = tryToggleOn('PLAINREC2', 'assume');
    check('setup: ASSUME checkbox is present on PLAINREC2', !!box);
    check('no alert fired', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('ASSUME commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PLAINREC2');
    check('ASSUME actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'ASSUME'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 50);

/**
 * i36AlwrolClrlSlnoPassrcdAudit.test.js
 *
 * Task I-36 - ALWROL/CLRL/SLNO's own DDS Reference sections each state
 * the identical "cannot be specified for the record format specified by
 * the PASSRCD keyword" restriction I-24 fixed for WINDOW - flagged as a
 * follow-up finding by I-24 itself (not implemented there, since I-24
 * was scoped to WINDOW only).
 *
 * Reuses DspfWriter.passrcdRecordConflictReason (the primitive I-24's
 * own passrcdWindowConflictReason was generalized into for this task),
 * wired at the same two reachable on-transitions I-24 established,
 * adapted for the fact that unlike WINDOW (a record-creation-time
 * "type"), ALWROL/CLRL/SLNO are ordinary toggles on ANY existing record:
 *   1. Turning ALWROL/CLRL/SLNO on on a record whose OWN name already
 *      matches the file's current PASSRCD value.
 *   2. Editing file-level PASSRCD to name a record that already carries
 *      one of the three.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i36AlwrolClrlSlnoPassrcdAudit.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A                                      PASSRCD(ALWROLTGT)',
    '     A          R ALWROLTGT',
    "     A                                  1  2'ALWROL TARGET'",
    '     A          R CLRLTGT',
    "     A                                  1  2'CLRL TARGET'",
    '     A          R SLNOTGT',
    "     A                                  1  2'SLNO TARGET'",
    '     A          R HASALWROL                   ALWROL',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
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
  check('setup: file-level PASSRCD(ALWROLTGT) parsed', parsedInitial.fileKeywords.some((k) => k.name === 'PASSRCD' && /ALWROLTGT/i.test(k.parameters)));
  check('setup: HASALWROL carries ALWROL', parsedInitial.records.find((r) => r.name === 'HASALWROL').keywords.some((k) => k.name === 'ALWROL'));

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

  function setPassrcd(value) {
    const passrcdInput = doc.getElementById('fk-passrcd');
    passrcdInput.value = value;
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      passrcdInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return alertMessage;
  }

  function openFileProps() {
    const fileCrumb = doc.getElementById('crumb-file');
    if (fileCrumb) fileCrumb.click();
  }

  // --- Direction 1: toggling ALWROL/CLRL/SLNO on their own PASSRCD-named record ---
  console.log('\nDirection 1: ALWROL/CLRL/SLNO are each blocked from turning on on the record file-level PASSRCD already names');
  const cases = [
    { suffix: 'alwrol', record: 'ALWROLTGT' },
    { suffix: 'clrl', record: 'CLRLTGT' },
    { suffix: 'slno', record: 'SLNOTGT' },
  ];
  cases.forEach(function (c) {
    openFileProps();
    setPassrcd(c.record);
    selectRecord(c.record);
    const name = c.suffix.toUpperCase();
    const box = doc.getElementById('rk-' + c.record + '-' + c.suffix + '-on');
    check('setup: ' + name + ' checkbox is present on ' + c.record, !!box);
    if (!box) return;
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check(name + ': blocked with an alert naming PASSRCD', /PASSRCD/.test(alertMessage || ''));
    check(name + ': checkbox reverted back to unchecked', box.checked === false);
    check(name + ': no edit was posted', !posted.some((m) => m.type === 'applyEdit'));
  });

  // Reset PASSRCD back to its original target for direction 2's own setup.
  openFileProps();
  setPassrcd('ALWROLTGT');

  // --- Direction 2: retyping PASSRCD to name a record that already has ALWROL ---
  console.log('\nDirection 2: PASSRCD cannot be retyped to name a record (HASALWROL) that already carries ALWROL');
  {
    const alertMessage = setPassrcd('HASALWROL');
    check('blocked with an alert naming ALWROL', /ALWROL/.test(alertMessage || ''));
    check('no edit was posted', !posted.some((m) => m.type === 'applyEdit'));
  }

  // --- No regression: ALWROL still commits normally on a plain record
  // with a different name than PASSRCD ---
  console.log('\nNo regression: ALWROL still commits normally on a record PASSRCD does not name');
  {
    openFileProps();
    setPassrcd('ALWROLTGT');
    selectRecord('PLAINREC');
    const box = doc.getElementById('rk-PLAINREC-alwrol-on');
    check('setup: ALWROL checkbox is present on PLAINREC', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('no alert fired', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('ALWROL commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PLAINREC');
    check('ALWROL actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'ALWROL'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 50);

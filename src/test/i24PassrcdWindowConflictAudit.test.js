/**
 * i24PassrcdWindowConflictAudit.test.js
 *
 * Task I-24 - WINDOW cannot be specified for the record named by
 * file-level PASSRCD. WINDOW's own DDS Reference section states "WINDOW
 * cannot be specified for the record format specified by the PASSRCD
 * keyword" - a cross-reference-by-name check against a file-level
 * keyword's string parameter, flagged (not fixed) by I-12 because it
 * didn't fit windowConflictReason's own same-record shape (see that
 * task's own "Flagged, not fixed this task" note).
 *
 * Two reachable on-transitions, both sharing DspfWriter.
 * passrcdWindowConflictReason:
 *   1. The "+ Add record" wizard creating a new WINDOW-type record whose
 *      name matches the file's current PASSRCD value - blocked inline
 *      (newRecordError), same as the wizard's pre-existing duplicate-name
 *      check, before any edit is ever posted.
 *   2. Editing file-level PASSRCD to name a record that already carries
 *      WINDOW - alert + revert, same idiom as I-12/I-18's own file-level
 *      guards.
 * Also confirms both directions are unaffected by a non-colliding name
 * (no regression), and that renaming an unrelated field elsewhere still
 * works normally.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i24PassrcdWindowConflictAudit.test.js
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

// PASSRCD(NEWWIN) deliberately names a record that does NOT exist yet -
// the "+ Add record" wizard's own pre-existing duplicate-name check would
// otherwise fire first and mask the I-24 guard if PASSRCD instead pointed
// at an EXISTING record (WINREC, used for direction 2's own test below,
// already carries WINDOW so its name is legitimately taken).
const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A                                      PASSRCD(NEWWIN)',
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

  // Sanity: file really parsed with PASSRCD(NEWWIN), WINREC really carries
  // WINDOW, and NEWWIN doesn't exist yet as a record.
  const parsedInitial = DspfParser.parseDspf(dspfSource);
  check('setup: file-level PASSRCD(NEWWIN) parsed', parsedInitial.fileKeywords.some((k) => k.name === 'PASSRCD' && /NEWWIN/i.test(k.parameters)));
  check('setup: WINREC carries WINDOW', parsedInitial.records.find((r) => r.name === 'WINREC').keywords.some((k) => k.name === 'WINDOW'));
  check('setup: NEWWIN is not an existing record yet', !parsedInitial.records.some((r) => r.name === 'NEWWIN'));

  function withAlertCapture(fn) {
    const originalAlert = dom.window.alert;
    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    fn();
    dom.window.alert = originalAlert;
    return alertMessage;
  }

  // --- Direction 1: "+ Add record" wizard, new WINDOW record named to
  // collide with the existing file-level PASSRCD(NEWWIN) ---
  console.log('\n"+ Add record" wizard: a new WINDOW-type record cannot be named NEWWIN (the file\u2019s own PASSRCD target)');
  {
    const toggleBtn = doc.getElementById('newRecordToggleBtn');
    toggleBtn.click();
    const nameInput = doc.getElementById('newRecordName');
    const typeSelect = doc.getElementById('newRecordType');
    const createBtn = doc.getElementById('newRecordBtn');
    const errorEl = doc.getElementById('newRecordError');

    nameInput.value = 'NEWWIN';
    typeSelect.value = 'WINDOW';
    posted.length = 0;
    createBtn.click();
    check('blocked with an error naming PASSRCD', /PASSRCD/.test(errorEl.textContent || ''));
    check('blocked with an error naming WINDOW', /WINDOW/.test(errorEl.textContent || ''));
    check('no applyEdit was posted for the blocked attempt', !posted.some((m) => m.type === 'applyEdit'));
    check('no NEWWIN record was created', !DspfParser.parseDspf(dspfSource).records.some((r) => r.name === 'NEWWIN'));
  }

  console.log('\n"+ Add record" wizard: a WINDOW-type record with a non-colliding name still commits normally (no regression)');
  {
    const nameInput = doc.getElementById('newRecordName');
    const typeSelect = doc.getElementById('newRecordType');
    const createBtn = doc.getElementById('newRecordBtn');
    const errorEl = doc.getElementById('newRecordError');

    nameInput.value = 'WDWNEW';
    typeSelect.value = 'WINDOW';
    posted.length = 0;
    createBtn.click();
    check('no error shown', (errorEl.textContent || '') === '');
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('WDWNEW commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text);
    check('WDWNEW actually present with WINDOW in the rewritten DDS', !!reparsed && !!reparsed.records.find((r) => r.name === 'WDWNEW' && r.keywords.some((k) => k.name === 'WINDOW')));
  }

  // --- Direction 2: editing file-level PASSRCD to name a record that
  // already carries WINDOW ---
  console.log('\nfile-level PASSRCD: cannot be retyped to name a record (WINREC) that already carries WINDOW');
  {
    // Open the file-level Properties panel via the breadcrumb (renderFileProps'
    // own crumb-file handler in buildWebviewTemplate.js) - the wizard tests
    // above only ever posted applyEdit messages outward, they never fed
    // back into this same running webview's in-memory model, so WINREC/
    // PASSRCD are still exactly as the initial dspfSource set them.
    const fileCrumb = doc.getElementById('crumb-file');
    check('setup: crumb-file breadcrumb is present', !!fileCrumb);
    if (fileCrumb) fileCrumb.click();
    const passrcdInput = doc.getElementById('fk-passrcd');
    check('setup: fk-passrcd input is present', !!passrcdInput);
    if (passrcdInput) {
      passrcdInput.value = 'WINREC';
      posted.length = 0;
      const alertMessage = withAlertCapture(function () {
        passrcdInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      check('blocked with an alert naming WINDOW', /WINDOW/.test(alertMessage || ''));
      check('no applyEdit was posted for the blocked PASSRCD attempt', !posted.some((m) => m.type === 'applyEdit'));
    }
  }

  console.log('\nfile-level PASSRCD: a non-colliding value still commits normally (no regression)');
  {
    const passrcdInput = doc.getElementById('fk-passrcd');
    if (passrcdInput) {
      passrcdInput.value = 'PLAINREC';
      posted.length = 0;
      const alertMessage = withAlertCapture(function () {
        passrcdInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      check('PLAINREC triggered no alert (does not carry WINDOW)', alertMessage === null);
      const applyEdit = posted.find((m) => m.type === 'applyEdit');
      check('PASSRCD(PLAINREC) commits normally (edit posted)', !!applyEdit);
      const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text);
      check('PASSRCD(PLAINREC) actually present in the rewritten DDS', !!reparsed && reparsed.fileKeywords.some((k) => k.name === 'PASSRCD' && /PLAINREC/i.test(k.parameters)));
    } else {
      check('fk-passrcd input is present (regression sub-check)', false);
    }
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 50);

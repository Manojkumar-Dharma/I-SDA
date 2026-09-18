/**
 * i47WindowMutexRawEditor.test.js
 *
 * Task I-47 - re-read WINDOW's own DDS Reference section fresh (split off
 * from I-44's original USRDFN finding). Findings: WINDOW's own text names
 * SIX keywords a record format can't also carry - ALWROL, ASSUME, MNUBAR,
 * PULLDOWN, SFL, USRDFN - a closed exclusion list, not a broader whitelist
 * shape like USRDFN/SFL's own sections. ALWROL/ASSUME were already
 * individually known (I-12's windowConflictReason, wired through the
 * checkbox path); MNUBAR/PULLDOWN were not cross-checked against WINDOW
 * anywhere; USRDFN/SFL were already indirectly covered one direction only
 * (WINDOW isn't on either one's own whitelist - I-49/I-46). WINDOW's own
 * text also explicitly EXEMPTS SFLCTL ("WINDOW is allowed on a record with
 * the SFLCTL keyword"). WINDOW's own PASSRCD restriction was already fixed
 * by I-24; the ERRSFL/MSGLOC-ignored and WDWBORDER-shape notes in the same
 * section are informational precedence/formatting guidance, not "cannot
 * specify together" rules, so nothing to enforce there.
 *
 * Reachability: WINDOW/MNUBAR/PULLDOWN/SFL/USRDFN are each their own
 * record TYPE the "+ Add record" wizard picks exactly once (RECORD_TYPES),
 * so the wizard itself can never combine two - only the raw/Advanced
 * keyword editor can, the same bypass I-49/I-46 each closed for USRDFN's
 * and SFL's own whitelists.
 *
 * Fix: new DspfWriter.windowMutexConflictReason(keywordName, recordKeywords)
 * - bidirectional (blocks raw-adding any of the six to a WINDOW record, AND
 * blocks raw-adding WINDOW to a record that already has any of the six) -
 * wired into the SAME record-level raw-editor addGuardFn chain I-49/I-46
 * already built, alongside usrdfnWhitelistConflictReason/
 * sflWhitelistConflictReason. windowConflictReason's own two existing
 * checkbox call sites (ASSUME/ALWROL) are untouched.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i47WindowMutexRawEditor.test.js
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

function reparsedRecord(text, recordName) {
  return DspfParser.parseDspf(text).records.find((r) => r.name === recordName);
}

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)',
    '     A          R WINREC                     WINDOW(4 20 9 30)',
    '     A          R ALWROLREC                  ALWROL',
    '     A          R ASSUMEREC                  ASSUME',
    '     A          R MNUBARREC                  MNUBAR',
    '     A          R PULDWNREC                  PULLDOWN',
    '     A          R SFLREC                     SFL',
    '     A          R USRREC                     USRDFN',
    '     A          R SFLCTLREC                  SFLCTL(SFLREC)',
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

  function selectRecord(name) {
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = name;
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
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

  // === Group A: raw-adding a mutex keyword to the WINDOW record is blocked ===
  console.log('\nWINDOW record: raw editor blocks each of the six mutex keywords');
  ['ALWROL', 'ASSUME', 'MNUBAR', 'PULLDOWN', 'SFL', 'USRDFN'].forEach(function (name) {
    selectRecord('WINREC');
    const result = addRawKeyword('record-WINREC', name);
    check(name + ' blocked with an alert naming WINDOW', !!result.alertMessage && result.alertMessage.indexOf('WINDOW') !== -1);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !result.applyEdit);
  });

  // === Group B: raw-adding WINDOW to a record that already has a mutex keyword is blocked ===
  console.log('\nraw-adding WINDOW itself is blocked on each mutex-keyword record');
  [
    ['ALWROLREC', 'ALWROL'],
    ['ASSUMEREC', 'ASSUME'],
    ['MNUBARREC', 'MNUBAR'],
    ['PULDWNREC', 'PULLDOWN'],
    ['SFLREC', 'SFL'],
    ['USRREC', 'USRDFN'],
  ].forEach(function (pair) {
    const recordName = pair[0];
    const existingKeyword = pair[1];
    selectRecord(recordName);
    const result = addRawKeyword('record-' + recordName, 'WINDOW', '4 20 9 30');
    check('WINDOW blocked on ' + recordName + ' with an alert naming ' + existingKeyword, !!result.alertMessage && result.alertMessage.indexOf(existingKeyword) !== -1);
    check('no applyEdit was posted for the blocked WINDOW attempt on ' + recordName, !result.applyEdit);
  });

  // === Group C: WINDOW is allowed on an SFLCTL record (explicit exception) ===
  console.log('\nSFLCTL record: raw-adding WINDOW is explicitly allowed (no mutex conflict)');
  {
    selectRecord('SFLCTLREC');
    const result = addRawKeyword('record-SFLCTLREC', 'WINDOW', '4 20 9 30');
    check('no alert fired for WINDOW on an SFLCTL record', !result.alertMessage);
    check('WINDOW commits normally on an SFLCTL record', !!result.applyEdit);
    const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'SFLCTLREC');
    check('WINDOW actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'WINDOW'));
  }

  // === Group D: no regression - a plain record's raw editor is unaffected ===
  console.log('\nplain record: raw editor is completely unaffected by the WINDOW mutex guard');
  {
    selectRecord('PLAINREC');
    const result = addRawKeyword('record-PLAINREC', 'BLINK');
    check('BLINK commits normally on a plain record', !!result.applyEdit);
    check('no alert fired for BLINK on a plain record', !result.alertMessage);
  }

  // === Group E: checkbox path for ASSUME/ALWROL vs WINDOW is unaffected (still works) ===
  console.log('\nchecked path: windowConflictReason\'s own existing ASSUME/ALWROL checkbox guard still works');
  {
    selectRecord('WINREC');
    const assumeBox = doc.getElementById('rk-WINREC-assume-on');
    check('setup: ASSUME checkbox is present on the WINDOW record', !!assumeBox);
    if (assumeBox) {
      posted.length = 0;
      let alertMessage = null;
      const originalAlert = dom.window.alert;
      dom.window.alert = (msg) => { alertMessage = msg; };
      assumeBox.checked = true;
      assumeBox.dispatchEvent(new Event('change', { bubbles: true }));
      dom.window.alert = originalAlert;
      check('ASSUME checkbox still blocked with an alert naming WINDOW', !!alertMessage && alertMessage.indexOf('WINDOW') !== -1);
      check('ASSUME checkbox reverted back off', assumeBox.checked === false);
    }
  }

  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

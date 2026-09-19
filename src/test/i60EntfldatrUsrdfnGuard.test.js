/**
 * i60EntfldatrUsrdfnGuard.test.js
 *
 * Task I-60 - follow-up from I-42. The record-level ENTFLDATR Apply
 * guard (wireEntFldAtrEditor's own trailing addGuardFn param, wired at
 * the record-level call site by I-53/I-54) only ORed
 * sflWhitelistConflictReason and mnubarWhitelistConflictReason - it never
 * checked USRDFN's own whitelist, so ENTFLDATR could still be applied to
 * a USRDFN record through the General tab.
 *
 * USRDFN's own DDS Reference text is a strict WHITELIST: "No file- or
 * record-level keywords apply to this record except INVITE, KEEP,
 * PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT." ENTFLDATR is
 * not on it. Fix: DspfWriter.usrdfnWhitelistConflictReason (I-49) is now
 * also ORed into that same call site, the same way I-42 already did for
 * MOUBTN.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i60EntfldatrUsrdfnGuard.test.js
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
    '     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)',
    '     A          R USRREC                    USRDFN',
    '     A          R USRLEGACY                 USRDFN',
    '     A                                      ENTFLDATR((*COLOR RED))',
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

  function reparsedRecord(text, recordName) {
    return DspfParser.parseDspf(text).records.find((r) => r.name === recordName);
  }

  function toggleFlag(prefix, suffix, checked) {
    const box = doc.getElementById(prefix + '-' + suffix + '-on');
    if (!box) return { missing: true };
    posted.length = 0;
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    box.checked = checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    dom.window.alert = originalAlert;
    return { alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit'), box };
  }

  function clickEntFldAtrApply(prefix, checked) {
    const onEl = doc.getElementById(prefix + '-entfldatr-on');
    const applyBtn = doc.querySelector('.' + prefix + '-entfldatr-apply');
    if (!onEl || !applyBtn) return { missing: true };
    onEl.checked = checked;
    // A real colour is chosen (not a bare ENTFLDATR) so the commit path is
    // independent of I-59's separate bare-ENTFLDATR limitation.
    const colorEl = doc.getElementById(prefix + '-entfldatr-color');
    if (colorEl && checked) colorEl.value = 'RED';
    posted.length = 0;
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    applyBtn.dispatchEvent(new Event('click', { bubbles: true }));
    dom.window.alert = originalAlert;
    return { alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }

  // === Group A: ENTFLDATR (not on USRDFN's whitelist) is blocked ===
  selectRecord('USRREC');
  const uP = 'rk-USRREC';
  console.log('\nUSRDFN record: ENTFLDATR Apply (not on the whitelist) is blocked');
  {
    const result = clickEntFldAtrApply(uP, true);
    check('setup: ENTFLDATR checkbox and Apply button are present on a USRDFN record', !result.missing);
    if (!result.missing) {
      check('ENTFLDATR blocked with an alert naming user-defined (USRDFN)', !!result.alertMessage && result.alertMessage.indexOf('user-defined (USRDFN)') !== -1);
      check('alert names ENTFLDATR itself', !!result.alertMessage && result.alertMessage.indexOf('ENTFLDATR') !== -1);
      check('no applyEdit was posted for the blocked ENTFLDATR attempt', !result.applyEdit);
    }
  }

  // === Group B: a hand-edited USRDFN record that ALREADY carries ENTFLDATR
  // can still have it removed (turning off is never blocked) ===
  selectRecord('USRLEGACY');
  const lP = 'rk-USRLEGACY';
  console.log('\nUSRDFN record with pre-existing (hand-edited) ENTFLDATR: turning it OFF is not blocked');
  {
    const result = clickEntFldAtrApply(lP, false);
    check('setup: ENTFLDATR checkbox and Apply button are present', !result.missing);
    if (!result.missing) {
      check('no alert fired when turning ENTFLDATR off', !result.alertMessage);
      check('applyEdit posted when turning ENTFLDATR off', !!result.applyEdit);
      const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'USRLEGACY');
      check('ENTFLDATR actually removed from the rewritten DDS', !!reparsed && !reparsed.keywords.some((k) => k.name === 'ENTFLDATR'));
      check('USRDFN itself still present after the removal', !!reparsed && reparsed.keywords.some((k) => k.name === 'USRDFN'));
    }
  }

  // === Group C: no regression - whitelisted PRINT (bespoke commit) still
  // works on a USRDFN record ===
  selectRecord('USRREC');
  console.log('\nUSRDFN record: PRINT (whitelisted, bespoke commit) still commits normally');
  {
    const result = toggleFlag(uP, 'print', true);
    if (result.missing) {
      console.log('  (PRINT checkbox not rendered on a USRDFN record - skipped)');
    } else {
      check('PRINT (whitelisted) commits normally on a USRDFN record', !!result.applyEdit);
      check('no alert fired for PRINT on a USRDFN record', !result.alertMessage);
    }
  }

  // === Group D: no regression - a plain, non-USRDFN record is unaffected ===
  selectRecord('PLAINREC');
  const pP = 'rk-PLAINREC';
  console.log('\nnon-USRDFN record: ENTFLDATR still commits normally');
  {
    const result = clickEntFldAtrApply(pP, true);
    check('setup: ENTFLDATR checkbox and Apply button are present', !result.missing);
    if (!result.missing) {
      check('ENTFLDATR commits normally on a non-USRDFN record', !!result.applyEdit);
      check('no alert fired for ENTFLDATR on a non-USRDFN record', !result.alertMessage);
      const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'PLAINREC');
      check('ENTFLDATR actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'ENTFLDATR'));
    }
  }

  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

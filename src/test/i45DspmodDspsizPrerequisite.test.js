/**
 * i45DspmodDspsizPrerequisite.test.js
 *
 * Task I-45 (split off from I-44's original finding): DSPMOD's own DDS
 * Reference text has a SEPARATE prerequisite, unrelated to USRDFN - "This
 * keyword is valid only when both the 24 x 80 and 27 x 132 display sizes
 * are specified on the DSPSIZ keyword" - which no existing guard checked
 * (DSPMOD's row went through plain `simple()` before I-44, then
 * `wireUsrdfnGuardedFlag` after it; neither ever looked at DSPSIZ).
 *
 * Fix: new `DspfWriter.dspmodDspsizPrerequisiteReason(fileKeywords)`,
 * wired into `wireUsrdfnGuardedFlag` via a new `alsoCheckDspsiz` trailing
 * param (same "layer one more check on top" shape as `alsoCheckWindow`/
 * `alsoCheckKeep`/`alsoCheckPassrcd`), passed only at DSPMOD's own call
 * site - every other `wireUsrdfnGuardedFlag` caller (ASSUME, ALWROL,
 * HLPCMDKEY, BLINK, MSGALARM, LOCK, LOGOUT) omits it and is unaffected.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i45DspmodDspsizPrerequisite.test.js
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

function runScenario(label, dspfSource, done) {
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

    console.log('\n' + label);
    done({ doc, Event, dom, get posted() { return posted; }, resetPosted: () => { posted.length = 0; }, selectRecord });
  }, 500);
}

// === Scenario A: DSPSIZ declares only ONE size - DSPMOD is blocked ===
runScenario(
  'Single-size DSPSIZ (*DS3 only): DSPMOD is blocked on every record',
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
  ].join('\n') + '\n',
  ({ doc, Event, dom, posted, resetPosted, selectRecord }) => {
    selectRecord('PLAINREC');
    const p = 'rk-PLAINREC';
    const box = doc.getElementById(p + '-dspmod-on');
    check('setup: DSPMOD checkbox is present', !!box);
    const paramsEl = doc.getElementById(p + '-dspmod-params');
    if (paramsEl) paramsEl.value = '*DSP4';
    resetPosted();
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    dom.window.alert = originalAlert;
    check('DSPMOD blocked with an alert naming DSPSIZ', !!alertMessage && alertMessage.indexOf('DSPSIZ') !== -1);
    check('DSPMOD checkbox reverted back off', box.checked === false);
    check('no applyEdit was posted for the blocked DSPMOD attempt', !posted.some((m) => m.type === 'applyEdit'));

    finishOne();
  }
);

// === Scenario B: DSPSIZ declares only the OTHER single size - still blocked ===
runScenario(
  'Single-size DSPSIZ (*DS4 only): DSPMOD is still blocked',
  [
    '     A                                      DSPSIZ(27 132 *DS4)',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
  ].join('\n') + '\n',
  ({ doc, Event, dom, posted, resetPosted, selectRecord }) => {
    selectRecord('PLAINREC');
    const p = 'rk-PLAINREC';
    const box = doc.getElementById(p + '-dspmod-on');
    resetPosted();
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    dom.window.alert = originalAlert;
    check('DSPMOD blocked with an alert naming DSPSIZ (DS4-only)', !!alertMessage && alertMessage.indexOf('DSPSIZ') !== -1);
    check('no applyEdit was posted (DS4-only)', !posted.some((m) => m.type === 'applyEdit'));

    finishOne();
  }
);

// === Scenario C: no DSPSIZ at all - still blocked ===
runScenario(
  'No DSPSIZ at all: DSPMOD is still blocked',
  [
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
  ].join('\n') + '\n',
  ({ doc, Event, dom, posted, resetPosted, selectRecord }) => {
    selectRecord('PLAINREC');
    const p = 'rk-PLAINREC';
    const box = doc.getElementById(p + '-dspmod-on');
    resetPosted();
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    dom.window.alert = originalAlert;
    check('DSPMOD blocked with an alert naming DSPSIZ (no DSPSIZ at all)', !!alertMessage && alertMessage.indexOf('DSPSIZ') !== -1);
    check('no applyEdit was posted (no DSPSIZ at all)', !posted.some((m) => m.type === 'applyEdit'));

    finishOne();
  }
);

// === Scenario D: DSPSIZ declares BOTH sizes - DSPMOD commits normally ===
runScenario(
  'DSPSIZ declares both 24x80 and 27x132: DSPMOD commits normally',
  [
    '     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
  ].join('\n') + '\n',
  ({ doc, Event, dom, posted, resetPosted, selectRecord }) => {
    selectRecord('PLAINREC');
    const p = 'rk-PLAINREC';
    const box = doc.getElementById(p + '-dspmod-on');
    const paramsEl = doc.getElementById(p + '-dspmod-params');
    if (paramsEl) paramsEl.value = '*DSP4';
    resetPosted();
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    dom.window.alert = originalAlert;
    check('no alert fired when both display sizes are present', !alertMessage);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('DSPMOD commits normally when both display sizes are present', !!applyEdit);
    const reparsed = applyEdit && reparsedRecord(applyEdit.text, 'PLAINREC');
    check('DSPMOD actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'DSPMOD'));

    finishOne();
  }
);

// === Scenario E: DSPSIZ declares both sizes in the OPPOSITE order - order doesn't matter ===
runScenario(
  'DSPSIZ declares both sizes, *DS4 listed first: DSPMOD still commits normally',
  [
    '     A                                      DSPSIZ(27 132 *DS4 24 80 *DS3)',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
  ].join('\n') + '\n',
  ({ doc, Event, dom, posted, resetPosted, selectRecord }) => {
    selectRecord('PLAINREC');
    const p = 'rk-PLAINREC';
    const box = doc.getElementById(p + '-dspmod-on');
    resetPosted();
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('DSPMOD commits normally regardless of DSPSIZ order', !!applyEdit);

    finishOne();
  }
);

let scenariosRemaining = 5;
function finishOne() {
  scenariosRemaining--;
  if (scenariosRemaining === 0) {
    if (failures === 0) {
      console.log('\nALL CHECKS PASSED');
    } else {
      console.log('\n' + failures + ' CHECK(S) FAILED');
      process.exitCode = 1;
    }
  }
}

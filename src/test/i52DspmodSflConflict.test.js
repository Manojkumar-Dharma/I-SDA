/**
 * i52DspmodSflConflict.test.js
 *
 * Task I-52 (gap found while implementing I-45): DSPMOD's own DDS
 * Reference text has a SECOND, independent prerequisite beyond the
 * DSPSIZ one I-45 fixed - "The DSPMOD keyword cannot be specified on a
 * subfile record (SFL keyword). The subfile is [dis]played according to
 * the DSPMOD of the corresponding subfile control record." That second
 * sentence scopes the restriction to the plain SFL (detail) record only
 * - SFLCTL is deliberately exempt, since its own DSPMOD is what actually
 * governs the subfile.
 *
 * Fix: new `DspfWriter.dspmodSflConflictReason(keywordName,
 * recordKeywords)`, wired unconditionally into `wireUsrdfnGuardedFlag`'s
 * existing check chain (no new trailing param needed, since the function
 * itself is scoped to keywordName === 'DSPMOD' - same "safe no-op for
 * every other caller" shape as `alwrolClrlSlnoConflictReason`).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i52DspmodSflConflict.test.js
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

// Every scenario declares both display sizes on DSPSIZ so I-45's own
// prerequisite never fires here - this test isolates the SFL check alone.
const DSPSIZ_BOTH = '     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)';

// === Scenario A: plain SFL (detail) record - DSPMOD is blocked ===
runScenario(
  'Plain SFL record: DSPMOD row is hidden (Task I-105)',
  [
    DSPSIZ_BOTH,
    '     A          R SFLREC                    SFL',
    "     A            FLD1           10A  O  1  2",
  ].join('\n') + '\n',
  ({ doc, Event, dom, posted, resetPosted, selectRecord }) => {
    selectRecord('SFLREC');
    const p = 'rk-SFLREC';
    // Task I-105: DSPMOD is not on a plain SFL record's closed whitelist, so its
    // row is no longer rendered there at all (it used to be shown and refused).
    // The refusal itself (dspmodSflConflictReason / sflWhitelistConflictReason)
    // is unchanged and still exercised on the full row set by i104's sweep.
    check('DSPMOD row is not rendered on a plain SFL record', !doc.getElementById(p + '-dspmod-on') && !doc.getElementById(p + '-dspmod-params'));

    finishOne();
  }
);

// === Scenario B: SFLCTL record - DSPMOD is NOT blocked (SFLCTL's own
// DSPMOD is what actually governs the subfile, per the DDS Reference) ===
runScenario(
  'SFLCTL record: DSPMOD is NOT blocked - commits normally',
  [
    DSPSIZ_BOTH,
    '     A          R CTLREC                    SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(0010)',
    '     A                                      SFLPAG(0005)',
  ].join('\n') + '\n',
  ({ doc, Event, dom, posted, resetPosted, selectRecord }) => {
    selectRecord('CTLREC');
    const p = 'rk-CTLREC';
    const box = doc.getElementById(p + '-dspmod-on');
    check('setup: DSPMOD checkbox is present on the SFLCTL record', !!box);
    const paramsEl = doc.getElementById(p + '-dspmod-params');
    if (paramsEl) paramsEl.value = '*DSP4';
    resetPosted();
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    dom.window.alert = originalAlert;
    check('no alert fired for DSPMOD on an SFLCTL record', !alertMessage);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('DSPMOD commits normally on an SFLCTL record', !!applyEdit);
    const reparsed = applyEdit && reparsedRecord(applyEdit.text, 'CTLREC');
    check('DSPMOD actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'DSPMOD'));

    finishOne();
  }
);

// === Scenario C: plain (non-SFL) record - DSPMOD is unaffected ===
runScenario(
  'Plain non-SFL record: DSPMOD is unaffected - commits normally',
  [
    DSPSIZ_BOTH,
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
    check('DSPMOD commits normally on a plain non-SFL record', !!applyEdit);

    finishOne();
  }
);

let scenariosRemaining = 3;
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

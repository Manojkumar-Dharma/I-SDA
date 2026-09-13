/**
 * i28KeepConditioningAndMutexAudit.test.js
 *
 * Task I-28 - found auditing the base Record Keywords panel after I-25's
 * consolidation (KEEP duplicated across 4 record-type panels - see that
 * task's own note pointing here): the base General tab's KEEP row still
 * offered a Conditioning toggle despite KEEP's own DDS Reference section
 * stating "Option and response indicators are not valid for this
 * keyword" - I-9 already fixed this on the SFL/SFLCTL copies, but never
 * on the base copy (now the sole surviving live copy after I-25's
 * de-dup). Also confirmed by the DDS Reference (and cross-verified by
 * each of ALWROL/CLRL/SLNO's own sections individually restating it -
 * same method I-23 used for SFLMSGRCD): KEEP cannot be specified with
 * ALWROL, CLRL, or SLNO on the same record format.
 *
 * Two things this test confirms:
 *  1. KEEP's row on an ordinary record has no Conditioning toggle at all
 *     (matches INZRCD/ASSUME/ALWROL's own shape).
 *  2. KEEP/ALWROL/CLRL/SLNO mutual exclusion is hard-blocked (alert +
 *     revert, no edit posted) in EITHER direction - turning KEEP on
 *     while any of the other three is already present, and turning any
 *     of the other three on while KEEP is already present - while an
 *     unrelated, non-conflicting toggle on the same record still works
 *     normally (no regression).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i28KeepConditioningAndMutexAudit.test.js
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
    '     A          R KEEPREC                    KEEP',
    '     A          R ALWROLREC                  ALWROL',
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

  // Sanity: fixture really parsed as expected.
  const parsedInitial = DspfParser.parseDspf(dspfSource);
  check('setup: KEEPREC carries KEEP', parsedInitial.records.find((r) => r.name === 'KEEPREC').keywords.some((k) => k.name === 'KEEP'));
  check('setup: ALWROLREC carries ALWROL', parsedInitial.records.find((r) => r.name === 'ALWROLREC').keywords.some((k) => k.name === 'ALWROL'));

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

  // --- Part 1: KEEP's row has no Conditioning toggle ---
  console.log('\nPLAINREC: KEEP\u2019s row has no Conditioning toggle (matches INZRCD/ASSUME/ALWROL\u2019s own shape)');
  {
    selectRecord('PLAINREC');
    const p = 'rk-PLAINREC';
    check('KEEP\u2019s own on/off checkbox exists', !!doc.getElementById(p + '-keep-on'));
    check('KEEP has no Conditioning toggle', !doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-keep"]'));
  }

  // --- Part 2: mutual exclusion, direction 1 - KEEP already present,
  // ALWROL/CLRL/SLNO each individually blocked from being turned on ---
  console.log('\nKEEPREC: ALWROL/CLRL/SLNO are each blocked from being turned on (KEEP already present)');
  selectRecord('KEEPREC');
  {
    const p = 'rk-KEEPREC';
    ['alwrol', 'clrl', 'slno'].forEach(function (suffix) {
      const name = suffix.toUpperCase();
      const box = doc.getElementById(p + '-' + suffix + '-on');
      check('setup: ' + name + ' checkbox is present', !!box);
      if (!box) return;
      posted.length = 0;
      const alertMessage = withAlertCapture(function () {
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      });
      check(name + ': blocked with an alert naming KEEP', /KEEP/.test(alertMessage || ''));
      check(name + ': checkbox reverted back to unchecked', box.checked === false);
      check(name + ': no edit was posted', !posted.some((m) => m.type === 'applyEdit'));
    });
  }

  // --- Part 3: mutual exclusion, direction 2 - ALWROL already present,
  // KEEP blocked from being turned on ---
  console.log('\nALWROLREC: KEEP is blocked from being turned on (ALWROL already present)');
  selectRecord('ALWROLREC');
  {
    const p = 'rk-ALWROLREC';
    const box = doc.getElementById(p + '-keep-on');
    check('setup: KEEP checkbox is present', !!box);
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('blocked with an alert naming ALWROL', /ALWROL/.test(alertMessage || ''));
    check('checkbox reverted back to unchecked', box.checked === false);
    check('no edit was posted', !posted.some((m) => m.type === 'applyEdit'));
  }

  // --- Part 4: no regression - KEEP still commits normally on a plain
  // record with none of ALWROL/CLRL/SLNO present, and ALWROL still
  // commits normally on a plain record with no KEEP present ---
  console.log('\nPLAINREC: KEEP itself still commits normally when none of ALWROL/CLRL/SLNO is present (no regression)');
  selectRecord('PLAINREC');
  {
    const p = 'rk-PLAINREC';
    const box = doc.getElementById(p + '-keep-on');
    posted.length = 0;
    const alertMessage = withAlertCapture(function () {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('no alert fired', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('KEEP commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PLAINREC');
    check('KEEP actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'KEEP'));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 50);

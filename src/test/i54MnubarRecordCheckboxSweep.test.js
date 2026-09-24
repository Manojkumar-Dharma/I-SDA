/**
 * i54MnubarRecordCheckboxSweep.test.js
 *
 * Task I-54 - follow-up from I-48. I-48 only closed the raw keyword
 * editor's own bypass of MNUBAR's whitelist (see
 * DspfWriter.mnubarWhitelistConflictReason's own doc comment for the full
 * citation and 27-entry keyword list); this task sweeps the structured,
 * per-keyword checkboxes across the General/Indicator/Help/Output/Input/
 * Overlay/Print record-property tabs, which - unlike a USRDFN record's own
 * narrowed tab set (Task R2) - are all still fully rendered for a MNUBAR
 * record (isMnuBarRecord only drives whether the MNUBAR tab ITSELF shows).
 *
 * Fix: DspfWriter.mnubarWhitelistConflictReason (already safe to call
 * unconditionally - it returns null for anything already on MNUBAR's own
 * whitelist, or when the record isn't MNUBAR at all) is now ALSO checked,
 * alongside the existing usrdfnConflictReason/pulldownConflictReason/
 * alwrolClrlSlnoConflictReason/sflWhitelistConflictReason chain, inside all
 * three shared guarded-wiring functions (wireUsrdfnGuardedFlag,
 * wireUsrdfnGuardedTwoField, wirePulldownGuardedFlag) - the same mechanism
 * I-53 used for SFL's own whitelist. ENTFLDATR's own bespoke Apply-button
 * commit (not on either SFL's or MNUBAR's whitelist) needed its own
 * individual guard call, same as I-53 wired for SFL - now ORed with
 * mnubarWhitelistConflictReason at the same call site. PRINT's own bespoke
 * commit needed NO change here (unlike I-53's own SFL case) - PRINT IS on
 * MNUBAR's own whitelist, so it correctly still commits normally.
 *
 * Keywords using the generic repeatable-instance editor (MNUBARDSP,
 * SFLPGMQ-style RANGE/COMP/VALUES, etc.) are NOT covered here - logged
 * separately as I-55 for that same primitive's SFL-side gap; a MNUBAR-side
 * equivalent, if any, would be a further follow-up, not attempted here.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i54MnubarRecordCheckboxSweep.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)',
    '     A          R MNUBARREC                  MNUBAR',
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

  function fillTwoField(prefix, idA, idB, valA, valB) {
    const elA = doc.getElementById(prefix + '-' + idA);
    const elB = doc.getElementById(prefix + '-' + idB);
    if (!elA || !elB) return { missing: true };
    posted.length = 0;
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    elA.value = valA;
    elB.value = valB;
    elA.dispatchEvent(new Event('change', { bubbles: true }));
    dom.window.alert = originalAlert;
    return { alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }

  // === Group A: plain-flag/two-field keywords NOT on MNUBAR's whitelist,
  // across General/Help/Overlay tabs - all routed through the three shared
  // guarded-wiring functions - are now blocked on a MNUBAR record ===
  selectRecord('MNUBARREC');
  const mP = 'rk-MNUBARREC';
  // Task I-105 (option (a)): a MNUBAR record's Keywords tab now hides every row
  // that is not on MNUBAR's closed whitelist instead of showing it and
  // refusing the tick, so there is no toggle left to refuse. The refusal
  // itself (mnubarWhitelistConflictReason in the three guarded-wiring
  // functions and wireEntFldAtrEditor) is unchanged and is still exercised on
  // the full row set by i104's sweep.
  console.log('\nMNUBAR record (Task I-105): non-whitelisted rows are hidden, not shown-and-refused');
  ['retkey', 'blink', 'msgalarm', 'logout', 'putretain', 'inzinp', 'entfldatr'].forEach(function (suffix) {
    check(suffix.toUpperCase() + ' checkbox is not rendered on a MNUBAR record', !doc.getElementById(mP + '-' + suffix + '-on'));
  });
  check('HLPSEQ boxes are not rendered on a MNUBAR record', !doc.getElementById(mP + '-hlpseq-group') && !doc.getElementById(mP + '-hlpseq-num'));

  // === Group B: keywords already on MNUBAR's own whitelist still commit
  // normally through the newly-guarded shared functions (no regression) ===
  console.log('\nMNUBAR record: whitelisted keywords (LOCK, OVERLAY, PROTECT) still commit normally');
  ['lock', 'overlay', 'protect'].forEach(function (suffix) {
    const result = toggleFlag(mP, suffix, true);
    check('setup: ' + suffix + ' checkbox is present', !result.missing);
    if (!result.missing) {
      check(suffix.toUpperCase() + ' (whitelisted) commits normally on a MNUBAR record', !!result.applyEdit);
      const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'MNUBARREC');
      check(suffix.toUpperCase() + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === suffix.toUpperCase()));
    }
  });

  console.log('\nMNUBAR record: CSRLOC (whitelisted two-field keyword) still commits normally');
  {
    const result = fillTwoField(mP, 'csrloc-row', 'csrloc-col', '5', '10');
    check('CSRLOC (whitelisted) commits normally on a MNUBAR record', !!result.applyEdit);
  }

  console.log('\nMNUBAR record: PRINT (bespoke commit, whitelisted) still commits normally');
  {
    const result = toggleFlag(mP, 'print', true);
    check('setup: print checkbox is present', !result.missing);
    check('PRINT (whitelisted) commits normally on a MNUBAR record', !!result.applyEdit);
    check('no alert fired for PRINT on a MNUBAR record', !result.alertMessage);
  }

  // === Group C: no regression - a non-MNUBAR record's checkboxes/bespoke
  // editors are completely unaffected ===
  selectRecord('PLAINREC');
  const pP = 'rk-PLAINREC';
  console.log('\nnon-MNUBAR record: plain flags and bespoke editors are unaffected');
  {
    const result = toggleFlag(pP, 'retkey', true);
    check('setup: retkey checkbox is present', !result.missing);
    check('RETKEY commits normally on a non-MNUBAR record', !!result.applyEdit);
    check('no alert fired for RETKEY on a non-MNUBAR record', !result.alertMessage);
  }
  {
    const onEl = doc.getElementById(pP + '-entfldatr-on');
    const applyBtn = doc.querySelector('.' + pP + '-entfldatr-apply');
    check('setup: ENTFLDATR checkbox and Apply button are present', !!onEl && !!applyBtn);
    if (onEl && applyBtn) {
      onEl.checked = true;
      posted.length = 0;
      let alertMessage = null;
      const originalAlert = dom.window.alert;
      dom.window.alert = (msg) => { alertMessage = msg; };
      applyBtn.dispatchEvent(new Event('click', { bubbles: true }));
      dom.window.alert = originalAlert;
      check('ENTFLDATR commits normally on a non-MNUBAR record', !!posted.find((m) => m.type === 'applyEdit'));
      check('no alert fired for ENTFLDATR on a non-MNUBAR record', !alertMessage);
    }
  }

  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

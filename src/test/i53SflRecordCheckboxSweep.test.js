/**
 * i53SflRecordCheckboxSweep.test.js
 *
 * Task I-53 - follow-up from I-46. I-46 only closed the raw keyword
 * editor's own bypass of SFL's whitelist (see
 * DspfWriter.sflWhitelistConflictReason's own doc comment for the full
 * SFL-vs-SFLCTL citation); this task sweeps the structured, per-keyword
 * checkboxes across the General/Indicator/Help/Output/Input/Overlay/Print
 * record-property tabs, which - unlike a USRDFN record's own narrowed tab
 * set (Task R2) - are all still fully rendered for a plain SFL record.
 *
 * Fix: DspfWriter.sflWhitelistConflictReason (already safe to call
 * unconditionally - it returns null for anything already on SFL's own
 * whitelist, or when the record isn't SFL at all) is now ALSO checked,
 * alongside the existing usrdfnConflictReason/pulldownConflictReason/
 * alwrolClrlSlnoConflictReason/dspmodSflConflictReason chain, inside all
 * three shared guarded-wiring functions (wireUsrdfnGuardedFlag,
 * wireUsrdfnGuardedTwoField, wirePulldownGuardedFlag) - which, per I-44's
 * own audit, already cover every plain flag/two-field keyword on these
 * tabs. Two keywords with bespoke (non-generic) commit functions that
 * bypass all three - PRINT's own file/library form, and ENTFLDATR's own
 * Apply-button color/attribute editor - needed their own individual
 * guard call added directly (same "optional trailing addGuardFn" shape
 * I-49 gave wireKeywordEditor, now also on wireEntFldAtrEditor).
 *
 * Keywords using the generic repeatable-instance editor (MNUBARDSP,
 * SFLPGMQ-style RANGE/COMP/VALUES, etc.) are NOT covered here - logged
 * separately as I-54, since retrofitting a guard into that much more
 * widely shared primitive is a bigger, riskier change than this task's
 * own flag-row-focused scope.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i53SflRecordCheckboxSweep.test.js
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
    '     A          R SFLREC                     SFL',
    '     A          R SFLMSGREC                  SFL',
    '     A                                       SFLMSGRCD(SFLREC)',
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

  // === Group A: plain-flag/two-field keywords across General/Help/Overlay
  // tabs - all routed through the three shared guarded-wiring functions -
  // are now blocked on a plain SFL record ===
  selectRecord('SFLREC');
  const sP = 'rk-SFLREC';
  // Task I-105 (option (a)): a plain SFL record's Keywords tab now hides every
  // row that is not on SFL's closed whitelist instead of showing it and
  // refusing the tick, so there is no toggle left to refuse. The refusal
  // itself (sflWhitelistConflictReason in the three guarded-wiring functions,
  // wireEntFldAtrEditor and PRINT's bespoke commit) is unchanged and is still
  // exercised on the full row set by i104's sweep and i53's helper-level use.
  console.log('\nSFL record (Task I-105): non-whitelisted rows are hidden, not shown-and-refused');
  ['retkey', 'blink', 'msgalarm', 'lock', 'protect', 'overlay', 'putretain', 'print', 'entfldatr'].forEach(function (suffix) {
    check(suffix.toUpperCase() + ' checkbox is not rendered on a plain SFL record', !doc.getElementById(sP + '-' + suffix + '-on'));
  });
  check('CSRLOC row is not rendered on a plain SFL record', !doc.getElementById(sP + '-csrloc-row') && !doc.getElementById(sP + '-csrloc-col'));
  check('HLPSEQ boxes are not rendered on a plain SFL record', !doc.getElementById(sP + '-hlpseq-group') && !doc.getElementById(sP + '-hlpseq-num'));

  // === Group B: keywords already on SFL's own whitelist still commit
  // normally through the newly-guarded shared functions (no regression) ===
  console.log('\nSFL record: whitelisted keywords (LOGINP, LOGOUT) still commit normally');
  ['loginp', 'logout'].forEach(function (suffix) {
    const result = toggleFlag(sP, suffix, true);
    check('setup: ' + suffix + ' checkbox is present', !result.missing);
    if (!result.missing) {
      check(suffix.toUpperCase() + ' (whitelisted) commits normally on an SFL record', !!result.applyEdit);
      const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'SFLREC');
      check(suffix.toUpperCase() + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === suffix.toUpperCase()));
    }
  });

  // === Group C: message-subfile's own even-narrower whitelist also
  // blocks a plain-SFL whitelist keyword (LOGINP) ===
  selectRecord('SFLMSGREC');
  const mP = 'rk-SFLMSGREC';
  // Task I-115: a message-subfile record's Keywords tab no longer offers the row at
  // all (its whitelist is SFLMSGRCD only), so there is nothing to tick; the refusal
  // itself stays covered on the full row set (i46 / i102 / i104 / i111 / i115).
  console.log('\nmessage-subfile record: LOGINP (valid on a plain SFL record) is not offered (I-115)');
  {
    const result = toggleFlag(mP, 'loginp', true);
    check('the loginp checkbox is not rendered on a message-subfile record', !!result.missing);
    check('no applyEdit was posted', !result.applyEdit);
  }

  // === Group D: no regression - a non-SFL record's checkboxes/bespoke
  // editors are completely unaffected ===
  selectRecord('PLAINREC');
  const pP = 'rk-PLAINREC';
  console.log('\nnon-SFL record: plain flags and bespoke editors are unaffected');
  {
    const result = toggleFlag(pP, 'retkey', true);
    check('setup: retkey checkbox is present', !result.missing);
    check('RETKEY commits normally on a non-SFL record', !!result.applyEdit);
    check('no alert fired for RETKEY on a non-SFL record', !result.alertMessage);
  }
  {
    const result = toggleFlag(pP, 'print', true);
    check('setup: print checkbox is present', !result.missing);
    check('PRINT commits normally on a non-SFL record', !!result.applyEdit);
    check('no alert fired for PRINT on a non-SFL record', !result.alertMessage);
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
      check('ENTFLDATR commits normally on a non-SFL record', !!posted.find((m) => m.type === 'applyEdit'));
      check('no alert fired for ENTFLDATR on a non-SFL record', !alertMessage);
    }
  }

  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

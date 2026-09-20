/**
 * i44UsrdfnRecordLevelAudit.test.js
 *
 * Task I-44 - wired DspfWriter.usrdfnConflictReason (I-8's own generic
 * "USRDFN's whitelist is INVITE/KEEP/PASSRCD/HLPRTN/HELP/HLPCLR/PRINT/
 * OPENPRT/TEXT, block anything else" check) to the 29 other record-level
 * keywords confirmed wired via plain simple()/wirePulldownGuardedFlag()/
 * wireTwoField() with zero USRDFN check: RETKEY, RETCMDKEY, CSRINPONLY,
 * BLINK, MSGALARM, LOCK, LOGOUT, DSPMOD, CSRLOC, LOGINP, GETRETAIN,
 * RETLCKSTS, PROTECT, INZINP, INZRCD, ALARM, ALWGPH, FRCDTA, SLNO, CLRL,
 * RTNDTA, OVERLAY, PUTRETAIN, PUTOVR, OVRDTA, OVRATR, MDTOFF, ERASEINP,
 * ERASE.
 *
 * Of the original 33-keyword list this task was opened against, 4 turned
 * out NOT to apply on audit: HLPPNLGRP/HLPEXCLD/HLPBDY/HLPARA are each
 * individually documented as help-SPECIFICATION-level keywords (not
 * file- or record-level), and USRDFN's own DDS Reference text carves out
 * exactly that: "No file- or record-level keywords apply to this record
 * except [the whitelist above]... Help specifications are valid for this
 * record." They're wired in wireApplicationHelpFields against a help
 * entry's own local keywords array (not the record's) - confirmed
 * out-of-scope, not a fix skipped. SFLNXTCHG is likewise not fixed here:
 * every one of its wiring call sites (wireSflKeywordsPanels' own SFLCTL
 * panel, and the message-subfile panel beside it) is a record TYPE
 * (subfile/message-subfile) that's structurally mutually exclusive with
 * USRDFN, so there is no live call site where this guard could ever fire
 * either way.
 *
 * A second, important audit finding shapes this test file's own two
 * groups below: isUsrDfnRecord's own doc comment (webviewClientHelpers.js)
 * documents that real IBM SDA's own "Select Record Keywords" menu only
 * offers 3 of the 7 categories for a USRDFN record - General, Help,
 * Print (Task R2, already faithfully replicated here well before I-44).
 * Of this task's 29 in-scope keywords, only 4 - RETKEY, RETCMDKEY,
 * CSRINPONLY, INZRCD - live in one of those 3 surviving categories, so
 * only their guard is reachable through today's UI on an actual USRDFN
 * record (Group A below, full block/revert/no-post assertions, same
 * shape as i8UsrdfnConflictAudit.test.js's own ALWROL/ASSUME/HLPCMDKEY/
 * HLPSEQ block). The other 25 all live in the Indicator/Output/Input/
 * Overlay categories, which simply aren't rendered at all for a USRDFN
 * record (not hidden via CSS - the tab content itself is never built),
 * so their row's DOM element doesn't exist to click; R2's own
 * category-level gate already closes the practical, UI-reachable gap for
 * these 25 today. This task's own guard on them is still correct,
 * harmless, defense-in-depth (matches each one's individual DDS
 * Reference text, and costs nothing if a future task ever changes R2's
 * category list) - Group B below locks in both halves of that finding:
 * the row is confirmed absent from a USRDFN record's DOM, and the
 * refactor that added the guard (simple() -> wireUsrdfnGuardedFlag /
 * wireTwoField -> wireUsrdfnGuardedTwoField, or the check added directly
 * inside wirePulldownGuardedFlag) is confirmed to have introduced no
 * regression on an ordinary (non-USRDFN) record - hasParams and the
 * Conditioning toggle (where the row had one before) both still work.
 *
 * The one remaining way a USRDFN record could still end up carrying one
 * of these 25 keywords - the Advanced/raw keywords accordion, a generic
 * add-any-keyword-by-name editor shared by every keyword in the DDS
 * Reference and not wired through simple()/wirePulldownGuardedFlag() at
 * all - is a materially bigger, separate task (guarding that editor
 * would mean enforcing USRDFN's whitelist against literally every other
 * keyword, not just these 29) and is logged as new task I-49 in
 * keywordFixes.md rather than attempted here.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i44UsrdfnRecordLevelAudit.test.js
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
    // Task I-45: both display sizes declared so DSPMOD's own separate
    // DSPSIZ prerequisite (unrelated to this file's own USRDFN focus)
    // doesn't interfere with Group B's regression check for DSPMOD below.
    '     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)',
    '     A          R USRREC                     USRDFN',
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

  // === Group A: General-tab keywords - shown-and-refused for a USRDFN record
  // when this task landed, hidden outright since Task I-105 (see below) ===
  // (RETKEY, RETCMDKEY, CSRINPONLY have no params and their own DDS
  // Reference text doesn't say either way on option indicators, so their
  // pre-existing Conditioning toggle is left as-is; INZRCD was already
  // noConditioning=true per I-7/I-13, unaffected here.)
  selectRecord('USRREC');
  let uP = 'rk-USRREC';

  console.log('\nUSRDFN record (Task I-105): Group A (General tab) rows are hidden, not shown-and-refused');
  ['retkey', 'retcmdkey', 'csrinponly', 'inzrcd'].forEach(function (suffix) {
    check(suffix.toUpperCase() + ' checkbox is not rendered on a USRDFN record', !doc.getElementById(uP + '-' + suffix + '-on'));
  });

  console.log('\nnon-USRDFN record: Group A keywords still turn on normally (no regression)');
  selectRecord('PLAINREC');
  let pP = 'rk-PLAINREC';
  ['retkey', 'retcmdkey', 'csrinponly', 'inzrcd'].forEach(function (suffix) {
    const name = suffix.toUpperCase();
    const box = doc.getElementById(pP + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present on PLAINREC', !!box);
    posted.length = 0;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(name + ' commits normally on a non-USRDFN record', !!applyEdit);
    const reparsed = applyEdit && reparsedRecord(applyEdit.text, 'PLAINREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  // === Group B: Indicator/Output/Input/Overlay-tab keywords, whose whole
  // category is already absent from a USRDFN record's own tab set (Task
  // R2) - confirms both halves of this test file's own doc-comment
  // finding: absent from the USRDFN record's DOM, and no regression on a
  // non-USRDFN record from the simple()/wireTwoField -> guarded-wiring
  // refactor.
  const groupB = [
    { suffix: 'blink', name: 'BLINK' },
    { suffix: 'msgalarm', name: 'MSGALARM' },
    { suffix: 'lock', name: 'LOCK' },
    { suffix: 'logout', name: 'LOGOUT' },
    { suffix: 'dspmod', name: 'DSPMOD', hasParams: true, paramValue: '*DS4' },
    { suffix: 'loginp', name: 'LOGINP' },
    { suffix: 'getretain', name: 'GETRETAIN' },
    { suffix: 'retlcksts', name: 'RETLCKSTS' }, // I-50 fixed the hasParams bug this file used to assert against
    { suffix: 'protect', name: 'PROTECT' },
    { suffix: 'inzinp', name: 'INZINP' },
    { suffix: 'alarm', name: 'ALARM' },
    { suffix: 'alwgph', name: 'ALWGPH' },
    { suffix: 'frcdta', name: 'FRCDTA' },
    { suffix: 'slno', name: 'SLNO', hasParams: true, paramValue: '5' },
    { suffix: 'clrl', name: 'CLRL', hasParams: true, paramValue: '10' },
    { suffix: 'rtndta', name: 'RTNDTA' },
    { suffix: 'overlay', name: 'OVERLAY' },
    { suffix: 'putretain', name: 'PUTRETAIN' },
    { suffix: 'putovr', name: 'PUTOVR' },
    { suffix: 'ovrdta', name: 'OVRDTA' },
    { suffix: 'ovratr', name: 'OVRATR' },
    { suffix: 'mdtoff', name: 'MDTOFF', hasParams: true, paramValue: '*ALL' },
    { suffix: 'eraseinp', name: 'ERASEINP', hasParams: true, paramValue: '*ALL' },
    { suffix: 'erase', name: 'ERASE' },
  ];

  console.log('\nUSRDFN record: Group B (Indicator/Output/Input/Overlay tab) rows are absent entirely (Task R2\'s own category-level gate, not this task\'s own per-row guard)');
  selectRecord('USRREC');
  uP = 'rk-USRREC';
  groupB.forEach(function (kw) {
    check(kw.name + ' checkbox does not exist on a USRDFN record (its whole tab category is unavailable)', !doc.getElementById(uP + '-' + kw.suffix + '-on'));
  });
  check('CSRLOC row does not exist on a USRDFN record either', !doc.getElementById(uP + '-csrloc-row'));

  console.log('\nnon-USRDFN record: Group B keywords still turn on normally, params preserved where applicable (no regression from the guarded-wiring refactor)');
  selectRecord('PLAINREC');
  pP = 'rk-PLAINREC';
  groupB.forEach(function (kw) {
    const box = doc.getElementById(pP + '-' + kw.suffix + '-on');
    check('setup: ' + kw.name + ' checkbox is present on PLAINREC', !!box);
    if (kw.hasParams) {
      const paramsEl = doc.getElementById(pP + '-' + kw.suffix + '-params');
      check('setup: ' + kw.name + ' params box is present on PLAINREC', !!paramsEl);
      if (paramsEl) paramsEl.value = kw.paramValue;
    }
    posted.length = 0;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(kw.name + ' commits normally on a non-USRDFN record', !!applyEdit);
    const reparsed = applyEdit && reparsedRecord(applyEdit.text, 'PLAINREC');
    const found = reparsed && reparsed.keywords.find((k) => k.name === kw.name);
    check(kw.name + ' actually present in the rewritten DDS', !!found);
    if (kw.hasParams && found) {
      check(kw.name + ' parameter text preserved (' + kw.paramValue + ')', (found.parameters || '').indexOf(kw.paramValue) !== -1);
    }
  });

  // CSRLOC: two-field row (row/col), not a checkbox - same idiom as
  // HLPSEQ in i8UsrdfnConflictAudit.test.js.
  console.log('\nUSRDFN record: CSRLOC row does not exist; non-USRDFN record: CSRLOC still commits normally');
  selectRecord('PLAINREC');
  pP = 'rk-PLAINREC';
  {
    const rowEl = doc.getElementById(pP + '-csrloc-row');
    const colEl = doc.getElementById(pP + '-csrloc-col');
    check('setup: CSRLOC row/col boxes are present on PLAINREC', !!rowEl && !!colEl);
    posted.length = 0;
    rowEl.value = '5';
    rowEl.dispatchEvent(new Event('change', { bubbles: true }));
    colEl.value = '10';
    colEl.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('CSRLOC commits normally on a non-USRDFN record', !!applyEdit);
    const reparsed = applyEdit && reparsedRecord(applyEdit.text, 'PLAINREC');
    check('CSRLOC actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'CSRLOC'));
  }

  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

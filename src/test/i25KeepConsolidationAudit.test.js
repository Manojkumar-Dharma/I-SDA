/**
 * i25KeepConsolidationAudit.test.js
 *
 * Task I-25 - KEEP was independently rendered - each with its own live
 * flagRowHtml row reading/writing the SAME underlying keyword - on 4
 * different record-type panels: the base recordKeywordsPanelsHtml
 * (Task R1's General tab, shown for every record), the SFL panel
 * (sflKeywordsPanelsHtml, Task R3), the SFLMSG panel (sflMsgPanelsHtml,
 * Task R5), and the SFLCTL panel (sflCtlPanelsHtml, Task R4). This was
 * flagged as a UI redundancy (not a data-correctness bug - I-9's own
 * audit confirmed all 4 copies read/write the same record's `keywords`
 * array, so they always stayed in sync) during the I-9 SFL audit,
 * following the same precedent Task R3 already set for CHGINPDFT (which
 * got the SFL/SFLCTL panels' own copies reduced to a hint - see each of
 * those panels' own "is deliberately NOT repeated here" comment).
 *
 * This task removes the SFLMSG/SFL/SFLCTL panels' own duplicate live
 * KEEP rows entirely - further than R3's CHGINPDFT precedent went (that
 * one left the SFLMSG panel's own copy live) - leaving exactly one live
 * KEEP control (the base General tab) plus a hint on each of the other
 * three panels pointing back to it.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i9SflConditioningAudit.test.js/
 * i10SflctlConditioningAudit.test.js).
 * Run with: node src/test/i25KeepConsolidationAudit.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// One record of each of the 4 KEEP-relevant shapes: a plain record (base
// General tab only), a plain SFL detail record, an SFLMSG record, and an
// SFLCTL control record - each carrying its own explicit KEEP so the
// base tab's pre-fill can be checked on every shape too.
const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R PLAINREC                   KEEP',
    "     A            FLD1          10A  O  4  2",
    '     A          R SFLREC                     SFL',
    '     A                                      KEEP',
    "     A            FLD2          10A  O  5  2",
    '     A          R SFLCTLR                    SFLCTL(SFLREC)',
    '     A                                      KEEP',
    '     A                                      SFLSIZ(17)',
    '     A                                      SFLPAG(17)',
    '     A          R SFLMSGREC                  SFLMSGRCD(24)',
    '     A                                      KEEP',
    "     A            MSGKEY         4S 0H",
  ].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    window.alert = () => {};
  },
});

const KEEP_HINT_RE = /Keep records? on display( when closing the file)? \(KEEP\)/;

function clickTabByLabel(doc, Event, label) {
  const btn = Array.prototype.slice.call(doc.querySelectorAll('.props-tab'))
    .find(function (el) { return (el.textContent || '').trim() === label; });
  if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
  return btn;
}

setTimeout(() => {
  const { document: doc, Event } = dom.window;
  const recordSelect = doc.getElementById('recordSelect');

  function hasConditioningToggle(flagId) {
    return !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  }

  // --- Base General tab (every record type): the ONE surviving live KEEP row ---
  recordSelect.value = 'PLAINREC';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('\nbase Record Keywords -> General tab: the one surviving live KEEP row, pre-filled from the source');
  const baseKeepOn = doc.getElementById('rk-PLAINREC-keep-on');
  check('rk-PLAINREC-keep-on exists', !!baseKeepOn);
  check('rk-PLAINREC-keep-on is pre-filled checked (KEEP is in the source)', !!baseKeepOn && baseKeepOn.checked === true);

  // --- SFL panel: KEEP row removed, hint shown, base tab still reflects it ---
  recordSelect.value = 'SFLREC';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  clickTabByLabel(doc, Event, 'SFL');
  console.log('\nSFL panel (sflKeywordsPanelsHtml): KEEP row removed, hint shown instead');
  check('sfl-SFLREC-keep-on no longer exists', !doc.getElementById('sfl-SFLREC-keep-on'));
  check('sfl-SFLREC-keep has no Conditioning toggle (does not exist)', !hasConditioningToggle('sfl-SFLREC-keep'));
  check('hint pointing to the base tab is shown', KEEP_HINT_RE.test(doc.body.innerHTML));
  clickTabByLabel(doc, Event, 'General');
  const sflBaseKeepOn = doc.getElementById('rk-SFLREC-keep-on');
  check('the base General tab (same record) still shows KEEP, pre-filled checked from the shared keywords array', !!sflBaseKeepOn && sflBaseKeepOn.checked === true);

  // --- SFLCTL panel: KEEP row removed, hint shown, base tab still reflects it ---
  recordSelect.value = 'SFLCTLR';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  clickTabByLabel(doc, Event, 'SFLCTL');
  console.log('\nSFLCTL panel (sflCtlPanelsHtml): KEEP row removed, hint shown instead');
  check('sflctl-SFLCTLR-keep-on no longer exists', !doc.getElementById('sflctl-SFLCTLR-keep-on'));
  check('sflctl-SFLCTLR-keep has no Conditioning toggle (does not exist)', !hasConditioningToggle('sflctl-SFLCTLR-keep'));
  check('hint pointing to the base tab is shown', KEEP_HINT_RE.test(doc.body.innerHTML));
  clickTabByLabel(doc, Event, 'General');
  const sflctlBaseKeepOn = doc.getElementById('rk-SFLCTLR-keep-on');
  check('the base General tab (same record) still shows KEEP, pre-filled checked from the shared keywords array', !!sflctlBaseKeepOn && sflctlBaseKeepOn.checked === true);

  // --- SFLMSG panel: KEEP row removed, hint shown, base tab still reflects it ---
  recordSelect.value = 'SFLMSGREC';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  clickTabByLabel(doc, Event, 'SFLMSG');
  console.log('\nSFLMSG panel (sflMsgPanelsHtml): KEEP row removed (further than Task R3\'s own CHGINPDFT precedent, which left this panel\'s copy live), hint shown instead');
  check('sm-keep-on no longer exists', !doc.getElementById('sm-keep-on'));
  check('sm-keep has no Conditioning toggle (does not exist)', !hasConditioningToggle('sm-keep'));
  // Task I-115: a message subfile's whitelist is SFLMSGRCD only (KEEP was always
  // refused there), so the base Keywords tab no longer offers a KEEP row for this
  // record type at all - the hint says so, and a hand-written KEEP stays listed
  // (and removable) in the raw keyword editor.
  check('hint explaining the base rows are not offered is shown', /a message-subfile record accepts only SFLMSGRCD, so the base Record Keywords rows \(KEEP and the rest\) are not offered here/.test(doc.body.innerHTML));
  const sflmsgBaseKeepOn = doc.getElementById('rk-SFLMSGREC-keep-on');
  check('I-115: the base tab no longer shows a KEEP row for a message-subfile record', !sflmsgBaseKeepOn);
  const rawChips = Array.prototype.slice.call(doc.querySelectorAll('#kwed-record-SFLMSGREC .keyword-chip')).map(function (c) { return c.textContent; });
  check('I-115: the record\'s own KEEP is still listed in the raw keyword editor', rawChips.some(function (c) { return /^KEEP/.test(c); }));

  // --- Editing KEEP only ever happens through the one surviving base row now ---
  console.log('\nediting KEEP through the base tab still commits normally (the one surviving control)');
  recordSelect.value = 'PLAINREC';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  const editKeepOn = doc.getElementById('rk-PLAINREC-keep-on');
  editKeepOn.checked = false;
  editKeepOn.dispatchEvent(new Event('change', { bubbles: true }));
  const editKeepOnAfter = doc.getElementById('rk-PLAINREC-keep-on');
  check('KEEP-off committed (checkbox reflects unchecked state after re-render)', editKeepOnAfter && editKeepOnAfter.checked === false);

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

/**
 * i9SflConditioningAudit.test.js
 *
 * Task I-9 - SFL (subfile detail record) keyword audit, following I-3's
 * same method: for every keyword the SFL panel (sflKeywordsPanelsHtml/
 * wireSflKeywordsPanels) exposes, confirm the Conditioning toggle's
 * presence/absence against IBM's own "Option indicators are/are not valid
 * for this keyword" statement in docs/sda-reference/source/
 * DDS_Keyword_V7r6.txt (see keywordFixes.md's I-9 section for the full
 * per-keyword findings).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i3ConditioningAudit.test.js/s36eUiHardBlocks.test.js).
 * Run with: node src/test/i9SflConditioningAudit.test.js
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

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SFLREC                     SFL',
    "     A            FLD1          10A  O  4  2",
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

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  const sflTabButton = Array.prototype.slice.call(doc.querySelectorAll('button, .tab, [role="tab"]'))
    .find(function (el) { return /subfile/i.test(el.textContent || '') && !/control|message/i.test(el.textContent || ''); });
  if (sflTabButton) sflTabButton.dispatchEvent(new Event('click', { bubbles: true }));

  function hasConditioningToggle(flagId) {
    return !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  }

  const sflnxtchgOn = doc.getElementById('sfl-SFLREC-sflnxtchg-on');
  check('setup: SFL panel General row (SFLNXTCHG) is present', !!sflnxtchgOn);

  console.log('\nconfirmed NOT-valid SFL keywords must NOT offer a Conditioning toggle');
  ['sfl-SFLREC-loginp', 'sfl-SFLREC-keep', 'sfl-SFLREC-check-ab', 'sfl-SFLREC-check-rl'].forEach(function (id) {
    check(id + ' has no Conditioning toggle', !hasConditioningToggle(id));
  });

  console.log('\nconfirmed-valid SFL keywords must still offer a Conditioning toggle (no regression)');
  ['sfl-SFLREC-sflnxtchg', 'sfl-SFLREC-logout'].forEach(function (id) {
    check(id + ' still has a Conditioning toggle', hasConditioningToggle(id));
  });

  console.log('\nediting an ineligible keyword still commits normally');
  {
    const keepOn = doc.getElementById('sfl-SFLREC-keep-on');
    check('setup: KEEP checkbox is present', !!keepOn);
    keepOn.checked = true;
    keepOn.dispatchEvent(new Event('change', { bubbles: true }));
    const keepOnAfter = doc.getElementById('sfl-SFLREC-keep-on');
    check('KEEP committed (checkbox reflects checked state after re-render)', keepOnAfter && keepOnAfter.checked === true);
    check('KEEP still has no Conditioning toggle after commit', !hasConditioningToggle('sfl-SFLREC-keep'));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

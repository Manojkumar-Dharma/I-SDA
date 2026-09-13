/**
 * i14MnubarConditioningAudit.test.js
 *
 * Task I-14 - MNUBAR (menu bar record) keyword audit, following
 * I-7/I-9/I-10's same method: for every keyword the MNUBAR panel
 * (mnuBarPanelsHtml/wireMnuBarPanels) exposes, confirm the Conditioning
 * toggle's presence/absence against IBM's own "Option indicators are/are
 * not valid for this keyword" statement in docs/sda-reference/source/
 * DDS_Keyword_V7r6.txt (see keywordFixes.md's I-14 section for the full
 * per-keyword findings).
 *
 * Finding covered here:
 *  - MNUBAR itself: newly found not-eligible (this task's own audit -
 *    the Conditioning toggle was wrongly shown before, since MNUBAR's own
 *    DDS Reference section ends with "Option indicators are not valid
 *    for this keyword"). Its own free-text parameter placeholder is also
 *    now the confirmed `*SEPARATOR | *NOSEPARATOR` (default *SEPARATOR)
 *    text rather than the old "not confidently verified" hint.
 *  - MNUBARSW/MNUCNL: confirmed already correct (both explicitly
 *    documented "Option indicators are valid for this keyword",
 *    verified as file-OR-record level and already wired at both levels)
 *    - no regression check here.
 *  - MNUBARDSP: confirmed already correct (Task L76/I-4 already gave it
 *    its own two-format structured inputs with Conditioning intact) - no
 *    regression check here.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i10SflctlConditioningAudit.test.js).
 * Run with: node src/test/i14MnubarConditioningAudit.test.js
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
    '     A          R BAR1                       MNUBAR',
    '     A            MNUFLD         2Y 0B 1  2',
    "     A                                      MNUBARCHC(1 PULLFILE '>File')",
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

  // Select the BAR1 record so its own props panel (and MNUBAR tab) render.
  const recordSelect = doc.getElementById('recordSelect');
  if (recordSelect) {
    recordSelect.value = 'BAR1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const mnuBarTabButton = Array.prototype.slice.call(doc.querySelectorAll('.props-tab'))
    .find(function (el) { return (el.textContent || '').trim() === 'MNUBAR'; });
  check('setup: MNUBAR tab button rendered', !!mnuBarTabButton);
  if (mnuBarTabButton) mnuBarTabButton.dispatchEvent(new Event('click', { bubbles: true }));

  function hasConditioningToggle(flagId) {
    return !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  }

  const p = 'mnubar-BAR1';
  const mnubarOn = doc.getElementById(p + '-mnubar-on');
  check('setup: MNUBAR General row (MNUBAR) is present', !!mnubarOn);

  console.log('\nnewly-audited not-valid MNUBAR keyword must NOT offer a Conditioning toggle');
  check(p + '-mnubar has no Conditioning toggle', !hasConditioningToggle(p + '-mnubar'));

  console.log('\nMNUBAR\u2019s own parameter box now shows the confirmed *SEPARATOR/*NOSEPARATOR placeholder');
  const mnubarParams = doc.getElementById(p + '-mnubar-params');
  check('setup: MNUBAR params box is present', !!mnubarParams);
  check(
    'placeholder mentions *SEPARATOR and *NOSEPARATOR',
    !!mnubarParams && /\*SEPARATOR/.test(mnubarParams.placeholder) && /\*NOSEPARATOR/.test(mnubarParams.placeholder)
  );

  console.log('\nconfirmed-valid MNUBAR-panel keywords still offer a Conditioning toggle (no regression)');
  ['mnubar-BAR1-mnubarsw', 'mnubar-BAR1-mnucnl'].forEach(function (id) {
    check(id + ' still has a Conditioning toggle', hasConditioningToggle(id));
  });

  console.log('\nediting the now-ineligible MNUBAR keyword still commits normally');
  {
    mnubarOn.checked = true;
    mnubarOn.dispatchEvent(new Event('change', { bubbles: true }));
    const mnubarOnAfter = doc.getElementById(p + '-mnubar-on');
    check('MNUBAR committed (checkbox reflects checked state after re-render)', mnubarOnAfter && mnubarOnAfter.checked === true);
    check('MNUBAR still has no Conditioning toggle after commit', !hasConditioningToggle(p + '-mnubar'));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

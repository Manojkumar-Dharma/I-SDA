/**
 * i10SflctlConditioningAudit.test.js
 *
 * Task I-10 - SFLCTL (subfile control record) keyword audit, following
 * I-7/I-9's same method: for every keyword the SFLCTL panel
 * (sflCtlPanelsHtml/wireSflCtlPanels) exposes, confirm the Conditioning
 * toggle's presence/absence against IBM's own "Option indicators are/are
 * not valid for this keyword" statement in docs/sda-reference/source/
 * DDS_Keyword_V7r6.txt (see keywordFixes.md's I-10 section for the full
 * per-keyword findings).
 *
 * Two categories of finding covered here:
 *  - SFLCTL/SFLMODE/SFLENTER/SFLRNA: newly found not-eligible (this
 *    task's own audit - the Conditioning toggle was wrongly shown before).
 *  - LOGINP/KEEP/CHECK(AB)/CHECK(RL): I-9 already established these are
 *    not eligible on the plain SFL panel, but that fix was never
 *    propagated to this SFLCTL panel's own separate copy of the same
 *    shared keywords - a real inconsistency, not just an unaudited gap.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i9SflConditioningAudit.test.js).
 * Run with: node src/test/i10SflctlConditioningAudit.test.js
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
    '     A          R SFLCTLR                    SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(17)',
    '     A                                      SFLPAG(17)',
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

  // Select the SFLCTLR record so its own props panel (and SFLCTL tab) render.
  const recordSelect = doc.getElementById('recordSelect');
  if (recordSelect) {
    recordSelect.value = 'SFLCTLR';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const sflctlTabButton = Array.prototype.slice.call(doc.querySelectorAll('button, .tab, [role="tab"]'))
    .find(function (el) { return /^sflctl$/i.test((el.textContent || '').trim()) || /subfile control/i.test(el.textContent || ''); });
  if (sflctlTabButton) sflctlTabButton.dispatchEvent(new Event('click', { bubbles: true }));

  function hasConditioningToggle(flagId) {
    return !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  }

  const sflctlOn = doc.getElementById('sflctl-SFLCTLR-sflctl-on');
  check('setup: SFLCTL panel General row (SFLCTL) is present', !!sflctlOn);

  console.log('\nnewly-audited not-valid SFLCTL keywords must NOT offer a Conditioning toggle');
  ['sflctl-SFLCTLR-sflctl', 'sflctl-SFLCTLR-sflmode', 'sflctl-SFLCTLR-sflenter', 'sflctl-SFLCTLR-sflrna'].forEach(function (id) {
    check(id + ' has no Conditioning toggle', !hasConditioningToggle(id));
  });

  console.log('\nI-9 finding (LOGINP/KEEP/CHECK(AB)/CHECK(RL) not eligible) now propagated to the SFLCTL panel\'s own copy');
  ['sflctl-SFLCTLR-loginp', 'sflctl-SFLCTLR-keep', 'sflctl-SFLCTLR-check-ab', 'sflctl-SFLCTLR-check-rl'].forEach(function (id) {
    check(id + ' has no Conditioning toggle', !hasConditioningToggle(id));
  });

  console.log('\nconfirmed-valid SFLCTL keywords must still offer a Conditioning toggle (no regression)');
  [
    'sflctl-SFLCTLR-sfldsp', 'sflctl-SFLCTLR-sfldspctl', 'sflctl-SFLCTLR-sflinz',
    'sflctl-SFLCTLR-sfldlt', 'sflctl-SFLCTLR-sflclr', 'sflctl-SFLCTLR-sflend',
    'sflctl-SFLCTLR-sfldrop', 'sflctl-SFLCTLR-sflfold',
    'sflctl-SFLCTLR-sflnxtchg', 'sflctl-SFLCTLR-logout',
  ].forEach(function (id) {
    check(id + ' still has a Conditioning toggle', hasConditioningToggle(id));
  });

  console.log('\nambiguous keyword (no explicit DDS Reference statement either way) left as-is, still shows Conditioning');
  check('sflctl-SFLCTLR-sflcsrrrn still has a Conditioning toggle', hasConditioningToggle('sflctl-SFLCTLR-sflcsrrrn'));

  console.log('\nediting a now-ineligible SFLCTL keyword still commits normally');
  {
    const sflrnaOn = doc.getElementById('sflctl-SFLCTLR-sflrna-on');
    check('setup: SFLRNA checkbox is present', !!sflrnaOn);
    sflrnaOn.checked = true;
    sflrnaOn.dispatchEvent(new Event('change', { bubbles: true }));
    const sflrnaOnAfter = doc.getElementById('sflctl-SFLCTLR-sflrna-on');
    check('SFLRNA committed (checkbox reflects checked state after re-render)', sflrnaOnAfter && sflrnaOnAfter.checked === true);
    check('SFLRNA still has no Conditioning toggle after commit', !hasConditioningToggle('sflctl-SFLCTLR-sflrna'));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

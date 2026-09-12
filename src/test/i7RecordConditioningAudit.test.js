/**
 * i7RecordConditioningAudit.test.js
 *
 * Task I-7 - conditioning-eligibility audit for the base RECORD type's
 * General/Help/Output/Input/Overlay categories (see keywordFixes.md's I-7
 * section for the per-keyword ground truth this test asserts against,
 * sourced from docs/sda-reference/source/DDS_Keyword_V7r6.txt's own
 * "Option indicators are/are not valid for this keyword" line for each
 * keyword).
 *
 * Same method and rationale as i3ConditioningAudit.test.js (which did this
 * for file-level keywords) - runs the DSPF designer's real generated
 * client-side script in jsdom and asserts, for every keyword this task
 * touched, that the rendered Record Properties panel either DOES or does
 * NOT show a "Conditioning" toggle (`.kw-cond-toggle[data-flag-id="..."]`)
 * matching IBM's own eligibility statement.
 * Run with: node src/test/i7RecordConditioningAudit.test.js
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
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
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

  const recordSelect = doc.getElementById('recordSelect');
  check('setup: the record dropdown is present', !!recordSelect);
  recordSelect.value = 'SCR1';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));

  const rkP = 'rk-SCR1';

  function hasConditioningToggle(flagId) {
    return !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  }

  console.log('\nconfirmed NOT-valid keywords must NOT offer a Conditioning toggle (fixed this task)');
  [
    rkP + '-inzrcd', rkP + '-assume', rkP + '-alwrol', rkP + '-hlpcmdkey',
    rkP + '-slno', rkP + '-clrl', rkP + '-loginp', rkP + '-getretain',
    rkP + '-rtndta', rkP + '-unlock', rkP + '-check-ab', rkP + '-check-rl',
  ].forEach(function (id) {
    check(id + ' has no Conditioning toggle', !hasConditioningToggle(id));
  });

  console.log('\nconfirmed-valid keywords must still offer a Conditioning toggle (no regression)');
  [
    rkP + '-blink', rkP + '-alarm', rkP + '-msgalarm', rkP + '-lock',
    rkP + '-logout', rkP + '-invite', rkP + '-alwgph', rkP + '-frcdta',
    rkP + '-dspmod', rkP + '-overlay', rkP + '-putretain', rkP + '-protect',
    rkP + '-putovr', rkP + '-ovrdta', rkP + '-ovratr', rkP + '-inzinp',
    rkP + '-mdtoff', rkP + '-eraseinp', rkP + '-erase', rkP + '-print',
    rkP + '-retlcksts', rkP + '-hlpclr',
  ].forEach(function (id) {
    check(id + ' still has a Conditioning toggle', hasConditioningToggle(id));
  });

  console.log('\nediting a now-ineligible keyword still commits normally (removing the toggle must not break the row)');
  const inzrcdOn = doc.getElementById(rkP + '-inzrcd-on');
  check('setup: INZRCD checkbox is present', !!inzrcdOn);
  inzrcdOn.checked = true;
  inzrcdOn.dispatchEvent(new Event('change', { bubbles: true }));
  check('INZRCD committed (checkbox reflects checked state after re-render)', doc.getElementById(rkP + '-inzrcd-on').checked);
  check('INZRCD still has no Conditioning toggle after commit', !hasConditioningToggle(rkP + '-inzrcd'));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 50);

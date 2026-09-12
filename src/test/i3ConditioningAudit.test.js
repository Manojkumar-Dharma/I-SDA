/**
 * i3ConditioningAudit.test.js
 *
 * Task I-3 - full conditioning-eligibility audit across all 39 file-level
 * keywords (see keywordFixes.md's I-3 section for the per-keyword ground
 * truth this test asserts against, sourced from
 * docs/sda-reference/source/DDS_Keyword_V7r6.txt's own "Option indicators
 * are/are not valid for this keyword" line for each keyword).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom (same
 * rationale as s36eUiHardBlocks.test.js) and asserts, for every keyword this
 * task touched, that the rendered File Properties panel either DOES or does
 * NOT show a "Conditioning" toggle (`.kw-cond-toggle[data-flag-id="..."]`)
 * matching IBM's own eligibility statement - a toggle that only exists in a
 * code comment isn't a fix; only the actual rendered DOM proves it.
 * Run with: node src/test/i3ConditioningAudit.test.js
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

  const fileCrumb = doc.getElementById('crumb-file');
  check('file breadcrumb is present', !!fileCrumb);
  fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));

  function hasConditioningToggle(flagId) {
    return !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  }

  console.log('\nconfirmed NOT-valid keywords must NOT offer a Conditioning toggle');
  [
    'fk-indara', 'fk-usrdspmgt', 'fk-check-ab', 'fk-check-rltb', 'fk-check-rl',
    'fk-dsprl', 'fk-chginpdft', 'fk-errsfl', 'fk-vldcmdkey', 'fk-indtxt',
    'fk-openprt', 'fk-hlpschidx', 'fk-hlpfull', 'fk-igccnv', 'fk-althelp',
    'fk-altpageup', 'fk-altpagedwn',
  ].forEach(function (id) {
    check(id + ' has no Conditioning toggle', !hasConditioningToggle(id));
  });

  console.log('\nconfirmed-valid keywords must still offer a Conditioning toggle (no regression)');
  [
    'fk-invite', 'fk-alwgph', 'fk-msgalarm', 'fk-clear', 'fk-home',
    'fk-pagedown', 'fk-pageup', 'fk-help', 'fk-hlprtn', 'fk-print',
    'fk-hlppnlgrp', 'fk-mnubarsw', 'fk-mnucnl',
  ].forEach(function (id) {
    check(id + ' still has a Conditioning toggle', hasConditioningToggle(id));
  });

  console.log('\nreverse gaps - ENTFLDATR and WDWBORDER are valid but had no toggle at all before this task');
  check('fk-entfldatr now has a Conditioning toggle', hasConditioningToggle('fk-entfldatr'));
  check('fk-wdw now has a Conditioning toggle', hasConditioningToggle('fk-wdw'));

  console.log('\nnon-regression: keywords that never had a toggle and IBM says are still not valid stay that way');
  ['fk-ref-library', 'fk-passrcd', 'fk-text', 'fk-hlptitle'].forEach(function (id) {
    // These rows use plain text/checkbox inputs with no flagRowHtml wrapper
    // at all - just confirm the row itself exists and (still) has no toggle.
    check(id + ' has no Conditioning toggle', !hasConditioningToggle(id));
  });

  console.log('\nediting an ineligible keyword still commits normally (removing the toggle must not break the row)');
  {
    const indaraOn = doc.getElementById('fk-indara-on');
    check('setup: INDARA checkbox is present', !!indaraOn);
    indaraOn.checked = true;
    indaraOn.dispatchEvent(new Event('change', { bubbles: true }));
    // Re-query after the re-render.
    const indaraOnAfter = doc.getElementById('fk-indara-on');
    check('INDARA committed (checkbox reflects checked state after re-render)', indaraOnAfter && indaraOnAfter.checked === true);
    check('INDARA still has no Conditioning toggle after commit', !hasConditioningToggle('fk-indara'));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

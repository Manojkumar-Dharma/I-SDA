/**
 * i50RetlckstsParamsBug.test.js
 *
 * Task I-50 (docs/sda-reference/keywordFixes.md) - RETLCKSTS's own row
 * (`webviewClientHelpers.js`) has always rendered and wired a free-text
 * params box (render side: `flagRowHtml(..., retlcksts.parameters,
 * 'indicators (optional)', ...)`; wire side: `wireUsrdfnGuardedFlag(...,
 * hasParams=true, ...)`), but RETLCKSTS's own DDS Reference section states
 * "This keyword has no parameters." Found while implementing I-44, which
 * deliberately preserved the existing (buggy) behavior unchanged rather
 * than stack an unrelated fix into that task's diff.
 *
 * Fix: dropped the params box entirely on both sides - `paramsValue`/
 * `paramsPlaceholder` are now `undefined` on the render call (same shape
 * as BLINK/LOGOUT/etc., which never had a params box), and the wire call's
 * `hasParams` flag flipped from `true` to `false`. The live Conditioning
 * toggle (RETLCKSTS is individually documented "Option indicators are
 * valid for this keyword") is untouched by this fix.
 *
 * Fails against pre-I-50 code (a params input box exists on the RETLCKSTS
 * row), passes against the fix (no params box at all - just checkbox +
 * Conditioning toggle).
 *
 * Run with: node src/test/i50RetlckstsParamsBug.test.js
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
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
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
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

function lastEdit() {
  for (let i = posted.length - 1; i >= 0; i--) {
    if (posted[i] && posted[i].type === 'applyEdit') return posted[i];
  }
  return null;
}

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  console.log('setup: navigate to SCR1 record keywords, Input tab');
  doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'SCR1';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));

  const p = 'rk-SCR1';

  console.log('\nRETLCKSTS row no longer offers a params box (I-50 fix - its own DDS Reference text says it has no parameters)');
  const onEl = doc.getElementById(p + '-retlcksts-on');
  check('RETLCKSTS checkbox is present', !!onEl);
  check('RETLCKSTS params box does NOT exist', !doc.getElementById(p + '-retlcksts-params'));
  check('RETLCKSTS still has a Conditioning toggle (untouched by this fix)', !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-retlcksts"]'));

  console.log('\nturning RETLCKSTS on commits with no parameters (nothing to lose since there was never a params box to type into)');
  posted.length = 0;
  onEl.checked = true;
  onEl.dispatchEvent(new Event('change', { bubbles: true }));
  let edit = lastEdit();
  check('RETLCKSTS was posted', !!edit && /RETLCKSTS/.test(edit.text));
  check('RETLCKSTS carries no parameters (no parenthesized value)', !!edit && !/RETLCKSTS\([^)]/.test(edit.text));
  const reparsedOn = edit && DspfParser.parseDspf(edit.text).records.find((r) => r.name === 'SCR1');
  const foundOn = reparsedOn && reparsedOn.keywords.find((k) => k.name === 'RETLCKSTS');
  check('RETLCKSTS round-trips with empty/no parameters', !!foundOn && !(foundOn.parameters || '').trim());

  console.log('\nturning it back off removes the keyword cleanly');
  posted.length = 0;
  doc.getElementById(p + '-retlcksts-on').checked = false;
  doc.getElementById(p + '-retlcksts-on').dispatchEvent(new Event('change', { bubbles: true }));
  edit = lastEdit();
  check('RETLCKSTS was removed', !!edit && !/RETLCKSTS/.test(edit.text));

  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

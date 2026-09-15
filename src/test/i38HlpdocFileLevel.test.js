/**
 * i38HlpdocFileLevel.test.js
 *
 * Task I-38 (docs/sda-reference/keywordFixes.md) - HLPDOC was entirely
 * absent from iSDA at the file level (confirmed missing from I-1's own
 * original 39-keyword file-level baseline - I-5 later added 5 more
 * confirmed-missing keywords, but HLPDOC wasn't among those 5 either).
 *
 * Same rationale as i5FileLevelKeywords.test.js: runs the DSPF designer's
 * real generated client-side script in jsdom rather than only exercising
 * the generic dspfWriter.js primitives (getFileFlagKeyword/
 * setFileFlagKeyword already worked for arbitrary keyword names before
 * this task, so testing them alone would prove nothing about whether the
 * File Properties UI actually offers HLPDOC at all). Fails against
 * pre-I-38 code (none of these ids existed) while passing against the fix.
 * Run with: node src/test/i38HlpdocFileLevel.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfWriter = require('../../dist/dspfWriter.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// --- dspfWriter.js-level: hlpdocConflictReason ---
console.log('hlpdocConflictReason: bidirectional mutual-exclusion with HLPPNLGRP/HLPRTN');
{
  const withHlppnlgrp = [{ name: 'HLPPNLGRP', parameters: 'MOD1 LIB/PG1', conditions: [] }];
  check('HLPDOC conflicts when HLPPNLGRP already present', !!DspfWriter.hlpdocConflictReason('HLPDOC', withHlppnlgrp));

  const withHlprtn = [{ name: 'HLPRTN', parameters: '', conditions: [] }];
  check('HLPDOC conflicts when HLPRTN already present', !!DspfWriter.hlpdocConflictReason('HLPDOC', withHlprtn));

  const withHlpdoc = [{ name: 'HLPDOC', parameters: 'LBL1 DOC1 FOLDER1', conditions: [] }];
  check('HLPPNLGRP conflicts when HLPDOC already present (reverse direction)', !!DspfWriter.hlpdocConflictReason('HLPPNLGRP', withHlpdoc));
  check('HLPRTN conflicts when HLPDOC already present (reverse direction)', !!DspfWriter.hlpdocConflictReason('HLPRTN', withHlpdoc));

  check('no conflict when neither is present', !DspfWriter.hlpdocConflictReason('HLPDOC', []));
  check('an unrelated keyword name never reports a conflict', !DspfWriter.hlpdocConflictReason('DSPSIZ', withHlppnlgrp));
}

// --- Real generated webview: File Properties > Help panel ---
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

const posted = [];
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

  console.log('\nsetup: switch to File Properties, then the Help panel');
  const fileCrumb = doc.getElementById('crumb-file');
  check('file breadcrumb is present', !!fileCrumb);
  fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));
  const helpTab = doc.querySelector('.props-tab[data-tab="help"]');
  check('Help tab button is present', !!helpTab);
  helpTab.dispatchEvent(new Event('click', { bubbles: true }));

  console.log('\nHLPDOC: checkbox + label/document/folder fields are present, checkbox drives presence');
  {
    const on = doc.getElementById('fk-hlpdoc-on');
    const label = doc.getElementById('fk-hlpdoc-label');
    const document2 = doc.getElementById('fk-hlpdoc-document');
    const folder = doc.getElementById('fk-hlpdoc-folder');
    check('HLPDOC checkbox + label/document/folder fields are all present', !!on && !!label && !!document2 && !!folder);

    label.value = 'START';
    label.dispatchEvent(new Event('change', { bubbles: true }));
    check('typing a label alone (checkbox still off) does not yet post HLPDOC', !lastEdit() || !/HLPDOC/.test(lastEdit().text));

    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    let edit = lastEdit();
    check('ticking the checkbox posts HLPDOC with the label already typed', edit && /HLPDOC\(START\)/.test(edit.text));
    posted.length = 0;

    document2.value = 'GENERAL.HLP';
    document2.dispatchEvent(new Event('change', { bubbles: true }));
    folder.value = 'HELP.F1';
    folder.dispatchEvent(new Event('change', { bubbles: true }));
    edit = lastEdit();
    check('label/document/folder are all written, space-separated, in order', edit && /HLPDOC\(START GENERAL\.HLP HELP\.F1\)/.test(edit.text));
    posted.length = 0;

    console.log('\nHLPDOC: Conditioning toggle is present (option indicators are valid per IBM\'s own reference)');
    const condToggle = doc.querySelector('.kw-cond-toggle[data-flag-id="fk-hlpdoc"]');
    check('HLPDOC row renders a Conditioning toggle', !!condToggle);

    console.log('\nHLPDOC: turning it on while HLPPNLGRP is already present is blocked');
    on.checked = false;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;

    const hlppnlgrpOn = doc.getElementById('fk-hlppnlgrp-on');
    const hlppnlgrpModule = doc.getElementById('fk-hlppnlgrp-module');
    const hlppnlgrpPanelgroup = doc.getElementById('fk-hlppnlgrp-panelgroup');
    check('HLPPNLGRP fields are present to set up the conflict', !!hlppnlgrpOn && !!hlppnlgrpModule && !!hlppnlgrpPanelgroup);
    hlppnlgrpModule.value = 'MOD1';
    hlppnlgrpModule.dispatchEvent(new Event('change', { bubbles: true }));
    hlppnlgrpPanelgroup.value = 'PG1';
    hlppnlgrpPanelgroup.dispatchEvent(new Event('change', { bubbles: true }));
    hlppnlgrpOn.checked = true;
    hlppnlgrpOn.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;

    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    check('HLPDOC checkbox reverts to unchecked after the blocked attempt', on.checked === false);
    check('no HLPDOC edit was posted while HLPPNLGRP is present', !lastEdit() || !/HLPDOC/.test(lastEdit() ? lastEdit().text : ''));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

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
const DspfWriter = require('../../dist/dspfWriter.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

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

// --- dspfWriter.js-level: hlprcdConflictReason (cross-verify follow-up) ---
console.log('\nhlprcdConflictReason: bidirectional mutual-exclusion with HLPPNLGRP only (not HLPRTN, not HLPDOC)');
{
  const withHlppnlgrp = [{ name: 'HLPPNLGRP', parameters: 'MOD1 LIB/PG1', conditions: [] }];
  check('HLPRCD conflicts when HLPPNLGRP already present', !!DspfWriter.hlprcdConflictReason('HLPRCD', withHlppnlgrp));

  const withHlprcd = [{ name: 'HLPRCD', parameters: 'RECORD1 HELPFILE', conditions: [] }];
  check('HLPPNLGRP conflicts when HLPRCD already present (reverse direction)', !!DspfWriter.hlprcdConflictReason('HLPPNLGRP', withHlprcd));

  const withHlprtn = [{ name: 'HLPRTN', parameters: '', conditions: [] }];
  check('HLPRCD does NOT conflict with HLPRTN (IBM states priority, not prohibition)', !DspfWriter.hlprcdConflictReason('HLPRCD', withHlprtn));

  const withHlpdoc = [{ name: 'HLPDOC', parameters: 'LBL1 DOC1 FOLDER1', conditions: [] }];
  check('HLPRCD does NOT conflict with HLPDOC (IBM never states this pairing is forbidden)', !DspfWriter.hlprcdConflictReason('HLPRCD', withHlpdoc));
  check('...and hlpdocConflictReason agrees from HLPDOC\'s own side too', !DspfWriter.hlpdocConflictReason('HLPDOC', withHlprcd));

  check('no conflict when neither is present', !DspfWriter.hlprcdConflictReason('HLPRCD', []));
  check('an unrelated keyword name never reports a conflict', !DspfWriter.hlprcdConflictReason('DSPSIZ', withHlppnlgrp));
}

// --- Real generated webview: File Properties > Help panel ---
const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
  ].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');

const posted = [];
const dom = newWebviewDom(html, {
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

    console.log('\nCross-verify follow-up: HLPDOC requires all three parts - ticking the checkbox with only the label filled in is blocked, not written incomplete');
    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    check('no HLPDOC was posted with just the label filled in', !posted.some((m) => m.type === 'applyEdit' && /HLPDOC/.test(m.text)));
    check('an alert named the missing parts', /all three parts/i.test(alertMessage || ''));
    check('the checkbox reverted back to unchecked', on.checked === false);
    posted.length = 0;
    alertMessage = null;

    document2.value = 'GENERAL.HLP';
    document2.dispatchEvent(new Event('change', { bubbles: true }));
    folder.value = 'HELP.F1';
    folder.dispatchEvent(new Event('change', { bubbles: true }));
    check('still nothing posted - checkbox is still unchecked', !posted.some((m) => m.type === 'applyEdit' && /HLPDOC/.test(m.text)));

    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    let edit = lastEdit();
    check('ticking the checkbox now that all three parts are filled in posts HLPDOC', edit && /HLPDOC\(START GENERAL\.HLP HELP\.F1\)/.test(edit.text));
    check('no alert was raised for the complete case', alertMessage === null);
    posted.length = 0;

    console.log('\nBlanking a part back out while still checked is blocked too (not just at the moment the checkbox is first ticked)');
    document2.value = '';
    document2.dispatchEvent(new Event('change', { bubbles: true }));
    check('no HLPDOC re-post for the now-incomplete edit', !posted.some((m) => m.type === 'applyEdit'));
    check('an alert was raised again', /all three parts/i.test(alertMessage || ''));
    document2.value = 'GENERAL.HLP';
    document2.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    alertMessage = null;

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

  console.log('\nCross-verify follow-up: HLPRCD sub-fields (record name required; library only valid with a file name)');
  {
    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    const hlprcdOn = doc.getElementById('fk-hlprcd-on');
    const hlprcdRecord = doc.getElementById('fk-hlprcd-record');
    const hlprcdLibrary = doc.getElementById('fk-hlprcd-library');
    const hlprcdFile = doc.getElementById('fk-hlprcd-file');
    check('HLPRCD checkbox + record/library/file fields are all present', !!hlprcdOn && !!hlprcdRecord && !!hlprcdLibrary && !!hlprcdFile);

    console.log('  turning HLPRCD on while HLPPNLGRP is still present (from the HLPDOC scenario above) is blocked');
    hlprcdRecord.value = 'RECORD1';
    hlprcdRecord.dispatchEvent(new Event('change', { bubbles: true }));
    hlprcdOn.checked = true;
    hlprcdOn.dispatchEvent(new Event('change', { bubbles: true }));
    check('HLPRCD checkbox reverts to unchecked - HLPPNLGRP is still present', hlprcdOn.checked === false);
    check('an alert named HLPPNLGRP', /HLPPNLGRP/.test(alertMessage || ''));
    check('no HLPRCD edit was posted', !posted.some((m) => m.type === 'applyEdit' && /HLPRCD/.test(m.text)));
    posted.length = 0;
    alertMessage = null;

    console.log('  clearing HLPPNLGRP so HLPRCD\'s own sub-field checks can be tested in isolation');
    const hlppnlgrpOn2 = doc.getElementById('fk-hlppnlgrp-on');
    hlppnlgrpOn2.checked = false;
    hlppnlgrpOn2.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;

    console.log('  turning HLPRCD on with a blank record name is blocked (record-format-name is required, not bracketed, in HLPRCD\'s own format)');
    hlprcdRecord.value = '';
    hlprcdRecord.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    hlprcdOn.checked = true;
    hlprcdOn.dispatchEvent(new Event('change', { bubbles: true }));
    check('HLPRCD checkbox reverts to unchecked - record name is blank', hlprcdOn.checked === false);
    check('an alert named the record format name requirement', /record format name/i.test(alertMessage || ''));
    check('no HLPRCD edit was posted', !posted.some((m) => m.type === 'applyEdit' && /HLPRCD/.test(m.text)));
    posted.length = 0;
    alertMessage = null;

    console.log('  filling in the record name lets HLPRCD commit on its own (library/file both optional together)');
    hlprcdRecord.value = 'RECORD1';
    hlprcdRecord.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    hlprcdOn.checked = true;
    hlprcdOn.dispatchEvent(new Event('change', { bubbles: true }));
    let edit = lastEdit();
    check('HLPRCD(RECORD1) was posted with just the record name', edit && /HLPRCD\(RECORD1\)/.test(edit.text));
    check('no alert was raised for the valid record-only case', alertMessage === null);
    posted.length = 0;

    console.log('  typing a library WITHOUT a file name is blocked, not silently dropped');
    hlprcdLibrary.value = 'MYLIB';
    hlprcdLibrary.dispatchEvent(new Event('change', { bubbles: true }));
    check('no HLPRCD re-post for the library-without-file edit', !posted.some((m) => m.type === 'applyEdit'));
    check('an alert explained the library-needs-a-file-name rule', /library name only applies together with a file name/i.test(alertMessage || ''));
    alertMessage = null;

    console.log('  filling in the file name too lets library/file commit together');
    hlprcdFile.value = 'HELPFILE';
    hlprcdFile.dispatchEvent(new Event('change', { bubbles: true }));
    edit = lastEdit();
    check('HLPRCD(RECORD1 MYLIB/HELPFILE) was posted', edit && /HLPRCD\(RECORD1 MYLIB\/HELPFILE\)/.test(edit.text));
    check('no alert was raised once the file name was filled in', alertMessage === null);
    posted.length = 0;

    console.log('\nCross-verify follow-up: turning HLPPNLGRP on while HLPRCD is present is blocked (the reverse direction of the check above)');
    const hlppnlgrpOn3 = doc.getElementById('fk-hlppnlgrp-on');
    hlppnlgrpOn3.checked = true;
    hlppnlgrpOn3.dispatchEvent(new Event('change', { bubbles: true }));
    check('HLPPNLGRP checkbox reverts to unchecked - HLPRCD is present', hlppnlgrpOn3.checked === false);
    check('an alert named HLPRCD', /HLPRCD/.test(alertMessage || ''));
    check('no HLPPNLGRP edit was posted', !posted.some((m) => m.type === 'applyEdit' && /HLPPNLGRP/.test(m.text)));
    posted.length = 0;
    alertMessage = null;

    console.log('\nOriginal question answered: HLPRCD and HLPDOC are NOT mutually exclusive per IBM - both can be present at once');
    const hlpdocOn2 = doc.getElementById('fk-hlpdoc-on');
    const hlpdocLabel2 = doc.getElementById('fk-hlpdoc-label');
    const hlpdocDocument2 = doc.getElementById('fk-hlpdoc-document');
    const hlpdocFolder2 = doc.getElementById('fk-hlpdoc-folder');
    hlpdocLabel2.value = 'START';
    hlpdocLabel2.dispatchEvent(new Event('change', { bubbles: true }));
    hlpdocDocument2.value = 'GENERAL.HLP';
    hlpdocDocument2.dispatchEvent(new Event('change', { bubbles: true }));
    hlpdocFolder2.value = 'HELP.F1';
    hlpdocFolder2.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    hlpdocOn2.checked = true;
    hlpdocOn2.dispatchEvent(new Event('change', { bubbles: true }));
    edit = lastEdit();
    check('HLPDOC commits successfully while HLPRCD is still present', edit && /HLPDOC\(START GENERAL\.HLP HELP\.F1\)/.test(edit.text));
    check('the same edit still carries the existing HLPRCD keyword untouched', edit && /HLPRCD\(RECORD1 MYLIB\/HELPFILE\)/.test(edit.text));
    check('no alert was raised - HLPRCD+HLPDOC together is valid DDS', alertMessage === null);
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 0);

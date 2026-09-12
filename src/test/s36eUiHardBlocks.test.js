/**
 * s36eUiHardBlocks.test.js
 *
 * Task S36-4 - wires S36-3's verified rule table (CHANGE/HELP/PRINT's
 * response-indicator restriction under USRDSPMGT, dspfWriter.js's
 * S36E_KEYWORD_RESTRICTIONS) as HARD BLOCKS in the actual running webview
 * script, not just at the pure-dspfWriter.js level (see
 * s36eRestrictions.test.js for that half). Runs the DSPF designer's real
 * generated client-side script in jsdom, same rationale as
 * dspfWebview.test.js - a hard block that only exists in a code comment
 * isn't a hard block; only actually dispatching the DOM events and reading
 * back window.alert calls / posted edits proves the block fires (or
 * doesn't fire when it shouldn't).
 * Run with: node src/test/s36eUiHardBlocks.test.js
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

const posted = [];
const alerts = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (msg) => { alerts.push(msg); };
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  console.log('setup: switch to File Properties (click the file breadcrumb)');
  const fileCrumb = doc.getElementById('crumb-file');
  check('file breadcrumb is present', !!fileCrumb);
  fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));

  const usrdspmgtOn = doc.getElementById('fk-usrdspmgt-on');
  check('USRDSPMGT checkbox is present on the File Properties General panel', !!usrdspmgtOn);

  console.log('\nturning USRDSPMGT on with nothing else set yet succeeds');
  {
    usrdspmgtOn.checked = true;
    usrdspmgtOn.dispatchEvent(new Event('change', { bubbles: true }));
    check('no alert was raised', alerts.length === 0);
    const last = posted[posted.length - 1];
    check('an edit was posted turning USRDSPMGT on', last && last.type === 'applyEdit' && /USRDSPMGT/.test(last.text));
    posted.length = 0;
  }

  console.log('\nfile-level HELP: setting a response indicator while USRDSPMGT is on is hard-blocked');
  {
    // Re-query: the USRDSPMGT commit above re-rendered File Properties.
    const helpOn = doc.getElementById('fk-help-on');
    const helpParams = doc.getElementById('fk-help-params');
    check('setup: HELP row is present', !!helpOn && !!helpParams);

    helpOn.checked = true;
    helpParams.value = '30';
    helpParams.dispatchEvent(new Event('change', { bubbles: true }));

    check('an alert was raised naming the S36E rule', alerts.length === 1 && /response indicator/i.test(alerts[0]) && /HELP/.test(alerts[0]));
    check('the params input was reverted (nothing was actually set before)', helpParams.value === '');
    check('nothing was posted - the block prevented the commit', posted.length === 0);
    alerts.length = 0;
  }

  console.log('\nfile-level PRINT: CORRECTED - the *PGM literal is NOT blocked (valid special value, not a response indicator); a genuine numeric response indicator still is');
  {
    const printOn = doc.getElementById('fk-print-on');
    const printParams = doc.getElementById('fk-print-params');
    check('setup: PRINT row is present', !!printOn && !!printParams);

    printOn.checked = true;
    printParams.value = '*PGM';
    printParams.dispatchEvent(new Event('change', { bubbles: true }));

    check('no alert was raised for *PGM', alerts.length === 0);
    check('the params input kept *PGM', printParams.value === '*PGM');
    const pgmEdit = posted[posted.length - 1];
    check('the edit committed normally', pgmEdit && pgmEdit.type === 'applyEdit' && /PRINT\(\*PGM\)/.test(pgmEdit.text));
    posted.length = 0;

    printParams.value = '31';
    printParams.dispatchEvent(new Event('change', { bubbles: true }));
    check('an alert IS raised for a genuine numeric response indicator', alerts.length === 1 && /PRINT/.test(alerts[0]));
    check('the params input was reverted to *PGM (the last successful commit)', printParams.value === '*PGM');
    check('nothing was posted for the blocked attempt', posted.length === 0);
    alerts.length = 0;

    // Clean up PRINT so later scenarios in this file start from a clean slate.
    printOn.checked = false;
    printOn.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
  }

  console.log('\nfile-level HELP with USRDSPMGT off is NOT blocked (the rule only applies while USRDSPMGT is active)');
  {
    const usrdspmgtOn2 = doc.getElementById('fk-usrdspmgt-on');
    usrdspmgtOn2.checked = false;
    usrdspmgtOn2.dispatchEvent(new Event('change', { bubbles: true }));
    check('turning USRDSPMGT back off is itself never blocked', alerts.length === 0);
    posted.length = 0;

    const helpOn = doc.getElementById('fk-help-on');
    const helpParams = doc.getElementById('fk-help-params');
    helpOn.checked = true;
    helpParams.value = '30';
    helpParams.dispatchEvent(new Event('change', { bubbles: true }));
    check('no alert - USRDSPMGT is off', alerts.length === 0);
    const last = posted[posted.length - 1];
    check('the edit committed normally', last && last.type === 'applyEdit' && /HELP\(30\)/.test(last.text));
    posted.length = 0;
  }

  console.log("\nsymmetric block: turning USRDSPMGT ON is itself blocked while HELP(30) (set just above) already conflicts");
  {
    const usrdspmgtOn3 = doc.getElementById('fk-usrdspmgt-on');
    usrdspmgtOn3.checked = true;
    usrdspmgtOn3.dispatchEvent(new Event('change', { bubbles: true }));

    check('an alert was raised naming HELP and where it lives', alerts.length === 1 && /HELP/.test(alerts[0]) && /File-level/.test(alerts[0]));
    check('the checkbox was reverted to unchecked', usrdspmgtOn3.checked === false);
    check('nothing was posted - USRDSPMGT was never actually turned on', posted.length === 0);
    alerts.length = 0;

    // Clean up HELP so later scenarios in this file start from a clean slate.
    const helpOn = doc.getElementById('fk-help-on');
    helpOn.checked = false;
    helpOn.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
  }

  console.log('\nrecord-level PRINT: same hard block as the file-level row, once USRDSPMGT is on');
  {
    const usrdspmgtOn4 = doc.getElementById('fk-usrdspmgt-on');
    usrdspmgtOn4.checked = true;
    usrdspmgtOn4.dispatchEvent(new Event('change', { bubbles: true }));
    check('setup: USRDSPMGT turned on cleanly (nothing conflicting left over)', alerts.length === 0);
    posted.length = 0;

    const recordCrumb = doc.getElementById('crumb-record');
    check('setup: record breadcrumb is present', !!recordCrumb);
    recordCrumb.dispatchEvent(new Event('click', { bubbles: true }));

    const recPrintOn = doc.getElementById('rk-SCR1-print-on');
    const recPrintParams = doc.getElementById('rk-SCR1-print-params');
    check('setup: record-level PRINT row is present', !!recPrintOn && !!recPrintParams);

    recPrintOn.checked = true;
    recPrintParams.value = '40';
    recPrintParams.dispatchEvent(new Event('change', { bubbles: true }));

    check('an alert was raised naming PRINT', alerts.length === 1 && /PRINT/.test(alerts[0]));
    check('the params input was reverted', recPrintParams.value === '');
    check('nothing was posted', posted.length === 0);
    alerts.length = 0;
  }

  console.log('\nrecord-level indicator instances (Indicator tab): CHANGE\'s response indicator is hard-blocked, but a non-restricted kind (e.g. CLEAR) is not');
  {
    const addBtn = doc.querySelector('.repeat-inst-add[data-prefix="rk-SCR1-recind-rep"]');
    check('setup: "+ Add indicator keyword" button is present', !!addBtn);
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const kindEl = doc.querySelector('.rk-SCR1-recind-rep-inst0-kind');
    let respEl = doc.querySelector('.rk-SCR1-recind-rep-inst0-resp');
    check('setup: the new instance row has a kind selector and a response-indicator input', !!kindEl && !!respEl);
    check('setup: a fresh instance defaults to CLEAR with a non-blank response indicator', kindEl.value === 'CLEAR' && respEl.value !== '');
    posted.length = 0;

    console.log('  editing the response indicator while kind stays CLEAR is never blocked (CLEAR is not a restricted kind)');
    respEl.value = '20';
    respEl.dispatchEvent(new Event('change', { bubbles: true }));
    check('no alert', alerts.length === 0);
    const afterClearEdit = posted[posted.length - 1];
    check('the edit committed normally', afterClearEdit && afterClearEdit.type === 'applyEdit' && /CLEAR\(20\)/.test(afterClearEdit.text));
    posted.length = 0;

    console.log('  switching kind to CHANGE while a response indicator is already set (20) is hard-blocked');
    // Re-query: the CLEAR(20) commit above re-rendered the record props panel.
    const kindEl2 = doc.querySelector('.rk-SCR1-recind-rep-inst0-kind');
    respEl = doc.querySelector('.rk-SCR1-recind-rep-inst0-resp');
    kindEl2.value = 'CHANGE';
    kindEl2.dispatchEvent(new Event('change', { bubbles: true }));
    check('an alert was raised naming CHANGE', alerts.length === 1 && /CHANGE/.test(alerts[0]));
    check('the kind select was reverted back to CLEAR', kindEl2.value === 'CLEAR');
    check('the response-indicator input is unchanged (still 20)', respEl.value === '20');
    check('nothing was posted', posted.length === 0);
    alerts.length = 0;
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

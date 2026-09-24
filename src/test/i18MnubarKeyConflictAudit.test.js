/**
 * i18MnubarKeyConflictAudit.test.js
 *
 * Task I-18 - MNUBARSW/MNUCNL mutual CA-key exclusion guard. Both
 * keywords' own DDS Reference sections state the same rule from each
 * side ("the CAnn key specified by the MNUBARSW keyword cannot be
 * specified again using another keyword (such as MNUCNL)", and the
 * mirror statement under MNUCNL naming MNUBARSW), and both go on to say
 * the file-level form "extends to all records in the file" - so the
 * scope spans file-level AND every individual record's own copy, not
 * just a same-record check (see DspfWriter.mnuBarKeyConflictReason's own
 * doc comment). This test confirms the fix at every scope combination:
 * same-record, file-level-vs-record-level (both directions), and that
 * turning either keyword off (or choosing a non-colliding CA key) is
 * never blocked.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i18MnubarKeyConflictAudit.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R MENUBAR                    MNUBAR',
    "     A                                  1  2'Choice'",
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN SCREEN'",
  ].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');

let posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({
      getState: () => null,
      setState: () => {},
      postMessage: (m) => posted.push(m),
    });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  function withAlertCapture(fn) {
    const originalAlert = dom.window.alert;
    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    fn();
    dom.window.alert = originalAlert;
    return alertMessage;
  }

  function setCheckboxAndCakey(onId, cakeyId, checked, cakeyVal) {
    const onEl = doc.getElementById(onId);
    const cakeyEl = doc.getElementById(cakeyId);
    onEl.checked = checked;
    if (cakeyVal !== undefined) cakeyEl.value = cakeyVal;
    // The commit fires off whichever field the user actually touched;
    // the checkbox's own 'change' listener is enough to commit both.
    onEl.dispatchEvent(new Event('change', { bubbles: true }));
    return { onEl, cakeyEl };
  }

  // --- File-level: crumb-file opens File Properties (all category panels
  // render into the DOM regardless of which tab is active - see
  // i3ConditioningAudit.test.js's own precedent for this). ---
  const fileCrumb = doc.getElementById('crumb-file');
  check('setup: the File breadcrumb is present', !!fileCrumb);
  fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));

  const fkSwOn = doc.getElementById('fk-mnubarsw-on');
  const fkSwCakey = doc.getElementById('fk-mnubarsw-cakey');
  const fkCnlOn = doc.getElementById('fk-mnucnl-on');
  const fkCnlCakey = doc.getElementById('fk-mnucnl-cakey');
  check('setup: file-level MNUBARSW checkbox/CA-key box present', !!fkSwOn && !!fkSwCakey);
  check('setup: file-level MNUCNL checkbox/CA-key box present', !!fkCnlOn && !!fkCnlCakey);

  console.log('\nfile-level: turning MNUBARSW on with a blank CA key (default CA10) commits normally (nothing else present yet)');
  posted.length = 0;
  setCheckboxAndCakey('fk-mnubarsw-on', 'fk-mnubarsw-cakey', true, '');
  {
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('MNUBARSW commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text);
    check('file-level MNUBARSW actually present in the rewritten DDS', !!reparsed && reparsed.fileKeywords.some((k) => k.name === 'MNUBARSW'));
  }

  console.log('\nfile-level: MNUCNL(CA10) is blocked once file-level MNUBARSW\'s default CA10 is active (same-level collision)');
  posted.length = 0;
  {
    const alertMessage = withAlertCapture(function () {
      setCheckboxAndCakey('fk-mnucnl-on', 'fk-mnucnl-cakey', true, 'CA10');
    });
    check('blocked with an alert naming CA10 and MNUBARSW', /CA10/.test(alertMessage || '') && /MNUBARSW/.test(alertMessage || ''));
    check('MNUCNL checkbox reverted back off', doc.getElementById('fk-mnucnl-on').checked === false);
    check('no applyEdit was posted for the blocked attempt', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('\nfile-level: MNUCNL(CA12) - a non-colliding CA key - commits normally');
  posted.length = 0;
  setCheckboxAndCakey('fk-mnucnl-on', 'fk-mnucnl-cakey', true, 'CA12');
  {
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('MNUCNL(CA12) commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text);
    check('file-level MNUCNL actually present in the rewritten DDS', !!reparsed && reparsed.fileKeywords.some((k) => k.name === 'MNUCNL'));
  }

  // --- Record-level (MENUBAR record's own MNUBAR tab): file-level values
  // extend to it, per both keywords' own DDS Reference text. ---
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'MENUBAR';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  const rP = 'mnubar-MENUBAR';

  const rSwOn = doc.getElementById(rP + '-mnubarsw-on');
  const rSwCakey = doc.getElementById(rP + '-mnubarsw-cakey');
  const rCnlOn = doc.getElementById(rP + '-mnucnl-on');
  const rCnlCakey = doc.getElementById(rP + '-mnucnl-cakey');
  check('setup: record-level MNUBARSW checkbox/CA-key box present on MENUBAR', !!rSwOn && !!rSwCakey);
  check('setup: record-level MNUCNL checkbox/CA-key box present on MENUBAR', !!rCnlOn && !!rCnlCakey);

  console.log('\nrecord-level: MNUBARSW(CA12) on MENUBAR is blocked by the FILE-level MNUCNL(CA12) set above (extends to every record)');
  posted.length = 0;
  {
    const alertMessage = withAlertCapture(function () {
      setCheckboxAndCakey(rP + '-mnubarsw-on', rP + '-mnubarsw-cakey', true, 'CA12');
    });
    check('blocked with an alert naming CA12 and file-level MNUCNL', /CA12/.test(alertMessage || '') && /file-level/.test(alertMessage || '') && /MNUCNL/.test(alertMessage || ''));
    check('record-level MNUBARSW checkbox reverted back off', doc.getElementById(rP + '-mnubarsw-on').checked === false);
    check('no applyEdit was posted for the blocked attempt', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('\nrecord-level: MNUBARSW(CA15) on MENUBAR - a non-colliding CA key - commits normally');
  posted.length = 0;
  setCheckboxAndCakey(rP + '-mnubarsw-on', rP + '-mnubarsw-cakey', true, 'CA15');
  {
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('record-level MNUBARSW(CA15) commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'MENUBAR');
    check('record-level MNUBARSW actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'MNUBARSW'));
  }

  console.log('\nrecord-level: MNUCNL(CA15) on MENUBAR is blocked by that SAME record\'s own MNUBARSW(CA15) just committed (same-record collision)');
  posted.length = 0;
  {
    const alertMessage = withAlertCapture(function () {
      setCheckboxAndCakey(rP + '-mnucnl-on', rP + '-mnucnl-cakey', true, 'CA15');
    });
    check('blocked with an alert naming CA15 and MNUBARSW', /CA15/.test(alertMessage || '') && /MNUBARSW/.test(alertMessage || ''));
    check('record-level MNUCNL checkbox reverted back off', doc.getElementById(rP + '-mnucnl-on').checked === false);
    check('no applyEdit was posted for the blocked attempt', !posted.some((m) => m.type === 'applyEdit'));
  }

  console.log('\nrecord-level: MNUCNL(CA20) on MENUBAR - a non-colliding CA key - commits normally');
  posted.length = 0;
  setCheckboxAndCakey(rP + '-mnucnl-on', rP + '-mnucnl-cakey', true, 'CA20');
  {
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('record-level MNUCNL(CA20) commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'MENUBAR');
    check('record-level MNUCNL actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === 'MNUCNL'));
  }

  console.log('\nrecord-level: turning MNUBARSW back off is never blocked, even though a colliding-looking state exists elsewhere');
  posted.length = 0;
  {
    const alertMessage = withAlertCapture(function () {
      setCheckboxAndCakey(rP + '-mnubarsw-on', rP + '-mnubarsw-cakey', false, undefined);
    });
    check('turning MNUBARSW off triggers no alert', alertMessage === null);
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('MNUBARSW-off commits normally (edit posted)', !!applyEdit);
    const reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'MENUBAR');
    check('record-level MNUBARSW actually removed from the rewritten DDS', !!reparsed && !reparsed.keywords.some((k) => k.name === 'MNUBARSW'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 100);

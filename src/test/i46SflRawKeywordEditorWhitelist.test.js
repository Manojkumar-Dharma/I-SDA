/**
 * i46SflRawKeywordEditorWhitelist.test.js
 *
 * Task I-46 - re-read SFL's and SFLCTL's own DDS Reference sections fresh
 * (split off from I-44's original USRDFN finding). SFL's own section
 * states outright: "Besides SFL, the following keywords are also valid on
 * the subfile record format:" followed by a closed, enumerated list - the
 * exact same shape as USRDFN's own "except" whitelist (see
 * DspfWriter.sflWhitelistConflictReason's own doc comment for the full
 * citation). SFLCTL's own section, by contrast, introduces its keyword
 * tables as "a summary of SUBFILE keywords" - explicitly scoped, not a
 * blanket exclusion of ordinary DDS keywords - and its one individual
 * restriction ("USRDFN is not valid for the subfile-control record
 * format") is already structurally unreachable (USRDFN/SFL/SFLCTL are
 * each their own record TYPE the "+ Add record" wizard picks once).
 *
 * Fix: same catch-all shape I-49 built for USRDFN - wireKeywordEditor's
 * existing addGuardFn(name, params) hook, at the SAME record-level call
 * site, now also consults DspfWriter.sflWhitelistConflictReason. An
 * exhaustive sweep of the structured per-keyword checkboxes across the
 * General/Indicator/Output/Input/Overlay/Print tabs (the way I-44
 * individually rewired 29 USRDFN call sites) is logged separately as
 * I-52, not attempted here.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i46SflRawKeywordEditorWhitelist.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SFLREC                     SFL',
    '     A          R SFLMSGREC                  SFL',
    '     A                                       SFLMSGRCD(SFLREC)',
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

  function selectRecord(name) {
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = name;
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function reparsedRecord(text, recordName) {
    return DspfParser.parseDspf(text).records.find((r) => r.name === recordName);
  }

  function addRawKeyword(ownerKey, name, params) {
    const nameInput = doc.getElementById(ownerKey + '-new-kw-name');
    const paramsInput = doc.getElementById(ownerKey + '-new-kw-params');
    const addBtn = doc.querySelector('.kw-add[data-owner="' + ownerKey + '"]');
    nameInput.value = name;
    paramsInput.value = params || '';
    posted.length = 0;
    let alertMessage = null;
    const originalAlert = dom.window.alert;
    dom.window.alert = (msg) => { alertMessage = msg; };
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    dom.window.alert = originalAlert;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }

  // === Group A: non-whitelisted keywords are blocked on a plain SFL record ===
  selectRecord('SFLREC');
  const sOwner = 'record-SFLREC';
  console.log('\nSFL record: raw editor blocks a non-whitelisted keyword add');
  ['RETKEY', 'DSPATR', 'BLINK', 'USRDSPMGT'].forEach(function (name) {
    const result = addRawKeyword(sOwner, name);
    check(name + ' blocked with an alert naming subfile (SFL)', !!result.alertMessage && result.alertMessage.indexOf('subfile (SFL)') !== -1);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !result.applyEdit);
  });

  // === Group B: whitelisted keywords still add normally on a plain SFL record ===
  console.log('\nSFL record: raw editor still allows whitelisted keywords through');
  ['LOGINP', 'SETOF', 'TEXT'].forEach(function (name) {
    const result = addRawKeyword(sOwner, name, name === 'TEXT' ? "'a description'" : '');
    check(name + ' (whitelisted) commits normally on an SFL record', !!result.applyEdit);
    const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'SFLREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  // === Group C: message-subfile (SFL + SFLMSGRCD) gets its own narrower whitelist ===
  selectRecord('SFLMSGREC');
  const mOwner = 'record-SFLMSGREC';
  console.log('\nmessage-subfile record: even the plain-SFL whitelist keywords are blocked');
  ['LOGINP', 'SETOF', 'TEXT', 'KEEP'].forEach(function (name) {
    const result = addRawKeyword(mOwner, name);
    check(name + ' blocked on a message-subfile record with an alert naming SFLMSGRCD', !!result.alertMessage && result.alertMessage.indexOf('SFLMSGRCD') !== -1);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !result.applyEdit);
  });

  // === Group D: no regression - a non-SFL record's raw editor is unaffected ===
  console.log('\nnon-SFL record: raw editor is completely unaffected (no guard wired there)');
  selectRecord('PLAINREC');
  const pOwner = 'record-PLAINREC';
  ['DSPATR', 'BLINK'].forEach(function (name) {
    const result = addRawKeyword(pOwner, name);
    check(name + ' commits normally on a non-SFL record', !!result.applyEdit);
    check('no alert fired for ' + name + ' on a non-SFL record', !result.alertMessage);
    const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'PLAINREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

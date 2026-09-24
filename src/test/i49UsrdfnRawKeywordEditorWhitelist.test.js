/**
 * i49UsrdfnRawKeywordEditorWhitelist.test.js
 *
 * Task I-49 - the one remaining way a USRDFN record could end up carrying
 * a keyword outside its own DDS-Reference whitelist (INVITE, KEEP,
 * PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, TEXT - see
 * DspfWriter.usrdfnWhitelistConflictReason's own doc comment): the
 * Advanced/raw keywords accordion (keywordEditorHtml/wireKeywordEditor),
 * a generic add-any-keyword-by-name editor rendered unconditionally for
 * every record regardless of type, and not wired through simple()/
 * wirePulldownGuardedFlag()/wireTwoField() at all - so none of I-8's or
 * I-44's guards ever touched it. Confirmed present (found during I-44's
 * own audit, logged as this task) via a live DOM check that the
 * accordion still renders for a USRDFN record even though the Indicator/
 * Output/Input/Overlay tabs are hidden entirely (Task R2).
 *
 * Fix: wireKeywordEditor gained an optional trailing addGuardFn(name,
 * params) param, checked only in the "+ Add keyword" handler, wired at
 * the record-level call site (renderRecordProps) to
 * DspfWriter.usrdfnWhitelistConflictReason - the first caller to actually
 * consult USRDFN's whitelist text directly, rather than a single
 * individually-confirmed-not-whitelisted keyword name like every prior
 * USRDFN guard. File/field/help-entry keyword editors omit the guard and
 * are unaffected (Group C below).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i49UsrdfnRawKeywordEditorWhitelist.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R USRREC                     USRDFN',
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

  // === Group A: non-whitelisted keywords are blocked on a USRDFN record ===
  selectRecord('USRREC');
  const uOwner = 'record-USRREC';
  console.log('\nUSRDFN record: raw editor blocks a non-whitelisted keyword add');
  ['RETKEY', 'DSPATR', 'BLINK', 'CHANGE'].forEach(function (name) {
    const result = addRawKeyword(uOwner, name);
    check(name + ' blocked with an alert naming USRDFN', !!result.alertMessage && result.alertMessage.indexOf('USRDFN') !== -1);
    check('no applyEdit was posted for the blocked ' + name + ' attempt', !result.applyEdit);
  });

  // === Group B: whitelisted keywords still add normally on a USRDFN record ===
  console.log('\nUSRDFN record: raw editor still allows whitelisted keywords through');
  ['KEEP', 'HLPCLR', 'OPENPRT'].forEach(function (name) {
    const result = addRawKeyword(uOwner, name);
    check(name + ' (whitelisted) commits normally on a USRDFN record', !!result.applyEdit);
    const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'USRREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  // === Group C: no regression - a non-USRDFN record's raw editor is unaffected ===
  console.log('\nnon-USRDFN record: raw editor is completely unaffected (no guard wired there)');
  selectRecord('PLAINREC');
  const pOwner = 'record-PLAINREC';
  ['DSPATR', 'BLINK'].forEach(function (name) {
    const result = addRawKeyword(pOwner, name);
    check(name + ' commits normally on a non-USRDFN record', !!result.applyEdit);
    check('no alert fired for ' + name + ' on a non-USRDFN record', !result.alertMessage);
    const reparsed = result.applyEdit && reparsedRecord(result.applyEdit.text, 'PLAINREC');
    check(name + ' actually present in the rewritten DDS', !!reparsed && reparsed.keywords.some((k) => k.name === name));
  });

  // === Group D: no regression - file-level raw keyword editor is unguarded ===
  console.log('\nfile-level raw keyword editor is unaffected (guard only wired at the record level)');
  {
    const fileCrumb = doc.getElementById('crumb-file');
    check('setup: File crumb is present', !!fileCrumb);
    if (fileCrumb) fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));
    const nameInput = doc.getElementById('file-new-kw-name');
    check('setup: file-level raw editor add-name input is present', !!nameInput);
    if (nameInput) {
      const result = addRawKeyword('file', 'INDARA');
      check('INDARA commits normally at the file level', !!result.applyEdit);
    }
  }

  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

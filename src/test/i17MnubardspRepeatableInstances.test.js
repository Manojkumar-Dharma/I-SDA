/**
 * i17MnubardspRepeatableInstances.test.js
 *
 * Task I-17 - MNUBARDSP's own documented repeatability ("Option
 * indicators are valid for the MNUBARDSP keyword, and more than one
 * MNUBARDSP keyword can be specified on the record if all are
 * optioned...") was flagged by I-14's own audit as not modeled by Task
 * L76/I-4's single-instance fix. This replaces that single-instance row
 * (one getFileFlagKeyword/getMnubardspFields pair) with a repeatable,
 * independently-conditioned instance list built on the same generic
 * DspfWriter.getRepeatableKeywordInstances/setRepeatableKeywordInstances
 * primitive moubtnPanelHtml/wireMoubtnPanel already use for MOUBTN (see
 * mnubardspPanelHtml/wireMnubardspPanel's own doc comment in
 * webviewClientHelpers.js).
 *
 * Covers both of MNUBARDSP's mutually-exclusive parameter shapes:
 *  - on a plain (non-MNUBAR) record: 2 required + 1 optional trailing
 *    name (menu-bar record / choice field / pull-down input field)
 *  - on a MNUBAR record itself: a single optional pull-down-input name
 *
 * Runs the DSPF designer's real generated client-side script in jsdom
 * (same rationale as i14MnubarConditioningAudit.test.js).
 * Run with: node src/test/i17MnubardspRepeatableInstances.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    // Task I-152: MNUBARDSP now needs real menu-bar records (BAR1, BAR2) and
    // hidden choice (2Y0) / pull-down-input (2S0) fields on the record, so
    // the fixture carries them; and several instances must all be optioned,
    // so the test conditions each one before filling the next.
    '     A          R APPSCR',
    '     A            APPFLD         5A  B 1  2',
    '     A            MNUFLD         2Y 0H',
    '     A            MNUFLD2        2Y 0H',
    '     A            PULLFLD        2S 0H',
    '     A          R BAR1                       MNUBAR',
    '     A            MNUFLD         2Y 0B 3  2',
    "     A                                      MNUBARCHC(1 PULLFILE '>File')",
    '     A            PULLIN         2S 0H',
    // A second hidden pull-down field, so the "typed with its &" step below names a real field.
    '     A            PULLIN2        2S 0H',
    '     A          R BAR2                       MNUBAR',
    '     A            MNUFLD         2Y 0B 3  2',
    "     A                                      MNUBARCHC(1 PULLFILE '>Edit')",
  ].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');

const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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

  function latestRecord(name) {
    const applyEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    return DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === name);
  }

  console.log('\nnon-MNUBAR record (APPSCR): MNUBARDSP repeatable list starts empty');
  selectRecord('APPSCR');
  const rkAppscr = 'rk-APPSCR-mnubardsp-rep';
  check('empty-state shown, no instances yet', doc.getElementById(rkAppscr + '-instances').textContent.indexOf('None defined.') >= 0);

  console.log('\nclicking "+ Add" seeds one blank instance, rendered with the 3-name (rec/choice/pull) row - not the MNUBAR-record\u2019s single-field row');
  posted.length = 0;
  doc.querySelector('.repeat-inst-add[data-prefix="' + rkAppscr + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  let applyEdit = posted.find((m) => m.type === 'applyEdit');
  check('an edit was posted for the new instance', !!applyEdit);
  let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'APPSCR');
  check('MNUBARDSP was added (blank parameters, present regardless)', reparsed.keywords.some((k) => k.name === 'MNUBARDSP'));
  check('blank instance does NOT vanish on re-render (still exactly one)', reparsed.keywords.filter((k) => k.name === 'MNUBARDSP').length === 1);
  posted.length = 0;

  const inst0 = rkAppscr + '-inst0';
  check('3-name row rendered (rec input present)', !!doc.querySelector('.' + inst0 + '-rec'));
  check('3-name row rendered (choice-field input present)', !!doc.querySelector('.' + inst0 + '-chc'));
  check('3-name row rendered (pull-down input present)', !!doc.querySelector('.' + inst0 + '-pull'));

  console.log('\nfilling in the 3-name row commits MNUBARDSP(menu-bar-record choice-field) - pull-down left blank, trailing blank dropped');
  doc.querySelector('.' + inst0 + '-rec').value = 'BAR1';
  doc.querySelector('.' + inst0 + '-rec').dispatchEvent(new Event('change', { bubbles: true }));
  doc.querySelector('.' + inst0 + '-chc').value = 'MNUFLD';
  doc.querySelector('.' + inst0 + '-chc').dispatchEvent(new Event('change', { bubbles: true }));
  reparsed = latestRecord('APPSCR');
  const mnubardsp0 = reparsed.keywords.find((k) => k.name === 'MNUBARDSP');
  // Task I-158: the reference form is MNUBARDSP(menu-bar-record &choice-field [&pull-down-input]).
  check('MNUBARDSP written as "BAR1 &MNUFLD" (the & on the choice field, no trailing blank)', mnubardsp0.parameters.trim() === 'BAR1 &MNUFLD');
  check('...and the choice input still shows the bare name', doc.querySelector('.' + inst0 + '-chc').value === 'MNUFLD');
  posted.length = 0;

  console.log('\nconditioning instance 0 (while it is the only one), then adding a SECOND, independently-conditioned instance - the behavior I-14 flagged as unmodeled');
  const condOnRow = (idx, number) => {
    const pfx = rkAppscr + '-inst' + idx;
    // The accordion's open state follows the row INDEX, and conditioning reorders rows, so
    // an index can already be open; only click the toggle when it is closed.
    if (!doc.querySelector('.cond-add-group[data-prefix="' + pfx + '"]')) {
      doc.querySelector('.repeat-inst-cond-toggle[data-prefix="' + rkAppscr + '"][data-idx="' + idx + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    }
    const addBtn = doc.querySelector('.cond-add-group[data-prefix="' + pfx + '"]');
    check('setup: Conditioning accordion for instance ' + idx + ' expanded', !!addBtn);
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = number;
    doc.querySelector('.cond-ind-add[data-prefix="' + pfx + '"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
  };
  const recInputs = () => Array.from(doc.querySelectorAll('[class$="-rec"]')).filter((el) => el.className.indexOf(rkAppscr + '-inst') === 0);
  condOnRow(0, '30');
  reparsed = latestRecord('APPSCR');
  const afterFirstCond = reparsed.keywords.find((k) => k.name === 'MNUBARDSP');
  check('instance 0 (BAR1 &MNUFLD) is now conditioned on indicator 30', afterFirstCond.parameters.trim() === 'BAR1 &MNUFLD' && afterFirstCond.conditions.length === 1 && afterFirstCond.conditions[0].indicators[0].number === '30');
  posted.length = 0;

  doc.querySelector('.repeat-inst-add[data-prefix="' + rkAppscr + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'APPSCR');
  check('a second MNUBARDSP now exists (a blank placeholder is not yet an instance in effect)', reparsed.keywords.filter((k) => k.name === 'MNUBARDSP').length === 2);
  posted.length = 0;

  // The blank row is the one whose record input is empty; its index can differ from the typing order.
  const blankIdx = recInputs().find((el) => el.value === '').className.match(/-inst(\d+)-rec$/)[1];
  condOnRow(blankIdx, '31');
  const inst1 = rkAppscr + '-inst' + blankIdx;
  doc.querySelector('.' + inst1 + '-rec').value = 'BAR2';
  doc.querySelector('.' + inst1 + '-rec').dispatchEvent(new Event('change', { bubbles: true }));
  doc.querySelector('.' + inst1 + '-chc').value = 'MNUFLD2';
  doc.querySelector('.' + inst1 + '-chc').dispatchEvent(new Event('change', { bubbles: true }));
  doc.querySelector('.' + inst1 + '-pull').value = 'PULLFLD';
  doc.querySelector('.' + inst1 + '-pull').dispatchEvent(new Event('change', { bubbles: true }));
  reparsed = latestRecord('APPSCR');
  const mnubardspInsts = reparsed.keywords.filter((k) => k.name === 'MNUBARDSP');
  const bar1Inst = mnubardspInsts.find((k) => k.parameters.trim() === 'BAR1 &MNUFLD');
  const bar2Inst = mnubardspInsts.find((k) => k.parameters.trim() === 'BAR2 &MNUFLD2 &PULLFLD');
  check('first instance (\"BAR1 &MNUFLD\") untouched by editing the second, still on indicator 30', !!bar1Inst && bar1Inst.conditions.length === 1 && bar1Inst.conditions[0].indicators[0].number === '30');
  check('second instance written with all 3 names (\"BAR2 &MNUFLD2 &PULLFLD\") and its own indicator 31', !!bar2Inst && bar2Inst.conditions.length === 1 && bar2Inst.conditions[0].indicators[0].number === '31');
  posted.length = 0;

  console.log('\nremoving one instance leaves the other intact');
  // Task I-14/I-17's own pre-existing writer characteristic (confirmed
  // also true of the base record-indicator-instance list this reuses the
  // same primitive from - see dspfWebview.test.js's own indicator-tab
  // scenario, which matches by content rather than position for the same
  // reason): once one of several same-named repeatable instances becomes
  // conditioned, round-tripping through applyRecordUpdate + re-parse can
  // change which physical source line - and therefore which array INDEX
  // - each instance re-parses back into (a conditioned instance and an
  // unconditioned one don't serialize to the same kind of source line).
  // So which on-screen row is "instance 0" vs "instance 1" after the
  // conditioning commit above isn't guaranteed to match the order they
  // were typed in - the row to remove is found by its own CURRENT field
  // value, not assumed to still be at data-idx="1".
  const bar2RowIdx = Array.from(doc.querySelectorAll('[class$="-rec"]'))
    .filter((el) => el.className.indexOf(rkAppscr + '-inst') === 0)
    .find((el) => el.value === 'BAR2');
  const bar2Idx = bar2RowIdx.className.match(/-inst(\d+)-rec$/)[1];
  doc.querySelector('.repeat-inst-remove[data-prefix="' + rkAppscr + '"][data-idx="' + bar2Idx + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  reparsed = latestRecord('APPSCR');
  const afterRemove = reparsed.keywords.filter((k) => k.name === 'MNUBARDSP');
  check('exactly one MNUBARDSP remains', afterRemove.length === 1);
  check('the remaining one is BAR1 &MNUFLD, still conditioned on 30', afterRemove[0].parameters.trim() === 'BAR1 &MNUFLD' && afterRemove[0].conditions.length === 1 && afterRemove[0].conditions[0].indicators[0].number === '30');
  posted.length = 0;

  console.log('\nMNUBAR record (BAR1) itself: the SAME row renders the single pull-down-input shape, not the 3-name one');
  selectRecord('BAR1');
  const rkBar1 = 'rk-BAR1-mnubardsp-rep';
  check('empty-state shown, no instances yet', doc.getElementById(rkBar1 + '-instances').textContent.indexOf('None defined.') >= 0);
  doc.querySelector('.repeat-inst-add[data-prefix="' + rkBar1 + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  check('an edit was posted for the new instance', !!applyEdit);
  reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'BAR1');
  check('MNUBARDSP was added to BAR1 too (blank parameters - bare MNUBARDSP is valid here)', reparsed.keywords.some((k) => k.name === 'MNUBARDSP'));
  posted.length = 0;

  const bar1Inst0 = rkBar1 + '-inst0';
  check('single pull-down-field input rendered', !!doc.querySelector('.' + bar1Inst0 + '-pull'));
  check('the 3-name rec/choice inputs are NOT rendered on a MNUBAR record', !doc.querySelector('.' + bar1Inst0 + '-rec') && !doc.querySelector('.' + bar1Inst0 + '-chc'));

  doc.querySelector('.' + bar1Inst0 + '-pull').value = 'PULLIN';
  doc.querySelector('.' + bar1Inst0 + '-pull').dispatchEvent(new Event('change', { bubbles: true }));
  reparsed = latestRecord('BAR1');
  check('MNUBARDSP written as just "&PULLIN" (single-name shape, no record/choice names)', reparsed.keywords.find((k) => k.name === 'MNUBARDSP').parameters.trim() === '&PULLIN');
  check('...the input still shows the bare name', doc.querySelector('.' + bar1Inst0 + '-pull').value === 'PULLIN');
  // Typed WITH the & is accepted and not doubled. The panel re-renders after a
  // commit, so each further edit waits for it (the second edit would otherwise
  // be typed into an input about to be replaced).
  setTimeout(() => {
    const pull = () => doc.querySelector('.' + bar1Inst0 + '-pull');
    pull().value = '&PULLIN2';
    pull().dispatchEvent(new Event('change', { bubbles: true }));
    reparsed = latestRecord('BAR1');
    check('a pull-down name typed with its & is written once ("&PULLIN2"), not doubled', reparsed.keywords.find((k) => k.name === 'MNUBARDSP').parameters.trim() === '&PULLIN2');
    setTimeout(() => {
      pull().value = '';
      pull().dispatchEvent(new Event('change', { bubbles: true }));
      reparsed = latestRecord('BAR1');
      check('clearing the pull-down name writes no stray & (bare MNUBARDSP)', reparsed.keywords.find((k) => k.name === 'MNUBARDSP').parameters.trim() === '');
      console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
      process.exit(failureCount() === 0 ? 0 : 1);
    }, 50);
  }, 50);
}, 0);

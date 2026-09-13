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
    '     A          R APPSCR',
    '     A            APPFLD         5A  B 1  2',
    '     A          R BAR1                       MNUBAR',
    '     A            MNUFLD         2Y 0B 3  2',
    "     A                                      MNUBARCHC(1 PULLFILE '>File')",
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
  check('MNUBARDSP written as "BAR1 MNUFLD" (no trailing blank)', mnubardsp0.parameters.trim() === 'BAR1 MNUFLD');
  posted.length = 0;

  console.log('\nadding a SECOND, independently-conditioned MNUBARDSP instance on the same record - the exact behavior I-14 flagged as unmodeled');
  doc.querySelector('.repeat-inst-add[data-prefix="' + rkAppscr + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  applyEdit = posted.find((m) => m.type === 'applyEdit');
  reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'APPSCR');
  check('a second MNUBARDSP now exists', reparsed.keywords.filter((k) => k.name === 'MNUBARDSP').length === 2);
  posted.length = 0;

  const inst1 = rkAppscr + '-inst1';
  doc.querySelector('.' + inst1 + '-rec').value = 'BAR2';
  doc.querySelector('.' + inst1 + '-rec').dispatchEvent(new Event('change', { bubbles: true }));
  doc.querySelector('.' + inst1 + '-chc').value = 'MNUFLD2';
  doc.querySelector('.' + inst1 + '-chc').dispatchEvent(new Event('change', { bubbles: true }));
  doc.querySelector('.' + inst1 + '-pull').value = 'PULLFLD';
  doc.querySelector('.' + inst1 + '-pull').dispatchEvent(new Event('change', { bubbles: true }));
  reparsed = latestRecord('APPSCR');
  const mnubardspInsts = reparsed.keywords.filter((k) => k.name === 'MNUBARDSP');
  check('first instance ("BAR1 MNUFLD") untouched by editing the second', mnubardspInsts.some((k) => k.parameters.trim() === 'BAR1 MNUFLD'));
  check('second instance written with all 3 names ("BAR2 MNUFLD2 PULLFLD")', mnubardspInsts.some((k) => k.parameters.trim() === 'BAR2 MNUFLD2 PULLFLD'));
  posted.length = 0;

  console.log('\nconditioning one instance leaves the other\u2019s conditioning (none) untouched - independently-conditioned, not a shared toggle');
  doc.querySelector('.repeat-inst-cond-toggle[data-prefix="' + rkAppscr + '"][data-idx="0"]').dispatchEvent(new Event('click', { bubbles: true }));
  const condAddBtn = doc.querySelector('.cond-add-group[data-prefix="' + inst0 + '"]');
  check('setup: Conditioning accordion for instance 0 expanded', !!condAddBtn);
  condAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
  doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = '30';
  doc.querySelector('.cond-ind-add[data-prefix="' + inst0 + '"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
  reparsed = latestRecord('APPSCR');
  const afterCond = reparsed.keywords.filter((k) => k.name === 'MNUBARDSP');
  const bar1Inst = afterCond.find((k) => k.parameters.trim() === 'BAR1 MNUFLD');
  const bar2Inst = afterCond.find((k) => k.parameters.trim() === 'BAR2 MNUFLD2 PULLFLD');
  check('instance 0 (BAR1 MNUFLD) is now conditioned on indicator 30', bar1Inst && bar1Inst.conditions.length === 1 && bar1Inst.conditions[0].indicators[0].number === '30');
  check('instance 1 (BAR2 ...) remains unconditioned', bar2Inst && bar2Inst.conditions.length === 0);
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
  check('the remaining one is BAR1 MNUFLD, still conditioned on 30', afterRemove[0].parameters.trim() === 'BAR1 MNUFLD' && afterRemove[0].conditions.length === 1 && afterRemove[0].conditions[0].indicators[0].number === '30');
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
  check('MNUBARDSP written as just "PULLIN" (single-name shape, no record/choice names)', reparsed.keywords.find((k) => k.name === 'MNUBARDSP').parameters.trim() === 'PULLIN');
  check("BAR1's own MNUBAR keyword is untouched throughout", reparsed.keywords.some((k) => k.name === 'MNUBAR'));
  check("BAR1's own field-level MNUBARCHC (on MNUFLD) is untouched throughout", reparsed.fields.some((f) => f.name === 'MNUFLD' && f.keywords.some((k) => k.name === 'MNUBARCHC')));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

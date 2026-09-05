/**
 * toolbarViewAccordion.test.js
 *
 * Task P5g (LIMITATIONS-PLAN.md's P series) - the compare-mode/overlay/
 * SFLPAG-preview toggles, the ruler/crosshair toggles, the compare-record
 * list, and the conditioning-indicators preview list, migrated into a new
 * "View" accordion inside P5a's #propsAccordionZone. Same "genuine second
 * element(s), one behavior, kept in sync from a single source" reasoning
 * P5b/c/d already established, with the P5d-learned lesson applied up
 * front: these are duplicates, not a relocation, since classic UI never
 * shows #propsAccordionZone at all.
 * Run with: node src/test/toolbarViewAccordion.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// Two record formats (so compareRecordList has something to offer) and one
// record-level conditioning indicator (so indicatorList has something to
// list), plus an SFL record (so previewRowsRow's "Preview SFLPAG rows" row
// can actually become visible).
const dspfSource =
  [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', ind1: '51', func: 'ALARM' }),
    buildLine({ seq: '00030', name: 'NAME', dataType: 'A', length: '10', usage: 'B', line: '4', col: '5' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'DTLSFL', func: 'SFL' }),
    buildLine({ seq: '00050', func: 'SFLSIZ(10)' }),
    buildLine({ seq: '00060', func: 'SFLPAG(5)' }),
    buildLine({ seq: '00070', name: 'SFLFLD', dataType: 'A', length: '10', usage: 'B', line: '1', col: '2' }),
  ].join('\n') + '\n';

const dom = new JSDOM(
  getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF', 'modern').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  ),
  {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  }
);

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;

  console.log('setup: the View accordion and all its duplicate controls exist inside #propsAccordionZone, aside originals untouched');
  const viewAccordion = doc.getElementById('viewAccordion');
  check('#viewAccordion exists inside #propsAccordionZone', !!viewAccordion && doc.getElementById('propsAccordionZone').contains(viewAccordion));
  [
    'toolbarCompareModeToggle',
    'toolbarCompareOverlayRow',
    'toolbarCompareOverlayToggle',
    'toolbarPreviewRowsRow',
    'toolbarPreviewRowsToggle',
    'toolbarRulerToggle',
    'toolbarCrosshairToggle',
    'toolbarCompareRecordList',
    'toolbarIndicatorList',
  ].forEach((id) => check('#' + id + ' exists inside the View accordion', viewAccordion.contains(doc.getElementById(id))));
  ['compareModeToggle', 'compareOverlayToggle', 'previewRowsToggle', 'rulerToggle', 'crosshairToggle', 'compareRecordList', 'indicatorList'].forEach((id) =>
    check('the aside\'s own #' + id + ' is still present, untouched', !!doc.getElementById(id))
  );

  console.log('\ncompareModeToggle: clicking the toolbar duplicate forwards to the real listener (compareRecordList/compareOverlayRow visibility, both copies)');
  const toolbarCompareModeToggle = doc.getElementById('toolbarCompareModeToggle');
  const asideCompareModeToggle = doc.getElementById('compareModeToggle');
  check('both start unchecked', !toolbarCompareModeToggle.checked && !asideCompareModeToggle.checked);
  check('both compareOverlayRow copies start hidden', doc.getElementById('compareOverlayRow').classList.contains('hidden') && doc.getElementById('toolbarCompareOverlayRow').classList.contains('hidden'));
  toolbarCompareModeToggle.checked = true;
  toolbarCompareModeToggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('the ASIDE original actually got checked (forwarded, not re-implemented)', asideCompareModeToggle.checked);
  check('the aside compareOverlayRow is now visible', !doc.getElementById('compareOverlayRow').classList.contains('hidden'));
  check('the toolbar compareOverlayRow duplicate is ALSO visible (synced)', !doc.getElementById('toolbarCompareOverlayRow').classList.contains('hidden'));
  check('the aside compareRecordList is now visible', !doc.getElementById('compareRecordList').classList.contains('hidden'));
  check('the toolbar compareRecordList duplicate is ALSO visible (synced)', !doc.getElementById('toolbarCompareRecordList').classList.contains('hidden'));

  console.log('\ncompareOverlayToggle: same forwarding pattern');
  const toolbarCompareOverlayToggle = doc.getElementById('toolbarCompareOverlayToggle');
  const asideCompareOverlayToggle = doc.getElementById('compareOverlayToggle');
  toolbarCompareOverlayToggle.checked = true;
  toolbarCompareOverlayToggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('the aside original got checked', asideCompareOverlayToggle.checked);

  console.log('\ncompareRecordList: built into BOTH containers from the same compareSelectedRecords Set - each copy\'s own checkbox works independently');
  const asideCompareList = doc.getElementById('compareRecordList');
  const toolbarCompareList = doc.getElementById('toolbarCompareRecordList');
  const asideDtlsflRow = Array.from(asideCompareList.querySelectorAll('label')).find((l) => l.textContent.includes('DTLSFL'));
  const toolbarDtlsflRow = Array.from(toolbarCompareList.querySelectorAll('label')).find((l) => l.textContent.includes('DTLSFL'));
  check('DTLSFL is offered in the aside compare list (SCR1 is the current record, excluded from its own list)', !!asideDtlsflRow);
  check('DTLSFL is offered in the toolbar duplicate too', !!toolbarDtlsflRow);
  check('neither copy starts checked', !asideDtlsflRow.querySelector('input').checked && !toolbarDtlsflRow.querySelector('input').checked);
  toolbarDtlsflRow.querySelector('input').checked = true;
  toolbarDtlsflRow.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
  check('checking it in the TOOLBAR duplicate is reflected back in the aside original on the next render (rebuilt from the same Set)', doc.getElementById('compareRecordList').querySelector('label').textContent.includes('DTLSFL') && Array.from(doc.getElementById('compareRecordList').querySelectorAll('label')).find((l) => l.textContent.includes('DTLSFL')).querySelector('input').checked);

  console.log('\nindicatorList: built into BOTH containers from the same active Set - checking the toolbar copy reflects back in the aside copy');
  const asideIndicatorLabel = () => Array.from(doc.getElementById('indicatorList').querySelectorAll('label')).find((l) => l.textContent.includes('Ind 51'));
  const toolbarIndicatorLabel = () => Array.from(doc.getElementById('toolbarIndicatorList').querySelectorAll('label')).find((l) => l.textContent.includes('Ind 51'));
  check('Ind 51 is listed in the aside copy (conditions ALARM on SCR1)', !!asideIndicatorLabel());
  check('Ind 51 is listed in the toolbar duplicate too', !!toolbarIndicatorLabel());
  check('neither copy starts checked', !asideIndicatorLabel().querySelector('input').checked && !toolbarIndicatorLabel().querySelector('input').checked);
  toolbarIndicatorLabel().querySelector('input').checked = true;
  toolbarIndicatorLabel().querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
  check('checking it in the toolbar duplicate is reflected back in the aside copy (rebuilt from the same active Set)', asideIndicatorLabel().querySelector('input').checked);
  check('and the toolbar copy itself stays checked after the rebuild', toolbarIndicatorLabel().querySelector('input').checked);

  console.log('\npreviewRowsToggle: forwards to the real listener; previewRowsRow visibility syncs both copies once the SFL record is being previewed');
  // Turn compare/full-overlay mode back off first - render()'s full-overlay
  // path returns early, before previewRowsRow's own screen-dependent
  // visibility is computed, so leaving it on here would test an unrelated
  // pre-existing quirk instead of previewRowsToggle's own behavior.
  asideCompareOverlayToggle.checked = false;
  asideCompareOverlayToggle.dispatchEvent(new Event('change', { bubbles: true }));
  asideCompareModeToggle.checked = false;
  asideCompareModeToggle.dispatchEvent(new Event('change', { bubbles: true }));
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'DTLSFL';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  check('setup: aside previewRowsRow is now visible (DTLSFL is an SFL record)', !doc.getElementById('previewRowsRow').classList.contains('hidden'));
  check('the toolbar previewRowsRow duplicate is ALSO visible (synced)', !doc.getElementById('toolbarPreviewRowsRow').classList.contains('hidden'));
  const toolbarPreviewRowsToggle = doc.getElementById('toolbarPreviewRowsToggle');
  const asidePreviewRowsToggle = doc.getElementById('previewRowsToggle');
  toolbarPreviewRowsToggle.checked = true;
  toolbarPreviewRowsToggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('the aside original got checked (forwarded)', asidePreviewRowsToggle.checked);
  asidePreviewRowsToggle.checked = false;
  asidePreviewRowsToggle.dispatchEvent(new Event('change', { bubbles: true }));

  console.log('\nrulerToggle/crosshairToggle: neither of their own real listeners calls render(), so syncing must happen from inside those listeners directly, not just render()\'s own call');
  const toolbarRulerToggle = doc.getElementById('toolbarRulerToggle');
  const asideRulerToggle = doc.getElementById('rulerToggle');
  toolbarRulerToggle.checked = true;
  toolbarRulerToggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('the aside ruler toggle got checked (forwarded)', asideRulerToggle.checked);
  check('the ruler actually turned on (genuinely live, not just a class toggle)', !doc.getElementById('rulerCorner').classList.contains('hidden'));
  asideRulerToggle.checked = false;
  asideRulerToggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('toolbar ruler toggle synced back off, even though this listener never calls render()', !toolbarRulerToggle.checked);

  const toolbarCrosshairToggle = doc.getElementById('toolbarCrosshairToggle');
  const asideCrosshairToggle = doc.getElementById('crosshairToggle');
  toolbarCrosshairToggle.checked = true;
  toolbarCrosshairToggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('the aside crosshair toggle got checked (forwarded)', asideCrosshairToggle.checked);
  asideCrosshairToggle.checked = false;
  asideCrosshairToggle.dispatchEvent(new Event('change', { bubbles: true }));
  check('toolbar crosshair toggle synced back off, even though this listener never calls render()', !toolbarCrosshairToggle.checked);

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

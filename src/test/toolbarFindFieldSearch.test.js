/**
 * toolbarFindFieldSearch.test.js
 *
 * Task P5e (LIMITATIONS-PLAN.md's P series) - the aside's "Find field"
 * search box (+ its results dropdown) gets a genuine second instance in
 * #propsFindFieldRow, a new sibling of #propsPinnedToolbar (both OUTSIDE
 * .panel-body, per P5a's own doc comment already earmarking this control
 * for the "survives a full panel collapse" camp alongside Save/Compile/
 * Record select). Unlike P5d's Record/Screen-size selects (referenced from
 * around a dozen other call sites, so genuinely duplicating would have
 * meant keeping ~14 places in sync), the Find-field widget is small and
 * entirely self-contained - nothing outside its own wiring function ever
 * reads fieldSearchInput/fieldSearchResults by name - so wireFieldSearch
 * was factored into a reusable function and called twice, giving each
 * instance its own independent matches array/active index/open state
 * rather than two inputs fighting over one shared array.
 *
 * Task L19's own scenario in dspfWebview.test.js already covers full
 * behavioral parity (filtering, jumping across records, Escape/Enter/
 * arrow-key handling, empty-state) for the ASIDE instance and continues
 * to pass unchanged after this refactor - not re-duplicated wholesale
 * here. This file instead covers what's NEW: the toolbar twin exists and
 * works too, the two instances are genuinely independent (not fighting
 * over shared state), and #propsFindFieldRow's own placement/gating
 * (survives collapse, hidden under classic, survives a #propsBody swap).
 *
 * Run with: node src/test/toolbarFindFieldSearch.test.js
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
    '     A            CUSTNO    6A  B  2  2',
    '     A            CUSTNAME  30A  B  3  2',
    '     A          R SCR2',
    '     A            BALANCE   9S 2B  2  2',
  ].join('\n') + '\n';

function buildDom(uiStyle) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce22', dspfSource, 'FINDFIELD.DSPF', uiStyle).replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  return new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      window.Element.prototype.scrollIntoView = function () { this.__scrolledIntoView = true; };
    },
  });
}

const dom = buildDom('modern');

setTimeout(() => {
  const doc = dom.window.document;
  const { Event, KeyboardEvent } = dom.window;

  const toolbarInput = doc.getElementById('toolbarFieldSearchInput');
  const toolbarResults = doc.getElementById('toolbarFieldSearchResults');
  const asideInput = doc.getElementById('fieldSearchInput');
  const asideResults = doc.getElementById('fieldSearchResults');
  const findFieldRow = doc.getElementById('propsFindFieldRow');
  const pinnedToolbar = doc.getElementById('propsPinnedToolbar');
  const panelBody = doc.getElementById('rightPanelBody');

  console.log('setup: both toolbar elements exist, live inside #propsFindFieldRow, and the aside originals are untouched');
  check('#toolbarFieldSearchInput exists', !!toolbarInput);
  check('#toolbarFieldSearchResults exists', !!toolbarResults);
  check('#propsFindFieldRow exists', !!findFieldRow);
  check('#toolbarFieldSearchInput lives inside #propsFindFieldRow', findFieldRow.contains(toolbarInput));
  check('#toolbarFieldSearchResults lives inside #propsFindFieldRow', findFieldRow.contains(toolbarResults));
  check("the aside's own search input is still present, untouched", !!asideInput);
  check("the aside's own results dropdown is still present, untouched", !!asideResults);
  check('results dropdown starts hidden', toolbarResults.classList.contains('hidden'));

  console.log('\n#propsFindFieldRow is placed directly under #propsPinnedToolbar, as a sibling OUTSIDE .panel-body (not inside it) - so it survives a full panel collapse the same way the toolbar itself does, per P5a\'s own doc comment already earmarking this control for that camp');
  check('#propsFindFieldRow is a sibling of #propsPinnedToolbar (same parent, #propsPanel)', findFieldRow.parentElement === pinnedToolbar.parentElement);
  check('#propsFindFieldRow is NOT inside #rightPanelBody (.panel-body)', !panelBody.contains(findFieldRow));
  check('#propsFindFieldRow comes immediately after #propsPinnedToolbar in DOM order ("directly under")', pinnedToolbar.nextElementSibling === findFieldRow);

  console.log('\nthe toolbar instance filters and jumps to a match, exactly like the aside\'s own (Task L19) instance does');
  toolbarInput.value = 'cust';
  toolbarInput.dispatchEvent(new Event('input', { bubbles: true }));
  check('toolbar results dropdown is now visible', !toolbarResults.classList.contains('hidden'));
  let rows = Array.from(toolbarResults.querySelectorAll('.field-search-row'));
  check('finds both CUSTNO and CUSTNAME', rows.length === 2);
  rows[0].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
  check("toolbar search box is filled with the picked field's own name", toolbarInput.value === 'CUSTNO');
  check('toolbar results dropdown closes after picking', toolbarResults.classList.contains('hidden'));
  const selectedEl = doc.querySelector('.dspf-field.selected');
  check('the field is now selected on the canvas via the toolbar instance', !!selectedEl && selectedEl.getAttribute('data-field') === 'CUSTNO');
  check('the field element was scrolled into view', !!selectedEl.__scrolledIntoView);

  console.log('\na match on a different record switches records too, same as the aside instance');
  toolbarInput.value = 'balance';
  toolbarInput.dispatchEvent(new Event('input', { bubbles: true }));
  rows = Array.from(toolbarResults.querySelectorAll('.field-search-row'));
  rows[0].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
  check('switched to SCR2 via the toolbar instance', doc.getElementById('recordSelect').value === 'SCR2');

  console.log('\nthe two instances are genuinely independent - typing in one never opens/affects the other\'s dropdown');
  toolbarInput.value = '';
  toolbarInput.dispatchEvent(new Event('input', { bubbles: true }));
  asideInput.value = '';
  asideInput.dispatchEvent(new Event('input', { bubbles: true }));
  check('both dropdowns closed after clearing both', toolbarResults.classList.contains('hidden') && asideResults.classList.contains('hidden'));
  asideInput.value = 'cust';
  asideInput.dispatchEvent(new Event('input', { bubbles: true }));
  check("typing in the ASIDE input opens the aside's own dropdown", !asideResults.classList.contains('hidden'));
  check("...but leaves the TOOLBAR's dropdown untouched (still closed)", toolbarResults.classList.contains('hidden'));
  check("...and doesn't touch the toolbar input's own value either", toolbarInput.value === '');
  asideInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  toolbarInput.value = 'balance';
  toolbarInput.dispatchEvent(new Event('input', { bubbles: true }));
  check("typing in the TOOLBAR input opens the toolbar's own dropdown", !toolbarResults.classList.contains('hidden'));
  check("...but leaves the ASIDE's dropdown untouched (still closed, from the Escape above)", asideResults.classList.contains('hidden'));

  console.log('\n#propsFindFieldRow survives a #propsBody selection-triggered swap (render() runs, the row and its wiring are untouched, not recreated)');
  const rowBeforeRender = doc.getElementById('propsFindFieldRow');
  const balanceField = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.getAttribute('data-field') === 'BALANCE');
  balanceField.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
  check('a selection actually happened (props panel now shows a field, not the empty-state)', !doc.getElementById('propsBody').textContent.includes('Select a field'));
  check('#propsFindFieldRow is still the SAME node after the swap (not torn down/recreated)', doc.getElementById('propsFindFieldRow') === rowBeforeRender);
  check('the toolbar search input is still the same functioning element after the swap', doc.getElementById('toolbarFieldSearchInput') === toolbarInput);
  toolbarInput.value = 'balance';
  toolbarInput.dispatchEvent(new Event('input', { bubbles: true }));
  check('the toolbar instance still works after surviving that swap', !toolbarResults.classList.contains('hidden'));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));

  console.log('\nTask P5e, continued: #propsFindFieldRow is entirely hidden under classic UI (the aside keeps working there instead, unaffected)');
  const classicDom = buildDom('classic');
  setTimeout(() => {
    const classicDoc = classicDom.window.document;
    const classicRow = classicDoc.getElementById('propsFindFieldRow');
    const classicComputed = classicDom.window.getComputedStyle(classicRow);
    check('#propsFindFieldRow computes to display:none under classic UI', classicComputed.display === 'none');
    const classicAsideInput = classicDoc.getElementById('fieldSearchInput');
    classicAsideInput.value = 'cust';
    classicAsideInput.dispatchEvent(new classicDom.window.Event('input', { bubbles: true }));
    const classicAsideResults = classicDoc.getElementById('fieldSearchResults');
    check("the aside's own Find field search still works fully under classic UI, unaffected by any of this", !classicAsideResults.classList.contains('hidden'));

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 0);
}, 0);

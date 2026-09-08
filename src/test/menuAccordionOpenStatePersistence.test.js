/**
 * menuAccordionOpenStatePersistence.test.js
 *
 * Bug fix (L66 follow-up) - the DSPF designer's own buildWebviewTemplate.js
 * got a persistent accordionOpenState Map so its accordions stop
 * re-collapsing on every edit-triggered re-render (see
 * accordionOpenStatePersistence.test.js for that scenario). The Menu
 * Designer (buildMenuWebviewTemplate.js) is a SEPARATE webview file that
 * also calls WebviewClientHelpers.colorAttrStatesHtml() - which wraps its
 * own output in the same collapsible <details class="props-accordion"> -
 * from its per-option "Style" panel, and renderOptions() fully rebuilds
 * every option row on every commit, same as the DSPF designer's own props
 * panel does. Without its own accordionOpenState, that inner Color &
 * attributes accordion would suffer the exact same "collapses the instant
 * you edit inside it" bug. Fixed the same way: a persistent
 * accordionOpenState Map + one delegated capturing 'toggle' listener in
 * buildMenuWebviewTemplate.js's own script, and the colorAttrStatesHtml
 * call site now passes it through.
 *
 * Note this is INDEPENDENT of expandedOptionStyle (the Set governing
 * whether the outer "Style" toggle itself is expanded) - that already
 * persisted correctly across renderOptions() before this fix; the bug was
 * only ever in the INNER Color & attributes accordion colorAttrStatesHtml
 * renders once Style is expanded.
 * Run with: node src/test/menuAccordionOpenStatePersistence.test.js
 */
const { JSDOM } = require('jsdom');
const { getMenuWebviewHtml } = require('../../dist/menuWebviewTemplate.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const menuSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R MENU',
    "     A                                  1  2'MAIN MENU'",
    "     A                                  3  5'1. Display library list'",
    "     A                                  4  5'2. Change current library'",
  ].join('\n') + '\n';
const commandSource = '0001 DSPLIBL\n0002 CHGCURLIB\n';

const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce', menuSource, commandSource, 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;

  function accordion() {
    return doc.querySelector('details.props-accordion[data-accordion-key="opt1::colorattr"]');
  }

  console.log('setup: expand option 1\'s Style panel and give it a color/attribute state to edit');
  const styleToggle = doc.querySelector('.option-style-toggle[data-num="1"]');
  check('setup: Style toggle is present', !!styleToggle);
  styleToggle.dispatchEvent(new Event('click', { bubbles: true }));

  const stagingColorSel = doc.getElementById('opt1-colorattr-new-color');
  check('Color & attributes staging row rendered', !!stagingColorSel);
  check('bug fix: Color & attributes is now a collapsible accordion (data-accordion-key present)', !!accordion());
  check('...and starts closed, nothing toggled yet', !!accordion() && !accordion().open);

  stagingColorSel.value = 'RED';
  const addBtn = doc.querySelector('.repeat-inst-add[data-prefix="opt1-colorattr"]');
  addBtn.dispatchEvent(new Event('click', { bubbles: true }));

  console.log('\nopening the (now re-rendered, freshly re-queried) accordion, then editing ITS OWN inst0 color - the exact reported DSPF-designer scenario, here in the Menu designer');
  const accordionAfterAdd = accordion();
  check('setup: accordion still present after the add-commit re-render', !!accordionAfterAdd);
  accordionAfterAdd.open = true;
  accordionAfterAdd.dispatchEvent(new Event('toggle'));
  check('accordion is now open', accordionAfterAdd.open);

  const inst0Color = doc.getElementById('opt1-colorattr-inst0-color');
  check('setup: inst0 (the state just added) has its own color <select>', !!inst0Color);
  inst0Color.value = 'BLU';
  inst0Color.dispatchEvent(new Event('change', { bubbles: true }));

  const accordionAfterEdit = accordion();
  check('bug fix: accordion stays OPEN across the re-render its own edit triggered (previously snapped shut)', !!accordionAfterEdit && accordionAfterEdit.open);
  check('the outer Style panel is also still expanded (expandedOptionStyle, unrelated to this fix, was never broken)', !!doc.getElementById('opt1-colorattr-inst0-color'));
  check('the color choice itself was not lost by the same edit', doc.getElementById('opt1-colorattr-inst0-color').value === 'BLU');

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

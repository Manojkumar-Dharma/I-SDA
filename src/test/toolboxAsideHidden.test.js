/**
 * toolboxAsideHidden.test.js
 *
 * Task P5i (LIMITATIONS-PLAN.md's P series) - the final row in the P5
 * aside-migration group: once every one of P5b-h has landed (confirmed -
 * see each row's own "done" status), <aside> itself is hidden entirely
 * under modern UI, and the grid collapses from three columns to two
 * ([canvas 1fr][right panel]) - classic UI keeps the original three-column
 * layout, aside included, forever, completely untouched.
 *
 * <aside> is hidden via CSS (body[data-ui-style="modern"] aside {
 * display:none }), NOT removed from the DOM - #placeFieldBtn/
 * #placeConstantBtn/#newRecordToggleBtn+#newRecordForm/#addFromDbBtn/
 * #placementHint were never migrated into the pinned-toolbar/
 * accordion-zone the way P5b-h's own controls were (P5's own inventory
 * never listed them - P1-P4's toolboxFab covers those instead, via
 * wireProxy's own .click()-on-the-real-button pattern), so those elements
 * still have to exist and still have to work, just never be visually
 * reachable directly. This file's main job is proving that regression risk
 * specifically didn't happen - toolboxFab.test.js already proves the proxy
 * mechanism itself works end to end (aside button's own class/state changes
 * after a fab item's proxy-click); this file adds the layer toolboxFab.test.js
 * doesn't cover: that it STILL works with aside computed to display:none,
 * which it always has been for every scenario in this file (never true
 * before this task, since aside was never actually hidden before it).
 * Covers:
 *   - <aside> computes to display:none under modern, visible under classic
 *   - grid-template-columns is two-column under modern (with right-panel
 *     collapse still independently functional), three-column under classic
 *     (baseline, unaffected - see runPanelCollapseScenario in
 *     dspfWebview.test.js for that full scenario)
 *   - a toolboxFab proxy item (+Field) still successfully arms placement
 *     mode via its real aside target, even though that target computes to
 *     display:none the entire time
 *   - switching UI style LIVE (via either style-toggle button) recomputes
 *     both aside's visibility and the grid formula immediately, in both
 *     directions, without a reload
 * Run with: node src/test/toolboxAsideHidden.test.js
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
    '     A            NAME      10A  B  4  5',
  ].join('\n') + '\n';

function makeDom(uiStyle) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF', uiStyle).replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  return new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });
}

setTimeout(() => {
  console.log('modern UI: <aside> is hidden and the grid is two-column');
  const modernDom = makeDom('modern');
  const modernDoc = modernDom.window.document;
  const asideModern = modernDoc.querySelector('aside');
  check('<aside> computes to display:none under modern', modernDom.window.getComputedStyle(asideModern).display === 'none');
  check('grid-template-columns is two-column (no left column at all) under modern', /^1fr 300px$/.test(modernDoc.body.style.gridTemplateColumns));

  console.log('\nunder modern, the right-panel collapse toggle still works independently (aside has no toggle left to test - it is entirely hidden)');
  const rightToggleModern = modernDoc.getElementById('rightPanelToggle');
  rightToggleModern.dispatchEvent(new modernDom.window.Event('click', { bubbles: true }));
  check('right panel collapses to 28px, grid stays two-column', /^1fr 28px$/.test(modernDoc.body.style.gridTemplateColumns));
  check('<aside> is still hidden throughout - collapsing the right panel never affects it', modernDom.window.getComputedStyle(asideModern).display === 'none');

  console.log('\nclassic UI: <aside> stays fully visible, three-column layout unaffected (baseline)');
  const classicDom = makeDom('classic');
  const classicDoc = classicDom.window.document;
  const asideClassic = classicDoc.querySelector('aside');
  check('<aside> is fully visible under classic', classicDom.window.getComputedStyle(asideClassic).display !== 'none');
  check('grid-template-columns is the original three-column formula under classic', /^240px 1fr 300px$/.test(classicDoc.body.style.gridTemplateColumns));

  console.log('\na toolboxFab proxy item still successfully arms placement mode via its real (hidden) aside target');
  const fabFieldBtn = modernDoc.getElementById('fabPlaceFieldBtn');
  const asidePlaceFieldBtn = modernDoc.getElementById('placeFieldBtn');
  check('neither starts active', !asidePlaceFieldBtn.classList.contains('active') && !fabFieldBtn.classList.contains('active'));
  fabFieldBtn.dispatchEvent(new modernDom.window.Event('click', { bubbles: true }));
  check('the real (hidden) aside button activated - proxy-click still fires its handler even though it is display:none', asidePlaceFieldBtn.classList.contains('active'));
  check('the placement hint (also inside the hidden aside) still shows, proving the placement-mode machinery is genuinely armed, not just a class flip', !modernDoc.getElementById('placementHint').classList.contains('hidden'));

  // The fab item's own 'active' mirror is driven by a MutationObserver
  // watching the aside button's class attribute (see mirrorActiveState in
  // buildWebviewTemplate.js) - that callback fires as a microtask, so it
  // needs a tick before it's safe to assert on, same as toolboxFab.test.js's
  // own equivalent check already does.
  setTimeout(() => {
    check('the visible toolboxFab item mirrors that active state, once the observer has had a tick to run', fabFieldBtn.classList.contains('active'));
    asidePlaceFieldBtn.dispatchEvent(new modernDom.window.Event('click', { bubbles: true })); // cancel, tidy up
    runLiveStyleSwitchScenario();
  }, 0);
}, 0);

function runLiveStyleSwitchScenario() {
  console.log('\nswitching UI style LIVE recomputes aside\'s visibility and the grid formula immediately, no reload, in both directions');
  const liveDom = makeDom('modern');
  const liveDoc = liveDom.window.document;
  const asideLive = liveDoc.querySelector('aside');
  const toolbarToggle = liveDoc.getElementById('toolbarUiStyleToggle');
  check('starts modern: aside hidden, two-column grid', liveDom.window.getComputedStyle(asideLive).display === 'none' && /^1fr 300px$/.test(liveDoc.body.style.gridTemplateColumns));
  toolbarToggle.dispatchEvent(new liveDom.window.Event('click', { bubbles: true }));
  check('switched to classic: aside now visible', liveDom.window.getComputedStyle(asideLive).display !== 'none');
  check('...and the grid recomputed to three columns immediately', /^240px 1fr 300px$/.test(liveDoc.body.style.gridTemplateColumns));
  toolbarToggle.dispatchEvent(new liveDom.window.Event('click', { bubbles: true }));
  check('switched back to modern: aside hidden again', liveDom.window.getComputedStyle(asideLive).display === 'none');
  check('...and the grid recomputed back to two columns immediately', /^1fr 300px$/.test(liveDoc.body.style.gridTemplateColumns));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

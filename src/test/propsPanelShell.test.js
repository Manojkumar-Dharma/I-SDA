/**
 * propsPanelShell.test.js
 *
 * Task P5a (LIMITATIONS-PLAN.md's P series) - the foundation for migrating
 * the aside panel's content into the right-side props-panel: two new
 * regions, #propsPinnedToolbar and #propsAccordionZone, siblings of
 * #propsBreadcrumb/#propsBody inside #propsPanel, that P5b-h will migrate
 * real content into later. Both are empty today - this only proves the
 * SHELL's own guarantees hold, since nothing has actually moved in yet:
 *   - present (but inert/invisible) under classic UI, exactly like every
 *     other modern-only control this codebase already has
 *   - invisible while empty under modern UI too (no blank gap), visible
 *     once something is actually in them
 *   - #propsPinnedToolbar survives a full "Hide panel" collapse (P5's own
 *     risk (2)) - it lives OUTSIDE .panel-body, unlike everything else in
 *     #propsPanel
 *   - #propsAccordionZone survives #propsBody's own wholesale empty-state
 *     replace on selection change (P5's own risk (1)) - it's a sibling of
 *     #propsBreadcrumb/#propsBody, never touched by that swap - but,
 *     unlike the toolbar, IS hidden by a full panel collapse, since it
 *     still lives inside .panel-body (this is intentional - see P5a's own
 *     row for why only the toolbar needs to survive a full collapse)
 * Run with: node src/test/propsPanelShell.test.js
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
  console.log('classic UI: both regions exist but render invisible, same as every other modern-only control');
  const classicDom = makeDom('classic');
  const classicDoc = classicDom.window.document;
  const toolbar = classicDoc.getElementById('propsPinnedToolbar');
  const accordionZone = classicDoc.getElementById('propsAccordionZone');
  check('propsPinnedToolbar exists in the DOM under classic', !!toolbar);
  check('propsAccordionZone exists in the DOM under classic', !!accordionZone);
  check('propsPinnedToolbar is invisible under classic (empty)', classicDom.window.getComputedStyle(toolbar).display === 'none');
  toolbar.innerHTML = '<button>Save</button>';
  check(
    'propsPinnedToolbar STAYS invisible under classic even with real content - classic never shows it, empty or not',
    classicDom.window.getComputedStyle(toolbar).display === 'none'
  );

  console.log('\nmodern UI: both regions render invisible while empty, visible once populated');
  const dom = makeDom('modern');
  const doc = dom.window.document;
  const modernToolbar = doc.getElementById('propsPinnedToolbar');
  const modernAccordionZone = doc.getElementById('propsAccordionZone');
  check('propsPinnedToolbar is invisible under modern while empty (no blank gap)', dom.window.getComputedStyle(modernToolbar).display === 'none');
  check('propsAccordionZone is invisible under modern while empty', dom.window.getComputedStyle(modernAccordionZone).display === 'none');
  modernToolbar.innerHTML = '<button id="fakeSaveBtn">Save</button>';
  modernAccordionZone.innerHTML = '<details><summary>View</summary></details>';
  check('propsPinnedToolbar becomes visible once populated', dom.window.getComputedStyle(modernToolbar).display === 'flex');
  check('propsAccordionZone becomes visible once populated', dom.window.getComputedStyle(modernAccordionZone).display === 'block');

  console.log('\nselecting a field swaps #propsBody wholesale (P5 risk 1) - the toolbar and accordion zone must not be touched by that swap');
  const bodyHtmlBefore = doc.getElementById('propsBody').innerHTML;
  doc.querySelector('.dspf-field').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  const bodyHtmlAfter = doc.getElementById('propsBody').innerHTML;
  check('propsBody\'s content actually changed (sanity check this scenario really exercises the swap)', bodyHtmlBefore !== bodyHtmlAfter);
  check('propsBody moved away from the empty-state placeholder', !bodyHtmlAfter.includes('Select a field to edit it'));
  check('propsPinnedToolbar keeps its content - untouched by the propsBody swap', doc.getElementById('propsPinnedToolbar').innerHTML.includes('fakeSaveBtn'));
  check('propsAccordionZone keeps its content - untouched by the propsBody swap', doc.getElementById('propsAccordionZone').innerHTML.includes('<summary>View</summary>'));
  check('propsPinnedToolbar is still visible after the swap', dom.window.getComputedStyle(doc.getElementById('propsPinnedToolbar')).display === 'flex');
  check('propsAccordionZone is still visible after the swap', dom.window.getComputedStyle(doc.getElementById('propsAccordionZone')).display === 'block');

  console.log('\ncollapsing the whole right panel (P5 risk 2) hides the accordion zone but NOT the pinned toolbar');
  doc.getElementById('rightPanelToggle').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  check('the panel actually collapsed (sanity check)', doc.getElementById('propsPanel').classList.contains('panel-collapsed'));
  check(
    'propsPinnedToolbar (Save/Compile/etc. - P5b-f) SURVIVES the collapse, still visible',
    dom.window.getComputedStyle(doc.getElementById('propsPinnedToolbar')).display === 'flex'
  );
  check(
    'propsAccordionZone (View/UI Settings - P5g/h) is hidden by the collapse, by design - #rightPanelBody itself (its ancestor) goes display:none, unlike the toolbar which sits outside it',
    dom.window.getComputedStyle(doc.getElementById('rightPanelBody')).display === 'none'
  );
  check(
    'propsBreadcrumb/propsBody (unchanged from before P5a) are hidden by the collapse too, same as always - same ancestor, same rule',
    dom.window.getComputedStyle(doc.getElementById('rightPanelBody')).display === 'none'
  );

  console.log('\nexpanding the panel again restores the accordion zone without losing its content');
  doc.getElementById('rightPanelToggle').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  check('propsAccordionZone is visible again after re-expanding', dom.window.getComputedStyle(doc.getElementById('propsAccordionZone')).display === 'block');
  check('propsAccordionZone never lost its content while collapsed', doc.getElementById('propsAccordionZone').innerHTML.includes('<summary>View</summary>'));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

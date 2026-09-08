/**
 * toolboxFab.test.js
 *
 * Task P1 (LIMITATIONS-PLAN.md's P series) - the floating "add to screen"
 * toolbox, modern UI style only. Runs the actual generated client-side
 * script in jsdom (string-contains checks on the generated HTML can't
 * catch a DOM-selector typo or a handler that silently never fires - only
 * actually running the script can), covering:
 *   - it's absent entirely under classic style, present under modern
 *   - the popover opens/closes on toggle click, outside click, and Escape
 *   - each item proxy-clicks its aside-panel equivalent rather than
 *     re-implementing placement/wizard/browsing logic itself
 *   - +Field/+Constant mirror the aside originals' 'active' state
 *   - +Fields from database file mirrors the aside original's
 *     connection-gated 'hidden' state
 *   - Task L68: +Field/+Constant/Window/DBFIELDS placement mode also drives
 *     #mainHint's own click-to-place text (visible in both UI styles,
 *     unlike the aside-only #placementHint - see setPlacementMode's own
 *     comment), and +Add record physically relocates the real
 *     #newRecordForm node into the toolbox popover under modern (not a
 *     duplicate), moving it back home to the aside once closed
 * Run with: node src/test/toolboxFab.test.js
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

console.log('classic style: the fab exists in the DOM (same shared markup as modern) but stays visually hidden');
{
  const dom = makeDom('classic');
  setTimeout(() => {
    const doc = dom.window.document;
    const fab = doc.getElementById('toolboxFab');
    check('#toolboxFab is present in the DOM', !!fab);
    const computedDisplay = dom.window.getComputedStyle(fab).display;
    check("classic style computes display:none for #toolboxFab (CSS is 'display: none' unless body[data-ui-style=modern])", computedDisplay === 'none');
  }, 0);
}

console.log('\nmodern style: fab present, closed by default, opens on toggle click');
setTimeout(() => {
  const dom = makeDom('modern');
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event, KeyboardEvent } = dom.window;
    const fab = doc.getElementById('toolboxFab');
    const toggle = doc.getElementById('toolboxFabToggle');
    const menu = doc.getElementById('toolboxFabMenu');

    check('#toolboxFab is present under modern style', !!fab);
    check('starts closed (no .open class)', !fab.classList.contains('open'));
    check("toggle button starts aria-expanded=false", toggle.getAttribute('aria-expanded') === 'false');

    toggle.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking the toggle opens it', fab.classList.contains('open'));
    check('aria-expanded flips to true', toggle.getAttribute('aria-expanded') === 'true');

    console.log('\n  clicking outside the fab closes it');
    doc.body.dispatchEvent(new Event('click', { bubbles: true }));
    check('now closed', !fab.classList.contains('open'));

    console.log('\n  Escape closes it too');
    toggle.dispatchEvent(new Event('click', { bubbles: true }));
    check('re-opened for this scenario', fab.classList.contains('open'));
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape closed it', !fab.classList.contains('open'));

    console.log('\n+Field proxies to the aside\'s own placeFieldBtn - same placement mode, not a re-implementation');
    {
      toggle.dispatchEvent(new Event('click', { bubbles: true }));
      const fabFieldBtn = doc.getElementById('fabPlaceFieldBtn');
      const asideFieldBtn = doc.getElementById('placeFieldBtn');
      check('neither button starts active', !asideFieldBtn.classList.contains('active') && !fabFieldBtn.classList.contains('active'));
      fabFieldBtn.dispatchEvent(new Event('click', { bubbles: true }));
      check('proxy-click activated the ASIDE button (single source of truth)', asideFieldBtn.classList.contains('active'));
      check('the popover closed itself after the click', !fab.classList.contains('open'));
      // Task L68: #placementHint (the aside's own "Click anywhere..."
      // message) is invisible under modern once P5i hides the whole aside,
      // so arming placement mode from the fab now ALSO drives #mainHint
      // (visible in both UI styles) - see setPlacementMode's own updated
      // comment in buildWebviewTemplate.js. Checking mainHint's specific
      // placement text (not just that it happens to contain the word
      // "field", which the UNCHANGED default hint text also does, making
      // that assertion pass even before this fix existed) is what actually
      // proves the hint is live, not just present.
      const hint = doc.getElementById('mainHint');
      check(
        'placement mode is genuinely live - mainHint (visible in BOTH UI styles, unlike the aside-only placementHint) now carries the click-to-place message',
        /click anywhere on the screen preview/i.test(hint.textContent) && hint.classList.contains('hint-readonly')
      );

      // The fab item's own 'active' mirror is driven by a MutationObserver
      // watching the aside button's class attribute - that callback fires
      // as a microtask, so it needs a tick (setTimeout 0 is enough to flush
      // it) before it's safe to assert on, unlike everything above, which
      // the click handler itself sets synchronously.
      setTimeout(() => {
        check('the fab item mirrors that active state back, once the observer has had a tick to run', fabFieldBtn.classList.contains('active'));

        // Cancel placement mode via the aside original before the next scenario,
        // same as clicking +Field again would.
        asideFieldBtn.dispatchEvent(new Event('click', { bubbles: true }));
        setTimeout(() => {
          check('placement mode cancels cleanly', !asideFieldBtn.classList.contains('active') && !fabFieldBtn.classList.contains('active'));
          check('mainHint reverts to its default text once placement mode is cancelled, not left stuck on the click-to-place message', !hint.classList.contains('hint-readonly') && !/click anywhere/i.test(hint.textContent));
          runConstantScenario();
        }, 0);
      }, 0);
    }

    function runConstantScenario() {
    console.log('\n+Constant proxies to placeConstantBtn the same way, and the two stay mutually exclusive');
    {
      toggle.dispatchEvent(new Event('click', { bubbles: true }));
      const fabConstBtn = doc.getElementById('fabPlaceConstantBtn');
      const fabFieldBtn = doc.getElementById('fabPlaceFieldBtn');
      const asideConstBtn = doc.getElementById('placeConstantBtn');
      fabConstBtn.dispatchEvent(new Event('click', { bubbles: true }));
      check('activates the aside Constant button', asideConstBtn.classList.contains('active'));
      setTimeout(() => {
        check('fab Constant item mirrors it, once the observer has had a tick to run', fabConstBtn.classList.contains('active'));
        check('fab Field item stays inactive (mutually exclusive with Constant)', !fabFieldBtn.classList.contains('active'));
        asideConstBtn.dispatchEvent(new Event('click', { bubbles: true }));
        setTimeout(runAddRecordScenario, 0);
      }, 0);
    }
    }

    function runAddRecordScenario() {
    console.log('\n+Add record proxies to newRecordToggleBtn - opens the SAME multi-step form, not a duplicate');
    {
      toggle.dispatchEvent(new Event('click', { bubbles: true }));
      const fabAddRecordBtn = doc.getElementById('fabAddRecordBtn');
      const form = doc.getElementById('newRecordForm');
      const menuEl = doc.getElementById('toolboxFabMenu');
      const asideFormHomeParent = form.parentNode; // captured before anything ever moves it
      check('the form starts hidden', form.classList.contains('hidden'));
      check('the form starts in its aside home, not the toolbox popover', !menuEl.contains(form));
      fabAddRecordBtn.dispatchEvent(new Event('click', { bubbles: true }));
      check('proxy-click reveals the SAME #newRecordForm the aside has always had (not a second, duplicated form)', !form.classList.contains('hidden'));
      check('exactly one #newRecordForm exists in the document (no duplicate markup)', doc.querySelectorAll('#newRecordForm').length === 1);
      // Task L68: under modern, the aside (and everything only ever
      // reachable inside it, like this form) computes to display:none -
      // so revealing the form has to mean more than just clearing its own
      // 'hidden' class; it also has to be physically moved somewhere that
      // isn't a descendant of the hidden aside, or it's still invisible.
      check('under modern UI, the SAME form node is physically moved into the toolbox popover, where it is actually visible', menuEl.contains(form));
      check("the form's own #newRecordForm CSS applies wherever it lives - it computes to a real visible display, not swallowed by aside's display:none", dom.window.getComputedStyle(form).display !== 'none');
      check('unlike every other fab item, the popover stays OPEN after +Add record so the freshly-revealed form is actually usable', fab.classList.contains('open'));
      // close it back out via the aside original, same as clicking +Add record again would
      doc.getElementById('newRecordToggleBtn').dispatchEvent(new Event('click', { bubbles: true }));
      check('closing the wizard moves the form back home into the aside, so switching to classic UI would still find it there', form.parentNode === asideFormHomeParent && !menuEl.contains(form));
    }

    console.log('\n+Fields from database file mirrors the aside original\'s connection-gated visibility');
    {
      const asideDbBtn = doc.getElementById('addFromDbBtn');
      const fabDbItem = doc.getElementById('fabAddFromDbBtn');
      // The aside original has no baked-in 'hidden' class of its own by
      // default - it only gains one once a real 'disconnected' status
      // message arrives from the extension host (see the connection-badge
      // handler elsewhere in this file), which this test harness never
      // sends. So the correct starting state to assert here is "matches
      // whatever the aside original's own current state is", not
      // "hidden" - asserting a hardcoded 'hidden' would just be testing
      // this test's own HTML default, not the mirroring logic.
      check('starts in sync with the aside original\'s own (visible, absent any connection message yet) default', fabDbItem.classList.contains('hidden') === asideDbBtn.classList.contains('hidden'));
      // Simulate what the connection-status handler does elsewhere in this
      // file when a 'connected'/'disconnected' status arrives - flip the
      // aside original's own hidden class directly, the same thing that
      // handler touches.
      asideDbBtn.classList.add('hidden');
      setTimeout(() => {
        check('fab item mirrors the aside original becoming hidden', fabDbItem.classList.contains('hidden'));
        asideDbBtn.classList.remove('hidden');
        setTimeout(() => {
          check('...and mirrors it becoming visible again too', !fabDbItem.classList.contains('hidden'));

          console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
          process.exit(failures === 0 ? 0 : 1);
        }, 0);
      }, 0);
    }
    }
  }, 0);
}, 0);

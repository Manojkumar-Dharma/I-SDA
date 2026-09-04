/**
 * toolboxWindowTool.test.js
 *
 * Task P3 (LIMITATIONS-PLAN.md's P series) - the floating toolbox's
 * "Window" tool: one click to arm placement mode, then one click on the
 * canvas drops a ready-made window record (a new record carrying
 * WINDOW(line col height width) sized from the click, plus WDWTITLE for
 * its title bar) - no name/geometry form, unlike +Field/+Constant/+Add
 * record, since a window template has nothing left to ask.
 *
 * Runs the actual generated client-side script in jsdom (same harness
 * toolboxFab.test.js and dspfWebview.test.js's click-to-place scenarios
 * already use) rather than string-contains checks on the generated HTML,
 * since only actually running the script proves the click handler fires
 * and writes what it's supposed to. Covers:
 *   - clicking the fab item arms placement mode (active class, hint text,
 *     the canvas's own 'placing' crosshair class) and closes the popover
 *   - clicking the canvas commits IMMEDIATELY (no intermediate placement
 *     form, unlike every other click-to-place kind)
 *   - the resulting record carries WINDOW sized from the click plus a
 *     WDWTITLE placeholder
 *   - auto-naming starts at WDW1, then increments to WDW2 on a second use
 *     (not WDW2 first - see nextWindowRecordName's own doc comment in
 *     buildWebviewTemplate.js for why this deliberately differs from
 *     DspfWriter.nextAvailableRecordName's own "always start at 2")
 *   - the record select switches to the newly-created window record
 *   - clicking the fab item again (without a canvas click in between)
 *     cancels placement mode instead of creating anything
 * Run with: node src/test/toolboxWindowTool.test.js
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

const posted = [];
const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF', 'modern').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    // gridMetrics() needs a non-zero rect to convert a pixel click into a
    // line/column (jsdom does no real layout) - same 10px/col, 20px/row
    // stub every other click-to-place test in this suite already uses.
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const toggle = doc.getElementById('toolboxFabToggle');
  const fab = doc.getElementById('toolboxFab');
  const fabWindowBtn = doc.getElementById('fabWindowBtn');
  const hint = doc.getElementById('placementHint');
  const recordSelect = doc.getElementById('recordSelect');

  check('setup: fabWindowBtn exists', !!fabWindowBtn);
  const postedAtStart = posted.length; // the webview posts its own 'ready' message on load

  console.log('clicking "Window" arms placement mode and closes the popover');
  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  check('popover open', fab.classList.contains('open'));
  fabWindowBtn.dispatchEvent(new Event('click', { bubbles: true }));
  check('popover closed itself', !fab.classList.contains('open'));
  check('fabWindowBtn is now active', fabWindowBtn.classList.contains('active'));
  check('the click-to-place hint is visible', !hint.classList.contains('hidden'));
  check('the canvas carries the crosshair "placing" class', !!doc.querySelector('.dspf-screen.placing'));
  check('nothing posted yet - arming placement mode alone writes nothing', posted.length === postedAtStart);

  console.log('\nclicking "Window" again (no canvas click yet) cancels placement mode instead of creating anything');
  fabWindowBtn.dispatchEvent(new Event('click', { bubbles: true }));
  check('fabWindowBtn no longer active', !fabWindowBtn.classList.contains('active'));
  check('hint hidden again', hint.classList.contains('hidden'));
  check('still nothing posted', posted.length === postedAtStart);

  console.log('\nclicking the canvas after arming Window commits IMMEDIATELY - no intermediate placement form');
  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  fabWindowBtn.dispatchEvent(new Event('click', { bubbles: true }));
  // Click at pixel (90, 80) on the 10px/col x 20px/row grid: gridMetrics'
  // conversion is Math.round(px/cell) + 1, so this lands at col 10, line 5
  // (round(90/10)=9, +1=10; round(80/20)=4, +1=5).
  const screenEl = doc.querySelector('.dspf-screen');
  screenEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 90, clientY: 80 }));
  check('placement mode turns off once the click lands', !doc.querySelector('.dspf-screen.placing'));
  check('fabWindowBtn is inactive again', !fabWindowBtn.classList.contains('active'));
  check('the hint is hidden again', hint.classList.contains('hidden'));
  check("no intermediate placement form - there's no #p-place-line the way +Field/+Constant/Copy open", !doc.getElementById('p-place-line'));

  const last = posted[posted.length - 1];
  check('exactly one applyEdit was posted, straight away', last && last.type === 'applyEdit');
  check('the new record is named WDW1 (auto-numbering starts at 1, not 2)', /R\s+WDW1\b/.test(last.text));
  check('WINDOW is sized from the click - line 5, col 10, default 10x40 height/width', /WDW1[\s\S]*?WINDOW\(5 10 10 40\)/.test(last.text));
  check("WDWTITLE carries a placeholder title", /WDW1[\s\S]*?WDWTITLE\('New window'\)/.test(last.text));
  check('the record select switched to the newly-created window record', recordSelect.value === 'WDW1');

  console.log('\na second use auto-numbers to WDW2, skipping the now-taken WDW1');
  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  fabWindowBtn.dispatchEvent(new Event('click', { bubbles: true }));
  // Re-query .dspf-screen: the first commit's render() rebuilt
  // screenOutput's innerHTML, so the earlier `screenEl` reference is now a
  // detached node - dispatching on it wouldn't bubble to screenOutput's
  // listener at all (same "DOM elements must be re-queried after each
  // render()" rule this project's own testing notes call out).
  const screenEl2 = doc.querySelector('.dspf-screen');
  screenEl2.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 190, clientY: 180 }));
  // round(190/10)=19,+1=20 col; round(180/20)=9,+1=10 line.
  const last2 = posted[posted.length - 1];
  check('the second window is named WDW2', last2 && last2.type === 'applyEdit' && /R\s+WDW2\b/.test(last2.text));
  check('WDW1 is still there too (this was an ADD, not a replace)', /R\s+WDW1\b/.test(last2.text));
  check('WDW2 got its own geometry from its own click', /WDW2[\s\S]*?WINDOW\(10 20 10 40\)/.test(last2.text));
  check('record select switched to WDW2', recordSelect.value === 'WDW2');

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

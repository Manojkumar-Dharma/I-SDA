/**
 * toolboxMenuTool.test.js
 *
 * Task P4 (LIMITATIONS-PLAN.md's P series) - the floating toolbox's
 * "Menu" tool: one click drops a ready-made PULLDOWN record. Unlike the
 * Window tool (P3), this does NOT arm a placement mode or wait for a
 * canvas click at all - a PULLDOWN record carries no WINDOW keyword and
 * has no line/col/size of its own in real DDS, so there is nothing for a
 * canvas click to supply. Confirming that absence is itself a real
 * assertion here (no 'placing' crosshair class ever appears, no hint
 * text shows, nothing waits on a canvas click), not just an omission.
 *
 * Runs the actual generated client-side script in jsdom (same harness
 * toolboxWindowTool.test.js/toolboxFab.test.js already use). Covers:
 *   - clicking the fab item closes the popover and commits IMMEDIATELY -
 *     no armed placement mode, no crosshair class, no hint text
 *   - the resulting record carries a bare PULLDOWN keyword, no geometry
 *   - auto-naming starts at PDN1, then increments to PDN2 on a second use
 *   - the record select switches to the newly-created pulldown record
 *   - a completely unrelated field/constant placement mode (armed via
 *     +Field beforehand) is left untouched by clicking Menu - the two
 *     don't interfere with each other
 * Run with: node src/test/toolboxMenuTool.test.js
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
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const toggle = doc.getElementById('toolboxFabToggle');
  const fab = doc.getElementById('toolboxFab');
  const fabMenuBtn = doc.getElementById('fabMenuBtn');
  const hint = doc.getElementById('placementHint');
  const recordSelect = doc.getElementById('recordSelect');

  check('setup: fabMenuBtn exists', !!fabMenuBtn);
  const postedAtStart = posted.length; // the webview posts its own 'ready' message on load

  console.log('clicking "Menu" closes the popover and commits IMMEDIATELY - no canvas click involved');
  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  check('popover open', fab.classList.contains('open'));
  fabMenuBtn.dispatchEvent(new Event('click', { bubbles: true }));
  check('popover closed itself', !fab.classList.contains('open'));
  check('no placement mode was armed - the hint never shows', hint.classList.contains('hidden'));
  check('no crosshair "placing" class ever appears on the canvas - nothing was waiting on a click', !doc.querySelector('.dspf-screen.placing'));
  check('fabMenuBtn never gains an "active" class the way fabWindowBtn does while armed - there is no armed state to reflect', !fabMenuBtn.classList.contains('active'));

  const last = posted[posted.length - 1];
  check('exactly one applyEdit was posted, straight away, with no canvas click at all', last && last.type === 'applyEdit' && posted.length === postedAtStart + 1);
  check('the new record is named PDN1 (auto-numbering starts at 1, not 2)', /R\s+PDN1\b/.test(last.text));
  check('PDN1 carries a bare PULLDOWN keyword', /PDN1[\s\S]*?PULLDOWN/.test(last.text));
  check('PDN1 carries no WINDOW keyword - a pulldown has no geometry of its own', !/PDN1[\s\S]*?WINDOW\(/.test(last.text));
  check('the record select switched to the newly-created pulldown record', recordSelect.value === 'PDN1');

  console.log('\na second use auto-numbers to PDN2, skipping the now-taken PDN1');
  fabMenuBtn.dispatchEvent(new Event('click', { bubbles: true }));
  const last2 = posted[posted.length - 1];
  check('the second pulldown is named PDN2', last2 && last2.type === 'applyEdit' && /R\s+PDN2\b/.test(last2.text));
  check('PDN1 is still there too (this was an ADD, not a replace)', /R\s+PDN1\b/.test(last2.text));
  check('record select switched to PDN2', recordSelect.value === 'PDN2');

  console.log('\nclicking "Menu" does not disturb an UNRELATED placement mode already armed via +Field');
  const placeFieldBtn = doc.getElementById('placeFieldBtn');
  placeFieldBtn.dispatchEvent(new Event('click', { bubbles: true }));
  check('setup: Field placement mode is now armed', placeFieldBtn.classList.contains('active'));
  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  fabMenuBtn.dispatchEvent(new Event('click', { bubbles: true }));
  check('a third pulldown (PDN3) was still created', /R\s+PDN3\b/.test(posted[posted.length - 1].text));
  check('Field placement mode is UNCHANGED - still armed, Menu did not cancel it', placeFieldBtn.classList.contains('active'));
  // Clean up so this scenario doesn't leak placement mode into anything
  // that might run after it in the same process.
  placeFieldBtn.dispatchEvent(new Event('click', { bubbles: true }));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

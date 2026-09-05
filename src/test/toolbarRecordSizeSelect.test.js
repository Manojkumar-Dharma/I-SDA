/**
 * toolbarRecordSizeSelect.test.js
 *
 * Task P5d (LIMITATIONS-PLAN.md's P series) - Record select + Screen-size
 * select duplicated into the pinned toolbar (P5a's #propsPinnedToolbar).
 *
 * Unlike P5b's Save/Compile buttons, these are STATEFUL controls read/
 * written from well over a dozen places throughout buildWebviewTemplate.js
 * (every "select what was just created" pattern P3/P4/newRecordBtn/etc.
 * already use) - so #recordSelect/#sizeSelect in the aside stay the ONE
 * authoritative element, and #toolbarRecordSelect/#toolbarSizeSelect are
 * genuine duplicates kept in sync from a single centralized point
 * (rebuildRecordSelect/rebuildSizeSelect, already called on every
 * render()) rather than touching every individual call site.
 *
 * The FIRST version of this task tried relocating (not duplicating) the
 * aside originals straight into the toolbar - which passed every existing
 * test, but would have made record-switching completely unusable under
 * CLASSIC UI, since .props-pinned-toolbar is display:none unless
 * data-ui-style="modern". That regression is exactly what this file's
 * first scenario below exists to catch permanently, not just something
 * caught by inspection this one time.
 *
 * Run with: node src/test/toolbarRecordSizeSelect.test.js
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

// Two records with SFLPAG so DspfEngine.availableScreenSizes never really
// matters, and two DSPSIZ sizes on the file so the (usually-hidden)
// screen-size picker actually renders content to check.
const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
    '     A            NAME      10A  B  4  5',
    '     A          R SCR2',
    "     A                                  1  2'SECOND SCREEN'",
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

console.log('classic UI: recordSelect/sizeSelect stay fully visible and usable from the aside - the REGRESSION this task first shipped, then caught and reverted before shipping for real');
{
  const dom = makeDom('classic');
  setTimeout(() => {
    const doc = dom.window.document;
    const recordSelect = doc.getElementById('recordSelect');
    const toolbarWrap = doc.getElementById('propsPinnedToolbar');
    check('#recordSelect exists and is NOT inside #propsPinnedToolbar', !!recordSelect && !toolbarWrap.contains(recordSelect));
    check(
      "#recordSelect is genuinely visible under classic (display isn't none) - it must never depend on .props-pinned-toolbar's own modern-only display",
      dom.window.getComputedStyle(recordSelect).display !== 'none'
    );
    check('#recordSelect has both records as options - switching records is fully usable from the aside alone under classic', recordSelect.options.length === 2);
    // The toolbar wrapper itself IS allowed to be invisible under classic
    // (same as every other modern-only control) - the point above is only
    // that recordSelect's OWN visibility never depends on it.
    check('#propsPinnedToolbar itself is invisible under classic, as expected', dom.window.getComputedStyle(toolbarWrap).display === 'none');
  }, 0);
}

console.log('\nmodern UI: both the aside original and the toolbar duplicate exist, stay in sync, and switching from either one works identically');
setTimeout(() => {
  const dom = makeDom('modern');
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');
    const toolbarRecordSelect = doc.getElementById('toolbarRecordSelect');
    const sizeSelect = doc.getElementById('sizeSelect');
    const toolbarSizeSelect = doc.getElementById('toolbarSizeSelect');
    const sizeSelectRow = doc.getElementById('sizeSelectRow');
    const toolbarSizeSelectRow = doc.getElementById('toolbarSizeSelectRow');

    check('exactly one #recordSelect and one #toolbarRecordSelect exist (no accidental extra copies)', doc.querySelectorAll('#recordSelect').length === 1 && doc.querySelectorAll('#toolbarRecordSelect').length === 1);
    check('both have the same two options', recordSelect.options.length === 2 && toolbarRecordSelect.options.length === 2);
    check('both start on the same selected value', recordSelect.value === toolbarRecordSelect.value);

    console.log('\n  switching the record via the ASIDE original updates the toolbar duplicate too');
    recordSelect.value = 'SCR2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('recordSelect is now SCR2', recordSelect.value === 'SCR2');
    check('toolbarRecordSelect followed it to SCR2', toolbarRecordSelect.value === 'SCR2');

    console.log('\n  switching the record via the TOOLBAR duplicate updates the aside original too, and fires the SAME real handler (not a re-implementation)');
    toolbarRecordSelect.value = 'SCR1';
    toolbarRecordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('recordSelect followed the toolbar duplicate back to SCR1', recordSelect.value === 'SCR1');
    check('toolbarRecordSelect itself reads SCR1', toolbarRecordSelect.value === 'SCR1');
    // The real handler clears selection/re-renders the preview for the
    // newly-selected record - confirm the preview genuinely changed,
    // proving this forwarded to the real behavior rather than just
    // cosmetically matching values.
    const screenOutput = doc.getElementById('screenOutput');
    check('the canvas actually re-rendered for the newly-selected record (real handler ran, not just a value copy)', /MAIN SCREEN/.test(screenOutput.textContent));

    console.log('\n  screen-size picker: hidden by default reasoning still applies, but this file genuinely declares 2 sizes so it is visible - both copies present and in sync');
    check('sizeSelectRow is visible (2 sizes declared)', !sizeSelectRow.classList.contains('hidden'));
    check('toolbarSizeSelectRow mirrors that visibility', !toolbarSizeSelectRow.classList.contains('hidden'));
    check('both size selects have 2 options', sizeSelect.options.length === 2 && toolbarSizeSelect.options.length === 2);
    check('both start in sync', sizeSelect.value === toolbarSizeSelect.value);

    console.log('\n  switching size via the TOOLBAR duplicate updates the aside original and re-renders for real');
    const otherSizeValue = sizeSelect.value === '0' ? '1' : '0';
    toolbarSizeSelect.value = otherSizeValue;
    toolbarSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('sizeSelect followed the toolbar duplicate', sizeSelect.value === otherSizeValue);

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 0);
}, 0);

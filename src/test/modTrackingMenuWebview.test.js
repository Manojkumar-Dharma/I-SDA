/**
 * modTrackingMenuWebview.test.js
 *
 * End-to-end jsdom coverage for Task M8 (docs/sda-reference/LIMITATIONS-PLAN.md) -
 * the menu designer's own "Track modifications" checkbox + tag box (ported
 * from the DSPF designer's Task L38), and the resulting behavior of
 * commitMenuSourceChange() itself - the menu designer's own single choke
 * point every applyEdit now funnels through, matching the DSPF designer's
 * commitSourceChange (see modTrackingWebview.test.js, the DSPF designer's
 * own copy of this test, for why this needs an actual running script, not
 * just string-contains assertions on the generated HTML).
 * modificationTracking.test.js covers the shared DspfWriter primitives
 * directly (commentOutLine/buildModTag/appendModTag/applyModificationTracking) -
 * this covers the menu designer's own UI wiring around them.
 * Run with: node src/test/modTrackingMenuWebview.test.js
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
    "     A                                      DSPSIZ(24 80 *DS3)",
    "     A          R MENU",
    "     A                                  1  2'MAIN MENU'",
    "     A                                  3  5'1. Display library list'",
    "     A                                  4  5'2. Change current library'",
  ].join('\n') + '\n';
const commandSource = '0001 DSPLIBL\n0002 CHGCURLIB\n';

function makeDom(nonce) {
  const html = getMenuWebviewHtml('vscode-webview://fake', nonce, menuSource, commandSource, 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded').replace(
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
    },
  });
  return { dom, posted };
}

console.log('Task M8: modification-tracking controls start off/blank, driven by the modTrackingConfig message');
{
  const { dom } = makeDom('mnumodtrack1');
  setTimeout(() => {
    const doc = dom.window.document;
    const toggle = doc.getElementById('modTrackingToggle');
    const tagInput = doc.getElementById('modTrackingTagInput');
    check('toggle and tag input are both present in the Options panel', !!toggle && !!tagInput);
    check('starts unchecked before any modTrackingConfig message arrives', !toggle.checked);
    check('tag box starts blank', tagInput.value === '');

    console.log('\n  the extension host\'s modTrackingConfig message (sent on ready) supplies the starting values');
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'JDOE0902' }, '*');
    setTimeout(() => {
      check('checkbox reflects the incoming enabled=true', toggle.checked);
      check('tag box reflects the incoming tag', tagInput.value === 'JDOE0902');

      runEditingScenario();
    }, 0);
  }, 0);
}

function runEditingScenario() {
  console.log('\nTask M8: an option-label edit, with tracking on, comments out the old line and tags the new one');
  const { dom, posted } = makeDom('mnumodtrack2');
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'TESTTAG12' }, '*');

    setTimeout(() => {
      const rows = Array.from(doc.querySelectorAll('.option-row'));
      const row1 = rows.find((r) => r.querySelector('.option-num-badge').textContent === '1');
      check('setup: option 1 is present', !!row1);
      const labelInput = row1.querySelector('.option-label-input');
      labelInput.value = 'Show library list';
      labelInput.dispatchEvent(new Event('change', { bubbles: true }));

      const last = posted[posted.length - 1];
      check('an edit was posted', last && last.type === 'applyEdit');
      const lines = last.text.split(/\r\n|\r|\n/);
      check(
        'the original option-1 line survives, now commented out (column 7 = *)',
        lines.some((l) => l.charAt(6) === '*' && l.includes('Display library list'))
      );
      check(
        'a new option-1 line carries the changed label and the tag past column 80',
        lines.some((l) => l.charAt(6) !== '*' && l.includes('Show library list') && l.slice(80, 90) === 'TESTTAG12')
      );

      const commentedCountBefore = lines.filter((l) => l.charAt(6) === '*' && l.includes('Display library list')).length;

      console.log('\n  turning tracking back off (session-only toggle) reverts to plain in-place edits, no comment/tag');
      const toggle = doc.getElementById('modTrackingToggle');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      const rows2 = Array.from(doc.querySelectorAll('.option-row'));
      const row2 = rows2.find((r) => r.querySelector('.option-num-badge').textContent === '2');
      const labelInput2 = row2.querySelector('.option-label-input');
      labelInput2.value = 'Change library list';
      labelInput2.dispatchEvent(new Event('change', { bubbles: true }));

      const last2 = posted[posted.length - 1];
      const lines2 = last2.text.split(/\r\n|\r|\n/);
      const commentedCountAfter = lines2.filter((l) => l.charAt(6) === '*' && l.includes('Display library list')).length;
      check('no NEW commented-out line from this second edit - tracking is off', commentedCountAfter === commentedCountBefore);
      // Option 1's line still legitimately carries its tag from the FIRST
      // (tracked) edit above - untouched by this second edit, so that's not
      // a regression. What matters here is that THIS edit's own line -
      // option 2's, freshly rewritten by writeOptionLabel - carries no tag.
      const option2Line = lines2.find((l) => l.includes('Change library list'));
      check('option 2 was still edited in place', !!option2Line);
      check('the freshly-edited option-2 line carries no tag past column 80 - tracking is off', option2Line.length <= 80);

      console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
      process.exit(failures === 0 ? 0 : 1);
    }, 0);
  }, 0);
}

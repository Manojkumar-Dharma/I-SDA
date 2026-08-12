/**
 * menuWebview.test.js
 *
 * Everything menu.test.js checks about the generated HTML is string-contains
 * assertions - useful, but it never actually RUNS the client-side script, so
 * it can't catch a bug in extractMenuOptions()'s regex, a typo in a DOM
 * selector, or the postMessage payload shape - exactly the kind of bug that
 * only shows up once a real browser (or jsdom, here) parses and executes the
 * webview's own JS. Run with: node src/test/menuWebview.test.js
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
    "     A                                  5  5'10. Sign off'",
  ].join('\n') + '\n';
const commandSource = '0001 DSPLIBL\n0002 CHGCURLIB\n';

// jsdom doesn't enforce the webview CSP meta tag (and has no need to for this
// test), so it's stripped rather than wiring up a nonce it would otherwise reject.
const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce', menuSource, commandSource, 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);

const posted = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m) });
  },
});

// Inline <script> execution in jsdom happens synchronously during parse, but
// give the microtask queue a turn before asserting to be safe.
setTimeout(() => {
  const doc = dom.window.document;
  const rows = Array.from(doc.querySelectorAll('.option-row'));

  console.log('client-side rendering (extractMenuOptions + cross-reference)');
  check('renders one row per numbered option constant found in the DDS', rows.length === 3);
  check('option 1 shows its label from the DDS constant', rows[0].querySelector('.option-label').textContent === 'Display library list');
  check('option 1 shows its command from the MNUCMD source', rows[0].querySelector('.option-cmd').value === 'DSPLIBL');
  check('option 2 cross-references correctly too', rows[1].querySelector('.option-cmd').value === 'CHGCURLIB');
  check('option 10 (two-digit) parses correctly and has no command yet', rows[2].querySelector('.option-num').textContent === '10' && rows[2].querySelector('.option-cmd').value === '');
  check('renders the actual 5250 screen text, not just the options panel', doc.getElementById('screenOutput').textContent.includes('MAIN MENU'));

  console.log('\nediting a command in the browser');
  const input = rows[2].querySelector('.option-cmd');
  input.value = 'SIGNOFF';
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const last = posted[posted.length - 1];
  check('posts applyMenuCmdEdit with the regenerated MNUCMD source', last && last.type === 'applyMenuCmdEdit');
  check('the regenerated source is well-formed and includes the new mapping', last && last.text === '0001 DSPLIBL\n0002 CHGCURLIB\n0010 SIGNOFF\n');
  check('the original two options are untouched in the regenerated source', last && last.text.includes('0001 DSPLIBL') && last.text.includes('0002 CHGCURLIB'));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 100);

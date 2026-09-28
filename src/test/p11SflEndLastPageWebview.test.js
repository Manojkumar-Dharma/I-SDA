/**
 * P11 (+ P6 button coverage) - the hint-bar buttons in the real generated
 * client script: "Show last page" for an UNCONDITIONED SFLEND, and P6's
 * "Press CFnn" SFLDROP/SFLFOLD key. Both must survive together (the hint text
 * is assigned before either button is appended), flip the preview, and reset
 * when the record changes.
 * Run with: node src/test/p11SflEndLastPageWebview.test.js
 */
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const src = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A          R SFLREC                    SFL',
  '     A            ROWNAME       20A  O  3  2',
  '     A            ROWDESC       30A  O  4  6',
  '     A          R CTLREC                    SFLCTL(SFLREC)',
  '     A                                      SFLSIZ(0020)',
  '     A                                      SFLPAG(0005)',
  '     A                                      SFLDSP',
  '     A                                      SFLDSPCTL',
  '     A                                      SFLDROP(CF03)',
  '     A                                      SFLEND(*MORE)',
  '     A          R PLAINREC',
  "     A                                  1  2'PLAIN'",
].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'MYSCR.DSPF');
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;
  const select = (name) => {
    const rs = doc.getElementById('recordSelect');
    rs.value = name;
    rs.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const click = (id) => doc.getElementById(id).dispatchEvent(new Event('click', { bubbles: true }));
  const moreText = () => { const el = doc.querySelector('.dspf-subfile-more-line'); return el ? el.textContent : null; };

  select('CTLREC');
  console.log('P11 webview: both hint-bar buttons present together');
  check('"Show last page" button present', !!doc.getElementById('sflEndLastPageBtn'));
  check('P6 "Press CF03" button present too', !!doc.getElementById('sflFoldToggleBtn'));
  check('default text is More...', moreText() === 'More...');
  check('button reads "Show last page"', doc.getElementById('sflEndLastPageBtn').textContent === 'Show last page');
  check('hint says the first page is shown (end state not knowable)', doc.getElementById('mainHint').textContent.indexOf('first page shown') !== -1);

  console.log('P11 webview: clicking flips to the Bottom form');
  click('sflEndLastPageBtn');
  check('text now Bottom', moreText() === 'Bottom');
  check('button now reads "Show first page"', doc.getElementById('sflEndLastPageBtn').textContent === 'Show first page');
  check('hint says last page shown', doc.getElementById('mainHint').textContent.indexOf('last page shown') !== -1);
  check('P6 button still there after the re-render', !!doc.getElementById('sflFoldToggleBtn'));

  console.log('P11 webview: the two toggles are independent');
  const before = doc.getElementById('screenOutput').innerHTML;
  click('sflFoldToggleBtn');
  check('SFLDROP key press changes the drawn rows', doc.getElementById('screenOutput').innerHTML !== before);
  check('last-page state survives the fold toggle', moreText() === 'Bottom');
  click('sflFoldToggleBtn');

  console.log('P11 webview: clicking again returns to More...');
  click('sflEndLastPageBtn');
  check('text back to More...', moreText() === 'More...');

  console.log('P11 webview: state resets when the record changes');
  click('sflEndLastPageBtn');
  select('PLAINREC');
  select('CTLREC');
  check('back on CTLREC the default (More...) is shown, not the toggled state', moreText() === 'More...');
  check('button offers "Show last page" again', doc.getElementById('sflEndLastPageBtn').textContent === 'Show last page');

  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

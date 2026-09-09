/**
 * toolbarFileStatusBadge.test.js
 *
 * Task P5c (LIMITATIONS-PLAN.md's P series) - the Code-for-IBM-i connection
 * badge migrated into the pinned toolbar (P5a's #propsPinnedToolbar), same
 * "genuine second element, one computed state applied to both" reasoning
 * P5b's own toolbarSaveCompile.test.js already covers for Save/Compile.
 *
 * Bug fix - #toolbarFileStatus (the toolbar's own copy of the display file
 * name, shown just before the IBM i connection badge) was removed outright
 * back at L62; the aside's OWN #fileStatus (the left panel's copy, above
 * the badge there) has now been removed too - it duplicated the editor
 * tab's own filename for no benefit. Neither element exists anywhere in
 * this document any more; both negative assertions below are the
 * regression check for that, so it can't silently come back.
 *
 * Bug fix - .codefori-badge's own margin-bottom (meant for its original
 * vertical stacking in the aside) was visibly misaligning the toolbar
 * badge against #toolbarSaveBtn sitting right next to it in that flex row;
 * #propsPinnedToolbar .codefori-badge { margin-bottom: 0; } fixes that,
 * scoped to just the toolbar copy so the aside's own spacing is untouched.
 * Run with: node src/test/toolbarFileStatusBadge.test.js
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

const dom = new JSDOM(
  getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF', 'modern').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  ),
  {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  }
);

setTimeout(() => {
  const doc = dom.window.document;
  const { MessageEvent } = dom.window;

  const toolbarBadge = doc.getElementById('toolbarCodeForIBadge');
  const asideBadge = doc.getElementById('codeForIBadge');
  const toolbarSaveBtn = doc.getElementById('toolbarSaveBtn');

  console.log('setup: the toolbar badge exists inside #propsPinnedToolbar; neither of the two filename labels exist anywhere any more');
  check('#toolbarCodeForIBadge exists', !!toolbarBadge);
  check('#toolbarCodeForIBadge lives inside #propsPinnedToolbar', doc.getElementById('propsPinnedToolbar').contains(toolbarBadge));
  check('the aside\'s own badge is still present, untouched', !!asideBadge);
  check('bug fix: #toolbarFileStatus no longer exists - removed, not just hidden', !doc.getElementById('toolbarFileStatus'));
  check('bug fix: the aside\'s own #fileStatus no longer exists either - removed, not just hidden', !doc.getElementById('fileStatus'));

  console.log('\nbug fix: the toolbar badge no longer has an unbalanced bottom margin misaligning it against the Save button beside it');
  const toolbarBadgeMarginBottom = dom.window.getComputedStyle(toolbarBadge).marginBottom;
  check('#toolbarCodeForIBadge computes to margin-bottom: 0px', toolbarBadgeMarginBottom === '0px');
  const asideBadgeMarginBottom = dom.window.getComputedStyle(asideBadge).marginBottom;
  check('...while the aside\'s own badge keeps its original margin-bottom: 10px, untouched', asideBadgeMarginBottom === '10px');
  check('setup: the Save button sits right there for the alignment fix to actually matter', !!toolbarSaveBtn);

  console.log('\nconnection state applies to BOTH the aside badge and its toolbar counterpart from one codeForIStatus message');
  check('both badges start in the unknown/checking state', toolbarBadge.classList.contains('unknown') && asideBadge.classList.contains('unknown'));
  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'codeForIStatus', installed: false, connected: false } }));
  check('toolbar badge reflects not-installed', toolbarBadge.classList.contains('unknown') && toolbarBadge.textContent === 'IBM i: not installed');
  check('aside badge reflects not-installed too (stays in sync)', asideBadge.classList.contains('unknown') && asideBadge.textContent === 'IBM i: not installed');

  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'codeForIStatus', installed: true, connected: false } }));
  check('toolbar badge reflects installed-but-disconnected', toolbarBadge.classList.contains('disconnected') && toolbarBadge.textContent === 'IBM i: not connected');
  check('aside badge reflects it too', asideBadge.classList.contains('disconnected') && asideBadge.textContent === 'IBM i: not connected');

  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'codeForIStatus', installed: true, connected: true } }));
  check('toolbar badge reflects connected', toolbarBadge.classList.contains('connected') && toolbarBadge.textContent === 'IBM i: connected');
  check('aside badge reflects connected too', asideBadge.classList.contains('connected') && asideBadge.textContent === 'IBM i: connected');
  check('the two badges never drift onto different classes from the same message', toolbarBadge.className === asideBadge.className);

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

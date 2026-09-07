/**
 * toolbarFileStatusBadge.test.js
 *
 * Task P5c (LIMITATIONS-PLAN.md's P series) - the Code-for-IBM-i connection
 * badge migrated into the pinned toolbar (P5a's #propsPinnedToolbar), same
 * "genuine second element, one computed state applied to both" reasoning
 * P5b's own toolbarSaveCompile.test.js already covers for Save/Compile.
 *
 * Bug fix - #toolbarFileStatus (the toolbar's own copy of the display file
 * name, shown just before the IBM i connection badge) has been REMOVED
 * outright, not just left alone: it duplicated the aside's own #fileStatus
 * for no reason (the two badges above it already make clear which file/
 * connection state you're looking at), and it's what was actually creating
 * the "filename" clutter in front of the IBM i badge people were asking to
 * have removed. This file used to also assert #toolbarFileStatus's
 * existence/content; that coverage is gone along with the element - the
 * negative assertion below (asserting the element no longer exists) is the
 * replacement regression check, so it can't silently come back.
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
  const asideFileStatus = doc.getElementById('fileStatus');
  const asideBadge = doc.getElementById('codeForIBadge');

  console.log('setup: the toolbar badge exists inside #propsPinnedToolbar; the aside originals are untouched; the toolbar\'s own filename label is gone');
  check('#toolbarCodeForIBadge exists', !!toolbarBadge);
  check('#toolbarCodeForIBadge lives inside #propsPinnedToolbar', doc.getElementById('propsPinnedToolbar').contains(toolbarBadge));
  check('the aside\'s own file status label is still present, untouched', !!asideFileStatus);
  check('the aside\'s own badge is still present, untouched', !!asideBadge);
  check('bug fix: #toolbarFileStatus no longer exists - removed, not just hidden', !doc.getElementById('toolbarFileStatus'));

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

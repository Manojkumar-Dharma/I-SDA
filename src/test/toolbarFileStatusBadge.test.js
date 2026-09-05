/**
 * toolbarFileStatusBadge.test.js
 *
 * Task P5c (LIMITATIONS-PLAN.md's P series) - the file status label and the
 * Code-for-IBM-i connection badge migrated into the pinned toolbar (P5a's
 * #propsPinnedToolbar), same "genuine second element, one computed state
 * applied to both" reasoning P5b's own toolbarSaveCompile.test.js already
 * covers for Save/Compile. #toolbarFileStatus needs no message-driven sync
 * (the aside original is itself static, set once from the FILENAME_TOKEN at
 * render time and never touched by any later message - see
 * buildWebviewTemplate.js's own grep-confirmed absence of any other
 * `fileStatus` reference), so this only covers that both copies render the
 * same filename. #toolbarCodeForIBadge DOES need the sync check, mirroring
 * toolbarSaveCompile.test.js's own codeForIStatus coverage.
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

  const toolbarFileStatus = doc.getElementById('toolbarFileStatus');
  const toolbarBadge = doc.getElementById('toolbarCodeForIBadge');
  const asideFileStatus = doc.getElementById('fileStatus');
  const asideBadge = doc.getElementById('codeForIBadge');

  console.log('setup: both toolbar elements exist, live inside #propsPinnedToolbar, and their aside originals are untouched');
  check('#toolbarFileStatus exists', !!toolbarFileStatus);
  check('#toolbarCodeForIBadge exists', !!toolbarBadge);
  check('#toolbarFileStatus lives inside #propsPinnedToolbar', doc.getElementById('propsPinnedToolbar').contains(toolbarFileStatus));
  check('#toolbarCodeForIBadge lives inside #propsPinnedToolbar', doc.getElementById('propsPinnedToolbar').contains(toolbarBadge));
  check('the aside\'s own file status label is still present, untouched', !!asideFileStatus);
  check('the aside\'s own badge is still present, untouched', !!asideBadge);

  console.log('\nthe toolbar file status label shows the same filename as the aside original (static - set once at render, never re-synced by a message)');
  check('toolbar file status shows the filename', toolbarFileStatus.textContent === 'MYSCR.DSPF');
  check('matches the aside original exactly', toolbarFileStatus.textContent === asideFileStatus.textContent);

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

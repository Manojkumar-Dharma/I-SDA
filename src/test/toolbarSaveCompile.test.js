/**
 * toolbarSaveCompile.test.js
 *
 * Task P5b (LIMITATIONS-PLAN.md's P series) - Save and Compile Display File
 * (CRTDSPF) migrated into the pinned toolbar (P5a's #propsPinnedToolbar).
 * Unlike P1's toolboxFab items, #toolbarSaveBtn/#toolbarCompileBtn are
 * genuine second buttons with their own click handlers (not proxies to the
 * aside originals) - see buildWebviewTemplate.js's own doc comment on why -
 * so this covers each one's OWN wiring directly, plus that both the aside
 * original and its toolbar counterpart stay in sync on shared state
 * (dirty indicator, connection-gated visibility) rather than drifting.
 * Run with: node src/test/toolbarSaveCompile.test.js
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  }
);

setTimeout(() => {
  const doc = dom.window.document;
  const { Event, MessageEvent } = dom.window;

  const toolbarSaveBtn = doc.getElementById('toolbarSaveBtn');
  const toolbarCompileBtn = doc.getElementById('toolbarCompileBtn');
  const asideSaveBtn = doc.getElementById('saveDocBtn');
  const asideCompileBtn = doc.getElementById('compileDspfBtn');

  console.log('setup: both toolbar buttons exist, live inside #propsPinnedToolbar, and their aside originals are untouched');
  check('#toolbarSaveBtn exists', !!toolbarSaveBtn);
  check('#toolbarCompileBtn exists', !!toolbarCompileBtn);
  check('#toolbarSaveBtn lives inside #propsPinnedToolbar', doc.getElementById('propsPinnedToolbar').contains(toolbarSaveBtn));
  check('#toolbarCompileBtn lives inside #propsPinnedToolbar', doc.getElementById('propsPinnedToolbar').contains(toolbarCompileBtn));
  check('the aside\'s own Save button is still present, untouched', !!asideSaveBtn);
  check('the aside\'s own Compile button is still present, untouched', !!asideCompileBtn);

  console.log('\nclicking the toolbar Save button posts saveDocument directly (not a proxy click on the aside button)');
  toolbarSaveBtn.dispatchEvent(new Event('click', { bubbles: true }));
  check('posts saveDocument', posted.some((m) => m.type === 'saveDocument'));

  console.log('\nclicking the toolbar Compile button posts compileDspf directly');
  toolbarCompileBtn.dispatchEvent(new Event('click', { bubbles: true }));
  check('posts compileDspf', posted.some((m) => m.type === 'compileDspf'));

  console.log('\ndirty-state indicator applies to BOTH the aside Save button and its toolbar counterpart from one dirtyState message');
  check('toolbar Save starts without the dirty indicator', !toolbarSaveBtn.classList.contains('save-btn-dirty'));
  check('aside Save starts without the dirty indicator', !asideSaveBtn.classList.contains('save-btn-dirty'));
  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'dirtyState', isDirty: true } }));
  check('toolbar Save gets the dirty class', toolbarSaveBtn.classList.contains('save-btn-dirty'));
  check('toolbar Save text signals unsaved changes', toolbarSaveBtn.textContent.includes('unsaved changes'));
  check('aside Save also gets the dirty class (stays in sync)', asideSaveBtn.classList.contains('save-btn-dirty'));
  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'dirtyState', isDirty: false } }));
  check('toolbar Save dirty class clears', !toolbarSaveBtn.classList.contains('save-btn-dirty'));
  check('aside Save dirty class clears too', !asideSaveBtn.classList.contains('save-btn-dirty'));

  console.log('\nconnection-gated visibility applies to BOTH the aside Compile button and its toolbar counterpart from one codeForIStatus message');
  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'codeForIStatus', installed: true, connected: false } }));
  check('toolbar Compile hides when not connected', toolbarCompileBtn.classList.contains('hidden'));
  check('aside Compile hides too (stays in sync)', asideCompileBtn.classList.contains('hidden'));
  dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'codeForIStatus', installed: true, connected: true } }));
  check('toolbar Compile reappears when connected', !toolbarCompileBtn.classList.contains('hidden'));
  check('aside Compile reappears too', !asideCompileBtn.classList.contains('hidden'));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

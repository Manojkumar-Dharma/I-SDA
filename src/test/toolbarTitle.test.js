/**
 * toolbarTitle.test.js
 *
 * Task P5f (LIMITATIONS-PLAN.md's P series) - the aside's own h1 ("IBM i ·
 * DDS")/h2 ("Screen Design") branding folds into a single slim title line
 * in the pinned toolbar (P5a's #propsPinnedToolbar), rather than a
 * separate top bar. Unlike P5b/c/d's own migrations (a genuine second
 * element mirroring an aside original 1:1), this one is a redesign, not a
 * duplicate: "IBM i · DDS" is dropped as purely decorative, "Screen
 * Design" survives, and a live record count is added - something neither
 * h1 nor h2 ever showed. The aside's own h1/h2 are left completely
 * untouched (still there, unchanged - see the coexist-until-P5i rule
 * every P5b-h migration so far has followed), so this only needs to
 * cover the NEW toolbar title, not equivalence with an aside original the
 * way P5b/c/d's own tests do.
 * Run with: node src/test/toolbarTitle.test.js
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
    '     A          R SCR2',
    "     A                                  1  2'SECOND SCREEN'",
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
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  }
);

setTimeout(() => {
  const doc = dom.window.document;
  const { Event, MouseEvent } = dom.window;

  const toolbarTitle = doc.getElementById('toolbarTitle');
  const asideH1 = doc.querySelector('aside h1');
  const asideH2 = doc.querySelector('aside h2');

  check('toolbarTitle exists in the pinned toolbar', !!toolbarTitle);
  check('the aside\'s own h1 ("IBM i · DDS") is untouched, still there', !!asideH1 && asideH1.textContent === 'IBM i \u00b7 DDS');
  check('the aside\'s own h2 ("Screen Design") is untouched, still there', !!asideH2 && asideH2.textContent === 'Screen Design');
  check(
    'toolbarTitle shows "Screen Design" plus a live record count, starting at 2 records for this fixture',
    toolbarTitle.textContent === 'Screen Design \u00b7 2 records'
  );
  check('toolbarTitle does NOT repeat the decorative "IBM i · DDS" branding - dropped, per this task\'s own row', !toolbarTitle.textContent.includes('IBM i'));

  console.log('\ndropping a new Window record (Task P3) updates the live count without a page reload');
  const toggle = doc.getElementById('toolboxFabToggle');
  const fabWindowBtn = doc.getElementById('fabWindowBtn');
  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  fabWindowBtn.dispatchEvent(new Event('click', { bubbles: true }));
  doc.querySelector('.dspf-screen').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 90, clientY: 80 }));
  check('the count updated to 3 records after the new WDW1 record landed', toolbarTitle.textContent === 'Screen Design \u00b7 3 records');

  console.log('\nsingular "record" (not "records") when there is exactly one');
  const singleRecordSource =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R SCR1',
      "     A                                  1  2'MAIN SCREEN'",
    ].join('\n') + '\n';
  const singleDom = new JSDOM(
    getWebviewHtml('vscode-webview://fake', 'testnonce', singleRecordSource, 'MYSCR.DSPF', 'modern').replace(
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
    const singleDoc = singleDom.window.document;
    check('a single-record file reads "1 record", singular', singleDoc.getElementById('toolbarTitle').textContent === 'Screen Design \u00b7 1 record');

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 0);
}, 0);

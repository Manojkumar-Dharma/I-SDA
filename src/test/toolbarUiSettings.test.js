/**
 * toolbarUiSettings.test.js
 *
 * Task P5h (LIMITATIONS-PLAN.md's P series) - the aside's own UI Settings
 * accordion (style toggle + theme select) gets a second home inside P5a's
 * persistent accordion zone (#propsAccordionZone), alongside P5g's View
 * accordion. This row's own plan-doc text says the accordion "relocates
 * as-is" (a move), but - like every other P5b-h migration so far
 * (P5b/c/d/f) - this is actually a genuine SECOND element mirroring the
 * aside original 1:1, kept in sync, coexisting until P5i finally deletes
 * the aside outright; see buildWebviewTemplate.js's own doc comment for
 * why a literal move would be the one migration in this group that
 * couldn't be undone, and would leave classic UI with no working style
 * toggle at all in the meantime. Unlike P5b/c/d (where the toolbar copy
 * only needs to sync with the extension host/vscode.getState()), the two
 * style-toggle buttons and two theme selects here must ALSO sync with
 * EACH OTHER directly, since either one can be clicked/changed - that
 * bidirectional sync is this file's main focus, on top of the same
 * "both present, aside untouched" coverage every prior P5 migration test
 * already establishes.
 * Run with: node src/test/toolbarUiSettings.test.js
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
  const { Event } = dom.window;

  const toolbarToggle = doc.getElementById('toolbarUiStyleToggle');
  const asideToggle = doc.getElementById('uiStyleToggle');
  const toolbarThemeSelect = doc.getElementById('toolbarUiThemeSelect');
  const asideThemeSelect = doc.getElementById('uiThemeSelect');
  const toolbarAccordion = doc.getElementById('toolbarUiSettingsAccordion');
  const asideAccordion = doc.getElementById('uiSettingsAccordion');

  console.log('setup: both accordions exist, live in their own regions, and the aside original is untouched');
  check('#toolbarUiSettingsAccordion exists', !!toolbarAccordion);
  check('#toolbarUiSettingsAccordion lives inside #propsAccordionZone', doc.getElementById('propsAccordionZone').contains(toolbarAccordion));
  check('the aside\'s own #uiSettingsAccordion is still present, untouched', !!asideAccordion);
  check('#toolbarUiStyleToggle exists inside the toolbar accordion', toolbarAccordion.contains(toolbarToggle));
  check('#toolbarUiThemeSelect exists inside the toolbar accordion', toolbarAccordion.contains(toolbarThemeSelect));

  console.log('\nboth style-toggle buttons start showing the same label/title (modern is the initial style here)');
  check('toolbar toggle reads "Classic UI" (offering to switch away from modern)', toolbarToggle.textContent === 'Classic UI');
  check('aside toggle matches', asideToggle.textContent === toolbarToggle.textContent);
  check('toolbar toggle title matches the aside one', toolbarToggle.title === asideToggle.title);

  console.log('\nclicking the TOOLBAR style toggle updates BOTH buttons and posts setUiStyle once');
  toolbarToggle.dispatchEvent(new Event('click', { bubbles: true }));
  check('document body flips to classic', dom.window.document.body.dataset.uiStyle === 'classic');
  check('toolbar toggle now reads "New UI"', /New UI/.test(toolbarToggle.textContent));
  check('aside toggle ALSO updates to match, even though it was not the one clicked', asideToggle.textContent === toolbarToggle.textContent);
  check('posts setUiStyle: classic', posted.some((m) => m.type === 'setUiStyle' && m.value === 'classic'));

  console.log('\nclicking the ASIDE style toggle (the original) updates BOTH buttons back, proving the sync is bidirectional');
  asideToggle.dispatchEvent(new Event('click', { bubbles: true }));
  check('document body flips back to modern', dom.window.document.body.dataset.uiStyle === 'modern');
  check('aside toggle now reads "Classic UI" again', asideToggle.textContent === 'Classic UI');
  check('toolbar toggle ALSO updates to match, even though it was not the one clicked', toolbarToggle.textContent === asideToggle.textContent);
  check('posts setUiStyle: modern', posted.some((m) => m.type === 'setUiStyle' && m.value === 'modern'));

  console.log('\nboth theme selects start on the same value');
  check('toolbar theme select starts on green (the default)', toolbarThemeSelect.value === 'green');
  check('aside theme select matches', asideThemeSelect.value === toolbarThemeSelect.value);

  console.log('\nchanging the TOOLBAR theme select updates BOTH selects and posts setUiTheme once');
  toolbarThemeSelect.value = 'amber';
  toolbarThemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  check('document body theme updates to amber', dom.window.document.body.dataset.uiTheme === 'amber');
  check('aside theme select ALSO updates to match, even though it was not the one changed', asideThemeSelect.value === 'amber');
  check('posts setUiTheme: amber', posted.some((m) => m.type === 'setUiTheme' && m.value === 'amber'));

  console.log('\nchanging the ASIDE theme select (the original) updates BOTH selects back, proving the sync is bidirectional');
  asideThemeSelect.value = 'violet';
  asideThemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  check('document body theme updates to violet', dom.window.document.body.dataset.uiTheme === 'violet');
  check('toolbar theme select ALSO updates to match, even though it was not the one changed', toolbarThemeSelect.value === 'violet');
  check('posts setUiTheme: violet', posted.some((m) => m.type === 'setUiTheme' && m.value === 'violet'));

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

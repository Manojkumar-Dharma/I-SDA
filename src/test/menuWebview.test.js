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
  check('option 1 shows its label from the DDS constant', rows[0].querySelector('.option-label-input').value === 'Display library list');
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

  console.log('\nadding a brand-new option in the browser');
  const numInput = doc.getElementById('addOptionNum');
  const labelInput = doc.getElementById('addOptionLabel');
  const addBtn = doc.getElementById('addOptionBtn');
  const errorEl = doc.getElementById('addOptionError');

  console.log('  validation: rejects a missing number');
  numInput.value = '';
  labelInput.value = 'Sign off';
  addBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  check('shows a validation error and does not post applyEdit', errorEl.textContent.length > 0 && !posted.some((m) => m.type === 'applyEdit'));

  console.log('  validation: rejects a duplicate option number');
  numInput.value = '1';
  labelInput.value = 'Duplicate of option 1';
  addBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  check('rejects option 1 (already exists) without posting applyEdit', /already exists/.test(errorEl.textContent) && !posted.some((m) => m.type === 'applyEdit'));

  console.log('  happy path: adds option 20 with a fresh label');
  const postedBefore = posted.length;
  numInput.value = '20';
  labelInput.value = 'Reindex files';
  addBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  const applyEditMsg = posted.slice(postedBefore).find((m) => m.type === 'applyEdit');
  check('posts applyEdit with the DDS source containing the new constant', applyEditMsg && applyEditMsg.text.includes("'20. Reindex files'"));
  check('clears the form inputs after a successful add', numInput.value === '' && labelInput.value === '');

  const newRows = doc.querySelectorAll('.option-row');
  check('the new option now appears in the rendered options panel', newRows.length === 4 && Array.from(newRows).some((r) => r.querySelector('.option-label-input').value === 'Reindex files'));

  console.log('\nexternalCommandUpdate message -> re-renders options without touching the screen');
  const screenBefore = doc.getElementById('screenOutput').innerHTML;
  dom.window.postMessage({ type: 'externalCommandUpdate', text: '0001 DSPLIBL\n0002 CALL PGM2\n' }, '*');
  setTimeout(() => {
    const rows = doc.querySelectorAll('.option-row');
    check('option 2 now shows the externally-updated command', rows[1].querySelector('.option-cmd').value === 'CALL PGM2');
    check('the screen preview itself is untouched by a command-only update', doc.getElementById('screenOutput').innerHTML === screenBefore);

    function rowForNumber(n) {
      return Array.from(doc.querySelectorAll('.option-row')).find((r) => r.querySelector('.option-num').textContent === String(n));
    }

    console.log('\nediting an option label in the browser');
    const postedBeforeLabelEdit = posted.length;
    const row1 = rowForNumber(1);
    const labelInputRow1 = row1.querySelector('.option-label-input');
    labelInputRow1.value = 'Show library list';
    labelInputRow1.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const labelEditMsg = posted.slice(postedBeforeLabelEdit).find((m) => m.type === 'applyEdit');
    check('posts applyEdit with the updated constant text', labelEditMsg && labelEditMsg.text.includes("'1. Show library list'"));
    check('the option number is preserved (only the label text changed)', labelEditMsg && !labelEditMsg.text.includes("'2. Show library list'"));
    check('the DOM re-renders with the new label', rowForNumber(1).querySelector('.option-label-input').value === 'Show library list');
    check("the option's command is untouched by a label-only edit", rowForNumber(1).querySelector('.option-cmd').value === 'DSPLIBL');

    console.log('\ndrag-to-swap: dropping option 1 onto option 10 swaps what shows at each option NUMBER');
    const postedBeforeSwap = posted.length;
    const dragSource = rowForNumber(1);
    const dragTarget = rowForNumber(10);
    const dragStartEvt = new dom.window.Event('dragstart', { bubbles: true });
    dragStartEvt.dataTransfer = { setData: () => {}, getData: () => '1' };
    dragSource.dispatchEvent(dragStartEvt);
    const dropEvt = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    dropEvt.dataTransfer = { getData: () => '1' };
    dragTarget.dispatchEvent(dropEvt);
    const swapMsgs = posted.slice(postedBeforeSwap);
    check('posts applyEdit (the DDS constants) for the swap', swapMsgs.some((m) => m.type === 'applyEdit'));
    check('posts applyMenuCmdEdit (the commands follow their label) for the swap', swapMsgs.some((m) => m.type === 'applyMenuCmdEdit'));
    check('option 1 now shows what used to be at option 10 (Sign off, no command)', rowForNumber(1).querySelector('.option-label-input').value === 'Sign off' && rowForNumber(1).querySelector('.option-cmd').value === '');
    check('option 10 now shows what used to be at option 1 (the edited label + its command)', rowForNumber(10).querySelector('.option-label-input').value === 'Show library list' && rowForNumber(10).querySelector('.option-cmd').value === 'DSPLIBL');
    check('option numbers stay put - option 2 is untouched by the swap', rowForNumber(2).querySelector('.option-label-input').value === 'Change current library');
    check('dropping a row onto itself is a no-op (no extra applyEdit)', (() => {
      const before = posted.length;
      const self = rowForNumber(2);
      const evt = new dom.window.Event('drop', { bubbles: true, cancelable: true });
      evt.dataTransfer = { getData: () => '2' };
      self.dispatchEvent(evt);
      return posted.length === before;
    })());

    console.log('\nrenaming the record format');
    const recordNameInput = doc.getElementById('recordNameInput');
    const recordRenameBtn = doc.getElementById('recordRenameBtn');
    const postedBeforeRename = posted.length;
    recordNameInput.value = 'MAINMENU';
    recordRenameBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const renameMsg = posted.slice(postedBeforeRename).find((m) => m.type === 'applyEdit');
    check('posts applyEdit with the renamed record', renameMsg && renameMsg.text.includes('R MAINMENU'));
    check('the record select now shows the new name', doc.getElementById('recordSelect').value === 'MAINMENU');
    check('fields under the renamed record are preserved', renameMsg && renameMsg.text.includes("'MAIN MENU'"));

    console.log('\nrecord rename validation');
    const postedBeforeInvalidRename = posted.length;
    recordNameInput.value = '1BADNAME';
    recordRenameBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    check('rejects an invalid DDS name without posting applyEdit', doc.getElementById('recordRenameError').textContent.length > 0 && posted.length === postedBeforeInvalidRename);

    runCrossReferenceWarningScenario();
  }, 50);
}, 100);

/**
 * Separate self-contained webview instance (own JSDOM, own initial source):
 * a two-record fixture where OTHERFMT's SFLCTL(MENU) keyword references the
 * MENU record by name. renameRecordFormat() only rewrites the record's own
 * R-line, so this checks the webview actually surfaces that gap as a
 * warning rather than silently leaving the SFLCTL reference dangling.
 */
function runCrossReferenceWarningScenario() {
  console.log('\nrecord rename cross-reference warning (separate fixture with a real SFLCTL reference)');
  const refSource =
    [
      "     A          R MENU",
      "     A                                  1  2'MAIN SCREEN'",
      "     A          R OTHERFMT",
      "     A                                      SFLCTL(MENU)",
    ].join('\n') + '\n';
  const refHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce2', refSource, '', 'REFTEST.MNUDDS', 'REFTESTQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const refPosted = [];
  const refDom = new JSDOM(refHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: (m) => refPosted.push(m) });
    },
  });

  setTimeout(() => {
    const refDoc = refDom.window.document;
    refDoc.getElementById('recordSelect').value = 'MENU';
    const nameInput = refDoc.getElementById('recordNameInput');
    nameInput.value = 'RENAMED';
    refDoc.getElementById('recordRenameBtn').dispatchEvent(new refDom.window.Event('click', { bubbles: true }));

    check('warns about the SFLCTL cross-reference before renaming', refPosted.some((m) => m.type === 'error' && /SFLCTL/i.test(m.message)));
    check('names the actual line the reference is on', refPosted.some((m) => m.type === 'error' && /line\(s\) 4\b/.test(m.message)));
    check('still applies the rename despite the warning (advisory, not a hard block)', refPosted.some((m) => m.type === 'applyEdit' && m.text.includes('R RENAMED')));
    check("does NOT rewrite the SFLCTL reference itself (the documented gap)", refPosted.some((m) => m.type === 'applyEdit' && m.text.includes('SFLCTL(MENU)')));

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 100);
}

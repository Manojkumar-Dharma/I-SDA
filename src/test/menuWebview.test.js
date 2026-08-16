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
  check('option 10 (two-digit) parses correctly and has no command yet', rows[2].querySelector('.option-num-badge').textContent === '10' && rows[2].querySelector('.option-cmd').value === '');
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
      return Array.from(doc.querySelectorAll('.option-row')).find((r) => r.querySelector('.option-num-badge').textContent === String(n));
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

    console.log('\ndeleting an option removes its DDS constant AND its command mapping');
    const postedBeforeDelete = posted.length;
    const rowsBeforeDelete = doc.querySelectorAll('.option-row').length;
    const option2Row = rowForNumber(2);
    check('setup: option 2 currently has a command mapped', option2Row.querySelector('.option-cmd').value === 'CALL PGM2');
    option2Row.querySelector('.option-delete-btn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const deleteMsgs = posted.slice(postedBeforeDelete);
    const deleteApplyEdit = deleteMsgs.find((m) => m.type === 'applyEdit');
    const deleteCmdEdit = deleteMsgs.find((m) => m.type === 'applyMenuCmdEdit');
    check('posts applyEdit with the option\'s DDS constant removed', deleteApplyEdit && !deleteApplyEdit.text.includes('Change current library'));
    check('posts applyMenuCmdEdit with the command mapping removed', deleteCmdEdit && !deleteCmdEdit.text.includes('CALL PGM2') && !deleteCmdEdit.text.includes('0002'));
    check('the other options survive untouched', deleteApplyEdit && deleteApplyEdit.text.includes('Sign off') && deleteApplyEdit.text.includes('Reindex files'));
    check('the option row disappears from the panel', doc.querySelectorAll('.option-row').length === rowsBeforeDelete - 1);
    check('option 2 no longer appears at all', !rowForNumber(2));

    console.log('\ndeleting an option with no command mapping does not post a spurious applyMenuCmdEdit');
    const postedBeforeDelete2 = posted.length;
    const option1Row = rowForNumber(1); // 'Sign off', no command (per the earlier swap)
    check('setup: option 1 currently has no command mapped', option1Row.querySelector('.option-cmd').value === '');
    option1Row.querySelector('.option-delete-btn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const deleteMsgs2 = posted.slice(postedBeforeDelete2);
    check('posts applyEdit removing the constant', deleteMsgs2.some((m) => m.type === 'applyEdit' && !m.text.includes('Sign off')));
    check('does not post applyMenuCmdEdit when there was nothing to remove', !deleteMsgs2.some((m) => m.type === 'applyMenuCmdEdit'));

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
  console.log('\nrecord rename: auto-rewrites recognized cross-references, still warns about the rest');
  const refSource =
    [
      "     A          R MENU",
      "     A                                  1  2'MAIN SCREEN'",
      "     A          R OTHERFMT",
      "     A                                      SFLCTL(MENU)",
      "     A          R THIRDFMT",
      "     A                                  1  2'See MENU for details'",
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

    const applyEdit = refPosted.find((m) => m.type === 'applyEdit' && m.text.includes('R RENAMED'));
    check('renames the record', !!applyEdit);
    check('auto-rewrites the recognized SFLCTL(MENU) reference to SFLCTL(RENAMED)', applyEdit && applyEdit.text.includes('SFLCTL(RENAMED)') && !applyEdit.text.includes('SFLCTL(MENU)'));
    check('does NOT warn about the SFLCTL line - it was fixed, not just flagged', !refPosted.some((m) => m.type === 'error' && /line\(s\) 4\b/.test(m.message)));
    check("leaves an unrelated constant's text alone (never rewrites arbitrary display text)", applyEdit && applyEdit.text.includes('See MENU for details'));
    check('still warns about that constant, since it is not one of the auto-fixable keyword shapes', refPosted.some((m) => m.type === 'error' && /SFLCTL\/WINDOW\/MNUBARCHC/.test(m.message) && /line\(s\) 6\b/.test(m.message)));

    runSplitConstantScenario();
  }, 100);
}

/**
 * A real SDA layout pattern: the option number and its label text as two
 * SEPARATE DDS constants on the same line (e.g. "1." at col 7, the label
 * at col 10), rather than one combined "1. Label" constant. Earlier
 * versions of extractMenuOptions() only recognized the combined form - a
 * split-form option's number marker matched with an empty captured label,
 * so the real label text was invisible in the panel, and editing it
 * overwrote the number marker instead of the actual label constant.
 */
function runSplitConstantScenario() {
  console.log('\nsplit-constant options (number and label as two separate DDS constants on the same line)');
  const splitSource =
    [
      "     A          R MENU",
      "     A                                  5  7'1.'",
      "     A                                  5 10'Display current library list'",
      "     A                                  6  7'2. Change current library'",
    ].join('\n') + '\n';
  const splitHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce3', splitSource, '', 'SPLIT.MNUDDS', 'SPLITQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const splitPosted = [];
  const splitDom = new JSDOM(splitHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: (m) => splitPosted.push(m) });
    },
  });

  setTimeout(() => {
    const splitDoc = splitDom.window.document;
    const rows = Array.from(splitDoc.querySelectorAll('.option-row'));
    check('finds both options despite the split-constant form', rows.length === 2);
    const row1 = rows.find((r) => r.querySelector('.option-num-badge').textContent === '1');
    check('option 1s label comes from the SEPARATE label constant, not left blank', row1 && row1.querySelector('.option-label-input').value === 'Display current library list');
    const row2 = rows.find((r) => r.querySelector('.option-num-badge').textContent === '2');
    check('a combined-form option in the same file still works too', row2 && row2.querySelector('.option-label-input').value === 'Change current library');

    console.log('  editing a split-constant option writes the label constant, not the number marker');
    const labelInput = row1.querySelector('.option-label-input');
    labelInput.value = 'Show libraries';
    labelInput.dispatchEvent(new splitDom.window.Event('change', { bubbles: true }));
    const editMsg = splitPosted.find((m) => m.type === 'applyEdit');
    check('the number marker constant is untouched', editMsg && editMsg.text.includes("'1.'"));
    check('the label constant is updated, verbatim, with no number prefix', editMsg && editMsg.text.includes("'Show libraries'") && !editMsg.text.includes("'1. Show libraries'"));

    runScreenSpaceScenario();
  }, 100);
}

/**
 * "+ Add option" used to always place a new option one row below the last
 * one with no bounds checking at all, which could push it past the
 * screen's own DSPSIZ row limit, or land it directly on top of an
 * already-occupied row (a "Selection or command" prompt, function-key
 * text, etc.), silently corrupting the layout either way.
 */
function runScreenSpaceScenario() {
  console.log('\n"+ Add option" respects DSPSIZ and does not overwrite an occupied row');

  console.log('  skips an occupied row and lands on the next free one');
  const roomySource =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R MENU",
      "     A                                 22  5'1. Display library list'",
      "     A  10        CMDLINE       80   B 23  2",
    ].join('\n') + '\n';
  const roomyHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce4', roomySource, '', 'ROOMY.MNUDDS', 'ROOMYQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const roomyPosted = [];
  const roomyDom = new JSDOM(roomyHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: (m) => roomyPosted.push(m) });
    },
  });

  setTimeout(() => {
    const roomyDoc = roomyDom.window.document;
    roomyDoc.getElementById('addOptionNum').value = '2';
    roomyDoc.getElementById('addOptionLabel').value = 'Change current library';
    roomyDoc.getElementById('addOptionBtn').dispatchEvent(new roomyDom.window.Event('click', { bubbles: true }));
    const roomyMsg = roomyPosted.find((m) => m.type === 'applyEdit');
    check('places the new option on row 24, skipping occupied row 23', roomyMsg && /24\s+5'2\. Change current library'/.test(roomyMsg.text));
    check('does not touch the occupied CMDLINE row', roomyMsg && roomyMsg.text.includes('CMDLINE'));

    console.log('  refuses to add an option when there is genuinely no room left');
    const fullSource =
      [
        "     A                                      DSPSIZ(24 80 *DS3)",
        "     A          R MENU",
        "     A                                 22  5'1. Display library list'",
        "     A  10        CMDLINE       80   B 23  2",
        "     A                                 24  2'F3=Exit'",
      ].join('\n') + '\n';
    const fullHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce5', fullSource, '', 'FULL.MNUDDS', 'FULLQQ.MNUCMD', 'missing').replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      ''
    );
    const fullPosted = [];
    const fullDom = new JSDOM(fullHtml, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({ postMessage: (m) => fullPosted.push(m) });
      },
    });

    setTimeout(() => {
      const fullDoc = fullDom.window.document;
      fullDoc.getElementById('addOptionNum').value = '2';
      fullDoc.getElementById('addOptionLabel').value = 'Change current library';
      fullDoc.getElementById('addOptionBtn').dispatchEvent(new fullDom.window.Event('click', { bubbles: true }));
      check('shows a "no room" error naming the DSPSIZ/occupied-row cause', /no room|DSPSIZ/i.test(fullDoc.getElementById('addOptionError').textContent));
      check('does NOT post applyEdit when there is no room', !fullPosted.some((m) => m.type === 'applyEdit'));

      runFirstOptionPlacementScenario();
    }, 100);
  }, 100);
}

function runFirstOptionPlacementScenario() {
  console.log('\n"+ Add option" for the FIRST option in a record starts after existing content, not a fixed row 6');

  console.log('  a record with a title/header (no options yet) - starts right after the last content row');
  const titledSource =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R MENU",
      "     A                                  1 20'*** MAIN MENU ***'",
      "     A                                  3 10'Company: Acme Corp'",
      "     A                                  4 10'System:  Production'",
      "     A                                  6 10'------------------------------'",
    ].join('\n') + '\n';
  const titledHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce6', titledSource, '', 'TITLED.MNUDDS', 'TITLEDQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const titledPosted = [];
  const titledDom = new JSDOM(titledHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: (m) => titledPosted.push(m) });
    },
  });

  setTimeout(() => {
    const titledDoc = titledDom.window.document;
    titledDoc.getElementById('addOptionNum').value = '1';
    titledDoc.getElementById('addOptionLabel').value = 'Display library list';
    titledDoc.getElementById('addOptionBtn').dispatchEvent(new titledDom.window.Event('click', { bubbles: true }));
    const titledMsg = titledPosted.find((m) => m.type === 'applyEdit');
    check('lands on row 7, right after the divider on row 6 (not the old fixed row 6, which would have collided)', titledMsg && /7\s+5'1\. Display library list'/.test(titledMsg.text));
    check('does not touch the existing title/header content', titledMsg && titledMsg.text.includes('MAIN MENU') && titledMsg.text.includes('Company: Acme Corp'));

    console.log('  a genuinely empty record (no content at all) - still falls back to the original row 6');
    const emptySource = ["     A                                      DSPSIZ(24 80 *DS3)", "     A          R MENU"].join('\n') + '\n';
    const emptyHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce7', emptySource, '', 'EMPTY.MNUDDS', 'EMPTYQQ.MNUCMD', 'missing').replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      ''
    );
    const emptyPosted = [];
    const emptyDom = new JSDOM(emptyHtml, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({ postMessage: (m) => emptyPosted.push(m) });
      },
    });

    setTimeout(() => {
      const emptyDoc = emptyDom.window.document;
      emptyDoc.getElementById('addOptionNum').value = '1';
      emptyDoc.getElementById('addOptionLabel').value = 'Sign off';
      emptyDoc.getElementById('addOptionBtn').dispatchEvent(new emptyDom.window.Event('click', { bubbles: true }));
      const emptyMsg = emptyPosted.find((m) => m.type === 'applyEdit');
      check('an empty record still uses the original row 6 default (unchanged behavior)', emptyMsg && /6\s+5'1\. Sign off'/.test(emptyMsg.text));

      console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
      process.exit(failures === 0 ? 0 : 1);
    }, 100);
  }, 100);
}

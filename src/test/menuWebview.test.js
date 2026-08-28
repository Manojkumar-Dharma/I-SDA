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
const MnuCmdEngine = require('../mnuCmdEngine.js');

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
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
  check('posts applyMenuCmdOptionEdit (Task M4 - structured edit, not the full text) for the command change', last && last.type === 'applyMenuCmdOptionEdit');
  check('the edit targets option 10 with the new command', last && last.edits && last.edits.length === 1 && last.edits[0].numberValue === 10 && last.edits[0].command === 'SIGNOFF');

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
    check('posts applyMenuCmdOptionEdit (Task M4 - the commands follow their label) for the swap', swapMsgs.some((m) => m.type === 'applyMenuCmdOptionEdit'));
    const swapCmdEdit = swapMsgs.find((m) => m.type === 'applyMenuCmdOptionEdit');
    check(
      'the swap edit carries both options\' commands, crossed over, in one structured message',
      swapCmdEdit && swapCmdEdit.edits.length === 2 &&
        swapCmdEdit.edits.some((e) => e.numberValue === 1 && e.command === '') &&
        swapCmdEdit.edits.some((e) => e.numberValue === 10 && e.command === 'DSPLIBL')
    );
    // Task M4 - the webview no longer updates its own commandText locally
    // after posting the edit; it waits for the extension host's
    // menuCmdSaved echo (see buildMenuWebviewTemplate.js's own comment on
    // that handler). Simulate that echo synchronously (dispatchEvent, not
    // postMessage, which jsdom queues as a real async task) with the SAME
    // merge the real extension host would compute (base text after the
    // earlier externalCommandUpdate, with both swap edits applied), so the
    // following DOM assertions see the post-swap state.
    let swapMergedText = '0001 DSPLIBL\n0002 CALL PGM2\n';
    swapCmdEdit.edits.forEach((e) => { swapMergedText = MnuCmdEngine.applyOptionCommand(swapMergedText, e.numberValue, e.command); });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'menuCmdSaved', text: swapMergedText } }));
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
    const deleteCmdEdit = deleteMsgs.find((m) => m.type === 'applyMenuCmdOptionEdit');
    check('posts applyEdit with the option\'s DDS constant removed', deleteApplyEdit && !deleteApplyEdit.text.includes('Change current library'));
    check('posts applyMenuCmdOptionEdit (Task M4) clearing option 2\'s command', deleteCmdEdit && deleteCmdEdit.edits.length === 1 && deleteCmdEdit.edits[0].numberValue === 2 && deleteCmdEdit.edits[0].command === '');
    check('the other options survive untouched', deleteApplyEdit && deleteApplyEdit.text.includes('Sign off') && deleteApplyEdit.text.includes('Reindex files'));
    check('the option row disappears from the panel', doc.querySelectorAll('.option-row').length === rowsBeforeDelete - 1);
    check('option 2 no longer appears at all', !rowForNumber(2));

    console.log('\ndeleting an option with no command mapping does not post a spurious applyMenuCmdOptionEdit');
    const postedBeforeDelete2 = posted.length;
    const option1Row = rowForNumber(1); // 'Sign off', no command (per the earlier swap)
    check('setup: option 1 currently has no command mapped', option1Row.querySelector('.option-cmd').value === '');
    option1Row.querySelector('.option-delete-btn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const deleteMsgs2 = posted.slice(postedBeforeDelete2);
    check('posts applyEdit removing the constant', deleteMsgs2.some((m) => m.type === 'applyEdit' && !m.text.includes('Sign off')));
    check('does not post applyMenuCmdOptionEdit when there was nothing to remove', !deleteMsgs2.some((m) => m.type === 'applyMenuCmdOptionEdit'));

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => refPosted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => splitPosted.push(m) });
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
    check('the label input has a title attribute with the full text (visible on hover, since the input box itself can be too narrow to show long text)', row1.querySelector('.option-label-input').title === 'Display current library list');

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

  console.log('  skips an occupied row and stays above the command-line prompt (never places an option below it)');
  const roomySource =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R MENU",
      "     A                                 20  5'1. Display library list'",
      "     A                                 21  2'---divider---'",
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => roomyPosted.push(m) });
    },
  });

  setTimeout(() => {
    const roomyDoc = roomyDom.window.document;
    roomyDoc.getElementById('addOptionNum').value = '2';
    roomyDoc.getElementById('addOptionLabel').value = 'Change current library';
    roomyDoc.getElementById('addOptionBtn').dispatchEvent(new roomyDom.window.Event('click', { bubbles: true }));
    const roomyMsg = roomyPosted.find((m) => m.type === 'applyEdit');
    check('skips the occupied divider row (21) and lands on row 22, the last free row above CMDLINE', roomyMsg && /22\s+5'2\. Change current library'/.test(roomyMsg.text));
    check('does NOT place the option at or below row 23 (the command-line prompt)', roomyMsg && !/2[34]\s+\d+'2\. Change current library'/.test(roomyMsg.text));

    console.log('  refuses to add an option when there is genuinely no room left above the command-line prompt');
    const fullSource =
      [
        "     A                                      DSPSIZ(24 80 *DS3)",
        "     A          R MENU",
        "     A                                 21  5'1. Display library list'",
        "     A  10        CMDLINE       80   B 22  2",
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
        window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => fullPosted.push(m) });
      },
    });

    setTimeout(() => {
      const fullDoc = fullDom.window.document;
      fullDoc.getElementById('addOptionNum').value = '2';
      fullDoc.getElementById('addOptionLabel').value = 'Change current library';
      fullDoc.getElementById('addOptionBtn').dispatchEvent(new fullDom.window.Event('click', { bubbles: true }));
      check('shows a "no room" error naming the DSPSIZ/occupied-row cause', /no room|DSPSIZ/i.test(fullDoc.getElementById('addOptionError').textContent));
      check('does NOT post applyEdit when there is no room', !fullPosted.some((m) => m.type === 'applyEdit'));

      console.log('  a MANUALLY typed row below the command-line prompt is rejected too, not just the auto-placed default');
      const overrideSource =
        [
          "     A                                      DSPSIZ(24 80 *DS3)",
          "     A          R MENU",
          "     A                                 21  5'1. Display library list'",
          "     A  10        CMDLINE       80   B 23  2",
        ].join('\n') + '\n';
      const overrideHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce6b', overrideSource, '', 'OVERRIDE.MNUDDS', 'OVERRIDEQQ.MNUCMD', 'missing').replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/,
        ''
      );
      const overridePosted = [];
      const overrideDom = new JSDOM(overrideHtml, {
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        beforeParse(window) {
          window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => overridePosted.push(m) });
        },
      });

      setTimeout(() => {
        const overrideDoc = overrideDom.window.document;
        overrideDoc.getElementById('addOptionNum').value = '2';
        overrideDoc.getElementById('addOptionLabel').value = 'Change current library';
        overrideDoc.getElementById('addOptionRow').value = '24'; // below CMDLINE at row 23 - user override
        overrideDoc.getElementById('addOptionBtn').dispatchEvent(new overrideDom.window.Event('click', { bubbles: true }));
        check('rejects the manual override, naming the usable-area reason', /usable area/i.test(overrideDoc.getElementById('addOptionError').textContent));
        check('does NOT post applyEdit for the rejected manual override', !overridePosted.some((m) => m.type === 'applyEdit'));

        runFirstOptionPlacementScenario();
      }, 100);
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => titledPosted.push(m) });
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
        window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => emptyPosted.push(m) });
      },
    });

    setTimeout(() => {
      const emptyDoc = emptyDom.window.document;
      emptyDoc.getElementById('addOptionNum').value = '1';
      emptyDoc.getElementById('addOptionLabel').value = 'Sign off';
      emptyDoc.getElementById('addOptionBtn').dispatchEvent(new emptyDom.window.Event('click', { bubbles: true }));
      const emptyMsg = emptyPosted.find((m) => m.type === 'applyEdit');
      check('an empty record still uses the original row 6 default (unchanged behavior)', emptyMsg && /6\s+5'1\. Sign off'/.test(emptyMsg.text));

      runChosenPlacementScenario();
    }, 100);
  }, 100);
}

/**
 * "+ Add option" previously always computed its own placement with no way
 * to choose - the Row/Col inputs let the user override the pre-filled
 * suggestion (or leave it as-is for the same behavior as before).
 */
function runChosenPlacementScenario() {
  console.log('\n"+ Add option" Row/Col fields: pre-filled, editable, validated');
  const src =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R MENU",
      "     A                                  3  5'1. Display library list'",
    ].join('\n') + '\n';
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce6', src, '', 'PLACE.MNUDDS', 'PLACEQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    check('pre-fills the suggested row (one below the last option)', doc.getElementById('addOptionRow').value === '4');
    check('pre-fills the suggested column (matching the last option)', doc.getElementById('addOptionCol').value === '5');

    console.log('  leaving the pre-filled defaults untouched still works');
    doc.getElementById('addOptionNum').value = '2';
    doc.getElementById('addOptionLabel').value = 'Default placed';
    doc.getElementById('addOptionBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const defaultMsg = posted.find((m) => m.type === 'applyEdit');
    check('places it at the pre-filled row/col when left as-is', defaultMsg && /4\s+5'2\. Default placed'/.test(defaultMsg.text));
    check('clears then immediately re-suggests fresh row/col for the next option', doc.getElementById('addOptionRow').value === '5' && doc.getElementById('addOptionCol').value === '5');

    console.log('  overriding the row/col places the option where the user actually chose');
    doc.getElementById('addOptionNum').value = '3';
    doc.getElementById('addOptionLabel').value = 'Custom placed';
    doc.getElementById('addOptionRow').value = '10';
    doc.getElementById('addOptionCol').value = '20';
    doc.getElementById('addOptionBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const chosenMsg = posted[posted.length - 1];
    check('honors the user-chosen row and column exactly', chosenMsg && chosenMsg.type === 'applyEdit' && /10 20'3\. Custom placed'/.test(chosenMsg.text));

    console.log('  choosing an already-occupied row is rejected with a specific error');
    doc.getElementById('addOptionNum').value = '4';
    doc.getElementById('addOptionLabel').value = 'Collides';
    doc.getElementById('addOptionRow').value = '10';
    doc.getElementById('addOptionCol').value = '5';
    const postedBeforeCollision = posted.length;
    doc.getElementById('addOptionBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    check('names the specific occupied row rather than a generic "no room" message', /row 10 is already used/i.test(doc.getElementById('addOptionError').textContent));
    check('does not post applyEdit for the rejected collision', posted.length === postedBeforeCollision);

    console.log('  choosing a row past the screen size is rejected');
    doc.getElementById('addOptionNum').value = '5';
    doc.getElementById('addOptionLabel').value = 'Off screen';
    doc.getElementById('addOptionRow').value = '99';
    doc.getElementById('addOptionCol').value = '5';
    const postedBeforeOffscreen = posted.length;
    doc.getElementById('addOptionBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    check('names the screen-size/usable-area reason rather than a generic message', /past this screen's usable area/i.test(doc.getElementById('addOptionError').textContent));
    check('does not post applyEdit for the rejected off-screen row', posted.length === postedBeforeOffscreen);

    runOptionConditioningScenario();
  }, 100);
}

function runOptionConditioningScenario() {
  console.log('\nper-option conditioning in the menu designer');
  const src =
    [
      "     A          R MENU",
      "     A                                  1  2'MAIN MENU'",
      "     A                                  3  5'1. Display library list'",
      "     A                                  4  5'2. Change current library'",
    ].join('\n') + '\n';
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce7', src, '', 'CONDTEST.MNUDDS', 'CONDTESTQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    console.log('  per-option conditioning: expand option 1, add a condition, mirrors onto both its number+label constants');
    const toggle = doc.querySelector('.option-cond-toggle[data-num="1"]');
    check('setup: option 1\'s conditioning toggle is present', !!toggle);
    toggle.dispatchEvent(new Event('click', { bubbles: true }));
    const addGroupBtn = doc.querySelector('.cond-add-group[data-prefix="opt1"]');
    check('conditioning editor is now expanded for option 1', !!addGroupBtn);
    const postedBeforeAddGroup = posted.length;
    addGroupBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition does NOT write an indicator yet (pending, not committed)', posted.length === postedBeforeAddGroup);
    const pendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    check('a pending (uncommitted) condition group is now shown with its own indicator input', !!pendingNumInput);
    pendingNumInput.value = '01';
    const pendingAddBtn = doc.querySelector('.cond-ind-add[data-prefix="opt1"][data-group="pending"]');
    pendingAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let last = posted[posted.length - 1];
    check('posts applyEdit adding indicator 01 to option 1\'s number marker', last && last.type === 'applyEdit' && /01.*'1\. Display library list'/.test(last.text.replace(/\n/g, ' ')));

    console.log('  option 2 is untouched by option 1\'s conditioning change');
    const option2Line = last.text.split('\n').find((l) => l.includes('2. Change current library'));
    check('option 2\'s own source line has no condition indicator added', !!option2Line && !/^\s*A\s+\d\d\s/.test(option2Line));

    runOptionStyleScenario();
  }, 100);
}

// Task M1 - per-option "Style" picker (Color & attributes + raw keywords),
// reusing the same WebviewClientHelpers.colorAttrStatesHtml/
// wireColorAttrStatesEditor + keywordEditorHtml/wireKeywordEditor
// components the DSPF designer's own constant-field props panel uses.
function runOptionStyleScenario() {
  console.log('\nper-option Style (Color & attributes / keywords) picker in the menu designer');
  const combinedSrc =
    [
      "     A          R MENU",
      "     A                                  1  2'MAIN MENU'",
      "     A                                  3  5'1. Display library list'",
      "     A                                  4  5'2. Change current library'",
    ].join('\n') + '\n';
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce8', combinedSrc, '', 'STYLETEST.MNUDDS', 'STYLETESTQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    console.log('  combined form: expand option 1\'s Style panel, pick a color + attribute via the dedicated picker');
    const styleToggle = doc.querySelector('.option-style-toggle[data-num="1"]');
    check('setup: option 1\'s Style toggle is present', !!styleToggle);
    styleToggle.dispatchEvent(new Event('click', { bubbles: true }));
    const colorSel = doc.getElementById('opt1-colorattr-new-color');
    check('dedicated Color & attributes staging row is now rendered', !!colorSel);
    const rawKwSection = doc.getElementById('kwed-opt1');
    check('the generic raw keyword editor is also rendered below it, same "dedicated + raw fallback" pattern every other picker uses', !!rawKwSection);

    colorSel.value = 'RED';
    const hiCheck = doc.querySelector('.opt1-colorattr-new-attr[value="HI"]');
    check('setup: the High intensity (HI) attribute checkbox is present', !!hiCheck);
    hiCheck.checked = true;
    const addBtn = doc.querySelector('.repeat-inst-add[data-prefix="opt1-colorattr"]');
    const postedBefore = posted.length;
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('adding a color/attribute state posts an applyEdit', posted.length === postedBefore + 1);
    let last = posted[posted.length - 1];
    // Join DDS keyword-continuation lines before matching - see the
    // split-form scenario below for why (a long keyword can wrap mid-token
    // across a hyphen + continuation line).
    let joined = last ? last.text.replace(/-\n\s*A\s*/g, '') : '';
    const idx1 = joined.indexOf("1. Display library list");
    const idx2 = joined.indexOf("2. Change current library");
    const between = idx1 >= 0 && idx2 > idx1 ? joined.slice(idx1, idx2) : '';
    check('COLOR(RED) is written onto the option\'s own constant entry', /COLOR\(RED\)/.test(between));
    check('DSPATR(HI) is written onto the SAME entry (paired into one state, same as the field/constant picker)', /DSPATR\(HI\)/.test(between));
    check('option 2\'s line is untouched', idx2 >= 0 && !/COLOR|DSPATR/.test(joined.slice(idx2)));

    console.log('  the raw keyword editor underneath commits an arbitrary keyword the dedicated picker doesn\'t cover');
    const nameInput = doc.getElementById('opt1-new-kw-name');
    const paramsInput = doc.getElementById('opt1-new-kw-params');
    check('setup: raw keyword add-row inputs are present', !!nameInput && !!paramsInput);
    nameInput.value = 'CHRID';
    paramsInput.value = '284 0';
    const kwAddBtn = doc.querySelector('.kw-add[data-owner="opt1"]');
    const postedBeforeKw = posted.length;
    kwAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('adding a raw keyword posts another applyEdit', posted.length === postedBeforeKw + 1);
    last = posted[posted.length - 1];
    joined = last ? last.text.replace(/-\n\s*A\s*/g, '') : '';
    const idx1b = joined.indexOf("1. Display library list");
    const idx2b = joined.indexOf("2. Change current library");
    const betweenAfterKw = idx1b >= 0 && idx2b > idx1b ? joined.slice(idx1b, idx2b) : '';
    check('the raw-added CHRID keyword is present alongside the still-intact COLOR/DSPATR from the dedicated picker', /CHRID\(284 0\)/.test(betweenAfterKw) && /COLOR\(RED\)/.test(betweenAfterKw) && /DSPATR\(HI\)/.test(betweenAfterKw));

    console.log('  split-constant form: styling syncs onto BOTH the number marker and the separate label constant');
    const splitSrc =
      [
        "     A          R MENU",
        "     A                                  5  7'1.'",
        "     A                                  5 10'Display current library list'",
      ].join('\n') + '\n';
    const splitHtml = getMenuWebviewHtml('vscode-webview://fake', 'testnonce9', splitSrc, '', 'STYLESPLIT.MNUDDS', 'STYLESPLITQQ.MNUCMD', 'missing').replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      ''
    );
    const splitPosted = [];
    const splitDom = new JSDOM(splitHtml, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => splitPosted.push(m) });
      },
    });
    setTimeout(() => {
      const splitDoc = splitDom.window.document;
      const SplitEvent = splitDom.window.Event;
      const splitToggle = splitDoc.querySelector('.option-style-toggle[data-num="1"]');
      check('setup: split-form option 1\'s Style toggle is present', !!splitToggle);
      splitToggle.dispatchEvent(new SplitEvent('click', { bubbles: true }));
      const splitColorSel = splitDoc.getElementById('opt1-colorattr-new-color');
      splitColorSel.value = 'BLU';
      const splitAddBtn = splitDoc.querySelector('.repeat-inst-add[data-prefix="opt1-colorattr"]');
      splitAddBtn.dispatchEvent(new SplitEvent('click', { bubbles: true }));
      const splitLast = splitPosted[splitPosted.length - 1];
      // Join DDS keyword-continuation lines (a long keyword split mid-token
      // across a hyphen + continuation line, e.g. "COLO-\n     A     R(BLU)")
      // before matching - same real DDS wrapping colorAttrStatesHtml/
      // setColorAttrStates already produces for any field whose combined
      // constant text + keywords run past column 80.
      const joinedText = splitLast ? splitLast.text.replace(/-\n\s*A\s*/g, '') : '';
      const numIdx = joinedText.indexOf("'1.'");
      const labelIdx = joinedText.indexOf('Display current library list');
      const numberBlock = numIdx >= 0 && labelIdx > numIdx ? joinedText.slice(numIdx, labelIdx) : '';
      const labelBlock = labelIdx >= 0 ? joinedText.slice(labelIdx) : '';
      check('COLOR(BLU) is written onto the number-marker constant', /COLOR\(BLU\)/.test(numberBlock));
      check('COLOR(BLU) is ALSO written onto the separate label constant, so number+label stay visually in sync (same as Conditioning)', /COLOR\(BLU\)/.test(labelBlock));

      runCopyOptionScenario();
    }, 100);
  }, 100);
}

// Copy an option (combined "N. label" form) via the Copy button, which
// reuses DspfWriter.copyField the same way the DSPF designer's own Copy
// button does (see CHANGELOG "Copy field/constant"), then rewrites just the
// copy's number to the next available one - two options can't share a
// number the way two arbitrary duplicated constants could.
function runCopyOptionScenario() {
  console.log('\ncopy option (combined form): duplicates the constant, renumbers the copy, leaves the original untouched');
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce8', menuSource, commandSource, 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    console.log('  copy option 10 ("10. Sign off", the highest-numbered option in this fixture)');
    const copyBtn = Array.from(doc.querySelectorAll('.option-row')).find((row) => row.querySelector('.option-num-badge').textContent === '10').querySelector('.option-copy-btn');
    check('setup: found option 10\'s Copy button', !!copyBtn);
    copyBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const last = posted[posted.length - 1];
    check('posts applyEdit with a new option numbered 11 (highest existing + 1)', last && last.type === 'applyEdit' && /'11\. Sign off'/.test(last.text));
    check('the original option 10 line is untouched', last && /'10\. Sign off'/.test(last.text));
    check('option 10\'s own screen row/column is unchanged (still row 5)', last && / {2}5 {2}5'10\. Sign off'/.test(last.text));

    runCopySplitOptionScenario();
  }, 100);
}

// Same as runCopyOptionScenario, but for an option in the split-constant
// form (number marker and label are two separate DDS constants) - the code
// path that copies BOTH constants and re-aligns them onto the same new row.
function runCopySplitOptionScenario() {
  console.log('\ncopy option (split-constant form): duplicates BOTH the number marker and the separate label constant, keeping them aligned');
  const splitSource =
    [
      "     A          R MENU",
      "     A                                  5  7'1.'",
      "     A                                  5 10'Display current library list'",
    ].join('\n') + '\n';
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce10', splitSource, '', 'SPLIT2.MNUDDS', 'SPLIT2QQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    const copyBtn = doc.querySelector('.option-copy-btn');
    check('setup: found the split-form option\'s Copy button', !!copyBtn);
    copyBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const last = posted[posted.length - 1];
    check('posts applyEdit with a new option 2 number marker', last && last.type === 'applyEdit' && /'2\.'/.test(last.text));
    check('the new option\'s label constant is a copy of the original label, unchanged', last && /'Display current library list'/.test(last.text));
    check('the original option 1\'s number marker is untouched', last && /'1\.'/.test(last.text));
    const line2 = last.text.split('\n').find((l) => l.includes("'2.'"));
    check('the copied number marker landed on row 6 (one below the original\'s row 5)', !!line2 && / {2}6 {2}7'2\.'/.test(line2));

    runCopyMenuFileAttrsScenario();
  }, 100);
}

// File attributes panel (menu designer): the same shared keyword-chip
// editor the DSPF designer's file/record/field panels use, reused here
// rather than a second implementation (see README/CHANGELOG "File-level
// attributes panel"/"Menu designer still lacks..."). Verifies the toggle,
// the existing DSPSIZ keyword rendering, and adding a new file keyword.
function runCopyMenuFileAttrsScenario() {
  console.log('\nmenu designer file attributes panel: toggle open, shows existing DSPSIZ, add a new keyword');
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce9', menuSource, commandSource, 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    console.log('  collapsed by default');
    check('file attributes body starts hidden', doc.getElementById('fileAttrsBody').classList.contains('hidden'));

    console.log('  expand: shows the existing DSPSIZ keyword');
    doc.getElementById('fileAttrsToggle').dispatchEvent(new Event('click', { bubbles: true }));
    check('body is no longer hidden', !doc.getElementById('fileAttrsBody').classList.contains('hidden'));
    check('shows the existing DSPSIZ keyword as a chip', /DSPSIZ/.test(doc.getElementById('kwed-file').textContent));

    console.log('  add a new file-level keyword');
    doc.getElementById('file-new-kw-name').value = 'INDARA';
    doc.querySelector('.kw-add[data-owner="file"]').dispatchEvent(new Event('click', { bubbles: true }));
    const last = posted[posted.length - 1];
    check('posts applyEdit with the new file-level INDARA keyword', last && last.type === 'applyEdit' && /INDARA/.test(last.text));
    check('the existing DSPSIZ keyword is preserved', last && /DSPSIZ/.test(last.text));

    runMenuRecordCrudScenario();
  }, 100);
}

// Whole-record create/copy/delete (menu designer): reuses the exact same
// DspfWriter.insertRecord/copyRecord/deleteRecord primitives the DSPF
// designer's own "+ Add record"/Copy record/Delete record buttons already
// use (see CHANGELOG) - this is just the menu designer's own entry point
// for them, in its persistent sidebar rather than a separate properties
// panel. Uses a dedicated multi-record fixture (menuSource above has only
// one record) since the interesting case - the recordSelect.value-before-
// render() gotcha the DSPF designer's own fix addressed - only ever shows
// up with more than one record in the file.
function runMenuRecordCrudScenario() {
  console.log('\nmenu designer whole-record create/copy/delete: "+ Add record" form, Copy record, Delete record buttons');
  const multiRecordSource =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R MAINMENU",
      "     A                                  1  2'MAIN MENU'",
      "     A                                  3  5'1. Display library list'",
      "     A          R SUBMENU",
      "     A                                  1  2'SUB MENU'",
    ].join('\n') + '\n';
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce11', multiRecordSource, '', 'RECCRUD.MNUDDS', 'RECCRUDQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  "+ Add record" rejects an empty name without posting anything');
    doc.getElementById('newRecordBtn').dispatchEvent(new Event('click', { bubbles: true }));
    check('shows an error for the empty name', /Enter a name/.test(doc.getElementById('newRecordError').textContent));
    check('nothing was posted', !posted.some((m) => m.type === 'applyEdit'));

    console.log('  "+ Add record" rejects a name that already exists');
    doc.getElementById('newRecordName').value = 'MAINMENU';
    doc.getElementById('newRecordBtn').dispatchEvent(new Event('click', { bubbles: true }));
    check('shows a duplicate-name error', /already exists/.test(doc.getElementById('newRecordError').textContent));
    check('still nothing posted', !posted.some((m) => m.type === 'applyEdit'));

    console.log('  "+ Add record" creates a new, empty record and selects it');
    doc.getElementById('newRecordName').value = 'NEWSCR';
    doc.getElementById('newRecordBtn').dispatchEvent(new Event('click', { bubbles: true }));
    let last = posted[posted.length - 1];
    check('posts applyEdit containing the new record', last && last.type === 'applyEdit' && /R\s+NEWSCR/.test(last.text));
    check('the new record is now selected in the picker', recordSelect.value === 'NEWSCR');
    check('the input is cleared after a successful add', doc.getElementById('newRecordName').value === '');

    console.log('  Copy record: switch to MAINMENU, copy it, auto-named copy is selected');
    recordSelect.value = 'MAINMENU';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const copyBtn = doc.getElementById('recordCopyBtn');
    check('setup: Copy record button is present and enabled', !!copyBtn && !copyBtn.disabled);
    copyBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit containing the auto-named copy (MAINMENU2)', last && last.type === 'applyEdit' && /R\s+MAINMENU2/.test(last.text));
    check("the copy's option constant was carried over verbatim", /1\. Display library list/.test(last.text));
    check('the original MAINMENU record is still present and untouched', /R\s+MAINMENU\b/.test(last.text) && /MAIN MENU/.test(last.text));
    check('the new copy is now selected in the picker', recordSelect.value === 'MAINMENU2');

    console.log('  Delete record: delete SUBMENU, picker no longer offers it');
    recordSelect.value = 'SUBMENU';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    doc.getElementById('recordDeleteBtn').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('SUBMENU is gone from the posted source', last && last.type === 'applyEdit' && !/R\s+SUBMENU\b/.test(last.text));
    check('SUBMENU is no longer offered in the record picker', !Array.from(recordSelect.options).some((o) => o.value === 'SUBMENU'));
    check('every other record survives (MAINMENU, MAINMENU2, NEWSCR)', /R\s+MAINMENU\b/.test(last.text) && /R\s+MAINMENU2\b/.test(last.text) && /R\s+NEWSCR\b/.test(last.text));

    runCrossRecordOptionScopingScenario();
  }, 100);
}

function runCrossRecordOptionScopingScenario() {
  console.log('\ntwo records each with their own option "1": the Options panel must show the SELECTED record\'s option, not silently drop it or leak the other record\'s');
  const src =
    [
      "     A          R MAINMENU",
      "     A                                  1  2'MAIN MENU'",
      "     A                                  3  5'1. Display library list'",
      "     A          R SUBMENU",
      "     A                                  1  2'SUB MENU'",
      "     A                                  3  5'1. Do something else'",
    ].join('\n') + '\n';
  const html = getMenuWebviewHtml('vscode-webview://fake', 'testnonce12', src, '', 'SCOPE.MNUDDS', 'SCOPEQQ.MNUCMD', 'missing').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  MAINMENU (default selection) shows its own option 1');
    let labels = Array.from(doc.querySelectorAll('.option-label-input')).map((i) => i.value);
    check('shows exactly one option', labels.length === 1);
    check('it is MAINMENU\'s own text, not dropped or swapped', labels[0] === 'Display library list');

    console.log('  switching to SUBMENU shows ITS OWN option 1, not MAINMENU\'s (the bug: cross-record dedup silently kept only the first record\'s)');
    recordSelect.value = 'SUBMENU';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    labels = Array.from(doc.querySelectorAll('.option-label-input')).map((i) => i.value);
    check('still shows exactly one option (not zero - not silently dropped)', labels.length === 1);
    check('it is SUBMENU\'s own text', labels[0] === 'Do something else');

    console.log('  editing SUBMENU\'s option 1 label only touches SUBMENU\'s constant');
    const labelInput = doc.querySelector('.option-label-input');
    labelInput.value = 'Renamed sub option';
    labelInput.dispatchEvent(new Event('change', { bubbles: true }));
    let last = posted[posted.length - 1];
    check("SUBMENU's line is updated", /Renamed sub option/.test(last.text));
    check("MAINMENU's own option 1 is untouched", /1\.\s*Display library list/.test(last.text));

    console.log('  switching back to MAINMENU still shows its own, unrenamed option');
    recordSelect.value = 'MAINMENU';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    labels = Array.from(doc.querySelectorAll('.option-label-input')).map((i) => i.value);
    check('MAINMENU shows its original text, not SUBMENU\'s edit leaking across', labels[0] === 'Display library list');

    console.log('\ngetMenuWebviewHtml() defaults when uiStyle/uiTheme args are omitted (same regression as dspfWebview.test.js)');
    const defaultsHtml = getMenuWebviewHtml('vscode-webview://fake', 'n', menuSource, commandSource, 'D.MNUDDS', 'DQQ.MNUCMD', 'loaded');
    check('data-ui-style defaults to "modern", not ","', /data-ui-style="modern"/.test(defaultsHtml));
    check('data-ui-theme defaults to "green", not ","', /data-ui-theme="green"/.test(defaultsHtml));

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 100);
}

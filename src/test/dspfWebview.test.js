/**
 * dspfWebview.test.js
 *
 * Runs the DSPF designer's actual generated client-side script in jsdom -
 * same rationale as menuWebview.test.js: string-contains assertions on the
 * generated HTML can't catch a DOM-selector typo or a wrong postMessage
 * payload shape, only actually running the script can. Focused on the two
 * features that have no other test coverage: deleting a field/constant via
 * Delete/Backspace, and renaming a record format. Run with:
 * node src/test/dspfWebview.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder');

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
    "     A                                  3  5'Some label'",
    '     A            NAME      10A  B  4  5',
  ].join('\n') + '\n';

// jsdom doesn't enforce the webview CSP meta tag (and has no need to for
// this test), so it's stripped rather than wiring up a nonce it would
// otherwise reject.
const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF').replace(
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

setTimeout(() => {
  const { document: doc, Event, KeyboardEvent } = dom.window;

  console.log('initial rendering');
  const fieldEls = Array.from(doc.querySelectorAll('.dspf-field'));
  check('renders one element per field/constant', fieldEls.length === 3);

  console.log('\nrecord rename');
  {
    // Nothing is selected yet, so the props panel shows the record-level view
    // (with the rename row) by default.
    const nameInput = doc.getElementById('p-record-name');
    const renameBtn = doc.getElementById('p-record-rename');
    const errorEl = doc.getElementById('p-record-rename-error');
    check('the rename input is pre-filled with the current record name', nameInput && nameInput.value === 'SCR1');

    console.log('  rejects an invalid name');
    const postedBefore = posted.length;
    nameInput.value = '1BAD';
    renameBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('shows a validation error', /valid DDS name/i.test(errorEl.textContent));
    check('does not post an edit for the invalid attempt', posted.length === postedBefore);

    console.log('  accepts a valid rename');
    nameInput.value = 'newscr';
    renameBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const last = posted[posted.length - 1];
    check('posts applyEdit with the renamed record', last && last.type === 'applyEdit' && /R\s+NEWSCR/.test(last.text));
    check('the record select now shows the new name as selected', doc.getElementById('recordSelect').value === 'NEWSCR');
    check("the record's fields are preserved through the rename", /MAIN SCREEN/.test(last.text) && /Some label/.test(last.text));
  }

  console.log('\nfield/constant delete via Delete/Backspace');
  {
    posted.length = 0;
    // Re-query: renaming re-rendered the screen, so the earlier field
    // element references are stale after the DOM was replaced.
    const currentFieldEls = Array.from(doc.querySelectorAll('.dspf-field'));
    const constantEl = currentFieldEls.find((el) => el.textContent.includes('Some label'));
    check('setup: the target constant is present before deleting', !!constantEl);

    constantEl.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking selects it (props panel switches to field view)', doc.getElementById('p-const-text') !== null);

    const beforeCount = doc.querySelectorAll('.dspf-field').length;
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    const last = posted[posted.length - 1];
    check('posts applyEdit after Delete', last && last.type === 'applyEdit');
    check('the deleted constant text is gone from the new source', last && !last.text.includes('Some label'));
    check('the other fields are untouched', last && last.text.includes('MAIN SCREEN') && last.text.includes('NAME'));
    check('the screen re-renders with one fewer field', doc.querySelectorAll('.dspf-field').length === beforeCount - 1);
  }

  console.log('\nBackspace while typing in a text input must NOT delete the selected field');
  {
    posted.length = 0;
    const currentFieldEls = Array.from(doc.querySelectorAll('.dspf-field'));
    const target = currentFieldEls.find((el) => el.textContent.includes('MAIN SCREEN'));
    target.dispatchEvent(new Event('click', { bubbles: true }));

    const nameInput = doc.getElementById('p-const-text');
    check('setup: a text input is present and focusable in the props panel', !!nameInput);
    // Dispatch Backspace with the input itself as the event target, the way
    // a real keypress while focused in that field would.
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    check('no delete is posted - the guard against input/textarea/select targets holds', posted.length === 0);
    check('the field is still present', Array.from(doc.querySelectorAll('.dspf-field')).some((el) => el.textContent.includes('MAIN SCREEN')));
  }

  console.log('\nrecord rename auto-rewrites a WINDOW(record-name) cross-reference');
  const refSource =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R BASE',
      "     A                                  1  2'Main screen text'",
      '     A          R POPUP',
      '     A                                      WINDOW(BASE)',
      "     A                                  1  2'Popup'",
    ].join('\n') + '\n';
  const refHtml = getWebviewHtml('vscode-webview://fake', 'testnonce', refSource, 'REFTEST.DSPF').replace(
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
    refDoc.getElementById('recordSelect').value = 'BASE';
    refDoc.getElementById('recordSelect').dispatchEvent(new refDom.window.Event('change', { bubbles: true }));
    const nameInput = refDoc.getElementById('p-record-name');
    nameInput.value = 'RENAMED';
    refDoc.getElementById('p-record-rename').dispatchEvent(new refDom.window.Event('click', { bubbles: true }));

    const applyEdit = refPosted.find((m) => m.type === 'applyEdit' && m.text.includes('R RENAMED'));
    check('renames the record', !!applyEdit);
    check('auto-rewrites the WINDOW(BASE) reference to WINDOW(RENAMED)', applyEdit && applyEdit.text.includes('WINDOW(RENAMED)') && !applyEdit.text.includes('WINDOW(BASE)'));
    check('does not warn, since the reference was auto-fixed', !refPosted.some((m) => m.type === 'error'));

    runDeleteWarningScenario();
  }, 0);
}, 0);

function runDeleteWarningScenario() {
  console.log('\ndeleting a named field warns if something else looks like it references it (e.g. REFFLD)');
  const delSource =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'SRCFLD', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
      buildLine({ seq: '00030', name: 'OTHFLD', length: '10', dataType: 'A', usage: 'B', line: '2', col: '2', func: 'REFFLD(SRCFLD)' }),
    ].join('\n') + '\n';
  const delHtml = getWebviewHtml('vscode-webview://fake', 'testnonce3', delSource, 'DELTEST.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const delPosted = [];
  const delDom = new JSDOM(delHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: (m) => delPosted.push(m) });
    },
  });

  setTimeout(() => {
    const delDoc = delDom.window.document;
    const target = Array.from(delDoc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('SRCFLD'));
    check('setup: the target field is present', !!target);
    target.dispatchEvent(new delDom.window.Event('click', { bubbles: true }));
    delDoc.body.dispatchEvent(new delDom.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));

    const applyEdit = delPosted.find((m) => m.type === 'applyEdit');
    check('deletes the field', applyEdit && !applyEdit.text.includes('SRCFLD    10A'));
    check('warns that REFFLD(SRCFLD) still looks like a reference', delPosted.some((m) => m.type === 'error' && /REFFLD/.test(m.message) && /SRCFLD/.test(m.message)));
    check('does not rewrite the REFFLD reference itself (delete only warns, never auto-fixes)', applyEdit && applyEdit.text.includes('REFFLD(SRCFLD)'));

    runSizeBoundsScenario();
  }, 0);
}

function runSizeBoundsScenario() {
  console.log('\ndual-DSPSIZ: warns when an unconditioned field does not fit within every declared size');
  const boundsSource =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00030', line: '1', col: '2', func: "'Fits fine'" }),
      buildLine({ seq: '00040', line: '25', col: '2', func: "'Too far down for the 24-line size'" }),
    ].join('\n') + '\n';
  const boundsHtml = getWebviewHtml('vscode-webview://fake', 'testnonce4', boundsSource, 'BOUNDSTEST.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const boundsDom = new JSDOM(boundsHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const boundsDoc = boundsDom.window.document;
    const banner = boundsDoc.getElementById('sizeBoundsWarning');
    check('the warning banner is shown', banner && !banner.classList.contains('hidden'));
    check('names the offending field and the size it does not fit', /Too far down/.test(banner.textContent) && /24x80/.test(banner.textContent));
    check('does not complain about the *DS4 (27x132) size, which it fits within', !/27x132/.test(banner.textContent));

    // Switching the size picker itself doesn't change which sizes get
    // checked - the warning is about ALL declared sizes, not just the one
    // being viewed, so it should still show after switching to the size
    // where this field DOES fit.
    const sizeSelect = boundsDoc.getElementById('sizeSelect');
    sizeSelect.value = '1';
    sizeSelect.dispatchEvent(new boundsDom.window.Event('change', { bubbles: true }));
    const bannerAfter = boundsDoc.getElementById('sizeBoundsWarning');
    check('still warns after switching to the size the field fits within (checks ALL sizes, not just the active one)', bannerAfter && !bannerAfter.classList.contains('hidden'));

    runConstantTextEditScenario();
  }, 0);
}

function runConstantTextEditScenario() {
  console.log('\nediting a constant\'s literal text via the props panel');
  const src =
    [
      '     A          R SCR1',
      "     A                                  1  2'Old text'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce5', src, 'CONSTEDIT.DSPF').replace(
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

  setTimeout(() => {
    const doc = dom.window.document;
    const constantEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('Old text'));
    check('setup: the constant is present', !!constantEl);
    constantEl.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const textInput = doc.getElementById('p-const-text');
    check('the props panel shows a Text input pre-filled with the constant\'s current value', textInput && textInput.value === 'Old text');
    check('there is no Name/Length/Data type input for a constant (none of those apply to one)', !doc.getElementById('p-name') && !doc.getElementById('p-length') && !doc.getElementById('p-type'));

    textInput.value = "It's updated";
    doc.getElementById('p-apply').dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit with the new text, apostrophe correctly doubled for DDS', applyEdit && applyEdit.text.includes("It''s updated"));
    check('the old text is gone', applyEdit && !applyEdit.text.includes('Old text'));
    check('the screen re-renders showing the new text', Array.from(doc.querySelectorAll('.dspf-field')).some((el) => el.textContent.includes("It's updated")));

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 0);
}

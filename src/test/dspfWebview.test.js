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
    check('clicking selects it (props panel switches to field view)', doc.getElementById('p-name') !== null);

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

    const nameInput = doc.getElementById('p-name');
    check('setup: a text input is present and focusable in the props panel', !!nameInput);
    // Dispatch Backspace with the input itself as the event target, the way
    // a real keypress while focused in that field would.
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    check('no delete is posted - the guard against input/textarea/select targets holds', posted.length === 0);
    check('the field is still present', Array.from(doc.querySelectorAll('.dspf-field')).some((el) => el.textContent.includes('MAIN SCREEN')));
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

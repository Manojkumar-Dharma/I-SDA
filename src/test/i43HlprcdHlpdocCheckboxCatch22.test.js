/**
 * i43HlprcdHlpdocCheckboxCatch22.test.js
 *
 * Task I-43 (docs/sda-reference/keywordFixes.md) - HLPRCD/HLPDOC checkboxes
 * could not be turned on at all in real usage. Root cause: their sub-field
 * inputs (Record name / Label+Document+Folder) committed on their own
 * `change` event even while the checkbox was unchecked. Since `present:
 * false` is passed in that case, `setFileFlagKeyword` discards the typed
 * value, and the commit still calls `onChange` -> `commitFileEdit` ->
 * `commitSourceChange`, which calls `render()` SYNCHRONOUSLY. That render
 * regenerates the Help panel's HTML from the (still-HLPDOC-less) model, so
 * the freshly-rendered `fk-hlpdoc-label`/etc. inputs come back blank -
 * wiping whatever was just typed. Checking the box afterward then fails the
 * required-field validation with nothing to read.
 *
 * i38HlpdocFileLevel.test.js's own tests for this exact flow passed despite
 * the bug being real, because that test captures `label`/`document2`/
 * `folder`/`on` element references ONCE up front and keeps reusing those
 * same (stale, JS-object-still-alive-but-DOM-detached) references after
 * every render - so it never actually exercises what a real user sees,
 * which is always the LATEST rendered elements. This test re-queries every
 * element via `doc.getElementById` immediately after each render/commit
 * that could have replaced it, the same "always re-query after any
 * re-render" rule noted in project conventions, specifically so it can't
 * fall into that same trap.
 *
 * Fails against pre-I-43 code (typing then checking loses the typed text
 * and the checkbox reverts), passes against the fix (sub-field edits no-op
 * while the checkbox is off, so nothing is ever wiped, and checking the box
 * commits successfully using whatever is currently typed).
 *
 * Run with: node src/test/i43HlprcdHlpdocCheckboxCatch22.test.js
 */

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
  ].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

function lastEdit() {
  for (let i = posted.length - 1; i >= 0; i--) {
    if (posted[i] && posted[i].type === 'applyEdit') return posted[i];
  }
  return null;
}

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  console.log('setup: switch to File Properties, then the Help panel');
  doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));
  doc.querySelector('.props-tab[data-tab="help"]').dispatchEvent(new Event('click', { bubbles: true }));

  console.log('\nHLPDOC: typing all three parts while the checkbox is OFF must not be wiped by the time the checkbox is checked');
  {
    // Step 1: type the label while the box is off. Re-query immediately
    // after in case this single edit already triggered a render.
    let label = doc.getElementById('fk-hlpdoc-label');
    label.value = 'START';
    label.dispatchEvent(new Event('change', { bubbles: true }));

    // Step 2: re-query (not reuse) before continuing - this is the crux of
    // the fix: a real user's next keystroke always lands on whatever is
    // CURRENTLY rendered, not on the element that existed a moment ago.
    let doc2 = doc.getElementById('fk-hlpdoc-document');
    doc2.value = 'GENERAL.HLP';
    doc2.dispatchEvent(new Event('change', { bubbles: true }));

    let folder = doc.getElementById('fk-hlpdoc-folder');
    folder.value = 'HELP.F1';
    folder.dispatchEvent(new Event('change', { bubbles: true }));

    // Step 3: re-query everything fresh right before checking the box -
    // this is the exact moment the pre-fix bug loses the typed text.
    label = doc.getElementById('fk-hlpdoc-label');
    doc2 = doc.getElementById('fk-hlpdoc-document');
    folder = doc.getElementById('fk-hlpdoc-folder');
    check('label survived to the currently-rendered element', label.value === 'START');
    check('document survived to the currently-rendered element', doc2.value === 'GENERAL.HLP');
    check('folder survived to the currently-rendered element', folder.value === 'HELP.F1');

    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    const on = doc.getElementById('fk-hlpdoc-on');
    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));

    const onAfter = doc.getElementById('fk-hlpdoc-on');
    check('checkbox stayed checked - no catch-22 revert', onAfter.checked === true);
    check('no required-parts alert was raised', alertMessage === null);
    const edit = lastEdit();
    check('HLPDOC(START GENERAL.HLP HELP.F1) was posted', edit && /HLPDOC\(START GENERAL\.HLP HELP\.F1\)/.test(edit.text));
    posted.length = 0;

    console.log('\nturning it back off correctly removes the keyword (unrelated to I-43 - unchecking is a real removal, so the now-absent keyword fields legitimately go blank on the next render, same as any other flag keyword)');
    doc.getElementById('fk-hlpdoc-on').checked = false;
    doc.getElementById('fk-hlpdoc-on').dispatchEvent(new Event('change', { bubbles: true }));
    const editOff = lastEdit();
    check('HLPDOC keyword was removed', editOff && !/HLPDOC\(/.test(editOff.text));
    posted.length = 0;
  }

  console.log('\nHLPRCD: same catch-22 shape - typing the record name while off, then checking, must not lose it');
  {
    let record = doc.getElementById('fk-hlprcd-record');
    record.value = 'RECORD1';
    record.dispatchEvent(new Event('change', { bubbles: true }));

    record = doc.getElementById('fk-hlprcd-record');
    check('record name survived to the currently-rendered element', record.value === 'RECORD1');

    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    const on = doc.getElementById('fk-hlprcd-on');
    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));

    const onAfter = doc.getElementById('fk-hlprcd-on');
    check('HLPRCD checkbox stayed checked - no catch-22 revert', onAfter.checked === true);
    check('no required-field alert was raised', alertMessage === null);
    const edit = lastEdit();
    check('HLPRCD(RECORD1) was posted', edit && /HLPRCD\(RECORD1\)/.test(edit.text));
    posted.length = 0;
  }

  console.log('\nHLPDOC: typing while OFF still does not post anything (no premature/incomplete write)');
  {
    doc.getElementById('fk-hlprcd-on').checked = false;
    doc.getElementById('fk-hlprcd-on').dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;

    let label = doc.getElementById('fk-hlpdoc-label');
    label.value = 'ONLYLABEL';
    label.dispatchEvent(new Event('change', { bubbles: true }));
    check('no HLPDOC edit posted from a sub-field edit alone while unchecked', !posted.some((m) => m.type === 'applyEdit' && /HLPDOC/.test(m.text)));

    console.log('checking the box with only the label filled in is still correctly blocked (required-field validation still works)');
    let alertMessage = null;
    dom.window.alert = (msg) => { alertMessage = msg; };
    const on = doc.getElementById('fk-hlpdoc-on');
    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    const onAfter = doc.getElementById('fk-hlpdoc-on');
    check('checkbox reverts to unchecked - document/folder are still blank', onAfter.checked === false);
    check('an alert named the missing parts', /all three parts/i.test(alertMessage || ''));
    check('no HLPDOC edit was posted', !posted.some((m) => m.type === 'applyEdit' && /HLPDOC/.test(m.text)));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 0);

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

    runCopyFieldScenario();
  }, 0);
}

function runCopyFieldScenario() {
  console.log('\ncopying a field via the Copy button, and a constant via Ctrl+D');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'CUSTNAME', length: '30', dataType: 'A', usage: 'B', line: '10', col: '15', func: 'DSPATR(HI)' }),
      buildLine({ seq: '00030', line: '3', col: '5', func: "'Some label'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce6', src, 'COPYTEST.DSPF').replace(
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
    const { Event, KeyboardEvent } = dom.window;

    console.log('  Copy button on a named field');
    const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME'));
    check('setup: the target field is present', !!fieldEl);
    fieldEl.dispatchEvent(new Event('click', { bubbles: true }));
    check('selecting it shows the Copy button', doc.getElementById('p-copy') !== null);

    const beforeCount = doc.querySelectorAll('.dspf-field').length;
    doc.getElementById('p-copy').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit after clicking Copy', !!applyEdit);
    check('the copy gets an auto-generated distinct name', applyEdit && /CUSTNAME2/.test(applyEdit.text));
    check('the original field is untouched', applyEdit && /CUSTNAME\s+30A/.test(applyEdit.text));
    check('the copy keeps the DSPATR keyword', applyEdit && (applyEdit.text.match(/DSPATR\(HI\)/g) || []).length === 2);
    check('the screen re-renders with one more field', doc.querySelectorAll('.dspf-field').length === beforeCount + 1);
    check('the new copy is selected (Name input shows the auto-generated name)', doc.getElementById('p-name') && doc.getElementById('p-name').value === 'CUSTNAME2');

    console.log('  Ctrl+D on a constant');
    posted.length = 0;
    const constantEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('Some label'));
    check('setup: the target constant is present', !!constantEl);
    constantEl.dispatchEvent(new Event('click', { bubbles: true }));

    const beforeCount2 = doc.querySelectorAll('.dspf-field').length;
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit after Ctrl+D', !!applyEdit);
    check('the constant text is duplicated (appears twice)', applyEdit && (applyEdit.text.match(/Some label/g) || []).length === 2);
    check('the screen re-renders with one more field', doc.querySelectorAll('.dspf-field').length === beforeCount2 + 1);

    console.log('  Ctrl+D while typing in a text input must NOT copy the selected field');
    posted.length = 0;
    // Re-select a named field (the constant selected above has no #p-name -
    // its props panel only has #p-const-text) so there's a text input to
    // type Ctrl+D from.
    const namedFieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME'));
    namedFieldEl.dispatchEvent(new Event('click', { bubbles: true }));
    const nameInput = doc.getElementById('p-name');
    check('setup: the props panel has a Name input to type into', !!nameInput);
    if (nameInput) {
      nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
      check('no applyEdit posted while Ctrl+D fires from inside a text input', !posted.some((m) => m.type === 'applyEdit'));
    }

    runFileAttrsScenario();
  }, 0);
}

function runFileAttrsScenario() {
  console.log('\nFile attributes panel and field-order Up/Down');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00030', line: '1', col: '2', func: "'First'" }),
      buildLine({ seq: '00040', line: '2', col: '2', func: "'Second'" }),
      buildLine({ seq: '00050', line: '3', col: '2', func: "'Third'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce7', src, 'ATTRSTEST.DSPF').replace(
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
    const { Event } = dom.window;

    console.log('  File attributes button opens the file-level keyword panel');
    check('setup: no field/record is selected yet, so the record panel (with rename) shows by default', doc.getElementById('p-record-name') !== null);
    const fileAttrsBtn = doc.getElementById('fileAttrsBtn');
    check('setup: the File attributes button exists in the sidebar', !!fileAttrsBtn);
    fileAttrsBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('switches the props panel to the file-level view', doc.getElementById('p-file-back') !== null);
    check('shows the existing DSPSIZ keyword as a chip', /DSPSIZ/.test(doc.getElementById('kwed-file').textContent));
    check('no record-level Name/rename input in this view', doc.getElementById('p-record-name') === null);

    console.log('  adding a file-level keyword via the shared keyword editor');
    doc.getElementById('file-new-kw-name').value = 'INDARA';
    doc.querySelector('.kw-add[data-owner="file"]').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit adding INDARA', applyEdit && /INDARA/.test(applyEdit.text));
    check('DSPSIZ is preserved alongside it', applyEdit && /DSPSIZ\(24 80 \*DS3\)/.test(applyEdit.text));
    check('stays in the file-level view after committing (does not bounce back to record view)', doc.getElementById('p-file-back') !== null);

    console.log('  Back to record returns to the record-level view');
    doc.getElementById('p-file-back').dispatchEvent(new Event('click', { bubbles: true }));
    check('shows the record panel again', doc.getElementById('p-record-name') !== null);

    console.log('  Field order: Up/Down buttons reorder fields in the DDS source');
    let rows = Array.from(doc.querySelectorAll('.field-order-row'));
    check('setup: three field-order rows shown, in source order', rows.length === 3 && /First/.test(rows[0].textContent) && /Second/.test(rows[1].textContent) && /Third/.test(rows[2].textContent));
    check('the first row\'s Up button is disabled (already first)', rows[0].querySelector('.field-order-up').disabled);
    check('the last row\'s Down button is disabled (already last)', rows[2].querySelector('.field-order-down').disabled);

    posted.length = 0;
    rows[1].querySelector('.field-order-up').dispatchEvent(new Event('click', { bubbles: true })); // move "Second" up, ahead of "First"
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit after moving a field up', !!applyEdit);
    const secondIdx = applyEdit ? applyEdit.text.indexOf('Second') : -1;
    const firstIdx = applyEdit ? applyEdit.text.indexOf('First') : -1;
    check('Second now appears before First in the source text', secondIdx >= 0 && firstIdx >= 0 && secondIdx < firstIdx);

    rows = Array.from(doc.querySelectorAll('.field-order-row'));
    check('the on-screen list reflects the new order too', rows.length === 3 && /Second/.test(rows[0].textContent) && /First/.test(rows[1].textContent) && /Third/.test(rows[2].textContent));

    console.log('\n' + (failures === 0 ? 'FILE ATTRS / FIELD ORDER: ALL CHECKS PASSED SO FAR' : failures + ' CHECK(S) FAILED SO FAR'));
    runCommandKeysScenario();
  }, 0);
}

function runCommandKeysScenario() {
  console.log('\ncommand keys (CAxx/CFxx): file-level add/remove, record-level add, cross-scope exclusion, function-key legend');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'Hi'" }),
      buildLine({ seq: '00030', nameType: 'R', name: 'SCR2' }),
      buildLine({ seq: '00040', line: '1', col: '2', func: "'Bye'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce9', src, 'CMDKEYS.DSPF').replace(
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
    const Event = dom.window.Event;

    check('function-key legend starts empty (no keys defined yet)', doc.getElementById('fkeyLegend').querySelectorAll('.fkey-chip').length === 0);

    console.log('  add a file-level key');
    const fileTypeSel = doc.querySelector('.cmdkey-type[data-prefix="file"]');
    const fileNumSel = doc.querySelector('.cmdkey-number[data-prefix="file"]');
    check('the number picker offers all 24 keys before anything is assigned', fileNumSel.options.length === 24);
    fileTypeSel.value = 'CA';
    fileNumSel.value = '03';
    doc.querySelector('.cmdkey-indicator[data-prefix="file"]').value = '90';
    doc.querySelector('.cmdkey-text[data-prefix="file"]').value = 'Exit';
    doc.querySelector('.cmdkey-add[data-prefix="file"]').dispatchEvent(new Event('click', { bubbles: true }));

    let last = posted[posted.length - 1];
    check('posts applyEdit containing the new CA03 file-level key', last && last.type === 'applyEdit' && /CA03\(90 'Exit'\)/.test(last.text));
    check('the function-key legend now shows F3', /F3/.test(doc.getElementById('fkeyLegend').textContent));

    console.log('  the record-level picker (on SCR1, currently selected) excludes 03');
    const recordNumSel = doc.querySelector('.cmdkey-number[data-prefix="record"]');
    check('key 03 is no longer offered at record level', !Array.from(recordNumSel.options).some((o) => o.value === '03'));
    check('23 numbers remain available', recordNumSel.options.length === 23);

    console.log('  add a record-level key on SCR1');
    doc.querySelector('.cmdkey-type[data-prefix="record"]').value = 'CF';
    recordNumSel.value = '05';
    doc.querySelector('.cmdkey-add[data-prefix="record"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit containing the new bare CF05 record-level key', last && last.type === 'applyEdit' && /CF05\b/.test(last.text) && !/CF05\(/.test(last.text));
    check('the legend now shows both F3 and F5 for SCR1', /F3/.test(doc.getElementById('fkeyLegend').textContent) && /F5/.test(doc.getElementById('fkeyLegend').textContent));

    console.log('  switching to SCR2 (no record-level keys of its own) still shows the file-level F3, but not F5');
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = 'SCR2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const legendText = doc.getElementById('fkeyLegend').textContent;
    check('F3 still shown (file-level)', /F3/.test(legendText));
    check('F5 not shown (that was SCR1-only)', !/F5/.test(legendText));

    console.log('  remove the file-level key');
    recordSelect.value = 'SCR1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    doc.querySelector('.cmdkey-remove[data-prefix="file"][data-number="03"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('CA03 is gone after removal', last && !/CA03/.test(last.text));
    check('the record-level CF05 survives the unrelated file-level removal', last && /CF05/.test(last.text));

    runConditionsScenario();
  }, 0);
}

function runConditionsScenario() {
  console.log('\nindicator conditioning editor: add/remove an OR condition on a field, and on a record');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'NAME', length: '10', dataType: 'A', usage: 'B', line: '1', col: '5' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce8', src, 'CONDTEST.DSPF').replace(
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
    const Event = dom.window.Event;

    console.log('  record conditioning: default view on load is the record props panel, starts unconditioned');
    check('starts unconditioned', /Unconditioned/.test(doc.getElementById('propsBody').textContent));
    doc.querySelector('.cond-add-group[data-prefix="record"]').dispatchEvent(new Event('click', { bubbles: true }));
    let last = posted[posted.length - 1];
    check('posts applyEdit adding indicator 01 to the record itself', last && last.type === 'applyEdit' && /A\s+01\s+R\s+SCR1/.test(last.text));

    console.log('  remove that condition, record is unconditioned again');
    doc.querySelector('.cond-group-remove[data-prefix="record"][data-group="0"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('unconditioned again after removal', /Unconditioned/.test(doc.getElementById('propsBody').textContent));

    console.log('  field conditioning: select the field, starts unconditioned, add then remove an indicator');
    const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.getAttribute('data-field') === 'NAME');
    check('setup: the field is present', !!fieldEl);
    fieldEl.dispatchEvent(new Event('click', { bubbles: true }));
    check('field starts unconditioned', /Unconditioned/.test(doc.getElementById('propsBody').textContent));

    doc.querySelector('.cond-add-group[data-prefix="field"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check("posts applyEdit adding indicator 01 as the field's condition", last && last.type === 'applyEdit' && /01.*NAME/.test(last.text.replace(/\n/g, ' ')));

    doc.querySelector('.cond-group-remove[data-prefix="field"][data-group="0"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('field is unconditioned again after removal', /Unconditioned/.test(doc.getElementById('propsBody').textContent));

    runPerKeywordConditioningScenario();
  }, 0);
}

function runPerKeywordConditioningScenario() {
  console.log('\nper-keyword indicator conditioning: condition ONE keyword on a field that has two, leaving the other and the field itself unconditioned');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'NAME', length: '10', dataType: 'A', usage: 'B', line: '1', col: '5', func: 'DSPATR(HI)' }),
      buildLine({ seq: '00030', func: 'COLOR(BLU)' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce9', src, 'KWCONDTEST.DSPF').replace(
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
    const Event = dom.window.Event;

    console.log('  select the field: two keyword chips, each with its own Conditioning toggle, neither expanded yet');
    const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.getAttribute('data-field') === 'NAME');
    check('setup: the field is present', !!fieldEl);
    fieldEl.dispatchEvent(new Event('click', { bubbles: true }));
    const toggles = Array.from(doc.querySelectorAll('.kw-cond-toggle'));
    check('two per-keyword Conditioning toggles are rendered (one per keyword)', toggles.length === 2);
    check("the entity-level (whole-field) conditioning editor is still separately present", !!doc.querySelector('.cond-add-group[data-prefix="field"]'));

    console.log("  expand DSPATR(HI)'s own Conditioning panel and add an OR condition to just that keyword");
    const dspatrToggle = toggles.find((t) => t.getAttribute('data-idx') === '0');
    check("setup: found the DSPATR keyword's own toggle (idx 0)", !!dspatrToggle);
    const ownerKey = dspatrToggle.getAttribute('data-owner');
    dspatrToggle.dispatchEvent(new Event('click', { bubbles: true }));
    const addGroupBtn = doc.querySelector('.cond-add-group[data-prefix="' + ownerKey + '-kw0"]');
    check('expanding the toggle mounts a conditions editor scoped to that one keyword', !!addGroupBtn);
    addGroupBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const last = posted[posted.length - 1];
    check('posts applyEdit with indicator 01 conditioning JUST the DSPATR keyword line', last && last.type === 'applyEdit' && /01\s+DSPATR\(HI\)/.test(last.text));
    check("the field's own NAME line stays unconditioned (no 01 before the name)", last && !/01\s+NAME/.test(last.text));
    check('the second keyword (COLOR) has no indicator conditioning of its own (only one "A  01" conditioned line exists, for DSPATR)', last && (last.text.match(/A\s{2}01\s/g) || []).length === 1);

    runRecordCrudScenario();
  }, 0);
}

function runRecordCrudScenario() {
  console.log('\nwhole-record create/copy/delete: "+ Add record" form, Copy record, Delete record buttons');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'MENU' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'MAIN MENU'" }),
      buildLine({ seq: '00030', name: 'OPT', dataType: 'A', length: '2', usage: 'B', line: '3', col: '5' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'DETAIL' }),
      buildLine({ seq: '00050', line: '1', col: '2', func: "'Detail'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce10', src, 'RECCRUD.DSPF').replace(
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
    const Event = dom.window.Event;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  "+ Add record" rejects an empty name without posting anything');
    doc.getElementById('newRecordBtn').dispatchEvent(new Event('click', { bubbles: true }));
    check('shows an error for the empty name', /Enter a name/.test(doc.getElementById('newRecordError').textContent));
    check('nothing was posted', posted.length === 0 || !posted.some((m) => m.type === 'applyEdit'));

    console.log('  "+ Add record" rejects a name that already exists');
    doc.getElementById('newRecordName').value = 'MENU';
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

    console.log('  Copy record: switch to MENU, copy it, auto-named copy is selected');
    recordSelect.value = 'MENU';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const copyBtn = doc.getElementById('p-record-copy');
    check('setup: Copy record button is present and enabled', !!copyBtn && !copyBtn.disabled);
    copyBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit containing the auto-named copy (MENU2)', last && last.type === 'applyEdit' && /R\s+MENU2/.test(last.text));
    check("the copy's field (OPT) was carried over with the SAME name", /OPT/.test(last.text));
    check('the original MENU record is still present and untouched', /R\s+MENU\b/.test(last.text) && /MAIN MENU/.test(last.text));
    check('the new copy is now selected in the picker', recordSelect.value === 'MENU2');

    console.log('  Delete record: delete DETAIL, picker no longer offers it');
    recordSelect.value = 'DETAIL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    doc.getElementById('p-record-delete').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('DETAIL is gone from the posted source', last && last.type === 'applyEdit' && !/R\s+DETAIL\b/.test(last.text));
    check('DETAIL is no longer offered in the record picker', !Array.from(recordSelect.options).some((o) => o.value === 'DETAIL'));
    check('every other record survives (MENU, MENU2, NEWSCR)', /R\s+MENU\b/.test(last.text) && /R\s+MENU2\b/.test(last.text) && /R\s+NEWSCR\b/.test(last.text));

    console.log('  Rename regression check: renaming a record in a MULTI-record file selects the renamed one, not the alphabetically-first survivor');
    // This is the case the old recordSelect.value-before-render() bug only ever
    // showed up in - a single-record file "worked" by coincidence (a freshly
    // rebuilt <select> with exactly one <option> auto-selects it regardless of
    // what .value was set to beforehand). With MENU/MENU2/NEWSCR all present,
    // renaming NEWSCR (last alphabetically) would previously have left MENU
    // selected instead.
    recordSelect.value = 'NEWSCR';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    doc.getElementById('p-record-name').value = 'ZFINAL';
    doc.getElementById('p-record-rename').dispatchEvent(new Event('click', { bubbles: true }));
    check('the renamed record (ZFINAL), not some other survivor, is now selected', recordSelect.value === 'ZFINAL');

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 0);
}

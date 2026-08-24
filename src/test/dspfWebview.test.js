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
const DspfParser = require('../../dist/dspfParser.js');

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
    check('switches the props panel to the file-level view', doc.getElementById('crumb-file') !== null && doc.getElementById('crumb-file').classList.contains('current'));
    check('shows the existing DSPSIZ keyword as a chip', /DSPSIZ/.test(doc.getElementById('kwed-file').textContent));
    check('no record-level Name/rename input in this view', doc.getElementById('p-record-name') === null);

    console.log('  adding a file-level keyword via the shared keyword editor');
    doc.getElementById('file-new-kw-name').value = 'INDARA';
    doc.querySelector('.kw-add[data-owner="file"]').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit adding INDARA', applyEdit && /INDARA/.test(applyEdit.text));
    check('DSPSIZ is preserved alongside it', applyEdit && /DSPSIZ\(24 80 \*DS3\)/.test(applyEdit.text));
    check('stays in the file-level view after committing (does not bounce back to record view)', doc.getElementById('crumb-file').classList.contains('current'));

    console.log('  the breadcrumb\'s Record crumb returns to the record-level view');
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
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

    runRecordTypeWizardScenario();
  }, 0);
}

function runRecordTypeWizardScenario() {
  console.log('\n"+ Add record" record-TYPE wizard: RECORD/USRDFN/SFL/SFLMSG/Window/WDWSFL/PDNSFL/PULDWN/MNUBAR');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'DTL', func: 'SFL' }),
      buildLine({ seq: '00020', name: 'NAME', dataType: 'A', length: '10', usage: 'O', line: '1', col: '1' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'BOX' }),
      buildLine({ seq: '00040', func: 'WINDOW(2 2 10 40)' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce11', src, 'TYPEWIZ.DSPF').replace(
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
    const toggleBtn = doc.getElementById('newRecordToggleBtn');
    const form = doc.getElementById('newRecordForm');
    const typeSelect = doc.getElementById('newRecordType');
    const sflctlRow = doc.getElementById('newRecordSflctlRow');
    const sflctlLabel = doc.getElementById('newRecordSflctlLabel');
    const sflctlName = doc.getElementById('newRecordSflctlName');
    const windowRow = doc.getElementById('newRecordWindowRow');
    const windowSelect = doc.getElementById('newRecordWindowSelect');
    const nameInput = doc.getElementById('newRecordName');
    const addBtn = doc.getElementById('newRecordBtn');
    const errorEl = doc.getElementById('newRecordError');

    console.log('  the wizard (Type/dependent controls) stays hidden until "+ Add record" is selected');
    check('form starts hidden', form.classList.contains('hidden'));
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking "+ Add record" reveals the form', !form.classList.contains('hidden'));
    check('the toggle button is now marked active', toggleBtn.classList.contains('active'));
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking it again (Cancel) hides the form', form.classList.contains('hidden'));
    check('the toggle button is no longer active', !toggleBtn.classList.contains('active'));
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true })); // leave it open for the rest of this scenario

    console.log('  Type picker offers the real SDA record-type set, RECORD first (no SFLCTL - it is always auto-created)');
    const typeValues = Array.from(typeSelect.options).map((o) => o.value);
    check(
      'exactly RECORD/USRDFN/SFL/SFLMSG/WINDOW/WDWSFL/PULDWN/PDNSFL/MNUBAR, in that order',
      typeValues.join(',') === 'RECORD,USRDFN,SFL,SFLMSG,WINDOW,WDWSFL,PULDWN,PDNSFL,MNUBAR'
    );

    console.log('  RECORD (default): both dependent rows stay hidden, still creates a bare record');
    check('defaults to RECORD', typeSelect.value === 'RECORD');
    check('SFLCTL-name row is hidden for RECORD', sflctlRow.classList.contains('hidden'));
    check('window dependent row is hidden for RECORD', windowRow.classList.contains('hidden'));
    nameInput.value = 'PLAIN';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let last = posted[posted.length - 1];
    check('posts applyEdit with a bare new record', last && last.type === 'applyEdit' && /R\s+PLAIN\b/.test(last.text));
    check('no SFLCTL/WINDOW keyword was added for the plain record', (last.text.match(/\bSFLCTL\(/g) || []).length === 0 && (last.text.match(/\bWINDOW\(/g) || []).length === 1);
    check('the wizard collapses back down after a successful add', form.classList.contains('hidden'));
    check('and the toggle button is no longer active', !toggleBtn.classList.contains('active'));

    console.log('  User-defined (USRDFN): plain keyword, no dependent record at all');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'USRDFN';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('neither dependent row is shown', sflctlRow.classList.contains('hidden') && windowRow.classList.contains('hidden'));
    nameInput.value = 'UDF1';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a plain USRDFN keyword on UDF1', last && last.type === 'applyEdit' && /R\s+UDF1[\s\S]*?USRDFN\b/.test(last.text));

    console.log('  Subfile (SFL): auto-creates its paired SFLCTL companion and prompts for its name');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'SFL';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('the SFLCTL-name row is shown', !sflctlRow.classList.contains('hidden'));
    check('window row stays hidden (plain SFL has no geometry)', windowRow.classList.contains('hidden'));
    check('label asks for the SFLCTL record name', /SFLCTL/i.test(sflctlLabel.textContent));
    nameInput.value = 'DTL2';
    let postedBefore = posted.length;
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('refuses without a SFLCTL name', /SFLCTL/i.test(errorEl.textContent));
    check('nothing new was posted', posted.length === postedBefore);
    sflctlName.value = 'CTL2';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a plain SFL keyword on DTL2', last && last.type === 'applyEdit' && /R\s+DTL2[\s\S]*?SFL\b/.test(last.text));
    check('AND the auto-created CTL2 record carries SFLCTL(DTL2)', /R\s+CTL2[\s\S]*?SFLCTL\(DTL2\)/.test(last.text));

    console.log('  Subfile: refusing to add when the SFLCTL name collides with an existing record, or matches the main name');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'SFL';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    nameInput.value = 'DTL3';
    sflctlName.value = 'CTL2'; // already exists from the previous add
    postedBefore = posted.length;
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('shows a duplicate-name error for the SFLCTL side', /already exists/i.test(errorEl.textContent));
    check('nothing new was posted', posted.length === postedBefore);
    sflctlName.value = 'DTL3'; // same as the main record's own name
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('shows an error that the two names must differ', /different name/i.test(errorEl.textContent));
    check('still nothing new was posted', posted.length === postedBefore);

    console.log('  Message subfile (SFLMSG): same SFL/SFLCTL keyword pair as plain SFL, auto-created the same way');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'SFLMSG';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('label mentions message subfile', /message subfile/i.test(sflctlLabel.textContent));
    nameInput.value = 'MDTL1';
    sflctlName.value = 'MCTL1';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a plain SFL keyword on MDTL1', last && last.type === 'applyEdit' && /R\s+MDTL1[\s\S]*?SFL\b/.test(last.text));
    check('AND the auto-created MCTL1 record carries SFLCTL(MDTL1)', /R\s+MCTL1[\s\S]*?SFLCTL\(MDTL1\)/.test(last.text));

    console.log('  Message subfile (SFLMSG): SFLMSGRCD(line) on the new record plus two synthesized hidden fields (SFLMSGKEY/SFLPGMQ)');
    const sflmsgRow = doc.getElementById('newRecordSflmsgRow');
    const sflmsgLine = doc.getElementById('newRecordSflmsgLine');
    const sflmsg276 = doc.getElementById('newRecordSflmsg276');
    const sflmsgKeyName = doc.getElementById('newRecordSflmsgKeyName');
    const sflmsgQueueName = doc.getElementById('newRecordSflmsgQueueName');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'SFLMSG';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('the SFLMSG-specific inputs (line/key/queue) are shown', !sflmsgRow.classList.contains('hidden'));
    sflmsgLine.value = '23';
    sflmsgKeyName.value = 'MSGKEY';
    sflmsgQueueName.value = 'PGMQ';
    nameInput.value = 'MSGSFL';
    sflctlName.value = 'MSGCTL';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with SFL + SFLMSGRCD(23) on the new MSGSFL record', last && last.type === 'applyEdit' && /R\s+MSGSFL[\s\S]*?SFL\b[\s\S]*?SFLMSGRCD\(23\)/.test(last.text));
    check('AND the auto-created MSGCTL record carries SFLCTL(MSGSFL)', /R\s+MSGCTL[\s\S]*?SFLCTL\(MSGSFL\)/.test(last.text));
    check('MSGKEY hidden field carries SFLMSGKEY', /MSGKEY[\s\S]{0,20}SFLMSGKEY/.test(last.text));
    check('PGMQ hidden field carries a bare SFLPGMQ (default 10-byte, no 276 requested)', /PGMQ[\s\S]{0,60}SFLPGMQ\b/.test(last.text) && !/SFLPGMQ\(276\)/.test(last.text));

    console.log('  Message subfile (SFLMSG): "Use 276-byte queue field" writes SFLPGMQ(276) instead of a bare SFLPGMQ');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'SFLMSG';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    sflmsgLine.value = '24';
    sflmsg276.checked = true;
    sflmsgKeyName.value = 'MKEY2';
    sflmsgQueueName.value = 'MQ2';
    nameInput.value = 'MSGSFL2';
    sflctlName.value = 'MSGCTL2';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with SFLPGMQ(276) on the 276-byte queue field', /MQ2[\s\S]{0,60}SFLPGMQ\(276\)/.test(last.text));
    sflmsg276.checked = false;

    console.log('  Message subfile (SFLMSG): refuses an out-of-range line number (must be 1-27)');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'SFLMSG';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    sflmsgLine.value = '99';
    nameInput.value = 'MSGSFLBAD';
    sflctlName.value = 'MSGCTLBAD';
    postedBefore = posted.length;
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('shows an error about the line number range', /line number/i.test(errorEl.textContent));
    check('nothing new was posted', posted.length === postedBefore);

    console.log('  Message subfile (SFLMSG): refuses when the key/queue field names collide');
    typeSelect.value = 'SFLMSG';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    sflmsgLine.value = '24';
    sflmsgKeyName.value = 'SAME';
    sflmsgQueueName.value = 'SAME';
    nameInput.value = 'MSGSFLBAD2';
    sflctlName.value = 'MSGCTLBAD2';
    postedBefore = posted.length;
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('shows an error about the key/queue field names needing to differ', /different names/i.test(errorEl.textContent));
    check('nothing new was posted', posted.length === postedBefore);
    sflmsgKeyName.value = 'MSGKEY';
    sflmsgQueueName.value = 'PGMQ';

    console.log('  Window: leaving the geometry pick blank creates new (default) geometry; picking a record inherits its geometry');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'WINDOW';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('SFLCTL-name row stays hidden (WINDOW alone has no subfile)', sflctlRow.classList.contains('hidden'));
    check('window row is shown, offering "inherit geometry from" with BOX as a candidate', !windowRow.classList.contains('hidden') && Array.from(windowSelect.options).some((o) => o.value === 'BOX'));
    check('a blank "(new geometry)" option is offered too (not required)', Array.from(windowSelect.options).some((o) => o.value === ''));
    windowSelect.value = '';
    nameInput.value = 'WIN1';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a default literal WINDOW geometry on WIN1', last && last.type === 'applyEdit' && /R\s+WIN1[\s\S]*?WINDOW\(2 2 10 40\)/.test(last.text));

    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'WINDOW';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    windowSelect.value = 'BOX';
    nameInput.value = 'WIN2';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with WIN2 inheriting geometry via WINDOW(BOX)', last && last.type === 'applyEdit' && /R\s+WIN2[\s\S]*?WINDOW\(BOX\)/.test(last.text));

    console.log('  Window subfile (WDWSFL): auto-created SFLCTL companion carries BOTH SFLCTL(...) and WINDOW(...)');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'WDWSFL';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('both dependent rows are shown at once', !sflctlRow.classList.contains('hidden') && !windowRow.classList.contains('hidden'));
    windowSelect.value = '';
    nameInput.value = 'WDTL1';
    sflctlName.value = 'WCTL1';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a plain SFL keyword on WDTL1', last && last.type === 'applyEdit' && /R\s+WDTL1[\s\S]*?SFL\b/.test(last.text));
    check('AND the auto-created WCTL1 record carries SFLCTL(WDTL1) and a default WINDOW geometry', /R\s+WCTL1[\s\S]*?SFLCTL\(WDTL1\)[\s\S]*?WINDOW\(2 2 10 40\)/.test(last.text));

    console.log('  Window subfile (WDWSFL): refusing to add without naming the auto-created SFLCTL companion');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'WDWSFL';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    nameInput.value = 'WDTL2';
    sflctlName.value = '';
    postedBefore = posted.length;
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('shows an error naming the requirement', /SFLCTL/i.test(errorEl.textContent));
    check('nothing new was posted', posted.length === postedBefore);

    console.log('  Pull-down subfile (PDNSFL): auto-created SFLCTL companion carries BOTH SFLCTL(...) and PULLDOWN, no geometry needed');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'PDNSFL';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('SFLCTL-name row is shown', !sflctlRow.classList.contains('hidden'));
    check('window row stays hidden (a pull-down auto-sizes, no geometry to pick)', windowRow.classList.contains('hidden'));
    nameInput.value = 'PDTL1';
    sflctlName.value = 'PCTL1';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a plain SFL keyword on PDTL1', last && last.type === 'applyEdit' && /R\s+PDTL1[\s\S]*?SFL\b/.test(last.text));
    check('AND the auto-created PCTL1 record carries SFLCTL(PDTL1) and PULLDOWN', /R\s+PCTL1[\s\S]*?SFLCTL\(PDTL1\)[\s\S]*?PULLDOWN\b/.test(last.text));

    console.log('  Pull-down menu (PULDWN): plain PULLDOWN keyword, no dependent record at all');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'PULDWN';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('neither dependent row is shown', sflctlRow.classList.contains('hidden') && windowRow.classList.contains('hidden'));
    nameInput.value = 'FPULDWN';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a plain PULLDOWN keyword on FPULDWN', last && last.type === 'applyEdit' && /R\s+FPULDWN[\s\S]*?PULLDOWN\b/.test(last.text));

    console.log('  Menu bar (MNUBAR): plain keyword, no dependent record at all');
    toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
    typeSelect.value = 'MNUBAR';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('neither dependent row is shown', sflctlRow.classList.contains('hidden') && windowRow.classList.contains('hidden'));
    nameInput.value = 'BAR1';
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with a plain MNUBAR keyword on BAR1', last && last.type === 'applyEdit' && /R\s+BAR1[\s\S]*?MNUBAR\b/.test(last.text));

    runHiddenFieldsScenario();
  }, 0);
}

function runHiddenFieldsScenario() {
  console.log('\nHidden fields tab: add/select/delete usage=H fields that have no on-screen position to click');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'FMT1' }),
      buildLine({ seq: '00020', name: 'NAME', dataType: 'A', length: '10', usage: 'O', line: '1', col: '1' }),
      buildLine({ seq: '00030', name: 'EXIST', dataType: 'A', length: '4', usage: 'H' }),
      buildLine({ seq: '00040', func: 'SFLMSGKEY' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce12', src, 'HIDDEN.DSPF').replace(
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

    // Land on the Hidden tab of the record props panel.
    const hiddenTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.getAttribute('data-tab') === 'hidden');
    check('a Hidden tab exists on the record props panel', !!hiddenTabBtn);
    hiddenTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    console.log('  Lists the existing hidden field (EXIST) even though it has no on-screen presence');
    let rows = doc.querySelectorAll('#p-add-hidden-form');
    check('the add-hidden form exists (collapsed by default)', rows.length === 1 && rows[0].classList.contains('hidden'));
    const existingRow = Array.from(doc.querySelectorAll('.field-order-row[data-source-line]')).find((el) => el.textContent.indexOf('EXIST') !== -1);
    check('EXIST is listed in the Hidden tab', !!existingRow);

    console.log('  Clicking a hidden field row selects it into the normal field props panel (Basic/Position/Attributes/Keywords)');
    existingRow.dispatchEvent(new Event('click', { bubbles: true }));
    const nameField = doc.getElementById('p-name');
    check('selecting EXIST opens the normal field props panel showing its name', nameField && nameField.value === 'EXIST');

    console.log('  "+ Add hidden field" opens an inline form (no canvas click needed) and creates a new usage=H field');
    // Back to the record, then the Hidden tab again.
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelectorAll('.props-tab').forEach((b) => { if (b.getAttribute('data-tab') === 'hidden') b.dispatchEvent(new Event('click', { bubbles: true })); });
    doc.getElementById('p-add-hidden').dispatchEvent(new Event('click', { bubbles: true }));
    check('the add-hidden form is now visible', !doc.getElementById('p-add-hidden-form').classList.contains('hidden'));
    doc.getElementById('p-add-hidden-name').value = 'NEWHID';
    doc.getElementById('p-add-hidden-length').value = '8';
    doc.getElementById('p-add-hidden-confirm').dispatchEvent(new Event('click', { bubbles: true }));
    let last = posted[posted.length - 1];
    check('posts applyEdit with a new hidden (usage H) field NEWHID', last && last.type === 'applyEdit' && /NEWHID[\s\S]{0,15}8A\s+H\b/.test(last.text));

    console.log('  Refuses to add a hidden field with a name that already exists in the record');
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelectorAll('.props-tab').forEach((b) => { if (b.getAttribute('data-tab') === 'hidden') b.dispatchEvent(new Event('click', { bubbles: true })); });
    doc.getElementById('p-add-hidden').dispatchEvent(new Event('click', { bubbles: true }));
    doc.getElementById('p-add-hidden-name').value = 'EXIST';
    const postedBefore = posted.length;
    doc.getElementById('p-add-hidden-confirm').dispatchEvent(new Event('click', { bubbles: true }));
    check('shows a name-collision error', /already exists/i.test(doc.getElementById('p-add-hidden-error').textContent));
    check('nothing new was posted', posted.length === postedBefore);

    console.log('  Delete button on a hidden-field row removes it without needing to select it first');
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelectorAll('.props-tab').forEach((b) => { if (b.getAttribute('data-tab') === 'hidden') b.dispatchEvent(new Event('click', { bubbles: true })); });
    const newhidRow = Array.from(doc.querySelectorAll('.field-order-row[data-source-line]')).find((el) => el.textContent.indexOf('NEWHID') !== -1);
    check('NEWHID is listed before deleting it', !!newhidRow);
    newhidRow.querySelector('.hidden-field-delete').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with NEWHID removed', last && last.type === 'applyEdit' && !/NEWHID\b/.test(last.text));

    runFieldPropertyHelpersScenario();
  }, 0);
}



function runFieldPropertyHelpersScenario() {
  console.log('\nfield-panel property helpers: Center on screen, Fill constant, Colors & attributes, Validity/Edit/Error message');
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R SCR1',
      "     A                                  1  2'A short label'",
      '     A            AMOUNT         7Y 2B  5  5',
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce7', src, 'PROPHELP.DSPF').replace(
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

    console.log('  Center on screen: a constant');
    const constantEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('A short label'));
    check('setup: the constant is present', !!constantEl);
    constantEl.dispatchEvent(new Event('click', { bubbles: true }));
    const colInput = doc.getElementById('p-col');
    const centerBtn = doc.getElementById('p-center');
    check('setup: Column input and Center button are both present', !!colInput && !!centerBtn);
    colInput.value = '2';
    centerBtn.dispatchEvent(new Event('click', { bubbles: true }));
    // 'A short label' is 13 chars, an 80-col screen: (80-13)/2 + 1 = 34 (floor)
    check('Center fills the Column input with the midpoint for the current text width, screen is 80 cols wide', colInput.value === String(Math.floor((80 - 'A short label'.length) / 2) + 1));

    console.log('  Fill constant with characters');
    const fillChar = doc.getElementById('p-fill-char');
    const fillLen = doc.getElementById('p-fill-len');
    const fillBtn = doc.getElementById('p-fill');
    check('setup: fill character/length inputs and Fill button are present for a constant', !!fillChar && !!fillLen && !!fillBtn);
    fillChar.value = '-';
    fillLen.value = '5';
    fillBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('Fill overwrites the Text input with the repeated character', doc.getElementById('p-const-text').value === '-----');

    doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('applying commits the filled text and the centered column together', applyEdit && applyEdit.text.includes("'-----'"));

    console.log('  Colors & attributes on a named field');
    posted.length = 0;
    const amountEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('AMOUNT') || el.getAttribute('data-field') === 'AMOUNT');
    check('setup: the AMOUNT field is present', !!amountEl);
    amountEl.dispatchEvent(new Event('click', { bubbles: true }));

    const colorSelEl = doc.querySelector('select[id$="-color"]');
    check('setup: the dedicated Color select is present (not just the generic keyword box)', !!colorSelEl);
    const fieldKey = colorSelEl.id.replace(/-color$/, '');
    const colorSel = colorSelEl;
    colorSel.value = 'RED';
    colorSel.dispatchEvent(new Event('change', { bubbles: true }));
    let colorEdit = posted.find((m) => m.type === 'applyEdit');
    check('picking a color commits immediately, without needing Apply changes', colorEdit && colorEdit.text.includes('COLOR(RED)'));

    posted.length = 0;
    const hiCheck = doc.querySelector('.' + fieldKey + '-attr[value="HI"]');
    check('setup: the HI attribute checkbox is present', !!hiCheck);
    hiCheck.checked = true;
    hiCheck.dispatchEvent(new Event('change', { bubbles: true }));
    let attrEdit = posted.find((m) => m.type === 'applyEdit');
    check('checking an attribute commits DSPATR immediately', attrEdit && attrEdit.text.includes('DSPATR(HI)'));
    check('the earlier COLOR choice survives (both were set on the same field)', attrEdit && attrEdit.text.includes('COLOR(RED)'));

    console.log('  Validity check / Edit code / Error message on a named field');
    posted.length = 0;
    // Re-select: the color/attribute edits above re-rendered the panel, so
    // earlier element references for this field are stale.
    const amountEl2 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    check('setup: AMOUNT is still findable after re-render', !!amountEl2);
    amountEl2.dispatchEvent(new Event('click', { bubbles: true }));

    const vcKindId = fieldKey + '-vc-kind';
    const vcKind = doc.getElementById(vcKindId);
    check('setup: the Validity check kind select is present', !!vcKind);
    vcKind.value = 'RANGE';
    doc.getElementById(fieldKey + '-vc-params').value = '0 999';
    doc.getElementById(fieldKey + '-ec-kind').value = 'EDTCDE';
    doc.getElementById(fieldKey + '-ec-params').value = 'J';
    doc.getElementById(fieldKey + '-errmsg').value = "Amount can't be negative";
    doc.querySelector('.' + fieldKey + '-vc-apply').dispatchEvent(new Event('click', { bubbles: true }));

    const vcEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts RANGE with the entered bounds', vcEdit && vcEdit.text.includes('RANGE(0 999)'));
    check('posts EDTCDE with the chosen code', vcEdit && vcEdit.text.includes('EDTCDE(J)'));
    // ERRMSG's own text is long enough to line-wrap with a continuation '+'
    // (same convention as TEXT), so check the round-tripped MODEL rather than
    // raw source text.
    const reparsedAmount = DspfParser.parseDspf(vcEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT');
    const errKw = reparsedAmount && reparsedAmount.keywords.find((k) => k.name === 'ERRMSG');
    check("posts ERRMSG with the text, apostrophe correctly doubled", errKw && errKw.parameters === "'Amount can''t be negative'");

    console.log('  Keying options (CHECK) on a named field');
    posted.length = 0;
    const amountEl3 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl3.dispatchEvent(new Event('click', { bubbles: true }));
    const meCheck = doc.querySelector('.' + fieldKey + '-keying-code[value="ME"]');
    check('setup: the ME (Mandatory entry) checkbox is present', !!meCheck);
    meCheck.checked = true;
    meCheck.dispatchEvent(new Event('change', { bubbles: true }));
    let keyingEdit = posted.find((m) => m.type === 'applyEdit');
    check('checking ME commits CHECK(ME) immediately', keyingEdit && keyingEdit.text.includes('CHECK(ME)'));

    console.log('  Validity check\u2019s own CHECK codes (AB/VN/VNE/M10/M11) merge with Keying options\u2019, not replace them');
    posted.length = 0;
    const amountEl4 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl4.dispatchEvent(new Event('click', { bubbles: true }));
    const abCheck = doc.querySelector('.' + fieldKey + '-check-code[value="AB"]');
    check('setup: the AB (Allow blanks) checkbox is present', !!abCheck);
    abCheck.checked = true;
    doc.querySelector('.' + fieldKey + '-vc-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let mergedEdit = posted.find((m) => m.type === 'applyEdit');
    const mergedCheck = DspfParser.parseDspf(mergedEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.find((k) => k.name === 'CHECK');
    check('CHECK ends up with BOTH the earlier ME (Keying options) and the new AB (Validity check)', mergedCheck && mergedCheck.parameters.split(/\s+/).sort().join(',') === 'AB,ME');

    console.log('  Modulus 10/11 Immediate toggle switches M10 <-> M10F');
    posted.length = 0;
    const amountEl5 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl5.dispatchEvent(new Event('click', { bubbles: true }));
    const m10Check = doc.querySelector('.' + fieldKey + '-check-code[value="M10"]');
    const m10Immed = doc.querySelector('.' + fieldKey + '-check-code-immed[data-for="M10"]');
    check('setup: M10 checkbox and its Immed checkbox are both present', !!m10Check && !!m10Immed);
    m10Check.checked = true;
    m10Immed.checked = true;
    doc.querySelector('.' + fieldKey + '-vc-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let immedEdit = posted.find((m) => m.type === 'applyEdit');
    const immedCheck = DspfParser.parseDspf(immedEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.find((k) => k.name === 'CHECK');
    check('Immed checked writes M10F rather than plain M10', immedCheck && immedCheck.parameters.split(/\s+/).indexOf('M10F') >= 0);
    check('and does not ALSO write plain M10', immedCheck && immedCheck.parameters.split(/\s+/).indexOf('M10') < 0);

    console.log('  Input keywords (DUP/BLANKS/CHANGE/CHGINPDFT) on a named field');
    posted.length = 0;
    const amountEl6 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl6.dispatchEvent(new Event('click', { bubbles: true }));
    const dupCheck = doc.getElementById(fieldKey + '-inp-dup');
    check('setup: the DUP checkbox is present', !!dupCheck);
    dupCheck.checked = true;
    dupCheck.dispatchEvent(new Event('change', { bubbles: true }));
    let inputEdit = posted.find((m) => m.type === 'applyEdit');
    check('checking DUP commits it immediately', inputEdit && inputEdit.text.includes('DUP'));

    console.log('  General keywords (ALIAS/DFT/... + boolean flags) on a named field');
    posted.length = 0;
    const amountEl7 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl7.dispatchEvent(new Event('click', { bubbles: true }));
    const aliasInput = doc.getElementById(fieldKey + '-gen-alias');
    check('setup: the ALIAS input is present', !!aliasInput);
    aliasInput.value = 'AMOUNT_DUE';
    doc.getElementById(fieldKey + '-gen-putretain').checked = true;
    doc.querySelector('.' + fieldKey + '-gen-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let genEdit = posted.find((m) => m.type === 'applyEdit');
    // This field now carries enough keywords that the line wraps with a '+'
    // continuation (same reasoning as the ERRMSG check above) - possibly
    // mid-keyword - so check the round-tripped MODEL rather than raw text.
    const genFields = DspfParser.parseDspf(genEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords;
    check('posts ALIAS with the entered name', genFields.find((k) => k.name === 'ALIAS') && genFields.find((k) => k.name === 'ALIAS').parameters === 'AMOUNT_DUE');
    check('posts PUTRETAIN bare', genFields.some((k) => k.name === 'PUTRETAIN'));

    console.log('  Message ID (MSGID) on a named field');
    posted.length = 0;
    const amountEl8 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl8.dispatchEvent(new Event('click', { bubbles: true }));
    const msgidInput = doc.getElementById(fieldKey + '-msgid');
    check('setup: the MSGID input is present', !!msgidInput);
    msgidInput.value = 'USR &AMOUNT MSGF1 MYLIB';
    doc.querySelector('.' + fieldKey + '-msgid-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let msgidEdit = posted.find((m) => m.type === 'applyEdit');
    const msgidFields = DspfParser.parseDspf(msgidEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords;
    check('posts MSGID with the entered argument text', msgidFields.find((k) => k.name === 'MSGID') && msgidFields.find((k) => k.name === 'MSGID').parameters === 'USR &AMOUNT MSGF1 MYLIB');

    runFieldKeywordVisibilityScenario();
  }, 0);
}

function runFieldKeywordVisibilityScenario() {
  console.log('\nD2: field-keyword panels are gated by Usage (and, for Validity check, data type) matching real SDA\'s "For Field Type" column');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00030', name: 'FLDBOTH', dataType: 'A', length: '10', usage: 'B', line: '5', col: '5' }),
      buildLine({ seq: '00040', name: 'FLDIN', dataType: 'A', length: '10', usage: 'I', line: '6', col: '5' }),
      buildLine({ seq: '00050', name: 'FLDOUT', dataType: 'A', length: '10', usage: 'O', line: '7', col: '5' }),
      buildLine({ seq: '00060', name: 'FLDFLOAT', dataType: 'F', length: '8', decimals: '2', usage: 'B', line: '8', col: '5' }),
      buildLine({ seq: '00070', name: 'FLDHID', dataType: 'A', length: '4', usage: 'H' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce13', src, 'D2VIS.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    function accordionLabels() {
      return Array.from(doc.querySelectorAll('#propsBody .props-accordion > summary')).map((el) => el.textContent);
    }
    function selectFieldByName(name) {
      const el = Array.from(doc.querySelectorAll('.dspf-field')).find((e) => e.getAttribute('data-field') === name);
      if (el) { el.dispatchEvent(new Event('click', { bubbles: true })); return true; }
      return false;
    }

    console.log('  Usage B (Both), non-float: every D1 category is offered');
    check('FLDBOTH is selectable on the canvas', selectFieldByName('FLDBOTH'));
    let labels = accordionLabels();
    check('Keying options shown for B', labels.indexOf('Keying options') >= 0);
    check('Input keywords shown for B', labels.indexOf('Input keywords') >= 0);
    check('General keywords shown for B', labels.indexOf('General keywords') >= 0);
    check('Database reference shown for B', labels.indexOf('Database reference') >= 0);
    check('Message ID shown for B', labels.indexOf('Message ID') >= 0);
    check('Color & attributes section is present (inline, not an accordion) for B', doc.getElementById('propsBody').innerHTML.indexOf('Color &amp; attributes') >= 0);
    check('Validity check section is present (inline) for B', doc.getElementById('propsBody').innerHTML.indexOf('Validity check') >= 0);

    console.log('  Usage I (Input): Message ID (Output-only) is hidden, everything Input-side stays');
    check('FLDIN is selectable', selectFieldByName('FLDIN'));
    labels = accordionLabels();
    check('Keying options still shown for I', labels.indexOf('Keying options') >= 0);
    check('Input keywords still shown for I', labels.indexOf('Input keywords') >= 0);
    check('Message ID is hidden for I', labels.indexOf('Message ID') === -1);
    check('Validity check section is still present (inline) for I', doc.getElementById('propsBody').innerHTML.indexOf('Validity check') >= 0);

    console.log('  Usage O (Output): Keying options/Input keywords/Validity check (all Input-side) are hidden, Message ID stays');
    check('FLDOUT is selectable', selectFieldByName('FLDOUT'));
    labels = accordionLabels();
    check('Keying options is hidden for O', labels.indexOf('Keying options') === -1);
    check('Input keywords is hidden for O', labels.indexOf('Input keywords') === -1);
    check('Message ID is shown for O', labels.indexOf('Message ID') >= 0);
    check('Database reference is still shown for O', labels.indexOf('Database reference') >= 0);
    check('Validity check section is hidden (inline) for O', doc.getElementById('propsBody').innerHTML.indexOf('Validity check') === -1);
    check('Edit code/word is still present for O (never usage-gated)', doc.getElementById('propsBody').innerHTML.indexOf('Edit code') >= 0);

    console.log('  Float field (dataType F), Usage B: Validity check hidden even though B normally qualifies, everything else unaffected');
    check('FLDFLOAT is selectable', selectFieldByName('FLDFLOAT'));
    labels = accordionLabels();
    check('Validity check section is hidden (inline) for a float field', doc.getElementById('propsBody').innerHTML.indexOf('Validity check') === -1);
    check('Edit code/word still present for a float field', doc.getElementById('propsBody').innerHTML.indexOf('Edit code') >= 0);
    check('Input keywords still shown for a float field (only Validity check is float-restricted)', labels.indexOf('Input keywords') >= 0);

    console.log('  Usage H (Hidden, via the Hidden fields tab): only Keying options / General keywords / Database reference apply');
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    const hiddenTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.getAttribute('data-tab') === 'hidden');
    check('setup: Hidden tab exists', !!hiddenTabBtn);
    hiddenTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const hidRow = Array.from(doc.querySelectorAll('.field-order-row[data-source-line]')).find((el) => el.textContent.indexOf('FLDHID') !== -1);
    check('FLDHID is listed in the Hidden tab', !!hidRow);
    hidRow.dispatchEvent(new Event('click', { bubbles: true }));
    labels = accordionLabels();
    check('Keying options shown for H', labels.indexOf('Keying options') >= 0);
    check('Input keywords hidden for H', labels.indexOf('Input keywords') === -1);
    check('Message ID hidden for H', labels.indexOf('Message ID') === -1);
    check('Database reference shown for H', labels.indexOf('Database reference') >= 0);
    check('Color & attributes section is hidden (inline) for H', doc.getElementById('propsBody').innerHTML.indexOf('Color &amp; attributes') === -1);

    runClickToPlaceScenario();
  }, 0);
}

function runClickToPlaceScenario() {
  console.log('\n"+ Field" / "+ Constant" click-to-place on the preview canvas');
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R SCR1',
      "     A                                  1  2'A short label'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce8', src, 'PLACE.DSPF').replace(
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
      // jsdom does no real layout, so getBoundingClientRect() is always all-zero -
      // gridMetrics() (used by both drag and click-to-place) needs a non-zero
      // rect to convert a pixel click into a line/column. 800x480 for an 80x24
      // screen gives a clean 10px/col, 20px/row grid to click against.
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    console.log('  + Constant');
    const placeConstantBtn = doc.getElementById('placeConstantBtn');
    check('setup: the + Constant button is present', !!placeConstantBtn);
    placeConstantBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('activates the crosshair placement class on the screen', !!doc.querySelector('.dspf-screen.placing'));
    check('shows the placement hint banner', !doc.getElementById('placementHint').classList.contains('hidden'));

    // Click at pixel (155, 95) on the 10px/col x 20px/row grid: gridMetrics'
    // conversion is Math.round(px/cell) + 1, so this lands at col 17, line 6
    // (round(155/10)=16, +1=17; round(95/20)=5, +1=6).
    const screenEl = doc.querySelector('.dspf-screen');
    const clickEvent = new dom.window.MouseEvent('click', { bubbles: true, clientX: 155, clientY: 95 });
    screenEl.dispatchEvent(clickEvent);

    check('placement mode turns off once the click lands', !doc.querySelector('.dspf-screen.placing'));
    const placeLine = doc.getElementById('p-place-line');
    const placeCol = doc.getElementById('p-place-col');
    check('opens the placement form pre-filled with the clicked line', !!placeLine && placeLine.value === '6');
    check('...and column', !!placeCol && placeCol.value === '17');
    check('did NOT select the existing constant underneath (click-to-place takes priority)', !doc.querySelector('.dspf-field.selected'));

    doc.getElementById('p-place-text').value = 'NEW LABEL';
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));

    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('commits a new constant at the clicked position', applyEdit && /6\s*17'NEW LABEL'/.test(applyEdit.text));
    check('the placement form is gone afterward (pendingPlacement cleared)', !doc.getElementById('p-place-add'));

    console.log('  + Field, with validation');
    posted.length = 0;
    const placeFieldBtn = doc.getElementById('placeFieldBtn');
    placeFieldBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const screenEl2 = doc.querySelector('.dspf-screen');
    screenEl2.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 155 }));

    // Empty name should be rejected without committing anything.
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    check('rejects a blank field name without posting an edit', posted.length === 0 && doc.getElementById('p-place-error').textContent.length > 0);

    doc.getElementById('p-place-name').value = 'newfld';
    doc.getElementById('p-place-length').value = '5';
    doc.getElementById('p-place-type').value = 'A';
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    let fieldEdit = posted.find((m) => m.type === 'applyEdit');
    check('uppercases the entered name and commits the new field', fieldEdit && fieldEdit.text.includes('NEWFLD'));
    const reparsed = DspfParser.parseDspf(fieldEdit.text).records[0].fields.find((f) => f.name === 'NEWFLD');
    check('with the length typed in', reparsed && reparsed.length === 5);

    console.log('  Escape cancels placement mode');
    posted.length = 0;
    doc.getElementById('placeFieldBtn').dispatchEvent(new Event('click', { bubbles: true }));
    check('setup: placement mode is active', !!doc.querySelector('.dspf-screen.placing'));
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape turns placement mode back off', !doc.querySelector('.dspf-screen.placing'));
    check('and nothing was committed', posted.length === 0);

    runWindowTitleScenario();
  }, 0);
}

function runWindowTitleScenario() {
  console.log('\nChange Window Title by clicking it directly on the preview');
  const src =
    [
      '     A          R WIN1',
      '     A                                      WINDOW(3 10 8 30)',
      "     A                                      WDWTITLE(('Old Title'))",
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce9', src, 'WINTITLE.DSPF').replace(
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

    const titleEl = doc.querySelector('.dspf-window-title');
    check('setup: the window title is rendered on the preview', !!titleEl);
    check('it is marked editable (cursor/click affordance)', titleEl.classList.contains('dspf-window-title-editable'));

    titleEl.dispatchEvent(new Event('click', { bubbles: true }));
    const titleInput = doc.getElementById('p-window-title');
    check('clicking it opens the record Properties panel with a dedicated Window title field', !!titleInput);
    check('...pre-filled with the current WDWTITLE text', titleInput.value === 'Old Title');
    check('...and focused, ready to type', doc.activeElement === titleInput);

    titleInput.value = "New title's here";
    doc.getElementById('p-window-title-save').dispatchEvent(new Event('click', { bubbles: true }));

    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('setup: an edit was posted', !!applyEdit);
    const reparsed = DspfParser.parseDspf(applyEdit.text).records[0];
    const wdwTitleKw = reparsed.keywords.find((k) => k.name === 'WDWTITLE');
    check('WDWTITLE is updated with the new text, apostrophe correctly doubled', wdwTitleKw && wdwTitleKw.parameters.includes("New title''s here"));
    check('the WINDOW keyword (position/size) is untouched', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '3 10 8 30');

    runWindowMoveResizeScenario();
  }, 0);
}

function runWindowMoveResizeScenario() {
  console.log('\nwindow move/resize handles on the preview canvas');
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R WDWREC',
      '     A                                      WINDOW(3 10 8 40)',
      "     A                                  1  2'In the window'",
      '     A          R DFTREC',
      '     A                                      WINDOW(*DFT 6 30)',
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce11', src, 'WDWMOVE.DSPF').replace(
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
      // Same 10px/col x 20px/row mock as runClickToPlaceScenario above.
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { MouseEvent } = dom.window;

    console.log('  explicit-position window: move via the top move handle');
    let windowEl = doc.querySelector('.dspf-window-border');
    check('setup: the window border is rendered', !!windowEl);
    check('not locked (record is editable, WINDOW has a fixed position)', !windowEl.classList.contains('dspf-window-locked'));
    let moveHandle = windowEl.querySelector('.dspf-window-move-handle');
    check('setup: a move handle is present', !!moveHandle);

    moveHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 90, clientY: 40 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 100 }));
    // round(150/10)+1=16, round(100/20)+1=6
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    let last = posted[posted.length - 1];
    check('posts applyEdit with the window moved to the dragged row/col', last && last.type === 'applyEdit' && /WINDOW\(6 16 8 40\)/.test(last.text));
    check("the window's own field content is untouched", last && /In the window/.test(last.text));

    console.log('  explicit-position window: resize via the bottom-right resize handle');
    windowEl = doc.querySelector('.dspf-window-border');
    const resizeHandle = windowEl.querySelector('.dspf-window-resize-handle');
    check('setup: a resize handle is present', !!resizeHandle);
    resizeHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 250, clientY: 180 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 350, clientY: 260 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    last = posted[posted.length - 1];
    check('posts applyEdit with the window resized, row/col unchanged', last && last.type === 'applyEdit' && /WINDOW\(6 16/.test(last.text));

    console.log('  *DFT-positioned window: resize handle present, move handle absent (no fixed row/col to drag)');
    doc.getElementById('recordSelect').value = 'DFTREC';
    doc.getElementById('recordSelect').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    windowEl = doc.querySelector('.dspf-window-border');
    check('setup: the *DFT window is rendered', !!windowEl);
    check('flagged as a default/runtime position', windowEl.getAttribute('data-window-position-default') === '1');
    check('not locked (still editable, just not movable)', !windowEl.classList.contains('dspf-window-locked'));
    posted.length = 0;
    const dftResizeHandle = windowEl.querySelector('.dspf-window-resize-handle');
    dftResizeHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 220, clientY: 140 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 220 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    last = posted[posted.length - 1];
    check('resizing a *DFT window keeps *DFT and only changes height/width', last && last.type === 'applyEdit' && /WINDOW\(\*DFT/.test(last.text));

    runSubfileControlEditScenario();
  }, 0);
}

// SFLCTL-side subfile preview is now EDITABLE (0.9.38) rather than a
// protected read-only reference layer: dragging any field in the preview
// moves the whole row template, writing back to the PAIRED SFL record -
// without switching records first, matching the SFL-side "Preview SFLPAG
// rows" toggle's own group-drag behavior (see dspfEngine.js's
// resolveSubfilePreview and buildWebviewTemplate.js's field-wiring loop).
function runSubfileControlEditScenario() {
  console.log('\nSFLCTL-side subfile preview is editable (drag writes back to the paired SFL record)');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
      buildLine({ seq: '00030', name: 'SEQNO', length: '10', dataType: 'A', usage: 'O', line: '1', col: '2' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'SFLCTLREC', func: 'SFLCTL(SFLREC)' }),
      buildLine({ seq: '00050', func: 'SFLPAG(3)' }),
      buildLine({ seq: '00060', line: '1', col: '2', func: "'Header'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce12', src, 'SFLEDIT.DSPF').replace(
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
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { MouseEvent, Event } = dom.window;

    doc.getElementById('recordSelect').value = 'SFLCTLREC';
    doc.getElementById('recordSelect').dispatchEvent(new Event('change', { bubbles: true }));

    const previewEl = doc.querySelector('[data-tag^="subfile-edit-row-"]');
    check('subfile preview fields are tagged as editable ("subfile-edit-row-"), not the old protected tag', !!previewEl);
    check('no protected/locked styling is applied to them anymore', previewEl && !previewEl.classList.contains('locked'));

    previewEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 60 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));

    const last = posted[posted.length - 1];
    check('dragging it posts an applyEdit', last && last.type === 'applyEdit');
    check("the edit landed on the PAIRED SFL record's field, not the SFLCTL record", last && /SEQNO/.test(last.text));

    runPulldownEditScenario();
  }, 0);
}

// A PULLDOWN record's fields are now interactive (0.9.38) rather than a
// read-only overlay: clicking one selects it (without the click bubbling up
// and closing the pulldown - it previously would have, via screenOutput's
// own "click anywhere closes it" listener), and dragging it writes back to
// the PULLDOWN record itself, not whatever record has the MNUBARCHC that
// opened it.
function runPulldownEditScenario() {
  console.log('\nPULLDOWN overlay fields are interactive (select without closing it, drag writes back to the PULLDOWN record)');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'MAINREC' }),
      buildLine({ seq: '00030', name: 'MENUFLD', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '1', col: '2', func: "MNUBARCHC(1 PULLREC 'File')" }),
      buildLine({ seq: '00040', nameType: 'R', name: 'PULLREC', func: 'PULLDOWN' }),
      // Deliberately NOT line 1/col 2 - MENUFLD (on MAINREC, the record
      // actually being previewed) already occupies that anchor position,
      // and the field-wiring loop's fallback lookup matches by POSITION
      // when a same-named field isn't found on the primary record first -
      // reusing that same anchor here would collide with MENUFLD and the
      // test would silently exercise the wrong field.
      buildLine({ seq: '00050', name: 'PDFLD', length: '10', dataType: 'A', usage: 'B', line: '5', col: '10' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce13', src, 'PULLEDIT.DSPF').replace(
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
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { MouseEvent, Event } = dom.window;

    check('no pulldown overlay is open yet', !doc.querySelector('[data-tag="pulldown"]'));
    const choiceEl = doc.querySelector('.dspf-menubar-choice');
    check('setup: the menu-bar choice is rendered', !!choiceEl);
    choiceEl.dispatchEvent(new Event('click', { bubbles: true }));

    const pulldownField = doc.querySelector('[data-tag="pulldown"]');
    check('opening the pulldown renders its field', !!pulldownField);

    pulldownField.dispatchEvent(new Event('click', { bubbles: true }));
    check(
      "clicking the pulldown field selects it WITHOUT closing the overlay (click doesn't bubble to the closer)",
      !!doc.querySelector('[data-tag="pulldown"].selected')
    );

    posted.length = 0;
    const fieldToDrag = doc.querySelector('[data-tag="pulldown"]');
    fieldToDrag.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 100 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));

    const last = posted[posted.length - 1];
    check('dragging it posts an applyEdit', last && last.type === 'applyEdit');
    const reparsed = last && DspfParser.parseDspf(last.text);
    const pullRec = reparsed && reparsed.records.find((r) => r.name === 'PULLREC');
    const movedField = pullRec && pullRec.fields.find((f) => f.name === 'PDFLD');
    check("the edit landed on the PULLDOWN record's own field, moved to a new line", movedField && movedField.location.line !== 1);
    const mainRec = reparsed && reparsed.records.find((r) => r.name === 'MAINREC');
    check("the record that OPENED the pulldown (MAINREC) is untouched", mainRec && mainRec.fields.find((f) => f.name === 'MENUFLD').location.line === 1);

    runDimmedCompareScenario();
  }, 0);
}

// True dimmed-overlay compare: the previously-selected record stays the
// normal, fully interactive, editable primary layer - toggling "Show other
// record(s) dimmed behind" only ADDS a read-only backdrop layer of other
// records behind it, rather than replacing the whole view with the old
// read-only side-by-side multi-select.
function runDimmedCompareScenario() {
  console.log('\ntrue dimmed-overlay compare: primary record stays editable, others render dimmed behind it');
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R SCR1',
      "     A                                  1  2'Screen one'",
      '     A          R SCR2',
      "     A                                  3  5'Screen two'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce12', src, 'DIMCOMPARE.DSPF').replace(
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

    console.log('  toggle off (default): no backdrop layer, record select enabled');
    check('setup: SCR1 is selected by default', doc.getElementById('recordSelect').value === 'SCR1');
    check('no backdrop layer present yet', !doc.querySelector('.dspf-screen-backdrop-layer'));
    check('record select is enabled (never disabled by this feature)', !doc.getElementById('recordSelect').disabled);

    console.log('  turn the toggle on: checklist appears, excluding the currently-edited record');
    const toggle = doc.getElementById('compareModeToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('the compare record list is no longer hidden', !doc.getElementById('compareRecordList').classList.contains('hidden'));
    const listLabels = Array.from(doc.querySelectorAll('.compare-record-row')).map((r) => r.textContent.trim());
    check('SCR1 (currently being edited) is NOT offered as a backdrop option', !listLabels.includes('SCR1'));
    check('SCR2 IS offered', listLabels.includes('SCR2'));
    check('still no backdrop layer - nothing is checked yet', !doc.querySelector('.dspf-screen-backdrop-layer'));
    check('the primary record is STILL fully rendered (not replaced by a read-only view)', /Screen one/.test(doc.querySelector('.dspf-screen').textContent));

    console.log('  check SCR2: a dimmed backdrop layer appears behind the primary');
    const scr2Checkbox = Array.from(doc.querySelectorAll('.compare-record-row')).find((r) => r.textContent.trim() === 'SCR2').querySelector('input');
    scr2Checkbox.checked = true;
    scr2Checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    const backdrop = doc.querySelector('.dspf-screen-backdrop-layer');
    check('a backdrop layer is now present', !!backdrop);
    check("it contains SCR2's own field", /Screen two/.test(backdrop.textContent));
    check("the PRIMARY screen (first .dspf-screen in the DOM) is still SCR1's, not SCR2's", doc.querySelector('.dspf-screen').textContent.includes('Screen one'));

    console.log('  the primary record is still fully interactive - clicking a field selects it');
    const primaryField = doc.querySelector('.dspf-field');
    check('setup: at least one interactive field is present in the primary layer', !!primaryField);
    primaryField.dispatchEvent(new Event('click', { bubbles: true }));
    // click's own handler calls render(), which rebuilds the whole DOM from
    // scratch - re-query rather than checking the now-stale primaryField
    // reference (checking classList on it afterward would always be false,
    // regardless of whether selection actually worked).
    check('clicking a primary-layer field selects it (proves it is NOT inert/read-only)', !!doc.querySelector('.dspf-field.selected'));

    console.log('  the backdrop layer itself is inert - clicking inside it does not select anything there');
    posted.length = 0;
    const backdropAfterClick = doc.querySelector('.dspf-screen-backdrop-layer');
    const backdropField = backdropAfterClick.querySelector('.dspf-field');
    check('setup: the backdrop has its own field div rendered', !!backdropField);
    backdropField.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking inside the backdrop layer does not select it (no selected class added there)', !doc.querySelector('.dspf-screen-backdrop-layer .dspf-field.selected'));

    console.log('  switching the primary record to SCR2 stops it from also appearing dimmed behind itself');
    doc.getElementById('recordSelect').value = 'SCR2';
    doc.getElementById('recordSelect').dispatchEvent(new Event('change', { bubbles: true }));
    check('no backdrop layer renders once the only checked backdrop record becomes the primary', !doc.querySelector('.dspf-screen-backdrop-layer'));
    check('SCR1 is now offered in the checklist instead (SCR2 is now the primary)', Array.from(doc.querySelectorAll('.compare-record-row')).map((r) => r.textContent.trim()).includes('SCR1'));

    runFullOverlayCompareScenario();
  }, 0);
}

// Full overlay compare: the OLDER (pre-dimmed-backdrop) behavior, kept
// available as an opt-in - see compareFullOverlay's own doc comment in
// buildWebviewTemplate.js. Every checked record renders together at full
// brightness (no dimming, no separate primary/backdrop split), and the
// WHOLE thing is read-only - unlike dimmed-backdrop mode, where the
// primary stays editable.
function runFullOverlayCompareScenario() {
  console.log('\nfull overlay compare (opt-in, read-only): every checked record renders at full brightness, nothing is editable');
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R SCR1',
      "     A                                  1  2'Screen one'",
      '     A          R SCR2',
      "     A                                  3  5'Screen two'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce14', src, 'FULLOVERLAY.DSPF').replace(
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

    console.log('  the toggle is hidden until Compare mode itself is on');
    check('setup: "Full overlay" row is hidden before Compare is toggled on', doc.getElementById('compareOverlayRow').classList.contains('hidden'));

    const compareToggle = doc.getElementById('compareModeToggle');
    compareToggle.checked = true;
    compareToggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('turning Compare on reveals the "Full overlay" row', !doc.getElementById('compareOverlayRow').classList.contains('hidden'));

    console.log('  turn "Full overlay" on: no dimmed backdrop layer at all, single combined screen instead');
    const overlayToggle = doc.getElementById('compareOverlayToggle');
    overlayToggle.checked = true;
    overlayToggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('no dimmed-backdrop layer exists in overlay mode (it is a totally different render path)', !doc.querySelector('.dspf-screen-backdrop-layer'));
    check('the currently-selected record (SCR1) is shown even though nothing is checked yet', /Screen one/.test(doc.getElementById('screenOutput').textContent));
    check('SCR2 is NOT shown yet (not checked)', !/Screen two/.test(doc.getElementById('screenOutput').textContent));
    check('the properties panel shows the read-only explanation, not an editable record view', doc.getElementById('propsBody').textContent.includes('read-only'));

    console.log('  check SCR2: both records now render together, full brightness, in ONE combined screen');
    const scr2Checkbox = Array.from(doc.querySelectorAll('.compare-record-row')).find((r) => r.textContent.trim() === 'SCR2').querySelector('input');
    scr2Checkbox.checked = true;
    scr2Checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    check('SCR1 text is present', /Screen one/.test(doc.getElementById('screenOutput').textContent));
    check('SCR2 text is ALSO present, in the same combined screen', /Screen two/.test(doc.getElementById('screenOutput').textContent));
    check('still no dimmed-backdrop layer', !doc.querySelector('.dspf-screen-backdrop-layer'));
    check('exactly one .dspf-screen renders (a single combined layer, not primary+backdrop)', doc.querySelectorAll('.dspf-screen').length === 1);

    console.log('  clicking a field in overlay mode does nothing - it is genuinely read-only');
    posted.length = 0;
    const anyField = doc.querySelector('.dspf-field');
    check('setup: at least one field renders', !!anyField);
    anyField.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking a field does not select it (no click wiring at all in overlay mode)', !doc.querySelector('.dspf-field.selected'));
    check('clicking a field posts nothing back to the extension', posted.length === 0);

    console.log('  turning "Full overlay" back off restores the normal dimmed-backdrop behavior');
    overlayToggle.checked = false;
    overlayToggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('the primary record is interactive again', !!doc.querySelector('.dspf-field'));
    doc.querySelector('.dspf-field').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking a field now selects it again (interactivity restored)', !!doc.querySelector('.dspf-field.selected'));

    runPanelCollapseScenario();
  }, 0);
}

// Left/right side-panel hide/minimize controls - lets the screen preview
// reclaim horizontal space on wide-but-short layouts (a 27x132 *DS4
// display) where the two docked panels would otherwise crowd it out.
function runPanelCollapseScenario() {
  console.log('\nleft/right side-panel hide controls: collapsing either panel frees up space for the screen preview');
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R SCR1',
      "     A                                  1  2'Screen one'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce15', src, 'PANELS.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const asideEl = doc.querySelector('aside');
    const propsPanelEl = doc.getElementById('propsPanel');
    const leftToggle = doc.getElementById('leftPanelToggle');
    const rightToggle = doc.getElementById('rightPanelToggle');

    console.log('  both panels start expanded');
    check('left (aside) panel starts expanded', !asideEl.classList.contains('panel-collapsed'));
    check('right (properties) panel starts expanded', !propsPanelEl.classList.contains('panel-collapsed'));
    check('body reserves full width for both panels initially', /240px 1fr 300px/.test(doc.body.style.gridTemplateColumns));

    console.log('  hiding the left panel collapses it and gives the preview the freed-up width');
    leftToggle.dispatchEvent(new Event('click', { bubbles: true }));
    check('left panel is now collapsed', asideEl.classList.contains('panel-collapsed'));
    check('right panel is untouched', !propsPanelEl.classList.contains('panel-collapsed'));
    check('the grid column for the left panel shrank to the toggle-button width', /^28px 1fr 300px$/.test(doc.body.style.gridTemplateColumns));

    console.log('  hiding the right panel too collapses both independently');
    rightToggle.dispatchEvent(new Event('click', { bubbles: true }));
    check('right panel is now also collapsed', propsPanelEl.classList.contains('panel-collapsed'));
    check('both grid columns shrank', /^28px 1fr 28px$/.test(doc.body.style.gridTemplateColumns));

    console.log('  toggling either one again restores it independently of the other');
    leftToggle.dispatchEvent(new Event('click', { bubbles: true }));
    check('left panel is expanded again', !asideEl.classList.contains('panel-collapsed'));
    check('right panel stays collapsed', propsPanelEl.classList.contains('panel-collapsed'));
    check('grid reflects left restored, right still collapsed', /^240px 1fr 28px$/.test(doc.body.style.gridTemplateColumns));

    runSflMsgPickerScenario();
  }, 0);
}

function runSflMsgPickerScenario() {
  console.log('\nSFLMSG picker (Task R5): Message Record / General / Indicator tab, only on SFLMSGRCD-carrying records');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SFLMESS', func: 'SFL' }),
      buildLine({ seq: '00020', func: 'SFLMSGRCD(24)' }),
      buildLine({ seq: '00030', name: 'MSGKEY', dataType: 'A', length: '10', usage: 'H' }),
      buildLine({ seq: '00040', func: 'SFLMSGKEY' }),
      buildLine({ seq: '00050', name: 'PGMQ', dataType: 'A', length: '10', usage: 'H' }),
      buildLine({ seq: '00060', func: 'SFLPGMQ(276)' }),
      buildLine({ seq: '00070', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00080', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce16', src, 'SFLMSG.DSPF').replace(
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
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  a plain record (no SFLMSGRCD) does not get the SFLMSG tab');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('no SFLMSG tab button rendered', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFLMSG'));

    console.log('  an SFLMSG record (carries SFLMSGRCD) gets the SFLMSG tab');
    recordSelect.value = 'SFLMESS';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const sflMsgTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLMSG');
    check('SFLMSG tab button rendered', !!sflMsgTabBtn);
    sflMsgTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    console.log('  Message Record: line number pre-filled from SFLMSGRCD(24), and shows which fields carry SFLMSGKEY/SFLPGMQ');
    const rcdInput = doc.getElementById('sm-sflmsgrcd');
    check('SFLMSGRCD line pre-filled with 24', rcdInput && rcdInput.value === '24');
    const statusDivs = Array.from(doc.querySelectorAll('#propsBody .status')).map((d) => d.textContent);
    check('shows MSGKEY as the message ID field', statusDivs.some((t) => t.includes('MSGKEY')));
    check('shows PGMQ (276-byte) as the program message queue field', statusDivs.some((t) => t.includes('PGMQ') && t.includes('276-byte')));

    console.log('  Message Record: editing the line number commits SFLMSGRCD, other keywords untouched');
    rcdInput.value = '15';
    rcdInput.dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
    check('SFLMSGRCD updated to 15', reparsed.keywords.find((k) => k.name === 'SFLMSGRCD').parameters.trim() === '15');
    check('SFL keyword still present, untouched', reparsed.keywords.some((k) => k.name === 'SFL'));
    posted.length = 0;

    console.log('  Message Record: a field name is accepted too (not just a 1-27 line number)');
    rcdInput.value = 'LINEFLD';
    rcdInput.dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
    check('SFLMSGRCD accepts a field name', reparsed.keywords.find((k) => k.name === 'SFLMSGRCD').parameters.trim() === 'LINEFLD');
    posted.length = 0;

    console.log('  General: SFLNXTCHG/LOGOUT/LOGINP/KEEP/CHECK(AB)/CHECK(RL)/CHGINPDFT all start unchecked, toggling one commits just that keyword');
    check('SFLNXTCHG starts unchecked', !doc.getElementById('sm-sflnxtchg-on').checked);
    const keepBox = doc.getElementById('sm-keep-on');
    keepBox.checked = true;
    keepBox.dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
    check('KEEP was added', reparsed.keywords.some((k) => k.name === 'KEEP'));
    check('SFLNXTCHG was NOT added (independent toggle)', !reparsed.keywords.some((k) => k.name === 'SFLNXTCHG'));
    posted.length = 0;

    console.log('  General: CHECK(AB) and CHECK(RL) are independent toggles sharing the CHECK keyword name');
    doc.getElementById('sm-check-ab-on').checked = true;
    doc.getElementById('sm-check-ab-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
    check('CHECK(AB) was added', reparsed.keywords.some((k) => k.name === 'CHECK' && k.parameters.trim().toUpperCase() === 'AB'));
    check('CHECK(RL) was not', !reparsed.keywords.some((k) => k.name === 'CHECK' && k.parameters.trim().toUpperCase() === 'RL'));
    posted.length = 0;

    console.log('  Indicator: INDTXT (indicator+text) and SETOF (space-separated indicator list) commit independently');
    doc.getElementById('sm-indtxt-on').checked = true;
    doc.getElementById('sm-indtxt-ind').value = '50';
    doc.getElementById('sm-indtxt-text').value = "Amount valid";
    doc.getElementById('sm-indtxt-text').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
    const indtxtKw = reparsed.keywords.find((k) => k.name === 'INDTXT');
    check('INDTXT written with indicator 50 and quoted text', indtxtKw && /^50\s+'Amount valid'/.test(indtxtKw.parameters.trim()));
    posted.length = 0;

    doc.getElementById('sm-setof-on').checked = true;
    doc.getElementById('sm-setof-params').value = '30 31 32';
    doc.getElementById('sm-setof-params').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
    check('SETOF written with the space-separated indicator list', reparsed.keywords.find((k) => k.name === 'SETOF').parameters.trim() === '30 31 32');
    check('INDTXT from the previous step is still there (independent commits)', reparsed.keywords.some((k) => k.name === 'INDTXT'));

    runUsrDfnPickerScenario();
  }, 0);
}

function runUsrDfnPickerScenario() {
  console.log('\nUSRDFN picker (Task R2): Keywords tab narrows R1\'s 8 categories to General/App help/Help/Print only');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'USERDEFN', func: 'USRDFN' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00040', name: 'FLD2', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce17', src, 'USRDFN.DSPF').replace(
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
    const recordSelect = doc.getElementById('recordSelect');

    function keywordsSubtabLabels() {
      const keywordsTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Keywords');
      keywordsTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
      return Array.from(doc.querySelectorAll('.props-subtab')).map((b) => b.textContent.trim());
    }

    console.log('  a plain record gets all 8 R1 categories');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const plainLabels = keywordsSubtabLabels();
    check('all 8 category subtabs present', ['General', 'Indicator', 'App help', 'Help', 'Output', 'Input', 'Overlay', 'Print'].every((l) => plainLabels.includes(l)));

    console.log('  a USRDFN record (carries the USRDFN keyword) only gets General/App help/Help/Print');
    recordSelect.value = 'USERDEFN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const usrdfnLabels = keywordsSubtabLabels();
    check('exactly 4 subtabs', usrdfnLabels.length === 4);
    check('General present', usrdfnLabels.includes('General'));
    check('App help present', usrdfnLabels.includes('App help'));
    check('Help present', usrdfnLabels.includes('Help'));
    check('Print present', usrdfnLabels.includes('Print'));
    check('Indicator absent', !usrdfnLabels.includes('Indicator'));
    check('Output absent', !usrdfnLabels.includes('Output'));
    check('Input absent', !usrdfnLabels.includes('Input'));
    check('Overlay absent', !usrdfnLabels.includes('Overlay'));

    console.log('  General panel still commits normally for a USRDFN record (e.g. KEEP)');
    const keepBox = doc.getElementById('rk-USERDEFN-keep-on');
    check('KEEP checkbox exists in the narrowed panel', !!keepBox);
    keepBox.checked = true;
    keepBox.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    const reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'USERDEFN');
    check('KEEP was added', reparsed.keywords.some((k) => k.name === 'KEEP'));
    check('USRDFN keyword itself is untouched', reparsed.keywords.some((k) => k.name === 'USRDFN'));

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }, 0);
}

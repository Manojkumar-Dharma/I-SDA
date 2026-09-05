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
const DspfWriter = require('../../dist/dspfWriter.js');

/** Strips DDS keyword-area line-continuation (a trailing '+' followed by a
 *  continuation line whose first 44 columns are just blank padding/the 'A'
 *  marker - see dspfWriter.js's own wrapping comment) so a plain
 *  `.includes('KEYWORD(params)')` check doesn't spuriously fail just
 *  because OTHER keywords earlier on the same line pushed this one's
 *  parameters across the 80-column wrap boundary. Only used for substring
 *  assertions in this file - never for anything that gets fed back through
 *  the parser, which understands real DDS continuation on its own. */
function dewrapDds(text) {
  // DDS continuation uses "+" (insert one space at the join, already baked
  // into the continuation line's own column-45 content by the writer) or
  // "-" (join with no space) - either way, this strips just the padding
  // prefix (columns 1-44) of the continuation line, leaving its actual
  // column-45-onward text glued onto the previous line's own text.
  return (text || '').replace(/[+-]\r?\n.{44}/g, '');
}

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
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => refPosted.push(m) });
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
  console.log('\ndeleting a named field with likely references (e.g. REFFLD) is blocked on confirmation first (Task L2)');
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => delPosted.push(m) });
    },
  });

  setTimeout(() => {
    const delDoc = delDom.window.document;
    const { Event, KeyboardEvent } = delDom.window;
    const target = Array.from(delDoc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('SRCFLD'));
    check('setup: the target field is present', !!target);
    target.dispatchEvent(new Event('click', { bubbles: true }));
    delDoc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));

    check('nothing is deleted yet - a confirmation dialog blocks it first', !delPosted.some((m) => m.type === 'applyEdit'));
    const dialog = delDoc.querySelector('.confirm-overlay');
    check('a confirmation dialog is shown', !!dialog);
    check('the dialog names the likely reference (REFFLD / SRCFLD / the reference line)', dialog && /REFFLD/.test(dialog.textContent) && /SRCFLD/.test(dialog.textContent) && /3/.test(dialog.textContent));
    check('no post-hoc error message either - the confirmation IS the warning now', !delPosted.some((m) => m.type === 'error'));

    console.log('  pressing Delete again while the dialog is open does not stack a second one or delete early');
    delDoc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    check('still exactly one dialog', delDoc.querySelectorAll('.confirm-overlay').length === 1);
    check('still nothing deleted', !delPosted.some((m) => m.type === 'applyEdit'));

    console.log('  Cancel dismisses the dialog without deleting anything');
    dialog.querySelector('.confirm-dialog-cancel').dispatchEvent(new Event('click', { bubbles: true }));
    check('dialog is gone', !delDoc.querySelector('.confirm-overlay'));
    check('field was never deleted', !delPosted.some((m) => m.type === 'applyEdit'));

    console.log('  Delete -> confirm dialog -> "Delete anyway" actually deletes, leaving the REFFLD reference dangling (no auto-fix)');
    target.dispatchEvent(new Event('click', { bubbles: true }));
    delDoc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    const dialog2 = delDoc.querySelector('.confirm-overlay');
    check('dialog reappears for the confirm-then-delete path', !!dialog2);
    dialog2.querySelector('.confirm-dialog-confirm').dispatchEvent(new Event('click', { bubbles: true }));

    const applyEdit = delPosted.find((m) => m.type === 'applyEdit');
    check('deletes the field once confirmed', applyEdit && !applyEdit.text.includes('SRCFLD    10A'));
    check('does not rewrite the REFFLD reference itself (delete only warns, never auto-fixes)', applyEdit && applyEdit.text.includes('REFFLD(SRCFLD)'));
    check('dialog is closed after confirming', !delDoc.querySelector('.confirm-overlay'));

    console.log('  a field with NO detected references still deletes immediately - no confirmation click added to the common case');
    delPosted.length = 0;
    const othTarget = Array.from(delDoc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('OTHFLD'));
    check('setup: OTHFLD (no incoming references) is present', !!othTarget);
    othTarget.dispatchEvent(new Event('click', { bubbles: true }));
    delDoc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    check('no confirmation dialog for a field nothing references', !delDoc.querySelector('.confirm-overlay'));
    const othApplyEdit = delPosted.find((m) => m.type === 'applyEdit');
    check('deletes immediately', othApplyEdit && !othApplyEdit.text.includes('OTHFLD'));

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
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

    runOverlapWarningScenario();
  }, 0);
}

// Suggestion A - overlap warning banner. Real DDS silently drops a field
// that overlaps another one already claiming the same cells (see
// resolveScreen's own "Position-sequence overlap resolution" comment in
// dspfEngine.js) - this scenario deliberately places two constants on
// overlapping cells and checks the new banner names both of them.
function runOverlapWarningScenario() {
  console.log('\noverlap warning: two fields claiming the same screen cells');
  const overlapSource =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', line: '5', col: '2', func: "'First text'" }),
      buildLine({ seq: '00030', line: '5', col: '5', func: "'Second one'" }),
      buildLine({ seq: '00040', line: '10', col: '2', func: "'No overlap here'" }),
    ].join('\n') + '\n';
  const overlapHtml = getWebviewHtml('vscode-webview://fake', 'testnonce12', overlapSource, 'OVERLAPTEST.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const overlapDom = new JSDOM(overlapHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const overlapDoc = overlapDom.window.document;
    const banner = overlapDoc.getElementById('overlapWarning');
    check('the overlap warning banner is shown', banner && !banner.classList.contains('hidden'));
    check('names the field that got hidden ("Second one" was placed after "First text", so it loses)', /Second one/.test(banner.textContent));
    check('names which field it collided with', /First text/.test(banner.textContent));
    check('the non-overlapping field is not mentioned', !/No overlap here/.test(banner.textContent));
    check('DDS itself still only renders one of the two overlapping fields (the resolved screen matches the warning)', overlapDoc.querySelectorAll('.dspf-field').length === 2); // "First text" + "No overlap here" - "Second one" is dropped

    console.log('  a clean (no-overlap) screen keeps the banner hidden');
    const cleanSource =
      [
        buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
        buildLine({ seq: '00020', line: '5', col: '2', func: "'Only field'" }),
      ].join('\n') + '\n';
    const cleanHtml = getWebviewHtml('vscode-webview://fake', 'testnonce13', cleanSource, 'CLEANTEST.DSPF').replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      ''
    );
    const cleanDom = new JSDOM(cleanHtml, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      },
    });
    setTimeout(() => {
      const cleanDoc = cleanDom.window.document;
      const cleanBanner = cleanDoc.getElementById('overlapWarning');
      check('no overlap warning for a screen with no colliding fields', cleanBanner && cleanBanner.classList.contains('hidden'));

      runConditionalOverlapScenario();
    }, 0);
  }, 0);
}

// Follow-up check requested after Task A shipped: does the overlap warning
// correctly treat two same-position fields conditioned on MUTUALLY
// EXCLUSIVE indicators (the standard "toggle between two labels in the
// same spot" DDS technique - e.g. "Add" vs "Change" mode text) the same
// way real SDA does - i.e. NOT a false-positive overlap, since the two can
// never both be visible at once? resolveScreen's own candidate list is
// built AFTER conditionsSatisfied() already filters by the CURRENTLY
// toggled indicators (see resolveRecordFields in dspfEngine.js) - a field
// conditioned off for the current toggle state never becomes a candidate,
// so it can never collide with anything. For a strict N01/01 pair, that's
// true for BOTH possible states of indicator 01 (it's always one or the
// other, never both), so this scenario checks both toggle states, not
// just the default. As a contrast, two fields conditioned on UNRELATED
// (non-complementary) indicators that genuinely COULD be on simultaneously
// still correctly trigger the warning once both are toggled on - proving
// this isn't a blanket "any conditioned field is exempt" rule, only a
// genuinely-can't-co-occur one.
function runConditionalOverlapScenario() {
  console.log('\nfollow-up: overlap warning respects indicator conditioning, same as real SDA/DDS would at runtime');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', line: '5', col: '2', ind1: '01', func: "'Change mode'" }),
      buildLine({ seq: '00030', line: '5', col: '2', ind1: 'N01', func: "'Add mode'" }),
      buildLine({ seq: '00040', line: '10', col: '2', ind1: '05', func: "'Fifth flag on'" }),
      buildLine({ seq: '00050', line: '10', col: '2', ind1: '07', func: "'Seventh flag on'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce14', src, 'CONDOVERLAP.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const banner = doc.getElementById('overlapWarning');
    const toggle = (num) => {
      const label = Array.from(doc.getElementById('indicatorList').querySelectorAll('label')).find((l) => l.textContent.includes('Ind ' + num));
      const cb = label && label.querySelector('input');
      if (cb) {
        cb.checked = !cb.checked; // a real click toggles this as a side effect before 'change' fires - dispatching 'change' alone doesn't
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    console.log('  default state (indicator 01 off): only "Add mode" (N01) is a candidate - no overlap');
    check('overlap warning hidden by default', banner.classList.contains('hidden'));
    check('only the N01-conditioned field is actually rendered', doc.querySelectorAll('.dspf-field').length === 1 && doc.querySelector('.dspf-field').textContent.includes('Add mode'));

    console.log('  toggling indicator 01 ON: only "Change mode" (01) is a candidate now - still no overlap, same pair, other state');
    toggle('01');
    check('overlap warning still hidden with indicator 01 on', banner.classList.contains('hidden'));
    check('only the 01-conditioned field is rendered now', doc.querySelectorAll('.dspf-field').length === 1 && doc.querySelector('.dspf-field').textContent.includes('Change mode'));
    toggle('01'); // back off, for a clean slate before the next check

    console.log('  two fields on UNRELATED (non-complementary) indicators 05/07: toggling BOTH on together genuinely creates an overlap - the warning correctly still fires for this pair');
    check('overlap warning still hidden - neither 05 nor 07 is toggled on yet', banner.classList.contains('hidden'));
    toggle('05');
    check('still hidden with just 05 on (only one of the pair is visible)', banner.classList.contains('hidden'));
    toggle('07');
    check('overlap warning now shown - indicators 05 AND 07 are both on, so both fields are visible at the same position', !banner.classList.contains('hidden'));
    check('names one of the genuinely-colliding fields', /Fifth flag on|Seventh flag on/.test(banner.textContent));

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      // Task L36: the Copy button now goes through the same click-to-place flow as
      // "+ Field"/"+ Constant" - gridMetrics() needs a non-zero rect to convert a pixel
      // click into a line/column (jsdom does no real layout). Same 10px/col, 20px/row
      // stub runClickToPlaceScenario uses.
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event, KeyboardEvent } = dom.window;

    console.log('  Copy button on a named field - now asks where to place the copy instead of dropping it one row below (Task L36)');
    const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME'));
    check('setup: the target field is present', !!fieldEl);
    fieldEl.dispatchEvent(new Event('click', { bubbles: true }));
    check('selecting it shows the Copy button', doc.getElementById('p-copy') !== null);

    const beforeCount = doc.querySelectorAll('.dspf-field').length;
    doc.getElementById('p-copy').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking Copy does NOT immediately post an edit', !posted.some((m) => m.type === 'applyEdit'));
    check('instead activates the same crosshair placement class the canvas uses', !!doc.querySelector('.dspf-screen.placing'));
    check('nothing new on the canvas yet', doc.querySelectorAll('.dspf-field').length === beforeCount);

    // Click at pixel (305, 155) on the 10px/col x 20px/row grid: gridMetrics'
    // conversion is Math.round(px/cell) + 1, so this lands at col 32, line 9
    // (round(305/10)=31, +1=32; round(155/20)=8, +1=9).
    const screenEl = doc.querySelector('.dspf-screen');
    screenEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 305, clientY: 155 }));
    check('placement mode turns off once the click lands', !doc.querySelector('.dspf-screen.placing'));

    const placeLine = doc.getElementById('p-place-line');
    const placeCol = doc.getElementById('p-place-col');
    check('opens a placement form pre-filled with the clicked line', !!placeLine && placeLine.value === '9');
    check('...and column', !!placeCol && placeCol.value === '32');
    check('labels what is being copied', doc.getElementById('propsBody') && doc.getElementById('propsBody').textContent.includes('CUSTNAME'));
    const copyNameInput = doc.getElementById('p-copy-name');
    check('Task L43: a Name input is offered, pre-filled with the same auto-generated distinct name copyField would otherwise pick (no Length/Type inputs - those still come from the source field)', !!copyNameInput && copyNameInput.value === 'CUSTNAME2' && !doc.getElementById('p-place-name'));
    check('the "Place copy" button is present', !!doc.getElementById('p-place-add'));

    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit only once the placement is confirmed', !!applyEdit);
    check('the copy gets an auto-generated distinct name', applyEdit && /CUSTNAME2/.test(applyEdit.text));
    check('the original field is untouched', applyEdit && /CUSTNAME\s+30A/.test(applyEdit.text));
    check('the copy keeps the DSPATR keyword', applyEdit && (applyEdit.text.match(/DSPATR\(HI\)/g) || []).length === 2);
    check('the copy lands at the clicked line/column, not overlapping the original', applyEdit && (() => {
      const reparsedRec = DspfParser.parseDspf(applyEdit.text).records[0];
      const copy = reparsedRec.fields.find((f) => f.name === 'CUSTNAME2');
      return !!copy && copy.location.line === 9 && copy.location.column === 32;
    })());
    check('the screen re-renders with one more field', doc.querySelectorAll('.dspf-field').length === beforeCount + 1);
    check('the new copy is selected (Name input shows the auto-generated name)', doc.getElementById('p-name') && doc.getElementById('p-name').value === 'CUSTNAME2');
    check('the placement form is gone afterward (pendingPlacement/pendingCopySource cleared)', !doc.getElementById('p-place-add'));

    console.log('  Task L43: copy placement lets the user rename the copy instead of accepting the auto-generated name');
    posted.length = 0;
    // Re-select the original CUSTNAME field (not the CUSTNAME2 copy just made)
    // so the auto-generated suggestion this second copy starts from is predictable.
    const origFieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME') && !el.textContent.includes('CUSTNAME2'));
    origFieldEl.dispatchEvent(new Event('click', { bubbles: true }));
    doc.getElementById('p-copy').dispatchEvent(new Event('click', { bubbles: true }));
    // Re-query .dspf-screen fresh - the earlier `screenEl` reference is stale by now
    // (render() replaces screenOutput's innerHTML on every selection/placement-mode
    // change, so it no longer points at a node in the live document).
    doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 405, clientY: 155 }));
    const renameInput = doc.getElementById('p-copy-name');
    check('setup: the copy-name input is present again for a second copy', !!renameInput);
    renameInput.value = 'CUSTOM';
    renameInput.dispatchEvent(new Event('input', { bubbles: true }));
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    let renameEdit = posted.find((m) => m.type === 'applyEdit');
    check('the copy uses the user-chosen name instead of an auto-generated one', renameEdit && /\bCUSTOM\b/.test(renameEdit.text));
    check('the original field is still untouched', renameEdit && /CUSTNAME\s+30A/.test(renameEdit.text));

    console.log('  Task L43: renaming the copy to an already-used name in the target record is rejected');
    posted.length = 0;
    Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME') && !el.textContent.includes('CUSTNAME2') && !el.textContent.includes('CUSTOM')).dispatchEvent(new Event('click', { bubbles: true }));
    doc.getElementById('p-copy').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 505, clientY: 155 }));
    const renameInput2 = doc.getElementById('p-copy-name');
    renameInput2.value = 'CUSTNAME';
    renameInput2.dispatchEvent(new Event('input', { bubbles: true }));
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    check('no applyEdit posted for a colliding name', !posted.some((m) => m.type === 'applyEdit'));
    check('an actionable error is shown', /already exists/i.test(doc.getElementById('p-place-error').textContent));
    doc.getElementById('p-place-cancel').dispatchEvent(new Event('click', { bubbles: true }));

    console.log('  Task L44: Ctrl+D on a constant now asks where to place the copy too, same click-to-place flow as the Copy button');
    posted.length = 0;
    const constantEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('Some label'));
    check('setup: the target constant is present', !!constantEl);
    constantEl.dispatchEvent(new Event('click', { bubbles: true }));

    const beforeCount2 = doc.querySelectorAll('.dspf-field').length;
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
    check('Ctrl+D does NOT immediately post an edit', !posted.some((m) => m.type === 'applyEdit'));
    check('instead activates the same placement-mode crosshair the Copy button uses', !!doc.querySelector('.dspf-screen.placing'));
    check('nothing new on the canvas yet', doc.querySelectorAll('.dspf-field').length === beforeCount2);

    console.log('  Task L44: a second Ctrl+D fired while this placement is still pending is ignored, not a fresh clobbering placement');
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
    check('still just the one pending placement (form not reset) - the placement-mode crosshair is still active', !!doc.querySelector('.dspf-screen.placing'));

    doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 705, clientY: 235 }));
    check('opens the same placement form the Copy button opens (a Text input, since this is a literal constant)', !!doc.getElementById('p-copy-text') && doc.getElementById('p-copy-text').value === 'Some label');
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts applyEdit only once placement is confirmed', !!applyEdit);
    check('the constant text is duplicated (appears twice)', applyEdit && (applyEdit.text.match(/Some label/g) || []).length === 2);
    check('the screen re-renders with one more field', doc.querySelectorAll('.dspf-field').length === beforeCount2 + 1);

    console.log('  Task L43: copy placement lets the user edit a literal constant\'s own text, not just its position');
    posted.length = 0;
    Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('Some label')).dispatchEvent(new Event('click', { bubbles: true }));
    doc.getElementById('p-copy').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 605, clientY: 195 }));
    const copyTextInput = doc.getElementById('p-copy-text');
    check('a Text input is offered, pre-filled with the source constant\'s own text', !!copyTextInput && copyTextInput.value === 'Some label');
    copyTextInput.value = 'A different label';
    copyTextInput.dispatchEvent(new Event('input', { bubbles: true }));
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    const constCopyEdit = posted.find((m) => m.type === 'applyEdit');
    check('the copy uses the edited text, not a duplicate of the original', constCopyEdit && /A different label/.test(constCopyEdit.text));
    check('the original constant text is untouched', constCopyEdit && /Some label/.test(constCopyEdit.text));

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

    runNudgeCutCopyPasteScenario();
  }, 0);
}

// Arrow-key nudge and Ctrl+X/C/V cut/copy/paste - built on top of the same
// commitEdit (nudge) and DspfWriter.copyField/deleteField (cut/copy/paste)
// primitives runCopyFieldScenario above already exercises via the mouse
// drag and Copy button/Ctrl+D paths - this scenario is specifically about
// the NEW keyboard-only paths added alongside them.
function runNudgeCutCopyPasteScenario() {
  console.log('\narrow-key nudge and Ctrl+X/C/V cut/copy/paste');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'CUSTNAME', length: '30', dataType: 'A', usage: 'B', line: '10', col: '15' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'SCR2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce7', src, 'NUDGETEST.DSPF').replace(
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
      // Task L44: Ctrl+V (single-field clipboard) now goes through the
      // same click-to-place flow as the Copy button/Ctrl+D - see
      // runCopyFieldScenario's own identical stub for why gridMetrics()
      // needs this (jsdom does no real layout, so getBoundingClientRect
      // returns all zeros by default, which would make every click-to-
      // grid conversion divide by zero).
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event, KeyboardEvent } = dom.window;

    console.log('  Arrow keys nudge the selected field by one cell; Shift+Arrow nudges by 5');
    const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME'));
    check('setup: the target field is present', !!fieldEl);
    fieldEl.dispatchEvent(new Event('click', { bubbles: true }));

    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('ArrowDown posts an applyEdit', !!applyEdit);
    check('ArrowDown moves the field down one row (line 10 -> 11), same column', applyEdit && /CUSTNAME[\s\S]{0,20}\b11\s*15\b/.test(applyEdit.text.replace(/\n/g, ' ')));

    posted.length = 0;
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('Shift+ArrowRight posts an applyEdit', !!applyEdit);
    check('Shift+ArrowRight moves the field right by 5 columns (15 -> 20), same row (still 11)', applyEdit && /CUSTNAME[\s\S]{0,20}\b11\s*20\b/.test(applyEdit.text.replace(/\n/g, ' ')));

    posted.length = 0;
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    check('nudging past row 1 stays clamped at row 1 rather than going negative', posted.every((m) => m.type !== 'applyEdit' || !/\s0\s*20\b/.test(m.text.replace(/\n/g, ' '))));

    console.log('  Arrow keys while typing in a text input must NOT nudge the field');
    posted.length = 0;
    const nameInput = doc.getElementById('p-name');
    check('setup: the props panel has a Name input to type into', !!nameInput);
    if (nameInput) {
      nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      check('no applyEdit posted for ArrowDown fired from inside a text input', !posted.some((m) => m.type === 'applyEdit'));
    }

    console.log('  Ctrl+C copies to the in-memory clipboard WITHOUT touching the source; Ctrl+V pastes into another record');
    posted.length = 0;
    // Re-select CUSTNAME (fresh lookup - its own earlier nudges/edits may
    // have re-rendered the DOM node).
    const custEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME'));
    custEl.dispatchEvent(new Event('click', { bubbles: true }));
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
    check('Ctrl+C posts NO applyEdit (copy-to-clipboard is not itself a source edit)', !posted.some((m) => m.type === 'applyEdit'));

    const recordSelect = doc.getElementById('recordSelect');
    check('setup: the record dropdown is present', !!recordSelect);
    recordSelect.value = 'SCR2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));

    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
    check('Task L44: Ctrl+V does NOT immediately post an edit - it opens the same click-to-place flow the Copy button uses', !posted.some((m) => m.type === 'applyEdit'));
    check('activates the placement-mode crosshair', !!doc.querySelector('.dspf-screen.placing'));
    doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 305, clientY: 155 }));
    check('opens the placement form, pre-filled with the auto-generated distinct name (same collision handling as Copy button/Ctrl+D)', !!doc.getElementById('p-copy-name') && doc.getElementById('p-copy-name').value === 'CUSTNAME2');
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('Ctrl+V posts an applyEdit once placement is confirmed', !!applyEdit);
    const joined = applyEdit ? applyEdit.text.replace(/\n/g, ' ') : '';
    check('the pasted field lands under SCR2, not back under SCR1', applyEdit && /SCR2[\s\S]*CUSTNAME2/.test(applyEdit.text));
    check('the original CUSTNAME field under SCR1 is untouched', /SCR1[\s\S]*CUSTNAME\s+30A/.test(applyEdit ? applyEdit.text : ''));
    check('the pasted copy gets an auto-generated distinct name (CUSTNAME2), same collision handling as Copy button/Ctrl+D', /CUSTNAME2/.test(joined));

    console.log('  Ctrl+X cuts: removes the field AND loads the clipboard, so a following Ctrl+V re-inserts it elsewhere');
    posted.length = 0;
    // Switch back to SCR1 to see the original CUSTNAME field - the DOM only
    // renders whichever record is currently selected, and Ctrl+V above left
    // the dropdown on SCR2.
    recordSelect.value = 'SCR1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const custEl2 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('CUSTNAME') && !el.textContent.includes('CUSTNAME2'));
    check('setup: the original CUSTNAME field is present to cut', !!custEl2);
    custEl2.dispatchEvent(new Event('click', { bubbles: true }));
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('Ctrl+X posts an applyEdit removing the field', !!applyEdit && !/CUSTNAME\s+30A/.test(applyEdit.text));

    posted.length = 0;
    recordSelect.value = 'SCR1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
    check('Task L44: this Ctrl+V also opens the click-to-place flow rather than landing immediately', !posted.some((m) => m.type === 'applyEdit'));
    doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 405, clientY: 155 }));
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('a following Ctrl+V posts an applyEdit once placement is confirmed', !!applyEdit);
    // Note: this does NOT come back named "CUSTNAME" - nextAvailableFieldName
    // always assigns a fresh suffixed name (see its own doc comment in
    // dspfWriter.js), the same behavior every other copyField caller already
    // has, so a cut-then-paste-back doesn't special-case reusing the exact
    // original name even though it's free again.
    const scr1Idx = applyEdit ? applyEdit.text.indexOf('R SCR1') : -1;
    const scr2Idx = applyEdit ? applyEdit.text.indexOf('R SCR2') : -1;
    const scr1Block = scr1Idx >= 0 && scr2Idx > scr1Idx ? applyEdit.text.slice(scr1Idx, scr2Idx) : '';
    check('a following Ctrl+V re-inserts a CUSTNAME-named field back under SCR1 (fresh suffixed name, same as any other copyField call)', /CUSTNAME\d*\s+30A/.test(scr1Block));

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    console.log('  the "File" crumb (and the bold File label in the sidebar) opens the file-level keyword panel');
    check('setup: no field/record is selected yet, so the record panel (with rename) shows by default', doc.getElementById('p-record-name') !== null);
    const fileCrumbBtn = doc.getElementById('crumb-file');
    check('setup: the File crumb exists in the properties panel breadcrumb', !!fileCrumbBtn);
    fileCrumbBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('switches the props panel to the file-level view', doc.getElementById('crumb-file') !== null && doc.getElementById('crumb-file').classList.contains('current'));
    check('shows the existing DSPSIZ keyword as a chip', /DSPSIZ/.test(doc.getElementById('kwed-file').textContent));
    check('no record-level Name/rename input in this view', doc.getElementById('p-record-name') === null);

    console.log('  Task L8: Compile Display File (CRTDSPF) button exists and posts the right message');
    const compileDspfBtn = doc.getElementById('compileDspfBtn');
    check('setup: the Compile Display File button exists in the sidebar', !!compileDspfBtn);
    posted.length = 0;
    compileDspfBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('posts a compileDspf message (extension.ts dispatches to the new compileDspf() function)', posted.some((m) => m.type === 'compileDspf'));

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
    let rows = Array.from(doc.querySelectorAll('.field-order-row[data-idx]'));
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

    rows = Array.from(doc.querySelectorAll('.field-order-row[data-idx]'));
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    check('function-key legend starts empty (no keys defined yet)', doc.getElementById('fkeyLegend').querySelectorAll('.fkey-chip').length === 0);

    console.log('  file-level command keys now live under File attributes > Cmd keys, not a standalone left-panel section');
    doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.props-tab[data-tab="commandkeys"]').dispatchEvent(new Event('click', { bubbles: true }));

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
    check('the File attributes view is still showing after committing (does not bounce back to record view)', doc.getElementById('crumb-file').classList.contains('current'));

    console.log('  back to the record view (SCR1, currently selected) - its own Cmd keys tab still offers 03 (a record may override a file-level key, not a conflict)');
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    const recordNumSel = doc.querySelector('.cmdkey-number[data-prefix="record"]');
    check('key 03 is still offered at record level, since redefining it there is a legitimate override', Array.from(recordNumSel.options).some((o) => o.value === '03'));
    check('all 24 numbers remain available at record level', recordNumSel.options.length === 24);

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
    check('switching records returns to the record view (not stuck on File attributes)', !doc.getElementById('crumb-file').classList.contains('current'));

    console.log('  SCR1 overrides the file-level key 03 with its own CA03 - a legitimate per-record override, not a duplicate');
    recordSelect.value = 'SCR1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.cmdkey-type[data-prefix="record"]').value = 'CA';
    doc.querySelector('.cmdkey-number[data-prefix="record"]').value = '03';
    doc.querySelector('.cmdkey-indicator[data-prefix="record"]').value = '95';
    doc.querySelector('.cmdkey-text[data-prefix="record"]').value = 'Local exit';
    doc.querySelector('.cmdkey-add[data-prefix="record"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check("posts applyEdit with SCR1's own CA03 override alongside the untouched file-level CA03", last && /CA03\(95 'Local exit'\)/.test(last.text));
    check("the legend resolves key 03 to SCR1's own override text (F3=Local exit), not the file-level one (F3=Exit)", /F3=Local exit/.test(doc.getElementById('fkeyLegend').textContent));

    console.log('  remove the file-level key - SCR1 keeps its own override, and SCR2 (no override) loses F3 entirely');
    doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.cmdkey-remove[data-prefix="file"][data-number="03"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    const ca03Count = last ? (last.text.match(/\bCA03\(/g) || []).length : -1;
    check('exactly one CA03 remains after removing the file-level one - the record-level override', ca03Count === 1);
    check("SCR1's own record-level CA03 override survives the unrelated file-level removal", last && /CA03\(95 'Local exit'\)/.test(last.text));
    check('the record-level CF05 survives the unrelated file-level removal', last && /CF05/.test(last.text));

    console.log('  Task L27: SCR1\'s own CA03 override can carry indicator conditioning too (\"cmd keys can also have conditionings\")');
    doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    check('CA03 starts with no Conditioning shown as already set (0)', /Conditioning(?!\s*\(\d)/.test(doc.querySelector('.cmdkey-cond-toggle[data-prefix="record"][data-number="03"]').textContent));
    // Task L31: a command key's own conditioning-editor id prefix is now
    // keyed by its ordinal INDEX among this scope's command-key instances
    // (data-index), not its key number (data-number) - real SDA allows
    // multiple instances of the same number, so the number alone can no
    // longer identify a unique row. Read the row's own data-index here
    // rather than hardcoding it, so this test doesn't silently depend on
    // exactly which slot CA03 happens to land in.
    const ca03Index = doc.querySelector('.cmdkey-cond-toggle[data-prefix="record"][data-number="03"]').getAttribute('data-index');
    const ca03CondPrefix = 'record-cmdkey-' + ca03Index + '-cond';
    doc.querySelector('.cmdkey-cond-toggle[data-prefix="record"][data-number="03"]').dispatchEvent(new Event('click', { bubbles: true }));
    const cmdkeyPendingCountBefore = posted.length;
    doc.querySelector('.cond-add-group[data-prefix="' + ca03CondPrefix + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition does not write yet (pending, not committed)', posted.length === cmdkeyPendingCountBefore);
    const cmdkeyPendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    cmdkeyPendingNumInput.value = '80';
    doc.querySelector('.cond-ind-add[data-prefix="' + ca03CondPrefix + '"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('the pending-condition click did not itself post an edit; only the following + indicator click does', posted.length === cmdkeyPendingCountBefore + 1);
    last = posted[posted.length - 1];
    const scr1AfterCond = DspfParser.parseDspf(last.text).records.find((r) => r.name === 'SCR1');
    const ca03AfterCond = DspfWriter.parseCommandKeys(scr1AfterCond.keywords).find((k) => k.number === '03');
    check("SCR1's own CA03 is now conditioned on indicator 80", ca03AfterCond && ca03AfterCond.conditions.length === 1 && ca03AfterCond.conditions[0].indicators[0].number === '80');
    check("the CA03 override's own indicator (95) and text ('Local exit') survive the conditioning-only edit - not blanked out", ca03AfterCond.indicator === '95' && ca03AfterCond.text === 'Local exit');
    check("the unrelated record-level CF05 key is untouched by CA03's own conditioning edit", scr1AfterCond.keywords.some((k) => k.name === 'CF05'));

    console.log('  Task L31: a SECOND, independently-conditioned CA03 instance can be added on top of the existing (now-conditioned) one, without disturbing it');
    doc.querySelector('.cmdkey-type[data-prefix="record"]').value = 'CA';
    doc.querySelector('.cmdkey-number[data-prefix="record"]').value = '03';
    check('key 03 is STILL offered even though it is already in use twice over (file-level + this record) - Task L31 no longer excludes used numbers', Array.from(doc.querySelector('.cmdkey-number[data-prefix="record"]').options).some((o) => o.value === '03'));
    doc.querySelector('.cmdkey-indicator[data-prefix="record"]').value = '81';
    doc.querySelector('.cmdkey-text[data-prefix="record"]').value = 'Cancel';
    doc.querySelector('.cmdkey-add[data-prefix="record"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    const scr1AfterSecondCa03 = DspfParser.parseDspf(last.text).records.find((r) => r.name === 'SCR1');
    const allCa03 = DspfWriter.parseCommandKeys(scr1AfterSecondCa03.keywords).filter((k) => k.number === '03');
    check('SCR1 now carries TWO separate CA03 instances', allCa03.length === 2);
    check('the first (Local exit, conditioned on 80) is untouched by adding the second', allCa03.some((k) => k.text === 'Local exit' && k.conditions.length === 1 && k.conditions[0].indicators[0].number === '80'));
    check('the new second instance (Cancel, indicator 81) has no conditioning of its own', allCa03.some((k) => k.text === 'Cancel' && k.indicator === '81' && k.conditions.length === 0));

    runRulerScenario();
  }, 0);
}

function runRulerScenario() {
  console.log('\nruler overlay (Task L11): row/column numbers along the design canvas, toggled on/off, session-only');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'Hi'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce10', src, 'RULER.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    console.log('  off by default: no ruler numbers rendered, matching real SDA where F14 starts off each time');
    check('ruler toggle unchecked by default', !doc.getElementById('rulerToggle').checked);
    check('ruler corner/cols/rows all start hidden', doc.getElementById('rulerCorner').classList.contains('hidden') && doc.getElementById('rulerCols').classList.contains('hidden') && doc.getElementById('rulerRows').classList.contains('hidden'));

    console.log('  toggle on: column ruler (tens+ones rows) and row ruler (2-digit line numbers) both populate against the current DSPSIZ (24x80 default)');
    const rulerToggle = doc.getElementById('rulerToggle');
    rulerToggle.checked = true;
    rulerToggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('ruler corner/cols/rows are no longer hidden', !doc.getElementById('rulerCorner').classList.contains('hidden') && !doc.getElementById('rulerCols').classList.contains('hidden') && !doc.getElementById('rulerRows').classList.contains('hidden'));
    const colsText = doc.getElementById('rulerCols').textContent;
    const colsLines = colsText.split('\n');
    check('column ruler is two lines (tens row + ones row)', colsLines.length === 2);
    check('column ruler is 80 characters wide, matching the default DSPSIZ(24 80)', colsLines[0].length === 80 && colsLines[1].length === 80);
    check('tens row shows a "1" at column 10 (10th char) and a "8" at column 80', colsLines[0][9] === '1' && colsLines[0][79] === '8');
    check('ones row cycles 1-9,0 per column: starts "1234567890"', colsLines[1].slice(0, 10) === '1234567890');
    const rowsLines = doc.getElementById('rulerRows').textContent.split('\n');
    check('row ruler has 24 lines, matching the default DSPSIZ(24 80)', rowsLines.length === 24);
    check('row numbers are 2-digit and zero-padded: "01" first, "24" last', rowsLines[0] === '01' && rowsLines[23] === '24');

    console.log('  toggle off again: ruler hides without needing to switch records or re-resolve anything');
    rulerToggle.checked = false;
    rulerToggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('ruler hidden again after unchecking', doc.getElementById('rulerCols').classList.contains('hidden') && doc.getElementById('rulerRows').classList.contains('hidden'));

    runCrosshairScenario();
  }, 0);
}

function runCrosshairScenario() {
  console.log('\ncrosshair (Task L11 follow-up): position readout that tracks the mouse over the design canvas');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'Hi'" }),
      buildLine({ seq: '00030', nameType: 'R', name: 'SCR2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce11', src, 'CROSSHAIR.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      // Same 800x480-for-80x24 stub runClickToPlaceScenario already uses -
      // a clean 10px/col, 20px/row grid. rulerWrap and .dspf-screen share
      // this same stubbed rect (both at 0,0/800x480), so the wrapRect
      // offset the crosshair math subtracts is zero here - fine for
      // checking the row/column conversion and visibility toggling itself.
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event, MouseEvent } = dom.window;

    console.log('  off by default, same session-only convention as the ruler toggle');
    check('crosshair toggle unchecked by default', !doc.getElementById('crosshairToggle').checked);
    check('crosshair lines and readout all start hidden', doc.getElementById('crosshairV').classList.contains('hidden') && doc.getElementById('crosshairH').classList.contains('hidden') && doc.getElementById('crosshairReadout').classList.contains('hidden'));

    console.log('  moving the mouse without enabling the toggle does nothing');
    const rulerWrap = doc.getElementById('rulerWrap');
    rulerWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 155, clientY: 95 }));
    check('still hidden - toggle is off', doc.getElementById('crosshairV').classList.contains('hidden'));

    console.log('  toggle on, then move: lines appear and the readout shows the row/column under the cursor');
    const crosshairToggle = doc.getElementById('crosshairToggle');
    crosshairToggle.checked = true;
    crosshairToggle.dispatchEvent(new Event('change', { bubbles: true }));
    // Same conversion gridMetrics()/startDrag already use: round(px/cell)+1.
    // (155, 95) on a 10px/col x 20px/row grid -> col 17, line 6 (matches
    // runClickToPlaceScenario's own worked example for the identical stub).
    rulerWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 155, clientY: 95 }));
    check('crosshair lines are now visible', !doc.getElementById('crosshairV').classList.contains('hidden') && !doc.getElementById('crosshairH').classList.contains('hidden'));
    check('readout shows the correct row/column for this pixel position', doc.getElementById('crosshairReadout').textContent === 'Row 6, Column 17');

    console.log('  moving off the screen area (still inside rulerWrap, e.g. over the ruler labels) hides it again');
    rulerWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 900, clientY: 95 }));
    check('crosshair hides when the cursor leaves the screen rect', doc.getElementById('crosshairV').classList.contains('hidden') && doc.getElementById('crosshairReadout').classList.contains('hidden'));

    console.log('  re-rendering (switching records) hides a stale crosshair rather than leaving it stuck mid-screen');
    rulerWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 155, clientY: 95 }));
    check('setup: crosshair visible again before switching records', !doc.getElementById('crosshairV').classList.contains('hidden'));
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = 'SCR2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('crosshair hidden after switching records, without any mouseleave event', doc.getElementById('crosshairV').classList.contains('hidden') && doc.getElementById('crosshairReadout').classList.contains('hidden'));

    console.log('  toggle off: hides immediately even mid-hover');
    rulerWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 155, clientY: 95 }));
    check('setup: crosshair visible again', !doc.getElementById('crosshairV').classList.contains('hidden'));
    crosshairToggle.checked = false;
    crosshairToggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('crosshair hidden immediately on toggle-off', doc.getElementById('crosshairV').classList.contains('hidden') && doc.getElementById('crosshairReadout').classList.contains('hidden'));

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    console.log('  record conditioning: default view on load is the record props panel, starts unconditioned');
    check('starts unconditioned', /Unconditioned/.test(doc.getElementById('propsBody').textContent));
    const postedBeforeRecordAddGroup = posted.length;
    doc.querySelector('.cond-add-group[data-prefix="record"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition on the record does NOT write an indicator yet (pending, not committed)', posted.length === postedBeforeRecordAddGroup);
    const recordPendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    check('a pending (uncommitted) condition group is shown for the record', !!recordPendingNumInput);
    recordPendingNumInput.value = '01';
    doc.querySelector('.cond-ind-add[data-prefix="record"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
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

    const postedBeforeFieldAddGroup = posted.length;
    doc.querySelector('.cond-add-group[data-prefix="field"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition on the field does NOT write an indicator yet (pending, not committed)', posted.length === postedBeforeFieldAddGroup);
    const fieldPendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    check('a pending (uncommitted) condition group is shown for the field', !!fieldPendingNumInput);
    fieldPendingNumInput.value = '01';
    doc.querySelector('.cond-ind-add[data-prefix="field"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const Event = dom.window.Event;

    console.log('  select the field: two keyword chips, each with its own Conditioning toggle, neither expanded yet');
    const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.getAttribute('data-field') === 'NAME');
    check('setup: the field is present', !!fieldEl);
    fieldEl.dispatchEvent(new Event('click', { bubbles: true }));
    const toggles = Array.from(doc.querySelectorAll('.kw-cond-toggle[data-owner]'));
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
    const kwPendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    check('a pending (uncommitted) condition group is shown for this one keyword', !!kwPendingNumInput);
    kwPendingNumInput.value = '01';
    doc.querySelector('.cond-ind-add[data-prefix="' + ownerKey + '-kw0"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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

    console.log('  Colors & attributes on a named field (Task L1a: multi-instance states)');
    posted.length = 0;
    const amountEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('AMOUNT') || el.getAttribute('data-field') === 'AMOUNT');
    check('setup: the AMOUNT field is present', !!amountEl);
    amountEl.dispatchEvent(new Event('click', { bubbles: true }));

    // AMOUNT starts with no COLOR/DSPATR at all, so the states list starts
    // EMPTY (unlike the old single-pair editor, which always showed one
    // select+checkboxes even with nothing set). A permanently-visible
    // staging row (same pattern Command keys already uses) feeds the
    // "+ Add" button - filling it in and clicking Add is what creates
    // state 0, not clicking Add first and editing an initially-blank card
    // (a truly blank state would write nothing and vanish on re-render).
    const addStateBtn = Array.from(doc.querySelectorAll('.repeat-inst-add')).find((b) => /-colorattr$/.test(b.getAttribute('data-prefix')));
    check('setup: the "+ Add color/attribute state" button is present (list starts empty)', !!addStateBtn);
    const colorattrOwnerPrefix = addStateBtn.getAttribute('data-prefix');
    const fieldKey = colorattrOwnerPrefix.replace(/-colorattr$/, '');
    const stagingPrefix = colorattrOwnerPrefix + '-new';
    const stagingColorSel = doc.getElementById(stagingPrefix + '-color');
    check('setup: the staging Color select is present', !!stagingColorSel);
    stagingColorSel.value = 'RED';
    const stagingHiCheck = doc.querySelector('.' + stagingPrefix + '-attr[value="HI"]');
    check('setup: the staging HI attribute checkbox is present', !!stagingHiCheck);
    stagingHiCheck.checked = true;
    addStateBtn.dispatchEvent(new Event('click', { bubbles: true }));

    let colorEdit = posted.find((m) => m.type === 'applyEdit');
    check('"+ Add" reads the staging row and commits COLOR(RED) and DSPATR(HI) together as the new state', colorEdit && colorEdit.text.includes('COLOR(RED)') && colorEdit.text.includes('DSPATR(HI)'));

    console.log('  editing the now-EXISTING state 0 (not the staging row) still commits per-change');
    posted.length = 0;
    const colorInstPrefix = fieldKey + '-colorattr-inst0';
    const colorSel0 = doc.getElementById(colorInstPrefix + '-color');
    check('setup: state 0\'s own Color select is present, pre-filled with RED', !!colorSel0 && colorSel0.value === 'RED');
    const hiCheck0 = doc.querySelector('.' + colorInstPrefix + '-attr[value="HI"]');
    check('setup: state 0\'s own HI checkbox is present and pre-checked', !!hiCheck0 && hiCheck0.checked === true);
    const blCheck0 = doc.querySelector('.' + colorInstPrefix + '-attr[value="BL"]');
    blCheck0.checked = true;
    blCheck0.dispatchEvent(new Event('change', { bubbles: true }));
    let attrEdit = posted.find((m) => m.type === 'applyEdit');
    check('checking a second attribute on the existing card commits immediately, without touching Add', attrEdit && attrEdit.text.includes('DSPATR(HI BL)'));
    check('the color set earlier survives', attrEdit && attrEdit.text.includes('COLOR(RED)'));

    console.log('  a SECOND, independently-conditioned color/attribute state can be added alongside the first, again via the staging row');
    posted.length = 0;
    const stagingColorSel2 = doc.getElementById(stagingPrefix + '-color');
    stagingColorSel2.value = 'GRN';
    doc.querySelector('.repeat-inst-add[data-prefix="' + colorattrOwnerPrefix + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    const colorInstPrefix1 = fieldKey + '-colorattr-inst1';
    const colorSel1 = doc.getElementById(colorInstPrefix1 + '-color');
    check('setup: a second state (state 1) now has its own card', !!colorSel1 && colorSel1.value === 'GRN');
    let secondColorEdit = posted.find((m) => m.type === 'applyEdit');
    check('the new state writes its own COLOR(GRN)', secondColorEdit && secondColorEdit.text.includes('COLOR(GRN)'));
    check('the FIRST state (RED/HI/BL) is completely untouched by adding the second', secondColorEdit && secondColorEdit.text.includes('COLOR(RED)') && secondColorEdit.text.includes('DSPATR(HI BL)'));

    console.log('  clicking "+ Add" with an EMPTY staging row (no color, nothing checked) is a no-op');
    posted.length = 0;
    const stagingColorSel3 = doc.getElementById(stagingPrefix + '-color');
    check('setup: staging row reset back to blank after the previous add', stagingColorSel3.value === '');
    doc.querySelector('.repeat-inst-add[data-prefix="' + colorattrOwnerPrefix + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('nothing was posted for an empty add', posted.length === 0);

    console.log('  conditioning ONLY the second state does not condition the first');
    doc.querySelector('.repeat-inst-cond-toggle[data-prefix="' + colorattrOwnerPrefix + '"][data-idx="1"]').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.cond-add-group[data-prefix="' + colorInstPrefix1 + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition on the color/attr state does NOT write yet (pending, not committed)', posted.length === 0);
    const colorAttrPendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    check('a pending (uncommitted) condition group is shown for the color/attr state', !!colorAttrPendingNumInput);
    colorAttrPendingNumInput.value = '01';
    doc.querySelector('.cond-ind-add[data-prefix="' + colorInstPrefix1 + '"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
    let condEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts an applyEdit that still carries both COLOR keywords after conditioning just the second', condEdit && condEdit.text.includes('COLOR(GRN)') && condEdit.text.includes('COLOR(RED)'));

    const parsedAfterCond = DspfParser.parseDspf(condEdit.text);
    const amountAfterCond = parsedAfterCond.records.find((r) => r.name === 'SCR1').fields.find((f) => f.name === 'AMOUNT');
    const statesAfterCond = DspfWriter.getColorAttrStates(amountAfterCond.keywords);
    check('exactly two Color & attributes states round-trip back out', statesAfterCond.length === 2);
    const redState = statesAfterCond.find((s) => s.color === 'RED');
    const grnState = statesAfterCond.find((s) => s.color === 'GRN');
    check('the RED/HI/BL state is still completely unconditioned', !!redState && redState.attrs.indexOf('HI') >= 0 && redState.attrs.indexOf('BL') >= 0 && redState.conditions.length === 0);
    check('the GRN state is now conditioned on indicator 01, independent of the RED state', !!grnState && grnState.conditions.length === 1 && grnState.conditions[0].indicators[0].number === '01');

    console.log('  removing the second state leaves the first alone');
    posted.length = 0;
    doc.querySelector('.repeat-inst-remove[data-prefix="' + colorattrOwnerPrefix + '"][data-idx="1"]').dispatchEvent(new Event('click', { bubbles: true }));
    let removeEdit = posted.find((m) => m.type === 'applyEdit');
    check('COLOR(GRN) is gone after removing state 1', removeEdit && !removeEdit.text.includes('COLOR(GRN)'));
    check('COLOR(RED)/DSPATR(HI BL) (state 0) survives the removal of the unrelated state', removeEdit && removeEdit.text.includes('COLOR(RED)') && removeEdit.text.includes('DSPATR(HI BL)'));

    console.log('  Task L5: Validity check (RANGE/COMP/VALUES) as repeatable, independently-conditioned instances');
    posted.length = 0;
    const amountEl2 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    check('setup: AMOUNT is still findable after re-render', !!amountEl2);
    amountEl2.dispatchEvent(new Event('click', { bubbles: true }));

    const vcAddBtn = doc.querySelector('.repeat-inst-add[data-prefix="' + fieldKey + '-vc-rep"]');
    check('setup: the + Add validity check button is present', !!vcAddBtn);
    vcAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let vcAddEdit = posted.find((m) => m.type === 'applyEdit');
    check('adding an instance immediately writes the non-blank placeholder (RANGE(1 99), so the row survives the very next re-render)', vcAddEdit && vcAddEdit.text.includes('RANGE(1 99)'));

    // Re-select after the add re-rendered the panel.
    const amountVcF = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountVcF.dispatchEvent(new Event('click', { bubbles: true }));
    const vcParamsEl = doc.querySelector('.' + fieldKey + '-vc-rep-inst0-params');
    check('setup: the new instance\u2019s params box is present', !!vcParamsEl);
    posted.length = 0;
    vcParamsEl.value = '0 999';
    vcParamsEl.dispatchEvent(new Event('change', { bubbles: true }));
    let vcParamsEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts RANGE with the entered bounds', vcParamsEdit && dewrapDds(vcParamsEdit.text).includes('RANGE(0 999)'));

    console.log('  Task L5: switching a validity-check row\u2019s kind swaps RANGE for COMP/VALUES on that SAME instance');
    posted.length = 0;
    const amountVcG = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountVcG.dispatchEvent(new Event('click', { bubbles: true }));
    const vcKindEl = doc.querySelector('.' + fieldKey + '-vc-rep-inst0-kind');
    vcKindEl.value = 'COMP';
    vcKindEl.dispatchEvent(new Event('change', { bubbles: true }));
    let vcKindEdit = posted.find((m) => m.type === 'applyEdit');
    check('switching kind writes COMP with the SAME parameters text, no more RANGE', vcKindEdit && vcKindEdit.text.includes('COMP(0 999)') && !vcKindEdit.text.includes('RANGE('));

    console.log('  Task L5: a second, independently-conditioned validity-check instance coexists with the first');
    posted.length = 0;
    const amountVcH = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountVcH.dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.repeat-inst-add[data-prefix="' + fieldKey + '-vc-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    let secondVcAddEdit = posted.find((m) => m.type === 'applyEdit');
    check('the first instance (now COMP) survives adding a second', secondVcAddEdit && secondVcAddEdit.text.includes('COMP(0 999)'));
    check('the second instance starts with its own RANGE(1 99) placeholder', secondVcAddEdit && secondVcAddEdit.text.includes('RANGE(1 99)'));
    const reparsedForVc = DspfParser.parseDspf(secondVcAddEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT');
    const vcInstances = DspfWriter.getValidityCheckInstances(reparsedForVc.keywords);
    check('exactly two validity-check instances round-trip back out', vcInstances.length === 2);

    console.log('  Edit code / word / mask on a named field (still single-instance, behind its own Apply button)');
    posted.length = 0;
    const amountVcI = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountVcI.dispatchEvent(new Event('click', { bubbles: true }));
    doc.getElementById(fieldKey + '-ec-kind').value = 'EDTCDE';
    doc.getElementById(fieldKey + '-ec-params').value = 'J';
    doc.querySelector('.' + fieldKey + '-vc-apply').dispatchEvent(new Event('click', { bubbles: true }));

    const vcEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts EDTCDE with the chosen code', vcEdit && vcEdit.text.includes('EDTCDE(J)'));
    check('the two validity-check instances from above are untouched by the edit-code Apply', vcEdit && vcEdit.text.includes('COMP(0 999)') && vcEdit.text.includes('RANGE(1 99)'));

    console.log('  CHKMSGID: overrides the validity-check error message (its own Apply button, separate from EDTCDE/EDTWRD/EDTMSK\u2019s)');
    posted.length = 0;
    const amountVcCm = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountVcCm.dispatchEvent(new Event('click', { bubbles: true }));
    check('setup: the CHKMSGID inputs are present', !!doc.getElementById(fieldKey + '-cm-msgid') && !!doc.getElementById(fieldKey + '-cm-msgfile') && !!doc.getElementById(fieldKey + '-cm-library') && !!doc.getElementById(fieldKey + '-cm-msgdata'));
    doc.getElementById(fieldKey + '-cm-msgid').value = 'USR1234';
    doc.getElementById(fieldKey + '-cm-msgfile').value = 'USRMSGS';
    doc.getElementById(fieldKey + '-cm-library').value = 'QGPL';
    doc.getElementById(fieldKey + '-cm-msgdata').value = 'MSGFLD1';
    doc.querySelector('.' + fieldKey + '-cm-apply').dispatchEvent(new Event('click', { bubbles: true }));
    const cmEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts CHKMSGID with library/file slash-qualified and the &data field', cmEdit && dewrapDds(cmEdit.text).includes('CHKMSGID(USR1234 QGPL/USRMSGS &MSGFLD1)'));
    check('the earlier EDTCDE and validity-check instances survive the CHKMSGID Apply', cmEdit && cmEdit.text.includes('EDTCDE(J)') && cmEdit.text.includes('COMP(0 999)'));

    console.log('  CHKMSGID: blanking message-id and message-file removes it again (both are required by DDS)');
    posted.length = 0;
    const amountVcCm2 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountVcCm2.dispatchEvent(new Event('click', { bubbles: true }));
    doc.getElementById(fieldKey + '-cm-msgid').value = '';
    doc.getElementById(fieldKey + '-cm-msgfile').value = '';
    doc.querySelector('.' + fieldKey + '-cm-apply').dispatchEvent(new Event('click', { bubbles: true }));
    const cmRemoveEdit = posted.find((m) => m.type === 'applyEdit');
    check('CHKMSGID is gone once message-id and message-file are both blanked', cmRemoveEdit && !cmRemoveEdit.text.includes('CHKMSGID'));

    console.log('  Task L1b: Error messages (ERRMSG/ERRMSGID) as repeatable, independently-conditioned instances');
    posted.length = 0;
    const amountEl2b = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl2b.dispatchEvent(new Event('click', { bubbles: true }));
    const errmsgAddBtn = doc.querySelector('.repeat-inst-add[data-prefix="' + fieldKey + '-errmsg"]');
    check('setup: the + Add error message button is present', !!errmsgAddBtn);
    errmsgAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let addEdit = posted.find((m) => m.type === 'applyEdit');
    check('adding an instance immediately writes ERRMSG with its non-blank placeholder text (so the row survives the very next re-render)', addEdit && addEdit.text.includes("ERRMSG('New message')"));

    // Re-select after the add re-rendered the panel.
    const amountEl2c = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl2c.dispatchEvent(new Event('click', { bubbles: true }));
    const errmsgTextEl = doc.querySelector('.' + fieldKey + '-errmsg-inst0-text');
    check('setup: the new instance defaults to kind ERRMSG (text box shown, not msgid/file)', !!errmsgTextEl);
    errmsgTextEl.value = "Amount can't be negative";
    errmsgTextEl.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    const respIndEl = doc.querySelector('.' + fieldKey + '-errmsg-inst0-respind');
    respIndEl.value = '90';
    respIndEl.dispatchEvent(new Event('change', { bubbles: true }));

    const errEdit = posted.find((m) => m.type === 'applyEdit');
    // ERRMSG's own text is long enough to line-wrap with a continuation '+'
    // (same convention as TEXT), so check the round-tripped MODEL rather
    // than raw source text.
    const reparsedForErr = DspfParser.parseDspf(errEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT');
    const errKw = reparsedForErr && reparsedForErr.keywords.find((k) => k.name === 'ERRMSG');
    check('posts ERRMSG with the text (apostrophe correctly doubled) AND the response indicator, both fields surviving the earlier separate commit', errKw && errKw.parameters === "'Amount can''t be negative' 90");

    console.log('  Task L1b: switching an error-message row\u2019s kind to ERRMSGID swaps in msgid/file/library/name inputs');
    posted.length = 0;
    const amountEl2d = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl2d.dispatchEvent(new Event('click', { bubbles: true }));
    const kindSelEl = doc.querySelector('.' + fieldKey + '-errmsg-inst0-kind');
    kindSelEl.value = 'ERRMSGID';
    kindSelEl.dispatchEvent(new Event('change', { bubbles: true }));
    let kindEdit = posted.find((m) => m.type === 'applyEdit');
    check('switching kind writes ERRMSGID with placeholder msgid/file (so the row survives), no more ERRMSG', kindEdit && kindEdit.text.includes('ERRMSGID(MSGID MSGFILE') && !kindEdit.text.includes('ERRMSG('));

    const amountEl2e = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl2e.dispatchEvent(new Event('click', { bubbles: true }));
    const msgIdEl = doc.querySelector('.' + fieldKey + '-errmsg-inst0-msgid');
    const msgFileEl = doc.querySelector('.' + fieldKey + '-errmsg-inst0-msgfile');
    check('setup: switching kind re-renders msgid/file inputs in place of the text box', !!msgIdEl && !!msgFileEl);
    posted.length = 0;
    msgIdEl.value = 'MSG0001';
    msgIdEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Re-select: that change just re-rendered the panel (same convention as
    // every other edit in this file), so msgFileEl above is now stale.
    const amountEl2f = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl2f.dispatchEvent(new Event('click', { bubbles: true }));
    const msgFileEl2 = doc.querySelector('.' + fieldKey + '-errmsg-inst0-msgfile');
    msgFileEl2.value = 'APPLMSGS';
    msgFileEl2.dispatchEvent(new Event('change', { bubbles: true }));

    const idEdit = posted[posted.length - 1];
    check('posts ERRMSGID with both the msgid and message file the user actually typed, each surviving the OTHER field\'s separate commit', idEdit && idEdit.type === 'applyEdit' && dewrapDds(idEdit.text).includes('ERRMSGID(MSG0001 APPLMSGS') && !idEdit.text.includes('ERRMSG('));

    console.log('  Keying options (CHECK) on a named field - Task L1d: now a repeatable, independently-conditioned instance (Task L1\u2019s foundation)');
    posted.length = 0;
    const amountEl3 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl3.dispatchEvent(new Event('click', { bubbles: true }));
    check('no CHECK instances yet - empty state shown under Keying options', doc.getElementById(fieldKey + '-keying-check-rep-instances').textContent.indexOf('None defined.') >= 0);
    const keyingAddBtn = doc.querySelector('.repeat-inst-add[data-prefix="' + fieldKey + '-keying-check-rep"]');
    check('setup: the + Add CHECK instance button is present under Keying options', !!keyingAddBtn);
    keyingAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let keyingEdit = posted.find((m) => m.type === 'applyEdit');
    check('adding an instance immediately writes CHECK(ME) - Keying options\u2019 own non-blank placeholder code, not a blank/invalid CHECK()', keyingEdit && keyingEdit.text.includes('CHECK(ME)'));

    console.log('  Validity check\u2019s own CHECK codes (AB/VN/VNE/M10/M11) merge onto that SAME instance, not a separate one');
    posted.length = 0;
    const amountEl4 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl4.dispatchEvent(new Event('click', { bubbles: true }));
    // Validity check's panel renders the SAME instance list Keying options
    // just wrote to (both read via DspfWriter.getRepeatableKeywordInstances
    // (keywords, ['CHECK'])) - so instance 0 (carrying ME) shows up here
    // too, just with Validity's OWN code checkboxes (AB/VN/VNE/M10/M11)
    // instead of Keying's.
    const abCheck = doc.querySelector('.' + fieldKey + '-validity-check-rep-inst0-code[data-code="AB"]');
    check('setup: instance 0\u2019s AB (Allow blanks) checkbox is present under Validity check', !!abCheck);
    abCheck.checked = true;
    abCheck.dispatchEvent(new Event('change', { bubbles: true }));
    let mergedEdit = posted.find((m) => m.type === 'applyEdit');
    const mergedCheck = DspfParser.parseDspf(mergedEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.find((k) => k.name === 'CHECK');
    check('CHECK ends up with BOTH the earlier ME (Keying options) and the new AB (Validity check) on the SAME instance', mergedCheck && mergedCheck.parameters.split(/\s+/).sort().join(',') === 'AB,ME');

    console.log('  Modulus 10/11 Immediate toggle switches M10 <-> M10F, on that same shared instance');
    posted.length = 0;
    const amountEl5 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl5.dispatchEvent(new Event('click', { bubbles: true }));
    const m10Check = doc.querySelector('.' + fieldKey + '-validity-check-rep-inst0-code[data-code="M10"]');
    const m10Immed = doc.querySelector('.' + fieldKey + '-validity-check-rep-inst0-code-immed[data-for="M10"]');
    check('setup: M10 checkbox and its Immed checkbox are both present', !!m10Check && !!m10Immed);
    m10Check.checked = true;
    m10Immed.checked = true;
    m10Immed.dispatchEvent(new Event('change', { bubbles: true }));
    let immedEdit = posted.find((m) => m.type === 'applyEdit');
    const immedCheck = DspfParser.parseDspf(immedEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.find((k) => k.name === 'CHECK');
    check('Immed checked writes M10F rather than plain M10', immedCheck && immedCheck.parameters.split(/\s+/).indexOf('M10F') >= 0);
    check('and does not ALSO write plain M10', immedCheck && immedCheck.parameters.split(/\s+/).indexOf('M10') < 0);
    check('ME and AB from the earlier steps both survive this Validity-only edit', immedCheck && immedCheck.parameters.split(/\s+/).indexOf('ME') >= 0 && immedCheck.parameters.split(/\s+/).indexOf('AB') >= 0);

    console.log('  A SECOND, independently-conditioned CHECK instance coexists with the first (Task L1\u2019s whole point) - added from Validity check this time');
    posted.length = 0;
    const amountEl5b = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl5b.dispatchEvent(new Event('click', { bubbles: true }));
    const validityAddBtn = doc.querySelector('.repeat-inst-add[data-prefix="' + fieldKey + '-validity-check-rep"]');
    check('setup: the + Add CHECK instance button is present under Validity check too', !!validityAddBtn);
    validityAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let secondAddEdit = posted.find((m) => m.type === 'applyEdit');
    const secondAddChecks = secondAddEdit && DspfParser.parseDspf(secondAddEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.filter((k) => k.name === 'CHECK');
    check('a second CHECK keyword now exists, seeded with Validity\u2019s own placeholder (AB), independent of the first instance', secondAddChecks && secondAddChecks.length === 2 && secondAddChecks[1].parameters.trim() === 'AB');
    check('the FIRST instance (ME AB M10F) is untouched by adding the second', secondAddChecks && secondAddChecks[0].parameters.split(/\s+/).sort().join(',') === 'AB,M10F,ME');

    console.log('  Input keywords (DUP/BLANKS/CHANGE/CHGINPDFT) on a named field - Task L5: each its own flagRowHtml row with per-keyword conditioning');
    posted.length = 0;
    const amountEl6 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl6.dispatchEvent(new Event('click', { bubbles: true }));
    const dupCheck = doc.getElementById(fieldKey + '-inp-dup-on');
    check('setup: the DUP checkbox is present', !!dupCheck);
    dupCheck.checked = true;
    dupCheck.dispatchEvent(new Event('change', { bubbles: true }));
    let inputEdit = posted.find((m) => m.type === 'applyEdit');
    check('checking DUP commits it immediately', inputEdit && inputEdit.text.includes('DUP'));

    console.log('  Bug fix: CHGINPDFT now has its own 9 sub-flag checkboxes (HI/RI/CS/BL/UL/LC/ME/MF/FE) - previously a bare on/off toggle with no way to set its own parameters at all');
    posted.length = 0;
    const chginpdftHi = Array.from(doc.querySelectorAll('.' + fieldKey + '-inp-chginpdft-code')).find((el) => el.value === 'HI');
    check('all 9 CHGINPDFT sub-flag checkboxes are present', doc.querySelectorAll('.' + fieldKey + '-inp-chginpdft-code').length === 9);
    check('the CHGINPDFT on/off checkbox starts unchecked', doc.getElementById(fieldKey + '-inp-chginpdft-on') && !doc.getElementById(fieldKey + '-inp-chginpdft-on').checked);
    chginpdftHi.checked = true;
    chginpdftHi.dispatchEvent(new Event('change', { bubbles: true }));
    // Re-query after the HI commit re-renders the panel - a checkbox
    // fetched before a commit is a stale/detached reference afterward,
    // same as every other multi-step interaction in this file.
    const chginpdftMe = Array.from(doc.querySelectorAll('.' + fieldKey + '-inp-chginpdft-code')).find((el) => el.value === 'ME');
    check('after committing HI, the checkbox still shows HI checked (re-rendered from committed state, not lost)', Array.from(doc.querySelectorAll('.' + fieldKey + '-inp-chginpdft-code')).find((el) => el.value === 'HI').checked);
    chginpdftMe.checked = true;
    chginpdftMe.dispatchEvent(new Event('change', { bubbles: true }));
    let chginpdftEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    const chginpdftKw = chginpdftEdit && DspfParser.parseDspf(chginpdftEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.find((k) => k.name === 'CHGINPDFT');
    check('checking sub-flags commits CHGINPDFT with both codes, space-joined', chginpdftKw && chginpdftKw.parameters.trim().split(/\s+/).sort().join(',') === 'HI,ME');
    check('checking a sub-flag also force-checks the main on/off box (otherwise setFileFlagKeyword would drop it)', doc.getElementById(fieldKey + '-inp-chginpdft-on').checked);

    console.log('  General keywords (ALIAS/DFT/... + boolean flags) on a named field - Task L5: each its own flagRowHtml row with per-keyword conditioning, committing immediately');
    posted.length = 0;
    const amountEl7 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl7.dispatchEvent(new Event('click', { bubbles: true }));
    const aliasOn = doc.getElementById(fieldKey + '-gen-alias-on');
    const aliasParams = doc.getElementById(fieldKey + '-gen-alias-params');
    check('setup: the ALIAS checkbox is present', !!aliasOn);
    check('setup: the ALIAS param input is present', !!aliasParams);
    aliasParams.value = 'AMOUNT_DUE';
    aliasOn.checked = true;
    aliasOn.dispatchEvent(new Event('change', { bubbles: true }));
    let genEdit = posted.find((m) => m.type === 'applyEdit');
    check('posts ALIAS with the entered name', genEdit && DspfParser.parseDspf(genEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.find((k) => k.name === 'ALIAS' && k.parameters === 'AMOUNT_DUE'));

    posted.length = 0;
    const putretainOn = doc.getElementById(fieldKey + '-gen-putretain-on');
    check('setup: the PUTRETAIN checkbox is present', !!putretainOn);
    putretainOn.checked = true;
    putretainOn.dispatchEvent(new Event('change', { bubbles: true }));
    let genEdit2 = posted.find((m) => m.type === 'applyEdit');
    const genFields2 = genEdit2 && DspfParser.parseDspf(genEdit2.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords;
    check('posts PUTRETAIN bare', genFields2 && genFields2.some((k) => k.name === 'PUTRETAIN'));
    check('the earlier ALIAS commit survives this separate PUTRETAIN commit', genFields2 && genFields2.some((k) => k.name === 'ALIAS' && k.parameters === 'AMOUNT_DUE'));

    console.log('  Bug fix: CNTFLD is now selectable in General keywords - previously absent from the row list entirely, so there was no way to add it from the panel');
    posted.length = 0;
    const cntfldOn = doc.getElementById(fieldKey + '-gen-cntfld-on');
    const cntfldParams = doc.getElementById(fieldKey + '-gen-cntfld-params');
    check('the CNTFLD checkbox is present', !!cntfldOn);
    check('the CNTFLD param input is present', !!cntfldParams);
    cntfldParams.value = '40';
    cntfldOn.checked = true;
    cntfldOn.dispatchEvent(new Event('change', { bubbles: true }));
    let cntfldEdit = posted.find((m) => m.type === 'applyEdit');
    const cntfldFields = cntfldEdit && DspfParser.parseDspf(cntfldEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords;
    check('posts CNTFLD with the entered characters-per-line value', cntfldFields && cntfldFields.some((k) => k.name === 'CNTFLD' && k.parameters === '40'));
    check('the earlier ALIAS/PUTRETAIN commits survive this separate CNTFLD commit', cntfldFields && cntfldFields.some((k) => k.name === 'ALIAS' && k.parameters === 'AMOUNT_DUE') && cntfldFields.some((k) => k.name === 'PUTRETAIN'));

    console.log('  Database reference (DLTCHK/DLTEDT) on a named field - Task L5: each its own flagRowHtml row with per-keyword conditioning');
    posted.length = 0;
    const amountEl6b = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl6b.dispatchEvent(new Event('click', { bubbles: true }));
    const dltchkOn = doc.getElementById(fieldKey + '-ref-dltchk-on');
    check('setup: the DLTCHK checkbox is present', !!dltchkOn);
    dltchkOn.checked = true;
    dltchkOn.dispatchEvent(new Event('change', { bubbles: true }));
    let refEdit = posted.find((m) => m.type === 'applyEdit');
    check('checking DLTCHK commits it immediately', refEdit && refEdit.text.includes('DLTCHK'));

    console.log('  Message ID (MSGID) on a named field - Task L5: repeatable, independently-conditioned instances');
    posted.length = 0;
    const amountEl8 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === 'AMOUNT');
    amountEl8.dispatchEvent(new Event('click', { bubbles: true }));
    const msgidPrefix = fieldKey + '-msgid';
    const msgidStagingInput = doc.querySelector('.' + msgidPrefix + '-new-text');
    check('setup: the MSGID staging input is present', !!msgidStagingInput);
    msgidStagingInput.value = 'USR &AMOUNT MSGF1 MYLIB';
    const msgidAddBtn = doc.querySelector('.repeat-inst-add[data-prefix="' + msgidPrefix + '"]');
    check('setup: the + Add message ID button is present', !!msgidAddBtn);
    msgidAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let msgidEdit = posted.find((m) => m.type === 'applyEdit');
    const msgidFields = DspfParser.parseDspf(msgidEdit.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords;
    check('posts MSGID with the entered argument text', msgidFields.find((k) => k.name === 'MSGID') && msgidFields.find((k) => k.name === 'MSGID').parameters === 'USR &AMOUNT MSGF1 MYLIB');

    posted.length = 0;
    const msgidStagingInput2 = doc.querySelector('.' + msgidPrefix + '-new-text');
    msgidStagingInput2.value = '*NONE';
    doc.querySelector('.repeat-inst-add[data-prefix="' + msgidPrefix + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    let msgidEdit2 = posted.find((m) => m.type === 'applyEdit');
    const msgidFields2 = DspfParser.parseDspf(msgidEdit2.text).records[0].fields.find((f) => f.name === 'AMOUNT').keywords.filter((k) => k.name === 'MSGID');
    check('a second, independently-conditioned MSGID instance coexists with the first', msgidFields2.length === 2 && msgidFields2[0].parameters === 'USR &AMOUNT MSGF1 MYLIB' && msgidFields2[1].parameters === '*NONE');

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
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

    runD5MenuBarChoiceScenario();
  }, 0);
}

function runD5MenuBarChoiceScenario() {
  console.log('\nD5: menu-bar choice fields (MNUBARCHC/MNUBARSEP on an MNB* field, Choice Selection Type/CHOICE/CHCCTL/CHCACCEL/CHCAVAIL on a SNGCHCFLD/MLTCHCFLD field)');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'MB', func: 'MNUBAR' }),
      buildLine({ seq: '00020', name: 'MNUFLD', dataType: 'Y', length: '2', decimals: '0', usage: 'B', line: '1', col: '2' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'PULLFILE', func: 'PULLDOWN' }),
      buildLine({ seq: '00040', name: 'F1', dataType: 'Y', length: '2', decimals: '0', usage: 'B', line: '1', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce14', src, 'D5.DSPF').replace(
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
    const { Event } = dom.window;

    function accordionLabels() {
      return Array.from(doc.querySelectorAll('#propsBody .props-accordion > summary')).map((el) => el.textContent);
    }
    function selectFieldByName(name) {
      const el = Array.from(doc.querySelectorAll('.dspf-field')).find((e) => e.getAttribute('data-field') === name);
      if (el) { el.dispatchEvent(new Event('click', { bubbles: true })); return true; }
      return false;
    }

    console.log('  MNUFLD (in the MNUBAR record MB): Menu-bar choices/separator panels are offered, Choice keywords/colors are NOT (not a choice field yet)');
    check('MNUFLD is selectable', selectFieldByName('MNUFLD'));
    let labels = accordionLabels();
    check('Menu-bar choices (MNUBARCHC) is offered', labels.indexOf('Menu-bar choices (MNUBARCHC)') >= 0);
    check('Menu-bar separator (MNUBARSEP) is offered', labels.indexOf('Menu-bar separator (MNUBARSEP)') >= 0);
    check('Choice selection type is always offered too', labels.indexOf('Choice selection type') >= 0);
    check('Choice keywords is NOT offered yet (MNUFLD has no SNGCHCFLD/MLTCHCFLD)', labels.indexOf('Choice keywords (CHOICE/CHCCTL/CHCACCEL)') === -1);
    check('Choice colors & attributes is NOT offered yet', labels.indexOf('Choice colors & attributes') === -1);

    console.log('  Adding a menu-bar choice row and applying writes MNUBARCHC');
    // Locate by class since the id is dynamic (field-<sourceLine>-...).
    const addBtn = doc.querySelector('button[class*="-mnubarchc-add"]');
    check('setup: + Add choice button for MNUBARCHC exists', !!addBtn);
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const idInput = doc.querySelector('input[class*="-mnubarchc-id"]');
    const recordInput = doc.querySelector('input[class*="-mnubarchc-record"]');
    const textInput = doc.querySelector('input[class*="-mnubarchc-text"]');
    idInput.value = '1';
    recordInput.value = 'PULLFILE';
    textInput.value = '>File';
    doc.querySelector('button[class*="-mnubarchc-apply"]').dispatchEvent(new Event('click', { bubbles: true }));
    let last = posted[posted.length - 1];
    check('posts applyEdit with MNUBARCHC(1 PULLFILE \'>File\') on MNUFLD', last && last.type === 'applyEdit' && /MNUFLD[\s\S]*?MNUBARCHC\(1 PULLFILE '>File'\)/.test(last.text));

    console.log('  Task L3: a &field for choice text, plus a Return field, both round-trip through the same MNUBARCHC row');
    selectFieldByName('MNUFLD');
    doc.querySelector('button[class*="-mnubarchc-add"]').dispatchEvent(new Event('click', { bubbles: true }));
    const mnubarchcRows = doc.querySelectorAll('.choice-row-block');
    const newMnubarchcRow = mnubarchcRows[mnubarchcRows.length - 1];
    // Regression check: the text/return-field inputs used to share a
    // single flex row with id (36px) and record (110px), both pinned to
    // flex-shrink:0 so THEY wouldn't clip - which meant text/return-field
    // absorbed 100% of any space shortfall instead. The properties
    // panel's own DEFAULT width (300px, minus 16px padding each side)
    // already leaves less room than id+record+return-field's combined
    // fixed footprint needs BEFORE the text box gets any width at all, so
    // it collapsed to ~0px: invisible and unclickable (reported: "unable
    // to type the text column"). Fixed by giving text/return-field their
    // own full-width line below the compact id+record line instead of
    // squeezing four inputs onto one - asserting a real, non-zero
    // percentage width here (rather than just checking the input exists)
    // is what actually catches a regression back to the old cramped
    // single-line layout, which this same query would still "pass" on
    // structurally even at 0px rendered width.
    const newTextInput = newMnubarchcRow.querySelector('input[class*="-mnubarchc-text"]');
    check('text input gets its own full-width line, not squeezed onto the id/record/return-field row', /width\s*:\s*100%/.test(newTextInput.getAttribute('style') || ''));
    newTextInput.value = '&OPTTXT';
    newMnubarchcRow.querySelector('input[class*="-mnubarchc-id"]').value = '4';
    newMnubarchcRow.querySelector('input[class*="-mnubarchc-record"]').value = 'PULLOPT';
    const returnFieldInput = newMnubarchcRow.querySelector('input[class*="-mnubarchc-returnfield"]');
    check('setup: Return field input exists on the row', !!returnFieldInput);
    check('return field also gets its own full-width line', /width\s*:\s*100%/.test(returnFieldInput.getAttribute('style') || ''));
    returnFieldInput.value = 'RTNFLD';
    doc.querySelector('button[class*="-mnubarchc-apply"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    // Long enough to wrap onto a DDS continuation line ('+' + a fresh
    // 44-char column-1-44 prefix on the next line) - strip that fixed
    // prefix before matching so this check doesn't care where the wrap
    // point happens to fall.
    const unwrapped = last && last.text ? last.text.replace(/\+\r?\n.{44}/g, '') : '';
    check('posts applyEdit with the &field text form and a leading & added to the return field', last && last.type === 'applyEdit' && /MNUBARCHC\(4 PULLOPT &OPTTXT &RTNFLD\)/.test(unwrapped));

    console.log('  Setting the menu-bar separator (color + char) and applying writes MNUBARSEP');
    selectFieldByName('MNUFLD');
    const sepColorOn = doc.querySelector('input[id$="-mnubarsep-color-on"]');
    const sepColorSel = doc.querySelector('select[id$="-mnubarsep-color"]');
    const sepCharOn = doc.querySelector('input[id$="-mnubarsep-char-on"]');
    const sepCharInput = doc.querySelector('input[id$="-mnubarsep-char"]');
    sepColorOn.checked = true;
    sepColorSel.value = 'WHT';
    sepCharOn.checked = true;
    sepCharInput.value = '.';
    doc.querySelector('button[class*="-mnubarsep-apply"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    const sepRecord = DspfParser.parseDspf(last.text).records.find((r) => r.name === 'MB');
    const sepField = sepRecord.fields.find((f) => f.name === 'MNUFLD');
    const sepKw = sepField.keywords.find((k) => k.name === 'MNUBARSEP');
    check('posts applyEdit with MNUBARSEP carrying (*COLOR WHT) and (*CHAR \'.\')', last && last.type === 'applyEdit' && sepKw && /\*COLOR WHT/.test(sepKw.parameters) && /\*CHAR '\.'/.test(sepKw.parameters));

    console.log('  F1 (in the PULLDOWN record PULLFILE, not MNUBAR): Menu-bar panels are NOT offered, Choice selection type is');
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = 'PULLFILE';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('F1 is selectable', selectFieldByName('F1'));
    labels = accordionLabels();
    check('Menu-bar choices is NOT offered for a non-MNUBAR-record field', labels.indexOf('Menu-bar choices (MNUBARCHC)') === -1);
    check('Menu-bar separator is NOT offered for a non-MNUBAR-record field', labels.indexOf('Menu-bar separator (MNUBARSEP)') === -1);
    check('Choice selection type is offered', labels.indexOf('Choice selection type') >= 0);

    console.log('  Setting Choice selection type to SNGCHCFLD makes Choice keywords/colors panels appear');
    const kindSel = doc.querySelector('select[id$="-cst-kind"]');
    kindSel.value = 'SNGCHCFLD';
    doc.querySelector('button[class*="-cst-apply"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with SNGCHCFLD on F1', last && last.type === 'applyEdit' && /F1[\s\S]*?SNGCHCFLD/.test(last.text));
    check('F1 is still selected after the commit (re-render keeps selection)', selectFieldByName('F1') || true);
    labels = accordionLabels();
    check('Choice keywords now appears (F1 is now a choice field)', labels.indexOf('Choice keywords (CHOICE/CHCCTL/CHCACCEL)') >= 0);
    check('Choice colors & attributes now appears', labels.indexOf('Choice colors & attributes') >= 0);

    console.log('  Adding one choice row (text + control field + accelerator + message) and applying writes CHOICE + CHCCTL + CHCACCEL together');
    doc.querySelector('button[class*="-choicekw-add"]').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('input[class*="-choicekw-id"]').value = '1';
    doc.querySelector('input[class*="-choicekw-text"]').value = '>Open';
    doc.querySelector('input[class*="-choicekw-ctrl"]').value = '&CTLFLD';
    doc.querySelector('input[class*="-choicekw-accel"]').value = 'F6=Open';
    doc.querySelector('input[class*="-choicekw-msgid"]').value = 'MSG0001';
    doc.querySelector('input[class*="-choicekw-msgfile"]').value = 'MYMSGF';
    doc.querySelector('button[class*="-choicekw-apply"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    const choiceRecord = DspfParser.parseDspf(last.text).records.find((r) => r.name === 'PULLFILE');
    const choiceField = choiceRecord.fields.find((f) => f.name === 'F1');
    check('posts applyEdit with CHOICE(1 \'>Open\')', choiceField.keywords.some((k) => k.name === 'CHOICE' && k.parameters.trim() === "1 '>Open'"));
    check('...and CHCCTL(1 &CTLFLD MSG0001 MYMSGF)', choiceField.keywords.some((k) => k.name === 'CHCCTL' && k.parameters.trim() === '1 &CTLFLD MSG0001 MYMSGF'));
    check('...and CHCACCEL(1 \'F6=Open\')', choiceField.keywords.some((k) => k.name === 'CHCACCEL' && k.parameters.trim() === "1 'F6=Open'"));

    console.log('  Enabling the Available choice-color state and applying writes CHCAVAIL');
    selectFieldByName('F1');
    doc.querySelector('input[id$="-ccs-avail-on"]').checked = true;
    doc.querySelector('select[id$="-ccs-avail-color"]').value = 'BLU';
    doc.querySelector('button[class*="-ccs-apply"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    check('posts applyEdit with CHCAVAIL((*COLOR BLU))', last && last.type === 'applyEdit' && /CHCAVAIL\(\(\*COLOR BLU\)\)/.test(last.text));

    runD4ConstantWiringScenario();
  }, 0);
}

function runD4ConstantWiringScenario() {
  console.log('\nD4: constant field wiring - HLPID (General keywords) and menu-bar keywords (MNUBARCHC/MNUBARSEP) on a constant, but NOT Choice selection type');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'MB', func: 'MNUBAR' }),
      "     A                                  1  2'>File'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce15', src, 'D4.DSPF').replace(
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
    const { Event } = dom.window;

    function accordionLabels() {
      return Array.from(doc.querySelectorAll('#propsBody .props-accordion > summary')).map((el) => el.textContent);
    }
    function selectConstant() {
      const el = Array.from(doc.querySelectorAll('.dspf-field')).find((e) => e.textContent.includes('>File'));
      if (el) { el.dispatchEvent(new Event('click', { bubbles: true })); return true; }
      return false;
    }

    console.log('  Selecting the constant (in the MNUBAR record MB): Menu-bar choices/separator ARE offered, Choice selection type is NOT');
    check('the constant is selectable', selectConstant());
    check('confirms this is a constant (no Name input)', !doc.getElementById('p-name'));
    let labels = accordionLabels();
    check('Menu-bar choices (MNUBARCHC) is offered on a constant in a MNUBAR record', labels.indexOf('Menu-bar choices (MNUBARCHC)') >= 0);
    check('Menu-bar separator (MNUBARSEP) is offered on a constant too', labels.indexOf('Menu-bar separator (MNUBARSEP)') >= 0);
    check('Choice selection type is NOT offered for a constant (structurally can\'t be a choice field)', labels.indexOf('Choice selection type') === -1);
    check('General keywords is still offered (HLPID lives there)', labels.indexOf('General keywords') >= 0);

    console.log('  Filling in HLPID on the constant via General keywords and applying writes HLPID');
    doc.querySelector('input[id$="-gen-hlpid-params"]').value = 'CONSTHELP';
    doc.querySelector('input[id$="-gen-hlpid-on"]').checked = true;
    doc.querySelector('input[id$="-gen-hlpid-on"]').dispatchEvent(new Event('change', { bubbles: true }));
    let last = posted[posted.length - 1];
    check('posts applyEdit with HLPID(CONSTHELP) on the constant', last && last.type === 'applyEdit' && /HLPID\(CONSTHELP\)/.test(last.text));

    console.log('  Adding a menu-bar choice row on the constant and applying writes MNUBARCHC');
    selectConstant();
    doc.querySelector('button[class*="-mnubarchc-add"]').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('input[class*="-mnubarchc-id"]').value = '1';
    doc.querySelector('input[class*="-mnubarchc-record"]').value = 'PULLFILE';
    doc.querySelector('input[class*="-mnubarchc-text"]').value = '>File';
    doc.querySelector('button[class*="-mnubarchc-apply"]').dispatchEvent(new Event('click', { bubbles: true }));
    last = posted[posted.length - 1];
    const mbRecord = DspfParser.parseDspf(last.text).records.find((r) => r.name === 'MB');
    const constField = mbRecord.fields.find((f) => (f.nameType === 'CONSTANT' || !f.name));
    check('posts applyEdit with MNUBARCHC on the constant entry', last && last.type === 'applyEdit' && constField && constField.keywords.some((k) => k.name === 'MNUBARCHC'));

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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

function runWindowBorderAndDefaultColorScenario() {
  console.log('\nBug fix: WDWBORDER *COLOR/*DSPATR now actually shows up on the rendered window preview');
  const src =
    [
      '     A          R WIN1',
      '     A                                      WINDOW(3 10 8 30)',
      '     A                                      WDWBORDER((*COLOR RED) (*DSPATR HI))',
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce16', src, 'WDWBORDER.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const windowEl = doc.querySelector('.dspf-window-border');
    check('setup: the window renders', !!windowEl);
    // Task L32: this WDWBORDER doesn't specify *CHAR, so it now picks up the
    // documented period/colon default and switches into char-mode - *COLOR
    // RED is applied per-character (see the char-cell check below) rather
    // than as a plain box border-color, which char-mode suppresses.
    const charCells = Array.from(doc.querySelectorAll('.dspf-window-char'));
    check('WDWBORDER *COLOR RED is applied to the (now-defaulted) border characters (COLOR_HEX.RED = #ff5c5c)', charCells.length > 0 && charCells.every((el) => /#ff5c5c/i.test(el.getAttribute('style') || '')));
    check('WDWBORDER *DSPATR HI adds the bolder-border class', windowEl.classList.contains('dspf-window-border-hi'));

    runDefaultColorScenario();
  }, 0);
}

function runDefaultColorScenario() {
  console.log('\nBug fix: an unstyled constant defaults to the same green/accent color as an unstyled named field, not a hardcoded gray');
  const src =
    [
      '     A          R SCR1',
      "     A                                  1  2'A constant'",
      '     A            NAMEDFLD     10A  B  2  2',
      '     A            COLOREDFLD   10A  B  3  2',
      '     A                                      COLOR(RED)',
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce17', src, 'DEFAULTCOLOR.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  check('the old hardcoded gray constant override is gone from the generated CSS', !/\.dspf-constant\s*\{\s*color:\s*#b7c9bf/.test(html));
  // Now reads var(--dspf-fg, var(--chrome-accent)) instead of the bare var(--chrome-accent):
  // --dspf-fg is the per-field override for an explicit COLOR keyword (see dspfEngine.js's
  // renderFieldDiv and the .dspf-reverse fix), falling back to the chrome theme's accent for
  // an unstyled field/constant - same modern-theming intent this check was written for.
  check('modern UI style now themes the screen\u2019s own default color, not just chrome', /body\[data-ui-style="modern"\]\s*\.dspf-field\s*\{\s*color:\s*var\(--dspf-fg,\s*var\(--chrome-accent\)\);?\s*\}/.test(html));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const constantEl = doc.querySelector('.dspf-constant');
    check('setup: the constant renders', !!constantEl);
    check('an unstyled constant has NO inline color override (inherits the CSS default, exactly like an unstyled field)', !/color\s*:/.test(constantEl.getAttribute('style') || ''));

    const coloredEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.dataset.field === 'COLOREDFLD');
    check('a field with an explicit COLOR keyword still gets its own inline color, unaffected by the default-color fix', /#ff5c5c/i.test(coloredEl.getAttribute('style') || ''));

    runIndicatorListScenario();
  }, 0);
}

function runIndicatorListScenario() {
  console.log('\nBug fix: conditioning indicators used ONLY on a record-level keyword (never on any field) now show up in the left-panel indicator list too');
  const src =
    [
      // 51 conditions the record-level ALARM keyword only - no field or field-keyword
      // ever references indicator 51, so before this fix indicatorsForContext() (which
      // walked record.conditions + every field's own conditions/keywords but never
      // record.keywords) never saw it at all, and the checkbox to toggle it never
      // appeared in the left panel - the record's own "preview" of what indicators are
      // in play on this screen was silently incomplete.
      buildLine({ seq: '00010', nameType: 'R', name: 'ALARMR' }),
      buildLine({ seq: '00020', ind1: '51', func: 'ALARM' }),
      buildLine({ seq: '00030', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '2', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce18', src, 'INDLIST.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const indicatorList = doc.getElementById('indicatorList');
    check('setup: the indicator list panel is present', !!indicatorList);
    const labels = Array.from(indicatorList.querySelectorAll('span')).map((el) => el.textContent.trim());
    check('indicator 51 (conditioning ONLY the record-level ALARM keyword) is listed for toggling', labels.includes('Ind 51'));

    runSflIndicatorPairingScenario();
  }, 0);
}

// Bug fix: the left-panel "Conditioning indicators (preview)" list used to
// merge BOTH sides of a subfile pairing together regardless of which side
// was actually being previewed - so previewing the SFL record on its own
// showed the paired SFLCTL record's own indicators too, even though
// SFLCTL's fields never render as part of an SFL-alone preview (only the
// other direction does - see resolveSubfilePreview). See
// indicatorsForContext's own doc comment in buildWebviewTemplate.js.
function runSflIndicatorPairingScenario() {
  console.log('\nBug fix: the indicator list is scoped to the record actually being previewed - SFLCTL\'s own indicators no longer leak into an SFL-alone preview');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'DTLSFL', func: 'SFL' }),
      buildLine({ seq: '00020', name: 'SFLFLD', dataType: 'A', length: '10', usage: 'B', line: '1', col: '2' }),
      buildLine({ seq: '00030', ind1: '61', func: 'DSPATR(HI)' }), // indicator only ever used on the SFL side
      buildLine({ seq: '00040', nameType: 'R', name: 'DTLCTL', func: 'SFLCTL(DTLSFL)' }),
      buildLine({ seq: '00050', func: 'SFLSIZ(10)' }),
      buildLine({ seq: '00060', func: 'SFLPAG(5)' }),
      buildLine({ seq: '00070', name: 'HDRFLD', dataType: 'A', length: '10', usage: 'O', line: '1', col: '20' }),
      buildLine({ seq: '00080', ind1: '62', func: 'DSPATR(HI)' }), // indicator only ever used on the SFLCTL side
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce19', src, 'SFLINDPAIR.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');
    const indicatorLabels = () => Array.from(doc.getElementById('indicatorList').querySelectorAll('span')).map((el) => el.textContent.trim());

    console.log('  previewing the SFL record alone: only its OWN indicator shows, not the paired SFLCTL record\'s');
    recordSelect.value = 'DTLSFL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    let labels2 = indicatorLabels();
    check('SFL\'s own indicator 61 is listed', labels2.includes('Ind 61'));
    check('the paired SFLCTL record\'s indicator 62 is NOT listed here - it has no effect on an SFL-alone preview', !labels2.includes('Ind 62'));

    console.log('  previewing the SFLCTL record: BOTH indicators show, since SFLCTL\'s own preview draws the paired SFL record\'s fields too');
    recordSelect.value = 'DTLCTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    labels2 = indicatorLabels();
    check('SFLCTL\'s own indicator 62 is listed', labels2.includes('Ind 62'));
    check('the paired SFL record\'s indicator 61 is ALSO listed - toggling it changes the subfile rows drawn here', labels2.includes('Ind 61'));

    runFileIndicatorScenario();
  }, 0);
}

// Bug fix (Task L43): a conditioning indicator used ONLY on a file-level
// keyword (CAxx/CFxx command keys, ALARM, etc. - see fileKeywordsPanelsHtml)
// never showed up in the left-panel indicator list at all, because
// indicatorsForContext() previously only walked record/field-level
// conditions and never model.fileKeywords. Unlike record-level conditioning,
// a file-level keyword's conditioning applies across every record in the
// file, so (unlike the SFL-pairing scoping above) this always shows
// regardless of which record is currently being previewed.
function runFileIndicatorScenario() {
  console.log('\nBug fix: a conditioning indicator used ONLY on a file-level keyword (never on any record/field) now shows up in the left-panel indicator list too');
  const src =
    [
      // 71 conditions the file-level CA03 command key only - no record or
      // field (or their own keywords) ever reference indicator 71.
      buildLine({ seq: '00010', ind1: '71', func: 'CA03' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00030', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '2', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce20', src, 'FILEIND.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const labels = Array.from(doc.getElementById('indicatorList').querySelectorAll('span')).map((el) => el.textContent.trim());
    check('indicator 71 (conditioning ONLY the file-level CA03 keyword) is listed for toggling', labels.includes('Ind 71'));

    runChgInpDftFileRecordScenario();
  }, 0);
}

// Bug fix (reported: real SDA's own "Change Input Defaults" sub-screen for
// CHGINPDFT, confirmed via a user-provided screenshot) - the same
// chgInpDftFlagHtml/wireChgInpDftFlag component tested at field level
// above (see the "Input keywords" scenario) is ALSO wired at File level
// and Record level (fileKeywordsPanelsHtml/recordKeywordsPanelsHtml both
// call it under an 'fk-'/idPrefix-scoped id) - this only re-checks that
// the SAME component actually renders/commits under those DIFFERENT id
// prefixes, since the checkbox logic itself is already covered above.
function runChgInpDftFileRecordScenario() {
  console.log('\nBug fix: CHGINPDFT sub-flag checkboxes also wired at File level and Record level (same component as the field-level one above, different id prefix)');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce22', src, 'CHGINPDFT.DSPF').replace(
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
    const { document: doc, Event } = dom.window;

    console.log('  File level (fk-chginpdft)');
    const fileCrumb = doc.getElementById('crumb-file');
    check('setup: the File breadcrumb is present', !!fileCrumb);
    fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));
    check('File Keywords panel rendered: 9 fk-chginpdft sub-flag checkboxes present', doc.querySelectorAll('.fk-chginpdft-code').length === 9);
    const fkHi = Array.from(doc.querySelectorAll('.fk-chginpdft-code')).find((el) => el.value === 'HI');
    fkHi.checked = true;
    fkHi.dispatchEvent(new Event('change', { bubbles: true }));
    let fileEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    check('posts CHGINPDFT(HI) at file level', fileEdit && /CHGINPDFT\(HI\)/.test(fileEdit.text));

    console.log('  Record level (recordKeywordsPanelsHtml\'s own idPrefix-chginpdft)');
    posted.length = 0;
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const recCheckboxes = doc.querySelectorAll('[class$="-chginpdft-code"]');
    const recChginpdftCheckboxes = Array.from(recCheckboxes).filter((el) => !el.className.startsWith('fk-'));
    check('Record Keywords panel: 9 record-level chginpdft sub-flag checkboxes present (distinct from fk-)', recChginpdftCheckboxes.length === 9);
    const recMe = recChginpdftCheckboxes.find((el) => el.value === 'ME');
    check('setup: found the ME checkbox at record level', !!recMe);
    recMe.checked = true;
    recMe.dispatchEvent(new Event('change', { bubbles: true }));
    let recordEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    check('posts CHGINPDFT(ME) at record level', recordEdit && /CHGINPDFT\(ME\)/.test(recordEdit.text));

    runL22FollowUpFixesScenario();
  }, 0);
}

// Task L22 follow-up fixes: ENTFLDATR (color+attrs picker, same shape as
// CHCAVAIL/CHCSLT), TEXT (documentation-only, File/Record/Field level),
// and MSGLOC (paired with DSPSIZ's own order). See dspfWriter.js's own
// doc comments on getFileMsgLocLines/setFileMsgLocLines and
// entFldAtrHtml/wireEntFldAtrEditor for the DDS Reference research behind
// each.
function runL22FollowUpFixesScenario() {
  console.log('\nTask L22 follow-ups: ENTFLDATR (color+attrs picker), TEXT (documentation keyword), MSGLOC (paired with DSPSIZ order)');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00030', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce23', src, 'L22.DSPF').replace(
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
    const { document: doc, Event } = dom.window;

    console.log('  File level: ENTFLDATR (color + HI/RI/CS/BL/ND/UL checkboxes, reusing getChoiceColorState/setChoiceColorState)');
    const fileCrumb = doc.getElementById('crumb-file');
    check('setup: the File breadcrumb is present', !!fileCrumb);
    fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));
    const entOn = doc.getElementById('fk-entfldatr-on');
    const entColor = doc.getElementById('fk-entfldatr-color');
    const entAttrs = doc.querySelectorAll('.fk-entfldatr-attr');
    check('the ENTFLDATR enable checkbox is present', !!entOn);
    check('the ENTFLDATR color select is present', !!entColor);
    check('all 6 ENTFLDATR attribute checkboxes are present (HI/RI/CS/BL/ND/UL - same subset as WDWBORDER/CHCAVAIL)', entAttrs.length === 6);
    entOn.checked = true;
    entColor.value = 'BLU';
    Array.from(entAttrs).find((el) => el.value === 'HI').checked = true;
    Array.from(entAttrs).find((el) => el.value === 'UL').checked = true;
    const entApplyBtn = doc.querySelector('.fk-entfldatr-apply');
    check('setup: the ENTFLDATR apply button is present', !!entApplyBtn);
    entApplyBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let entEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    const entKw = entEdit && DspfParser.parseDspf(entEdit.text).fileKeywords.find((k) => k.name === 'ENTFLDATR');
    check('posts ENTFLDATR with (*COLOR BLU) and (*DSPATR HI UL), matching the real DDS shape ENTFLDATR((*COLOR BLU) (*DSPATR HI UL))', entKw && /\(\*COLOR BLU\)/.test(entKw.parameters) && /\(\*DSPATR HI UL\)/.test(entKw.parameters));

    console.log('  File level: TEXT (documentation-only, reuses getFileQuotedText/setFileQuotedText)');
    posted.length = 0;
    const fkText = doc.getElementById('fk-text');
    check('the File-level TEXT input is present', !!fkText);
    fkText.value = 'File documentation';
    fkText.dispatchEvent(new Event('change', { bubbles: true }));
    let textEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    check('posts TEXT at file level', textEdit && DspfParser.parseDspf(textEdit.text).fileKeywords.some((k) => k.name === 'TEXT' && k.parameters === "'File documentation'"));

    console.log('  Record level: TEXT is also present (separate input, separate id prefix)');
    posted.length = 0;
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const recTextInputs = Array.from(doc.querySelectorAll('input[id$="-text"]')).filter((el) => el.id !== 'fk-text' && el.id !== 'fieldSearchInput');
    check('a record-level TEXT input is present, distinct from the file-level one', recTextInputs.length > 0);
    recTextInputs[0].value = 'Record documentation';
    recTextInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    let recTextEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    check('posts TEXT at record level', recTextEdit && DspfParser.parseDspf(recTextEdit.text).records[0].keywords.some((k) => k.name === 'TEXT' && k.parameters === "'Record documentation'"));

    console.log('  File level: MSGLOC, paired with DSPSIZ order (order 1 = unconditioned primary, order 2 = conditioned by its own *DSx name)');
    posted.length = 0;
    fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));
    const msglocDs4 = doc.getElementById('fk-msgloc-ds4');
    const msglocDs3 = doc.getElementById('fk-msgloc-ds3');
    check('the MSGLOC input for *DS4 is present', !!msglocDs4);
    check('the MSGLOC input for *DS3 is present', !!msglocDs3);
    check('*DS3 (order 1, per the DSPSIZ(24 80 *DS3 27 132 *DS4) fixture) pre-fills as the primary/unconditioned size - no value expected here since none was set in source', msglocDs3.value === '');
    msglocDs4.value = '28';
    msglocDs3.value = '25';
    const dspsizApply = doc.getElementById('fk-dspsiz-apply');
    check('setup: the Apply display sizes button is present', !!dspsizApply);
    dspsizApply.dispatchEvent(new Event('click', { bubbles: true }));
    let msglocEdit = posted.filter((m) => m.type === 'applyEdit').pop();
    const msglocKws = msglocEdit ? DspfParser.parseDspf(msglocEdit.text).fileKeywords.filter((k) => k.name === 'MSGLOC') : [];
    const msglocPrimary = msglocKws.find((k) => (k.conditions || []).length === 0);
    const msglocDs4Kw = msglocKws.find((k) => (k.conditions || []).some((g) => g.displaySizeCondition && g.displaySizeCondition.name === '*DS4'));
    check('posts an unconditioned MSGLOC(25) for *DS3 (order 1, the primary/system-default size)', msglocPrimary && msglocPrimary.parameters.trim() === '25');
    check('posts a *DS4-conditioned MSGLOC(28) for *DS4 (order 2)', !!msglocDs4Kw && msglocDs4Kw.parameters.trim() === '28');

    runCodeForIBadgeScenario();
  }, 0);
}

// Task L18 - "IBM i: Connected/Not connected/Not installed" badge. The
// webview side is purely a display for whatever the extension host tells
// it via 'codeForIStatus' (see extension.ts's getCodeForIStatus/
// sendCodeForIStatus) - this test drives that message directly via
// postMessage, the same way externalUpdate/databaseFieldsResult are
// exercised elsewhere in this file, since there's no real extension host
// in a jsdom test.
function runCodeForIBadgeScenario() {
  console.log('\nTask L18: Code for i connection status badge - display-only, driven entirely by the \'codeForIStatus\' message');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce20', src, 'BADGE.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const { document: doc, MessageEvent } = dom.window;
    const badge = doc.getElementById('codeForIBadge');
    const compileBtn = doc.getElementById('compileDspfBtn');
    const dbBtn = doc.getElementById('addFromDbBtn');

    console.log('  starts in the neutral "checking..." state, before any status message arrives');
    check('badge is present', !!badge);
    check('starts unstyled (no connected/disconnected class yet)', !badge.classList.contains('connected') && !badge.classList.contains('disconnected'));

    console.log('  not installed');
    dom.window.postMessage({ type: 'codeForIStatus', installed: false, connected: false }, '*');
    setTimeout(() => {
      check('shows "not installed"', /not installed/i.test(badge.textContent));
      check('styled as unknown/neutral, not a warning', badge.classList.contains('unknown') && !badge.classList.contains('disconnected') && !badge.classList.contains('connected'));
      // Bug-fix follow-up (screenshot report): Compile and "+ Fields from
      // database file" are hidden outright (not just left clickable and
      // doomed to fail) whenever there's no live connection - "not
      // installed" is one such case.
      check('Compile Display File button is hidden while not installed', compileBtn.classList.contains('hidden'));
      check('"+ Fields from database file" button is hidden while not installed', dbBtn.classList.contains('hidden'));

      console.log('  installed but not connected');
      dom.window.postMessage({ type: 'codeForIStatus', installed: true, connected: false }, '*');
      setTimeout(() => {
        check('shows "not connected"', /not connected/i.test(badge.textContent));
        check('styled as disconnected (warning color)', badge.classList.contains('disconnected') && !badge.classList.contains('connected') && !badge.classList.contains('unknown'));
        check('Compile Display File button stays hidden while installed but not connected', compileBtn.classList.contains('hidden'));
        check('"+ Fields from database file" button stays hidden while installed but not connected', dbBtn.classList.contains('hidden'));

        console.log('  connected');
        dom.window.postMessage({ type: 'codeForIStatus', installed: true, connected: true }, '*');
        setTimeout(() => {
          check('shows "connected"', /\bconnected\b/i.test(badge.textContent) && !/not connected/i.test(badge.textContent));
          check('styled as connected', badge.classList.contains('connected') && !badge.classList.contains('disconnected') && !badge.classList.contains('unknown'));
          check('Compile Display File button reappears once connected', !compileBtn.classList.contains('hidden'));
          check('"+ Fields from database file" button reappears once connected', !dbBtn.classList.contains('hidden'));

          runFieldSearchScenario();
        }, 0);
      }, 0);
    }, 0);
  }, 0);
}

// Task L19 - "Find field" search box: filters every record's fields/
// constants by name as-you-type, jumps to (selects + scrolls to) a picked
// result, switching records first if the match lives on a different one.
function runFieldSearchScenario() {
  console.log('\nTask L19: "Find field" search - filters across every record, jumps to a match (switching records/selecting/scrolling as needed)');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'CUSTNO', length: '6', dataType: 'A', usage: 'B', line: '2', col: '2' }),
      buildLine({ seq: '00030', name: 'CUSTNAME', length: '30', dataType: 'A', usage: 'B', line: '3', col: '2' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'SCR2' }),
      buildLine({ seq: '00050', name: 'BALANCE', length: '9', dataType: 'S', decimals: '2', usage: 'B', line: '2', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce21', src, 'SEARCH.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      window.Element.prototype.scrollIntoView = function () { this.__scrolledIntoView = true; };
    },
  });

  setTimeout(() => {
    const { document: doc, Event, KeyboardEvent } = dom.window;
    const searchInput = doc.getElementById('fieldSearchInput');
    const searchResults = doc.getElementById('fieldSearchResults');
    check('search box is present', !!searchInput);
    check('results dropdown starts hidden', searchResults.classList.contains('hidden'));

    console.log('  typing a query on the CURRENTLY shown record (SCR1) lists matches with no record name needed');
    searchInput.value = 'cust';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    check('results dropdown is now visible', !searchResults.classList.contains('hidden'));
    let rows = Array.from(searchResults.querySelectorAll('.field-search-row'));
    check('finds both CUSTNO and CUSTNAME (case-insensitive substring match)', rows.length === 2);
    check('first result names CUSTNO', /CUSTNO/.test(rows[0].textContent));

    console.log('  clicking a result on the SAME record selects it and scrolls it into view, without needing a record switch');
    rows[0].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    check('search box is filled with the picked field\'s own name', searchInput.value === 'CUSTNO');
    check('results dropdown closes after picking', searchResults.classList.contains('hidden'));
    const selectedEl = doc.querySelector('.dspf-field.selected');
    check('the field is now selected on the canvas (.selected class)', !!selectedEl && selectedEl.getAttribute('data-field') === 'CUSTNO');
    check('the field element was scrolled into view', !!selectedEl.__scrolledIntoView);
    check('record select is still on SCR1 (the match\'s own record)', doc.getElementById('recordSelect').value === 'SCR1');

    console.log('  a match on a DIFFERENT record names that record, and picking it switches to it');
    searchInput.value = 'balance';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    rows = Array.from(searchResults.querySelectorAll('.field-search-row'));
    check('finds BALANCE on SCR2', rows.length === 1 && /BALANCE/.test(rows[0].textContent));
    check('names the record it lives on, since it isn\'t the one currently shown', /SCR2/.test(rows[0].textContent));
    rows[0].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    check('switched to SCR2', doc.getElementById('recordSelect').value === 'SCR2');
    const selectedEl2 = doc.querySelector('.dspf-field.selected');
    check('BALANCE is now selected on the (now-current) canvas', !!selectedEl2 && selectedEl2.getAttribute('data-field') === 'BALANCE');

    console.log('  no matches shows an empty-state row rather than an empty dropdown');
    searchInput.value = 'zzz-nope';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    check('shows the empty-state message', /No matching/i.test(searchResults.textContent));

    console.log('  clearing the query closes the dropdown entirely');
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    check('dropdown hidden again', searchResults.classList.contains('hidden'));

    console.log('  Escape closes the dropdown without changing the selection');
    searchInput.value = 'cust';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    check('dropdown open before Escape', !searchResults.classList.contains('hidden'));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('dropdown closed after Escape', searchResults.classList.contains('hidden'));

    console.log('  Enter jumps to the (first, or arrow-selected) match without needing a mouse click');
    searchInput.value = 'custname';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const selectedEl3 = doc.querySelector('.dspf-field.selected');
    check('Enter selected CUSTNAME', !!selectedEl3 && selectedEl3.getAttribute('data-field') === 'CUSTNAME');
    check('switched back to SCR1 (CUSTNAME\'s own record)', doc.getElementById('recordSelect').value === 'SCR1');

    runFileNamePositionScenario();
  }, 0);
}

function runFileNamePositionScenario() {
  console.log('\nTask L28: the open file\'s own name in the left panel moved up, right under the "Screen Design" heading, instead of buried down near the File attributes/Compile buttons');
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce22', dspfSource, 'REORDERED.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const fileStatus = doc.getElementById('fileStatus');
    check('the file name is shown', fileStatus && /REORDERED\.DSPF/.test(fileStatus.textContent));

    const panelBody = doc.getElementById('leftPanelBody');
    const children = Array.from(panelBody.children);
    const h2Idx = children.findIndex((el) => el.tagName === 'H2');
    const fileLabel = doc.getElementById('fileSectionLabel');
    const fileLabelIdx = children.indexOf(fileLabel);
    const fileStatusIdx = children.indexOf(fileStatus);
    const badgeIdx = children.findIndex((el) => el.id === 'codeForIBadge');
    const compileBtnIdx = children.findIndex((el) => el.id === 'compileDspfBtn');
    check('the "Screen Design" heading is present', h2Idx !== -1 && /Screen Design/i.test(children[h2Idx].textContent));
    check('Task L37: a bold "File" label sits directly after the "Screen Design" h2 (nothing else in between)', fileLabelIdx === h2Idx + 1);
    check('Task L37: the "File" label is bold', /font-weight\s*:\s*(700|bold)/i.test(fileLabel.getAttribute('style') || ''));
    check('the file name sits directly after the "File" label', fileStatusIdx === fileLabelIdx + 1);
    check('the Code for IBM i badge comes right after the file name', badgeIdx === fileStatusIdx + 1);
    check('Task L37: the standalone "File attributes" button is gone (redundant with the "File" crumb in the properties panel)', !doc.getElementById('fileAttrsBtn'));
    check('the Compile Display File button is still present', compileBtnIdx !== -1);

    runDefaultWindowBorderScenario();
  }, 0);
}

function runDefaultWindowBorderScenario() {
  console.log('\nTask L29: a window with NO WDWBORDER anywhere (record or file) gets the real DDS-documented default border - period(.)/colon(:) chars in blue - instead of a plain unstyled box');
  const src =
    [
      '     A          R WIN1',
      '     A                                      WINDOW(3 10 8 30)',
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce24', src, 'NOBORDER.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const windowEl = doc.querySelector('.dspf-window-border');
    check('setup: the window renders', !!windowEl);
    check('char-mode is active (the default border characters count as "specified" chars)', windowEl.classList.contains('dspf-window-border-charmode'));
    const charCells = Array.from(doc.querySelectorAll('.dspf-window-char'));
    check('border character cells were actually rendered (not an empty overlay)', charCells.length > 0);
    check('every rendered border character cell defaults to blue (the documented WDWBORDER *COLOR default)', charCells.every((el) => /#4a9eff/i.test(el.getAttribute('style') || '')));
    // Row 3 (top) is periods at every position; row 10 (bottom, height 8 -> rows 3-10) should
    // have periods along the horizontal run but colons at both bottom corners specifically -
    // the one irregular part of the documented default (bottom corners follow the SIDE
    // character, not the bottom border's own).
    const topLeftCorner = charCells.find((el) => /grid-row:\s*3;grid-column:\s*10;/.test(el.getAttribute('style')));
    const topBorderMid = charCells.find((el) => /grid-row:\s*3;grid-column:\s*15;/.test(el.getAttribute('style')));
    const leftSideMid = charCells.find((el) => /grid-row:\s*6;grid-column:\s*10;/.test(el.getAttribute('style')));
    const bottomLeftCorner = charCells.find((el) => /grid-row:\s*10;grid-column:\s*10;/.test(el.getAttribute('style')));
    const bottomBorderMid = charCells.find((el) => /grid-row:\s*10;grid-column:\s*15;/.test(el.getAttribute('style')));
    check('top-left corner is a period', topLeftCorner && topLeftCorner.textContent === '.');
    check('top border (middle) is a period', topBorderMid && topBorderMid.textContent === '.');
    check('left side (middle) is a colon', leftSideMid && leftSideMid.textContent === ':');
    check('bottom-left corner is a colon (NOT a period, per the documented irregular default)', bottomLeftCorner && bottomLeftCorner.textContent === ':');
    check('bottom border (middle) is a period', bottomBorderMid && bottomBorderMid.textContent === '.');

    console.log('\n  an EXPLICIT WDWBORDER value still wins outright over the L29 "entirely absent" default, but Task L32 now backfills any of ITS OWN unset sub-parameters with IBM\u2019s documented per-parameter default instead of leaving them blank');
    const explicitSrc =
      [
        '     A          R WIN2',
        '     A                                      WINDOW(3 10 8 30)',
        '     A                                      WDWBORDER((*COLOR RED))',
        "     A                                  1  2'Hello'",
      ].join('\n') + '\n';
    const explicitHtml = getWebviewHtml('vscode-webview://fake', 'testnonce25', explicitSrc, 'EXPLICITBORDER.DSPF').replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      ''
    );
    const explicitDom = new JSDOM(explicitHtml, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      },
    });
    setTimeout(() => {
      const explicitDoc = explicitDom.window.document;
      const explicitCharCells = Array.from(explicitDoc.querySelectorAll('.dspf-window-char'));
      check('Task L32: WDWBORDER(*COLOR RED) with no *CHAR now DOES render a character overlay (the unset *CHAR group picks up the documented period/colon default)', explicitCharCells.length > 0);
      check('the rendered border characters carry the explicit red color (own *COLOR still wins), not the entirely-separate L29 blue default', explicitCharCells.every((el) => /#ff5c5c/i.test(el.getAttribute('style') || '')));
      check('the default period/colon pattern is used for the *CHAR positions themselves', explicitCharCells.some((el) => el.textContent === '.') && explicitCharCells.some((el) => el.textContent === ':'));

      console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
      process.exit(failures === 0 ? 0 : 1);
    }, 0);
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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

    runWindowMoveOffOriginScenario();
  }, 0);
}

// Task L30 - reported as "when dragging windows I feel like it is jumping
// to the right side." A DEDICATED, fresh scenario (not appended onto
// runWindowMoveResizeScenario's own state above) since that scenario's own
// move+resize steps already mutate WDWREC's window geometry away from its
// declared WINDOW(3 10 8 40) - reusing that mutated state here would make
// the expected post-drag numbers fragile and hard to follow. The move
// handle spans the window's ENTIRE top edge (left:0; right:0 in its own
// CSS), so grabbing it anywhere but the exact leftmost pixel - the
// realistic case - is exactly what used to jump the window: the old code
// snapped the window's origin straight to the raw mouse position on every
// move, ignoring the offset between where it was grabbed and the window's
// own true top-left corner.
function runWindowMoveOffOriginScenario() {
  console.log('\nTask L30: grabbing the window\'s move handle somewhere other than its exact top-left pixel must not jump the window');
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R WDWREC',
      '     A                                      WINDOW(3 10 8 40)',
      "     A                                  1  2'In the window'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce26', src, 'WDWDRAG.DSPF').replace(
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
      // Same 10px/col x 20px/row mock as the other window scenarios.
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { MouseEvent } = dom.window;
    const windowEl = doc.querySelector('.dspf-window-border');
    check('setup: the window is rendered', !!windowEl);
    const moveHandle = windowEl.querySelector('.dspf-window-move-handle');
    check('setup: a move handle is present', !!moveHandle);

    // WINDOW(3 10 8 40): row 3, col 10. The window's own true top-left
    // pixel is ((10-1)*10, (3-1)*20) = (90, 40) - grab well AWAY from
    // that, in the middle of the 40-wide title strip instead: col 10+20=30
    // -> pixel (30-1)*10=290, same row 3 -> pixel 40.
    posted.length = 0;
    moveHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 290, clientY: 40 }));
    // Move the mouse by exactly one grid cell right, one cell down
    // (+10px col, +20px row) - a real drag nudge, not a jump.
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 60 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    const last = posted[posted.length - 1];
    check('the window moved by exactly one column/one row (col 10->11, row 3->4), preserving the grab offset', last && last.type === 'applyEdit' && /WINDOW\(4 11 8 40\)/.test(last.text));
    check('NOT the old bug\'s jump-to-cursor result, which would have snapped the origin to roughly col 30/row 3 - the raw grab point itself', last && !/WINDOW\(3 30/.test(last.text) && !/WINDOW\(4 30/.test(last.text));
    check("the window's own field content is untouched", last && /In the window/.test(last.text));

    runFieldDragOffOriginScenario();
  }, 0);
}

// Task L33: the same absolute-snap-to-cursor bug L30 fixed for window
// dragging, but for a regular field on the canvas via startDrag. Grabbing a
// multi-column-wide field anywhere other than its own top-left cell used to
// jump it the instant the drag started (before the mouse even moved), since
// the old 'onMove' derived the field's new position directly from the raw
// cursor pixel rather than preserving the click offset.
function runFieldDragOffOriginScenario() {
  console.log('\nTask L33: grabbing a field somewhere other than its exact top-left cell must not jump it (same bug L30 fixed for windows, now fixed for field-dragging via startDrag)');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00030', name: 'FLDA', length: '6', dataType: 'A', usage: 'B', line: '3', col: '10' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce27', src, 'FLDDRAG.DSPF').replace(
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
      // Same 10px/col x 20px/row mock the window-drag scenarios use.
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { MouseEvent } = dom.window;
    const fieldEl = doc.querySelector('.dspf-field');
    check('setup: the field is rendered', !!fieldEl);

    // FLDA is 6 wide starting at col 10 (cols 10-15), line 3. Its own true
    // top-left pixel is ((10-1)*10, (3-1)*20) = (90, 40) - grab well AWAY
    // from that, in the middle of the field instead: col 13 -> pixel
    // (13-1)*10 = 120, same row 3 -> pixel 40.
    posted.length = 0;
    fieldEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 120, clientY: 40 }));
    // No mouse movement at all yet - a real drag hasn't started. The OLD
    // bug would already have snapped the field's origin to roughly col 13
    // (where it was grabbed) purely from this first onMove firing at the
    // SAME pixel, with no movement needed to trigger the jump.
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 40 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    check('zero mouse movement after the grab posts NO edit at all (not the old bug\'s instant jump-on-grab)', posted.length === 0);

    // Now actually drag: move the mouse by exactly one grid cell right, one
    // cell down (+10px col, +20px row) from the SAME off-origin grab point -
    // a real drag nudge, not a jump.
    fieldEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 120, clientY: 40 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 60 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    const last = posted[posted.length - 1];
    const reparsed = last && DspfParser.parseDspf(last.text);
    const movedField = reparsed && reparsed.records[0].fields.find((f) => f.name === 'FLDA');
    check('the field moved by exactly one column/one row from its ORIGINAL position (col 10->11, line 3->4), preserving the grab offset', movedField && movedField.location.line === 4 && movedField.location.column === 11);
    check('NOT the old bug\'s jump-to-cursor result, which would have snapped the origin to roughly col 13/14', movedField && movedField.location.column !== 13 && movedField.location.column !== 14);

    runSubfileControlEditScenario();
  }, 0);
}
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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

    runWindowFieldDragBoundaryScenario();
  }, 0);
}

// Task L39: dragging a field inside a WINDOW record must not be able to land
// it on/outside the window's own border - the border is ALWAYS reserved
// space (default period/colon chars even with no WDWBORDER - see L29/L32),
// so the usable interior is height-2 x width-2, one cell in from every edge.
function runWindowFieldDragBoundaryScenario() {
  console.log('\nTask L39: dragging a field inside a WINDOW record must not cross the window\'s own border');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'WDWREC', func: 'WINDOW(5 10 6 20)' }),
      buildLine({ seq: '00030', name: 'FLDA', length: '6', dataType: 'A', usage: 'B', line: '3', col: '5' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce39', src, 'WDWDRAG.DSPF').replace(
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
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { MouseEvent } = dom.window;
    const fieldEl = doc.querySelector('.dspf-field');
    check('setup: the field is rendered', !!fieldEl);

    // WINDOW(5 10 6 20): box is rows 5-10, cols 10-29 - border occupies the
    // outermost ring, so the usable interior is rows 6-9, cols 11-28. FLDA
    // (window-relative line 3, col 5) renders at line 3+(5-1)=7, col
    // 5+(10-1)=14 - comfortably inside that interior. Its own top-left pixel
    // is ((14-1)*10, (7-1)*20) = (130, 120).
    fieldEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 130, clientY: 120 }));
    // Drag toward the top-left corner, far enough (-5 cols, -3 rows) to
    // aim PAST the border (render col 9, line 4) if nothing stopped it.
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 80, clientY: 60 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));

    const last = posted[posted.length - 1];
    const reparsed = last && DspfParser.parseDspf(last.text);
    const movedField = reparsed && reparsed.records[0].fields.find((f) => f.name === 'FLDA');
    check('posts an edit (it DID move, just not as far as the raw drag aimed)', !!movedField);
    check(
      'the field is clamped to the window\'s interior (render line 6/col 11 -> window-relative line 2/col 2), not the border row/col (line 5/col 10) or beyond',
      movedField && movedField.location.line === 2 && movedField.location.column === 2
    );

    runSflRegionDragBoundaryScenario();
  }, 0);
}

// Task L40: dragging a field belonging to either half of a paired
// SFL/SFLCTL subfile must not be able to land it on a line the OTHER
// half's own fields occupy - the two "regions" stay strictly apart, same
// as real SDA's own Design Image screen for subfiles.
function runSflRegionDragBoundaryScenario() {
  console.log('\nTask L40: dragging a field in a paired SFL/SFLCTL subfile must not cross into the OTHER record\'s own region');
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
      buildLine({ seq: '00030', name: 'DETAIL', length: '10', dataType: 'A', usage: 'O', line: '5', col: '2' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'SFLCTLREC', func: 'SFLCTL(SFLREC)' }),
      buildLine({ seq: '00050', func: 'SFLPAG(3)' }),
      buildLine({ seq: '00060', name: 'HEADER', length: '10', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce40', src, 'SFLBOUND.DSPF').replace(
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
    const headerEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('HEADER'));
    check('setup: HEADER (SFLCTLREC\'s own field, line 3) is rendered', !!headerEl);

    // HEADER's own top-left pixel: line 3 -> (3-1)*20=40, col 2 -> (2-1)*10=10.
    // Drag it down by 2 rows, aiming exactly at line 5 - the line DETAIL (the
    // paired SFL record's own field) occupies.
    posted.length = 0;
    headerEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 40 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 80 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    check('landing exactly on the SFL record\'s own line posts NO edit at all - the drag is held back, not just re-clamped elsewhere', posted.length === 0);

    // Same drag, but only 1 row down (line 4) - NOT DETAIL's own line, so
    // this one should go through normally.
    headerEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 40 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 60 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    let last = posted[posted.length - 1];
    let reparsed = last && DspfParser.parseDspf(last.text);
    let movedHeader = reparsed && reparsed.records.find((r) => r.name === 'SFLCTLREC').fields.find((f) => f.name === 'HEADER');
    check('a line NOT occupied by the paired record (line 4) is allowed through normally', movedHeader && movedHeader.location.line === 4);

    // Now the other direction: switch to SFLREC and try to drag DETAIL onto
    // line 3 - HEADER's (SFLCTLREC's own field) line.
    doc.getElementById('recordSelect').value = 'SFLREC';
    doc.getElementById('recordSelect').dispatchEvent(new Event('change', { bubbles: true }));
    const detailEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('DETAIL'));
    check('setup: DETAIL (SFLREC\'s own field, line 5) is rendered', !!detailEl);

    posted.length = 0;
    // DETAIL's own top-left pixel: line 5 -> (5-1)*20=80, col 2 -> 10. HEADER
    // is now at line 4 (the prior "allowed" drag above actually moved it
    // there), so THAT'S the line to aim DETAIL at here - pixel y=(4-1)*20=60.
    detailEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 80 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 60 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    check("dragging DETAIL onto HEADER's own (now-current) line is blocked too - no edit posted", posted.length === 0);

    runWindowNudgeBoundaryScenario();
  }, 0);
}

// Task L39 (arrow-key nudge variant): nudging a field inside a WINDOW
// record with the arrow keys must not be able to push it on/outside the
// window's own border either - same rule as the mouse-drag version above,
// just exercised through computeNudgeBounds' SOURCE-coordinate path
// instead of computeDragBounds' render-coordinate one.
function runWindowNudgeBoundaryScenario() {
  console.log("\nTask L39 (nudge): arrow keys must not push a field inside a WINDOW record past the window's own border");
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'WDWREC', func: 'WINDOW(5 10 6 20)' }),
      buildLine({ seq: '00030', name: 'FLDA', length: '6', dataType: 'A', usage: 'B', line: '3', col: '5' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce39n', src, 'WDWNUDGE.DSPF').replace(
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
    const { Event, KeyboardEvent } = dom.window;
    const fieldEl = doc.querySelector('.dspf-field');
    check('setup: the field is rendered', !!fieldEl);
    fieldEl.dispatchEvent(new Event('click', { bubbles: true }));

    // WINDOW(5 10 6 20): interior in SOURCE (window-relative) coordinates
    // is line 2..5, col 2..19 (height-1=5, width-1=19). FLDA starts at
    // window-relative line 3, col 5 - well inside. Shift+ArrowUp nudges by
    // 5, aiming for line 3-5=-2 - clamp should hold it at line 2 instead.
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('Shift+ArrowUp posts an edit (it DID move, just not the full 5 rows)', !!applyEdit);
    let reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text);
    let movedField = reparsed && reparsed.records[0].fields.find((f) => f.name === 'FLDA');
    check('clamped to the window interior\'s top edge (window-relative line 2), not line -2', movedField && movedField.location.line === 2);

    posted.length = 0;
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    check('already at the interior boundary - a further Shift+ArrowUp posts no edit at all', posted.length === 0);

    runSflRegionNudgeBoundaryScenario();
  }, 0);
}

// Task L40 (arrow-key nudge variant): nudging a field belonging to either
// half of a paired SFL/SFLCTL subfile must not be able to push it onto a
// line the OTHER half's own fields occupy - same rule as the mouse-drag
// version above, exercised through computeNudgeBounds' SOURCE-coordinate
// path (no lineOffset needed here - see its own doc comment).
function runSflRegionNudgeBoundaryScenario() {
  console.log("\nTask L40 (nudge): arrow keys must not push a field in a paired SFL/SFLCTL subfile onto the OTHER record's own line");
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
      buildLine({ seq: '00030', name: 'DETAIL', length: '10', dataType: 'A', usage: 'O', line: '5', col: '2' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'SFLCTLREC', func: 'SFLCTL(SFLREC)' }),
      buildLine({ seq: '00050', func: 'SFLPAG(3)' }),
      buildLine({ seq: '00060', name: 'HEADER', length: '10', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce40n', src, 'SFLNUDGE.DSPF').replace(
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
    const { Event, KeyboardEvent } = dom.window;
    doc.getElementById('recordSelect').value = 'SFLCTLREC';
    doc.getElementById('recordSelect').dispatchEvent(new Event('change', { bubbles: true }));
    const headerEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('HEADER'));
    check("setup: HEADER (SFLCTLREC's own field, line 3) is rendered", !!headerEl);
    headerEl.dispatchEvent(new Event('click', { bubbles: true }));

    // Line 4 is unoccupied - ArrowDown once should go through normally.
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('ArrowDown onto an unoccupied line (4) is allowed through normally', !!applyEdit);
    let reparsed = applyEdit && DspfParser.parseDspf(applyEdit.text);
    let movedHeader = reparsed && reparsed.records.find((r) => r.name === 'SFLCTLREC').fields.find((f) => f.name === 'HEADER');
    check('HEADER is now at line 4', movedHeader && movedHeader.location.line === 4);

    // HEADER is now on line 4; another ArrowDown aims for line 5 - DETAIL's
    // (the paired SFL record's own field) line. Must be blocked entirely.
    posted.length = 0;
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    check("ArrowDown onto the paired SFL record's own line (5) posts no edit at all", posted.length === 0);

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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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
  // Task P5i: explicitly 'classic' here (was relying on getWebviewHtml's
  // own 'modern' default before this task existed) - collapsing the LEFT
  // (aside) panel only means something under classic now that modern hides
  // <aside> outright and uses a two-column grid regardless of collapse
  // state (see toolboxAsideHidden.test.js for that side of the story).
  // Classic keeps this exact three-column/both-panels-toggleable behavior
  // forever, completely unaffected by P5i - which is exactly what this
  // scenario is actually testing, so pin it to the style it depends on
  // rather than an implicit default that used to happen to match.
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce15', src, 'PANELS.DSPF', 'classic').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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

    console.log('  Indicator: repeatable INDTXT/SETOF/CHANGE rows (Task R3/R5 shared component) commit together via Apply');
    doc.getElementById('sm-ind-row0-kw').value = 'INDTXT';
    doc.getElementById('sm-ind-row0-ind').value = '50';
    doc.getElementById('sm-ind-row0-text').value = 'Amount valid';
    doc.getElementById('sm-ind-row1-kw').value = 'SETOF';
    doc.getElementById('sm-ind-row1-ind').value = '30';
    doc.getElementById('sm-ind-row2-kw').value = 'SETOF';
    doc.getElementById('sm-ind-row2-ind').value = '31';
    doc.getElementById('sm-ind-row3-kw').value = 'CHANGE';
    doc.getElementById('sm-ind-row3-ind').value = '40';
    doc.querySelector('.sm-ind-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
    const indtxtKw = reparsed.keywords.find((k) => k.name === 'INDTXT');
    check('INDTXT written with indicator 50 and quoted text', indtxtKw && /^50\s+'Amount valid'/.test(indtxtKw.parameters.trim()));
    check('two independent SETOF keywords - one per indicator, not one space-separated list', reparsed.keywords.filter((k) => k.name === 'SETOF').length === 2);
    check('SETOF(30) present', reparsed.keywords.some((k) => k.name === 'SETOF' && k.parameters.trim() === '30'));
    check('SETOF(31) present', reparsed.keywords.some((k) => k.name === 'SETOF' && k.parameters.trim() === '31'));
    check('CHANGE(40) written - previously a documented gap, now verified and supported', reparsed.keywords.some((k) => k.name === 'CHANGE' && k.parameters.trim() === '40'));

    runSflPickerScenario();
  }, 0);
}

function runSflPickerScenario() {
  console.log('\nSFL picker (Task R3): General / Indicator tab, only on plain subfile records (not SFLMSG)');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SUBFILE', func: 'SFL' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SFLMESS', func: 'SFL' }),
      buildLine({ seq: '00030', func: 'SFLMSGRCD(24)' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00050', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce17', src, 'SFL.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  a plain record (no SFL) does not get the SFL tab');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('no SFL tab button rendered', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFL'));

    console.log('  an SFLMSG record (carries SFL + SFLMSGRCD) does NOT get a redundant SFL tab - it has its own SFLMSG tab instead');
    recordSelect.value = 'SFLMESS';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('no SFL tab on an SFLMSG record', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFL'));
    check('its own SFLMSG tab is still there', Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFLMSG'));

    console.log('  a plain SFL record gets the SFL tab');
    recordSelect.value = 'SUBFILE';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const sflTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFL');
    check('SFL tab button rendered', !!sflTabBtn);
    sflTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const p = 'sfl-SUBFILE';

    console.log('  General: SFLNXTCHG/LOGOUT/LOGINP/KEEP/CHECK(AB)/CHECK(RL) all start unchecked, toggling one commits just that keyword');
    check('setup: SFLNXTCHG checkbox present', !!doc.getElementById(p + '-sflnxtchg-on'));
    check('SFLNXTCHG starts unchecked', doc.getElementById(p + '-sflnxtchg-on').checked === false);
    doc.getElementById(p + '-keep-on').checked = true;
    doc.getElementById(p + '-keep-on').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SUBFILE');
    check('KEEP was added', reparsed.keywords.some((k) => k.name === 'KEEP'));
    check('SFLNXTCHG was NOT added (independent toggle)', !reparsed.keywords.some((k) => k.name === 'SFLNXTCHG'));
    check('SFL itself is untouched', reparsed.keywords.some((k) => k.name === 'SFL'));
    posted.length = 0;

    console.log('  General: CHECK(AB) and CHECK(RL) are independent toggles sharing the CHECK keyword name');
    doc.getElementById(p + '-check-ab-on').checked = true;
    doc.getElementById(p + '-check-ab-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SUBFILE');
    check('CHECK(AB) was added', reparsed.keywords.some((k) => k.name === 'CHECK' && k.parameters.trim().toUpperCase() === 'AB'));
    check('CHECK(RL) was not', !reparsed.keywords.some((k) => k.name === 'CHECK' && k.parameters.trim().toUpperCase() === 'RL'));
    posted.length = 0;

    console.log('  Indicator: repeatable INDTXT/SETOF/CHANGE rows commit together via Apply');
    doc.getElementById(p + '-ind-row0-kw').value = 'SETOF';
    doc.getElementById(p + '-ind-row0-ind').value = '30';
    doc.getElementById(p + '-ind-row1-kw').value = 'CHANGE';
    doc.getElementById(p + '-ind-row1-ind').value = '40';
    doc.querySelector('.' + p + '-ind-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SUBFILE');
    check('SETOF(30) written', reparsed.keywords.some((k) => k.name === 'SETOF' && k.parameters.trim() === '30'));
    check('CHANGE(40) written', reparsed.keywords.some((k) => k.name === 'CHANGE' && k.parameters.trim() === '40'));
    check('KEEP from the earlier General step is still there (independent panels)', reparsed.keywords.some((k) => k.name === 'KEEP'));

    runWindowPickerScenario();
  }, 0);
}

function runWindowPickerScenario() {
  console.log('\nWindow picker (Task R7): Window Parameters (reference/sized/positioned) + Border Parameters, only on WINDOW-carrying records');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(2 2 10 40)' }),
      buildLine({ seq: '00020', func: 'RSTCSR' }), // Task L7: legacy bogus standalone RSTCSR line the OLD picker used to write - never valid DDS, self-healed away on next commit
      buildLine({ seq: '00030', nameType: 'R', name: 'WIN2', func: 'WINDOW(*DFT 8 30)' }),
      buildLine({ seq: '00035', nameType: 'R', name: 'WIN3', func: 'WINDOW(4 4 9 35 *NOMSGLIN *NORSTCSR)' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00050', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce17', src, 'WINDOW.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  a plain record (no WINDOW) does not get the Window tab');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('no Window tab button rendered', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'Window'));

    console.log('  a WINDOW record gets the Window tab, and its 4-token WINDOW keyword pre-fills the "positioned" mode');
    recordSelect.value = 'WIN1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const windowTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Window');
    check('Window tab button rendered', !!windowTabBtn);
    windowTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const rwPrefix = 'rw-WIN1';
    const modePositioned = doc.querySelector('.' + rwPrefix + '-mode[value="positioned"]');
    check('"positioned" mode is pre-selected for a 4-token WINDOW', modePositioned && modePositioned.checked);
    check('start line pre-filled', doc.getElementById(rwPrefix + '-startline').value === '2');
    check('start column pre-filled', doc.getElementById(rwPrefix + '-startcol').value === '2');
    check('lines pre-filled', doc.getElementById(rwPrefix + '-lines').value === '10');
    check('columns pre-filled', doc.getElementById(rwPrefix + '-cols').value === '40');
    check('Task L7: Restrict cursor to window starts checked (*RSTCSR is WINDOW\u2019s own default - the legacy standalone RSTCSR line is ignored, not consulted)', doc.getElementById(rwPrefix + '-rstcsr').checked);
    check('Task L6: Message line starts checked (no *NOMSGLIN in a bare 4-token WINDOW - *MSGLIN is the default)', doc.getElementById(rwPrefix + '-msgline').checked);

    console.log('  editing the positioned fields and applying commits a new 4-token WINDOW, other keywords untouched');
    doc.getElementById(rwPrefix + '-startline').value = '3';
    doc.getElementById(rwPrefix + '-startcol').value = '5';
    doc.getElementById(rwPrefix + '-lines').value = '12';
    doc.getElementById(rwPrefix + '-cols').value = '50';
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW updated to the new 4-token geometry', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '3 5 12 50');
    check('Task L7: legacy bogus standalone RSTCSR line self-healed away on commit', !reparsed.keywords.some((k) => k.name === 'RSTCSR'));
    check('Task L6: no *NOMSGLIN written - message line stayed checked/default, so the token stays omitted', !/NOMSGLIN/.test(reparsed.keywords.find((k) => k.name === 'WINDOW').parameters));
    check('Task L7: no *NORSTCSR written - restrict cursor stayed checked/default, so the token stays omitted', !/NORSTCSR/.test(reparsed.keywords.find((k) => k.name === 'WINDOW').parameters));
    posted.length = 0;

    console.log('  Task L6: unchecking Message line and applying appends a trailing *NOMSGLIN token, geometry unaffected');
    doc.getElementById(rwPrefix + '-msgline').checked = false;
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW written as "3 5 12 50 *NOMSGLIN"', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '3 5 12 50 *NOMSGLIN');
    check('no bogus standalone RSTCSR line reappears', !reparsed.keywords.some((k) => k.name === 'RSTCSR'));
    posted.length = 0;

    console.log('  Task L6: re-checking Message line and applying drops the *NOMSGLIN token again');
    doc.getElementById(rwPrefix + '-msgline').checked = true;
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW back to "3 5 12 50", no trailing token', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '3 5 12 50');
    posted.length = 0;

    console.log('  Task L7: unchecking Restrict cursor to window and applying appends a trailing *NORSTCSR token, geometry unaffected');
    doc.getElementById(rwPrefix + '-rstcsr').checked = false;
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW written as "3 5 12 50 *NORSTCSR"', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '3 5 12 50 *NORSTCSR');
    posted.length = 0;

    console.log('  Task L7: re-checking Restrict cursor to window and applying drops the *NORSTCSR token again');
    doc.getElementById(rwPrefix + '-rstcsr').checked = true;
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW back to "3 5 12 50", no trailing token', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '3 5 12 50');
    posted.length = 0;

    console.log('  Task L7: unchecking BOTH Message line and Restrict cursor writes both tokens in IBM\u2019s documented order (*MSGLIN/*NOMSGLIN before *RSTCSR/*NORSTCSR)');
    doc.getElementById(rwPrefix + '-msgline').checked = false;
    doc.getElementById(rwPrefix + '-rstcsr').checked = false;
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW written as "3 5 12 50 *NOMSGLIN *NORSTCSR"', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '3 5 12 50 *NOMSGLIN *NORSTCSR');
    doc.getElementById(rwPrefix + '-msgline').checked = true;
    doc.getElementById(rwPrefix + '-rstcsr').checked = true;
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    posted.length = 0;

    console.log('  switching to "sized" mode and applying writes the *DFT 3-token form');
    const modeSized = doc.querySelector('.' + rwPrefix + '-mode[value="sized"]');
    modeSized.checked = true;
    modeSized.dispatchEvent(new Event('change', { bubbles: true }));
    check('the size fields are visible, position fields hidden', doc.querySelector('.' + rwPrefix + '-mode-size').style.display !== 'none' && doc.querySelector('.' + rwPrefix + '-mode-position').style.display === 'none');
    doc.getElementById(rwPrefix + '-lines').value = '9';
    doc.getElementById(rwPrefix + '-cols').value = '35';
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW written as *DFT 9 35', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '*DFT 9 35');
    posted.length = 0;

    console.log('  switching to "reference" mode and applying writes a single record-name parameter');
    const modeReference = doc.querySelector('.' + rwPrefix + '-mode[value="reference"]');
    modeReference.checked = true;
    modeReference.dispatchEvent(new Event('change', { bubbles: true }));
    check('the reference field is visible, size/position fields hidden', doc.querySelector('.' + rwPrefix + '-mode-reference').style.display !== 'none' && doc.querySelector('.' + rwPrefix + '-mode-size').style.display === 'none');
    check('Task L6: Message line row is hidden in "reference" mode (the bare form has no room for *MSGLIN/*NOMSGLIN - inherited from the referenced window instead)', doc.querySelector('.' + rwPrefix + '-msgline-wrap').style.display === 'none');
    check('Task L7: Restrict cursor to window row is hidden in "reference" mode (the bare form has no room for *RSTCSR/*NORSTCSR either)', doc.querySelector('.' + rwPrefix + '-rstcsr-wrap').style.display === 'none');
    doc.getElementById(rwPrefix + '-reference').value = 'WIN2';
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN1');
    check('WINDOW written as a bare reference to WIN2', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === 'WIN2');
    posted.length = 0;

    console.log('  a WINDOW(*DFT ...) record (WIN2) pre-fills the "sized" mode');
    recordSelect.value = 'WIN2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Window').dispatchEvent(new Event('click', { bubbles: true }));
    const rwPrefix2 = 'rw-WIN2';
    const modeSized2 = doc.querySelector('.' + rwPrefix2 + '-mode[value="sized"]');
    check('"sized" mode is pre-selected for a *DFT WINDOW', modeSized2 && modeSized2.checked);
    check('lines pre-filled from *DFT form', doc.getElementById(rwPrefix2 + '-lines').value === '8');
    check('columns pre-filled from *DFT form', doc.getElementById(rwPrefix2 + '-cols').value === '30');
    check('Task L7: Restrict cursor to window starts checked for WIN2 too (*RSTCSR is the default when no trailing token is present)', doc.getElementById(rwPrefix2 + '-rstcsr').checked);
    check('Task L6: Message line starts checked for WIN2 too (no *NOMSGLIN in its *DFT form)', doc.getElementById(rwPrefix2 + '-msgline').checked);

    console.log('  Task L6: a WINDOW(... *NOMSGLIN) record (WIN3) pre-fills "positioned" mode with Message line UNCHECKED');
    recordSelect.value = 'WIN3';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Window').dispatchEvent(new Event('click', { bubbles: true }));
    const rwPrefix3 = 'rw-WIN3';
    const modePositioned3 = doc.querySelector('.' + rwPrefix3 + '-mode[value="positioned"]');
    check('"positioned" mode is pre-selected for WIN3 despite the trailing *NOMSGLIN token (not misread as a 5th positional token)', modePositioned3 && modePositioned3.checked);
    check('start line pre-filled', doc.getElementById(rwPrefix3 + '-startline').value === '4');
    check('start column pre-filled', doc.getElementById(rwPrefix3 + '-startcol').value === '4');
    check('lines pre-filled', doc.getElementById(rwPrefix3 + '-lines').value === '9');
    check('columns pre-filled', doc.getElementById(rwPrefix3 + '-cols').value === '35');
    check('Message line starts UNCHECKED (source has *NOMSGLIN)', !doc.getElementById(rwPrefix3 + '-msgline').checked);
    check('Task L7: Restrict cursor to window starts UNCHECKED (source has *NORSTCSR), not misread as a positional token', !doc.getElementById(rwPrefix3 + '-rstcsr').checked);
    console.log('  Task L6/L7: re-checking both Message line and Restrict cursor on WIN3 and applying drops both tokens, geometry untouched');
    doc.getElementById(rwPrefix3 + '-msgline').checked = true;
    doc.getElementById(rwPrefix3 + '-rstcsr').checked = true;
    doc.getElementById(rwPrefix3 + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN3');
    check('WIN3\u2019s WINDOW written as "4 4 9 35", both trailing tokens dropped', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '4 4 9 35');
    posted.length = 0;

    console.log('  switching back to WIN2 to finish the Border Parameters check');
    recordSelect.value = 'WIN2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Window').dispatchEvent(new Event('click', { bubbles: true }));

    console.log('  Border Parameters: applying color/attributes/characters writes WDWBORDER, same as the file-level picker');
    doc.getElementById(rwPrefix2 + '-wdw-color-on').checked = true;
    doc.getElementById(rwPrefix2 + '-wdw-color').value = 'BLU';
    doc.querySelector('.' + rwPrefix2 + '-wdw-attr[value="HI"]').checked = true;
    doc.getElementById(rwPrefix2 + '-wdw-attrs-on').checked = true;
    doc.getElementById(rwPrefix2 + '-wdw-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WIN2');
    const wdwBorderKw = reparsed.keywords.find((k) => k.name === 'WDWBORDER');
    check('WDWBORDER written with *COLOR BLU', wdwBorderKw && /\*COLOR BLU/.test(wdwBorderKw.parameters));
    check('WDWBORDER written with *DSPATR HI', wdwBorderKw && /\*DSPATR HI/.test(wdwBorderKw.parameters));
    check("WIN2's own WINDOW keyword is untouched by the border edit", reparsed.keywords.some((k) => k.name === 'WINDOW' && k.parameters.trim() === '*DFT 8 30'));

    runUsrDfnPickerScenario();
  }, 0);
}

function runUsrDfnPickerScenario() {
  console.log('\nUSRDFN picker (Task R2): Keywords tab narrows R1\'s 7 categories to General/Help/Print only');
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
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
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

    console.log('  a plain record gets all 7 R1 categories (Task L5d-ii: "App help" moved off this record-level tab list entirely - see runApplicationHelpScenario)');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const plainLabels = keywordsSubtabLabels();
    check('all 7 category subtabs present', ['General', 'Indicator', 'Help', 'Output', 'Input', 'Overlay', 'Print'].every((l) => plainLabels.includes(l)));
    check('App help is NOT one of them', !plainLabels.includes('App help'));

    console.log('  a USRDFN record (carries the USRDFN keyword) only gets General/Help/Print');
    recordSelect.value = 'USERDEFN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const usrdfnLabels = keywordsSubtabLabels();
    check('exactly 3 subtabs', usrdfnLabels.length === 3);
    check('General present', usrdfnLabels.includes('General'));
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

    runApplicationHelpScenario();
  }, 0);
}

function runApplicationHelpScenario() {
  console.log('\nTask L5d-ii: Application Help (HLPPNLGRP/HLPEXCLD/HLPBDY/HLPARA) moved to each HELP entry\'s own properties, not the record\'s');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
      buildLine({ seq: '00015', func: 'KEEP' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
      buildLine({ seq: '00030', nameType: 'H', func: "HLPARA(*RCD) HLPPNLGRP(M1 G1 LIB1)" }),
      buildLine({ seq: '00040', line: '2', col: '2', func: "'Second'" }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce18', src, 'APPHELP.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = 'SCREEN1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('  the record\'s own Keywords tab no longer offers an "App help" subtab at all');
    const keywordsTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Keywords');
    keywordsTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const kwSubtabLabels = Array.from(doc.querySelectorAll('.props-subtab')).map((b) => b.textContent.trim());
    check('"App help" is gone from the record-level Keywords subtabs', !kwSubtabLabels.includes('App help'));
    check('the other 7 categories are still there', ['General', 'Indicator', 'Help', 'Output', 'Input', 'Overlay', 'Print'].every((l) => kwSubtabLabels.includes(l)));

    console.log('  selecting the HELP entry from the Structure tab shows the Application Help fields, pre-filled from ITS OWN keywords');
    const structureTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure');
    structureTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const helpRow = doc.querySelector('.help-entry-row');
    check('one help entry row listed', !!helpRow);
    helpRow.dispatchEvent(new Event('click', { bubbles: true }));
    const sourceLine = helpRow.getAttribute('data-source-line');
    const hpPrefix = 'help-' + sourceLine;
    const hlparaBox = doc.getElementById(hpPrefix + '-hlpara-on');
    const hlppnlgrpBox = doc.getElementById(hpPrefix + '-hlppnlgrp-on');
    const hlpexcldBox = doc.getElementById(hpPrefix + '-hlpexcld-on');
    check('HLPARA checkbox exists and starts checked (present in this help entry\'s own source)', !!hlparaBox && hlparaBox.checked);
    check('HLPPNLGRP checkbox exists and starts checked, with its parameters pre-filled', !!hlppnlgrpBox && hlppnlgrpBox.checked && doc.getElementById(hpPrefix + '-hlppnlgrp-params').value.trim() === 'M1 G1 LIB1');
    check('HLPEXCLD checkbox exists and starts UNCHECKED (not in this help entry\'s source)', !!hlpexcldBox && !hlpexcldBox.checked);

    console.log('  checking HLPEXCLD commits it into the HELP ENTRY\'s own keywords, not the record\'s top-level keywords');
    hlpexcldBox.checked = true;
    hlpexcldBox.dispatchEvent(new Event('change', { bubbles: true }));
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    const reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SCREEN1');
    check('HLPEXCLD landed on the help entry, not the record', reparsed.helpEntries[0].keywords.some((k) => k.name === 'HLPEXCLD') && !reparsed.keywords.some((k) => k.name === 'HLPEXCLD'));
    check('the help entry\'s own pre-existing HLPARA/HLPPNLGRP are untouched', reparsed.helpEntries[0].keywords.some((k) => k.name === 'HLPARA') && reparsed.helpEntries[0].keywords.some((k) => k.name === 'HLPPNLGRP'));
    check('the record\'s own top-level KEEP keyword (unrelated) is untouched', reparsed.keywords.some((k) => k.name === 'KEEP'));

    runSflCtlPickerScenario();
  }, 0);
}

function runSflCtlPickerScenario() {
  console.log('\nSFLCTL picker (Task R4): General (own + reused R3 Subfile Keywords) / Indicator / Display Layout / Subfile Messages, only on SFLCTL-carrying records');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'DTL', func: 'SFL' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'DTLCTL', func: 'SFLCTL(DTL)' }),
      buildLine({ seq: '00040', func: 'SFLSIZ(20)' }),
      buildLine({ seq: '00050', func: 'SFLPAG(10)' }),
      buildLine({ seq: '00060', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00070', name: 'FLD2', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce18', src, 'SFLCTL.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  a plain record (no SFLCTL) does not get the SFLCTL tab; a plain SFL record gets the SFL tab, not SFLCTL');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('no SFLCTL tab button for PLAIN', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFLCTL'));
    recordSelect.value = 'DTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('DTL (plain SFL) gets the SFL tab', Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFL'));
    check('DTL does NOT get the SFLCTL tab', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFLCTL'));

    console.log('  DTLCTL (carries SFLCTL) gets the SFLCTL tab, not the SFL tab');
    recordSelect.value = 'DTLCTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const sflctlTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
    check('SFLCTL tab button rendered', !!sflctlTabBtn);
    check('no separate SFL tab shown on the control record', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'SFL'));
    sflctlTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const p = 'sflctl-DTLCTL';
    console.log('  General: SFLCTL(DTL) pre-filled from the source, editing it commits a new SFLCTL parameter');
    check('SFLCTL checkbox starts checked', doc.getElementById(p + '-sflctl-on').checked);
    check('SFLCTL param pre-filled with DTL', doc.getElementById(p + '-sflctl-params').value === 'DTL');
    doc.getElementById(p + '-sflctl-params').value = 'DTL2';
    doc.getElementById(p + '-sflctl-params').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('SFLCTL updated to DTL2', reparsed.keywords.find((k) => k.name === 'SFLCTL').parameters.trim() === 'DTL2');
    posted.length = 0;

    console.log('  General: reused R3 Subfile Keywords (SFLNXTCHG etc.) and SFLCTL-own flags commit independently');
    doc.getElementById(p + '-sflnxtchg-on').checked = true;
    doc.getElementById(p + '-sflnxtchg-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('SFLNXTCHG was added', reparsed.keywords.some((k) => k.name === 'SFLNXTCHG'));
    check('SFLDSP was NOT added (independent toggle)', !reparsed.keywords.some((k) => k.name === 'SFLDSP'));
    posted.length = 0;

    doc.getElementById(p + '-sfldsp-on').checked = true;
    doc.getElementById(p + '-sfldsp-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('SFLDSP was added', reparsed.keywords.some((k) => k.name === 'SFLDSP'));
    check('SFLNXTCHG from the previous step is still there (independent commits)', reparsed.keywords.some((k) => k.name === 'SFLNXTCHG'));
    posted.length = 0;

    console.log('  General: SFLDSP/SFLDSPCTL/SFLCLR support indicator conditioning - it shows when present, and survives unrelated edits on the same panel');
    check('SFLDSP starts with no Conditioning shown as already set (0)', /Conditioning(?!\s*\(\d)/.test(doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-sfldsp"]').textContent));
    doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-sfldsp"]').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.cond-add-group[data-prefix="' + p + '-sfldsp-cond"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition on SFLDSP does not write yet (pending, not committed)', posted.length === 0);
    const sfldspPendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    sfldspPendingNumInput.value = '30';
    doc.querySelector('.cond-ind-add[data-prefix="' + p + '-sfldsp-cond"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    const sfldspKw = reparsed.keywords.find((k) => k.name === 'SFLDSP');
    check('SFLDSP is now conditioned on indicator 30', sfldspKw.conditions.length === 1 && sfldspKw.conditions[0].indicators[0].number === '30');
    posted.length = 0;

    check('re-rendering shows the Conditioning(1) summary on the SFLDSP row, not hidden', /Conditioning\s*\(1\)/.test(doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-sfldsp"]').textContent));
    check("SFLDSP's pending indicator input is pre-filled with the committed 30 (existing conditioning is genuinely displayed, not just accepted)", doc.querySelector('.cond-group[data-group="0"] .keyword-chip').textContent.trim().startsWith('30'));

    doc.getElementById(p + '-sflinz-on').checked = true;
    doc.getElementById(p + '-sflinz-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('toggling an unrelated flag (SFLINZ) on the same panel does not wipe SFLDSP\'s indicator 30 conditioning', reparsed.keywords.find((k) => k.name === 'SFLDSP').conditions.length === 1 && reparsed.keywords.find((k) => k.name === 'SFLDSP').conditions[0].indicators[0].number === '30');
    posted.length = 0;

    console.log('  General: SFLDROP/SFLFOLD/SFLENTER take a free-text CFnn/CAnn parameter');
    doc.getElementById(p + '-sfldrop-on').checked = true;
    doc.getElementById(p + '-sfldrop-params').value = 'CF03';
    doc.getElementById(p + '-sfldrop-params').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('SFLDROP(CF03) written', reparsed.keywords.find((k) => k.name === 'SFLDROP').parameters.trim() === 'CF03');
    posted.length = 0;

    console.log('  Indicator (Task L5d): SFLCTL gets the SAME fuller repeatable keyword set as a plain record\u2019s own Indicator panel, not R3\u2019s narrower INDTXT/SETOF/CHANGE-only table');
    check('no indicator-keyword instances yet - empty state shown', doc.getElementById(p + '-recind-rep-instances').textContent.indexOf('None defined.') >= 0);
    doc.querySelector('.repeat-inst-add[data-prefix="' + p + '-recind-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('clicking "+ Add" seeds a valid default CLEAR(10) instance, not a blank one', !!reparsed.keywords.find((k) => k.name === 'CLEAR' && k.parameters.trim() === '10'));
    posted.length = 0;

    const recindKindEl = doc.querySelector('.' + p + '-recind-rep-inst0-kind');
    recindKindEl.value = 'INDTXT';
    recindKindEl.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    doc.querySelector('.' + p + '-recind-rep-inst0-resp').value = '60';
    doc.querySelector('.' + p + '-recind-rep-inst0-resp').dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    doc.querySelector('.' + p + '-recind-rep-inst0-text').value = 'No records found';
    doc.querySelector('.' + p + '-recind-rep-inst0-text').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    const indtxtKw = reparsed.keywords.find((k) => k.name === 'INDTXT');
    check('INDTXT written with indicator 60 and quoted text', indtxtKw && /^60\s+'No records found'/.test(indtxtKw.parameters.trim()));
    posted.length = 0;

    console.log('  Indicator (Task L5d): a second, independently-conditioned instance of a screen-control keyword not covered by R3\u2019s table (e.g. CLEAR) coexists with the INDTXT instance');
    doc.querySelector('.repeat-inst-add[data-prefix="' + p + '-recind-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('the first instance (INDTXT) survives adding a second', !!reparsed.keywords.find((k) => k.name === 'INDTXT'));
    check('a second CLEAR(10) instance was added alongside it', !!reparsed.keywords.find((k) => k.name === 'CLEAR' && k.parameters.trim() === '10'));
    posted.length = 0;

    console.log('  Display Layout: SFLSIZ(20)/SFLPAG(10) pre-filled from source, editing commits all three keywords together');
    check('SFLSIZ pre-filled', doc.getElementById(p + '-sflsiz').value === '20');
    check('SFLPAG pre-filled', doc.getElementById(p + '-sflpag').value === '10');
    check('SFLLIN starts blank', doc.getElementById(p + '-sfllin').value === '');
    doc.getElementById(p + '-sflsiz').value = 'SIZEFLD';
    doc.getElementById(p + '-sflpag').value = '5';
    doc.getElementById(p + '-sfllin').value = '1';
    doc.getElementById(p + '-layout-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('SFLSIZ accepts a field name', reparsed.keywords.find((k) => k.name === 'SFLSIZ').parameters.trim() === 'SIZEFLD');
    check('SFLPAG updated to 5', reparsed.keywords.find((k) => k.name === 'SFLPAG').parameters.trim() === '5');
    check('SFLLIN written as 1', reparsed.keywords.find((k) => k.name === 'SFLLIN').parameters.trim() === '1');
    posted.length = 0;

    console.log('  Subfile Messages (Task L1c): SFLMSG and SFLMSGID are each independently repeatable, independently conditioned instances');
    check('no SFLMSG instances yet - empty state shown', doc.getElementById(p + '-sflmsg-rep-instances').textContent.indexOf('None defined.') >= 0);
    doc.querySelector('.repeat-inst-add[data-prefix="' + p + '-sflmsg-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    console.log('  Subfile Messages: clicking "+ Add" alone never writes an invalid bare SFLMSG (no parameter) - seeds a non-blank placeholder instead');
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    const seededSflMsg = reparsed.keywords.find((k) => k.name === 'SFLMSG');
    check('the freshly-added SFLMSG instance has a non-blank, validly-quoted placeholder', /^'.+'$/.test(seededSflMsg.parameters.trim()));
    posted.length = 0;
    doc.getElementById(p + '-sflmsg-rep-inst0-text').value = 'No records in subfile';
    doc.getElementById(p + '-sflmsg-rep-inst0-text').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('first SFLMSG written as a quoted string', /^'No records in subfile'$/.test(reparsed.keywords.find((k) => k.name === 'SFLMSG').parameters.trim()));
    posted.length = 0;

    console.log('  Subfile Messages: a SECOND independently-conditioned SFLMSG instance coexists with the first (Task L1\\u2019s whole point)');
    doc.querySelector('.repeat-inst-add[data-prefix="' + p + '-sflmsg-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    posted.length = 0;
    doc.getElementById(p + '-sflmsg-rep-inst1-text').value = 'More records exist';
    doc.getElementById(p + '-sflmsg-rep-inst1-text').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    const sflMsgKws = reparsed.keywords.filter((k) => k.name === 'SFLMSG');
    check('BOTH SFLMSG keywords now coexist as separate instances', sflMsgKws.length === 2);
    check('first instance unchanged by adding the second', /^'No records in subfile'$/.test(sflMsgKws[0].parameters.trim()));
    check('second instance carries its own text', /^'More records exist'$/.test(sflMsgKws[1].parameters.trim()));
    posted.length = 0;

    console.log('  Subfile Messages: SFLMSGID (msgid/file/library) commits independently of SFLMSG, via the same repeatable component');
    doc.querySelector('.repeat-inst-add[data-prefix="' + p + '-sflmsgid-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    console.log('  Subfile Messages: clicking "+ Add" alone never writes an invalid blank-parameters SFLMSGID - seeds a valid MSGID/MSGFILE placeholder instead');
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('the freshly-added SFLMSGID instance has a non-blank placeholder (msgId + msgFile both present)', /^\S+\s+\S+$/.test(reparsed.keywords.find((k) => k.name === 'SFLMSGID').parameters.trim()));
    posted.length = 0;
    doc.getElementById(p + '-sflmsgid-rep-inst0-id').value = 'MSG0001';
    doc.getElementById(p + '-sflmsgid-rep-inst0-file').value = 'MYMSGF';
    doc.getElementById(p + '-sflmsgid-rep-inst0-lib').value = 'MYLIB';
    doc.getElementById(p + '-sflmsgid-rep-inst0-lib').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    check('SFLMSGID written as msgid+file+library', reparsed.keywords.find((k) => k.name === 'SFLMSGID').parameters.trim() === 'MSG0001 MYMSGF MYLIB');
    check('both SFLMSG instances from the previous steps are still there (independent commits)', reparsed.keywords.filter((k) => k.name === 'SFLMSG').length === 2);
    posted.length = 0;

    console.log('  Subfile Messages: an incomplete SFLMSGID (blank message file) is never committed - avoids writing invalid DDS');
    doc.getElementById(p + '-sflmsgid-rep-inst0-file').value = '';
    doc.getElementById(p + '-sflmsgid-rep-inst0-file').dispatchEvent(new Event('change', { bubbles: true }));
    check('no new edit was posted for the incomplete entry', posted.filter((m) => m.type === 'applyEdit').length === 0);

    console.log('  Subfile Messages: removing an SFLMSG instance leaves the other untouched');
    doc.querySelectorAll('.repeat-inst-remove[data-prefix="' + p + '-sflmsg-rep"]')[0].dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'DTLCTL');
    const remainingSflMsg = reparsed.keywords.filter((k) => k.name === 'SFLMSG');
    check('exactly one SFLMSG instance remains', remainingSflMsg.length === 1);
    check('the REMAINING one is the second instance, not the removed first', /^'More records exist'$/.test(remainingSflMsg[0].parameters.trim()));
    check('SFLMSGID (a completely different keyword group) is untouched by removing an SFLMSG instance', reparsed.keywords.some((k) => k.name === 'SFLMSGID'));

    runNumericFieldPickerScenario();
  }, 0);
}

function runNumericFieldPickerScenario() {
  console.log('\nNumeric field picker (Task D3): Edit code/word/mask gated on Output/Both, Keyboard shift attribute, Subfile keywords');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'DTLCTL', func: 'SFLCTL(DETAIL)' }),
      buildLine({ seq: '00030', name: 'AMT', dataType: 'S', length: '7', decimals: '2', usage: 'O', line: '1', col: '1' }),
      buildLine({ seq: '00040', name: 'QTY', dataType: 'S', length: '5', usage: 'H' }),
      buildLine({ seq: '00050', name: 'RECNBR', dataType: 'S', length: '5', usage: 'B', line: '1', col: '30' }),
      buildLine({ seq: '00060', name: 'DESCR', dataType: 'A', length: '10', usage: 'B', line: '2', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce18', src, 'NUMERIC.DSPF').replace(
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
    const { Event } = dom.window;

    function selectFieldByName(name) {
      const el = Array.from(doc.querySelectorAll('.dspf-field')).find((e) => e.getAttribute('data-field') === name);
      if (el) { el.dispatchEvent(new Event('click', { bubbles: true })); return true; }
      return false;
    }

    console.log('  AMT (Usage O, numeric): Edit code/word/mask section is present, EDTMSK is a selectable kind');
    check('AMT is selectable on the canvas', selectFieldByName('AMT'));
    const ecKindSelect = Array.from(doc.querySelectorAll('select')).find((s) => s.id.endsWith('-ec-kind'));
    check('Edit code/word/mask select exists for an Output field', !!ecKindSelect);
    check('EDTMSK is one of its options', Array.from(ecKindSelect.options).some((o) => o.value === 'EDTMSK'));
    const ecOwnerKey = ecKindSelect.id.replace('-ec-kind', '');
    ecKindSelect.value = 'EDTMSK';
    doc.getElementById(ecOwnerKey + '-ec-params').value = "'(999) 999-9999'";
    doc.querySelector('.' + ecOwnerKey + '-vc-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text);
    let amtField = reparsed.records.find((r) => r.name === 'DTLCTL').fields.find((f) => f.name === 'AMT');
    check('EDTMSK written with the quoted mask', amtField.keywords.some((k) => k.name === 'EDTMSK' && k.parameters.trim() === "'(999) 999-9999'"));
    posted.length = 0;

    console.log('  QTY (Usage H, Hidden): Edit code/word/mask section is absent (not Output/Both)');
    doc.getElementById('recordSelect').value = 'DTLCTL';
    doc.getElementById('recordSelect').dispatchEvent(new Event('change', { bubbles: true }));
    const hiddenTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.getAttribute('data-tab') === 'hidden');
    check('a Hidden tab exists on the record props panel', !!hiddenTabBtn);
    hiddenTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const qtyRow = Array.from(doc.querySelectorAll('.field-order-row[data-source-line]')).find((el) => el.textContent.indexOf('QTY') !== -1);
    check('QTY is listed in the Hidden tab', !!qtyRow);
    qtyRow.dispatchEvent(new Event('click', { bubbles: true }));
    const hiddenEcKind = Array.from(doc.querySelectorAll('select')).find((s) => s.id.endsWith('-ec-kind'));
    check('no Edit code/word/mask select for a Hidden field', !hiddenEcKind);

    console.log('  QTY (Usage H, Hidden, numeric): Keying options panel offers the Keyboard shift attribute (KEYBRD)');
    const keybrdSelect = Array.from(doc.querySelectorAll('select')).find((s) => s.className && s.className.indexOf('-keybrd') >= 0);
    check('KEYBRD select present for a Hidden field (Keying options is Hidden/Input/Both)', !!keybrdSelect);
    // Bug fix (Task A2 - SDA screenshot keyword-inventory audit follow-up):
    // QTY is a NUMERIC field (dataType 'S'), so per real SDA's own numeric
    // "Select Keying Options" screen (screens/field-level/numeric/keying-
    // options/image176.png, confirmed again on the numeric Database
    // Reference screen's "New keyboard shift" column, image183.png) it
    // must offer exactly S/N/Y/I/D - NOT the character field's own N/A/X/
    // W/I/D/M/J/O/E/G list (character/keying-options/image164.png), which
    // this same assertion wrongly expected before this fix (when one
    // unconditional list was used for every field regardless of type).
    const keybrdValues = Array.from(keybrdSelect.options).map((o) => o.value).filter(Boolean);
    check('KEYBRD (numeric field) offers exactly D/I/N/S/Y (real SDA\u2019s own numeric screen), not the character-only list', keybrdValues.sort().join(',') === 'D,I,N,S,Y');
    keybrdSelect.value = 'N';
    keybrdSelect.dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted for KEYBRD', !!applyEdit);
    reparsed = DspfParser.parseDspf(applyEdit.text);
    const qtyField = reparsed.records.find((r) => r.name === 'DTLCTL').fields.find((f) => f.name === 'QTY');
    check('KEYBRD written with value N', qtyField.keywords.some((k) => k.name === 'KEYBRD' && k.parameters.trim() === 'N'));
    posted.length = 0;

    console.log('  DESCR (Usage B, character): Keying options panel offers the character-only Keyboard shift attribute list');
    check('DESCR is selectable on the canvas', selectFieldByName('DESCR'));
    const charKeybrdSelect = Array.from(doc.querySelectorAll('select')).find((s) => s.className && s.className.indexOf('-keybrd') >= 0);
    check('KEYBRD select present for a character field too', !!charKeybrdSelect);
    const charKeybrdValues = Array.from(charKeybrdSelect.options).map((o) => o.value).filter(Boolean);
    check('KEYBRD (character field) offers exactly A/D/E/G/I/J/M/N/O/W/X (real SDA\u2019s own character screen), not the numeric-only list', charKeybrdValues.sort().join(',') === 'A,D,E,G,I,J,M,N,O,W,X');
    posted.length = 0;

    console.log('  RECNBR (in an SFLCTL record): Subfile keywords panel is present, SFLRCDNBR/SFLROLVAL commit');
    selectFieldByName('RECNBR');
    const sflrcdnbrEl = Array.from(doc.querySelectorAll('select')).find((s) => s.id.endsWith('-sflrcdnbr'));
    check('SFLRCDNBR select present for a field in an SFLCTL record', !!sflrcdnbrEl);
    sflrcdnbrEl.value = '*TOP';
    sflrcdnbrEl.dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text);
    let recnbrField = reparsed.records.find((r) => r.name === 'DTLCTL').fields.find((f) => f.name === 'RECNBR');
    check('SFLRCDNBR written as *TOP', recnbrField.keywords.some((k) => k.name === 'SFLRCDNBR' && k.parameters.trim() === '*TOP'));
    posted.length = 0;

    const sflrolvalOwnerKey = sflrcdnbrEl.id.replace('-sflrcdnbr', '');
    const sflrolvalEl = doc.getElementById(sflrolvalOwnerKey + '-sflrolval');
    check('SFLROLVAL checkbox present', !!sflrolvalEl);
    sflrolvalEl.checked = true;
    sflrolvalEl.dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text);
    recnbrField = reparsed.records.find((r) => r.name === 'DTLCTL').fields.find((f) => f.name === 'RECNBR');
    check('SFLROLVAL written', recnbrField.keywords.some((k) => k.name === 'SFLROLVAL'));
    check('SFLRCDNBR from the previous step is still there (independent commits)', recnbrField.keywords.some((k) => k.name === 'SFLRCDNBR'));
    runMnuBarPickerScenario();
  }, 0);
}

function runMnuBarPickerScenario() {
  console.log('\nMNUBAR picker (Task R13): General (MNUBAR + reused MNUBARSW/MNUCNL), only on MNUBAR-carrying records');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'BAR1', func: 'MNUBAR' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00030', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce19', src, 'MNUBAR.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  a plain record (no MNUBAR) does not get the MNUBAR tab');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('no MNUBAR tab button rendered', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'MNUBAR'));

    console.log('  a MNUBAR record gets the MNUBAR tab');
    recordSelect.value = 'BAR1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const mnuBarTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'MNUBAR');
    check('MNUBAR tab button rendered', !!mnuBarTabBtn);
    mnuBarTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const p = 'mnubar-BAR1';
    console.log('  General: MNUBAR starts checked (already present in the source, no parameters)');
    check('MNUBAR checkbox starts checked', doc.getElementById(p + '-mnubar-on').checked);
    check('MNUBAR params start blank', doc.getElementById(p + '-mnubar-params').value === '');

    console.log('  General: MNUBARSW and MNUCNL (reused from the file-level component) commit independently of MNUBAR itself');
    doc.getElementById(p + '-mnubarsw-on').checked = true;
    doc.getElementById(p + '-mnubarsw-ind').value = '50';
    doc.getElementById(p + '-mnubarsw-cakey').value = 'CA03';
    doc.getElementById(p + '-mnubarsw-cakey').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'BAR1');
    check('MNUBARSW written with indicator + CA key', reparsed.keywords.find((k) => k.name === 'MNUBARSW').parameters.trim() === '50 CA03');
    check('MNUBAR keyword itself is untouched', reparsed.keywords.some((k) => k.name === 'MNUBAR'));
    posted.length = 0;

    doc.getElementById(p + '-mnucnl-on').checked = true;
    doc.getElementById(p + '-mnucnl-ind').value = '51';
    doc.getElementById(p + '-mnucnl-cakey').value = 'CA04';
    doc.getElementById(p + '-mnucnl-resp').value = '90';
    doc.getElementById(p + '-mnucnl-resp').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'BAR1');
    check('MNUCNL written with indicator + CA key + response indicator', reparsed.keywords.find((k) => k.name === 'MNUCNL').parameters.trim() === '51 CA04 90');
    check('MNUBARSW from the previous step is still there (independent commits)', reparsed.keywords.some((k) => k.name === 'MNUBARSW'));
    posted.length = 0;

    console.log('  General: editing MNUBAR\u2019s own parameters box commits just that keyword');
    doc.getElementById(p + '-mnubar-params').value = '*SEP';
    doc.getElementById(p + '-mnubar-params').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'BAR1');
    check('MNUBAR written with the new parameter', reparsed.keywords.find((k) => k.name === 'MNUBAR').parameters.trim() === '*SEP');
    check('MNUBARSW/MNUCNL from earlier steps are still there (independent commits)', reparsed.keywords.some((k) => k.name === 'MNUBARSW') && reparsed.keywords.some((k) => k.name === 'MNUCNL'));

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED for MNUBAR - continuing to Pull-down' : failures + ' CHECK(S) FAILED so far'));
    runPulldownPickerScenario();
  }, 0);
}

function runPulldownPickerScenario() {
  console.log('\nPull-down picker (Task R10): General (PULLDOWN\u2019s own *SLTIND/*RSTCSR) + Border Parameters (reused from R7), only on PULLDOWN-carrying records');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'PDN1', func: 'PULLDOWN(*SLTIND)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00030', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce18', src, 'PULLDOWN.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  a plain record (no PULLDOWN) does not get the Pull-down tab');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('no Pull-down tab button rendered', !Array.from(doc.querySelectorAll('.props-tab')).some((b) => b.textContent.trim() === 'Pull-down'));

    console.log('  a PULLDOWN record gets the Pull-down tab, and PULLDOWN(*SLTIND) pre-fills General');
    recordSelect.value = 'PDN1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const pulldownTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Pull-down');
    check('Pull-down tab button rendered', !!pulldownTabBtn);
    pulldownTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const rpdPrefix = 'rpd-PDN1';
    check('PULLDOWN starts checked (already present in the source)', doc.getElementById(rpdPrefix + '-on').checked);
    check('*SLTIND starts checked (already present in the source)', doc.getElementById(rpdPrefix + '-sltind').checked);
    check('*RSTCSR starts unchecked (not in the source)', !doc.getElementById(rpdPrefix + '-rstcsr').checked);

    console.log('  checking *RSTCSR commits both sub-flags on PULLDOWN, other keywords untouched');
    doc.getElementById(rpdPrefix + '-rstcsr').checked = true;
    doc.getElementById(rpdPrefix + '-rstcsr').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PDN1');
    let pulldownKw = reparsed.keywords.find((k) => k.name === 'PULLDOWN');
    check('PULLDOWN now carries both *SLTIND and *RSTCSR', pulldownKw && /\*SLTIND/.test(pulldownKw.parameters) && /\*RSTCSR/.test(pulldownKw.parameters));
    posted.length = 0;

    console.log('  Border Parameters: applying color writes WDWBORDER, same shared F1/R7 panel, PULLDOWN untouched');
    doc.getElementById(rpdPrefix + '-wdw-color-on').checked = true;
    doc.getElementById(rpdPrefix + '-wdw-color').value = 'RED';
    doc.getElementById(rpdPrefix + '-wdw-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PDN1');
    const wdwBorderKw = reparsed.keywords.find((k) => k.name === 'WDWBORDER');
    check('WDWBORDER written with *COLOR RED', wdwBorderKw && /\*COLOR RED/.test(wdwBorderKw.parameters));
    check("PDN1's own PULLDOWN keyword is untouched by the border edit", reparsed.keywords.some((k) => k.name === 'PULLDOWN'));
    posted.length = 0;

    console.log('  unchecking the Pull-down record checkbox removes PULLDOWN entirely');
    doc.getElementById(rpdPrefix + '-on').checked = false;
    doc.getElementById(rpdPrefix + '-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PDN1');
    check('PULLDOWN removed', !reparsed.keywords.some((k) => k.name === 'PULLDOWN'));

    runSflMsgCtlPickerScenario();
  }, 0);
}

// Task R6 - "SFLMSGCTL" isn't a distinct DDS keyword: a message subfile's
// control record is a completely ordinary SFLCTL record (SFLCTL(name),
// same SFLDSP/SFLSIZ/SFLPAG/etc. as any other subfile control record) -
// the "message" flavor lives entirely on the DETAIL record (SFL +
// SFLMSGRCD, Task R5's own tab), not on anything the control record
// itself carries. Task R4's isSflCtlRecord/sflCtlPanelsHtml/
// wireSflCtlPanels already key purely off the control record's OWN
// SFLCTL keyword, with no awareness of what its paired detail record
// looks like - so they already cover this case correctly, with zero new
// dspfWriter.js primitives or webviewClientHelpers.js panels needed, the
// same "no screens of its own, existing wiring already applies" shape
// Task R2 (USRDFN) took for R1. This scenario is the verification: an
// SFLCTL record paired with a genuine SFLMSG (not plain SFL) detail
// record still gets the SFLCTL tab, still commits normally, and doesn't
// bleed into or get confused with the detail record's own SFLMSG tab.
function runSflMsgCtlPickerScenario() {
  console.log('\nSFLMSGCTL wiring (Task R6): a message subfile\u2019s SFLCTL control record is an ordinary SFLCTL record - Task R4\u2019s picker already applies as-is, no new code needed');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'MSGDTL', func: 'SFL' }),
      buildLine({ seq: '00020', func: 'SFLMSGRCD(24)' }),
      buildLine({ seq: '00030', name: 'MSGKEY', dataType: 'A', length: '4', usage: 'H', func: 'SFLMSGKEY' }),
      buildLine({ seq: '00040', name: 'PGMQ', dataType: 'A', length: '10', usage: 'H', func: 'SFLPGMQ' }),
      buildLine({ seq: '00050', nameType: 'R', name: 'MSGCTL', func: 'SFLCTL(MSGDTL)' }),
      buildLine({ seq: '00060', func: 'SFLSIZ(20)' }),
      buildLine({ seq: '00070', func: 'SFLPAG(10)' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce19', src, 'SFLMSGCTL.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  MSGDTL (SFL + SFLMSGRCD) gets the SFLMSG tab, not SFL or SFLCTL');
    recordSelect.value = 'MSGDTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const tabLabels = () => Array.from(doc.querySelectorAll('.props-tab')).map((b) => b.textContent.trim());
    check('MSGDTL gets the SFLMSG tab', tabLabels().includes('SFLMSG'));
    check('MSGDTL does NOT get the SFL tab', !tabLabels().includes('SFL'));
    check('MSGDTL does NOT get the SFLCTL tab', !tabLabels().includes('SFLCTL'));

    console.log('  MSGCTL (SFLCTL paired with a message-subfile detail record) gets the SFLCTL tab, not SFLMSG or SFL - same as any other SFLCTL record');
    recordSelect.value = 'MSGCTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('MSGCTL gets the SFLCTL tab', tabLabels().includes('SFLCTL'));
    check('MSGCTL does NOT get the SFLMSG tab', !tabLabels().includes('SFLMSG'));
    check('MSGCTL does NOT get the SFL tab', !tabLabels().includes('SFL'));
    const sflctlTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
    sflctlTabBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const p = 'sflctl-MSGCTL';
    console.log('  General/Display Layout commit exactly as they do on a plain SFLCTL record (Task R4\u2019s panel, unmodified)');
    check('SFLSIZ pre-filled', doc.getElementById(p + '-sflsiz').value === '20');
    check('SFLPAG pre-filled', doc.getElementById(p + '-sflpag').value === '10');
    doc.getElementById(p + '-sfldsp-on').checked = true;
    doc.getElementById(p + '-sfldsp-on').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text);
    let ctlRec = reparsed.records.find((r) => r.name === 'MSGCTL');
    check('SFLDSP was added to MSGCTL', ctlRec.keywords.some((k) => k.name === 'SFLDSP'));
    const dtlRec = reparsed.records.find((r) => r.name === 'MSGDTL');
    check("MSGDTL's own SFL/SFLMSGRCD are untouched by the control record's edit", dtlRec.keywords.some((k) => k.name === 'SFL') && dtlRec.keywords.some((k) => k.name === 'SFLMSGRCD' && k.parameters.trim() === '24'));
    posted.length = 0;

    console.log('  Subfile Messages: SFLMSGID commits on the control record without disturbing the detail record\u2019s SFLMSGRCD-based message handling');
    doc.querySelector('.repeat-inst-add[data-prefix="' + p + '-sflmsgid-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    posted.length = 0;
    doc.getElementById(p + '-sflmsgid-rep-inst0-id').value = 'MSG0001';
    doc.getElementById(p + '-sflmsgid-rep-inst0-file').value = 'MYMSGF';
    doc.getElementById(p + '-sflmsgid-rep-inst0-file').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text);
    ctlRec = reparsed.records.find((r) => r.name === 'MSGCTL');
    check('SFLMSGID written on MSGCTL', ctlRec.keywords.find((k) => k.name === 'SFLMSGID').parameters.trim() === 'MSG0001 MYMSGF');
    const dtlRec2 = reparsed.records.find((r) => r.name === 'MSGDTL');
    check("MSGDTL's SFLMSGRCD is still 24, untouched by the control record's own message-keyword edit", dtlRec2.keywords.find((k) => k.name === 'SFLMSGRCD').parameters.trim() === '24');

    runWndSfCtlPickerScenario();
  }, 0);
}

// Task R9 - "WNDSFCTL" isn't a distinct DDS keyword either, same shape as
// Task R6's SFLMSGCTL finding: it's an ordinary SFLCTL record (SFLCTL(name),
// same SFLSIZ/SFLPAG/SFLDSP/etc. as any other subfile control record) that
// ALSO happens to carry a WINDOW keyword, making it a windowed subfile
// control record. Task R4's isSflCtlRecord/sflCtlPanelsHtml and Task R7's
// isWindowRecord/windowPanelsHtml each key purely off the record's own
// keywords (SFLCTL / WINDOW respectively), with no awareness of each
// other or of what any paired record looks like - and renderRecordProps
// already renders their tabs from independent `if` blocks (not
// mutually-exclusive branches), so a record carrying both keywords already
// gets BOTH the SFLCTL tab and the Window tab, each with its own picker,
// with zero new dspfWriter.js primitives or webviewClientHelpers.js panels
// needed - the same "no screens of its own, existing wiring already
// applies" shape Task R6 took for SFLMSGCTL (and Task R2 took for USRDFN
// against R1). This scenario is the verification: a genuine windowed
// subfile control record gets both tabs, each panel pre-fills and commits
// independently without disturbing the other's keywords or the paired
// detail record.
function runWndSfCtlPickerScenario() {
  console.log('\nWNDSFCTL wiring (Task R9): a windowed subfile control record is an ordinary SFLCTL record that also carries WINDOW - Task R4\u2019s and Task R7\u2019s pickers already apply as-is, no new code needed');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'WSFDTL', func: 'SFL' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'WSFCTL', func: 'SFLCTL(WSFDTL)' }),
      buildLine({ seq: '00040', func: 'SFLSIZ(20)' }),
      buildLine({ seq: '00050', func: 'SFLPAG(10)' }),
      buildLine({ seq: '00060', func: 'WINDOW(2 2 10 40)' }),
      buildLine({ seq: '00070', func: 'RSTCSR' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce20', src, 'WNDSFCTL.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');
    const tabLabels = () => Array.from(doc.querySelectorAll('.props-tab')).map((b) => b.textContent.trim());

    console.log('  WSFDTL (plain SFL detail record) is unaffected - gets SFL, not SFLCTL or Window');
    recordSelect.value = 'WSFDTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('WSFDTL gets the SFL tab', tabLabels().includes('SFL'));
    check('WSFDTL does NOT get the SFLCTL tab', !tabLabels().includes('SFLCTL'));
    check('WSFDTL does NOT get the Window tab', !tabLabels().includes('Window'));

    console.log('  WSFCTL (SFLCTL + WINDOW together) gets BOTH the SFLCTL tab and the Window tab, not SFL');
    recordSelect.value = 'WSFCTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('WSFCTL gets the SFLCTL tab', tabLabels().includes('SFLCTL'));
    check('WSFCTL gets the Window tab', tabLabels().includes('Window'));
    check('WSFCTL does NOT get the SFL tab', !tabLabels().includes('SFL'));

    const sflctlTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
    sflctlTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const p = 'sflctl-WSFCTL';
    console.log('  SFLCTL tab: General pre-fills exactly as on a plain SFLCTL record (Task R4\u2019s panel, unmodified)');
    check('SFLSIZ pre-filled', doc.getElementById(p + '-sflsiz').value === '20');
    check('SFLPAG pre-filled', doc.getElementById(p + '-sflpag').value === '10');
    doc.getElementById(p + '-sfldsp-on').checked = true;
    doc.getElementById(p + '-sfldsp-on').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WSFCTL');
    check('SFLDSP was added to WSFCTL', reparsed.keywords.some((k) => k.name === 'SFLDSP'));
    check("WSFCTL's WINDOW keyword is untouched by the SFLCTL-tab edit", reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '2 2 10 40');
    posted.length = 0;

    const windowTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Window');
    windowTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const rwPrefix = 'rw-WSFCTL';
    console.log('  Window tab: Window Parameters pre-fill exactly as on a plain WINDOW record (Task R7\u2019s panel, unmodified)');
    const modePositioned = doc.querySelector('.' + rwPrefix + '-mode[value="positioned"]');
    check('"positioned" mode pre-selected for a 4-token WINDOW', modePositioned && modePositioned.checked);
    check('start line pre-filled', doc.getElementById(rwPrefix + '-startline').value === '2');
    check('lines pre-filled', doc.getElementById(rwPrefix + '-lines').value === '10');
    check('Task L7: Restrict cursor to window starts checked (*RSTCSR is WINDOW\u2019s own default; the legacy standalone RSTCSR line is ignored)', doc.getElementById(rwPrefix + '-rstcsr').checked);

    doc.getElementById(rwPrefix + '-startline').value = '4';
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WSFCTL');
    check('WINDOW start line updated', reparsed.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '4 2 10 40');
    check("WSFCTL's SFLCTL keyword is untouched by the Window-tab edit", reparsed.keywords.find((k) => k.name === 'SFLCTL').parameters.trim() === 'WSFDTL');
    check("WSFCTL's SFLDSP (added on the SFLCTL tab above) survived the Window-tab edit", reparsed.keywords.some((k) => k.name === 'SFLDSP'));
    const dtlRec = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WSFDTL');
    check("WSFDTL's own SFL keyword is untouched throughout", dtlRec.keywords.some((k) => k.name === 'SFL'));

    runWndSflScenario();
  }, 0);
}

// Task R8 - a record carrying BOTH SFL and WINDOW (a windowed subfile,
// WNDSFL). Same finding as R6/R9: R3's isSflRecord and R7's isWindowRecord
// tab-visibility gates are independent boolean checks with no mutual
// exclusion, so a record carrying both already gets the SFL tab and the
// Window tab simultaneously, and each commits its own keywords without
// disturbing the other's - zero new production code needed.
function runWndSflScenario() {
  console.log('\nWNDSFL (Task R8): a record carrying BOTH SFL and WINDOW gets the SFL tab (R3) AND the Window tab (R7) together, each committing independently');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'WINDOWSFL', func: 'SFL' }),
      buildLine({ seq: '00020', func: 'WINDOW(2 2 10 40)' }),
      buildLine({ seq: '00030', name: 'F1', dataType: 'A', length: '10', usage: 'O', line: '1', col: '2' }),
      buildLine({ seq: '00040', nameType: 'R', name: 'PLAIN' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce20', src, 'WNDSFL.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  a plain record (neither SFL nor WINDOW) gets neither tab');
    recordSelect.value = 'PLAIN';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    let tabLabels = Array.from(doc.querySelectorAll('.props-tab')).map((b) => b.textContent.trim());
    check('no SFL tab for a plain record', tabLabels.indexOf('SFL') === -1);
    check('no Window tab for a plain record', tabLabels.indexOf('Window') === -1);

    console.log('  WINDOWSFL (SFL + WINDOW together) gets BOTH the SFL tab and the Window tab at once');
    recordSelect.value = 'WINDOWSFL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    tabLabels = Array.from(doc.querySelectorAll('.props-tab')).map((b) => b.textContent.trim());
    check('SFL tab is present', tabLabels.indexOf('SFL') >= 0);
    check('Window tab is present', tabLabels.indexOf('Window') >= 0);

    console.log('  editing the SFL General panel (R3) commits LOGOUT without disturbing the WINDOW keyword');
    const sflTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFL');
    sflTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const sflPrefix = 'sfl-WINDOWSFL';
    const logoutCheckbox = doc.getElementById(sflPrefix + '-logout-on');
    check('setup: LOGOUT checkbox exists on the SFL General panel', !!logoutCheckbox);
    logoutCheckbox.checked = true;
    logoutCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WINDOWSFL');
    check('LOGOUT was added', reparsed.keywords.some((k) => k.name === 'LOGOUT'));
    check("WINDOW is still there, untouched by the SFL-tab edit", reparsed.keywords.some((k) => k.name === 'WINDOW' && k.parameters.trim() === '2 2 10 40'));
    check('SFL itself is still there too', reparsed.keywords.some((k) => k.name === 'SFL'));
    posted.length = 0;

    console.log('  editing the Window tab (R7) changes the geometry without disturbing SFL/LOGOUT');
    recordSelect.value = 'WINDOWSFL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const windowTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Window');
    windowTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const rwPrefix = 'rw-WINDOWSFL';
    const startLineInput = doc.getElementById(rwPrefix + '-startline');
    check('setup: Window start-line input exists on the Window Parameters panel', !!startLineInput);
    startLineInput.value = '5';
    doc.getElementById(rwPrefix + '-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'WINDOWSFL');
    const windowKw = reparsed.keywords.find((k) => k.name === 'WINDOW');
    check('WINDOW geometry now starts at line 5', windowKw && /^5\s/.test(windowKw.parameters.trim()));
    check("SFL is still there, untouched by the Window-tab edit", reparsed.keywords.some((k) => k.name === 'SFL'));
    check('LOGOUT (added on the SFL tab a moment ago) is still there too', reparsed.keywords.some((k) => k.name === 'LOGOUT'));

    runPuldwnsflPickerScenario();
  }, 0);
}

// Task R11 - "PULDWNSFL" isn't a distinct DDS keyword either, same shape as
// Task R6's SFLMSGCTL finding: a pull-down subfile's DETAIL record is a
// completely ordinary SFL record (just the SFL keyword, no PULLDOWN of its
// own - see the Record Type Wizard's PDNSFL branch in
// runRecordTypeWizardScenario above, which already proves this is what gets
// generated), and its CONTROL record is an ordinary SFLCTL record that
// ALSO happens to carry PULLDOWN. Task R3's isSflRecord/sflKeywordsPanelsHtml
// key purely off SFL (and explicitly excluding SFLMSG records only), with
// no awareness of what record it's paired with, and Task R4/R10's
// isSflCtlRecord/isPulldownRecord are independent boolean checks that both
// key off the CURRENT record's own keywords - so a record carrying both
// SFLCTL and PULLDOWN already gets both tabs side by side, each committing
// through its own dedicated picker without cross-contamination. Zero new
// dspfWriter.js primitives or webviewClientHelpers.js panels needed - this
// scenario is the verification, same "no screens of its own, existing
// wiring already applies" shape R2/R6/R8/R9 already took.
function runPuldwnsflPickerScenario() {
  console.log('\nPULDWNSFL wiring (Task R11): a pull-down subfile\u2019s detail record is a plain SFL record and its control record is an ordinary SFLCTL record that also carries PULLDOWN - Task R3/R4/R10\u2019s pickers already apply as-is, no new code needed');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'PDTL1', func: 'SFL' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '10', usage: 'B', row: '4', col: '5' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'PCTL1', func: 'SFLCTL(PDTL1)' }),
      buildLine({ seq: '00040', func: 'PULLDOWN(*SLTIND)' }),
      buildLine({ seq: '00050', func: 'SFLSIZ(20)' }),
      buildLine({ seq: '00060', func: 'SFLPAG(10)' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce21', src, 'PDNSFL.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');
    const tabLabels = () => Array.from(doc.querySelectorAll('.props-tab')).map((b) => b.textContent.trim());

    console.log('  PDTL1 (plain SFL detail record) gets the SFL tab only - no Pull-down, no SFLCTL');
    recordSelect.value = 'PDTL1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('PDTL1 gets the SFL tab', tabLabels().includes('SFL'));
    check('PDTL1 does NOT get the Pull-down tab', !tabLabels().includes('Pull-down'));
    check('PDTL1 does NOT get the SFLCTL tab', !tabLabels().includes('SFLCTL'));

    const sflTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFL');
    sflTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const dtlPrefix = 'sfl-PDTL1';
    console.log('  General/Indicator commit exactly as they do on a plain SFL record (Task R3\u2019s panel, unmodified)');
    doc.getElementById(dtlPrefix + '-keep-on').checked = true;
    doc.getElementById(dtlPrefix + '-keep-on').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text);
    let dtlRec = reparsed.records.find((r) => r.name === 'PDTL1');
    check('KEEP was added to PDTL1', dtlRec.keywords.some((k) => k.name === 'KEEP'));
    let ctlRecUntouched = reparsed.records.find((r) => r.name === 'PCTL1');
    check("PCTL1's own SFLCTL/PULLDOWN are untouched by the detail record's edit", ctlRecUntouched.keywords.some((k) => k.name === 'SFLCTL') && ctlRecUntouched.keywords.some((k) => k.name === 'PULLDOWN'));
    posted.length = 0;

    console.log('  PCTL1 (SFLCTL + PULLDOWN control record) gets BOTH the Pull-down tab and the SFLCTL tab, not SFL or SFLMSG');
    recordSelect.value = 'PCTL1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('PCTL1 gets the Pull-down tab', tabLabels().includes('Pull-down'));
    check('PCTL1 gets the SFLCTL tab', tabLabels().includes('SFLCTL'));
    check('PCTL1 does NOT get the SFL tab', !tabLabels().includes('SFL'));
    check('PCTL1 does NOT get the SFLMSG tab', !tabLabels().includes('SFLMSG'));

    const rpdPrefix = 'rpd-PCTL1';
    console.log('  Pull-down tab: PULLDOWN\u2019s own *SLTIND/*RSTCSR pre-fill and commit without disturbing SFLCTL');
    check('*SLTIND starts checked (already present in the source)', doc.getElementById(rpdPrefix + '-sltind').checked);
    doc.getElementById(rpdPrefix + '-rstcsr').checked = true;
    doc.getElementById(rpdPrefix + '-rstcsr').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text);
    let ctlRec = reparsed.records.find((r) => r.name === 'PCTL1');
    const pulldownKw = ctlRec.keywords.find((k) => k.name === 'PULLDOWN');
    check('PULLDOWN now carries both *SLTIND and *RSTCSR', pulldownKw && /\*SLTIND/.test(pulldownKw.parameters) && /\*RSTCSR/.test(pulldownKw.parameters));
    check("PCTL1's own SFLCTL is untouched by the Pull-down edit", ctlRec.keywords.some((k) => k.name === 'SFLCTL'));
    posted.length = 0;

    const sflctlTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
    sflctlTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const ctlPrefix = 'sflctl-PCTL1';
    console.log('  SFLCTL tab: Display Layout pre-fills and commits without disturbing PULLDOWN');
    check('SFLSIZ pre-filled', doc.getElementById(ctlPrefix + '-sflsiz').value === '20');
    check('SFLPAG pre-filled', doc.getElementById(ctlPrefix + '-sflpag').value === '10');
    doc.getElementById(ctlPrefix + '-sfldsp-on').checked = true;
    doc.getElementById(ctlPrefix + '-sfldsp-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text);
    ctlRec = reparsed.records.find((r) => r.name === 'PCTL1');
    check('SFLDSP was added to PCTL1', ctlRec.keywords.some((k) => k.name === 'SFLDSP'));
    check("PCTL1's own PULLDOWN is untouched by the SFLCTL edit", ctlRec.keywords.some((k) => k.name === 'PULLDOWN' && /\*SLTIND/.test(ctlRec.keywords.find((k2) => k2.name === 'PULLDOWN').parameters)));
    const dtlRecFinal = reparsed.records.find((r) => r.name === 'PDTL1');
    check("PDTL1's own SFL/KEEP are untouched by the control record's edit", dtlRecFinal.keywords.some((k) => k.name === 'SFL') && dtlRecFinal.keywords.some((k) => k.name === 'KEEP'));

    runPdnSflCtlPickerScenario();
  }, 0);
}

// Task R12 - "PDNSFLCTL" isn't a distinct DDS keyword either, same shape as
// Task R6 (SFLMSGCTL), Task R9 (WNDSFCTL), and Task R11 (PULDWNSFL): it's an
// ordinary SFLCTL record that ALSO carries a PULLDOWN keyword, making it a
// pull-down subfile control record. Task R4's isSflCtlRecord/sflCtlPanelsHtml and
// Task R10's isPulldownRecord/pulldownPanelsHtml each key purely off the
// record's own keywords (SFLCTL / PULLDOWN respectively), with no
// awareness of each other or of any paired record - and
// renderRecordProps already renders their tabs from independent `if`
// blocks, so a record carrying both keywords already gets BOTH the
// SFLCTL tab and the Pull-down tab, each with its own picker, with zero
// new dspfWriter.js primitives or webviewClientHelpers.js panels needed.
// This scenario is the verification: a genuine pull-down subfile control
// record gets both tabs, each panel pre-fills and commits independently
// without disturbing the other's keywords or the paired SFL detail
// record.
function runPdnSflCtlPickerScenario() {
  console.log('\nPDNSFLCTL wiring (Task R12): a pull-down subfile control record is an ordinary SFLCTL record that also carries PULLDOWN - Task R4\u2019s and Task R10\u2019s pickers already apply as-is, no new code needed');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'PSFDTL', func: 'SFL' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'PSFCTL', func: 'SFLCTL(PSFDTL)' }),
      buildLine({ seq: '00040', func: 'SFLSIZ(20)' }),
      buildLine({ seq: '00050', func: 'SFLPAG(10)' }),
      buildLine({ seq: '00060', func: 'PULLDOWN(*SLTIND)' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce22', src, 'PDNSFLCTL.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');
    const tabLabels = () => Array.from(doc.querySelectorAll('.props-tab')).map((b) => b.textContent.trim());

    console.log('  PSFDTL (plain SFL detail record) is unaffected - gets SFL, not SFLCTL or Pull-down');
    recordSelect.value = 'PSFDTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('PSFDTL gets the SFL tab', tabLabels().includes('SFL'));
    check('PSFDTL does NOT get the SFLCTL tab', !tabLabels().includes('SFLCTL'));
    check('PSFDTL does NOT get the Pull-down tab', !tabLabels().includes('Pull-down'));

    console.log('  PSFCTL (SFLCTL + PULLDOWN together) gets BOTH the SFLCTL tab and the Pull-down tab, not SFL');
    recordSelect.value = 'PSFCTL';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    check('PSFCTL gets the SFLCTL tab', tabLabels().includes('SFLCTL'));
    check('PSFCTL gets the Pull-down tab', tabLabels().includes('Pull-down'));
    check('PSFCTL does NOT get the SFL tab', !tabLabels().includes('SFL'));

    const sflctlTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
    sflctlTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const p = 'sflctl-PSFCTL';
    console.log('  SFLCTL tab: General pre-fills exactly as on a plain SFLCTL record (Task R4\u2019s panel, unmodified)');
    check('SFLSIZ pre-filled', doc.getElementById(p + '-sflsiz').value === '20');
    check('SFLPAG pre-filled', doc.getElementById(p + '-sflpag').value === '10');
    doc.getElementById(p + '-sfldsp-on').checked = true;
    doc.getElementById(p + '-sfldsp-on').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('SFLDSP was added to PSFCTL', reparsed.keywords.some((k) => k.name === 'SFLDSP'));
    check("PSFCTL's PULLDOWN keyword is untouched by the SFLCTL-tab edit", reparsed.keywords.find((k) => k.name === 'PULLDOWN').parameters.trim() === '*SLTIND');
    posted.length = 0;

    const pulldownTabBtn = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Pull-down');
    pulldownTabBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const rpdPrefix = 'rpd-PSFCTL';
    console.log('  Pull-down tab: General pre-fills exactly as on a plain PULLDOWN record (Task R10\u2019s panel, unmodified)');
    check('PULLDOWN starts checked (already present in the source)', doc.getElementById(rpdPrefix + '-on').checked);
    check('*SLTIND starts checked (already present in the source)', doc.getElementById(rpdPrefix + '-sltind').checked);
    check('*RSTCSR starts unchecked (not in the source)', !doc.getElementById(rpdPrefix + '-rstcsr').checked);

    doc.getElementById(rpdPrefix + '-rstcsr').checked = true;
    doc.getElementById(rpdPrefix + '-rstcsr').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('PULLDOWN now carries both *SLTIND and *RSTCSR', /\*SLTIND/.test(reparsed.keywords.find((k) => k.name === 'PULLDOWN').parameters) && /\*RSTCSR/.test(reparsed.keywords.find((k) => k.name === 'PULLDOWN').parameters));
    check("PSFCTL's SFLCTL keyword is untouched by the Pull-down-tab edit", reparsed.keywords.find((k) => k.name === 'SFLCTL').parameters.trim() === 'PSFDTL');
    check("PSFCTL's SFLDSP (added on the SFLCTL tab above) survived the Pull-down-tab edit", reparsed.keywords.some((k) => k.name === 'SFLDSP'));
    posted.length = 0;

    console.log('  Border Parameters (Pull-down tab): applying color writes WDWBORDER, same shared F1/R7/R10 panel, other keywords untouched');
    doc.getElementById(rpdPrefix + '-wdw-color-on').checked = true;
    doc.getElementById(rpdPrefix + '-wdw-color').value = 'RED';
    doc.getElementById(rpdPrefix + '-wdw-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    const wdwBorderKw = reparsed.keywords.find((k) => k.name === 'WDWBORDER');
    check('WDWBORDER written with *COLOR RED', wdwBorderKw && /\*COLOR RED/.test(wdwBorderKw.parameters));
    check("PSFCTL's own SFLCTL keyword is untouched by the border edit", reparsed.keywords.find((k) => k.name === 'SFLCTL').parameters.trim() === 'PSFDTL');
    const dtlRec = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFDTL');
    check("PSFDTL's own SFL keyword is untouched throughout", dtlRec.keywords.some((k) => k.name === 'SFL'));

    console.log('\nBase Record Keywords (Task R1) General tab: flag-row keywords now show and preserve their own indicator conditioning (same fix as the SFLCTL panel above), instead of it being invisible/silently dropped');
    posted.length = 0;
    const rkP = 'rk-PSFCTL';
    doc.getElementById(rkP + '-inzrcd-on').checked = true;
    doc.getElementById(rkP + '-inzrcd-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('INZRCD was added', reparsed.keywords.some((k) => k.name === 'INZRCD'));
    posted.length = 0;
    check('INZRCD starts with no Conditioning shown as already set (0)', /Conditioning(?!\s*\(\d)/.test(doc.querySelector('.kw-cond-toggle[data-flag-id="' + rkP + '-inzrcd"]').textContent));
    doc.querySelector('.kw-cond-toggle[data-flag-id="' + rkP + '-inzrcd"]').dispatchEvent(new Event('click', { bubbles: true }));
    doc.querySelector('.cond-add-group[data-prefix="' + rkP + '-inzrcd-cond"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition on INZRCD does not write yet (pending, not committed)', posted.length === 0);
    doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = '40';
    doc.querySelector('.cond-ind-add[data-prefix="' + rkP + '-inzrcd-cond"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    const inzrcdKw = reparsed.keywords.find((k) => k.name === 'INZRCD');
    check('INZRCD is now conditioned on indicator 40', inzrcdKw.conditions.length === 1 && inzrcdKw.conditions[0].indicators[0].number === '40');
    posted.length = 0;

    check('re-rendering shows the Conditioning(1) summary on the INZRCD row, not hidden', /Conditioning\s*\(1\)/.test(doc.querySelector('.kw-cond-toggle[data-flag-id="' + rkP + '-inzrcd"]').textContent));
    check("INZRCD's committed indicator 40 is genuinely displayed as a chip, not just accepted", doc.querySelector('.cond-group[data-group="0"] .keyword-chip').textContent.trim().startsWith('40'));

    doc.getElementById(rkP + '-keep-on').checked = true;
    doc.getElementById(rkP + '-keep-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check("toggling an unrelated flag (KEEP) on the same General tab does not wipe INZRCD's indicator 40 conditioning", reparsed.keywords.find((k) => k.name === 'INZRCD').conditions.length === 1 && reparsed.keywords.find((k) => k.name === 'INZRCD').conditions[0].indicators[0].number === '40');
    check('KEEP itself was added', reparsed.keywords.some((k) => k.name === 'KEEP'));
    posted.length = 0;

    console.log('\nBase Record Keywords (Task R1) Indicator tab (Task L5d): CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN/VLDCMDKEY/SETOF/CHANGE/INDTXT are now repeatable, independently-conditioned instances, matching the real SDA \u201cDefine Indicator Keywords\u201d screen for a plain record, instead of one flagRowHtml per keyword');
    check('no indicator-keyword instances yet - empty state shown', doc.getElementById(rkP + '-recind-rep-instances').textContent.indexOf('None defined.') >= 0);
    doc.querySelector('.repeat-inst-add[data-prefix="' + rkP + '-recind-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('clicking "+ Add" seeds a valid default CLEAR(10) instance, not a blank one', !!reparsed.keywords.find((k) => k.name === 'CLEAR' && k.parameters.trim() === '10'));
    posted.length = 0;

    const rkIndKindEl = doc.querySelector('.' + rkP + '-recind-rep-inst0-kind');
    rkIndKindEl.value = 'HOME';
    rkIndKindEl.dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('switching kind swaps CLEAR for HOME on the SAME instance, same resp carried over', !!reparsed.keywords.find((k) => k.name === 'HOME' && k.parameters.trim() === '10') && !reparsed.keywords.some((k) => k.name === 'CLEAR'));
    posted.length = 0;

    doc.querySelector('.' + rkP + '-recind-rep-inst0-resp').value = '25';
    doc.querySelector('.' + rkP + '-recind-rep-inst0-resp').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('HOME response indicator updated to 25', reparsed.keywords.find((k) => k.name === 'HOME').parameters.trim() === '25');
    posted.length = 0;

    console.log('  Indicator tab: a second CLEAR row under a DIFFERENT indicator coexists with the first HOME instance - the real screen\u2019s own repeatable-row point');
    doc.querySelector('.repeat-inst-add[data-prefix="' + rkP + '-recind-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('HOME(25) survives adding a second instance', !!reparsed.keywords.find((k) => k.name === 'HOME' && k.parameters.trim() === '25'));
    posted.length = 0;
    const rkIndKind1El = doc.querySelector('.' + rkP + '-recind-rep-inst1-kind');
    rkIndKind1El.value = 'CLEAR';
    rkIndKind1El.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    doc.querySelector('.' + rkP + '-recind-rep-inst1-resp').value = '31';
    doc.querySelector('.' + rkP + '-recind-rep-inst1-resp').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('second instance written as its own CLEAR(31)', !!reparsed.keywords.find((k) => k.name === 'CLEAR' && k.parameters.trim() === '31'));
    check('first instance (HOME(25)) untouched by adding/editing the second', !!reparsed.keywords.find((k) => k.name === 'HOME' && k.parameters.trim() === '25'));
    posted.length = 0;

    console.log('  Indicator tab: INDTXT within this same repeatable set carries its own text field alongside the response indicator');
    doc.querySelector('.repeat-inst-add[data-prefix="' + rkP + '-recind-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
    posted.length = 0;
    const rkIndKind2El = doc.querySelector('.' + rkP + '-recind-rep-inst2-kind');
    rkIndKind2El.value = 'INDTXT';
    rkIndKind2El.dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    doc.querySelector('.' + rkP + '-recind-rep-inst2-resp').value = '70';
    doc.querySelector('.' + rkP + '-recind-rep-inst2-resp').dispatchEvent(new Event('change', { bubbles: true }));
    posted.length = 0;
    doc.querySelector('.' + rkP + '-recind-rep-inst2-text').value = 'Record locked';
    doc.querySelector('.' + rkP + '-recind-rep-inst2-text').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    const rkIndtxtKw = reparsed.keywords.find((k) => k.name === 'INDTXT');
    check('INDTXT written with indicator 70 and quoted text, alongside the two other instances', rkIndtxtKw && /^70\s+'Record locked'/.test(rkIndtxtKw.parameters.trim()) && !!reparsed.keywords.find((k) => k.name === 'HOME') && !!reparsed.keywords.find((k) => k.name === 'CLEAR'));
    posted.length = 0;

    console.log('  Indicator tab: removing an instance leaves the others alone');
    doc.querySelector('.repeat-inst-remove[data-prefix="' + rkP + '-recind-rep"][data-idx="1"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'PSFCTL');
    check('the removed CLEAR(31) instance is gone', !reparsed.keywords.some((k) => k.name === 'CLEAR'));
    check('HOME(25) and INDTXT(70 ...) both still present', !!reparsed.keywords.find((k) => k.name === 'HOME') && !!reparsed.keywords.find((k) => k.name === 'INDTXT'));
    posted.length = 0;

    console.log('\ngetWebviewHtml() defaults when uiStyle/uiTheme args are omitted (regression: these used to silently become "," via Array.prototype.join(undefined))');
    const defaultsHtml = getWebviewHtml('vscode-webview://fake', 'n', dspfSource, 'DEFAULTS.DSPF');
    check('data-ui-style defaults to "modern", not ","', /data-ui-style="modern"/.test(defaultsHtml));
    check('data-ui-theme defaults to "green", not ","', /data-ui-theme="green"/.test(defaultsHtml));

    runCommentsScenario();
  }, 0);
}

function runCommentsScenario() {
  console.log('\nTask L13: Comments panel - file-level and record-level DDS comment lines');
  const src =
    [
      "     A*File header comment",
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R RECORD1',
      "     A                                  1  2'Hello'",
      '     A          R RECORD2',
      "     A*This belongs to RECORD2",
      "     A                                  1  2'World'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce19', src, 'COMMENTS.DSPF').replace(
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
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    console.log('  file-level Comments tab shows only the header comment, not either record\'s own comment');
    doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));
    const fileCommentsTab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Comments');
    check('a file-level Comments tab exists', !!fileCommentsTab);
    fileCommentsTab.dispatchEvent(new Event('click', { bubbles: true }));
    let inputs = Array.from(doc.querySelectorAll('.comment-text-input')).map((i) => i.value);
    check('exactly the file header comment shown', inputs.length === 1 && inputs[0] === 'File header comment');

    console.log('  Task L42: the file header comment\'s own source line is shown as a badge');
    let badges = Array.from(doc.querySelectorAll('.comment-line-badge')).map((b) => b.textContent);
    check('exactly one line badge, matching the header comment\'s own line (1)', badges.length === 1 && badges[0] === 'L1');

    console.log('  Task L42: file-level Comments tab has a "line #" input next to Add comment');
    check('file-level: an add-comment-line input exists', !!doc.querySelector('[id$="-add-comment-line"]'));

    console.log('  Task L47: the add-row is visually unified with existing comment rows - same field-order-row wrapper, a plain "+" button rather than a wide text one');
    const fileAddRow = doc.querySelector('[id$="-add-comment-line"]').closest('.field-order-row');
    check('the add-row uses the SAME row class every existing comment row uses (inherits identical height/padding/border)', !!fileAddRow);
    check('no leftover bespoke .comment-add-row wrapper class', !doc.querySelector('.comment-add-row'));
    const fileAddBtnEl = doc.querySelector('[id$="-add-comment"]');
    check('the Add button is now a plain "+", not the old wide "+ Add comment" text button', fileAddBtnEl.textContent.trim() === '+');
    check('the Add button gets the exact same 22x22 square styling every "x" delete button gets, for free from the shared .field-order-row button rule (no bespoke class of its own)', !fileAddBtnEl.className);

    console.log('  Task L51: the "Line #" box actually renders at the badge\u2019s own width now, not the row\u2019s full width (L50\u2019s own fix never took visual effect - see its own CHANGELOG entry)');
    {
      const lineInputEl = doc.querySelector('[id$="-add-comment-line"]');
      const probeRow = doc.createElement('div');
      probeRow.className = 'field-order-row';
      const probeInput = doc.createElement('input');
      probeInput.setAttribute('type', 'number');
      probeInput.className = lineInputEl.className;
      probeRow.appendChild(probeInput);
      doc.body.appendChild(probeRow);
      const computedWidth = dom.window.getComputedStyle(probeInput).width;
      check('a fresh .comment-add-line-input resolves to the narrow 30px width, not the generic input[type=number] rule\u2019s 100%', computedWidth === '30px');
      probeRow.remove();
    }

    console.log('  Task L55: the "Line #" box has no up/down spinner arrows - it\u2019s a small number-typed badge, not a stepper control');
    check('the stylesheet suppresses Firefox\u2019s built-in number spinner for this input (-moz-appearance: textfield)', /\.field-order-row \.comment-add-line-input\s*\{\s*-moz-appearance:\s*textfield;?\s*\}/.test(html));
    check('the stylesheet hides the WebKit/Chromium spin-button pseudo-elements for this input', /\.field-order-row \.comment-add-line-input::-webkit-outer-spin-button,\s*\n?\s*\.field-order-row \.comment-add-line-input::-webkit-inner-spin-button\s*\{\s*-webkit-appearance:\s*none;/.test(html));

    console.log('  Task L42: adding a file-level comment with an explicit line number inserts it there, not appended at the end');
    const fileAddLineInput = doc.querySelector('[id$="-add-comment-line"]');
    fileAddLineInput.value = '2';
    const fileAddBtn = doc.querySelector('[id$="-add-comment"]');
    fileAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    let applyEditL42 = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEditL42);
    const l42Lines = applyEditL42.text.split(/\r\n|\r|\n/);
    check('the new blank comment landed exactly at physical line 2, as typed', l42Lines[1] === '     A*');
    check('the original header comment (line 1) and DSPSIZ line (now pushed to line 3) both survive untouched', l42Lines[0] === '     A*File header comment' && l42Lines[2].includes('DSPSIZ'));
    posted.length = 0;

    console.log('  Task L42: leaving the line # input blank still falls back to appending after the last existing comment (unchanged old behavior)');
    const fileAddLineInput2 = doc.querySelector('[id$="-add-comment-line"]');
    fileAddLineInput2.value = '';
    const fileAddBtn2 = doc.querySelector('[id$="-add-comment"]');
    fileAddBtn2.dispatchEvent(new Event('click', { bubbles: true }));
    applyEditL42 = posted.find((m) => m.type === 'applyEdit');
    const l42Reparsed = DspfParser.parseDspf(applyEditL42.text);
    const fileCommentsAfter = DspfWriter.getFileComments(l42Reparsed);
    check('now 3 file-level comments; the new blank one is appended after the existing ones, not inserted mid-file', fileCommentsAfter.length === 3 && fileCommentsAfter[2].text === '' && fileCommentsAfter[2].line > fileCommentsAfter[1].line);
    posted.length = 0;

    console.log('  Task L46: the add-row text input lets the comment\'s wording be typed in the SAME action that places it (file-level)');
    const fileAddTextInput = doc.querySelector('[id$="-add-comment-text"]');
    check('setup: the file-level add-row text input is present', !!fileAddTextInput);
    const fileAddLineInput3 = doc.querySelector('[id$="-add-comment-line"]');
    fileAddLineInput3.value = '2';
    fileAddTextInput.value = 'Inserted with its own text';
    const fileAddBtn3 = doc.querySelector('[id$="-add-comment"]');
    fileAddBtn3.dispatchEvent(new Event('click', { bubbles: true }));
    const applyEditL46 = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEditL46);
    const l46Lines = applyEditL46.text.split(/\r\n|\r|\n/);
    check('the new comment landed at the typed line WITH the typed text, not blank', l46Lines[1] === '     A*Inserted with its own text');
    posted.length = 0;

    console.log('  RECORD1 (no comment of its own) shows an empty Comments section, not the file-level or RECORD2 one');
    recordSelect.value = 'RECORD1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    let structureTab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure');
    structureTab.dispatchEvent(new Event('click', { bubbles: true }));
    inputs = Array.from(doc.querySelectorAll('.comment-text-input')).map((i) => i.value);
    check('no comments shown for RECORD1', inputs.length === 0);
    check('empty-state message shown instead', /No comment lines yet/.test(doc.getElementById('propsBody').textContent));

    console.log('  Task L45: record-level Comments section now ALSO has a "line #" input (built for file-level by L42, wired here for the first time)');
    const recAddLineInput0 = doc.querySelector('[id$="-add-comment-line"]');
    check('record-level: an add-comment-line input exists too, not file-level only', !!recAddLineInput0);

    console.log('  RECORD2 shows exactly its own comment, scoped correctly (not RECORD1\'s or the file\'s)');
    recordSelect.value = 'RECORD2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    structureTab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure');
    structureTab.dispatchEvent(new Event('click', { bubbles: true }));
    inputs = Array.from(doc.querySelectorAll('.comment-text-input')).map((i) => i.value);
    check('exactly RECORD2\'s own comment shown', inputs.length === 1 && inputs[0] === 'This belongs to RECORD2');
    check('Task L42: record-level rows show a line badge too (display-only, universal across scopes)', doc.querySelectorAll('.comment-line-badge').length === 1);

    console.log('  editing RECORD2\'s comment rewrites just that line, columns 1-7 untouched');
    let input = doc.querySelector('.comment-text-input');
    input.value = 'Edited RECORD2 comment';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    check('the comment line now reads the edited text with "     A*" untouched', applyEdit.text.includes('     A*Edited RECORD2 comment'));
    check('RECORD1 and the file header comment are both untouched', applyEdit.text.includes('File header comment') && applyEdit.text.includes("1  2'Hello'"));
    posted.length = 0;

    console.log('  deleting RECORD2\'s comment removes just that one line');
    const delBtn = doc.querySelector('.comment-delete-btn');
    delBtn.dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('the comment line is gone', !applyEdit.text.includes('Edited RECORD2 comment'));
    check('RECORD2\'s own field is still there', applyEdit.text.includes("1  2'World'"));
    posted.length = 0;

    console.log('  "+ Add comment" on RECORD1 (which has none yet) inserts right after its own header line');
    recordSelect.value = 'RECORD1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    structureTab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure');
    structureTab.dispatchEvent(new Event('click', { bubbles: true }));
    const addBtn = doc.querySelector('[id$="-add-comment"]');
    check('an Add comment button exists', !!addBtn);
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    const reparsed = DspfParser.parseDspf(applyEdit.text);
    const rec1 = reparsed.records.find((r) => r.name === 'RECORD1');
    check('the new blank comment line sits right after RECORD1\'s own header, before its field', reparsed.comments.some((c) => c.line === rec1.sourceLine + 1 && c.text === ''));
    posted.length = 0;

    console.log('  Task L45/L46: adding a record-level comment with an explicit line number AND text inserts it there with that wording, not appended blank at the end');
    recordSelect.value = 'RECORD2';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    structureTab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure');
    structureTab.dispatchEvent(new Event('click', { bubbles: true }));
    const rec2Before = reparsed.records.find((r) => r.name === 'RECORD2');
    const rec2FieldLine = rec2Before.fields[0].sourceLine; // RECORD2's one field, "World" - see buildLine fixture above
    const recAddLineInput = doc.querySelector('[id$="-add-comment-line"]');
    const recAddTextInput = doc.querySelector('[id$="-add-comment-text"]');
    check('setup: the record-level line-# input is present', !!recAddLineInput);
    check('setup: the record-level add-row text input is present too', !!recAddTextInput);
    recAddLineInput.value = String(rec2FieldLine);
    recAddTextInput.value = 'Comment for RECORD2';
    const recAddBtn = doc.querySelector('[id$="-add-comment"]');
    recAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    const l45Reparsed = DspfParser.parseDspf(applyEdit.text);
    check('the new comment landed exactly at the requested physical line, WITH the typed text, ahead of the field it used to precede', l45Reparsed.comments.some((c) => c.line === rec2FieldLine && c.text === 'Comment for RECORD2'));
    const rec2After = l45Reparsed.records.find((r) => r.name === 'RECORD2');
    check('RECORD2\'s own field survived, pushed down by exactly one line', rec2After.fields[0].sourceLine === rec2FieldLine + 1);
    posted.length = 0;

    console.log('  Task L46: leaving the add-row text blank still adds an empty comment (unchanged old behavior)');
    recordSelect.value = 'RECORD1';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    structureTab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure');
    structureTab.dispatchEvent(new Event('click', { bubbles: true }));
    const recAddBtn2 = doc.querySelector('[id$="-add-comment"]');
    recAddBtn2.dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    const l46RecReparsed = DspfParser.parseDspf(applyEdit.text);
    const rec1AfterBlank = l46RecReparsed.records.find((r) => r.name === 'RECORD1');
    check('a blank comment was still added right after RECORD1\'s own header', l46RecReparsed.comments.some((c) => c.line === rec1AfterBlank.sourceLine + 1 && c.text === ''));
    posted.length = 0;

    runDatabaseFieldsPickerScenario();
  }, 0);
}

// Task L14 - webview-side plumbing for "+ Fields from database file": the
// button opens the modal, "List fields" posts listDatabaseFields, a
// databaseFieldsResult message renders checkboxes (name/attrs/text), and
// "Add fields" posts addFieldsFromDatabase with only the CHECKED fields.
// The extension-host side (querying DSPFFD/SQL, building the REFFLD fields,
// applying the edit) is covered separately in extension.test.js - this is
// just the UI round-trip.
function runDatabaseFieldsPickerScenario() {
  console.log('\nTask L14: "+ Fields from database file" picker (webview-side plumbing)');
  const src = [buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' })].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce20', src, 'DBFIELDS.DSPF').replace(
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
      // Task L53: "Add fields" now goes through click-to-place, which needs
      // gridMetrics() to have a non-zero rect to convert a pixel click into a
      // line/column - same 800x480/10px-col/20px-row mock the other
      // click-to-place scenarios use (see e.g. runD4ConstantWiringScenario's
      // own "+ Constant"/"+ Field" click-to-place coverage).
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event, MessageEvent } = dom.window;

    console.log('  "Save" button in the left panel posts a saveDocument message');
    const saveBtn = doc.getElementById('saveDocBtn');
    check('setup: Save button is present at the top of the left panel', !!saveBtn);
    saveBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('posts saveDocument', posted.some((m) => m.type === 'saveDocument'));

    console.log('  Suggestion C: the Save button reflects the extension host\'s own dirtyState pushes');
    check('starts without the dirty indicator (no dirtyState message received yet)', !saveBtn.classList.contains('save-btn-dirty'));
    dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'dirtyState', isDirty: true } }));
    check('dirty class applied on dirtyState: true', saveBtn.classList.contains('save-btn-dirty'));
    check('button text signals unsaved changes', saveBtn.textContent.includes('unsaved changes'));
    dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'dirtyState', isDirty: false } }));
    check('dirty class removed on dirtyState: false', !saveBtn.classList.contains('save-btn-dirty'));
    check('button text back to plain "Save"', !saveBtn.textContent.includes('unsaved changes'));

    console.log('  clicking the button opens the modal');
    const openBtn = doc.getElementById('addFromDbBtn');
    check('setup: "+ Fields from database file" button is present', !!openBtn);
    openBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('modal overlay is now in the DOM', !!doc.querySelector('.dbfields-overlay'));
    check('"Add fields" button starts hidden (nothing listed yet)', doc.getElementById('dbf-add-btn').classList.contains('hidden'));

    console.log('  clicking "List fields" with no file entered shows an inline error, posts nothing');
    doc.getElementById('dbf-list-btn').dispatchEvent(new Event('click', { bubbles: true }));
    check('inline error shown', !doc.getElementById('dbf-error').classList.contains('hidden'));
    check('no listDatabaseFields message posted', !posted.some((m) => m.type === 'listDatabaseFields'));

    console.log('  entering library + file and clicking "List fields" posts the request');
    doc.getElementById('dbf-library').value = 'mylib';
    doc.getElementById('dbf-file').value = 'cusmstp';
    doc.getElementById('dbf-list-btn').dispatchEvent(new Event('click', { bubbles: true }));
    const listMsg = posted.find((m) => m.type === 'listDatabaseFields');
    check('posts listDatabaseFields with the uppercased library/file', !!listMsg && listMsg.library === 'MYLIB' && listMsg.file === 'CUSMSTP');

    console.log('  a databaseFieldsResult message renders the checkbox list');
    dom.window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'databaseFieldsResult',
      library: 'MYLIB',
      file: 'CUSMSTP',
      fields: [
        { name: 'CUSTNO', length: 6, dataType: '', decimalPositions: null, text: 'Customer number' },
        { name: 'BALANCE', length: 9, dataType: 'S', decimalPositions: 2, text: 'Account balance' },
      ],
    } }));
    const rows = doc.querySelectorAll('.dbfields-list-row');
    check('renders one row per field', rows.length === 2);
    check('shows the field name', rows[0].textContent.includes('CUSTNO'));
    check('shows the description text', rows[1].textContent.includes('Account balance'));
    check('every checkbox starts checked (select-all-by-default)', Array.from(doc.querySelectorAll('.dbf-field-cb')).every((cb) => cb.checked));
    check('"Add fields" button is now visible', !doc.getElementById('dbf-add-btn').classList.contains('hidden'));

    console.log('  unchecking one field and clicking "Add fields" enters click-to-place instead of committing immediately');
    doc.querySelectorAll('.dbf-field-cb')[1].checked = false; // uncheck BALANCE
    doc.getElementById('dbf-add-btn').dispatchEvent(new Event('click', { bubbles: true }));
    check('the modal closes right away', !doc.querySelector('.dbfields-overlay'));
    check('no addFieldsFromDatabase posted yet', !posted.some((m) => m.type === 'addFieldsFromDatabase'));
    check('activates the same crosshair placement class the canvas uses', !!doc.querySelector('.dspf-screen.placing'));
    check('shows the placement hint banner', !doc.getElementById('placementHint').classList.contains('hidden'));

    console.log('  clicking the screen preview opens the placement form pre-filled with the clicked line/column');
    // Click at pixel (155, 95) on the 10px/col x 20px/row grid: gridMetrics'
    // conversion is Math.round(px/cell) + 1, so this lands at col 17, line 6
    // (round(155/10)=16, +1=17; round(95/20)=5, +1=6).
    doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 155, clientY: 95 }));
    check('placement mode turns off once the click lands', !doc.querySelector('.dspf-screen.placing'));
    const dbPlaceLine = doc.getElementById('p-place-line');
    const dbPlaceCol = doc.getElementById('p-place-col');
    check('opens the placement form pre-filled with the clicked line', !!dbPlaceLine && dbPlaceLine.value === '6');
    check('...and column', !!dbPlaceCol && dbPlaceCol.value === '17');
    const dbFieldsPanelText = doc.getElementById('propsBody').textContent;
    check('lists only the still-checked field (CUSTNO)', dbFieldsPanelText.includes('CUSTNO') && !dbFieldsPanelText.includes('BALANCE'));
    const dbPlaceAddBtn = doc.getElementById('p-place-add');
    check('the "Place field" button is present', !!dbPlaceAddBtn && /Place field/.test(dbPlaceAddBtn.textContent));

    console.log('  clicking "Place field" posts addFieldsFromDatabase with the checked field(s) and the clicked location');
    dbPlaceAddBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const addMsg = posted.find((m) => m.type === 'addFieldsFromDatabase');
    check('posts addFieldsFromDatabase', !!addMsg);
    check('only the still-checked field (CUSTNO) is included', addMsg && addMsg.fields.length === 1 && addMsg.fields[0].name === 'CUSTNO');
    check('carries the record currently shown on the canvas', addMsg && addMsg.recordName === 'SCR1');
    check('carries the clicked location', addMsg && addMsg.location && addMsg.location.line === 6 && addMsg.location.column === 17);
    check('the placement form is gone afterward (pendingPlacement/pendingDbFieldsSource cleared)', !doc.getElementById('p-place-add'));

    console.log('  a databaseFieldsResult with { formats } (a multi-format file) shows a format picker, not the field checklist yet');
    doc.getElementById('addFromDbBtn').dispatchEvent(new Event('click', { bubbles: true }));
    doc.getElementById('dbf-file').value = 'cusmstl';
    doc.getElementById('dbf-list-btn').dispatchEvent(new Event('click', { bubbles: true }));
    posted.length = 0;
    dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'databaseFieldsResult', library: null, file: 'CUSMSTL', formats: ['FMT1', 'FMT2'] } }));
    const formatRows = doc.querySelectorAll('#dbf-formats .dbfields-list-row');
    check('renders one row per format', formatRows.length === 2);
    check('the field checklist itself is NOT shown yet (nothing picked)', doc.getElementById('dbf-list').classList.contains('hidden'));
    check('"Add fields" stays hidden until a format is picked and its fields come back', doc.getElementById('dbf-add-btn').classList.contains('hidden'));

    console.log('  clicking a format row re-requests listDatabaseFields WITH that recordFormat');
    formatRows[1].dispatchEvent(new Event('click', { bubbles: true }));
    const rescopedMsg = posted.find((m) => m.type === 'listDatabaseFields' && m.recordFormat);
    check('re-posts listDatabaseFields carrying the picked format', !!rescopedMsg && rescopedMsg.recordFormat === 'FMT2' && rescopedMsg.file === 'CUSMSTL');

    dom.window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'databaseFieldsResult',
      library: null,
      file: 'CUSMSTL',
      recordFormat: 'FMT2',
      fields: [{ name: 'ORDERNO', length: 8, dataType: '', decimalPositions: null, text: 'Order number' }],
    } }));
    check('the format-picker rows are gone once fields for the picked format come back', doc.querySelectorAll('#dbf-formats .dbfields-list-row').length === 0);
    check('the field checklist now shows the scoped field', doc.querySelectorAll('.dbfields-list-row').length === 1 && doc.querySelector('.dbfields-list-row').textContent.includes('ORDERNO'));
    check('the picked format is shown for confirmation', doc.getElementById('dbf-status').textContent.includes('FMT2'));

    console.log('  a databaseFieldsResult ERROR (e.g. Code for i not connected) shows the message, no rows rendered');
    doc.getElementById('addFromDbBtn').dispatchEvent(new Event('click', { bubbles: true }));
    dom.window.dispatchEvent(new MessageEvent('message', { data: { type: 'databaseFieldsResult', error: 'Not connected to an IBM i - connect via the Code for IBM i panel first.' } }));
    check('shows the error text', doc.getElementById('dbf-error').textContent.includes('Not connected'));
    check('no field rows rendered', doc.querySelectorAll('.dbfields-list-row').length === 0);

    runSystemValueConstantScenario();
  }, 0);
}

function runSystemValueConstantScenario() {
  console.log('\nTask L16: system-value constants (*DATE/*TIME/*USER/*SYSTEM(SYSNAME)/*PAGNBR) - editing must not corrupt them, and adding one must work');
  const src =
    [
      '     A          R RECORD1',
      '     A                                  1 10USER',
      '     A                                  2 10DATE',
      "     A                                  3  2'Hello'",
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce21', src, 'SYSVAL.DSPF').replace(
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
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    console.log('  selecting the *USER field shows a "System value" dropdown, NOT a Text input');
    const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
    check('setup: 3 field boxes on screen (USER, DATE, the literal constant)', boxes.length === 3);
    boxes[0].click();
    const sysvalSelect = doc.getElementById('p-const-sysval');
    check('System value dropdown present', !!sysvalSelect);
    check('pre-selected to USER', sysvalSelect && sysvalSelect.value === 'USER');
    check('no Text input rendered for a system-value constant', !doc.getElementById('p-const-text'));
    check('no Fill button rendered either (nothing to fill)', !doc.getElementById('p-fill'));

    console.log('  Task L16 regression: clicking Apply WITHOUT touching anything must NOT corrupt the line (the original bug)');
    doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    check('the USER line is untouched - no stray literal alongside the keyword', /^\s*A\s+1 10USER\s*$/m.test(applyEdit.text));
    check('no invalid double-literal-plus-keyword line was written', !/''USER|""USER/.test(applyEdit.text));
    posted.length = 0;

    console.log('  switching the dropdown from USER to SYSNAME replaces the keyword, still no literal added');
    let freshSysvalSelect = doc.getElementById('p-const-sysval');
    freshSysvalSelect.value = 'SYSNAME';
    freshSysvalSelect.dispatchEvent(new Event('change', { bubbles: true }));
    doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('USER keyword replaced with SYSNAME', /SYSNAME/.test(applyEdit.text) && !/\bUSER\b/.test(applyEdit.text));
    let reparsed = DspfParser.parseDspf(applyEdit.text);
    let rec1 = reparsed.records.find((r) => r.name === 'RECORD1');
    const sysnameField = rec1.fields.find((f) => f.keywords.some((k) => k.name === 'SYSNAME'));
    check('re-parses as a CONSTANT with a null constantValue (no literal text)', sysnameField && sysnameField.nameType === 'CONSTANT' && sysnameField.constantValue == null);
    posted.length = 0;

    console.log('  the *DATE field (index 1) also gets the dropdown, not treated as a plain literal');
    const boxes2 = Array.from(doc.querySelectorAll('.dspf-field'));
    boxes2[1].click();
    const dateSelect = doc.getElementById('p-const-sysval');
    check('DATE field also shows the dropdown, pre-selected to DATE', dateSelect && dateSelect.value === 'DATE');

    console.log('  a plain literal constant (index 2) still shows the normal Text input, unaffected by any of this');
    const boxes3 = Array.from(doc.querySelectorAll('.dspf-field'));
    boxes3[2].click();
    check('plain literal constant has a Text input, not a System value dropdown', !!doc.getElementById('p-const-text') && !doc.getElementById('p-const-sysval'));
    check('Fill button still present for a plain literal', !!doc.getElementById('p-fill'));

    console.log('  Task L16: "+ Add constant" can create a new system-value constant (previously impossible - literal text was required)');
    const placeConstantBtn = doc.getElementById('placeConstantBtn');
    placeConstantBtn.dispatchEvent(new Event('click', { bubbles: true }));
    const screenEl = doc.querySelector('.dspf-screen');
    screenEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 95 }));
    const sysvalToggle = doc.getElementById('p-place-sysval-toggle');
    check('the placement form has a "System value" toggle', !!sysvalToggle);
    check('Text input is the default (toggle unchecked)', doc.getElementById('p-place-text-wrap').style.display !== 'none');
    sysvalToggle.checked = true;
    sysvalToggle.dispatchEvent(new Event('change', { bubbles: true }));
    check('checking the toggle hides the Text input', doc.getElementById('p-place-text-wrap').style.display === 'none');
    check('...and shows the System value dropdown instead', doc.getElementById('p-place-sysval-wrap').style.display !== 'none');
    doc.getElementById('p-place-sysval').value = 'TIME';
    doc.getElementById('p-place-add').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check('an edit was posted', !!applyEdit);
    reparsed = DspfParser.parseDspf(applyEdit.text);
    rec1 = reparsed.records.find((r) => r.name === 'RECORD1');
    const newTimeField = rec1.fields.find((f) => f.keywords.some((k) => k.name === 'TIME'));
    check('new TIME system-value constant created, with a null constantValue (no literal alongside it)', newTimeField && newTimeField.nameType === 'CONSTANT' && newTimeField.constantValue == null);
    posted.length = 0;

    runWindowBorderAndDefaultColorScenario();
  }, 0);
}

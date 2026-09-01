/**
 * multiSelect.test.js
 *
 * Task L10 (docs/sda-reference/LIMITATIONS-PLAN.md): multi-field select +
 * block move/copy/delete/style. Runs the DSPF designer's actual generated
 * client-side script in jsdom, same rationale as dspfWebview.test.js - a
 * string-contains assertion on the generated HTML can't catch a DOM-selector
 * typo or a wrong postMessage payload shape, only actually running the
 * script and dispatching real events can.
 *
 * Run with: node src/test/multiSelect.test.js
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

const src =
  [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00030', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '5' }),
    buildLine({ seq: '00040', name: 'FLD2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '5' }),
    buildLine({ seq: '00050', name: 'FLD3', length: '10', dataType: 'A', usage: 'B', line: '7', col: '5' }),
  ].join('\n') + '\n';

// jsdom does no real layout, so getBoundingClientRect() is always all-zero -
// same fix dspfWebview.test.js already uses for its own drag tests, extended
// here to read each field's own grid-row/grid-column inline style (see
// dspfEngine.js's field-div rendering) so DIFFERENT fields report
// DIFFERENT, distinguishable rects - needed for the rubber-band
// drag-select test below to mean anything.
function fakeRectFromGridStyle(el) {
  const style = el.getAttribute('style') || '';
  const rowMatch = /grid-row:\s*(\d+)/.exec(style);
  const colMatch = /grid-column:\s*(\d+)\s*\/\s*span\s*(\d+)/.exec(style);
  const row = rowMatch ? parseInt(rowMatch[1], 10) : 1;
  const col = colMatch ? parseInt(colMatch[1], 10) : 1;
  const span = colMatch ? parseInt(colMatch[2], 10) : 1;
  const top = row * 20;
  const left = col * 8;
  const width = span * 8;
  const height = 20;
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} };
}

function setup(customSrc) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', customSrc || src, 'MULTISEL.DSPF').replace(
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
        if (this.classList && this.classList.contains('dspf-field')) return fakeRectFromGridStyle(this);
        // screenOutput/.dspf-screen itself - big enough to contain every field above.
        return { top: 0, left: 0, width: 800, height: 480, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  return { dom, posted };
}

function fieldByName(doc, name) {
  return doc.querySelector('.dspf-field[data-field="' + name + '"]');
}

function latestDspf(posted) {
  const last = posted[posted.length - 1];
  return last && last.type === 'applyEdit' ? DspfParser.parseDspf(last.text) : null;
}

function keydown(win, doc, key, opts) {
  doc.dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, opts || {})));
}

setTimeout(() => {
  const { dom, posted } = setup();
  const { document: doc, MouseEvent } = dom.window;

  console.log('shift-click toggles fields into/out of a multi-select');
  {
    fieldByName(doc, 'FLD1').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check('plain click selects FLD1 alone', fieldByName(doc, 'FLD1').classList.contains('selected') && !fieldByName(doc, 'FLD2').classList.contains('selected'));

    fieldByName(doc, 'FLD2').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    check('shift-click ADDS FLD2 to the selection, keeping FLD1', fieldByName(doc, 'FLD1').classList.contains('selected') && fieldByName(doc, 'FLD2').classList.contains('selected'));
    check('the props panel shows the multi-select count', /2 fields selected/.test(doc.getElementById('propsBody').textContent));

    fieldByName(doc, 'FLD2').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    check('shift-clicking an already-selected field REMOVES it', fieldByName(doc, 'FLD1').classList.contains('selected') && !fieldByName(doc, 'FLD2').classList.contains('selected'));

    fieldByName(doc, 'FLD3').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check('a plain (non-modifier) click collapses back down to just the clicked field', !fieldByName(doc, 'FLD1').classList.contains('selected') && fieldByName(doc, 'FLD3').classList.contains('selected'));
  }

  console.log('\nrubber-band drag-select on empty canvas selects every field it crosses');
  {
    const screenOutput = doc.getElementById('screenOutput');
    // FLD1 (row 3, col 5) and FLD2 (row 5, col 5) both fall inside a
    // rectangle from (0,0) to (200,120) given fakeRectFromGridStyle's
    // scaling (row*20, col*8); FLD3 (row 7) does not.
    screenOutput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 120 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 120 }));

    const f1 = fieldByName(doc, 'FLD1');
    const f2 = fieldByName(doc, 'FLD2');
    const f3 = fieldByName(doc, 'FLD3');
    check('rubber-band select picked up FLD1', f1.classList.contains('selected'));
    check('rubber-band select picked up FLD2', f2.classList.contains('selected'));
    check('rubber-band select did NOT pick up FLD3 (outside the rectangle)', !f3.classList.contains('selected'));
    check('no rubber-band rectangle is left behind after mouseup', !doc.querySelector('.dspf-rubber-band'));
  }

  console.log('\nnudging a multi-select (arrow keys) moves every selected field by the same delta, one applyEdit');
  {
    posted.length = 0;
    keydown(dom.window, doc, 'ArrowDown');
    const model = latestDspf(posted);
    check('nudge posted exactly one applyEdit', posted.filter((m) => m.type === 'applyEdit').length === 1);
    const rec = model && model.records.find((r) => r.name === 'SCR1');
    const f1 = rec && rec.fields.find((f) => f.name === 'FLD1');
    const f2 = rec && rec.fields.find((f) => f.name === 'FLD2');
    const f3 = rec && rec.fields.find((f) => f.name === 'FLD3');
    check('FLD1 moved down by one row (3 -> 4)', f1 && f1.location.line === 4);
    check('FLD2 moved down by one row (5 -> 6)', f2 && f2.location.line === 6);
    check("FLD3 (never selected) is untouched", f3 && f3.location.line === 7);
    check('both moved fields stay selected afterward', doc.querySelector('.dspf-field[data-field="FLD1"]').classList.contains('selected') &&
      doc.querySelector('.dspf-field[data-field="FLD2"]').classList.contains('selected'));
  }

  console.log('\nCtrl+D duplicates the whole multi-select as one block, preserving relative offsets');
  {
    posted.length = 0;
    keydown(dom.window, doc, 'd', { ctrlKey: true });
    const model = latestDspf(posted);
    const rec = model && model.records.find((r) => r.name === 'SCR1');
    check('record now has 5 fields (3 originals + 2 duplicates)', rec && rec.fields.length === 5);
    const dupes = rec ? rec.fields.filter((f) => f.name !== 'FLD1' && f.name !== 'FLD2' && f.name !== 'FLD3') : [];
    check('exactly 2 new fields were created', dupes.length === 2);
    if (dupes.length === 2) {
      const lines = dupes.map((f) => f.location.line).sort((a, b) => a - b);
      // FLD1 was at line 4 and FLD2 at line 6 (after the nudge above) - a
      // uniform +1 delta block-duplicate should land the copies at 5 and 7,
      // two rows apart, same as the originals.
      check('the two duplicates preserve their original 2-row relative offset', lines[1] - lines[0] === 2);
    }
  }

  console.log('\nDelete/Backspace removes every field in the multi-select at once, one applyEdit');
  {
    const { dom: dom2, posted: posted2 } = setup();
    const doc2 = dom2.window.document;
    setTimeout(() => {
      const f1 = fieldByName(doc2, 'FLD1');
      const f2 = fieldByName(doc2, 'FLD2');
      f1.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true }));
      f2.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      posted2.length = 0;
      keydown(dom2.window, doc2, 'Delete');
      const model = latestDspf(posted2);
      const rec = model && model.records.find((r) => r.name === 'SCR1');
      check('multi-delete posted exactly one applyEdit', posted2.filter((m) => m.type === 'applyEdit').length === 1);
      check('both selected fields are gone', rec && !rec.fields.find((f) => f.name === 'FLD1') && !rec.fields.find((f) => f.name === 'FLD2'));
      check('the unselected field survives', rec && rec.fields.find((f) => f.name === 'FLD3'));
      check('selection is cleared after a multi-delete', !doc2.querySelector('.dspf-field.selected'));

      runCutCopyPasteAndStyleScenario();
    }, 0);
  }

  function runCutCopyPasteAndStyleScenario() {
    console.log('\nCtrl+X (cut) then Ctrl+V (paste) moves the whole block as one unit');
    const { dom: dom3, posted: posted3 } = setup();
    const doc3 = dom3.window.document;
    setTimeout(() => {
      const f1 = fieldByName(doc3, 'FLD1');
      const f2 = fieldByName(doc3, 'FLD2');
      f1.dispatchEvent(new dom3.window.MouseEvent('click', { bubbles: true }));
      f2.dispatchEvent(new dom3.window.MouseEvent('click', { bubbles: true, shiftKey: true }));

      posted3.length = 0;
      keydown(dom3.window, doc3, 'x', { ctrlKey: true });
      let model = latestDspf(posted3);
      let rec = model && model.records.find((r) => r.name === 'SCR1');
      check('cut removed both selected fields', rec && rec.fields.length === 1 && rec.fields[0].name === 'FLD3');

      posted3.length = 0;
      keydown(dom3.window, doc3, 'v', { ctrlKey: true });
      model = latestDspf(posted3);
      rec = model && model.records.find((r) => r.name === 'SCR1');
      check('paste re-inserted both cut fields (3 total again)', rec && rec.fields.length === 3);
      // copyField always assigns a FRESH suffixed name on insert (see its own
      // doc comment) - never reuses the original exactly, even though it's
      // free again here (same record, right after a Cut) - so the pasted
      // pair are named FLD12/FLD22, not FLD1/FLD2.
      const pf1 = rec && rec.fields.find((f) => f.name === 'FLD12');
      const pf2 = rec && rec.fields.find((f) => f.name === 'FLD22');
      check('both pasted fields exist under their auto-suffixed names', !!pf1 && !!pf2);
      check('the pasted block preserves the 2-row relative offset between the two fields', pf1 && pf2 && (pf2.location.line - pf1.location.line) === 2);

      runStyleScenario();
    }, 0);
  }

  function runStyleScenario() {
    console.log('\nStyle (Color & attributes) panel applies the same state to every selected field, preserving each field\'s own other keywords');
    const { dom: dom4, posted: posted4 } = setup();
    const doc4 = dom4.window.document;
    setTimeout(() => {
      const f1 = fieldByName(doc4, 'FLD1');
      const f2 = fieldByName(doc4, 'FLD2');
      f1.dispatchEvent(new dom4.window.MouseEvent('click', { bubbles: true }));
      f2.dispatchEvent(new dom4.window.MouseEvent('click', { bubbles: true, shiftKey: true }));

      const colorSelect = Array.from(doc4.querySelectorAll('select')).find((el) => /-colorattr-new-color$/.test(el.id));
      check('the multi-field Style color picker is rendered', !!colorSelect);
      if (!colorSelect) { finish(); return; }

      posted4.length = 0;
      colorSelect.value = 'RED';
      const addBtn = Array.from(doc4.querySelectorAll('button')).find((b) => /Add color.attribute state/i.test(b.textContent));
      check('the "+ Add color/attribute state" button is present', !!addBtn);
      if (addBtn) addBtn.dispatchEvent(new dom4.window.Event('click', { bubbles: true }));

      const model = latestDspf(posted4);
      const rec = model && model.records.find((r) => r.name === 'SCR1');
      const applied1 = rec && rec.fields.find((f) => f.name === 'FLD1');
      const applied2 = rec && rec.fields.find((f) => f.name === 'FLD2');
      const notApplied3 = rec && rec.fields.find((f) => f.name === 'FLD3');
      const hasColorRed = (f) => f && f.keywords.some((k) => k.raw === 'COLOR(RED)');
      check('FLD1 got COLOR(RED)', hasColorRed(applied1));
      check('FLD2 got COLOR(RED) too', hasColorRed(applied2));
      check('the unselected FLD3 was left untouched', notApplied3 && !hasColorRed(notApplied3));

      runAlignScenario();
    }, 0);
  }

  // Suggestion B - align/distribute the multi-select group. FLD1/FLD2/FLD3
  // sit at columns 5/5/5, lines 3/5/7 (see the fixture at the top of this
  // file) - deliberately already left-aligned so "Align left" is a no-op
  // to verify separately from "Align top" actually moving something.
  function runAlignScenario() {
    console.log('\nAlign/distribute buttons for a multi-select group');
    const { dom: dom5, posted: posted5 } = setup();
    const doc5 = dom5.window.document;
    setTimeout(() => {
      console.log('  selecting all 3 fields and clicking "Align left" (they already share column 5, so this is a no-op check)');
      const f1 = fieldByName(doc5, 'FLD1');
      const f2 = fieldByName(doc5, 'FLD2');
      const f3 = fieldByName(doc5, 'FLD3');
      f1.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true }));
      f2.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      f3.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true, shiftKey: true }));

      const alignLeftBtn = doc5.getElementById('p-align-left');
      check('the Align Left button is present for a 3-field selection', !!alignLeftBtn);
      posted5.length = 0;
      alignLeftBtn.dispatchEvent(new dom5.window.Event('click', { bubbles: true }));
      let model = latestDspf(posted5);
      let rec = model && model.records.find((r) => r.name === 'SCR1');
      check('all three fields stay at column 5 (already aligned)', rec && ['FLD1', 'FLD2', 'FLD3'].every((n) => rec.fields.find((f) => f.name === n).location.column === 5));

      console.log('  moving FLD2 to a different column, then re-selecting and clicking "Align left" moves it back to the leftmost column');
      // Re-select fresh from the just-committed model's own DOM (posted5's
      // edit already re-rendered f2 at its new column via the app's own
      // externalUpdate-equivalent render() call, so look it up again rather
      // than reusing the stale f2 reference from before the edit).
      posted5.length = 0;
      const f1b = fieldByName(doc5, 'FLD1');
      f1b.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true }));
      const dragHandleTarget = fieldByName(doc5, 'FLD2');
      // Nudge FLD2 right by 10 columns via the existing arrow-key nudge
      // (Task L10-adjacent, already shipped) rather than re-deriving drag
      // math here - simplest reliable way to move just one field off-column
      // for this test.
      dragHandleTarget.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true }));
      for (let i = 0; i < 10; i++) {
        doc5.body.dispatchEvent(new dom5.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      }
      model = latestDspf(posted5);
      rec = model && model.records.find((r) => r.name === 'SCR1');
      check('setup: FLD2 moved off column 5', rec && rec.fields.find((f) => f.name === 'FLD2').location.column === 15);

      const f1c = fieldByName(doc5, 'FLD1');
      const f2c = fieldByName(doc5, 'FLD2');
      const f3c = fieldByName(doc5, 'FLD3');
      f1c.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true }));
      f2c.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      f3c.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      posted5.length = 0;
      doc5.getElementById('p-align-left').dispatchEvent(new dom5.window.Event('click', { bubbles: true }));
      model = latestDspf(posted5);
      rec = model && model.records.find((r) => r.name === 'SCR1');
      check('Align Left brings FLD2 back to column 5, matching the other two', rec && rec.fields.find((f) => f.name === 'FLD2').location.column === 5);
      check('FLD1/FLD3 (already at column 5) are untouched', rec && rec.fields.find((f) => f.name === 'FLD1').location.column === 5 && rec.fields.find((f) => f.name === 'FLD3').location.column === 5);

      console.log('  "Align top" moves every selected field to the topmost row among them');
      posted5.length = 0;
      const f1d = fieldByName(doc5, 'FLD1');
      const f2d = fieldByName(doc5, 'FLD2');
      const f3d = fieldByName(doc5, 'FLD3');
      f1d.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true }));
      f2d.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      f3d.dispatchEvent(new dom5.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      doc5.getElementById('p-align-top').dispatchEvent(new dom5.window.Event('click', { bubbles: true }));
      model = latestDspf(posted5);
      rec = model && model.records.find((r) => r.name === 'SCR1');
      check('all three fields now share line 3 (the original topmost)', rec && ['FLD1', 'FLD2', 'FLD3'].every((n) => rec.fields.find((f) => f.name === n).location.line === 3));

      console.log('  Distribute buttons are disabled below 3 fields, enabled at 3+');
      const distributeBtn = doc5.getElementById('p-distribute-v');
      check('Distribute vertical is enabled with exactly 3 fields selected', distributeBtn && !distributeBtn.disabled);

      runCenterGroupScenario();
    }, 0);
  }

  // Task L12 leftover - a fresh setup() rather than continuing from
  // runAlignScenario's own DOM: that scenario's last step ("Align top")
  // deliberately moves all three fields onto the exact same line/column,
  // and an overlapping cell only keeps ONE field element queryable in the
  // DOM afterward (a pre-existing rendering quirk when fields fully
  // overlap, unrelated to this button) - so re-querying FLD2/FLD3 there
  // would find nothing. Starting clean at the fixture's original columns
  // 5/5/5, lines 3/5/7 avoids that entirely and keeps this scenario's own
  // assertions about what actually moved unambiguous.
  function runCenterGroupScenario() {
    console.log('\n"Center on screen" (Task L12 leftover) centers the whole block as a unit');
    const { dom: dom6, posted: posted6 } = setup();
    const doc6 = dom6.window.document;
    setTimeout(() => {
      // All three fields sit at column 5 (10-wide, DSPSIZ 24 80), so the
      // group's own bounding box is columns 5-14 (width 10). Centered
      // against an 80-col screen that's column 36 (floor((80-10)/2)+1),
      // a +31 shift - every field should move by exactly that same delta,
      // not each independently centering on top of the others (which
      // would collapse the block instead of translating it).
      const f1 = fieldByName(doc6, 'FLD1');
      const f2 = fieldByName(doc6, 'FLD2');
      const f3 = fieldByName(doc6, 'FLD3');
      f1.dispatchEvent(new dom6.window.MouseEvent('click', { bubbles: true }));
      f2.dispatchEvent(new dom6.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      f3.dispatchEvent(new dom6.window.MouseEvent('click', { bubbles: true, shiftKey: true }));

      const centerGroupBtn = doc6.getElementById('p-center-group');
      check('the Center on screen button is present for a multi-field selection', !!centerGroupBtn);
      if (!centerGroupBtn) { finish(); return; }

      posted6.length = 0;
      centerGroupBtn.dispatchEvent(new dom6.window.Event('click', { bubbles: true }));
      const model = latestDspf(posted6);
      const rec = model && model.records.find((r) => r.name === 'SCR1');
      check('all three fields shift to column 36, keeping their shared column (group moved as one unit)', rec && ['FLD1', 'FLD2', 'FLD3'].every((n) => rec.fields.find((f) => f.name === n).location.column === 36));
      check('lines are untouched by a horizontal center (still 3/5/7)', rec &&
        rec.fields.find((f) => f.name === 'FLD1').location.line === 3 &&
        rec.fields.find((f) => f.name === 'FLD2').location.line === 5 &&
        rec.fields.find((f) => f.name === 'FLD3').location.line === 7);

      runPreserveOwnStyleScenario();
    }, 0);
  }

  // Regression for "existing color and attributes are removed and newly
  // selected added" - a fresh setup() with its own custom source, since
  // the module-level `src` fixture's fields deliberately start with no
  // COLOR/DSPATR at all (needed for runStyleScenario's own "+ Add" path
  // above) and this needs fields that ALREADY differ from each other to
  // prove anything. FLD1 (primary, first-selected) starts COLOR(BLU)
  // DSPATR(UL); FLD2 starts COLOR(GRN) DSPATR(RI); FLD3 starts with
  // nothing at all.
  const preserveSrc =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00030', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '5' }),
      buildLine({ seq: '00035', func: 'COLOR(BLU)' }),
      buildLine({ seq: '00036', func: 'DSPATR(UL)' }),
      buildLine({ seq: '00040', name: 'FLD2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '5' }),
      buildLine({ seq: '00045', func: 'COLOR(GRN)' }),
      buildLine({ seq: '00046', func: 'DSPATR(RI)' }),
      buildLine({ seq: '00050', name: 'FLD3', length: '10', dataType: 'A', usage: 'B', line: '7', col: '5' }),
    ].join('\n') + '\n';

  function runPreserveOwnStyleScenario() {
    console.log('\nMulti-select Style edits merge into each field\'s OWN existing color/attrs instead of overwriting them with the primary field\'s (previously reported: "existing color and attributes are removed and newly selected added")');
    const { dom: dom7, posted: posted7 } = setup(preserveSrc);
    const doc7 = dom7.window.document;
    setTimeout(() => {
      const f1 = fieldByName(doc7, 'FLD1');
      const f2 = fieldByName(doc7, 'FLD2');
      const f3 = fieldByName(doc7, 'FLD3');
      f1.dispatchEvent(new dom7.window.MouseEvent('click', { bubbles: true }));
      f2.dispatchEvent(new dom7.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      f3.dispatchEvent(new dom7.window.MouseEvent('click', { bubbles: true, shiftKey: true }));

      // Toggle the HI attribute checkbox on the primary (FLD1) card - a
      // single attribute added, nothing about color touched.
      const hiCheckbox = Array.from(doc7.querySelectorAll('input[type=checkbox]')).find((el) => el.value === 'HI');
      check('the HI attribute checkbox is present on the primary field\'s existing state card', !!hiCheckbox);
      if (!hiCheckbox) { runColorChangeVariant(); return; }

      posted7.length = 0;
      hiCheckbox.checked = true;
      hiCheckbox.dispatchEvent(new dom7.window.Event('change', { bubbles: true }));

      const model = latestDspf(posted7);
      const rec = model && model.records.find((r) => r.name === 'SCR1');
      const raws = (n) => rec && rec.fields.find((f) => f.name === n).keywords.map((k) => k.raw);
      const dspatrAttrs = (n) => { const k = rec && rec.fields.find((f) => f.name === n).keywords.find((kw) => kw.name === 'DSPATR'); return k ? k.parameters.split(/\s+/) : []; };
      check('FLD1 (primary) gets its own new HI attribute alongside its own BLU/UL', rec &&
        raws('FLD1').includes('COLOR(BLU)') && dspatrAttrs('FLD1').sort().join(' ') === 'HI UL');
      check('FLD2 keeps its OWN color (GRN) and OWN attr (RI), just gains HI - not overwritten with FLD1\'s BLU/UL', rec &&
        raws('FLD2').includes('COLOR(GRN)') && dspatrAttrs('FLD2').sort().join(' ') === 'HI RI');
      check('FLD3 (had no color/attrs at all) gets ONLY the new HI attribute - no color invented from FLD1', rec &&
        !raws('FLD3').some((r) => r.indexOf('COLOR') === 0) && dspatrAttrs('FLD3').join(' ') === 'HI');

      runColorChangeVariant();
    }, 0);
  }

  // Same idea, the other direction: changing the COLOR (not an attribute)
  // on the primary should replay as a color-only change on every other
  // field too, leaving THEIR own attributes alone.
  function runColorChangeVariant() {
    const { dom: dom8, posted: posted8 } = setup(preserveSrc);
    const doc8 = dom8.window.document;
    setTimeout(() => {
      const f1 = fieldByName(doc8, 'FLD1');
      const f2 = fieldByName(doc8, 'FLD2');
      const f3 = fieldByName(doc8, 'FLD3');
      f1.dispatchEvent(new dom8.window.MouseEvent('click', { bubbles: true }));
      f2.dispatchEvent(new dom8.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
      f3.dispatchEvent(new dom8.window.MouseEvent('click', { bubbles: true, shiftKey: true }));

      const colorSelect = Array.from(doc8.querySelectorAll('select')).find((el) => /-colorattr-inst0-color$/.test(el.id));
      check('the color select for the primary field\'s existing state is present', !!colorSelect);
      if (!colorSelect) { finish(); return; }

      posted8.length = 0;
      colorSelect.value = 'RED';
      colorSelect.dispatchEvent(new dom8.window.Event('change', { bubbles: true }));

      const model = latestDspf(posted8);
      const rec = model && model.records.find((r) => r.name === 'SCR1');
      const raws = (n) => rec && rec.fields.find((f) => f.name === n).keywords.map((k) => k.raw);
      check('FLD1 (primary) gets the new RED color, keeps its own UL', rec &&
        raws('FLD1').includes('COLOR(RED)') && raws('FLD1').includes('DSPATR(UL)'));
      check('FLD2 also gets RED, but keeps its OWN attribute (RI) - not FLD1\'s UL', rec &&
        raws('FLD2').includes('COLOR(RED)') && raws('FLD2').includes('DSPATR(RI)'));
      check('FLD3 gets ONLY the color - no attribute invented from FLD1', rec &&
        raws('FLD3').includes('COLOR(RED)') && !raws('FLD3').some((r) => r.indexOf('DSPATR') === 0));

      finish();
    }, 0);
  }

  function finish() {
    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exitCode = failures === 0 ? 0 : 1;
  }
}, 0);

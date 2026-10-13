/**
 * e8dWindowPreviewPosition.test.js
 *
 * Task E8d - the designer UI for the preview position of a runtime-valued WINDOW (WINDOW(*DFT ...) or a &field start):
 *  1. the "Preview position" box in the record properties: boxes only for the runtime coordinates, a literal start is
 *     shown but fixed, a typed value is checked against the window and display, Reset clears
 *  2. dragging the move handle moves the preview position only: nothing is posted to the document, the value is
 *     stored (saveSimulatorState), a mixed form keeps its literal axis, the drag is clamped to where the window fits
 *  3. a window with a fixed start still moves by editing the source, as before, and has no preview box
 *
 * Run with: node src/test/e8dWindowPreviewPosition.test.js
 */
'use strict';

const { check, failureCount } = require('./helpers/harness');
const { leaseDspfPage } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');

const source = (params) => [
  buildLine({ seq: '00010', nameType: 'R', name: 'W1' }),
  buildLine({ seq: '00020', func: 'WINDOW(' + params + ')' }),
  buildLine({ seq: '00030', name: 'F1', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
].join('\n') + '\n';

// rect: 10px per column, 20px per row (80 x 24)
function scenario(params, run, next) {
  const posted = [];
  const dom = leaseDspfPage(source(params), 'E8DWINDOW.DSPF', { posted: posted, rect: true });
  setTimeout(() => {
    run(dom, posted);
    next();
  }, 0);
}
const stored = (posted) => {
  const saves = posted.filter((m) => m.type === 'saveSimulatorState');
  return saves.length ? saves[saves.length - 1].values : null;
};
const drag = (dom, dx, dy) => {
  const { MouseEvent } = dom.window;
  const handle = dom.window.document.querySelector('.dspf-window-border .dspf-window-move-handle');
  handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
  dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + dx, clientY: 100 + dy }));
  dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
};
const box = (dom) => dom.window.document.querySelector('#screenOutput .dspf-window-border');
const inputs = (dom) => Array.from(dom.window.document.querySelectorAll('.window-start-input'));
const style = (dom) => box(dom).getAttribute('style');

const steps = [
  // ---- *DFT: the properties box and the drag
  (next) => scenario('*DFT 9 30', (dom, posted) => {
    console.log('E8d: WINDOW(*DFT 9 30) - properties box');
    const doc = dom.window.document;
    check('setup: dashed placeholder at line 2, column 2', /dspf-window-default-position/.test(box(dom).className) && /grid-row:2 \/ span 9;grid-column:2 \/ span 30;/.test(style(dom)));
    check('a Preview position box is offered', !!doc.querySelector('.window-preview-start'));
    check('both coordinates get an input (*DFT is both)', inputs(dom).map((i) => i.getAttribute('data-coordinate')).join() === 'line,position');
    check('the largest start that fits is the input max (14 and 47 on 24 x 80)', inputs(dom)[0].max === '14' && inputs(dom)[1].max === '47');

    const before = posted.length;
    inputs(dom)[0].value = '6';
    inputs(dom)[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    check('typing a start line stores it and moves the window, still dashed (position unset)', /grid-row:6 \/ span 9;grid-column:2 \/ span 30;/.test(style(dom)) && /dspf-window-default-position/.test(box(dom).className));
    inputs(dom)[1].value = '12';
    inputs(dom)[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    check('both set: the window sits there and is no longer dashed', /grid-row:6 \/ span 9;grid-column:12 \/ span 30;/.test(style(dom)) && !/dspf-window-default-position/.test(box(dom).className));
    const v = stored(posted);
    check('the values are persisted in the E3f store', v && v.windowStart && v.windowStart['W1|LINE'] === 6 && v.windowStart['W1|POSITION'] === 12);
    check('nothing is posted to the document (the source is never edited)', !posted.slice(before).some((m) => m.type === 'applyEdit'));

    inputs(dom)[0].value = '15';
    inputs(dom)[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const err = doc.getElementById('p-window-start-error');
    check('a start that does not fit is refused with the reason (largest allowed)', err && /14 or lower/.test(err.textContent));
    check('and the stored value is unchanged', stored(posted).windowStart['W1|LINE'] === 6 && /grid-row:6 /.test(style(dom)));

    inputs(dom)[0].value = '';
    inputs(dom)[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    check('clearing one box removes just that value', !(stored(posted).windowStart || {})['W1|LINE'] && stored(posted).windowStart['W1|POSITION'] === 12);

    doc.getElementById('p-window-start-reset').click();
    check('Reset to placeholder clears both and puts the dashed placeholder back', /dspf-window-default-position/.test(box(dom).className) && /grid-row:2 \/ span 9;grid-column:2 \/ span 30;/.test(style(dom)) && !(stored(posted).windowStart && Object.keys(stored(posted).windowStart).length));
  }, next),

  (next) => scenario('*DFT 9 30', (dom, posted) => {
    console.log('E8d: WINDOW(*DFT 9 30) - drag');
    const before = posted.length;
    check('setup: the move handle is active on a runtime-valued window (it was refused before)', !!box(dom).querySelector('.dspf-window-move-handle'));
    drag(dom, 50, 60); // +5 columns, +3 rows from line 2 / column 2
    check('dragging moves the window by the dragged cells', /grid-row:5 \/ span 9;grid-column:7 \/ span 30;/.test(style(dom)));
    const v = stored(posted);
    check('the new start is stored as the preview value', v && v.windowStart['W1|LINE'] === 5 && v.windowStart['W1|POSITION'] === 7);
    check('no applyEdit was posted: the DDS source is untouched', !posted.slice(before).some((m) => m.type === 'applyEdit'));
    check('the window is no longer dashed', !/dspf-window-default-position/.test(box(dom).className));
    drag(dom, 2000, 2000);
    check('a drag past the edge is clamped to the highest start that fits (line 14, position 47)', /grid-row:14 \/ span 9;grid-column:47 \/ span 30;/.test(style(dom)));
    check('the move handle explains it only changes the preview', /preview position/i.test(box(dom).querySelector('.dspf-window-move-handle').title));
  }, next),

  // ---- mixed form: literal line, &field position
  (next) => scenario('4 &POS 9 30', (dom, posted) => {
    console.log('E8d: WINDOW(4 &POS 9 30) - mixed form');
    check('only the position gets an input', inputs(dom).map((i) => i.getAttribute('data-coordinate')).join() === 'position');
    check('the literal line is shown as fixed in the source', /Start line/.test(dom.window.document.querySelector('.window-preview-start').textContent) && /4 \(fixed in the source\)/.test(dom.window.document.querySelector('.window-preview-start').textContent));
    const before = posted.length;
    drag(dom, 50, 100); // +5 columns, +5 rows: the line must stay on the literal 4
    check('a drag moves only the runtime axis (line stays 4, position 2 -> 7)', /grid-row:4 \/ span 9;grid-column:7 \/ span 30;/.test(style(dom)));
    const v = stored(posted);
    check('only POSITION is stored, no LINE value', v && v.windowStart['W1|POSITION'] === 7 && !('W1|LINE' in v.windowStart));
    check('nothing is written to the source', !posted.slice(before).some((m) => m.type === 'applyEdit'));
  }, next),

  // ---- fixed start: unchanged behaviour
  (next) => scenario('3 10 8 40', (dom, posted) => {
    console.log('E8d: WINDOW(3 10 8 40) - fixed start is unchanged');
    check('no Preview position box on a window with a fixed start', !dom.window.document.querySelector('.window-preview-start'));
    posted.length = 0;
    drag(dom, 10, 20);
    const last = posted[posted.length - 1];
    check('dragging still rewrites the WINDOW keyword in the source', last && last.type === 'applyEdit' && /WINDOW\(\d+ \d+ 8 40\)/.test(last.text));
    check('and stores no preview value', !stored(posted) || !stored(posted).windowStart);
  }, next),
];

(function run(i) {
  if (i >= steps.length) {
    if (failureCount() > 0) process.exit(1);
    console.log('\nALL CHECKS PASSED');
    process.exit(0);
  }
  steps[i](() => run(i + 1));
})(0);

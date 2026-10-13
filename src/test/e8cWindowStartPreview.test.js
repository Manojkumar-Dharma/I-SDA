/**
 * e8cWindowStartPreview.test.js
 *
 * Task E8c - a runtime-valued WINDOW start takes the design-time value stored for it (E3f 'windowStart' namespace,
 * E8b) instead of the fixed placeholder; the dashed "set at runtime" border stays for any coordinate without a
 * usable value. Every form from the E8a inventory:
 *  1. the engine: *DFT, two fields, the two mixed forms, literals, record-name form, values that do not fit
 *  2. the display size, fields drawn relative to the window, the rendered markup
 *  3. compare mode (several windows)
 *  4. the designer page: values loaded from the extension host move the window, nothing is posted or written
 *
 * Run with: node src/test/e8cWindowStartPreview.test.js
 */
'use strict';

const path = require('path');
const DspfEngine = require('../dspfEngine.js');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');
const { leaseDspfPage } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');

const build = (lines) => DspfParser.parseDspf(lines.join('\n') + '\n');
const win = (name, params) => [dds({ t: 'R', name }), dds({ fn: 'WINDOW(' + params + ')' }), dds({ name: 'F1', len: 5, type: 'A', use: 'B', line: 2, col: 2 })];
const model = (params, values) => { const m = build(win('W1', params)); if (values) m.windowStartValues = values; return m; };
const screen = (m, name, sizeIndex) => DspfEngine.resolveScreen(m, name, new Set(), null, false, sizeIndex || 0);
const boxOf = (params, values, sizeIndex) => screen(model(params, values), 'W1', sizeIndex).window;
const PLACE = { line: 2, col: 2 };
const at = (b, l, c) => b.line === l && b.col === c;

console.log('E8c: *DFT');
{
  let b = boxOf('*DFT 9 30');
  check('no value stored: the placeholder, dashed (as before)', at(b, PLACE.line, PLACE.col) && b.positionIsDefault === true && !b.previewStart);
  b = boxOf('*DFT 9 30', { 'W1|LINE': 6, 'W1|POSITION': 12 });
  check('both values stored: the window starts there, no longer dashed', at(b, 6, 12) && b.positionIsDefault === false && b.previewStart === true);
  check('size is unchanged by the start', b.height === 9 && b.width === 30);
  b = boxOf('*DFT 9 30', { 'W1|LINE': 6 });
  check('only the line stored: the line is used, the position stays the placeholder and the border stays dashed', b.line === 6 && b.col === PLACE.col && b.positionIsDefault === true);
  b = boxOf('*DFT 9 30', { 'W1|POSITION': 12 });
  check('only the position stored: the position is used, the line stays the placeholder, dashed', b.col === 12 && b.line === PLACE.line && b.positionIsDefault === true);
  b = boxOf('*DFT 9 30 *NOMSGLIN *NORSTCSR', { 'W1|LINE': 6, 'W1|POSITION': 12 });
  check('trailing options do not disturb it, and *NOMSGLIN is still read', at(b, 6, 12) && b.msgLine === false);
}

console.log('E8c: two program-to-system fields');
{
  let b = boxOf('&LINE &POS 9 30');
  check('no values: placeholder, dashed', at(b, 2, 2) && b.positionIsDefault === true);
  b = boxOf('&LINE &POS 9 30', { 'W1|LINE': 10, 'W1|POSITION': 40 });
  check('both stored: the window starts there', at(b, 10, 40) && b.positionIsDefault === false && b.previewStart === true);
  b = boxOf('&LINE &POS 9 30', { 'W1|LINE': 10 });
  check('one stored: still dashed', b.line === 10 && b.positionIsDefault === true);
}

console.log('E8c: the mixed forms (the E8a gap)');
{
  let b = boxOf('4 &POS 9 30');
  check('literal line + field position, no value: the literal 4 is kept, only the position is the placeholder', b.line === 4 && b.col === PLACE.col && b.positionIsDefault === true);
  b = boxOf('4 &POS 9 30', { 'W1|POSITION': 25 });
  check('literal line + field position, position stored: exact, no longer dashed', at(b, 4, 25) && b.positionIsDefault === false);
  b = boxOf('4 &POS 9 30', { 'W1|LINE': 9, 'W1|POSITION': 25 });
  check('a stored line is ignored when the line is a literal', at(b, 4, 25));
  b = boxOf('&LINE 20 9 30');
  check('field line + literal position, no value: the literal 20 is kept', b.col === 20 && b.line === PLACE.line && b.positionIsDefault === true);
  b = boxOf('&LINE 20 9 30', { 'W1|LINE': 7 });
  check('field line + literal position, line stored: exact', at(b, 7, 20) && b.positionIsDefault === false);
}

console.log('E8c: literals and values that do not fit');
{
  let b = boxOf('4 20 9 30', { 'W1|LINE': 9, 'W1|POSITION': 9 });
  check('all literals: stored values change nothing', at(b, 4, 20) && b.positionIsDefault === false && !b.previewStart);
  b = boxOf('*DFT 9 30', { 'W1|LINE': 15, 'W1|POSITION': 12 });
  check('line 15 does not fit a 9-line window on 24 lines (highest is 14): ignored, placeholder, dashed', b.line === PLACE.line && b.col === 12 && b.positionIsDefault === true);
  b = boxOf('*DFT 9 30', { 'W1|LINE': 14, 'W1|POSITION': 47 });
  check('the highest start that fits is used', at(b, 14, 47) && b.positionIsDefault === false);
  b = boxOf('*DFT 9 30', { 'W1|LINE': 14, 'W1|POSITION': 48 });
  check('position 48 does not fit 30 positions on 80 columns: ignored', b.line === 14 && b.col === PLACE.col && b.positionIsDefault === true);
}

console.log('E8c: display size, fields, markup');
{
  const wide = DspfParser.parseDspf([dds({ fn: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' })].concat(win('W1', '*DFT 9 30')).join('\n') + '\n');
  wide.windowStartValues = { 'W1|LINE': 17, 'W1|POSITION': 99 };
  const onSmall = screen(wide, 'W1', 0);
  const onLarge = screen(wide, 'W1', 1);
  check('setup: the file has two display sizes', onSmall.columns === 80 && onLarge.columns === 132);
  check('a value that does not fit 24 x 80 is ignored there', onSmall.window.positionIsDefault === true);
  check('the same value fits 27 x 132 and is used', at(onLarge.window, 17, 99) && onLarge.window.positionIsDefault === false);

  const m = model('*DFT 9 30', { 'W1|LINE': 6, 'W1|POSITION': 12 });
  const s = screen(m, 'W1', 0);
  const f = s.fields.find((x) => x.name === 'F1');
  const lit = screen(model('6 12 9 30'), 'W1', 0).fields.find((x) => x.name === 'F1');
  check('a preview window and the same window written out put the field in the same cell', f.line === lit.line && f.column === lit.column);

  const html = DspfEngine.renderScreenHtml(s);
  check('markup: resolved window is not dashed and says it is a preview position', !/dspf-window-default-position/.test(html) && /preview position/.test(html) && !/position set at runtime/.test(html));
  check('markup: the box is placed at the stored start', /grid-row:6 \/ span 9;grid-column:12 \/ span 30;/.test(html));
  const unset = DspfEngine.renderScreenHtml(screen(model('*DFT 9 30'), 'W1', 0));
  check('markup: an unset window is still dashed with "position set at runtime"', /dspf-window-default-position/.test(unset) && /position set at runtime/.test(unset));
  const half = DspfEngine.renderScreenHtml(screen(model('*DFT 9 30', { 'W1|LINE': 6 }), 'W1', 0));
  check('markup: a half-set window stays dashed', /dspf-window-default-position/.test(half));
}

console.log('E8c: the record-name form');
{
  const lines = win('W1', '*DFT 9 30').concat([dds({ t: 'R', name: 'W2' }), dds({ fn: 'WINDOW(W1)' }), dds({ name: 'F2', len: 5, type: 'A', use: 'B', line: 3, col: 2 })]);
  const m = build(lines);
  let b = screen(m, 'W2', 0).window;
  check('W2 shares W1 with nothing stored: placeholder, dashed', at(b, 2, 2) && b.positionIsDefault === true && b.inheritedFrom === 'W1');
  m.windowStartValues = { 'W1|LINE': 8, 'W1|POSITION': 20 };
  b = screen(m, 'W2', 0).window;
  check('W2 takes the stored start of the record it names', at(b, 8, 20) && b.positionIsDefault === false && b.previewStart === true && b.inheritedFrom === 'W1');
  m.windowStartValues = { 'W2|LINE': 8, 'W2|POSITION': 20 };
  b = screen(m, 'W2', 0).window;
  check('a value stored under W2 itself is not used (W2 has no start of its own)', b.positionIsDefault === true && at(b, 2, 2));
}

console.log('E8c: compare mode');
{
  const m = build(win('W1', '*DFT 9 30').concat(win('W2', '*DFT 9 30').map((l, i) => i === 0 ? dds({ t: 'R', name: 'W2' }) : l)));
  m.windowStartValues = { 'W2|LINE': 10, 'W2|POSITION': 30 };
  const multi = DspfEngine.resolveMultiScreen(m, ['W1', 'W2'], new Set(), 0);
  const [w1, w2] = multi.windows;
  check('the window with values is placed there; the other keeps its staggered placeholder', at(w2, 10, 30) && w2.positionIsDefault === false && at(w1, 2, 2) && w1.positionIsDefault === true);
  m.windowStartValues = {};
  const plain = DspfEngine.resolveMultiScreen(m, ['W1', 'W2'], new Set(), 0).windows;
  check('with nothing stored the two placeholders still stagger apart (unchanged)', at(plain[0], 2, 2) && at(plain[1], 4, 6));
}

console.log('E8c: resolveWindow without a display size');
{
  const m = model('*DFT 9 30', { 'W1|LINE': 6, 'W1|POSITION': 12 });
  const b = DspfEngine.resolveWindow(m.records[0], m);
  check('callers that pass no display size get the placeholder exactly as before', at(b, 2, 2) && b.positionIsDefault === true);
}

console.log('E8c: the designer page');
const src = [
  buildLine({ seq: '00010', nameType: 'R', name: 'W1' }),
  buildLine({ seq: '00020', func: 'WINDOW(*DFT 9 30)' }),
  buildLine({ seq: '00030', name: 'F1', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
].join('\n') + '\n';
const posted = [];
const dom = leaseDspfPage(src, 'E8CWINDOW.DSPF', { posted: posted });
setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const msg = (data) => w.dispatchEvent(new w.MessageEvent('message', { data: data }));
  const box = () => doc.querySelector('#screenOutput .dspf-window-border');
  check('setup: the window is drawn dashed at the placeholder', !!box() && /dspf-window-default-position/.test(box().className) && /grid-row:2 \/ span 9;grid-column:2 \/ span 30;/.test(box().getAttribute('style')));
  const before = posted.length;
  msg({ type: 'simulatorState', scenarios: [], values: { windowStart: { 'W1|LINE': 6, 'W1|POSITION': 12 } } });
  check('stored values from the extension host move the window and drop the dashed border', !/dspf-window-default-position/.test(box().className) && /grid-row:6 \/ span 9;grid-column:12 \/ span 30;/.test(box().getAttribute('style')));
  check('loading posts nothing back (the source is never edited)', posted.length === before && !posted.some((m) => m.type === 'applyEdit'));
  msg({ type: 'simulatorState', scenarios: [], values: { windowStart: { 'W1|LINE': 6, 'W1|POSITION': 70 } } });
  check('a stored value that does not fit is ignored on the page too', /dspf-window-default-position/.test(box().className));
  msg({ type: 'simulatorState', scenarios: [], values: {} });
  check('clearing the store puts the placeholder back', /dspf-window-default-position/.test(box().className) && /grid-row:2 \/ span 9/.test(box().getAttribute('style')));

  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}, 0);

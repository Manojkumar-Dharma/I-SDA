/**
 * e8eCompareModeValues.test.js
 *
 * Task E8e - compare mode and the preview positions of runtime-valued WINDOWs. A placeholder slot (the stagger step)
 * is used only by a window that is really drawn on the placeholder, so:
 *  1. a window with chosen values, a fixed start, a record with no window each take no slot, and the windows that
 *     are still on the placeholder stack from the first slot
 *  2. the current record's own window counts first in the compare backdrop (options.placeholderSlotsUsed), so a
 *     backdrop placeholder window no longer lands exactly on top of the current record's placeholder
 *  3. the designer page does that (current record on the placeholder: the backdrop window is staggered; give the
 *     current record a preview position: the backdrop window takes the first slot)
 *
 * Run with: node src/test/e8eCompareModeValues.test.js
 */
'use strict';

const path = require('path');
const DspfEngine = require('../dspfEngine.js');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');
const { webviewHtml, newWebviewDom } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');

const rec = (name, params) => [dds({ t: 'R', name })].concat(params ? [dds({ fn: 'WINDOW(' + params + ')' })] : []).concat([dds({ name: 'F' + name, len: 5, type: 'A', use: 'B', line: 2, col: 2 })]);
const build = (records, values) => {
  const m = DspfParser.parseDspf([].concat.apply([], records).join('\n') + '\n');
  if (values) m.windowStartValues = values;
  return m;
};
const wins = (m, names, options) => {
  const out = {};
  DspfEngine.resolveMultiScreen(m, names, new Set(), 0, options).windows.forEach((w) => { out[w.recordName] = w; });
  return out;
};
const at = (w, l, c) => !!w && w.line === l && w.col === c;
const FIRST = [2, 2], SECOND = [4, 6], THIRD = [6, 10];

console.log('E8e: slots go only to windows on the placeholder');
{
  let w = wins(build([rec('W1', '*DFT 9 30'), rec('W2', '*DFT 9 30')], { 'W1|LINE': 10, 'W1|POSITION': 30 }), ['W1', 'W2']);
  check('W1 has chosen values and W2 is the only placeholder: W2 takes the first slot (it was the second)', at(w.W1, 10, 30) && at(w.W2, FIRST[0], FIRST[1]) && w.W2.positionIsDefault === true);

  w = wins(build([rec('W1', '*DFT 9 30'), rec('W2', '*DFT 9 30'), rec('W3', '*DFT 9 30')], { 'W2|LINE': 12, 'W2|POSITION': 40 }), ['W1', 'W2', 'W3']);
  check('three windows, the middle one chosen: the other two take the first two slots', at(w.W1, FIRST[0], FIRST[1]) && at(w.W2, 12, 40) && at(w.W3, SECOND[0], SECOND[1]));

  w = wins(build([rec('A', null), rec('W1', '*DFT 9 30')]), ['A', 'W1']);
  check('a record with no window takes no slot (it used to push the first placeholder to the second)', at(w.W1, FIRST[0], FIRST[1]) && !w.A);

  w = wins(build([rec('W1', '5 5 9 30'), rec('W2', '*DFT 9 30'), rec('W3', '*DFT 9 30')]), ['W1', 'W2', 'W3']);
  check('a fixed-start window takes no slot', at(w.W1, 5, 5) && at(w.W2, FIRST[0], FIRST[1]) && at(w.W3, SECOND[0], SECOND[1]) && w.W1.positionIsDefault === false);

  w = wins(build([rec('W1', '*DFT 9 30'), rec('W2', '*DFT 9 30'), rec('W3', '*DFT 9 30')]), ['W1', 'W2', 'W3']);
  check('nothing chosen: the placeholders stack as before (first, second, third slot)', at(w.W1, FIRST[0], FIRST[1]) && at(w.W2, SECOND[0], SECOND[1]) && at(w.W3, THIRD[0], THIRD[1]));

  w = wins(build([rec('W1', '*DFT 9 30'), rec('W2', '*DFT 9 30')], { 'W1|LINE': 5, 'W1|POSITION': 9, 'W2|LINE': 12, 'W2|POSITION': 40 }), ['W1', 'W2']);
  check('every window chosen: all exact, none dashed, no stagger', at(w.W1, 5, 9) && at(w.W2, 12, 40) && !w.W1.positionIsDefault && !w.W2.positionIsDefault);

  w = wins(build([rec('W1', '*DFT 9 30'), rec('W2', '*DFT 9 30')], { 'W1|LINE': 5 }), ['W1', 'W2']);
  check('a half-set window is still on the placeholder, so it holds a slot', w.W1.line === 5 && w.W1.positionIsDefault === true && at(w.W2, SECOND[0], SECOND[1]));
}

console.log('E8e: slots already held by a window drawn outside the call');
{
  const m = build([rec('W1', '*DFT 9 30'), rec('W2', '*DFT 9 30')]);
  let w = wins(m, ['W1', 'W2']);
  check('default: no slot is held, W1 takes the first', at(w.W1, FIRST[0], FIRST[1]));
  w = wins(m, ['W1', 'W2'], { placeholderSlotsUsed: 1 });
  check('one slot held (the current record on the placeholder): the backdrop starts at the second slot', at(w.W1, SECOND[0], SECOND[1]) && at(w.W2, THIRD[0], THIRD[1]));
  w = wins(build([rec('W1', '*DFT 9 30')], { 'W1|LINE': 8, 'W1|POSITION': 20 }), ['W1'], { placeholderSlotsUsed: 1 });
  check('a chosen window ignores the held slot', at(w.W1, 8, 20));
}

console.log('E8e: the designer page');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'W1' }),
    buildLine({ seq: '00020', func: 'WINDOW(*DFT 9 30)' }),
    buildLine({ seq: '00030', name: 'F1', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'W2' }),
    buildLine({ seq: '00050', func: 'WINDOW(*DFT 9 30)' }),
    buildLine({ seq: '00060', name: 'F2', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
  ].join('\n') + '\n';
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce8e', src, 'E8E.DSPF'), {
    beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} }); },
  });
  setTimeout(() => {
    const w = dom.window, doc = w.document;
    const fire = (el, prop, val) => { el[prop] = val; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const backdrop = () => doc.querySelector('.dspf-screen-backdrop-layer .dspf-window-border');
    const primary = () => doc.querySelector('#screenOutput > .dspf-screen .dspf-window-border');
    fire(doc.getElementById('compareModeToggle'), 'checked', true);
    const box = Array.from(doc.querySelectorAll('.compare-record-row')).find((r) => r.textContent.trim() === 'W2').querySelector('input');
    fire(box, 'checked', true);
    check('setup: the current record W1 is on the placeholder at line 2, column 2', !!primary() && /grid-row:2 \/ span 9;grid-column:2 \/ span 30;/.test(primary().getAttribute('style')));
    check('the dimmed W2 is staggered off the current window (line 4, column 6), not on top of it', !!backdrop() && /grid-row:4 \/ span 9;grid-column:6 \/ span 30;/.test(backdrop().getAttribute('style')));
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'simulatorState', scenarios: [], values: { windowStart: { 'W1|LINE': 10, 'W1|POSITION': 40 } } } }));
    check('give the current record a preview position: it moves there', /grid-row:10 \/ span 9;grid-column:40 \/ span 30;/.test(primary().getAttribute('style')));
    check('and the dimmed W2 takes the first placeholder slot (line 2, column 2)', /grid-row:2 \/ span 9;grid-column:2 \/ span 30;/.test(backdrop().getAttribute('style')));

    if (failureCount() > 0) process.exit(1);
    console.log('\nALL CHECKS PASSED');
    process.exit(0);
  }, 500);
}

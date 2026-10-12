/**
 * e3kCursorLocation.test.js
 *
 * Task E3k - CSRLOC(line-field position-field): the preview draws the cursor where the two program fields' stored
 * design-time values say, under the keyword's option indicators.
 *  1. the engine: values, range, indicators, override of DSPATR(PC), records that cannot take it
 *  2. the E3f store: the cursorLocation namespace
 *  3. the designer: the CSRLOC editor in the simulator panel, the drawn cursor, what is posted
 *
 * Run with: node src/test/e3kCursorLocation.test.js
 */
'use strict';

const path = require('path');
const DspfEngine = require('../dspfEngine.js');
const IndicatorSim = require('../indicatorSim.js');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');
const { leaseDspfPage } = require('./helpers/common');

const build = (lines) => DspfParser.parseDspf(lines.join('\n') + '\n');
const hidden = (n) => dds({ name: n, len: 3, type: 'S', dec: 0, use: 'H' });
const base = (extra) => [dds({ t: 'R', name: 'R1' })].concat(extra || [], [dds({ name: 'F1', len: 10, type: 'A', use: 'B', line: 3, col: 2 }), hidden('LINNBR'), hidden('POSNBR')]);
const vals = (l, c) => ({ 'R1|LINNBR': l, 'R1|POSNBR': c });
const cursorOf = (m, on, v) => { m.cursorLocationValues = v; return DspfEngine.resolveScreen(m, 'R1', new Set(on || []), null).cursor; };

console.log('E3k: the engine');
{
  const m = build(base([dds({ fn: 'CSRLOC(LINNBR POSNBR)' })]));
  const c = cursorOf(m, [], vals(12, 40));
  check('both values set: the cursor is at that line and position', !!c && c.line === 12 && c.col === 40);
  check('the field names are reported', c.lineField === 'LINNBR' && c.posField === 'POSNBR');
  check('drawn in the screen HTML at that grid cell', /class="dspf-csrloc-cursor" style="grid-row:12;grid-column:40;"/.test(DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(m, 'R1', new Set(), null))));
  check('no values stored: no cursor', cursorOf(m, [], {}) == null && cursorOf(m, [], undefined) == null);
  check('only the line stored: no cursor', cursorOf(m, [], { 'R1|LINNBR': 5 }) == null);
  check('line outside the screen (25 on a 24-line display): ignored', cursorOf(m, [], vals(25, 5)) == null);
  check('position outside the screen (81): ignored', cursorOf(m, [], vals(5, 81)) == null);
  check('zero is outside the screen: ignored', cursorOf(m, [], vals(0, 5)) == null && cursorOf(m, [], vals(5, 0)) == null);
  check('the last cell (24 / 80) is inside', !!cursorOf(m, [], vals(24, 80)));
  const amp = build(base([dds({ fn: 'CSRLOC(&LINNBR &POSNBR)' })]));
  check('names written with & are read the same', !!cursorOf(amp, [], vals(2, 2)));
}

console.log('E3k: option indicators');
{
  const m = build(base([dds({ ind: ' 01', fn: 'CSRLOC(LINNBR POSNBR)' })]));
  check('01 off: the keyword is not in effect, no cursor', cursorOf(m, [], vals(5, 5)) == null);
  check('01 on: the cursor is drawn', !!cursorOf(m, ['01'], vals(5, 5)));
  const two = build(base([dds({ ind: 'N01', fn: 'CSRLOC(LINNBR POSNBR)' }), dds({ ind: ' 01', fn: 'CSRLOC(LINNBR POSNBR)' })]));
  check('two instances: one is in effect either way', !!cursorOf(two, [], vals(5, 5)) && !!cursorOf(two, ['01'], vals(5, 5)));
}

console.log('E3k: CSRLOC overrides DSPATR(PC), an ignored CSRLOC leaves it');
{
  const withPc = (kw) => build([dds({ t: 'R', name: 'R1' })].concat(kw ? [dds({ fn: kw })] : [], [dds({ name: 'F1', len: 10, type: 'A', use: 'B', line: 3, col: 2, fn: 'DSPATR(PC)' }), hidden('LINNBR'), hidden('POSNBR')]));
  const pcMarked = (m, v, on) => { m.cursorLocationValues = v; return DspfEngine.resolveScreen(m, 'R1', new Set(on || []), null).fields.some((f) => f.showCursorIndicator); };
  const m = withPc('CSRLOC(LINNBR POSNBR)');
  check('no CSRLOC cursor (no values): the PC field still holds the cursor', pcMarked(m, {}) === true);
  check('CSRLOC cursor drawn: the PC marker is gone (CSRLOC overrides it)', pcMarked(m, vals(8, 8)) === false);
  check('CSRLOC value off the screen: ignored, PC marker stays', pcMarked(m, vals(99, 8)) === true);
  const none = withPc(null);
  check('without CSRLOC the PC marker is unchanged', pcMarked(none, vals(8, 8)) === true);
}

console.log('E3k: records that cannot take it');
{
  const sfl = build([dds({ t: 'R', name: 'R1' }), dds({ fn: 'SFL' }), dds({ fn: 'CSRLOC(LINNBR POSNBR)' }), dds({ name: 'S1', len: 5, type: 'A', use: 'O', line: 5, col: 2 }), hidden('LINNBR'), hidden('POSNBR')]);
  check('a subfile record: no cursor', cursorOf(sfl, [], vals(5, 5)) == null);
  const usr = build([dds({ t: 'R', name: 'R1' }), dds({ fn: 'USRDFN' }), dds({ fn: 'CSRLOC(LINNBR POSNBR)' }), hidden('LINNBR'), hidden('POSNBR')]);
  check('a user-defined record: no cursor', cursorOf(usr, [], vals(5, 5)) == null);
  const win = build([dds({ t: 'R', name: 'R1' }), dds({ fn: 'WINDOW(5 10 8 40)' }), dds({ fn: 'CSRLOC(LINNBR POSNBR)' }), dds({ name: 'F1', len: 5, type: 'A', use: 'B', line: 2, col: 2 }), hidden('LINNBR'), hidden('POSNBR')]);
  check('a window record: not drawn (positions inside a window are not modelled)', cursorOf(win, [], vals(2, 2)) == null);
  const malformed = build(base([dds({ fn: 'CSRLOC(LINNBR)' })]));
  check('one parameter only: no cursor', cursorOf(malformed, [], vals(5, 5)) == null);
}

console.log('E3k: the E3f store namespace');
{
  const key = DspfEngine.cursorLocationKey('r1', 'linnbr');
  check('the key is RECORD|FIELD, upper case', key === 'R1|LINNBR');
  let values = IndicatorSim.emptyValues();
  let res = IndicatorSim.setValue(values, 'cursorLocation', key, '12');
  check('a text number is stored as an integer', res.ok && IndicatorSim.getValue(res.values, 'cursorLocation', key) === 12);
  values = res.values;
  check('1000 is refused (3-byte field)', !IndicatorSim.setValue(values, 'cursorLocation', key, 1000).ok);
  check('-1 and 2.5 are refused', !IndicatorSim.setValue(values, 'cursorLocation', key, -1).ok && !IndicatorSim.setValue(values, 'cursorLocation', key, 2.5).ok);
  check('a malformed key is dropped on load', Object.keys(IndicatorSim.normalizeValues({ cursorLocation: { 'bad': 1, 'R1|A|B': 1, 'R1|LINNBR': 7 } }).cursorLocation).join() === 'R1|LINNBR');
  check('describeValueKey reads well', IndicatorSim.describeValueKey('cursorLocation', 'R1|LINNBR') === 'R1.LINNBR (CSRLOC)');
  check('null removes it', IndicatorSim.getValue(IndicatorSim.setValue(values, 'cursorLocation', key, null).values, 'cursorLocation', key) === undefined);
}

const src = [
  buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
  buildLine({ seq: '00020', ind1: '71', func: 'CSRLOC(CSRROW CSRCOL)' }),
  buildLine({ seq: '00030', name: 'NAME', dataType: 'A', length: '10', usage: 'B', line: '4', col: '5' }),
  buildLine({ seq: '00040', name: 'CSRROW', dataType: 'S', length: '3', decimals: '0', usage: 'H' }),
  buildLine({ seq: '00050', name: 'CSRCOL', dataType: 'S', length: '3', decimals: '0', usage: 'H' }),
  buildLine({ seq: '00060', nameType: 'R', name: 'SCR2' }),
  buildLine({ seq: '00070', name: 'OTHER', dataType: 'A', length: '5', usage: 'O', line: '1', col: '1' }),
].join('\n') + '\n';

const posted = [];
const dom = leaseDspfPage(src, 'E3KCURSOR.DSPF', { posted: posted });

setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const aside = () => doc.getElementById('indicatorList');
  const toolbar = () => doc.getElementById('toolbarIndicatorList');
  const inputs = (c) => Array.from(c.querySelectorAll('.sim-cursor-input'));
  const cursorEl = () => doc.querySelector('#screenOutput .dspf-csrloc-cursor');
  const saves = () => posted.filter((m) => m.type === 'saveSimulatorState');
  const lastSave = () => saves()[saves().length - 1];
  const setBox = (box, v) => { box.value = v; fire(box, 'change'); };
  const edits = () => posted.filter((m) => m.type === 'applyEdit').length;

  console.log('E3k: the designer');
  check('setup: the editor shows the two field names (aside and toolbar copies)', inputs(aside()).map((i) => i.dataset.key).join() === 'SCR1|CSRROW,SCR1|CSRCOL' && inputs(toolbar()).length === 2);
  check('nothing stored: no cursor drawn', !cursorEl());
  setBox(inputs(aside())[0], '10');
  check('one value: still no cursor, the value is posted', !cursorEl() && JSON.stringify(lastSave().values) === JSON.stringify({ cursorLocation: { 'SCR1|CSRROW': 10 } }));
  setBox(inputs(aside())[1], '25');
  check('both set but 71 is off: the keyword is not in effect, no cursor', !cursorEl());
  const ind71 = Array.from(aside().querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind 71'));
  ind71.querySelector('input').checked = true;
  fire(ind71.querySelector('input'), 'change');
  check('71 on: the cursor is drawn at line 10, position 25', !!cursorEl() && /grid-row:10;grid-column:25;/.test(cursorEl().getAttribute('style')));
  check('the box keeps its value after the redraw, in both copies', inputs(aside())[1].value === '25' && inputs(toolbar())[1].value === '25');
  setBox(inputs(toolbar())[0], '99');
  check('a line past the screen: the cursor is ignored', !cursorEl());
  setBox(inputs(aside())[0], '');
  check('an empty box removes the stored value', JSON.stringify(lastSave().values) === JSON.stringify({ cursorLocation: { 'SCR1|CSRCOL': 25 } }));
  setBox(inputs(aside())[0], '5000');
  check('a value over 999 is refused with a message and not stored', !!lastSave() && JSON.stringify(lastSave().values) === JSON.stringify({ cursorLocation: { 'SCR1|CSRCOL': 25 } }) && aside().querySelector('.sim-scn-msg').textContent !== '');
  check('the stored-values list shows the stored value', /SCR1\.CSRCOL \(CSRLOC\)/.test(aside().textContent));
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'SCR2';
  fire(recordSelect, 'change');
  check('a record without CSRLOC has no editor', !aside().querySelector('.sim-cursor'));
  check('nothing was written to the DDS source', edits() === 0);

  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}, 0);

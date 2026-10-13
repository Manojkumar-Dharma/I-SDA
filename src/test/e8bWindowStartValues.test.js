/**
 * e8bWindowStartValues.test.js
 *
 * Task E8b - the design-time values behind a runtime-valued WINDOW start (E3f store, namespace 'windowStart').
 *  1. DspfEngine.windowStartParts: every form of the WINDOW keyword from the E8a inventory
 *  2. DspfEngine.windowStartMax / windowStartProblem: what fits on a 24 x 80 and a 27 x 132 display
 *  3. the namespace: keys, values, listing, saving
 *  4. nothing is drawn differently yet (E8c) and nothing reaches the source
 *
 * Run with: node src/test/e8bWindowStartValues.test.js
 */
'use strict';

const path = require('path');
const DspfEngine = require('../dspfEngine.js');
const IndicatorSim = require('../indicatorSim.js');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');

const build = (lines) => DspfParser.parseDspf(lines.join('\n') + '\n');
const recordWith = (windowParams) => build([
  dds({ t: 'R', name: 'WIN1' }),
  dds({ fn: 'WINDOW(' + windowParams + ')' }),
  dds({ name: 'F1', len: 5, type: 'A', use: 'B', line: 2, col: 2 })
]).records[0];
const parts = (p) => DspfEngine.windowStartParts(recordWith(p));

console.log('E8b: windowStartParts - the forms');
{
  const dft = parts('*DFT 9 30');
  check('*DFT form: both coordinates are *DFT, size is read', dft.form === 'dft' && dft.line.kind === 'dft' && dft.position.kind === 'dft' && dft.lines === 9 && dft.positions === 30);
  check('*DFT form: both coordinates are runtime', dft.runtime.join() === 'line,position');
  const lit = parts('4 20 9 30');
  check('all literals: nothing is runtime', lit.runtime.length === 0 && lit.line.value === 4 && lit.position.value === 20 && lit.form === 'direct');
  const both = parts('&LINE &POS 9 30');
  check('two fields: both runtime, names kept without the ampersand', both.runtime.join() === 'line,position' && both.line.field === 'LINE' && both.position.field === 'POS');
  const posOnly = parts('4 &POS 9 30');
  check('literal line + field position: only the position is runtime, the 4 is kept', posOnly.runtime.join() === 'position' && posOnly.line.kind === 'literal' && posOnly.line.value === 4);
  const lineOnly = parts('&LINE 20 9 30');
  check('field line + literal position: only the line is runtime', lineOnly.runtime.join() === 'line' && lineOnly.position.value === 20);
  check('field names are upper-cased', parts('&line &pos 9 30').line.field === 'LINE');
  const opts = parts('*DFT 9 30 *NOMSGLIN *NORSTCSR');
  check('trailing *MSGLIN / *RSTCSR options are not mistaken for parameters', opts && opts.lines === 9 && opts.positions === 30);
  const opts4 = parts('&LINE 20 9 30 *MSGLIN *RSTCSR');
  check('same for the four-number form', opts4 && opts4.runtime.join() === 'line' && opts4.positions === 30);
  check('WINDOW(record-format-name) has no corner of its own', parts('WIN2') === null);
  check('a malformed keyword gives null, not a guess', parts('4 20 9') === null && parts('*DFT 9') === null && parts('4 20 X 30') === null);
  check('a record without WINDOW gives null', DspfEngine.windowStartParts(build([dds({ t: 'R', name: 'R1' })]).records[0]) === null);
  check('null and undefined records give null', DspfEngine.windowStartParts(null) === null && DspfEngine.windowStartParts(undefined) === null);
}

console.log('E8b: windowStartMax / windowStartProblem');
{
  // IBM: lower border = start line + lines + 1; right border = start position + positions + 3
  check('24 lines, 9-line window: highest start line is 14 (lower border on line 24)', DspfEngine.windowStartMax('line', 9, 24) === 14);
  check('80 columns, 30-position window: highest start position is 47 (right border on 80)', DspfEngine.windowStartMax('position', 30, 80) === 47);
  check('27 x 132 display gives more room', DspfEngine.windowStartMax('line', 9, 27) === 17 && DspfEngine.windowStartMax('position', 30, 132) === 99);
  const p = parts('4 &POS 9 30');
  check('highest start position is accepted', DspfEngine.windowStartProblem('position', 47, p, 24, 80) === '');
  check('one past it is refused with the limit named', /47 or lower/.test(DspfEngine.windowStartProblem('position', 48, p, 24, 80)));
  check('highest start line is accepted, one past is refused', DspfEngine.windowStartProblem('line', 14, p, 24, 80) === '' && /14 or lower/.test(DspfEngine.windowStartProblem('line', 15, p, 24, 80)));
  check('the same value fits on the wide display', DspfEngine.windowStartProblem('position', 90, p, 27, 132) === '');
  check('1 is the lowest start, 0 and negatives are refused', DspfEngine.windowStartProblem('line', 1, p, 24, 80) === '' && DspfEngine.windowStartProblem('line', 0, p, 24, 80) !== '' && DspfEngine.windowStartProblem('position', -3, p, 24, 80) !== '');
  check('a fraction or text is refused', DspfEngine.windowStartProblem('line', 2.5, p, 24, 80) !== '' && DspfEngine.windowStartProblem('line', 'x', p, 24, 80) !== '');
  const full = parts('&LINE &POS 24 80');
  check('a window as large as the display has no valid start (max below 1)', DspfEngine.windowStartProblem('line', 1, full, 24, 80) !== '');
}

console.log('E8b: the windowStart namespace');
{
  const key = DspfEngine.windowStartKey('win1', 'line');
  check('key is RECORD|LINE, upper case', key === 'WIN1|LINE' && DspfEngine.windowStartKey('Win1', 'Position') === 'WIN1|POSITION');
  check('namespace is registered', !!IndicatorSim.VALUE_NAMESPACES.windowStart);
  let res = IndicatorSim.setValue(IndicatorSim.emptyValues(), 'windowStart', key, '6');
  check('a text number is stored as an integer', res.ok && IndicatorSim.getValue(res.values, 'windowStart', key) === 6);
  const values = res.values;
  check('line and position are stored independently', IndicatorSim.setValue(values, 'windowStart', DspfEngine.windowStartKey('WIN1', 'position'), 12).ok);
  check('0, 133 and 2.5 are refused', !IndicatorSim.setValue(values, 'windowStart', key, 0).ok && !IndicatorSim.setValue(values, 'windowStart', key, 133).ok && !IndicatorSim.setValue(values, 'windowStart', key, 2.5).ok);
  check('a key that is not LINE or POSITION is refused', !IndicatorSim.setValue(values, 'windowStart', 'WIN1|COLUMN', 5).ok && !IndicatorSim.setValue(values, 'windowStart', 'WIN1', 5).ok);
  const loaded = IndicatorSim.normalizeValues({ windowStart: { 'WIN1|LINE': 3, 'WIN1|ROW': 3, 'bad': 1, 'WIN2|POSITION': 500 } });
  check('malformed keys and out-of-range values are dropped on load', Object.keys(loaded.windowStart).join() === 'WIN1|LINE');
  check('describeValueKey reads well', IndicatorSim.describeValueKey('windowStart', 'WIN1|LINE') === 'WIN1 (window start line)' && IndicatorSim.describeValueKey('windowStart', 'WIN1|POSITION') === 'WIN1 (window start position)');
  const rows = IndicatorSim.valueRows(IndicatorSim.setValue(values, 'windowStart', 'WIN1|POSITION', 12).values);
  check('listed for the simulator panel with its label', rows.length === 2 && rows[0].namespace === 'windowStart' && /Window start/.test(rows[0].label));
  check('null removes the value', IndicatorSim.getValue(IndicatorSim.setValue(values, 'windowStart', key, null).values, 'windowStart', key) === undefined);
  check('clearing the namespace leaves other namespaces alone', (() => {
    let v = IndicatorSim.setValue(values, 'cursorLocation', 'R1|LINNBR', 5).values;
    v = IndicatorSim.clearValues(v, 'windowStart');
    return v.windowStart === undefined && IndicatorSim.getValue(v, 'cursorLocation', 'R1|LINNBR') === 5;
  })());
  const memo = (() => { const m = {}; return { get: (k) => m[k], update: (k, v) => { m[k] = v; return Promise.resolve(); } }; })();
  IndicatorSim.saveFileState(memo, 'file:a', { scenarios: [], values });
  check('saved per file and read back', IndicatorSim.getValue(IndicatorSim.loadFileState(memo, 'file:a').values, 'windowStart', key) === 6 && IndicatorSim.loadFileState(memo, 'file:b').values.windowStart === undefined);
}

console.log('E8b: nothing changes yet');
{
  const model = build([dds({ t: 'R', name: 'WIN1' }), dds({ fn: 'WINDOW(*DFT 9 30)' }), dds({ name: 'F1', len: 5, type: 'A', use: 'B', line: 2, col: 2 })]);
  const before = DspfEngine.resolveWindow(model.records[0], model);
  model.windowStartValues = { 'WIN1|LINE': 10, 'WIN1|POSITION': 20 };
  const after = DspfEngine.resolveWindow(model.records[0], model);
  check('a stored value does not move the window until E8c reads it', before.line === after.line && before.col === after.col && after.positionIsDefault === true);
}

if (failureCount() > 0) process.exit(1);
console.log('\nALL CHECKS PASSED');

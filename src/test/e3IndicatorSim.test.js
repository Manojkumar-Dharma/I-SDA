/**
 * e3IndicatorSim.test.js
 *
 * Tasks E3b / E3c / E3f - the pure logic of the indicator simulator (src/indicatorSim.js).
 *  1. indicator numbers
 *  2. discovery: what a screen uses, what the file uses, INDTXT labels, the list rows
 *  3. scenarios: normalise, save, overwrite, rename, delete, limits
 *  4. the program-to-system value store: namespaces, validation, set / clear / rows
 *  5. the per-file state and its workspaceState storage (a fake memento)
 *
 * Run with: node src/test/e3IndicatorSim.test.js
 */
'use strict';

const path = require('path');
const IndicatorSim = require(path.join(__dirname, '../indicatorSim.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

const R = (name, extra) => buildLine(Object.assign({ seq: '00010', nameType: 'R', name: name }, extra || {}));
const parse = (lines) => DspfParser.parseDspf(lines.join('\n') + '\n');

console.log('=== 1. indicator numbers ===');
check('1 / "1" / "01" / " 07 " normalise to two digits', IndicatorSim.normalizeIndicator(1) === '01' && IndicatorSim.normalizeIndicator('7') === '07' && IndicatorSim.normalizeIndicator(' 07 ') === '07');
check('0, 100, text and empty are not indicators', ['0', '00', '100', 'x1', '', null, undefined, '1.5'].every((v) => IndicatorSim.normalizeIndicator(v) === null));
check('a set is sorted, de-duplicated and cleaned', IndicatorSim.normalizeIndicatorSet(['51', 3, '03', 'zz', '01', 200]).join() === '01,03,51');
check('01 - 99 is ninety-nine numbers', IndicatorSim.allIndicatorNumbers().length === 99 && IndicatorSim.allIndicatorNumbers()[0] === '01' && IndicatorSim.allIndicatorNumbers()[98] === '99');

console.log('=== 2. discovery ===');
// FILE: a file-level keyword on 71 and an INDTXT; SCR1 uses 51 (record keyword), 52 (field) and 53 (field keyword);
// SCR2 uses 54; the SFL pair DTLCTL / DTLSFL uses 61 on the SFL side and 62 on the SFLCTL side.
const src = [
  buildLine({ seq: '00005', ind1: '71', func: 'CA03(03)' }),
  buildLine({ seq: '00006', func: "INDTXT(71 'Exit requested')" }),
  R('SCR1'),
  buildLine({ seq: '00020', ind1: '51', func: 'ALARM' }),
  buildLine({ seq: '00021', func: "INDTXT(51 'Customer on hold')" }),
  buildLine({ seq: '00030', ind1: '52', name: 'NAME', dataType: 'A', length: '10', usage: 'B', line: '4', col: '5' }),
  buildLine({ seq: '00031', ind1: '53', func: 'DSPATR(HI)' }),
  buildLine({ seq: '00032', func: "INDTXT(53 'it''s high')" }),
  R('SCR2'),
  buildLine({ seq: '00050', name: 'OTHER', dataType: 'A', length: '5', usage: 'O', line: '1', col: '1' }),
  buildLine({ seq: '00051', ind1: '54', func: 'DSPATR(RI)' }),
  buildLine({ seq: '00060', nameType: 'R', name: 'DTLSFL', func: 'SFL' }),
  buildLine({ seq: '00061', ind1: '61', name: 'SFLFLD', dataType: 'A', length: '10', usage: 'B', line: '1', col: '2' }),
  buildLine({ seq: '00070', nameType: 'R', name: 'DTLCTL', func: 'SFLCTL(DTLSFL)' }),
  buildLine({ seq: '00071', func: 'SFLSIZ(10)' }),
  buildLine({ seq: '00072', func: 'SFLPAG(5)' }),
  buildLine({ seq: '00073', ind1: '62', func: 'SFLDSP' }),
];
const model = parse(src);
check('setup: the model has the records', model.records.map((r) => r.name).join() === 'SCR1,SCR2,DTLSFL,DTLCTL');

const ctx = (name, pulldown) => IndicatorSim.contextIndicators(model, name, pulldown);
check('a screen lists its record keyword, field and field-keyword indicators, plus the file-level one', ctx('SCR1').join() === '51,52,53,71');
check('another record lists only its own, plus the file-level one', ctx('SCR2').join() === '54,71');
check('previewing the SFLCTL side includes the SFL side', ctx('DTLCTL').join() === '61,62,71');
check('previewing the SFL side alone leaves the SFLCTL side out', ctx('DTLSFL').join() === '61,71');
check('an open pulldown record adds its indicators', ctx('SCR2', 'SCR1').join() === '51,52,53,54,71');
check('an unknown record still gets the file-level indicators', ctx('NOPE').join() === '71');
check('the whole file lists every indicator once, sorted', IndicatorSim.fileIndicators(model).join() === '51,52,53,54,61,62,71');
check('a null model is harmless', IndicatorSim.contextIndicators(null, 'X').length === 0 && IndicatorSim.fileIndicators(null).length === 0);

console.log('  INDTXT');
check("INDTXT(01 'text') parses; the quotes are required", IndicatorSim.parseIndtxt("01 'Hold'") && IndicatorSim.parseIndtxt("01 'Hold'").text === 'Hold' && IndicatorSim.parseIndtxt('01 Hold') === null);
check('a doubled quote is one quote', IndicatorSim.parseIndtxt("5 'it''s'").text === "it's" && IndicatorSim.parseIndtxt("5 'it''s'").number === '05');
check('indicator 0 / 100 / no indicator do not parse', IndicatorSim.parseIndtxt("0 'x'") === null && IndicatorSim.parseIndtxt("100 'x'") === null && IndicatorSim.parseIndtxt("'x'") === null && IndicatorSim.parseIndtxt('') === null);
const labels = IndicatorSim.indicatorLabels(model);
check('labels come from file, record and field level INDTXT', labels['71'] === 'Exit requested' && labels['51'] === 'Customer on hold' && labels['53'] === "it's high");
check('an indicator with no INDTXT has no label', !('52' in labels));
const dup = parse([R('A'), buildLine({ seq: '00020', func: "INDTXT(10 'first')" }), buildLine({ seq: '00030', func: "INDTXT(10 'second')" })]);
check('the first INDTXT for an indicator wins', IndicatorSim.indicatorLabels(dup)['10'] === 'first');

console.log('  the list rows');
let rows = IndicatorSim.indicatorEntries(model, 'SCR1', { active: new Set(['52']) });
check('screen scope: the used indicators, labelled, with their state', rows.map((r) => r.number).join() === '51,52,53,71' && rows[0].label === 'Customer on hold' && rows[1].label === '' && rows[1].on === true && rows[0].on === false && rows.every((r) => r.used));
rows = IndicatorSim.indicatorEntries(model, 'SCR1', { scope: 'file', active: [] });
check('file scope: everything the file uses', rows.map((r) => r.number).join() === '51,52,53,54,61,62,71');
rows = IndicatorSim.indicatorEntries(model, 'SCR1', { showAll: true, active: ['99'] });
check('show all: 01 - 99', rows.length === 99 && rows[0].number === '01' && rows[98].number === '99');
check('show all: used is true only for what the scope uses', rows.filter((r) => r.used).map((r) => r.number).join() === '51,52,53,71');
check('show all: an indicator that is ON but unused is listed as on', rows[98].on === true && rows[98].used === false);
check('show all keeps the labels', rows.find((r) => r.number === '51').label === 'Customer on hold');
check('no options is the screen scope with nothing on', IndicatorSim.indicatorEntries(model, 'SCR2').map((r) => r.number + (r.on ? '*' : '')).join() === '54,71');

console.log('=== 3. scenarios ===');
const scn = IndicatorSim.normalizeScenarios([
  { name: '  Error   state ', indicators: ['52', '1', 'x'] },
  { name: 'error state', indicators: ['03'] },
  { name: '', indicators: [] },
  { name: 'x'.repeat(41), indicators: [] },
  null, 'string', 7,
  { name: 'Empty subfile', indicators: ['61', '61'] },
  { name: 'No list' },
]);
check('names are cleaned, case-insensitive duplicates, empty / over-long names and junk dropped', scn.map((s) => s.name).join('|') === 'Error state|Empty subfile|No list');
check('indicators are normalised; a missing list is empty', scn[0].indicators.join() === '01,52' && scn[1].indicators.join() === '61' && scn[2].indicators.length === 0);
check('anything that is not an array gives an empty list', IndicatorSim.normalizeScenarios(null).length === 0 && IndicatorSim.normalizeScenarios({}).length === 0);

let r = IndicatorSim.saveScenario([], ' Error state ', new Set(['52', '51']));
check('save: a new scenario is appended with sorted indicators', r.ok && r.scenarios.length === 1 && r.scenarios[0].name === 'Error state' && r.scenarios[0].indicators.join() === '51,52');
const before = r.scenarios;
r = IndicatorSim.saveScenario(before, 'ERROR STATE', ['01']);
check('save: an existing name (any case) is overwritten in place, with the new spelling', r.ok && r.scenarios.length === 1 && r.scenarios[0].name === 'ERROR STATE' && r.scenarios[0].indicators.join() === '01');
check('save does not change the array it was given', before[0].name === 'Error state' && before[0].indicators.join() === '51,52');
r = IndicatorSim.saveScenario(before, '   ', ['01']);
check('save: an empty name is refused', !r.ok && /name/i.test(r.error) && r.scenarios.length === 1);
r = IndicatorSim.saveScenario(before, 'y'.repeat(41), ['01']);
check('save: an over-long name is refused', !r.ok && /40/.test(r.error));
const many = [];
for (let i = 0; i < IndicatorSim.MAX_SCENARIOS; i++) many.push({ name: 'S' + i, indicators: [] });
r = IndicatorSim.saveScenario(many, 'one more', []);
check('save: the 51st scenario is refused, overwriting one is still allowed', !r.ok && /50/.test(r.error) && IndicatorSim.saveScenario(many, 's3', ['01']).ok);

const three = IndicatorSim.normalizeScenarios([{ name: 'A', indicators: ['01'] }, { name: 'B', indicators: ['02'] }, { name: 'C', indicators: ['03'] }]);
r = IndicatorSim.renameScenario(three, 'b', ' Bee ');
check('rename: keeps position and indicators', r.ok && r.scenarios.map((s) => s.name).join() === 'A,Bee,C' && r.scenarios[1].indicators.join() === '02');
r = IndicatorSim.renameScenario(three, 'B', 'c');
check('rename: onto another name is refused', !r.ok && /already exists/.test(r.error));
r = IndicatorSim.renameScenario(three, 'B', 'b');
check('rename: to the same name in another case is allowed', r.ok && r.scenarios[1].name === 'b');
check('rename: a missing scenario is refused', !IndicatorSim.renameScenario(three, 'Z', 'Q').ok);
check('the name check names the clash and respects the scenario being renamed', IndicatorSim.scenarioNameProblem(three, 'a') !== '' && IndicatorSim.scenarioNameProblem(three, 'a', 'A') === '' && IndicatorSim.scenarioNameProblem(three, '') !== '');
r = IndicatorSim.deleteScenario(three, 'a');
check('delete: removes by name, any case', r.ok && r.scenarios.map((s) => s.name).join() === 'B,C');
check('delete: a missing scenario is refused', !IndicatorSim.deleteScenario(three, 'Z').ok);
check('find: by name, any case, or null', IndicatorSim.findScenario(three, 'c').name === 'C' && IndicatorSim.findScenario(three, 'zzz') === null);

console.log('=== 4. the value store ===');
const KEY = (rec, fld, n) => rec + '|' + fld + '|' + n;
let v = IndicatorSim.setValue({}, 'choiceControl', KEY('SCR1', 'SEL', 1), 3);
check('set: stores a value in its namespace', v.ok && IndicatorSim.getValue(v.values, 'choiceControl', 'SCR1|SEL|1') === 3);
check('get: undefined when nothing is stored (0 is a value, not nothing)', IndicatorSim.getValue(v.values, 'choiceControl', 'SCR1|SEL|2') === undefined && IndicatorSim.getValue({}, 'choiceControl', 'x') === undefined && IndicatorSim.getValue(IndicatorSim.setValue({}, 'choiceControl', 'A|B|1', 0).values, 'choiceControl', 'A|B|1') === 0);
check('set: a numeric string is accepted as a number', IndicatorSim.setValue({}, 'choiceControl', 'A|B|1', '2').values.choiceControl['A|B|1'] === 2);
check('set: 5, -1, 1.5, text and NaN are refused and the store is unchanged', [5, -1, 1.5, 'x', NaN].every((bad) => {
  const out = IndicatorSim.setValue(v.values, 'choiceControl', 'SCR1|SEL|1', bad);
  return !out.ok && out.values.choiceControl['SCR1|SEL|1'] === 3;
}));
check('set: a malformed key (no choice number, bad shape) is refused', ['SCR1|SEL', 'SCR1|SEL|0', 'SCR1|SEL|x', '|SEL|1', 'SCR1||1', 'a|b|c|1'].every((k) => !IndicatorSim.setValue({}, 'choiceControl', k, 1).ok));
check('set: an unknown namespace is refused', !IndicatorSim.setValue({}, 'nope', 'A|B|1', 1).ok);
const second = IndicatorSim.setValue(v.values, 'choiceControl', KEY('SCR1', 'SEL', 2), 1);
check('set: a second value joins the first; the input store is not changed', Object.keys(second.values.choiceControl).length === 2 && Object.keys(v.values.choiceControl).length === 1);
const removed = IndicatorSim.setValue(second.values, 'choiceControl', KEY('SCR1', 'SEL', 1), null);
check('set to null removes one value', removed.ok && !('SCR1|SEL|1' in removed.values.choiceControl) && removed.values.choiceControl['SCR1|SEL|2'] === 1);
check('removing the last value removes the namespace', Object.keys(IndicatorSim.setValue(removed.values, 'choiceControl', KEY('SCR1', 'SEL', 2), '').values).length === 0);
check('namespaceValues is a copy the caller may keep', (() => {
  const copy = IndicatorSim.namespaceValues(second.values, 'choiceControl');
  copy['X|Y|1'] = 4;
  return !('X|Y|1' in second.values.choiceControl) && Object.keys(IndicatorSim.namespaceValues({}, 'choiceControl')).length === 0;
})());
const dirty = IndicatorSim.normalizeValues({ choiceControl: { 'A|B|1': 4, 'A|B|2': 9, 'bad': 1, 'A|B|3': 'x', 'A|B|4': '3' }, unknown: { 'A|B|1': 1 }, other: 5 });
check('normalise keeps what is valid (numeric strings become numbers) and drops the rest, unknown namespaces included', Object.keys(dirty).join() === 'choiceControl' && JSON.stringify(dirty.choiceControl) === JSON.stringify({ 'A|B|1': 4, 'A|B|4': 3 }));
check('normalise of junk is an empty store', ['x', 5, null, [], undefined].every((j) => Object.keys(IndicatorSim.normalizeValues(j)).length === 0));
check('clear: one namespace or everything', Object.keys(IndicatorSim.clearValues(second.values, 'choiceControl')).length === 0 && Object.keys(IndicatorSim.clearValues(second.values)).length === 0);
const vr = IndicatorSim.valueRows(second.values);
check('rows: flat, sorted by key, with the namespace label', vr.length === 2 && vr[0].key === 'SCR1|SEL|1' && vr[1].key === 'SCR1|SEL|2' && /CHCCTL/.test(vr[0].label) && vr[0].namespace === 'choiceControl');
check('a key is described readably', IndicatorSim.describeValueKey('choiceControl', 'SCR1|SEL|2') === 'SCR1.SEL (choice / row 2)' && IndicatorSim.describeValueKey('other', 'k') === 'k');
check('the choice control namespace is 0 - 4, matching the CHCCTL table', IndicatorSim.VALUE_NAMESPACES.choiceControl.min === 0 && IndicatorSim.VALUE_NAMESPACES.choiceControl.max === 4);

console.log('=== 5. the per-file state and its storage ===');
check('normalizeState cleans both halves and tolerates junk', (() => {
  const s = IndicatorSim.normalizeState({ scenarios: [{ name: 'A', indicators: ['1'] }, 5], values: { choiceControl: { 'A|B|1': 2 } } });
  return s.scenarios.length === 1 && s.scenarios[0].indicators[0] === '01' && s.values.choiceControl['A|B|1'] === 2 && IndicatorSim.normalizeState(null).scenarios.length === 0 && IndicatorSim.normalizeState('x').scenarios.length === 0;
})());
check('empty: no scenarios and no values', IndicatorSim.isEmptyState({}) && IndicatorSim.isEmptyState(null) && !IndicatorSim.isEmptyState({ scenarios: [{ name: 'A', indicators: [] }] }) && !IndicatorSim.isEmptyState({ values: { choiceControl: { 'A|B|1': 1 } } }));

const memento = (() => {
  const data = {};
  return { data, get: (k) => data[k], update: (k, val) => { if (val === undefined) delete data[k]; else data[k] = JSON.parse(JSON.stringify(val)); return Promise.resolve(); } };
})();
(async () => {
  check('a file with nothing saved loads empty', IndicatorSim.isEmptyState(IndicatorSim.loadFileState(memento, 'file:///a.dspf')));
  await IndicatorSim.saveFileState(memento, 'file:///a.dspf', { scenarios: [{ name: 'A', indicators: ['01'] }], values: { choiceControl: { 'X|Y|1': 3 } } });
  await IndicatorSim.saveFileState(memento, 'file:///b.dspf', { scenarios: [{ name: 'B', indicators: [] }] });
  const a = IndicatorSim.loadFileState(memento, 'file:///a.dspf');
  const b = IndicatorSim.loadFileState(memento, 'file:///b.dspf');
  check('each file has its own state under one key', a.scenarios[0].name === 'A' && a.values.choiceControl['X|Y|1'] === 3 && b.scenarios[0].name === 'B' && Object.keys(b.values).length === 0 && Object.keys(memento.data).join() === IndicatorSim.STATE_KEY);
  await IndicatorSim.saveFileState(memento, 'file:///a.dspf', { scenarios: [], values: {} });
  check('saving an empty state removes that file\'s entry only', IndicatorSim.isEmptyState(IndicatorSim.loadFileState(memento, 'file:///a.dspf')) && IndicatorSim.loadFileState(memento, 'file:///b.dspf').scenarios.length === 1);
  await IndicatorSim.saveFileState(memento, 'file:///b.dspf', {});
  check('when no file has state the key itself is removed', !(IndicatorSim.STATE_KEY in memento.data));
  check('loading from a missing memento, or hand-edited storage, gives an empty state', IndicatorSim.isEmptyState(IndicatorSim.loadFileState(null, 'x')) && (() => { memento.data[IndicatorSim.STATE_KEY] = { 'file:///c.dspf': { scenarios: 'bad', values: 7 } }; return IndicatorSim.isEmptyState(IndicatorSim.loadFileState(memento, 'file:///c.dspf')); })());
  delete memento.data[IndicatorSim.STATE_KEY];
  for (let i = 0; i < IndicatorSim.MAX_STORED_FILES + 5; i++) {
    await IndicatorSim.saveFileState(memento, 'file:///f' + i + '.dspf', { scenarios: [{ name: 'S', indicators: [] }] });
  }
  const kept = Object.keys(memento.data[IndicatorSim.STATE_KEY]);
  check('only the most recently saved files are kept', kept.length === IndicatorSim.MAX_STORED_FILES && !kept.includes('file:///f0.dspf') && kept.includes('file:///f' + (IndicatorSim.MAX_STORED_FILES + 4) + '.dspf'));
  await IndicatorSim.saveFileState(memento, 'file:///f10.dspf', { scenarios: [{ name: 'T', indicators: [] }] });
  const keys = Object.keys(memento.data[IndicatorSim.STATE_KEY]);
  check('saving a file again moves it to the newest end', keys[keys.length - 1] === 'file:///f10.dspf' && keys.length === IndicatorSim.MAX_STORED_FILES);

  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
})();

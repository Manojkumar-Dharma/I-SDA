/**
 * e3eExplainPanel.test.js - E3e: the explain panel (field and record panels, Keywords tab).
 *  1. DspfEngine.conditionsExpression / explainConditions (the text of a condition and what decided it)
 *  2. DspfEngine.explainKeywords (owner conditions, hidden fields, first-in-effect keywords)
 *  3. the answer agrees with conditionsSatisfied for every combination of two indicators
 *  4. the webview: the accordion on a field and on a record, refreshed by the indicator checkboxes
 * Run with: node src/test/e3eExplainPanel.test.js
 */
'use strict';
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const H = require('./helpers/keywordMatrix');
const { check, failureCount } = require('./helpers/harness');
const { dds } = H;
const F = (o) => dds(Object.assign({ len: 10, type: 'A', use: 'B', line: 3, col: 2 }, o));
const parse = (...lines) => DspfParser.parseDspf(lines.join('\n') + '\n');
const R1 = dds({ t: 'R', name: 'R1' });
const on = (...n) => new Set(n);

console.log('=== 1. conditions ===');
{
  const m = parse(R1, F({ name: 'F1' }), dds({ ind: ' 01', fn: 'COLOR(RED)' }), dds({ ind: 'N02', fn: 'DSPATR(HI)' }), dds({ fn: 'ALARM' }));
  const kws = m.records[0].fields[0].keywords;
  check('no condition: empty expression, always in effect', DspfEngine.conditionsExpression(kws[2].conditions) === '' && DspfEngine.explainConditions(kws[2].conditions, on()).active);
  check('expression as written: 01', DspfEngine.conditionsExpression(kws[0].conditions) === '01');
  check('expression as written: N02', DspfEngine.conditionsExpression(kws[1].conditions) === 'N02');
  const e1 = DspfEngine.explainConditions(kws[0].conditions, on());
  check('01 off: not in effect, says 01 is off', !e1.active && e1.reason === '01 is off');
  const e2 = DspfEngine.explainConditions(kws[0].conditions, on('01'));
  check('01 on: in effect, says 01 is on', e2.active && e2.reason === '01 is on');
  const e3 = DspfEngine.explainConditions(kws[1].conditions, on('02'));
  check('N02 with 02 on: not in effect', !e3.active && e3.reason === 'N02: 02 is on');
  const e4 = DspfEngine.explainConditions(kws[1].conditions, on());
  check('N02 with 02 off: in effect', e4.active && e4.reason === 'N02: 02 is off');
}
{
  // AND within a group, OR between groups
  const conds = [{ relation: 'AND', indicators: [{ number: '01', not: false }, { number: '02', not: true }], displaySizeCondition: null },
    { relation: 'OR', indicators: [{ number: '03', not: false }], displaySizeCondition: null }];
  check('expression joins AND inside a group and OR between groups', DspfEngine.conditionsExpression(conds) === '01 AND N02 OR 03');
  check('group 1 holds: both facts listed', DspfEngine.explainConditions(conds, on('01')).reason === '01 is on, N02: 02 is off');
  check('group 2 holds', DspfEngine.explainConditions(conds, on('02', '03')).reason === '03 is on');
  check('neither holds: the failing fact of each group', DspfEngine.explainConditions(conds, on('02')).reason === '01 is off; 03 is off');
  const size = [{ relation: 'AND', indicators: [], displaySizeCondition: { name: '*DS3', not: false } }];
  check('display size: selected holds', DspfEngine.explainConditions(size, on(), '*DS3').active && DspfEngine.conditionsExpression(size) === '*DS3');
  check('display size: other size does not', !DspfEngine.explainConditions(size, on(), '*DS4').active);
  const nsize = [{ relation: 'AND', indicators: [], displaySizeCondition: { name: '*DS3', not: true } }];
  check('N*DS3 with *DS3 selected fails', !DspfEngine.explainConditions(nsize, on(), '*DS3').active && DspfEngine.explainConditions(nsize, on(), '*DS4').active);
}

console.log('=== 2. explainKeywords ===');
{
  const m = parse(R1, dds({ ind: ' 10', name: 'F1', len: 10, type: 'A', use: 'B', line: 3, col: 2 }), dds({ ind: ' 01', fn: "DFTVAL('A')" }), dds({ ind: 'N02', fn: "DFTVAL('B')" }), dds({ fn: 'DSPATR(HI)' }));
  const f = m.records[0].fields[0];
  const x = DspfEngine.explainKeywords(f, { activeIndicators: on('10', '01') });
  check('owner condition is reported', x.owner.expression === '10' && x.owner.active && x.owner.reason === '10 is on');
  check('three lines, in source order', x.lines.map((l) => l.name).join() === 'DFTVAL,DFTVAL,DSPATR');
  check('first DFTVAL (01) in effect, second (N02) active but not used - an earlier one is in effect', x.lines[0].inEffect && x.lines[1].active && !x.lines[1].inEffect && /earlier DFTVAL/.test(x.lines[1].note));
  const y = DspfEngine.explainKeywords(f, { activeIndicators: on('10') });
  check('01 off: the N02 instance is the one in effect', !y.lines[0].inEffect && y.lines[1].inEffect && y.lines[1].note === null);
  const z = DspfEngine.explainKeywords(f, { activeIndicators: on('01') });
  check('field own condition off: nothing is in effect, each line says why', !z.owner.active && z.lines.every((l) => !l.inEffect && /own condition does not hold/.test(l.note)));
  check('line text is NAME(parameters)', z.lines[0].text === "DFTVAL('A')" && z.lines[2].text === 'DSPATR(HI)');
  const h = DspfEngine.explainKeywords(f, { activeIndicators: on('10', '01'), notDrawnReason: 'Not drawn: hidden fields are never drawn' });
  check('a hidden field: nothing in effect, the reason is given', h.lines.every((l) => !l.inEffect) && h.owner.notDrawnReason === 'Not drawn: hidden fields are never drawn');
  const rec = m.records[0];
  check('a record with no keywords: no lines', DspfEngine.explainKeywords({ conditions: [], keywords: [] }, {}).lines.length === 0 && rec.keywords.length === 0);
}

console.log('=== 3. agrees with conditionsSatisfied ===');
{
  const m = parse(R1, F({ name: 'F1' }), dds({ ind: ' 01', fn: 'COLOR(RED)' }), dds({ ind: 'N01', fn: 'DSPATR(RI)' }), dds({ ind: ' 02', fn: 'ALARM' }));
  const f = m.records[0].fields[0];
  let all = true;
  [[], ['01'], ['02'], ['01', '02']].forEach((set) => {
    const s = new Set(set);
    const ex = DspfEngine.explainKeywords(f, { activeIndicators: s });
    f.keywords.forEach((k, i) => { if (ex.lines[i].inEffect !== DspfEngine.conditionsSatisfied(k.conditions, s)) all = false; });
  });
  check('inEffect equals conditionsSatisfied for every keyword and indicator combination', all);
}

console.log('=== 4. the webview ===');
const { leaseDspfPage } = require('./helpers/common');
const L = (o) => buildLine(o);
const src = [
  L({ seq: '00010', nameType: 'R', name: 'SCR1' }),
  L({ seq: '00015', ind1: '05', func: 'OVERLAY' }),
  L({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2' }),
  L({ seq: '00030', ind1: '01', func: 'COLOR(RED)' }),
  L({ seq: '00040', func: 'DSPATR(HI)' }),
].join('\n') + '\n';
const dom = leaseDspfPage(src, 'E3E.DSPF');
setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const rows = () => Array.from(doc.querySelectorAll('details[data-accordion-key$="::explain"] .explain-row'));
  const state = (i) => rows()[i] && rows()[i].getAttribute('data-in-effect');
  const box = (n) => Array.from(doc.getElementById('indicatorList').querySelectorAll('.sim-ind-list label')).find((l) => l.textContent.includes('Ind ' + n));
  const field = () => Array.from(doc.querySelectorAll('.dspf-field')).find((e) => e.getAttribute('data-field') === 'FLD1');

  // record panel first (nothing selected)
  check('record panel: an Explain accordion exists', !!doc.querySelector('details[data-accordion-key="record-SCR1::explain"]'));
  check('record panel: OVERLAY (05) is listed and not in effect', rows().length === 1 && /OVERLAY/.test(rows()[0].textContent) && state(0) === 'false');
  if (box('05')) {
    box('05').querySelector('input').checked = true; fire(box('05').querySelector('input'), 'change');
    check('record panel: turning 05 on puts OVERLAY in effect', state(0) === 'true');
  } else check('record panel: indicator 05 is in the simulator list', false);

  field().dispatchEvent(new w.Event('click', { bubbles: true }));
  check('field panel: an Explain accordion exists', !!doc.querySelector('details[data-accordion-key^="field-"][data-accordion-key$="::explain"]'));
  check('field panel: two keyword rows', rows().length === 2);
  check('01 off: COLOR not in effect, DSPATR in effect', state(0) === 'false' && state(1) === 'true');
  check('the row shows the indicator expression and the reason', /01/.test(rows()[0].textContent) && /01 is off/.test(rows()[0].textContent) && /always in effect/.test(rows()[1].textContent));
  box('01').querySelector('input').checked = true; fire(box('01').querySelector('input'), 'change');
  check('turning 01 on refreshes the panel: COLOR now in effect', state(0) === 'true' && /01 is on/.test(rows()[0].textContent));
  box('01').querySelector('input').checked = false; fire(box('01').querySelector('input'), 'change');
  check('and off again', state(0) === 'false');

  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}, 0);

/**
 * colorAttrStates.test.js
 *
 * Direct unit coverage for Task L1a - DspfWriter.getColorAttrStates/
 * setColorAttrStates, the writer-layer half of the multi-instance Color &
 * attributes picker (see webviewClientHelpers.js's colorAttrStatesHtml/
 * wireColorAttrStatesEditor for the UI half, exercised in
 * src/test/dspfWebview.test.js). Built on Task L1's
 * getRepeatableKeywordInstances/setRepeatableKeywordInstances.
 *
 * Run with: node src/test/colorAttrStates.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

console.log('getColorAttrStates - no COLOR/DSPATR at all');
{
  check('empty keywords -> empty state list', DspfWriter.getColorAttrStates([]).length === 0);
  check('unrelated keywords -> still empty', DspfWriter.getColorAttrStates([{ name: 'DSPATR_TYPO', parameters: 'HI', conditions: [] }]).length === 0);
}

console.log('\ngetColorAttrStates / setColorAttrStates - one unconditioned COLOR+DSPATR pair round-trips as one state');
{
  let kw = DspfWriter.setColorAttrStates([], [{ conditions: [], color: 'RED', attrs: ['HI', 'UL'] }]);
  check('writes exactly one COLOR and one DSPATR keyword', kw.length === 2 && kw[0].name === 'COLOR' && kw[1].name === 'DSPATR');
  check('DSPATR joins multiple attrs into one keyword', kw[1].parameters === 'HI UL');
  const states = DspfWriter.getColorAttrStates(kw);
  check('reads back exactly one state', states.length === 1);
  check('color and attrs match', states[0].color === 'RED' && states[0].attrs.length === 2 && states[0].attrs.indexOf('HI') >= 0 && states[0].attrs.indexOf('UL') >= 0);
  check('unconditioned', states[0].conditions.length === 0);
}

console.log('\ngetColorAttrStates / setColorAttrStates - independently-conditioned states stay independent');
{
  const cond10 = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }];
  const cond20 = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '20', not: false }] }];
  let kw = DspfWriter.setColorAttrStates([], [
    { conditions: cond10, color: 'RED', attrs: ['HI'] },
    { conditions: cond20, color: 'GRN', attrs: [] },
  ]);
  const states = DspfWriter.getColorAttrStates(kw);
  check('two states round-trip', states.length === 2);
  const s10 = states.find((s) => s.conditions[0] && s.conditions[0].indicators[0].number === '10');
  const s20 = states.find((s) => s.conditions[0] && s.conditions[0].indicators[0].number === '20');
  check('indicator-10 state has RED/HI', !!s10 && s10.color === 'RED' && s10.attrs[0] === 'HI');
  check('indicator-20 state has GRN, no attrs', !!s20 && s20.color === 'GRN' && s20.attrs.length === 0);
}

console.log('\ngetColorAttrStates - CRITICAL: two states that happen to share the SAME conditions (most commonly: both unconditioned) do NOT collapse into one and silently lose data');
{
  // This is the exact bug the positional-pairing rewrite fixes: a naive
  // group-by-conditions-signature implementation would merge these two
  // unconditioned COLOR keywords into ONE state, with the second COLOR
  // silently overwriting the first (RED would vanish without a trace).
  let kw = [
    { name: 'COLOR', parameters: 'RED', conditions: [], raw: '', sourceLines: [] },
    { name: 'DSPATR', parameters: 'HI BL', conditions: [], raw: '', sourceLines: [] },
    { name: 'COLOR', parameters: 'GRN', conditions: [], raw: '', sourceLines: [] },
  ];
  const states = DspfWriter.getColorAttrStates(kw);
  check('exactly TWO states, not one merged state', states.length === 2);
  check('state 0 keeps RED with its DSPATR (positionally paired: 1st COLOR with 1st DSPATR)', states[0].color === 'RED' && states[0].attrs.indexOf('HI') >= 0 && states[0].attrs.indexOf('BL') >= 0);
  check('state 1 is GRN with NO attrs (2nd COLOR has no 2nd DSPATR to pair with)', states[1].color === 'GRN' && states[1].attrs.length === 0);
  check('both states report empty (unconditioned) conditions', states[0].conditions.length === 0 && states[1].conditions.length === 0);
}

console.log('\ngetColorAttrStates - three same-condition COLORs and two same-condition DSPATRs pair positionally, not combined');
{
  let kw = [
    { name: 'COLOR', parameters: 'RED', conditions: [], raw: '', sourceLines: [] },
    { name: 'DSPATR', parameters: 'HI', conditions: [], raw: '', sourceLines: [] },
    { name: 'COLOR', parameters: 'GRN', conditions: [], raw: '', sourceLines: [] },
    { name: 'DSPATR', parameters: 'UL', conditions: [], raw: '', sourceLines: [] },
    { name: 'COLOR', parameters: 'BLU', conditions: [], raw: '', sourceLines: [] },
  ];
  const states = DspfWriter.getColorAttrStates(kw);
  check('three states (max(3 colors, 2 attrs) = 3 slots)', states.length === 3);
  check('state 0: RED/HI', states[0].color === 'RED' && states[0].attrs.join(',') === 'HI');
  check('state 1: GRN/UL', states[1].color === 'GRN' && states[1].attrs.join(',') === 'UL');
  check('state 2: BLU/no attrs (3rd COLOR has no 3rd DSPATR)', states[2].color === 'BLU' && states[2].attrs.length === 0);
}

console.log('\nsetColorAttrStates - a state with neither color nor attrs writes nothing for that state');
{
  let kw = DspfWriter.setColorAttrStates([], [
    { conditions: [], color: 'RED', attrs: [] },
    { conditions: [], color: '', attrs: [] }, // nothing to write
  ]);
  check('only the ONE real state was written', DspfWriter.getColorAttrStates(kw).length === 1);
  check('COLOR(RED) alone, no stray DSPATR', kw.length === 1 && kw[0].name === 'COLOR' && kw[0].parameters === 'RED');
}

console.log('\nsetColorAttrStates - unrelated keywords on the field are left completely alone');
{
  let kw = [{ name: 'VALUES', parameters: "'A' 'B'", conditions: [], raw: '', sourceLines: [] }];
  kw = DspfWriter.setColorAttrStates(kw, [{ conditions: [], color: 'RED', attrs: ['HI'] }]);
  check('VALUES keyword survives untouched', kw.some((k) => k.name === 'VALUES' && k.parameters === "'A' 'B'"));
  check('COLOR/DSPATR were added alongside it', kw.some((k) => k.name === 'COLOR') && kw.some((k) => k.name === 'DSPATR'));

  kw = DspfWriter.setColorAttrStates(kw, []);
  check('clearing all states removes ONLY COLOR/DSPATR, VALUES still there', kw.length === 1 && kw[0].name === 'VALUES');
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

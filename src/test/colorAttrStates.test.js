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

// -----------------------------------------------------------------------
// diffColorAttrStates / applyColorAttrStatesDiff - Task L10 follow-up,
// reported as "existing color and attributes are removed and newly
// selected added" when editing a multi-field selection's Color &
// attributes together. See both functions' own doc comments in
// dspfWriter.js for the full rationale; these are the direct unit-level
// counterpart to multiSelect.test.js's runPreserveOwnStyleScenario/
// runColorChangeVariant (which exercise the same thing through the
// actual webview UI end to end).
// -----------------------------------------------------------------------

console.log('\ndiffColorAttrStates - same-length list, one attribute added to an existing unconditioned state');
{
  const before = [{ conditions: [], color: 'BLU', attrs: ['UL'] }];
  const after = [{ conditions: [], color: 'BLU', attrs: ['UL', 'HI'] }];
  const diff = DspfWriter.diffColorAttrStates(before, after);
  check('one modified entry, nothing added/removed', diff.modified.length === 1 && diff.added.length === 0 && diff.removed.length === 0);
  check('color did not change', diff.modified[0].colorChanged === false);
  check('HI recorded as added, nothing recorded as removed', diff.modified[0].attrsAdded.join(',') === 'HI' && diff.modified[0].attrsRemoved.length === 0);
}

console.log('\ndiffColorAttrStates - same-length list, an attribute removed and the color changed at once');
{
  const before = [{ conditions: [], color: 'BLU', attrs: ['UL', 'HI'] }];
  const after = [{ conditions: [], color: 'RED', attrs: ['UL'] }];
  const diff = DspfWriter.diffColorAttrStates(before, after);
  check('one modified entry', diff.modified.length === 1);
  check('color change detected', diff.modified[0].colorChanged === true && diff.modified[0].newColor === 'RED');
  check('HI recorded as removed, nothing added', diff.modified[0].attrsRemoved.join(',') === 'HI' && diff.modified[0].attrsAdded.length === 0);
}

console.log('\ndiffColorAttrStates - list grew by one (a brand new "+ Add" state)');
{
  const before = [];
  const after = [{ conditions: [], color: 'RED', attrs: ['HI'] }];
  const diff = DspfWriter.diffColorAttrStates(before, after);
  check('the new state is reported as added, nothing modified/removed', diff.added.length === 1 && diff.modified.length === 0 && diff.removed.length === 0);
  check('added state carries the color/attrs as given', diff.added[0].color === 'RED' && diff.added[0].attrs.join(',') === 'HI');
}

console.log('\ndiffColorAttrStates - list shrank by one (a "Remove" click)');
{
  const cond10 = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }];
  const before = [{ conditions: [], color: 'BLU', attrs: [] }, { conditions: cond10, color: 'RED', attrs: ['HI'] }];
  const after = [{ conditions: [], color: 'BLU', attrs: [] }];
  const diff = DspfWriter.diffColorAttrStates(before, after);
  check('the removed (indicator-10) state is reported, nothing else', diff.removed.length === 1 && diff.modified.length === 0 && diff.added.length === 0);
  check('removed entry matches the RED/indicator-10 state', diff.removed[0].color === 'RED' && diff.removed[0].conditions[0].indicators[0].number === '10');
}

console.log('\ndiffColorAttrStates - a shape it cannot confidently diff (length changed by more than one) returns null');
{
  const before = [{ conditions: [], color: 'BLU', attrs: [] }];
  const after = [{ conditions: [], color: 'RED', attrs: [] }, { conditions: [], color: 'GRN', attrs: [] }, { conditions: [], color: 'YEL', attrs: [] }];
  check('null, so the caller knows to fall back rather than guess', DspfWriter.diffColorAttrStates(before, after) === null);
}

console.log('\napplyColorAttrStatesDiff - merges an added attribute into a DIFFERENT field\'s own matching state, preserving its own color');
{
  // FLD2's own state: GRN/RI. The diff says "HI was added" to an
  // unconditioned state elsewhere (e.g. the primary field). Replaying
  // that onto FLD2's keywords should give GRN/RI+HI - GRN must survive.
  let kw = DspfWriter.setColorAttrStates([], [{ conditions: [], color: 'GRN', attrs: ['RI'] }]);
  const diff = { modified: [{ conditions: [], colorChanged: false, newColor: '', attrsAdded: ['HI'], attrsRemoved: [] }], added: [], removed: [] };
  kw = DspfWriter.applyColorAttrStatesDiff(kw, diff);
  const states = DspfWriter.getColorAttrStates(kw);
  check('exactly one state, still unconditioned', states.length === 1);
  check('own color (GRN) preserved', states[0].color === 'GRN');
  check('own attribute (RI) preserved AND the new HI merged in', states[0].attrs.indexOf('RI') >= 0 && states[0].attrs.indexOf('HI') >= 0);
}

console.log('\napplyColorAttrStatesDiff - a color-only change leaves the target field\'s own attributes untouched');
{
  let kw = DspfWriter.setColorAttrStates([], [{ conditions: [], color: 'GRN', attrs: ['RI'] }]);
  const diff = { modified: [{ conditions: [], colorChanged: true, newColor: 'RED', attrsAdded: [], attrsRemoved: [] }], added: [], removed: [] };
  kw = DspfWriter.applyColorAttrStatesDiff(kw, diff);
  const states = DspfWriter.getColorAttrStates(kw);
  check('color updated to RED', states[0].color === 'RED');
  check('own attribute (RI) untouched by a color-only diff', states[0].attrs.join(',') === 'RI');
}

console.log('\napplyColorAttrStatesDiff - a field with NO existing state gets only the changed piece, not the diff source field\'s color');
{
  const diff = { modified: [{ conditions: [], colorChanged: false, newColor: '', attrsAdded: ['HI'], attrsRemoved: [] }], added: [], removed: [] };
  const kw = DspfWriter.applyColorAttrStatesDiff([], diff);
  const states = DspfWriter.getColorAttrStates(kw);
  check('one new state created, carrying ONLY the attribute', states.length === 1 && states[0].color === '' && states[0].attrs.join(',') === 'HI');
  check('no COLOR keyword was invented', !kw.some((k) => k.name === 'COLOR'));
}

console.log('\napplyColorAttrStatesDiff - an "added" (brand-new "+ Add" state) merges into an existing same-condition state rather than duplicating it');
{
  // Target field already has an unconditioned GRN/RI state (unrelated to
  // the diff's own source field, which started with nothing and just
  // had a new unconditioned RED/HI state added via "+ Add"). Replaying
  // that "added" state should MERGE into the target's own existing
  // unconditioned state, not create a second, separate one.
  let kw = DspfWriter.setColorAttrStates([], [{ conditions: [], color: 'GRN', attrs: ['RI'] }]);
  const diff = { modified: [], added: [{ conditions: [], color: 'RED', attrs: ['HI'] }], removed: [] };
  kw = DspfWriter.applyColorAttrStatesDiff(kw, diff);
  const states = DspfWriter.getColorAttrStates(kw);
  check('still exactly one state, not two', states.length === 1);
  check('the new color (RED) wins since the source field actually set one', states[0].color === 'RED');
  check('own attribute (RI) preserved alongside the newly-added HI', states[0].attrs.indexOf('RI') >= 0 && states[0].attrs.indexOf('HI') >= 0);
}

console.log('\napplyColorAttrStatesDiff - a "removed" state only removes the target field\'s OWN matching-condition state, leaving others alone');
{
  const cond10 = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }];
  let kw = DspfWriter.setColorAttrStates([], [
    { conditions: [], color: 'BLU', attrs: [] },
    { conditions: cond10, color: 'RED', attrs: ['HI'] },
  ]);
  const diff = { modified: [], added: [], removed: [{ conditions: cond10, color: 'RED', attrs: ['HI'] }] };
  kw = DspfWriter.applyColorAttrStatesDiff(kw, diff);
  const states = DspfWriter.getColorAttrStates(kw);
  check('the indicator-10 state is gone', states.length === 1);
  check('the unconditioned BLU state survives untouched', states[0].color === 'BLU' && states[0].conditions.length === 0);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

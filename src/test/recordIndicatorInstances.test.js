/**
 * recordIndicatorInstances.test.js
 *
 * Direct unit coverage for Task L5d (piece i) - DspfWriter.
 * getRecordIndicatorInstances/setRecordIndicatorInstances, the writer-layer
 * half of the record-level Indicator/screen-control keywords picker
 * (CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN/VLDCMDKEY/SETOF/CHANGE/INDTXT -
 * see webviewClientHelpers.js's recordIndicatorInstancesHtml/
 * wireRecordIndicatorInstances for the UI half, exercised in
 * src/test/dspfWebview.test.js). Built on Task L1's
 * getRepeatableKeywordInstances/setRepeatableKeywordInstances, same
 * foundation as Task L5 (piece 1)'s getValidityCheckInstances (see
 * validityCheckInstances.test.js) - but unlike RANGE/COMP/VALUES, most of
 * these keywords carry only a bare response-indicator parameter, and
 * exactly one of them (INDTXT) also carries a quoted text portion, so
 * `resp`/`text` are kept as separate instance fields rather than one
 * opaque `parameters` string.
 *
 * Run with: node src/test/recordIndicatorInstances.test.js
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

console.log('getRecordIndicatorInstances - none of these keywords present at all');
{
  check('empty keywords -> empty instance list', DspfWriter.getRecordIndicatorInstances([]).length === 0);
  check('unrelated keywords -> still empty', DspfWriter.getRecordIndicatorInstances([{ name: 'COLOR', parameters: 'RED', conditions: [] }]).length === 0);
}

console.log('\ngetRecordIndicatorInstances - a single unconditioned CLEAR');
{
  const kw = [{ name: 'CLEAR', parameters: '10', conditions: [], raw: '', sourceLines: [] }];
  const instances = DspfWriter.getRecordIndicatorInstances(kw);
  check('exactly one instance', instances.length === 1);
  check('kind is CLEAR', instances[0].kind === 'CLEAR');
  check('resp carried through', instances[0].resp === '10');
  check('text is blank for a non-INDTXT kind', instances[0].text === '');
  check('unconditioned', instances[0].conditions.length === 0);
}

console.log('\ngetRecordIndicatorInstances - CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN/VLDCMDKEY/SETOF/CHANGE/INDTXT can all coexist as separate instances, source order preserved');
{
  const kw = [
    { name: 'CLEAR', parameters: '10', conditions: [{ indicators: [{ number: '01', negate: false }] }], raw: '', sourceLines: [] },
    { name: 'PAGEDOWN', parameters: '20', conditions: [], raw: '', sourceLines: [] },
    { name: 'PAGEUP', parameters: '21', conditions: [], raw: '', sourceLines: [] },
    { name: 'HOME', parameters: '22', conditions: [], raw: '', sourceLines: [] },
    { name: 'HELP', parameters: '23', conditions: [], raw: '', sourceLines: [] },
    { name: 'HLPRTN', parameters: '24', conditions: [], raw: '', sourceLines: [] },
    { name: 'VLDCMDKEY', parameters: '25', conditions: [], raw: '', sourceLines: [] },
    { name: 'SETOF', parameters: '26', conditions: [], raw: '', sourceLines: [] },
    { name: 'CHANGE', parameters: '27', conditions: [], raw: '', sourceLines: [] },
    { name: 'INDTXT', parameters: "30 'Record active'", conditions: [], raw: '', sourceLines: [] },
  ];
  const instances = DspfWriter.getRecordIndicatorInstances(kw);
  check('all ten instances read back', instances.length === 10);
  check('source order preserved', instances.map((i) => i.kind).join(',') === 'CLEAR,PAGEDOWN,PAGEUP,HOME,HELP,HLPRTN,VLDCMDKEY,SETOF,CHANGE,INDTXT');
  check('CLEAR keeps its OWN condition', instances[0].conditions[0].indicators[0].number === '01');
  check('the rest are unconditioned', instances.slice(1, 9).every((i) => i.conditions.length === 0));
  const indtxt = instances[9];
  check('INDTXT resp parsed out', indtxt.resp === '30');
  check('INDTXT text parsed out', indtxt.text === 'Record active');
}

console.log('\ngetRecordIndicatorInstances - INDTXT text with an embedded escaped quote unescapes correctly');
{
  const kw = [{ name: 'INDTXT', parameters: "40 'it''s active'", conditions: [], raw: '', sourceLines: [] }];
  const instances = DspfWriter.getRecordIndicatorInstances(kw);
  check('resp parsed', instances[0].resp === '40');
  check('embedded quote unescaped', instances[0].text === "it's active");
}

console.log('\ngetRecordIndicatorInstances - a bare INDTXT with no quoted text (indicator only) still parses the resp, blank text');
{
  const kw = [{ name: 'INDTXT', parameters: '50', conditions: [], raw: '', sourceLines: [] }];
  const instances = DspfWriter.getRecordIndicatorInstances(kw);
  check('resp parsed', instances[0].resp === '50');
  check('text blank', instances[0].text === '');
}

console.log('\nsetRecordIndicatorInstances - writes one keyword per instance, using each instance\u2019s own kind/resp/conditions');
{
  let kw = [];
  kw = DspfWriter.setRecordIndicatorInstances(kw, [{ conditions: [], kind: 'CLEAR', resp: '10', text: '' }]);
  check('one CLEAR keyword written', kw.length === 1 && kw[0].name === 'CLEAR' && kw[0].parameters === '10');
}

console.log('\nsetRecordIndicatorInstances - INDTXT folds resp and text into one parameters string, quoting/escaping the text');
{
  let kw = [];
  kw = DspfWriter.setRecordIndicatorInstances(kw, [{ conditions: [], kind: 'INDTXT', resp: '30', text: "it's active" }]);
  check('one INDTXT keyword written', kw.length === 1 && kw[0].name === 'INDTXT');
  check('resp + quoted, escaped text', kw[0].parameters === "30 'it''s active'");
}

console.log('\nsetRecordIndicatorInstances - INDTXT with a blank text writes just the bare indicator, no empty quotes');
{
  let kw = DspfWriter.setRecordIndicatorInstances([], [{ conditions: [], kind: 'INDTXT', resp: '30', text: '' }]);
  check('bare indicator, no trailing quotes', kw.length === 1 && kw[0].parameters === '30');
}

console.log('\nsetRecordIndicatorInstances - two independently-conditioned instances round-trip correctly');
{
  let kw = [];
  kw = DspfWriter.setRecordIndicatorInstances(kw, [
    { conditions: [], kind: 'HOME', resp: '22', text: '' },
    { conditions: [{ indicators: [{ number: '30', negate: false }] }], kind: 'CLEAR', resp: '31', text: '' },
  ]);
  check('both instances written', kw.length === 2);
  const home = kw.find((k) => k.name === 'HOME');
  const clear = kw.find((k) => k.name === 'CLEAR');
  check('HOME is unconditioned', home && home.conditions.length === 0 && home.parameters === '22');
  check('CLEAR carries its own indicator 30 condition', clear && clear.conditions.length === 1 && clear.conditions[0].indicators[0].number === '30' && clear.parameters === '31');

  const roundTripped = DspfWriter.getRecordIndicatorInstances(kw);
  check('round-trips back to exactly two instances', roundTripped.length === 2);
}

console.log('\nsetRecordIndicatorInstances - two CLEAR rows under different indicators (the real screen\u2019s own repeatable-row point) both survive');
{
  let kw = DspfWriter.setRecordIndicatorInstances([], [
    { conditions: [{ indicators: [{ number: '10', negate: false }] }], kind: 'CLEAR', resp: '11', text: '' },
    { conditions: [{ indicators: [{ number: '20', negate: false }] }], kind: 'CLEAR', resp: '21', text: '' },
  ]);
  const clears = kw.filter((k) => k.name === 'CLEAR');
  check('both CLEAR instances written, not collapsed into one', clears.length === 2);
  check('first keeps indicator 10 / resp 11', clears[0].conditions[0].indicators[0].number === '10' && clears[0].parameters === '11');
  check('second keeps indicator 20 / resp 21', clears[1].conditions[0].indicators[0].number === '20' && clears[1].parameters === '21');
}

console.log('\nsetRecordIndicatorInstances - an instance with a blank resp writes nothing (matches setValidityCheckInstances\u2019 same rule for a blank kind)');
{
  let kw = DspfWriter.setRecordIndicatorInstances([], [
    { conditions: [], kind: 'CLEAR', resp: '10', text: '' },
    { conditions: [], kind: 'HOME', resp: '', text: '' }, // nothing to write
  ]);
  check('only the ONE real instance was written', DspfWriter.getRecordIndicatorInstances(kw).length === 1);
  check('CLEAR(10) alone, no stray blank HOME', kw.length === 1 && kw[0].name === 'CLEAR');
}

console.log('\nsetRecordIndicatorInstances - an instance with an unrecognized kind is dropped');
{
  let kw = DspfWriter.setRecordIndicatorInstances([], [{ conditions: [], kind: 'NOTREAL', resp: '10', text: '' }]);
  check('nothing written for an unrecognized kind', kw.length === 0);
}

console.log('\nsetRecordIndicatorInstances - switching an instance\u2019s kind (e.g. CLEAR -> HOME) replaces that keyword name while keeping its resp/conditions, the same instance');
{
  let kw = DspfWriter.setRecordIndicatorInstances([], [{ conditions: [], kind: 'CLEAR', resp: '15', text: '' }]);
  const instances = DspfWriter.getRecordIndicatorInstances(kw);
  instances[0].kind = 'HOME';
  kw = DspfWriter.setRecordIndicatorInstances(kw, instances);
  check('now a HOME keyword, not CLEAR', kw.length === 1 && kw[0].name === 'HOME');
  check('resp carried over unchanged', kw[0].parameters === '15');
}

console.log('\nsetRecordIndicatorInstances - a stray text value on a non-INDTXT kind is ignored, not written');
{
  let kw = DspfWriter.setRecordIndicatorInstances([], [{ conditions: [], kind: 'CLEAR', resp: '10', text: 'should be ignored' }]);
  check('CLEAR parameters is just the resp, no text folded in', kw.length === 1 && kw[0].parameters === '10');
}

console.log('\nsetRecordIndicatorInstances - unrelated keywords on the record, and CFnn/CAnn command keys, are left completely alone');
{
  let kw = [
    { name: 'COLOR', parameters: 'RED', conditions: [], raw: '', sourceLines: [] },
    { name: 'CF03', parameters: '', conditions: [], raw: '', sourceLines: [] },
  ];
  kw = DspfWriter.setRecordIndicatorInstances(kw, [{ conditions: [], kind: 'CLEAR', resp: '10', text: '' }]);
  check('COLOR keyword survives untouched', kw.some((k) => k.name === 'COLOR' && k.parameters === 'RED'));
  check('CF03 command key survives untouched', kw.some((k) => k.name === 'CF03'));
  check('CLEAR was added alongside them', kw.some((k) => k.name === 'CLEAR' && k.parameters === '10'));

  kw = DspfWriter.setRecordIndicatorInstances(kw, []);
  check('clearing all instances removes ONLY the indicator keywords, COLOR and CF03 still there', kw.length === 2 && kw.some((k) => k.name === 'COLOR') && kw.some((k) => k.name === 'CF03'));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

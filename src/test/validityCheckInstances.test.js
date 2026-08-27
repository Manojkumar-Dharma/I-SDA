/**
 * validityCheckInstances.test.js
 *
 * Direct unit coverage for Task L5 (piece 1) - DspfWriter.
 * getValidityCheckInstances/setValidityCheckInstances, the writer-layer
 * half of the multi-instance Validity check (RANGE/COMP/VALUES) picker
 * (see webviewClientHelpers.js's validityCheckInstancesHtml/
 * wireValidityCheckInstances for the UI half, exercised in
 * src/test/dspfWebview.test.js). Built on Task L1's
 * getRepeatableKeywordInstances/setRepeatableKeywordInstances, same
 * foundation as Task L1a's getColorAttrStates/setColorAttrStates
 * (see colorAttrStates.test.js) - but unlike COLOR/DSPATR, RANGE/COMP/
 * VALUES are mutually exclusive alternative keyword NAMES, not two
 * keywords paired into one state, so there's no positional-pairing
 * concern here: each instance maps 1:1 onto one RANGE/COMP/VALUES
 * keyword occurrence.
 *
 * Run with: node src/test/validityCheckInstances.test.js
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

console.log('getValidityCheckInstances - no RANGE/COMP/VALUES at all');
{
  check('empty keywords -> empty instance list', DspfWriter.getValidityCheckInstances([]).length === 0);
  check('unrelated keywords -> still empty', DspfWriter.getValidityCheckInstances([{ name: 'COLOR', parameters: 'RED', conditions: [] }]).length === 0);
}

console.log('\ngetValidityCheckInstances - a single unconditioned RANGE');
{
  const kw = [{ name: 'RANGE', parameters: '1 99', conditions: [], raw: '', sourceLines: [] }];
  const instances = DspfWriter.getValidityCheckInstances(kw);
  check('exactly one instance', instances.length === 1);
  check('kind is RANGE', instances[0].kind === 'RANGE');
  check('parameters carried through verbatim', instances[0].parameters === '1 99');
  check('unconditioned', instances[0].conditions.length === 0);
}

console.log('\ngetValidityCheckInstances - RANGE, COMP, and VALUES can all coexist as separate instances (mutually exclusive per-instance, not per-field)');
{
  const kw = [
    { name: 'RANGE', parameters: '1 99', conditions: [{ indicators: [{ number: '10', negate: false }] }], raw: '', sourceLines: [] },
    { name: 'COMP', parameters: 'GT 0', conditions: [{ indicators: [{ number: '11', negate: false }] }], raw: '', sourceLines: [] },
    { name: 'VALUES', parameters: "'A' 'B' 'C'", conditions: [], raw: '', sourceLines: [] },
  ];
  const instances = DspfWriter.getValidityCheckInstances(kw);
  check('all three instances read back', instances.length === 3);
  check('source order preserved', instances[0].kind === 'RANGE' && instances[1].kind === 'COMP' && instances[2].kind === 'VALUES');
  check('each keeps its OWN conditions', instances[0].conditions[0].indicators[0].number === '10' && instances[1].conditions[0].indicators[0].number === '11' && instances[2].conditions.length === 0);
}

console.log('\nsetValidityCheckInstances - writes one keyword per state, using each state\u2019s own kind/conditions');
{
  let kw = [];
  kw = DspfWriter.setValidityCheckInstances(kw, [
    { conditions: [], kind: 'RANGE', parameters: '0 999' },
  ]);
  check('one RANGE keyword written', kw.length === 1 && kw[0].name === 'RANGE' && kw[0].parameters === '0 999');
}

console.log('\nsetValidityCheckInstances - two independently-conditioned instances round-trip correctly');
{
  let kw = [];
  kw = DspfWriter.setValidityCheckInstances(kw, [
    { conditions: [], kind: 'COMP', parameters: 'GT 0' },
    { conditions: [{ indicators: [{ number: '30', negate: false }] }], kind: 'RANGE', parameters: '1 50' },
  ]);
  check('both instances written', kw.length === 2);
  const comp = kw.find((k) => k.name === 'COMP');
  const range = kw.find((k) => k.name === 'RANGE');
  check('COMP is unconditioned', comp && comp.conditions.length === 0 && comp.parameters === 'GT 0');
  check('RANGE carries its own indicator 30 condition', range && range.conditions.length === 1 && range.conditions[0].indicators[0].number === '30' && range.parameters === '1 50');

  const roundTripped = DspfWriter.getValidityCheckInstances(kw);
  check('round-trips back to exactly two instances', roundTripped.length === 2);
}

console.log('\nsetValidityCheckInstances - a state with an empty kind writes nothing for that state (matches setColorAttrStates\u2019 same rule)');
{
  let kw = DspfWriter.setValidityCheckInstances([], [
    { conditions: [], kind: 'RANGE', parameters: '1 99' },
    { conditions: [], kind: '', parameters: '' }, // nothing to write
  ]);
  check('only the ONE real instance was written', DspfWriter.getValidityCheckInstances(kw).length === 1);
  check('RANGE(1 99) alone, no stray blank keyword', kw.length === 1 && kw[0].name === 'RANGE' && kw[0].parameters === '1 99');
}

console.log('\nsetValidityCheckInstances - switching an instance\u2019s kind (e.g. RANGE -> COMP) replaces that keyword name while keeping its parameters/conditions, the same instance');
{
  let kw = DspfWriter.setValidityCheckInstances([], [{ conditions: [], kind: 'RANGE', parameters: '0 999' }]);
  const instances = DspfWriter.getValidityCheckInstances(kw);
  instances[0].kind = 'COMP';
  kw = DspfWriter.setValidityCheckInstances(kw, instances);
  check('now a COMP keyword, not RANGE', kw.length === 1 && kw[0].name === 'COMP');
  check('parameters text carried over unchanged', kw[0].parameters === '0 999');
}

console.log('\nsetValidityCheckInstances - unrelated keywords on the field are left completely alone');
{
  let kw = [{ name: 'COLOR', parameters: 'RED', conditions: [], raw: '', sourceLines: [] }];
  kw = DspfWriter.setValidityCheckInstances(kw, [{ conditions: [], kind: 'VALUES', parameters: "'Y' 'N'" }]);
  check('COLOR keyword survives untouched', kw.some((k) => k.name === 'COLOR' && k.parameters === 'RED'));
  check('VALUES was added alongside it', kw.some((k) => k.name === 'VALUES' && k.parameters === "'Y' 'N'"));

  kw = DspfWriter.setValidityCheckInstances(kw, []);
  check('clearing all instances removes ONLY the validity-check keyword, COLOR still there', kw.length === 1 && kw[0].name === 'COLOR');
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

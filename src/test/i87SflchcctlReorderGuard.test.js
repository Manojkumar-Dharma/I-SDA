/**
 * i87SflchcctlReorderGuard.test.js
 *
 * Task I-87 - follow-up from I-79. SFLCHCCTL "must be on the first field
 * defined in the subfile record" (constants not counting). I-79 checks that
 * only when the SFLCHCCTL checkbox is toggled, but the Structure tab's Field
 * order Up/Down buttons (moveField -> DspfWriter.reorderFields) could move the
 * SFLCHCCTL field out of first place, or move another field ahead of it, with
 * no check.
 *
 * Fix: DspfWriter.sflchcctlReorderConflictReason(record, orderedSourceLines),
 * a diff-based check called from moveField before it commits: a reorder is
 * blocked only if it INTRODUCES the violation. A record that was already
 * invalid is never re-reported, moving the SFLCHCCTL field to the front is
 * always allowed, and constants never count.
 *
 * Part 1 unit-tests the pure function; part 2 runs the DSPF designer's real
 * generated client-side script in jsdom and presses the real Up/Down buttons.
 * Run with: node src/test/i87SflchcctlReorderGuard.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// ===========================================================================
// Part 1 - the pure function
// ===========================================================================
console.log('DspfWriter.sflchcctlReorderConflictReason: unit checks');
check('function is exported', typeof DspfWriter.sflchcctlReorderConflictReason === 'function');
{
  const f = DspfWriter.sflchcctlReorderConflictReason || (() => null);
  const kw = (name) => ({ name, parameters: '', conditions: [], raw: '', sourceLines: [] });
  const field = (name, line, keywords) => ({ name, sourceLine: line, nameType: '', keywords: keywords || [] });
  const constant = (line) => ({ name: '', sourceLine: line, nameType: 'CONSTANT', constantValue: 'X', keywords: [] });
  const CHG = (line) => field('CHG', line, [kw('SFLCHCCTL')]);

  // record: CHG(10) F2(20) F3(30)
  const rec = { fields: [CHG(10), field('F2', 20), field('F3', 30)] };
  const r1 = f(rec, [20, 10, 30]) || '';
  check('moving another field ahead of SFLCHCCTL (F2 up over CHG) is blocked', !!r1);
  check('  ...the reason names SFLCHCCTL, the field that would be first, and the SFLCHCCTL field', /SFLCHCCTL/.test(r1) && /F2/.test(r1) && /CHG/.test(r1));
  check('moving the SFLCHCCTL field down (CHG over F2) is blocked (same resulting order)', !!f(rec, [20, 10, 30]));
  check('moving the SFLCHCCTL field to the end is blocked', !!f(rec, [20, 30, 10]));
  check('moving F3 up (below CHG) is allowed - CHG stays first', f(rec, [10, 30, 20]) === null);
  check('an unchanged order is allowed', f(rec, [10, 20, 30]) === null);

  // constants never count as "the first field"
  const withConst = { fields: [constant(5), CHG(10), field('F2', 20)] };
  check('a constant BEFORE the SFLCHCCTL field does not count: moving CHG up over it is allowed', f(withConst, [10, 5, 20]) === null);
  check('  ...and moving F2 ahead of CHG (past the constant) is still blocked', !!f(withConst, [5, 20, 10]));
  const constAfter = { fields: [CHG(10), constant(15), field('F2', 20)] };
  check('moving a constant past the SFLCHCCTL field is allowed', f(constAfter, [15, 10, 20]) === null);
  check('moving a constant to the end is allowed', f(constAfter, [10, 20, 15]) === null);
  check('  ...but moving F2 over the constant and CHG is blocked', !!f(constAfter, [20, 10, 15]));

  // already-invalid hand-written record: SFLCHCCTL not first
  const bad = { fields: [field('F2', 20), CHG(10), field('F3', 30)] };
  check('already invalid: moving the SFLCHCCTL field to the front (fixing it) is allowed', f(bad, [10, 20, 30]) === null);
  check('already invalid: an unrelated reorder is not re-reported', f(bad, [20, 30, 10]) === null);
  check('already invalid: swapping the first two is not re-reported', f(bad, [10, 20, 30]) === null && f(bad, [30, 20, 10]) === null);

  // no SFLCHCCTL at all / degenerate input
  const plain = { fields: [field('A', 10), field('B', 20)] };
  check('a record with no SFLCHCCTL is never blocked', f(plain, [20, 10]) === null);
  check('a record with a constant only before fields, no SFLCHCCTL, is never blocked', f({ fields: [constant(5), field('A', 10)] }, [10, 5]) === null);
  check('null / empty / malformed inputs are safe', f(null, null) === null && f({}, []) === null && f({ fields: [] }, []) === null && f(rec, null) === null);
  check('an order that is not a permutation of the fields is ignored (reorderFields itself rejects it)', f(rec, [10, 20]) === null && f(rec, [10, 20, 99]) === null);
  const two = { fields: [CHG(10), field('CHG2', 20, [kw('SFLCHCCTL')]), field('F', 30)] };
  check('two SFLCHCCTL fields (already illegal, only-one rule): displacing the first-place one with a plain field is blocked', !!f(two, [30, 10, 20]));
  check('  ...but swapping the two SFLCHCCTL fields is allowed (the first field still carries SFLCHCCTL)', f(two, [20, 10, 30]) === null);

  // the reason names something sensible even for an unnamed field
  const odd = { fields: [CHG(10), { name: '', sourceLine: 20, nameType: '', keywords: [] }] };
  check('an unnamed field in the way is described, not printed as blank', /another field/.test(f(odd, [20, 10]) || ''));
}

// ===========================================================================
// Part 2 - the real Up/Down buttons
// ===========================================================================
function record(kind) {
  const lines = [buildLine({ seq: '00010', nameType: 'R', name: 'SFLREC', func: 'SFL' })];
  const chg = () => buildLine({ seq: '00020', name: 'CHG', length: '1', dataType: 'Y', decimals: '0', usage: 'H', func: 'SFLCHCCTL' });
  const f2 = (seq) => buildLine({ seq: seq, name: 'F2', length: '10', usage: 'B', line: '3', col: '2' });
  const f3 = (seq) => buildLine({ seq: seq, name: 'F3', length: '10', usage: 'B', line: '4', col: '2' });
  const cst = (seq) => buildLine({ seq: seq, line: '2', col: '2', func: "'Hdr'" });
  if (kind === 'chgFirst') lines.push(chg(), f2('00030'), cst('00040'));          // CHG F2 'Hdr'
  if (kind === 'constFirst') lines.push(cst('00015'), chg(), f2('00030'), f3('00040')); // 'Hdr' CHG F2 F3
  if (kind === 'invalid') lines.push(f2('00015'), f3('00016'), chg());              // F2 F3 CHG (already invalid)
  if (kind === 'plain') lines.push(f2('00030'), f3('00040'));                        // F2 F3 (no SFLCHCCTL)
  return lines.join('\n') + '\n';
}

function withDom(src, fn) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'I87.DSPF').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  const posted = [];
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = () => {};
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
    },
  });
  return new Promise((resolve) => {
    setTimeout(() => {
      const doc = dom.window.document;
      const { Event } = dom.window;
      const rows = () => Array.from(doc.querySelectorAll('.field-order-row[data-idx]'));
      const labels = () => rows().map((r) => r.querySelector('.field-order-label').textContent);
      const press = (idx, dir) => {
        posted.length = 0;
        let alertMessage = null;
        const original = dom.window.alert;
        dom.window.alert = (m) => { alertMessage = m; };
        rows()[idx].querySelector('.field-order-' + dir).dispatchEvent(new Event('click', { bubbles: true }));
        dom.window.alert = original;
        const edit = posted.find((m) => m.type === 'applyEdit');
        return { alertMessage, applyEdit: edit, names: edit ? DspfParser.parseDspf(edit.text).records[0].fields.map((x) => (x.nameType === 'CONSTANT' ? "'" + x.constantValue + "'" : x.name)) : null };
      };
      fn({ labels, press, errors });
      resolve();
    }, 500);
  });
}

async function run() {
  console.log('\nField order Up/Down on an SFL record: CHG(SFLCHCCTL) F2 \'Hdr\'');
  await withDom(record('chgFirst'), ({ labels, press, errors }) => {
    check('setup: three rows, CHG first', labels().length === 3 && /^CHG/.test(labels()[0]));
    let r = press(1, 'up'); // F2 up over CHG
    check('F2 up (ahead of CHG) is blocked with an alert naming SFLCHCCTL, F2 and CHG', !!r.alertMessage && /SFLCHCCTL/.test(r.alertMessage) && /F2/.test(r.alertMessage) && /CHG/.test(r.alertMessage));
    check('  ...and nothing is written to the document', !r.applyEdit);
    check('  ...and the list is unchanged', /^CHG/.test(labels()[0]) && /^F2/.test(labels()[1]));
    r = press(0, 'down'); // CHG down over F2
    check('CHG down (out of first place) is blocked the same way', !!r.alertMessage && /SFLCHCCTL/.test(r.alertMessage) && !r.applyEdit);
    r = press(1, 'down'); // F2 down over the constant
    check('F2 down over the constant is allowed (CHG stays first)', !r.alertMessage && !!r.applyEdit);
    check('  ...and the new order is written: CHG, \'Hdr\', F2', !!r.names && r.names[0] === 'CHG' && r.names[1] === "'Hdr'" && r.names[2] === 'F2');
    check('no uncaught errors', errors.length === 0);
  });

  console.log('\nField order Up/Down: a constant in front does not count as the first field');
  await withDom(record('constFirst'), ({ labels, press, errors }) => {
    let r = press(1, 'up'); // CHG up over the constant
    check('CHG up over a leading constant is allowed', !r.alertMessage && !!r.applyEdit && r.names[0] === 'CHG');
    check('no uncaught errors', errors.length === 0);
  });
  await withDom(record('constFirst'), ({ labels, press, errors }) => {
    let r = press(2, 'up'); // F2 up over CHG (F2 would be first named field)
    check('F2 up over CHG (past a leading constant) is blocked', !!r.alertMessage && /SFLCHCCTL/.test(r.alertMessage) && !r.applyEdit);
    r = press(0, 'down'); // constant down over CHG
    check('the leading constant moving down over CHG is allowed (CHG is still the first named field)', !r.alertMessage && !!r.applyEdit);
    check('no uncaught errors', errors.length === 0);
  });

  console.log('\nField order Up/Down: an ALREADY invalid record (F2 F3 CHG) - fixing and unrelated moves are allowed');
  await withDom(record('invalid'), ({ labels, press, errors }) => {
    let r = press(0, 'down'); // F2 down over F3 - unrelated
    check('an unrelated move (F2 over F3) is not re-reported', !r.alertMessage && !!r.applyEdit);
    check('no uncaught errors', errors.length === 0);
  });
  await withDom(record('invalid'), ({ labels, press, errors }) => {
    let r = press(2, 'up'); // CHG up over F3
    check('moving CHG up (towards first) is allowed', !r.alertMessage && !!r.applyEdit);
    check('no uncaught errors', errors.length === 0);
  });

  console.log('\nField order Up/Down: a record with no SFLCHCCTL (no regression)');
  await withDom(record('plain'), ({ labels, press, errors }) => {
    let r = press(1, 'up');
    check('F3 up over F2 is allowed', !r.alertMessage && !!r.applyEdit && r.names[0] === 'F3' && r.names[1] === 'F2');
    check('no uncaught errors', errors.length === 0);
  });

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(1); });

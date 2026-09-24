/**
 * i62PshbtnfldBasicTabDefinitionGuard.test.js
 *
 * Task I-62 - follow-up from I-57. PSHBTNFLD's DDS Reference section says the
 * field "must be defined as an input-capable field with data type Y, length
 * equal to 2, and decimal positions of 0". I-57 enforces that when the
 * toggle is turned ON (it rewrites the field via
 * DspfWriter.pshbtnfldDefinitionUpdates), but the Basic tab's Apply was
 * unguarded: on a "2Y 0B" push-button field, changing the data type to A,
 * the length to 10, the decimals, or the usage to O each applied with no
 * alert, leaving a field that still carried PSHBTNFLD but was invalid DDS.
 *
 * Fix: new DspfWriter.pshbtnfldBasicEditConflictReason, driven by
 * pshbtnfldDefinitionUpdates and called from the Basic tab's Apply handler
 * (early return before commitEdit, right after I-61's WRDWRAP check - so the
 * panel keeps the user's other pending edits). DIFF-BASED like I-61 / I-58:
 * only a change TO a non-conforming value is blocked, so an unrelated Apply
 * on an already-invalid hand-written field still goes through. A blank
 * stored Usage is the DDS default (O) and the Usage select shows O for it,
 * so a blank usage counts as O on both sides of the comparison.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i62PshbtnfldBasicTabDefinitionGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// === Group A: pure unit checks ===
console.log('\nDspfWriter.pshbtnfldBasicEditConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.pshbtnfldBasicEditConflictReason === 'function');
{
  const f = DspfWriter.pshbtnfldBasicEditConflictReason || (() => null);
  const pb = [{ name: 'PSHBTNFLD', parameters: '' }, { name: 'PSHBTNCHC', parameters: "1 'Cmd1'" }];
  const plain = [{ name: 'TEXT', parameters: "'x'" }];
  const good = { dataType: 'Y', length: 2, decimalPositions: 0, usage: 'B' };

  ['A', 'X', 'N', 'S', 'I', 'D', 'M', 'F', 'L', 'T', 'Z'].forEach((t) => {
    const r = f(pb, good, { dataType: t });
    check('data type Y -> ' + t + ' blocked, reason names PSHBTNFLD and data type Y', !!r && /PSHBTNFLD/.test(r) && /data type/.test(r) && /\bY\b/.test(r));
  });
  [1, 3, 10, 0, null].forEach((n) => {
    const r = f(pb, good, { length: n });
    check('length 2 -> ' + JSON.stringify(n) + ' blocked, reason names length 2', !!r && /PSHBTNFLD/.test(r) && /length/.test(r));
  });
  [1, 2, null].forEach((n) => {
    const r = f(pb, good, { decimalPositions: n });
    check('decimals 0 -> ' + JSON.stringify(n) + ' blocked, reason names decimal positions', !!r && /decimal positions/.test(r));
  });
  ['O', 'H', 'M', 'P', ''].forEach((u) => {
    const r = f(pb, good, { usage: u });
    check('usage B -> ' + JSON.stringify(u) + ' blocked, reason names usage I or B', !!r && /usage/.test(r) && /I or B/.test(r));
  });

  check('usage B -> I allowed', f(pb, good, { usage: 'I' }) === null);
  check('usage I -> B allowed', f(pb, Object.assign({}, good, { usage: 'I' }), { usage: 'B' }) === null);
  check('all four values re-sent unchanged (what Apply does) -> allowed', f(pb, good, { dataType: 'Y', length: 2, decimalPositions: 0, usage: 'B' }) === null);
  check('no updates at all -> allowed', f(pb, good, {}) === null);
  check('length given as the string "2" (an input value) counts as 2', f(pb, good, { length: '2' }) === null);

  check('no PSHBTNFLD on the field -> never blocks (data type)', f(plain, good, { dataType: 'A' }) === null);
  check('no PSHBTNFLD on the field -> never blocks (length)', f(plain, good, { length: 10 }) === null);
  check('no PSHBTNFLD on the field -> never blocks (usage)', f(plain, good, { usage: 'O' }) === null);

  // several violations at once: one message, all named
  {
    const r = f(pb, good, { dataType: 'A', length: 10, decimalPositions: 1, usage: 'O' }) || '';
    check('all four bad at once -> one reason naming each', /data type A/.test(r) && /length 10/.test(r) && /decimal positions 1/.test(r) && /usage O/.test(r));
  }

  // diff-based: an already-invalid hand-written field
  const bad = { dataType: 'A', length: 5, decimalPositions: null, usage: 'I' };
  check('pre-existing invalid values, re-sent unchanged -> not re-reported', f(pb, bad, { dataType: 'A', length: 5, decimalPositions: null, usage: 'I' }) === null);
  check('invalid length 5 -> another invalid length 8 is still blocked', /length/.test(f(pb, bad, { length: 8 }) || ''));
  check('invalid data type A -> another invalid data type S is still blocked', /data type/.test(f(pb, bad, { dataType: 'S' }) || ''));
  check('fixing the data type alone (A -> Y) is allowed', f(pb, bad, { dataType: 'Y' }) === null);
  check('fixing the length alone (5 -> 2) is allowed', f(pb, bad, { length: 2 }) === null);
  check('fixing the decimals alone (blank -> 0) is allowed', f(pb, bad, { decimalPositions: 0 }) === null);
  check('fixing everything at once is allowed', f(pb, bad, { dataType: 'Y', length: 2, decimalPositions: 0, usage: 'B' }) === null);

  // blank usage = default O on both sides
  const blankU = { dataType: 'Y', length: 2, decimalPositions: 0, usage: '' };
  check('blank stored usage vs the select showing O -> not a change', f(pb, blankU, { usage: 'O' }) === null);
  check('null stored usage vs O -> not a change', f(pb, Object.assign({}, blankU, { usage: null }), { usage: 'O' }) === null);
  check('blank stored usage -> explicit H IS a change and is blocked', /usage/.test(f(pb, blankU, { usage: 'H' }) || ''));
  check('blank stored usage -> B fixes it', f(pb, blankU, { usage: 'B' }) === null);

  check('lowercase input is normalised', /data type/.test(f(pb, { dataType: 'y', length: 2, decimalPositions: 0, usage: 'b' }, { dataType: 'a' }) || ''));
  check('null/undefined inputs are safe', f(null, null, null) === null && f(undefined, undefined, undefined) === null && f(pb, null, null) === null);

  // Cross-check against pshbtnfldDefinitionUpdates over a grid, from a VALID
  // old field: the guard must block exactly when the resulting field would
  // not conform (that function is what "drives" the check).
  let mismatches = 0;
  let combos = 0;
  ['Y', 'A', 'S', 'X'].forEach((dt) => [2, 1, 10].forEach((len) => [0, 1, null].forEach((dec) => ['B', 'I', 'O', 'H'].forEach((u) => {
    combos++;
    const merged = { dataType: dt, length: len, decimalPositions: dec, usage: u };
    const expectBlocked = DspfWriter.pshbtnfldDefinitionUpdates(merged) !== null;
    const gotBlocked = !!f(pb, good, { dataType: dt, length: len, decimalPositions: dec, usage: u });
    if (expectBlocked !== gotBlocked) mismatches++;
  }))));
  check('agrees with pshbtnfldDefinitionUpdates on all ' + combos + ' type/length/decimals/usage combinations', mismatches === 0);

  // I-57's own function is unchanged
  check('pshbtnfldDefinitionUpdates unchanged (valid field -> null)', DspfWriter.pshbtnfldDefinitionUpdates(good) === null);
  check('pshbtnfldDefinitionUpdates unchanged (bad field -> corrections)', JSON.stringify(DspfWriter.pshbtnfldDefinitionUpdates({ dataType: 'A', length: 5, decimalPositions: null, usage: 'O' })) === JSON.stringify({ dataType: 'Y', length: 2, decimalPositions: 0, usage: 'B' }));
}

// === DOM scenarios ===
// P1 (source line 2): valid push-button field 2Y 0B.
// F2 (line 4): ordinary field, no PSHBTNFLD.
// P3 (line 5): hand-written and ALREADY INVALID (5A, blank decimals, usage I).
// P4 (line 7): PSHBTNFLD with BLANK usage (default output = already invalid).
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'P1', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '3', col: '2', func: 'PSHBTNFLD' }),
  buildLine({ seq: '00030', func: "PSHBTNCHC(1 'Cmd1' CF01)" }),
  buildLine({ seq: '00040', name: 'F2', length: '20', dataType: 'A', usage: 'B', line: '6', col: '2' }),
  buildLine({ seq: '00050', name: 'P3', length: '5', dataType: 'A', usage: 'I', line: '8', col: '2', func: 'PSHBTNFLD' }),
  buildLine({ seq: '00060', func: "PSHBTNCHC(1 'Ok')" }),
  buildLine({ seq: '00070', name: 'P4', length: '2', dataType: 'Y', decimals: '0', line: '10', col: '2', func: 'PSHBTNFLD' }),
  buildLine({ seq: '00080', func: "PSHBTNCHC(1 'Go')" }),
].join('\n') + '\n';

function reparsedField(text, name) {
  const parsed = DspfParser.parseDspf(text);
  const out = [];
  parsed.records.forEach((r) => r.fields.forEach((f) => out.push(f)));
  return out.find((f) => f.name === name);
}

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I62.DSPF');
const posted = [];
const errors = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;

  // Select by SOURCE LINE (P1=2, F2=4, P3=5, P4=7), not by index: against
  // unfixed code a bad edit can hide a field and shift an index-based lookup.
  function selectField(line) {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    return true;
  }
  function apply(values) {
    if (!doc.getElementById('p-apply')) return { alertMessage: null, applyEdit: undefined, missing: true };
    Object.keys(values).forEach((id) => {
      const el = doc.getElementById(id);
      if (el) el.value = values[id];
    });
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  const val = (id) => { const el = doc.getElementById(id); return el ? el.value : undefined; };
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;

  // === Group B: a valid push-button field (P1, 2Y 0B) ===
  console.log('\nBasic tab Apply on a PSHBTNFLD field (P1): setup');
  if (selectField(2)) {
    check('Basic tab shows Y / 2 / 0 / B', val('p-type') === 'Y' && val('p-length') === '2' && val('p-dec') === '0' && val('p-usage') === 'B');
  }

  console.log('\nBasic tab Apply on a PSHBTNFLD field (P1): blocked data types');
  ['A', 'X', 'N', 'S', 'I', 'D', 'M', 'F', 'L', 'T', 'Z'].forEach((t) => {
    selectField(2);
    const r = apply({ 'p-type': t });
    check('data type ' + t + ' blocked with an alert naming PSHBTNFLD and Y, no applyEdit', blocked(r, /PSHBTNFLD/) && /\bY\b/.test(r.alertMessage || ''));
  });

  console.log('\nBasic tab Apply on a PSHBTNFLD field (P1): blocked lengths');
  ['10', '1', '3', ''].forEach((n) => {
    selectField(2);
    const r = apply({ 'p-length': n });
    check('length ' + JSON.stringify(n) + ' blocked with an alert naming PSHBTNFLD and length, no applyEdit', blocked(r, /PSHBTNFLD/) && /length/.test(r.alertMessage || ''));
  });

  console.log('\nBasic tab Apply on a PSHBTNFLD field (P1): blocked decimals');
  ['1', ''].forEach((n) => {
    selectField(2);
    const r = apply({ 'p-dec': n });
    check('decimals ' + JSON.stringify(n) + ' blocked with an alert naming decimal positions, no applyEdit', blocked(r, /decimal positions/));
  });

  console.log('\nBasic tab Apply on a PSHBTNFLD field (P1): blocked usages');
  ['O', 'H', 'M', 'P'].forEach((u) => {
    selectField(2);
    const r = apply({ 'p-usage': u });
    check('usage ' + u + ' blocked with an alert naming usage I or B, no applyEdit', blocked(r, /PSHBTNFLD/) && /I or B/.test(r.alertMessage || ''));
  });

  console.log('\nBasic tab Apply on a PSHBTNFLD field (P1): a blocked Apply keeps the other pending edits in the panel');
  selectField(2);
  {
    const r = apply({ 'p-name': 'P1KEEP', 'p-length': '10' });
    check('blocked (rename + bad length)', blocked(r, /length/));
    check('the typed name is still in the form (no re-render wiped it)', val('p-name') === 'P1KEEP');
  }

  console.log('\nBasic tab Apply on a PSHBTNFLD field (P1): allowed edits still commit');
  selectField(2);
  {
    const r = apply({ 'p-name': 'PB1' });
    check('rename commits with no alert', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'PB1');
    check('renamed field keeps Y / 2 / 0 / B, PSHBTNFLD and its PSHBTNCHC', !!f && f.dataType === 'Y' && f.length === 2 && f.decimalPositions === 0 && f.usage === 'B' &&
      f.keywords.some((k) => k.name === 'PSHBTNFLD') && f.keywords.some((k) => k.name === 'PSHBTNCHC'));
  }
  selectField(2);
  {
    const r = apply({ 'p-usage': 'I' });
    check('usage B -> I commits with no alert', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'PB1');
    check('usage I written, PSHBTNFLD kept', !!f && f.usage === 'I' && f.keywords.some((k) => k.name === 'PSHBTNFLD'));
  }
  selectField(2);
  {
    const r = apply({ 'p-usage': 'B', 'p-type': 'Y', 'p-length': '2', 'p-dec': '0' });
    check('usage I -> B with the other three re-sent unchanged commits with no alert', !r.alertMessage && !!r.applyEdit);
  }

  // === Group C: a field WITHOUT PSHBTNFLD (F2) - no regression ===
  console.log('\nBasic tab Apply on a field WITHOUT PSHBTNFLD (F2): unaffected');
  selectField(4);
  {
    const r = apply({ 'p-type': 'S', 'p-length': '10', 'p-dec': '2', 'p-usage': 'O' });
    check('data type S / length 10 / decimals 2 / usage O commit normally, no alert', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('S / 10 / 2 / O written', !!f && f.dataType === 'S' && f.length === 10 && f.decimalPositions === 2 && f.usage === 'O');
  }

  // === Group D: hand-written and already invalid (P3: 5A, blank decimals, I) ===
  console.log('\nHand-written PSHBTNFLD field that is ALREADY invalid (P3): unrelated edits are not blocked');
  selectField(5);
  {
    const r = apply({ 'p-name': 'P3B' });
    check('a rename-only Apply is not blocked (nothing was changed to a bad value)', !r.alertMessage && !!r.applyEdit);
  }
  selectField(5);
  {
    const r = apply({ 'p-length': '8' });
    check('changing length 5 -> 8 (another invalid length) IS blocked', blocked(r, /length/));
  }
  selectField(5);
  {
    const r = apply({ 'p-type': 'S' });
    check('changing data type A -> S (another invalid type) IS blocked', blocked(r, /data type/));
  }
  selectField(5);
  {
    const r = apply({ 'p-type': 'Y' });
    check('fixing the data type alone (A -> Y) commits', !r.alertMessage && !!r.applyEdit);
  }
  selectField(5);
  {
    const r = apply({ 'p-length': '2', 'p-dec': '0', 'p-usage': 'B' });
    check('fixing the rest (length 2, decimals 0, usage B) commits', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'P3B');
    check('the field is now Y / 2 / 0 / B with PSHBTNFLD kept', !!f && f.dataType === 'Y' && f.length === 2 && f.decimalPositions === 0 && f.usage === 'B' && f.keywords.some((k) => k.name === 'PSHBTNFLD'));
  }

  // === Group E: PSHBTNFLD with BLANK usage (P4) ===
  console.log('\nHand-written PSHBTNFLD field with BLANK usage (P4): unrelated edits are not blocked');
  selectField(7);
  {
    check('setup: the Usage select shows O for a blank stored usage', val('p-usage') === 'O');
    const r = apply({ 'p-name': 'P4B' });
    check('a rename-only Apply is not blocked (blank usage == default O == unchanged)', !r.alertMessage && !!r.applyEdit);
  }
  selectField(7);
  {
    const r = apply({ 'p-usage': 'H' });
    check('explicitly choosing H IS blocked', blocked(r, /usage/));
  }
  selectField(7);
  {
    const r = apply({ 'p-usage': 'B' });
    check('fixing it (usage B) commits', !r.alertMessage && !!r.applyEdit);
  }

  check('no uncaught errors', errors.length === 0);
  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

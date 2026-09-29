/**
 * i131ValnumFieldEligibility.test.js
 *
 * Task I-131 - deferred finding from the I-121 VALNUM slice. VALNUM's own
 * DDS Reference section: "The field containing the VALNUM keyword must be
 * defined as an input-capable field with the data type Y." Until now only the
 * General-tab row was hidden for other fields; nothing at the writer stopped
 * the raw keyword editor adding VALNUM to an ineligible field, or the Basic
 * tab changing a VALNUM field's usage / data type away from I/B / Y.
 *
 * Rule (from RECORD_TYPES.VALNUM): usage I or B (a blank usage is O), data
 * type Y (a blank data type is not Y). Diff-based like IGCALTTYP (I-94): only
 * an edit that INTRODUCES VALNUM is judged, an already-invalid hand-written
 * field stays editable, and removing VALNUM is always allowed.
 *
 * Part 1: the pure DspfWriter functions. Part 2: the real generated webview
 * in jsdom. Run with: node src/test/i131ValnumFieldEligibility.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const VAL = [k('VALNUM')];

// ===========================================================================
// Part 1 - pure functions
// ===========================================================================
console.log('valnumEligibilityReason');
{
  const e = DspfWriter.valnumEligibilityReason;
  check('I + Y eligible', e('I', 'Y') === null);
  check('B + Y eligible', e('B', 'Y') === null);
  check('lower-case normalised', e('b', 'y') === null);
  ['O', 'H', 'M', 'P'].forEach((u) => {
    const r = e(u, 'Y');
    check('usage ' + u + ' refused, naming VALNUM and usage I or B', !!r && /VALNUM/.test(r) && /usage I or B/.test(r));
  });
  check('blank usage is O: refused', /usage I or B/.test(e('', 'Y') || '') && /usage I or B/.test(e(null, 'Y') || ''));
  'ABCDEFGHJKLMNOPQRSTUVWXZ'.split('').forEach((d) => {
    check('data type ' + d + ' refused (only Y)', /data type Y/.test(e('B', d) || ''));
  });
  check('blank data type refused (not Y)', /data type Y/.test(e('B', '') || ''));
  check('usage reason comes first when both wrong', /usage I or B/.test(e('O', 'A')));
}

console.log('\nvalnumNewConflictReason (commitEdit choke point)');
{
  const f = DspfWriter.valnumNewConflictReason;
  const ok = { usage: 'B', dataType: 'Y' };
  check('introducing VALNUM on B/Y: allowed', f([], VAL, ok) === null);
  check('introducing on usage O: blocked', /usage I or B/.test(f([], VAL, { usage: 'O', dataType: 'Y' }) || ''));
  check('introducing on data type A: blocked', /data type Y/.test(f([], VAL, { usage: 'B', dataType: 'A' }) || ''));
  check('kind is judged AFTER the edit (usage fixed in the same edit)', f([], VAL, ok) === null);
  check('no VALNUM after the edit: null', f([], [k('DUP')], { usage: 'O', dataType: 'A' }) === null);
  check('VALNUM already there before: not re-judged (hand-written invalid field)', f(VAL, VAL.concat([k('DUP')]), { usage: 'O', dataType: 'A' }) === null);
  check('removing VALNUM is allowed', f(VAL, [], { usage: 'O', dataType: 'A' }) === null);
  check('missing fieldKind is treated as an ineligible (blank) kind', /usage I or B/.test(f([], VAL) || ''));
  check('null keyword lists are safe', f(null, null, ok) === null && f(undefined, VAL, ok) === null);
}

console.log('\nvalnumBasicEditConflictReason (Basic tab Apply)');
{
  const why = (field, updates, kws) => DspfWriter.valnumBasicEditConflictReason(kws === undefined ? VAL : kws, field, updates);
  const ok = (field, updates, kws) => why(field, updates, kws) === null;
  const good = { usage: 'B', dataType: 'Y' };
  check('no VALNUM on the field: never blocks', ok(good, { usage: 'O', dataType: 'A' }, []) && ok(good, { usage: 'O' }, null));
  check('usage B -> O: blocked, "Remove VALNUM first."', /usage I or B/.test(why(good, { usage: 'O' }) || '') && /Remove VALNUM first\.$/.test(why(good, { usage: 'O' })));
  check('usage B -> H / M / P: blocked', ['H', 'M', 'P'].every((u) => !ok(good, { usage: u })));
  check('usage B -> I: allowed', ok(good, { usage: 'I' }));
  check('usage B -> blank (= O): blocked', !ok(good, { usage: '' }));
  check('usage unchanged on an invalid field: allowed', ok({ usage: 'O', dataType: 'Y' }, { usage: 'O' }));
  check('blank usage stays O on both sides: allowed', ok({ usage: '', dataType: 'Y' }, { usage: 'O' }));
  check('usage O -> B (fixing it): allowed', ok({ usage: 'O', dataType: 'Y' }, { usage: 'B' }));
  check('data type Y -> A: blocked, naming Y', /data type Y/.test(why(good, { dataType: 'A' }) || ''));
  check('data type Y -> S / P / blank: blocked', ['S', 'P', ''].every((d) => !ok(good, { dataType: d })));
  check('data type unchanged on an invalid field: allowed', ok({ usage: 'B', dataType: 'A' }, { dataType: 'A' }));
  check('data type A -> Y (fixing it): allowed', ok({ usage: 'B', dataType: 'A' }, { dataType: 'Y' }));
  check('an update with neither usage nor dataType: allowed', ok({ usage: 'O', dataType: 'A' }, { name: 'X', length: 5 }));
  check('both wrong at once: the usage reason comes first', /usage I or B/.test(why(good, { usage: 'O', dataType: 'A' })));
}

console.log('\nreferencedFieldResolveConflictReason composes the new check');
{
  const f = { dataType: 'Y', usage: 'B', keywords: VAL };
  check('a resolve that turns the data type into P on a VALNUM field: blocked', /VALNUM/.test(DspfWriter.referencedFieldResolveConflictReason(f, { dataType: 'P' }) || ''));
}

// ===========================================================================
// Part 2 - real webview
// ===========================================================================
function buildLine(o) {
  const seq = (o.seq || '     ').padEnd(5, ' ');
  const line = ' '.repeat(80).split('');
  const put = (col, text) => { for (let i = 0; i < text.length; i++) line[col - 1 + i] = text[i]; };
  put(1, seq);
  put(6, 'A');
  if (o.nameType) put(17, o.nameType);
  if (o.name) put(19, o.name);
  if (o.length) put(35 - o.length.length, o.length);
  if (o.dataType) put(35, o.dataType);
  if (o.decimals) put(36, o.decimals.padStart(2, ' '));
  if (o.usage) put(38, o.usage);
  if (o.line) put(41 - o.line.length + 1, o.line);
  if (o.col) put(44 - o.col.length + 1, o.col);
  if (o.func) put(45, o.func);
  return line.join('').replace(/\s+$/, '');
}
// line numbers: R=1, F1=2 ... F7=8
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '5', dataType: 'Y', decimals: '0', usage: 'B', line: '3', col: '2' }),                       // 2  B + Y: eligible
  buildLine({ seq: '00030', name: 'F2', length: '8', dataType: 'A', usage: 'B', line: '4', col: '2' }),                                        // 3  type A
  buildLine({ seq: '00040', name: 'F3', length: '5', dataType: 'Y', decimals: '0', usage: 'O', line: '5', col: '2' }),                       // 4  usage O
  buildLine({ seq: '00050', name: 'F4', length: '5', dataType: 'Y', decimals: '0', usage: 'I', line: '6', col: '2' }),                       // 5  I + Y: eligible
  buildLine({ seq: '00060', name: 'F5', length: '5', dataType: 'Y', decimals: '0', usage: 'B', line: '7', col: '2', func: 'VALNUM' }),      // 6  valid, has it
  buildLine({ seq: '00070', name: 'F6', length: '8', dataType: 'A', usage: 'B', line: '8', col: '2', func: 'VALNUM' }),                       // 7  hand-written INVALID (type A)
  buildLine({ seq: '00080', name: 'F7', length: '5', dataType: 'Y', decimals: '0', usage: 'O', line: '9', col: '2', func: 'VALNUM' }),      // 8  hand-written INVALID (usage O)
].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I131.DSPF');
const posted = [];
const errors = [];
const alerts = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => alerts.push(m);
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const el = (id) => doc.getElementById(id);
  function selectField(line) {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    posted.length = 0;
    alerts.length = 0;
    return true;
  }
  const lastEdit = () => posted.filter((m) => m.type === 'applyEdit').pop();
  function rawAdd(line, name) {
    el('field-' + line + '-new-kw-name').value = name;
    const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  }
  function apply(values) {
    Object.keys(values).forEach((id) => { const e = el(id); if (e) e.value = values[id]; });
    el('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
  }
  function reparsed(text, name) {
    const out = [];
    DspfParser.parseDspf(text).records.forEach((r) => r.fields.forEach((f) => out.push(f)));
    return out.find((f) => f.name === name);
  }

  const has = (f) => !!f && f.keywords.some((x) => x.name === 'VALNUM');
  const blocked = (re) => alerts.length === 1 && re.test(alerts[0]) && !lastEdit();
  function removeKw(line, name) {
    const chip = doc.querySelector('.kw-remove[data-owner="field-' + line + '"][data-kw="' + name + '"]') || doc.querySelector('[data-owner="field-' + line + '"] .kw-remove');
    if (chip) chip.dispatchEvent(new Event('click', { bubbles: true }));
    return !!chip;
  }

  console.log('\nfixture: the parser reads each field as intended');
  {
    const p = (n) => reparsed(SRC, n);
    check('F1 B/Y, F2 B/A, F3 O/Y, F4 I/Y', p('F1').usage === 'B' && p('F1').dataType === 'Y' && p('F2').dataType === 'A' && p('F3').usage === 'O' && p('F4').usage === 'I');
    check('F5, F6, F7 carry VALNUM already', has(p('F5')) && has(p('F6')) && has(p('F7')));
  }

  console.log('\nraw keyword editor: blocked on an ineligible field, with the right reason');
  selectField(3); rawAdd(3, 'VALNUM');
  check('F2 (type A): alert naming VALNUM and data type Y, no applyEdit', blocked(/VALNUM/) && /data type Y/.test(alerts[0] || ''));
  selectField(4); rawAdd(4, 'VALNUM');
  check('F3 (usage O): alert naming usage I or B, no applyEdit', blocked(/usage I or B/));
  selectField(2); rawAdd(2, 'VALNUM');
  {
    const e = lastEdit();
    check('F1 (usage B, type Y): allowed, VALNUM written', alerts.length === 0 && has(e && reparsed(e.text, 'F1')));
  }
  selectField(5); rawAdd(5, 'VALNUM');
  {
    const e = lastEdit();
    check('F4 (usage I, type Y): allowed', alerts.length === 0 && has(e && reparsed(e.text, 'F4')));
  }

  console.log('\nBasic tab: a usage / data type change that would leave VALNUM ineligible is blocked');
  selectField(6);
  apply({ 'p-usage': 'O' });
  check('F5: usage B -> O blocked, no applyEdit, "Remove VALNUM first"', blocked(/usage I or B/) && /Remove VALNUM first/.test(alerts[0] || ''));
  selectField(6);
  apply({ 'p-type': 'A', 'p-length': '5' });
  check('F5: data type Y -> A blocked', blocked(/data type Y/));
  selectField(6);
  apply({ 'p-usage': 'I' });
  {
    const e = lastEdit();
    check('F5: usage B -> I (still input-capable) commits, VALNUM kept', alerts.length === 0 && has(e && reparsed(e.text, 'F5')) && reparsed(e.text, 'F5').usage === 'I');
  }

  console.log('\nBasic tab: fixing a hand-written invalid field is allowed, and unrelated edits are never blocked');
  selectField(7);
  apply({ 'p-name': 'F6B' });
  {
    const e = lastEdit();
    check('F6 (type A + VALNUM): a rename-only Apply goes through', alerts.length === 0 && !!e && !!reparsed(e.text, 'F6B'));
  }
  selectField(7);
  apply({ 'p-type': 'Y', 'p-dec': '0', 'p-length': '5' });
  {
    const e = lastEdit();
    check('F6: data type -> Y (fixing it) commits', alerts.length === 0 && !!e && reparsed(e.text, 'F6B') && reparsed(e.text, 'F6B').dataType === 'Y');
  }
  selectField(8);
  apply({ 'p-length': '6' });
  {
    const e = lastEdit();
    check('F7 (usage O + VALNUM): a length-only Apply goes through', alerts.length === 0 && !!e);
  }
  selectField(8);
  apply({ 'p-usage': 'B' });
  {
    const e = lastEdit();
    check('F7: usage -> B (fixing it) commits', alerts.length === 0 && !!e && reparsed(e.text, 'F7').usage === 'B');
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  setTimeout(() => process.exit(failureCount() === 0 ? 0 : 1), 50);
}, 500);

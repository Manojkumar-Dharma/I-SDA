/**
 * i94IgcalttypEligibility.test.js
 *
 * Task I-94 - follow-up from I-71. IGCALTTYP's own DDS Reference section:
 * "Specify this keyword only for input- and output-capable fields whose
 * keyboard shift type is A, N, X, W, or I. Do not specify this keyword for
 * DBCS fields." (and the DBCS chapter: not on DBCS-graphic fields, G in
 * position 35). I-71 enforced its keyword-vs-keyword exclusions and I-95 its
 * "no option indicators" rule; nothing enforced WHERE it may be used.
 *
 * Rules enforced: usage B only (so not I, O, H, M, P, nor a constant), and
 * data type (keyboard shift) one of A, N, X, W, I - which covers the DBCS
 * types J, E, O, G AND the numeric/date/time ones. A blank usage or data type
 * is "not yet set" and fails open. Routes covered, all diff-based so an
 * already-invalid hand-written field never blocks an unrelated edit: the
 * General row (hidden unless IGCALTTYP is already there), the raw keyword
 * editor and General-row add guards, the commitEdit choke point, and the
 * Basic tab's Apply.
 *
 * Part 1: the pure DspfWriter functions. Part 2: the real generated webview
 * in jsdom. Run with: node src/test/i94IgcalttypEligibility.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const IGC = [k('IGCALTTYP')];
const elig = DspfWriter.igcalttypEligibilityReason;

// ===========================================================================
// Part 1 - pure functions
// ===========================================================================
console.log('igcalttypEligibilityReason: usage');
check('B + A is eligible', elig('B', 'A', false) === null);
['I', 'O', 'H', 'M', 'P'].forEach((u) => {
  const r = elig(u, 'A', false);
  check('usage ' + u + ' is refused, naming IGCALTTYP and usage B', !!r && /IGCALTTYP/.test(r) && /usage B/.test(r));
});
check('a blank usage fails open (not yet set)', elig('', 'A', false) === null);
check('an undefined usage fails open', elig(undefined, 'A', false) === null);
check('lower-case / padded usage is normalised', elig(' b ', 'A', false) === null && !!elig(' o ', 'A', false));
check('a constant is refused', /constant/.test(elig('B', 'A', true) || ''));

console.log('\nigcalttypEligibilityReason: keyboard shift / data type (A, N, X, W, I only)');
['A', 'N', 'X', 'W', 'I'].forEach((t) => check('data type ' + t + ' is eligible', elig('B', t, false) === null));
check('a blank data type fails open (DDS default is A)', elig('B', '', false) === null && elig('B', undefined, false) === null);
['J', 'E', 'O', 'G'].forEach((t) => {
  const r = elig('B', t, false);
  check('DBCS data type ' + t + ' is refused, naming it and DBCS', !!r && r.indexOf(' ' + t + ' ') !== -1 && /DBCS/.test(r));
});
['S', 'Y', 'D', 'M', 'P', 'B', 'F', 'L', 'T', 'Z'].forEach((t) => check('non-character data type ' + t + ' is refused', !!elig('B', t, false)));
check('lower-case data type is normalised', elig('B', ' n ', false) === null && !!elig('B', ' g ', false));
check('usage is checked before data type (both wrong: the usage reason)', /usage B/.test(elig('O', 'G', false) || ''));

console.log('\nigcalttypConflictReason with the optional field kind (raw editor / General row add guards)');
{
  const bad = { usage: 'O', dataType: 'A', isConstant: false };
  const good = { usage: 'B', dataType: 'A', isConstant: false };
  check('adding IGCALTTYP to a usage-O field: eligibility reason', /usage B/.test(DspfWriter.igcalttypConflictReason('IGCALTTYP', '', [], bad) || ''));
  check('adding it to a usage-B character field: allowed', DspfWriter.igcalttypConflictReason('IGCALTTYP', '', [], good) === null);
  check('the name is matched case-insensitively', !!DspfWriter.igcalttypConflictReason('igcalttyp', '', [], bad));
  check('kind omitted: I-71 behaviour unchanged (no eligibility check)', DspfWriter.igcalttypConflictReason('IGCALTTYP', '', []) === null);
  check('eligible kind + an excluded keyword: I-71 forward reason still given', /DUP/.test(DspfWriter.igcalttypConflictReason('IGCALTTYP', '', [k('DUP')], good) || ''));
  check('I-71 reverse direction unchanged (DUP onto an IGCALTTYP field)', /already has IGCALTTYP/.test(DspfWriter.igcalttypConflictReason('DUP', '', IGC, bad) || ''));
  check('any other keyword is untouched by the kind', DspfWriter.igcalttypConflictReason('DSPATR', 'HI', [], bad) === null);
}

console.log('\nigcalttypNewConflictReason with the optional field kind (commitEdit choke point)');
{
  const bad = { usage: 'I', dataType: 'A', isConstant: false };
  const good = { usage: 'B', dataType: 'A', isConstant: false };
  check('introducing IGCALTTYP on an ineligible field: blocked', !!DspfWriter.igcalttypNewConflictReason([], IGC, bad));
  check('introducing it on an eligible field: allowed', DspfWriter.igcalttypNewConflictReason([], IGC, good) === null);
  check('introducing it on a constant: blocked', !!DspfWriter.igcalttypNewConflictReason([], IGC, { usage: 'B', dataType: 'A', isConstant: true }));
  check('ALREADY there on an ineligible field (hand-written): not re-reported', DspfWriter.igcalttypNewConflictReason(IGC, IGC.concat([k('DSPATR', 'HI')]), bad) === null);
  check('removing it from an ineligible field: allowed', DspfWriter.igcalttypNewConflictReason(IGC, [], bad) === null);
  check('kind omitted: I-71 behaviour unchanged', DspfWriter.igcalttypNewConflictReason([], IGC) === null);
  check('the eligibility reason wins over an exclusion hit', /usage B/.test(DspfWriter.igcalttypNewConflictReason([], IGC.concat([k('DUP')]), { usage: 'O', dataType: 'A' }) || ''));
  check('eligible + an exclusion hit: I-71 forward reason still given', /DUP/.test(DspfWriter.igcalttypNewConflictReason([], IGC.concat([k('DUP')]), good) || ''));
}

console.log('\nigcalttypBasicEditConflictReason (Basic tab Apply)');
{
  const ok = (field, updates) => DspfWriter.igcalttypBasicEditConflictReason(IGC, field, updates) === null;
  const why = (field, updates) => DspfWriter.igcalttypBasicEditConflictReason(IGC, field, updates) || '';
  check('a field without IGCALTTYP is never affected', DspfWriter.igcalttypBasicEditConflictReason([], { usage: 'B', dataType: 'A' }, { usage: 'O', dataType: 'S' }) === null);
  check('usage B -> I: blocked with "Remove IGCALTTYP first"', /usage B/.test(why({ usage: 'B', dataType: 'A' }, { usage: 'I' })) && /Remove IGCALTTYP first/.test(why({ usage: 'B', dataType: 'A' }, { usage: 'I' })));
  check('usage B -> blank (= O): blocked', !ok({ usage: 'B', dataType: 'A' }, { usage: '' }));
  check('usage O -> B (fixing it): allowed', ok({ usage: 'O', dataType: 'A' }, { usage: 'B' }));
  check('usage blank -> O is not a change: allowed', ok({ usage: '', dataType: 'A' }, { usage: 'O' }));
  check('usage O -> I (both invalid, but it is a change): blocked', !ok({ usage: 'O', dataType: 'A' }, { usage: 'I' }));
  check('usage unchanged on an invalid field: allowed', ok({ usage: 'O', dataType: 'A' }, { usage: 'O' }));
  check('data type A -> S: blocked, naming S', /not S/.test(why({ usage: 'B', dataType: 'A' }, { dataType: 'S' })));
  check('data type A -> J (DBCS): blocked', /DBCS/.test(why({ usage: 'B', dataType: 'A' }, { dataType: 'J' })));
  check('data type A -> N / X / W / I: allowed', ['N', 'X', 'W', 'I'].every((t) => ok({ usage: 'B', dataType: 'A' }, { dataType: t })));
  check('data type A -> blank: allowed (fail open)', ok({ usage: 'B', dataType: 'A' }, { dataType: '' }));
  check('data type S -> F (already invalid, still a change to an invalid one): blocked', !ok({ usage: 'B', dataType: 'S' }, { dataType: 'F' }));
  check('data type S -> A (fixing it): allowed', ok({ usage: 'B', dataType: 'S' }, { dataType: 'A' }));
  check('data type unchanged on an invalid field: allowed', ok({ usage: 'B', dataType: 'S' }, { dataType: 'S' }));
  check('an update with neither usage nor dataType (rename, length): allowed', ok({ usage: 'O', dataType: 'S' }, { name: 'X', length: 5 }));
  check('both wrong at once: the usage reason comes first', /usage B/.test(why({ usage: 'B', dataType: 'A' }, { usage: 'O', dataType: 'S' })));
}

console.log('\nreferencedFieldResolveConflictReason (I-88) composes the new check');
{
  const f = { dataType: 'A', usage: 'B', keywords: IGC };
  check('a resolve that turns the data type into P on an IGCALTTYP field: blocked', /IGCALTTYP/.test(DspfWriter.referencedFieldResolveConflictReason(f, { dataType: 'P' }) || ''));
  check('a resolved character field (blank type over A): not a change, allowed', DspfWriter.referencedFieldResolveConflictReason(f, { dataType: '' }) === null);
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
// line numbers: R=1, F1=2 ... F8=9, CONST=10
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '8', dataType: 'A', usage: 'B', line: '3', col: '2' }),                    // 2  B + A: eligible
  buildLine({ seq: '00030', name: 'F2', length: '8', dataType: 'A', usage: 'O', line: '4', col: '2' }),                    // 3  usage O
  buildLine({ seq: '00040', name: 'F3', length: '8', dataType: 'A', usage: 'I', line: '5', col: '2' }),                    // 4  usage I
  buildLine({ seq: '00050', name: 'F4', length: '5', dataType: 'S', decimals: '0', usage: 'B', line: '6', col: '2' }),      // 5  numeric
  buildLine({ seq: '00060', name: 'F5', length: '8', dataType: 'A', usage: 'B', line: '7', col: '2', func: 'IGCALTTYP' }), // 6  valid, has it
  buildLine({ seq: '00070', name: 'F6', length: '8', dataType: 'A', usage: 'O', line: '8', col: '2', func: 'IGCALTTYP' }), // 7  hand-written INVALID (usage O)
  buildLine({ seq: '00080', name: 'F7', length: '5', dataType: 'S', decimals: '0', usage: 'B', line: '9', col: '2', func: 'IGCALTTYP' }), // 8 hand-written INVALID (type S)
  buildLine({ seq: '00090', name: 'F8', length: '8', dataType: 'A', usage: 'B', line: '10', col: '2' }),                   // 9  B + A, plain
  buildLine({ seq: '00100', line: '12', col: '2', func: "'Hello'" }),                                                        // 10 literal constant
].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I94.DSPF');
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
  const igcBox = (line) => el('field-' + line + '-gen-igcalttyp-on');
  function tick(line, on) {
    const c = igcBox(line);
    c.checked = on;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  }
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
  const has = (f) => !!f && f.keywords.some((x) => x.name === 'IGCALTTYP');
  const blocked = (re) => alerts.length === 1 && re.test(alerts[0]) && !lastEdit();

  console.log('\nfixture: the parser reads each field as intended');
  {
    const p = (n) => reparsed(SRC, n);
    check('F1 B/A, F2 O/A, F3 I/A, F4 B/S', p('F1').usage === 'B' && p('F2').usage === 'O' && p('F3').usage === 'I' && p('F4').dataType === 'S');
    check('F5, F6, F7 carry IGCALTTYP already', has(p('F5')) && has(p('F6')) && has(p('F7')));
  }

  console.log('\nGeneral row visibility');
  selectField(2); check('F1 (usage B, type A): the IGCALTTYP row is offered, unchecked', !!igcBox(2) && igcBox(2).checked === false);
  selectField(3); check('F2 (usage O): NOT offered', !igcBox(3));
  selectField(4); check('F3 (usage I): NOT offered', !igcBox(4));
  selectField(5); check('F4 (numeric, type S): NOT offered', !igcBox(5));
  selectField(6); check('F5 (valid, already has it): offered and ticked', !!igcBox(6) && igcBox(6).checked === true);
  selectField(7); check('F6 (hand-written, usage O, has it): STILL offered and ticked, so it can be un-ticked', !!igcBox(7) && igcBox(7).checked === true);
  selectField(8); check('F7 (hand-written, type S, has it): STILL offered and ticked', !!igcBox(8) && igcBox(8).checked === true);
  selectField(10); check('the literal constant: not offered (unchanged from I-33)', !igcBox(11) && !doc.querySelector('[id$="-gen-igcalttyp-on"]'));

  console.log('\nF1 (eligible): ticking IGCALTTYP commits');
  selectField(2);
  tick(2, true);
  {
    const e = lastEdit();
    check('no alert, applyEdit posted', alerts.length === 0 && !!e);
    check('IGCALTTYP written', has(e && reparsed(e.text, 'F1')));
  }

  console.log('\nraw keyword editor: blocked on an ineligible field, with the right reason');
  selectField(3); rawAdd(3, 'IGCALTTYP');
  check('F2 (usage O): alert naming IGCALTTYP and usage B, no applyEdit', blocked(/IGCALTTYP/) && /usage B/.test(alerts[0] || ''));
  selectField(4); rawAdd(4, 'IGCALTTYP');
  check('F3 (usage I): blocked', blocked(/usage B/));
  selectField(5); rawAdd(5, 'IGCALTTYP');
  check('F4 (type S): alert naming S and the A/N/X/W/I rule, no applyEdit', blocked(/keyboard shift type is A, N, X, W or I, not S/));
  selectField(10); rawAdd(10, 'IGCALTTYP');
  check('the literal constant: blocked (constant)', blocked(/constant/));
  selectField(9); rawAdd(9, 'IGCALTTYP');
  {
    const e = lastEdit();
    check('F8 (usage B, type A): allowed', alerts.length === 0 && has(e && reparsed(e.text, 'F8')));
  }

  console.log('\nBasic tab: a usage / data type change that would leave IGCALTTYP ineligible is blocked');
  selectField(6);
  apply({ 'p-usage': 'I' });
  check('F5: usage B -> I blocked, no applyEdit, "Remove IGCALTTYP first"', blocked(/usage B/) && /Remove IGCALTTYP first/.test(alerts[0] || ''));
  selectField(6);
  apply({ 'p-type': 'S', 'p-dec': '0', 'p-length': '8' });
  check('F5: data type A -> S blocked', blocked(/keyboard shift type is A, N, X, W or I, not S/));
  selectField(6);
  apply({ 'p-type': 'X' });
  {
    const e = lastEdit();
    check('F5: data type A -> X (still a valid shift) commits, IGCALTTYP kept', alerts.length === 0 && has(e && reparsed(e.text, 'F5')) && reparsed(e.text, 'F5').dataType === 'X');
  }

  console.log('\nBasic tab: fixing a hand-written invalid field is allowed, and unrelated edits are never blocked');
  selectField(7);
  apply({ 'p-name': 'F6B' });
  {
    const e = lastEdit();
    check('F6 (usage O + IGCALTTYP): a rename-only Apply goes through', alerts.length === 0 && !!e && !!reparsed(e.text, 'F6B'));
  }
  selectField(7);
  apply({ 'p-usage': 'B' });
  {
    const e = lastEdit();
    check('F6: changing usage to B (fixing it) commits', alerts.length === 0 && !!e && reparsed(e.text, 'F6B') && reparsed(e.text, 'F6B').usage === 'B');
  }
  selectField(8);
  apply({ 'p-length': '9' });
  {
    const e = lastEdit();
    check('F7 (type S + IGCALTTYP): a length-only Apply goes through', alerts.length === 0 && !!e);
  }

  console.log('\nun-ticking IGCALTTYP on an ineligible hand-written field is allowed');
  selectField(8);
  tick(8, false);
  {
    const e = lastEdit();
    check('no alert, applyEdit posted', alerts.length === 0 && !!e);
    check('IGCALTTYP removed, the field otherwise untouched', !!e && !has(reparsed(e.text, 'F7')) && reparsed(e.text, 'F7').dataType === 'S');
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  setTimeout(() => process.exit(failureCount() === 0 ? 0 : 1), 50);
}, 500);

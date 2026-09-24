/**
 * i69ChkmsgidDependencyGuard.test.js
 *
 * Task I-69 - CHKMSGID's own DDS Reference section: "CHKMSGID is allowed
 * only on fields which also contain a CHECK(M10), CHECK(M11), CHECK(VN),
 * CHECK(VNE), CMP, COMP, RANGE, or VALUES keyword. The field must be
 * input-capable (usage B or I)." I-30 found nothing enforced either rule.
 *
 *   A. DspfWriter's pure functions (qualifier matrix, both directions of
 *      the diff-based check, the raw-editor add guard, the Basic-tab usage
 *      guard).
 *   B. The real generated webview: the CHKMSGID Apply, every path that can
 *      remove the last qualifier (validity instance editor, raw editor),
 *      the raw editor's add, and the Basic tab's usage Apply - plus what
 *      must NOT be blocked (an already-invalid hand-written field, removing
 *      CHKMSGID itself, removing one of several qualifiers, CHECK codes
 *      that do not qualify).
 * Run with: node src/test/i69ChkmsgidDependencyGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// A. DspfWriter
// ===========================================================================
console.log('A1. hasChkmsgidQualifier');
{
  const q = DspfWriter.hasChkmsgidQualifier;
  for (const n of ['CMP', 'COMP', 'RANGE', 'VALUES']) check(n + ' qualifies', q([kwd(n, '1 10')]));
  for (const c of ['M10', 'M11', 'VN', 'VNE']) check('CHECK(' + c + ') qualifies', q([kwd('CHECK', c)]));
  check('CHECK(ME VN) qualifies (matched by token)', q([kwd('CHECK', 'ME VN')]));
  for (const c of ['ME', 'MF', 'AB', 'FE', 'RB', 'LC']) check('CHECK(' + c + ') does NOT qualify', !q([kwd('CHECK', c)]));
  check('a bare CHECK with no code does not qualify', !q([kwd('CHECK')]));
  check('unrelated keywords do not qualify', !q([kwd('DSPATR', 'HI'), kwd('EDTCDE', 'Y'), kwd('DFT', "'X'")]));
  check('an empty list does not qualify', !q([]) && !q(undefined));
}

console.log('\nA2. chkmsgidNewConflictReason - forward direction (introducing CHKMSGID)');
{
  const r = DspfWriter.chkmsgidNewConflictReason;
  const cm = kwd('CHKMSGID', 'USR1234 USRMSGS');
  check('introducing CHKMSGID with no qualifier is blocked', !!r([], [cm]));
  const reason = r([kwd('DSPATR', 'HI')], [kwd('DSPATR', 'HI'), cm]);
  check('the reason names the whole qualifying list', /CHECK\(M10\)/.test(reason) && /VALUES/.test(reason) && /CMP/.test(reason));
  check('introducing it next to CHECK(ME) only (non-qualifying) is still blocked', !!r([kwd('CHECK', 'ME')], [kwd('CHECK', 'ME'), cm]));
  check('introducing it next to RANGE is fine', r([kwd('RANGE', '1 10')], [kwd('RANGE', '1 10'), cm]) === null);
  check('introducing it next to CHECK(VN) is fine', r([kwd('CHECK', 'VN')], [kwd('CHECK', 'VN'), cm]) === null);
  check('introducing a qualifier and CHKMSGID in the SAME edit is fine', r([], [kwd('VALUES', "'A' 'B'"), cm]) === null);
  check('an edit that never has CHKMSGID is never reported', r([kwd('RANGE', '1 10')], [kwd('DSPATR', 'HI')]) === null);
}

console.log('\nA3. chkmsgidNewConflictReason - reverse direction (removing the last qualifier)');
{
  const r = DspfWriter.chkmsgidNewConflictReason;
  const cm = kwd('CHKMSGID', 'USR1234 USRMSGS');
  const reason = r([kwd('RANGE', '1 10'), cm], [cm]);
  check('removing the only qualifier while CHKMSGID stays is blocked, telling the user what to do', !!reason && /Remove CHKMSGID first/.test(reason));
  check('removing one of TWO qualifiers is fine', r([kwd('RANGE', '1 10'), kwd('VALUES', "'A'"), cm], [kwd('VALUES', "'A'"), cm]) === null);
  check('removing CHKMSGID together with the qualifier is fine', r([kwd('RANGE', '1 10'), cm], []) === null);
  check('swapping one qualifier for another in one edit is fine', r([kwd('RANGE', '1 10'), cm], [kwd('COMP', 'GT 5'), cm]) === null);
  check('CHECK(VN) -> CHECK(ME) removes the qualifying code and is blocked', !!r([kwd('CHECK', 'VN'), cm], [kwd('CHECK', 'ME'), cm]));
  check('CHECK(ME VN) -> CHECK(ME) is blocked too', !!r([kwd('CHECK', 'ME VN'), cm], [kwd('CHECK', 'ME'), cm]));
  check('an ALREADY-invalid field (CHKMSGID, no qualifier before) is not re-reported for an unrelated edit', r([cm], [cm, kwd('DSPATR', 'HI')]) === null);
  check('...nor when its message id is edited', r([cm], [kwd('CHKMSGID', 'USR9999 USRMSGS')]) === null);
}

console.log('\nA4. chkmsgidFieldAddReason (raw editor) and chkmsgidBasicEditConflictReason (Basic tab)');
{
  const add = DspfWriter.chkmsgidFieldAddReason;
  check('null for any keyword other than CHKMSGID', add('RANGE', [], 'O') === null);
  check('CHKMSGID with no qualifier is refused', !!add('CHKMSGID', [], 'B'));
  check('CHKMSGID on an output-only field is refused even with a qualifier', /input-capable/.test(add('CHKMSGID', [kwd('RANGE', '1 10')], 'O')));
  for (const u of ['H', 'M', 'P']) check('usage ' + u + ' is refused', !!add('CHKMSGID', [kwd('RANGE', '1 10')], u));
  check('usage B and I are fine', add('CHKMSGID', [kwd('RANGE', '1 10')], 'B') === null && add('CHKMSGID', [kwd('RANGE', '1 10')], 'I') === null);
  check('a blank usage (still being drafted) is not blocked', add('CHKMSGID', [kwd('RANGE', '1 10')], '') === null);

  const basic = DspfWriter.chkmsgidBasicEditConflictReason;
  const kws = [kwd('RANGE', '1 10'), kwd('CHKMSGID', 'USR1234 USRMSGS')];
  check('B -> O on a CHKMSGID field is blocked', !!basic(kws, 'B', 'O'));
  check('I -> M, B -> H and B -> P are blocked', !!basic(kws, 'I', 'M') && !!basic(kws, 'B', 'H') && !!basic(kws, 'B', 'P'));
  check('B -> I and I -> B are fine', basic(kws, 'B', 'I') === null && basic(kws, 'I', 'B') === null);
  check('an unchanged usage is never reported (even an already-invalid O)', basic(kws, 'O', 'O') === null);
  check('a field without CHKMSGID is never reported', basic([kwd('RANGE', '1 10')], 'B', 'O') === null);
}

// ===========================================================================
// B. Real generated webview
// ===========================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' });
function fieldLines(name, usage, keywordTexts) {
  const lines = [buildLine({ seq: '00020', name, length: '10', dataType: 'A', usage, line: '2', col: '2' })];
  (keywordTexts || []).forEach((t, i) => lines.push(buildLine({ seq: String(21 + i).padStart(5, '0'), func: t })));
  return lines;
}

async function scenario(lines, fn) {
  const src = [rec].concat(lines).join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'CM.DSPF');
  const posted = [], alerts = [], errors = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} });
    },
  });
  await sleep(450);
  const doc = dom.window.document;
  const Ev = dom.window.Event;
  const ctx = {
    doc, posted, alerts,
    fire: (el, type) => el.dispatchEvent(new Ev(type || 'change', { bubbles: true })),
    click: (el) => el.dispatchEvent(new Ev('click', { bubbles: true })),
    reset: () => { posted.length = 0; alerts.length = 0; },
    lastEdit: () => posted.filter((m) => m.type === 'applyEdit').pop() || null,
    modelOf: () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? DspfParser.parseDspf(e.text) : null; },
    select: (name) => {
      const el = doc.querySelector('.dspf-field[data-field="' + name + '"]');
      if (!el) return null;
      el.dispatchEvent(new Ev('click', { bubbles: true }));
      return 'field-' + el.getAttribute('data-source-line');
    },
  };
  await fn(ctx);
  check('no uncaught errors in this scenario', errors.length === 0);
  dom.window.close();
}

function fillCm(c, owner, id, file) {
  c.doc.getElementById(owner + '-cm-msgid').value = id;
  c.doc.getElementById(owner + '-cm-msgfile').value = file;
  c.fire(c.doc.getElementById(owner + '-cm-msgid'));
  c.fire(c.doc.getElementById(owner + '-cm-msgfile'));
}
const cmOf = (model, name) => { const f = model && model.records[0].fields.find((x) => x.name === name); return f ? f.keywords.filter((k) => k.name === 'CHKMSGID') : []; };

async function main() {
  console.log('\nB1. CHKMSGID Apply: forward direction');
  await scenario(fieldLines('NAME', 'B', []), async (c) => {
    const o = c.select('NAME');
    check('setup: field selected and the CHKMSGID inputs exist', !!o && !!c.doc.getElementById(o + '-cm-msgid'));
    fillCm(c, o, 'USR1234', 'USRMSGS');
    c.reset();
    c.click(c.doc.querySelector('.' + o + '-cm-apply'));
    check('blocked with an alert naming the qualifying keywords', c.alerts.length === 1 && /VALUES/.test(c.alerts[0]) && /RANGE/.test(c.alerts[0]));
    check('no edit was posted', c.lastEdit() === null);
    check('what the user typed is kept (the panel was not re-rendered blank)', c.doc.getElementById(o + '-cm-msgid').value === 'USR1234' && c.doc.getElementById(o + '-cm-msgfile').value === 'USRMSGS');
  });
  await scenario(fieldLines('NAME', 'B', ['RANGE(1 10)']), async (c) => {
    const o = c.select('NAME');
    fillCm(c, o, 'USR1234', 'USRMSGS');
    c.reset();
    c.click(c.doc.querySelector('.' + o + '-cm-apply'));
    const cm = cmOf(c.modelOf(), 'NAME');
    check('with RANGE on the field it is written, no alert', c.alerts.length === 0 && cm.length === 1 && /USR1234 USRMSGS/.test(cm[0].parameters));
  });
  await scenario(fieldLines('NAME', 'B', ['CHECK(VN)']), async (c) => {
    const o = c.select('NAME');
    fillCm(c, o, 'USR1234', 'USRMSGS');
    c.reset();
    c.click(c.doc.querySelector('.' + o + '-cm-apply'));
    check('with CHECK(VN) on the field it is written', c.alerts.length === 0 && cmOf(c.modelOf(), 'NAME').length === 1);
  });
  await scenario(fieldLines('NAME', 'B', ['CHECK(ME)']), async (c) => {
    const o = c.select('NAME');
    fillCm(c, o, 'USR1234', 'USRMSGS');
    c.reset();
    c.click(c.doc.querySelector('.' + o + '-cm-apply'));
    check('CHECK(ME) does NOT qualify - still blocked', c.alerts.length === 1 && c.lastEdit() === null);
  });

  console.log('\nB2. Reverse direction: removing the last qualifier');
  await scenario(fieldLines('NAME', 'B', ['RANGE(1 10)', 'CHKMSGID(USR1234 USRMSGS)']), async (c) => {
    const o = c.select('NAME');
    const rm = c.doc.querySelector('.repeat-inst-remove[data-prefix="' + o + '-vc-rep"][data-idx="0"]');
    check('setup: RANGE\'s remove button is rendered', !!rm);
    c.reset();
    c.click(rm);
    check('removing RANGE while CHKMSGID stays is blocked, telling the user to remove CHKMSGID first', c.alerts.length === 1 && /Remove CHKMSGID first/.test(c.alerts[0]));
    check('no edit was posted', c.lastEdit() === null);

    c.reset();
    c.doc.getElementById(o + '-cm-msgid').value = '';
    c.doc.getElementById(o + '-cm-msgfile').value = '';
    c.click(c.doc.querySelector('.' + o + '-cm-apply'));
    check('removing CHKMSGID itself (blank both) is never blocked', c.alerts.length === 0 && cmOf(c.modelOf(), 'NAME').length === 0);
    check('...and RANGE survives that edit', c.modelOf().records[0].fields[0].keywords.some((k) => k.name === 'RANGE'));
  });
  await scenario(fieldLines('NAME', 'B', ['RANGE(1 10)', 'VALUES(\'A\' \'B\')', 'CHKMSGID(USR1234 USRMSGS)']), async (c) => {
    const o = c.select('NAME');
    c.reset();
    c.click(c.doc.querySelector('.repeat-inst-remove[data-prefix="' + o + '-vc-rep"][data-idx="0"]'));
    const kws = c.modelOf() && c.modelOf().records[0].fields[0].keywords.map((k) => k.name);
    check('removing one of TWO qualifiers is allowed', c.alerts.length === 0 && !!kws && kws.indexOf('RANGE') === -1 && kws.indexOf('VALUES') !== -1 && kws.indexOf('CHKMSGID') !== -1);
  });
  await scenario(fieldLines('NAME', 'B', ['RANGE(1 10)', 'CHKMSGID(USR1234 USRMSGS)']), async (c) => {
    const o = c.select('NAME');
    const raw = Array.from(c.doc.querySelectorAll('.kw-remove[data-owner="' + o + '"]'));
    check('setup: the raw editor lists both keywords', raw.length >= 2);
    c.reset();
    c.click(raw[0]);
    check('the raw editor\'s remove button is covered by the same choke point', c.alerts.length === 1 && /Remove CHKMSGID first/.test(c.alerts[0]) && c.lastEdit() === null);
  });

  console.log('\nB3. An already-invalid hand-written field is never blocked for unrelated edits');
  await scenario(fieldLines('NAME', 'B', ['CHKMSGID(USR1234 USRMSGS)']), async (c) => {
    const o = c.select('NAME');
    check('setup: renders with its message id', c.doc.getElementById(o + '-cm-msgid').value === 'USR1234');
    fillCm(c, o, 'USR9999', 'USRMSGS');
    c.reset();
    c.click(c.doc.querySelector('.' + o + '-cm-apply'));
    check('editing its message id still applies (no qualifier before, none after)', c.alerts.length === 0 && /USR9999/.test(cmOf(c.modelOf(), 'NAME')[0].parameters));
  });

  console.log('\nB4. Raw keyword editor: adding CHKMSGID');
  async function addRaw(c, o, name, params) {
    c.doc.getElementById(o + '-new-kw-name').value = name;
    c.doc.getElementById(o + '-new-kw-params').value = params || '';
    c.reset();
    c.click(c.doc.querySelector('.kw-add[data-owner="' + o + '"]'));
  }
  await scenario(fieldLines('NAME', 'B', []), async (c) => {
    const o = c.select('NAME');
    await addRaw(c, o, 'CHKMSGID', 'USR1234 USRMSGS');
    check('no qualifier: blocked', c.alerts.length === 1 && /VALUES/.test(c.alerts[0]) && c.lastEdit() === null);
  });
  await scenario(fieldLines('NAME', 'B', ['VALUES(\'A\' \'B\')']), async (c) => {
    const o = c.select('NAME');
    await addRaw(c, o, 'CHKMSGID', 'USR1234 USRMSGS');
    check('with VALUES present: added', c.alerts.length === 0 && cmOf(c.modelOf(), 'NAME').length === 1);
  });
  await scenario(fieldLines('OUT', 'O', ['RANGE(1 10)']), async (c) => {
    const o = c.select('OUT');
    await addRaw(c, o, 'CHKMSGID', 'USR1234 USRMSGS');
    check('on an output-only field it is refused for its usage even with a qualifier', c.alerts.length === 1 && /input-capable/.test(c.alerts[0]) && c.lastEdit() === null);
  });

  console.log('\nB5. Basic tab: usage change on a CHKMSGID field');
  await scenario(fieldLines('NAME', 'B', ['RANGE(1 10)', 'CHKMSGID(USR1234 USRMSGS)']), async (c) => {
    c.select('NAME');
    const usage = c.doc.getElementById('p-usage');
    check('setup: usage select shows B', usage.value === 'B');
    usage.value = 'O';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('B -> O is blocked with an alert and no edit', c.alerts.length === 1 && /input-capable/.test(c.alerts[0]) && c.lastEdit() === null);
    usage.value = 'I';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('B -> I is allowed', c.alerts.length === 0 && !!c.lastEdit());
  });
  await scenario(fieldLines('NAME', 'B', ['RANGE(1 10)', 'CHKMSGID(USR1234 USRMSGS)']), async (c) => {
    c.select('NAME');
    c.doc.getElementById('p-length').value = '12';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('an unrelated Basic-tab edit (length) is unaffected', c.alerts.length === 0 && !!c.lastEdit());
  });

  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

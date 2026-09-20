/**
 * i70ChridEligibilityGuard.test.js
 *
 * Task I-70 - CHRID's own DDS Reference section: "The CHRID keyword is not
 * valid on constant fields, numeric fields (fields with decimal positions
 * specified in positions 36 through 37), message fields (M specified in
 * position 38), hidden fields (H specified in position 38), or
 * program-to-system fields (P in Position 38)." and "The CHRID keyword
 * cannot be specified with the DUP (Duplication) keyword." I-30 found
 * nothing enforced beyond hiding the General keywords row for constants
 * and M/P fields.
 *
 *   A. DspfWriter's pure functions (eligibility matrix, the raw-editor /
 *      row add guard in both directions, the diff-based commitEdit check,
 *      the Basic-tab usage / decimals guard).
 *   B. The General keywords row helpers (hidden for H / numeric fields
 *      unless CHRID is already on the field; guarded on-transition).
 *   C. The real generated webview: the General keywords checkbox, the DUP
 *      checkbox (reverse direction, via the commitEdit choke point), the
 *      raw editor's add, and the Basic tab's Apply - plus what must NOT be
 *      blocked (an already-invalid hand-written field, removing CHRID,
 *      unrelated edits, an ordinary CHRID on an output/input/both
 *      character field).
 * Run with: node src/test/i70ChridEligibilityGuard.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
// webviewClientHelpers.js calls a bare DspfWriter (a browser global in the webview).
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// A. DspfWriter
// ===========================================================================
console.log('A1. chridEligibilityReason');
{
  const r = DspfWriter.chridEligibilityReason;
  check('an output character field is eligible', r('O', null, false) === null);
  check('an input character field is eligible', r('I', null, false) === null);
  check('a both-usage character field is eligible', r('B', null, false) === null);
  check('a blank usage (DDS default: output) is eligible', r('', null, false) === null && r(undefined, undefined, false) === null);
  check('a constant is not eligible', /constant/.test(r('O', null, true)));
  check('usage H is not eligible, named as hidden', /hidden \(H\)/.test(r('H', null, false)));
  check('usage M is not eligible, named as message', /message \(M\)/.test(r('M', null, false)));
  check('usage P is not eligible, named as program-to-system', /program-to-system \(P\)/.test(r('P', null, false)));
  check('lower-case usage is normalised', /hidden/.test(r('h', null, false)));
  check('decimal positions 2 make a field numeric', /numeric/.test(r('B', 2, false)));
  check('decimal positions 0 still make a field numeric (0 is "specified")', /numeric/.test(r('B', 0, false)));
  check('decimal positions "0" (string) also count', /numeric/.test(r('B', '0', false)));
  check('null / undefined / blank decimal positions do not', r('B', null, false) === null && r('B', undefined, false) === null && r('B', '', false) === null && r('B', '  ', false) === null);
  check('a non-numeric decimals value does not count as specified', r('B', 'x', false) === null);
  check('a numeric DATA TYPE with no decimals is NOT numeric for CHRID (IBM defines it by positions 36-37)', r('B', null, false) === null);
  check('constant is reported before usage/decimals', /constant/.test(r('H', 2, true)));
}

console.log('\nA2. chridFieldAddReason - adding CHRID');
{
  const r = DspfWriter.chridFieldAddReason;
  check('plain eligible field, no DUP: allowed', r('CHRID', [kwd('DSPATR', 'HI')], 'B', null, false) === null);
  check('ineligible usage: blocked', !!r('CHRID', [], 'H', null, false));
  check('numeric field: blocked', !!r('CHRID', [], 'B', 5, false));
  check('constant: blocked', !!r('CHRID', [], undefined, null, true));
  const dup = r('CHRID', [kwd('DUP')], 'B', null, false);
  check('with DUP already on the field: blocked, naming both', /CHRID/.test(dup) && /DUP/.test(dup));
  check('DUP with a response indicator is still DUP', !!r('CHRID', [kwd('DUP', '30')], 'B', null, false));
  check('eligibility is reported before the DUP clash', /hidden/.test(r('CHRID', [kwd('DUP')], 'H', null, false)));
  check('keyword name is case-insensitive', !!r('chrid', [kwd('DUP')], 'B', null, false));
}

console.log('\nA3. chridFieldAddReason - adding DUP (reverse direction)');
{
  const r = DspfWriter.chridFieldAddReason;
  const reason = r('DUP', [kwd('CHRID')], 'B', null, false);
  check('DUP on a field that already has CHRID is blocked, naming both', /DUP/.test(reason) && /CHRID/.test(reason));
  check('DUP on a field without CHRID is allowed', r('DUP', [kwd('DSPATR', 'HI')], 'B', null, false) === null);
  check('any other keyword is never reported, even on a CHRID field', r('DSPATR', [kwd('CHRID')], 'B', null, false) === null && r('CHECK', [kwd('CHRID')], 'B', null, false) === null);
}

console.log('\nA4. chridNewConflictReason - the commitEdit diff');
{
  const r = DspfWriter.chridNewConflictReason;
  const ok = { usage: 'B', decimalPositions: null, isConstant: false };
  check('an edit that never has CHRID is never reported', r([], [kwd('DUP')], ok) === null && r([kwd('DUP')], [kwd('DUP')], { usage: 'H' }) === null);
  check('introducing CHRID on an eligible field is fine', r([], [kwd('CHRID')], ok) === null);
  check('introducing CHRID on a hidden field is blocked', /hidden/.test(r([], [kwd('CHRID')], { usage: 'H' })));
  check('introducing CHRID on a message field is blocked', /message/.test(r([], [kwd('CHRID')], { usage: 'M' })));
  check('introducing CHRID on a program-to-system field is blocked', /program-to-system/.test(r([], [kwd('CHRID')], { usage: 'P' })));
  check('introducing CHRID on a numeric field is blocked', /numeric/.test(r([], [kwd('CHRID')], { usage: 'B', decimalPositions: 2 })));
  check('introducing CHRID on a constant is blocked', /constant/.test(r([], [kwd('CHRID')], { isConstant: true })));
  check('introducing CHRID next to DUP is blocked', /DUP/.test(r([kwd('DUP')], [kwd('DUP'), kwd('CHRID')], ok)));
  check('introducing CHRID and DUP in the SAME edit is blocked', /DUP/.test(r([], [kwd('CHRID'), kwd('DUP')], ok)));
  check('adding DUP to a field that has CHRID is blocked', /CHRID/.test(r([kwd('CHRID')], [kwd('CHRID'), kwd('DUP')], ok)));
  check('an unrelated edit on a CHRID field is fine', r([kwd('CHRID')], [kwd('CHRID'), kwd('DSPATR', 'HI')], ok) === null);
  check('removing CHRID is fine', r([kwd('CHRID')], [], ok) === null);
  check('removing DUP from a field that has both is fine', r([kwd('CHRID'), kwd('DUP')], [kwd('CHRID')], ok) === null);
  check('a hand-written field that already had both stays editable', r([kwd('CHRID'), kwd('DUP')], [kwd('CHRID'), kwd('DUP'), kwd('DSPATR', 'HI')], ok) === null);
  check('a hand-written CHRID on a hidden field stays editable (already had CHRID)', r([kwd('CHRID')], [kwd('CHRID'), kwd('DSPATR', 'HI')], { usage: 'H' }) === null);
  check('a missing ctx fails open', r([], [kwd('CHRID')]) === null);
}

console.log('\nA5. chridBasicEditConflictReason - the Basic tab Apply');
{
  const r = DspfWriter.chridBasicEditConflictReason;
  const has = [kwd('CHRID')];
  const f = (usage, dec) => ({ usage, decimalPositions: dec });
  check('a field without CHRID is never affected', r([], f('B', null), { usage: 'H', decimalPositions: 2 }) === null);
  check('B -> I is allowed', r(has, f('B', null), { usage: 'I', decimalPositions: null }) === null);
  check('B -> O is allowed', r(has, f('B', null), { usage: 'O', decimalPositions: null }) === null);
  check('B -> H is blocked, naming hidden and telling the user to remove CHRID', (() => { const s = r(has, f('B', null), { usage: 'H', decimalPositions: null }); return /hidden/.test(s) && /Remove CHRID first/.test(s); })());
  check('B -> M is blocked', /message/.test(r(has, f('B', null), { usage: 'M', decimalPositions: null })));
  check('B -> P is blocked', /program-to-system/.test(r(has, f('B', null), { usage: 'P', decimalPositions: null })));
  check('blank old usage counts as O: blank -> O is no change', r(has, f(undefined, null), { usage: 'O', decimalPositions: null }) === null);
  check('an update that leaves an already-hidden field hidden is not re-reported', r(has, f('H', null), { usage: 'H', decimalPositions: null }) === null);
  check('an unrelated edit (no usage / decimals keys at all) is never blocked', r(has, f('H', 2), { length: 12 }) === null);
  check('decimals null -> 2 is blocked as numeric', (() => { const s = r(has, f('B', null), { usage: 'B', decimalPositions: 2 }); return /numeric/.test(s) && /Remove CHRID first/.test(s); })());
  check('decimals null -> 0 is blocked too', /numeric/.test(r(has, f('B', null), { usage: 'B', decimalPositions: 0 })));
  check('decimals 2 -> 3 on an already-numeric field is not re-reported', r(has, f('B', 2), { usage: 'B', decimalPositions: 3 }) === null);
  check('decimals 2 -> null is fine', r(has, f('B', 2), { usage: 'B', decimalPositions: null }) === null);
}

// ===========================================================================
// B. General keywords row helpers
// ===========================================================================
console.log('\nB1. generalFieldKeywordsHtml - the CHRID row');
{
  const row = (kws, usage, dec, isConst) => Helpers.generalFieldKeywordsHtml(kws, 'g', new Set(), 'A', usage, [], !!isConst, dec).indexOf('g-gen-chrid-on') >= 0;
  check('offered on usage O, I and B character fields', row([], 'O', null) && row([], 'I', null) && row([], 'B', null));
  check('offered on a blank usage (fail-open)', row([], '', null) && row([], undefined, undefined));
  check('offered when the caller does not pass decimalPositions at all (fail-open)', Helpers.generalFieldKeywordsHtml([], 'g', new Set(), 'A', 'B', [], false).indexOf('g-gen-chrid-on') >= 0);
  check('hidden on usage H', !row([], 'H', null));
  check('hidden on a numeric field (decimals 2)', !row([], 'B', 2));
  check('hidden on a numeric field (decimals 0)', !row([], 'B', 0));
  check('hidden on M / P (unchanged from I-35)', !row([], 'M', null) && !row([], 'P', null));
  check('hidden on a constant (unchanged from I-33)', !row([], 'O', null, true));
  check('STILL shown on a hidden field that already carries CHRID, so the user can untick it', row([kwd('CHRID')], 'H', null));
  check('STILL shown on a numeric field that already carries CHRID', row([kwd('CHRID')], 'B', 2));
  check('the sibling rows are unaffected on a hidden field (DFT/PUTRETAIN still there; IGCALTTYP is hidden by its own I-94 rule, usage B only)', (() => { const h = Helpers.generalFieldKeywordsHtml([], 'g', new Set(), 'A', 'H', [], false, null); return h.indexOf('g-gen-putretain-on') >= 0 && h.indexOf('g-gen-dft-on') >= 0 && h.indexOf('g-gen-igcalttyp-on') === -1; })());
}

// ===========================================================================
// C. Real generated webview
// ===========================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' });
function fieldLines(name, usage, keywordTexts, opts) {
  const o = opts || {};
  const lines = [buildLine({ seq: '00020', name, length: '10', dataType: o.dataType || 'A', decimals: o.decimals, usage, line: '2', col: '2' })];
  (keywordTexts || []).forEach((t, i) => lines.push(buildLine({ seq: String(21 + i).padStart(5, '0'), func: t })));
  return lines;
}

async function scenario(lines, fn) {
  const src = [rec].concat(lines).join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'CH.DSPF').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  const posted = [], alerts = [], errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
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
    // Hidden (usage H) fields have no box on the canvas - the record panel's
    // Hidden tab lists them, and clicking a row selects one.
    selectHidden: (name) => {
      const el = Array.from(doc.querySelectorAll('.field-order-row[data-source-line]')).find((r) => r.textContent.indexOf(name) >= 0);
      if (!el) return null;
      el.dispatchEvent(new Ev('click', { bubbles: true }));
      return 'field-' + el.getAttribute('data-source-line');
    },
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
const kwsOf = (model, name, kwName) => { const f = model && model.records[0].fields.find((x) => x.name === name); return f ? f.keywords.filter((k) => k.name === kwName) : []; };
function toggle(c, id, checked) {
  const el = c.doc.getElementById(id);
  el.checked = checked;
  c.reset();
  c.fire(el);
  return el;
}

async function main() {
  console.log('\nC1. General keywords checkbox: turning CHRID on');
  await scenario(fieldLines('NAME', 'B', []), async (c) => {
    const o = c.select('NAME');
    check('setup: the CHRID checkbox is offered on a plain input/output field', !!c.doc.getElementById(o + '-gen-chrid-on'));
    toggle(c, o + '-gen-chrid-on', true);
    check('CHRID is written, no alert', c.alerts.length === 0 && kwsOf(c.modelOf(), 'NAME', 'CHRID').length === 1);
  });
  await scenario(fieldLines('NAME', 'B', ['DUP']), async (c) => {
    const o = c.select('NAME');
    const el = toggle(c, o + '-gen-chrid-on', true);
    check('with DUP already on the field it is blocked with an alert naming both keywords', c.alerts.length === 1 && /CHRID/.test(c.alerts[0]) && /DUP/.test(c.alerts[0]));
    check('no edit was posted', c.lastEdit() === null);
    check('the checkbox was reverted to unchecked', el.checked === false);
  });
  await scenario(fieldLines('OUT', 'O', []), async (c) => {
    const o = c.select('OUT');
    toggle(c, o + '-gen-chrid-on', true);
    check('an output-only character field is fine', c.alerts.length === 0 && kwsOf(c.modelOf(), 'OUT', 'CHRID').length === 1);
  });

  console.log('\nC2. General keywords checkbox: rows that must not be offered / must stay untickable');
  await scenario(fieldLines('HID', 'H', []), async (c) => {
    const o = c.selectHidden('HID');
    check('setup: the hidden field was selected from the Hidden tab', !!o && !!c.doc.getElementById('p-name'));
    check('usage H: the CHRID checkbox is not offered', !c.doc.getElementById(o + '-gen-chrid-on'));
  });
  await scenario(fieldLines('NUM', 'B', [], { dataType: 'S', decimals: '2' }), async (c) => {
    const o = c.select('NUM');
    check('a numeric field (decimals 2): the CHRID checkbox is not offered', !c.doc.getElementById(o + '-gen-chrid-on'));
  });
  await scenario(fieldLines('HID', 'H', ['CHRID']), async (c) => {
    const o = c.selectHidden('HID');
    const el = c.doc.getElementById(o + '-gen-chrid-on');
    check('a hand-written CHRID on a hidden field still shows a ticked checkbox', !!el && el.checked === true);
    toggle(c, o + '-gen-chrid-on', false);
    check('unticking it works (removing is never blocked)', c.alerts.length === 0 && kwsOf(c.modelOf(), 'HID', 'CHRID').length === 0);
  });

  console.log('\nC3. DUP checkbox on a field that already has CHRID (reverse direction, commitEdit choke point)');
  await scenario(fieldLines('NAME', 'B', ['CHRID']), async (c) => {
    const o = c.select('NAME');
    const dup = c.doc.getElementById(o + '-inp-dup-on');
    check('setup: the DUP checkbox exists', !!dup);
    toggle(c, o + '-inp-dup-on', true);
    check('blocked with an alert naming both keywords', c.alerts.length === 1 && /DUP/.test(c.alerts[0]) && /CHRID/.test(c.alerts[0]));
    check('no edit was posted', c.lastEdit() === null);
    check('the panel was re-rendered back to the model (DUP unchecked)', c.doc.getElementById(o + '-inp-dup-on').checked === false);
  });
  await scenario(fieldLines('NAME', 'B', ['CHRID', 'DUP']), async (c) => {
    const o = c.select('NAME');
    check('setup: a hand-written field with both shows DUP ticked', c.doc.getElementById(o + '-inp-dup-on').checked === true);
    toggle(c, o + '-inp-dup-on', false);
    check('unticking DUP on such a field is allowed', c.alerts.length === 0 && kwsOf(c.modelOf(), 'NAME', 'DUP').length === 0 && kwsOf(c.modelOf(), 'NAME', 'CHRID').length === 1);
  });
  await scenario(fieldLines('NAME', 'B', ['CHRID', 'DUP']), async (c) => {
    const o = c.select('NAME');
    const blanks = toggle(c, o + '-inp-blanks-on', true);
    check('an unrelated keyword edit on a hand-written CHRID+DUP field is NOT blocked', c.alerts.length === 0 && kwsOf(c.modelOf(), 'NAME', 'BLANKS').length === 1);
  });

  console.log('\nC4. Raw keyword editor');
  async function addRaw(c, o, name, params) {
    c.doc.getElementById(o + '-new-kw-name').value = name;
    c.doc.getElementById(o + '-new-kw-params').value = params || '';
    c.reset();
    c.click(c.doc.querySelector('.kw-add[data-owner="' + o + '"]'));
  }
  await scenario(fieldLines('NAME', 'B', []), async (c) => {
    const o = c.select('NAME');
    await addRaw(c, o, 'CHRID', '');
    check('CHRID on an eligible field is added', c.alerts.length === 0 && kwsOf(c.modelOf(), 'NAME', 'CHRID').length === 1);
  });
  await scenario(fieldLines('NAME', 'B', ['DUP']), async (c) => {
    const o = c.select('NAME');
    await addRaw(c, o, 'CHRID', '');
    check('CHRID next to DUP is refused', c.alerts.length === 1 && /DUP/.test(c.alerts[0]) && c.lastEdit() === null);
  });
  await scenario(fieldLines('NAME', 'B', ['CHRID']), async (c) => {
    const o = c.select('NAME');
    await addRaw(c, o, 'DUP', '');
    check('DUP next to CHRID is refused', c.alerts.length === 1 && /CHRID/.test(c.alerts[0]) && c.lastEdit() === null);
  });
  await scenario(fieldLines('HID', 'H', []), async (c) => {
    const o = c.selectHidden('HID');
    await addRaw(c, o, 'CHRID', '');
    check('CHRID on a hidden field is refused even through the raw editor', c.alerts.length === 1 && /hidden/.test(c.alerts[0]) && c.lastEdit() === null);
  });
  await scenario(fieldLines('NUM', 'B', [], { dataType: 'S', decimals: '2' }), async (c) => {
    const o = c.select('NUM');
    await addRaw(c, o, 'CHRID', '');
    check('CHRID on a numeric field is refused even through the raw editor', c.alerts.length === 1 && /numeric/.test(c.alerts[0]) && c.lastEdit() === null);
  });
  await scenario(fieldLines('NAME', 'B', []), async (c) => {
    const o = c.select('NAME');
    await addRaw(c, o, 'DUP', '');
    check('DUP alone is unaffected', c.alerts.length === 0 && kwsOf(c.modelOf(), 'NAME', 'DUP').length === 1);
  });

  console.log('\nC5. Basic tab Apply on a CHRID field');
  await scenario(fieldLines('NAME', 'B', ['CHRID']), async (c) => {
    c.select('NAME');
    const usage = c.doc.getElementById('p-usage');
    check('setup: usage select shows B', usage.value === 'B');
    usage.value = 'H';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('B -> H is blocked with an alert and no edit', c.alerts.length === 1 && /hidden/.test(c.alerts[0]) && /Remove CHRID first/.test(c.alerts[0]) && c.lastEdit() === null);
    usage.value = 'O';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('B -> O is allowed', c.alerts.length === 0 && !!c.lastEdit());
  });
  await scenario(fieldLines('NAME', 'B', ['CHRID']), async (c) => {
    c.select('NAME');
    c.doc.getElementById('p-dec').value = '2';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('giving the field decimal positions is blocked as numeric', c.alerts.length === 1 && /numeric/.test(c.alerts[0]) && c.lastEdit() === null);
  });
  await scenario(fieldLines('NAME', 'B', ['CHRID']), async (c) => {
    c.select('NAME');
    c.doc.getElementById('p-length').value = '12';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('an unrelated Basic-tab edit (length) is unaffected', c.alerts.length === 0 && !!c.lastEdit());
  });
  await scenario(fieldLines('HID', 'H', ['CHRID']), async (c) => {
    c.selectHidden('HID');
    c.doc.getElementById('p-length').value = '12';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('an unrelated Basic-tab edit on an already-invalid hand-written (CHRID on H) field still goes through', c.alerts.length === 0 && !!c.lastEdit());
  });
  await scenario(fieldLines('NAME', 'B', []), async (c) => {
    c.select('NAME');
    c.doc.getElementById('p-usage').value = 'H';
    c.reset();
    c.click(c.doc.getElementById('p-apply'));
    check('a field WITHOUT CHRID can change usage to H freely', c.alerts.length === 0 && !!c.lastEdit());
  });

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

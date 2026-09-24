/**
 * i71IgcalttypMutualExclusion.test.js
 *
 * Task I-71 - follow-up from I-30. IGCALTTYP's own DDS Reference section:
 * "The following keywords are not allowed with the IGCALTTYP keyword:
 * AUTO(RAZ), BLKFOLD, CHECK(M10 M11 M10F M11F RL RZ VN VNE), CMP(EQ GE GT LE
 * LT NE NG NL), COMP(EQ GE GT LE LT NE NG NL), DUP, RANGE, VALUES." A
 * bidirectional mutual exclusion on the same field that nothing enforced.
 * (IGCALTTYP-vs-WRDWRAP is already I-58's pair from WRDWRAP's side.)
 *
 * Fix, in the shape of I-58's WRDWRAP guards / I-41's htmlConflictReason:
 *   - DspfWriter.igcalttypConflictReason(name, params, fieldKeywords): the
 *     add-time check for BOTH directions, wired to the raw keyword editor's
 *     "+ Add keyword" and the General rows' catch-all add guard;
 *   - DspfWriter.igcalttypNewConflictReason(old, new): a diff-based backstop
 *     at commitEdit that covers every other panel (Keying options' DUP and
 *     CHECK codes, the validity-check editors, ...). Conflicts already
 *     present before an edit are not re-reported; removal is never blocked.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i71IgcalttypMutualExclusion.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const IGC = k('IGCALTTYP');

// === Group A: pure unit checks - add-time check, both directions ===
console.log('\nDspfWriter.igcalttypConflictReason: add-time check, both directions');
check('function is exported', typeof DspfWriter.igcalttypConflictReason === 'function');
{
  const f = DspfWriter.igcalttypConflictReason || (() => null);

  // adding an excluded keyword to a field that already has IGCALTTYP
  [
    ['AUTO', 'RAZ', /AUTO\(RAZ\)/],
    ['BLKFOLD', '', /BLKFOLD/],
    ['CHECK', 'M10', /CHECK\(M10\)/],
    ['CHECK', 'M11', /CHECK\(M11\)/],
    ['CHECK', 'M10F', /CHECK\(M10F\)/],
    ['CHECK', 'M11F', /CHECK\(M11F\)/],
    ['CHECK', 'RL', /CHECK\(RL\)/],
    ['CHECK', 'RZ', /CHECK\(RZ\)/],
    ['CHECK', 'VN', /CHECK\(VN\)/],
    ['CHECK', 'VNE', /CHECK\(VNE\)/],
    ['CHECK', 'ME M10', /CHECK\(M10\)/],
    ['CMP', 'EQ 5', /CMP/],
    ['CMP', 'NL 0', /CMP/],
    ['COMP', 'GT 3', /COMP/],
    ['COMP', 'LE &FLD', /COMP/],
    ['DUP', '', /DUP/],
    ['RANGE', '1 10', /RANGE/],
    ['VALUES', "'A' 'B'", /VALUES/],
  ].forEach(([n, p, re]) => {
    const r = f(n, p, [IGC]) || '';
    check('reverse: adding ' + n + (p ? '(' + p + ')' : '') + ' to an IGCALTTYP field is blocked, naming it and IGCALTTYP', re.test(r) && /IGCALTTYP/.test(r));
  });
  // adding an allowed keyword / allowed parameter
  check('reverse: AUTO(RAB) is allowed', f('AUTO', 'RAB', [IGC]) === null);
  check('reverse: bare AUTO is allowed', f('AUTO', '', [IGC]) === null);
  check('reverse: CHECK(ME) is allowed', f('CHECK', 'ME', [IGC]) === null);
  check('reverse: CHECK(AB) is allowed', f('CHECK', 'AB', [IGC]) === null);
  check('reverse: CHECK(FE) is allowed', f('CHECK', 'FE', [IGC]) === null);
  check('reverse: CHECK(MF) is allowed (only the eight listed codes are excluded)', f('CHECK', 'MF', [IGC]) === null);
  check('reverse: CHECK(LC) is allowed', f('CHECK', 'LC', [IGC]) === null);
  check('reverse: tokens, not substrings (CHECK(M100) is not M10)', f('CHECK', 'M100', [IGC]) === null);
  check('reverse: TEXT / COLOR / EDTCDE are allowed', f('TEXT', "'x'", [IGC]) === null && f('COLOR', 'RED', [IGC]) === null && f('EDTCDE', '1', [IGC]) === null);
  check('reverse: WRDWRAP is left to I-58 (its own pair), not double-reported here', f('WRDWRAP', '', [IGC]) === null);
  check('reverse: lower-case name is normalised', !!f('dup', '', [IGC]));

  // adding IGCALTTYP to a field that already carries an excluded keyword
  const fwd = f('IGCALTTYP', '', [k('DUP')]) || '';
  check('forward: adding IGCALTTYP to a DUP field is blocked, naming both', /IGCALTTYP/.test(fwd) && /DUP/.test(fwd));
  check('forward: BLKFOLD', !!f('IGCALTTYP', '', [k('BLKFOLD')]));
  check('forward: RANGE', !!f('IGCALTTYP', '', [k('RANGE', '1 9')]));
  check('forward: VALUES', !!f('IGCALTTYP', '', [k('VALUES', "'A'")]));
  check('forward: CMP', !!f('IGCALTTYP', '', [k('CMP', 'EQ 1')]));
  check('forward: COMP', !!f('IGCALTTYP', '', [k('COMP', 'EQ 1')]));
  check('forward: AUTO(RAZ)', /AUTO\(RAZ\)/.test(f('IGCALTTYP', '', [k('AUTO', 'RAZ')]) || ''));
  check('forward: CHECK(M10 ME) names only the excluded code', /CHECK\(M10\)/.test(f('IGCALTTYP', '', [k('CHECK', 'ME M10')]) || '') && !/ME\b/.test((f('IGCALTTYP', '', [k('CHECK', 'ME M10')]) || '').replace('CHECK(M10)', '')));
  check('forward: names every offender', /DUP/.test(f('IGCALTTYP', '', [k('DUP'), k('BLKFOLD')]) || '') && /BLKFOLD/.test(f('IGCALTTYP', '', [k('DUP'), k('BLKFOLD')]) || ''));
  check('forward: AUTO(RAB), CHECK(ME), TEXT do not block', f('IGCALTTYP', '', [k('AUTO', 'RAB'), k('CHECK', 'ME'), k('TEXT', "'x'")]) === null);
  check('forward: an empty / null field is fine', f('IGCALTTYP', '', []) === null && f('IGCALTTYP', '', null) === null);

  // no IGCALTTYP involved
  check('no IGCALTTYP on the field -> an excluded keyword is fine', f('DUP', '', [k('TEXT', "'x'")]) === null && f('CHECK', 'M10', []) === null && f('RANGE', '1 2', null) === null);
  check('the two directions give different messages', (f('DUP', '', [IGC]) || '') !== (f('IGCALTTYP', '', [k('DUP')]) || ''));
}

// === Group A2: pure unit checks - diff-based backstop ===
console.log('\nDspfWriter.igcalttypNewConflictReason: diff-based backstop unit checks');
check('function is exported', typeof DspfWriter.igcalttypNewConflictReason === 'function');
{
  const f = DspfWriter.igcalttypNewConflictReason || (() => null);
  const DUP = k('DUP');
  const TXT = k('TEXT', "'x'");

  check('adding DUP to an IGCALTTYP field is blocked', /DUP/.test(f([IGC], [IGC, DUP]) || ''));
  check('adding CHECK(M10) is blocked', /CHECK\(M10\)/.test(f([IGC], [IGC, k('CHECK', 'M10')]) || ''));
  check('editing an existing CHECK(ME) to CHECK(ME VN) is blocked', /CHECK\(VN\)/.test(f([IGC, k('CHECK', 'ME')], [IGC, k('CHECK', 'ME VN')]) || ''));
  check('editing CHECK(ME) to CHECK(AB) is allowed', f([IGC, k('CHECK', 'ME')], [IGC, k('CHECK', 'AB')]) === null);
  check('adding RANGE / VALUES / CMP / COMP / BLKFOLD / AUTO(RAZ) is blocked', ['RANGE', 'VALUES', 'CMP', 'COMP', 'BLKFOLD'].every((n) => !!f([IGC], [IGC, k(n, n === 'BLKFOLD' ? '' : 'EQ 1')])) && !!f([IGC], [IGC, k('AUTO', 'RAZ')]));
  check('a second, additional DUP instance IS new', /DUP/.test(f([IGC, DUP], [IGC, DUP, k('DUP')]) || ''));
  check('adding an allowed keyword is allowed', f([IGC], [IGC, TXT]) === null && f([IGC], [IGC, k('AUTO', 'RAB')]) === null);
  // forward direction: IGCALTTYP introduced by the edit
  check('turning IGCALTTYP on over a DUP field is blocked', /IGCALTTYP/.test(f([DUP], [DUP, IGC]) || '') && /DUP/.test(f([DUP], [DUP, IGC]) || ''));
  check('turning IGCALTTYP on over a clean field is allowed', f([TXT], [TXT, IGC]) === null && f([], [IGC]) === null);
  check('adding IGCALTTYP and DUP in the same edit is blocked', !!f([TXT], [TXT, IGC, DUP]));
  // diff-based: already-invalid hand-written field
  check('a pre-existing conflict is NOT re-reported on an unrelated edit', f([IGC, DUP], [IGC, DUP, TXT]) === null);
  check('  ...nor when nothing changes', f([IGC, DUP], [IGC, DUP]) === null);
  check('  ...but a NEW conflict on that field still is', /CHECK\(M10\)/.test(f([IGC, DUP], [IGC, DUP, k('CHECK', 'M10')]) || ''));
  check('removing the excluded keyword is fine', f([IGC, DUP], [IGC]) === null);
  check('removing IGCALTTYP from an invalid field is fine', f([IGC, DUP], [DUP]) === null);
  check('no IGCALTTYP afterwards -> never blocks', f([IGC], [DUP]) === null && f([IGC, DUP], [DUP]) === null);
  check('no IGCALTTYP before or after -> never blocks', f([TXT], [TXT, DUP]) === null);
  check('null/empty inputs are safe', f(null, null) === null && f(undefined, []) === null && f(null, [IGC]) === null);
}

// === DOM scenarios ===
function makeDom(src) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'I71.DSPF');
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
  return { dom: dom, posted: posted, errors: errors };
}

function reparsedField(text, name) {
  const parsed = DspfParser.parseDspf(text);
  const out = [];
  parsed.records.forEach((r) => r.fields.forEach((f) => out.push(f)));
  return out.find((f) => f.name === name);
}

const kwLine = (text) => '     A' + ' '.repeat(38) + text;
// F1: IGCALTTYP.  F2: plain.  F3: hand-written and ALREADY invalid (IGCALTTYP +
// DUP).  F4: DUP only.  F5: IGCALTTYP (CHECK-panel scenario).
const SRC = [
  '     A          R RECORD1',
  '     A            F1            20A  B  3  5IGCALTTYP',
  '     A            F2            20A  B  5  5',
  '     A            F3            20A  B  7  5IGCALTTYP',
  kwLine('DUP'),
  '     A            F4            20A  B  9  5DUP',
  '     A            F5            20A  B 11  5IGCALTTYP',
].join('\n') + '\n';

let scenariosRemaining = 4;
function finishOne() {
  scenariosRemaining--;
  if (scenariosRemaining === 0) {
    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exit(failureCount() === 0 ? 0 : 1);
  }
}

function harness(dom, posted) {
  const doc = dom.window.document;
  const { Event } = dom.window;
  return {
    doc: doc,
    Event: Event,
    selectField(idx) {
      const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
      boxes[idx].click();
      return 'field-' + boxes[idx].getAttribute('data-source-line');
    },
    attempt(action) {
      posted.length = 0;
      let alertMessage = null;
      const original = dom.window.alert;
      dom.window.alert = (m) => { alertMessage = m; };
      try { action(); } catch (e) { alertMessage = alertMessage || null; harnessErrors.push(e); }
      dom.window.alert = original;
      return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
    },
    toggle(el) { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); },
    addRaw(owner, name, params) {
      doc.getElementById(owner + '-new-kw-name').value = name;
      doc.getElementById(owner + '-new-kw-params').value = params || '';
      return this.attempt(() => doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new Event('click', { bubbles: true })));
    },
  };
}
const harnessErrors = [];

// === Group B: raw keyword editor, reverse direction (F1 has IGCALTTYP) ===
runRawScenario();
function runRawScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    console.log('\nRaw editor on an IGCALTTYP field (F1): every excluded keyword is blocked');
    const owner = h.selectField(0);
    [['DUP', ''], ['BLKFOLD', ''], ['RANGE', '1 10'], ['VALUES', "'A' 'B'"], ['CMP', 'EQ 5'], ['COMP', 'GT 3'], ['AUTO', 'RAZ'],
      ['CHECK', 'M10'], ['CHECK', 'M11'], ['CHECK', 'M10F'], ['CHECK', 'M11F'], ['CHECK', 'RL'], ['CHECK', 'RZ'], ['CHECK', 'VN'], ['CHECK', 'VNE']].forEach(([n, p]) => {
      const r = h.addRaw(owner, n, p);
      check(n + (p ? '(' + p + ')' : '') + ' blocked with an alert naming IGCALTTYP', !!r.alertMessage && r.alertMessage.indexOf('IGCALTTYP') !== -1);
      check('  ...and no applyEdit posted', !r.applyEdit);
    });
    console.log('\nRaw editor on an IGCALTTYP field (F1): allowed keywords still add');
    const ok = h.addRaw(owner, 'CHECK', 'AB');
    check('CHECK(AB) adds normally', !ok.alertMessage && !!ok.applyEdit);
    const f1 = ok.applyEdit && reparsedField(ok.applyEdit.text, 'F1');
    check('  ...and F1 keeps IGCALTTYP alongside it', !!f1 && f1.keywords.some((x) => x.name === 'IGCALTTYP') && f1.keywords.some((x) => x.name === 'CHECK'));
    const owner1b = h.selectField(0);
    const ok2 = h.addRaw(owner1b, 'AUTO', 'RAB');
    check('AUTO(RAB) adds normally (only RAZ is excluded)', !ok2.alertMessage && !!ok2.applyEdit);

    console.log('\nRaw editor on a field WITHOUT IGCALTTYP (F2): no regression');
    const owner2 = h.selectField(1);
    const ok3 = h.addRaw(owner2, 'DUP', '');
    check('DUP adds normally', !ok3.alertMessage && !!ok3.applyEdit);

    console.log('\nRaw editor, forward direction: adding IGCALTTYP to a DUP field (F4)');
    const owner4 = h.selectField(3);
    const r = h.addRaw(owner4, 'IGCALTTYP', '');
    check('blocked with an alert naming IGCALTTYP and DUP, no applyEdit', !!r.alertMessage && /IGCALTTYP/.test(r.alertMessage) && /DUP/.test(r.alertMessage) && !r.applyEdit);

    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

// === Group C: General rows (forward direction + BLKFOLD) ===
runGeneralScenario();
function runGeneralScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    const doc = h.doc;
    console.log('\nGeneral rows: IGCALTTYP checkbox on a DUP field (F4)');
    let owner = h.selectField(3);
    let box = doc.getElementById(owner + '-gen-igcalttyp-on');
    check('setup: the IGCALTTYP row is offered', !!box);
    let r = h.attempt(() => h.toggle(box));
    check('ticking it is blocked with an alert naming IGCALTTYP and DUP', !!r.alertMessage && /IGCALTTYP/.test(r.alertMessage) && /DUP/.test(r.alertMessage));
    check('  ...no applyEdit posted', !r.applyEdit);

    console.log('\nGeneral rows: BLKFOLD checkbox on an IGCALTTYP field (F1)');
    owner = h.selectField(0);
    box = doc.getElementById(owner + '-gen-blkfold-on');
    check('setup: the BLKFOLD row is offered', !!box);
    r = h.attempt(() => h.toggle(box));
    check('ticking it is blocked with an alert naming BLKFOLD and IGCALTTYP', !!r.alertMessage && /BLKFOLD/.test(r.alertMessage) && /IGCALTTYP/.test(r.alertMessage));
    check('  ...no applyEdit posted', !r.applyEdit);

    console.log('\nGeneral rows: no regression on a plain field (F2)');
    owner = h.selectField(1);
    box = doc.getElementById(owner + '-gen-igcalttyp-on');
    r = h.attempt(() => h.toggle(box));
    check('IGCALTTYP ticks normally', !r.alertMessage && !!r.applyEdit);
    const f2 = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('  ...and is written', !!f2 && f2.keywords.some((x) => x.name === 'IGCALTTYP'));

    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

// === Group D: the other panels, via commitEdit's backstop ===
runPanelScenario();
function runPanelScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    const doc = h.doc;

    console.log('\nDUP checkbox (Keying options) on an IGCALTTYP field (F1)');
    let owner = h.selectField(0);
    let r = h.attempt(() => h.toggle(doc.getElementById(owner + '-inp-dup-on')));
    check('blocked with an alert naming DUP and IGCALTTYP', !!r.alertMessage && /DUP/.test(r.alertMessage) && /IGCALTTYP/.test(r.alertMessage));
    check('  ...no applyEdit posted', !r.applyEdit);

    console.log('\nCHECK codes via the Keying options panel on an IGCALTTYP field (F5)');
    owner = h.selectField(4);
    r = h.attempt(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-keying-check-rep"]').dispatchEvent(new h.Event('click', { bubbles: true })));
    check('adding a fresh CHECK(ME) instance is NOT blocked', !r.alertMessage && !!r.applyEdit);
    // An alphanumeric field's panel offers ME ER MF FE RB RZ RL LC; RL and RZ
    // are two of IGCALTTYP's eight excluded codes (M10/M11/VN/... are only
    // offered on numeric fields, which IGCALTTYP does not apply to).
    ['RL', 'RZ'].forEach((code) => {
      owner = h.selectField(4);
      const box = Array.from(doc.querySelectorAll('.' + owner + '-keying-check-rep-inst0-code')).find((e) => e.getAttribute('data-code') === code);
      check('setup: ' + code + ' checkbox present on the CHECK instance', !!box);
      if (box) {
        r = h.attempt(() => h.toggle(box));
        check('ticking ' + code + ' blocked with an alert naming CHECK(' + code + ') and IGCALTTYP', !!r.alertMessage && new RegExp('CHECK\\(' + code + '\\)').test(r.alertMessage) && /IGCALTTYP/.test(r.alertMessage));
        check('  ...no applyEdit posted', !r.applyEdit);
      }
    });
    owner = h.selectField(4);
    const meBox = Array.from(doc.querySelectorAll('.' + owner + '-keying-check-rep-inst0-code')).find((e) => e.getAttribute('data-code') === 'FE');
    if (meBox) {
      r = h.attempt(() => h.toggle(meBox));
      check('ticking FE (not excluded) still commits', !r.alertMessage && !!r.applyEdit);
    }

    console.log('\nNo IGCALTTYP on the field (F2): the same panels still work (no regression)');
    owner = h.selectField(1);
    r = h.attempt(() => h.toggle(doc.getElementById(owner + '-inp-dup-on')));
    check('DUP checkbox works on F2', !r.alertMessage && !!r.applyEdit);

    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

// === Group E: a hand-written field that is ALREADY invalid (IGCALTTYP + DUP) ===
runPreexistingScenario();
function runPreexistingScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    console.log('\nPre-existing IGCALTTYP + DUP field (F3): unrelated edits are not blocked');
    const owner = h.selectField(2);
    let r = h.addRaw(owner, 'CHECK', 'AB');
    check('CHECK(AB) adds without an alert', !r.alertMessage && !!r.applyEdit);
    const owner3 = h.selectField(2);
    r = h.addRaw(owner3, 'CHECK', 'M10');
    check('...but a NEW conflict (CHECK(M10)) is still blocked', !!r.alertMessage && /CHECK\(M10\)/.test(r.alertMessage) && !r.applyEdit);

    console.log('\nPre-existing conflict: fixing it is always allowed');
    const owner3b = h.selectField(2);
    const chips = Array.from(h.doc.querySelectorAll('.kw-remove[data-owner="' + owner3b + '"]'));
    const dupChip = chips.find((b) => /DUP/.test((b.parentElement && b.parentElement.textContent) || ''));
    check('setup: the DUP chip is present', !!dupChip);
    if (dupChip) {
      r = h.attempt(() => dupChip.dispatchEvent(new h.Event('click', { bubbles: true })));
      check('removing DUP (fixing it) is allowed', !r.alertMessage && !!r.applyEdit);
    }
    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

/**
 * i91MsgidExclusionGuard.test.js
 *
 * Task I-91 - follow-up from I-73. MSGID's DDS Reference entry: "The
 * following keywords cannot be specified on a field with the MSGID keyword:
 * DFT, DFTVAL, FLTFIXDEC, FLTPCN, MSGCON." A bidirectional mutual exclusion
 * on the same field that nothing enforced (ticking DFT on a field that
 * already had MSGID wrote both with no alert).
 *
 * Fix, in the shape of I-71's IGCALTTYP guards / I-41's htmlConflictReason:
 *   - DspfWriter.msgidExclusionConflictReason(name, fieldKeywords): the
 *     add-time check for BOTH directions, wired to the raw keyword editor's
 *     "+ Add keyword" and the General rows' catch-all add guard;
 *   - DspfWriter.msgidExclusionNewConflictReason(old, new): a diff-based
 *     backstop at commitEdit that covers every other panel (the MSGID panel
 *     itself, ...). Conflicts already present before an edit are not
 *     re-reported; removal is never blocked.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i91MsgidExclusionGuard.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const MSGID = k('MSGID', 'CPD1234 QGPL/USRMSG');

// === Group A: pure unit checks - add-time check, both directions ===
console.log('\nDspfWriter.msgidExclusionConflictReason: add-time check, both directions');
check('function is exported', typeof DspfWriter.msgidExclusionConflictReason === 'function');
{
  const f = DspfWriter.msgidExclusionConflictReason || (() => null);
  ['DFT', 'DFTVAL', 'FLTFIXDEC', 'FLTPCN', 'MSGCON'].forEach((n) => {
    const r = f(n, [MSGID]) || '';
    check('reverse: adding ' + n + ' to a MSGID field is blocked, naming it and MSGID', r.indexOf(n) !== -1 && /MSGID/.test(r));
    const r2 = f('MSGID', [k(n, n === 'DFT' ? "'X'" : '')]) || '';
    check('forward: adding MSGID to a ' + n + ' field is blocked, naming both', r2.indexOf(n) !== -1 && /MSGID/.test(r2));
  });
  check('reverse: lower-case name is normalised', !!f('dft', [MSGID]));
  check('reverse: a field with several MSGID keywords is still excluded', !!f('DFTVAL', [MSGID, k('MSGID', '&A &B')]));
  check('forward: names every offender', /DFT\b/.test(f('MSGID', [k('DFT', "'X'"), k('FLTFIXDEC')]) || '') && /FLTFIXDEC/.test(f('MSGID', [k('DFT', "'X'"), k('FLTFIXDEC')]) || ''));
  check('the two directions give different messages', (f('DFT', [MSGID]) || '') !== (f('MSGID', [k('DFT', "'X'")]) || ''));

  // unrelated keywords / no MSGID involved
  check('reverse: unrelated keywords are allowed on a MSGID field', ['TEXT', 'COLOR', 'DSPATR', 'EDTCDE', 'ALIAS', 'CHECK', 'IGCALTTYP', 'DUP', 'CHGINPDFT'].every((n) => f(n, [MSGID]) === null));
  check('forward: unrelated keywords do not block MSGID', f('MSGID', [k('TEXT', "'x'"), k('DSPATR', 'HI'), k('CHKMSGID', 'X Y')]) === null);
  check('forward: an empty / null field is fine', f('MSGID', []) === null && f('MSGID', null) === null && f('MSGID', undefined) === null);
  check('no MSGID on the field -> DFT / DFTVAL / FLTFIXDEC / FLTPCN / MSGCON are fine', ['DFT', 'DFTVAL', 'FLTFIXDEC', 'FLTPCN', 'MSGCON'].every((n) => f(n, [k('TEXT', "'x'")]) === null && f(n, []) === null && f(n, null) === null));
  check('ERRMSGID / SFLMSGID / CHKMSGID are not MSGID (exact name match)', f('DFT', [k('ERRMSGID', 'A B')]) === null && f('DFT', [k('SFLMSGID', 'A B')]) === null && f('DFT', [k('CHKMSGID', 'A B')]) === null);
  check('adding MSGID next to ERRMSGID / SFLMSGID / CHKMSGID is fine', f('MSGID', [k('CHKMSGID', 'A B')]) === null);
}

// === Group A2: pure unit checks - diff-based backstop ===
console.log('\nDspfWriter.msgidExclusionNewConflictReason: diff-based backstop unit checks');
check('function is exported', typeof DspfWriter.msgidExclusionNewConflictReason === 'function');
{
  const f = DspfWriter.msgidExclusionNewConflictReason || (() => null);
  const DFT = k('DFT', "'X'");
  const TXT = k('TEXT', "'x'");

  check('adding DFT to a MSGID field is blocked', /DFT/.test(f([MSGID], [MSGID, DFT]) || ''));
  ['DFTVAL', 'FLTFIXDEC', 'FLTPCN', 'MSGCON'].forEach((n) => check('adding ' + n + ' to a MSGID field is blocked', new RegExp(n).test(f([MSGID], [MSGID, k(n)]) || '')));
  check('adding an allowed keyword is allowed', f([MSGID], [MSGID, TXT]) === null);
  check('a second DFT (one already there) IS new', /DFT/.test(f([MSGID, DFT], [MSGID, DFT, k('DFT', "'Y'")]) || ''));
  // forward direction: MSGID introduced by the edit
  check('adding MSGID to a DFT field is blocked, naming both', /MSGID/.test(f([DFT], [DFT, MSGID]) || '') && /DFT/.test(f([DFT], [DFT, MSGID]) || ''));
  check('adding MSGID to a clean field is allowed', f([TXT], [TXT, MSGID]) === null && f([], [MSGID]) === null);
  check('adding MSGID and DFT in the same edit is blocked', !!f([TXT], [TXT, MSGID, DFT]));
  check('editing the MSGID keyword in place (same count) is allowed', f([MSGID], [k('MSGID', 'USR &X QGPL/&Y')]) === null);
  check('adding a second MSGID to a clean field is allowed', f([MSGID], [MSGID, k('MSGID', '&A &B')]) === null);
  // diff-based: already-invalid hand-written field
  check('a pre-existing conflict is NOT re-reported on an unrelated edit', f([MSGID, DFT], [MSGID, DFT, TXT]) === null);
  check('  ...nor when nothing changes', f([MSGID, DFT], [MSGID, DFT]) === null);
  check('  ...nor when the MSGID is edited in place', f([MSGID, DFT], [k('MSGID', 'USR &X QGPL/&Y'), DFT]) === null);
  check('  ...but a NEW conflict on that field still is', /FLTPCN/.test(f([MSGID, DFT], [MSGID, DFT, k('FLTPCN', '*SINGLE')]) || ''));
  check('removing the excluded keyword is fine', f([MSGID, DFT], [MSGID]) === null);
  check('removing MSGID from an invalid field is fine', f([MSGID, DFT], [DFT]) === null);
  check('no MSGID afterwards -> never blocks', f([MSGID], [DFT]) === null && f([MSGID, DFT], [DFT]) === null);
  check('no MSGID before or after -> never blocks', f([TXT], [TXT, DFT]) === null);
  check('null/empty inputs are safe', f(null, null) === null && f(undefined, []) === null && f(null, [MSGID]) === null);
}

// === DOM scenarios ===
function makeDom(src) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'I91.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
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
// The webview applies an edit to its local model at once (no host round-trip
// in jsdom), so each scenario that COMMITS uses its own field.
// F1: MSGID (output/input).  F2: plain (clean).  F3: DFT.  F4: DFTVAL (usage O).
// F5: hand-written and ALREADY invalid (MSGID + DFT).  F6: plain (panel add).
const SRC = [
  '     A          R RECORD1',
  '     A            F1            20A  B  3  5',
  kwLine('MSGID(CPD1234 QGPL/USRMSG)'),
  '     A            F2            20A  B  5  5',
  '     A            F3            20A  B  7  5',
  kwLine("DFT('X')"),
  '     A            F4            20A  O  9  5',
  kwLine("DFTVAL('N/A')"),
  '     A            F5            20A  B 11  5',
  kwLine('MSGID(CPD1234 QGPL/USRMSG)'),
  kwLine("DFT('X')"),
  '     A            F6            20A  B 13  5',
].join('\n') + '\n';

const harnessErrors = [];
let scenariosRemaining = 4;
function finishOne() {
  scenariosRemaining--;
  if (scenariosRemaining === 0) {
    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
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
      try { action(); } catch (e) { harnessErrors.push(e); }
      dom.window.alert = original;
      return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
    },
    toggle(el) { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); },
    // fill the MSGID panel's staging row (message identifier &field + message
    // file) and press "+ Add message ID"
    addMsgidInstance(owner) {
      doc.querySelector('.' + owner + '-msgid-new-fieldname').value = 'MSGNO';
      doc.querySelector('.' + owner + '-msgid-new-msgfile').value = 'USRMSG';
      return this.attempt(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-msgid"]').dispatchEvent(new Event('click', { bubbles: true })));
    },
    addRaw(owner, name, params) {
      doc.getElementById(owner + '-new-kw-name').value = name;
      doc.getElementById(owner + '-new-kw-params').value = params || '';
      return this.attempt(() => doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new Event('click', { bubbles: true })));
    },
  };
}

// === Group B: raw keyword editor ===
runRawScenario();
function runRawScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    console.log('\nRaw editor on a MSGID field (F1): every excluded keyword is blocked');
    const owner = h.selectField(0);
    [['DFT', "'X'"], ['DFTVAL', "'X'"], ['FLTFIXDEC', ''], ['FLTPCN', '*SINGLE'], ['MSGCON', '1 CPD1234 QGPL/USRMSG']].forEach(([n, p]) => {
      const r = h.addRaw(owner, n, p);
      check(n + ' blocked with an alert naming ' + n + ' and MSGID', !!r.alertMessage && r.alertMessage.indexOf(n) !== -1 && /MSGID/.test(r.alertMessage));
      check('  ...and no applyEdit posted', !r.applyEdit);
    });
    console.log('\nRaw editor on a MSGID field (F1): allowed keywords still add');
    const ok = h.addRaw(owner, 'DSPATR', 'HI');
    check('DSPATR(HI) adds normally', !ok.alertMessage && !!ok.applyEdit);
    const f1 = ok.applyEdit && reparsedField(ok.applyEdit.text, 'F1');
    check('  ...and F1 keeps MSGID alongside it', !!f1 && f1.keywords.some((x) => x.name === 'MSGID') && f1.keywords.some((x) => x.name === 'DSPATR'));

    console.log('\nRaw editor, forward direction: adding MSGID to fields carrying an excluded keyword');
    let owner3 = h.selectField(2);
    let r = h.addRaw(owner3, 'MSGID', 'CPD1234 QGPL/USRMSG');
    check('F3 (DFT): blocked with an alert naming MSGID and DFT, no applyEdit', !!r.alertMessage && /MSGID/.test(r.alertMessage) && /DFT/.test(r.alertMessage) && !r.applyEdit);
    const owner4 = h.selectField(3);
    r = h.addRaw(owner4, 'MSGID', 'CPD1234 QGPL/USRMSG');
    check('F4 (DFTVAL): blocked with an alert naming MSGID and DFTVAL, no applyEdit', !!r.alertMessage && /MSGID/.test(r.alertMessage) && /DFTVAL/.test(r.alertMessage) && !r.applyEdit);

    console.log('\nRaw editor on a clean field (F2): no regression');
    const owner2 = h.selectField(1);
    r = h.addRaw(owner2, 'MSGID', 'CPD1234 QGPL/USRMSG');
    check('MSGID adds normally', !r.alertMessage && !!r.applyEdit);
    const f2 = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('  ...and is written', !!f2 && f2.keywords.some((x) => x.name === 'MSGID'));

    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

// === Group C: General rows ===
runGeneralScenario();
function runGeneralScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    const doc = h.doc;
    console.log('\nGeneral rows on a MSGID field (F1): DFT / DFTVAL checkboxes');
    let owner = h.selectField(0);
    ['dft', 'dftval'].forEach((key) => {
      const box = doc.getElementById(owner + '-gen-' + key + '-on');
      check('setup: the ' + key.toUpperCase() + ' row is offered', !!box);
      if (box) {
        doc.getElementById(owner + '-gen-' + key + '-params').value = "'X'";
        const r = h.attempt(() => h.toggle(box));
        check('ticking ' + key.toUpperCase() + ' is blocked with an alert naming it and MSGID', !!r.alertMessage && r.alertMessage.indexOf(key.toUpperCase()) !== -1 && /MSGID/.test(r.alertMessage));
        check('  ...no applyEdit posted', !r.applyEdit);
      }
    });

    console.log('\nGeneral rows on a clean field (F2): no regression');
    owner = h.selectField(1);
    const box = doc.getElementById(owner + '-gen-dft-on');
    doc.getElementById(owner + '-gen-dft-params').value = "'X'";
    const r = h.attempt(() => h.toggle(box));
    check('DFT ticks normally', !r.alertMessage && !!r.applyEdit);
    const f2 = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('  ...and is written', !!f2 && f2.keywords.some((x) => x.name === 'DFT'));

    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

// === Group D: the MSGID panel itself, via commitEdit's backstop ===
runPanelScenario();
function runPanelScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    const doc = h.doc;

    console.log('\nMSGID panel on a DFT field (F3): adding a MSGID instance');
    let owner = h.selectField(2);
    let r = h.addMsgidInstance(owner);
    check('blocked with an alert naming MSGID and DFT', !!r.alertMessage && /MSGID/.test(r.alertMessage) && /DFT/.test(r.alertMessage));
    check('  ...no applyEdit posted', !r.applyEdit);

    console.log('\nMSGID panel on a DFTVAL field (F4): adding a MSGID instance');
    owner = h.selectField(3);
    r = h.addMsgidInstance(owner);
    check('blocked with an alert naming MSGID and DFTVAL', !!r.alertMessage && /MSGID/.test(r.alertMessage) && /DFTVAL/.test(r.alertMessage));
    check('  ...no applyEdit posted', !r.applyEdit);

    console.log('\nMSGID panel on a clean field (F6): no regression');
    owner = h.selectField(5);
    r = h.addMsgidInstance(owner);
    check('adding a MSGID instance commits with no alert', !r.alertMessage && !!r.applyEdit);
    const f6 = r.applyEdit && reparsedField(r.applyEdit.text, 'F6');
    check('  ...and MSGID is written', !!f6 && f6.keywords.some((x) => x.name === 'MSGID'));

    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

// === Group E: a hand-written field that is ALREADY invalid (MSGID + DFT) ===
runPreexistingScenario();
function runPreexistingScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const h = harness(dom, posted);
    console.log('\nPre-existing MSGID + DFT field (F5): unrelated edits are not blocked');
    const owner = h.selectField(4);
    let r = h.addRaw(owner, 'DSPATR', 'HI');
    check('DSPATR(HI) adds without an alert', !r.alertMessage && !!r.applyEdit);
    const owner5 = h.selectField(4);
    r = h.addRaw(owner5, 'DFTVAL', "'X'");
    check('...but a NEW conflict (DFTVAL) is still blocked', !!r.alertMessage && /DFTVAL/.test(r.alertMessage) && !r.applyEdit);

    console.log('\nPre-existing conflict: fixing it is always allowed');
    const owner5b = h.selectField(4);
    const chips = Array.from(h.doc.querySelectorAll('.kw-remove[data-owner="' + owner5b + '"]'));
    const dftChip = chips.find((b) => /DFT/.test((b.parentElement && b.parentElement.textContent) || ''));
    check('setup: the DFT chip is present', !!dftChip);
    if (dftChip) {
      r = h.attempt(() => dftChip.dispatchEvent(new h.Event('click', { bubbles: true })));
      check('removing DFT (fixing it) is allowed', !r.alertMessage && !!r.applyEdit);
    }
    check('no uncaught errors', errors.length === 0 && harnessErrors.length === 0);
    finishOne();
  }, 500);
}

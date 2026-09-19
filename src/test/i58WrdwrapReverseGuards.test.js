/**
 * i58WrdwrapReverseGuards.test.js
 *
 * Task I-58 - the REVERSE direction of I-42's WRDWRAP mutual-exclusion
 * rule. I-42 blocks turning WRDWRAP on while a conflicting keyword is
 * already on the field; nothing blocked adding one of WRDWRAP's own
 * conflicting keywords to a field that ALREADY carries WRDWRAP. Per the
 * DDS Reference's own WRDWRAP section (re-verified against
 * DDS_Keyword_V7r6.txt), WRDWRAP cannot be specified with AUTO(RAZ, RAB),
 * CHECK(MF, M10F, M11F, RB, RZ, RL, RLTB), CHGINPDFT(MF), DSPATR(OID, SP),
 * DUP, FLTFIXDEC, IGCALTTYP - and CHECK(RB/RZ/M10F/M11F/MF) and
 * CHGINPDFT(MF) each independently say the same from their own side.
 *
 * Fix: DspfWriter.wrdwrapReverseConflictReason (raw keyword editor's
 * addGuardFn) and DspfWriter.wrdwrapNewConflictReason (a diff-based
 * backstop in commitEdit, so EVERY field-level panel - CHECK codes,
 * CHGINPDFT, DUP, DSPATR, IGCALTTYP, FLTFIXDEC - is covered by one
 * choke point rather than one hand-rolled guard per panel).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i58WrdwrapReverseGuards.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfParser = require('../../dist/dspfParser.js');
const DspfWriter = require('../../dist/dspfWriter.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// === Group A: pure unit checks ===
console.log('\nDspfWriter.wrdwrapReverseConflictReason: direct unit checks');
{
  const f = DspfWriter.wrdwrapReverseConflictReason;
  const ww = [{ name: 'WRDWRAP', parameters: '' }];
  check('no WRDWRAP on the field -> never blocks', f('DUP', '', [{ name: 'DSPATR', parameters: 'HI' }]) === null);
  check('DUP blocked on a WRDWRAP field', /DUP/.test(f('DUP', '', ww)));
  check('FLTFIXDEC blocked', /FLTFIXDEC/.test(f('FLTFIXDEC', '', ww)));
  check('IGCALTTYP blocked', /IGCALTTYP/.test(f('IGCALTTYP', '', ww)));
  check('AUTO(RAZ) blocked', /AUTO\(RAZ\)/.test(f('AUTO', 'RAZ', ww)));
  check('AUTO(RAB) blocked', /AUTO\(RAB\)/.test(f('AUTO', 'RAB', ww)));
  ['MF', 'M10F', 'M11F', 'RB', 'RZ', 'RL', 'RLTB'].forEach((c) => {
    check('CHECK(' + c + ') blocked', /CHECK/.test(f('CHECK', c, ww) || ''));
  });
  check('CHECK(ME RB) blocked (only RB named)', /CHECK\(RB\)/.test(f('CHECK', 'ME RB', ww)));
  check('CHGINPDFT(MF) blocked', /CHGINPDFT\(MF\)/.test(f('CHGINPDFT', 'MF', ww)));
  check('DSPATR(SP) blocked', /DSPATR\(SP\)/.test(f('DSPATR', 'SP', ww)));
  check('DSPATR(HI OID) blocked (OID named)', /DSPATR\(OID\)/.test(f('DSPATR', 'HI OID', ww)));
  check('lowercase keyword name still matches', /DUP/.test(f('dup', '', ww)));
  check('CHECK(AB) allowed', f('CHECK', 'AB', ww) === null);
  check('CHECK(ME) allowed', f('CHECK', 'ME', ww) === null);
  check('CHECK(VN) allowed (not substring-matched against M10F etc.)', f('CHECK', 'VN', ww) === null);
  check('CHGINPDFT(ME)-style non-MF code allowed', f('CHGINPDFT', 'ME', ww) === null);
  check('DSPATR(HI) allowed', f('DSPATR', 'HI', ww) === null);
  check('AUTO with an unrelated param allowed', f('AUTO', 'XX', ww) === null);
  check('unrelated keyword allowed', f('COLOR', 'RED', ww) === null);
}

console.log('\nDspfWriter.wrdwrapNewConflictReason: diff-based backstop unit checks');
{
  const f = DspfWriter.wrdwrapNewConflictReason;
  const ww = { name: 'WRDWRAP', parameters: '' };
  const dup = { name: 'DUP', parameters: '' };
  check('adding DUP to a WRDWRAP field blocked', /DUP/.test(f([ww], [ww, dup])));
  check('adding CHECK(RB) blocked', /CHECK\(RB\)/.test(f([ww], [ww, { name: 'CHECK', parameters: 'RB' }])));
  check('editing an existing CHECK(ME) to CHECK(ME RZ) blocked', /CHECK\(RZ\)/.test(f([ww, { name: 'CHECK', parameters: 'ME' }], [ww, { name: 'CHECK', parameters: 'ME RZ' }])));
  check('a pre-existing conflict is NOT re-reported on an unrelated edit', f([ww, dup], [ww, dup, { name: 'CHECK', parameters: 'ME' }]) === null);
  check('removing a conflicting keyword is fine', f([ww, dup], [ww]) === null);
  check('a second, additional DUP instance IS new', /DUP/.test(f([ww, dup], [ww, dup, { name: 'DUP', parameters: '' }])));
  check('no WRDWRAP afterwards -> never blocks', f([ww], [dup]) === null);
  check('WRDWRAP being turned ON is left to the forward guard', f([dup], [dup, ww]) === null);
  check('null/empty inputs are safe', f(null, null) === null && f(undefined, []) === null);
}

// === DOM scenarios ===
function makeDom(src) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'I58.DSPF').replace(
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

const SRC = [
  '     A          R RECORD1',
  '     A            F1            20A  B  3  5WRDWRAP',
  '     A            F2            20A  B  5  5',
  '     A            F3            20A  B  7  5WRDWRAP',
  '     A                                      DUP',
].join('\n') + '\n';

// === Group B: raw keyword editor (covers AUTO, which has no panel of its own) ===
runRawScenario();
function runRawScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    function selectField(idx) {
      const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
      boxes[idx].click();
      return 'field-' + boxes[idx].getAttribute('data-source-line');
    }
    function addRaw(owner, name, params) {
      doc.getElementById(owner + '-new-kw-name').value = name;
      doc.getElementById(owner + '-new-kw-params').value = params || '';
      posted.length = 0;
      let alertMessage = null;
      const original = dom.window.alert;
      dom.window.alert = (m) => { alertMessage = m; };
      doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new Event('click', { bubbles: true }));
      dom.window.alert = original;
      return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
    }

    console.log('\nRaw editor on a WRDWRAP field (F1)');
    const owner = selectField(0);
    [['AUTO', 'RAZ'], ['AUTO', 'RAB'], ['DUP', ''], ['FLTFIXDEC', ''], ['IGCALTTYP', ''], ['CHECK', 'RB'], ['CHECK', 'RLTB'], ['CHGINPDFT', 'MF'], ['DSPATR', 'SP'], ['DSPATR', 'OID']].forEach(([n, p]) => {
      const r = addRaw(owner, n, p);
      check(n + (p ? '(' + p + ')' : '') + ' blocked with an alert naming WRDWRAP', !!r.alertMessage && r.alertMessage.indexOf('WRDWRAP') !== -1);
      check('  ...and no applyEdit posted', !r.applyEdit);
    });
    const ok1 = addRaw(owner, 'CHECK', 'AB');
    check('CHECK(AB) still adds normally', !ok1.alertMessage && !!ok1.applyEdit);
    const f1 = ok1.applyEdit && reparsedField(ok1.applyEdit.text, 'F1');
    check('...and F1 keeps WRDWRAP alongside it', !!f1 && f1.keywords.some((k) => k.name === 'WRDWRAP') && f1.keywords.some((k) => k.name === 'CHECK'));

    console.log('\nRaw editor on a field WITHOUT WRDWRAP (F2): no regression');
    const owner2 = selectField(1);
    const ok2 = addRaw(owner2, 'DUP', '');
    check('DUP adds normally when WRDWRAP is absent', !ok2.alertMessage && !!ok2.applyEdit);

    check('no uncaught errors', errors.length === 0);
    finishOne();
  }, 500);
}

// === Group C: each field-level panel, via commitEdit's backstop ===
runPanelScenario();
function runPanelScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    function selectField(idx) {
      const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
      boxes[idx].click();
      return 'field-' + boxes[idx].getAttribute('data-source-line');
    }
    function attempt(action) {
      posted.length = 0;
      let alertMessage = null;
      const original = dom.window.alert;
      dom.window.alert = (m) => { alertMessage = m; };
      action();
      dom.window.alert = original;
      return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
    }
    function click(el) { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); }

    const owner = selectField(0);
    console.log('\nDUP checkbox on a WRDWRAP field');
    let r = attempt(() => click(doc.getElementById(owner + '-inp-dup-on')));
    check('blocked with an alert naming DUP + WRDWRAP', !!r.alertMessage && /DUP/.test(r.alertMessage) && /WRDWRAP/.test(r.alertMessage));
    check('no applyEdit posted', !r.applyEdit);

    console.log('\nIGCALTTYP checkbox on a WRDWRAP field');
    r = attempt(() => click(doc.getElementById(owner + '-gen-igcalttyp-on')));
    check('blocked with an alert naming IGCALTTYP', !!r.alertMessage && /IGCALTTYP/.test(r.alertMessage));
    check('no applyEdit posted', !r.applyEdit);

    console.log('\nCHGINPDFT(MF) on a WRDWRAP field');
    const owner1 = selectField(0);
    const chgOn = doc.getElementById(owner1 + '-inp-chginpdft-on');
    r = attempt(() => {
      chgOn.checked = true;
      chgOn.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check('turning bare CHGINPDFT on (no MF code) is NOT blocked', !r.alertMessage && !!r.applyEdit);
    const mfBox = Array.from(doc.querySelectorAll('.' + owner1 + '-inp-chginpdft-code')).find((e) => (e.value || e.getAttribute('data-code')) === 'MF');
    check('setup: CHGINPDFT code checkboxes are present', !!mfBox || doc.querySelectorAll('.' + owner1 + '-inp-chginpdft-code').length > 0);
    if (mfBox) {
      r = attempt(() => click(mfBox));
      check('ticking MF blocked with an alert naming CHGINPDFT(MF)', !!r.alertMessage && /CHGINPDFT\(MF\)/.test(r.alertMessage));
      check('no applyEdit posted', !r.applyEdit);
    }

    console.log('\nDSPATR(SP) via the colour/attributes panel on a WRDWRAP field');
    selectField(0);
    const stagingPrefix = owner + '-colorattr-new';
    const spBox = Array.from(doc.querySelectorAll('.' + stagingPrefix + '-attr')).find((e) => e.value === 'SP');
    check('setup: SP attribute checkbox present in the staging area', !!spBox);
    if (spBox) {
      spBox.checked = true;
      r = attempt(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-colorattr"]').dispatchEvent(new Event('click', { bubbles: true })));
      check('blocked with an alert naming DSPATR(SP)', !!r.alertMessage && /DSPATR\(SP\)/.test(r.alertMessage));
      check('no applyEdit posted', !r.applyEdit);
    }
    selectField(0);
    const hiBox = Array.from(doc.querySelectorAll('.' + stagingPrefix + '-attr')).find((e) => e.value === 'HI');
    if (hiBox) {
      hiBox.checked = true;
      r = attempt(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-colorattr"]').dispatchEvent(new Event('click', { bubbles: true })));
      check('DSPATR(HI) still adds normally (no regression)', !r.alertMessage && !!r.applyEdit);
    }

    console.log('\nCHECK codes via the Keying options panel on a WRDWRAP field');
    selectField(0);
    r = attempt(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-keying-check-rep"]').dispatchEvent(new Event('click', { bubbles: true })));
    check('adding a fresh CHECK(ME) instance is NOT blocked', !r.alertMessage && !!r.applyEdit);
    const rbBox = Array.from(doc.querySelectorAll('.' + owner + '-keying-check-rep-inst0-code')).find((e) => e.getAttribute('data-code') === 'RB');
    check('setup: RB checkbox present on the new instance', !!rbBox);
    if (rbBox) {
      r = attempt(() => click(rbBox));
      check('ticking RB blocked with an alert naming CHECK(RB)', !!r.alertMessage && /CHECK\(RB\)/.test(r.alertMessage));
      check('no applyEdit posted', !r.applyEdit);
    }

    console.log('\nNo WRDWRAP on the field (F2): the same panels still work (no regression)');
    const owner2 = selectField(1);
    r = attempt(() => click(doc.getElementById(owner2 + '-inp-dup-on')));
    check('DUP checkbox works on F2', !r.alertMessage && !!r.applyEdit);

    check('no uncaught errors', errors.length === 0);
    finishOne();
  }, 500);
}

// === Group D: a hand-written field that is ALREADY invalid (WRDWRAP + DUP) ===
runPreexistingScenario();
function runPreexistingScenario() {
  const { dom, posted, errors } = makeDom(SRC);
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
    boxes[2].click();
    const owner = 'field-' + boxes[2].getAttribute('data-source-line');
    console.log('\nPre-existing WRDWRAP + DUP field (F3): unrelated edits are not blocked');
    doc.getElementById(owner + '-new-kw-name').value = 'CHECK';
    doc.getElementById(owner + '-new-kw-params').value = 'AB';
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    dom.window.alert = original;
    check('CHECK(AB) adds without an alert', !alertMessage);
    check('an edit was posted', posted.some((m) => m.type === 'applyEdit'));
    check('no uncaught errors', errors.length === 0);
    finishOne();
  }, 500);
}

let scenariosRemaining = 3;
function finishOne() {
  scenariosRemaining--;
  if (scenariosRemaining === 0) {
    if (failures === 0) {
      console.log('\nALL CHECKS PASSED');
    } else {
      console.log('\n' + failures + ' CHECK(S) FAILED');
      process.exitCode = 1;
    }
  }
}

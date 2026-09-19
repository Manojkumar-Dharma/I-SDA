/**
 * i64PshbtnfldPanelWhitelist.test.js
 *
 * Task I-64 - follow-up from I-57. I-57's own PSHBTNFLD whitelist guard
 * (pshbtnfldConflictReason) was only ever wired at two places: the
 * field-level raw keyword editor's addGuardFn, and the Choice Selection
 * Type editor. Every OTHER field-level structured panel (Color &
 * attributes, Keying options, Edit code/word, validity checks, Reference,
 * the General keyword rows, CHECK, CHGINPDFT, DUP, DSPATR, etc.) could
 * still add a keyword outside PSHBTNFLD's own closed whitelist
 * (ALIAS, CHANGE, CHCAVAIL, CHCUNAVAIL, CHCCTL, INDTXT, NOCCSID,
 * PSHBTNCHC, DSPATR(PC), TEXT) to a field that already carries it.
 *
 * Fix: new DspfWriter.pshbtnfldNewConflictReason, a diff-based backstop
 * with the exact same shape as I-58's own wrdwrapNewConflictReason,
 * wired into commitEdit right alongside it - the one choke point every
 * field-level panel already commits keyword changes through. Conflicts
 * already present before the edit are not re-reported (an already-
 * invalid hand-written field can still be edited elsewhere), and turning
 * PSHBTNFLD itself on is left entirely to the existing forward-direction
 * pshbtnfldConflictReason.
 *
 * Run with: node src/test/i64PshbtnfldPanelWhitelist.test.js
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

// ===========================================================================
// Group A: pure unit checks on the diff-based backstop
// ===========================================================================

console.log('DspfWriter.pshbtnfldNewConflictReason: diff-based backstop unit checks');
{
  const f = DspfWriter.pshbtnfldNewConflictReason;
  const pb = { name: 'PSHBTNFLD', parameters: '' };
  const alias = { name: 'ALIAS', parameters: "'X'" };

  check('adding EDTCDE to a PSHBTNFLD field is blocked', /EDTCDE/.test(f([pb], [pb, { name: 'EDTCDE', parameters: '1' }])));
  check('adding CHECK to a PSHBTNFLD field is blocked', /CHECK/.test(f([pb], [pb, { name: 'CHECK', parameters: 'ME' }])));
  check('adding REFFLD to a PSHBTNFLD field is blocked', /REFFLD/.test(f([pb], [pb, { name: 'REFFLD', parameters: "'F1'" }])));
  check('adding DSPATR(HI) (not PC) is blocked', /DSPATR\(HI\)/.test(f([pb], [pb, { name: 'DSPATR', parameters: 'HI' }])));
  check('adding DSPATR(PC) is fine (on the whitelist)', f([pb], [pb, { name: 'DSPATR', parameters: 'PC' }]) === null);
  check('adding DSPATR(PC HI) (mixed) is blocked', /DSPATR\(PC HI\)/.test(f([pb], [pb, { name: 'DSPATR', parameters: 'PC HI' }])));
  check('adding ALIAS is fine (on the whitelist)', f([pb], [pb, alias]) === null);
  check('adding TEXT is fine (on the whitelist)', f([pb], [pb, { name: 'TEXT', parameters: "'x'" }]) === null);
  check('adding INDTXT is fine (on the whitelist)', f([pb], [pb, { name: 'INDTXT', parameters: "'x'" }]) === null);
  check('editing an existing field to ADD COLOR is blocked', /COLOR/.test(f([pb, alias], [pb, alias, { name: 'COLOR', parameters: 'RED' }])));
  check('a pre-existing conflict is NOT re-reported on an unrelated edit', f([pb, { name: 'COLOR', parameters: 'RED' }], [pb, { name: 'COLOR', parameters: 'RED' }, alias]) === null);
  check('removing a conflicting keyword is fine', f([pb, { name: 'COLOR', parameters: 'RED' }], [pb]) === null);
  check('a second, additional COLOR instance IS new', /COLOR/.test(f([pb, { name: 'COLOR', parameters: 'RED' }], [pb, { name: 'COLOR', parameters: 'RED' }, { name: 'COLOR', parameters: 'BLU' }])));
  check('no PSHBTNFLD afterwards -> never blocks', f([pb], [alias]) === null);
  check('PSHBTNFLD being turned ON is left to the forward guard', f([alias], [alias, pb]) === null);
  check('no PSHBTNFLD before either -> never blocks', f([alias], [alias, { name: 'COLOR', parameters: 'RED' }]) === null);
  check('null/empty inputs are safe', f(null, null) === null && f(undefined, []) === null);
}

// ===========================================================================
// Group B: real field-level panels, via commitEdit's own choke point
// ===========================================================================

function makeDom(src) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'I64.DSPF').replace(
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

// F1: a real, valid push-button field (usage B, data type Y, length 2,
// decimal positions 0 - PSHBTNFLD's own documented shape) already
// carrying PSHBTNFLD. F2: an ordinary field with no PSHBTNFLD, for the
// no-regression check.
const SRC = [
  '     A          R RECORD1',
  '     A            F1             2Y 0B  3  5PSHBTNFLD',
  '     A            F2            20A  B  5  5',
].join('\n') + '\n';

let pending = 2;
function finishOne() {
  pending--;
  if (pending === 0) {
    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  }
}

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

    const owner = selectField(0);

    console.log('\nEditing keywords panel (EDTCDE) on a PSHBTNFLD field');
    const ecKindEl = doc.getElementById(owner + '-ec-kind');
    check('setup: Edit code/word kind select is present (editingKeywords visible for usage B)', !!ecKindEl);
    if (ecKindEl) {
      ecKindEl.value = 'EDTCDE';
      const ecParamsEl = doc.getElementById(owner + '-ec-params');
      if (ecParamsEl) ecParamsEl.value = 'J';
      const r = attempt(() => doc.querySelector('.' + owner + '-vc-apply').dispatchEvent(new Event('click', { bubbles: true })));
      check('blocked with an alert naming EDTCDE + PSHBTNFLD', !!r.alertMessage && /EDTCDE/.test(r.alertMessage) && /PSHBTNFLD/.test(r.alertMessage));
      check('no applyEdit posted', !r.applyEdit);
    }

    console.log('\nColor & attributes panel (DSPATR HI, not PC) on a PSHBTNFLD field');
    selectField(0);
    const stagingPrefix = owner + '-colorattr-new';
    const hiBox = Array.from(doc.querySelectorAll('.' + stagingPrefix + '-attr')).find((e) => e.value === 'HI');
    check('setup: HI attribute checkbox present in the staging area', !!hiBox);
    if (hiBox) {
      hiBox.checked = true;
      const r = attempt(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-colorattr"]').dispatchEvent(new Event('click', { bubbles: true })));
      check('blocked with an alert naming DSPATR(HI) + PSHBTNFLD', !!r.alertMessage && /DSPATR\(HI\)/.test(r.alertMessage) && /PSHBTNFLD/.test(r.alertMessage));
      check('no applyEdit posted', !r.applyEdit);
    }

    console.log('\nColor & attributes panel (DSPATR PC - the one allowed attribute) on a PSHBTNFLD field');
    selectField(0);
    const pcBox = Array.from(doc.querySelectorAll('.' + stagingPrefix + '-attr')).find((e) => e.value === 'PC');
    check('setup: PC attribute checkbox present in the staging area', !!pcBox);
    if (pcBox) {
      pcBox.checked = true;
      const r = attempt(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-colorattr"]').dispatchEvent(new Event('click', { bubbles: true })));
      check('DSPATR(PC) still adds normally (no regression, whitelisted)', !r.alertMessage && !!r.applyEdit);
      const f1 = r.applyEdit && reparsedField(r.applyEdit.text, 'F1');
      check('...and F1 keeps PSHBTNFLD alongside it', !!f1 && f1.keywords.some((k) => k.name === 'PSHBTNFLD') && f1.keywords.some((k) => k.name === 'DSPATR'));
    }

    console.log('\nKeying options panel (CHECK) on a PSHBTNFLD field');
    selectField(0);
    const checkAddBtn = doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-keying-check-rep"]');
    check('setup: Keying options CHECK "+ Add" button present', !!checkAddBtn);
    if (checkAddBtn) {
      const r = attempt(() => checkAddBtn.dispatchEvent(new Event('click', { bubbles: true })));
      check('adding a CHECK instance is blocked with an alert naming CHECK + PSHBTNFLD', !!r.alertMessage && /CHECK/.test(r.alertMessage) && /PSHBTNFLD/.test(r.alertMessage));
      check('no applyEdit posted', !r.applyEdit);
    }

    console.log('\nGeneral keywords panel (ALIAS) on a PSHBTNFLD field: no regression, still allowed');
    selectField(0);
    const aliasOnEl = doc.getElementById(owner + '-gen-alias-on');
    check('setup: ALIAS checkbox present', !!aliasOnEl);
    if (aliasOnEl) {
      aliasOnEl.checked = true;
      aliasOnEl.dispatchEvent(new Event('change', { bubbles: true }));
      const nameEl = doc.getElementById(owner + '-gen-alias-name');
      const r = attempt(() => {
        if (nameEl) {
          nameEl.value = 'MYALIAS';
          nameEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      check('ALIAS adds normally (whitelisted, no regression)', !r.alertMessage);
    }

    console.log('\nField WITHOUT PSHBTNFLD (F2): the same panels still work (no regression)');
    const owner2 = selectField(1);
    const ecKindEl2 = doc.getElementById(owner2 + '-ec-kind');
    if (ecKindEl2) {
      ecKindEl2.value = 'EDTCDE';
      const ecParamsEl2 = doc.getElementById(owner2 + '-ec-params');
      if (ecParamsEl2) ecParamsEl2.value = 'J';
      const r = attempt(() => doc.querySelector('.' + owner2 + '-vc-apply').dispatchEvent(new Event('click', { bubbles: true })));
      check('EDTCDE works normally on a non-PSHBTNFLD field', !r.alertMessage && !!r.applyEdit);
    }

    check('no uncaught errors', errors.length === 0);
    finishOne();
  }, 500);
}

// ===========================================================================
// Group C: a hand-written field that is ALREADY invalid (PSHBTNFLD +
// COLOR) - unrelated edits must not be blocked by the pre-existing
// conflict.
// ===========================================================================

const PREEXISTING_SRC = [
  '     A          R RECORD1',
  '     A            F1             2Y 0B  3  5PSHBTNFLD',
  '     A                                      COLOR(RED)',
].join('\n') + '\n';

runPreexistingScenario();
function runPreexistingScenario() {
  const { dom, posted, errors } = makeDom(PREEXISTING_SRC);
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
    boxes[0].click();
    const owner = 'field-' + boxes[0].getAttribute('data-source-line');

    console.log('\nA field already invalid (PSHBTNFLD + COLOR): an unrelated edit (ALIAS) is not blocked by the pre-existing conflict');
    const aliasOnEl = doc.getElementById(owner + '-gen-alias-on');
    let alertMessage = null;
    let applyEdit = null;
    if (aliasOnEl) {
      posted.length = 0;
      const original = dom.window.alert;
      dom.window.alert = (m) => { alertMessage = m; };
      aliasOnEl.checked = true;
      aliasOnEl.dispatchEvent(new Event('change', { bubbles: true }));
      const nameEl = doc.getElementById(owner + '-gen-alias-name');
      if (nameEl) {
        nameEl.value = 'MYALIAS';
        nameEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      dom.window.alert = original;
      applyEdit = posted.find((m) => m.type === 'applyEdit');
    }
    check('setup: ALIAS checkbox present', !!aliasOnEl);
    check('pre-existing COLOR conflict is not re-reported on this unrelated edit', !alertMessage);
    const f1 = applyEdit && reparsedField(applyEdit.text, 'F1');
    check('the pre-existing COLOR keyword is untouched by the unrelated edit', !f1 || f1.keywords.some((k) => k.name === 'COLOR'));

    check('no uncaught errors', errors.length === 0);
    finishOne();
  }, 500);
}

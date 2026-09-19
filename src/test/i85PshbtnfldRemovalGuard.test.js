/**
 * i85PshbtnfldRemovalGuard.test.js
 *
 * Task I-85 - follow-up from I-81. PSHBTNFLD's DDS Reference section says "A
 * field containing the PSHBTNFLD keyword must also contain one or more
 * PSHBTNCHC keywords", and PSHBTNCHC needs PSHBTNFLD. I-57 / I-64 guard what
 * an edit ADDS; nothing guarded the removal direction:
 *   A. removing PSHBTNFLD while a PSHBTNCHC stays (orphaned choices);
 *   B. removing the LAST PSHBTNCHC while PSHBTNFLD stays (no buttons).
 *
 * Fix: new DspfWriter.pshbtnfldRemovalConflictReason(oldKeywords, newKeywords),
 * a diff-based backstop called from commitEdit right after I-64's
 * pshbtnfldNewConflictReason - ONE choke point for the PSHBTNFLD panel's
 * choice rows, the raw keyword editor's Remove and every other path that
 * writes field keywords. Conflicts already present before an edit are not
 * re-reported, and fixing them is always allowed. The panel's own toggle-off
 * (which removes PSHBTNFLD together with every PSHBTNCHC) still works.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i85PshbtnfldRemovalGuard.test.js
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

// === Group A: pure unit checks ===
console.log('\nDspfWriter.pshbtnfldRemovalConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.pshbtnfldRemovalConflictReason === 'function');
{
  const f = DspfWriter.pshbtnfldRemovalConflictReason || (() => null);
  const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
  const FLD = k('PSHBTNFLD');
  const C1 = k('PSHBTNCHC', "1 'Yes'");
  const C2 = k('PSHBTNCHC', "2 'No'");
  const TXT = k('TEXT', "'x'");
  const ALIAS = k('ALIAS', "'X'");

  // direction A: removing PSHBTNFLD while a PSHBTNCHC stays
  const rmFld = f([FLD, C1], [C1]) || '';
  check('A: removing PSHBTNFLD while PSHBTNCHC stays is blocked', !!rmFld);
  check('A: reason names PSHBTNFLD and PSHBTNCHC and says removed', /PSHBTNFLD/.test(rmFld) && /PSHBTNCHC/.test(rmFld) && /remov/i.test(rmFld));
  check('A: removing PSHBTNFLD while several PSHBTNCHC stay is blocked', !!f([FLD, C1, C2], [C1, C2]));
  check('A: removing PSHBTNFLD alongside other keywords is blocked', !!f([FLD, C1, TXT], [C1, TXT]));
  check('A: removing PSHBTNFLD AND every PSHBTNCHC together is allowed (panel toggle-off)', f([FLD, C1, C2], []) === null);
  check('A: ...with other keywords kept is allowed', f([FLD, C1, TXT], [TXT]) === null);

  // direction B: removing the last PSHBTNCHC while PSHBTNFLD stays
  const rmChc = f([FLD, C1], [FLD]) || '';
  check('B: removing the last PSHBTNCHC while PSHBTNFLD stays is blocked', !!rmChc);
  check('B: reason names PSHBTNCHC and PSHBTNFLD and says removed', /PSHBTNCHC/.test(rmChc) && /PSHBTNFLD/.test(rmChc) && /remov/i.test(rmChc));
  check('B: removing one of two PSHBTNCHC (one remains) is allowed', f([FLD, C1, C2], [FLD, C2]) === null);
  check('B: removing the other one of two is allowed', f([FLD, C1, C2], [FLD, C1]) === null);
  check('B: replacing the only PSHBTNCHC with another (one remains) is allowed', f([FLD, C1], [FLD, C2]) === null);
  check('B: a PSHBTNCHC edited in place (same count) is allowed', f([FLD, C1], [FLD, k('PSHBTNCHC', "1 'Yes' *SPACEB")]) === null);
  check('the two directions give different messages', rmFld !== rmChc);

  // unrelated / no-op edits
  check('no PSHBTNFLD before or after -> never blocks', f([TXT], [TXT, ALIAS]) === null && f([], []) === null);
  check('unrelated edit on a valid push-button field is allowed', f([FLD, C1], [FLD, C1, ALIAS]) === null);
  check('removing an unrelated keyword from a valid push-button field is allowed', f([FLD, C1, TXT], [FLD, C1]) === null);
  check('removing PSHBTNCHC from a field that never had PSHBTNFLD is allowed', f([C1], []) === null);
  check('removing PSHBTNFLD from a field with no PSHBTNCHC is allowed', f([FLD, TXT], [TXT]) === null);

  // adding is NOT this function's job (I-57 / I-64)
  check('turning PSHBTNFLD on (with a seeded choice) is allowed', f([TXT], [TXT, FLD, C1]) === null);
  check('turning PSHBTNFLD on with no choice is left to the add-direction guards', f([TXT], [TXT, FLD]) === null);
  check('adding PSHBTNCHC to a field with no PSHBTNFLD is left to the add-direction guards', f([TXT], [TXT, C1]) === null);

  // diff-based: already-invalid hand-written fields
  check('pre-existing PSHBTNFLD without PSHBTNCHC, unchanged -> not re-reported', f([FLD], [FLD]) === null);
  check('pre-existing PSHBTNFLD without PSHBTNCHC + unrelated keyword -> not re-reported', f([FLD], [FLD, ALIAS]) === null);
  check('pre-existing PSHBTNFLD without PSHBTNCHC: fixing it by adding one is allowed', f([FLD], [FLD, C1]) === null);
  check('pre-existing PSHBTNFLD without PSHBTNCHC: fixing it by removing PSHBTNFLD is allowed', f([FLD], []) === null);
  check('pre-existing orphan PSHBTNCHC, unchanged -> not re-reported', f([C1], [C1]) === null);
  check('pre-existing orphan PSHBTNCHC + unrelated keyword -> not re-reported', f([C1], [C1, ALIAS]) === null);
  check('pre-existing orphan PSHBTNCHC: fixing it by adding PSHBTNFLD is allowed', f([C1], [C1, FLD]) === null);
  check('pre-existing orphan PSHBTNCHC: fixing it by removing it is allowed', f([C1, C2], [C2]) === null);

  check('parameters and conditions on the keywords do not matter', f([k('PSHBTNFLD', '*RSTCSR'), k('PSHBTNCHC', "1 'Yes'")], [k('PSHBTNCHC', "1 'Yes'")]) !== null);
  check('null/undefined inputs are safe', f(null, null) === null && f(undefined, undefined) === null && f(null, [C1]) === null && f([FLD, C1], null) === null);
}

// === DOM scenarios ===
// The webview applies an edit to its local model straight away (no host
// round-trip in jsdom), so every scenario that COMMITS uses its own field.
// F1: valid, ONE choice (blocked-edit scenarios, then toggle-off).  F2: valid,
// TWO choices.  F3: hand-written and ALREADY invalid (PSHBTNFLD, no choice).
// F4: hand-written orphan PSHBTNCHC (no PSHBTNFLD).  F5: plain field.  F6:
// valid, one choice (add a second).  F7: valid, two choices (panel remove).
// F8: hand-written PSHBTNFLD with no choice (fix by adding one).
const kwLine = (text) => '     A' + ' '.repeat(38) + text;
const SRC = [
  '     A          R RECORD1',
  '     A            F1             2Y 0B  3  5PSHBTNFLD',
  kwLine("PSHBTNCHC(1 'Yes')"),
  '     A            F2             2Y 0B  5  5PSHBTNFLD',
  kwLine("PSHBTNCHC(1 'Yes')"),
  kwLine("PSHBTNCHC(2 'No')"),
  '     A            F3             2Y 0B  7  5PSHBTNFLD',
  '     A            F4            20A  B  9  5',
  kwLine("PSHBTNCHC(1 'Orphan')"),
  '     A            F5            20A  B 11  5',
  '     A            F6             2Y 0B 13  5PSHBTNFLD',
  kwLine("PSHBTNCHC(1 'Yes')"),
  '     A            F7             2Y 0B 15  5PSHBTNFLD',
  kwLine("PSHBTNCHC(1 'Yes')"),
  kwLine("PSHBTNCHC(2 'No')"),
  '     A            F8             2Y 0B 17  5PSHBTNFLD',
].join('\n') + '\n';

function fieldKeywordNames(text, fieldName) {
  const parsed = DspfParser.parseDspf(text);
  const out = [];
  parsed.records.forEach((r) => r.fields.forEach((f) => out.push(f)));
  const f = out.find((x) => x.name === fieldName);
  return f ? f.keywords.map((kw) => kw.name) : null;
}

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I85.DSPF').replace(
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

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;

  // select a field by name; returns its owner key ('field-<sourceLine>')
  function selectField(name) {
    const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
    const box = boxes.find((b) => (b.getAttribute('data-name') || b.textContent || '').indexOf(name) >= 0) || boxes[Number(name.slice(1)) - 1];
    box.click();
    return 'field-' + box.getAttribute('data-source-line');
  }
  // run an action, capturing an alert and the applyEdit it posted
  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  // raw-editor chips of the selected field, in keyword order: [{ idx, label }]
  function chips(owner) {
    return Array.from(doc.querySelectorAll('.kw-remove[data-owner="' + owner + '"]')).map((b) => ({
      idx: b.getAttribute('data-idx'),
      label: (b.parentElement && b.parentElement.textContent) || '',
    }));
  }
  function rawRemove(owner, re, nth) {
    const matches = chips(owner).filter((c) => re.test(c.label));
    const c = matches[nth || 0];
    if (!c) { errors.push(new Error('no raw chip matching ' + re + ' on ' + owner)); return { alertMessage: null, applyEdit: null }; }
    return act(() => doc.querySelector('.kw-remove[data-owner="' + owner + '"][data-idx="' + c.idx + '"]').dispatchEvent(new Event('click', { bubbles: true })));
  }
  function panelRemoveChoice(owner, n) {
    return act(() => {
      const btns = doc.querySelectorAll('.repeat-inst-remove[data-prefix="' + owner + '-pbc-rep"]');
      btns[n].dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  function panelToggle(owner, on) {
    return act(() => { const c = doc.getElementById(owner + '-pb-on'); c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  // === Group B: F1 (valid, ONE choice) ===
  console.log('\nF1 (PSHBTNFLD + one PSHBTNCHC): both removal directions are blocked');
  let owner = selectField('F1');
  check('setup: F1 raw editor shows PSHBTNFLD and one PSHBTNCHC chip', chips(owner).length === 2 && chips(owner).some((c) => /PSHBTNFLD/.test(c.label)) && chips(owner).some((c) => /PSHBTNCHC/.test(c.label)));
  check('setup: the push-button panel is rendered with its toggle checked', !!doc.getElementById(owner + '-pb-on') && doc.getElementById(owner + '-pb-on').checked === true);
  {
    const r = rawRemove(owner, /PSHBTNFLD/);
    check('A: raw editor - removing PSHBTNFLD blocked, alert names PSHBTNCHC, no applyEdit', blocked(r, /PSHBTNCHC/));
  }
  owner = selectField('F1');
  {
    const r = rawRemove(owner, /PSHBTNCHC/);
    check('B: raw editor - removing the only PSHBTNCHC blocked, alert names PSHBTNFLD, no applyEdit', blocked(r, /PSHBTNFLD/));
  }
  owner = selectField('F1');
  {
    const r = panelRemoveChoice(owner, 0);
    check('B: PSHBTNFLD panel - removing the only choice row blocked, no applyEdit', blocked(r, /PSHBTNFLD/));
  }

  console.log('\nF1: allowed edits still commit');
  owner = selectField('F1');
  {
    const r = panelToggle(owner, false);
    check('toggling the push-button field OFF commits with no alert', allowed(r));
    const names = r.applyEdit && fieldKeywordNames(r.applyEdit.text, 'F1');
    check('  ...PSHBTNFLD and PSHBTNCHC are both gone', !!names && !names.includes('PSHBTNFLD') && !names.includes('PSHBTNCHC'));
  }
  owner = selectField('F6');
  {
    const r = act(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-pbc-rep"]').dispatchEvent(new Event('click', { bubbles: true })));
    check('adding a second PSHBTNCHC (on F6) commits with no alert', allowed(r));
    const names = r.applyEdit && fieldKeywordNames(r.applyEdit.text, 'F6');
    check('  ...PSHBTNFLD kept, two PSHBTNCHC written', !!names && names.includes('PSHBTNFLD') && names.filter((n) => n === 'PSHBTNCHC').length === 2);
  }

  // === F2 (valid, TWO choices) ===
  console.log('\nF2 (PSHBTNFLD + two PSHBTNCHC)');
  owner = selectField('F2');
  {
    const r = rawRemove(owner, /PSHBTNCHC/, 0);
    check('raw editor - removing ONE of two PSHBTNCHC commits with no alert', allowed(r));
    const names = r.applyEdit && fieldKeywordNames(r.applyEdit.text, 'F2');
    check('  ...PSHBTNFLD kept and exactly one PSHBTNCHC remains', !!names && names.includes('PSHBTNFLD') && names.filter((n) => n === 'PSHBTNCHC').length === 1);
  }
  owner = selectField('F7');
  {
    const r = panelRemoveChoice(owner, 1);
    check('panel - removing one choice row of two (on F7) commits with no alert', allowed(r));
    const names = r.applyEdit && fieldKeywordNames(r.applyEdit.text, 'F7');
    check('  ...PSHBTNFLD kept and one PSHBTNCHC remains', !!names && names.includes('PSHBTNFLD') && names.filter((n) => n === 'PSHBTNCHC').length === 1);
  }
  owner = selectField('F2');
  {
    const r = rawRemove(owner, /PSHBTNFLD/);
    check('A: raw editor - removing PSHBTNFLD while the remaining PSHBTNCHC stays is blocked', blocked(r, /PSHBTNCHC/));
  }
  owner = selectField('F2');
  {
    const r = panelToggle(owner, false);
    check('toggling OFF removes PSHBTNFLD and the remaining PSHBTNCHC in one commit', allowed(r) && !!fieldKeywordNames(r.applyEdit.text, 'F2') && !fieldKeywordNames(r.applyEdit.text, 'F2').some((n) => /^PSHBTN/.test(n)));
  }

  // === F3 (already invalid: PSHBTNFLD, no choice) ===
  console.log('\nF3 (hand-written PSHBTNFLD with no PSHBTNCHC - already invalid)');
  owner = selectField('F3');
  {
    const r = rawRemove(owner, /PSHBTNFLD/);
    check('removing PSHBTNFLD (fixing it) is allowed', allowed(r));
  }
  owner = selectField('F8');
  {
    const r = act(() => doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-pbc-rep"]').dispatchEvent(new Event('click', { bubbles: true })));
    check('adding a PSHBTNCHC (fixing it, on F8 - same shape as F3) is allowed', allowed(r));
  }

  // === F4 (orphan PSHBTNCHC) ===
  console.log('\nF4 (hand-written orphan PSHBTNCHC - already invalid)');
  owner = selectField('F4');
  {
    const r = rawRemove(owner, /PSHBTNCHC/);
    check('removing the orphan PSHBTNCHC (fixing it) is allowed', allowed(r));
  }

  // === F5 (plain field) ===
  console.log('\nF5 (plain field): turning the push-button kind on still works');
  owner = selectField('F5');
  {
    const r = panelToggle(owner, true);
    check('turning PSHBTNFLD on commits with no alert', allowed(r));
    const names = r.applyEdit && fieldKeywordNames(r.applyEdit.text, 'F5');
    check('  ...PSHBTNFLD written together with a seeded PSHBTNCHC', !!names && names.includes('PSHBTNFLD') && names.includes('PSHBTNCHC'));
  }

  check('no script errors', errors.length === 0);
  if (errors.length) console.log(errors);

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 500);

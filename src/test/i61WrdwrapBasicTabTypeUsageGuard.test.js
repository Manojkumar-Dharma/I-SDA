/**
 * i61WrdwrapBasicTabTypeUsageGuard.test.js
 *
 * Task I-61 - follow-up from I-58. I-58 blocked adding WRDWRAP's
 * conflicting KEYWORDS to a field that already carries WRDWRAP, but not a
 * DATA TYPE or USAGE change on one: applying data type S/Y/D/M/F/J/O/E/G
 * or usage O/H/M/P through the Basic tab's "Apply changes" on a WRDWRAP
 * field went straight through, although DspfWriter.wrdwrapFieldConflictReason's
 * own forward check (turning WRDWRAP on) already treats both as invalid
 * (DDS Reference: WRDWRAP is valid only on input-only (I) or input/output
 * (B) fields, and not on keyboard shift / data types S, Y, D, M, F, J, O,
 * E or G).
 *
 * Fix: new DspfWriter.wrdwrapBasicEditConflictReason, called from the
 * Basic tab's Apply handler (early return, before commitEdit - same idiom
 * as I-31's dateTimeUsageConflictReason, so the user's other pending edits
 * in the panel are kept and they can fix the select and click Apply
 * again). It reuses wrdwrapFieldConflictReason's own usage/data-type
 * wording (shared helpers) and is DIFF-BASED, like I-58's backstop: only a
 * change TO an invalid value is blocked, so an unrelated Apply (rename,
 * length) on a hand-written field that is already invalid is never
 * blocked. A blank stored Usage is the DDS default (O), and the Usage
 * select has no blank option (it shows O), so a blank old Usage counts as
 * O when diffing.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i61WrdwrapBasicTabTypeUsageGuard.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');
const DspfWriter = require('../../dist/dspfWriter.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// === Group A: pure unit checks ===
console.log('\nDspfWriter.wrdwrapBasicEditConflictReason: direct unit checks');
check('function is exported', typeof DspfWriter.wrdwrapBasicEditConflictReason === 'function');
{
  const f = DspfWriter.wrdwrapBasicEditConflictReason || (() => null);
  const ww = [{ name: 'WRDWRAP', parameters: '' }];
  const noWw = [{ name: 'DSPATR', parameters: 'HI' }];

  ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G'].forEach((t) => {
    const r = f(ww, 'A', 'B', t, 'B');
    check('data type A -> ' + t + ' blocked, reason names WRDWRAP and ' + t, !!r && /WRDWRAP/.test(r) && r.indexOf(t) !== -1);
  });
  ['O', 'H', 'M', 'P'].forEach((u) => {
    const r = f(ww, 'A', 'B', 'A', u);
    check('usage B -> ' + u + ' blocked, reason names WRDWRAP', !!r && /WRDWRAP/.test(r));
  });
  ['A', 'X', 'N', 'I', 'L', 'T', 'Z', '', null].forEach((t) => {
    check('data type -> ' + JSON.stringify(t) + ' allowed', f(ww, t === 'A' ? 'X' : 'A', 'B', t, 'B') === null);
  });
  check('usage B -> I allowed', f(ww, 'A', 'B', 'A', 'I') === null);
  check('usage I -> B allowed', f(ww, 'A', 'I', 'A', 'B') === null);

  check('no WRDWRAP on the field -> never blocks (type)', f(noWw, 'A', 'B', 'Y', 'B') === null);
  check('no WRDWRAP on the field -> never blocks (usage)', f(noWw, 'A', 'B', 'A', 'O') === null);

  // diff-based: a value that is already invalid and unchanged is not re-reported
  check('pre-existing invalid data type S, unchanged -> not re-reported', f(ww, 'S', 'B', 'S', 'B') === null);
  check('pre-existing invalid usage O, unchanged -> not re-reported', f(ww, 'A', 'O', 'A', 'O') === null);
  check('blank stored usage (default O) vs the select showing O -> not a change', f(ww, 'A', '', 'A', 'O') === null);
  check('null stored usage vs O -> not a change', f(ww, 'A', null, 'A', 'O') === null);
  check('blank stored usage -> explicit H IS a change and is blocked', /WRDWRAP/.test(f(ww, 'A', '', 'A', 'H') || ''));
  check('usage B -> blank (= default O) IS a change to an invalid value and is blocked', /WRDWRAP/.test(f(ww, 'A', 'B', 'A', '') || ''));
  check('blank usage -> blank usage is not a change', f(ww, 'A', '', 'A', '') === null);
  check('blank -> null data type is not a change', f(ww, '', 'B', null, 'B') === null);
  check('changing between two invalid types (S -> Y) is still blocked', /WRDWRAP/.test(f(ww, 'S', 'B', 'Y', 'B') || ''));
  check('fixing an invalid type (S -> A) is allowed', f(ww, 'S', 'B', 'A', 'B') === null);
  check('fixing an invalid usage (O -> I) is allowed', f(ww, 'A', 'O', 'A', 'I') === null);
  check('type and usage both bad -> blocked', !!f(ww, 'A', 'B', 'Y', 'O'));
  check('lowercase input is normalised', /WRDWRAP/.test(f(ww, 'a', 'b', 'y', 'b') || ''));
  check('null/empty inputs are safe', f(null, null, null, null, null) === null && f(undefined, undefined, undefined, undefined, undefined) === null);

  // the forward check must be unchanged by the refactor
  const fw = DspfWriter.wrdwrapFieldConflictReason;
  check('forward check still blocks WRDWRAP on usage O', /input-only/.test(fw('WRDWRAP', [], 'A', 'O', []) || ''));
  check('forward check still blocks WRDWRAP on data type Y', /data type Y/.test(fw('WRDWRAP', [], 'Y', 'B', []) || ''));
  check('forward check still allows WRDWRAP on A / B', fw('WRDWRAP', [], 'A', 'B', []) === null);
  check('forward check still fails open on blank usage/type', fw('WRDWRAP', [], '', '', []) === null);
}

// === DOM scenarios ===
function makeDom(src) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'I61.DSPF');
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

// F1: valid WRDWRAP field (A / B).  F2: no WRDWRAP.
// F4: WRDWRAP with BLANK usage (default output = already invalid, hand-written).
// F5: WRDWRAP with data type S (already invalid, hand-written).
const SRC = [
  '     A          R RECORD1',
  '     A            F1            20A  B  3  5WRDWRAP',
  '     A            F2            20A  B  5  5',
  '     A            F4            20A     7  5WRDWRAP',
  '     A            F5            20S 0B  9  5WRDWRAP',
].join('\n') + '\n';

const { dom, posted, errors } = makeDom(SRC);
setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;

  // Select by SOURCE LINE (F1=2, F2=3, F4=4, F5=5), not by index: against
  // unfixed code a hidden-usage edit removes a field from the canvas and an
  // index-based lookup would shift or crash instead of failing cleanly.
  function selectField(line) {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    return true;
  }
  // set select/input values, click Apply changes, capture alert + applyEdit
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

  // === Group B: a WRDWRAP field (F1, A / B) ===
  console.log('\nBasic tab Apply on a WRDWRAP field (F1): blocked data types');
  ['S', 'Y', 'D', 'M', 'F'].forEach((t) => {
    selectField(2);
    const r = apply({ 'p-type': t });
    check('data type ' + t + ' blocked with an alert naming WRDWRAP and ' + t, !!r.alertMessage && /WRDWRAP/.test(r.alertMessage) && r.alertMessage.indexOf(t) !== -1);
    check('  ...and no applyEdit posted', !r.applyEdit);
  });

  console.log('\nBasic tab Apply on a WRDWRAP field (F1): blocked usages');
  ['O', 'H', 'M', 'P'].forEach((u) => {
    selectField(2);
    const r = apply({ 'p-usage': u });
    check('usage ' + u + ' blocked with an alert naming WRDWRAP', !!r.alertMessage && /WRDWRAP/.test(r.alertMessage));
    check('  ...and no applyEdit posted', !r.applyEdit);
  });

  console.log('\nBasic tab Apply on a WRDWRAP field (F1): a blocked Apply keeps the other pending edits in the panel');
  selectField(2);
  {
    const r = apply({ 'p-length': '33', 'p-type': 'Y' });
    check('blocked (length edit + bad type)', !!r.alertMessage && !r.applyEdit);
    check('the typed length is still in the form (no re-render wiped it)', doc.getElementById('p-length').value === '33');
  }

  console.log('\nBasic tab Apply on a WRDWRAP field (F1): allowed edits still commit');
  selectField(2);
  {
    const r = apply({ 'p-length': '25', 'p-type': 'A', 'p-usage': 'B' });
    check('length change alone commits with no alert', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F1');
    check('length written, WRDWRAP kept', !!f && f.length === 25 && f.keywords.some((k) => k.name === 'WRDWRAP'));
  }
  selectField(2);
  {
    const r = apply({ 'p-usage': 'I' });
    check('usage B -> I commits with no alert', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F1');
    check('usage I written, WRDWRAP kept', !!f && f.usage === 'I' && f.keywords.some((k) => k.name === 'WRDWRAP'));
  }
  selectField(2);
  {
    const r = apply({ 'p-name': 'F1NEW' });
    check('rename commits with no alert', !r.alertMessage && !!r.applyEdit);
  }

  // === Group C: a field WITHOUT WRDWRAP (F2) - no regression ===
  console.log('\nBasic tab Apply on a field WITHOUT WRDWRAP (F2): unaffected');
  selectField(3);
  {
    const r = apply({ 'p-type': 'Y', 'p-usage': 'O' });
    check('data type Y + usage O commit normally, no alert', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F2');
    check('Y / O written', !!f && f.dataType === 'Y' && f.usage === 'O');
  }

  // === Group D: hand-written field already invalid (blank usage, F4) ===
  console.log('\nHand-written WRDWRAP field with BLANK usage (F4): unrelated edits are not blocked');
  selectField(4);
  {
    const shown = doc.getElementById('p-usage').value;
    check('setup: the Usage select shows O for a blank stored usage', shown === 'O');
    const r = apply({ 'p-length': '30' });
    check('a length-only Apply is not blocked (blank usage == default O == unchanged)', !r.alertMessage && !!r.applyEdit);
  }
  selectField(4);
  {
    const r = apply({ 'p-usage': 'H' });
    check('explicitly choosing H IS blocked', !!r.alertMessage && /WRDWRAP/.test(r.alertMessage) && !r.applyEdit);
  }
  selectField(4);
  {
    const r = apply({ 'p-usage': 'B' });
    check('fixing it (usage B) commits', !r.alertMessage && !!r.applyEdit);
  }

  // === Group E: hand-written field already invalid (data type S, F5) ===
  console.log('\nHand-written WRDWRAP field with data type S (F5): unrelated edits are not blocked');
  selectField(5);
  {
    const r = apply({ 'p-length': '18' });
    check('a length-only Apply is not blocked (type S unchanged)', !r.alertMessage && !!r.applyEdit);
  }
  selectField(5);
  {
    const r = apply({ 'p-type': 'Y' });
    check('changing S -> Y (another invalid type) IS blocked', !!r.alertMessage && /WRDWRAP/.test(r.alertMessage) && !r.applyEdit);
  }
  selectField(5);
  {
    const r = apply({ 'p-type': 'A' });
    check('fixing it (S -> A) commits', !r.alertMessage && !!r.applyEdit);
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F5');
    check('data type A written, WRDWRAP kept', !!f && f.dataType === 'A' && f.keywords.some((k) => k.name === 'WRDWRAP'));
  }

  check('no uncaught errors', errors.length === 0);
  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

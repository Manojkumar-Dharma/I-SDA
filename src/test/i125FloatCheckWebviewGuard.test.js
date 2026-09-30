/**
 * i125FloatCheckWebviewGuard.test.js
 *
 * Task I-125 - COMP/RANGE/VALUES/CHECK(AB) "not on a floating-point
 * field" restriction is unenforced. Real webview coverage for the
 * DspfWriter-level guards added in this task (see
 * i125FloatIncompatibleValidityCheckGuard.test.js for the pure-function
 * checks): the raw keyword editor and the Basic tab's data-type change,
 * both of which run through commitEdit - the one choke point every
 * field-level write goes through - the same route I-72's own DUP test
 * exercises.
 *
 * Fixture:
 *  F1 (line 2): floating-point (F), no validity-check keywords.
 *  F2 (line 3): character (A) field WITH RANGE.
 *  F3 (line 4): character (A) field WITH COMP.
 *  F4 (line 5): character (A) field WITH VALUES.
 *  F5 (line 6): character (A) field WITH CHECK(AB).
 *  F6 (line 7): hand-written and ALREADY INVALID: floating-point (F)
 *               WITH RANGE.
 *  F7 (line 8): character (A) field WITH CHECK(ME) - a code that is
 *               never floating-point-restricted.
 *  F8 (line 9): character (A) field WITH CHECK(M11F) - a modulus code,
 *               floating-point-restricted since I-132 (was unguarded).
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i125FloatCheckWebviewGuard.test.js
 */
const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '3', col: '2' }),
  buildLine({ seq: '00030', name: 'F2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '2', func: "RANGE(1 100)" }),
  buildLine({ seq: '00040', name: 'F3', length: '10', dataType: 'A', usage: 'B', line: '7', col: '2', func: "COMP(EQ 5)" }),
  buildLine({ seq: '00050', name: 'F4', length: '10', dataType: 'A', usage: 'B', line: '9', col: '2', func: "VALUES('A' 'B')" }),
  buildLine({ seq: '00060', name: 'F5', length: '10', dataType: 'A', usage: 'B', line: '11', col: '2', func: 'CHECK(AB)' }),
  buildLine({ seq: '00070', name: 'F6', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '13', col: '2', func: 'RANGE(1 100)' }),
  buildLine({ seq: '00080', name: 'F7', length: '10', dataType: 'A', usage: 'B', line: '15', col: '2', func: 'CHECK(ME)' }),
  buildLine({ seq: '00090', name: 'F8', length: '10', dataType: 'A', usage: 'B', line: '17', col: '2', func: 'CHECK(M11F)' }),
].join('\n') + '\n';

function reparsedField(text, name) {
  const parsed = DspfParser.parseDspf(text);
  const out = [];
  parsed.records.forEach((r) => r.fields.forEach((f) => out.push(f)));
  return out.find((f) => f.name === name);
}
const kwNames = (f) => (f ? f.keywords.map((x) => x.name) : []);

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I125.DSPF');
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

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const el = (id) => doc.getElementById(id);
  const val = (id) => { const e = el(id); return e ? e.value : undefined; };

  function selectField(line) {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    return true;
  }
  function act(fn) {
    posted.length = 0;
    let alertMessage = null;
    const original = dom.window.alert;
    dom.window.alert = (m) => { alertMessage = m; };
    try { fn(); } catch (e) { errors.push(e); }
    dom.window.alert = original;
    return { alertMessage: alertMessage, applyEdit: posted.find((m) => m.type === 'applyEdit') };
  }
  function apply(values) {
    if (!el('p-apply')) return { alertMessage: null, applyEdit: undefined, missing: true };
    return act(() => {
      Object.keys(values).forEach((id) => { const e = el(id); if (e) e.value = values[id]; });
      el('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  function rawAdd(line, name, params) {
    return act(() => {
      el('field-' + line + '-new-kw-name').value = name;
      const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
      doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  const blocked = (r, re) => !!r.alertMessage && re.test(r.alertMessage) && !r.applyEdit;
  const allowed = (r) => !r.alertMessage && !!r.applyEdit;

  // === F1 (floating-point, no validity-check keywords) - direction A ===
  console.log('\nF1 (floating-point, none of RANGE/COMP/VALUES/CHECK(AB)): adding each is blocked via the raw editor');
  [['RANGE', '1 100'], ['COMP', 'EQ 5'], ['VALUES', "'A' 'B'"], ['CHECK', 'AB'],
   ['CHECK', 'M10'], ['CHECK', 'M10F'], ['CHECK', 'M11'], ['CHECK', 'M11F']].forEach(([name, params]) => {
    selectField(2);
    const r = rawAdd(2, name, params);
    const label = name + (name === 'CHECK' ? '(' + params + ')' : '');
    check('raw keyword editor: adding ' + label + ' is blocked with an alert, no applyEdit', blocked(r, new RegExp(name === 'CHECK' ? 'CHECK\\(' + params + '\\)' : name)));
  });
  selectField(2);
  {
    const r = rawAdd(2, 'CHECK', 'ME');
    check('raw keyword editor: adding CHECK(ME) (an unrestricted code) to the float field is NOT blocked', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F1');
    check('  ...CHECK(ME) written', !!f && kwNames(f).includes('CHECK'));
  }

  // === F2/F3/F4/F5 (character + each keyword) - direction B via the Basic tab ===
  [['F2', 3, 'RANGE'], ['F3', 4, 'COMP'], ['F4', 5, 'VALUES'], ['F5', 6, 'CHECK'], ['F8', 9, 'CHECK']].forEach(([fname, line, name]) => {
    console.log('\n' + fname + ' (character field WITH ' + name + '): changing its data type to F is blocked');
    if (selectField(line)) {
      check('setup: data type is A', val('p-type') === 'A');
      const r = apply({ 'p-type': 'F', 'p-dec': '2', 'p-length': '8' });
      check('data type F blocked with an alert, no applyEdit', blocked(r, new RegExp(name)));
      check('the typed length is still in the form (an early return, no re-render wiped it)', val('p-length') === '8');
    }
    selectField(line);
    {
      const r = apply({ 'p-length': '12' });
      check('an unrelated length change still commits', allowed(r));
      const f = r.applyEdit && reparsedField(r.applyEdit.text, fname);
      check('  ...length written and ' + name + ' kept', !!f && f.length === 12 && kwNames(f).includes(name));
    }
  });

  // === F6 (hand-written, ALREADY floating-point with RANGE) ===
  console.log('\nF6 (hand-written, ALREADY floating-point with RANGE): unrelated edits are not blocked, and it can be fixed');
  if (selectField(7)) {
    check('setup: the fixture parsed F6 as floating-point with RANGE', reparsedField(SRC, 'F6').dataType === 'F' && kwNames(reparsedField(SRC, 'F6')).includes('RANGE'));
    const r = apply({ 'p-name': 'F6B' });
    check('a rename-only Apply is not blocked', allowed(r));
  }
  selectField(7);
  {
    const r = apply({ 'p-type': 'S', 'p-dec': '0' });
    check('fixing it by changing the data type away from F commits with no alert', allowed(r));
    const f = r.applyEdit && reparsedField(r.applyEdit.text, 'F6B');
    check('  ...data type S written, RANGE kept', !!f && f.dataType === 'S' && kwNames(f).includes('RANGE'));
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  setTimeout(() => process.exit(failureCount() === 0 ? 0 : 1), 50);
}, 500);

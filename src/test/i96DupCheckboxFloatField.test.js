/**
 * i96DupCheckboxFloatField.test.js
 *
 * Task I-96 - follow-up from I-72. DUP cannot be specified on a floating-point
 * field (DDS Reference: "F in position 35"). I-72 made that a hard block, but
 * the Input keywords panel still RENDERED the DUP checkbox on a float field
 * and refused the tick with an alert - cosmetic, but a control that can only
 * be refused.
 *
 * Fix: the panel takes the field's data type and does not offer the DUP row
 * on a floating-point field - except a hand-written float field that ALREADY
 * has DUP, where the ticked row stays (with a note) so it can still be
 * un-ticked (the reason I-72 rejected a plain dtScope-style hidden row). The
 * row is not wired when it is not rendered. The block itself is untouched.
 *
 * Part 1: pure DspfWriter functions. Part 2: the real generated webview in
 * jsdom. Run with: node src/test/i96DupCheckboxFloatField.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const DUP = [k('DUP')];

// ===========================================================================
// Part 1 - pure functions
// ===========================================================================
console.log('dupCheckboxOffered: hidden only on a float field that does not already have DUP');
check('character field, no DUP: offered', DspfWriter.dupCheckboxOffered('A', []) === true);
check('character field with DUP: offered', DspfWriter.dupCheckboxOffered('A', DUP) === true);
check('zoned (S) field: offered', DspfWriter.dupCheckboxOffered('S', []) === true);
check('packed (P) field: offered', DspfWriter.dupCheckboxOffered('P', []) === true);
check('blank data type (field being drafted): offered', DspfWriter.dupCheckboxOffered('', []) === true);
check('undefined data type: offered', DspfWriter.dupCheckboxOffered(undefined, []) === true);
check('float field, no DUP: NOT offered', DspfWriter.dupCheckboxOffered('F', []) === false);
check('float field, keywords undefined: NOT offered', DspfWriter.dupCheckboxOffered('F', undefined) === false);
check('float field with other keywords only: NOT offered', DspfWriter.dupCheckboxOffered('F', [k('BLANKS'), k('CHANGE')]) === false);
check('float field that ALREADY has DUP: offered (so it can be un-ticked)', DspfWriter.dupCheckboxOffered('F', DUP) === true);
check('lower-case / padded data type is normalised like I-72\'s check', DspfWriter.dupCheckboxOffered(' f ', []) === false);

console.log('\ndupFloatFieldNote: only for a float field that already has DUP');
{
  const n = DspfWriter.dupFloatFieldNote('F', DUP);
  check('float + DUP: a note naming DUP and floating-point', !!n && /DUP/.test(n) && /floating-point/.test(n));
  check('float without DUP: no note', DspfWriter.dupFloatFieldNote('F', []) === null);
  check('character with DUP: no note', DspfWriter.dupFloatFieldNote('A', DUP) === null);
  check('undefined keywords tolerated', DspfWriter.dupFloatFieldNote('F', undefined) === null);
}

// ===========================================================================
// Part 2 - real webview
// ===========================================================================
function buildLine(o) {
  // Same fixed-column layout as I-72's test: 5 seq, 'A' col 6, name col 19-28,
  // length 30-34, type 35, decimals 36-37, usage 38, line 39-41 / col 42-44,
  // keyword area 45+.
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

const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '3', col: '2' }),
  buildLine({ seq: '00030', name: 'F2', length: '10', dataType: 'A', usage: 'B', line: '5', col: '2', func: 'DUP' }),
  buildLine({ seq: '00040', name: 'F3', length: '8', dataType: 'F', decimals: '2', usage: 'B', line: '7', col: '2', func: 'DUP' }),
  buildLine({ seq: '00050', name: 'F4', length: '10', dataType: 'A', usage: 'B', line: '9', col: '2' }),
].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I96.DSPF');
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
  const dupBox = (line) => el('field-' + line + '-inp-dup-on');
  const notes = () => Array.from(doc.querySelectorAll('.hint-small.warn')).map((e) => e.textContent).filter((t) => /DUP/.test(t));
  function reparsed(text, name) {
    const out = [];
    DspfParser.parseDspf(text).records.forEach((r) => r.fields.forEach((f) => out.push(f)));
    return out.find((f) => f.name === name);
  }
  function apply(values) {
    Object.keys(values).forEach((id) => { const e = el(id); if (e) e.value = values[id]; });
    el('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
  }

  console.log('\nF1 (floating-point, no DUP): no DUP row; the rest of the panel is intact');
  if (selectField(2)) {
    check('setup: the fixture parsed F1 as floating-point', reparsed(SRC, 'F1').dataType === 'F');
    check('no DUP checkbox', !dupBox(2));
    check('BLANKS checkbox still present', !!el('field-2-inp-blanks-on'));
    check('CHANGE checkbox still present', !!el('field-2-inp-change-on'));
    check('CHGINPDFT still present', !!doc.querySelector('[id^="field-2-inp-chginpdft"]'));
    check('no DUP note (nothing wrong with the field)', notes().length === 0);
    check('ticking BLANKS on it still commits', (() => { const c = el('field-2-inp-blanks-on'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return !!lastEdit() && alerts.length === 0; })());
  }

  console.log('\nF2 (character, has DUP): the DUP row is offered and ticked, no note');
  if (selectField(3)) {
    check('DUP checkbox present and checked', !!dupBox(3) && dupBox(3).checked === true);
    check('DUP still shows its Conditioning toggle (I-30)', !!doc.querySelector('.kw-cond-toggle[data-flag-id="field-3-inp-dup"]'));
    check('no note', notes().length === 0);
  }

  console.log('\nF4 (character, no DUP): the DUP row is offered and can be ticked');
  if (selectField(5)) {
    check('DUP checkbox present, unchecked', !!dupBox(5) && dupBox(5).checked === false);
    dupBox(5).checked = true;
    dupBox(5).dispatchEvent(new Event('change', { bubbles: true }));
    const e = lastEdit();
    check('ticking it commits with no alert', !!e && alerts.length === 0);
    const f = e && reparsed(e.text, 'F4');
    check('DUP written', !!f && f.keywords.some((x) => x.name === 'DUP'));
  }

  console.log('\nF3 (hand-written float + DUP): the ticked row stays, with a note, and can be un-ticked');
  if (selectField(4)) {
    check('setup: the fixture parsed F3 as floating-point with DUP', reparsed(SRC, 'F3').dataType === 'F' && reparsed(SRC, 'F3').keywords.some((x) => x.name === 'DUP'));
    check('DUP checkbox present and checked', !!dupBox(4) && dupBox(4).checked === true);
    check('a note says DUP cannot be specified on a floating-point field', notes().length === 1 && /floating-point/.test(notes()[0]));
    dupBox(4).checked = false;
    dupBox(4).dispatchEvent(new Event('change', { bubbles: true }));
    const e = lastEdit();
    check('un-ticking commits with no alert', !!e && alerts.length === 0);
    const f = e && reparsed(e.text, 'F3');
    check('DUP removed, still floating-point', !!f && f.dataType === 'F' && !f.keywords.some((x) => x.name === 'DUP'));
    check('afterwards the row is no longer offered (the field is now a valid float field)', (selectField(4), !dupBox(4)));
  }

  console.log('\nBasic tab: changing the data type re-renders the panel accordingly');
  if (selectField(5)) {
    // F4 now carries DUP (ticked above); un-tick, then change to F, then back to A.
    dupBox(5).checked = false;
    dupBox(5).dispatchEvent(new Event('change', { bubbles: true }));
    selectField(5);
    check('setup: F4 offers the DUP row while it is character', !!dupBox(5));
    apply({ 'p-type': 'F', 'p-dec': '2', 'p-length': '8' });
    check('changing to F commits with no alert', !!lastEdit() && alerts.length === 0);
    selectField(5);
    check('as a float field, F4 no longer offers the DUP row', !dupBox(5));
    apply({ 'p-type': 'A', 'p-length': '10' });
    check('changing back to A commits with no alert', !!lastEdit() && alerts.length === 0);
    selectField(5);
    check('as a character field again, the DUP row is back', !!dupBox(5));
  }

  console.log('\nI-72\'s block is unchanged: the raw keyword editor still refuses DUP on a float field');
  if (selectField(2)) {
    el('field-2-new-kw-name').value = 'DUP';
    const pe = el('field-2-new-kw-params'); if (pe) pe.value = '';
    doc.querySelector('.kw-add[data-owner="field-2"]').dispatchEvent(new Event('click', { bubbles: true }));
    check('alert naming DUP and floating-point, no applyEdit', alerts.length === 1 && /DUP/.test(alerts[0]) && /floating-point/.test(alerts[0]) && !lastEdit());
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  setTimeout(() => process.exit(failureCount() === 0 ? 0 : 1), 50);
}, 500);

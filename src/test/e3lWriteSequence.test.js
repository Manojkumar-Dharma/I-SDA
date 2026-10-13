/**
 * e3lWriteSequence.test.js - E3l: OVERLAY, ERASE and ERASEINP in the combined (stacked) preview.
 *
 * DDS Reference: OVERLAY - records already on the display whose fields partially or completely overlap fields in
 * this record are deleted, all others remain. ERASE(rec ...) - with OVERLAY, the named records are erased when this
 * record is written. ERASEINP[(*MDTON | *ALL)] - with OVERLAY, erases unprotected input-capable fields already on
 * the display. "If OVERLAY is conditioned and not selected, then ERASE, ERASEINP, ... cannot take effect."
 * Opt-in: DspfEngine.resolveMultiScreen(..., { writeSequence: true }); without it the view is unchanged.
 * Run with: node src/test/e3lWriteSequence.test.js
 */
'use strict';
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const H = require('./helpers/keywordMatrix');
const { check, failureCount } = require('./helpers/harness');
const { dds } = H;
const F = (o) => dds(Object.assign({ len: 10, type: 'A', use: 'B', line: 3, col: 2 }, o));
const rec = (name, ...rest) => [dds({ t: 'R', name })].concat(rest);
const build = (...records) => DspfParser.parseDspf([].concat(...records).join('\n') + '\n');
const on = (...n) => new Set(n);
const names = (s) => s.fields.map((f) => f.sourceRecord + ':' + f.name).join();
const seq = (m, list, set) => DspfEngine.resolveMultiScreen(m, list, set || on(), 0, { writeSequence: true });

console.log('E3l: OVERLAY');
{
  const m = build(rec('REC1', F({ name: 'A1', line: 1 }), F({ name: 'A2', line: 2 })), rec('REC2', F({ name: 'B1', line: 3 })), rec('REC3', F({ name: 'C1', line: 5 })),
    rec('REC4', F({ name: 'D1', line: 9 })), rec('REC5', dds({ fn: 'OVERLAY' }), F({ name: 'E1', line: 4 }), F({ name: 'E2', line: 5 })));
  const all = ['REC1', 'REC2', 'REC3', 'REC4', 'REC5'];
  const s = seq(m, all);
  // IBM's own example, with REC3 (line 5) overlapped by REC5 (lines 4 and 5)
  check('REC5 (lines 4-5) with OVERLAY deletes REC3 (line 5) and leaves REC1, REC2, REC4', names(s) === 'REC1:A1,REC1:A2,REC2:B1,REC4:D1,REC5:E1,REC5:E2');
  check('the effect is reported', JSON.stringify(s.writeEffects) === '[{"record":"REC5","effect":"OVERLAY","records":["REC3"]}]');
  check('without the write sequence nothing is removed (the comparison view is unchanged)', names(DspfEngine.resolveMultiScreen(m, all, on(), 0)) === 'REC1:A1,REC1:A2,REC2:B1,REC3:C1,REC4:D1,REC5:E1,REC5:E2');
  check('a record with no OVERLAY removes nothing even when it overlaps', names(seq(build(rec('R1', F({ name: 'A1' })), rec('R2', F({ name: 'B1' }))), ['R1', 'R2'])) === 'R1:A1,R2:B1');
  const cond = build(rec('R1', F({ name: 'A1' })), rec('R2', dds({ ind: ' 01', fn: 'OVERLAY' }), F({ name: 'B1' })));
  check('OVERLAY under indicator 01 off: nothing removed', names(seq(cond, ['R1', 'R2'], on())) === 'R1:A1,R2:B1');
  check('OVERLAY under indicator 01 on: the overlapped record is removed', names(seq(cond, ['R1', 'R2'], on('01'))) === 'R2:B1');
  const col = build(rec('R1', F({ name: 'A1', col: 2, len: 5 })), rec('R2', dds({ fn: 'OVERLAY' }), F({ name: 'B1', col: 20, len: 5 })));
  check('same line, different columns: no shared cells, nothing removed', names(seq(col, ['R1', 'R2'])) === 'R1:A1,R2:B1');
  const part = build(rec('R1', F({ name: 'A1', col: 2, len: 10 })), rec('R2', dds({ fn: 'OVERLAY' }), F({ name: 'B1', col: 11, len: 5 })));
  check('a partial overlap (one shared column) removes the whole earlier record', names(seq(part, ['R1', 'R2'])) === 'R2:B1');
  const order = build(rec('R1', dds({ fn: 'OVERLAY' }), F({ name: 'A1' })), rec('R2', F({ name: 'B1' })));
  check('only records written BEFORE act: OVERLAY on the first record removes nothing', names(seq(order, ['R1', 'R2'])) === 'R1:A1,R2:B1');
  const recordOff = build(rec('R1', F({ name: 'A1' })), rec('R2', dds({ ind: ' 02', fn: 'OVERLAY' }), F({ name: 'B1' })));
  const stacked = seq(recordOff, ['R1', 'R2'], on('02'));
  check('the other fields, windows and layers of the survivors are untouched', stacked.fields.length === 1 && stacked.fields[0].sourceRecord === 'R2');
}

console.log('E3l: ERASE');
{
  const m = build(rec('REC1', F({ name: 'A1', line: 1 })), rec('REC2', F({ name: 'B1', line: 3 })), rec('REC3', dds({ fn: 'OVERLAY' }), dds({ fn: 'ERASE(REC1)' }), F({ name: 'C1', line: 9 })));
  const s = seq(m, ['REC1', 'REC2', 'REC3']);
  check('ERASE(REC1) with OVERLAY removes REC1 although REC3 does not overlap it', names(s) === 'REC2:B1,REC3:C1');
  check('reported as ERASE', JSON.stringify(s.writeEffects) === '[{"record":"REC3","effect":"ERASE","records":["REC1"]}]');
  const two = build(rec('R1', F({ name: 'A1', line: 1 })), rec('R2', F({ name: 'B1', line: 3 })), rec('R3', dds({ fn: 'OVERLAY' }), dds({ fn: 'ERASE(R1 R2)' }), F({ name: 'C1', line: 9 })));
  check('several names in one ERASE', names(seq(two, ['R1', 'R2', 'R3'])) === 'R3:C1');
  const twice = build(rec('R1', F({ name: 'A1', line: 1 })), rec('R2', F({ name: 'B1', line: 3 })), rec('R3', dds({ fn: 'OVERLAY' }), dds({ fn: 'ERASE(R1)' }), dds({ fn: 'ERASE(R2)' }), F({ name: 'C1', line: 9 })));
  check('ERASE can be specified more than once', names(seq(twice, ['R1', 'R2', 'R3'])) === 'R3:C1');
  check('a name that is not on the display is ignored', names(seq(build(rec('R1', F({ name: 'A1', line: 1 })), rec('R3', dds({ fn: 'OVERLAY' }), dds({ fn: 'ERASE(NOSUCH)' }), F({ name: 'C1', line: 9 }))), ['R1', 'R3'])) === 'R1:A1,R3:C1');
  const cond = build(rec('R1', F({ name: 'A1', line: 1 })), rec('R3', dds({ fn: 'OVERLAY' }), dds({ ind: ' 05', fn: 'ERASE(R1)' }), F({ name: 'C1', line: 9 })));
  check('ERASE under indicator 05: off keeps R1, on removes it', names(seq(cond, ['R1', 'R3'], on())) === 'R1:A1,R3:C1' && names(seq(cond, ['R1', 'R3'], on('05'))) === 'R3:C1');
  const noOverlay = build(rec('R1', F({ name: 'A1', line: 1 })), rec('R3', dds({ fn: 'ERASE(R1)' }), F({ name: 'C1', line: 9 })));
  check('ERASE without OVERLAY cannot take effect', names(seq(noOverlay, ['R1', 'R3'])) === 'R1:A1,R3:C1');
  const overlayOff = build(rec('R1', F({ name: 'A1', line: 1 })), rec('R3', dds({ ind: ' 01', fn: 'OVERLAY' }), dds({ fn: 'ERASE(R1)' }), F({ name: 'C1', line: 9 })));
  check('OVERLAY conditioned and not selected: ERASE cannot take effect', names(seq(overlayOff, ['R1', 'R3'], on())) === 'R1:A1,R3:C1');
  check('OVERLAY selected: ERASE takes effect', names(seq(overlayOff, ['R1', 'R3'], on('01'))) === 'R3:C1');
}

console.log('E3l: ERASEINP');
{
  const base = (kw) => build(rec('R1', F({ name: 'IN1', line: 3, use: 'B' }), F({ name: 'OUT1', line: 4, use: 'O' }), F({ name: 'IN2', line: 5, use: 'I' }), dds({ line: 7, col: 2, fn: "'Label'" })),
    rec('R2', dds({ fn: 'OVERLAY' }), dds({ fn: kw }), F({ name: 'IN3', line: 20, use: 'B' })));
  const s = seq(base('ERASEINP(*ALL)'), ['R1', 'R2']);
  const kept = s.fields.filter((f) => f.nameType !== 'CONSTANT').map((f) => f.sourceRecord + ':' + f.name).join();
  check('ERASEINP(*ALL): the input-capable fields of the earlier record go; its output field stays, and so does this record\'s own input field', kept === 'R1:OUT1,R2:IN3');
  check('constants are not input fields: the label stays', s.fields.some((f) => f.nameType === 'CONSTANT'));
  check('reported as ERASEINP', JSON.stringify(s.writeEffects) === '[{"record":"R2","effect":"ERASEINP","records":["R1"]}]');
  check('plain ERASEINP (the *MDTON default) erases none: no changed-data tags in a design-time preview', names(seq(base('ERASEINP'), ['R1', 'R2'])).indexOf('R1:IN1') !== -1);
  check('ERASEINP(*MDTON) erases none either', names(seq(base('ERASEINP(*MDTON)'), ['R1', 'R2'])).indexOf('R1:IN2') !== -1);
  const prot = build(rec('R1', F({ name: 'IN1', line: 3 }), dds({ fn: 'DSPATR(PR)' }), F({ name: 'IN2', line: 5 })), rec('R2', dds({ fn: 'OVERLAY' }), dds({ fn: 'ERASEINP(*ALL)' }), F({ name: 'IN3', line: 20 })));
  check('a protected input field (DSPATR(PR)) is not erased', names(seq(prot, ['R1', 'R2'])) === 'R1:IN1,R2:IN3');
  const cond = build(rec('R1', F({ name: 'IN1', line: 3 })), rec('R2', dds({ fn: 'OVERLAY' }), dds({ ind: ' 07', fn: 'ERASEINP(*ALL)' }), F({ name: 'IN3', line: 20 })));
  check('ERASEINP under indicator 07: off keeps the field, on erases it', names(seq(cond, ['R1', 'R2'], on())) === 'R1:IN1,R2:IN3' && names(seq(cond, ['R1', 'R2'], on('07'))) === 'R2:IN3');
  const noOverlay = build(rec('R1', F({ name: 'IN1', line: 3 })), rec('R2', dds({ fn: 'ERASEINP(*ALL)' }), F({ name: 'IN3', line: 20 })));
  check('ERASEINP without OVERLAY cannot take effect', names(seq(noOverlay, ['R1', 'R2'])) === 'R1:IN1,R2:IN3');
}

console.log('E3l: the webview');
const { leaseDspfPage } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');
const L = (o) => buildLine(o);
const src = [
  L({ seq: '00010', nameType: 'R', name: 'REC1' }),
  L({ seq: '00020', name: 'A1', length: '10', dataType: 'A', usage: 'O', line: '2', col: '2' }),
  L({ seq: '00030', nameType: 'R', name: 'REC2' }),
  L({ seq: '00035', func: 'OVERLAY' }),
  L({ seq: '00040', name: 'B1', length: '10', dataType: 'A', usage: 'O', line: '2', col: '4' }),
].join('\n') + '\n';
const dom = leaseDspfPage(src, 'E3L.DSPF');
setTimeout(() => {
  const w = dom.window;
  const doc = w.document;
  const screenFields = () => Array.from(doc.querySelectorAll('.dspf-screen .dspf-field')).map((e) => e.getAttribute('data-field') || e.textContent.trim());
  check('the page opens with REC1 selected', !!doc.querySelector('.dspf-screen'));
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const compare = doc.getElementById('compareModeToggle');
  const overlayBox = doc.getElementById('compareOverlayToggle');
  check('the compare and full-overlay controls exist', !!compare && !!overlayBox);
  if (compare && overlayBox) {
    compare.checked = true; fire(compare, 'change');
    const sel = doc.getElementById('recordSelect');
    sel.value = 'REC2'; fire(sel, 'change');
    const row = Array.from(doc.querySelectorAll('#compareRecordList input[type=checkbox]'))[0];
    check('REC1 is offered in the compare list', !!row && /REC1/.test(row.parentElement.textContent));
    if (row) { row.checked = true; fire(row, 'change'); }
    overlayBox.checked = true; fire(overlayBox, 'change');
    const hint = doc.getElementById('mainHint').textContent || '';
    check('the hint says REC2 OVERLAY removes REC1', /REC2 OVERLAY removes REC1/.test(hint));
    check('only REC2\'s field is drawn', screenFields().length === 1);
    overlayBox.checked = false; fire(overlayBox, 'change');
    check('with full overlay off the dimmed backdrop keeps REC1 (comparison view unchanged)', doc.querySelectorAll('.dspf-screen-backdrop-layer .dspf-field').length === 1);
  }
  if (failureCount() > 0) process.exit(1);
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}, 0);

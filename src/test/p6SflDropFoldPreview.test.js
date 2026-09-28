/**
 * P6 - SFLDROP / SFLFOLD design-time preview (IBM DDS Reference, "SFLDROP"
 * and "SFLFOLD" keyword sections). Pure Node: engine only.
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

// A two-line-per-record subfile (lines 3 and 4), SFLPAG 5, SFLSIZ 20.
function model(ctlLines, opts) {
  opts = opts || {};
  const sizN = opts.sflsiz || '0020';
  const pagN = opts.sflpag || '0005';
  const rowFields = opts.rowFields || [
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    buildLine({ seq: '00102', name: 'ROWDESC', length: '30', dataType: 'A', usage: 'O', line: '4', col: '6' }),
  ];
  const lines = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
  ].concat(rowFields, [
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(' + sizN + ')' }),
    buildLine({ seq: '00202', func: 'SFLPAG(' + pagN + ')' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ], ctlLines);
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const preview = (m, ind, flipped) => DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(ind || []), null, false, 0, flipped).subfilePreview;

console.log('P6: no SFLDROP/SFLFOLD -> no foldDrop state, folded rows exactly as before');
{
  const sfp = preview(model([]));
  check('foldDrop is null', sfp.foldDrop === null);
  check('5 records x 2 lines = 10 fields', sfp.fields.length === 10);
  check('pageRows is SFLPAG', sfp.pageRows === 5);
}

console.log('P6: SFLDROP starts truncated - one line per record, more records than SFLPAG');
{
  const m = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })]);
  const sfp = preview(m);
  check('keyword SFLDROP, key CF03', sfp.foldDrop.keyword === 'SFLDROP' && sfp.foldDrop.key === 'CF03');
  check('initial + current state truncated', sfp.foldDrop.initialState === 'truncated' && sfp.foldDrop.state === 'truncated');
  check('records shown = SFLPAG x lines per record (10)', sfp.pageRows === 10 && sfp.foldDrop.truncatedRows === 10);
  check('only the first-line field of each record is drawn', sfp.fields.length === 10 && sfp.fields.every((f) => f.name === 'ROWNAME'));
  const lines = sfp.fields.map((f) => f.line);
  check('records stack one line apart (3..12)', lines[0] === 3 && lines[9] === 12);
  check('can toggle', sfp.foldDrop.canToggle === true);
}

console.log('P6: pressing the key flips the form (SFLDROP -> folded)');
{
  const m = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })]);
  const sfp = preview(m, [], true);
  check('flipped -> folded', sfp.foldDrop.state === 'folded');
  check('SFLPAG records, two lines each', sfp.pageRows === 5 && sfp.fields.length === 10);
  check('second-line field present again', sfp.fields.some((f) => f.name === 'ROWDESC'));
}

console.log('P6: SFLFOLD starts folded; the key truncates');
{
  const m = model([buildLine({ seq: '00205', func: 'SFLFOLD(CA05)' })]);
  const a = preview(m);
  check('initial folded, unchanged layout', a.foldDrop.state === 'folded' && a.pageRows === 5 && a.fields.length === 10);
  const b = preview(m, [], true);
  check('flipped -> truncated', b.foldDrop.state === 'truncated' && b.pageRows === 10);
}

console.log('P6: both active -> SFLFOLD used; differing keys noted');
{
  const m = model([
    buildLine({ seq: '00205', func: 'SFLDROP(CF03)' }),
    buildLine({ seq: '00206', func: 'SFLFOLD(CF04)' }),
  ]);
  const fd = preview(m).foldDrop;
  check('SFLFOLD wins, starts folded', fd.keyword === 'SFLFOLD' && fd.state === 'folded');
  check('notes mention both keywords and the key mismatch', fd.notes.length === 2 && /same key/.test(fd.notes[1]));
}

console.log('P6: option indicators gate the keyword (indicator preview on/off)');
{
  const m = model([buildLine({ seq: '00205', ind1: '30', func: 'SFLDROP(CF03)' })]);
  check('indicator 30 off -> no state', preview(m, []).foldDrop === null && preview(m, []).pageRows === 5);
  const on = preview(m, ['30']);
  check('indicator 30 on -> truncated', on.foldDrop && on.foldDrop.state === 'truncated' && on.pageRows === 10);
  const m2 = model([
    buildLine({ seq: '00205', ind1: '30', func: 'SFLDROP(CF03)' }),
    buildLine({ seq: '00206', ind1: 'N30', func: 'SFLFOLD(CF03)' }),
  ]);
  check('ind 30 on -> SFLDROP (truncated)', preview(m2, ['30']).foldDrop.state === 'truncated');
  check('ind 30 off -> SFLFOLD (folded)', preview(m2, []).foldDrop.state === 'folded');
}

console.log('P6: ignored when SFLSIZ equals SFLPAG');
{
  const m = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })], { sflsiz: '0005', sflpag: '0005' });
  const sfp = preview(m, [], true);
  check('ignored reason set, cannot toggle', /SFLSIZ equals SFLPAG/.test(sfp.foldDrop.ignoredReason) && sfp.foldDrop.canToggle === false);
  check('drawn folded regardless of flip', sfp.foldDrop.state === 'folded' && sfp.pageRows === 5);
}

console.log('P6: single-line record - nothing to truncate (IBM warns), no toggle');
{
  const m = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })], {
    rowFields: [buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' })],
  });
  const fd = preview(m, [], true).foldDrop;
  check('no effect reason', /fits on one display line/.test(fd.ignoredReason) && !fd.canToggle && fd.state === 'folded');
}

console.log('P6: truncation is bounded by SFLSIZ and by the screen');
{
  const m = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })], { sflsiz: '0008' });
  check('SFLSIZ 8 caps truncated rows at 8', preview(m).pageRows === 8);
  const big = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })], { sflsiz: '0200', sflpag: '0030' });
  const bp = preview(big);
  check('never renders past the 24-line screen', bp.fields.every((f) => f.line <= 24));
}

console.log('P6: field cut by the right edge - output-only clipped, input-capable omitted, all-omitted falls back to folded');
{
  const m = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })], {
    rowFields: [
      buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
      buildLine({ seq: '00102', name: 'WIDEOUT', length: '20', dataType: 'A', usage: 'O', line: '3', col: '75' }),
      buildLine({ seq: '00103', name: 'WIDEIN', length: '20', dataType: 'A', usage: 'B', line: '3', col: '65' }),
      buildLine({ seq: '00104', name: 'ROWDESC', length: '30', dataType: 'A', usage: 'O', line: '4', col: '6' }),
    ],
  });
  const sfp = preview(m);
  const r0 = sfp.fields.filter((f) => f.line === 3);
  const wide = r0.find((f) => f.name === 'WIDEOUT');
  check('output-only field clipped at column 80', wide && wide.column + wide.length - 1 === 80 && wide.length === 6);
  check('input-capable field crossing the edge omitted whole', !r0.some((f) => f.name === 'WIDEIN'));
  check('second-line field dropped', !sfp.fields.some((f) => f.name === 'ROWDESC'));

  const all = model([buildLine({ seq: '00205', func: 'SFLDROP(CF03)' })], {
    rowFields: [
      buildLine({ seq: '00101', name: 'WIDEIN', length: '20', dataType: 'A', usage: 'B', line: '3', col: '70' }),
      buildLine({ seq: '00102', name: 'ROWDESC', length: '30', dataType: 'A', usage: 'O', line: '4', col: '6' }),
    ],
  });
  const fb = preview(all);
  check('whole record would be omitted -> shown folded with a note', fb.foldDrop.state === 'folded' && fb.foldDrop.notes.some((n) => /omit the entire record/.test(n)) && fb.pageRows === 5);
}

console.log('P6: SFLEND scroll bar / More line follow the drawn form');
{
  const m = model([
    buildLine({ seq: '00205', func: 'SFLDROP(CF03)' }),
    buildLine({ seq: '00206', func: 'SFLEND(*SCRBAR *MORE)' }),
  ]);
  const t = preview(m);
  check('truncated: scroll bar spans one line per record', t.scrollbar.height === t.pageRows && t.pageRows === 10);
  check('truncated: More line directly under the last record', t.moreLine.line === 3 + 10);
  const f = preview(m, [], true);
  check('folded: scroll bar spans 5 records x 2 lines', f.scrollbar.height === 10 && f.moreLine.line === 3 + 10);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

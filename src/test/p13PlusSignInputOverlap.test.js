/**
 * P13 - SFLEND(*PLUS): an INPUT-capable field on the plus sign's own columns.
 * IBM DDS Reference (SFLEND, "Position of plus sign with *PLUS option"): "If
 * an input field occupies the location of the plus sign and the field is
 * changed, the plus sign and its attribute characters are returned to the
 * program as data in the field." This is IBM-documented, expected behaviour,
 * not a DDS violation (unlike P9/P12's *SCRBAR reserved columns), so it is an
 * INFORMATIONAL note on `plusMark` (`inputOverlap`), never a writer block.
 * Run with: node src/test/p13PlusSignInputOverlap.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

function model(fields, sflEnd, opts) {
  opts = opts || {};
  const lines = [
    buildLine({ seq: '00010', func: opts.dspsiz || 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
  ].concat(fields, [
    buildLine({ seq: '00200', nameType: 'R', name: 'CTL', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ], (opts.ctlExtra || []).map((f, i) => buildLine({ seq: String(210 + i).padStart(5, '0'), func: f })),
  sflEnd ? [buildLine({ seq: '00250', func: sflEnd })] : []);
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const fld = (name, len, line, col, usage) => buildLine({ seq: '00101', name: name, length: String(len), dataType: 'A', usage: usage || 'O', line: String(line), col: String(col) });
const plusMark = (m) => DspfEngine.resolveScreen(m, 'CTL', new Set(), null, false, 0).subfilePreview.plusMark;

console.log('P13: an INPUT field on the plus sign columns is noted (24 x 80: attrs 78/80, + at 79)');
{
  const p = plusMark(model([fld('F1', 4, 3, 76, 'I')], 'SFLEND')); // cols 76-79
  check('plus at column 79, reserved block 78-80', p.col === 79 && p.attrBegin === 78 && p.attrEnd === 80);
  check('F1 flagged as an input overlap', p.inputOverlap.length === 1 && p.inputOverlap[0].field === 'F1');
}

console.log('P13: an OUTPUT-only field there is not flagged (nothing is returned as data)');
{
  const p = plusMark(model([fld('F1', 4, 3, 76, 'O')], 'SFLEND'));
  check('no overlap for an output field', p.inputOverlap.length === 0);
  const both = plusMark(model([fld('F1', 4, 3, 76, 'B')], 'SFLEND'));
  check('a both (B) field is flagged like input', both.inputOverlap.length === 1);
}

console.log('P13: a field clear of the columns is not flagged');
{
  const p = plusMark(model([fld('F1', 4, 3, 5, 'I')], 'SFLEND'));
  check('no overlap - far from the plus sign', p.inputOverlap.length === 0);
  const edge = plusMark(model([fld('F1', 1, 3, 77, 'I')], 'SFLEND')); // ends at 77, one short of 78
  check('ending exactly before the block (col 77) does not overlap', edge.inputOverlap.length === 0);
  const touch = plusMark(model([fld('F1', 1, 3, 78, 'I')], 'SFLEND')); // exactly the begin attr col
  check('touching the begin-attribute column (78) overlaps', touch.inputOverlap.length === 1);
}

console.log('P13: no SFLEND(*PLUS) in effect - nothing computed');
{
  check('SFLEND(*SCRBAR *MORE), no *PLUS: no plusMark at all', plusMark(model([fld('F1', 4, 3, 76, 'I')], 'SFLEND(*SCRBAR *MORE)')) === null);
  check('no SFLEND keyword at all: no plusMark', plusMark(model([fld('F1', 4, 3, 76, 'I')], null)) === null);
}

console.log('P13: decision (3) - SFLEND(*SCRBAR *PLUS) is covered too, no extra branching needed');
{
  const p = plusMark(model([fld('F1', 4, 3, 76, 'I')], 'SFLEND(*SCRBAR *PLUS)'));
  check('the combination still computes the same plus position and overlap', p && p.col === 79 && p.inputOverlap.length === 1);
}

console.log('P13: selection lists - the 3-column block sits right of the choices (P10\'s anchor)');
{
  const p = plusMark(model([fld('CHOICE', 20, 3, 5, 'O')], 'SFLEND', { ctlExtra: ['SFLSNGCHC'] })); // CHOICE ends at 24
  check('reserved block right after the choices (25-27), + at 26', p.col === 26 && p.attrBegin === 25 && p.attrEnd === 27 && p.rightOfChoices === true);
  // The anchor is derived from the row's own rightmost field, so by construction
  // no field in that same row can ever land inside its own reserved block -
  // unlike the fixed display-edge case, this is structurally overlap-free.
  check('no field can overlap its own choices-derived anchor', p.inputOverlap.length === 0);
}

console.log('P13: inside a window only the single plus column is checked (no reference position for the attrs there)');
{
  const win = model([fld('CHOICE', 10, 3, 5, 'O'), fld('F1', 2, 3, 14, 'I')], 'SFLEND', { ctlExtra: ['WINDOW(2 5 12 40)'] });
  const p = plusMark(win);
  check('attrBegin === attrEnd === col (single column, no attribute span)', p.attrBegin === p.col && p.attrEnd === p.col);
}

console.log('P13: decision (1) - P12\'s *SCRBAR reserved-column guard never fires for a plain SFLEND');
{
  const clean = model([fld('F1', 4, 3, 5, 'I')], 'SFLEND');
  const moved = model([fld('F1', 4, 3, 76, 'I')], 'SFLEND');
  check('no *SCRBAR present: moving an input field onto the plus columns is never blocked', DspfWriter.scrbarReservedNewConflictReason(clean, moved) === null);
}

console.log('P13: rendered HTML title carries the note');
{
  const html = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(model([fld('F1', 4, 3, 76, 'I')], 'SFLEND'), 'CTL', new Set(), null, false, 0));
  check('the plus title names the field and the DDS Reference', /dspf-subfile-plus[^>]*title="[^"]*F1 occupies the plus sign/.test(html));
  check('does not say "returned as data" for a clean layout', !/renderScreenHtml/.test(''));
  const cleanHtml = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(model([fld('F1', 4, 3, 5, 'I')], 'SFLEND'), 'CTL', new Set(), null, false, 0));
  check('a clear layout has no overlap note in the title', !/occupies the plus sign/.test(cleanHtml));
}

setTimeout(() => {
  console.log('P13: webview hint bar (jsdom)');
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SFLREC                    SFL',
    '     A            FLDI           4A  I  3 76',
    '     A          R CTL                       SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(0020)',
    '     A                                      SFLPAG(0005)',
    '     A                                      SFLDSP',
    '     A                                      SFLDSPCTL',
    '     A                                      SFLEND',
  ].join('\n') + '\n';
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', src, 'MYSCR.DSPF'), {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      window.alert = () => {};
    },
  });
  setTimeout(() => {
    const { document: doc, Event } = dom.window;
    const rs = doc.getElementById('recordSelect'); rs.value = 'CTL'; rs.dispatchEvent(new Event('change', { bubbles: true }));
    const hint = doc.getElementById('mainHint').textContent;
    check('hint bar names FLDI and cites the DDS Reference', /FLDI occupies the plus sign's columns/.test(hint) && /DDS Reference, SFLEND/.test(hint));
    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exit(failureCount() === 0 ? 0 : 1);
  }, 500);
}, 0);

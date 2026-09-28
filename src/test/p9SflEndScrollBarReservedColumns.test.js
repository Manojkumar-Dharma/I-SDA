/**
 * P9 - SFLEND(*SCRBAR): positions 77-80 (24x80) / 129-132 (27x132) of every
 * subfile line are reserved for the scroll bar; no subfile field may use them
 * or occupy more than one line (IBM DDS Reference, SFLEND, "Position of the
 * scroll bar with *SCRBAR option"). The preview draws the reserved strip there
 * and warns about fields that collide with it. Windows keep the pre-P9
 * placement (the reference gives no positions there).
 * Run with: node src/test/p9SflEndScrollBarReservedColumns.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

function model(rowFields, ctl, dsp) {
  const lines = [
    buildLine({ seq: '00010', func: dsp || 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
  ].concat(rowFields, [
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ], ctl || [buildLine({ seq: '00205', func: 'SFLEND(*SCRBAR)' })]);
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const fld = (name, len, line, col, usage) => buildLine({ seq: String(101 + Math.floor(Math.random() * 800)).padStart(5, '0'), name: name, length: String(len), dataType: 'A', usage: usage || 'O', line: String(line), col: String(col) });
const sbOf = (m) => DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(), null, false, 0).subfilePreview.scrollbar;

console.log('P9: 24x80 - reserved columns 77-80, independent of where the row sits');
{
  const left = sbOf(model([fld('ROWNAME', 20, 3, 2)]));
  const right = sbOf(model([fld('ROWNAME', 20, 3, 40)]));
  check('col 77, width 4, at the display edge', left.col === 77 && left.width === 4 && left.atDisplayEdge === true);
  check('a right-hand subfile gets the same columns', right.col === 77 && right.width === 4);
  check('starts on the first subfile line and spans SFLPAG rows', left.line === 3 && left.height === 5);
  check('no collisions for a row that ends before column 77', left.collisions.length === 0);
}

console.log('P9: 27x132 - reserved columns 129-132');
{
  const sb = sbOf(model([fld('ROWNAME', 20, 3, 2)], null, 'DSPSIZ(27 132 *DS4)'));
  check('col 129, width 4', sb.col === 129 && sb.width === 4);
}

console.log('P9: a field using the reserved columns is flagged (every way it can touch them)');
{
  const cross = sbOf(model([fld('WIDEFLD', 20, 3, 65)])); // 65-84 crosses 77-80 and the edge
  check('field crossing into 77-80 flagged', cross.collisions.length === 1 && cross.collisions[0].field === 'WIDEFLD' && /77-80/.test(cross.collisions[0].reason));
  const inside = sbOf(model([fld('RIGHTFLD', 4, 3, 77)]));
  check('field sitting exactly on 77-80 flagged', inside.collisions.length === 1);
  const edgeStart = sbOf(model([fld('EDGEFLD', 10, 3, 68)])); // 68-77 touches column 77
  check('field ending on column 77 flagged', edgeStart.collisions.length === 1);
  const justBefore = sbOf(model([fld('OKFLD', 10, 3, 67)])); // 67-76
  check('field ending on column 76 is fine', justBefore.collisions.length === 0);
  const constant = sbOf(model([buildLine({ seq: '00110', line: '3', col: '78', func: "'X'" })]));
  check('a constant on the reserved columns is flagged too', constant.collisions.length === 1);
  check('collision carries line/column for the banner', cross.collisions[0].line === 3 && cross.collisions[0].column === 65);
}

console.log('P9: a field spanning more than one line (CNTFLD) is flagged, even away from columns 77-80');
{
  const m = model([fld('ROWNAME', 20, 3, 2), fld('NOTEFLD', 60, 4, 2, 'B'), buildLine({ seq: '00120', func: 'CNTFLD(20)' })]);
  const sb = sbOf(m);
  const note = sb.collisions.find((c) => c.field === 'NOTEFLD');
  check('continued-entry field flagged as occupying more than one line', !!note && /more than one line/.test(note.reason));
  check('the single-line field next to it is not', !sb.collisions.some((c) => c.field === 'ROWNAME'));
  const plain = sbOf(model([fld('ROWNAME', 20, 3, 2), fld('ROWDESC', 30, 4, 6)]));
  check('a two-line record with single-line fields: no collision', plain.collisions.length === 0);
}

console.log('P9: only the first row template is checked, once (not once per repeated row)');
{
  const cross = sbOf(model([fld('WIDEFLD', 20, 3, 65)]));
  check('5 repeated rows still report one collision', cross.collisions.length === 1);
}

console.log('P9: windowed subfile keeps the pre-P9 placement and is not checked');
{
  const m = model([fld('ROWNAME', 20, 3, 2)], [buildLine({ seq: '00204', func: 'WINDOW(2 5 12 40)' }), buildLine({ seq: '00205', func: 'SFLEND(*SCRBAR)' })]);
  const sb = sbOf(m);
  check('not at the display edge; 3-column strip on the row\'s own right edge', sb.atDisplayEdge === false && sb.width === 3 && sb.col < 77);
  check('no collision check in a window', sb.collisions.length === 0);
}

console.log('P9: rendered strip spans the four reserved columns');
{
  const html = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(model([fld('ROWNAME', 20, 3, 2)]), 'SFLCTLR', new Set(), null, false, 0));
  check('grid-column 77 / span 4', /dspf-subfile-scrollbar" style="grid-row:3 \/ span 5;grid-column:77 \/ span 4;/.test(html));
  check('title states the positions', html.includes('reserves positions 77-80 of every subfile line'));
}

console.log('P9: P7 state / P8 More line still work at the new geometry');
{
  const m = model([fld('ROWNAME', 20, 3, 2)], [buildLine({ seq: '00205', ind1: '49', func: 'SFLEND(*SCRBAR *MORE)' })]);
  const on = DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(['49']), null, false, 0).subfilePreview;
  check('scroll box bottom + Bottom text + More at 67-80', on.scrollbar.boxState === 'bottom' && on.moreLine.text === 'Bottom' && on.moreLine.col === 67 && on.scrollbar.col === 77);
}

setTimeout(() => {
  console.log('P9: webview banner lists the colliding fields (jsdom)');
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SFLREC                    SFL',
    '     A            WIDEFLD       20A  O  3 65',
    '     A          R CTLREC                    SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(0020)',
    '     A                                      SFLPAG(0005)',
    '     A                                      SFLDSP',
    '     A                                      SFLDSPCTL',
    '     A                                      SFLEND(*SCRBAR)',
    '     A          R PLAINREC',
    "     A                                  1  2'PLAIN'",
  ].join('\n') + '\n';
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', src, 'MYSCR.DSPF'), {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      window.alert = () => {};
    },
  });
  setTimeout(() => {
    const { document: doc, Event } = dom.window;
    const select = (name) => { const rs = doc.getElementById('recordSelect'); rs.value = name; rs.dispatchEvent(new Event('change', { bubbles: true })); };
    select('CTLREC');
    const w = doc.getElementById('overlapWarning');
    check('banner visible on the SFLCTL record', !w.classList.contains('hidden'));
    check('banner names the field, its position and the reserved columns', /WIDEFLD/.test(w.textContent) && /line 3, col 65/.test(w.textContent) && /77-80/.test(w.textContent));
    check('hint bar states the reserved positions', doc.getElementById('mainHint').textContent.indexOf('reserves positions 77-80') !== -1);
    select('PLAINREC');
    check('banner hidden again on a record without the conflict', w.classList.contains('hidden'));
    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exit(failureCount() === 0 ? 0 : 1);
  }, 500);
}, 0);

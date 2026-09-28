/**
 * P10 - SFLEND on selection-list subfiles (SFLSNGCHC / SFLMLTCHC): IBM DDS
 * Reference, SFLEND: "For selection lists, the plus will be positioned to the
 * right of the choices for the list" - likewise the More/Bottom text and the
 * scroll bar. The reference gives no column numbers, so the anchor is a design
 * call: the first column after the choice field's last column.
 * Run with: node src/test/p10SflEndSelectionList.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

function model(rowFields, ctlKeywords) {
  const lines = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
  ].concat(rowFields, [
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ], ctlKeywords.map((kw, i) => buildLine(Object.assign({ seq: String(250 + i).padStart(5, '0') }, typeof kw === 'string' ? { func: kw } : kw))));
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const fld = (name, len, line, col) => buildLine({ seq: '00101', name: name, length: String(len), dataType: 'A', usage: 'O', line: String(line), col: String(col) });
const prev = (m, ind) => DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(ind || []), null, false, 0).subfilePreview;
const ROW = () => [fld('CHOICE', 20, 3, 5)]; // columns 5-24

console.log('P10: single-choice list - scroll bar goes right of the choices');
{
  const p = prev(model(ROW(), ['SFLSNGCHC', 'SFLEND(*SCRBAR)']));
  const sb = p.scrollbar;
  check('detected as a single-choice selection list', p.selectionList && p.selectionList.kind === 'single');
  check('bar starts at column 25 (first column after the choice), 4 wide', sb.col === 25 && sb.width === 4);
  check('flagged rightOfChoices, not at the display edge', sb.rightOfChoices === true && sb.atDisplayEdge === false);
  check('no reserved-column collisions (the bar is beyond the choices)', sb.collisions.length === 0);
  check('spans the subfile rows from the first line', sb.line === 3 && sb.height === 5);
  check('fits the 80-column display', sb.fitsDisplay === true);
}

console.log('P10: multiple-choice list behaves the same');
{
  const p = prev(model(ROW(), ['SFLMLTCHC', 'SFLEND(*SCRBAR)']));
  check('detected as multiple', p.selectionList && p.selectionList.kind === 'multiple');
  check('bar at 25-28', p.scrollbar.col === 25 && p.scrollbar.width === 4 && p.scrollbar.rightOfChoices);
}

console.log('P10: More/Bottom text goes right of the choices (same 14 positions as P8)');
{
  const m = model(ROW(), ['SFLSNGCHC', { ind1: '49', func: 'SFLEND(*MORE)' }]);
  const off = prev(m).moreLine;
  check('block starts at 25, 14 wide, attribute characters at both ends', off.col === 25 && off.width === 14 && off.textCol === 26 && off.textWidth === 12);
  check('flagged rightOfChoices, not at the display edge', off.rightOfChoices === true && off.atDisplayEdge === false);
  check('still on the line after the subfile', off.line === 8);
  check('indicator off -> More...', off.text === 'More...');
  check('indicator on -> Bottom, same position', prev(m, ['49']).moreLine.text === 'Bottom' && prev(m, ['49']).moreLine.col === 25);
}

console.log('P10: plus sign follows the last choice');
{
  const p = prev(model(ROW(), ['SFLSNGCHC', 'SFLEND']));
  check('plus on the last subfile line, attribute at 25, "+" at 26', p.plusMark && p.plusMark.line === 7 && p.plusMark.col === 26 && p.plusMark.rightOfChoices === true);
}

console.log('P10: a plain subfile keeps the P7/P8/P9 placement');
{
  const p = prev(model(ROW(), ['SFLEND(*SCRBAR *MORE)']));
  check('no selection list', p.selectionList === null);
  check('bar at 77-80, More at 67-80', p.scrollbar.col === 77 && p.moreLine.col === 67 && p.scrollbar.rightOfChoices === false && p.moreLine.rightOfChoices === false);
  const plus = prev(model(ROW(), ['SFLEND']));
  check('plus at column 79', plus.plusMark.col === 79 && plus.plusMark.rightOfChoices === false);
}

console.log('P10: the selection-list keyword must be ACTIVE');
{
  const m = model(ROW(), [{ ind1: '50', func: 'SFLSNGCHC' }, 'SFLEND(*SCRBAR)']);
  check('indicator 50 off -> plain subfile placement', prev(m).scrollbar.col === 77);
  check('indicator 50 on -> right of the choices', prev(m, ['50']).scrollbar.col === 25);
}

console.log('P10: window - the choice anchor applies there too');
{
  const m = model(ROW(), ['WINDOW(2 5 12 40)', 'SFLSNGCHC', 'SFLEND(*SCRBAR *MORE)']);
  const p = prev(m);
  check('bar and More sit after the choices', p.scrollbar.rightOfChoices && p.scrollbar.col === p.moreLine.col && p.scrollbar.col > 5);
}

console.log('P10: choices too wide - elements would run off the display');
{
  const p = prev(model([fld('WIDE', 20, 3, 59)], ['SFLSNGCHC', 'SFLEND(*SCRBAR *MORE)'])); // 59-78
  check('bar 79-82 exceeds 80 columns -> fitsDisplay false', p.scrollbar.col === 79 && p.scrollbar.fitsDisplay === false);
  check('More block 79-92 likewise', p.moreLine.fitsDisplay === false);
  const ok = prev(model(ROW(), ['SFLSNGCHC', 'SFLEND(*SCRBAR *MORE)']));
  check('narrow choices fit', ok.scrollbar.fitsDisplay === true && ok.moreLine.fitsDisplay === true);
}

console.log('P10: rendered HTML');
{
  const html = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(model(ROW(), ['SFLSNGCHC', 'SFLEND(*SCRBAR *MORE)']), 'SFLCTLR', new Set(), null, false, 0));
  check('scroll bar grid-column 25 / span 4', /dspf-subfile-scrollbar" style="grid-row:3 \/ span 5;grid-column:25 \/ span 4;/.test(html));
  check('scroll bar title says right of the selection-list choices', html.includes('to the right of the selection-list choices'));
  check('More line title says right of the choices', /dspf-subfile-more-line[^>]*right of the selection-list choices/.test(html));
}

setTimeout(() => {
  console.log('P10: webview hint bar (jsdom)');
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SFLREC                    SFL',
    '     A            CHOICE        20A  O  3  5',
    '     A          R CTLREC                    SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(0020)',
    '     A                                      SFLPAG(0005)',
    '     A                                      SFLSNGCHC',
    '     A                                      SFLDSP',
    '     A                                      SFLDSPCTL',
    '     A                                      SFLEND(*SCRBAR)',
  ].join('\n') + '\n';
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', src, 'MYSCR.DSPF'), {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      window.alert = () => {};
    },
  });
  setTimeout(() => {
    const { document: doc, Event } = dom.window;
    const rs = doc.getElementById('recordSelect'); rs.value = 'CTLREC'; rs.dispatchEvent(new Event('change', { bubbles: true }));
    const hint = doc.getElementById('mainHint').textContent;
    check('hint says the scroll bar sits right of the selection-list choices, 25-28', /right of the selection-list choices, positions 25-28/.test(hint));
    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exit(failureCount() === 0 ? 0 : 1);
  }, 500);
}, 0);

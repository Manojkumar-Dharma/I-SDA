/**
 * e5dScreenText.test.js
 *
 * E5d - the plain-text dump (src/screenText.js): a resolved screen as a block of characters, one per cell.
 *   A. the block: size from the screen (80x24, 132x27), every row written, trimmed or padded, the header, the ruler, input checks.
 *   B. fields: position, clipping to the grid, blanks that do not erase, multi-line fields, hidden fields, control characters, stacking.
 *   C. the rest of the screen: windows (box, dashed, title, *CHAR border), pull-down, menu-bar separator, ERRMSG, subfile preview.
 *   D. the legend: the display-attribute plane, the colour plane, the cursor, the window list, the "none" cases.
 *   E. drift guard: the engine's own screens, and E5b's picture of the same screens, record by record and indicator set by indicator set:
 *      every character of the dump is on the cell where the picture draws it, the ruler is the picture's ruler, the colour letters are
 *      the engine's COLOR_HEX, and the attribute digits agree with the picture's own classes.
 *
 * Pure Node (jsdom only to read the SVG of E5b). Run with: node src/test/e5dScreenText.test.js   (needs `npm run compile`)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const T = require(path.join(__dirname, '../../dist/screenText.js'));
const X = require(path.join(__dirname, '../../dist/screenExport.js'));
const DspfEngine = require(path.join(__dirname, '../../dist/dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));

const M = X.METRICS;
const parseSvg = (svg) => new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;

function screen(fields, extra) {
  return Object.assign({ lines: 24, columns: 80, recordName: 'REC1', fields: fields }, extra || {});
}
function field(over) {
  const style = Object.assign({ color: null, hi: false, reverse: false, underline: false, blink: false, hidden: false, protect: false, positionCursor: false }, (over && over.style) || {});
  return Object.assign({ name: '', nameType: 'CONSTANT', usage: null, dataType: null, line: 2, column: 5, length: 10, height: 1, text: 'HELLO', widget: null, cntfld: null, tag: null }, over, { style });
}
const rowsOf = (s, opts) => T.buildText(s, opts).split('\n');
/** The character at a cell of a plain dump (no ruler, no header). */
const at = (rows, line, col) => (rows[line - 1] || '').charAt(col - 1) || ' ';
const run = (s, opts) => rowsOf(s, opts).slice(0, -1);

// ---- A. the block ----------------------------------------------------------------------------------------------------
console.log('A: the block');
{
  const s = screen([field({})]);
  const text = T.buildText(s);
  const rows = text.split('\n');
  check('A: a text ending in one newline, with exactly `lines` rows (80x24)', text.endsWith('\n') && rows.length === 25 && rows[23] === '' && rows[24] === '');
  check('A: the field is on its cell and nothing else is on the screen', rows[1] === '    HELLO' && rows.filter((r, i) => i !== 1 && i < 24 && r !== '').length === 0);
  const wide = run(screen([], { lines: 27, columns: 132 }));
  check('A: a 132x27 screen has 27 rows', wide.length === 27);
  const padded = run(screen([field({})]), { pad: true });
  check('A: pad keeps every row `columns` wide', padded.length === 24 && padded.every((r) => r.length === 80) && padded[1].startsWith('    HELLO '));
  const wideP = run(screen([], { lines: 27, columns: 132 }), { pad: true });
  check('A: pad on a 132x27 screen is 132 wide', wideP.length === 27 && wideP.every((r) => r.length === 132));
  check('A: rows are trimmed of trailing blanks by default', run(s).every((r) => r === r.replace(/ +$/, '')));
  const h = rowsOf(s, { header: true });
  check('A: the header names the record and the size, then a blank line', h[0] === 'Screen preview: REC1 (24 x 80)' && h[1] === '' && h[2] === '' && h[3] === '    HELLO');
  check('A: a title option replaces the record name in the header', rowsOf(s, { header: true, title: 'MINE' })[0] === 'Screen preview: MINE (24 x 80)');
  const r = run(s, { ruler: true });
  check('A: the ruler is two rows (tens, ones) and a two-digit line number in front of every row', r.length === 26 && r[0].trim().startsWith('1') && /^ {3}1234567890/.test(r[1]) && r[2] === '01' && r[3] === '02     HELLO' && r[25] === '24');
  check('A: the ruler gives the same columns as the designer: a tens digit at columns 10, 20, ...', r[0].charAt(3 + 9) === '1' && r[0].charAt(3 + 19) === '2' && r[0].charAt(3 + 79) === '8' && r[1].charAt(3 + 79) === '0');
  const bad = [undefined, null, 'x', 5].map((v) => { try { T.buildText(v); return false; } catch (e) { return e instanceof TypeError; } });
  check('A: a screen that is not an object is a TypeError', bad.every(Boolean));
  check('A: a screen with no fields is an empty block', run(screen([])).every((x) => x === '') && run(screen([])).length === 24);
  let range = false;
  try { T.buildText(screen([], { lines: 24, columns: 100000 })); } catch (e) { range = e instanceof RangeError; }
  check('A: a size that is not a display size is a RangeError, not a huge string', range);
  check('A: missing lines and columns fall back to 24 x 80', run({ fields: [] }).length === 24);
}

// ---- B. fields -------------------------------------------------------------------------------------------------------
console.log('\nB: fields');
{
  const r1 = run(screen([field({ line: 1, column: 1, text: 'TOP' }), field({ line: 24, column: 78, length: 3, text: 'END' })]));
  check('B: line 1 column 1 and the last cell are addressable', at(r1, 1, 1) === 'T' && r1[23] === ' '.repeat(77) + 'END');
  const clip = run(screen([field({ line: 3, column: 77, length: 10, text: 'ABCDEFGHIJ' })]));
  check('B: a field that runs past column 80 is cut there (as on the terminal)', clip[2] === ' '.repeat(76) + 'ABCD');
  const off = run(screen([field({ line: 25, column: 1, text: 'GONE' }), field({ line: 0, column: 1, text: 'GONE' }), field({ line: 1, column: 81, text: 'GONE' })]));
  check('B: fields outside the grid are not drawn', off.every((x) => x === ''));
  const cutLen = run(screen([field({ length: 3, text: 'ABCDEFG' })]));
  check('B: the text is cut to the field length', cutLen[1] === '    ABC');
  const blanks = run(screen([field({ line: 2, column: 1, length: 8, text: 'AAAAAAAA' }), field({ line: 2, column: 1, length: 8, text: 'B  B' })]));
  check('B: blanks in a field do not erase what is under them (only a stacked record does)', blanks[1] === 'BAAB' + 'AAAA');
  const stacked = run(screen([field({ line: 2, column: 1, length: 8, text: 'AAAAAAAA' }), field({ line: 2, column: 1, length: 8, text: 'B  B' })], { stacked: true }));
  check('B: in a stacked screen a field first clears its cells (P14)', stacked[1] === 'B  B');
  const multi = run(screen([field({ line: 2, column: 3, length: 4, height: 3, text: 'one\ntwo\nthree\nfour' })]));
  check('B: a multi-line field puts each row on its own line and no more than `height`', multi[1] === '  one' && multi[2] === '  two' && multi[3] === '  thre' && multi[4] === '');
  const hidden = run(screen([field({ text: 'SECRET', style: { hidden: true } })]));
  check('B: a hidden field (ND) is left out', hidden.every((x) => x === ''));
  const ctrl = run(screen([field({ length: 20, text: 'A\u001b[31mB\u0007\u0000C\tD\u0085E' })]));
  check('B: control characters become blanks (no escape sequence survives)', ctrl[1] === '    A [31mB  C D E');
  check('B: the dump has no control characters at all', !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(T.buildText(screen([field({ length: 12, text: 'A\u001b[31mB\u0007\u0000C\tD' })]))));
  const astral = run(screen([field({ length: 6, text: 'A\ud83d\ude00B' })]));
  check('B: a character outside the BMP takes one cell', astral[1] === '    A\ud83d\ude00B');
  const order = run(screen([field({ line: 2, column: 1, length: 3, text: 'AAA', stackLayer: 5 }), field({ line: 2, column: 1, length: 3, text: 'BBB', stackLayer: 1 })]));
  check('B: a field of a higher stack layer is painted over one of a lower layer', order[1] === 'AAA');
  const rev = run(screen([field({ line: 2, column: 1, length: 6, text: 'AB', style: { reverse: true } })]), { legend: true });
  check('B: a reverse-image field keeps its text; its blanks are painted (legend)', rev[1] === 'AB' && rev.indexOf('Display attributes: one hex digit per cell, the sum of 1 = HI, 2 = RI, 4 = UL (also the input underline), 8 = BL; . = none') > 0);
}

// ---- C. the rest of the screen ---------------------------------------------------------------------------------------
console.log('\nC: windows, pull-down, separators, messages, subfile');
{
  const win = (over) => Object.assign({ line: 3, col: 5, width: 12, height: 4, recordName: 'WIN', title: '', border: { color: null, attrs: [], chars: [] }, positionIsDefault: false, previewStart: false, inheritedFrom: null, stackLayer: 0 }, over || {});
  const w1 = run(screen([field({ line: 4, column: 6, length: 8, text: 'under', stackLayer: 0 }), field({ line: 4, column: 6, length: 4, text: 'IN', stackLayer: 3 })], { windows: [win({ stackLayer: 1 })] }));
  check('C: a window is a box: corners and edges on the box cells, the record name in the top edge', w1[2] === '    \u250c\u2500 WIN \u2500\u2500\u2500\u2500\u2510', w1[2]);
  check('C: its inside is cleared before the fields are drawn (the field under it is gone, the one in it stays)', !/under/.test(w1.join('\n')) && w1[3] === '    \u2502IN        \u2502');
  check('C: the bottom edge closes the box', w1[5] === '    \u2514' + '\u2500'.repeat(10) + '\u2518');
  const wa = run(screen([], { windows: [win({ recordName: '', title: '' })] }), { ascii: true });
  check('C: ascii mode uses + - |', wa[2] === '    +' + '-'.repeat(10) + '+' && wa[3] === '    |' + ' '.repeat(10) + '|' && wa[5] === '    +' + '-'.repeat(10) + '+');
  const wd = run(screen([], { windows: [win({ recordName: '', positionIsDefault: true })] }), { ascii: true });
  check('C: a window whose position is set at runtime has a dashed border (the flag itself is in the legend)', wd[2] === '    +' + '.'.repeat(10) + '+' && wd[3] === '    :' + ' '.repeat(10) + ':');
  const wt = run(screen([], { windows: [win({ recordName: 'WINREC', title: 'Hello', width: 30 })] }), { ascii: true });
  check('C: the title sits on the top edge with a blank on each side, record name first', wt[2].indexOf('+- WINREC - Hello -') === 4, wt[2]);
  const wshort = run(screen([], { windows: [win({ recordName: 'WINREC', width: 7 })] }));
  check('C: a window too narrow for a title has none, and the box is intact', wshort[2] === '    \u250c' + '\u2500'.repeat(5) + '\u2510');
  const wlong = run(screen([], { windows: [win({ recordName: 'A'.repeat(40), width: 20 })] }), { ascii: true });
  check('C: a long title is cut to leave the corners and one edge cell either side', wlong[2].length === 4 + 20 && wlong[2].endsWith('-+'));
  const wc = run(screen([], { windows: [win({ border: { color: null, attrs: [], chars: ['1', '2', '3', '4', '5', '6', '7', '8'] } })] }));
  check('C: WDWBORDER *CHAR: the eight characters, corners then top/bottom then left/right', wc[2] === '    1' + '2'.repeat(10) + '3' && wc[3] === '    4' + ' '.repeat(10) + '5' && wc[5] === '    6' + '7'.repeat(10) + '8');
  const wcl = run(screen([field({ line: 4, column: 6, length: 8, text: 'under', stackLayer: 0 })], { windows: [win({ stackLayer: 1, border: { color: null, attrs: [], chars: ['+', '-', '+', '|', '|', '+', '-', '+'] } })] }));
  check('C: a *CHAR window still clears its inside, and has no title chip', !/under/.test(wcl.join('\n')) && wcl[2] === '    +' + '-'.repeat(10) + '+');
  const wedge = run(screen([], { windows: [win({ line: 22, col: 75, width: 12, height: 6, recordName: '' })] }), { ascii: true });
  check('C: a window that runs off the grid is cut at the edge', wedge[21] === ' '.repeat(74) + '+-----' && wedge[23] === ' '.repeat(74) + '|');
  const layers = run(screen([field({ line: 4, column: 6, length: 6, text: 'LOW', stackLayer: 0 })], { windows: [win({ stackLayer: 1 })] }));
  check('C: a window of a higher stack layer is painted over a field of a lower one', !/LOW/.test(layers.join('\n')));

  const pd = run(screen([], { pulldown: { box: { line: 2, col: 3, width: 8, height: 4 }, fields: [field({ line: 3, column: 4, length: 6, text: 'Item 1' })] } }), { ascii: true });
  check('C: a pull-down is a box with its fields inside', pd[1] === '  +------+' && pd[2] === '  |Item 1|' && pd[4] === '  +------+');
  const sep = run(screen([], { menuBarSeparators: [{ line: 2, width: 10, char: '-', color: '#4a9eff', attrs: [] }] }));
  check('C: a menu-bar separator repeats its character across its width', sep[1] === '-'.repeat(10));
  const sepRi = run(screen([], { menuBarSeparators: [{ line: 2, width: 4, char: '=', color: null, attrs: ['RI', 'HI'] }] }), { legend: true });
  check('C: a separator with RI and HI is marked 3 in the attribute plane', sepRi[sepRi.findIndex((x) => x.startsWith('Display attributes:')) + 2] === '3333');
  const em = run(screen([], { errorMessages: [{ line: 23, col: 2, width: 10, text: 'Not valid and long', unresolved: false }] }));
  check('C: an ERRMSG line is its text cut to its width', em[22] === ' Not valid');
  const sfp = run(screen([], { subfilePreview: { fields: [field({ line: 5, column: 3, length: 4, text: 'ROW1' })], moreLine: { line: 22, textCol: 60, textWidth: 10, text: 'More...' }, plusMark: { line: 21, col: 79 }, scrollbar: { line: 5, col: 80, width: 1, height: 10, boxState: 'top' } } }), { ascii: true });
  check('C: subfile preview: its fields, the More... line right-aligned in its span, the + mark', sfp[4].startsWith('  ROW1') && sfp[21] === ' '.repeat(62) + 'More...' && sfp[20] === ' '.repeat(78) + '+');
  check('C: subfile scroll bar: arrow, track with the thumb at the box state, arrow', sfp[4].charAt(79) === '^' && sfp[13].charAt(79) === 'v' && sfp[5].charAt(79) === '#' && sfp[12].charAt(79) === ':');
  const sfb = run(screen([], { subfilePreview: { fields: [], scrollbar: { line: 5, col: 80, width: 1, height: 10, boxState: 'bottom' } } }), { ascii: true });
  check('C: the thumb is at the bottom when the box state says so', sfb[12].charAt(79) === '#' && sfb[5].charAt(79) === ':');
  const sfu = run(screen([], { subfilePreview: { fields: [], scrollbar: { line: 5, col: 80, width: 1, height: 10, boxState: 'top' } } }));
  check('C: the default scroll bar uses block characters', sfu[4].charAt(79) === '\u25b2' && sfu[5].charAt(79) === '\u2588' && sfu[12].charAt(79) === '\u2591');
  const tiny = run(screen([], { subfilePreview: { fields: [], scrollbar: { line: 5, col: 80, width: 1, height: 2, boxState: 'top' } } }), { ascii: true });
  check('C: a scroll bar of two rows is just its arrows', tiny[4].charAt(79) === '^' && tiny[5].charAt(79) === 'v');
}

// ---- D. the legend ---------------------------------------------------------------------------------------------------
console.log('\nD: the legend');
{
  const s = screen([
    field({ line: 2, column: 2, length: 6, text: 'PLAIN' }),
    field({ line: 3, column: 2, length: 6, text: 'HI', style: { hi: true } }),
    field({ line: 4, column: 2, length: 6, text: 'RI', style: { reverse: true, color: '#ff5c5c' } }),
    field({ line: 5, column: 2, length: 6, text: 'UL', style: { underline: true, color: '#4a9eff' } }),
    field({ line: 6, column: 2, length: 6, text: 'BL', style: { blink: true } }),
    field({ line: 7, column: 2, length: 6, text: 'ALL', style: { hi: true, reverse: true, underline: true, blink: true } }),
    field({ line: 8, column: 2, length: 6, text: '', nameType: 'FIELD', usage: 'B', dataType: 'A', name: 'INP' }),
    field({ line: 9, column: 2, length: 6, text: 'OUT', nameType: 'FIELD', usage: 'O', dataType: 'A', name: 'OUT' }),
    field({ line: 10, column: 2, length: 6, text: 'ODD', style: { color: '#123456' } })
  ]);
  const out = run(s, { legend: true });
  const i = out.indexOf('Legend');
  check('D: the legend follows the grid after one blank line', i === 25 && out[24] === '');
  const aHead = out.findIndex((x) => x.startsWith('Display attributes:'));
  const plane = (head, from) => out.slice(from + 1, from + 25);
  const a = plane('Display attributes', aHead);
  check('D: attribute plane: plain text is ., HI 1, RI 2, UL 4, BL 8, all four F', a[1].startsWith(' ......') === false && a[1].slice(1, 6) === '.....' && a[2].slice(1, 3) === '11' && a[3].slice(1, 7) === '222222' && a[4].slice(1, 3) === '44' && a[5].slice(1, 3) === '88' && a[6].slice(1, 4) === 'FFF', a.slice(0, 8).join('|'));
  check('D: the input underline of an I/B field counts as UL (4) over its length; an output field has none', a[7].slice(1, 7) === '444444' && a[8].slice(1, 4) === '...');
  check('D: the plane has a row per line and cells with nothing in them stay blank', a.length === 24 && a[0] === '' && a[22] === '');
  const cHead = out.findIndex((x) => x.startsWith('Colours:'));
  const c = plane('Colours', cHead);
  check('D: the colour key names only the letters in use, with the DDS names', /^Colours: one letter per cell \(B = BLU blue, R = RED red, \* = a colour that is not a DDS COLOR value\); \. = the screen colour$/.test(out[cHead]), out[cHead]);
  check('D: colour plane: R, B, . for no colour, * for a colour that is not a DDS one', c[3].slice(1, 7) === 'RRRRRR' && c[4].slice(1, 3) === 'BB' && c[1].slice(1, 6) === '.....' && c[9].slice(1, 4) === '***');
  const plain = run(screen([field({})]), { legend: true });
  check('D: with no attributes and no colours the legend says so instead of printing empty planes', plain.indexOf('Display attributes: none (no high intensity, reverse image, underline or blink on this screen)') > 0 && plain.indexOf('Colours: none (every field uses the screen colour)') > 0 && plain.length === 24 + 1 + 3);
  const withRuler = run(s, { legend: true, ruler: true });
  check('D: the planes carry the ruler and line numbers when the grid does', withRuler.filter((x) => /^ {3}1234567890/.test(x)).length === 3);

  const cur = run(screen([field({ line: 5, column: 7, length: 4, text: 'AB', style: { positionCursor: true }, showCursorIndicator: true })], { cursor: { line: 9, col: 12 } }), { legend: true });
  check('D: the cursor is named: a DSPATR(PC) field and a CSRLOC position', cur.indexOf('Cursor: line 5, column 7 (DSPATR(PC))') > 0 && cur.indexOf('Cursor: line 9, column 12 (CSRLOC)') > 0);
  const winLegend = run(screen([], { windows: [{ line: 3, col: 5, width: 20, height: 5, recordName: 'WIN', title: 'Pick one', positionIsDefault: true, inheritedFrom: 'OTHER', border: { color: '#ff5c5c', attrs: ['HI'], chars: ['+', '-', '+', '|', '|', '+', '-', '+'] }, stackLayer: 0 }] }), { legend: true });
  check('D: a window is listed with its place, size, title, flags and border characters', winLegend.indexOf('Window WIN: line 3, column 5, 20 x 5; title Pick one; position set at runtime; window shared with OTHER; border characters (WDWBORDER *CHAR)') > 0);
  const winPlane = winLegend.slice(winLegend.findIndex((x) => x.startsWith('Display attributes:')) + 1);
  check('D: a window border with HI and a COLOR is HI in the attribute plane and its letter in the colour plane', winPlane[2].slice(4, 9) === '1' + '1111' && winLegend.some((x) => x.startsWith('Colours: one letter per cell (R = RED red)')));
  check('D: a legend is only added when asked for', run(s).indexOf('Legend') === -1);
}

// ---- E. drift guard --------------------------------------------------------------------------------------------------
console.log('\nE: the same screen as the engine and the picture draw it');
{
  const source = [
    L({ func: 'DSPSIZ(24 80 *DS3)' }),
    L({ nameType: 'R', name: 'MAIN' }),
    L({ line: 1, col: 2, func: "'Plain constant'" }),
    L({ line: 2, col: 2, func: "'Yellow'" }), L({ func: 'COLOR(YLW)' }),
    L({ line: 3, col: 2, func: "'High'" }), L({ func: 'DSPATR(HI)' }),
    L({ line: 4, col: 2, func: "'Reverse red'" }), L({ func: 'COLOR(RED)' }), L({ func: 'DSPATR(RI)' }),
    L({ line: 5, col: 2, func: "'Underline'" }), L({ func: 'DSPATR(UL)' }),
    L({ line: 6, col: 2, func: "'Blink'" }), L({ func: 'DSPATR(BL)' }),
    L({ name: 'INP', length: 10, dataType: 'A', usage: 'B', line: 8, col: 5 }),
    L({ name: 'OUT', length: 10, dataType: 'A', usage: 'O', line: 9, col: 5 }),
    L({ name: 'NUM', length: 7, dataType: 'S', decimals: 2, usage: 'B', line: 10, col: 5 }), L({ func: 'COLOR(TRQ)' }),
    L({ name: 'PROT', length: 10, dataType: 'A', usage: 'B', line: 11, col: 5 }), L({ func: 'DSPATR(PR)' }),
    L({ name: 'CUR', length: 10, dataType: 'A', usage: 'B', line: 12, col: 5 }), L({ func: 'DSPATR(PC)' }),
    L({ line: 14, col: 2, func: "'Reverse when 10'" }), L({ ind1: '10', func: 'DSPATR(RI)' }),
    L({ line: 15, col: 2, func: "'Hidden when 11'" }), L({ ind1: '11', func: 'DSPATR(ND)' }),
    L({ nameType: 'R', name: 'SECOND' }),
    L({ line: 20, col: 30, func: "'Second record'" }), L({ func: 'COLOR(PNK)' })
  ].join('\n') + '\n';
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/compile/testdsp.dds'), 'utf8');
  const sample = fs.readFileSync(path.join(__dirname, '../fixtures/sample.dspf'), 'utf8');

  // The picture's text, per cell: every <text> in a field group, a menu-bar separator, a message line or a *CHAR border.
  function pictureCells(svg) {
    const doc = parseSvg(svg);
    const out = new Map();
    Array.from(doc.querySelectorAll('g.dspf-field text, g.dspf-menubar-sep text, g.dspf-window-msgline text, g.dspf-window-chars text')).forEach((t) => {
      const x = Number(t.getAttribute('x')), y = Number(t.getAttribute('y'));
      const col = Math.round((x - M.padding) / M.cellWidth) + 1, line = Math.round((y - M.baseline - M.padding) / M.cellHeight) + 1;
      Array.from(t.textContent.replace(/\u00a0/g, ' ')).forEach((ch, k) => { if (ch !== ' ') out.set(line + ':' + (col + k), ch); });
    });
    return out;
  }
  const dumpCells = (rows, columns) => {
    const out = new Map();
    rows.forEach((row, l) => Array.from(row).forEach((ch, c) => { if (ch !== ' ' && c < columns) out.set((l + 1) + ':' + (c + 1), ch); }));
    return out;
  };

  let screens = 0, cellsCompared = 0, problems = [];
  const sets = [new Set(), new Set(['10']), new Set(['11']), new Set(['10', '11']), new Set(['01', '02'])];
  [['corpus', source], ['testdsp.dds', fixture], ['sample.dspf', sample]].forEach(([label, src]) => {
    const model = DspfParser.parseDspf(src);
    model.records.forEach((rec) => {
      sets.forEach((ind) => {
        const s = DspfEngine.resolveScreen(model, rec.name, ind);
        if (!s || !s.fields) return;
        screens++;
        const where = label + ' ' + rec.name + ' ind=' + Array.from(ind).join('+');
        const dump = T.buildText(s).split('\n').slice(0, s.lines);
        const dumpMap = dumpCells(dump, s.columns);
        const pic = pictureCells(X.buildSvg(s));
        const isClean = !(s.windows && s.windows.length) && !s.window && !s.stacked && !s.pulldown;
        // soundness: everything in the dump is where the picture has it; completeness (for screens with no window, stacking or pull-down,
        // where nothing is painted over anything else): everything the picture has inside the grid is in the dump
        dumpMap.forEach((ch, key) => { cellsCompared++; if (pic.get(key) !== ch && !(s.subfilePreview)) problems.push(where + ': dump has "' + ch + '" at ' + key + ', picture ' + JSON.stringify(pic.get(key))); });
        if (isClean && !s.subfilePreview) pic.forEach((ch, key) => {
          const [l, c] = key.split(':').map(Number);
          if (l >= 1 && l <= s.lines && c >= 1 && c <= s.columns && dumpMap.get(key) !== ch) problems.push(where + ': picture has "' + ch + '" at ' + key + ', dump ' + JSON.stringify(dumpMap.get(key)));
        });
        // attribute digits against the picture's own classes: a cell of a field with HI is odd in the digit when it has text
        const legend = T.buildText(s, { legend: true }).split('\n');
        const head = legend.findIndex((x) => x.startsWith('Display attributes: one hex digit'));
        const hasHi = s.fields.some((f) => f.style && f.style.hi && !f.style.hidden && f.text && String(f.text).trim());
        const hasRi = s.fields.some((f) => f.style && f.style.reverse && !f.style.hidden && f.length >= 1);
        const planeText = head < 0 ? '' : legend.slice(head + 1, head + 1 + s.lines).join('');
        if (hasHi && head < 0) problems.push(where + ': a HI field and no attribute plane');
        if (hasRi && head < 0) problems.push(where + ': a RI field and no attribute plane');
        if (!hasHi && !hasRi && head >= 0 && !s.fields.some((f) => f.style && (f.style.underline || f.style.blink) || (f.nameType === 'FIELD' && /^[IB]$/i.test(String(f.usage || '')))) && !(s.windows && s.windows.length) && /[1-9A-F]/.test(planeText)) problems.push(where + ': attribute digits with no attribute on any field');
      });
    });
  });
  problems.slice(0, 8).forEach((p) => console.log('    ' + p));
  check('E: dump and picture agree on every character of every record under five indicator sets (' + screens + ' screens, ' + cellsCompared + ' cells)', problems.length === 0 && screens >= 20 && cellsCompared > 200);

  const model = DspfParser.parseDspf(source);
  const on = DspfEngine.resolveScreen(model, 'MAIN', new Set(['10', '11']));
  const off = DspfEngine.resolveScreen(model, 'MAIN', new Set());
  const dOn = run(on), dOff = run(off);
  check('E: the indicator state is the engine\'s: an ND condition removes the text from the dump', /Hidden when 11/.test(dOff.join('\n')) && !/Hidden when 11/.test(dOn.join('\n')));
  const lg = run(on, { legend: true });
  const aHead = lg.findIndex((x) => x.startsWith('Display attributes:'));
  const cHead = lg.findIndex((x) => x.startsWith('Colours:'));
  const attrRow = (n) => lg[aHead + n];
  const colRow = (n) => lg[cHead + n];
  check('E: the corpus rules show in the planes: HI on line 3, RI on line 4, UL on line 5, BL on line 6, and the condition on line 14', attrRow(3).slice(1, 5) === '1111' && attrRow(4).slice(1, 4) === '222' && attrRow(5).slice(1, 4) === '444' && attrRow(6).slice(1, 4) === '888' && attrRow(14).slice(1, 4) === '222', [3, 4, 5, 6, 14].map(attrRow).join('|'));
  check('E: the colours show in the colour plane: YLW, RED, TRQ', colRow(2).slice(1, 4) === 'YYY' && colRow(4).slice(1, 4) === 'RRR' && colRow(10).slice(4, 11) === 'TTTTTTT', [2, 4, 10].map(colRow).join('|'));
  check('E: the input underline of INP (line 8) is UL over its 10 cells; the output field has none', attrRow(8).slice(4, 14) === '4444444444' && !/4/.test(attrRow(9)), attrRow(8) + '|' + attrRow(9));

  // the colour letters are the engine's own seven colours (COLOR_HEX in dspfEngine.js)
  const engineSrc = fs.readFileSync(path.join(__dirname, '../dspfEngine.js'), 'utf8');
  const hexTable = {};
  /(var COLOR_HEX = \{[^}]*\})/.exec(engineSrc)[1].replace(/(\w{3}): '(#[0-9a-f]{6})'/gi, (m, name, hex) => { hexTable[name] = hex.toLowerCase(); return m; });
  const names = { BLU: 'B', RED: 'R', GRN: 'G', TRQ: 'T', YLW: 'Y', PNK: 'P', WHT: 'W' };
  check('E: the seven colour letters are the engine\'s COLOR_HEX values (BLU RED GRN TRQ YLW PNK WHT), and no other', Object.keys(hexTable).length === 7 && Object.keys(hexTable).every((k) => T.colorLetter(hexTable[k]) === names[k]) && Object.keys(T.COLOR_LETTERS).length === 7);
  check('E: colorLetter: none is ., an unknown colour is *, case does not matter', T.colorLetter(null) === '.' && T.colorLetter('') === '.' && T.colorLetter('#123456') === '*' && T.colorLetter('#FF5C5C') === 'R');

  // the ruler is the picture's ruler
  const ruled = X.buildSvg(on, { ruler: true });
  const rulerTexts = Array.from(parseSvg(ruled).querySelectorAll('g.dspf-ruler text')).map((t) => t.textContent.replace(/\u00a0/g, ' '));
  const rr = run(on, { ruler: true, pad: true });
  check('E: the ruler\'s tens row, ones row and line numbers are the picture\'s', rr[0].slice(3) === rulerTexts[0] && rr[1].slice(3) === rulerTexts[1] && rulerTexts.slice(2).every((t, i) => rr[2 + i].slice(0, 2) === t), rr[0] + '|' + rulerTexts[0]);

  const src = fs.readFileSync(path.join(__dirname, '../screenText.js'), 'utf8');
  check('E: the module does not import vscode, a DOM or the engine (it runs in Node and in the webview)', !/require\(['"]vscode['"]\)/.test(src) && !/\bdocument\b|\bwindow\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) && !/require\(['"]\.\/dspfEngine/.test(src));
  const pkgText = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
  check('E: the module is copied to dist by build:webview-assets', /'screenText\.js'[,\]]/.test(pkgText));
}

process.exit(failureCount() ? 1 : 0);

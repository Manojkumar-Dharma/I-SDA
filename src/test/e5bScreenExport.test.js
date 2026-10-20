/**
 * e5bScreenExport.test.js
 *
 * E5b - the export serialiser (src/screenExport.js): a resolved screen as a standalone SVG or HTML document.
 *   A. the document: well-formed XML, size from the screen, ruler, clip, the HTML wrapper (no script, no remote asset), input checks.
 *   B. fields: position on the cell grid, blanks, escaping, clipping, colour, theme, HI / RI / UL / PR / BL, input underline, hidden, the PC cursor.
 *   C. the rest of the screen: stacking and z-order, windows (box and *CHAR border, title), pull-down, menu-bar separator, ERRMSG line,
 *      subfile preview (More..., +, scroll bar), the CSRLOC cursor.
 *   D. drift guard: the engine's own HTML (renderScreenHtml) and this serialiser, on real parsed DDS, record by record and indicator set by
 *      indicator set: the same fields in the same order with the same classes, on the same cells, in the same colours.
 *
 * Pure Node (jsdom only to parse the output strictly as XML / HTML). Run with: node src/test/e5bScreenExport.test.js   (needs `npm run compile`)
 */
'use strict';
const path = require('path');
const { JSDOM } = require('jsdom');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const X = require(path.join(__dirname, '../../dist/screenExport.js'));
const DspfEngine = require(path.join(__dirname, '../../dist/dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const fs = require('fs');

const M = X.METRICS;
const parseSvg = (svg) => new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
const parseHtml = (html) => new JSDOM(html).window.document;
const NBSP = '\u00a0';

/** A resolved-screen stand-in with the fields the serialiser reads. */
function screen(fields, extra) {
  return Object.assign({ lines: 24, columns: 80, recordName: 'REC1', fields: fields }, extra || {});
}
function field(over) {
  return Object.assign({ name: '', nameType: 'CONSTANT', usage: null, dataType: null, line: 2, column: 5, length: 10, height: 1, text: 'HELLO',
    style: { color: null, hi: false, reverse: false, underline: false, blink: false, hidden: false, protect: false, positionCursor: false }, widget: null, cntfld: null, tag: null }, over, { style: Object.assign({ color: null, hi: false, reverse: false, underline: false, blink: false, hidden: false, protect: false, positionCursor: false }, (over && over.style) || {}) });
}
const texts = (doc) => Array.from(doc.querySelectorAll('text'));
const fieldG = (doc) => Array.from(doc.querySelectorAll('g.dspf-field'));
const cellX = (col, ruler) => M.padding + (ruler ? M.rulerColumns * M.cellWidth : 0) + (col - 1) * M.cellWidth;
const cellY = (line, ruler) => M.padding + (ruler ? M.rulerRows * M.cellHeight : 0) + (line - 1) * M.cellHeight;

// ---- A. the document -----------------------------------------------------------------------------------------------
console.log('A: the document');
{
  const s = screen([field({})]);
  const svg = X.buildSvg(s);
  const doc = parseSvg(svg);
  const root = doc.documentElement;
  check('A: well-formed XML with the SVG namespace', root.localName === 'svg' && root.namespaceURI === 'http://www.w3.org/2000/svg');
  check('A: size is the 80x24 grid plus the padding on every side', root.getAttribute('width') === String(80 * M.cellWidth + 2 * M.padding) && root.getAttribute('height') === String(24 * M.cellHeight + 2 * M.padding) && root.getAttribute('viewBox') === '0 0 ' + root.getAttribute('width') + ' ' + root.getAttribute('height'));
  const wide = X.buildSvg(screen([], { lines: 27, columns: 132 }));
  check('A: a 132x27 screen is sized from its own lines and columns', parseSvg(wide).documentElement.getAttribute('width') === String(132 * M.cellWidth + 2 * M.padding) && parseSvg(wide).documentElement.getAttribute('height') === String(27 * M.cellHeight + 2 * M.padding));
  check('A: the font is the preview stack, with a generic monospace last, and no remote font', /^'IBM Plex Mono', .*, monospace$/.test(root.getAttribute('font-family')) && root.getAttribute('font-family') === X.FONT_STACK && !/@font-face|@import|url\(http/i.test(svg));
  check('A: nothing is loaded from anywhere (no http reference except the namespace, no <image>, no <script>)', svg.replace('http://www.w3.org/2000/svg', '').indexOf('http') === -1 && !/<image|<script|<foreignObject/i.test(svg));
  const bg = doc.querySelector('svg > rect');
  check('A: the background is the screen frame colour', bg && bg.getAttribute('fill') === '#050705');
  const clip = doc.querySelector('clipPath rect');
  check('A: everything is clipped to the DSPSIZ grid (what is off the terminal is not on the picture)', clip && clip.getAttribute('width') === String(80 * M.cellWidth) && clip.getAttribute('height') === String(24 * M.cellHeight) && !!doc.querySelector('g[clip-path]'));
  check('A: it has a title and an aria-label naming the record', doc.querySelector('title').textContent === 'Screen preview: REC1' && root.getAttribute('aria-label') === 'Screen preview: REC1' && root.getAttribute('role') === 'img');
  check('A: a title option replaces the record name, and is escaped', /Screen preview: A &amp; &lt;B&gt;/.test(X.buildSvg(s, { title: 'A & <B>' })));
  check('A: no ruler by default', !doc.querySelector('g.dspf-ruler'));

  const ruled = parseSvg(X.buildSvg(s, { ruler: true }));
  const r = ruled.documentElement;
  check('A: the ruler adds a gutter on the left and two rows on top', r.getAttribute('width') === String(80 * M.cellWidth + 2 * M.padding + M.rulerColumns * M.cellWidth) && r.getAttribute('height') === String(24 * M.cellHeight + 2 * M.padding + M.rulerRows * M.cellHeight));
  const rt = Array.from(ruled.querySelectorAll('g.dspf-ruler text')).map((t) => t.textContent.replace(/\u00a0/g, ' '));
  check('A: the ruler is the designer\'s own: a tens row, a ones row, and 24 two-digit line numbers', rt[0].length === 80 && rt[0].charAt(9) === '1' && rt[0].charAt(79) === '8' && rt[1] === '1234567890'.repeat(8) && rt.length === 2 + 24 && rt[2] === '01' && rt[25] === '24');
  check('A: with the ruler, a field moves by the gutter so it still sits on its cell', Number(texts(ruled).find((t) => t.textContent === 'HELLO').getAttribute('x')) === cellX(5, true));
  check('A: the ruler is the same text the engine gives the designer', DspfEngine.renderRulerColumnsHtml(80).split('\n')[1] === rt[1] && DspfEngine.renderRulerRowsHtml(24).split('\n')[8] === rt[10]);

  const html = X.buildHtml(s, { title: 'MYSCR' });
  const hdoc = parseHtml(html);
  check('A: the HTML is a page: doctype, utf-8, title, one inline SVG', /^<!DOCTYPE html>/.test(html) && hdoc.querySelector('meta[charset]') && hdoc.title === 'Screen preview: MYSCR' && hdoc.querySelectorAll('svg').length === 1);
  check('A: the HTML has no script, no link, no remote asset', !/<script|<link|<iframe|<img/i.test(html) && html.replace('http://www.w3.org/2000/svg', '').indexOf('http') === -1);
  check('A: the HTML is the very same drawing as the SVG (one drawing, two wrappers)', html.indexOf(X.buildSvg(s, { title: 'MYSCR' })) > 0);
  check('A: the page background is the screen\'s', /background:#050705/.test(html));
  check('A: ids are prefixed (several drawings in one page do not collide) and the prefix is sanitised', /id="shot1-screen"/.test(X.buildSvg(s, { idPrefix: 'shot1' })) && /id="x-screen"/.test(X.buildSvg(s, { idPrefix: 'x"<>' })));
  let threw = null;
  try { X.buildSvg(null); } catch (e) { threw = e; }
  check('A: no screen is a TypeError, not a half-built string', threw instanceof TypeError);
  check('A: an error screen (record not found: no fields) is an empty screen, not a failure', parseSvg(X.buildSvg({ lines: 24, columns: 80, recordName: 'X', fields: [], error: 'Record not found: X' })).querySelectorAll('g.dspf-field').length === 0);
  check('A: a screen with junk sizes falls back to 80x24 and junk fields are skipped', parseSvg(X.buildSvg({ lines: 'a', columns: NaN, fields: [{ line: 'x' }, null, { line: 1, column: 1, length: 0, text: 'Z' }] })).documentElement.getAttribute('width') === String(80 * M.cellWidth + 2 * M.padding));
}

// ---- B. fields ------------------------------------------------------------------------------------------------------
console.log('\nB: fields');
{
  const doc = parseSvg(X.buildSvg(screen([field({ line: 3, column: 7, length: 8, text: 'AB' })])));
  const t = texts(doc).find((x) => x.textContent === 'AB');
  check('B: a text run sits at its cell: x from the column, y one baseline below the top of its line', Number(t.getAttribute('x')) === cellX(7) && Number(t.getAttribute('y')) === cellY(3) + M.baseline);
  check('B: and is pinned to its cells (textLength = characters x cell width, spacing only), so a fallback font cannot move the layout', t.getAttribute('textLength') === String(2 * M.cellWidth) && t.getAttribute('lengthAdjust') === 'spacing');

  const blanks = parseSvg(X.buildSvg(screen([field({ column: 10, length: 14, text: '  A  B  ' })])));
  const bt = texts(blanks)[0];
  check('B: leading blanks become position, trailing blanks nothing; inner blanks are non-breaking so no renderer collapses them', Number(bt.getAttribute('x')) === cellX(12) && bt.textContent === 'A' + NBSP + NBSP + 'B' && bt.getAttribute('textLength') === String(4 * M.cellWidth));
  check('B: an all-blank field draws no text', texts(parseSvg(X.buildSvg(screen([field({ text: '     ' })])))).length === 0);
  check('B: text longer than the field is cut at the field length', texts(parseSvg(X.buildSvg(screen([field({ length: 3, text: 'ABCDEFG' })]))))[0].textContent === 'ABC');
  check('B: markup in a constant is escaped, not interpreted', parseSvg(X.buildSvg(screen([field({ length: 20, text: '<b>&"\'x</b>' })]))).querySelector('text').textContent === '<b>&"\'x</b>' && !/<b>/.test(X.buildSvg(screen([field({ length: 20, text: '<b>x</b>' })]))));
  check('B: control characters that are not legal in XML are dropped, the document stays parseable', (() => { try { parseSvg(X.buildSvg(screen([field({ text: 'A\u0001B\u001fC' })]))); return true; } catch (e) { return false; } })());
  const multi = texts(parseSvg(X.buildSvg(screen([field({ line: 4, column: 3, length: 6, height: 2, text: 'ONE\nTWO' })]))));
  check('B: a field of height 2 draws its second line one row down', multi.length === 2 && Number(multi[1].getAttribute('y')) === cellY(5) + M.baseline && multi[1].textContent === 'TWO');

  const fillOf = (f, opts) => parseSvg(X.buildSvg(screen([f]), opts)).querySelector('g.dspf-field text').getAttribute('fill');
  check('B: no COLOR: the theme accent (classic green)', fillOf(field({})) === '#33ff66');
  check('B: a COLOR keyword keeps its own colour whatever the theme', fillOf(field({ style: { color: '#4a9eff' } }), { theme: { accent: '#ffb347' } }) === '#4a9eff');
  check('B: the theme accent is the default colour: hex, short hex and the rgb() a webview reports', fillOf(field({}), { theme: { accent: '#ffb347' } }) === '#ffb347' && fillOf(field({}), { theme: { accent: '#fb4' } }) === '#ffbb44' && fillOf(field({}), { theme: { accent: 'rgb(51, 217, 255)' } }) === '#33d9ff');
  check('B: a theme value that is not a colour is ignored, never written out', fillOf(field({}), { theme: { accent: 'red;" onload="x' } }) === '#33ff66' && X.buildSvg(screen([field({})]), { theme: { accent: '"><script>' } }).indexOf('<script') === -1);
  check('B: the background follows the theme too', /<rect width="\d+" height="\d+" fill="#101010"/.test(X.buildSvg(screen([]), { theme: { background: '#101010' } })));

  const hi = parseSvg(X.buildSvg(screen([field({ style: { hi: true, color: '#808080' } })])));
  const hit = hi.querySelector('g.dspf-field text');
  check('B: HI is the preview\'s brightness(1.6) and a heavier weight', hit.getAttribute('fill') === '#cdcdcd' && hit.getAttribute('font-weight') === '600' && X.brighten('#808080', 1.6) === '#cdcdcd' && X.brighten('#ffffff', 1.6) === '#ffffff' && X.brighten('#0a0a0a', 1.6) === '#101010');

  const ri = parseSvg(X.buildSvg(screen([field({ line: 6, column: 4, length: 10, style: { reverse: true, color: '#ff5c5c' } })])));
  const rr = ri.querySelector('g.dspf-field rect');
  check('B: RI paints the field\'s colour over its cells and the screen colour on the text', rr && rr.getAttribute('fill') === '#ff5c5c' && Number(rr.getAttribute('x')) === cellX(4) && Number(rr.getAttribute('width')) === 10 * M.cellWidth && Number(rr.getAttribute('height')) === M.cellHeight && ri.querySelector('g.dspf-field text').getAttribute('fill') === '#050705');

  const ul = parseSvg(X.buildSvg(screen([field({ length: 10, style: { underline: true } })])));
  const ull = ul.querySelector('g.dspf-field line');
  check('B: UL draws a line under all the field\'s cells, as a line (not text-decoration, which renderers draw differently)', ull && Number(ull.getAttribute('x1')) === cellX(5) && Number(ull.getAttribute('x2')) === cellX(15) && Number(ull.getAttribute('y1')) === cellY(2) + M.underlineOffset + 0.5);
  const usage = (u, nameType) => parseSvg(X.buildSvg(screen([field({ nameType: nameType || 'FIELD', usage: u, dataType: 'A', text: 'XXXX' })]))).querySelectorAll('g.dspf-field line').length;
  check('B: an input (I) or both (B) field is underlined like the 5250 input marker; output (O) and constants are not', usage('I') === 1 && usage('B') === 1 && usage('O') === 0 && usage('B', 'CONSTANT') === 0);
  check('B: PR (protect) is the preview\'s 0.65 opacity', parseSvg(X.buildSvg(screen([field({ style: { protect: true } })]))).querySelector('g.dspf-field').getAttribute('opacity') === '0.65');
  const bl = X.buildSvg(screen([field({ style: { blink: true } })]));
  check('B: BL is not animated in a still image (no animate, no CSS animation), the class says it was there', !/<animate|animation|@keyframes/.test(bl) && /dspf-blink/.test(bl));
  check('B: ND (hidden) is not drawn at all', fieldG(parseSvg(X.buildSvg(screen([field({ style: { hidden: true } })])))).length === 0);
  const pc = parseSvg(X.buildSvg(screen([field({ line: 8, column: 12, style: { color: '#33ff66' }, showCursorIndicator: true })])));
  const pcr = Array.from(pc.querySelectorAll('g.dspf-field rect')).pop();
  check('B: the DSPATR(PC) field has a solid block on its first cell, the field\'s own colour', pcr && Number(pcr.getAttribute('x')) === cellX(12) && Number(pcr.getAttribute('width')) === M.cellWidth && pcr.getAttribute('fill') === '#33ff66');
  check('B: a widget is drawn as its text, with its class', (() => { const g = fieldG(parseSvg(X.buildSvg(screen([field({ text: '( ) Yes', widget: { type: 'radio' } })]))))[0]; return g && /dspf-widget-radio/.test(g.getAttribute('class')); })());
}

// ---- C. the rest of the screen ---------------------------------------------------------------------------------------
console.log('\nC: windows, stacking and the rest');
{
  // stacking
  const st = parseSvg(X.buildSvg(screen([
    field({ line: 5, column: 5, length: 6, text: 'LATER', stackLayer: 2 }),
    field({ line: 5, column: 5, length: 6, text: 'EARLY', stackLayer: 1 })
  ], { stacked: true })));
  const order = Array.from(st.querySelectorAll('g.dspf-field text')).map((x) => x.textContent);
  check('C: stacked records are painted by layer, not by list order', order.join() === 'EARLY,LATER');
  check('C: in a stacked screen every field first paints the screen colour under its cells, so a later record overwrites an earlier one', st.querySelectorAll('g.dspf-field > rect').length === 2 && st.querySelector('g.dspf-field > rect').getAttribute('fill') === '#050705');
  const inWin = parseSvg(X.buildSvg(screen([field({ inWindow: true })], { stacked: true })));
  check('C: a field of a windowed record paints the window\'s colour', inWin.querySelector('g.dspf-field > rect').getAttribute('fill') === '#0a0f0c');
  check('C: a screen that is not stacked paints no backing under its fields', parseSvg(X.buildSvg(screen([field({})]))).querySelectorAll('g.dspf-field > rect').length === 0);

  // windows
  const win = { recordName: 'WINREC', title: 'Pick one', line: 4, col: 10, height: 6, width: 30, positionIsDefault: false, border: { color: null, attrs: [], chars: ['', '', '', '', '', '', '', ''] } };
  const wdoc = parseSvg(X.buildSvg(screen([field({ line: 5, column: 12, text: 'IN WINDOW', stackLayer: 1, inWindow: true })], { window: win, stacked: true })));
  const box = wdoc.querySelector('g.dspf-window-border rect[stroke]');
  check('C: a window is a box on its cells: window colour inside, the preview\'s 2px border', box && Number(box.getAttribute('x')) === cellX(10) && Number(box.getAttribute('y')) === cellY(4) && Number(box.getAttribute('width')) === 30 * M.cellWidth && Number(box.getAttribute('height')) === 6 * M.cellHeight && box.getAttribute('fill') === '#0a0f0c' && box.getAttribute('stroke') === '#3a5a45' && box.getAttribute('stroke-width') === '2');
  check('C: it carries the preview\'s offset shadow', !!wdoc.querySelector('g.dspf-window-border rect[fill-opacity="0.5"]'));
  check('C: and its title chip: record name and title', Array.from(wdoc.querySelectorAll('g.dspf-window-border text')).some((x) => /WINREC.*Pick.one/.test(x.textContent)));
  const winOrder = Array.from(wdoc.querySelectorAll('svg > g[clip-path] > g')).map((g) => g.getAttribute('class').split(' ')[0]);
  check('C: the window is painted before the fields inside it', winOrder.indexOf('dspf-window-border') === 0 && winOrder.indexOf('dspf-field') > 0);
  const wDefault = parseSvg(X.buildSvg(screen([], { window: Object.assign({}, win, { positionIsDefault: true }) }))).querySelector('g.dspf-window-border rect[stroke]');
  check('C: a window whose position is set at runtime has the dashed warning border', wDefault.getAttribute('stroke') === '#ff8a5c' && wDefault.getAttribute('stroke-dasharray') === '6 4');
  check('C: WDWBORDER colour wins over that, and HI makes the border 3px', (() => { const b = parseSvg(X.buildSvg(screen([], { window: Object.assign({}, win, { positionIsDefault: true, border: { color: '#4de6e0', attrs: ['HI'], chars: [] } }) }))).querySelector('g.dspf-window-border rect[stroke]'); return b.getAttribute('stroke') === '#4de6e0' && b.getAttribute('stroke-width') === '3'; })());
  const cwin = Object.assign({}, win, { height: 4, width: 5, title: '', recordName: '', border: { color: null, attrs: [], chars: ['1', '2', '3', '4', '5', '6', '7', '8'] } });
  const cdoc = parseSvg(X.buildSvg(screen([], { window: cwin })));
  const cch = Array.from(cdoc.querySelectorAll('g.dspf-window-chars text')).map((x) => ({ c: x.textContent, x: Number(x.getAttribute('x')), y: Number(x.getAttribute('y')) - M.baseline }));
  const at = (col, line) => (cch.find((e) => e.x === cellX(col) && e.y === cellY(line)) || {}).c;
  check('C: a *CHAR border has no box edge, and puts its eight characters on the corners and edges', !cdoc.querySelector('g.dspf-window-border rect[stroke]') && at(10, 4) === '1' && at(14, 4) === '3' && at(10, 7) === '6' && at(14, 7) === '8' && at(11, 4) === '2' && at(13, 7) === '7' && at(10, 5) === '4' && at(14, 6) === '5' && cch.length === 4 + 3 + 3 + 2 + 2);
  check('C: and draws them in the dim ink colour, or the WDWBORDER colour', cdoc.querySelector('g.dspf-window-chars text').getAttribute('fill') === '#6f8c7d' && parseSvg(X.buildSvg(screen([], { window: Object.assign({}, cwin, { border: { color: '#ff5c5c', attrs: [], chars: ['1', '', '', '', '', '', '', ''] } }) }))).querySelector('g.dspf-window-chars text').getAttribute('fill') === '#ff5c5c');
  check('C: a window list (several records on one screen) draws every window', parseSvg(X.buildSvg(screen([], { windows: [win, Object.assign({}, win, { line: 12 })] }))).querySelectorAll('g.dspf-window-border').length === 2);

  // pull-down, separator, error message, cursor
  const pd = parseSvg(X.buildSvg(screen([], { pulldown: { box: { line: 3, col: 5, height: 4, width: 12 }, fields: [field({ line: 4, column: 6, text: 'Open', tag: 'pulldown' })] } })));
  check('C: a pull-down is a box with its fields above it', !!pd.querySelector('g.dspf-pulldown-border rect') && (() => { const o = Array.from(pd.querySelectorAll('svg > g[clip-path] > g')).map((g) => g.getAttribute('class').split(' ')[0]); return o.indexOf('dspf-pulldown-border') < o.indexOf('dspf-field'); })());
  const sep = parseSvg(X.buildSvg(screen([], { menuBarSeparators: [{ line: 2, width: 80, char: '-', color: '#4de6e0', attrs: ['UL'] }] })));
  check('C: a menu-bar separator is its character across the screen, in its colour, underlined when asked', sep.querySelector('g.dspf-menubar-sep text').textContent === '-'.repeat(80) && sep.querySelector('g.dspf-menubar-sep text').getAttribute('fill') === '#4de6e0' && sep.querySelectorAll('g.dspf-menubar-sep line').length === 1);
  const em = parseSvg(X.buildSvg(screen([], { errorMessages: [{ line: 23, col: 2, width: 40, text: 'Name is required', inWindow: false }] })));
  check('C: an ERRMSG line is warning-coloured text on a tinted band', em.querySelector('g.dspf-window-msgline text').textContent.replace(/\u00a0/g, ' ') === 'Name is required' && em.querySelector('g.dspf-window-msgline text').getAttribute('fill') === '#ff8a5c' && em.querySelector('g.dspf-window-msgline rect').getAttribute('fill-opacity') === '0.1');
  const cur = parseSvg(X.buildSvg(screen([], { cursor: { line: 7, col: 9 } }))).querySelector('g.dspf-csrloc-cursor rect');
  check('C: the CSRLOC cursor is a block on its cell', cur && Number(cur.getAttribute('x')) === cellX(9) && Number(cur.getAttribute('y')) === cellY(7));

  // subfile preview
  const sfp = parseSvg(X.buildSvg(screen([], { subfilePreview: {
    fields: [field({ line: 8, column: 3, text: 'ROW1' })],
    scrollbar: { line: 6, col: 79, height: 10, width: 2, boxState: 'bottom' },
    moreLine: { line: 16, col: 67, textCol: 67, textWidth: 14, text: 'More...' },
    plusMark: { line: 15, col: 76 } } })));
  check('C: a subfile preview draws its rows, its "More..." line right-aligned in its span, the + mark and the scroll bar',
    texts(sfp).some((x) => x.textContent === 'ROW1') &&
    Number(texts(sfp).find((x) => x.textContent === 'More...').getAttribute('x')) === cellX(67 + 14 - 7) &&
    texts(sfp).some((x) => x.textContent === '+' && Number(x.getAttribute('x')) === cellX(76)) &&
    !!sfp.querySelector('g.dspf-subfile-scrollbar') && sfp.querySelectorAll('g.dspf-subfile-scrollbar rect').length === 3);
}

// ---- D. drift guard against the engine ---------------------------------------------------------------------------------
console.log('\nD: the same screen as the engine draws it');
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

  let compared = 0, fieldsCompared = 0, problems = [];
  // the engine keys indicators by their two-character number, as strings
  const sets = [new Set(), new Set(['10']), new Set(['11']), new Set(['10', '11']), new Set(['01', '02'])];
  [['corpus', source], ['testdsp.dds', fixture], ['sample.dspf', sample]].forEach(([label, src]) => {
    const model = DspfParser.parseDspf(src);
    model.records.forEach((rec) => {
      sets.forEach((ind) => {
        const screenObj = DspfEngine.resolveScreen(model, rec.name, ind);
        if (!screenObj || !screenObj.fields) return;
        const engineDoc = parseHtml(DspfEngine.renderScreenHtml(screenObj));
        const engineFields = Array.from(engineDoc.querySelectorAll('.dspf-field'));
        const svgDoc = parseSvg(X.buildSvg(screenObj));
        const ours = fieldG(svgDoc);
        // A field with nothing to paint (blank text, no underline, no reverse, no cursor) has an element in the engine's HTML and none here.
        const paints = (f) => !(f.style && f.style.hidden) && ((f.text && String(f.text).trim()) || (f.style && (f.style.underline || f.style.reverse)) || f.showCursorIndicator || (f.nameType === 'FIELD' && /^[IB]$/i.test(f.usage || '')));
        const engineAll = engineFields;
        const keep = screenObj.fields.map(paints);
        compared++;
        const where = label + ' ' + rec.name + ' ind=' + Array.from(ind).join('+');
        const engineKept = engineAll.filter((e, i) => keep[i]);
        const fieldsKept = screenObj.fields.filter((f, i) => keep[i]);
        if (engineAll.length !== screenObj.fields.length) { problems.push(where + ': the engine HTML has ' + engineAll.length + ' fields for ' + screenObj.fields.length + ' resolved'); return; }
        if (ours.length !== engineKept.length) { problems.push(where + ': ' + ours.length + ' drawn, ' + engineKept.length + ' expected from the engine\'s HTML'); return; }
        engineKept.forEach((ef, i) => {
          fieldsCompared++;
          const eClasses = ef.getAttribute('class').split(/\s+/).filter((c) => !/^dspf-choice-/.test(c)).join(' ');
          const oClasses = ours[i].getAttribute('class');
          if (eClasses !== oClasses) problems.push(where + ' #' + i + ': classes "' + oClasses + '" vs engine "' + eClasses + '"');
          const style = ef.getAttribute('style') || '';
          const row = /grid-row:(\d+)/.exec(style), col = /grid-column:(\d+) \/ span (\d+)/.exec(style);
          const first = ours[i].querySelector('text');
          const f = fieldsKept[i];
          if (first && f.text && f.text.trim()) {
            const lead = f.text.length - f.text.replace(/^ +/, '').length;
            if (Number(first.getAttribute('y')) !== cellY(Number(row[1])) + M.baseline || Number(first.getAttribute('x')) !== cellX(Number(col[1]) + lead)) problems.push(where + ' #' + i + ': drawn off its cell (engine row ' + row[1] + ' col ' + col[1] + ')');
          }
          const fg = /--dspf-fg:([^;]+)/.exec(style);
          const hi = /dspf-hi/.test(eClasses), ri = /dspf-reverse/.test(eClasses);
          if (first && !hi && !ri && fg && first.getAttribute('fill') !== fg[1]) problems.push(where + ' #' + i + ': colour ' + first.getAttribute('fill') + ' vs engine ' + fg[1]);
          if (first && !fg && !hi && !ri && !/dspf-choice/.test(ef.getAttribute('class')) && first.getAttribute('fill') !== X.DEFAULT_THEME.accent) problems.push(where + ' #' + i + ': default colour ' + first.getAttribute('fill'));
        });
      });
    });
  });
  problems.slice(0, 8).forEach((p) => console.log('    ' + p));
  check('D: engine and serialiser agree on every field of every record under five indicator sets (' + compared + ' screens, ' + fieldsCompared + ' fields): same order, same classes, same cell, same colour', problems.length === 0 && compared >= 15 && fieldsCompared > 60);
  const model = DspfParser.parseDspf(source);
  const on = DspfEngine.resolveScreen(model, 'MAIN', new Set(['10', '11']));
  const off = DspfEngine.resolveScreen(model, 'MAIN', new Set());
  const g = (s) => fieldG(parseSvg(X.buildSvg(s))).map((e) => e.getAttribute('class'));
  check('D: the corpus does exercise the rules: HI, RI, UL, BL, PR, PC, input/output fields and a condition that turns RI on', ['dspf-hi', 'dspf-reverse', 'dspf-underline', 'dspf-blink', 'dspf-protect', 'dspf-cursor-pos', 'dspf-usage-b', 'dspf-usage-o'].every((c) => g(on).some((x) => x.split(' ').includes(c))) && g(on).filter((x) => /dspf-reverse/.test(x)).length === g(off).filter((x) => /dspf-reverse/.test(x)).length + 1);
  check('D: the indicator state is the engine\'s: an ND condition drops the field from the picture exactly when it drops it from the preview', g(on).length === g(off).length - 1 && texts(parseSvg(X.buildSvg(on))).every((t) => !/Hidden when 11/.test(t.textContent)) && texts(parseSvg(X.buildSvg(off))).some((t) => /Hidden/.test(t.textContent.replace(/\u00a0/g, ' '))));
  const noVscode = !/require\(['"]vscode['"]\)/.test(fs.readFileSync(path.join(__dirname, '../screenExport.js'), 'utf8'));
  check('D: the module does not import vscode (it runs in Node and in the webview)', noVscode);
  const pkgText = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
  check('D: the module is copied to dist by build:webview-assets', /'screenExport\.js'[,\]]/.test(pkgText));
}

process.exit(failureCount() ? 1 : 0);

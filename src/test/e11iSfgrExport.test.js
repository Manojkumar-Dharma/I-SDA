/**
 * E11i - simulator, export and batch on SFGR source (the host side and the engine/export side).
 * Pure Node: no vscode.
 *
 *  1. the 5292 colour of the CS / BL / HI combination (Figure B-9) in the engine, SFGR fields only;
 *  2. column separators in the SVG, HTML and text exports (a line per cell, '|' in blank cells, a legend line);
 *  3. every format of the sample goes through all four exports and the batch without error, the source untouched;
 *  4. the host sends SFGR source through the SFGR model for the batch and export (static check of extension.ts);
 *  5. the indicator simulator namespace works for an SFGR file (value store is outside the source).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const SfgrModel = require('../sfgrModel.js');
const DspfEngine = require('../dspfEngine.js');
const ScreenExport = require('../screenExport.js');
const ScreenText = require('../screenText.js');
const ScreenBatch = require('../screenBatch.js');
const DspfParser = require('../../dist/dspfParser.js');

const root = path.join(__dirname, '..', '..');
const sampleText = fs.readFileSync(path.join(root, 'docs', 'sda-reference', 'source', 'stipfm.dspf36'), 'utf8');

function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
// A constant of `len` cells at line 3, column 2, with the attribute columns given ({39:'Y'} = HI, 41 = BL, 49 = CS).
function constantFile(text, attrs) {
  const parts = [[7, 'C1'], [15, String(text.length).padStart(4)], [19, ' 3'], [21, ' 2'], [23, 'Y '], [56, 'C'], [57, text]];
  Object.keys(attrs || {}).forEach((c) => parts.push([Number(c), attrs[c]]));
  return SfgrModel.buildModel([mk('S', [[7, 'FMT']]), mk('D', parts)].join('\n'));
}
const first = (file) => DspfEngine.resolveScreen(file, 'FMT', new Set(), null, false, 0).fields.find((f) => f.nameType === 'CONSTANT' || f.nameType === 'FIELD' || true);
const ATTR = { HI: 39, BL: 41, CS: 49 };
function styleFor(combo) {
  const attrs = {};
  combo.forEach((k) => { attrs[ATTR[k]] = 'Y'; });
  return first(constantFile('ABC', attrs)).style;
}

// ---- 1. the 5292 colour (Figure B-9) ------------------------------------------------------------------------------------
{
  const HEX = { GRN: '#33ff66', WHT: '#f2f2f2', RED: '#ff5c5c', TRQ: '#4de6e0', PNK: '#ff6ec7', YLW: '#ffe14d', BLU: '#4a9eff' };
  const rows = [
    [[], null, 'green (no attribute)'],
    [['HI'], 'WHT', 'white'],
    [['BL'], 'RED', 'red, blinking'],
    [['BL', 'HI'], 'RED', 'red, not blinking'],
    [['CS'], 'TRQ', 'turquoise, separators'],
    [['CS', 'BL'], 'PNK', 'pink, no separators'],
    [['CS', 'HI'], 'YLW', 'yellow, separators'],
    [['CS', 'BL', 'HI'], 'BLU', 'blue, no separators'],
  ];
  rows.forEach(([combo, name, label]) => {
    const st = styleFor(combo);
    if (name === null) check('5292: ' + label + ' keeps the default colour and no mapping flag', !st.color && !st.colorMapped);
    else check('5292: ' + combo.join('+') + ' = ' + label, st.color === HEX[name] && st.colorMapped === '5292');
  });
  check('5292: blink with high intensity or separators does not blink (footnote 2)', styleFor(['BL', 'HI']).blink === false && styleFor(['CS', 'BL']).blink === false && styleFor(['BL']).blink === true);
  check('5292: separators show only for turquoise and yellow (footnote 3)', styleFor(['CS']).columnSeparators === true && styleFor(['CS', 'HI']).columnSeparators === true &&
    !styleFor(['CS', 'BL']).columnSeparators && !styleFor(['CS', 'BL', 'HI']).columnSeparators);
  const f = first(constantFile('ABC', { 39: 'Y' }));
  check('5292: a mapped field is not also drawn brighter (the colour is the high intensity)', !DspfEngine.renderScreenHtml({ lines: 24, columns: 80, fields: [f] }).includes('dspf-hi'));

  // DDS is unchanged: DSPATR(HI BL CS) stays the keywords' own drawing
  const { buildLine: L } = require('../fixtures/lineBuilder.js');
  const dds = DspfParser.parseDspf([L({ nameType: 'R', name: 'REC1' }), L({ name: 'F1', length: 5, dataType: 'A', usage: 'O', line: 3, col: 2, func: 'DSPATR(HI CS)' })].join('\n') + '\n');
  const sc = DspfEngine.resolveScreen(dds, 'REC1', new Set(), null, false, 0);
  const df = sc.fields.find((x) => x.name === 'F1');
  check('5292: a DDS field with HI and CS is not recoloured (SFGR fields only)', df && !df.style.color && !df.style.colorMapped && df.style.hi && df.style.columnSeparators);
}

// ---- 2. column separators in the exports ------------------------------------------------------------------------------
{
  const withCs = constantFile('A B C', { 49: 'Y' });
  const noCs = constantFile('A B C', {});
  const draw = (file) => DspfEngine.resolveScreen(file, 'FMT', new Set(), null, false, 0);
  const lines = (svg) => (svg.match(/class="dspf-cs-line"/g) || []).length;
  check('svg: a separated field of 5 cells has 5 separator lines', lines(ScreenExport.buildSvg(draw(withCs))) === 5);
  check('svg: no separators without CS', lines(ScreenExport.buildSvg(draw(noCs))) === 0);
  check('html: the standalone page carries the same lines', lines(ScreenExport.buildHtml(draw(withCs), { title: 'x' })) === 5);
  const lineXs = (ScreenExport.buildSvg(draw(withCs)).match(/class="dspf-cs-line" x1="([\d.]+)"/g) || []).map((m) => parseFloat(m.replace(/.*x1="/, '').replace('"', '')));
  check('svg: the lines are one cell apart, at the right edge of each cell', lineXs.length === 5 && lineXs.every((x, i) => i === 0 || Math.abs((x - lineXs[i - 1]) - (lineXs[1] - lineXs[0])) < 0.01));

  const text = ScreenText.buildText(draw(withCs));
  check('text: the blank cells of a separated field show a |', /A\|B\|C|A\|B\|C/.test(text.replace(/ /g, '')) || (text.split('\n')[2] || '').includes('A|B|C'));
  check('text: no | without CS', !ScreenText.buildText(draw(noCs)).includes('|'));
  const legend = ScreenText.buildText(draw(withCs), { legend: true });
  check('text: the legend names the separated field (line, columns)', /Column separators: line 3, columns 2-6/.test(legend));
  check('text: the attribute plane keeps its one hex digit per cell (no new bit)', !/\b1[0-9a-f]\b/.test(legend.split('Display attributes')[1] ? legend.split('Display attributes')[1].split('\n').slice(1, 5).join('\n') : ''));
}

// ---- 3. the whole sample through all exports and the batch --------------------------------------------------------------------
{
  const before = sampleText;
  const file = SfgrModel.buildModel(sampleText);
  let failed = 0, shots = 0, withSeparators = 0;
  file.records.forEach((r) => {
    try {
      const sc = DspfEngine.resolveScreen(file, r.name, new Set(), null, false, 0);
      ScreenExport.buildSvg(sc); ScreenExport.buildHtml(sc, { title: r.name }); ScreenText.buildText(sc, { legend: true });
      if (/dspf-cs-line/.test(ScreenExport.buildSvg(sc))) withSeparators++;
      shots++;
    } catch (e) { failed++; }
  });
  check('sample: every format draws as SVG, HTML and text without error', failed === 0 && shots === file.records.length && shots === 7);
  check('sample: the formats with column separators draw them in the SVG (' + withSeparators + ' of 7)', withSeparators > 0);

  const plan = ScreenBatch.prepare(file, { engine: DspfEngine, memberName: 'STIPFM', themeName: 'dark', ruler: false, textStyle: {} });
  check('batch: the plan lists every format of the sample', plan.entries.length > 0 && plan.folder === 'STIPFM-screens');
  const written = [];
  ScreenBatch.run(plan, { createDirectory: () => Promise.resolve(), writeFile: (_f, name, text) => { written.push(name); return Promise.resolve(); } }, { isCancelled: () => false, onProgress: () => {} })
    .then((res) => {
      check('batch: SVG, HTML, text and the index are written, nothing failed', res.failed.length === 0 && res.indexWritten === true && written.some((n) => n.endsWith('.svg')) &&
        written.some((n) => n.endsWith('.html')) && written.some((n) => n.endsWith('.txt')));
      check('source stays clean: the SFGR text is untouched by the exports and the batch', sampleText === before);
      finish();
    });
}

// ---- 4. the host routes SFGR source through the SFGR model ---------------------------------------------------------------------
function hostChecks() {
  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const fn = ext.slice(ext.indexOf('async function exportAllScreenPreviews'), ext.indexOf('export function activate'));
  check('host: the batch export builds SFGR source with SfgrModel.buildModel', /isSfgrDocument\(document\)\s*\?\s*SfgrModel\.buildModel\(/.test(fn));
  check('host: the export command asks the page (it routes the source kind itself)', /dspfDesigner\.exportScreenPreview/.test(ext));
  const copy = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['build:webview-assets'];
  ['screenExport.js', 'screenText.js', 'screenBatch.js', 'screenPng.js', 'screenExportUi.js', 'indicatorSim.js', 'sfgrParser.js', 'sfgrWriter.js'].forEach((f) =>
    check('build: ' + f + ' is in the copy list', copy.indexOf("'" + f + "'") >= 0));
  check('build: sfgrModel.js is in the copy list (the host requires it)', copy.indexOf("'sfgrModel.js'") >= 0);
}

// ---- 5. the simulator namespace for an SFGR file ---------------------------------------------------------------------------------
function simChecks() {
  const Sim = require('../indicatorSim.js');
  const file = SfgrModel.buildModel(sampleText);
  const ind = Sim.fileIndicators(file);
  check('simulator: the indicator collector reads an SFGR file (the 01-99 output indicators of the sample)', ind && (Array.isArray(ind) ? ind.length > 0 : Object.keys(ind).length > 0));
}

function finish() {
  hostChecks();
  simChecks();
  process.exit(failureCount() === 0 ? 0 : 1);
}

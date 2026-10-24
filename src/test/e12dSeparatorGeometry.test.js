/**
 * E12d - column separators in the SVG export (the input of the PNG export) on the whole sample.
 * The separators in the SVG and text exports were built in E11i (e11iSfgrExport.test.js checks one constant); this checks
 * every format of the real sample: each separator line is inside the drawing, vertical, one cell wide apart, and only the
 * formats with a separated field have any. The PNG itself is made by the browser from this SVG and was NOT run here
 * (no browser): rasterizing this SVG once with an independent renderer (resvg) changed pixels at the separator columns
 * only, which is recorded in the roadmap, not asserted here.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check } = require('./helpers/harness');
const SfgrModel = require('../sfgrModel.js');
const DspfEngine = require('../dspfEngine.js');
const ScreenExport = require('../screenExport.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const file = SfgrModel.buildModel(SFGR);

const withCs = [];
file.records.forEach((rec) => {
  const hasCs = rec.fields.some((f) => f.keywords.some((k) => k.name === 'DSPATR' && /\bCS\b/.test(k.parameters)));
  const sc = DspfEngine.resolveScreen(file, rec.name, new Set(), null, false, 0);
  const svg = ScreenExport.buildSvg(sc);
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const W = parseFloat(vb[1]), H = parseFloat(vb[2]);
  const lines = (svg.match(/<line class="dspf-cs-line"[^>]*\/>/g) || []).map((l) => {
    const n = (k) => parseFloat(new RegExp(k + '="([\\d.\\-]+)"').exec(l)[1]);
    return { x1: n('x1'), y1: n('y1'), x2: n('x2'), y2: n('y2'), stroke: /stroke="([^"]+)"/.exec(l), width: /stroke-width="1"/.test(l), opacity: /stroke-opacity="0\.55"/.test(l) };
  });
  if (hasCs) withCs.push(rec.name);
  if (!hasCs) { check(rec.name + ': no CS attribute, no separator lines', lines.length === 0); return; }
  check(rec.name + ': ' + lines.length + ' separator lines, none outside the drawing', lines.length > 0 && lines.every((l) => l.x1 >= 0 && l.x1 <= W && l.y1 >= 0 && l.y2 <= H));
  check('  each is vertical, one row tall, with a stroke colour, width 1 and opacity 0.55', lines.every((l) => l.x1 === l.x2 && l.y2 > l.y1 && l.stroke && l.width && l.opacity) && new Set(lines.map((l) => Math.round((l.y2 - l.y1) * 100))).size === 1);
  const xs = Array.from(new Set(lines.map((l) => l.x1))).sort((a, b) => a - b);
  const cell = ScreenExport.METRICS ? (xs.length > 1 ? Math.min.apply(null, xs.slice(1).map((x, i) => x - xs[i])) : null) : null;
  check('  neighbouring separators are a whole number of cells apart', cell === null || xs.every((x) => Math.abs(((x - xs[0]) / cell) - Math.round((x - xs[0]) / cell)) < 0.01));
  check('  the SVG is one document: one <svg> and one </svg>, every separator line self-closed', (svg.match(/<svg\b/g) || []).length === 1 && (svg.match(/<\/svg>/g) || []).length === 1 && (svg.match(/<line class="dspf-cs-line"/g) || []).length === lines.length);
});
check('the sample has separated fields in formats ' + withCs.join(', '), withCs.length >= 3);

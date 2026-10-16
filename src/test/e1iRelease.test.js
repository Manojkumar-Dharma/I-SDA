/**
 * E1i - the E1 release: evidence for the acceptance paragraph of the epic that no single sub-task test holds.
 * The other criteria are held by the sub-task tests named in the E1i results (hover on every index entry:
 * e1cHover; outline: e1eOutline; the quick-fixes: e1fQuickFix; the Problems panel wiring: e1bDiagnosticsHub).
 * Pure Node: no vscode, no DOM.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DdsCompletion = require('../ddsCompletion.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const HoverData = require('../buildKeywordHoverData.js');
const KeywordSpec = require('../keywordSpec.js');

const data = HoverData.build();
const opts = { data, spec: KeywordSpec, filterByRules: false };

// ---- completion offers every keyword of the generated index, where it is listed ---------------------------------
// A keyword is offered at the level the index lists it at, on a line where its data type and usage fit. The
// `*` entries are parameter values, not keywords, and are not offered by design (E1d). CAnn / CFnn are listed as
// ranges in the index and offered one by one.
const BLANK = '     A' + ' '.repeat(38);
const fileLine = [BLANK];
const recordLines = [L({ nameType: 'R', name: 'REC1' }), BLANK];
const helpLines = [L({ nameType: 'R', name: 'REC1' }), L({ nameType: 'H', name: 'HLP1' }), BLANK];
const offeredAt = (lines, ln, ch) => new Set(DdsCompletion.completionAt(lines.join('\n'), ln, ch, opts).items.map((i) => i.name));
const fieldOffers = (dataType, usage) => {
  const lines = [L({ nameType: 'R', name: 'REC1' }), L({ name: 'FLD1', length: 8, dataType, decimals: dataType === 'S' || dataType === 'P' ? 2 : '', usage, line: 2, col: 2, func: 'DSPATR(HI) ' })];
  return offeredAt(lines, 1, lines[1].length);
};
const offered = {
  file: offeredAt(fileLine, 0, 44),
  record: offeredAt(recordLines, 1, 44),
  'help-specification': offeredAt(helpLines, 2, 44),
};
// the field level, over every data type and usage a field can have: a keyword needs only one fitting context
const fieldNames = new Set();
['A', 'S', 'P', 'B', 'F', 'L', 'T', 'Z', 'Y', 'G', 'O', 'J', 'E', ''].forEach((dt) => ['B', 'O', 'I', 'H', 'M', 'P'].forEach((u) => fieldOffers(dt, u).forEach((n) => fieldNames.add(n))));
offered.field = fieldNames;

let entries = 0;
const missing = [];
Object.keys(data.keywords).forEach((name) => {
  if (name.charAt(0) === '*') return;
  data.keywords[name].forEach((e) => {
    if (!offered[e.level]) return;
    entries++;
    const isRange = /^C[AF]01-C[AF]24$/.test(name);
    const ok = isRange ? [...offered[e.level]].some((n) => new RegExp('^' + name.slice(0, 2) + '\\d\\d$').test(n)) : offered[e.level].has(name);
    if (!ok) missing.push(name + '@' + e.level);
  });
});
console.log('  info  - ' + entries + ' index entries at the file, record, field and help-specification levels checked');
check('completion offers every keyword of the generated index at every level it is listed at' + (missing.length ? ' - missing: ' + missing.join(' ') : ''), missing.length === 0 && entries >= 150);

// ---- Problems within one second for a 5,000-line source ----------------------------------------------------------
function source(targetLines, violations) {
  const records = Math.round(targetLines / 7);
  const out = [];
  let n = 1;
  for (let i = 1; i <= records; i++) {
    out.push(L({ nameType: 'R', name: 'REC' + i }));
    if (violations && i % Math.floor(records / violations) === 1) out.push(L({ func: 'RMVWDW' }));
    for (let f = 1; f <= 6; f++) out.push(L({ name: 'F' + i + '_' + f, length: 10, dataType: 'A', usage: 'B', line: (n++ % 20) + 2, col: 2 }));
  }
  return out.join('\n');
}
[['clean', 0], ['with 50 violations', 50]].forEach(([label, v]) => {
  const text = source(5000, v);
  const t = process.hrtime.bigint();
  const r = DdsDiagnostics.createAnalyzer().analyze(text);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log('  info  - ' + text.split('\n').length + ' lines ' + label + ': ' + Math.round(ms) + ' ms');
  check('a 5,000-line source ' + label + ' is analysed in under a second (the first run, nothing remembered)' + (v ? ', and the violations are all there' : ''),
    ms < 1000 && (v ? r.diagnostics.length >= v - 1 : r.diagnostics.length === 0));
});

// ---- everything can be switched off by a setting ------------------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
const cfg = pkg.contributes.configuration;
const props = Array.isArray(cfg) ? Object.assign({}, ...cfg.map((c) => c.properties)) : cfg.properties;
const ext = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
[['diagnostics.enable', true], ['hover.enable', true], ['completion.enable', true], ['outline.enable', true], ['quickFix.enable', true], ['columnAids.enable', false]].forEach(([k, dflt]) => {
  const p = props['isda.' + k];
  check('setting isda.' + k + ' exists, is a boolean, defaults to ' + dflt + ' and is read by the extension',
    !!p && p.type === 'boolean' && p.default === dflt && ext.indexOf("'" + k + "'") >= 0);
});

process.exit(failureCount() === 0 ? 0 : 1);

/**
 * E11j1 - rule checks on SFGR source (src/sfgrDiagnostics.js) and their wiring into the diagnostics hub.
 * Pure Node: no vscode (the hub runs against a fake of the API, as in e1bDiagnosticsHub.test.js).
 *
 *  1. the real sample (stipfm.dspf36, LF and CRLF) has no diagnostics, so no rule is a false alarm on a source that compiles;
 *  2. every rule fires on a made-up source with the right code, line, columns, severity and message;
 *  3. rules that must stay quiet (indicator-conditioned overlays, a 132-column format, a wrapped field that fits);
 *  4. severity settings, the analyzer memory, junk input;
 *  5. the hub: SFGR source gets the SFGR rules, DDS source the DDS rules, the settings schema lists the codes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const Sfgr = require('../sfgrDiagnostics.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const DiagnosticsHub = require('../diagnosticsHub.js');
const { buildLine: L } = require('../fixtures/lineBuilder.js');

const root = path.join(__dirname, '..', '..');
const sample = fs.readFileSync(path.join(root, 'docs', 'sda-reference', 'source', 'stipfm.dspf36'), 'utf8');

function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const S = (name, parts) => mk('S', [[7, name]].concat(parts || []));
const H = (name, parts) => mk('H', [[7, name]].concat(parts || []));
const D = (len, line, col, parts) => mk('D', [[15, String(len).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)]].concat(parts || []));
const CONST = (len, line, col, text, extra) => D(len, line, col, [[23, 'Y '], [56, 'C'], [57, text || 'X']].concat(extra || []));
const run = (lines, severity) => Sfgr.analyze(lines.join('\n') + '\n', { severity: severity || {} });
const codes = (r) => r.diagnostics.map((d) => d.code);
const only = (r, code) => r.diagnostics.filter((d) => d.code === code);

// ---- 1. the sample ----------------------------------------------------------------------------------------------------
{
  const lf = Sfgr.analyze(sample.replace(/\r\n/g, '\n'), {});
  const crlf = Sfgr.analyze(sample, {});
  check('sample: no diagnostics (LF)', lf.diagnostics.length === 0 && lf.internalErrors.length === 0);
  check('sample: no diagnostics (CRLF), so no rule is a false alarm on a source that compiles', crlf.diagnostics.length === 0 && crlf.internalErrors.length === 0);
  check('codes: six rule codes, all isda.sfgr*, distinct from every DDS code', Sfgr.allCodes().length === 6 && Sfgr.allCodes().every((c) => /^isda\.sfgr[A-Za-z]+$/.test(c)) &&
    Sfgr.allCodes().every((c) => DdsDiagnostics.allCodes().indexOf(c) < 0));
}

// ---- 2. every rule fires -----------------------------------------------------------------------------------------------
{
  // isda.sfgrValue, S spec
  let r = run([S('FMT', [[25, 'Q']]), CONST(3, 2, 2)]);
  let d = only(r, 'isda.sfgrValue')[0];
  check('value: sound alarm "Q" (S columns 25 - 26) names the column and the allowed values', d && d.line === 1 && d.column === 25 && d.endColumn === 27 && /Sound alarm \(columns 25 - 26\) is "Q"/.test(d.message) && /indicator 01 - 99/.test(d.message) && d.severity === 'error');
  r = run([S('FMT', [[25, '64']]), CONST(3, 2, 2)]);
  check('value: an indicator 64 is allowed there', only(r, 'isda.sfgrValue').length === 0);
  r = run([S('FMT', [[25, '00']]), CONST(3, 2, 2)]);
  check('value: indicator 00 is not an indicator', only(r, 'isda.sfgrValue').length === 1);
  r = run([S('FMT', [[27, 'Y'], [28, 'X']]), CONST(3, 2, 2)]);
  d = only(r, 'isda.sfgrValue')[0];
  check('value: enable command keys "X" is refused, "Y" on function keys is fine', only(r, 'isda.sfgrValue').length === 1 && d.column === 28);
  r = run([S('FMT', [[17, '30']]), CONST(3, 2, 2)]);
  d = only(r, 'isda.sfgrValue')[0];
  check('value: start line 30 is past the 24 lines of an 80-column format', d && d.column === 17 && /Start line \(columns 17 - 18\) is 30; use blank, V or 1 - 24/.test(d.message));
  r = run([S('FMT', [[17, '27'], [39, 'Y']]), CONST(3, 1, 2)]);
  check('value: start line 27 is fine on a 132-column format (27 lines)', only(r, 'isda.sfgrValue').length === 0);
  r = run([S('FMT', [[17, '28'], [39, 'Y']]), CONST(3, 1, 2)]);
  check('value: start line 28 is past the 27 lines of a 132-column format', only(r, 'isda.sfgrValue').length === 1);
  r = run([S('FMT', [[17, ' V']]), CONST(3, 2, 2)]);
  check('value: start line V is allowed', only(r, 'isda.sfgrValue').length === 0);
  r = run([S('FMT', [[19, '25']]), CONST(3, 2, 2)]);
  check('value: lines to clear 25 is past the screen', only(r, 'isda.sfgrValue').length === 1 && only(r, 'isda.sfgrValue')[0].column === 19);
  r = run([S('FMT', [[64, 'AO']]), CONST(3, 2, 2)]);
  d = only(r, 'isda.sfgrValue')[0];
  check('value: key mask with an O (there is no O key) is refused, columns 64 - 79', d && d.column === 64 && d.endColumn === 80 && /"O"/.test(d.message));
  r = run([S('FMT', [[64, 'A B']]), CONST(3, 2, 2)]);
  check('value: a blank inside the key mask is refused', only(r, 'isda.sfgrValue').length === 1);
  r = run([S('FMT', [[64, 'CV']]), CONST(3, 2, 2)]);
  check('value: a good key mask (CV) is fine', only(r, 'isda.sfgrValue').length === 0);
  r = run([S('', []), CONST(3, 2, 2)]);
  check('value: a display format with no name', only(r, 'isda.sfgrValue').length === 1 && /needs a name/.test(only(r, 'isda.sfgrValue')[0].message));
  r = run([S('9ABC', []), CONST(3, 2, 2)]);
  check('value: a name starting with a digit', only(r, 'isda.sfgrValue').length === 1 && only(r, 'isda.sfgrValue')[0].column === 7 && only(r, 'isda.sfgrValue')[0].endColumn === 15);

  // isda.sfgrValue, D spec
  r = run([S('FMT'), D(3, 2, 2, [[27, 'Q'], [23, 'Y '], [56, 'C'], [57, 'X']])]);
  d = only(r, 'isda.sfgrValue')[0];
  check('value: data type "Q" (D column 27), line 2', d && d.line === 2 && d.column === 27 && /Data type \(column 27\) is "Q"/.test(d.message));
  r = run([S('FMT'), CONST(0, 2, 2)]);
  check('value: field length 0', only(r, 'isda.sfgrValue').length === 1 && /Field length \(columns 15 - 18\) is 0/.test(only(r, 'isda.sfgrValue')[0].message));
  r = run([S('FMT'), CONST(2000, 2, 2)]);
  check('value: field length 2000 is past 1919 on 80 columns', only(r, 'isda.sfgrValue').length === 1 && /1 - 1919/.test(only(r, 'isda.sfgrValue')[0].message));
  r = run([S('FMT', [[39, 'Y']]), CONST(2000, 2, 2)]);
  check('value: the same length is fine on 132 columns (3563)', only(r, 'isda.sfgrValue').length === 0);
  r = run([S('FMT'), mk('D', [[15, '   3'], [19, ' 2'], [21, 'D3'], [23, 'Y '], [56, 'C'], [57, 'X']])]);
  check('value: column D3 is 133, past A0 - D2', only(r, 'isda.sfgrValue').length === 1 && /A0 - D2/.test(only(r, 'isda.sfgrValue')[0].message));
  r = run([S('FMT'), CONST(3, 0, 2)]);
  check('value: line 0', only(r, 'isda.sfgrValue').length === 1 && /Line \(columns 19 - 20\) is 0/.test(only(r, 'isda.sfgrValue')[0].message));
  r = run([S('FMT'), D(3, 2, 2, [[23, 'Y '], [56, 'Z']])]);
  check('value: constant type "Z"', only(r, 'isda.sfgrValue').length === 1 && only(r, 'isda.sfgrValue')[0].column === 56);
  r = run([S('FMT'), D(3, 2, 2, [[39, '99'], [41, ' Y'], [37, 'N '], [23, '37'], [26, 'Y']])]);
  check('value: Y, N and indicators on the attribute columns are fine', only(r, 'isda.sfgrValue').length === 0);

  // isda.sfgrValue, H spec
  r = run([S('FMT'), H('AHELP00', [[34, ' 2 2'], [39, '1070']]), CONST(3, 2, 2)]);
  check('value: a good help area is fine', only(r, 'isda.sfgrValue').length === 0);
  r = run([S('FMT'), H('AHELP00', [[34, ' 2 2']]), CONST(3, 2, 2)]);
  check('value: one corner without the other', only(r, 'isda.sfgrValue').length === 1);
  r = run([S('FMT'), H('AHELP00', [[44, 'Y']]), CONST(3, 2, 2)]);
  check('value: suppress selection takes an indicator, not Y', only(r, 'isda.sfgrValue').length === 1 && only(r, 'isda.sfgrValue')[0].column === 44);

  // isda.sfgrDuplicateName
  r = run([S('FMT1'), CONST(3, 2, 2), S('fmt1'), CONST(3, 2, 2)]);
  d = only(r, 'isda.sfgrDuplicateName')[0];
  check('duplicate: the second S line with the same name (any case), columns 7 - 14, names the first line', d && d.line === 3 && d.column === 7 && d.endColumn === 15 && /line 1/.test(d.message));
  r = run([S('FMT1'), CONST(3, 2, 2), S('FMT2'), CONST(3, 2, 2)]);
  check('duplicate: two different names are fine', only(r, 'isda.sfgrDuplicateName').length === 0);

  // isda.sfgrContinuation and isda.sfgrParse
  const lastX = CONST(3, 2, 2).padEnd(79, ' ') + 'X';
  r = run([S('FMT'), lastX]);
  d = only(r, 'isda.sfgrContinuation')[0];
  check('continuation: an X in column 80 with no line after it', d && d.line === 2 && d.column === 80 && d.endColumn === 81 && d.severity === 'error');
  r = run([CONST(3, 2, 2), S('FMT')]);
  d = only(r, 'isda.sfgrParse')[0];
  check('parse: a D line before the first S spec', d && d.line === 1 && /before the first S/.test(d.message));
  r = run([S('FMT'), 'ABCDEQ  junk', CONST(3, 2, 2)]);
  check('parse: a line that is no specification', only(r, 'isda.sfgrParse').length >= 1);
  r = run([S('FMT'), CONST(3, 2, 2).replace('X', '\t')]);
  d = only(r, 'isda.sfgrParse').find((x) => /tab/i.test(x.message));
  check('parse: a tab is a warning on its own column', d && d.severity === 'warning' && d.line === 2);
  r = run([S('FMT'), D(3, 2, 2, [[23, 'Y '], [56, 'C'], [57, 'X'], [82, 'extra']])]);
  d = only(r, 'isda.sfgrParse').find((x) => x.column === 81);
  check('parse: text past column 80 is a warning from column 81 to the end of the line', d && d.severity === 'warning' && d.endColumn > 81);
  r = run([S('FMT'), D(' ab', 2, 2, [[23, 'Y '], [56, 'C'], [57, 'X']])]);
  check('parse: a length that is not a number is the parser\'s message, once', only(r, 'isda.sfgrParse').length === 1);

  // isda.sfgrOutsideScreen
  r = run([S('FMT'), CONST(3, 2, 81)]);
  d = only(r, 'isda.sfgrOutsideScreen')[0];
  check('outside: column 81 on an 80-column format, columns 21 - 22', d && d.line === 2 && d.column === 21 && d.endColumn === 23 && /80-column/.test(d.message) && /column 39/.test(d.message));
  r = run([S('FMT', [[39, 'Y']]), CONST(3, 2, 81)]);
  check('outside: column 81 is fine on a 132-column format', only(r, 'isda.sfgrOutsideScreen').length === 0);
  r = run([S('FMT', [[17, '20']]), CONST(3, 6, 2)]);
  d = only(r, 'isda.sfgrOutsideScreen')[0];
  check('outside: start line 20 + line 6 is row 25, below the 24th', d && d.column === 19 && /row 25/.test(d.message));
  r = run([S('FMT', [[17, '24']]), CONST(100, 1, 2)]);
  d = only(r, 'isda.sfgrOutsideScreen')[0];
  check('outside: a field that wraps onto row 25', d && d.column === 15 && /row 25/.test(d.message));
  r = run([S('FMT', [[17, '23']]), CONST(100, 1, 2)]);
  check('outside: the same field wrapping onto row 24 is fine (the wrap of E11f is respected)', only(r, 'isda.sfgrOutsideScreen').length === 0);
  r = run([S('FMT'), CONST(188, 21, 1)]);
  check('outside: 188 cells from row 21, column 1 end on row 23 (the sample\'s long constant)', only(r, 'isda.sfgrOutsideScreen').length === 0);

  // isda.sfgrOverlap
  r = run([S('FMT'), CONST(5, 2, 2, 'ABCDE'), CONST(5, 2, 5, 'FGHIJ')]);
  d = only(r, 'isda.sfgrOverlap')[0];
  check('overlap: two always-present fields on the same cells, a warning on the second, naming the first', d && d.line === 3 && d.severity === 'warning' && /line 2/.test(d.message) && d.column === 15 && d.endColumn === 23);
  r = run([S('FMT'), CONST(5, 2, 2, 'ABCDE'), CONST(5, 2, 7, 'FGHIJ')]);
  check('overlap: neighbouring fields do not overlap', only(r, 'isda.sfgrOverlap').length === 0);
  r = run([S('FMT'), D(5, 2, 2, [[23, '10'], [56, 'C'], [57, 'ABCDE']]), D(5, 2, 2, [[23, '11'], [56, 'C'], [57, 'FGHIJ']])]);
  check('overlap: two overlays under different indicators are not reported', only(r, 'isda.sfgrOverlap').length === 0);
  r = run([S('FMT'), D(5, 2, 2, [[23, '10'], [56, 'C'], [57, 'ABCDE']]), D(5, 2, 2, [[23, '10'], [56, 'C'], [57, 'FGHIJ']])]);
  check('overlap: two fields under the same indicator are', only(r, 'isda.sfgrOverlap').length === 1);
  r = run([S('FMT1'), CONST(5, 2, 2), S('FMT2'), CONST(5, 2, 2)]);
  check('overlap: the same cells in two different formats are not an overlap', only(r, 'isda.sfgrOverlap').length === 0);
  r = run([S('FMT'), CONST(100, 5, 2), CONST(5, 6, 10)]);
  check('overlap: a wrapped field takes the cells of the next row too', only(r, 'isda.sfgrOverlap').length === 1);
}

// ---- 4. settings, memory, junk -------------------------------------------------------------------------------------------------
{
  const src = [S('FMT'), CONST(5, 2, 2), CONST(5, 2, 4)];
  check('severity: an overlap is a warning by default', run(src).diagnostics[0].severity === 'warning');
  check('severity: the setting moves it to error', run(src, { 'isda.sfgrOverlap': 'error' }).diagnostics[0].severity === 'error');
  check('severity: "off" drops it', run(src, { 'isda.sfgrOverlap': 'off' }).diagnostics.length === 0);
  check('severity: the setting moves a parser warning too', run([S('FMT'), CONST(3, 2, 2).replace('X', '\t')], { 'isda.sfgrParse': 'hint' }).diagnostics.some((d) => d.severity === 'hint'));
  const a = Sfgr.createAnalyzer();
  const first = a.analyze(src.join('\n'), {});
  const again = a.analyze(src.join('\n'), { severity: { 'isda.sfgrOverlap': 'off' } });
  check('analyzer: the same text again, with another severity map, answers from memory with the new map', first.diagnostics.length === 1 && again.diagnostics.length === 0);
  check('analyzer: an edit is analysed again', a.analyze([S('FMT'), CONST(5, 2, 2)].join('\n'), {}).diagnostics.length === 0);
  a.reset();
  check('analyzer: reset forgets the text', a.analyze(src.join('\n'), {}).diagnostics.length === 1);
  let threw = false;
  try { [null, undefined, 42, '', '\u0000\u0001garbage', 'x'.repeat(100000), S('A').repeat(3), '\r\r\n\n'].forEach((t) => { Sfgr.analyze(t, {}); Sfgr.createAnalyzer().analyze(t, {}); }); } catch (e) { threw = true; }
  check('junk: nothing throws on null, numbers, binary, a 100000-character line', !threw);
  const big = [S('BIG')];
  for (let i = 0; i < 6000; i++) big.push(CONST(60, 1 + (i % 22), 2));
  const t0 = Date.now();
  const bigResult = Sfgr.analyze(big.join('\n'), {});
  check('performance: 6000 fields in one format are analysed in under 3 seconds (' + (Date.now() - t0) + ' ms) without an internal error', Date.now() - t0 < 3000 && bigResult.internalErrors.length === 0);
}

// ---- 5. the hub ----------------------------------------------------------------------------------------------------------------------
{
  class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
  class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
  const emitter = () => { const h = []; const f = (fn) => { h.push(fn); return { dispose() {} }; }; f.fire = (e) => h.slice().forEach((x) => x(e)); return f; };
  const collections = [];
  const api = {
    Range, Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    languages: { createDiagnosticCollection(name) { const map = new Map(); const c = { name, map, set(u, l) { map.set(u.toString(), l); }, delete(u) { map.delete(u.toString()); }, get(u) { return map.get(u.toString()); }, dispose() {} }; collections.push(c); return c; } },
    workspace: { textDocuments: [], onDidOpenTextDocument: emitter(), onDidChangeTextDocument: emitter(), onDidCloseTextDocument: emitter(), onDidChangeConfiguration: emitter() },
  };
  const settings = { enable: true, severity: {} };
  const hub = DiagnosticsHub.createHub(api, {
    shouldAnalyze: (d) => /\.dspf$/.test(d.uri.toString()),
    shouldAnalyzeSfgr: (d) => /\.dspf36$/.test(d.uri.toString()),
    getSettings: () => settings,
    schedule: (fn) => { fn(); return 1; },
    cancel: () => {},
  });
  hub.start();
  const doc = (name, text) => ({ uri: { toString: () => 'file:///' + name }, isClosed: false, text, getText() { return this.text; } });
  const coll = collections[0];

  const sfgrDoc = doc('a.dspf36', [S('FMT', [[25, 'Q']]), CONST(3, 2, 2)].join('\n'));
  api.workspace.onDidOpenTextDocument.fire(sfgrDoc);
  const list = coll.get(sfgrDoc.uri) || [];
  check('hub: an SFGR document gets its SFGR diagnostics', list.length === 1 && list[0].code === 'isda.sfgrValue' && list[0].source === 'iSDA');
  check('hub: the range is the column range, 0-based (line 1, columns 25 - 26)', list[0].range.start.line === 0 && list[0].range.start.character === 24 && list[0].range.end.character === 26);

  const ddsDoc = doc('b.dspf', [L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' })].join('\n'));
  api.workspace.onDidOpenTextDocument.fire(ddsDoc);
  check('hub: a DDS document still gets only DDS diagnostics', (coll.get(ddsDoc.uri) || []).length === 1 && coll.get(ddsDoc.uri)[0].code !== undefined && !/^isda\.sfgr/.test(coll.get(ddsDoc.uri)[0].code));

  sfgrDoc.text = [S('FMT'), CONST(3, 2, 2)].join('\n');
  api.workspace.onDidChangeTextDocument.fire({ document: sfgrDoc, contentChanges: [] });
  check('hub: after the edit that fixes it, the SFGR diagnostics are gone', (coll.get(sfgrDoc.uri) || []).length === 0);

  settings.severity = { 'isda.sfgrValue': 'warning' };
  sfgrDoc.text = [S('FMT', [[25, 'Q']]), CONST(3, 2, 2)].join('\n');
  api.workspace.onDidChangeTextDocument.fire({ document: sfgrDoc, contentChanges: [] });
  check('hub: the severity setting applies to the SFGR codes', (coll.get(sfgrDoc.uri) || [])[0] && coll.get(sfgrDoc.uri)[0].severity === 1);

  settings.severity = { 'isda.sfgrValue': 'bogus', 'isda.notACode': 'off' };
  api.workspace.onDidChangeTextDocument.fire({ document: sfgrDoc, contentChanges: [] });
  check('hub: an unknown value or code in the setting is ignored', (coll.get(sfgrDoc.uri) || [])[0] && coll.get(sfgrDoc.uri)[0].severity === 0);

  settings.enable = false;
  api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
  api.workspace.textDocuments.push(sfgrDoc);
  hub.refreshAll();
  check('hub: with isda.diagnostics.enable off the SFGR diagnostics are cleared too', (coll.get(sfgrDoc.uri) || []).length === 0);
  settings.enable = true;

  const other = doc('c.txt', 'whatever');
  api.workspace.onDidOpenTextDocument.fire(other);
  check('hub: a document that is neither DDS nor SFGR is left alone', (coll.get(other.uri) || []).length === 0);

  api.workspace.onDidCloseTextDocument.fire(sfgrDoc);
  check('hub: closing clears it', (coll.get(sfgrDoc.uri) || []).length === 0);

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const sevEnum = pkg.contributes.configuration.properties['isda.diagnostics.severity'].propertyNames.enum;
  check('settings: the severity schema lists the six SFGR codes', Sfgr.allCodes().every((c) => sevEnum.indexOf(c) >= 0));
  check('build: sfgrDiagnostics.js is in the copy list', /'sfgrDiagnostics\.js'/.test(pkg.scripts['build:webview-assets']));
  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  check('host: the extension hands the hub an SFGR document filter that never matches DDS', /shouldAnalyzeSfgr: isSfgrTextDocument/.test(ext) &&
    /function isSfgrTextDocument[\s\S]{0,200}isSfgrDocument\(document\)/.test(ext));
}

process.exit(failureCount() === 0 ? 0 : 1);

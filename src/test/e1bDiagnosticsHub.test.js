/**
 * E1b - the diagnostics hub (src/diagnosticsHub.js): one DiagnosticCollection, fed by ddsDiagnostics.js
 * (E1a) for open DDS documents, debounced on change, cleared on close, switchable by settings. Run here
 * against a fake of the vscode API and a manual scheduler, so every step is deterministic.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DiagnosticsHub = require('../diagnosticsHub.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const SfgrDiagnostics = require('../sfgrDiagnostics.js');

// ---- a fake of the vscode API ------------------------------------------------------------------
class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

function emitter() {
  const handlers = [];
  const subscribe = (fn) => { handlers.push(fn); return { dispose() { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); } }; };
  subscribe.fire = (e) => handlers.slice().forEach((h) => h(e));
  subscribe.count = () => handlers.length;
  return subscribe;
}

function fakeVscode() {
  const collections = [];
  const api = {
    Range, Diagnostic, DiagnosticSeverity,
    languages: {
      createDiagnosticCollection(name) {
        const map = new Map();
        const c = { name, map, disposed: false,
          set(uri, list) { map.set(uri.toString(), list); },
          delete(uri) { map.delete(uri.toString()); },
          get(uri) { return map.get(uri.toString()); },
          dispose() { this.disposed = true; map.clear(); } };
        collections.push(c);
        return c;
      },
    },
    workspace: {
      textDocuments: [],
      onDidOpenTextDocument: emitter(),
      onDidChangeTextDocument: emitter(),
      onDidCloseTextDocument: emitter(),
      onDidChangeConfiguration: emitter(),
    },
  };
  return { api, collections };
}

function doc(name, lines) {
  const d = { uri: { toString: () => 'file:///' + name }, isClosed: false, text: lines.join('\n'), getText() { return this.text; } };
  return d;
}

function manualTimers() {
  let next = 1;
  const timers = new Map();
  return {
    schedule: (fn, ms) => { const h = next++; timers.set(h, { fn, ms }); return h; },
    cancel: (h) => timers.delete(h),
    pending: () => timers.size,
    lastDelay: () => { let v = null; timers.forEach((t) => { v = t.ms; }); return v; },
    runAll: () => { const all = Array.from(timers.values()); timers.clear(); all.forEach((t) => t.fn()); },
  };
}

const bad = (extra) => [L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' })].concat(extra || []);
const good = [L({ nameType: 'R', name: 'REC1' }), L({ name: 'F1', length: 10, dataType: 'A', usage: 'B', line: 2, col: 2 })];

function setup(over) {
  const v = fakeVscode();
  const timers = manualTimers();
  const settings = { enable: true, severity: {} };
  const hub = DiagnosticsHub.createHub(v.api, Object.assign({
    shouldAnalyze: (d) => !/\.txt$/.test(d.uri.toString()),
    getSettings: () => settings,
    schedule: timers.schedule,
    cancel: timers.cancel,
  }, over || {}));
  return { v, timers, settings, hub, coll: v.collections[0] };
}

// ---- the collection ---------------------------------------------------------------------------
{
  const { v, hub, coll } = setup();
  check('one collection, named iSDA', v.collections.length === 1 && coll.name === 'iSDA' && hub.collection === coll);
}

// ---- opening a document publishes its diagnostics ------------------------------------------------------
{
  const { v, hub, coll } = setup();
  hub.start();
  const d = doc('a.dspf', bad());
  v.api.workspace.onDidOpenTextDocument.fire(d);
  const list = coll.get(d.uri) || [];
  check('open: the violation is published', list.length === 1);
  check('  range is zero-based: line 1, characters 44 to 50', list.length === 1 &&
    list[0].range.start.line === 1 && list[0].range.start.character === 44 && list[0].range.end.line === 1 && list[0].range.end.character === 50);
  check('  code, source, message and error severity carried over', list.length === 1 && list[0].code === 'isda.windowDependency' &&
    list[0].source === 'iSDA' && /RMVWDW/.test(list[0].message) && list[0].severity === DiagnosticSeverity.Error);
  const clean = doc('b.dspf', good);
  v.api.workspace.onDidOpenTextDocument.fire(clean);
  check('open: a clean document has no entry at all', coll.get(clean.uri) === undefined);
}

// ---- documents already open when the hub starts are analysed ------------------------------------------------
{
  const { v, hub, coll } = setup();
  const d = doc('a.dspf', bad());
  v.api.workspace.textDocuments.push(d);
  hub.start();
  check('start: an already open document is analysed', (coll.get(d.uri) || []).length === 1);
}

// ---- a document that is not a DDS source is left alone -------------------------------------------------------
{
  const { v, hub, coll, timers } = setup();
  hub.start();
  const d = doc('notes.txt', bad());
  v.api.workspace.onDidOpenTextDocument.fire(d);
  check('shouldAnalyze false: nothing published', coll.get(d.uri) === undefined);
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  check('  and a change schedules nothing', timers.pending() === 0);
}

// ---- debounce -----------------------------------------------------------------------------------------------
{
  const { v, hub, coll, timers } = setup();
  hub.start();
  const d = doc('a.dspf', good);
  v.api.workspace.onDidOpenTextDocument.fire(d);
  d.text = bad().join('\n');
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  check('change: not analysed yet, one timer waiting, 300 ms', coll.get(d.uri) === undefined && timers.pending() === 1 && timers.lastDelay() === 300);
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  check('  more changes to the same document restart it: still one timer', timers.pending() === 1);
  timers.runAll();
  check('  when it fires the new text is analysed', (coll.get(d.uri) || []).length === 1 && timers.pending() === 0);
  d.text = good.join('\n');
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  timers.runAll();
  check('  fixing the text clears the entry', coll.get(d.uri) === undefined);
  const other = doc('c.dspf', bad());
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  v.api.workspace.onDidChangeTextDocument.fire({ document: other });
  check('  two documents have a timer each', timers.pending() === 2);
}

// ---- close --------------------------------------------------------------------------------------------------
{
  const { v, hub, coll, timers } = setup();
  hub.start();
  const d = doc('a.dspf', bad());
  v.api.workspace.onDidOpenTextDocument.fire(d);
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  v.api.workspace.onDidCloseTextDocument.fire(d);
  check('close: the diagnostics are cleared', coll.get(d.uri) === undefined);
  check('  and a waiting analysis is cancelled', timers.pending() === 0);
}
{
  const { v, hub, coll, timers } = setup();
  hub.start();
  const d = doc('a.dspf', bad());
  v.api.workspace.onDidOpenTextDocument.fire(d);
  d.isClosed = true;
  hub.refresh(d);
  check('a closed document is never analysed (and is cleared)', coll.get(d.uri) === undefined && timers.pending() === 0);
}

// ---- settings: enable ---------------------------------------------------------------------------------------
{
  const { v, hub, coll, settings, timers } = setup();
  const d = doc('a.dspf', bad());
  v.api.workspace.textDocuments.push(d);
  hub.start();
  check('enabled: published', (coll.get(d.uri) || []).length === 1);
  settings.enable = false;
  v.api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: (s) => s === 'isda.diagnostics' });
  check('disabled: every diagnostic is cleared', coll.get(d.uri) === undefined);
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  check('  and a change schedules nothing', timers.pending() === 0);
  v.api.workspace.onDidOpenTextDocument.fire(d);
  check('  and opening publishes nothing', coll.get(d.uri) === undefined);
  settings.enable = true;
  v.api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: (s) => s === 'isda.diagnostics' });
  check('enabled again: re-analysed without reopening', (coll.get(d.uri) || []).length === 1);
  settings.enable = false;
  v.api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => false });
  check('a change to some other setting does not re-run anything', (coll.get(d.uri) || []).length === 1);
}

// ---- settings: severity -----------------------------------------------------------------------------------------
{
  const { v, hub, coll, settings } = setup();
  settings.severity = { 'isda.windowDependency': 'warning' };
  const d = doc('a.dspf', bad());
  v.api.workspace.textDocuments.push(d);
  hub.start();
  check('severity map: a warning', (coll.get(d.uri) || [])[0].severity === DiagnosticSeverity.Warning);
  settings.severity = { 'isda.windowDependency': 'information' };
  v.api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
  check('  changed to information, applied on the settings change', (coll.get(d.uri) || [])[0].severity === DiagnosticSeverity.Information);
  settings.severity = { 'isda.windowDependency': 'hint' };
  v.api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
  check('  hint', (coll.get(d.uri) || [])[0].severity === DiagnosticSeverity.Hint);
  settings.severity = { 'isda.windowDependency': 'off' };
  v.api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
  check('  off removes the rule', coll.get(d.uri) === undefined);
  settings.severity = { 'isda.windowDependency': 'WARNING' };
  v.api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
  check('  the value is not case-sensitive', (coll.get(d.uri) || [])[0].severity === DiagnosticSeverity.Warning);
}
{
  const m = DiagnosticsHub.sanitizeSeverityMap({
    'isda.windowDependency': 'warning', 'isda.nope': 'warning', 'isda.keepMutex': 'loud', 'isda.pulldownMutex': 5, 'isda.retKey': 'off',
  });
  check('sanitize: keeps known codes with known values only', JSON.stringify(m) === JSON.stringify({ 'isda.windowDependency': 'warning', 'isda.retKey': 'off' }));
  check('sanitize: junk in, empty map out', ['x', 5, null, undefined, [], ['a']].every((j) => Object.keys(DiagnosticsHub.sanitizeSeverityMap(j)).length === 0));
}
{
  const { v, hub, coll, settings } = setup();
  settings.severity = 'not an object';
  const d = doc('a.dspf', bad());
  v.api.workspace.textDocuments.push(d);
  hub.start();
  check('a malformed severity setting falls back to errors', (coll.get(d.uri) || [])[0].severity === DiagnosticSeverity.Error);
}
{
  const v = fakeVscode();
  const hub = DiagnosticsHub.createHub(v.api, { shouldAnalyze: () => true });
  const d = doc('a.dspf', bad());
  v.api.workspace.textDocuments.push(d);
  hub.start();
  check('no getSettings given: enabled, errors', (v.collections[0].get(d.uri) || []).length === 1);
  hub.dispose();
}

// ---- other sources share the collection -------------------------------------------------------------------------------
{
  const { v, hub, coll } = setup();
  hub.start();
  const d = doc('a.dspf', bad());
  v.api.workspace.onDidOpenTextDocument.fire(d);
  const extra = new Diagnostic(new Range(0, 0, 0, 5), 'compile message', DiagnosticSeverity.Error);
  hub.setSource(d.uri, 'compile', [extra]);
  check('another source adds to the same entry', (coll.get(d.uri) || []).length === 2 && coll.get(d.uri).indexOf(extra) >= 0);
  v.api.workspace.onDidOpenTextDocument.fire(d);
  check('  a refresh of the rules keeps it', (coll.get(d.uri) || []).length === 2);
  v.api.workspace.onDidCloseTextDocument.fire(d);
  check('  closing clears the rules only', (coll.get(d.uri) || []).length === 1 && coll.get(d.uri)[0] === extra);
  hub.clearSource(d.uri, 'compile');
  check('  clearing that source empties the entry', coll.get(d.uri) === undefined);
  hub.setSource(d.uri, 'compile', [extra]);
  hub.setSource(d.uri, 'compile', []);
  check('  setting a source to nothing removes it', coll.get(d.uri) === undefined);
}

// ---- internal errors are reported, analysis goes on -----------------------------------------------------------------------
{
  const seen = [];
  const { v, hub, coll } = setup({
    analyze: () => ({ diagnostics: [], internalErrors: ['x: boom'] }),
    onInternalErrors: (uri, list) => seen.push(list.join()),
  });
  hub.start();
  v.api.workspace.onDidOpenTextDocument.fire(doc('a.dspf', bad()));
  check('internalErrors from the analysis reach onInternalErrors', seen.length === 1 && seen[0] === 'x: boom');
}

// ---- dispose --------------------------------------------------------------------------------------------------------------------
{
  const { v, hub, coll, timers } = setup();
  hub.start();
  const d = doc('a.dspf', bad());
  v.api.workspace.onDidOpenTextDocument.fire(d);
  v.api.workspace.onDidChangeTextDocument.fire({ document: d });
  hub.dispose();
  check('dispose: collection disposed, timers cancelled', coll.disposed && timers.pending() === 0);
  check('  every listener removed', v.api.workspace.onDidOpenTextDocument.count() === 0 && v.api.workspace.onDidChangeTextDocument.count() === 0 &&
    v.api.workspace.onDidCloseTextDocument.count() === 0 && v.api.workspace.onDidChangeConfiguration.count() === 0);
  hub.refresh(d);
  check('  a refresh after dispose does nothing', coll.map.size === 0);
}

// ---- the wiring: manifest, copy list, extension.ts ---------------------------------------------------------------------------------
const root = path.join(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const props = pkg.contributes.configuration.properties;
check('setting isda.diagnostics.enable: boolean, default true', props['isda.diagnostics.enable'] && props['isda.diagnostics.enable'].type === 'boolean' && props['isda.diagnostics.enable'].default === true);
const sevProp = props['isda.diagnostics.severity'];
check('setting isda.diagnostics.severity: object, default {}', sevProp && sevProp.type === 'object' && JSON.stringify(sevProp.default) === '{}');
check('  its property names are exactly the codes the analysers can emit (DDS, and the SFGR rules of E11j1)', sevProp && JSON.stringify(sevProp.propertyNames.enum.slice().sort()) === JSON.stringify(DdsDiagnostics.allCodes().concat(SfgrDiagnostics.allCodes()).sort()));
check('  its values are the four severities and off', sevProp && JSON.stringify(sevProp.additionalProperties.enum) === JSON.stringify(['error', 'warning', 'information', 'hint', 'off']));
check('build:webview-assets copies ddsDiagnostics.js and diagnosticsHub.js', /'ddsDiagnostics\.js'/.test(pkg.scripts['build:webview-assets']) && /'diagnosticsHub\.js'/.test(pkg.scripts['build:webview-assets']));
const ext = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
check('extension.ts loads the hub, starts it and disposes it with the extension', /require\('\.\/diagnosticsHub\.js'\)/.test(ext) &&
  /DiagnosticsHub\.createHub\(vscode,/.test(ext) && /diagnosticsHub\.start\(\)/.test(ext) && /subscriptions\.push\(diagnosticsHub\)/.test(ext));
check('  it reads both settings', /get<boolean>\('diagnostics\.enable', true\)/.test(ext) && /get<unknown>\('diagnostics\.severity', \{\}\)/.test(ext));
check('  a MNUCMD member is not analysed', /getDocumentSourceType\(document\.uri\) !== MENU_COMMAND_SOURCE_TYPE/.test(ext));
check('  only documents the DDS selector matches', /languages\.match\(DDS_LANGUAGE_SELECTOR, document\) > 0/.test(ext));

// ---- the compiled copy in dist/ loads (the extension requires it from there) ---------------------------------------------------------
const distHub = path.join(root, 'dist/diagnosticsHub.js');
if (fs.existsSync(distHub)) {
  const Dist = require(distHub);
  check('dist/diagnosticsHub.js loads and exports createHub', typeof Dist.createHub === 'function');
}

process.exit(failureCount() === 0 ? 0 : 1);

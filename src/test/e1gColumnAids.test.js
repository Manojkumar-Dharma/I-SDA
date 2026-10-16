/**
 * E1g - column aids (src/ddsColumnAids.js). zonesAt / zoneAt are pure (no vscode, no DOM); the hover provider and the
 * decoration controller are exercised with a fake of the API; the real activate() wiring is in extension.test.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const Aids = require('../ddsColumnAids.js');

const moduleSource = fs.readFileSync(path.join(__dirname, '../ddsColumnAids.js'), 'utf8');
check('exports the pure functions and both providers', ['zonesAt', 'zoneAt', 'lineKind', 'hoverMarkdown', 'createHoverProvider', 'createController'].every((n) => typeof Aids[n] === 'function'));
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));

const kw = (func) => '     A' + ' '.repeat(38) + func;
const R = (name, func) => func ? ('     A          R ' + name).padEnd(44) + func : '     A          R ' + name;
const F = (name, usage, func) => {
  const base = '     A            ' + name.padEnd(10) + '    10A  ' + usage + '  2  2';
  return func ? base.padEnd(44) + func : base;
};
const at = (lines) => (i) => lines[i];
const ids = (r) => r.zones.map((z) => z.id).join(',');

// ---- kinds ---------------------------------------------------------------------------------------------------------
const doc = [
  '     A* a comment',
  kw('DSPSIZ(24 80 *DS3)'),
  R('REC1', 'PUTRETAIN'),
  F('F1', 'B', 'DSPATR(HI +'),
  kw('PC)'),
  kw('OVERLAY'),
  '',
  '     A          H                           HLPRCD(REC1)',
];
const kind = (i) => Aids.lineKind(at(doc), i);
check('a comment line (* in column 7)', kind(0) === 'comment');
check('a file-level keyword line is a keyword line', kind(1) === 'keyword');
check('a record format line (R in column 17)', kind(2) === 'record');
check('a field line (a name in columns 19-28)', kind(3) === 'field');
check('the line after a keyword line that ends in + is a continuation', kind(4) === 'continuation');
check('a keyword line after a line that does not continue is a keyword line again', kind(5) === 'keyword');
check('an empty line is blank', kind(6) === 'blank');
check('a help specification line (H in column 17) is laid out like a record line', kind(7) === 'record');
check('a line past the end of the source is blank (no throw)', Aids.lineKind(at(doc), 99) === 'blank' && Aids.lineKind(at(doc), -1) === 'blank');
check('a continuation is found through comment lines in between', Aids.lineKind(at(['     A            F1            10A  B  2  2DSPATR(HI +'.padEnd(80), '     A* between', kw('PC)')]), 2) === 'continuation');
check('a line with columns 7-44 blank is a keyword line, not a continuation, when nothing above continues', Aids.lineKind(at([F('F1', 'B'), kw('OVERLAY')]), 1) === 'keyword');
check('a "+" far above does not make a later keyword line a continuation (a spec line in between ends the chain)', Aids.lineKind(at([F('F1', 'B', 'DSPATR(HI +'), F('F2', 'B'), kw('OVERLAY')]), 2) === 'keyword');

// ---- zones ---------------------------------------------------------------------------------------------------------
check('a field line has all thirteen zones in order', ids(Aids.zonesAt(at(doc), 3)) === 'sequence,form,conditioning,nameType,name,reference,length,dataType,decimals,usage,line,position,functions');
check('a record line has sequence, form, conditioning, name type, name and the keyword area', ids(Aids.zonesAt(at(doc), 2)) === 'sequence,form,conditioning,nameType,name,functions');
check('a keyword line has sequence, form, conditioning and the keyword area', ids(Aids.zonesAt(at(doc), 1)) === 'sequence,form,conditioning,functions');
check('a continuation line has only the keyword area', ids(Aids.zonesAt(at(doc), 4)) === 'functions');
check('a comment and a blank line have no zones', Aids.zonesAt(at(doc), 0).zones.length === 0 && Aids.zonesAt(at(doc), 6).zones.length === 0);
const field = Aids.zonesAt(at(doc), 3).zones;
const pos = (id) => { const z = field.filter((x) => x.id === id)[0]; return z.startCharacter + '-' + z.endCharacter; };
check('the zone positions are the DDS columns, zero-based, end exclusive', [['sequence', '0-5'], ['form', '5-6'], ['conditioning', '6-16'], ['nameType', '16-17'], ['name', '18-28'], ['reference', '28-29'], ['length', '29-34'], ['dataType', '34-35'], ['decimals', '35-37'], ['usage', '37-38'], ['line', '38-41'], ['position', '41-44'], ['functions', '44-80']].every(([id, p]) => pos(id) === p));
check('the zones do not overlap and stay in column order', field.every((z, i) => z.startCharacter < z.endCharacter && (i === 0 || field[i - 1].endCharacter <= z.startCharacter)));
check('the field line the fixtures use really has its length in 30-34, data type in 35 and usage in 38', F('F1', 'B').substring(29, 34) === '   10' && F('F1', 'B').charAt(34) === 'A' && F('F1', 'B').charAt(37) === 'B' && F('F1', 'B').substring(38, 41) === '  2' && F('F1', 'B').substring(41, 44) === '  2');
check('every zone has a name and an explanation', field.every((z) => z.name && z.info.length > 10));

// ---- zoneAt / hover text ------------------------------------------------------------------------------------------------
const zone = (line, ch) => { const z = Aids.zoneAt(at(doc), line, ch); return z ? z.id : null; };
check('zoneAt: the usage column of a field line', zone(3, 37) === 'usage');
check('zoneAt: the first and the last character of a zone', zone(3, 29) === 'length' && zone(3, 33) === 'length' && zone(3, 34) === 'dataType');
check('zoneAt: the gap in column 18 and the space after the position have no zone', zone(3, 17) === null);
check('zoneAt: the keyword area is left to the keyword hover', zone(3, 44) === null && zone(3, 60) === null && zone(2, 50) === null);
check('zoneAt: a character past column 80 has no zone', zone(3, 85) === null);
check('zoneAt: a comment line has none', zone(0, 5) === null);
check('zoneAt: the name type column on a record line', zone(2, 16) === 'nameType' && zone(2, 20) === 'name');
check('hoverMarkdown names the column or the range, and the explanation', Aids.hoverMarkdown(Aids.zoneAt(at(doc), 3, 31)).indexOf('**Length** (columns 30-34)') === 0 && Aids.hoverMarkdown(Aids.zoneAt(at(doc), 3, 37)).indexOf('**Usage** (column 38)') === 0);

// ---- the hover provider, with a fake of the API ----------------------------------------------------------------------
class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
class MarkdownString { constructor(value) { this.value = value; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
const lines = doc;
const fakeDoc = { lineCount: lines.length, lineAt: (i) => ({ text: lines[i] }) };
const settings = { enable: true };
let activeLine = 3;
let served = true;
const hover = Aids.createHoverProvider({ Range, MarkdownString, Hover }, { getSettings: () => settings, shouldProvide: () => served, getActiveLine: () => activeLine });
const h = hover.provideHover(fakeDoc, { line: 3, character: 31 });
check('hover: a column of the active line is named, with its range', h && /^\*\*Length\*\*/.test(h.contents.value) && h.range.start.character === 29 && h.range.end.character === 34 && h.range.start.line === 3);
check('hover: not on a line other than the active one', hover.provideHover(fakeDoc, { line: 2, character: 17 }) === undefined);
check('hover: nothing in the keyword area', hover.provideHover(fakeDoc, { line: 3, character: 50 }) === undefined);
settings.enable = false;
check('hover: nothing when isda.columnAids.enable is off', hover.provideHover(fakeDoc, { line: 3, character: 31 }) === undefined);
settings.enable = true;
served = false;
check('hover: nothing for a document the extension does not serve', hover.provideHover(fakeDoc, { line: 3, character: 31 }) === undefined);
served = true;
activeLine = -1;
check('hover: nothing when the document is not the active editor\'s', hover.provideHover(fakeDoc, { line: 3, character: 31 }) === undefined);

// ---- the controller ----------------------------------------------------------------------------------------------------
const created = [];
const listeners = { selection: [], active: [], text: [], config: [] };
const sub = (list) => (handler) => { list.push(handler); return { dispose: () => { const i = list.indexOf(handler); if (i >= 0) list.splice(i, 1); } }; };
const editor = () => {
  const calls = [];
  return { document: fakeDoc, selection: { active: { line: 3 } }, calls, setDecorations: (type, ranges) => calls.push({ type, ranges }) };
};
let visible = [];
const api = {
  Range,
  window: {
    get visibleTextEditors() { return visible; },
    createTextEditorDecorationType: (options) => { const t = { options, disposed: false, dispose() { this.disposed = true; } }; created.push(t); return t; },
    onDidChangeTextEditorSelection: sub(listeners.selection),
    onDidChangeActiveTextEditor: sub(listeners.active),
  },
  workspace: { onDidChangeTextDocument: sub(listeners.text), onDidChangeConfiguration: sub(listeners.config) },
};
const cSettings = { enable: true };
const controller = Aids.createController(api, { getSettings: () => cSettings, shouldProvide: () => served });
check('controller: creates no decoration type until something is drawn', created.length === 0);
check('controller: listens to selection, active editor, text and configuration changes', listeners.selection.length === 1 && listeners.active.length === 1 && listeners.text.length === 1 && listeners.config.length === 1);
const e1 = editor();
visible = [e1];
listeners.selection[0]({ textEditor: e1 });
const drawn = e1.calls.filter((c) => c.ranges.length);
check('controller: a selection change draws the active line in two alternating types', created.length === 2 && e1.calls.length === 2 && drawn.length === 2);
check('  thirteen bands in all, alternating between the two types (7 and 6)', e1.calls[0].ranges.length === 7 && e1.calls[1].ranges.length === 6);
check('  every band is on the active line, at the zone\'s columns', e1.calls.every((c) => c.ranges.every((r) => r.start.line === 3 && r.end.line === 3)) && e1.calls[0].ranges[0].start.character === 0 && e1.calls[0].ranges[0].end.character === 5 && e1.calls[1].ranges[0].start.character === 5);
check('  the two types are different, subtle backgrounds', created[0].options.backgroundColor !== created[1].options.backgroundColor && /rgba\(/.test(created[0].options.backgroundColor));
e1.calls.length = 0;
e1.selection.active.line = 2;
listeners.selection[0]({ textEditor: e1 });
check('controller: moving the cursor moves the bands (record line: six zones)', e1.calls[0].ranges.length + e1.calls[1].ranges.length === 6 && e1.calls[0].ranges[0].start.line === 2 && created.length === 2);
e1.calls.length = 0;
e1.selection.active.line = 0;
listeners.selection[0]({ textEditor: e1 });
check('controller: a comment line clears the bands', e1.calls.length === 2 && e1.calls.every((c) => c.ranges.length === 0));
e1.calls.length = 0;
e1.selection.active.line = 3;
cSettings.enable = false;
listeners.selection[0]({ textEditor: e1 });
check('controller: with isda.columnAids.enable off the bands are cleared, not drawn', e1.calls.length === 2 && e1.calls.every((c) => c.ranges.length === 0));
e1.calls.length = 0;
cSettings.enable = true;
listeners.config[0]({ affectsConfiguration: (s) => s === 'isda.columnAids' });
check('controller: turning the setting on draws on the visible editors without a cursor move', e1.calls.filter((c) => c.ranges.length).length === 2);
e1.calls.length = 0;
listeners.config[0]({ affectsConfiguration: () => false });
check('controller: an unrelated configuration change does nothing', e1.calls.length === 0);
served = false;
e1.calls.length = 0;
listeners.active[0](e1);
check('controller: a document the extension does not serve is cleared, not drawn', e1.calls.length === 2 && e1.calls.every((c) => c.ranges.length === 0));
served = true;
e1.calls.length = 0;
listeners.text[0]({ document: fakeDoc });
check('controller: an edit in a visible document redraws', e1.calls.filter((c) => c.ranges.length).length === 2);
e1.calls.length = 0;
listeners.text[0]({ document: { other: true } });
check('controller: an edit in a document that is not visible does nothing', e1.calls.length === 0);
check('controller: no editor, no throw', (() => { try { controller.refresh(null); controller.refresh({}); return true; } catch (e) { return false; } })());
controller.dispose();
check('controller: dispose clears the bands, disposes both types and drops every listener', created.every((t) => t.disposed) && listeners.selection.length + listeners.active.length + listeners.text.length + listeners.config.length === 0 && e1.calls.slice(-2).every((c) => c.ranges.length === 0));

console.log('\nE1g: ' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

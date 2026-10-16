/**
 * E1f - quick-fixes (src/ddsQuickFix.js). The fixes and the text edit are pure (no vscode, no DOM); the provider
 * is exercised with a fake of the API; the real activate() wiring is in extension.test.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const DdsQuickFix = require('../ddsQuickFix.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const DspfWriter = require('../dspfWriter.js');

const moduleSource = fs.readFileSync(path.join(__dirname, '../ddsQuickFix.js'), 'utf8');
check('exports fixesFor, toTextEdit, locate, companionsOf, createProvider', ['fixesFor', 'toTextEdit', 'locate', 'companionsOf', 'createProvider'].every((n) => typeof DdsQuickFix[n] === 'function'));
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));
check('no DOM or window use', !/\b(window|document)\./.test(moduleSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\bdocument\.(uri|version|getText|eol)\b/g, '')));
check('the edits go through the writer (apply*Update), not a text splice of its own', /applyRecordUpdate/.test(moduleSource) && /applyFileKeywordsUpdate/.test(moduleSource) && /applyFieldUpdate/.test(moduleSource));
check('the companions come from the spec (requiresInFile / requiresRecordKeyword), not a table of messages', /requiresInFile/.test(moduleSource) && /requiresRecordKeyword/.test(moduleSource));

// ---- source builders: positions as in a real DDS source (the keyword area starts at column 45) ----------------
const kw = (func) => '     A' + ' '.repeat(38) + func;
const R = (name, func) => func ? ('     A          R ' + name).padEnd(44) + func : '     A          R ' + name;
const F = (name, usage, func) => {
  const base = '     A            ' + name.padEnd(10) + '    10A  ' + usage + '  2  2';
  return func ? base.padEnd(44) + func : base;
};
const CMT = (text) => '     A*' + ' ' + text;
const src = (lines, eol) => lines.join(eol || '\n');

const fixesOf = (lines, options, pick) => {
  const source = src(lines);
  const a = DdsDiagnostics.analyze(source);
  const d = a.diagnostics[pick || 0];
  return { analysis: a, diagnostic: d, fixes: d ? DdsQuickFix.fixesFor(source, d, Object.assign({ analysis: a }, options || {})) : [] };
};
const clean = (lines) => DdsDiagnostics.analyze(src(lines)).diagnostics.length === 0;
const titles = (r) => r.fixes.map((f) => f.title);

// ---- PUTRETAIN without OVERLAY: add OVERLAY, or remove PUTRETAIN ---------------------------------------------
const putretain = [R('REC1', 'PUTRETAIN'), F('F1', 'B')];
const pr = fixesOf(putretain);
check('PUTRETAIN without OVERLAY: the diagnostic is isda.multiLevelEligibility on PUTRETAIN', pr.diagnostic && pr.diagnostic.code === 'isda.multiLevelEligibility' && pr.diagnostic.keyword === 'PUTRETAIN');
check('  two fixes: add OVERLAY first, remove PUTRETAIN second', pr.fixes.length === 2 && pr.fixes[0].id === 'addCompanion:OVERLAY' && pr.fixes[1].id === 'removeKeyword');
check('  titles name the keyword and the record format', titles(pr)[0] === 'Add OVERLAY to record format REC1' && titles(pr)[1] === 'Remove PUTRETAIN');
check('  adding the companion is the preferred fix, removing is not', pr.fixes[0].preferred === true && pr.fixes[1].preferred === false);
check('  the OVERLAY line is a bare keyword in the keyword area, after the record\'s own keyword', pr.fixes[0].newLines.join('\n') === src([R('REC1', 'PUTRETAIN'), kw('OVERLAY'), F('F1', 'B')]));
check('  the source with OVERLAY added is clean', clean(pr.fixes[0].newLines));
check('  removing PUTRETAIN leaves the record format line and the field', pr.fixes[1].newLines.join('\n') === src([R('REC1'), F('F1', 'B')]));
check('  the source with PUTRETAIN removed is clean', clean(pr.fixes[1].newLines));

// ---- RETKEY without INDARA: INDARA goes to the file level ------------------------------------------------------
const retkey = [R('REC1', 'RETKEY'), F('F1', 'B')];
const rk = fixesOf(retkey);
check('RETKEY without INDARA: add INDARA to the file, or remove RETKEY', rk.fixes.length === 2 && rk.fixes[0].id === 'addCompanion:INDARA' && rk.fixes[0].title === 'Add INDARA to the file' && rk.fixes[1].title === 'Remove RETKEY');
check('  INDARA is written above the first record format when the file has no keywords', rk.fixes[0].newLines.join('\n') === src([kw('INDARA'), R('REC1', 'RETKEY'), F('F1', 'B')]));
check('  the source with INDARA is clean', clean(rk.fixes[0].newLines));
const rkFile = fixesOf([kw('DSPSIZ(24 80 *DS3)'), R('REC1', 'RETKEY'), F('F1', 'B')]);
check('  with a file keyword already there INDARA follows it', rkFile.fixes[0].newLines.join('\n') === src([kw('DSPSIZ(24 80 *DS3)'), kw('INDARA'), R('REC1', 'RETKEY'), F('F1', 'B')]));
const rkHas = fixesOf([kw('INDARA'), R('REC1', 'RETKEY'), F('F1', 'B')]);
check('  a file that has INDARA has no RETKEY diagnostic at all', rkHas.diagnostic === undefined);
const rcd = fixesOf([R('REC1', 'RETCMDKEY'), F('F1', 'B')]);
check('RETCMDKEY needs INDARA the same way (the spec lists it)', rcd.fixes.length === 2 && rcd.fixes[0].id === 'addCompanion:INDARA');

// ---- a companion that needs a value is not guessed --------------------------------------------------------------
const rmv = fixesOf([R('REC1', 'RMVWDW'), F('F1', 'B')]);
check('RMVWDW without WINDOW: only "Remove RMVWDW" (WINDOW needs geometry, so it is not invented)', rmv.fixes.length === 1 && rmv.fixes[0].id === 'removeKeyword' && rmv.fixes[0].title === 'Remove RMVWDW');
const sfldlt = fixesOf([R('REC1', 'SFLDLT'), F('F1', 'B')]);
check('SFLDLT without SFLCTL: only "Remove SFLDLT" (SFLCTL needs a record name)', sfldlt.fixes.length === 1 && sfldlt.fixes[0].title === 'Remove SFLDLT');
check('DdsQuickFix.companionsOf: bare-writable companions only', JSON.stringify(DdsQuickFix.companionsOf('PUTRETAIN')) === JSON.stringify([{ name: 'OVERLAY', level: 'record' }]) &&
  JSON.stringify(DdsQuickFix.companionsOf('RETKEY')) === JSON.stringify([{ name: 'INDARA', level: 'file' }]) &&
  DdsQuickFix.companionsOf('RMVWDW').length === 0 && DdsQuickFix.companionsOf('HLPTITLE').length === 0 && DdsQuickFix.companionsOf('HLPSCHIDX').length === 0 && DdsQuickFix.companionsOf('OPENPRT').length === 0 && DdsQuickFix.companionsOf('NOSUCH').length === 0);
check('  a companion that takes a parameter (HLPPNLGRP, PRINT) is not offered even unverified', ['HLPTITLE', 'HLPSCHIDX', 'OPENPRT'].every((k) => DdsQuickFix.companionsOf(k).length === 0));
check('  the other four keywords that need OVERLAY list it too (ERASE, ERASEINP, PROTECT, MDTOFF)', ['ERASE', 'ERASEINP', 'PROTECT', 'MDTOFF'].every((k) => DdsQuickFix.companionsOf(k).length === 1 && DdsQuickFix.companionsOf(k)[0].name === 'OVERLAY'));
const erase = fixesOf([R('REC1', 'ERASE(F1)'), F('F1', 'B')]);
check('ERASE without OVERLAY gets the same two fixes', erase.diagnostic && erase.fixes.length === 2 && erase.fixes[0].id === 'addCompanion:OVERLAY' && erase.fixes[1].title === 'Remove ERASE');

// ---- levels: field, file and help specification ----------------------------------------------------------------
const field1 = fixesOf([R('REC1'), F('F1', 'O', 'CNTFLD(3)')]);
check('a field keyword (CNTFLD on an output field) is removed from that field', field1.diagnostic.code === 'isda.fieldKind' && field1.fixes.length === 1 && field1.fixes[0].newLines.join('\n') === src([R('REC1'), F('F1', 'O')]) && clean(field1.fixes[0].newLines));
const field2 = fixesOf([R('REC1'), F('F1', 'O', 'DSPATR(HI)'), kw('CNTFLD(3)'), kw('COLOR(RED)')], { keepRemoved: false });
check('a keyword on its own line is removed with its line; its neighbours stay', field2.fixes[0].newLines.join('\n') === src([R('REC1'), F('F1', 'O', 'DSPATR(HI)'), kw('COLOR(RED)')]));
const fileLevel = fixesOf([kw('DSPSIZ(24 80 *DS3)'), kw('ALTHELP'), kw('RETKEY'), R('REC1'), F('F1', 'B')]);
check('a file-level keyword fix touches only the file keyword lines', fileLevel.diagnostic === undefined || fileLevel.fixes.every((f) => f.newLines.slice(-2).join() === [R('REC1'), F('F1', 'B')].join()));
const helpSpec = [R('REC1'), F('F1', 'B'), '     A          H                           HLPPNLGRP(A B)', kw('HLPRCD(REC1)')];
const hs = DdsDiagnostics.analyze(src(helpSpec));
const hsHlprcd = hs.diagnostics.filter((d) => d.keyword === 'HLPRCD');
check('a help specification keyword has a fix and it clears (or leaves no new problem for) its diagnostic', hsHlprcd.length > 0 && hsHlprcd.some((d) => DdsQuickFix.fixesFor(src(helpSpec), d, { analysis: hs }).length > 0));

// ---- source fidelity (I-202 - I-207) ------------------------------------------------------------------------------
const tagged = [
  '12345A* header, tag in columns 1-5 untouched',
  R('REC1', 'PUTRETAIN'),
  F('F1', 'B'),
  CMT('trailing comment') + ' '.repeat(40) + 'KEEPME',
];
const fid = fixesOf(tagged);
check('lines the fix does not touch are kept verbatim (a comment with data in columns 1-5 and text past column 80)', fid.fixes.length === 2 &&
  fid.fixes[0].newLines[0] === tagged[0] && fid.fixes[0].newLines[fid.fixes[0].newLines.length - 1] === tagged[3] &&
  fid.fixes[1].newLines[0] === tagged[0] && fid.fixes[1].newLines[fid.fixes[1].newLines.length - 1] === tagged[3]);
const own = [R('REC1', 'DSPATR(HI)'), kw('PUTRETAIN'), F('F1', 'B')];
const keepOn = fixesOf(own, { keepRemoved: true });
const keepOff = fixesOf(own, { keepRemoved: false });
const removeOn = keepOn.fixes.filter((f) => f.id === 'removeKeyword')[0];
const removeOff = keepOff.fixes.filter((f) => f.id === 'removeKeyword')[0];
check('isda.keepRemovedLines on: the removed keyword line stays as a comment', removeOn && removeOn.newLines.join('\n') === src([R('REC1', 'DSPATR(HI)'), '     A*' + ' '.repeat(37) + 'PUTRETAIN', F('F1', 'B')]));
check('isda.keepRemovedLines off: the removed keyword line is gone', removeOff && removeOff.newLines.join('\n') === src([R('REC1', 'DSPATR(HI)'), F('F1', 'B')]));
check('the writer\'s own keep-removed state is restored after a fix', (() => {
  DspfWriter.setKeepRemovedLines(false);
  fixesOf(own, { keepRemoved: true });
  const a = DspfWriter.getKeepRemovedLines();
  DspfWriter.setKeepRemovedLines(true);
  fixesOf(own, { keepRemoved: false });
  const b = DspfWriter.getKeepRemovedLines();
  DspfWriter.setKeepRemovedLines(false);
  return a === false && b === true;
})());
const trackOn = fixesOf(own, { keepRemoved: true, tracking: { enabled: true, tag: 'MK', position: 'end' } });
const trackAdd = trackOn.fixes.filter((f) => f.id === 'addCompanion:OVERLAY')[0];
const trackRemove = trackOn.fixes.filter((f) => f.id === 'removeKeyword')[0];
check('modification tracking on: an added line carries the tag at the end of the line, as a designer edit does', trackAdd && trackAdd.newLines.some((l) => /OVERLAY\s+MK$/.test(l)));
check('  a removed line is commented out once (tracking does it; keep-removed is switched off meanwhile, as in the designers)', trackRemove && trackRemove.newLines.filter((l) => /PUTRETAIN/.test(l)).length === 1 && trackRemove.newLines.some((l) => /^ {5}A\* +PUTRETAIN$/.test(l)));
const trackSeq = fixesOf(own, { tracking: { enabled: true, tag: 'MK', position: 'sequence' } });
check('  the tag can go in columns 1-5 (isda.modificationTagPosition = sequence)', trackSeq.fixes.filter((f) => f.id === 'addCompanion:OVERLAY')[0].newLines.some((l) => /^MK {3}A {38}OVERLAY$/.test(l)));
check('tracking off, tag set: nothing is tagged', !fixesOf(own, { tracking: { enabled: false, tag: 'MK', position: 'end' } }).fixes[0].newLines.some((l) => /MK/.test(l)));

// ---- verification ---------------------------------------------------------------------------------------------------
check('every fix offered clears its own diagnostic and adds none', [putretain, retkey, [R('REC1', 'RMVWDW'), F('F1', 'B')], [R('REC1'), F('F1', 'O', 'CNTFLD(3)')]].every((lines) => {
  const source = src(lines);
  const a = DdsDiagnostics.analyze(source);
  return a.diagnostics.every((d) => DdsQuickFix.fixesFor(source, d, { analysis: a }).every((f) => DdsDiagnostics.analyze(f.newLines.join('\n')).diagnostics.length < a.diagnostics.length));
}));
check('a fix that does not clear the diagnostic is not offered (verification can be seen working: a rule the fix leaves in place)', (() => {
  const source = src([R('REC1', 'PUTRETAIN'), F('F1', 'B')]);
  const a = DdsDiagnostics.analyze(source);
  const original = DdsDiagnostics.analyze;
  // After the edit the analysis still reports the same diagnostic: the fix must be dropped.
  DdsDiagnostics.analyze = function (text, o) {
    const r = original(text, o);
    if (text !== source) r.diagnostics = a.diagnostics.slice();
    return r;
  };
  try {
    return DdsQuickFix.fixesFor(source, a.diagnostics[0], { analysis: a }).length === 0;
  } finally {
    DdsDiagnostics.analyze = original;
  }
})());
check('a fix that would add a new problem is not offered', (() => {
  const source = src([R('REC1', 'PUTRETAIN'), F('F1', 'B')]);
  const a = DdsDiagnostics.analyze(source);
  const original = DdsDiagnostics.analyze;
  DdsDiagnostics.analyze = function (text, o) {
    const r = original(text, o);
    if (text !== source) r.diagnostics = [{ code: 'isda.other', keyword: 'X', record: 'REC1', line: 1, column: 1 }];
    return r;
  };
  try {
    return DdsQuickFix.fixesFor(source, a.diagnostics[0], { analysis: a }).length === 0;
  } finally {
    DdsDiagnostics.analyze = original;
  }
})());
check('verify: false skips the re-analysis', DdsQuickFix.fixesFor(src(putretain), pr.diagnostic, { analysis: pr.analysis, verify: false }).length === 2);
check('a companion the record already has is not added again (even for a stale diagnostic, unverified)', (() => {
  const lines = [R('REC1', 'PUTRETAIN'), kw('OVERLAY'), F('F1', 'B')];
  const f = DdsQuickFix.fixesFor(src(lines), pr.diagnostic, { verify: false });
  return f.length === 1 && f[0].id === 'removeKeyword';
})());
check('an iSDA rule code is required even when verification is off', DdsQuickFix.fixesFor(src(putretain), Object.assign({}, pr.diagnostic, { code: 'CRTDSPF.1234' }), { analysis: pr.analysis, verify: false }).length === 0);
check('a diagnostic with no keyword (a whole-line one) has no edit fix', (() => {
  const source = src([R('REC1', 'PUTRETAIN'), F('F1', 'B')]);
  const a = DdsDiagnostics.analyze(source);
  return DdsQuickFix.fixesFor(source, { code: 'isda.parseError', line: 1, column: 1, keyword: null }, { analysis: a }).length === 0;
})());
check('a code that is not an iSDA rule code gets nothing', DdsQuickFix.fixesFor(src(putretain), Object.assign({}, pr.diagnostic, { code: 'CRTDSPF.1234' }), { analysis: pr.analysis }).length === 0);
check('a diagnostic that no longer matches the source gets nothing (the text moved on)', DdsQuickFix.fixesFor(src(putretain), Object.assign({}, pr.diagnostic, { line: 9 }), { analysis: pr.analysis }).length === 0);
check('no diagnostic, no throw', DdsQuickFix.fixesFor(src(putretain), null).length === 0);
check('a writer that throws costs that fix only', (() => {
  const original = DspfWriter.applyRecordUpdate;
  DspfWriter.applyRecordUpdate = () => { throw new Error('boom'); };
  try {
    const fixes = DdsQuickFix.fixesFor(src(putretain), pr.diagnostic, { analysis: pr.analysis });
    return fixes.length === 0;
  } finally {
    DspfWriter.applyRecordUpdate = original;
  }
})());
check('CRLF sources are fixed the same way', (() => {
  const source = src(putretain, '\r\n');
  const a = DdsDiagnostics.analyze(source);
  const f = DdsQuickFix.fixesFor(source, a.diagnostics[0], { analysis: a });
  return f.length === 2 && f[0].newLines.join('\n') === pr.fixes[0].newLines.join('\n');
})());
check('without an analysis passed in, fixesFor analyses the source itself', DdsQuickFix.fixesFor(src(putretain), pr.diagnostic).length === 2);

// ---- toTextEdit -----------------------------------------------------------------------------------------------------
const te = DdsQuickFix.toTextEdit;
check('toTextEdit: an inserted line is an empty range at the start of the next line', JSON.stringify(te(['a', 'b'], ['a', 'x', 'b'])) === JSON.stringify({ start: { line: 1, character: 0 }, end: { line: 1, character: 0 }, newText: 'x\n' }));
check('toTextEdit: a replaced line covers that line and its line ending', JSON.stringify(te(['a', 'b', 'c'], ['a', 'B', 'c'])) === JSON.stringify({ start: { line: 1, character: 0 }, end: { line: 2, character: 0 }, newText: 'B\n' }));
check('toTextEdit: a removed line is replaced by nothing', JSON.stringify(te(['a', 'b', 'c'], ['a', 'c'])) === JSON.stringify({ start: { line: 1, character: 0 }, end: { line: 2, character: 0 }, newText: '' }));
check('toTextEdit: lines added at the very end are an empty range at the end of the last line, the line ending in front', JSON.stringify(te(['a', 'b'], ['a', 'b', 'c'])) === JSON.stringify({ start: { line: 1, character: 1 }, end: { line: 1, character: 1 }, newText: '\nc' }));
check('toTextEdit: a changed last line is replaced without a line ending', JSON.stringify(te(['a', 'b'], ['a', 'x'])) === JSON.stringify({ start: { line: 1, character: 0 }, end: { line: 1, character: 1 }, newText: 'x' }));
check('toTextEdit: removing the last line takes the line ending before it with it', JSON.stringify(te(['a', 'b'], ['a'])) === JSON.stringify({ start: { line: 0, character: 1 }, end: { line: 1, character: 1 }, newText: '' }));
check('toTextEdit: the document\'s own line ending is used', te(['a', 'b'], ['a', 'x', 'b'], '\r\n').newText === 'x\r\n');
check('toTextEdit: applying the edit to the text gives the new text (all of the fixes above, both endings)', [putretain, retkey, [R('REC1'), F('F1', 'O', 'CNTFLD(3)')], own].every((lines) => {
  return ['\n', '\r\n'].every((eol) => {
    const source = src(lines, eol);
    const a = DdsDiagnostics.analyze(source);
    return a.diagnostics.every((d) => DdsQuickFix.fixesFor(source, d, { analysis: a, keepRemoved: true }).every((f) => {
      const oldLines = source.split(/\r\n|\r|\n/);
      const e = te(oldLines, f.newLines, eol);
      const offset = (pos) => oldLines.slice(0, pos.line).reduce((n, l) => n + l.length + eol.length, 0) + pos.character;
      const result = source.slice(0, offset(e.start)) + e.newText + source.slice(offset(e.end));
      return result === f.newLines.join(eol);
    }));
  });
}));
check('toTextEdit: nothing changed is an empty edit at the end', (() => { const e = te(['a', 'b'], ['a', 'b']); return e.newText === ''; })());

// ---- the provider, with a fake of the API ---------------------------------------------------------------------------
class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } }
class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } }
class WorkspaceEdit { constructor() { this.edits = []; } replace(uri, range, text) { this.edits.push({ uri, range, text }); } }
const fakeVscode = { Range, CodeAction, WorkspaceEdit, CodeActionKind: { QuickFix: 'quickfix' } };
const settings = { enable: true, openInDesigner: true };
const editSettings = { keepRemoved: true, tracking: { enabled: false, tag: '', position: 'end' } };
let designer = 'dspfDesigner.editor';
const provider = DdsQuickFix.createProvider(fakeVscode, {
  getSettings: () => settings,
  getEditSettings: () => editSettings,
  shouldProvide: (doc) => doc.provide !== false,
  designerViewType: () => designer,
});
let docCount = 0;
const docFor = (lines, extra) => Object.assign({ uri: { toString: ((n) => () => 'file:///x' + n + '.dspf')(++docCount) }, version: 1, getText: () => src(lines), eol: 1 }, extra || {});
const vsDiag = (d) => ({ range: { start: { line: d.line - 1, character: d.column - 1 }, end: { line: d.line - 1, character: d.endColumn - 1 } }, source: 'iSDA', code: d.code, message: d.message });
const actionsFor = (lines, doc, diagnostics) => provider.provideCodeActions(doc || docFor(lines), null, { diagnostics: diagnostics || DdsDiagnostics.analyze(src(lines)).diagnostics.map(vsDiag) });

const acts = actionsFor(putretain);
check('provider: two quick-fixes and "Open in designer" for a PUTRETAIN problem', acts.length === 3 && acts.map((a) => a.title).join('|') === 'Add OVERLAY to record format REC1|Remove PUTRETAIN|Open in designer');
check('  every fix is of kind quickfix and tied to the diagnostic', acts.every((a) => a.kind === 'quickfix' && a.diagnostics.length === 1 && a.diagnostics[0].code === 'isda.multiLevelEligibility'));
check('  the preferred flag is on the companion only', acts[0].isPreferred === true && acts[1].isPreferred === false);
check('  the edit is one replace on the document, a whole inserted line', acts[0].edit.edits.length === 1 && acts[0].edit.edits[0].text === kw('OVERLAY') + '\n' &&
  acts[0].edit.edits[0].range.start.line === 1 && acts[0].edit.edits[0].range.start.character === 0 && acts[0].edit.edits[0].range.end.line === 1);
check('  "Open in designer" is vscode.openWith on the document with the designer\'s view type', acts[2].command.command === 'vscode.openWith' && acts[2].command.arguments[1] === 'dspfDesigner.editor' && /^file:\/\/\/x\d+\.dspf$/.test(acts[2].command.arguments[0].toString()) && !acts[2].edit);
check('  a CRLF document gets CRLF in the inserted text', actionsFor(putretain, docFor(putretain, { eol: 2, getText: () => src(putretain, '\r\n') }))[0].edit.edits[0].text === kw('OVERLAY') + '\r\n');
settings.enable = false;
check('isda.quickFix.enable = false: nothing is offered', actionsFor(putretain).length === 0);
settings.enable = true;
settings.openInDesigner = false;
check('isda.quickFix.openInDesigner = false: the fixes stay, "Open in designer" goes', actionsFor(putretain).length === 2 && actionsFor(putretain).every((a) => a.title !== 'Open in designer'));
settings.openInDesigner = true;
designer = null;
check('a document with no designer gets no "Open in designer"', actionsFor(putretain).length === 2);
designer = 'dspfDesigner.menuEditor';
check('a menu source opens in the menu designer', actionsFor(putretain)[2].command.arguments[1] === 'dspfDesigner.menuEditor');
designer = 'dspfDesigner.editor';
check('a document the provider does not serve gets nothing', actionsFor(putretain, docFor(putretain, { provide: false })).length === 0);
check('no diagnostics in the request, nothing offered', provider.provideCodeActions(docFor(putretain), null, { diagnostics: [] }).length === 0);
check('another source\'s diagnostics (a compiler, a spell checker) are ignored', provider.provideCodeActions(docFor(putretain), null, { diagnostics: [{ range: { start: { line: 1, character: 44 } }, source: 'CRTDSPF', code: 'isda.multiLevelEligibility' }, { range: { start: { line: 1, character: 44 } }, source: 'iSDA', code: 'CPF1234' }] }).length === 0);
check('a diagnostic the source no longer has (the document changed since) still offers "Open in designer" and no edit', (() => {
  const stale = { range: { start: { line: 0, character: 3 } }, source: 'iSDA', code: 'isda.windowDependency' };
  const a = provider.provideCodeActions(docFor(putretain), null, { diagnostics: [stale] });
  return a.length === 1 && a[0].title === 'Open in designer';
})());
editSettings.tracking = { enabled: true, tag: 'MK', position: 'end' };
check('modification tracking reaches the provider\'s edit', actionsFor(own, docFor(own)).some((a) => a.edit && /MK/.test(a.edit.edits[0].text)));
editSettings.tracking = { enabled: false, tag: '', position: 'end' };
editSettings.keepRemoved = false;
check('keep-removed off reaches the provider: the removed line is gone', (() => {
  const a = actionsFor(own, docFor(own)).filter((x) => x.title === 'Remove PUTRETAIN')[0];
  return a && a.edit.edits[0].text === '';
})());
editSettings.keepRemoved = true;
check('the analysis is shared across the diagnostics of one request and reused for the same document version', (() => {
  const original = DdsDiagnostics.analyze;
  const diagnostics = original(src(putretain)).diagnostics.map(vsDiag);
  let calls = 0;
  DdsDiagnostics.analyze = function (text, o) { if (text === src(putretain)) calls++; return original(text, o); };
  try {
    const doc = docFor(putretain, { uri: { toString: () => 'file:///cache.dspf' }, version: 7 });
    actionsFor(putretain, doc, diagnostics);
    actionsFor(putretain, doc, diagnostics);
    return calls === 1;
  } finally {
    DdsDiagnostics.analyze = original;
  }
})());

console.log('\nE1f: ' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

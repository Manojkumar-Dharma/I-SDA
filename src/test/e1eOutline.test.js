/**
 * E1e - outline and go to definition (src/ddsOutline.js). Pure module: no vscode, no DOM. The VS Code side
 * (createProvider) is exercised with a fake of the API; the real activate() wiring is in extension.test.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DdsOutline = require('../ddsOutline.js');
const KeywordSpec = require('../keywordSpec.js');

const moduleSource = fs.readFileSync(path.join(__dirname, '../ddsOutline.js'), 'utf8');
check('exports symbolsOf, definitionAt, createProvider', ['symbolsOf', 'definitionAt', 'createProvider'].every((n) => typeof DdsOutline[n] === 'function'));
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));
check('no DOM or window use', !/\b(window|document)\./.test(moduleSource.replace(/\/\*[\s\S]*?\*\//g, '')));
check('the reference keywords come from keywordSpec (not a copy of its table)', /recordReferenceKeywords\(\)/.test(moduleSource) && /recordReferenceLocator\(/.test(moduleSource) && !/SFLCTL: *\{/.test(moduleSource));

const field = (name, func, extra) => L(Object.assign({ name, length: 10, dataType: 'A', usage: 'B', line: 2, col: 2, func }, extra || {}));
const R = (name) => L({ nameType: 'R', name });
const lines = [
  L({ func: 'DSPSIZ(24 80 *DS3)' }),                                                   // 0
  R('SFLREC'),                                                                         // 1
  L({ func: 'SFL' }),                                                                  // 2
  field('F1', 'DSPATR(HI) +'),                                                         // 3
  L({ func: 'COLOR(RED)' }),                                                           // 4
  L({ comment: 'a comment after the subfile record' }),                                // 5
  R('CTL1'),                                                                           // 6
  L({ func: 'SFLCTL(SFLREC)' }),                                                       // 7
  L({ func: 'WINDOW(WREC)' }),                                                         // 8
  L({ func: "MNUBARCHC(1 SFLREC 'File')" }),                                           // 9
  field('F2', '', { length: 5, dataType: 'S', usage: 'O', decimals: 0 }),              // 10
  L({ line: 3, col: 2, func: "'Order entry'" }),                                       // 11
  L({ nameType: 'H', name: 'HLP1' }),                                                  // 12
  L({ func: 'HLPRCD(SFLREC)' }),                                                       // 13
  '     A',                                                                            // 14 blank
  R('WREC'),                                                                           // 15
  L({ line: 3, col: 2, func: "'text'" }),                                              // 16
];
const source = lines.join('\n');
const tree = DdsOutline.symbolsOf(source);
const rec = (name) => tree.filter((r) => r.name === name)[0];

// ---- the outline -----------------------------------------------------------------------------
check('one node per record format, in source order', tree.map((r) => r.name).join() === 'SFLREC,CTL1,WREC' && tree.every((r) => r.kind === 'record'));
check('the file-level keywords are not a node', tree.every((r) => r.range.startLine > 0));
check('a record\'s range starts at its R line and stops before the comment that trails it', rec('SFLREC').range.startLine === 1 && rec('SFLREC').range.endLine === 4);
check('  the next record starts at the next R line', rec('CTL1').range.startLine === 6 && rec('WREC').range.startLine === 15);
check('  a record\'s last range line is its last content line (the blank before WREC is not in CTL1)', rec('CTL1').range.endLine === 13);
check('the selection range is the name in columns 19-28', JSON.stringify(rec('SFLREC').selection) === JSON.stringify({ line: 1, startCharacter: 18, endCharacter: 24 }));
check('  and lies inside the range', tree.every((r) => r.selection.line >= r.range.startLine && r.selection.line <= r.range.endLine));
check('the subfile record says it is a subfile and names its control', rec('SFLREC').detail === 'subfile, control CTL1');
check('the control record says it is a subfile control and names its subfile (and that it is a window)', rec('CTL1').detail === 'subfile control for SFLREC, window');
check('a plain record has no detail', rec('WREC').detail === '');
check('fields are children of their record', rec('SFLREC').children.map((c) => c.name).join() === 'F1' && rec('CTL1').children.filter((c) => c.kind === 'field').map((c) => c.name).join() === 'F2');
const f1 = rec('SFLREC').children[0];
check('a field\'s range runs over its keyword continuation lines', f1.range.startLine === 3 && f1.range.endLine === 4);
check('  and its selection is its name', f1.selection.line === 3 && f1.selection.startCharacter === 18 && f1.selection.endCharacter === 20);
const ctlChildren = rec('CTL1').children;
check('a constant is a child labelled by its text', ctlChildren.some((c) => c.kind === 'constant' && c.name === 'Order entry'));
check('  with its range on its own line', ctlChildren.filter((c) => c.kind === 'constant')[0].range.startLine === 11 && ctlChildren.filter((c) => c.kind === 'constant')[0].range.endLine === 11);
const help = ctlChildren.filter((c) => c.kind === 'help')[0];
check('a help specification is a child of the record before it, named and with its keyword lines', help && help.name === 'HLP1' && help.detail === 'help specification' && help.range.startLine === 12 && help.range.endLine === 13);
check('children are in source order', ctlChildren.every((c, i) => i === 0 || ctlChildren[i - 1].range.startLine < c.range.startLine));
check('children lie inside their record', tree.every((r) => r.children.every((c) => c.range.startLine >= r.range.startLine && c.range.endLine <= r.range.endLine)));
check('an empty source, or text that is no DDS, gives an empty outline', DdsOutline.symbolsOf('').length === 0 && DdsOutline.symbolsOf('hello\nworld').length === 0);
check('a ten-character name is selected whole (columns 19-28)', (() => {
  const t = DdsOutline.symbolsOf([R('ABCDEFGHIJ'), field('KLMNOPQRST', '')].join('\n'));
  return t[0].selection.startCharacter === 18 && t[0].selection.endCharacter === 28 && t[0].children[0].selection.endCharacter === 28;
})());
check('a help specification before a field is listed before it (source order, not kind order)', (() => {
  const t = DdsOutline.symbolsOf([R('R1'), L({ nameType: 'H', name: 'HLPA' }), L({ func: 'HLPRCD(R1)' }), field('F1', '')].join('\n'));
  return t[0].children.map((c) => c.kind + ':' + c.name).join() === 'help:HLPA,field:F1' && t[0].children[0].range.endLine === 2;
})());
check('a constant longer than 40 characters (continued over two lines) is shortened with ...', (() => {
  const t = DdsOutline.symbolsOf([R('R1'), L({ line: 3, col: 2, func: "'" + 'x'.repeat(30) + '+' }), L({ func: 'y'.repeat(30) + "'" })].join('\n'));
  const label = t[0].children[0].name;
  return label.length === 40 && /\.\.\.$/.test(label);
})());
check('a record with no fields has no children', DdsOutline.symbolsOf([R('R1'), L({ func: 'OVERLAY' })].join('\n'))[0].children.length === 0);
check('the other record kinds are named (menu bar, pull-down, user-defined)', (() => {
  const t = DdsOutline.symbolsOf([R('MB'), L({ func: 'MNUBAR' }), R('PD'), L({ func: 'PULLDOWN' }), R('UD'), L({ func: 'USRDFN' })].join('\n'));
  return t.map((r) => r.detail).join('|') === 'menu bar|pull-down|user-defined';
})());
check('a subfile record no control names is just a subfile', DdsOutline.symbolsOf([R('S1'), L({ func: 'SFL' })].join('\n'))[0].detail === 'subfile');
check('two controls of one subfile are both named', DdsOutline.symbolsOf([R('S1'), L({ func: 'SFL' }), R('C1'), L({ func: 'SFLCTL(S1)' }), R('C2'), L({ func: 'SFLCTL(S1)' })].join('\n'))[0].detail === 'subfile, control C1, C2');
check('a parser that throws gives an empty outline', DdsOutline.symbolsOf(source, { parser: { parseDspf: () => { throw new Error('boom'); } } }).length === 0);
check('CRLF sources give the same outline', JSON.stringify(DdsOutline.symbolsOf(lines.join('\r\n'))) === JSON.stringify(tree));

// ---- go to definition --------------------------------------------------------------------------
const def = (ln, ch) => DdsOutline.definitionAt(source, ln, ch);
const sflctl = def(7, 52);
check('SFLCTL(SFLREC): the name goes to that record\'s R line', sflctl && sflctl.name === 'SFLREC' && sflctl.keyword === 'SFLCTL' &&
  sflctl.target.line === 1 && sflctl.target.startCharacter === 18 && sflctl.target.endCharacter === 24);
check('  the origin range is the name inside the parentheses', sflctl.origin.line === 7 && sflctl.origin.startCharacter === 51 && sflctl.origin.endCharacter === 57);
check('  and the target carries the record\'s range', sflctl.target.rangeStartLine === 1 && sflctl.target.rangeEndLine === 4);
const win = def(8, 52);
check('WINDOW(WREC): goes to WREC', win && win.keyword === 'WINDOW' && win.target.line === 15 && win.target.rangeEndLine === 16);
const mnu = def(9, 58);
check('MNUBARCHC(1 SFLREC \'File\'): the record name after the choice number goes to the record', mnu && mnu.keyword === 'MNUBARCHC' && mnu.name === 'SFLREC' && mnu.target.line === 1);
check('  at either end of the name too', def(7, 51) !== null && def(7, 57) !== null);
check('  not one character outside it', def(7, 50) === null && def(7, 58) === null);
check('the keyword name itself has no definition', def(7, 46) === null && def(7, 44) === null);
check('a name that is not a record format of the source has none', DdsOutline.definitionAt([R('A1'), L({ func: 'SFLCTL(NOPE)' })].join('\n'), 1, 52) === null);
check('record names match whatever the case', DdsOutline.definitionAt([R('SFLREC'), R('C1'), L({ func: 'SFLCTL(sflrec)' })].join('\n'), 2, 52).target.line === 0);
check('WINDOW with inline geometry has no definition', DdsOutline.definitionAt([R('W1'), L({ func: 'WINDOW(5 5 10 40)' })].join('\n'), 1, 52) === null);
check('  nor does a *DFT window', DdsOutline.definitionAt([R('W1'), L({ func: 'WINDOW(*DFT)' })].join('\n'), 1, 52) === null);
check('a keyword that is not a record reference (HLPRCD) has none', def(13, 54) === null);
check('a record name in a comment or a quoted constant has none', DdsOutline.definitionAt([R('SFLREC'), field('F1', "TEXT('SFLCTL(SFLREC)')")].join('\n'), 1, 60) === null &&
  DdsOutline.definitionAt([R('SFLREC'), L({ comment: 'SFLCTL(SFLREC)' })].join('\n'), 1, 55) === null);
check('left of column 45, past the end or off the source: none', def(7, 20) === null && def(7, 300) === null && def(99, 50) === null && def(-1, 50) === null);
check('a reference continued on the next line is found on the line the cursor is on', (() => {
  const ls = [R('LONGREC'), R('C1'), L({ func: 'SFLCTL(LONG+' }), L({ func: 'REC)' })];
  const d = DdsOutline.definitionAt(ls.join('\n'), 3, 46);
  return d && d.name === 'LONGREC' && d.origin.line === 3 && d.origin.startCharacter === 44 && d.origin.endCharacter === 47 && d.target.line === 0;
})());
check('every reference keyword of the spec table is read', KeywordSpec.recordReferenceKeywords().join() === 'SFLCTL,WINDOW,MNUBARCHC');
check('definitionAt finds the target even when the same name is typed in lower case in the R line', DdsOutline.definitionAt([R('rec'), R('C1'), L({ func: 'SFLCTL(REC)' })].join('\n'), 2, 52).target.line === 0);

// ---- the VS Code side --------------------------------------------------------------------------
{
  class Range { constructor(a, b, c, d) { this.a = a; this.b = b; this.c = c; this.d = d; } }
  class DocumentSymbol { constructor(name, detail, kind, range, sel) { this.name = name; this.detail = detail; this.kind = kind; this.range = range; this.selectionRange = sel; this.children = []; } }
  const api = { Range, DocumentSymbol, SymbolKind: { Struct: 22, Field: 7, String: 14, Interface: 10 } };
  let outline = true;
  let definition = true;
  let accept = true;
  const provider = DdsOutline.createProvider(api, { getSettings: () => ({ outline, definition }), shouldProvide: () => accept });
  const doc = { getText: () => source, uri: { toString: () => 'file:///t.dspf' } };
  const symbols = provider.provideDocumentSymbols(doc);
  check('the provider answers with DocumentSymbols, one per record', symbols.length === 3 && symbols[0] instanceof DocumentSymbol && symbols[0].name === 'SFLREC' && symbols[0].kind === 22);
  check('  the children carry their kinds (field, constant, help)', symbols[1].children.map((c) => c.kind).join() === '7,14,10');
  check('  with the detail, ranges and selection range', symbols[0].detail === 'subfile, control CTL1' && symbols[0].range.a === 1 && symbols[0].range.c === 4 && symbols[0].selectionRange.b === 18 && symbols[0].selectionRange.d === 24);
  check('  field children use the Field kind and nest', symbols[0].children[0] instanceof DocumentSymbol && symbols[0].children[0].kind === 7);
  const links = provider.provideDefinition(doc, { line: 7, character: 52 });
  check('the provider answers a definition with a link: origin, target uri, range and selection range', links.length === 1 && links[0].targetUri === doc.uri &&
    links[0].originSelectionRange.b === 51 && links[0].originSelectionRange.d === 57 && links[0].targetSelectionRange.a === 1 && links[0].targetSelectionRange.b === 18 &&
    links[0].targetRange.a === 1 && links[0].targetRange.c === 4);
  check('no definition off a reference gives undefined', provider.provideDefinition(doc, { line: 7, character: 46 }) === undefined);
  outline = false;
  check('isda.outline.enable = false gives no symbols (the definition still works)', provider.provideDocumentSymbols(doc) === undefined && provider.provideDefinition(doc, { line: 7, character: 52 }).length === 1);
  outline = true;
  definition = false;
  check('isda.definition.enable = false gives no definition (the outline still works)', provider.provideDefinition(doc, { line: 7, character: 52 }) === undefined && provider.provideDocumentSymbols(doc).length === 3);
  definition = true;
  accept = false;
  check('a document the extension does not treat as DDS gets neither', provider.provideDocumentSymbols(doc) === undefined && provider.provideDefinition(doc, { line: 7, character: 52 }) === undefined);
}

// ---- speed -------------------------------------------------------------------------------------
{
  const big = [];
  for (let i = 0; i < 4000; i++) {
    big.push(R('R' + String(i).padStart(4, '0')));
    big.push(field('F' + i, 'DSPATR(HI)'));
    big.push(field('G' + i, 'COLOR(RED)'));
    big.push(L({ comment: 'spacing' }));
  }
  const bigSource = big.join('\n');
  const t0 = Date.now();
  const t = DdsOutline.symbolsOf(bigSource);
  const ms = Date.now() - t0;
  check('the outline of a ' + big.length + '-line source (4000 records) takes under 2 s (' + ms + ' ms)', t.length === 4000 && ms < 2000);
  const t1 = Date.now();
  const d = DdsOutline.definitionAt(bigSource + '\n' + R('LASTC') + '\n' + L({ func: 'SFLCTL(R0007)' }), big.length + 1, 52);
  const ms1 = Date.now() - t1;
  check('a definition in it takes under 1 s (' + ms1 + ' ms)', d && d.target.line === 7 * 4 && ms1 < 1000);
}

process.exit(failureCount() === 0 ? 0 : 1);

/**
 * E11j3 - outline and go to definition on SFGR source (src/sfgrSymbols.js) and their wiring. Pure Node: no vscode (the
 * provider runs against a fake of the API, as in e1eOutline.test.js).
 *
 *  1. module shape;
 *  2. the outline: formats, children in source order, ranges, selections, details, continuation, blank and comment lines;
 *  3. go to definition from the name of an H specification to its S specification;
 *  4. the real sample, positions after an astral character, junk input;
 *  5. the VS Code provider and the host wiring.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const Symbols = require('../sfgrSymbols.js');

const root = path.join(__dirname, '..', '..');
const sample = fs.readFileSync(path.join(root, 'docs', 'sda-reference', 'source', 'stipfm.dspf36'), 'utf8');

function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const S = (name, extra) => mk('S', [[7, name]].concat(extra || []));
const F = (name, line, col, len, extra) => mk('D', [[7, name], [15, String(len).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)], [23, 'Y']].concat(extra || []));
const C = (name, line, col, text, extra) => mk('D', [[7, name], [15, String(text.length).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)], [23, 'Y'], [56, 'C'], [57, text]].concat(extra || []));
const H = (name, extra) => mk('H', [[7, name]].concat(extra || []));
const src = (lines) => lines.join('\n') + '\n';

// ---- 1. shape -------------------------------------------------------------------------------------------------------
const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'sfgrSymbols.js'), 'utf8');
check('exports symbolsOf, definitionAt, createProvider', ['symbolsOf', 'definitionAt', 'createProvider'].every((k) => typeof Symbols[k] === 'function'));
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));

// ---- 2. the outline -------------------------------------------------------------------------------------------------
{
  const text = src([
    S('MENU1', [[19, '24']]),
    C('T0001', 1, 2, 'MAIN MENU'),
    F('OPT', 5, 10, 2),
    mk('D', [[7, '* a comment between']]),
    C('T0002', 7, 2, 'Pick one'),
    H('HELP0001', [[34, ' 301'], [39, '1580']]),
    '',
    mk('D', [[7, '* trailing comment']]),
    S('SECOND'),
    F('NAME', 3, 5, 10, [[27, 'A']]),
    ''
  ]);
  const out = Symbols.symbolsOf(text);
  check('one node per display format, in source order', out.length === 2 && out[0].name === 'MENU1' && out[1].name === 'SECOND' && out.every((n) => n.kind === 'record'));
  check('children in source order: constant, field, constant, help', out[0].children.map((c) => c.kind).join() === 'constant,field,constant,help');
  check('a constant is shown by its text, a field and a help area by their names', out[0].children[0].name === 'MAIN MENU' && out[0].children[1].name === 'OPT' && out[0].children[3].name === 'HELP0001');
  check('a constant carries its name in the detail, a help area says so', /T0001 constant/.test(out[0].children[0].detail) && /help area/.test(out[0].children[3].detail));
  check('a field detail gives line, column, length and usage', /line 5, column 10/.test(out[0].children[1].detail) && /length 2/.test(out[0].children[1].detail) && /output/.test(out[0].children[1].detail));
  check('the format detail counts what it holds', out[0].detail === '1 field, 2 constants, 1 help area' && out[1].detail === '1 field');
  check('the range runs from the S line to the last line that is not blank or a comment', out[0].range.startLine === 0 && out[0].range.endLine === 5 && out[1].range.startLine === 8 && out[1].range.endLine === 9);
  check('the selection of a format is its name in columns 7 - 14', out[0].selection.line === 0 && out[0].selection.startCharacter === 6 && out[0].selection.endCharacter === 11);
  check('the selection of a field is its name, of a constant its text (columns 57 - 79)', out[0].children[1].selection.startCharacter === 6 && out[0].children[1].selection.endCharacter === 9 &&
    out[0].children[0].selection.startCharacter === 56 && out[0].children[0].selection.endCharacter === 65 && out[0].children[2].selection.endCharacter === 64);
  check('children lie inside their format', out.every((n) => n.children.every((c) => c.range.startLine >= n.range.startLine && c.range.endLine <= n.range.endLine)));
  check('the 132-column format says so', /132 columns/.test(Symbols.symbolsOf(src([S('WIDE', [[39, 'Y']]), F('F', 2, 2, 5)]))[0].detail));
}
{
  const cont = src([
    S('CONT'),
    C('LONG', 2, 2, 'A VERY LONG CONSTANT TEXT', [[80, 'X']]),
    mk('D', [[7, 'continues here']]),
    F('AFTER', 4, 2, 3)
  ]);
  const out = Symbols.symbolsOf(cont);
  check('a constant continued over D lines is one child with the whole range', out[0].children.length === 2 && out[0].children[0].kind === 'constant' && out[0].children[0].range.startLine === 1 && out[0].children[0].range.endLine === 2);
  check('the field after the continuation is its own child', out[0].children[1].name === 'AFTER');
  check('a long constant is cut for the outline', Symbols.symbolsOf(src([S('X'), C('K', 2, 2, 'A'.repeat(23), [[80, 'X']]), mk('D', [['7', 'B'.repeat(70)]])]))[0].children[0].name.length <= 40);
}
{
  const out = Symbols.symbolsOf(src([S(''), F('', 2, 2, 5)]));
  check('a format and a field without a name get a placeholder', out[0].name === '(no name)' && out[0].children[0].name === '(no name)');
  check('the selection of a nameless format is its line', out[0].selection.line === 0 && out[0].selection.endCharacter >= out[0].selection.startCharacter);
  check('no format, no symbols (empty, comments only, D before any S)', Symbols.symbolsOf('').length === 0 && Symbols.symbolsOf('* only a comment\n').length === 0 && Symbols.symbolsOf(F('A', 2, 2, 3) + '\n').length === 0);
  check('a format with nothing in it is one node with no children', (() => { const o = Symbols.symbolsOf(S('EMPTY') + '\n'); return o.length === 1 && o[0].children.length === 0 && o[0].range.endLine === 0; })());
}

// ---- 3. go to definition --------------------------------------------------------------------------------------------
{
  const text = src([
    S('MENU1'),
    F('A', 2, 2, 5),
    H('HELP0001', [[34, ' 301'], [39, '1580']]),
    S('HELP0001'),
    F('B', 2, 2, 5),
    H('help0001'),
    H('OTHER001'),
    H('HELP0001', [[16, 'MYHELP']]),
    H('HELP0001', [[16, ' '], [24, 'MYLIB']]),
    H('HELP0001', [[53, 'Y']])
  ]);
  const at = (line, col) => Symbols.definitionAt(text, line, col - 1);
  const d = at(2, 9);
  check('the name of an H specification leads to the S specification of that format', d && d.target.line === 3 && d.target.startCharacter === 6 && d.target.endCharacter === 14 && d.target.rangeStartLine === 3);
  check('the origin is the name', d.origin.line === 2 && d.origin.startCharacter === 6 && d.origin.endCharacter === 14);
  check('every column of the name works, the columns around it do not', at(2, 7) !== null && at(2, 14) !== null && at(2, 6) === null && at(2, 15) === null && at(2, 40) === null);
  check('the name is matched without regard to case', at(5, 8) !== null && at(5, 8).target.line === 3);
  check('a name no format has gives nothing', at(6, 8) === null);
  check('a help file name means another file: nothing', at(7, 8) === null);
  check('a help library alone also means another file: nothing', at(8, 8) === null);
  check('an online document H specification gives nothing', at(9, 8) === null);
  check('nothing on an S or D line, a comment or past the document', at(0, 8) === null && at(1, 8) === null && at(50, 3) === null);
  const dup = src([S('SAME'), S('SAME'), H('SAME')]);
  check('with the name twice the first format is the target (the duplicate is E11j1\'s to report)', Symbols.definitionAt(dup, 2, 8).target.line === 0);
}

// ---- 4. sample, astral, junk ----------------------------------------------------------------------------------------
{
  const out = Symbols.symbolsOf(sample);
  const parsed = require('../sfgrParser.js').parse(sample);
  check('the sample: one node per format with the parser\'s names', out.length === parsed.formats.length && out.every((n, i) => n.name === (parsed.formats[i].name.trim() || '(no name)')));
  check('the sample: every format\'s children are its fields and constants', out.every((n, i) => n.children.length === parsed.formats[i].fields.length + parsed.formats[i].help.length));
  check('the sample: formats do not overlap and each starts on its S line', out.every((n, i) => i === 0 || out[i - 1].range.endLine < n.range.startLine) && out.every((n, i) => n.range.startLine === parsed.formats[i].startLine - 1));
  const lines = sample.split(/\r\n|\n/);
  const sane = (n) => n.range.endLine >= n.range.startLine && n.selection.line >= n.range.startLine && n.selection.line <= n.range.endLine &&
    n.selection.endCharacter >= n.selection.startCharacter && n.selection.endCharacter <= (lines[n.selection.line] || '').length + 1 && n.children.every(sane);
  check('the sample: every range and selection is inside the document', out.every(sane));
}
{
  const mkc = (type, parts) => {   // like mk, but columns count characters (an astral character is one column)
    const a = new Array(80).fill(' ');
    a[5] = type;
    parts.forEach(([col, text]) => Array.from(text).forEach((ch, k) => { a[col - 1 + k] = ch; }));
    return a.join('').replace(/\s+$/, '');
  };
  const astral = src([mkc('S', [[7, 'A\u{1F600}B']]), mkc('D', [[7, 'F\u{1F600}'], [15, '   5'], [19, ' 2'], [21, ' 2'], [23, 'Y']])]);
  const out = Symbols.symbolsOf(astral);
  check('positions are UTF-16 after an astral character in a name', out.length === 1 && out[0].selection.endCharacter === 6 + 'A\u{1F600}B'.length && out[0].children[0].selection.endCharacter === 6 + 'F\u{1F600}'.length && out[0].children[0].name === 'F\u{1F600}');
  check('junk input gives no symbols and no definition', [null, undefined, 42, {}].every((x) => Symbols.symbolsOf(x).length === 0 && Symbols.definitionAt(x, 0, 0) === null) && Symbols.definitionAt('x', -1, 0) === null);
  check('CRLF and LF sources give the same outline', JSON.stringify(Symbols.symbolsOf(sample.replace(/\r?\n/g, '\r\n'))) === JSON.stringify(Symbols.symbolsOf(sample.replace(/\r?\n/g, '\n'))));
}

// ---- 5. provider and host -------------------------------------------------------------------------------------------
{
  class Range { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } }
  class DocumentSymbol { constructor(name, detail, kind, range, selectionRange) { Object.assign(this, { name, detail, kind, range, selectionRange, children: [] }); } }
  const api = { Range, DocumentSymbol, SymbolKind: { Struct: 1, Field: 2, String: 3, Interface: 4 } };
  const text = src([S('MENU1'), F('A', 2, 2, 5), H('HELP0001'), S('HELP0001'), F('B', 2, 2, 5)]);
  const document = { getText: () => text, uri: { toString: () => 'file:///x.dspf36' } };
  let settings = { outline: true, definition: true }, accept = true;
  const provider = Symbols.createProvider(api, { getSettings: () => settings, shouldProvide: () => accept });
  const syms = provider.provideDocumentSymbols(document);
  check('provider: DocumentSymbols with children, kinds and ranges', syms.length === 2 && syms[0] instanceof DocumentSymbol && syms[0].kind === 1 && syms[0].children[0].kind === 2 && syms[0].children[1].kind === 4 && syms[0].range.end.line === 2);
  const links = provider.provideDefinition(document, { line: 2, character: 8 });
  check('provider: a definition link with origin, target and uri', links.length === 1 && links[0].targetSelectionRange.start.line === 3 && links[0].originSelectionRange.start.line === 2 && links[0].targetUri === document.uri);
  check('provider: no definition where there is none', provider.provideDefinition(document, { line: 1, character: 8 }) === undefined);
  settings = { outline: false, definition: true };
  check('provider: outline off keeps the definition', provider.provideDocumentSymbols(document) === undefined && provider.provideDefinition(document, { line: 2, character: 8 }).length === 1);
  settings = { outline: true, definition: false };
  check('provider: definition off keeps the outline', provider.provideDefinition(document, { line: 2, character: 8 }) === undefined && provider.provideDocumentSymbols(document).length === 2);
  settings = { outline: true, definition: true }; accept = false;
  check('provider: a document that is not SFGR gets neither', provider.provideDocumentSymbols(document) === undefined && provider.provideDefinition(document, { line: 2, character: 8 }) === undefined);

  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const sfgrAt = ext.indexOf('SfgrSymbols.createProvider(vscode');
  const ddsAt = ext.indexOf('DdsOutline.createProvider(vscode');
  check('host: the SFGR outline and definition use the existing two settings and the SFGR filter', /SfgrSymbols\.createProvider\(vscode,[\s\S]{0,400}outline\.enable[\s\S]{0,200}definition\.enable[\s\S]{0,120}shouldProvide: isSfgrTextDocument/.test(ext));
  check('host: registered before the DDS outline (the DDS one stays the last symbol provider)', sfgrAt > 0 && ddsAt > sfgrAt);
  check('host: the DDS outline still answers on DDS only', /DdsOutline\.createProvider\(vscode,[\s\S]{0,500}shouldProvide: isDdsTextDocument/.test(ext));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  check('build: sfgrSymbols.js is in the copy list', /'sfgrSymbols\.js'/.test(pkg.scripts['build:webview-assets']));
}

process.exit(failureCount() === 0 ? 0 : 1);

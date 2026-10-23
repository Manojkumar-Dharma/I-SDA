/**
 * E11j2 - hover on SFGR source (src/sfgrHover.js) and its wiring. Pure Node: no vscode (the provider runs against a
 * fake of the API, as in e1cHover.test.js).
 *
 *  1. module shape, and the table agrees with the parser's columns and the E11j1 allowed values;
 *  2. the hover on S, H and D columns: title, columns, allowed values, DDS keyword, meaning of the current value;
 *  3. the places that are not an entry: sequence number, type column, comment, *DDS, continuation lines, reserved columns;
 *  4. ranges (cut at the end of a short line, UTF-16 positions after an astral character), nothing for blank or past the end;
 *  5. the real sample sweeps without a throw; junk input;
 *  6. the VS Code provider and the host wiring.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const Hover = require('../sfgrHover.js');
const Parser = require('../sfgrParser.js');
const Diagnostics = require('../sfgrDiagnostics.js');

const root = path.join(__dirname, '..', '..');
const sample = fs.readFileSync(path.join(root, 'docs', 'sda-reference', 'source', 'stipfm.dspf36'), 'utf8');

function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const at = (lines, line, col) => Hover.hoverAt(lines.join('\n'), line, col - 1);   // col is 1-based here
const md = (r) => (r ? r.markdown : '');

// ---- 1. shape and tables ----------------------------------------------------------------------------------------------
const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'sfgrHover.js'), 'utf8');
check('exports hoverAt, createProvider, describeColumn', typeof Hover.hoverAt === 'function' && typeof Hover.createProvider === 'function' && typeof Hover.describeColumn === 'function');
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));

['S', 'H', 'D'].forEach((type) => {
  const table = type === 'S' ? Parser.S_COLUMNS : type === 'H' ? Parser.H_COLUMNS : Parser.D_COLUMNS;
  check(type + ': every parser column has a description', table.every((c) => Hover.describeColumn(type, c.key)));
  check(type + ': every description is a parser column', Object.keys(Hover.INFO[type]).every((k) => table.some((c) => c.key === k)));
  Object.keys(Diagnostics.ENTRY[type]).forEach((key) => {
    const rule = Diagnostics.ENTRY[type][key];
    const d = Hover.describeColumn(type, key);
    const known = Object.keys(d.values || {});
    check(type + ' ' + key + ': every value the rule allows has a meaning', rule.letters.split('').every((c) => known.indexOf(c) >= 0));
    check(type + ' ' + key + ': an indicator is described exactly where the rule allows one', !!rule.indicator === !!d.indicator);
  });
});

// ---- 2. entries -------------------------------------------------------------------------------------------------------
{
  const s = mk('S', [[7, 'SCHOIX1'], [17, '18'], [19, '24'], [25, '64'], [27, 'Y'], [28, 'Y'], [39, 'Y'], [64, 'CV']]);
  const rs = (c) => md(at([s], 0, c));
  check('S name: title, columns, DDS', /\*\*Display format name\*\* \(columns 7 - 14, S specification\)/.test(rs(8)) && /ALTNAME/.test(rs(8)) && /`SCHOIX1`/.test(rs(8)));
  check('S start line: the value and its meaning', /\*\*Start line\*\*/.test(rs(17)) && /Current value: `18`/.test(rs(18)));
  check('S start line blank means line 1', /blank: line 1/.test(md(at([mk('S', [[7, 'A']])], 0, 8)) ) === false && /Start line/.test(md(Hover.hoverAt(mk('S', [[7, 'A'], [20, 'X']]), 0, 16))) && /blank: line 1/.test(md(Hover.hoverAt(mk('S', [[7, 'A'], [20, 'X']]), 0, 16))));
  check('S alarm: an indicator is read as an indicator', /Sound alarm/.test(rs(25)) && /Current value: `64` - indicator 64: applies while that indicator is on/.test(rs(26)) && /an indicator 01 - 99/.test(rs(25)));
  check('S enable function keys Y: only the keys in the mask', /only the keys in the key mask/.test(rs(27)));
  check('S 132 columns: DSPSIZ keyword and the meaning', /DSPSIZ\(24 80 \*DS3 27 132 \*DS4\)/.test(rs(39)) && /132 columns, 27 lines/.test(rs(39)));
  check('S key mask: the keys are named', /C = command key 3/.test(rs(64)) && /not a key/.test(md(Hover.hoverAt(mk('S', [[7, 'A'], [64, 'C?']]), 0, 63))) === true);
  check('S key mask: the function key table of the spec (2 = Page Down)', /2 = Page Down/.test(md(Hover.hoverAt(mk('S', [[7, 'A'], [64, '23']]), 0, 63))) && /3 = Page Up/.test(md(Hover.hoverAt(mk('S', [[7, 'A'], [64, '23']]), 0, 63))));
  check('S right-to-left: DDS is the file-level CHECK(RLTB)', /CHECK\(RLTB\)/.test(md(Hover.hoverAt(mk('S', [[7, 'A'], [40, 'Y']]), 0, 39))));
  check('S entries the model keeps off the DDS say so', /no DDS keyword in the model/.test(rs(19)));
}
{
  const h = mk('H', [[7, 'HELP0001'], [34, ' 301'], [39, '1580'], [44, '15'], [53, 'Y']]);
  const rh = (c) => md(at([h], 0, c));
  check('H name', /Help format name or help text label/.test(rh(7)) && /\*\*.*\(columns 7 - 14, H specification\)/.test(rh(7)));
  check('H corners: row and column read out, A0 style columns too', /row 3, column 1/.test(rh(35)) && /row 15, column 80/.test(rh(40)) &&
    /row 2, column 100/.test(md(Hover.hoverAt(mk('H', [[7, 'H'], [34, ' 2A0']]), 0, 33))));
  check('H suppress selection: indicator', /indicator 15/.test(rh(44)));
  check('H online document Y', /online document H specification/.test(rh(53)));
}
{
  const d = mk('D', [[7, 'FA0001'], [15, '  12'], [19, ' 3'], [21, 'A5'], [23, 'Y '], [26, 'Y'], [27, 'D'], [30, 'T'], [31, 'B'], [32, '37'], [37, 'Y'], [39, '60'], [49, 'Y'], [56, 'C'], [57, 'HELLO WORLD'], [80, 'X']]);
  const rd = (c) => md(at([d], 0, c));
  check('D length', /\*\*Field length\*\* \(columns 15 - 18, D specification\)/.test(rd(16)) && /Current value: `12`/.test(rd(16)));
  check('D column in the A0 form', /column 105/.test(rd(21)));
  check('D output Y', /Output data/.test(rd(23)) && /Current value: `Y` - output/.test(rd(23)));
  check('D input allowed', /Current value: `Y` - input allowed/.test(rd(26)));
  check('D data type D: digits only, DDS D, with the mapping table', /digits only \(DDS D\)/.test(rd(27)) && /B->A/.test(rd(27)));
  check('D self-check T and adjust/fill B', /modulus 10/.test(rd(30)) && /right-justify, blank fill/.test(rd(31)));
  check('D position cursor 37: DSPATR(PC) and the indicator', /DSPATR\(PC\)/.test(rd(32)) && /indicator 37/.test(rd(33)));
  check('D protect Y: DSPATR(PR)', /DSPATR\(PR\)/.test(rd(37)) && /Current value: `Y` - protected/.test(rd(37)));
  check('D high intensity with an indicator', /DSPATR\(HI\)/.test(rd(39)) && /indicator 60/.test(rd(40)));
  check('D column separators', /DSPATR\(CS\)/.test(rd(49)));
  check('D constant type C', /Current value: `C` - constant text/.test(rd(56)));
  check('D constant data: the text, trailing blanks dropped', /Current value: `HELLO WORLD`\./.test(rd(60)) && /columns 57 - 79/.test(rd(60)));
  check('D continuation X', /Current value: `X` - the next D line continues the constant/.test(rd(80)));
  check('D attribute entries name their DDS keyword', ['blink:BL', 'nondisplay:ND', 'reverseImage:RI', 'underline:UL'].every((p) => {
    const [k, kw] = p.split(':');
    return new RegExp('DSPATR\\(' + kw + '\\)').test(Hover.describeColumn('D', k).dds);
  }));
  check('D message constant: type M explains the member columns', /message/i.test(md(Hover.hoverAt(mk('D', [[56, 'M'], [57, 'MSG1U1']]), 0, 55))));
}

// ---- 3. places that are not an entry ----------------------------------------------------------------------------------
{
  const lines = [
    '     S' + 'F1',
    '     D' + '*'.padEnd(8) + 'a comment',
    '*DDS A*' + ' something',
    mk('D', [[7, 'FA0001'], [15, '   5'], [19, ' 2'], [21, ' 2'], [23, 'Y '], [56, 'C'], [57, 'A VERY LONG CONSTANT'], [80, 'X']]),
    mk('D', [[7, 'té cochés dans la liste'], [80, 'X']]),
    mk('D', [[7, '*still text']])
  ];
  check('column 6 names the specification type', /Specification type/.test(md(at(lines, 0, 6))) && /S: display control/.test(md(at(lines, 0, 6))));
  check('sequence number', /Sequence number/.test(md(at([mk('D', [[7, 'A']])], 0, 3))));
  check('a * in column 7 is a comment line', /Comment line/.test(md(at(lines, 1, 20))) && /columns 7 - 80/.test(md(at(lines, 1, 20))));
  check('a *DDS line is user DDS, in the sequence columns and after them', /User DDS line/.test(md(at(lines, 2, 2))) && /User DDS line/.test(md(at(lines, 2, 12))) && /columns 6 - 80|columns 1 - 80/.test(md(at(lines, 2, 12))));
  check('the line after an X in column 80 is constant text, not a field', /Constant continuation/.test(md(at(lines, 4, 16))) && /Constant continuation/.test(md(at(lines, 4, 8))));
  check('a continuation line can itself continue', /Current value: `X`/.test(md(at(lines, 4, 80))));
  check('the first line of the chain is still a field, its X is the continuation entry', /Field length/.test(md(at(lines, 3, 16))) && /Continuation/.test(md(at(lines, 3, 80))));
  check('after a chain that continues, a * in column 7 is still text (a comment cannot follow X)', /Constant continuation/.test(md(at(lines, 5, 10))) && !/Comment line/.test(md(at(lines, 5, 10))));
  check('the line after a continuation chain is a field again', /Field length/.test(md(Hover.hoverAt(['     D' + 'F1       5 1 1Y', '     D' + 'F2       5 2 2Y'].join('\n'), 1, 16))));
  check('reserved columns of a D line', /Reserved/.test(md(at([mk('D', [[7, 'A'], [57, 'X']])], 0, 52))) || /Reserved/.test(md(Hover.hoverAt(mk('D', [[7, 'A'], [52, 'X']]), 0, 51))));
  check('reserved columns of an S line (41 - 63)', /Reserved/.test(md(Hover.hoverAt(mk('S', [[7, 'A'], [50, 'X']]), 0, 49))));
  check('an unknown specification type: the type column says so, the rest has no hover', /is not one/.test(md(Hover.hoverAt('     Q' + 'ABC', 0, 5))) && Hover.hoverAt('     Q' + 'ABC', 0, 8) === null);
}

// ---- 4. ranges and positions -----------------------------------------------------------------------------------------
{
  const d = mk('D', [[7, 'FA0001'], [15, '   5'], [19, ' 1']]);
  const r = Hover.hoverAt(d, 0, 16);
  check('range covers the whole entry (columns 15 - 18)', r.range.startLine === 0 && r.range.startCharacter === 14 && r.range.endCharacter === 18);
  const short = Hover.hoverAt(mk('D', [[7, 'A'], [15, '  5']]), 0, 15);
  check('range is cut at the end of a short line', short.range.endCharacter === 17);
  check('nothing past the end of the line', Hover.hoverAt(d, 0, d.length - 1) !== null && Hover.hoverAt(d, 0, d.length) === null && Hover.hoverAt(d, 0, d.length + 5) === null);
  check('nothing on a blank line or a line holding only a sequence number', Hover.hoverAt('\n12345', 0, 0) === null && Hover.hoverAt('\n12345', 1, 2) === null);
  check('nothing for a line past the document', Hover.hoverAt(d, 4, 3) === null);
  const astral = '     D' + 'A\u{1F600}B     5 2 2Y';
  const ra = Hover.hoverAt(astral, 0, astral.length - 1);
  check('columns count characters, positions stay UTF-16', ra !== null && ra.range.endCharacter <= astral.length && /Output data|Column|Line|Field length/.test(ra.markdown));
  check('CRLF and LF sources hover the same', Hover.hoverAt(d + '\r\n' + d + '\r\n', 1, 16).markdown === Hover.hoverAt(d + '\n' + d + '\n', 1, 16).markdown);
  check('a byte order mark in front does not move the columns', Hover.hoverAt('\ufeff' + d, 0, 16).markdown === Hover.hoverAt(d, 0, 16).markdown);
}

// ---- 5. the sample and junk -------------------------------------------------------------------------------------------
{
  const lines = sample.split(/\r\n|\n/);
  let hovered = 0, threw = 0, empty = 0;
  lines.forEach((line, i) => {
    for (let c = 0; c < line.length; c++) {
      try { const r = Hover.hoverAt(sample, i, c); if (r && r.markdown) hovered++; else empty++; } catch (e) { threw++; }
    }
  });
  check('the sample: every character answers or gives nothing, nothing throws', threw === 0 && hovered > 1000);
  const dLine = lines.findIndex((l, i) => l.charAt(5) === 'D' && l.charAt(79) !== 'X' && (i === 0 || lines[i - 1].charAt(79) !== 'X') && l.length > 30);
  check('the sample: a D line has hover on its length and data type', /Field length/.test(md(Hover.hoverAt(sample, dLine, 16))) && /Data type|Position cursor|Output data/.test(md(Hover.hoverAt(sample, dLine, 26))));
  check('junk input gives null', [null, undefined, 42, {}, ''].every((x) => Hover.hoverAt(x, 0, 0) === null) && Hover.hoverAt('x', -1, 0) === null && Hover.hoverAt('x', 0, -3) === null);
}

// ---- 6. provider and host ---------------------------------------------------------------------------------------------
{
  class MarkdownString { constructor(v) { this.value = v; } }
  class Range { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } }
  class HoverC { constructor(m, r) { this.contents = m; this.range = r; } }
  const api = { MarkdownString, Range, Hover: HoverC };
  const d = mk('D', [[7, 'FA0001'], [15, '   5'], [19, ' 1']]);
  const document = { getText: () => d };
  let on = true, accept = true;
  const provider = Hover.createProvider(api, { getSettings: () => ({ enable: on }), shouldHover: () => accept });
  const got = provider.provideHover(document, { line: 0, character: 15 });
  check('provider: a Hover with the markdown and the range', got instanceof HoverC && /Field length/.test(got.contents.value) && got.range.start.character === 14);
  on = false;
  check('provider: isda.hover.enable off gives nothing', provider.provideHover(document, { line: 0, character: 15 }) === undefined);
  on = true; accept = false;
  check('provider: a document that is not SFGR gives nothing', provider.provideHover(document, { line: 0, character: 15 }) === undefined);
  accept = true;
  check('provider: no hover where there is none', provider.provideHover(document, { line: 0, character: 70 }) === undefined);

  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  check('host: the SFGR hover is registered with the hover setting and the SFGR filter', /SfgrHover\.createProvider\(vscode,[\s\S]{0,260}hover\.enable[\s\S]{0,120}shouldHover: isSfgrTextDocument/.test(ext));
  check('host: the DDS hover still answers on DDS only', /DdsHover\.createProvider\(vscode,[\s\S]{0,260}shouldHover: isDdsTextDocument/.test(ext));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  check('build: sfgrHover.js is in the copy list', /'sfgrHover\.js'/.test(pkg.scripts['build:webview-assets']));
}

process.exit(failureCount() === 0 ? 0 : 1);

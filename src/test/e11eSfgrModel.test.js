/**
 * E11e - SFGR source in the shared model, drawn by the existing engine (src/sfgrModel.js + dspfEngine.js).
 * Pure Node: no vscode, no DOM.
 *
 *  1. the whole sample (stipfm.dspf36): every format is a record, every D specification a field or constant, and the
 *     engine draws each one (the figures SFGR-SPEC.md gives, then what the engine does with them);
 *  2. the mapping, rule by rule, from small fixtures: constant or field, usage, output indicator, data type,
 *     decimals, lowercase, DFTVAL, message constants;
 *  3. attributes become DSPATR keywords with the right indicator, and the engine's own simulator conditions them;
 *  4. position: relative lines, the start-line offset in the engine (single and stacked), 80 and 132 columns;
 *  5. what is kept for the panels and the writer: record.sfgr, source lines, comments, help, *DDS, errors;
 *  6. the model is the shape the DDS parser gives (so nothing downstream needs an SFGR branch).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const SfgrModel = require('../sfgrModel.js');
const SfgrParser = require('../sfgrParser.js');
const DspfEngine = require('../dspfEngine.js');

const sampleText = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'sda-reference', 'source', 'stipfm.dspf36'), 'utf8');

/** A fixed-column line: parts is [[column, text], ...]; right-trimmed like the sample's. */
function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const S = (name, parts) => mk('S', [[7, name]].concat(parts || []));
const D = (name, parts) => mk('D', [[7, name]].concat(parts || []));
const POS = (len, line, col) => [[15, String(len).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)]];
const model = (lines) => SfgrModel.buildModel(lines.join('\n'));
const draw = (file, name, on, sizeIndex) => DspfEngine.resolveScreen(file, name, new Set(on || []), null, false, sizeIndex || 0);
const kwNames = (f) => f.keywords.map((k) => k.raw).join(' ');

// ---- 1. the sample ---------------------------------------------------------------------------------------------------
{
  const parsed = SfgrParser.parse(sampleText);
  const file = SfgrModel.buildModel(parsed);
  const dEntries = parsed.entries.filter((e) => e.kind === 'D');
  check('sample: sourceKind sfgr, no errors, no file keywords (every format is 24 x 80)', file.sourceKind === 'sfgr' &&
    file.errors.length === 0 && file.fileKeywords.length === 0 && file.sfgr.sizes.length === 1 && file.sfgr.sizes[0].columns === 80);
  check('sample: 7 records named as the S specifications name them', file.records.map((r) => r.name).join() === 'CHOIX1,CHOIX,SAISIE,SELECT,ECRDI,SORTIE,CHOIX2');
  check('sample: one model field per D entry (496), none needs two', file.records.reduce((n, r) => n + r.fields.length, 0) === 496 &&
    file.records.every((r, i) => r.fields.length === parsed.formats[i].fields.length));
  const all = [].concat(...file.records.map((r) => r.fields));
  const constants = all.filter((f) => f.nameType === 'CONSTANT');
  check('sample: 280 constants (CONSTANT, no usage, no name) and 216 fields', constants.length === 280 && all.length - constants.length === 216 &&
    constants.every((f) => f.usage === null && f.name === '' && f.constantValue !== null));
  check('sample: the 6 constants that allow input are fields (usage B or I) whose DFTVAL is the constant, so 280 + 6 = the 286 constants of the source',
    all.filter((f) => f.nameType === 'FIELD' && f.keywords.some((k) => k.name === 'DFTVAL')).length === 6 &&
    dEntries.filter((e) => e.role === 'constant').length === 286);
  check('sample: usage counts (172 output, 43 input/output, 1 input) - no hidden usage, nothing needed two entries', (() => {
    const u = {};
    all.filter((f) => f.nameType === 'FIELD').forEach((f) => { u[f.usage] = (u[f.usage] || 0) + 1; });
    return u.O === 172 && u.B === 43 && u.I === 1 && u.H === undefined;
  })());
  check('sample: every field remembers its source line and the D specification it came from', all.every((f, i) =>
    f.sourceLine === f.sfgr.line && f.entrySourceLines[0] === f.sourceLine && f.sfgr.part === 'whole' && f.sfgr.specName !== ''));
  check('sample: a field that continues over several lines lists them all (177 - 180)', (() => {
    const f = all.find((x) => x.sourceLine === 177);
    return f && f.entrySourceLines.join() === '177,178,179,180' && f.sfgr.endLine === 180;
  })());
  check('sample: record sfgr info (start line only on SORTIE = 18, lines to clear, 80 columns)', file.records.map((r) => r.sfgr.startLine).join() === ',,,,,18,' &&
    file.records.map((r) => r.sfgr.linesToClear).join() === '24,24,0,24,0,0,24' && file.records.every((r) => r.sfgr.columns132 === false) &&
    file.records[3].sfgr.keyMask.commandKeys.length === 5);

  // the engine draws every format
  let engineErrors = 0;
  let overlaps = 0;
  const outside = [];
  let drawn = 0;
  let hidden = 0;
  file.records.forEach((r) => {
    const sc = draw(file, r.name);
    if (sc.error || sc.suppressed) engineErrors++;
    overlaps += (sc.overlaps || []).length;
    drawn += new Set(sc.fields.map((f) => f.sourceLine)).size; // E11f: a wrapped field is several pieces of one source line
    sc.fields.forEach((f) => {
      if (f.line < 1 || f.line > sc.lines || f.column < 1 || f.column + f.length - 1 > sc.columns) outside.push(f);
    });
    hidden += r.fields.length - new Set(sc.fields.map((f) => f.sourceLine)).size;
  });
  check('sample: the engine resolves all 7 formats without an error, 24 x 80', engineErrors === 0 && draw(file, 'CHOIX1').lines === 24 && draw(file, 'CHOIX1').columns === 80);
  const plainNd = (f) => f.keywords.some((k) => k.raw === 'DSPATR(ND)' && k.conditions.length === 0);
  const notDrawn = all.filter((f) => plainNd(f) || f.conditions.length > 0).length;
  check('sample: with no indicator on, the fields not drawn are the nondisplay ones (7) and the ones whose output indicator is off (3)',
    drawn + hidden === 496 && hidden === notDrawn && all.filter(plainNd).length === 7 && all.filter((f) => f.conditions.length > 0).length === 3);
  check('sample: no field overlaps another on a format', overlaps === 0);
  check('sample: 6 constants run past the right edge (188, 59, 89, 112, 126 and 102 cells); since E11f the engine wraps them onto the next rows, so none is past the edge (e11fPreviewFidelity.test.js)',
    outside.length === 0 && file.records.every((r) => draw(file, r.name).fields.every((f) => f.wrapCount === undefined || f.wrapCount >= 2)));
  check('sample: format SORTIE starts on line 18: its first field (relative line 1) is drawn on row 18',
    draw(file, 'SORTIE').fields[0].line === 18 && draw(file, 'SORTIE').fields[0].anchorLine === 1 &&
    draw(file, 'SORTIE').fields.every((f) => f.line >= 18));
  check('sample: a format with no start line is drawn on the source\'s own rows (row = line)', file.records.filter((r) => r.sfgr.startLine === null)
    .every((r) => draw(file, r.name).fields.every((f) => f.line === f.anchorLine + (f.wrapIndex || 0))));
}

// ---- 2. mapping rules --------------------------------------------------------------------------------------------------
{
  // constant with no input
  const c = model([S('F1'), D('K1', POS(10, 3, 5).concat([[56, 'C'], [57, 'HELLO']]))]);
  const k = c.records[0].fields[0];
  check('constant: CONSTANT, no name, no usage, text padded to the field length (10)', k.nameType === 'CONSTANT' && k.name === '' &&
    k.usage === null && k.constantValue === 'HELLO     ' && k.length === 10 && k.dataType === null);
  check('constant: location is the source line and column, relative', k.location.line === 3 && k.location.column === 5 &&
    k.location.relativeColumnOffset === null);
  check('constant: the engine draws the text at that cell', draw(c, 'F1').fields.length === 1 && draw(c, 'F1').fields[0].text.trim() === 'HELLO' &&
    draw(c, 'F1').fields[0].line === 3 && draw(c, 'F1').fields[0].column === 5);

  // fields: the usage matrix
  const usage = (out, input, extra) => model([S('F1'), D('A', POS(5, 2, 2).concat([[23, out], [26, input]], extra || []))]).records[0].fields.map((f) => f.usage + (f.conditions.length ? '/' + f.conditions[0].indicators[0].number : '')).join();
  check('usage: input only is I', usage('', 'Y') === 'I' && usage('N', 'Y') === 'I');
  check('usage: output Y and input Y is B; an output indicator with input is B and does not condition the field', usage('Y', 'Y') === 'B' && usage('07', 'Y') === 'B');
  check('usage: output only is O; output indicator conditions the field on it', usage('Y', '') === 'O' && usage('07', 'N') === 'O/07');
  check('usage: neither output nor input is H (nothing draws it)', usage('', '') === 'H' && usage('N', 'N') === 'H');
  const ff = model([S('F1'), D('NAME1', POS(5, 2, 2).concat([[23, 'Y']]))]).records[0].fields[0];
  check('field: name and nameType, no constant text', ff.nameType === 'FIELD' && ff.name === 'NAME1' && ff.constantValue === null && ff.length === 5 && ff.lengthRaw === '5');
  check('field: the engine draws the field name inside its box', draw(model([S('F1'), D('NAME1', POS(5, 2, 2).concat([[23, 'Y']]))]), 'F1').fields[0].text === 'NAME1');

  // constant with an output indicator: two entries at one place
  const ci = model([S('F1'), D('CI', POS(6, 4, 7).concat([[23, '12'], [56, 'C'], [57, 'ABC']]))]).records[0].fields;
  check('constant with output indicator: two entries, the constant when N12 and the program data (usage O) when 12', ci.length === 2 &&
    ci[0].nameType === 'CONSTANT' && ci[0].conditions[0].indicators[0].number === '12' && ci[0].conditions[0].indicators[0].not === true &&
    ci[1].nameType === 'FIELD' && ci[1].usage === 'O' && ci[1].conditions[0].indicators[0].not === false &&
    ci[0].sfgr.part === 'constantWhenOff' && ci[1].sfgr.part === 'dataWhenOn' && ci[1].name === 'CI');
  const ciFile = model([S('F1'), D('CI', POS(6, 4, 7).concat([[23, '12'], [56, 'C'], [57, 'ABC']]))]);
  check('constant with output indicator: the engine draws the constant with 12 off and the field with 12 on, never both',
    draw(ciFile, 'F1', []).fields.length === 1 && draw(ciFile, 'F1', []).fields[0].text.trim() === 'ABC' &&
    draw(ciFile, 'F1', ['12']).fields.length === 1 && draw(ciFile, 'F1', ['12']).fields[0].text.startsWith('CI'));
  const cy = model([S('F1'), D('CY', POS(6, 4, 7).concat([[23, 'Y'], [56, 'C'], [57, 'ABC']]))]).records[0].fields;
  check('constant with output Y and no input: the constant shows (one CONSTANT)', cy.length === 1 && cy[0].nameType === 'CONSTANT');

  // constant with input allowed: a field with DFTVAL
  const cin = model([S('F1'), D('CN', POS(6, 4, 7).concat([[26, 'Y'], [56, 'C'], [57, "IT'S"]]))]).records[0].fields;
  check('constant with input: a FIELD (I) whose DFTVAL is the constant, quotes doubled', cin.length === 1 && cin[0].nameType === 'FIELD' &&
    cin[0].usage === 'I' && kwNames(cin[0]) === "DFTVAL('IT''S')");
  const cinb = model([S('F1'), D('CN', POS(6, 4, 7).concat([[23, 'Y'], [26, 'Y'], [56, 'C'], [57, 'X']]))]).records[0].fields;
  check('constant with input and output: usage B, and the engine shows the DFTVAL in the field', cinb[0].usage === 'B' &&
    draw(model([S('F1'), D('CN', POS(6, 4, 7).concat([[23, 'Y'], [26, 'Y'], [56, 'C'], [57, 'X']]))]), 'F1').fields[0].text.trim() === 'X');

  // message constant
  const mc = model([S('F1'), D('MM', POS(8, 5, 2).concat([[56, 'M'], [57, 'ABC1'], [61, 'U2']]))]).records[0].fields[0];
  check('message constant: CONSTANT showing [id], id and member kept', mc.nameType === 'CONSTANT' && mc.constantValue === '[ABC1]  ' &&
    mc.sfgr.message.id === 'ABC1' && mc.sfgr.message.member === 'U2');

  // data type and decimals
  const dt = (t) => model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [27, t]]))]).records[0].fields[0];
  const table = { '': '', B: 'A', A: 'X', M: 'N', N: 'M', S: 'S', R: 'I', Z: 'A', D: 'D', K: 'W', E: 'E', F: 'E', O: 'O', X: 'J' };
  check('data type: the manual\'s table (B-18) for every SFGR type', Object.keys(table).every((t) => dt(t).dataType === table[t]) &&
    dt('S').sfgrDataType === undefined && dt('S').sfgr.sfgrDataType === 'S');
  check('data type: only S gets decimal positions (0)', dt('S').decimalPositions === 0 && dt('S').decimalPositionsRaw === '0' &&
    dt('A').decimalPositions === null && dt('D').decimalPositions === null);
  const bad = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [27, 'Q']]))]);
  check('data type: one SFGR does not define is read as blank and reported', bad.records[0].fields[0].dataType === '' &&
    bad.errors.length === 1 && bad.errors[0].line === 2 && /Data type "Q"/.test(bad.errors[0].message));
  check('data type: numeric S is drawn with 9s by the engine, blank with Xs', draw(model([S('F1'), D('ABCDEFGH', POS(8, 2, 2).concat([[23, 'Y'], [27, 'S']]))]), 'F1').fields[0].text === 'ABCDEFGH' &&
    draw(model([S('F1'), D('AB', POS(5, 2, 2).concat([[23, 'Y'], [27, 'S']]))]), 'F1').fields[0].text === 'AB999');

  // lowercase
  const lc = (formatCol21, d51, extra) => model([S('F1', formatCol21 ? [[21, formatCol21]] : []), D('A', POS(5, 2, 2).concat([[26, 'Y'], [51, d51]], extra || []))]).records[0].fields[0];
  check('lowercase: D column 51 Y gives LOWER on an input field', kwNames(lc('', 'Y')) === 'LOWER' && kwNames(lc('', '')) === '');
  check('lowercase: the format default (S column 21) applies when column 51 is blank, and N in column 51 wins over it',
    kwNames(lc('Y', '')) === 'LOWER' && kwNames(lc('Y', 'N')) === '');
  check('lowercase: not on an output-only field and not on a numeric one', model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [51, 'Y']]))]).records[0].fields[0].keywords.length === 0 &&
    kwNames(lc('', 'Y', [[27, 'S']])) === '' && kwNames(lc('', 'Y', [[27, 'D']])) === '');
}

// ---- 3. attributes -----------------------------------------------------------------------------------------------------
{
  const attr = (col, value) => model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [col, value]]))]).records[0].fields[0];
  const cases = [['protect', 37, 'PR'], ['highIntensity', 39, 'HI'], ['blink', 41, 'BL'], ['nondisplay', 43, 'ND'], ['reverseImage', 45, 'RI'], ['underline', 47, 'UL']];
  cases.forEach(([label, col, code]) => {
    const on = attr(col, 'Y');
    check('attribute ' + label + ': Y is DSPATR(' + code + ') with no condition; N and blank are none', kwNames(on) === 'DSPATR(' + code + ')' &&
      on.keywords[0].conditions.length === 0 && kwNames(attr(col, 'N')) === '' && kwNames(attr(col, '')) === '');
    const ind = attr(col, '37');
    check('attribute ' + label + ': an indicator conditions the keyword on it', kwNames(ind) === 'DSPATR(' + code + ')' &&
      ind.keywords[0].conditions.length === 1 && ind.keywords[0].conditions[0].indicators[0].number === '37' &&
      ind.keywords[0].conditions[0].indicators[0].not === false && ind.keywords[0].sourceLines.join() === '2');
  });
  check('attribute column separators (column 49): Y is DSPATR(CS), N none, an indicator is not allowed and is reported', kwNames(attr(49, 'Y')) === 'DSPATR(CS)' &&
    kwNames(attr(49, 'N')) === '' && (() => {
      const m = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [49, '5']]))]);
      return m.errors.length === 1 && /column 49|columnSeparators/.test(m.errors[0].message) && kwNames(m.records[0].fields[0]) === '';
    })());
  const pc = model([S('F1'), D('A', POS(5, 2, 2).concat([[26, 'Y'], [32, '41']]))]).records[0].fields[0];
  check('attribute position cursor (columns 32 - 33): an indicator gives DSPATR(PC) conditioned on it', kwNames(pc) === 'DSPATR(PC)' &&
    pc.keywords[0].conditions[0].indicators[0].number === '41');

  // several attributes on one field, in column order, each with its own condition
  const multi = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [37, '60'], [39, 'Y'], [47, '61']]))]).records[0].fields[0];
  check('attributes: several on one field, one DSPATR keyword each with its own indicator', kwNames(multi) === 'DSPATR(PR) DSPATR(HI) DSPATR(UL)' &&
    multi.keywords.map((k) => k.conditions.length).join() === '1,0,1');

  // the engine's own simulator conditions them
  const file = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [39, '37'], [45, 'Y']]))]);
  const off = draw(file, 'F1', []).fields[0].style;
  const on = draw(file, 'F1', ['37']).fields[0].style;
  check('engine: the indicator decides high intensity, the unconditioned reverse image is always on', off.hi === false && off.reverse === true &&
    on.hi === true && on.reverse === true);
  const nd = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y'], [43, '22']]))]);
  check('engine: nondisplay with its indicator off draws the field, on hides it', draw(nd, 'F1', []).fields.length === 1 && draw(nd, 'F1', ['22']).fields.length === 0);
  const pr = model([S('F1'), D('A', POS(5, 2, 2).concat([[26, 'Y'], [37, 'Y']]))]);
  check('engine: protect and position cursor reach the preview style', draw(pr, 'F1').fields[0].style.protect === true);
  const cur = model([S('F1'), D('A', POS(5, 2, 2).concat([[26, 'Y'], [32, 'Y']]))]);
  check('engine: position cursor marks the field', draw(cur, 'F1').fields[0].style.positionCursor === true);
  // an invalid attribute entry is reported once even when the D makes two fields
  const dup = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, '12'], [56, 'C'], [57, 'Z'], [39, 'Q']]))]);
  check('an invalid entry is reported once, though the specification makes two fields', dup.records[0].fields.length === 2 &&
    dup.errors.filter((e) => /highIntensity/.test(e.message)).length === 1);
  check('the two fields do not share keyword objects', (() => {
    const m = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, '12'], [56, 'C'], [57, 'Z'], [39, 'Y']]))]).records[0].fields;
    return m[0].keywords[0] !== m[1].keywords[0] && m[0].keywords[0].conditions !== m[1].keywords[0].conditions;
  })());
}

// ---- 4. position, start line, size -----------------------------------------------------------------------------------
{
  const startAt = (start, line) => model([S('F1', start === '' ? [] : [[17, String(start).padStart(2)]]), D('A', POS(5, line, 4).concat([[23, 'Y']]))]);
  check('start line: blank, 1 and V draw the field on its own line', [startAt('', 3), startAt(1, 3), model([S('F1', [[17, ' V']]), D('A', POS(5, 3, 4).concat([[23, 'Y']]))])]
    .every((f) => draw(f, 'F1').fields[0].line === 3));
  check('start line: 10 and field line 3 draw on row 12 (start line + line - 1)', draw(startAt(10, 3), 'F1').fields[0].line === 12 &&
    startAt(10, 3).records[0].fields[0].location.line === 3 && draw(startAt(10, 3), 'F1').fields[0].anchorLine === 3);
  check('start line: V is kept as a flag and reads as line 1', model([S('F1', [[17, ' V']])]).records[0].sfgr.startLineVariable === true &&
    model([S('F1', [[17, ' V']])]).records[0].sfgr.startLine === null);

  // two formats stacked on one screen
  const stack = model([S('LOW', [[17, '12'], [19, ' 0']]), D('X', POS(4, 1, 2).concat([[23, 'Y']])), S('HIGH', [[19, ' 0']]), D('Y', POS(4, 2, 2).concat([[23, 'Y']]))]);
  const multi = DspfEngine.resolveMultiScreen(stack, ['HIGH', 'LOW'], new Set(), 0);
  check('start line: stacked formats are drawn each at its own start line (resolveMultiScreen)', multi.fields.length === 2 &&
    multi.fields.find((f) => f.sourceRecord === 'LOW').line === 12 && multi.fields.find((f) => f.sourceRecord === 'HIGH').line === 2);

  // 80 and 132 columns
  const only80 = model([S('A80'), D('X', POS(4, 1, 2).concat([[23, 'Y']]))]);
  check('size: all formats 24 x 80 needs no DSPSIZ', only80.fileKeywords.length === 0 && draw(only80, 'A80').lines === 24 && draw(only80, 'A80').columns === 80);
  const only132 = model([S('B132', [[39, 'Y']]), D('X', POS(4, 1, 'A0').concat([[23, 'Y']]))]);
  check('size: all formats 132 columns gives DSPSIZ(27 132 *DS4) and the engine draws 27 x 132', only132.fileKeywords.length === 1 &&
    only132.fileKeywords[0].raw === 'DSPSIZ(27 132 *DS4)' && draw(only132, 'B132').lines === 27 && draw(only132, 'B132').columns === 132 &&
    draw(only132, 'B132').fields[0].column === 100 && only132.records[0].sfgr.columns132 === true);
  const both = model([S('A80'), D('X', POS(4, 1, 2).concat([[23, 'Y']])), S('B132', [[39, 'Y']]), D('Y', POS(4, 1, 'C0').concat([[23, 'Y']]))]);
  check('size: both gives one DSPSIZ with the two sizes, and sizeIndexOf says which a format is drawn on', both.fileKeywords[0].raw === 'DSPSIZ(24 80 *DS3 27 132 *DS4)' &&
    SfgrModel.sizeIndexOf(both, 'A80') === 0 && SfgrModel.sizeIndexOf(both, 'B132') === 1 && SfgrModel.sizeIndexOf(both, 'NONE') === 0 &&
    both.sfgr.sizes.map((s) => s.columns).join() === '80,132');
  check('size: the 132-column format drawn on its own size has its field at column 120 inside the screen', (() => {
    const sc = draw(both, 'B132', [], SfgrModel.sizeIndexOf(both, 'B132'));
    return sc.columns === 132 && sc.lines === 27 && sc.fields[0].column === 120 && sc.fields[0].column + sc.fields[0].length - 1 <= 132;
  })());
  check('size: a file with no formats has no keyword and the 80 x 24 default', (() => {
    const e = model([]);
    return e.records.length === 0 && e.fileKeywords.length === 0 && e.sfgr.sizes[0].columns === 80;
  })());
}

// ---- 5. what is kept ---------------------------------------------------------------------------------------------------
{
  const h = mk('H', [[7, 'HELP01'], [16, 'MYHLP'], [34, ' 5 3'], [39, '2078']]);
  const m = model([mk('S', [[7, '* a header comment']]), S('F1', [[25, '64'], [27, 'Y'], [28, 'Y'], [64, 'CV']]), h, '*DDS A*    FRCDTA',
    D('A', POS(5, 2, 2).concat([[23, 'Y']])), mk('D', [[7, '*a field comment']])]);
  const r = m.records[0];
  check('kept: the S specification\'s other entries are in record.sfgr.values (alarm 64, enable keys Y), not turned into keywords',
    r.sfgr.values.alarm === '64' && r.sfgr.values.enableFunctionKeys === 'Y' && r.sfgr.values.enableCommandKeys === 'Y' && r.keywords.length === 0 &&
    r.conditions.length === 0);
  check('kept: the key mask, decoded', r.sfgr.keyMask.text === 'CV' && r.sfgr.keyMask.commandKeys[0].number === 3 && r.sfgr.keyMask.commandKeys[1].number === 21);
  check('kept: H specifications with their corners (the model\'s DDS help entries stay empty)', r.sfgr.help.length === 1 && r.sfgr.help[0].values.name === 'HELP01' &&
    r.sfgr.help[0].upperLeft.row === 5 && r.sfgr.help[0].lowerRight.column === 78 && r.helpEntries.length === 0);
  check('kept: *DDS blocks whole, with the lines as the generator writes them', r.sfgr.passThrough.length === 1 && r.sfgr.passThrough[0].line === 4 &&
    r.sfgr.passThrough[0].ddsLines[0].charAt(5) === 'A');
  check('kept: comments with their line, before and inside formats', m.comments.map((c) => c.line + ':' + c.text).join('|') === '1: a header comment|6:a field comment');
  check('kept: record and file positions - the S line, the last line of the format', r.sourceLine === 2 && r.sfgr.sourceLine === 2 && r.sfgr.endLine === 6);

  const withProblems = model([S('F1'), '     A          R REC1', D('B', POS(5, 2, 2).concat([[23, 'Y'], [80, 'X']]))]);
  check('errors: parse errors come through with line and raw text; warnings do not', withProblems.errors.length === 2 &&
    withProblems.errors[0].line === 2 && withProblems.errors[0].raw === '     A          R REC1' &&
    withProblems.errors[1].line === 3 && /continues on the next line/.test(withProblems.errors[1].message));
  check('errors: not text, not a source - still a model, never an exception', (() => {
    try {
      return [null, undefined, 42, {}, ''].every((v) => { const f = SfgrModel.buildModel(v); return Array.isArray(f.records) && f.sourceKind === 'sfgr'; });
    } catch (e) { return false; }
  })());
  check('buildModel takes a parse result as well as text', SfgrModel.buildModel(SfgrParser.parse('     SF1\n     DA    5 2 2Y')).records[0].fields.length === 1);
}

// ---- 6. the shape the DDS parser gives -----------------------------------------------------------------------------------
{
  const DspfParser = require('../../dist/dspfParser.js');
  const dds = DspfParser.parseDspf ? DspfParser.parseDspf('     A          R REC1\n     A            F1             5A  O  2  2') : null;
  const sfgr = model([S('F1'), D('A', POS(5, 2, 2).concat([[23, 'Y']]))]);
  const fieldKeys = (f) => Object.keys(f).filter((k) => k !== 'sfgr').sort().join();
  if (dds && dds.records && dds.records[0] && dds.records[0].fields[0]) {
    check('shape: a model field has exactly the keys a DDS parser field has (the only addition is sfgr)', fieldKeys(sfgr.records[0].fields[0]) === fieldKeys(dds.records[0].fields[0]));
    check('shape: a record has the keys of a DDS record (and sfgr)', Object.keys(sfgr.records[0]).filter((k) => k !== 'sfgr').sort().join() === Object.keys(dds.records[0]).sort().join());
    check('shape: the file has the keys of a DDS file (and sourceKind, sfgr)', Object.keys(sfgr).filter((k) => k !== 'sourceKind' && k !== 'sfgr').sort().join() === Object.keys(dds).sort().join());
  } else {
    check('shape: the DDS parser build (dist/dspfParser.js) is available to compare against', false);
  }
  check('the module has no vscode in it', !/require\(\s*['"]vscode['"]\s*\)/.test(fs.readFileSync(path.join(__dirname, '..', 'sfgrModel.js'), 'utf8')));
}

process.exit(failureCount() === 0 ? 0 : 1);

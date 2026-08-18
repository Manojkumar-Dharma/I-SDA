/**
 * dspfEngine.test.js
 *
 * Direct unit coverage for two dspfEngine.js behaviors:
 *  - DSPSIZ declaring more than one screen size (24x80 AND 27x132 in the
 *    same file), and selecting between them by index.
 *  - SFLPAG rows being capped to what actually fits within the display's
 *    working area, instead of rendering straight past the bottom of the
 *    screen when SFLPAG (or its fallback) is larger than the screen.
 * Pure Node, no vscode/jsdom needed. Run with: node src/test/dspfEngine.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

console.log('DSPSIZ: single size (existing behavior, unchanged)');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hello'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const sizes = DspfEngine.availableScreenSizes(model);
  check('reports exactly one declared size', sizes.length === 1);
  check('that size is 24x80', sizes[0].lines === 24 && sizes[0].columns === 80);

  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('resolveScreen defaults to the declared size', screen.lines === 24 && screen.columns === 80);
  check('resolveScreen exposes availableSizes too', screen.availableSizes.length === 1);
}

console.log('DSPSIZ: dual size (24x80 and 27x132 in the same file)');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hello'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const sizes = DspfEngine.availableScreenSizes(model);
  check('reports both declared sizes', sizes.length === 2);
  check('first size is 24x80 (*DS3)', sizes[0].lines === 24 && sizes[0].columns === 80 && sizes[0].name === '*DS3');
  check('second size is 27x132 (*DS4)', sizes[1].lines === 27 && sizes[1].columns === 132 && sizes[1].name === '*DS4');

  const defaultScreen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('no sizeIndex -> defaults to the FIRST declared size (24x80), same as pre-existing single-size behavior', defaultScreen.lines === 24 && defaultScreen.columns === 80);

  const largeScreen = DspfEngine.resolveScreen(model, 'SCR1', new Set(), null, false, 1);
  check('sizeIndex 1 -> the SECOND declared size (27x132)', largeScreen.lines === 27 && largeScreen.columns === 132);

  const outOfRange = DspfEngine.resolveScreen(model, 'SCR1', new Set(), null, false, 99);
  check('an out-of-range sizeIndex falls back to the first size rather than erroring', outOfRange.lines === 24 && outOfRange.columns === 80);

  const multi = DspfEngine.resolveMultiScreen(model, ['SCR1'], new Set(), 1);
  check('resolveMultiScreen also respects sizeIndex', multi.lines === 27 && multi.columns === 132);
}

console.log('SFLPAG: capped to the display working area (not left to overflow past the bottom of the screen)');
{
  // 24-line screen; the subfile detail record's field sits at (record-relative)
  // line 3 with a 1-line row height, so rows can start filling from absolute
  // line 3 - floor((24 - 3 + 1) / 1) = 22 rows fit. A SFLPAG of 9999 (the
  // "virtually unlimited" pattern real SDA-generated files often use) should
  // render 22 rows, not 9999.
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(9999)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(9999)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
    buildLine({ seq: '00205', line: '1', col: '2', func: "'Report'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const ctlScreen = DspfEngine.resolveScreen(model, 'SFLCTLR', new Set());
  check('SFLCTL-side preview: declared SFLPAG(9999) is exposed as-is', ctlScreen.subfilePreview.declaredPageRows === 9999);
  check('SFLCTL-side preview: rendered rows are capped within the 24-line screen', ctlScreen.subfilePreview.pageRows < 9999 && ctlScreen.subfilePreview.pageRows > 0);
  check('SFLCTL-side preview: capped rows fit exactly within the working area', ctlScreen.subfilePreview.pageRows === 22);

  const sflScreen = DspfEngine.resolveScreen(model, 'SFLREC', new Set(), null, true);
  check('SFL-side (template) preview: declared count exposed separately', sflScreen.declaredPreviewRowCount === 9999);
  check('SFL-side (template) preview: rendered count is capped, not 9999', sflScreen.previewRowCount < 9999 && sflScreen.previewRowCount > 0);
  check('SFL-side (template) preview: no field renders past the bottom of the screen', sflScreen.fields.every((f) => (f.line + (f.height || 1) - 1) <= sflScreen.lines));

  const largerScreen = DspfEngine.resolveScreen(model, 'SFLREC', new Set(), null, true, undefined);
  // Sanity: same file re-resolved at the (only) declared size gives the same cap.
  check('cap is stable/deterministic across calls', largerScreen.previewRowCount === sflScreen.previewRowCount);
}

console.log('SFLPAG: hidden/program-to-system fields (usage H/P) with no explicit position do not inflate row height');
{
  // Regression for a real-world pattern: hidden helper fields (H_LIBNAME,
  // H_SEQNO, H_ERR - usage H, no line/col of their own) declared BEFORE the
  // row's visible fields. Previously these fell back to "line 1" for row-
  // height purposes, and since the visible fields sit at line 9, that
  // computed an 8-line-too-tall row height (9 - 1 + 1 = 9 instead of 1),
  // spacing every subfile preview row 9 lines apart instead of stacking
  // them immediately below one another.
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFL01', func: 'SFL' }),
    buildLine({ seq: '00110', name: 'H_LIBNAME', length: '10', dataType: 'A', usage: 'H' }),
    buildLine({ seq: '00120', name: 'H_SEQNO', length: '4', dataType: 'Y', decimals: '0', usage: 'H' }),
    buildLine({ seq: '00130', name: 'S1SEQNO', length: '4', dataType: 'Y', decimals: '0', usage: 'B', line: '9', col: '4' }),
    buildLine({ seq: '00140', name: 'S1LIBNAME', length: '10', dataType: 'A', usage: 'B', line: '9', col: '12' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTL01', func: 'SFLCTL(SFL01)' }),
    buildLine({ seq: '00210', func: 'SFLSIZ(9999)' }),
    buildLine({ seq: '00220', func: 'SFLPAG(0039)' }),
    buildLine({ seq: '00230', func: 'SFLDSP' }),
    buildLine({ seq: '00240', func: 'SFLDSPCTL' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SFLCTL01', new Set());

  const seqFields = screen.subfilePreview.fields.filter((f) => f.name === 'S1SEQNO');
  check('renders more than the old buggy 2-row result (16 rows fit in a 24-line screen starting at line 9)', screen.subfilePreview.pageRows === 16);
  check('consecutive preview rows are exactly 1 line apart, not 9', seqFields[1].line - seqFields[0].line === 1);
  check('rows stack starting right at the declared line 9, not shifted down to line 1 + 9', seqFields[0].line === 9);
}

console.log('SFLPAG: small declared page size is left untouched (no clamping needed)');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0010)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0004)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const screen = DspfEngine.resolveScreen(model, 'SFLCTLR', new Set());
  check('a SFLPAG that already fits is rendered at its declared size, unclamped', screen.subfilePreview.pageRows === 4);
  check('declaredPageRows matches pageRows when nothing was capped', screen.subfilePreview.declaredPageRows === screen.subfilePreview.pageRows);
}

console.log('screenLinesForRecord: respects a non-24 DSPSIZ (regression - a broken /\\\\d+/g regex once made this always fall back to 24 silently)');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Menu'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');

  check('a 27-line DSPSIZ is read as 27, not the 24-line fallback', DspfEngine.screenLinesForRecord(model, record) === 27);
}

console.log('screenLinesForRecord: record-level DSPSIZ overrides file-level');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'MENU', func: 'DSPSIZ(27 132 *DS4)' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Menu'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');

  check('the record-level DSPSIZ (27) wins over the file-level one (24)', DspfEngine.screenLinesForRecord(model, record) === 27);
}

console.log('screenLinesForRecord: falls back to 24 when DSPSIZ is absent entirely');
{
  const src = [
    buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Menu'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');

  check('no DSPSIZ anywhere -> the documented 24-line default', DspfEngine.screenLinesForRecord(model, record) === 24);
}

console.log('\ndisplay-size conditioning: a field shown only in one of two declared sizes');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Always here'" }),
    buildLine({ seq: '00040', line: '2', col: '90', func: "'Wide only'", sizeCondition: '*DS4' }),
    buildLine({ seq: '00050', line: '2', col: '5', func: "'Normal only'", sizeCondition: 'N*DS4' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const atNormal = DspfEngine.resolveScreen(model, 'MENU', new Set(), null, false, 0);
  check('resolves to the *DS3 size (24x80) at index 0', atNormal.lines === 24 && atNormal.columns === 80);
  check('reports sizeName for the active size', atNormal.sizeName === '*DS3');
  check('unconditioned field always shows', atNormal.fields.some((f) => f.text === 'Always here'));
  check('the *DS4-only field is hidden at *DS3', !atNormal.fields.some((f) => f.text === 'Wide only'));
  check('the N*DS4 ("not wide") field shows at *DS3', atNormal.fields.some((f) => f.text === 'Normal only'));

  const atWide = DspfEngine.resolveScreen(model, 'MENU', new Set(), null, false, 1);
  check('resolves to the *DS4 size (27x132) at index 1', atWide.lines === 27 && atWide.columns === 132);
  check('reports sizeName for the active size', atWide.sizeName === '*DS4');
  check('unconditioned field still shows', atWide.fields.some((f) => f.text === 'Always here'));
  check('the *DS4-only field now shows', atWide.fields.some((f) => f.text === 'Wide only'));
  check('the N*DS4 field is now hidden', !atWide.fields.some((f) => f.text === 'Normal only'));
}

console.log('\ndisplay-size conditioning: a DSPATR keyword conditioned by size (styleFromKeywords path)');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Text'" }),
    buildLine({ seq: '00040', sizeCondition: '*DS4', func: 'DSPATR(HI)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const atNormal = DspfEngine.resolveScreen(model, 'MENU', new Set(), null, false, 0);
  check('DSPATR(HI) not applied at *DS3 (the condition is not satisfied)', atNormal.fields[0].style.hi === false);

  const atWide = DspfEngine.resolveScreen(model, 'MENU', new Set(), null, false, 1);
  check('DSPATR(HI) applied at *DS4 (the condition is satisfied)', atWide.fields[0].style.hi === true);
}

console.log('validateSizeBounds: single-size file has nothing to compare, always empty');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00030', line: '25', col: '2', func: "'Off-screen, but only one size declared'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const problems = DspfEngine.validateSizeBounds(model, 'SCR1', new Set());
  check('no problems reported for a single declared size', problems.length === 0);
}

console.log('validateSizeBounds: an unconditioned field that does not fit within the smaller declared size');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Fits fine'" }),
    buildLine({ seq: '00040', line: '25', col: '2', func: "'Too far down for 24 lines'" }),
    buildLine({ seq: '00050', line: '5', col: '75', func: "'Too far right for 80 cols'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const problems = DspfEngine.validateSizeBounds(model, 'SCR1', new Set());
  check('reports exactly the two out-of-bounds fields', problems.length === 2);
  check('all problems are against the smaller *DS3 (24x80) size', problems.every((p) => p.sizeName === '*DS3'));
  check('none against the larger *DS4 size, which both fields fit within', !problems.some((p) => p.sizeName === '*DS4'));
}

console.log('validateSizeBounds: a field explicitly conditioned to only the size it fits within is not flagged');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Fits fine'" }),
    buildLine({ seq: '00040', sizeCondition: '*DS4', line: '25', col: '2', func: "'Only shows at DS4, fits fine there'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const problems = DspfEngine.validateSizeBounds(model, 'SCR1', new Set());
  check('the *DS4-only field is not flagged, since it never renders at the smaller size', problems.length === 0);
}

console.log('date (L) field display length honors the field\'s own DATFMT keyword');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'NODFMT', dataType: 'L', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00030', name: 'ISOFLD', dataType: 'L', usage: 'B', line: '2', col: '2', func: 'DATFMT(*ISO)' }),
    buildLine({ seq: '00040', name: 'USAFLD', dataType: 'L', usage: 'B', line: '3', col: '2', func: 'DATFMT(*USA)' }),
    buildLine({ seq: '00050', name: 'EURFLD', dataType: 'L', usage: 'B', line: '4', col: '2', func: 'DATFMT(*EUR)' }),
    buildLine({ seq: '00060', name: 'JISFLD', dataType: 'L', usage: 'B', line: '5', col: '2', func: 'DATFMT(*JIS)' }),
    buildLine({ seq: '00070', name: 'MDYFLD', dataType: 'L', usage: 'B', line: '6', col: '2', func: 'DATFMT(*MDY)' }),
    buildLine({ seq: '00080', name: 'DMYFLD', dataType: 'L', usage: 'B', line: '7', col: '2', func: 'DATFMT(*DMY)' }),
    buildLine({ seq: '00090', name: 'YMDFLD', dataType: 'L', usage: 'B', line: '8', col: '2', func: 'DATFMT(*YMD)' }),
    buildLine({ seq: '00100', name: 'JULFLD', dataType: 'L', usage: 'B', line: '9', col: '2', func: 'DATFMT(*JUL)' }),
    buildLine({ seq: '00110', name: 'JOBFLD', dataType: 'L', usage: 'B', line: '10', col: '2', func: 'DATFMT(*JOB)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const lengthOf = (name) => screen.fields.find((f) => f.name === name).length;

  check('no DATFMT specified -> *ISO default (10)', lengthOf('NODFMT') === 10);
  check('*ISO -> 10', lengthOf('ISOFLD') === 10);
  check('*USA -> 10', lengthOf('USAFLD') === 10);
  check('*EUR -> 10', lengthOf('EURFLD') === 10);
  check('*JIS -> 10', lengthOf('JISFLD') === 10);
  check('*MDY -> 8', lengthOf('MDYFLD') === 8);
  check('*DMY -> 8', lengthOf('DMYFLD') === 8);
  check('*YMD -> 8', lengthOf('YMDFLD') === 8);
  check('*JUL -> 6', lengthOf('JULFLD') === 6);
  check('*JOB -> always reserves 10, even though it may display as fewer characters at runtime', lengthOf('JOBFLD') === 10);
}

console.log('date (L) field display length falls back to record-level, then file-level DATFMT');
{
  const src = [
    buildLine({ seq: '00005', func: 'DATFMT(*USA)' }),
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'FILEDFLT', dataType: 'L', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00030', nameType: 'R', name: 'SCR2', func: 'DATFMT(*MDY)' }),
    buildLine({ seq: '00040', name: 'RECDFLT', dataType: 'L', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00050', name: 'FLDOVER', dataType: 'L', usage: 'B', line: '2', col: '2', func: 'DATFMT(*JUL)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const s1 = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('no field or record DATFMT -> inherits file-level *USA (10)', s1.fields.find((f) => f.name === 'FILEDFLT').length === 10);

  const s2 = DspfEngine.resolveScreen(model, 'SCR2', new Set());
  check('no field DATFMT, but record has one -> inherits record-level *MDY (8), NOT the file-level *USA', s2.fields.find((f) => f.name === 'RECDFLT').length === 8);
  check('a field with its own DATFMT overrides the record-level one', s2.fields.find((f) => f.name === 'FLDOVER').length === 6);
}

console.log('time (T) field display length is always 8, unaffected by TIMFMT (already exact - regression check)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'TMFLD', dataType: 'T', usage: 'B', line: '1', col: '2', func: 'TIMFMT(*USA)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('time field is 8 chars regardless of TIMFMT', screen.fields[0].length === 8);
}

console.log('numeric decimal-point width rule now also covers usage B (both), not just I (input-only)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'NUMB', length: '5', dataType: 'S', decimals: '2', usage: 'B', line: '1', col: '2' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('usage B numeric field with decimals gets +1 for the decimal point', screen.fields[0].length === 6);
}

console.log('runtime-positioned WINDOW placeholder: single-record mode is unchanged (always the same fixed spot)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(*DFT 5 20)' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'Window 1'" }),
    buildLine({ seq: '00030', nameType: 'R', name: 'WIN2', func: 'WINDOW(*DFT 5 20)' }),
    buildLine({ seq: '00040', line: '1', col: '2', func: "'Window 2'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const win1 = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  const win2 = DspfEngine.resolveScreen(model, 'WIN2', new Set());
  check('WIN1 alone is at the original fixed placeholder (2,2)', win1.window.line === 2 && win1.window.col === 2);
  check('WIN2 alone is ALSO at (2,2) - no meaningful stagger with only one window ever visible at a time', win2.window.line === 2 && win2.window.col === 2);
}

console.log('runtime-positioned WINDOW placeholder: compare mode staggers multiple placeholder windows so they do not render on top of each other');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(*DFT 5 20)' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'Window 1'" }),
    buildLine({ seq: '00030', nameType: 'R', name: 'WIN2', func: 'WINDOW(*DFT 5 20)' }),
    buildLine({ seq: '00040', line: '1', col: '2', func: "'Window 2'" }),
    buildLine({ seq: '00050', nameType: 'R', name: 'WIN3', func: 'WINDOW(10 30 5 20)' }),
    buildLine({ seq: '00060', line: '1', col: '2', func: "'Window 3 - literal position'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const multi = DspfEngine.resolveMultiScreen(model, ['WIN1', 'WIN2', 'WIN3'], new Set());
  const byName = Object.fromEntries(multi.windows.map((w) => [w.recordName, w]));

  check('the first placeholder window keeps the original spot (2,2)', byName.WIN1.line === 2 && byName.WIN1.col === 2);
  check('the second placeholder window is staggered to a different spot', byName.WIN2.line !== byName.WIN1.line || byName.WIN2.col !== byName.WIN1.col);
  check('both placeholder windows are still flagged positionIsDefault', byName.WIN1.positionIsDefault === true && byName.WIN2.positionIsDefault === true);
  check('a literally-positioned window (WIN3) is completely unaffected by staggering', byName.WIN3.line === 10 && byName.WIN3.col === 30 && byName.WIN3.positionIsDefault === false);
}

console.log("a bare constant's resolved width reflects its real text length, not a 1-char placeholder");
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', line: '1', col: '15', func: "'Metadata Building Process'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check("width matches the literal text's real length (25 chars)", screen.fields[0].length === 'Metadata Building Process'.length);
}

console.log('two indicator-conditioned constants at the identical position: exactly one shows, switching correctly with the indicator');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', ind1: 'N77', line: '1', col: '15', func: "'Metadata Building Process'" }),
    buildLine({ seq: '00030', ind1: '77', line: '1', col: '15', func: "'Refresh Metadata Process'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const off = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('indicator 77 off: shows the N77-conditioned constant', off.fields.length === 1 && off.fields[0].text === 'Metadata Building Process');

  const on = DspfEngine.resolveScreen(model, 'SCR1', new Set(['77']));
  check('indicator 77 on: shows the 77-conditioned constant instead', on.fields.length === 1 && on.fields[0].text === 'Refresh Metadata Process');
}

console.log("an under-counted constant width no longer shifts a LATER field's relative-column position on the same line");
{
  // The second field's column is relative (+N = N columns after where the
  // PREVIOUS field ends) - if the constant's own width were wrongly treated
  // as ~0/1 char instead of its real 6-char length, this field would land
  // several columns too far left.
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', line: '1', col: '1', func: "'Label:'" }),
    buildLine({ seq: '00030', name: 'AFTER', length: '5', dataType: 'A', usage: 'B', line: '1', col: '+3' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const label = screen.fields.find((f) => f.text === 'Label:');
  const after = screen.fields.find((f) => f.name === 'AFTER');
  check("the constant's own resolved width is its real 6-char length", label.length === 6);
  check('the relatively-positioned field lands 3 cols after the constant actually ends (col 1 + 6 + 3 = 10)', after.column === 10);
}

if (failures > 0) {
  console.log('\n' + failures + ' FAILURE(S)');
  process.exit(1);
} else {
  console.log('\nALL CHECKS PASSED');
}

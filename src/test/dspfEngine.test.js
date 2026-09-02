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
  check(
    'SFLCTL-side preview fields are tagged "subfile-edit-row-" (editable, 0.9.38) not the old "subfile-preview-row-" (read-only) tag',
    ctlScreen.subfilePreview.fields.every((f) => f.tag && f.tag.indexOf('subfile-edit-row-') === 0)
  );

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

console.log('\nBug fix: WDWBORDER on a WINDOW record actually reflects in the resolved screen and rendered HTML (was previously parsed/written but never shown in the preview)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 8 30)' }),
    buildLine({ seq: '00020', func: 'WDWBORDER((*COLOR BLU) (*DSPATR HI))' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hello'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('resolved window carries the *COLOR as a CSS hex color (BLU)', screen.window.border.color === DspfEngine.COLOR_HEX.BLU);
  check('resolved window carries the *DSPATR attribute list', screen.window.border.attrs.indexOf('HI') >= 0);

  const html = DspfEngine.renderScreenHtml(screen);
  // Task L32: this WDWBORDER doesn't specify *CHAR, so it now picks up the
  // documented *CHAR default (period/colon pattern) and switches into
  // char-mode - the plain CSS box border-color is suppressed in char mode
  // (color is applied per-character instead, see the *CHAR test below), so
  // this is no longer a plain box border with an inline border-color.
  check('the rendered window div is switched into char-mode (no *CHAR was specified, so it now gets the documented default)', /dspf-window-border[^"]*dspf-window-border-charmode/.test(html));
  check('the rendered window div carries the HI-attribute class', /dspf-window-border[^"]*dspf-window-border-hi/.test(html) || /dspf-window-border-hi[^"]*dspf-window-border/.test(html));
}

console.log('\nWDWBORDER *CHAR: the 8 border-position characters render as an actual character overlay, not just a plain CSS box border');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 4 6)' }),
    buildLine({ seq: '00020', func: "WDWBORDER((*CHAR '1' '2' '3' '4' '5-" }),
    buildLine({ seq: '00025', func: "' '6' '7' '8'))" }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hi'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('resolved window carries all 8 border characters in order', screen.window.border.chars.join(',') === '1,2,3,4,5,6,7,8');

  const html = DspfEngine.renderScreenHtml(screen);
  // WINDOW(3 10 4 6): top=3, left=10, height=4, width=6 -> bottom=6, right=15
  check('top-left corner (1) rendered at row 3, col 10', /class="dspf-window-char" style="grid-row:3;grid-column:10;[^>]*>1</.test(html));
  check('top-right corner (3) rendered at row 3, col 15', /class="dspf-window-char" style="grid-row:3;grid-column:15;[^>]*>3</.test(html));
  check('bottom-left corner (6) rendered at row 6, col 10', /class="dspf-window-char" style="grid-row:6;grid-column:10;[^>]*>6</.test(html));
  check('bottom-right corner (8) rendered at row 6, col 15', /class="dspf-window-char" style="grid-row:6;grid-column:15;[^>]*>8</.test(html));
  check('top border (2) repeated across the top row interior cells', /class="dspf-window-char" style="grid-row:3;grid-column:1[1-4];[^>]*>2</.test(html));
  check('left border (4) repeated down the left column interior rows', /class="dspf-window-char" style="grid-row:[45];grid-column:10;[^>]*>4</.test(html));
  check('right border (5) repeated down the right column interior rows', /class="dspf-window-char" style="grid-row:[45];grid-column:15;[^>]*>5</.test(html));
  check('bottom border (7) repeated across the bottom row interior cells', /class="dspf-window-char" style="grid-row:6;grid-column:1[1-4];[^>]*>7</.test(html));
  check('the window div itself is switched into char-mode (plain box border suppressed)', /dspf-window-border[^"]*dspf-window-border-charmode/.test(html));
}

console.log('\nWDWBORDER *CHAR: a blank position renders no character cell (matches real DDS "blank means nothing drawn there")');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 4 6)' }),
    buildLine({ seq: '00020', func: "WDWBORDER((*CHAR ' ' '2' '3' '4' '5-" }),
    buildLine({ seq: '00025', func: "' '6' '7' '8'))" }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hi'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  const html = DspfEngine.renderScreenHtml(screen);
  check('the blank top-left corner has no rendered char cell at that position', !/class="dspf-window-char" style="grid-row:3;grid-column:10;/.test(html));
}

console.log('\nWDWBORDER *CHAR: *COLOR applies to the rendered characters themselves (not a suppressed box border) when both are set together');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 4 6)' }),
    buildLine({ seq: '00020', func: "WDWBORDER((*COLOR BLU) (*CHAR '1' '-" }),
    buildLine({ seq: '00025', func: "2' '3' '4' '5' '6' '7' '8'))" }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hi'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  const html = DspfEngine.renderScreenHtml(screen);
  check('a rendered border-char cell carries the *COLOR as its own inline color', new RegExp('dspf-window-char" style="grid-row:3;grid-column:10;color:' + DspfEngine.COLOR_HEX.BLU).test(html));
}

console.log('\nBug fix (reported: "no border color" - a window rendered with no border at all, where real SDA showed a solid colored box): WDWBORDER\u2019s *CHAR takes ONE combined character-string value (up to 8 characters, positional), not 8 separate quoted literals - real-world DDS commonly writes it that way (confirmed against IBM\u2019s own WDWBORDER documentation), even though this codebase\u2019s own writer (setWdwBorder) always emits 8 separate quotes');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 4 6)' }),
    buildLine({ seq: '00020', func: "WDWBORDER((*CHAR '12345678'))" }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hi'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('a single combined 8-char string is split across the 8 positions, same as 8 separate quotes would be', screen.window.border.chars.join(',') === '1,2,3,4,5,6,7,8');
}

console.log('\nBug fix (same report, the exact reported case): a single combined *CHAR string of ALL BLANKS is correctly read as 8 individual blank positions - not as one non-blank 8-character blob in position 0 with positions 1-7 silently empty, which used to wrongly trigger "char mode" (suppressing the plain colored box border) while rendering nothing visible in any of the 8 cells - net result, no border shown at all');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 4 6)' }),
    buildLine({ seq: '00020', func: "WDWBORDER((*COLOR BLU) (*DSPATR RI)-" }),
    buildLine({ seq: '00025', func: "  (*CHAR '        '))" }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hi'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('all 8 positions are individually blank, not one 8-space blob in position 0', screen.window.border.chars.every((c) => c === ' '));
  check('*COLOR still resolves to blue', screen.window.border.color === DspfEngine.COLOR_HEX.BLU);

  const html = DspfEngine.renderScreenHtml(screen);
  check('the window div is NOT switched into char-mode (all-blank chars means "no border characters", not "char mode with invisible characters")', !/dspf-window-border[^"]*dspf-window-border-charmode/.test(html));
  check('the plain box border is shown instead, carrying *COLOR as its own inline border-color - matching real SDA\u2019s solid blue box', new RegExp('class="dspf-window-border" style="[^"]*border-color:' + DspfEngine.COLOR_HEX.BLU).test(html));
  check('no dspf-window-char cells are rendered at all (nothing to draw - blank means nothing drawn there)', !/class="dspf-window-char"/.test(html));
}

console.log('\nTask L32: a partial WDWBORDER (only *COLOR set) still gets IBM\u2019s own documented per-sub-parameter defaults for the groups it left unset, rather than staying blank');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 4 6)' }),
    buildLine({ seq: '00020', func: 'WDWBORDER((*COLOR RED))' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hi'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('the explicit *COLOR RED still wins outright', screen.window.border.color === DspfEngine.COLOR_HEX.RED);
  check('the unset *CHAR group picks up the documented period/colon default instead of staying blank', screen.window.border.chars.join(',') === '.,.,.,:,:,:,.,:');

  const html = DspfEngine.renderScreenHtml(screen);
  check('dspf-window-char cells ARE now rendered (the *CHAR default makes them "specified")', /dspf-window-char/.test(html));
  check('the window div IS switched into char-mode', /dspf-window-border-charmode/.test(html));
  check('the rendered border characters carry the explicit RED color, not the *CHAR default\u2019s own unrelated color', new RegExp('dspf-window-char" style="grid-row:3;grid-column:10;color:' + DspfEngine.COLOR_HEX.RED).test(html));
}

console.log('\nTask L32: a partial WDWBORDER (only *DSPATR set) gets BOTH the *COLOR-blue and *CHAR-period/colon defaults, independent of each other');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 4 6)' }),
    buildLine({ seq: '00020', func: 'WDWBORDER((*DSPATR HI))' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hi'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('the explicit *DSPATR HI still wins outright', screen.window.border.attrs.indexOf('HI') >= 0);
  check('the unset *COLOR group defaults to blue', screen.window.border.color === DspfEngine.COLOR_HEX.BLU);
  check('the unset *CHAR group defaults to the period/colon pattern', screen.window.border.chars.join(',') === '.,.,.,:,:,:,.,:');
}

console.log('\nWDWBORDER: record-level keyword takes precedence over a file-level default (matches every other record-vs-file DDS keyword)');
{
  const src = [
    buildLine({ seq: '00005', func: 'WDWBORDER((*COLOR GRN))' }),
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(3 10 8 30)' }),
    buildLine({ seq: '00020', func: 'WDWBORDER((*COLOR RED))' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'Hello'" }),
    buildLine({ seq: '00040', nameType: 'R', name: 'WIN2', func: 'WINDOW(3 10 8 30)' }),
    buildLine({ seq: '00050', line: '1', col: '2', func: "'World'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const win1 = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  const win2 = DspfEngine.resolveScreen(model, 'WIN2', new Set());
  check("WIN1's own WDWBORDER overrides the file-level default (RED, not GRN)", win1.window.border.color === DspfEngine.COLOR_HEX.RED);
  check("WIN2 (no record-level WDWBORDER) falls back to the file-level default (GRN)", win2.window.border.color === DspfEngine.COLOR_HEX.GRN);
}

console.log('\nBug fix: SNGCHCFLD/MLTCHCFLD (radio/checkbox) choice rows are sized wide enough to actually fit their rendered glyph+text, not just the raw field length');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'PREFS' }),
    buildLine({ seq: '00020', name: 'SHIPOPT', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '3', col: '5', func: 'SNGCHCFLD' }),
    buildLine({ seq: '00021', func: "CHOICE(1 'Standard')" }),
    buildLine({ seq: '00022', func: "CHOICE(2 'Express')" }),
    buildLine({ seq: '00023', func: "CHOICE(3 'Overnight')" }),
    buildLine({ seq: '00030', name: 'TOPPINGS', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '8', col: '5', func: 'MLTCHCFLD' }),
    buildLine({ seq: '00031', func: "CHOICE(1 'Cheese')" }),
    buildLine({ seq: '00032', func: "CHOICE(2 'Pepperoni')" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'PREFS', new Set());
  const radio = screen.fields.find((f) => f.name === 'SHIPOPT');
  const checkbox = screen.fields.find((f) => f.name === 'TOPPINGS');

  // Radio glyph as actually emitted by widgetInnerHtml() is "( \u25CF )" / "(   )"
  // (5 chars) plus one literal space before the choice text (6 total) - the
  // widest choice here is "Overnight" (9 chars), so the cell must be >= 15.
  check('radio widget width fits its widest choice\u2019s actual glyph + text ("( \u25CF ) Overnight" = 15 cols)', radio.length >= 15);

  // Checkbox glyph is "[ ]" (3 chars) + 1 literal space (4 total); widest
  // choice is "Pepperoni" (9 chars), so the cell must be >= 13.
  check('checkbox widget width fits its widest choice\u2019s actual glyph + text ("[ ] Pepperoni" = 13 cols)', checkbox.length >= 13);

  check('radio widget height is one row per choice', radio.height === 3);
  check('checkbox widget height is one row per choice', checkbox.height === 2);
}

console.log('\nBug fix: a SNGCHCFLD/MLTCHCFLD field with no CHOICE entries yet is sized for its own "(no CHOICE entries)" placeholder, not left at the raw field length');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'EMPTYR' }),
    buildLine({ seq: '00020', name: 'OPT', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '2', col: '2', func: 'SNGCHCFLD' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'EMPTYR', new Set());
  const opt = screen.fields.find((f) => f.name === 'OPT');
  // "( \u25CF ) (no CHOICE entries)" = 6 + 19 = 25 columns.
  check('placeholder-only radio widget is wide enough for "(no CHOICE entries)" plus its glyph prefix', opt.length >= 25);
  check('placeholder-only radio widget is still exactly one row tall', opt.height === 1);
}

console.log('\nBug fix: DSPATR(PC) "position cursor" now has a visible effect - only the first eligible field gets the cursor indicator');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'PCR' }),
    buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', decimals: '', usage: 'B', line: '2', col: '2' }),
    buildLine({ seq: '00030', func: 'DSPATR(PC)' }),
    buildLine({ seq: '00040', name: 'FLD2', length: '10', dataType: 'A', decimals: '', usage: 'B', line: '3', col: '2' }),
    buildLine({ seq: '00050', func: 'DSPATR(PC)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'PCR', new Set());
  const fld1 = screen.fields.find((f) => f.name === 'FLD1');
  const fld2 = screen.fields.find((f) => f.name === 'FLD2');
  check('FLD1 is flagged as a DSPATR(PC) field', fld1.style.positionCursor === true);
  check('FLD2 is also flagged as a DSPATR(PC) field', fld2.style.positionCursor === true);
  check('only the FIRST field (FLD1) actually shows the cursor indicator', fld1.showCursorIndicator === true && !fld2.showCursorIndicator);

  const html = DspfEngine.renderScreenHtml(screen, {});
  check('rendered HTML marks FLD1 with the dspf-cursor-pos class', /data-field="FLD1"[^>]*class="[^"]*dspf-cursor-pos/.test(html) || /class="[^"]*dspf-cursor-pos[^"]*"[^>]*data-field="FLD1"/.test(html));
  check('rendered HTML does NOT mark FLD2 with the dspf-cursor-pos class', !new RegExp('data-field="FLD2"[^>]*class="[^"]*dspf-cursor-pos').test(html) && !new RegExp('class="[^"]*dspf-cursor-pos[^"]*"[^>]*data-field="FLD2"').test(html));
}

console.log('\nBug fix: DSPATR(RI) reverse image now carries the field\u2019s original color through as --dspf-fg (a custom property), instead of `color:` directly - the CSS layer is what actually fixes the vanishing-black bug (see buildWebviewTemplate.js), but the color must reach the DOM as --dspf-fg for that fix to work at all');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'RIR' }),
    buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', decimals: '', usage: 'B', line: '2', col: '2' }),
    buildLine({ seq: '00030', func: 'COLOR(RED)' }),
    buildLine({ seq: '00040', func: 'DSPATR(RI)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'RIR', new Set());
  const fld1 = screen.fields.find((f) => f.name === 'FLD1');
  check('FLD1 is flagged reverse', fld1.style.reverse === true);
  check('FLD1 keeps its own COLOR(RED) resolved color', fld1.style.color === '#ff5c5c');

  const html = DspfEngine.renderScreenHtml(screen, {});
  check('rendered field element carries the color as --dspf-fg, not a plain color: declaration', /--dspf-fg:#ff5c5c/.test(html));
  check('rendered field element does NOT also set a competing inline color: (which would out-cascade .dspf-reverse\u2019s own color rule)', !/[^-]color:#ff5c5c/.test(html));
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

console.log('\nDspfEngine.resolveFunctionKeyLegend() - merges file-level and record-level CAxx/CFxx, record wins on a shared number, active flag tracks simulated indicators');
{
  const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', line: '1', col: '1', func: "'Hi'" }),
    buildLine({ seq: '00030', nameType: 'R', name: 'SCR2' }),
    buildLine({ seq: '00040', line: '1', col: '1', func: "'Bye'" }),
  ].join('\n') + '\n';
  let model = DspfParser.parseDspf(src);
  let lines = src.split(/\r\n|\r|\n/);

  // File-level CA03 (exit, indicator 90) + CA24 (help, no indicator - always active).
  let fileKw = DspfWriter.setCommandKey(model.fileKeywords, 'CA', 3, '90', 'Exit');
  fileKw = DspfWriter.setCommandKey(fileKw, 'CA', 24, null, 'Help');
  lines = DspfWriter.applyFileKeywordsUpdate(model, lines, fileKw);
  model = DspfParser.parseDspf(lines.join('\n'));

  // Record-level CF05 (indicator 91) on SCR1 only.
  const scr1 = model.records.find((r) => r.name === 'SCR1');
  const recKw = DspfWriter.setCommandKey(scr1.keywords, 'CF', 5, '91', 'Refresh');
  lines = DspfWriter.applyRecordUpdate(scr1, lines, { keywords: recKw });
  model = DspfParser.parseDspf(lines.join('\n'));

  const scr1b = model.records.find((r) => r.name === 'SCR1');
  const scr2b = model.records.find((r) => r.name === 'SCR2');

  const legend1 = DspfEngine.resolveFunctionKeyLegend(model, scr1b, new Set());
  check('SCR1 sees all 3 keys (its own CF05 plus both file-level ones)', legend1.length === 3);
  check('sorted CA before CF', legend1[0].type === 'CA' && legend1[legend1.length - 1].type === 'CF');
  check('CA24 (no indicator) is always active', legend1.find((k) => k.number === '24').active === true);
  check('CA03 is inactive when its indicator (90) is not simulated on', legend1.find((k) => k.number === '03').active === false);

  const legend2 = DspfEngine.resolveFunctionKeyLegend(model, scr2b, new Set());
  check('SCR2 (no record-level keys of its own) still sees the 2 file-level keys, but not CF05', legend2.length === 2 && !legend2.some((k) => k.number === '05'));

  const legend3 = DspfEngine.resolveFunctionKeyLegend(model, scr1b, new Set(['90', '91']));
  check('simulating 90+91 flips both CA03 and CF05 active', legend3.find((k) => k.number === '03').active === true && legend3.find((k) => k.number === '05').active === true);
}

console.log('\nWINDOW + SFLCTL/SFL combined on the SFLCTL record: subfile preview rows are offset by the window\'s own origin, not the raw screen origin');
{
  // SFLCTLR carries BOTH WINDOW(5 10 10 30) and SFLCTL(SFLREC) - a subfile
  // control record shown inside a window, same as real DDS allows (a
  // windowed subfile is an ordinary, common pattern). resolveScreen resolves
  // the window's own line/col offset once (windowBox.line-1, windowBox.col-1)
  // and threads it through to resolveSubfilePreview's own lineOffset/
  // colOffset params - this proves that composition actually happens rather
  // than the subfile preview silently ignoring the window and rendering at
  // the raw (un-offset) screen position.
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '10', dataType: 'A', usage: 'O', line: '1', col: '2' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'WINDOW(5 10 10 30)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(3)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
    buildLine({ seq: '00205', line: '1', col: '2', func: "'Report'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const screen = DspfEngine.resolveScreen(model, 'SFLCTLR', new Set());
  check('the window itself resolves at its declared position', screen.window && screen.window.line === 5 && screen.window.col === 10);
  check("the record's own field ('Report' title) is offset by the window's origin (line 5+1-1=5, col 10+2-1=11)", screen.fields.some((f) => f.line === 5 && f.column === 11));
  check('subfile preview rows are present', screen.subfilePreview && screen.subfilePreview.fields.length === 3);
  const rowLines = screen.subfilePreview.fields.map((f) => f.line).sort((a, b) => a - b);
  check('the FIRST subfile row is offset by the window origin too (line 5+1-1=5), not the raw screen (line 1)', rowLines[0] === 5);
  check('subsequent subfile rows stack directly below that, still inside the window', rowLines[1] === 6 && rowLines[2] === 7);
  check('every subfile row column is offset by the window\'s own column too (col 10+2-1=11)', screen.subfilePreview.fields.every((f) => f.column === 11));
}

console.log('\nWINDOW + SFL on the detail record itself (previewMultipleRows): the template\'s own preview rows are ALSO offset by its own WINDOW');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', func: 'WINDOW(4 6 12 40)' }),
    buildLine({ seq: '00102', name: 'ROWNAME', length: '10', dataType: 'A', usage: 'O', line: '1', col: '2' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const screen = DspfEngine.resolveScreen(model, 'SFLREC', new Set(), null, true);
  check('the window resolves at its declared position', screen.window && screen.window.line === 4 && screen.window.col === 6);
  check('the template preview renders more than one row', screen.fields.length > 1);
  const lines = screen.fields.map((f) => f.line).sort((a, b) => a - b);
  check('the first preview row is offset by the window origin (line 4+1-1=4), not the raw screen (line 1)', lines[0] === 4);
}

console.log('\nCNTFLD: a continued-entry field wraps over multiple lines at the declared line width');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'NOTES', length: '100', dataType: 'A', usage: 'B', line: '3', col: '2', func: 'CNTFLD(40)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const f = screen.fields.find((x) => x.name === 'NOTES');
  check('field found', !!f);
  check('render width is the CNTFLD line width (40), not the full 100-char length', f.length === 40);
  check("render height is ceil(100/40) = 3 lines", f.height === 3);
  check('the underlying text is still the full 100 characters (unwrapped)', f.text.length === 100);

  const html = DspfEngine.renderScreenHtml(screen);
  check('the field gets the dspf-cntfld class', html.includes('dspf-cntfld'));
  const lineMatches = html.match(/dspf-cntfld-line/g) || [];
  check('three wrapped-line divs are rendered (one per CNTFLD row)', lineMatches.length === 3);
}

console.log('\nCNTFLD: a length that does not divide evenly still wraps (last line just shorter)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'NOTES', length: '75', dataType: 'A', usage: 'B', line: '3', col: '2', func: 'CNTFLD(30)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const f = screen.fields.find((x) => x.name === 'NOTES');
  check('75 chars at 30/line -> ceil(75/30) = 3 lines', f.height === 3);
}

console.log('\nCNTFLD: a field with no CNTFLD keyword is unaffected (existing single-line behavior unchanged)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'NAME', length: '20', dataType: 'A', usage: 'B', line: '3', col: '2' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const f = screen.fields.find((x) => x.name === 'NAME');
  check('height stays 1', f.height === 1);
  check('length stays the field length (20)', f.length === 20);
  check('cntfld is null', f.cntfld === null);
}

console.log('\nBug fix: CNTFLD respects its OWN conditioning indicator, matching every other keyword');
{
  // Field itself is unconditioned (NOTES is always present); the CNTFLD
  // keyword is conditioned on a separate line, same pattern real DDS uses
  // to condition just one keyword rather than the whole field.
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'NOTES', length: '100', dataType: 'A', usage: 'B', line: '3', col: '2' }),
    buildLine({ seq: '00030', ind1: '01', func: 'CNTFLD(40)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const screenOff = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const fOff = screenOff.fields.find((x) => x.name === 'NOTES');
  check('indicator 01 OFF: CNTFLD is not in effect - ordinary single-line field', fOff.cntfld === null && fOff.height === 1 && fOff.length === 100);

  const screenOn = DspfEngine.resolveScreen(model, 'SCR1', new Set(['01']));
  const fOn = screenOn.fields.find((x) => x.name === 'NOTES');
  check('indicator 01 ON: CNTFLD IS in effect - wraps at 40 chars/line, ceil(100/40)=3 lines', fOn.cntfld && fOn.cntfld.lineWidth === 40 && fOn.height === 3 && fOn.length === 40);
}

console.log('\nERRMSG: renders on a window\'s own reserved message line (last usable row), only when its own conditioning is satisfied');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(4 10 6 30)' }),
    buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00030', ind1: '90', func: "ERRMSG('Invalid input' 91)" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);

  const inactive = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('no message shown when the ERRMSG keyword\'s own conditioning indicator is off', inactive.errorMessage === null);

  const active = DspfEngine.resolveScreen(model, 'WIN1', new Set(['90']));
  check('message shown when the conditioning indicator is on', !!active.errorMessage);
  check('message text matches ERRMSG\'s quoted text', active.errorMessage.text === 'Invalid input');
  check('message renders on the window\'s LAST usable row (line 4 + height 6 - 1 = 9)', active.errorMessage.line === 9);
  check('message starts at the window\'s own column (10)', active.errorMessage.col === 10);
  check('message width matches the window\'s own width (30)', active.errorMessage.width === 30);

  const html = DspfEngine.renderScreenHtml(active);
  check('rendered HTML contains the message line div', html.includes('dspf-window-msgline'));
  check('rendered HTML contains the escaped message text', html.includes('Invalid input'));
}

console.log('\nERRMSG: a message longer than the window width is truncated to fit');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN1', func: 'WINDOW(4 10 4 10)' }),
    buildLine({ seq: '00020', name: 'FLD1', length: '5', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00030', func: "ERRMSG('This message is too long')" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN1', new Set());
  check('message text is truncated to the window\'s 10-column width', screen.errorMessage.text.length === 10);
  check('truncation keeps the leading characters', screen.errorMessage.text === 'This messa');
}

console.log('\nERRMSG: *NOMSGLIN moves the message OUT of the window - nothing renders on the window\'s own message line');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN2', func: 'WINDOW(4 10 6 30 *NOMSGLIN)' }),
    buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00030', func: "ERRMSG('Invalid input')" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN2', new Set());
  check('no window message line is rendered when *NOMSGLIN is specified', screen.errorMessage === null);
}

console.log('\nERRMSG: a record-level ERRMSG is picked up too (not just field-level)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'WIN3', func: 'WINDOW(4 10 5 20)' }),
    buildLine({ seq: '00011', func: "ERRMSG('Record-level error')" }),
    buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'WIN3', new Set());
  check('record-level ERRMSG text is used', screen.errorMessage && screen.errorMessage.text === 'Record-level error');
}

console.log('\nERRMSG: a record with no WINDOW keyword never gets a window message line (out of scope by definition)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00030', func: "ERRMSG('Invalid input')" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('no window -> no errorMessage', screen.errorMessage === null);
}

console.log('\nresolveReferenceTarget: a bare R with no REFFLD resolves against the file-level REF, using the field\'s own name');
{
  const src = [
    buildLine({ seq: '00005', func: 'REF(MYLIB/CUSMSTP)' }),
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'CUSTNO', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records[0];
  const field = record.fields[0];
  const target = DspfEngine.resolveReferenceTarget(model, record, field);
  check('resolves', !!target);
  check('field name defaults to the field\'s own name (CUSTNO)', target.fieldName === 'CUSTNO');
  check('library comes from REF (MYLIB)', target.library === 'MYLIB');
  check('file comes from REF (CUSMSTP)', target.file === 'CUSMSTP');
}

console.log('\nresolveReferenceTarget: REFFLD\'s own field name overrides the field\'s own name');
{
  const src = [
    buildLine({ seq: '00005', func: 'REF(MYLIB/CUSMSTP)' }),
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'CUST1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R', func: 'REFFLD(CUSTNO)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records[0];
  const field = record.fields[0];
  const target = DspfEngine.resolveReferenceTarget(model, record, field);
  check('resolves', !!target);
  check('field name comes from REFFLD (CUSTNO), not the field\'s own name (CUST1)', target.fieldName === 'CUSTNO');
  check('still falls back to REF for the file (no file given on REFFLD)', target.library === 'MYLIB' && target.file === 'CUSMSTP');
}

console.log('\nresolveReferenceTarget: REFFLD\'s own file overrides REF\'s file');
{
  const src = [
    buildLine({ seq: '00005', func: 'REF(MYLIB/CUSMSTP)' }),
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'ORDNO', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R', func: 'REFFLD(ORDNO OTHLIB/ORDMSTP)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records[0];
  const field = record.fields[0];
  const target = DspfEngine.resolveReferenceTarget(model, record, field);
  check('REFFLD\'s own library/file wins over REF\'s', target.library === 'OTHLIB' && target.file === 'ORDMSTP');
}

console.log('\nresolveReferenceTarget: REFFLD without a library still resolves (library null)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'ORDNO', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R', func: 'REFFLD(ORDNO ORDMSTP)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records[0];
  const field = record.fields[0];
  const target = DspfEngine.resolveReferenceTarget(model, record, field);
  check('resolves with no library qualifier', !!target && target.library === null && target.file === 'ORDMSTP');
}

console.log('\nresolveReferenceTarget: REFFLD(... *SRC) is unresolvable (no live file to query)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'CUSTNO', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R', func: 'REFFLD(CUSTNO *SRC)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records[0];
  const field = record.fields[0];
  check('*SRC returns null', DspfEngine.resolveReferenceTarget(model, record, field) === null);
}

console.log('\nresolveReferenceTarget: no REF and no REFFLD file means nothing to resolve against');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'CUSTNO', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records[0];
  const field = record.fields[0];
  check('returns null with nothing to resolve against', DspfEngine.resolveReferenceTarget(model, record, field) === null);
}

console.log('\nresolveReferenceTarget: a field without R in position 29 is never a reference field');
{
  const src = [
    buildLine({ seq: '00005', func: 'REF(MYLIB/CUSMSTP)' }),
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'CUSTNO', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records[0];
  const field = record.fields[0];
  check('non-reference field returns null even with REF present', DspfEngine.resolveReferenceTarget(model, record, field) === null);
}

console.log('\nEDTCDE display width: IBM\'s own three worked examples from the EDTCDE reference');
{
  // PRICE 5,2 EDTCDE(J) -> 7 (5 + 1 decimal point + 1 trailing "-", no
  // comma since only 3 integer digits).
  // SALES 7,2 EDTCDE(K $) -> 11 (7 + 1 comma + 1 point + 1 "-" + 1 "$").
  // SALARY 8,2 EDTCDE(1 *) -> 10 (8 + 1 comma + 1 point; code 1 has no
  // sign; asterisk fill protection adds no width).
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'PRICE', length: '5', decimals: '2', dataType: 'S', usage: 'O', line: '1', col: '1', func: 'EDTCDE(J)' }),
    buildLine({ seq: '00030', name: 'SALES', length: '7', decimals: '2', dataType: 'S', usage: 'O', line: '2', col: '1', func: "EDTCDE(K $)" }),
    buildLine({ seq: '00040', name: 'SALARY', length: '8', decimals: '2', dataType: 'S', usage: 'O', line: '3', col: '1', func: "EDTCDE(1 *)" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const price = screen.fields.find((f) => f.name === 'PRICE');
  const sales = screen.fields.find((f) => f.name === 'SALES');
  const salary = screen.fields.find((f) => f.name === 'SALARY');
  check('PRICE 5,2 EDTCDE(J) -> width 7', price.length === 7);
  check('SALES 7,2 EDTCDE(K $) -> width 11', sales.length === 11);
  check('SALARY 8,2 EDTCDE(1 *) -> width 10', salary.length === 10);
}

console.log('\nEDTCDE display width: no-comma case (<=3 integer digits) and CR sign (2 chars)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'SMALLAMT', length: '5', decimals: '2', dataType: 'S', usage: 'O', line: '1', col: '1', func: 'EDTCDE(2)' }),
    buildLine({ seq: '00030', name: 'BALANCE', length: '7', decimals: '2', dataType: 'S', usage: 'O', line: '2', col: '1', func: 'EDTCDE(A)' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const small = screen.fields.find((f) => f.name === 'SMALLAMT');
  const balance = screen.fields.find((f) => f.name === 'BALANCE');
  check('3 integer digits -> no comma added (5 + 1 point + 0 sign = 6)', small.length === 6);
  check('EDTCDE(A) reserves 2 chars for CR (7 + 1 comma + 1 point + 2 CR = 11)', balance.length === 11);
}

console.log('\nEDTWRD display width: exact template character count, not the field\'s raw digit length');
{
  // A classic date-slash edit word on an 8-digit YYMMDD field - width
  // should come from the template itself (10), independent of the coded
  // field length (8).
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'ORDDATE', length: '8', decimals: '0', dataType: 'S', usage: 'O', line: '1', col: '1', func: "EDTWRD('  /  /    ')" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const ord = screen.fields.find((f) => f.name === 'ORDDATE');
  check('EDTWRD template length (10) drives width, not the coded field length (8)', ord.length === 10);
}

console.log('\nEDTCDE/EDTWRD on a DATE/TIME/PAGNBR system-value CONSTANT (no data type or length column of its own)');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', line: '1', col: '1', func: "EDTWRD('  /  /  ')" }),
    buildLine({ seq: '00021', func: 'DATE' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  const dateConst = screen.fields.find((f) => f.nameType === 'CONSTANT');
  check('a DATE system-value constant picks up its EDTWRD template width (8) even with no length column', dateConst && dateConst.length === 8);
}

console.log('\nTask L3: MNUBARCHC Text field (&var) / Return field variants render as a menubar widget (IBM DDS ref MNUBARCHC keyword, Figures 213/214)');
{
  // Figure 213 shape: literal text, no return field.
  const literalSrc = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MB', func: 'MNUBAR' }),
    buildLine({ seq: '00020', name: 'MNUFLD', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '1', col: '2', func: "MNUBARCHC(1 PULLFILE '>File')" }),
  ].join('\n') + '\n';
  const literalModel = DspfParser.parseDspf(literalSrc);
  const literalScreen = DspfEngine.resolveScreen(literalModel, 'MB', new Set());
  const literalField = literalScreen.fields.find((f) => f.name === 'MNUFLD');
  check('literal-text choice still renders as a menubar widget (unchanged existing behavior)', literalField.widget.type === 'menubar');
  check('literal-text choice keeps its quoted text', literalField.widget.choices[0].text === '>File');
  check('literal-text choice has no return field', literalField.widget.choices[0].returnField == null);

  // Figure 214 shape: text supplied via a program-to-system &field instead
  // of a literal - this is the case that used to fail to parse at all.
  const varTextSrc = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MB', func: 'MNUBAR' }),
    buildLine({ seq: '00020', name: 'MNUFLD', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '1', col: '2', func: 'MNUBARCHC(1 PULLFILE &FILETXT)' }),
    buildLine({ seq: '00030', name: 'FILETXT', length: '15', dataType: 'A', usage: 'P' }),
  ].join('\n') + '\n';
  const varTextModel = DspfParser.parseDspf(varTextSrc);
  const varTextScreen = DspfEngine.resolveScreen(varTextModel, 'MB', new Set());
  const varTextField = varTextScreen.fields.find((f) => f.name === 'MNUFLD');
  check('a &text-field choice still parses as a menubar widget instead of falling through', varTextField.widget.type === 'menubar');
  check('a &text-field choice keeps the raw &NAME token as its design-time label (matches CHOICE\u2019s own &var convention)', varTextField.widget.choices[0].text === '&FILETXT');
  check('a &text-field choice keeps its pulldown record', varTextField.widget.choices[0].pulldownRecord === 'PULLFILE');

  // Figure 213's own "Options" choice: literal text PLUS a trailing return field.
  const returnFieldSrc = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MB', func: 'MNUBAR' }),
    buildLine({ seq: '00020', name: 'MNUFLD', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '1', col: '2', func: "MNUBARCHC(4 PULLOPT 'Opt' &RTNFLD)" }),
    buildLine({ seq: '00030', name: 'RTNFLD', length: '2', dataType: 'Y', decimals: '0', usage: 'H' }),
  ].join('\n') + '\n';
  const returnFieldModel = DspfParser.parseDspf(returnFieldSrc);
  const returnFieldScreen = DspfEngine.resolveScreen(returnFieldModel, 'MB', new Set());
  const returnFieldField = returnFieldScreen.fields.find((f) => f.name === 'MNUFLD');
  check('literal text with a trailing return field still parses the text correctly', returnFieldField.widget.choices[0].text === 'Opt');
  check('the trailing return field is captured separately from the text', returnFieldField.widget.choices[0].returnField === '&RTNFLD');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);



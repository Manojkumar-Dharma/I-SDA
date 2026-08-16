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

if (failures > 0) {
  console.log('\n' + failures + ' FAILURE(S)');
  process.exit(1);
} else {
  console.log('\nALL CHECKS PASSED');
}

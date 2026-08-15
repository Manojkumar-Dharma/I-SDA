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

if (failures > 0) {
  console.log('\n' + failures + ' FAILURE(S)');
  process.exit(1);
} else {
  console.log('\nALL CHECKS PASSED');
}

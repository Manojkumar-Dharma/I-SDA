/**
 * dspfParser.test.js
 *
 * Direct unit coverage for display-size condition names (*DS3/*DS4, or a
 * user-defined name like *LARGE) - the DDS mechanism for giving a field a
 * different position (or existence at all) depending on which DSPSIZ size
 * is active at runtime. Per IBM's DDS reference, a display-size condition
 * occupies the SAME columns as regular indicator conditioning (positions
 * 8-16) - a different interpretation of that space, not a separate column
 * range - so the parser previously misread one as up to three garbage
 * pseudo-indicators (e.g. "*DS4" -> "*D" + "04"), silently corrupting the
 * condition rather than recognizing it. A field conditioned this way would
 * never render in iSDA's preview at all, in either screen size, since its
 * garbage condition could never be satisfied.
 * Pure Node, no vscode/jsdom needed. Run with: node src/test/dspfParser.test.js
 */
const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
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

console.log('display-size condition: built-in *DS4');
{
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
      buildLine({ seq: '00030', line: '2', col: '90', func: "'WIDE SCREEN ONLY'", sizeCondition: '*DS4' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const field = model.records[0].fields[0];

  check('parses the constant text correctly (not corrupted by the condition)', field.constantValue === 'WIDE SCREEN ONLY');
  check('produces exactly one condition group', field.conditions.length === 1);
  check('recognizes it as a displaySizeCondition, not indicators', field.conditions[0].displaySizeCondition !== null && field.conditions[0].indicators.length === 0);
  check('captures the name correctly', field.conditions[0].displaySizeCondition.name === '*DS4');
  check('not-flag is false (no N prefix)', field.conditions[0].displaySizeCondition.not === false);
}

console.log('\ndisplay-size condition: NOT form (N*DS4)');
{
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
      buildLine({ seq: '00030', line: '2', col: '90', func: "'NORMAL SCREEN ONLY'", sizeCondition: 'N*DS4' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const field = model.records[0].fields[0];
  check('captures the NOT flag', field.conditions[0].displaySizeCondition.not === true);
  check('captures the name without the N prefix', field.conditions[0].displaySizeCondition.name === '*DS4');
}

console.log('\ndisplay-size condition: user-defined name');
{
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *NORMAL 27 132 *LARGE)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
      buildLine({ seq: '00030', line: '2', col: '90', func: "'X'", sizeCondition: '*LARGE' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  check('a user-defined name (not just *DS3/*DS4) is recognized the same way', model.records[0].fields[0].conditions[0].displaySizeCondition.name === '*LARGE');
}

console.log('\nregular indicator conditioning is unaffected');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'MENU' }),
      buildLine({ seq: '00020', ind1: 'N01', ind2: '31', line: '2', col: '5', func: "'X'" }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const field = model.records[0].fields[0];
  check('still parses as regular indicators, not a display-size condition', field.conditions[0].displaySizeCondition === null && field.conditions[0].indicators.length === 2);
  check('indicator values are correct', field.conditions[0].indicators[0].number === '01' && field.conditions[0].indicators[0].not === true && field.conditions[0].indicators[1].number === '31');
}

console.log('\nDspfWriter round-trips a display-size condition correctly through an edit');
{
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
      buildLine({ seq: '00020', nameType: 'R', name: 'MENU' }),
      buildLine({ seq: '00030', line: '2', col: '90', func: "'WIDE SCREEN ONLY'", sizeCondition: '*DS4' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const field = model.records[0].fields[0];
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.applyFieldUpdate(field, lines, { line: 5, column: 20 });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const newField = reparsed.records[0].fields[0];

  check('the condition survives the edit intact', newField.conditions[0].displaySizeCondition && newField.conditions[0].displaySizeCondition.name === '*DS4');
  check('the new position took effect', newField.location.line === 5 && newField.location.column === 20);
  check('the constant text is untouched', newField.constantValue === 'WIDE SCREEN ONLY');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

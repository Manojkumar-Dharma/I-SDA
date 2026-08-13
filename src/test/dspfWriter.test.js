/**
 * dspfWriter.test.js
 *
 * Direct unit coverage for DspfWriter.insertField() - the primitive behind
 * the menu designer's "+ Add option" feature (see menuWebview.test.js for
 * the end-to-end client-side flow). Pure Node, no vscode/jsdom needed.
 * Run with: node src/test/dspfWriter.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

console.log('DspfWriter.insertField() - appending after existing fields');
{
  const src =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R MENU",
      "     A                                  1  2'MAIN MENU'",
      "     A                                  3  5'1. Display library list'",
      "     A                                  4  5'2. Change current library'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.insertField(record, lines, {
    nameType: 'CONSTANT',
    constantValue: '10. Sign off',
    location: { line: 5, column: 5 },
  });
  const insertedLine = newLines[newLines.length - 2];
  check("column 6 carries the form-type 'A', matching every other line", insertedLine[5] === 'A' && insertedLine.slice(0, 5).trim() === '');

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const fields = reparsed.records.find((r) => r.name === 'MENU').fields;
  check('adds exactly one new field', fields.length === 4);
  check('new field parses back with the exact constant text', fields[3].constantValue === '10. Sign off');
  check('new field lands at the requested line/column', fields[3].location.line === 5 && fields[3].location.column === 5);
  check('existing fields are untouched', fields[0].constantValue === 'MAIN MENU' && fields[1].constantValue === '1. Display library list');
}

console.log('\nDspfWriter.insertField() - record with no fields yet');
{
  const src = ['     A                                      DSPSIZ(24 80 *DS3)', '     A          R MENU'].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.insertField(record, lines, {
    nameType: 'CONSTANT',
    constantValue: '1. First option ever',
    location: { line: 5, column: 5 },
  });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const fields = reparsed.records.find((r) => r.name === 'MENU').fields;
  check('inserts right after the record header with no existing fields to anchor on', fields.length === 1 && fields[0].constantValue === '1. First option ever');
}

console.log('\nDspfWriter.insertField() - long label wraps with continuation, round-trips exactly');
{
  const src = ['     A          R MENU', "     A                                  1  2'MAIN MENU'"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const lines = src.split(/\r\n|\r|\n/);
  const longLabel = '5. ' + 'This is a very long menu option label that exceeds one physical DDS line width for sure';
  const newLines = DspfWriter.insertField(record, lines, {
    nameType: 'CONSTANT',
    constantValue: longLabel,
    location: { line: 6, column: 5 },
  });
  check('wraps onto more than one physical line', newLines.length > lines.length + 1);
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const fields = reparsed.records.find((r) => r.name === 'MENU').fields;
  check('the wrapped constant reparses back to the exact original text', fields[1].constantValue === longLabel);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

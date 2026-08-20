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

console.log('\nDspfWriter.copyField() - named field: auto-generates a distinct name, copies length/type/keywords, defaults to one row below');
{
  const src =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R SCREEN1",
      "     A            CUSTNAME      30A  B 10 15",
      "     A                                      DSPATR(HI)",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'SCREEN1');
  const field = record.fields[0];
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.copyField(record, lines, field, {});
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const fields = reparsed.records.find((r) => r.name === 'SCREEN1').fields;
  check('adds exactly one new field', fields.length === 2);
  check('original field untouched', fields[0].name === 'CUSTNAME' && fields[0].location.line === 10 && fields[0].location.column === 15);
  check("copy gets an auto-generated distinct name ('CUSTNAME2', within the 10-char limit)", fields[1].name === 'CUSTNAME2');
  check('copy keeps the same length/type/usage', fields[1].length === 30 && fields[1].dataType === 'A' && fields[1].usage === 'B');
  check('copy keeps the same keywords', fields[1].keywords.length === 1 && fields[1].keywords[0].name === 'DSPATR' && fields[1].keywords[0].parameters === 'HI');
  check('copy defaults to one row below the original, same column', fields[1].location.line === 11 && fields[1].location.column === 15);
}

console.log('\nDspfWriter.copyField() - explicit name/location override the defaults');
{
  const src = ["     A          R SCREEN1", "     A            CUSTNAME      30A  B 10 15"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'SCREEN1');
  const field = record.fields[0];
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.copyField(record, lines, field, { name: 'CUSTNM2', location: { line: 20, column: 40 } });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const fields = reparsed.records.find((r) => r.name === 'SCREEN1').fields;
  check('uses the explicit name instead of auto-generating one', fields[1].name === 'CUSTNM2');
  check('uses the explicit location instead of the default offset', fields[1].location.line === 20 && fields[1].location.column === 40);
}

console.log('\nDspfWriter.copyField() - copying twice avoids colliding with the first copy too');
{
  const src = ["     A          R SCREEN1", "     A            CUSTNAME      30A  B 10 15"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'SCREEN1');
  const field = record.fields[0];
  let lines = src.split(/\r\n|\r|\n/);
  lines = DspfWriter.copyField(record, lines, field, {});
  let reparsed = DspfParser.parseDspf(lines.join('\n'));
  let rec2 = reparsed.records.find((r) => r.name === 'SCREEN1');
  lines = DspfWriter.copyField(rec2, lines, rec2.fields[0], {});
  reparsed = DspfParser.parseDspf(lines.join('\n'));
  const names = reparsed.records.find((r) => r.name === 'SCREEN1').fields.map((f) => f.name);
  check('second copy gets a different auto-generated name than the first (CUSTNAME3, not CUSTNAME2 again)', names[0] === 'CUSTNAME' && names[1] === 'CUSTNAME2' && names[2] === 'CUSTNAME3');
}

console.log('\nDspfWriter.copyField() - constant: no name to collide, copies literal text and keywords as-is');
{
  const src =
    [
      "     A          R MENU",
      "     A                                  3  5'1. Display library list'",
      "     A                                      DSPATR(HI)",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const field = record.fields[0];
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.copyField(record, lines, field, {});
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const fields = reparsed.records.find((r) => r.name === 'MENU').fields;
  check('adds exactly one new field', fields.length === 2);
  check('copy has no name (constants never do)', fields[1].name === '');
  check('copy keeps the exact literal text', fields[1].constantValue === '1. Display library list');
  check('copy keeps the DSPATR keyword', fields[1].keywords.length === 1 && fields[1].keywords[0].name === 'DSPATR');
  check('copy defaults to one row below, same column', fields[1].location.line === 4 && fields[1].location.column === 5);
}

console.log('\nDspfWriter.nextAvailableFieldName() - truncates to stay within the 10-char DDS field name limit');
{
  const src = ["     A          R SCREEN1", "     A            LONGFLDNAME  10A  B  1  1"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'SCREEN1');
  const name = DspfWriter.nextAvailableFieldName(record, 'LONGFLDNAME');
  check('name stays within 10 characters', name.length <= 10);
  check("truncates the base and appends '2'", name === 'LONGFLDNA2');
}

console.log('\nDspfWriter.reorderFields() - swaps two fields\' source order, content moves as whole verbatim chunks');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
      buildLine({ seq: '00030', line: '2', col: '2', func: "'Second'" }),
      buildLine({ seq: '00040', line: '3', col: '2', func: "'Third'" }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'SCREEN1');
  const [first, second, third] = record.fields;
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.reorderFields(record, lines, [second.sourceLine, first.sourceLine, third.sourceLine]);
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const texts = reparsed.records[0].fields.map((f) => f.constantValue);
  check('fields now appear in the requested order', texts[0] === 'Second' && texts[1] === 'First' && texts[2] === 'Third');
  check('each field kept its original row/col (only source order changed, not layout)', reparsed.records[0].fields[0].location.line === 2 && reparsed.records[0].fields[1].location.line === 1);
}

console.log('\nDspfWriter.reorderFields() - a HELP entry interleaved between fields keeps its own slot, is not reordered itself');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
      buildLine({ seq: '00030', nameType: 'H', func: 'HELP(01)' }),
      buildLine({ seq: '00040', line: '2', col: '2', func: "'Second'" }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'SCREEN1');
  check('setup: one help entry parsed, interleaved between two fields', record.helpEntries.length === 1 && record.fields.length === 2);
  const [first, second] = record.fields;
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.reorderFields(record, lines, [second.sourceLine, first.sourceLine]);
  check('the HELP keyword line is still present, untouched', newLines.some((l) => /HELP\(01\)/.test(l)));
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  check('fields reordered correctly around the untouched help entry', reparsed.records[0].fields.map((f) => f.constantValue).join(',') === 'Second,First');
  check('help entry count/content unaffected', reparsed.records[0].helpEntries.length === 1);
}

console.log('\nDspfWriter.reorderFields() - rejects an order that is not exactly a permutation of the current fields');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
      buildLine({ seq: '00030', line: '2', col: '2', func: "'Second'" }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'SCREEN1');
  const lines = src.split(/\r\n|\r|\n/);
  let threw = false;
  try {
    DspfWriter.reorderFields(record, lines, [record.fields[0].sourceLine]); // missing the second field
  } catch (e) {
    threw = true;
  }
  check('throws rather than silently dropping a field', threw);
}

console.log('\nDspfWriter.renameRecordFormat() - renames the R-line, preserves everything else');
{
  const src =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R OLDNAME",
      "     A                                  1  2'MAIN MENU'",
      "     A                                  3  5'1. Display library list'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'OLDNAME');
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.renameRecordFormat(record, lines, 'NEWNAME');
  check('column 17 still carries the record-type R, matching every other record line', newLines.find((l) => l.includes('NEWNAME'))[16] === 'R');

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  check('renames the record', reparsed.records.length === 1 && reparsed.records[0].name === 'NEWNAME');
  check('preserves the DSPSIZ keyword line untouched', newLines[0].includes('DSPSIZ(24 80 *DS3)'));
  check("preserves the record's fields untouched", reparsed.records[0].fields.length === 2 && reparsed.records[0].fields[0].constantValue === 'MAIN MENU');
}

console.log('\nDspfWriter.applyFieldUpdate() - editing a wrapped multi-line bare-literal constant (regression: previously left orphaned duplicate continuation lines behind)');
{
  const src = ['     A          R MENU', "     A                                  1  2'MAIN MENU'"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const lines = src.split(/\r\n|\r|\n/);
  const longLabel = '5. ' + 'This is a very long menu option label that exceeds one physical DDS line width for sure';
  const withField = DspfWriter.insertField(record, lines, {
    nameType: 'CONSTANT',
    constantValue: longLabel,
    location: { line: 6, column: 5 },
  });
  const reparsed = DspfParser.parseDspf(withField.join('\n'));
  const field = reparsed.records.find((r) => r.name === 'MENU').fields[1];
  check('the wrapped constant reports every physical line it spans (not just the first)', field.entrySourceLines.length === 3);

  const edited = DspfWriter.applyFieldUpdate(field, withField, { column: 8 });
  check('editing it does not grow the file (no orphaned duplicate continuation lines left behind)', edited.length === withField.length);
  const reeditedParse = DspfParser.parseDspf(edited.join('\n'));
  check('re-parses back to exactly the same fields (no stray leftover entry)', reeditedParse.records.find((r) => r.name === 'MENU').fields.length === 2);
  check('the edited field still has its full, correct text', reeditedParse.records.find((r) => r.name === 'MENU').fields[1].constantValue === longLabel);
}

console.log('\nDspfWriter.deleteField() - removes a single-line constant cleanly');
{
  const src = [
    '     A          R MENU',
    "     A                                  1  2'MAIN MENU'",
    "     A                                  3  5'1. Display library list'",
    "     A                                  4  5'2. Change current library'",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const lines = src.split(/\r\n|\r|\n/);
  const target = record.fields.find((f) => f.constantValue === '1. Display library list');

  const newLines = DspfWriter.deleteField(target, lines);
  check('removes exactly one line', newLines.length === lines.length - 1);
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const rec2 = reparsed.records.find((r) => r.name === 'MENU');
  check('the deleted field is gone', !rec2.fields.some((f) => f.constantValue === '1. Display library list'));
  check('the other two fields are untouched', rec2.fields.length === 2 &&
    rec2.fields.some((f) => f.constantValue === 'MAIN MENU') &&
    rec2.fields.some((f) => f.constantValue === '2. Change current library'));
}

console.log('\nDspfWriter.deleteField() - removes every continuation line of a wrapped multi-line constant');
{
  const src = ['     A          R MENU', "     A                                  1  2'MAIN MENU'"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const lines = src.split(/\r\n|\r|\n/);
  const longLabel = '5. ' + 'This is a very long menu option label that exceeds one physical DDS line width for sure';
  const withField = DspfWriter.insertField(record, lines, {
    nameType: 'CONSTANT',
    constantValue: longLabel,
    location: { line: 6, column: 5 },
  });
  const reparsed = DspfParser.parseDspf(withField.join('\n'));
  const field = reparsed.records.find((r) => r.name === 'MENU').fields[1];
  check('setup: the wrapped constant spans 3 physical lines', field.entrySourceLines.length === 3);

  const deleted = DspfWriter.deleteField(field, withField);
  check('all 3 lines of the wrapped constant are removed, none left orphaned', deleted.length === withField.length - 3);
  const reparsed2 = DspfParser.parseDspf(deleted.join('\n'));
  check('only the original field remains', reparsed2.records.find((r) => r.name === 'MENU').fields.length === 1);
  check('no parse errors from any leftover fragment', reparsed2.errors.length === 0);
}

console.log('\nDspfWriter.deleteFields() - removes multiple fields (e.g. a split-constant option\'s number + label) in one pass without corrupting line numbers');
{
  const src = [
    '     A          R MENU',
    "     A                                  1  2'MAIN MENU'",
    "     A                                  3  7'1.'",
    "     A                                  3 10'Display library list'",
    "     A                                  4  7'2.'",
    "     A                                  4 10'Change current library'",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const record = model.records.find((r) => r.name === 'MENU');
  const lines = src.split(/\r\n|\r|\n/);
  const numberField = record.fields.find((f) => f.constantValue === '1.');
  const labelField = record.fields.find((f) => f.constantValue === 'Display library list');

  const newLines = DspfWriter.deleteFields([numberField, labelField], lines);
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const rec2 = reparsed.records.find((r) => r.name === 'MENU');
  check('both fields of option 1 are gone', !rec2.fields.some((f) => f.constantValue === '1.' || f.constantValue === 'Display library list'));
  check('option 2\'s two fields (both after the deleted ones) survive with correct text', rec2.fields.length === 3 &&
    rec2.fields.some((f) => f.constantValue === '2.') &&
    rec2.fields.some((f) => f.constantValue === 'Change current library'));
}

console.log('\nDspfWriter.renameRecordReferences() - auto-rewrites SFLCTL/WINDOW/MNUBARCHC references');
{
  const src = [
    '     A          R MENU',
    "     A                                  1  2'MAIN MENU'",
    '     A            OPT       2A  B  3  5',
    "     A                                      MNUBARCHC(1 PULLDN1 'File')",
    '     A          R PULLDN1',
    "     A                                  1  2'Open'",
    '     A          R DETAIL',
    '     A                                      WINDOW(PULLDN1)',
    '     A          R SFLCTL1',
    '     A                                      SFLCTL(PULLDN1)',
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const rewritten = DspfWriter.renameRecordReferences(model, lines, 'PULLDN1', 'PULLNEW');
  const reparsed = DspfParser.parseDspf(rewritten.join('\n'));
  check('re-parses with no errors', reparsed.errors.length === 0);

  const detailRec = reparsed.records.find((r) => r.name === 'DETAIL');
  check('WINDOW(name) reference rewritten', detailRec.keywords.find((k) => k.name === 'WINDOW').parameters.trim() === 'PULLNEW');

  const sflctlRec = reparsed.records.find((r) => r.name === 'SFLCTL1');
  check('SFLCTL(name) reference rewritten', sflctlRec.keywords.find((k) => k.name === 'SFLCTL').parameters.trim() === 'PULLNEW');

  const menuRec = reparsed.records.find((r) => r.name === 'MENU');
  const mnubarchc = menuRec.fields.find((f) => f.name === 'OPT').keywords.find((k) => k.name === 'MNUBARCHC');
  check("MNUBARCHC(id name 'text') reference rewritten, text left untouched", mnubarchc.parameters.trim() === "1 PULLNEW 'File'");

  check('the renamed record itself is untouched by this function (that is renameRecordFormat\'s job)', reparsed.records.some((r) => r.name === 'PULLDN1'));
}

console.log('\nDspfWriter.renameRecordReferences() - does not touch an unrelated field/constant that merely contains the same text');
{
  const src = [
    '     A          R MENU',
    "     A                                  1  2'See PULLDN1 for details'",
    '     A          R PULLDN1',
    "     A                                  1  2'Open'",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const rewritten = DspfWriter.renameRecordReferences(model, lines, 'PULLDN1', 'PULLNEW');
  check('display text mentioning the name coincidentally is left exactly as-is', rewritten.join('\n').includes('See PULLDN1 for details'));
}

console.log('\nDspfWriter.addDisplaySize() - adds a second, named size to a file that already names its first');
{
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R MENU',
    "     A                                  1  2'MAIN MENU'",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.addDisplaySize(model, lines, { lines: 27, columns: 132, name: '*DS4' });
  check('line count unchanged (single-line DSPSIZ stays single-line)', newLines.length === lines.length);

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const sizes = DspfEngine.availableScreenSizes(reparsed);
  check('now declares two sizes', sizes.length === 2);
  check('first size preserved exactly', sizes[0].lines === 24 && sizes[0].columns === 80 && sizes[0].name === '*DS3');
  check('second size added exactly as requested', sizes[1].lines === 27 && sizes[1].columns === 132 && sizes[1].name === '*DS4');
  check('the record and its field are untouched', reparsed.records[0].fields[0].constantValue === 'MAIN MENU');
}

console.log('\nDspfWriter.addDisplaySize() - names an existing UNQUALIFIED single size before adding the second');
{
  const src = ['     A                                      DSPSIZ(24 80)', '     A          R MENU'].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.addDisplaySize(model, lines, { lines: 27, columns: 132 }); // no name -> defaults to *DS4

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const sizes = DspfEngine.availableScreenSizes(reparsed);
  check('the previously-unqualified first size is now named *DS3', sizes[0].name === '*DS3');
  check('the new size defaults to *DS4 when no name is given', sizes[1].name === '*DS4');
}

console.log('\nDspfWriter.addDisplaySize() - inserts a brand-new DSPSIZ when the file declares none at all');
{
  const src = ['     A          R MENU', "     A                                  1  2'MAIN MENU'"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.addDisplaySize(model, lines, { lines: 27, columns: 132, name: '*DS4' });
  check('inserts the new keyword line before the first record', newLines[0].includes('DSPSIZ') && newLines.findIndex((l) => l.includes(' R MENU')) === 1);

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const sizes = DspfEngine.availableScreenSizes(reparsed);
  check('the implicit 24x80 default is named *DS3', sizes[0].lines === 24 && sizes[0].columns === 80 && sizes[0].name === '*DS3');
  check('the requested size is added as *DS4', sizes[1].lines === 27 && sizes[1].columns === 132 && sizes[1].name === '*DS4');
  check("the record's field is untouched", reparsed.records[0].fields[0].constantValue === 'MAIN MENU');
}

console.log('\nDspfWriter.addDisplaySize() - refuses to add a third size');
{
  const src = ['     A                                      DSPSIZ(24 80 *DS3 27 132 *DS4)', '     A          R MENU'].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  let threw = false;
  try {
    DspfWriter.addDisplaySize(model, lines, { lines: 32, columns: 160, name: '*DS5' });
  } catch (e) {
    threw = true;
  }
  check('throws rather than writing an invalid third size', threw);
}

console.log('\nDspfWriter.addDisplaySize() - long DSPSIZ text wraps with continuation and round-trips exactly');
{
  const src = ['     A                                      DSPSIZ(24 80 *VERYLONGNAME3)', '     A          R MENU'].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.addDisplaySize(model, lines, { lines: 27, columns: 132, name: '*ANOTHERVERYLONGNAME4' });

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  check('re-parses with no errors', reparsed.errors.length === 0);
  const sizes = DspfEngine.availableScreenSizes(reparsed);
  check('both sizes (including their original/new long names) round-trip exactly', sizes.length === 2 && sizes[0].name === '*VERYLONGNAME3' && sizes[1].name === '*ANOTHERVERYLONGNAME4');
}

console.log('\nDspfWriter command keys (CAxx/CFxx) - add/remove at file and record scope, cross-scope exclusion');
{
  const src = [
    '     A          R MENU',
    "     A                                  1  2'MAIN MENU'",
    '     A          R DETAIL',
    "     A                                  1  2'Detail'",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  check('no command keys defined yet', DspfWriter.parseCommandKeys(model.fileKeywords).length === 0);
  check('all 24 key numbers available before anything is assigned', DspfWriter.availableCommandKeyNumbers(model.fileKeywords, model.records[0].keywords).length === 24);

  // file-level CA03 with an indicator + text containing an apostrophe
  const withFileKey = DspfWriter.setCommandKey(model.fileKeywords, 'CA', 3, '90', "F3='Exit'");
  const afterFileAdd = DspfWriter.applyFileKeywordsUpdate(model, lines, withFileKey);
  const reparsed1 = DspfParser.parseDspf(afterFileAdd.join('\n'));
  const parsed1 = DspfWriter.parseCommandKeys(reparsed1.fileKeywords);
  check('CA03 round-trips at file level', parsed1.length === 1 && parsed1[0].type === 'CA' && parsed1[0].number === '03');
  check('indicator round-trips', parsed1[0].indicator === '90');
  check('text with an embedded apostrophe round-trips exactly', parsed1[0].text === "F3='Exit'");

  // record-level CF12 on MENU (bare, no indicator/text)
  const menuRec1 = reparsed1.records.find((r) => r.name === 'MENU');
  const avail1 = DspfWriter.availableCommandKeyNumbers(reparsed1.fileKeywords, menuRec1.keywords);
  check('key number already used at file level is excluded from the record-level picker', !avail1.includes('03') && avail1.length === 23);

  const withRecKey = DspfWriter.setCommandKey(menuRec1.keywords, 'CF', 12, null, null);
  const afterRecAdd = DspfWriter.applyRecordUpdate(menuRec1, afterFileAdd, { keywords: withRecKey });
  const reparsed2 = DspfParser.parseDspf(afterRecAdd.join('\n'));
  const menuRec2 = reparsed2.records.find((r) => r.name === 'MENU');
  const detailRec2 = reparsed2.records.find((r) => r.name === 'DETAIL');
  check('CF12 round-trips at record level, bare (no indicator/text)', menuRec2.keywords.some((k) => k.name === 'CF12' && k.parameters.trim() === ''));

  const avail2File = DspfWriter.availableCommandKeyNumbers(reparsed2.fileKeywords, detailRec2.keywords);
  check("a key used on ONE record does not block it on a DIFFERENT record (DETAIL still sees 12 as available)", avail2File.includes('12'));
  const avail2SameRec = DspfWriter.availableCommandKeyNumbers(reparsed2.fileKeywords, menuRec2.keywords);
  check('but that same record correctly excludes its own 12', !avail2SameRec.includes('12'));

  // switching MENU's key 12 from CF to CA overwrites rather than duplicating
  const switched = DspfWriter.setCommandKey(menuRec2.keywords, 'CA', 12, '55', 'Help');
  const afterSwitch = DspfWriter.applyRecordUpdate(menuRec2, afterRecAdd, { keywords: switched });
  const reparsed3 = DspfParser.parseDspf(afterSwitch.join('\n'));
  const menuRec3 = reparsed3.records.find((r) => r.name === 'MENU');
  const key12s = menuRec3.keywords.filter((k) => k.name === 'CA12' || k.name === 'CF12');
  check('switching CF12->CA12 leaves exactly one key 12, not both', key12s.length === 1 && key12s[0].name === 'CA12');

  // remove the file-level key entirely
  const withoutFileKey = DspfWriter.removeCommandKey(reparsed3.fileKeywords, '03');
  const afterFileRemove = DspfWriter.applyFileKeywordsUpdate(reparsed3, afterSwitch, withoutFileKey);
  const reparsed4 = DspfParser.parseDspf(afterFileRemove.join('\n'));
  check('file-level CA03 is fully removed', DspfWriter.parseCommandKeys(reparsed4.fileKeywords).length === 0);
  check('record-level CA12 is untouched by removing the unrelated file-level key', reparsed4.records.find((r) => r.name === 'MENU').keywords.some((k) => k.name === 'CA12'));
}

console.log("\nDspfWriter.applyFileKeywordsUpdate() - inserts a fresh block at the top when the file has none yet");
{
  const src = [
    '     A          R MENU',
    "     A                                  1  2'Hi'",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  check('setup: file starts with zero file-level keywords', model.fileKeywords.length === 0);
  const lines = src.split(/\r\n|\r|\n/);

  const withKey = DspfWriter.setCommandKey(model.fileKeywords, 'CA', 24, '99', null);
  const newLines = DspfWriter.applyFileKeywordsUpdate(model, lines, withKey);
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  check('new file-level key present after insert-from-nothing', DspfWriter.parseCommandKeys(reparsed.fileKeywords).length === 1);
  check('the existing record is untouched', reparsed.records.length === 1 && reparsed.records[0].name === 'MENU');
}

console.log('\nDspfWriter.applyFieldUpdate() / applyRecordUpdate() - conditions can now actually be changed');
{
  const { buildLine } = require('../fixtures/lineBuilder.js');
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00020', ind1: '51', line: '1', col: '2', func: "'Conditioned'" }),
    buildLine({ seq: '00030', name: 'OPT', dataType: 'A', length: '2', usage: 'B', line: '3', col: '5' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records[0];
  const field = rec.fields.find((f) => f.constantValue === 'Conditioned');
  check('setup: field starts conditioned on indicator 51', !!field && field.conditions.length === 1 && field.conditions[0].indicators[0].number === '51');

  const newLines = DspfWriter.applyFieldUpdate(field, lines, { conditions: [{ relation: 'AND', indicators: [{ number: '62', not: true }] }] });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const field2 = reparsed.records[0].fields.find((f) => f.constantValue === 'Conditioned');
  check('field.conditions was actually rewritten (was silently ignored before this change)', field2.conditions.length === 1 && field2.conditions[0].indicators[0].number === '62' && field2.conditions[0].indicators[0].not === true);

  const rec2Src = ['     A          R MENU', "     A                                  1  2'Hi'"].join('\n') + '\n';
  const model2 = DspfParser.parseDspf(rec2Src);
  const lines2 = rec2Src.split(/\r\n|\r|\n/);
  check('setup: record starts unconditioned', model2.records[0].conditions.length === 0);
  const newLines2 = DspfWriter.applyRecordUpdate(model2.records[0], lines2, { conditions: [{ relation: 'AND', indicators: [{ number: '80', not: false }] }] });
  const reparsed2 = DspfParser.parseDspf(newLines2.join('\n'));
  check("record.conditions was actually rewritten (applyRecordUpdate used to hardcode the record's ORIGINAL conditions)", reparsed2.records[0].conditions.length === 1 && reparsed2.records[0].conditions[0].indicators[0].number === '80');
}

console.log('\nDspfWriter.insertRecord() - creates a brand-new, empty record format');
{
  const { buildLine } = require('../fixtures/lineBuilder.js');

  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'MAIN MENU'" }),
    buildLine({ seq: '00030', nameType: 'R', name: 'DETAIL' }),
    buildLine({ seq: '00040', line: '1', col: '2', func: "'Detail'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const afterInsert = DspfWriter.insertRecord(model, lines, { name: 'NEWREC' });
  const reparsed = DspfParser.parseDspf(afterInsert.join('\n'));
  check('new record is appended after every existing one, not inserted in the middle', reparsed.records.map((r) => r.name).join(',') === 'MENU,DETAIL,NEWREC');
  check('new record starts with zero fields (a bare R-line only)', reparsed.records.find((r) => r.name === 'NEWREC').fields.length === 0);

  const withKeywords = DspfWriter.insertRecord(model, lines, { name: 'WITHKW', keywords: [{ name: 'CA03', parameters: "90 'Exit'", conditions: [], raw: '', sourceLines: [] }] });
  const reparsed2 = DspfParser.parseDspf(withKeywords.join('\n'));
  check('an initial keyword list is honored', reparsed2.records.find((r) => r.name === 'WITHKW').keywords.some((k) => k.name === 'CA03'));

  console.log('  inserting into a file with NO records yet still preserves its file-level keywords');
  const noRecSrc = [buildLine({ seq: '00010', func: 'REF(PAYROLL)' })].join('\n') + '\n';
  const noRecModel = DspfParser.parseDspf(noRecSrc);
  check('setup: starts with zero records', noRecModel.records.length === 0);
  const noRecLines = noRecSrc.split(/\r\n|\r|\n/);
  const afterFirstInsert = DspfWriter.insertRecord(noRecModel, noRecLines, { name: 'FIRST' });
  const reparsed3 = DspfParser.parseDspf(afterFirstInsert.join('\n'));
  check('the new record was created', reparsed3.records.map((r) => r.name).join(',') === 'FIRST');
  check('the pre-existing file-level REF keyword survives untouched', reparsed3.fileKeywords.some((k) => k.name === 'REF'));

  console.log('  inserting into a genuinely empty file (no records, no file keywords)');
  const emptyModel = DspfParser.parseDspf('');
  const afterEmptyInsert = DspfWriter.insertRecord(emptyModel, [], { name: 'ONLY' });
  const reparsed4 = DspfParser.parseDspf(afterEmptyInsert.join('\n'));
  check('a record is created even starting from a totally empty file', reparsed4.records.map((r) => r.name).join(',') === 'ONLY');
}

console.log("\nDspfWriter.copyRecord() - duplicates a whole record format (own keywords + every field) under a new name");
{
  const { buildLine } = require('../fixtures/lineBuilder.js');

  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'MAIN MENU'" }),
    buildLine({ seq: '00030', name: 'OPT', dataType: 'A', length: '2', usage: 'B', line: '3', col: '5' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'DETAIL' }),
    buildLine({ seq: '00050', line: '1', col: '2', func: "'Detail'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const menu = model.records.find((r) => r.name === 'MENU');

  const afterCopy = DspfWriter.copyRecord(model, lines, menu);
  const reparsed = DspfParser.parseDspf(afterCopy.join('\n'));
  check('an auto-named copy (MENU2) is inserted right after the original, before DETAIL', reparsed.records.map((r) => r.name).join(',') === 'MENU,MENU2,DETAIL');

  const copy = reparsed.records.find((r) => r.name === 'MENU2');
  check('the copy has the same field COUNT as the original', copy.fields.length === menu.fields.length);
  check("the copy's field keeps the SAME name as the original (field names are scoped per record, no rename needed)", copy.fields.some((f) => f.name === 'OPT'));
  check('the original MENU record is completely untouched', reparsed.records.find((r) => r.name === 'MENU').fields.length === menu.fields.length);

  console.log('  an explicit name is honored instead of auto-generating one');
  const afterNamedCopy = DspfWriter.copyRecord(model, lines, menu, { name: 'MYCOPY' });
  const reparsed2 = DspfParser.parseDspf(afterNamedCopy.join('\n'));
  check('the explicit name was used', reparsed2.records.some((r) => r.name === 'MYCOPY'));

  console.log('  copying the LAST record in the file (nothing physically after it) still works');
  const lastRecModel = model;
  const detail = lastRecModel.records.find((r) => r.name === 'DETAIL');
  const afterLastCopy = DspfWriter.copyRecord(lastRecModel, lines, detail);
  const reparsed3 = DspfParser.parseDspf(afterLastCopy.join('\n'));
  check('DETAIL2 is appended after DETAIL, at the true end of the file', reparsed3.records.map((r) => r.name).join(',') === 'MENU,DETAIL,DETAIL2');
}

console.log('\nDspfWriter.deleteRecord() - removes a whole record format, including every field/constant it owns');
{
  const { buildLine } = require('../fixtures/lineBuilder.js');

  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MENU' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'MAIN MENU'" }),
    buildLine({ seq: '00030', name: 'OPT', dataType: 'A', length: '2', usage: 'B', line: '3', col: '5' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'DETAIL' }),
    buildLine({ seq: '00050', line: '1', col: '2', func: "'Detail'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const menu = model.records.find((r) => r.name === 'MENU');

  const afterDelete = DspfWriter.deleteRecord(menu, lines);
  const reparsed = DspfParser.parseDspf(afterDelete.join('\n'));
  check('MENU and both its lines (own header + field) are gone', reparsed.records.map((r) => r.name).join(',') === 'DETAIL');
  check('DETAIL, the untouched record, survives completely intact', reparsed.records[0].fields.length === 1 && reparsed.records[0].fields[0].constantValue === 'Detail');

  console.log('  deleting the only record in a file leaves an empty (but valid) source');
  const oneRecSrc = [buildLine({ seq: '00010', nameType: 'R', name: 'ONLY' }), buildLine({ seq: '00020', line: '1', col: '2', func: "'hi'" })].join('\n') + '\n';
  const oneRecModel = DspfParser.parseDspf(oneRecSrc);
  const afterOnlyDelete = DspfWriter.deleteRecord(oneRecModel.records[0], oneRecSrc.split(/\r\n|\r|\n/));
  const reparsed2 = DspfParser.parseDspf(afterOnlyDelete.join('\n'));
  check('zero records remain', reparsed2.records.length === 0);
}

console.log('\nDspfWriter.nextAvailableRecordName() - 10-char DDS name limit is respected, same as nextAvailableFieldName');
{
  const { buildLine } = require('../fixtures/lineBuilder.js');
  const src = [buildLine({ seq: '00010', nameType: 'R', name: 'VERYLONGRC' })].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const name = DspfWriter.nextAvailableRecordName(model, 'VERYLONGRC');
  check('candidate name is truncated to fit the 10-char DDS limit', name.length <= 10);
  check('candidate name is genuinely unused', name !== 'VERYLONGRC');
}

console.log('\nDspfWriter.getColorAttr()/setColorAttr() - dedicated colors/attributes editor primitives');
{
  const empty = DspfWriter.getColorAttr([]);
  check('no COLOR/DSPATR -> empty state', empty.color === '' && empty.attrs.length === 0);

  const withBoth = DspfWriter.getColorAttr([
    { name: 'COLOR', parameters: 'BLU', conditions: [], raw: '', sourceLines: [] },
    { name: 'DSPATR', parameters: 'HI UL', conditions: [], raw: '', sourceLines: [] },
    { name: 'TEXT', parameters: "'unrelated'", conditions: [], raw: '', sourceLines: [] },
  ]);
  check('reads the color', withBoth.color === 'BLU');
  check('reads multiple DSPATR attributes out of one keyword', withBoth.attrs.join(',') === 'HI,UL');

  const set = DspfWriter.setColorAttr(
    [{ name: 'TEXT', parameters: "'unrelated'", conditions: [], raw: '', sourceLines: [] }],
    'RED',
    ['HI', 'BL']
  );
  check('unrelated keywords are preserved', set.some((k) => k.name === 'TEXT'));
  check('COLOR is added with the chosen value', set.find((k) => k.name === 'COLOR').parameters === 'RED');
  check('DSPATR is added joining every chosen attribute into one keyword', set.find((k) => k.name === 'DSPATR').parameters === 'HI BL');

  const cleared = DspfWriter.setColorAttr(set, '', []);
  check('empty color/attrs removes both keywords entirely', !cleared.some((k) => k.name === 'COLOR' || k.name === 'DSPATR'));
  check('unrelated keywords still survive clearing', cleared.some((k) => k.name === 'TEXT'));
}

console.log('\nDspfWriter.getValidityCheck()/setValidityCheck() - RANGE/COMP/VALUES are mutually exclusive');
{
  const none = DspfWriter.getValidityCheck([]);
  check('no validity keyword -> empty kind', none.kind === '');

  const withRange = [{ name: 'RANGE', parameters: '1 99', conditions: [], raw: '', sourceLines: [] }];
  check('reads an existing RANGE', DspfWriter.getValidityCheck(withRange).kind === 'RANGE' && DspfWriter.getValidityCheck(withRange).parameters === '1 99');

  const switched = DspfWriter.setValidityCheck(withRange, 'COMP', 'GT 0');
  check('switching kind removes the old RANGE', !switched.some((k) => k.name === 'RANGE'));
  check('and adds the new COMP with its parameters', switched.find((k) => k.name === 'COMP').parameters === 'GT 0');

  const cleared = DspfWriter.setValidityCheck(switched, '', '');
  check('empty kind removes any validity-check keyword', !cleared.some((k) => ['RANGE', 'COMP', 'VALUES'].includes(k.name)));
}

console.log('\nDspfWriter.getEditKeyword()/setEditKeyword() - EDTCDE/EDTWRD are mutually exclusive');
{
  const withCode = [{ name: 'EDTCDE', parameters: 'J', conditions: [], raw: '', sourceLines: [] }];
  check('reads an existing EDTCDE', DspfWriter.getEditKeyword(withCode).kind === 'EDTCDE' && DspfWriter.getEditKeyword(withCode).parameters === 'J');

  const switched = DspfWriter.setEditKeyword(withCode, 'EDTWRD', "'  DR  CR'");
  check('switching kind removes the old EDTCDE', !switched.some((k) => k.name === 'EDTCDE'));
  check('and adds the new EDTWRD with its parameters', switched.find((k) => k.name === 'EDTWRD').parameters === "'  DR  CR'");
}

console.log('\nDspfWriter.getErrorMessageText()/setErrorMessageText() - ERRMSG auto-quotes and escapes for the caller');
{
  const none = DspfWriter.getErrorMessageText([]);
  check('no ERRMSG -> empty text', none === '');

  const set = DspfWriter.setErrorMessageText([], "Value can't be blank");
  const kw = set.find((k) => k.name === 'ERRMSG');
  check('embedded single quote is doubled per DDS literal escaping', kw.parameters === "'Value can''t be blank'");
  check('round-trips back to the original unescaped text', DspfWriter.getErrorMessageText(set) === "Value can't be blank");

  const cleared = DspfWriter.setErrorMessageText(set, '');
  check('blank text removes ERRMSG entirely', !cleared.some((k) => k.name === 'ERRMSG'));
}

console.log('\nDspfWriter.setWindowGeometry() - moves and/or resizes a record\'s own explicit WINDOW(row col height width)');
{
  const src = [
    "     A                                      DSPSIZ(24 80 *DS3)",
    "     A          R WDWREC",
    "     A                                      WINDOW(3 10 8 40)",
    "     A                                      WDWTITLE(' My Window ')",
    "     A                                  1  2'Inside the window'",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records.find((r) => r.name === 'WDWREC');

  const moved = DspfWriter.setWindowGeometry(rec, lines, { row: 5, col: 12 });
  const reparsedMove = DspfParser.parseDspf(moved.join('\n'));
  const movedKw = reparsedMove.records[0].keywords.find((k) => k.name === 'WINDOW');
  check('moves row/col, leaves height/width untouched', movedKw.parameters.trim() === '5 12 8 40');
  check('WDWTITLE is preserved', reparsedMove.records[0].keywords.some((k) => k.name === 'WDWTITLE'));
  check("the window's own field is untouched", reparsedMove.records[0].fields[0].constantValue === 'Inside the window');

  const resized = DspfWriter.setWindowGeometry(rec, lines, { height: 10, width: 50 });
  const reparsedResize = DspfParser.parseDspf(resized.join('\n'));
  const resizedKw = reparsedResize.records[0].keywords.find((k) => k.name === 'WINDOW');
  check('resizes height/width, leaves row/col untouched', resizedKw.parameters.trim() === '3 10 10 50');

  const both = DspfWriter.setWindowGeometry(rec, lines, { row: 1, col: 1, height: 24, width: 80 });
  const reparsedBoth = DspfParser.parseDspf(both.join('\n'));
  check('move + resize together', reparsedBoth.records[0].keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '1 1 24 80');

  let threwNoPositive = false;
  try { DspfWriter.setWindowGeometry(rec, lines, { row: 0 }); } catch (e) { threwNoPositive = true; }
  check('rejects a non-positive row/col/height/width', threwNoPositive);
}

console.log('\nDspfWriter.setWindowGeometry() - resizes (but never moves) a WINDOW(*DFT height width)');
{
  const src = ["     A          R WDWREC", "     A                                      WINDOW(*DFT 8 40)"].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records.find((r) => r.name === 'WDWREC');

  const resized = DspfWriter.setWindowGeometry(rec, lines, { height: 12, width: 60 });
  const reparsed = DspfParser.parseDspf(resized.join('\n'));
  check('*DFT is preserved, height/width updated', reparsed.records[0].keywords.find((k) => k.name === 'WINDOW').parameters.trim() === '*DFT 12 60');

  let threwOnMove = false;
  try { DspfWriter.setWindowGeometry(rec, lines, { row: 5 }); } catch (e) { threwOnMove = true; }
  check('rejects an attempt to move a *DFT-positioned window', threwOnMove);
}

console.log('\nDspfWriter.setWindowGeometry() - rejects a window that inherits its geometry from another record');
{
  const src = [
    "     A          R BASEWDW",
    "     A                                      WINDOW(3 10 8 40)",
    "     A          R OTHERWDW",
    "     A                                      WINDOW(BASEWDW)",
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records.find((r) => r.name === 'OTHERWDW');

  let threw = false;
  try { DspfWriter.setWindowGeometry(rec, lines, { row: 5 }); } catch (e) { threw = true; }
  check('rejects moving/resizing a WINDOW(record-format-name) inheritance form', threw);
}

console.log('\nDspfWriter.setWindowGeometry() - rejects a record with no WINDOW keyword at all');
{
  const src = "     A          R PLAINREC\n";
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records.find((r) => r.name === 'PLAINREC');

  let threw = false;
  try { DspfWriter.setWindowGeometry(rec, lines, { row: 5 }); } catch (e) { threw = true; }
  check('rejects a record with no WINDOW keyword', threw);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

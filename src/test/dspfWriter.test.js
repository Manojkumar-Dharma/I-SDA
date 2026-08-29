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
  check('all 24 key numbers available before anything is assigned', DspfWriter.availableCommandKeyNumbers(model.records[0].keywords).length === 24);

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
  const avail1 = DspfWriter.availableCommandKeyNumbers(menuRec1.keywords);
  check('a key number already used at the FILE level is still offered at the record level - a record may override it, not a conflict', avail1.includes('03') && avail1.length === 24);

  const withRecKey = DspfWriter.setCommandKey(menuRec1.keywords, 'CF', 12, null, null);
  const afterRecAdd = DspfWriter.applyRecordUpdate(menuRec1, afterFileAdd, { keywords: withRecKey });
  const reparsed2 = DspfParser.parseDspf(afterRecAdd.join('\n'));
  const menuRec2 = reparsed2.records.find((r) => r.name === 'MENU');
  const detailRec2 = reparsed2.records.find((r) => r.name === 'DETAIL');
  check('CF12 round-trips at record level, bare (no indicator/text)', menuRec2.keywords.some((k) => k.name === 'CF12' && k.parameters.trim() === ''));

  const avail2File = DspfWriter.availableCommandKeyNumbers(detailRec2.keywords);
  check("a key used on ONE record does not block it on a DIFFERENT record (DETAIL still sees 12 as available)", avail2File.includes('12'));
  const avail2SameRec = DspfWriter.availableCommandKeyNumbers(menuRec2.keywords);
  check('but that same record correctly excludes its own 12 (can\'t define it twice within one record)', !avail2SameRec.includes('12'));

  // a record CAN override a file-level number: MENU redefines file-level key 03 as its own CF03
  const withOverride = DspfWriter.setCommandKey(menuRec2.keywords, 'CF', 3, '91', 'Override');
  const afterOverride = DspfWriter.applyRecordUpdate(menuRec2, afterRecAdd, { keywords: withOverride });
  const reparsed2b = DspfParser.parseDspf(afterOverride.join('\n'));
  const menuRec2b = reparsed2b.records.find((r) => r.name === 'MENU');
  check('MENU can carry its own CF03 alongside the file-level CA03 - a legitimate override, not a duplicate',
    menuRec2b.keywords.some((k) => k.name === 'CF03') && DspfWriter.parseCommandKeys(reparsed2b.fileKeywords).some((k) => k.number === '03' && k.type === 'CA'));
  const legend = DspfEngine.resolveFunctionKeyLegend(reparsed2b, menuRec2b, new Set());
  const legend03 = legend.find((k) => k.number === '03');
  check("resolveFunctionKeyLegend resolves key 03 to MENU's own CF override, not the file-level CA", legend03 && legend03.type === 'CF' && legend03.indicator === '91');

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

console.log('\nDspfWriter.insertTypedRecord() - "+ Add record" record-TYPE wizard primitive (SFLCTL/SFL/WINDOW)');
{
  const { buildLine } = require('../fixtures/lineBuilder.js');

  console.log('  Subfile control (SFLCTL): writes SFLCTL(sflname), no pairBack needed');
  {
    const src = [
      buildLine({ seq: '00010', nameType: 'R', name: 'DETAIL', func: 'SFL' }),
      buildLine({ seq: '00030', name: 'NAME', dataType: 'A', length: '10', usage: 'O', line: '1', col: '1' }),
    ].join('\n') + '\n';
    const model = DspfParser.parseDspf(src);
    const lines = src.split(/\r\n|\r|\n/);
    const afterInsert = DspfWriter.insertTypedRecord(
      model,
      lines,
      { name: 'CTL', keywords: [{ name: 'SFLCTL', parameters: 'DETAIL', conditions: [], raw: '', sourceLines: [] }] },
      null
    );
    const reparsed = DspfParser.parseDspf(afterInsert.join('\n'));
    const ctl = reparsed.records.find((r) => r.name === 'CTL');
    check('new CTL record was created', !!ctl);
    check('CTL carries SFLCTL(DETAIL)', ctl && ctl.keywords.some((k) => k.name === 'SFLCTL' && k.parameters.trim() === 'DETAIL'));
    check('the DETAIL record is untouched', reparsed.records.find((r) => r.name === 'DETAIL').keywords.some((k) => k.name === 'SFL'));
  }

  console.log('  Subfile (SFL): writes SFL on the new record AND rewrites the existing SFLCTL record to point at it (pairBack)');
  {
    const src = [
      buildLine({ seq: '00010', nameType: 'R', name: 'CTL', func: 'SFLCTL(OLDNAME)' }),
      buildLine({ seq: '00030', name: 'HDR', dataType: 'A', length: '2', usage: 'O', line: '1', col: '1' }),
    ].join('\n') + '\n';
    const model = DspfParser.parseDspf(src);
    const lines = src.split(/\r\n|\r|\n/);
    const ctlRecord = model.records.find((r) => r.name === 'CTL');
    const afterInsert = DspfWriter.insertTypedRecord(
      model,
      lines,
      { name: 'DETAIL', keywords: [{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }] },
      ctlRecord
    );
    const reparsed = DspfParser.parseDspf(afterInsert.join('\n'));
    const detail = reparsed.records.find((r) => r.name === 'DETAIL');
    const ctl = reparsed.records.find((r) => r.name === 'CTL');
    check('new DETAIL record was created with SFL', detail && detail.keywords.some((k) => k.name === 'SFL'));
    check("CTL's SFLCTL parameter was rewritten from OLDNAME to DETAIL (paired back)", ctl && ctl.keywords.some((k) => k.name === 'SFLCTL' && k.parameters.trim() === 'DETAIL'));
    check("CTL's own field content is untouched", ctl && ctl.fields.some((f) => f.name === 'HDR'));
  }

  console.log('  Window: new geometry (literal row/col/height/width) vs. inheriting an existing record\'s geometry');
  {
    const src = [buildLine({ seq: '00010', nameType: 'R', name: 'BASE' })].join('\n') + '\n';
    const model = DspfParser.parseDspf(src);
    const lines = src.split(/\r\n|\r|\n/);

    const withGeometry = DspfWriter.insertTypedRecord(model, lines, { name: 'WIN1', keywords: [{ name: 'WINDOW', parameters: '2 2 10 40', conditions: [], raw: '', sourceLines: [] }] }, null);
    const reparsedGeo = DspfParser.parseDspf(withGeometry.join('\n'));
    const win1 = reparsedGeo.records.find((r) => r.name === 'WIN1');
    check('WIN1 gets its own literal WINDOW geometry', win1 && win1.keywords.some((k) => k.name === 'WINDOW' && k.parameters.trim() === '2 2 10 40'));

    const withInherit = DspfWriter.insertTypedRecord(model, lines, { name: 'WIN2', keywords: [{ name: 'WINDOW', parameters: 'BASE', conditions: [], raw: '', sourceLines: [] }] }, null);
    const reparsedInherit = DspfParser.parseDspf(withInherit.join('\n'));
    const win2 = reparsedInherit.records.find((r) => r.name === 'WIN2');
    check('WIN2 instead inherits geometry via WINDOW(BASE)', win2 && win2.keywords.some((k) => k.name === 'WINDOW' && k.parameters.trim() === 'BASE'));
  }

  console.log('  Window subfile control (WDWSFL) and pull-down subfile control (PDNSFL): a single new record can carry MULTIPLE type-defining keywords at once');
  {
    const src = [buildLine({ seq: '00010', nameType: 'R', name: 'DTL', func: 'SFL' })].join('\n') + '\n';
    const model = DspfParser.parseDspf(src);
    const lines = src.split(/\r\n|\r|\n/);

    const wdwsfl = DspfWriter.insertTypedRecord(
      model,
      lines,
      { name: 'WCTL', keywords: [
        { name: 'SFLCTL', parameters: 'DTL', conditions: [], raw: '', sourceLines: [] },
        { name: 'WINDOW', parameters: '2 2 10 40', conditions: [], raw: '', sourceLines: [] },
      ] },
      null
    );
    const reparsedWdwsfl = DspfParser.parseDspf(wdwsfl.join('\n'));
    const wctl = reparsedWdwsfl.records.find((r) => r.name === 'WCTL');
    check('WCTL carries SFLCTL(DTL)', wctl && wctl.keywords.some((k) => k.name === 'SFLCTL' && k.parameters.trim() === 'DTL'));
    check('WCTL ALSO carries WINDOW(2 2 10 40) - a windowed subfile control record', wctl && wctl.keywords.some((k) => k.name === 'WINDOW' && k.parameters.trim() === '2 2 10 40'));

    const pdnsfl = DspfWriter.insertTypedRecord(
      model,
      lines,
      { name: 'PCTL', keywords: [
        { name: 'SFLCTL', parameters: 'DTL', conditions: [], raw: '', sourceLines: [] },
        { name: 'PULLDOWN', parameters: '', conditions: [], raw: '', sourceLines: [] },
      ] },
      null
    );
    const reparsedPdnsfl = DspfParser.parseDspf(pdnsfl.join('\n'));
    const pctl = reparsedPdnsfl.records.find((r) => r.name === 'PCTL');
    check('PCTL carries SFLCTL(DTL)', pctl && pctl.keywords.some((k) => k.name === 'SFLCTL' && k.parameters.trim() === 'DTL'));
    check('PCTL ALSO carries PULLDOWN - a pull-down subfile control record', pctl && pctl.keywords.some((k) => k.name === 'PULLDOWN'));
  }

  console.log('  Plain keyword-only types: PULLDOWN (pull-down menu) and MNUBAR (menu bar), no dependent record');
  {
    const src = [buildLine({ seq: '00010', nameType: 'R', name: 'BASE' })].join('\n') + '\n';
    const model = DspfParser.parseDspf(src);
    const lines = src.split(/\r\n|\r|\n/);

    const pulldown = DspfWriter.insertTypedRecord(model, lines, { name: 'FPULDWN', keywords: [{ name: 'PULLDOWN', parameters: '', conditions: [], raw: '', sourceLines: [] }] }, null);
    const reparsedPulldown = DspfParser.parseDspf(pulldown.join('\n'));
    check('FPULDWN carries a plain PULLDOWN keyword', reparsedPulldown.records.find((r) => r.name === 'FPULDWN').keywords.some((k) => k.name === 'PULLDOWN'));

    const mnubar = DspfWriter.insertTypedRecord(model, lines, { name: 'BAR1', keywords: [{ name: 'MNUBAR', parameters: '', conditions: [], raw: '', sourceLines: [] }] }, null);
    const reparsedMnubar = DspfParser.parseDspf(mnubar.join('\n'));
    check('BAR1 carries a plain MNUBAR keyword', reparsedMnubar.records.find((r) => r.name === 'BAR1').keywords.some((k) => k.name === 'MNUBAR'));
  }

  console.log('  Subfile message (SFLMSG): SFL + SFLMSGRCD(line) on the record, plus two synthesized hidden fields (SFLMSGKEY/SFLPGMQ) via a reparse-between-inserts pipeline');
  {
    const src = [buildLine({ seq: '00010', nameType: 'R', name: 'CTL', func: 'SFLCTL(OLDNAME)' })].join('\n') + '\n';
    const model = DspfParser.parseDspf(src);
    const lines = src.split(/\r\n|\r|\n/);
    const ctlRecord = model.records.find((r) => r.name === 'CTL');

    // The record itself (SFL + SFLMSGRCD), paired back to CTL exactly like plain SFL.
    let newLines = DspfWriter.insertTypedRecord(
      model,
      lines,
      { name: 'MSGSFL', keywords: [
        { name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] },
        { name: 'SFLMSGRCD', parameters: '23', conditions: [], raw: '', sourceLines: [] },
      ] },
      ctlRecord
    );
    // Then its two hidden fields, ONE AT A TIME with a reparse between each -
    // exactly the pipeline the webview's own SFLMSG handler runs (see
    // buildWebviewTemplate.js's newRecordBtn handler).
    let midModel = DspfParser.parseDspf(newLines.join('\n'));
    let rec = midModel.records.find((r) => r.name === 'MSGSFL');
    newLines = DspfWriter.insertField(rec, newLines, { nameType: 'FIELD', name: 'MSGKEY', location: { line: null, column: null }, usage: 'H', keywords: [{ name: 'SFLMSGKEY', parameters: '', conditions: [], raw: '', sourceLines: [] }] });
    midModel = DspfParser.parseDspf(newLines.join('\n'));
    rec = midModel.records.find((r) => r.name === 'MSGSFL');
    newLines = DspfWriter.insertField(rec, newLines, { nameType: 'FIELD', name: 'PGMQ', location: { line: null, column: null }, usage: 'H', keywords: [{ name: 'SFLPGMQ', parameters: '', conditions: [], raw: '', sourceLines: [] }] });

    const final = DspfParser.parseDspf(newLines.join('\n'));
    const msgsfl = final.records.find((r) => r.name === 'MSGSFL');
    const ctl = final.records.find((r) => r.name === 'CTL');
    check('MSGSFL carries SFL', msgsfl && msgsfl.keywords.some((k) => k.name === 'SFL'));
    check('MSGSFL carries SFLMSGRCD(23)', msgsfl && msgsfl.keywords.some((k) => k.name === 'SFLMSGRCD' && k.parameters.trim() === '23'));
    check("CTL's SFLCTL parameter was rewritten to MSGSFL (paired back)", ctl && ctl.keywords.some((k) => k.name === 'SFLCTL' && k.parameters.trim() === 'MSGSFL'));
    const msgkeyField = msgsfl && msgsfl.fields.find((f) => f.name === 'MSGKEY');
    const pgmqField = msgsfl && msgsfl.fields.find((f) => f.name === 'PGMQ');
    check('MSGSFL has BOTH synthesized hidden fields (MSGKEY and PGMQ)', !!msgkeyField && !!pgmqField);
    check('MSGKEY is usage H and carries SFLMSGKEY', msgkeyField.usage === 'H' && msgkeyField.keywords.some((k) => k.name === 'SFLMSGKEY'));
    check('PGMQ is usage H and carries a bare SFLPGMQ (no 276)', pgmqField.usage === 'H' && pgmqField.keywords.some((k) => k.name === 'SFLPGMQ' && k.parameters.trim() === ''));
    check("MSGKEY's own line/column are blank (hidden fields have no on-screen position)", msgkeyField.location.line === null && msgkeyField.location.column === null);
  }
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

console.log('\nDspfWriter.getErrorMessageInstances()/setErrorMessageInstances() - Task L1b, ERRMSG/ERRMSGID as repeatable conditioned instances (IBM DDS ref V4R5, ERRMSG/ERRMSGID keyword section, Figure 174)');
{
  const none = DspfWriter.getErrorMessageInstances([]);
  check('no ERRMSG/ERRMSGID -> empty list', Array.isArray(none) && none.length === 0);

  // ERRMSG('message-text' [response-indicator])
  const withErrmsg = DspfWriter.setErrorMessageInstances([], [
    { kind: 'ERRMSG', text: "Value can't be blank", responseIndicator: '61', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '61', not: false }] }] },
  ]);
  const errmsgKw = withErrmsg.find((k) => k.name === 'ERRMSG');
  check('embedded single quote is doubled per DDS literal escaping', errmsgKw.parameters === "'Value can''t be blank' 61");
  check('outer conditioning is preserved as its own conditions array', errmsgKw.conditions[0].indicators[0].number === '61');
  const backErrmsg = DspfWriter.getErrorMessageInstances(withErrmsg)[0];
  check('round-trips kind', backErrmsg.kind === 'ERRMSG');
  check('round-trips unescaped text', backErrmsg.text === "Value can't be blank");
  check('round-trips the bare response indicator', backErrmsg.responseIndicator === '61');

  // ERRMSG with no response indicator - trailing token omitted entirely.
  const noRespInd = DspfWriter.setErrorMessageInstances([], [{ kind: 'ERRMSG', text: 'Plain message', conditions: [] }]);
  check('no response indicator -> no trailing token written', noRespInd.find((k) => k.name === 'ERRMSG').parameters === "'Plain message'");

  // ERRMSGID(msgid [library/]msgfile [response-indicator] [&msg-data]) - IBM's own Figure 174 example.
  const withErrmsgid = DspfWriter.setErrorMessageInstances([], [
    { kind: 'ERRMSGID', msgId: 'MSG2000', library: 'CONSOLEMSG', msgFile: 'CONSOLEMSG', responseIndicator: '63', msgDataField: '&RPLTXT', conditions: [] },
  ]);
  check('library/msgfile written as ONE slash-qualified token, not two space-separated ones', withErrmsgid.find((k) => k.name === 'ERRMSGID').parameters === 'MSG2000 CONSOLEMSG/CONSOLEMSG 63 &RPLTXT');
  const backErrmsgid = DspfWriter.getErrorMessageInstances(withErrmsgid)[0];
  check('round-trips msgId', backErrmsgid.msgId === 'MSG2000');
  check('round-trips library parsed back out of the slash-qualified token', backErrmsgid.library === 'CONSOLEMSG');
  check('round-trips msgFile parsed back out of the slash-qualified token', backErrmsgid.msgFile === 'CONSOLEMSG');
  check('round-trips response indicator', backErrmsgid.responseIndicator === '63');
  check('round-trips msg-data field', backErrmsgid.msgDataField === '&RPLTXT');

  // ERRMSGID with no library - IBM's own *LIBL-implied form, single unqualified token.
  const noLibrary = DspfWriter.setErrorMessageInstances([], [{ kind: 'ERRMSGID', msgId: 'ID00001', msgFile: 'MSGF001', conditions: [] }]);
  check('no library -> msgfile written unqualified (relies on *LIBL at runtime)', noLibrary.find((k) => k.name === 'ERRMSGID').parameters === 'ID00001 MSGF001');
  check('unqualified msgfile round-trips with an empty library', DspfWriter.getErrorMessageInstances(noLibrary)[0].library === '');

  // ERRMSG and ERRMSGID coexisting, each independently conditioned, matching real SDA's own screen.
  const both = DspfWriter.setErrorMessageInstances([], [
    { kind: 'ERRMSG', text: 'No stock available', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }] },
    { kind: 'ERRMSGID', msgId: 'XYZ9999', msgFile: 'APPLMSGS', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '20', not: false }] }] },
  ]);
  check('both keywords coexist', both.filter((k) => k.name === 'ERRMSG' || k.name === 'ERRMSGID').length === 2);
  const bothBack = DspfWriter.getErrorMessageInstances(both);
  check('each keeps its OWN, different conditioning', bothBack[0].conditions[0].indicators[0].number === '10' && bothBack[1].conditions[0].indicators[0].number === '20');

  // Incomplete entries are skipped, not written as malformed DDS.
  const incomplete = DspfWriter.setErrorMessageInstances([], [
    { kind: 'ERRMSG', text: '', conditions: [] },
    { kind: 'ERRMSGID', msgId: 'ID1', msgFile: '', conditions: [] },
    { kind: 'ERRMSGID', msgId: '', msgFile: 'F1', conditions: [] },
  ]);
  check('blank-text ERRMSG and incomplete ERRMSGID entries are all dropped', incomplete.length === 0);

  check('unrelated keywords are preserved', DspfWriter.setErrorMessageInstances([{ name: 'DSPATR', parameters: 'HI', conditions: [], raw: '', sourceLines: [] }], []).some((k) => k.name === 'DSPATR'));
}


console.log('\nDspfWriter.parseCheckCodes()/formatCheckCodes() - CHECK(...) codes shared by SDA\u2019s Keying options + Validity check screens (Task L1d)');
{
  check('no parameters -> empty array', DspfWriter.parseCheckCodes('').length === 0);
  check('blank parameters -> empty array', DspfWriter.parseCheckCodes('   ').length === 0);
  check('reads multiple codes out of one CHECK, uppercased', DspfWriter.parseCheckCodes('me ab').join(',') === 'ME,AB');
  check('formatCheckCodes joins codes with a space, in order', DspfWriter.formatCheckCodes(['FE', 'VN']) === 'FE VN');
  check('formatCheckCodes drops falsy entries', DspfWriter.formatCheckCodes(['FE', '', null, 'VN']) === 'FE VN');
  check('formatCheckCodes of an empty list is empty', DspfWriter.formatCheckCodes([]) === '');

  console.log('  CHECK is now multi-instance via Task L1\\u2019s getRepeatableKeywordInstances/setRepeatableKeywordInstances (not a dedicated getX/setX pair)');
  var withTwoChecks = DspfWriter.setRepeatableKeywordInstances(
    [{ name: 'TEXT', parameters: "'unrelated'", conditions: [], raw: '', sourceLines: [] }],
    ['CHECK'],
    [
      { name: 'CHECK', parameters: 'ME', conditions: [] },
      { name: 'CHECK', parameters: 'AB', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '30', not: false }] }] },
    ]
  );
  check('unrelated keywords are preserved', withTwoChecks.some((k) => k.name === 'TEXT'));
  var checkInstances = DspfWriter.getRepeatableKeywordInstances(withTwoChecks, ['CHECK']);
  check('BOTH CHECK instances coexist as separate keywords', checkInstances.length === 2);
  check('first instance keeps its own code and no conditioning', checkInstances[0].parameters === 'ME' && checkInstances[0].conditions.length === 0);
  check('second instance keeps its own code AND its own conditioning, independent of the first', checkInstances[1].parameters === 'AB' && checkInstances[1].conditions.length === 1 && checkInstances[1].conditions[0].indicators[0].number === '30');
  check('coexists alongside a validity-check keyword (RANGE/COMP/VALUES are a separate keyword entirely)', DspfWriter.setValidityCheck(withTwoChecks, 'RANGE', '1 99').some((k) => k.name === 'CHECK'));

  var cleared = DspfWriter.setRepeatableKeywordInstances(withTwoChecks, ['CHECK'], []);
  check('an empty instance list removes every CHECK', !cleared.some((k) => k.name === 'CHECK'));
  check('unrelated keywords still survive clearing', cleared.some((k) => k.name === 'TEXT'));
}

console.log('\nDspfWriter.getInputKeywords()/setInputKeywords() - DUP/BLANKS/CHANGE/CHGINPDFT booleans');
{
  const none = DspfWriter.getInputKeywords([]);
  check('none present -> all false', !none.dup && !none.blanks && !none.change && !none.chginpdft);

  const withDup = [{ name: 'DUP', parameters: '', conditions: [], raw: '', sourceLines: [] }];
  check('reads an existing DUP', DspfWriter.getInputKeywords(withDup).dup === true);

  const set = DspfWriter.setInputKeywords([], { dup: true, blanks: false, change: true, chginpdft: true });
  check('adds DUP', set.some((k) => k.name === 'DUP'));
  check('adds CHANGE', set.some((k) => k.name === 'CHANGE'));
  check('adds CHGINPDFT', set.some((k) => k.name === 'CHGINPDFT'));
  check('leaves BLANKS off', !set.some((k) => k.name === 'BLANKS'));

  const toggledOff = DspfWriter.setInputKeywords(set, { dup: false, blanks: false, change: true, chginpdft: false });
  check('toggling off removes just that keyword', !toggledOff.some((k) => k.name === 'DUP') && !toggledOff.some((k) => k.name === 'CHGINPDFT'));
  check('leaves the still-on one alone', toggledOff.some((k) => k.name === 'CHANGE'));
}

console.log('\nDspfWriter.getGeneralFieldKeywords()/setGeneralFieldKeywords() - ALIAS/INDTXT/DFT/DFTVAL/FLDCSRPRG/HLPID + boolean flags');
{
  const none = DspfWriter.getGeneralFieldKeywords([]);
  check('none present -> empty text, false flags', none.alias === '' && none.putretain === false);
  check('none present -> HLPID empty too', none.hlpid === '');

  const set = DspfWriter.setGeneralFieldKeywords([], {
    alias: 'CUST_NAME',
    dft: "'N/A'",
    fldcsrprg: 'NEXTFLD',
    hlpid: 'FLDHELP1',
    putretain: true,
    ovrdta: false,
    chrid: true,
  });
  check('ALIAS written as bare name (caller-supplied form)', set.find((k) => k.name === 'ALIAS').parameters === 'CUST_NAME');
  check('DFT written with caller-supplied quoting', set.find((k) => k.name === 'DFT').parameters === "'N/A'");
  check('FLDCSRPRG written', set.find((k) => k.name === 'FLDCSRPRG').parameters === 'NEXTFLD');
  check('HLPID written as a bare identifier (task D4 - constant field-level keyword)', set.find((k) => k.name === 'HLPID').parameters === 'FLDHELP1');
  check('PUTRETAIN boolean added bare', set.some((k) => k.name === 'PUTRETAIN' && k.parameters === ''));
  check('OVRDTA left off since it was false', !set.some((k) => k.name === 'OVRDTA'));
  check('CHRID boolean added', set.some((k) => k.name === 'CHRID'));

  const roundTrip = DspfWriter.getGeneralFieldKeywords(set);
  check('round-trips text fields back out', roundTrip.alias === 'CUST_NAME' && roundTrip.dft === "'N/A'");
  check('round-trips HLPID back out', roundTrip.hlpid === 'FLDHELP1');
  check('round-trips boolean flags back out', roundTrip.putretain === true && roundTrip.chrid === true && roundTrip.ovrdta === false);

  const cleared = DspfWriter.setGeneralFieldKeywords(set, {});
  check('blank/false state clears everything this pair manages', !cleared.some((k) => ['ALIAS', 'DFT', 'FLDCSRPRG', 'HLPID', 'PUTRETAIN', 'CHRID'].includes(k.name)));
}

console.log('\nDspfWriter.getReferenceOverrides()/setReferenceOverrides() - DLTCHK/DLTEDT alongside REFFLD/REF');
{
  const none = DspfWriter.getReferenceOverrides([]);
  check('none present -> both false', !none.dltchk && !none.dltedt);

  const set = DspfWriter.setReferenceOverrides(
    [{ name: 'REFFLD', parameters: 'CUSTNO', conditions: [], raw: '', sourceLines: [] }],
    { dltchk: true, dltedt: false }
  );
  check('REFFLD (managed by the existing Resolve Referenced Field feature) is untouched', set.some((k) => k.name === 'REFFLD'));
  check('DLTCHK added', set.some((k) => k.name === 'DLTCHK'));
  check('DLTEDT left off', !set.some((k) => k.name === 'DLTEDT'));

  const cleared = DspfWriter.setReferenceOverrides(set, { dltchk: false, dltedt: false });
  check('clearing both removes them but keeps REFFLD', !cleared.some((k) => k.name === 'DLTCHK') && cleared.some((k) => k.name === 'REFFLD'));
}

console.log('\nDspfWriter.getMessageId()/setMessageId() - MSGID, caller-supplied argument form (varies too much to decompose)');
{
  const none = DspfWriter.getMessageId([]);
  check('no MSGID -> empty string', none === '');

  const set = DspfWriter.setMessageId([], 'USR &FLDNAME MSGF1 MYLIB');
  check('MSGID written as supplied', set.find((k) => k.name === 'MSGID').parameters === 'USR &FLDNAME MSGF1 MYLIB');
  check('round-trips back out', DspfWriter.getMessageId(set) === 'USR &FLDNAME MSGF1 MYLIB');

  const cleared = DspfWriter.setMessageId(set, '');
  check('blank parameters removes MSGID entirely', !cleared.some((k) => k.name === 'MSGID'));
}

console.log('\nDspfWriter.getWindowTitleText()/setWindowTitleText() - WDWTITLE, preserving any other parameters (position modifiers etc.)');
{
  const none = DspfWriter.getWindowTitleText([]);
  check('no WDWTITLE -> empty text', none === '');

  const added = DspfWriter.setWindowTitleText([], 'My Window');
  const addedKw = added.find((k) => k.name === 'WDWTITLE');
  check('adding one where none existed writes just the quoted text', addedKw && addedKw.parameters === "'My Window'");
  check('round-trips back to the original text', DspfWriter.getWindowTitleText(added) === 'My Window');

  const existing = [{ name: 'WDWTITLE', parameters: "(*TEXT 'Old Title') (*TOP *CENTER)", conditions: [], raw: '', sourceLines: [] }];
  check('reads the title out from among other parameters', DspfWriter.getWindowTitleText(existing) === 'Old Title');

  const swapped = DspfWriter.setWindowTitleText(existing, "New Title's here");
  const swappedKw = swapped.find((k) => k.name === 'WDWTITLE');
  check('swaps only the quoted title text, preserving the surrounding position modifiers', swappedKw.parameters === "(*TEXT 'New Title''s here') (*TOP *CENTER)");
  check('embedded apostrophe correctly doubled', DspfWriter.getWindowTitleText(swapped) === "New Title's here");

  const cleared = DspfWriter.setWindowTitleText(existing, '');
  check('blank text removes WDWTITLE entirely, even a multi-parameter one', !cleared.some((k) => k.name === 'WDWTITLE'));
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

console.log('\nDspfWriter D5 - menu-bar choice fields (MNUBARCHC, MNUBARSEP, Choice Selection Type, CHOICE, CHCACCEL, CHCCTL, CHCAVAIL/CHCUNAVAIL/CHCSLT)');
{
  console.log('  getMenubarChoices()/setMenubarChoices() - MNUBARCHC(id record \'text\'), one per top-level menu-bar choice');
  const none = DspfWriter.getMenubarChoices([]);
  check('no MNUBARCHC -> empty array', Array.isArray(none) && none.length === 0);

  const withChoices = DspfWriter.setMenubarChoices([], [
    { id: '1', pulldownRecord: 'PULLFILE', text: '>FILE' },
    { id: '2', pulldownRecord: 'PULLEDIT', text: '>EDIT' },
  ]);
  const read = DspfWriter.getMenubarChoices(withChoices);
  check('two MNUBARCHC entries written and read back in order', read.length === 2 && read[0].id === '1' && read[0].pulldownRecord === 'PULLFILE' && read[0].text === '>FILE' && read[1].id === '2' && read[1].pulldownRecord === 'PULLEDIT');
  check('blank/incomplete entries are skipped', DspfWriter.getMenubarChoices(DspfWriter.setMenubarChoices([], [{ id: '1', pulldownRecord: '', text: 'x' }])).length === 0);
  check('an existing embedded single-quote round-trips (DDS-doubled on write)', (() => {
    const kw = DspfWriter.setMenubarChoices([], [{ id: '1', pulldownRecord: 'PULLFILE', text: "It's here" }]);
    check('  ...written with doubled quote', kw[0].parameters.indexOf("It''s here") >= 0);
    return DspfWriter.getMenubarChoices(kw)[0].text === "It's here";
  })());
  check('unrelated keywords are preserved', DspfWriter.setMenubarChoices([{ name: 'USRDFN', parameters: '', conditions: [], raw: '', sourceLines: [] }], [{ id: '1', pulldownRecord: 'P', text: 'x' }]).some((k) => k.name === 'USRDFN'));

  console.log('  Task L3: MNUBARCHC Text field (&var) and Return field variants (IBM DDS ref Figures 213/214)');
  const withTextField = DspfWriter.setMenubarChoices([], [{ id: '1', pulldownRecord: 'PULLFILE', text: '&FILETXT' }]);
  check('a &field choice text is written unquoted', withTextField[0].parameters.trim() === '1 PULLFILE &FILETXT');
  check('a &field choice text round-trips as the raw &NAME token', DspfWriter.getMenubarChoices(withTextField)[0].text === '&FILETXT');

  const withReturnField = DspfWriter.setMenubarChoices([], [{ id: '4', pulldownRecord: 'PULLOPT', text: '>Options', returnField: '&RTNFLD' }]);
  check('return field written as the trailing token', withReturnField[0].parameters.trim() === "4 PULLOPT '>Options' &RTNFLD");
  const readBack = DspfWriter.getMenubarChoices(withReturnField)[0];
  check('return field round-trips', readBack.returnField === '&RTNFLD');
  check('literal text alongside a return field still round-trips correctly', readBack.text === '>Options');

  check('a return field without a leading & gets one added on write', DspfWriter.setMenubarChoices([], [{ id: '1', pulldownRecord: 'P', text: 'x', returnField: 'RTNFLD' }])[0].parameters.indexOf('&RTNFLD') >= 0);
  check('no return field supplied -> no trailing token written', DspfWriter.setMenubarChoices([], [{ id: '1', pulldownRecord: 'P', text: 'x' }])[0].parameters.trim() === "1 P 'x'");
  check('blank return field on read -> empty string, not null/undefined', DspfWriter.getMenubarChoices(DspfWriter.setMenubarChoices([], [{ id: '1', pulldownRecord: 'P', text: 'x' }]))[0].returnField === '');

  check('both a &text-field AND a return field together round-trip (IBM Figure 214 shape)', (() => {
    const kw = DspfWriter.setMenubarChoices([], [{ id: '4', pulldownRecord: 'PULLOPT', text: '&OPTTXT', returnField: '&RTNFLD' }]);
    const r = DspfWriter.getMenubarChoices(kw)[0];
    return r.text === '&OPTTXT' && r.returnField === '&RTNFLD';
  })());

  console.log('  getMenubarSeparator()/setMenubarSeparator() - MNUBARSEP color/attrs/separator-char sub-groups');
  const noSep = DspfWriter.getMenubarSeparator([]);
  check('no MNUBARSEP -> all blank', noSep.color === '' && noSep.attrs.length === 0 && noSep.char === '');
  let sepKw = DspfWriter.setMenubarSeparator([], { colorEnabled: true, color: 'WHT', attrsEnabled: false, attrs: [], charEnabled: true, char: '.' });
  check('exactly one MNUBARSEP keyword written', sepKw.filter((k) => k.name === 'MNUBARSEP').length === 1);
  let sepRead = DspfWriter.getMenubarSeparator(sepKw);
  check('color round-trips, attrs group omitted since disabled', sepRead.color === 'WHT' && sepRead.attrs.length === 0);
  check('separator character round-trips', sepRead.char === '.');
  check('disabling every sub-group removes MNUBARSEP entirely', DspfWriter.setMenubarSeparator(sepKw, { colorEnabled: false, attrsEnabled: false, charEnabled: false }).some((k) => k.name === 'MNUBARSEP') === false);

  console.log('  getChoiceSelectionType()/setChoiceSelectionType() - SNGCHCFLD/MLTCHCFLD + *param flags/numeric args');
  const noType = DspfWriter.getChoiceSelectionType([]);
  check('neither keyword -> blank kind', noType.kind === '');
  let typeKw = DspfWriter.setChoiceSelectionType([], { kind: 'SNGCHCFLD', flags: ['*AUTOENT', '*SLTIND'], numCol: '3', numRow: '', gutter: '2' });
  check('exactly one selection-type keyword written', typeKw.filter((k) => k.name === 'SNGCHCFLD' || k.name === 'MLTCHCFLD').length === 1);
  let typeRead = DspfWriter.getChoiceSelectionType(typeKw);
  check('kind round-trips as SNGCHCFLD', typeRead.kind === 'SNGCHCFLD');
  check('flags round-trip', typeRead.flags.indexOf('*AUTOENT') >= 0 && typeRead.flags.indexOf('*SLTIND') >= 0);
  check('numCol/gutter round-trip, numRow stays blank', typeRead.numCol === '3' && typeRead.gutter === '2' && typeRead.numRow === '');
  check('switching kind removes the other keyword entirely (mutually exclusive)', DspfWriter.setChoiceSelectionType(typeKw, { kind: 'MLTCHCFLD', flags: [] }).some((k) => k.name === 'SNGCHCFLD') === false);
  check('blank kind removes both entirely', DspfWriter.setChoiceSelectionType(typeKw, { kind: '', flags: [] }).some((k) => k.name === 'SNGCHCFLD' || k.name === 'MLTCHCFLD') === false);

  console.log('  getChoices()/setChoices() - CHOICE(id \'text\'), one per choice on a SNGCHCFLD/MLTCHCFLD field');
  let choiceKw = DspfWriter.setChoices([], [{ id: '1', text: '>ONE' }, { id: '2', text: '>TWO' }, { id: '3', text: '>THREE' }]);
  check('three CHOICE entries written', choiceKw.filter((k) => k.name === 'CHOICE').length === 3);
  let choiceRead = DspfWriter.getChoices(choiceKw);
  check('all three read back in order with correct text', choiceRead.length === 3 && choiceRead[1].id === '2' && choiceRead[1].text === '>TWO');
  check('a &variable choice text round-trips unquoted', DspfWriter.getChoices(DspfWriter.setChoices([], [{ id: '1', text: '&VARTXT' }]))[0].text === '&VARTXT');

  console.log('  getChoiceAccelerators()/setChoiceAccelerators() - CHCACCEL(id \'text\'), same list shape as CHOICE');
  let accelKw = DspfWriter.setChoiceAccelerators([], [{ id: '1', text: 'F6=Save' }]);
  check('one CHCACCEL entry written', accelKw.filter((k) => k.name === 'CHCACCEL').length === 1);
  check('reads back correctly', DspfWriter.getChoiceAccelerators(accelKw)[0].text === 'F6=Save');

  console.log('  getChoiceControls()/setChoiceControls() - CHCCTL(id control-field [message-id message-file [library]])');
  const noCtl = DspfWriter.getChoiceControls([]);
  check('no CHCCTL -> empty array', noCtl.length === 0);
  let ctlKw = DspfWriter.setChoiceControls([], [
    { id: '1', controlField: '&C1', messageId: 'MSG0001', messageFile: 'XZY1337', library: '' },
    { id: '2', controlField: '&C2', messageId: '', messageFile: '', library: '' },
    { id: '3', controlField: '&C3', messageId: '&MSG1', messageFile: '&MSGF', library: '&LIB' },
  ]);
  check('three CHCCTL entries written', ctlKw.filter((k) => k.name === 'CHCCTL').length === 3);
  let ctlRead = DspfWriter.getChoiceControls(ctlKw);
  check('control field alone (no message) round-trips with blank message fields', ctlRead[1].controlField === '&C2' && ctlRead[1].messageId === '' && ctlRead[1].messageFile === '');
  check('control field + message id/file round-trip', ctlRead[0].controlField === '&C1' && ctlRead[0].messageId === 'MSG0001' && ctlRead[0].messageFile === 'XZY1337');
  check('a library-qualified message file round-trips split into messageFile + library', ctlRead[2].messageFile === '&MSGF' && ctlRead[2].library === '&LIB');
  check('an entry missing controlField is skipped entirely', DspfWriter.setChoiceControls([], [{ id: '9', controlField: '' }]).length === 0);

  console.log('  getChoiceColorState()/setChoiceColorState() - CHCAVAIL/CHCUNAVAIL/CHCSLT color/attrs (no *CHAR group)');
  ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].forEach((kwName) => {
    const noState = DspfWriter.getChoiceColorState([], kwName);
    check(kwName + ': absent -> blank color/attrs', noState.color === '' && noState.attrs.length === 0);
    const stateKw = DspfWriter.setChoiceColorState([], kwName, 'BLU', ['HI', 'UL']);
    check(kwName + ': exactly one keyword written', stateKw.filter((k) => k.name === kwName).length === 1);
    const stateRead = DspfWriter.getChoiceColorState(stateKw, kwName);
    check(kwName + ': color/attrs round-trip', stateRead.color === 'BLU' && stateRead.attrs.indexOf('HI') >= 0 && stateRead.attrs.indexOf('UL') >= 0);
    check(kwName + ': blank color and attrs removes the keyword entirely', DspfWriter.setChoiceColorState(stateKw, kwName, '', []).some((k) => k.name === kwName) === false);
  });
  check('the three choice-color-state keywords coexist independently on the same field', (() => {
    let kw = DspfWriter.setChoiceColorState([], 'CHCAVAIL', 'GRN', []);
    kw = DspfWriter.setChoiceColorState(kw, 'CHCUNAVAIL', 'RED', []);
    kw = DspfWriter.setChoiceColorState(kw, 'CHCSLT', 'BLU', []);
    return DspfWriter.getChoiceColorState(kw, 'CHCAVAIL').color === 'GRN' && DspfWriter.getChoiceColorState(kw, 'CHCUNAVAIL').color === 'RED' && DspfWriter.getChoiceColorState(kw, 'CHCSLT').color === 'BLU';
  })());

  console.log('  End-to-end: the real worked MNUBAR/PULLDOWN/CHCCTL example round-trips through serialize + reparse');
  {
    const src = [
      buildLine({ seq: '00010', nameType: 'R', name: 'MB', func: 'MNUBAR' }),
      buildLine({ seq: '00020', name: 'MNUFLD', dataType: 'Y', length: '2', decimals: '0', usage: 'B', line: '1', col: '2' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'PULLFILE', func: 'PULLDOWN' }),
      buildLine({ seq: '00040', name: 'F1', dataType: 'Y', length: '2', decimals: '0', usage: 'B', line: '1', col: '2' }),
    ].join('\n') + '\n';
    const model = DspfParser.parseDspf(src);
    const lines = src.split(/\r\n|\r|\n/);
    const mbRecord = model.records.find((r) => r.name === 'MB');
    const mbField = mbRecord.fields.find((f) => f.name === 'MNUFLD');
    let newLines = DspfWriter.applyFieldUpdate(mbField, lines, { keywords: DspfWriter.setMenubarChoices(mbField.keywords, [{ id: '1', pulldownRecord: 'PULLFILE', text: '>FILE' }]) });

    const reparsed1 = DspfParser.parseDspf(newLines.join('\n'));
    const f1Field = reparsed1.records.find((r) => r.name === 'PULLFILE').fields.find((f) => f.name === 'F1');
    let f1Keywords = DspfWriter.setChoiceSelectionType(f1Field.keywords, { kind: 'SNGCHCFLD', flags: ['*AUTOENT'] });
    f1Keywords = DspfWriter.setChoices(f1Keywords, [{ id: '1', text: '>ONE' }]);
    f1Keywords = DspfWriter.setChoiceControls(f1Keywords, [{ id: '1', controlField: '&C1', messageId: 'MSG0001', messageFile: 'XZY1337' }]);
    newLines = DspfWriter.applyFieldUpdate(f1Field, newLines, { keywords: f1Keywords });

    const reparsed2 = DspfParser.parseDspf(newLines.join('\n'));
    const mnufldFinal = reparsed2.records.find((r) => r.name === 'MB').fields.find((f) => f.name === 'MNUFLD');
    check('MNUBARCHC survives the full round-trip', DspfWriter.getMenubarChoices(mnufldFinal.keywords).length === 1 && DspfWriter.getMenubarChoices(mnufldFinal.keywords)[0].pulldownRecord === 'PULLFILE');
    const f1Final = reparsed2.records.find((r) => r.name === 'PULLFILE').fields.find((f) => f.name === 'F1');
    check('SNGCHCFLD survives the full round-trip', DspfWriter.getChoiceSelectionType(f1Final.keywords).kind === 'SNGCHCFLD');
    check('CHOICE survives the full round-trip', DspfWriter.getChoices(f1Final.keywords).length === 1);
    check('CHCCTL survives the full round-trip', DspfWriter.getChoiceControls(f1Final.keywords)[0].messageId === 'MSG0001');
    check('DspfEngine still renders this as a menubar widget after the edit (render/write stay in sync)', DspfEngine.resolveScreen(reparsed2, reparsed2.records.find((r) => r.name === 'MB').name, new Set()).fields.some((f) => f.widget && f.widget.type === 'menubar'));
  }
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

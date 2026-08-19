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

console.log('\nDspfWriter.applyFileUpdate() - adding a keyword when the file has none yet');
{
  const src = [buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }), buildLine({ seq: '00020', line: '1', col: '2', func: "'Hi'" })].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  check('setup: no file-level keywords yet', model.fileKeywords.length === 0);
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.applyFileUpdate(model, lines, {
    keywords: [{ name: 'INDARA', parameters: '', conditions: [] }],
  });
  check('INDARA lands at the very top of the file, before the record', /^\s*A\s+INDARA/.test(newLines[0]));
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  check('reparses with the new file keyword', reparsed.fileKeywords.some((k) => k.name === 'INDARA'));
  check('the record and its field are untouched', reparsed.records[0].name === 'SCREEN1' && reparsed.records[0].fields[0].constantValue === 'Hi');
}

console.log('\nDspfWriter.applyFileUpdate() - editing existing file keywords in place');
{
  const src =
    [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00020', func: 'INDARA' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'SCREEN1' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  check('setup: two file-level keywords parsed', model.fileKeywords.length === 2);
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.applyFileUpdate(model, lines, {
    keywords: [{ name: 'DSPSIZ', parameters: '24 80 *DS3', conditions: [] }, { name: 'PRINT', parameters: '', conditions: [] }],
  });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  check('DSPSIZ preserved', reparsed.fileKeywords.some((k) => k.name === 'DSPSIZ' && k.parameters === '24 80 *DS3'));
  check('INDARA removed, PRINT added', !reparsed.fileKeywords.some((k) => k.name === 'INDARA') && reparsed.fileKeywords.some((k) => k.name === 'PRINT'));
  check('the record itself is untouched', reparsed.records[0].name === 'SCREEN1');
}

console.log('\nDspfWriter.applyFileUpdate() - clearing all keywords removes the block entirely, not just blanks it');
{
  const src = [buildLine({ seq: '00010', func: 'INDARA' }), buildLine({ seq: '00020', nameType: 'R', name: 'SCREEN1' })].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const newLines = DspfWriter.applyFileUpdate(model, lines, { keywords: [] });
  const nonBlank = newLines.filter((l) => l.trim().length > 0);
  check('no dangling blank line left behind - only the record line remains', nonBlank.length === 1 && /R\s+SCREEN1/.test(nonBlank[0]));
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

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

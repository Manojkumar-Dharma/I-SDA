/**
 * recordTemplatePlacement.test.js
 *
 * Direct unit coverage for WebviewClientHelpers.placeRecordTemplate() - the
 * Task P2 (LIMITATIONS-PLAN.md's P series) shared "click-to-place a whole
 * template" primitive: a new record format, optionally plus an SFLCTL-style
 * dependent record, optionally plus extra fields placed relative to a
 * clicked anchor, landing together as one unit from a single call. Pure
 * Node, no vscode/jsdom needed - run with:
 *   node src/test/recordTemplatePlacement.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
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

function reparse(sourceText) {
  return DspfParser.parseDspf(sourceText);
}

console.log('placeRecordTemplate() - main record only, explicit name, no dependent/extraFields');
{
  const src =
    [
      "     A                                      DSPSIZ(24 80 *DS3)",
      "     A          R EXISTING",
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const result = WebviewClientHelpers.placeRecordTemplate(
    DspfWriter,
    model,
    lines,
    { mainRecord: { name: 'NEWREC', keywords: [] }, dependent: null, extraFields: [] },
    { line: 1, column: 1 },
    reparse
  );

  check('mainRecordName is the explicit name given', result.mainRecordName === 'NEWREC');
  check('dependentRecordName is null (no dependent requested)', result.dependentRecordName === null);
  const reparsed = DspfParser.parseDspf(result.lines.join('\n'));
  check('the new record actually landed in the source', reparsed.records.some((r) => r.name === 'NEWREC'));
  check('the original record is untouched', reparsed.records.some((r) => r.name === 'EXISTING'));
  check('placed after the last existing record (append, never guess mid-file)', reparsed.records.map((r) => r.name).indexOf('NEWREC') === 1);
}

console.log('\nplaceRecordTemplate() - baseName auto-numbering when no explicit name is given');
{
  const src =
    [
      "     A          R REC",
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const result = WebviewClientHelpers.placeRecordTemplate(
    DspfWriter,
    model,
    lines,
    { mainRecord: { baseName: 'REC', keywords: [] }, dependent: null, extraFields: [] },
    { line: 1, column: 1 },
    reparse
  );

  check('auto-numbered off baseName, avoiding the existing REC', result.mainRecordName === 'REC2');
}

console.log('\nplaceRecordTemplate() - main record plus a dependent (SFLCTL-style) record, one atomic unit');
{
  const src = "     A                                      DSPSIZ(24 80 *DS3)\n";
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const result = WebviewClientHelpers.placeRecordTemplate(
    DspfWriter,
    model,
    lines,
    {
      mainRecord: { name: 'SFL1', keywords: [{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }] },
      dependent: { name: 'SFL1CTL', keywords: [{ name: 'SFLCTL', parameters: 'SFL1', conditions: [], raw: '', sourceLines: [] }] },
      extraFields: [],
    },
    { line: 1, column: 1 },
    reparse
  );

  check('mainRecordName resolves to the given name', result.mainRecordName === 'SFL1');
  check('dependentRecordName resolves to the given name', result.dependentRecordName === 'SFL1CTL');
  const reparsed = DspfParser.parseDspf(result.lines.join('\n'));
  const names = reparsed.records.map((r) => r.name);
  check('both records landed', names.indexOf('SFL1') >= 0 && names.indexOf('SFL1CTL') >= 0);
  check('main-then-dependent ordering, as consecutive records from one edit', names.indexOf('SFL1CTL') === names.indexOf('SFL1') + 1);
}

console.log('\nplaceRecordTemplate() - dependent baseName auto-numbering, independent of the main record\'s own name');
{
  const src =
    [
      "     A          R SFLCTL2",
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const result = WebviewClientHelpers.placeRecordTemplate(
    DspfWriter,
    model,
    lines,
    {
      mainRecord: { name: 'SFL1', keywords: [] },
      dependent: { baseName: 'SFLCTL', keywords: [] },
      extraFields: [],
    },
    { line: 1, column: 1 },
    reparse
  );

  check('dependent auto-numbered off its own baseName, skipping the collision', result.dependentRecordName === 'SFLCTL3');
}

console.log('\nplaceRecordTemplate() - extraFields land at anchor+offset, each reparsed before the next (no stale-position clobbering)');
{
  const src = "     A                                      DSPSIZ(24 80 *DS3)\n";
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const result = WebviewClientHelpers.placeRecordTemplate(
    DspfWriter,
    model,
    lines,
    {
      mainRecord: { name: 'WDW1', keywords: [{ name: 'WINDOW', parameters: '2 2 10 40', conditions: [], raw: '', sourceLines: [] }] },
      dependent: null,
      extraFields: [
        { nameType: 'CONSTANT', constantValue: 'Title', offset: { dLine: 0, dColumn: 0 } },
        { nameType: 'FIELD', name: 'FLD1', length: 10, dataType: 'A', usage: 'B', offset: { dLine: 1, dColumn: 2 } },
      ],
    },
    { line: 5, column: 10 },
    reparse
  );

  const reparsed = DspfParser.parseDspf(result.lines.join('\n'));
  const rec = reparsed.records.find((r) => r.name === 'WDW1');
  check('the record itself landed', !!rec);
  check('two extra entries landed on it (constant + field)', rec && rec.fields.length === 2);
  const constant = rec.fields.find((f) => f.nameType === 'CONSTANT');
  const field = rec.fields.find((f) => f.nameType === 'FIELD');
  check('the constant sits exactly at the anchor (offset 0,0)', constant && constant.location.line === 5 && constant.location.column === 10);
  check('the field sits at anchor+offset (line 6, column 12)', field && field.location.line === 6 && field.location.column === 12);
  check('the field kept its own name, not clobbered by the second insert', field && field.name === 'FLD1');
}

console.log('\nplaceRecordTemplate() - extraFields without an offset keep an explicit (e.g. positionless) location untouched');
{
  const src = "     A                                      DSPSIZ(24 80 *DS3)\n";
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const result = WebviewClientHelpers.placeRecordTemplate(
    DspfWriter,
    model,
    lines,
    {
      mainRecord: { name: 'MSGSFL', keywords: [{ name: 'SFL', parameters: '', conditions: [], raw: '', sourceLines: [] }] },
      dependent: null,
      extraFields: [
        { nameType: 'FIELD', name: 'MSGKEY', usage: 'H', keywords: [], location: { line: null, column: null } },
      ],
    },
    { line: 5, column: 10 },
    reparse
  );

  const reparsed = DspfParser.parseDspf(result.lines.join('\n'));
  const rec = reparsed.records.find((r) => r.name === 'MSGSFL');
  const field = rec && rec.fields[0];
  check('the hidden field was not forced onto the clicked anchor', field && field.location.line == null && field.location.column == null);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

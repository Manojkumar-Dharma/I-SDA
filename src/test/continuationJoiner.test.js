/**
 * continuationJoiner.test.js
 *
 * Regression coverage for a reported bug: reading an existing DDS file that
 * continues a long constant literal across multiple source lines using '-'
 * (the DDS convention for "no blank inserted at the split point" - used for
 * splitting mid-word, e.g. wrapping "press" as "pres-" / "s") was instead
 * inserting an extra space at the split point, corrupting the constant's
 * displayed text (e.g. "press Enter." rendering as "pres s Enter.").
 *
 * Root cause: dspfParser.ts's pendingJoiner had the '+'/'-' convention
 * backwards - real DDS uses '-' for "continue with NO blank" (direct
 * concatenation - what you want for a mid-word split) and '+' for
 * "continue WITH one blank inserted". The code had this exactly swapped.
 * Confirmed against a real STRSDA-generated DDS example (screenshot):
 *   A                    5  2'Type new/changed information, pres-
 *   A                       s Enter.'
 * which only reconstructs correctly ("...press Enter.") if '-' means no
 * blank is inserted between "pres" and "s".
 *
 * Fixed in dspfParser.ts (buildLogicalEntries' pendingJoiner) and, to
 * match, in dspfWriter.js's serializeFunctionAreaLines - which previously
 * always continued with '+' when mechanically wrapping one long, already-
 * complete string (a keyword's own overlong parameter text, or a long
 * constant literal) across physical lines. Under the corrected convention
 * that would have started INSERTING a phantom blank into wrapped content on
 * every write - so the writer now uses '-' instead, matching its own intent
 * (split without adding or removing any character).
 *
 * Pure Node, no vscode/jsdom needed.
 * Run with: node src/test/continuationJoiner.test.js
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

console.log("Reading real STRSDA-generated DDS: '-' continuation means NO blank inserted (mid-word split reconstructs correctly)");
{
  // Exact shape of the reported screenshot: "pres-" / "s Enter.'"
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'DSPREC' }),
      buildLine({ seq: '00020', line: '5', col: '2', func: "'Type new/changed information, pres-" }),
      buildLine({ seq: '00030', func: "s Enter.'" }),
      buildLine({ seq: '00040', func: 'COLOR(BLU)' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const field = model.records[0].fields[0];
  check(
    "'-' reconstructs \"press\" with no inserted blank (not \"pres s\")",
    field.constantValue === 'Type new/changed information, press Enter.'
  );
  check('COLOR(BLU) on the following line is unaffected', field.keywords.some((k) => k.name === 'COLOR' && k.parameters.trim() === 'BLU'));
}

console.log("\nReading '+' continuation: DOES insert one blank at the split point");
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'DSPREC' }),
      buildLine({ seq: '00020', line: '3', col: '2', func: "'Hello+" }),
      buildLine({ seq: '00030', func: "World'" }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const field = model.records[0].fields[0];
  check("'+' inserts a blank: \"Hello\" + \"World\" -> \"Hello World\"", field.constantValue === 'Hello World');
}

console.log('\nWriting a long keyword: wraps with the SAME direct-concatenation semantics (no phantom blank injected into the middle of the text)');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'REC1' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '10', col: '10' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const field = model.records[0].fields[0];

  // A run of 60 identical characters - if the writer's continuation ever
  // inserted a phantom blank at the split point, this string would come
  // back with an unexpected space breaking up the run of 'A's.
  const longParam = 'A'.repeat(60);
  const newKeywords = [{ name: 'VALUES', parameters: longParam, conditions: [], raw: '', sourceLines: [] }];
  const newLines = DspfWriter.applyFieldUpdate(field, lines, { keywords: newKeywords });

  check("writer continues with '-', not '+'", newLines.some((l) => l.trim().endsWith('-')));
  check("writer does NOT use '+' continuation", !newLines.some((l) => l.trim().endsWith('+')));

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const rfield = reparsed.records[0].fields[0];
  const roundTripped = rfield.keywords.find((k) => k.name === 'VALUES').parameters.trim();
  check('the wrapped text round-trips EXACTLY - no phantom blank inserted mid-string', roundTripped === longParam);
  check('round-tripped length is exactly 60, not 61 (which a phantom blank would produce)', roundTripped.length === 60);
}

console.log('\nWriting a long constant literal: same direct-concatenation guarantee, since a constant is written through the exact same serializeFunctionAreaLines path');
{
  const src = [buildLine({ seq: '00010', nameType: 'R', name: 'REC1' })].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const longText = 'B'.repeat(50);
  const newField = {
    nameType: 'CONSTANT',
    constantValue: longText,
    location: { line: 1, column: 2 },
    keywords: [],
  };
  const afterInsert = DspfWriter.insertField(model.records[0], lines, newField);
  const reparsed = DspfParser.parseDspf(afterInsert.join('\n'));
  const rconst = reparsed.records[0].fields[0];
  check('a long constant literal round-trips exactly, no inserted blank', rconst.constantValue === longText);
  check('round-tripped length is exactly 50', rconst.constantValue.length === 50);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

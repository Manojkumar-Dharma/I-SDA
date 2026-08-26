/**
 * keywordLineLayout.test.js
 *
 * Regression coverage for a reported bug: adding a keyword through the
 * webview used to APPEND it onto whatever line(s) the field/record's
 * existing unconditioned keywords already occupied, joined by a space and
 * wrapped with '+' line-continuation if it overflowed - collapsing what
 * may have started as several separate lines into one shared continuation
 * block. That's a real problem, not just cosmetic: DDS indicator columns
 * (7-16) apply to a whole physical line/continuation group, not to one
 * keyword within a shared line, so once two keywords were merged onto the
 * same line there was no way to independently condition just one of them
 * afterward - real SDA never does this, it always gives an added keyword
 * its own new line.
 *
 * Fixed in dspfWriter.js: groupKeywordsByCondition no longer merges
 * separate keyword entries at all (previously it merged ADJACENT entries
 * sharing identical conditions); serializeFieldEntry/serializeRecordEntry/
 * serializeFileKeywordsEntry now only let the FIRST unconditioned keyword
 * (or a constant's own literal) ride the entity's own content line -
 * every other keyword, conditioned or not, gets its own dedicated line.
 * Continuation ('+') is still used, but only to wrap a SINGLE keyword's
 * own overly-long name+parameters text across multiple physical lines,
 * never to concatenate separate keywords together.
 *
 * Pure Node, no vscode/jsdom needed.
 * Run with: node src/test/keywordLineLayout.test.js
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

function cond(indicatorNumber) {
  return [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: indicatorNumber, not: false }] }];
}

console.log('Adding a keyword to a field that already has unconditioned keywords: each keyword gets its own line, not joined with a shared continuation');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'REC1' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '10', col: '10', func: 'COLOR(BLU)' }),
      buildLine({ seq: '00030', func: 'DSPATR(HI)' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const field = model.records[0].fields[0];

  const newKeywords = field.keywords.concat([{ name: 'DSPATR', parameters: 'RI', conditions: [], raw: '', sourceLines: [] }]);
  const newLines = DspfWriter.applyFieldUpdate(field, lines, { keywords: newKeywords });

  check('exactly one field-entry line per keyword: 4 lines total (record + 3 keyword lines: COLOR rides the field line, DSPATR(HI) and the new DSPATR(RI) each own theirs)', newLines.filter((l) => l.trim().length > 0).length === 4);
  check('no line contains two different keyword names', !newLines.some((l) => /COLOR\(BLU\).*DSPATR|DSPATR\(HI\).*DSPATR\(RI\)/.test(l)));
  check("the newly-added keyword's own line has nothing else on it", newLines.some((l) => /DSPATR\(RI\)/.test(l) && !/COLOR|DSPATR\(HI\)/.test(l)));

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const rfield = reparsed.records[0].fields[0];
  check('all 3 keywords survive the round-trip', rfield.keywords.length === 3);
  check('COLOR(BLU) preserved', rfield.keywords.some((k) => k.name === 'COLOR' && k.parameters.trim() === 'BLU'));
  check('DSPATR(HI) preserved', rfield.keywords.some((k) => k.name === 'DSPATR' && k.parameters.trim() === 'HI'));
  check('DSPATR(RI) added correctly', rfield.keywords.some((k) => k.name === 'DSPATR' && k.parameters.trim() === 'RI'));
}

console.log('\nSame fix applies at the record level (record-level keywords, not just field-level)');
{
  const src = [buildLine({ seq: '00010', nameType: 'R', name: 'REC1', func: 'SFL' })].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records[0];

  const newKeywords = rec.keywords.concat([{ name: 'SFLSIZ', parameters: '20', conditions: [], raw: '', sourceLines: [] }]);
  const newLines = DspfWriter.applyRecordUpdate(rec, lines, { keywords: newKeywords });
  const nonBlank = newLines.filter((l) => l.trim().length > 0);

  check('SFL rides the R-line, SFLSIZ gets its own new line (2 lines total)', nonBlank.length === 2 && /SFL\s*$/.test(nonBlank[0]) && /SFLSIZ\(20\)/.test(nonBlank[1]));
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const rrec = reparsed.records[0];
  check('both keywords survive the round-trip', rrec.keywords.some((k) => k.name === 'SFL') && rrec.keywords.some((k) => k.name === 'SFLSIZ' && k.parameters.trim() === '20'));
}

console.log('\nTwo keywords sharing the EXACT SAME condition no longer get merged onto one shared line - each stays independently editable/conditionable');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'REC1' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '10', col: '10' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const field = model.records[0].fields[0];

  const newKeywords = [
    { name: 'COLOR', parameters: 'RED', conditions: cond('10'), raw: '', sourceLines: [] },
    { name: 'DSPATR', parameters: 'HI', conditions: cond('10'), raw: '', sourceLines: [] },
  ];
  const newLines = DspfWriter.applyFieldUpdate(field, lines, { keywords: newKeywords });

  const nonBlankLines = newLines.filter((l) => l.trim().length > 0);
  check('field declaration line + 2 separate conditioned keyword lines = 4 lines total (record header + field decl + COLOR + DSPATR - previously COLOR/DSPATR would have merged onto 1 shared line since they share the exact same condition)', nonBlankLines.length === 4);
  check('COLOR(RED) has its own line with nothing else on it', newLines.some((l) => /COLOR\(RED\)/.test(l) && !/DSPATR/.test(l)));
  check('DSPATR(HI) has its own line with nothing else on it', newLines.some((l) => /DSPATR\(HI\)/.test(l) && !/COLOR/.test(l)));

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const rfield = reparsed.records[0].fields[0];
  const rcolor = rfield.keywords.find((k) => k.name === 'COLOR');
  const rdspatr = rfield.keywords.find((k) => k.name === 'DSPATR');
  check('COLOR keeps its own indicator 10 after round-trip', rcolor.conditions[0].indicators[0].number === '10');
  check('DSPATR independently keeps its own indicator 10 after round-trip', rdspatr.conditions[0].indicators[0].number === '10');
}

console.log("\nA single keyword whose own text is too long for one line still wraps with '-' continuation - only concatenating DIFFERENT keywords together is what changed");
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'REC1' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '10', col: '10' }),
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const field = model.records[0].fields[0];

  const longParam = 'A'.repeat(60);
  const newKeywords = [
    { name: 'VALUES', parameters: longParam, conditions: [], raw: '', sourceLines: [] },
    { name: 'COLOR', parameters: 'BLU', conditions: [], raw: '', sourceLines: [] },
  ];
  const newLines = DspfWriter.applyFieldUpdate(field, lines, { keywords: newKeywords });

  check("VALUES' own overlong text wraps across 2 lines via '-' continuation (no blank inserted mid-text - see dspfParser.ts's pendingJoiner doc comment)", newLines.filter((l) => /A{20,}/.test(l)).length === 2 && newLines.some((l) => l.trim().endsWith('-')));
  check('COLOR still gets its own separate line after the wrapped VALUES entry', newLines.some((l) => /COLOR\(BLU\)/.test(l) && !/VALUES|A{20,}/.test(l)));

  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const rfield = reparsed.records[0].fields[0];
  check('VALUES text survives the wrap+reparse intact', rfield.keywords.find((k) => k.name === 'VALUES').parameters.trim() === longParam);
  check('COLOR unaffected by the neighboring wrap', rfield.keywords.find((k) => k.name === 'COLOR').parameters.trim() === 'BLU');
}

console.log('\nConstant fields: the literal + its FIRST keyword may share the content line (same convention named fields already follow), but a SECOND keyword still gets its own new line rather than joining that line too');
{
  const src = [buildLine({ seq: '00010', nameType: 'R', name: 'REC1' })].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  const newField = {
    nameType: 'CONSTANT',
    constantValue: 'Hello',
    location: { line: 1, column: 2 },
    keywords: [
      { name: 'DSPATR', parameters: 'HI', conditions: [], raw: '', sourceLines: [] },
      { name: 'COLOR', parameters: 'BLU', conditions: [], raw: '', sourceLines: [] },
    ],
  };
  const afterInsert = DspfWriter.insertField(model.records[0], lines, newField);
  const nonBlank = afterInsert.filter((l) => l.trim().length > 0);
  check("the literal 'Hello' and its first keyword DSPATR(HI) share the content line", nonBlank.some((l) => /'Hello'/.test(l) && /DSPATR\(HI\)/.test(l)));
  check('the SECOND keyword COLOR(BLU) does NOT join that line - it gets its own', !nonBlank.some((l) => /COLOR\(BLU\)/.test(l) && /'Hello'/.test(l)));
  check('COLOR(BLU) is on its own separate line', nonBlank.some((l) => /COLOR\(BLU\)/.test(l) && !/'Hello'|DSPATR/.test(l)));

  const reparsed = DspfParser.parseDspf(afterInsert.join('\n'));
  const rconst = reparsed.records[0].fields[0];
  check('constant value survives', rconst.constantValue === 'Hello');
  check('DSPATR(HI) survives', rconst.keywords.some((k) => k.name === 'DSPATR' && k.parameters.trim() === 'HI'));
  check('COLOR(BLU) survives', rconst.keywords.some((k) => k.name === 'COLOR' && k.parameters.trim() === 'BLU'));
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

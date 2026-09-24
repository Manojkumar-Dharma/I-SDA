/**
 * recordKeywordsPicker.test.js
 *
 * Direct unit coverage for Task R1's base record keywords picker
 * primitives in dspfWriter.js. Most of R1 reuses Task F1's generic
 * getFileFlagKeyword/setFileFlagKeyword/getFileQuotedText/
 * setFileQuotedText/getFilePrintFileForm as-is
 * (those are generic over any keywords array, not file-level-specific -
 * see fileKeywordsPicker.test.js for that coverage) - this file covers
 * the two shapes that are new for R1: getUnlockKeyword/setUnlockKeyword
 * (UNLOCK's *ERASE/*MDTOFF sub-flags) and getFileTwoFieldKeyword/
 * setFileTwoFieldKeyword (CSRLOC/HLPSEQ's "a b" parameter shape - RTNCSRLOC
 * used to share this shape too, under an incorrect "row/col" labeling;
 * Task L77 gave it its own dedicated getRtncsrlocRecNameFields/
 * getRtncsrlocWindowMouseFields pair once real DDS turned out to need 2
 * independent, richer shapes - see that pair's own coverage below),
 * plus an end-to-end round-trip through applyRecordUpdate +
 * re-parse exercising a representative mix from all 8 categories.
 * Pure Node, no vscode/jsdom needed.
 * Run with: node src/test/recordKeywordsPicker.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));

const { check, failureCount } = require('./helpers/harness');

console.log('getUnlockKeyword / setUnlockKeyword - UNLOCK present/absent plus *ERASE/*MDTOFF sub-flags');
{
  let kw = [];
  check('absent by default', DspfWriter.getUnlockKeyword(kw).present === false);

  kw = DspfWriter.setUnlockKeyword(kw, true, false, false);
  let state = DspfWriter.getUnlockKeyword(kw);
  check('present with no sub-flags', state.present === true && state.erase === false && state.mdtoff === false);
  check('bare UNLOCK has empty parameters', kw[0].parameters === '');

  kw = DspfWriter.setUnlockKeyword(kw, true, true, false);
  state = DspfWriter.getUnlockKeyword(kw);
  check('*ERASE alone round-trips', state.erase === true && state.mdtoff === false);

  kw = DspfWriter.setUnlockKeyword(kw, true, true, true);
  state = DspfWriter.getUnlockKeyword(kw);
  check('both *ERASE and *MDTOFF round-trip', state.erase === true && state.mdtoff === true);
  check('exactly one UNLOCK keyword', kw.filter((k) => k.name === 'UNLOCK').length === 1);

  kw = DspfWriter.setUnlockKeyword(kw, false, false, false);
  check('removed entirely when present=false', DspfWriter.getUnlockKeyword(kw).present === false && kw.length === 0);
}

console.log('\ngetFileTwoFieldKeyword / setFileTwoFieldKeyword - "keyword(a b)" shape (CSRLOC/HLPSEQ)');
{
  let kw = [];
  check('both blank by default', JSON.stringify(DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC')) === JSON.stringify({ a: '', b: '', conditions: [] }));

  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'CSRLOC', 'ROWFLD', 'COLFLD');
  check('parameters are "a b"', kw[0].parameters === 'ROWFLD COLFLD');
  let state = DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC');
  check('round-trips a', state.a === 'ROWFLD');
  check('round-trips b', state.b === 'COLFLD');

  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'CSRLOC', 'ROWFLD', '');
  check('b blank leaves just "a"', kw[0].parameters === 'ROWFLD');
  check('b reads back empty', DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC').b === '');

  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'CSRLOC', '', '');
  check('both blank removes the keyword entirely', kw.length === 0);

  // A second, independent two-field keyword on the same array doesn't collide.
  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'HLPSEQ', 'GRP1', '5');
  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'CSRLOC', 'RFLD', 'CFLD');
  check('HLPSEQ and CSRLOC coexist independently', kw.length === 2);
  check('HLPSEQ reads back', JSON.stringify(DspfWriter.getFileTwoFieldKeyword(kw, 'HLPSEQ')) === JSON.stringify({ a: 'GRP1', b: '5', conditions: [] }));
  check('CSRLOC reads back', JSON.stringify(DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC')) === JSON.stringify({ a: 'RFLD', b: 'CFLD', conditions: [] }));
}

console.log('\ngetFileTwoFieldKeyword / setFileTwoFieldKeyword - Task I-21, CSRLOC conditions preserve-when-omitted');
{
  let kw = [];
  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'CSRLOC', 'ROWFLD', 'COLFLD', [{ relation: 'AND', indicators: [{ number: '40', not: false }], sourceLines: [] }]);
  check('explicit conditions are attached', DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC').conditions.length === 1);
  check("attached indicator is '40'", DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC').conditions[0].indicators[0].number === '40');

  // Editing just the text fields (conditions omitted) must NOT wipe the
  // conditioning already on the keyword - this used to be an unconditional
  // `conditions: []` on every call, the same class of bug setFileFlagKeyword
  // had before its own fix.
  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'CSRLOC', 'ROWFLD2', 'COLFLD');
  check("editing 'a' with conditions omitted preserves the existing conditioning", DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC').conditions.length === 1);
  check("'a' itself still updated", DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC').a === 'ROWFLD2');

  // An explicit [] deliberately clears it.
  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'CSRLOC', 'ROWFLD2', 'COLFLD', []);
  check('an explicit [] clears conditions', DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC').conditions.length === 0);
}

console.log('\ngetRtncsrlocRecNameFields / setRtncsrlocRecNameFields - Task L77, RTNCSRLOC\'s "[*RECNAME] a b [c]" variant');
{
  let kw = [];
  check('absent by default', JSON.stringify(DspfWriter.getRtncsrlocRecNameFields(kw)) === JSON.stringify({ present: false, cursorRecord: '', cursorField: '', cursorPosition: '' }));

  kw = DspfWriter.setRtncsrlocRecNameFields(kw, true, 'CSRREC', 'CSRFLD', 'CSRPOS');
  check('*RECNAME is always written explicitly', kw[0].parameters === '*RECNAME CSRREC CSRFLD CSRPOS');
  let state = DspfWriter.getRtncsrlocRecNameFields(kw);
  check('present reads back true', state.present === true);
  check('cursorRecord round-trips', state.cursorRecord === 'CSRREC');
  check('cursorField round-trips', state.cursorField === 'CSRFLD');
  check('cursorPosition round-trips', state.cursorPosition === 'CSRPOS');

  kw = DspfWriter.setRtncsrlocRecNameFields(kw, true, 'CSRREC', 'CSRFLD', '');
  check('blank trailing cursorPosition drops just that token', kw[0].parameters === '*RECNAME CSRREC CSRFLD');

  // Backward compatibility: a legacy bare instance with no *RECNAME
  // literal at all (e.g. written by this exact codebase before L77) is
  // still recognized as the record/field variant on read.
  const legacy = [{ name: 'RTNCSRLOC', parameters: 'OLDREC OLDFLD', conditions: [], raw: '', sourceLines: [] }];
  check('a legacy bare (no *RECNAME literal) instance still reads as this variant', JSON.stringify(DspfWriter.getRtncsrlocRecNameFields(legacy)) === JSON.stringify({ present: true, cursorRecord: 'OLDREC', cursorField: 'OLDFLD', cursorPosition: '' }));

  kw = DspfWriter.setRtncsrlocRecNameFields(kw, false, '', '', '');
  check('removed entirely when present=false', kw.filter((k) => k.name === 'RTNCSRLOC').length === 0);
}

console.log('\ngetRtncsrlocWindowMouseFields / setRtncsrlocWindowMouseFields - Task L77, RTNCSRLOC\'s "{*WINDOW|*MOUSE} a b [c [d]]" variant');
{
  let kw = [];
  check('absent by default, type defaults to WINDOW', JSON.stringify(DspfWriter.getRtncsrlocWindowMouseFields(kw)) === JSON.stringify({ present: false, type: 'WINDOW', cursorRow: '', cursorColumn: '', cursorRow2: '', cursorColumn2: '' }));

  kw = DspfWriter.setRtncsrlocWindowMouseFields(kw, true, 'WINDOW', 'ROW1', 'COL1', 'ROW2', 'COL2');
  check('parameters are "*WINDOW a b c d"', kw[0].parameters === '*WINDOW ROW1 COL1 ROW2 COL2');
  let state = DspfWriter.getRtncsrlocWindowMouseFields(kw);
  check('type round-trips WINDOW', state.type === 'WINDOW');
  check('cursorRow/cursorColumn/cursorRow2/cursorColumn2 round-trip', state.cursorRow === 'ROW1' && state.cursorColumn === 'COL1' && state.cursorRow2 === 'ROW2' && state.cursorColumn2 === 'COL2');

  kw = DspfWriter.setRtncsrlocWindowMouseFields(kw, true, 'MOUSE', 'ROW1', 'COL1', '', '');
  check('switching type to MOUSE writes *MOUSE', kw[0].parameters === '*MOUSE ROW1 COL1');
  check('type reads back MOUSE', DspfWriter.getRtncsrlocWindowMouseFields(kw).type === 'MOUSE');

  // cursorColumn2 only makes sense once cursorRow2 is set - a column2
  // with no row2 is dropped entirely (real DDS's own nesting).
  kw = DspfWriter.setRtncsrlocWindowMouseFields(kw, true, 'WINDOW', 'ROW1', 'COL1', '', 'COL2');
  check('cursorColumn2 without cursorRow2 is dropped', kw[0].parameters === '*WINDOW ROW1 COL1');

  // Coexists independently with the *RECNAME variant (2 separate keyword
  // instances, same as real DDS allows - see findRtncsrlocInstance's own
  // comment in dspfWriter.js).
  kw = DspfWriter.setRtncsrlocRecNameFields(kw, true, 'CSRREC', 'CSRFLD', '');
  check('*RECNAME and *WINDOW instances coexist', kw.filter((k) => k.name === 'RTNCSRLOC').length === 2);
  check('*WINDOW instance untouched by the *RECNAME write', DspfWriter.getRtncsrlocWindowMouseFields(kw).cursorRow === 'ROW1');
  check('*RECNAME instance untouched either', DspfWriter.getRtncsrlocRecNameFields(kw).cursorRecord === 'CSRREC');

  kw = DspfWriter.setRtncsrlocWindowMouseFields(kw, false, 'WINDOW', '', '', '', '');
  check('removed entirely when present=false, *RECNAME instance survives', kw.length === 1 && kw[0].parameters.startsWith('*RECNAME'));
}

console.log('\nR1 keywords reuse F1\'s generic getFileFlagKeyword/setFileFlagKeyword correctly at record level');
{
  let kw = [];
  kw = DspfWriter.setFileFlagKeyword(kw, 'INZRCD', true);
  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, null, 'AB');
  kw = DspfWriter.setFileFlagKeyword(kw, 'MDTOFF', true, '*UNPR');
  kw = DspfWriter.setFileFlagKeyword(kw, 'PRINT', true, '53');
  check('INZRCD (no-params flag)', DspfWriter.getFileFlagKeyword(kw, 'INZRCD').present === true);
  check('CHECK(AB) fixed-param variant', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present === true);
  check('MDTOFF free-text param (*UNPR)', DspfWriter.getFileFlagKeyword(kw, 'MDTOFF').parameters === '*UNPR');
  check('PRINT response-indicator param', DspfWriter.getFileFlagKeyword(kw, 'PRINT').parameters === '53');

  // I-2 (keywordFixes.md): PRINT's print-file form (shared with F1) -
  // no separate PRTFILE keyword, see getFilePrintFileForm's own comment.
  const prt = DspfWriter.getFilePrintFileForm(DspfWriter.setFileFlagKeyword(kw, 'PRINT', true, 'MYLIB/RPTFILE'));
  check('PRINT print-file form (shared with F1) works unchanged at record level', prt.printFile === 'RPTFILE' && prt.library === 'MYLIB');

  const title = DspfWriter.getFileQuotedText(DspfWriter.setFileQuotedText(kw, 'HLPTITLE', "Order entry - it's live"), 'HLPTITLE');
  check('HLPTITLE (shared with F1) works unchanged at record level', title === "Order entry - it's live");
}

console.log('\ngetFileQuotedTextConditions / setFileQuotedText conditions param - Task I-21, record-level HLPTITLE conditioning');
{
  // Task I-118: DspfWriter.getFileQuotedTextConditions itself (a thin
  // reader with no production caller since I-27 replaced record-level
  // HLPTITLE with the repeatable-instance mechanism) was removed as dead
  // code; the checks below still verify setFileQuotedText's own
  // conditions-preservation behavior (still live/used elsewhere) via this
  // inline reader instead.
  const conditionsOf = (kw, name) => { const k = (kw || []).find((k) => k.name === name); return k ? (k.conditions || []) : []; };
  let kw = [];
  check('no conditions by default', conditionsOf(kw, 'HLPTITLE').length === 0);

  kw = DspfWriter.setFileQuotedText(kw, 'HLPTITLE', 'Sample Screen 1', [{ relation: 'AND', indicators: [{ number: '90', not: false }], sourceLines: [] }]);
  check('explicit conditions are attached', conditionsOf(kw, 'HLPTITLE').length === 1);
  check("attached indicator is '90'", conditionsOf(kw, 'HLPTITLE')[0].indicators[0].number === '90');
  check('text itself round-trips alongside the conditioning', DspfWriter.getFileQuotedText(kw, 'HLPTITLE') === 'Sample Screen 1');

  // Editing just the text (conditions omitted) must NOT wipe the existing
  // conditioning - before this task setFileQuotedText unconditionally
  // rebuilt the keyword with `conditions: []` on every call, the same
  // class of bug setFileFlagKeyword had before its own fix.
  kw = DspfWriter.setFileQuotedText(kw, 'HLPTITLE', 'Sample Screen 1 revised');
  check('editing text with conditions omitted preserves the existing conditioning', conditionsOf(kw, 'HLPTITLE').length === 1);
  check('text itself still updated', DspfWriter.getFileQuotedText(kw, 'HLPTITLE') === 'Sample Screen 1 revised');

  // An explicit [] deliberately clears it.
  kw = DspfWriter.setFileQuotedText(kw, 'HLPTITLE', 'Sample Screen 1 revised', []);
  check('an explicit [] clears conditions', conditionsOf(kw, 'HLPTITLE').length === 0);
}

console.log('\napplyRecordUpdate() - a batch of R1 picker keywords (one per category) round-trips through serialize + re-parse');
{
  const src =
    [
      '     A                                      DSPSIZ(24 80)',
      '     A          R MAINREC',
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records[0];

  let kw = rec.keywords;
  kw = DspfWriter.setFileFlagKeyword(kw, 'KEEP', true);                          // General
  kw = DspfWriter.setFileFlagKeyword(kw, 'CLEAR', true, '30');                   // Indicator
  kw = DspfWriter.setFileFlagKeyword(kw, 'HLPBDY', true);                        // Application help
  kw = DspfWriter.setFileQuotedText(kw, 'HLPTITLE', 'Main Menu');                // Help
  kw = DspfWriter.setFileFlagKeyword(kw, 'BLINK', true);                         // Output
  kw = DspfWriter.setUnlockKeyword(kw, true, true, false);                       // Input
  kw = DspfWriter.setFileFlagKeyword(kw, 'OVERLAY', true);                       // Overlay
  kw = DspfWriter.setFileFlagKeyword(kw, 'PRINT', true, 'MYLIB/RPTFILE');        // Print (I-2: PRINT's own print-file form)

  const newLines = DspfWriter.applyRecordUpdate(rec, lines, { keywords: kw });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const reRec = reparsed.records[0];

  check('KEEP reads back present after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'KEEP').present === true);
  check('CLEAR(30) reads back after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'CLEAR').parameters === '30');
  check('HLPBDY reads back present after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'HLPBDY').present === true);
  check('HLPTITLE text reads back after reparse', DspfWriter.getFileQuotedText(reRec.keywords, 'HLPTITLE') === 'Main Menu');
  check('BLINK reads back present after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'BLINK').present === true);
  const unlock = DspfWriter.getUnlockKeyword(reRec.keywords);
  check('UNLOCK(*ERASE) reads back after reparse', unlock.present === true && unlock.erase === true && unlock.mdtoff === false);
  check('OVERLAY reads back present after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'OVERLAY').present === true);
  const prt = DspfWriter.getFilePrintFileForm(reRec.keywords);
  check('PRINT print-file form reads back after reparse (I-2)', prt.printFile === 'RPTFILE' && prt.library === 'MYLIB');
  check('the file-level DSPSIZ is untouched by the record-keyword edit', DspfWriter.getDisplaySizesList(reparsed.fileKeywords).length === 1);
  check('the record\'s own field is untouched', reRec.fields.length === 1 && reRec.fields[0].nameType === 'CONSTANT');
}

console.log('\nMNUBARDSP\'s 3-field form (Task L76) round-trips through serialize + re-parse');
{
  const src =
    [
      '     A                                      DSPSIZ(24 80)',
      '     A          R APPSCR',
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records[0];

  // Task I-118: setMnubardspFields/getMnubardspFields themselves were
  // removed as dead code (no production caller since I-17 replaced
  // MNUBARDSP handling with the repeatable-instance mechanism) - this
  // still round-trips the real DDS text via a directly-constructed keyword.
  let kw = rec.keywords.filter((k) => k.name !== 'MNUBARDSP').concat([{ name: 'MNUBARDSP', parameters: 'MENUBAR MNUCHC PULL', conditions: [], raw: '', sourceLines: [] }]);
  const newLines = DspfWriter.applyRecordUpdate(rec, lines, { keywords: kw });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const reRec = reparsed.records[0];

  check('MNUBARDSP present after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'MNUBARDSP').present === true);
  const mnubardspKw = reRec.keywords.find((k) => k.name === 'MNUBARDSP');
  const fields = mnubardspKw ? (mnubardspKw.parameters || '').trim().split(/\s+/).filter(Boolean) : [];
  check('menuBarRecord reads back after reparse', fields[0] === 'MENUBAR');
  check('choiceField reads back after reparse', fields[1] === 'MNUCHC');
  check('pullDownField reads back after reparse', fields[2] === 'PULL');
}

console.log('\nRTNCSRLOC\'s two independent variants (Task L77) both round-trip through serialize + re-parse, coexisting on one record');
{
  const src =
    [
      '     A                                      DSPSIZ(24 80)',
      '     A          R APPSCR',
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records[0];

  let kw = DspfWriter.setRtncsrlocRecNameFields(rec.keywords, true, 'CSRREC', 'CSRFLD', 'CSRPOS');
  kw = DspfWriter.setRtncsrlocWindowMouseFields(kw, true, 'MOUSE', 'ROW1', 'COL1', 'ROW2', 'COL2');
  const newLines = DspfWriter.applyRecordUpdate(rec, lines, { keywords: kw });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const reRec = reparsed.records[0];

  check('exactly 2 RTNCSRLOC instances survive reparse', reRec.keywords.filter((k) => k.name === 'RTNCSRLOC').length === 2);
  const recNameState = DspfWriter.getRtncsrlocRecNameFields(reRec.keywords);
  check('*RECNAME variant reads back after reparse', recNameState.present === true && recNameState.cursorRecord === 'CSRREC' && recNameState.cursorField === 'CSRFLD' && recNameState.cursorPosition === 'CSRPOS');
  const wmState = DspfWriter.getRtncsrlocWindowMouseFields(reRec.keywords);
  check('*MOUSE variant reads back after reparse', wmState.present === true && wmState.type === 'MOUSE' && wmState.cursorRow === 'ROW1' && wmState.cursorColumn === 'COL1' && wmState.cursorRow2 === 'ROW2' && wmState.cursorColumn2 === 'COL2');
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

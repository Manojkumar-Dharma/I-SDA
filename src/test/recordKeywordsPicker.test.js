/**
 * recordKeywordsPicker.test.js
 *
 * Direct unit coverage for Task R1's base record keywords picker
 * primitives in dspfWriter.js. Most of R1 reuses Task F1's generic
 * getFileFlagKeyword/setFileFlagKeyword/getFileQuotedText/
 * setFileQuotedText/getFilePrtFileKeyword/setFilePrtFileKeyword as-is
 * (those are generic over any keywords array, not file-level-specific -
 * see fileKeywordsPicker.test.js for that coverage) - this file covers
 * the two shapes that are new for R1: getUnlockKeyword/setUnlockKeyword
 * (UNLOCK's *ERASE/*MDTOFF sub-flags) and getFileTwoFieldKeyword/
 * setFileTwoFieldKeyword (CSRLOC/RTNCSRLOC/HLPSEQ's "a b" parameter
 * shape), plus an end-to-end round-trip through applyRecordUpdate +
 * re-parse exercising a representative mix from all 8 categories.
 * Pure Node, no vscode/jsdom needed.
 * Run with: node src/test/recordKeywordsPicker.test.js
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

console.log('\ngetFileTwoFieldKeyword / setFileTwoFieldKeyword - "keyword(a b)" shape (CSRLOC/RTNCSRLOC/HLPSEQ)');
{
  let kw = [];
  check('both blank by default', JSON.stringify(DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC')) === JSON.stringify({ a: '', b: '' }));

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
  kw = DspfWriter.setFileTwoFieldKeyword(kw, 'RTNCSRLOC', 'RFLD', 'CFLD');
  check('HLPSEQ and RTNCSRLOC coexist independently', kw.length === 2);
  check('HLPSEQ reads back', JSON.stringify(DspfWriter.getFileTwoFieldKeyword(kw, 'HLPSEQ')) === JSON.stringify({ a: 'GRP1', b: '5' }));
  check('RTNCSRLOC reads back', JSON.stringify(DspfWriter.getFileTwoFieldKeyword(kw, 'RTNCSRLOC')) === JSON.stringify({ a: 'RFLD', b: 'CFLD' }));
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

  const prt = DspfWriter.getFilePrtFileKeyword(DspfWriter.setFilePrtFileKeyword(kw, 'RPTFILE', 'MYLIB'));
  check('PRTFILE (shared with F1) works unchanged at record level', prt.name === 'RPTFILE' && prt.library === 'MYLIB');

  const title = DspfWriter.getFileQuotedText(DspfWriter.setFileQuotedText(kw, 'HLPTITLE', "Order entry - it's live"), 'HLPTITLE');
  check('HLPTITLE (shared with F1) works unchanged at record level', title === "Order entry - it's live");
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
  kw = DspfWriter.setFilePrtFileKeyword(kw, 'RPTFILE', 'MYLIB');                 // Print

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
  const prt = DspfWriter.getFilePrtFileKeyword(reRec.keywords);
  check('PRTFILE reads back after reparse', prt.name === 'RPTFILE' && prt.library === 'MYLIB');
  check('the file-level DSPSIZ is untouched by the record-keyword edit', DspfWriter.getDisplaySizesList(reparsed.fileKeywords).length === 1);
  check('the record\'s own field is untouched', reRec.fields.length === 1 && reRec.fields[0].nameType === 'CONSTANT');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

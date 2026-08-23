/**
 * fileKeywordsPicker.test.js
 *
 * Direct unit coverage for Task F1's file-level keyword picker primitives
 * in dspfWriter.js (getFileFlagKeyword/setFileFlagKeyword, getFileQuotedText/
 * setFileQuotedText, getFileRefKeyword/setFileRefKeyword,
 * getFilePrtFileKeyword/setFilePrtFileKeyword, getWdwBorder/setWdwBorder,
 * getDisplaySizesList/setDisplaySizesList). Pure Node, no vscode/jsdom
 * needed - these are all plain keywords[] -> keywords[] transforms, the
 * same shape as the existing Color & attributes / Validity check pickers.
 * Run with: node src/test/fileKeywordsPicker.test.js
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

console.log('getFileFlagKeyword / setFileFlagKeyword - simple boolean keyword, no parameters');
{
  let kw = [];
  check('absent by default', DspfWriter.getFileFlagKeyword(kw, 'INDARA').present === false);

  kw = DspfWriter.setFileFlagKeyword(kw, 'INDARA', true);
  check('present after set', DspfWriter.getFileFlagKeyword(kw, 'INDARA').present === true);
  check('exactly one keyword added', kw.length === 1 && kw[0].name === 'INDARA');

  kw = DspfWriter.setFileFlagKeyword(kw, 'INDARA', false);
  check('removed after unset', DspfWriter.getFileFlagKeyword(kw, 'INDARA').present === false);
  check('keywords array empty again', kw.length === 0);
}

console.log('\ngetFileFlagKeyword / setFileFlagKeyword - keyword with free-text parameters');
{
  let kw = DspfWriter.setFileFlagKeyword([], 'CHGINPDFT', true, 'UL');
  const state = DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT');
  check('present with parameters preserved', state.present === true && state.parameters === 'UL');

  kw = DspfWriter.setFileFlagKeyword(kw, 'CHGINPDFT', false);
  check('removed regardless of parameters', DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT').present === false);
}

console.log('\ngetFileFlagKeyword / setFileFlagKeyword - fixedParam variants share one NAME independently (CHECK)');
{
  let kw = [];
  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, null, 'AB');
  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, null, 'RL');
  check('both variants present', kw.length === 2);
  check('AB variant reads back present', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present === true);
  check('RL variant reads back present', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present === true);
  check('RLTB variant reads back absent (never set)', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RLTB').present === false);

  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', false, null, 'AB');
  check('removing AB leaves RL untouched', kw.length === 1 && DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present === true);
  check('AB is gone', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present === false);
}

console.log('\ngetFileQuotedText / setFileQuotedText - HLPTITLE');
{
  let kw = DspfWriter.setFileQuotedText([], 'HLPTITLE', "Help - it's here");
  check('quote embedded in text is doubled', kw[0].parameters === "'Help - it''s here'");
  check('round-trips back to plain text', DspfWriter.getFileQuotedText(kw, 'HLPTITLE') === "Help - it's here");

  kw = DspfWriter.setFileQuotedText(kw, 'HLPTITLE', '');
  check('blank text removes the keyword', kw.length === 0);
}

console.log('\ngetFileRefKeyword / setFileRefKeyword - REF(library/record)');
{
  let kw = DspfWriter.setFileRefKeyword([], 'MYLIB', 'CUSTMAST');
  check('parameters formatted as library/record', kw[0].parameters === 'MYLIB/CUSTMAST');
  let state = DspfWriter.getFileRefKeyword(kw);
  check('round-trips library', state.library === 'MYLIB');
  check('round-trips record', state.record === 'CUSTMAST');

  kw = DspfWriter.setFileRefKeyword([], '', 'CUSTMAST');
  check('no library qualifier when library blank', kw[0].parameters === 'CUSTMAST');
  state = DspfWriter.getFileRefKeyword(kw);
  check('library reads back empty', state.library === '');
  check('record still reads back', state.record === 'CUSTMAST');

  kw = DspfWriter.setFileRefKeyword(kw, 'MYLIB', '');
  check('blank record removes REF entirely', kw.length === 0);
}

console.log('\ngetFilePrtFileKeyword / setFilePrtFileKeyword - PRTFILE(name library)');
{
  let kw = DspfWriter.setFilePrtFileKeyword([], 'QSYSPRT', 'QGPL');
  check('parameters are "name library"', kw[0].parameters === 'QSYSPRT QGPL');
  const state = DspfWriter.getFilePrtFileKeyword(kw);
  check('round-trips name', state.name === 'QSYSPRT');
  check('round-trips library', state.library === 'QGPL');

  kw = DspfWriter.setFilePrtFileKeyword([], 'QSYSPRT', '');
  check('no library token when library blank', kw[0].parameters === 'QSYSPRT');
}

console.log('\ngetWdwBorder / setWdwBorder - WDWBORDER color/attrs/chars sub-groups');
{
  let kw = DspfWriter.setWdwBorder([], {
    colorEnabled: true,
    color: 'BLU',
    attrsEnabled: true,
    attrs: ['HI', 'UL'],
    charsEnabled: true,
    chars: ['.', '-', '.', '|', '|', '.', '-', '.'],
  });
  check('exactly one WDWBORDER keyword written', kw.length === 1 && kw[0].name === 'WDWBORDER');

  const state = DspfWriter.getWdwBorder(kw);
  check('color round-trips', state.color === 'BLU');
  check('attrs round-trip', state.attrs.length === 2 && state.attrs[0] === 'HI' && state.attrs[1] === 'UL');
  check('all 8 border chars round-trip in order', state.chars.join('') === '.-.||.-.');

  // Only the enabled sub-groups are written.
  const colorOnly = DspfWriter.setWdwBorder([], { colorEnabled: true, color: 'RED', attrsEnabled: false, charsEnabled: false });
  check('color-only keyword text has no *DSPATR or *CHAR group', colorOnly[0].parameters.indexOf('*DSPATR') === -1 && colorOnly[0].parameters.indexOf('*CHAR') === -1);

  const none = DspfWriter.setWdwBorder([{ name: 'WDWBORDER', parameters: '(*COLOR RED)' }], { colorEnabled: false, attrsEnabled: false, charsEnabled: false });
  check('disabling every sub-group removes WDWBORDER entirely', none.length === 0);
}

console.log('\ngetDisplaySizesList / setDisplaySizesList - DSPSIZ full replace');
{
  let kw = DspfWriter.setDisplaySizesList([], [{ lines: 24, columns: 80, name: '*DS3' }, { lines: 27, columns: 132, name: '*DS4' }]);
  check('exactly one DSPSIZ keyword written', kw.length === 1 && kw[0].name === 'DSPSIZ');

  let list = DspfWriter.getDisplaySizesList(kw);
  check('two sizes round-trip in order', list.length === 2 && list[0].name === '*DS3' && list[1].name === '*DS4');
  check('lines/columns round-trip', list[0].lines === 24 && list[0].columns === 80);

  // Order is caller-controlled - passing DS4 first should write it first.
  kw = DspfWriter.setDisplaySizesList([], [{ lines: 27, columns: 132, name: '*DS4' }, { lines: 24, columns: 80, name: '*DS3' }]);
  list = DspfWriter.getDisplaySizesList(kw);
  check('caller-supplied order is preserved', list[0].name === '*DS4' && list[1].name === '*DS3');

  kw = DspfWriter.setDisplaySizesList(kw, []);
  check('empty list removes DSPSIZ entirely', kw.length === 0);

  let threw = false;
  try {
    DspfWriter.setDisplaySizesList([], [{ lines: 24, columns: 80, name: '*DS1' }, { lines: 27, columns: 132, name: '*DS2' }, { lines: 24, columns: 80, name: '*DS3' }]);
  } catch (e) {
    threw = true;
  }
  check('rejects more than two sizes (DDS limit)', threw);
}

console.log('\napplyFileKeywordsUpdate() - a batch of F1 picker keywords round-trips through serialize + re-parse');
{
  const src =
    [
      '     A                                      DSPSIZ(24 80)',
      '     A          R MAINREC',
      "     A                                  1  2'Hello'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);

  let kw = model.fileKeywords;
  kw = DspfWriter.setFileFlagKeyword(kw, 'INDARA', true);
  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, null, 'AB');
  kw = DspfWriter.setFileRefKeyword(kw, 'MYLIB', 'CUSTMAST');
  kw = DspfWriter.setFileQuotedText(kw, 'HLPTITLE', "Order entry - it's live");
  kw = DspfWriter.setWdwBorder(kw, { colorEnabled: true, color: 'BLU', attrsEnabled: true, attrs: ['HI'], charsEnabled: false });
  kw = DspfWriter.setDisplaySizesList(kw, [{ lines: 24, columns: 80, name: '*DS3' }, { lines: 27, columns: 132, name: '*DS4' }]);

  const newLines = DspfWriter.applyFileKeywordsUpdate(model, lines, kw);
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));

  check('INDARA reads back present after reparse', DspfWriter.getFileFlagKeyword(reparsed.fileKeywords, 'INDARA').present === true);
  check('CHECK(AB) reads back present after reparse', DspfWriter.getFileFlagKeyword(reparsed.fileKeywords, 'CHECK', 'AB').present === true);
  const refState = DspfWriter.getFileRefKeyword(reparsed.fileKeywords);
  check('REF reads back after reparse', refState.library === 'MYLIB' && refState.record === 'CUSTMAST');
  check('HLPTITLE text (with escaped quote) reads back after reparse', DspfWriter.getFileQuotedText(reparsed.fileKeywords, 'HLPTITLE') === "Order entry - it's live");
  const wb = DspfWriter.getWdwBorder(reparsed.fileKeywords);
  check('WDWBORDER color/attrs read back after reparse', wb.color === 'BLU' && wb.attrs.indexOf('HI') >= 0);
  const sizes = DspfWriter.getDisplaySizesList(reparsed.fileKeywords);
  check('DSPSIZ sizes/order read back after reparse', sizes.length === 2 && sizes[0].name === '*DS3' && sizes[1].name === '*DS4');
  check('the record and its field are untouched by the file-keyword edit', reparsed.records.length === 1 && reparsed.records[0].fields.length === 1);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

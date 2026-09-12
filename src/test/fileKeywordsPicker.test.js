/**
 * fileKeywordsPicker.test.js
 *
 * Direct unit coverage for Task F1's file-level keyword picker primitives
 * in dspfWriter.js (getFileFlagKeyword/setFileFlagKeyword, getFileQuotedText/
 * setFileQuotedText, getFileRefKeyword/setFileRefKeyword,
 * getFilePrintFileForm (I-2 fix, see keywordFixes.md), getWdwBorder/setWdwBorder,
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

console.log('\nS36-2: USRDSPMGT - already covered by the generic flag-keyword mechanism, confirmed rather than rebuilt');
{
  // USRDSPMGT is a bare, parameterless flag exactly like INDARA above - the
  // General panel's existing 'fk-usrdspmgt' row (fileKeywordsPanelsHtml/
  // wireFileKeywordsPanels in webviewClientHelpers.js, labeled "Manage
  // display in S/36 mode") already renders and wires it through
  // getFileFlagKeyword/setFileFlagKeyword with no keyword-specific code of
  // its own - confirmed here rather than duplicated, per this task's own
  // "check before building anything new" instruction. S36-3's rule engine
  // reads this same present/absent state to decide whether the 6
  // S36E-restricted keywords' constraints are active.
  let kw = [];
  check('absent by default', DspfWriter.getFileFlagKeyword(kw, 'USRDSPMGT').present === false);

  kw = DspfWriter.setFileFlagKeyword(kw, 'USRDSPMGT', true);
  check('present after set', DspfWriter.getFileFlagKeyword(kw, 'USRDSPMGT').present === true);
  check('exactly one keyword added, no parameters', kw.length === 1 && kw[0].name === 'USRDSPMGT' && kw[0].parameters === '');

  kw = DspfWriter.setFileFlagKeyword(kw, 'USRDSPMGT', false);
  check('removed after unset', DspfWriter.getFileFlagKeyword(kw, 'USRDSPMGT').present === false);
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

console.log('\ngetFileRefKeyword / setFileRefKeyword - the record-format-name sub-parameter (Task I-4)');
{
  // IBM's documented format is [library-name/]database-file-name
  // [record-format-name] - a third, optional, space-separated part used
  // when the referenced file has more than one record format.
  let kw = DspfWriter.setFileRefKeyword([], 'MYLIB', 'CUSTMAST', 'CUSTREC2');
  check('parameters formatted as library/record recordFormat', kw[0].parameters === 'MYLIB/CUSTMAST CUSTREC2');
  let state = DspfWriter.getFileRefKeyword(kw);
  check('round-trips library', state.library === 'MYLIB');
  check('round-trips record', state.record === 'CUSTMAST');
  check('round-trips recordFormat', state.recordFormat === 'CUSTREC2');

  kw = DspfWriter.setFileRefKeyword([], '', 'CUSTMAST', 'CUSTREC2');
  check('no library qualifier, recordFormat still written', kw[0].parameters === 'CUSTMAST CUSTREC2');
  state = DspfWriter.getFileRefKeyword(kw);
  check('recordFormat round-trips with no library', state.recordFormat === 'CUSTREC2');

  kw = DspfWriter.setFileRefKeyword([], 'MYLIB', 'CUSTMAST');
  check('omitting recordFormat writes exactly as before (2-arg callers unaffected)', kw[0].parameters === 'MYLIB/CUSTMAST');
  check('recordFormat reads back blank when not set', DspfWriter.getFileRefKeyword(kw).recordFormat === '');
}

console.log('\ngetFileHlpPnlGrpKeyword / setFileHlpPnlGrpKeyword - HLPPNLGRP(module [library/]panelgroup), Task I-4');
{
  // Confirmed order per IBM's DDS Reference: help-module-name comes
  // FIRST, then the (optionally library-qualified) panel-group-name -
  // the old picker's placeholder hint had this backwards.
  let kw = DspfWriter.setFileHlpPnlGrpKeyword([], 'GENERAL', 'LIBA', 'PANEL1');
  check('parameters formatted as module library/panelgroup', kw[0].parameters === 'GENERAL LIBA/PANEL1');
  let state = DspfWriter.getFileHlpPnlGrpKeyword(kw);
  check('round-trips moduleName', state.moduleName === 'GENERAL');
  check('round-trips library', state.library === 'LIBA');
  check('round-trips panelGroup', state.panelGroup === 'PANEL1');

  kw = DspfWriter.setFileHlpPnlGrpKeyword([], 'GENERAL', '', 'PANEL1');
  check('no library qualifier when library blank', kw[0].parameters === 'GENERAL PANEL1');
  state = DspfWriter.getFileHlpPnlGrpKeyword(kw);
  check('library reads back empty', state.library === '');
  check('panelGroup still reads back', state.panelGroup === 'PANEL1');

  kw = DspfWriter.setFileHlpPnlGrpKeyword([], 'GENERAL', 'LIBA', '');
  check('blank panelGroup drops the keyword entirely (both moduleName and panelGroup are required)', kw.length === 0);
  kw = DspfWriter.setFileHlpPnlGrpKeyword([], '', 'LIBA', 'PANEL1');
  check('blank moduleName drops the keyword entirely', kw.length === 0);
}

console.log('\ngetFileHlpSchIdxKeyword / setFileHlpSchIdxKeyword - HLPSCHIDX([library/]searchindex), Task I-4');
{
  let kw = DspfWriter.setFileHlpSchIdxKeyword([], 'LIBA', 'SEARCH1');
  check('parameters formatted as library/searchindex', kw[0].parameters === 'LIBA/SEARCH1');
  let state = DspfWriter.getFileHlpSchIdxKeyword(kw);
  check('round-trips library', state.library === 'LIBA');
  check('round-trips searchIndex', state.searchIndex === 'SEARCH1');

  kw = DspfWriter.setFileHlpSchIdxKeyword([], '', 'SEARCH1');
  check('no library qualifier when library blank', kw[0].parameters === 'SEARCH1');
  state = DspfWriter.getFileHlpSchIdxKeyword(kw);
  check('library reads back empty', state.library === '');
  check('searchIndex still reads back', state.searchIndex === 'SEARCH1');

  kw = DspfWriter.setFileHlpSchIdxKeyword([], 'LIBA', '');
  check('blank searchIndex removes HLPSCHIDX entirely', kw.length === 0);
}

console.log('\nMNUBARSW/MNUCNL via setFileFlagKeyword - confirming the fixed (valid DDS) shapes, Task I-4');
{
  // Confirmed against IBM's DDS Reference: MNUBARSW[(CAnn)] takes only
  // ONE optional parameter; MNUCNL[(CAnn [response-indicator])] takes the
  // CA key plus an OPTIONAL response indicator. Neither has a leading
  // "indicator" parameter - a previous version of the picker wrote one,
  // producing invalid DDS (see keywordFixes.md's I-4 writeup).
  let kw = DspfWriter.setFileFlagKeyword([], 'MNUBARSW', true, 'CA10');
  check('MNUBARSW writes just the CA key', kw.find((k) => k.name === 'MNUBARSW').parameters === 'CA10');

  kw = DspfWriter.setFileFlagKeyword([], 'MNUCNL', true, 'CA12 90');
  check('MNUCNL writes CA key + response indicator', kw.find((k) => k.name === 'MNUCNL').parameters === 'CA12 90');

  kw = DspfWriter.setFileFlagKeyword([], 'MNUCNL', true, 'CA12');
  check('MNUCNL writes just the CA key when no response indicator is given', kw.find((k) => k.name === 'MNUCNL').parameters === 'CA12');
}

console.log('\ngetFilePrintFileForm - PRINT(*PGM) / PRINT([library/]printer-file-name), I-2 fix');
{
  // I-2 (keywordFixes.md): PRTFILE is not a real DDS keyword - the
  // printer-file name is PRINT's own third parameter form. These write
  // through the existing generic setFileFlagKeyword('PRINT', ...), same
  // as the response-indicator/blank forms, and getFilePrintFileForm reads
  // the *PGM/[library/]printer-file-name sub-forms back out.
  let kw = DspfWriter.setFileFlagKeyword([], 'PRINT', true, 'QGPL/QSYSPRT');
  check('parameters formatted as library/name (DDS REF-style, not space-joined)', kw[0].parameters === 'QGPL/QSYSPRT');
  let state = DspfWriter.getFilePrintFileForm(kw);
  check('round-trips print file name', state.printFile === 'QSYSPRT');
  check('round-trips library', state.library === 'QGPL');
  check('not read as *PGM', state.isPgm === false);

  kw = DspfWriter.setFileFlagKeyword([], 'PRINT', true, 'QSYSPRT');
  state = DspfWriter.getFilePrintFileForm(kw);
  check('no library qualifier when library blank', state.printFile === 'QSYSPRT' && state.library === '');

  kw = DspfWriter.setFileFlagKeyword([], 'PRINT', true, '*PGM');
  state = DspfWriter.getFilePrintFileForm(kw);
  check('*PGM read back as isPgm, not as a literal print file name', state.isPgm === true && state.printFile === '');

  kw = DspfWriter.setFileFlagKeyword([], 'PRINT', true, '53');
  state = DspfWriter.getFilePrintFileForm(kw);
  check('a response-indicator PRINT is not misread as a print-file form', state.printFile === '' && state.isPgm === false);

  state = DspfWriter.getFilePrintFileForm([]);
  check('absent PRINT keyword reads back as all-blank', state.printFile === '' && state.library === '' && state.isPgm === false);
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

  // Bug fix (reported: "no border color" - iSDA showed a window with no
  // border at all, real SDA showed a solid blue box): real-world DDS
  // commonly writes *CHAR as ONE combined character-string value rather
  // than 8 separate quoted literals (this file's own setWdwBorder above
  // only ever emits the latter, which is why this case was never
  // exercised until now) - getWdwBorder must still read it correctly.
  const realWorldSingleQuote = [{ name: 'WDWBORDER', parameters: "(*COLOR BLU) (*DSPATR RI) (*CHAR '        ')" }];
  const readBack = DspfWriter.getWdwBorder(realWorldSingleQuote);
  check('a single combined 8-blank-character string reads as 8 individual blank positions, not one 8-char blob in position 0', readBack.chars.every((c) => c === ' '));
  check('color still reads correctly alongside it', readBack.color === 'BLU');

  const realWorldMixed = [{ name: 'WDWBORDER', parameters: "(*CHAR '12345678')" }];
  check('a single combined non-blank 8-character string splits across the 8 positions in order, same as 8 separate quotes would', DspfWriter.getWdwBorder(realWorldMixed).chars.join('') === '12345678');
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

  // Bug fix: DSPSIZ's OTHER valid form is bare condition names with no
  // lines/cols at all - DSPSIZ(*DSw [*DSx]) - which *DS3/*DS4 always
  // resolve to a fixed 24x80/27x132 respectively. getDisplaySizesList
  // previously only reached this via a raw DSPSIZ keyword's parameters
  // text (it never round-trips through setDisplaySizesList, which always
  // writes explicit lines/cols), so exercise it directly.
  const bareBoth = DspfWriter.getDisplaySizesList([{ name: 'DSPSIZ', parameters: '*DS3 *DS4' }]);
  check('bare "*DS3 *DS4" resolves to two sizes, not one', bareBoth.length === 2);
  check('bare *DS3 resolves to 24x80', bareBoth[0].name === '*DS3' && bareBoth[0].lines === 24 && bareBoth[0].columns === 80);
  check('bare *DS4 resolves to 27x132', bareBoth[1].name === '*DS4' && bareBoth[1].lines === 27 && bareBoth[1].columns === 132);

  const bareReversed = DspfWriter.getDisplaySizesList([{ name: 'DSPSIZ', parameters: '*DS4 *DS3' }]);
  check('bare "*DS4 *DS3" preserves declaration order (DS4 primary)', bareReversed.length === 2 && bareReversed[0].name === '*DS4' && bareReversed[1].name === '*DS3');

  const bareSingle = DspfWriter.getDisplaySizesList([{ name: 'DSPSIZ', parameters: '*DS3' }]);
  check('bare single "*DS3" resolves to one 24x80 size', bareSingle.length === 1 && bareSingle[0].name === '*DS3' && bareSingle[0].lines === 24 && bareSingle[0].columns === 80);
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
  kw = DspfWriter.setFileFlagKeyword(kw, 'USRDSPMGT', true); // S36-2
  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, null, 'AB');
  kw = DspfWriter.setFileRefKeyword(kw, 'MYLIB', 'CUSTMAST');
  kw = DspfWriter.setFileQuotedText(kw, 'HLPTITLE', "Order entry - it's live");
  kw = DspfWriter.setWdwBorder(kw, { colorEnabled: true, color: 'BLU', attrsEnabled: true, attrs: ['HI'], charsEnabled: false });
  kw = DspfWriter.setDisplaySizesList(kw, [{ lines: 24, columns: 80, name: '*DS3' }, { lines: 27, columns: 132, name: '*DS4' }]);

  const newLines = DspfWriter.applyFileKeywordsUpdate(model, lines, kw);
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));

  check('INDARA reads back present after reparse', DspfWriter.getFileFlagKeyword(reparsed.fileKeywords, 'INDARA').present === true);
  check('USRDSPMGT reads back present after reparse (S36-2)', DspfWriter.getFileFlagKeyword(reparsed.fileKeywords, 'USRDSPMGT').present === true);
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

// ===========================================================================
// Task L22 remaining item - ROLLUP/ROLLDOWN are legacy alternate spellings
// of PAGEDOWN/PAGEUP (real SDA's own "Define Indicator Keywords" screen
// lists them together as "PAGEDOWN/ROLLUP" and "PAGEUP/ROLLDOWN" - the same
// keyword under two names, not two different keywords). getFileFlagKeyword/
// setFileFlagKeyword's new `altNames` parameter is what the file-level
// Indicator Keywords panel now passes for these two rows.
// ===========================================================================

console.log('\ngetFileFlagKeyword - altNames makes a legacy ROLLUP instance read back as PAGEDOWN\'s own state');
{
  const kw = [{ name: 'ROLLUP', parameters: '25', conditions: [], raw: '', sourceLines: [] }];
  const noAlt = DspfWriter.getFileFlagKeyword(kw, 'PAGEDOWN');
  check('without altNames, a legacy spelling is invisible (pre-fix behavior, still correct without the param)', noAlt.present === false);
  const withAlt = DspfWriter.getFileFlagKeyword(kw, 'PAGEDOWN', undefined, ['ROLLUP']);
  check('with altNames, the legacy instance is found', withAlt.present === true);
  check('its parameters carry over', withAlt.parameters === '25');
}

console.log('\ngetFileFlagKeyword - altNames makes a legacy ROLLDOWN instance read back as PAGEUP\'s own state');
{
  const kw = [{ name: 'ROLLDOWN', parameters: '26', conditions: [], raw: '', sourceLines: [] }];
  const state = DspfWriter.getFileFlagKeyword(kw, 'PAGEUP', undefined, ['ROLLDOWN']);
  check('legacy ROLLDOWN instance found as PAGEUP', state.present === true && state.parameters === '26');
}

console.log('\nsetFileFlagKeyword - editing a legacy ROLLUP instance (still present=true) normalizes it to PAGEDOWN, not left as ROLLUP');
{
  let kw = [{ name: 'ROLLUP', parameters: '25', conditions: [], raw: '', sourceLines: [] }];
  kw = DspfWriter.setFileFlagKeyword(kw, 'PAGEDOWN', true, '30', undefined, undefined, ['ROLLUP']);
  check('written back as canonical PAGEDOWN', kw.length === 1 && kw[0].name === 'PAGEDOWN');
  check('no stray ROLLUP left behind', !kw.some((k) => k.name === 'ROLLUP'));
  check('the edited indicator was kept', kw[0].parameters === '30');
}

console.log('\nsetFileFlagKeyword - unchecking a legacy ROLLUP instance actually removes it, not just hides it behind an unchecked box');
{
  let kw = [
    { name: 'ROLLUP', parameters: '25', conditions: [], raw: '', sourceLines: [] },
    { name: 'COLOR', parameters: 'RED', conditions: [], raw: '', sourceLines: [] },
  ];
  kw = DspfWriter.setFileFlagKeyword(kw, 'PAGEDOWN', false, '', undefined, undefined, ['ROLLUP']);
  check('ROLLUP is gone, not an orphan the checkbox can no longer see', !kw.some((k) => k.name === 'ROLLUP' || k.name === 'PAGEDOWN'));
  check('unrelated COLOR keyword untouched', kw.some((k) => k.name === 'COLOR'));
}

console.log('\ngetFileFlagKeyword/setFileFlagKeyword - a real PAGEDOWN instance still works exactly as before when altNames is passed (no regression for the common case)');
{
  let kw = [{ name: 'PAGEDOWN', parameters: '25', conditions: [], raw: '', sourceLines: [] }];
  check('reads present with altNames given', DspfWriter.getFileFlagKeyword(kw, 'PAGEDOWN', undefined, ['ROLLUP']).present === true);
  kw = DspfWriter.setFileFlagKeyword(kw, 'PAGEDOWN', false, '', undefined, undefined, ['ROLLUP']);
  check('removed as before', kw.length === 0);
}

// ===========================================================================
// Task I-5 - 5 confirmed-missing file-level keywords from
// docs/sda-reference/keywordFixes.md. ROLLUP/ROLLDOWN (already covered by
// the altNames tests above) turned out to already be correctly implemented
// - no change needed there. The remaining 4 (HLPRCD, MOUBTN, VALNUM,
// WRDWRAP) are new. HLPRCD and MOUBTN have no dedicated dspfWriter.js
// get/set of their own (same "reuse the generic primitive, parse/compose
// client-side" choice MNUBARSW/MNUCNL and RANGE/COMP/VALUES already made),
// so these tests exercise them through the same generic functions
// webviewClientHelpers.js's new fk-valnum/fk-wrdwrap/fk-hlprcd*/MOUBTN rows
// actually call.
// ===========================================================================

console.log('\nTask I-5: VALNUM - plain no-parameter flag, option indicators not valid (no conditions passed by the caller)');
{
  let kw = [];
  check('absent by default', DspfWriter.getFileFlagKeyword(kw, 'VALNUM').present === false);
  kw = DspfWriter.setFileFlagKeyword(kw, 'VALNUM', true);
  check('present after set', DspfWriter.getFileFlagKeyword(kw, 'VALNUM').present === true);
  check('exactly one keyword, no parameters', kw.length === 1 && kw[0].name === 'VALNUM' && kw[0].parameters === '');
  kw = DspfWriter.setFileFlagKeyword(kw, 'VALNUM', false);
  check('removed after unset', DspfWriter.getFileFlagKeyword(kw, 'VALNUM').present === false);
}

console.log('\nTask I-5: WRDWRAP - plain no-parameter flag, option indicators not valid (no conditions passed by the caller)');
{
  let kw = [];
  check('absent by default', DspfWriter.getFileFlagKeyword(kw, 'WRDWRAP').present === false);
  kw = DspfWriter.setFileFlagKeyword(kw, 'WRDWRAP', true);
  check('present after set', DspfWriter.getFileFlagKeyword(kw, 'WRDWRAP').present === true);
  check('exactly one keyword, no parameters', kw.length === 1 && kw[0].name === 'WRDWRAP' && kw[0].parameters === '');
  kw = DspfWriter.setFileFlagKeyword(kw, 'WRDWRAP', false);
  check('removed after unset', DspfWriter.getFileFlagKeyword(kw, 'WRDWRAP').present === false);
}

console.log('\nTask I-5: HLPRCD - "record-format-name [[library/]file-name]" composed the same space-then-slash way webviewClientHelpers.js\'s commitHlprcd does');
{
  let kw = [];
  check('absent by default', DspfWriter.getFileFlagKeyword(kw, 'HLPRCD').present === false);

  // record only, no library/file
  kw = DspfWriter.setFileFlagKeyword(kw, 'HLPRCD', true, 'HELPFMT');
  check('record-only parameters', DspfWriter.getFileFlagKeyword(kw, 'HLPRCD').parameters === 'HELPFMT');

  // record + file, no library
  kw = DspfWriter.setFileFlagKeyword(kw, 'HLPRCD', true, 'HELPFMT MYFILE');
  check('record + file, no library', DspfWriter.getFileFlagKeyword(kw, 'HLPRCD').parameters === 'HELPFMT MYFILE');

  // record + library/file
  kw = DspfWriter.setFileFlagKeyword(kw, 'HLPRCD', true, 'HELPFMT MYLIB/MYFILE');
  check('record + library/file', DspfWriter.getFileFlagKeyword(kw, 'HLPRCD').parameters === 'HELPFMT MYLIB/MYFILE');

  // conditioning is valid for HLPRCD - confirm conditions round-trip
  kw = DspfWriter.setFileFlagKeyword(kw, 'HLPRCD', true, 'HELPFMT', undefined, [{ negate: false, indicator: '30' }]);
  check('conditions carried through', DspfWriter.getFileFlagKeyword(kw, 'HLPRCD').conditions.length === 1);

  kw = DspfWriter.setFileFlagKeyword(kw, 'HLPRCD', false, '');
  check('removed after unset', DspfWriter.getFileFlagKeyword(kw, 'HLPRCD').present === false);
}

console.log('\nTask I-5: MOUBTN - repeatable, EVENT [TRAILING-EVENT] {key|EVENT-ID} [*QUEUE|*NOQUEUE], via the generic repeatable-instance primitive (parse/compose itself lives client-side in webviewClientHelpers.js)');
{
  let kw = [];
  check('no instances by default', DspfWriter.getRepeatableKeywordInstances(kw, ['MOUBTN']).length === 0);

  kw = DspfWriter.setRepeatableKeywordInstances(kw, ['MOUBTN'], [
    { name: 'MOUBTN', parameters: '*ULP CF01', conditions: [] },
  ]);
  let instances = DspfWriter.getRepeatableKeywordInstances(kw, ['MOUBTN']);
  check('single-event instance written', instances.length === 1 && instances[0].parameters === '*ULP CF01');

  kw = DspfWriter.setRepeatableKeywordInstances(kw, ['MOUBTN'], [
    { name: 'MOUBTN', parameters: '*ULP CF01', conditions: [] },
    { name: 'MOUBTN', parameters: '*ULP *UMP ROLLUP *QUEUE', conditions: [{ negate: false, indicator: '40' }] },
  ]);
  instances = DspfWriter.getRepeatableKeywordInstances(kw, ['MOUBTN']);
  check('two independent MOUBTN instances coexist', instances.length === 2);
  check('second instance keeps its trailing-event/key/queue parameters intact', instances[1].parameters === '*ULP *UMP ROLLUP *QUEUE');
  check('second instance keeps its own conditioning, independent of the first', instances[1].conditions.length === 1 && instances[0].conditions.length === 0);

  kw = DspfWriter.setRepeatableKeywordInstances(kw, ['MOUBTN'], [instances[1]]);
  instances = DspfWriter.getRepeatableKeywordInstances(kw, ['MOUBTN']);
  check('removing one instance leaves only the other, not both dropped', instances.length === 1 && instances[0].parameters === '*ULP *UMP ROLLUP *QUEUE');

  kw = DspfWriter.setRepeatableKeywordInstances(kw, ['MOUBTN'], []);
  check('removing the last instance leaves no MOUBTN keyword at all', DspfWriter.getRepeatableKeywordInstances(kw, ['MOUBTN']).length === 0 && !kw.some((k) => k.name === 'MOUBTN'));
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

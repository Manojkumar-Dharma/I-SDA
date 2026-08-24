/**
 * sflRecordKeywordsPicker.test.js
 *
 * Direct unit coverage for Task R3's SFL-specific record keywords picker -
 * the "Select Subfile Keywords" screen SFL records get on top of Task R1's
 * base 8-category set (docs/sda-reference/screens/record-level/subfile-sfl/).
 *
 * SFLNXTCHG/LOGOUT/LOGINP/KEEP and CHECK(AB)/CHECK(RL) reuse Task F1's
 * generic getFileFlagKeyword/setFileFlagKeyword as-is (CHECK's two via its
 * fixedParam mode, same pattern the file-level picker already uses for
 * CHECK(AB)/CHECK(RLTB)/CHECK(RL)) - not covered again here, see
 * fileKeywordsPicker.test.js for that primitive's own coverage. This file
 * covers what's new for R3: getIndicatorTextRows/setIndicatorTextRows, the
 * repeatable INDTXT/SETOF/CHANGE row list SFL's own "Define Indicator
 * Keywords" screen offers (real DDS allows multiple SETOF/CHANGE/INDTXT
 * keywords on one record, unlike the single-instance versions Task R1's
 * base Indicator panel already covers) - plus an end-to-end round-trip
 * through applyRecordUpdate + re-parse.
 *
 * Note: CHGINPDFT (shown on SFL's own "General keywords" screenshot) is
 * deliberately NOT duplicated here - it's already on Task R1's base
 * General panel, shown for every record type including SFL.
 *
 * Pure Node, no vscode/jsdom needed. Run with:
 *   node src/test/sflRecordKeywordsPicker.test.js
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

console.log('SFL record-level CHECK(AB)/CHECK(RL) via getFileFlagKeyword\u2019s fixedParam mode (same pattern as file-level CHECK)');
{
  let kw = [];
  check('neither present by default', !DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present && !DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present);

  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, '', 'AB');
  check('CHECK(AB) added', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present === true);
  check('CHECK(RL) still absent - fixedParam variants are independent', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present === false);

  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, '', 'RL');
  check('CHECK(RL) added alongside CHECK(AB)', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present === true);
  check('both coexist as two separate CHECK keywords', kw.filter((k) => k.name === 'CHECK').length === 2);

  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', false, '', 'AB');
  check('removing CHECK(AB) leaves CHECK(RL) alone', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present === false && DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present === true);
}

console.log('\ngetIndicatorTextRows / setIndicatorTextRows - repeatable INDTXT/SETOF/CHANGE rows');
{
  const NAMES = ['INDTXT', 'SETOF', 'CHANGE'];
  let kw = [];
  check('none present -> empty row list', DspfWriter.getIndicatorTextRows(kw, NAMES).length === 0);

  kw = DspfWriter.setIndicatorTextRows(kw, NAMES, [
    { keyword: 'SETOF', indicator: '30', text: '' },
    { keyword: 'CHANGE', indicator: '40', text: '' },
    { keyword: 'INDTXT', indicator: '50', text: 'Amount valid' },
  ]);
  check('all three keywords written', kw.filter((k) => NAMES.indexOf(k.name) >= 0).length === 3);
  check('SETOF(30) - indicator only, no quoted text', kw.find((k) => k.name === 'SETOF').parameters === '30');
  check('CHANGE(40) - indicator only', kw.find((k) => k.name === 'CHANGE').parameters === '40');
  check('INDTXT(50 \'Amount valid\') - indicator plus quoted text', kw.find((k) => k.name === 'INDTXT').parameters === "50 'Amount valid'");

  const rows = DspfWriter.getIndicatorTextRows(kw, NAMES);
  check('round-trips 3 rows back out', rows.length === 3);
  check('round-trips SETOF row with empty text', rows.find((r) => r.keyword === 'SETOF').indicator === '30' && rows.find((r) => r.keyword === 'SETOF').text === '');
  check('round-trips INDTXT row with its text, unescaped', rows.find((r) => r.keyword === 'INDTXT').text === 'Amount valid');

  // A row supplying text for a keyword that doesn't take it (SETOF/CHANGE)
  // must not write invalid DDS - text is silently dropped for those.
  kw = DspfWriter.setIndicatorTextRows([], NAMES, [{ keyword: 'SETOF', indicator: '60', text: 'should be ignored' }]);
  check('SETOF ignores a stray text value - indicator only', kw[0].parameters === '60');

  // Multiple SETOF rows (different indicators) are a real, legitimate DDS
  // pattern (clearing several independent indicators) - this is exactly
  // what Task R1's single-instance base Indicator panel can't express.
  kw = DspfWriter.setIndicatorTextRows([], NAMES, [
    { keyword: 'SETOF', indicator: '30', text: '' },
    { keyword: 'SETOF', indicator: '31', text: '' },
    { keyword: 'SETOF', indicator: '32', text: '' },
  ]);
  check('multiple SETOF rows with different indicators all coexist', kw.filter((k) => k.name === 'SETOF').length === 3);

  // Blank-indicator rows are skipped (unfilled slots in the fixed-size UI grid).
  kw = DspfWriter.setIndicatorTextRows([], NAMES, [
    { keyword: 'SETOF', indicator: '', text: '' },
    { keyword: 'CHANGE', indicator: '40', text: '' },
  ]);
  check('blank-indicator row is skipped, filled one is kept', kw.length === 1 && kw[0].name === 'CHANGE');

  // A row with no keyword chosen (blank dropdown) is skipped too.
  kw = DspfWriter.setIndicatorTextRows([], NAMES, [{ keyword: '', indicator: '70', text: '' }]);
  check('row with no keyword selected is skipped', kw.length === 0);

  // setIndicatorTextRows only touches the keywords named; anything else on
  // the record (e.g. a KEEP flag from the General panel) survives untouched.
  kw = DspfWriter.setFileFlagKeyword([], 'KEEP', true);
  kw = DspfWriter.setIndicatorTextRows(kw, NAMES, [{ keyword: 'SETOF', indicator: '30', text: '' }]);
  check('unrelated keywords are preserved', kw.some((k) => k.name === 'KEEP'));

  // Replacing the whole row set drops anything not re-supplied (this is a
  // full-replace API, same convention as setDisplaySizesList/setCheckOptions).
  kw = DspfWriter.setIndicatorTextRows(kw, NAMES, [{ keyword: 'CHANGE', indicator: '99', text: '' }]);
  check('full-replace drops the previous SETOF row', !kw.some((k) => k.name === 'SETOF'));
  check('full-replace keeps the newly-supplied row', kw.some((k) => k.name === 'CHANGE' && k.parameters === '99'));
  check('KEEP (a different keyword entirely) is still untouched by the replace', kw.some((k) => k.name === 'KEEP'));
}

console.log('\nEnd-to-end: SFL-specific keywords survive applyRecordUpdate + reparse alongside Task R1\u2019s base panel');
{
  const src =
    [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R SFLREC                     SFL',
      '     A            FLD1          10B  4  5',
    ].join('\n') + '\n';
  const parsed = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = parsed.records[0];

  let kw = rec.keywords;
  kw = DspfWriter.setFileFlagKeyword(kw, 'SFLNXTCHG', true);                                  // SFL General
  kw = DspfWriter.setFileFlagKeyword(kw, 'CHECK', true, '', 'AB');                             // SFL General
  kw = DspfWriter.setIndicatorTextRows(kw, ['INDTXT', 'SETOF', 'CHANGE'], [
    { keyword: 'SETOF', indicator: '30', text: '' },
    { keyword: 'INDTXT', indicator: '50', text: 'Row changed' },
  ]);                                                                                          // SFL Indicator
  kw = DspfWriter.setFileFlagKeyword(kw, 'KEEP', true);                                        // Task R1's base General panel

  const newLines = DspfWriter.applyRecordUpdate(rec, lines, { keywords: kw });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const reRec = reparsed.records[0];

  check('SFL is untouched by the edit', reRec.keywords.some((k) => k.name === 'SFL'));
  check('SFLNXTCHG reads back present after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'SFLNXTCHG').present === true);
  check('CHECK(AB) reads back present after reparse', DspfWriter.getFileFlagKeyword(reRec.keywords, 'CHECK', 'AB').present === true);
  const rows = DspfWriter.getIndicatorTextRows(reRec.keywords, ['INDTXT', 'SETOF', 'CHANGE']);
  check('both indicator-text rows read back after reparse', rows.length === 2);
  check('SETOF(30) row survives reparse', rows.some((r) => r.keyword === 'SETOF' && r.indicator === '30'));
  check('INDTXT text survives reparse', rows.some((r) => r.keyword === 'INDTXT' && r.text === 'Row changed'));
  check('Task R1\u2019s base-panel KEEP flag coexists untouched', DspfWriter.getFileFlagKeyword(reRec.keywords, 'KEEP').present === true);
  check('the record\u2019s own field is untouched', reRec.fields.length === 1 && reRec.fields[0].name === 'FLD1');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

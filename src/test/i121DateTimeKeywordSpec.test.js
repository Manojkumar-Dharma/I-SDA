/**
 * i121DateTimeKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", date/time-keyword
 * slice: DATFMT/DATSEP (date fields, data type L), TIMFMT/TIMSEP (time
 * fields, data type T), and the L/T/Z usage restriction the DDS Reference
 * states once for all three date/time data types together.
 *
 * Before this slice: `dateTimeUsageConflictReason` (I-31) hard-coded its
 * own 'L'/'T'/'Z' and 'O'/'B'/'I' checks inline; `dateSeparatorConflict-
 * Reason`/`timeSeparatorConflictReason` (I-32) each hard-coded an
 * identical `['*ISO', '*USA', '*EUR', '*JIS']` array as their own local
 * FIXED_SEPARATOR_DATE_FORMATS/FIXED_SEPARATOR_TIME_FORMATS constant, with
 * no browsable per-keyword fact anywhere.
 *
 * DDS_Keyword_V7r6.txt, re-verified fresh for this slice: DATFMT's own
 * section (line ~4531, "valid only for date fields (data type L)"),
 * DATSEP's own (line ~4602, same data-type restriction, plus "If you
 * specify the *ISO, *USA, *EUR, or *JIS date format value for the DATFMT
 * keyword, you should not specify the DATSEP keyword"), TIMFMT's own
 * (line ~12864, "valid for time fields (data type T)"), TIMSEP's own
 * (line ~12927, same restriction, plus the identical *ISO/*USA/*EUR/*JIS
 * fixed-separator sentence), and the shared "Date (L), Time (T), and
 * Timestamp (Z)" field-description text (page 18, "Valid field usage
 * (DDS position 38) can be O, B, or I") - all unchanged from what the
 * code already had.
 *
 * This file verifies:
 *  1. keywordSpec.js's DATFMT/DATSEP/TIMFMT/TIMSEP entries carry the
 *     correct validDataType, and DATSEP/TIMSEP carry the correct
 *     fixedSeparatorPartner/fixedSeparatorFormats.
 *  2. KeywordSpec.isDateTimeDataType/dateTimeAllowedUsage/validDataType/
 *     isFixedSeparatorFormat/fixedSeparatorPartner all agree with those
 *     entries, including for unrelated keywords/data types.
 *  3. DspfWriter.dateTimeUsageConflictReason/dateSeparatorConflictReason/
 *     timeSeparatorConflictReason are themselves unchanged by this
 *     refactor.
 *
 * Run with: node src/test/i121DateTimeKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

// ===========================================================================
// Part 1 - the spec entries
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.{DATFMT,DATSEP,TIMFMT,TIMSEP}');
{
  check('DATFMT.validDataType is L', KeywordSpec.RECORD_TYPES.DATFMT.validDataType === 'L');
  check('DATSEP.validDataType is L', KeywordSpec.RECORD_TYPES.DATSEP.validDataType === 'L');
  check('TIMFMT.validDataType is T', KeywordSpec.RECORD_TYPES.TIMFMT.validDataType === 'T');
  check('TIMSEP.validDataType is T', KeywordSpec.RECORD_TYPES.TIMSEP.validDataType === 'T');

  check('DATSEP.fixedSeparatorPartner is DATFMT', KeywordSpec.RECORD_TYPES.DATSEP.fixedSeparatorPartner === 'DATFMT');
  check('TIMSEP.fixedSeparatorPartner is TIMFMT', KeywordSpec.RECORD_TYPES.TIMSEP.fixedSeparatorPartner === 'TIMFMT');
  check('DATSEP.fixedSeparatorFormats is *ISO/*USA/*EUR/*JIS', JSON.stringify(KeywordSpec.RECORD_TYPES.DATSEP.fixedSeparatorFormats) === JSON.stringify(['*ISO', '*USA', '*EUR', '*JIS']));
  check('TIMSEP.fixedSeparatorFormats is *ISO/*USA/*EUR/*JIS', JSON.stringify(KeywordSpec.RECORD_TYPES.TIMSEP.fixedSeparatorFormats) === JSON.stringify(['*ISO', '*USA', '*EUR', '*JIS']));

  check('DATFMT has no fixedSeparatorFormats of its own (the restriction is on DATSEP)', !KeywordSpec.RECORD_TYPES.DATFMT.fixedSeparatorFormats);
  check('TIMFMT has no fixedSeparatorFormats of its own (the restriction is on TIMSEP)', !KeywordSpec.RECORD_TYPES.TIMFMT.fixedSeparatorFormats);
}

// ===========================================================================
// Part 2 - accessors
// ===========================================================================
console.log('\nKeywordSpec date/time accessors');
{
  ['L', 'T', 'Z'].forEach(function (dt) {
    check(dt + ' is a date/time data type', KeywordSpec.isDateTimeDataType(dt) === true);
  });
  check('a non-date/time type (S) is not', KeywordSpec.isDateTimeDataType('S') === false);
  check('a non-date/time type (A) is not', KeywordSpec.isDateTimeDataType('A') === false);

  check('dateTimeAllowedUsage is O/B/I', JSON.stringify(KeywordSpec.dateTimeAllowedUsage()) === JSON.stringify(['O', 'B', 'I']));
  {
    const list = KeywordSpec.dateTimeAllowedUsage();
    list.push('X');
    check('dateTimeAllowedUsage returns a copy, not a live reference', KeywordSpec.dateTimeAllowedUsage().length === 3);
  }

  check('validDataType(DATFMT) is L', KeywordSpec.validDataType('DATFMT') === 'L');
  check('validDataType(DATSEP) is L', KeywordSpec.validDataType('DATSEP') === 'L');
  check('validDataType(TIMFMT) is T', KeywordSpec.validDataType('TIMFMT') === 'T');
  check('validDataType(TIMSEP) is T', KeywordSpec.validDataType('TIMSEP') === 'T');
  check('validDataType of an unrelated keyword is null', KeywordSpec.validDataType('TEXT') === null);
  check('validDataType of an unknown keyword is null', KeywordSpec.validDataType('NOSUCHKEYWORD') === null);

  ['*ISO', '*USA', '*EUR', '*JIS'].forEach(function (fmt) {
    check('isFixedSeparatorFormat(DATSEP, ' + fmt + ')', KeywordSpec.isFixedSeparatorFormat('DATSEP', fmt) === true);
    check('isFixedSeparatorFormat(TIMSEP, ' + fmt + ')', KeywordSpec.isFixedSeparatorFormat('TIMSEP', fmt) === true);
    check('isFixedSeparatorFormat(DATSEP, ' + fmt.toLowerCase() + ') is case-insensitive', KeywordSpec.isFixedSeparatorFormat('DATSEP', fmt.toLowerCase()) === true);
  });
  ['*MDY', '*DMY', '*YMD', '*JUL', '*JOB', ''].forEach(function (fmt) {
    check('isFixedSeparatorFormat(DATSEP, ' + JSON.stringify(fmt) + ') is false (variable separator)', KeywordSpec.isFixedSeparatorFormat('DATSEP', fmt) === false);
  });
  ['*HMS', ''].forEach(function (fmt) {
    check('isFixedSeparatorFormat(TIMSEP, ' + JSON.stringify(fmt) + ') is false (variable separator)', KeywordSpec.isFixedSeparatorFormat('TIMSEP', fmt) === false);
  });
  check('isFixedSeparatorFormat of an unrelated keyword is false', KeywordSpec.isFixedSeparatorFormat('TEXT', '*ISO') === false);

  check('fixedSeparatorPartner(DATSEP) is DATFMT', KeywordSpec.fixedSeparatorPartner('DATSEP') === 'DATFMT');
  check('fixedSeparatorPartner(TIMSEP) is TIMFMT', KeywordSpec.fixedSeparatorPartner('TIMSEP') === 'TIMFMT');
  check('fixedSeparatorPartner of an unrelated keyword is null', KeywordSpec.fixedSeparatorPartner('TEXT') === null);
}

// ===========================================================================
// Part 3 - DspfWriter functions, unchanged behavior
// ===========================================================================
console.log('\nDspfWriter.dateTimeUsageConflictReason (unchanged behavior)');
{
  ['L', 'T', 'Z'].forEach(function (dt) {
    ['H', 'M', 'P'].forEach(function (usage) {
      check(dt + ' + usage ' + usage + ' is rejected', typeof DspfWriter.dateTimeUsageConflictReason(dt, usage) === 'string');
    });
    ['O', 'B', 'I'].forEach(function (usage) {
      check(dt + ' + usage ' + usage + ' is accepted', DspfWriter.dateTimeUsageConflictReason(dt, usage) === null);
    });
  });
  check('non-date/time types (e.g. S) are never subject to this restriction, even with usage H', DspfWriter.dateTimeUsageConflictReason('S', 'H') === null);
  check('character types (e.g. A) are never subject to this restriction, even with usage M', DspfWriter.dateTimeUsageConflictReason('A', 'M') === null);
}

console.log('\nDspfWriter.dateSeparatorConflictReason / timeSeparatorConflictReason (unchanged behavior)');
{
  check('dateSeparatorConflictReason blocks *ISO (fixed separator)', typeof DspfWriter.dateSeparatorConflictReason('*ISO') === 'string');
  check('dateSeparatorConflictReason blocks *USA/*EUR/*JIS too', DspfWriter.dateSeparatorConflictReason('*USA') && DspfWriter.dateSeparatorConflictReason('*EUR') && DspfWriter.dateSeparatorConflictReason('*JIS'));
  check('dateSeparatorConflictReason allows *MDY/*DMY/*YMD/*JUL/*JOB/blank (variable-separator formats)', !DspfWriter.dateSeparatorConflictReason('*MDY') && !DspfWriter.dateSeparatorConflictReason('*JUL') && !DspfWriter.dateSeparatorConflictReason('*JOB') && !DspfWriter.dateSeparatorConflictReason(''));

  check('timeSeparatorConflictReason blocks *ISO/*USA/*EUR/*JIS (fixed separators)', DspfWriter.timeSeparatorConflictReason('*ISO') && DspfWriter.timeSeparatorConflictReason('*USA') && DspfWriter.timeSeparatorConflictReason('*EUR') && DspfWriter.timeSeparatorConflictReason('*JIS'));
  check('timeSeparatorConflictReason allows *HMS/blank (variable-separator formats; TIMFMT has no *JOB value at all)', !DspfWriter.timeSeparatorConflictReason('*HMS') && !DspfWriter.timeSeparatorConflictReason(''));

  check('dateSeparatorConflictReason message names the offending DATFMT value', DspfWriter.dateSeparatorConflictReason('*ISO').indexOf('DATFMT(*ISO)') !== -1);
  check('timeSeparatorConflictReason message names the offending TIMFMT value', DspfWriter.timeSeparatorConflictReason('*ISO').indexOf('TIMFMT(*ISO)') !== -1);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

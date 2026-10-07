/**
 * i122eFieldFormatEditFamilyKeywords.test.js
 *
 * Task I-122e - the field format and edit family from the I-122 coverage
 * inventory: DATFMT, DATSEP, TIMFMT, TIMSEP, FLTPCN, FLTFIXDEC, BLANKS, CNTFLD,
 * FLDCSRPRG and VALNUM.  Each cell is traced to the keyword's own DDS Reference
 * section (DDS_Keyword_V7r6.txt):
 *
 *   DATFMT    field, data type L, *JOB *MDY *DMY *YMD *JUL *ISO *USA *EUR *JIS,
 *             default *ISO, option indicators not valid.
 *   DATSEP    field, data type L, *JOB or one of / - . , blank; not with a fixed
 *             separator format (*ISO *USA *EUR *JIS).
 *   TIMFMT    field, data type T, *HMS *ISO *USA *EUR *JIS (no *JOB).
 *   TIMSEP    field, data type T, *JOB or one of : . , blank; not with a fixed
 *             separator format.
 *   FLTPCN    field, data type F, *SINGLE | *DOUBLE, option indicators not valid.
 *   FLTFIXDEC field, data type F, usage B or O, option indicators not valid.
 *   BLANKS    field, usage I or B (numeric or character), no option indicators.
 *   CNTFLD    field, usage I or B, data type A, not in a subfile, width < length.
 *   FLDCSRPRG field, usage I or B, not in a subfile, not with SNGCHCFLD /
 *             MLTCHCFLD, names an input-capable field of the same record.
 *   VALNUM    file / record / field, field must be usage I or B with data type Y.
 *
 *  L1/L2 writer: facts, get / set round trips, guards (both directions).
 *  L3    display: which data types get which rows, saved state, no Conditioning.
 *  L4    commit paths: selects and Apply buttons, checkboxes, raw editor, Basic tab.
 *
 * Gaps found while writing it are NOT asserted as correct; they are logged in
 * docs/sda-reference/keywordFixes.md.
 *
 * Run with: node src/test/i122eFieldFormatEditFamilyKeywords.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// Fixed-column DDS line builder (see i122NoTestKeywordsBatch1.test.js).
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const build = (lines) => lines.join('\n') + '\n';
const K = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const kwOf = (kws, name) => (kws || []).find((k) => k.name === name);
const names = (kws) => (kws || []).map((k) => k.name);
const field = (name, len, type, dec, line, fn, usage) =>
  dds({ name, len, type, dec, usage: usage === undefined ? 'B' : usage, line, pos: 2, fn });

// One record, one field per case (source line = array index + 1).  CNTFLD(20) on a
// 60-wide field spans three screen rows, so the next field sits four rows below it.
const FIELDS = [
  dds({ rec: 1, name: 'R1' }),                                              // 1
  field('D1', 6, 'L', undefined, 3, "DATFMT(*MDY) DATSEP('/')"),            // 2  L with format and separator
  field('D2', 10, 'L', undefined, 5),                                       // 3  L, nothing yet
  field('T1', 8, 'T', undefined, 7, "TIMFMT(*HMS) TIMSEP(':')"),            // 4  T with format and separator
  field('T2', 8, 'T', undefined, 8, 'TIMFMT(*ISO)'),                        // 5  T with a fixed-separator format
  field('A9', 10, 'A', undefined, 9),                                       // 6  plain character
  field('F1', 9, 'F', 2, 11, 'FLTPCN(*DOUBLE) FLTFIXDEC'),                  // 7  float with both
  field('N1', 5, 'S', 0, 13, 'BLANKS'),                                     // 8  numeric with BLANKS
  field('C1', 60, 'A', undefined, 15, 'CNTFLD(20)'),                        // 9  continued-entry field
  field('C2', 10, 'A', undefined, 19, 'FLDCSRPRG(A9)'),                     // 10 cursor progression to A9
  field('Y1', 5, 'Y', 0, 21, 'VALNUM'),                                     // 11 Y with VALNUM
  field('Y2', 5, 'Y', 0, 22),                                               // 12 Y without it
  field('O1', 10, 'A', undefined, 23, undefined, 'O'),                      // 13 output-only character
];
const SOURCE = build(FIELDS);
const model = DspfParser.parseDspf(SOURCE);
const rec = model.records[0];
const fld = (n) => rec.fields.find((f) => f.name === n);
const LINE = { D1: 2, D2: 3, T1: 4, T2: 5, A9: 6, F1: 7, N1: 8, C1: 9, C2: 10, Y1: 11, Y2: 12, O1: 13 };

// Apply a keyword list to one field of SOURCE through the writer and read the result back.
function writeKeywords(fieldName, keywords, extra) {
  const f = fld(fieldName);
  const lines = DspfWriter.applyFieldUpdate(f, SOURCE.split('\n'), Object.assign({ keywords }, extra || {}));
  const m = DspfParser.parseDspf(lines.join('\n'));
  return { text: lines.join('\n'), field: m.records[0].fields.find((x) => x.name === fieldName), model: m };
}

console.log('=== fixture: the parser reads each field as intended ===');
{
  const p = (n) => fld(n);
  check('D1 is L(6) with DATFMT(*MDY) and DATSEP(\'/\')', p('D1').dataType === 'L' && kwOf(p('D1').keywords, 'DATFMT').parameters === '*MDY' && kwOf(p('D1').keywords, 'DATSEP').parameters === "'/'");
  check('T1 is T(8) with TIMFMT(*HMS) and TIMSEP(\':\')', p('T1').dataType === 'T' && kwOf(p('T1').keywords, 'TIMFMT').parameters === '*HMS' && kwOf(p('T1').keywords, 'TIMSEP').parameters === "':'");
  check('F1 is F(9,2) with FLTPCN(*DOUBLE) and FLTFIXDEC', p('F1').dataType === 'F' && kwOf(p('F1').keywords, 'FLTPCN').parameters === '*DOUBLE' && !!kwOf(p('F1').keywords, 'FLTFIXDEC'));
  check('C1 is A(60) with CNTFLD(20); C2 has FLDCSRPRG(A9)', Number(p('C1').length) === 60 && kwOf(p('C1').keywords, 'CNTFLD').parameters === '20' && kwOf(p('C2').keywords, 'FLDCSRPRG').parameters === 'A9');
  check('Y1 is Y with VALNUM, Y2 is Y without it, N1 has BLANKS', p('Y1').dataType === 'Y' && !!kwOf(p('Y1').keywords, 'VALNUM') && !kwOf(p('Y2').keywords, 'VALNUM') && !!kwOf(p('N1').keywords, 'BLANKS'));
  check('every fixture field is on the line the table says', Object.keys(LINE).every((n) => fld(n) && Number(fld(n).location && fld(n).location.line) > 0));
}

console.log('\n=== spec: what the DDS Reference says about each keyword ===');
{
  const T = KeywordSpec.RECORD_TYPES;
  check('DATFMT: valid for data type L only, nine formats in IBM\'s order, default *ISO',
    KeywordSpec.validDataType('DATFMT') === 'L' && KeywordSpec.validValues('DATFMT').join() === '*JOB,*MDY,*DMY,*YMD,*JUL,*ISO,*USA,*EUR,*JIS' && T.DATFMT.defaultFormat === '*ISO');
  check('DATFMT display lengths: *MDY/*DMY/*YMD 8, *JUL 6, *ISO/*USA/*EUR/*JIS 10, *JOB 10, default 10',
    ['*MDY', '*DMY', '*YMD'].every((f) => KeywordSpec.datfmtDisplayLength(f) === 8) && KeywordSpec.datfmtDisplayLength('*JUL') === 6 &&
    ['*ISO', '*USA', '*EUR', '*JIS', '*JOB'].every((f) => KeywordSpec.datfmtDisplayLength(f) === 10) && KeywordSpec.datfmtDefaultDisplayLength() === 10);
  check('DATSEP: valid for data type L only; *JOB or / - . , blank; partner DATFMT',
    KeywordSpec.validDataType('DATSEP') === 'L' && KeywordSpec.validValues('DATSEP').join('|') === '*JOB|/|-|.|,| ' && KeywordSpec.fixedSeparatorPartner('DATSEP') === 'DATFMT');
  check('TIMFMT: valid for data type T only; five formats and no *JOB; length 8',
    KeywordSpec.validDataType('TIMFMT') === 'T' && KeywordSpec.validValues('TIMFMT').join() === '*HMS,*ISO,*USA,*EUR,*JIS' && KeywordSpec.validValues('TIMFMT').indexOf('*JOB') < 0 && KeywordSpec.timfmtDisplayLength('*HMS') === 8);
  check('TIMSEP: valid for data type T only; *JOB or : . , blank (no slash); partner TIMFMT',
    KeywordSpec.validDataType('TIMSEP') === 'T' && KeywordSpec.validValues('TIMSEP').join('|') === '*JOB|:|.|,| ' && KeywordSpec.fixedSeparatorPartner('TIMSEP') === 'TIMFMT');
  check('the fixed-separator formats are *ISO *USA *EUR *JIS for both pairs',
    T.DATSEP.fixedSeparatorFormats.join() === '*ISO,*USA,*EUR,*JIS' && T.TIMSEP.fixedSeparatorFormats.join() === '*ISO,*USA,*EUR,*JIS');
  check('isFixedSeparatorFormat: true for the four, false for the rest, blank and *JOB',
    ['*ISO', '*USA', '*EUR', '*JIS'].every((f) => KeywordSpec.isFixedSeparatorFormat('DATSEP', f) && KeywordSpec.isFixedSeparatorFormat('TIMSEP', f)) &&
    ['*MDY', '*DMY', '*YMD', '*JUL', '*JOB', ''].every((f) => !KeywordSpec.isFixedSeparatorFormat('DATSEP', f)) &&
    ['*HMS', ''].every((f) => !KeywordSpec.isFixedSeparatorFormat('TIMSEP', f)));
  check('date, time and timestamp are the date/time data types; usage must be O, B or I',
    ['L', 'T', 'Z'].every((d) => KeywordSpec.isDateTimeDataType(d)) && !KeywordSpec.isDateTimeDataType('A') && KeywordSpec.dateTimeAllowedUsage().slice().sort().join() === 'B,I,O');
  check('FLTPCN: valid for floating-point fields only (data type F)', KeywordSpec.requiredDataTypes('FLTPCN').join() === 'F' && KeywordSpec.allowedUsage('FLTPCN') === null);
  check('FLTFIXDEC: usage B or O, data type F', KeywordSpec.allowedUsage('FLTFIXDEC').join() === 'B,O' && KeywordSpec.requiredDataTypes('FLTFIXDEC').join() === 'F');
  check('BLANKS: usage I or B, any data type (numeric or character)', KeywordSpec.allowedUsage('BLANKS').join() === 'I,B' && KeywordSpec.requiredDataTypes('BLANKS') === null);
  check('CNTFLD: usage I or B, data type A, not in a subfile, width below the field length',
    KeywordSpec.allowedUsage('CNTFLD').join() === 'I,B' && KeywordSpec.requiredDataTypes('CNTFLD').join() === 'A' && KeywordSpec.notInSubfile('CNTFLD') === true && T.CNTFLD.widthMustBeLessThanFieldLength === true);
  check('FLDCSRPRG: usage I or B, not in a subfile, not with SNGCHCFLD or MLTCHCFLD, names an input-capable field',
    KeywordSpec.allowedUsage('FLDCSRPRG').join() === 'I,B' && KeywordSpec.notInSubfile('FLDCSRPRG') === true && KeywordSpec.notWithKeywords('FLDCSRPRG').join() === 'SNGCHCFLD,MLTCHCFLD' && T.FLDCSRPRG.parameterNamesInputCapableFieldInSameRecord === true);
  check('VALNUM: usage I or B, data type Y; valid at file, record and field level',
    KeywordSpec.allowedUsage('VALNUM').join() === 'I,B' && KeywordSpec.requiredDataTypes('VALNUM').join() === 'Y' && KeywordSpec.noOptionIndicatorsFact('VALNUM').levels.join() === 'file,record,field');
  check('the I-150 guard covers BLANKS, CNTFLD, FLDCSRPRG, FLTFIXDEC and (since I-180) FLTPCN, not VALNUM', KeywordSpec.fieldKindGuardedKeywords().join() === 'BLANKS,CNTFLD,FLDCSRPRG,FLTFIXDEC,FLTPCN');
  check('blank data type counts as character only for CNTFLD', KeywordSpec.blankDataTypeIsCharacter('CNTFLD') === true && !KeywordSpec.blankDataTypeIsCharacter('FLTFIXDEC') && !KeywordSpec.blankDataTypeIsCharacter('VALNUM'));
  // Option indicators: "not valid" for nine of the ten; the four date/time keywords add that the
  // indicators can still condition the field itself.
  ['DATFMT', 'DATSEP', 'TIMFMT', 'TIMSEP'].forEach((n) => check(n + ': option indicators not valid, but they may condition the field',
    KeywordSpec.noOptionIndicatorsFact(n).kind === 'notValidFieldConditionable' && KeywordSpec.noOptionIndicatorsFact(n).levels.join() === 'field'));
  ['BLANKS', 'CNTFLD', 'FLDCSRPRG', 'FLTFIXDEC', 'FLTPCN', 'VALNUM'].forEach((n) => check(n + ': option indicators not valid',
    KeywordSpec.noOptionIndicatorsFact(n).kind === 'notValid'));
  // FLTPCN's row was added by I-180 (see i180FltpcnCntfldRules.test.js).
}

console.log('\n=== L1/L2 DATFMT / DATSEP / TIMFMT / TIMSEP: get, set, round trip ===');
{
  const W = DspfWriter;
  // formats
  check('getDateFormat reads the bare parameter, "" when absent', W.getDateFormat([K('DATFMT', '*JUL')]) === '*JUL' && W.getDateFormat([K('X')]) === '' && W.getDateFormat(null) === '');
  KeywordSpec.validValues('DATFMT').forEach((f) => {
    const kws = W.setDateFormat([K('X')], f);
    check('setDateFormat ' + f + ': one DATFMT with the bare parameter, neighbour kept, reads back',
      kws.filter((k) => k.name === 'DATFMT').length === 1 && kwOf(kws, 'DATFMT').parameters === f && names(kws).join() === 'X,DATFMT' && W.getDateFormat(kws) === f);
  });
  check('setDateFormat is idempotent and replaces rather than duplicates',
    JSON.stringify(W.setDateFormat(W.setDateFormat([K('DATFMT', '*MDY')], '*JUL'), '*JUL')) === JSON.stringify(W.setDateFormat([K('DATFMT', '*MDY')], '*JUL')) &&
    names(W.setDateFormat([K('DATFMT', '*MDY'), K('DATSEP', "'/'")], '*DMY')).join() === 'DATSEP,DATFMT');
  check('setDateFormat with "" removes DATFMT and keeps the rest', names(W.setDateFormat([K('DATFMT', '*MDY'), K('DATSEP', "'/'")], '')).join() === 'DATSEP');
  KeywordSpec.validValues('TIMFMT').forEach((f) => {
    const kws = W.setTimeFormat([K('X')], f);
    check('setTimeFormat ' + f + ': one TIMFMT, neighbour kept, reads back',
      kws.filter((k) => k.name === 'TIMFMT').length === 1 && W.getTimeFormat(kws) === f && names(kws).join() === 'X,TIMFMT');
  });
  check('setTimeFormat "" removes TIMFMT only', names(W.setTimeFormat([K('TIMFMT', '*HMS'), K('TIMSEP', "':'")], '')).join() === 'TIMSEP');
  // separators: the writer quotes, the reader unquotes, *JOB stays bare
  KeywordSpec.validValues('DATSEP').forEach((v) => {
    const kws = W.setDateSeparator([K('X')], v);
    const stored = kwOf(kws, 'DATSEP').parameters;
    check('DATSEP ' + JSON.stringify(v) + ' is stored as ' + (v === '*JOB' ? '*JOB' : "'" + v + "'") + ' and reads back',
      stored === (v === '*JOB' ? '*JOB' : "'" + v + "'") && W.getDateSeparator(kws) === v && names(kws).join() === 'X,DATSEP');
  });
  KeywordSpec.validValues('TIMSEP').forEach((v) => {
    const kws = W.setTimeSeparator([K('X')], v);
    check('TIMSEP ' + JSON.stringify(v) + ' stored and read back, neighbour kept',
      kwOf(kws, 'TIMSEP').parameters === (v === '*JOB' ? '*JOB' : "'" + v + "'") && W.getTimeSeparator(kws) === v && names(kws).join() === 'X,TIMSEP');
  });
  check('a separator set twice is replaced, "" removes it', names(W.setDateSeparator(W.setDateSeparator([], '-'), '.')).join() === 'DATSEP' && W.getDateSeparator(W.setDateSeparator(W.setDateSeparator([], '-'), '.')) === '.' &&
    names(W.setTimeSeparator([K('TIMSEP', "':'")], '')).length === 0);
  check('a lower-case *job is read as *JOB', W.getDateSeparator([K('DATSEP', '*job')]) === '*JOB' && W.getTimeSeparator([K('TIMSEP', '*job')]) === '*JOB');
  // the fixed-separator rule, both directions
  ['*ISO', '*USA', '*EUR', '*JIS'].forEach((f) => {
    const d = W.dateSeparatorConflictReason(f);
    const t = W.timeSeparatorConflictReason(f);
    check('DATSEP with DATFMT(' + f + ') is refused, naming both', !!d && /DATSEP/.test(d) && d.indexOf('DATFMT(' + f + ')') >= 0);
    check('TIMSEP with TIMFMT(' + f + ') is refused, naming both', !!t && /TIMSEP/.test(t) && t.indexOf('TIMFMT(' + f + ')') >= 0);
  });
  check('DATSEP is fine with *MDY, *DMY, *YMD, *JUL, *JOB or no format', ['*MDY', '*DMY', '*YMD', '*JUL', '*JOB', '', undefined].every((f) => W.dateSeparatorConflictReason(f) === null));
  check('TIMSEP is fine with *HMS or no format', ['*HMS', '', undefined].every((f) => W.timeSeparatorConflictReason(f) === null));
  // usage of date/time/timestamp fields
  ['L', 'T', 'Z'].forEach((d) => {
    check(d + ' with usage H, M or P is refused (DDS: date/time/timestamp fields are O, B or I)', ['H', 'M', 'P'].every((u) => /usage O, B, or I/.test(W.dateTimeUsageConflictReason(d, u) || '')));
    check(d + ' with usage O, B or I is accepted (any case)', ['O', 'B', 'I', 'b'].every((u) => W.dateTimeUsageConflictReason(d, u) === null));
  });
  check('the usage rule does not apply to other data types', ['A', 'S', 'P', 'F', 'Y', ''].every((d) => ['H', 'M', 'P'].every((u) => W.dateTimeUsageConflictReason(d, u) === null)));
  // through the writer and the parser: the saved source says what was set
  {
    const r = writeKeywords('D2', W.setDateSeparator(W.setDateFormat(fld('D2').keywords, '*JUL'), '-'));
    check('writing DATFMT(*JUL) DATSEP(\'-\') to D2 reads back from the source, other fields untouched',
      kwOf(r.field.keywords, 'DATFMT').parameters === '*JUL' && kwOf(r.field.keywords, 'DATSEP').parameters === "'-'" &&
      names(r.model.records[0].fields.find((x) => x.name === 'D1').keywords).join() === 'DATFMT,DATSEP' && r.model.records[0].fields.length === rec.fields.length);
    const r2 = writeKeywords('D1', W.setDateSeparator(fld('D1').keywords, '*JOB'));
    check('DATSEP(*JOB) is written bare; DATFMT(*MDY) beside it is kept', kwOf(r2.field.keywords, 'DATSEP').parameters === '*JOB' && kwOf(r2.field.keywords, 'DATFMT').parameters === '*MDY');
    const r3 = writeKeywords('D1', W.setDateSeparator(fld('D1').keywords, ' '));
    check("a blank separator is written as ' ' and read back as one blank", W.getDateSeparator(r3.field.keywords) === ' ');
    const r4 = writeKeywords('T2', W.setTimeSeparator(W.setTimeFormat(fld('T2').keywords, '*HMS'), '.'));
    check("TIMFMT(*HMS) TIMSEP('.') written to T2 reads back", kwOf(r4.field.keywords, 'TIMFMT').parameters === '*HMS' && kwOf(r4.field.keywords, 'TIMSEP').parameters === "'.'");
    const r5 = writeKeywords('D1', W.setDateFormat(W.setDateSeparator(fld('D1').keywords, ''), ''));
    check('clearing both removes both keywords from the source', names(r5.field.keywords).length === 0);
  }
}

console.log('\n=== L1 FLTPCN / FLTFIXDEC / BLANKS / CNTFLD / FLDCSRPRG: eligibility guard ===');
{
  const G = (oldF, newF, extra) => DspfWriter.fieldKindNewConflictReason(oldF, newF);
  const doc = (fields, recKw) => DspfParser.parseDspf(build([dds({ rec: 1, name: 'R1', fn: recKw })].concat(fields)));
  const one = (len, type, usage, fn, dec) => doc([field('F1', len, type, dec, 3, fn, usage)]);
  // FLTFIXDEC: usage B or O, data type F
  check('FLTFIXDEC on a usage B float is accepted', G(one(9, 'F', 'B', undefined, 2), one(9, 'F', 'B', 'FLTFIXDEC', 2)) === null);
  check('FLTFIXDEC on a usage O float is accepted', G(one(9, 'F', 'O', undefined, 2), one(9, 'F', 'O', 'FLTFIXDEC', 2)) === null);
  check('FLTFIXDEC on a usage I float is refused (needs B or O)', /needs usage B or O/.test(G(one(9, 'F', 'I', undefined, 2), one(9, 'F', 'I', 'FLTFIXDEC', 2)) || ''));
  check('FLTFIXDEC on a packed field is refused (needs data type F)', /needs data type F/.test(G(one(9, 'P', 'B', undefined, 2), one(9, 'P', 'B', 'FLTFIXDEC', 2)) || ''));
  check('FLTFIXDEC already on an ineligible field is not re-reported', G(one(9, 'P', 'I', 'FLTFIXDEC', 2), one(9, 'P', 'I', 'FLTFIXDEC', 2)) === null);
  check('removing FLTFIXDEC from an ineligible field is never blocked', G(one(9, 'P', 'I', 'FLTFIXDEC', 2), one(9, 'P', 'I', undefined, 2)) === null);
  check('changing a FLTFIXDEC float to data type S is refused', /needs data type F/.test(G(one(9, 'F', 'B', 'FLTFIXDEC', 2), one(9, 'S', 'B', 'FLTFIXDEC', 2)) || ''));
  // BLANKS: usage I or B, numeric or character
  check('BLANKS on usage I and B is accepted for numeric and character fields',
    [['S', 0], ['A', undefined]].every(([t, d]) => ['I', 'B'].every((u) => G(one(5, t, u, undefined, d), one(5, t, u, 'BLANKS', d)) === null)));
  check('BLANKS on usage O or H is refused (needs I or B)', ['O', 'H'].every((u) => /needs usage I or B/.test(G(one(5, 'S', u, undefined, 0), one(5, 'S', u, 'BLANKS', 0)) || '')));
  check('BLANKS needs no particular data type: accepted on a packed and on a float field', G(one(5, 'P', 'B', undefined, 0), one(5, 'P', 'B', 'BLANKS', 0)) === null && G(one(9, 'F', 'B', undefined, 2), one(9, 'F', 'B', 'BLANKS', 2)) === null);
  check('moving a BLANKS field to usage O is refused', /needs usage I or B/.test(G(one(5, 'S', 'B', 'BLANKS', 0), one(5, 'S', 'O', 'BLANKS', 0)) || ''));
  // CNTFLD
  check('CNTFLD(20) on an A60 input field is accepted', G(one(60, 'A', 'I'), one(60, 'A', 'I', 'CNTFLD(20)')) === null);
  check('CNTFLD on an output field, a numeric field, a width equal to the length: each refused',
    /usage I or B/.test(G(one(60, 'A', 'O'), one(60, 'A', 'O', 'CNTFLD(20)')) || '') && /data type A/.test(G(one(10, 'S', 'I', undefined, 0), one(10, 'S', 'I', 'CNTFLD(5)', 0)) || '') &&
    /less than the field length \(60\)/.test(G(one(60, 'A', 'I'), one(60, 'A', 'I', 'CNTFLD(60)')) || ''));
  check('CNTFLD in a subfile record is refused', /subfile/.test(G(doc([]), DspfParser.parseDspf(build([dds({ rec: 1, name: 'S1', fn: 'SFL' }), field('F1', 60, 'A', undefined, 3, 'CNTFLD(20)')]))) || ''));
  // FLDCSRPRG
  const two = (fn, u2) => doc([field('F1', 10, 'A', undefined, 3, fn), field('F2', 10, 'A', undefined, 5, undefined, u2 || 'B')]);
  check('FLDCSRPRG(F2) naming an input-capable field is accepted', G(two(undefined), two('FLDCSRPRG(F2)')) === null);
  check('FLDCSRPRG naming a missing field, or an output field, is refused', /must name an input-capable field/.test(G(two(undefined), two('FLDCSRPRG(NOPE)')) || '') && /must name an input-capable field/.test(G(two(undefined, 'O'), two('FLDCSRPRG(F2)', 'O')) || ''));
  check('FLDCSRPRG together with SNGCHCFLD is refused, naming both', /FLDCSRPRG cannot be specified with SNGCHCFLD/.test(G(two(undefined), two('FLDCSRPRG(F2) SNGCHCFLD')) || ''));
  check('FLDCSRPRG in a subfile record is refused', /subfile/.test(G(doc([]), DspfParser.parseDspf(build([dds({ rec: 1, name: 'S1', fn: 'SFL' }), field('F1', 10, 'A', undefined, 3, 'FLDCSRPRG(F2)'), field('F2', 10, 'A', undefined, 5)]))) || ''));
  // FLTPCN joined the I-150 guard in I-180 (parameter, length caps; see i180FltpcnCntfldRules.test.js).
  check('FLTPCN(*DOUBLE) on an F9 float is accepted by fieldKindNewConflictReason', G(one(9, 'F', 'B', undefined, 2), one(9, 'F', 'B', 'FLTPCN(*DOUBLE)', 2)) === null);
}

console.log('\n=== L1 VALNUM: field eligibility (usage I or B, data type Y) ===');
{
  const W = DspfWriter;
  const VAL = [K('VALNUM')];
  check('VALNUM on Y with usage I or B is accepted (any case)', W.valnumEligibilityReason('I', 'Y') === null && W.valnumEligibilityReason('B', 'Y') === null && W.valnumEligibilityReason('b', 'y') === null);
  check('VALNUM on usage O, H, M, P, or blank (output) is refused, naming VALNUM and usage I or B', ['O', 'H', 'M', 'P', ''].every((u) => /VALNUM/.test(W.valnumEligibilityReason(u, 'Y') || '') && /usage I or B/.test(W.valnumEligibilityReason(u, 'Y') || '')));
  check('VALNUM on any data type but Y (and on a blank type) is refused', ['A', 'S', 'P', 'L', 'F', ''].every((d) => /data type Y/.test(W.valnumEligibilityReason('B', d) || '')));
  check('adding VALNUM to an eligible field is accepted', W.valnumNewConflictReason([], VAL, { usage: 'B', dataType: 'Y' }) === null);
  check('adding it to usage O, or to data type A, is refused', /usage I or B/.test(W.valnumNewConflictReason([], VAL, { usage: 'O', dataType: 'Y' }) || '') && /data type Y/.test(W.valnumNewConflictReason([], VAL, { usage: 'B', dataType: 'A' }) || ''));
  check('a field that already has VALNUM on an ineligible kind is not re-reported, and removing VALNUM is never blocked',
    W.valnumNewConflictReason(VAL, VAL, { usage: 'O', dataType: 'A' }) === null && W.valnumNewConflictReason(VAL, [], { usage: 'O', dataType: 'A' }) === null);
  check('Basic tab: usage B -> O on a VALNUM field is refused, "Remove VALNUM first"', /Remove VALNUM first/.test(W.valnumBasicEditConflictReason(VAL, { usage: 'B', dataType: 'Y' }, { usage: 'O' }) || ''));
  check('Basic tab: data type Y -> A on a VALNUM field is refused; usage B -> I is fine; fixing an invalid field is fine',
    /data type Y/.test(W.valnumBasicEditConflictReason(VAL, { usage: 'B', dataType: 'Y' }, { dataType: 'A' }) || '') && W.valnumBasicEditConflictReason(VAL, { usage: 'B', dataType: 'Y' }, { usage: 'I' }) === null &&
    W.valnumBasicEditConflictReason(VAL, { usage: 'O', dataType: 'Y' }, { usage: 'B' }) === null);
  check('the panel row rule for VALNUM and FLTPCN reads the spec: Y only / F only, a blank data type hides the row',
    W.keywordRequiredDataTypeAllows('VALNUM', 'Y') && !W.keywordRequiredDataTypeAllows('VALNUM', 'A') && !W.keywordRequiredDataTypeAllows('VALNUM', '') &&
    W.keywordRequiredDataTypeAllows('FLTPCN', 'F') && !W.keywordRequiredDataTypeAllows('FLTPCN', 'P') && !W.keywordRequiredDataTypeAllows('FLTPCN', ''));
}

console.log('\n=== L3/L4 the panels (jsdom) ===');
const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'I122E.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (t) => { alerts.push(String(t)); };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (e, type) => e.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const el = (id) => doc.getElementById(id);
  const has = (id) => !!el(id);
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const fieldFrom = (t, n) => (t ? DspfParser.parseDspf(t).records[0].fields.find((f) => f.name === n) : null);
  const sel = doc.getElementById('recordSelect');
  // The page applies each edit to its own copy of the source, so a field's source line moves when an
  // earlier field grows a continuation line.  Find fields by name and read the line when picking.
  const cur = {};
  const pick = (n) => {
    // The page re-renders after an edit, so select the record again before every pick (as I-122d does).
    sel.value = 'R1'; fire(sel);
    const box = doc.querySelector('.dspf-field[data-field="' + n + '"]');
    if (!box) { check('setup: ' + n + ' is on the preview canvas', false); return false; }
    cur[n] = box.getAttribute('data-source-line');
    box.click();
    posted.length = 0; alerts.length = 0;
    return true;
  };
  sel.value = 'R1'; fire(sel);
  const own = (n) => 'field-' + (cur[n] || LINE[n]);
  const toggle = (id, on) => { const e = el(id); posted.length = 0; alerts.length = 0; e.checked = on; fire(e); return lastText(); };
  const condToggle = (flagId) => doc.querySelector('.kw-cond-toggle[data-flag-id$="' + flagId + '"]');
  const applyDt = (n) => doc.querySelector('[class*="' + own(n) + '-dtfmt-apply"]');
  function rawAdd(n, name, params) {
    el(own(n) + '-new-kw-name').value = name;
    const pe = el(own(n) + '-new-kw-params'); if (pe) pe.value = params || '';
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + own(n) + '"]'), 'click');
  }
  const optValues = (id) => Array.from(el(id).options).map((o) => o.value);

  console.log('  -- date field D1 (DATFMT(*MDY) DATSEP(\'/\')) and D2 (none)');
  check('D1 and D2 are on the canvas', pick('D1') && pick('D2'));
  pick('D1');
  check('D1 offers the Date format selects and no time or float rows', has(own('D1') + '-datfmt') && has(own('D1') + '-datsep') && !has(own('D1') + '-timfmt') && !has(own('D1') + '-timsep') && !has(own('D1') + '-gen-fltpcn-on'));
  check('DATFMT select offers unspecified and the nine formats in IBM\'s order', optValues(own('D1') + '-datfmt').join('|') === '|' + KeywordSpec.validValues('DATFMT').join('|'));
  check('DATSEP select offers unspecified, *JOB, / - . , and blank', optValues(own('D1') + '-datsep').join('|') === '|' + KeywordSpec.validValues('DATSEP').join('|'));
  check('saved state on D1: *MDY and /', el(own('D1') + '-datfmt').value === '*MDY' && el(own('D1') + '-datsep').value === '/');
  check('no Conditioning toggle for the date format (option indicators not valid)', !condToggle('-datfmt') && !condToggle('-datsep'));
  {
    el(own('D1') + '-datfmt').value = '*JUL'; el(own('D1') + '-datsep').value = '-';
    posted.length = 0; fire(applyDt('D1'), 'click');
    const f = fieldFrom(lastText(), 'D1');
    check('Apply *JUL with separator - writes DATFMT(*JUL) DATSEP(\'-\') on D1 only', !!f && kwOf(f.keywords, 'DATFMT').parameters === '*JUL' && kwOf(f.keywords, 'DATSEP').parameters === "'-'" && names(fieldFrom(lastText(), 'D2').keywords).length === 0);
    pick('D1');
    check('...and the selects show *JUL and - on the next render', el(own('D1') + '-datfmt').value === '*JUL' && el(own('D1') + '-datsep').value === '-');
  }
  {
    pick('D1');
    el(own('D1') + '-datfmt').value = '*ISO'; el(own('D1') + '-datsep').value = '/';
    posted.length = 0; alerts.length = 0; fire(applyDt('D1'), 'click');
    check('Apply *ISO with a separator is refused: no edit posted', lastText() === null);
    check('...with a message naming DATSEP and DATFMT(*ISO)', alerts.some((a) => /DATSEP/.test(a) && /DATFMT\(\*ISO\)/.test(a)));
    check('...and the separator select snaps back to the saved value (-)', el(own('D1') + '-datsep').value === '-');
    pick('D1');
    el(own('D1') + '-datfmt').value = '*ISO'; el(own('D1') + '-datsep').value = '';
    posted.length = 0; fire(applyDt('D1'), 'click');
    const f = fieldFrom(lastText(), 'D1');
    check('Apply *ISO with the separator cleared is accepted: DATFMT(*ISO), no DATSEP', !!f && kwOf(f.keywords, 'DATFMT').parameters === '*ISO' && !kwOf(f.keywords, 'DATSEP'));
  }
  {
    pick('D2');
    el(own('D2') + '-datfmt').value = '*MDY'; el(own('D2') + '-datsep').value = '*JOB';
    posted.length = 0; fire(applyDt('D2'), 'click');
    const f = fieldFrom(lastText(), 'D2');
    check('D2: Apply *MDY with *JOB writes DATSEP(*JOB) bare', !!f && kwOf(f.keywords, 'DATFMT').parameters === '*MDY' && kwOf(f.keywords, 'DATSEP').parameters === '*JOB');
    pick('D2');
    el(own('D2') + '-datfmt').value = ''; el(own('D2') + '-datsep').value = '';
    posted.length = 0; fire(applyDt('D2'), 'click');
    const t = lastText();
    check('D2: Apply with both unspecified writes neither keyword (an unchanged field, nothing invented)', t === null || names(fieldFrom(t, 'D2').keywords).length === 0);
  }

  console.log('  -- time fields T1 (TIMFMT(*HMS) TIMSEP(\':\')) and T2 (TIMFMT(*ISO))');
  pick('T1');
  check('T1 offers the Time format selects and no date rows', has(own('T1') + '-timfmt') && has(own('T1') + '-timsep') && !has(own('T1') + '-datfmt') && !has(own('T1') + '-datsep'));
  check('TIMFMT select offers unspecified and five formats, no *JOB', optValues(own('T1') + '-timfmt').join('|') === '|*HMS|*ISO|*USA|*EUR|*JIS');
  check('TIMSEP select offers unspecified, *JOB, : . , and blank (no slash)', optValues(own('T1') + '-timsep').join('|') === '|' + KeywordSpec.validValues('TIMSEP').join('|'));
  check('saved state on T1: *HMS and :', el(own('T1') + '-timfmt').value === '*HMS' && el(own('T1') + '-timsep').value === ':');
  check('no Conditioning toggle for the time format', !condToggle('-timfmt') && !condToggle('-timsep'));
  {
    el(own('T1') + '-timsep').value = '.';
    posted.length = 0; fire(applyDt('T1'), 'click');
    const f = fieldFrom(lastText(), 'T1');
    check('Apply TIMSEP "." keeps TIMFMT(*HMS) and writes TIMSEP(\'.\')', !!f && kwOf(f.keywords, 'TIMFMT').parameters === '*HMS' && kwOf(f.keywords, 'TIMSEP').parameters === "'.'");
  }
  {
    pick('T2');
    check('T2 saved state: *ISO and no separator', el(own('T2') + '-timfmt').value === '*ISO' && el(own('T2') + '-timsep').value === '');
    el(own('T2') + '-timsep').value = ':';
    posted.length = 0; alerts.length = 0; fire(applyDt('T2'), 'click');
    check('TIMSEP with TIMFMT(*ISO) is refused: no edit posted', lastText() === null);
    check('...with a message naming TIMSEP and TIMFMT(*ISO)', alerts.some((a) => /TIMSEP/.test(a) && /TIMFMT\(\*ISO\)/.test(a)));
    pick('T2');
    el(own('T2') + '-timfmt').value = '*USA';
    posted.length = 0; alerts.length = 0; fire(applyDt('T2'), 'click');
    const f = fieldFrom(lastText(), 'T2');
    check('changing T2 to TIMFMT(*USA) with no separator is accepted', !!f && kwOf(f.keywords, 'TIMFMT').parameters === '*USA' && !kwOf(f.keywords, 'TIMSEP'));
  }

  console.log('  -- other data types do not get the date or time rows');
  pick('A9');
  check('a character field has no DATFMT / TIMFMT selects', !has(own('A9') + '-datfmt') && !has(own('A9') + '-datsep') && !has(own('A9') + '-timfmt') && !has(own('A9') + '-timsep'));

  console.log('  -- float field F1 (FLTPCN(*DOUBLE) FLTFIXDEC): FLTPCN needs F, FLTFIXDEC needs F and B or O');
  pick('F1');
  check('F1 shows both rows, FLTPCN with its parameter *DOUBLE and FLTFIXDEC checked', has(own('F1') + '-gen-fltpcn-on') && el(own('F1') + '-gen-fltpcn-on').checked && el(own('F1') + '-gen-fltpcn-params').value === '*DOUBLE' && el(own('F1') + '-gen-fltfixdec-on').checked);
  check('no Conditioning toggle for either (they are plain rows, the panel never offers indicators for them)', !condToggle('-gen-fltpcn') && !condToggle('-gen-fltfixdec'));
  {
    const t = toggle(own('F1') + '-gen-fltfixdec-on', false);
    const f = fieldFrom(t, 'F1');
    check('FLTFIXDEC off removes it only; FLTPCN(*DOUBLE) stays', !!f && names(f.keywords).join() === 'FLTPCN' && kwOf(f.keywords, 'FLTPCN').parameters === '*DOUBLE');
    pick('F1');
    const t2 = toggle(own('F1') + '-gen-fltfixdec-on', true);
    const f2 = fieldFrom(t2, 'F1');
    check('FLTFIXDEC on again is a bare keyword; FLTPCN kept', !!f2 && !!kwOf(f2.keywords, 'FLTFIXDEC') && kwOf(f2.keywords, 'FLTFIXDEC').parameters === '' && kwOf(f2.keywords, 'FLTPCN').parameters === '*DOUBLE');
    pick('F1');
    const t3 = toggle(own('F1') + '-gen-fltpcn-on', false);
    check('FLTPCN off removes it only', !!fieldFrom(t3, 'F1') && names(fieldFrom(t3, 'F1').keywords).join() === 'FLTFIXDEC');
  }
  ['A9', 'N1', 'D1', 'Y1'].forEach((n) => {
    pick(n);
    check(n + ' (not floating-point) has no FLTPCN and no FLTFIXDEC row', !has(own(n) + '-gen-fltpcn-on') && !has(own(n) + '-gen-fltfixdec-on'));
  });

  console.log('  -- BLANKS (N1 numeric input-capable)');
  pick('N1');
  check('N1 shows the BLANKS row checked and no Conditioning toggle (option indicators not valid)', has(own('N1') + '-inp-blanks-on') && el(own('N1') + '-inp-blanks-on').checked && !condToggle('-inp-blanks'));
  {
    const t = toggle(own('N1') + '-inp-blanks-on', false);
    check('BLANKS off removes it from N1', !!fieldFrom(t, 'N1') && names(fieldFrom(t, 'N1').keywords).length === 0);
    pick('N1');
    const t2 = toggle(own('N1') + '-inp-blanks-on', true);
    check('BLANKS on again is a bare keyword on N1; D1 keeps what the earlier step left (DATFMT(*ISO), no separator)', !!fieldFrom(t2, 'N1') && !!kwOf(fieldFrom(t2, 'N1').keywords, 'BLANKS') && kwOf(fieldFrom(t2, 'N1').keywords, 'BLANKS').parameters === '' && names(fieldFrom(t2, 'D1').keywords).join() === 'DATFMT' && kwOf(fieldFrom(t2, 'D1').keywords, 'DATFMT').parameters === '*ISO');
  }
  pick('A9');
  check('a character input field also shows the BLANKS row, unchecked', has(own('A9') + '-inp-blanks-on') && !el(own('A9') + '-inp-blanks-on').checked);
  {
    pick('N1');
    const t = (() => {
      const e = el(own('N1') + '-basic-usage') || el('p-usage');
      return e;
    })();
    el('p-usage').value = 'O';
    posted.length = 0; alerts.length = 0; fire(el('p-apply'), 'click');
    const done = lastText();
    check('Basic tab: usage B -> O on a BLANKS field is refused, naming BLANKS and usage I or B', done === null && alerts.some((a) => /BLANKS/.test(a) && /usage I or B/.test(a)));
  }

  console.log('  -- CNTFLD and FLDCSRPRG (C1, C2)');
  pick('C1');
  check('C1 shows the CNTFLD row checked with parameter 20 and no Conditioning toggle', has(own('C1') + '-gen-cntfld-on') && el(own('C1') + '-gen-cntfld-on').checked && el(own('C1') + '-gen-cntfld-params').value === '20' && !condToggle('-gen-cntfld'));
  check('C1 also shows the FLDCSRPRG row, unchecked', has(own('C1') + '-gen-fldcsrprg-on') && !el(own('C1') + '-gen-fldcsrprg-on').checked);
  pick('N1');
  check('a numeric field has no CNTFLD row (data type A only), but does have FLDCSRPRG', !has(own('N1') + '-gen-cntfld-on') && has(own('N1') + '-gen-fldcsrprg-on'));
  pick('O1');
  check('an output-only field has neither CNTFLD, FLDCSRPRG nor BLANKS rows', !has(own('O1') + '-gen-cntfld-on') && !has(own('O1') + '-gen-fldcsrprg-on') && !has(own('O1') + '-inp-blanks-on'));
  {
    pick('C1');
    el(own('C1') + '-gen-cntfld-params').value = '60';
    posted.length = 0; alerts.length = 0;
    fire(el(own('C1') + '-gen-cntfld-params'));
    const refused = lastText() === null && alerts.some((a) => /CNTFLD/.test(a) && /less than the field length \(60\)/.test(a));
    pick('C1');
    el(own('C1') + '-gen-cntfld-params').value = '30';
    posted.length = 0; alerts.length = 0;
    fire(el(own('C1') + '-gen-cntfld-params'));
    const f = fieldFrom(lastText(), 'C1');
    check('CNTFLD width equal to the length (60) is refused; 30 is accepted and written', refused && !!f && kwOf(f.keywords, 'CNTFLD').parameters === '30');
  }
  {
    pick('C2');
    check('C2 shows FLDCSRPRG checked with the parameter A9', el(own('C2') + '-gen-fldcsrprg-on').checked && el(own('C2') + '-gen-fldcsrprg-params').value === 'A9' && !condToggle('-gen-fldcsrprg'));
    el(own('C2') + '-gen-fldcsrprg-params').value = 'NOPE';
    posted.length = 0; alerts.length = 0;
    fire(el(own('C2') + '-gen-fldcsrprg-params'));
    check('FLDCSRPRG naming a field that does not exist is refused: no edit posted, message names FLDCSRPRG', lastText() === null && alerts.some((a) => /FLDCSRPRG/.test(a) && /input-capable/.test(a)));
    pick('C2');
    const t = toggle(own('C2') + '-gen-fldcsrprg-on', false);
    check('FLDCSRPRG off removes it from C2 only', !!fieldFrom(t, 'C2') && names(fieldFrom(t, 'C2').keywords).length === 0 && !!kwOf(fieldFrom(t, 'C1').keywords, 'CNTFLD'));
  }

  console.log('  -- VALNUM (Y1 with it, Y2 without; file / record rows)');
  const y1 = pick('Y1');
  if (y1) {
    check('Y1 shows the VALNUM row checked, no Conditioning toggle', has(own('Y1') + '-gen-valnum-on') && el(own('Y1') + '-gen-valnum-on').checked && !condToggle('-gen-valnum'));
    const t = toggle(own('Y1') + '-gen-valnum-on', false);
    check('VALNUM off removes it from Y1', !!fieldFrom(t, 'Y1') && names(fieldFrom(t, 'Y1').keywords).length === 0);
    pick('Y1');
    const t2 = toggle(own('Y1') + '-gen-valnum-on', true);
    check('VALNUM on again is a bare keyword on Y1', !!fieldFrom(t2, 'Y1') && !!kwOf(fieldFrom(t2, 'Y1').keywords, 'VALNUM'));
  }
  pick('A9');
  check('a character field has no VALNUM row', !has(own('A9') + '-gen-valnum-on'));
  pick('O1');
  check('an output-only field has no VALNUM row', !has(own('O1') + '-gen-valnum-on'));

  console.log('  -- raw keyword editor: what it refuses, and what it does not');
  {
    pick('N1');
    rawAdd('N1', 'FLTFIXDEC');
    check('raw-adding FLTFIXDEC to a numeric zoned field is refused: no edit, message names FLTFIXDEC and data type F', lastText() === null && alerts.some((a) => /FLTFIXDEC/.test(a) && /data type F/.test(a)));
    pick('O1');
    rawAdd('O1', 'BLANKS');
    check('raw-adding BLANKS to an output-only field is refused: message names BLANKS and usage I or B', lastText() === null && alerts.some((a) => /BLANKS/.test(a) && /usage I or B/.test(a)));
    pick('O1');
    rawAdd('O1', 'CNTFLD', '5');
    check('raw-adding CNTFLD to an output-only field is refused', lastText() === null && alerts.some((a) => /CNTFLD/.test(a)));
    pick('A9');
    rawAdd('A9', 'FLDCSRPRG', 'C2');
    const f = fieldFrom(lastText(), 'A9');
    check('raw-adding FLDCSRPRG(C2) to A9 (C2 is input-capable) is accepted and written', alerts.length === 0 && !!f && kwOf(f.keywords, 'FLDCSRPRG').parameters === 'C2');
    pick('A9');
    rawAdd('A9', 'VALNUM');
    check('raw-adding VALNUM to a character field is refused: message names VALNUM and data type Y', lastText() === null && alerts.some((a) => /VALNUM/.test(a) && /data type Y/.test(a)));
    const y2 = pick('Y2');
    if (y2) {
      rawAdd('Y2', 'VALNUM');
      const g = fieldFrom(lastText(), 'Y2');
      check('raw-adding VALNUM to Y2 (usage B, data type Y) is accepted and written', alerts.length === 0 && !!g && !!kwOf(g.keywords, 'VALNUM'));
    }
    pick('D2');
    rawAdd('D2', 'DATFMT', '*EUR');
    const d = fieldFrom(lastText(), 'D2');
    check('raw-adding DATFMT(*EUR) to the date field D2 is accepted and written', alerts.length === 0 && !!d && kwOf(d.keywords, 'DATFMT').parameters === '*EUR');
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

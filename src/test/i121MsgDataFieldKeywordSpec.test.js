/**
 * i121MsgDataFieldKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", message-data-field
 * slice. CHKMSGID's `&message-data-field`, ERRMSGID's and SFLMSGID's
 * `&msg-data` parameters each state the same rule in their own DDS
 * Reference section: "The field name must exist in the record format, and
 * the field must be defined as a character field (data type A) with usage
 * P." Previously living only as messageDataFieldProblem's hard-coded 'A' /
 * 'P' literals (I-89/I-97) plus a hand-written MSGID_MSGDATA_KEYWORDS
 * array; now one shared `msgDataField` fact on each keyword's
 * RECORD_TYPES entry.
 *
 * No behavior change: the pre-existing i89 and i97 tests must still pass
 * unchanged; this file adds the spec-level checks and pass-through checks
 * that prove the guards read the spec.
 *
 * Run with: node src/test/i121MsgDataFieldKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, params) => ({ name: name, parameters: params || '', conditions: [], raw: '', sourceLines: [] });
const fld = (name, dataType, usage, extra) => Object.assign({ name: name, nameType: 'NAMED', dataType: dataType, usage: usage, decimalPositions: '' }, extra || {});

// ===========================================================================
// Part 1 - keywordSpec.js entries
// ===========================================================================
console.log('\nkeywordSpec.js msgDataField facts');
{
  const names = ['CHKMSGID', 'ERRMSGID', 'SFLMSGID'];
  names.forEach((n) => {
    const spec = KeywordSpec.RECORD_TYPES[n];
    check(n + ' entry exists', !!spec);
    const r = spec && spec.msgDataField;
    check(n + ' rule: must exist, data type A, usage P',
      !!r && r.mustExistInRecord === true && r.dataType === 'A' && r.usage === 'P');
  });
  check('the three keywords share the identical rule object (cannot drift apart)',
    KeywordSpec.RECORD_TYPES.CHKMSGID.msgDataField === KeywordSpec.RECORD_TYPES.ERRMSGID.msgDataField &&
    KeywordSpec.RECORD_TYPES.ERRMSGID.msgDataField === KeywordSpec.RECORD_TYPES.SFLMSGID.msgDataField);

  // The citation text must really be in the DDS Reference, verbatim.
  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').replace(/\s+/g, ' ');
  const cite = KeywordSpec.RECORD_TYPES.CHKMSGID.msgDataField.ddsReference.replace(/\s+/g, ' ');
  check('ddsReference citation appears verbatim in DDS_Keyword_V7r6.txt (CHKMSGID wording)', ref.indexOf(cite) !== -1);
  check('ERRMSGID/SFLMSGID state the same rule (same sentence, "exist in the record format" + "character field (data type A) with usage P")',
    /msg-data field, if specified, contains the replacement text for the specified message\. The field must exist in the record format,? and the field must be defined as a character field \(data type A\) with usage P/.test(ref));

  check('CHKMSGID keeps its pre-existing facts (qualifying keywords, usage) alongside the new one',
    KeywordSpec.RECORD_TYPES.CHKMSGID.qualifyingNames.length === 4 &&
    KeywordSpec.definitionRequirements('CHKMSGID').usage.join() === 'I,B');
  check('ERRMSGID/SFLMSGID carry no other spec facts (their other rules are out of scope)',
    Object.keys(KeywordSpec.RECORD_TYPES.ERRMSGID).join() === 'msgDataField' &&
    Object.keys(KeywordSpec.RECORD_TYPES.SFLMSGID).join() === 'msgDataField');
}

// ===========================================================================
// Part 2 - accessors
// ===========================================================================
console.log('\nKeywordSpec.msgDataFieldRule / msgDataFieldKeywords');
{
  check('msgDataFieldRule(CHKMSGID) returns the rule', KeywordSpec.msgDataFieldRule('CHKMSGID').usage === 'P');
  check('msgDataFieldRule(ERRMSGID) returns the rule', KeywordSpec.msgDataFieldRule('ERRMSGID').dataType === 'A');
  check('msgDataFieldRule(SFLMSGID) returns the rule', KeywordSpec.msgDataFieldRule('SFLMSGID').mustExistInRecord === true);
  check('msgDataFieldRule of an unrelated keyword is null', KeywordSpec.msgDataFieldRule('TEXT') === null);
  check('msgDataFieldRule of an unknown keyword fails safe (null)', KeywordSpec.msgDataFieldRule('NOSUCHKEYWORD') === null);
  check('msgDataFieldKeywords is exactly CHKMSGID, ERRMSGID, SFLMSGID',
    KeywordSpec.msgDataFieldKeywords().slice().sort().join() === 'CHKMSGID,ERRMSGID,SFLMSGID');
  check('no other keyword in RECORD_TYPES carries msgDataField',
    Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].msgDataField).length === 3);
}

// ===========================================================================
// Part 3 - DspfWriter guards now read the spec
// ===========================================================================
console.log('\nDspfWriter.messageDataFieldProblem (spec-driven)');
{
  const fields = [
    fld('GOOD', 'A', 'P'),
    fld('OUTFLD', 'A', ''),
    fld('NUMFLD', '', 'P', { decimalPositions: '0' }),
    fld('BADBOTH', 'S', 'B'),
    fld('REFFLD', '', 'P', { isReference: true }),
    fld('CONSTFLD', 'A', 'P', { nameType: 'CONSTANT' })
  ];
  ['CHKMSGID', 'ERRMSGID', 'SFLMSGID'].forEach((n) => {
    const p = (name) => DspfWriter.messageDataFieldProblem(n, name, fields);
    check(n + ': valid field (A, usage P) -> allowed', p('&GOOD') === null);
    check(n + ': & prefix optional and case-insensitive', p('good') === null);
    check(n + ': missing field -> blocked, "does not exist"', /does not exist in this record format/.test(p('&NOPE')));
    check(n + ': output-only usage -> blocked, names usage', /its usage is blank \(output\)/.test(p('&OUTFLD')));
    check(n + ': numeric field -> blocked, "a numeric field"', /a numeric field/.test(p('&NUMFLD')));
    check(n + ': wrong type AND usage -> both issues reported', /data type S and its usage is B/.test(p('&BADBOTH')));
    check(n + ': reference field is not judged on data type', p('&REFFLD') === null);
    check(n + ': a CONSTANT of the same name is not a field', /does not exist/.test(p('&CONSTFLD')));
    check(n + ': message text derives A / P from the spec, names the keyword',
      new RegExp('^' + n + ' message data field &OUTFLD must be a character field \\(data type A\\) with usage P \\(per the DDS Reference\\)').test(p('&OUTFLD')));
    check(n + ': empty name -> allowed (nothing to check)', p('&') === null);
  });
  check('a keyword with no spec fact is not checked (fail open)', DspfWriter.messageDataFieldProblem('TEXT', '&NOPE', fields) === null);
}

console.log('\nDspfWriter diff-based guards');
{
  const fields = [fld('GOOD', 'A', 'P'), fld('OUTFLD', 'A', '')];
  const before = [k('CHKMSGID', 'MSG0001 MYMSGF &OUTFLD')];
  check('CHKMSGID: an unchanged hand-written bad name is never re-reported',
    DspfWriter.chkmsgidMsgDataNewConflictReason(before, before, fields) === null);
  check('CHKMSGID: newly naming a bad field -> blocked',
    /CHKMSGID/.test(DspfWriter.chkmsgidMsgDataNewConflictReason([k('CHKMSGID', 'MSG0001 MYMSGF')], before, fields)));
  check('CHKMSGID: newly naming a good field -> allowed',
    DspfWriter.chkmsgidMsgDataNewConflictReason([k('CHKMSGID', 'MSG0001 MYMSGF')], [k('CHKMSGID', 'MSG0001 MYMSGF &GOOD')], fields) === null);
  check('CHKMSGID: absent record field list -> fail open',
    DspfWriter.chkmsgidMsgDataNewConflictReason([], before, undefined) === null);
  check('CHKMSGID add guard: bad field -> blocked; other keyword -> null',
    /OUTFLD/.test(DspfWriter.chkmsgidMsgDataAddReason('CHKMSGID', 'MSG0001 MYMSGF &OUTFLD', fields)) &&
    DspfWriter.chkmsgidMsgDataAddReason('TEXT', 'MSG0001 MYMSGF &OUTFLD', fields) === null);

  ['ERRMSGID', 'SFLMSGID'].forEach((n) => {
    check(n + ': newly adding a bad msg-data name -> blocked, names the keyword',
      new RegExp('^' + n + ' ').test(DspfWriter.messageIdMsgDataNewConflictReason(n, [k(n, 'MSG0001 MYMSGF')], [k(n, 'MSG0001 MYMSGF &OUTFLD')], fields)));
    check(n + ': unchanged bad name is not re-reported',
      DspfWriter.messageIdMsgDataNewConflictReason(n, [k(n, 'MSG0001 MYMSGF &OUTFLD')], [k(n, 'MSG0001 MYMSGF &OUTFLD')], fields) === null);
    check(n + ': good name -> allowed',
      DspfWriter.messageIdMsgDataNewConflictReason(n, [], [k(n, 'MSG0001 MYMSGF &GOOD')], fields) === null);
    check(n + ' add guard: bad field -> blocked',
      /OUTFLD/.test(DspfWriter.messageIdMsgDataAddReason(n, 'MSG0001 MYMSGF &OUTFLD', fields)));
    check(n + ' add guard: no msg-data token -> allowed',
      DspfWriter.messageIdMsgDataAddReason(n, 'MSG0001 MYMSGF', fields) === null);
  });
  check('messageIdMsgDataAddReason ignores CHKMSGID (its own grammar, own add guard)',
    DspfWriter.messageIdMsgDataAddReason('CHKMSGID', 'MSG0001 MYMSGF &OUTFLD', fields) === null);
  check('messageIdMsgDataAddReason ignores an unrelated keyword',
    DspfWriter.messageIdMsgDataAddReason('TEXT', 'MSG0001 MYMSGF &OUTFLD', fields) === null);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

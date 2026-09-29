/**
 * i121MnubarswMnucnlKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", MNUBARSW/MNUCNL
 * slice (not to be confused with i121MnubarKeywordSpec.test.js, an earlier
 * slice about the unrelated MNUBAR whitelist).
 *
 * MNUBARSW's own DDS Reference section and MNUCNL's each state: "Within a
 * record, the CAnn key specified by [this keyword] cannot be specified
 * again using another keyword (such as [the other one])", "Because [this
 * keyword] at the file level extends to all records in the file, this
 * must be considered when assigning a CAnn key", and each documents its
 * own default CA key (MNUBARSW: CA10, MNUCNL: CA12). mnuBarKeyConflictReason
 * (I-19) hard-coded the pairing and defaults as inline ternaries. Now reads
 * keywordSpec.js's new `caKeyPartner`/`caKeyDefault` fact - a new shape,
 * deliberately not `mutex` (the two keywords ARE meant to coexist; only
 * assigning them the SAME CAnn value is disallowed).
 *
 * Verifies:
 *  1. Both spec entries: partner, default, citation, and that they carry
 *     no other rule shape.
 *  2. KeywordSpec.caKeyPartner both ways, and null for unrelated/unknown
 *     keywords.
 *  3. mnuBarKeyConflictReason unchanged: file-vs-record scoping, blank
 *     resolving to each keyword's own default, non-collisions, turning
 *     either OFF, and null/undefined-safe.
 *
 * Run with: node src/test/i121MnubarswMnucnlKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

console.log('\nRECORD_TYPES.MNUBARSW / MNUCNL');
{
  const B = KeywordSpec.RECORD_TYPES.MNUBARSW, C = KeywordSpec.RECORD_TYPES.MNUCNL;
  check('MNUBARSW entry exists', !!B);
  check('MNUCNL entry exists', !!C);
  check('MNUBARSW.caKeyPartner is MNUCNL', B && B.caKeyPartner === 'MNUCNL');
  check('MNUCNL.caKeyPartner is MNUBARSW', C && C.caKeyPartner === 'MNUBARSW');
  check('MNUBARSW default is CA10', B && B.caKeyDefault === 'CA10');
  check('MNUCNL default is CA12', C && C.caKeyDefault === 'CA12');
  check('MNUBARSW citation names both keywords', B && /MNUBARSW keyword[\s\S]*MNUCNL/.test(B.ddsReference));
  check('MNUCNL citation names both keywords', C && /MNUCNL keyword[\s\S]*MNUBARSW/.test(C.ddsReference));
  check('neither entry carries any other rule shape', [B, C].every((e) =>
    !e.mutex && !e.onePerRecord && !e.definitionRequirements && !e.qualifyingNames &&
    !e.crossRecordExclusion && !e.validOnlyInSubfileControlRecord && !e.sizeConditionedValueMustBeNumber));
}

console.log('\nKeywordSpec.caKeyPartner');
{
  check('MNUBARSW -> { partner: MNUCNL, defaultCakey: CA10 }',
    JSON.stringify(KeywordSpec.caKeyPartner('MNUBARSW')) === JSON.stringify({ partner: 'MNUCNL', defaultCakey: 'CA10' }));
  check('MNUCNL -> { partner: MNUBARSW, defaultCakey: CA12 }',
    JSON.stringify(KeywordSpec.caKeyPartner('MNUCNL')) === JSON.stringify({ partner: 'MNUBARSW', defaultCakey: 'CA12' }));
  check('an unrelated keyword returns null', KeywordSpec.caKeyPartner('MNUBAR') === null);
  check('an unknown keyword returns null', KeywordSpec.caKeyPartner('NOSUCH') === null);
  check('undefined returns null', KeywordSpec.caKeyPartner(undefined) === null);
}

console.log('\nmnuBarKeyConflictReason');
{
  const f = DspfWriter.mnuBarKeyConflictReason;
  check('a keyword with no CA-key partner is fail-safe null', f('MNUBAR', 'CA10', [], []) === null);
  check('file-level MNUCNL(CA10) blocks a new record-level MNUBARSW default (CA10)',
    /file-level MNUCNL\(CA10\)/.test(f('MNUBARSW', '', [k('MNUCNL', 'CA10')], []) || ''));
  check('file-level MNUBARSW(CA12) blocks a new record-level MNUCNL default (CA12)',
    /file-level MNUBARSW\(CA12\)/.test(f('MNUCNL', '', [k('MNUBARSW', 'CA12')], []) || ''));
  check('a record-level MNUCNL(CA05) blocks MNUBARSW(CA05) on that same record',
    /MNUCNL\(CA05\) already assigned on this record/.test(f('MNUBARSW', 'CA05', [], [[k('MNUCNL', 'CA05')]]) || ''));
  check('a DIFFERENT record\'s own MNUCNL(CA05) does not block (record scoping)',
    f('MNUBARSW', 'CA05', [], [[k('MNUCNL', 'CA06')]]) === null);
  check('blank cakey resolves to MNUBARSW\'s own CA10 default for the collision check',
    /MNUBARSW\(CA10\)/.test(f('MNUBARSW', '', [k('MNUCNL', 'CA10')], []) || ''));
  check('blank cakey resolves to MNUCNL\'s own CA12 default for the collision check',
    /MNUCNL\(CA12\)/.test(f('MNUCNL', '   ', [k('MNUBARSW', 'CA12')], []) || ''));
  check('different CA keys never collide', f('MNUBARSW', 'CA05', [], [[k('MNUCNL', 'CA06')]]) === null);
  check('no partner keyword present anywhere is fine', f('MNUBARSW', 'CA05', [], [[]]) === null);
  check('null/undefined fileKeywords and recordScopes are safe', f('MNUBARSW', 'CA05', null, null) === null);
  check('recordScopes with multiple record entries checks each', 
    /already assigned on this record/.test(f('MNUBARSW', 'CA07', [], [[k('DSPATR', 'HI')], [k('MNUCNL', 'CA07')]]) || ''));
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

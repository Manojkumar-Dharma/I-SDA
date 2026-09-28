/**
 * i121ChkmsgidKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", CHKMSGID slice.
 * chkmsgidNewConflictReason (I-69, the qualifying-keyword dependency, both
 * directions) and chkmsgidBasicEditConflictReason (I-69, the Basic-tab-
 * edit direction of the usage rule) each independently re-embedded the
 * same DDS-Reference-stated facts as their own local constants
 * (CHKMSGID_QUALIFYING_NAMES, CHKMSGID_QUALIFYING_CHECK_CODES,
 * CHKMSGID_LIST_TEXT). Now reads keywordSpec.js's own
 * `RECORD_TYPES.CHKMSGID` entry instead. (CHKMSGID's separate
 * message-data-field rule, I-89/I-97, shared with ERRMSGID/SFLMSGID, is a
 * larger web deliberately left for a future slice.)
 *
 * A genuinely new spec shape this slice introduces: a DEPENDENCY on one of
 * several qualifying keyword NAMES, or a qualifying keyword parameterized
 * with one of several specific CODES (`qualifyingNames`/
 * `qualifyingCheckKeyword`/`qualifyingCheckCodes`, consulted via the new
 * `hasQualifyingKeyword` accessor) - distinct from `mutex` (excludes) and
 * `REQUIRE_PAIRS` (a fixed single partner). The usage rule reuses the
 * PSHBTNFLD `definitionRequirements.usage` shape unchanged.
 *
 * This file verifies:
 *  1. KeywordSpec.hasQualifyingKeyword('CHKMSGID', ...) against the spec
 *     directly - each of CMP/COMP/RANGE/VALUES, each of CHECK's four
 *     qualifying codes (including a multi-token CHECK), CHECK with a
 *     non-qualifying code, no keywords at all, and an unrelated record
 *     type.
 *  2. KeywordSpec.qualifyingListText('CHKMSGID') matches the DDS Reference
 *     wording, and is '' for an unrelated record type.
 *  3. KeywordSpec.definitionRequirements('CHKMSGID').usage is ['I','B'].
 *  4. chkmsgidNewConflictReason and chkmsgidBasicEditConflictReason still
 *     agree with the spec, preserving every existing behavior.
 *
 * Run with: node src/test/i121ChkmsgidKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// Part 1 - KeywordSpec.hasQualifyingKeyword('CHKMSGID', ...)
// ===========================================================================
console.log('\nKeywordSpec.hasQualifyingKeyword(\'CHKMSGID\', ...)');
{
  ['CMP', 'COMP', 'RANGE', 'VALUES'].forEach((name) => {
    check(name + ' alone qualifies', KeywordSpec.hasQualifyingKeyword('CHKMSGID', [k(name)]));
  });
  ['M10', 'M11', 'VN', 'VNE'].forEach((code) => {
    check('CHECK(' + code + ') qualifies', KeywordSpec.hasQualifyingKeyword('CHKMSGID', [k('CHECK', code)]));
  });
  check('CHECK(ME VN) (multi-token, one qualifying) qualifies',
    KeywordSpec.hasQualifyingKeyword('CHKMSGID', [k('CHECK', 'ME VN')]));
  check('CHECK(ME) (non-qualifying code alone) does NOT qualify',
    !KeywordSpec.hasQualifyingKeyword('CHKMSGID', [k('CHECK', 'ME')]));
  check('CHECK(AB) does NOT qualify', !KeywordSpec.hasQualifyingKeyword('CHKMSGID', [k('CHECK', 'AB')]));
  check('no keywords at all does NOT qualify', !KeywordSpec.hasQualifyingKeyword('CHKMSGID', []));
  check('an unrelated keyword alone does NOT qualify', !KeywordSpec.hasQualifyingKeyword('CHKMSGID', [k('ALIAS')]));
  check('an unrelated record type never qualifies', !KeywordSpec.hasQualifyingKeyword('PSHBTNFLD', [k('CMP')]));
}

// ===========================================================================
// Part 2 - KeywordSpec.qualifyingListText / definitionRequirements
// ===========================================================================
console.log('\nKeywordSpec.qualifyingListText / definitionRequirements');
{
  check('qualifyingListText(\'CHKMSGID\') matches the DDS Reference wording',
    KeywordSpec.qualifyingListText('CHKMSGID') === 'CHECK(M10), CHECK(M11), CHECK(VN), CHECK(VNE), CMP, COMP, RANGE, or VALUES');
  check('qualifyingListText of an unrelated record type is \'\'', KeywordSpec.qualifyingListText('PSHBTNFLD') === '');

  const req = KeywordSpec.definitionRequirements('CHKMSGID');
  check('definitionRequirements(\'CHKMSGID\').usage is exactly [I, B]',
    req.usage.length === 2 && req.usage.indexOf('I') !== -1 && req.usage.indexOf('B') !== -1);
}

// ===========================================================================
// Part 3 - DspfWriter.chkmsgidNewConflictReason (I-69)
// ===========================================================================
console.log('\nDspfWriter.chkmsgidNewConflictReason');
{
  check('CHKMSGID newly added alongside CMP is allowed',
    !DspfWriter.chkmsgidNewConflictReason([], [k('CMP'), k('CHKMSGID')]));
  check('CHKMSGID newly added with no qualifier is blocked',
    !!DspfWriter.chkmsgidNewConflictReason([], [k('CHKMSGID')]));
  check('CHKMSGID newly added alongside a pre-existing qualifier is allowed',
    !DspfWriter.chkmsgidNewConflictReason([k('RANGE')], [k('RANGE'), k('CHKMSGID')]));
  check('removing the last qualifier while CHKMSGID stays is blocked',
    !!DspfWriter.chkmsgidNewConflictReason([k('CHKMSGID'), k('VALUES')], [k('CHKMSGID')]));
  check('removing one of several qualifiers, keeping at least one, is allowed',
    !DspfWriter.chkmsgidNewConflictReason([k('CHKMSGID'), k('CMP'), k('COMP')], [k('CHKMSGID'), k('CMP')]));
  check('removing CHKMSGID and its qualifier together is allowed',
    !DspfWriter.chkmsgidNewConflictReason([k('CHKMSGID'), k('CMP')], []));
  check('a field with no CHKMSGID before or after is untouched',
    !DspfWriter.chkmsgidNewConflictReason([k('ALIAS')], [k('ALIAS'), k('TEXT')]));
  check('a pre-existing (hand-written) invalid CHKMSGID is not re-reported on an unrelated edit',
    !DspfWriter.chkmsgidNewConflictReason([k('CHKMSGID')], [k('CHKMSGID'), k('TEXT')]));
}

// ===========================================================================
// Part 4 - DspfWriter.chkmsgidBasicEditConflictReason (I-69)
// ===========================================================================
console.log('\nDspfWriter.chkmsgidBasicEditConflictReason');
{
  const withChkmsgid = [k('CHKMSGID'), k('CMP')];

  check('a field without CHKMSGID is never affected',
    !DspfWriter.chkmsgidBasicEditConflictReason([k('ALIAS')], 'I', 'O'));
  check('changing usage from I to O on a field with CHKMSGID is blocked',
    !!DspfWriter.chkmsgidBasicEditConflictReason(withChkmsgid, 'I', 'O'));
  check('changing usage from I to B on a field with CHKMSGID is allowed',
    !DspfWriter.chkmsgidBasicEditConflictReason(withChkmsgid, 'I', 'B'));
  check('leaving usage unchanged is allowed',
    !DspfWriter.chkmsgidBasicEditConflictReason(withChkmsgid, 'I', 'I'));
  check('an already-invalid usage left unchanged is not re-reported',
    !DspfWriter.chkmsgidBasicEditConflictReason(withChkmsgid, 'O', 'O'));
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

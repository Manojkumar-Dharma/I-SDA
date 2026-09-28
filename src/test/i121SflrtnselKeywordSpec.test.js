/**
 * i121SflrtnselKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLRTNSEL slice.
 * sflrtnselNewConflictReason (I-81) hard-coded SFLRTNSEL's own DDS-
 * Reference-stated dependency ("If this keyword is specified then
 * SFLMLTCHC or SFLSNGCHC must be specified") as two literal names. Now
 * reads keywordSpec.js's `RECORD_TYPES.SFLRTNSEL` entry via the existing
 * CHKMSGID `qualifyingNames` shape (no new shape needed).
 *
 * Verifies:
 *  1. KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', ...) against the spec.
 *  2. KeywordSpec.qualifyingListText('SFLRTNSEL') and the entry's citation.
 *  3. The entry carries no CHECK-code variant and no usage requirement.
 *  4. sflrtnselNewConflictReason still agrees with the spec in both
 *     directions, with its exact pre-existing wording and fail-open case.
 *
 * Run with: node src/test/i121SflrtnselKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

console.log('\nKeywordSpec.hasQualifyingKeyword(\'SFLRTNSEL\', ...)');
{
  check('SFLSNGCHC qualifies', KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [k('SFLSNGCHC')]));
  check('SFLMLTCHC qualifies', KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [k('SFLMLTCHC')]));
  check('both together qualify', KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [k('SFLSNGCHC'), k('SFLMLTCHC')]));
  check('no keywords does NOT qualify', !KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', []));
  check('undefined keywords does NOT qualify', !KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', undefined));
  check('SFLRTNSEL alone does NOT qualify', !KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [k('SFLRTNSEL')]));
  check('unrelated keywords (SFLCHCCTL, CHECK(VN)) do NOT qualify',
    !KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [k('SFLCHCCTL'), k('CHECK', 'VN')]));
  check('an unrelated record type returns false', !KeywordSpec.hasQualifyingKeyword('USRDFN', [k('SFLSNGCHC')]));
}

console.log('\nSFLRTNSEL spec entry');
{
  check('qualifyingListText', KeywordSpec.qualifyingListText('SFLRTNSEL') === 'SFLSNGCHC or SFLMLTCHC');
  check('qualifyingListText is empty for an unrelated type', KeywordSpec.qualifyingListText('USRDFN') === '');
  const e = KeywordSpec.RECORD_TYPES && KeywordSpec.RECORD_TYPES.SFLRTNSEL;
  check('entry exists in RECORD_TYPES', !!e);
  if (e) {
    check('citation states the DDS Reference sentence', /SFLMLTCHC or SFLSNGCHC must be specified/.test(e.ddsReference));
    check('no CHECK-code variant', !e.qualifyingCheckKeyword && !e.qualifyingCheckCodes);
    check('no definitionRequirements', !e.definitionRequirements);
  }
}

console.log('\nsflrtnselNewConflictReason');
{
  const f = DspfWriter.sflrtnselNewConflictReason;
  check('adding SFLRTNSEL with no choice keyword is blocked',
    /requires SFLSNGCHC or SFLMLTCHC/.test(f([], [k('SFLRTNSEL')]) || ''));
  check('adding SFLRTNSEL alongside SFLMLTCHC is fine', f([k('SFLMLTCHC')], [k('SFLMLTCHC'), k('SFLRTNSEL')]) === null);
  check('adding SFLRTNSEL alongside SFLSNGCHC is fine', f([k('SFLSNGCHC')], [k('SFLSNGCHC'), k('SFLRTNSEL')]) === null);
  check('removing the last choice keyword while SFLRTNSEL stays is blocked',
    /cannot be removed while the record carries SFLRTNSEL/.test(f([k('SFLSNGCHC'), k('SFLRTNSEL')], [k('SFLRTNSEL')]) || ''));
  check('switching SFLSNGCHC for SFLMLTCHC is fine',
    f([k('SFLSNGCHC'), k('SFLRTNSEL')], [k('SFLMLTCHC'), k('SFLRTNSEL')]) === null);
  check('removing one of two choice keywords is fine',
    f([k('SFLSNGCHC'), k('SFLMLTCHC'), k('SFLRTNSEL')], [k('SFLMLTCHC'), k('SFLRTNSEL')]) === null);
  check('removing SFLRTNSEL together with the choice keyword is fine',
    f([k('SFLSNGCHC'), k('SFLRTNSEL')], []) === null);
  check('already-invalid record is not re-reported on an unrelated edit',
    f([k('SFLRTNSEL')], [k('SFLRTNSEL'), k('SFLPAG', '5')]) === null);
  check('fixing an already-invalid record is allowed', f([k('SFLRTNSEL')], [k('SFLRTNSEL'), k('SFLMLTCHC')]) === null);
  check('no SFLRTNSEL anywhere is null', f([k('SFLSNGCHC')], []) === null);
  check('null/undefined arguments do not throw', f(undefined, undefined) === null);
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

/**
 * i121ChridKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", CHRID slice.
 * chridNewConflictReason (I-59, the field-eligibility rule and its DUP
 * mutex) and chridBasicEditConflictReason (I-73, the Basic-tab-edit
 * direction of the same eligibility rule) each independently re-embedded
 * the same DDS-Reference-stated facts as their own local constants
 * (CHRID_USAGE_LABELS, CHRID_NUMERIC_TEXT, CHRID_DUP_TEXT). Now reads
 * keywordSpec.js's own `RECORD_TYPES.CHRID` entry instead.
 *
 * A genuinely new spec shape this slice introduces: field-ELIGIBILITY
 * restrictions (`ineligibleUsage`, `ineligibleWhenDecimalsSpecified`,
 * `ineligibleOnConstant`) - what a field carrying this keyword must NOT
 * be, as opposed to `whitelist` (keyword-vs-keyword membership) or
 * `definitionRequirements` (what a field carrying it MUST be). The
 * DUP mutex reuses the existing `mutex`/`isMutex` shape unchanged.
 *
 * This file verifies:
 *  1. KeywordSpec.ineligibleUsageLabel/ineligibleWhenDecimalsSpecified/
 *     ineligibleOnConstant against the spec directly, plus their null
 *     cases for a record type with no such rule.
 *  2. KeywordSpec.isMutex('CHRID', 'DUP') is true.
 *  3. chridNewConflictReason and chridBasicEditConflictReason still agree
 *     with the spec, preserving every existing behavior (constant fields,
 *     each of H/M/P usage, decimal positions specified, the DUP pairing
 *     in both directions, and the diff-based "not re-reported" cases).
 *
 * Run with: node src/test/i121ChridKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// Part 1 - KeywordSpec ineligibility accessors
// ===========================================================================
console.log('\nKeywordSpec ineligibility accessors');
{
  check('ineligibleUsageLabel(\'CHRID\', \'H\') is "hidden (H)"', KeywordSpec.ineligibleUsageLabel('CHRID', 'H') === 'hidden (H)');
  check('ineligibleUsageLabel(\'CHRID\', \'M\') is "message (M)"', KeywordSpec.ineligibleUsageLabel('CHRID', 'M') === 'message (M)');
  check('ineligibleUsageLabel(\'CHRID\', \'P\') is "program-to-system (P)"', KeywordSpec.ineligibleUsageLabel('CHRID', 'P') === 'program-to-system (P)');
  check('ineligibleUsageLabel(\'CHRID\', \'I\') is null (input is fine)', KeywordSpec.ineligibleUsageLabel('CHRID', 'I') === null);
  check('ineligibleUsageLabel(\'CHRID\', \'O\') is null (output is fine)', KeywordSpec.ineligibleUsageLabel('CHRID', 'O') === null);
  check('ineligibleUsageLabel(\'CHRID\', \'\') is null (blank/unspecified is fine)', KeywordSpec.ineligibleUsageLabel('CHRID', '') === null);
  check('ineligibleUsageLabel is case-insensitive', KeywordSpec.ineligibleUsageLabel('CHRID', 'h') === 'hidden (H)');
  check('ineligibleUsageLabel of a record type with no rule is null', KeywordSpec.ineligibleUsageLabel('NOSUCHTYPE', 'H') === null);

  check('ineligibleWhenDecimalsSpecified(\'CHRID\') is true', KeywordSpec.ineligibleWhenDecimalsSpecified('CHRID') === true);
  check('ineligibleWhenDecimalsSpecified of an unrelated type is false', KeywordSpec.ineligibleWhenDecimalsSpecified('PSHBTNFLD') === false);

  check('ineligibleOnConstant(\'CHRID\') is true', KeywordSpec.ineligibleOnConstant('CHRID') === true);
  check('ineligibleOnConstant of an unrelated type is false', KeywordSpec.ineligibleOnConstant('PSHBTNFLD') === false);

  check('isMutex(\'CHRID\', \'DUP\') is true', KeywordSpec.isMutex('CHRID', 'DUP') === true);
  check('isMutex(\'CHRID\', \'ALIAS\') is false', KeywordSpec.isMutex('CHRID', 'ALIAS') === false);
}

// ===========================================================================
// Part 2 - DspfWriter.chridNewConflictReason (I-59)
// ===========================================================================
console.log('\nDspfWriter.chridNewConflictReason');
{
  const ctx = function (overrides) { return Object.assign({ usage: 'I', decimalPositions: null, isConstant: false }, overrides); };

  check('CHRID newly added to an eligible field is allowed',
    !DspfWriter.chridNewConflictReason([], [k('CHRID')], ctx()));
  check('CHRID newly added to a constant field is blocked',
    !!DspfWriter.chridNewConflictReason([], [k('CHRID')], ctx({ isConstant: true })));
  check('CHRID newly added to a usage-H field is blocked',
    !!DspfWriter.chridNewConflictReason([], [k('CHRID')], ctx({ usage: 'H' })));
  check('CHRID newly added to a usage-M field is blocked',
    !!DspfWriter.chridNewConflictReason([], [k('CHRID')], ctx({ usage: 'M' })));
  check('CHRID newly added to a usage-P field is blocked',
    !!DspfWriter.chridNewConflictReason([], [k('CHRID')], ctx({ usage: 'P' })));
  check('CHRID newly added to a field with decimal positions specified is blocked',
    !!DspfWriter.chridNewConflictReason([], [k('CHRID')], ctx({ decimalPositions: 2 })));
  check('CHRID newly added alongside a newly-added DUP is blocked',
    !!DspfWriter.chridNewConflictReason([], [k('CHRID'), k('DUP')], ctx()));
  check('CHRID newly added alongside a pre-existing DUP is blocked',
    !!DspfWriter.chridNewConflictReason([k('DUP')], [k('DUP'), k('CHRID')], ctx()));
  check('DUP newly added to a field that already had CHRID is blocked',
    !!DspfWriter.chridNewConflictReason([k('CHRID')], [k('CHRID'), k('DUP')], ctx()));
  check('a field with CHRID and DUP both already present (unchanged) is not re-reported',
    !DspfWriter.chridNewConflictReason([k('CHRID'), k('DUP')], [k('CHRID'), k('DUP')], ctx()));
  check('an edit unrelated to CHRID/DUP is untouched',
    !DspfWriter.chridNewConflictReason([k('ALIAS')], [k('ALIAS'), k('TEXT')], ctx()));
}

// ===========================================================================
// Part 3 - DspfWriter.chridBasicEditConflictReason (I-73)
// ===========================================================================
console.log('\nDspfWriter.chridBasicEditConflictReason');
{
  const withChrid = [k('CHRID')];
  const baseField = { usage: 'I', decimalPositions: null };

  check('a field without CHRID is never affected',
    !DspfWriter.chridBasicEditConflictReason([k('ALIAS')], baseField, { usage: 'H' }));
  check('changing usage to H on a field with CHRID is blocked',
    !!DspfWriter.chridBasicEditConflictReason(withChrid, baseField, { usage: 'H' }));
  check('changing usage to M on a field with CHRID is blocked',
    !!DspfWriter.chridBasicEditConflictReason(withChrid, baseField, { usage: 'M' }));
  check('changing usage to P on a field with CHRID is blocked',
    !!DspfWriter.chridBasicEditConflictReason(withChrid, baseField, { usage: 'P' }));
  check('changing usage to O on a field with CHRID is allowed',
    !DspfWriter.chridBasicEditConflictReason(withChrid, baseField, { usage: 'O' }));
  check('specifying decimal positions on a field with CHRID is blocked',
    !!DspfWriter.chridBasicEditConflictReason(withChrid, baseField, { decimalPositions: 2 }));
  check('an edit that does not touch usage or decimalPositions is allowed',
    !DspfWriter.chridBasicEditConflictReason(withChrid, baseField, { text: 'x' }));
  check('leaving decimalPositions unspecified is allowed',
    !DspfWriter.chridBasicEditConflictReason(withChrid, baseField, { decimalPositions: '' }));
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

/**
 * i121SflscrollKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLSCROLL slice.
 * SFLSCROLL's own DDS Reference section (line ~12311) states "You cannot
 * specify the SFLROLVAL, the SFLSCROLL and the SFLRCDNBR keywords for the
 * same field. Only one SFLSCROLL keyword is allowed in the subfile
 * control record." - previously living only as sflScrollFieldConflictReason
 * (I-26)'s own hard-coded literals. Flagged as a deferred finding by the
 * SFLCHCCTL slice.
 *
 * No new spec shapes: `mutex` (SFLROLVAL, SFLRCDNBR) reuses the plain
 * same-field mutex shape CHRID's own DUP entry established; `onePerRecord`
 * reuses SFLCHCCTL's shape unchanged.
 *
 * Two further rules in SFLSCROLL's own DDS Reference section are
 * deliberately NOT part of this entry, because neither is enforced
 * anywhere in the codebase today (the field-shape requirement, and
 * "SFLSCROLL is not allowed when SFLSIZ equals SFLPAG") - adding them
 * would be new behavior, not the pure refactor of EXISTING enforcement
 * this task is scoped to. Both logged fresh in the Deferred findings
 * table.
 *
 * This file verifies:
 *  1. keywordSpec.js's SFLSCROLL entry carries the right facts.
 *  2. KeywordSpec.isMutex/isOnePerRecord agree with that entry, and fail
 *     safe (false) for an unrelated or unknown keyword.
 *  3. DspfWriter.sflScrollFieldConflictReason still agrees with the spec,
 *     preserving every existing behavior and message string - the I-26
 *     test file already covers this in depth and must still pass
 *     unchanged; this file only adds the spec-level checks and a handful
 *     of representative pass-through checks.
 *
 * Run with: node src/test/i121SflscrollKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, params) => ({ name: name, parameters: params || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// Part 1 - keywordSpec.js RECORD_TYPES.SFLSCROLL entry
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.SFLSCROLL');
{
  const spec = KeywordSpec.RECORD_TYPES.SFLSCROLL;
  check('entry exists', !!spec);
  check('onePerRecord is true', spec.onePerRecord === true);
  check('mutex names SFLROLVAL and SFLRCDNBR, nothing else',
    Array.isArray(spec.mutex) && spec.mutex.length === 2 &&
    spec.mutex.indexOf('SFLROLVAL') !== -1 && spec.mutex.indexOf('SFLRCDNBR') !== -1);
  check('carries no definitionRequirements or mustBeFirstField (neither rule is enforced today)',
    spec.definitionRequirements === undefined && spec.mustBeFirstField === undefined);
  const flaggedOnePerRecord = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].onePerRecord);
  check('SFLCHCCTL and SFLSCROLL are the only RECORD_TYPES entries carrying onePerRecord',
    flaggedOnePerRecord.length === 2 && flaggedOnePerRecord.indexOf('SFLCHCCTL') !== -1 && flaggedOnePerRecord.indexOf('SFLSCROLL') !== -1);
}

// ===========================================================================
// Part 2 - KeywordSpec accessor functions
// ===========================================================================
console.log('\nKeywordSpec.isMutex / isOnePerRecord');
{
  check('isMutex(\'SFLSCROLL\', \'SFLROLVAL\') is true', KeywordSpec.isMutex('SFLSCROLL', 'SFLROLVAL') === true);
  check('isMutex(\'SFLSCROLL\', \'SFLRCDNBR\') is true', KeywordSpec.isMutex('SFLSCROLL', 'SFLRCDNBR') === true);
  check('isMutex(\'SFLSCROLL\', \'TEXT\') is false', KeywordSpec.isMutex('SFLSCROLL', 'TEXT') === false);
  check('isMutex(\'SFLROLVAL\', \'SFLSCROLL\') is false (the fact lives only on the SFLSCROLL side, matching every other mutex entry\'s own one-directional modeling)',
    KeywordSpec.isMutex('SFLROLVAL', 'SFLSCROLL') === false);

  check('isOnePerRecord(\'SFLSCROLL\') is true', KeywordSpec.isOnePerRecord('SFLSCROLL') === true);
  check('isOnePerRecord of an unrelated keyword is false', KeywordSpec.isOnePerRecord('TEXT') === false);
  check('isOnePerRecord of an unknown keyword fails safe (false)', KeywordSpec.isOnePerRecord('NOSUCHKEYWORD') === false);
}

// ===========================================================================
// Part 3 - DspfWriter.sflScrollFieldConflictReason still agrees with the spec
// ===========================================================================
console.log('\nDspfWriter.sflScrollFieldConflictReason (now spec-driven)');
{
  const f = DspfWriter.sflScrollFieldConflictReason;
  check('no conflicts -> allowed (empty string)', f([], []) === '');
  check('SFLROLVAL on the same field -> blocked, names SFLROLVAL', /SFLROLVAL/.test(f([k('SFLROLVAL')], [])));
  check('SFLRCDNBR on the same field -> blocked, names SFLRCDNBR', /SFLRCDNBR/.test(f([k('SFLRCDNBR')], [])));
  check('an unrelated field-level keyword -> allowed (empty string)', f([k('DSPATR')], []) === '');
  check('a sibling field already has SFLSCROLL -> blocked, names "Only one"',
    /Only one SFLSCROLL/.test(f([], [[k('SFLSCROLL')]])));
  check('no sibling has SFLSCROLL -> allowed (empty string)', f([], [[k('DSPATR')]]) === '');
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

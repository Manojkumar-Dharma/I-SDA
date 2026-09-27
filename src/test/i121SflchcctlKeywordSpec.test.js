/**
 * i121SflchcctlKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLCHCCTL slice.
 * SFLCHCCTL's own DDS Reference section (line ~10566) states four
 * independent rules, previously spread across sflchcctlDefinitionUpdates
 * (I-79, the field-shape rule), sflchcctlFieldConflictReason (I-79's own
 * first-field/one-per-record pair, plus I-86's SFLNXTCHG cross-check),
 * sflNxtchgSflchcctlConflictReason/sflctlNxtchgSflchcctlConflictReason
 * (I-86, the SFLNXTCHG-side direction), and sflchcctlReorderConflictReason
 * (I-87, the reorder direction of the first-field rule) - each
 * independently re-embedding the same DDS-Reference-stated facts as bare
 * literals.
 *
 * Two genuinely new spec shapes this slice introduces:
 *  - `mustBeFirstField` - a plain boolean flag ("this keyword's field must
 *    be the first named field defined in its record").
 *  - `onePerRecord` - a plain boolean flag ("only one field in the whole
 *    record may carry this keyword").
 * `definitionRequirements` (Y/1/0/H) and `mutex` (SFLNXTCHG) both reuse
 * existing shapes unchanged.
 *
 * This file verifies:
 *  1. keywordSpec.js's SFLCHCCTL entry carries the right facts.
 *  2. KeywordSpec.mustBeFirstField/isOnePerRecord/isMutex/
 *     definitionRequirements agree with that entry, and fail safe (false/
 *     null) for an unrelated or unknown keyword.
 *  3. DspfWriter.sflchcctlDefinitionUpdates, sflchcctlFieldConflictReason,
 *     sflNxtchgSflchcctlConflictReason, sflctlNxtchgSflchcctlConflictReason
 *     and sflchcctlReorderConflictReason all still agree with the spec,
 *     preserving every existing behavior and message string - the I-79/
 *     I-86/I-87 test files already cover these in depth and must still
 *     pass unchanged; this file only adds the spec-level checks and a
 *     handful of representative pass-through checks.
 *
 * Run with: node src/test/i121SflchcctlKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, params) => ({ name: name, parameters: params || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// Part 1 - keywordSpec.js RECORD_TYPES.SFLCHCCTL entry
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.SFLCHCCTL');
{
  const spec = KeywordSpec.RECORD_TYPES.SFLCHCCTL;
  check('entry exists', !!spec);
  check('mustBeFirstField is true', spec.mustBeFirstField === true);
  check('onePerRecord is true', spec.onePerRecord === true);
  check('mutex names SFLNXTCHG', Array.isArray(spec.mutex) && spec.mutex.indexOf('SFLNXTCHG') !== -1 && spec.mutex.length === 1);
  check('definitionRequirements is Y/1/0/H', spec.definitionRequirements.dataType === 'Y' &&
    spec.definitionRequirements.length === 1 &&
    spec.definitionRequirements.decimalPositions === 0 &&
    spec.definitionRequirements.usage.length === 1 && spec.definitionRequirements.usage[0] === 'H' &&
    spec.definitionRequirements.usageDefault === 'H');

  const flaggedFirst = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].mustBeFirstField);
  check('no RECORD_TYPES entry other than SFLCHCCTL carries mustBeFirstField', flaggedFirst.length === 1 && flaggedFirst[0] === 'SFLCHCCTL');
  const flaggedOnePerRecord = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].onePerRecord);
  check('no RECORD_TYPES entry other than SFLCHCCTL carries onePerRecord', flaggedOnePerRecord.length === 1 && flaggedOnePerRecord[0] === 'SFLCHCCTL');
}

// ===========================================================================
// Part 2 - KeywordSpec accessor functions
// ===========================================================================
console.log('\nKeywordSpec.mustBeFirstField / isOnePerRecord / isMutex / definitionRequirements');
{
  check('mustBeFirstField(\'SFLCHCCTL\') is true', KeywordSpec.mustBeFirstField('SFLCHCCTL') === true);
  check('mustBeFirstField of an unrelated keyword is false', KeywordSpec.mustBeFirstField('TEXT') === false);
  check('mustBeFirstField of an unknown keyword fails safe (false)', KeywordSpec.mustBeFirstField('NOSUCHKEYWORD') === false);

  check('isOnePerRecord(\'SFLCHCCTL\') is true', KeywordSpec.isOnePerRecord('SFLCHCCTL') === true);
  check('isOnePerRecord of an unrelated keyword is false', KeywordSpec.isOnePerRecord('TEXT') === false);
  check('isOnePerRecord of an unknown keyword fails safe (false)', KeywordSpec.isOnePerRecord('NOSUCHKEYWORD') === false);

  check('isMutex(\'SFLCHCCTL\', \'SFLNXTCHG\') is true', KeywordSpec.isMutex('SFLCHCCTL', 'SFLNXTCHG') === true);
  check('isMutex(\'SFLCHCCTL\', \'TEXT\') is false', KeywordSpec.isMutex('SFLCHCCTL', 'TEXT') === false);
  check('isMutex(\'SFLNXTCHG\', \'SFLCHCCTL\') is false (the fact lives only on the SFLCHCCTL side, matching DSPMOD/SFL\'s own one-directional modeling)', KeywordSpec.isMutex('SFLNXTCHG', 'SFLCHCCTL') === false);

  const req = KeywordSpec.definitionRequirements('SFLCHCCTL');
  check('definitionRequirements(\'SFLCHCCTL\') matches the entry', req.dataType === 'Y' && req.length === 1 && req.decimalPositions === 0 && req.usage.indexOf('H') !== -1);
}

// ===========================================================================
// Part 3 - DspfWriter functions still agree with the spec
// ===========================================================================
console.log('\nDspfWriter.sflchcctlDefinitionUpdates (now spec-driven)');
{
  const f = DspfWriter.sflchcctlDefinitionUpdates;
  check('already-correct shape (Y/1/0/H) needs no updates', f({ dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' }) === null);
  check('everything wrong is corrected to Y/1/0/H', (() => {
    const u = f({ dataType: 'A', length: 4, decimalPositions: 2, usage: 'O' });
    return u.dataType === 'Y' && u.length === 1 && u.decimalPositions === 0 && u.usage === 'H';
  })());
}

console.log('\nDspfWriter.sflchcctlFieldConflictReason (now spec-driven)');
{
  const f = DspfWriter.sflchcctlFieldConflictReason;
  check('not the first field -> blocked, names "first field"', /first field/.test(f(false, [])));
  check('first field, no conflicts -> allowed (empty string)', f(true, [], []) === '');
  check('a sibling already has SFLCHCCTL -> blocked, names "Only one"', /Only one SFLCHCCTL/.test(f(true, [[k('SFLCHCCTL')]], [])));
  check('record already has SFLNXTCHG -> blocked, names SFLNXTCHG', /SFLNXTCHG/.test(f(true, [], [k('SFLNXTCHG')])));
}

console.log('\nDspfWriter.sflNxtchgSflchcctlConflictReason / sflctlNxtchgSflchcctlConflictReason (now spec-driven)');
{
  const f = DspfWriter.sflNxtchgSflchcctlConflictReason;
  check('no field has SFLCHCCTL -> allowed (empty string)', f([]) === '');
  check('a field has SFLCHCCTL -> blocked, names SFLNXTCHG', /SFLNXTCHG cannot be added/.test(f([[k('SFLCHCCTL')]])));

  const ctl = DspfWriter.sflctlNxtchgSflchcctlConflictReason;
  const fld = (kws) => ({ name: 'F', keywords: kws });
  const records = [{ name: 'DTLX', fields: [fld([k('SFLCHCCTL')]), fld([])] }];
  check('SFLCTL pointing at a record with an SFLCHCCTL field -> blocked (delegates to the same spec fact)',
    /SFLNXTCHG cannot be added/.test(ctl([k('SFLCTL', 'DTLX')], records)));
}

console.log('\nDspfWriter.sflchcctlReorderConflictReason (now gated on mustBeFirstField)');
{
  const f = DspfWriter.sflchcctlReorderConflictReason;
  const field = (name, line, keywords) => ({ name, sourceLine: line, nameType: '', keywords: keywords || [] });
  const CHG = (line) => field('CHG', line, [k('SFLCHCCTL')]);
  const rec = { fields: [CHG(10), field('F2', 20), field('F3', 30)] };
  check('moving another field ahead of SFLCHCCTL is still blocked', !!f(rec, [20, 10, 30]));
  check('an unchanged order is still allowed', f(rec, [10, 20, 30]) === null);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

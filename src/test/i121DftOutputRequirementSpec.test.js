/**
 * i121DftOutputRequirementSpec.test.js
 *
 * Task I-121 (DFT output-requirement slice) - dftOutputRequirementNote (L83)
 * hard-coded the output usages (O/B) and the two companion keyword names
 * (PUTOVR at record level, OVRDTA at field level). They are now the spec
 * fact RECORD_TYPES.DFT.outputRequirement, read through
 * KeywordSpec.outputRequirement. Pure refactor: the note's text and its
 * advisory-only nature are unchanged (dspfWriter.test.js still covers the
 * L83 behavior; this file covers the spec and the equivalence).
 *
 * Run with: node src/test/i121DftOutputRequirementSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const kw = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

console.log('=== 1. spec ===');
{
  const r = KeywordSpec.outputRequirement('DFT');
  check('DFT has an output requirement', !!r);
  check('it applies to usages O and B only', JSON.stringify(r.usages) === '["O","B"]');
  check('record-level companion is PUTOVR, field-level is OVRDTA', r.recordKeyword === 'PUTOVR' && r.fieldKeyword === 'OVRDTA');
  check('it carries the DDS Reference citation', /^For output-only and input\/output fields, you must also specify PUTOVR at the record level and OVRDTA at the field level with the DFT keyword\.$/.test(r.ddsReference));
  r.usages.push('X'); r.recordKeyword = 'ZZZ';
  const again = KeywordSpec.outputRequirement('DFT');
  check('the accessor returns a copy (mutating it does not change the spec)', again.usages.length === 2 && again.recordKeyword === 'PUTOVR');
  check('a keyword without the rule (DFTVAL) has none', KeywordSpec.outputRequirement('DFTVAL') === null);
  check('an unknown keyword has none', KeywordSpec.outputRequirement('NOSUCH') === null);
  check('DFT kept its floating-point flag', KeywordSpec.isNotAllowedOnFloatingPointField('DFT') === true);
}

console.log('=== 2. the note (behavior unchanged) ===');
{
  const f = DspfWriter.dftOutputRequirementNote;
  check('both missing on O: names both, record level first, exact wording',
    f('O', [], []) === 'DFT on an output-capable field also requires PUTOVR (record level) and OVRDTA (field level) (per the DDS Reference).');
  check('only OVRDTA missing on B', f('B', [], [kw('PUTOVR')]) === 'DFT on an output-capable field also requires OVRDTA (field level) (per the DDS Reference).');
  check('only PUTOVR missing on O', f('O', [kw('OVRDTA')], []) === 'DFT on an output-capable field also requires PUTOVR (record level) (per the DDS Reference).');
  check('both present: no note', f('O', [kw('OVRDTA')], [kw('PUTOVR')]) === null && f('B', [kw('OVRDTA')], [kw('PUTOVR')]) === null);
  check('I, H, P, blank and undefined usages are exempt', ['I', 'H', 'P', 'i', '', undefined].every((u) => f(u, [], []) === null));
  check('lowercase o / b are still output-capable', !!f('o', [], []) && !!f('b', [], []));
  check('the keywords are matched by name only (a field-level PUTOVR does not satisfy the record-level one)', /PUTOVR \(record level\)/.test(f('O', [kw('PUTOVR'), kw('OVRDTA')], []) || ''));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

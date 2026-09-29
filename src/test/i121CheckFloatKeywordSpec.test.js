/**
 * i121CheckFloatKeywordSpec.test.js
 *
 * Task I-121 (CHECK(AB) floating-point slice) - CHECK gets its first
 * keywordSpec.js entry, carrying the token-qualified fact
 * `notAllowedOnFloatingPointCodes: ['AB']` (CHECK's own DDS Reference
 * section: "You cannot specify the CHECK(AB) keyword on a floating-point
 * field (F in position 35)"), and checkAbFloatIncompatibleNewConflictReason
 * reads it instead of a hard-coded 'AB'. Pure refactor, no behavior change.
 *
 *  1. the spec entry: codes, citation, and that CHECK is NOT flagged with
 *     the whole-keyword notAllowedOnFloatingPointField (that would block
 *     every CHECK code on an F field).
 *  2. floatIncompatibleCheckCodes accessor: copy semantics, unknown and
 *     unrelated keywords give [].
 *  3. the guard, unchanged in behavior: AB blocked both directions, other
 *     codes never, multi-code instance, fail-open on an already-invalid
 *     field, non-CHECK keywords ignored.
 *
 * Run with: node src/test/i121CheckFloatKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

function kw(name, parameters) {
  return { name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] };
}

console.log('=== 1. RECORD_TYPES.CHECK ===');
{
  const spec = KeywordSpec.RECORD_TYPES.CHECK;
  check('CHECK has a spec entry', !!spec);
  check('CHECK forbids exactly the AB code on a floating-point field',
    Array.isArray(spec.notAllowedOnFloatingPointCodes) && spec.notAllowedOnFloatingPointCodes.length === 1 && spec.notAllowedOnFloatingPointCodes[0] === 'AB');
  check('CHECK carries the DDS Reference citation text',
    /CHECK\(AB\).*floating-point field \(F in position 35\)/.test(spec.floatDdsReference));
  check('CHECK is NOT flagged as a whole-keyword float restriction',
    !spec.notAllowedOnFloatingPointField && KeywordSpec.isNotAllowedOnFloatingPointField('CHECK') === false);
  const holders = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].notAllowedOnFloatingPointCodes);
  check('CHECK is the only entry with notAllowedOnFloatingPointCodes', holders.length === 1 && holders[0] === 'CHECK');
}

console.log('=== 2. floatIncompatibleCheckCodes ===');
{
  check('CHECK -> [AB]', JSON.stringify(KeywordSpec.floatIncompatibleCheckCodes('CHECK')) === '["AB"]');
  const copy = KeywordSpec.floatIncompatibleCheckCodes('CHECK');
  copy.push('ZZ');
  check('the accessor returns a copy (mutating it does not change the spec)',
    JSON.stringify(KeywordSpec.floatIncompatibleCheckCodes('CHECK')) === '["AB"]');
  check('a whole-keyword float keyword (DUP) has no code list', KeywordSpec.floatIncompatibleCheckCodes('DUP').length === 0);
  check('an unknown keyword has no code list', KeywordSpec.floatIncompatibleCheckCodes('NOSUCH').length === 0);
}

console.log('=== 3. checkAbFloatIncompatibleNewConflictReason (behavior unchanged) ===');
{
  const f = DspfWriter.checkAbFloatIncompatibleNewConflictReason;
  const ab = [kw('CHECK', 'AB')];
  const multi = [kw('CHECK', 'M10 AB')];
  const me = [kw('CHECK', 'ME')];
  const r1 = f({ dataType: 'F', keywords: [] }, { keywords: ab });
  check('adding CHECK(AB) to a float field is blocked, wording intact', /^CHECK\(AB\) cannot be specified on a floating-point field/.test(r1 || ''));
  const r2 = f({ dataType: 'S', keywords: ab }, { dataType: 'F' });
  check('changing the data type to F while CHECK(AB) is present is blocked, wording intact', /^The data type cannot be changed to F/.test(r2 || ''));
  check('an already-invalid F field with CHECK(AB) is not re-reported', !f({ dataType: 'F', keywords: ab }, { length: 5 }));
  check('a non-float field with CHECK(AB) is never blocked', !f({ dataType: 'A', keywords: [] }, { keywords: ab }));
  check('a multi-code CHECK(M10 AB) is still recognized', !!f({ dataType: 'F', keywords: [] }, { keywords: multi }));
  check('CHECK(ME) on a float field is never blocked (either direction)',
    !f({ dataType: 'F', keywords: [] }, { keywords: me }) && !f({ dataType: 'S', keywords: me }, { dataType: 'F' }));
  check('a non-CHECK keyword with parameter AB is ignored', !f({ dataType: 'F', keywords: [] }, { keywords: [kw('DFT', 'AB')] }));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

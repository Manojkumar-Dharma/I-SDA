/**
 * i132CheckModulusFloatGuard.test.js
 *
 * Task I-132 - CHECK's own DDS Reference section (note 3) bars
 * CHECK(M10), CHECK(M10F), CHECK(M11) and CHECK(M11F) on a floating-point
 * field (F in position 35), exactly as it bars CHECK(AB). Only AB was
 * guarded (I-125). RECORD_TYPES.CHECK.notAllowedOnFloatingPointCodes now
 * lists all five and checkAbFloatIncompatibleNewConflictReason (name kept
 * for its I-125 call sites) names whichever code is present.
 *
 *  1. every restricted code, both directions, message names that code.
 *  2. unrestricted codes (ME, MF, VN, VNE, RB, RL...) never blocked.
 *  3. multi-code / multi-instance / diff-based edge cases.
 *  4. the spec lists exactly the five codes.
 *
 * Run with: node src/test/i132CheckModulusFloatGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const kw = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const f = DspfWriter.checkAbFloatIncompatibleNewConflictReason;

console.log('=== 1. each restricted code, both directions ===');
['AB', 'M10', 'M10F', 'M11', 'M11F'].forEach((code) => {
  const add = f({ dataType: 'F', keywords: [] }, { keywords: [kw('CHECK', code)] });
  check('adding CHECK(' + code + ') to a float field is blocked and names the code',
    !!add && add.indexOf('CHECK(' + code + ') cannot be specified on a floating-point field') === 0);
  const chg = f({ dataType: 'S', keywords: [kw('CHECK', code)] }, { dataType: 'F' });
  check('changing the data type to F with CHECK(' + code + ') present is blocked and names the code',
    !!chg && /^The data type cannot be changed to F/.test(chg) && chg.indexOf('Remove CHECK(' + code + ') first.') > 0);
  check('an already-invalid F field with CHECK(' + code + ') is not re-reported',
    !f({ dataType: 'F', keywords: [kw('CHECK', code)] }, { length: 5 }));
  check('CHECK(' + code + ') on a non-float field is never blocked', !f({ dataType: 'A', keywords: [] }, { keywords: [kw('CHECK', code)] }));
});

console.log('=== 2. unrestricted codes ===');
['ME', 'MF', 'VN', 'VNE', 'RB', 'RL', 'FE', 'LC', 'NB'].forEach((code) => {
  check('CHECK(' + code + ') on a float field is never blocked (either direction)',
    !f({ dataType: 'F', keywords: [] }, { keywords: [kw('CHECK', code)] }) && !f({ dataType: 'A', keywords: [kw('CHECK', code)] }, { dataType: 'F' }));
});
check('M10 is matched as a whole token (a bogus M100 is not the M10 code)', !f({ dataType: 'F', keywords: [] }, { keywords: [kw('CHECK', 'M100')] }));

console.log('=== 3. multi-code and diff-based cases ===');
{
  const r = f({ dataType: 'F', keywords: [] }, { keywords: [kw('CHECK', 'ME M11')] });
  check('CHECK(ME M11) on a float field is blocked and names M11', !!r && r.indexOf('CHECK(M11)') === 0);
  const r2 = f({ dataType: 'F', keywords: [kw('CHECK', 'M10')] }, { keywords: [kw('CHECK', 'M10 AB')] });
  check('a float field that already had M10 gaining AB is blocked for the code it introduced (AB)', !!r2 && r2.indexOf('CHECK(AB)') === 0);
  check('a float field that already had M10 keeping it while gaining ME is not re-reported',
    !f({ dataType: 'F', keywords: [kw('CHECK', 'M10')] }, { keywords: [kw('CHECK', 'M10 ME')] }));
  const r3 = f({ dataType: 'F', keywords: [] }, { keywords: [kw('CHECK', 'ME'), kw('CHECK', 'M10F')] });
  check('a second CHECK instance carrying M10F is recognized', !!r3 && r3.indexOf('CHECK(M10F)') === 0);
  check('removing the keyword (empty keywords) on a float field is never blocked', !f({ dataType: 'F', keywords: [kw('CHECK', 'M10')] }, { keywords: [] }));
  check('fixing it by changing the data type away from F is never blocked', !f({ dataType: 'F', keywords: [kw('CHECK', 'M11')] }, { dataType: 'S' }));
  check('a non-CHECK keyword with parameter M10 is ignored', !f({ dataType: 'F', keywords: [] }, { keywords: [kw('DFT', 'M10')] }));
  check('no old field at all is tolerated', !f(null, { dataType: 'A', keywords: [kw('CHECK', 'M10')] }));
}

console.log('=== 4. spec ===');
check('the spec lists exactly AB, M10, M10F, M11, M11F',
  JSON.stringify(KeywordSpec.floatIncompatibleCheckCodes('CHECK')) === '["AB","M10","M10F","M11","M11F"]');

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

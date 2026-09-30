/**
 * i121CheckCodeTableKeywordSpec.test.js
 *
 * Task I-121 (CHECK option-code table slice) - CHECK's spec entry gets the
 * full code domain, grouped by the function names IBM's own CHECK section
 * uses (validity checking / keyboard control / cursor control). The writer's
 * hand-kept CHECK_CODES array was never read anywhere (and lacked RLTB); it is
 * gone. Pure refactor, no behavior change.
 *
 *  1. the fact: three groups, IBM's codes, 16 distinct codes, citation.
 *  2. accessors: copy semantics, case-insensitive group lookup, fail-safe.
 *  3. consistency: every code any other spec fact names for CHECK is a real code.
 *  4. the editor panels' code lists are subsets of the domain.
 *  5. the dead writer constant stays gone.
 *
 * Run with: node src/test/i121CheckCodeTableKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

console.log('=== 1. the fact ===');
const spec = KeywordSpec.RECORD_TYPES.CHECK;
const g = KeywordSpec.checkCodeGroups('CHECK');
check('three groups in IBM order', JSON.stringify(Object.keys(g)) === '["validity","keyboard","cursor"]');
check('validity codes', g.validity.join(' ') === 'AB ME MF M10 M10F M11 M11F VN VNE');
check('keyboard codes', g.keyboard.join(' ') === 'ER FE LC RB RZ');
check('cursor codes include RLTB', g.cursor.join(' ') === 'RL RLTB');
const all = KeywordSpec.checkCodes();
check('16 codes, all distinct', all.length === 16 && new Set(all).size === 16);
check('citation names all three functions', /Validity checking:.*Keyboard control:.*Cursor control:.*RLTB/.test(spec.codesDdsReference));
check('only CHECK carries codeGroups', Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].codeGroups).join() === 'CHECK');

console.log('\n=== 2. accessors ===');
g.validity.push('ZZ');
check('checkCodeGroups returns copies', KeywordSpec.checkCodeGroups('CHECK').validity.length === 9);
check('unrelated / unknown keyword gives {}', Object.keys(KeywordSpec.checkCodeGroups('DUP')).length === 0 && Object.keys(KeywordSpec.checkCodeGroups('NOPE')).length === 0);
check('checkCodeGroup maps codes', KeywordSpec.checkCodeGroup('M10F') === 'validity' && KeywordSpec.checkCodeGroup('lc') === 'keyboard' && KeywordSpec.checkCodeGroup(' rltb ') === 'cursor');
check('checkCodeGroup fail-safe', [null, undefined, '', 'XX', 'constructor', '__proto__'].every((v) => KeywordSpec.checkCodeGroup(v) === null));

console.log('\n=== 3. other CHECK facts use real codes ===');
const known = new Set(all);
const named = [].concat(spec.notAllowedOnFloatingPointCodes);
['WRDWRAP', 'IGCALTTYP', 'EDTMSK'].forEach((k) => {
  const s = KeywordSpec.RECORD_TYPES[k];
  [s.conditionalMutex, s.mutexKeywords, s.mutexWithParameters].forEach((m) => {
    if (m && m.CHECK) named.push.apply(named, m.CHECK);
  });
  if (s.conditionalMutex && s.conditionalMutex.CHECK) named.push.apply(named, s.conditionalMutex.CHECK);
});
check('collected some codes to verify', named.length >= 5);
check('every code named for CHECK elsewhere is in the domain', named.every((c) => known.has(c)));
check('float-forbidden codes span groups sensibly', spec.notAllowedOnFloatingPointCodes.every((c) => KeywordSpec.checkCodeGroup(c) === 'validity'));

console.log('\n=== 4. editor panels ===');
const web = fs.readFileSync(path.join(__dirname, '../webviewClientHelpers.js'), 'utf8');
function codesIn(varName) {
  const m = web.match(new RegExp('var ' + varName + ' = \\[([\\s\\S]*?)\\n  \\];'));
  const out = [];
  (m ? m[1] : '').replace(/(?:code|immedCode): '([A-Z0-9]+)'/g, (_, c) => out.push(c));
  return out;
}
const keying = codesIn('KEYING_OPTION_CODES');
const validity = codesIn('VALIDITY_CHECK_CODES');
check('parsed both panel lists', keying.length === 8 && validity.length === 7);
check('every panel code is a spec code', keying.concat(validity).every((c) => known.has(c)));
check('the two panels do not overlap', keying.filter((c) => validity.indexOf(c) >= 0).length === 0);

console.log('\n=== 5. dead constant stays gone ===');
check('dspfWriter.js has no CHECK_CODES array', !/var CHECK_CODES\b/.test(fs.readFileSync(path.join(__dirname, '../dspfWriter.js'), 'utf8')));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

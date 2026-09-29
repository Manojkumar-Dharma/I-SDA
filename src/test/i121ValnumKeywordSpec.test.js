/**
 * i121ValnumKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", VALNUM slice. VALNUM's
 * only rule (DDS_Keyword_V7r6.txt ~line 13146: "The field containing the VALNUM
 * keyword must be defined as an input-capable field with the data type Y")
 * lived solely as the General-tab row filter's 'input-capable' (usage I or B)
 * and 'numeric-only' (data type Y) scopes in webviewClientHelpers.js. It now
 * has its first keywordSpec.js entry (`allowedUsage`, `requiredDataTypes`), and
 * both row filters read it through DspfWriter.keywordUsageAllowed /
 * keywordRequiredDataTypeAllows. Pure refactor, no behavior change.
 *
 * Run with: node src/test/i121ValnumKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nRECORD_TYPES.VALNUM');
{
  const v = KeywordSpec.RECORD_TYPES.VALNUM;
  check('entry exists and cites the exact DDS Reference wording',
    !!v && v.ddsReference === 'The field containing the VALNUM keyword must be defined as an input-capable field with the data type Y.');
  check('allowedUsage is I, B (same fact WRDWRAP carries)', same(KeywordSpec.allowedUsage('VALNUM'), ['I', 'B']) && same(KeywordSpec.allowedUsage('VALNUM'), KeywordSpec.allowedUsage('WRDWRAP')));
  check('requiredDataTypes is Y', same(KeywordSpec.requiredDataTypes('VALNUM'), ['Y']));
  check('VALNUM carries no other facts (no mutex, no blocked/allowed data types)',
    Object.keys(v).sort().join() === 'allowedUsage,ddsReference,requiredDataTypes');
  check('requiredDataTypes is VALNUM-only', ['WRDWRAP', 'IGCALTTYP', 'DUP', 'CHRID', 'NOSUCH', '', null, undefined].every((n) => KeywordSpec.requiredDataTypes(n) === null));
  const a = KeywordSpec.requiredDataTypes('VALNUM'); a.push('Z');
  check('requiredDataTypes returns a copy', same(KeywordSpec.requiredDataTypes('VALNUM'), ['Y']));
}

console.log('\nDspfWriter.keywordUsageAllowed (row filter usage scope)');
{
  const f = DspfWriter.keywordUsageAllowed;
  ['I', 'B', 'i', 'b', ' I '].forEach((u) => check('VALNUM usage ' + JSON.stringify(u) + ' allowed', f('VALNUM', u) === true));
  ['O', 'H', 'M', 'P', 'o'].forEach((u) => check('VALNUM usage ' + u + ' hidden', f('VALNUM', u) === false));
  ['', null, undefined, '  '].forEach((u) => check('VALNUM blank usage ' + JSON.stringify(u) + ' fails open', f('VALNUM', u) === true));
  ['I', 'B'].forEach((u) => check('WRDWRAP usage ' + u + ' allowed (shared scope)', f('WRDWRAP', u) === true));
  ['O', 'H', 'M', 'P'].forEach((u) => check('WRDWRAP usage ' + u + ' hidden (shared scope)', f('WRDWRAP', u) === false));
  check('WRDWRAP blank usage fails open', f('WRDWRAP', '') === true);
  check('IGCALTTYP uses the same accessor (usage B only)', f('IGCALTTYP', 'B') === true && f('IGCALTTYP', 'I') === false);
  check('a keyword with no usage fact is never hidden', f('DUP', 'O') === true && f('NOSUCH', 'H') === true);
}

console.log('\nDspfWriter.keywordRequiredDataTypeAllows (row filter numeric-only scope)');
{
  const f = DspfWriter.keywordRequiredDataTypeAllows;
  ['Y', 'y', ' Y '].forEach((d) => check('VALNUM data type ' + JSON.stringify(d) + ' shown', f('VALNUM', d) === true));
  ['A', 'S', 'P', 'B', 'D', 'F', 'L', 'X'].forEach((d) => check('VALNUM data type ' + d + ' hidden', f('VALNUM', d) === false));
  ['', null, undefined].forEach((d) => check('VALNUM blank data type stays hidden (strict, unlike the fail-open rows) ' + JSON.stringify(d), f('VALNUM', d) === false));
  check('keywords without a required data type are never hidden by it', f('WRDWRAP', 'S') === true && f('DUP', '') === true && f('NOSUCH', 'Q') === true);
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

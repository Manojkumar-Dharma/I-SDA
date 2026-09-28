/**
 * i121SflChoiceListKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLSNGCHC/SFLMLTCHC
 * slice. SFLMLTCHC's and SFLSNGCHC's own DDS Reference sections each state
 * "The following subfile control record keywords cannot be specified on a
 * record with the [keyword] keyword: SFLDROP, SFLFOLD, [the other choice
 * keyword]". sflChoiceListConflictReason (I-26) hard-coded that partner
 * list. Now reads keywordSpec.js's `RECORD_TYPES.SFLSNGCHC` /
 * `RECORD_TYPES.SFLMLTCHC` `mutex` (the existing shape, reused unchanged).
 *
 * Verifies:
 *  1. Both spec entries' mutex lists, order and citation text.
 *  2. isMutex / mutexKeywords agree, including fail-safe behavior and that
 *     mutexKeywords returns a copy.
 *  3. sflChoiceListConflictReason unchanged: every partner blocks with its
 *     exact wording, report order is preserved, and unrelated keywords,
 *     an unknown name and null input are fail-safe.
 *  4. The documented reverse direction (SFLDROP/SFLFOLD added to a record
 *     that already has a choice keyword) is still NOT a spec-driven guard
 *     here - sflChoiceListConflictReason only checks the choice keyword
 *     being turned on, exactly as before.
 *
 * Run with: node src/test/i121SflChoiceListKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

console.log('\nSpec entries');
{
  const S = KeywordSpec.RECORD_TYPES.SFLSNGCHC, M = KeywordSpec.RECORD_TYPES.SFLMLTCHC;
  check('SFLSNGCHC entry exists', !!S);
  check('SFLMLTCHC entry exists', !!M);
  check('SFLSNGCHC mutex is [SFLMLTCHC, SFLDROP, SFLFOLD] in that order', S && S.mutex.join(',') === 'SFLMLTCHC,SFLDROP,SFLFOLD');
  check('SFLMLTCHC mutex is [SFLSNGCHC, SFLDROP, SFLFOLD] in that order', M && M.mutex.join(',') === 'SFLSNGCHC,SFLDROP,SFLFOLD');
  check('SFLSNGCHC citation names its keyword and all three partners',
    S && /SFLSNGCHC keyword: SFLDROP, SFLFOLD, SFLMLTCHC/.test(S.ddsReference));
  check('SFLMLTCHC citation names its keyword and all three partners',
    M && /SFLMLTCHC keyword: SFLDROP, SFLFOLD, SFLSNGCHC/.test(M.ddsReference));
  check('neither entry carries any other rule shape',
    !S.whitelist && !M.whitelist && !S.qualifyingNames && !M.qualifyingNames && !S.definitionRequirements && !M.definitionRequirements);
}

console.log('\nisMutex / mutexKeywords');
{
  ['SFLDROP', 'SFLFOLD', 'SFLMLTCHC'].forEach((n) => check('SFLSNGCHC excludes ' + n, KeywordSpec.isMutex('SFLSNGCHC', n)));
  ['SFLDROP', 'SFLFOLD', 'SFLSNGCHC'].forEach((n) => check('SFLMLTCHC excludes ' + n, KeywordSpec.isMutex('SFLMLTCHC', n)));
  check('SFLSNGCHC does not exclude itself', !KeywordSpec.isMutex('SFLSNGCHC', 'SFLSNGCHC'));
  check('SFLSNGCHC does not exclude SFLPAG', !KeywordSpec.isMutex('SFLSNGCHC', 'SFLPAG'));
  check('mutexKeywords for an unknown type is empty', KeywordSpec.mutexKeywords('NOSUCH').length === 0);
  const copy = KeywordSpec.mutexKeywords('SFLSNGCHC'); copy.push('X');
  check('mutexKeywords returns a copy (spec not mutated)', KeywordSpec.mutexKeywords('SFLSNGCHC').length === 3);
}

console.log('\nsflChoiceListConflictReason');
{
  const f = DspfWriter.sflChoiceListConflictReason;
  const msg = (n, o) => n + ' cannot be specified on the same record as ' + o + ' (mutually exclusive per the DDS Reference).';
  check('SFLSNGCHC vs SFLMLTCHC wording', f('SFLSNGCHC', [k('SFLMLTCHC')]) === msg('SFLSNGCHC', 'SFLMLTCHC'));
  check('SFLMLTCHC vs SFLSNGCHC wording', f('SFLMLTCHC', [k('SFLSNGCHC')]) === msg('SFLMLTCHC', 'SFLSNGCHC'));
  check('SFLSNGCHC vs SFLDROP wording', f('SFLSNGCHC', [k('SFLDROP', 'CA05')]) === msg('SFLSNGCHC', 'SFLDROP'));
  check('SFLMLTCHC vs SFLDROP wording', f('SFLMLTCHC', [k('SFLDROP', 'CA05')]) === msg('SFLMLTCHC', 'SFLDROP'));
  check('SFLSNGCHC vs SFLFOLD wording', f('SFLSNGCHC', [k('SFLFOLD', 'CA06')]) === msg('SFLSNGCHC', 'SFLFOLD'));
  check('SFLMLTCHC vs SFLFOLD wording', f('SFLMLTCHC', [k('SFLFOLD', 'CA06')]) === msg('SFLMLTCHC', 'SFLFOLD'));
  check('report order: the other choice keyword before SFLDROP before SFLFOLD',
    f('SFLSNGCHC', [k('SFLFOLD'), k('SFLDROP'), k('SFLMLTCHC')]) === msg('SFLSNGCHC', 'SFLMLTCHC')
    && f('SFLSNGCHC', [k('SFLFOLD'), k('SFLDROP')]) === msg('SFLSNGCHC', 'SFLDROP'));
  check('no partner present is ""', f('SFLSNGCHC', [k('SFLPAG', '5'), k('SFLRTNSEL')]) === '');
  check('the keyword itself already present is not a conflict', f('SFLSNGCHC', [k('SFLSNGCHC')]) === '');
  check('empty / null / undefined keywords are ""', f('SFLMLTCHC', []) === '' && f('SFLMLTCHC', null) === '' && f('SFLMLTCHC', undefined) === '');
  check('a name with no spec entry is fail-safe ""', f('SFLPAG', [k('SFLDROP')]) === '');
}

console.log('\nReverse direction is out of scope (pure refactor)');
{
  check('the function reports nothing when asked about SFLDROP itself',
    DspfWriter.sflChoiceListConflictReason('SFLDROP', [k('SFLSNGCHC')]) === '');
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

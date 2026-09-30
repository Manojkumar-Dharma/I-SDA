/**
 * i121NoOptionIndicatorsKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", no-option-indicators
 * slice. The 95 keywords (plus file-level-only HLPTITLE) whose own DDS
 * Reference section bars option indicators were eight hand-written arrays in
 * dspfWriter.js feeding NO_OPTION_INDICATOR_KEYWORDS. They are now one
 * `noOptionIndicators` fact per keyword in keywordSpec.js; the writer only
 * maps a fact's `kind` to its message.
 *
 * Pure refactor: src/test/fixtures/i121NoOptionIndicatorsBaseline.json is a
 * snapshot of every keyword -> message pair taken from the pre-refactor code,
 * and this test requires the spec-driven table to reproduce it exactly
 * (names, order, and every message word for word).
 *
 * Verifies:
 *  1. The spec facts: count, shape, kinds, levels, citations, HLPTITLE split.
 *  2. Accessors, including unknown / null-safe input.
 *  3. Exact equivalence with the baseline (every-level and file-level tables).
 *  4. The present / new-conflict functions still behave (indicators,
 *     display-size conditions, file level, diff-based fail-open).
 *
 * Run with: node src/test/i121NoOptionIndicatorsKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const baseline = require('./fixtures/i121NoOptionIndicatorsBaseline.json');
const { check, failureCount } = require('./helpers/harness');

const ind = (n) => [{ indicators: [{ number: n, negated: false }] }];
const ds = () => [{ indicators: [], displaySizeCondition: '*DS3' }];
const KINDS = ['notValid', 'notValidDisplaySizeValid', 'notValidFieldConditionable', 'notAllowed',
  'notValidOrWithField', 'notValidAndDisplaySize', 'notValidFileLevelOnly'];

console.log('\nspec facts');
{
  const names = KeywordSpec.noOptionIndicatorsNames();
  const fileOnly = KeywordSpec.noOptionIndicatorsNames(true);
  check('95 every-level keywords', names.length === 95);
  check('HLPTITLE is the only file-level-only entry', fileOnly.join() === 'HLPTITLE');
  check('no name in both lists', names.indexOf('HLPTITLE') < 0);
  check('every fact has a known kind, levels and a citation', names.concat(fileOnly).every((n) => {
    const f = KeywordSpec.noOptionIndicatorsFact(n);
    return KINDS.indexOf(f.kind) >= 0 && Array.isArray(f.levels) && f.levels.length > 0 && /Option indicators/.test(f.ddsReference);
  }));
  const kindCount = (k) => names.filter((n) => KeywordSpec.noOptionIndicatorsFact(n).kind === k).length;
  check('75 plain', kindCount('notValid') === 75);
  check('5 display-size-valid', kindCount('notValidDisplaySizeValid') === 5);
  check('12 field-conditionable', kindCount('notValidFieldConditionable') === 12);
  check('1 not-allowed (IGCALTTYP)', kindCount('notAllowed') === 1 && KeywordSpec.noOptionIndicatorsFact('IGCALTTYP').kind === 'notAllowed');
  check('SFLMSGKEY / SFLPGMQ kinds', KeywordSpec.noOptionIndicatorsFact('SFLMSGKEY').kind === 'notValidOrWithField' && KeywordSpec.noOptionIndicatorsFact('SFLPGMQ').kind === 'notValidAndDisplaySize');
  check('multi-level keywords list their levels', KeywordSpec.noOptionIndicatorsFact('WRDWRAP').levels.join() === 'file,record,field' && KeywordSpec.noOptionIndicatorsFact('VLDCMDKEY').levels.join() === 'file,record' && KeywordSpec.noOptionIndicatorsFact('HLPARA').levels.join() === 'help');
  check('MSGCON and MSGID stay out (conditional)', !KeywordSpec.noOptionIndicatorsFact('MSGCON') && !KeywordSpec.noOptionIndicatorsFact('MSGID'));
  check('HLPTITLE fact', KeywordSpec.noOptionIndicatorsFact('HLPTITLE').fileLevelOnly === true);
}

console.log('\naccessors');
{
  check('case/space-insensitive', KeywordSpec.noOptionIndicatorsFact(' igcalttyp ').kind === 'notAllowed');
  check('unknown -> null', KeywordSpec.noOptionIndicatorsFact('NOSUCH') === null);
  check('null/undefined/blank -> null', KeywordSpec.noOptionIndicatorsFact(null) === null && KeywordSpec.noOptionIndicatorsFact(undefined) === null && KeywordSpec.noOptionIndicatorsFact('') === null);
  check('prototype names are not keywords', KeywordSpec.noOptionIndicatorsFact('constructor') === null && KeywordSpec.noOptionIndicatorsFact('toString') === null);
}

console.log('\nequivalence with the pre-refactor baseline');
{
  const names = DspfWriter.noOptionIndicatorKeywordNames();
  check('same names in the same order', JSON.stringify(names) === JSON.stringify(Object.keys(baseline.all)));
  let bad = [];
  Object.keys(baseline.all).forEach((n) => { if (DspfWriter.noOptionIndicatorsReason(n) !== baseline.all[n]) bad.push(n); });
  check('every every-level message identical' + (bad.length ? ' (differs: ' + bad.join() + ')' : ''), bad.length === 0);
  check('file-level names identical', JSON.stringify(DspfWriter.noOptionIndicatorFileLevelKeywordNames()) === JSON.stringify(Object.keys(baseline.file)));
  Object.keys(baseline.file).forEach((n) => {
    check(n + ': file-level message identical', DspfWriter.noOptionIndicatorsReason(n, 'file') === baseline.file[n]);
    check(n + ': not refused at other levels', DspfWriter.noOptionIndicatorsReason(n) === null && DspfWriter.noOptionIndicatorsReason(n, 'record') === null);
  });
  check('lower-case / padded lookups still work', DspfWriter.noOptionIndicatorsReason('  sflpag ') === baseline.all.SFLPAG);
  check('unknown / blank / null -> null', DspfWriter.noOptionIndicatorsReason('NOSUCH') === null && DspfWriter.noOptionIndicatorsReason('') === null && DspfWriter.noOptionIndicatorsReason(null) === null);
}

console.log('\nbehaviour');
{
  const R = DspfWriter;
  check('adding an indicator to DSPSIZ is refused', R.noOptionIndicatorsNewConflictReason('DSPSIZ', [], ind(1)) === baseline.all.DSPSIZ);
  check('removing / keeping indicators is allowed (fail-open)', R.noOptionIndicatorsNewConflictReason('DSPSIZ', ind(1), []) === null && R.noOptionIndicatorsNewConflictReason('DSPSIZ', ind(1), ind(2)) === null);
  check('a present indicator is reported', R.noOptionIndicatorsPresentReason('IGCALTTYP', ind(3)) === baseline.all.IGCALTTYP);
  check('a keyword outside the table is never affected', R.noOptionIndicatorsNewConflictReason('DSPATR', [], ind(1)) === null);
  check('display-size condition on WINDOW is not an option indicator', R.noOptionIndicatorsNewConflictReason('WINDOW', [], ds()) === null && R.noOptionIndicatorsPresentReason('WINDOW', ds()) === null);
  check('display-size condition on SFLPGMQ IS refused', R.noOptionIndicatorsNewConflictReason('SFLPGMQ', [], ds()) === baseline.all.SFLPGMQ);
  check('HLPTITLE: refused at file level only', R.noOptionIndicatorsNewConflictReason('HLPTITLE', [], ind(1), 'file') === baseline.file.HLPTITLE && R.noOptionIndicatorsNewConflictReason('HLPTITLE', [], ind(1), 'record') === null);
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

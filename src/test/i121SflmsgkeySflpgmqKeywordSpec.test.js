/**
 * i121SflmsgkeySflpgmqKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLMSGKEY/SFLPGMQ
 * slice.
 *
 * SFLMSGKEY's own DDS Reference section: "Option indicators are not valid
 * for this keyword or with the associated field." SFLPGMQ's: "Option
 * indicators and display size condition names are not valid for this
 * keyword." The option-indicator half of each stays a
 * NO_OPTION_INDICATOR_KEYWORDS table entry; the FIELD half (SFLMSGKEY) and
 * the display-size half (SFLPGMQ) were a string literal in
 * sflmsgkeyFieldNewConflictReason and a one-element array. Both now read
 * keywordSpec.js's `noOptionIndicatorsOnField` / `noDisplaySizeCondition`.
 *
 * Verifies:
 *  1. Both spec entries and citations, and that each carries only its own
 *     fact; only these keywords carry either fact.
 *  2. The accessors, including unknown/null-safe input.
 *  3. noOptionIndicatorsReason / present / new-conflict functions for
 *     SFLPGMQ's display-size half, unchanged.
 *  4. sflmsgkeyFieldNewConflictReason unchanged (both directions).
 *
 * Run with: node src/test/i121SflmsgkeySflpgmqKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const ind = (n) => [{ indicators: [{ number: n, negated: false }] }];
const ds = () => [{ indicators: [], displaySizeCondition: '*DS3' }];

console.log('\nRECORD_TYPES.SFLMSGKEY / SFLPGMQ');
{
  const M = KeywordSpec.RECORD_TYPES.SFLMSGKEY, Q = KeywordSpec.RECORD_TYPES.SFLPGMQ;
  check('SFLMSGKEY entry exists', !!M);
  check('SFLPGMQ entry exists', !!Q);
  check('SFLMSGKEY citation', /or with the associated field/.test(M.noOptionIndicatorsOnField.ddsReference));
  check('SFLPGMQ citation', /display size condition names are not valid/.test(Q.noDisplaySizeCondition.ddsReference));
  check('SFLMSGKEY carries only its own fact', Object.keys(M).join() === 'noOptionIndicatorsOnField');
  check('SFLPGMQ carries only its own fact', Object.keys(Q).join() === 'noDisplaySizeCondition');
  const withField = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].noOptionIndicatorsOnField);
  const withDs = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].noDisplaySizeCondition);
  check('only SFLMSGKEY has the field fact', withField.join() === 'SFLMSGKEY');
  check('only SFLPGMQ has the display-size fact', withDs.join() === 'SFLPGMQ');
}

console.log('\nAccessors');
{
  check('noOptionIndicatorsOnField(SFLMSGKEY)', KeywordSpec.noOptionIndicatorsOnField('SFLMSGKEY') === true);
  check('noOptionIndicatorsOnField(SFLPGMQ) false', KeywordSpec.noOptionIndicatorsOnField('SFLPGMQ') === false);
  check('noDisplaySizeCondition(SFLPGMQ)', KeywordSpec.noDisplaySizeCondition('SFLPGMQ') === true);
  check('noDisplaySizeCondition(SFLMSGKEY) false', KeywordSpec.noDisplaySizeCondition('SFLMSGKEY') === false);
  ['SFLSIZ', 'MSGLOC', 'NOPE', '', null, undefined].forEach((n) => {
    check('fail-safe for ' + String(n), !KeywordSpec.noOptionIndicatorsOnField(n) && !KeywordSpec.noDisplaySizeCondition(n));
  });
}

console.log('\nSFLPGMQ display-size half (unchanged behavior)');
{
  check('indicator on SFLPGMQ blocked', !!DspfWriter.noOptionIndicatorsNewConflictReason('SFLPGMQ', [], ind(1)));
  check('display-size added to SFLPGMQ blocked', !!DspfWriter.noOptionIndicatorsNewConflictReason('SFLPGMQ', [], ds()));
  check('display-size kept unchanged not re-reported', DspfWriter.noOptionIndicatorsNewConflictReason('SFLPGMQ', ds(), ds()) === null);
  check('display-size removed allowed', DspfWriter.noOptionIndicatorsNewConflictReason('SFLPGMQ', ds(), []) === null);
  check('display-size on SFLSIZ NOT flagged (takes one)', DspfWriter.noOptionIndicatorsNewConflictReason('SFLSIZ', [], ds()) === null);
  check('display-size on SFLMSGKEY keyword NOT flagged (indicator-only)', DspfWriter.noOptionIndicatorsNewConflictReason('SFLMSGKEY', [], ds()) === null);
  check('present: SFLPGMQ with display-size warned', !!DspfWriter.noOptionIndicatorsPresentReason('SFLPGMQ', ds()));
  check('present: SFLSIZ with display-size not warned', DspfWriter.noOptionIndicatorsPresentReason('SFLSIZ', ds()) === null);
  check('present: SFLPGMQ lowercase name still resolved', !!DspfWriter.noOptionIndicatorsPresentReason('sflpgmq', ds()));
}

console.log('\nsflmsgkeyFieldNewConflictReason (unchanged behavior)');
{
  const f = (kws, conds) => ({ name: 'F', keywords: kws, conditions: conds || [] });
  check('indicators added to SFLMSGKEY field',
    /not valid on a field that carries SFLMSGKEY/.test(DspfWriter.sflmsgkeyFieldNewConflictReason(f([k('SFLMSGKEY')]), { conditions: ind(1) })));
  check('SFLMSGKEY added to conditioned field',
    /SFLMSGKEY cannot be added to a field that has option indicators/.test(DspfWriter.sflmsgkeyFieldNewConflictReason(f([], ind(1)), { keywords: [k('SFLMSGKEY')] })));
  check('already both: not re-reported', DspfWriter.sflmsgkeyFieldNewConflictReason(f([k('SFLMSGKEY')], ind(1)), { conditions: ind(1) }) === null);
  check('removing indicators allowed', DspfWriter.sflmsgkeyFieldNewConflictReason(f([k('SFLMSGKEY')], ind(1)), { conditions: [] }) === null);
  check('removing keyword allowed', DspfWriter.sflmsgkeyFieldNewConflictReason(f([k('SFLMSGKEY')], ind(1)), { keywords: [] }) === null);
  check('no SFLMSGKEY: indicators fine', DspfWriter.sflmsgkeyFieldNewConflictReason(f([k('SFLPGMQ')]), { conditions: ind(1) }) === null);
  check('null field / updates safe', DspfWriter.sflmsgkeyFieldNewConflictReason(null, {}) === null && DspfWriter.sflmsgkeyFieldNewConflictReason({}, null) === null);
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

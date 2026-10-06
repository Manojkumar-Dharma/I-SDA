/**
 * i178SubfileControlSpecFacts.test.js
 *
 * Task I-178 - the RECORD_TYPES entries for SFLCSRPRG, SFLRCDNBR, SFLROLVAL, SFLRTNSEL and SFLNXTCHG
 * held only a rule fragment and stated no level, parameter or option-indicator fact, although each
 * DDS Reference section does.  So takesNoParameters / optionIndicatorsAllowed answered false for
 * keywords whose section says "no parameters" / "Option indicators are valid".
 *
 *   SFLCSRPRG  field-level, no parameters, option indicators not valid
 *   SFLRCDNBR  field-level, option indicators not valid (parameter grammar is I-177's)
 *   SFLROLVAL  field-level, no parameters, option indicators not valid
 *   SFLRTNSEL  record-level, no parameters, option indicators not valid
 *   SFLNXTCHG  record-level, no parameters, option indicators valid
 *
 * Run with: node src/test/i178SubfileControlSpecFacts.test.js
 */
'use strict';
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const T = KeywordSpec.RECORD_TYPES;
const WANT = {
  SFLCSRPRG: { levels: ['field'], noParams: true, oi: 'notValid' },
  SFLRCDNBR: { levels: ['field'], noParams: false, oi: 'notValid' },
  SFLROLVAL: { levels: ['field'], noParams: true, oi: 'notValid' },
  SFLRTNSEL: { levels: ['record'], noParams: true, oi: 'notValid' },
  SFLNXTCHG: { levels: ['record'], noParams: true, oi: 'valid' },
};

console.log('=== the five entries state their facts ===');
Object.keys(WANT).forEach((k) => {
  const w = WANT[k];
  check(k + ': levels ' + w.levels.join('/') + ' and optionIndicators "' + w.oi + '"', JSON.stringify(T[k].levels) === JSON.stringify(w.levels) && T[k].optionIndicators === w.oi);
  check(k + ': takesNoParameters is ' + w.noParams, KeywordSpec.takesNoParameters(k) === w.noParams && DspfWriter.takesNoParameters(k) === w.noParams);
  check(k + ': optionIndicatorsAllowed is ' + (w.oi === 'valid'), KeywordSpec.optionIndicatorsAllowed(k) === (w.oi === 'valid') && DspfWriter.optionIndicatorsAllowed(k) === (w.oi === 'valid'));
});
check('SFLRCDNBR states no `parameters` fact: its grammar SFLRCDNBR[([CURSOR] [*TOP])] belongs to I-177', T.SFLRCDNBR.parameters === undefined && T.SFLRCDNBR.noParameters !== true);

console.log('\n=== they agree with the no-option-indicators table ===');
['SFLCSRPRG', 'SFLRCDNBR', 'SFLROLVAL', 'SFLRTNSEL'].forEach((k) => {
  const f = KeywordSpec.noOptionIndicatorsFact(k);
  check(k + ': the table says notValid at the same level the entry states', !!f && f.kind === 'notValid' && JSON.stringify(f.levels) === JSON.stringify(T[k].levels));
});
check('SFLNXTCHG, whose indicators are valid, is not in the no-option-indicators table', KeywordSpec.noOptionIndicatorsFact('SFLNXTCHG') === null);

console.log('\n=== the rule fragments the entries already carried are untouched ===');
check('SFLCSRPRG keeps its SFLLIN cross-record exclusion', !!T.SFLCSRPRG.crossRecordExclusion);
check('SFLRCDNBR and SFLROLVAL keep validOnlyInSubfileControlRecord', !!T.SFLRCDNBR.validOnlyInSubfileControlRecord && !!T.SFLROLVAL.validOnlyInSubfileControlRecord);
check('SFLRTNSEL keeps its SFLSNGCHC / SFLMLTCHC dependency', T.SFLRTNSEL.qualifyingNames.join() === 'SFLSNGCHC,SFLMLTCHC' || T.SFLRTNSEL.qualifyingNames.slice().sort().join() === 'SFLMLTCHC,SFLSNGCHC');
check('SFLNXTCHG keeps its SFLMSGRCD mutex', T.SFLNXTCHG.mutex.join() === 'SFLMSGRCD');

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

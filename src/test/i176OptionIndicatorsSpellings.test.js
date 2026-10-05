/**
 * i176OptionIndicatorsSpellings.test.js
 *
 * Task I-176 - left over from I-174. `KeywordSpec.optionIndicatorsAllowed` read only
 * `optionIndicators: 'valid'`, so it still answered false for the 11 record-level keywords whose
 * I-121a entries spell the same fact `optionIndicatorsValid: true`: ALARM, BLINK, CSRLOC, ERASE,
 * ERASEINP, OVERLAY, PUTOVR, FRCDTA, PROTECT, MDTOFF, LOCK. It now accepts both spellings.
 *
 * Covers: 1. the 11 keywords  2. the two spellings never contradict each other  3. a guard that a
 * new spelling of the fact cannot appear unnoticed  4. other answers unchanged.
 *
 * Run with: node src/test/i176OptionIndicatorsSpellings.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const T = KeywordSpec.RECORD_TYPES;
const names = Object.keys(T);
const ELEVEN = ['ALARM', 'BLINK', 'CSRLOC', 'ERASE', 'ERASEINP', 'OVERLAY', 'PUTOVR', 'FRCDTA', 'PROTECT', 'MDTOFF', 'LOCK'];

console.log('=== 1. the 11 keywords that spell the fact optionIndicatorsValid: true ===');
check('exactly these 11 entries use the optionIndicatorsValid spelling', names.filter((n) => T[n].optionIndicatorsValid === true).sort().join() === ELEVEN.slice().sort().join());
ELEVEN.forEach((k) => check(k + ': optionIndicatorsAllowed is true (KeywordSpec and DspfWriter)', KeywordSpec.optionIndicatorsAllowed(k) === true && DspfWriter.optionIndicatorsAllowed(k) === true));
check('lookup is case- and space-insensitive for them', KeywordSpec.optionIndicatorsAllowed(' blink ') === true && KeywordSpec.optionIndicatorsAllowed('lock') === true);
check('takesNoParameters for these is untouched: it still follows noParameters / parameters "none"', ELEVEN.every((k) => KeywordSpec.takesNoParameters(k) === (T[k].noParameters === true || T[k].parameters === 'none')));

console.log('\n=== 2. the two spellings never contradict each other ===');
check('no entry has optionIndicatorsValid: true beside an optionIndicators value other than "valid"', names.every((n) => T[n].optionIndicatorsValid !== true || T[n].optionIndicators === undefined || T[n].optionIndicators === 'valid'));
check('optionIndicatorsValid is only ever the boolean true (never false / a string)', names.every((n) => !('optionIndicatorsValid' in T[n]) || T[n].optionIndicatorsValid === true));

console.log('\n=== 3. a new spelling of the fact cannot appear unnoticed ===');
// Every entry key that names OPTION indicators must be one of these. A new one fails this check,
// which is the prompt to teach optionIndicatorsAllowed about it (or normalise the entry). Keys about
// RESPONSE indicators and other indicator rules (withResponseIndicator..., setsIndicatorWhen, ...)
// are a different subject and are not matched.
const KNOWN = {
  optionIndicators: 'read: "valid" means allowed',
  optionIndicatorsValid: 'read: true means allowed (I-176)',
  optionIndicatorRequired: 'SFLDLT: the indicator is required, not merely valid',
  noOptionIndicatorsOnField: 'SFLMSGKEY: not valid on the field',
  optionIndicatorNote: 'MSGCON: prose note',
  multipleRequireOptionIndicators: 'MNUBARDSP: a rule about several occurrences'
};
const seen = {};
names.forEach((n) => Object.keys(T[n]).forEach((k) => { if (/optionindicator/i.test(k)) seen[k] = (seen[k] || 0) + 1; }));
const unknown = Object.keys(seen).filter((k) => !(k in KNOWN));
check('every entry key naming option indicators is a known one' + (unknown.length ? ' (new: ' + unknown.join(',') + ')' : ''), unknown.length === 0);
check('the two keys the accessor reads are both actually used', seen.optionIndicators > 50 && seen.optionIndicatorsValid === 11);

console.log('\n=== 4. other answers unchanged ===');
const wrong = names.filter((n) => KeywordSpec.optionIndicatorsAllowed(n) !== (T[n].optionIndicators === 'valid' || T[n].optionIndicatorsValid === true));
check('for all ' + names.length + ' entries the answer is exactly: optionIndicators "valid" OR optionIndicatorsValid true', wrong.length === 0);
check('"notValid" and "required" entries are still false', names.filter((n) => T[n].optionIndicators === 'notValid' || T[n].optionIndicators === 'required').every((n) => !KeywordSpec.optionIndicatorsAllowed(n)));
check('exactly 11 more keywords answer true than under the I-174 read', names.filter((n) => KeywordSpec.optionIndicatorsAllowed(n)).length - names.filter((n) => T[n].optionIndicators === 'valid').length === 11);
check('the panels\' names keep their answers (RETLCKSTS true, RETKEY false, INDARA false, HLPFULL per entry)', KeywordSpec.optionIndicatorsAllowed('RETLCKSTS') && !KeywordSpec.optionIndicatorsAllowed('RETKEY') && !KeywordSpec.optionIndicatorsAllowed('INDARA') && KeywordSpec.optionIndicatorsAllowed('HLPFULL') === (T.HLPFULL.optionIndicators === 'valid'));
check('unknown / prototype / empty names stay false', ['NOTAKEYWORD', 'constructor', '__proto__', null, undefined, ''].every((n) => KeywordSpec.optionIndicatorsAllowed(n) === false));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i174AccessorsReadEveryEntry.test.js
 *
 * Task I-174 - KeywordSpec.takesNoParameters / optionIndicatorsAllowed (reached as
 * DspfWriter.takesNoParameters / optionIndicatorsAllowed) used to answer only for the keywords of
 * the I-121 slices, so they said "no" for MSGALARM, CSRINPONLY and HLPEXCLD although those entries
 * say `parameters: 'none'` / `noParameters: true` and `optionIndicators: 'valid'`. They now read the
 * keyword's own RECORD_TYPES entry whichever task owns it.
 *
 * Covers: 1. the three keywords the gap was found on  2. a table over every RECORD_TYPES entry
 * 3. the callers' answers are unchanged  4. names with no entry.
 *
 * Run with: node src/test/i174AccessorsReadEveryEntry.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const T = KeywordSpec.RECORD_TYPES;
const names = Object.keys(T);
const statesNoParams = (e) => e.noParameters === true || e.parameters === 'none';
const statesIndicators = (e) => e.optionIndicators === 'valid';

console.log('=== 1. the three keywords the gap was found on ===');
['MSGALARM', 'CSRINPONLY', 'HLPEXCLD'].forEach((k) => {
  check(k + ': takesNoParameters and optionIndicatorsAllowed are now true, as its entry says', KeywordSpec.takesNoParameters(k) === true && KeywordSpec.optionIndicatorsAllowed(k) === true);
  check(k + ': the DspfWriter accessors agree', DspfWriter.takesNoParameters(k) === true && DspfWriter.optionIndicatorsAllowed(k) === true);
});
check('RETLCKSTS and INZINP (I-121b) still answer true / true', ['RETLCKSTS', 'INZINP'].every((k) => KeywordSpec.takesNoParameters(k) && KeywordSpec.optionIndicatorsAllowed(k)));

console.log('\n=== 2. a table over every RECORD_TYPES entry ===');
check('the table is not empty: many entries state no-parameters and many state indicators valid', names.filter((n) => statesNoParams(T[n])).length > 40 && names.filter((n) => statesIndicators(T[n])).length > 30);
const wrongNp = names.filter((n) => KeywordSpec.takesNoParameters(n) !== statesNoParams(T[n]));
const wrongOi = names.filter((n) => KeywordSpec.optionIndicatorsAllowed(n) !== statesIndicators(T[n]));
check('takesNoParameters(name) equals what the entry states, for all ' + names.length + ' entries' + (wrongNp.length ? ' (differs: ' + wrongNp.join(',') + ')' : ''), wrongNp.length === 0);
check('optionIndicatorsAllowed(name) equals what the entry states, for all ' + names.length + ' entries' + (wrongOi.length ? ' (differs: ' + wrongOi.join(',') + ')' : ''), wrongOi.length === 0);
check('the DspfWriter accessors give the same answers as KeywordSpec for every entry', names.every((n) => DspfWriter.takesNoParameters(n) === KeywordSpec.takesNoParameters(n) && DspfWriter.optionIndicatorsAllowed(n) === KeywordSpec.optionIndicatorsAllowed(n)));
check('"notValid" and "required" do not count as allowed', names.filter((n) => T[n].optionIndicators === 'notValid' || T[n].optionIndicators === 'required').every((n) => KeywordSpec.optionIndicatorsAllowed(n) === false));
check('a keyword with an object-valued `parameters` is not "no parameters"', names.filter((n) => T[n].parameters && typeof T[n].parameters === 'object' && T[n].noParameters !== true).every((n) => KeywordSpec.takesNoParameters(n) === false));
check('lookup is case- and space-insensitive', KeywordSpec.takesNoParameters(' msgalarm ') === true && KeywordSpec.optionIndicatorsAllowed('csrinponly') === true);

console.log('\n=== 3. the answers the panels already depend on are unchanged ===');
// The webview passes only these literal names; each belongs to an I-121 slice and keeps the answer
// it had before (derived here from the entry, which is what the old accessor returned for them).
const CALLERS = ['DSPRL', 'ERRSFL', 'GETRETAIN', 'HLPCLR', 'HLPCMDKEY', 'HLPFULL', 'HLPSCHIDX', 'IGCCNV', 'INDARA', 'INZINP', 'INZRCD', 'LOGINP', 'LOGOUT', 'OPENPRT', 'RETCMDKEY', 'RETKEY', 'RETLCKSTS', 'RMVWDW', 'RTNDTA', 'USRDSPMGT', 'USRRSTDSP'];
check('every name the panels pass has an entry', CALLERS.every((n) => !!T[n]));
check('for those names the accessors give the same answer as the old I-121-table read (noParameters flag / optionIndicators "valid")', CALLERS.every((n) => KeywordSpec.takesNoParameters(n) === !!T[n].noParameters && KeywordSpec.optionIndicatorsAllowed(n) === (T[n].optionIndicators === 'valid')));
check('a spot check of values the panels rely on: RETKEY / INDARA take no parameters but indicators are not valid; RETLCKSTS has both; IGCCNV takes parameters', KeywordSpec.takesNoParameters('RETKEY') && !KeywordSpec.optionIndicatorsAllowed('RETKEY') && KeywordSpec.takesNoParameters('INDARA') && !KeywordSpec.optionIndicatorsAllowed('INDARA') && KeywordSpec.takesNoParameters('RETLCKSTS') && KeywordSpec.optionIndicatorsAllowed('RETLCKSTS') && !KeywordSpec.takesNoParameters('IGCCNV'));

console.log('\n=== 4. names with no entry ===');
check('an unknown keyword answers false / false', KeywordSpec.takesNoParameters('NOTAKEYWORD') === false && KeywordSpec.optionIndicatorsAllowed('NOTAKEYWORD') === false);
check('object-prototype names do not leak through (constructor, toString, __proto__)', ['constructor', 'toString', '__proto__', 'hasOwnProperty'].every((n) => KeywordSpec.takesNoParameters(n) === false && KeywordSpec.optionIndicatorsAllowed(n) === false));
check('null / undefined / empty are harmless', [null, undefined, ''].every((n) => KeywordSpec.takesNoParameters(n) === false && KeywordSpec.optionIndicatorsAllowed(n) === false));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

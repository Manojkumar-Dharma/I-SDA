/**
 * i121dSubfileModeEntryKeywordSpec.test.js
 *
 * Task I-121d - "One declarative rule spec per keyword", subfile mode and entry
 * keywords slice: SFLMODE, SFLRNA, SFLMSGRCD, SFLDROP, SFLENTER, SFLFOLD
 * (SFLCSRRRN is I-142's entry). Each now has a RECORD_TYPES entry read from
 * DDS_Keyword_V7r6.txt. Pure refactor: no guard changes; relations no guard
 * enforces are recorded as facts and logged as findings.
 *
 * Parts: (1) entries against the reference text; (2) sweeps against
 * NO_OPTION_INDICATORS, the command-key parameter table, the SFL record
 * whitelist, SFLNXTCHG's mutex and I-121c's SFLPAG lists; (3) accessors.
 *
 * Run with: node src/test/i121dSubfileModeEntryKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const SIX = ['SFLMODE', 'SFLRNA', 'SFLMSGRCD', 'SFLDROP', 'SFLENTER', 'SFLFOLD'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, '').replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;
const R = KeywordSpec.RECORD_TYPES;

// ---- 1. entries against the reference text ----
check('the slice owns exactly the six keywords, in order', KeywordSpec.subfileModeEntryKeywords().join() === SIX.join());
SIX.forEach((n) => {
  const e = R[n];
  check(n + ': record level, with a line citation', !!e && e.levels.join() === 'record' && /~line \d+/.test(e.ddsReference));
  check(n + ': heading exists in the reference', has(n + ' (Subfile'));
  check(n + ': record type accessor agrees with the entry', KeywordSpec.subfileModeEntryRecordType(n) === e.onRecordType);
});
check('SFLMSGRCD is on the subfile record, the other five on the control record', R.SFLMSGRCD.onRecordType === 'SFL' && SIX.filter((n) => n !== 'SFLMSGRCD').every((n) => R[n].onRecordType === 'SFLCTL'));
check('SFLMODE: format and required parameter', has('SFLMODE(&mode);') && has('The mode parameter is required.') && R.SFLMODE.parameters === 'required');
check('SFLMODE: field is A, length 1, usage H; 0 folded, 1 truncated, 0 without DROP/FOLD', has('character (A in position 35) field of length 1 with usage H (hidden)') && has('value 0 if the subfile is in folded mode; it will contain the value 1 if the subfile is in truncated mode') && has('the mode value returned is 0') && (() => { const f = KeywordSpec.sflmodeField(); return f.dataType === 'A' && f.length === 1 && f.usage === 'H' && f.foldedValue === '0' && f.truncatedValue === '1' && f.valueWithoutDropOrFold === '0'; })());
check('SFLRNA: requires SFLINZ, not on a message subfile, not with field selection, no parameters', has('The SFLINZ keyword is required when SFLRNA is specified.') && has('SFLRNA cannot be specified for a message subfile') && has('SFLRNA is not valid.') && KeywordSpec.sflrnaRequires().join() === 'SFLINZ' && R.SFLRNA.notOnMessageSubfile && R.SFLRNA.excludedWithFieldSelection && R.SFLRNA.parameters === 'none');
check('SFLMSGRCD: format, display size names valid, no option indicators', has('SFLMSGRCD(line-number)') && has('Option indicators are not valid for this keyword; display size condition names are valid.') && R.SFLMSGRCD.optionIndicators === 'notValid' && R.SFLMSGRCD.displaySizeNames === 'valid');
const m = KeywordSpec.messageSubfileFacts();
check('SFLMSGRCD: two predefined fields (A4 hidden + SFLMSGKEY, A10 hidden + SFLPGMQ)', has('A 4-position, character data type, hidden field.') && has('A 10-position, character data type, hidden field.') && m.predefinedFields.length === 2 && m.predefinedFields[0].length === 4 && m.predefinedFields[0].requires === 'SFLMSGKEY' && m.predefinedFields[1].length === 10 && m.predefinedFields[1].requires === 'SFLPGMQ' && m.predefinedFields.every((f) => f.dataType === 'A' && f.usage === 'H'));
check('SFLMSGRCD: SFLINZ needs SFLPGMQ; message text 76 / 128 starting in position 2', has('you cannot specify the SFLINZ keyword without specifying SFLPGMQ') && m.requiresWithSflinz === 'SFLPGMQ' && has('maximum message length for the 24 x 80 display size is 76') && has('27 x 132 display size is 128') && m.messageTextMaxLength['24x80'] === 76 && m.messageTextMaxLength['27x132'] === 128 && m.messageStartPosition === 2);
['SFLDROP', 'SFLENTER', 'SFLFOLD'].forEach((n) => check(n + ': format ' + n + '(CAnn | CFnn), parameter required', has(n + '(CAnn | CFnn)') && R[n].parameterGrammar === n + '(CAnn | CFnn)' && R[n].parameters === 'required'));
check('SFLDROP / SFLFOLD: option indicators valid; SFLENTER: not valid', has('Option indicators are not valid for this keyword. Note: This keyword is in effect only until the next output operation') && R.SFLDROP.optionIndicators === 'valid' && R.SFLFOLD.optionIndicators === 'valid' && R.SFLENTER.optionIndicators === 'notValid');
check('SFLDROP starts truncated, SFLFOLD starts folded', has('first displays the subfile in truncated form') && has('the subfile is first displayed in folded form') && R.SFLDROP.startsTruncated === true && R.SFLFOLD.startsTruncated === false);
['SFLDROP', 'SFLFOLD'].forEach((n) => {
  const f = KeywordSpec.foldDropRules(n);
  check(n + ': ignored when size equals page, not valid with field selection, paired with the other, SFLFOLD wins, same key', f.ignoredWhenSizeEqualsPage && f.notValidWithFieldSelection && f.pairedWith.keyword === (n === 'SFLDROP' ? 'SFLFOLD' : 'SFLDROP') && f.pairedWith.sameKeyRequired && f.pairedWith.winnerWhenBothActive === 'SFLFOLD');
});
check('fold / drop notes are in the reference', has('Both keywords must use the same key.') && has('If both keywords are active, SFLFOLD is used') || has('SFLFOLD is used.'));

// ---- 2. sweeps ----
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
SIX.forEach((n) => check(n + ': in KEYWORD-LOOKUP.json', Object.prototype.hasOwnProperty.call(lookup, n)));
SIX.forEach((n) => {
  const noInd = !!KeywordSpec.noOptionIndicatorsFact(n);
  check(n + ': option-indicator mode agrees with the no-option-indicators table (' + (noInd ? 'notValid' : 'valid') + ')', noInd === (KeywordSpec.subfileModeEntryIndicatorMode(n) === 'notValid'));
});
['SFLDROP', 'SFLENTER', 'SFLFOLD'].forEach((n) => check(n + ': command-key table says CA and CF, matching the grammar', (KeywordSpec.commandKeyParameterKeyTypes(n) || []).join() === 'CA,CF'));
check('the command-key table is not repeated on the six entries', SIX.every((n) => R[n].keyTypes === undefined));
check('the message-subfile record whitelist (SFLMSG) carries SFLMSGRCD', KeywordSpec.isWhitelisted('SFLMSG', 'SFLMSGRCD'));
check('SFLNXTCHG refuses SFLMSGRCD (stated once, on SFLNXTCHG)', KeywordSpec.isMutex('SFLNXTCHG', 'SFLMSGRCD'));
check('I-121c SFLPAG lists name SFLDROP and SFLFOLD (this slice agrees)', ['SFLDROP', 'SFLFOLD'].every((k) => KeywordSpec.excludedWhenSizeEqualsPage().indexOf(k) !== -1 && KeywordSpec.excludedWithFieldSelection().indexOf(k) !== -1 && KeywordSpec.foldDropRules(k).ignoredWhenSizeEqualsPage && KeywordSpec.foldDropRules(k).notValidWithFieldSelection));
check('SFLINZ field-selection and message-subfile notes agree with SFLRNA', R.SFLINZ.excludedWithFieldSelection === R.SFLRNA.excludedWithFieldSelection && /SFLMSGRCD/.test(R.SFLINZ.ddsReference));
check('SFLCSRRRN (I-142) is untouched by this slice', !!R.SFLCSRRRN.relativeRecordField && SIX.indexOf('SFLCSRRRN') === -1);
// Task I-147 widened requiredFor with the five I-121c keywords; Task I-157 then added this slice's five control-record keywords (the finding I-147 logged). SFLMSGRCD is on the subfile record, so it stays out.
check('this slice\'s five control-record keywords are in SFLCTL requiredFor (I-157); SFLMSGRCD is not', ['SFLMODE', 'SFLRNA', 'SFLDROP', 'SFLENTER', 'SFLFOLD'].every((k) => R.SFLCTL.requiredFor.indexOf(k) !== -1) && R.SFLCTL.requiredFor.indexOf('SFLMSGRCD') === -1 && R.SFLCTL.requiredFor.join() === 'SFLCSRRRN,SFLDLT,SFLINZ,SFLPAG,SFLCLR,SFLDSP,SFLDSPCTL,SFLEND,SFLDROP,SFLENTER,SFLFOLD,SFLMODE,SFLRNA');

// ---- 3. accessors ----
check('accessors are case/blank safe and null for other keywords', KeywordSpec.subfileModeEntryRecordType('sflmode') === 'SFLCTL' && KeywordSpec.subfileModeEntryRecordType('') === null && KeywordSpec.subfileModeEntryRecordType(null) === null && KeywordSpec.subfileModeEntryIndicatorMode('SFLPAG') === null && KeywordSpec.foldDropRules('SFLENTER') === null && KeywordSpec.foldDropRules(null) === null);
check('list / object accessors return copies', (() => { KeywordSpec.sflrnaRequires().push('X'); KeywordSpec.subfileModeEntryKeywords().pop(); KeywordSpec.sflmodeField().length = 9; KeywordSpec.messageSubfileFacts().predefinedFields.pop(); KeywordSpec.foldDropRules('SFLDROP').pairedWith.keyword = 'X'; return KeywordSpec.sflrnaRequires().length === 1 && KeywordSpec.subfileModeEntryKeywords().length === 6 && KeywordSpec.sflmodeField().length === 1 && KeywordSpec.messageSubfileFacts().predefinedFields.length === 2 && KeywordSpec.foldDropRules('SFLDROP').pairedWith.keyword === 'SFLFOLD'; })());

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

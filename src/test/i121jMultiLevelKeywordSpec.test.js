/**
 * i121jMultiLevelKeywordSpec.test.js
 *
 * Task I-121j - "One declarative rule spec per keyword", keywords valid at several
 * levels slice: CHANGE, OVRATR, OVRDTA, PUTRETAIN, TEXT, INDTXT. Each now has a
 * RECORD_TYPES entry read from DDS_Keyword_V7r6.txt. Pure refactor: no guard
 * changes; rules no guard enforces are recorded as facts and logged as findings.
 *
 * Parts: (1) entries against the reference text (each keyword's own section);
 * (2) sweeps against KEYWORD-LOOKUP.json, the no-option-indicators table, the
 * PULLDOWN exclusion list, PUTOVR's single-owner exclusion, the writer and the
 * webview file-level panel; (3) accessors.
 *
 * Run with: node src/test/i121jMultiLevelKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check, failureCount } = require('./helpers/harness');

const SIX = ['CHANGE', 'OVRATR', 'OVRDTA', 'PUTRETAIN', 'TEXT', 'INDTXT'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, '').replace(/\s+/g, ' ');
const norm = (t) => t.replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(norm(t)) !== -1;
const R = KeywordSpec.RECORD_TYPES;

const HEADINGS = {
  CHANGE: 'CHANGE (Change) keyword for display files',
  OVRATR: 'OVRATR (Override Attribute) keyword for display files',
  OVRDTA: 'OVRDTA (Override Data) keyword for display files',
  PUTRETAIN: 'PUTRETAIN (Put-Retain) keyword for display files',
  TEXT: 'TEXT (Text) keyword for display files',
  INDTXT: 'INDTXT (Indicator Text) keyword for display files'
};
// The keyword's own section: from its heading (the table-of-contents line is followed by dots, not by "You use")
// to the next "<name> keyword(s) for display files You use" heading.
function sect(name) {
  const h = HEADINGS[name];
  const start = REF.indexOf(h + ' You use this');
  if (start === -1) return '';
  const rest = REF.slice(start + h.length);
  const ends = [rest.indexOf(' keyword for display files You use'), rest.indexOf(' keywords for display files You use')].filter((i) => i > 0);
  return rest.slice(0, ends.length ? Math.min.apply(null, ends) : rest.length);
}
const inSect = (name, t) => sect(name).indexOf(norm(t)) !== -1;

// ---- 1. entries against the reference text ----
check('the slice owns exactly the six keywords, in order', KeywordSpec.multiLevelKeywords().join() === SIX.join());
SIX.forEach((n) => {
  const e = R[n];
  check(n + ': has an entry with a line citation', !!e && /~line \d+/.test(e.ddsReference));
  check(n + ': its own section exists in the reference', sect(n).length > 100);
});

check('CHANGE: record or field level, sets the response indicator on an input operation', inSect('CHANGE', 'You use this record-level or field-level keyword to set on the specified response indicator for an input operation.') && R.CHANGE.levels.join() === 'record,field');
check('CHANGE: record level = any input-capable field has its MDT on; field level = that field', inSect('CHANGE', 'The keyword is specified at the record level, and any input-capable field in the record format has its modified data tag (MDT) set on.') && inSect('CHANGE', 'The keyword is specified for an input-capable field, and that field has its changed data tag (MDT) set on.') && !!R.CHANGE.setsIndicatorWhen.record && !!R.CHANGE.setsIndicatorWhen.field);
check('CHANGE: grammar CHANGE(response-indicator [\'text\']), quotes required, 50 characters', inSect('CHANGE', "CHANGE(response-indicator ['text'])") && inSect('CHANGE', 'The single quotation marks are required.') && inSect('CHANGE', 'the text is truncated to 50 characters on the program computer printout') && R.CHANGE.parameters === 'required' && R.CHANGE.textQuoted === true && R.CHANGE.textMaxLength === 50);
check('CHANGE: not set by CAnn, Help, Print, Home or Clear; stays on through validity errors', inSect('CHANGE', 'The CHANGE response indicator is not set on when a command attention key (CAnn, Help, Print, Home, or Clear) is pressed.') && R.CHANGE.notSetByCommandKeys.join() === 'CAnn,Help,Print,Home,Clear' && inSect('CHANGE', 'remain on until all validity checks succeed and the record is passed to your program') && R.CHANGE.indicatorStaysOnThroughValidityErrors === true);
check('CHANGE: option indicators are not valid', inSect('CHANGE', 'Option indicators are not valid for this keyword.') && R.CHANGE.optionIndicators === 'notValid');

check('OVRATR: record or field level, used with PUTOVR, can combine with OVRDTA', inSect('OVRATR', 'You use this field-level or record-level keyword with the PUTOVR keyword to override the existing display attributes') && inSect('OVRATR', 'The OVRATR keyword can be used with the OVRDTA keyword on the same field or record.') && R.OVRATR.levels.join() === 'record,field' && R.OVRATR.usedWith === 'PUTOVR' && R.OVRATR.canCombineWith.join() === 'OVRDTA');
check('OVRATR: the field-level specification wins over the record-level one', inSect('OVRATR', 'When OVRATR is specified at both the record and field level, the field level specification is used for that field.') && R.OVRATR.fieldLevelWinsOverRecordLevel === true);
check('OVRATR: no parameters, option indicators valid', inSect('OVRATR', 'This keyword has no parameters.') && inSect('OVRATR', 'Option indicators are valid for this keyword.') && R.OVRATR.parameters === 'none' && R.OVRATR.optionIndicators === 'valid');
check('OVRATR: overridable attributes CHECK(ER), CHECK(ME), DSPATR except OID and SP, DUP', inSect('OVRATR', 'CHECK(ER) CHECK(ME) DSPATR (all except OID and SP) DUP') && R.OVRATR.overridableAttributes.length === 4);
check('OVRATR: field level valid on input-only, output-only, input/output and constant fields', inSect('OVRATR', 'it is valid only with the following types of fields:') && ['Input-only', 'Output-only', 'Input/output', 'Constant'].every((t) => inSect('OVRATR', t)) && R.OVRATR.fieldLevel.allowedUsage.join() === 'I,O,B' && R.OVRATR.fieldLevel.constantFields === true);

check('OVRDTA: record or field level, used with PUTOVR, can combine with OVRATR, field level wins', inSect('OVRDTA', 'You use this field-level or record-level keyword with the PUTOVR keyword to override the existing data contents') && inSect('OVRDTA', 'The OVRDTA keyword can be used with the OVRATR keyword on the same field or record.') && inSect('OVRDTA', 'the field-level specification will be used for that field') && R.OVRDTA.levels.join() === 'record,field' && R.OVRDTA.canCombineWith.join() === 'OVRATR' && R.OVRDTA.fieldLevelWinsOverRecordLevel === true);
check('OVRDTA: no parameters, option indicators valid', inSect('OVRDTA', 'This keyword has no parameters.') && inSect('OVRDTA', 'Option indicators are valid for this keyword.') && R.OVRDTA.parameters === 'none' && R.OVRDTA.optionIndicators === 'valid');
check('OVRDTA: required when DFT is on an output-only or input/output field', inSect('OVRDTA', 'OVRDTA is required if the DFT keyword is specified for output-only or input/output fields.') && R.OVRDTA.requiredWhenFieldHas.keyword === 'DFT' && R.OVRDTA.requiredWhenFieldHas.onUsage.join() === 'O,B');
check('OVRDTA: field level valid on output-only, input/output and message fields (not constant)', inSect('OVRDTA', 'it is valid only with the following types of fields:') && ['Output-only', 'Input/output', 'Message'].every((t) => inSect('OVRDTA', t)) && !inSect('OVRDTA', 'Constant') && R.OVRDTA.fieldLevel.allowedUsage.join() === 'O,B,M' && R.OVRDTA.fieldLevel.constantFields === false);

check('PUTRETAIN: record or field level, no parameters, option indicators valid', inSect('PUTRETAIN', 'You use this record-level or field-level keyword with the OVERLAY keyword to prevent the IBM i operating system from deleting data') && inSect('PUTRETAIN', 'This keyword has no parameters.') && inSect('PUTRETAIN', 'Option indicators are valid for this keyword.') && R.PUTRETAIN.levels.join() === 'record,field' && R.PUTRETAIN.parameters === 'none' && R.PUTRETAIN.optionIndicators === 'valid');
check('PUTRETAIN: OVERLAY must be specified, otherwise it is ignored', inSect('PUTRETAIN', 'The OVERLAY keyword must be specified whenever PUTRETAIN is specified.') && inSect('PUTRETAIN', 'If the OVERLAY keyword is not in effect, PUTRETAIN is ignored') && R.PUTRETAIN.requiresRecordKeyword === 'OVERLAY' && R.PUTRETAIN.ignoredWithoutOverlay === true);
check('PUTRETAIN: only for the record format it is on, and only if already displayed', inSect('PUTRETAIN', 'PUTRETAIN applies only to the record format for which it is specified, and then only if the record is already displayed.') && R.PUTRETAIN.appliesOnlyToRecordAlreadyDisplayed === true);
check('PUTRETAIN: more than one field but once per field; both levels of one record', inSect('PUTRETAIN', 'This keyword can be specified for more than one field of a record format, but only once per field.') && inSect('PUTRETAIN', 'This keyword can be specified at the record level and at the field level within the same record format.') && R.PUTRETAIN.oncePerField === true && R.PUTRETAIN.allowedAtBothLevelsOfOneRecord === true);
check('PUTRETAIN: cannot be specified with PUTOVR (recorded once, on PUTOVR)', inSect('PUTRETAIN', 'PUTRETAIN cannot be specified with the PUTOVR keyword.') && has('The PUTRETAIN keyword and the PUTOVR keyword cannot be specified on the same record format.'));
check('PUTRETAIN: DSPMOD warning at creation, ignored on a display mode change, RSTDSP(*YES) recommended', inSect('PUTRETAIN', 'A warning message appears at file creation time if the PUTRETAIN keyword is specified on a record with the DSPMOD keyword.') && inSect('PUTRETAIN', 'At run time, the PUTRETAIN keyword is ignored when the display mode changes.') && inSect('PUTRETAIN', 'you should also specify RSTDSP(*YES)') && R.PUTRETAIN.warnsAtCreationWith.join() === 'DSPMOD' && R.PUTRETAIN.ignoredWhenDisplayModeChanges === true && R.PUTRETAIN.recommendedFileCreationOption === 'RSTDSP(*YES)');

check('INDTXT: file, record or field level, once per response or option indicator', inSect('INDTXT', 'You use this file-level, record-level, or field-level keyword to associate a descriptive text') && inSect('INDTXT', 'You can specify the keyword once for each response and option indicator.') && R.INDTXT.levels.join() === 'file,record,field' && R.INDTXT.oncePerIndicator === true);
check("INDTXT: grammar INDTXT(indicator 'indicator-text'), text required, quotes required, 50 characters", inSect('INDTXT', "INDTXT(indicator 'indicator-text')") && inSect('INDTXT', 'indicator-text is a required parameter value') && inSect('INDTXT', 'The single quotation marks are required.') && inSect('INDTXT', 'truncated to 50 characters') && R.INDTXT.parameters === 'required' && R.INDTXT.textRequired === true && R.INDTXT.textQuoted === true && R.INDTXT.textMaxLength === 50);
check('INDTXT: option indicators not valid', inSect('INDTXT', 'Option indicators are not valid for this keyword.') && R.INDTXT.optionIndicators === 'notValid');
check('INDTXT: does not add the indicator to a record area; text lost silently if unused; no second text assignment', inSect('INDTXT', 'The INDTXT keyword by itself does not cause the specified indicator to appear in either the input or the output record area.') && inSect('INDTXT', 'then the text is lost without a diagnostic message') && inSect('INDTXT', 'no other text assignment is allowed') && R.INDTXT.doesNotAddIndicatorToRecordArea === true && R.INDTXT.textLostSilentlyWhenIndicatorUnused === true && R.INDTXT.noOtherTextAssignmentAllowed === true);

check('TEXT: record or field level (no file-level form)', inSect('TEXT', 'You use this record- or field-level keyword to supply a text description') && !/file-level/.test(sect('TEXT')) && R.TEXT.levels.join() === 'record,field' && R.TEXT.fileLevelForm === false);
check('TEXT: valid for any record format or field except a SFLMSGKEY or SFLPGMQ field', inSect('TEXT', 'TEXT is valid for any record format or field, except a SFLMSGKEY or SFLPGMQ field.') && R.TEXT.validForAnyRecordFormat === true && R.TEXT.notValidOnFieldsWithKeyword.join() === 'SFLMSGKEY,SFLPGMQ');
check("TEXT: grammar TEXT('description'), quotes required, first 50 characters used", inSect('TEXT', "TEXT('description')") && inSect('TEXT', 'The text must be enclosed in single quotation marks.') && inSect('TEXT', 'only the first 50 characters are used by the high-level language compiler') && R.TEXT.parameters === 'required' && R.TEXT.textQuoted === true && R.TEXT.textMaxLength === 50);
check('TEXT: option indicators not valid', inSect('TEXT', 'Option indicators are not valid for this keyword.') && R.TEXT.optionIndicators === 'notValid');

// ---- 2. sweeps ----
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
SIX.forEach((n) => {
  const lv = Array.from(new Set((lookup[n] || []).map((e) => e.level))).sort();
  check(n + ': the levels in KEYWORD-LOOKUP.json are exactly the spec levels', lv.join() === R[n].levels.slice().sort().join());
});
['CHANGE', 'INDTXT', 'TEXT'].forEach((n) => {
  const f = KeywordSpec.noOptionIndicatorsFact(n);
  check(n + ': in the no-option-indicators table at exactly the spec levels', !!f && f.levels.slice().sort().join() === R[n].levels.slice().sort().join());
  check(n + ': the spec\'s indicator mode agrees with that table', KeywordSpec.multiLevelIndicatorMode(n) === 'notValid');
});
['OVRATR', 'OVRDTA', 'PUTRETAIN'].forEach((n) => {
  check(n + ': not in the no-option-indicators table, indicator mode valid', !KeywordSpec.noOptionIndicatorsFact(n) && KeywordSpec.multiLevelIndicatorMode(n) === 'valid');
});
// the PULLDOWN exclusion list is the single owner of the PULLDOWN fact; the spec and the writer agree with it
const pullRec = [{ name: 'PULLDOWN', parameters: '', conditions: [] }];
SIX.forEach((n) => {
  const excluded = ['OVRATR', 'OVRDTA', 'PUTRETAIN'].indexOf(n) !== -1;
  check(n + ': ' + (excluded ? 'is' : 'is not') + ' in PULLDOWN\'s exclusion list', R.PULLDOWN.mutex.indexOf(n) !== -1 === excluded);
  check(n + ': the writer ' + (excluded ? 'refuses' : 'allows') + ' it on a PULLDOWN record', !!DspfWriter.pulldownConflictReason(n, pullRec) === excluded);
});
check('PUTOVR owns the PUTRETAIN exclusion once; none of the six repeats it', R.PUTOVR.mutex.indexOf('PUTRETAIN') !== -1 && SIX.every((n) => R[n].mutex === undefined));
// the three response / option indicator facts live in other tables and are not repeated
check('CHANGE and INDTXT stay in the repeatable response-indicator rows, not copied into the entries', Object.prototype.hasOwnProperty.call(lookup, 'CHANGE') && lookup.CHANGE.some((e) => e.repeatable) && lookup.INDTXT.some((e) => e.repeatable) && R.CHANGE.repeatable === undefined && R.INDTXT.repeatable === undefined);
// the file-level panel offers INDTXT only, matching the levels
const filePanels = Object.keys(WebviewClientHelpers.fileKeywordsPanelsHtml([], new Set())).map((k) => WebviewClientHelpers.fileKeywordsPanelsHtml([], new Set())[k]).join('');
check('file-level panel: INDTXT row present (spec: file level)', R.INDTXT.levels.indexOf('file') !== -1 && /fk-indtxt/.test(filePanels));
check('file-level panel: no TEXT, CHANGE, OVRATR, OVRDTA or PUTRETAIN row (spec: no file level)', ['TEXT', 'CHANGE', 'OVRATR', 'OVRDTA', 'PUTRETAIN'].every((n) => R[n].levels.indexOf('file') === -1) && !/fk-text|fk-change|fk-ovratr|fk-ovrdta|fk-putretain/i.test(filePanels));
// Usage M / P rows of the field-level General keywords panel agree with the spec's usage lists
function rowShown(name, usage) {
  const html = WebviewClientHelpers.generalFieldKeywordsHtml([], 'x', new Set(), 'A', usage, [], false, '');
  return html.indexOf('x-gen-' + name.toLowerCase()) !== -1;
}
check('field panel, usage M: OVRDTA shown, OVRATR and PUTRETAIN not (OVRDTA allows M, the others do not)', rowShown('OVRDTA', 'M') === (R.OVRDTA.fieldLevel.allowedUsage.indexOf('M') !== -1) && rowShown('OVRATR', 'M') === (R.OVRATR.fieldLevel.allowedUsage.indexOf('M') !== -1) && !rowShown('PUTRETAIN', 'M'));
check('field panel, usage P: none of OVRATR, OVRDTA, PUTRETAIN shown (no spec usage list contains P)', ['OVRATR', 'OVRDTA', 'PUTRETAIN'].every((n) => !rowShown(n, 'P') && R[n].levels.indexOf('field') !== -1 && (!R[n].fieldLevel || R[n].fieldLevel.allowedUsage.indexOf('P') === -1)));
check('field panel: TEXT and INDTXT shown for every usage incl. M and P (valid on any field)', ['I', 'O', 'B', 'H', 'M', 'P'].every((u) => rowShown('TEXT', u) && rowShown('INDTXT', u)));

// ---- 3. accessors ----
check('accessors are case/blank safe and null for other keywords', KeywordSpec.multiLevelLevels('indtxt').join() === 'file,record,field' && KeywordSpec.multiLevelLevels('') === null && KeywordSpec.multiLevelLevels('DUP') === null && KeywordSpec.multiLevelFacts('DUP') === null && KeywordSpec.multiLevelIndicatorMode('DUP') === null && KeywordSpec.multiLevelValidAt('DUP', 'field') === null);
check('multiLevelValidAt: TEXT is valid at record and field, not at file; INDTXT at all three', KeywordSpec.multiLevelValidAt('TEXT', 'record') === true && KeywordSpec.multiLevelValidAt('TEXT', 'field') === true && KeywordSpec.multiLevelValidAt('TEXT', 'file') === false && ['file', 'record', 'field'].every((lv) => KeywordSpec.multiLevelValidAt('INDTXT', lv) === true));
check('multiLevelFacts drops the prose and returns a copy', (() => {
  const f = KeywordSpec.multiLevelFacts('PUTRETAIN');
  const before = R.PUTRETAIN.levels.length;
  f.levels.pop(); f.warnsAtCreationWith.pop();
  return f.ddsReference === undefined && f.requiresRecordKeyword === 'OVERLAY' && R.PUTRETAIN.levels.length === before && R.PUTRETAIN.warnsAtCreationWith.length === 1;
})());
check('list / level accessors return copies', (() => {
  KeywordSpec.multiLevelKeywords().pop(); KeywordSpec.multiLevelLevels('CHANGE').push('x');
  return KeywordSpec.multiLevelKeywords().length === 6 && KeywordSpec.multiLevelLevels('CHANGE').length === 2;
})());

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i121iCursorMessageHelpTitleSpec.test.js
 *
 * Task I-121i - "One declarative rule spec per keyword", cursor, message and
 * help-title keywords slice: CSRINPONLY, ENTFLDATR, MSGALARM, HLPTITLE. Each now
 * has a RECORD_TYPES entry read from DDS_Keyword_V7r6.txt. Pure refactor: no
 * guard changes; rules no guard enforces are recorded as facts and logged as
 * findings.
 *
 * Parts: (1) entries against the reference text; (2) sweeps against
 * KEYWORD-LOOKUP.json, the no-option-indicators table (HLPTITLE's file-level
 * fact), the writer's reading of ENTFLDATR and the field-keyword category
 * rule; (3) accessors.
 *
 * Run with: node src/test/i121iCursorMessageHelpTitleSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check, failureCount } = require('./helpers/harness');

const FOUR = ['CSRINPONLY', 'ENTFLDATR', 'MSGALARM', 'HLPTITLE'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, '').replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;
const R = KeywordSpec.RECORD_TYPES;

// ---- 1. entries against the reference text ----
check('the slice owns exactly the four keywords, in order', KeywordSpec.cursorMessageHelpKeywords().join() === FOUR.join());
FOUR.forEach((n) => {
  const e = R[n];
  check(n + ': has an entry with a line citation', !!e && /~line \d+/.test(e.ddsReference));
  check(n + ': heading exists in the reference', has(n + ' ('));
});
check('CSRINPONLY: file or record, no parameters, indicators valid, arrow keys only', has('You use this file-level or record-level keyword to restrict cursor movement to input-capable positions only.') && has('This keyword only affects cursor movement caused by using the arrow keys.') && has('This keyword has no parameters.') && KeywordSpec.cursorMessageHelpLevels('CSRINPONLY').join() === 'file,record' && R.CSRINPONLY.parameters === 'none' && KeywordSpec.cursorMessageHelpIndicatorMode('CSRINPONLY', 'record') === 'valid');
check('MSGALARM: file or record, no parameters, indicators valid', has('You use this file-level or record-level keyword to specify that the system is to sound the audible alarm') && has('Option indicators are valid with this keyword.') && KeywordSpec.cursorMessageHelpLevels('MSGALARM').join() === 'file,record' && R.MSGALARM.parameters === 'none' && KeywordSpec.cursorMessageHelpIndicatorMode('MSGALARM', 'file') === 'valid');
check('MSGALARM: sounds with ERRMSG / ERRMSGID / SFLMSG / SFLMSGID or a validity error; once with ALARM', has('when this record is displayed with an active ERRMSG, ERRMSGID, SFLMSG, or SFLMSGID keyword, or when a validity checking error is detected') && KeywordSpec.msgalarmTriggers().join() === 'ERRMSG,ERRMSGID,SFLMSG,SFLMSGID' && R.MSGALARM.soundsOnValidityCheckError && has('the alarm sounds only once.') && R.MSGALARM.withAlarmSoundsOnce);
check('ENTFLDATR: field, record or file level', has('You use this field-level, record-level, or file-level keyword to define that the leading attribute of the field') && KeywordSpec.cursorMessageHelpLevels('ENTFLDATR').join() === 'field,record,file');
const ef = KeywordSpec.entFldAtrRules();
check('ENTFLDATR: grammar and optional parameters', has('ENTFLDATR[([color] [display attribute] [cursor visible])]') && has('The parameters are optional for the keyword.') && R.ENTFLDATR.parameters === 'optional' && R.ENTFLDATR.parameterGrammar === 'ENTFLDATR[([color] [display attribute] [cursor visible])]');
check('ENTFLDATR: colour values BLU GRN PNK RED TRQ YLW WHT, default white', has('(*COLOR value)') && ef.color.values.join() === 'BLU,GRN,PNK,RED,TRQ,YLW,WHT' && ef.color.default === 'WHT' && has('If the color parameter is not specified, the default is white.') && ef.color.values.every((c) => has(c + ' ')));
check('ENTFLDATR: display attributes BL CS HI ND RI UL, default HI', has('(*DSPATR value1 <value2 <value3...>>)') && ef.displayAttribute.values.join() === 'BL,CS,HI,ND,RI,UL' && ef.displayAttribute.default.join() === 'HI' && has('The default display attribute is HI.'));
check('ENTFLDATR: *CURSOR default, *NOCURSOR needs data type I', ef.cursorVisible.values.join() === '*CURSOR,*NOCURSOR' && ef.cursorVisible.default === '*CURSOR' && ef.cursorVisible.noCursorNeedsDataType === 'I' && has('*CURSOR is the default.') && has('the specified field must have an I (inhibit keyword entry) in position 35'));
check('ENTFLDATR: input-capable field, field level wins, ignored with DSPATR(PR), unpredictable with EDTMSK', has('The field containing the ENTFLDATR keyword must be an input-capable field.') && ef.fieldLevel.allowedUsage.join() === 'I,B' && has('the field-level specification is used for the field') && R.ENTFLDATR.fieldLevelWinsOverRecordLevel && has('The ENTFLDATR keyword is ignored for the field with DSPATR(PR).') && R.ENTFLDATR.ignoredWithDspatrPR && has('If the ENTFLDATR keyword is specified with the EDTMSK keyword, you might have unpredictable results.') && R.ENTFLDATR.unpredictableWith.join() === 'EDTMSK' && has('Option indicators are valid for this keyword.') && KeywordSpec.cursorMessageHelpIndicatorMode('ENTFLDATR', 'field') === 'valid');
const hr = KeywordSpec.hlptitleRules();
check('HLPTITLE: file or record, HLPTITLE(\'text\') required, 55 characters', has('You use this file-level or record-level keyword to define the default title of online help information') && has('HLPTITLE(\'text\')') && has('The text can be up to 55 characters long.') && R.HLPTITLE.parameters === 'required' && hr.textMaxLength === 55 && KeywordSpec.cursorMessageHelpLevels('HLPTITLE').join() === 'file,record');
check('HLPTITLE: needs a HLPPNLGRP; not valid on records without help specifications', has('the file must contain at least one HLPPNLGRP keyword at either the file or help specification level') && hr.requiresInFile.join() === 'HLPPNLGRP' && has('The HLPTITLE keyword is not valid on records that do not contain help specifications.') && hr.notValidOnRecordsWithoutHelpSpecs);
check('HLPTITLE: file-level required with a file-level HLPPNLGRP and no help specs; else one per record with help specs', has('the HLPTITLE keyword is required at the file level') && /HLPPNLGRP and no help specifications/.test(R.HLPTITLE.fileLevelRequiredWhen) && has('at least one HLPTITLE keyword is required on every record that contains help specifications') && /no file-level HLPTITLE/.test(R.HLPTITLE.recordRequiredWhen));
check('HLPTITLE: indicators not valid at file level, valid at record level, required on each when several, max 15', has('Option indicators are not valid on a file-level HLPTITLE keyword.') && has('must be specified on each HLPTITLE keyword if the record contains multiple HLPTITLE keywords') && has('You can specify a maximum of 15 HLPTITLE keywords on a record if all have option indicators.') && KeywordSpec.cursorMessageHelpIndicatorMode('HLPTITLE', 'file') === 'notValid' && KeywordSpec.cursorMessageHelpIndicatorMode('HLPTITLE', 'record') === 'valid' && hr.indicatorsRequiredOnEachWhenMultiple && hr.maxPerRecordWithIndicators === 15 && R.HLPTITLE.firstInEffectUsed && has('At run time, the first HLPTITLE keyword in effect is used.'));

// ---- 2. sweeps ----
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
FOUR.forEach((n) => check(n + ': in KEYWORD-LOOKUP.json', Object.prototype.hasOwnProperty.call(lookup, n)));
check('the no-option-indicators table holds only HLPTITLE of the four, as a file-level-only fact', FOUR.filter((n) => KeywordSpec.noOptionIndicatorsFact(n)).join() === 'HLPTITLE' && KeywordSpec.noOptionIndicatorsFact('HLPTITLE').fileLevelOnly === true);
check('the spec\'s indicator mode agrees with that table at every level', FOUR.every((n) => ['file', 'record', 'field'].every((lv) => {
  const mode = KeywordSpec.cursorMessageHelpIndicatorMode(n, lv);
  if (!KeywordSpec.cursorMessageHelpLevels(n).includes(lv)) return true;
  const fact = KeywordSpec.noOptionIndicatorsFact(n);
  const notValid = !!fact && (!fact.fileLevelOnly || lv === 'file');
  return (mode === 'notValid') === notValid;
})));
// the writer reads every documented ENTFLDATR parameter the way the spec lists it
ef.color.values.forEach((c) => {
  const st = DspfWriter.getChoiceColorState([{ name: 'ENTFLDATR', parameters: '(*COLOR ' + c + ')', conditions: [] }], 'ENTFLDATR');
  check('writer reads (*COLOR ' + c + ')', st.present && st.color === c);
});
check('writer reads every documented display attribute', ef.displayAttribute.values.every((a) => DspfWriter.getChoiceColorState([{ name: 'ENTFLDATR', parameters: '(*DSPATR ' + a + ')', conditions: [] }], 'ENTFLDATR').attrs.join() === a));
check('writer reads *NOCURSOR and the bare keyword', DspfWriter.getChoiceColorState([{ name: 'ENTFLDATR', parameters: '*NOCURSOR', conditions: [] }], 'ENTFLDATR').cursorVisible === 'NOCURSOR' && DspfWriter.getChoiceColorState([{ name: 'ENTFLDATR', parameters: '', conditions: [] }], 'ENTFLDATR').present);
// the field-level eligibility the panel uses (input-capable only) agrees with the spec's usage list
['I', 'B', 'O', 'H', 'P', 'M'].forEach((u) => {
  const vis = WebviewClientHelpers.fieldKeywordCategoryVisibility(u, 'A');
  check('input-keywords category for usage ' + u + ' agrees with ENTFLDATR\'s field-level usage list', !!vis.inputKeywords === (ef.fieldLevel.allowedUsage.indexOf(u) !== -1));
});
check('MSGALARM trigger keywords all exist in KEYWORD-LOOKUP.json', KeywordSpec.msgalarmTriggers().every((k) => Object.prototype.hasOwnProperty.call(lookup, k)));
check('HLPTITLE\'s required HLPPNLGRP exists in KEYWORD-LOOKUP.json and has its own spec entry', Object.prototype.hasOwnProperty.call(lookup, 'HLPPNLGRP') && !!R.HLPPNLGRP);

// ---- 3. accessors ----
check('accessors are case/blank safe and null for other keywords', KeywordSpec.cursorMessageHelpLevels('hlptitle').join() === 'file,record' && KeywordSpec.cursorMessageHelpLevels('') === null && KeywordSpec.cursorMessageHelpLevels(null) === null && KeywordSpec.cursorMessageHelpIndicatorMode('ALARM', 'record') === null && KeywordSpec.cursorMessageHelpIndicatorMode('HLPTITLE', 'field') === null);
check('list / object accessors return copies', (() => {
  KeywordSpec.cursorMessageHelpKeywords().pop(); KeywordSpec.cursorMessageHelpLevels('MSGALARM').push('x'); KeywordSpec.msgalarmTriggers().pop();
  const e = KeywordSpec.entFldAtrRules(); e.color.values.pop(); e.fieldLevel.allowedUsage.pop();
  const h = KeywordSpec.hlptitleRules(); h.requiresInFile.pop(); h.textMaxLength = 1;
  return KeywordSpec.cursorMessageHelpKeywords().length === 4 && KeywordSpec.cursorMessageHelpLevels('MSGALARM').length === 2 && KeywordSpec.msgalarmTriggers().length === 4 && KeywordSpec.entFldAtrRules().color.values.length === 7 && KeywordSpec.entFldAtrRules().fieldLevel.allowedUsage.length === 2 && KeywordSpec.hlptitleRules().requiresInFile.length === 1 && KeywordSpec.hlptitleRules().textMaxLength === 55;
})());

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

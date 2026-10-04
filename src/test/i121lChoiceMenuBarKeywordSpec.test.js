/**
 * i121lChoiceMenuBarKeywordSpec.test.js
 *
 * Task I-121l - "One declarative rule spec per keyword", choice and menu-bar field
 * keywords slice: MNUBARCHC, MNUBARSEP, CHOICE, CHCACCEL, CHCAVAIL, CHCCTL, CHCSLT,
 * CHCUNAVAIL. Each now has a RECORD_TYPES entry read from DDS_Keyword_V7r6.txt.
 * Pure refactor: no guard changes; rules no guard enforces are recorded as facts.
 *
 * Parts: (1) entries against each keyword's own section of the reference text;
 * (2) sweeps against KEYWORD-LOOKUP.json, the no-option-indicators table,
 * CHOICE_COLOR_STATE_KEYWORDS, PSHBTNFLD's whitelist and MNUBAR's whitelist;
 * (3) accessors.
 *
 * Run with: node src/test/i121lChoiceMenuBarKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const EIGHT = ['MNUBARCHC', 'MNUBARSEP', 'CHOICE', 'CHCACCEL', 'CHCAVAIL', 'CHCCTL', 'CHCSLT', 'CHCUNAVAIL'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const norm = (t) => t.replace(/\s+/g, ' ');
const R = KeywordSpec.RECORD_TYPES;

// The keyword's own section: from its heading line (followed by "You use this ...", which the table of
// contents and the index lines are not) up to the next keyword's heading.
const HEADINGS = {
  MNUBARCHC: 'MNUBARCHC (Menu-Bar Choice) keyword for display files',
  MNUBARSEP: 'MNUBARSEP (Menu-Bar Separator) keyword for display files',
  CHOICE: 'CHOICE (Selection Field Choice) keyword for display files',
  CHCACCEL: 'CHCACCEL (Choice Accelerator Text) keyword for display files',
  CHCAVAIL: 'CHCAVAIL (Choice Color/Display Attribute when Available) keyword for display files',
  CHCCTL: 'CHCCTL (Choice Control) keyword for display files',
  CHCSLT: 'CHCSLT (Choice Color/Display Attribute when Selected) keyword for display files',
  CHCUNAVAIL: 'CHCUNAVAIL (Choice Color/Display Attribute when Unavailable) keyword for display files'
};
function sect(name) {
  // Other sections quote this heading in a one-sentence "Related reference" blurb, so every occurrence is
  // measured and the real section (the longest run up to the next keyword's heading) is used.
  const h = HEADINGS[name];
  let best = '';
  for (let at = REF.indexOf(h + ' You use this'); at !== -1; at = REF.indexOf(h + ' You use this', at + 1)) {
    const rest = REF.slice(at + h.length);
    const ends = [rest.indexOf(' keyword for display files You use'), rest.indexOf(' keywords for display files You use')].filter((i) => i > 0);
    const body = rest.slice(0, ends.length ? Math.min.apply(null, ends) : rest.length);
    if (body.length > best.length) best = body;
  }
  return best;
}
const inSect = (name, t) => sect(name).indexOf(norm(t)) !== -1;

// ---- 1. entries against the reference text ----
check('the slice owns exactly the eight keywords, in order', KeywordSpec.choiceMenuBarKeywords().join() === EIGHT.join());
EIGHT.forEach((n) => {
  const e = R[n];
  check(n + ': has a field-level entry with a line citation', !!e && e.levels.join() === 'field' && /~line \d+/.test(e.ddsReference));
  check(n + ': its own section exists in the reference', sect(n).length > 300);
  check(n + ': the section calls it a field-level keyword', /field-level keyword/.test(sect(n).slice(0, 200)));
});

// MNUBARCHC
check('MNUBARCHC: grammar and the three required parameters', inSect('MNUBARCHC', 'MNUBARCHC(choice-number pull-down-record choice-text [&return-field])') && inSect('MNUBARCHC', 'The choice-number parameter is required') && inSect('MNUBARCHC', 'The pull-down-record parameter is required') && inSect('MNUBARCHC', 'The choice-text parameter is required') && R.MNUBARCHC.parameters === 'required' && R.MNUBARCHC.pullDownRecord.required && R.MNUBARCHC.choiceText.required);
check('MNUBARCHC: choice number 1 to 99, no duplicates within the menu-bar field', inSect('MNUBARCHC', 'Valid values for the choice number are integers 1 to 99. Duplicate values within a single menu-bar field are not allowed.') && R.MNUBARCHC.choiceNumber.min === 1 && R.MNUBARCHC.choiceNumber.max === 99 && R.MNUBARCHC.choiceNumber.uniqueWithinMenuBarField === true);
check('MNUBARCHC: the pull-down record must exist in the file and contain PULLDOWN', inSect('MNUBARCHC', 'The record specified must exist within the file and must contain a PULLDOWN keyword.') && R.MNUBARCHC.pullDownRecord.mustExistInFile && R.MNUBARCHC.pullDownRecord.mustHaveKeyword === 'PULLDOWN');
check('MNUBARCHC: choice text forms; the field is character, usage P, in the menu-bar record', inSect('MNUBARCHC', 'As a character string:') && inSect('MNUBARCHC', 'As a program-to-system field: &field-name') && inSect('MNUBARCHC', 'must exist in the menu bar record and must be defined as a character field with usage P') && R.MNUBARCHC.choiceText.forms.join() === 'character string,&field-name' && R.MNUBARCHC.choiceText.textField.dataType === 'A' && R.MNUBARCHC.choiceText.textField.usage === 'P' && R.MNUBARCHC.choiceText.textField.mustExistInMenuBarRecord);
check('MNUBARCHC: text starts at position 3, 76 / 128 characters, 3 blanks between choices, 12 lines', inSect('MNUBARCHC', 'begins at position 3') && inSect('MNUBARCHC', 'the maximum length of the choice text is 76 if the smallest display size for the file is 24 x 80 and 128 if the smallest display size for the file is 27 x 132') && inSect('MNUBARCHC', '3 blank spaces are inserted between choices') && inSect('MNUBARCHC', 'The maximum number of lines that a menu bar field can occupy is 12 lines (this includes the separator line).') && R.MNUBARCHC.choiceText.firstChoiceStartsAtPosition === 3 && R.MNUBARCHC.choiceText.maxLength['24x80'] === 76 && R.MNUBARCHC.choiceText.maxLength['27x132'] === 128 && R.MNUBARCHC.choiceText.blanksBetweenChoices === 3 && R.MNUBARCHC.maxLinesForMenuBarField === 12 && R.MNUBARCHC.maxLinesIncludeSeparatorLine);
check('MNUBARCHC: mnemonic rules', inSect('MNUBARCHC', 'It is not possible to specify the > as the mnemonic character.') && inSect('MNUBARCHC', 'must be a single-byte character and must not be a blank. Only one mnemonic is allowed in the choice text, and the same mnemonic character cannot be specified for more than one choice.') && inSect('MNUBARCHC', 'you must specify it twice') && R.MNUBARCHC.mnemonic.marker === '>' && R.MNUBARCHC.mnemonic.literalMarkerByDoubling && R.MNUBARCHC.mnemonic.markerCannotBeTheMnemonic && R.MNUBARCHC.mnemonic.singleByteNonBlank && R.MNUBARCHC.mnemonic.onlyOneInChoiceText && R.MNUBARCHC.mnemonic.notSharedBetweenChoices);
check('MNUBARCHC: return field is optional, hidden numeric of length 2, 0 decimals', inSect('MNUBARCHC', 'The return-field parameter is optional') && inSect('MNUBARCHC', 'hidden field in the menu-bar record') && inSect('MNUBARCHC', 'data type Y (numeric), the length of the field is two, and decimal positions are 0') && R.MNUBARCHC.returnField.optional && R.MNUBARCHC.returnField.usage === 'H' && R.MNUBARCHC.returnField.dataType === 'Y' && R.MNUBARCHC.returnField.length === 2 && R.MNUBARCHC.returnField.decimalPositions === 0);
check('MNUBARCHC: the menu-bar field is input-capable Y 2,0 at row 1 column 2', inSect('MNUBARCHC', 'defined as an input-capable field with data type Y (numeric). The length of the field is two and decimal positions 0.') && inSect('MNUBARCHC', 'must always be defined as starting in row 1, column 2') && R.MNUBARCHC.menuBarField.inputCapable && R.MNUBARCHC.menuBarField.dataType === 'Y' && R.MNUBARCHC.menuBarField.length === 2 && R.MNUBARCHC.menuBarField.decimalPositions === 0 && R.MNUBARCHC.menuBarField.row === 1 && R.MNUBARCHC.menuBarField.column === 2);
check('MNUBARCHC: MNUBAR is required at record level; several MNUBARCHC per field', inSect('MNUBARCHC', 'the MNUBAR keyword is required at the record level') && inSect('MNUBARCHC', 'Multiple MNUBARCHC keywords can be specified for one menu bar field') && R.MNUBARCHC.requiresOnRecord.join() === 'MNUBAR' && R.MNUBARCHC.multiplePerField);
check('MNUBARCHC: the keywords allowed alongside it, and option indicators valid', ['ALIAS', 'CHCAVAIL', 'CHCSLT', 'INDTXT', 'MNUBARSEP', 'TEXT'].every((k) => inSect('MNUBARCHC', k)) && inSect('MNUBARCHC', 'The following keywords can be specified on a field with the MNUBARCHC keyword:') && R.MNUBARCHC.allowedOnSameField.join() === 'ALIAS,CHCAVAIL,CHCSLT,INDTXT,MNUBARSEP,TEXT' && inSect('MNUBARCHC', 'Option indicators are valid for this keyword.') && R.MNUBARCHC.optionIndicators === 'valid');

// MNUBARSEP
check('MNUBARSEP: grammar, one parameter required, on a menu-bar field', inSect('MNUBARSEP', 'MNUBARSEP([color] [display-attribute] [character])') && inSect('MNUBARSEP', 'One parameter must be specified.') && inSect('MNUBARSEP', 'on a menu-bar field') && R.MNUBARSEP.parameters === 'required' && R.MNUBARSEP.onParameterRequired === 'one');
check('MNUBARSEP: colour values, default blue, ignored on monochrome', ['(*COLOR value)', 'Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow', 'White'].every((t) => inSect('MNUBARSEP', t)) && inSect('MNUBARSEP', 'If the color parameter is not specified, the default is blue.') && inSect('MNUBARSEP', 'This parameter is ignored if it is specified for a menu bar on a monochrome display.') && R.MNUBARSEP.color.values.join() === 'BLU,GRN,PNK,RED,TRQ,YLW,WHT' && R.MNUBARSEP.color.default === 'BLU' && R.MNUBARSEP.color.ignoredOnMonochrome);
check('MNUBARSEP: display attributes, default normal intensity, HI / RI / UL hide the separator', ['(*DSPATR value1 <value2 <value3...>>)', 'Blink', 'Column separator', 'High intensity', 'Nondisplay', 'Reverse image', 'Underline'].every((t) => inSect('MNUBARSEP', t)) && inSect('MNUBARSEP', 'The default display attribute for the menu-bar separator is normal (or low) intensity.') && inSect('MNUBARSEP', 'Display attributes HI, RI, and UL cause a separator line not to be displayed.') && R.MNUBARSEP.displayAttribute.values.join() === 'BL,CS,HI,ND,RI,UL' && R.MNUBARSEP.attributesThatHideSeparator.join() === 'HI,RI,UL');
check("MNUBARSEP: character is (*CHAR 'c'), one character, default a dash", inSect('MNUBARSEP', "(*CHAR 'separator-character')") && inSect('MNUBARSEP', 'The separator-character value is one character.') && inSect('MNUBARSEP', 'the default separator character is a dash (-)') && R.MNUBARSEP.character.wrapper === '*CHAR' && R.MNUBARSEP.character.length === 1 && R.MNUBARSEP.character.default === '-');
check('MNUBARSEP: MNUBAR must be on the record; *NOSEPARATOR conflicts; first colour keyword wins; option indicators valid', inSect('MNUBARSEP', 'the MNUBAR keyword must also be specified on the associated record') && inSect('MNUBARSEP', 'The *NOSEPARATOR parameter cannot be used on the MNUBAR keyword if the MNUBARSEP keyword is specified.') && inSect('MNUBARSEP', 'taken from the first keyword that was specified') && inSect('MNUBARSEP', 'Option indicators are valid for this keyword.') && R.MNUBARSEP.requiresOnRecord.join() === 'MNUBAR' && R.MNUBARSEP.conflictsWithMnubarParameter === '*NOSEPARATOR' && R.MNUBARSEP.ifMoreThanOneColorKeywordFirstSpecifiedIsUsed && R.MNUBARSEP.optionIndicators === 'valid');

// CHOICE
check('CHOICE: grammar, required number and text, number 1 to 99, no duplicates', inSect('CHOICE', 'CHOICE(choice-number choice-text [*SPACEB])') && inSect('CHOICE', 'This parameter is required.') && inSect('CHOICE', 'positive integers greater than 0 and less than or equal to 99') && inSect('CHOICE', 'Duplicate choice-number values within a selection field are not allowed.') && R.CHOICE.choiceNumber.min === 1 && R.CHOICE.choiceNumber.max === 99 && R.CHOICE.choiceNumber.uniqueWithinSelectionField && R.CHOICE.choiceText.required);
check('CHOICE: text is a string or a character usage-P field of the same record; fits 80 / 132', inSect('CHOICE', 'must exist in the same record as the selection field and must be defined as a character field with usage P') && inSect('CHOICE', 'If the smallest display size is 24 x 80, the above must be less than or equal to 80.') && inSect('CHOICE', 'this sum must be less than or equal to 132') && R.CHOICE.choiceText.textField.mustExistInSameRecord && R.CHOICE.choiceText.textField.dataType === 'A' && R.CHOICE.choiceText.textField.usage === 'P' && R.CHOICE.choiceText.maxWidth['24x80'] === 80 && R.CHOICE.choiceText.maxWidth['27x132'] === 132);
check('CHOICE: mnemonic rules, ignored where numeric selection is used', inSect('CHOICE', 'The mnemonic is ignored on displays where the field is rendered using numeric selection') && inSect('CHOICE', 'It is not possible to specify the > sign as the mnemonic.') && inSect('CHOICE', 'must be a single-byte character and must not be a blank. Only one mnemonic is allowed in the choice text, and the same mnemonic character cannot be specified for more than one choice.') && R.CHOICE.mnemonic.ignoredWhenRenderedWithNumericSelection && R.CHOICE.mnemonic.markerCannotBeTheMnemonic && R.CHOICE.mnemonic.notSharedBetweenChoices);
check('CHOICE: *SPACEB is optional; blank line between non-consecutive vertical choices only', inSect('CHOICE', 'The *SPACEB parameter is optional') && inSect('CHOICE', 'if the choice numbers are not consecutive, a blank space is automatically inserted between non-consecutive choices. This does not happen for horizontal selection fields') && R.CHOICE.spaceBefore.parameter === '*SPACEB' && R.CHOICE.spaceBefore.optional && R.CHOICE.blankLineAutomaticallyBetweenNonConsecutiveVertical);
check('CHOICE: SNGCHCFLD or MLTCHCFLD required; several per field; all must fit; option indicators valid and compress the list', inSect('CHOICE', 'either the SNGCHCFLD or the MLTCHCFLD keyword must also be specified') && inSect('CHOICE', 'Several CHOICE keywords can be specified for one selection field.') && inSect('CHOICE', 'All choices must fit on the smallest display size specified for the file.') && inSect('CHOICE', 'Option indicators are valid for this keyword. When a CHOICE keyword is turned off, the list of choices is compressed.') && R.CHOICE.requiresOneOfOnField.join() === 'SNGCHCFLD,MLTCHCFLD' && R.CHOICE.multiplePerField && R.CHOICE.allChoicesMustFitSmallestDisplaySize && R.CHOICE.choiceTurnedOffCompressesList && R.CHOICE.optionIndicators === 'valid');

// CHCACCEL
check('CHCACCEL: grammar, choice number 1 to 99, text string or character usage-P field', inSect('CHCACCEL', 'CHCACCEL(choice-number accelerator-text)') && inSect('CHCACCEL', 'Valid values are 1 to 99.') && inSect('CHCACCEL', 'must exist in the same record as the selection field and must be defined as a character field with usage P') && R.CHCACCEL.choiceNumber.min === 1 && R.CHCACCEL.choiceNumber.max === 99 && R.CHCACCEL.acceleratorText.textField.usage === 'P' && R.CHCACCEL.acceleratorText.textField.dataType === 'A');
check('CHCACCEL: text 3 spaces right of the longest choice, must fit; does not enable the key', inSect('CHCACCEL', 'This text is placed 3 spaces to the right of the maximum length of the choice text.') && inSect('CHCACCEL', 'must not exceed the width of the smallest display size specified for the file') && inSect('CHCACCEL', 'It does not enable the function key.') && R.CHCACCEL.acceleratorText.placedSpacesRightOfLongestChoiceText === 3 && R.CHCACCEL.acceleratorText.combinedWithChoiceTextMustFitSmallestDisplaySize && R.CHCACCEL.doesNotEnableFunctionKey);
check('CHCACCEL: only on SNGCHCFLD fields in PULLDOWN records; option indicators not valid', inSect('CHCACCEL', 'allowed only on single-choice selection fields (SNGCHCFLD keyword specified on the same field) in pull-down records (PULLDOWN keyword specified at the record level)') && inSect('CHCACCEL', 'Option indicators are not valid for this keyword.') && R.CHCACCEL.requiresOnField.join() === 'SNGCHCFLD' && R.CHCACCEL.requiresOnRecord.join() === 'PULLDOWN' && R.CHCACCEL.optionIndicators === 'notValid');

// the three colour-state keywords
const COLOURS = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow', 'White'];
const ATTRS = ['Blink', 'Column separator', 'High intensity', 'Nondisplay', 'Reverse image', 'Underline'];
['CHCAVAIL', 'CHCSLT', 'CHCUNAVAIL'].forEach((n) => {
  const e = R[n];
  check(n + ': grammar ' + n + '([color] [display-attributes]); one parameter must be specified', inSect(n, n + '([color] [display-attributes])') && inSect(n, 'One parameter must be specified.') && e.parameterGrammar === n + '([color] [display-attributes])' && e.onParameterRequired === 'one');
  check(n + ': the seven colours and six display attributes', COLOURS.every((t) => inSect(n, t)) && ATTRS.every((t) => inSect(n, t)) && e.color.values.join() === 'BLU,GRN,PNK,RED,TRQ,YLW,WHT' && e.displayAttribute.values.join() === 'BL,CS,HI,ND,RI,UL' && e.color.wrapper === '*COLOR' && e.displayAttribute.wrapper === '*DSPATR' && inSect(n, '(*DSPATR value1 <value2 <value3...>>)') && (n === 'CHCUNAVAIL' || inSect(n, '(*COLOR value)')));
  check(n + ': option indicators valid, colour ignored on monochrome', inSect(n, 'Option indicators are valid for this keyword.') && e.optionIndicators === 'valid' && /ignored on a monochrome/.test(sect(n)) && e.color.ignoredOnMonochrome);
});
check('CHCAVAIL: default colour green, default attribute high intensity in a menu bar, normal in a selection field', inSect('CHCAVAIL', 'the default color for the available choices in a menu bar is green. The default color for the available choices in a selection field is green.') && inSect('CHCAVAIL', 'The default display attribute in a menu bar is high intensity. The default display attribute in a selection field is normal (or low) intensity.') && R.CHCAVAIL.color.default === 'GRN' && R.CHCAVAIL.displayAttribute.defaults.menuBar === 'high intensity' && R.CHCAVAIL.displayAttribute.defaults.selectionField === 'normal (or low) intensity');
check('CHCAVAIL: needs PSHBTNCHC, CHOICE or MNUBARCHC on the field; also on a subfile control record with SFLSNGCHC / SFLMLTCHC', inSect('CHCAVAIL', 'allowed on a field only if the field has one or more PSHBTNCHC, CHOICE, or MNUBARCHC keywords') && inSect('CHCAVAIL', 'It is also allowed on a subfile control record if the subfile control record uses either the SFLSNGCHC or SFLMLTCHC keywords.') && R.CHCAVAIL.requiresOneOfOnField.join() === 'PSHBTNCHC,CHOICE,MNUBARCHC' && R.CHCAVAIL.allowedOnSubfileControlRecordWithOneOf.join() === 'SFLSNGCHC,SFLMLTCHC' && R.CHCAVAIL.color.choiceTextFrom.join() === 'MNUBARCHC,CHOICE,PSHBTNCHC');
check('CHCSLT: default colour white, default attribute normal in a menu bar / high in a selection field of a pull-down without selection characters', inSect('CHCSLT', 'the default color for the selected choice in a menu bar is white. The default color for the selected choices in a selection field in a pull-down menu that does not display selection characters is white.') && inSect('CHCSLT', 'The default display attribute for the selected choice in a menu bar is normal (or low) intensity. The default display attribute for the selected choices in a selection field in a pull-down menu that does not display selection characters is high intensity.') && R.CHCSLT.color.default === 'WHT' && R.CHCSLT.displayAttribute.defaults.menuBar === 'normal (or low) intensity' && R.CHCSLT.displayAttribute.defaults.selectionFieldInPullDownWithoutSelectionCharacters === 'high intensity');
check('CHCSLT: MNUBARCHC or CHOICE required; with CHOICE the record needs PULLDOWN(*NOSLTIND); subfile control record needs SFLSNGCHC / SFLMLTCHC', inSect('CHCSLT', 'either the MNUBARCHC keyword or the CHOICE keyword must also be specified on the field') && inSect('CHCSLT', 'the record containing this field must have the PULLDOWN keyword specified with the value *NOSLTIND') && inSect('CHCSLT', 'either the SFLSNGCHC or SFLMLTCHC keyword must also be specified on the subfile record') && R.CHCSLT.requiresOneOfOnField.join() === 'MNUBARCHC,CHOICE' && R.CHCSLT.whenChoiceInsteadOfMnubarchcRecordNeeds === 'PULLDOWN(*NOSLTIND)' && R.CHCSLT.onSubfileControlRecordRequiresOneOf.join() === 'SFLSNGCHC,SFLMLTCHC');
check('CHCUNAVAIL: default colour blue; monochrome: normal intensity and an asterisk over the first character', inSect('CHCUNAVAIL', 'the default color for unavailable choices in a selection field is blue') && inSect('CHCUNAVAIL', 'The default display attribute for unavailable choices in a selection field on monochrome display stations is normal (or low) intensity. Also, the first character of an unavailable choice on a monochrome display station is overwritten with an asterisk (*).') && R.CHCUNAVAIL.color.default === 'BLU' && R.CHCUNAVAIL.displayAttribute.monochromeFirstCharacterOverwrittenWith === '*' && R.CHCUNAVAIL.displayAttribute.defaults.selectionFieldOnMonochrome === 'normal (or low) intensity');
check('CHCUNAVAIL: needs CHOICE or PSHBTNCHC on the field; SFLSNGCHC / SFLMLTCHC on a subfile control record', inSect('CHCUNAVAIL', 'this keyword is allowed only if there are also one or more CHOICE or PSHBTNCHC keywords') && inSect('CHCUNAVAIL', 'allowed only if the SFLSNGCHC or SFLMLTCHC keyword is also used on the subfile control record') && R.CHCUNAVAIL.requiresOneOfOnField.join() === 'CHOICE,PSHBTNCHC' && R.CHCUNAVAIL.onSubfileControlRecordRequiresOneOf.join() === 'SFLSNGCHC,SFLMLTCHC');

// CHCCTL
check('CHCCTL: both grammars; choice number 1 to 99 and control field required', inSect('CHCCTL', 'CHCCTL(choice-number &control-field [msg-id [msg-lib/]msg-file])') && inSect('CHCCTL', 'CHCCTL(choice-number &control-field [&msg-id [&msg-lib/]&msg-file])') && inSect('CHCCTL', 'The choice-number parameter is required') && inSect('CHCCTL', 'Valid values are 1 to 99.') && inSect('CHCCTL', 'The control-field parameter is required') && R.CHCCTL.choiceNumber.min === 1 && R.CHCCTL.choiceNumber.max === 99 && R.CHCCTL.controlField.required);
check('CHCCTL: control field is 1-byte numeric hidden (Y, 0 decimals) in the same record', inSect('CHCCTL', 'name of a 1-byte numeric hidden field') && inSect('CHCCTL', 'The field must be defined within the same record as the field you are defining, and must be defined as data type Y (numeric) with length 1, decimal positions 0, and usage H.') && R.CHCCTL.controlField.dataType === 'Y' && R.CHCCTL.controlField.length === 1 && R.CHCCTL.controlField.decimalPositions === 0 && R.CHCCTL.controlField.usage === 'H' && R.CHCCTL.controlField.mustBeInSameRecord);
check('CHCCTL: control values 0 to 4 and their meaning on output and input', inSect('CHCCTL', '0 Available Unselected') && inSect('CHCCTL', '1 Selected Selected') && ['2 Unavailable (Cannot place cursor on choice unless help for choice is available.)', '3 Unavailable (Placing cursor on choice is allowed.)', '4 Unavailable (Cannot place cursor on choice even if help for choice is available.)'].every((t) => inSect('CHCCTL', t)) && Object.keys(R.CHCCTL.controlValues).join() === '0,1,2,3,4' && R.CHCCTL.controlValues[0].onInput === 'unselected' && R.CHCCTL.controlValues[1].onInput === 'selected' && R.CHCCTL.controlValues[2].onInput === undefined);
check('CHCCTL: cursor restrictions only on enhanced-interface controllers', inSect('CHCCTL', 'The cursor restrictions described only apply to displays that are connected to a controller that supports an enhanced interface for nonprogrammable workstations.') && R.CHCCTL.cursorRestrictionsNeedEnhancedInterfaceController);
check('CHCCTL: message optional, default CPD919B, message file required with an id, *LIBL, field types A/P 7 and A/P 10', inSect('CHCCTL', 'The message-id and message-file parameters are optional') && inSect('CHCCTL', 'the system issues a default message, CPD919B') && inSect('CHCCTL', 'The message-file parameter is a required parameter when the message-id parameter is used.') && inSect('CHCCTL', '*LIBL is used to search for the message file at program run time') && inSect('CHCCTL', 'defined as data type A, usage P, and length of 7') && inSect('CHCCTL', 'defined as data type A, usage P, and length of 10') && R.CHCCTL.message.optional && R.CHCCTL.message.defaultMessage === 'CPD919B' && R.CHCCTL.message.messageFileRequiredWithMessageId && R.CHCCTL.message.libraryDefault === '*LIBL' && R.CHCCTL.message.messageIdField.length === 7 && R.CHCCTL.message.messageFileOrLibraryField.length === 10 && R.CHCCTL.message.messageIdField.usage === 'P' && R.CHCCTL.message.messageFileOrLibraryField.usage === 'P');
check('CHCCTL: a CHOICE or PSHBTNCHC with the same choice number is required; option indicators not valid', inSect('CHCCTL', 'a CHOICE or PSHBTNCHC keyword with the same choice number must also be specified for the field') && inSect('CHCCTL', 'Option indicators are not valid for this keyword.') && R.CHCCTL.requiresOneOfOnFieldWithSameChoiceNumber.join() === 'CHOICE,PSHBTNCHC' && R.CHCCTL.optionIndicators === 'notValid');

// ---- 2. sweeps ----
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
EIGHT.forEach((n) => {
  const lv = Array.from(new Set((lookup[n] || []).map((e) => e.level))).sort();
  check(n + ': the levels in KEYWORD-LOOKUP.json are exactly the spec levels', lv.join() === R[n].levels.slice().sort().join());
  const f = KeywordSpec.noOptionIndicatorsFact(n);
  const notValid = R[n].optionIndicators === 'notValid';
  check(n + ': ' + (notValid ? 'is' : 'is not') + ' in the no-option-indicators table, agreeing with the spec', (!!f === notValid) && (!f || f.levels.join() === 'field') && KeywordSpec.choiceMenuBarIndicatorMode(n) === R[n].optionIndicators);
});
// the colour-state table, its phrases, and PSHBTNFLD's whitelist
check('CHOICE_COLOR_STATE_KEYWORDS holds exactly the three colour-state keywords, all with entries here', Object.keys(KeywordSpec.CHOICE_COLOR_STATE_KEYWORDS).sort().join() === 'CHCAVAIL,CHCSLT,CHCUNAVAIL');
['CHCAVAIL', 'CHCSLT', 'CHCUNAVAIL'].forEach((n) => {
  const phrase = KeywordSpec.CHOICE_COLOR_STATE_KEYWORDS[n].ddsReference;
  check(n + ': its phrase in CHOICE_COLOR_STATE_KEYWORDS is in its own section', inSect(n, phrase));
});
const pushOk = KeywordSpec.choiceColorStateKeywordsAllowedOn('PSHBTNFLD');
check('PSHBTNFLD may carry CHCAVAIL and CHCUNAVAIL but not CHCSLT, and the three keywords\' own prerequisites agree', pushOk.join() === 'CHCAVAIL,CHCUNAVAIL' && R.CHCAVAIL.requiresOneOfOnField.indexOf('PSHBTNCHC') !== -1 && R.CHCUNAVAIL.requiresOneOfOnField.indexOf('PSHBTNCHC') !== -1 && R.CHCSLT.requiresOneOfOnField.indexOf('PSHBTNCHC') === -1 && !inSect('CHCSLT', 'push button'));
check("PSHBTNFLD's whitelist agrees: CHCCTL (needs CHOICE or PSHBTNCHC) is allowed, CHOICE and CHCACCEL and MNUBARCHC are not", KeywordSpec.isWhitelisted('PSHBTNFLD', 'CHCCTL') && R.CHCCTL.requiresOneOfOnFieldWithSameChoiceNumber.indexOf('PSHBTNCHC') !== -1 && !KeywordSpec.isWhitelisted('PSHBTNFLD', 'CHOICE') && !KeywordSpec.isWhitelisted('PSHBTNFLD', 'CHCACCEL') && !KeywordSpec.isWhitelisted('PSHBTNFLD', 'MNUBARCHC') && !KeywordSpec.isWhitelisted('PSHBTNFLD', 'CHCSLT'));
// MNUBAR's whitelist lists MNUBARSEP (record level) and the MNUBARCHC prerequisites agree with it
check("MNUBAR's whitelist allows MNUBARSEP, and both MNUBARCHC and MNUBARSEP require MNUBAR on the record", KeywordSpec.isWhitelisted('MNUBAR', 'MNUBARSEP') && R.MNUBARCHC.requiresOnRecord.join() === 'MNUBAR' && R.MNUBARSEP.requiresOnRecord.join() === 'MNUBAR');
// the record-reference table knows where the pull-down record sits in MNUBARCHC's parameters
check("the record-reference table puts MNUBARCHC's record name after the leading choice number", !!KeywordSpec.RECORD_REFERENCES && KeywordSpec.RECORD_REFERENCES.MNUBARCHC.kind === 'afterLeadingNumber' && R.MNUBARCHC.parameterGrammar.indexOf('MNUBARCHC(choice-number pull-down-record') === 0);
// the choice-number bounds agree with the HLPARA(*FLD field-name [choice-number]) fact
check("the choice-number bounds agree with HLPARA's *FLD choice number (1 to 99, MNUBARCHC / CHOICE only)", R.HLPARA.fld.choiceNumber.min === R.MNUBARCHC.choiceNumber.min && R.HLPARA.fld.choiceNumber.max === R.MNUBARCHC.choiceNumber.max && R.HLPARA.fld.choiceNumber.max === R.CHOICE.choiceNumber.max && R.HLPARA.fld.choiceNumber.onlyForFieldsWith.join() === 'MNUBARCHC,CHOICE');
// none of the eight carries a second copy of a fact that lives elsewhere
check('none of the eight repeats a mutex, whitelist or record-reference fact owned by another entry', EIGHT.every((n) => R[n].mutex === undefined && R[n].whitelist === undefined && R[n].recordReference === undefined));

// ---- 3. accessors ----
check('accessors are case/blank safe and null for other keywords', KeywordSpec.choiceMenuBarIndicatorMode(' choice ') === 'valid' && KeywordSpec.choiceMenuBarIndicatorMode('') === null && KeywordSpec.choiceMenuBarIndicatorMode('DUP') === null && KeywordSpec.choiceMenuBarFacts('DUP') === null && KeywordSpec.choiceMenuBarRequiresOneOf('DUP') === null);
check('choiceMenuBarRequiresOneOf returns the keyword\'s own list (a copy), [] when there is none', KeywordSpec.choiceMenuBarRequiresOneOf('CHCSLT').join() === 'MNUBARCHC,CHOICE' && KeywordSpec.choiceMenuBarRequiresOneOf('MNUBARCHC').length === 0 && (() => { KeywordSpec.choiceMenuBarRequiresOneOf('CHCSLT').pop(); return R.CHCSLT.requiresOneOfOnField.length === 2; })());
check('choiceMenuBarFacts drops the prose and returns a deep copy', (() => {
  const f = KeywordSpec.choiceMenuBarFacts('CHCCTL');
  f.controlField.length = 99; f.controlValues[0].onInput = 'x';
  return f.ddsReference === undefined && f.message.defaultMessage === 'CPD919B' && R.CHCCTL.controlField.length === 1 && R.CHCCTL.controlValues[0].onInput === 'unselected';
})());
check('the keyword list accessor returns a copy', (() => { KeywordSpec.choiceMenuBarKeywords().pop(); return KeywordSpec.choiceMenuBarKeywords().length === 8; })());

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

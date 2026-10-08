/**
 * i122gChoiceFamilyKeywords.test.js
 *
 * Task I-122g - the choice family from the I-122 coverage inventory:
 * CHCSLT, CHCCTL, CHCUNAVAIL, CHCAVAIL, CHCACCEL, SFLCHCCTL, SFLSNGCHC, SFLMLTCHC.
 * Each cell is traced to the keyword's own DDS Reference section
 * (DDS_Keyword_V7r6.txt), quoted through has() so a wording drift in the spec
 * entry or the reference fails here:
 *
 *   CHCAVAIL / CHCUNAVAIL / CHCSLT  field, ([color] [display-attributes]), one parameter
 *              required, option indicators valid, needs a choice keyword on the field
 *              (on a subfile control record: SFLSNGCHC or SFLMLTCHC).
 *   CHCCTL     field, CHCCTL(choice-number &control-field [message]), option indicators
 *              not valid, control field hidden Y 1,0, needs CHOICE / PSHBTNCHC, same number.
 *   CHCACCEL   field, CHCACCEL(choice-number accelerator-text), option indicators not valid,
 *              SNGCHCFLD on the field and PULLDOWN on the record.
 *   SFLCHCCTL  field, first field of the subfile record, Y 1,0 H, one per record, not with SFLNXTCHG.
 *   SFLSNGCHC / SFLMLTCHC  subfile control record, not with each other, SFLDROP or SFLFOLD.
 *
 *  L1/L2 writer: guards, parse, flag / parameter round trip, neighbours kept.
 *  L3    display: which row the panel shows, saved state, Conditioning toggle.
 *  L4    commit paths: panel Apply, raw editor.
 *
 * Gaps found while writing it are NOT asserted as correct; they are logged in
 * docs/sda-reference/keywordFixes.md (see the I-122g section).
 *
 * Run with: node src/test/i122gChoiceFamilyKeywords.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const { JSDOM } = require('jsdom');

const RAWREF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const REF = RAWREF.replace(/\f/g, ' ').replace(/\s+/g, ' ').replace(/- /g, '-');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ').replace(/- /g, '-')) !== -1;

// Fixed-column DDS line builder.
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) put(8, o.ind);
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.use) put(38, o.use);
  if (o.line) put(39, String(o.line).padStart(3));
  if (o.col) put(42, String(o.col).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const K = (fn) => dds({ fn });
const KI = (ind, fn) => dds({ ind, fn });                      // keyword line under an option indicator, e.g. 'N10'
const R = (name, fn) => dds({ t: 'R', name, fn });
const FLD = (name, len, type, dec, use, fn) => dds({ name, len, type, dec, use, line: 1, col: 2, fn });
const parse = (t) => DspfParser.parseDspf(t);
const say = (re, r) => re.test(r || '');
const kwOf = (kws, name) => (kws || []).find((k) => k.name === name);
const names = (kws) => kws.map((k) => k.name);
const T = KeywordSpec.RECORD_TYPES;
const kw = (name, parameters, conditions) => ({ name, parameters: parameters || '', conditions: conditions || [], raw: '', sourceLines: [] });
const IND = (n) => [{ indicators: [{ number: n, negated: false }] }];

// A pull-down record with a single-choice field F1 (CHOICE 1) and its hidden control field CTL1.
const pullBase = src(
  R('PULLEDIT', 'PULLDOWN'),
  FLD('F1', 2, 'Y', 0, 'B', 'SNGCHCFLD'),
  K("CHOICE(1 '>Undo')"),
  dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' })
);
const withLine = (text, afterLine, extra) => text.replace(afterLine, afterLine + '\n' + extra);
const CH1 = K("CHOICE(1 '>Undo')");
const guard = (a, b) => DspfWriter.choiceMenuBarNewConflictReason(parse(a), parse(b));
const fieldKws = (text, rec, name) => parse(text).records.find((r) => r.name === rec).fields.find((f) => f.name === name).keywords;

console.log('=== spec: what the DDS Reference says about each keyword ===');
{
  check('CHCAVAIL: format, one parameter required, default green, option indicators valid',
    has('CHCAVAIL([color] [display-attributes])') && has('Option indicators are valid for this keyword.') &&
    T.CHCAVAIL.levels.join() === 'field' && T.CHCAVAIL.onParameterRequired === 'one' && T.CHCAVAIL.optionIndicators === 'valid' && T.CHCAVAIL.color.default === 'GRN');
  check('CHCUNAVAIL: format, default blue, option indicators valid',
    has('CHCUNAVAIL([color] [display-attributes])') && T.CHCUNAVAIL.color.default === 'BLU' && T.CHCUNAVAIL.optionIndicators === 'valid' && T.CHCUNAVAIL.onParameterRequired === 'one');
  check('CHCSLT: format, default white, option indicators valid',
    has('CHCSLT([color] [display-attributes])') && T.CHCSLT.color.default === 'WHT' && T.CHCSLT.optionIndicators === 'valid' && T.CHCSLT.onParameterRequired === 'one');
  check('the three colour-state keywords share the seven colours and six display attributes',
    ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].every((n) => T[n].color.values.join() === 'BLU,GRN,PNK,RED,TRQ,YLW,WHT' && T[n].displayAttribute.values.join() === 'BL,CS,HI,ND,RI,UL'));
  check('the three colour-state keyword names come from the spec in reference order',
    KeywordSpec.choiceColorStateKeywords().join() === 'CHCAVAIL,CHCUNAVAIL,CHCSLT');
  check('companions: CHCAVAIL needs one of PSHBTNCHC / CHOICE / MNUBARCHC, CHCUNAVAIL one of CHOICE / PSHBTNCHC, CHCSLT one of MNUBARCHC / CHOICE',
    KeywordSpec.choiceCompanionRules('CHCAVAIL').oneOfOnField.join() === 'PSHBTNCHC,CHOICE,MNUBARCHC' &&
    KeywordSpec.choiceCompanionRules('CHCUNAVAIL').oneOfOnField.join() === 'CHOICE,PSHBTNCHC' &&
    KeywordSpec.choiceCompanionRules('CHCSLT').oneOfOnField.join() === 'MNUBARCHC,CHOICE');
  check('companions: on a subfile control record all three need SFLSNGCHC or SFLMLTCHC (reference sentence agrees)',
    has('These keywords can be used in a subfile control record only if SFLSNGCHC or SFLMLTCHC keywords are also used.') &&
    ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].every((n) => KeywordSpec.choiceCompanionRules(n).subfileControlRecordOneOf.join() === 'SFLSNGCHC,SFLMLTCHC'));
  check('CHCSLT with CHOICE instead of MNUBARCHC needs PULLDOWN(*NOSLTIND)', KeywordSpec.choiceCompanionRules('CHCSLT').choiceWithoutMnubarchcRecordNeeds === 'PULLDOWN(*NOSLTIND)');
  check('CHCCTL: choice number 1 to 99, control field hidden 1-byte numeric (Y 1,0 H), option indicators not valid',
    has('CHCCTL(choice-number &control-field') && T.CHCCTL.choiceNumber.min === 1 && T.CHCCTL.choiceNumber.max === 99 &&
    T.CHCCTL.optionIndicators === 'notValid' && JSON.stringify(KeywordSpec.chcctlRules().controlField) === JSON.stringify({ dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' }));
  check('CHCCTL: needs a CHOICE or PSHBTNCHC with the same choice number; control values 0 to 4; default message CPD919B',
    KeywordSpec.chcctlRules().sameNumberOneOf.join() === 'CHOICE,PSHBTNCHC' && Object.keys(T.CHCCTL.controlValues).join() === '0,1,2,3,4' && T.CHCCTL.message.defaultMessage === 'CPD919B' && has('CPD919B'));
  check('CHCACCEL: choice number 1 to 99, option indicators not valid, SNGCHCFLD on the field and PULLDOWN on the record',
    has('CHCACCEL(choice-number accelerator-text)') && T.CHCACCEL.choiceNumber.min === 1 && T.CHCACCEL.choiceNumber.max === 99 && T.CHCACCEL.optionIndicators === 'notValid' &&
    KeywordSpec.choiceCompanionRules('CHCACCEL').allOfOnField.join() === 'SNGCHCFLD' && KeywordSpec.choiceCompanionRules('CHCACCEL').onRecord.join() === 'PULLDOWN');
  check('CHCACCEL: the accelerator text sits 3 spaces right of the longest choice text and does not enable the key',
    T.CHCACCEL.acceleratorText.placedSpacesRightOfLongestChoiceText === 3 && T.CHCACCEL.doesNotEnableFunctionKey === true);
  check('SFLCHCCTL: control field Y, length 1, 0 decimals, usage H, first field, one per record, not with SFLNXTCHG',
    has('That field must have a length of 1, data type of Y, decimal positions of zero, and have a usage of H.') && has('Only one SFLCHCCTL keyword can be used in one subfile record.') &&
    T.SFLCHCCTL.definitionRequirements.dataType === 'Y' && T.SFLCHCCTL.definitionRequirements.length === 1 && T.SFLCHCCTL.definitionRequirements.decimalPositions === 0 &&
    T.SFLCHCCTL.definitionRequirements.usage.join() === 'H' && T.SFLCHCCTL.mustBeFirstField === true && T.SFLCHCCTL.onePerRecord === true && T.SFLCHCCTL.mutex.join() === 'SFLNXTCHG');
  check('SFLSNGCHC / SFLMLTCHC: each names the other, SFLDROP and SFLFOLD as exclusions in the reference',
    has('cannot be specified on a record with the SFLSNGCHC keyword: SFLDROP SFLFOLD SFLMLTCHC') && has('cannot be specified on a record with the SFLMLTCHC keyword: SFLDROP SFLFOLD SFLSNGCHC'));
  check('SFLSNGCHC / SFLMLTCHC spec mutex lists, in the order the writer reports them',
    KeywordSpec.mutexKeywords('SFLSNGCHC').join() === 'SFLMLTCHC,SFLDROP,SFLFOLD' && KeywordSpec.mutexKeywords('SFLMLTCHC').join() === 'SFLSNGCHC,SFLDROP,SFLFOLD' && KeywordSpec.sflChoiceKeywords().join() === 'SFLSNGCHC,SFLMLTCHC');
  check('the reference says option indicators are not valid for SFLCHCCTL and SFLMLTCHC, and the accessor agrees for all of CHCCTL / CHCACCEL / SFLCHCCTL / SFLSNGCHC / SFLMLTCHC',
    has('Option indicators are not valid for this keyword.') && ['CHCCTL', 'CHCACCEL', 'SFLCHCCTL', 'SFLSNGCHC', 'SFLMLTCHC'].every((n) => !DspfWriter.optionIndicatorsAllowed(n)) &&
    ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].every((n) => DspfWriter.optionIndicatorsAllowed(n)));
  check('seven of the eight take parameters; SFLCHCCTL (format "SFLCHCCTL") is the one documented as taking none (I-185 recorded it)',
    ['CHCSLT', 'CHCCTL', 'CHCUNAVAIL', 'CHCAVAIL', 'CHCACCEL', 'SFLSNGCHC', 'SFLMLTCHC'].every((n) => !DspfWriter.takesNoParameters(n)) && DspfWriter.takesNoParameters('SFLCHCCTL'));
  // Task I-185 - the level, parameter and option-indicator facts are recorded on the three entries, so the
  // accessor answers "not valid" from a stated fact rather than by default.
  const sngSection = REF.slice(REF.lastIndexOf('SFLSNGCHC (Subfile Single Choice Selection List) keyword for display files'), REF.lastIndexOf('SLNO (Starting Line Number) keyword for display files'));
  check('SFLSNGCHC: the section ends its prose with the indicator sentence, after the CHCAVAIL / CHCSLT / CHCUNAVAIL paragraph',
    sngSection.length > 500 && sngSection.indexOf('SFLSNGCHC or SFLMLTCHC keywords are also used. Option indicators are not valid for this keyword.') !== -1);
  check('I-185 levels: SFLCHCCTL field; SFLSNGCHC / SFLMLTCHC record',
    T.SFLCHCCTL.levels.join() === 'field' && T.SFLSNGCHC.levels.join() === 'record' && T.SFLMLTCHC.levels.join() === 'record');
  check('I-185 parameters: SFLCHCCTL none; SFLSNGCHC / SFLMLTCHC optional; grammar strings as in the reference',
    T.SFLCHCCTL.parameters === 'none' && T.SFLSNGCHC.parameters === 'optional' && T.SFLMLTCHC.parameters === 'optional' &&
    T.SFLCHCCTL.parameterGrammar === 'SFLCHCCTL' &&
    T.SFLSNGCHC.parameterGrammar === 'SFLSNGCHC[([*NORSTCSR | *RSTCSR] [*NOSLTIND | *SLTIND] [*NOAUTOSLT | *AUTOSLT | *AUTOSLTENH])]' &&
    T.SFLMLTCHC.parameterGrammar === 'SFLMLTCHC[(&number-selected] [*NORSTCSR | *RSTCSR] [*NOSLTIND | *SLTIND])]');
  check('I-185 option indicators: all three entries state notValid, and the accessors agree (SFLCHCCTL no-parameter answer is still the entry\'s own)',
    ['SFLCHCCTL', 'SFLSNGCHC', 'SFLMLTCHC'].every((n) => T[n].optionIndicators === 'notValid' && !DspfWriter.optionIndicatorsAllowed(n)) &&
    DspfWriter.takesNoParameters('SFLCHCCTL') && !DspfWriter.takesNoParameters('SFLSNGCHC') && !DspfWriter.takesNoParameters('SFLMLTCHC'));
  check('I-185 control-value table: one object shared by CHCCTL and SFLCHCCTL, values 0-4, enhanced-interface note on both',
    T.SFLCHCCTL.controlValues === T.CHCCTL.controlValues && Object.keys(T.SFLCHCCTL.controlValues).join() === '0,1,2,3,4' &&
    T.SFLCHCCTL.controlValues[0].onOutput === 'available' && T.SFLCHCCTL.controlValues[0].onInput === 'unselected' && T.SFLCHCCTL.controlValues[1].onOutput === 'selected' &&
    T.SFLCHCCTL.cursorRestrictionsNeedEnhancedInterfaceController === true && T.CHCCTL.cursorRestrictionsNeedEnhancedInterfaceController === true &&
    has('Meaning on output') && has('Unavailable. Placing cursor on') && has('Applies only to displays attached to a controller that supports an enhanced interface'));
}

console.log('\n=== L1/L2 CHCAVAIL / CHCUNAVAIL / CHCSLT: parse and round trip ===');
{
  const text = src(
    R('PULLEDIT', 'PULLDOWN(*NOSLTIND)'),
    FLD('F1', 2, 'Y', 0, 'B', 'SNGCHCFLD'),
    K("CHOICE(1 '>Undo')"),
    K('CHCAVAIL((*COLOR YLW) (*DSPATR HI))'),
    KI('N10', 'CHCSLT((*DSPATR RI))'),
    K('CHCUNAVAIL((*COLOR RED))')
  );
  const f = parse(text).records[0].fields[0];
  const a = DspfWriter.getChoiceColorState(f.keywords, 'CHCAVAIL');
  check('parses CHCAVAIL colour and display attribute', a.present && a.color === 'YLW' && a.attrs.join() === 'HI');
  const s = DspfWriter.getChoiceColorState(f.keywords, 'CHCSLT');
  check('parses CHCSLT display attribute with no colour', s.present && s.color === '' && s.attrs.join() === 'RI');
  check('parses the option indicator on CHCSLT (and not on the other two)', s.conditions.length === 1 && DspfWriter.getChoiceColorState(f.keywords, 'CHCAVAIL').conditions.length === 0 && DspfWriter.getChoiceColorState(f.keywords, 'CHCUNAVAIL').conditions.length === 0);
  check('parses CHCUNAVAIL colour only', DspfWriter.getChoiceColorState(f.keywords, 'CHCUNAVAIL').color === 'RED' && DspfWriter.getChoiceColorState(f.keywords, 'CHCUNAVAIL').attrs.length === 0);
  check('an absent keyword reads as not present, empty', JSON.stringify(DspfWriter.getChoiceColorState([], 'CHCAVAIL')) === JSON.stringify({ present: false, color: '', attrs: [], cursorVisible: '', conditions: [] }));
  const set = DspfWriter.setChoiceColorState(f.keywords, 'CHCAVAIL', 'GRN', ['UL', 'BL']);
  check('setChoiceColorState writes (*COLOR c) (*DSPATR a a) and keeps the other keywords', kwOf(set, 'CHCAVAIL').parameters === '(*COLOR GRN) (*DSPATR UL BL)' && names(set).filter((n) => n !== 'CHCAVAIL').join() === 'SNGCHCFLD,CHOICE,CHCSLT,CHCUNAVAIL');
  check('...and returns a new array, the input untouched', set !== f.keywords && kwOf(f.keywords, 'CHCAVAIL').parameters === '(*COLOR YLW) (*DSPATR HI)');
  check('colour only writes just the colour group', kwOf(DspfWriter.setChoiceColorState([], 'CHCUNAVAIL', 'PNK', []), 'CHCUNAVAIL').parameters === '(*COLOR PNK)');
  check('attributes only writes just the display-attribute group', kwOf(DspfWriter.setChoiceColorState([], 'CHCSLT', '', ['HI']), 'CHCSLT').parameters === '(*DSPATR HI)');
  check('nothing set removes the keyword', !kwOf(DspfWriter.setChoiceColorState(f.keywords, 'CHCAVAIL', '', []), 'CHCAVAIL'));
  check('Conditioning is kept when the colour changes (conditions omitted)', DspfWriter.getChoiceColorState(DspfWriter.setChoiceColorState(f.keywords, 'CHCSLT', 'BLU', ['RI']), 'CHCSLT').conditions.length === 1);
  check('Conditioning can be replaced', DspfWriter.getChoiceColorState(DspfWriter.setChoiceColorState(f.keywords, 'CHCSLT', 'BLU', ['RI'], IND(25)), 'CHCSLT').conditions.length === 1 && DspfWriter.setChoiceColorState(f.keywords, 'CHCSLT', 'BLU', ['RI'], []).find((k) => k.name === 'CHCSLT').conditions.length === 0);
  const written = DspfWriter.setChoiceColorState([kw('SNGCHCFLD'), kw('CHOICE', "1 'X'")], 'CHCAVAIL', 'TRQ', ['HI']);
  const back = DspfWriter.getChoiceColorState(written, 'CHCAVAIL');
  check('...colour and attribute survive the write-then-read', back.color === 'TRQ' && back.attrs.join() === 'HI');
}

console.log('\n=== L1/L2 CHCAVAIL / CHCUNAVAIL / CHCSLT: companion guards, both directions ===');
{
  const colour = K('CHCAVAIL((*COLOR YLW))');
  check('CHCAVAIL beside a CHOICE is accepted', guard(pullBase, withLine(pullBase, CH1, colour)) === null);
  check('CHCAVAIL on a field with no choice keyword is refused, naming the three', say(/CHCAVAIL on field CTL1 needs PSHBTNCHC, CHOICE or MNUBARCHC/, guard(pullBase, withLine(pullBase, dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' }), colour))));
  check('CHCUNAVAIL beside a CHOICE is accepted', guard(pullBase, withLine(pullBase, CH1, K('CHCUNAVAIL((*COLOR RED))'))) === null);
  check('CHCUNAVAIL on a field with only MNUBARCHC is refused (it needs CHOICE or PSHBTNCHC)',
    say(/CHCUNAVAIL on field .* needs CHOICE or PSHBTNCHC/, guard(src(R('MENUBAR', 'MNUBAR'), FLD('M1', 2, 'Y', 0, 'B', "MNUBARCHC(1 PULLEDIT 'Edit')"), R('PULLEDIT', 'PULLDOWN')),
      src(R('MENUBAR', 'MNUBAR'), FLD('M1', 2, 'Y', 0, 'B', "MNUBARCHC(1 PULLEDIT 'Edit')"), K('CHCUNAVAIL((*COLOR RED))'), R('PULLEDIT', 'PULLDOWN')))));
  check('CHCSLT with CHOICE in a record without PULLDOWN(*NOSLTIND) is refused', say(/CHCSLT on field F1 with CHOICE \(and no MNUBARCHC\) needs PULLDOWN\(\*NOSLTIND\)/, guard(pullBase, withLine(pullBase, CH1, K('CHCSLT((*COLOR BLU))')))));
  check('CHCSLT with CHOICE in a PULLDOWN(*NOSLTIND) record is accepted', guard(pullBase.replace('PULLDOWN', 'PULLDOWN(*NOSLTIND)'), withLine(pullBase.replace('PULLDOWN', 'PULLDOWN(*NOSLTIND)'), CH1, K('CHCSLT((*COLOR BLU))'))) === null);
  check('removing the CHOICE while CHCAVAIL stays is refused (the other direction)', say(/CHCAVAIL on field F1 needs/, guard(withLine(pullBase, CH1, colour), withLine(pullBase, CH1, colour).replace(CH1 + '\n', ''))));
  check('removing CHCAVAIL is never blocked', guard(withLine(pullBase, CH1, colour), pullBase) === null);
  check('an already-invalid CHCAVAIL is not re-reported by an unchanged edit', guard(withLine(pullBase, dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' }), colour), withLine(pullBase, dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' }), colour)) === null);
  const ctl = (extra) => src(R('SFLC', 'SFLCTL(SFL1)'), K('SFLPAG(5)'), K('SFLSIZ(5)'), ...(extra || []));
  check('on a subfile control record CHCAVAIL needs SFLSNGCHC or SFLMLTCHC', say(/CHCAVAIL on record format SFLC needs SFLSNGCHC or SFLMLTCHC on the same subfile control record/, guard(ctl(), ctl([K('CHCAVAIL((*COLOR YLW))')]))));
  check('...CHCUNAVAIL and CHCSLT the same', say(/CHCUNAVAIL on record format SFLC needs SFLSNGCHC or SFLMLTCHC/, guard(ctl(), ctl([K('CHCUNAVAIL((*COLOR RED))')]))) && say(/CHCSLT on record format SFLC needs SFLSNGCHC or SFLMLTCHC/, guard(ctl(), ctl([K('CHCSLT((*COLOR RED))')]))));
  check('...accepted with SFLSNGCHC, and with SFLMLTCHC', guard(ctl([K('SFLSNGCHC')]), ctl([K('SFLSNGCHC'), K('CHCAVAIL((*COLOR YLW))')])) === null && guard(ctl([K('SFLMLTCHC')]), ctl([K('SFLMLTCHC'), K('CHCAVAIL((*COLOR YLW))')])) === null);
  check('...and removing SFLSNGCHC while CHCAVAIL stays is refused', say(/CHCAVAIL on record format SFLC needs SFLSNGCHC or SFLMLTCHC/, guard(ctl([K('SFLSNGCHC'), K('CHCAVAIL((*COLOR YLW))')]), ctl([K('CHCAVAIL((*COLOR YLW))')]))));
  {
    const noChoice = pullBase.replace(CH1 + '\n', '');
    const reasonText = guard(noChoice, withLine(noChoice, FLD('F1', 2, 'Y', 0, 'B', 'SNGCHCFLD'), colour));
    check('the panel reason is the same sentence the guard refuses with', !!reasonText && DspfWriter.choiceFieldCompanionReason('CHCAVAIL', [kw('SNGCHCFLD')], [kw('PULLDOWN')], 'F1', 'PULLEDIT') === reasonText);
  }
  check('choiceFieldCompanionProblems keys the rule: COMPANION for CHCAVAIL, NOSLTIND for CHCSLT with CHOICE',
    DspfWriter.choiceFieldCompanionReason('CHCAVAIL', [kw('SNGCHCFLD')], [], 'F1', 'R1').length > 0 && /needs PULLDOWN\(\*NOSLTIND\)/.test(DspfWriter.choiceFieldCompanionReason('CHCSLT', [kw('CHOICE', "1 'X'")], [kw('PULLDOWN')], 'F1', 'R1')));
  // Task I-183: a bare CHCAVAIL / CHCUNAVAIL / CHCSLT, or one with a colour or display attribute outside the
  // reference lists, is now refused by the model guard (pinned in full in i183ChoiceKeywordValueRules.test.js).
  check('the spec states the one-parameter minimum and the colour / display-attribute lists the I-183 guard reads',
    ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'].every((k) => { const r = KeywordSpec.choiceStateValueRules(k); return r && r.minParameters === 1 && r.colors.length === 7 && r.displayAttributes.length === 6; }));
}

console.log('\n=== L1/L2 CHCCTL: parse, round trip, guards ===');
{
  const text = withLine(pullBase, CH1, K('CHCCTL(1 &CTL1 MSG0001 LIB/MSGF)'));
  const ctls = DspfWriter.getChoiceControls(fieldKws(text, 'PULLEDIT', 'F1'));
  check('parses id, control field, message id, message file and library', ctls.length === 1 && ctls[0].id === '1' && ctls[0].controlField === '&CTL1' && ctls[0].messageId === 'MSG0001' && ctls[0].messageFile === 'MSGF' && ctls[0].library === 'LIB');
  check('a CHCCTL with no message parses with empty message parts', (() => { const c = DspfWriter.getChoiceControls([kw('CHCCTL', '2 &CTL1')])[0]; return c.id === '2' && c.messageId === '' && c.messageFile === '' && c.library === ''; })());
  const set = DspfWriter.setChoiceControls([kw('SNGCHCFLD'), kw('CHOICE', "1 'X'")], [{ id: '1', controlField: '&CTL1', messageId: 'MSG0001', messageFile: 'MSGF', library: 'LIB' }]);
  check('setChoiceControls writes id control-field message-id library/file and keeps the neighbours', kwOf(set, 'CHCCTL').parameters === '1 &CTL1 MSG0001 LIB/MSGF' && names(set).join() === 'SNGCHCFLD,CHOICE,CHCCTL');
  check('a message with no library writes just the file', kwOf(DspfWriter.setChoiceControls([], [{ id: '1', controlField: '&CTL1', messageId: 'MSG0001', messageFile: 'MSGF' }]), 'CHCCTL').parameters === '1 &CTL1 MSG0001 MSGF');
  check('no control field: the entry is skipped', DspfWriter.setChoiceControls([], [{ id: '1', controlField: '' }]).length === 0);
  check('no choice number: the entry is skipped', DspfWriter.setChoiceControls([], [{ id: '', controlField: '&CTL1' }]).length === 0);
  check('a message id with no message file writes no message (the file is required with the id)', kwOf(DspfWriter.setChoiceControls([], [{ id: '1', controlField: '&CTL1', messageId: 'MSG0001' }]), 'CHCCTL').parameters === '1 &CTL1');
  check('one CHCCTL per choice: two entries write two keywords, an empty list removes them all', DspfWriter.setChoiceControls([], [{ id: '1', controlField: '&C1' }, { id: '2', controlField: '&C2' }]).length === 2 && DspfWriter.setChoiceControls(set, []).every((k) => k.name !== 'CHCCTL'));
  check('the input is untouched by setChoiceControls', set.length === 3 && DspfWriter.setChoiceControls(set, []) !== set);
  check('CHCCTL beside CHOICE 1 is accepted', guard(pullBase, text) === null);
  check('CHCCTL for a choice number the field has no CHOICE for is refused', say(/CHCCTL\(2\) on field F1 needs a CHOICE or PSHBTNCHC keyword with the same choice number/, guard(pullBase, withLine(pullBase, CH1, K('CHCCTL(2 &CTL1)')))));
  check('the same number written with a leading zero still matches CHOICE 1', guard(pullBase, withLine(pullBase, CH1, K('CHCCTL(01 &CTL1)'))) === null);
  check('removing the CHOICE while CHCCTL stays is refused (the other direction)', say(/CHCCTL\(1\) on field F1 needs a CHOICE/, guard(text, text.replace(CH1 + '\n', ''))));
  check('a control field that exists and is not Y 1,0 H is refused', say(/control field CTL1 must be a hidden 1-byte numeric field/, guard(pullBase, withLine(pullBase, CH1, K('CHCCTL(1 &CTL1)')).replace(/CTL1 *1Y 0H/, 'CTL1           2A  B'))));
  check('...each of the four shape parts is checked (length, decimals, usage, type)',
    ['CTL1           2Y 0H', 'CTL1           1Y 1H', 'CTL1           1Y 0B', 'CTL1           1A  H'].every((shape) => say(/must be a hidden 1-byte numeric field/, guard(pullBase, withLine(pullBase, CH1, K('CHCCTL(1 &CTL1)')).replace(/CTL1 *1Y 0H/, shape)))));
  check('a control field that does not exist yet is a forward reference, not refused', guard(pullBase, withLine(pullBase, CH1, K('CHCCTL(1 &LATER)'))) === null);
  check('a CHCCTL under a PSHBTNCHC with the same number is accepted too', guard(src(R('R1'), FLD('P1', 10, 'A', undefined, 'B', 'PSHBTNFLD'), K("PSHBTNCHC(1 '&OK' CF01)"), dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' })),
    src(R('R1'), FLD('P1', 10, 'A', undefined, 'B', 'PSHBTNFLD'), K("PSHBTNCHC(1 '&OK' CF01)"), K('CHCCTL(1 &CTL1)'), dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' }))) === null);
  // Task I-183: a choice number outside 1 to 99 is a range error and the message-id / message-file field shapes
  // (A, P, 7 / 10) are checked (pinned in i183ChoiceKeywordValueRules.test.js).
  check('the spec states the 1 to 99 choice number range for CHCCTL and the message field shapes the I-183 guard reads',
    KeywordSpec.choiceNumberRange('CHCCTL').max === 99 && KeywordSpec.choiceTextAndMessageRules().messageIdField.length === 7);
}

console.log('\n=== L1/L2 CHCACCEL: parse, round trip, guards ===');
{
  const text = withLine(pullBase, CH1, K("CHCACCEL(1 'F4')"));
  check('parses the id and the accelerator text', JSON.stringify(DspfWriter.getChoiceAccelerators(fieldKws(text, 'PULLEDIT', 'F1'))) === JSON.stringify([{ id: '1', text: 'F4' }]));
  check('a &field accelerator keeps its ampersand', DspfWriter.getChoiceAccelerators([kw('CHCACCEL', '1 &ACC')])[0].text === '&ACC');
  check('a doubled quote reads as one apostrophe', DspfWriter.getChoiceAccelerators([kw('CHCACCEL', "1 'It''s'")])[0].text === "It's");
  const set = DspfWriter.setChoiceAccelerators([kw('SNGCHCFLD')], [{ id: '1', text: 'Ctrl+Z' }, { id: '2', text: "It's" }]);
  check('setChoiceAccelerators writes one CHCACCEL per entry with the text quoted', set.filter((k) => k.name === 'CHCACCEL').map((k) => k.parameters).join('|') === "1 'Ctrl+Z'|2 'It''s'");
  check('a &field accelerator is written unquoted', kwOf(DspfWriter.setChoiceAccelerators([], [{ id: '1', text: '&ACC' }]), 'CHCACCEL').parameters === '1 &ACC');
  check('blank id or blank text is skipped, and an empty list removes them all', DspfWriter.setChoiceAccelerators([], [{ id: '', text: 'F4' }, { id: '1', text: '  ' }]).length === 0 && DspfWriter.setChoiceAccelerators(set, []).every((k) => k.name !== 'CHCACCEL'));
  check('the text survives a write-then-read with an apostrophe', DspfWriter.getChoiceAccelerators(set).map((a) => a.text).join('|') === "Ctrl+Z|It's");
  check('CHCACCEL on a SNGCHCFLD field in a PULLDOWN record is accepted', guard(pullBase, text) === null);
  check('CHCACCEL on a MLTCHCFLD field is refused (needs SNGCHCFLD)', say(/CHCACCEL on field F1 needs SNGCHCFLD/, guard(pullBase.replace('SNGCHCFLD', 'MLTCHCFLD'), withLine(pullBase.replace('SNGCHCFLD', 'MLTCHCFLD'), CH1, K("CHCACCEL(1 'F4')")))));
  check('CHCACCEL in a record without PULLDOWN is refused', say(/CHCACCEL on field F1 needs PULLDOWN on record format PULLEDIT/, guard(pullBase.replace('PULLDOWN', '        '), withLine(pullBase.replace('PULLDOWN', '        '), CH1, K("CHCACCEL(1 'F4')")))));
  check('removing SNGCHCFLD while CHCACCEL stays is refused', say(/CHCACCEL on field F1 needs SNGCHCFLD/, guard(text, text.replace('SNGCHCFLD', '         '))));
  check('removing PULLDOWN while CHCACCEL stays is refused', say(/CHCACCEL on field F1 needs PULLDOWN/, guard(text, text.replace('PULLDOWN', '        '))));
  check('removing CHCACCEL is never blocked', guard(text, pullBase) === null);
  // Task I-183: CHCACCEL(100 ...) and a CHCACCEL with no accelerator text are now refused (the 1 to 99 range and
  // the required text are enforced by the model guard; pinned in i183ChoiceKeywordValueRules.test.js).
  check('the spec states CHCACCEL\'s 1 to 99 range and its A / P accelerator text field', KeywordSpec.choiceNumberRange('CHCACCEL').min === 1 && KeywordSpec.choiceTextAndMessageRules().acceleratorTextField.usage === 'P');
}

console.log('\n=== L1/L2 SFLCHCCTL: parse, definition rewrite, guards ===');
{
  const text = src(
    R('SFLRCD', 'SFL'),
    dds({ name: 'CTLFLD', len: 1, type: 'Y', dec: 0, use: 'H', fn: 'SFLCHCCTL' }),
    dds({ name: 'F1', len: 4, type: 'A', use: 'O', line: 6, col: 10 })
  );
  const m = parse(text);
  const first = m.records[0].fields[0];
  check('parses SFLCHCCTL as a bare keyword on the first field of the SFL record', names(first.keywords).join() === 'SFLCHCCTL' && kwOf(first.keywords, 'SFLCHCCTL').parameters.trim() === '' && first.name === 'CTLFLD');
  check('the reference example shape (Y 1,0 H on the first field) needs no definition rewrite', DspfWriter.sflchcctlDefinitionUpdates({ dataType: first.dataType, length: first.length, decimalPositions: first.decimalPositions, usage: first.usage }) === null);
  check('a wrong field is rewritten to Y, 1, 0, H as a whole (type, length, decimals, usage)', JSON.stringify(DspfWriter.sflchcctlDefinitionUpdates({ dataType: 'A', length: 5, decimalPositions: null, usage: 'B' })) === JSON.stringify({ dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' }));
  check('...and only the wrong parts are rewritten', JSON.stringify(DspfWriter.sflchcctlDefinitionUpdates({ dataType: 'Y', length: 1, decimalPositions: 0, usage: 'B' })) === JSON.stringify({ usage: 'H' }) && JSON.stringify(DspfWriter.sflchcctlDefinitionUpdates({ dataType: 'Y', length: 3, decimalPositions: 0, usage: 'H' })) === JSON.stringify({ length: 1 }));
  const fieldGuard = DspfWriter.sflchcctlFieldConflictReason;
  check('SFLCHCCTL on the first field with no other holder and no SFLNXTCHG is accepted', fieldGuard(true, [[]], [kw('SFL')]) === '');
  check('SFLCHCCTL on a field that is not first is refused', say(/must be on the first field defined in the subfile record/, fieldGuard(false, [], [])));
  check('a second SFLCHCCTL in the same subfile record is refused', say(/Only one SFLCHCCTL keyword is allowed/, fieldGuard(true, [[kw('SFLCHCCTL')]], [])));
  check('SFLCHCCTL on a record that already has SFLNXTCHG is refused', say(/cannot be added to a record that already has SFLNXTCHG/, fieldGuard(true, [], [kw('SFLNXTCHG')])));
  check('SFLNXTCHG on a record that has a SFLCHCCTL field is refused (the reverse side)', say(/SFLNXTCHG cannot be added to a record that contains a field with the SFLCHCCTL keyword/, DspfWriter.sflNxtchgSflchcctlConflictReason([[kw('SFLCHCCTL')]])));
  check('...and is accepted when no field has SFLCHCCTL', DspfWriter.sflNxtchgSflchcctlConflictReason([[kw('CHECK', '(AB)')], []]) === '');
  const ok = { dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' };
  const basic = DspfWriter.sflchcctlBasicEditConflictReason;
  check('a Basic-tab edit that breaks the control-field shape is refused, naming the part (length, usage, type, decimals)',
    say(/cannot set length 2/, basic([kw('SFLCHCCTL')], ok, { length: 2 })) && say(/cannot set usage B/, basic([kw('SFLCHCCTL')], ok, { usage: 'B' })) &&
    say(/data type/, basic([kw('SFLCHCCTL')], ok, { dataType: 'A' })) && say(/decimal/, basic([kw('SFLCHCCTL')], ok, { decimalPositions: 2 })));
  check('a Basic-tab edit that keeps the shape is accepted', basic([kw('SFLCHCCTL')], ok, { length: 1, usage: 'H' }) === null);
  check('a field without SFLCHCCTL is never held to the shape', basic([], ok, { length: 2 }) === null);
  const setFlag = DspfWriter.setFileFlagKeyword([kw('DUP')], 'SFLCHCCTL', true);
  // I-193: retired "SFLCHCCTL round trips as a bare flag and keeps its neighbours" - the generated matrix (L5, RETAINED) runs the same flag-path assertion on this keyword.
  // Not asserted (logged as I-185): the spec entry has no level / parameter / option-indicator fact; the control-value
  // table (0 to 4, enhanced-interface cursor restrictions) is a reference table the spec does not record at all.
}

console.log('\n=== L1/L2 SFLSNGCHC / SFLMLTCHC: parse, parameters, exclusions, both directions ===');
{
  const ctl = (...k) => src(R('SFLC', 'SFLCTL(SFL1)'), K('SFLPAG(5)'), K('SFLSIZ(5)'), ...k);
  const sng = parse(ctl(K('SFLSNGCHC(*RSTCSR *SLTIND *AUTOSLT)'))).records[0].keywords;
  check('parses every SFLSNGCHC parameter', JSON.stringify(DspfWriter.getSflSngChcKeyword(sng)) === JSON.stringify({ present: true, rstcsr: 'RSTCSR', sltind: true, autoslt: 'AUTOSLT' }));
  check('a bare SFLSNGCHC reads as present with every group at its context default', JSON.stringify(DspfWriter.getSflSngChcKeyword([kw('SFLSNGCHC')])) === JSON.stringify({ present: true, rstcsr: '', sltind: false, autoslt: '' }));
  check('*NORSTCSR and *NOAUTOSLT are told apart from "not written"', DspfWriter.getSflSngChcKeyword([kw('SFLSNGCHC', '*NORSTCSR *NOAUTOSLT')]).rstcsr === 'NORSTCSR' && DspfWriter.getSflSngChcKeyword([kw('SFLSNGCHC', '*NORSTCSR *NOAUTOSLT')]).autoslt === 'NOAUTOSLT');
  check('*AUTOSLT and *AUTOSLTENH are not confused', DspfWriter.getSflSngChcKeyword([kw('SFLSNGCHC', '*AUTOSLT')]).autoslt === 'AUTOSLT' && DspfWriter.getSflSngChcKeyword([kw('SFLSNGCHC', '*AUTOSLTENH')]).autoslt === 'AUTOSLTENH');
  check('an absent SFLSNGCHC reads as not present', DspfWriter.getSflSngChcKeyword([]).present === false);
  const mlt = DspfWriter.getSflMltChcKeyword([kw('SFLMLTCHC', '&NUMSEL *NORSTCSR *SLTIND')]);
  check('parses SFLMLTCHC &number-selected, *NORSTCSR and *SLTIND', mlt.present && mlt.numberSelectedField === 'NUMSEL' && mlt.rstcsr === 'NORSTCSR' && mlt.sltind === true);
  check('a bare SFLMLTCHC has no number-selected field', DspfWriter.getSflMltChcKeyword([kw('SFLMLTCHC')]).numberSelectedField === '' && DspfWriter.getSflMltChcKeyword([]).present === false);
  check('setSflSngChcKeyword writes the *tokens in reference order and keeps the neighbours', kwOf(DspfWriter.setSflSngChcKeyword([kw('SFLPAG', '5')], true, 'RSTCSR', true, 'AUTOSLT'), 'SFLSNGCHC').parameters === '*RSTCSR *SLTIND *AUTOSLT' && names(DspfWriter.setSflSngChcKeyword([kw('SFLPAG', '5')], true)).join() === 'SFLPAG,SFLSNGCHC');
  check('...a group left blank writes nothing for it, and a bare keyword is written when all are blank', kwOf(DspfWriter.setSflSngChcKeyword([], true, '', false, ''), 'SFLSNGCHC').parameters === '' && kwOf(DspfWriter.setSflSngChcKeyword([], true, '', true, ''), 'SFLSNGCHC').parameters === '*SLTIND');
  check('setSflMltChcKeyword writes &field first, then *RSTCSR token and *SLTIND', kwOf(DspfWriter.setSflMltChcKeyword([], true, 'NUMSEL', 'NORSTCSR', true), 'SFLMLTCHC').parameters === '&NUMSEL *NORSTCSR *SLTIND');
  check('...present false removes the keyword, and writing again does not duplicate it', DspfWriter.setSflSngChcKeyword(DspfWriter.setSflSngChcKeyword([], true, '', false, ''), true, 'RSTCSR', false, '').filter((k) => k.name === 'SFLSNGCHC').length === 1 && !kwOf(DspfWriter.setSflMltChcKeyword([kw('SFLMLTCHC')], false), 'SFLMLTCHC'));
  const back = DspfWriter.getSflMltChcKeyword(DspfWriter.setSflMltChcKeyword([], true, 'NUMSEL', 'RSTCSR', false));
  check('SFLMLTCHC write-then-read keeps the field and *RSTCSR, *SLTIND stays off', back.numberSelectedField === 'NUMSEL' && back.rstcsr === 'RSTCSR' && back.sltind === false);
  const cr = DspfWriter.sflChoiceListConflictReason;
  check('turning SFLSNGCHC on beside SFLMLTCHC, SFLDROP or SFLFOLD is refused, naming the partner',
    ['SFLMLTCHC', 'SFLDROP', 'SFLFOLD'].every((p) => say(new RegExp('SFLSNGCHC cannot be specified on the same record as ' + p), cr('SFLSNGCHC', [kw(p)]))));
  check('turning SFLMLTCHC on beside SFLSNGCHC, SFLDROP or SFLFOLD is refused, naming the partner',
    ['SFLSNGCHC', 'SFLDROP', 'SFLFOLD'].every((p) => say(new RegExp('SFLMLTCHC cannot be specified on the same record as ' + p), cr('SFLMLTCHC', [kw(p)]))));
  check('with no partner there is no conflict, and a name with no spec entry is fail-safe', cr('SFLSNGCHC', []) === '' && cr('SFLSNGCHC', [kw('SFLPAG', '5')]) === '' && cr('DUP', [kw('SFLDROP')]) === '');
  const nc = DspfWriter.sflChoiceListNewConflictReason;
  check('the model guard refuses SFLDROP added beside SFLSNGCHC (the reverse direction)', say(/SFLDROP cannot be specified on the same record as SFLSNGCHC/, nc([kw('SFLSNGCHC')], [kw('SFLSNGCHC'), kw('SFLDROP', '&DR')])));
  check('...SFLFOLD beside SFLMLTCHC the same', say(/SFLFOLD cannot be specified on the same record as SFLMLTCHC/, nc([kw('SFLMLTCHC')], [kw('SFLMLTCHC'), kw('SFLFOLD', '&FD')])));
  check('...and an already-invalid pair is not re-reported by an unchanged edit, removing either side is allowed', nc([kw('SFLSNGCHC'), kw('SFLDROP')], [kw('SFLSNGCHC'), kw('SFLDROP')]) === null && nc([kw('SFLSNGCHC'), kw('SFLDROP')], [kw('SFLSNGCHC')]) === null);
  check('the pair SFLSNGCHC + SFLMLTCHC added together is refused', say(/cannot be specified on the same record as/, nc([], [kw('SFLSNGCHC'), kw('SFLMLTCHC')])));
  check('SFLSNGCHC on a control record with no partner is accepted by the model guard', nc([], [kw('SFLSNGCHC'), kw('SFLPAG', '5')]) === null);
  // Not asserted (logged as I-184): "only one output field, no input-capable fields" for the subfile, "valid only for the
  // subfile-control record format", and the &number-selected field shape (hidden, Y, length 4, 0 decimals) are not enforced
  // by any guard tried (a two-output-field subfile under SFLSNGCHC, SFLSNGCHC on the SFL record, SFLMLTCHC(&BAD) all pass).
}

console.log('\n=== L3 display: the colour-state panel ===');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
const alerts = [];
dom.window.alert = (m) => alerts.push(m);
const root = () => document.getElementById('root');
const PULL = [kw('PULLDOWN', '(*NOSLTIND)')];
const SNG = kw('SNGCHCFLD');
const CHOICE1 = kw('CHOICE', "1 'Undo'");
{
  const states = (k, rec) => Helpers.visibleChoiceColorStates(k, undefined, rec).map((s) => s.key).join();
  check('a choice field in a PULLDOWN(*NOSLTIND) record offers avail, unavail and slt rows', states([SNG, CHOICE1], PULL) === 'avail,unavail,slt');
  check('with no choice keyword the panel offers no row and says why', states([SNG], PULL) === '');
  const kws = [SNG, CHOICE1, kw('CHCAVAIL', '(*COLOR YLW) (*DSPATR HI)'), kw('CHCSLT', '(*DSPATR RI)', IND('10'))];
  root().innerHTML = Helpers.choiceColorStatesHtml(kws, 'x', new Set(), undefined, PULL);
  check('saved state: the avail row is checked with its colour selected and its attribute checked', root().querySelector('#x-ccs-avail-on').checked && root().querySelector('#x-ccs-avail-color').value === 'YLW' && root().querySelector('.x-ccs-avail-attr[value="HI"]').checked && !root().querySelector('.x-ccs-avail-attr[value="UL"]').checked);
  check('saved state: the slt row has no colour but its attribute checked; the unavail row is unchecked', root().querySelector('#x-ccs-slt-on').checked && root().querySelector('#x-ccs-slt-color').value === '' && root().querySelector('.x-ccs-slt-attr[value="RI"]').checked && !root().querySelector('#x-ccs-unavail-on').checked);
  check('the colour list is the seven reference colours plus "(none)"', Array.from(root().querySelectorAll('#x-ccs-avail-color option')).map((o) => o.value).filter(Boolean).sort().join() === 'BLU,GRN,PNK,RED,TRQ,WHT,YLW');
  check('the attribute list is the six reference display attributes', Array.from(root().querySelectorAll('.x-ccs-avail-attr')).map((c) => c.value).sort().join() === 'BL,CS,HI,ND,RI,UL');
  check('a Conditioning toggle is drawn for each of the three rows, and the slt row shows its count', root().querySelectorAll('.kw-cond-toggle').length === 3 && /Conditioning \(1\)/.test(root().querySelector('.kw-cond-toggle[data-flag-id="x-ccs-slt"]').textContent) && /^Conditioning [\u25be\u25b4]$/.test(root().querySelector('.kw-cond-toggle[data-flag-id="x-ccs-avail"]').textContent.trim()));
  let committed = null;
  Helpers.wireChoiceColorStatesEditor(kws, (n) => { committed = n; }, 'x', new Set(), () => {}, undefined, PULL);
  root().querySelector('#x-ccs-unavail-on').checked = true;
  root().querySelector('#x-ccs-unavail-color').value = 'RED';
  root().querySelector('.x-ccs-avail-attr[value="UL"]').checked = true;
  root().querySelector('.x-ccs-apply').click();
  check('Apply writes the unchecked row on, with its colour', !!committed && kwOf(committed, 'CHCUNAVAIL').parameters === '(*COLOR RED)');
  check('Apply writes the changed attribute list on the avail row', kwOf(committed, 'CHCAVAIL').parameters === '(*COLOR YLW) (*DSPATR HI UL)');
  check('Apply keeps the slt row and its Conditioning, and the other keywords', kwOf(committed, 'CHCSLT').conditions.length === 1 && names(committed).slice(0, 2).join() === 'SNGCHCFLD,CHOICE');
  root().innerHTML = Helpers.choiceColorStatesHtml(kws, 'y', new Set(), undefined, PULL);
  Helpers.wireChoiceColorStatesEditor(kws, (n) => { committed = n; }, 'y', new Set(), () => {}, undefined, PULL);
  root().querySelector('#y-ccs-avail-on').checked = false;
  root().querySelector('.y-ccs-apply').click();
  check('unchecking a row and Apply removes that keyword and leaves the others', !kwOf(committed, 'CHCAVAIL') && !!kwOf(committed, 'CHCSLT'));
}

console.log('\n=== L3 display: the selection-list panel (SFLSNGCHC / SFLMLTCHC) ===');
{
  const panel = (kws, id) => {
    const rec = { keywords: kws };
    root().innerHTML = Helpers.sflChoiceListPanelHtml(rec, id);
    return rec;
  };
  panel([], 's');
  check('no keyword: the type select reads (none) and both detail blocks are hidden', root().querySelector('#s-selchc-type').value === '' && /display:none/.test(root().querySelector('#s-selchc-sngchc').getAttribute('style')) && /display:none/.test(root().querySelector('#s-selchc-mltchc').getAttribute('style')));
  panel([kw('SFLSNGCHC', '*RSTCSR *SLTIND *AUTOSLT')], 's');
  check('saved SFLSNGCHC: type, *RSTCSR, selection indicators and auto-select are all shown', root().querySelector('#s-selchc-type').value === 'SFLSNGCHC' && root().querySelector('#s-selchc-sngchc-rstcsr').value === 'RSTCSR' && root().querySelector('#s-selchc-sngchc-sltind').checked && root().querySelector('#s-selchc-sngchc-autoslt').value === 'AUTOSLT' && !/display:none/.test(root().querySelector('#s-selchc-sngchc').getAttribute('style')));
  panel([kw('SFLMLTCHC', '&NUMSEL *NORSTCSR')], 's');
  check('saved SFLMLTCHC: type, number-selected field and *NORSTCSR are shown, no auto-select control', root().querySelector('#s-selchc-type').value === 'SFLMLTCHC' && root().querySelector('#s-selchc-mltchc-numsel').value === 'NUMSEL' && root().querySelector('#s-selchc-mltchc-rstcsr').value === 'NORSTCSR' && !root().querySelector('#s-selchc-mltchc-autoslt'));
  panel([kw('PULLDOWN')], 's');
  check('in a pull-down record the defaults are stated as *RSTCSR and *AUTOSLT', /\*RSTCSR \(this record is in a pull-down\)/.test(root().innerHTML) && /\*AUTOSLT \(this record is in a pull-down\)/.test(root().innerHTML));
  panel([], 's');
  check('outside a pull-down the defaults are stated as *NORSTCSR and *NOAUTOSLT', /\*NORSTCSR \(this record is not in a pull-down\)/.test(root().innerHTML) && /\*NOAUTOSLT \(this record is not in a pull-down\)/.test(root().innerHTML));
  // Choosing a type commits, and switching type strips the other keyword.
  let kws = [kw('SFLPAG', '5')];
  let committed = null;
  panel(kws, 'c');
  Helpers.wireSflChoiceListPanel('c', () => kws, (n) => { committed = n; kws = n; });
  const sel = root().querySelector('#c-selchc-type');
  sel.value = 'SFLSNGCHC'; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  check('choosing Single-choice writes SFLSNGCHC and keeps SFLPAG', !!committed && names(committed).join() === 'SFLPAG,SFLSNGCHC');
  check('...and shows the single-choice detail block', !/display:none/.test(root().querySelector('#c-selchc-sngchc').getAttribute('style') || ''));
  sel.value = 'SFLMLTCHC'; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  check('switching to Multiple-choice replaces SFLSNGCHC (switching is never a conflict)', names(committed).join() === 'SFLPAG,SFLMLTCHC' && alerts.length === 0);
  const num = root().querySelector('#c-selchc-mltchc-numsel'); num.value = 'NUMSEL'; num.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  check('typing a number-selected field writes &NUMSEL on SFLMLTCHC', kwOf(committed, 'SFLMLTCHC').parameters === '&NUMSEL');
  sel.value = ''; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  check('choosing (none) removes both keywords', !kwOf(committed, 'SFLSNGCHC') && !kwOf(committed, 'SFLMLTCHC') && names(committed).join() === 'SFLPAG');
  // A record with SFLFOLD: the choice is refused, the select snaps back.
  kws = [kw('SFLPAG', '5'), kw('SFLFOLD', '&FD')];
  committed = null; alerts.length = 0;
  panel(kws, 'd');
  Helpers.wireSflChoiceListPanel('d', () => kws, (n) => { committed = n; });
  const sel2 = root().querySelector('#d-selchc-type');
  sel2.value = 'SFLSNGCHC'; sel2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  check('choosing a list type on a record with SFLFOLD is refused with the DDS wording, nothing committed', alerts.length === 1 && /SFLSNGCHC cannot be specified on the same record as SFLFOLD/.test(alerts[0]) && committed === null);
  check('...and the select snaps back to (none)', sel2.value === '');
}

console.log('\n=== L4 commit paths: the raw keyword editor (jsdom webview) ===');
const SRC = src(
  R('PULLEDIT', 'PULLDOWN'),
  FLD('F1', 2, 'Y', 0, 'B', 'SNGCHCFLD'),
  K("CHOICE(1 '>Undo')"),
  dds({ name: 'CTL1', len: 1, type: 'Y', dec: 0, use: 'H' }),
  dds({ name: 'F2', len: 5, type: 'A', use: 'B', line: 3, col: 2 })
);
const posted = [];
const wvAlerts = [];
const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I122G.DSPF');
const wv = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => wvAlerts.push(m);
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const doc = wv.window.document;
  const { Event } = wv.window;
  const el = (id) => doc.getElementById(id);
  function selectField(line) {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    posted.length = 0;
    wvAlerts.length = 0;
    return true;
  }
  const lastEdit = () => posted.filter((m) => m.type === 'applyEdit').pop();
  function rawAdd(line, name, params) {
    el('field-' + line + '-new-kw-name').value = name;
    const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  }
  const fieldNamed = (text, name) => { const out = []; parse(text).records.forEach((r) => r.fields.forEach((f) => out.push(f))); return out.find((f) => f.name === name); };

  console.log('  -- refusals (a refused edit posts nothing)');
  check('fixture: F1 is on the canvas', selectField(2));
  rawAdd(2, 'CHCCTL', '2 &CTL1');
  check('CHCCTL(2 ...) with no CHOICE 2 is refused with the DDS wording', wvAlerts.length === 1 && /CHCCTL\(2\) on field F1 needs a CHOICE or PSHBTNCHC keyword with the same choice number/.test(wvAlerts[0]) && !lastEdit());
  check('fixture: F2 is on the canvas', selectField(5));
  rawAdd(5, 'CHCAVAIL', '(*COLOR YLW)');
  check('CHCAVAIL on a field with no choice keyword is refused', wvAlerts.length === 1 && /CHCAVAIL on field F2 needs PSHBTNCHC, CHOICE or MNUBARCHC/.test(wvAlerts[0]) && !lastEdit());
  rawAdd(5, 'CHCUNAVAIL', '(*COLOR RED)');
  check('CHCUNAVAIL on a field with no choice keyword is refused', wvAlerts.length >= 1 && /CHCUNAVAIL on field F2 needs CHOICE or PSHBTNCHC/.test(wvAlerts[wvAlerts.length - 1]) && !lastEdit());
  check('fixture: F1 selectable again', selectField(2));
  rawAdd(2, 'CHCSLT', '(*COLOR PNK)');
  check('CHCSLT beside CHOICE in a record without PULLDOWN(*NOSLTIND) is refused', wvAlerts.length === 1 && /CHCSLT on field F1 with CHOICE \(and no MNUBARCHC\) needs PULLDOWN\(\*NOSLTIND\)/.test(wvAlerts[0]) && !lastEdit());

  console.log('  -- accepted edits');
  check('F1 selectable once more', selectField(2));
  rawAdd(2, 'CHCAVAIL', '(*COLOR YLW)');
  check('CHCAVAIL beside CHOICE is accepted, no alert, and the text carries it', wvAlerts.length === 0 && !!lastEdit() && kwOf(fieldNamed(lastEdit().text, 'F1').keywords, 'CHCAVAIL') && /CHCAVAIL/.test(lastEdit().text));
  check('F1 selectable after the edit', selectField(2));
  rawAdd(2, 'CHCUNAVAIL', '(*COLOR RED)');
  check('CHCUNAVAIL beside CHOICE is accepted too', wvAlerts.length === 0 && !!lastEdit() && !!kwOf(fieldNamed(lastEdit().text, 'F1').keywords, 'CHCUNAVAIL'));
  check('F1 selectable for CHCCTL', selectField(2));
  rawAdd(2, 'CHCCTL', '1 &CTL1');
  check('CHCCTL(1 &CTL1) beside CHOICE 1 is accepted', wvAlerts.length === 0 && !!lastEdit() && !!kwOf(fieldNamed(lastEdit().text, 'F1').keywords, 'CHCCTL'));
  check('F1 selectable for CHCACCEL', selectField(2));
  rawAdd(2, 'CHCACCEL', "1 'F4'");
  check('CHCACCEL on the SNGCHCFLD field in the PULLDOWN record is accepted', wvAlerts.length === 0 && !!lastEdit() && !!kwOf(fieldNamed(lastEdit().text, 'F1').keywords, 'CHCACCEL'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

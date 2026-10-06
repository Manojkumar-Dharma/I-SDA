/**
 * i181HelpWindowSpecFacts.test.js
 *
 * Task I-181 - the RECORD_TYPES entries for HLPDOC, HLPID, WDWBORDER and NOCCSID held only a rule
 * fragment and stated no level, parameter-grammar or option-indicator fact, although each DDS
 * Reference section does.  So optionIndicatorsAllowed answered false for HLPDOC and WDWBORDER,
 * whose sections say "Option indicators are valid for this keyword".
 *
 *   HLPDOC     file or help-specification level, three-parameter grammar, option indicators valid
 *   HLPID      constant field level, option indicators not valid
 *   WDWBORDER  file or record level, three-parameter grammar, option indicators valid
 *   NOCCSID    field level, no parameters; the section states nothing on option indicators
 *
 * Run with: node src/test/i181HelpWindowSpecFacts.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ').replace(/- /g, '-');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ').replace(/- /g, '-')) !== -1;
const T = KeywordSpec.RECORD_TYPES;
const j = (a) => JSON.stringify(a);

console.log('=== the reference sentences each fact comes from ===');
check('HLPDOC: "file- or help-specification-level", the format line, "Option indicators are valid"',
  has('You use this file- or help-specification-level keyword') &&
  has('HLPDOC(online-help-information-text-label-name document-name folder-name)') && has('Option indicators are valid for this keyword.'));
check('HLPID: "constant field-level" and "Option indicators are not valid"',
  has('You use this constant field-level keyword to specify an identifier') && has('Option indicators are not valid for this keyword.'));
check('WDWBORDER: "file-level or record-level", the format line, "Option indicators are valid"',
  has('You use this file-level or record-level keyword to specify the color, display attributes') &&
  has('WDWBORDER([color] [display-attribute] [characters])') && has('Option indicators are valid for this keyword.'));
check('NOCCSID: "field-level" and "This keyword has no parameters."',
  has('You use this field-level keyword to specify that CCSID conversion of the field is not done.') && has('This keyword has no parameters.'));

console.log('\n=== the four entries state their facts ===');
check('HLPDOC: levels file + help, optionIndicators valid, three-parameter form',
  j(T.HLPDOC.levels) === j(['file', 'help']) && T.HLPDOC.optionIndicators === 'valid' && T.HLPDOC.parameterForm === 'HLPDOC(online-help-information-text-label-name document-name folder-name)');
check('HLPID: level field, optionIndicators notValid', j(T.HLPID.levels) === j(['field']) && T.HLPID.optionIndicators === 'notValid');
check('WDWBORDER: levels file + record, optionIndicators valid, three-parameter form',
  j(T.WDWBORDER.levels) === j(['file', 'record']) && T.WDWBORDER.optionIndicators === 'valid' && T.WDWBORDER.parameterForm === 'WDWBORDER([color] [display-attribute] [characters])');
check('NOCCSID: level field and NO optionIndicators fact (its section states none)', j(T.NOCCSID.levels) === j(['field']) && T.NOCCSID.optionIndicators === undefined);

console.log('\n=== the accessors now answer from the spec ===');
const oi = (k) => KeywordSpec.optionIndicatorsAllowed(k) === DspfWriter.optionIndicatorsAllowed(k) ? KeywordSpec.optionIndicatorsAllowed(k) : 'DISAGREE';
check('optionIndicatorsAllowed: HLPDOC true, WDWBORDER true, HLPID false, NOCCSID false (stated nowhere)', oi('HLPDOC') === true && oi('WDWBORDER') === true && oi('HLPID') === false && oi('NOCCSID') === false);
check('takesNoParameters: NOCCSID true; HLPDOC, HLPID and WDWBORDER false',
  KeywordSpec.takesNoParameters('NOCCSID') && !KeywordSpec.takesNoParameters('HLPDOC') && !KeywordSpec.takesNoParameters('HLPID') && !KeywordSpec.takesNoParameters('WDWBORDER'));
const f = KeywordSpec.noOptionIndicatorsFact('HLPID');
check('HLPID agrees with the no-option-indicators table at the same level', !!f && f.kind === 'notValid' && j(f.levels) === j(T.HLPID.levels));
check('HLPDOC, WDWBORDER and NOCCSID are not in the no-option-indicators table', ['HLPDOC', 'WDWBORDER', 'NOCCSID'].every((k) => KeywordSpec.noOptionIndicatorsFact(k) === null));

console.log('\n=== the rule fragments the entries already carried are untouched ===');
check('HLPDOC keeps its mutex with HLPBDY, HLPPNLGRP and HLPRTN', T.HLPDOC.mutex.join() === 'HLPBDY,HLPPNLGRP,HLPRTN');
check('HLPID keeps its 1-999 range, uniqueness, required parameter and constant-field rule',
  T.HLPID.identifierRange.min === 1 && T.HLPID.identifierRange.max === 999 && T.HLPID.uniqueWithinRecord === true && T.HLPID.parameterRequired === true && T.HLPID.validOnlyOnConstantField === true);
check('WDWBORDER keeps its display-attribute values and COLOR value source', j(T.WDWBORDER.displayAttributeValues) === j(['BL', 'CS', 'HI', 'ND', 'RI', 'UL']) && T.WDWBORDER.colorValuesFrom === 'COLOR');
check('NOCCSID keeps noParameters and fieldLevel', T.NOCCSID.noParameters === true && T.NOCCSID.fieldLevel === true);

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

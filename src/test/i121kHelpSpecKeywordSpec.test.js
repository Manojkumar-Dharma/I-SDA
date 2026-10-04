/**
 * i121kHelpSpecKeywordSpec.test.js
 *
 * Task I-121k - "One declarative rule spec per keyword", help-specification-level
 * keywords slice: HLPARA, HLPBDY, HLPEXCLD. Each now has a RECORD_TYPES entry read
 * from DDS_Keyword_V7r6.txt. Pure refactor: no guard changes; rules no guard
 * enforces are recorded as facts and logged as findings.
 *
 * Parts: (1) entries against the reference text; (2) the facts; (3) sweeps against
 * KEYWORD-LOOKUP.json, the no-option-indicators table, the HLPDOC mutex (still the
 * only copy), and the parser's view of an H specification; (4) accessors.
 *
 * Run with: node src/test/i121kHelpSpecKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');

const THREE = ['HLPARA', 'HLPBDY', 'HLPEXCLD'];
const norm = (t) => String(t).replace(/\f/g, ' ').replace(/\s+/g, ' ').replace(/- /g, '-');
const REF = norm(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8'));
const has = (t) => REF.indexOf(norm(t)) !== -1;
const R = KeywordSpec.RECORD_TYPES;
const j = (v) => JSON.stringify(v);

console.log('=== 1. entries against the reference text ===');
check('the slice owns exactly the three keywords, in order', j(KeywordSpec.helpSpecKeywords()) === j(THREE));
THREE.forEach((n) => {
  const e = R[n];
  check(n + ': has an entry with a line citation', !!e && /~line \d+/.test(e.ddsReference));
  check(n + ': its heading exists in the reference', has(n + ' (') && has('keyword for display files'));
  check(n + ': help-specification level only', j(e.levels) === j(['help']));
});
check('HLPARA: help-specification-level, defines a rectangular area', has('You use this help-specification-level keyword to define a rectangular area on the display.'));
check('HLPARA: the five forms', has('HLPARA(top-line left-position bottom-line right-position)') && has('HLPARA(*RCD)') && has('HLPARA(*NONE)') && has('HLPARA(*FLD field-name [choice-number])') && has('HLPARA(*CNST help-identifier)') &&
  R.HLPARA.parameterForms.length === 5 && R.HLPARA.parameterForms.every((f) => has(f)));
check('HLPARA: coordinates within the display size, top not after bottom, left not after right, SLNO adjusts',
  has('The line and position values must be within the display size.') && has('The top line must not exceed the bottom line and the left position must not exceed the right position.') &&
  has('If you specify the SLNO(n) keyword on the record, the top-line and bottom-line values are adjusted') &&
  R.HLPARA.coordinates.withinDisplaySize && R.HLPARA.coordinates.topLineNotAfterBottomLine && R.HLPARA.coordinates.leftPositionNotAfterRightPosition && R.HLPARA.coordinates.adjustedBySlno);
check('HLPARA: secondary display size falls back to the primary HLPARA, else *NONE',
  has('If you do not specify HLPARA for a secondary display size, the HLPARA of the primary display size is used if it is valid for the secondary display size. HLPARA(*NONE) is used if the HLPARA of the primary display size is not valid for the secondary display size.') && /\*NONE/.test(R.HLPARA.coordinates.secondarySizeFallback));
check('HLPARA: *RCD not valid for SFLCTL / USRDFN, needs a displayable field',
  has('HLPARA(*RCD) is not valid for subfile control (SFLCTL) or user-defined (USRDFN) record formats.') && has('must contain at least one displayable field for the primary display size') &&
  j(R.HLPARA.rcd.notOnRecordTypes) === j(['SFLCTL', 'USRDFN']) && R.HLPARA.rcd.recordNeedsDisplayableField === true);
check('HLPARA: hidden, message, program-to-system, SFLPGMQ and SFLMSGKEY fields are not displayable',
  has('Hidden (H in position 38), message (M in position 38), and program-to-system (P in position 38) fields and fields that specify a SFLPGMQ or SFLMSGKEY keyword are not displayable.') && R.HLPARA.rcd.notDisplayable.length === 5);
check('HLPARA: *FLD names a field of the record; choice number 1 to 99 on a MNUBARCHC / CHOICE field',
  has('The field must exist in the record containing the H specification.') && has('Valid values for the choice number are positive integers greater than 0 and less than 100.') &&
  has('the choice number you specify must also be specified on a MNUBARCHC or CHOICE keyword for that field') &&
  R.HLPARA.fld.fieldMustExistInRecord && R.HLPARA.fld.choiceNumber.min === 1 && R.HLPARA.fld.choiceNumber.max === 99 && j(R.HLPARA.fld.choiceNumber.onlyForFieldsWith) === j(['MNUBARCHC', 'CHOICE']));
check('HLPARA: *CNST names a constant field that has HLPID with the same identifier',
  has('The constant field must exist in the record containing the H specification, and it must have the HLPID keyword specified with the same help-identifier.') &&
  R.HLPARA.cnst.constantFieldMustExistInRecord && R.HLPARA.cnst.constantFieldNeedsKeyword === 'HLPID' && R.HLPARA.cnst.sameHelpIdentifier);
check('HLPARA: at least one per H specification, display size conditioning when several, areas may overlap',
  has('You must specify at least one HLPARA keyword on an H specification. When you specify multiple HLPARA keywords for each H specification, you must use display size conditioning.') &&
  has('Help areas can overlap when multiple H specifications are specified on a record.') &&
  R.HLPARA.atLeastOnePerHelpSpecification && R.HLPARA.multipleNeedDisplaySizeConditioning && R.HLPARA.helpAreasMayOverlap && R.HLPARA.firstMatchingHelpSpecificationUsed);
check('HLPARA: option indicators are not valid', has('Option indicators are not valid for this keyword.') && R.HLPARA.optionIndicators === 'notValid');
const hs = KeywordSpec.helpSpecificationRules();
check('the H specification rules: position, exactly one of HLPRCD / HLPPNLGRP / HLPDOC, up to one HLPBDY or HLPEXCLD, at least one HLPARA',
  has('An H in position 17 denotes the start of an H specification. The H specification must be located in the DDS after the record-level keywords and before the first field in that record.') &&
  has('Each H specification must have exactly one HLPRCD, HLPPNLGRP, or HLPDOC keyword, up to one HLPBDY or HLPEXCLD keyword, and at least one HLPARA keyword.') &&
  hs.startsWithHInPosition17 && hs.locatedAfterRecordKeywordsBeforeFirstField && j(hs.exactlyOneOf) === j(['HLPRCD', 'HLPPNLGRP', 'HLPDOC']) && j(hs.atMostOneOf) === j(['HLPBDY', 'HLPEXCLD']) && j(hs.atLeastOne) === j(['HLPARA']));
check('the H specification is not allowed in SFL records or in SFLCTL records associated with SFLMSGRCD',
  has('You cannot use H specifications in subfile (SFL keyword) record formats. H specifications are not allowed in subfile control formats associated with message subfiles (SFLMSGRCD keyword).') &&
  j(hs.notOnRecordTypes) === j(['SFL']) && hs.notOnSflctlWith === 'SFLMSGRCD');
check('HLPBDY: help-specification-level, limits the online help, no parameters, partitions into sublists, indicators valid',
  has('You use this help-specification-level keyword to limit the online help information that is available when online help information is displayed.') && has('This keyword has no parameters.') &&
  has('Specifying the HLPBDY keyword partitions the list into sublists by defining help boundaries.') && has('The H specification that has the HLPBDY keyword is considered to be before the boundary.') &&
  R.HLPBDY.noParameters && R.HLPBDY.partitionsHelpSpecifications && R.HLPBDY.optionIndicators === 'valid');
check('HLPEXCLD: help-specification-level, not shown as extended help, no parameters, indicators valid',
  has('You use this help-specification-level keyword to indicate that the online help information associated with this help specification is not displayed as extended help, but is available as item-specific help.') &&
  R.HLPEXCLD.noParameters && R.HLPEXCLD.optionIndicators === 'valid');
check('HLPEXCLD: allowed only on H specifications that specify HLPPNLGRP',
  has('This keyword is allowed only on help-specifications that specify a HLPPNLGRP keyword.') && j(R.HLPEXCLD.requiresOnHelpSpecification) === j(['HLPPNLGRP']));
check('HLPEXCLD: at least one instance of each HLPPNLGRP parameter must stay unexcluded',
  has('At least one instance of each parameter on the HLPPNLGRP keyword should not have the HLPEXCLD keyword specified.') && R.HLPEXCLD.eachHlppnlgrpParameterNeedsOneNonExcluded === true);
check('HLPBDY and HLPEXCLD: "up to one" of the two per H specification', j(R.HLPBDY.atMostOneOfPerHelpSpecification) === j(['HLPBDY', 'HLPEXCLD']) && j(R.HLPEXCLD.atMostOneOfPerHelpSpecification) === j(['HLPBDY', 'HLPEXCLD']));

console.log('\n=== 2. sweeps ===');
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
THREE.forEach((n) => check(n + ': in KEYWORD-LOOKUP.json at the help-specification level', Array.isArray(lookup[n]) && lookup[n].some((x) => x.level === 'help-specification')));
check('the no-option-indicators table holds HLPARA only (of the three), at the help level',
  THREE.filter((n) => KeywordSpec.noOptionIndicatorsFact(n)).join() === 'HLPARA' && j(KeywordSpec.noOptionIndicatorsFact('HLPARA').levels) === j(['help']));
check('the spec\'s indicator mode agrees with that table for all three', THREE.every((n) => (R[n].optionIndicators === 'notValid') === !!KeywordSpec.noOptionIndicatorsFact(n)));
// HLPBDY's exclusion with HLPDOC has ONE owner: HLPDOC's entry.
check('HLPDOC\'s entry still owns the HLPBDY exclusion (one source of truth)', KeywordSpec.isMutex('HLPDOC', 'HLPBDY') && R.HLPDOC.mutex.indexOf('HLPBDY') !== -1);
check('HLPBDY and HLPEXCLD carry no mutex of their own, and HLPEXCLD has no HLPDOC exclusion', !R.HLPBDY.mutex && !R.HLPEXCLD.mutex && !R.HLPARA.mutex && !KeywordSpec.isMutex('HLPBDY', 'HLPDOC'));
// HLPEXCLD needs HLPPNLGRP; HLPDOC <-> HLPPNLGRP is already the HLPDOC entry, so HLPEXCLD cannot share an H specification with HLPDOC either way.
check('the keywords the H-spec rules name all have entries (HLPRCD / HLPPNLGRP / HLPDOC / HLPBDY / HLPEXCLD / HLPARA)', ['HLPRCD', 'HLPPNLGRP', 'HLPDOC', 'HLPBDY', 'HLPEXCLD', 'HLPARA'].every((n) => !!R[n]));
// The parser puts all three keywords into an H specification's keyword list, so the spec describes what the editor sees.
const sample = [
  '     A          R REC1',
  '     A          H                           HLPARA(*RCD)',
  '     A                                      HLPPNLGRP(R1 PNLA)',
  '     A                                      HLPEXCLD',
  '     A          H                           HLPARA(1 2 3 4)',
  '     A                                      HLPRCD(X)',
  '     A                                      HLPBDY',
].join('\n') + '\n';
const rec = DspfParser.parseDspf(sample).records[0];
const names = rec.helpEntries.map((h) => h.keywords.map((k) => k.name));
check('the parser reads HLPARA, HLPEXCLD and HLPBDY as keywords of the H specification, not of the record', j(names) === j([['HLPARA', 'HLPPNLGRP', 'HLPEXCLD'], ['HLPARA', 'HLPRCD', 'HLPBDY']]) && !rec.keywords.some((k) => THREE.indexOf(k.name) !== -1));
check('every keyword the parser found in an H specification that the slice owns is single-level (help)', THREE.every((n) => j(R[n].levels) === j(['help'])));
// The H-spec option-indicator facts match what the editor offers: HLPARA is the unconditioned row.
check('a conditioned HLPBDY / HLPEXCLD parses its indicator; the spec says that is valid',
  (function () {
    const t = ['     A          R REC1', '     A          H                           HLPARA(*RCD)', '     A                                      HLPPNLGRP(R1 PNLA)', '     A  90                                  HLPEXCLD'].join('\n') + '\n';
    const k = DspfParser.parseDspf(t).records[0].helpEntries[0].keywords.find((x) => x.name === 'HLPEXCLD');
    return k.conditions.length === 1 && R.HLPEXCLD.optionIndicators === 'valid';
  })());

console.log('\n=== 3. accessors ===');
check('helpSpecKeywords returns a copy', (KeywordSpec.helpSpecKeywords().push('X'), KeywordSpec.helpSpecKeywords().length === 3));
check('helpSpecFacts: a deep copy without the prose; null outside the slice', (function () {
  const f = KeywordSpec.helpSpecFacts('HLPARA');
  f.coordinates.withinDisplaySize = false; f.specialValues.push('X');
  return KeywordSpec.helpSpecFacts('HLPARA').coordinates.withinDisplaySize === true && KeywordSpec.helpSpecFacts('HLPARA').specialValues.length === 4 &&
    KeywordSpec.helpSpecFacts('HLPARA').ddsReference === undefined && KeywordSpec.helpSpecFacts('HLPDOC') === null && KeywordSpec.helpSpecFacts('constructor') === null && KeywordSpec.helpSpecFacts(null) === null;
})());
check('helpSpecFacts is case-insensitive and trims', KeywordSpec.helpSpecFacts(' hlpexcld ') !== null);
check('helpSpecificationRules returns a copy', (KeywordSpec.helpSpecificationRules().exactlyOneOf.push('X'), KeywordSpec.helpSpecificationRules().exactlyOneOf.length === 3));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

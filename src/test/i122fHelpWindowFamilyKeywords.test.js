/**
 * i122fHelpWindowFamilyKeywords.test.js
 *
 * Task I-122f - the help and window family from the I-122 coverage inventory:
 * HLPSCHIDX, HLPBDY, HLPDOC, HLPID, IGCCNV, WDWTITLE, WDWBORDER and NOCCSID.
 * Each cell is traced to the keyword's own DDS Reference section
 * (DDS_Keyword_V7r6.txt), quoted through has() so a wording drift in the spec
 * entry or the reference fails here:
 *
 *   HLPSCHIDX  file, HLPSCHIDX([library/]search-index), needs HLPPNLGRP, not with
 *              HLPSHELF, option indicators not valid.
 *   HLPBDY     help specification, no parameters, option indicators valid, at most
 *              one of HLPBDY / HLPEXCLD per H specification, not with HLPDOC.
 *   HLPDOC     file or help specification, not with HLPBDY, HLPPNLGRP or HLPRTN.
 *   HLPID      constant field, HLPID(1-999), unique within the record, no indicators.
 *   IGCCNV     file, IGCCNV(CFnn line-number), no option indicators, 24 x 80 file.
 *   WDWTITLE   record, needs WINDOW on the record, option indicators valid.
 *   WDWBORDER  file or record, (*COLOR)(*DSPATR)(*CHAR), option indicators valid.
 *   NOCCSID    field, no parameters.
 *
 *  L1/L2 writer: guards, parse, flag / parameter round trip, neighbours kept.
 *  L3    display: which panel shows which row, saved state, Conditioning toggle.
 *  L4    commit paths: checkbox, inputs, Conditioning, raw editor.
 *
 * Gaps found while writing it are NOT asserted as correct; they are logged in
 * docs/sda-reference/keywordFixes.md (see the I-122f section).
 *
 * Run with: node src/test/i122fHelpWindowFamilyKeywords.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const RAWREF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const REF = RAWREF.replace(/\f/g, ' ').replace(/\s+/g, ' ').replace(/- /g, '-');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ').replace(/- /g, '-')) !== -1;

// Fixed-column DDS line builder (see i122dSubfileControlFamilyKeywords.test.js).
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
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
const R = (name, fn) => dds({ t: 'R', name, fn });
const H = (fn) => dds({ t: 'H', fn });
const F = (name, use, fn) => dds({ name, len: 10, type: 'A', use, fn });
const C = (text, fn) => dds({ line: 1, col: 2, fn: "'" + text + "'" + (fn ? ' ' + fn : '') });
const parse = (t) => DspfParser.parseDspf(t);
const say = (re, r) => re.test(r || '');
const kwOf = (kws, name) => (kws || []).find((k) => k.name === name);
const names = (kws) => kws.map((k) => k.name);
const KW = (name, parameters, conditions) => ({ name, parameters: parameters || '', conditions: conditions || [], raw: '', sourceLines: [] });
const IND = (n) => [{ indicators: [{ number: n, negated: false }] }];
const T = KeywordSpec.RECORD_TYPES;

console.log('=== spec: what the DDS Reference says about each keyword ===');
{
  check('HLPSCHIDX: file level, format with optional library, option indicators not valid',
    has('HLPSCHIDX([library-name/]search-index-object)') && has('Option indicators are not valid for this keyword.') &&
    T.HLPSCHIDX.levels.join() === 'file' && T.HLPSCHIDX.optionIndicators === 'notValid' &&
    T.HLPSCHIDX.parameters.libraryName.default === '*LIBL' && T.HLPSCHIDX.parameters.searchIndexObject.required === true);
  check('HLPSCHIDX: valid only with HLPPNLGRP in the file, cannot be with HLPSHELF',
    has('HLPSCHIDX is valid only when at least one HLPPNLGRP keyword is specified in the file.') &&
    has('HLPSCHIDX keyword cannot be specified with the HLPSHELF keyword.') &&
    KeywordSpec.fileRequires('HLPSCHIDX').join() === 'HLPPNLGRP' && KeywordSpec.fileExcludes('HLPSCHIDX').join() === 'HLPSHELF');
  check('HLPSCHIDX enables the F11 index search key', T.HLPSCHIDX.enablesIndexSearchKey === 'F11');
  check('HLPBDY: help-specification level, no parameters, option indicators valid, at most one of HLPBDY / HLPEXCLD',
    has('This keyword has no parameters.') && has('Option indicators are valid for this keyword.') &&
    T.HLPBDY.levels.join() === 'help' && T.HLPBDY.noParameters === true && T.HLPBDY.optionIndicators === 'valid' &&
    T.HLPBDY.atMostOneOfPerHelpSpecification.join() === 'HLPBDY,HLPEXCLD');
  check('HLPDOC: not with HLPBDY, HLPPNLGRP or HLPRTN (reference sentence and spec mutex list agree)',
    has('You cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN.') && T.HLPDOC.mutex.join() === 'HLPBDY,HLPPNLGRP,HLPRTN' &&
    KeywordSpec.isMutex('HLPDOC', 'HLPBDY') && KeywordSpec.isMutex('HLPDOC', 'HLPPNLGRP') && KeywordSpec.isMutex('HLPDOC', 'HLPRTN') && !KeywordSpec.isMutex('HLPDOC', 'HLPRCD'));
  check('HLPID: constant field only, parameter required, 1 to 999, unique within the record',
    has('The help-identifier parameter is required and can be only a numeric value from 1 to 999.') &&
    has('The value you specify must be unique within the record you are defining.') &&
    T.HLPID.validOnlyOnConstantField === true && T.HLPID.parameterRequired === true &&
    T.HLPID.identifierRange.min === 1 && T.HLPID.identifierRange.max === 999 && T.HLPID.uniqueWithinRecord === true && T.HLPID.parameterForm === 'HLPID(help-identifier)');
  check('IGCCNV: file level, IGCCNV(CFnn line-number), option indicators not valid, two parameters',
    has('Option indicators are not allowed with this keyword.') && has('IGCCNV(CFnn line-number)') &&
    T.IGCCNV.levels.join() === 'file' && T.IGCCNV.optionIndicators === 'notValid' && T.IGCCNV.parameters.parameterCount === 2 &&
    T.IGCCNV.parameters.commandKey.first === 'CF01' && T.IGCCNV.parameters.commandKey.last === 'CF24' && T.IGCCNV.repeatable === false);
  check('IGCCNV: needs a 24 x 80 file, not over a USRDFN format, avoid CHECK(ME) / CMP / RANGE / VALUES',
    T.IGCCNV.requiresDisplaySize24x80 === true && T.IGCCNV.notDisplayedOverRecordTypes.join() === 'USRDFN' && T.IGCCNV.avoidWith.join() === 'CHECK(ME),CHECK,CMP,RANGE,VALUES');
  check('IGCCNV states no upper limit for the line number (recorded as an open question, not a rule)',
    T.IGCCNV.parameters.lineNumberRule.max === null && T.IGCCNV.openQuestions.length === 3);
  check('WDWTITLE: record level, at least one parameter, needs WINDOW on the record, option indicators valid, repeatable',
    has('At least one parameter must be specified.') && T.WDWTITLE.levels.join() === 'record' && T.WDWTITLE.minParameters === 1 &&
    T.WDWTITLE.optionIndicators === 'valid' && T.WDWTITLE.repeatable === true && KeywordSpec.recordRequires('WDWTITLE').join() === 'WINDOW');
  check('WDWTITLE values: seven colours, six display attributes, three alignments, two positions',
    T.WDWTITLE.parameters.colors.join() === 'BLU,GRN,WHT,RED,TRQ,YLW,PNK' && T.WDWTITLE.parameters.displayAttributes.join() === 'BL,CS,HI,ND,RI,UL' &&
    T.WDWTITLE.parameters.alignments.join() === '*CENTER,*LEFT,*RIGHT' && T.WDWTITLE.parameters.alignmentDefault === '*CENTER' && T.WDWTITLE.parameters.positions.join() === '*TOP,*BOTTOM');
  check('WDWBORDER: display-attribute values are exactly the reference table, the colours are the COLOR values',
    KeywordSpec.displayAttributeValues('WDWBORDER').join() === 'BL,CS,HI,ND,RI,UL' && T.WDWBORDER.colorValuesFrom === 'COLOR' &&
    has('WDWBORDER([color] [display-attribute] [characters])') && has('If the color parameter is not specified, the default is BLU.') && has('There is no default for display-attributes.'));
  check('NOCCSID: field level, no parameters (reference sentence, spec entry and the field-keyword list agree)',
    has('This keyword has no parameters.') && T.NOCCSID.noParameters === true && T.NOCCSID.fieldLevel === true &&
    KeywordSpec.fieldKeywordsWithoutParameters().indexOf('NOCCSID') !== -1 && DspfWriter.takesNoParameters('NOCCSID'));
  check('the accessors agree with the spec: HLPSCHIDX / IGCCNV refuse option indicators, HLPBDY / WDWTITLE accept them, HLPBDY takes no parameters',
    !DspfWriter.optionIndicatorsAllowed('HLPSCHIDX') && !DspfWriter.optionIndicatorsAllowed('IGCCNV') &&
    DspfWriter.optionIndicatorsAllowed('HLPBDY') && DspfWriter.optionIndicatorsAllowed('WDWTITLE') && DspfWriter.takesNoParameters('HLPBDY') && !DspfWriter.takesNoParameters('WDWTITLE'));
  // Not asserted (logged as I-181): HLPDOC, HLPID, WDWBORDER and NOCCSID carry no `levels` / `optionIndicators`
  // fact in their spec entries, so optionIndicatorsAllowed answers false for WDWBORDER and HLPDOC although their
  // reference sections say "Option indicators are valid for this keyword" (the panels hard-code the toggle instead).
}

console.log('\n=== L1/L2 HLPSCHIDX: file-level requirements, parse, round trip ===');
{
  const g = (a, b) => DspfWriter.fileHelpNewConflictReason(parse(a), parse(b));
  const body = [R('R1'), F('F1', 'B')];
  const none = src(K('DSPSIZ(24 80 *DS3)'), ...body);
  const withIdx = src(K('HLPSCHIDX(LIB/IDX)'), ...body);
  const ok = src(K('HLPPNLGRP(P1 LIB/PNL)'), K('HLPSCHIDX(LIB/IDX)'), ...body);
  const m = parse(ok);
  check('parses: HLPSCHIDX keeps its library/index text at the file level', kwOf(m.fileKeywords, 'HLPSCHIDX').parameters === 'LIB/IDX' && names(m.fileKeywords).join() === 'HLPPNLGRP,HLPSCHIDX');
  check('adding HLPSCHIDX with no HLPPNLGRP is refused, naming both', say(/HLPSCHIDX.*HLPPNLGRP/, g(none, withIdx)));
  check('adding HLPSCHIDX beside HLPPNLGRP is accepted', g(none, ok) === null);
  check('adding HLPSHELF beside HLPSCHIDX is refused (the exclusion, either direction)', say(/HLPSCHIDX cannot be specified with the HLPSHELF/, g(ok, src(K('HLPPNLGRP(P1 LIB/PNL)'), K('HLPSCHIDX(LIB/IDX)'), K('HLPSHELF'), ...body))));
  check('...and adding HLPSCHIDX to a file that has HLPSHELF is refused too', say(/HLPSHELF/, g(src(K('HLPPNLGRP(P1 LIB/PNL)'), K('HLPSHELF'), ...body), src(K('HLPPNLGRP(P1 LIB/PNL)'), K('HLPSHELF'), K('HLPSCHIDX(LIB/IDX)'), ...body))));
  check('removing HLPPNLGRP while HLPSCHIDX stays is refused (the other direction)', say(/valid only when at least one HLPPNLGRP/, g(ok, withIdx)));
  check('removing HLPSCHIDX is never blocked', g(ok, src(K('HLPPNLGRP(P1 LIB/PNL)'), ...body)) === null);
  check('an already-invalid HLPSCHIDX with no HLPPNLGRP is not re-reported by an unchanged edit', g(withIdx, withIdx) === null);
  const set = DspfWriter.setFileFlagKeyword([KW('DSPSIZ', '24 80 *DS3')], 'HLPSCHIDX', true, 'LIB/IDX');
  check('setFileFlagKeyword writes HLPSCHIDX(LIB/IDX) beside a neighbour and reads it back',
    names(set).join() === 'DSPSIZ,HLPSCHIDX' && DspfWriter.getFileFlagKeyword(set, 'HLPSCHIDX').present && DspfWriter.getFileFlagKeyword(set, 'HLPSCHIDX').parameters === 'LIB/IDX');
  check('the library is optional: a bare search-index name round-trips', DspfWriter.getFileFlagKeyword(DspfWriter.setFileFlagKeyword([], 'HLPSCHIDX', true, 'IDX'), 'HLPSCHIDX').parameters === 'IDX');
  check('off removes only HLPSCHIDX', names(DspfWriter.setFileFlagKeyword(set, 'HLPSCHIDX', false, '')).join() === 'DSPSIZ');
}

console.log('\n=== L1/L2 HLPBDY: one per H specification, not with HLPEXCLD or HLPDOC ===');
{
  const plain = src(R('R1'), F('F1', 'B'));
  const hs = (...more) => src(R('R1'), H('HLPARA(*NONE)'), ...more.map(K), F('F1', 'B'));
  const g = (b) => DspfWriter.helpSpecNewConflictReason(parse(plain), parse(b));
  const m = parse(hs('HLPRCD(H1)', 'HLPBDY'));
  check('parses: HLPBDY is a keyword of the H specification, not of the record or the file',
    names(m.records[0].helpEntries[0].keywords).join() === 'HLPARA,HLPRCD,HLPBDY' && !kwOf(m.records[0].keywords, 'HLPBDY') && !kwOf(m.fileKeywords, 'HLPBDY'));
  check('HLPBDY with HLPRCD on one H specification is accepted', g(hs('HLPRCD(H1)', 'HLPBDY')) === null);
  check('HLPBDY with HLPPNLGRP is accepted', g(hs('HLPPNLGRP(P1 LIB/PNL)', 'HLPBDY')) === null);
  check('HLPBDY together with HLPEXCLD is refused (only one of them)', say(/only one of HLPBDY and HLPEXCLD/, g(hs('HLPPNLGRP(P1 LIB/PNL)', 'HLPBDY', 'HLPEXCLD'))));
  check('HLPEXCLD alone (with HLPPNLGRP) is accepted', g(hs('HLPPNLGRP(P1 LIB/PNL)', 'HLPEXCLD')) === null);
  check('two H specifications may each carry one HLPBDY', DspfWriter.helpSpecNewConflictReason(parse(plain), parse(src(R('R1'), H('HLPARA(*NONE)'), K('HLPRCD(H1)'), K('HLPBDY'), H('HLPARA(*NONE)'), K('HLPRCD(H2)'), K('HLPBDY'), F('F1', 'B')))) === null);
  check('an already-invalid HLPBDY + HLPEXCLD pair is not re-reported by an unchanged edit', (() => { const bad = parse(hs('HLPPNLGRP(P1 LIB/PNL)', 'HLPBDY', 'HLPEXCLD')); return DspfWriter.helpSpecNewConflictReason(bad, bad) === null; })());
  const docH = [KW('HLPDOC', 'A B C')];
  check('HLPBDY beside HLPDOC on one H specification is refused (the HLPDOC exclusion)', say(/HLPBDY cannot be specified on the same help specification as HLPDOC/, DspfWriter.hlpdocHspecConflictReason('HLPBDY', docH, parse(hs('HLPDOC(A B C)')), null)));
  const set = DspfWriter.setFileFlagKeyword([KW('HLPRCD', 'H1')], 'HLPBDY', true, '');
  check('setFileFlagKeyword writes a bare HLPBDY beside HLPRCD, unconditioned', names(set).join() === 'HLPRCD,HLPBDY' && kwOf(set, 'HLPBDY').parameters.trim() === '' && kwOf(set, 'HLPBDY').conditions.length === 0);
  const cond = DspfWriter.setFileFlagKeyword(set, 'HLPBDY', true, '', undefined, IND('12'));
  check('option indicators are valid for HLPBDY: the indicator is written and kept on a repeat', JSON.stringify(kwOf(cond, 'HLPBDY').conditions) === JSON.stringify(IND('12')) &&
    JSON.stringify(kwOf(DspfWriter.setFileFlagKeyword(cond, 'HLPBDY', true, ''), 'HLPBDY').conditions) === JSON.stringify(IND('12')));
  check('off removes only HLPBDY', names(DspfWriter.setFileFlagKeyword(cond, 'HLPBDY', false, '')).join() === 'HLPRCD');
}

console.log('\n=== L1/L2 HLPDOC: not with HLPPNLGRP / HLPRTN (file level, both directions) ===');
{
  const c = DspfWriter.hlpdocConflictReason;
  const pn = [KW('HLPPNLGRP', 'P1 LIB/PNL')];
  check('HLPDOC with HLPPNLGRP in the file is refused', say(/HLPDOC cannot be specified in the same file as HLPPNLGRP/, c('HLPDOC', pn)));
  check('HLPDOC with HLPRTN in the file is refused', say(/HLPDOC cannot be specified in the same file as HLPRTN/, c('HLPDOC', [KW('HLPRTN')])));
  check('HLPPNLGRP with HLPDOC already there is refused (reverse)', say(/HLPPNLGRP cannot be specified in the same file as HLPDOC/, c('HLPPNLGRP', [KW('HLPDOC', 'A B C')])));
  check('HLPRTN with HLPDOC already there is refused (reverse)', say(/HLPRTN cannot be specified in the same file as HLPDOC/, c('HLPRTN', [KW('HLPDOC', 'A B C')])));
  check('HLPDOC with HLPRCD (not in its list) or an empty file is accepted', !c('HLPDOC', [KW('HLPRCD', 'H1')]) && !c('HLPDOC', []));
  check('only HLPDOC, HLPPNLGRP and HLPRTN are judged by this check (HLPBDY is the H-specification check\'s)', c('HLPBDY', [KW('HLPDOC', 'A B C')]) === '' || c('HLPBDY', [KW('HLPDOC', 'A B C')]) === null);
  const kws = DspfWriter.setFileFlagKeyword([], 'HLPDOC', true, 'LBL DOC FLD');
  check('HLPDOC round trip: three parameters kept as typed', DspfWriter.getFileFlagKeyword(kws, 'HLPDOC').parameters === 'LBL DOC FLD');
  check('HLPDOC accepts option indicators (conditions written)', JSON.stringify(kwOf(DspfWriter.setFileFlagKeyword([], 'HLPDOC', true, 'LBL DOC FLD', undefined, IND('33')), 'HLPDOC').conditions) === JSON.stringify(IND('33')));
  check('anyHelpKeywordPresentInFile sees an H-specification HLPDOC and the file-level one',
    DspfWriter.anyHelpKeywordPresentInFile(parse(src(R('R1'), H('HLPARA(*NONE)'), K('HLPDOC(A B C)'), F('F1', 'B'))), 'HLPDOC', null) === true &&
    DspfWriter.anyHelpKeywordPresentInFile(parse(src(K('HLPDOC(A B C)'), R('R1'), F('F1', 'B'))), 'HLPDOC', null) === true &&
    DspfWriter.anyHelpKeywordPresentInFile(parse(src(R('R1'), F('F1', 'B'))), 'HLPDOC', null) === false);
}

console.log('\n=== L1/L2 HLPID: constant field only, 1 to 999, unique within the record ===');
{
  const g = (a, b) => DspfWriter.referenceFieldNewConflictReason(parse(a), parse(b));
  const rf = (id1, id2) => src(R('R1'), F('F1', 'B'), C('T1', id1 === null ? '' : id1), C('T2', id2 === null ? '' : id2));
  const base = rf(null, null);
  const id = (n) => 'HLPID(' + n + ')';
  check('HLPID(1) and HLPID(999), the two ends of the range, are accepted', g(base, rf(id(1), null)) === null && g(base, rf(id(999), null)) === null);
  check('HLPID(0) is refused (below 1)', say(/HLPID\(0\) is not a valid help identifier.*1 to 999/, g(base, rf(id(0), null))));
  check('HLPID(1000) is refused (above 999)', say(/HLPID\(1000\) is not a valid help identifier/, g(base, rf(id(1000), null))));
  check('a non-numeric or negative identifier is refused', say(/HLPID\(abc\)/, g(base, rf(id('abc'), null))) && say(/HLPID\(-3\)/, g(base, rf(id('-3'), null))));
  check('a bare HLPID is refused: the parameter is required', say(/HLPID needs a help-identifier parameter/, g(base, rf('HLPID', null))));
  check('the same identifier on two constants of one record is refused, naming the record', say(/HLPID\(5\) is already used by another constant field in record format R1/, g(base, rf(id(5), id(5)))));
  check('two different identifiers on two constants are accepted', g(base, rf(id(5), id(6))) === null);
  const twoRecs = src(R('R1'), F('F1', 'B'), C('T1', id(5)), R('R2'), F('F2', 'B'), C('T2', id(5)));
  check('the same identifier in two different records is accepted (unique within the record only)', g(src(R('R1'), F('F1', 'B'), C('T1', id(5)), R('R2'), F('F2', 'B'), C('T2')), twoRecs) === null);
  check('HLPID on a named field is refused: it is a constant field keyword', say(/HLPID cannot be specified on field F1: it is a constant field keyword/, g(base, src(R('R1'), F('F1', 'B', id(3))))));
  const bad = rf(id(0), null);
  check('an already-invalid HLPID(0) is not re-reported by an unchanged edit', g(bad, bad) === null);
  check('fixing HLPID(0) to a valid number is never blocked', g(bad, rf(id(8), null)) === null);
  const m = parse(rf(id(7), null));
  const cf = m.records[0].fields.find((f) => kwOf(f.keywords, 'HLPID'));
  check('parses: HLPID is on the constant field, with its number', !!cf && cf.nameType === 'CONSTANT' && kwOf(cf.keywords, 'HLPID').parameters === '7');
  check('setFileFlagKeyword writes HLPID(12) beside another field keyword and removes it again',
    (() => { const s = DspfWriter.setFileFlagKeyword([KW('COLOR', 'RED')], 'HLPID', true, '12'); return names(s).join() === 'COLOR,HLPID' && kwOf(s, 'HLPID').parameters === '12' && names(DspfWriter.setFileFlagKeyword(s, 'HLPID', false, '')).join() === 'COLOR'; })());
}

console.log('\n=== L1/L2 IGCCNV: CFnn and line number, a free key, a 24 x 80 file ===');
{
  const body = [R('R1'), F('F1', 'B')];
  const size = K('DSPSIZ(24 80 *DS3)');
  const base = src(size, ...body);
  const g = (x, extra, sz) => DspfWriter.fileLevelDisplayNewConflictReason(parse(base), parse(src(sz || size, K('IGCCNV(' + x + ')'), ...(extra || []), ...body)));
  check('IGCCNV(CF05 24) is accepted', g('CF05 24') === null);
  check('the lowest and highest key, CF01 and CF24, are accepted', g('CF01 1') === null && g('CF24 1') === null);
  check('a one-parameter or three-parameter form is refused (it takes exactly two)', say(/IGCCNV takes 2 parameters.*has 1/, g('CF05')) && say(/IGCCNV takes 2 parameters.*has 3/, g('CF05 24 3')));
  check('CA05, CF00 and CF25 are refused as the first parameter (CF01 through CF24 only)', ['CA05 24', 'CF00 24', 'CF25 24'].every((x) => say(/first parameter must be a command function key, CF01 through CF24/, g(x))));
  check('a line number of 0 or a non-number is refused, 1 or more is accepted', say(/second parameter must be a display line number/, g('CF05 0')) && say(/second parameter must be a display line number/, g('CF05 x')) && g('CF05 1') === null);
  check('no upper limit is enforced for the line (the reference states none): line 99 is accepted, as the spec records', g('CF05 99') === null);
  check('a key another keyword already assigns (CF05 on the file) is refused', say(/IGCCNV cannot use CF05: it is already assigned/, g('CF05 24', [K('CF05')])));
  check('a different key beside CF05 is accepted', g('CF06 24', [K('CF05')]) === null);
  check('a file defined only for 27 x 132 is refused', say(/requires the file to be defined for a 24 x 80 display/, g('CF05 24', [], K('DSPSIZ(27 132 *DS4)'))));
  check('a file with both sizes is accepted (it is still defined for 24 x 80)', g('CF05 24', [], K('DSPSIZ(24 80 *DS3 27 132 *DS4)')) === null);
  const bad = parse(src(size, K('IGCCNV(CF99 24)'), ...body));
  check('an already-invalid IGCCNV(CF99 24) is not re-reported by an unchanged edit', DspfWriter.fileLevelDisplayNewConflictReason(bad, bad) === null);
  const set = DspfWriter.setFileFlagKeyword([KW('DSPSIZ', '24 80 *DS3')], 'IGCCNV', true, 'CF05 24');
  check('setFileFlagKeyword writes IGCCNV(CF05 24) and reads both parameters back', names(set).join() === 'DSPSIZ,IGCCNV' && DspfWriter.getFileFlagKeyword(set, 'IGCCNV').parameters === 'CF05 24');
  check('off removes only IGCCNV', names(DspfWriter.setFileFlagKeyword(set, 'IGCCNV', false, '')).join() === 'DSPSIZ');
  check('IGCCNV is not repeatable: the second copy is written in place, not appended', DspfWriter.setFileFlagKeyword(set, 'IGCCNV', true, 'CF06 3').filter((k) => k.name === 'IGCCNV').length === 1);
  check('IGCCNV is on the list of keywords that take no option indicators', DspfWriter.optionIndicatorsAllowed('IGCCNV') === false);
}

console.log('\n=== L1/L2 WDWTITLE: needs WINDOW on the record, text round trip ===');
{
  const plain = src(R('R1'), F('F1', 'B'));
  const g = (b) => DspfWriter.windowHelpMenuNewConflictReason(parse(plain), parse(b));
  const title = "WDWTITLE((*TEXT 'Hi'))";
  check('WDWTITLE on a record with no WINDOW is refused, naming the record', say(/WDWTITLE cannot be specified on record format R1 without a WINDOW keyword/, g(src(R('R1', title), F('F1', 'B')))));
  check('WDWTITLE beside WINDOW is accepted', g(src(R('R1', 'WINDOW(5 5 10 40)'), K(title), F('F1', 'B'))) === null);
  check('WDWTITLE beside a reference-form WINDOW(R0) is accepted too (the reference says a warning, not an error)', g(src(R('R0', 'WINDOW(5 5 10 40)'), R('R1', 'WINDOW(R0)'), K(title), F('F1', 'B'))) === null);
  const withBoth = src(R('R1', 'WINDOW(5 5 10 40)'), K(title), F('F1', 'B'));
  check('removing WINDOW while WDWTITLE stays is refused (the other direction)', say(/WDWTITLE cannot be specified on record format R1 without a WINDOW/, DspfWriter.windowHelpMenuNewConflictReason(parse(withBoth), parse(src(R('R1'), K(title), F('F1', 'B'))))));
  check('removing WDWTITLE is never blocked', DspfWriter.windowHelpMenuNewConflictReason(parse(withBoth), parse(src(R('R1', 'WINDOW(5 5 10 40)'), F('F1', 'B')))) === null);
  const bad = parse(src(R('R1', title), F('F1', 'B')));
  check('an already-invalid WDWTITLE with no WINDOW is not re-reported by an unchanged edit', DspfWriter.windowHelpMenuNewConflictReason(bad, bad) === null);
  const kws = [KW('WINDOW', '5 5 10 40')];
  const s1 = DspfWriter.setWindowTitleText(kws, 'Hello');
  check('setWindowTitleText adds WDWTITLE(\'Hello\') after WINDOW and getWindowTitleText reads it back', names(s1).join() === 'WINDOW,WDWTITLE' && kwOf(s1, 'WDWTITLE').parameters === "'Hello'" && DspfWriter.getWindowTitleText(s1) === 'Hello');
  check('an apostrophe in the text is doubled when written and undone when read', kwOf(DspfWriter.setWindowTitleText(kws, "It's"), 'WDWTITLE').parameters === "'It''s'" && DspfWriter.getWindowTitleText(DspfWriter.setWindowTitleText(kws, "It's")) === "It's");
  check('blank text removes WDWTITLE and leaves WINDOW', names(DspfWriter.setWindowTitleText(s1, '   ')).join() === 'WINDOW');
  const rich = [KW('WINDOW', '5 5 10 40'), KW('WDWTITLE', "(*TEXT 'Hi') (*COLOR RED) *LEFT", IND('10'))];
  const upd = DspfWriter.setWindowTitleText(rich, 'Yo');
  check('changing the text keeps the colour, the alignment and the option indicator', kwOf(upd, 'WDWTITLE').parameters === "(*TEXT 'Yo') (*COLOR RED) *LEFT" && JSON.stringify(kwOf(upd, 'WDWTITLE').conditions) === JSON.stringify(IND('10')));
  check('getWindowTitleText reads the text out of the (*TEXT ...) form', DspfWriter.getWindowTitleText(rich) === 'Hi');
}

console.log('\n=== L1/L2 WDWBORDER: colour, display attributes and characters ===');
{
  const full = { colorEnabled: true, color: 'RED', attrsEnabled: true, attrs: ['HI', 'UL'], charsEnabled: true, chars: ['.', ':', '.', ':', '|', '|', '-', '-'] };
  const set = DspfWriter.setWdwBorder([KW('WINDOW', '5 5 10 40')], full);
  check('all three groups are written in the reference order: (*COLOR) (*DSPATR) (*CHAR)', kwOf(set, 'WDWBORDER').parameters === "(*COLOR RED) (*DSPATR HI UL) (*CHAR '.' ':' '.' ':' '|' '|' '-' '-')" && names(set).join() === 'WINDOW,WDWBORDER');
  const back = DspfWriter.getWdwBorder(set);
  check('getWdwBorder reads colour, attributes and the eight characters back', back.color === 'RED' && back.attrs.join() === 'HI,UL' && back.chars.join('') === '.:.:||--');
  const colorOnly = DspfWriter.setWdwBorder([], { colorEnabled: true, color: 'GRN' });
  check('colour alone is written alone; attributes and characters read back empty', kwOf(colorOnly, 'WDWBORDER').parameters === '(*COLOR GRN)' && DspfWriter.getWdwBorder(colorOnly).attrs.length === 0 && DspfWriter.getWdwBorder(colorOnly).chars.every((c) => c === ''));
  const attrsOnly = DspfWriter.setWdwBorder([], { attrsEnabled: true, attrs: ['RI'] });
  check('attributes alone are written alone', kwOf(attrsOnly, 'WDWBORDER').parameters === '(*DSPATR RI)');
  check('an enabled group with nothing chosen is dropped; with no group left WDWBORDER is removed', DspfWriter.setWdwBorder(set, { colorEnabled: false, attrsEnabled: false, charsEnabled: false }).length === 1 && !kwOf(DspfWriter.setWdwBorder(set, { colorEnabled: true, color: '' }), 'WDWBORDER'));
  const cond = DspfWriter.setWdwBorder([], { colorEnabled: true, color: 'RED' }, IND('12'));
  check('option indicators are written when given', JSON.stringify(kwOf(cond, 'WDWBORDER').conditions) === JSON.stringify(IND('12')));
  check('...and kept when the next call omits them (the setFileFlagKeyword convention)', JSON.stringify(kwOf(DspfWriter.setWdwBorder(cond, { colorEnabled: true, color: 'GRN' }), 'WDWBORDER').conditions) === JSON.stringify(IND('12')));
  check('...and replaced when the next call gives new ones', JSON.stringify(kwOf(DspfWriter.setWdwBorder(cond, { colorEnabled: true, color: 'GRN' }, IND('44')), 'WDWBORDER').conditions) === JSON.stringify(IND('44')));
  const one = DspfWriter.getWdwBorder([KW('WDWBORDER', "(*CHAR '.:.:||--')")]);
  check('a real-DDS single quoted *CHAR string is split positionally into the eight characters', one.chars.join('') === '.:.:||--');
  check('every colour and every display attribute the spec lists survives a round trip',
    ['BLU', 'GRN', 'WHT', 'RED', 'TRQ', 'YLW', 'PNK'].every((c) => DspfWriter.getWdwBorder(DspfWriter.setWdwBorder([], { colorEnabled: true, color: c })).color === c) &&
    KeywordSpec.displayAttributeValues('WDWBORDER').every((a) => DspfWriter.getWdwBorder(DspfWriter.setWdwBorder([], { attrsEnabled: true, attrs: [a] })).attrs.join() === a));
  const m = parse(src(K("WDWBORDER((*COLOR RED) (*DSPATR HI))"), R('R1'), F('F1', 'B')));
  check('parses at the file level and at the record level', kwOf(m.fileKeywords, 'WDWBORDER').parameters === '(*COLOR RED) (*DSPATR HI)' && !!kwOf(parse(src(R('R1', 'WINDOW(5 5 10 40)'), K('WDWBORDER((*COLOR BLU))'), F('F1', 'B'))).records[0].keywords, 'WDWBORDER'));
}

// Not asserted (logged as I-182): record-level WDWBORDER with no WINDOW / PULLDOWN, a bare WDWBORDER / WDWTITLE, and
// colour / display-attribute values outside the reference lists are all accepted by the raw keyword editor.
console.log('\n=== L1/L2 NOCCSID: a field keyword with no parameters ===');
{
  const nc = (fn) => src(R('R1'), F('F1', 'B', fn), C('T', ''));
  const g = (a, b) => DspfWriter.systemValueKeywordNewConflictReason(parse(a), parse(b));
  check('NOCCSID on a named field is accepted', g(nc(''), nc('NOCCSID')) === null);
  check('NOCCSID(1) is refused: it has no parameters', say(/NOCCSID has no parameters - NOCCSID\(1\) is not valid/, g(nc(''), nc('NOCCSID(1)'))));
  check('NOCCSID is not one of the system-value constants: it is accepted on a named field and a constant alike', g(src(R('R1'), C('T', '')), src(R('R1'), C('T', 'NOCCSID'))) === null);
  const bad = nc('NOCCSID(1)');
  check('an already-invalid NOCCSID(1) is not re-reported by an unchanged edit', g(bad, bad) === null);
  const m = parse(nc('NOCCSID'));
  check('parses: NOCCSID is a bare keyword of the field', kwOf(m.records[0].fields.find((f) => f.name === 'F1').keywords, 'NOCCSID').parameters.trim() === '');
  const s = DspfWriter.setFileFlagKeyword([KW('COLOR', 'RED')], 'NOCCSID', true);
  check('setFileFlagKeyword writes a bare NOCCSID beside COLOR and removes it again', names(s).join() === 'COLOR,NOCCSID' && s[1].parameters.trim() === '' && names(DspfWriter.setFileFlagKeyword(s, 'NOCCSID', false)).join() === 'COLOR');
  check('NOCCSID is one of the keywords allowed beside PSHBTNFLD, while COLOR is not', DspfWriter.pshbtnfldConflictReason('PSHBTNFLD', '', [KW('NOCCSID')]) === null && say(/PSHBTNFLD cannot be specified on a field that also carries COLOR/, DspfWriter.pshbtnfldConflictReason('PSHBTNFLD', '', [KW('COLOR', 'RED')])));
}

console.log('\n=== L3/L4 the panels (jsdom) ===');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mount(source) {
  const posted = [];
  const alerts = [];
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', source, 'MYSCR.DSPF'), {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (t) => { alerts.push(String(t)); };
    },
  });
  await sleep(300);
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const api = {
    doc, posted, alerts, fire,
    el: (id) => doc.getElementById(id),
    has: (id) => !!doc.getElementById(id),
    lastText: () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; },
    reset: () => { posted.length = 0; alerts.length = 0; },
    selectRecord: (name) => { const s = doc.getElementById('recordSelect'); s.value = name; fire(s); },
    openFile: () => fire(doc.getElementById('crumb-file'), 'click'),
    condToggle: (flagId) => doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]'),
    fieldBox: (idx) => doc.querySelectorAll('#screenOutput .dspf-field')[idx],
    toggle: (id, on) => { const e = doc.getElementById(id); api.reset(); e.checked = on; fire(e); return api.lastText(); },
    setValue: (id, v) => { const e = doc.getElementById(id); api.reset(); e.value = v; fire(e); return api.lastText(); },
  };
  api.parsed = (t) => (t ? parse(t) : null);
  api.recFrom = (t, name) => (t ? parse(t).records.find((r) => r.name === name) : null);
  return api;
}

const PANELS = src(
  K('DSPSIZ(24 80 *DS3)'), K('HLPPNLGRP(P1 LIB/PNL)'), K('HLPSCHIDX(LIB/IDX)'), K('IGCCNV(CF05 24)'), K('WDWBORDER((*COLOR RED))'),
  R('R1'), dds({ name: 'F1', len: 10, type: 'A', use: 'B', line: 3, col: 5, fn: 'NOCCSID' }),
  dds({ line: 1, col: 2, fn: "'Title' HLPID(7)" }), dds({ line: 2, col: 2, fn: "'Other' HLPID(8)" }),
  R('W1', 'WINDOW(5 5 10 40)'), K("WDWTITLE((*TEXT 'Hi') (*COLOR RED))"), K('WDWBORDER((*COLOR GRN))'), dds({ line: 2, col: 2, fn: "'In window'" }));
const NOPNL = src(K('DSPSIZ(24 80 *DS3)'), R('R1'), dds({ name: 'F1', len: 10, type: 'A', use: 'B', line: 3, col: 5 }));

(async () => {
  const d = await mount(PANELS);
  const fileKw = (t, n) => (t ? kwOf(parse(t).fileKeywords, n) : null);

  console.log('  -- file properties: HLPSCHIDX (Help tab)');
  d.openFile();
  check('the Help tab shows the HLPSCHIDX row, checked, with library LIB and search index IDX', d.has('fk-hlpschidx-on') && d.el('fk-hlpschidx-on').checked && d.el('fk-hlpschidx-library').value === 'LIB' && d.el('fk-hlpschidx-searchindex').value === 'IDX');
  check('HLPSCHIDX has no Conditioning toggle (option indicators not valid); HLPDOC has one (valid)', !d.condToggle('fk-hlpschidx') && !!d.condToggle('fk-hlpdoc'));
  {
    const t = d.setValue('fk-hlpschidx-searchindex', 'IDX2');
    check('changing the search index writes HLPSCHIDX(LIB/IDX2) and keeps HLPPNLGRP', !!t && fileKw(t, 'HLPSCHIDX').parameters === 'LIB/IDX2' && !!fileKw(t, 'HLPPNLGRP'));
    d.openFile();
    const t2 = d.setValue('fk-hlpschidx-library', '');
    check('clearing the library writes the bare index: HLPSCHIDX(IDX2)', !!t2 && fileKw(t2, 'HLPSCHIDX').parameters === 'IDX2');
    d.openFile();
    const t3 = d.toggle('fk-hlpschidx-on', false);
    check('HLPSCHIDX off removes it and leaves HLPPNLGRP', !!t3 && !fileKw(t3, 'HLPSCHIDX') && !!fileKw(t3, 'HLPPNLGRP'));
  }
  {
    const p = await mount(PANELS);
    p.openFile();
    const t = p.toggle('fk-hlppnlgrp-on', false);
    check('turning HLPPNLGRP off while HLPSCHIDX is on is refused: no edit posted, message names HLPSCHIDX and HLPPNLGRP',
      t === null && p.alerts.some((a) => /HLPSCHIDX/.test(a) && /HLPPNLGRP/.test(a)));
  }
  {
    const n = await mount(NOPNL);
    n.openFile();
    n.el('fk-hlpschidx-library').value = 'LIB';
    n.el('fk-hlpschidx-searchindex').value = 'IDX';
    const t = n.toggle('fk-hlpschidx-on', true);
    check('HLPSCHIDX on in a file with no HLPPNLGRP is refused: no edit posted, message names HLPPNLGRP', t === null && n.alerts.some((a) => /HLPSCHIDX/.test(a) && /HLPPNLGRP/.test(a)));
  }

  console.log('  -- file properties: HLPDOC against HLPPNLGRP (Help tab)');
  {
    const d2 = await mount(PANELS);
    d2.openFile();
    d2.el('fk-hlpdoc-label').value = 'LBL';
    d2.el('fk-hlpdoc-document').value = 'DOC';
    d2.el('fk-hlpdoc-folder').value = 'FLD';
    const t = d2.toggle('fk-hlpdoc-on', true);
    check('HLPDOC on in a file that has HLPPNLGRP is refused: no edit posted, message names both', t === null && d2.alerts.some((a) => /HLPDOC/.test(a) && /HLPPNLGRP/.test(a)));
  }

  console.log('  -- file properties: IGCCNV (DBCS tab)');
  {
    const g = await mount(PANELS);
    g.openFile();
    check('the DBCS tab shows IGCCNV checked with key CF05 and line 24, and no Conditioning toggle (not allowed)', g.el('fk-igccnv-on').checked && g.el('fk-igccnv-key').value === 'CF05' && g.el('fk-igccnv-line').value === '24' && !g.condToggle('fk-igccnv'));
    check('the key box names the CF range as its placeholder', g.el('fk-igccnv-key').getAttribute('placeholder') === 'CF01-CF24');
    const t = g.setValue('fk-igccnv-line', '10');
    check('changing the line writes IGCCNV(CF05 10) and nothing else changes', !!t && fileKw(t, 'IGCCNV').parameters === 'CF05 10' && !!fileKw(t, 'HLPSCHIDX') && !!fileKw(t, 'WDWBORDER'));
    g.openFile();
    const t2 = g.setValue('fk-igccnv-key', 'CF25');
    check('a key outside CF01-CF24 is refused: no edit posted, message names IGCCNV and the range', t2 === null && g.alerts.some((a) => /IGCCNV/.test(a) && /CF01 through CF24/.test(a)));
    g.openFile();
    const t3 = g.setValue('fk-igccnv-key', 'CA05');
    check('a CA key is refused too', t3 === null && g.alerts.some((a) => /IGCCNV/.test(a)));
    g.openFile();
    const t4 = g.toggle('fk-igccnv-on', false);
    check('IGCCNV off removes it', !!t4 && !fileKw(t4, 'IGCCNV') && !!fileKw(t4, 'HLPSCHIDX'));
  }

  console.log('  -- file properties: WDWBORDER (Window border tab)');
  {
    const w = await mount(PANELS);
    w.openFile();
    check('saved state: colour on and RED, display attributes off, characters off', w.el('fk-wdw-color-on').checked && w.el('fk-wdw-color').value === 'RED' && !w.el('fk-wdw-attrs-on').checked && !w.el('fk-wdw-chars-on').checked);
    check('the six display attributes are offered, none ticked', Array.from(w.doc.querySelectorAll('.fk-wdw-attr')).map((e) => e.value).sort().join() === 'BL,CS,HI,ND,RI,UL' && !w.doc.querySelector('.fk-wdw-attr:checked'));
    check('a Conditioning toggle is present (option indicators are valid for WDWBORDER)', !!w.condToggle('fk-wdw'));
    w.el('fk-wdw-color').value = 'GRN';
    w.el('fk-wdw-attrs-on').checked = true;
    Array.from(w.doc.querySelectorAll('.fk-wdw-attr')).filter((e) => e.value === 'HI' || e.value === 'UL').forEach((e) => { e.checked = true; });
    w.reset();
    w.fire(w.el('fk-wdw-apply'), 'click');
    const t = w.lastText();
    check('Apply writes (*COLOR GRN) (*DSPATR HI UL) at the file level', !!t && fileKw(t, 'WDWBORDER').parameters === '(*COLOR GRN) (*DSPATR HI UL)');
    w.openFile();
    w.el('fk-wdw-color-on').checked = false;
    w.el('fk-wdw-attrs-on').checked = false;
    w.reset();
    w.fire(w.el('fk-wdw-apply'), 'click');
    const t2 = w.lastText();
    check('with every group off, Apply removes WDWBORDER', !!t2 && !fileKw(t2, 'WDWBORDER'));
  }
  {
    const w = await mount(PANELS);
    w.openFile();
    w.el('fk-wdw-chars-on').checked = true;
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => { w.el('fk-wdw-char-' + i).value = '.:.:||--'[i]; });
    w.reset();
    w.fire(w.el('fk-wdw-apply'), 'click');
    const t3 = w.lastText();
    check('eight border characters are written as eight quoted characters beside the colour', !!t3 && fileKw(t3, 'WDWBORDER').parameters === "(*COLOR RED) (*CHAR '.' ':' '.' ':' '|' '|' '-' '-')");
  }

  console.log('  -- record W1: window title, record-level border, raw editor');
  {
    const r = await mount(PANELS);
    r.selectRecord('W1');
    check('the Basic tab shows the window title text Hi', r.has('p-window-title') && r.el('p-window-title').value === 'Hi');
    r.reset();
    r.el('p-window-title').value = 'New title';
    r.fire(r.el('p-window-title-save'), 'click');
    const t = r.lastText();
    const k = t ? kwOf(r.recFrom(t, 'W1').keywords, 'WDWTITLE') : null;
    check('Save rewrites the text and keeps the colour on WDWTITLE', !!k && k.parameters === "(*TEXT 'New title') (*COLOR RED)" && !!kwOf(r.recFrom(t, 'W1').keywords, 'WINDOW'));
    r.selectRecord('W1');
    r.reset();
    r.el('p-window-title').value = '';
    r.fire(r.el('p-window-title-save'), 'click');
    const t2 = r.lastText();
    check('saving a blank title removes WDWTITLE and leaves WINDOW', !!t2 && !kwOf(r.recFrom(t2, 'W1').keywords, 'WDWTITLE') && !!kwOf(r.recFrom(t2, 'W1').keywords, 'WINDOW'));
    r.selectRecord('R1');
    check('a record with no WINDOW has no window title box', !r.has('p-window-title'));
    const owner = 'record-R1';
    r.doc.getElementById(owner + '-new-kw-name').value = 'WDWTITLE';
    r.doc.getElementById(owner + '-new-kw-params').value = "(*TEXT 'x')";
    r.reset();
    r.fire(r.doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
    check('raw-adding WDWTITLE to R1 (no WINDOW) is refused: no edit posted, message names WDWTITLE and WINDOW', r.lastText() === null && r.alerts.some((a) => /WDWTITLE/.test(a) && /WINDOW/.test(a)));
    r.selectRecord('W1');
    check('W1 shows its own border panel with colour GRN and a Conditioning toggle', r.has('rw-W1-wdw-color') && r.el('rw-W1-wdw-color').value === 'GRN' && r.el('rw-W1-wdw-color-on').checked && !!r.condToggle('rw-W1-wdw'));
    r.el('rw-W1-wdw-color').value = 'PNK';
    r.reset();
    r.fire(r.el('rw-W1-wdw-apply'), 'click');
    const t3 = r.lastText();
    check('Apply on the record writes WDWBORDER((*COLOR PNK)) on W1 only; the file-level one is untouched', !!t3 && kwOf(r.recFrom(t3, 'W1').keywords, 'WDWBORDER').parameters === '(*COLOR PNK)' && fileKw(t3, 'WDWBORDER').parameters === '(*COLOR RED)');
  }

  console.log('  -- field panels: HLPID on a constant, NOCCSID on a named field');
  {
    const f = await mount(PANELS);
    f.selectRecord('R1');
    const boxes = Array.from(f.doc.querySelectorAll('#screenOutput .dspf-field'));
    const constBox = boxes.find((b) => b.getAttribute('data-field') === '' && /Title/.test(b.textContent));
    check('the constant \'Title\' is on the preview canvas', !!constBox);
    f.fire(constBox, 'click');
    const hid = () => f.doc.querySelector('input[id$="-gen-hlpid-on"]');
    const hidp = () => f.doc.querySelector('input[id$="-gen-hlpid-params"]');
    check('saved state: HLPID checked with 7, no Conditioning toggle (option indicators not valid)', !!hid() && hid().checked && hidp().value === '7' && !f.doc.querySelector('.kw-cond-toggle[data-flag-id$="-gen-hlpid"]'));
    f.reset();
    hidp().value = '1000'; f.fire(hidp());
    check('HLPID(1000) is refused: no edit posted, message names HLPID', f.lastText() === null && f.alerts.some((a) => /HLPID/.test(a) && /1 to 999/.test(a)));
    f.fire(constBox, 'click');
    f.reset();
    hidp().value = '8'; f.fire(hidp());
    check('HLPID(8), already used by the other constant, is refused: no edit posted, message says unique', f.lastText() === null && f.alerts.some((a) => /HLPID\(8\)/.test(a) && /unique/.test(a)));
    f.fire(constBox, 'click');
    f.reset();
    hidp().value = '9'; f.fire(hidp());
    const t = f.lastText();
    const cf = t ? f.recFrom(t, 'R1').fields.find((x) => kwOf(x.keywords, 'HLPID') && kwOf(x.keywords, 'HLPID').parameters === '9') : null;
    check('HLPID(9) is accepted and written on that constant only', !!cf && f.recFrom(t, 'R1').fields.filter((x) => kwOf(x.keywords, 'HLPID')).length === 2);
    f.fire(f.doc.querySelector('#screenOutput .dspf-field[data-field="F1"]'), 'click');
    check('a named field has no HLPID row', !f.doc.querySelector('input[id$="-gen-hlpid-on"]'));
    const nc = f.doc.querySelector('input[id$="-gen-noccsid-on"]');
    check('F1 shows the NOCCSID row checked, with no parameter box and no Conditioning toggle', !!nc && nc.checked && !f.doc.querySelector('input[id$="-gen-noccsid-params"]') && !f.doc.querySelector('.kw-cond-toggle[data-flag-id$="-gen-noccsid"]'));
    f.reset();
    nc.checked = false; f.fire(nc);
    const t2 = f.lastText();
    check('NOCCSID off removes it from F1', !!t2 && !kwOf(f.recFrom(t2, 'R1').fields.find((x) => x.name === 'F1').keywords, 'NOCCSID'));
    f.fire(f.doc.querySelector('#screenOutput .dspf-field[data-field="F1"]'), 'click');
    const nc2 = f.doc.querySelector('input[id$="-gen-noccsid-on"]');
    f.reset();
    nc2.checked = true; f.fire(nc2);
    const t3 = f.lastText();
    const k3 = t3 ? kwOf(f.recFrom(t3, 'R1').fields.find((x) => x.name === 'F1').keywords, 'NOCCSID') : null;
    check('...and on again writes a bare NOCCSID', !!k3 && k3.parameters.trim() === '');
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();

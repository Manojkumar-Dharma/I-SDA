/**
 * i122hCommandKeyFamilyKeywords.test.js
 *
 * Task I-122h - the command-key family from the I-122 coverage inventory:
 * CA01-CA24, CF01-CF24, ALTPAGEDWN, ALTPAGEUP, DLTCHK, DLTEDT, RETCMDKEY,
 * MNUBARSW, MNUCNL, GETRETAIN. Each cell is traced to the keyword's own DDS
 * Reference section (DDS_Keyword_V7r6.txt), quoted through has() so a wording
 * drift in the spec entry or the reference fails here:
 *
 *   CAnn / CFnn     file or record level, CAnn[(response-indicator ['text'])], 01-24 with the
 *                   leading zero, indicators 01-99, option indicators valid, the same number
 *                   cannot be both CA and CF in a file (file-level keys extend to records).
 *   ALTPAGEDWN/UP   file level, [(CFnn)], default CF08 / CF07, and the list of keywords that
 *                   cannot use the same key number in the file.
 *   DLTCHK / DLTEDT field level, no parameters, valid only with R in position 29, no indicators.
 *   RETCMDKEY       record level, no parameters, needs INDARA, not with CAnn / CFnn (file or
 *                   record) or SFLDROP / SFLENTER / SFLFOLD, not with ALTHELP / ALTPAGE*.
 *   MNUBARSW/MNUCNL [(CAnn)] / [(CAnn [response-indicator])], default CA10 / CA12, the CAnn
 *                   cannot be reused on the same record by the other one.
 *   GETRETAIN       record level, no parameters, needs UNLOCK with no parameters.
 *
 *  Spec -> L1/L2 writer (parse, round trip, guards in both directions) -> L3 panel -> L4 raw editor.
 *
 * Gaps found while writing it are NOT asserted as correct; they are logged in
 * docs/sda-reference/keywordFixes.md (I-186, I-187, I-188, I-189).
 *
 * Run with: node src/test/i122hCommandKeyFamilyKeywords.test.js
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

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.ref) put(29, o.ref);
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
const FLD = (name, ref, fn) => dds({ name, ref, len: 5, type: 'A', use: 'B', line: 1, col: 2, fn });
const parse = (t) => DspfParser.parseDspf(t);
const say = (re, r) => re.test(r || '');
const kwOf = (kws, name) => (kws || []).find((k) => k.name === name);
const T = KeywordSpec.RECORD_TYPES;
const kw = (name, parameters, conditions) => ({ name, parameters: parameters || '', conditions: conditions || [], raw: '', sourceLines: [] });
const IND = (n) => [{ indicators: [{ number: n, negated: false }] }];
const IN = K('INDARA');

console.log('=== spec: what the DDS Reference says about each keyword ===');
{
  check('CAnn / CFnn: format, 01-24 with the leading zero, response indicators 1-99, file and record level, option indicators valid',
    has('CAnn[(response-indicator [\'text\'])]') && has('CFnn[(response-indicator [\'text\'])]') &&
    ['CA01-CA24', 'CF01-CF24'].every((n) => T[n].levels.join() === 'file,record' && T[n].pattern.first === 1 && T[n].pattern.last === 24 && T[n].pattern.digits === 2 &&
      T[n].parameters.responseIndicator.min === 1 && T[n].parameters.responseIndicator.max === 99 && T[n].parameters.keyNumberMustHaveLeadingZero === true && T[n].optionIndicators === 'valid'));
  check('CAnn does not transmit input data, CFnn does', T['CA01-CA24'].transmitsInputData === false && T['CF01-CF24'].transmitsInputData === true);
  check('the same key number as both CA and CF is refused file-wide (spec and both reference sentences)',
    has('CA02 and CF02 are not valid in the same display file') && has('CA01 and CF01 are not valid in the same display file') &&
    ['CA01-CA24', 'CF01-CF24'].every((n) => T[n].sameKeyNumberAsOtherType === 'notAllowed' && T[n].sameKeyNumberScope === 'file' && T[n].fileLevelKeysExtendToRecordLevel === true));
  check('commandKeyEntry resolves a concrete key to its pattern entry; a non-key resolves to null',
    KeywordSpec.commandKeyEntry('CA05') === T['CA01-CA24'] && KeywordSpec.commandKeyEntry('CF24') === T['CF01-CF24'] && !KeywordSpec.commandKeyEntry('ALTHELP') && !KeywordSpec.commandKeyEntry('CA5'));
  check('ALTPAGEDWN / ALTPAGEUP: format, CF01-CF24, defaults CF08 and CF07, claimed key type CF',
    has('ALTPAGEDWN[(CFnn)]') && has('ALTPAGEUP[(CFnn)]') && has('The valid values for the optional parameters are CF01 through CF24.') &&
    has('CF08 is the default for ALTPAGEDWN and CF07 is the default for ALTPAGEUP') &&
    T.ALTPAGEDWN.defaultKey === 'CF08' && T.ALTPAGEUP.defaultKey === 'CF07' && T.ALTPAGEDWN.claimedKeyType === 'CF' && T.ALTPAGEUP.claimedKeyType === 'CF');
  check('ALTPAGEDWN / ALTPAGEUP: exclusion lists, in the spec relation each one carries',
    T.ALTPAGEDWN.excluded.map((e) => e.keyword + ':' + e.relation).join() === 'ALTHELP:any,ALTPAGEUP:any,CAnn:any,CFnn:any,MNUCNL:caOnly,MNUBARSW:caOnly,MOUBTN:opposite,PSHBTNCHC:opposite,SFLDROP:any,SFLENTER:any,SFLFOLD:any' &&
    T.ALTPAGEUP.excluded.map((e) => e.keyword).join() === 'ALTHELP,ALTPAGEDWN,CAnn,CFnn,MNUCNL,MNUBARSW,MOUBTN,PSHBTNCHC,SFLDROP,SFLENTER,SFLFOLD' &&
    has('cannot be specified in a file with an ALTPAGEDWN keyword that has no parameter (CF08 default)'));
  check('DLTCHK / DLTEDT: no parameters, valid only with R in position 29, delete validity / edit keywords',
    has('This keyword is valid only when R is specified in position 29. This keyword has no parameters.') && has('ignore all validity checking and CHKMSGID keywords') &&
    has('ignore the EDTCDE or EDTWRD keyword') && T.DLTCHK.noParameters === true && T.DLTEDT.noParameters === true &&
    T.DLTCHK.requiresReferenceFlag === true && T.DLTEDT.requiresReferenceFlag === true && T.DLTCHK.deletes === 'VALIDITY' && T.DLTEDT.deletes === 'EDIT');
  check('DLTCHK / DLTEDT: the reference-flag keyword list is REFFLD, DLTCHK, DLTEDT and TEXT is not on it',
    KeywordSpec.referenceFlagRequiredKeywords().join() === 'REFFLD,DLTCHK,DLTEDT' && KeywordSpec.requiresReferenceFlag('DLTCHK') && KeywordSpec.requiresReferenceFlag('DLTEDT') && !KeywordSpec.requiresReferenceFlag('TEXT'));
  check('DLTCHK / DLTEDT: option indicators are not valid (reference), and the accessor agrees',
    has('Option indicators are not valid for this keyword.') && !DspfWriter.optionIndicatorsAllowed('DLTCHK') && !DspfWriter.optionIndicatorsAllowed('DLTEDT'));
  check('RETCMDKEY: record level, no parameters, indicators not valid, needs INDARA',
    T.RETCMDKEY.levels.join() === 'record' && T.RETCMDKEY.noParameters === true && T.RETCMDKEY.optionIndicators === 'notValid' && T.RETCMDKEY.requiresInFile.join() === 'INDARA');
  check('RETCMDKEY: refuses CAnn / CFnn at file and record, SFLDROP / SFLENTER / SFLFOLD on the record, ALTHELP / ALTPAGEUP / ALTPAGEDWN in the file',
    KeywordSpec.fileAndRecordExcludes('RETCMDKEY').join() === 'CAnn,CFnn' && KeywordSpec.recordExcludes('RETCMDKEY').join() === 'SFLDROP,SFLENTER,SFLFOLD' && KeywordSpec.fileExcludes('RETCMDKEY').join() === 'ALTHELP,ALTPAGEUP,ALTPAGEDWN' && T.RETCMDKEY.notOnRecordTypes.join() === 'SFL,USRDFN');
  check('MNUBARSW: [(CAnn)], default CA10, CA01-CA24, partner MNUCNL, menu-bar file only, indicators valid in the reference',
    has('The format of the keyword is MNUBARSW [(CAnn)].') && has('If not specified, the default is CA10.') && has('The MNUBARSW keyword is allowed only in a file containing a menu-bar record.') &&
    T.MNUBARSW.caKeyDefault === 'CA10' && T.MNUBARSW.caKeyPartner === 'MNUCNL' && KeywordSpec.caKeyPartner('MNUBARSW').defaultCakey === 'CA10');
  check('MNUCNL: [(CAnn [response-indicator])], default CA12, partner MNUBARSW, menu-bar file only',
    has('MNUCNL[(CAnn [response-indicator])]') && has('If not specified, the default is CA12.') && has('The MNUCNL keyword is allowed only in a file containing a menu-bar record.') &&
    T.MNUCNL.caKeyDefault === 'CA12' && T.MNUCNL.caKeyPartner === 'MNUBARSW');
  check('MNUBARSW and MNUCNL: each section forbids the other on the same record, and the CAnn key as a CF key on other records',
    has('the CAnn key specified by the MNUBARSW keyword cannot be specified again using another keyword (such as MNUCNL)') &&
    has('the CAnn key specified by the MNUCNL keyword cannot be specified again using another keyword (such as MNUBARSW)') &&
    has('can be used only as a CA key on other records, not as a CF key'));
  check('GETRETAIN: record level, no parameters, indicators not valid, needs a bare UNLOCK',
    has('You must specify the UNLOCK keyword without any parameters when using GETRETAIN.') && has('The UNLOCK(*MDTOFF) specification provides the same function as GETRETAIN.') &&
    T.GETRETAIN.levels.join() === 'record' && T.GETRETAIN.noParameters === true && T.GETRETAIN.optionIndicators === 'notValid' &&
    KeywordSpec.recordRequires('GETRETAIN').join() === 'UNLOCK' && KeywordSpec.requiresBareKeyword('GETRETAIN') === 'UNLOCK');
  check('takesNoParameters: DLTCHK, DLTEDT, RETCMDKEY and GETRETAIN yes; CAnn, MNUCNL, ALTPAGEDWN no',
    ['DLTCHK', 'DLTEDT', 'RETCMDKEY', 'GETRETAIN'].every((n) => DspfWriter.takesNoParameters(n)) && ['MNUCNL', 'MNUBARSW', 'ALTPAGEDWN', 'ALTPAGEUP'].every((n) => !DspfWriter.takesNoParameters(n)));
  check('the accessor agrees for RETCMDKEY and GETRETAIN (indicators not valid) and for the pattern entry CA01-CA24 (valid)',
    !DspfWriter.optionIndicatorsAllowed('RETCMDKEY') && !DspfWriter.optionIndicatorsAllowed('GETRETAIN') && DspfWriter.optionIndicatorsAllowed('CA01-CA24'));
  // Task I-189: the level, parameter-form and option-indicator facts the six entries now state, each traced to the
  // keyword's own section, and the accessors that read them.
  check('MNUBARSW / MNUCNL: file- or record-level, indicators valid, the format lines, allowed only with a menu-bar record',
    has('You use this file- or record-level keyword to assign a command attention (CA) key to be the Switch-to- menu-bar key.') &&
    has('You use this file- or record-level keyword to assign a command attention (CA) key to be the cancel key') &&
    has('Option indicators are valid for this keyword.') &&
    JSON.stringify(T.MNUBARSW.levels) === '["file","record"]' && JSON.stringify(T.MNUCNL.levels) === '["file","record"]' &&
    T.MNUBARSW.parameterForm === 'MNUBARSW [(CAnn)]' && T.MNUCNL.parameterForm === 'MNUCNL[(CAnn [response-indicator])]' &&
    T.MNUBARSW.optionIndicators === 'valid' && T.MNUCNL.optionIndicators === 'valid' &&
    T.MNUBARSW.requiresMenuBarRecordInFile === true && T.MNUCNL.requiresMenuBarRecordInFile === true);
  check('ALTPAGEDWN / ALTPAGEUP: file level only, the format lines, and no option-indicator fact (the section states none for them)',
    has('You use these file-level keywords to assign command function (CF) keys as alternative Page Down/Page Up keys.') &&
    JSON.stringify(T.ALTPAGEDWN.levels) === '["file"]' && JSON.stringify(T.ALTPAGEUP.levels) === '["file"]' &&
    T.ALTPAGEDWN.parameterForm === 'ALTPAGEDWN[(CFnn)]' && T.ALTPAGEUP.parameterForm === 'ALTPAGEUP[(CFnn)]' &&
    T.ALTPAGEDWN.optionIndicators === undefined && T.ALTPAGEUP.optionIndicators === undefined);
  check('DLTCHK / DLTEDT: field level and option indicators not valid, as facts in the entries',
    has('You use this field-level keyword to specify that the IBM i operating system is to ignore all validity checking') &&
    has('You use this field-level keyword to specify that the IBM i operating system is to ignore the EDTCDE or EDTWRD keyword') &&
    JSON.stringify(T.DLTCHK.levels) === '["field"]' && JSON.stringify(T.DLTEDT.levels) === '["field"]' &&
    T.DLTCHK.optionIndicators === 'notValid' && T.DLTEDT.optionIndicators === 'notValid');
  check('optionIndicatorsAllowed: MNUBARSW and MNUCNL yes (reference: valid), in any letter case',
    DspfWriter.optionIndicatorsAllowed('MNUBARSW') && DspfWriter.optionIndicatorsAllowed('MNUCNL') && DspfWriter.optionIndicatorsAllowed('mnubarsw'));
  check('optionIndicatorsAllowed: a concrete command key answers as its pattern entry (CA05, CF24 yes); CA00, CA25 and CA5 are not keys',
    DspfWriter.optionIndicatorsAllowed('CA05') && DspfWriter.optionIndicatorsAllowed('CF24') && DspfWriter.optionIndicatorsAllowed('CA01') &&
    !DspfWriter.optionIndicatorsAllowed('CA00') && !DspfWriter.optionIndicatorsAllowed('CA25') && !DspfWriter.optionIndicatorsAllowed('CA5'));
  check('optionIndicatorsAllowed: ALTPAGEDWN / ALTPAGEUP stay false (nothing stated), DLTCHK / DLTEDT false (not valid)',
    !DspfWriter.optionIndicatorsAllowed('ALTPAGEDWN') && !DspfWriter.optionIndicatorsAllowed('ALTPAGEUP') &&
    !DspfWriter.optionIndicatorsAllowed('DLTCHK') && !DspfWriter.optionIndicatorsAllowed('DLTEDT'));
  check('takesNoParameters on a concrete command key is false (CAnn takes a response indicator and text), CA00 false',
    !DspfWriter.takesNoParameters('CA05') && !DspfWriter.takesNoParameters('CA00'));
}

console.log('\n=== L1/L2 CAnn / CFnn: parse, round trip, bounds ===');
{
  const kws = [kw('CA03', "10 'Exit'"), kw('CF12'), kw('DUP')];
  const parsed = DspfWriter.parseCommandKeys(kws);
  check('parses type, number, response indicator and text', parsed.length === 2 && parsed[0].type === 'CA' && parsed[0].number === '03' && parsed[0].indicator === '10' && parsed[0].text === 'Exit');
  check('a bare key has a null indicator and null text', parsed[1].type === 'CF' && parsed[1].number === '12' && parsed[1].indicator === null && parsed[1].text === null);
  check('the neighbours (DUP) are not command keys', parsed.every((k) => k.keyword.name !== 'DUP'));
  const set = DspfWriter.setCommandKeyAt([kw('DUP')], 0, 'CF', '05', '12', 'Go', IND(20));
  check('setCommandKeyAt writes number, indicator and quoted text, keeps the Conditioning, and keeps the neighbours', kwOf(set, 'CF05').parameters === "12 'Go'" && kwOf(set, 'CF05').conditions.length === 1 && set[0].name === 'DUP');
  check('...a blank indicator and text write a bare keyword', kwOf(DspfWriter.setCommandKeyAt([], 0, 'CA', '05', '', '', []), 'CA05').parameters === '');
  check('...an apostrophe in the text is doubled and reads back as one', kwOf(DspfWriter.setCommandKeyAt([], 0, 'CA', '05', '10', "It's", []), 'CA05').parameters === "10 'It''s'" && DspfWriter.parseCommandKeys(DspfWriter.setCommandKeyAt([], 0, 'CA', '05', '10', "It's", []))[0].text === "It's");
  check('...text with no indicator writes a bare keyword (the grammar needs the indicator first)', kwOf(DspfWriter.setCommandKeyAt([], 0, 'CA', '05', '', 'Go', []), 'CA05').parameters === '');
  const again = DspfWriter.parseCommandKeys(set);
  check('a written key parses back to the same fields', again.length === 1 && again[0].type === 'CF' && again[0].number === '05' && again[0].indicator === '12' && again[0].text === 'Go' && again[0].conditions.length === 1);
  const two = DspfWriter.setCommandKeyAt(DspfWriter.setCommandKeyAt([], 0, 'CF', '03', '10', 'Exit', []), 1, 'CF', '03', '11', 'Cancel', IND(25));
  check('two instances of the same number are kept (one past the end adds, an index replaces)', DspfWriter.parseCommandKeys(two).length === 2 && DspfWriter.parseCommandKeys(DspfWriter.setCommandKeyAt(two, 0, 'CA', '04', '', '', [])).map((k) => k.type + k.number).join() === 'CA04,CF03');
  check('removeCommandKeyAt removes that instance only and leaves the rest', DspfWriter.removeCommandKeyAt(two, 0).length === 1 && kwOf(DspfWriter.removeCommandKeyAt(two, 0), 'CF03').parameters === "11 'Cancel'" && two.length === 2);
  check('allCommandKeyNumbers is 01..24; availableCommandKeyNumbers drops the numbers already used', DspfWriter.allCommandKeyNumbers().length === 24 && DspfWriter.allCommandKeyNumbers()[0] === '01' && DspfWriter.allCommandKeyNumbers()[23] === '24' && DspfWriter.availableCommandKeyNumbers([kw('CA01')]).length === 23);
  check('ALTHELP and a malformed CA3 are not command keys', DspfWriter.parseCommandKeys([kw('ALTHELP'), kw('CA3'), kw('CA005')]).length === 0);
  // CA00 and CA25 still parse (isCommandKeyName, parseCommandKey and parseCommandKeys read the grammar only);
  // the 01-24 range is the I-186 guard's job (i186CommandKeyRange.test.js).
}

console.log('\n=== L1/L2 CAnn / CFnn: the same number as CA and CF ===');
{
  const cn = (a, b) => DspfWriter.commandKeyNumberNewConflictReason(parse(a), parse(b));
  check('CA03 at file level, then CF03 on a record: refused, naming both places', say(/CA03 and CF03 cannot both be specified in the same display file \(CA03 is on the file level, CF03 on record format R1\)/, cn(src(R('R1')), src(K('CA03'), R('R1', 'CF03')))));
  check('...the same when CF is added to a file that already has the CA (the other order)', say(/CA03 and CF03/, cn(src(K('CA03'), R('R1')), src(K('CA03'), R('R1', 'CF03')))));
  check('...and the CA added to a file that already has the CF on a record', say(/CA03 and CF03/, cn(src(R('R1', 'CF03')), src(K('CA03'), R('R1', 'CF03')))));
  check('CA05 and CF05 on the same record: refused', say(/CA05 and CF05/, cn(src(R('R1', 'CA05')), src(R('R1', 'CA05'), K('CF05')))));
  check('CA05 on one record and CF05 on another is refused too (the scope is the whole file)', say(/CA05 and CF05/, cn(src(R('R1', 'CA05'), R('R2')), src(R('R1', 'CA05'), R('R2', 'CF05')))));
  check('the same type twice (CF03 and CF03) is never a clash', cn(src(R('R1')), src(K('CF03'), R('R1', 'CF03'))) === null);
  check('different numbers never clash', cn(src(R('R1')), src(K('CA03'), R('R1', 'CF04'))) === null);
  check('removing one side is never blocked', cn(src(K('CA03'), R('R1', 'CF03')), src(R('R1', 'CF03'))) === null);
  check('an already-invalid pair is not re-reported by an unrelated edit', cn(src(K('CA03'), R('R1', 'CF03')), src(K('CA03'), R('R1', 'CF03'), K('TEXT'))) === null);
  check('the grammar facts back it up: CA03 pairs with CF, CF24 with CA, CA00 / CA25 / CA3 give null', KeywordSpec.commandKeyNumberClash('CA03').other === 'CF' && KeywordSpec.commandKeyNumberClash('CF24').other === 'CA' && ['CA00', 'CA25', 'CA3', 'CLEAR', ''].every((t) => KeywordSpec.commandKeyNumberClash(t) === null));
  // MNUBARSW / MNUCNL claim a CA key (their sections: "can be used only as a CA key on other records, not as a
  // CF key"): enforced since I-187, pinned by i187MnuKeyNumberClaims.test.js.
}

console.log('\n=== L1/L2 ALTPAGEDWN / ALTPAGEUP: the key number they claim ===');
{
  const alt = (a, b) => DspfWriter.altKeyFileExclusionNewConflictReason(parse(a), parse(b));
  check('claims: a bare ALTPAGEDWN claims its default CF08, and the label says so', DspfWriter.commandKeyClaimsInModel(parse(src(K('ALTPAGEDWN'), R('R1', 'MNUCNL(CA05)')))).map((c) => c.label).join() === 'ALTPAGEDWN (no parameter, default CF08),MNUCNL(CA05)');
  check('claims: ALTPAGEDWN(CF09) claims CF09', DspfWriter.commandKeyClaimsInModel(parse(src(K('ALTPAGEDWN(CF09)'), R('R1')))).map((c) => c.type + c.number).join() === 'CF09');
  check('a bare ALTPAGEDWN with CF08 on a record is refused, quoting the reference', say(/^ALTPAGEDWN \(no parameter, default CF08\) cannot be specified in a file with CF08 \(on record R1\) - both use key number 08\. The following keywords cannot be specified in a file with an ALTPAGEDWN keyword/, alt(src(R('R1')), src(K('ALTPAGEDWN'), R('R1', 'CF08')))));
  check('ALTPAGEDWN(CF09) with CF09 is refused', say(/^ALTPAGEDWN\(CF09\) cannot be specified in a file with CF09 \(on record R1\) - both use key number 09/, alt(src(R('R1')), src(K('ALTPAGEDWN(CF09)'), R('R1', 'CF09')))));
  check('ALTPAGEDWN(CF09) with CA09 is refused too (CAnn is excluded for the number, either type)', say(/CA09 \(on record R1\)/, alt(src(R('R1')), src(K('ALTPAGEDWN(CF09)'), R('R1', 'CA09')))));
  check('ALTPAGEDWN(CF09) does not claim CA08 (a different number)', alt(src(R('R1')), src(K('ALTPAGEDWN(CF09)'), R('R1', 'CA08'))) === null);
  check('a bare ALTPAGEUP claims CF07', say(/^ALTPAGEUP \(no parameter, default CF07\) cannot be specified in a file with CF07/, alt(src(R('R1')), src(K('ALTPAGEUP'), R('R1', 'CF07')))));
  check('ALTPAGEUP with ALTPAGEDWN(CF07) is refused (the pair claims one number)', say(/ALTPAGEUP \(no parameter, default CF07\) cannot be specified in a file with ALTPAGEDWN\(CF07\)/, alt(src(K('ALTPAGEUP')), src(K('ALTPAGEUP'), K('ALTPAGEDWN(CF07)')))));
  check('ALTPAGEUP(CF05) with ALTPAGEDWN(CF05) is refused, while the two defaults (CF07 and CF08) sit together fine', say(/^ALTPAGEUP\(CF05\) cannot be specified in a file with ALTPAGEDWN\(CF05\) - both use key number 05/, alt(src(K('ALTPAGEUP')), src(K('ALTPAGEUP(CF05)'), K('ALTPAGEDWN(CF05)')))) && alt(src(R('R1')), src(K('ALTPAGEUP'), K('ALTPAGEDWN'), R('R1'))) === null);
  check('MNUCNL(CA08) with a bare ALTPAGEDWN is refused (MNUCNL is excluded for CA)', say(/ALTPAGEDWN \(no parameter, default CF08\) cannot be specified in a file with MNUCNL\(CA08\)/, alt(src(R('R1')), src(K('ALTPAGEDWN'), R('R1', 'MNUCNL(CA08)')))));
  check('MNUCNL at its own default CA12 is fine', alt(src(R('R1')), src(K('ALTPAGEDWN'), R('R1', 'MNUCNL(CA12)'))) === null);
  check('SFLDROP(CF08) and SFLENTER(CA08) are refused with ALTPAGEDWN', say(/SFLDROP\(CF08\)/, alt(src(R('R1')), src(K('ALTPAGEDWN'), R('R1', 'SFLDROP(CF08)')))) && say(/SFLENTER\(CA08\)/, alt(src(R('R1')), src(K('ALTPAGEDWN'), R('R1', 'SFLENTER(CA08)')))));
  check('PSHBTNCHC with CA08 is refused (the opposite type); with CF08 the same type is not', say(/PSHBTNCHC\(1 'x' CA08\)/, alt(src(R('R1')), src(K('ALTPAGEDWN'), R('R1', "PSHBTNCHC(1 'x' CA08)")))) && alt(src(R('R1')), src(K('ALTPAGEDWN'), R('R1', "PSHBTNCHC(1 'x' CF08)"))) === null);
  check('adding the ALTPAGEDWN to a file that already has the key is refused (the other order)', say(/CF08/, alt(src(R('R1', 'CF08')), src(K('ALTPAGEDWN'), R('R1', 'CF08')))));
  check('removing the clashing key is never blocked, and an existing clash is not re-reported', alt(src(K('ALTPAGEDWN'), R('R1', 'CF08')), src(K('ALTPAGEDWN'), R('R1'))) === null && alt(src(K('ALTPAGEDWN'), R('R1', 'CF08')), src(K('ALTPAGEDWN'), R('R1', 'CF08'), K('TEXT'))) === null);
}

console.log('\n=== L1/L2 DLTCHK / DLTEDT ===');
{
  const rf = (a, b) => DspfWriter.referenceFieldNewConflictReason(parse(a), parse(b));
  ['DLTCHK', 'DLTEDT'].forEach((k) => {
    check(k + ' on a field without R in position 29 is refused, with the reference sentence', say(new RegExp(k + ' cannot be specified on field F1: it is valid only when R is specified in position 29 \\(per the DDS Reference\\)'), rf(src(R('R1'), FLD('F1', '')), src(R('R1'), FLD('F1', ''), K(k)))));
    check(k + ' on a field with R in position 29 is accepted', rf(src(R('R1'), FLD('F1', 'R')), src(R('R1'), FLD('F1', 'R'), K(k))) === null);
    check(k + ': clearing the R while it stays is refused (the other direction)', say(new RegExp(k + ' cannot be specified on field F1'), rf(src(R('R1'), FLD('F1', 'R'), K(k)), src(R('R1'), FLD('F1', ''), K(k)))));
    check(k + ': clearing the R and dropping it together is accepted', rf(src(R('R1'), FLD('F1', 'R'), K(k)), src(R('R1'), FLD('F1', ''))) === null);
    check(k + ': an already-invalid field does not block an unrelated edit', rf(src(R('R1'), FLD('F1', ''), K(k)), src(R('R1'), FLD('F1', ''), K(k), K("TEXT('x')"))) === null);
  });
  check('both on one field with R is accepted, and a second field without R is the one refused', rf(src(R('R1'), FLD('F1', 'R'), K('DLTCHK'), K('DLTEDT')), src(R('R1'), FLD('F1', 'R'), K('DLTCHK'), K('DLTEDT'))) === null && say(/field F2/, rf(src(R('R1'), FLD('F1', 'R'), K('DLTCHK'), FLD('F2', '')), src(R('R1'), FLD('F1', 'R'), K('DLTCHK'), FLD('F2', ''), K('DLTEDT')))));
  const f = DspfWriter.setFileFlagKeyword([kw('DUP')], 'DLTCHK', true);
  // I-193: retired "DLTCHK round trips as a bare flag and keeps its neighbours" - the generated matrix (L5, RETAINED) runs the same flag-path assertion on this keyword.
}

console.log('\n=== L1/L2 RETCMDKEY ===');
{
  const rk = (a, b) => DspfWriter.retKeyNewConflictReason(parse(a), parse(b));
  check('RETCMDKEY in a file with INDARA and nothing else is accepted', rk(src(IN, R('R1')), src(IN, R('R1', 'RETCMDKEY'))) === null);
  check('RETCMDKEY with CAnn on the same record is refused, with the reference sentence', say(/^RETCMDKEY and a CAnn keyword cannot be specified on the same record format \(R1\) \(per the DDS Reference\)\.$/, rk(src(IN, R('R1')), src(IN, R('R1', 'RETCMDKEY'), K('CA05')))));
  check('RETCMDKEY with a file-level CAnn is refused', say(/^RETCMDKEY cannot be specified on record format R1 in a file that has a CAnn keyword at the file level/, rk(src(IN, R('R1', 'RETCMDKEY')), src(IN, K('CA05'), R('R1', 'RETCMDKEY')))));
  check('...CFnn the same way', say(/CFnn keyword at the file level/, rk(src(IN, R('R1', 'RETCMDKEY')), src(IN, K('CF05'), R('R1', 'RETCMDKEY')))));
  check('RETCMDKEY with SFLDROP on the record is refused, naming it', say(/RETCMDKEY and SFLDROP cannot be specified on the same record format \(R1\)/, rk(src(IN, R('R1')), src(IN, R('R1', 'RETCMDKEY'), K('SFLDROP(CA09)')))));
  check('RETCMDKEY with ALTHELP in the file is refused', say(/RETCMDKEY cannot be specified on record format R1 in a file with ALTHELP/, rk(src(IN, R('R1', 'RETCMDKEY')), src(IN, K('ALTHELP'), R('R1', 'RETCMDKEY')))));
  check('RETCMDKEY in a file without INDARA is refused', say(/requires the file to specify INDARA/, rk(src(R('R1')), src(R('R1', 'RETCMDKEY')))));
  check('removing INDARA while RETCMDKEY stays is refused (the other direction)', say(/INDARA/, rk(src(IN, R('R1', 'RETCMDKEY')), src(R('R1', 'RETCMDKEY')))));
  check('RETCMDKEY beside RETKEY is not a clash in the reference (no rule)', rk(src(IN, R('R1')), src(IN, R('R1', 'RETCMDKEY'), K('RETKEY'))) === null);
  check('removing the clashing keyword is never blocked, and an existing clash is not re-reported', rk(src(IN, R('R1', 'RETCMDKEY'), K('CA05')), src(IN, R('R1', 'RETCMDKEY'))) === null && rk(src(IN, R('R1', 'RETCMDKEY'), K('CA05')), src(IN, R('R1', 'RETCMDKEY'), K('CA05'), K('TEXT'))) === null);
  // RETCMDKEY (and RETKEY) on a subfile record (SFL) or a user-defined record (USRDFN) is refused since I-188
  // (retKeyViolations reads the spec's notOnRecordTypes): pinned by i188RetkeyRecordTypes.test.js.
}

console.log('\n=== L1/L2 MNUBARSW / MNUCNL ===');
{
  const mn = DspfWriter.mnuBarKeyConflictReason;
  check('file-level MNUCNL(CA10) blocks a new MNUBARSW at its default CA10', say(/^MNUBARSW\(CA10\) cannot use the same CA key as the file-level MNUCNL\(CA10\) - a file-level MNUCNL extends to every record \(per the DDS Reference\)\.$/, mn('MNUBARSW', '', [kw('MNUCNL', 'CA10')], [])));
  check('file-level MNUBARSW(CA12) blocks a new MNUCNL at its default CA12', say(/^MNUCNL\(CA12\) cannot use the same CA key as the file-level MNUBARSW\(CA12\)/, mn('MNUCNL', '', [kw('MNUBARSW', 'CA12')], [])));
  check('a record-level MNUCNL(CA05) blocks MNUBARSW(CA05) on that record, the pair read in both orders', say(/MNUCNL\(CA05\) already assigned on this record/, mn('MNUBARSW', 'CA05', [], [[kw('MNUCNL', 'CA05')]])) && say(/MNUBARSW\(CA05\) already assigned on this record/, mn('MNUCNL', 'CA05', [], [[kw('MNUBARSW', 'CA05')]])));
  check('a record that has a bare MNUBARSW holds CA10, so MNUCNL(CA10) is refused there', say(/MNUCNL\(CA10\) cannot use the same CA key as MNUBARSW\(CA10\) already assigned on this record/, mn('MNUCNL', 'CA10', [], [[kw('MNUBARSW')]])));
  check('different keys, or a different record, never collide', mn('MNUBARSW', 'CA05', [], [[kw('MNUCNL', 'CA06')]]) === null && mn('MNUBARSW', 'CA05', [], []) === null);
  check('MNUCNL may carry a response indicator after the key (CA key read from the first token)', say(/MNUBARSW\(CA10\)/, mn('MNUBARSW', '', [kw('MNUCNL', 'CA10 90')], [])));
  check('a keyword with no CA-key partner is fail-safe null', mn('MNUBAR', 'CA10', [], []) === null);
  const alt = (a, b) => DspfWriter.altKeyFileExclusionNewConflictReason(parse(a), parse(b));
  check('adding MNUCNL(CA08) to a file with ALTPAGEDWN is refused (the other order)', say(/cannot be specified in a file with MNUCNL\(CA08\)/, alt(src(K('ALTPAGEDWN'), R('R1')), src(K('ALTPAGEDWN'), R('R1', 'MNUCNL(CA08)')))));
  check('MNUBARSW(CF08) is not a CA claim for ALTPAGEDWN (caOnly: only a CA key counts)', alt(src(K('ALTPAGEDWN'), R('R1')), src(K('ALTPAGEDWN'), R('R1', 'MNUBARSW(CF08)'))) === null);
  // MNUBARSW(CF05) and MNUBARSW(CA25) are refused since I-186 (i186CommandKeyRange.test.js). The CA-key-not-as-CF rule is
  // enforced since I-187 (i187MnuKeyNumberClaims.test.js); "allowed only in a file containing a menu-bar
  // record" was not probed.
}

console.log('\n=== L1/L2 GETRETAIN ===');
{
  const gr = (a, b) => DspfWriter.initRetainReturnNewConflictReason(parse(a), parse(b));
  check('GETRETAIN with a bare UNLOCK on the record is accepted', gr(src(R('R1')), src(R('R1', 'GETRETAIN'), K('UNLOCK'))) === null);
  check('GETRETAIN with no UNLOCK is refused, with the DDS wording', say(/^GETRETAIN cannot be specified on record format R1 without UNLOCK \(with no parameters\) on the same record format \(per the DDS Reference\)\.$/, gr(src(R('R1')), src(R('R1', 'GETRETAIN')))));
  check('GETRETAIN with UNLOCK(*ALL) is refused, naming the parameter', say(/^GETRETAIN on record format R1 requires UNLOCK with no parameters, but UNLOCK is specified with \(\*ALL\)/, gr(src(R('R1')), src(R('R1', 'GETRETAIN'), K('UNLOCK(*ALL)')))));
  check('removing UNLOCK while GETRETAIN stays is refused (the other direction)', say(/GETRETAIN cannot be specified on record format R1 without UNLOCK/, gr(src(R('R1', 'GETRETAIN'), K('UNLOCK')), src(R('R1', 'GETRETAIN')))));
  check('changing UNLOCK to UNLOCK(*MDTOFF) while GETRETAIN stays is refused', say(/requires UNLOCK with no parameters/, gr(src(R('R1', 'GETRETAIN'), K('UNLOCK')), src(R('R1', 'GETRETAIN'), K('UNLOCK(*MDTOFF)')))));
  check('an UNLOCK on another record does not satisfy it', say(/GETRETAIN cannot be specified on record format R1/, gr(src(R('R1'), R('R2', 'UNLOCK')), src(R('R1', 'GETRETAIN'), R('R2', 'UNLOCK')))));
  check('removing GETRETAIN is never blocked, and an existing violation is not re-reported', gr(src(R('R1', 'GETRETAIN'), K('UNLOCK')), src(R('R1', 'UNLOCK'))) === null && gr(src(R('R1', 'GETRETAIN')), src(R('R1', 'GETRETAIN'), K('TEXT'))) === null);
  check('GETRETAIN round trips as a bare flag', DspfWriter.getFileFlagKeyword(DspfWriter.setFileFlagKeyword([kw('UNLOCK')], 'GETRETAIN', true), 'GETRETAIN').present);
}

console.log('\n=== L3 display: the command-keys panel ===');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
const alerts = [];
dom.window.alert = (m) => alerts.push(m);
const root = () => document.getElementById('root');
{
  const keys = [kw('CA03', "10 'Exit'", IND(25)), kw('CF12')];
  root().innerHTML = Helpers.commandKeysSectionHtml('this record', keys, DspfWriter.allCommandKeyNumbers(), 'k', new Set());
  const chips = Array.from(root().querySelectorAll('.cmdkey-row .keyword-chip')).map((c) => c.textContent.replace('\u00d7', '').trim());
  check('each saved key is a row labelled F-number = CAnn (ind) \'text\'', chips.join('|') === "F3 = CA03 (ind 10) 'Exit'|F12 = CF12");
  check('the Conditioning toggle shows a count only on the conditioned row', /Conditioning \(1\)/.test(root().querySelector('.cmdkey-cond-toggle[data-index="0"]').textContent) && /^Conditioning [\u25be\u25b4]$/.test(root().querySelector('.cmdkey-cond-toggle[data-index="1"]').textContent.trim()));
  check('the add form offers CA and CF and the 24 numbers', Array.from(root().querySelectorAll('.cmdkey-type option')).map((o) => o.value).join() === 'CA,CF' && root().querySelectorAll('.cmdkey-number option').length === 24);
  check('with no keys the panel says so', /None defined\./.test(Helpers.commandKeysSectionHtml('', [], DspfWriter.allCommandKeyNumbers(), 'e', new Set())));
  let committed = null;
  Helpers.wireCommandKeysSection('k', keys, (n) => { committed = n; }, new Set(), () => {});
  root().querySelector('.cmdkey-type').value = 'CF';
  root().querySelector('.cmdkey-number').value = '05';
  root().querySelector('.cmdkey-indicator').value = '30';
  root().querySelector('.cmdkey-text').value = 'Go';
  root().querySelector('.cmdkey-add').click();
  check('+ Add writes the chosen type, number, indicator and text after the existing keys', !!committed && committed.map((k) => k.name).join() === 'CA03,CF12,CF05' && kwOf(committed, 'CF05').parameters === "30 'Go'");
  committed = null;
  root().querySelector('.cmdkey-remove[data-index="0"]').click();
  check('the \u00d7 on a row removes that instance only', !!committed && committed.map((k) => k.name).join() === 'CF12');
  committed = null; alerts.length = 0;
  root().innerHTML = Helpers.commandKeysSectionHtml('this record', keys, DspfWriter.allCommandKeyNumbers(), 'k', new Set());
  Helpers.wireCommandKeysSection('k', keys, (n) => { committed = n; }, new Set(), () => {}, (name) => (name === 'CF05' ? 'CF05 clashes with CA05 (test reason)' : null));
  root().querySelector('.cmdkey-type').value = 'CF'; root().querySelector('.cmdkey-number').value = '05';
  root().querySelector('.cmdkey-add').click();
  check('a guard reason on + Add is alerted and nothing is added', alerts.length === 1 && /CF05 clashes with CA05/.test(alerts[0]) && committed === null);
}

console.log('\n=== L4 commit paths: the raw keyword editor (jsdom webview) ===');
const SRC = src(
  R('R1'),
  dds({ name: 'F1', ref: 'R', len: 5, type: 'A', use: 'B', line: 2, col: 2 }),
  dds({ name: 'F2', len: 5, type: 'A', use: 'B', line: 3, col: 2 })
);
const posted = [];
const wvAlerts = [];
const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I122H.DSPF');
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

  check('fixture: F2 (no R in position 29) is on the canvas', selectField(3));
  rawAdd(3, 'DLTCHK', '');
  check('DLTCHK on a field without R is refused with the DDS wording, nothing posted', wvAlerts.length === 1 && /DLTCHK cannot be specified on field F2: it is valid only when R is specified in position 29/.test(wvAlerts[0]) && !lastEdit());
  rawAdd(3, 'DLTEDT', '');
  check('DLTEDT on a field without R is refused too', wvAlerts.length >= 1 && /DLTEDT cannot be specified on field F2/.test(wvAlerts[wvAlerts.length - 1]) && !lastEdit());
  check('fixture: F1 (R in position 29) is on the canvas', selectField(2));
  rawAdd(2, 'DLTCHK', '');
  check('DLTCHK on a field with R is accepted, no alert, and the text carries it', wvAlerts.length === 0 && !!lastEdit() && !!kwOf(fieldNamed(lastEdit().text, 'F1').keywords, 'DLTCHK'));
  check('F1 selectable again', selectField(2));
  rawAdd(2, 'DLTEDT', '');
  check('DLTEDT on a field with R is accepted', wvAlerts.length === 0 && !!lastEdit() && !!kwOf(fieldNamed(lastEdit().text, 'F1').keywords, 'DLTEDT'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

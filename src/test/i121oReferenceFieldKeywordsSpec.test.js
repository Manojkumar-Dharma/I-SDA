/**
 * i121oReferenceFieldKeywordsSpec.test.js
 *
 * Task I-121o - reference and database-inherit field keywords: ALIAS, REFFLD,
 * DLTCHK, DLTEDT, HLPID get RECORD_TYPES entries verified against
 * DDS_Keyword_V7r6.txt. The one consumer is the General keywords panel: HLPID's
 * "constant fields only" scope now comes from the spec's validOnlyOnConstantField
 * fact instead of a literal in the row table. This pins the entries to the
 * reference and the rendered rows to the old behaviour.
 *
 * Run with: node src/test/i121oReferenceFieldKeywordsSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const LOOKUP = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
const NAMES = ['ALIAS', 'REFFLD', 'DLTCHK', 'DLTEDT', 'HLPID'];
const S = KeywordSpec.RECORD_TYPES;

console.log('\n1. every keyword has an entry, citing the DDS Reference verbatim');
NAMES.forEach((n) => check(n + ' has a RECORD_TYPES entry with a citation', !!S[n] && typeof S[n].ddsReference === 'string'));
NAMES.forEach((n) => {
  S[n].ddsReference.split(/(?<=\.)\s+/).forEach((sentence) => {
    check(n + ': cited sentence is in the reference: "' + sentence.slice(0, 60) + '..."', REF.indexOf(sentence) >= 0);
  });
});

console.log('\n2. the facts each section states');
check('REFFLD, DLTCHK and DLTEDT are valid only with R in position 29', KeywordSpec.referenceFlagRequiredKeywords().join() === 'REFFLD,DLTCHK,DLTEDT');
check('ALIAS and HLPID do not require the reference flag', !KeywordSpec.requiresReferenceFlag('ALIAS') && !KeywordSpec.requiresReferenceFlag('HLPID'));
check('DLTCHK / DLTEDT take no parameters', S.DLTCHK.noParameters === true && S.DLTEDT.noParameters === true);
check('REFFLD / ALIAS / HLPID do not claim "no parameters"', !S.REFFLD.noParameters && !S.ALIAS.noParameters && !S.HLPID.noParameters);
check('DLTCHK deletes the validity group, DLTEDT the edit group, and those are the FIELD_KEYWORD_GROUPS delete keywords',
  KeywordSpec.fieldKeywordGroup(S.DLTCHK.deletes).deleteKeyword === 'DLTCHK' && KeywordSpec.fieldKeywordGroup(S.DLTEDT.deletes).deleteKeyword === 'DLTEDT');
check('REFFLD: field name always required, file part optional', S.REFFLD.fieldNameRequired === true && S.REFFLD.fileParameterOptional === true);
check('REFFLD: *SRC names the same source file and its target must precede', S.REFFLD.srcMeansSameSourceFile === true && S.REFFLD.srcFieldMustPrecede === true);
check('REFFLD parameter form is IBM\'s', S.REFFLD.parameterForm === 'REFFLD([record-format-name/]referenced-field-name [{*SRC | [library-name/]database-file-name}])');
check('ALIAS: alternative name unique, copied to a referencing field', S.ALIAS.alternativeNameMustBeUnique === true && S.ALIAS.copiedFromReferencedField === true);
check('HLPID: required numeric 1-999, unique within the record', S.HLPID.parameterRequired === true && S.HLPID.identifierRange.min === 1 && S.HLPID.identifierRange.max === 999 && S.HLPID.uniqueWithinRecord === true);
check('HLPID is the only constant-field-only (valid only on a constant) keyword', NAMES.filter((n) => KeywordSpec.validOnlyOnConstantField(n)).join() === 'HLPID');
check('HLPARA *CNST points at HLPID (the same fact, stated from the other side)', S.HLPARA.cnst.constantFieldNeedsKeyword === 'HLPID');
check('all five are in the "option indicators not valid" table', NAMES.every((n) => DspfWriter.noOptionIndicatorKeywordNames().indexOf(n) >= 0));
check('ALIAS is one of the keywords a push-button field allows', S.PSHBTNFLD.allowedKeywords ? S.PSHBTNFLD.allowedKeywords.indexOf('ALIAS') >= 0 : JSON.stringify(S.PSHBTNFLD).indexOf('"ALIAS"') >= 0);
check('HLPID is not the I-121m "supplies a constant value" fact', !KeywordSpec.isConstantFieldOnlyKeyword('HLPID'));

console.log('\n3. accessors');
const a = KeywordSpec.referenceFlagRequiredKeywords(); a.pop();
check('referenceFlagRequiredKeywords returns a fresh array', KeywordSpec.referenceFlagRequiredKeywords().length === 3);
const r = KeywordSpec.helpIdentifierRange(); r.max = 1;
check('helpIdentifierRange returns a fresh object, 1..999', KeywordSpec.helpIdentifierRange().max === 999 && KeywordSpec.helpIdentifierRange().min === 1);
check('accessors are case-sensitive (lower-case names are unknown)', !KeywordSpec.requiresReferenceFlag('reffld') && !KeywordSpec.validOnlyOnConstantField('hlpid'));
['constructor', '__proto__', 'toString', 'hasOwnProperty', '', undefined, null].forEach((n) => {
  check('accessors are safe for ' + String(n), KeywordSpec.requiresReferenceFlag(n) === false && KeywordSpec.validOnlyOnConstantField(n) === false);
});
check('the writer re-exports match the spec', DspfWriter.requiresReferenceFlag('DLTCHK') === true && DspfWriter.validOnlyOnConstantField('HLPID') === true
  && DspfWriter.helpIdentifierRange().max === 999 && DspfWriter.referenceFlagRequiredKeywords().join() === 'REFFLD,DLTCHK,DLTEDT');

console.log('\n4. sweep over KEYWORD-LOOKUP.json');
const allNames = Object.keys(LOOKUP).filter((n) => n.charAt(0) !== '*');
check('lookup has keywords', allNames.length > 100);
allNames.forEach((n) => {
  const wantRef = n === 'REFFLD' || n === 'DLTCHK' || n === 'DLTEDT';
  check(n + ': requiresReferenceFlag ' + wantRef, KeywordSpec.requiresReferenceFlag(n) === wantRef);
  check(n + ': validOnlyOnConstantField ' + (n === 'HLPID'), KeywordSpec.validOnlyOnConstantField(n) === (n === 'HLPID'));
});

console.log('\n5. REFFLD grammar: the six documented examples round-trip, and the I-113 form');
['ITEM', 'FMAT1/ITEM', 'ITEM FILEX', 'ITEM LIBY/FILEX', 'FMAT1/ITEM LIBY/FILEX', 'ITEM *SRC', 'CUSTNO LIB1/CUSTMAST'].forEach((p) => {
  const st = DspfWriter.parseReffldParams(p);
  check('REFFLD(' + p + ') parses with a field name', st.present && st.fieldName !== '');
  check('REFFLD(' + p + ') formats back unchanged', DspfWriter.formatReffldParams(st) === p);
});
check('a REFFLD with no field name is not written (the name is required)', DspfWriter.formatReffldParams({ fieldName: '', file: 'FILEX' }) === '');
check('turning the reference flag off drops REFFLD (it needs R in position 29)',
  !DspfWriter.applyReffldState([{ name: 'REFFLD', parameters: 'ITEM FILEX' }], 'ITEM', { isReference: false }).some((k) => k.name === 'REFFLD'));

console.log('\n6. General keywords panel: the HLPID row follows the spec');
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.document = dom.window.document; global.Node = dom.window.Node; global.window = dom.window;
  global.DspfWriter = DspfWriter;
  const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
  const rows = (dt, usage, isConstant) => (Helpers.generalFieldKeywordsHtml([], 'k', new Set(), dt, usage, [], isConstant, undefined).match(/-gen-[a-z]+/g) || [])
    .map((x) => x.slice(5)).filter((v, i, arr) => arr.indexOf(v) === i).sort().join();
  ['', 'A', 'P', 'S', 'B', 'F', 'L', 'Y'].forEach((dt) => ['B', 'I', 'O', 'H', 'M', 'P'].forEach((us) => {
    check('data type "' + dt + '" usage ' + us + ': HLPID row on a constant', rows(dt, us, true).split(',').indexOf('hlpid') >= 0 === (us !== 'M' && us !== 'P'));
    check('data type "' + dt + '" usage ' + us + ': no HLPID row on a named field', rows(dt, us, false).split(',').indexOf('hlpid') < 0);
  }));
  // Pinned row sets (96 combinations were compared old vs new for this slice; these two are the readable ones). OVRDTA is absent on a constant since I-165 (v0.10.322), not because of this slice.
  check('constant field, type A, usage B: the full row set is unchanged', rows('A', 'B', true) === 'alias,dft,hlpid,indtxt,noccsid,ovratr,putretain,text');
  check('named field, type A, usage B: the full row set is unchanged', rows('A', 'B', false) === 'alias,blkfold,chrid,cntfld,dft,dftval,fldcsrprg,igcalttyp,indtxt,noccsid,ovratr,ovrdta,putretain,text,wrdwrap');
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

/**
 * i121EditValidityGroupsSpec.test.js
 *
 * Task I-121 (edit/validity keyword groups slice) - the keyword families a
 * REF/REFFLD referenced field can replace or delete were three literal copies
 * (engine REFERENCE_EDIT_KEYWORDS / REFERENCE_VALIDITY_KEYWORDS + their
 * hard-coded DLTEDT / DLTCHK, and the writer's EDIT_KEYWORDS). They are now
 * KeywordSpec.fieldKeywordGroup('EDIT' | 'VALIDITY'). Pure refactor.
 *
 *  1. the spec facts, citations and copy semantics.
 *  2. the engine's REF inheritance behaves exactly as before (replace by an
 *     own keyword, delete via DLTEDT/DLTCHK, drop when the shape is overridden).
 *  3. the writer's edit-keyword getter/setter still treat EDTCDE/EDTWRD as one
 *     group and leave EDTMSK alone.
 *  4. keywordSpec.js loads before dspfEngine.js in both generated webviews.
 *
 * Run with: node src/test/i121EditValidityGroupsSpec.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

console.log('=== 1. spec ===');
{
  const e = KeywordSpec.fieldKeywordGroup('EDIT');
  const v = KeywordSpec.fieldKeywordGroup('VALIDITY');
  check('EDIT is EDTCDE + EDTWRD with DLTEDT as its delete keyword', JSON.stringify(e.keywords) === '["EDTCDE","EDTWRD"]' && e.deleteKeyword === 'DLTEDT');
  check('VALIDITY is CHECK/COMP/RANGE/VALUES/CHKMSGID with DLTCHK as its delete keyword', JSON.stringify(v.keywords) === '["CHECK","COMP","RANGE","VALUES","CHKMSGID"]' && v.deleteKeyword === 'DLTCHK');
  check('EDTMSK is deliberately not in EDIT', e.keywords.indexOf('EDTMSK') < 0);
  check('both carry a DDS citation naming their delete keyword', /^DLTEDT: .*EDTCDE or EDTWRD/.test(e.ddsReference) && /^DLTCHK: .*validity checking and CHKMSGID/.test(v.ddsReference));
  e.keywords.push('ZZZ'); e.deleteKeyword = 'X';
  const again = KeywordSpec.fieldKeywordGroup('EDIT');
  check('the accessor returns a copy (mutating it does not change the spec)', again.keywords.length === 2 && again.deleteKeyword === 'DLTEDT');
  check('an unknown group is null', KeywordSpec.fieldKeywordGroup('NOPE') === null);
}

console.log('=== 2. engine REF inheritance ===');
{
  const kw = (name, parameters) => ({ name: name, parameters: parameters || '' });
  const def = { dataType: 'S', length: 7, keywords: [kw('EDTCDE', 'J'), kw('CHECK', 'ME'), kw('RANGE', '1 9'), kw('DFT', "'0'")] };
  const field = (own) => Object.assign({ isReference: true, keywords: own || [] }, {});
  const names = (r) => r.keywords.map((k) => k.name).join();
  const f = DspfEngine.inheritedReferenceKeywords;
  if (typeof f !== 'function') { check('inheritedReferenceKeywords is exported (needed by this test)', false); }
  else {
    check('nothing owned: every referenced keyword is inherited', names(f(field(), def)) === 'EDTCDE,CHECK,RANGE,DFT');
    check('an own EDTWRD replaces the inherited editing keyword only', names(f(field([kw('EDTWRD', "' 0 '")]), def)) === 'CHECK,RANGE,DFT');
    check('DLTEDT removes the inherited editing keyword only', names(f(field([kw('DLTEDT')]), def)) === 'CHECK,RANGE,DFT');
    check('an own VALUES replaces ALL the inherited validity keywords', names(f(field([kw('VALUES', "'A' 'B'")]), def)) === 'EDTCDE,DFT');
    check('DLTCHK removes ALL the inherited validity keywords', names(f(field([kw('DLTCHK')]), def)) === 'EDTCDE,DFT');
    check('a keyword outside both families is unaffected by either delete keyword', names(f(field([kw('DLTEDT'), kw('DLTCHK')]), def)) === 'DFT');
  }
}

console.log('=== 3. writer edit-keyword group ===');
{
  const kw = (name, parameters) => ({ name: name, parameters: parameters || '' });
  check('getEditKeyword finds EDTCDE', DspfWriter.getEditKeyword([kw('EDTCDE', 'J')]).kind === 'EDTCDE');
  check('getEditKeyword finds EDTWRD', DspfWriter.getEditKeyword([kw('EDTWRD', "' 0 '")]).kind === 'EDTWRD');
  check('getEditKeyword ignores EDTMSK (it is not part of the group)', DspfWriter.getEditKeyword([kw('EDTMSK', "'  /  '")]).kind === '');
  const out = DspfWriter.setEditKeyword([kw('EDTCDE', 'J'), kw('EDTMSK', "'  /  '"), kw('DUP')], 'EDTWRD', "' 0 '");
  check('setEditKeyword swaps EDTCDE for EDTWRD and leaves EDTMSK and others alone',
    out.map((k) => k.name).sort().join() === 'DUP,EDTMSK,EDTWRD');
}

console.log('=== 4. script order in the generated webviews ===');
{
  const fs = require('fs');
  const html = require(path.join(__dirname, 'helpers/common.js')).webviewHtml('vscode-webview://fake', 'n', '     A          R R1\n', 'T.DSPF');
  const iSpec = html.indexOf('var FIELD_KEYWORD_GROUPS');
  const iEng = html.indexOf('root.DspfEngine = factory(');
  check('main webview: keywordSpec.js is inlined before dspfEngine.js', iSpec > 0 && iEng > 0 && iSpec < iEng);
  const menuSrc = fs.readFileSync(path.join(__dirname, '../buildMenuWebviewTemplate.js'), 'utf8');
  const a = menuSrc.indexOf('${keywordSpecJs}'), b = menuSrc.indexOf('${engineJs}');
  check('menu webview: the keywordSpec <script> comes before the engine <script>', a > 0 && b > 0 && a < b);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

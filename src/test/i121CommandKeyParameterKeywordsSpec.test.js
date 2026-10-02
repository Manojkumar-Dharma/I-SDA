/**
 * i121CommandKeyParameterKeywordsSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", command-key parameter
 * keywords slice. MNUCNL and MNUBARSW take a CA key only; SFLDROP, SFLENTER
 * and SFLFOLD take CAnn | CFnn. The writer's command-key claim collector
 * named all five inline; they are now keywordSpec.js's
 * COMMAND_KEY_PARAMETER_KEYWORDS and the collector loops over it.
 *
 * Run with: node src/test/i121CommandKeyParameterKeywordsSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check } = require('./helpers/harness');

const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const model = (fileKeywords, recordKeywords) => ({
  fileKeywords: fileKeywords || [],
  records: [{ name: 'R1', keywords: recordKeywords || [], fields: [] }]
});
const claimsOf = (m) => DspfWriter.commandKeyClaimsInModel(m).map((c) => c.keyword + ':' + c.type + c.number);

console.log('\nspec fact');
{
  check('five keywords, in declared order', KeywordSpec.commandKeyParameterKeywords().join() === 'MNUCNL,MNUBARSW,SFLDROP,SFLENTER,SFLFOLD');
  check('MNUCNL / MNUBARSW accept CA only', KeywordSpec.commandKeyParameterKeyTypes('MNUCNL').join() === 'CA' && KeywordSpec.commandKeyParameterKeyTypes('MNUBARSW').join() === 'CA');
  check('SFLDROP / SFLENTER / SFLFOLD accept CA and CF',
    ['SFLDROP', 'SFLENTER', 'SFLFOLD'].every((k) => KeywordSpec.commandKeyParameterKeyTypes(k).join() === 'CA,CF'));
  check('lookup is case-insensitive', KeywordSpec.commandKeyParameterKeyTypes('mnucnl').join() === 'CA');
  check('other keywords, non-strings and inherited names are not in the table',
    ['PSHBTNCHC', 'MOUBTN', 'ALTHELP', '', null, undefined, 3, 'constructor', 'toString'].every((k) => KeywordSpec.commandKeyParameterKeyTypes(k) === null));
  const t = KeywordSpec.commandKeyParameterKeyTypes('SFLDROP'); t.push('X'); t.shift();
  check('key-type accessor returns a fresh copy', KeywordSpec.commandKeyParameterKeyTypes('SFLDROP').join() === 'CA,CF');
  check('citations present and name the key types',
    /command attention \(CA\) key/.test(KeywordSpec.commandKeyParameterReference('MNUCNL')) && /CAnn \| CFnn/.test(KeywordSpec.commandKeyParameterReference('SFLFOLD')) && KeywordSpec.commandKeyParameterReference('ALTHELP') === null);
}

console.log('\nagrees with the alt keys\' exclusion lists');
{
  const ex = KeywordSpec.altKeyFileExclusions();
  Object.keys(ex).forEach((alt) => {
    const rel = {};
    ex[alt].excluded.forEach((x) => { rel[x.keyword] = x.relation; });
    KeywordSpec.commandKeyParameterKeywords().forEach((k) => {
      const types = KeywordSpec.commandKeyParameterKeyTypes(k);
      const want = types.length === 1 && types[0] === 'CA' ? 'caOnly' : 'any';
      check(alt + ' lists ' + k + ' as ' + want, rel[k] === want);
    });
  });
}

console.log('\nwriter\'s claim collector reads the fact');
{
  const one = (k, p) => DspfWriter.commandKeyClaimsInModel(model([kw(k, p)]));
  check('MNUCNL(CA03): one claim, type CA, number 3', (() => { const c = one('MNUCNL', 'CA03'); return c.length === 1 && c[0].type === 'CA' && Number(c[0].number) === 3 && c[0].label === 'MNUCNL(CA03)'; })());
  check('MNUBARSW(CA10): one CA claim', (() => { const c = one('MNUBARSW', 'CA10'); return c.length === 1 && c[0].type === 'CA'; })());
  check('MNUCNL(CF03): CF is not accepted, no claim', one('MNUCNL', 'CF03').length === 0);
  check('MNUBARSW(CF10): no claim', one('MNUBARSW', 'CF10').length === 0);
  check('MNUCNL with no parameter: no claim', one('MNUCNL', '').length === 0);
  ['SFLDROP', 'SFLENTER', 'SFLFOLD'].forEach((k) => {
    check(k + '(CA05) claims a CA key', (() => { const c = one(k, 'CA05'); return c.length === 1 && c[0].type === 'CA' && c[0].keyword === k; })());
    check(k + '(CF05) claims a CF key', (() => { const c = one(k, 'CF05'); return c.length === 1 && c[0].type === 'CF' && c[0].label === k + '(CF05)'; })());
    check(k + ' with a bad key: no claim', one(k, 'XX05').length === 0 && one(k, '').length === 0);
  });
  check('record-level and file-level both collected', claimsOf(model([kw('MNUCNL', 'CA03')], [kw('SFLDROP', 'CF04')])).length === 2);
  check('lowercase parameter still claims', one('SFLFOLD', 'cf09').length === 1);
}

console.log('\nend to end: the alt keys still clash with them');
{
  const althelp = kw('ALTHELP', 'CA05');
  const reason = (extra) => DspfWriter.altKeyFileExclusionNewConflictReason(model([]), model([althelp, extra]));
  check('ALTHELP(CA05) + MNUCNL(CA05) is a clash', !!reason(kw('MNUCNL', 'CA05')));
  check('ALTHELP(CA05) + MNUBARSW(CA05) is a clash', !!reason(kw('MNUBARSW', 'CA05')));
  check('ALTHELP(CA05) + SFLENTER(CF05) is a clash (key number, any type)', !!reason(kw('SFLENTER', 'CF05')));
  check('ALTHELP(CA05) + SFLDROP(CA05) is a clash', !!reason(kw('SFLDROP', 'CA05')));
  check('a different key number is not', !reason(kw('MNUCNL', 'CA06')) && !reason(kw('SFLFOLD', 'CF06')));
}

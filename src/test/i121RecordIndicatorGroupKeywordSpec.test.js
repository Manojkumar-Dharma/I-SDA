/**
 * i121RecordIndicatorGroupKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", record-indicator
 * keyword group slice. The ten keywords of real SDA's "Define Indicator
 * Keywords" screen (CLEAR / PAGEDOWN / PAGEUP / HOME / HELP / HLPRTN /
 * VLDCMDKEY / SETOF / CHANGE / INDTXT) were hand-kept in dspfWriter.js
 * (RECORD_INDICATOR_KEYWORD_NAMES, RECORD_INDICATOR_ALT_KIND) and again in
 * webviewClientHelpers.js (RECORD_INDICATOR_NO_CONDITIONING_KINDS, plus the
 * literal name list handed to dataKwWrap). They are now one fact per keyword
 * in keywordSpec.js (RECORD_INDICATOR_KEYWORDS); "takes no option indicators"
 * is the existing noOptionIndicators fact, so the two can never drift.
 *
 * Pure refactor: every derived value must equal the old literal.
 *
 * Run with: node src/test/i121RecordIndicatorGroupKeywordSpec.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

// The pre-refactor literals.
const OLD_NAMES = ['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'];
const OLD_ALT = { ROLLUP: 'PAGEDOWN', ROLLDOWN: 'PAGEUP' };
const OLD_NO_COND = ['VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'];
const kw = (name, parameters) => [{ name, parameters, conditions: [], raw: '', sourceLines: [] }];

console.log('\nspec table');
{
  check('names equal the old list, same order', JSON.stringify(KeywordSpec.recordIndicatorKeywordNames()) === JSON.stringify(OLD_NAMES));
  check('alternate spellings equal the old map', JSON.stringify(KeywordSpec.recordIndicatorAlternateKinds()) === JSON.stringify(OLD_ALT));
  check('only PAGEDOWN and PAGEUP carry alternate names', OLD_NAMES.filter((n) => KeywordSpec.RECORD_INDICATOR_KEYWORDS[n].alternateNames).join() === 'PAGEDOWN,PAGEUP');
  const names = KeywordSpec.recordIndicatorKeywordNames();
  names.push('X');
  const alt = KeywordSpec.recordIndicatorAlternateKinds(); alt.ROLLUP = 'X';
  check('accessors return fresh copies', KeywordSpec.recordIndicatorKeywordNames().length === 10 && KeywordSpec.recordIndicatorAlternateKinds().ROLLUP === 'PAGEDOWN');
  check('every entry has a non-empty DDS Reference citation', OLD_NAMES.every((n) => typeof KeywordSpec.RECORD_INDICATOR_KEYWORDS[n].ddsReference === 'string' && KeywordSpec.RECORD_INDICATOR_KEYWORDS[n].ddsReference.length > 5));
  check('the table holds exactly the ten keywords', Object.keys(KeywordSpec.RECORD_INDICATOR_KEYWORDS).length === 10);
}

console.log('\noption-indicator conditioning derives from the noOptionIndicators fact');
{
  OLD_NAMES.forEach((k) => {
    check(k + ': takes option indicators = ' + (OLD_NO_COND.indexOf(k) < 0), KeywordSpec.recordIndicatorTakesOptionIndicators(k) === (OLD_NO_COND.indexOf(k) < 0));
  });
  check('the four "no" kinds are exactly the ones with a noOptionIndicators fact', OLD_NAMES.filter((k) => KeywordSpec.noOptionIndicatorsFact(k)).join() === OLD_NO_COND.slice().sort((a, b) => OLD_NAMES.indexOf(a) - OLD_NAMES.indexOf(b)).join());
  check('a kind outside the group is conditionable, as before (also blank / null)', KeywordSpec.recordIndicatorTakesOptionIndicators('BOGUS') === true && KeywordSpec.recordIndicatorTakesOptionIndicators('') === true && KeywordSpec.recordIndicatorTakesOptionIndicators(null) === true);
  check('a file-level-only fact (HLPTITLE) does not make a record row non-conditionable', KeywordSpec.recordIndicatorTakesOptionIndicators('HLPTITLE') === true);
  check('DspfWriter exposes the same answers', OLD_NAMES.every((k) => DspfWriter.recordIndicatorTakesOptionIndicators(k) === KeywordSpec.recordIndicatorTakesOptionIndicators(k)) && JSON.stringify(DspfWriter.recordIndicatorKeywordNames()) === JSON.stringify(OLD_NAMES));
}

console.log('\nwriter behaviour unchanged');
{
  OLD_NAMES.forEach((k) => {
    const inst = DspfWriter.getRecordIndicatorInstances(kw(k, '25'));
    check(k + ': read as a record-indicator row', inst.length === 1 && inst[0].kind === k && inst[0].resp === '25');
  });
  check('ROLLUP reads back as PAGEDOWN', DspfWriter.getRecordIndicatorInstances(kw('ROLLUP', '25'))[0].kind === 'PAGEDOWN');
  check('ROLLDOWN reads back as PAGEUP', DspfWriter.getRecordIndicatorInstances(kw('ROLLDOWN', '26'))[0].kind === 'PAGEUP');
  check('an unrelated keyword is not read', DspfWriter.getRecordIndicatorInstances(kw('DSPATR', 'RI')).length === 0);
  const rewritten = DspfWriter.setRecordIndicatorInstances(kw('ROLLUP', '25'), [{ conditions: [], kind: 'PAGEDOWN', resp: '25', text: '' }]);
  check('re-writing replaces the legacy ROLLUP with canonical PAGEDOWN', rewritten.length === 1 && rewritten[0].name === 'PAGEDOWN' && rewritten[0].parameters === '25');
  check('clearing removes a legacy ROLLDOWN too', DspfWriter.setRecordIndicatorInstances(kw('ROLLDOWN', '26'), []).length === 0);
  check('an unknown kind writes nothing', DspfWriter.setRecordIndicatorInstances([], [{ conditions: [], kind: 'ROLLUP', resp: '25', text: '' }]).length === 0);
  check('INDTXT still folds its text into the parameter', DspfWriter.setRecordIndicatorInstances([], [{ conditions: [], kind: 'INDTXT', resp: '30', text: "it's" }])[0].parameters === "30 'it''s'");
}

console.log('\nwebview');
{
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml([], 'g', new Set());
  const html = document.getElementById('root').innerHTML;
  check('the panel is wrapped with all ten keyword names (data-kw)', OLD_NAMES.every((n) => html.indexOf(n) >= 0) && /data-kw="CLEAR PAGEDOWN PAGEUP HOME HELP HLPRTN VLDCMDKEY SETOF CHANGE INDTXT"/.test(html));
  OLD_NAMES.forEach((k, i) => {
    document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw(k, '25'), 'w' + i, new Set());
    check(k + ': Conditioning toggle ' + (OLD_NO_COND.indexOf(k) < 0 ? 'shown' : 'hidden'), !!document.querySelector('.repeat-inst-cond-toggle') === (OLD_NO_COND.indexOf(k) < 0));
  });
  document.getElementById('root').innerHTML = Helpers.recordIndicatorInstancesHtml(kw('CLEAR', '25'), 'd', new Set());
  const opts = Array.from(document.querySelectorAll('select option')).map((o) => o.value);
  check('the kind dropdown offers exactly the spec group (in the screen\'s own order)', OLD_NAMES.every((n) => opts.indexOf(n) >= 0) && opts.filter((v) => OLD_NAMES.indexOf(v) >= 0).length === 10);
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

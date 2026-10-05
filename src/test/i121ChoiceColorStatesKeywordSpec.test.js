/**
 * i121ChoiceColorStatesKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", choice color-state
 * keywords slice. CHCAVAIL / CHCUNAVAIL / CHCSLT were the writer's
 * CHOICE_COLOR_STATE_KEYWORDS (only its doc comments used it), and the
 * webview hard-coded which of them a push-button field may show as
 * ['avail', 'unavail'] in two call sites - a second copy of what PSHBTNFLD's
 * own whitelist in keywordSpec.js already says (CHCAVAIL, CHCUNAVAIL; no
 * CHCSLT). The names are now keywordSpec.js's CHOICE_COLOR_STATE_KEYWORDS and
 * the push-button subset is asked of that whitelist.
 *
 * Pure refactor: every derived value must equal the old literal.
 *
 * Run with: node src/test/i121ChoiceColorStatesKeywordSpec.test.js
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

const kw = (name, parameters) => [{ name, parameters, conditions: [], raw: '', sourceLines: [] }];

console.log('\nspec table');
{
  check('names equal the old list, same order', KeywordSpec.choiceColorStateKeywords().join() === 'CHCAVAIL,CHCUNAVAIL,CHCSLT');
  check('every entry has a non-empty DDS Reference citation', KeywordSpec.choiceColorStateKeywords().every((k) => KeywordSpec.CHOICE_COLOR_STATE_KEYWORDS[k].ddsReference.length > 20));
  check('only CHCSLT mentions no push button (the reference says menu bar or selection field)', !/push button/.test(KeywordSpec.CHOICE_COLOR_STATE_KEYWORDS.CHCSLT.ddsReference) && /push button/.test(KeywordSpec.CHOICE_COLOR_STATE_KEYWORDS.CHCAVAIL.ddsReference) && /push button/.test(KeywordSpec.CHOICE_COLOR_STATE_KEYWORDS.CHCUNAVAIL.ddsReference));
  const n = KeywordSpec.choiceColorStateKeywords(); n.push('X');
  check('accessor returns a fresh copy', KeywordSpec.choiceColorStateKeywords().length === 3);
}

console.log('\nallowed-on, asked of the whitelist');
{
  check('PSHBTNFLD allows CHCAVAIL and CHCUNAVAIL but not CHCSLT (the old [avail, unavail])', KeywordSpec.choiceColorStateKeywordsAllowedOn('PSHBTNFLD').join() === 'CHCAVAIL,CHCUNAVAIL');
  check('SNGCHCFLD / MLTCHCFLD (no whitelist) allow all three', ['SNGCHCFLD', 'MLTCHCFLD'].every((t) => KeywordSpec.choiceColorStateKeywordsAllowedOn(t).join() === 'CHCAVAIL,CHCUNAVAIL,CHCSLT'));
  check('a record type with a whitelist that omits them allows none (SFL)', KeywordSpec.choiceColorStateKeywordsAllowedOn('SFL').length === 0);
  check('unknown / blank / null record type behaves like "no whitelist"', ['NOSUCH', '', null, undefined].every((t) => KeywordSpec.choiceColorStateKeywordsAllowedOn(t).length === 3));
  check('PSHBTNFLD\'s whitelist and the allowed-on answer cannot disagree', KeywordSpec.choiceColorStateKeywords().every((k) => (KeywordSpec.choiceColorStateKeywordsAllowedOn('PSHBTNFLD').indexOf(k) >= 0) === (KeywordSpec.RECORD_TYPES.PSHBTNFLD.whitelist.indexOf(k) >= 0)));
  check('DspfWriter exposes the same answers', DspfWriter.choiceColorStateKeywords().join() === 'CHCAVAIL,CHCUNAVAIL,CHCSLT' && DspfWriter.choiceColorStateKeywordsAllowedOn('PSHBTNFLD').join() === 'CHCAVAIL,CHCUNAVAIL');
}

console.log('\nwriter behaviour unchanged');
{
  KeywordSpec.choiceColorStateKeywords().forEach((k) => {
    const s = DspfWriter.getChoiceColorState(kw(k, '(*COLOR RED) (*DSPATR HI UL)'), k);
    check(k + ': read as a color state', s.present && s.color === 'RED' && s.attrs.join() === 'HI,UL');
    const w = DspfWriter.setChoiceColorState([], k, 'BLU', ['RI']);
    check(k + ': written as (*COLOR) (*DSPATR)', w.length === 1 && w[0].name === k && w[0].parameters === '(*COLOR BLU) (*DSPATR RI)');
  });
}

console.log('\nwebview');
{
  check('the push-button state keys equal the old ["avail", "unavail"]', Helpers.pshbtnChoiceColorStateKeys().join() === 'avail,unavail');
  const root = document.getElementById('root');
  root.innerHTML = Helpers.choiceColorStatesHtml([{ name: 'PSHBTNFLD', parameters: '', conditions: [] }, { name: 'PSHBTNCHC', parameters: "1 'OK'", conditions: [] }], 'x', new Set(), Helpers.pshbtnChoiceColorStateKeys(), []);
  const has = (key) => !!root.querySelector('#x-ccs-' + key + '-on');
  check('a push-button field is offered Available and Unavailable, not Selected', has('avail') && has('unavail') && !has('slt'));
  root.innerHTML = Helpers.choiceColorStatesHtml([{ name: 'SNGCHCFLD', parameters: '', conditions: [] }, { name: 'CHOICE', parameters: "1 'Undo'", conditions: [] }], 'y', new Set(), undefined, [{ name: 'PULLDOWN', parameters: '(*NOSLTIND)', conditions: [] }]);
  const hasY = (key) => !!root.querySelector('#y-ccs-' + key + '-on');
  // Task I-172: the rows are offered once their companion keywords are on the field / record.
  check('a selection field is still offered all three', hasY('avail') && hasY('unavail') && hasY('slt'));
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

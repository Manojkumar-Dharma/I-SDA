/**
 * i121ChoiceSelectionParamsKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SNGCHCFLD/MLTCHCFLD
 * selection-type-parameters slice. The *param flags each keyword's own DDS
 * format string offers were three hand-kept copies (dspfWriter.js
 * CHOICE_SELECTION_FLAGS and SNGCHCFLD_ONLY_FLAGS, the webview's
 * SNGCHCFLD_ONLY_GROUPS). They are now one `selectionParameters` fact on
 * keywordSpec.js's SNGCHCFLD and MLTCHCFLD entries; MLTCHCFLD has no
 * AUTOSLT / AUTOENT family at all.
 *
 * Pure refactor: the derived lists must equal the old literals exactly.
 *
 * Run with: node src/test/i121ChoiceSelectionParamsKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const kw = (name, parameters) => [{ name: name, parameters: parameters, conditions: [], raw: '', sourceLines: [] }];
const params = (keywords, name) => (keywords.find((k) => k.name === name) || {}).parameters;

// The pre-refactor literals.
const OLD_ALL = ['*RSTCSR', '*NORSTCSR', '*SLTIND', '*NOSLTIND', '*AUTOSLT', '*NOAUTOSLT', '*AUTOSLTENH', '*AUTOENT', '*NOAUTOENT', '*AUTOENTNN'];
const OLD_SNG_ONLY = ['*AUTOSLT', '*NOAUTOSLT', '*AUTOSLTENH', '*AUTOENT', '*NOAUTOENT', '*AUTOENTNN'];

console.log('\nspec entries');
{
  const S = KeywordSpec.RECORD_TYPES.SNGCHCFLD, M = KeywordSpec.RECORD_TYPES.MLTCHCFLD;
  check('both entries exist', !!S && !!M);
  check('each carries only its own fact', Object.keys(S).join() === 'selectionParameters' && Object.keys(M).join() === 'selectionParameters');
  check('citations are the format strings', /^SNGCHCFLD\[\(/.test(S.selectionParameters.ddsReference) && /^MLTCHCFLD\[\(/.test(M.selectionParameters.ddsReference));
  check('SNGCHCFLD groups', S.selectionParameters.groups.map((g) => g.name).join() === 'rstcsr,sltind,autoslt,autoent');
  check('MLTCHCFLD groups', M.selectionParameters.groups.map((g) => g.name).join() === 'rstcsr,sltind');
  check('MLTCHCFLD names no AUTOSLT / AUTOENT flag', !M.selectionParameters.groups.some((g) => g.flags.some((f) => /AUTO/.test(f))));
  check('only these two keywords carry the fact', Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].selectionParameters).join() === 'SNGCHCFLD,MLTCHCFLD');
}

console.log('\naccessors');
{
  check('all flags equal the old CHOICE_SELECTION_FLAGS, same order', JSON.stringify(KeywordSpec.choiceSelectionAllFlags()) === JSON.stringify(OLD_ALL));
  check('MLTCHCFLD-not-offered equals the old SNGCHCFLD_ONLY_FLAGS', JSON.stringify(KeywordSpec.choiceSelectionFlagsNotOffered('MLTCHCFLD')) === JSON.stringify(OLD_SNG_ONLY));
  check('SNGCHCFLD has nothing not offered', KeywordSpec.choiceSelectionFlagsNotOffered('SNGCHCFLD').length === 0);
  check('unknown keyword -> [] for groups and not-offered', KeywordSpec.choiceSelectionFlagGroups('NOSUCH').length === 0 && KeywordSpec.choiceSelectionFlagsNotOffered('NOSUCH').length === 0 && KeywordSpec.choiceSelectionFlagsNotOffered('').length === 0);
  check('exclusive groups: SNGCHCFLD autoslt+autoent, MLTCHCFLD none', KeywordSpec.choiceSelectionExclusiveGroups('SNGCHCFLD').join() === 'autoslt,autoent' && KeywordSpec.choiceSelectionExclusiveGroups('MLTCHCFLD').length === 0);
  const g = KeywordSpec.choiceSelectionFlagGroups('SNGCHCFLD'); g[0].flags.push('X'); g.pop();
  check('accessors return copies', KeywordSpec.choiceSelectionFlagGroups('SNGCHCFLD').length === 4 && KeywordSpec.choiceSelectionFlagGroups('SNGCHCFLD')[0].flags.length === 2);
  check('DspfWriter.sngchcfldOnlyFlagGroups is the exclusive list', DspfWriter.sngchcfldOnlyFlagGroups().join() === 'autoslt,autoent');
}

console.log('\nwriter behaviour unchanged');
{
  // getChoiceSelectionType recognizes every old flag on either keyword.
  OLD_ALL.forEach((f) => {
    check(f + ' read on SNGCHCFLD', DspfWriter.getChoiceSelectionType(kw('SNGCHCFLD', f)).flags.join() === f);
    check(f + ' read on MLTCHCFLD', DspfWriter.getChoiceSelectionType(kw('MLTCHCFLD', f)).flags.join() === f);
  });
  check('unknown flag not read', DspfWriter.getChoiceSelectionType(kw('SNGCHCFLD', '*BOGUS')).flags.length === 0);
  // setChoiceSelectionType: SNGCHCFLD keeps everything, MLTCHCFLD drops the six.
  const all = OLD_ALL.slice();
  check('SNGCHCFLD keeps every flag', params(DspfWriter.setChoiceSelectionType([], { kind: 'SNGCHCFLD', flags: all }), 'SNGCHCFLD') === all.join(' '));
  check('MLTCHCFLD drops the AUTOSLT / AUTOENT family', params(DspfWriter.setChoiceSelectionType([], { kind: 'MLTCHCFLD', flags: all }), 'MLTCHCFLD') === '*RSTCSR *NORSTCSR *SLTIND *NOSLTIND');
  check('MLTCHCFLD keeps an unlisted flag (only the six are dropped)', params(DspfWriter.setChoiceSelectionType([], { kind: 'MLTCHCFLD', flags: ['*BOGUS', '*AUTOENT'] }), 'MLTCHCFLD') === '*BOGUS');
  check('layout parameters still written after the flags', params(DspfWriter.setChoiceSelectionType([], { kind: 'MLTCHCFLD', flags: ['*RSTCSR', '*AUTOSLT'], numCol: '3', gutter: '2' }), 'MLTCHCFLD') === '*RSTCSR (*NUMCOL 3) (*GUTTER 2)');
  check('blank kind removes the keyword', DspfWriter.setChoiceSelectionType(kw('SNGCHCFLD', '*RSTCSR'), { kind: '', flags: [] }).length === 0);
}

console.log('\nwebview: radio groups still hidden for MLTCHCFLD / unset type');
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.window = dom.window;
  global.DspfWriter = DspfWriter;
  const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
  const render = (keywords) => {
    document.getElementById('root').innerHTML = Helpers.choiceSelectionTypeHtml(keywords, 'x');
    return (g) => !!document.querySelector('.x-cst-' + g);
  };
  let has = render(kw('SNGCHCFLD', '*RSTCSR'));
  check('SNGCHCFLD shows all four groups', has('rstcsr') && has('sltind') && has('autoslt') && has('autoent'));
  has = render(kw('MLTCHCFLD', '*RSTCSR'));
  check('MLTCHCFLD hides auto-select and auto-enter', !has('autoslt') && !has('autoent'));
  check('MLTCHCFLD still shows cursor restriction and select indicator', has('rstcsr') && has('sltind'));
  has = render([]);
  check('no type selected hides auto-select and auto-enter', !has('autoslt') && !has('autoent'));
  // Every webview radio group's flags are exactly a spec group's flags.
  document.getElementById('root').innerHTML = Helpers.choiceSelectionTypeHtml(kw('SNGCHCFLD', ''), 'x');
  KeywordSpec.choiceSelectionFlagGroups('SNGCHCFLD').forEach((g) => {
    const sel = document.querySelector('.x-cst-' + g.name);
    const html = sel ? sel.outerHTML : '';
    check(g.name + ': every spec flag is offered in the panel', g.flags.every((f) => html.indexOf(f) >= 0));
  });
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

/**
 * i121ChoiceSelectionRadioGroupsSpec.test.js
 *
 * Task I-121 - choice selection-type radio groups slice. The webview's
 * "Define Choice Selection Type" panel hand-kept CHOICE_SELECTION_RADIO_GROUPS
 * (four groups, each with its *param flags). Which flags make up each group,
 * and in what order, is keywordSpec.js's SNGCHCFLD `selectionParameters`
 * fact; the webview now derives its groups from it (via
 * DspfWriter.choiceSelectionFlagGroups) and keeps only the screen wording.
 *
 * Pure refactor: the rendered panel must equal the old literals exactly.
 *
 * Run with: node src/test/i121ChoiceSelectionRadioGroupsSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

// The pre-refactor literal, verbatim.
const OLD_GROUPS = [
  { name: 'rstcsr', label: 'Cursor restriction', options: [['', '(not specified)'], ['*RSTCSR', 'Restrict cursor to field'], ['*NORSTCSR', 'No restriction']] },
  { name: 'sltind', label: 'Select indicator', options: [['', '(not specified)'], ['*SLTIND', 'Display select indicator'], ['*NOSLTIND', 'No display']] },
  { name: 'autoslt', label: 'Auto-select', options: [['', '(not specified)'], ['*AUTOSLT', 'Select choice upon pressing Enter'], ['*NOAUTOSLT', 'No auto-select'], ['*AUTOSLTENH', 'Only with enhanced controller']] },
  { name: 'autoent', label: 'Auto-enter', options: [['', '(not specified)'], ['*AUTOENT', 'Enable auto-enter on all display'], ['*NOAUTOENT', 'No auto-enter'], ['*AUTOENTNN', 'Only with no numeric selection']] },
];

console.log('\nwriter re-export');
check('DspfWriter.choiceSelectionFlagGroups is the spec accessor', DspfWriter.choiceSelectionFlagGroups === KeywordSpec.choiceSelectionFlagGroups);
check('SNGCHCFLD offers the four groups in panel order', DspfWriter.choiceSelectionFlagGroups('SNGCHCFLD').map((g) => g.name).join() === OLD_GROUPS.map((g) => g.name).join());
check('each spec group lists exactly the old literal flags, in order',
  DspfWriter.choiceSelectionFlagGroups('SNGCHCFLD').every((g, i) => g.flags.join() === OLD_GROUPS[i].options.slice(1).map((o) => o[0]).join()));
check('MLTCHCFLD groups are the first two of the panel groups',
  DspfWriter.choiceSelectionFlagGroups('MLTCHCFLD').map((g) => g.name).join() === 'rstcsr,sltind');
check('a keyword with no fact has no groups', DspfWriter.choiceSelectionFlagGroups('DUP').length === 0);

console.log('\nrendered panel equals the old literal');
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.window = dom.window;
  global.DspfWriter = DspfWriter;
  const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
  const kw = (name, parameters) => [{ name: name, parameters: parameters, conditions: [], raw: '', sourceLines: [] }];
  const root = document.getElementById('root');
  root.innerHTML = Helpers.choiceSelectionTypeHtml(kw('SNGCHCFLD', ''), 'x');
  OLD_GROUPS.forEach((g) => {
    const sel = root.querySelector('.x-cst-' + g.name);
    check(g.name + ': select is rendered', !!sel);
    if (!sel) return;
    const opts = Array.from(sel.querySelectorAll('option')).map((o) => [o.getAttribute('value'), o.textContent]);
    check(g.name + ': options (value + text, in order) equal the old literal', JSON.stringify(opts) === JSON.stringify(g.options));
    const label = sel.closest('.field-row').querySelector('label').textContent;
    check(g.name + ': label is "' + g.label + '"', label === g.label);
  });
  check('exactly the four groups are rendered, in panel order',
    Array.from(root.querySelectorAll('select[class^="x-cst-"]')).map((s) => s.className.replace('x-cst-', '')).join() === 'rstcsr,sltind,autoslt,autoent');

  // Current selection still reads from the keyword's flags.
  root.innerHTML = Helpers.choiceSelectionTypeHtml(kw('SNGCHCFLD', '*NORSTCSR *AUTOSLTENH *NOAUTOENT'), 'x');
  const sel = (g) => root.querySelector('.x-cst-' + g).value;
  check('existing flags preselect their option', sel('rstcsr') === '*NORSTCSR' && sel('autoslt') === '*AUTOSLTENH' && sel('autoent') === '*NOAUTOENT' && sel('sltind') === '');

  // MLTCHCFLD / no type: auto groups still not rendered.
  root.innerHTML = Helpers.choiceSelectionTypeHtml(kw('MLTCHCFLD', '*SLTIND'), 'x');
  check('MLTCHCFLD renders only the two groups it offers', !!root.querySelector('.x-cst-rstcsr') && !!root.querySelector('.x-cst-sltind') && !root.querySelector('.x-cst-autoslt') && !root.querySelector('.x-cst-autoent'));

  // The panel can only offer what the spec offers: every rendered flag is a spec flag.
  root.innerHTML = Helpers.choiceSelectionTypeHtml(kw('SNGCHCFLD', ''), 'x');
  const offered = Array.from(root.querySelectorAll('select[class^="x-cst-"] option')).map((o) => o.getAttribute('value')).filter(Boolean);
  check('every offered flag is a spec flag', offered.every((f) => KeywordSpec.choiceSelectionAllFlags().indexOf(f) >= 0) && offered.length === KeywordSpec.choiceSelectionAllFlags().length);
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

/**
 * i27HlptitleRepeatableInstances.test.js
 *
 * Task I-27 - record-level HLPTITLE's own documented repeatability
 * ("Option indicators are allowed on record-level HLPTITLE keywords and
 * must be specified on each HLPTITLE keyword if the record contains
 * multiple HLPTITLE keywords. You can specify a maximum of 15 HLPTITLE
 * keywords on a record if all have option indicators.") wasn't modeled by
 * I-21's own fix (getFileQuotedText/setFileQuotedText gaining a
 * `conditions` parameter), which correctly let ONE record-level HLPTITLE
 * be conditioned but had no way to represent a second one at all.
 *
 * Fix: record-level HLPTITLE is rebuilt as a genuine repeatable,
 * independently-conditioned instance list
 * (hlptitleInstanceRowHtml/hlptitlePanelHtml/wireHlptitlePanel in
 * webviewClientHelpers.js), reusing the same generic
 * DspfWriter.getRepeatableKeywordInstances/setRepeatableKeywordInstances
 * primitive Task I-17 built for MNUBARDSP - HLPTITLE needed no bespoke
 * get/set pair since (unlike MNUBARDSP) it's a single plain quoted-text
 * parameter with no per-record-type shape variation.
 *
 * Covers:
 *  - Reading/writing the repeatable list itself (add, edit text, condition
 *    an instance, remove one, multiple instances coexisting).
 *  - The quoting round-trip (quoteDdsLiteral/unquoteDdsLiteral) for each
 *    instance's own text, including an embedded single quote.
 *  - "+ Add" seeding a non-blank placeholder (a blank HLPTITLE would
 *    serialize as invalid bare `HLPTITLE`, no parens).
 *  - IBM's own worked example shape: two instances, complementary
 *    indicators (90/N90) each selecting a different title variant.
 *
 * Run with: node src/test/i27HlptitleRepeatableInstances.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.DspfWriter = DspfWriter;

const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

console.log('hlptitlePanelHtml - empty state, and reading an existing single unconditioned instance');
{
  document.getElementById('root').innerHTML = Helpers.hlptitlePanelHtml([], 'p1', new Set());
  check('no instances yet - empty state shown', document.getElementById('p1-hlptitle-rep-instances').textContent.indexOf('None defined.') >= 0);
  check('a non-blocking hint about the "all optioned if more than one" rule is shown', document.getElementById('root').textContent.indexOf('EVERY instance carries option indicators') >= 0);

  const kw = [{ name: 'HLPTITLE', parameters: "'Sample Screen 1'", conditions: [], raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.hlptitlePanelHtml(kw, 'p2', new Set());
  const textEl = document.querySelector('.p2-hlptitle-rep-inst0-text');
  check('the existing instance renders with its own (unquoted) text', !!textEl && textEl.value === 'Sample Screen 1');
  check('it starts with no Conditioning shown as already set (0)', /Conditioning(?!\s*\(\d)/.test(document.querySelector('.repeat-inst-cond-toggle[data-prefix="p2-hlptitle-rep"]').textContent));
}

console.log('\nwireHlptitlePanel - "+ Add" seeds a non-blank placeholder instance, not a blank one');
{
  const kw = [];
  const expandedSet = new Set();
  const p = 'padd';
  document.getElementById('root').innerHTML = Helpers.hlptitlePanelHtml(kw, p, expandedSet);
  let committed = null;
  Helpers.wireHlptitlePanel(function () { return kw; }, function (next) { committed = next; }, p, expandedSet, function () {});

  document.querySelector('.repeat-inst-add[data-prefix="' + p + '-hlptitle-rep"]').dispatchEvent(new dom.window.Event('click'));

  check('a new instance was committed', !!committed);
  const hlptitleKw = committed && committed.find((k) => k.name === 'HLPTITLE');
  check('it seeded a non-blank placeholder text, not a blank HLPTITLE()', !!hlptitleKw && hlptitleKw.parameters === "'Help title'");
  check('it starts unconditioned', hlptitleKw && hlptitleKw.conditions.length === 0);
}

console.log('\nwireHlptitlePanel - editing an instance\'s text round-trips through quoteDdsLiteral/unquoteDdsLiteral, including an embedded single quote');
{
  const kw = [{ name: 'HLPTITLE', parameters: "'Old title'", conditions: [], raw: '', sourceLines: [] }];
  const expandedSet = new Set();
  const p = 'pedit';
  document.getElementById('root').innerHTML = Helpers.hlptitlePanelHtml(kw, p, expandedSet);
  let committed = null;
  Helpers.wireHlptitlePanel(function () { return kw; }, function (next) { committed = next; }, p, expandedSet, function () {});

  const textEl = document.querySelector('.' + p + '-hlptitle-rep-inst0-text');
  textEl.value = "Customer's order status";
  textEl.dispatchEvent(new dom.window.Event('change'));

  const hlptitleKw = committed.find((k) => k.name === 'HLPTITLE');
  check("an embedded single quote is doubled per DDS's own quoting convention", hlptitleKw.parameters === "'Customer''s order status'");
  check('reading it back through the same panel unquotes it correctly', DspfWriter.unquoteDdsLiteral(hlptitleKw.parameters) === "Customer's order status");
}

console.log('\nwireHlptitlePanel - conditioning one instance does not disturb another, independently-conditioned instance');
{
  const kw = [
    { name: 'HLPTITLE', parameters: "'Sample Screen 1'", conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '90', not: false }] }], raw: '', sourceLines: [] },
    { name: 'HLPTITLE', parameters: "'Sample Screen 2'", conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '90', not: true }] }], raw: '', sourceLines: [] },
  ];
  const expandedSet = new Set();
  const p = 'pcond';
  document.getElementById('root').innerHTML = Helpers.hlptitlePanelHtml(kw, p, expandedSet);
  const toggles = document.querySelectorAll('.repeat-inst-cond-toggle[data-prefix="' + p + '-hlptitle-rep"]');
  check('both instances show a Conditioning(1) summary - IBM\'s own 90/N90 worked example', toggles.length === 2 && Array.from(toggles).every((t) => /Conditioning\s*\(1\)/.test(t.textContent)));

  let committed = null;
  Helpers.wireHlptitlePanel(function () { return kw; }, function (next) { committed = next; }, p, expandedSet, function () {});
  const textEl0 = document.querySelector('.' + p + '-hlptitle-rep-inst0-text');
  textEl0.value = 'Sample Screen 1 revised';
  textEl0.dispatchEvent(new dom.window.Event('change'));

  const hlptitleKws = committed.filter((k) => k.name === 'HLPTITLE');
  check('editing the first instance\'s text leaves it conditioned on indicator 90', hlptitleKws.find((k) => k.parameters === "'Sample Screen 1 revised'").conditions[0].indicators[0].number === '90');
  check('the second instance (N90, unedited) is completely untouched', hlptitleKws.some((k) => k.parameters === "'Sample Screen 2'" && k.conditions[0].indicators[0].not === true));
}

console.log('\nwireHlptitlePanel - removing one instance leaves the other alone');
{
  const kw = [
    { name: 'HLPTITLE', parameters: "'Sample Screen 1'", conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '90', not: false }] }], raw: '', sourceLines: [] },
    { name: 'HLPTITLE', parameters: "'Sample Screen 2'", conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '90', not: true }] }], raw: '', sourceLines: [] },
    { name: 'CLEAR', parameters: '10', conditions: [], raw: '', sourceLines: [] },
  ];
  const expandedSet = new Set();
  const p = 'premove';
  document.getElementById('root').innerHTML = Helpers.hlptitlePanelHtml(kw, p, expandedSet);
  let committed = null;
  Helpers.wireHlptitlePanel(function () { return kw; }, function (next) { committed = next; }, p, expandedSet, function () {});

  document.querySelector('.repeat-inst-remove[data-prefix="' + p + '-hlptitle-rep"][data-idx="0"]').dispatchEvent(new dom.window.Event('click'));

  const hlptitleKws = committed.filter((k) => k.name === 'HLPTITLE');
  check('exactly one HLPTITLE instance remains', hlptitleKws.length === 1 && hlptitleKws[0].parameters === "'Sample Screen 2'");
  check('an entirely unrelated keyword (CLEAR) on the same record is untouched', !!committed.find((k) => k.name === 'CLEAR' && k.parameters.trim() === '10'));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

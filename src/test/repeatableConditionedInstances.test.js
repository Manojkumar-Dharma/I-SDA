/**
 * repeatableConditionedInstances.test.js
 *
 * Direct unit coverage for Task L1 - the "multi-instance conditioned
 * keywords" foundation. Covers both halves:
 *
 *  - DspfWriter.getRepeatableKeywordInstances/setRepeatableKeywordInstances
 *    (dspfWriter.js) - the generalization of Task R3's
 *    getIndicatorTextRows/setIndicatorTextRows from "one bare indicator per
 *    instance" to "each instance keeps its own full conditions array".
 *
 *  - WebviewClientHelpers.repeatableConditionedInstancesHtml/
 *    wireRepeatableConditionedInstances (webviewClientHelpers.js) - the
 *    matching generic UI shell (repeatable list + per-instance Conditioning
 *    accordion + add/remove), exercised in jsdom so the wiring is actually
 *    RUN (click handlers, change handlers) rather than just string-matched
 *    out of the generated HTML - same rationale dspfWebview.test.js/
 *    menuWebview.test.js already follow for the full webview.
 *
 * No picker panel wires into either piece yet (that's L1a/L1b/L1c) - this
 * file tests the foundation in isolation, plus one end-to-end scenario
 * chaining both layers together the way a future picker will.
 *
 * Run with: node src/test/repeatableConditionedInstances.test.js
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

// ===========================================================================
// Writer layer: getRepeatableKeywordInstances / setRepeatableKeywordInstances
// ===========================================================================

console.log('getRepeatableKeywordInstances / setRepeatableKeywordInstances - basic round-trip');
{
  const NAMES = ['COLOR'];
  let kw = [];
  check('none present -> empty instance list', DspfWriter.getRepeatableKeywordInstances(kw, NAMES).length === 0);

  const cond10 = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }];
  const cond20 = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '20', not: false }] }];

  kw = DspfWriter.setRepeatableKeywordInstances(kw, NAMES, [
    { name: 'COLOR', parameters: 'RED', conditions: cond10 },
    { name: 'COLOR', parameters: 'GRN', conditions: cond20 },
  ]);
  check('two independent COLOR keywords written', kw.filter((k) => k.name === 'COLOR').length === 2);
  check('first COLOR carries its own conditions', kw[0].conditions[0].indicators[0].number === '10');
  check('second COLOR carries its OWN, different conditions', kw[1].conditions[0].indicators[0].number === '20');
  check('first COLOR parameters preserved', kw[0].parameters === 'RED');
  check('second COLOR parameters preserved', kw[1].parameters === 'GRN');

  const instances = DspfWriter.getRepeatableKeywordInstances(kw, NAMES);
  check('round-trips 2 instances back out', instances.length === 2);
  check('round-tripped conditions match source order (10 then 20)',
    instances[0].conditions[0].indicators[0].number === '10' &&
    instances[1].conditions[0].indicators[0].number === '20');
}

console.log('\ngetRepeatableKeywordInstances / setRepeatableKeywordInstances - multiple keyword names sharing one repeatable group');
{
  const NAMES = ['ERRMSG', 'ERRMSGID'];
  let kw = [];
  kw = DspfWriter.setRepeatableKeywordInstances(kw, NAMES, [
    { name: 'ERRMSG', parameters: "'First try'", conditions: [] },
    { name: 'ERRMSGID', parameters: 'MSG0001 MYMSGF', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '30', not: false }] }] },
  ]);
  check('both keyword names coexist as separate instances', kw.filter((k) => NAMES.indexOf(k.name) >= 0).length === 2);
  const instances = DspfWriter.getRepeatableKeywordInstances(kw, NAMES);
  check('ERRMSG instance unconditioned', instances.find((i) => i.name === 'ERRMSG').conditions.length === 0);
  check('ERRMSGID instance keeps its indicator', instances.find((i) => i.name === 'ERRMSGID').conditions[0].indicators[0].number === '30');

  // Unrelated keywords on the same array are left completely alone.
  kw = kw.concat([{ name: 'DSPATR', parameters: 'HI', conditions: [], raw: '', sourceLines: [] }]);
  kw = DspfWriter.setRepeatableKeywordInstances(kw, NAMES, []);
  check('clearing all instances removes only the named keywords', kw.length === 1 && kw[0].name === 'DSPATR');
}

console.log('\ngetRepeatableKeywordInstances / setRepeatableKeywordInstances - malformed entries are skipped, not thrown');
{
  const NAMES = ['COLOR'];
  let kw = DspfWriter.setRepeatableKeywordInstances([], NAMES, [
    { name: '', parameters: 'RED', conditions: [] },      // blank name
    { name: 'DSPATR', parameters: 'HI', conditions: [] },  // not in `names`
    null,                                                    // garbage entry
    { name: 'COLOR', parameters: 'BLU', conditions: [] },   // the only valid one
  ]);
  check('only the one valid instance survives', kw.length === 1 && kw[0].name === 'COLOR' && kw[0].parameters === 'BLU');
}

// ===========================================================================
// Client layer: repeatableConditionedInstancesHtml / wireRepeatableConditionedInstances
// ===========================================================================

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;

// webviewClientHelpers.js is required AFTER `global.document` exists, but its
// wire* functions reference the bare `document` global at CALL time (not
// require time), so require order doesn't actually matter here - done this
// way anyway to mirror how the real webview only ever calls these once a
// document exists.
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function renderInto(instances, idPrefix, expandedSet, addLabel) {
  document.getElementById('root').innerHTML = Helpers.repeatableConditionedInstancesHtml(
    instances,
    idPrefix,
    function payloadHtml(inst, instIdPrefix) {
      return '<input type="text" class="payload-input" id="' + instIdPrefix + '-val" value="' + (inst.parameters || '') + '" />';
    },
    expandedSet,
    addLabel
  );
}

function wirePayloadFn(instIdPrefix, inst, updatePayload) {
  const input = document.getElementById(instIdPrefix + '-val');
  if (!input) return;
  input.addEventListener('change', function () {
    updatePayload({ parameters: input.value });
  });
}

console.log('\nrepeatableConditionedInstancesHtml - rendering');
{
  renderInto([], 'l1t');
  check('empty list shows "None defined."', document.querySelector('.empty-state').textContent.indexOf('None defined.') >= 0);
  check('no repeat-inst cards rendered', document.querySelectorAll('.repeat-inst').length === 0);

  const instances = [
    { name: 'COLOR', parameters: 'RED', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }] },
    { name: 'COLOR', parameters: 'GRN', conditions: [] },
  ];
  renderInto(instances, 'l1t', new Set());
  const cards = document.querySelectorAll('.repeat-inst');
  check('renders one card per instance', cards.length === 2);
  check('conditioned instance shows a condition-count badge', document.querySelectorAll('.repeat-inst-cond-toggle')[0].textContent.indexOf('(1)') >= 0);
  check('unconditioned instance shows no count badge', document.querySelectorAll('.repeat-inst-cond-toggle')[1].textContent.indexOf('Conditioning') >= 0 &&
    document.querySelectorAll('.repeat-inst-cond-toggle')[1].textContent.indexOf('(') < 0);
  check('payload callback rendered inside each card', document.getElementById('l1t-inst0-val').value === 'RED' && document.getElementById('l1t-inst1-val').value === 'GRN');
  check('accordion body NOT rendered when collapsed', document.querySelectorAll('.repeat-inst-cond-body').length === 0);

  const expanded = new Set(['l1t:0']);
  renderInto(instances, 'l1t', expanded);
  check('accordion body IS rendered for the expanded instance', document.querySelectorAll('.repeat-inst-cond-body').length === 1);
  check('expanded accordion contains the shared conditions editor markup', document.querySelector('.repeat-inst-cond-body').innerHTML.indexOf('cond-add-group') >= 0);
}

console.log('\nwireRepeatableConditionedInstances - remove button');
{
  const instances = [
    { name: 'COLOR', parameters: 'RED', conditions: [] },
    { name: 'COLOR', parameters: 'GRN', conditions: [] },
  ];
  renderInto(instances, 'l1r', new Set());
  let committed = null;
  Helpers.wireRepeatableConditionedInstances('l1r', instances, function (next) { committed = next; }, wirePayloadFn, new Set(), function () {}, null);

  document.querySelectorAll('.repeat-inst-remove[data-prefix="l1r"]')[0].dispatchEvent(new dom.window.Event('click'));
  check('removing instance 0 leaves exactly the other one', committed && committed.length === 1 && committed[0].parameters === 'GRN');
}

console.log('\nwireRepeatableConditionedInstances - conditioning toggle expands/collapses (pure UI state, no onChange)');
{
  const instances = [{ name: 'COLOR', parameters: 'RED', conditions: [] }];
  const expandedSet = new Set();
  renderInto(instances, 'l1c', expandedSet);
  let onChangeCalls = 0;
  let rerenderCalls = 0;
  Helpers.wireRepeatableConditionedInstances('l1c', instances, function () { onChangeCalls++; }, wirePayloadFn, expandedSet, function () { rerenderCalls++; }, null);

  document.querySelector('.repeat-inst-cond-toggle[data-prefix="l1c"]').dispatchEvent(new dom.window.Event('click'));
  check('toggle adds the instance to expandedSet', expandedSet.has('l1c:0'));
  check('toggle calls rerender, not onChange', rerenderCalls === 1 && onChangeCalls === 0);
}

console.log('\nwireRepeatableConditionedInstances - editing conditions on ONE instance leaves the others untouched');
{
  // Instance 1 already has an OR group with one indicator (99) - a fresh
  // "+ OR condition" click would add a whole new OR group, so to exercise
  // adding an ANDed indicator to an EXISTING group we target instance 1
  // (which has one) rather than instance 0 (which starts unconditioned and
  // only has "+ OR condition" available until a group exists).
  const instances = [
    { name: 'COLOR', parameters: 'RED', conditions: [] },
    { name: 'COLOR', parameters: 'GRN', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '99', not: false }] }] },
  ];
  const expandedSet = new Set(['l1e:1']);
  renderInto(instances, 'l1e', expandedSet);
  let committed = null;
  Helpers.wireRepeatableConditionedInstances('l1e', instances, function (next) { committed = next; }, wirePayloadFn, expandedSet, function () {}, null);

  const numInput = document.querySelector('#l1e-inst1-cond-groups .cond-ind-num');
  numInput.value = '10';
  document.querySelector('.cond-ind-add[data-prefix="l1e-inst1"]').dispatchEvent(new dom.window.Event('click'));

  check('onChange committed with 2 instances still', committed && committed.length === 2);
  check('instance 1 gained the new ANDed indicator alongside its existing one', committed[1].conditions[0].indicators.length === 2 &&
    committed[1].conditions[0].indicators[0].number === '99' && committed[1].conditions[0].indicators[1].number === '10');
  check('instance 1 payload (parameters) untouched by the conditions edit', committed[1].parameters === 'GRN');
  check('instance 0 (not being edited) is completely unchanged', committed[0].conditions.length === 0 && committed[0].parameters === 'RED');
}

console.log('\nwireRepeatableConditionedInstances - payload edits go through wirePayload/updatePayload, merged onto the right instance');
{
  const instances = [
    { name: 'COLOR', parameters: 'RED', conditions: [] },
    { name: 'COLOR', parameters: 'GRN', conditions: [] },
  ];
  renderInto(instances, 'l1p', new Set());
  let committed = null;
  Helpers.wireRepeatableConditionedInstances('l1p', instances, function (next) { committed = next; }, wirePayloadFn, new Set(), function () {}, null);

  const input1 = document.getElementById('l1p-inst1-val');
  input1.value = 'BLU';
  input1.dispatchEvent(new dom.window.Event('change'));

  check('onChange committed with 2 instances', committed && committed.length === 2);
  check('instance 0 (not edited) unchanged', committed[0].parameters === 'RED');
  check('instance 1 payload updated via updatePayload merge', committed[1].parameters === 'BLU');
  check('instance 1 name/conditions preserved by the shallow merge', committed[1].name === 'COLOR' && Array.isArray(committed[1].conditions));
}

console.log('\nwireRepeatableConditionedInstances - "+ Add instance" appends makeDefaultInstance()\'s result');
{
  const instances = [{ name: 'COLOR', parameters: 'RED', conditions: [] }];
  renderInto(instances, 'l1a', new Set());
  let committed = null;
  Helpers.wireRepeatableConditionedInstances('l1a', instances, function (next) { committed = next; }, wirePayloadFn, new Set(), function () {}, function makeDefault() {
    return { name: 'COLOR', parameters: '', conditions: [] };
  });

  document.querySelector('.repeat-inst-add[data-prefix="l1a"]').dispatchEvent(new dom.window.Event('click'));
  check('onChange committed with the original instance plus one new one', committed && committed.length === 2);
  check('new instance came from makeDefaultInstance()', committed[1].name === 'COLOR' && committed[1].parameters === '' && committed[1].conditions.length === 0);
}

console.log('\nwireRepeatableConditionedInstances - falls back to a bare { conditions: [] } instance when makeDefaultInstance is omitted');
{
  renderInto([], 'l1d', new Set());
  let committed = null;
  Helpers.wireRepeatableConditionedInstances('l1d', [], function (next) { committed = next; }, wirePayloadFn, new Set(), function () {}, null);
  document.querySelector('.repeat-inst-add[data-prefix="l1d"]').dispatchEvent(new dom.window.Event('click'));
  check('default fallback instance has an empty conditions array', committed && committed.length === 1 && Array.isArray(committed[0].conditions) && committed[0].conditions.length === 0);
}

// ===========================================================================
// End-to-end: writer layer + client layer chained together, the way a
// future L1a/L1b/L1c picker will actually use this foundation.
// ===========================================================================

console.log('\nEnd-to-end: DspfWriter instances -> rendered/wired in the DOM -> edited -> written back');
{
  const NAMES = ['COLOR'];
  let keywords = DspfWriter.setRepeatableKeywordInstances([], NAMES, [
    { name: 'COLOR', parameters: 'RED', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }] },
    { name: 'COLOR', parameters: 'GRN', conditions: [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '20', not: false }] }] },
  ]);

  let instances = DspfWriter.getRepeatableKeywordInstances(keywords, NAMES);
  renderInto(instances, 'l1x', new Set());
  Helpers.wireRepeatableConditionedInstances('l1x', instances, function (next) {
    keywords = DspfWriter.setRepeatableKeywordInstances(keywords, NAMES, next);
  }, wirePayloadFn, new Set(), function () {}, null);

  const input0 = document.getElementById('l1x-inst0-val');
  input0.value = 'PNK';
  input0.dispatchEvent(new dom.window.Event('change'));

  const after = DspfWriter.getRepeatableKeywordInstances(keywords, NAMES);
  check('edited instance wrote back through to the keywords array', after.find((i) => i.conditions[0].indicators[0].number === '10').parameters === 'PNK');
  check('untouched instance is still exactly as it was', after.find((i) => i.conditions[0].indicators[0].number === '20').parameters === 'GRN');
  check('still exactly 2 COLOR keywords - editing one didn\'t drop or duplicate the other', keywords.filter((k) => k.name === 'COLOR').length === 2);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

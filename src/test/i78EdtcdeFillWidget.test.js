/**
 * i78EdtcdeFillWidget.test.js
 *
 * Task I-78 - EDTCDE's optional second parameter. The DDS Reference gives
 * the format as EDTCDE(edit-code [* |floating-currency-symbol]) and real
 * SDA's "Select Editing Keywords" screen shows it as its own prompt,
 * "Replace leading zeros with". The designer only offered it as free text
 * in the same box as the edit-code letter.
 *
 *   A. DspfWriter: splitEditCode / joinEditCode / getEditCodeParts /
 *      editCodeFillConflictReason.
 *   B. The Edit code / word / mask panel: the new "Replace leading zeros
 *      with" input renders, is pre-populated (including from a hand-written
 *      "J*" / "J $"), and Apply reads and writes it.
 * Run with: node src/test/i78EdtcdeFillWidget.test.js
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
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// A. DspfWriter
// ===========================================================================
console.log('A1. splitEditCode / joinEditCode');
{
  const sp = DspfWriter.splitEditCode;
  const eq = (a, code, fill) => a.code === code && a.fill === fill;
  check('"J" -> code J, no fill', eq(sp('J'), 'J', ''));
  check('"J *" -> code J, fill *', eq(sp('J *'), 'J', '*'));
  check('"J*" (no space) is read the same', eq(sp('J*'), 'J', '*'));
  check('"1 $" -> code 1, fill $', eq(sp('1 $'), '1', '$'));
  check('surrounding blanks are ignored', eq(sp('  A   *  '), 'A', '*'));
  check('empty / null / undefined -> empty parts', eq(sp(''), '', '') && eq(sp(null), '', '') && eq(sp(undefined), '', ''));
  check('an unrecognisable string is kept whole as the code, never dropped', eq(sp('J * extra'), 'J * extra', ''));
  const jn = DspfWriter.joinEditCode;
  check('join code + fill uses the reference format\'s space', jn('J', '*') === 'J *');
  check('join code alone is just the code', jn('J', '') === 'J' && jn('J', undefined) === 'J' && jn('J', '  ') === 'J');
  check('join trims the code', jn(' J ', '$') === 'J $');
  check('split then join round-trips "J *"', jn(sp('J *').code, sp('J *').fill) === 'J *');
  check('a whole unrecognisable string round-trips unchanged', (() => { const p = sp('J * extra'); return jn(p.code, p.fill) === 'J * extra'; })());
}

console.log('\nA2. getEditCodeParts');
{
  const g = DspfWriter.getEditCodeParts;
  check('reads code and fill from EDTCDE', (() => { const p = g([kw('EDTCDE', 'K *')]); return p.code === 'K' && p.fill === '*'; })());
  check('no EDTCDE -> empty parts', (() => { const p = g([kw('DSPATR', 'HI')]); return p.code === '' && p.fill === ''; })());
  check('an EDTWRD field reports empty (its string is not an edit code)', (() => { const p = g([kw('EDTWRD', "'  DR  CR'")]); return p.code === '' && p.fill === ''; })());
}

console.log('\nA3. editCodeFillConflictReason');
{
  const r = DspfWriter.editCodeFillConflictReason;
  check('a blank fill is never reported, whatever the code', r('EDTCDE', 'W', '') === null && r('EDTCDE', 'J', '  ') === null && r('EDTWRD', "'x'", '') === null && r('', '', '') === null);
  ['1', '2', '3', '4', 'A', 'B', 'C', 'D', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].forEach((c) => {
    check('code ' + c + ' accepts * and $', r('EDTCDE', c, '*') === null && r('EDTCDE', c, '$') === null);
  });
  ['W', 'X', 'Y', 'Z', 'w', 'z'].forEach((c) => {
    const reason = r('EDTCDE', c, '*');
    check('code ' + c + ' refuses a fill, naming the allowed codes', typeof reason === 'string' && /1-4, A-D and J-Q/.test(reason));
  });
  check('a user-defined code (5-9) is not refused - IBM is silent on it', r('EDTCDE', '5', '*') === null && r('EDTCDE', '9', '$') === null);
  check('another currency symbol is accepted (must only match QCURSYM)', r('EDTCDE', 'J', '£') === null);
  check('two characters are refused', typeof r('EDTCDE', 'J', '**') === 'string');
  check('a quote or bracket is refused', typeof r('EDTCDE', 'J', "'") === 'string' && typeof r('EDTCDE', 'J', '(') === 'string' && typeof r('EDTCDE', 'J', ')') === 'string');
  check('a fill with no edit code is refused', /edit code/.test(r('EDTCDE', '', '*')));
  check('a fill with EDTWRD selected is refused', /only to an EDTCDE/.test(r('EDTWRD', "'x'", '*')));
  check('a fill with no keyword selected is refused', /only to an EDTCDE/.test(r('', '', '*')));
}

// ===========================================================================
// B. The panel
// ===========================================================================
function render(keywords, owner) {
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml(keywords, owner, { includeValidity: false }, new Set());
}
function setup(initial, usage) {
  let keywords = initial;
  const owner = 'ek';
  function getKeywords() { return keywords; }
  function wire() { Helpers.wireValidityAndEdit(keywords, onChange, owner, { includeValidity: false }, new Set(), function () {}, 'S', usage || 'B'); }
  function onChange(next) { keywords = next; render(keywords, owner); wire(); }
  render(keywords, owner);
  wire();
  return { getKeywords };
}
const el = (id) => document.getElementById(id);
function apply(kind, code, fill, mask) {
  el('ek-ec-kind').value = kind;
  el('ek-ec-params').value = code;
  if (fill !== undefined) el('ek-ec-fill').value = fill;
  if (mask !== undefined) el('ek-em-mask').value = mask;
  let msg = null;
  const orig = global.window.alert;
  global.window.alert = (m) => { msg = m; };
  document.querySelector('.ek-vc-apply').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  global.window.alert = orig;
  return msg;
}
const ec = (ctx) => ctx.getKeywords().filter((k) => k.name === 'EDTCDE');

console.log('\nB1. rendering');
{
  render([], 'ek');
  const fill = el('ek-ec-fill');
  check('the "Replace leading zeros with" input renders', !!fill);
  check('it is a single-character input', !!fill && fill.getAttribute('maxlength') === '1');
  check('it has a label carrying real SDA\'s wording', /Replace leading zeros with/.test(document.getElementById('root').innerHTML));
  check('the hint now lists J-Q (IBM: "J through Q"), not J-O', /J-Q/.test(document.getElementById('root').innerHTML) && !/J-O/.test(document.getElementById('root').innerHTML));
  render([kw('EDTCDE', 'J')], 'ek');
  check('EDTCDE(J): code box J, fill empty', el('ek-ec-params').value === 'J' && el('ek-ec-fill').value === '');
  render([kw('EDTCDE', 'J *')], 'ek');
  check('EDTCDE(J *): code box J, fill *', el('ek-ec-params').value === 'J' && el('ek-ec-fill').value === '*');
  render([kw('EDTCDE', 'J*')], 'ek');
  check('hand-written EDTCDE(J*) is split the same way', el('ek-ec-params').value === 'J' && el('ek-ec-fill').value === '*');
  render([kw('EDTCDE', '1 $')], 'ek');
  check('EDTCDE(1 $): code box 1, fill $', el('ek-ec-params').value === '1' && el('ek-ec-fill').value === '$');
  render([kw('EDTWRD', "'  DR  CR'")], 'ek');
  check('EDTWRD: the whole string stays in the main box, fill empty', el('ek-ec-params').value === "'  DR  CR'" && el('ek-ec-fill').value === '');
  render([kw('EDTCDE', 'J * extra')], 'ek');
  check('an unrecognisable EDTCDE string is shown whole in the main box, nothing lost', el('ek-ec-params').value === 'J * extra' && el('ek-ec-fill').value === '');
}

console.log('\nB2. Apply writes the second parameter');
{
  let ctx = setup([]);
  let msg = apply('EDTCDE', 'J', '*');
  check('J + * is written as "J *", no alert', !msg && ec(ctx).length === 1 && ec(ctx)[0].parameters === 'J *');
  check('the panel re-rendered with the fill shown', el('ek-ec-params').value === 'J' && el('ek-ec-fill').value === '*');
  msg = apply('EDTCDE', 'J', '$');
  check('changing the fill to $ replaces it', !msg && ec(ctx).length === 1 && ec(ctx)[0].parameters === 'J $');
  msg = apply('EDTCDE', 'J', '');
  check('clearing the fill leaves a bare "J"', !msg && ec(ctx).length === 1 && ec(ctx)[0].parameters === 'J');
  msg = apply('EDTCDE', 'K', '');
  check('a plain edit code with no fill is unchanged behaviour', !msg && ec(ctx)[0].parameters === 'K');
  msg = apply('', '', '');
  check('(none) removes EDTCDE', !msg && ec(ctx).length === 0);
}

console.log('\nB3. "J*" typed into the edit-code box out of habit');
{
  let ctx = setup([]);
  let msg = apply('EDTCDE', 'J*', '');
  check('is understood: written as "J *", no alert', !msg && ec(ctx)[0].parameters === 'J *');
  check('...and shown split across the two inputs afterwards', el('ek-ec-params').value === 'J' && el('ek-ec-fill').value === '*');
  ctx = setup([]);
  msg = apply('EDTCDE', 'J*', '*');
  check('the same symbol given twice is fine', !msg && ec(ctx)[0].parameters === 'J *');
  ctx = setup([]);
  msg = apply('EDTCDE', 'J*', '$');
  check('two DIFFERENT symbols are refused, not guessed at', !!msg && /twice/.test(msg) && ec(ctx).length === 0);
}

console.log('\nB4. refusals leave the field unchanged and put the inputs back');
{
  let ctx = setup([kw('EDTCDE', 'J')]);
  let msg = apply('EDTCDE', 'W', '*');
  check('W + * is refused with an alert naming the allowed codes', !!msg && /1-4, A-D and J-Q/.test(msg));
  check('EDTCDE is unchanged', ec(ctx)[0].parameters === 'J');
  check('the inputs were put back to the saved state', el('ek-ec-params').value === 'J' && el('ek-ec-fill').value === '');
  msg = apply('EDTCDE', 'J', '**');
  check('a multi-character fill is refused', !!msg && /single character/.test(msg) && ec(ctx)[0].parameters === 'J');
  msg = apply('EDTWRD', "'  DR  CR'", '*');
  check('a fill with EDTWRD selected is refused, EDTCDE kept', !!msg && /only to an EDTCDE/.test(msg) && ec(ctx).length === 1 && !ctx.getKeywords().some((k) => k.name === 'EDTWRD'));
  msg = apply('EDTCDE', '', '*');
  check('a fill with an empty edit code is refused', !!msg && /edit code/.test(msg));
}

console.log('\nB5. a hand-written field keeps its second parameter through unrelated edits');
{
  let ctx = setup([kw('EDTCDE', 'J *')]);
  const msg = apply('EDTCDE', 'J', '*', "'999'");
  check('adding an edit mask alongside leaves EDTCDE(J *) intact', !msg && ec(ctx)[0].parameters === 'J *' && ctx.getKeywords().some((k) => k.name === 'EDTMSK'));
  ctx = setup([kw('EDTCDE', 'J * extra')]);
  const m2 = apply('EDTCDE', 'J * extra', '', undefined);
  check('an unrecognisable hand-written EDTCDE re-applied unchanged is written back unchanged', !m2 && ec(ctx)[0].parameters === 'J * extra');
}

if (failures === 0) {
  console.log('\nALL CHECKS PASSED');
} else {
  console.log('\n' + failures + ' CHECK(S) FAILED');
  process.exitCode = 1;
}

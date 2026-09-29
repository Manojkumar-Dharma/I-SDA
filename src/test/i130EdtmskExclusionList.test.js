/**
 * i130EdtmskExclusionList.test.js
 *
 * Task I-130 - deferred finding from the I-121 EDTCDE/EDTMSK slice. EDTMSK's
 * own DDS Reference section lists keywords that "cannot be specified on a
 * field with the EDTMSK keyword": AUTO(RAB, RAZ), CHECK(AB, MF, RB, RZ, RLTB),
 * CHOICE, CNTFLD, DSPATR(OID SP). Nothing enforced it in either direction.
 *
 *   A. KeywordSpec: RECORD_TYPES.EDTMSK.conditionalMutex + its citation.
 *   B. DspfWriter: edtmskConflictReason (add-time, both directions) and
 *      edtmskNewConflictReason (diff backstop used by commitEdit).
 *   C. The Edit code / word / mask panel refuses to add a mask to a field
 *      that carries a listed keyword.
 * Run with: node src/test/i130EdtmskExclusionList.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLine: [], sourceLines: [] });

// ===========================================================================
console.log('A. KeywordSpec.RECORD_TYPES.EDTMSK.conditionalMutex');
{
  const e = KeywordSpec.RECORD_TYPES.EDTMSK;
  check('citation states the DDS Reference sentence', /cannot be specified on a field with the EDTMSK keyword/.test(e.ddsReference));
  check('earlier I-31 facts kept (usage I/B, EDTCDE-or-EDTWRD)', e.definitionRequirements.usage.join() === 'I,B' && e.qualifyingNames.join() === 'EDTCDE,EDTWRD');
  const m = e.conditionalMutex;
  check('exactly the five listed keywords', Object.keys(m).sort().join() === 'AUTO,CHECK,CHOICE,CNTFLD,DSPATR');
  check('AUTO restricted to RAB, RAZ', m.AUTO.join() === 'RAB,RAZ');
  check('CHECK restricted to AB, MF, RB, RZ, RLTB', m.CHECK.join() === 'AB,MF,RB,RZ,RLTB');
  check('DSPATR restricted to OID, SP', m.DSPATR.join() === 'OID,SP');
  check('CHOICE and CNTFLD excluded outright', m.CHOICE === null && m.CNTFLD === null);
  const hit = (n, p) => KeywordSpec.conditionalMutexHit('EDTMSK', { name: n, parameters: p });
  check('AUTO(RAB) and AUTO(RAZ) hit', hit('AUTO', 'RAB') === 'AUTO(RAB)' && hit('AUTO', 'RAZ') === 'AUTO(RAZ)');
  check('a bare AUTO does not hit', hit('AUTO', '') === null);
  check('CHECK(AB) hits, CHECK(ME) does not', hit('CHECK', 'AB') === 'CHECK(AB)' && hit('CHECK', 'ME') === null);
  check('CHECK(MF) and CHECK(RLTB) hit', hit('CHECK', 'MF') !== null && hit('CHECK', 'RLTB') !== null);
  check('DSPATR(OID) and DSPATR(SP) hit, DSPATR(HI) does not', hit('DSPATR', 'OID') !== null && hit('DSPATR', 'SP') !== null && hit('DSPATR', 'HI') === null);
  check('DSPATR(HI SP) hits on the SP token', hit('DSPATR', 'HI SP') === 'DSPATR(SP)');
  check('CHOICE / CNTFLD hit with any parameters', hit('CHOICE', '1 ') === 'CHOICE' && hit('CNTFLD', '20') === 'CNTFLD');
  check('an unlisted keyword never hits', hit('DUP', '') === null && hit('EDTCDE', 'Y') === null);
}

// ===========================================================================
console.log('\nB1. edtmskConflictReason (add-time, both directions)');
{
  const f = DspfWriter.edtmskConflictReason;
  const withMask = [kw('EDTCDE', 'Y'), kw('EDTMSK', "' & & '")];
  const r = f('CHECK', 'AB', withMask);
  check('adding CHECK(AB) to a field with EDTMSK is blocked, naming both', typeof r === 'string' && /^CHECK\(AB\) cannot be specified on a field that already has EDTMSK/.test(r));
  check('adding CHECK(ME) is fine', f('CHECK', 'ME', withMask) === null);
  check('adding AUTO(RAB) blocked, bare AUTO fine', f('AUTO', 'RAB', withMask) !== null && f('AUTO', '', withMask) === null);
  check('adding CHOICE / CNTFLD blocked', f('CHOICE', "1 'x'", withMask) !== null && f('CNTFLD', '10', withMask) !== null);
  check('adding DSPATR(OID) blocked, DSPATR(HI) fine', f('DSPATR', 'OID', withMask) !== null && f('DSPATR', 'HI', withMask) === null);
  check('name is case-insensitive', f('choice', '', withMask) !== null);
  check('a listed keyword on a field WITHOUT EDTMSK is fine', f('CHECK', 'AB', [kw('EDTCDE', 'Y')]) === null && f('CHOICE', '', []) === null);
  const fr = f('EDTMSK', '', [kw('EDTCDE', 'Y'), kw('CHECK', 'AB'), kw('CNTFLD', '5')]);
  check('adding EDTMSK to a field with listed keywords is blocked, naming them', typeof fr === 'string' && /^EDTMSK cannot be specified on a field that has CHECK\(AB\), CNTFLD/.test(fr));
  check('adding EDTMSK to a clean field is fine', f('EDTMSK', '', [kw('EDTCDE', 'Y'), kw('CHECK', 'ME'), kw('DSPATR', 'HI')]) === null);
  check('any other keyword is a no-op', f('DUP', '', withMask) === null);
  check('null / undefined inputs are safe', f(undefined, undefined, null) === null && f('EDTMSK', '', null) === null);
}

console.log('\nB2. edtmskNewConflictReason (diff backstop)');
{
  const f = DspfWriter.edtmskNewConflictReason;
  const base = [kw('EDTCDE', 'Y'), kw('EDTMSK', "' & & '")];
  check('no EDTMSK after the edit -> null', f(base, [kw('EDTCDE', 'Y'), kw('CHECK', 'AB')]) === null);
  check('CHECK(AB) added alongside existing EDTMSK is blocked', /^CHECK\(AB\) cannot be specified/.test(f(base, base.concat([kw('CHECK', 'AB')]))));
  check('EDTMSK newly added over a listed keyword is blocked (forward message)', /^EDTMSK cannot be specified on a field that has DSPATR\(SP\)/.test(f([kw('EDTCDE', 'Y'), kw('DSPATR', 'SP')], [kw('EDTCDE', 'Y'), kw('DSPATR', 'SP'), kw('EDTMSK', "' & '")])));
  check('a clean edit is allowed', f(base, base.concat([kw('DSPATR', 'HI')])) === null);
  const bad = base.concat([kw('CHECK', 'AB')]);
  check('hand-written already-invalid field: unrelated edit not re-reported', f(bad, bad.concat([kw('TEXT', "'x'")])) === null);
  check('  ...removing the offender is allowed', f(bad, base) === null);
  check('  ...a NEW second offender is still blocked', /^CHOICE cannot/.test(f(bad, bad.concat([kw('CHOICE', '')]))));
  check('  ...a repeated identical hit is not treated as new', f(bad, bad.slice()) === null);
  check('null / undefined inputs are safe', f(null, null) === null && f(undefined, [kw('EDTMSK', 'x'), kw('CNTFLD', '5')]) !== null);
}

// ===========================================================================
console.log('\nC. Edit code / word / mask panel');
function render(keywords, owner) {
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml(keywords, owner, { includeValidity: false }, new Set());
}
function setup(initial, usage) {
  let keywords = initial;
  const owner = 'ek';
  function wire() { Helpers.wireValidityAndEdit(keywords, onChange, owner, { includeValidity: false }, new Set(), function () {}, 'S', usage || 'B'); }
  function onChange(next) { keywords = next; render(keywords, owner); wire(); }
  render(keywords, owner);
  wire();
  return { getKeywords: () => keywords };
}
const el = (id) => document.getElementById(id);
function apply(kind, code, mask) {
  el('ek-ec-kind').value = kind;
  el('ek-ec-params').value = code;
  el('ek-em-mask').value = mask;
  let msg = null;
  const orig = global.window.alert;
  global.window.alert = (m) => { msg = m; };
  document.querySelector('.ek-vc-apply').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  global.window.alert = orig;
  return msg;
}
const has = (ctx, n) => ctx.getKeywords().some((k) => k.name === n);
{
  const ctx = setup([kw('CHECK', 'AB')]);
  const msg = apply('EDTCDE', 'Y', "' & & '");
  check('CHECK(AB) on the field: adding a mask is refused with a reason', typeof msg === 'string' && /EDTMSK cannot be specified on a field that has CHECK\(AB\)/.test(msg));
  check('  ...nothing was written', !has(ctx, 'EDTMSK') && !has(ctx, 'EDTCDE'));
}
{
  const ctx = setup([kw('CNTFLD', '10')]);
  const msg = apply('EDTWRD', "'0(  )'", "' & & '");
  check('CNTFLD on the field: adding a mask is refused', typeof msg === 'string' && /CNTFLD/.test(msg) && !has(ctx, 'EDTMSK'));
}
{
  const ctx = setup([kw('CHECK', 'ME'), kw('DSPATR', 'HI'), kw('AUTO', '')]);
  const msg = apply('EDTCDE', 'Y', "' & & '");
  check('CHECK(ME)/DSPATR(HI)/bare AUTO are fine: mask applied, no alert', msg === null && has(ctx, 'EDTMSK') && has(ctx, 'EDTCDE'));
}
{
  const ctx = setup([kw('EDTCDE', 'Y'), kw('EDTMSK', "' & & '"), kw('CHECK', 'AB')]);
  const msg = apply('EDTCDE', 'Y', '');
  check('hand-written invalid field: clearing the mask is never blocked', msg === null && !has(ctx, 'EDTMSK'));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

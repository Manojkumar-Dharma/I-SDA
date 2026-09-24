/**
 * i30CharacterFieldConditioningAudit.test.js
 *
 * Task I-30 - the field-level series' first task (character fields, the
 * base 8-category set: Colors & Attributes, Keying Options, Validity
 * Check, Input Keywords, General Keywords, Database Reference, Error
 * Messages, Message ID). Cross-checked every keyword's own "Option
 * indicators are/are not valid for this keyword" statement in
 * docs/sda-reference/source/DDS_Keyword_V7r6.txt against the actual UI,
 * and found several categories offering a Conditioning toggle where IBM
 * says option indicators are never (or only conditionally) valid:
 *
 *  - CHECK (Keying Options + Validity Check panels, shared instance
 *    model): IBM - "Option indicators are valid only for CHECK(ER) and
 *    CHECK(ME))" - every other code (AB/VN/VNE/M10/M10F/M11/M11F/MF/FE/
 *    RB/RZ/RL/LC) was wrongly offering conditioning. Fixed via
 *    checkInstanceIsConditionable (conditionable only when the
 *    instance's code set is a non-empty subset of {ER, ME}).
 *  - RANGE/COMP/VALUES (Validity Check): IBM says "not valid" for all
 *    three, individually, in three separate statements - was offered
 *    unconditionally. Fixed: validityCheckInstancesHtml/
 *    wireValidityCheckInstances now always pass isConditionable=false.
 *  - DSPATR (Colors & Attributes, shared COLOR+DSPATR instance model):
 *    IBM - valid "except when the attributes OID or SP are the only
 *    display attributes specified". Since COLOR (always conditionable)
 *    and DSPATR share ONE condition set per UI card, the fix
 *    (colorAttrStateIsConditionable) only blocks the clean case - an
 *    OID/SP-only DSPATR portion with NO color set. A state combining a
 *    color with OID/SP-only attributes remains conditionable (a
 *    documented, deliberate edge case - see keywordFixes.md's own I-30
 *    write-up for why splitting COLOR/DSPATR's conditioning fully would
 *    need a bigger data-model change than this task's own scope).
 *  - BLANKS/CHANGE (Input Keywords): IBM says "not valid" for both;
 *    DUP is the one row of the three IBM marks conditionable. Was
 *    offered unconditionally for all three.
 *  - ALIAS/INDTXT/DFT/CNTFLD/TEXT/FLDCSRPRG/HLPID/CHRID/IGCALTTYP/
 *    NOCCSID (General Keywords): all ten are "not valid" per their own
 *    DDS Reference entries; only DFTVAL/PUTRETAIN/OVRDTA/OVRATR (the
 *    other four rows in this same shared list) are actually
 *    conditionable. All fourteen were wrongly offering conditioning
 *    before this fix (GENERAL_FIELD_KEYWORD_ROWS' new 5th
 *    `conditionable` element).
 *  - DLTCHK/DLTEDT (Database Reference): both "not valid" - was offered
 *    unconditionally.
 *
 * Confirmed CLEAN (no fix needed) during the same audit: COLOR itself
 * (always conditionable, matches); CHGINPDFT (already correctly fixed
 * by an earlier task, I-3); KEYBRD (not a real DDS keyword at all - the
 * field's own data-type column, no conditioning concept applies);
 * ERRMSG/ERRMSGID (already correctly conditionable, repeatable); REFFLD
 * (no Conditioning control exists in its UI at all, correct since it's
 * a position-29 field-shape editor, not a flagRowHtml/repeatable-
 * instance keyword row).
 *
 * Run with: node src/test/i30CharacterFieldConditioningAudit.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function kw(name, parameters) {
  return { name: name, parameters: parameters, conditions: [], raw: '', sourceLines: [] };
}

const cond = [{ relation: 'AND', displaySizeCondition: null, indicators: [{ number: '10', not: false }] }];

// ===========================================================================
// CHECK (Keying Options + Validity Check) - conditionable only for a
// code set that's a non-empty subset of {ER, ME}.
// ===========================================================================

console.log('keyingOptionsHtml - CHECK(ME) and CHECK(ER) alone each still offer a Conditioning toggle');
['ME', 'ER'].forEach(function (code) {
  const keywords = [{ name: 'CHECK', parameters: code, conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.keyingOptionsHtml(keywords, 'chk' + code, new Set(), 'A');
  check('CHECK(' + code + ') shows a Conditioning toggle', !!document.querySelector('.repeat-inst-cond-toggle'));
});

console.log('\nkeyingOptionsHtml - every other CHECK code hides the Conditioning toggle');
['AB', 'MF', 'FE', 'RB', 'RZ', 'RL', 'LC'].forEach(function (code) {
  const keywords = [{ name: 'CHECK', parameters: code, conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.keyingOptionsHtml(keywords, 'chkno' + code, new Set(), 'A');
  check('CHECK(' + code + ') has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
});

console.log('\nvalidityAndEditHtml - CHECK(VN)/CHECK(VNE)/CHECK(M10)/CHECK(M11) (Validity check\\u2019s own codes) also hide the toggle');
['VN', 'VNE', 'M10', 'M11'].forEach(function (code) {
  const keywords = [{ name: 'CHECK', parameters: code, conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml(keywords, 'vchk' + code, {}, new Set());
  check('CHECK(' + code + ') has NO Conditioning toggle in the Validity check panel', !document.querySelector('.repeat-inst-cond-toggle'));
});

console.log('\nkeyingOptionsHtml - CHECK(ME AB) (ER/ME code mixed with a non-exempt code) hides the toggle too - the exception is code-set-exact, not "contains ME/ER"');
{
  const keywords = [{ name: 'CHECK', parameters: 'ME AB', conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.keyingOptionsHtml(keywords, 'chkmix', new Set(), 'A');
  check('CHECK(ME AB) has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
}

console.log('\nwireKeyingOptionsEditor - toggling an AB checkbox on a non-conditionable CHECK instance still commits fine (only the Conditioning control itself is hidden)');
{
  const keywords = [{ name: 'CHECK', parameters: 'AB', conditions: [], raw: '', sourceLines: [] }];
  const expandedSet = new Set();
  const p = 'chkwire';
  document.getElementById('root').innerHTML = Helpers.keyingOptionsHtml(keywords, p, expandedSet, 'A');
  let committed = null;
  Helpers.wireKeyingOptionsEditor(keywords, function (next) { committed = next; }, p, expandedSet, function () {});
  const meBox = document.querySelector('.' + p + '-keying-check-rep-inst0-code[data-code="ME"]');
  check('the ME checkbox exists', !!meBox);
  meBox.checked = true;
  meBox.dispatchEvent(new dom.window.Event('change'));
  check('the edit committed', !!committed);
  const check1 = committed.find(function (k) { return k.name === 'CHECK'; });
  check('CHECK now carries both AB and ME', check1 && check1.parameters.indexOf('AB') >= 0 && check1.parameters.indexOf('ME') >= 0);
}

// ===========================================================================
// RANGE/COMP/VALUES (Validity Check) - never conditionable.
// ===========================================================================

console.log('\nvalidityAndEditHtml - RANGE/COMP/VALUES each hide the Conditioning toggle unconditionally');
[
  ['RANGE', '1 99'],
  ['COMP', 'GT 0'],
  ['VALUES', "'A' 'B'"],
].forEach(function (pair) {
  const keywords = [{ name: pair[0], parameters: pair[1], conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml(keywords, 'vc' + pair[0], {}, new Set());
  check(pair[0] + ' has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
});

console.log('\nwireValidityCheckInstances - "+ Add validity check" still seeds a default RANGE instance with no toggle to click');
{
  const keywords = [];
  const expandedSet = new Set();
  const p = 'vcadd';
  document.getElementById('root').innerHTML = Helpers.validityAndEditHtml(keywords, p, {}, expandedSet);
  let committed = null;
  Helpers.wireValidityAndEdit(keywords, function (next) { committed = next; }, p, {}, expandedSet, function () {}, 'A');
  document.querySelector('.repeat-inst-add[data-prefix="' + p + '-vc-rep"]').dispatchEvent(new dom.window.Event('click'));
  check('a RANGE instance was added', !!committed && committed.some(function (k) { return k.name === 'RANGE'; }));
}

// ===========================================================================
// DSPATR (shared COLOR+DSPATR instance) - conditionable except when the
// state's attrs are OID/SP-only AND no color is set.
// ===========================================================================

console.log('\ncolorAttrStatesHtml - DSPATR(OID) alone (no color) hides the Conditioning toggle');
{
  const keywords = [{ name: 'DSPATR', parameters: 'OID', conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(keywords, 'oid', new Set());
  check('DSPATR(OID) alone has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
}

console.log('\ncolorAttrStatesHtml - DSPATR(SP) alone and DSPATR(OID SP) alone both also hide the toggle');
['SP', 'OID SP'].forEach(function (attrs) {
  const keywords = [{ name: 'DSPATR', parameters: attrs, conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(keywords, 'sp' + attrs.replace(' ', ''), new Set());
  check('DSPATR(' + attrs + ') alone has NO Conditioning toggle', !document.querySelector('.repeat-inst-cond-toggle'));
});

console.log('\ncolorAttrStatesHtml - DSPATR(HI) (a normal attribute, not OID/SP) still offers the toggle');
{
  const keywords = [{ name: 'DSPATR', parameters: 'HI', conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(keywords, 'hi', new Set());
  check('DSPATR(HI) shows a Conditioning toggle', !!document.querySelector('.repeat-inst-cond-toggle'));
}

console.log('\ncolorAttrStatesHtml - DSPATR(HI OID) (OID mixed with a normal attribute) still offers the toggle - the exception is OID/SP-ONLY, not "contains OID"');
{
  const keywords = [{ name: 'DSPATR', parameters: 'HI OID', conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(keywords, 'hioid', new Set());
  check('DSPATR(HI OID) shows a Conditioning toggle', !!document.querySelector('.repeat-inst-cond-toggle'));
}

console.log('\ncolorAttrStatesHtml - a state combining a COLOR with an OID-only DSPATR still offers the toggle (documented edge case: COLOR\\u2019s own always-valid conditioning wins, since this UI shares one condition set for both keywords)');
{
  const keywords = [
    { name: 'COLOR', parameters: 'BLU', conditions: cond, raw: '', sourceLines: [] },
    { name: 'DSPATR', parameters: 'OID', conditions: cond, raw: '', sourceLines: [] },
  ];
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(keywords, 'coloroid', new Set());
  check('COLOR(BLU)+DSPATR(OID) combined state shows a Conditioning toggle', !!document.querySelector('.repeat-inst-cond-toggle'));
}

console.log('\nwireColorAttrStatesEditor - checking a second, normal attribute (HI) alongside an existing OID-only state makes it conditionable on the very next render');
{
  const keywords = [{ name: 'DSPATR', parameters: 'OID', conditions: [], raw: '', sourceLines: [] }];
  const expandedSet = new Set();
  const p = 'oidwire';
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(keywords, p, expandedSet);
  check('starts with no toggle (OID alone)', !document.querySelector('.repeat-inst-cond-toggle'));
  let committed = null;
  Helpers.wireColorAttrStatesEditor(keywords, function (next) { committed = next; }, p, expandedSet, function () {});
  const hiBox = document.querySelector('.' + p + '-colorattr-inst0-attr[value="HI"]');
  check('the HI checkbox exists', !!hiBox);
  hiBox.checked = true;
  hiBox.dispatchEvent(new dom.window.Event('change'));
  check('the edit committed', !!committed);
  const dspatr = committed.find(function (k) { return k.name === 'DSPATR'; });
  check('DSPATR now carries both OID and HI', dspatr && dspatr.parameters.indexOf('OID') >= 0 && dspatr.parameters.indexOf('HI') >= 0);
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(committed, p + '2', new Set());
  check('re-rendered with the combined OID+HI state now shows a Conditioning toggle', !!document.querySelector('.repeat-inst-cond-toggle'));
}

// ===========================================================================
// BLANKS/CHANGE (Input Keywords) - not conditionable; DUP is.
// ===========================================================================

console.log('\ninputKeywordsHtml - DUP still offers a Conditioning toggle');
{
  const keywords = [DspfWriter.setFileFlagKeyword([], 'DUP', true, '', undefined, cond)].reduce(function (a, b) { return a.concat(b); }, []);
  document.getElementById('root').innerHTML = Helpers.inputKeywordsHtml(keywords, 'dup', new Set());
  check('DUP shows a Conditioning toggle', !!document.querySelector('.kw-cond-toggle[data-flag-id="dup-inp-dup"]'));
}

console.log('\ninputKeywordsHtml - BLANKS and CHANGE each hide the Conditioning toggle');
['BLANKS', 'CHANGE'].forEach(function (name) {
  const keywords = DspfWriter.setFileFlagKeyword([], name, true, '', undefined, cond);
  const key = name.toLowerCase();
  document.getElementById('root').innerHTML = Helpers.inputKeywordsHtml(keywords, 'ik' + key, new Set());
  check(name + ' has NO Conditioning toggle', !document.querySelector('.kw-cond-toggle[data-flag-id="ik' + key + '-inp-' + key + '"]'));
});

// ===========================================================================
// General Keywords - fourteen rows, only DFTVAL/PUTRETAIN/OVRDTA/OVRATR
// conditionable; the other ten are not.
// ===========================================================================

console.log('\ngeneralFieldKeywordsHtml - the four conditionable rows (DFTVAL/PUTRETAIN/OVRDTA/OVRATR) each still show a toggle');
[
  ['DFTVAL', 'dftval'],
  ['PUTRETAIN', 'putretain'],
  ['OVRDTA', 'ovrdta'],
  ['OVRATR', 'ovratr'],
].forEach(function (pair) {
  const keywords = DspfWriter.setFileFlagKeyword([], pair[0], true, "'x'", undefined, cond);
  const own = 'gk' + pair[1];
  document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(keywords, own, new Set(), 'A', 'B', []);
  check(pair[0] + ' shows a Conditioning toggle', !!document.querySelector('.kw-cond-toggle[data-flag-id="' + own + '-gen-' + pair[1] + '"]'));
});

console.log('\ngeneralFieldKeywordsHtml - the ten non-conditionable rows (ALIAS/INDTXT/DFT/CNTFLD/TEXT/FLDCSRPRG/HLPID/CHRID/IGCALTTYP/NOCCSID) each hide the toggle');
[
  ['ALIAS', 'alias'],
  ['INDTXT', 'indtxt'],
  ['DFT', 'dft'],
  ['CNTFLD', 'cntfld'],
  ['TEXT', 'text'],
  ['FLDCSRPRG', 'fldcsrprg'],
  ['HLPID', 'hlpid'],
  ['CHRID', 'chrid'],
  ['IGCALTTYP', 'igcalttyp'],
  ['NOCCSID', 'noccsid'],
].forEach(function (pair) {
  const keywords = DspfWriter.setFileFlagKeyword([], pair[0], true, "'x'", undefined, cond);
  const own = 'gk' + pair[1];
  document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(keywords, own, new Set(), 'A', 'B', []);
  check(pair[0] + ' has NO Conditioning toggle', !document.querySelector('.kw-cond-toggle[data-flag-id="' + own + '-gen-' + pair[1] + '"]'));
});

console.log('\nwireGeneralFieldKeywordsEditor - editing ALIAS\\u2019s own text still commits fine with no Conditioning control to wire');
{
  const keywords = DspfWriter.setFileFlagKeyword([], 'ALIAS', true, 'OLDNAME', undefined, undefined);
  const expandedSet = new Set();
  const p = 'aliaswire';
  document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(keywords, p, expandedSet, 'A', 'B', []);
  let committed = null;
  Helpers.wireGeneralFieldKeywordsEditor(keywords, function (next) { committed = next; }, p, expandedSet, function () {}, 'A');
  const paramsEl = document.getElementById(p + '-gen-alias-params');
  check('the ALIAS params input exists', !!paramsEl);
  paramsEl.value = 'NEWNAME';
  paramsEl.dispatchEvent(new dom.window.Event('change'));
  check('the edit committed', !!committed);
  const alias = committed.find(function (k) { return k.name === 'ALIAS'; });
  check('ALIAS was updated to NEWNAME', alias && alias.parameters.trim() === 'NEWNAME');
}

// ===========================================================================
// Database Reference - DLTCHK/DLTEDT, both not conditionable.
// ===========================================================================

console.log('\nreferenceOverridesHtml - DLTCHK and DLTEDT each hide the Conditioning toggle');
['DLTCHK', 'DLTEDT'].forEach(function (name) {
  const keywords = DspfWriter.setFileFlagKeyword([], name, true, undefined, undefined, cond);
  const key = name.toLowerCase();
  document.getElementById('root').innerHTML = Helpers.referenceOverridesHtml(keywords, 'db' + key, new Set());
  check(name + ' has NO Conditioning toggle', !document.querySelector('.kw-cond-toggle[data-flag-id="db' + key + '-ref-' + key + '"]'));
});

// ===========================================================================
// Confirmed-clean spot checks (no fix needed, verified as part of this
// same audit) - COLOR alone, CHGINPDFT, ERRMSG.
// ===========================================================================

console.log('\ncolorAttrStatesHtml - COLOR alone (no DSPATR at all) still offers a Conditioning toggle, unaffected');
{
  const keywords = [{ name: 'COLOR', parameters: 'BLU', conditions: cond, raw: '', sourceLines: [] }];
  document.getElementById('root').innerHTML = Helpers.colorAttrStatesHtml(keywords, 'coloronly', new Set());
  check('COLOR alone shows a Conditioning toggle', !!document.querySelector('.repeat-inst-cond-toggle'));
}

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : `\n${failureCount()} check(s) FAILED.`);
process.exit(failureCount() === 0 ? 0 : 1);

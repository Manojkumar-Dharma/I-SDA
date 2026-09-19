/**
 * i39MissingKeywordsAudit.test.js
 *
 * Task I-39 (docs/sda-reference/keywordFixes.md) - a full-text audit of
 * DDS_Keyword_V7r6.txt against actual code (not just KEYWORD-INDEX.md,
 * which had simply never been updated for several already-fixed keywords)
 * found 8 keywords with NO getter/setter, NO row, and NO mention anywhere
 * in the codebase:
 *
 *  - BLKFOLD    - field-level flag, named output-only fields, not float.
 *  - CSRINPONLY - file- or record-level flag, no parameters.
 *  - FLTFIXDEC  - field-level flag, floating-point fields only.
 *  - FLTPCN     - field-level, *SINGLE/*DOUBLE, floating-point fields only.
 *  - MAPVAL     - field-level, value-pair list, date/time/timestamp only.
 *  - SFLCHCCTL  - field-level flag, subfile choice-control field.
 *  - SFLCSRPRG  - field-level flag, subfile cursor progression.
 *  - SFLRTNSEL  - record-level flag, SFLCTL record.
 *
 * Same "run the real client-side helper functions in a jsdom document
 * global" pattern i35UsageMpFailOpenAudit.test.js uses - this proves the
 * UI actually offers each keyword, not just that dspfWriter.js's already-
 * generic getFileFlagKeyword/setFileFlagKeyword primitives can read/write
 * an arbitrary keyword name (which was never in question).
 *
 * Run with: node src/test/i39MissingKeywordsAudit.test.js
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

// ===========================================================================
// BLKFOLD / FLTFIXDEC / FLTPCN / MAPVAL - General Keywords field-level rows,
// gated by GENERAL_FIELD_KEYWORD_ROWS' new dtScope column
// ===========================================================================
console.log('generalFieldKeywordsHtml - BLKFOLD shown for non-float, hidden for float (data type F)');
{
  const htmlChar = Helpers.generalFieldKeywordsHtml([], 'genA', new Set(), 'A', 'O', [], false);
  check('BLKFOLD row present for data type A', htmlChar.indexOf('genA-gen-blkfold-on') >= 0);
  const htmlFloat = Helpers.generalFieldKeywordsHtml([], 'genF', new Set(), 'F', 'O', [], false);
  check('BLKFOLD row absent for data type F', htmlFloat.indexOf('genF-gen-blkfold-on') === -1);
}

console.log('\ngeneralFieldKeywordsHtml - FLTFIXDEC/FLTPCN shown only for float (data type F)');
{
  const htmlFloat = Helpers.generalFieldKeywordsHtml([], 'genF2', new Set(), 'F', 'O', [], false);
  check('FLTFIXDEC row present for data type F', htmlFloat.indexOf('genF2-gen-fltfixdec-on') >= 0);
  check('FLTPCN row present for data type F', htmlFloat.indexOf('genF2-gen-fltpcn-on') >= 0);
  const htmlChar = Helpers.generalFieldKeywordsHtml([], 'genA2', new Set(), 'A', 'O', [], false);
  check('FLTFIXDEC row absent for data type A', htmlChar.indexOf('genA2-gen-fltfixdec-on') === -1);
  check('FLTPCN row absent for data type A', htmlChar.indexOf('genA2-gen-fltpcn-on') === -1);
}

console.log('\ngeneralFieldKeywordsHtml - MAPVAL shown only for date/time/timestamp (L/T/Z)');
{
  ['L', 'T', 'Z'].forEach(function (dt) {
    const html = Helpers.generalFieldKeywordsHtml([], 'genDT' + dt, new Set(), dt, 'O', [], false);
    check('MAPVAL row present for data type ' + dt, html.indexOf('genDT' + dt + '-gen-mapval-on') >= 0);
  });
  const htmlChar = Helpers.generalFieldKeywordsHtml([], 'genA3', new Set(), 'A', 'O', [], false);
  check('MAPVAL row absent for data type A', htmlChar.indexOf('genA3-gen-mapval-on') === -1);
}

console.log('\nwireGeneralFieldKeywordsEditor - BLKFOLD/FLTFIXDEC/FLTPCN/MAPVAL each commit correctly');
{
  // BLKFOLD (non-float, flag-only)
  {
    const keywords = [];
    document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(keywords, 'wireblk', new Set(), 'A', 'O', [], false);
    let committed = null;
    Helpers.wireGeneralFieldKeywordsEditor(keywords, function (next) { committed = next; }, 'wireblk', new Set(), function () {}, 'A', false, 'O');
    const blkOn = document.getElementById('wireblk-gen-blkfold-on');
    check('BLKFOLD checkbox exists', !!blkOn);
    if (blkOn) {
      blkOn.checked = true;
      blkOn.dispatchEvent(new dom.window.Event('change'));
      check('BLKFOLD toggle commits BLKFOLD keyword', !!committed && committed.some(function (k) { return k.name === 'BLKFOLD'; }));
    }
  }
  // FLTPCN (float, free-text parameter)
  {
    const keywords = [];
    document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(keywords, 'wirefltpcn', new Set(), 'F', 'O', [], false);
    let committed = null;
    Helpers.wireGeneralFieldKeywordsEditor(keywords, function (next) { committed = next; }, 'wirefltpcn', new Set(), function () {}, 'F', false, 'O');
    const onEl = document.getElementById('wirefltpcn-gen-fltpcn-on');
    const paramsEl = document.getElementById('wirefltpcn-gen-fltpcn-params');
    check('FLTPCN checkbox exists', !!onEl);
    check('FLTPCN params box exists', !!paramsEl);
    if (onEl && paramsEl) {
      onEl.checked = true;
      paramsEl.value = '*DOUBLE';
      onEl.dispatchEvent(new dom.window.Event('change'));
      const fltpcnKw = committed && committed.find(function (k) { return k.name === 'FLTPCN'; });
      check('FLTPCN toggle commits FLTPCN(*DOUBLE)', !!fltpcnKw && fltpcnKw.parameters === '*DOUBLE');
    }
  }
  // MAPVAL (datetime, free-text parameter)
  {
    const keywords = [];
    document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(keywords, 'wiremapval', new Set(), 'L', 'O', [], false);
    let committed = null;
    Helpers.wireGeneralFieldKeywordsEditor(keywords, function (next) { committed = next; }, 'wiremapval', new Set(), function () {}, 'L', false, 'O');
    const onEl = document.getElementById('wiremapval-gen-mapval-on');
    const paramsEl = document.getElementById('wiremapval-gen-mapval-params');
    check('MAPVAL checkbox exists', !!onEl);
    if (onEl && paramsEl) {
      onEl.checked = true;
      paramsEl.value = "('01/01/40' *BLANK)";
      onEl.dispatchEvent(new dom.window.Event('change'));
      const mapvalKw = committed && committed.find(function (k) { return k.name === 'MAPVAL'; });
      check('MAPVAL toggle commits MAPVAL with typed parameters', !!mapvalKw && mapvalKw.parameters === "('01/01/40' *BLANK)");
    }
  }
}

// ===========================================================================
// CSRINPONLY - file-level and record-level General panels
// ===========================================================================
console.log('\nfileKeywordsPanelsHtml/wireFileKeywordsPanels - CSRINPONLY row present and commits');
{
  const keywords = [];
  const panels = Helpers.fileKeywordsPanelsHtml(keywords, new Set());
  check('fk-csrinponly row present in General panel', panels.general.indexOf('fk-csrinponly-on') >= 0);
  document.getElementById('root').innerHTML = panels.general;
  let committed = null;
  Helpers.wireFileKeywordsPanels(function () { return keywords; }, function (next) { committed = next; }, new Set(), function () {}, function () { return { fileKeywords: keywords, records: [] }; });
  const onEl = document.getElementById('fk-csrinponly-on');
  check('CSRINPONLY checkbox exists', !!onEl);
  if (onEl) {
    onEl.checked = true;
    onEl.dispatchEvent(new dom.window.Event('change'));
    check('CSRINPONLY toggle commits CSRINPONLY keyword', !!committed && committed.some(function (k) { return k.name === 'CSRINPONLY'; }));
  }
}

console.log('\nrecordKeywordsPanelsHtml/wireRecordKeywordsPanels - CSRINPONLY row present and commits');
{
  const keywords = [];
  const panels = Helpers.recordKeywordsPanelsHtml(keywords, 'rk', new Set());
  check('rk-csrinponly row present in General panel', panels.general.indexOf('rk-csrinponly-on') >= 0);
  document.getElementById('root').innerHTML = panels.general;
  let committed = null;
  Helpers.wireRecordKeywordsPanels('rk', function () { return keywords; }, function (next) { committed = next; }, new Set(), function () {}, function () { return []; });
  const onEl = document.getElementById('rk-csrinponly-on');
  check('CSRINPONLY checkbox exists', !!onEl);
  if (onEl) {
    onEl.checked = true;
    onEl.dispatchEvent(new dom.window.Event('change'));
    check('CSRINPONLY toggle commits CSRINPONLY keyword', !!committed && committed.some(function (k) { return k.name === 'CSRINPONLY'; }));
  }
}

// ===========================================================================
// SFLCHCCTL / SFLCSRPRG - subfile field keywords panel
// ===========================================================================
console.log('\nsubfileFieldKeywordsHtml/wireSubfileFieldKeywords - SFLCHCCTL/SFLCSRPRG present and commit');
{
  const keywords = [];
  const html = Helpers.subfileFieldKeywordsHtml(keywords, 'sflfk');
  check('sflchcctl checkbox present', html.indexOf('sflfk-sflchcctl') >= 0);
  check('sflcsrprg checkbox present', html.indexOf('sflfk-sflcsrprg') >= 0);
  document.getElementById('root').innerHTML = html;
  let committed = null;
  // Task I-79 added two new params: isFirstField (true here - this test is
  // only about the row existing and wiring through, not the new structural
  // guards, which have their own dedicated test) and getField (an
  // already-correctly-shaped field, so the I-79 rewrite is a no-op and
  // this test's original "commits SFLCHCCTL" assertion still holds as-is).
  Helpers.wireSubfileFieldKeywords(keywords, function (next) { committed = next; }, 'sflfk', [], true, function () { return { dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' }; });
  const chcctlEl = document.getElementById('sflfk-sflchcctl');
  check('SFLCHCCTL checkbox exists', !!chcctlEl);
  if (chcctlEl) {
    chcctlEl.checked = true;
    chcctlEl.dispatchEvent(new dom.window.Event('change'));
    check('SFLCHCCTL toggle commits SFLCHCCTL keyword', !!committed && committed.some(function (k) { return k.name === 'SFLCHCCTL'; }));
  }
  const csrprgEl = document.getElementById('sflfk-sflcsrprg');
  check('SFLCSRPRG checkbox exists', !!csrprgEl);
  if (csrprgEl) {
    csrprgEl.checked = true;
    csrprgEl.dispatchEvent(new dom.window.Event('change'));
    check('SFLCSRPRG toggle commits SFLCSRPRG keyword', !!committed && committed.some(function (k) { return k.name === 'SFLCSRPRG'; }));
  }
}

// ===========================================================================
// SFLRTNSEL - SFLCTL record's selection-list panel
// ===========================================================================
console.log('\nsflChoiceListPanelHtml/wireSflChoiceListPanel - SFLRTNSEL present and commits');
{
  const rec = { keywords: [{ name: 'SFLMLTCHC', parameters: '', conditions: [] }] };
  const html = Helpers.sflChoiceListPanelHtml(rec, 'sflctl1');
  check('sflrtnsel checkbox present', html.indexOf('sflctl1-sflrtnsel') >= 0);
  document.getElementById('root').innerHTML = html;
  let committed = null;
  Helpers.wireSflChoiceListPanel('sflctl1', function () { return rec.keywords; }, function (next) { committed = next; });
  const el = document.getElementById('sflctl1-sflrtnsel');
  check('SFLRTNSEL checkbox exists', !!el);
  if (el) {
    el.checked = true;
    el.dispatchEvent(new dom.window.Event('change'));
    check('SFLRTNSEL toggle commits SFLRTNSEL keyword', !!committed && committed.some(function (k) { return k.name === 'SFLRTNSEL'; }));
  }
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

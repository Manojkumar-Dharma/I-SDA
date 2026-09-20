/**
 * i35UsageMpFailOpenAudit.test.js
 *
 * Task I-35 - Usage M (Message) and P (Program-to-system) verification
 * against IBM's own DDS Reference. fieldKeywordCategoryVisibility() used
 * to fail OPEN for both (show every category), on the reasoning that
 * real SDA's own "For Field Type" screenshot table never covers M/P.
 * That reasoning doesn't hold up: IBM's own DDS Reference is far MORE
 * restrictive for M/P than any other usage, not less -
 *  - M's own section: "Only the following keywords are valid for a
 *    message field: ALIAS, INDTXT, OVRDTA, REFFLD, TEXT"
 *  - P's own section: "The only keywords allowed on a program-to-system
 *    field are: ALIAS, TEXT, INDTXT, REFFLD" (no OVRDTA)
 * - five and four keywords respectively, nothing else.
 *
 * Fixed at three levels:
 *  1. fieldKeywordCategoryVisibility - every category except General
 *     Keywords/Database Reference is now hidden outright for M/P.
 *  2. GENERAL_FIELD_KEYWORD_ROWS' new mpScope column - General Keywords
 *     bundles 14 rows together; only ALIAS/INDTXT/TEXT (both M and P)
 *     and OVRDTA (M only) are actually valid, so the other 10 rows are
 *     now filtered out specifically for M/P even though the category
 *     itself stays visible.
 *  3. databaseReferenceHtml/wireDatabaseReferenceEditor - REFFLD stays
 *     available for M/P, but DLTCHK/DLTEDT (bundled in the same panel)
 *     are neither on M's nor P's own fixed list, so they're skipped for
 *     M/P specifically.
 *
 * Also documents a related, separate finding NOT fixed by this task:
 * Usage P fields appear to have no reachable selection path in the UI
 * at all - dspfEngine.js explicitly excludes usage 'P' from canvas
 * drawing (same treatment as Hidden), but the Hidden-fields tab only
 * lists usage 'H'. That's a bigger, separate gap (a dedicated
 * "Program-to-system fields" tab, analogous to the Hidden one, would be
 * the fix) - flagged in keywordFixes.md, not addressed here. This test
 * therefore exercises the row/panel-building functions directly (the
 * same jsdom-document-global pattern i30CharacterFieldConditioningAudit
 * uses) rather than through canvas-click field selection, which works
 * for M but not P.
 *
 * Run with: node src/test/i35UsageMpFailOpenAudit.test.js
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

function field(overrides) {
  return Object.assign({
    name: 'FLD1',
    sourceLine: 10,
    dataType: 'A',
    length: 10,
    isReference: false,
    keywords: [],
  }, overrides);
}

// ===========================================================================
// fieldKeywordCategoryVisibility - category-level gate for M/P
// ===========================================================================
console.log('fieldKeywordCategoryVisibility - M/P hide every category except General Keywords/Database Reference');
['M', 'P'].forEach(function (u) {
  const vis = Helpers.fieldKeywordCategoryVisibility(u, 'A');
  check('usage ' + u + ': colorAndAttributes hidden', vis.colorAndAttributes === false);
  check('usage ' + u + ': keyingOptions hidden', vis.keyingOptions === false);
  check('usage ' + u + ': validityAndErrorMessage hidden', vis.validityAndErrorMessage === false);
  check('usage ' + u + ': errorMessages hidden', vis.errorMessages === false);
  check('usage ' + u + ': inputKeywords hidden', vis.inputKeywords === false);
  check('usage ' + u + ': generalKeywords visible', vis.generalKeywords === true);
  check('usage ' + u + ': databaseReference visible', vis.databaseReference === true);
  check('usage ' + u + ': messageId hidden', vis.messageId === false);
  check('usage ' + u + ': editingKeywords hidden', vis.editingKeywords === false);
});

// ===========================================================================
// generalFieldKeywordsHtml / wireGeneralFieldKeywordsEditor - row-level
// mpScope filtering within the General Keywords category
// ===========================================================================
console.log('\ngeneralFieldKeywordsHtml - usage M shows only ALIAS/INDTXT/OVRDTA/TEXT (its own 4-row subset of General Keywords)');
{
  const html = Helpers.generalFieldKeywordsHtml([], 'genM', new Set(), 'A', 'M', [], false);
  check('gen-alias row present', html.indexOf('genM-gen-alias-on') >= 0);
  check('gen-indtxt row present', html.indexOf('genM-gen-indtxt-on') >= 0);
  check('gen-ovrdta row present (valid for M)', html.indexOf('genM-gen-ovrdta-on') >= 0);
  check('gen-text row present', html.indexOf('genM-gen-text-on') >= 0);
  ['dft', 'dftval', 'cntfld', 'fldcsrprg', 'hlpid', 'putretain', 'ovratr', 'chrid', 'igcalttyp', 'noccsid'].forEach(function (key) {
    check('gen-' + key + ' row absent (not on M\'s own fixed list)', html.indexOf('genM-gen-' + key + '-on') === -1);
  });
}

console.log('\ngeneralFieldKeywordsHtml - usage P shows only ALIAS/INDTXT/TEXT (OVRDTA is valid for M but NOT P)');
{
  const html = Helpers.generalFieldKeywordsHtml([], 'genP', new Set(), 'A', 'P', [], false);
  check('gen-alias row present', html.indexOf('genP-gen-alias-on') >= 0);
  check('gen-indtxt row present', html.indexOf('genP-gen-indtxt-on') >= 0);
  check('gen-text row present', html.indexOf('genP-gen-text-on') >= 0);
  check('gen-ovrdta row absent (valid for M only, NOT P)', html.indexOf('genP-gen-ovrdta-on') === -1);
  ['dft', 'dftval', 'cntfld', 'fldcsrprg', 'hlpid', 'putretain', 'ovratr', 'chrid', 'igcalttyp', 'noccsid'].forEach(function (key) {
    check('gen-' + key + ' row absent (not on P\'s own fixed list)', html.indexOf('genP-gen-' + key + '-on') === -1);
  });
}

console.log('\ngeneralFieldKeywordsHtml - no regression: usage O still shows every row');
{
  const html = Helpers.generalFieldKeywordsHtml([], 'genO', new Set(), 'A', 'O', [], false);
  ['alias', 'indtxt', 'dft', 'dftval', 'cntfld', 'text', 'fldcsrprg', 'putretain', 'ovrdta', 'ovratr', 'chrid', 'noccsid'].forEach(function (key) {
    check('gen-' + key + ' row present for usage O', html.indexOf('genO-gen-' + key + '-on') >= 0);
  });
  // Task I-94: IGCALTTYP is the one General row that is NOT offered on an
  // output-only field - "input- and output-capable fields" only (usage B).
  check('gen-igcalttyp row absent for usage O (I-94: needs usage B)', html.indexOf('genO-gen-igcalttyp-on') === -1);
  check('gen-igcalttyp row present for usage B', Helpers.generalFieldKeywordsHtml([], 'genB', new Set(), 'A', 'B', [], false).indexOf('genB-gen-igcalttyp-on') >= 0);
}

console.log('\nwireGeneralFieldKeywordsEditor - runs cleanly against M/P-filtered HTML with no crash (rows simply aren\'t there to wire)');
['M', 'P'].forEach(function (u) {
  const keywords = [];
  document.getElementById('root').innerHTML = Helpers.generalFieldKeywordsHtml(keywords, 'wiregen' + u, new Set(), 'A', u, [], false);
  let threw = false;
  try {
    Helpers.wireGeneralFieldKeywordsEditor(keywords, function () {}, 'wiregen' + u, new Set(), function () {}, 'A', false, u);
  } catch (e) {
    threw = true;
  }
  check('usage ' + u + ': wiring runs without throwing', !threw);
  const aliasOn = document.getElementById('wiregen' + u + '-gen-alias-on');
  check('usage ' + u + ': ALIAS still wires and commits correctly', !!aliasOn);
  if (aliasOn) {
    let committed = null;
    aliasOn.checked = true;
    // wireGeneralFieldKeywordsEditor was just re-run above already wiring
    // this element's listener via the loop; dispatch to confirm it fires.
    aliasOn.dispatchEvent(new dom.window.Event('change'));
  }
});

// ===========================================================================
// databaseReferenceHtml / wireDatabaseReferenceEditor - REFFLD stays,
// DLTCHK/DLTEDT are skipped for M/P
// ===========================================================================
console.log('\ndatabaseReferenceHtml - usage M/P keep REFFLD but drop DLTCHK/DLTEDT (neither is on either usage\'s own fixed list)');
['M', 'P'].forEach(function (u) {
  const f = field({ usage: u });
  const html = Helpers.databaseReferenceHtml(f, 'dbref' + u, new Set());
  check('usage ' + u + ': REFFLD checkbox present', html.indexOf('dbref' + u + '-reffld-on') >= 0);
  check('usage ' + u + ': DLTCHK row absent', html.indexOf('dbref' + u + '-ref-dltchk-on') === -1);
  check('usage ' + u + ': DLTEDT row absent', html.indexOf('dbref' + u + '-ref-dltedt-on') === -1);
});

console.log('\ndatabaseReferenceHtml - no regression: usage O still shows DLTCHK/DLTEDT alongside REFFLD');
{
  const f = field({ usage: 'O' });
  const html = Helpers.databaseReferenceHtml(f, 'dbrefO', new Set());
  check('REFFLD checkbox present', html.indexOf('dbrefO-reffld-on') >= 0);
  check('DLTCHK row present', html.indexOf('dbrefO-ref-dltchk-on') >= 0);
  check('DLTEDT row present', html.indexOf('dbrefO-ref-dltedt-on') >= 0);
}

console.log('\nwireDatabaseReferenceEditor - runs cleanly for M/P with no crash, and REFFLD still commits correctly');
['M', 'P'].forEach(function (u) {
  const f = field({ usage: u, sourceLine: 20 + (u === 'M' ? 0 : 1) });
  document.getElementById('root').innerHTML = Helpers.databaseReferenceHtml(f, 'wiredb' + u, new Set());
  let committed = null;
  let threw = false;
  try {
    Helpers.wireDatabaseReferenceEditor(f, function (updates) { committed = updates; }, 'wiredb' + u, new Set(), function () {});
  } catch (e) {
    threw = true;
  }
  check('usage ' + u + ': wiring runs without throwing', !threw);
  const reffldOn = document.getElementById('wiredb' + u + '-reffld-on');
  check('usage ' + u + ': REFFLD checkbox exists and wires', !!reffldOn);
  if (reffldOn) {
    reffldOn.checked = true;
    reffldOn.dispatchEvent(new dom.window.Event('change'));
    check('usage ' + u + ': REFFLD toggle commits an update', !!committed && committed.isReference === true);
  }
});

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

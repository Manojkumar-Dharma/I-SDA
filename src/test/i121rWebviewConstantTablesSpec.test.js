/**
 * i121rWebviewConstantTablesSpec.test.js
 *
 * Task I-121r - the webview's hand-written constant tables. Four value-domain
 * lists (DSPATR, COLOR, WDWBORDER attributes, CHGINPDFT codes) are now read
 * from the spec (see i121DisplayAttrValueDomainKeywordSpec.test.js for those).
 * This file pins the REST: tables that stay in the webview because they carry
 * screen wording / screen grouping, but whose keyword content must still be
 * exactly what the spec says, so a mistyped or missing code cannot drift in.
 *
 * Run with: node src/test/i121rWebviewConstantTablesSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const web = fs.readFileSync(path.join(__dirname, '../webviewClientHelpers.js'), 'utf8');
const sorted = (a) => a.slice().sort().join();

// Pull the quoted codes out of a `var NAME = [ ... ];` literal, first string of each entry.
function codesOf(name, re) {
  const m = web.match(new RegExp('var ' + name + ' = \\[([\\s\\S]*?)\\n  \\];'));
  if (!m) return null;
  return (m[1].match(re) || []).map((s) => s.replace(/^[^']*'|'$/g, ''));
}

console.log('=== record-indicator kinds (RECORD_INDICATOR_INSTANCE_KEYWORDS) ===');
const kinds = codesOf('RECORD_INDICATOR_INSTANCE_KEYWORDS', /\['[A-Z]+'/g);
check('parsed the kind list', !!kinds && kinds.length > 0);
check('exactly the spec record-indicator keywords', sorted(kinds) === sorted(KeywordSpec.recordIndicatorKeywordNames()));
check('the writer hands the webview the same list', sorted(DspfWriter.recordIndicatorKeywordNames()) === sorted(kinds));

console.log('\n=== CHECK codes (VALIDITY_CHECK_CODES, KEYING_OPTION_CODES) ===');
const validity = codesOf('VALIDITY_CHECK_CODES', /\{ code: '[A-Z0-9]+'/g);
const keying = codesOf('KEYING_OPTION_CODES', /\{ code: '[A-Z0-9]+'/g);
const immed = (web.match(/immedCode: '[A-Z0-9]+'/g) || []).map((s) => s.replace(/^[^']*'|'$/g, ''));
const specCodes = KeywordSpec.checkCodes();
check('parsed both lists', !!validity && !!keying);
check('every VALIDITY code is a spec CHECK code', validity.every((c) => specCodes.indexOf(c) >= 0));
check('every immediate-variant code is a spec CHECK code', immed.every((c) => specCodes.indexOf(c) >= 0));
check('every KEYING code is a spec CHECK code', keying.every((c) => specCodes.indexOf(c) >= 0));
check('validity + keying + immediate variants cover the spec set except RLTB (not offered as a checkbox)',
  sorted(validity.concat(keying, immed.filter((c) => validity.indexOf(c) < 0))) === sorted(specCodes.filter((c) => c !== 'RLTB')));
check('no code is offered in both lists', validity.every((c) => keying.indexOf(c) < 0));

console.log('\n=== choice colour states (CHOICE_COLOR_STATES) ===');
const states = (web.match(/\{ key: '[a-z]+', keyword: '[A-Z]+'/g) || []).map((s) => s.match(/keyword: '([A-Z]+)'/)[1]);
check('parsed three states', states.length === 3);
check('exactly the spec CHC colour-state keywords', sorted(states) === sorted(KeywordSpec.choiceColorStateKeywords()));

console.log('\n=== classified as screen text, nothing to derive ===');
check('BORDER_POSITIONS is 8 positions numbered 0-7 (WDWBORDER characters)', (codesOf('BORDER_POSITIONS', /key: \d/g) || []).map((s) => s.replace('key: ', '')).join() === '0,1,2,3,4,5,6,7');
// RECORD_TYPES is the "+ Add record" wizard's menu (value + screen label); SFLCTL is deliberately absent.
check('RECORD_TYPES offers the nine wizard record types, no SFLCTL',
  (codesOf('RECORD_TYPES', /\{ value: '[A-Z]+'/g) || []).join() === 'RECORD,USRDFN,SFL,SFLMSG,WINDOW,WDWSFL,PULDWN,PDNSFL,MNUBAR');

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

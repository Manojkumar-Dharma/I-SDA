/**
 * i121nInputFormatFieldKeywordsSpec.test.js
 *
 * Task I-121n - input, format and display field keywords: KEYBRD, BLANKS,
 * CNTFLD, FLTFIXDEC, FLTPCN, MAPVAL, FLDCSRPRG, ERRMSG get RECORD_TYPES entries
 * verified against DDS_Keyword_V7r6.txt. The General-tab row filter's
 * 'float-only' (FLTFIXDEC, FLTPCN) and 'datetime-only' (MAPVAL) data-type scopes
 * now read the spec's `requiredDataTypes` instead of their own literals; this
 * pins the entries to the reference and the rendered rows to the old behaviour.
 *
 * Run with: node src/test/i121nInputFormatFieldKeywordsSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const NAMES = ['KEYBRD', 'BLANKS', 'CNTFLD', 'FLTFIXDEC', 'FLTPCN', 'MAPVAL', 'FLDCSRPRG', 'ERRMSG'];
const S = KeywordSpec.RECORD_TYPES;

console.log('\n1. every keyword has an entry, citing the DDS Reference');
NAMES.forEach((n) => check(n + ' has a RECORD_TYPES entry', !!S[n] && typeof S[n].ddsReference === 'string'));
// Each cited sentence must appear verbatim (whitespace-normalised) in the reference.
NAMES.filter((n) => n !== 'KEYBRD').forEach((n) => {
  S[n].ddsReference.split(/(?<=\.)\s+/).forEach((sentence) => {
    check(n + ': cited sentence is in the reference: "' + sentence.slice(0, 60) + '..."', REF.indexOf(sentence) >= 0);
  });
});

console.log('\n2. KEYBRD is not a DDS keyword');
check('"KEYBRD" occurs nowhere in the DDS Reference', REF.indexOf('KEYBRD') < 0);
check('its entry says so', S.KEYBRD.notADdsKeyword === true);
check('no other I-121n entry claims notADdsKeyword', NAMES.filter((n) => S[n].notADdsKeyword).join() === 'KEYBRD');
check('the position-35 table it stands for exists in the spec', typeof KeywordSpec.keyboardShiftValues === 'function' && KeywordSpec.keyboardShiftValues('A').length > 0);

console.log('\n3. the facts the reference states');
check('CNTFLD: input-capable (I, B), data type A', S.CNTFLD.allowedUsage.join() === 'I,B' && S.CNTFLD.requiredDataTypes.join() === 'A');
check('FLTFIXDEC: output-capable (B, O), floating point F', S.FLTFIXDEC.allowedUsage.join() === 'B,O' && S.FLTFIXDEC.requiredDataTypes.join() === 'F');
check('FLTPCN: floating point F only', S.FLTPCN.requiredDataTypes.join() === 'F' && !S.FLTPCN.allowedUsage);
check('MAPVAL: date L, time T or timestamp Z', S.MAPVAL.requiredDataTypes.join() === 'L,T,Z');
check('BLANKS and FLDCSRPRG: input-capable (I, B)', S.BLANKS.allowedUsage.join() === 'I,B' && S.FLDCSRPRG.allowedUsage.join() === 'I,B');
check('ERRMSG states no usage or data-type restriction', !S.ERRMSG.allowedUsage && !S.ERRMSG.requiredDataTypes);
check('accessors return copies', (() => { const a = KeywordSpec.requiredDataTypes('MAPVAL'); a.push('X'); return KeywordSpec.requiredDataTypes('MAPVAL').length === 3; })());
// Sweep: which keywords in the lookup carry a required data type - exactly VALNUM plus these four.
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8'));
const carriers = Object.keys(lookup.keywords).filter((k) => KeywordSpec.requiredDataTypes(k)).sort().join();
check('requiredDataTypes is carried by exactly CNTFLD, FLTFIXDEC, FLTPCN, MAPVAL, VALNUM', carriers === 'CNTFLD,FLTFIXDEC,FLTPCN,MAPVAL,VALNUM');
check('existing neighbours are untouched (BLKFOLD still blocks F, DUP none)', KeywordSpec.requiredDataTypes('BLKFOLD') === null && KeywordSpec.requiredDataTypes('DUP') === null);

console.log('\n4. the General-tab rows still appear for exactly the old data types');
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.document = dom.window.document; global.Node = dom.window.Node; global.window = dom.window;
  global.DspfWriter = DspfWriter;
  const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
  const OLD = {
    fltfixdec: (d) => d === 'F',
    fltpcn: (d) => d === 'F',
    mapval: (d) => d === 'L' || d === 'T' || d === 'Z',
    blkfold: (d) => d !== 'F',
  };
  ['', 'A', 'P', 'S', 'B', 'F', 'L', 'T', 'Z', 'Y', 'O', 'J', 'E', 'G', 'N', 'X', 'W', 'I', 'D', 'M'].forEach((dt) => {
    const html = Helpers.generalFieldKeywordsHtml([], 'k', new Set(), dt, 'B', [], false, undefined);
    Object.keys(OLD).forEach((key) => {
      check('data type "' + dt + '": ' + key + ' row ' + (OLD[key](dt) ? 'shown' : 'hidden'), (html.indexOf('-gen-' + key) >= 0) === OLD[key](dt));
    });
  });
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

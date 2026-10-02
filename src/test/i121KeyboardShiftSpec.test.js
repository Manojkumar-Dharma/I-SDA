/**
 * i121KeyboardShiftSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", keyboard-shift
 * (position 35) value-domain slice. The Keying options panel hand-kept two
 * literal shift-value lists (character / numeric) plus the numeric-field
 * test choosing between them, and buildWebviewTemplate.js kept the Data type
 * choices as three copies. IBM's own "Valid entries for display files"
 * table (DDS_Keyword_V7r6.txt ~line 930) is now KeywordSpec's
 * KEYBOARD_SHIFT_ENTRIES (code -> data type permitted); the lists are
 * derived from it and the panel reads them.
 *
 * Verifies:
 *  1. the spec table against IBM's: each shift code's permitted class.
 *  2. keyboardShiftValues per data type, EXACT panel order (the existing
 *     panel tests only sort), numeric for S/Y/L/T/Z/F, character for
 *     everything else including blank, undefined, unknown and lower case.
 *  3. both lists are derived (no character-only code on the numeric list,
 *     no numeric-only code on the character list), fresh arrays.
 *  4. keyboardShiftPermitted / isPosition35Value edges.
 *  5. the panel renders exactly those lists, and the Data type choices
 *     helper stays inside the spec's position-35 values.
 *
 * Run with: node src/test/i121KeyboardShiftSpec.test.js
 */
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { JSDOM } = require('jsdom');
// webviewClientHelpers.js reads DspfWriter / document as browser globals.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check, failureCount } = require('./helpers/harness');

console.log('\nIBM "Valid entries" table - data type permitted per shift code');
{
  const ibm = { X: 'character', A: 'character', N: 'either', S: 'numeric', Y: 'numeric', W: 'character', I: 'either', D: 'either', M: 'character' };
  Object.keys(ibm).forEach(function (c) {
    check(c + ' permits ' + ibm[c] + ' fields', KeywordSpec.keyboardShiftPermitted(c) === ibm[c]);
  });
  ['J', 'O', 'E', 'G'].forEach(function (c) {
    check(c + ' (DBCS data type) is character', KeywordSpec.keyboardShiftPermitted(c) === 'character');
  });
  check('lower case is accepted', KeywordSpec.keyboardShiftPermitted('s') === 'numeric');
  ['F', 'L', 'T', 'Z', '', 'B', 'P', 'AA', null, undefined, 5].forEach(function (c) {
    check(JSON.stringify(c) + ' is not a keyboard shift', KeywordSpec.keyboardShiftPermitted(c) === null);
  });
}

console.log('\nkeyboardShiftValues - per data type, in panel order');
{
  ['S', 'Y', 'L', 'T', 'Z', 'F'].forEach(function (dt) {
    check(dt + ' -> numeric list S N Y I D', KeywordSpec.keyboardShiftValues(dt).join('') === 'SNYID' && KeywordSpec.isNumericShiftDataType(dt));
  });
  ['A', 'X', 'N', 'D', 'I', 'M', 'W', '', 'B', 'P', 's', 'l', undefined, null, 5].forEach(function (dt) {
    check(JSON.stringify(dt) + ' -> character list N A X W I D M J O E G', KeywordSpec.keyboardShiftValues(dt).join('') === 'NAXWIDMJOEG' && !KeywordSpec.isNumericShiftDataType(dt));
  });
  const num = KeywordSpec.keyboardShiftValues('S');
  const chr = KeywordSpec.keyboardShiftValues('A');
  check('no character-only code on the numeric list', num.every(function (c) { return KeywordSpec.keyboardShiftPermitted(c) !== 'character'; }));
  check('no numeric-only code on the character list', chr.every(function (c) { return KeywordSpec.keyboardShiftPermitted(c) !== 'numeric'; }));
  check('numeric and character lists share exactly the "either" codes', num.filter(function (c) { return chr.indexOf(c) >= 0; }).sort().join('') === 'DIN');
  num.pop();
  check('keyboardShiftValues returns a fresh array', KeywordSpec.keyboardShiftValues('S').length === 5);
  check('DspfWriter.keyboardShiftValues agrees', DspfWriter.keyboardShiftValues('S').join('') === 'SNYID' && DspfWriter.keyboardShiftValues('A').join('') === 'NAXWIDMJOEG');
}

console.log('\nisPosition35Value');
{
  ['X', 'A', 'N', 'S', 'Y', 'W', 'I', 'D', 'M', 'J', 'O', 'E', 'G', 'F', 'L', 'T', 'Z', 'l'].forEach(function (v) {
    check(v + ' is a position-35 value', KeywordSpec.isPosition35Value(v) && DspfWriter.isPosition35Value(v));
  });
  ['', 'B', 'P', 'H', 'LL', null, undefined, 3].forEach(function (v) {
    check(JSON.stringify(v) + ' is not a position-35 value', KeywordSpec.isPosition35Value(v) === false);
  });
}

console.log('\nPanel and data type choices read the spec');
{
  function optionValues(dt, owner) {
    const html = Helpers.keyingOptionsHtml([], owner, new Set(), dt);
    const m = new RegExp('<select class="' + owner + '-keyboard-shift">([\\s\\S]*?)</select>').exec(html);
    if (!m) return null;
    const out = []; const re = /<option value="([^"]*)"/g; let x;
    while ((x = re.exec(m[1]))) out.push(x[1]);
    return out.join(',');
  }
  check('numeric panel renders (none) then S N Y I D, in that order', optionValues('S', 'a') === ',S,N,Y,I,D');
  check('character panel renders (none) then N A X W I D M J O E G, in that order', optionValues('A', 'b') === ',N,A,X,W,I,D,M,J,O,E,G');
  check('blank data type renders the character panel', optionValues('', 'c') === ',N,A,X,W,I,D,M,J,O,E,G');

  const withBlank = Helpers.fieldDataTypeChoices(true);
  const noBlank = Helpers.fieldDataTypeChoices(false);
  check('Data type choices (no blank) are the 12 designer-settable values in order', noBlank.join('') === 'AXNSYIDMFLTZ');
  check('Data type choices (with blank) lead with the blank default', withBlank[0] === '' && withBlank.slice(1).join('') === 'AXNSYIDMFLTZ');
  check('every Data type choice is a spec position-35 value', noBlank.every(function (c) { return KeywordSpec.isPosition35Value(c); }));
  noBlank.pop();
  check('fieldDataTypeChoices returns a fresh array', Helpers.fieldDataTypeChoices(false).length === 12);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

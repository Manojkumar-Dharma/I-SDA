/**
 * fieldKeywordVisibility.test.js
 *
 * Direct unit coverage for Task D2's WebviewClientHelpers.fieldKeywordCategoryVisibility() -
 * the pure gate deciding which of D1's "Select Field Keywords" panels apply
 * to a field's CURRENT usage/data type, matching real SDA's own
 * "For Field Type" column (docs/sda-reference/screens/field-level/character/
 * _menu/image161.png). Pure Node, no vscode/jsdom needed - this is a plain
 * (usage, dataType) -> booleans function.
 * Run with: node src/test/fieldKeywordVisibility.test.js
 */
const path = require('path');
const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const { check, failureCount } = require('./helpers/harness');

function vis(usage, dataType) {
  return WebviewClientHelpers.fieldKeywordCategoryVisibility(usage, dataType);
}

console.log('\nWebviewClientHelpers.fieldKeywordCategoryVisibility() - D2 usage-based gating for D1\'s field-keyword panels');
{
  console.log('  Usage B (Both) - a normal data-entry field gets everything (not float)');
  const both = vis('B', 'A');
  check('colorAndAttributes visible for B', both.colorAndAttributes === true);
  check('keyingOptions visible for B', both.keyingOptions === true);
  check('validityAndErrorMessage visible for B (not float)', both.validityAndErrorMessage === true);
  check('inputKeywords visible for B', both.inputKeywords === true);
  check('generalKeywords always visible', both.generalKeywords === true);
  check('databaseReference visible for B', both.databaseReference === true);
  check('messageId visible for B', both.messageId === true);

  console.log('  Usage H (Hidden) - only Keying options, General keywords, and Database reference apply; nothing display/input-specific');
  const hidden = vis('H', 'A');
  check('colorAndAttributes hidden for H', hidden.colorAndAttributes === false);
  check('keyingOptions visible for H', hidden.keyingOptions === true);
  check('validityAndErrorMessage hidden for H', hidden.validityAndErrorMessage === false);
  check('inputKeywords hidden for H', hidden.inputKeywords === false);
  check('generalKeywords still visible for H', hidden.generalKeywords === true);
  check('databaseReference visible for H', hidden.databaseReference === true);
  check('messageId hidden for H', hidden.messageId === false);

  console.log('  Usage I (Input) - Keying/Validity/Input keywords apply; Message ID (Output-only) does not');
  const input = vis('I', 'A');
  check('colorAndAttributes visible for I', input.colorAndAttributes === true);
  check('keyingOptions visible for I', input.keyingOptions === true);
  check('validityAndErrorMessage visible for I (not float)', input.validityAndErrorMessage === true);
  check('inputKeywords visible for I', input.inputKeywords === true);
  check('databaseReference visible for I', input.databaseReference === true);
  check('messageId hidden for I (Output-only category)', input.messageId === false);

  console.log('  Usage O (Output) - Message ID/Database reference apply; Keying/Validity/Input keywords (all Input-side) do not');
  const output = vis('O', 'A');
  check('colorAndAttributes visible for O', output.colorAndAttributes === true);
  check('keyingOptions hidden for O', output.keyingOptions === false);
  check('validityAndErrorMessage hidden for O', output.validityAndErrorMessage === false);
  check('inputKeywords hidden for O', output.inputKeywords === false);
  check('databaseReference visible for O', output.databaseReference === true);
  check('messageId visible for O', output.messageId === true);

  console.log('  Validity check additionally excludes float (dataType F) fields even when Input or Both');
  check('validityAndErrorMessage hidden for Input + float', vis('I', 'F').validityAndErrorMessage === false);
  check('validityAndErrorMessage hidden for Both + float', vis('B', 'F').validityAndErrorMessage === false);
  check('validityAndErrorMessage still visible for Input + non-float (A)', vis('I', 'A').validityAndErrorMessage === true);

  console.log('  Genuinely blank/unset usage (no position-38 entry yet) still fails OPEN - not one of IBM\'s six defined codes to look up a fixed list for');
  const blank = vis('', 'A');
  check('blank usage: colorAndAttributes stays visible', blank.colorAndAttributes === true);
  check('blank usage: keyingOptions stays visible', blank.keyingOptions === true);
  check('blank usage: inputKeywords stays visible', blank.inputKeywords === true);
  check('blank usage: databaseReference stays visible', blank.databaseReference === true);
  check('blank usage: messageId stays visible', blank.messageId === true);
  check('blank usage + float dataType still hides validityAndErrorMessage (float rule always applies)', vis('', 'F').validityAndErrorMessage === false);
  const undef = vis(undefined, undefined);
  check('undefined usage/dataType: colorAndAttributes stays visible (constants have no usage of their own)', undef.colorAndAttributes === true);
  check('undefined usage/dataType: generalKeywords always visible', undef.generalKeywords === true);

  console.log('  Task I-35: Usage M/P no longer fail open - IBM documents a fixed, much SMALLER keyword list for both than any other usage, so every category except General Keywords/Database reference is now hidden outright');
  const m = vis('M', 'A');
  check('usage M: colorAndAttributes hidden (not on M\'s own fixed keyword list)', m.colorAndAttributes === false);
  check('usage M: keyingOptions hidden', m.keyingOptions === false);
  check('usage M: validityAndErrorMessage hidden', m.validityAndErrorMessage === false);
  check('usage M: errorMessages hidden', m.errorMessages === false);
  check('usage M: inputKeywords hidden', m.inputKeywords === false);
  check('usage M: generalKeywords stays visible (ALIAS/INDTXT/OVRDTA/TEXT are on M\'s own list)', m.generalKeywords === true);
  check('usage M: databaseReference stays visible (REFFLD is on M\'s own list)', m.databaseReference === true);
  check('usage M: messageId hidden (MSGID is not on M\'s own list)', m.messageId === false);
  check('usage M: editingKeywords hidden', m.editingKeywords === false);

  const p = vis('P', 'A');
  check('usage P: colorAndAttributes hidden (not on P\'s own fixed keyword list)', p.colorAndAttributes === false);
  check('usage P: keyingOptions hidden', p.keyingOptions === false);
  check('usage P: validityAndErrorMessage hidden', p.validityAndErrorMessage === false);
  check('usage P: errorMessages hidden', p.errorMessages === false);
  check('usage P: inputKeywords hidden', p.inputKeywords === false);
  check('usage P: generalKeywords stays visible (ALIAS/INDTXT/TEXT are on P\'s own list)', p.generalKeywords === true);
  check('usage P: databaseReference stays visible (REFFLD is on P\'s own list)', p.databaseReference === true);
  check('usage P: messageId hidden', p.messageId === false);
  check('usage P: editingKeywords hidden', p.editingKeywords === false);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

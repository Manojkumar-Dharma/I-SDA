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

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

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

  console.log('  Unrecognized/blank usage (M, P, undefined) fails OPEN - never hides a category SDA\'s own table never covers');
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
  const m = vis('M', 'A');
  check('usage M: colorAndAttributes stays visible (not Hidden)', m.colorAndAttributes === true);
  check('usage M: messageId stays visible (unrecognized usage fails open)', m.messageId === true);
  const p = vis('P', 'A');
  check('usage P: colorAndAttributes stays visible (not Hidden)', p.colorAndAttributes === true);
  check('usage P: keyingOptions stays visible (unrecognized usage fails open)', p.keyingOptions === true);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

/**
 * i121CommandKeyGrammarSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", command-key grammar
 * / alt-key table slice. The CAnn / CFnn name shape was hand-copied three
 * times (dspfEngine.js COMMAND_KEY_RE, dspfWriter.js COMMAND_KEY_RE and
 * COMMAND_KEY_TOKEN_RE) and the alt-key names were hand-listed in three more
 * places (the writer's ALT_KEY_NAMES, altKeyFileExclusions' own array and the
 * file-level webview's wiring loop). Both are now KeywordSpec facts:
 * parseCommandKey / isCommandKeyName / commandKeyTypes and altKeyNames /
 * isAltKeyName / altKeyDefaultKey.
 *
 * Verifies:
 *  1. the grammar: exact CAnn/CFnn only (two digits, upper case, no padding),
 *     non-strings and near-misses rejected.
 *  2. the alt-key set is derived from the spec entries: exactly ALTHELP,
 *     ALTPAGEDWN, ALTPAGEUP in declared order, with the DDS Reference
 *     defaults (CA01 / CF08 / CF07); case-insensitive and own-property safe.
 *  3. altKeyFileExclusions still lists the same three.
 *  4. the callers still behave: the engine's function-key legend and the
 *     writer's parseCommandKeys / MOUBTN / alt-key exclusion checks.
 *
 * Run with: node src/test/i121CommandKeyGrammarSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

console.log('\nKeywordSpec.parseCommandKey / isCommandKeyName / commandKeyTypes');
{
  const p = KeywordSpec.parseCommandKey('CA05');
  check('CA05 parses to { CA, 05 }', p && p.type === 'CA' && p.number === '05');
  const f = KeywordSpec.parseCommandKey('CF24');
  check('CF24 parses to { CF, 24 }', f && f.type === 'CF' && f.number === '24');
  check('CA00 is grammatical (the range is a separate domain fact)', KeywordSpec.isCommandKeyName('CA00'));
  ['CA5', 'CA005', 'CB01', 'ca05', ' CA05', 'CA05 ', 'CA0A', '', 'CA', 'ALTHELP', 'CA05(10)'].forEach(function (t) {
    check('"' + t + '" is not a command key', KeywordSpec.parseCommandKey(t) === null && !KeywordSpec.isCommandKeyName(t));
  });
  [null, undefined, 5, {}, ['CA05']].forEach(function (t) {
    check('non-string ' + JSON.stringify(t) + ' is not a command key', KeywordSpec.parseCommandKey(t) === null);
  });
  check('commandKeyTypes is CA, CF in order', KeywordSpec.commandKeyTypes().join() === 'CA,CF');
  const types = KeywordSpec.commandKeyTypes(); types.push('CX');
  check('commandKeyTypes returns a fresh array', KeywordSpec.commandKeyTypes().length === 2);
  check('DspfWriter.parseCommandKey agrees with the spec', DspfWriter.parseCommandKey('CF07').number === '07');
}

console.log('\nKeywordSpec.altKeyNames / isAltKeyName / altKeyDefaultKey');
{
  check('altKeyNames is ALTHELP, ALTPAGEDWN, ALTPAGEUP in declared order', KeywordSpec.altKeyNames().join() === 'ALTHELP,ALTPAGEDWN,ALTPAGEUP');
  check('DspfWriter.altKeyNames matches', DspfWriter.altKeyNames().join() === 'ALTHELP,ALTPAGEDWN,ALTPAGEUP');
  const names = KeywordSpec.altKeyNames(); names.pop();
  check('altKeyNames returns a fresh array', KeywordSpec.altKeyNames().length === 3);
  const expected = { ALTHELP: ['CA', '01'], ALTPAGEDWN: ['CF', '08'], ALTPAGEUP: ['CF', '07'] };
  Object.keys(expected).forEach(function (n) {
    const d = KeywordSpec.altKeyDefaultKey(n);
    check(n + ' default key is ' + expected[n].join(''), d && d.type === expected[n][0] && d.number === expected[n][1]);
    check(n + ' claimedKeyType equals its default key type', KeywordSpec.RECORD_TYPES[n].claimedKeyType === expected[n][0]);
    check(n + ' is an alt key', KeywordSpec.isAltKeyName(n) && KeywordSpec.isAltKeyName(n.toLowerCase()));
  });
  ['MOUBTN', 'CA01', 'SFLDROP', 'MNUCNL', 'constructor', '__proto__', 'toString', '', null, undefined].forEach(function (n) {
    check(String(n) + ' is not an alt key', KeywordSpec.isAltKeyName(n) === false && KeywordSpec.altKeyDefaultKey(n) === null);
  });
  const withDefault = Object.keys(KeywordSpec.RECORD_TYPES).filter(function (k) { return typeof KeywordSpec.RECORD_TYPES[k].defaultKey === 'string'; });
  check('no other top-level RECORD_TYPES entry carries a defaultKey', withDefault.join() === 'ALTHELP,ALTPAGEDWN,ALTPAGEUP');
  check('altKeyFileExclusions lists the same three', Object.keys(KeywordSpec.altKeyFileExclusions()).join() === 'ALTHELP,ALTPAGEDWN,ALTPAGEUP');
}

console.log('\nCallers - engine legend and writer command-key helpers');
{
  const kws = [{ name: 'CA03', parameters: '', conditions: [] }, { name: 'CF12', parameters: "12 'Cancel'", conditions: [] }, { name: 'ALTHELP', parameters: '', conditions: [] }, { name: 'CA3', parameters: '', conditions: [] }];
  const parsed = DspfWriter.parseCommandKeys(kws);
  check('parseCommandKeys keeps CA03 and CF12 and skips ALTHELP / CA3', parsed.length === 2 && parsed[0].type === 'CA' && parsed[0].number === '03' && parsed[1].type === 'CF' && parsed[1].number === '12');
  check('parseCommandKeys still reads indicator and text', parsed[1].indicator === '12' && parsed[1].text === 'Cancel');
  const removed = DspfWriter.removeCommandKeyAt(kws, 0);
  check('removeCommandKeyAt removes the first command key only', removed.length === 3 && removed[0].name === 'CF12');
  const legend = DspfEngine.resolveFunctionKeyLegend({ fileKeywords: kws }, null, new Set());
  check('the engine legend lists CA03 then CF12 and ignores the rest', legend.length === 2 && legend[0].type === 'CA' && legend[0].number === '03' && legend[1].type === 'CF' && legend[1].number === '12');
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

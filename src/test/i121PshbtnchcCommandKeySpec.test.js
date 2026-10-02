/**
 * i121PshbtnchcCommandKeySpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", PSHBTNCHC command-key
 * domain slice. PSHBTNCHC(choice-number choice-text [command-key] [*SPACEB])
 * documents its command-key domain as "CA01 to CA24, CF01 to CF24, PRINT,
 * HELP, CLEAR, ENTER, HOME, ROLLUP, and ROLLDOWN" (omitted = ENTER). It lived
 * as a generated array in the writer and a hand-written regex in the engine.
 * It is now keywordSpec.js's PSHBTNCHC_COMMAND_KEY_DOMAIN; both derive from it.
 *
 * Run with: node src/test/i121PshbtnchcCommandKeySpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const { check } = require('./helpers/harness');

const OLD_LIST = (() => {
  const keys = [];
  for (let i = 1; i <= 24; i++) keys.push('CA' + (i < 10 ? '0' : '') + i);
  for (let i = 1; i <= 24; i++) keys.push('CF' + (i < 10 ? '0' : '') + i);
  return keys.concat(['PRINT', 'HELP', 'CLEAR', 'ENTER', 'HOME', 'ROLLUP', 'ROLLDOWN']);
})();

console.log('\nspec fact');
{
  check('domain equals the old generated list, same order', KeywordSpec.pshbtnchcCommandKeys().join() === OLD_LIST.join());
  check('55 keys (24 CA + 24 CF + 7 names)', KeywordSpec.pshbtnchcCommandKeys().length === 55);
  check('omitted parameter means ENTER', KeywordSpec.pshbtnchcDefaultCommandKey() === 'ENTER');
  const ref = KeywordSpec.pshbtnchcCommandKeyReference();
  check('citation names the range and the default', /CA01 to CA24/.test(ref) && /CF01 to CF24/.test(ref) && /ENTER will be used/.test(ref));
  const a = KeywordSpec.pshbtnchcCommandKeys(); a.push('X'); a.shift();
  check('accessor returns a fresh copy', KeywordSpec.pshbtnchcCommandKeys().length === 55 && KeywordSpec.pshbtnchcCommandKeys()[0] === 'CA01');
  check('the seven names are exactly MOUBTN Command key\'s names',
    KeywordSpec.RECORD_TYPES.MOUBTN.commandKeyNames.slice().sort().join() ===
    KeywordSpec.pshbtnchcCommandKeys().filter((k) => !/^C[AF]\d\d$/.test(k)).sort().join());
  check('the CA/CF ranges equal MOUBTN\'s',
    JSON.stringify(KeywordSpec.RECORD_TYPES.MOUBTN.commandKeyRanges) === JSON.stringify([{ prefix: 'CA', min: 1, max: 24 }, { prefix: 'CF', min: 1, max: 24 }]));
}

console.log('\nisPshbtnchcCommandKey');
{
  ['CA01', 'ca24', 'CF12', 'Enter', 'ROLLDOWN', 'print', 'HOME'].forEach((k) => check(k + ' accepted', KeywordSpec.isPshbtnchcCommandKey(k)));
  ['CA00', 'CA25', 'CF99', 'CA1', 'PAGEUP', 'PAGEDOWN', '*SPACEB', '', null, undefined, 7].forEach((k) => check(String(k) + ' rejected', !KeywordSpec.isPshbtnchcCommandKey(k)));
}

console.log('\nwriter derives from the spec');
{
  check('DspfWriter.PSHBTNCHC_COMMAND_KEYS equals the old list', DspfWriter.PSHBTNCHC_COMMAND_KEYS.join() === OLD_LIST.join());
  const p = DspfWriter.parsePshbtnchcParams("1 '>Help' HELP");
  check('parsePshbtnchcParams reads a named key', p.commandKey === 'HELP' && p.id === '1' && p.text === '>Help');
  check('lowercase key is upper-cased', DspfWriter.parsePshbtnchcParams("2 'X' ca05").commandKey === 'CA05');
  check('*SPACEB still read alongside a key', (() => { const r = DspfWriter.parsePshbtnchcParams("3 'X' CF24 *SPACEB"); return r.commandKey === 'CF24' && r.spaceBefore; })());
  check('omitted key stays blank', DspfWriter.parsePshbtnchcParams("4 'X'").commandKey === '');
  check('an unknown token is ignored', DspfWriter.parsePshbtnchcParams("5 'X' PAGEUP").commandKey === '');
  check('CA25 is ignored by the writer', DspfWriter.parsePshbtnchcParams("6 'X' CA25").commandKey === '');
}

console.log('\nengine derives from the spec');
{
  const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
  const { buildLine } = require('../fixtures/lineBuilder');
  const rec = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' });
  const pb = buildLine({ seq: '00020', name: 'BTN', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '24', col: '2', func: 'PSHBTNFLD' });
  const chc = (seq, text) => buildLine({ seq, func: 'PSHBTNCHC(' + text + ')' });
  const keyOf = (text) => {
    const model = DspfParser.parseDspf([rec, pb, chc('00030', text)].join('\n') + '\n');
    const f = DspfEngine.resolveScreen(model, 'SCR1', new Set()).fields.find((x) => x.name === 'BTN');
    return f.widget.choices[0].commandKey;
  };
  check('engine reads a named key', keyOf("1 '>Help' HELP") === 'HELP');
  check('engine reads CF24 and a lowercase ca01', keyOf("1 'X' CF24") === 'CF24' && keyOf("1 'X' ca01") === 'CA01');
  check('engine reads *SPACEB alongside a key', (() => { const m = DspfEngine.resolveScreen(DspfParser.parseDspf([rec, pb, chc('00030', "1 'X' ROLLUP *SPACEB")].join('\n') + '\n'), 'SCR1', new Set()).fields.find((x) => x.name === 'BTN'); return m.widget.choices[0].commandKey === 'ROLLUP' && m.widget.choices[0].spaceBefore === true; })());
  check('engine ignores an unknown token and an omitted key', keyOf("1 'X' PAGEUP") === '' && keyOf("1 'X'") === '');
  check('engine now agrees with the writer on out-of-range keys (CA00 / CA25)', keyOf("1 'X' CA00") === '' && keyOf("1 'X' CA25") === '');
}

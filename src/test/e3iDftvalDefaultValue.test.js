/**
 * e3iDftvalDefaultValue.test.js - E3i: the preview draws a DFTVAL default value in the field.
 *
 * IBM DDS Reference, DFTVAL: "On the first output operation, the specified value is displayed if the option
 * indicator is on or has not been specified. Otherwise, the program value is used." Valid on O and B named fields,
 * not on constants, not in a subfile format. The program value is unknown at design time, so the field name stands
 * in for it when the DFTVAL is not in effect.
 * Pure Node. Run with: node src/test/e3iDftvalDefaultValue.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const H = require('./helpers/keywordMatrix');
const { check } = require('./helpers/harness');
const { dds } = H;

const field = (o) => dds(Object.assign({ len: 10, type: 'A', use: 'B', line: 3, col: 2 }, o));
const screen = (src, rec, set) => DspfEngine.resolveScreen(DspfParser.parseDspf(src), rec || 'R1', set || new Set());
const textOf = (scr, name) => (scr.fields.filter((f) => f.name === name)[0] || {}).text;
const rec = (...lines) => [dds({ t: 'R', name: 'R1' })].concat(lines).join('\n') + '\n';

console.log('E3i: the value replaces the field name');
{
  const s = screen(rec(field({ name: 'F1', fn: "DFTVAL('Hello')" })));
  check('B field: value, padded with blanks to the field length', textOf(s, 'F1') === 'Hello     ');
  const o = screen(rec(field({ name: 'F1', use: 'O', fn: "DFTVAL('Hello')" })));
  check('O field: value drawn too', textOf(o, 'F1') === 'Hello     ');
  const none = screen(rec(field({ name: 'F1' })));
  check('no DFTVAL: the field name as before', textOf(none, 'F1') === 'F1XXXXXXXX');
}

console.log('E3i: value shape');
{
  check('value longer than the field is cut to the field length', textOf(screen(rec(field({ name: 'F1', len: 3, fn: "DFTVAL('ABCDEF')" }))), 'F1') === 'ABC');
  check('doubled quote is one quote', textOf(screen(rec(field({ name: 'F1', fn: "DFTVAL('IT''S')" }))), 'F1') === "IT'S      ");
  check('numeric field: DFTVAL(\'000\') draws 000', textOf(screen(rec(field({ name: 'F1', len: 3, type: 'S', dec: 0, use: 'O', fn: "DFTVAL('000')" }))), 'F1') === '000');
  check('unquoted value (still being typed): the field name stays', textOf(screen(rec(field({ name: 'F1', fn: 'DFTVAL(abc)' }))), 'F1') === 'F1XXXXXXXX');
}

console.log('E3i: option indicators');
{
  const src = rec(field({ name: 'F1' }), dds({ ind: ' 01', fn: "DFTVAL('A')" }));
  check('indicator 01 off: the program value (field name) stays', textOf(screen(src, 'R1', new Set()), 'F1') === 'F1XXXXXXXX');
  check('indicator 01 on: the default value', textOf(screen(src, 'R1', new Set(['01'])), 'F1') === 'A         ');
  const neg = rec(field({ name: 'F1' }), dds({ ind: 'N01', fn: "DFTVAL('A')" }));
  check('N01: value while 01 is off', textOf(screen(neg, 'R1', new Set()), 'F1') === 'A         ');
  check('N01: field name while 01 is on', textOf(screen(neg, 'R1', new Set(['01'])), 'F1') === 'F1XXXXXXXX');
  // two instances, each under its own indicator (as IBM's example does with indicator 10)
  const two = rec(field({ name: 'F1' }), dds({ ind: ' 10', fn: "DFTVAL('000')" }), dds({ ind: 'N10', fn: "DFTVAL('999')" }));
  check('two instances: the first one whose condition holds', textOf(screen(two, 'R1', new Set()), 'F1') === '999       ' && textOf(screen(two, 'R1', new Set(['10'])), 'F1') === '000       ');
}

console.log('E3i: where DFTVAL does not apply');
{
  const sflSrc = [dds({ t: 'R', name: 'SFLR' }), dds({ fn: 'SFL' }), field({ name: 'S1', use: 'O', line: 5, fn: "DFTVAL('X')" }),
    dds({ t: 'R', name: 'CTL' }), dds({ fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(10)' }), dds({ fn: 'SFLPAG(5)' }), dds({ fn: 'SFLDSP' }), dds({ fn: 'SFLDSPCTL' })].join('\n') + '\n';
  const sp = screen(sflSrc, 'CTL').subfilePreview;
  const rows = JSON.stringify(sp);
  check('subfile format: DFTVAL is not drawn', rows.indexOf('"text":"X ') === -1);
  const input = screen(rec(field({ name: 'F1', use: 'I', fn: "DFTVAL('A')" })));
  check('input-only field: not drawn (DFTVAL needs an output-capable field)', textOf(input, 'F1') === 'F1XXXXXXXX');
  const constant = screen(rec(dds({ line: 3, col: 2, fn: "'Const'" }), field({ name: 'F2', line: 5 })));
  check('a constant is untouched', constant.fields.some((f) => f.text === 'Const'));
}

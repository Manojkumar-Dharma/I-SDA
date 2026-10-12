/**
 * e3jMenuBarSeparator.test.js - E3j: the menu-bar separator line (MNUBAR / MNUBARSEP) and the menu bar
 * a record displays (MNUBARDSP), both under the active option indicators.
 * Pure Node. Run with: node src/test/e3jMenuBarSeparator.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');

const barField = (line) => dds({ name: 'MBF', len: 2, type: 'Y', dec: 0, use: 'B', line: line || 1, col: 2 });
const choice = dds({ fn: "MNUBARCHC(1 PULLFILE 'File')" });
const build = (lines) => DspfParser.parseDspf(lines.join('\n') + '\n');
const S = (arr) => new Set(arr || []);
const sep = (m, rec, on) => DspfEngine.resolveScreen(m, rec, S(on)).menuBarSeparator;
const BLUE = '#4a9eff';

console.log('E3j: the separator line of a MNUBAR record');
{
  const m = build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), choice]);
  const r = DspfEngine.resolveScreen(m, 'MB', S());
  check('default: a separator on the line below the bar', r.menuBarSeparator && r.menuBarSeparator.line === 2);
  check('default: blue dashes across the whole screen', r.menuBarSeparator.char === '-' && r.menuBarSeparator.color === BLUE && r.menuBarSeparator.width === r.columns);
  check('default: drawn in the screen HTML', DspfEngine.renderScreenHtml(r).indexOf('class="dspf-menubar-sep"') !== -1);
  const m2 = build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR(*NOSEPARATOR)' }), barField(1), choice]);
  check('MNUBAR(*NOSEPARATOR): no separator', sep(m2, 'MB') == null);
  const m3 = build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR(*SEPARATOR)' }), barField(3), choice]);
  check('the separator follows the bar field (bar on line 3: line 4)', sep(m3, 'MB').line === 4);
}

console.log('E3j: MNUBARSEP parameters');
{
  const one = (kw) => sep(build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), dds({ fn: kw }), choice]), 'MB');
  check('(*CHAR \'=\') sets the character', one("MNUBARSEP((*CHAR '='))").char === '=');
  check('(*COLOR RED) sets the colour', one('MNUBARSEP((*COLOR RED))').color === '#ff5c5c');
  check('(*DSPATR UL) is kept', one('MNUBARSEP((*DSPATR UL))').attrs.join() === 'UL');
  check('ND hides the separator', one('MNUBARSEP((*DSPATR ND))') == null);
  // The Reference text and its example disagree about HI / RI / UL; the example is followed.
  ['HI', 'RI', 'UL', 'BL', 'CS'].forEach((a) => check('(*DSPATR ' + a + ') still displays the separator', one('MNUBARSEP((*DSPATR ' + a + '))') != null));
  const html = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), dds({ fn: 'MNUBARSEP((*DSPATR RI))' }), choice]), 'MB', S()));
  check('RI draws the line as a reverse-image bar', /dspf-menubar-sep"[^>]*background:/.test(html));
  const bl = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), dds({ fn: 'MNUBARSEP((*DSPATR BL))' }), choice]), 'MB', S()));
  check('BL blinks', bl.indexOf('dspf-menubar-sep dspf-blink') !== -1);
}

console.log('E3j: MNUBARSEP under option indicators (first in effect wins)');
{
  const m = build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), dds({ ind: 'N02', fn: "MNUBARSEP((*CHAR '.'))" }), dds({ ind: ' 02', fn: "MNUBARSEP((*CHAR '='))" }), choice]);
  check('02 off: the N02 instance', sep(m, 'MB', []).char === '.');
  check('02 on: the 02 instance', sep(m, 'MB', ['02']).char === '=');
  const only = build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), dds({ ind: ' 02', fn: "MNUBARSEP((*CHAR '='))" }), choice]);
  check('only a 02 instance, 02 off: the default separator', sep(only, 'MB', []).char === '-');
}

console.log('E3j: MNUBARDSP on an ordinary record');
{
  const m = build([dds({ t: 'R', name: 'REC1' }), dds({ ind: ' 01', fn: 'MNUBARDSP(MB &CH)' }), dds({ name: 'F1', len: 10, type: 'A', use: 'B', line: 10, col: 12 }), dds({ name: 'CH', len: 2, type: 'Y', dec: 0, use: 'H' }),
    dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), choice]);
  const names = (on) => DspfEngine.resolveScreen(m, 'REC1', S(on)).fields.map((f) => f.name).join();
  check('01 off: no menu bar', names([]) === 'F1');
  check('01 on: the bar of MB is drawn with the record', names(['01']) === 'MBF,F1');
  check('01 on: and its separator', sep(m, 'REC1', ['01']) && sep(m, 'REC1', ['01']).line === 2);
  check('01 off: no separator', sep(m, 'REC1', []) == null);
  const bar = DspfEngine.resolveScreen(m, 'REC1', S(['01'])).fields.find((f) => f.name === 'MBF');
  check('the drawn bar still carries its choices and its own record name', bar.widget && bar.widget.choices.length === 1 && bar.sourceRecord === 'MB');
  const two = build([dds({ t: 'R', name: 'REC1' }), dds({ ind: ' 01', fn: 'MNUBARDSP(MB1 &CH)' }), dds({ ind: ' 02', fn: 'MNUBARDSP(MB2 &CH)' }), dds({ name: 'CH', len: 2, type: 'Y', dec: 0, use: 'H' }),
    dds({ t: 'R', name: 'MB1', fn: 'MNUBAR' }), dds({ name: 'A1', len: 2, type: 'Y', dec: 0, use: 'B', line: 1, col: 2 }), choice,
    dds({ t: 'R', name: 'MB2', fn: 'MNUBAR' }), dds({ name: 'A2', len: 2, type: 'Y', dec: 0, use: 'B', line: 1, col: 2 }), choice]);
  const pick = (on) => DspfEngine.resolveScreen(two, 'REC1', S(on)).fields.filter((f) => f.widget).map((f) => f.name).join();
  check('both on: the first in effect (MB1) is used', pick(['01', '02']) === 'A1');
  check('only 02 on: MB2', pick(['02']) === 'A2');
  const bad = build([dds({ t: 'R', name: 'REC1' }), dds({ fn: 'MNUBARDSP(NOPE &CH)' }), dds({ name: 'F1', len: 10, type: 'A', use: 'B', line: 10, col: 12 }), dds({ name: 'CH', len: 2, type: 'Y', dec: 0, use: 'H' })]);
  check('a record that does not exist draws nothing and does not throw', DspfEngine.resolveScreen(bad, 'REC1', S()).fields.length === 1);
  const notBar = build([dds({ t: 'R', name: 'REC1' }), dds({ fn: 'MNUBARDSP(OTHER &CH)' }), dds({ name: 'CH', len: 2, type: 'Y', dec: 0, use: 'H' }), dds({ t: 'R', name: 'OTHER' }), dds({ name: 'X', len: 5, type: 'A', use: 'B', line: 3, col: 2 })]);
  check('a target without MNUBAR is not drawn', DspfEngine.resolveScreen(notBar, 'REC1', S()).fields.every((f) => f.name !== 'X'));
}

console.log('E3j: MNUBARDSP on the menu-bar record');
{
  const m = build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), dds({ ind: ' 01', fn: 'MNUBARDSP' }), barField(1), choice]);
  const r = (on) => DspfEngine.resolveScreen(m, 'MB', S(on));
  check('01 off: the bar is not displayed', r([]).fields.length === 0 && r([]).menuBarSeparator == null);
  check('01 on: the bar and its separator', r(['01']).fields.length === 1 && r(['01']).menuBarSeparator != null);
  const plain = build([dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), choice]);
  check('no MNUBARDSP at all: not gated', DspfEngine.resolveScreen(plain, 'MB', S()).fields.length === 1);
}

console.log('E3j: display mode (several records)');
{
  const m = build([dds({ t: 'R', name: 'REC1' }), dds({ ind: ' 01', fn: 'MNUBARDSP(MB &CH)' }), dds({ name: 'F1', len: 10, type: 'A', use: 'B', line: 10, col: 12 }), dds({ name: 'CH', len: 2, type: 'Y', dec: 0, use: 'H' }),
    dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), barField(1), choice]);
  const r = DspfEngine.resolveMultiScreen(m, ['REC1'], S(['01']));
  check('the separators list holds the bar line', r.menuBarSeparators.length === 1 && r.menuBarSeparators[0].line === 2);
  check('drawn in the multi-record HTML', DspfEngine.renderScreenHtml(r).indexOf('dspf-menubar-sep') !== -1);
  check('01 off: none', DspfEngine.resolveMultiScreen(m, ['REC1'], S()).menuBarSeparators.length === 0);
}

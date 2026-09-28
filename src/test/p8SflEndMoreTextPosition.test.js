/**
 * P8 - SFLEND(*MORE): the More/Bottom text sits at the display's right edge
 * (IBM DDS Reference, SFLEND, "Position of More and Bottom text with *MORE
 * option"): 24x80 -> positions 67-80, 27x132 -> positions 119-132 of the line
 * after the subfile's last line - beginning attribute, right-aligned text,
 * ending attribute. Pure Node: engine only.
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

function model(ctl, dsp, rowCol) {
  const lines = [
    buildLine({ seq: '00010', func: dsp || 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: rowCol || '2' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ].concat(ctl);
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const scr = (m, ind) => DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(ind || []), null, false, 0);
const more = (kw, ind1, dsp, rowCol) => model([buildLine({ seq: '00205', ind1: ind1, func: kw })], dsp, rowCol);

console.log('P8: 24x80 - positions 67-80, text right-aligned in 68-79');
{
  const ml = scr(more('SFLEND(*MORE)')).subfilePreview.moreLine;
  check('reserved span is 67-80 (14 positions)', ml.col === 67 && ml.width === 14);
  check('text occupies 68-79 (12 positions, attributes at both ends)', ml.textCol === 68 && ml.textWidth === 12);
  check('flagged as display-edge placement', ml.atDisplayEdge === true);
  check('line right after the last subfile row (3 + 5 = 8)', ml.line === 8);
  const html = DspfEngine.renderScreenHtml(scr(more('SFLEND(*MORE)')));
  check('rendered at grid-column 68 span 12', /dspf-subfile-more-line" style="grid-row:8;grid-column:68 \/ span 12;/.test(html));
  check('title explains the positions', html.includes('right-aligned in positions 67-80'));
}

console.log('P8: 27x132 - positions 119-132, text in 120-131');
{
  const ml = scr(more('SFLEND(*MORE)', undefined, 'DSPSIZ(27 132 *DS4)')).subfilePreview.moreLine;
  check('reserved span is 119-132', ml.col === 119 && ml.width === 14);
  check('text occupies 120-131', ml.textCol === 120 && ml.textWidth === 12);
}

console.log('P8: independent of where the subfile\'s own fields sit');
{
  const a = scr(more('SFLEND(*MORE)', undefined, undefined, '2')).subfilePreview.moreLine;
  const b = scr(more('SFLEND(*MORE)', undefined, undefined, '40')).subfilePreview.moreLine;
  check('same columns for a left-hand and a right-hand subfile', a.col === b.col && a.textCol === b.textCol);
}

console.log('P8: More/Bottom text still follows the SFLEND indicator (P7) at the new position');
{
  const m = more('SFLEND(*MORE)', '49');
  const off = scr(m, []).subfilePreview.moreLine;
  const on = scr(m, ['49']).subfilePreview.moreLine;
  check('off -> More..., on -> Bottom, same position', off.text === 'More...' && on.text === 'Bottom' && off.textCol === on.textCol && off.col === 67);
}

console.log('P8: *SCRBAR *MORE fallback uses the same display-edge position');
{
  const sfp = scr(more('SFLEND(*SCRBAR *MORE)')).subfilePreview;
  check('More line at 67-80 alongside the scroll bar', !!sfp.scrollbar && sfp.moreLine.col === 67);
}

console.log('P8: inside a window the pre-P8 placement (subfile\'s own span) is kept');
{
  const m = model([buildLine({ seq: '00204', func: 'WINDOW(2 5 12 40)' }), buildLine({ seq: '00205', func: 'SFLEND(*MORE)' })]);
  const ml = scr(m).subfilePreview.moreLine;
  check('not at the display edge', ml.atDisplayEdge === false);
  check('spans the subfile\'s own columns; text = full span', ml.width === 20 && ml.textCol === ml.col && ml.textWidth === ml.width && ml.col < 67);
}

console.log('P8: row budget / reserved line unchanged (last screen line still 24)');
{
  const lines = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0200)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0040)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
    buildLine({ seq: '00205', func: 'SFLEND(*MORE)' }),
  ];
  const sfp = scr(DspfParser.parseDspf(lines.join('\n') + '\n')).subfilePreview;
  check('More line on the screen\'s last line (24), rows clamped to 21', sfp.moreLine.line === 24 && sfp.pageRows === 21);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

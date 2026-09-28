/**
 * P7 - SFLEND end-of-subfile state in the preview (IBM DDS Reference, "SFLEND"):
 * plus sign for bare SFLEND / *PLUS, More vs Bottom text and scroll-box position
 * driven by the keyword's own option indicator. Pure Node: engine only.
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

function model(ctlLines, dsp) {
  const lines = [
    buildLine({ seq: '00010', func: dsp || 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ].concat(ctlLines);
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const screenOf = (m, ind, sizeIdx) => DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(ind || []), null, false, sizeIdx || 0);
const sfpOf = (m, ind, sizeIdx) => screenOf(m, ind, sizeIdx).subfilePreview;
const sflEndLine = (kw, ind1) => buildLine({ seq: '00205', ind1: ind1, func: kw });

console.log('P7: bare SFLEND draws a "+" on the last subfile line, column 79 of 80');
{
  const sfp = sfpOf(model([sflEndLine('SFLEND')]));
  check('plusMark resolved', !!sfp.plusMark);
  check('on the last line the subfile occupies (3..7 -> 7)', sfp.plusMark.line === 7);
  check('column 79 (attribute, +, attribute = 78-80)', sfp.plusMark.col === 79);
  check('no More line / scroll bar', sfp.moreLine === null && sfp.scrollbar === null);
  check('state more, system-paged (not indicator-driven)', sfp.sflEnd.state === 'more' && sfp.sflEnd.viaIndicator === false);
  const html = DspfEngine.renderScreenHtml(screenOf(model([sflEndLine('SFLEND')])));
  check('rendered HTML has the plus element', html.includes('dspf-subfile-plus') && />\+<\/div>/.test(html));
}

console.log('P7: SFLEND(*PLUS) is the same as bare SFLEND; 27x132 puts the plus at column 131');
{
  const a = sfpOf(model([sflEndLine('SFLEND(*PLUS)')]));
  check('*PLUS draws the plus', a.plusMark && a.plusMark.col === 79);
  const b = sfpOf(model([sflEndLine('SFLEND')], 'DSPSIZ(27 132 *DS4)'));
  check('27x132 -> column 131', b.plusMark && b.plusMark.col === 131);
}

console.log('P7: indicator-conditioned bare SFLEND - off shows the plus, on hides it');
{
  const m = model([sflEndLine('SFLEND', '49')]);
  const off = sfpOf(m, []);
  check('indicator 49 off -> plus shown (More state)', !!off.plusMark && off.sflEnd.state === 'more' && off.sflEnd.viaIndicator === true);
  const on = sfpOf(m, ['49']);
  check('indicator 49 on -> plus hidden (Bottom state)', on.plusMark === null && on.sflEnd.state === 'bottom');
  check('the html has no plus element when hidden', !DspfEngine.renderScreenHtml(screenOf(m, ['49'])).includes('dspf-subfile-plus'));
}

console.log('P7: 49 SFLEND(*MORE) - "More..." with the indicator off, "Bottom" with it on');
{
  const m = model([sflEndLine('SFLEND(*MORE)', '49')]);
  const off = sfpOf(m, []);
  check('off -> line reserved, text More...', !!off.moreLine && off.moreLine.text === 'More...');
  const on = sfpOf(m, ['49']);
  check('on -> same reserved line, text Bottom', !!on.moreLine && on.moreLine.text === 'Bottom' && on.moreLine.line === off.moreLine.line);
  check('same row count either way', on.pageRows === off.pageRows);
  check('rendered HTML carries the text', DspfEngine.renderScreenHtml(screenOf(m, ['49'])).includes('>Bottom</div>') && DspfEngine.renderScreenHtml(screenOf(m, [])).includes('>More...</div>'));
  check('*MORE alone never draws a plus', off.plusMark === null && on.plusMark === null);
}

console.log('P7: unconditioned SFLEND(*MORE) keeps showing More... (unchanged)');
{
  const sfp = sfpOf(model([sflEndLine('SFLEND(*MORE)')]));
  check('More... shown', sfp.moreLine.text === 'More...' && sfp.sflEnd.viaIndicator === false);
}

console.log('P7: 49 SFLEND(*SCRBAR) - scroll box one page above the bottom button (off) vs on it (on)');
{
  const m = model([sflEndLine('SFLEND(*SCRBAR)', '49')]);
  const off = sfpOf(m, []);
  check('off -> boxState more', off.scrollbar && off.scrollbar.boxState === 'more');
  const on = sfpOf(m, ['49']);
  check('on -> boxState bottom', on.scrollbar && on.scrollbar.boxState === 'bottom');
  check('html thumb class follows the state', DspfEngine.renderScreenHtml(screenOf(m, [])).includes('dspf-scrollbar-thumb dspf-scrollbar-thumb-more') && DspfEngine.renderScreenHtml(screenOf(m, ['49'])).includes('dspf-scrollbar-thumb dspf-scrollbar-thumb-bottom'));
  const un = sfpOf(model([sflEndLine('SFLEND(*SCRBAR)')]));
  check('unconditioned -> boxState null, thumb class unchanged', un.scrollbar.boxState === null && !DspfEngine.renderScreenHtml(screenOf(model([sflEndLine('SFLEND(*SCRBAR)')]))).includes('dspf-scrollbar-thumb-'));
}

console.log('P7: *SCRBAR with a *PLUS / *MORE fallback draws both, in the same state');
{
  const m = model([sflEndLine('SFLEND(*SCRBAR *MORE)', '49')]);
  const on = sfpOf(m, ['49']);
  check('on -> scroll box at bottom AND Bottom text', on.scrollbar.boxState === 'bottom' && on.moreLine.text === 'Bottom');
  const p = sfpOf(model([sflEndLine('SFLEND(*SCRBAR *PLUS)', '49')]), []);
  check('*SCRBAR *PLUS off -> scroll bar AND a plus', !!p.scrollbar && !!p.plusMark);
}

console.log('P7: N49 SFLEND - negated indicator is the "more" side');
{
  const m = model([sflEndLine('SFLEND(*MORE)', 'N49')]);
  check('49 off -> instance active through N49 -> More...', sfpOf(m, []).moreLine.text === 'More...');
  check('49 on -> instance inactive, indicator-driven -> still reserved, More...', sfpOf(m, ['49']).moreLine.text === 'More...');
}

console.log('P7: two instances (49 SFLEND(*MORE) / N49 SFLEND(*SCRBAR)) pick per indicator');
{
  const m = model([sflEndLine('SFLEND(*MORE)', '49'), buildLine({ seq: '00206', ind1: 'N49', func: 'SFLEND(*SCRBAR)' })]);
  const on = sfpOf(m, ['49']);
  check('49 on -> Bottom text, no scroll bar', on.moreLine && on.moreLine.text === 'Bottom' && on.scrollbar === null);
  const off = sfpOf(m, []);
  check('49 off -> scroll bar (more), no More line', off.scrollbar && off.scrollbar.boxState === 'more' && off.moreLine === null);
}

console.log('P7: an instance for another display size does not apply');
{
  const m = model([buildLine({ seq: '00205', sizeCondition: '*DS4', func: 'SFLEND' })]);
  check('24x80 (*DS3): no SFLEND state at all', sfpOf(m).sflEnd === null && sfpOf(m).plusMark === null);
}

console.log('P7: no SFLEND -> nothing new');
{
  const sfp = sfpOf(model([]));
  check('sflEnd null, no plus, no more line', sfp.sflEnd === null && sfp.plusMark === null && sfp.moreLine === null);
}

console.log('P7: plus follows the drawn SFLDROP form (last line of the truncated rows)');
{
  const lines = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    buildLine({ seq: '00102', name: 'ROWDESC', length: '30', dataType: 'A', usage: 'O', line: '4', col: '6' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDROP(CF03)' }),
    buildLine({ seq: '00205', func: 'SFLEND' }),
  ];
  const m = DspfParser.parseDspf(lines.join('\n') + '\n');
  check('truncated: 10 lines (3..12) -> plus on line 12', DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(), null, false, 0, false).subfilePreview.plusMark.line === 12);
  check('folded (key pressed): 5 x 2 lines (3..12) -> plus on line 12', DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(), null, false, 0, true).subfilePreview.plusMark.line === 12);
}

console.log('P7: windowed subfile - plus rides the subfile\'s own right edge');
{
  const m = model([buildLine({ seq: '00204', func: 'WINDOW(2 5 12 40)' }), sflEndLine('SFLEND')]);
  const sfp = sfpOf(m);
  check('plus col is the row\'s last column (offset 4 + 2 + 20 - 1 = 25), not 79', sfp.plusMark && sfp.plusMark.col === 25);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

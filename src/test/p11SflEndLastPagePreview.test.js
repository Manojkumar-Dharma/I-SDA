/**
 * P11 - "show last page" design-time toggle for an UNCONDITIONED SFLEND: with no
 * option indicator the OS pages the subfile itself, so the preview shows the
 * More form by default and can flip to the Bottom form on request.
 * Pure Node: engine only (the hint-bar button is covered where the webview
 * harness allows).
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

function model(kwLines) {
  const lines = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
    buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ].concat(kwLines);
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const sfp = (m, ind, lastPage) => DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(ind || []), null, false, 0, false, lastPage).subfilePreview;
const kw = (func, ind1) => buildLine({ seq: '00205', ind1: ind1, func: func });

console.log('P11: unconditioned SFLEND(*MORE) - default More..., toggle -> Bottom');
{
  const m = model([kw('SFLEND(*MORE)')]);
  const a = sfp(m);
  check('default: More..., can show last page, not shown', a.moreLine.text === 'More...' && a.sflEnd.canShowLastPage === true && a.sflEnd.lastPage === false && a.sflEnd.state === 'more');
  const b = sfp(m, [], true);
  check('toggled: Bottom, state bottom, lastPage true', b.moreLine.text === 'Bottom' && b.sflEnd.state === 'bottom' && b.sflEnd.lastPage === true);
  check('same reserved line and row count either way', a.moreLine.line === b.moreLine.line && a.pageRows === b.pageRows);
  check('rendered HTML carries the text', DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(), null, false, 0, false, true)).includes('>Bottom</div>'));
}

console.log('P11: bare SFLEND - plus hidden on the last page');
{
  const m = model([kw('SFLEND')]);
  check('default: plus shown', !!sfp(m).plusMark);
  check('last page: plus hidden', sfp(m, [], true).plusMark === null);
}

console.log('P11: unconditioned SFLEND(*SCRBAR) - scroll box goes to the bottom button');
{
  const m = model([kw('SFLEND(*SCRBAR)')]);
  check('default: box position not shown as a state (null, top of the strip)', sfp(m).scrollbar.boxState === null);
  check('last page: boxState bottom', sfp(m, [], true).scrollbar.boxState === 'bottom');
  const html = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(), null, false, 0, false, true));
  check('html thumb class follows', html.includes('dspf-scrollbar-thumb dspf-scrollbar-thumb-bottom'));
}

console.log('P11: *SCRBAR *MORE fallback - everything flips together');
{
  const p = sfp(model([kw('SFLEND(*SCRBAR *MORE)')]), [], true);
  check('scroll box bottom AND Bottom text', p.scrollbar.boxState === 'bottom' && p.moreLine.text === 'Bottom');
}

console.log('P11: indicator-driven SFLEND ignores the toggle (the indicators already drive it)');
{
  const m = model([kw('SFLEND(*MORE)', '49')]);
  const off = sfp(m, [], true);
  check('cannot show last page; indicator off still More...', off.sflEnd.canShowLastPage === false && off.sflEnd.lastPage === false && off.moreLine.text === 'More...');
  const on = sfp(m, ['49'], true);
  check('indicator on still Bottom, lastPage false', on.moreLine.text === 'Bottom' && on.sflEnd.lastPage === false);
}

console.log('P11: no SFLEND / other-size-only SFLEND - no toggle offered');
{
  check('no SFLEND -> sflEnd null', sfp(model([]), [], true).sflEnd === null);
  const other = model([buildLine({ seq: '00205', sizeCondition: '*DS4', func: 'SFLEND' })]);
  check('SFLEND for another display size -> sflEnd null', sfp(other, [], true).sflEnd === null);
}

console.log('P11: size-only-conditioned SFLEND for this size is still system-paged -> toggle offered');
{
  const m = model([buildLine({ seq: '00205', sizeCondition: '*DS3', func: 'SFLEND(*MORE)' })]);
  const s = sfp(m, [], true);
  check('canShowLastPage and Bottom', s.sflEnd.canShowLastPage === true && s.moreLine.text === 'Bottom');
}

console.log('P11: default call (no 8th argument) is unchanged from P7/P8');
{
  const s = DspfEngine.resolveScreen(model([kw('SFLEND(*MORE)')]), 'SFLCTLR', new Set(), null, false, 0).subfilePreview;
  check('More... and lastPage false', s.moreLine.text === 'More...' && s.sflEnd.lastPage === false);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * p14OverlayStacking.test.js
 *
 * Task P14 - Compare/overlay stacking. Checked records stack bottom-to-top in
 * the order they were selected, the current record on top, and a later record's
 * cells overwrite an earlier record's (opaque field backgrounds under a
 * `dspf-stacked` screen) instead of printing over them.
 *
 *  1. Engine: resolveMultiScreen keeps list order, flags `stacked` only when 2+
 *     records actually contribute; renderScreenHtml adds `dspf-stacked` only then.
 *  2. Webview: Full overlay draws checked records first and the current record
 *     last (top); the compare checklist shows each checked record's stack
 *     position without changing its row text; re-checking moves a record to the
 *     top of the checked ones; the dimmed-backdrop mode marks the primary screen
 *     stacked only while a backdrop exists; the masking CSS is zero-specificity.
 *
 * Run with: node src/test/p14OverlayStacking.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

console.log('=== 1. engine ===');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00030', line: '1', col: '2', func: "'AAAAAAAAAA'" }),
    buildLine({ seq: '00040', nameType: 'R', name: 'SCR2' }),
    buildLine({ seq: '00050', line: '1', col: '4', func: "'BBBB'" }),
    buildLine({ seq: '00060', nameType: 'R', name: 'SCR3', sizeCondition: '*DS4' }),
    buildLine({ seq: '00070', line: '2', col: '2', func: "'CCCC'" }),
    buildLine({ seq: '00080', nameType: 'R', name: 'SCR4', sizeCondition: '*DS3' }),
    buildLine({ seq: '00090', line: '3', col: '2', func: "'DDDD'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const two = DspfEngine.resolveMultiScreen(model, ['SCR1', 'SCR2'], new Set());
  check('two records: fields keep list order (SCR1 first, SCR2 last)', two.fields.map((f) => f.sourceRecord).join() === 'SCR1,SCR2');
  check('two records: stacked is true', two.stacked === true);
  const rev = DspfEngine.resolveMultiScreen(model, ['SCR2', 'SCR1'], new Set());
  check('reversing the list reverses the stacking order', rev.fields.map((f) => f.sourceRecord).join() === 'SCR2,SCR1');
  check('every field of every record is still returned (no data-level overlap removal)', two.fields.length === 2);
  const one = DspfEngine.resolveMultiScreen(model, ['SCR1'], new Set());
  check('one record: not stacked', one.stacked === false);
  const cond = DspfEngine.resolveMultiScreen(model, ['SCR1', 'SCR3'], new Set());
  check('a second record whose own size condition is not met (*DS4 on a *DS3 screen) does not make it stacked', cond.stacked === false && cond.fields.length === 1);
  const condOn = DspfEngine.resolveMultiScreen(model, ['SCR1', 'SCR4'], new Set());
  check('...but one whose size condition is met (*DS3) does', condOn.stacked === true && condOn.fields.length === 2);
  const missing = DspfEngine.resolveMultiScreen(model, ['SCR1', 'NOSUCH'], new Set());
  check('an unknown record name is skipped and does not count', missing.stacked === false);
  check('renderScreenHtml adds dspf-stacked for a stacked screen', /class="dspf-screen dspf-stacked"/.test(DspfEngine.renderScreenHtml(two)));
  check('renderScreenHtml leaves a single-record screen unmarked', /class="dspf-screen"/.test(DspfEngine.renderScreenHtml(one)) && !/dspf-stacked/.test(DspfEngine.renderScreenHtml(one)));
  const html2 = DspfEngine.renderScreenHtml(two);
  check('in the HTML the later record\'s field comes after the earlier one\'s', html2.indexOf('BBBB') > html2.indexOf('AAAAAAAAAA') && html2.indexOf('AAAAAAAAAA') > 0);
  const single = DspfEngine.resolveScreen(model, 'SCR1', new Set());
  check('resolveScreen (single record) is never marked stacked', !single.stacked && !/dspf-stacked/.test(DspfEngine.renderScreenHtml(single)));
}

console.log('=== 2. webview ===');
{
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SCR1',
    "     A                                  1  2'AAAA-ONE'",
    '     A          R SCR2',
    "     A                                  1  2'BBBB-TWO'",
    '     A          R SCR3',
    "     A                                  1  2'CCCC-THREE'",
  ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce14', src, 'P14.DSPF');
  check('the masking CSS is zero-specificity (:where) so reverse video and the selected tint still win',
    /:where\(\.dspf-screen\.dspf-stacked \.dspf-field\)\s*\{\s*background-color:\s*var\(--dspf-cell-bg, #050705\)/.test(html));
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const out = () => doc.getElementById('screenOutput');
    const fire = (el, prop, val) => { el[prop] = val; el.dispatchEvent(new Event('change', { bubbles: true })); };
    const row = (name) => Array.from(doc.querySelectorAll('.compare-record-row')).find((r) => r.textContent.trim() === name);
    const box = (name) => row(name).querySelector('input');

    fire(doc.getElementById('compareModeToggle'), 'checked', true);
    check('Compare on but nothing checked: the primary screen is not stacked', !doc.querySelector('.dspf-screen.dspf-stacked'));

    fire(box('SCR2'), 'checked', true);
    check('dimmed backdrop present: the primary screen is marked stacked', out().querySelector('.dspf-screen').classList.contains('dspf-stacked'));
    check('the dimmed layer\'s own screen is a single record, so it is not stacked', !doc.querySelector('.dspf-screen-backdrop-layer .dspf-screen.dspf-stacked'));
    check('checklist row text is unchanged by the order badge', row('SCR2') && row('SCR2').textContent.trim() === 'SCR2');
    check('SCR2 is layer 1', row('SCR2').getAttribute('data-order') === '1');
    check('SCR3 (unchecked) has no layer', !row('SCR3').hasAttribute('data-order'));

    fire(box('SCR3'), 'checked', true);
    check('SCR3 checked second is layer 2', row('SCR3').getAttribute('data-order') === '2' && row('SCR2').getAttribute('data-order') === '1');
    check('the dimmed backdrop layer now stacks its two records', !!doc.querySelector('.dspf-screen-backdrop-layer .dspf-screen.dspf-stacked'));
    const bd = doc.querySelector('.dspf-screen-backdrop-layer').textContent;
    check('backdrop DOM order follows check order (SCR2 then SCR3)', bd.indexOf('BBBB-TWO') >= 0 && bd.indexOf('CCCC-THREE') > bd.indexOf('BBBB-TWO'));

    fire(box('SCR2'), 'checked', false);
    fire(box('SCR2'), 'checked', true);
    check('un-checking then re-checking moves SCR2 to the top of the checked ones (layer 2, SCR3 becomes 1)',
      row('SCR2').getAttribute('data-order') === '2' && row('SCR3').getAttribute('data-order') === '1');

    console.log('  Full overlay: checked records first, the current record (SCR1) last = on top');
    fire(doc.getElementById('compareOverlayToggle'), 'checked', true);
    const t = out().textContent;
    check('all three records are drawn in one stacked screen', doc.querySelectorAll('.dspf-screen').length === 1 && out().querySelector('.dspf-screen').classList.contains('dspf-stacked'));
    check('order in the DOM is SCR3, SCR2, then the current SCR1 last',
      t.indexOf('CCCC-THREE') >= 0 && t.indexOf('BBBB-TWO') > t.indexOf('CCCC-THREE') && t.indexOf('AAAA-ONE') > t.indexOf('BBBB-TWO'));
    const hint = doc.getElementById('mainHint').textContent;
    check('the hint states the stacking order and that the current record is on top',
      /Stacked bottom to top: SCR3 > SCR2 > SCR1 \(SCR1 on top/.test(hint));

    console.log('  switching the current record changes who is on top');
    const rs = doc.getElementById('recordSelect');
    rs.value = 'SCR3'; rs.dispatchEvent(new Event('change', { bubbles: true }));
    const t2 = out().textContent;
    check('with SCR3 current, only the checked SCR2 plus SCR3 are drawn, SCR3 last (SCR1 was never checked)',
      t2.indexOf('BBBB-TWO') >= 0 && t2.indexOf('CCCC-THREE') > t2.indexOf('BBBB-TWO') && t2.indexOf('AAAA-ONE') < 0);

    console.log('  Compare off: everything back to a plain single-record screen');
    fire(doc.getElementById('compareOverlayToggle'), 'checked', false);
    fire(doc.getElementById('compareModeToggle'), 'checked', false);
    check('no stacked screen and no backdrop once Compare is off', !doc.querySelector('.dspf-stacked') && !doc.querySelector('.dspf-screen-backdrop-layer'));

    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exitCode = failureCount() === 0 ? 0 : 1;
  }, 500);
}

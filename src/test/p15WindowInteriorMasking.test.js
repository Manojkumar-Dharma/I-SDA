/**
 * p15WindowInteriorMasking.test.js
 *
 * Task P15 - in a stacked (multi-record) screen a WINDOW record's interior must
 * hide what is UNDER it (earlier records) without hiding its own content or
 * anything from a LATER record. Each contributing record gets a stack layer n:
 * its window box paints at z-index 2n, everything else it owns (fields,
 * subfile-preview fields, *CHAR border cells, ERRMSG line) at 2n+1.
 *
 *  1. resolveMultiScreen tags fields / windows / ERRMSG lines with the layers.
 *  2. renderScreenHtml emits them as inline z-indexes; fields of a windowed
 *     record take the window's own background (--dspf-cell-bg); a plain
 *     single-record screen carries none of it.
 *  3. Real generated webview (jsdom): Full overlay with a window record in the
 *     middle of the stack - z-order of the DOM elements as painted.
 *
 * Run with: node src/test/p15WindowInteriorMasking.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const z = (html, marker) => {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.lastIndexOf('<div', i);
  const m = /z-index:(\d+);/.exec(html.slice(start, i));
  return m ? parseInt(m[1], 10) : null;
};

console.log('=== 1+2. engine ===');
{
  const src = [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'BASE' }),
    buildLine({ seq: '00030', line: '5', col: '10', func: "'UNDERNEATH'" }),
    buildLine({ seq: '00040', nameType: 'R', name: 'WIN', func: 'WINDOW(3 5 8 30)' }),
    buildLine({ seq: '00050', func: "WDWBORDER((*CHAR '1' '2' '3' '4' '5-" }),
    buildLine({ seq: '00055', func: "' '6' '7' '8'))" }),
    buildLine({ seq: '00060', line: '1', col: '2', func: "'INSIDE'" }),
    buildLine({ seq: '00062', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '2', col: '2' }),
    buildLine({ seq: '00065', ind1: '90', func: "ERRMSG('Bad input' 91)" }),
    buildLine({ seq: '00070', nameType: 'R', name: 'TOP' }),
    buildLine({ seq: '00080', line: '6', col: '12', func: "'ABOVE'" }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const active = new Set(['90']);
  const scr = DspfEngine.resolveMultiScreen(model, ['BASE', 'WIN', 'TOP'], active);
  const layerOf = (rec) => scr.fields.filter((f) => f.sourceRecord === rec).map((f) => f.stackLayer);
  check('BASE (record 0) fields are layer 1', layerOf('BASE').every((l) => l === 1) && layerOf('BASE').length === 1);
  check('WIN (record 1) fields are layer 3', layerOf('WIN').length >= 2 && layerOf('WIN').every((l) => l === 3));
  check('TOP (record 2) fields are layer 5', layerOf('TOP').every((l) => l === 5) && layerOf('TOP').length === 1);
  check('the window box is layer 2 (below its own content, above BASE)', scr.windows.length === 1 && scr.windows[0].stackLayer === 2);
  check('the ERRMSG line is layer 3 (with the window\'s content)', scr.errorMessages.length === 1 && scr.errorMessages[0].stackLayer === 3);
  check('only the windowed record\'s fields are flagged inWindow',
    scr.fields.filter((f) => f.inWindow).every((f) => f.sourceRecord === 'WIN') && scr.fields.filter((f) => f.inWindow).length === layerOf('WIN').length);

  const html = DspfEngine.renderScreenHtml(scr);
  const zBase = z(html, '>UNDERNEATH<'), zIn = z(html, '>INSIDE<'), zTop = z(html, '>ABOVE<');
  const zBox = z(html, 'data-window-line="3"');
  check('rendered z-indexes: BASE field 1 < window box 2 < window content 3 < TOP field 5', zBase === 1 && zBox === 2 && zIn === 3 && zTop === 5);
  check('so the window interior (2) is above BASE (1) and below its own content (3) and TOP (5)', zBase < zBox && zBox < zIn && zBox < zTop);
  check('the *CHAR border cells sit just above their own window box (layer 3)', /class="dspf-window-char" style="[^"]*z-index:3;/.test(html));
  check('the ERRMSG line carries its layer', /class="dspf-window-msgline" style="[^"]*z-index:3;/.test(html));
  check('the window\'s own fields use the window background var, the others do not',
    /--dspf-cell-bg:#0a0f0c;[^"]*"[^>]*>INSIDE</.test(html) && !/--dspf-cell-bg[^>]*>UNDERNEATH</.test(html) && !/--dspf-cell-bg[^>]*>ABOVE</.test(html));

  const rev = DspfEngine.resolveMultiScreen(model, ['WIN', 'BASE'], active);
  const revHtml = DspfEngine.renderScreenHtml(rev);
  check('reversed order: the window is the BOTTOM record (box 0) and BASE\'s field (3) is drawn above it',
    z(revHtml, 'data-window-line="3"') === 0 && z(revHtml, '>UNDERNEATH<') === 3);

  const single = DspfEngine.renderScreenHtml(DspfEngine.resolveScreen(model, 'WIN', active));
  check('a single-record screen carries no stacking z-indexes (only the window-background var on its fields)',
    !/z-index:/.test(single.replace(/<style[\s\S]*?<\/style>/g, '')));
  const oneMulti = DspfEngine.resolveMultiScreen(model, ['WIN'], active);
  check('a one-record multi screen is not stacked', oneMulti.stacked === false && !/dspf-stacked/.test(DspfEngine.renderScreenHtml(oneMulti)));
}

console.log('=== 3. webview ===');
{
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R BASE',
    "     A                                  5 10'UNDERNEATH'",
    '     A          R WIN                       WINDOW(3 5 8 30)',
    "     A                                  1  2'INSIDE'",
    '     A          R TOP',
    "     A                                  6 12'ABOVE'",
  ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce15', src, 'P15.DSPF');
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    },
  });
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const fire = (el, prop, val) => { el[prop] = val; el.dispatchEvent(new Event('change', { bubbles: true })); };
    const box = (name) => Array.from(doc.querySelectorAll('.compare-record-row')).find((r) => r.textContent.trim() === name).querySelector('input');
    const rs = doc.getElementById('recordSelect');
    rs.value = 'TOP'; rs.dispatchEvent(new Event('change', { bubbles: true }));
    fire(doc.getElementById('compareModeToggle'), 'checked', true);
    fire(box('BASE'), 'checked', true);
    fire(box('WIN'), 'checked', true);
    fire(doc.getElementById('compareOverlayToggle'), 'checked', true);

    const zi = (el) => parseInt((/z-index:(\d+)/.exec(el.getAttribute('style') || '') || [])[1], 10);
    const els = Array.from(doc.querySelectorAll('#screenOutput .dspf-screen > *'));
    const fieldZ = (text) => zi(els.find((e) => e.classList.contains('dspf-field') && e.textContent.trim() === text));
    const winEl = els.find((e) => e.classList.contains('dspf-window-border'));
    check('Full overlay draws a window box', !!winEl);
    check('stack order in the live DOM: UNDERNEATH (1) < window box (2) < INSIDE (3) < ABOVE (5)',
      fieldZ('UNDERNEATH') === 1 && zi(winEl) === 2 && fieldZ('INSIDE') === 3 && fieldZ('ABOVE') === 5);
    check('the window box keeps its opaque CSS background rule', /\.dspf-window-border\s*\{[^}]*background:\s*#0a0f0c/.test(html));

    console.log('  dimmed-backdrop mode (Compare on, Full overlay off): the backdrop layer\'s own stack is layered too');
    fire(doc.getElementById('compareOverlayToggle'), 'checked', false);
    const bd = doc.querySelector('.dspf-screen-backdrop-layer');
    check('a backdrop layer exists holding BASE and WIN', !!bd && /UNDERNEATH/.test(bd.textContent) && /INSIDE/.test(bd.textContent));
    const bdEls = Array.from(bd.querySelectorAll('.dspf-screen > *'));
    const bz = (text) => zi(bdEls.find((e) => e.classList.contains('dspf-field') && e.textContent.trim() === text));
    const bw = bdEls.find((e) => e.classList.contains('dspf-window-border'));
    check('inside the backdrop: UNDERNEATH (1) < window (2) < INSIDE (3)', bz('UNDERNEATH') === 1 && zi(bw) === 2 && bz('INSIDE') === 3);

    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exitCode = failureCount() === 0 ? 0 : 1;
  }, 500);
}

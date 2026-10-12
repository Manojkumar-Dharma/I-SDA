/**
 * i208ModTagSeqRowWebview.test.js
 *
 * I-208 (docs/sda-reference/keywordFixes.md): the "Tag in columns 1-5" toggle sits on its own
 * line below the "Track modifications" row (so it no longer squeezes the tag box) and is
 * hidden while tracking is off, in the display designer and the menu designer.
 * Run with: node src/test/i208ModTagSeqRowWebview.test.js
 */
const { buildLine } = require('../fixtures/lineBuilder');
const { getMenuWebviewHtml } = require('../../dist/menuWebviewTemplate.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

function dspfDom(nonce) {
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', nonce, src, 'MOD.DSPF');
  return newWebviewDom(html, { beforeParse(w) { w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} }); } });
}

const menuSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R MENU',
    "     A                                  1  2'MAIN MENU'",
    "     A                                  3  5'1. Display library list'",
  ].join('\n') + '\n';

function menuDom(nonce) {
  const html = getMenuWebviewHtml('vscode-webview://fake', nonce, menuSource, '0001 DSPLIBL\n0002 CHGCURLIB\n', 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  return newWebviewDom(html, { beforeParse(w) { w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} }); } });
}

function scenario(label, make, nonce, next) {
  console.log(label + ': the columns 1-5 toggle is on its own line and only shown while tracking is on');
  const dom = make(nonce);
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const track = doc.getElementById('modTrackingToggle');
    const tag = doc.getElementById('modTrackingTagInput');
    const seq = doc.getElementById('modTrackingSeqToggle');
    const trackRow = track.closest('.mod-tracking-row');
    const seqRow = doc.getElementById('modTrackingSeqRow');
    check('the toggle is no longer in the Track modifications row', !!trackRow && !trackRow.contains(seq));
    check('the tag box stays in the Track modifications row', trackRow.contains(tag));
    check('the toggle has its own row, after the tracking row', !!seqRow && seqRow.contains(seq) && trackRow.nextElementSibling === seqRow);
    check('the row starts hidden while tracking is off', seqRow.classList.contains('hidden'));

    track.checked = true;
    track.dispatchEvent(new Event('change', { bubbles: true }));
    check('turning tracking on shows the row', !seqRow.classList.contains('hidden'));
    seq.checked = true;
    seq.dispatchEvent(new Event('change', { bubbles: true }));
    track.checked = false;
    track.dispatchEvent(new Event('change', { bubbles: true }));
    check('turning tracking off hides it again', seqRow.classList.contains('hidden'));
    check('the position choice is kept while hidden', seq.checked && tag.maxLength === 5);
    track.checked = true;
    track.dispatchEvent(new Event('change', { bubbles: true }));
    check('turning tracking back on shows the row with the choice intact', !seqRow.classList.contains('hidden') && seq.checked);

    // Host start values drive the row too (fresh page: session untouched).
    const dom2 = make(nonce + 'h');
    setTimeout(() => {
      const d2 = dom2.window.document;
      dom2.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'JDOE', position: 'sequence' }, '*');
      setTimeout(() => {
        check('a host start value of tracking on shows the row', !d2.getElementById('modTrackingSeqRow').classList.contains('hidden'));
        const dom3 = make(nonce + 'o');
        setTimeout(() => {
          dom3.window.postMessage({ type: 'modTrackingConfig', enabled: false, tag: 'JDOE', position: 'sequence' }, '*');
          setTimeout(() => {
            check('a host start value of tracking off keeps the row hidden', dom3.window.document.getElementById('modTrackingSeqRow').classList.contains('hidden'));
            next();
          }, 0);
        }, 0);
      }, 0);
    }, 0);
  }, 0);
}

scenario('Display designer', dspfDom, 'i208a', () =>
  scenario('\nMenu designer', menuDom, 'i208b', () => {
    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exit(failureCount() === 0 ? 0 : 1);
  })
);

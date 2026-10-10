/**
 * e7hResetParity.test.js - E7h (docs/sda-reference/FEATURE-ROADMAP.md).
 *
 * dspfWebview.test.js reuses one DSPF designer page across scenarios (helpers/common.js leaseDspfPage) by
 * sending it the 'resetViewState' message. That is only sound if a reset page is indistinguishable from a
 * freshly built one. This test dirties a page as far as the UI allows (selection, tabs, toggles, compare
 * mode, panels, add-record form, UI style and theme, host messages, an edit that sets the echo-suppress
 * flag) and compares it after the reset with a fresh page for the same source: the whole body markup, the
 * body's data attributes and inline style, and the messages each posts while rendering. When a new piece of
 * view state is added to the page script and not to resetViewState, a dirty step here (or in a scenario in
 * dspfWebview.test.js) is where it shows.
 */
'use strict';

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml, leaseDspfPage } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');

const sources = {
  plain: [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
    '     A            NAME      10A  B  4  5',
  ].join('\n') + '\n',
  twoRecords: [
    buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
    buildLine({ seq: '00020', nameType: 'R', name: 'FIRST' }),
    buildLine({ seq: '00030', name: 'FLD1', dataType: 'A', length: '10', usage: 'B', line: '2', col: '2' }),
    buildLine({ seq: '00040', ind1: '51', func: 'DSPATR(HI)' }),
    buildLine({ seq: '00050', nameType: 'R', name: 'SECOND' }),
    buildLine({ seq: '00060', name: 'FLD2', dataType: 'A', length: '8', usage: 'O', line: '3', col: '4' }),
  ].join('\n') + '\n',
  subfile: [
    buildLine({ seq: '00010', nameType: 'R', name: 'DTLSFL', func: 'SFL' }),
    buildLine({ seq: '00020', name: 'SFLFLD', dataType: 'A', length: '10', usage: 'B', line: '1', col: '2' }),
    buildLine({ seq: '00030', nameType: 'R', name: 'DTLCTL', func: 'SFLCTL(DTLSFL)' }),
    buildLine({ seq: '00040', func: 'SFLSIZ(10)' }),
    buildLine({ seq: '00050', func: 'SFLPAG(5)' }),
  ].join('\n') + '\n',
};

function openPage(source, posted) {
  const html = webviewHtml('vscode-webview://fake', 'parity', source, 'PARITY.DSPF');
  return newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
}

function send(dom, data) {
  const w = dom.window;
  w.dispatchEvent(new w.MessageEvent('message', { data }));
}

/** Everything the page shows plus the body-level attributes the UI toggles write. */
function snapshot(dom) {
  const doc = dom.window.document;
  return {
    // an emptied class list leaves class="" behind where a fresh element has no attribute at all
    // (the inline <script> carries the source the page was BUILT from, which differs by design)
    body: doc.body.outerHTML.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '<script></script>').replace(/ class=""/g, '').replace(/\s+/g, ' '),
    dataset: JSON.stringify(Object.assign({}, doc.body.dataset)),
    style: doc.body.getAttribute('style') || '',
    title: doc.title,
  };
}

function dirty(dom) {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => { if (el) el.dispatchEvent(new Event(type, { bubbles: true })); };
  const setChecked = (id, on) => { const el = doc.getElementById(id); if (el) { el.checked = on; fire(el, 'change'); } };

  const field = doc.querySelector('.dspf-field');
  if (field) fire(field, 'click');
  Array.from(doc.querySelectorAll('.props-tab')).slice(1, 3).forEach((b) => fire(b, 'click'));
  setChecked('rulerToggle', true);
  setChecked('crosshairToggle', true);
  setChecked('previewRowsToggle', true);
  setChecked('compareModeToggle', true);
  setChecked('compareOverlayToggle', true);
  setChecked('modTrackingToggle', true);
  setChecked('modTrackingSeqToggle', true);
  const tag = doc.getElementById('modTrackingTagInput');
  if (tag) { tag.value = 'XYZ'; fire(tag, 'input'); }
  fire(doc.getElementById('leftPanelToggle'), 'click');
  fire(doc.getElementById('rightPanelToggle'), 'click');
  fire(doc.getElementById('newRecordToggleBtn'), 'click');
  const nr = doc.getElementById('newRecordName');
  if (nr) nr.value = 'HALFTYPED';
  fire(doc.getElementById('uiStyleToggle'), 'click');
  const theme = doc.getElementById('uiThemeSelect');
  if (theme) { theme.value = 'amber'; fire(theme, 'change'); }
  const finder = doc.getElementById('keywordFinderInput');
  if (finder) { finder.value = 'COLOR'; fire(finder, 'input'); }
  fire(doc.getElementById('placeFieldBtn'), 'click');
  const sizeSel = doc.getElementById('sizeSelect');
  if (sizeSel && sizeSel.options.length > 1) { sizeSel.value = '1'; fire(sizeSel, 'change'); }
  const rec = doc.getElementById('recordSelect');
  if (rec && rec.options.length > 1) { rec.value = rec.options[rec.options.length - 1].value; fire(rec, 'change'); }
  Array.from(doc.querySelectorAll('#indicatorList input[type=checkbox]')).forEach((c) => { c.checked = true; fire(c, 'change'); });
  send(dom, { type: 'modTrackingConfig', enabled: true, position: 'end', tag: 'HOST', keepRemoved: true });
  send(dom, { type: 'sourceLineWidth', maxLength: 72 });
  send(dom, { type: 'jobDateFormat', ok: true, dateFormat: 'YMD', dateSeparator: '-' });
  send(dom, { type: 'dirtyState', isDirty: true });
  send(dom, { type: 'codeForIStatus', installed: true, connected: true });
  send(dom, { type: 'compileResult', ok: false, message: 'a stale compile message' });
  send(dom, { type: 'referencesResolved', entries: [{ key: 'K', definition: null }] });
}

function resetTo(dom, source, posted) {
  const w = dom.window;
  w.__sink = null;
  send(dom, { type: 'resetViewState', text: source });
  w.__sink = posted;
  posted.length = 0;
  send(dom, { type: 'resetViewState', text: source });
}

const names = Object.keys(sources);
const diffs = [];
for (const from of names) {
  for (const to of names) {
    const freshPosted = [];
    const fresh = openPage(sources[to], freshPosted);

    const reusedPosted = [];
    const reused = openPage(sources[from], reusedPosted);
    // the sink above is `posted` itself; swap to a switchable one for the reset passes
    dirty(reused);
    check(from + ' -> ' + to + ': setup - the dirtied page no longer matches a fresh one (the steps took effect)', snapshot(reused).body !== snapshot(fresh).body);
    const sink = [];
    resetTo(reused, sources[to], sink);

    const a = snapshot(fresh);
    const b = snapshot(reused);
    const label = from + ' -> ' + to;
    ['body', 'dataset', 'style', 'title'].forEach((k) => {
      const same = a[k] === b[k];
      check(label + ': ' + k + ' matches a fresh page', same);
      if (!same) {
        let i = 0;
        while (i < a[k].length && a[k][i] === b[k][i]) i++;
        diffs.push(label + ' ' + k + ' @' + i + ': fresh=' + JSON.stringify(a[k].slice(Math.max(0, i - 60), i + 120)) + ' reset=' + JSON.stringify(b[k].slice(Math.max(0, i - 60), i + 120)));
      }
    });
    // The fresh page's first render posts whatever it posts (minus 'ready', which comes last); so does a reset.
    const render = (list) => JSON.stringify(list.filter((m) => m.type !== 'ready'));
    check(label + ': the render posts the same messages', render(freshPosted) === render(sink) || render(sink) === '[]' && render(freshPosted) === '[]');
  }
}

// leaseDspfPage itself: a lease taken after the previous scenario has started reuses the page and the
// reset leaves what a fresh page shows.
setTimeout(() => {
  const first = [];
  const p1 = leaseDspfPage(sources.plain, 'A.DSPF', { posted: first, rect: true });
  const afterFirst = p1.window.document.querySelectorAll('.dspf-field').length;
  const second = [];
  const p2 = leaseDspfPage(sources.twoRecords, 'B.DSPF', { posted: second, rect: true });
  check('a second lease before the first scenario started gets its own page', p1 !== p2 || process.env.ISDA_NO_PAGE_REUSE === '1');
  check('a leased page shows the source it was leased for', p2.window.document.querySelectorAll('#recordSelect option').length === 2 && afterFirst >= 1);
  check('a lease posts the ready message last, like a fresh page', second.length > 0 && second[second.length - 1].type === 'ready');

  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED' + (diffs.length ? '\n' + diffs.join('\n') : ''));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 20);

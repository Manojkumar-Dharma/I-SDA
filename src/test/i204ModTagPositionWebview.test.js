/**
 * i204ModTagPositionWebview.test.js
 *
 * I-204 (docs/sda-reference/keywordFixes.md): the "Tag in columns 1-5" toggle next to the
 * modification-tag box, in the display designer and the menu designer. With it on the tag
 * box takes 5 characters and the tag is written over the sequence number instead of past
 * column 80. Run with: node src/test/i204ModTagPositionWebview.test.js
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
  const posted = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });
  return { dom, posted };
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
  const posted = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });
  return { dom, posted };
}

function controlsScenario(label, make, nonce, next) {
  console.log(label + ': the toggle drives the tag box limit');
  const { dom } = make(nonce);
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const seq = doc.getElementById('modTrackingSeqToggle');
    const tag = doc.getElementById('modTrackingTagInput');
    check('the columns 1-5 toggle exists and starts off', !!seq && !seq.checked);
    check('the tag box starts at 10 characters', tag.maxLength === 10);

    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'ABCDEFGH', position: 'end' }, '*');
    setTimeout(() => {
      check('position end keeps the whole tag', tag.value === 'ABCDEFGH' && !seq.checked && tag.maxLength === 10);
      seq.checked = true;
      seq.dispatchEvent(new Event('change', { bubbles: true }));
      check('turning the toggle on cuts the tag to 5 characters', tag.value === 'ABCDE');
      check('and limits the box to 5', tag.maxLength === 5 && /5/.test(tag.placeholder));
      seq.checked = false;
      seq.dispatchEvent(new Event('change', { bubbles: true }));
      check('turning it off lifts the limit back to 10', tag.maxLength === 10 && /10/.test(tag.placeholder));

      dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'JDOE0902', position: 'sequence' }, '*');
      setTimeout(() => {
        // The toggle was touched this session, so the host push is a starting value only and is ignored now.
        check('a later host push does not override the person\'s own choice', tag.maxLength === 10 && !seq.checked);
        next();
      }, 0);
    }, 0);
  }, 0);
}

function startsAtSequence(label, make, nonce, next) {
  console.log('\n' + label + ': the host setting is the starting position');
  const { dom } = make(nonce);
  setTimeout(() => {
    const doc = dom.window.document;
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'JDOE0902', position: 'sequence' }, '*');
    setTimeout(() => {
      const seq = doc.getElementById('modTrackingSeqToggle');
      const tag = doc.getElementById('modTrackingTagInput');
      check('the toggle starts on', seq.checked);
      check('the tag is cut to 5 and the box limited to 5', tag.value === 'JDOE0' && tag.maxLength === 5);
      next();
    }, 0);
  }, 0);
}

function dspfWrite(next) {
  console.log('\nDisplay designer: an edit with the tag in columns 1-5');
  const { dom, posted } = dspfDom('i204dspf');
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'JDOE0902', position: 'sequence' }, '*');
    setTimeout(() => {
      const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('FLD1'));
      fieldEl.dispatchEvent(new Event('click', { bubbles: true }));
      const len = doc.getElementById('p-length');
      len.value = '15';
      len.dispatchEvent(new Event('input', { bubbles: true }));
      doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
      const last = posted[posted.length - 1];
      check('an edit was posted', last && last.type === 'applyEdit');
      const lines = (last ? last.text : '').split(/\r\n|\r|\n/);
      check('the new FLD1 line starts with the 5-character tag', lines.some((l) => l.startsWith('JDOE0') && l.includes('FLD1') && l.includes('15A')));
      check('the old FLD1 line is commented out and keeps its own number', lines.some((l) => l.startsWith('00020') && l.charAt(6) === '*' && l.includes('10A')));
      check('nothing is written past column 80', lines.every((l) => l.length <= 80));
      next();
    }, 0);
  }, 0);
}

function menuWrite(next) {
  console.log('\nMenu designer: an edit with the tag in columns 1-5');
  const { dom, posted } = menuDom('i204menu');
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'JD902', position: 'sequence' }, '*');
    setTimeout(() => {
      const row = Array.from(doc.querySelectorAll('.option-row')).find((r) => r.querySelector('.option-num-badge').textContent === '1');
      const input = row.querySelector('.option-label-input');
      input.value = 'Show library list';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const last = posted[posted.length - 1];
      check('an edit was posted', last && last.type === 'applyEdit');
      const lines = last.text.split(/\r\n|\r|\n/);
      check('the new option line starts with the tag', lines.some((l) => l.startsWith('JD902') && l.charAt(6) !== '*' && l.includes('Show library list')));
      check('the old option line is still there, commented out', lines.some((l) => l.charAt(6) === '*' && l.includes('Display library list')));
      check('nothing is written past column 80', lines.every((l) => l.length <= 80));
      next();
    }, 0);
  }, 0);
}

controlsScenario('Display designer', dspfDom, 'i204a', () =>
  controlsScenario('\nMenu designer', menuDom, 'i204b', () =>
    startsAtSequence('Display designer', dspfDom, 'i204c', () =>
      startsAtSequence('Menu designer', menuDom, 'i204d', () =>
        dspfWrite(() =>
          menuWrite(() => {
            console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
            process.exit(failureCount() === 0 ? 0 : 1);
          })
        )
      )
    )
  )
);

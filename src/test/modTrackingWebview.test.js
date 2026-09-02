/**
 * modTrackingWebview.test.js
 *
 * End-to-end jsdom coverage for Task L38 (docs/sda-reference/LIMITATIONS-PLAN.md) -
 * the DSPF designer's "Track modifications" checkbox + tag box in the
 * properties panel, and the resulting behavior of commitSourceChange()
 * itself (see dspfWebview.test.js for why this needs an actual running
 * script, not just string-contains assertions on the generated HTML).
 * modificationTracking.test.js covers the DspfWriter primitives directly;
 * this covers the UI wiring around them. Run with:
 * node src/test/modTrackingWebview.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

function makeDom(nonce) {
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
      buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', nonce, src, 'MOD.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });
  return { dom, posted };
}

console.log('Task L38: modification-tracking controls start off/blank, driven by the modTrackingConfig message');
{
  const { dom } = makeDom('modtrack1');
  setTimeout(() => {
    const doc = dom.window.document;
    const toggle = doc.getElementById('modTrackingToggle');
    const tagInput = doc.getElementById('modTrackingTagInput');
    check('toggle and tag input are both present in the properties panel', !!toggle && !!tagInput);
    check('starts unchecked before any modTrackingConfig message arrives', !toggle.checked);
    check('tag box starts blank', tagInput.value === '');

    console.log('\n  the extension host\'s modTrackingConfig message (sent on ready) supplies the starting values');
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'JDOE0902' }, '*');
    setTimeout(() => {
      check('checkbox reflects the incoming enabled=true', toggle.checked);
      check('tag box reflects the incoming tag', tagInput.value === 'JDOE0902');

      runEditingScenario();
    }, 0);
  }, 0);
}

function runEditingScenario() {
  console.log('\nTask L38: an actual field edit, with tracking on, comments out the old line and tags the new one');
  const { dom, posted } = makeDom('modtrack2');
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;

    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'TESTTAG12' }, '*');

    setTimeout(() => {
      const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('FLD1'));
      check('setup: the target field is present', !!fieldEl);
      fieldEl.dispatchEvent(new Event('click', { bubbles: true }));

      const lengthInput = doc.getElementById('p-length');
      check('setup: the length input is present in the field props panel', !!lengthInput);
      lengthInput.value = '15';
      lengthInput.dispatchEvent(new Event('input', { bubbles: true }));
      const applyBtn = doc.getElementById('p-apply');
      check('setup: an Apply button is present', !!applyBtn);
      applyBtn.dispatchEvent(new Event('click', { bubbles: true }));

      const last = posted[posted.length - 1];
      check('an edit was posted', last && last.type === 'applyEdit');
      const lines = (last ? last.text : '').split(/\r\n|\r|\n/);
      check('the original FLD1 line survives, now commented out (column 7 = *)', lines.some((l) => l.charAt(6) === '*' && l.includes('FLD1') && l.includes('10A')));
      check('a new FLD1 line carries the changed length and the tag past column 80', lines.some((l) => l.charAt(6) !== '*' && l.includes('FLD1') && l.includes('15A') && l.slice(80, 90) === 'TESTTAG12'));

      const commentedCountBefore = lines.filter((l) => l.charAt(6) === '*' && l.includes('FLD1')).length;

      console.log('\n  turning tracking back off (session-only toggle) reverts to plain in-place edits, no comment/tag');
      const toggle = doc.getElementById('modTrackingToggle');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      const fieldEl2 = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('FLD1'));
      fieldEl2.dispatchEvent(new Event('click', { bubbles: true }));
      const lengthInput2 = doc.getElementById('p-length');
      lengthInput2.value = '20';
      lengthInput2.dispatchEvent(new Event('input', { bubbles: true }));
      doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));

      const last2 = posted[posted.length - 1];
      const lines2 = (last2 ? last2.text : '').split(/\r\n|\r|\n/);
      const commentedCountAfter = lines2.filter((l) => l.charAt(6) === '*' && l.includes('FLD1')).length;
      check('no NEW commented-out FLD1 line from this second edit - tracking is off', commentedCountAfter === commentedCountBefore);
      check('no line carries content past column 80', lines2.every((l) => l.length <= 80));
      check('the field was still edited in place (length 20)', lines2.some((l) => l.includes('FLD1') && l.includes('20A')));

      console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
      process.exit(failures === 0 ? 0 : 1);
    }, 0);
  }, 0);
}

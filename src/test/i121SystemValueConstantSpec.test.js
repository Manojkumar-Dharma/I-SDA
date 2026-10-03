/**
 * i121SystemValueConstantSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", system-value
 * constant keywords slice. The four keywords that supply a CONSTANT field's
 * value from the system (DATE, TIME, USER, SYSNAME) were hand-copied in
 * buildWebviewTemplate.js (the constant field's list, the Add placeholder
 * dropdown and two copies of the labels) and again as the engine's preview
 * if/else chain. They are now KeywordSpec's SYSTEM_VALUE_CONSTANT_KEYWORDS
 * (name + description, declared order) behind systemValueConstantKeywords /
 * isSystemValueConstantKeyword / systemValueConstantLabel.
 *
 * Verifies:
 *  1. the spec fact: names in declared order, labels, fresh arrays, exact
 *     case-sensitive matching, own-property safety, non-strings.
 *  2. the writer re-exports agree with the spec.
 *  3. every one is a field-level, no-option-indicator keyword in the spec
 *     (the I-101 table) and HTML's mutex list names all four.
 *  4. the engine preview: each keyword's placeholder text, precedence when
 *     several are present (spec order), and that a literal still shows.
 *  5. the rendered System value dropdowns list exactly the spec's keywords
 *     with the spec's labels, in order (constant field panel and Add
 *     placeholder form).
 *
 * Run with: node src/test/i121SystemValueConstantSpec.test.js
 */
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

console.log('\nKeywordSpec system-value constant keywords');
{
  check('names are DATE, TIME, USER, SYSNAME in declared order', KeywordSpec.systemValueConstantKeywords().join() === 'DATE,TIME,USER,SYSNAME');
  const names = KeywordSpec.systemValueConstantKeywords(); names.pop();
  check('systemValueConstantKeywords returns a fresh array', KeywordSpec.systemValueConstantKeywords().length === 4);
  const labels = { DATE: 'DATE - current date', TIME: 'TIME - current time', USER: 'USER - signed-on user profile', SYSNAME: 'SYSNAME - system name' };
  Object.keys(labels).forEach(function (n) {
    check(n + ' is a system-value keyword', KeywordSpec.isSystemValueConstantKeyword(n));
    check(n + ' label reads "' + labels[n] + '"', KeywordSpec.systemValueConstantLabel(n) === labels[n]);
  });
  ['MSGCON', 'DFT', 'HTML', 'PAGNBR', 'date', 'Date', ' DATE', 'DATE ', '', 'constructor', '__proto__', 'toString', null, undefined, 4].forEach(function (n) {
    check(JSON.stringify(n) + ' is not a system-value keyword and has no label', KeywordSpec.isSystemValueConstantKeyword(n) === false && KeywordSpec.systemValueConstantLabel(n) === null);
  });
  check('DspfWriter re-exports agree', DspfWriter.systemValueConstantKeywords().join() === 'DATE,TIME,USER,SYSNAME'
    && DspfWriter.isSystemValueConstantKeyword('USER') && !DspfWriter.isSystemValueConstantKeyword('MSGCON')
    && DspfWriter.systemValueConstantLabel('SYSNAME') === 'SYSNAME - system name');
}

console.log('\nAgreement with the rest of the spec');
{
  const names = KeywordSpec.systemValueConstantKeywords();
  const mutex = KeywordSpec.mutexKeywords('HTML');
  names.forEach(function (n) {
    check(n + ' is named in HTML\'s own mutex list', mutex.indexOf(n) >= 0);
  });
  check('HTML mutex also names MSGCON (the other value-from-elsewhere way, not a system value)', mutex.indexOf('MSGCON') >= 0 && !KeywordSpec.isSystemValueConstantKeyword('MSGCON'));
}

console.log('\nEngine preview text');
{
  function previews(funcs) {
    const lines = [buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }), buildLine({ seq: '00020', nameType: 'R', name: 'SCR1' })];
    funcs.forEach(function (f, i) { lines.push(buildLine({ seq: String(30 + i * 10).padStart(5, '0'), line: String(i + 1), col: '2', func: f })); });
    const model = DspfParser.parseDspf(lines.join('\n') + '\n');
    return DspfEngine.resolveScreen(model, 'SCR1', new Set()).fields.map(function (f) { return f.text; });
  }
  const t = previews(['DATE', 'TIME', 'USER', 'SYSNAME', "'Lit'"]);
  // Task I-154: IBM's own formats, not the browser's locale string - DATE
  // with no editing is the bare digits (mmddyy, *Y), TIME its default edit
  // word '0_:__:__' (hh:mm:ss).
  const now = new Date();
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  check('DATE previews today as IBM\'s bare mmddyy', t[0] === p2(now.getMonth() + 1) + p2(now.getDate()) + String(now.getFullYear()).slice(-2));
  check('TIME previews a time in IBM\'s hh:mm:ss', /^\d\d:\d\d:\d\d$/.test(t[1]));
  check('USER previews *USER', t[2] === '*USER');
  check('SYSNAME previews *SYSNAME', t[3] === '*SYSNAME');
  check('a literal constant still previews its text', t[4] === 'Lit');
}

console.log('\nRendered System value dropdowns');
{
  const src = [
    '     A          R RECORD1',
    '     A                                  1  2USER',
    '     A                                  2  2\'Hello\'',
  ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'SYSVAL.DSPF');
  const posted = []; const errors = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = () => {};
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  const doc = dom.window.document;
  const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
  check('setup: two field boxes (USER and the literal)', boxes.length === 2);
  boxes[0].click();
  const sel = doc.getElementById('p-const-sysval');
  check('constant field panel has a System value dropdown preselected to USER', !!sel && sel.value === 'USER');
  const opts = sel ? Array.from(sel.options).map(function (o) { return o.value + '=' + o.textContent; }) : [];
  check('its options are the spec keywords with the spec labels, in order',
    opts.join('|') === KeywordSpec.systemValueConstantKeywords().map(function (n) { return n + '=' + KeywordSpec.systemValueConstantLabel(n); }).join('|'));

  doc.getElementById('placeConstantBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  const screenEl = doc.querySelector('.dspf-screen');
  screenEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 195 }));
  const kindSel = doc.getElementById('p-place-const-kind');
  check('placement form offers a Value source dropdown', !!kindSel);
  const place = doc.getElementById('p-place-sysval');
  check('Add placeholder form has a System value dropdown', !!place);
  const popts = place ? Array.from(place.options).map(function (o) { return o.value + '=' + o.textContent; }) : [];
  check('its options match the constant panel\'s exactly', popts.join('|') === opts.join('|'));
  check('no script errors while rendering either dropdown', errors.length === 0);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

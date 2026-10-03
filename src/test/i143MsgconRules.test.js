/**
 * i143MsgconRules.test.js
 *
 * Task I-143 - MSGCON's three DDS Reference rules (DDS_Keyword_V7r6.txt
 * ~line 8922) are enforced:
 *   1. "cannot be used to initialize a named field" - constant fields only;
 *   2. "cannot be specified with ... DATE, DFT, EDTCDE, EDTWRD, TIME" - both
 *      directions (adding MSGCON beside one, adding one beside MSGCON);
 *   3. "The length can be from 1 to 132 bytes".
 *
 * Covers the writer functions (add-time and diff-based), then the real
 * generated webview in jsdom: the raw keyword editor, the constant panel's
 * Apply (the commitEdit choke point) and the constant Add form.
 *
 * Run with: node src/test/i143MsgconRules.test.js
 */
'use strict';
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const kw = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [] });
const MSG = '20 MSG0001 MSGF';

console.log('\n1. length (rule 3)');
{
  check('1 and 132 are accepted', DspfWriter.msgconLengthProblem('1') === null && DspfWriter.msgconLengthProblem('132') === null);
  check('0, 133, 500, -5, 1.5, abc, 1e2 are refused', ['0', '133', '500', '-5', '1.5', 'abc', '1e2'].every((v) => !!DspfWriter.msgconLengthProblem(v)));
  check('blank / null / undefined are "not set" (not reported)', ['', '  ', null, undefined].every((v) => DspfWriter.msgconLengthProblem(v) === null));
  check('the message names the spec range', /1 to 132/.test(DspfWriter.msgconLengthProblem('0')) && /per the DDS Reference/.test(DspfWriter.msgconLengthProblem('0')));
  check('whitespace around a value is trimmed', DspfWriter.msgconLengthProblem(' 20 ') === null);
  check('param text: first token is the length', DspfWriter.msgconParamsProblem('500 MSG0001 MSGF') !== null && DspfWriter.msgconParamsProblem(MSG) === null && DspfWriter.msgconParamsProblem('') === null && DspfWriter.msgconParamsProblem(null) === null);
  check('param text: leading blanks, tabs and extra spaces are tolerated', DspfWriter.msgconParamsProblem('  20   MSG0001\tMSGF') === null && DspfWriter.msgconParamsProblem('  0   MSG0001 MSGF') !== null);
  const r = KeywordSpec.msgconLengthRange();
  check('the bounds come from the spec: min-1 and max+1 are refused, min and max accepted', DspfWriter.msgconLengthProblem(String(r.min)) === null && DspfWriter.msgconLengthProblem(String(r.max)) === null && DspfWriter.msgconLengthProblem(String(r.min - 1)) !== null && DspfWriter.msgconLengthProblem(String(r.max + 1)) !== null);
}

console.log('\n2. named field (rule 1)');
{
  check('a constant is fine', DspfWriter.msgconNamedFieldReason('CONSTANT') === null);
  check('NAMED / REFERENCE-style named types are refused', ['NAMED', 'named', 'REFERENCE', 'FIELD'].every((t) => !!DspfWriter.msgconNamedFieldReason(t)));
  check('blank / unknown name type fails open', ['', null, undefined, '  '].every((t) => DspfWriter.msgconNamedFieldReason(t) === null));
  check('the rule is driven by the spec\'s constantFieldOnly fact', KeywordSpec.isConstantFieldOnlyKeyword('MSGCON'));
}

console.log('\n3. add-time check, all rules');
{
  const c = { nameType: 'CONSTANT' }, n = { nameType: 'NAMED' };
  check('MSGCON on a plain constant is allowed', DspfWriter.msgconConflictReason('MSGCON', MSG, [], c) === null);
  check('MSGCON on a named field is refused', /named field/.test(DspfWriter.msgconConflictReason('MSGCON', MSG, [], n)));
  check('the keyword name is case-insensitive', !!DspfWriter.msgconConflictReason('msgcon', MSG, [], n));
  ['DATE', 'DFT', 'EDTCDE', 'EDTWRD', 'TIME'].forEach((name) => {
    check('MSGCON beside ' + name + ' is refused (forward)', /MSGCON cannot be specified on a field with /.test(DspfWriter.msgconConflictReason('MSGCON', MSG, [kw(name)], c)));
    check(name + ' beside MSGCON is refused (reverse)', new RegExp('^' + name + ' cannot be specified on a field that already has MSGCON').test(DspfWriter.msgconConflictReason(name, '', [kw('MSGCON', MSG)], c)));
  });
  check('forward names every excluded keyword present', /DFT, TIME/.test(DspfWriter.msgconConflictReason('MSGCON', MSG, [kw('DFT'), kw('COLOR'), kw('TIME')], c)));
  check('keywords outside the list are untouched in both directions', ['COLOR', 'DSPATR', 'TEXT', 'USER', 'SYSNAME', 'HTML'].every((name) => DspfWriter.msgconConflictReason(name, '', [kw('MSGCON', MSG)], c) === null));
  check('an excluded keyword with no MSGCON on the field is not this rule\'s business', DspfWriter.msgconConflictReason('DFT', "'X'", [], c) === null);
  check('MSGCON with length 0 / 133 / abc is refused', ['0', '133', 'abc'].every((l) => !!DspfWriter.msgconConflictReason('MSGCON', l + ' MSG0001 MSGF', [], c)));
  check('order of checks: named field is reported before an exclusion or a length', /named field/.test(DspfWriter.msgconConflictReason('MSGCON', '0 M F', [kw('DFT')], n)));
  check('non-string / empty keyword names do nothing', [null, undefined, '', 5, {}].every((x) => DspfWriter.msgconConflictReason(x, MSG, [kw('MSGCON', MSG)], c) === null));
  check('odd field keyword lists do not throw', DspfWriter.msgconConflictReason('MSGCON', MSG, null, c) === null && DspfWriter.msgconConflictReason('MSGCON', MSG, [null, undefined, kw('DFT')], c) !== null);
}

console.log('\n4. diff-based backstop (commitEdit)');
{
  const f = DspfWriter.msgconNewConflictReason;
  check('no MSGCON after the edit: nothing', f([kw('DFT')], [kw('DFT')], 'NAMED') === null && f([], [], 'NAMED') === null);
  check('MSGCON newly on a named field is refused', /named field/.test(f([], [kw('MSGCON', MSG)], 'NAMED')));
  check('MSGCON newly on a constant is allowed', f([], [kw('MSGCON', MSG)], 'CONSTANT') === null);
  check('a hand-written MSGCON on a named field is not re-reported on an unrelated edit', f([kw('MSGCON', MSG)], [kw('MSGCON', MSG), kw('COLOR', 'RED')], 'NAMED') === null);
  check('removing MSGCON from a named field is allowed', f([kw('MSGCON', MSG)], [], 'NAMED') === null);
  check('a second MSGCON on a named field counts as newly added', /named field/.test(f([kw('MSGCON', MSG)], [kw('MSGCON', MSG), kw('MSGCON', '30 MSG0002 MSGF')], 'NAMED')));
  check('MSGCON newly beside DFT: forward reason', /^MSGCON cannot be specified on a field with DFT/.test(f([kw('DFT')], [kw('DFT'), kw('MSGCON', MSG)], 'CONSTANT')));
  check('DFT newly beside MSGCON: reverse reason', /^DFT cannot be specified on a field that already has MSGCON/.test(f([kw('MSGCON', MSG)], [kw('MSGCON', MSG), kw('DFT')], 'CONSTANT')));
  check('a pre-existing MSGCON + DFT pair is not re-reported when something else changes', f([kw('MSGCON', MSG), kw('DFT')], [kw('MSGCON', MSG), kw('DFT'), kw('COLOR')], 'CONSTANT') === null);
  check('but a SECOND excluded keyword added beside an invalid pair is reported', /^EDTCDE cannot/.test(f([kw('MSGCON', MSG), kw('DFT')], [kw('MSGCON', MSG), kw('DFT'), kw('EDTCDE', 'Y')], 'CONSTANT')));
  check('removing the excluded keyword is allowed', f([kw('MSGCON', MSG), kw('DFT')], [kw('MSGCON', MSG)], 'CONSTANT') === null);
  check('removing MSGCON beside DFT is allowed (the new state has no MSGCON)', f([kw('MSGCON', MSG), kw('DFT')], [kw('DFT')], 'CONSTANT') === null);
  check('changing MSGCON\'s length to 0 / 133 is refused', !!f([kw('MSGCON', MSG)], [kw('MSGCON', '0 MSG0001 MSGF')], 'CONSTANT') && !!f([kw('MSGCON', MSG)], [kw('MSGCON', '133 MSG0001 MSGF')], 'CONSTANT'));
  check('changing it to 1 or 132 is allowed', f([kw('MSGCON', MSG)], [kw('MSGCON', '1 MSG0001 MSGF')], 'CONSTANT') === null && f([kw('MSGCON', MSG)], [kw('MSGCON', '132 MSG0001 MSGF')], 'CONSTANT') === null);
  check('an already out-of-range hand-written length is not re-reported when it is untouched', f([kw('MSGCON', '500 MSG0001 MSGF')], [kw('MSGCON', '500 MSG0001 MSGF'), kw('COLOR', 'RED')], 'CONSTANT') === null);
  check('fixing it (to a valid length) is allowed', f([kw('MSGCON', '500 MSG0001 MSGF')], [kw('MSGCON', '50 MSG0001 MSGF')], 'CONSTANT') === null);
  check('a new MSGCON with a bad length is refused', !!f([], [kw('MSGCON', 'x M F')], 'CONSTANT'));
  check('editing only the message id keeps the length rule quiet when the length is valid', f([kw('MSGCON', MSG)], [kw('MSGCON', '20 MSG0002 MSGF')], 'CONSTANT') === null);
  check('null / undefined lists do not throw', f(null, null, 'NAMED') === null && f(undefined, [kw('MSGCON', MSG)], 'CONSTANT') === null);
}

console.log('\n5. the real webview in jsdom');
const SRC = [
  '     A          R RECORD1',
  '     A            F1            10A  B  2  2',            // line 2 named
  "     A                                  3  2MSGCON(20 MSG0001 MSGF)", // 3 MSGCON constant
  '     A                                  4  2DATE',        // 4 DATE constant
  "     A                                  5  2'LIT'",       // 5 plain constant
  '     A            F2            10A  B  6  2',            // 6 named, hand-written invalid below
  "     A                                      MSGCON(20 MSG0001 MSGF)",
  "     A                                  8  2MSGCON(20 MSG0001 MSGF)", // 8 constant invalid with DFT
  "     A                                      DFT('X')",
].join('\n') + '\n';

function session() {
  const posted = [];
  const alerts = [];
  const html = webviewHtml('vscode-webview://fake', 'n' + Math.random(), SRC, 'I143.DSPF');
  const dom = newWebviewDom(html, {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = (m) => alerts.push(m);
      w.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  const doc = dom.window.document;
  const el = (id) => doc.getElementById(id);
  return {
    posted, alerts, dom, doc, el,
    select(line) { const b = doc.querySelector('.dspf-field[data-source-line="' + line + '"]'); if (!b) return false; b.click(); return true; },
    rawAdd(line, name, params) {
      posted.length = 0; alerts.length = 0;
      el('field-' + line + '-new-kw-name').value = name;
      const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
      doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      return { alert: alerts[0] || null, edited: posted.some((m) => m.type === 'applyEdit') };
    },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let s = session();
  await wait(1200);
  s.select(5);
  let r = s.rawAdd(5, 'MSGCON', MSG);
  check('raw editor: MSGCON on a plain constant is written', r.edited && !r.alert);
  s = session(); await wait(1200);
  s.select(5); r = s.rawAdd(5, 'MSGCON', '0 MSG0001 MSGF');
  check('raw editor: length 0 is refused with the range message', !r.edited && /1 to 132/.test(r.alert || ''));
  s.select(5); r = s.rawAdd(5, 'MSGCON', '133 MSG0001 MSGF');
  check('raw editor: length 133 is refused', !r.edited && /1 to 132/.test(r.alert || ''));
  s.select(5); r = s.rawAdd(5, 'MSGCON', 'abc MSG0001 MSGF');
  check('raw editor: a non-numeric length is refused', !r.edited && !!r.alert);
  s.select(5); r = s.rawAdd(5, 'MSGCON', '132 MSG0001 MSGF');
  check('raw editor: length 132 is written', r.edited && !r.alert);

  s = session(); await wait(1200);
  s.select(2); r = s.rawAdd(2, 'MSGCON', MSG);
  check('raw editor: MSGCON on a named field is refused', !r.edited && /named field/.test(r.alert || ''));

  s = session(); await wait(1200);
  s.select(4); r = s.rawAdd(4, 'MSGCON', MSG);
  check('raw editor: MSGCON onto a DATE constant is refused (forward)', !r.edited && /with DATE/.test(r.alert || ''));
  for (const spec of ["DFT|'X'", 'DATE|', 'TIME|', 'EDTCDE|Y', "EDTWRD|' 0 '"]) {
    const [name, params] = spec.split('|');
    const t = session(); await wait(1200);
    t.select(3); const rr = t.rawAdd(3, name, params);
    check('raw editor: ' + name + ' onto a MSGCON constant is refused (reverse)', !rr.edited && new RegExp(name + ' cannot be specified on a field that already has MSGCON').test(rr.alert || ''));
  }
  s = session(); await wait(1200);
  s.select(3); r = s.rawAdd(3, 'COLOR', 'RED');
  check('raw editor: COLOR onto a MSGCON constant is still allowed', r.edited && !r.alert);

  // pre-existing invalid fields are not re-reported on an unrelated edit
  s = session(); await wait(1200);
  s.select(6); r = s.rawAdd(6, 'COLOR', 'RED');
  check('a hand-written MSGCON on a named field: an unrelated keyword add still works', r.edited && !r.alert);
  s = session(); await wait(1200);
  s.select(8); r = s.rawAdd(8, 'COLOR', 'RED');
  check('a hand-written MSGCON + DFT constant: an unrelated keyword add still works', r.edited && !r.alert);
  s = session(); await wait(1200);
  s.select(8); r = s.rawAdd(8, 'EDTCDE', 'Y');
  check('...but adding another excluded keyword beside the invalid pair is refused', !r.edited && /EDTCDE cannot be specified/.test(r.alert || ''));

  // constant panel Apply: the commitEdit choke point
  s = session(); await wait(1200);
  s.select(3);
  const lenBox = s.el('p-const-msgcon-length');
  check('constant panel has the MSGCON Length input', !!lenBox && lenBox.value === '20');
  s.posted.length = 0; s.alerts.length = 0;
  lenBox.value = '500';
  s.el('p-apply').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
  check('constant panel Apply with length 500 is refused through commitEdit', !s.posted.some((m) => m.type === 'applyEdit') && /1 to 132/.test(s.alerts[0] || ''));
  s.select(3);
  s.posted.length = 0; s.alerts.length = 0;
  s.el('p-const-msgcon-length').value = '40';
  s.el('p-apply').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
  const ed = s.posted.find((m) => m.type === 'applyEdit');
  check('constant panel Apply with length 40 is written', !!ed && /MSGCON\(40 MSG0001 MSGF\)/.test(ed.text || '') && s.alerts.length === 0);

  // Add form
  s = session(); await wait(1200);
  s.el('placeConstantBtn').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
  s.doc.querySelector('.dspf-screen').dispatchEvent(new s.dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 280 }));
  const kind = s.el('p-place-const-kind');
  check('Add form has the Value source select', !!kind);
  if (kind) {
    kind.value = 'msgcon'; kind.dispatchEvent(new s.dom.window.Event('change', { bubbles: true }));
    const fill = (len) => {
      s.el('p-place-msgcon-length').value = len;
      s.el('p-place-msgcon-msgid').value = 'MSG0009';
      s.el('p-place-msgcon-msgfile').value = 'MSGF';
    };
    for (const bad of ['0', '133']) {
      fill(bad); s.posted.length = 0;
      s.el('p-place-add').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
      check('Add form: length ' + bad + ' shows the range message and writes nothing', /1 to 132/.test(s.el('p-place-error').textContent) && !s.posted.some((m) => m.type === 'applyEdit'));
    }
    fill('132'); s.posted.length = 0;
    s.el('p-place-add').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
    const placed = s.posted.find((m) => m.type === 'applyEdit');
    check('Add form: length 132 is written (the form closes)', !!placed && /MSGCON\(132 MSG0009 MSGF\)/.test(placed.text || ''));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();

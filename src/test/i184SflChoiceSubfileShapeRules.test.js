/**
 * i184SflChoiceSubfileShapeRules.test.js
 *
 * Task I-184 - the SFLSNGCHC / SFLMLTCHC rules nothing enforced, from the two DDS Reference sections:
 *   - "This optional keyword is valid only for the subfile-control record format."
 *   - "A subfile containing the keyword must: contain only one output field; cannot contain input capable
 *     fields; can / might contain hidden fields."
 *   - SFLMLTCHC's &number-selected "must name a hidden field with a length of 4, data type of Y, and zero
 *     decimal positions".
 * The facts live in KeywordSpec (sflChoiceRules); the guard is part of DspfWriter.choiceMenuBarNewConflictReason
 * (diff-based, both directions: adding the keyword, or adding what breaks the shape). A subfile or field that
 * does not exist yet is a forward reference and not a violation, and an already-invalid hand-written file never
 * blocks an unrelated edit.
 *
 * Run with: node src/test/i184SflChoiceSubfileShapeRules.test.js
 */
'use strict';
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const { dds, R, K } = require('./helpers/keywordMatrix');

const parse = (t) => DspfParser.parseDspf(t);
const text = (ls) => ls.join('\n') + '\n';
const OUT = (n, line) => dds({ name: n, len: 10, type: 'A', use: 'O', line: line, col: 2 });
const INP = (n, line) => dds({ name: n, len: 10, type: 'A', use: 'I', line: line, col: 2 });
const BOTH = (n, line) => dds({ name: n, len: 10, type: 'A', use: 'B', line: line, col: 2 });
const HID = (n) => dds({ name: n, len: 5, type: 'S', dec: 0, use: 'H' });
const PRG = (n) => dds({ name: n, len: 5, type: 'S', dec: 0, use: 'P' });
const CONST = (line) => dds({ line: line, col: 2, fn: "'Title'" });
const NUM = (n, o) => dds({ name: n, len: o.len === undefined ? 4 : o.len, type: o.type || 'Y', dec: o.dec === undefined ? 0 : o.dec, use: o.use || 'H' });

/** SFL record, then its control record (SFLCTL(SFLRCD)) carrying `ctl` lines. */
const build = (sub, ctl) => text([R('SFLRCD'), K('SFL')].concat(sub, [R('CTL'), K('SFLCTL(SFLRCD)')], ctl));
const guard = (a, b) => DspfWriter.choiceMenuBarNewConflictReason(parse(a), parse(b));
const good = [OUT('F1', 6), HID('H1')];

console.log('=== spec facts ===');
['SFLSNGCHC', 'SFLMLTCHC'].forEach((k) => {
  const r = KeywordSpec.sflChoiceRules(k);
  check(k + ': control record only, one output field, no input-capable fields, hidden fields allowed',
    r && r.controlRecordOnly === true && r.subfileShape.outputFields === 1 && r.subfileShape.inputCapableFields === false && r.subfileShape.hiddenFields === 'allowed');
  const e = KeywordSpec.RECORD_TYPES[k];
  check(k + ': each fact carries its DDS Reference citation',
    /valid only for the subfile-control record format/.test(e.controlRecordOnly.ddsReference) && /only one output field/.test(e.subfileShape.ddsReference));
  check(k + ': the accessor returns copies', (() => { r.subfileShape.outputFields = 9; return KeywordSpec.sflChoiceRules(k).subfileShape.outputFields === 1; })());
});
const nsf = KeywordSpec.sflChoiceRules('SFLMLTCHC').numberSelectedField;
check('SFLMLTCHC: number-selected field is hidden Y, length 4, 0 decimals', nsf.dataType === 'Y' && nsf.length === 4 && nsf.decimalPositions === 0 && nsf.usage === 'H');
check('SFLSNGCHC has no number-selected field; other keywords have no rules',
  KeywordSpec.sflChoiceRules('SFLSNGCHC').numberSelectedField === null && KeywordSpec.sflChoiceRules('SFLDSP') === null);
check('SFLMLTCHC citation quotes the 4 / Y / zero-decimal sentence', /length of 4, data type of Y, and zero decimal positions/.test(KeywordSpec.RECORD_TYPES.SFLMLTCHC.numberSelectedField.ddsReference));

console.log('\n=== subfile shape (both keywords) ===');
['SFLSNGCHC', 'SFLMLTCHC'].forEach((k) => {
  const add = (sub) => guard(build(sub, []), build(sub, [K(k)]));
  check(k + ': one output field plus a hidden field is accepted', add(good) === null);
  check(k + ': a program-to-system field and a constant are not output fields', add([OUT('F1', 6), PRG('P1'), CONST(1)]) === null);
  check(k + ': an empty subfile is accepted (it is still being built)', add([]) === null);
  const two = add([OUT('F1', 6), OUT('F2', 7)]);
  check(k + ': two output fields are refused when the keyword is added', /2 output fields/.test(two || '') && /must contain only 1 output field/.test(two || ''));
  const inp = add([OUT('F1', 6), INP('F2', 7)]);
  check(k + ': an input field is refused (named)', /field F2/.test(inp || '') && /input capable/.test(inp || ''));
  const both = add([OUT('F1', 6), BOTH('F2', 7)]);
  check(k + ': an input/output field is refused too', /field F2/.test(both || '') && /input capable/.test(both || ''));
  const grown = guard(build(good, [K(k)]), build(good.concat([OUT('F2', 7)]), [K(k)]));
  check(k + ': adding a second output field to the subfile is refused (the other direction)', /2 output fields/.test(grown || ''));
  const grownIn = guard(build(good, [K(k)]), build(good.concat([INP('F2', 7)]), [K(k)]));
  check(k + ': adding an input field to the subfile is refused', /field F2/.test(grownIn || ''));
  check(k + ': adding a hidden field to the subfile is accepted', guard(build(good, [K(k)]), build(good.concat([HID('H2')]), [K(k)])) === null);
  check(k + ': removing the extra field clears it', guard(build([OUT('F1', 6), OUT('F2', 7)], [K(k)]), build([OUT('F1', 6)], [K(k)])) === null);
  check(k + ': an already-invalid hand-written subfile does not block an unrelated edit',
    guard(build([OUT('F1', 6), OUT('F2', 7)], [K(k)]), build([OUT('F1', 6), OUT('F2', 7)], [K(k), K('SFLPAG(5)')])) === null);
  check(k + ': a third output field on an already-invalid subfile is not re-reported (same rule, same key)',
    guard(build([OUT('F1', 6), OUT('F2', 7)], [K(k)]), build([OUT('F1', 6), OUT('F2', 7), OUT('F3', 8)], [K(k)])) === null);
  // forward references
  const fwd = text([R('CTL'), K('SFLCTL(LATER)'), K(k)]);
  check(k + ': SFLCTL naming a subfile that does not exist yet is a forward reference', guard(text([R('CTL'), K('SFLCTL(LATER)')]), fwd) === null);
  const noSfl = text([R('PLAINREC'), OUT('F1', 1), OUT('F2', 2), R('CTL'), K('SFLCTL(PLAINREC)'), K(k)]);
  check(k + ': SFLCTL naming a record that is not a subfile (no SFL) is left alone', guard(text([R('PLAINREC'), OUT('F1', 1), OUT('F2', 2), R('CTL'), K('SFLCTL(PLAINREC)')]), noSfl) === null);
});

console.log('\n=== control record only ===');
['SFLSNGCHC', 'SFLMLTCHC'].forEach((k) => {
  const onSfl = guard(build(good, []), text([R('SFLRCD'), K('SFL'), K(k), OUT('F1', 6), R('CTL'), K('SFLCTL(SFLRCD)')]));
  check(k + ' on the SFL record itself is refused', /valid only on a subfile control record/.test(onSfl || '') && /record format SFLRCD/.test(onSfl || ''));
  const onPlain = guard(build(good, []), build(good, []) + text([R('PLAIN'), K(k)]));
  check(k + ' on a plain record is refused', /record format PLAIN/.test(onPlain || ''));
  const dropCtl = guard(build(good, [K(k)]), text([R('SFLRCD'), K('SFL')].concat(good, [R('CTL'), K(k)])));
  check(k + ': removing SFLCTL while it is present is refused (the other direction)', /valid only on a subfile control record/.test(dropCtl || ''));
  check(k + ': on a control record with SFLCTL it is accepted', guard(build(good, []), build(good, [K(k)])) === null);
  check(k + ': a hand-written misplaced one does not block an unrelated edit',
    guard(build(good, []).replace('SFLCTL(SFLRCD)', 'SFLCTL(SFLRCD)') + text([R('PLAIN'), K(k)]), build(good, []) + text([R('PLAIN'), K(k), K('ALARM')])) === null);
});

console.log('\n=== SFLMLTCHC &number-selected ===');
const mlt = (par, ctlFields, sub) => build(sub || good, [K('SFLMLTCHC' + par)].concat(ctlFields));
const base = build(good, []);
check('a hidden Y 4,0 field in the control record is accepted', guard(base, mlt('(&NUMSEL)', [NUM('NUMSEL', {})])) === null);
check('the parameter mixes with the other parameters', guard(base, mlt('(&NUMSEL *RSTCSR *SLTIND)', [NUM('NUMSEL', {})])) === null);
[['data type S', { type: 'S' }], ['length 5', { len: 5 }], ['one decimal position', { dec: 1, type: 'S' }], ['usage O', { use: 'O' }], ['usage B', { use: 'B' }]].forEach(([what, o]) => {
  const r = guard(base, mlt('(&NUMSEL)', [NUM('NUMSEL', o)]));
  check('number-selected field with ' + what + ' is refused', /SFLMLTCHC\(&NUMSEL\)/.test(r || '') && /hidden field with a length of 4, data type Y and 0 decimal positions/.test(r || ''));
});
check('a field that does not exist yet is a forward reference', guard(base, mlt('(&LATER)', [])) === null);
check('the field is found in the subfile record too', guard(base, mlt('(&NUMSEL)', [], good.concat([NUM('NUMSEL', {})]))) === null);
const badInSub = guard(base, mlt('(&NUMSEL)', [], good.concat([NUM('NUMSEL', { len: 6 })])));
check('...and checked there', /SFLMLTCHC\(&NUMSEL\)/.test(badInSub || ''));
check('defining the missing field wrongly afterwards is refused (field added after the keyword)',
  /SFLMLTCHC\(&LATER\)/.test(guard(mlt('(&LATER)', []), mlt('(&LATER)', [NUM('LATER', { len: 3 })])) || ''));
check('defining it correctly afterwards is accepted', guard(mlt('(&LATER)', []), mlt('(&LATER)', [NUM('LATER', {})])) === null);
check('fixing a hand-written bad field clears the conflict', guard(mlt('(&NUMSEL)', [NUM('NUMSEL', { len: 6 })]), mlt('(&NUMSEL)', [NUM('NUMSEL', {})])) === null);
check('a hand-written bad field does not block an unrelated edit',
  guard(mlt('(&NUMSEL)', [NUM('NUMSEL', { len: 6 })]), mlt('(&NUMSEL)', [NUM('NUMSEL', { len: 6 }), K('SFLPAG(5)')])) === null);
check('SFLSNGCHC with an & token is not number-selected-checked', guard(base, build(good, [K('SFLSNGCHC(&NUMSEL)'), NUM('NUMSEL', { len: 6 })])) === null);

console.log('\n=== raw keyword editor (jsdom) ===');
const SRC = text([R('SFLRCD'), K('SFL'), OUT('F1', 6), OUT('F2', 7), R('CTL'), K('SFLCTL(SFLRCD)'), R('OKSFL'), K('SFL'), OUT('G1', 8), R('OKCTL'), K('SFLCTL(OKSFL)'), R('PLAINR'), OUT('P1', 3)]);
const posted = []; const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'MYSCR.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => { alerts.push(String(m)); };
  },
});
setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, t) => el.dispatchEvent(new Event(t || 'change', { bubbles: true }));
  const sel = doc.getElementById('recordSelect');
  const reset = () => { for (let i = 0; i < 2; i++) dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'externalUpdate', text: SRC } })); };
  function add(record, kw, params) {
    sel.value = record; fire(sel);
    doc.getElementById('record-' + record + '-new-kw-name').value = kw;
    const pe = doc.getElementById('record-' + record + '-new-kw-params'); if (pe) pe.value = params || '';
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="record-' + record + '"]'), 'click');
    const e = posted.filter((m) => m.type === 'applyEdit').pop();
    const r = { text: e ? e.text : null, alert: alerts[alerts.length - 1] || null };
    reset();
    return r;
  }
  let r = add('SFLRCD', 'SFLSNGCHC');
  check('raw add of SFLSNGCHC on the SFL record is refused and nothing is written (the subfile-record guard already says so)', r.text === null && /subfile \(SFL\) record format/.test(r.alert || ''));
  r = add('PLAINR', 'SFLMLTCHC');
  check('raw add of SFLMLTCHC to a plain record is refused (I-184: valid only on a control record)', r.text === null && /valid only on a subfile control record/.test(r.alert || ''));
  r = add('CTL', 'SFLSNGCHC');
  check('raw add of SFLSNGCHC to a control record whose subfile has two output fields is refused', r.text === null && /2 output fields/.test(r.alert || ''));
  r = add('CTL', 'SFLMLTCHC', '&NUMSEL');
  check('raw add of SFLMLTCHC(&NUMSEL) there is refused for the same reason', r.text === null && /2 output fields/.test(r.alert || ''));
  r = add('OKCTL', 'SFLSNGCHC');
  check('raw add of SFLSNGCHC to a control record with a one-output-field subfile is written', r.alert === null && r.text !== null && /SFLSNGCHC/.test(r.text) && parse(r.text).records.find((x) => x.name === 'OKCTL').keywords.some((k) => k.name === 'SFLSNGCHC'));
  r = add('OKCTL', 'SFLMLTCHC', '&NOSUCH');
  check('raw add of SFLMLTCHC(&NOSUCH) (a forward reference) is written', r.alert === null && r.text !== null);
  console.log('\n  failures:', failureCount());
  process.exit(failureCount() === 0 ? 0 : 1);
}, 1500);

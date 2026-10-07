/**
 * i150FieldKeywordKindRules.test.js
 *
 * Task I-150 - the I-121n slice found usage / data type / subfile rules for
 * four field keywords unenforced: BLANKS (input-capable), CNTFLD (input-capable
 * data type A, not in a subfile, width < field length), FLDCSRPRG (input-capable,
 * not in a subfile, names an input-capable field of the same record, not with
 * SNGCHCFLD / MLTCHCFLD), FLTFIXDEC (usage B or O, data type F). Model-diff
 * guard (the I-140 / I-149 shape): covers the raw editor, every panel and the
 * Basic tab's usage / data type change, and does not re-report a hand-written
 * field that is already wrong.
 *
 * Run with: node src/test/i150FieldKeywordKindRules.test.js
 */
const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

let n = 0;
const L = (o) => buildLine(Object.assign({ seq: String(++n * 10 + 1000).slice(-5) }, o));
function model(lines) { n = 0; return DspfParser.parseDspf(lines.map(L).join('\n') + '\n'); }
const rec = (name, kw) => [{ nameType: 'R', name }].concat(kw ? [{ func: kw }] : []);
const fld = (name, len, dt, usage, func, dec) => Object.assign({ name, length: String(len), dataType: dt, usage, func }, dec ? { decimals: dec } : {});
const reason = (a, b) => DspfWriter.fieldKindNewConflictReason(model(a), model(b));
// one field F1 before / after, in an ordinary record
const one = (len, dt, usage, func, dec) => rec('R1').concat([fld('F1', len, dt, usage, func, dec)]);
const none = (len, dt, usage, dec) => one(len, dt, usage, undefined, dec);

// ---- facts ----
check('the guarded keywords are the five (FLTPCN added by I-180), in order', KeywordSpec.fieldKindGuardedKeywords().join() === 'BLANKS,CNTFLD,FLDCSRPRG,FLTFIXDEC,FLTPCN');
check('usage / type facts the guard reads', KeywordSpec.allowedUsage('BLANKS').join() === 'I,B' && KeywordSpec.allowedUsage('CNTFLD').join() === 'I,B' && KeywordSpec.allowedUsage('FLDCSRPRG').join() === 'I,B' && KeywordSpec.allowedUsage('FLTFIXDEC').join() === 'B,O' && KeywordSpec.requiredDataTypes('CNTFLD').join() === 'A' && KeywordSpec.requiredDataTypes('FLTFIXDEC').join() === 'F' && KeywordSpec.requiredDataTypes('BLANKS') === null);
check('subfile / mutex facts', KeywordSpec.notInSubfile('CNTFLD') && KeywordSpec.notInSubfile('FLDCSRPRG') && !KeywordSpec.notInSubfile('BLANKS') && !KeywordSpec.notInSubfile('FLTFIXDEC') && KeywordSpec.notWithKeywords('FLDCSRPRG').join() === 'SNGCHCFLD,MLTCHCFLD');

// ---- BLANKS ----
check('BLANKS on an input field is accepted (numeric and character)', reason(none(5, 'S', 'I', 0), one(5, 'S', 'I', 'BLANKS(31)', 0)) === null && reason(none(5, 'A', 'B'), one(5, 'A', 'B', 'BLANKS(31)')) === null);
['O', 'H'].forEach((u) => check('BLANKS on usage ' + u + ' is refused', /needs usage I or B/.test(reason(none(5, 'S', u, 0), one(5, 'S', u, 'BLANKS(31)', 0)) || '')));
check('BLANKS on a blank-usage (output) field is refused', /usage O/.test(reason(none(5, 'S', '', 0), one(5, 'S', '', 'BLANKS(31)', 0)) || ''));
check('changing the usage of a BLANKS field to O is refused', /needs usage I or B/.test(reason(one(5, 'S', 'I', 'BLANKS(31)', 0), one(5, 'S', 'O', 'BLANKS(31)', 0)) || ''));

// ---- CNTFLD ----
check('CNTFLD(40) on an A100 input field is accepted', reason(none(100, 'A', 'I'), one(100, 'A', 'I', 'CNTFLD(40)')) === null);
check('CNTFLD on a blank-type field (character by default) is accepted', reason(none(100, '', 'B'), one(100, '', 'B', 'CNTFLD(40)')) === null);
check('CNTFLD on an output field is refused', /needs usage I or B/.test(reason(none(100, 'A', 'O'), one(100, 'A', 'O', 'CNTFLD(40)')) || ''));
check('CNTFLD on a numeric field is refused', /needs data type A/.test(reason(none(10, 'S', 'I', 0), one(10, 'S', 'I', 'CNTFLD(5)', 0)) || ''));
check('CNTFLD on a blank-type field WITH decimal positions (numeric) is refused', /needs data type A/.test(reason(none(10, '', 'I', 2), one(10, '', 'I', 'CNTFLD(5)', 2)) || ''));
check('CNTFLD width equal to the length is refused', /less than the field length \(40\)/.test(reason(none(40, 'A', 'I'), one(40, 'A', 'I', 'CNTFLD(40)')) || ''));
check('CNTFLD width above the length is refused', /less than/.test(reason(none(40, 'A', 'I'), one(40, 'A', 'I', 'CNTFLD(80)')) || ''));
check('shrinking the field length to the width is refused', /less than/.test(reason(one(100, 'A', 'I', 'CNTFLD(40)'), one(40, 'A', 'I', 'CNTFLD(40)')) || ''));
const sflRec = (kw) => rec('SFLR', 'SFL').concat([fld('F1', 100, 'A', 'I', kw)]);
check('CNTFLD in a subfile record is refused', /subfile/.test(reason(sflRec(undefined), sflRec('CNTFLD(40)')) || ''));

// ---- FLDCSRPRG ----
const two = (kw, u2, extra) => rec('R1').concat([fld('F1', 10, 'A', 'B', kw), fld('F2', 10, 'A', u2 || 'B', extra)]);
check('FLDCSRPRG(F2) naming an input-capable field is accepted', reason(two(undefined), two('FLDCSRPRG(F2)')) === null);
check('FLDCSRPRG on an output field is refused', /needs usage I or B/.test(reason(rec('R1').concat([fld('F1', 10, 'A', 'O'), fld('F2', 10, 'A', 'B')]), rec('R1').concat([fld('F1', 10, 'A', 'O', 'FLDCSRPRG(F2)'), fld('F2', 10, 'A', 'B')])) || ''));
check('FLDCSRPRG naming a missing field is refused', /must name an input-capable field/.test(reason(two(undefined), two('FLDCSRPRG(NOPE)')) || ''));
check('FLDCSRPRG naming an output field is refused', /must name an input-capable field/.test(reason(two(undefined, 'O'), two('FLDCSRPRG(F2)', 'O')) || ''));
check('FLDCSRPRG in a subfile record is refused', /subfile/.test(reason(rec('SFLR', 'SFL').concat([fld('F1', 10, 'A', 'B'), fld('F2', 10, 'A', 'B')]), rec('SFLR', 'SFL').concat([fld('F1', 10, 'A', 'B', 'FLDCSRPRG(F2)'), fld('F2', 10, 'A', 'B')])) || ''));
['SNGCHCFLD', 'MLTCHCFLD'].forEach((k) => {
  const f = (kw) => rec('R1').concat([fld('F1', 10, 'A', 'B', kw), fld('F2', 10, 'A', 'B')]);
  const w = (extra) => rec('R1').concat([Object.assign(fld('F1', 10, 'A', 'B', 'FLDCSRPRG(F2)'), {}), { func: extra }, fld('F2', 10, 'A', 'B')]);
  check('FLDCSRPRG with ' + k + ' on the same field is refused', new RegExp(k).test(reason(f('FLDCSRPRG(F2)'), w(k)) || ''));
});

// ---- FLTFIXDEC ----
check('FLTFIXDEC on an F output field is accepted', reason(none(9, 'F', 'O', 2), one(9, 'F', 'O', 'FLTFIXDEC', 2)) === null);
check('FLTFIXDEC on an F both field is accepted', reason(none(9, 'F', 'B', 2), one(9, 'F', 'B', 'FLTFIXDEC', 2)) === null);
check('FLTFIXDEC on an F blank-usage (output) field is accepted', reason(none(9, 'F', '', 2), one(9, 'F', '', 'FLTFIXDEC', 2)) === null);
check('FLTFIXDEC on an F input-only field is refused', /needs usage B or O/.test(reason(none(9, 'F', 'I', 2), one(9, 'F', 'I', 'FLTFIXDEC', 2)) || ''));
check('FLTFIXDEC on a non-float field is refused', /needs data type F/.test(reason(none(9, 'S', 'O', 2), one(9, 'S', 'O', 'FLTFIXDEC', 2)) || ''));
check('changing the data type of a FLTFIXDEC field away from F is refused', /needs data type F/.test(reason(one(9, 'F', 'O', 'FLTFIXDEC', 2), one(9, 'S', 'O', 'FLTFIXDEC', 2)) || ''));

// ---- hand-written leftovers and renames ----
check('an existing violation is not re-reported on an unrelated edit', reason(one(5, 'S', 'O', 'BLANKS(31)', 0), one(5, 'S', 'O', 'BLANKS(31)', 0).concat([{ func: 'TEXT(\'x\')' }])) === null);
check('renaming an already-wrong field is not a new violation', reason(one(5, 'S', 'O', 'BLANKS(31)', 0), rec('R1').concat([fld('RENAMED', 5, 'S', 'O', 'BLANKS(31)', 0)])) === null);
check('a SECOND violating field is reported', /BLANKS/.test(reason(one(5, 'S', 'O', 'BLANKS(31)', 0), rec('R1').concat([fld('F1', 5, 'S', 'O', 'BLANKS(31)', 0), fld('F2', 5, 'S', 'O', 'BLANKS(32)', 0)])) || ''));
check('removing the keyword is never blocked', reason(one(5, 'S', 'O', 'BLANKS(31)', 0), none(5, 'S', 'O', 0)) === null);
check('constants are not judged', reason(rec('R1'), rec('R1').concat([{ constant: "'TEXT'", line: '1', col: '2' }])) === null);

// ---- the General tab rows, in the real generated webview (jsdom) ----
const { newWebviewDom, webviewHtml } = require('./helpers/common');
(function () {
  const bl = (o) => buildLine(o);
  const src = [
    bl({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
    bl({ seq: '00020', nameType: 'R', name: 'SCR1' }),
    bl({ seq: '00030', name: 'CHARIN', length: '20', dataType: 'A', usage: 'B', line: '3', col: '5' }),
    bl({ seq: '00040', name: 'CHAROUT', length: '20', dataType: 'A', usage: 'O', line: '4', col: '5' }),
    bl({ seq: '00050', name: 'NUMIN', length: '7', dataType: 'S', decimals: '0', usage: 'B', line: '5', col: '5' }),
    bl({ seq: '00060', name: 'FLTOUT', length: '9', dataType: 'F', decimals: '2', usage: 'O', line: '6', col: '5' }),
    bl({ seq: '00070', name: 'FLTIN', length: '9', dataType: 'F', decimals: '2', usage: 'I', line: '7', col: '5' }),
    bl({ seq: '00080', name: 'CHARIN2', length: '20', dataType: 'A', usage: 'B', line: '8', col: '5' })
  ].join('\n') + '\n';
  const posted = [];
  let alerted = null;
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', src, 'MYSCR.DSPF'), {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => { alerted = m; };
    }
  });
  const doc = dom.window.document;
  function open(name) {
    const el = Array.from(doc.querySelectorAll('.dspf-field')).find((e) => (e.getAttribute('data-field') || '') === name);
    if (!el) return null;
    el.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    return 'field-' + el.getAttribute('data-source-line');
  }
  const rows = (k, kw) => ({ on: !!doc.getElementById(k + '-gen-' + kw + '-on') });
  let k = open('CHARIN');
  check('CNTFLD row is offered on a character input/output field', rows(k, 'cntfld').on);
  check('FLDCSRPRG row is offered on an input/output field', rows(k, 'fldcsrprg').on);
  check('FLTFIXDEC row is not offered on a character field', !rows(k, 'fltfixdec').on);
  k = open('CHAROUT');
  check('CNTFLD row is not offered on an output-only field', !rows(k, 'cntfld').on);
  check('FLDCSRPRG row is not offered on an output-only field', !rows(k, 'fldcsrprg').on);
  k = open('NUMIN');
  check('CNTFLD row is not offered on a numeric field', !rows(k, 'cntfld').on);
  k = open('FLTOUT');
  check('FLTFIXDEC row is offered on a floating-point output field', rows(k, 'fltfixdec').on);
  k = open('FLTIN');
  check('FLTFIXDEC row is not offered on a floating-point input-only field', !rows(k, 'fltfixdec').on);
  // an edit through the row still commits where the row is offered, and the guard refuses a bad width
  k = open('CHARIN2');
  posted.length = 0; alerted = null;
  const on = doc.getElementById(k + '-gen-cntfld-on');
  const params = doc.getElementById(k + '-gen-cntfld-params');
  params.value = '40';
  on.checked = true;
  on.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  check('CNTFLD(40) on a 20-long field is refused with an alert and no edit', /less than the field length/.test(alerted || '') && !posted.some((m) => m.type === 'applyEdit'));
  posted.length = 0; alerted = null;
  k = open('CHARIN2');
  const on2 = doc.getElementById(k + '-gen-cntfld-on');
  const params2 = doc.getElementById(k + '-gen-cntfld-params');
  params2.value = '10';
  on2.checked = true;
  on2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const edit = posted.find((m) => m.type === 'applyEdit');
  check('CNTFLD(10) on that field commits', !!edit && /CNTFLD\(10\)/.test(edit.text) && alerted === null);
})();

// ---- wiring ----
check('the guard is exported and used by the webview edit choke point', typeof DspfWriter.fieldKindNewConflictReason === 'function' && /fieldKindNewConflictReason/.test(require('fs').readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8')));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i180FltpcnCntfldRules.test.js
 *
 * Task I-180 - FLTPCN's and CNTFLD's own DDS Reference sections state rules that were
 * not enforced (opened from I-122e):
 *   FLTPCN(*SINGLE | *DOUBLE): data type F only; "A single precision field can be up to
 *     9 digits; a double precision field can be up to 17 digits. If you specify a field
 *     length greater than 9 (single precision) or 17 (double precision), an error message
 *     appears and the file is not created."; "Option indicators are not valid for this keyword."
 *   CNTFLD(width of column): "One parameter must be specified."; and "The following keywords
 *     cannot be specified on a field with the CNTFLD keyword: AUTO (RAB, RAZ),
 *     CHECK(AB, MF, RB, RZ, RLTB), CHOICE, DSPATR(OID SP), EDTMSK".
 *
 * Covers the spec facts, the model-diff guard (fieldKindNewConflictReason, the same one
 * that carries the I-150 rules) and, through the real generated designer script (jsdom),
 * the raw keyword editor's commitEdit backstop.
 * Run with: node src/test/i180FltpcnCntfldRules.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const build = (lines) => lines.join('\n') + '\n';
// One record R1 with one field F1 (type/usage/length/keywords as given).
const doc = (len, type, usage, fn, dec) => DspfParser.parseDspf(build([
  dds({ rec: 1, name: 'R1' }),
  dds({ name: 'F1', len: len, type: type, dec: dec, usage: usage, line: 3, pos: 3, fn: fn }),
]));
const G = (a, b) => DspfWriter.fieldKindNewConflictReason(a, b);

console.log('\nkeywordSpec.js - FLTPCN and CNTFLD facts');
{
  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').replace(/\s+/g, ' ');
  check('FLTPCN is now an I-150 guarded keyword (last of five)', KeywordSpec.fieldKindGuardedKeywords().join() === 'BLANKS,CNTFLD,FLDCSRPRG,FLTFIXDEC,FLTPCN');
  check('FLTPCN parameter values are *SINGLE and *DOUBLE (a copy)', KeywordSpec.parameterValues('FLTPCN').join() === '*SINGLE,*DOUBLE' && (function () { KeywordSpec.parameterValues('FLTPCN').push('X'); return KeywordSpec.parameterValues('FLTPCN').length === 2; })());
  check('FLTPCN length caps are 9 and 17 (a copy)', JSON.stringify(KeywordSpec.maxLengthByParameter('FLTPCN')) === JSON.stringify({ '*SINGLE': 9, '*DOUBLE': 17 }) && (function () { KeywordSpec.maxLengthByParameter('FLTPCN')['*SINGLE'] = 1; return KeywordSpec.maxLengthByParameter('FLTPCN')['*SINGLE'] === 9; })());
  check('the length-cap sentence appears verbatim in DDS_Keyword_V7r6.txt', ref.indexOf(KeywordSpec.maxLengthReference('FLTPCN')) !== -1);
  check('FLTPCN option indicators: not valid, field level', KeywordSpec.noOptionIndicatorsFact('FLTPCN').kind === 'notValid' && KeywordSpec.noOptionIndicatorsFact('FLTPCN').levels.join() === 'field');
  check('CNTFLD width parameter must be a number; FLTPCN does not carry that fact', KeywordSpec.widthParameterIsNumber('CNTFLD') === true && KeywordSpec.widthParameterIsNumber('FLTPCN') === false);
  check('CNTFLD exclusion list is on its entry: AUTO RAB/RAZ, CHECK AB/MF/RB/RZ/RLTB, CHOICE, DSPATR OID/SP, EDTMSK',
    JSON.stringify(KeywordSpec.RECORD_TYPES.CNTFLD.conditionalMutex) === JSON.stringify({ AUTO: ['RAB', 'RAZ'], CHECK: ['AB', 'MF', 'RB', 'RZ', 'RLTB'], CHOICE: null, DSPATR: ['OID', 'SP'], EDTMSK: null }));
  check('the exclusion sentence appears verbatim', ref.indexOf('The following keywords cannot be specified on a field with the CNTFLD keyword: • AUTO (RAB, RAZ) • CHECK(AB, MF, RB, RZ, RLTB) • CHOICE • DSPATR(OID SP) • EDTMSK') !== -1);
  check('token matching: AUTO(RAB) and CHECK(AB) hit, bare AUTO, CHECK(ME) and DSPATR(HI) do not',
    KeywordSpec.conditionalMutexHit('CNTFLD', { name: 'AUTO', parameters: 'RAB' }) === 'AUTO(RAB)' && KeywordSpec.conditionalMutexHit('CNTFLD', { name: 'CHECK', parameters: 'AB' }) === 'CHECK(AB)' &&
    KeywordSpec.conditionalMutexHit('CNTFLD', { name: 'AUTO', parameters: '' }) === null && KeywordSpec.conditionalMutexHit('CNTFLD', { name: 'CHECK', parameters: 'ME' }) === null && KeywordSpec.conditionalMutexHit('CNTFLD', { name: 'DSPATR', parameters: 'HI' }) === null);
  check('other keywords answer null/false', KeywordSpec.parameterValues('CNTFLD') === null && KeywordSpec.maxLengthByParameter('BLANKS') === null && KeywordSpec.maxLengthReference('BLANKS') === '');
}

console.log('\nFLTPCN - the guard (fieldKindNewConflictReason)');
{
  const none = (len, type, usage, dec) => doc(len, type, usage, undefined, dec);
  check('FLTPCN(*DOUBLE) on an F17 field is accepted', G(none(17, 'F', 'B', 2), doc(17, 'F', 'B', 'FLTPCN(*DOUBLE)', 2)) === null);
  check('FLTPCN(*SINGLE) on an F9 field is accepted', G(none(9, 'F', 'B', 2), doc(9, 'F', 'B', 'FLTPCN(*SINGLE)', 2)) === null);
  check('lower case *single is accepted', G(none(9, 'F', 'B', 2), doc(9, 'F', 'B', 'FLTPCN(*single)', 2)) === null);
  check('FLTPCN(*FOO) is refused, naming FOO and the two values', /\*FOO/.test(G(none(9, 'F', 'B', 2), doc(9, 'F', 'B', 'FLTPCN(*FOO)', 2)) || '') && /\*SINGLE or \*DOUBLE/.test(G(none(9, 'F', 'B', 2), doc(9, 'F', 'B', 'FLTPCN(*FOO)', 2)) || ''));
  check('SINGLE without the star is refused', G(none(9, 'F', 'B', 2), doc(9, 'F', 'B', 'FLTPCN(SINGLE)', 2)) !== null);
  check('a bare FLTPCN is refused (the format has no brackets)', /\*SINGLE or \*DOUBLE/.test(G(none(9, 'F', 'B', 2), doc(9, 'F', 'B', 'FLTPCN', 2)) || ''));
  check('FLTPCN(*SINGLE) on an F10 field is refused (cap 9), saying the file would not be created', /more than 9 digits/.test(G(none(10, 'F', 'B', 2), doc(10, 'F', 'B', 'FLTPCN(*SINGLE)', 2)) || '') && /not be created/.test(G(none(10, 'F', 'B', 2), doc(10, 'F', 'B', 'FLTPCN(*SINGLE)', 2)) || ''));
  check('FLTPCN(*DOUBLE) on an F18 field is refused (cap 17); on F17 it is not', /more than 17 digits/.test(G(none(18, 'F', 'B', 2), doc(18, 'F', 'B', 'FLTPCN(*DOUBLE)', 2)) || ''));
  check('FLTPCN(*DOUBLE) on an F10 field is accepted (a double allows up to 17)', G(none(10, 'F', 'B', 2), doc(10, 'F', 'B', 'FLTPCN(*DOUBLE)', 2)) === null);
  check('FLTPCN on a character field is refused (data type F)', /needs data type F/.test(G(none(9, 'A', 'B'), doc(9, 'A', 'B', 'FLTPCN(*SINGLE)')) || ''));
  check('FLTPCN on a packed field is refused', /needs data type F/.test(G(none(9, 'P', 'B', 2), doc(9, 'P', 'B', 'FLTPCN(*SINGLE)', 2)) || ''));
  check('lengthening an F9 *SINGLE field to 12 is refused', /more than 9 digits/.test(G(doc(9, 'F', 'B', 'FLTPCN(*SINGLE)', 2), doc(12, 'F', 'B', 'FLTPCN(*SINGLE)', 2)) || ''));
  check('changing *DOUBLE to *SINGLE on an F12 field is refused', /more than 9 digits/.test(G(doc(12, 'F', 'B', 'FLTPCN(*DOUBLE)', 2), doc(12, 'F', 'B', 'FLTPCN(*SINGLE)', 2)) || ''));
  check('an already-wrong F20 *DOUBLE field is not re-reported on an unrelated edit', G(doc(20, 'F', 'B', 'FLTPCN(*DOUBLE)', 2), doc(20, 'F', 'B', 'FLTPCN(*DOUBLE)', 2)) === null);
  check('removing FLTPCN from a wrong field is never blocked', G(doc(20, 'F', 'B', 'FLTPCN(*DOUBLE)', 2), doc(20, 'F', 'B', undefined, 2)) === null);
  check('FLTPCN needs no particular usage (O, B, I, H all accepted)', ['O', 'B', 'I', 'H'].every((u) => G(none(9, 'F', u, 2), doc(9, 'F', u, 'FLTPCN(*SINGLE)', 2)) === null));
  const cond = [{ indicators: [{ number: '01', not: false }] }];
  check('option indicators on FLTPCN are refused when added, not when removed or unchanged',
    /FLTPCN/.test(DspfWriter.noOptionIndicatorsNewConflictReason('FLTPCN', [], cond) || '') && DspfWriter.noOptionIndicatorsNewConflictReason('FLTPCN', cond, []) === null && DspfWriter.noOptionIndicatorsNewConflictReason('FLTPCN', cond, cond) === null);
}

console.log('\nCNTFLD - the guard (fieldKindNewConflictReason)');
{
  const noneA = () => doc(60, 'A', 'I');
  check('CNTFLD(20) on an A60 input field is accepted', G(noneA(), doc(60, 'A', 'I', 'CNTFLD(20)')) === null);
  check('CNTFLD(abc) is refused, naming abc and the whole-number rule', /abc/.test(G(noneA(), doc(60, 'A', 'I', 'CNTFLD(abc)')) || '') && /whole number/.test(G(noneA(), doc(60, 'A', 'I', 'CNTFLD(abc)')) || ''));
  check('CNTFLD(2.5) and CNTFLD(-3) are refused', G(noneA(), doc(60, 'A', 'I', 'CNTFLD(2.5)')) !== null && G(noneA(), doc(60, 'A', 'I', 'CNTFLD(-3)')) !== null);
  check('a bare CNTFLD is refused ("One parameter must be specified")', /whole number/.test(G(noneA(), doc(60, 'A', 'I', 'CNTFLD')) || ''));
  check('the existing width rule still reports first for CNTFLD(60) on A60', /less than the field length/.test(G(noneA(), doc(60, 'A', 'I', 'CNTFLD(60)')) || ''));
  const withKw = (kw) => doc(60, 'A', 'I', kw);
  [['AUTO(RAB)', /AUTO\(RAB\)/], ['AUTO(RAZ)', /AUTO\(RAZ\)/], ['CHECK(AB)', /CHECK\(AB\)/], ['CHECK(RLTB)', /CHECK\(RLTB\)/], ['CHOICE(1 \'x\')', /CHOICE/], ['DSPATR(SP)', /DSPATR\(SP\)/], ['DSPATR(OID)', /DSPATR\(OID\)/], ['EDTMSK', /EDTMSK/]].forEach(([kw, re]) => {
    check('adding CNTFLD(20) to a field with ' + kw + ' is refused, naming it', re.test(G(withKw(kw), withKw(kw + ' CNTFLD(20)')) || '') && /cannot be specified with/.test(G(withKw(kw), withKw(kw + ' CNTFLD(20)')) || ''));
    check('adding ' + kw + ' to a field that has CNTFLD(20) is refused too', re.test(G(withKw('CNTFLD(20)'), withKw('CNTFLD(20) ' + kw)) || ''));
  });
  check('a bare AUTO, CHECK(ME) and DSPATR(HI) beside CNTFLD(20) are accepted', ['AUTO', 'CHECK(ME)', 'DSPATR(HI)'].every((kw) => G(withKw('CNTFLD(20)'), withKw('CNTFLD(20) ' + kw)) === null));
  check('an already-clashing hand-written field is not re-reported on an unrelated edit', G(withKw('CNTFLD(20) CHECK(AB)'), withKw('CNTFLD(20) CHECK(AB) COLOR(RED)')) === null);
  check('removing the clashing keyword, or CNTFLD, is never blocked', G(withKw('CNTFLD(20) CHECK(AB)'), withKw('CNTFLD(20)')) === null && G(withKw('CNTFLD(20) CHECK(AB)'), withKw('CHECK(AB)')) === null);
}

// ===========================================================================
console.log('\n=== the raw keyword editor (jsdom, commitEdit backstop) ===');
const SOURCE = build([
  dds({ rec: 1, name: 'CTL1', fn: 'CA03' }),
  dds({ name: 'FLT1', len: 9, type: 'F', dec: 2, usage: 'B', line: 2, pos: 2 }),
  dds({ name: 'FLT2', len: 12, type: 'F', dec: 2, usage: 'B', line: 3, pos: 2 }),
  dds({ name: 'CHR1', len: 10, type: 'A', usage: 'B', line: 4, pos: 2 }),
  dds({ name: 'TXT1', len: 60, type: 'A', usage: 'I', line: 5, pos: 2 }),
  dds({ name: 'TXT2', len: 60, type: 'A', usage: 'I', line: 6, pos: 2, fn: 'CHECK(AB)' }),
]);
const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (t) => { alerts.push(String(t)); };
  },
});
setTimeout(() => {
  const doc_ = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const sel = doc_.getElementById('recordSelect');
  sel.value = 'CTL1'; fire(sel);
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const reset = () => { posted.length = 0; alerts.length = 0; };
  const fieldFrom = (t, name) => { if (!t) return null; const r = DspfParser.parseDspf(t).records.find((x) => x.name === 'CTL1'); return r.fields.find((f) => f.name === name); };
  const pick = (name) => { const f = doc_.querySelector('#screenOutput .dspf-field[data-field="' + name + '"]'); if (f) fire(f, 'click'); return !!f; };
  const rawAdd = (field, kw, params) => {
    pick(field);
    const owner = Array.from(doc_.querySelectorAll('.kw-add')).map((e) => e.getAttribute('data-owner')).find((o) => /field/.test(o || ''));
    if (!owner) return false;
    doc_.getElementById(owner + '-new-kw-name').value = kw;
    doc_.getElementById(owner + '-new-kw-params').value = params;
    reset();
    fire(doc_.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
    return true;
  };

  check('all five fields are on the canvas', ['FLT1', 'FLT2', 'CHR1', 'TXT1', 'TXT2'].every(pick));

  check('the raw editor is reachable', rawAdd('FLT1', 'FLTPCN', '*FOO'));
  check('raw-adding FLTPCN(*FOO) is refused: no edit posted, message names *FOO', lastText() === null && alerts.some((a) => /\*FOO/.test(a)));
  rawAdd('FLT2', 'FLTPCN', '*SINGLE');
  check('raw-adding FLTPCN(*SINGLE) to an F12 field is refused (cap 9)', lastText() === null && alerts.some((a) => /more than 9 digits/.test(a)));
  rawAdd('CHR1', 'FLTPCN', '*SINGLE');
  check('raw-adding FLTPCN to a character field is refused (needs data type F)', lastText() === null && alerts.some((a) => /needs data type F/.test(a)));
  rawAdd('TXT1', 'CNTFLD', 'abc');
  check('raw-adding CNTFLD(abc) is refused', lastText() === null && alerts.some((a) => /abc/.test(a) && /whole number/.test(a)));
  rawAdd('TXT2', 'CNTFLD', '20');
  check('raw-adding CNTFLD(20) to a field with CHECK(AB) is refused, naming CHECK(AB)', lastText() === null && alerts.some((a) => /CHECK\(AB\)/.test(a)));
  rawAdd('TXT1', 'AUTO', 'RAB');
  const ok1 = lastText();
  check('control: raw-adding AUTO(RAB) to a field WITHOUT CNTFLD is accepted', !!ok1 && !alerts.length);
  rawAdd('FLT1', 'FLTPCN', '*DOUBLE');
  const f = fieldFrom(lastText(), 'FLT1');
  check('control: raw-adding FLTPCN(*DOUBLE) to the F9 field is accepted', !!f && f.keywords.some((k) => k.name === 'FLTPCN' && k.parameters.trim() === '*DOUBLE') && !alerts.length);

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

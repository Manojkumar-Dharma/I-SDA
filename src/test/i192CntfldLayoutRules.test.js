/**
 * i192CntfldLayoutRules.test.js
 *
 * Task I-192 - CNTFLD's own DDS Reference section states two layout rules the guard did not enforce
 * (opened from I-180):
 *   - "This value must fit within the width of the display or window."
 *   - "The CNTFLD keyword must be defined with at least 2 spaces separating it from other fields."
 *
 * Width limit: the record's WINDOW width (numeric forms, or one named WINDOW reference resolved in the
 * same file), else the narrowest DSPSIZ width (24 x 80 when the file declares none). Spacing: the
 * continued-entry area is the field's line and column, `width` columns wide, as many rows as the
 * length needs; any other visible, positioned, non-constant field on one of those rows must leave at
 * least 2 blank columns. Reported only when an edit adds the violation (fieldKindNewConflictReason).
 * Run with: node src/test/i192CntfldLayoutRules.test.js
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
const G = (a, b) => DspfWriter.fieldKindNewConflictReason(a, b);

// F1: A90 input at line 3 column 4 (continued-entry area: columns 4-33 with CNTFLD(30), rows 3-5).
// `other` is the second field's spec (or null); `file` the file-level lines.
function doc(cnt, other, o) {
  o = o || {};
  const lines = (o.file === undefined ? [dds({ fn: 'DSPSIZ(24 80 *DS3)' })] : o.file).concat(o.pre || []);
  lines.push(dds({ rec: 1, name: o.rec || 'R1', fn: o.recFn }));
  if (o.recFn === undefined) lines.pop(), lines.push(dds({ rec: 1, name: o.rec || 'R1' }));
  lines.push(dds({ name: 'F1', len: o.len || 90, type: 'A', usage: 'I', line: 3, pos: 4, fn: cnt }));
  if (other) lines.push(dds(Object.assign({ name: 'F2', len: 5, type: 'A', usage: 'B' }, other)));
  return DspfParser.parseDspf(build(lines));
}
const PLAIN = doc(undefined, null);
const withF2 = (line, pos, extra) => doc('CNTFLD(30)', Object.assign({ line: line, pos: pos }, extra || {}));
const base = (line, pos, extra) => doc(undefined, Object.assign({ line: line, pos: pos }, extra || {}));

console.log('\nkeywordSpec.js - CNTFLD layout facts');
{
  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').replace(/\s+/g, ' ');
  check('CNTFLD must fit the display or window; 2 spaces from other fields', KeywordSpec.widthMustFitDisplay('CNTFLD') === true && KeywordSpec.minSpacesFromOtherFields('CNTFLD') === 2);
  check('other keywords carry neither', KeywordSpec.widthMustFitDisplay('FLTPCN') === false && KeywordSpec.minSpacesFromOtherFields('FLTPCN') === 0 && KeywordSpec.minSpacesFromOtherFields('NOSUCH') === 0);
  check('the spacing sentence appears verbatim in DDS_Keyword_V7r6.txt', ref.indexOf(KeywordSpec.RECORD_TYPES.CNTFLD.spacingReference) !== -1);
  check('the width sentences appear verbatim', ref.indexOf(KeywordSpec.RECORD_TYPES.CNTFLD.layoutReference) !== -1);
}

console.log('\nCNTFLD width fits the display or window');
{
  const wide = (w, o) => doc('CNTFLD(' + w + ')', null, o);
  const p = (w, o) => G(doc(undefined, null, o), wide(w, o));
  check('CNTFLD(80) on A90 in the default 24 x 80 display is accepted (the width equals the display)', p(80) === null);
  check('CNTFLD(81) is refused, naming 81, 80 columns and the display', /CNTFLD\(81\)/.test(p(81) || '') && /80 columns of the display/.test(p(81) || ''));
  check('with no DSPSIZ at all the default is 80', p(81, { file: [] }) !== null && p(80, { file: [] }) === null);
  check('DSPSIZ(*DS3 *DS4): the narrowest (80) applies', p(81, { file: [dds({ fn: 'DSPSIZ(*DS3 *DS4)' })] }) !== null && p(80, { file: [dds({ fn: 'DSPSIZ(*DS3 *DS4)' })] }) === null);
  check('DSPSIZ(*DS4) only: 132 columns, CNTFLD(100) accepted, CNTFLD(133) refused', p(100, { file: [dds({ fn: 'DSPSIZ(*DS4)' })], len: 200 }) === null && /132 columns/.test(p(133, { file: [dds({ fn: 'DSPSIZ(*DS4)' })], len: 200 }) || ''));
  check('numeric DSPSIZ(27 132 *DS4) works the same', /132 columns/.test(p(133, { file: [dds({ fn: 'DSPSIZ(27 132 *DS4)' })], len: 200 }) || ''));
  const win = { recFn: 'WINDOW(2 3 10 20)' };
  check('a positioned WINDOW(2 3 10 20): CNTFLD(20) accepted, CNTFLD(30) refused naming the window', p(20, win) === null && /20 columns of the window/.test(p(30, win) || ''));
  check('a sized WINDOW(*DFT 10 25): CNTFLD(26) refused', /25 columns of the window/.test(p(26, { recFn: 'WINDOW(*DFT 10 25)' }) || ''));
  check('a window wider than the display is not limited by the display (WINDOW 10 x 100 is the window rule only)', p(60, { recFn: 'WINDOW(2 3 10 100)' }) === null);
  const ref = { pre: [dds({ rec: 1, name: 'WIN0', fn: 'WINDOW(2 3 10 20)' })], recFn: 'WINDOW(WIN0)' };
  check('a WINDOW(WIN0) reference resolves WIN0\'s width: CNTFLD(30) refused', /20 columns of the window/.test(p(30, ref) || ''));
  check('a reference to a record that is not there falls back to the display', p(30, { recFn: 'WINDOW(NOWHERE)' }) === null);
  check('lengthening the window-less field to a too-wide width on an already-wrong field is not re-reported', G(wide(81), wide(81)) === null);
  check('removing CNTFLD from a too-wide field is never blocked', G(wide(81), doc(undefined, null)) === null);
  check('a non-numeric width gets the existing whole-number message only, not a fit message', !/columns of the/.test(G(doc(undefined, null), doc('CNTFLD(abc)', null)) || ''));
}

console.log('\nCNTFLD 2 spaces from other fields (F1: columns 4-33, rows 3-5)');
{
  const r = (line, pos, extra) => G(base(line, pos, extra), withF2(line, pos, extra));
  check('F2 at column 36 (2 spaces after column 33) on line 3 is accepted', r(3, 36) === null);
  check('F2 at column 35 (1 space) is refused, naming F2, its line and column', /F2 \(line 3, column 35\)/.test(r(3, 35) || '') && /closer than 2 spaces/.test(r(3, 35) || ''));
  check('F2 at column 34 (0 spaces) and column 33 (inside the area) are refused', r(3, 34) !== null && r(3, 33) !== null);
  check('F2 on the last row of the area (line 5) at column 35 is refused', r(5, 35) !== null);
  check('F2 on line 6 (below the area) and line 2 (above it) is accepted wherever it is', r(6, 5) === null && r(2, 5) === null && r(6, 34) === null);
  check('F2 inside the area on line 4 is refused', r(4, 20) !== null);
  check('F2 left of the area: columns 1-1 (2 spaces) accepted; columns 1-2 (1 space) refused', r(3, 1, { len: 1 }) === null && r(3, 1, { len: 2 }) !== null);
  check('a hidden F2 beside the area is accepted', r(3, 34, { usage: 'H' }) === null);
  check('an F2 with no position is accepted', G(base(3, 36), doc('CNTFLD(30)', { name: 'F2', len: 5, type: 'A', usage: 'B' })) === null);
  const constant = (pos) => doc('CNTFLD(30)', { name: undefined, len: undefined, type: undefined, usage: undefined, line: 3, pos: pos, fn: "'ABCD'" });
  check('the constant is parsed as a constant', constant(34).records[0].fields.some((f) => f.nameType === 'CONSTANT'));
  check('a constant right beside the area (column 34) is accepted (the rule says fields)', G(PLAIN, constant(34)) === null);
  check('an F2 whose length is 1 at 37 is fine; the spaces count from the data columns', r(3, 37, { len: 1 }) === null);
  // a second continued-entry field is judged by its whole rectangle
  const two = (line) => doc('CNTFLD(30)', { name: 'F2', len: 90, type: 'A', usage: 'I', line: line, pos: 4, fn: 'CNTFLD(30)' });
  check('two stacked continued-entry areas: second at line 6 (rows 6-8) is accepted', G(PLAIN, two(6)) === null);
  check('second at line 5 shares row 5 with the first (rows 3-5): refused', G(PLAIN, two(5)) !== null);
  check('second at line 4 overlaps: refused', G(PLAIN, two(4)) !== null);
  check('already-too-close pair is not re-reported when something unrelated changes', G(withF2(3, 35), doc('CNTFLD(30) COLOR(RED)', { line: 3, pos: 35 })) === null);
  check('moving F2 next to the area IS reported', G(withF2(3, 40), withF2(3, 35)) !== null);
  check('moving F2 away, or removing CNTFLD, is never blocked', G(withF2(3, 35), withF2(3, 40)) === null && G(withF2(3, 35), base(3, 35)) === null);
  check('shortening the field so fewer rows are used can release a neighbour (rows 3-4: line 5 is free)', G(withF2(5, 35, { len: 5 }), doc('CNTFLD(30)', { line: 5, pos: 35 }, { len: 60 })) === null);
  check('a record with no continued-entry field never triggers the rule', G(PLAIN, base(3, 5)) === null);
}

// ===========================================================================
console.log('\n=== the raw keyword editor (jsdom, commitEdit backstop) ===');
const SOURCE = build([
  dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
  dds({ rec: 1, name: 'CTL1', fn: 'CA03' }),
  dds({ name: 'TXTA', len: 40, type: 'A', usage: 'I', line: 3, pos: 4 }),
  dds({ name: 'NEAR', len: 5, type: 'A', usage: 'B', line: 4, pos: 35 }),
  dds({ name: 'TXTB', len: 40, type: 'A', usage: 'I', line: 10, pos: 4 }),
  dds({ name: 'FAR', len: 5, type: 'A', usage: 'B', line: 11, pos: 40 }),
  dds({ name: 'TXTC', len: 90, type: 'A', usage: 'I', line: 15, pos: 4 }),
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
  const d = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const sel = d.getElementById('recordSelect');
  sel.value = 'CTL1'; fire(sel);
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const pick = (name) => { const f = d.querySelector('#screenOutput .dspf-field[data-field="' + name + '"]'); if (f) fire(f, 'click'); return !!f; };
  const rawAdd = (field, kw, params) => {
    pick(field);
    const owner = Array.from(d.querySelectorAll('.kw-add')).map((e) => e.getAttribute('data-owner')).find((o) => /field/.test(o || ''));
    if (!owner) return false;
    d.getElementById(owner + '-new-kw-name').value = kw;
    d.getElementById(owner + '-new-kw-params').value = params;
    posted.length = 0; alerts.length = 0;
    fire(d.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
    return true;
  };
  const onCanvas = ['TXTA', 'NEAR', 'TXTB', 'FAR', 'TXTC'].map((n) => n + ':' + pick(n));
  check('the fields are on the canvas (' + onCanvas.join(' ') + ')', onCanvas.every((x) => /true$/.test(x)));
  check('the raw editor is reachable', rawAdd('TXTA', 'CNTFLD', '30'));
  check('raw-adding CNTFLD(30) to TXTA (rows 3-4), 1 space from NEAR on line 4, is refused: no edit, message names NEAR', lastText() === null && alerts.some((a) => /NEAR/.test(a) && /closer than 2 spaces/.test(a)));
  rawAdd('TXTC', 'CNTFLD', '81');
  check('raw-adding CNTFLD(81) is refused: no edit, message names the 80-column display', lastText() === null && alerts.some((a) => /80 columns of the display/.test(a)));
  rawAdd('TXTB', 'CNTFLD', '30');
  const t = lastText();
  check('control: CNTFLD(30) on TXTB (rows 10-11), with FAR 6 spaces away on line 11, is accepted', !!t && !alerts.length && DspfParser.parseDspf(t).records[0].fields.some((f) => f.name === 'TXTB' && f.keywords.some((k) => k.name === 'CNTFLD')));
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

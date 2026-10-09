/**
 * i200SflpagFieldSelectionAndIgnoredKeywords.test.js
 *
 * Task I-200 - the two SFLPAG / SFLSIZ rules I-146 left unchecked:
 *  (1) SFLDROP and SFLROLVAL are only "ignored" where SFLSIZ equals SFLPAG (their own sections), so
 *      nothing is refused - the panel says so, naming the display sizes where they have no effect;
 *  (2) with field selection "The value of SFLPAG must be greater than or equal to the number of
 *      display lines occupied by the subfile" record - refused, and only when an edit adds it.
 *
 * Run with: node src/test/i200SflpagFieldSelectionAndIgnoredKeywords.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, '').replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) put(9, o.ind);
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const k = (name, params, size) => ({
  name: name, parameters: params || '', raw: '', sourceLines: [],
  conditions: size ? [{ relation: 'AND', indicators: [], displaySizeCondition: { name: size, not: false }, sourceLines: [] }] : [],
});
const src = (...lines) => lines.join('\n') + '\n';
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.subfileFoldDropNewConflictReason(parse(a), parse(b));

console.log('=== 1. spec facts, against the reference ===');
check('the reference states the lower bound under field selection', has('The value of SFLPAG must be greater than or equal to the number of display lines occupied by the subfile.'));
check('the spec records it as a fact', KeywordSpec.fieldSelectionPageMinimum().measure === 'displayLinesOfSubfileRecord' && KeywordSpec.fieldSelectionPageMinimum().comparison === 'atLeast');
check('the accessor returns a copy', (() => { const m = KeywordSpec.fieldSelectionPageMinimum(); m.measure = 'x'; return KeywordSpec.fieldSelectionPageMinimum().measure === 'displayLinesOfSubfileRecord'; })());
check('the reference says SFLDROP and SFLROLVAL are ignored where size equals page, only for the sizes where they are equal',
  has('If subfile size equals subfile page, SFLDROP is ignored.') && has('these keywords are ignored only for display sizes for which subfile size equals subfile page') &&
  KeywordSpec.sizeEqualsPageIgnored().join() === 'SFLDROP,SFLROLVAL');

console.log('\n=== 2. the ignored-keyword note ===');
const ctl = (...kws) => parse(src(dds({ rec: 1, name: 'SFLR', fn: 'SFL' }), dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }), ...kws.map((k) => dds({ fn: k })))).records[1].keywords;
const note = (name, kws) => DspfWriter.sizeEqualsPageIgnoredNote(name, kws);
check('equal sizes: SFLDROP is reported as having no effect', /^SFLDROP is ignored where SFLSIZ equals SFLPAG - here every display size that has no SFLSIZ \/ SFLPAG of its own \(both 10\) - so it has no effect there \(per the DDS Reference\)\.$/.test(note('SFLDROP', ctl('SFLSIZ(10)', 'SFLPAG(10)')) || ''));
check('...and so is SFLROLVAL', /^SFLROLVAL is ignored where SFLSIZ equals SFLPAG/.test(note('SFLROLVAL', ctl('SFLSIZ(10)', 'SFLPAG(10)')) || ''));
check('different values: no note', note('SFLDROP', ctl('SFLSIZ(20)', 'SFLPAG(10)')) === null);
check('SFLSIZ as a program-to-system field never counts as equal', note('SFLDROP', ctl('SFLSIZ(&CNT)', 'SFLPAG(10)')) === null);
check('SFLFOLD is not on this list (it is refused, not ignored)', note('SFLFOLD', ctl('SFLSIZ(10)', 'SFLPAG(10)')) === null);
check('a keyword that is not in the ignored list: no note', note('SFLEND', ctl('SFLSIZ(10)', 'SFLPAG(10)')) === null);
const multi = [k('SFLSIZ', '20'), k('SFLPAG', '10'), k('SFLSIZ', '10', '*DS4'), k('SFLPAG', '10', '*DS4')];
check('multi-size: equal on one size only names that size, so the file stays legitimate', (() => {
  const n = note('SFLDROP', multi) || '';
  return /display size \*DS4 \(both 10\)/.test(n) && !/every display size/.test(n);
})());

console.log('\n=== 3. SFLPAG at least the lines the record occupies (field selection) ===');
const SUB = (pairs) => [dds({ rec: 1, name: 'SFLR', fn: 'SFL' })].concat(pairs.map(([ind, line, usage], i) => dds({ ind, name: 'F' + (i + 1), len: 5, type: 'A', usage: usage || 'O', line, pos: 2 })));
const CTL = (...kws) => [dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(5)' })].concat(kws.map((k) => dds({ fn: k })));
const file = (fields, ...kws) => src(...SUB(fields), ...CTL(...kws));
const FS3 = [['30', 1], ['', 2], ['', 3]];
check('the line span reads highest minus lowest plus one over visible fields', DspfWriter.subfileRecordLineSpan(parse(file([['30', 2], ['', 4]], 'SFLPAG(5)')).records[0]).span === 3);
check('hidden (H) fields and fields without a line are not counted', DspfWriter.subfileRecordLineSpan(parse(file([['30', 2], ['', 3], ['', undefined, 'H'], ['', 9, 'H']], 'SFLPAG(5)')).records[0]).span === 2);
check('constants count', (() => {
  const t = src(...SUB([['30', 1]]), dds({ line: 4, pos: 2, fn: "'TEXT'" }), ...CTL('SFLPAG(5)'));
  return DspfWriter.subfileRecordLineSpan(parse(t).records[0]).span === 4;
})());
check('SFLPAG below the occupied lines is refused when an edit sets it (3 lines, SFLPAG 2)', /SFLPAG\(2\) on subfile-control record format CTL is less than the 3 display lines subfile record SFLR occupies \(lines 1 to 3\): with field selection \(field F1 has an option indicator\) SFLPAG must be at least that many \(per the DDS Reference\)\./.test(guard(file(FS3, 'SFLPAG(5)'), file(FS3, 'SFLPAG(2)')) || ''));
check('SFLPAG equal to the occupied lines is accepted', guard(file(FS3, 'SFLPAG(5)'), file(FS3, 'SFLPAG(3)')) === null);
check('SFLPAG above the occupied lines is accepted', guard(file(FS3, 'SFLPAG(5)'), file(FS3, 'SFLPAG(9)')) === null);
check('without field selection (no option indicator on a field) nothing is checked', guard(file([['', 1], ['', 2], ['', 3]], 'SFLPAG(5)'), file([['', 1], ['', 2], ['', 3]], 'SFLPAG(2)')) === null);
check('an indicator on a field keyword (DSPATR) is not field selection', (() => {
  const mk = (pag) => src(...SUB([['', 1], ['', 2], ['', 3]]).concat([dds({ ind: '30', fn: 'DSPATR(RI)' })]), ...CTL('SFLPAG(' + pag + ')'));
  return guard(mk(5), mk(2)) === null;
})());
check('a record that grows past SFLPAG is refused (a fourth line added under SFLPAG 3)', /4 display lines/.test(guard(file(FS3, 'SFLPAG(3)'), file(FS3.concat([['', 4]]), 'SFLPAG(3)')) || ''));
check('turning field selection on while SFLPAG is too small is refused', /SFLPAG\(2\)/.test(guard(file([['', 1], ['', 2], ['', 3]], 'SFLPAG(2)'), file(FS3, 'SFLPAG(2)')) || ''));
check('a file already too small (hand-written) does not block an unrelated edit', guard(file(FS3, 'SFLPAG(2)'), file(FS3, 'SFLPAG(2)', 'PUTOVR')) === null);
check('...and fixing it is accepted', guard(file(FS3, 'SFLPAG(2)'), file(FS3, 'SFLPAG(3)')) === null);
check('removing the indicator is accepted', guard(file(FS3, 'SFLPAG(2)'), file([['', 1], ['', 2], ['', 3]], 'SFLPAG(2)')) === null);
check('each display size is checked: SFLPAG(5) overall, SFLPAG(2) for *DS4 is refused for that size', (() => {
  const before = parse(file(FS3, 'SFLPAG(5)'));
  const after = parse(file(FS3, 'SFLPAG(5)'));
  after.records[1].keywords.push(k('SFLPAG', '2', '*DS4'));
  return /SFLPAG\(2\) for display size \*DS4/.test(DspfWriter.subfileFoldDropNewConflictReason(before, after) || '');
})());
check('a non-numeric SFLPAG is left alone (fail open)', guard(file(FS3, 'SFLPAG(5)'), file(FS3, 'SFLPAG(X)')) === null);
check('a missing SFLPAG is left alone (I-147 notes it)', guard(file(FS3, 'SFLPAG(5)'), file(FS3)) === null);

console.log('\n=== 4. the panel notes (jsdom) ===');
const SOURCE = src(
  ...SUB([['', 1], ['', 2]]),
  dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(10)' }), dds({ fn: 'SFLPAG(10)' }), dds({ ind: '30', fn: 'SFLDROP(CA03)' }),
  dds({ rec: 1, name: 'SFLR2', fn: 'SFL' }), dds({ ind: '30', name: 'G1', len: 5, type: 'A', usage: 'O', line: 1, pos: 2 }), dds({ name: 'G2', len: 5, type: 'A', usage: 'O', line: 2, pos: 2 }), dds({ name: 'G3', len: 5, type: 'A', usage: 'O', line: 3, pos: 2 }),
  dds({ rec: 1, name: 'CTL2', fn: 'SFLCTL(SFLR2)' }), dds({ fn: 'SFLSIZ(10)' })
);
const html = webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'I200.DSPF');
check('the field panel is given the control record keywords', html.indexOf("subfileFieldKeywordsHtml(field.keywords, 'field-' + field.sourceLine, found.record.keywords)") >= 0);
check('the SFLROLVAL row shows the note when the control record has equal sizes', (() => {
  const rolval = [{ name: 'SFLROLVAL', parameters: '', conditions: [] }];
  const WebviewClientHelpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
  const withNote = WebviewClientHelpers.subfileFieldKeywordsHtml(rolval, 'field-9', ctl('SFLSIZ(10)', 'SFLPAG(10)'));
  const differs = WebviewClientHelpers.subfileFieldKeywordsHtml(rolval, 'field-9', ctl('SFLSIZ(20)', 'SFLPAG(10)'));
  const absent = WebviewClientHelpers.subfileFieldKeywordsHtml([], 'field-9', ctl('SFLSIZ(10)', 'SFLPAG(10)'));
  return /id="field-9-sflrolval-ignored"[^>]*>SFLROLVAL is ignored where SFLSIZ equals SFLPAG/.test(withNote.replace(/\\"/g, '"')) && withNote.indexOf('sflrolval-ignored') > 0 && differs.indexOf('sflrolval-ignored') < 0 && absent.indexOf('sflrolval-ignored') < 0;
})());
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});
setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const selectRecord = (n) => { const s = doc.getElementById('recordSelect'); s.value = n; fire(s); };
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  function withAlert(fn) {
    const orig = dom.window.alert; let msg = null;
    dom.window.alert = (m) => { msg = m; }; fn(); dom.window.alert = orig; return msg;
  }
  function rawAdd(record, name, params) {
    const owner = 'record-' + record;
    doc.getElementById(owner + '-new-kw-name').value = name;
    const p = doc.getElementById(owner + '-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click'));
  }
  selectRecord('CTL');
  const n = doc.querySelector('[id$="-sfldrop-ignored"]');
  check('the SFLCTL panel shows the SFLDROP note under the row when SFLSIZ equals SFLPAG', !!n && /^SFLDROP is ignored where SFLSIZ equals SFLPAG/.test(n.textContent));
  selectRecord('CTL2');
  const m1 = rawAdd('CTL2', 'SFLPAG', '2');
  check('raw-adding SFLPAG(2) to a field-selection subfile whose record occupies 3 lines is refused, nothing written', /SFLPAG\(2\) on subfile-control record format CTL2 is less than the 3 display lines subfile record SFLR2 occupies/.test(m1 || '') && lastText() === null);
  const m2 = rawAdd('CTL2', 'SFLPAG', '3');
  check('raw-adding SFLPAG(3) goes through', m2 === null && /SFLPAG\(3\)/.test(lastText() || ''));
  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

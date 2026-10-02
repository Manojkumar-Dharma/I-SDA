/**
 * i122NoTestKeywordsBatch1.test.js
 *
 * Task I-122, batch 1 - the keywords that had NO test at all (RMVWDW,
 * USRRSTDSP, SFLDLT, LOWER) or only a passing mention (SFLINZ, SFLCSRRRN),
 * covered across the matrix dimensions the task defines, each cell traced
 * to the keyword's own DDS Reference section:
 *
 *   RMVWDW / USRRSTDSP  record-level on a WINDOW record, no parameters,
 *                       option indicators valid.
 *   SFLINZ / SFLDLT     record-level on the subfile-control record, no
 *                       parameters, option indicators valid (SFLDLT:
 *                       required by IBM; SFLINZ: display size condition
 *                       names not valid).
 *   SFLCSRRRN           record-level on the subfile-control record, one
 *                       parameter naming a hidden field.
 *   LOWER               field-level, "equivalent to CHECK(LC)"; no UI of
 *                       its own (CHECK is preferred), must survive edits.
 *
 *  L1/L2 writer: parse of every form, flag get/set round trip, other
 *        keywords untouched, conditions carried.
 *  L3    display: which tab / row exists on which record type, and what
 *        a saved keyword looks like when the panel is reopened.
 *  L4    commit paths: checkbox, Conditioning, raw keyword editor, and an
 *        unrelated edit - each leaves the keyword (and its indicator) intact.
 *
 * Gaps found while writing this (an unprefixed / empty SFLCSRRRN field,
 * RMVWDW / USRRSTDSP with no WINDOW, SFLDLT with no option indicator,
 * these keywords on the wrong record type via the raw editor) are NOT
 * asserted as correct here; they are logged as findings in keywordFixes.md.
 *
 * Run with: node src/test/i122NoTestKeywordsBatch1.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// Fixed-column DDS line builder (cols: 6 A, 8 N, 9-10 indicator, 17 R, 19-28
// name, 30-34 length, 35 type, 38 usage, 39-41 line, 42-44 position, 45+
// keywords) - hand-typed lines drift out of column and parse as a length-0 field.
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) { put(8, o.neg ? 'N' : ' '); put(9, o.ind); }
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

const SOURCE = [
  dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
  dds({ rec: 1, name: 'PLAIN' }),
  dds({ line: 1, pos: 2, fn: "'PLAIN'" }),
  dds({ rec: 1, name: 'WIN1', fn: 'WINDOW(6 15 9 30)' }),
  dds({ ind: '25', fn: 'USRRSTDSP' }),
  dds({ name: 'F1', len: 10, type: 'A', usage: 'B', line: 2, pos: 2 }),
  dds({ rec: 1, name: 'WIN2', fn: 'WINDOW(2 2 5 20)' }),
  dds({ name: 'W2', len: 10, type: 'A', usage: 'B', line: 2, pos: 2 }),
  dds({ rec: 1, name: 'SFLR', fn: 'SFL' }),
  dds({ name: 'S1', len: 10, type: 'A', usage: 'O', line: 4, pos: 2 }),
  dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ ind: '30', fn: 'SFLINZ' }),
  dds({ ind: '31', neg: 1, fn: 'SFLDLT' }),
  dds({ fn: 'SFLCSRRRN(&RELRCD)' }),
  dds({ name: 'RELRCD', len: 5, type: 'S', dec: 0, usage: 'H' }),
  dds({ name: 'F2', len: 10, type: 'A', usage: 'B', line: 1, pos: 2 }),
  dds({ fn: 'LOWER' }),
].join('\n') + '\n';

const model = DspfParser.parseDspf(SOURCE);
const rec = (name) => model.records.find((r) => r.name === name);
const kwOf = (r, name) => r.keywords.find((k) => k.name === name);
const names = (r) => r.keywords.map((k) => k.name);

console.log('=== L1/L2 writer: parse and flag round trip ===');
check('USRRSTDSP parsed on WIN1 with indicator 25', !!kwOf(rec('WIN1'), 'USRRSTDSP') && kwOf(rec('WIN1'), 'USRRSTDSP').conditions[0].indicators[0].number === '25');
check('USRRSTDSP has no parameters', kwOf(rec('WIN1'), 'USRRSTDSP').parameters.trim() === '');
check('RMVWDW absent on WIN1 and WIN2', !kwOf(rec('WIN1'), 'RMVWDW') && !kwOf(rec('WIN2'), 'RMVWDW'));
check('SFLINZ parsed with indicator 30', kwOf(rec('CTL'), 'SFLINZ').conditions[0].indicators[0].number === '30');
check('SFLDLT parsed with N31 (negated)', (() => { const ind = kwOf(rec('CTL'), 'SFLDLT').conditions[0].indicators[0]; return ind.number === '31' && ind.not === true; })());
check('SFLCSRRRN parsed with its field parameter', kwOf(rec('CTL'), 'SFLCSRRRN').parameters.trim() === '&RELRCD');
check('LOWER parsed on field F2 with no parameters', (() => { const k = rec('CTL').fields.find((f) => f.name === 'F2').keywords.find((x) => x.name === 'LOWER'); return !!k && k.parameters === ''; })());
{
  const g = (kws, n) => DspfWriter.getFileFlagKeyword(kws, n);
  check('getFileFlagKeyword reads each present flag', g(rec('WIN1').keywords, 'USRRSTDSP').present && g(rec('CTL').keywords, 'SFLINZ').present && g(rec('CTL').keywords, 'SFLDLT').present && g(rec('CTL').keywords, 'SFLCSRRRN').present);
  check('...and reports the absent ones as not present', !g(rec('WIN1').keywords, 'RMVWDW').present && !g(rec('PLAIN').keywords, 'SFLINZ').present);
  check('SFLCSRRRN\'s parameter is read back', g(rec('CTL').keywords, 'SFLCSRRRN').parameters.trim() === '&RELRCD');
  check('conditions are carried by the read', g(rec('CTL').keywords, 'SFLDLT').conditions.length === 1);

  const added = DspfWriter.setFileFlagKeyword(rec('WIN2').keywords, 'RMVWDW', true, '', undefined, undefined);
  check('setFileFlagKeyword adds RMVWDW as a bare keyword', names({ keywords: added }).join() === 'WINDOW,RMVWDW' && added[1].parameters.trim() === '');
  const removed = DspfWriter.setFileFlagKeyword(rec('WIN1').keywords, 'USRRSTDSP', false, '', undefined, undefined);
  check('setFileFlagKeyword removes USRRSTDSP and leaves WINDOW alone', names({ keywords: removed }).join() === 'WINDOW' && removed[0].parameters === rec('WIN1').keywords[0].parameters);
  const keep = DspfWriter.setFileFlagKeyword(rec('CTL').keywords, 'SFLINZ', true, '', undefined, undefined);
  check('turning an already-present flag on again is idempotent (one SFLINZ, indicator kept)', keep.filter((k) => k.name === 'SFLINZ').length === 1 && keep.find((k) => k.name === 'SFLINZ').conditions.length === 1);
  const inz = DspfWriter.setFileFlagKeyword(rec('WIN2').keywords, 'SFLINZ', true, '', undefined, undefined);
  check('setFileFlagKeyword adds SFLINZ as a bare keyword (writer level, independent of the panel)', inz.some((k) => k.name === 'SFLINZ' && k.parameters.trim() === ''));
  const noInz = DspfWriter.setFileFlagKeyword(rec('CTL').keywords, 'SFLINZ', false, '', undefined, undefined);
  check('setFileFlagKeyword removes SFLINZ together with its condition', !noInz.some((k) => k.name === 'SFLINZ') && noInz.length === rec('CTL').keywords.length - 1);
  const others = DspfWriter.setFileFlagKeyword(rec('CTL').keywords, 'SFLDLT', false, '', undefined, undefined);
  check('removing SFLDLT leaves SFLSIZ, SFLPAG, SFLINZ, SFLCSRRRN untouched', names({ keywords: others }).join() === 'SFLCTL,SFLSIZ,SFLPAG,SFLINZ,SFLCSRRRN');
  const withP = DspfWriter.setFileFlagKeyword(rec('CTL').keywords, 'SFLCSRRRN', true, '&CURREC', undefined, undefined);
  check('SFLCSRRRN\'s parameter is replaced in place, other keywords untouched', withP.find((k) => k.name === 'SFLCSRRRN').parameters.trim() === '&CURREC' && withP.length === rec('CTL').keywords.length);
  const cond = DspfWriter.setFileFlagKeyword(rec('WIN2').keywords, 'USRRSTDSP', true, '', undefined, [{ indicators: [{ number: '40', negated: false }] }]);
  check('a condition passed to setFileFlagKeyword is kept on the new keyword', cond.find((k) => k.name === 'USRRSTDSP').conditions[0].indicators[0].number === '40');
}

console.log('\n=== L2 LOWER survives edits ===');
{
  const f2 = rec('CTL').fields.find((f) => f.name === 'F2');
  check('F2 parses as a real field (length 10, type A, usage B) so the move below is meaningful', f2.length === 10 && f2.dataType === 'A' && f2.usage === 'B' && f2.location.line === 1 && f2.location.column === 2);
  const lines = SOURCE.split('\n');
  const text = DspfWriter.applyFieldUpdate(f2, lines, { line: 3, column: 5 }).join('\n');
  const again = DspfParser.parseDspf(text).records.find((r) => r.name === 'CTL').fields.find((x) => x.name === 'F2');
  check('after moving F2 it is at line 3 column 5 and still carries LOWER', again.location.line === 3 && again.location.column === 5 && again.keywords.some((k) => k.name === 'LOWER'));
  check('...and its length, type and usage were not disturbed', again.length === 10 && again.dataType === 'A' && again.usage === 'B');
  const f1 = rec('WIN1').fields[0];
  const other = DspfWriter.applyFieldUpdate(f1, lines, { line: 5, column: 7 }).join('\n');
  check('editing a different field leaves the LOWER line byte-identical', other.split('\n').filter((l) => /LOWER/.test(l)).join() === lines.filter((l) => /LOWER/.test(l)).join());
  check('LOWER has no parameters and no conditions after a round trip through the parser', (() => { const k = again.keywords.find((x) => x.name === 'LOWER'); return k.parameters === '' && k.conditions.length === 0; })());
}

console.log('\n=== L3/L4 the panels (jsdom) ===');
const html = webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF');
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
  const sel = doc.getElementById('recordSelect');
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const selectRecord = (name) => { sel.value = name; fire(sel); };
  const tab = (label) => { const b = Array.from(doc.querySelectorAll('.props-tab')).find((x) => x.textContent.trim() === label); if (b) fire(b, 'click'); return !!b; };
  const tabs = () => Array.from(doc.querySelectorAll('.props-tab')).map((b) => b.textContent.trim());
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const recordFrom = (text, name) => (text ? DspfParser.parseDspf(text).records.find((r) => r.name === name) : null);
  const toggle = (id, on, params) => {
    const el = doc.getElementById(id + '-on');
    posted.length = 0;
    el.checked = on;
    if (params !== undefined) doc.getElementById(id + '-params').value = params;
    fire(el);
    return lastText();
  };
  function raw(owner, name, params) {
    const n = doc.getElementById(owner + '-new-kw-name');
    const p = doc.getElementById(owner + '-new-kw-params');
    const b = doc.querySelector('.kw-add[data-owner="' + owner + '"]');
    n.value = name; p.value = params || '';
    posted.length = 0;
    fire(b, 'click');
    return lastText();
  }

  console.log('  -- which record types get the rows');
  selectRecord('PLAIN');
  check('a plain record has no Window tab and no RMVWDW / USRRSTDSP row', !tabs().includes('Window') && !doc.getElementById('rw-PLAIN-rmvwdw-on') && !doc.getElementById('rw-PLAIN-usrrstdsp-on'));
  check('a plain record has no SFLCTL tab and no subfile-control rows', !tabs().includes('SFLCTL') && !doc.getElementById('sflctl-PLAIN-sflinz-on'));
  selectRecord('SFLR');
  check('a plain SFL record has the SFL tab but no SFLINZ / SFLDLT / SFLCSRRRN rows', tabs().includes('SFL') && !doc.getElementById('sflctl-SFLR-sflinz-on') && !doc.getElementById('sfl-SFLR-sflinz-on') && !doc.getElementById('sfl-SFLR-sfldlt-on') && !doc.getElementById('sfl-SFLR-sflcsrrrn-on'));
  selectRecord('WIN2');
  tab('Window');
  check('a window record has the Window tab with both rows, neither checked on WIN2', tabs().includes('Window') && doc.getElementById('rw-WIN2-rmvwdw-on') && doc.getElementById('rw-WIN2-usrrstdsp-on') && !doc.getElementById('rw-WIN2-rmvwdw-on').checked && !doc.getElementById('rw-WIN2-usrrstdsp-on').checked);
  selectRecord('CTL');
  tab('SFLCTL');
  check('the subfile-control record has the SFLCTL tab with all three rows', tabs().includes('SFLCTL') && ['sflinz', 'sfldlt', 'sflcsrrrn'].every((k) => !!doc.getElementById('sflctl-CTL-' + k + '-on')));

  console.log('  -- saved keywords are displayed');
  check('SFLINZ, SFLDLT and SFLCSRRRN show checked', ['sflinz', 'sfldlt', 'sflcsrrrn'].every((k) => doc.getElementById('sflctl-CTL-' + k + '-on').checked));
  check('SFLCSRRRN\'s saved parameter fills its text box', doc.getElementById('sflctl-CTL-sflcsrrrn-params').value === '&RELRCD');
  check('SFLINZ and SFLDLT show their Conditioning count (1)', ['sflinz', 'sfldlt'].every((k) => /Conditioning\s*\(1\)/.test(doc.querySelector('.kw-cond-toggle[data-flag-id="sflctl-CTL-' + k + '"]').textContent)));
  selectRecord('WIN1');
  tab('Window');
  check('USRRSTDSP shows checked on WIN1, RMVWDW unchecked', doc.getElementById('rw-WIN1-usrrstdsp-on').checked && !doc.getElementById('rw-WIN1-rmvwdw-on').checked);
  check('USRRSTDSP shows its Conditioning count (1)', /Conditioning\s*\(1\)/.test(doc.querySelector('.kw-cond-toggle[data-flag-id="rw-WIN1-usrrstdsp"]').textContent));
  check('the two window rows are labelled with their DDS names', /\(RMVWDW\)/.test(doc.body.innerHTML) && /\(USRRSTDSP\)/.test(doc.body.innerHTML));

  console.log('  -- checkbox commits');
  {
    selectRecord('WIN2'); tab('Window');
    const t = toggle('rw-WIN2-rmvwdw', true);
    const r = recordFrom(t, 'WIN2');
    check('RMVWDW on: written as a bare keyword after WINDOW, WINDOW and field untouched', !!r && names(r).join() === 'WINDOW,RMVWDW' && kwOf(r, 'RMVWDW').parameters.trim() === '' && kwOf(r, 'WINDOW').parameters.trim() === '2 2 5 20' && r.fields.length === 1);
    check('the DDS line is the keyword alone in the keyword area', t.split('\n').includes(dds({ fn: 'RMVWDW' })));
    const t2 = toggle('rw-WIN2-usrrstdsp', true);
    const r2 = recordFrom(t2, 'WIN2');
    check('USRRSTDSP on is independent: both keywords now present', !!r2 && names(r2).join() === 'WINDOW,RMVWDW,USRRSTDSP');
    const t3 = toggle('rw-WIN2-rmvwdw', false);
    const r3 = recordFrom(t3, 'WIN2');
    check('RMVWDW off removes only RMVWDW', !!r3 && names(r3).join() === 'WINDOW,USRRSTDSP');
    const t4 = toggle('rw-WIN2-usrrstdsp', false);
    check('USRRSTDSP off returns WIN2 to its original DDS text', t4 === SOURCE);
    check('other records were never touched by these edits', recordFrom(t2, 'WIN1').keywords.length === rec('WIN1').keywords.length && recordFrom(t2, 'CTL').keywords.length === rec('CTL').keywords.length);
  }
  {
    selectRecord('CTL'); tab('SFLCTL');
    const t = toggle('sflctl-CTL-sflinz', false);
    const r = recordFrom(t, 'CTL');
    check('SFLINZ off removes it together with its indicator line; the rest stays', !!r && !names(r).includes('SFLINZ') && names(r).join() === 'SFLCTL,SFLSIZ,SFLPAG,SFLDLT,SFLCSRRRN' && !/\b30\b.*SFLINZ/.test(t));
    const t2 = toggle('sflctl-CTL-sflinz', true);
    const r2 = recordFrom(t2, 'CTL');
    check('SFLINZ on again is a bare unconditioned keyword', !!r2 && kwOf(r2, 'SFLINZ').conditions.length === 0 && kwOf(r2, 'SFLINZ').parameters.trim() === '');
    const t3 = toggle('sflctl-CTL-sfldlt', false);
    check('SFLDLT off removes SFLDLT and its N31 condition', !!recordFrom(t3, 'CTL') && !names(recordFrom(t3, 'CTL')).includes('SFLDLT') && !/N31/.test(t3));
    const t4 = toggle('sflctl-CTL-sflcsrrrn', true, '&CURREC');
    check('SFLCSRRRN with a new parameter is rewritten with exactly that text', kwOf(recordFrom(t4, 'CTL'), 'SFLCSRRRN').parameters.trim() === '&CURREC' && /SFLCSRRRN\(&CURREC\)/.test(t4));
    const t5 = toggle('sflctl-CTL-sflcsrrrn', false);
    check('SFLCSRRRN off removes it; the hidden RELRCD field is NOT removed with it', !names(recordFrom(t5, 'CTL')).includes('SFLCSRRRN') && recordFrom(t5, 'CTL').fields.some((f) => f.name === 'RELRCD'));
    check('SFLSIZ / SFLPAG survive every flag change on the panel', ['SFLSIZ', 'SFLPAG'].every((k) => names(recordFrom(t5, 'CTL')).includes(k)));
  }

  console.log('  -- Conditioning (option indicators)');
  {
    // Rebuild a fresh state: WIN2, no keywords.
    selectRecord('WIN2'); tab('Window');
    toggle('rw-WIN2-rmvwdw', true);
    selectRecord('WIN2'); tab('Window');
    fire(doc.querySelector('.kw-cond-toggle[data-flag-id="rw-WIN2-rmvwdw"]'), 'click');
    fire(doc.querySelector('.cond-add-group[data-prefix="rw-WIN2-rmvwdw-cond"]'), 'click');
    doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = '01';
    posted.length = 0;
    fire(doc.querySelector('.cond-ind-add[data-prefix="rw-WIN2-rmvwdw-cond"][data-group="pending"]'), 'click');
    const t = lastText();
    check('RMVWDW conditioned on indicator 01 (IBM\'s own example)', (t || '').split('\n').includes(dds({ ind: '01', fn: 'RMVWDW' })) && kwOf(recordFrom(t, 'WIN2'), 'RMVWDW').conditions[0].indicators[0].number === '01');
    check('the condition did not leak onto WINDOW or the field', recordFrom(t, 'WIN2').keywords.find((k) => k.name === 'WINDOW').conditions.length === 0);
  }

  console.log('  -- raw keyword editor');
  {
    selectRecord('CTL');
    const t = raw('record-CTL', 'SFLINZ');
    const r = recordFrom(t, 'CTL');
    check('raw-adding SFLINZ on the subfile-control record produces the same keyword as the checkbox', !!r && kwOf(r, 'SFLINZ') && kwOf(r, 'SFLINZ').parameters.trim() === '');
    selectRecord('WIN2');
    const t2 = raw('record-WIN2', 'USRRSTDSP');
    check('raw-adding USRRSTDSP on a window record is accepted', !!recordFrom(t2, 'WIN2') && !!kwOf(recordFrom(t2, 'WIN2'), 'USRRSTDSP'));
    tab('Window');
    check('...and the Window panel then shows it checked (raw and checkbox agree)', doc.getElementById('rw-WIN2-usrrstdsp-on').checked);
  }

  console.log('  -- LOWER through the UI');
  {
    selectRecord('CTL');
    const t = raw('record-CTL', 'CSRLOC', 'F2 F2');
    check('adding an unrelated record keyword leaves the field\'s LOWER line byte-identical', !!t && t.split('\n').filter((l) => /LOWER/.test(l)).join() === SOURCE.split('\n').filter((l) => /LOWER/.test(l)).join());
    check('no UI row claims a LOWER keyword (CHECK is the preferred form)', !/\(LOWER\)/.test(doc.body.innerHTML));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

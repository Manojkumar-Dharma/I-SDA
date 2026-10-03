/**
 * i141SubfileControlKeywords.test.js
 *
 * Task I-141 - found by the I-122 batch 1 tests.
 *  (1) SFLDLT: "Option indicators are required for this keyword; display size
 *      condition names are not valid." (DDS Reference, SFLDLT)
 *  (2) SFLDLT / SFLINZ / SFLCSRRRN are record-level keywords "on the
 *      subfile-control record format" (a record carrying SFLCTL); the raw
 *      keyword editor accepted them on a plain record.
 *
 * Decisions: (2) is refused at the commit choke point in both directions
 * (adding the keyword to a record with no SFLCTL; removing SFLCTL from a record
 * that still has one). (1) a display size name on SFLDLT is refused; a bare
 * SFLDLT is NOT refused (the checkbox must be switchable on before its
 * Conditioning editor is reachable) - the SFLCTL panel shows a note instead.
 *
 * Run with: node src/test/i141SubfileControlKeywords.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

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

console.log('=== 1. spec facts ===');
// Task I-147 widened the list from the three I-141 named to the eight subfile-control keywords; Task I-157 added the five I-121d ones (13).
check('SFLCTL requires-list is the I-141 three, the five I-147 added, then the five I-157 added', KeywordSpec.sflctlDependentKeywords().join() === 'SFLCSRRRN,SFLDLT,SFLINZ,SFLPAG,SFLCLR,SFLDSP,SFLDSPCTL,SFLEND,SFLDROP,SFLENTER,SFLFOLD,SFLMODE,SFLRNA');
check('the accessor returns a copy', (() => { const a = KeywordSpec.sflctlDependentKeywords(); a.push('X'); return KeywordSpec.sflctlDependentKeywords().length === 13; })());
check('the citation names the subfile-control record format', /subfile-control record format/.test(KeywordSpec.RECORD_TYPES.SFLCTL.requiredForDdsReference));
check('SFLDLT has the option-indicator-required fact (no display size)', (() => { const f = KeywordSpec.optionIndicatorRequiredFact('sfldlt'); return !!f && f.required === true && f.noDisplaySize === true && /required for this keyword/.test(f.ddsReference); })());
check('no other keyword has it', ['SFLINZ', 'SFLCLR', 'SFLEND', 'RMVWDW', ''].every((k) => KeywordSpec.optionIndicatorRequiredFact(k) === null));
check('the I-140 window fact is untouched', KeywordSpec.windowDependentKeywords().join() === 'RMVWDW,USRRSTDSP');

console.log('\n=== 2. pure guards ===');
const kw = (name, parameters, conditions) => ({ name, parameters: parameters || '', conditions: conditions || [] });
const rec = (name, keywords) => ({ name, keywords, fields: [] });
const model = (...records) => ({ fileKeywords: [], records });
const dep = (a, b) => DspfWriter.sflctlDependencyNewConflictReason(a, b);
const plain = model(rec('R1', []));
['SFLDLT', 'SFLINZ', 'SFLCSRRRN'].forEach((k) => {
  check('adding ' + k + ' to a plain record is refused, with the DDS wording', new RegExp(k + ' cannot be specified on record format R1 without an SFLCTL keyword on the same record format \\(per the DDS Reference\\)').test(dep(plain, model(rec('R1', [kw(k)]))) || ''));
  check('adding ' + k + ' to a subfile-control record is accepted', dep(model(rec('C', [kw('SFLCTL', 'S')])), model(rec('C', [kw('SFLCTL', 'S'), kw(k)]))) === null);
});
check('adding ' + 'SFLDLT to a plain SFL record is refused too', dep(model(rec('S', [kw('SFL')])), model(rec('S', [kw('SFL'), kw('SFLDLT')]))) !== null);
const ctl = model(rec('C', [kw('SFLCTL', 'S'), kw('SFLINZ'), kw('SFLDLT')]));
check('removing SFLCTL while SFLINZ is present is refused', /SFL(DLT|INZ) cannot be specified on record format C without an SFLCTL/.test(dep(ctl, model(rec('C', [kw('SFLINZ'), kw('SFLDLT')]))) || ''));
check('removing SFLCTL together with the dependents is accepted', dep(ctl, model(rec('C', []))) === null);
check('removing SFLINZ itself is always accepted', dep(ctl, model(rec('C', [kw('SFLCTL', 'S'), kw('SFLDLT')]))) === null);
check('changing the SFLCTL parameter is accepted', dep(ctl, model(rec('C', [kw('SFLCTL', 'T'), kw('SFLINZ'), kw('SFLDLT')]))) === null);
const already = model(rec('R1', [kw('SFLINZ')]), rec('R2', []));
check('an already-invalid record does not block an unrelated edit on it', dep(already, model(rec('R1', [kw('SFLINZ'), kw('PUTOVR')]), rec('R2', []))) === null);
check('...nor an edit on another record', dep(already, model(rec('R1', [kw('SFLINZ')]), rec('R2', [kw('CA03')]))) === null);
check('...but a second, new violation is reported', /record format R2/.test(dep(already, model(rec('R1', [kw('SFLINZ')]), rec('R2', [kw('SFLDLT')]))) || ''));
check('fail-safe on odd models', [undefined, null, {}, { records: null }, model(rec('R', null))].every((m) => dep(null, m) === null));

const ds = (n) => [{ relation: 'AND', indicators: [], displaySizeCondition: { name: n, not: false } }];
const ind = (n) => [{ relation: 'AND', indicators: [{ number: n, not: false }], displaySizeCondition: null }];
const dsr = (a, b) => DspfWriter.optionIndicatorRequiredNewConflictReason(a, b);
const base = model(rec('C', [kw('SFLCTL', 'S'), kw('SFLDLT', '', ind('31'))]));
check('adding *DS3 to SFLDLT is refused, naming the DDS rule', /SFLDLT: display size condition names .* are not valid.*Option indicators are required/.test(dsr(base, model(rec('C', [kw('SFLCTL', 'S'), kw('SFLDLT', '', ind('31').concat(ds('*DS3')))]))) || ''));
check('adding a display size to a bare SFLDLT is refused', dsr(model(rec('C', [kw('SFLCTL', 'S'), kw('SFLDLT')])), model(rec('C', [kw('SFLCTL', 'S'), kw('SFLDLT', '', ds('*DS4'))]))) !== null);
check('adding another option indicator to SFLDLT is accepted', dsr(base, model(rec('C', [kw('SFLCTL', 'S'), kw('SFLDLT', '', ind('31').concat(ind('32')))]))) === null);
check('a bare SFLDLT is not refused by this guard', dsr(model(rec('C', [kw('SFLCTL', 'S')])), model(rec('C', [kw('SFLCTL', 'S'), kw('SFLDLT')]))) === null);
// Task I-147: SFLINZ's own "display size condition names are not valid" is now enforced by the same guard.
check('a display size on SFLINZ is refused too (I-147), with its own name and no "use an option indicator"', (() => { const r = dsr(model(rec('C', [kw('SFLCTL', 'S'), kw('SFLINZ')])), model(rec('C', [kw('SFLCTL', 'S'), kw('SFLINZ', '', ds('*DS3'))]))); return /^SFLINZ: display size condition names/.test(r || '') && !/use an option indicator/.test(r); })());
check('an SFLDLT that already carries a display size is not re-reported', dsr(model(rec('C', [kw('SFLDLT', '', ds('*DS3'))])), model(rec('C', [kw('SFLDLT', '', ds('*DS3')), kw('PUTOVR')]))) === null);
check('removing the display size is accepted', dsr(model(rec('C', [kw('SFLDLT', '', ds('*DS3'))])), model(rec('C', [kw('SFLDLT', '', ind('31'))]))) === null);
check('hasOptionIndicator: indicator yes, display size no, empty no', DspfWriter.hasOptionIndicator(ind('31')) && !DspfWriter.hasOptionIndicator(ds('*DS3')) && !DspfWriter.hasOptionIndicator([]) && !DspfWriter.hasOptionIndicator(undefined));

console.log('\n=== 3. the panel and the commit hook (jsdom) ===');
const SOURCE = [
  dds({ rec: 1, name: 'PLAIN' }),
  dds({ line: 1, pos: 2, fn: "'PLAIN'" }),
  dds({ rec: 1, name: 'SFLR', fn: 'SFL' }),
  dds({ name: 'S1', len: 10, type: 'A', usage: 'O', line: 4, pos: 2 }),
  dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ ind: '30', fn: 'SFLINZ' }),
  dds({ ind: '31', fn: 'SFLDLT' }),
  dds({ name: 'F2', len: 10, type: 'A', usage: 'B', line: 1, pos: 2 }),
  dds({ rec: 1, name: 'CTL2', fn: 'SFLCTL(SFLR)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ fn: 'SFLDLT' }),
  dds({ name: 'F3', len: 10, type: 'A', usage: 'B', line: 1, pos: 2 }),
].join('\n') + '\n';
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
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const selectRecord = (n) => { const s = doc.getElementById('recordSelect'); s.value = n; fire(s); };
  const tab = (label) => { const b = Array.from(doc.querySelectorAll('.props-tab')).find((x) => x.textContent.trim() === label); if (b) fire(b, 'click'); };
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const recordFrom = (text, name) => (text ? DspfParser.parseDspf(text).records.find((r) => r.name === name) : null);
  const names = (r) => r.keywords.map((k) => k.name);
  function withAlert(fn) {
    const orig = dom.window.alert;
    let msg = null;
    dom.window.alert = (m) => { msg = m; };
    fn();
    dom.window.alert = orig;
    return msg;
  }
  function rawAdd(record, name) {
    const owner = 'record-' + record;
    doc.getElementById(owner + '-new-kw-name').value = name;
    const p = doc.getElementById(owner + '-new-kw-params');
    if (p) p.value = '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click'));
  }

  console.log('  -- raw keyword editor on a plain record');
  selectRecord('PLAIN');
  ['SFLDLT', 'SFLINZ', 'SFLCSRRRN'].forEach((k) => {
    const msg = rawAdd('PLAIN', k);
    // SFLCSRRRN with no parameter is refused first by I-142's own parameter rule; the other two reach the SFLCTL rule.
    const expected = k === 'SFLCSRRRN' ? /SFLCSRRRN needs a parameter/ : new RegExp(k + ' cannot be specified on record format PLAIN without an SFLCTL');
    check('raw-adding ' + k + ' to a plain record is refused, nothing written', expected.test(msg || '') && lastText() === null);
  });

  console.log('  -- removing SFLCTL from a record that still has SFLINZ');
  selectRecord('CTL');
  tab('SFLCTL');
  {
    const el = doc.getElementById('sflctl-CTL-sflctl-on');
    posted.length = 0;
    el.checked = false;
    const msg = withAlert(() => fire(el));
    check('unchecking SFLCTL is refused with the DDS wording', /SFL(DLT|INZ) cannot be specified on record format CTL without an SFLCTL/.test(msg || '') && lastText() === null);
  }

  console.log('  -- the SFLDLT panel note');
  selectRecord('CTL');
  tab('SFLCTL');
  check('SFLDLT with an option indicator (CTL) shows no note', !doc.getElementById('sflctl-CTL-sfldlt-needs-indicator'));
  selectRecord('CTL2');
  tab('SFLCTL');
  check('a bare SFLDLT (CTL2) shows the note', !!doc.getElementById('sflctl-CTL2-sfldlt-needs-indicator') && /option indicator/.test(doc.getElementById('sflctl-CTL2-sfldlt-needs-indicator').textContent));
  {
    const el = doc.getElementById('sflctl-CTL2-sfldlt-on');
    posted.length = 0;
    el.checked = false;
    fire(el);
    check('turning the bare SFLDLT off still works (removed)', !!recordFrom(lastText(), 'CTL2') && !names(recordFrom(lastText(), 'CTL2')).includes('SFLDLT'));
    check('...and the note is gone', !doc.getElementById('sflctl-CTL2-sfldlt-needs-indicator'));
    const el2 = doc.getElementById('sflctl-CTL2-sfldlt-on');
    posted.length = 0;
    el2.checked = true;
    const msg = withAlert(() => fire(el2));
    check('switching SFLDLT back on (bare) is accepted, no alert', msg === null && !!recordFrom(lastText(), 'CTL2') && names(recordFrom(lastText(), 'CTL2')).includes('SFLDLT'));
    check('...and the note is back', !!doc.getElementById('sflctl-CTL2-sfldlt-needs-indicator'));
  }

  console.log('  -- accepted paths still work');
  {
    const el = doc.getElementById('sflctl-CTL2-sflinz-on');
    posted.length = 0;
    el.checked = true;
    const msg = withAlert(() => fire(el));
    check('turning SFLINZ on for a subfile-control record is accepted', msg === null && names(recordFrom(lastText(), 'CTL2')).includes('SFLINZ'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

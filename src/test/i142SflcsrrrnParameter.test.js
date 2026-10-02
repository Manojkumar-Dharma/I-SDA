/**
 * i142SflcsrrrnParameter.test.js
 *
 * Task I-142 - found by the I-122 batch 1 tests. IBM's form is
 * SFLCSRRRN(&relative-record): the parameter is required, is written with a
 * leading &, and names a hidden field of the subfile-control record defined as
 * a signed numeric (S) field of length 5, 0 decimals, usage H. Before this task
 * the SFLCTL panel wrote whatever was typed (empty -> bare SFLCSRRRN, RELRCD ->
 * SFLCSRRRN(RELRCD)) and nothing checked the field.
 *
 * Follow-up (user request): in the SFLCTL panel a bare field name gets its
 * leading & added, and a well-formed name that is not a field of the record
 * offers to create it as the hidden S / 5 / 0 / H field, then writes the
 * keyword. The writer and the raw keyword editor stay strict.
 *
 * Run with: node src/test/i142SflcsrrrnParameter.test.js
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

console.log('=== 1. spec fact ===');
const rule = KeywordSpec.sflcsrrrnFieldRule();
check('rule: S, length 5, 0 decimals, usage H, parameter required, & required', !!rule && rule.dataType === 'S' && rule.length === 5 && rule.decimals === 0 && rule.usage === 'H' && rule.parameterRequired && rule.ampersandRequired);
check('the citation mentions the signed numeric hidden field', /signed numeric \(S\) field of length 5/.test(rule.ddsReference));
check('the accessor returns a copy', (() => { const r = KeywordSpec.sflcsrrrnFieldRule(); r.length = 9; return KeywordSpec.sflcsrrrnFieldRule().length === 5; })());

console.log('\n=== 2. the pure rule ===');
const F = (name, o) => Object.assign({ name, dataType: 'S', length: 5, decimalPositions: 0, usage: 'H', nameType: 'NAMED' }, o || {});
const problem = (params, fields) => DspfWriter.sflcsrrrnParameterProblem(params, fields);
const good = [F('RELRCD'), F('OTHER', { dataType: 'A', length: 10, decimalPositions: null, usage: 'B' })];
check('&RELRCD on a valid hidden S 5,0 field is accepted', problem('&RELRCD', good) === null);
check('lower case name is accepted (&relrcd)', problem('&relrcd', good) === null);
check('empty parameter is refused: needs a parameter', /SFLCSRRRN needs a parameter/.test(problem('', good) || ''));
check('whitespace-only parameter is refused', /needs a parameter/.test(problem('   ', good) || ''));
check('RELRCD without the & is refused, and the message shows the & form', /must be one field name written with a leading & - SFLCSRRRN\(&RELRCD\)/.test(problem('RELRCD', good) || ''));
check('a bare & is refused', /leading &/.test(problem('&', good) || ''));
check('two tokens are refused', /one field name/.test(problem('&RELRCD &X', good) || ''));
check('a field that does not exist is refused, telling the user to define it first', /does not exist in this record format - define it first as a hidden field/.test(problem('&NOPE', good) || ''));
check('a constant with the same name does not count as the field', /does not exist/.test(problem('&RELRCD', [F('RELRCD', { nameType: 'CONSTANT' })]) || ''));
check('wrong data type (A) is refused', /its data type is A/.test(problem('&RELRCD', [F('RELRCD', { dataType: 'A' })]) || ''));
check('wrong length is refused', /its length is 4/.test(problem('&RELRCD', [F('RELRCD', { length: 4 })]) || ''));
check('wrong decimals is refused', /its decimal positions are 2/.test(problem('&RELRCD', [F('RELRCD', { decimalPositions: 2 })]) || ''));
check('wrong usage (B) is refused', /its usage is B/.test(problem('&RELRCD', [F('RELRCD', { usage: 'B' })]) || ''));
check('blank usage is reported as blank (output)', /its usage is blank \(output\)/.test(problem('&RELRCD', [F('RELRCD', { usage: '' })]) || ''));
check('several issues are listed together', (() => { const m = problem('&RELRCD', [F('RELRCD', { dataType: 'P', length: 9, usage: 'O' })]) || ''; return /data type is P/.test(m) && /length is 9/.test(m) && /usage is O/.test(m); })());
check('a referenced field (REFFLD) skips the type / length checks but still needs usage H', problem('&RELRCD', [F('RELRCD', { isReference: true, dataType: '', length: null, decimalPositions: null })]) === null && /usage/.test(problem('&RELRCD', [F('RELRCD', { isReference: true, usage: 'B' })]) || ''));
check('fail-open on the field checks when the field list is unavailable (form still checked)', problem('&RELRCD', undefined) === null && /needs a parameter/.test(problem('', undefined) || '') && /leading &/.test(problem('RELRCD', undefined) || ''));

console.log('\n=== 3. diff semantics ===');
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const nc = (o, n, f) => DspfWriter.sflcsrrrnNewConflictReason(o, n, f);
check('adding a valid SFLCSRRRN is accepted', nc([kw('SFLCTL', 'S')], [kw('SFLCTL', 'S'), kw('SFLCSRRRN', '&RELRCD')], good) === null);
check('adding a bare SFLCSRRRN is refused', /needs a parameter/.test(nc([kw('SFLCTL', 'S')], [kw('SFLCTL', 'S'), kw('SFLCSRRRN')], good) || ''));
check('changing to a bad name is refused', /does not exist/.test(nc([kw('SFLCSRRRN', '&RELRCD')], [kw('SFLCSRRRN', '&NOPE')], good) || ''));
check('changing to another valid field is accepted', nc([kw('SFLCSRRRN', '&RELRCD')], [kw('SFLCSRRRN', '&CURREC')], good.concat([F('CURREC')])) === null);
check('an unchanged hand-written bad parameter is not re-reported', nc([kw('SFLCSRRRN', 'RELRCD')], [kw('SFLCSRRRN', 'RELRCD'), kw('PUTOVR')], good) === null);
check('...case-insensitively', nc([kw('SFLCSRRRN', '&relrcd')], [kw('SFLCSRRRN', '&RELRCD')], [F('X')]) === null);
check('removing SFLCSRRRN is always accepted', nc([kw('SFLCSRRRN', 'RELRCD')], [], good) === null);
check('records with no SFLCSRRRN are never reported', nc([], [kw('SFLINZ')], good) === null);
check('raw add guard: only SFLCSRRRN is checked', DspfWriter.sflcsrrrnAddReason('SFLINZ', '', good) === null && DspfWriter.sflcsrrrnAddReason('sflcsrrrn', 'RELRCD', good) !== null && DspfWriter.sflcsrrrnAddReason('SFLCSRRRN', '&RELRCD', good) === null);

console.log('\n=== 4. the panel and the raw editor (jsdom) ===');
const SOURCE = [
  dds({ rec: 1, name: 'PLAIN' }),
  dds({ line: 1, pos: 2, fn: "'PLAIN'" }),
  dds({ rec: 1, name: 'SFLR', fn: 'SFL' }),
  dds({ name: 'S1', len: 10, type: 'A', usage: 'O', line: 4, pos: 2 }),
  dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ name: 'RELRCD', len: 5, type: 'S', dec: 0, usage: 'H' }),
  dds({ name: 'BADLEN', len: 4, type: 'S', dec: 0, usage: 'H' }),
  dds({ name: 'BADUSE', len: 5, type: 'S', dec: 0, usage: 'B', line: 1, pos: 2 }),
  dds({ name: 'F2', len: 10, type: 'A', usage: 'B', line: 2, pos: 2 }),
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
  function withAlert(fn) {
    const orig = dom.window.alert;
    let msg = null;
    dom.window.alert = (m) => { msg = m; };
    fn();
    dom.window.alert = orig;
    return msg;
  }
  // Type `params` into the SFLCSRRRN box and set the checkbox; returns { msg, text }.
  function panel(on, params) {
    selectRecord('CTL'); tab('SFLCTL');
    const el = doc.getElementById('sflctl-CTL-sflcsrrrn-on');
    const pe = doc.getElementById('sflctl-CTL-sflcsrrrn-params');
    posted.length = 0;
    if (params !== undefined) pe.value = params;
    el.checked = on;
    const msg = withAlert(() => fire(el));
    return { msg, text: lastText() };
  }
  const sflcsrrrn = (text) => { const r = recordFrom(text, 'CTL'); const k = r && r.keywords.find((x) => x.name === 'SFLCSRRRN'); return k ? k.parameters.trim() : null; };

  console.log('  -- SFLCTL panel');
  {
    const r = panel(true, '');
    check('ticking SFLCSRRRN with an empty box is refused (no bare keyword written)', /SFLCSRRRN needs a parameter/.test(r.msg || '') && r.text === null);
  }
  {
    const r = panel(true, 'two words');
    check('several tokens are still refused by the writer (no auto-&)', /leading &/.test(r.msg || '') && r.text === null);
  }
  const dialog = () => doc.querySelector('.confirm-overlay');
  const clickDialog = (cls) => fire(doc.querySelector('.confirm-overlay .' + cls), 'click');
  {
    const r = panel(true, 'NEWREC');
    check('a well-formed name for a missing field opens the create-field dialog, writes nothing yet', r.msg === null && r.text === null && !!dialog() && /no such field/.test(dialog().textContent) && /NEWREC/.test(dialog().textContent));
    check('the dialog states the field it will create (S, length 5, 0 decimals, usage H)', /signed numeric S, length 5, 0 decimal positions, usage H/.test(dialog().textContent));
    check('the box was rewritten with the leading & (what you see is what is written)', doc.getElementById('sflctl-CTL-sflcsrrrn-params').value === '&NEWREC');
    posted.length = 0;
    clickDialog('confirm-dialog-cancel');
    check('Cancel closes the dialog and writes nothing', !dialog() && lastText() === null);
  }
  {
    panel(true, '&NEWREC');
    posted.length = 0;
    const msg = withAlert(() => clickDialog('confirm-dialog-confirm'));
    const rec = recordFrom(lastText(), 'CTL');
    const f = rec && rec.fields.find((x) => x.name === 'NEWREC');
    check('Create field adds NEWREC as a hidden S / 5 / 0 field, no alert', msg === null && !!f && f.dataType === 'S' && Number(f.length) === 5 && Number(f.decimalPositions) === 0 && f.usage === 'H');
    check('...and writes SFLCSRRRN(&NEWREC) in the same action', sflcsrrrn(lastText()) === '&NEWREC' && /SFLCSRRRN\(&NEWREC\)/.test(lastText()));
    check('the created field is valid by the writer\'s own rule', DspfWriter.sflcsrrrnParameterProblem('&NEWREC', recordFrom(lastText(), 'CTL').fields) === null);
    const r2 = panel(false);
    check('turning it off keeps the created field (never deleted for you)', r2.msg === null && sflcsrrrn(r2.text) === null && recordFrom(r2.text, 'CTL').fields.some((x) => x.name === 'NEWREC'));
  }
  {
    const r = panel(true, 'RELRCD');
    check('a bare name for an existing valid field gets the & added and is accepted, no dialog', r.msg === null && !dialog() && sflcsrrrn(r.text) === '&RELRCD' && /SFLCSRRRN\(&RELRCD\)/.test(r.text));
    const off = panel(false);
    check('(turned off again)', sflcsrrrn(off.text) === null);
  }
  {
    const r = panel(true, '&BADLEN2');
    const stillDialog = !!dialog();
    if (stillDialog) clickDialog('confirm-dialog-cancel');
    check('a missing field offers to create (it does not fall through to the refusal)', stillDialog && r.text === null);
  }
  {
    const r = panel(true, '&BADLEN');
    check('a field with the wrong length is refused', /its length is 4/.test(r.msg || '') && r.text === null);
  }
  {
    const r = panel(true, '&BADUSE');
    check('a field with usage B is refused', /its usage is B/.test(r.msg || '') && r.text === null);
  }
  {
    const r = panel(true, '&RELRCD');
    check('&RELRCD on the valid hidden field is accepted, no alert', r.msg === null && sflcsrrrn(r.text) === '&RELRCD');
    check('the DDS line is SFLCSRRRN(&RELRCD)', !!r.text && /SFLCSRRRN\(&RELRCD\)/.test(r.text));
  }
  {
    const r = panel(false);
    check('turning it off is always accepted', r.msg === null && sflcsrrrn(r.text) === null);
  }

  console.log('  -- raw keyword editor');
  function rawAdd(record, name, params) {
    const owner = 'record-' + record;
    doc.getElementById(owner + '-new-kw-name').value = name;
    doc.getElementById(owner + '-new-kw-params').value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click'));
  }
  selectRecord('CTL');
  {
    const msg = rawAdd('CTL', 'SFLCSRRRN', '');
    check('raw-adding a bare SFLCSRRRN is refused', /needs a parameter/.test(msg || '') && lastText() === null);
  }
  {
    const msg = rawAdd('CTL', 'SFLCSRRRN', 'RELRCD');
    check('raw-adding SFLCSRRRN(RELRCD) is refused', /leading &/.test(msg || '') && lastText() === null);
  }
  {
    const msg = rawAdd('CTL', 'SFLCSRRRN', '&RELRCD');
    check('raw-adding SFLCSRRRN(&RELRCD) is accepted', msg === null && sflcsrrrn(lastText()) === '&RELRCD');
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

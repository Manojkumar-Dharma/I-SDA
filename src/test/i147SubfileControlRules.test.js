/**
 * i147SubfileControlRules.test.js
 *
 * Task I-147 - the subfile-control keyword rules the I-121c slice found
 * unenforced: SFLPAG / SFLCLR / SFLDSP / SFLDSPCTL / SFLEND are accepted on a
 * record without SFLCTL; SFLPAG and SFLDSP are required on the control record;
 * display size condition names are accepted on SFLCLR / SFLDSP / SFLDSPCTL /
 * SFLINZ; an option indicator is required on SFLCLR / SFLEND; SFLEND's second
 * parameter is only valid after *SCRBAR.
 *
 * Decisions (the I-141 pattern): refused at the commit choke point - the five
 * keywords on a record with no SFLCTL (both directions), a display size name on
 * the four that say it is not valid, an SFLEND parameter text that breaks the
 * grammar. Shown as a note, not refused - SFLPAG / SFLDSP missing from the
 * control record and an option indicator missing on SFLCLR / SFLEND / SFLDLT
 * (the panel checkbox writes a bare keyword, and the Conditioning editor only
 * exists once the keyword does).
 *
 *  1. the spec facts against the reference text.
 *  2. the pure guards.
 *  3. the real generated webview in jsdom: raw adds, unchecking SFLCTL, the
 *     notes appearing / disappearing, the SFLEND parameter field.
 *
 * Run with: node src/test/i147SubfileControlRules.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const FIVE = ['SFLPAG', 'SFLCLR', 'SFLDSP', 'SFLDSPCTL', 'SFLEND'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const NORM = REF.replace(/\f/g, ' ').replace(/\n\s*\d+ IBM i: Programming\s*\n/g, '\n').replace(/\n\s*DDS for display files \d+\s*\n/g, '\n').replace(/\s+/g, ' ');
/** The real section: the first occurrence of the heading whose text contains `must`. */
function section(heading, must) {
  let from = 0;
  for (;;) {
    const at = NORM.indexOf(heading, from);
    if (at < 0) throw new Error('section not found: ' + heading);
    const body = NORM.slice(at, at + 5000);
    if (must.test(body)) return body;
    from = at + 1;
  }
}

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

console.log('=== 1. spec facts against the reference ===');
{
  const pag = section('SFLPAG (Subfile Page) keyword for display files', /This keyword is required for the subfile-control record format/);
  check('SFLPAG: on the subfile-control record, required there', /on the subfile-control record format to specify the number of records/.test(pag) && /This keyword is required for the subfile-control record format/.test(pag));
  const dsp = section('SFLDSP (Subfile Display) keyword for display files', /This keyword is required and is valid only for the subfile-control/);
  check('SFLDSP: required and valid only on the subfile-control record, display size names not valid', /required and is valid only for the subfile-control record format/.test(dsp) && /Display size condition names are not valid for this keyword/.test(dsp));
  const dctl = section('SFLDSPCTL (Subfile Display Control) keyword for display files', /valid only for the subfile-control record format/);
  check('SFLDSPCTL: valid only on the subfile-control record, display size names not valid', /valid only for the subfile-control record format/.test(dctl) && /Display size condition names are not valid for this keyword/.test(dctl));
  const clr = section('SFLCLR (Subfile Clear) keyword for display files', /An option indicator is required for this keyword/);
  check('SFLCLR: valid only on the subfile-control record, display size names not valid, an option indicator required', /valid only for the subfile-control record format/.test(clr) && /Display size condition names are not valid for this keyword/.test(clr) && /An option indicator is required for this keyword/.test(clr));
  const end = section('SFLEND (Subfile End) keyword for display files', /An option indicator must be specified for this keyword/);
  check('SFLEND: on the subfile-control record, an option indicator required, second parameter only with *SCRBAR', /on the subfile-control record format to enable the display of a plus sign/.test(end) && /An option indicator must be specified for this keyword/.test(end) && /The second set of \*PLUS, \*MORE, and \*SCRBAR can only be specified if \*SCRBAR is specified as the first parameter/.test(end));
  const inz = section('SFLINZ (Subfile Initialize) keyword for display files', /Display size condition names are not valid/);
  check('SFLINZ: display size names not valid', /Display size condition names are not valid/.test(inz));
  const dlt = section('SFLDLT (Subfile Delete) keyword for display files', /display size condition names are not valid/);
  check('SFLDLT: option indicators required, display size names not valid (I-141)', /Option indicators are required for this keyword; display size condition names are not valid/.test(dlt));

  check('SFLCTL.requiredFor: the I-141 three then the five (Task I-157 appends five more after them)', KeywordSpec.sflctlDependentKeywords().slice(0, 8).join() === 'SFLCSRRRN,SFLDLT,SFLINZ,' + FIVE.join());
  check('every I-121c keyword whose entry is on the control record is in the requires-list', KeywordSpec.subfileControlKeywords().every((k) => KeywordSpec.subfileControlRecordType(k) !== 'SFLCTL' || KeywordSpec.sflctlDependentKeywords().indexOf(k) !== -1));
  check('the citation names every one of the five and the subfile-control wording', FIVE.every((k) => new RegExp(k).test(KeywordSpec.RECORD_TYPES.SFLCTL.requiredForDdsReference)) && /subfile-control record format/.test(KeywordSpec.RECORD_TYPES.SFLCTL.requiredForDdsReference));
  check('required on the control record: SFLPAG, SFLDSP (accessor and entries agree)', KeywordSpec.subfileControlRequiredKeywords().join() === 'SFLPAG,SFLDSP' && KeywordSpec.subfileControlKeywords().filter((k) => KeywordSpec.requiredOnSubfileControl(k)).join() === 'SFLPAG,SFLDSP');
  check('option indicator required: SFLCLR, SFLEND, SFLDLT', KeywordSpec.optionIndicatorRequiredKeywords().join() === 'SFLCLR,SFLEND,SFLDLT');
  check('display size names not valid on exactly SFLCLR, SFLDSP, SFLDSPCTL, SFLINZ, SFLDLT among the seven', KeywordSpec.subfileControlKeywords().filter((k) => KeywordSpec.refusesDisplaySizeNames(k)).join() === 'SFLCLR,SFLDSP,SFLDSPCTL,SFLINZ,SFLDLT');
  check('SFLPAG (display size names valid) and SFLEND (silent) are not refused display size names', !KeywordSpec.refusesDisplaySizeNames('SFLPAG') && !KeywordSpec.refusesDisplaySizeNames('SFLEND'));
  check('accessors are fresh copies and edge-safe', (() => { const a = KeywordSpec.subfileControlRequiredKeywords(); a.pop(); const b = KeywordSpec.optionIndicatorRequiredKeywords(); b.pop(); return KeywordSpec.subfileControlRequiredKeywords().length === 2 && KeywordSpec.optionIndicatorRequiredKeywords().length === 3; })());
  check('refusesDisplaySizeNames is false for anything else', ['', 'constructor', '__proto__', 'MSGCON', null, undefined, 4, 'SFLCTL'].every((n) => KeywordSpec.refusesDisplaySizeNames(n) === false));
  check('SFLCLR / SFLEND have no "guarded" option-indicator-required fact (I-141 shape untouched); SFLDLT keeps it', KeywordSpec.optionIndicatorRequiredFact('SFLCLR') === null && KeywordSpec.optionIndicatorRequiredFact('SFLEND') === null && !!KeywordSpec.optionIndicatorRequiredFact('SFLDLT'));
}

console.log('\n=== 2. pure guards ===');
const kw = (name, parameters, conditions) => ({ name, parameters: parameters || '', conditions: conditions || [] });
const rec = (name, keywords) => ({ name, keywords, fields: [] });
const model = (...records) => ({ fileKeywords: [], records });
const dep = (a, b) => DspfWriter.sflctlDependencyNewConflictReason(a, b);
const dsr = (a, b) => DspfWriter.optionIndicatorRequiredNewConflictReason(a, b);
const ds = (x) => [{ displaySizeCondition: x, indicators: [] }];
const ind = (n) => [{ indicators: [{ number: n, not: false }] }];
{
  const plain = model(rec('R1', []));
  FIVE.forEach((k) => {
    check('adding ' + k + ' to a plain record is refused, with the DDS wording', new RegExp(k + ' cannot be specified on record format R1 without an SFLCTL keyword on the same record format \\(per the DDS Reference\\)').test(dep(plain, model(rec('R1', [kw(k)]))) || ''));
    check('removing SFLCTL from a record that still carries ' + k + ' is refused', new RegExp(k + ' cannot be specified').test(dep(model(rec('R1', [kw('SFLCTL', 'S'), kw(k)])), model(rec('R1', [kw(k)]))) || ''));
    check(k + ' on a record with SFLCTL is accepted', dep(plain, model(rec('R1', [kw('SFLCTL', 'S'), kw(k)]))) === null);
    check('an already-invalid ' + k + ' never blocks an unrelated edit', dep(model(rec('R1', [kw(k)])), model(rec('R1', [kw(k), kw('TEXT', "'x'")]))) === null);
  });
  check('a second violation (another record) is reported even when the first already existed', /SFLEND cannot be specified on record format R2/.test(dep(model(rec('R1', [kw('SFLPAG')]), rec('R2', [])), model(rec('R1', [kw('SFLPAG')]), rec('R2', [kw('SFLEND')]))) || ''));
  check('fail-safe: a missing / empty model yields null', dep(undefined, undefined) === null && dep(model(), model()) === null);

  ['SFLCLR', 'SFLDSP', 'SFLDSPCTL', 'SFLINZ'].forEach((k) => {
    const r = dsr(model(rec('C', [kw('SFLCTL', 'S'), kw(k)])), model(rec('C', [kw('SFLCTL', 'S'), kw(k, '', ds('*DS3'))])));
    check('a display size name on ' + k + ' is refused, naming the keyword', new RegExp('^' + k + ': display size condition names \\(\\*DS3 / \\*DS4\\) are not valid for this keyword').test(r || ''));
    check(k + ': an option indicator on it is fine', dsr(model(rec('C', [kw('SFLCTL', 'S'), kw(k)])), model(rec('C', [kw('SFLCTL', 'S'), kw(k, '', ind('31'))]))) === null);
    check(k + ': removing a display size name, or leaving a hand-written one alone, is fine', dsr(model(rec('C', [kw(k, '', ds('*DS3'))])), model(rec('C', [kw(k)]))) === null && dsr(model(rec('C', [kw(k, '', ds('*DS3'))])), model(rec('C', [kw(k, '', ds('*DS3'))]))) === null);
  });
  check('SFLDLT keeps its I-141 wording (use an option indicator, with the reference)', /^SFLDLT: display size condition names \(\*DS3 \/ \*DS4\) are not valid - use an option indicator \(per the DDS Reference: Option indicators are required/.test(dsr(model(rec('C', [kw('SFLDLT')])), model(rec('C', [kw('SFLDLT', '', ds('*DS4'))]))) || ''));
  ['SFLPAG', 'SFLEND'].forEach((k) => check('a display size name on ' + k + ' is not refused (valid / silent)', dsr(model(rec('C', [kw(k)])), model(rec('C', [kw(k, '', ds('*DS3'))]))) === null));

  const P = (t) => DspfWriter.sflendParameterProblem(t);
  [['', 'empty = the *PLUS default'], ['*PLUS', ''], ['*MORE', ''], ['*SCRBAR', ''], ['*SCRBAR *SCRBAR', ''], ['*SCRBAR *PLUS', ''], ['*SCRBAR *MORE', ''], ['  *scrbar   *more ', 'case and spacing'], [undefined, 'undefined'], [null, 'null']].forEach((c) => check('SFLEND(' + JSON.stringify(c[0]) + ') is valid ' + c[1], P(c[0]) === null));
  [['*MORE *PLUS', /second parameter can only be specified when \*SCRBAR is the first parameter/], ['*PLUS *MORE', /second parameter can only be specified/], ['*PLUS *SCRBAR', /second parameter can only be specified/], ['*SCRBAR *BOGUS', /second parameter must be \*SCRBAR, \*PLUS, \*MORE/], ['*BOGUS', /first parameter must be \*PLUS, \*MORE, \*SCRBAR/], ['MORE', /first parameter must be/], ['*SCRBAR *MORE *PLUS', /at most two parameters/], ['*PLUS,*MORE', /first parameter must be/]].forEach((c) => check('SFLEND(' + c[0] + ') is refused', c[1].test(P(c[0]) || '')));
  const N = (o, n) => DspfWriter.sflendNewConflictReason(o, n);
  check('adding an invalid SFLEND is refused; adding a valid one is not', /second parameter can only/.test(N([], [kw('SFLEND', '*MORE *PLUS')]) || '') && N([], [kw('SFLEND', '*SCRBAR *MORE')]) === null && N([], [kw('SFLEND')]) === null);
  check('changing a valid SFLEND to an invalid one is refused', !!N([kw('SFLEND', '*MORE')], [kw('SFLEND', '*MORE *PLUS')]));
  check('an unchanged hand-written invalid SFLEND is never re-reported (case-insensitive), and removing it is fine', N([kw('SFLEND', '*more *plus')], [kw('SFLEND', '*MORE *PLUS')]) === null && N([kw('SFLEND', '*MORE *PLUS')], []) === null);
  check('with two SFLEND instances, a new bad one is found even beside an old one', !!N([kw('SFLEND', '*MORE', ind('31'))], [kw('SFLEND', '*MORE', ind('31')), kw('SFLEND', '*PLUS *PLUS', ind('32'))]));
  check('no SFLEND, or other keywords only, gives null; undefined arguments are safe', N([], [kw('TEXT', "'x'")]) === null && N(undefined, undefined) === null);

  const notes = (list) => DspfWriter.subfileControlNotes(list);
  check('notes: a control record with nothing is missing SFLPAG and SFLDSP, and needs no indicator', JSON.stringify(notes([kw('SFLCTL', 'S')])) === JSON.stringify({ missingRequired: ['SFLPAG', 'SFLDSP'], needsIndicator: [] }));
  check('notes: SFLPAG present, SFLDSP missing', notes([kw('SFLCTL', 'S'), kw('SFLPAG', '5')]).missingRequired.join() === 'SFLDSP');
  check('notes: both present, none missing', notes([kw('SFLCTL', 'S'), kw('SFLPAG', '5'), kw('SFLDSP')]).missingRequired.length === 0);
  check('notes: bare SFLCLR / SFLEND / SFLDLT each need an indicator, in the spec order', notes([kw('SFLDLT'), kw('SFLCLR'), kw('SFLEND')]).needsIndicator.join() === 'SFLCLR,SFLEND,SFLDLT');
  check('notes: an option indicator clears the note; a display size name does not count', notes([kw('SFLCLR', '', ind('31'))]).needsIndicator.length === 0 && notes([kw('SFLCLR', '', ds('*DS3'))]).needsIndicator.join() === 'SFLCLR');
  check('notes: one conditioned and one bare SFLEND still need an indicator', notes([kw('SFLEND', '', ind('31')), kw('SFLEND')]).needsIndicator.join() === 'SFLEND');
  check('notes: undefined keywords are safe', notes(undefined).missingRequired.join() === 'SFLPAG,SFLDSP' && notes(undefined).needsIndicator.length === 0);
}

console.log('\n=== 3. the panel and the commit hook (jsdom) ===');
const SOURCE = [
  dds({ rec: 1, name: 'PLAIN' }),
  dds({ line: 1, pos: 2, fn: "'PLAIN'" }),
  dds({ rec: 1, name: 'SFLR', fn: 'SFL' }),
  dds({ name: 'S1', len: 10, type: 'A', usage: 'O', line: 4, pos: 2 }),
  dds({ rec: 1, name: 'CTL', fn: 'SFLCTL(SFLR)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLPAG(5)' }),
  dds({ ind: '30', fn: 'SFLDSP' }),
  dds({ ind: '31', fn: 'SFLCLR' }),
  dds({ ind: '32', fn: 'SFLEND' }),
  dds({ name: 'F2', len: 10, type: 'A', usage: 'B', line: 1, pos: 2 }),
  dds({ rec: 1, name: 'CTL2', fn: 'SFLCTL(SFLR)' }),
  dds({ fn: 'SFLSIZ(10)' }),
  dds({ fn: 'SFLCLR' }),
  dds({ fn: 'SFLEND' }),
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
  function rawAdd(record, name, params) {
    const owner = 'record-' + record;
    doc.getElementById(owner + '-new-kw-name').value = name;
    const p = doc.getElementById(owner + '-new-kw-params');
    if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click'));
  }

  console.log('  -- raw keyword editor on a plain record');
  selectRecord('PLAIN');
  FIVE.forEach((k) => {
    const msg = rawAdd('PLAIN', k, k === 'SFLPAG' ? '5' : '');
    check('raw-adding ' + k + ' to a plain record is refused, nothing written', new RegExp(k + ' cannot be specified on record format PLAIN without an SFLCTL').test(msg || '') && lastText() === null);
  });

  console.log('  -- removing SFLCTL from a record that still has the five');
  selectRecord('CTL');
  tab('SFLCTL');
  {
    const el = doc.getElementById('sflctl-CTL-sflctl-on');
    posted.length = 0;
    el.checked = false;
    const msg = withAlert(() => fire(el));
    check('unchecking SFLCTL is refused with the DDS wording', /SFL(PAG|CLR|DSP|END) cannot be specified on record format CTL without an SFLCTL/.test(msg || '') && lastText() === null);
  }

  console.log('  -- notes: a complete control record shows none');
  check('CTL (SFLPAG, SFLDSP, conditioned SFLCLR / SFLEND) shows no note', !doc.getElementById('sflctl-CTL-needs-required') && !doc.getElementById('sflctl-CTL-sflclr-needs-indicator') && !doc.getElementById('sflctl-CTL-sflend-needs-indicator'));

  console.log('  -- notes: an incomplete control record');
  selectRecord('CTL2');
  tab('SFLCTL');
  {
    const req = doc.getElementById('sflctl-CTL2-needs-required');
    check('CTL2 shows the required-companion note naming SFLPAG and SFLDSP', !!req && /SFLPAG and SFLDSP are required/.test(req.textContent));
    check('CTL2 bare SFLCLR and SFLEND each show the indicator note', !!doc.getElementById('sflctl-CTL2-sflclr-needs-indicator') && !!doc.getElementById('sflctl-CTL2-sflend-needs-indicator') && /option indicator is required/.test(doc.getElementById('sflctl-CTL2-sflclr-needs-indicator').textContent));
    const el = doc.getElementById('sflctl-CTL2-sfldsp-on');
    posted.length = 0;
    el.checked = true;
    const msg = withAlert(() => fire(el));
    check('switching SFLDSP on (bare) is accepted, no alert', msg === null && names(recordFrom(lastText(), 'CTL2')).includes('SFLDSP'));
    check('...and the required note now names only SFLPAG', /^SFLPAG is required/.test((doc.getElementById('sflctl-CTL2-needs-required') || { textContent: '' }).textContent));
    const clr = doc.getElementById('sflctl-CTL2-sflclr-on');
    posted.length = 0;
    clr.checked = false;
    fire(clr);
    check('turning the bare SFLCLR off still works (removed) and its note goes', names(recordFrom(lastText(), 'CTL2')).indexOf('SFLCLR') === -1 && !doc.getElementById('sflctl-CTL2-sflclr-needs-indicator'));
    const clr2 = doc.getElementById('sflctl-CTL2-sflclr-on');
    posted.length = 0;
    clr2.checked = true;
    const msg2 = withAlert(() => fire(clr2));
    check('switching SFLCLR back on (bare) is accepted and the note is back', msg2 === null && !!doc.getElementById('sflctl-CTL2-sflclr-needs-indicator'));
  }

  console.log('  -- SFLEND parameter grammar through the panel and the raw editor');
  selectRecord('CTL');
  tab('SFLCTL');
  {
    const inp = doc.getElementById('sflctl-CTL-sflend-params');
    check('the SFLEND row has a parameter field', !!inp);
    posted.length = 0;
    inp.value = '*MORE *PLUS';
    const msg = withAlert(() => fire(inp));
    check('an SFLEND second parameter without *SCRBAR is refused, nothing written', /second parameter can only be specified when \*SCRBAR is the first parameter/.test(msg || '') && lastText() === null);
    selectRecord('CTL');
    tab('SFLCTL');
    const inp2 = doc.getElementById('sflctl-CTL-sflend-params');
    posted.length = 0;
    inp2.value = '*MORE';
    const ok = withAlert(() => fire(inp2));
    const written = recordFrom(lastText(), 'CTL');
    check('a valid parameter (*MORE) is accepted and written', ok === null && !!written && written.keywords.some((k) => k.name === 'SFLEND' && /\*MORE/.test(k.parameters)));
  }
  {
    selectRecord('CTL2');
    const msg = rawAdd('CTL2', 'SFLEND', '*PLUS *PLUS');
    check('raw-adding SFLEND(*PLUS *PLUS) to a control record is refused, nothing written', /second parameter can only be specified/.test(msg || '') && lastText() === null);
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

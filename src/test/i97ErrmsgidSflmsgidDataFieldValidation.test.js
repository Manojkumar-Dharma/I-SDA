/**
 * i97ErrmsgidSflmsgidDataFieldValidation.test.js
 *
 * Task I-97 (opened from I-89's deferred finding) - ERRMSGID's and
 * SFLMSGID's optional &msg-data parameter carries the same DDS Reference
 * rule as CHKMSGID's: the field must exist in the record format and be a
 * character field (data type A) with usage P. Their panels took any text
 * there and nothing checked it.
 *
 *   A. DspfWriter: the shared field check now carrying the keyword name,
 *      the name reader, the diff-based edit check, the raw editor's add.
 *   B. The real generated webview: the ERRMSGID panel's &field box, the
 *      field-level raw editor, and the record-level raw editor for SFLMSGID
 *      on a subfile-control record - plus what must NOT be blocked.
 * Run with: node src/test/i97ErrmsgidSflmsgidDataFieldValidation.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const fld = (name, dataType, usage, extra) => Object.assign({ name, dataType, usage, decimalPositions: null, nameType: 'NAMED', isReference: false, keywords: [], sourceLine: 1 }, extra || {});
const REC = [fld('MSGFLD', 'A', 'P'), fld('OUTFLD', 'A', 'O'), fld('NUMFLD', 'S', 'P')];

// ===========================================================================
// A. DspfWriter
// ===========================================================================
console.log('A1. messageDataFieldProblem carries the keyword name');
{
  const p = DspfWriter.messageDataFieldProblem;
  ['CHKMSGID', 'ERRMSGID', 'SFLMSGID'].forEach((k) => {
    check(k + ': a valid field is fine', p(k, 'MSGFLD', REC) === null);
    check(k + ': a missing field is refused, naming the keyword', (() => { const m = p(k, 'NOSUCH', REC); return m.indexOf(k + ' message data field &NOSUCH') === 0 && /does not exist/.test(m); })());
    check(k + ': a non-P field is refused, naming the keyword', (() => { const m = p(k, 'OUTFLD', REC); return m.indexOf(k + ' ') === 0 && /its usage is O/.test(m); })());
  });
  check('the CHKMSGID wrapper (I-89) still says CHKMSGID', DspfWriter.chkmsgidMsgDataFieldProblem('NOSUCH', REC).indexOf('CHKMSGID message data field') === 0);
}

console.log('\nA2. messageIdMsgDataNames');
{
  const n = DspfWriter.messageIdMsgDataNames;
  check('reads the &name off an ERRMSGID', JSON.stringify(n([kwd('ERRMSGID', 'USR1234 USRMSGS &MSGFLD')], 'ERRMSGID')) === '["MSGFLD"]');
  check('skips a numeric response indicator before it', JSON.stringify(n([kwd('ERRMSGID', 'USR1234 QGPL/USRMSGS 30 &msgfld')], 'ERRMSGID')) === '["MSGFLD"]');
  check('none when there is no &name', n([kwd('ERRMSGID', 'USR1234 USRMSGS 30')], 'ERRMSGID').length === 0);
  check('a bare & is not a name', n([kwd('SFLMSGID', 'USR1234 USRMSGS &')], 'SFLMSGID').length === 0);
  check('collects across several instances, in order', JSON.stringify(n([kwd('ERRMSGID', 'A B &X'), kwd('ERRMSG', "'t'"), kwd('ERRMSGID', 'C D &Y')], 'ERRMSGID')) === '["X","Y"]');
  check('only the asked-for keyword counts', n([kwd('SFLMSGID', 'A B &X')], 'ERRMSGID').length === 0);
  check('the first two tokens are never taken for names', n([kwd('ERRMSGID', '&A &B')], 'ERRMSGID').length === 0);
}

console.log('\nA3. messageIdMsgDataNewConflictReason - the diff');
{
  const r = DspfWriter.messageIdMsgDataNewConflictReason;
  const e = (n) => [kwd('ERRMSGID', 'USR1234 USRMSGS' + (n ? ' &' + n : ''))];
  check('a valid new name is allowed', r('ERRMSGID', [], e('MSGFLD'), REC) === null);
  check('a bad new name is refused', /OUTFLD/.test(r('ERRMSGID', [], e('OUTFLD'), REC)));
  check('a missing new name is refused', /does not exist/.test(r('ERRMSGID', [], e('NOSUCH'), REC)));
  check('no name at all is fine', r('ERRMSGID', [], e(''), REC) === null);
  check('an unchanged hand-written bad name is never re-reported', r('ERRMSGID', e('OUTFLD'), e('OUTFLD'), REC) === null);
  check('...whatever its case', r('ERRMSGID', e('OUTFLD'), e('outfld'), REC) === null);
  check('a second instance with a bad name is caught even when a first one is fine', /NOSUCH/.test(r('ERRMSGID', e('MSGFLD'), e('MSGFLD').concat(e('NOSUCH')), REC)));
  check('changing a bad name to another bad one is refused', /NOSUCH/.test(r('ERRMSGID', e('OUTFLD'), e('NOSUCH'), REC)));
  check('changing a bad name to a valid one is allowed', r('ERRMSGID', e('OUTFLD'), e('MSGFLD'), REC) === null);
  check('removing the name is allowed', r('ERRMSGID', e('OUTFLD'), e(''), REC) === null);
  check('SFLMSGID is checked the same way', /NOSUCH/.test(r('SFLMSGID', [], [kwd('SFLMSGID', 'A B &NOSUCH')], REC)) && r('SFLMSGID', [], [kwd('SFLMSGID', 'A B &MSGFLD')], REC) === null);
  check('an ERRMSGID name is not judged when asking about SFLMSGID', r('SFLMSGID', [], e('NOSUCH'), REC) === null);
  check('an absent field list fails open', r('ERRMSGID', [], e('NOSUCH'), undefined) === null);
}

console.log('\nA4. messageIdMsgDataAddReason - the raw editor');
{
  const r = DspfWriter.messageIdMsgDataAddReason;
  check('ERRMSGID with a valid &field is allowed', r('ERRMSGID', 'USR1234 USRMSGS &MSGFLD', REC) === null);
  check('ERRMSGID with a bad &field is refused', /ERRMSGID message data field &OUTFLD/.test(r('ERRMSGID', 'USR1234 USRMSGS &OUTFLD', REC)));
  check('SFLMSGID with a missing &field is refused', /SFLMSGID message data field &NOSUCH/.test(r('SFLMSGID', 'USR1234 QGPL/USRMSGS 30 &NOSUCH', REC)));
  check('no data field, or empty params, is allowed', r('ERRMSGID', 'USR1234 USRMSGS', REC) === null && r('SFLMSGID', '', REC) === null && r('ERRMSGID', undefined, REC) === null);
  check('any other keyword is never reported (CHKMSGID has its own guard)', r('CHKMSGID', 'A B &NOSUCH', REC) === null && r('DSPATR', '&NOSUCH', REC) === null);
  check('the keyword name is case-insensitive', !!r('errmsgid', 'A B &OUTFLD', REC));
  check('an absent field list fails open', r('ERRMSGID', 'A B &NOSUCH', undefined) === null);
}

// ===========================================================================
// B. Real generated webview
// ===========================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function source(fieldKeywords, ctlKeywords) {
  const lines = [
    buildLine({ seq: '00010', nameType: 'R', name: 'REC1' }),
    buildLine({ seq: '00020', name: 'FIELD1', length: '10', dataType: 'A', usage: 'B', line: '4', col: '2' }),
  ];
  fieldKeywords.forEach((t, i) => lines.push(buildLine({ seq: String(21 + i).padStart(5, '0'), func: t })));
  lines.push(buildLine({ seq: '00040', name: 'MSGFLD', length: '12', dataType: 'A', usage: 'P' }));
  lines.push(buildLine({ seq: '00041', name: 'OUTFLD', length: '8', dataType: 'A', usage: 'O', line: '6', col: '2' }));
  lines.push(buildLine({ seq: '00050', nameType: 'R', name: 'SFLREC', func: 'SFL' }));
  lines.push(buildLine({ seq: '00051', name: 'SF1', length: '5', dataType: 'A', usage: 'O', line: '8', col: '2' }));
  lines.push(buildLine({ seq: '00060', nameType: 'R', name: 'CTLREC', func: 'SFLCTL(SFLREC)' }));
  lines.push(buildLine({ seq: '00061', func: 'SFLSIZ(10)' }));
  lines.push(buildLine({ seq: '00062', func: 'SFLPAG(5)' }));
  ctlKeywords.forEach((t, i) => lines.push(buildLine({ seq: String(63 + i).padStart(5, '0'), func: t })));
  lines.push(buildLine({ seq: '00070', name: 'CMSGFLD', length: '12', dataType: 'A', usage: 'P' }));
  lines.push(buildLine({ seq: '00071', name: 'COUTFLD', length: '8', dataType: 'A', usage: 'O', line: '3', col: '2' }));
  return lines.join('\n') + '\n';
}
async function scenario(fieldKeywords, ctlKeywords, fn) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce', source(fieldKeywords, ctlKeywords), 'EM.DSPF');
  const posted = [], alerts = [], errors = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} });
    },
  });
  await sleep(450);
  const doc = dom.window.document;
  const Ev = dom.window.Event;
  const c = {
    doc, posted, alerts,
    click: (el) => el.dispatchEvent(new Ev('click', { bubbles: true })),
    fire: (el) => el.dispatchEvent(new Ev('change', { bubbles: true })),
    reset: () => { posted.length = 0; alerts.length = 0; },
    lastEdit: () => posted.filter((m) => m.type === 'applyEdit').pop() || null,
    record: (name) => { const e = c.lastEdit(); return e ? DspfParser.parseDspf(e.text).records.find((r) => r.name === name) : null; },
    selectField: () => {
      const el = doc.querySelector('.dspf-field[data-field="FIELD1"]');
      el.dispatchEvent(new Ev('click', { bubbles: true }));
      return 'field-' + el.getAttribute('data-source-line');
    },
    selectRecord: (name) => {
      const sel = doc.getElementById('recordSelect');
      sel.value = name;
      sel.dispatchEvent(new Ev('change', { bubbles: true }));
    },
  };
  await fn(c);
  check('no uncaught errors in this scenario', errors.length === 0);
  dom.window.close();
}
const kwsOf = (rec, name) => (rec ? rec.keywords : []).filter((k) => k.name === name);
function addRaw(c, o, name, params) {
  c.doc.getElementById(o + '-new-kw-name').value = name;
  c.doc.getElementById(o + '-new-kw-params').value = params;
  c.reset();
  c.click(c.doc.querySelector('.kw-add[data-owner="' + o + '"]'));
}
const msgdataBox = (c) => c.doc.querySelector('input[class$="-msgdata"]');

async function main() {
  console.log('\nB1. ERRMSGID panel: the &field box');
  await scenario(['ERRMSGID(USR1234 USRMSGS)'], [], async (c) => {
    c.selectField();
    let box = msgdataBox(c);
    check('setup: the ERRMSGID row shows a message data field box', !!box && box.value === '');
    box.value = 'MSGFLD';
    c.reset();
    c.fire(box);
    const f = c.record('REC1') && c.record('REC1').fields.find((x) => x.name === 'FIELD1');
    check('a valid field (character, usage P) is written, no alert', c.alerts.length === 0 && !!f && f.keywords.some((k) => k.name === 'ERRMSGID' && /&MSGFLD/.test(k.parameters)));
  });
  await scenario(['ERRMSGID(USR1234 USRMSGS)'], [], async (c) => {
    c.selectField();
    let box = msgdataBox(c);
    box.value = 'msgfld';
    c.reset();
    c.fire(box);
    check('matched case-insensitively', c.alerts.length === 0 && !!c.lastEdit());
  });
  await scenario(['ERRMSGID(USR1234 USRMSGS)'], [], async (c) => {
    c.selectField();
    let box = msgdataBox(c);
    box.value = 'NOSUCH';
    c.reset();
    c.fire(box);
    check('a field that is not in the record is refused: alert, no edit', c.alerts.length === 1 && /ERRMSGID message data field &NOSUCH does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    check('the box was put back to its saved (blank) value', msgdataBox(c).value === '');
    box = msgdataBox(c);
    box.value = 'OUTFLD';
    c.reset();
    c.fire(box);
    check('a usage-O character field is refused, naming the usage', c.alerts.length === 1 && /its usage is O/.test(c.alerts[0]) && c.lastEdit() === null);
    box = msgdataBox(c);
    box.value = 'FIELD1';
    c.reset();
    c.fire(box);
    check('the field itself (usage B) is refused', c.alerts.length === 1 && /usage P/.test(c.alerts[0]) && c.lastEdit() === null);
  });
  await scenario(['ERRMSGID(USR1234 USRMSGS &OUTFLD)'], [], async (c) => {
    c.selectField();
    let box = msgdataBox(c);
    check('setup: a hand-written &OUTFLD is shown (with its &)', !!box && box.value === '&OUTFLD');
    box.value = 'OUTFLD';
    c.reset();
    c.fire(box);
    check('re-entering the same (bad) name is NOT re-reported', c.alerts.length === 0);
    box = msgdataBox(c);
    box.value = 'NOSUCH';
    c.reset();
    c.fire(box);
    check('changing it to another bad name is refused and the box restored to &OUTFLD', c.alerts.length === 1 && c.lastEdit() === null && msgdataBox(c).value === '&OUTFLD');
    box = msgdataBox(c);
    box.value = 'MSGFLD';
    c.reset();
    c.fire(box);
    check('changing it to a valid name is allowed', c.alerts.length === 0 && !!c.lastEdit());
  });
  await scenario(['ERRMSGID(USR1234 USRMSGS &OUTFLD)'], [], async (c) => {
    c.selectField();
    let box = msgdataBox(c);
    box.value = '';
    c.reset();
    c.fire(box);
    check('clearing a bad data field is allowed', c.alerts.length === 0 && !!c.lastEdit());
  });

  console.log('\nB2. field-level raw keyword editor (ERRMSGID)');
  await scenario([], [], async (c) => {
    const o = c.selectField();
    addRaw(c, o, 'ERRMSGID', 'USR1234 USRMSGS &NOSUCH');
    check('ERRMSGID naming a missing field is refused', c.alerts.length === 1 && /does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    addRaw(c, o, 'ERRMSGID', 'USR1234 USRMSGS 30 &OUTFLD');
    check('ERRMSGID naming a non-P field is refused', c.alerts.length === 1 && /its usage is O/.test(c.alerts[0]) && c.lastEdit() === null);
    addRaw(c, o, 'ERRMSGID', 'USR1234 USRMSGS &MSGFLD');
    check('ERRMSGID naming a valid field is added', c.alerts.length === 0 && !!c.lastEdit());
  });
  await scenario([], [], async (c) => {
    const o = c.selectField();
    addRaw(c, o, 'ERRMSGID', 'USR1234 USRMSGS 30');
    check('ERRMSGID with no data field is added', c.alerts.length === 0 && !!c.lastEdit());
  });

  console.log('\nB3. record-level raw keyword editor (SFLMSGID on a subfile-control record)');
  await scenario([], [], async (c) => {
    c.selectRecord('CTLREC');
    const o = 'record-CTLREC';
    check('setup: the record raw editor is present', !!c.doc.getElementById(o + '-new-kw-name'));
    addRaw(c, o, 'SFLMSGID', 'USR1234 USRMSGS &NOSUCH');
    check('SFLMSGID naming a missing field is refused', c.alerts.length === 1 && /SFLMSGID message data field &NOSUCH does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    addRaw(c, o, 'SFLMSGID', 'USR1234 USRMSGS &COUTFLD');
    check('SFLMSGID naming a non-P field is refused', c.alerts.length === 1 && /its usage is O/.test(c.alerts[0]) && c.lastEdit() === null);
    addRaw(c, o, 'SFLMSGID', 'USR1234 USRMSGS &MSGFLD');
    check('a field that exists only in ANOTHER record is refused (the control record\'s own fields are the ones that count)', c.alerts.length === 1 && /does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    addRaw(c, o, 'SFLMSGID', 'USR1234 USRMSGS &CMSGFLD');
    const ctl = c.record('CTLREC');
    check('SFLMSGID naming a valid field of the control record is added', c.alerts.length === 0 && kwsOf(ctl, 'SFLMSGID').length === 1 && /&CMSGFLD/.test(kwsOf(ctl, 'SFLMSGID')[0].parameters));
  });
  await scenario([], [], async (c) => {
    c.selectRecord('CTLREC');
    addRaw(c, 'record-CTLREC', 'SFLMSGID', 'USR1234 USRMSGS');
    check('SFLMSGID with no data field is added', c.alerts.length === 0 && kwsOf(c.record('CTLREC'), 'SFLMSGID').length === 1);
  });
  await scenario([], ['SFLMSGID(USR1234 USRMSGS &COUTFLD)'], async (c) => {
    c.selectRecord('CTLREC');
    addRaw(c, 'record-CTLREC', 'OVERLAY', '');
    check('an unrelated keyword add on a record whose hand-written SFLMSGID names a bad field is NOT blocked', c.alerts.length === 0 && kwsOf(c.record('CTLREC'), 'OVERLAY').length === 1);
  });

  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

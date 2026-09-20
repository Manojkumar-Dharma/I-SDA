/**
 * i89ChkmsgidDataFieldValidation.test.js
 *
 * Task I-89 - CHKMSGID's optional &message-data-field parameter. Its DDS
 * Reference section: "The field name must exist in the record format, and
 * the field must be defined as a character field (data type A) with usage
 * P." The CHKMSGID panel took any text there and nothing checked it.
 *
 *   A. DspfWriter: the field check, the diff-based edit check, the raw
 *      editor's add check.
 *   B. The real generated webview: the CHKMSGID panel's Apply, the raw
 *      editor's "+ Add keyword", and what must NOT be blocked.
 * Run with: node src/test/i89ChkmsgidDataFieldValidation.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const fld = (name, dataType, usage, extra) => Object.assign({ name, dataType, usage, decimalPositions: null, nameType: 'NAMED', isReference: false, keywords: [], sourceLine: 1 }, extra || {});

// ===========================================================================
// A. DspfWriter
// ===========================================================================
console.log('A1. chkmsgidMsgDataFieldProblem');
{
  const p = DspfWriter.chkmsgidMsgDataFieldProblem;
  const rec = [
    fld('MSGFLD', 'A', 'P'), fld('BLANKTYPE', '', 'P'), fld('OUTFLD', 'A', 'O'), fld('INFLD', 'A', 'B'),
    fld('NOUSAGE', 'A', ''), fld('NUMS', 'S', 'P'), fld('NUMBLANK', '', 'P', { decimalPositions: 2 }),
    fld('DBCS', 'O', 'P'), fld('REFP', '', 'P', { isReference: true }), fld('REFO', '', 'O', { isReference: true }),
    fld('', '', '', { nameType: 'CONSTANT' }), fld('CONSTNAME', '', 'P', { nameType: 'CONSTANT' }),
    fld('ZERODEC', '', 'P', { decimalPositions: 0 }),
  ];
  check('a character (A) field with usage P is valid', p('MSGFLD', rec) === null);
  check('the leading & is accepted and ignored', p('&MSGFLD', rec) === null);
  check('the name match is case-insensitive', p('msgfld', rec) === null);
  check('a blank data type with no decimals is A by default: valid', p('BLANKTYPE', rec) === null);
  check('a blank name reports nothing (no data field given)', p('', rec) === null && p('&', rec) === null);
  const none = p('NOSUCH', rec);
  check('a name not in the record is refused, naming it and the rule', /&NOSUCH/.test(none) && /does not exist in this record format/.test(none));
  const out = p('OUTFLD', rec);
  check('usage O is refused, naming the usage', /usage P/.test(out) && /its usage is O/.test(out) && !/data type/.test(out.replace(/data type A/, '')));
  check('usage B is refused', /its usage is B/.test(p('INFLD', rec)));
  check('a blank usage is refused, saying so', /blank \(output\)/.test(p('NOUSAGE', rec)));
  check('data type S is refused, naming it', /it is data type S/.test(p('NUMS', rec)));
  check('a blank data type WITH decimal positions is numeric: refused', /numeric field/.test(p('NUMBLANK', rec)));
  check('decimal positions 0 count as specified: refused', /numeric field/.test(p('ZERODEC', rec)));
  check('another non-A data type (O) is refused', /data type O/.test(p('DBCS', rec)));
  check('both problems are reported together', (() => { const m = p('NUMS', [fld('NUMS', 'S', 'B')]); return /data type S/.test(m) && /its usage is B/.test(m); })());
  check('a field defined by reference: data type not judged, usage P is valid', p('REFP', rec) === null);
  check('a field defined by reference is still held to usage P', /its usage is O/.test(p('REFO', rec)));
  check('a constant never counts as a field, even with the same name', /does not exist/.test(p('CONSTNAME', rec)));
}

console.log('\nA2. chkmsgidMsgDataNewConflictReason - the diff');
{
  const r = DspfWriter.chkmsgidMsgDataNewConflictReason;
  const rec = [fld('MSGFLD', 'A', 'P'), fld('OUTFLD', 'A', 'O')];
  const withData = (n) => [kwd('CHKMSGID', 'USR1234 USRMSGS' + (n ? ' &' + n : ''))];
  check('a valid new data field is allowed', r([], withData('MSGFLD'), rec) === null);
  check('an invalid new data field is refused', /OUTFLD/.test(r([], withData('OUTFLD'), rec)));
  check('a missing new data field is refused', /does not exist/.test(r([], withData('NOSUCH'), rec)));
  check('no data field at all is fine', r([], withData(''), rec) === null);
  check('no CHKMSGID at all is fine', r([], [kwd('VALUES', "'A'")], rec) === null);
  check('an UNCHANGED bad data field (hand-written) is never re-reported', r(withData('OUTFLD'), withData('OUTFLD'), rec) === null);
  check('...whatever its case', r(withData('OUTFLD'), withData('outfld'), rec) === null);
  check('changing a bad data field to another bad one is refused', /NOSUCH/.test(r(withData('OUTFLD'), withData('NOSUCH'), rec)));
  check('changing a bad data field to a valid one is allowed', r(withData('OUTFLD'), withData('MSGFLD'), rec) === null);
  check('removing the data field is allowed', r(withData('OUTFLD'), withData(''), rec) === null);
  check('an absent field list fails open', r([], withData('NOSUCH'), undefined) === null && r([], withData('NOSUCH'), null) === null);
}

console.log('\nA3. chkmsgidMsgDataAddReason - the raw editor');
{
  const r = DspfWriter.chkmsgidMsgDataAddReason;
  const rec = [fld('MSGFLD', 'A', 'P'), fld('OUTFLD', 'A', 'O')];
  check('CHKMSGID with a valid &field is allowed', r('CHKMSGID', 'USR1234 USRMSGS &MSGFLD', rec) === null);
  check('CHKMSGID with a bad &field is refused', /OUTFLD/.test(r('CHKMSGID', 'USR1234 USRMSGS &OUTFLD', rec)));
  check('CHKMSGID with a missing &field is refused', /does not exist/.test(r('CHKMSGID', 'USR1234 QGPL/USRMSGS &NOSUCH', rec)));
  check('CHKMSGID with no data field is allowed', r('CHKMSGID', 'USR1234 USRMSGS', rec) === null && r('CHKMSGID', '', rec) === null && r('CHKMSGID', undefined, rec) === null);
  check('any other keyword is never reported', r('DSPATR', '&NOSUCH', rec) === null);
  check('the keyword name is case-insensitive', !!r('chkmsgid', 'A B &OUTFLD', rec));
  check('an absent field list fails open', r('CHKMSGID', 'A B &NOSUCH', undefined) === null);
}

// ===========================================================================
// B. Real generated webview
// ===========================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function source(fieldKeywords) {
  const lines = [
    buildLine({ seq: '00010', nameType: 'R', name: 'REC1' }),
    buildLine({ seq: '00020', name: 'FIELD1', length: '10', dataType: 'A', usage: 'B', line: '4', col: '2' }),
  ];
  fieldKeywords.forEach((t, i) => lines.push(buildLine({ seq: String(21 + i).padStart(5, '0'), func: t })));
  lines.push(buildLine({ seq: '00040', name: 'MSGFLD', length: '12', dataType: 'A', usage: 'P' }));
  lines.push(buildLine({ seq: '00041', name: 'OUTFLD', length: '8', dataType: 'A', usage: 'O', line: '6', col: '2' }));
  lines.push(buildLine({ seq: '00042', name: 'NUMFLD', length: '5', dataType: 'S', decimals: '0', usage: 'P' }));
  return lines.join('\n') + '\n';
}
async function scenario(fieldKeywords, fn) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', source(fieldKeywords), 'CM.DSPF').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  const posted = [], alerts = [], errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
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
    reset: () => { posted.length = 0; alerts.length = 0; },
    lastEdit: () => posted.filter((m) => m.type === 'applyEdit').pop() || null,
    keywordsOf: () => { const e = c.lastEdit(); if (!e) return null; const f = DspfParser.parseDspf(e.text).records[0].fields.find((x) => x.name === 'FIELD1'); return f ? f.keywords : null; },
    select: () => {
      const el = doc.querySelector('.dspf-field[data-field="FIELD1"]');
      el.dispatchEvent(new Ev('click', { bubbles: true }));
      return 'field-' + el.getAttribute('data-source-line');
    },
  };
  await fn(c);
  check('no uncaught errors in this scenario', errors.length === 0);
  dom.window.close();
}
const cm = (k) => k.filter((x) => x.name === 'CHKMSGID');
function applyCm(c, o, msgid, file, data) {
  c.doc.getElementById(o + '-cm-msgid').value = msgid;
  c.doc.getElementById(o + '-cm-msgfile').value = file;
  c.doc.getElementById(o + '-cm-msgdata').value = data;
  c.reset();
  c.click(c.doc.querySelector('.' + o + '-cm-apply'));
}
function addRaw(c, o, name, params) {
  c.doc.getElementById(o + '-new-kw-name').value = name;
  c.doc.getElementById(o + '-new-kw-params').value = params;
  c.reset();
  c.click(c.doc.querySelector('.kw-add[data-owner="' + o + '"]'));
}

async function main() {
  console.log('\nB1. CHKMSGID panel Apply');
  await scenario(["VALUES('A' 'B')"], async (c) => {
    const o = c.select();
    check('setup: the CHKMSGID panel is rendered', !!c.doc.getElementById(o + '-cm-msgdata'));
    applyCm(c, o, 'USR1234', 'USRMSGS', 'MSGFLD');
    check('a valid message data field (character, usage P) is written', c.alerts.length === 0 && cm(c.keywordsOf() || []).length === 1 && /&MSGFLD/.test(cm(c.keywordsOf())[0].parameters));
  });
  await scenario(["VALUES('A' 'B')"], async (c) => {
    const o = c.select();
    applyCm(c, o, 'USR1234', 'USRMSGS', 'msgfld');
    check('the name is matched case-insensitively', c.alerts.length === 0 && cm(c.keywordsOf() || []).length === 1);
  });
  await scenario(["VALUES('A' 'B')"], async (c) => {
    const o = c.select();
    applyCm(c, o, 'USR1234', 'USRMSGS', '');
    check('no message data field at all is unaffected', c.alerts.length === 0 && cm(c.keywordsOf() || []).length === 1);
  });
  await scenario(["VALUES('A' 'B')"], async (c) => {
    const o = c.select();
    applyCm(c, o, 'USR1234', 'USRMSGS', 'NOSUCH');
    check('a field that is not in the record is refused with an alert and no edit', c.alerts.length === 1 && /does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    check('what was typed is still in the boxes (not blanked by a re-render)', c.doc.getElementById(o + '-cm-msgdata').value === 'NOSUCH' && c.doc.getElementById(o + '-cm-msgid').value === 'USR1234');
  });
  await scenario(["VALUES('A' 'B')"], async (c) => {
    const o = c.select();
    applyCm(c, o, 'USR1234', 'USRMSGS', 'OUTFLD');
    check('an output-usage character field is refused, naming the usage', c.alerts.length === 1 && /its usage is O/.test(c.alerts[0]) && c.lastEdit() === null);
    applyCm(c, o, 'USR1234', 'USRMSGS', 'NUMFLD');
    check('a numeric usage-P field is refused, naming the data type', c.alerts.length === 1 && /data type S/.test(c.alerts[0]) && c.lastEdit() === null);
    applyCm(c, o, 'USR1234', 'USRMSGS', 'FIELD1');
    check('the field itself (input/output) is refused', c.alerts.length === 1 && /usage P/.test(c.alerts[0]) && c.lastEdit() === null);
  });

  console.log('\nB2. a hand-written CHKMSGID that already names a bad field');
  await scenario(["VALUES('A' 'B')", 'CHKMSGID(USR1234 USRMSGS &OUTFLD)'], async (c) => {
    const o = c.select();
    check('setup: the panel shows the hand-written &OUTFLD', c.doc.getElementById(o + '-cm-msgdata').value === 'OUTFLD');
    applyCm(c, o, 'USR9999', 'USRMSGS', 'OUTFLD');
    check('changing only the message id is NOT blocked (data field unchanged)', c.alerts.length === 0 && /USR9999/.test((cm(c.keywordsOf() || [])[0] || {}).parameters || ''));
  });
  await scenario(["VALUES('A' 'B')", 'CHKMSGID(USR1234 USRMSGS &OUTFLD)'], async (c) => {
    const o = c.select();
    applyCm(c, o, 'USR1234', 'USRMSGS', 'NOSUCH');
    check('changing it to another bad field is refused', c.alerts.length === 1 && /does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    applyCm(c, o, 'USR1234', 'USRMSGS', 'MSGFLD');
    check('changing it to a valid field is allowed', c.alerts.length === 0 && /&MSGFLD/.test((cm(c.keywordsOf() || [])[0] || {}).parameters || ''));
  });
  await scenario(["VALUES('A' 'B')", 'CHKMSGID(USR1234 USRMSGS &OUTFLD)'], async (c) => {
    const o = c.select();
    applyCm(c, o, 'USR1234', 'USRMSGS', '');
    check('clearing the bad data field is allowed', c.alerts.length === 0 && cm(c.keywordsOf() || []).length === 1 && !/&/.test(cm(c.keywordsOf())[0].parameters));
  });

  console.log('\nB3. raw keyword editor');
  await scenario(["VALUES('A' 'B')"], async (c) => {
    const o = c.select();
    addRaw(c, o, 'CHKMSGID', 'USR1234 USRMSGS &NOSUCH');
    check('CHKMSGID naming a missing field is refused', c.alerts.length === 1 && /does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    addRaw(c, o, 'CHKMSGID', 'USR1234 USRMSGS &OUTFLD');
    check('CHKMSGID naming a non-P field is refused', c.alerts.length === 1 && /its usage is O/.test(c.alerts[0]) && c.lastEdit() === null);
    addRaw(c, o, 'CHKMSGID', 'USR1234 USRMSGS &MSGFLD');
    check('CHKMSGID naming a valid field is added', c.alerts.length === 0 && cm(c.keywordsOf() || []).length === 1);
  });
  await scenario(["VALUES('A' 'B')"], async (c) => {
    const o = c.select();
    addRaw(c, o, 'CHKMSGID', 'USR1234 USRMSGS');
    check('CHKMSGID with no data field is added', c.alerts.length === 0 && cm(c.keywordsOf() || []).length === 1);
  });

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

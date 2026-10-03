/**
 * i153MsgconParameterForm.test.js
 *
 * Task I-153 - MSGCON's other two parameters. The DDS Reference (~line 8922)
 * gives the format MSGCON(length message-ID [library-name/]message-file-name)
 * and says only that the message-ID "specifies the message description",
 * the file name "identifies the message file" and the library is optional.
 * It states no rule for the message ID or for the file / library names, so
 * none is invented (the 7-character form is MSGID's own); what IS stated -
 * three parameters, an optional `library-name/` prefix on the file - is
 * enforced at the same three places I-143 used (add-time, the commitEdit
 * backstop, the constant Add form), diff-based.
 *
 * Run with: node src/test/i153MsgconParameterForm.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const NORM = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const has = (t) => NORM.indexOf(t) !== -1;
const kw = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [] });
const MSG = '20 MSG0001 MSGF';
const f = DspfWriter.msgconStructureProblem;

console.log('1. the facts, against the DDS Reference');
{
  const start = NORM.indexOf('MSGCON (Message Constant) keyword for display files You use this field-level keyword');
  const end = NORM.indexOf('MSGID (Message Identifier) keyword for display files You use this field-level keyword', start);
  const sec = NORM.slice(start, end);
  check('the section is found and bounded', start > 0 && end > start);
  check('the format line states length, message-ID and [library-name/]message-file-name', has('The format of the keyword is: MSGCON(length message-ID [library-name/]message-file-name)'));
  check('the message-ID parameter "specifies the message description"', has('The message-ID parameter specifies the message description that contains the text to use as the value of the constant field.'));
  check('the file parameter "identifies the message file"', has('The message-file-name parameter identifies the message file that contains the message description.'));
  check('"The library-name parameter is optional" (and only that one)', has('The library-name parameter is optional.') && !/message-file-name parameter is optional|message-ID parameter is optional|length parameter is optional/.test(sec));
  check('the MSGCON section states no length, character or format rule for the message ID or the file names', !/seven|characters?\b|\(7\)|alphanumeric|ten \(10\)|10 characters/.test(sec));
  check('the 7-character message-ID form is MSGID\'s own rule (msg-id length seven, prefix three plus four)', has('If you do not specify a prefix, the msg-id length must be seven (7).'));
  check('...and MSGID\'s ten-character file / library lengths are for its &field parameters', has('where the lengths of field1 and field2 are ten (10)'));
  const shape = KeywordSpec.msgconParameterShape();
  check('the spec holds the shape: three parameters, "/" before the file', shape.count === 3 && shape.libraryDelimiter === '/');
  const m = KeywordSpec.RECORD_TYPES.MSGCON.msgconParameters;
  check('the spec records NO message-ID / file-name rule and names the open questions', m.messageIdRule === null && m.fileNameRule === null && m.openQuestions.length === 2);
  check('the shape accessor returns a fresh object', (() => { const a = KeywordSpec.msgconParameterShape(); a.count = 9; return KeywordSpec.msgconParameterShape().count === 3; })());
  check('the length range is untouched', JSON.stringify(KeywordSpec.msgconLengthRange()) === '{"min":1,"max":132}');
}

console.log('\n2. the form (msgconStructureProblem)');
{
  check('length, ID, file is accepted', f(MSG) === null);
  check('length, ID, library/file is accepted', f('20 MSG0001 MESSAGE/MSGF') === null);
  check('tabs and extra blanks are tolerated', f('  20   MSG0001\tMSGF  ') === null && f('20\tMSG0001\tLIB/MSGF') === null);
  ['', '   ', '20', '20 MSG0001', 'MSG0001 MSGF'].forEach((t) => check('"' + t + '" is refused: fewer than three parameters', /MSGCON takes 3 parameters .* and this one has (none|1|2) \(per the DDS Reference\)/.test(f(t) || '')));
  check('a blank text says "none"', /has none/.test(f('')));
  check('the message names the format', /MSGCON\(length message-ID \[library-name\/\]message-file-name\)/.test(f('20')));
  ['20 MSG0001 MSGF EXTRA', '20 MSG 0001 MSGF', '20 MSG0001 LIB / MSGF'].forEach((t) => check('"' + t + '" is refused: more than three', /and this one has [45] /.test(f(t) || '')));
  ['20 MSG0001 /MSGF', '20 MSG0001 LIB/', '20 MSG0001 /', '20 MSG0001 A/B/C', '20 MSG0001 LIB//MSGF'].forEach((t) => check('"' + t + '" is refused: the file must be [library-name/]message-file-name', /message file must be written message-file-name or library-name\/message-file-name \(per the DDS Reference\)/.test(f(t) || '')));
  // No rule is invented where the reference states none.
  ['20 X MSGF', '20 TOOLONGMESSAGEID MSGF', '20 12345 MSGF', '20 CPF0001 MSGF', '20 &FLD MSGF', "20 msg0001 msgf"].forEach((t) => check('"' + t + '" is accepted: no message-ID rule is stated', f(t) === null));
  ['20 MSG0001 AVERYLONGFILENAME', '20 MSG0001 AVERYLONGLIBRARYNAME/MSGF', '20 MSG0001 *LIBL/MSGF', '20 MSG0001 QGPL/QCPFMSG'].forEach((t) => check('"' + t + '" is accepted: no file / library name rule is stated', f(t) === null));
  check('null / undefined count as an empty text', /has none/.test(f(null)) && /has none/.test(f(undefined)));
  check('msgconFullProblem reports the length first, then the form', /1 to 132/.test(DspfWriter.msgconFullProblem('500 MSG0001')) && /takes 3 parameters/.test(DspfWriter.msgconFullProblem('20 MSG0001')) && DspfWriter.msgconFullProblem(MSG) === null);
  check('msgconParamsProblem (length only) is unchanged: a blank text is still "not set"', DspfWriter.msgconParamsProblem('') === null && DspfWriter.msgconParamsProblem('20 MSG0001') === null);
}

console.log('\n3. the panel parser agrees with the form');
{
  const P = DspfWriter.parseMsgConParams;
  check('a valid text is structured, with the library split off', P('20 MSG0001 LIB/MSGF').structured && P('20 MSG0001 LIB/MSGF').library === 'LIB' && P('20 MSG0001 LIB/MSGF').msgFile === 'MSGF');
  check('a bare file is structured with no library', P(MSG).structured && P(MSG).library === '' && P(MSG).msgFile === 'MSGF');
  ['20 MSG0001 /MSGF', '20 MSG0001 A/B/C', '20 MSG0001 LIB/', '20 MSG0001', '20 MSG0001 MSGF X'].forEach((t) => check('"' + t + '" stays unstructured (a raw edit), not silently normalised', P(t).structured === false && P(t).raw === t));
  check('a blank text is still the empty (not yet set) panel state', P('').structured === true && P('').msgFile === '');
  check('formatMsgConParams still returns "" while any of the three is blank', DspfWriter.formatMsgConParams({ length: '20', msgId: '', msgFile: 'MSGF' }) === '' && DspfWriter.formatMsgConParams({ length: '20', msgId: 'M', msgFile: '' }) === '');
}

console.log('\n4. add-time (msgconConflictReason)');
{
  const c = { nameType: 'CONSTANT' };
  const r = (params) => DspfWriter.msgconConflictReason('MSGCON', params, [], c);
  check('a complete MSGCON is allowed', r(MSG) === null && r('20 MSG0001 LIB/MSGF') === null);
  check('a bare MSGCON is now refused', /takes 3 parameters .* has none/.test(r('') || ''));
  check('a two-token MSGCON is refused', /has 2/.test(r('20 MSG0001') || ''));
  check('a bad length is still reported first', /1 to 132/.test(r('0 MSG0001') || ''));
  check('the named-field rule still comes first', /named field/.test(DspfWriter.msgconConflictReason('MSGCON', '', [], { nameType: 'NAMED' })));
  check('the exclusion rule still comes before the form', /cannot be specified on a field with DATE/.test(DspfWriter.msgconConflictReason('MSGCON', '', [kw('DATE')], c)));
  check('other keywords are untouched', DspfWriter.msgconConflictReason('COLOR', '', [], c) === null);
}

console.log('\n5. diff-based backstop (msgconNewConflictReason)');
{
  const g = DspfWriter.msgconNewConflictReason;
  check('a new bare MSGCON is refused', /takes 3 parameters/.test(g([], [kw('MSGCON', '')], 'CONSTANT') || ''));
  check('a new two-token MSGCON is refused', /has 2/.test(g([], [kw('MSGCON', '20 MSG0001')], 'CONSTANT') || ''));
  check('a new library-less, library-qualified or odd-ID MSGCON is accepted', g([], [kw('MSGCON', MSG)], 'CONSTANT') === null && g([], [kw('MSGCON', '9 A LIB/F')], 'CONSTANT') === null);
  check('editing a good MSGCON down to two tokens is refused', /has 2/.test(g([kw('MSGCON', MSG)], [kw('MSGCON', '20 MSG0001')], 'CONSTANT') || ''));
  check('editing the file into a bad slash form is refused', /message file must be written/.test(g([kw('MSGCON', MSG)], [kw('MSGCON', '20 MSG0001 A/B/C')], 'CONSTANT') || ''));
  check('an already-incomplete hand-written MSGCON is not re-reported on an unrelated edit', g([kw('MSGCON', '20 MSG0001')], [kw('MSGCON', '20 MSG0001'), kw('COLOR', 'RED')], 'CONSTANT') === null);
  check('an already-bare hand-written MSGCON is not re-reported either', g([kw('MSGCON', '')], [kw('MSGCON', ''), kw('COLOR', 'RED')], 'CONSTANT') === null);
  check('fixing an incomplete MSGCON is accepted', g([kw('MSGCON', '20 MSG0001')], [kw('MSGCON', MSG)], 'CONSTANT') === null);
  check('removing an incomplete MSGCON is accepted', g([kw('MSGCON', '20 MSG0001')], [], 'CONSTANT') === null);
  check('changing the ID or the file of a good MSGCON is accepted', g([kw('MSGCON', MSG)], [kw('MSGCON', '20 MSG0002 OTHER/MSGF2')], 'CONSTANT') === null);
  check('the length rule is unchanged', /1 to 132/.test(g([kw('MSGCON', MSG)], [kw('MSGCON', '133 MSG0001 MSGF')], 'CONSTANT') || ''));
  check('the exclusion rules are unchanged', /cannot be specified on a field that already has MSGCON/.test(g([kw('MSGCON', MSG)], [kw('MSGCON', MSG), kw('DFT')], 'CONSTANT') || ''));
}

console.log('\n6. the real webview in jsdom');
const SRC = [
  '     A          R RECORD1',
  '     A            F1            10A  B  2  2',
  "     A                                  3  2MSGCON(20 MSG0001 MSGF)",
  "     A                                  5  2'LIT'",
  "     A                                  7  2MSGCON(20 MSG0001)",
].join('\n') + '\n';

function session() {
  const posted = [];
  const alerts = [];
  const html = webviewHtml('vscode-webview://fake', 'n' + Math.random(), SRC, 'I153.DSPF');
  const dom = newWebviewDom(html, {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = (m) => alerts.push(m);
      w.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  const doc = dom.window.document;
  const el = (id) => doc.getElementById(id);
  return {
    posted, alerts, dom, doc, el,
    select(line) { const b = doc.querySelector('.dspf-field[data-source-line="' + line + '"]'); if (!b) return false; b.click(); return true; },
    rawAdd(line, name, params) {
      posted.length = 0; alerts.length = 0;
      el('field-' + line + '-new-kw-name').value = name;
      const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
      doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      return { alert: alerts[0] || null, edited: posted.some((m) => m.type === 'applyEdit') };
    },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let s = session(); await wait(1200);
  s.select(4); let r = s.rawAdd(4, 'MSGCON', MSG);
  check('raw editor: a complete MSGCON is written', r.edited && !r.alert);
  s = session(); await wait(1200);
  s.select(4); r = s.rawAdd(4, 'MSGCON', '20 MSG0001 LIB/MSGF');
  check('raw editor: a library-qualified MSGCON is written', r.edited && !r.alert);
  const bad = [['', /takes 3 parameters .* has none/], ['20 MSG0001', /has 2/], ['20 MSG0001 MSGF EXTRA', /has 4/], ['20 MSG0001 A/B/C', /message file must be written/], ['20 MSG0001 /MSGF', /message file must be written/]];
  for (const [params, re] of bad) {
    s = session(); await wait(1200);
    s.select(4); r = s.rawAdd(4, 'MSGCON', params);
    check('raw editor: MSGCON(' + params + ') is refused, nothing written', !r.edited && re.test(r.alert || ''));
  }

  // a hand-written incomplete MSGCON (line 5) does not block an unrelated edit
  s = session(); await wait(1200);
  s.select(5); r = s.rawAdd(5, 'COLOR', 'RED');
  check('a hand-written two-token MSGCON: an unrelated keyword add still works', r.edited && !r.alert);

  // constant panel Apply (commitEdit): a message ID with a blank, or a slash in the file box
  s = session(); await wait(1200);
  s.select(3);
  check('constant panel shows the MSGCON inputs', !!s.el('p-const-msgcon-msgid') && !!s.el('p-const-msgcon-msgfile') && !!s.el('p-const-msgcon-library'));
  s.posted.length = 0; s.alerts.length = 0;
  s.el('p-const-msgcon-msgid').value = 'MSG 0001';
  s.el('p-apply').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
  check('constant panel Apply with a blank inside the message ID is refused through commitEdit', !s.posted.some((m) => m.type === 'applyEdit') && /takes 3 parameters/.test(s.alerts[0] || ''));
  s.select(3);
  s.posted.length = 0; s.alerts.length = 0;
  s.el('p-const-msgcon-msgfile').value = 'A/B';
  s.el('p-const-msgcon-library').value = 'LIB';
  s.el('p-apply').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
  check('...and a slash in the file box beside a library is refused', !s.posted.some((m) => m.type === 'applyEdit') && /message file must be written/.test(s.alerts[0] || ''));
  s.select(3);
  s.posted.length = 0; s.alerts.length = 0;
  s.el('p-const-msgcon-msgid').value = 'MSG0002';
  s.el('p-const-msgcon-msgfile').value = 'MSGF2';
  s.el('p-const-msgcon-library').value = 'MYLIB';
  s.el('p-apply').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
  const ed = s.posted.find((m) => m.type === 'applyEdit');
  check('...a valid ID, file and library is written', !!ed && /MSGCON\(20 MSG0002 MYLIB\/MSGF2\)/.test(ed.text || '') && s.alerts.length === 0);

  // Add form
  s = session(); await wait(1200);
  s.el('placeConstantBtn').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }));
  s.doc.querySelector('.dspf-screen').dispatchEvent(new s.dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 280 }));
  const kind = s.el('p-place-const-kind');
  check('Add form has the Value source select', !!kind);
  if (kind) {
    kind.value = 'msgcon'; kind.dispatchEvent(new s.dom.window.Event('change', { bubbles: true }));
    const fill = (id, file, lib) => {
      s.el('p-place-msgcon-length').value = '20';
      s.el('p-place-msgcon-msgid').value = id;
      s.el('p-place-msgcon-msgfile').value = file;
      s.el('p-place-msgcon-library').value = lib || '';
    };
    const add = () => { s.posted.length = 0; s.el('p-place-add').dispatchEvent(new s.dom.window.Event('click', { bubbles: true })); };
    fill('MSG 0001', 'MSGF'); add();
    check('Add form: a blank inside the message ID shows the form message and writes nothing', /takes 3 parameters/.test(s.el('p-place-error').textContent) && !s.posted.some((m) => m.type === 'applyEdit'));
    fill('MSG0001', 'A/B', 'LIB'); add();
    check('Add form: a slash in the file box beside a library shows the file-form message and writes nothing', /message file must be written/.test(s.el('p-place-error').textContent) && !s.posted.some((m) => m.type === 'applyEdit'));
    fill('MSG0001', '', ''); add();
    check('Add form: a blank file still shows the existing "enter" message', /Enter the message length, message ID, and message file/.test(s.el('p-place-error').textContent));
    fill('MSG0009', 'MSGF', 'MESSAGE'); add();
    const placed = s.posted.find((m) => m.type === 'applyEdit');
    check('Add form: a valid ID, file and library is written (the form closes)', !!placed && /MSGCON\(20 MSG0009 MESSAGE\/MSGF\)/.test(placed.text || ''));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();

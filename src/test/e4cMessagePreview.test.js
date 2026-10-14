/**
 * e4cMessagePreview.test.js
 *
 * E4c - the preview shows the text of the messages ERRMSGID, SFLMSGID and MSGID name.
 *
 * Verifies:
 *  1. keyword parsing, the store keys, the &1 / &2 substitution and which messages the host is asked for.
 *  2. the message line: IBM's priority (ERRMSG, ERRMSGID, SFLMSG, SFLMSGID), the first one in effect, MSGLOC and the
 *     last line, a window's own line and *NOMSGLIN, SFLDSP gating, a text that is not known (ID and reason shown),
 *     truncation, one display message line in a multi-record view.
 *  3. a MSGID field: the text in the field cut or padded to its length, ID and file from stored field values, *NONE.
 *  4. the program fields the keywords name (the simulator's editor) and the E3f `messageData` namespace.
 *  5. CHKMSGID is not drawn and not asked for; packaging (messageFile.js is copied to dist).
 *  6. the real webview: it asks for the texts, draws the answer, keeps the values in the store, asks again on connect.
 *
 * Run with: node src/test/e4cMessagePreview.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const IndicatorSim = require(path.join(__dirname, '../indicatorSim.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const F = (name, line, use, len) => dds({ name, len: len || 10, type: 'A', use: use || 'B', line, col: 2 });
const P = (name, len) => dds({ name, len: len || 20, type: 'A', use: 'P' });
const src = (lines) => lines.join('\n') + '\n';
const txt = (id, file, text) => ({ [DspfEngine.messageTextKey(id, file)]: { ok: true, text } });
const screen = (model, rec, on) => DspfEngine.resolveScreen(model, rec, new Set(on || []));

(async function main() {

console.log('\n1. parsing, keys, substitution, references');
{
  const parts = DspfEngine.messageIdKeywordParts('USR0001 QGPL/APPMSG 40 &MSGDTA');
  check('ERRMSGID parts: id, file, response indicator, msg-data field', parts.id === 'USR0001' && parts.file === 'QGPL/APPMSG' && parts.responseIndicator === '40' && parts.dataField === 'MSGDTA');
  const bare = DspfEngine.messageIdKeywordParts('USR0001 APPMSG');
  check('only id and file: the rest is empty', bare.id === 'USR0001' && bare.file === 'APPMSG' && bare.dataField === '' && bare.responseIndicator === '');
  check('the data field alone after the file', DspfEngine.messageIdKeywordParts('USR0001 APPMSG &D1').dataField === 'D1');
  check('the key is upper case and *LIBL is explicit', DspfEngine.messageTextKey('usr0001', 'appmsg') === '*LIBL/APPMSG:USR0001' && DspfEngine.messageTextKey('USR0001', 'qgpl/appmsg') === 'QGPL/APPMSG:USR0001');
  check('the data key is RECORD|FIELD upper case and tolerates a leading &', DspfEngine.messageDataKey('rec1', '&msgdta') === 'REC1|MSGDTA');
  check('&1 &2 are filled from values separated by |', DspfEngine.substituteMessageData('Customer &1 in &2', 'C1|Pune') === 'Customer C1 in Pune');
  check('an &n with no value stays as written', DspfEngine.substituteMessageData('A &1 B &2', 'x') === 'A x B &2');
  check('no stored value leaves the text alone', DspfEngine.substituteMessageData('A &1', undefined) === 'A &1' && DspfEngine.substituteMessageData('A &1', '') === 'A &1');
  check('&10 is read as ten, not &1 followed by 0', DspfEngine.substituteMessageData('&10', 'a|b|c|d|e|f|g|h|i|j') === 'j');
  const vals = { [DspfEngine.messageDataKey('R1', 'ID')]: '0003', [DspfEngine.messageDataKey('R1', 'MF')]: 'appmsg', [DspfEngine.messageDataKey('R1', 'LB')]: 'applib' };
  const r1 = DspfEngine.resolveMsgidParameters('USR &ID APPMSG', 'R1', vals);
  check('MSGID prefix + &field: USR + 0003, file as written', r1 && r1.id === 'USR0003' && r1.file === 'APPMSG');
  const r2 = DspfEngine.resolveMsgidParameters('&ID &LB/&MF', 'R1', { [DspfEngine.messageDataKey('R1', 'ID')]: 'USR0003', [DspfEngine.messageDataKey('R1', 'LB')]: 'applib', [DspfEngine.messageDataKey('R1', 'MF')]: 'appmsg' });
  check('MSGID with the library and file both from fields', r2 && r2.id === 'USR0003' && r2.file === 'APPLIB/APPMSG');
  check('a named field with no value: not resolved (null), nothing guessed', DspfEngine.resolveMsgidParameters('USR &ID APPMSG', 'R1', {}) === null);
  check('MSGID(*NONE) is its own answer', DspfEngine.resolveMsgidParameters('*NONE', 'R1', {}).none === true);
  check('malformed MSGID parameters are null, not an exception', DspfEngine.resolveMsgidParameters('', 'R1', {}) === null && DspfEngine.resolveMsgidParameters('A B C D', 'R1', {}) === null);

  const model = DspfParser.parseDspf(src([
    dds({ t: 'R', name: 'R1' }), dds({ ind: ' 40', fn: 'ERRMSGID(USR0001 L1/APPMSG)' }), dds({ fn: 'ERRMSGID(USR0001 L1/APPMSG)' }),
    F('F1', 3, 'B'), dds({ name: 'MSGFLD', len: 30, type: 'A', use: 'O', line: 5, col: 2, fn: 'MSGID(USR &ID APPMSG)' }), P('ID', 4),
    dds({ t: 'R', name: 'R2' }), dds({ fn: 'SFLMSGID(USR0009 APPMSG)' }), F('F2', 2, 'O'),
    dds({ t: 'R', name: 'R3' }), F('F3', 2, 'B', 5), dds({ fn: 'CHECK(VN)' }), dds({ fn: 'CHKMSGID(USR0007 APPMSG)' }),
  ]));
  const refs = DspfEngine.messageReferences(model);
  check('the host is asked once per message (two ERRMSGID of the same id and file are one)', refs.filter((r) => r.key === 'L1/APPMSG:USR0001').length === 1);
  check('SFLMSGID is asked for', refs.some((r) => r.key === '*LIBL/APPMSG:USR0009'));
  check('a MSGID that names a field with no stored value is not asked for', !refs.some((r) => /USR0003|USR$/.test(r.key)));
  check('CHKMSGID is asked for (E4d text line) but draws no message line', refs.some((r) => r.id === 'USR0007'));
  model.messageDataValues = { [DspfEngine.messageDataKey('R1', 'ID')]: '0003' };
  check('once the field has a value its message is asked for', DspfEngine.messageReferences(model).some((r) => r.key === '*LIBL/APPMSG:USR0003'));
  check('each reference carries key, id and message file', refs.every((r) => r.key && r.id && r.msgf));
  check('no file at all: no references', DspfEngine.messageReferences({ records: [] }).length === 0 && DspfEngine.messageReferences(null).length === 0);
}

console.log('\n2. the message line');
{
  const model = DspfParser.parseDspf(src([
    dds({ fn: 'MSGLOC(22)' }),
    dds({ t: 'R', name: 'REC1' }),
    dds({ ind: ' 40', fn: 'ERRMSGID(USR0001 L1/APPMSG &MSGDTA)' }),
    P('MSGDTA', 50), F('FLD1', 5, 'B'),
    dds({ t: 'R', name: 'REC2', fn: 'WINDOW(4 10 8 40)' }), dds({ ind: ' 41', fn: 'ERRMSGID(USR0002 APPMSG)' }), F('F2', 2, 'B'),
    dds({ t: 'R', name: 'REC3', fn: 'WINDOW(4 10 8 40 *NOMSGLIN)' }), dds({ ind: ' 41', fn: 'ERRMSGID(USR0002 APPMSG)' }), F('F3', 2, 'B'),
  ]));
  model.messageTexts = Object.assign({}, txt('USR0001', 'L1/APPMSG', 'Customer &1 not found, code &2'), txt('USR0002', 'APPMSG', 'Window message'));
  model.messageDataValues = { [DspfEngine.messageDataKey('REC1', 'MSGDTA')]: 'C1234|x' };
  const on = screen(model, 'REC1', ['40']).errorMessage;
  check('ERRMSGID text is drawn with &1 &2 from the stored values', on && on.text === 'Customer C1234 not found, code x' && on.keyword === 'ERRMSGID');
  check('MSGLOC(22) puts it on line 22, from column 1, across the display', on.line === 22 && on.col === 1 && on.width === 80 && on.inWindow === false);
  check('with the option indicator off nothing is drawn', screen(model, 'REC1', []).errorMessage === null);
  const w = screen(model, 'REC2', ['41']);
  check('a window keeps its own reserved line: its last row, its own width', w.errorMessage && w.errorMessage.inWindow === true && w.errorMessage.line === w.window.line + w.window.height - 1 && w.errorMessage.width === w.window.width && w.errorMessage.text === 'Window message');
  const n = screen(model, 'REC3', ['41']);
  check('*NOMSGLIN: the display message line, not the window', n.errorMessage && n.errorMessage.inWindow === false && n.errorMessage.line === 22 && n.errorMessage.col === 1);
  check('text longer than the line is cut to its width', (() => { const m = DspfParser.parseDspf(src([dds({ t: 'R', name: 'R1', fn: 'WINDOW(2 2 5 10)' }), dds({ fn: 'ERRMSGID(USR0001 L1/APPMSG)' }), F('F1', 1)])); m.messageTexts = txt('USR0001', 'L1/APPMSG', 'This message is far too long'); return screen(m, 'R1').errorMessage.text === 'This messa'; })());

  const bare = DspfParser.parseDspf(src([dds({ t: 'R', name: 'R1' }), dds({ fn: 'ERRMSGID(USR0001 APPMSG)' }), F('F1', 2)]));
  bare.messageTexts = txt('USR0001', 'APPMSG', 'x');
  check('no MSGLOC: the last display line (24)', screen(bare, 'R1').errorMessage.line === 24);
  const big = DspfParser.parseDspf(src([dds({ fn: 'DSPSIZ(27 132 *DS4)' }), dds({ t: 'R', name: 'R1' }), dds({ fn: 'ERRMSGID(USR0001 APPMSG)' }), F('F1', 2)]));
  big.messageTexts = txt('USR0001', 'APPMSG', 'x');
  const bs = screen(big, 'R1').errorMessage;
  check('a 27 x 132 display: line 27, 132 wide', bs.line === 27 && bs.width === 132);
  const past = DspfParser.parseDspf(src([dds({ fn: 'MSGLOC(28)' }), dds({ t: 'R', name: 'R1' }), dds({ fn: 'ERRMSGID(USR0001 APPMSG)' }), F('F1', 2)]));
  past.messageTexts = txt('USR0001', 'APPMSG', 'x');
  check('MSGLOC past the last line (28 on a 24 line display) is the last line', screen(past, 'R1').errorMessage.line === 24);

  const unk = JSON.parse(JSON.stringify(model)); unk.messageTexts = {};
  const u = screen(unk, 'REC1', ['40']).errorMessage;
  check('no text yet: the line shows the ID and file and says why', u.unresolved === true && /^USR0001 L1\/APPMSG - text unavailable \(not loaded yet\)$/.test(u.text) && u.reason === 'not loaded yet');
  [['not-connected', 'not connected'], ['not-found', 'not found'], ['unsupported', 'not supported on this release'], ['error', 'lookup failed']].forEach(([code, reason]) => {
    unk.messageTexts = { [DspfEngine.messageTextKey('USR0001', 'L1/APPMSG')]: { ok: false, code, error: 'x' } };
    const e = screen(unk, 'REC1', ['40']).errorMessage;
    check('a ' + code + ' answer: "' + reason + '"', e.unresolved && e.reason === reason && e.text.indexOf('(' + reason + ')') !== -1);
  });

  // priority
  const pri = DspfParser.parseDspf(src([
    dds({ t: 'R', name: 'CTL' }), dds({ fn: 'SFLCTL(SFL1)' }), dds({ fn: 'SFLDSP' }), dds({ fn: 'SFLDSPCTL' }), dds({ fn: 'SFLSIZ(10)' }), dds({ fn: 'SFLPAG(5)' }),
    dds({ ind: ' 01', fn: 'SFLMSGID(USR0004 APPMSG)' }), dds({ ind: ' 02', fn: "SFLMSG('sfl text')" }),
    dds({ ind: ' 03', fn: 'ERRMSGID(USR0005 APPMSG)' }), dds({ ind: ' 04', fn: "ERRMSG('plain')" }),
    F('CF1', 2, 'O'),
  ]));
  pri.messageTexts = Object.assign({}, txt('USR0004', 'APPMSG', 'sflid'), txt('USR0005', 'APPMSG', 'errid'));
  const kw = (on) => { const m = screen(pri, 'CTL', on).errorMessage; return m ? m.keyword : null; };
  check('only SFLMSGID in effect: SFLMSGID', kw(['01']) === 'SFLMSGID');
  check('SFLMSG beats SFLMSGID', kw(['01', '02']) === 'SFLMSG');
  check('ERRMSGID beats SFLMSG', kw(['01', '02', '03']) === 'ERRMSGID');
  check('ERRMSG beats ERRMSGID', kw(['01', '02', '03', '04']) === 'ERRMSG');
  check('nothing in effect: no message', kw([]) === null);

  const gate = DspfParser.parseDspf(src([
    dds({ t: 'R', name: 'CTL' }), dds({ fn: 'SFLCTL(SFL1)' }), dds({ ind: ' 05', fn: 'SFLDSP' }), dds({ fn: 'SFLSIZ(10)' }), dds({ fn: 'SFLPAG(5)' }),
    dds({ fn: 'SFLMSGID(USR0004 APPMSG)' }), F('CF1', 2, 'O'),
  ]));
  gate.messageTexts = txt('USR0004', 'APPMSG', 'sflid');
  check('SFLMSGID needs SFLDSP in effect: off, no message', screen(gate, 'CTL', []).errorMessage === null);
  check('SFLDSP on: the message is drawn', screen(gate, 'CTL', ['05']).errorMessage && screen(gate, 'CTL', ['05']).errorMessage.text === 'sflid');

  const two = DspfParser.parseDspf(src([
    dds({ t: 'R', name: 'R1' }), dds({ fn: 'ERRMSGID(USR0001 APPMSG)' }), F('F1', 2),
    dds({ t: 'R', name: 'R2' }), dds({ fn: 'ERRMSGID(USR0002 APPMSG)' }), F('F2', 3),
  ]));
  two.messageTexts = Object.assign({}, txt('USR0001', 'APPMSG', 'first'), txt('USR0002', 'APPMSG', 'second'));
  const multi = DspfEngine.resolveMultiScreen(two, ['R1', 'R2'], new Set());
  check('two records on one display share ONE message line: the topmost record\'s', multi.errorMessages.length === 1 && multi.errorMessages[0].text === 'second');

  const fieldFirst = DspfParser.parseDspf(src([
    dds({ t: 'R', name: 'R1' }), F('A1', 2), dds({ fn: 'ERRMSGID(USR0001 APPMSG)' }), F('A2', 3), dds({ fn: 'ERRMSGID(USR0002 APPMSG)' }),
  ]));
  fieldFirst.messageTexts = Object.assign({}, txt('USR0001', 'APPMSG', 'one'), txt('USR0002', 'APPMSG', 'two'));
  check('of the same keyword the first field in source order wins', screen(fieldFirst, 'R1').errorMessage.text === 'one');
  unk.messageTexts = {};
  const html = DspfEngine.renderScreenHtml(screen(unk, 'REC1', ['40']));
  check('the rendered line is marked unresolved with the reason in its title, and as the display line', /dspf-msgline-unresolved/.test(html) && /text unavailable: not loaded yet/.test(html) && /dspf-display-msgline/.test(html));
}

console.log('\n3. a MSGID field');
{
  const key = (f) => DspfEngine.messageDataKey('R1', f);
  const model = DspfParser.parseDspf(src([
    dds({ t: 'R', name: 'R1' }),
    dds({ name: 'MSGFLD', len: 20, type: 'A', use: 'O', line: 5, col: 2, fn: 'MSGID(USR &ID APPMSG)' }), P('ID', 4),
    dds({ name: 'FIXED', len: 8, type: 'A', use: 'O', line: 6, col: 2, fn: 'MSGID(USR0010 L1/APPMSG)' }),
    dds({ name: 'GONE', len: 8, type: 'A', use: 'O', line: 7, col: 2, fn: 'MSGID(*NONE)' }),
    dds({ name: 'INONLY', len: 8, type: 'A', use: 'I', line: 8, col: 2, fn: 'MSGID(USR0010 APPMSG)' }),
  ]));
  model.messageTexts = Object.assign({}, txt('USR0003', 'APPMSG', 'From the ID field'), txt('USR0010', 'L1/APPMSG', 'A message longer than eight'), txt('USR0010', 'APPMSG', 'x'));
  const text = (name) => screen(model, 'R1').fields.find((f) => f.name === name).text;
  check('a field-sourced ID with no stored value: the field shows its name as before', /^MSGFLDX+$/.test(text('MSGFLD')));
  model.messageDataValues = { [key('ID')]: '0003' };
  check('with the stored ID the text is drawn, padded to the field length', text('MSGFLD') === 'From the ID field   ' && text('MSGFLD').length === 20);
  check('text longer than the field is cut to the field length', text('FIXED') === 'A messag' && text('FIXED').length === 8);
  check('MSGID(*NONE): blanks, "no message text is to be displayed"', text('GONE') === '        ');
  check('an input-only field is not a MSGID field (must be B or O): name as before', /^INONLYX*$/.test(text('INONLY')));
  const unkn = JSON.parse(JSON.stringify(model)); unkn.messageTexts = {};
  check('no text for the ID: the name as before (no error text in a field)', /^FIXEDX+$/.test(screen(unkn, 'R1').fields.find((f) => f.name === 'FIXED').text));
  const cond = DspfParser.parseDspf(src([dds({ t: 'R', name: 'R1' }), dds({ name: 'M', len: 12, type: 'A', use: 'O', line: 2, col: 2 }), dds({ ind: ' 01', fn: 'MSGID(USR0010 APPMSG)' }), dds({ ind: 'N01', fn: 'MSGID(USR0011 APPMSG)' })]));
  cond.messageTexts = Object.assign({}, txt('USR0010', 'APPMSG', 'ten'), txt('USR0011', 'APPMSG', 'eleven'));
  const cm = (on) => screen(cond, 'R1', on).fields[0].text.trim();
  check('several MSGID: the first one in effect is used (01 on: ten, 01 off: eleven)', cm(['01']) === 'ten' && cm([]) === 'eleven');
}

console.log('\n4. the program fields and the store');
{
  const model = DspfParser.parseDspf(src([
    dds({ t: 'R', name: 'R1' }), dds({ fn: 'ERRMSGID(USR0001 APPMSG &MD1)' }), P('MD1', 30),
    dds({ name: 'MSGFLD', len: 20, type: 'A', use: 'O', line: 5, col: 2, fn: 'MSGID(&ID &LB/&MF)' }),
    P('ID', 7), P('LB', 10), P('MF', 10),
  ]));
  const f = DspfEngine.messageDataFields(model.records[0]);
  check('the msg-data field, then the ID, library and file fields, each once, in source order', f.map((x) => x.name + ':' + x.role).join() === 'MD1:data,ID:id,LB:file,MF:file');
  check('each carries its keyword and a hint', f.every((x) => x.keyword && x.hint));
  check('a record with no message keyword names no fields', DspfEngine.messageDataFields(DspfParser.parseDspf(src([dds({ t: 'R', name: 'R1' }), F('F1', 2)])).records[0]).length === 0 && DspfEngine.messageDataFields(null).length === 0);

  const k = DspfEngine.messageDataKey('R1', 'MD1');
  let v = IndicatorSim.setValue({}, 'messageData', k, 'C1|x');
  check('the namespace takes text', v.ok && IndicatorSim.getValue(v.values, 'messageData', k) === 'C1|x');
  check('256 characters is the most', IndicatorSim.setValue({}, 'messageData', k, 'x'.repeat(256)).ok && !IndicatorSim.setValue({}, 'messageData', k, 'x'.repeat(257)).ok);
  check('a key that is not RECORD|FIELD is refused', !IndicatorSim.setValue({}, 'messageData', 'nopipe', 'x').ok);
  check('an empty value removes it', IndicatorSim.getValue(IndicatorSim.setValue(v.values, 'messageData', k, '').values, 'messageData', k) === undefined);
  check('a number is not text: refused', !IndicatorSim.setValue({}, 'messageData', k, 5).ok);
  const norm = IndicatorSim.normalizeValues({ messageData: { [k]: 'ok', bad: 'x', 'A|B': 5 } });
  check('loading drops a bad key and a bad value, keeps the good one', Object.keys(norm.messageData).join() === k);
  check('it is named readably in the stored-values list', IndicatorSim.describeValueKey('messageData', k) === 'R1.MD1 (message value)');
  check('and listed with its label', IndicatorSim.valueRows(v.values).some((r) => r.namespace === 'messageData' && /Message keyword/.test(r.label)));
  check('the engine reads the namespace as a plain { key: value } map', IndicatorSim.namespaceValues(v.values, 'messageData')[k] === 'C1|x');
}

console.log('\n5. not drawn, packaging');
{
  const chk = DspfParser.parseDspf(src([dds({ t: 'R', name: 'R1' }), F('F1', 2, 'B', 5), dds({ fn: 'CHECK(VN)' }), dds({ fn: 'CHKMSGID(USR0007 APPMSG)' })]));
  chk.messageTexts = txt('USR0007', 'APPMSG', 'bad value');
  const s = screen(chk, 'R1');
  check('CHKMSGID draws no message line and changes no field text', s.errorMessage === null && /^F1X+$/.test(s.fields[0].text));
  const pkg = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
  check('messageFile.js is in the list of modules copied to dist (the extension requires it from there)', /'messageFile\.js'/.test(pkg));
  check('and it is there after a compile', fs.existsSync(path.join(__dirname, '../../dist/messageFile.js')));
  const ext = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
  check('the host answers requestMessageTexts and posts messageTexts', /msg\.type === 'requestMessageTexts'/.test(ext) && /type: 'messageTexts'/.test(ext));
  check('the host caps what it looks up at one request', /slice\(0, 200\)/.test(ext));
}

console.log('\n6. the real webview');
{
  const posted = [];
  const SRC = src([
    dds({ t: 'R', name: 'RECORD1' }), dds({ fn: 'ERRMSGID(USR0001 APPMSG &MD1)' }), P('MD1', 30),
    dds({ name: 'FLD1', len: 10, type: 'A', use: 'B', line: 3, col: 2 }),
  ]);
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'n1', SRC, 'E4C.DSPF'), {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = () => {};
      w.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
    },
  });
  await new Promise((res) => setTimeout(res, 1200));
  const win = dom.window, doc = win.document;
  const send = (data) => win.dispatchEvent(new win.MessageEvent('message', { data }));
  const asks = () => posted.filter((m) => m.type === 'requestMessageTexts');
  check('the page asks the host for the message the keyword names, once', asks().length === 1 && asks()[0].refs.length === 1 && asks()[0].refs[0].key === '*LIBL/APPMSG:USR0001' && asks()[0].refs[0].id === 'USR0001' && asks()[0].refs[0].msgf === 'APPMSG');
  send({ type: 'simulatorState', scenarios: [], values: {} });
  check('a re-render does not ask again', asks().length === 1);

  // the indicator that conditions nothing here: the keyword is unconditioned, so the line shows at once
  const line = () => doc.querySelector('.dspf-window-msgline');
  check('before the answer: the line shows the ID, the file and "not loaded yet"', line() && /USR0001 APPMSG - text unavailable \(not loaded yet\)/.test(line().textContent) && line().classList.contains('dspf-msgline-unresolved'));
  send({ type: 'messageTexts', entries: [{ key: '*LIBL/APPMSG:USR0001', ok: true, text: 'Customer &1 not found' }] });
  check('after the answer the line shows the message text', line() && line().textContent === 'Customer &1 not found' && !line().classList.contains('dspf-msgline-unresolved'));
  check('it is on the display\'s message line (the last row), not in a window', line().classList.contains('dspf-display-msgline') && /grid-row:24/.test(line().getAttribute('style')));

  const input = doc.querySelector('.sim-message-input');
  check('the simulator panel offers the msg-data field as a text box', !!input && input.getAttribute('data-key') === 'RECORD1|MD1' && input.maxLength === 256);
  if (input) {
    input.value = 'C1234';
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('typing a value shows it in the message', line().textContent === 'Customer C1234 not found');
    const saved = posted.filter((m) => m.type === 'saveSimulatorState').pop();
    check('and stores it in the file\'s state (the DDS source is not touched)', saved && saved.values.messageData && saved.values.messageData['RECORD1|MD1'] === 'C1234' && !posted.some((m) => m.type === 'applyEdit'));
  }

  send({ type: 'messageTexts', entries: [{ key: '*LIBL/APPMSG:USR0001', ok: false, code: 'not-connected', error: 'Not connected to an IBM i.' }] });
  check('a not-connected answer shows the reason on the line', /text unavailable \(not connected\)/.test(line().textContent));
  const before = asks().length;
  send({ type: 'codeForIStatus', installed: true, connected: false });
  check('still not connected: nothing is asked again', asks().length === before);
  send({ type: 'codeForIStatus', installed: true, connected: true });
  check('connecting asks for the messages that could not be read', asks().length === before + 1 && asks()[asks().length - 1].refs[0].key === '*LIBL/APPMSG:USR0001');
  send({ type: 'codeForIStatus', installed: true, connected: true });
  check('the next status poll does not ask again', asks().length === before + 1);
  dom.window.close();
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);
})();

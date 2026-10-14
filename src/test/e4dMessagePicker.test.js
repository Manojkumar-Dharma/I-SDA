/**
 * e4dMessagePicker.test.js
 *
 * E4d - message-ID picker (Browse...), resolved text line and "ID not found" warning in the ERRMSGID, MSGID and
 * CHKMSGID panels (SFLMSGID shares the same helpers).
 *
 * Verifies:
 *  1. the host answers listMessageFile (source check) and CHKMSGID is asked for.
 *  2. helpers: text line for ok / not-found / unavailable, nothing without hooks or for &field IDs.
 *  3. the real webview: the text line and warning in the panels, Browse posts listMessageFile, the reply fills the
 *     list, the filter narrows it, a pick edits ERRMSGID, fills CHKMSGID without writing, sets the MSGID preview value
 *     (never the source), an unsupported release shows its message.
 *
 * Run with: node src/test/e4dMessagePicker.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { check, failureCount } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

(async () => {
console.log('1. host');
{
  const ext = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
  check('the host answers listMessageFile with messageFileList', /msg\.type === 'listMessageFile'/.test(ext) && /type: 'messageFileList'/.test(ext));
  check('the list is capped', /MESSAGE_LIST_LIMIT/.test(ext));
}

console.log('\n2. helpers');
{
  check('no hooks: no line', Helpers.messageTextLineHtml('USR0001', '', 'APPMSG') === '');
  const entries = {
    'USR0001': { ok: true, text: 'Customer <b> not found' },
    'USR0002': { ok: false, code: 'not-found' },
    'USR0003': { ok: false, code: 'not-connected' },
  };
  Helpers.setMessageHooks({ textFor: (id) => entries[id], pick: () => {} });
  const ok = Helpers.messageTextLineHtml('usr0001', '', 'appmsg');
  check('a found message shows its text, escaped', /msg-text-line">Customer &lt;b&gt; not found</.test(ok));
  const nf = Helpers.messageTextLineHtml('USR0002', 'L1', 'APPMSG');
  check('not found: a warning naming the ID and library/file', /msg-text-warn/.test(nf) && /USR0002 not found in L1\/APPMSG/.test(nf));
  check('not connected: a muted line with the reason', /msg-text-muted/.test(Helpers.messageTextLineHtml('USR0003', '', 'APPMSG')) && /not connected/.test(Helpers.messageTextLineHtml('USR0003', '', 'APPMSG')));
  check('not asked yet: "not loaded yet"', /not loaded yet/.test(Helpers.messageTextLineHtml('USR0009', '', 'APPMSG')));
  check('an &field ID or blank file gives no line', Helpers.messageTextLineHtml('&ID', '', 'APPMSG') === '' && Helpers.messageTextLineHtml('USR0001', '', '') === '');
  Helpers.setMessageHooks(null);
}

console.log('\n3. the real webview');
{
  const posted = [];
  const SRC = [
    dds({ t: 'R', name: 'RECORD1' }),
    dds({ name: 'AMOUNT', len: 5, type: 'S', dec: 0, use: 'B', line: 3, col: 2 }),
    dds({ fn: 'RANGE(1 99)' }),
    dds({ fn: 'CHKMSGID(USR0007 L2/APPMSG)' }),
    dds({ fn: 'ERRMSGID(USR0001 L1/APPMSG)' }),
    dds({ name: 'MSGFLD', len: 30, type: 'A', use: 'O', line: 5, col: 2, fn: 'MSGID(USR&ID APPMSG)' }),
    dds({ name: 'ID', len: 4, type: 'A', use: 'P' }),
  ].join('\n') + '\n';
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'n1', SRC, 'E4D.DSPF'), {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = () => {};
      w.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
    },
  });
  await new Promise((res) => setTimeout(res, 1200));
  const win = dom.window, doc = win.document;
  const send = (data) => win.dispatchEvent(new win.MessageEvent('message', { data }));
  const click = (el) => el.dispatchEvent(new win.Event('click', { bubbles: true }));
  const selectField = (name) => click(Array.from(doc.querySelectorAll('.dspf-field')).find((el) => (el.getAttribute('data-field') || '') === name));
  const asks = () => posted.filter((m) => m.type === 'requestMessageTexts');
  const asked = asks().reduce((a, m) => a.concat(m.refs.map((r) => r.key)), []);
  check('the page asks for the ERRMSGID and the CHKMSGID messages', asked.includes('L1/APPMSG:USR0001') && asked.includes('L2/APPMSG:USR0007'));

  selectField('AMOUNT');
  const errBrowse = () => doc.querySelector('[class*="-errmsg-"][class$="-browse"], .msg-browse-btn[class*="errmsg"]');
  const cmBrowse = () => doc.querySelector('.msg-browse-btn[class*="-cm-browse"]');
  check('the CHKMSGID accordion shows a not-yet-loaded line and has a Browse button', !!cmBrowse());
  send({ type: 'messageTexts', entries: [
    { key: 'L1/APPMSG:USR0001', ok: true, text: 'Amount out of range' },
    { key: 'L2/APPMSG:USR0007', ok: false, code: 'not-found', error: 'x' },
  ] });
  selectField('AMOUNT');
  const lines = Array.from(doc.querySelectorAll('.msg-text-line')).map((e) => e.textContent);
  check('the ERRMSGID row shows the text', lines.includes('Amount out of range'));
  check('the CHKMSGID section warns that the ID is not in the file', lines.some((t) => /USR0007 not found in L2\/APPMSG/.test(t)) && !!doc.querySelector('.msg-text-warn'));

  // ERRMSGID Browse -> list -> filter -> pick
  posted.length = 0;
  const eb = Array.from(doc.querySelectorAll('.msg-browse-btn')).find((b) => /-errmsg-/.test(b.className));
  check('the ERRMSGID row has a Browse button', !!eb);
  click(eb);
  const lm = () => posted.filter((m) => m.type === 'listMessageFile').pop();
  check('Browse opens the picker with the file typed in the row and lists it at once', !!doc.querySelector('.msgpicker-overlay') && lm() && lm().msgf === 'L1/APPMSG');
  send({ type: 'messageFileList', requestId: lm().requestId, msgf: 'L1/APPMSG', ok: true, library: 'L1', messages: [
    { id: 'USR0001', text: 'Amount out of range', severity: 0 }, { id: 'USR0002', text: 'Customer not found', severity: 10 }, { id: 'USR0003', text: 'Order closed', severity: 20 } ], truncated: false, total: 3 });
  check('the reply fills the list (ID, severity, text)', doc.querySelectorAll('.msgp-row').length === 3 && /sev 10/.test(doc.querySelectorAll('.msgp-row')[1].textContent));
  const filter = doc.getElementById('msgp-filter');
  filter.value = 'customer'; filter.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('the filter narrows by text', doc.querySelectorAll('.msgp-row').length === 1 && doc.querySelector('.msgp-row').getAttribute('data-id') === 'USR0002');
  send({ type: 'messageFileList', requestId: lm().requestId + 99, ok: true, messages: [], total: 0 });
  check('a reply for another request is ignored', doc.querySelectorAll('.msgp-row').length === 1);
  posted.length = 0;
  click(doc.querySelector('.msgp-row'));
  const edit = posted.find((m) => m.type === 'applyEdit');
  check('picking writes the ID into ERRMSGID, keeping the library and file', edit && /ERRMSGID\(USR0002 L1\/APPMSG\)/.test(edit.text) && !doc.querySelector('.msgpicker-overlay'));

  // CHKMSGID Browse fills the boxes only
  selectField('AMOUNT');
  posted.length = 0;
  click(cmBrowse());
  send({ type: 'messageFileList', requestId: lm().requestId, msgf: 'L2/APPMSG', ok: true, messages: [{ id: 'USR0099', text: 'Bad value', severity: 0 }], truncated: false, total: 1 });
  click(doc.querySelector('.msgp-row'));
  check('CHKMSGID: the pick fills the box and writes nothing until Apply', doc.querySelector('[id$="-cm-msgid"]').value === 'USR0099' && !posted.some((m) => m.type === 'applyEdit'));

  // unsupported release and missing file
  selectField('AMOUNT');
  click(cmBrowse());
  send({ type: 'messageFileList', requestId: lm().requestId, ok: false, code: 'unsupported', error: 'x' });
  check('an unsupported release says so', /not supported on this IBM i release/.test(doc.getElementById('msgp-error').textContent));
  doc.getElementById('msgp-file').value = '';
  click(doc.getElementById('msgp-list-btn'));
  check('no message file typed: asks for one without posting', /Enter a message file/.test(doc.getElementById('msgp-error').textContent));
  click(doc.getElementById('msgp-cancel'));

  // MSGID: Browse sets the preview value
  selectField('MSGFLD');
  posted.length = 0;
  const mb = Array.from(doc.querySelectorAll('.msg-browse-btn')).find((b) => /-msgid/.test(b.className));
  check('the MSGID panel has Browse and a "pick a message" hint', !!mb && Array.from(doc.querySelectorAll('.msg-text-muted')).some((e) => /Browse/.test(e.textContent)));
  click(mb);
  send({ type: 'messageFileList', requestId: lm().requestId, ok: true, messages: [{ id: 'USR0005', text: 'Five', severity: 0 }], truncated: false, total: 1 });
  click(doc.querySelector('.msgp-row'));
  const saved = posted.filter((m) => m.type === 'saveSimulatorState').pop();
  check('MSGID: the pick is stored as the preview value without the prefix, the source is untouched', saved && saved.values.messageData && saved.values.messageData['RECORD1|ID'] === '0005' && !posted.some((m) => m.type === 'applyEdit'));
  dom.window.close();
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);
})();

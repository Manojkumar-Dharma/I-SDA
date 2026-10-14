/**
 * e4fMessageFiles.test.js
 *
 * E4f - the isda.messageFiles setting and the "not connected" state of the message panels.
 *  1. setting: declared in package.json; parsed (names, order, duplicates, invalid entries)
 *  2. host: sends the setting on load and on change; the shared note is one text in both designers
 *  3. the real Screen Designer: the picker offers the default files, opens the first when the panel names none,
 *     keeps the panel's own file, follows a change of the setting, says which entries were ignored, and shows the shared
 *     not-connected note (and lists again on connecting)
 *  4. the real Menu Designer: the not-connected line and summary use the shared note
 *
 * Run with: node src/test/e4fMessageFiles.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const MessageFile = require(path.join(__dirname, '../messageFile.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const MnuCmdEngine = require(path.join(__dirname, '../mnuCmdEngine.js'));
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { dds } = require('./helpers/keywordMatrix');
const { newWebviewDom, webviewHtml, menuWebviewHtml } = require('./helpers/common');

(async () => {
console.log('1. the setting');
{
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  const prop = pkg.contributes.configuration.properties['isda.messageFiles'];
  check('declared as an array of strings, empty by default', prop && prop.type === 'array' && prop.items.type === 'string' && Array.isArray(prop.default) && prop.default.length === 0);
  check('the item pattern accepts NAME and LIB/NAME only', prop && new RegExp(prop.items.pattern).test('APPMSG') && new RegExp(prop.items.pattern).test('mylib/appmsg') && !new RegExp(prop.items.pattern).test('A/B/C') && !new RegExp(prop.items.pattern).test('TOOLONGNAME1'));

  const p = MessageFile.parseMessageFilesSetting(['appmsg', 'mylib/usrmsg', 'APPMSG', '*LIBL/QCPFMSG', 'bad name', '1ABC', 'a/b/c', 42, '', '  ']);
  check('valid entries keep their order, are upper-cased and de-duplicated',
    p.files.map((f) => f.ref).join() === 'APPMSG,MYLIB/USRMSG,QCPFMSG');
  check('a *LIBL entry has no library; others carry it', p.files[0].library === '' && p.files[1].library === 'MYLIB' && p.files[2].library === '');
  check('invalid names are reported, blanks and non-strings are not', p.ignored.join('|') === 'bad name|1ABC|a/b/c');
  check('anything that is not an array gives nothing', MessageFile.parseMessageFilesSetting(undefined).files.length === 0 && MessageFile.parseMessageFilesSetting('APPMSG').files.length === 0);
}

console.log('\n2. host and shared note');
{
  const ext = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
  check('the host sends messageFiles from the setting', /parseMessageFilesSetting\(/.test(ext) && /type: 'messageFiles'/.test(ext));
  check('the host re-sends on a change and disposes the listener', /affectsConfiguration\('isda\.messageFiles'\)/.test(ext) && /messageFilesSub\.dispose\(\)/.test(ext));
  check('both designers carry the same note text', DspfEngine.MESSAGE_NOT_CONNECTED_NOTE === MnuCmdEngine.NOT_CONNECTED_NOTE && /not connected/.test(DspfEngine.MESSAGE_NOT_CONNECTED_NOTE));
  Helpers.setMessageHooks({ textFor: () => ({ ok: false, code: 'not-connected' }), pick: () => {} });
  const line = Helpers.messageTextLineHtml('USR0003', '', 'APPMSG');
  check('the panel line is the shared note', line.indexOf(DspfEngine.MESSAGE_NOT_CONNECTED_NOTE) >= 0 && /msg-not-connected/.test(line));
  Helpers.setMessageHooks({ textFor: () => ({ ok: false, code: 'not-found' }), pick: () => {} });
  check('other reasons keep their own line', !/msg-not-connected/.test(Helpers.messageTextLineHtml('USR0003', '', 'APPMSG')));
  Helpers.setMessageHooks(null);
}

console.log('\n3. the Screen Designer picker');
{
  const posted = [];
  const SRC = [
    dds({ t: 'R', name: 'RECORD1' }),
    dds({ name: 'AMOUNT', len: 5, type: 'S', dec: 0, use: 'B', line: 3, col: 2 }),
    dds({ fn: 'CHKMSGID(USR0007)' }),
    dds({ fn: 'ERRMSGID(USR0001 L1/APPMSG)' }),
  ].join('\n') + '\n';
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'n1', SRC, 'E4F.DSPF'), {
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
  const lm = () => posted.filter((m) => m.type === 'listMessageFile').pop();
  const browse = (re) => Array.from(doc.querySelectorAll('.msg-browse-btn')).find((b) => re.test(b.className));

  selectField('AMOUNT');
  click(browse(/-errmsg-/));
  check('no setting: no default list and the panel\'s own file is opened', !doc.getElementById('msgp-default') && lm().msgf === 'L1/APPMSG');
  click(doc.getElementById('msgp-cancel'));

  send({ type: 'messageFiles', files: [{ library: '', name: 'APPMSG', ref: 'APPMSG' }, { library: 'MYLIB', name: 'USRMSG', ref: 'MYLIB/USRMSG' }], ignored: ['bad name'] });
  selectField('AMOUNT');
  posted.length = 0;
  click(browse(/-errmsg-/));
  check('the picker offers the default files', !!doc.getElementById('msgp-default') && Array.from(doc.querySelectorAll('#msgp-default option')).map((o) => o.textContent).join('|') === 'Default message files...|APPMSG|MYLIB/USRMSG');
  check('a panel that names a file keeps it', lm().msgf === 'L1/APPMSG' && doc.getElementById('msgp-library').value === 'L1');
  check('the ignored entries are named', /bad name/.test(doc.getElementById('msgp-ignored').textContent));

  const sel = doc.getElementById('msgp-default');
  sel.value = '1';
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check('choosing a default fills the library and file and lists it', doc.getElementById('msgp-library').value === 'MYLIB' && doc.getElementById('msgp-file').value === 'USRMSG' && lm().msgf === 'MYLIB/USRMSG');
  const before = posted.length;
  sel.value = '';
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  check('the heading option does nothing', posted.length === before);
  click(doc.getElementById('msgp-cancel'));

  // CHKMSGID with no file typed: the first default opens
  selectField('AMOUNT');
  posted.length = 0;
  click(browse(/-cm-browse/));
  check('a panel with no message file opens the first default', doc.getElementById('msgp-file').value === 'APPMSG' && doc.getElementById('msgp-library').value === '' && lm() && lm().msgf === 'APPMSG');

  // not connected: the shared note, then listing again on connecting
  send({ type: 'messageFileList', requestId: lm().requestId, ok: false, code: 'not-connected', error: 'x' });
  check('not connected: the picker says so and that the ID can be typed', doc.getElementById('msgp-error').textContent.indexOf(DspfEngine.MESSAGE_NOT_CONNECTED_NOTE) >= 0 && /type the message ID/.test(doc.getElementById('msgp-error').textContent));
  posted.length = 0;
  send({ type: 'codeForIStatus', installed: true, connected: true });
  check('connecting lists the file again', posted.filter((m) => m.type === 'listMessageFile').length === 1 && lm().msgf === 'APPMSG');
  send({ type: 'messageFileList', requestId: lm().requestId, ok: true, library: '', messages: [{ id: 'USR0001', text: 'Hello', severity: 0 }], truncated: false, total: 1 });
  check('the list then fills', doc.querySelectorAll('.msgp-row').length === 1);
  posted.length = 0;
  send({ type: 'codeForIStatus', installed: true, connected: false });
  send({ type: 'codeForIStatus', installed: true, connected: true });
  check('a picker that listed fine is not asked again on a reconnect', posted.filter((m) => m.type === 'listMessageFile').length === 0);
  click(doc.getElementById('msgp-cancel'));

  // a change of the setting is used by the next picker
  send({ type: 'messageFiles', files: [], ignored: [] });
  selectField('AMOUNT');
  click(browse(/-cm-browse/));
  check('clearing the setting removes the list', !doc.getElementById('msgp-default') && doc.getElementById('msgp-file').value === '');
  click(doc.getElementById('msgp-cancel'));
  dom.window.close();
}

console.log('\n4. the Menu Designer');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'MENU1' }),
    buildLine({ seq: '00020', line: '4', col: '5', func: "'1. Work with orders'" }),
  ].join('\n') + '\n';
  const posted = [];
  const dom = newWebviewDom(menuWebviewHtml('vscode-webview://fake', 'testnonce', src, '0001 CALL ORDERS\n', 'E4FMENU.MNUDDS', 'E4FMENUQQ.MNUCMD', 'loaded'), {
    beforeParse(w) { w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); },
  });
  await new Promise((res) => setTimeout(res, 800));
  const w = dom.window, doc = w.document;
  const send = (data) => w.dispatchEvent(new w.MessageEvent('message', { data }));
  send({ type: 'codeForIStatus', installed: true, connected: false });
  send({ type: 'menuMessages', msgf: 'MYLIB/E4FMENU', entries: [{ id: 'USR0001', ok: false, code: 'not-connected' }] });
  const line = doc.querySelector('.option-msg-line');
  check('the option line is the shared note', line && line.textContent.indexOf(MnuCmdEngine.NOT_CONNECTED_NOTE) >= 0);
  const summary = doc.getElementById('menuMessageSummary');
  check('the summary says the text is unavailable while not connected', !summary.classList.contains('hidden') && /text unavailable \(not connected\)/.test(summary.textContent));
  w.close();
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);
})();

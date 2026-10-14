/**
 * e4eMenuMessages.test.js
 *
 * E4e - the menu designer shows the message Compile Menu wrote for each option (USRnnnn, holding the option's mapped
 * command) and flags drift between that command and the message text.
 *  1. engine: message ID per option, the six states
 *  2. the real menu webview: asks the host once, a line per option, summary, "Use message text", compile and connect
 *     refresh, a document that is not an IBM i member shows nothing
 *  3. the host: requestMenuMessages handler, cache cleared after a compile
 *
 * Run with: node src/test/e4eMenuMessages.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const MnuCmdEngine = require(path.join(__dirname, '../mnuCmdEngine.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, menuWebviewHtml } = require('./helpers/common');

console.log('=== 1. engine ===');
{
  check('the ID is USR plus the option number padded to four digits', MnuCmdEngine.messageIdForOption(1) === 'USR0001' && MnuCmdEngine.messageIdForOption('12') === 'USR0012');
  const st = (cmd, entry) => MnuCmdEngine.optionMessageState(cmd, entry);
  check('no answer yet is loading', st('CALL A', undefined).state === 'loading');
  check('same text is a match (ends trimmed)', st('CALL A', { ok: true, text: 'CALL A  ' }).state === 'match');
  check('different text is drift and carries the message text', st('CALL A', { ok: true, text: 'CALL B' }).state === 'differs' && st('CALL A', { ok: true, text: 'CALL B' }).text === 'CALL B');
  check('the comparison is case sensitive (quoted text in a command matters)', st('CALL A', { ok: true, text: 'call a' }).state === 'differs');
  check('a command with no message yet is missing', st('CALL A', { ok: false, code: 'not-found' }).state === 'missing');
  check('a message with no command is an orphan', st('', { ok: true, text: 'CALL B' }).state === 'orphan');
  check('no command and no message says nothing', st('', { ok: false, code: 'not-found' }).state === 'none');
  check('not connected is unavailable with its reason', st('X', { ok: false, code: 'not-connected' }).state === 'unavailable' && st('X', { ok: false, code: 'not-connected' }).reason === 'not connected');
  check('an unknown failure is "lookup failed"', st('X', { ok: false, code: 'error' }).reason === 'lookup failed');
}

const src = [
  buildLine({ seq: '00010', nameType: 'R', name: 'MENU1' }),
  buildLine({ seq: '00020', line: '4', col: '5', func: "'1. Work with orders'" }),
  buildLine({ seq: '00030', line: '5', col: '5', func: "'2. Close month'" }),
  buildLine({ seq: '00040', line: '6', col: '5', func: "'3. Hold report'" }),
  buildLine({ seq: '00050', line: '7', col: '5', func: "'4. Sign off'" }),
].join('\n') + '\n';
const cmds = '0001 CALL ORDERS\n0002 CALL CLOSE\n0003 CALL HOLD\n';

function open(posted) {
  return newWebviewDom(menuWebviewHtml('vscode-webview://fake', 'testnonce', src, cmds, 'E4EMENU.MNUDDS', 'E4EMENUQQ.MNUCMD', 'loaded'), {
    beforeParse(w) { w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); },
  });
}

setTimeout(async () => {
  console.log('=== 2. the menu webview ===');
  const posted = [];
  const dom = open(posted);
  await new Promise((res) => setTimeout(res, 800));
  const w = dom.window, doc = w.document;
  const send = (data) => w.dispatchEvent(new w.MessageEvent('message', { data }));
  const asks = () => posted.filter((m) => m.type === 'requestMenuMessages');
  const lines = () => Array.from(doc.querySelectorAll('.option-msg-line')).map((e) => e.textContent);
  check('the page asks the host once for the four option messages', asks().length === 1 && asks()[0].ids.join() === 'USR0001,USR0002,USR0003,USR0004');
  check('before the answer there are no message lines', lines().length === 0);

  send({ type: 'menuMessages', msgf: 'MYLIB/E4EMENU', entries: [
    { id: 'USR0001', ok: true, text: 'CALL ORDERS' },
    { id: 'USR0002', ok: true, text: 'CALL OLDCLOSE' },
    { id: 'USR0003', ok: false, code: 'not-found' },
    { id: 'USR0004', ok: true, text: 'SIGNOFF' },
  ] });
  const l = lines();
  check('a matching option says it matches', /USR0001 in MYLIB\/E4EMENU matches/.test(l[0]));
  check('a differing option shows the message text and offers to use it', /USR0002.*says: CALL OLDCLOSE/.test(l[1]) && !!doc.querySelector('.option-msg-differs .option-msg-use'));
  check('an option with a command and no message says Compile Menu creates it', /USR0003 in MYLIB\/E4EMENU not created yet/.test(l[2]));
  check('a message with no command mapped is flagged', /USR0004.*exists \(SIGNOFF\) but no command is mapped/.test(l[3]) && doc.querySelector('.option-msg-orphan'));
  const summary = doc.getElementById('menuMessageSummary');
  check('the summary counts every state', !summary.classList.contains('hidden') && /1 match, 1 differ, 1 not created yet, 1 without a command/.test(summary.textContent));
  check('a re-render does not ask again', asks().length === 1);

  posted.length = 0;
  doc.querySelector('.option-msg-differs .option-msg-use').dispatchEvent(new w.Event('click', { bubbles: true }));
  const edit = posted.find((m) => m.type === 'applyMenuCmdOptionEdit');
  check('"Use message text" writes the message text as the command (the screen source is untouched)', edit && edit.edits[0].numberValue === 2 && edit.edits[0].command === 'CALL OLDCLOSE' && !posted.some((m) => m.type === 'applyEdit'));
  send({ type: 'menuCmdSaved', text: '0001 CALL ORDERS\n0002 CALL OLDCLOSE\n0003 CALL HOLD\n' });
  check('after the command follows the message the option matches', /USR0002.*matches/.test(lines()[1]));

  const beforeStale = asks().length;
  send({ type: 'menuMessagesStale' });
  check('a compile makes the page forget the answers and ask again', asks().length === beforeStale + 1 && lines().length === 0);
  send({ type: 'menuMessages', msgf: 'MYLIB/E4EMENU', entries: [{ id: 'USR0001', ok: false, code: 'not-connected' }] });
  check('not connected shows the reason', /Message text unavailable \(not connected\)/.test(lines()[0]));
  const before = asks().length;
  send({ type: 'codeForIStatus', installed: true, connected: false });
  check('still not connected: nothing is asked again', asks().length === before);
  send({ type: 'codeForIStatus', installed: true, connected: true });
  check('connecting asks again for what could not be read', asks().length === before + 1 && asks()[asks().length - 1].ids.includes('USR0001'));
  dom.window.close();

  const posted2 = [];
  const dom2 = open(posted2);
  await new Promise((res) => setTimeout(res, 800));
  dom2.window.dispatchEvent(new dom2.window.MessageEvent('message', { data: { type: 'menuMessages', msgf: null, entries: [] } }));
  check('a document that is not an IBM i member shows no message lines and no summary', dom2.window.document.querySelectorAll('.option-msg-line').length === 0 && dom2.window.document.getElementById('menuMessageSummary').classList.contains('hidden'));
  dom2.window.close();

  console.log('=== 3. the extension host ===');
  const host = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
  check('the menu designer handles requestMenuMessages and answers menuMessages', /msg\.type === 'requestMenuMessages'/.test(host) && /type: 'menuMessages'/.test(host));
  const handler = host.slice(host.indexOf('async function handleRequestMenuMessages'), host.indexOf('const MESSAGE_LIST_LIMIT'));
  check('only USRnnnn IDs are looked up, 200 at most', handler.indexOf('USR\\d{4}') >= 0 && /\.slice\(0, 200\)/.test(handler));
  check('a compile clears the cached text of that message file and tells the page', /messageResolver\.clear\(`\$\{compiled\.library\}\/\$\{compiled\.name\}`\)[\s\S]{0,200}menuMessagesStale/.test(host));
  const roadmap = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/FEATURE-ROADMAP.md'), 'utf8');
  check('the roadmap has an E4e results section', /### E4e results/.test(roadmap));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 50);

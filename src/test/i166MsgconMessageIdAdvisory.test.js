/**
 * i166MsgconMessageIdAdvisory.test.js
 *
 * Task I-166 - MSGCON's message ID. The DDS Reference states no rule for it (the
 * seven-character form is MSGID's own), so nothing is refused; a message ID that is
 * not the usual IBM i seven characters gets an ADVISORY, shown under the Message ID
 * box of a MSGCON constant. The file and library names get none (nothing settles them).
 *
 * Run with: node src/test/i166MsgconMessageIdAdvisory.test.js
 */
'use strict';
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const adv = DspfWriter.msgconMessageIdAdvisory;

console.log('\n1. the spec');
{
  const m = KeywordSpec.RECORD_TYPES.MSGCON.msgconParameters;
  check('the advisory length is 7 and the accessor returns it', m.messageIdAdvisoryLength === 7 && KeywordSpec.msgconMessageIdAdvisoryLength() === 7);
  check('the spec still records NO enforced rule (advisory only) and both open questions', m.messageIdRule === null && m.fileNameRule === null && m.openQuestions.length === 2);
}

console.log('\n2. msgconMessageIdAdvisory');
{
  check('a seven-character ID gets no advisory', adv('MSG0001') === null && adv('CPF9898') === null);
  check('a blank or missing ID gets none (not set)', adv('') === null && adv('   ') === null && adv(null) === null && adv(undefined) === null);
  const short = adv('MSG01');
  check('a short ID is advised, naming the ID and both lengths', /MSG01 is 5 characters/.test(short || '') && /usual IBM i message ID is 7 characters/.test(short || ''));
  check('a long ID is advised', /MSG000001 is 9 characters/.test(adv('MSG000001') || ''));
  check('a one-character ID reads "1 character"', /is 1 character:/.test(adv('M') || ''));
  check('the ID is shown in upper case', /^MSGCON message ID MSG01 /.test(adv('msg01') || ''));
  check('the note says it is not refused and states the reference has no rule', /not refused here/.test(short) && /states no rule/.test(short));
  check('surrounding blanks do not count as characters', adv(' MSG0001 ') === null);
}

console.log('\n3. nothing is refused (I-153 behaviour unchanged)');
{
  ['20 MSG01 MSGF', '20 MSG000001 MSGF', '20 M LIB/MSGF'].forEach((t) => check('"' + t + '" still passes the structure and length checks', DspfWriter.msgconFullProblem(t) === null));
  check('a file or library token of any length gets no advisory and no refusal', DspfWriter.msgconFullProblem('20 MSG0001 VERYLONGLIBRARYNAME/VERYLONGFILENAME') === null);
}

console.log('\n4. the real webview in jsdom');
const SRC = [
  '     A          R RECORD1',
  "     A                                  3  2MSGCON(20 MSG0001 MSGF)",
  "     A                                  5  2MSGCON(20 MSG01 MSGF)",
  "     A                                  7  2MSGCON(20 MSG000001 LIB/MSGF)",
].join('\n') + '\n';
function session() {
  const html = webviewHtml('vscode-webview://fake', 'n' + Math.random(), SRC, 'I166.DSPF');
  const dom = newWebviewDom(html, {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      w.alert = () => {};
      w.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  const doc = dom.window.document;
  return {
    doc, el: (id) => doc.getElementById(id),
    select(line) { const b = doc.querySelector('.dspf-field[data-source-line="' + line + '"]'); if (!b) return false; b.click(); return true; },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let s = session(); await wait(1200);
  s.select(2);
  check('a seven-character message ID: the Message ID box is shown and no advisory', !!s.el('p-const-msgcon-msgid') && !s.el('p-const-msgcon-msgid-note'));
  s = session(); await wait(1200);
  s.select(3);
  let note = s.el('p-const-msgcon-msgid-note');
  check('a short message ID: the advisory shows as a warn hint', !!note && /hint-small/.test(note.className) && /warn/.test(note.className) && /MSG01 is 5 characters/.test(note.textContent));
  s = session(); await wait(1200);
  s.select(4);
  note = s.el('p-const-msgcon-msgid-note');
  check('a long message ID with a library: advised, the library is not mentioned', !!note && /MSG000001 is 9 characters/.test(note.textContent) && !/LIB/.test(note.textContent));
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();

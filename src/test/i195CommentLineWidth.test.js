/**
 * i195CommentLineWidth.test.js - Task I-195: comment lines keep, show and store text past column 80, and
 * the Comments panel warns about it.
 *
 * Before I-195 the parser captured a comment's text as columns 8-80 only, so the Comments panel showed 73
 * characters of a longer line, and opening such a comment and saving it rewrote the line to 80 columns -
 * the tail was lost. Now: the parser keeps the whole text; addComment / updateComment cap at the source
 * file's own line length (80 when none is given); an unchanged save leaves the line byte for byte as it
 * was; sourceLineWidth.js reads the SRCDTA width of an IBM i source file; commentWidthInfo says when a
 * line is past column 80 (warning) or past the file's limit (error); and the panel shows both.
 *
 * Run with: node src/test/i195CommentLineWidth.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const DspfParser = require('../../dist/dspfParser.js');
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const SourceLineWidth = require(path.join(__dirname, '../sourceLineWidth.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

/** A comment line exactly `n` columns wide whose text is unique all the way along (no repeating pattern). */
function commentOfWidth(n) {
  let text = '';
  for (let i = 0; text.length < n - 7; i++) text += '[' + i + ']';
  return '     A*' + text.slice(0, n - 7);
}
const withCommentFirst = (c) => [c, '     A          R REC1', '     A            FLD1          10A  O  2  2'];
const parsedText = (lines) => DspfParser.parseDspf(lines.join('\n')).comments[0].text;

console.log('parser keeps the whole comment');
for (const n of [80, 81, 100, 120, 200]) {
  const line = commentOfWidth(n);
  const text = parsedText(withCommentFirst(line));
  check('a ' + n + '-column comment line is captured in full (' + (n - 7) + ' characters)', text === line.slice(7).replace(/\s+$/, ''));
}
check('a short comment still parses as before', parsedText(withCommentFirst('     A*Hello')) === 'Hello');
check('trailing blanks on a comment are still trimmed', parsedText(withCommentFirst('     A*Hello      ')) === 'Hello');

console.log('writer: an unchanged save keeps the line exactly');
for (const n of [80, 100, 120]) {
  const src = withCommentFirst(commentOfWidth(n));
  const after = DspfWriter.updateComment(src, 1, parsedText(src));
  check(n + ' columns, saved with no change -> identical line', after[0] === src[0]);
  check(n + ' columns, saved with no change -> other lines untouched', after[1] === src[1] && after[2] === src[2]);
}

console.log('writer: editing text past column 80 is stored');
{
  const src = withCommentFirst(commentOfWidth(120));
  const after = DspfWriter.updateComment(src, 1, parsedText(src) + ' EXTRA', Infinity);
  check('120 columns + 6 appended with no limit -> 126 columns, nothing lost', after[0].length === 126 && after[0].endsWith(' EXTRA') && after[0].startsWith(src[0]));
  const grown = DspfWriter.updateComment(withCommentFirst('     A*short'), 1, 'y'.repeat(100), Infinity);
  check('a short comment grown to 100 characters with no limit keeps all 100', grown[0] === '     A*' + 'y'.repeat(100));
}

console.log('writer: the source file limit caps what is stored');
{
  const capped = DspfWriter.updateComment(withCommentFirst('     A*short'), 1, 'y'.repeat(120), 100);
  check('a 100-column file limit stores 93 characters (line is 100 columns)', capped[0].length === 100 && capped[0] === '     A*' + 'y'.repeat(93));
  const def = DspfWriter.updateComment(withCommentFirst('     A*short'), 1, 'y'.repeat(120));
  check('no limit given keeps the 80-column behaviour (73 characters)', def[0] === '     A*' + 'y'.repeat(73));
  const bad = DspfWriter.updateComment(withCommentFirst('     A*short'), 1, 'y'.repeat(120), 'nonsense');
  check('an invalid limit falls back to 80 columns', bad[0].length === 80);
  const tiny = DspfWriter.updateComment(withCommentFirst('     A*short'), 1, 'y'.repeat(120), 3);
  check('a too-small limit falls back to 80 columns', tiny[0].length === 80);
  const src = withCommentFirst(commentOfWidth(120));
  const keep = DspfWriter.updateComment(src, 1, parsedText(src), 100);
  check('a comment already longer than the limit is never cut shorter than it is', keep[0] === src[0]);
  const added = DspfWriter.addComment(withCommentFirst('     A*x'), [], 0, 'z'.repeat(150), null, 100);
  check('addComment honours the limit (100 columns)', added[0].length === 100);
  const addedLocal = DspfWriter.addComment(withCommentFirst('     A*x'), [], 0, 'z'.repeat(150), null, Infinity);
  check('addComment with no limit keeps all 150 characters', addedLocal[0] === '     A*' + 'z'.repeat(150));
  const addedDefault = DspfWriter.addComment(withCommentFirst('     A*x'), [], 0, 'z'.repeat(150));
  check('addComment without a limit argument still cuts at 80 columns', addedDefault[0].length === 80);
}

console.log('commentWidthInfo');
{
  const info = (len, max) => Helpers.commentWidthInfo('x'.repeat(len), max === undefined ? null : max);
  check('73 characters (column 80) is fine and shows nothing', info(73).level === 'ok' && info(73).short === '' && info(73).width === 80);
  check('74 characters (column 81) warns', info(74).level === 'warn' && info(74).short === 'col 81' && /Past column 80/.test(info(74).message));
  check('113 characters warns with the real column', info(113).level === 'warn' && info(113).short === 'col 120');
  check('the warning names the file limit when there is one', /allows 132/.test(info(74, 132).message));
  check('exactly at the file limit is a warning, not an error', info(93, 100).level === 'warn' && info(93, 100).width === 100);
  check('one past the file limit is an error', info(94, 100).level === 'error' && info(94, 100).short === '101 > 100');
  check('an 80-column limit makes column 81 an error', info(74, 80).level === 'error');
  check('a missing or invalid limit means none', info(300, undefined).level === 'warn' && info(300, 'x').level === 'warn' && info(300, Infinity).level === 'warn');
}

console.log('sourceLineWidth: reading the SRCDTA length');
(async () => {
  check('the query asks SYSCOLUMNS for SRCDTA of the named source file, upper-cased',
    SourceLineWidth.srcdtaLengthSql('mylib', 'qddssrc') ===
      "SELECT LENGTH FROM QSYS2.SYSCOLUMNS WHERE SYSTEM_TABLE_SCHEMA = 'MYLIB' AND SYSTEM_TABLE_NAME = 'QDDSSRC' AND COLUMN_NAME = 'SRCDTA'");
  check('a quote in a name is doubled, not injected', SourceLineWidth.srcdtaLengthSql("A'B", 'F').includes("'A''B'"));
  check('lengthFromRows reads LENGTH', SourceLineWidth.lengthFromRows([{ LENGTH: 100 }]) === 100);
  check('lengthFromRows accepts a numeric string', SourceLineWidth.lengthFromRows([{ LENGTH: '112' }]) === 112);
  check('lengthFromRows rejects no rows, zero, negatives, fractions and absurd values',
    [[], null, [{ LENGTH: 0 }], [{ LENGTH: -5 }], [{ LENGTH: 80.5 }], [{ LENGTH: 40000 }], [{ LENGTH: 'abc' }], [{}]].every((r) => SourceLineWidth.lengthFromRows(r) === null));

  let sql = null;
  const ok = { runSQL: async (q) => { sql = q; return [{ LENGTH: 100 }]; } };
  const a = await SourceLineWidth.fetchSourceLineMax(ok, { library: 'LIB', file: 'QDDSSRC' });
  check('a member whose source file holds 100 characters answers 100, from the member', a.maxLength === 100 && a.source === 'member' && /SRCDTA/.test(sql));
  const b = await SourceLineWidth.fetchSourceLineMax({ runSQL: async () => { throw new Error('boom'); } }, { library: 'LIB', file: 'F' });
  check('a failing query falls back to 80 and says it is the default', b.maxLength === 80 && b.source === 'default');
  const c = await SourceLineWidth.fetchSourceLineMax({ runSQL: async () => [] }, { library: 'LIB', file: 'F' });
  check('an empty answer falls back to 80', c.maxLength === 80 && c.source === 'default');
  const d = await SourceLineWidth.fetchSourceLineMax(null, { library: 'LIB', file: 'F' });
  check('no connection falls back to 80 without throwing', d.maxLength === 80 && d.source === 'default');
  const e = await SourceLineWidth.fetchSourceLineMax(ok, null);
  check('no member falls back to 80 without throwing', e.maxLength === 80);

  console.log('the Comments panel');
  const longLine = commentOfWidth(120);
  const src = [longLine, '     A          R REC1', '     A            FLD1          10A  O  2  2'].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce195', src, 'LONG.DSPF');
  const posted = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });
  setTimeout(() => {
    const { document: doc, Event, MessageEvent } = dom.window;
    const openFileComments = () => {
      doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));
      const tab = Array.from(doc.querySelectorAll('.props-tab')).find((t) => t.textContent.trim() === 'Comments');
      tab.dispatchEvent(new Event('click', { bubbles: true }));
    };
    const send = (data) => dom.window.dispatchEvent(new MessageEvent('message', { data }));

    send({ type: 'sourceLineWidth', maxLength: null });   // the host's answer for a local file: no limit
    openFileComments();
    let input = doc.querySelector('.comment-text-input');
    check('the 120-column comment is shown in full (113 characters)', !!input && input.value === longLine.slice(7));
    let note = doc.querySelector('.comment-width-note[data-note-line="1"]');
    check('a note beside it says column 120 and is a warning', !!note && note.textContent === 'col 120' && note.classList.contains('comment-width-warn'));
    check('with no limit there is no maxlength on the input', !input.hasAttribute('maxlength'));

    input.value = input.value + ' MORE';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    check('typing updates the note live (5 characters appended -> col 125)', doc.querySelector('.comment-width-note[data-note-line="1"]').textContent === 'col 125');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    let edit = posted.find((m) => m.type === 'applyEdit');
    check('saving the edit stores all 125 columns, nothing cut at 80', !!edit && edit.text.split('\n')[0] === longLine + ' MORE');
    posted.length = 0;

    console.log('  an IBM i member limit pushed by the host');
    send({ type: 'sourceLineWidth', maxLength: 100 });
    openFileComments();
    input = doc.querySelector('.comment-text-input');
    check('the input keeps the long comment\'s own length as its limit (never refuses what is already there)', Number(input.getAttribute('maxlength')) >= 113);
    const addInput = doc.querySelector('.comment-add-text-input');
    check('the add-row input is limited to 93 characters (100 columns)', !!addInput && addInput.getAttribute('maxlength') === '93');
    check('the long existing comment is an error against a 100-column file', doc.querySelector('.comment-width-note[data-note-line="1"]').classList.contains('comment-width-error'));
    addInput.value = 'y'.repeat(90);
    addInput.dispatchEvent(new Event('input', { bubbles: true }));
    const addNote = doc.querySelector('[id$="-add-comment-note"]');
    check('typing 90 characters in the add row (column 97) warns, is not an error', addNote.textContent === 'col 97' && addNote.classList.contains('comment-width-warn'));
    posted.length = 0;
    const addBtn = doc.querySelector('[id$="-add-comment"]');
    addInput.value = 'z'.repeat(93);
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));
    edit = posted.find((m) => m.type === 'applyEdit');
    const added = edit && DspfParser.parseDspf(edit.text).comments.find((c) => c.text === 'z'.repeat(93));
    check('adding 93 characters stores a 100-column comment line', !!added && edit.text.split('\n')[added.line - 1].length === 100);
    posted.length = 0;

    console.log('  a local file (no limit) after all');
    send({ type: 'sourceLineWidth', maxLength: null });
    openFileComments();
    check('maxlength is gone again for a local file', !doc.querySelector('.comment-add-text-input').hasAttribute('maxlength'));
    posted.length = 0;

    dom.window.close();
    process.exit(failureCount() === 0 ? 0 : 1);
  }, 400);
})();

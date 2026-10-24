/**
 * E11h4 - the Raw section of the SFGR panels: an entry's own source lines under a column ruler, written back as typed
 * with SfgrWriter.setRawLines (one edit). jsdom on the real sample, plus the writer on its own.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Writer = require('../sfgrWriter.js');
const Model = require('../sfgrModel.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SFGR);
const errors = (t) => Parser.parse(t).problems.filter((p) => p.severity === 'error').length;
const baseErrors = errors(SFGR);

console.log('the writer');
const d = P.entries.find((e) => e.kind === 'D' && e.lines.length === 1 && e.values.name);
const dText = P.lines[d.line - 1].text;
let r = Writer.setRawLines(SFGR, { line: d.line }, dText);
check('the same lines give changed: false', r.ok && r.changed === false && r.text === SFGR);
const edited = dText.slice(0, 14) + 'X' + dText.slice(15);
r = Writer.setRawLines(SFGR, { line: d.line }, edited);
const lines0 = SFGR.split('\n');
check('one changed line: only that line differs, ends kept', r.ok && r.changed && r.text.split('\n').every((l, i) => i === d.line - 1 || l === lines0[i]) && r.text.split('\n')[d.line - 1].replace(/\r$/, '') === edited && r.text.length === SFGR.length);
check('  touched is that line', r.touched.from === d.line && r.touched.to === d.line);
const two = Writer.setRawLines(SFGR, { line: d.line }, dText + '\n' + dText);
check('two lines instead of one: one line more, rest untouched', two.ok && two.text.split('\n').length === lines0.length + 1 && two.touched.to === d.line + 1);
check('a trailing newline in the box is ignored', Writer.setRawLines(SFGR, { line: d.line }, dText + '\n').changed === false);
check('an empty box is refused', Writer.setRawLines(SFGR, { line: d.line }, '').code === 'empty' && Writer.setRawLines(SFGR, { line: d.line }, '\n\n').code === 'empty');
check('a tab is refused', Writer.setRawLines(SFGR, { line: d.line }, dText + '\t').code === 'badValue');
check('a line of 81 characters is refused', Writer.setRawLines(SFGR, { line: d.line }, (dText + new Array(90).join(' ')).slice(0, 81)).code === 'tooWide');
check('no entry at that line is refused', Writer.setRawLines(SFGR, { line: 99999 }, 'x').code === 'noSuchEntry');
const crlf = SFGR.replace(/\r?\n/g, '\r\n');
const cr = Writer.setRawLines(crlf, { line: d.line }, edited + '\n' + dText);
check('CRLF stays CRLF when lines are added', cr.ok && cr.text.indexOf('\n') > 0 && cr.text.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')));
const noFinal = SFGR.replace(/\r?\n$/, '');
const lastEntry = Parser.parse(noFinal).entries.filter((e) => e.kind !== 'blank').slice(-1)[0];
const nf = Writer.setRawLines(noFinal, { line: lastEntry.line }, noFinal.split('\n')[lastEntry.endLine - 1] + ' ');
check('a source with no final line end still has none', nf.ok && !/\n$/.test(nf.text));
const multi = P.entries.find((e) => e.kind === 'D' && e.lines.length > 1);
if (multi) {
  const rows = P.lines.slice(multi.line - 1, multi.endLine).map((l) => l.text);
  const m = Writer.setRawLines(SFGR, { line: multi.line }, rows.join('\n'));
  check('a constant on several lines round-trips as one entry', m.ok && m.changed === false);
}
const brokenStart = Writer.setRawLines(SFGR, { line: d.line }, dText.slice(0, 5) + '?' + dText.slice(6));
check('a form type that makes the line unreadable is refused when that is a new error', brokenStart.ok === false ? brokenStart.code === 'wouldBreakSource' : errors(brokenStart.text) <= baseErrors);

setTimeout(async () => {
  const tick = () => new Promise((res) => setTimeout(res, 5));
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11h4', SFGR, 'T.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
  } });
  const w = dom.window, doc = w.document;
  const $ = (s) => doc.querySelector(s);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => edits()[edits().length - 1].text;
  const click = (el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));
  const FORMAT = 'SAISIE';
  $('#recordSelect').value = FORMAT; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true }));
  const rec = Model.buildModel(SFGR).records.find((x) => x.name === FORMAT);

  console.log('\nthe format panel');
  check('the format panel has a Raw section holding the S line', !!$('.sfgr-format-panel #sfgrRaw'));
  const fmtLine = rec.sfgr.sourceLine;
  check('  the box shows exactly that source line', $('#sfgrRawText').value === P.lines[fmtLine - 1].text);
  check('  a two-row ruler of 80 columns sits above it', $('.sfgr-ruler').textContent.split('\n').length === 2 && $('.sfgr-ruler').textContent.split('\n').every((l) => l.length === 80));
  check('  a legend names the S columns', /name/.test($('.sfgr-raw-zones').textContent));

  console.log('\nthe field panel');
  const startOf = rec.sfgr.startLine == null ? 1 : rec.sfgr.startLine;
  const elOf = (f) => Array.from(doc.querySelectorAll('.dspf-field')).find((e) => +e.getAttribute('data-render-line') === startOf + f.location.line - 1 && +e.getAttribute('data-render-column') === f.location.column);
  const F = rec.fields.find((f) => f.nameType === 'FIELD' && f.length >= 3 && f.location.line < 20 && elOf(f));
  const el = elOf(F);
  click(el);
  check('selecting a field shows its panel with a Raw section', !!$('.sfgr-field-panel #sfgrRaw'));
  const text = P.lines[F.sfgr.line - 1].text;
  check('  the box shows the field line, the legend names the D columns', $('#sfgrRawText').value === text && /length/.test($('.sfgr-raw-zones').textContent));
  $('#sfgrRaw').open = true; $('#sfgrRaw').dispatchEvent(new w.Event('toggle'));
  const typed = text.slice(0, 14) + 'Q' + text.slice(15);
  posted.length = 0;
  $('#sfgrRawText').value = typed;
  click($('#sfgrRawApply'));
  check('Apply posts one edit', edits().length === 1);
  check('  only that line changed, no new read errors', lastText().split('\n').every((l, i) => i === F.sfgr.line - 1 || l === SFGR.split('\n')[i]) && lastText().split('\n')[F.sfgr.line - 1].replace(/\r$/, '') === typed && errors(lastText()) <= baseErrors);
  check('  the panel shows the field again, still open on the Raw section', !!$('.sfgr-field-panel #sfgrRaw') && $('#sfgrRaw').open);
  posted.length = 0;
  $('#sfgrRawText').value = typed + '\t';
  click($('#sfgrRawApply'));
  check('a tab is refused with the reason shown, nothing posted', edits().length === 0 && /control character/.test($('#sfgrRawError').textContent));
  $('#sfgrRawText').value = '';
  click($('#sfgrRawApply'));
  check('an empty box is refused too', edits().length === 0 && /at least one line/.test($('#sfgrRawError').textContent));
  click($('#sfgrRawRevert'));
  check('Revert puts the source line back and clears the message', $('#sfgrRawText').value === typed && $('#sfgrRawError').textContent === '');

  console.log('\nthe help panel');
  const fmtWithHelp = Model.buildModel(SFGR).records.find((x) => x.sfgr.help && x.sfgr.help.length);
  if (fmtWithHelp) {
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: lastText() } }));
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: SFGR } }));
    $('#recordSelect').value = fmtWithHelp.name; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true }));
    click($('[data-sfgr-help-line]'));
    check('a help area opens its panel with a Raw section holding its H line', !!$('.sfgr-help-panel #sfgrRaw') && $('#sfgrRawText').value === P.lines[fmtWithHelp.sfgr.help[0].line - 1].text);
  }
  dom.window.close();
  process.exit(process.exitCode || 0);
}, 300);

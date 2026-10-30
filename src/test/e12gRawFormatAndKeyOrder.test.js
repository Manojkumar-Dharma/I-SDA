/**
 * E12g - the Raw view of a whole format (SfgrWriter.setRawFormat and the "Raw source of the whole format" section of
 * the format panel) and the key mask ordering (draggable chips, Shift+Left / Shift+Right). jsdom on the real sample and on
 * a small source with comments, plus the writer on its own.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Writer = require('../sfgrWriter.js');
const Model = require('../sfgrModel.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SFGR);
const errors = (t) => Parser.parse(t).problems.filter((p) => p.severity === 'error').length;
const baseErrors = errors(SFGR);
const linesOf = (t) => t.split(/\r\n|\n|\r/);
const spanOf = (text, i) => Writer.formatSpan(Parser.parse(text), i);
const rowsOf = (text, i) => { const sp = spanOf(text, i); return Parser.parse(text).lines.slice(sp.first - 1, sp.last).map((l) => l.text); };

function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const S = (name, extra) => mk('S', [[7, name]].concat(extra || []));
const F = (name, line, col, len) => mk('D', [[7, name], [15, String(len).padStart(4)], [19, String(line).padStart(2)], [21, String(col).padStart(2)], [23, 'Y']]);
const CMT = (t) => mk('D', [[7, '*'], [8, t]]).replace(/^( {5})D/, '$1D');
const comment = (t) => { const a = new Array(80).fill(' '); a[5] = 'D'; a[6] = '*'; for (let k = 0; k < t.length; k++) a[8 + k] = t[k]; return a.join('').replace(/\s+$/, ''); };
const src = (lines, eol) => lines.join(eol || '\n') + (eol || '\n');

console.log('the writer');
{
  let ok = true;
  for (let i = 0; i < P.formats.length; i++) {
    const r = Writer.setRawFormat(SFGR, i, rowsOf(SFGR, i).join('\n') + '\n');
    if (!(r.ok && r.changed === false && r.text === SFGR)) ok = false;
  }
  check('every format of the sample, as it is, gives changed: false', ok);
  check('  with or without the final line end in the text', Writer.setRawFormat(SFGR, 2, rowsOf(SFGR, 2).join('\n')).changed === false);

  const rows = rowsOf(SFGR, 2);
  const sp = spanOf(SFGR, 2);
  const target = rows.findIndex((t, k) => /^ {5}D/.test(t) && k > 2);
  const typed = rows.slice();
  typed[target] = typed[target].slice(0, 14) + 'Q' + typed[target].slice(15);
  let r = Writer.setRawFormat(SFGR, 2, typed.join('\n') + '\n');
  const before = linesOf(SFGR), after = linesOf(r.text);
  check('one changed line: only it differs, the other formats are byte-identical', r.ok && r.changed && after.length === before.length && after.every((l, i) => (i === sp.first - 1 + target ? l.replace(/\r$/, '') === typed[target] : l === before[i])));
  check('  touched is the whole format', r.touched.from === sp.first && r.touched.to === sp.last);
  check('  no new read errors', errors(r.text) <= baseErrors);

  const more = Writer.setRawFormat(SFGR, 2, rows.concat([rows[rows.length - 1]]).join('\n') + '\n');
  check('one line more: one line more in the source, touched grows', more.ok && linesOf(more.text).length === before.length + 1 && more.touched.to === sp.last + 1);
  const plain = rows.findIndex((t, i) => i > 2 && /^ {5}D/.test(t) && t[79] !== 'X' && !/X$/.test(rows[i - 1]));
  const fewer = Writer.setRawFormat(SFGR, 2, rows.filter((_, i) => i !== plain).join('\n') + '\n');
  check('one line fewer: one line fewer in the source', fewer.ok && linesOf(fewer.text).length === before.length - 1);
  check('cutting the last line of a continued constant is refused (a dangling X is a new read error)', Writer.setRawFormat(SFGR, 2, rows.slice(0, -1).join('\n') + '\n').code === 'wouldBreakSource');
  const rename = rows.slice();
  rename[0] = S('NEWNAME', []).slice(0, 80);
  const ren = Writer.setRawFormat(SFGR, 2, rename.join('\n') + '\n');
  check('the S line can be renamed inside the box (the count stays one)', ren.ok && ren.changed && Parser.parse(ren.text).formats.length === P.formats.length && Parser.parse(ren.text).formats[2].name === 'NEWNAME');

  check('no S specification is refused (formatCount)', Writer.setRawFormat(SFGR, 2, rows.slice(1).join('\n')).code === 'formatCount');
  check('a second S specification is refused (formatCount), nothing else says yes', (() => { const x = Writer.setRawFormat(SFGR, 2, rows.concat([rows[0]]).join('\n')); return x.ok === false && x.code === 'formatCount' && /2 S specifications/.test(x.reason); })());
  check('an H or D line before the S is refused (beforeS)', Writer.setRawFormat(SFGR, 2, [rows[1]].concat(rows).join('\n')).code === 'beforeS');
  check('an empty box is refused', Writer.setRawFormat(SFGR, 2, '').code === 'empty' && Writer.setRawFormat(SFGR, 2, '\n\n  \n').code === 'empty');
  check('a tab is refused', Writer.setRawFormat(SFGR, 2, rows.join('\n') + '\t').code === 'badValue');
  check('a line of 81 characters is refused', Writer.setRawFormat(SFGR, 2, rows.concat([(rows[3] + new Array(90).join(' ')).slice(0, 81)]).join('\n')).code === 'tooWide');
  check('no such format is refused', Writer.setRawFormat(SFGR, 99, rows.join('\n')).code === 'noSuchFormat' && Writer.setRawFormat(SFGR, -1, rows.join('\n')).code === 'noSuchFormat');
  const broken = rows.slice();
  broken[target] = broken[target].slice(0, 5) + '?' + broken[target].slice(6);
  const bk = Writer.setRawFormat(SFGR, 2, broken.join('\n'));
  check('a line that becomes unreadable (a new read error) is refused', bk.ok === false && bk.code === 'wouldBreakSource');
  check('junk input does not throw', [null, undefined, 42].every((x) => { try { return Writer.setRawFormat(SFGR, 2, x).ok === false; } catch (e) { return false; } }) && Writer.setRawFormat(null, 0, 'x').ok === false);
}
{
  // comments and blank lines, line ends
  const lines = [S('F1'), F('A', 2, 2, 5), '', comment('about F2'), S('F2'), F('B', 2, 2, 5), ''];
  const text = src(lines);
  const sp1 = spanOf(text, 1);
  check('the header comment of the second format is in its span, the first format ends before it', sp1.first === 4 && sp1.last >= 6 && spanOf(text, 0).last <= 3);
  const typed = rowsOf(text, 1);
  check('  the box holds the comment, the S, the field and the blank last line', typed[0] === lines[3] && typed[1] === lines[4] && typed.length === sp1.last - sp1.first + 1);
  check('  a blank last line of the format is not lost (the page sends one final line end)', Writer.setRawFormat(text, 1, typed.join('\n') + '\n').changed === false);
  const edited = typed.slice(); edited[0] = comment('changed');
  const e1 = Writer.setRawFormat(text, 1, edited.join('\n') + '\n');
  check('  the header comment can be edited, the first format is untouched', e1.ok && e1.changed && linesOf(e1.text).slice(0, 3).join('|') === lines.slice(0, 3).join('|'));
  const withBlank = Writer.setRawFormat(text, 1, typed.join('\n') + '\n\n');
  check('  an extra empty line in the box is a blank line of the format', withBlank.ok && withBlank.changed && linesOf(withBlank.text).length === linesOf(text).length + 1);

  const crlf = src(lines, '\r\n');
  const cr = Writer.setRawFormat(crlf, 1, rowsOf(crlf, 1).concat([F('C', 3, 2, 5)]).join('\n') + '\n');
  check('CRLF stays CRLF when lines are added', cr.ok && !/[^\r]\n/.test(cr.text) && cr.text.indexOf('\r\n') > 0);
  const endless = lines.join('\n').replace(/\n+$/, '');
  const en = Writer.setRawFormat(endless, 1, rowsOf(endless, 1).concat([F('C', 3, 2, 5)]).join('\n') + '\n');
  check('a source with no final line end still has none', en.ok && !/\n$/.test(en.text));
  const mid = Writer.setRawFormat(text, 0, rowsOf(text, 0).concat([F('Z', 3, 2, 5)]).join('\n') + '\n');
  check('a format in the middle: what follows it is byte-identical', mid.ok && linesOf(mid.text).slice(-5).join('|') === linesOf(text).slice(-5).join('|'));
}

setTimeout(async () => {
  const tick = () => new Promise((res) => setTimeout(res, 5));
  const posted = [];
  const open = (source, name) => {
    const html = webviewHtml('vscode-webview://fake', 'e12g', source, 'T.DSPF36', 'modern', 'green', 'sfgr');
    return newWebviewDom(html, { beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
    } });
  };
  let dom = open(SFGR);
  let w = dom.window, doc = w.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => Array.from(doc.querySelectorAll(s));
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => edits()[edits().length - 1].text;
  const click = (el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));
  const select = (name) => { $('#recordSelect').value = name; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true })); };
  const FORMAT = 'SAISIE';
  select(FORMAT);
  const rec = Model.buildModel(SFGR).records.find((x) => x.name === FORMAT);
  const idx = P.formats.findIndex((f) => f.name === FORMAT);
  const sp = spanOf(SFGR, idx);

  console.log('\nthe format panel: Raw source of the whole format');
  check('the format panel has both Raw sections: the S line and the whole format', !!$('.sfgr-format-panel #sfgrRaw') && !!$('.sfgr-format-panel #sfgrRawFormat'));
  check('  the S line section still holds just that line', $('#sfgrRawText').value === P.lines[rec.sfgr.sourceLine - 1].text);
  check('  the whole-format box holds every line of the format', $('#sfgrRawFormatText').value === rowsOf(SFGR, idx).join('\n') && $('#sfgrRawFormatText').value.split('\n').length === sp.last - sp.first + 1);
  check('  it names the lines, has a ruler of 80 columns and a legend for S, H and D', /Lines \d+ - \d+/.test($('#sfgrRawFormat').textContent) && $('#sfgrRawFormat .sfgr-ruler').textContent.split('\n').every((l) => l.length === 80) && ['S:', 'H:', 'D:'].every((k) => $$('#sfgrRawFormat .sfgr-raw-zones').some((z) => z.textContent.indexOf(k) === 0)));
  check('  the section is closed to start with', $('#sfgrRawFormat').open === false);

  $('#sfgrRawFormat').open = true; $('#sfgrRawFormat').dispatchEvent(new w.Event('toggle'));
  const rows = rowsOf(SFGR, idx);
  const k = rows.findIndex((t, i) => /^ {5}D/.test(t) && i > 2);
  const typed = rows.slice(); typed[k] = typed[k].slice(0, 14) + 'Q' + typed[k].slice(15);
  posted.length = 0;
  $('#sfgrRawFormatText').value = typed.join('\n');
  click($('#sfgrRawFormatApply'));
  check('Apply posts one edit', edits().length === 1);
  check('  it is what the writer gives, only that line changed, no new read errors', lastText() === Writer.setRawFormat(SFGR, idx, typed.join('\n') + '\n').text && errors(lastText()) <= baseErrors);
  check('  the panel shows the same format again, the section still open', $('.sfgr-format-panel').getAttribute('data-sfgr-format') === FORMAT && $('#sfgrRawFormat').open === true);
  check('  the box now holds the edited lines', $('#sfgrRawFormatText').value === typed.join('\n'));

  posted.length = 0;
  $('#sfgrRawFormatText').value = typed.concat([rows[0]]).join('\n');
  click($('#sfgrRawFormatApply'));
  check('a second S specification is refused with the reason, nothing posted', edits().length === 0 && /2 S specifications/.test($('#sfgrRawFormatError').textContent));
  $('#sfgrRawFormatText').value = typed.slice(1).join('\n');
  click($('#sfgrRawFormatApply'));
  check('no S specification is refused too', edits().length === 0 && /needs its S specification/.test($('#sfgrRawFormatError').textContent));
  $('#sfgrRawFormatText').value = typed.join('\n') + '\t';
  click($('#sfgrRawFormatApply'));
  check('a tab is refused', edits().length === 0 && /control character/.test($('#sfgrRawFormatError').textContent));
  click($('#sfgrRawFormatRevert'));
  check('Revert puts the source back and clears the message', $('#sfgrRawFormatText').value === typed.join('\n') && $('#sfgrRawFormatError').textContent === '');

  // a rename inside the box keeps the panel on that format
  posted.length = 0;
  const renamed = typed.slice();
  const sLine = renamed.findIndex((t) => /^ {5}S/.test(t));
  renamed[sLine] = renamed[sLine].slice(0, 6) + 'RENAMED ' + renamed[sLine].slice(14);
  $('#sfgrRawFormatText').value = renamed.join('\n');
  click($('#sfgrRawFormatApply'));
  check('renaming the format in the box keeps the format panel on it', edits().length === 1 && $('.sfgr-format-panel').getAttribute('data-sfgr-format') === 'RENAMED' && $('#recordSelect').value === 'RENAMED');

  // the old S-line Raw section still works next to it
  posted.length = 0;
  const sText = $('#sfgrRawText').value;
  $('#sfgrRawText').value = sText.slice(0, 6) + 'AGAIN   ' + sText.slice(14);
  click($('#sfgrRawApply'));
  check('the entry-level Raw section still applies its one line', edits().length === 1 && /AGAIN/.test(lastText()));

  console.log('\nthe key mask order');
  dom.window.close();
  dom = open(SFGR);
  w = dom.window; doc = w.document;
  select('SELECT');
  const maskOf = (text, name) => Model.buildModel(text).records.find((x) => x.name === name).sfgr.keyMask.text.replace(/ /g, '');
  const chipText = () => $$('#sfgrMaskOrder [data-sfgr-chip]').map((c) => c.textContent).join('');
  check('a format whose mask holds several keys shows them as chips in source order', maskOf(SFGR, 'SELECT') === 'ACEIJ' && chipText() === 'ACEIJ');
  const key = (el, k, shift) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  posted.length = 0;
  key($$('#sfgrMaskOrder [data-sfgr-chip]')[0], 'ArrowRight', true);
  check('Shift+Right moves a key one place later: one edit, mask CAEIJ', edits().length === 1 && maskOf(lastText(), 'SELECT') === 'CAEIJ' && chipText() === 'CAEIJ');
  const changed = linesOf(lastText()).map((l, i) => l === linesOf(SFGR)[i] ? -1 : i).filter((i) => i >= 0);
  check('  only the S line of that format changed', changed.length === 1 && changed[0] === P.formats.find((f) => f.name === 'SELECT').startLine - 1);
  check('  the moved key keeps the focus', doc.activeElement === $$('#sfgrMaskOrder [data-sfgr-chip]')[1] && doc.activeElement.textContent === 'A');
  posted.length = 0;
  key($$('#sfgrMaskOrder [data-sfgr-chip]')[1], 'ArrowLeft', true);
  check('Shift+Left moves it back: the source is the original again', edits().length === 1 && lastText() === SFGR);
  posted.length = 0;
  key($$('#sfgrMaskOrder [data-sfgr-chip]')[0], 'ArrowLeft', true);
  key($$('#sfgrMaskOrder [data-sfgr-chip]')[4], 'ArrowRight', true);
  key($$('#sfgrMaskOrder [data-sfgr-chip]')[2], 'ArrowRight', false);
  check('at the ends, and without Shift, nothing happens', edits().length === 0);

  const fire = (el, type) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
  const chips = () => $$('#sfgrMaskOrder [data-sfgr-chip]');
  posted.length = 0;
  fire(chips()[0], 'dragstart');
  const over = fire(chips()[3], 'dragover');
  fire(chips()[3], 'drop');
  check('dragging the first key onto the fourth moves it there: CEIAJ, one edit', over.defaultPrevented && edits().length === 1 && maskOf(lastText(), 'SELECT') === 'CEIAJ');
  posted.length = 0;
  fire(chips()[2], 'dragstart');
  fire(chips()[2], 'drop');
  check('dropping a key on itself does nothing', edits().length === 0);
  const stray = fire(chips()[1], 'dragover');
  check('a dragover with no drag started is not accepted', stray.defaultPrevented === false);
  fire(chips()[0], 'dragstart'); fire(chips()[0], 'dragend');
  check('dragend clears the drag state', !$('#sfgrMaskOrder .dragging') && !$('#sfgrMaskOrder .over'));

  // the toggles still add and remove keys, and the same mask set is kept by an order change
  posted.length = 0;
  click($('[data-sfgr-mask-char="K"]'));
  check('the key buttons still add a key at the end of the mask', edits().length === 1 && maskOf(lastText(), 'SELECT').endsWith('K'));
  select('SORTIE');
  check('a format with no mask has no chips', $('#sfgrMaskOrder') === null);
  select('CHOIX');
  check('a mask of one key has no chips either (nothing to order)', maskOf(SFGR, 'CHOIX') === 'C' && $('#sfgrMaskOrder') === null);

  console.log('\na source with comments');
  const lines = [S('F1', [[64, 'AB']]), F('A', 2, 2, 5), '', comment('about F2'), S('F2', [[64, '1C?']]), F('B', 2, 2, 5), ''];
  const text2 = src(lines);
  const dom2 = open(text2);
  const d2 = dom2.window.document;
  const q = (s) => d2.querySelector(s);
  q('#recordSelect').value = 'F2'; q('#recordSelect').dispatchEvent(new dom2.window.Event('change', { bubbles: true }));
  const sp2 = spanOf(text2, 1);
  check('the whole-format box starts with the header comment and holds the blank last line', q('#sfgrRawFormatText').value.split('\n')[0] === lines[3] && q('#sfgrRawFormatText').value === rowsOf(text2, 1).join('\n') && /Lines 4 - /.test(q('#sfgrRawFormat').textContent) && sp2.first === 4);
  check('  a stray character in the mask is a chip too, marked', Array.from(d2.querySelectorAll('#sfgrMaskOrder [data-sfgr-chip]')).map((c) => c.textContent).join('') === '1C?' && d2.querySelectorAll('#sfgrMaskOrder .invalid').length === 1);
  posted.length = 0;
  q('#sfgrRawFormatApply').dispatchEvent(new dom2.window.Event('click', { bubbles: true }));
  check('  Apply with nothing changed posts nothing', posted.filter((m) => m.type === 'applyEdit').length === 0 && q('#sfgrRawFormatError').textContent === '');
  dom2.window.close();

  dom.window.close();
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

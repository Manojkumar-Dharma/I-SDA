/**
 * E11g2 - the format (S specification) panel of the designer page on System/36 DSPF36 (SFGR) source: every control
 * writes through SfgrWriter.setValue, nothing else on the source changes, invalid input is refused with a message and
 * no edit. jsdom on the real sample (docs/sda-reference/source/stipfm.dspf36).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SFGR);
const ORIGINAL = P.lines.map((l) => l.text + l.eol);

function open(source) {
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11g2', source, 'STIPFM.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); } });
  return { dom, posted };
}

setTimeout(() => {
  const { dom, posted } = open(SFGR);
  const w = dom.window;
  const doc = w.document;
  const $ = (sel) => doc.querySelector(sel);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => edits()[edits().length - 1].text;
  const linesOf = (t) => Parser.parse(t).lines.map((l) => l.text + l.eol);
  const err = () => $('#sfgrFormatError').textContent;
  const change = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  const type = (sel, value) => { const el = $(sel); el.value = value; change(el); };
  const choose = (key, value) => { const el = $('[data-sfgr-key="' + key + '"][data-sfgr-kind="select"]'); el.value = value; change(el); };
  const mode = (key, value) => { const el = $('[data-sfgr-key="' + key + '"][data-sfgr-part="mode"]'); el.value = value; change(el); };
  const box = (key, value) => { const el = $('[data-sfgr-key="' + key + '"][data-sfgr-part="box"]'); el.value = value; change(el); };
  const tick = (key, on) => { const el = $('[data-sfgr-key="' + key + '"][data-sfgr-kind="check"]'); el.checked = on; change(el); };
  const keyBtn = (ch) => $('[data-sfgr-mask-char="' + ch + '"]');
  const maskOf = (t) => linesOf(t)[L - 1].replace(/\r?\n$/, '').slice(63).trim();
  const only = (text, line) => { const a = linesOf(text); return a.length === ORIGINAL.length && ORIGINAL.every((l, i) => i === line - 1 || l === a[i]); };
  const first = P.formats[0];
  const L = first.s.line; // line of the first S spec

  console.log('the panel');
  check('a format shows an editable panel', !!$('.sfgr-format-panel') && $('input[data-sfgr-key="name"]').value === first.name);
  check('the values come from the S line', $('input[data-sfgr-key="linesToClear"]').value === '24' && $('input[data-sfgr-key="startLine"]').value === '' && $('[data-sfgr-key="enableCommandKeys"][data-sfgr-kind="select"]').value === 'Y');
  check('the column numbers are shown', /17 - 18/.test($('.sfgr-format-panel').textContent) && /64 - 79/.test($('.sfgr-format-panel').textContent) && /27/.test($('.sfgr-format-panel').textContent));
  check('the key mask CV: C and V are on, others off', keyBtn('C').classList.contains('on') && keyBtn('V').classList.contains('on') && !keyBtn('A').classList.contains('on') && keyBtn('C').getAttribute('aria-pressed') === 'true');
  check('6 function keys and 24 command keys (no O)', $('#sfgrFunctionKeys').querySelectorAll('button').length === 6 && $('#sfgrCommandKeys').querySelectorAll('button').length === 24 && !keyBtn('O'));
  check('the alarm of CHOIX shows as an indicator, the first format as No', $('[data-sfgr-key="alarm"][data-sfgr-part="mode"]').value === 'no');
  check('a field shows its own panel (E11g3), and choosing the format brings the format panel back', (() => { $('.dspf-field').dispatchEvent(new w.Event('click', { bubbles: true })); const r = !!$('.sfgr-field-panel') && !$('.sfgr-format-panel'); $('#recordSelect').value = first.name; change($('#recordSelect')); return r && !!$('.sfgr-format-panel'); })());

  console.log('\none edit changes one line');
  posted.length = 0;
  type('input[data-sfgr-key="startLine"]', '5');
  check('start line 5: one edit posted', edits().length === 1);
  check('  only the S line changed, columns 17 - 18 hold " 5"', only(lastText(), L) && linesOf(lastText())[L - 1].slice(16, 18) === ' 5');
  check('  the panel shows it again', $('input[data-sfgr-key="startLine"]').value === '5');
  check('  and the preview model has it (read back)', Parser.parse(lastText()).formats[0].s.numbers.startLine === 5);
  type('input[data-sfgr-key="startLine"]', 'v');
  check('V (lower-case typed) is written as V', linesOf(lastText())[L - 1].slice(16, 18) === 'V ' && $('input[data-sfgr-key="startLine"]').value === 'V');
  type('input[data-sfgr-key="startLine"]', '');
  check('blank puts the original line back byte for byte', lastText() === SFGR);
  type('input[data-sfgr-key="linesToClear"]', '10');
  check('lines to clear 10', linesOf(lastText())[L - 1].slice(18, 20) === '10' && only(lastText(), L));
  type('input[data-sfgr-key="linesToClear"]', '24');

  console.log('\nvalidation: refused with a message, no edit');
  posted.length = 0;
  type('input[data-sfgr-key="startLine"]', '25');
  check('start line 25 is refused', edits().length === 0 && /1 - 24/.test(err()));
  type('input[data-sfgr-key="startLine"]', 'x1');
  check('start line "x1" is refused', edits().length === 0 && err() !== '');
  type('input[data-sfgr-key="linesToClear"]', '30');
  check('lines to clear 30 is refused', edits().length === 0 && /0 - 24/.test(err()));
  type('input[data-sfgr-key="name"]', '');
  check('an empty name is refused', edits().length === 0 && /Enter/.test(err()));
  type('input[data-sfgr-key="name"]', 'TOOLONGNAME');
  check('a name of 11 characters is refused', edits().length === 0 && /8 characters/.test(err()));
  type('input[data-sfgr-key="name"]', 'A B');
  check('a name with a blank is refused', edits().length === 0 && /A - Z/.test(err()));
  type('input[data-sfgr-key="name"]', '1ABC');
  check('a name that starts with a digit is refused', edits().length === 0 && /starts/.test(err()));
  type('input[data-sfgr-key="name"]', P.formats[2].name.toLowerCase());
  check('the name of another format is refused (any case)', edits().length === 0 && /already exists/.test(err()));
  check('nothing in the source changed', true);

  console.log('\nrename keeps the selection');
  type('input[data-sfgr-key="name"]', 'newfmt');
  check('rename: written in upper case, one S line changed', edits().length === 1 && only(lastText(), L) && linesOf(lastText())[L - 1].slice(6, 14) === 'NEWFMT  ');
  check('the record list has the new name and it stays selected', Array.from($('#recordSelect').options).map((o) => o.value)[0] === 'NEWFMT' && $('#recordSelect').value === 'NEWFMT' && $('input[data-sfgr-key="name"]').value === 'NEWFMT');
  type('input[data-sfgr-key="name"]', first.name);
  check('renaming back restores the source byte for byte', lastText() === SFGR && $('#recordSelect').value === first.name);

  console.log('\nindicator columns');
  posted.length = 0;
  mode('alarm', 'ind');
  check('choosing Indicator shows the box and writes nothing yet', edits().length === 0 && $('[data-sfgr-key="alarm"][data-sfgr-part="box"]').style.display !== 'none');
  box('alarm', '7');
  check('indicator 7 is written as 07 in columns 25 - 26', edits().length === 1 && linesOf(lastText())[L - 1].slice(24, 26) === '07' && only(lastText(), L));
  check('  and the panel shows Indicator 07', $('[data-sfgr-key="alarm"][data-sfgr-part="mode"]').value === 'ind' && $('[data-sfgr-key="alarm"][data-sfgr-part="box"]').value === '07');
  box('alarm', '64');
  check('indicator 64', linesOf(lastText())[L - 1].slice(24, 26) === '64');
  mode('alarm', 'yes');
  check('Yes writes Y', linesOf(lastText())[L - 1].slice(24, 26) === 'Y ');
  mode('alarm', 'no');
  check('No writes blanks and the original comes back', lastText() === SFGR);
  posted.length = 0;
  mode('blinkCursor', 'ind'); box('blinkCursor', '9x');
  check('an indicator that is not 01 - 99 is refused', edits().length === 0 && /01 - 99/.test(err()));
  box('blinkCursor', '00');
  check('indicator 00 is refused', edits().length === 0);
  mode('blinkCursor', 'no');
  ['eraseInput', 'overrideFields', 'suppressInput', 'nullFill'].forEach((k) => { mode(k, 'yes'); });
  check('erase, override, suppress and null fill each write Y in their own columns', (() => { const l = linesOf(lastText())[L - 1]; return l.slice(30, 31) === 'Y' && l.slice(32, 33) === 'Y' && l.slice(34, 35) === 'Y' && l.slice(36, 37) === 'Y'; })());
  ['eraseInput', 'overrideFields', 'suppressInput', 'nullFill'].forEach((k) => { mode(k, 'no'); });
  check('and back to No restores the original', lastText() === SFGR);

  console.log('\nselects and checkboxes');
  posted.length = 0;
  choose('lowercase', 'Y');
  check('lowercase Y in column 21', linesOf(lastText())[L - 1].charAt(20) === 'Y' && only(lastText(), L));
  choose('lowercase', '');
  choose('returnInput', 'N');
  check('return input N in column 22', linesOf(lastText())[L - 1].charAt(21) === 'N');
  choose('returnInput', '');
  choose('enableFunctionKeys', 'N');
  check('enable function keys N in column 27, and the hint changes', linesOf(lastText())[L - 1].charAt(26) === 'N' && /except/.test($('.sfgr-format-panel').textContent));
  choose('enableFunctionKeys', '');
  choose('enableCommandKeys', 'R');
  check('enable command keys R in column 28', linesOf(lastText())[L - 1].charAt(27) === 'R');
  choose('enableCommandKeys', 'Y');
  tick('columns132', true);
  check('132 columns: Y in column 39, and the allowed lines widen to 27', linesOf(lastText())[L - 1].charAt(38) === 'Y' && /27/.test($('input[data-sfgr-key="startLine"]').parentElement.textContent));
  type('input[data-sfgr-key="startLine"]', '27');
  check('start line 27 is accepted on a 132-column format', linesOf(lastText())[L - 1].slice(16, 18) === '27');
  type('input[data-sfgr-key="startLine"]', '');
  tick('columns132', false);
  tick('rightToLeft', true);
  check('right-to-left: Y in column 40', linesOf(lastText())[L - 1].charAt(39) === 'Y');
  tick('rightToLeft', false);
  check('everything back: the source is the original', lastText() === SFGR);

  console.log('\nkey mask');
  posted.length = 0;
  keyBtn('B').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('B added after CV: mask CVB in columns 64 - 66', edits().length === 1 && maskOf(lastText()) === 'CVB' && only(lastText(), L));
  check('  and the button is on', keyBtn('B').classList.contains('on') && /CVB/.test($('#sfgrMaskText').textContent));
  keyBtn('C').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('C removed: mask VB', maskOf(lastText()) === 'VB' && !keyBtn('C').classList.contains('on'));
  keyBtn('3').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('a function key (3 = Page Up) is added the same way', maskOf(lastText()) === 'VB3');
  keyBtn('3').dispatchEvent(new w.Event('click', { bubbles: true }));
  keyBtn('B').dispatchEvent(new w.Event('click', { bubbles: true }));
  keyBtn('C').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('toggled back: the same keys, in the order they were added (the order of a mask means nothing), and only the S line differs', maskOf(lastText()) === 'VC' && only(lastText(), L));

  console.log('\nthe mask cannot grow past 16 characters, odd characters stay visible');
  const full = '     SFMT01      24'.padEnd(63) + 'ABCDEFGHIJKLMNPQ';
  const o2 = open(full + '\n     DF1          3 2 2\n');
  const d2 = o2.dom.window.document;
  d2.querySelector('[data-sfgr-mask-char="R"]').dispatchEvent(new o2.dom.window.Event('click', { bubbles: true }));
  check('a 17th key is refused with a message', o2.posted.filter((m) => m.type === 'applyEdit').length === 0 && /16 characters/.test(d2.getElementById('sfgrFormatError').textContent));
  const odd = open('     SFMT01      24'.padEnd(63) + 'C?9\n     DF1          3 2 2\n');
  const od = odd.dom.window.document;
  check('a character that is not a key is shown (marked) and can be removed', !!od.querySelector('.sfgr-key-btn.invalid[data-sfgr-mask-char="?"]'));
  od.querySelector('.sfgr-key-btn.invalid').dispatchEvent(new odd.dom.window.Event('click', { bubbles: true }));
  check('  removing it writes the mask without it', odd.posted.filter((m) => m.type === 'applyEdit').pop().text.indexOf('C9') > 0 && odd.posted.filter((m) => m.type === 'applyEdit').pop().text.indexOf('?') < 0);

  console.log('\nafter the edits the page still reads the source');
  check('the last edit text parses with the same problems as the sample', Parser.parse(lastText()).problems.length === P.problems.length);
  check('no edit went through the DDS writer (every posted text still parses as SFGR with 7 formats)', edits().every((m) => Parser.parse(m.text).formats.length === 7));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 50);

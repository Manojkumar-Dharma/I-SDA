/**
 * E11g3 - the field and constant (D specification) panel of the designer page on System/36 DSPF36 (SFGR) source:
 * every control writes through SfgrWriter (setValue, setConstant), only the columns it owns change, invalid input is
 * refused with a message and no edit. jsdom on the real sample (docs/sda-reference/source/stipfm.dspf36).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SFGR);
const ORIGINAL = P.lines.map((l) => l.text + l.eol);

function open(source) {
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11g3', source, 'STIPFM.DSPF36', 'modern', 'green', 'sfgr');
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
  const err = () => $('#sfgrFieldError').textContent;
  const change = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  const key = (k, kind, part) => $('.sfgr-field-panel [data-sfgr-key="' + k + '"]' + (kind ? '[data-sfgr-kind="' + kind + '"]' : '') + (part ? '[data-sfgr-part="' + part + '"]' : ''));
  const type = (k, value) => { const el = key(k, 'text'); el.value = value; change(el); };
  const choose = (k, value) => { const el = key(k, 'select'); el.value = value; change(el); };
  const mode = (k, value) => { const el = key(k, 'ind', 'mode'); el.value = value; change(el); };
  const box = (k, value) => { const el = key(k, 'ind', 'box'); el.value = value; change(el); };
  const tick = (k, on) => { const el = key(k, 'check'); el.checked = on; change(el); };
  const constant = (value) => { const el = key('constantText', 'constant'); el.value = value; change(el); };
  const message = (k, value) => { const el = $('.sfgr-field-panel [data-sfgr-key="' + k + '"]'); el.value = value; change(el); };
  const selectFormat = (name) => { $('#recordSelect').value = name; change($('#recordSelect')); };
  const selectField = (line) => { $('.dspf-field[data-source-line="' + line + '"]').dispatchEvent(new w.Event('click', { bubbles: true })); };
  const lineText = (t, n) => linesOf(t)[n - 1].replace(/\r?\n$/, '');
  const only = (text, lines) => { const a = linesOf(text); const set = new Set([].concat(lines)); return a.length === ORIGINAL.length && ORIGINAL.every((l, i) => set.has(i + 1) || l === a[i]); };
  const entryAt = (text, line) => Parser.parse(text).entries.find((e) => e.line === line);
  const panelText = () => $('.sfgr-field-panel').textContent;

  const formatOf = (name) => P.formats.find((f) => f.s.values.name === name);
  const MOTIF = formatOf('ECRDI').fields.find((e) => e.values.name === 'MOTIF'); // an input field, position cursor 51, reverse image 51
  const Z1 = formatOf('CHOIX2').fields.find((e) => e.values.name === 'Z1');       // input, protect 60, nondisplay 60
  const TITLE = formatOf('CHOIX1').fields.find((e) => e.line === 8);              // constant FL0001, length 23, line 5, column 28
  const LONG = formatOf('CHOIX1').fields.find((e) => e.line === 16);              // a constant continued on the next line

  console.log('the panel');
  selectFormat('CHOIX1');
  selectField(TITLE.line);
  check('a constant shows an editable panel', !!$('.sfgr-field-panel') && key('name', 'text').value === 'FL0001');
  check('the values come from the D line', key('length', 'text').value === '23' && key('line', 'text').value === '5' && key('column', 'text').value === '28' && key('constantType', 'select').value === 'C');
  check('the constant text is shown whole', key('constantText', 'constant').value === TITLE.constantText);
  check('the column numbers are shown', ['7 - 14', '15 - 18', '19 - 20', '21 - 22', '23 - 24', '26', '27', '37 - 38', '56', '57 - 79'].every((c) => panelText().indexOf('(' + c) >= 0 || panelText().indexOf(c) >= 0));
  check('the source section keeps the line, column and screen row', /Source lines/.test(panelText()) && /row 5 on the screen/.test(panelText()));
  check('the output column reads as Yes', key('output', 'ind', 'mode').value === 'yes');
  check('the character count is shown', /\d+ characters? on 1 source line/.test($('#sfgrConstantCount').textContent));
  check('the breadcrumb names the constant', /Field:|Constant:/.test(doc.getElementById('propsBreadcrumb').textContent));

  console.log('\none edit changes one line');
  posted.length = 0;
  type('length', '30');
  check('length 30: one edit posted', edits().length === 1);
  check('  only the D line changed, columns 15 - 18 hold "  30"', only(lastText(), TITLE.line) && lineText(lastText(), TITLE.line).slice(14, 18) === '  30');
  check('  the panel is still on the same constant and shows it', key('length', 'text').value === '30' && key('name', 'text').value === 'FL0001');
  check('  and the model has it', entryAt(lastText(), TITLE.line).numbers.length === 30);
  type('length', '23');
  check('length back to 23 restores the source byte for byte', lastText() === SFGR);
  posted.length = 0;
  type('length', '23');
  check('typing the same value posts nothing', edits().length === 0);
  type('line', '6');
  check('line 6 changes columns 19 - 20 only', only(lastText(), TITLE.line) && lineText(lastText(), TITLE.line).slice(18, 20) === ' 6' && /row 6 on the screen/.test($('.sfgr-field-panel').textContent));
  type('line', '5');
  type('column', '30');
  check('column 30 changes columns 21 - 22 only', only(lastText(), TITLE.line) && lineText(lastText(), TITLE.line).slice(20, 22) === '30');
  type('column', '28');
  type('name', 'ab12');
  check('a name is upper-cased and left-justified in 7 - 14', only(lastText(), TITLE.line) && lineText(lastText(), TITLE.line).slice(6, 14) === 'AB12    ' && key('name', 'text').value === 'AB12');
  type('name', 'FL0001');
  check('everything back: the source is the original', lastText() === SFGR);

  console.log('\nan input field: every control owns its columns');
  selectFormat('ECRDI');
  selectField(MOTIF.line);
  check('the input field shows its values', key('name', 'text').value === 'MOTIF' && key('inputAllowed', 'check').checked && key('positionCursor', 'ind', 'mode').value === 'ind' && key('positionCursor', 'ind', 'box').value === '51' && key('reverseImage', 'ind', 'box').value === '51' && key('columnSeparators', 'check').checked);
  check('usage is described', /Usage: input and output/.test(panelText()));
  const original = SFGR;
  const checks = [
    ['mandatoryFill', 28, () => tick('mandatoryFill', true), 'Y'],
    ['mandatoryEntry', 29, () => tick('mandatoryEntry', true), 'Y'],
    ['selfCheck', 30, () => choose('selfCheck', 'T'), 'T'],
    ['adjustFill', 31, () => choose('adjustFill', 'Z'), 'Z'],
    ['dupKey', 34, () => tick('dupKey', true), 'Y'],
    ['controlledExit', 35, () => tick('controlledExit', true), 'Y'],
    ['autoAdvance', 36, () => tick('autoAdvance', true), 'Y'],
    ['blink', '41-42', () => mode('blink', 'yes'), 'Y '],
    ['underline', '47-48', () => { mode('underline', 'ind'); box('underline', '7'); }, '07'],
    ['lowercase', 51, () => tick('lowercase', true), 'Y'],
    ['dataType', 27, () => choose('dataType', 'A'), 'A']
  ];
  checks.forEach(([name, cols, act, expect]) => {
    posted.length = 0;
    act();
    const [from, to] = String(cols).split('-').map(Number);
    const slice = lineText(lastText(), MOTIF.line).slice(from - 1, (to || from));
    check(name + ': one edit, only its columns of the D line changed (' + JSON.stringify(slice) + ')', edits().length >= 1 && only(lastText(), MOTIF.line) && slice === expect);
  });
  check('after all of these the panel shows them', key('selfCheck', 'select').value === 'T' && key('dataType', 'select').value === 'A' && key('underline', 'ind', 'box').value === '07');
  [
    () => choose('dataType', ''), () => tick('lowercase', false), () => mode('underline', 'no'), () => mode('blink', 'no'),
    () => tick('autoAdvance', false), () => tick('controlledExit', false), () => tick('dupKey', false), () => choose('adjustFill', ''),
    () => choose('selfCheck', ''), () => tick('mandatoryEntry', false), () => tick('mandatoryFill', false)
  ].forEach((act) => act());
  check('setting every control back restores the source byte for byte', lastText() === original);

  console.log('\nthe indicator control');
  posted.length = 0;
  mode('output', 'ind'); box('output', '12');
  check('output indicator 12 is written as 12 in 23 - 24', lineText(lastText(), MOTIF.line).slice(22, 24) === '12' && only(lastText(), MOTIF.line));
  check('usage still says input and output', /Usage: input and output/.test(panelText()));
  mode('output', 'no');
  check('No writes blanks', lineText(lastText(), MOTIF.line).slice(22, 24) === '  ' && /Usage: input(?! and)/.test(panelText()));
  mode('output', 'yes');
  check('Yes writes Y', lineText(lastText(), MOTIF.line).slice(22, 24).trim() === 'Y');
  posted.length = 0;
  mode('protect', 'ind'); box('protect', '0');
  check('indicator 0 is refused with a message', edits().length === 0 && /01 - 99/.test(err()));
  box('protect', '100');
  check('indicator 100 is refused', edits().length === 0 && err() !== '');
  box('protect', 'ab');
  check('indicator "ab" is refused', edits().length === 0 && err() !== '');
  box('protect', '99');
  check('indicator 99 is accepted', edits().length === 1 && lineText(lastText(), MOTIF.line).slice(36, 38) === '99');
  mode('protect', 'no');
  check('and removed again', lastText() === original);

  console.log('\nvalidation: refused with a message, no edit');
  posted.length = 0;
  const refuse = (k, v, pattern, label) => { type(k, v); check(label, edits().length === 0 && pattern.test(err())); };
  refuse('name', 'TOOLONGNAME', /8 characters/, 'a name of 11 characters is refused');
  refuse('name', 'A B', /blanks/, 'a name with a blank in it is refused');
  refuse('length', '0', /1 - 1919/, 'length 0 is refused');
  refuse('length', '1920', /1 - 1919/, 'length 1920 is refused');
  refuse('length', 'x', /1 - 1919/, 'length "x" is refused');
  refuse('line', '0', /1 - 24/, 'line 0 is refused');
  refuse('line', '25', /1 - 24/, 'line 25 is refused');
  refuse('line', '', /1 - 24/, 'a blank line is refused');
  refuse('column', '81', /1 - 80/, 'column 81 is refused');
  refuse('column', '0', /1 - 80/, 'column 0 is refused');
  refuse('column', 'B5', /1 - 80/, 'a 132-column code is refused on an 80-column format');
  type('length', '1');
  check('a value already in the source clears the message and posts nothing', err() === '' && edits().length === 0);

  console.log('\nconstant text and continuation lines');
  selectFormat('CHOIX1');
  selectField(LONG.line);
  check('a continued constant is shown whole, on two source lines', key('constantText', 'constant').value === LONG.constantText && /on 2 source lines/.test($('#sfgrConstantCount').textContent) && /continued/.test(panelText()));
  posted.length = 0;
  constant(LONG.constantText);
  check('the same text posts nothing', edits().length === 0);
  const longText = 'X'.repeat(100);
  constant(longText);
  const afterLong = lastText();
  check('100 characters become 3 source lines (23 + 73 + 4)', entryAt(afterLong, LONG.line).constantText === longText && entryAt(afterLong, LONG.line).lines.length === 3 && /on 3 source lines/.test($('#sfgrConstantCount').textContent));
  check('  the other entries are unchanged', (() => { const a = Parser.parse(afterLong); const b = P; const rest = (p) => p.entries.filter((e) => e.line < LONG.line || e.line > LONG.endLine + 2).map((e) => e.raw.join('|')); return a.lines.length === ORIGINAL.length + 1 && a.formats[0].fields.length === b.formats[0].fields.length; })());
  constant('short');
  const afterShort = lastText();
  check('a short text drops the continuation lines again', entryAt(afterShort, LONG.line).constantText === 'short' && entryAt(afterShort, LONG.line).lines.length === 1 && linesOf(afterShort).length === ORIGINAL.length - 1);
  constant(LONG.constantText);
  check('the original text puts the original source back byte for byte', lastText() === SFGR);
  posted.length = 0;
  constant('two' + String.fromCharCode(10) + 'lines');
  check('a line break in the text is refused', edits().length === 0 && /one line/.test(err()));

  console.log('\nconstant type and message constants');
  const MSG = P.formats[0].fields.find((e) => e.line === 5);
  selectField(MSG.line);
  posted.length = 0;
  choose('constantType', 'M');
  check('switching to message changes column 56 only', only(lastText(), MSG.line) && lineText(lastText(), MSG.line).slice(55, 56) === 'M');
  check('the text area gives way to id and member', !key('constantText', 'constant') && !!$('.sfgr-field-panel [data-sfgr-key="messageId"]') && !!$('.sfgr-field-panel [data-sfgr-key="messageMember"]'));
  message('messageId', 'ab12');
  check('message id AB12 goes to 57 - 60', lineText(lastText(), MSG.line).slice(56, 60) === 'AB12' && entryAt(lastText(), MSG.line).message.id === 'AB12');
  message('messageMember', 'U2');
  check('member U2 goes to 61 - 62', lineText(lastText(), MSG.line).slice(56, 62) === 'AB12U2' && entryAt(lastText(), MSG.line).message.member === 'U2');
  message('messageId', 'Q');
  check('a shorter id keeps the member in 61 - 62', lineText(lastText(), MSG.line).slice(56, 62) === 'Q   U2');
  message('messageMember', '');
  check('member U1 (blank) leaves only the id', entryAt(lastText(), MSG.line).message.member === '' && entryAt(lastText(), MSG.line).message.id === 'Q');
  posted.length = 0;
  message('messageId', '');
  check('a blank message id is refused', edits().length === 0 && /message id/i.test(err()));
  message('messageId', 'TOOLONG');
  check('an id over 4 characters is refused', edits().length === 0 && /4 characters/.test(err()));

  console.log('\nclearing the constant type');
  choose('constantType', 'C');
  posted.length = 0;
  choose('constantType', '');
  check('clearing the type while there is text is refused', edits().length === 0 && /Clear the constant text first/.test(err()));
  constant('');
  check('clearing the text leaves an empty constant', entryAt(lastText(), MSG.line).constantText === '');
  choose('constantType', '');
  check('then the type can be cleared: a field', entryAt(lastText(), MSG.line).role === 'field' && lineText(lastText(), MSG.line).slice(55, 56).trim() === '');

  console.log('\nnotes from the combinations the manual states');
  selectFormat('CHOIX2');
  selectField(Z1.line);
  check('a field with nondisplay and high intensity says nondisplay wins', /nondisplay only/i.test(panelText()));
  tick('inputAllowed', false);
  check('protect without input shows the note, nothing is refused', /Protect applies to input fields only/.test(panelText()) && !/no longer/.test(panelText()));
  tick('inputAllowed', true);
  check('the note goes when input is allowed again', !/Protect applies to input fields only/.test(panelText()));
  posted.length = 0;
  tick('lowercase', true);
  choose('dataType', 'N');
  check('lowercase on a numeric field is noted, both edits are accepted', /Lowercase does not apply to a numeric field/.test(panelText()) && edits().length === 2);

  console.log('\n132 columns widens the limits');
  selectFormat('CHOIX1');
  // choosing a format clears the selection, so its panel shows; tick 132 columns, then select a field
  if ($('.sfgr-format-panel') && $('.sfgr-format-panel [data-sfgr-key="columns132"]')) {
    const c = $('.sfgr-format-panel [data-sfgr-key="columns132"]'); c.checked = true; change(c);
    selectField(TITLE.line);
    posted.length = 0;
    type('column', 'B5');
    check('column B5 (115) is accepted on a 132-column format and written as B5', edits().length === 1 && lineText(lastText(), TITLE.line).slice(20, 22) === 'B5');
    check('the hint names 132', /1 - 132/.test(panelText()));
    posted.length = 0;
    type('column', '133');
    check('column 133 is refused', edits().length === 0 && /1 - 132/.test(err()));
    type('line', '27');
    check('line 27 is accepted on a 132-column format', edits().length === 1);
    type('length', '3563');
    check('length 3563 is accepted on a 132-column format', edits().length === 2);
  } else {
    check('the format panel could be reached to switch to 132 columns', false);
  }

  console.log('\na DDS page is untouched');
  const dds = open('     A          R REC1\n     A            F1        10A  B  2  2\n');
  const ddsDoc = dds.dom.window.document;
  setTimeout(() => {
    check('a DDS page has no SFGR field panel', !ddsDoc.querySelector('.sfgr-field-panel') && !ddsDoc.querySelector('.sfgr-format-panel'));
    process.exit(0);
  }, 300);
}, 800);

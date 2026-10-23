/**
 * E11g4 - the help (H specification) panel, the locked *DDS blocks, and the SFGR words in the designer page.
 * jsdom on a small SFGR source with two H specifications and a *DDS block (the sample has neither).
 */
'use strict';
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Writer = require('../sfgrWriter.js');

const built = Writer.insertFormat('', { atEnd: true }, {
  s: { name: 'FMT1' },
  help: [
    { name: 'HELP0100', helpFile: 'MYHLP', helpLibrary: 'MYLIB', upperLeft: { row: 2, column: 1 }, lowerRight: { row: 10, column: 60 }, boundary: 'N' },
    { name: 'HELP0200' }
  ],
  fields: [{ name: 'F1', length: 5, line: 3, column: 5, output: 'Y' }]
});
const DDS_TEXT = 'A            X1  10A  O  2  2';
const SOURCE = built.text.replace(/\r?\n?$/, '\n') + Writer.buildLines({ type: 'dds', text: DDS_TEXT }).lines[0] + '\n';
const P = Parser.parse(SOURCE);
const H1 = P.formats[0].help[0].line;
const H2 = P.formats[0].help[1].line;

function open(source) {
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11g4', source, 'HLP.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); } });
  return { dom, posted };
}

setTimeout(() => {
  const { dom, posted } = open(SOURCE);
  const w = dom.window;
  const doc = w.document;
  const $ = (sel) => doc.querySelector(sel);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => edits()[edits().length - 1].text;
  const linesOf = (t) => Parser.parse(t).lines.map((l) => l.text + l.eol);
  const lineText = (t, n) => linesOf(t)[n - 1].replace(/\r?\n$/, '');
  const ORIGINAL = linesOf(SOURCE);
  const only = (text, lines) => { const a = linesOf(text); const set = new Set([].concat(lines)); return a.length === ORIGINAL.length && ORIGINAL.every((l, i) => set.has(i + 1) || l === a[i]); };
  const err = () => $('#sfgrHelpError').textContent;
  const change = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  const k = (key, kind, part) => $('.sfgr-help-panel [data-sfgr-key="' + key + '"]' + (kind ? '[data-sfgr-kind="' + kind + '"]' : '') + (part ? '[data-sfgr-part="' + part + '"]' : ''));
  const type = (key, v) => { const el = k(key, 'text'); el.value = v; change(el); };
  const corner = (key, v) => { const el = k(key, 'corner'); el.value = v; change(el); };
  const mode = (key, v) => { const el = k(key, 'ind', 'mode'); el.value = v; change(el); };
  const box = (key, v) => { const el = k(key, 'ind', 'box'); el.value = v; change(el); };
  const tick = (key, on) => { const el = k(key, 'check'); el.checked = on; change(el); };
  const openHelp = (line) => $('[data-sfgr-help-line="' + line + '"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  const crumbs = () => doc.getElementById('propsBreadcrumb').textContent;

  console.log('the format panel lists help areas and *DDS blocks');
  check('two help areas are listed with their names', $('[data-sfgr-help-line="' + H1 + '"]').textContent.indexOf('HELP0100') >= 0 && $('[data-sfgr-help-line="' + H2 + '"]').textContent.indexOf('HELP0200') >= 0);
  check('a corner pair shows as a range, no corners as a null area', /row 2 col 1 to row 10 col 60/.test($('[data-sfgr-help-line="' + H1 + '"]').textContent) && /null area/.test($('[data-sfgr-help-line="' + H2 + '"]').textContent));
  check('the *DDS block is shown as a locked item with its text', !!$('.sfgr-dds-block') && $('.sfgr-dds-block pre').textContent.indexOf('X1') >= 0 && /locked/i.test(doc.querySelector('.sfgr-format-panel').textContent));
  check('the locked block has no control', $('.sfgr-dds-block').querySelectorAll('input, select, textarea, button').length === 0);
  check('the breadcrumb says Format, not Record', /Format: FMT1/.test(crumbs()) && !/Record:/.test(crumbs()));

  console.log('\nthe help panel');
  openHelp(H1);
  check('clicking a help area opens its panel', !!$('.sfgr-help-panel') && k('name', 'text').value === 'HELP0100');
  check('the breadcrumb says Help area', /Help area/.test(crumbs()));
  check('file, library and corners are shown', k('helpFile', 'text').value === 'MYHLP' && k('helpLibrary', 'text').value === 'MYLIB' && k('ulRow', 'corner').value === '2' && k('ulColumn', 'corner').value === '1' && k('lrRow', 'corner').value === '10' && k('lrColumn', 'corner').value === '60');
  check('boundary N reads as No, restore as Yes (blank)', k('boundary', 'ind', 'mode').value === 'no' && k('restoreFormat', 'ind', 'mode').value === 'yes' && k('suppressSelection', 'ind', 'mode').value === 'no');
  check('the column numbers are shown', ['7 - 14', '16 - 23', '25 - 32', '34 - 37', '39 - 42', '44 - 45', '47 - 48', '50 - 51', '53'].every((c) => $('.sfgr-help-panel').textContent.indexOf(c) >= 0));
  check('suppress selection has no Yes choice (Y is not allowed there)', !Array.from(k('suppressSelection', 'ind', 'mode').options).some((o) => o.value === 'yes'));

  console.log('\none edit changes one line');
  posted.length = 0;
  type('helpFile', 'other');
  check('help file OTHER goes to 16 - 23 only', edits().length === 1 && only(lastText(), H1) && lineText(lastText(), H1).slice(15, 23) === 'OTHER   ' && k('helpFile', 'text').value === 'OTHER');
  type('helpFile', 'MYHLP');
  check('back: source restored byte for byte', lastText() === SOURCE);
  type('helpLibrary', 'LIB2');
  check('library LIB2 goes to 25 - 32', only(lastText(), H1) && lineText(lastText(), H1).slice(24, 32) === 'LIB2    ');
  type('helpLibrary', 'MYLIB');
  type('name', 'help0101');
  check('a help format name is upper-cased into 7 - 14', only(lastText(), H1) && lineText(lastText(), H1).slice(6, 14) === 'HELP0101');
  type('name', 'HELP0100');
  mode('boundary', 'yes');
  check('boundary Yes writes Y in 50 - 51', only(lastText(), H1) && lineText(lastText(), H1).slice(49, 51).trim() === 'Y');
  mode('boundary', 'ind'); box('boundary', '33');
  check('boundary indicator 33 is written', lineText(lastText(), H1).slice(49, 51) === '33');
  mode('boundary', 'no');
  check('boundary No writes N', lineText(lastText(), H1).slice(49, 51).trim() === 'N' && lastText() === SOURCE);
  mode('restoreFormat', 'no');
  check('restore display format No writes N in 47 - 48', only(lastText(), H1) && lineText(lastText(), H1).slice(46, 48).trim() === 'N');
  mode('restoreFormat', 'yes');
  check('restore display format Yes writes blank', lastText() === SOURCE);
  mode('suppressSelection', 'ind'); box('suppressSelection', '07');
  check('suppress selection indicator 07 goes to 44 - 45', only(lastText(), H1) && lineText(lastText(), H1).slice(43, 45) === '07');
  mode('suppressSelection', 'no');
  check('and removed again', lastText() === SOURCE);

  console.log('\nthe corners are one edit');
  posted.length = 0;
  corner('lrRow', '12');
  check('one corner box changed: one edit, only 39 - 42 differ', edits().length === 1 && only(lastText(), H1) && lineText(lastText(), H1).slice(33, 37) === ' 2 1' && lineText(lastText(), H1).slice(38, 42) === '1260');
  corner('lrRow', '10');
  check('back: byte for byte', lastText() === SOURCE);
  posted.length = 0;
  corner('lrRow', '1');
  check('a lower right above the upper left is refused', edits().length === 0 && /at or below and right/.test(err()));
  corner('ulColumn', '81');
  check('column 81 is refused on 80 columns', edits().length === 0 && /1 - 80/.test(err()));
  corner('ulRow', '25');
  check('row 25 is refused on 24 lines', edits().length === 0 && /1 - 24/.test(err()));
  corner('ulRow', 'x');
  check('a letter is refused', edits().length === 0 && /whole numbers/.test(err()));
  $('#sfgrHelpBack').dispatchEvent(new w.Event('click', { bubbles: true, cancelable: true }));
  check('the Back link returns to the format panel', !!$('.sfgr-format-panel') && !$('.sfgr-help-panel') && /Format: FMT1/.test(crumbs()));

  console.log('\na null area');
  openHelp(H2);
  check('an area with no corners shows empty boxes', k('ulRow', 'corner').value === '' && k('lrColumn', 'corner').value === '');
  posted.length = 0;
  corner('ulRow', '3');
  check('filling one box only is refused with a message', edits().length === 0 && /all four/.test(err()));
  corner('ulColumn', '4'); corner('lrRow', '8'); 
  check('three of four still refused', edits().length === 0);
  corner('lrColumn', '70');
  check('all four filled writes both corners in 34 - 37 and 39 - 42', edits().length === 1 && only(lastText(), H2) && lineText(lastText(), H2).slice(33, 37) === ' 3 4' && lineText(lastText(), H2).slice(38, 42) === ' 870');
  check('  and the model reads them', (() => { const e = Parser.parse(lastText()).formats[0].help[1]; return e.upperLeft.row === 3 && e.upperLeft.column === 4 && e.lowerRight.row === 8 && e.lowerRight.column === 70; })());
  corner('ulRow', ''); corner('ulColumn', ''); corner('lrRow', ''); corner('lrColumn', '');
  check('clearing all four writes a null area again: byte for byte', lastText() === SOURCE);

  console.log('\nvalidation of names');
  posted.length = 0;
  const refuse = (key, v, re, label) => { posted.length = 0; type(key, v); check(label, edits().length === 0 && re.test(err())); };
  refuse('name', 'SHORT', /8 characters/, 'a help format name of 5 characters is refused');
  refuse('name', '1ELP0100', /8 characters/, 'a help format name starting with a digit is refused');
  refuse('name', 'HELP01AB', /8 characters/, 'a help format name not ending in two digits is refused');
  refuse('name', '', /Enter a help format name/, 'a blank name is refused');
  refuse('helpFile', 'TOOLONGNAME', /8 characters/, 'a file name over 8 characters is refused');
  refuse('helpFile', 'A B', /8 characters/, 'a file name with a blank is refused');
  type('helpLibrary', 'MYLIB'); 
  $('#sfgrHelpBack').dispatchEvent(new w.Event('click', { bubbles: true, cancelable: true }));
  openHelp(H2);
  refuse('helpLibrary', 'LIB', /goes with a file name/, 'a library without a file name is refused');

  console.log('\nonline documents');
  posted.length = 0;
  tick('onlineDocument', true);
  check('Online document: column 53 only, the 8-character name is also a valid label', edits().length === 1 && only(lastText(), H2) && lineText(lastText(), H2).slice(52, 53) === 'Y');
  check('the labels change to document and folder', /Document name/.test($('.sfgr-help-panel').textContent) && /Folder name/.test($('.sfgr-help-panel').textContent) && /Help text label/.test($('.sfgr-help-panel').textContent));
  type('name', 'MYLABEL');
  check('a 7-character help text label is accepted', edits().length === 2 && lineText(lastText(), H2).slice(6, 14).trim() === 'MYLABEL');
  refuse('name', 'BAD,LAB', /comma/, 'a label with a comma is refused');
  refuse('name', '9LABEL', /starts with/, 'a label starting with a digit is refused');
  refuse('helpFile', 'ALL', /cannot be a document name/, 'ALL is not a document name');
  refuse('helpFile', 'A.B', /none of/, 'a document name with a period is refused');
  refuse('helpLibrary', 'F1', /cannot be a folder name/, 'F1 is not a folder name');
  type('helpFile', 'DOC1'); type('helpLibrary', 'FOLD1');
  check('a document and a folder are written', lineText(lastText(), H2).slice(15, 23).trim() === 'DOC1' && lineText(lastText(), H2).slice(24, 32).trim() === 'FOLD1');
  posted.length = 0;
  posted.length = 0;
  tick('onlineDocument', false);
  check('turning Online document off with a label that is not a help format name is refused', edits().length === 0 && /Not changed/.test(err()));

  console.log('\nthe DDS-only panels are absent');
  $('#sfgrHelpBack').dispatchEvent(new w.Event('click', { bubbles: true, cancelable: true }));
  doc.getElementById('crumb-file').dispatchEvent(new w.Event('click', { bubbles: true }));
  check('the File crumb opens nothing DDS: still an SFGR panel', !!$('.sfgr-format-panel') && !$('.props-tabs') && !/Keywords/.test(doc.getElementById('propsBody').textContent));
  check('no keyword finder and no tab strip are visible', doc.querySelectorAll('.props-tab').length === 0);


  setTimeout(() => process.exit(0), 50);
}, 800);

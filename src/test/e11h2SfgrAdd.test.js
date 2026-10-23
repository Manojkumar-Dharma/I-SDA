/**
 * E11h2 - add in the SFGR designer: a new format, click-to-place of a field or constant, and a help area. Each is one
 * applyEdit and leaves what it adds selected. jsdom on the real sample.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Diagnostics = require('../sfgrDiagnostics.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SFGR);
const linesOf = (t) => Parser.parse(t).lines.map((l) => l.text + l.eol);
const problems = (t) => Diagnostics.analyze(t, {}).diagnostics.length;

setTimeout(() => {
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11h2', SFGR, 'T.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; }; } });
  const w = dom.window, doc = w.document;
  const $ = (sel) => doc.querySelector(sel);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => edits()[edits().length - 1].text;
  const echo = () => { const e = edits()[edits().length - 1]; if (e) w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: e.text } })); };
  const undoAll = () => { echo(); w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: SFGR } })); posted.length = 0; };
  const change = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  const selectFormat = (name) => { $('#recordSelect').value = name; change($('#recordSelect')); };
  const click = (el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));
  const clickScreen = (x, y) => $('.dspf-screen').dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  const baseProblems = problems(SFGR);

  console.log('the buttons');
  check('+ Field, + Constant and + Format are there for SFGR', ['#placeFieldBtn', '#placeConstantBtn', '#sfgrNewFormatBtn'].every((s) => !!$(s)));
  selectFormat('ECRDI');
  check('the format panel has Add help area', !!$('[data-sfgr-action="addHelp"]'));

  console.log('\nnew format');
  const names = P.formats.map((f) => f.name);
  selectFormat('CHOIX1');
  posted.length = 0;
  click($('#sfgrNewFormatBtn'));
  check('+ Format posts one edit', edits().length === 1);
  const nf = Parser.parse(lastText());
  const at = names.indexOf('CHOIX1');
  check('  one format more, right after the selected one, named FORMAT01', nf.formats.length === names.length + 1 && nf.formats[at + 1].name === 'FORMAT01');
  check('  it has no fields and the rest of the source is untouched', nf.formats[at + 1].fields.length === 0 && linesOf(lastText()).length === linesOf(SFGR).length + 1);
  check('  no new problems', nf.problems.length === P.problems.length && problems(lastText()) === baseProblems);
  check('  the new format is selected', $('#recordSelect').value === 'FORMAT01' && !!$('.sfgr-format-panel'));
  echo(); posted.length = 0;
  click($('#sfgrNewFormatBtn'));
  check('a second one is named FORMAT02', Parser.parse(lastText()).formats.some((f) => f.name === 'FORMAT02'));
  undoAll();
  selectFormat(names[names.length - 1]);
  click($('#sfgrNewFormatBtn'));
  check('after the last format it goes to the end', Parser.parse(lastText()).formats.length === names.length + 1 && Parser.parse(lastText()).formats[names.length].name === 'FORMAT01');
  undoAll();

  console.log('\nclick-to-place');
  selectFormat('ECRDI');
  const ecr = P.formats.findIndex((f) => f.name === 'ECRDI');
  const startLine = P.formats[ecr].s.numbers.startLine || 1;
  click($('#placeFieldBtn'));
  check('+ Field arms placement', !!$('.dspf-screen.placing'));
  posted.length = 0;
  clickScreen(305, 155);
  check('the click posts one edit and ends placement', edits().length === 1 && !$('.dspf-screen.placing'));
  const fq = Parser.parse(lastText());
  const added = fq.formats[ecr].fields.length - P.formats[ecr].fields.length === 1 ? fq.formats[ecr].fields.slice(-1)[0] : null;
  check('  one D specification more, at the end of the format', !!added);
  check('  at the clicked line (relative to the start line) and column', !!added && added.values.line.trim() === String(9 - startLine + 1) && added.values.column.trim() === '32');
  check('  an input field of 10 named FIELD01', !!added && added.values.name.trim() === 'FIELD01' && added.values.length.trim() === '10' && added.values.inputAllowed === 'Y');
  check('  no new problems', fq.problems.length === P.problems.length && problems(lastText()) === baseProblems);
  check('  it is drawn and selected: the field panel shows', !!$('.sfgr-field-panel') && !!$('.dspf-field[data-source-line="' + (added && added.line) + '"]'));
  undoAll();

  selectFormat('ECRDI');
  click($('#placeConstantBtn'));
  posted.length = 0;
  clickScreen(5, 0);
  const cq = Parser.parse(lastText());
  const cadded = cq.formats[ecr].fields.slice(-1)[0];
  check('a click on the very first cell puts the entry at column 2 (column 1 never holds a field)', cadded.values.column.trim() === '2' && cadded.values.line.trim() === '1');
  check('a constant is a C specification with the text Text', cadded.values.constantType === 'C' && cadded.constantText === 'Text' && cadded.values.length.trim() === '4');
  check('  no new problems', problems(lastText()) === baseProblems);
  echo(); posted.length = 0;
  check('  it shows on the screen as a constant', Array.from(doc.querySelectorAll('.dspf-field')).some((el) => el.textContent.includes('Text')));
  undoAll();

  selectFormat('ECRDI');
  click($('#placeFieldBtn'));
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  posted.length = 0;
  clickScreen(305, 155);
  check('Esc cancels placement: a click then adds nothing', edits().length === 0);

  console.log('\nadd help area');
  selectFormat('ECRDI');
  posted.length = 0;
  click($('[data-sfgr-action="addHelp"]'));
  check('Add help area posts one edit', edits().length === 1);
  const hq = Parser.parse(lastText());
  const hs = hq.formats[ecr].help;
  check('  the format has one H specification more, before its D specifications', hs.length === P.formats[ecr].help.length + 1 && hs[hs.length - 1].line < hq.formats[ecr].fields[0].line);
  check('  named HELP0001, with no corners (a null area)', hs[hs.length - 1].values.name.trim() === 'HELP0001' && !hs[hs.length - 1].values.upperLeft.trim() && !hs[hs.length - 1].values.lowerRight.trim());
  check('  no new problems', hq.problems.length === P.problems.length && problems(lastText()) === baseProblems);
  check('  the help panel opens on it, and Delete takes it away again', !!$('.sfgr-help-panel'));
  echo(); posted.length = 0;
  click($('[data-sfgr-action="delete"]'));
  check('  deleting it gives the source back byte for byte', edits().length === 1 && lastText() === SFGR);
  undoAll();

  console.log('\nCRLF stays');
  const crlf = P.lines.some((l) => l.eol === '\r\n');
  selectFormat('ECRDI');
  click($('[data-sfgr-action="addHelp"]'));
  check('the added line ends as the neighbours do', !crlf || (lastText().match(/\r\n/g) || []).length === linesOf(lastText()).length - 0 || lastText().split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')));
  dom.window.close();
  process.exit(process.exitCode || 0);
}, 300);

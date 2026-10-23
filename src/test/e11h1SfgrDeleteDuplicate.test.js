/**
 * E11h1 - delete, duplicate and reorder in the SFGR designer: fields, constants, help areas and whole formats, from the
 * panel buttons and the Delete / Ctrl+D keys. Each is one applyEdit. jsdom on the real sample, plus a small source with
 * help areas; and the new SfgrWriter.duplicateFormat on its own.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Writer = require('../sfgrWriter.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const P = Parser.parse(SFGR);
const linesOf = (t) => Parser.parse(t).lines.map((l) => l.text + l.eol);

console.log('SfgrWriter.duplicateFormat');
{
  const n = P.formats.length;
  let allOk = true, sameNames = true, sameLines = true, clean = true, shape = true;
  for (let i = 0; i < n; i++) {
    const r = Writer.duplicateFormat(SFGR, i);
    if (!r.ok) { allOk = false; continue; }
    const q = Parser.parse(r.text);
    if (q.formats.length !== n + 1 || q.formats[i].name !== q.formats[i + 1].name) sameNames = false;
    const span = Writer.formatSpan(P, i);
    const orig = linesOf(SFGR).slice(span.first - 1, span.last).map((l) => l.replace(/\r?\n$/, ''));
    const all = linesOf(r.text).map((l) => l.replace(/\r?\n$/, ''));
    const count = span.last - span.first + 1;
    if (all.slice(span.last, span.last + count).join('|') !== orig.join('|')) sameLines = false;
    if (q.problems.length !== P.problems.length) clean = false;
    if (!(r.touched && r.touched.from === span.last + 1 && r.touched.to === span.last + count)) shape = false;
  }
  check('every format of the sample can be duplicated', allOk);
  check('the copy has the same name and sits right after the original', sameNames);
  check('the copy is the same lines (S, H, D, continuations)', sameLines);
  check('no new problems are made', clean);
  check('touched is the range of the copy', shape);
  const noEol = SFGR.replace(/\r?\n$/, '');
  const last = Writer.duplicateFormat(noEol, n - 1);
  check('the last format of a source with no final line end can be duplicated', last.ok && Parser.parse(last.text).formats.length === n + 1);
  check('an unknown format is refused', Writer.duplicateFormat(SFGR, 99).ok === false);
}

function open(source) {
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11h1', source, 'T.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); } });
  return { dom, posted };
}

setTimeout(() => {
  const { dom, posted } = open(SFGR);
  const w = dom.window, doc = w.document;
  const $ = (sel) => doc.querySelector(sel);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => edits()[edits().length - 1].text;
  const echo = () => { const e = edits()[edits().length - 1]; if (e) w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: e.text } })); };
  const change = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  const selectFormat = (name) => { $('#recordSelect').value = name; change($('#recordSelect')); };
  const selectField = (line) => {
    const el = $('.dspf-field[data-source-line="' + line + '"]');
    if (!el) throw new Error('no field at line ' + line + '; fields: ' + Array.from(doc.querySelectorAll('.dspf-field')).map((x) => x.getAttribute('data-source-line')).join(',') + ' record ' + $('#recordSelect').value);
    el.dispatchEvent(new w.Event('click', { bubbles: true }));
  };
  const action = (a) => $('[data-sfgr-action="' + a + '"]').click();
  const disabled = (a) => $('[data-sfgr-action="' + a + '"]').disabled;
  const key = (k, mod) => doc.body.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mod || {})));
  const confirmDialog = () => $('.confirm-overlay');
  const fieldsOf = (t, f) => Parser.parse(t).formats[f].fields;
  const entryLines = (t, f) => Parser.parse(t).formats[f].fields.map((e) => e.line);
  const formatNames = (t) => Parser.parse(t).formats.map((f) => f.name);
  const fmt = (name) => P.formats.find((f) => f.name === name);

  const CH1 = P.formats.findIndex((f) => f.name === 'CHOIX1');
  const ECR = P.formats.findIndex((f) => f.name === 'ECRDI');
  const MOTIF = fmt('ECRDI').fields.find((e) => e.values.name === 'MOTIF');
  const LONG = fmt('CHOIX1').fields.find((e) => e.line === 16); // a constant on two source lines
  const nLines = (t) => linesOf(t).length;
  const undoAll = () => { echo(); w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: SFGR } })); posted.length = 0; }; // the editor's undo back to the sample
  const lineAt = (t, n) => linesOf(t)[n - 1];

  console.log('\nthe buttons');
  selectFormat('ECRDI');
  selectField(MOTIF.line);
  check('a field panel has Duplicate, Move earlier, Move later and Delete', ['duplicate', 'earlier', 'later', 'delete'].every((a) => !!$('[data-sfgr-action="' + a + '"]')));
  selectField(fmt('ECRDI').fields[0].line);
  check('Move earlier is off for the first entry of a format', disabled('earlier') && !disabled('later'));
  let lastChecked = false;
  for (const f of P.formats) {
    selectFormat(f.name);
    const lastLine = f.fields[f.fields.length - 1].line;
    if (f.fields.length > 1 && $('.dspf-field[data-source-line="' + lastLine + '"]')) {
      selectField(lastLine);
      lastChecked = disabled('later') && !disabled('earlier');
      break;
    }
  }
  check('Move later is off for the last entry of a format', lastChecked);
  selectFormat('ECRDI');

  console.log('\nduplicate and delete a field');
  selectField(MOTIF.line);
  posted.length = 0;
  action('duplicate');
  check('Duplicate posts one edit', edits().length === 1);
  const dup = lastText();
  check('  the source has one entry more, right after the original, with the same values', nLines(dup) === nLines(SFGR) + MOTIF.endLine - MOTIF.line + 1 && fieldsOf(dup, ECR).length === fmt('ECRDI').fields.length + 1 && JSON.stringify(Parser.parse(dup).entries.find((e) => e.line === MOTIF.endLine + 1).values) === JSON.stringify(MOTIF.values));
  check('  the copy is selected', !!$('.sfgr-field-panel') && $('.sfgr-field-panel [data-sfgr-key="name"]').value === 'MOTIF' && /Source lines[^0-9]*446/.test($('.sfgr-field-panel').textContent));
  echo(); posted.length = 0;
  action('delete');
  check('Delete on the copy posts one edit and gives the source back byte for byte', edits().length === 1 && lastText() === SFGR);
  check('  nothing is selected afterwards: the format panel shows', !!$('.sfgr-format-panel') && !$('.sfgr-field-panel'));
  echo(); posted.length = 0;

  console.log('\nthe keys');
  selectField(MOTIF.line);
  key('d', { ctrlKey: true });
  check('Ctrl+D duplicates the selected field: one edit', edits().length === 1 && fieldsOf(lastText(), ECR).length === fmt('ECRDI').fields.length + 1);
  echo(); posted.length = 0;
  key('Delete');
  check('Delete removes the selected copy: one edit, back to the original', edits().length === 1 && lastText() === SFGR);
  echo(); posted.length = 0;
  selectField(MOTIF.line);
  key('Delete');
  check('Delete removes the selected original: one edit, one entry less', edits().length === 1 && fieldsOf(lastText(), ECR).length === fmt('ECRDI').fields.length - 1 && !Parser.parse(lastText()).entries.some((e) => e.values && e.values.name === 'MOTIF' && e.line === MOTIF.line));
  undoAll();

  console.log('\nseveral selected entries');
  selectFormat('ECRDI');
  const ef = fmt('ECRDI').fields;
  selectField(ef[1].line);
  ['mousedown', 'mouseup', 'click'].forEach((t) => $('.dspf-field[data-source-line="' + ef[2].line + '"]').dispatchEvent(new w.MouseEvent(t, { bubbles: true, ctrlKey: true })));
  check('two fields are selected', /2 fields selected/.test(doc.getElementById('propsBreadcrumb').textContent));
  posted.length = 0;
  key('Delete');
  check('Delete removes both in one edit', edits().length === 1 && fieldsOf(lastText(), ECR).length === ef.length - 2 && nLines(lastText()) === nLines(SFGR) - 2);
  undoAll();
  selectField(ef[1].line);
  ['mousedown', 'mouseup', 'click'].forEach((t) => $('.dspf-field[data-source-line="' + ef[2].line + '"]').dispatchEvent(new w.MouseEvent(t, { bubbles: true, ctrlKey: true })));
  key('d', { ctrlKey: true });
  check('Ctrl+D with two selected does nothing (one entry at a time)', edits().length === 0);

  console.log('\na constant on two source lines');
  selectFormat('CHOIX1');
  selectField(LONG.line);
  action('duplicate');
  check('Duplicate copies both lines', nLines(lastText()) === nLines(SFGR) + 2 && Parser.parse(lastText()).entries.find((e) => e.line === LONG.endLine + 1).constantText === LONG.constantText);
  echo(); posted.length = 0;
  action('delete');
  check('Delete of the copy removes both lines', lastText() === SFGR);
  echo(); posted.length = 0;
  selectField(LONG.line);
  action('delete');
  check('Delete of the original removes both lines and leaves no half constant', nLines(lastText()) === nLines(SFGR) - 2 && Parser.parse(lastText()).problems.length === P.problems.length);
  undoAll();

  console.log('\nreorder fields');
  selectFormat('ECRDI');
  const sib = fmt('ECRDI').fields;
  const second = sib[1];
  selectField(second.line);
  action('earlier');
  check('Move earlier posts one edit and puts the entry before the previous one', edits().length === 1 && lineAt(lastText(), sib[0].line) === lineAt(SFGR, second.line) && lineAt(lastText(), second.line) === lineAt(SFGR, sib[0].line) && fieldsOf(lastText(), ECR).length === sib.length && nLines(lastText()) === nLines(SFGR));
  check('  it stays selected, now at the earlier line', !!$('.sfgr-field-panel') && new RegExp('Source lines[^0-9]*' + sib[0].line).test($('.sfgr-field-panel').textContent));
  echo(); posted.length = 0;
  action('later');
  check('Move later puts it back: byte for byte', lastText() === SFGR);
  echo(); posted.length = 0;

  console.log('\nduplicate, move and delete a format');
  selectFormat('CHOIX1');
  action('duplicate');
  check('Duplicate format posts one edit; the copy gets a free name and follows the original', edits().length === 1 && formatNames(lastText()).length === P.formats.length + 1 && formatNames(lastText())[CH1 + 1] === 'CHOIX11');
  check('  the copy has the same fields', Parser.parse(lastText()).formats[CH1 + 1].fields.length === fmt('CHOIX1').fields.length);
  check('  the copy is the one selected', $('#recordSelect').value === 'CHOIX11' && $('.sfgr-format-panel [data-sfgr-key="name"]').value === 'CHOIX11');
  echo(); posted.length = 0;
  action('down');
  check('Move down swaps it with the next format; it stays selected', edits().length === 1 && formatNames(lastText())[CH1 + 2] === 'CHOIX11' && $('#recordSelect').value === 'CHOIX11');
  echo(); posted.length = 0;
  action('up');
  check('Move up puts it back', formatNames(lastText())[CH1 + 1] === 'CHOIX11');
  echo(); posted.length = 0;
  action('delete');
  check('Delete format asks first', !!confirmDialog() && edits().length === 0 && /CHOIX11/.test(confirmDialog().textContent));
  $('.confirm-dialog-cancel').click();
  check('Cancel changes nothing', !confirmDialog() && edits().length === 0);
  action('delete');
  $('.confirm-dialog-confirm').click();
  check('Confirm deletes the format: one edit, the original source is back byte for byte', edits().length === 1 && lastText() === SFGR);
  check('  a neighbour format is shown', $('#recordSelect').value !== '' && !!$('.sfgr-format-panel'));
  echo(); posted.length = 0;
  selectFormat(P.formats[0].name);
  check('Move up is off for the first format', disabled('up') && !disabled('down'));
  selectFormat(P.formats[P.formats.length - 1].name);
  check('Move down is off for the last format', disabled('down') && !disabled('up'));
  selectFormat(P.formats[P.formats.length - 1].name);
  action('delete'); $('.confirm-dialog-confirm').click();
  check('deleting the last format works and selects the one before', formatNames(lastText()).length === P.formats.length - 1 && $('#recordSelect').value === P.formats[P.formats.length - 2].name);
  echo(); posted.length = 0;

  console.log('\nthe last format of a file stays');
  const one = open('     SONLY\n     DF1         5 3 5Y\n');
  const od = one.dom.window.document;
  setTimeout(() => {
    od.querySelector('[data-sfgr-action="delete"]').click();
    check('deleting the only format is refused with a message and no confirm dialog', !od.querySelector('.confirm-overlay') && one.posted.filter((m) => m.type === 'applyEdit').length === 0 && /at least one format/.test(od.getElementById('sfgrFormatError').textContent));
    help();
  }, 300);

  function help() {
    console.log('\nhelp areas');
    const built = Writer.insertFormat('', { atEnd: true }, { s: { name: 'FMT1' }, help: [{ name: 'HELP0100', helpFile: 'MYHLP' }, { name: 'HELP0200' }], fields: [{ name: 'F1', length: 5, line: 3, column: 5, output: 'Y' }] });
    const src = built.text;
    const q = open(src), qd = q.dom.window.document, qw = q.dom.window;
    setTimeout(() => {
      const h = Parser.parse(src).formats[0].help;
      qd.querySelector('[data-sfgr-help-line="' + h[0].line + '"]').dispatchEvent(new qw.Event('click', { bubbles: true }));
      qd.querySelector('[data-sfgr-action="duplicate"]').click();
      const ed = q.posted.filter((m) => m.type === 'applyEdit');
      const afterDup = ed[ed.length - 1] && ed[ed.length - 1].text;
      check('Duplicate on a help area posts one edit and copies it', ed.length === 1 && Parser.parse(afterDup).formats[0].help.length === 3 && Parser.parse(afterDup).formats[0].help[1].values.name === 'HELP0100');
      check('  the copy is the open help area', /Source line[^0-9]*3/.test(qd.querySelector('.sfgr-help-panel').textContent));
      qw.dispatchEvent(new qw.MessageEvent('message', { data: { type: 'externalUpdate', text: afterDup } }));
      qd.querySelector('[data-sfgr-action="delete"]').click();
      const ed2 = q.posted.filter((m) => m.type === 'applyEdit');
      check('Delete on the copy gives the source back byte for byte and returns to the format', ed2.length === 2 && ed2[1].text === src && !!qd.querySelector('.sfgr-format-panel') && !qd.querySelector('.sfgr-help-panel'));
      process.exit(0);
    }, 300);
  }
}, 800);

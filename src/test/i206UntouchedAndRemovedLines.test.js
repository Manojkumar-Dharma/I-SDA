/**
 * i206UntouchedAndRemovedLines.test.js
 *
 * I-206 / I-207 (docs/sda-reference/keywordFixes.md): nothing an edit does to a line it did not
 * mean to change, or to a line it removes, throws the author's text away.
 *   I-206  a line the edit leaves as it was comes back exactly as it was: its number, its
 *          spacing, anything past column 80 (an earlier modification tag), and an 'O' on the
 *          first condition of a group (which the compiler ignores).
 *   I-207  with DspfWriter.setKeepRemovedLines(true) - the isda.keepRemovedLines setting - a
 *          line an edit removes (a keyword dropped, a field or record deleted) stays as a comment.
 * Run with: node src/test/i206UntouchedAndRemovedLines.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { parseDspf } = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
const parse = (lines) => parseDspf(lines.join('\n') + '\n');
const tagged = (s, tag) => pad(s, 80) + tag;

const src = [
  '00100A          R REC1',
  '00200A            FLD1          10A  B  3  5',
  tagged('00300A  21                                  COLOR(RED)', 'MK1026'),
  tagged('00400AO 22                                  COLOR(GRN)', 'MK1027'),
  '00500A                                      DSPATR(HI)',
  '00600A            FLD2           5S 0O  5  5',
  '00700A          R REC2',
];

console.log('I-206: lines an edit leaves alone come back exactly as they were');
{
  DspfWriter.setKeepRemovedLines(false);
  const f = parse(src).records[0].fields[0];
  const out = DspfWriter.applyFieldUpdate(f, src, { column: 6 });
  check('the COLOR(RED) line keeps its tag past column 80', out.includes(src[2]));
  check('the COLOR(GRN) line keeps its tag and its O (an O on the first condition after a keyword line)', out.includes(src[3]));
  check('the line after the field and the next record are untouched', out.includes(src[5]) && out.includes(src[6]));
  const same = DspfWriter.applyFieldUpdate(f, src, {});
  check('an edit that changes nothing returns the entry byte for byte (the folded DSPATR line aside)', same.includes(src[2]) && same.includes(src[3]));
}

console.log('\nI-207: a removed keyword stays as a comment');
{
  DspfWriter.setKeepRemovedLines(false);
  const f = parse(src).records[0].fields[0];
  const dropKw = (name) => f.keywords.filter((k) => k.name !== name);
  const off = DspfWriter.applyFieldUpdate(f, src, { keywords: dropKw('DSPATR') });
  check('off (the writer default): the DSPATR line is simply gone', !off.some((l) => l.includes('DSPATR(HI)')));
  check('getKeepRemovedLines reports the switch', DspfWriter.getKeepRemovedLines() === false);
  DspfWriter.setKeepRemovedLines(true);
  check('and reports it on', DspfWriter.getKeepRemovedLines() === true);
  const on = DspfWriter.applyFieldUpdate(f, src, { keywords: dropKw('DSPATR') });
  check('on: the DSPATR line is kept with its number, as a comment', on.includes('00500A*                                     DSPATR(HI)'));
  check('it sits where it was, after the colour lines', on.indexOf('00500A*                                     DSPATR(HI)') > on.indexOf(src[3]));
  const merged = DspfWriter.applyFieldUpdate(f, src, { column: 6 });
  check('a keyword that moved onto the field line is not also kept as a comment', merged.filter((l) => l.includes('DSPATR(HI)')).length === 1);
  const orDrop = DspfWriter.applyFieldUpdate(f, src, { keywords: dropKw('COLOR') });
  check('a removed OR line keeps its O: the * goes in front of it', orDrop.some((l) => l.startsWith('00400A*O 22') && l.includes('COLOR(GRN)')));
  check('the removed colour lines keep their tags', orDrop.some((l) => l.includes('MK1026')) && orDrop.some((l) => l.includes('MK1027')));
}

console.log('\nI-207: a deleted field or record stays as comments');
{
  DspfWriter.setKeepRemovedLines(false);
  const m = parse(src);
  const plain = DspfWriter.deleteField(m.records[0].fields[0], src);
  check('off: deleting FLD1 removes its lines', !plain.some((l) => l.includes('FLD1')) && plain.length === 3);
  DspfWriter.setKeepRemovedLines(true);
  const out = DspfWriter.deleteField(m.records[0].fields[0], src);
  check('on: deleting FLD1 keeps every line, commented, in place', out.length === src.length && out[1].startsWith('00200A*') && out[2].startsWith('00300A*') && out[3].startsWith('00400A*O 22') && out[4].startsWith('00500A*'));
  check('the tags survive on the commented lines', out[2].includes('MK1026') && out[3].includes('MK1027'));
  check('the field after it and the record header are untouched', out[5] === src[5] && out[0] === src[0] && out[6] === src[6]);
  const rec = DspfWriter.deleteRecord(m.records[0], src);
  check('on: deleting REC1 comments out its header and every field, and leaves REC2', rec.length === src.length && rec[0].startsWith('00100A*') && rec[5].startsWith('00600A*') && rec[6] === src[6]);
  const withComment = ['00100A          R REC1', '00200A            FLD1          10A  B  3  5', '00250A* a note', '00300A            FLD2           5S 0O  5  5'];
  const m2 = parse(withComment);
  const keepNote = DspfWriter.deleteFields([m2.records[0].fields[0]], withComment);
  check('lines that already are comments stay exactly as they were', keepNote.includes('00250A* a note'));
  DspfWriter.setKeepRemovedLines(false);
}

console.log('\nDisplay designer: the setting reaches the writer, and tracking takes over when it is on');
function dspfDom(nonce) {
  const text = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }),
    buildLine({ seq: '00020', name: 'FLD1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }),
  ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', nonce, text, 'KEEP.DSPF');
  const posted = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    },
  });
  return { dom, posted };
}
function deleteFld1(dom, posted) {
  const doc = dom.window.document;
  const { Event, KeyboardEvent } = dom.window;
  const fieldEl = Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.textContent.includes('FLD1'));
  fieldEl.dispatchEvent(new Event('click', { bubbles: true }));
  doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  const last = posted[posted.length - 1];
  return (last && last.type === 'applyEdit' ? last.text : '').split(/\r\n|\r|\n/);
}
{
  const { dom, posted } = dspfDom('i206a');
  setTimeout(() => {
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: false, tag: '', position: 'end', keepRemoved: true }, '*');
    setTimeout(() => {
      const lines = deleteFld1(dom, posted);
      check('keepRemovedLines on, tracking off: the deleted field stays as a comment', lines.some((l) => l.charAt(6) === '*' && l.includes('FLD1') && l.includes('10A')));
      next();
    }, 0);
  }, 0);
}
function next() {
  const { dom, posted } = dspfDom('i206b');
  setTimeout(() => {
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: true, tag: 'MK1', position: 'end', keepRemoved: true }, '*');
    setTimeout(() => {
      const lines = deleteFld1(dom, posted);
      const commented = lines.filter((l) => l.charAt(6) === '*' && l.includes('FLD1'));
      check('with tracking on and a tag, tracking comments the field out once (no double comment)', commented.length === 1 && !/\*[^ ]*\*/.test(commented[0].slice(5, 9)));
      done();
    }, 0);
  }, 0);
}
function done() {
  const { dom, posted } = dspfDom('i206c');
  setTimeout(() => {
    dom.window.postMessage({ type: 'modTrackingConfig', enabled: false, tag: '', position: 'end' }, '*');
    setTimeout(() => {
      const lines = deleteFld1(dom, posted);
      check('without the setting a delete removes the lines, as before', !lines.some((l) => l.includes('FLD1')));
      console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
      process.exit(failureCount() === 0 ? 0 : 1);
    }, 0);
  }, 0);
}

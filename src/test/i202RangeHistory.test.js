/**
 * i202RangeHistory.test.js
 *
 * I-202 / I-203 / I-204 (docs/sda-reference/keywordFixes.md): what an edit does to the lines
 * around the entry it rewrites, and where modification tracking puts its tag.
 *   I-202  a comment or blank line INSIDE a record's or field's lines survives an edit of that
 *          entry, and every regenerated line keeps the sequence number of the line it is.
 *   I-203  commenting out an OR line ('O' in column 7) keeps the 'O'.
 *   I-204  the tag can go to columns 1-5 (up to 5 characters) instead of columns 81-90.
 * Pure Node. Run with: node src/test/i202RangeHistory.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { parseDspf } = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');

function parse(lines) {
  return parseDspf(lines.join('\n') + '\n');
}
const field = (lines, i, j) => parse(lines).records[i].fields[j];
const record = (lines, i) => parse(lines).records[i];

console.log('I-202: a comment line inside a field survives an edit of that field');
{
  const src = [
    '00100A          R REC1',
    '00200A            FLD1          10A  B  3  5',
    '00300A                                      DSPATR(HI)',
    '00400A* inner comment',
    '00500A                                      COLOR(RED)',
    '00600A            FLD2           5S 0O  5  5',
    '00700A          R REC2',
  ];
  const out = DspfWriter.applyFieldUpdate(field(src, 0, 0), src, { column: 6 });
  check('the comment line is still there, whole', out.includes('00400A* inner comment'));
  check('the field line carries the new column and keeps its number', out.some((l) => l.startsWith('00200A') && /3  6/.test(l)));
  check('the untouched COLOR(RED) line keeps its own number 00500', out.some((l) => l.startsWith('00500A') && l.includes('COLOR(RED)')));
  const ci = out.indexOf('00400A* inner comment');
  check('the comment still sits between DSPATR(HI) and COLOR(RED)', out[ci - 1].includes('DSPATR(HI)') && out[ci + 1].includes('COLOR(RED)'));
  check('the lines after the field are untouched', out[out.length - 1] === '00700A          R REC2' && out.includes('00600A            FLD2           5S 0O  5  5'));

  const out2 = DspfWriter.applyFieldUpdate(field(src, 0, 0), src, {});
  check('an edit that changes nothing leaves the comment where it was', out2.includes('00400A* inner comment'));

  const added = DspfWriter.applyFieldUpdate(field(src, 0, 0), src, {
    keywords: field(src, 0, 0).keywords.concat([{ name: 'DSPATR', parameters: 'UL', conditions: [] }]),
  });
  check('adding a keyword keeps the comment and the existing numbers', added.includes('00400A* inner comment') && added.some((l) => l.startsWith('00500A') && l.includes('COLOR(RED)')));
}

console.log('\nI-202: a blank line inside a field survives, and a comment inside a record header too');
{
  const src = ['00100A          R REC1', '00200A            FLD1          10A  B  3  5', '00300A                                      DSPATR(HI)', '', '00500A                                      COLOR(RED)', '00600A            FLD2           5S 0O  5  5'];
  const out = DspfWriter.applyFieldUpdate(field(src, 0, 0), src, { column: 6 });
  check('the blank line is kept', out.some((l) => l.trim() === ''));

  const rec = ['00100A          R REC1                      TEXT(\'x\')', '00150A* note in record header', '00200A                                      OVERLAY', '00300A            FLD1          10A  B  3  5', '00400A          R REC2'];
  const r = record(rec, 0);
  const out2 = DspfWriter.applyRecordUpdate(r, rec, { keywords: r.keywords.concat([{ name: 'ALARM', parameters: '', conditions: [] }]) });
  check('the record header keeps its comment line', out2.includes('00150A* note in record header'));
  check('the record header keeps its OVERLAY number 00200', out2.some((l) => l.startsWith('00200A') && l.includes('OVERLAY')));
  check('the field and next record are untouched', out2.includes('00300A            FLD1          10A  B  3  5') && out2.includes('00400A          R REC2'));
}

console.log('\nI-202: sequence numbers and odd prefixes');
{
  const src = ['     H          R REC1', '12345  DSPSIZ(24 80 *DS3)', '     A            FLD1          10A  B  3  5', 'ABCDEA            FLD2           5S 0O  5  5'];
  const m = parse(src);
  const r = m.records[0];
  const out = DspfWriter.applyFieldUpdate(r.fields[r.fields.length - 1], src, { column: 9 });
  check('text in columns 1-5 is kept on the edited line', out[out.length - 1].startsWith('ABCDEA') && /5  9/.test(out[out.length - 1]));
  check('the other lines are byte-identical', out[0] === src[0] && out[1] === src[1] && out[2] === src[2]);

  const same = ['00100A          R REC1', '00200A            FLD1          10A  B  3  5', '00300A  21', '00400AO 22', '00450A                                      COLOR(RED)', '00500A  30                                  DSPATR(HI)', '00600A            FLD2           5S 0O  5  5'];
  const o = DspfWriter.applyFieldUpdate(field(same, 0, 0), same, { column: 6 });
  check('the AND line keeps 00300 and the OR line keeps 00400 with its O', o.some((l) => l.startsWith('00300A  21')) && o.some((l) => l.startsWith('00400AO 22')));
  check('DSPATR(HI) keeps its own number 00500 although the line before it was merged away', o.some((l) => l.startsWith('00500A  30') && l.includes('DSPATR(HI)')));
}

console.log('\nI-202: a kept comment never lands between a line and its continuation');
{
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
  const orig = ['00100A          R REC1', '00200A            FLD1          10A  B  3  5', '00250A* c', '00300A            FLD2           5S 0O  5  5'];
  const contLine = pad("     A                                      TEXT('a", 79) + '+';
  const next = ['     A          R REC1', contLine, '     A            FLD2           5S 0O  5  5'];
  const out = DspfWriter.restampSequenceNumbers(next, orig);
  const ci = out.indexOf('00250A* c');
  check('the comment is kept', ci >= 0);
  check('it is not placed straight after the line that ends in +', ci < 0 || !out[ci - 1].endsWith('+'));
  const plain = DspfWriter.restampSequenceNumbers(['     A          R REC1', '     A            FLD1          10A  B  3  6', '     A            FLD2           5S 0O  5  5'], orig);
  check('without a continuation the comment keeps its place before FLD2', plain.indexOf('00250A* c') === plain.findIndex((l) => l.includes('FLD2')) - 1);
}

console.log('\nI-203: commenting out an OR line keeps its O');
{
  check('a blank column 7 is replaced by the *, as before', DspfWriter.commentOutLine('     A            FLD1      10A  B  3  5') === '     A*           FLD1      10A  B  3  5');
  check('an O in column 7 is kept: the * goes in front of it', DspfWriter.commentOutLine('00400AO 22                                  COLOR(GRN)') === '00400A*O 22                                  COLOR(GRN)');
  check('the commented OR line still holds its indicator text unchanged', DspfWriter.commentOutLine('     AO 11').slice(7) === 'O 11');
  const oldL = ['     A          R REC1', '     A            FLD1          10A  B  3  5', '     A  21                                  COLOR(RED)', '     AO 22                                  COLOR(GRN)'];
  const newL = ['     A          R REC1', '     A            FLD1          10A  B  3  5', '     A  21                                  COLOR(BLU)'];
  const out = DspfWriter.applyModificationTracking(oldL, newL, { enabled: true, tag: 'MK1' });
  check('tracking an edit that drops the OR line keeps its O in the commented copy', out.includes('     A*O 22                                  COLOR(GRN)'));
}

console.log('\nI-204: the tag in columns 1-5');
{
  check('the limit is 10 at the end of the line and 5 in columns 1-5', DspfWriter.modTagMaxLength('end') === 10 && DspfWriter.modTagMaxLength('sequence') === 5 && DspfWriter.modTagMaxLength() === 10);
  check('buildModTag cuts to 5 for columns 1-5', DspfWriter.buildModTag('ABCDEFGH', 'sequence') === 'ABCDE');
  check('buildModTag still cuts to 10 by default', DspfWriter.buildModTag('ABCDEFGHIJKLM') === 'ABCDEFGHIJ');
  check('appendModTag in columns 1-5 replaces the number and pads to five', DspfWriter.appendModTag('00300A  21     COLOR(BLU)', 'MK1', 'sequence') === 'MK1  A  21     COLOR(BLU)');
  check('a 5-character tag fills columns 1-5', DspfWriter.appendModTag('00300A            FLD1', 'ABCDE', 'sequence') === 'ABCDEA            FLD1');
  check('a line shorter than 6 columns takes just the tag', DspfWriter.appendModTag('A', 'T1', 'sequence') === 'T1');
  check('the end-of-line tag is unchanged', DspfWriter.appendModTag('     A  FLD', 'TAG', 'end').slice(80, 83) === 'TAG');

  const oldL = ['00100A          R REC1', '00200A            FLD1          10A  B  3  5', '00300A                                      COLOR(RED)'];
  const newL = ['00100A          R REC1', '00200A            FLD1          10A  B  3  5', '00300A                                      COLOR(BLU)'];
  const out = DspfWriter.applyModificationTracking(oldL, newL, { enabled: true, tag: 'JDOE0902', position: 'sequence' });
  check('the changed line carries the 5-character tag in columns 1-5', out.some((l) => l.startsWith('JDOE0A') && l.includes('COLOR(BLU)')));
  check('nothing is written past column 80', out.every((l) => l.length <= 80));
  check('the old line is commented out and keeps its own number', out.includes('00300A*                                     COLOR(RED)') || out.some((l) => l.startsWith('00300A*') && l.includes('COLOR(RED)')));
  check('the lines that did not change carry no tag', out[0] === oldL[0] && out[1] === oldL[1]);
  const off = DspfWriter.applyModificationTracking(oldL, newL, { enabled: true, tag: 'JDOE0902' });
  check('without a position the tag still goes after column 80', off.some((l) => l.includes('COLOR(BLU)') && l.slice(80, 90) === 'JDOE0902'));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * modificationTracking.test.js
 *
 * Direct unit coverage for Task L38 (docs/sda-reference/LIMITATIONS-PLAN.md) -
 * DspfWriter.commentOutLine / buildModTag / appendModTag / applyModificationTracking,
 * the primitives behind the DSPF designer's "Track modifications" checkbox
 * and modification-tag box. Pure Node, no vscode/jsdom needed.
 * Run with: node src/test/modificationTracking.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

console.log('DspfWriter.commentOutLine()');
{
  check(
    'flips column 7 to * and preserves everything else, including trailing content',
    DspfWriter.commentOutLine('     A            FLD1      10A  B  3  5') === '     A*           FLD1      10A  B  3  5'
  );
  check(
    'a too-short line is padded (not truncated) before column 7 is addressed',
    DspfWriter.commentOutLine('A1') === 'A1    *'
  );
  check('null/undefined is handled without throwing', DspfWriter.commentOutLine(null) === '      *'.replace(/\s+$/, ''));
}

console.log('\nDspfWriter.buildModTag()');
{
  check('passes a short tag through unchanged', DspfWriter.buildModTag('JDOE') === 'JDOE');
  check('truncates to 10 characters', DspfWriter.buildModTag('12345678901234') === '1234567890');
  check('strips embedded newlines/carriage returns', DspfWriter.buildModTag('AB\nCD\r\nEF') === 'ABCDEF');
  check('blank/undefined input yields an empty tag', DspfWriter.buildModTag(undefined) === '' && DspfWriter.buildModTag('') === '');
}

console.log('\nDspfWriter.appendModTag()');
{
  const tagged = DspfWriter.appendModTag('A1', 'JDOE0902');
  check('short line is padded out to column 80 before the tag is appended', tagged.length === 88);
  check('tag lands starting at column 81 exactly', tagged.slice(80) === 'JDOE0902');
  check('an empty/falsy tag is a no-op, line returned unchanged', DspfWriter.appendModTag('A1', '') === 'A1');
  const already80 = 'X'.repeat(80);
  check('an already-80-column line gets the tag appended with no extra padding', DspfWriter.appendModTag(already80, 'TAG').length === 83);
}

console.log('\nDspfWriter.applyModificationTracking() - disabled is always a no-op');
{
  const oldLines = ['A1', 'A2', 'A3'];
  const newLines = ['A1', 'CHANGED', 'A3'];
  check('options.enabled=false returns newLines completely unchanged', DspfWriter.applyModificationTracking(oldLines, newLines, { enabled: false, tag: 'TAG' }) === newLines);
  check('a blank tag with enabled=true is also a no-op', DspfWriter.applyModificationTracking(oldLines, newLines, { enabled: true, tag: '' }) === newLines);
  check('no options at all is a no-op', DspfWriter.applyModificationTracking(oldLines, newLines) === newLines);
}

console.log('\nDspfWriter.applyModificationTracking() - a single changed line');
{
  const oldLines = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R RECORD1',
    '     A            FLD1      10A  B  3  5',
  ];
  const newLines = oldLines.slice();
  newLines[2] = '     A            FLD1      10A  B  3 10';
  const out = DspfWriter.applyModificationTracking(oldLines, newLines, { enabled: true, tag: 'JDOE0902' });

  check('untouched lines before the change are left byte-for-byte alone', out[0] === oldLines[0] && out[1] === oldLines[1]);
  check('grew by exactly one line (the old line preserved as a comment, plus the new tagged line)', out.length === oldLines.length + 1);
  check('the ORIGINAL line is preserved verbatim except column 7, now a comment', out[2] === '     A*           FLD1      10A  B  3  5');
  check('the NEW line carries the changed content plus the tag in columns 81-90', out[3].indexOf('FLD1      10A  B  3 10') > 0 && out[3].slice(80) === 'JDOE0902');
}

console.log('\nDspfWriter.applyModificationTracking() - a wholly new/inserted line');
{
  const oldLines = ['A1', 'A2', 'A3'];
  const newLines = ['A1', 'A2', 'NEW', 'A3'];
  const out = DspfWriter.applyModificationTracking(oldLines, newLines, { enabled: true, tag: 'MOD1' });
  check('no comment is manufactured for a pure insertion - nothing existed to preserve', out.length === 4);
  check('the brand-new line gets tagged', out[2].slice(80) === 'MOD1');
  check('lines before/after the insertion are untouched', out[0] === 'A1' && out[1] === 'A2' && out[3] === 'A3');
}

console.log('\nDspfWriter.applyModificationTracking() - a removed line is kept as history, not dropped');
{
  const oldLines = ['A1', 'A2', 'A3'];
  const newLines = ['A1', 'A3'];
  const out = DspfWriter.applyModificationTracking(oldLines, newLines, { enabled: true, tag: 'MOD1' });
  check('the removed line survives as a comment rather than vanishing', out.length === 3 && out[1] === 'A2    *');
  const outBlank = DspfWriter.applyModificationTracking(['A1', '   ', 'A3'], ['A1', 'A3'], { enabled: true, tag: 'MOD1' });
  check('blank removed line: nothing preserved, file just shrinks', outBlank.length === 2 && outBlank[0] === 'A1' && outBlank[1] === 'A3');
}

console.log('\nDspfWriter.applyModificationTracking() - an edit with no actual line differences');
{
  const oldLines = ['A1', 'A2', 'A3'];
  const newLines = ['A1', 'A2', 'A3'];
  check('identical before/after produces no comments/tags at all', DspfWriter.applyModificationTracking(oldLines, newLines, { enabled: true, tag: 'MOD1' }).join('\n') === oldLines.join('\n'));
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

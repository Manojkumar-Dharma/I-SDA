/**
 * i133GutterMinimumWriterBackstop.test.js
 *
 * Task I-133 - opened from a deferred finding of the I-121 SNGCHCFLD /
 * MLTCHCFLD slice. SNGCHCFLD's and MLTCHCFLD's DDS Reference sections say
 * the *GUTTER width "must be a positive integer of at least 2"; PSHBTNFLD's
 * says "The gutter value must be a number greater than one." The panels'
 * Apply buttons already refused a gutter below 2, but the writer backstops
 * setChoiceSelectionType and setPshbtnfld (I-63) only tested `gutter > 0`,
 * so a caller that bypassed the panel could write `(*GUTTER 1)`. Both now
 * drop a gutter below the minimum keywordSpec.js states, the same silent
 * drop the backstops already apply to a gutter without *NUMCOL / *NUMROW.
 *
 * Run with: node src/test/i133GutterMinimumWriterBackstop.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const sel = (kind, gutter, extra) => DspfWriter.setChoiceSelectionType([], Object.assign({ kind, flags: [], numCol: '3', numRow: '', gutter }, extra || {}))[0].parameters;
const pb = (gutter, extra) => DspfWriter.setPshbtnfld([], Object.assign({ present: true, restrict: '', numCol: '2', numRow: '', gutter }, extra || {}))[0].parameters;

console.log('\nspec fact');
{
  check('SNGCHCFLD / MLTCHCFLD / PSHBTNFLD minimum is 2', ['SNGCHCFLD', 'MLTCHCFLD', 'PSHBTNFLD'].every((k) => KeywordSpec.gutterMinimum(k) === 2));
  check('a keyword with no fact -> 0 (also unknown / blank / null)', KeywordSpec.gutterMinimum('DSPATR') === 0 && KeywordSpec.gutterMinimum('NOSUCH') === 0 && KeywordSpec.gutterMinimum('') === 0 && KeywordSpec.gutterMinimum(null) === 0);
  check('only these three carry it', Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.gutterMinimum(n) > 0).sort().join() === 'MLTCHCFLD,PSHBTNFLD,SNGCHCFLD');
}

console.log('\nsetChoiceSelectionType');
['SNGCHCFLD', 'MLTCHCFLD'].forEach((kind) => {
  check(kind + ': gutter 1 is dropped', sel(kind, '1') === '(*NUMCOL 3)');
  check(kind + ': gutter 2 is written', sel(kind, '2') === '(*NUMCOL 3) (*GUTTER 2)');
  check(kind + ': gutter 5 is written', sel(kind, '5') === '(*NUMCOL 3) (*GUTTER 5)');
  check(kind + ': gutter 0 / blank / junk are dropped', sel(kind, '0') === '(*NUMCOL 3)' && sel(kind, '') === '(*NUMCOL 3)' && sel(kind, 'x') === '(*NUMCOL 3)');
  check(kind + ': *NUMROW works the same', sel(kind, '1', { numCol: '', numRow: '4' }) === '(*NUMROW 4)' && sel(kind, '2', { numCol: '', numRow: '4' }) === '(*NUMROW 4) (*GUTTER 2)');
  check(kind + ': a valid gutter without NUMCOL / NUMROW is still dropped (unchanged)', sel(kind, '3', { numCol: '', numRow: '' }) === '');
});
check('flags stay ahead of the layout group', sel('SNGCHCFLD', '2', { flags: ['*RSTCSR'] }) === '*RSTCSR (*NUMCOL 3) (*GUTTER 2)');
check('blank kind still removes the keyword', DspfWriter.setChoiceSelectionType([{ name: 'SNGCHCFLD', parameters: '', conditions: [] }], { kind: '', flags: [] }).length === 0);

console.log('\nsetPshbtnfld');
{
  check('gutter 1 is dropped', pb('1') === '(*NUMCOL 2)');
  check('gutter 2 is written', pb('2') === '(*NUMCOL 2) (*GUTTER 2)');
  check('gutter 3 is written', pb('3') === '(*NUMCOL 2) (*GUTTER 3)');
  check('gutter 0 / blank / junk are dropped', pb('0') === '(*NUMCOL 2)' && pb('') === '(*NUMCOL 2)' && pb('x') === '(*NUMCOL 2)');
  check('unlike SNGCHCFLD, a valid gutter needs no NUMCOL / NUMROW (per its section)', pb('3', { numCol: '' }) === '(*GUTTER 3)');
  check('a gutter of 1 without NUMCOL / NUMROW is dropped, leaving no parameters', pb('1', { numCol: '' }) === '');
  check('restrict stays first', pb('2', { restrict: '*RSTCSR' }) === '*RSTCSR (*NUMCOL 2) (*GUTTER 2)');
}

console.log('\nreading is unchanged (a hand-written gutter of 1 still loads, so it can be seen and fixed)');
{
  const kw = (name, parameters) => [{ name, parameters, conditions: [], raw: '', sourceLines: [] }];
  check('getChoiceSelectionType reads gutter 1', DspfWriter.getChoiceSelectionType(kw('SNGCHCFLD', '(*NUMCOL 3) (*GUTTER 1)')).gutter === '1');
  check('getPshbtnfld reads gutter 1', DspfWriter.getPshbtnfld(kw('PSHBTNFLD', '(*NUMCOL 3) (*GUTTER 1)')).gutter === '1');
  const reWritten = DspfWriter.setChoiceSelectionType([], DspfWriter.getChoiceSelectionType(kw('SNGCHCFLD', '(*NUMCOL 3) (*GUTTER 1)')))[0].parameters;
  check('re-applying such a field corrects it (gutter dropped, NUMCOL kept)', reWritten === '(*NUMCOL 3)');
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

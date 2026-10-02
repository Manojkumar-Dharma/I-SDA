/**
 * i121DspsizDomainSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", DSPSIZ display-size
 * names slice. DSPSIZ's standard sizes (*DS3 = 24x80, *DS4 = 27x132), the
 * 24x80 default for a file without DSPSIZ and the two-size maximum were each
 * written out separately in the engine, the writer and the Display Sizes
 * picker. They are now keywordSpec.js's DSPSIZ_DOMAIN; all three derive.
 *
 * Run with: node src/test/i121DspsizDomainSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const { check } = require('./helpers/harness');

console.log('\nspec fact');
{
  const std = KeywordSpec.standardDisplaySizes();
  check('two standard sizes in DDS table order', std.map((z) => z.name).join() === '*DS3,*DS4');
  check('*DS3 is 24x80, *DS4 is 27x132', std[0].lines === 24 && std[0].columns === 80 && std[1].lines === 27 && std[1].columns === 132);
  check('standardDisplaySize is case-insensitive', KeywordSpec.standardDisplaySize('*ds4').lines === 27 && KeywordSpec.standardDisplaySize('*DS3').columns === 80);
  check('a user-defined or non-string name is not a standard size',
    KeywordSpec.standardDisplaySize('*LARGE') === null && KeywordSpec.standardDisplaySize('') === null && KeywordSpec.standardDisplaySize(null) === null && KeywordSpec.standardDisplaySize(24) === null);
  const d = KeywordSpec.defaultDisplaySize();
  check('default size is 24x80, named *DS3', d.lines === 24 && d.columns === 80 && d.name === '*DS3');
  check('at most two sizes', KeywordSpec.maxDisplaySizes() === 2);
  check('citation mentions the 24 x 80 default and user-defined names', /24 x 80/.test(KeywordSpec.displaySizeReference()) && /user-defined/.test(KeywordSpec.displaySizeReference()));
  std[0].lines = 99; KeywordSpec.standardDisplaySize('*DS3').lines = 99; KeywordSpec.defaultDisplaySize().lines = 99;
  check('every accessor returns fresh copies', KeywordSpec.standardDisplaySizes()[0].lines === 24 && KeywordSpec.standardDisplaySize('*DS3').lines === 24 && KeywordSpec.defaultDisplaySize().lines === 24);
  check('the writer re-exports standardDisplaySizes', DspfWriter.standardDisplaySizes().length === 2);
}

console.log('\nwriter derives from the spec');
{
  const sizesOf = (kws) => DspfWriter.getDisplaySizesList(kws).map((s) => s.lines + 'x' + s.columns + (s.name ? ' ' + s.name : ''));
  const dspsiz = (params) => [{ name: 'DSPSIZ', parameters: params, conditions: [], raw: '', sourceLines: [] }];
  check('bare *DS3 *DS4 resolve to the standard dimensions', sizesOf(dspsiz('*DS3 *DS4')).join('|') === '24x80 *DS3|27x132 *DS4');
  check('bare names resolve in either order', sizesOf(dspsiz('*DS4 *DS3')).join('|') === '27x132 *DS4|24x80 *DS3');
  check('lowercase bare name resolves', sizesOf(dspsiz('*ds4')).join() === '27x132 *ds4');
  check('numeric form unchanged', sizesOf(dspsiz('27 132 *LARGE 24 80 *NORMAL')).join('|') === '27x132 *LARGE|24x80 *NORMAL');
  let threw = '';
  try { DspfWriter.setDisplaySizesList([], [{ lines: 24, columns: 80, name: '*DS3' }, { lines: 27, columns: 132, name: '*DS4' }, { lines: 30, columns: 100, name: '*X' }]); } catch (e) { threw = e.message; }
  check('setDisplaySizesList rejects a third size', /at most two/.test(threw));
  const two = DspfWriter.setDisplaySizesList([], [{ lines: 27, columns: 132, name: '*DS4' }, { lines: 24, columns: 80, name: '*DS3' }]);
  check('setDisplaySizesList accepts two and keeps the order', two[0].parameters === '27 132 *DS4 24 80 *DS3');
  const dm = DspfWriter.dspmodDspsizPrerequisiteReason;
  check('DSPMOD prerequisite: both standard sizes present passes', dm(dspsiz('*DS3 *DS4')) === null && dm(dspsiz('27 132 24 80')) === null);
  check('DSPMOD prerequisite: only one size fails', /both the 24x80 and 27x132/.test(dm(dspsiz('24 80 *DS3'))));
  check('DSPMOD prerequisite: no DSPSIZ fails', /both the 24x80 and 27x132/.test(dm([])));
}

console.log('\nengine derives from the spec');
{
  const ps = DspfEngine.parseScreenSizes;
  check('engine: bare *DS3 *DS4', ps('*DS3 *DS4').map((z) => z.lines + 'x' + z.columns + z.name).join('|') === '24x80*DS3|27x132*DS4');
  check('engine: bare names in the other order', ps('*DS4 *DS3').map((z) => z.lines + 'x' + z.columns + z.name).join('|') === '27x132*DS4|24x80*DS3');
  check('engine: lowercase bare name keeps its spelling', ps('*ds4')[0].lines === 27 && ps('*ds4')[0].name === '*ds4');
  check('engine: unknown bare name skipped', ps('*LARGE').length === 0);
  check('engine: numeric form unchanged', ps('24 80 *DS3 27 132 *DS4').length === 2 && ps('27 132').length === 1 && ps('27 132')[0].name === null);
}

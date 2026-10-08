/**
 * i121tKeywordIndexGeneration.test.js
 *
 * Task I-121t - the keyword index is generated, not hand-regenerated. The curated placement table is
 * src/keywordIndexData.js; docs/sda-reference/keyword-index/generate_keyword_index.js builds
 * KEYWORD-INDEX.json, KEYWORD-LOOKUP.json and KEYWORD-INDEX.md from it (replacing build_index.py and
 * build_lookup_and_md.py, which produced the I-40 baseline). This test pins:
 *   1. the committed files are exactly what the generator writes, and an edit to the table propagates;
 *   2. the writer's JSON matches Python's json.dump(indent=2) (escapes, empty containers, nesting);
 *   3. the table is well formed and its totals are the generator's;
 *   4. the table agrees with keywordSpec.js - levels, the System/36 set, repeatable - and every
 *      remaining difference is a named, explained one.
 *
 * Run with: node src/test/i121tKeywordIndexGeneration.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DATA = require(path.join(__dirname, '../keywordIndexData.js'));
const GEN = require(path.join(__dirname, '../../docs/sda-reference/keyword-index/generate_keyword_index.js'));
const { check, failureCount } = require('./helpers/harness');

const DIR = path.join(__dirname, '../../docs/sda-reference/keyword-index');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const R = KeywordSpec.RECORD_TYPES;
const RAWREF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');

console.log('=== 1. the committed files are what the generator writes ===');
const out = GEN.generate();
['KEYWORD-INDEX.json', 'KEYWORD-LOOKUP.json', 'KEYWORD-INDEX.md'].forEach((f) => {
  check(f + ' is byte-for-byte what generate_keyword_index.js writes from src/keywordIndexData.js', read(f) === out[f]);
});
check('the stamped date is the table\'s own date (no clock in the output)', JSON.parse(read('KEYWORD-INDEX.json')).meta.generated === DATA.META.generated && GEN.generate()['KEYWORD-INDEX.md'] === out['KEYWORD-INDEX.md']);
check('--date stamps the three files', (() => { const o = GEN.generate('2030-01-02'); return JSON.parse(o['KEYWORD-INDEX.json']).meta.generated === '2030-01-02' && JSON.parse(o['KEYWORD-LOOKUP.json']).meta.generated === '2030-01-02' && /^Generated 2030-01-02 /m.test(o['KEYWORD-INDEX.md']); })());
check('the generator\'s --check mode passes on the committed files', require('child_process').spawnSync(process.execPath, [path.join(DIR, 'generate_keyword_index.js'), '--check']).status === 0);
check('an edit to the table reaches all three files, then is undone', (() => {
  const kw = DATA.LEVELS[0].categories[0].keywords[0];
  const old = kw.description;
  kw.description = 'EDITED-' + old;
  const o = GEN.generate();
  kw.description = old;
  const back = GEN.generate();
  return o['KEYWORD-INDEX.json'].indexOf('EDITED-') > 0 && o['KEYWORD-LOOKUP.json'].indexOf('EDITED-') > 0 && o['KEYWORD-INDEX.md'].indexOf('EDITED-') > 0 && back['KEYWORD-INDEX.md'] === read('KEYWORD-INDEX.md');
})());
check('the two Python builders are retired and the README points at the generator', !fs.existsSync(path.join(DIR, 'build_index.py')) && !fs.existsSync(path.join(DIR, 'build_lookup_and_md.py')) && /generate_keyword_index\.js/.test(read('README.md')) && !/python3 build_index/.test(read('README.md')));

console.log('\n=== 2. the JSON writer matches Python\'s json.dump(indent=2) ===');
const pj = GEN.pyJson;
check('non-ASCII is escaped as lower-case \\uXXXX, a surrogate pair as two escapes', pj('\u00b7 \u2192 \u26a0\ufe0f \ud83d\ude00') === '"\\u00b7 \\u2192 \\u26a0\\ufe0f \\ud83d\\ude00"');
check('quotes, backslash and control characters are escaped like Python', pj('a"b\\c\n\t') === '"a\\"b\\\\c\\n\\t"');
check('the DEL character is left alone, as Python does', pj('\u007f') === '"\u007f"');
check('empty array and object stay on one line; nesting indents by two spaces', pj({ a: [], b: {}, c: [1, true, null, 'x'], d: { e: 1 } }) === '{\n  "a": [],\n  "b": {},\n  "c": [\n    1,\n    true,\n    null,\n    "x"\n  ],\n  "d": {\n    "e": 1\n  }\n}');
check('the committed JSON files end without a trailing newline, as Python wrote them', !read('KEYWORD-INDEX.json').endsWith('\n') && !read('KEYWORD-LOOKUP.json').endsWith('\n'));

console.log('\n=== 3. the table is well formed ===');
const index = JSON.parse(read('KEYWORD-INDEX.json'));
const lookup = JSON.parse(read('KEYWORD-LOOKUP.json'));
let entries = 0, cats = 0, problems = [];
DATA.LEVELS.forEach((l) => l.categories.forEach((c) => {
  cats++;
  const seen = new Set();
  if (!c.category || typeof c.description !== 'string' || !Array.isArray(c.sharedWith) || !('screenshotDir' in c)) problems.push('category ' + l.level + '/' + c.category);
  c.keywords.forEach((k) => {
    entries++;
    if (seen.has(k.keyword)) problems.push('duplicate ' + l.level + '/' + c.category + '/' + k.keyword);
    seen.add(k.keyword);
    if (!k.keyword || typeof k.description !== 'string' || typeof k.parameters !== 'string' || typeof k.repeatable !== 'boolean') problems.push('entry ' + l.level + '/' + c.category + '/' + k.keyword);
    if (k.s36e !== undefined && (typeof k.s36e !== 'string' || !k.s36e)) problems.push('s36e ' + k.keyword);
  });
}));
check('every category and keyword entry has all of its fields, none twice in one category', problems.length === 0);
check('the four levels are file, help-specification, record, field', DATA.LEVELS.map((l) => l.level).join() === 'file,help-specification,record,field');
check('the totals in the files are the table\'s own count', index.meta.totalCategories === cats && index.meta.totalKeywordEntries === entries && lookup.meta.uniqueKeywords === Object.keys(lookup.keywords).length);
check('every S36E status names a keyword that has an s36e note', Object.keys(DATA.S36E_STATUS).every((n) => lookup.keywords[n] && lookup.keywords[n].some((e) => e.s36e)));
check('the lookup is sorted by name and every entry\'s level and category exists in the index', (() => {
  const names = Object.keys(lookup.keywords);
  const sorted = names.slice().sort();
  const pairs = new Set();
  index.levels.forEach((l) => l.categories.forEach((c) => pairs.add(l.level + '|' + c.category)));
  return names.join() === sorted.join() && names.every((n) => lookup.keywords[n].every((e) => pairs.has(e.level + '|' + e.category)));
})());

console.log('\n=== 4. the table against the spec ===');
const byName = {};
DATA.LEVELS.forEach((l) => l.categories.forEach((c) => c.keywords.forEach((k) => { (byName[k.keyword] = byName[k.keyword] || []).push({ level: l.level, cat: c, k: k }); })));
const real = Object.keys(byName).filter((n) => n.charAt(0) !== '*');
check('every keyword name in the table (the * parameter values aside) has a spec entry', real.every((n) => !!R[n]));
check('every spec keyword is in the table', Object.keys(R).filter((n) => R[n] && R[n].levels && R[n].levels.length).every((n) => !!byName[n]));

// levels: the spec's 'help' is the index's 'help-specification'; CAnn / CFnn are listed once at file level with the record
// panel named in sharedWith (the Cmd keys section is the same panel at both levels)
const asIndexLevel = (lv) => (lv === 'help' ? 'help-specification' : lv);
const levelDifferences = [];
real.forEach((n) => {
  const sl = R[n] && R[n].levels;
  if (!sl || !sl.length) return;
  const il = Array.from(new Set(byName[n].map((x) => x.level))).sort().join();
  const s = sl.map(asIndexLevel).sort().join();
  if (il !== s) levelDifferences.push(n + ' [' + il + ' vs ' + s + ']');
});
check('the levels agree for every keyword whose spec entry names its levels, except CA01-CA24 and CF01-CF24', levelDifferences.join('; ') === 'CA01-CA24 [file vs file,record]; CF01-CF24 [file vs file,record]');
check('...and those two are the one shared Cmd keys panel: the file-level entry names the record panel in sharedWith', ['CA01-CA24', 'CF01-CF24'].every((n) => byName[n].length === 1 && byName[n][0].cat.sharedWith.some((w) => /^record:/.test(w))) && ['CA01-CA24', 'CF01-CF24'].every((n) => R[n].levels.join() === 'file,record'));
check('ENTFLDATR is listed at all three levels it is documented at (Task I-121t added the field-level entry)', byName.ENTFLDATR.map((x) => x.level).sort().join() === 'field,file,record' && R.ENTFLDATR.levels.slice().sort().join() === 'field,file,record');

// System/36
const idxS36 = Array.from(new Set(real.filter((n) => byName[n].some((x) => x.k.s36e)))).sort();
const specS36 = KeywordSpec.s36eRestrictedKeywords().concat(['USRDSPMGT']).sort();
check('the keywords carrying an s36e note are exactly the spec\'s S36E_RESTRICTIONS keywords plus the USRDSPMGT gate', idxS36.join() === specS36.join());

// repeatable
const rep = (n) => byName[n].some((x) => x.k.repeatable);
check('every response / option indicator keyword of the spec is repeatable in the table', KeywordSpec.recordIndicatorKeywordNames().every(rep));
check('ERRMSG and ERRMSGID (the spec\'s errorMessages group) are repeatable in the table', Object.keys(KeywordSpec.REPEATABLE_INSTANCE_GROUPS.errorMessages).every(rep));
const flagged = Object.keys(R).filter((n) => R[n] && R[n].repeatable !== undefined && byName[n]);
const repDiff = flagged.filter((n) => rep(n) !== R[n].repeatable);
check('the spec\'s own repeatable flag agrees with the table except MSGLOC', repDiff.join() === 'MSGLOC');
check('...MSGLOC\'s flag in the spec means "once per display size" (display-size condition names), not a repeated keyword, so the table says no', R.MSGLOC.displaySizeNames === 'valid' && rep('MSGLOC') === false);
check('ERASE and WDWTITLE are repeatable in the table (Task I-121t: the reference says each can be specified more than once)', rep('ERASE') && rep('WDWTITLE') && R.ERASE.repeatable === true && R.WDWTITLE.repeatable === true);

console.log('\n=== 5. names that are not DDS keywords stay out of the index (Task I-197) ===');
const notDds = Object.keys(R).filter((n) => R[n] && R[n].notADdsKeyword);
check('KEYBRD is the one spec entry that says it is not a DDS keyword', notDds.join() === 'KEYBRD');
check('...the DDS Reference has no KEYBRD section', RAWREF.indexOf('KEYBRD') < 0);
check('no name the spec marks notADdsKeyword is in the table, the index or the lookup', notDds.every((n) => !byName[n] && !lookup.keywords[n] && read('KEYWORD-INDEX.json').indexOf('"keyword": "' + n + '"') < 0 && read('KEYWORD-INDEX.md').indexOf('`' + n + '`') < 0));
check('every keyword of the lookup (the * parameter values aside) has a spec entry that is a DDS keyword', Object.keys(lookup.keywords).filter((n) => n.charAt(0) !== '*').every((n) => R[n] && !R[n].notADdsKeyword));
check('the Keying Options panel is still indexed (CHECK stays), and its description does not call the keyboard shift a keyword', (() => {
  const c = DATA.LEVELS.find((l) => l.level === 'field').categories.find((x) => x.category === 'Keying Options');
  return !!c && c.keywords.map((k) => k.keyword).join() === 'CHECK' && /position 35/.test(c.description) && /not a keyword/.test(c.description);
})());
check('the meta notes say why KEYBRD is gone', DATA.META_NOTES.some((x) => /Task I-197: KEYBRD is no longer listed/.test(x)));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

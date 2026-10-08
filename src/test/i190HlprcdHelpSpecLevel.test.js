/**
 * i190HlprcdHelpSpecLevel.test.js
 *
 * Task I-190: HLPRCD's spec entry said levels ['file']; its DDS Reference section opens "You use this
 * file-level or help-specification-level keyword". The entry now says ['file', 'help'], and the
 * file-wide exclusion HLPPNLGRP has with HLPRCD (and with HLPDOC) is judged across the file level and
 * every H specification (it was only judged inside one level, so an H-specification HLPRCD beside a
 * file-level HLPPNLGRP, or the reverse, was accepted by the raw editor and the source guard).
 * Run with: node src/test/i190HlprcdHelpSpecLevel.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');

const RAW = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const REF = RAW.replace(/\f/g, ' ').replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, s) => { for (let i = 0; i < s.length; i++) a[c - 1 + i] = s[i]; };
  put(6, 'A');
  if (o.cond) put(7, o.cond);
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.use) put(38, o.use);
  if (o.line) put(39, String(o.line).padStart(3));
  if (o.col) put(42, String(o.col).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const K = (fn) => dds({ fn });
const R = (n, fn) => dds({ t: 'R', name: n, fn });
const H = (fn) => dds({ t: 'H', fn });
const F = (n, u, fn) => dds({ name: n, use: u, fn });
const C = (t, fn) => dds({ line: 1, col: 2, fn: "'" + t + "' " + (fn || '') });
const parse = (t) => DspfParser.parseDspf(t);
// file-level keywords, then R1 with one H specification (HLPARA + hKws), a second record R2 optionally with its own H specification.
const mk = (fileKws, hKws, r2H) => [].concat(
  fileKws.map(K), [R('R1'), H('HLPARA(*RCD)')], hKws.map(K), [F('F1', 'B'), C('T', 'HLPID(7)')],
  r2H ? [R('R2'), H('HLPARA(*RCD)')].concat(r2H.map(K), [F('F2', 'B'), C('T2', 'HLPID(8)')]) : []
).join('\n') + '\n';
const guard = (a, b) => DspfWriter.helpSpecNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');

console.log('=== 1. the spec entry and the Reference ===');
{
  const e = KeywordSpec.RECORD_TYPES.HLPRCD;
  check('the Reference opens HLPRCD with "file-level or help-specification-level keyword"', has('You use this file-level or help-specification-level keyword to specify the record format'));
  check('HLPRCD levels are file and help, the vocabulary HLPDOC already uses', e.levels.join() === 'file,help' && KeywordSpec.RECORD_TYPES.HLPDOC.levels.join() === 'file,help');
  check('the file-level-only flag is gone (the levels fact says it)', e.alsoValidAtHelpSpecification === undefined);
  check('the Reference states the file-wide exclusions', has('a display file cannot contain both HLPPNLGRP and HLPRCD keywords, nor HLPPNLGRP and HLPDOC keywords'));
}

console.log('\n=== 2. an H specification can carry HLPRCD ===');
{
  const m = parse(mk(['HELP'], ['HLPRCD(H1)']));
  check('parser keeps HLPRCD(H1) on the help entry', m.records[0].helpEntries[0].keywords.some((k) => k.name === 'HLPRCD' && /H1/.test(k.parameters)));
  check('the Reference example (file-level + H-specification HLPRCD) is accepted', guard(mk(['HELP'], []), mk(['HELP', 'HLPRCD(DFTHELP HELPFILE)'], ['HLPRCD(ERRHELP)'])) === null);
}

console.log('\n=== 3. the file-wide exclusion across levels ===');
{
  const base = mk(['HELP'], []);
  check('file-level HLPPNLGRP + H-specification HLPRCD is refused', say(/cannot contain both HLPPNLGRP and HLPRCD/, guard(base, mk(['HELP', 'HLPPNLGRP(PG LIB MOD)'], ['HLPRCD(H1)']))));
  check('file-level HLPRCD + H-specification HLPPNLGRP is refused', say(/cannot contain both HLPPNLGRP and HLPRCD/, guard(base, mk(['HELP', 'HLPRCD(H1)'], ['HLPPNLGRP(PG LIB MOD)']))));
  check('H-specification HLPRCD on one record + H-specification HLPPNLGRP on another is refused', say(/cannot contain both HLPPNLGRP and HLPRCD/, guard(mk(['HELP'], ['HLPRCD(H1)'], []), mk(['HELP'], ['HLPRCD(H1)'], ['HLPPNLGRP(PG LIB MOD)']))));
  check('file-level HLPPNLGRP + H-specification HLPDOC is refused (same sentence)', say(/cannot contain both HLPPNLGRP and HLPDOC/, guard(base, mk(['HELP', 'HLPPNLGRP(PG LIB MOD)'], ['HLPDOC(L D F)']))));
  check('H-specification HLPPNLGRP + H-specification HLPDOC on another record is refused', say(/cannot contain both HLPPNLGRP and HLPDOC/, guard(mk(['HELP'], ['HLPPNLGRP(PG LIB MOD)'], []), mk(['HELP'], ['HLPPNLGRP(PG LIB MOD)'], ['HLPDOC(L D F)']))));
  check('HLPRCD with HLPDOC is not refused (the sections do not exclude that pair)', guard(base, mk(['HELP', 'HLPRCD(H1)'], ['HLPDOC(L D F)'])) === null);
  check('HLPPNLGRP alone at the file level and on an H specification is accepted', guard(base, mk(['HELP', 'HLPPNLGRP(PG LIB MOD)'], ['HLPPNLGRP(PG2 LIB MOD)'])) === null);
  check('only a violation an edit adds is reported (an already-wrong file is not re-reported)', (() => {
    const bad = mk(['HELP', 'HLPPNLGRP(PG LIB MOD)'], ['HLPRCD(H1)']);
    return guard(bad, bad) === null;
  })());
  check('the violation key set is spec-driven: HLPPNLGRP mutex list plus HLPDOC', KeywordSpec.mutexKeywords('HLPPNLGRP').join() === 'HLPRCD' && KeywordSpec.isMutex('HLPDOC', 'HLPPNLGRP'));
}

if (failureCount()) { console.log('\nFAILED: ' + failureCount()); process.exit(1); }
console.log('\nALL CHECKS PASSED');

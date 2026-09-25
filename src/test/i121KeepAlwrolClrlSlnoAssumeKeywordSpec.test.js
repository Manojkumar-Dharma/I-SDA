/**
 * i121KeepAlwrolClrlSlnoAssumeKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", KEEP/ALWROL/CLRL/
 * SLNO/ASSUME slice. A well-scoped piece of the "plain/base record"
 * remainder rather than that whole undertaking: this slice covers the
 * existing keepMutexConflictReason (I-28) and alwrolClrlSlnoConflictReason
 * (I-37) functions' own rule webs, whose hand-written arrays (KEEP_MUTEX,
 * TARGET, the inline ['ASSUME','SFL','SFLCTL','USRDFN'] literal) now live
 * once, as data, in keywordSpec.js's RECORD_TYPES.KEEP/ALWROL/CLRL/SLNO/
 * ASSUME entries.
 *
 * Unlike WINDOW/PULLDOWN, none of these five keywords is a record-TYPE
 * identifier written once by a creation wizard - they're ordinary
 * toggleable flags any record can carry - but the DDS Reference states
 * their restrictions in the same closed-mutex shape, so this slice reuses
 * `mutex`/`isMutex`, plus the new `mutexKeywords` accessor for the two
 * functions that need the actual conflicting names (to join into a
 * message) rather than just a yes/no answer.
 *
 * This file verifies:
 *  1. All five spec entries match their own DDS Reference text verbatim.
 *  2. ASSUME's entry is deliberately narrowed to the ALWROL/CLRL/SLNO
 *     subset (not the full six-keyword list ASSUME's own DDS Reference
 *     section states), matching alwrolClrlSlnoConflictReason's own
 *     pre-existing scope.
 *  3. DspfWriter.keepMutexConflictReason and .alwrolClrlSlnoConflictReason
 *     agree with the spec on every keyword in KEYWORD-LOOKUP.json, from
 *     every angle each function itself supports.
 *
 * Run with: node src/test/i121KeepAlwrolClrlSlnoAssumeKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// Part 1 - the five spec entries match the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.KEEP/ALWROL/CLRL/SLNO/ASSUME');
{
  check('KEEP.mutex is exactly [ALWROL, CLRL, SLNO]',
    KeywordSpec.mutexKeywords('KEEP').length === 3 &&
    ['ALWROL', 'CLRL', 'SLNO'].every((n) => KeywordSpec.isMutex('KEEP', n)));

  ['ALWROL', 'CLRL', 'SLNO'].forEach((name) => {
    check(name + '.mutex is exactly [ASSUME, SFL, SFLCTL, USRDFN]',
      KeywordSpec.mutexKeywords(name).length === 4 &&
      ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN'].every((n) => KeywordSpec.isMutex(name, n)));
    check(name + '.mutex does NOT include KEEP (that pair is modeled once, on the KEEP entry only)',
      !KeywordSpec.isMutex(name, 'KEEP'));
  });

  check('ASSUME.mutex is deliberately narrowed to exactly [ALWROL, CLRL, SLNO], not the fuller 6-keyword DDS Reference list',
    KeywordSpec.mutexKeywords('ASSUME').length === 3 &&
    ['ALWROL', 'CLRL', 'SLNO'].every((n) => KeywordSpec.isMutex('ASSUME', n)));
  check('ASSUME.mutex does NOT include SFL, USRDFN, or USRDSPMGT (out of this slice\'s scope)',
    !KeywordSpec.isMutex('ASSUME', 'SFL') && !KeywordSpec.isMutex('ASSUME', 'USRDFN') && !KeywordSpec.isMutex('ASSUME', 'USRDSPMGT'));
  check('ASSUME entry\'s own ddsReference documents the narrowing explicitly', KeywordSpec.RECORD_TYPES.ASSUME.ddsReference.indexOf('deliberately models only') !== -1);
}

// ===========================================================================
// Part 2 - DspfWriter.keepMutexConflictReason vs. the spec, full sweep
// ===========================================================================
console.log('\nDspfWriter.keepMutexConflictReason vs. keywordSpec.js - full keyword sweep');
{
  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  check('KEYWORD-LOOKUP.json has a substantial keyword set to sweep (sanity check on the fixture itself)', allKeywordNames.length > 100);

  const keepRec = [k('KEEP')];
  // Direction A: record has KEEP, candidate keyword being added.
  let mismatchesA = [];
  allKeywordNames.forEach((name) => {
    if (name === 'KEEP') return;
    const specSaysConflict = KeywordSpec.isMutex('KEEP', name);
    const fnSaysConflict = !!DspfWriter.keepMutexConflictReason(name, keepRec);
    if (specSaysConflict !== fnSaysConflict) mismatchesA.push(name);
  });
  check('keepMutexConflictReason agrees with the spec, KEEP-record direction (' + (allKeywordNames.length - 1) + ' checked)', mismatchesA.length === 0);

  // Direction B: record has the candidate keyword, KEEP being added.
  let mismatchesB = [];
  allKeywordNames.forEach((name) => {
    if (name === 'KEEP') return;
    const rec = [k(name)];
    const specSaysConflict = KeywordSpec.isMutex('KEEP', name);
    const fnSaysConflict = !!DspfWriter.keepMutexConflictReason('KEEP', rec);
    if (specSaysConflict !== fnSaysConflict) mismatchesB.push(name);
  });
  check('keepMutexConflictReason agrees with the spec, KEEP-being-added direction (' + (allKeywordNames.length - 1) + ' checked)', mismatchesB.length === 0);
}

// ===========================================================================
// Part 3 - DspfWriter.alwrolClrlSlnoConflictReason vs. the spec
// ===========================================================================
console.log('\nDspfWriter.alwrolClrlSlnoConflictReason vs. keywordSpec.js - full keyword sweep');
{
  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);

  // ALWROL/CLRL/SLNO: each turning ON while a candidate keyword is
  // already present (one-directional per the function's own scope - it
  // does not check the SFL/SFLCTL/USRDFN reverse, matching its own doc
  // comment on UI reachability).
  ['ALWROL', 'CLRL', 'SLNO'].forEach((target) => {
    let mismatches = [];
    allKeywordNames.forEach((name) => {
      if (name === target) return;
      const rec = [k(name)];
      const specSaysConflict = KeywordSpec.isMutex(target, name);
      const fnSaysConflict = !!DspfWriter.alwrolClrlSlnoConflictReason(target, rec);
      if (specSaysConflict !== fnSaysConflict) mismatches.push(name);
    });
    check(target + ' turning on agrees with the spec on every keyword already present (' + (allKeywordNames.length - 1) + ' checked)', mismatches.length === 0);
  });

  // ASSUME turning ON while a candidate keyword is already present.
  let mismatchesAssume = [];
  allKeywordNames.forEach((name) => {
    if (name === 'ASSUME') return;
    const rec = [k(name)];
    const specSaysConflict = KeywordSpec.isMutex('ASSUME', name);
    const fnSaysConflict = !!DspfWriter.alwrolClrlSlnoConflictReason('ASSUME', rec);
    if (specSaysConflict !== fnSaysConflict) mismatchesAssume.push(name);
  });
  check('ASSUME turning on agrees with the spec on every keyword already present (' + (allKeywordNames.length - 1) + ' checked)', mismatchesAssume.length === 0);

  // Specific spot checks matching the function's documented scope.
  check('ALWROL is blocked when SFL is already present (one-directional, SFL is a record-type marker)', !!DspfWriter.alwrolClrlSlnoConflictReason('ALWROL', [k('SFL')]));
  check('ALWROL and ASSUME are mutually exclusive, checked from the ALWROL side', !!DspfWriter.alwrolClrlSlnoConflictReason('ALWROL', [k('ASSUME')]));
  check('ALWROL and ASSUME are mutually exclusive, checked from the ASSUME side', !!DspfWriter.alwrolClrlSlnoConflictReason('ASSUME', [k('ALWROL')]));
  check('a keyword outside {ALWROL, CLRL, SLNO, ASSUME} is always unrestricted by this function', !DspfWriter.alwrolClrlSlnoConflictReason('COLOR', [k('SFL')]));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

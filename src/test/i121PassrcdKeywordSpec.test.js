/**
 * i121PassrcdKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", PASSRCD-
 * restricted-keywords slice. `passrcdRecordConflictReason`'s (I-24/I-36)
 * own four consumers each independently knew, with no single shared
 * source, which keywords the file-level PASSRCD keyword restricts:
 * windowConflictReason's own creation-time check hard-codes WINDOW alone
 * (buildWebviewTemplate.js's newRecordBtn handler); wireUsrdfnGuardedFlag/
 * wirePulldownGuardedFlag's own alsoCheckPassrcd parameter is set true
 * only at the ALWROL/SLNO/CLRL call sites; and webviewClientHelpers.js's
 * file-level PASSRCD-edit handler (the reverse on-transition) carried its
 * own hand-written ['WINDOW', 'ALWROL', 'CLRL', 'SLNO'] array to sweep a
 * retyped PASSRCD value against every restricted keyword at once.
 *
 * WINDOW's, ALWROL's, CLRL's and SLNO's own DDS Reference sections each
 * independently state "[keyword] cannot be specified for the record
 * format specified by the PASSRCD keyword" - the same fact stated four
 * times over, once per keyword's own section, with no fifth keyword
 * sharing it.
 *
 * This file verifies:
 *  1. keywordSpec.js's WINDOW/ALWROL/CLRL/SLNO entries each carry
 *     passrcdRestricted: true, and no other RECORD_TYPES entry does.
 *  2. KeywordSpec.isPassrcdRestricted agrees with that flag for all four
 *     names plus an unrelated name.
 *  3. KeywordSpec.passrcdRestrictedKeywords()/
 *     DspfWriter.passrcdRestrictedKeywords() both return exactly
 *     ['WINDOW', 'ALWROL', 'CLRL', 'SLNO'], in that order - matching the
 *     hand-written array's own order before this slice.
 *  4. DspfWriter.passrcdRecordConflictReason/passrcdWindowConflictReason
 *     are themselves unchanged by this refactor (name match/mismatch,
 *     blank-safe, case-insensitive), for all four restricted names plus
 *     one unrelated name.
 *
 * Run with: node src/test/i121PassrcdKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

// ===========================================================================
// Part 1 - the spec entries carry passrcdRestricted, and only these four do
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.{WINDOW,ALWROL,CLRL,SLNO}.passrcdRestricted');
{
  const expectedCitations = {
    WINDOW: 'WINDOW cannot be specified for the record format specified by the PASSRCD keyword.',
    ALWROL: 'The ALWROL keyword cannot be specified for the record format specified by the PASSRCD keyword.',
    CLRL: 'The CLRL keyword cannot be specified for the record format specified by the PASSRCD keyword.',
    SLNO: 'SLNO cannot be specified for the record format specified by the PASSRCD keyword.'
  };
  Object.keys(expectedCitations).forEach(function (name) {
    const spec = KeywordSpec.RECORD_TYPES[name];
    check(name + '.passrcdRestricted is true', spec.passrcdRestricted === true);
    check(name + '.passrcdDdsReference matches its own DDS Reference wording verbatim', spec.passrcdDdsReference === expectedCitations[name]);
  });

  const flaggedNames = Object.keys(KeywordSpec.RECORD_TYPES).filter(function (name) {
    return KeywordSpec.RECORD_TYPES[name].passrcdRestricted;
  });
  check('no RECORD_TYPES entry other than WINDOW/ALWROL/CLRL/SLNO carries passrcdRestricted', flaggedNames.length === 4);
}

// ===========================================================================
// Part 2 - KeywordSpec.isPassrcdRestricted
// ===========================================================================
console.log('\nKeywordSpec.isPassrcdRestricted');
{
  ['WINDOW', 'ALWROL', 'CLRL', 'SLNO'].forEach(function (name) {
    check(name + ' is passrcd-restricted', KeywordSpec.isPassrcdRestricted(name) === true);
  });
  check('an unrelated keyword (TEXT) is not passrcd-restricted', KeywordSpec.isPassrcdRestricted('TEXT') === false);
  check('a keyword with no spec entry at all is not passrcd-restricted (fails open, false)', KeywordSpec.isPassrcdRestricted('NOSUCHKEYWORD') === false);
}

// ===========================================================================
// Part 3 - the shared list, KeywordSpec + re-exported DspfWriter accessor
// ===========================================================================
console.log('\nKeywordSpec.passrcdRestrictedKeywords / DspfWriter.passrcdRestrictedKeywords');
{
  const specList = KeywordSpec.passrcdRestrictedKeywords();
  check('KeywordSpec.passrcdRestrictedKeywords() is exactly [WINDOW, ALWROL, CLRL, SLNO] in that order', JSON.stringify(specList) === JSON.stringify(['WINDOW', 'ALWROL', 'CLRL', 'SLNO']));

  const writerList = DspfWriter.passrcdRestrictedKeywords();
  check('DspfWriter.passrcdRestrictedKeywords() agrees with KeywordSpec\'s own list', JSON.stringify(writerList) === JSON.stringify(specList));
}

// ===========================================================================
// Part 4 - passrcdRecordConflictReason/passrcdWindowConflictReason
//          themselves are unaffected by this refactor
// ===========================================================================
console.log('\nDspfWriter.passrcdRecordConflictReason / passrcdWindowConflictReason (unchanged behavior)');
{
  ['WINDOW', 'ALWROL', 'CLRL', 'SLNO'].forEach(function (name) {
    check(name + ' is blocked when its own name matches PASSRCD\'s named record', !!DspfWriter.passrcdRecordConflictReason(name, 'RECKEEP', 'RECKEEP'));
    check(name + ' is allowed on a differently-named record', !DspfWriter.passrcdRecordConflictReason(name, 'RECKEEP', 'OTHERREC'));
    check(name + ' comparison is case-insensitive', !!DspfWriter.passrcdRecordConflictReason(name, 'reckeep', 'RECKEEP'));
  });

  check('a blank PASSRCD value never conflicts', !DspfWriter.passrcdRecordConflictReason('WINDOW', '', 'RECKEEP'));
  check('a blank record name never conflicts', !DspfWriter.passrcdRecordConflictReason('WINDOW', 'RECKEEP', ''));
  check('an unrelated keyword name still works as a plain name-vs-name comparison (the function itself is agnostic of which names are meaningful)', !!DspfWriter.passrcdRecordConflictReason('TEXT', 'RECKEEP', 'RECKEEP'));

  check('passrcdWindowConflictReason is still the WINDOW-specific thin wrapper', !!DspfWriter.passrcdWindowConflictReason('RECKEEP', 'RECKEEP') && !DspfWriter.passrcdWindowConflictReason('RECKEEP', 'OTHERREC'));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

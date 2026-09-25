/**
 * i121UsrdfnKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", first slice
 * (USRDFN record type). USRDFN's own closed keyword whitelist used to
 * live as a hand-written array duplicated across two near-identical
 * DspfWriter functions (usrdfnConflictReason / usrdfnWhitelistConflictReason
 * - see I-102/I-49's own doc comments). It now lives once, as data, in
 * keywordSpec.js's RECORD_TYPES.USRDFN, and both functions delegate to a
 * single usrdfnWhitelistCheck helper that reads it.
 *
 * This file verifies:
 *  1. keywordSpec.js's own USRDFN entry matches USRDFN's DDS Reference text
 *     verbatim (the 9-keyword whitelist, plus USRDFN itself).
 *  2. DspfWriter.usrdfnConflictReason and usrdfnWhitelistConflictReason each
 *     still agree with the spec on every keyword in KEYWORD-LOOKUP.json
 *     (the full known-keyword universe) - i.e. the two hand-duplicated
 *     functions and the new single spec can never drift apart again,
 *     because there's only one array left to drift from.
 *  3. The derived indicatorKinds entry (HELP/HLPRTN - Task I-114) matches
 *     what a whitelist-only check would compute for all ten indicator
 *     kinds the shared Indicator-instance component supports.
 *
 * Run with: node src/test/i121UsrdfnKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
const usrdfnRec = [k('USRDFN')];

// ===========================================================================
// Part 1 - the spec entry itself matches the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.USRDFN');
{
  const spec = KeywordSpec.RECORD_TYPES.USRDFN;
  check('markerKeyword is USRDFN', spec.markerKeyword === 'USRDFN');
  const expectedWhitelist = ['USRDFN', 'INVITE', 'KEEP', 'PASSRCD', 'HLPRTN', 'HELP', 'HLPCLR', 'PRINT', 'OPENPRT', 'TEXT'];
  check('whitelist has exactly the 9 DDS-Reference-named keywords plus USRDFN itself, no more no less',
    spec.whitelist.length === expectedWhitelist.length &&
    expectedWhitelist.every((name) => spec.whitelist.indexOf(name) !== -1));
  check('ddsReference cites the exact whitelist wording', spec.ddsReference.indexOf('INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT') !== -1);
}

// ===========================================================================
// Part 2 - DspfWriter's two USRDFN functions agree with the spec, for
// every keyword name the codebase actually knows about (not just a
// hand-picked sample) - a change to either function's array (there is now
// only one, but this guards against a future accidental second one) or to
// the spec would fail this sweep.
// ===========================================================================
console.log('\nDspfWriter USRDFN functions vs. keywordSpec.js - full keyword sweep');
{
  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  check('KEYWORD-LOOKUP.json has a substantial keyword set to sweep (sanity check on the fixture itself)', allKeywordNames.length > 100);

  let mismatches = [];
  allKeywordNames.forEach((name) => {
    const specSaysAllowed = KeywordSpec.isWhitelisted('USRDFN', name);
    const conflictReasonSaysAllowed = !DspfWriter.usrdfnConflictReason(name, usrdfnRec);
    const whitelistReasonSaysAllowed = !DspfWriter.usrdfnWhitelistConflictReason(name, usrdfnRec);
    if (specSaysAllowed !== conflictReasonSaysAllowed || specSaysAllowed !== whitelistReasonSaysAllowed) {
      mismatches.push(name);
    }
  });
  check('usrdfnConflictReason and usrdfnWhitelistConflictReason agree with the spec for every known keyword name (' + allKeywordNames.length + ' checked)',
    mismatches.length === 0);

  // A record with no USRDFN keyword at all is never restricted, regardless
  // of spec content - both functions' own early-exit, unaffected by I-121.
  const plainRec = [k('RECORD')];
  check('a non-USRDFN record is never restricted by either function', !DspfWriter.usrdfnConflictReason('ASSUME', plainRec) && !DspfWriter.usrdfnWhitelistConflictReason('ASSUME', plainRec));
}

// ===========================================================================
// Part 3 - indicatorKinds (Task I-114) is exactly the whitelist-only subset
// of the ten kinds the shared Indicator-instance component supports.
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.USRDFN.indicatorKinds (Task I-114)');
{
  const ALL_KINDS = ['CLEAR', 'HOME', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'PAGEDOWN', 'PAGEUP', 'CHANGE', 'SETOF', 'INDTXT'];
  const derivedAllowed = ALL_KINDS.filter((kind) => KeywordSpec.isWhitelisted('USRDFN', kind));
  const spec = KeywordSpec.RECORD_TYPES.USRDFN;
  check('indicatorKinds is exactly the whitelist-only subset of all ten kinds (HELP, HLPRTN)',
    spec.indicatorKinds.length === derivedAllowed.length &&
    derivedAllowed.every((kind) => spec.indicatorKinds.indexOf(kind) !== -1));
  ALL_KINDS.filter((k2) => spec.indicatorKinds.indexOf(k2) === -1).forEach((kind) => {
    check(kind + ' is refused via usrdfnWhitelistConflictReason (not on USRDFN\'s whitelist)', !!DspfWriter.usrdfnWhitelistConflictReason(kind, usrdfnRec));
  });
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

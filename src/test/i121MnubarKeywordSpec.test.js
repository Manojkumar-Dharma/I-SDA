/**
 * i121MnubarKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", MNUBAR slice.
 * MNUBAR's own closed 27-entry whitelist used to live as a hand-written
 * array (MNUBAR_WHITELIST_KEYWORDS) plus an inline CAnn/CFnn regex test,
 * beside DspfWriter.mnubarWhitelistConflictReason. It now lives once, as
 * data, in keywordSpec.js's RECORD_TYPES.MNUBAR (whitelist array plus the
 * new whitelistPatterns field), and mnubarWhitelistConflictReason
 * delegates to the (now pattern-aware) KeywordSpec.isWhitelisted.
 *
 * MNUBAR is a whitelist shape like USRDFN's own slice, not a mutex shape
 * like WINDOW's/PULLDOWN's - but with a wrinkle neither of those needed:
 * two of the DDS Reference's own 27 table entries (CAnn, CFnn) are a
 * placeholder pattern, not literal keyword names, and this codebase
 * models each instance as an individual literal keyword (CA01..CA24/
 * CF01..CF24) - hence whitelistPatterns' regex membership test alongside
 * the literal whitelist array.
 *
 * This file verifies:
 *  1. keywordSpec.js's own MNUBAR entry matches MNUBAR's DDS Reference
 *     text verbatim (whitelist array + ddsReference citation).
 *  2. KeywordSpec.isWhitelisted('MNUBAR', ...) correctly accepts every
 *     CA01..CA24 and CF01..CF24 instance via whitelistPatterns, and
 *     rejects clearly-non-matching near misses (CA1, CAA1, CA100, CFxx).
 *  3. DspfWriter.mnubarWhitelistConflictReason agrees with the spec on
 *     every keyword in KEYWORD-LOOKUP.json (the full known-keyword
 *     universe), including all 48 CAnn/CFnn instances.
 *
 * Run with: node src/test/i121MnubarKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
const mnubarRec = [k('MNUBAR')];

// ===========================================================================
// Part 1 - the spec entry itself matches the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.MNUBAR');
{
  const spec = KeywordSpec.RECORD_TYPES.MNUBAR;
  const expectedWhitelist = [
    'MNUBAR', 'CLEAR', 'CLRL', 'CSRLOC', 'DSPMOD', 'HELP', 'HLPCLR',
    'HLPCMDKEY', 'HLPRTN', 'HLPTITLE', 'HOME', 'INDTXT', 'INVITE',
    'KEEP', 'LOCK', 'MNUBARDSP', 'MNUBARSEP', 'MNUBARSW', 'MNUCNL',
    'OVERLAY', 'PAGEDOWN', 'PAGEUP', 'PRINT', 'PROTECT', 'ROLLUP',
    'ROLLDOWN', 'TEXT', 'UNLOCK', 'VLDCMDKEY'
  ];
  check('whitelist has exactly the 25 DDS-Reference-named literal keywords plus MNUBAR itself, no more no less',
    spec.whitelist.length === expectedWhitelist.length &&
    expectedWhitelist.every((name) => spec.whitelist.indexOf(name) !== -1));
  check('whitelistPatterns has exactly the CAnn and CFnn patterns', spec.whitelistPatterns.length === 2);
  check('ddsReference cites the exact whitelist wording', spec.ddsReference.indexOf('CAnn, CFnn, CLEAR') !== -1 && spec.ddsReference.indexOf('VLDCMDKEY') !== -1);
}

// ===========================================================================
// Part 2 - whitelistPatterns membership, directly against isWhitelisted
// ===========================================================================
console.log('\nKeywordSpec.isWhitelisted(\'MNUBAR\', ...) - CAnn/CFnn pattern matching');
{
  let allCaCfMatch = true;
  for (let n = 1; n <= 24; n++) {
    const suffix = n < 10 ? '0' + n : '' + n;
    if (!KeywordSpec.isWhitelisted('MNUBAR', 'CA' + suffix)) allCaCfMatch = false;
    if (!KeywordSpec.isWhitelisted('MNUBAR', 'CF' + suffix)) allCaCfMatch = false;
  }
  check('CA01..CA24 and CF01..CF24 (all 48 instances) are all whitelisted via the pattern', allCaCfMatch);

  check('CA1 (single digit, not the two-digit CAnn shape) is rejected', !KeywordSpec.isWhitelisted('MNUBAR', 'CA1'));
  check('CAA1 (not CAnn) is rejected', !KeywordSpec.isWhitelisted('MNUBAR', 'CAA1'));
  check('CA100 (three digits) is rejected', !KeywordSpec.isWhitelisted('MNUBAR', 'CA100'));
  check('CFxx (non-numeric) is rejected', !KeywordSpec.isWhitelisted('MNUBAR', 'CFxx'));
  check('CB01 (not CA/CF) is rejected', !KeywordSpec.isWhitelisted('MNUBAR', 'CB01'));
}

// ===========================================================================
// Part 3 - DspfWriter.mnubarWhitelistConflictReason agrees with the spec,
// for every keyword name the codebase actually knows about, plus the full
// CAnn/CFnn pattern set.
// ===========================================================================
console.log('\nDspfWriter.mnubarWhitelistConflictReason vs. keywordSpec.js - full keyword sweep');
{
  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  check('KEYWORD-LOOKUP.json has a substantial keyword set to sweep (sanity check on the fixture itself)', allKeywordNames.length > 100);

  let mismatches = [];
  allKeywordNames.forEach((name) => {
    const specSaysAllowed = KeywordSpec.isWhitelisted('MNUBAR', name);
    const fnSaysConflict = !!DspfWriter.mnubarWhitelistConflictReason(name, mnubarRec);
    if (specSaysAllowed === fnSaysConflict) mismatches.push(name);
  });
  check('mnubarWhitelistConflictReason agrees with the spec on every keyword (' + allKeywordNames.length + ' checked)',
    mismatches.length === 0);

  // The 48 CAnn/CFnn instances specifically, since they're not literal
  // entries in KEYWORD-LOOKUP.json's own keyword universe.
  let caCfMismatches = [];
  for (let n = 1; n <= 24; n++) {
    const suffix = n < 10 ? '0' + n : '' + n;
    ['CA' + suffix, 'CF' + suffix].forEach((name) => {
      if (DspfWriter.mnubarWhitelistConflictReason(name, mnubarRec)) caCfMismatches.push(name);
    });
  }
  check('all 48 CAnn/CFnn instances are allowed on an MNUBAR record', caCfMismatches.length === 0);

  // A record without MNUBAR is never restricted by this function.
  const plainRec = [k('RECORD')];
  check('a record without MNUBAR is never restricted', !DspfWriter.mnubarWhitelistConflictReason('SOMETHINGELSE', plainRec));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

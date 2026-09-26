/**
 * i121HlpdocHlprcdKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", Help-keyword mutex
 * web slice. HLPDOC (I-38/I-67) and HLPBDY/HLPPNLGRP/HLPRCD/HLPRTN's own
 * cross-exclusions used to live as bare string-literal comparisons spread
 * across three functions (hlpdocConflictReason, hlpdocHspecConflictReason,
 * hlprcdConflictReason), each re-embedding the same DDS-Reference-stated
 * pairings independently. They now read from keywordSpec.js's
 * RECORD_TYPES.HLPDOC.mutex (HLPBDY/HLPPNLGRP/HLPRTN) and
 * RECORD_TYPES.HLPPNLGRP.mutex (HLPRCD) instead.
 *
 * This file verifies:
 *  1. Both spec entries match their own DDS Reference text verbatim, and
 *     HLPRTN is deliberately absent from HLPPNLGRP's own entry (that
 *     relationship is HLPDOC's, not HLPPNLGRP's - modeled once).
 *  2. hlpdocConflictReason (file-level) agrees with the spec, both
 *     directions, for HLPPNLGRP and HLPRTN.
 *  3. hlpdocHspecConflictReason (H-spec-level) agrees with the spec for
 *     HLPBDY (same-spec scope) and HLPPNLGRP (file-wide scope, via
 *     anyHelpKeywordPresentInFile) - and confirms HLPRTN is still never
 *     checked here (I-90's own deliberate omission, unaffected by this
 *     refactor).
 *  4. hlprcdConflictReason agrees with the spec, both directions, for
 *     HLPPNLGRP - and confirms HLPRCD/HLPDOC still coexist freely (no
 *     DDS Reference text forbids that pairing, so neither entry lists
 *     the other).
 *
 * Run with: node src/test/i121HlpdocHlprcdKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

// A minimal model shape for anyHelpKeywordPresentInFile: .fileKeywords and
// .records[].helpEntries[].keywords.
function model(fileKeywords, helpEntries) {
  return {
    fileKeywords: fileKeywords || [],
    records: [{ helpEntries: helpEntries || [] }]
  };
}

// ===========================================================================
// Part 1 - the spec entries match the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.HLPDOC / RECORD_TYPES.HLPPNLGRP');
{
  check('HLPDOC.mutex is exactly [HLPBDY, HLPPNLGRP, HLPRTN]',
    KeywordSpec.mutexKeywords('HLPDOC').length === 3 &&
    ['HLPBDY', 'HLPPNLGRP', 'HLPRTN'].every((n) => KeywordSpec.isMutex('HLPDOC', n)));
  check('HLPDOC ddsReference cites the exact DDS Reference wording', KeywordSpec.RECORD_TYPES.HLPDOC.ddsReference.indexOf('You cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN') !== -1);

  check('HLPPNLGRP.mutex is exactly [HLPRCD] (HLPDOC half is on the HLPDOC entry, not repeated)',
    KeywordSpec.mutexKeywords('HLPPNLGRP').length === 1 && KeywordSpec.isMutex('HLPPNLGRP', 'HLPRCD'));
  check('HLPPNLGRP does NOT list HLPDOC in its own mutex (single source of truth for that pair)', !KeywordSpec.isMutex('HLPPNLGRP', 'HLPDOC'));
  check('HLPPNLGRP ddsReference cites the exact DDS Reference wording', KeywordSpec.RECORD_TYPES.HLPPNLGRP.ddsReference.indexOf('a display file cannot contain both HLPPNLGRP and HLPRCD') !== -1);
}

// ===========================================================================
// Part 2 - hlpdocConflictReason (file-level), both directions
// ===========================================================================
console.log('\nDspfWriter.hlpdocConflictReason (file level)');
{
  check('HLPDOC is blocked when HLPPNLGRP is already present', !!DspfWriter.hlpdocConflictReason('HLPDOC', [k('HLPPNLGRP')]));
  check('HLPPNLGRP is blocked when HLPDOC is already present (reverse direction)', !!DspfWriter.hlpdocConflictReason('HLPPNLGRP', [k('HLPDOC')]));
  check('HLPDOC is blocked when HLPRTN is already present', !!DspfWriter.hlpdocConflictReason('HLPDOC', [k('HLPRTN')]));
  check('HLPRTN is blocked when HLPDOC is already present (reverse direction)', !!DspfWriter.hlpdocConflictReason('HLPRTN', [k('HLPDOC')]));
  check('HLPDOC is allowed on a file with neither HLPPNLGRP nor HLPRTN', !DspfWriter.hlpdocConflictReason('HLPDOC', [k('HELP')]));
  check('a keyword outside this relationship is untouched', !DspfWriter.hlpdocConflictReason('HELP', [k('HLPDOC')]));
}

// ===========================================================================
// Part 3 - hlpdocHspecConflictReason (H-spec level)
// ===========================================================================
console.log('\nDspfWriter.hlpdocHspecConflictReason (H-spec level)');
{
  check('HLPDOC is blocked when HLPBDY is on the SAME H-spec', !!DspfWriter.hlpdocHspecConflictReason('HLPDOC', [k('HLPBDY')], model(), null));
  check('HLPBDY is blocked when HLPDOC is on the SAME H-spec (reverse direction)', !!DspfWriter.hlpdocHspecConflictReason('HLPBDY', [k('HLPDOC')], model(), null));
  check('HLPDOC is blocked when HLPPNLGRP is anywhere in the file (file-wide scope)', !!DspfWriter.hlpdocHspecConflictReason('HLPDOC', [], model([k('HLPPNLGRP')]), null));
  check('HLPPNLGRP is blocked when HLPDOC is anywhere in the file (reverse direction)', !!DspfWriter.hlpdocHspecConflictReason('HLPPNLGRP', [], model([k('HLPDOC')]), null));
  check('HLPDOC is NOT blocked by HLPRTN at H-spec level (I-90 own deliberate omission, unaffected by this refactor)', !DspfWriter.hlpdocHspecConflictReason('HLPDOC', [k('HLPRTN')], model(), null));
  check('HLPDOC on an H-spec with neither HLPBDY nor file-wide HLPPNLGRP is allowed', !DspfWriter.hlpdocHspecConflictReason('HLPDOC', [], model(), null));
}

// ===========================================================================
// Part 4 - hlprcdConflictReason, both directions, and the HLPRCD/HLPDOC
// non-relationship
// ===========================================================================
console.log('\nDspfWriter.hlprcdConflictReason');
{
  check('HLPRCD is blocked when HLPPNLGRP is already present', !!DspfWriter.hlprcdConflictReason('HLPRCD', [k('HLPPNLGRP')]));
  check('HLPPNLGRP is blocked when HLPRCD is already present (reverse direction)', !!DspfWriter.hlprcdConflictReason('HLPPNLGRP', [k('HLPRCD')]));
  check('HLPRCD and HLPDOC coexist freely - nowhere does the DDS Reference forbid that pairing', !DspfWriter.hlprcdConflictReason('HLPRCD', [k('HLPDOC')]) && !DspfWriter.hlprcdConflictReason('HLPDOC', [k('HLPRCD')]));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

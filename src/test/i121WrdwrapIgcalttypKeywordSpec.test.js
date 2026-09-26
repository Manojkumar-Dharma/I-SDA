/**
 * i121WrdwrapIgcalttypKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", WRDWRAP/IGCALTTYP
 * slice. wrdwrapKeywordHit's (I-58) own WRDWRAP_KEYWORD_CONFLICTS map and
 * igcalttypKeywordHits's (I-71) own IGCALTTYP_KEYWORD_CONFLICTS map - both
 * evaluated through the same generic `exclusionListHit` token-matching
 * engine - now live as `conditionalMutex` on keywordSpec.js's
 * RECORD_TYPES.WRDWRAP and RECORD_TYPES.IGCALTTYP, evaluated via the new
 * KeywordSpec.conditionalMutexHit (the engine itself moved here too, the
 * same "evaluation logic lives beside the data" split isMutex/
 * isWhitelisted already established). This is a new shape from every
 * entry before it: not a plain keyword NAME set, but a name -> null |
 * [parameter tokens] map.
 *
 * This file verifies:
 *  1. Both spec entries match their own DDS Reference text verbatim.
 *  2. conditionalMutexHit reproduces the exact token-matching semantics
 *     (null entries excluded outright; array entries only when a listed
 *     token is present; non-listed tokens on the same keyword are fine).
 *  3. wrdwrapKeywordHit/wrdwrapKeywordHits and igcalttypKeywordHits/
 *     igcalttypConflictReason (forward add-time and reverse) still agree
 *     with the spec, and the deliberately-not-repeated IGCALTTYP-vs-
 *     WRDWRAP pairing (modeled once, on WRDWRAP's own entry) is unchanged.
 *
 * Run with: node src/test/i121WrdwrapIgcalttypKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// Part 1 - the spec entries match the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.WRDWRAP / RECORD_TYPES.IGCALTTYP');
{
  const wrdwrap = KeywordSpec.RECORD_TYPES.WRDWRAP.conditionalMutex;
  check('WRDWRAP.conditionalMutex has exactly the 7 DDS-Reference-named entries',
    Object.keys(wrdwrap).length === 7 &&
    JSON.stringify(wrdwrap.AUTO) === JSON.stringify(['RAZ', 'RAB']) &&
    JSON.stringify(wrdwrap.CHECK) === JSON.stringify(['MF', 'M10F', 'M11F', 'RB', 'RZ', 'RL', 'RLTB']) &&
    JSON.stringify(wrdwrap.CHGINPDFT) === JSON.stringify(['MF']) &&
    JSON.stringify(wrdwrap.DSPATR) === JSON.stringify(['OID', 'SP']) &&
    wrdwrap.DUP === null && wrdwrap.FLTFIXDEC === null && wrdwrap.IGCALTTYP === null);
  check('WRDWRAP ddsReference cites the exact wording', KeywordSpec.RECORD_TYPES.WRDWRAP.ddsReference.indexOf('AUTO(RAZ, RAB), CHECK(MF, M10F, M11F, RB, RZ, RL, RLTB), CHGINPDFT(MF), DSPATR(OID, SP), DUP, FLTFIXDEC, IGCALTTYP') !== -1);
  check('WRDWRAP.notAllowedInRecordType is SFL', KeywordSpec.notAllowedInRecordType('WRDWRAP') === 'SFL');
  check('WRDWRAP ddsReference cites the SFL note too', KeywordSpec.RECORD_TYPES.WRDWRAP.ddsReference.indexOf('Subfiles do not support WRDWRAP') !== -1);

  const igc = KeywordSpec.RECORD_TYPES.IGCALTTYP.conditionalMutex;
  check('IGCALTTYP.conditionalMutex has exactly the 8 DDS-Reference-named entries',
    Object.keys(igc).length === 8 &&
    JSON.stringify(igc.AUTO) === JSON.stringify(['RAZ']) &&
    igc.BLKFOLD === null &&
    JSON.stringify(igc.CHECK) === JSON.stringify(['M10', 'M11', 'M10F', 'M11F', 'RL', 'RZ', 'VN', 'VNE']) &&
    igc.CMP === null && igc.COMP === null && igc.DUP === null && igc.RANGE === null && igc.VALUES === null);
  check('IGCALTTYP ddsReference cites the exact wording', KeywordSpec.RECORD_TYPES.IGCALTTYP.ddsReference.indexOf('AUTO(RAZ), BLKFOLD, CHECK(M10 M11 M10F M11F RL RZ VN VNE), CMP(EQ GE GT LE LT NE NG NL), COMP(EQ GE GT LE LT NE NG NL), DUP, RANGE, VALUES') !== -1);
  check('IGCALTTYP.conditionalMutex does NOT repeat WRDWRAP (single source of truth for that pair, modeled on WRDWRAP own entry instead)', !Object.prototype.hasOwnProperty.call(igc, 'WRDWRAP'));
}

// ===========================================================================
// Part 2 - conditionalMutexHit's token-matching semantics
// ===========================================================================
console.log('\nKeywordSpec.conditionalMutexHit - token matching');
{
  check('AUTO(RAB) hits WRDWRAP (RAB is on the list)', KeywordSpec.conditionalMutexHit('WRDWRAP', k('AUTO', 'RAB')) === 'AUTO(RAB)');
  check('AUTO(RAF) does NOT hit WRDWRAP (RAF is not on the list)', KeywordSpec.conditionalMutexHit('WRDWRAP', k('AUTO', 'RAF')) === null);
  check('CHECK(AB) does NOT hit WRDWRAP (AB is not on the 7-code list)', KeywordSpec.conditionalMutexHit('WRDWRAP', k('CHECK', 'AB')) === null);
  check('CHECK(RB) hits WRDWRAP', KeywordSpec.conditionalMutexHit('WRDWRAP', k('CHECK', 'RB')) === 'CHECK(RB)');
  check('DUP hits WRDWRAP outright regardless of parameters (null entry)', KeywordSpec.conditionalMutexHit('WRDWRAP', k('DUP')) === 'DUP');
  check('a keyword with no entry at all does not hit', KeywordSpec.conditionalMutexHit('WRDWRAP', k('COLOR', 'RED')) === null);
  check('a record type with no spec entry never hits', KeywordSpec.conditionalMutexHit('NOSUCHTYPE', k('DUP')) === null);

  check('AUTO(RAZ) hits IGCALTTYP', KeywordSpec.conditionalMutexHit('IGCALTTYP', k('AUTO', 'RAZ')) === 'AUTO(RAZ)');
  check('AUTO(RAB) does NOT hit IGCALTTYP (only RAZ is excluded here, unlike WRDWRAP)', KeywordSpec.conditionalMutexHit('IGCALTTYP', k('AUTO', 'RAB')) === null);
  check('CMP(EQ) hits IGCALTTYP outright (null entry) regardless of which operator', KeywordSpec.conditionalMutexHit('IGCALTTYP', k('CMP', 'EQ')) === 'CMP');
}

// ===========================================================================
// Part 3 - dspfWriter.js consumers agree with the spec
// ===========================================================================
console.log('\nDspfWriter WRDWRAP/IGCALTTYP conflict functions');
{
  check('wrdwrapFieldConflictReason reports DUP as a conflict', DspfWriter.wrdwrapFieldConflictReason('WRDWRAP', [k('DUP')], 'A', 'I', []).indexOf('DUP') !== -1);
  check('wrdwrapFieldConflictReason is null (no conflict) for an unrelated keyword set', DspfWriter.wrdwrapFieldConflictReason('WRDWRAP', [k('COLOR', 'RED')], 'A', 'I', []) === null);
  check('wrdwrapFieldConflictReason blocks WRDWRAP on a field of an SFL record', !!DspfWriter.wrdwrapFieldConflictReason('WRDWRAP', [], 'A', 'I', [k('SFL')]));
  check('wrdwrapFieldConflictReason allows WRDWRAP on a field of a non-SFL record', !DspfWriter.wrdwrapFieldConflictReason('WRDWRAP', [], 'A', 'I', [k('TEXT')]));
  check('igcalttypConflictReason (add-time) blocks IGCALTTYP when BLKFOLD is already on the field', !!DspfWriter.igcalttypConflictReason('IGCALTTYP', '', [k('BLKFOLD')], 'A'));
  check('igcalttypConflictReason (reverse) blocks BLKFOLD when IGCALTTYP is already on the field', !!DspfWriter.igcalttypConflictReason('BLKFOLD', '', [k('IGCALTTYP')], 'A'));
  check('igcalttypConflictReason does not block an unrelated keyword', !DspfWriter.igcalttypConflictReason('COLOR', 'RED', [k('IGCALTTYP')], 'A'));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

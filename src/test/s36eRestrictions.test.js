/**
 * s36eRestrictions.test.js
 *
 * Direct unit coverage for Task S36-3's S36E restriction rule table in
 * dspfWriter.js (getS36ERestriction, isUsrdspmgtActive,
 * checkS36EResponseIndicatorViolation, s36ERuleViolationMessage,
 * findS36EConflictInModel). Pure Node, no vscode/jsdom needed - this is a
 * plain data lookup plus a couple of small evaluator functions, the same
 * shape as the existing keyword pickers.
 *
 * Update: all 6 keywords are now verified (previously ALTNAME/MSGID/
 * RETKEY/RETCMDKEY were open items) using the official IBM i "DDS for
 * Display Files" reference PDF the person supplied directly
 * (docs/sda-reference/source/DDS_Keyword_V7r6.pdf). That research also
 * corrected an earlier PRINT(*PGM) inference - see dspfWriter.js's own
 * S36E_KEYWORD_RESTRICTIONS comment for the full citation trail.
 *
 * Run with: node src/test/s36eRestrictions.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

console.log('getS36ERestriction - all 6 named keywords (7 counting HLPRTN) have a table entry, and all are now verified');
{
  ['ALTNAME', 'CHANGE', 'HELP', 'HLPRTN', 'MSGID', 'PRINT', 'RETKEY', 'RETCMDKEY'].forEach(function (kw) {
    var entry = DspfWriter.getS36ERestriction(kw);
    check(kw + ' has an entry', entry !== null);
    check(kw + ' is verified', entry && entry.verified === true);
    check(kw + ' has a non-empty rule string', entry && typeof entry.rule === 'string' && entry.rule.length > 0);
  });
  check('unrelated keyword has no entry', DspfWriter.getS36ERestriction('INDARA') === null);
  check('unknown/garbage keyword has no entry', DspfWriter.getS36ERestriction('NOTAKEYWORD') === null);
  check('lookup is case-insensitive (lowercase)', DspfWriter.getS36ERestriction('change') !== null);
  check('blank/undefined keyword name does not throw', DspfWriter.getS36ERestriction() === null && DspfWriter.getS36ERestriction('') === null);
}

console.log('\ngetS36ERestriction - 3 of the 6 are actually GATED by USRDSPMGT (CHANGE/HELP/PRINT); the other 3 are general rules that apply unconditionally');
{
  ['CHANGE', 'HELP', 'PRINT', 'HLPRTN'].forEach(function (kw) {
    check(kw + ' is gatedByUsrdspmgt', DspfWriter.getS36ERestriction(kw).gatedByUsrdspmgt === true);
  });
  ['ALTNAME', 'MSGID', 'RETKEY', 'RETCMDKEY'].forEach(function (kw) {
    var entry = DspfWriter.getS36ERestriction(kw);
    check(kw + ' is NOT gatedByUsrdspmgt (general rule, not USRDSPMGT-specific)', entry.gatedByUsrdspmgt === false);
    check(kw + ' has no severity (not a USRDSPMGT violation)', entry.severity === null);
    check(kw + ' does not use the response-indicator shape', entry.appliesTo === null);
  });
}

console.log('\ngetS36ERestriction - the 3 USRDSPMGT-gated, response-indicator-shaped entries (CHANGE, HELP, PRINT) carry a real severity + rule');
{
  var change = DspfWriter.getS36ERestriction('CHANGE');
  check('CHANGE severity is warning (not error)', change.severity === 'warning');
  check('CHANGE applies to the response-indicator shape', change.appliesTo === 'response-indicator');

  var help = DspfWriter.getS36ERestriction('HELP');
  check('HELP severity is error (the documented exception vs. CHANGE/PRINT warning)', help.severity === 'error');
  check('HELP applies to the response-indicator shape', help.appliesTo === 'response-indicator');

  var print = DspfWriter.getS36ERestriction('PRINT');
  check('PRINT severity is warning (not error)', print.severity === 'warning');
  check('PRINT applies to the response-indicator shape', print.appliesTo === 'response-indicator');
  check('PRINT has a pgmSpecialValueNote documenting *PGM is NOT a violation', typeof print.pgmSpecialValueNote === 'string' && print.pgmSpecialValueNote.length > 0);

  var hlprtn = DspfWriter.getS36ERestriction('HLPRTN');
  check('HLPRTN entry exists but carries no severity of its own (it satisfies HELP\'s restriction, isn\'t restricted itself)', hlprtn.severity === null);
}

console.log('\nisUsrdspmgtActive - thin wrapper over the already-confirmed (S36-2) USRDSPMGT flag keyword');
{
  check('false on an empty file-level keywords array', DspfWriter.isUsrdspmgtActive([]) === false);
  var kw = DspfWriter.setFileFlagKeyword([], 'USRDSPMGT', true);
  check('true once USRDSPMGT is set', DspfWriter.isUsrdspmgtActive(kw) === true);
  kw = DspfWriter.setFileFlagKeyword(kw, 'USRDSPMGT', false);
  check('false again once USRDSPMGT is unset', DspfWriter.isUsrdspmgtActive(kw) === false);
}

console.log('\ncheckS36EResponseIndicatorViolation - gated on USRDSPMGT being active at all');
{
  var kwOff = [];
  check(
    'no violation for CHANGE with a response indicator when USRDSPMGT is OFF',
    DspfWriter.checkS36EResponseIndicatorViolation(kwOff, 'CHANGE', '67') === null
  );

  var kwOn = DspfWriter.setFileFlagKeyword([], 'USRDSPMGT', true);
  var violation = DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'CHANGE', '67');
  check('violation found for CHANGE with a response indicator when USRDSPMGT is ON', violation !== null);
  check('violation carries CHANGE\'s warning severity', violation.severity === 'warning');
  check('violation carries a non-empty message', typeof violation.message === 'string' && violation.message.length > 0);
}

console.log('\ncheckS36EResponseIndicatorViolation - a blank/whitespace response indicator never violates (nothing to flag)');
{
  var kwOn = DspfWriter.setFileFlagKeyword([], 'USRDSPMGT', true);
  check('empty string', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'HELP', '') === null);
  check('undefined', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'HELP', undefined) === null);
  check('whitespace-only', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'HELP', '   ') === null);
}

console.log('\ncheckS36EResponseIndicatorViolation - HELP\'s violation is specifically an error, distinct from CHANGE/PRINT\'s warning');
{
  var kwOn = DspfWriter.setFileFlagKeyword([], 'USRDSPMGT', true);
  var helpViolation = DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'HELP', '01');
  check('HELP violation severity is error', helpViolation.severity === 'error');

  var printViolation = DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'PRINT', '02');
  check('PRINT violation severity is warning', printViolation.severity === 'warning');
}

console.log('\ncheckS36EResponseIndicatorViolation - CORRECTION: PRINT(*PGM) does NOT violate - it\'s a valid, documented special value, not a response indicator (verified against IBM\'s own dedicated PRINT(*PGM) S36E sub-page, superseding an earlier, incorrect inference)');
{
  var kwOn = DspfWriter.setFileFlagKeyword([], 'USRDSPMGT', true);
  check('PRINT(*PGM) - no violation', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'PRINT', '*PGM') === null);
  check('PRINT(*pgm) lowercase - still no violation (case-insensitive)', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'PRINT', '*pgm') === null);
  check('PRINT(*Pgm) with surrounding whitespace - still no violation', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'PRINT', '  *Pgm  ') === null);
  check('a genuine numeric response indicator on PRINT still violates', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'PRINT', '30') !== null);
  check('*PGM on a DIFFERENT keyword (CHANGE) is not exempted - still violates', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'CHANGE', '*PGM') !== null);
}

console.log('\ncheckS36EResponseIndicatorViolation - the 3 non-gated keywords (ALTNAME/MSGID/RETKEY/RETCMDKEY) never produce a response-indicator violation, even with USRDSPMGT on (they\'re verified now, but their rules aren\'t response-indicator-shaped or USRDSPMGT-conditional at all)');
{
  var kwOn = DspfWriter.setFileFlagKeyword([], 'USRDSPMGT', true);
  check('ALTNAME', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'ALTNAME', 'anything') === null);
  check('MSGID', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'MSGID', 'anything') === null);
  check('RETKEY', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'RETKEY', 'anything') === null);
  check('RETCMDKEY', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'RETCMDKEY', 'anything') === null);
  check('HLPRTN (verified, gated, but not a response-indicator-shaped rule)', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'HLPRTN', 'anything') === null);
  check('unknown keyword name', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'NOTAKEYWORD', 'anything') === null);
}

console.log('\ns36ERuleViolationMessage (Task S36-4) - the USRDSPMGT-independent half of checkS36EResponseIndicatorViolation');
{
  check('CHANGE with a response indicator violates regardless of USRDSPMGT', DspfWriter.s36ERuleViolationMessage('CHANGE', '30') !== null);
  check('a blank response indicator never violates', DspfWriter.s36ERuleViolationMessage('CHANGE', '') === null);
  check('a non-gated keyword (ALTNAME) never violates via this response-indicator check', DspfWriter.s36ERuleViolationMessage('ALTNAME', 'anything') === null);
  check('PRINT(*PGM) never violates via this check either', DspfWriter.s36ERuleViolationMessage('PRINT', '*PGM') === null);
  check('message text matches the rule table entry', DspfWriter.s36ERuleViolationMessage('HELP', '30') === DspfWriter.getS36ERestriction('HELP').rule);
}

console.log('\nfindS36EConflictInModel (Task S36-4) - the symmetric block: scans the WHOLE model for an existing value that would conflict if USRDSPMGT were turned on');
{
  check('a clean model (nothing set) has no conflict', DspfWriter.findS36EConflictInModel({ fileKeywords: [], records: [] }) === null);

  // File-level HELP with a response indicator conflicts.
  var fileKeywords = DspfWriter.setFileFlagKeyword([], 'HELP', true, '30');
  var conflict = DspfWriter.findS36EConflictInModel({ fileKeywords: fileKeywords, records: [] });
  check('file-level HELP is found', conflict && conflict.keyword === 'HELP' && conflict.location === 'File-level keywords');

  // File-level PRINT(*PGM) does NOT conflict (corrected - see the direct test above).
  var filePrintPgm = DspfWriter.setFileFlagKeyword([], 'PRINT', true, '*PGM');
  check('file-level PRINT(*PGM) is NOT found (valid special value, not a violation)', DspfWriter.findS36EConflictInModel({ fileKeywords: filePrintPgm, records: [] }) === null);

  // A record's own PRINT flag conflicts too, independent of file-level keywords.
  var recWithPrint = { name: 'REC1', keywords: DspfWriter.setFileFlagKeyword([], 'PRINT', true, '40') };
  var recPrintConflict = DspfWriter.findS36EConflictInModel({ fileKeywords: [], records: [recWithPrint] });
  check('record-level PRINT is found, location names the record', recPrintConflict && recPrintConflict.keyword === 'PRINT' && recPrintConflict.location === 'Record REC1');

  // A record's own HELP/CHANGE indicator instance conflicts too.
  var recWithChange = { name: 'REC2', keywords: DspfWriter.setRecordIndicatorInstances([], [{ kind: 'CHANGE', conditions: [], resp: '50', text: '' }]) };
  var recChangeConflict = DspfWriter.findS36EConflictInModel({ fileKeywords: [], records: [recWithChange] });
  check('record-level CHANGE indicator instance is found, location names the record', recChangeConflict && recChangeConflict.keyword === 'CHANGE' && recChangeConflict.location === 'Record REC2');

  // A CLEAR/SETOF/etc. instance (not HELP/CHANGE) never conflicts, even with a response indicator.
  var recWithClear = { name: 'REC3', keywords: DspfWriter.setRecordIndicatorInstances([], [{ kind: 'CLEAR', conditions: [], resp: '60', text: '' }]) };
  check('a non-restricted kind (CLEAR) never conflicts', DspfWriter.findS36EConflictInModel({ fileKeywords: [], records: [recWithClear] }) === null);

  // ALTNAME/MSGID/RETKEY/RETCMDKEY are verified but not USRDSPMGT-gated - never scanned/flagged by this USRDSPMGT-specific scan.
  var fileWithAltname = DspfWriter.setFileQuotedText([], 'ALTNAME', 'SOMENAME');
  check('non-gated keywords are never flagged by the whole-model scan', DspfWriter.findS36EConflictInModel({ fileKeywords: fileWithAltname, records: [] }) === null);

  // First conflict found wins - file-level HELP checked before any record.
  var fileWithHelp = DspfWriter.setFileFlagKeyword([], 'HELP', true, '30');
  var multiConflict = DspfWriter.findS36EConflictInModel({ fileKeywords: fileWithHelp, records: [recWithPrint] });
  check('file-level conflict is reported before scanning records', multiConflict.location === 'File-level keywords');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

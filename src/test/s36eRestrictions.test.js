/**
 * s36eRestrictions.test.js
 *
 * Direct unit coverage for Task S36-3's S36E restriction rule table in
 * dspfWriter.js (getS36ERestriction, isUsrdspmgtActive,
 * checkS36EResponseIndicatorViolation). Pure Node, no vscode/jsdom needed -
 * this is a plain data lookup plus one small evaluator function, the same
 * shape as the existing keyword pickers.
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

console.log('getS36ERestriction - all 6 named keywords (7 counting HLPRTN) have a table entry');
{
  ['ALTNAME', 'CHANGE', 'HELP', 'HLPRTN', 'MSGID', 'PRINT', 'RETKEY', 'RETCMDKEY'].forEach(function (kw) {
    check(kw + ' has an entry', DspfWriter.getS36ERestriction(kw) !== null);
  });
  check('unrelated keyword has no entry', DspfWriter.getS36ERestriction('INDARA') === null);
  check('unknown/garbage keyword has no entry', DspfWriter.getS36ERestriction('NOTAKEYWORD') === null);
  check('lookup is case-insensitive (lowercase)', DspfWriter.getS36ERestriction('change') !== null);
  check('blank/undefined keyword name does not throw', DspfWriter.getS36ERestriction() === null && DspfWriter.getS36ERestriction('') === null);
}

console.log('\ngetS36ERestriction - the 3 verified entries (CHANGE, HELP, PRINT) carry a real severity + rule');
{
  var change = DspfWriter.getS36ERestriction('CHANGE');
  check('CHANGE is verified', change.verified === true);
  check('CHANGE severity is warning (not error)', change.severity === 'warning');
  check('CHANGE applies to the response-indicator shape', change.appliesTo === 'response-indicator');
  check('CHANGE has a non-empty rule string', typeof change.rule === 'string' && change.rule.length > 0);

  var help = DspfWriter.getS36ERestriction('HELP');
  check('HELP is verified', help.verified === true);
  check('HELP severity is error (the documented exception vs. CHANGE/PRINT warning)', help.severity === 'error');
  check('HELP applies to the response-indicator shape', help.appliesTo === 'response-indicator');
  check('HELP has a non-empty rule string', typeof help.rule === 'string' && help.rule.length > 0);

  var print = DspfWriter.getS36ERestriction('PRINT');
  check('PRINT is verified', print.verified === true);
  check('PRINT severity is warning (not error)', print.severity === 'warning');
  check('PRINT applies to the response-indicator shape', print.appliesTo === 'response-indicator');
  check('PRINT has a non-empty rule string', typeof print.rule === 'string' && print.rule.length > 0);

  var hlprtn = DspfWriter.getS36ERestriction('HLPRTN');
  check('HLPRTN entry exists but carries no severity of its own (it satisfies HELP\'s restriction, isn\'t restricted itself)', hlprtn.verified === true && hlprtn.severity === null);
}

console.log('\ngetS36ERestriction - the 3 unverified entries (ALTNAME, MSGID, RETKEY/RETCMDKEY) are explicit open items, not silently-empty guesses');
{
  ['ALTNAME', 'MSGID', 'RETKEY', 'RETCMDKEY'].forEach(function (kw) {
    var entry = DspfWriter.getS36ERestriction(kw);
    check(kw + ' is marked NOT verified', entry.verified === false);
    check(kw + ' has no severity encoded', entry.severity === null);
    check(kw + ' has no rule encoded (no guessed constraint)', entry.rule === null);
    check(kw + ' documents WHY it is unverified rather than being silently blank', typeof entry.notes === 'string' && entry.notes.length > 0);
  });
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

  // PRINT(*PGM) is documented as functionally the response-indicator form
  // of PRINT (IBM's own PRINT keyword page), so the *PGM literal itself
  // must trip the same rule as a numeric response indicator would.
  var printPgmViolation = DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'PRINT', '*PGM');
  check('PRINT(*PGM) violation severity is warning, same as PRINT\'s numeric response-indicator form', printPgmViolation.severity === 'warning');
}

console.log('\ncheckS36EResponseIndicatorViolation - unverified keywords (ALTNAME/MSGID/RETKEY/RETCMDKEY) never produce a violation, even with USRDSPMGT on');
{
  var kwOn = DspfWriter.setFileFlagKeyword([], 'USRDSPMGT', true);
  check('ALTNAME', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'ALTNAME', 'anything') === null);
  check('MSGID', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'MSGID', 'anything') === null);
  check('RETKEY', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'RETKEY', 'anything') === null);
  check('RETCMDKEY', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'RETCMDKEY', 'anything') === null);
  check('HLPRTN (verified, but not a response-indicator-shaped rule)', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'HLPRTN', 'anything') === null);
  check('unknown keyword name', DspfWriter.checkS36EResponseIndicatorViolation(kwOn, 'NOTAKEYWORD', 'anything') === null);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

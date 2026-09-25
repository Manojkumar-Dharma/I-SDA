/**
 * i121SflKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFL slice. SFL's
 * own DDS Reference section states TWO mutually exclusive closed
 * whitelists under one heading, split by whether the record is a message
 * subfile (has SFLMSGRCD) - so this slice is two spec entries,
 * RECORD_TYPES.SFL and RECORD_TYPES.SFLMSG, not one. SFLCTL was re-read
 * fresh too and needs no whitelist entry of its own (its own DDS
 * Reference section is an explicit SUMMARY of SFL-family keywords, not a
 * closed "nothing else applies" list - see sflWhitelistConflictReason's
 * own doc comment). SFLMSG is also a new SHAPE in this spec: a record
 * type identified by TWO marker keywords present together (SFL AND
 * SFLMSGRCD), not one - unlike every previous slice's single
 * markerKeyword.
 *
 * This file verifies:
 *  1. Both spec entries match their respective DDS Reference text
 *     verbatim.
 *  2. DspfWriter.sflWhitelistConflictReason agrees with the spec on
 *     every keyword in KEYWORD-LOOKUP.json, in both the plain-SFL and
 *     message-subfile (SFL+SFLMSGRCD) cases.
 *  3. A record with SFLMSGRCD but no SFL is not treated as either SFL
 *     variant (SFL itself is the function's own outer gate).
 *
 * Run with: node src/test/i121SflKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });
const sflRec = [k('SFL')];
const sflMsgRec = [k('SFL'), k('SFLMSGRCD')];

// ===========================================================================
// Part 1 - the spec entries match the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.SFL');
{
  const spec = KeywordSpec.RECORD_TYPES.SFL;
  const expectedWhitelist = [
    'SFL', 'CHANGE', 'LOGINP', 'CHECK', 'LOGOUT', 'SETOF', 'SETOFF',
    'CHGINPDFT', 'INDTXT', 'SFLNXTCHG', 'KEEP', 'TEXT'
  ];
  check('whitelist has exactly the 11 DDS-Reference-named keywords plus SFL itself, no more no less',
    spec.whitelist.length === expectedWhitelist.length &&
    expectedWhitelist.every((name) => spec.whitelist.indexOf(name) !== -1));
  check('SFLMSGRCD is NOT on the plain-SFL whitelist (it belongs to the message-subfile variant only)',
    spec.whitelist.indexOf('SFLMSGRCD') === -1);
  check('ddsReference cites the plain-subfile wording', spec.ddsReference.indexOf('CHECK(AB), CHECK(RL)') !== -1);
}

console.log('\nkeywordSpec.js RECORD_TYPES.SFLMSG');
{
  const spec = KeywordSpec.RECORD_TYPES.SFLMSG;
  check('markerKeywords is exactly [SFL, SFLMSGRCD] (the two-keyword combination shape)',
    spec.markerKeywords.length === 2 && spec.markerKeywords.indexOf('SFL') !== -1 && spec.markerKeywords.indexOf('SFLMSGRCD') !== -1);
  check('whitelist is exactly [SFL, SFLMSGRCD] - SFLMSGKEY/SFLPGMQ excluded as field-level, not record-level',
    spec.whitelist.length === 2 && spec.whitelist.indexOf('SFL') !== -1 && spec.whitelist.indexOf('SFLMSGRCD') !== -1);
  check('SFLMSGKEY is NOT on the record-level whitelist (field-level per the DDS Reference)', spec.whitelist.indexOf('SFLMSGKEY') === -1);
  check('SFLPGMQ is NOT on the record-level whitelist (field-level per the DDS Reference)', spec.whitelist.indexOf('SFLPGMQ') === -1);
  check('ddsReference cites the message-subfile wording', spec.ddsReference.indexOf('SFLMSGRCD') !== -1 && spec.ddsReference.indexOf('SFLMSGKEY') !== -1);
}

// ===========================================================================
// Part 2 - DspfWriter.sflWhitelistConflictReason agrees with the spec, for
// every keyword the codebase actually knows about, in both SFL variants.
// ===========================================================================
console.log('\nDspfWriter.sflWhitelistConflictReason vs. keywordSpec.js - full keyword sweep');
{
  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  check('KEYWORD-LOOKUP.json has a substantial keyword set to sweep (sanity check on the fixture itself)', allKeywordNames.length > 100);

  // Plain SFL record (no SFLMSGRCD).
  let mismatchesSfl = [];
  allKeywordNames.forEach((name) => {
    const specSaysAllowed = KeywordSpec.isWhitelisted('SFL', name);
    const fnSaysConflict = !!DspfWriter.sflWhitelistConflictReason(name, sflRec);
    if (specSaysAllowed === fnSaysConflict) mismatchesSfl.push(name);
  });
  check('plain-SFL: sflWhitelistConflictReason agrees with RECORD_TYPES.SFL on every keyword (' + allKeywordNames.length + ' checked)',
    mismatchesSfl.length === 0);

  // Message-subfile record (SFL + SFLMSGRCD).
  let mismatchesSflMsg = [];
  allKeywordNames.forEach((name) => {
    const specSaysAllowed = KeywordSpec.isWhitelisted('SFLMSG', name);
    const fnSaysConflict = !!DspfWriter.sflWhitelistConflictReason(name, sflMsgRec);
    if (specSaysAllowed === fnSaysConflict) mismatchesSflMsg.push(name);
  });
  check('message-subfile: sflWhitelistConflictReason agrees with RECORD_TYPES.SFLMSG on every keyword (' + allKeywordNames.length + ' checked)',
    mismatchesSflMsg.length === 0);

  // A CHANGE/LOGINP/etc. keyword that's allowed on plain SFL is correctly
  // BLOCKED on a message-subfile record (the two lists are mutually
  // exclusive per the DDS Reference's own "Besides SFL... For message
  // subfiles... For all other subfiles" split).
  check('CHANGE is allowed on a plain SFL record', !DspfWriter.sflWhitelistConflictReason('CHANGE', sflRec));
  check('CHANGE is blocked on a message-subfile record (mutually exclusive lists)', !!DspfWriter.sflWhitelistConflictReason('CHANGE', sflMsgRec));
  check('SFLMSGRCD is allowed on a message-subfile record', !DspfWriter.sflWhitelistConflictReason('SFLMSGRCD', sflMsgRec));
}

// ===========================================================================
// Part 3 - SFLMSGRCD alone (no SFL) is not treated as either SFL variant;
// SFL itself remains the function's own outer gate.
// ===========================================================================
console.log('\nSFLMSGRCD without SFL - not gated by this function at all');
{
  const sflMsgRcdOnlyRec = [k('SFLMSGRCD')];
  check('a record with SFLMSGRCD but no SFL is unrestricted by sflWhitelistConflictReason', !DspfWriter.sflWhitelistConflictReason('COLOR', sflMsgRcdOnlyRec));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i121HtmlKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", HTML slice.
 * htmlConflictReason's (I-41) own HTML_MUTUAL_EXCLUSION_KEYWORDS array
 * (a 14-keyword field-level mutex) plus its separate SFL record-level
 * exclusion now come from keywordSpec.js's RECORD_TYPES.HTML - the first
 * entry to combine the ordinary `mutex` shape (field-level partners) with
 * a new `notAllowedInRecordType` field (a single record type this
 * keyword's field can never belong to).
 *
 * This file verifies:
 *  1. The spec entry matches the DDS Reference text verbatim - both the
 *     14-keyword field-level list and the SFL record exclusion.
 *  2. htmlConflictReason agrees with the spec in both directions for the
 *     field-level mutex (all 14 partners, plus a full keyword sweep).
 *  3. htmlConflictReason still refuses HTML on an SFL record's field, and
 *     that check is skipped (not defaulted to blocked) when
 *     recordKeywords isn't supplied at all - unaffected by this refactor.
 *
 * Run with: node src/test/i121HtmlKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name) => ({ name: name, parameters: '', conditions: [], raw: '', sourceLines: [] });

const EXPECTED_MUTEX = [
  'COLOR', 'DATE', 'DFT', 'DSPATR', 'EDTCDE', 'EDTWRD', 'HLPID',
  'MSGCON', 'NOCCSID', 'OVRATR', 'PUTRETAIN', 'SYSNAME', 'TIME', 'USER'
];

// ===========================================================================
// Part 1 - the spec entry matches the DDS Reference text
// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.HTML');
{
  check('HTML.mutex is exactly the 14 DDS-Reference-named field-level keywords',
    KeywordSpec.mutexKeywords('HTML').length === EXPECTED_MUTEX.length &&
    EXPECTED_MUTEX.every((n) => KeywordSpec.isMutex('HTML', n)));
  check('HTML ddsReference cites the exact field-level mutex wording', KeywordSpec.RECORD_TYPES.HTML.ddsReference.indexOf('COLOR, DATE, DFT, DSPATR, EDTCDE, EDTWRD, HLPID, MSGCON, NOCCSID, OVRATR, PUTRETAIN, SYSNAME, TIME, USER') !== -1);
  check('HTML.notAllowedInRecordType is SFL', KeywordSpec.notAllowedInRecordType('HTML') === 'SFL');
  check('HTML ddsReference cites the exact SFL exclusion wording', KeywordSpec.RECORD_TYPES.HTML.ddsReference.indexOf('The HTML keyword is not allowed in a field of a subfile record') !== -1);
  check('notAllowedInRecordType returns null for a keyword with no such restriction', KeywordSpec.notAllowedInRecordType('COLOR') === null);
}

// ===========================================================================
// Part 2 - htmlConflictReason's field-level mutex, both directions, full sweep
// ===========================================================================
console.log('\nDspfWriter.htmlConflictReason - field-level mutex');
{
  EXPECTED_MUTEX.forEach((name) => {
    check('HTML is blocked when ' + name + ' is already on the field', !!DspfWriter.htmlConflictReason('HTML', [k(name)], []));
    check(name + ' is blocked when HTML is already on the field (reverse direction)', !!DspfWriter.htmlConflictReason(name, [k('HTML')], []));
  });

  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  let mismatches = [];
  allKeywordNames.forEach((name) => {
    if (name === 'HTML') return;
    const specSaysConflict = KeywordSpec.isMutex('HTML', name);
    const codeSaysConflict = !!DspfWriter.htmlConflictReason(name, [k('HTML')], []);
    if (specSaysConflict !== codeSaysConflict) mismatches.push(name);
  });
  check('htmlConflictReason agrees with the spec for every known non-HTML keyword (' + allKeywordNames.length + ' checked)', mismatches.length === 0);

  check('HTML is allowed on a field with an unrelated keyword', !DspfWriter.htmlConflictReason('HTML', [k('CHECK')], []));
}

// ===========================================================================
// Part 3 - htmlConflictReason's SFL record exclusion
// ===========================================================================
console.log('\nDspfWriter.htmlConflictReason - SFL record exclusion');
{
  check('HTML is blocked on a field of an SFL record', !!DspfWriter.htmlConflictReason('HTML', [], [k('SFL')]));
  check('HTML is allowed on a field of a non-SFL record', !DspfWriter.htmlConflictReason('HTML', [], [k('TEXT')]));
  check('the SFL check is skipped (not blocked) when recordKeywords is omitted entirely', !DspfWriter.htmlConflictReason('HTML', []));
  check('SFL being added to a record with an HTML field is untouched (one-directional, matches the DDS Reference\'s own wording)', !DspfWriter.htmlConflictReason('SFL', [k('HTML')], []));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

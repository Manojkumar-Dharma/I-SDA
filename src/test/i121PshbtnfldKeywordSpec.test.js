/**
 * i121PshbtnfldKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", PSHBTNFLD slice.
 * The field-level rule web spread across four functions - pshbtnfldConflictReason
 * (I-57, the whitelist plus the PSHBTNCHC requirement), pshbtnfldNewConflictReason
 * (I-64, the whitelist's diff-based backstop), pshbtnfldRemovalConflictReason
 * (I-85, the requirement's removal direction), pshbtnfldBasicEditConflictReason
 * (I-62, the field-definition rule) - now reads keywordSpec.js's own
 * `RECORD_TYPES.PSHBTNFLD` entry instead of four independently hand-written
 * copies of the same facts.
 *
 * Two genuinely new spec shapes this slice introduces:
 *  - `whitelistRequiredTokens`, consulted by isWhitelisted's own new
 *    optional `parameters` argument: DSPATR is a whitelisted NAME but only
 *    a DSPATR(PC) instance is actually allowed.
 *  - `REQUIRE_PAIRS` / `requiredPartner`: a symmetric "each requires the
 *    other's presence" relationship (PSHBTNFLD<->PSHBTNCHC), distinct from
 *    both `mutex` (excludes) and `MUTEX_GROUPS` (N-way excludes).
 *  - `definitionRequirements` / `KeywordSpec.definitionRequirements`: a
 *    field-definition rule (data type, length, decimals, allowed usage).
 *
 * This file verifies:
 *  1. isWhitelisted('PSHBTNFLD', ...) against the spec directly, including
 *     the DSPATR(PC)-only restriction and a full 186-keyword sweep.
 *  2. requiredPartner is symmetric for the PSHBTNFLD/PSHBTNCHC pair and
 *     null for an unrelated keyword.
 *  3. definitionRequirements('PSHBTNFLD') matches the DDS Reference.
 *  4. pshbtnfldConflictReason, pshbtnfldNewConflictReason,
 *     pshbtnfldRemovalConflictReason and pshbtnfldBasicEditConflictReason
 *     all still agree with the spec, preserving every existing behavior.
 *
 * Run with: node src/test/i121PshbtnfldKeywordSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name: name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

const ALLOWED = ['PSHBTNFLD', 'ALIAS', 'CHANGE', 'CHCAVAIL', 'CHCUNAVAIL', 'CHCCTL', 'INDTXT', 'NOCCSID', 'PSHBTNCHC', 'TEXT'];

// ===========================================================================
// Part 1 - KeywordSpec.isWhitelisted('PSHBTNFLD', ...)
// ===========================================================================
console.log('\nKeywordSpec.isWhitelisted(\'PSHBTNFLD\', ...)');
{
  ALLOWED.forEach((name) => {
    check(name + ' is whitelisted on a PSHBTNFLD field', KeywordSpec.isWhitelisted('PSHBTNFLD', name));
  });
  check('DSPATR(PC) is whitelisted', KeywordSpec.isWhitelisted('PSHBTNFLD', 'DSPATR', 'PC'));
  check('DSPATR(PC PC) (repeated token) is whitelisted', KeywordSpec.isWhitelisted('PSHBTNFLD', 'DSPATR', 'PC PC'));
  check('DSPATR(HI) is NOT whitelisted', !KeywordSpec.isWhitelisted('PSHBTNFLD', 'DSPATR', 'HI'));
  check('DSPATR() with no parameters is NOT whitelisted', !KeywordSpec.isWhitelisted('PSHBTNFLD', 'DSPATR', ''));
  check('DSPATR(PC HI) (mixed tokens) is NOT whitelisted', !KeywordSpec.isWhitelisted('PSHBTNFLD', 'DSPATR', 'PC HI'));
  check('DSPATR with no parameters argument at all is NOT whitelisted', !KeywordSpec.isWhitelisted('PSHBTNFLD', 'DSPATR'));

  const lookupPath = path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json');
  const lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
  const allKeywordNames = Object.keys(lookup.keywords);
  check('KEYWORD-LOOKUP.json has a substantial keyword set to sweep (sanity check on the fixture itself)', allKeywordNames.length > 100);
  let mismatches = [];
  allKeywordNames.forEach((name) => {
    if (name === 'DSPATR') return; // parameter-restricted, checked above
    const expected = ALLOWED.indexOf(name) !== -1;
    if (KeywordSpec.isWhitelisted('PSHBTNFLD', name) !== expected) mismatches.push(name);
  });
  check('isWhitelisted agrees with the expected set for every known keyword (' + allKeywordNames.length + ' checked)', mismatches.length === 0);
}

// ===========================================================================
// Part 2 - KeywordSpec.requiredPartner (symmetric requirement)
// ===========================================================================
console.log('\nKeywordSpec.requiredPartner');
{
  check('requiredPartner(\'PSHBTNFLD\') is PSHBTNCHC', KeywordSpec.requiredPartner('PSHBTNFLD') === 'PSHBTNCHC');
  check('requiredPartner(\'PSHBTNCHC\') is PSHBTNFLD (symmetric)', KeywordSpec.requiredPartner('PSHBTNCHC') === 'PSHBTNFLD');
  check('requiredPartner of an unrelated keyword is null', KeywordSpec.requiredPartner('ALIAS') === null);
}

// ===========================================================================
// Part 3 - KeywordSpec.definitionRequirements
// ===========================================================================
console.log('\nKeywordSpec.definitionRequirements');
{
  const req = KeywordSpec.definitionRequirements('PSHBTNFLD');
  check('dataType is Y', req.dataType === 'Y');
  check('length is 2', req.length === 2);
  check('decimalPositions is 0', req.decimalPositions === 0);
  check('usage allows I and B', req.usage.indexOf('I') !== -1 && req.usage.indexOf('B') !== -1 && req.usage.length === 2);
  check('usageDefault is B', req.usageDefault === 'B');
  check('a record type with no spec entry returns null', KeywordSpec.definitionRequirements('NOSUCHTYPE') === null);
}

// ===========================================================================
// Part 4 - DspfWriter.pshbtnfldConflictReason (I-57)
// ===========================================================================
console.log('\nDspfWriter.pshbtnfldConflictReason');
{
  check('PSHBTNFLD is blocked when the field carries a non-whitelisted keyword',
    !!DspfWriter.pshbtnfldConflictReason('PSHBTNFLD', '', [k('COLOR')]));
  check('PSHBTNFLD is allowed when the field carries only whitelisted keywords',
    !DspfWriter.pshbtnfldConflictReason('PSHBTNFLD', '', [k('ALIAS'), k('TEXT')]));
  check('PSHBTNFLD is allowed alongside DSPATR(PC)',
    !DspfWriter.pshbtnfldConflictReason('PSHBTNFLD', '', [k('DSPATR', 'PC')]));
  check('PSHBTNFLD is blocked alongside DSPATR(HI)',
    !!DspfWriter.pshbtnfldConflictReason('PSHBTNFLD', '', [k('DSPATR', 'HI')]));
  check('a non-whitelisted keyword is blocked when the field already has PSHBTNFLD',
    !!DspfWriter.pshbtnfldConflictReason('COLOR', '', [k('PSHBTNFLD')]));
  check('a whitelisted keyword is allowed when the field already has PSHBTNFLD',
    !DspfWriter.pshbtnfldConflictReason('TEXT', '', [k('PSHBTNFLD')]));
  check('PSHBTNCHC is blocked on a field with no PSHBTNFLD',
    !!DspfWriter.pshbtnfldConflictReason('PSHBTNCHC', '', [k('ALIAS')]));
  check('PSHBTNCHC is allowed on a field that already has PSHBTNFLD',
    !DspfWriter.pshbtnfldConflictReason('PSHBTNCHC', '', [k('PSHBTNFLD')]));
  check('the PSHBTNCHC message names its required partner PSHBTNFLD',
    DspfWriter.pshbtnfldConflictReason('PSHBTNCHC', '', []).indexOf('PSHBTNFLD') !== -1);
}

// ===========================================================================
// Part 5 - DspfWriter.pshbtnfldNewConflictReason (I-64)
// ===========================================================================
console.log('\nDspfWriter.pshbtnfldNewConflictReason');
{
  const before = [k('PSHBTNFLD'), k('ALIAS')];
  const introducesConflict = [k('PSHBTNFLD'), k('ALIAS'), k('COLOR')];
  check('introducing a non-whitelisted keyword onto a field that already had PSHBTNFLD is blocked',
    !!DspfWriter.pshbtnfldNewConflictReason(before, introducesConflict));
  check('a field with no PSHBTNFLD before or after is untouched',
    !DspfWriter.pshbtnfldNewConflictReason([k('COLOR')], [k('COLOR'), k('ALIAS')]));
  check('a pre-existing conflict is not re-reported when the edit is unrelated',
    !DspfWriter.pshbtnfldNewConflictReason([k('PSHBTNFLD'), k('COLOR')], [k('PSHBTNFLD'), k('COLOR'), k('TEXT')]));
}

// ===========================================================================
// Part 6 - DspfWriter.pshbtnfldRemovalConflictReason (I-85)
// ===========================================================================
console.log('\nDspfWriter.pshbtnfldRemovalConflictReason');
{
  check('removing PSHBTNFLD while PSHBTNCHC stays behind is blocked',
    !!DspfWriter.pshbtnfldRemovalConflictReason([k('PSHBTNFLD'), k('PSHBTNCHC')], [k('PSHBTNCHC')]));
  check('the message names the required partner PSHBTNFLD',
    DspfWriter.pshbtnfldRemovalConflictReason([k('PSHBTNFLD'), k('PSHBTNCHC')], [k('PSHBTNCHC')]).indexOf('PSHBTNFLD') !== -1);
  check('removing the last PSHBTNCHC while PSHBTNFLD stays is blocked',
    !!DspfWriter.pshbtnfldRemovalConflictReason([k('PSHBTNFLD'), k('PSHBTNCHC')], [k('PSHBTNFLD')]));
  check('the message names the required partner PSHBTNCHC',
    DspfWriter.pshbtnfldRemovalConflictReason([k('PSHBTNFLD'), k('PSHBTNCHC')], [k('PSHBTNFLD')]).indexOf('PSHBTNCHC') !== -1);
  check('removing both PSHBTNFLD and PSHBTNCHC together is allowed',
    !DspfWriter.pshbtnfldRemovalConflictReason([k('PSHBTNFLD'), k('PSHBTNCHC')], []));
  check('removing one of several PSHBTNCHC keeping at least one is allowed',
    !DspfWriter.pshbtnfldRemovalConflictReason([k('PSHBTNFLD'), k('PSHBTNCHC'), k('PSHBTNCHC')], [k('PSHBTNFLD'), k('PSHBTNCHC')]));
}

// ===========================================================================
// Part 7 - DspfWriter.pshbtnfldDefinitionUpdates / pshbtnfldBasicEditConflictReason (I-62)
// ===========================================================================
console.log('\nDspfWriter.pshbtnfldDefinitionUpdates / pshbtnfldBasicEditConflictReason');
{
  check('a conforming field needs no updates',
    DspfWriter.pshbtnfldDefinitionUpdates({ dataType: 'Y', length: 2, decimalPositions: 0, usage: 'I' }) === null);
  check('a non-conforming field is corrected to dataType Y, length 2, decimalPositions 0, usage B',
    (() => {
      const u = DspfWriter.pshbtnfldDefinitionUpdates({ dataType: 'A', length: 10, decimalPositions: 2, usage: 'O' });
      return u.dataType === 'Y' && u.length === 2 && u.decimalPositions === 0 && u.usage === 'B';
    })());
  check('usage B is left unchanged (only non-conforming usage is corrected)',
    DspfWriter.pshbtnfldDefinitionUpdates({ dataType: 'Y', length: 2, decimalPositions: 0, usage: 'B' }) === null);

  const kws = [k('PSHBTNFLD')];
  check('changing data type away from Y on a PSHBTNFLD field is blocked',
    !!DspfWriter.pshbtnfldBasicEditConflictReason(kws, { dataType: 'Y', length: 2, decimalPositions: 0, usage: 'I' }, { dataType: 'A' }));
  check('changing length away from 2 on a PSHBTNFLD field is blocked',
    !!DspfWriter.pshbtnfldBasicEditConflictReason(kws, { dataType: 'Y', length: 2, decimalPositions: 0, usage: 'I' }, { length: 5 }));
  check('an unrelated edit on a conforming PSHBTNFLD field is allowed',
    !DspfWriter.pshbtnfldBasicEditConflictReason(kws, { dataType: 'Y', length: 2, decimalPositions: 0, usage: 'I' }, {}));
  check('a field without PSHBTNFLD is never affected',
    !DspfWriter.pshbtnfldBasicEditConflictReason([k('COLOR')], { dataType: 'A', length: 10, decimalPositions: 2, usage: 'O' }, { dataType: 'B' }));
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

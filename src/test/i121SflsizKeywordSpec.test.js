/**
 * i121SflsizKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLSIZ slice.
 * SFLSIZ's own DDS Reference section says "You cannot use display size
 * condition names for this keyword when a program-to-system field is used
 * as a parameter for it." I-22's sflsizConditionedFieldNameConflictReason
 * enforced it as "a size-conditioned value must be a plain number" with the
 * rule implied by the function's own existence. Now a
 * `sizeConditionedValueMustBeNumber` fact on the new RECORD_TYPES.SFLSIZ
 * entry (a new shape), which the function reads.
 *
 * Verifies:
 *  1. The new entry, its citation, and that it carries only that fact.
 *  2. KeywordSpec.sizeConditionedValueMustBeNumber for SFLSIZ and only SFLSIZ
 *     (SFLPAG/SFLLIN have no program-to-system form; unknown/undefined false).
 *  3. sflsizConditionedFieldNameConflictReason unchanged: numbers, blanks and
 *     whitespace allowed; field names / mixed / signed / decimal blocked with
 *     the exact message.
 *  4. Adding SFLSIZ to the spec did not disturb SFLSIZ's other behavior
 *     (SFLSIZ = SFLPAG detection, SFLSCROLL's notAllowedWhenEqual fact).
 *
 * Run with: node src/test/i121SflsizKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

console.log('\nRECORD_TYPES.SFLSIZ');
{
  const e = KeywordSpec.RECORD_TYPES.SFLSIZ;
  check('SFLSIZ entry exists', !!e);
  check('carries sizeConditionedValueMustBeNumber', !!(e && e.sizeConditionedValueMustBeNumber));
  check('citation states the DDS Reference sentence',
    !!e && /cannot use display size condition names for this keyword when a program-to-system field is used as a parameter/.test(e.sizeConditionedValueMustBeNumber.ddsReference));
  check('carries no other rule shape', !!e && !e.mutex && !e.onePerRecord && !e.definitionRequirements &&
    !e.notAllowedWhenEqual && !e.qualifyingNames && !e.crossRecordExclusion && !e.validOnlyInSubfileControlRecord);
  const holders = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].sizeConditionedValueMustBeNumber);
  check('only SFLSIZ carries the fact', holders.join(',') === 'SFLSIZ');
}

console.log('\nKeywordSpec.sizeConditionedValueMustBeNumber');
{
  check('SFLSIZ', KeywordSpec.sizeConditionedValueMustBeNumber('SFLSIZ') === true);
  check('SFLPAG has no program-to-system form', KeywordSpec.sizeConditionedValueMustBeNumber('SFLPAG') === false);
  check('SFLLIN has no program-to-system form', KeywordSpec.sizeConditionedValueMustBeNumber('SFLLIN') === false);
  check('unknown keyword', KeywordSpec.sizeConditionedValueMustBeNumber('NOSUCH') === false);
  check('undefined', KeywordSpec.sizeConditionedValueMustBeNumber(undefined) === false);
}

console.log('\nsflsizConditionedFieldNameConflictReason');
{
  const f = DspfWriter.sflsizConditionedFieldNameConflictReason;
  const msg = 'SFLSIZ cannot use a display-size condition name on a value that is a program-to-system field (per the DDS Reference) - a size-conditioned SFLSIZ value must be a plain number.';
  ['34', '0', '9999', '007', ' 34 '].forEach((v) => check('plain number ' + JSON.stringify(v) + ' allowed', f(v) === null));
  ['', '   ', null, undefined].forEach((v) => check('blank/absent ' + JSON.stringify(v) + ' allowed', f(v) === null));
  check('program-to-system field name blocked, exact message', f('&SIZE') === msg);
  check('bare field name blocked', f('SIZEFLD') === msg);
  check('alphanumeric-first blocked', f('X5') === msg);
  check('digits-first-with-letters blocked', f('5X') === msg);
  check('signed number blocked (not a plain count)', f('-5') === msg);
  check('decimal blocked', f('3.5') === msg);
  check('numeric input given as a number type is allowed', f(34) === null);
}

console.log('\nOther SFLSIZ behavior untouched');
{
  const eq = DspfWriter.sflsizPagEqualReason;
  check('SFLSIZ = SFLPAG still detected for SFLSCROLL', typeof eq === 'function' &&
    /SFLSIZ/.test(eq([k('SFLSIZ', '17'), k('SFLPAG', '17')]) || ''));
  check('SFLSIZ != SFLPAG still fine', eq([k('SFLSIZ', '34'), k('SFLPAG', '17')]) === '' || eq([k('SFLSIZ', '34'), k('SFLPAG', '17')]) === null);
  check('SFLSCROLL keeps its notAllowedWhenEqual fact',
    !!KeywordSpec.RECORD_TYPES.SFLSCROLL.notAllowedWhenEqual);
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

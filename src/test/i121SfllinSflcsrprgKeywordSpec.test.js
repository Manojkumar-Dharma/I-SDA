/**
 * i121SfllinSflcsrprgKeywordSpec.test.js
 *
 * Task I-121 - "One declarative rule spec per keyword", SFLLIN/SFLCSRPRG
 * slice. SFLCSRPRG's DDS Reference section ends "The SFLLIN keyword is not
 * allowed in a record that contains the SFLCSRPRG." I-80 enforces it across
 * the SFLCTL(subfile-record) association, in sfllinAssociatedViolation /
 * sfllinRecordEditConflictReason / sflcsrprgFieldEditConflictReason, each of
 * which hard-coded the keyword names. Now reads keywordSpec.js's
 * `crossRecordExclusion` fact - a new shape (a record-level keyword on one
 * record vs a field-level keyword on a field of a DIFFERENT, associated
 * record), shared by RECORD_TYPES.SFLLIN and RECORD_TYPES.SFLCSRPRG.
 *
 * Verifies:
 *  1. KeywordSpec.crossRecordExclusion for SFLLIN / SFLCSRPRG (same shared
 *     object, correct fields, citation) and null for unrelated keywords.
 *  2. No other RECORD_TYPES entry carries the fact.
 *  3. Both writer functions still behave exactly as before, both
 *     directions, with their exact wording.
 *
 * Run with: node src/test/i121SfllinSflcsrprgKeywordSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const fld = (name, kws) => ({ name, keywords: kws || [] });
const recd = (name, keywords, fields) => ({ name, keywords: keywords || [], fields: fields || [] });

console.log('\nKeywordSpec.crossRecordExclusion');
{
  const a = KeywordSpec.crossRecordExclusion('SFLLIN');
  const b = KeywordSpec.crossRecordExclusion('SFLCSRPRG');
  check('SFLLIN has the fact', !!a);
  check('SFLCSRPRG has the fact', !!b);
  check('both keywords share one object (cannot drift apart)', a === b);
  check('controlRecordKeyword is SFLLIN', a && a.controlRecordKeyword === 'SFLLIN');
  check('subfileFieldKeyword is SFLCSRPRG', a && a.subfileFieldKeyword === 'SFLCSRPRG');
  check('associatedVia is SFLCTL', a && a.associatedVia === 'SFLCTL');
  check('citation states the DDS Reference sentence',
    a && /SFLLIN keyword is not allowed in a record that contains the SFLCSRPRG/.test(a.ddsReference));
  check('unrelated keyword returns null', KeywordSpec.crossRecordExclusion('USRDFN') === null);
  check('unknown keyword returns null', KeywordSpec.crossRecordExclusion('NOSUCH') === null);
  check('undefined returns null', KeywordSpec.crossRecordExclusion(undefined) === null);
  const holders = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].crossRecordExclusion);
  check('only SFLLIN and SFLCSRPRG carry the fact', holders.sort().join(',') === 'SFLCSRPRG,SFLLIN');
}

console.log('\nsflcsrprgFieldEditConflictReason (field side)');
{
  const f = DspfWriter.sflcsrprgFieldEditConflictReason;
  const withLin = [recd('DTL', [k('SFL')], [fld('S1')]), recd('CTL', [k('SFLCTL', 'DTL'), k('SFLLIN', '5')])];
  const noLin = [recd('DTL', [k('SFL')], [fld('S1')]), recd('CTL', [k('SFLCTL', 'DTL'), k('SFLPAG', '5')])];
  const csr = [k('SFLCSRPRG')];
  check('exact message wording preserved',
    f('DTL', [], csr, withLin) ===
    'SFLCSRPRG cannot be specified on a field of subfile record DTL because its control record CTL carries SFLLIN - the DDS Reference does not allow SFLLIN together with SFLCSRPRG. Remove SFLLIN first.');
  check('without SFLLIN it is allowed', f('DTL', [], csr, noLin) === null);
  check('a control record for a different subfile record is irrelevant', f('OTHER', [], csr, withLin) === null);
  check('already-invalid field is not re-reported', f('DTL', csr, csr.concat([k('DSPATR', 'HI')]), withLin) === null);
  check('removing SFLCSRPRG is never blocked', f('DTL', csr, [], withLin) === null);
  check('null inputs are safe', f('DTL', null, null, null) === null);
}

console.log('\nsfllinRecordEditConflictReason (record side)');
{
  const f = DspfWriter.sfllinRecordEditConflictReason;
  const dtlCsr = recd('DTL', [k('SFL')], [fld('S1'), fld('S2', [k('SFLCSRPRG')])]);
  const dtlPlain = recd('DTL', [k('SFL')], [fld('S1')]);
  const ctlBefore = recd('CTL', [k('SFLCTL', 'DTL'), k('SFLPAG', '5')]);
  const after = [k('SFLCTL', 'DTL'), k('SFLPAG', '5'), k('SFLLIN', '5')];
  check('exact message wording preserved',
    f(ctlBefore, after, [dtlCsr, ctlBefore]) ===
    'SFLLIN cannot be used with subfile record DTL, which has field S2 with SFLCSRPRG - the DDS Reference does not allow SFLLIN together with SFLCSRPRG. Remove SFLCSRPRG first.');
  check('adding SFLLIN when no field has SFLCSRPRG is allowed', f(ctlBefore, after, [dtlPlain, ctlBefore]) === null);
  check('an edit that never has SFLLIN is never reported',
    f(ctlBefore, [k('SFLCTL', 'DTL'), k('SFLPAG', '9')], [dtlCsr, ctlBefore]) === null);
  check('SFLLIN on a record with no SFLCTL is not reported', f(recd('X', []), [k('SFLLIN', '5')], [dtlCsr]) === null);
  check('SFLCTL naming a missing record is not reported', f(recd('X', []), [k('SFLCTL', 'GONE'), k('SFLLIN', '5')], [dtlCsr]) === null);
  const already = recd('CTLBAD', [k('SFLCTL', 'DTL'), k('SFLLIN', '5')]);
  check('already-invalid record is not re-reported',
    f(already, already.keywords.concat([k('SFLPAG', '5')]), [dtlCsr, already]) === null);
  check('unnamed field wording falls back to "a field with"',
    /which has a field with SFLCSRPRG/.test(f(ctlBefore, after, [recd('DTL', [k('SFL')], [fld('', [k('SFLCSRPRG')])]), ctlBefore]) || ''));
}

console.log('');
process.exit(failureCount() > 0 ? 1 : 0);

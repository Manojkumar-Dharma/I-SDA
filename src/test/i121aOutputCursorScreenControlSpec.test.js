/**
 * i121aOutputCursorScreenControlSpec.test.js
 *
 * Task I-121a - the thirteen output / cursor / screen-control record-level
 * keywords (ALARM, BLINK, CSRLOC, RTNCSRLOC, ERASE, ERASEINP, OVERLAY,
 * PUTOVR, FRCDTA, PROTECT, MDTOFF, LOCK, UNLOCK) now each have a
 * KeywordSpec.RECORD_TYPES entry, verified against their OWN section of
 * DDS_Keyword_V7r6.txt. This test:
 *   1. checks every cited sentence and heading against the reference text
 *   2. pins the facts (parameters, option indicators, requires, once-per-
 *      record, mutex, record types it is not valid on)
 *   3. sweeps every KEYWORD-LOOKUP.json keyword: ownership matches the
 *      slice, and the whitelist / mutex lists the guards read agree with
 *      the facts in both directions
 *   4. proves the writer's UNLOCK and RTNCSRLOC readers follow the spec.
 *
 * Run with: node src/test/i121aOutputCursorScreenControlSpec.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const K = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const SLICE = ['ALARM', 'BLINK', 'CSRLOC', 'RTNCSRLOC', 'ERASE', 'ERASEINP', 'OVERLAY',
  'PUTOVR', 'FRCDTA', 'PROTECT', 'MDTOFF', 'LOCK', 'UNLOCK'];
const j = (v) => JSON.stringify(v);
const norm = (t) => String(t).replace(/\f/g, ' ').replace(/\s+/g, ' ');
const ref = norm(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8'));
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8'));
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

console.log('=== 1. the entries against the DDS Reference ===');
check('the spec lists exactly the slice, in order', j(K.outputControlKeywords()) === j(SLICE));
check('outputControlKeywords returns a copy', (K.outputControlKeywords().push('X'), K.outputControlKeywords().length === 13));
SLICE.forEach((name) => {
  const e = K.RECORD_TYPES[name];
  check(name + ': has an entry with a section heading found in the reference', !!e && ref.indexOf(norm(e.ddsSection)) >= 0);
  const fragments = String(e.ddsReference).split(' ... ');
  check(name + ': every cited sentence is in the reference (' + fragments.length + ')',
    fragments.every((f) => ref.indexOf(norm(f)) >= 0));
  if (e.valuesDdsReference) check(name + ': the values citation is in the reference', ref.indexOf(norm(e.valuesDdsReference)) >= 0);
  check(name + ': record level only', j(K.recordKeywordFacts(name).levels) === j(['record']));
  check(name + ': the file/field level index agrees (record level)',
    (lookup.keywords ? lookup.keywords : lookup)[name].every((x) => x.level === 'record'));
});

console.log('\n=== 2. the facts ===');
const F = (n) => K.recordKeywordFacts(n);
const noParams = ['ALARM', 'BLINK', 'OVERLAY', 'PUTOVR', 'FRCDTA', 'PROTECT', 'LOCK'];
check('no-parameter keywords', j(SLICE.filter((n) => F(n).noParameters)) === j(noParams.slice().sort((a, b) => SLICE.indexOf(a) - SLICE.indexOf(b))));
check('no-parameter keywords carry no parameterCount / validValues', noParams.every((n) => !F(n).parameterCount && !F(n).validValues));
check('CSRLOC takes exactly two field names', j(F('CSRLOC').parameterCount) === j({ min: 2, max: 2 }));
check('ERASE takes 1 to 20 record names and may repeat', j(F('ERASE').parameterCount) === j({ min: 1, max: 20 }) && F('ERASE').repeatable === true);
check('only ERASE repeats', j(SLICE.filter((n) => F(n).repeatable)) === j(['ERASE']));
check('ERASEINP values', j(F('ERASEINP').validValues) === j(['*MDTON', '*ALL']));
check('MDTOFF values', j(F('MDTOFF').validValues) === j(['*UNPR', '*ALL']));
check('UNLOCK values', j(F('UNLOCK').validValues) === j(['*ERASE', '*MDTOFF']));
check('RTNCSRLOC literals and the window/mouse subset', j(F('RTNCSRLOC').validValues) === j(['*RECNAME', '*WINDOW', '*MOUSE']) && j(F('RTNCSRLOC').windowMouseValues) === j(['*WINDOW', '*MOUSE']));
check('OVERLAY is required by ERASE, ERASEINP, MDTOFF, PROTECT and nothing else', j(SLICE.filter((n) => F(n).requiresRecordKeyword)) === j(['ERASE', 'ERASEINP', 'PROTECT', 'MDTOFF']) && SLICE.filter((n) => F(n).requiresRecordKeyword).every((n) => F(n).requiresRecordKeyword === 'OVERLAY'));
check('once per record format: CSRLOC and FRCDTA', j(SLICE.filter((n) => F(n).oncePerRecordFormat)) === j(['CSRLOC', 'FRCDTA']));
check('not valid on SFL / USRDFN records: CSRLOC (both), MDTOFF (SFL)', j(F('CSRLOC').notAllowedInRecordTypes) === j(['SFL', 'USRDFN']) && j(F('MDTOFF').notAllowedInRecordTypes) === j(['SFL']) && SLICE.filter((n) => F(n).notAllowedInRecordTypes).length === 2);
check('mutex: only PUTOVR - PUTRETAIN', j(F('PUTOVR').mutex) === j(['PUTRETAIN']) && SLICE.filter((n) => F(n).mutex).length === 1);
// UNLOCK's relations with GETRETAIN / RTNDTA live on I-121b's entries (one source of truth).
check('UNLOCK relations are I-121b\'s: GETRETAIN needs a bare UNLOCK, RTNDTA excludes it, and UNLOCK holds no copy',
  K.RECORD_TYPES.GETRETAIN.requiresBareKeyword === 'UNLOCK' && j(K.RECORD_TYPES.RTNDTA.excludesOnRecord) === j(['UNLOCK']) && !K.RECORD_TYPES.UNLOCK.mutex);
check('only CSRLOC says display size names are not valid', j(SLICE.filter((n) => F(n).displaySizeNamesValid === false)) === j(['CSRLOC']));
check('the existing KeywordSpec.isMutex reads the new mutex lists', K.isMutex('PUTOVR', 'PUTRETAIN') && !K.isMutex('UNLOCK', 'RTNDTA') && !K.isMutex('UNLOCK', 'LOCK'));
check('recordKeywordFacts: a copy, and null outside the slice', (F('MDTOFF').validValues.push('x'), j(F('MDTOFF').validValues) === j(['*UNPR', '*ALL'])) && K.recordKeywordFacts('DUP') === null && K.recordKeywordFacts('constructor') === null);

console.log('\n=== 3. sweep over KEYWORD-LOOKUP.json ===');
const names = Object.keys(lookup.keywords ? lookup.keywords : lookup).filter((n) => n.indexOf('*') < 0);
check('lookup holds all thirteen', SLICE.every((n) => names.indexOf(n) >= 0));
const owned = names.filter((n) => K.recordKeywordFacts(n) !== null);
check('exactly the slice has I-121a facts', j(owned.slice().sort()) === j(SLICE.slice().sort()));
// Option indicators: the "valid" facts here and the "not valid" table are
// a clean partition of the thirteen.
const notValid = SLICE.filter((n) => K.noOptionIndicatorsFact(n));
check('option indicators: RTNCSRLOC and UNLOCK are in NO_OPTION_INDICATORS, nothing else here', j(notValid) === j(['RTNCSRLOC', 'UNLOCK']));
check('option indicators: the other eleven say valid', SLICE.filter((n) => F(n).optionIndicatorsValid).length === 11 && notValid.every((n) => !F(n).optionIndicatorsValid));
// Whitelists: a fact "not valid on type T" must be refused by T's guard, and
// no keyword T's whitelist allows may carry that fact (both directions).
['USRDFN', 'SFL'].forEach((type) => {
  SLICE.forEach((n) => {
    const stated = (F(n).notAllowedInRecordTypes || []).indexOf(type) >= 0;
    const whitelisted = K.isWhitelisted(type, n);
    check(type + ' / ' + n + ': a stated exclusion is never whitelisted', !(stated && whitelisted));
  });
});
const usrdfnRec = [kw('USRDFN')];
const sflRec = [kw('SFL')];
SLICE.forEach((n) => {
  check(n + ': USRDFN guard agrees with the USRDFN whitelist', (DspfWriter.usrdfnConflictReason(n, usrdfnRec) === null) === K.isWhitelisted('USRDFN', n));
  check(n + ': SFL guard agrees with the SFL whitelist', (DspfWriter.sflWhitelistConflictReason(n, sflRec) === null) === K.isWhitelisted('SFL', n));
  check(n + ': MNUBAR guard agrees with the MNUBAR whitelist', (DspfWriter.mnubarWhitelistConflictReason(n, [kw('MNUBAR')]) === null) === K.isWhitelisted('MNUBAR', n));
});
// PULLDOWN's mutex: each requirement keyword it forbids drags its dependants
// with it (ERASE / ERASEINP / MDTOFF need OVERLAY, which PULLDOWN forbids).
check('PULLDOWN forbids OVERLAY, so also forbids the keywords that need it (ERASE, ERASEINP, MDTOFF)',
  K.isMutex('PULLDOWN', 'OVERLAY') && ['ERASE', 'ERASEINP', 'MDTOFF'].every((n) => K.isMutex('PULLDOWN', n)));
check('PULLDOWN mutex among the thirteen is unchanged', j(SLICE.filter((n) => K.isMutex('PULLDOWN', n))) === j(['ALARM', 'ERASE', 'ERASEINP', 'OVERLAY', 'PUTOVR', 'FRCDTA', 'MDTOFF']));
check('PULLDOWN guard refuses each of them', SLICE.filter((n) => K.isMutex('PULLDOWN', n)).every((n) => DspfWriter.pulldownConflictReason(n, [kw('PULLDOWN')]) !== null));

console.log('\n=== 4. the writer follows the spec ===');
const combos = [[false, false], [true, false], [false, true], [true, true]];
combos.forEach(([erase, mdtoff]) => {
  const set = DspfWriter.setUnlockKeyword([], true, erase, mdtoff);
  const got = DspfWriter.getUnlockKeyword(set);
  check('UNLOCK round trip erase=' + erase + ' mdtoff=' + mdtoff, got.present && got.erase === erase && got.mdtoff === mdtoff);
  const written = set[0].parameters.split(' ').filter(Boolean);
  check('UNLOCK writes only spec values, in spec order (' + written.join(' ') + ')',
    written.every((v) => K.isValidValue('UNLOCK', v)) && j(written) === j(K.validValues('UNLOCK').filter((v) => written.indexOf(v) >= 0)));
});
K.validValues('UNLOCK').forEach((v) => {
  check('UNLOCK reader recognises spec value ' + v, (function () {
    const g = DspfWriter.getUnlockKeyword([kw('UNLOCK', v)]);
    return v === '*ERASE' ? g.erase && !g.mdtoff : g.mdtoff && !g.erase;
  })());
});
check('UNLOCK reader ignores a lookalike', !DspfWriter.getUnlockKeyword([kw('UNLOCK', '*ERASEX')]).erase);
check('UNLOCK absent / removed', !DspfWriter.getUnlockKeyword([]).present && DspfWriter.setUnlockKeyword([kw('UNLOCK', '*ERASE')], false, false, false).length === 0);
// RTNCSRLOC: the first token decides the format; the spec says which are
// the row/column ones.
F('RTNCSRLOC').windowMouseValues.forEach((lit) => {
  const kws = [kw('RTNCSRLOC', lit + ' &ROW &COL')];
  check('RTNCSRLOC ' + lit + ' is read as the row/column format', DspfWriter.getRtncsrlocWindowMouseFields(kws).present && !DspfWriter.getRtncsrlocRecNameFields(kws).present);
});
['*RECNAME REC FLD', 'REC FLD'].forEach((p) => {
  const kws = [kw('RTNCSRLOC', p)];
  check('RTNCSRLOC "' + p + '" is read as the record/field format', DspfWriter.getRtncsrlocRecNameFields(kws).present && !DspfWriter.getRtncsrlocWindowMouseFields(kws).present);
});
check('RTNCSRLOC: both formats can coexist', (function () {
  const kws = [kw('RTNCSRLOC', '*RECNAME REC FLD'), kw('RTNCSRLOC', '*WINDOW R C')];
  return DspfWriter.getRtncsrlocRecNameFields(kws).cursorRecord === 'REC' && DspfWriter.getRtncsrlocWindowMouseFields(kws).present;
})());

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

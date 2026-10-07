/**
 * i122dSubfileControlFamilyKeywords.test.js
 *
 * Task I-122d - the subfile-control family from the I-122 coverage inventory:
 * SFLCLR, SFLCSRPRG, SFLRCDNBR, SFLMODE, SFLRTNSEL, SFLRNA, SFLROLVAL and
 * SFLNXTCHG.  Each cell is traced to the keyword's own DDS Reference section
 * (DDS_Keyword_V7r6.txt):
 *
 *   SFLCLR     record (SFLCTL), no parameters, option indicator REQUIRED, display
 *              size names not valid.
 *   SFLCSRPRG  field, no parameters, option indicators not valid, not with SFLLIN.
 *   SFLRCDNBR  field on the subfile-control record, [CURSOR] [*TOP], option
 *              indicators not valid, not with SFLROLVAL on one field.
 *   SFLROLVAL  field on the subfile-control record.
 *   SFLMODE    record (SFLCTL), SFLMODE(&mode), field A/1/H must exist, no indicators.
 *   SFLRTNSEL  record (SFLCTL), no parameters, needs SFLSNGCHC or SFLMLTCHC.
 *   SFLRNA     record (SFLCTL), no parameters, needs SFLINZ, not on a message
 *              subfile, not with field selection, no indicators.
 *   SFLNXTCHG  record (SFL), no parameters, option indicators valid, not with SFLMSGRCD.
 *
 *  L1/L2 writer: guards, parse, flag / parameter round trip, neighbours kept.
 *  L3    display: which panel shows which row, saved state, Conditioning toggle.
 *  L4    commit paths: checkbox, select, Conditioning, raw editor.
 *
 * Gaps found while writing it are NOT asserted as correct; they are logged in
 * docs/sda-reference/keywordFixes.md (I-177, since done, and I-178).
 *
 * Run with: node src/test/i122dSubfileControlFamilyKeywords.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// Fixed-column DDS line builder (see i122NoTestKeywordsBatch1.test.js).
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) { put(8, o.neg ? 'N' : ' '); put(9, o.ind); }
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const build = (lines) => lines.join('\n') + '\n';
const parse = (lines) => DspfParser.parseDspf(build(lines));
const kwOf = (kws, name) => (kws || []).find((k) => k.name === name);
const names = (kws) => kws.map((k) => k.name);
const K = (name, parameters, conditions) => ({ name, parameters: parameters || '', conditions: conditions || [] });
const IND = (n) => [{ indicators: [{ number: n, negated: false }] }];
const text = (n, line) => dds({ name: n, len: 10, type: 'A', usage: 'B', line, pos: 5 });

// A subfile pair with a control record that carries the keywords under test.
const SUB = [
  dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
  dds({ rec: 1, name: 'SFL1', fn: 'SFL' }),
  dds({ name: 'S1', len: 10, type: 'A', usage: 'B', line: 5, pos: 5, fn: 'SFLCSRPRG' }),
  dds({ name: 'S2', len: 10, type: 'A', usage: 'B', line: 5, pos: 25 }),
  dds({ rec: 1, name: 'SFL2', fn: 'SFL' }),
  dds({ ind: '10', fn: 'SFLNXTCHG' }),
  text('T1', 6),
  dds({ rec: 1, name: 'CTL1', fn: 'SFLCTL(SFL1)' }),
  dds({ fn: 'SFLPAG(5) SFLSIZ(10)' }),
  dds({ fn: 'SFLDSP SFLDSPCTL' }),
  dds({ fn: 'SFLINZ' }),
  dds({ fn: 'SFLRNA' }),
  dds({ ind: '31', fn: 'SFLCLR' }),
  dds({ fn: 'SFLMODE(&MODE)' }),
  dds({ name: 'MODE', len: 1, type: 'A', usage: 'H' }),
  dds({ name: 'RCD', len: 4, type: 'S', dec: 0, usage: 'H', fn: 'SFLRCDNBR(CURSOR *TOP)' }),
  dds({ name: 'ROLL', len: 4, type: 'S', dec: 0, usage: 'B', line: 2, pos: 2, fn: 'SFLROLVAL' }),
  // I-184: SFLSNGCHC / SFLMLTCHC need a subfile with one output field and no input-capable field, so the
  // selection-list-type checks (SFLRTNSEL) run on this pair rather than on SFL1 / CTL1 (two input/output fields).
  dds({ rec: 1, name: 'SFL3', fn: 'SFL' }),
  dds({ name: 'C1', len: 10, type: 'A', usage: 'O', line: 5, pos: 5 }),
  dds({ rec: 1, name: 'CTL3', fn: 'SFLCTL(SFL3)' }),
];
const SOURCE = build(SUB);
const model = DspfParser.parseDspf(SOURCE);
const rec = (n) => model.records.find((r) => r.name === n);
const fld = (r, n) => rec(r).fields.find((f) => f.name === n);
// Variants of the base record pair for the writer-level cases.
const BASE = SUB.slice(0, 7).concat([SUB[7], SUB[8], SUB[9]]);

console.log('=== spec: what the DDS Reference says about each keyword ===');
{
  const T = KeywordSpec.RECORD_TYPES;
  check('SFLCLR: record level on SFLCTL, no parameters, option indicator required, display size names not valid',
    T.SFLCLR.levels.join() === 'record' && T.SFLCLR.onRecordType === 'SFLCTL' && T.SFLCLR.parameters === 'none' &&
    T.SFLCLR.optionIndicators === 'required' && T.SFLCLR.displaySizeNames === 'notValid');
  check('SFLCLR is on the list of keywords that require an option indicator (with SFLEND and SFLDLT)',
    KeywordSpec.optionIndicatorRequiredKeywords().slice().sort().join() === 'SFLCLR,SFLDLT,SFLEND');
  check('SFLRNA: record level on SFLCTL, no parameters, option indicators not valid, needs SFLINZ',
    T.SFLRNA.levels.join() === 'record' && T.SFLRNA.onRecordType === 'SFLCTL' && T.SFLRNA.parameters === 'none' &&
    T.SFLRNA.optionIndicators === 'notValid' && T.SFLRNA.requiresOnRecord.join() === 'SFLINZ');
  check('SFLRNA: not on a message subfile, not with field selection',
    T.SFLRNA.notOnMessageSubfile === true && T.SFLRNA.excludedWithFieldSelection === true);
  check('field selection excludes exactly SFLDROP, SFLFOLD, SFLINZ, SFLLIN, SFLRCDNBR, SFLRNA and SFLROLVAL',
    KeywordSpec.excludedWithFieldSelection().slice().sort().join() === 'SFLDROP,SFLFOLD,SFLINZ,SFLLIN,SFLRCDNBR,SFLRNA,SFLROLVAL');
  check('SFLMODE: record level on SFLCTL, parameter required as SFLMODE(&mode), option indicators not valid',
    T.SFLMODE.levels.join() === 'record' && T.SFLMODE.onRecordType === 'SFLCTL' && T.SFLMODE.parameters === 'required' &&
    T.SFLMODE.parameterGrammar === 'SFLMODE(&mode)' && T.SFLMODE.optionIndicators === 'notValid');
  const mf = KeywordSpec.sflmodeField();
  check('SFLMODE field: must exist in the record, A, length 1, usage H; 0 = folded, 1 = truncated',
    mf.mustExistInRecord === true && mf.dataType === 'A' && mf.length === 1 && mf.usage === 'H' && mf.foldedValue === '0' && mf.truncatedValue === '1');
  check('SFLRNA requires SFLINZ (accessor)', KeywordSpec.sflrnaRequires().join() === 'SFLINZ');
  check('SFLCSRPRG is exclusive with SFLLIN on the control record (spec fact)',
    T.SFLCSRPRG.crossRecordExclusion.controlRecordKeyword === 'SFLLIN' && T.SFLCSRPRG.crossRecordExclusion.subfileFieldKeyword === 'SFLCSRPRG' && T.SFLCSRPRG.crossRecordExclusion.associatedVia === 'SFLCTL');
  check('SFLRCDNBR and SFLROLVAL are valid only in the subfile-control record',
    KeywordSpec.validOnlyInSubfileControlRecord('SFLRCDNBR') === true && KeywordSpec.validOnlyInSubfileControlRecord('SFLROLVAL') === true && KeywordSpec.validOnlyInSubfileControlRecord('SFLSCROLL') === true);
  check('...and the others in this family are not (SFLCSRPRG, SFLNXTCHG, SFLCLR)',
    !KeywordSpec.validOnlyInSubfileControlRecord('SFLCSRPRG') && !KeywordSpec.validOnlyInSubfileControlRecord('SFLNXTCHG') && !KeywordSpec.validOnlyInSubfileControlRecord('SFLCLR'));
  check('SFLRTNSEL is qualified by SFLSNGCHC or SFLMLTCHC',
    T.SFLRTNSEL.qualifyingNames.join() === 'SFLSNGCHC,SFLMLTCHC' && KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [K('SFLSNGCHC')]) &&
    KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [K('SFLMLTCHC')]) && !KeywordSpec.hasQualifyingKeyword('SFLRTNSEL', [K('SFLDSP')]));
  check('SFLNXTCHG is mutually exclusive with SFLMSGRCD', KeywordSpec.mutexKeywords('SFLNXTCHG').join() === 'SFLMSGRCD');
  check('the accessors agree with the spec: SFLCLR and SFLRNA take no parameters, SFLMODE takes one',
    DspfWriter.takesNoParameters('SFLCLR') && DspfWriter.takesNoParameters('SFLRNA') && !DspfWriter.takesNoParameters('SFLMODE'));
  check('optionIndicatorsAllowed: false for SFLRNA and SFLMODE (not valid)', !DspfWriter.optionIndicatorsAllowed('SFLRNA') && !DspfWriter.optionIndicatorsAllowed('SFLMODE'));
  // Not asserted (logged as I-178): SFLCSRPRG, SFLRCDNBR, SFLROLVAL, SFLRTNSEL and SFLNXTCHG carry no
  // levels / parameters / optionIndicators fact in the spec, so takesNoParameters and optionIndicatorsAllowed
  // answer false for SFLCSRPRG and SFLRTNSEL (no parameters) and SFLNXTCHG (option indicators valid).
}

console.log('\n=== L1/L2 writer: parse, flag and parameter round trips ===');
{
  check('CTL1 parses with SFLINZ, SFLRNA, SFLCLR(31) and SFLMODE(&MODE) after SFLCTL, SFLPAG, SFLSIZ, SFLDSP, SFLDSPCTL',
    names(rec('CTL1').keywords).join() === 'SFLCTL,SFLPAG,SFLSIZ,SFLDSP,SFLDSPCTL,SFLINZ,SFLRNA,SFLCLR,SFLMODE' &&
    kwOf(rec('CTL1').keywords, 'SFLCLR').conditions[0].indicators[0].number === '31' && kwOf(rec('CTL1').keywords, 'SFLMODE').parameters === '&MODE');
  check('fields: RCD carries SFLRCDNBR(CURSOR *TOP), ROLL carries SFLROLVAL, S1 carries SFLCSRPRG',
    kwOf(fld('CTL1', 'RCD').keywords, 'SFLRCDNBR').parameters === 'CURSOR *TOP' && !!kwOf(fld('CTL1', 'ROLL').keywords, 'SFLROLVAL') && !!kwOf(fld('SFL1', 'S1').keywords, 'SFLCSRPRG'));
  check('SFL2 carries SFLNXTCHG(10) at record level', kwOf(rec('SFL2').keywords, 'SFLNXTCHG').conditions[0].indicators[0].number === '10');
  const g = (kws, n) => DspfWriter.getFileFlagKeyword(kws, n);
  check('getFileFlagKeyword reads SFLCLR with its indicator and SFLRNA as a bare flag',
    g(rec('CTL1').keywords, 'SFLCLR').present && g(rec('CTL1').keywords, 'SFLCLR').conditions.length === 1 && g(rec('CTL1').keywords, 'SFLRNA').present && g(rec('CTL1').keywords, 'SFLRNA').conditions.length === 0);
  check('getFileFlagKeyword reads SFLRCDNBR\'s parameter text', g(fld('CTL1', 'RCD').keywords, 'SFLRCDNBR').parameters === 'CURSOR *TOP');

  const rnaOff = DspfWriter.setFileFlagKeyword(rec('CTL1').keywords, 'SFLRNA', false, '', undefined, undefined);
  check('SFLRNA off removes only SFLRNA', names(rnaOff).join() === 'SFLCTL,SFLPAG,SFLSIZ,SFLDSP,SFLDSPCTL,SFLINZ,SFLCLR,SFLMODE');
  const rnaOn = DspfWriter.setFileFlagKeyword(rnaOff, 'SFLRNA', true, '', undefined, undefined);
  check('SFLRNA on again is bare and unconditioned', kwOf(rnaOn, 'SFLRNA').parameters.trim() === '' && kwOf(rnaOn, 'SFLRNA').conditions.length === 0);
  const clrKept = DspfWriter.setFileFlagKeyword(rec('CTL1').keywords, 'SFLCLR', true, '', undefined, undefined);
  check('SFLCLR turned on again keeps its indicator and stays single', kwOf(clrKept, 'SFLCLR').conditions[0].indicators[0].number === '31' && clrKept.filter((k) => k.name === 'SFLCLR').length === 1);
  const clrCond = DspfWriter.setFileFlagKeyword(rec('CTL1').keywords, 'SFLCLR', true, '', undefined, IND('44'));
  check('SFLCLR with a new condition list takes the new indicator', kwOf(clrCond, 'SFLCLR').conditions[0].indicators[0].number === '44');
  const modeSet = DspfWriter.setFileFlagKeyword(rec('CTL1').keywords, 'SFLMODE', true, '&OTHER', undefined, undefined);
  check('SFLMODE parameter rewritten in place, one SFLMODE', kwOf(modeSet, 'SFLMODE').parameters === '&OTHER' && modeSet.filter((k) => k.name === 'SFLMODE').length === 1);
  const rcd = DspfWriter.setFileFlagKeyword([], 'SFLRCDNBR', true, 'CURSOR');
  check('SFLRCDNBR written with CURSOR only', rcd.length === 1 && rcd[0].parameters === 'CURSOR');
  const rcdTop = DspfWriter.setFileFlagKeyword([K('SFLROLVAL')], 'SFLRCDNBR', true, '*TOP');
  check('SFLRCDNBR(*TOP) added beside an existing field keyword keeps it', names(rcdTop).join() === 'SFLROLVAL,SFLRCDNBR' && kwOf(rcdTop, 'SFLRCDNBR').parameters === '*TOP');
  check('SFLRCDNBR off removes it', DspfWriter.setFileFlagKeyword([K('SFLRCDNBR', 'CURSOR')], 'SFLRCDNBR', false).length === 0);
  const rolOn = DspfWriter.setFileFlagKeyword([], 'SFLROLVAL', true);
  check('SFLROLVAL on is a bare keyword', rolOn.length === 1 && rolOn[0].parameters.trim() === '');
  const csrOn = DspfWriter.setFileFlagKeyword([K('SFLROLVAL')], 'SFLCSRPRG', true);
  check('SFLCSRPRG on is a bare keyword beside the others', names(csrOn).join() === 'SFLROLVAL,SFLCSRPRG' && kwOf(csrOn, 'SFLCSRPRG').parameters.trim() === '');
  const nxtCond = DspfWriter.setFileFlagKeyword([K('SFLNXTCHG')], 'SFLNXTCHG', true, '', undefined, IND('12'));
  check('SFLNXTCHG takes an option indicator', kwOf(nxtCond, 'SFLNXTCHG').conditions[0].indicators[0].number === '12');
  const nxtKept = DspfWriter.setFileFlagKeyword(rec('SFL2').keywords, 'SFLNXTCHG', true, '', undefined, undefined);
  check('SFLNXTCHG turned on again keeps indicator 10', kwOf(nxtKept, 'SFLNXTCHG').conditions[0].indicators[0].number === '10');
}

console.log('\n=== L1 SFLCLR: option indicator required, no display size names ===');
{
  const none = parse(BASE);
  const ds = parse(BASE.concat([dds({ ind: '*DS3', fn: 'SFLCLR' })]));
  const withInd = parse(BASE.concat([dds({ ind: '31', fn: 'SFLCLR' })]));
  const bare = parse(BASE.concat([dds({ fn: 'SFLCLR' })]));
  const reason = DspfWriter.optionIndicatorRequiredNewConflictReason(none, ds);
  check('adding SFLCLR conditioned on *DS3 is refused, naming SFLCLR and display size names', !!reason && /SFLCLR/.test(reason) && /display size/.test(reason));
  check('adding SFLCLR with an option indicator is accepted', DspfWriter.optionIndicatorRequiredNewConflictReason(none, withInd) === null);
  check('adding a bare SFLCLR is accepted by this guard (the row shows a note instead)', DspfWriter.optionIndicatorRequiredNewConflictReason(none, bare) === null);
  check('an already-invalid SFLCLR(*DS3) is not re-reported by an unchanged edit', DspfWriter.optionIndicatorRequiredNewConflictReason(ds, ds) === null);
  check('removing the *DS3 condition is never blocked', DspfWriter.optionIndicatorRequiredNewConflictReason(ds, withInd) === null);
  const notes = (kws) => DspfWriter.subfileControlNotes(kws);
  check('a bare SFLCLR is flagged as needing an indicator', notes([K('SFLCLR'), K('SFLDSP')]).needsIndicator.join() === 'SFLCLR');
  check('SFLCLR with an indicator is not flagged', notes([K('SFLCLR', '', IND('31'))]).needsIndicator.length === 0);
  check('no SFLCLR, nothing flagged', notes([K('SFLDSP')]).needsIndicator.length === 0);
}

console.log('\n=== L1 SFLRNA: needs SFLINZ, not on a message subfile, not with field selection ===');
{
  const w = DspfWriter;
  const none = parse(BASE);
  const rnaOnly = parse(BASE.concat([dds({ fn: 'SFLRNA' })]));
  const both = parse(BASE.concat([dds({ fn: 'SFLINZ' }), dds({ fn: 'SFLRNA' })]));
  const inzOnly = parse(BASE.concat([dds({ fn: 'SFLINZ' })]));
  const r = w.subfileKeywordNewConflictReason(none, rnaOnly);
  check('SFLRNA without SFLINZ is refused, naming both', !!r && /SFLRNA/.test(r) && /SFLINZ/.test(r));
  check('SFLRNA beside SFLINZ is accepted', w.subfileKeywordNewConflictReason(none, both) === null);
  const r2 = w.subfileKeywordNewConflictReason(both, parse(BASE.concat([dds({ fn: 'SFLRNA' })])));
  check('removing SFLINZ while SFLRNA stays is refused (the other direction)', !!r2 && /SFLINZ/.test(r2));
  check('removing SFLRNA is always fine', w.subfileKeywordNewConflictReason(both, inzOnly) === null);
  check('an already-invalid hand-written SFLRNA with no SFLINZ is not re-reported by an unchanged edit', w.subfileKeywordNewConflictReason(rnaOnly, rnaOnly) === null);
  const msg = parse([
    dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
    dds({ rec: 1, name: 'SFL1', fn: 'SFL' }), dds({ fn: 'SFLMSGRCD(24)' }),
    dds({ name: 'M1', usage: 'O', fn: 'SFLMSGKEY' }), dds({ name: 'Q1', usage: 'O', fn: 'SFLPGMQ(10)' }),
    dds({ rec: 1, name: 'CTL1', fn: 'SFLCTL(SFL1)' }), dds({ fn: 'SFLPAG(5) SFLSIZ(10)' }), dds({ fn: 'SFLDSP SFLDSPCTL' }),
    dds({ fn: 'SFLINZ' }), dds({ fn: 'SFLRNA' }),
  ]);
  const v = Object.values(w.subfileKeywordViolations(msg));
  check('SFLRNA against a message subfile (SFLMSGRCD on the subfile record) is reported', v.some((t) => /SFLRNA/.test(t) && /message subfile/.test(t)));
  // Field selection: an option indicator on a field of the subfile record.
  const sel = (extra) => parse([
    dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
    dds({ rec: 1, name: 'SFL1', fn: 'SFL' }), dds({ ind: '10', name: 'S1', len: 10, type: 'A', usage: 'B', line: 5, pos: 5 }),
    dds({ rec: 1, name: 'CTL1', fn: 'SFLCTL(SFL1)' }), dds({ fn: 'SFLPAG(5) SFLSIZ(5)' }), dds({ fn: 'SFLDSP SFLDSPCTL' }),
  ].concat(extra));
  const fsel = w.subfileFoldDropNewConflictReason(sel([dds({ fn: 'SFLINZ' })]), sel([dds({ fn: 'SFLINZ' }), dds({ fn: 'SFLRNA' })]));
  check('SFLRNA on a control record whose subfile uses field selection is refused', !!fsel && /SFLRNA/.test(fsel) && /field selection/.test(fsel));
  const noSel = parse(BASE.concat([dds({ fn: 'SFLINZ' }), dds({ fn: 'SFLRNA' })]));
  check('...and is fine when no subfile field carries an option indicator', w.subfileFoldDropNewConflictReason(none, noSel) === null);
}

console.log('\n=== L1 SFLMODE: SFLMODE(&mode) and its field ===');
{
  const w = DspfWriter;
  const withMode = (fields, fn) => parse(BASE.concat([dds({ fn: fn || 'SFLMODE(&MODE)' })], fields));
  const good = [dds({ name: 'MODE', len: 1, type: 'A', usage: 'H' })];
  const v = (m) => Object.values(w.subfileKeywordViolations(m));
  check('SFLMODE(&MODE) with a hidden A/1 field MODE has no violation', v(withMode(good)).length === 0);
  check('the field missing is reported, saying it must be defined', v(withMode([])).some((t) => /MODE/.test(t) && /does not exist/.test(t)));
  check('a field of length 2 is reported with its length', v(withMode([dds({ name: 'MODE', len: 2, type: 'A', usage: 'H' })])).some((t) => /length is 2/.test(t)));
  check('a field with usage B is reported with its usage', v(withMode([dds({ name: 'MODE', len: 1, type: 'A', usage: 'B', line: 2, pos: 2 })])).some((t) => /usage is B/.test(t)));
  check('a numeric field is reported with its data type', v(withMode([dds({ name: 'MODE', len: 1, type: 'S', dec: 0, usage: 'H' })])).some((t) => /data type is S/.test(t)));
  check('the parameter without the leading & is reported', v(withMode(good, 'SFLMODE(MODE)')).some((t) => /leading &/.test(t)));
  check('SFLMODE with no parameter is reported', v(withMode([], 'SFLMODE')).some((t) => /leading &/.test(t)));
  const none = parse(BASE);
  check('adding SFLMODE with a missing field is refused by the diff guard', !!w.subfileKeywordNewConflictReason(none, withMode([])));
  check('adding SFLMODE with a valid field is accepted', w.subfileKeywordNewConflictReason(none, withMode(good)) === null);
  const bad = withMode([]);
  check('an already-invalid SFLMODE is not re-reported by an unchanged edit', w.subfileKeywordNewConflictReason(bad, bad) === null);
}

console.log('\n=== L1 SFLRTNSEL: needs SFLSNGCHC or SFLMLTCHC (both directions) ===');
{
  const w = DspfWriter;
  const r1 = w.sflrtnselNewConflictReason([K('SFLDSP')], [K('SFLDSP'), K('SFLRTNSEL')]);
  check('adding SFLRTNSEL with no choice keyword is refused, naming all three', !!r1 && /SFLRTNSEL/.test(r1) && /SFLSNGCHC/.test(r1) && /SFLMLTCHC/.test(r1));
  check('adding it beside SFLSNGCHC is accepted', w.sflrtnselNewConflictReason([K('SFLSNGCHC')], [K('SFLSNGCHC'), K('SFLRTNSEL')]) === null);
  check('adding it beside SFLMLTCHC is accepted', w.sflrtnselNewConflictReason([K('SFLMLTCHC')], [K('SFLMLTCHC'), K('SFLRTNSEL')]) === null);
  const r2 = w.sflrtnselNewConflictReason([K('SFLSNGCHC'), K('SFLRTNSEL')], [K('SFLRTNSEL')]);
  check('removing the last choice keyword while SFLRTNSEL stays is refused', !!r2 && /cannot be removed/.test(r2));
  check('switching SFLSNGCHC for SFLMLTCHC is fine', w.sflrtnselNewConflictReason([K('SFLSNGCHC'), K('SFLRTNSEL')], [K('SFLMLTCHC'), K('SFLRTNSEL')]) === null);
  check('an already-invalid SFLRTNSEL is not re-reported, and fixing it is allowed',
    w.sflrtnselNewConflictReason([K('SFLRTNSEL')], [K('SFLRTNSEL'), K('SFLDSP')]) === null && w.sflrtnselNewConflictReason([K('SFLRTNSEL')], [K('SFLRTNSEL'), K('SFLSNGCHC')]) === null);
  check('turning SFLRTNSEL off is never blocked', w.sflrtnselNewConflictReason([K('SFLSNGCHC'), K('SFLRTNSEL')], [K('SFLSNGCHC')]) === null);
}

console.log('\n=== L1 SFLNXTCHG: not with SFLMSGRCD ===');
{
  const w = DspfWriter;
  const a = w.sflNxtchgSflMsgRcdConflictReason('SFLNXTCHG', [K('SFLMSGRCD', '24')]);
  check('turning SFLNXTCHG on beside SFLMSGRCD is refused, naming both', !!a && /SFLNXTCHG/.test(a) && /SFLMSGRCD/.test(a));
  const b = w.sflNxtchgSflMsgRcdConflictReason('SFLMSGRCD', [K('SFLNXTCHG')]);
  check('turning SFLMSGRCD on beside SFLNXTCHG is refused, from the other side', !!b && /SFLMSGRCD/.test(b) && /SFLNXTCHG/.test(b));
  check('SFLNXTCHG on a plain subfile record is accepted', w.sflNxtchgSflMsgRcdConflictReason('SFLNXTCHG', [K('SFL')]) === null);
}

console.log('\n=== L1 SFLCSRPRG / SFLRCDNBR / SFLROLVAL: where they may go ===');
{
  const w = DspfWriter;
  const withLin = parse(BASE.concat([dds({ fn: 'SFLLIN(1)' })])).records;
  const withoutLin = parse(BASE).records;
  const r = w.sflcsrprgFieldEditConflictReason('SFL1', [], [K('SFLCSRPRG')], withLin);
  check('SFLCSRPRG on a field of a subfile whose control record carries SFLLIN is refused, naming both', !!r && /SFLCSRPRG/.test(r) && /SFLLIN/.test(r));
  check('SFLCSRPRG without SFLLIN is accepted', w.sflcsrprgFieldEditConflictReason('SFL1', [], [K('SFLCSRPRG')], withoutLin) === null);
  check('an SFLCSRPRG already on the field is not re-reported', w.sflcsrprgFieldEditConflictReason('SFL1', [K('SFLCSRPRG')], [K('SFLCSRPRG')], withLin) === null);
  check('SFLCSRPRG on a field of a different subfile than the one SFLLIN belongs to is fine', w.sflcsrprgFieldEditConflictReason('SFL2', [], [K('SFLCSRPRG')], withLin) === null);
  const sflLinOnCtl = parse(BASE.concat([dds({ fn: 'SFLLIN(1)' })]));
  const withoutCtlLin = parse(BASE);
  check('adding SFLLIN to the control record of a subfile that has an SFLCSRPRG field is refused (the other side)',
    !!w.sfllinRecordEditConflictReason(withoutCtlLin.records.find((x) => x.name === 'CTL1'), sflLinOnCtl.records.find((x) => x.name === 'CTL1').keywords, parse(SUB.slice(0, 9).concat([dds({ fn: 'SFLDSP SFLDSPCTL' }), dds({ fn: 'SFLLIN(1)' })])).records));
  const only = w.subfileControlOnlyFieldNewConflictReason;
  check('SFLRCDNBR on a field of a non-control record is refused', /SFLRCDNBR/.test(only([], [K('SFLRCDNBR', 'CURSOR')], false) || ''));
  check('SFLROLVAL on a field of a non-control record is refused', /SFLROLVAL/.test(only([], [K('SFLROLVAL')], false) || ''));
  check('both are accepted on the control record', only([], [K('SFLRCDNBR'), K('SFLROLVAL')], true) === null);
  check('one that is already there, or being turned off, is not blocked', only([K('SFLROLVAL')], [K('SFLROLVAL')], false) === null && only([K('SFLROLVAL')], [], false) === null);
  check('SFLCSRPRG is not restricted to the control record by that guard (it is a subfile-detail field keyword)', only([], [K('SFLCSRPRG')], false) === null);
  // I-177 (src/test/i177SflrcdnbrRules.test.js) covers SFLRCDNBR beside SFLROLVAL on one field, its parameter
  // text and its field shape.
}

console.log('\n=== L3/L4 the panels (jsdom) ===');
const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (t) => { alerts.push(String(t)); };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const sel = doc.getElementById('recordSelect');
  const selectRecord = (name) => { sel.value = name; fire(sel); };
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const parsed = (t) => (t ? DspfParser.parseDspf(t) : null);
  const recFrom = (t, name) => (t ? parsed(t).records.find((r) => r.name === name) : null);
  const el = (id) => doc.getElementById(id);
  const has = (id) => !!el(id);
  const toggle = (id, on) => { const e = el(id); posted.length = 0; alerts.length = 0; e.checked = on; fire(e); return lastText(); };
  const condToggle = (flagId) => doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  const clickField = (name) => { const f = doc.querySelector('#screenOutput .dspf-field[data-field="' + name + '"]'); if (f) fire(f, 'click'); return !!f; };

  console.log('  -- subfile-control record CTL1');
  selectRecord('CTL1');
  const rows = ['sflclr', 'sflrna', 'sflmode', 'sflinz', 'sflnxtchg'];
  check('CTL1 shows rows for SFLCLR, SFLRNA, SFLMODE, SFLINZ and SFLNXTCHG', rows.every((k) => has('sflctl-CTL1-' + k + '-on')));
  check('saved state: SFLCLR, SFLRNA and SFLMODE are checked, SFLNXTCHG is not', el('sflctl-CTL1-sflclr-on').checked && el('sflctl-CTL1-sflrna-on').checked && el('sflctl-CTL1-sflmode-on').checked && !el('sflctl-CTL1-sflnxtchg-on').checked);
  check('SFLMODE shows its parameter &MODE', el('sflctl-CTL1-sflmode-params').value === '&MODE');
  check('SFLCLR shows a Conditioning toggle with its count (1); SFLRNA and SFLMODE have none (option indicators not valid)',
    !!condToggle('sflctl-CTL1-sflclr') && /Conditioning\s*\(1\)/.test(condToggle('sflctl-CTL1-sflclr').textContent) && !condToggle('sflctl-CTL1-sflrna') && !condToggle('sflctl-CTL1-sflmode'));
  check('SFLNXTCHG shows a Conditioning toggle on the control record too', !!condToggle('sflctl-CTL1-sflnxtchg'));
  check('SFLCLR has an indicator, so no "needs an option indicator" note', !has('sflctl-CTL1-sflclr-needs-indicator'));
  check('the selection-list type selector offers SFLSNGCHC and SFLMLTCHC', Array.from(el('sflctl-CTL1-selchc-type').options).map((o) => o.value).join() === ',SFLSNGCHC,SFLMLTCHC');
  check('the SFLRTNSEL checkbox is present and unchecked', has('sflctl-CTL1-sflrtnsel') && !el('sflctl-CTL1-sflrtnsel').checked);

  {
    // SFLINZ off while SFLRNA is on is refused (SFLRNA needs it); SFLRNA first, then SFLINZ.
    const t = toggle('sflctl-CTL1-sflinz-on', false);
    check('SFLINZ off while SFLRNA is on is refused: no edit posted', t === null);
    check('...with a message naming SFLRNA and SFLINZ', alerts.some((a) => /SFLRNA/.test(a) && /SFLINZ/.test(a)));
    selectRecord('CTL1');
    const t1 = toggle('sflctl-CTL1-sflrna-on', false);
    const r1 = recFrom(t1, 'CTL1');
    check('SFLRNA off removes only SFLRNA; SFLINZ, SFLCLR(31) and SFLMODE stay', !!r1 && names(r1.keywords).join() === 'SFLCTL,SFLPAG,SFLSIZ,SFLDSP,SFLDSPCTL,SFLINZ,SFLCLR,SFLMODE' && kwOf(r1.keywords, 'SFLCLR').conditions.length === 1);
    selectRecord('CTL1');
    const t2 = toggle('sflctl-CTL1-sflrna-on', true);
    const r2 = recFrom(t2, 'CTL1');
    check('SFLRNA on again (SFLINZ present) is accepted, bare and unconditioned', !!r2 && !!kwOf(r2.keywords, 'SFLRNA') && kwOf(r2.keywords, 'SFLRNA').conditions.length === 0 && kwOf(r2.keywords, 'SFLRNA').parameters.trim() === '');
  }
  {
    selectRecord('CTL1');
    const t = toggle('sflctl-CTL1-sflclr-on', false);
    const r = recFrom(t, 'CTL1');
    check('SFLCLR off removes it and its indicator line; the other keywords stay', !!r && !kwOf(r.keywords, 'SFLCLR') && !!kwOf(r.keywords, 'SFLMODE') && !/31\s+.*SFLCLR/.test(t));
    selectRecord('CTL1');
    const t2 = toggle('sflctl-CTL1-sflclr-on', true);
    const r2 = recFrom(t2, 'CTL1');
    check('SFLCLR on again is bare, so the row shows the "needs an option indicator" note', !!r2 && !!kwOf(r2.keywords, 'SFLCLR'));
    selectRecord('CTL1');
    check('...the note is on the page and the Conditioning toggle is still offered', has('sflctl-CTL1-sflclr-needs-indicator') && !!condToggle('sflctl-CTL1-sflclr'));
  }
  {
    selectRecord('CTL1');
    fire(condToggle('sflctl-CTL1-sflclr'), 'click');
    fire(doc.querySelector('.cond-add-group[data-prefix="sflctl-CTL1-sflclr-cond"]'), 'click');
    doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = '45';
    posted.length = 0;
    fire(doc.querySelector('.cond-ind-add[data-prefix="sflctl-CTL1-sflclr-cond"][data-group="pending"]'), 'click');
    const t = lastText();
    const k = t ? kwOf(recFrom(t, 'CTL1').keywords, 'SFLCLR') : null;
    check('SFLCLR conditioned on indicator 45 through the Conditioning editor; SFLMODE and SFLRNA stay', !!k && k.conditions[0].indicators[0].number === '45' && !!kwOf(recFrom(t, 'CTL1').keywords, 'SFLMODE') && !!kwOf(recFrom(t, 'CTL1').keywords, 'SFLRNA'));
  }
  {
    selectRecord('CTL1');
    const t = toggle('sflctl-CTL1-sflmode-on', false);
    const r = recFrom(t, 'CTL1');
    check('SFLMODE off removes it; the MODE field is untouched', !!r && !kwOf(r.keywords, 'SFLMODE') && !!parsed(t).records.find((x) => x.name === 'CTL1').fields.find((f) => f.name === 'MODE'));
    selectRecord('CTL1');
    el('sflctl-CTL1-sflmode-params').value = '&MODE';
    const t2 = toggle('sflctl-CTL1-sflmode-on', true);
    const r2 = recFrom(t2, 'CTL1');
    check('SFLMODE on with &MODE (a hidden A/1 field exists) writes SFLMODE(&MODE)', !!r2 && !!kwOf(r2.keywords, 'SFLMODE') && kwOf(r2.keywords, 'SFLMODE').parameters === '&MODE');
    selectRecord('CTL1');
    el('sflctl-CTL1-sflmode-on').checked = true;
    posted.length = 0; alerts.length = 0;
    el('sflctl-CTL1-sflmode-params').value = '&NOPE';
    fire(el('sflctl-CTL1-sflmode-params'));
    check('naming a field that does not exist (&NOPE) is refused: no edit posted', lastText() === null);
    check('...with a message naming NOPE', alerts.some((a) => /NOPE/.test(a)));
  }
  {
    selectRecord('CTL3');
    const t = toggle('sflctl-CTL3-sflrtnsel', true);
    check('SFLRTNSEL on with no SFLSNGCHC / SFLMLTCHC is refused: no edit posted', t === null);
    check('...naming SFLRTNSEL, SFLSNGCHC and SFLMLTCHC', alerts.some((a) => /SFLRTNSEL/.test(a) && /SFLSNGCHC/.test(a) && /SFLMLTCHC/.test(a)));
    selectRecord('CTL3');
    posted.length = 0; alerts.length = 0;
    el('sflctl-CTL3-selchc-type').value = 'SFLSNGCHC';
    fire(el('sflctl-CTL3-selchc-type'));
    const t1 = lastText();
    check('choosing SFLSNGCHC adds it to the record', !!t1 && !!kwOf(recFrom(t1, 'CTL3').keywords, 'SFLSNGCHC'));
    selectRecord('CTL3');
    const t2 = toggle('sflctl-CTL3-sflrtnsel', true);
    const r2 = recFrom(t2, 'CTL3');
    check('SFLRTNSEL on beside SFLSNGCHC is accepted, bare', !!r2 && !!kwOf(r2.keywords, 'SFLRTNSEL') && kwOf(r2.keywords, 'SFLRTNSEL').parameters.trim() === '' && !!kwOf(r2.keywords, 'SFLSNGCHC'));
    selectRecord('CTL3');
    posted.length = 0; alerts.length = 0;
    el('sflctl-CTL3-selchc-type').value = '';
    fire(el('sflctl-CTL3-selchc-type'));
    check('removing the selection-list type while SFLRTNSEL is on is refused: no edit posted, message names SFLRTNSEL', lastText() === null && alerts.some((x) => /SFLRTNSEL/.test(x) && /cannot be removed/.test(x)));
    selectRecord('CTL3');
    const t3 = toggle('sflctl-CTL3-sflrtnsel', false);
    check('SFLRTNSEL off is fine and leaves SFLSNGCHC', !!t3 && !kwOf(recFrom(t3, 'CTL3').keywords, 'SFLRTNSEL') && !!kwOf(recFrom(t3, 'CTL3').keywords, 'SFLSNGCHC'));
  }
  console.log('  -- subfile record SFL2 (SFLNXTCHG)');
  selectRecord('SFL2');
  check('SFL2 shows the SFLNXTCHG row, checked, with its Conditioning count (1)', has('sfl-SFL2-sflnxtchg-on') && el('sfl-SFL2-sflnxtchg-on').checked && !!condToggle('sfl-SFL2-sflnxtchg') && /Conditioning\s*\(1\)/.test(condToggle('sfl-SFL2-sflnxtchg').textContent));
  {
    const t = toggle('sfl-SFL2-sflnxtchg-on', false);
    const r = recFrom(t, 'SFL2');
    check('SFLNXTCHG off removes it and its indicator line; SFL stays', !!r && names(r.keywords).join() === 'SFL' && !/10\s+.*SFLNXTCHG/.test(t));
    selectRecord('SFL2');
    const t2 = toggle('sfl-SFL2-sflnxtchg-on', true);
    const r2 = recFrom(t2, 'SFL2');
    check('SFLNXTCHG on again is bare and unconditioned', !!r2 && !!kwOf(r2.keywords, 'SFLNXTCHG') && kwOf(r2.keywords, 'SFLNXTCHG').conditions.length === 0);
  }
  {
    selectRecord('SFL2');
    fire(condToggle('sfl-SFL2-sflnxtchg'), 'click');
    fire(doc.querySelector('.cond-add-group[data-prefix="sfl-SFL2-sflnxtchg-cond"]'), 'click');
    doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = '22';
    posted.length = 0;
    fire(doc.querySelector('.cond-ind-add[data-prefix="sfl-SFL2-sflnxtchg-cond"][data-group="pending"]'), 'click');
    const t = lastText();
    const k = t ? kwOf(recFrom(t, 'SFL2').keywords, 'SFLNXTCHG') : null;
    check('SFLNXTCHG conditioned on indicator 22 (option indicators are valid for it)', !!k && k.conditions[0].indicators[0].number === '22');
  }
  {
    selectRecord('SFL2');
    const owner = 'record-SFL2';
    check('the record raw keyword editor is reachable on SFL2', Array.from(doc.querySelectorAll('.kw-add')).some((e) => e.getAttribute('data-owner') === owner));
    doc.getElementById(owner + '-new-kw-name').value = 'SFLMSGRCD';
    doc.getElementById(owner + '-new-kw-params').value = '24';
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
    check('raw-adding SFLMSGRCD to SFL2 (which has SFLNXTCHG) is refused: no edit posted', lastText() === null);
    check('...with a message naming SFLMSGRCD and SFLNXTCHG', alerts.some((a) => /SFLMSGRCD/.test(a) && /SFLNXTCHG/.test(a)));
  }

  {
    selectRecord('SFL2');
    const owner = 'record-SFL2';
    doc.getElementById(owner + '-new-kw-name').value = 'SFLRTNSEL';
    doc.getElementById(owner + '-new-kw-params').value = '';
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
    check('raw-adding SFLRTNSEL to a record with no SFLSNGCHC / SFLMLTCHC is refused: no edit posted', lastText() === null);
    check('...with a message naming SFLRTNSEL', alerts.some((x) => /SFLRTNSEL/.test(x)));
  }

  console.log('  -- field panels: SFLRCDNBR / SFLROLVAL (control record) and SFLCSRPRG (subfile record)');
  selectRecord('CTL1');
  check('ROLL is on the preview canvas', clickField('ROLL'));
  {
    const rc = doc.querySelector('[id$="-sflrcdnbr"]');
    const ro = doc.querySelector('[id$="-sflrolval"]');
    check('the field panel offers an SFLRCDNBR selector and an SFLROLVAL checkbox', !!rc && rc.tagName === 'SELECT' && !!ro && ro.type === 'checkbox');
    check('the SFLRCDNBR selector offers none, CURSOR and *TOP', Array.from(rc.options).map((o) => o.value).join('|') === '|CURSOR|*TOP');
    check('saved state: SFLROLVAL checked and SFLRCDNBR empty on ROLL', ro.checked && rc.value === '');
    posted.length = 0;
    ro.checked = false; fire(ro);
    const t = lastText();
    const f = t ? recFrom(t, 'CTL1').fields.find((x) => x.name === 'ROLL') : null;
    check('SFLROLVAL off removes it from ROLL only; RCD still has SFLRCDNBR', !!f && !kwOf(f.keywords, 'SFLROLVAL') && !!kwOf(recFrom(t, 'CTL1').fields.find((x) => x.name === 'RCD').keywords, 'SFLRCDNBR'));
  }
  {
    selectRecord('CTL1'); clickField('ROLL');
    const rc = doc.querySelector('[id$="-sflrcdnbr"]');
    posted.length = 0;
    rc.value = '*TOP'; fire(rc);
    const t = lastText();
    const f = t ? recFrom(t, 'CTL1').fields.find((x) => x.name === 'ROLL') : null;
    check('choosing *TOP writes SFLRCDNBR(*TOP) on ROLL', !!f && kwOf(f.keywords, 'SFLRCDNBR') && kwOf(f.keywords, 'SFLRCDNBR').parameters === '*TOP');
    selectRecord('CTL1'); clickField('ROLL');
    const rc2 = doc.querySelector('[id$="-sflrcdnbr"]');
    check('...and the selector shows *TOP on the next render', rc2.value === '*TOP');
    posted.length = 0;
    rc2.value = ''; fire(rc2);
    const t2 = lastText();
    check('choosing none removes SFLRCDNBR again', !!t2 && !kwOf(recFrom(t2, 'CTL1').fields.find((x) => x.name === 'ROLL').keywords, 'SFLRCDNBR'));
  }
  {
    selectRecord('CTL1'); clickField('ROLL');
    const ro = doc.querySelector('[id$="-sflrolval"]');
    posted.length = 0;
    ro.checked = true; fire(ro);
    const t = lastText();
    check('SFLROLVAL on again is a bare keyword on ROLL', !!t && kwOf(recFrom(t, 'CTL1').fields.find((x) => x.name === 'ROLL').keywords, 'SFLROLVAL') !== undefined);
  }
  selectRecord('SFL1');
  check('S1 is on the preview canvas', clickField('S1'));
  {
    const cs = doc.querySelector('[id$="-sflcsrprg"]');
    check('S1 shows the SFLCSRPRG checkbox, checked, and no Conditioning toggle for it (option indicators not valid)', !!cs && cs.checked && !doc.querySelector('.kw-cond-toggle[data-flag-id$="-sflcsrprg"]'));
    posted.length = 0;
    cs.checked = false; fire(cs);
    const t = lastText();
    const f = t ? recFrom(t, 'SFL1').fields.find((x) => x.name === 'S1') : null;
    check('SFLCSRPRG off removes it from S1 only', !!f && !kwOf(f.keywords, 'SFLCSRPRG') && names(recFrom(t, 'SFL1').fields.find((x) => x.name === 'S2').keywords).length === 0);
    selectRecord('SFL1'); clickField('S1');
    const cs2 = doc.querySelector('[id$="-sflcsrprg"]');
    posted.length = 0;
    cs2.checked = true; fire(cs2);
    const t2 = lastText();
    check('SFLCSRPRG on again is a bare field keyword', !!t2 && kwOf(recFrom(t2, 'SFL1').fields.find((x) => x.name === 'S1').keywords, 'SFLCSRPRG') !== undefined);
  }
  {
    selectRecord('SFL1'); clickField('S2');
    const rc = doc.querySelector('[id$="-sflrcdnbr"]');
    posted.length = 0; alerts.length = 0;
    rc.value = 'CURSOR'; fire(rc);
    check('SFLRCDNBR on a field of a subfile (SFL) record is refused: no edit posted', lastText() === null);
    check('...with a message naming SFLRCDNBR and the subfile-control record', alerts.some((a) => /SFLRCDNBR/.test(a) && /subfile-control/.test(a)));
    selectRecord('SFL1'); clickField('S2');
    const ro = doc.querySelector('[id$="-sflrolval"]');
    posted.length = 0; alerts.length = 0;
    ro.checked = true; fire(ro);
    check('SFLROLVAL on a field of a subfile (SFL) record is refused: no edit posted', lastText() === null);
    check('...with a message naming SFLROLVAL', alerts.some((a) => /SFLROLVAL/.test(a)));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

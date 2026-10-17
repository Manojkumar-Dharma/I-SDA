/**
 * E1j - the guards with other signatures, run by the diagnostics (src/ddsItemRules.js).
 * Pure Node: no vscode, no DOM.
 *
 *  1. every rule: a source that breaks it is reported on the right line and keyword, and the same source
 *     mended is not (a false positive on a valid source is worse than a miss);
 *  2. a reason that two keywords share is one diagnostic, not two;
 *  3. the incremental re-check agrees with the whole-model run (per-record cache, the file / model scope
 *     rules asked again every time);
 *  4. settings: a rule can be turned off or moved to another severity by its code;
 *  5. the guard accounting (E1a also holds it): every exported guard is run, registered or listed.
 */
'use strict';
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const DdsItemRules = require('../ddsItemRules.js');
const DspfWriter = require('../dspfWriter.js');

const rec = (n, ...lines) => [L({ nameType: 'R', name: n }), ...lines];
const fld = (o) => L(Object.assign({ name: 'F1', length: 5, dataType: 'A', usage: 'B', line: 2, col: 2 }, o));
const kw = (f) => L({ func: f });
const analyze = (lines, options) => DdsDiagnostics.analyze(lines.join('\n'), options);
const mine = (r, code) => r.diagnostics.filter((d) => d.code === code);

// code, the broken source, the 1-based line and keyword it is reported on (keyword null: on the field / record name), the mended source
const CASES = [
  ['isda.edtmskKeywords', rec('R1', fld({ dataType: 'S', decimals: 0, func: 'EDTMSK(1)' }), kw('CNTFLD(5)')), 2, 'EDTMSK',
    rec('R1', fld({ dataType: 'S', decimals: 0, func: 'EDTMSK(1)' }))],
  ['isda.edtmskDefinition', rec('R1', fld({ usage: 'I', func: 'EDTMSK(1)' })), 2, 'EDTMSK',
    rec('R1', fld({ usage: 'B', func: 'EDTMSK(1) EDTCDE(1)' }))],
  ['isda.msgidExclusion', rec('R1', fld({ usage: 'M', func: 'MSGID(ABC1234 MSGF)' }), kw("DFT('A')")), 2, 'MSGID',
    rec('R1', fld({ usage: 'M', func: 'MSGID(ABC1234 MSGF)' }))],
  ['isda.chkmsgidQualifier', rec('R1', fld({ func: 'CHKMSGID(ABC1234 MSGF)' })), 2, 'CHKMSGID',
    rec('R1', fld({ func: 'CHKMSGID(ABC1234 MSGF) CHECK(M10)' }))],
  ['isda.pshbtnfld', rec('R1', fld({ dataType: 'Y', func: 'PSHBTNFLD DSPATR(HI)' })), 2, 'PSHBTNFLD',
    rec('R1', fld({ dataType: 'Y', func: 'PSHBTNFLD' }))],
  ['isda.layoutParameters', rec('R1', fld({ dataType: 'Y', func: 'SNGCHCFLD((*NUMCOL 2) (*GUTTER 1))' })), 2, 'SNGCHCFLD',
    rec('R1', fld({ dataType: 'Y', func: 'SNGCHCFLD((*NUMCOL 2) (*GUTTER 2))' }))],
  ['isda.valnumEligibility', rec('R1', fld({ usage: 'O', func: 'VALNUM' })), 2, 'VALNUM',
    rec('R1', fld({ usage: 'B', dataType: 'Y', func: 'VALNUM' }))],
  ['isda.dateTimeFormat', rec('R1', fld({ dataType: 'A', func: 'DATFMT(*ISO)' })), 2, 'DATFMT',
    rec('R1', fld({ dataType: 'L', func: 'DATFMT(*ISO)' }))],
  ['isda.dateTimeUsage', rec('R1', fld({ dataType: 'L', usage: 'H' })), 2, null,
    rec('R1', fld({ dataType: 'L', usage: 'B' }))],
  ['isda.igcalttyp', rec('R1', fld({ usage: 'O', func: 'IGCALTTYP(*YES)' })), 2, 'IGCALTTYP',
    rec('R1', fld({ usage: 'B', func: 'IGCALTTYP(*YES)' }))],
  ['isda.editKeywordDataType', rec('R1', fld({ dataType: 'A', func: 'EDTCDE(1)' })), 2, 'EDTCDE',
    rec('R1', fld({ dataType: 'Y', decimals: 0, func: 'EDTCDE(1)' }))],
  ['isda.floatField', rec('R1', fld({ dataType: 'F', decimals: 2, func: 'DUP' })), 2, 'DUP',
    rec('R1', fld({ dataType: 'S', decimals: 2, func: 'DUP' }))],
  ['isda.dftGroup', rec('R1', fld({ func: "DFT('A') DFTVAL('B')" })), 2, 'DFT',
    rec('R1', fld({ func: "DFT('A')" }))],
  ['isda.wrdwrapField', rec('R1', fld({ usage: 'O', func: 'WRDWRAP' })), 2, 'WRDWRAP',
    rec('R1', fld({ usage: 'B', func: 'WRDWRAP' }))],
  ['isda.chrid', rec('R1', fld({ usage: 'H', func: 'CHRID(*JOBCCSID)' })), 2, 'CHRID',
    rec('R1', fld({ usage: 'B', func: 'CHRID(*JOBCCSID)' }))],
  ['isda.msgcon', rec('R1', fld({ func: 'MSGCON(5 ABC1234 MSGF) DSPATR(HI)' })), 2, 'MSGCON',
    rec('R1', L({ length: 5, line: 2, col: 2, func: 'MSGCON(5 ABC1234 MSGF)' }))],
  ['isda.errmsgidData', rec('R1', fld({ func: 'ERRMSGID(ABC1234 MSGF &NOFLD)' })), 2, 'ERRMSGID',
    rec('R1', fld({ func: 'ERRMSGID(ABC1234 MSGF &F2)' }), fld({ name: 'F2', usage: 'P', line: 3 }))],
  ['isda.subfileControlOnlyField', rec('R1', fld({ func: 'SFLSCROLL' })), 2, 'SFLSCROLL',
    rec('R1', kw('SFLCTL(R2)'), fld({ dataType: 'S', length: 5, decimals: 0, usage: 'H', func: 'SFLSCROLL' }))],
  ['isda.sflscrollField', rec('R1', kw('SFLCTL(R2)'), fld({ dataType: 'A', func: 'SFLSCROLL' })), 3, 'SFLSCROLL',
    rec('R1', kw('SFLCTL(R2)'), fld({ dataType: 'S', length: 5, decimals: 0, usage: 'H', func: 'SFLSCROLL' }))],
  ['isda.sflchcctlField', rec('R1', kw('SFL'), fld({ name: 'F0', func: '' }), fld({ name: 'F2', dataType: 'Y', func: 'SFLCHCCTL' })), 4, 'SFLCHCCTL',
    rec('R1', kw('SFL'), fld({ name: 'F2', dataType: 'Y', func: 'SFLCHCCTL' }), fld({ name: 'F0', func: '' }))],
  ['isda.pshbtnfldShape', rec('R1', fld({ dataType: 'A', length: 5, func: "PSHBTNFLD PSHBTNCHC(1 'x')" })), 2, 'PSHBTNFLD',
    rec('R1', fld({ dataType: 'Y', length: 2, decimals: 0, func: "PSHBTNFLD PSHBTNCHC(1 'x')" }))],
  ['isda.sflchcctlShape', rec('R1', kw('SFL'), fld({ dataType: 'A', func: 'SFLCHCCTL' })), 3, 'SFLCHCCTL',
    rec('R1', kw('SFL'), fld({ dataType: 'Y', length: 1, decimals: 0, usage: 'H', func: 'SFLCHCCTL' }))],
  ['isda.chkmsgidUsage', rec('R1', fld({ usage: 'O', func: 'CHKMSGID(ABC1234 MSGF) CHECK(M10)' })), 2, 'CHKMSGID',
    rec('R1', fld({ usage: 'I', func: 'CHKMSGID(ABC1234 MSGF) CHECK(M10)' }))],
  ['isda.html', rec('R1', fld({ func: 'HTML(x) DSPATR(HI)' })), 2, 'HTML',
    rec('R1', fld({ func: 'HTML(x)' }))],
  ['isda.sflmsgkeyField', rec('R1', fld({ ind1: '01', func: 'SFLMSGKEY' })), 2, 'SFLMSGKEY',
    rec('R1', fld({ func: 'SFLMSGKEY' }))],
  ['isda.fieldOptionIndicators', rec('R1', fld({ usage: 'B', func: 'DSPATR(HI)' }), L({ ind1: '01', func: 'IGCALTTYP(*YES)' })), 3, 'IGCALTTYP',
    rec('R1', fld({ usage: 'B', func: 'DSPATR(HI)' }), L({ func: 'IGCALTTYP(*YES)' }))],
  ['isda.editCodeFill', rec('R1', fld({ dataType: 'S', decimals: 0, func: 'EDTCDE(Y *)' })), 2, 'EDTCDE',
    rec('R1', fld({ dataType: 'Y', decimals: 0, func: 'EDTCDE(1 *)' }))],
  ['isda.sflend', rec('R1', kw('SFLCTL(R2)'), kw('SFLEND(*MORE *SCRBAR)')), 3, 'SFLEND',
    rec('R1', kw('SFLCTL(R2)'), kw('SFLEND(*SCRBAR *MORE)'))],
  ['isda.sflrtnsel', rec('R1', kw('SFLRTNSEL')), 2, 'SFLRTNSEL',
    rec('R1', kw('SFLSNGCHC'), kw('SFLRTNSEL'))],
  ['isda.sflChoiceList', rec('R1', kw('SFLSNGCHC'), kw('SFLMLTCHC')), 3, 'SFLMLTCHC',
    rec('R1', kw('SFLSNGCHC'))],
  ['isda.sflcsrrrn', rec('R1', kw('SFLCSRRRN(&NOFLD)')), 2, 'SFLCSRRRN',
    rec('R1', kw('SFLCSRRRN(&RRN)'), fld({ name: 'RRN', dataType: 'S', length: 5, decimals: 0, usage: 'H' }))],
  ['isda.sflmsgidData', rec('R1', kw('SFLMSGID(ABC1234 MSGF &NOFLD)')), 2, 'SFLMSGID',
    rec('R1', kw('SFLMSGID(ABC1234 MSGF)'))],
  ['isda.sflsizCondition', rec('R1', L({ sizeCondition: '*DS3', func: 'SFLSIZ(&N)' })), 2, 'SFLSIZ',
    rec('R1', L({ sizeCondition: '*DS3', func: 'SFLSIZ(10)' }))],
  ['isda.fileHelpExclusion', [kw('HLPDOC(a b c)'), kw('HLPPNLGRP'), ...rec('R1')], 1, 'HLPDOC',
    [kw('HLPDOC(a b c)'), ...rec('R1')]],
  ['isda.sflctlNxtchg', [...rec('R1', kw('SFLCTL(R2)'), kw('SFLNXTCHG')), ...rec('R2', kw('SFL'), fld({ name: 'F0', dataType: 'Y', func: 'SFLCHCCTL' }))], 3, 'SFLNXTCHG',
    [...rec('R1', kw('SFLCTL(R2)'), kw('SFLNXTCHG')), ...rec('R2', kw('SFL'), fld({ name: 'F0', func: '' }))]],
  ['isda.sfllin', [...rec('R1', kw('SFLCTL(R2)'), kw('SFLLIN')), ...rec('R2', kw('SFL'), fld({ func: 'SFLCSRPRG' }))], 3, 'SFLLIN',
    [...rec('R1', kw('SFLCTL(R2)'), kw('SFLLIN')), ...rec('R2', kw('SFL'), fld({ func: '' }))]],
  ['isda.passrcdRecord', [kw('PASSRCD(R1)'), ...rec('R1', kw('WINDOW(2 2 5 20)'))], 3, 'WINDOW',
    [kw('PASSRCD(R1)'), ...rec('R1'), ...rec('R2', kw('WINDOW(2 2 5 20)'))]],
  ['isda.menuBarKey', [kw('MNUBARSW(CA03)'), ...rec('R1', kw('MNUCNL(CA03)'))], 1, 'MNUBARSW',
    [kw('MNUBARSW(CA03)'), ...rec('R1', kw('MNUCNL(CA04)'))]],
  ['isda.moubtnCommandKey', rec('R1', kw('MOUBTN(ENTER CF05)'), kw('ALTHELP(CA05)')), 2, 'MOUBTN',
    rec('R1', kw('MOUBTN(ENTER CF05)'), kw('ALTHELP(CA06)'))],
  ['isda.chkmsgidData', rec('R1', fld({ func: 'CHKMSGID(ABC1234 MSGF &NOFLD) CHECK(M10)' })), 2, 'CHKMSGID',
    rec('R1', fld({ func: 'CHKMSGID(ABC1234 MSGF &F2) CHECK(M10)' }), fld({ name: 'F2', usage: 'P', line: 3 }))],
  ['isda.sflrcdnbrField', rec('R1', kw('SFLCTL(R2)'), fld({ dataType: 'A', func: 'SFLRCDNBR' })), 3, 'SFLRCDNBR',
    rec('R1', kw('SFLCTL(R2)'), fld({ dataType: 'S', length: 4, decimals: 0, usage: 'H', func: 'SFLRCDNBR' }))],
  ['isda.recordOptionIndicators', rec('R1', L({ ind1: '01', func: 'SFLCTL(R2)' })), 2, 'SFLCTL',
    rec('R1', L({ func: 'SFLCTL(R2)' }))],
  ['isda.fileOptionIndicators', [L({ ind1: '01', func: 'HLPTITLE(x)' }), ...rec('R1')], 1, 'HLPTITLE',
    [...rec('R1', L({ ind1: '01', func: 'HLPTITLE(x)' }))]],
  ['isda.helpSpecExclusion', [...rec('R1', L({ nameType: 'H', name: 'H1' }), kw('HLPDOC(a b c)'), kw('HLPBDY'))], 3, 'HLPDOC',
    [...rec('R1', L({ nameType: 'H', name: 'H1' }), kw('HLPDOC(a b c)'))]],
  ['isda.sflcsrprgField', [...rec('R1', kw('SFLCTL(R2)'), kw('SFLLIN')), ...rec('R2', kw('SFL'), fld({ func: 'SFLCSRPRG' }))], 6, 'SFLCSRPRG',
    [...rec('R1', kw('SFLCTL(R2)')), ...rec('R2', kw('SFL'), fld({ func: 'SFLCSRPRG' }))]],
];
// sflsizCondition's broken twin carries a size condition; a field name on a size-conditioned SFLSIZ is the violation

const ruleCodes = DdsItemRules.allCodes();
const covered = new Set(CASES.map((c) => c[0]));
check('every rule of ddsItemRules.js has a case here' + ruleCodes.filter((c) => !covered.has(c)).map((c) => ' - ' + c).join(''), ruleCodes.every((c) => covered.has(c)));
check('every case names a rule', CASES.every((c) => ruleCodes.indexOf(c[0]) >= 0));

CASES.forEach(([code, bad, line, keyword, good]) => {
  const r = analyze(bad);
  const hits = mine(r, code);
  check(code + ': a broken source is reported (' + hits.length + ')', hits.length >= 1);
  const at = hits.find((d) => d.line === line);
  check(code + ': on line ' + line + (keyword ? ' at the keyword ' + keyword : ' at the name'), !!at && (keyword ? at.keyword === keyword : at.keyword === null));
  check(code + ': nothing threw', r.internalErrors.length === 0);
  const ok = analyze(good);
  check(code + ': the mended source is not reported' + (mine(ok, code).length ? ' - ' + mine(ok, code)[0].message : ''), mine(ok, code).length === 0);
});

// ---- the rule codes are in allCodes() (the settings schema checks them against package.json) --------------
check('allCodes() holds every rule code', ruleCodes.every((c) => DdsDiagnostics.allCodes().indexOf(c) >= 0));
check('rule codes are unique', new Set(ruleCodes).size === ruleCodes.length);

// ---- one violation, one diagnostic -----------------------------------------------------------------------
check('MOUBTN and ALTHELP on one key number: one diagnostic', mine(analyze(CASES.find((c) => c[0] === 'isda.moubtnCommandKey')[1]), 'isda.moubtnCommandKey').length === 1);
check('HLPDOC and HLPPNLGRP in one file: one diagnostic', mine(analyze(CASES.find((c) => c[0] === 'isda.fileHelpExclusion')[1]), 'isda.fileHelpExclusion').length === 1);
check('DFT and DFTVAL on one field: one diagnostic', mine(analyze(CASES.find((c) => c[0] === 'isda.dftGroup')[1]), 'isda.dftGroup').length === 1);
const two = analyze(rec('R1', fld({ dataType: 'A', func: 'EDTCDE(1)' }), fld({ name: 'F2', line: 3, dataType: 'A', func: 'EDTCDE(2)' })));
check('the same fault on two fields: one diagnostic each, on its own line', mine(two, 'isda.editKeywordDataType').map((d) => d.line).join() === '2,3');

// ---- no false positive on valid sources a usage of blank, and constants --------------------------------------------
const valid = analyze([
  ...rec('R1', kw('SFLCTL(R2)'), kw('SFLSIZ(10)'), kw('SFLPAG(5)')),
  ...rec('R2', kw('SFL'), fld({ usage: '', dataType: 'L', func: '' }), 
    fld({ name: 'F3', usage: '', dataType: 'Y', decimals: 0, func: 'EDTCDE(1)', line: 4 })),
  ...rec('R3', L({ length: 8, line: 1, col: 2, func: "DSPATR(HI) 'text'" }), fld({ name: 'F2', usage: 'B', func: 'WRDWRAP', line: 3 })),
]);
check('valid sources with a blank usage (parsed as O) and a constant raise none of the item rules', valid.diagnostics.filter((d) => ruleCodes.indexOf(d.code) >= 0).length === 0);

// a model handed in with a blank usage (the parser itself reports a blank usage as O) is judged as O, not as unusable
const blankModel = DdsDiagnostics.analyze(rec('R1', fld({ dataType: 'L' })).join('\n')).model;
blankModel.records[0].fields[0].usage = '';
const blankRun = DdsDiagnostics.analyze(rec('R1', fld({ dataType: 'L' })).join('\n'), { model: blankModel });
check('a field model with a blank usage is not reported by the date/time usage rule', mine(blankRun, 'isda.dateTimeUsage').length === 0);

// ---- the incremental re-check agrees with the whole-model run -------------------------------------------------
const norm = (r) => r.diagnostics.map((d) => [d.line, d.column, d.endColumn, d.code, d.keyword, d.record, d.message].join('|')).join('\n');
let agree = 0;
let withItem = 0;
CASES.forEach(([code, bad, , , good]) => {
  [bad, good].forEach((lines) => {
    const text = lines.join('\n');
    const a = DdsDiagnostics.createAnalyzer().analyze(text);
    const b = DdsDiagnostics.analyze(text, { reference: true });
    if (norm(a) === norm(b)) agree++;
    if (a.diagnostics.some((d) => ruleCodes.indexOf(d.code) >= 0)) withItem++;
  });
});
check('incremental and whole-model runs give the same diagnostics on every case (' + agree + ' of ' + CASES.length * 2 + ')', agree === CASES.length * 2);
check('  and the comparison saw the item rules fire', withItem >= CASES.length);

// edit sequences with one analyzer: the answer follows the edit, for a record-scope and for a model-scope rule
const analyzer = DdsDiagnostics.createAnalyzer();
const nx = (r2field) => [...rec('R1', kw('SFLCTL(R2)'), kw('SFLNXTCHG')), ...rec('R2', kw('SFL'), r2field)];
const withChc = nx(fld({ name: 'F0', dataType: 'Y', func: 'SFLCHCCTL' })).join('\n');
const withoutChc = nx(fld({ name: 'F0', func: '' })).join('\n');
check('model scope: SFLNXTCHG against SFLCHCCTL in another record is reported', mine(analyzer.analyze(withChc), 'isda.sflctlNxtchg').length === 1);
check('  and gone when only the OTHER record is edited', mine(analyzer.analyze(withoutChc), 'isda.sflctlNxtchg').length === 0);
check('  and back on undo', mine(analyzer.analyze(withChc), 'isda.sflctlNxtchg').length === 1);
const bigBad = [];
for (let i = 1; i <= 30; i++) bigBad.push(...rec('R' + i, fld({ name: 'F' + i, dataType: 'A', func: 'EDTCDE(1)' })));
const inc = DdsDiagnostics.createAnalyzer();
const first = inc.analyze(bigBad.join('\n'));
const shifted = bigBad.slice();
shifted.splice(3, 0, L({ comment: 'new comment line' }));
const second = inc.analyze(shifted.join('\n'));
check('field scope: 30 records with the same fault give 30 diagnostics', mine(first, 'isda.editKeywordDataType').length === 30);
check('  after a line is inserted between records, they are all still there, those below it moved down by one', mine(second, 'isda.editKeywordDataType').length === 30 &&
  mine(second, 'isda.editKeywordDataType').every((d, i) => d.line === mine(first, 'isda.editKeywordDataType')[i].line + (i === 0 ? 0 : 1)));
check('  and answered from memory but the record that now holds the new line', second.stats.recordsAnalyzed === 1 && second.stats.recordsReused === 29);
const edited = shifted.slice();
edited[1] = fld({ name: 'F1', dataType: '', func: 'EDTCDE(1)' });
const third = inc.analyze(edited.join('\n'));
check('  an edit that mends one field removes exactly that diagnostic', mine(third, 'isda.editKeywordDataType').length === 29);

// ---- settings --------------------------------------------------------------------------------------------------
const bad0 = CASES[0][1];
check('a rule moved to a warning is reported as one', mine(analyze(bad0, { severity: { 'isda.edtmskKeywords': 'warning' } }), 'isda.edtmskKeywords')[0].severity === 'warning');
check('a rule set to off is not reported', mine(analyze(bad0, { severity: { 'isda.edtmskKeywords': 'off' } }), 'isda.edtmskKeywords').length === 0);
check('a rule in `disabled` is not reported', mine(analyze(bad0, { disabled: ['isda.edtmskKeywords'] }), 'isda.edtmskKeywords').length === 0);

// ---- a throwing guard is named and does not stop the rest ----------------------------------------------------
const realFn = DspfWriter.chkmsgidNewConflictReason;
DspfWriter.chkmsgidNewConflictReason = function () { throw new Error('boom'); };
const thrown = analyze(CASES.find((c) => c[0] === 'isda.chkmsgidQualifier')[1].concat([]));
DspfWriter.chkmsgidNewConflictReason = realFn;
check('a throwing item guard is named in internalErrors', thrown.internalErrors.some((e) => /isda\.chkmsgidQualifier: .*boom/.test(e)));
check('  and the other rules still ran', Array.isArray(thrown.diagnostics));

// ---- the guard accounting ---------------------------------------------------------------------------------------
const cov = DdsItemRules.coverage();
check('every edit-only guard carries a reason', cov.editOnly.every((n) => typeof cov.reasons[n] === 'string' && cov.reasons[n].length > 20));
const exported = Object.keys(DspfWriter).filter((k) => /ConflictReason$/.test(k));
const dc = DdsDiagnostics.coverage();
const accounted = dc.model.concat(dc.recordKeyword, cov.run, cov.editOnly);
check('all ' + exported.length + ' exported guards are accounted for exactly once', exported.every((n) => accounted.filter((a) => a === n).length === 1) && accounted.length === exported.length);

process.exit(failureCount() === 0 ? 0 : 1);

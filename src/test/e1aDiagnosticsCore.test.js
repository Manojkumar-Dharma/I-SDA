/**
 * E1a - the diagnostics core (src/ddsDiagnostics.js): DDS source in, positioned diagnostics out,
 * by running the existing DspfWriter guards in report mode. Pure module: no vscode, no DOM.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const DspfWriter = require('../dspfWriter.js');
const DspfParser = require('../../dist/dspfParser.js');

const field = (name, line, col, func) => L({ name, length: 10, dataType: 'A', usage: 'B', line, col, func });
const analyze = (lines, options) => DdsDiagnostics.analyze(lines.join('\n'), options);
const byCode = (r, code) => r.diagnostics.filter((d) => d.code === code);

// ---- module shape ----------------------------------------------------------------------------
const moduleSource = fs.readFileSync(path.join(__dirname, '../ddsDiagnostics.js'), 'utf8');
check('exports analyze, allCodes, coverage', typeof DdsDiagnostics.analyze === 'function' &&
  typeof DdsDiagnostics.allCodes === 'function' && typeof DdsDiagnostics.coverage === 'function');
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));
check('no DOM or window use', !/\b(window|document)\./.test(moduleSource.replace(/\/\*[\s\S]*?\*\//g, '')));
check('codes are unique and namespaced',
  new Set(DdsDiagnostics.allCodes()).size === DdsDiagnostics.allCodes().length &&
  DdsDiagnostics.allCodes().every((c) => /^isda\.[A-Za-z]+$/.test(c)));

// ---- a clean source gives nothing ------------------------------------------------------------
const clean = analyze([
  L({ func: 'DSPSIZ(24 80 *DS3)' }),
  L({ nameType: 'R', name: 'REC1' }),
  L({ func: 'OVERLAY' }),
  field('F1', 2, 2, 'DSPATR(HI)'),
  L({ nameType: 'R', name: 'REC2' }),
  field('F2', 3, 2),
]);
check('clean source: no diagnostics', clean.diagnostics.length === 0);
check('clean source: no internal errors', clean.internalErrors.length === 0);
check('clean source: the parsed model is returned', clean.model && clean.model.records.length === 2);

// ---- empty and odd input never throws --------------------------------------------------------
check('empty string', DdsDiagnostics.analyze('').diagnostics.length === 0);
check('null source', DdsDiagnostics.analyze(null).diagnostics.length === 0);
check('undefined source', DdsDiagnostics.analyze(undefined).diagnostics.length === 0);
check('blank lines only', DdsDiagnostics.analyze('\n\n   \n').diagnostics.length === 0);

// ---- a model guard (windowDependency): position, code, keyword, record ------------------------
const rmv = analyze([
  L({ nameType: 'R', name: 'REC1' }),
  L({ func: 'RMVWDW' }),
  field('F1', 2, 2),
]);
check('RMVWDW without WINDOW: one diagnostic', rmv.diagnostics.length === 1);
const d0 = rmv.diagnostics[0] || {};
check('  code', d0.code === 'isda.windowDependency');
check('  line 2, column 45, end column 51 (the keyword text)', d0.line === 2 && d0.column === 45 && d0.endColumn === 51);
check('  keyword and record', d0.keyword === 'RMVWDW' && d0.record === 'REC1');
check('  severity error, source iSDA', d0.severity === 'error' && d0.source === 'iSDA');
check('  message is the guard\'s own reason',
  d0.message === DspfWriter.windowDependencyNewConflictReason({ fileKeywords: [], records: [], comments: [], errors: [] }, rmv.model));

// ---- several violations in one guard are all reported, each at its own place ------------------
const multi = analyze([
  L({ nameType: 'R', name: 'REC1' }),
  L({ func: 'RMVWDW' }),
  field('F1', 2, 2),
  L({ nameType: 'R', name: 'REC2' }),
  field('F2', 3, 2),
  L({ nameType: 'R', name: 'REC3' }),
  L({ func: 'USRRSTDSP' }),
  field('F3', 4, 2),
]);
const wd = byCode(multi, 'isda.windowDependency');
check('two violations of one guard are both reported', wd.length === 2);
check('  at their own lines (2 and 7), in source order', wd.length === 2 && wd[0].line === 2 && wd[1].line === 7);
check('  with their own records', wd.length === 2 && wd[0].record === 'REC1' && wd[1].record === 'REC3');
check('  diagnostics are sorted by line', multi.diagnostics.every((d, i, a) => i === 0 || a[i - 1].line <= d.line));

// ---- record-keyword rules ---------------------------------------------------------------------
const usr = analyze([
  L({ nameType: 'R', name: 'REC3' }),
  L({ func: 'USRDFN' }),
  L({ func: 'ASSUME' }),
]);
const wl = byCode(usr, 'isda.usrdfnWhitelist');
check('USRDFN record: ASSUME is reported, USRDFN itself is not', wl.length === 1 && wl[0].keyword === 'ASSUME' && wl[0].line === 3);

const keep = analyze([
  L({ nameType: 'R', name: 'REC4' }),
  L({ func: 'KEEP' }),
  L({ func: 'ALWROL' }),
]);
const km = byCode(keep, 'isda.keepMutex');
check('KEEP with ALWROL: reported on each of the two keywords', km.length === 2 &&
  km.some((d) => d.keyword === 'KEEP' && d.line === 2) && km.some((d) => d.keyword === 'ALWROL' && d.line === 3));

check('a rule limited to its own keywords does not fire on others',
  analyze([L({ nameType: 'R', name: 'R1' }), L({ func: 'SFLNXTCHG' }), L({ func: 'TEXT(\'x\')' })])
    .diagnostics.filter((d) => d.code === 'isda.sflNxtchgSflMsgRcd').length === 0);
const sfl2 = analyze([L({ nameType: 'R', name: 'R1' }), L({ func: 'SFL' }), L({ func: 'SFLNXTCHG' }), L({ func: 'SFLMSGRCD(24)' })]);
check('SFLNXTCHG with SFLMSGRCD: reported', byCode(sfl2, 'isda.sflNxtchgSflMsgRcd').length >= 1);

// ---- file-level keyword located ----------------------------------------------------------------
const alt = analyze([
  L({ func: 'ALTHELP(CA01)' }),
  L({ func: 'CA01' }),
  L({ nameType: 'R', name: 'R1' }),
  field('F', 2, 2),
]);
const ak = byCode(alt, 'isda.altKeyFileExclusion');
check('file-level clash: reported on a file keyword, no record', ak.length === 1 && ak[0].record === null && ak[0].keyword === 'ALTHELP' && ak[0].line === 1);

const cmd = analyze([L({ func: 'CA03' }), L({ func: 'CF03' }), L({ nameType: 'R', name: 'R1' }), field('F', 2, 2)]);
check('CA03 with CF03 at file level is reported', byCode(cmd, 'isda.commandKeyNumber').length >= 1);

// ---- a field keyword located -------------------------------------------------------------------
const fieldLevel = DdsDiagnostics.analyze([
  L({ nameType: 'R', name: 'R1' }),
  field('F1', 2, 2),
  L({ name: 'F2', ref: 'R', func: 'REFFLD(F1)' }),
  L({ name: 'F3', length: 5, dataType: 'A', usage: 'B', line: 4, col: 2, func: 'DLTCHK' }),
].join('\n'));
const fieldHits = fieldLevel.diagnostics.filter((d) => d.record === 'R1' && d.keyword);
check('field-level violations (if any) carry the field\'s keyword and a line inside the record',
  fieldHits.every((d) => d.line >= 3));

// ---- positions with a keyword continued on the next line -----------------------------------------
const cont = analyze([
  L({ nameType: 'R', name: 'R1' }),
  L({ func: 'RMVWDW' }),
  L({ name: 'F', length: 5, dataType: 'A', usage: 'B', line: 2, col: 2, func: "TEXT('abc+" }),
  "     A                                      def')",
]);
check('a continued keyword elsewhere does not move the diagnostic', cont.diagnostics.length === 1 && cont.diagnostics[0].line === 2);

// ---- the keyword is found in the keyword area, not in the name that happens to match it -----------
const sameLine = analyze([L({ nameType: 'R', name: 'RMVWDW', func: 'RMVWDW' })]);
check('a record named like its keyword: the range is the keyword at column 45', sameLine.diagnostics.length === 1 &&
  sameLine.diagnostics[0].column === 45 && sameLine.diagnostics[0].endColumn === 51);

// ---- a conflict between two items is reported on the one the message is about --------------------------
const aliasText = [L({ nameType: 'R', name: 'R1' }), field('F1', 2, 2, 'ALIAS(AA)'), field('F2', 2, 2, 'ALIAS(AA)')];
const alias = analyze(aliasText);
check('duplicate ALIAS: one diagnostic, on field F2 (line 3), as its message says',
  alias.diagnostics.length === 1 && alias.diagnostics[0].line === 3 && /on field F2/.test(alias.diagnostics[0].message));
const aliasNamed = analyze([L({ nameType: 'R', name: 'R1' }), field('ALIAS', 2, 2, 'ALIAS(AA)'), field('F2', 2, 2, 'ALIAS(AA)')]);
check('  also when the other field is named like the keyword', aliasNamed.diagnostics.length === 1 && aliasNamed.diagnostics[0].line === 3);

// ---- a reason that is true of several records is reported at each of them, in source order ----------
const hlp = analyze([].concat(
  [L({ nameType: 'R', name: 'R1' }), L({ func: 'HLPRCD(R9)' })],
  [L({ nameType: 'R', name: 'R2' }), L({ func: 'HLPRCD(R9)' })],
  [L({ nameType: 'R', name: 'R3' }), L({ func: 'HLPRCD(R9)' })]));
const hr = byCode(hlp, 'isda.helpKeywordRelation');
check('HLPRCD on three records without HELP: three diagnostics', hr.length === 3);
check('  at lines 2, 4 and 6, on the HLPRCD keyword, in records R1, R2, R3', hr.length === 3 &&
  hr.map((d) => d.line).join() === '2,4,6' && hr.every((d) => d.keyword === 'HLPRCD') && hr.map((d) => d.record).join() === 'R1,R2,R3');

// ---- an offender that is a whole field or entry is pointed at by its name -----------------------------
const hspec = analyze([L({ nameType: 'R', name: 'R1' }), L({ nameType: 'H', name: 'H1', func: 'HLPARA(1 1 2 2)' })]);
check('a named H specification without HELP: the range is its name (columns 19-21)', hspec.diagnostics.length === 1 &&
  hspec.diagnostics[0].line === 2 && hspec.diagnostics[0].column === 19 && hspec.diagnostics[0].endColumn === 21 && hspec.diagnostics[0].keyword === null);
const hspecUnnamed = analyze([L({ nameType: 'R', name: 'R1' }), L({ nameType: 'H', func: 'HLPARA(1 1 2 2)' })]);
check('  an unnamed one: the whole line', hspecUnnamed.diagnostics.length === 1 && hspecUnnamed.diagnostics[0].line === 2 && hspecUnnamed.diagnostics[0].column === 1 && hspecUnnamed.diagnostics[0].endColumn > 40);

// ---- parser errors -----------------------------------------------------------------------------
const bad = analyze([field('F1', 2, 2), L({ nameType: 'R', name: 'R1' })]);
const pe = byCode(bad, DdsDiagnostics.PARSE_ERROR_CODE);
check('a field before any record format is a parse-error diagnostic', pe.length === 1 && pe[0].line === 1 && /before any record format/i.test(pe[0].message));
check('  whole line range', pe.length === 1 && pe[0].column === 1 && pe[0].endColumn > 1);

// ---- options --------------------------------------------------------------------------------------
const sev = analyze([L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' })], { severity: { 'isda.windowDependency': 'warning' } });
check('severity map changes the severity', sev.diagnostics.length === 1 && sev.diagnostics[0].severity === 'warning');
check('severity "off" drops the rule', analyze([L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' })], { severity: { 'isda.windowDependency': 'off' } }).diagnostics.length === 0);
check('disabled drops the rule', analyze([L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' })], { disabled: ['isda.windowDependency'] }).diagnostics.length === 0);
const parsed = DspfParser.parseDspf([L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' })].join('\n'));
const reused = DdsDiagnostics.analyze('', { model: parsed });
check('a model passed in is used instead of parsing the text', reused.diagnostics.length === 1 && reused.model === parsed);

// ---- LF and CRLF give the same answer ---------------------------------------------------------------
const lfText = multi.model ? [
  L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' }), field('F1', 2, 2),
].join('\n') : '';
const lf = DdsDiagnostics.analyze(lfText);
const crlf = DdsDiagnostics.analyze(lfText.replace(/\n/g, '\r\n'));
check('CRLF source gives identical diagnostics', JSON.stringify(lf.diagnostics) === JSON.stringify(crlf.diagnostics));

// ---- the removal search scales ---------------------------------------------------------------------
function bigSource(records, badAt) {
  const out = [];
  let line = 1;
  for (let i = 1; i <= records; i++) {
    out.push(L({ nameType: 'R', name: 'REC' + i }));
    if (i === badAt) out.push(L({ func: 'RMVWDW' }));
    for (let f = 1; f <= 6; f++) out.push(field('F' + i + '_' + f, ((line++ % 20) + 2), 2));
  }
  return out;
}
const bigLines = bigSource(700, 437);
let t0 = Date.now();
const big = analyze(bigLines);
const bigMs = Date.now() - t0;
check('700 records, one violation: found in the right record', big.diagnostics.length === 1 && big.diagnostics[0].record === 'REC437' && big.diagnostics[0].keyword === 'RMVWDW');
check('  the line is its own line in the source', big.diagnostics.length === 1 && /RMVWDW/.test(bigLines[big.diagnostics[0].line - 1]));
console.log('  info  - ' + bigLines.length + ' lines with one violation took ' + bigMs + ' ms');
check('  and it is fast (under 2 s)', bigMs < 2000);
t0 = Date.now();
const bigClean = analyze(bigSource(700, -1));
const cleanMs = Date.now() - t0;
console.log('  info  - ' + bigSource(700, -1).length + ' clean lines took ' + cleanMs + ' ms');
check('700 clean records: no diagnostics', bigClean.diagnostics.length === 0 && bigClean.internalErrors.length === 0);
check('  and fast (under 2 s)', cleanMs < 2000);
const bigMany = analyze(bigSource(300, -1).flatMap((l, i) => (/ REC\d+$/.test(l) && i % 7 === 0) ? [l, L({ func: 'RMVWDW' })] : [l]));
check('many violations in one guard are all found (and no cascade)', byCode(bigMany, 'isda.windowDependency').length === bigMany.diagnostics.length && bigMany.diagnostics.length > 20);

// ---- cross-record conflicts (no real guard has one yet, so a stand-in guard takes commandKeyRange's place) ---
// commandKeyRange runs over the whole model; a record-local guard (E1h) is never asked about two records at
// once, so the whole-model search is what these checks are about and the stand-in has to be a whole-model guard.
function withFakeGuard(fake, body) {
  const real = DspfWriter.commandKeyRangeNewConflictReason;
  DspfWriter.commandKeyRangeNewConflictReason = fake;
  try { return body(); } finally { DspfWriter.commandKeyRangeNewConflictReason = real; }
}
const recs = (model) => model.records;
const hasKw = (r, n) => (r.keywords || []).some((k) => k.name === n);
const pairSource = [].concat(
  [L({ nameType: 'R', name: 'RECA' }), L({ func: 'BYSTANDR' }), L({ func: 'TESTKW' })],
  [L({ nameType: 'R', name: 'RECB' }), L({ func: 'OTHER' })],
  [L({ nameType: 'R', name: 'RECC' }), L({ func: 'TESTKW' })]);
function pairGuard(text) {
  return (oldModel, newModel) => {
    const both = recs(newModel).filter((r) => hasKw(r, 'TESTKW'));
    return both.length >= 2 ? text : null;
  };
}
const aboutC = withFakeGuard(pairGuard('TESTKW on record RECC repeats the one on record RECA.'), () => analyze(pairSource));
const ac = byCode(aboutC, 'isda.commandKeyRange');
check('pair conflict across records, message about the later one: reported at RECC\'s keyword (line 7)',
  ac.length === 1 && ac[0].line === 7 && ac[0].record === 'RECC' && ac[0].keyword === 'TESTKW');
const aboutA = withFakeGuard(pairGuard('TESTKW on record RECA repeats the one on record RECC.'), () => analyze(pairSource));
const aa = byCode(aboutA, 'isda.commandKeyRange');
check('  message about the earlier one: reported at RECA\'s keyword (line 3, not its other keyword)', aa.length === 1 && aa[0].line === 3 && aa[0].record === 'RECA');
const bare = withFakeGuard(pairGuard('TESTKW is repeated: RECC and RECA both carry it.'), () => analyze(pairSource));
const bc = byCode(bare, 'isda.commandKeyRange');
check('  with no "record" before the names, the first one mentioned wins (RECC)', bc.length === 1 && bc[0].record === 'RECC' && bc[0].line === 7);
const neither = withFakeGuard(pairGuard('TESTKW is repeated.'), () => analyze(pairSource));
const nc = byCode(neither, 'isda.commandKeyRange');
check('  naming neither: the earlier record', nc.length === 1 && nc[0].record === 'RECA' && nc[0].line === 3);

const emptyRecordGuard = (oldModel, newModel) => {
  const r = recs(newModel).find((x) => !(x.keywords || []).length && !(x.fields || []).length);
  return r ? 'Record format ' + r.name + ' has nothing in it.' : null;
};
const empty = withFakeGuard(emptyRecordGuard, () => analyze([L({ nameType: 'R', name: 'FULL1' }), field('F1', 2, 2), L({ nameType: 'R', name: 'EMPTY1' })]));
const er = byCode(empty, 'isda.commandKeyRange');
check('an offender that is a whole record: its name, columns 19-25', er.length === 1 && er[0].line === 3 &&
  er[0].column === 19 && er[0].endColumn === 25 && er[0].keyword === null && er[0].record === 'EMPTY1');

// ---- a guard that throws is skipped and named ---------------------------------------------------------
const real = DspfWriter.retKeyNewConflictReason;
DspfWriter.retKeyNewConflictReason = function () { throw new Error('boom'); };
const thrown = analyze([L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' })]);
DspfWriter.retKeyNewConflictReason = real;
check('a throwing guard does not stop the others', thrown.diagnostics.length === 1);
check('  and is named in internalErrors', thrown.internalErrors.length === 1 && /retKeyNewConflictReason: boom/.test(thrown.internalErrors[0]));

// ---- coverage: every guard DspfWriter exports is registered or a named gap ----------------------------
const cov = DdsDiagnostics.coverage();
const exported = Object.keys(DspfWriter).filter((k) => /ConflictReason$/.test(k));
const registered = cov.model.concat(cov.recordKeyword);
check('every registered guard exists in DspfWriter', registered.every((n) => typeof DspfWriter[n] === 'function'));
check('no guard is registered twice', new Set(registered).size === registered.length);
check('the commitSourceChange chain is fully registered (25 model guards)', cov.model.length === 25 &&
  cov.model.every((n) => /NewConflictReason$/.test(n)));
const modelShaped = exported.filter((n) => DspfWriter[n].length === 2 && /^function\s*\w*\(\s*oldModel\s*,\s*newModel\s*\)/.test(DspfWriter[n].toString()));
check('every (oldModel, newModel) guard DspfWriter exports is registered',
  modelShaped.every((n) => cov.model.indexOf(n) >= 0) && modelShaped.length === cov.model.length);
const pending = exported.filter((n) => registered.indexOf(n) < 0);
console.log('  info  - ' + registered.length + ' of ' + exported.length + ' exported guards registered; ' + pending.length + ' have another signature and are not run yet');
check('registered + pending is every exported guard', registered.length + pending.length === exported.length);

process.exit(failureCount() === 0 ? 0 : 1);

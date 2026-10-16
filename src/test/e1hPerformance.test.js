/**
 * E1h - performance and tests of the diagnostics core: the incremental re-check (createAnalyzer in
 * src/ddsDiagnostics.js), its per-document use by the hub (src/diagnosticsHub.js), the latency budget
 * on 5,000 and 20,000 lines, and the no-vscode, jsdom-free promise of E1a.
 *
 * What is proved, and how:
 *   - which guards are asked about one record at a time (RECORD_LOCAL_CODES) and why the rest are not
 *     (a static check of the local guards' source, and the comparison below);
 *   - the per-record path gives the diagnostics the whole-model path gives (`reference: true`), on
 *     generated sources, except where a record conflicts with a FILE keyword, which it reports for every
 *     record and the reference only for the first;
 *   - an analyzer that remembers the last text gives what a fresh one gives after every edit of a long
 *     random run of edits (lines changed, inserted, deleted, records moved, copied, removed);
 *   - the work an edit costs is counted (records analysed and reused, guard calls, records handed to
 *     guards), not timed, so it cannot flake on a loaded machine; wall-clock ceilings are only loose
 *     guards against a real regression.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const DiagnosticsHub = require('../diagnosticsHub.js');
const DspfWriter = require('../dspfWriter.js');

const field = (name, line, col, func, length) => L({ name, length: length || 10, dataType: 'A', usage: 'B', line, col, func });
const analyze = (lines, options) => DdsDiagnostics.analyze(lines.join('\n'), options);
const key = (d) => [d.line, d.column, d.endColumn, d.severity, d.code, d.keyword, d.record, d.message].join('|');

// ---- no vscode, no DOM ------------------------------------------------------------------------------
// Checked in a process of its own: in the shared test worker the cache holds whatever earlier files loaded.
const childOut = require('child_process').execFileSync(process.execPath, ['-e',
  "require('./src/ddsDiagnostics.js'); require('./src/diagnosticsHub.js');" +
  "console.log(Object.keys(require.cache).filter(function (f) { return /[\\\\/]node_modules[\\\\/](vscode|jsdom)[\\\\/]/.test(f); }).length);"],
  { cwd: path.join(__dirname, '../..'), encoding: 'utf8' });
check('the diagnostics core and the hub load without vscode or jsdom (fresh process)', childOut.trim() === '0');
const coreSource = fs.readFileSync(path.join(__dirname, '../ddsDiagnostics.js'), 'utf8');
check('  ddsDiagnostics.js has no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(coreSource));

// ---- which guards run per record ---------------------------------------------------------------------
const scopes = DdsDiagnostics.scopes();
const EXPECTED_LOCAL = ['isda.windowDependency', 'isda.sflctlDependency', 'isda.outputControl', 'isda.multiLevelEligibility', 'isda.referenceField',
  'isda.initRetainReturn', 'isda.commandFunctionParameter', 'isda.retKey', 'isda.commandFunctionPairing', 'isda.optionIndicatorRequired'];
check('the record-local guards are the ten that were read and checked', scopes.record.slice().sort().join() === EXPECTED_LOCAL.slice().sort().join());
check('  every model guard is exactly one of record-local or whole-model',
  scopes.record.length + scopes.file.length === 25 && scopes.record.every((c) => scopes.file.indexOf(c) < 0));
check('  the whole-model ones include every guard that looks across records (so a new guard starts whole-model)',
  ['isda.fieldKind', 'isda.subfileKeyword', 'isda.subfileFoldDrop', 'isda.commandKeyNumber', 'isda.commandKeyRange', 'isda.systemValueKeyword',
    'isda.choiceMenuBar', 'isda.windowHelpMenu', 'isda.menuBarRecordRequired', 'isda.fileHelp', 'isda.helpSpec', 'isda.helpKeywordRelation', 'isda.scrbarReserved']
    .every((c) => scopes.file.indexOf(c) >= 0));

// A static canary on the source of the record-local guards: their violation functions must not hand the
// whole model to anything but recordDependencyViolations, nor read `model.records` more than once. Whoever
// changes one of them so it looks at another record fails here and has to re-read it (and move it out of
// RECORD_LOCAL_CODES if it does). It does not see state kept from one record to the next in a variable of
// the function: that part was read by eye, and the comparison with the whole-model run covers it.
const writerLines = fs.readFileSync(path.join(__dirname, '../dspfWriter.js'), 'utf8').split('\n');
function functionBody(name) {
  const start = writerLines.findIndex((l) => l.startsWith('  function ' + name + '('));
  if (start < 0) return null;
  let end = start + 1;
  while (end < writerLines.length && writerLines[end] !== '  }') end++;
  return writerLines.slice(start, end + 1).join('\n');
}
function crossRecordProblems(body) {
  const noComments = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const withoutAllowed = noComments
    .replace(/^\s*function \w+\(model\) \{/, '')
    .replace(/\(model && model\.records\) \|\| \[\]/g, '')
    .replace(/model && model\.fileKeywords/g, '')
    .replace(/recordDependencyViolations\(model,/g, '');
  const problems = [];
  if (/\bmodel\b/.test(withoutAllowed)) problems.push('uses `model` beyond its records and file keywords');
  if ((noComments.match(/model && model\.records/g) || []).length > 1) problems.push('reads model.records more than once');
  if (/\brecords\b\s*\./.test(noComments.replace(/model\.records/g, ''))) problems.push('works on a records list of its own');
  return problems;
}
const LOCAL_VIOLATIONS = {
  'isda.windowDependency': ['windowDependencyViolations', 'recordDependencyViolations'],
  'isda.sflctlDependency': ['sflctlDependencyViolations', 'recordDependencyViolations'],
  'isda.outputControl': ['outputControlViolations'],
  'isda.multiLevelEligibility': ['multiLevelEligibilityViolations'],
  'isda.referenceField': ['referenceFieldViolations'],
  'isda.initRetainReturn': ['initRetainReturnViolations'],
  'isda.commandFunctionParameter': ['commandFunctionParameterViolations'],
  'isda.retKey': ['retKeyViolations'],
  'isda.commandFunctionPairing': ['commandFunctionPairingViolations'],
  'isda.optionIndicatorRequired': ['displaySizeConditionsOnRequiredIndicatorKeywords'],
};
check('every record-local guard has its violation function listed here', EXPECTED_LOCAL.every((c) => LOCAL_VIOLATIONS[c]));
Object.keys(LOCAL_VIOLATIONS).forEach((code) => {
  LOCAL_VIOLATIONS[code].forEach((fn) => {
    const body = functionBody(fn);
    const problems = body ? crossRecordProblems(body) : ['not found in dspfWriter.js'];
    check('  ' + code + ': ' + fn + ' looks at one record and the file keywords only' + (problems.length ? ' (' + problems.join('; ') + ')' : ''), problems.length === 0);
  });
});
// The check has teeth: guards that do look across records fail it.
['subfileKeywordViolations', 'subfileFoldDropViolations', 'fieldKindViolations', 'choiceMenuBarViolations', 'windowHelpMenuViolations',
  'menuBarRecordRequiredViolations', 'fileHelpViolations', 'helpSpecViolations', 'helpKeywordRelationViolations'].forEach((fn) => {
  const body = functionBody(fn);
  check('  canary power: ' + fn + ' is flagged as looking across records', !!body && crossRecordProblems(body).length > 0);
});

// ---- generated sources ------------------------------------------------------------------------------------
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8'));
const KEYWORDS = Object.keys(lookup.keywords).filter((k) => !k.startsWith('*'));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** A source made of keywords picked at random from the whole index, at file, record and field level; most of
 *  it is invalid, which is the point: every guard has something to say. */
function soup(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const nrec = 1 + Math.floor(r() * 10);
  const params = () => pick(['', '', '(1)', '(&F1)', '(*YES)', '(1 2 3 4)', '(CA03)', "('text')", '(*NONE)', '(24 80 *DS3)',
    '(REC' + (1 + Math.floor(r() * nrec)) + ')', '(1 1 5 20)', '(F1)']);
  const kw = () => pick(KEYWORDS) + params();
  const out = [];
  const nfile = Math.floor(r() * 4);
  for (let i = 0; i < nfile; i++) out.push(L({ func: kw() }));
  for (let i = 1; i <= nrec; i++) {
    out.push(L({ nameType: 'R', name: r() < 0.1 ? 'REC1' : 'REC' + i }));
    const nk = Math.floor(r() * 4);
    for (let k = 0; k < nk; k++) out.push(L({ func: kw() }));
    const nf = Math.floor(r() * 5);
    for (let f = 0; f < nf; f++) {
      out.push(L({ name: 'F' + (1 + Math.floor(r() * 3)), length: pick([5, 10, 1]), dataType: pick(['A', 'S', 'P', 'A']), decimals: pick(['', 0, 2]),
        usage: pick(['B', 'O', 'I', 'H', 'M', 'P']), line: 2 + Math.floor(r() * 20), col: 2 + Math.floor(r() * 60), func: r() < 0.5 ? kw() : '' }));
      if (r() < 0.3) out.push(L({ func: kw() }));
    }
  }
  return out;
}

// ---- the per-record path gives what the whole-model path gives ---------------------------------------------
{
  let withDiagnostics = 0;
  let fileSideExtras = 0;
  let mismatches = 0;
  let firstMismatch = '';
  const SEEDS = 500;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const text = soup(seed).join('\n');
    const now = DdsDiagnostics.analyze(text);
    const ref = DdsDiagnostics.analyze(text, { reference: true });
    if (ref.diagnostics.length) withDiagnostics++;
    const inRecord = (r) => r.diagnostics.filter((d) => d.record !== null).map(key).sort().join('\n');
    const onFile = (r) => r.diagnostics.filter((d) => d.record === null).map(key);
    const refFile = onFile(ref);
    const nowFile = onFile(now);
    const extras = nowFile.filter((k) => refFile.indexOf(k) < 0);
    const missing = refFile.filter((k) => nowFile.indexOf(k) < 0);
    // A diagnostic on a file keyword that the reference lacks is a record-local guard naming a record that
    // conflicts with it, for a record after the first (the reference takes the keyword out once it has
    // reported it).
    const extrasAreRecordLocal = extras.every((k) => scopes.record.indexOf(k.split('|')[4]) >= 0);
    fileSideExtras += extras.length;
    if (inRecord(now) !== inRecord(ref) || missing.length || !extrasAreRecordLocal) {
      mismatches++;
      if (!firstMismatch) firstMismatch = 'seed ' + seed;
    }
  }
  console.log('  info  - ' + SEEDS + ' generated sources, ' + withDiagnostics + ' with diagnostics; ' + fileSideExtras + ' extra file-keyword diagnostics from records after the first');
  check('per record == whole model on ' + SEEDS + ' generated sources (record diagnostics identical, file ones a superset)' + (firstMismatch ? ' - first difference: ' + firstMismatch : ''), mismatches === 0);
  check('  and most of the sources had something to report (the comparison is not empty)', withDiagnostics > SEEDS * 0.8);
}

// Shapes the generated sources do not reach.
{
  const cross = [L({ nameType: 'R', name: 'WA' }), L({ func: 'WINDOW(2 5 10 20)' }),
    L({ nameType: 'R', name: 'WB' }), L({ func: 'WINDOW(WA)' }), field('F1', 2, 2, 'CNTFLD(30)', 90)];
  const pairing = [L({ nameType: 'R', name: 'R1' }), L({ func: 'PAGEDOWN' }), L({ func: 'ROLLUP' }),
    L({ nameType: 'R', name: 'R2' }), L({ func: 'SFLCTL(R3)' }),
    L({ nameType: 'R', name: 'R3' }), L({ func: 'SFL' }), L({ func: 'SFLDLT', sizeCondition: '*DS3' })];
  const fileAndRecord = [L({ func: 'INVITE' }), L({ nameType: 'R', name: 'R1' }), L({ func: 'INVITE' }), L({ nameType: 'R', name: 'R2' }), L({ func: 'INVITE' })];
  [['a WINDOW(record) width borrowed from another record', cross, 'isda.fieldKind'],
    ['PAGEDOWN with ROLLUP, and a display size on SFLDLT', pairing, 'isda.commandFunctionPairing'],
    ['SFLDLT with a display size name', pairing, 'isda.optionIndicatorRequired']].forEach(([label, lines, code]) => {
    const now = analyze(lines);
    const ref = analyze(lines, { reference: true });
    check(label + ': per record == whole model, and ' + code + ' is reported',
      now.diagnostics.map(key).join('\n') === ref.diagnostics.map(key).join('\n') && now.diagnostics.some((d) => d.code === code));
  });
  const fr = analyze(fileAndRecord);
  const frRef = analyze(fileAndRecord, { reference: true });
  const invite = (r) => r.diagnostics.filter((d) => d.code === 'isda.commandFunctionPairing');
  check('INVITE at both levels: the reference names the first record only, the per-record path every record',
    invite(frRef).length === 1 && invite(fr).length === 2 && invite(fr).every((d) => d.line === 1 && d.keyword === 'INVITE'));

  // The comparison has teeth: running a guard that borrows from another record per record loses a violation.
  const wrong = analyze(cross, { recordLocal: scopes.record.concat(['isda.fieldKind']) });
  check('power: fieldKind wrongly run per record misses the borrowed-width violation the whole-model run finds',
    analyze(cross, { reference: true }).diagnostics.some((d) => d.code === 'isda.fieldKind') && !wrong.diagnostics.some((d) => d.code === 'isda.fieldKind'));
}

// ---- an analyzer that remembers == a fresh one, after every edit --------------------------------------------
{
  let comparisons = 0;
  let different = 0;
  let firstDifferent = '';
  const modes = {};
  let reused = 0;
  let total = 0;
  const SEQUENCES = 30;
  const EDITS = 25;
  for (let sq = 1; sq <= SEQUENCES; sq++) {
    const r = rng(9000 + sq);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const lines = soup(sq * 7);
    const analyzer = DdsDiagnostics.createAnalyzer();
    const starts = () => lines.map((l, i) => (/^.{16}R /.test(l) ? i : -1)).filter((i) => i >= 0);
    const kwLine = () => L({ func: pick(KEYWORDS) + pick(['', '(1)', '(&F1)', '(REC2)', '(*YES)', '(CA03)']) });
    for (let e = 0; e <= EDITS; e++) {
      if (e > 0) {
        const op = Math.floor(r() * 9);
        const at = Math.floor(r() * lines.length);
        const rs = starts();
        const end = (i) => (i + 1 < rs.length ? rs[i + 1] : lines.length);
        if (op === 0) lines[at] = kwLine();
        else if (op === 1 && lines.length > 3) lines.splice(at, 1);
        else if (op === 2) lines.splice(at, 0, kwLine());
        else if (op === 3 && rs.length) { const i = Math.floor(r() * rs.length); lines.splice(end(i), 0, ...lines.slice(rs[i], end(i))); } // copy a record
        else if (op === 4 && rs.length > 1) { const i = Math.floor(r() * rs.length); lines.splice(rs[i], end(i) - rs[i]); } // remove a record
        else if (op === 5 && rs.length > 1) { // swap two neighbouring records
          const i = Math.floor(r() * (rs.length - 1));
          const a0 = rs[i];
          const a1 = rs[i + 1];
          const a2 = end(i + 1);
          const first = lines.slice(a0, a1);
          const second = lines.slice(a1, a2);
          lines.splice(a0, a2 - a0, ...second, ...first);
        } else if (op === 6) lines.splice(0, 0, kwLine()); // above everything: the file keywords change and every record moves
        else if (op === 7 && rs.length) lines.splice(rs[Math.floor(r() * rs.length)], 0, L({ comment: 'inserted comment' })); // moves what is below it, changes nothing
        // op 8: the same text again
      }
      const text = lines.join('\n');
      const remembered = analyzer.analyze(text);
      const fresh = DdsDiagnostics.analyze(text);
      comparisons++;
      modes[remembered.stats.mode] = (modes[remembered.stats.mode] || 0) + 1;
      reused += remembered.stats.recordsReused;
      total += remembered.stats.records;
      if (remembered.diagnostics.map(key).join('\n') !== fresh.diagnostics.map(key).join('\n') ||
        JSON.stringify(remembered.internalErrors) !== JSON.stringify(fresh.internalErrors)) {
        different++;
        if (!firstDifferent) firstDifferent = 'sequence ' + sq + ', edit ' + e;
      }
    }
  }
  console.log('  info  - ' + comparisons + ' comparisons; modes ' + JSON.stringify(modes) + '; ' + Math.round((100 * reused) / total) + '% of the records were answered from the last run');
  check('remembered == fresh after each of ' + comparisons + ' edits' + (firstDifferent ? ' - first difference: ' + firstDifferent : ''), different === 0);
  check('  the run really used the memory (some runs reused records, some were the same text, some started cold)',
    modes.incremental > 50 && modes['same-text'] > 5 && modes.cold > 5 && reused > 0);
}

// ---- what an edit reuses, and what it does not --------------------------------------------------------------
{
  const base = [
    L({ func: 'DSPSIZ(24 80 *DS3)' }),
    L({ nameType: 'R', name: 'REC1' }), field('F1', 2, 2),
    L({ nameType: 'R', name: 'REC2' }), L({ func: 'RMVWDW' }), field('F2', 3, 2),
    L({ nameType: 'R', name: 'REC3' }), field('F3', 4, 2),
    L({ nameType: 'R', name: 'REC4' }), L({ func: 'RMVWDW' }), field('F4', 5, 2),
  ];
  const an = DdsDiagnostics.createAnalyzer();
  const first = an.analyze(base.join('\n'));
  check('first run is cold: every record analysed, parsed once', first.stats.mode === 'cold' && first.stats.recordsAnalyzed === 4 && first.stats.recordsReused === 0 && first.stats.parsed);
  check('  two violations found, at lines 5 and 10', first.diagnostics.length === 2 && first.diagnostics.map((d) => d.line).join() === '5,10');

  const same = an.analyze(base.join('\n'), { severity: { 'isda.windowDependency': 'warning' } });
  check('the same text again (a setting changed): nothing parsed, no guard asked, the new severity applied',
    same.stats.mode === 'same-text' && !same.stats.parsed && same.stats.guardCalls === 0 && same.diagnostics.length === 2 && same.diagnostics.every((d) => d.severity === 'warning'));
  const off = an.analyze(base.join('\n'), { severity: { 'isda.windowDependency': 'off' } });
  check('  a rule switched off: gone, still without asking a guard', off.stats.guardCalls === 0 && off.diagnostics.length === 0);

  const edited = base.slice();
  edited[2] = field('FEDIT', 2, 2);
  const one = an.analyze(edited.join('\n'));
  check('one field edited in REC1: one record analysed, three reused', one.stats.mode === 'incremental' && one.stats.recordsAnalyzed === 1 && one.stats.recordsReused === 3);
  check('  the violations of the untouched records are still there, at the same lines', one.diagnostics.map((d) => d.line).join() === '5,10');

  const shifted = edited.slice();
  shifted.splice(3, 0, L({ comment: 'a comment' })); // inside REC1's lines: REC2..REC4 move down by one
  const moved = an.analyze(shifted.join('\n'));
  check('a line added above three records: they are reused, not analysed again', moved.stats.recordsAnalyzed === 1 && moved.stats.recordsReused === 3);
  check('  and their diagnostics moved down by one line', moved.diagnostics.map((d) => d.line).join() === '6,11');
  check('  the same as a fresh analysis', moved.diagnostics.map(key).join('\n') === analyze(shifted).diagnostics.map(key).join('\n'));

  const fileEdited = shifted.slice();
  fileEdited[0] = L({ func: 'DSPSIZ(27 132 *DS4)' });
  const fileChange = an.analyze(fileEdited.join('\n'));
  check('a file keyword edited: every record is asked again (a record answer can depend on it)', fileChange.stats.mode === 'cold' && fileChange.stats.recordsReused === 0);

  const removed = fileEdited.filter((_, i) => i < 4 || i > 5); // REC2's RMVWDW line goes
  const fixed = an.analyze(removed.join('\n'));
  check('a violation fixed: only that record analysed, its diagnostic is gone', fixed.stats.recordsAnalyzed === 1 && fixed.diagnostics.length === 1);

  // A conflict between a record and a file keyword depends on the file keyword.
  const withInvite = [L({ func: 'INVITE' }), L({ nameType: 'R', name: 'R1' }), L({ func: 'INVITE' }), field('F1', 2, 2), L({ nameType: 'R', name: 'R2' }), field('F2', 3, 2)];
  const an2 = DdsDiagnostics.createAnalyzer();
  const conflict = an2.analyze(withInvite.join('\n'));
  check('INVITE at file and record level: reported on the file keyword (line 1)', conflict.diagnostics.length === 1 && conflict.diagnostics[0].line === 1 && conflict.diagnostics[0].code === 'isda.commandFunctionPairing');
  const noFileInvite = withInvite.slice(1);
  check('  the file keyword removed: the cached record answer is dropped, the diagnostic is gone',
    an2.analyze(noFileInvite.join('\n')).diagnostics.length === 0);
  const back = an2.analyze(withInvite.join('\n'));
  check('  put back: reported again', back.diagnostics.length === 1);
  // The record with the INVITE moves down because a line is added in a record above it; its own text is
  // unchanged, so its answer is reused, and the diagnostic on the file keyword must not move with it.
  const lead = [L({ func: 'INVITE' }), L({ nameType: 'R', name: 'R0' }), field('F0', 2, 2), L({ nameType: 'R', name: 'R1' }), L({ func: 'INVITE' }), field('F1', 3, 2)];
  const an3 = DdsDiagnostics.createAnalyzer();
  an3.analyze(lead.join('\n'));
  const movedLead = lead.slice();
  movedLead.splice(3, 0, L({ comment: 'in the record above' }));
  const keepLine = an3.analyze(movedLead.join('\n'));
  check('  the record moved by a line added above it: reused, and the diagnostic stays on the file keyword at line 1',
    keepLine.stats.recordsReused === 1 && keepLine.diagnostics.length === 1 && keepLine.diagnostics[0].line === 1);

  // The same record twice is analysed once and reported at each place.
  const twin = [L({ nameType: 'R', name: 'TWIN' }), L({ func: 'RMVWDW' }), L({ nameType: 'R', name: 'TWIN' }), L({ func: 'RMVWDW' })];
  const tw = DdsDiagnostics.createAnalyzer().analyze(twin.join('\n'));
  check('two identical records: analysed once, reported twice, at their own lines', tw.stats.recordsAnalyzed === 1 && tw.diagnostics.map((d) => d.line).join() === '2,4');

  // reset() forgets.
  an.reset();
  check('reset() forgets: the next run is cold', an.analyze(base.join('\n')).stats.mode === 'cold');

  // A model passed in is used as it is and never remembered.
  const model = DdsDiagnostics.analyze(base.join('\n')).model;
  const withModel = an.analyze('', { model });
  check('a model passed in is analysed whole and does not touch the memory', withModel.stats.mode === 'reference' && withModel.diagnostics.length === 2);
}

// ---- the latency budget -------------------------------------------------------------------------------------
function bigSource(targetLines, violations) {
  const records = Math.round(targetLines / 7);
  const bad = new Set();
  for (let i = 0; i < violations; i++) bad.add(Math.floor(((i + 0.5) * records) / Math.max(violations, 1)) + 1);
  const out = [];
  let n = 1;
  for (let i = 1; i <= records; i++) {
    out.push(L({ nameType: 'R', name: 'REC' + i }));
    if (bad.has(i)) out.push(L({ func: 'RMVWDW' }));
    for (let f = 1; f <= 6; f++) out.push(field('F' + i + '_' + f, (n++ % 20) + 2, 2));
  }
  return out;
}
const timed = (fn) => { const t = process.hrtime.bigint(); const r = fn(); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
const GLOBAL = scopes.file.length;
const LOCAL = scopes.record.length;
[[5000, 1000, 2000], [20000, 2000, 4000]].forEach(([target, editCeiling, coldCeiling]) => {
  const lines = bigSource(target, 0);
  const text = lines.join('\n');
  const an = DdsDiagnostics.createAnalyzer();
  const [coldMs, cold] = timed(() => an.analyze(text));
  const n = cold.stats.records;
  check(target + ' lines (' + lines.length + ', ' + n + ' records): clean, cold run asks each guard once over all records',
    cold.diagnostics.length === 0 && cold.stats.recordWork === (GLOBAL + LOCAL) * n && cold.stats.guardCalls === GLOBAL + LOCAL + LOCAL);
  const edited = lines.slice();
  let mid = Math.floor(lines.length / 2);
  while (/^.{16}R /.test(lines[mid])) mid++; // a field line, not a record line
  edited[mid] = field('EDITED', 5, 5);
  const [editMs, edit] = timed(() => an.analyze(edited.join('\n')));
  console.log('  info  - ' + lines.length + ' lines: cold ' + Math.round(coldMs) + ' ms, one-line edit ' + Math.round(editMs) + ' ms (' + edit.stats.recordsAnalyzed + ' record analysed, ' + edit.stats.recordsReused + ' reused)');
  check('  one line edited: one record analysed, the others reused', edit.stats.recordsAnalyzed === 1 && edit.stats.recordsReused === n - 1);
  check('  its work is the whole-model guards over all records plus one record for the per-record ones',
    edit.stats.recordWork === GLOBAL * n + LOCAL && edit.stats.recordWork < cold.stats.recordWork);
  check('  latency: the edit under ' + editCeiling + ' ms, the cold run under ' + coldCeiling + ' ms (loose ceilings)', editMs < editCeiling && coldMs < coldCeiling);
});
{
  const lines = bigSource(20000, 200);
  const text = lines.join('\n');
  const an = DdsDiagnostics.createAnalyzer();
  const [coldMs, cold] = timed(() => an.analyze(text));
  const [refMs, ref] = timed(() => DdsDiagnostics.analyze(text, { reference: true }));
  const edited = lines.slice();
  const at = lines.findIndex((l) => /RMVWDW/.test(l));
  edited[at] = field('EDITED', 5, 5); // the violating keyword line itself goes: that record is clean now
  const [editMs, edit] = timed(() => an.analyze(edited.join('\n')));
  console.log('  info  - 20,000 lines, 200 violations: whole-model ' + Math.round(refMs) + ' ms, cold ' + Math.round(coldMs) + ' ms, edit ' + Math.round(editMs) + ' ms; guard calls ' + ref.stats.guardCalls + ' / ' + cold.stats.guardCalls + ' / ' + edit.stats.guardCalls);
  check('20,000 lines with 200 violations: all found, the same as the whole-model run', cold.diagnostics.length === 200 && cold.diagnostics.map(key).join('\n') === ref.diagnostics.map(key).join('\n'));
  console.log('  info  - records handed to guards: whole-model ' + ref.stats.recordWork + ', cold ' + cold.stats.recordWork + ', edit ' + edit.stats.recordWork);
  check('  locating them hands the guards a small fraction of the records the whole-model search does (under a twentieth)', cold.stats.recordWork * 20 < ref.stats.recordWork);
  check('  an edit that fixes one violating record asks a few dozen guard calls, not a search per violation', edit.stats.guardCalls <= 80 && edit.diagnostics.length === 199 && edit.stats.recordsAnalyzed === 1);
  check('  latency: the edit under 2000 ms (loose ceiling)', editMs < 2000);
}

// ---- the hub keeps one analyzer per document -------------------------------------------------------------
{
  class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
  class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
  const emitter = () => { const hs = []; const sub = (fn) => { hs.push(fn); return { dispose() { hs.splice(hs.indexOf(fn), 1); } }; }; sub.fire = (e) => hs.slice().forEach((h) => h(e)); return sub; };
  const api = {
    Range, Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    languages: { createDiagnosticCollection: () => { const m = new Map(); return { set: (u, l) => m.set(u.toString(), l), delete: (u) => m.delete(u.toString()), get: (u) => m.get(u.toString()), dispose() {} }; } },
    workspace: { textDocuments: [], onDidOpenTextDocument: emitter(), onDidChangeTextDocument: emitter(), onDidCloseTextDocument: emitter(), onDidChangeConfiguration: emitter() },
  };
  const made = [];
  const calls = [];
  let timer = null;
  const settings = { enable: true, severity: {} };
  const hub = DiagnosticsHub.createHub(api, {
    shouldAnalyze: () => true,
    getSettings: () => settings,
    schedule: (fn) => { timer = fn; return 1; },
    cancel: () => { timer = null; },
    createAnalyzer: () => {
      const real = DdsDiagnostics.createAnalyzer();
      const spy = { analyze: (t, o) => { const r = real.analyze(t, o); calls.push(r.stats); return r; } };
      made.push(spy);
      return spy;
    },
  });
  hub.start();
  const text = (extra) => [L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' }), field('F1', 2, 2)].concat(extra || [L({ nameType: 'R', name: 'REC2' }), field('F2', 3, 2)]).join('\n');
  const d = { uri: { toString: () => 'file:///a.dspf' }, isClosed: false, text: text(), getText() { return this.text; } };
  api.workspace.textDocuments = [d];
  api.workspace.onDidOpenTextDocument.fire(d);
  check('hub: opening a document creates its analyzer and publishes', made.length === 1 && calls.length === 1 && calls[0].mode === 'cold');
  d.text = text([L({ nameType: 'R', name: 'REC2' }), field('F2', 3, 2), field('F3', 4, 2)]);
  api.workspace.onDidChangeTextDocument.fire({ document: d });
  timer();
  check('hub: an edit goes to the same analyzer, which reuses the untouched record', made.length === 1 && calls.length === 2 && calls[1].mode === 'incremental' && calls[1].recordsReused === 1);
  api.workspace.onDidCloseTextDocument.fire(d);
  d.isClosed = false;
  api.workspace.onDidOpenTextDocument.fire(d);
  check('hub: closing drops the analyzer, reopening starts cold with a new one', made.length === 2 && calls[2].mode === 'cold');
  settings.enable = false;
  api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
  settings.enable = true;
  api.workspace.onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
  check('hub: switching the feature off drops it, back on starts cold with a new one', made.length === 3 && calls[calls.length - 1].mode === 'cold');
  hub.dispose();
}

process.exit(failureCount() === 0 ? 0 : 1);

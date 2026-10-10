/**
 * parity.js - does `run.js --shared` behave exactly like the isolated runner? (E7j)
 *
 * Runs the same files twice, once with one process per file and once in the shared worker, and compares
 * what each file reported: its ok count, its failed count and whether it passed. Any difference means a
 * file leaks state the worker does not reset (see sharedWorker.js); fix the file, or mark it with
 * `// @isda-test: isolate` in its first lines so shared mode gives it a process of its own.
 *
 *   node src/test/parity.js                 the whole suite (both modes, so about twice a normal run)
 *   node src/test/parity.js i68 menuWeb     only files whose name contains an argument
 *   node src/test/parity.js --dir <path>    take the files from <path> (the parity script's own tests)
 *
 * Exit code: 0 when every file matches, 1 when any differs or a run failed to produce a report.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const run = path.join(__dirname, 'run.js');
const root = path.join(__dirname, '..', '..');
// The runs start in the repository root, so a --dir given relative to where this was started is made absolute.
const passThrough = process.argv.slice(2).map((a, i, all) => (all[i - 1] === '--dir' ? path.resolve(a) : a));

function runMode(extraArgs) {
  const log = path.join(os.tmpdir(), 'isda-parity-' + process.pid + '-' + extraArgs.length + '.log');
  const fd = fs.openSync(log, 'w');
  const r = spawnSync(process.execPath, [run, ...extraArgs, ...passThrough], { cwd: root, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  const out = fs.readFileSync(log, 'utf8');
  fs.unlinkSync(log);
  return { out, status: r.status === null ? -1 : r.status };
}

/** file -> { ok, failed, pass } from the runner's own report lines. */
function parse(out) {
  const files = new Map();
  for (const m of out.matchAll(/^--- (\S+\.test\.js): (\d+) ok, (\d+) failed, [0-9.]+ s$/gm)) {
    files.set(m[1], { ok: +m[2], failed: +m[3], pass: true });
  }
  for (const m of out.matchAll(/^\*\*\* (\S+\.test\.js) FAILED \(exit (-?\d+), /gm)) {
    if (files.has(m[1])) files.get(m[1]).pass = false;
  }
  return files;
}

const isolated = runMode([]);
const shared = runMode(['--shared']);
const a = parse(isolated.out);
const b = parse(shared.out);

const names = Array.from(new Set([...a.keys(), ...b.keys()])).sort();
const differences = [];
const describe = (x) => (x ? x.ok + ' ok, ' + x.failed + ' failed, ' + (x.pass ? 'passed' : 'FAILED') : 'no report');
for (const f of names) {
  const x = a.get(f);
  const y = b.get(f);
  if (!x || !y || x.ok !== y.ok || x.failed !== y.failed || x.pass !== y.pass) differences.push({ f, x, y });
}

console.log('Parity: ' + names.length + ' file(s) compared, one process per file against the shared worker.');
if (names.length === 0) {
  console.log('No files were reported by the isolated run; nothing to compare.');
  process.exit(1);
}
for (const d of differences) {
  console.log('DIFF  ' + d.f + '\n        isolated: ' + describe(d.x) + '\n        shared:   ' + describe(d.y));
}
if (differences.length === 0) {
  console.log('PARITY OK: every file reported the same counts and result in both modes.');
  process.exit(0);
}
console.log('\nPARITY FAILED: ' + differences.length + ' file(s) differ. Fix the leak, or add `// @isda-test: isolate` to the file.');
process.exit(1);

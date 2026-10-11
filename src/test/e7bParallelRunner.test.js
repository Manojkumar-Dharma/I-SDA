/**
 * e7bParallelRunner.test.js - E7b (docs/sda-reference/FEATURE-ROADMAP.md): `node src/test/run.js --isolate --jobs N`
 * runs up to N files at once, one process each. The fixtures sleep, so the overlap shows even on a one-core
 * machine. What has to hold: output blocks stay whole and in file order, the summary and exit code do not depend
 * on N, a failing file is still reported and fails the run, files that write the same name in the temp directory
 * cannot meet, and --jobs is validated.
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { check, failureCount } = require('./helpers/harness');

const root = path.join(__dirname, '..', '..');
const fx = (name) => path.join(__dirname, 'fixtures', name);

function runner(args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), ...args], { cwd: root, encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status, secs: (Date.now() - t0) / 1000 };
}
// What a run says apart from timings.
const stable = (out) => out
  .replace(/, \d+\.\d s$/gm, ', T s')
  .replace(/^Wall time: .*$/m, 'Wall time: T')
  .replace(/^Slowest: .*$/m, 'Slowest: T')
  .replace(/^Jobs: .*\n/m, '');

// 1. Four 0.8 s files: sequential, then four at once.
const seq = runner(['--isolate', '--jobs', '1', '--dir', fx('runner-jobs')]);
const par = runner(['--isolate', '--jobs', '4', '--dir', fx('runner-jobs')]);
check('sequential run passes, 12 checks', seq.status === 0 && /Files: 4 {3}checks passed: 12 {3}checks failed: 0/.test(seq.out));
check('parallel run passes, 12 checks', par.status === 0 && /Files: 4 {3}checks passed: 12 {3}checks failed: 0/.test(par.out));
check('four jobs take clearly less time than one (overlap, not luck)', par.secs < seq.secs * 0.7);
check('the summary names the jobs when more than one runs', /^Jobs: 4 files at once, one process each$/m.test(par.out) && !/^Jobs:/m.test(seq.out));
check('output blocks are in file order, whole, and identical to the sequential run apart from timings', stable(par.out) === stable(seq.out));
check('every file found its own temp file (private TMPDIR per slot)', !/temp file was overwritten/.test(par.out) && (par.out.match(/temp file is its own/g) || []).length === 4);

// 2. A failing file among passing ones.
const fp = runner(['--isolate', '--jobs', '3', '--dir', fx('runner-jobs-fail')]);
const fs1 = runner(['--isolate', '--jobs', '1', '--dir', fx('runner-jobs-fail')]);
check('a failing file fails the run with exit 1, in parallel', fp.status === 1);
check('it is reported with its exit code and failing check', /\*\*\* f2Fails\.test\.js FAILED \(exit 1, 1 failing check\(s\)\) \*\*\*/.test(fp.out) && /FAILED FILES \(1\):/.test(fp.out));
check('the files after it still ran', /--- f3Sleep\.test\.js: 1 ok, 0 failed/.test(fp.out));
check('the parallel and sequential reports match apart from timings', stable(fp.out) === stable(fs1.out));

// 3. Validation and shared mode.
let r = runner(['--isolate', '--jobs', '0', '--dir', fx('runner-jobs')]);
check('--jobs 0 is refused with exit 2', r.status === 2 && /--jobs needs a whole number of at least 1/.test(r.out));
r = runner(['--isolate', '--jobs', 'many', '--dir', fx('runner-jobs')]);
check('--jobs with a word is refused with exit 2', r.status === 2);
r = runner(['--shared', '--jobs', '4', '--dir', fx('runner-recycle')]);
check('shared mode runs as before and says --jobs has no effect', r.status === 0 && /--jobs 4 has no effect in shared mode/.test(r.out) && /Shared workers: 1 started/.test(r.out) && !/^Jobs:/m.test(r.out));

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * e7mPoolIntegration.test.js - E7m (docs/sda-reference/FEATURE-ROADMAP.md): `--jobs N` in shared mode runs up to N
 * shared workers at once, one per pool slot. What has to hold: files overlap, output blocks stay whole and in file
 * order and match the one-worker run apart from pids and timings, each slot has its own temp directory, each worker
 * is recycled by E7k's rules on its own count, a file with the isolate marker takes a slot and runs in a process of
 * its own, a worker that dies fails only its current file, and `--jobs 1` is the single worker as before. The
 * overlap is proved by a barrier fixture (files that wait for each other), not by the clock, so a loaded one-core
 * machine cannot make it flaky.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { check, failureCount } = require('./helpers/harness');

const root = path.join(__dirname, '..', '..');
const fx = (name) => path.join(__dirname, 'fixtures', name);

function runner(args, env) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), ...args], { cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
  const out = (r.stdout || '') + (r.stderr || '');
  const pids = Array.from(out.matchAll(/^ {2}ok {2}- pid:(\d+)$/gm)).map((m) => m[1]);
  const stats = (out.match(/^Shared workers: (\d+) started \(replaced: (\d+) after (\d+) files, (\d+) at (\d+) MB, (\d+) after a crash\)$/m) || []).slice(1).map(Number);
  return { out, status: r.status, pids, stats, secs: (Date.now() - t0) / 1000 };
}
// What a run says apart from timings, pids and the jobs line.
const stable = (out) => out
  .replace(/, \d+\.\d s$/gm, ', T s')
  .replace(/pid:\d+/g, 'pid:P')
  .replace(/^Wall time: .*$/m, 'Wall time: T')
  .replace(/^Slowest: .*$/m, 'Slowest: T')
  .replace(/^Jobs: .*\n/m, '')
  .replace(/^Shared workers: .*\n/m, '');
const blocks = (out) => Array.from(out.matchAll(/^=== (\S+) ===$/gm)).map((m) => m[1]);

// 1. Six 0.5 s files: one worker, then three workers.
const one = runner(['--shared', '--jobs', '1', '--dir', fx('runner-pool')]);
const three = runner(['--shared', '--jobs', '3', '--dir', fx('runner-pool')]);
check('one job: six files pass in one worker', one.status === 0 && one.pids.length === 6 && new Set(one.pids).size === 1 && one.stats[0] === 1);
check('three jobs: six files pass, 12 checks', three.status === 0 && /Files: 6 {3}checks passed: 12 {3}checks failed: 0/.test(three.out));
// Overlap is proved by a barrier, not by the clock: three files that each wait for the other two can only pass if
// the pool really runs them at once, on any machine and under any load.
const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isda-e7m-barrier-'));
const bar = runner(['--shared', '--jobs', '3', '--dir', fx('runner-pool-barrier')], { ISDA_E7M_BARRIER: barrierDir });
fs.rmSync(barrierDir, { recursive: true, force: true });
check('three files that wait for each other pass: the pool runs them at the same time', bar.status === 0 && /Files: 3 {3}checks passed: 6 {3}checks failed: 0/.test(bar.out) && (bar.out.match(/ran together with the other two/g) || []).length === 3);
check('each of the three ran in a worker of its own', new Set(bar.pids).size === 3 && bar.stats[0] === 3);
check('three workers were started, one per slot, none replaced', three.stats[0] === 3 && three.stats[1] === 0 && three.stats[3] === 0 && three.stats[5] === 0);
check('the six files ran in three different processes, two each', new Set(three.pids).size === 3 && three.pids.every((p) => three.pids.filter((q) => q === p).length === 2));
check('the summary names the jobs and the shared workers', /^Jobs: 3 files at once, on shared workers \(one per slot\)$/m.test(three.out) && !/^Jobs:/m.test(one.out));
check('blocks are in file order and whole', JSON.stringify(blocks(three.out)) === JSON.stringify(blocks(one.out)) && blocks(three.out).length === 6 && /^--- p6Sleep\.test\.js: 2 ok, 0 failed/m.test(three.out));
check('the report is identical to the one-worker run apart from pids, timings and the jobs/worker lines', stable(three.out) === stable(one.out));
check('every file found its own temp file (private TMPDIR per slot)', !/temp file was overwritten/.test(three.out) && (three.out.match(/temp file is its own/g) || []).length === 6);

// 2. Recycling is per worker.
let r = runner(['--shared', '--jobs', '2', '--recycle-files', '1', '--dir', fx('runner-pool')]);
check('with a 1-file limit every file gets a fresh worker, whatever the slot', r.status === 0 && r.stats[0] === 6 && r.stats[1] === 6 && new Set(r.pids).size === 6);
r = runner(['--shared', '--jobs', '2', '--recycle-files', '2', '--dir', fx('runner-pool')]);
check('with a 2-file limit and two slots each slot replaces its worker after two of its own files', r.status === 0 && r.stats[1] >= 1 && r.stats[0] === 2 + r.stats[1]);
r = runner(['--shared', '--jobs', '2', '--recycle-mb', '1', '--dir', fx('runner-pool')]);
check('a tiny memory limit replaces each worker after every file, in the pool too', r.status === 0 && r.stats[0] === 6 && r.stats[3] === 6);

// 3. The isolate marker.
const mk = runner(['--shared', '--jobs', '2', '--dir', fx('runner-pool-marker')]);
check('four files pass, one carries the marker', mk.status === 0 && mk.pids.length === 4);
check('the marked file is listed and its pid is not a worker pid', /^Run in their own process by marker: q2Sleep\.test\.js$/m.test(mk.out) && new Set(mk.pids).size >= 2);
check('the marked file is the only one in its process', mk.pids.filter((p) => p === mk.pids[1]).length === 1);
check('the marked file took a slot: the unmarked three share at most two workers', mk.stats[0] <= 2);
const mk1 = runner(['--shared', '--jobs', '1', '--dir', fx('runner-pool-marker')]);
check('blocks and report match the one-job run', stable(mk.out) === stable(mk1.out) && JSON.stringify(blocks(mk.out)) === JSON.stringify(blocks(mk1.out)));

// 4. A worker that dies.
const cr = runner(['--shared', '--jobs', '2', '--dir', fx('runner-pool-crash')]);
check('the run fails with exit 1 and names the file that killed its worker', cr.status === 1 && /^\*\*\* k2Crash\.test\.js FAILED/m.test(cr.out) && /shared worker died while running this file/.test(cr.out));
check('only that file failed', /FAILED FILES \(1\):/.test(cr.out) && /Files: 5 /.test(cr.out));
check('every other file ran and passed, the one in the other slot included', ['k1Sleep', 'k3Sleep', 'k4Sleep', 'k5Sleep'].every((n) => new RegExp('^--- ' + n + '\\.test\\.js: 2 ok, 0 failed', 'm').test(cr.out)));
check('the crash is counted and a replacement worker was started', cr.stats[5] === 1 && cr.stats[0] >= 3);
check('the blocks are still in file order', JSON.stringify(blocks(cr.out)) === JSON.stringify(['k1Sleep.test.js', 'k2Crash.test.js', 'k3Sleep.test.js', 'k4Sleep.test.js', 'k5Sleep.test.js']));

// 5. A failing file among passing ones, and --isolate unaffected.
r = runner(['--shared', '--jobs', '3', '--dir', fx('runner-jobs-fail')]);
check('a failing file fails the run with exit 1 in the shared pool and later files still ran', r.status === 1 && /\*\*\* f2Fails\.test\.js FAILED \(exit 1, 1 failing check\(s\)\) \*\*\*/.test(r.out) && /--- f3Sleep\.test\.js: 1 ok, 0 failed/.test(r.out));
r = runner(['--isolate', '--jobs', '2', '--dir', fx('runner-pool')]);
check('--isolate --jobs still runs one process per file, with no worker line', r.status === 0 && r.stats.length === 0 && new Set(r.pids).size === 6 && /^Jobs: 2 files at once, one process each$/m.test(r.out));

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

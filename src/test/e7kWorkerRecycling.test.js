/**
 * e7kWorkerRecycling.test.js - E7k (docs/sda-reference/FEATURE-ROADMAP.md): a long-lived shared worker is replaced
 * by a fresh one after a number of files or when its memory grows too large, and a worker that dies does not
 * take the run with it. The fixtures print their process id, so a replacement shows as a different pid.
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { check, failureCount } = require('./helpers/harness');

const root = path.join(__dirname, '..', '..');
const fx = (name) => path.join(__dirname, 'fixtures', name);

function runner(args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), ...args], { cwd: root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const pids = Array.from(out.matchAll(/^ {2}ok {2}- pid:(\d+)$/gm)).map((m) => m[1]);
  const stats = (out.match(/^Shared workers: (\d+) started \(replaced: (\d+) after (\d+) files, (\d+) at (\d+) MB, (\d+) after a crash\)$/m) || []).slice(1).map(Number);
  return { out, status: r.status, pids, stats };
}

// 1. After N files.
let r = runner(['--shared', '--recycle-files', '2', '--dir', fx('runner-recycle')]);
check('five files all pass', r.pids.length === 5 && r.status === 0);
check('files 1 and 2 share a worker', r.pids[0] === r.pids[1]);
check('file 3 runs in a new worker after two files', r.pids[2] !== r.pids[1]);
check('files 3 and 4 share the second worker, and file 5 gets a third', r.pids[2] === r.pids[3] && r.pids[4] !== r.pids[3]);
check('the summary counts three workers started and two replaced by file count', r.stats[0] === 3 && r.stats[1] === 2 && r.stats[2] === 2);

// 2. Default and "never".
r = runner(['--shared', '--dir', fx('runner-recycle')]);
check('by default five files fit in one worker (limit is 60 files)', new Set(r.pids).size === 1 && r.stats[0] === 1 && r.stats[1] === 0 && r.stats[2] === 60);
r = runner(['--shared', '--recycle-files', '0', '--dir', fx('runner-recycle')]);
check('--recycle-files 0 never replaces a worker', new Set(r.pids).size === 1 && r.stats[0] === 1 && r.stats[1] === 0);

// 3. By memory: the first file really keeps 400 MB alive.
r = runner(['--shared', '--recycle-mb', '350', '--dir', fx('runner-memory')]);
check('three files pass', r.pids.length === 3 && r.status === 0);
check('the worker that kept 400 MB is replaced before the next file', r.pids[1] !== r.pids[0]);
check('the fresh worker, with nothing leaked, runs the remaining files', r.pids[1] === r.pids[2]);
check('the summary counts two workers started and one replaced for memory', r.stats[0] === 2 && r.stats[3] === 1 && r.stats[4] === 350);
r = runner(['--shared', '--recycle-mb', '0', '--dir', fx('runner-memory')]);
check('--recycle-mb 0 never replaces for memory', r.stats[0] === 1 && r.stats[3] === 0);
r = runner(['--shared', '--recycle-mb', '1', '--dir', fx('runner-recycle')]);
check('a tiny memory limit replaces the worker after every file', r.stats[0] === 5 && r.stats[3] === 5 && new Set(r.pids).size === 5);

// 4. A worker that dies.
r = runner(['--shared', '--dir', fx('runner-crash')]);
check('a file that kills its worker is reported as failed', /^\*\*\* c1Crash\.test\.js FAILED/m.test(r.out) && /shared worker died while running this file/.test(r.out));
check('its output up to the crash is kept', /ok {2}- before the crash/.test(r.out));
check('the run continues: the next files pass in a new worker', r.pids.length === 2 && r.pids[0] === r.pids[1]);
check('the summary counts two workers started and one crash', r.stats[0] === 2 && r.stats[5] === 1);
check('the run exits 1 because of the crashed file', r.status === 1);

// 5. Bad values and the other modes.
r = runner(['--shared', '--recycle-files', 'abc', '--dir', fx('runner-recycle')]);
check('a non-number is refused with exit 2', r.status === 2 && /--recycle-files needs a whole number/.test(r.out));
r = runner(['--shared', '--recycle-mb', '-5', '--dir', fx('runner-recycle')]);
check('a negative number is refused with exit 2', r.status === 2 && /--recycle-mb needs a whole number/.test(r.out));
r = runner(['--recycle-files', '2', '--dir', fx('runner-recycle')]);
check('without --shared the flags change nothing and there is no worker line', r.status === 0 && r.stats.length === 0 && new Set(r.pids).size === 5);

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

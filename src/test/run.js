/**
 * run.js - the suite runner (I-120). `npm test` runs this.
 *
 * Discovers every `src/test/*.test.js`, so a new test file can no longer be forgotten
 * in package.json's `test` script. The files run one after another in a long-lived worker process
 * (sharedWorker.js, E7i - E7l), which resets what each file leaves behind (globals, timers, jsdom windows,
 * the module cache, `process.exit`) and is replaced by a fresh worker after 60 files or 1,536 MB; `--isolate`
 * gives every file a node process of its own instead. The run continues past a failing file so one run
 * reports everything that broke.
 *
 * Output stays grep-friendly: each file's own output is passed through unchanged
 * (`  ok  - label` / `FAIL  - label`), preceded by a `=== <file> ===` header.
 * The last lines are a summary (files, checks, failures, wall time, slowest files).
 *
 *   node src/test/run.js                  run everything
 *   node src/test/run.js i106 dspfWriter  run only files whose name contains any argument
 *   node src/test/run.js --list           list the files that would run, then exit
 *   node src/test/run.js --slow 20        show the 20 slowest files in the summary (default 5)
 *   node src/test/run.js --isolate        one node process per file, as before E7l: the strongest isolation, about a
 *                                         third slower. Use it to tell a real failure from a leak between files.
 *   node src/test/run.js --recycle-files N  start a fresh worker after N files (default 60, 0 = never)
 *   node src/test/run.js --recycle-mb M     start a fresh worker when its resident memory reaches M MB after a file
 *                                         (default 1536, 0 = never); E7k
 *   node src/test/run.js --dir <path>     take the *.test.js files from <path> instead of src/test (used by the
 *                                         runner's own tests and by parity.js)
 *   node src/test/run.js --shared         the default since E7l (accepted so older command lines keep working)
 *   node src/test/run.js --isolate --jobs N   run up to N files at once, each in a process of its own (E7b); the default
 *                                         is the number of cores minus one (at least 1), --jobs 1 is the sequential run. Each
 *                                         file's output still appears as one block, in file order; each slot gets its own
 *                                         temp directory (TMPDIR). Shared mode keeps one worker until the pool is integrated
 *                                         with it (E7m), so --jobs has no effect there.
 *
 * A file whose first lines contain `// @isda-test: isolate` always gets a process of its own (E7j).
 * `npm run test:parity` (src/test/parity.js) runs the suite both ways and reports any file whose result differs;
 * run it after adding a test that changes built-ins or other process-wide state.
 *
 * Exit code: 0 only if every file exited 0 and printed no `FAIL  -` line.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, fork } = require('child_process');

const args = process.argv.slice(2);
let slowCount = 5;
let listOnly = false;
let shared = true; // E7l: the shared worker is the default; --isolate turns it off
let recycleFiles = 60;
let recycleMb = 1536;
let jobs = Math.max(1, os.cpus().length - 1); // E7b
let jobsGiven = false;
const filters = [];
let testDir = __dirname;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--list') listOnly = true;
  else if (args[i] === '--shared') shared = true;
  else if (args[i] === '--isolate') shared = false;
  else if (args[i] === '--recycle-files' || args[i] === '--recycle-mb') {
    const n = Number(args[i + 1]);
    if (!Number.isInteger(n) || n < 0) { console.error(args[i] + ' needs a whole number (0 turns it off)'); process.exit(2); }
    if (args[i] === '--recycle-files') recycleFiles = n; else recycleMb = n;
    i++;
  }
  else if (args[i] === '--jobs') {
    const n = Number(args[i + 1]);
    if (!Number.isInteger(n) || n < 1) { console.error('--jobs needs a whole number of at least 1'); process.exit(2); }
    jobs = n; jobsGiven = true;
    i++;
  }
  else if (args[i] === '--dir') testDir = path.resolve(args[++i] || '.');
  else if (args[i] === '--slow') slowCount = Math.max(0, parseInt(args[++i], 10) || 0);
  else filters.push(args[i]);
}

const dir = testDir;
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => filters.length === 0 || filters.some((s) => f.includes(s)))
  .sort();

if (listOnly) {
  files.forEach((f) => console.log(f));
  console.log('\n' + files.length + ' test file(s)');
  process.exit(0);
}
if (files.length === 0) {
  console.log('No test files match: ' + filters.join(', '));
  process.exit(1);
}

const results = [];
const suiteStart = Date.now();
const root = path.join(__dirname, '..', '..');

// One test file in a process of its own. Child output goes to a file, not a pipe: many tests end with
// process.exit(), and on a busy machine a pipe can lose the tail of a large output when the child exits
// (seen: a file's checks silently dropping from 490 to 295). A file write is synchronous, so nothing is lost.
// E7b: the same, asynchronously, so several can run at once. With more than one job every slot gets a temp
// directory of its own (TMPDIR/TMP/TEMP), so two files that write a fixed name in the temp directory cannot
// meet; with one job the child's environment is left exactly as it was.
let tmpRoot = null;
function runIsolated(f, slot) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const outFile = path.join(os.tmpdir(), 'isda-test-' + process.pid + '-' + f + '.log');
    const fd = fs.openSync(outFile, 'w');
    const env = Object.assign({}, process.env);
    if (jobs > 1) {
      if (!tmpRoot) tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isda-jobs-' + process.pid + '-'));
      const slotTmp = path.join(tmpRoot, String(slot));
      fs.mkdirSync(slotTmp, { recursive: true });
      env.TMPDIR = slotTmp; env.TMP = slotTmp; env.TEMP = slotTmp;
    }
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      fs.closeSync(fd);
      const secs = (Date.now() - t0) / 1000;
      let out = '';
      try { out = fs.readFileSync(outFile, 'utf8'); fs.unlinkSync(outFile); } catch (e) { /* no log */ }
      resolve({ out, exitCode: code === null || code === undefined ? -1 : code, secs });
    };
    const child = spawn(process.execPath, [path.join(dir, f)], { stdio: ['ignore', fd, fd], cwd: root, env });
    child.on('error', () => finish(-1));
    child.on('close', (code) => finish(code));
  });
}

// E7j: a file that cannot share a process (it changes something the worker does not reset, such as a built-in
// prototype) says so in a comment among its first lines; --shared then runs it in a process of its own.
const ISOLATE_MARKER = /^\s*\/\/\s*@isda-test:\s*isolate\b/m;
const isolatedByMarker = [];
function hasIsolateMarker(f) {
  const head = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').slice(0, 30).join('\n');
  return ISOLATE_MARKER.test(head);
}

// --shared: one long-lived worker (sharedWorker.js) runs the files in order. The worker writes each file's
// output to a log file itself and only sends a small message over IPC, for the same reason as above.
let worker = null;
let workerFiles = 0; // files the current worker has run
let nextId = 1;
const workerStats = { started: 0, byFiles: 0, byMemory: 0, crashed: 0 };
function stopWorker(w) {
  return new Promise((resolve) => { w.once('exit', resolve); w.send({ type: 'quit' }); });
}
function startWorker() {
  return new Promise((resolve, reject) => {
    // --expose-gc lets the worker collect garbage before it reports its memory, so the recycle limit sees real growth.
    const w = fork(path.join(__dirname, 'sharedWorker.js'), [], { cwd: root, execArgv: ['--expose-gc'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    workerStats.started++;
    workerFiles = 0;
    const onFirst = (m) => { if (m && m.type === 'ready') { w.removeListener('message', onFirst); resolve(w); } };
    w.on('message', onFirst);
    w.once('error', reject);
    w.once('exit', () => reject(new Error('shared worker exited before it was ready')));
  });
}
async function runShared(f) {
  if (!worker) worker = await startWorker();
  const w = worker;
  const id = nextId++;
  const logPath = path.join(os.tmpdir(), 'isda-test-' + process.pid + '-' + f + '.log');
  const reply = await new Promise((resolve) => {
    const onMsg = (m) => { if (m && m.type === 'done' && m.id === id) { cleanup(); resolve(m); } };
    const onExit = (code) => { cleanup(); worker = null; workerStats.crashed++; resolve({ crashed: true, exitCode: code === null ? -1 : code, secs: 0 }); };
    const cleanup = () => { w.removeListener('message', onMsg); w.removeListener('exit', onExit); };
    w.on('message', onMsg);
    w.once('exit', onExit);
    w.send({ type: 'run', id, file: path.join(dir, f), logPath });
  });
  if (!reply.crashed) {
    workerFiles++;
    // E7k: a long-lived worker slowly keeps pages and windows alive, so it is replaced by a fresh one.
    if (recycleFiles > 0 && workerFiles >= recycleFiles) { workerStats.byFiles++; await stopWorker(w); worker = null; }
    else if (recycleMb > 0 && reply.rssMb >= recycleMb) { workerStats.byMemory++; await stopWorker(w); worker = null; }
  }
  let out = '';
  try { out = fs.readFileSync(logPath, 'utf8'); fs.unlinkSync(logPath); } catch (e) { /* no log when the worker died */ }
  if (reply.crashed) out += '\nshared worker died while running this file (exit ' + reply.exitCode + ')\n';
  return { out, exitCode: reply.exitCode, secs: reply.secs };
}

// Prints one file's block and records its result. The header is printed by the caller.
function report(f, { out, exitCode, secs }) {
  process.stdout.write(out.endsWith('\n') || out === '' ? out : out + '\n');
  const lines = out.split('\n');
  const ok = lines.filter((l) => l.startsWith('  ok  -')).length;
  const failed = lines.filter((l) => l.startsWith('FAIL  -')).length;
  const pass = exitCode === 0 && failed === 0;
  console.log('--- ' + f + ': ' + ok + ' ok, ' + failed + ' failed, ' + secs.toFixed(1) + ' s');
  if (!pass) console.log('*** ' + f + ' FAILED (exit ' + exitCode + ', ' + failed + ' failing check(s)) ***');
  results.push({ file: f, ok, failed, exitCode, secs, pass });
}

// E7b: up to `jobs` files at once, one process each. A file's block is printed when it and every file before it
// have finished, so the output reads as in a sequential run and blocks never interleave.
async function runPool() {
  const finished = new Array(files.length).fill(null);
  let next = 0;
  let printed = 0;
  const flush = () => {
    while (printed < files.length && finished[printed]) {
      console.log('\n=== ' + files[printed] + ' ===');
      report(files[printed], finished[printed]);
      finished[printed] = null;
      printed++;
    }
  };
  const slots = Math.min(jobs, files.length);
  await Promise.all(Array.from({ length: slots }, async (_, slot) => {
    while (next < files.length) {
      const i = next++;
      const r = await runIsolated(files[i], slot);
      finished[i] = r;
      flush();
    }
  }));
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
}

async function main() {
  if (!shared && jobs > 1) {
    await runPool();
    summary();
    return;
  }
  if (shared && jobsGiven && jobs > 1) {
    console.error('note: --jobs ' + jobs + ' has no effect in shared mode (one worker, E7m adds the pool); use --isolate --jobs ' + jobs + ' to run files in parallel');
  }
  for (const f of files) {
    console.log('\n=== ' + f + ' ===');
    let useWorker = shared;
    if (shared && hasIsolateMarker(f)) { useWorker = false; isolatedByMarker.push(f); }
    report(f, await (useWorker ? runShared(f) : runIsolated(f, 0)));
  }
  if (worker) {
    const w = worker;
    await stopWorker(w);
  }
  summary();
}

function summary() {
  const totalSecs = (Date.now() - suiteStart) / 1000;
  const bad = results.filter((r) => !r.pass);
  const totalOk = results.reduce((n, r) => n + r.ok, 0);
  const totalFail = results.reduce((n, r) => n + r.failed, 0);

  console.log('\n' + '-'.repeat(60));
  console.log('Files: ' + results.length + '   checks passed: ' + totalOk + '   checks failed: ' + totalFail);
  console.log('Wall time: ' + totalSecs.toFixed(1) + ' s');
  if (!shared && jobs > 1) console.log('Jobs: ' + jobs + ' files at once, one process each');
  if (shared) {
    console.log('Shared workers: ' + workerStats.started + ' started (replaced: ' + workerStats.byFiles + ' after ' + recycleFiles
      + ' files, ' + workerStats.byMemory + ' at ' + recycleMb + ' MB, ' + workerStats.crashed + ' after a crash)');
  }
  if (shared && isolatedByMarker.length > 0) console.log('Run in their own process by marker: ' + isolatedByMarker.join(', '));
  if (slowCount > 0) {
    const slow = results.slice().sort((a, b) => b.secs - a.secs).slice(0, slowCount);
    console.log('Slowest: ' + slow.map((r) => r.file + ' ' + r.secs.toFixed(1) + 's').join(', '));
  }
  if (bad.length === 0) {
    console.log('\nALL CHECKS PASSED');
    process.exit(0);
  }
  console.log('\nFAILED FILES (' + bad.length + '):');
  bad.forEach((r) => console.log('  ' + r.file + '  (exit ' + r.exitCode + ', ' + r.failed + ' failing)'));
  process.exit(1);
}

main();

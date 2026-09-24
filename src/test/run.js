/**
 * run.js - the suite runner (I-120). `npm test` runs this.
 *
 * Discovers every `src/test/*.test.js`, so a new test file can no longer be forgotten
 * in package.json's `test` script. Each file runs in its own node process (they
 * install globals such as `document` and call process.exit), one after another, and
 * the run continues past a failing file so one run reports everything that broke.
 *
 * Output stays grep-friendly: each file's own output is passed through unchanged
 * (`  ok  - label` / `FAIL  - label`), preceded by a `=== <file> ===` header.
 * The last lines are a summary (files, checks, failures, wall time, slowest files).
 *
 *   node src/test/run.js                  run everything
 *   node src/test/run.js i106 dspfWriter  run only files whose name contains any argument
 *   node src/test/run.js --list           list the files that would run, then exit
 *   node src/test/run.js --slow 20        show the 20 slowest files in the summary (default 5)
 *
 * Exit code: 0 only if every file exited 0 and printed no `FAIL  -` line.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let slowCount = 5;
let listOnly = false;
const filters = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--list') listOnly = true;
  else if (args[i] === '--slow') slowCount = Math.max(0, parseInt(args[++i], 10) || 0);
  else filters.push(args[i]);
}

const dir = __dirname;
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
for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  const t0 = Date.now();
  // Child output goes to a file, not a pipe: many tests end with process.exit(), and on a busy
  // machine a pipe can lose the tail of a large output when the child exits (seen: a file's
  // checks silently dropping from 490 to 295). A file write is synchronous, so nothing is lost.
  const outFile = path.join(os.tmpdir(), 'isda-test-' + process.pid + '-' + f + '.log');
  const fd = fs.openSync(outFile, 'w');
  const r = spawnSync(process.execPath, [path.join(dir, f)], {
    stdio: ['ignore', fd, fd],
    cwd: path.join(dir, '..', '..'),
  });
  fs.closeSync(fd);
  const secs = (Date.now() - t0) / 1000;
  const out = fs.readFileSync(outFile, 'utf8');
  fs.unlinkSync(outFile);
  process.stdout.write(out.endsWith('\n') || out === '' ? out : out + '\n');
  const lines = out.split('\n');
  const ok = lines.filter((l) => l.startsWith('  ok  -')).length;
  const failed = lines.filter((l) => l.startsWith('FAIL  -')).length;
  const exitCode = r.status === null ? -1 : r.status;
  const pass = exitCode === 0 && failed === 0;
  console.log('--- ' + f + ': ' + ok + ' ok, ' + failed + ' failed, ' + secs.toFixed(1) + ' s');
  if (!pass) console.log('*** ' + f + ' FAILED (exit ' + exitCode + ', ' + failed + ' failing check(s)) ***');
  results.push({ file: f, ok, failed, exitCode, secs, pass });
}

const totalSecs = (Date.now() - suiteStart) / 1000;
const bad = results.filter((r) => !r.pass);
const totalOk = results.reduce((n, r) => n + r.ok, 0);
const totalFail = results.reduce((n, r) => n + r.failed, 0);

console.log('\n' + '-'.repeat(60));
console.log('Files: ' + results.length + '   checks passed: ' + totalOk + '   checks failed: ' + totalFail);
console.log('Wall time: ' + totalSecs.toFixed(1) + ' s');
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

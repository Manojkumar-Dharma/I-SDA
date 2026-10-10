/**
 * e7iSharedWorker.test.js - E7i (docs/sda-reference/FEATURE-ROADMAP.md): the shared test worker.
 *
 * `run.js --shared` runs the suite's files in one long-lived worker (`sharedWorker.js`). The point of
 * these checks is that a file behaves in the worker as it would in a process of its own: its exit
 * code, its output, and what it leaves behind for the next file. They drive the worker directly over
 * its IPC protocol with small fixture files (src/test/fixtures/sharedWorker/), one worker for all of
 * them, in order, so leaks between files would show up here.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const { check, failureCount } = require('./helpers/harness');

const root = path.join(__dirname, '..', '..');
const fixtures = path.join(__dirname, 'fixtures', 'sharedWorker');

function startWorker() {
  return new Promise((resolve, reject) => {
    const w = fork(path.join(__dirname, 'sharedWorker.js'), [], { cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    w.once('error', reject);
    w.on('message', function onReady(m) { if (m && m.type === 'ready') { w.removeListener('message', onReady); resolve(w); } });
  });
}

let nextId = 1;
function run(w, name) {
  const id = nextId++;
  const logPath = path.join(os.tmpdir(), 'isda-e7i-' + process.pid + '-' + name + '.log');
  return new Promise((resolve) => {
    const onMsg = (m) => {
      if (m && m.type === 'done' && m.id === id) {
        w.removeListener('message', onMsg);
        const out = fs.readFileSync(logPath, 'utf8');
        fs.unlinkSync(logPath);
        resolve({ exitCode: m.exitCode, secs: m.secs, out });
      }
    };
    w.on('message', onMsg);
    w.send({ type: 'run', id, file: path.join(fixtures, name), logPath });
  });
}

async function main() {
  const w = await startWorker();
  let r;

  r = await run(w, 'passes.js');
  check('a file that exits 0 reports 0', r.exitCode === 0);
  check('its output is captured in order', /ok {2}- first check\n {2}ok {2}- second check\n/.test(r.out));

  r = await run(w, 'failsExit.js');
  check('process.exit(1) is reported as 1', r.exitCode === 1);
  check('a FAIL line is in the log exactly as written', /^FAIL {2}- a failing check$/m.test(r.out));

  r = await run(w, 'exit3Timer.js');
  check('an exit code from inside a timer is reported', r.exitCode === 3);

  r = await run(w, 'drainsExitCode.js');
  check('a file that never exits takes process.exitCode', r.exitCode === 2);
  check('and its output is still captured', /drain with exitCode/.test(r.out));

  r = await run(w, 'drainsZero.js');
  check('a file that never exits and sets nothing is 0', r.exitCode === 0);
  check('the worker waits for its pending timer before finishing the file', /late line/.test(r.out));

  r = await run(w, 'catchOverrides.js');
  check('the first process.exit wins over an exit(1) in the file\'s own catch', r.exitCode === 0);
  check('and the checks it printed are kept', /ok {2}- ran/.test(r.out));

  r = await run(w, 'throws.js');
  check('an error thrown at top level is exit 1', r.exitCode === 1);
  check('with its message in the log', /boom at top level/.test(r.out));

  r = await run(w, 'rejects.js');
  check('an unhandled rejection is exit 1', r.exitCode === 1);
  check('with its message in the log', /rejected promise/.test(r.out));

  r = await run(w, 'stderrOut.js');
  check('stdout and stderr land in the same log', /to stdout/.test(r.out) && /to stderr/.test(r.out));

  r = await run(w, 'argvName.js');
  check('process.argv[1] is the test file, as in a process of its own', /argv1:argvName\.js/.test(r.out));

  // Leaks between files: the next file must see none of it.
  r = await run(w, 'leaksA.js');
  check('the leaking file itself exits 0', r.exitCode === 0);
  r = await run(w, 'leaksB.js');
  check('a global set by the previous file is gone', /global:undefined/.test(r.out));
  check('an environment variable set by the previous file is gone', /env:undefined/.test(r.out));
  check('an interval left running by the previous file was cleared', /tick:undefined/.test(r.out));

  r = await run(w, 'stateA.js');
  check('a module loaded by one file starts at its initial state there', /stateA n=1/.test(r.out));
  r = await run(w, 'stateB.js');
  check('and the next file gets a freshly loaded module, not the previous file\'s state', /stateB n=1/.test(r.out));

  r = await run(w, 'jsdomA.js');
  check('a jsdom window is open while its file runs', /document while open:object/.test(r.out));
  r = await run(w, 'jsdomB.js');
  check('every jsdom window a file created is closed when it ends', /document after the file ended:undefined/.test(r.out));

  await new Promise((resolve) => { w.once('exit', resolve); w.send({ type: 'quit' }); });
  check('the worker exits cleanly when told to quit', true);

  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

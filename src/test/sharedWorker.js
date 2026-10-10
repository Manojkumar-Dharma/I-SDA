/**
 * sharedWorker.js - a long-lived worker that runs several test files in ONE node process (E7i).
 *
 * Why: the suite is hundreds of files, each in its own process, and most of them start by loading
 * jsdom (about a second) and warming up the same code. A worker that loads jsdom once and runs
 * files one after another removes that repeated cost (docs/sda-reference/FEATURE-ROADMAP.md, E7g
 * proposal). `run.js --shared` starts one; it is not meant to be run by hand.
 *
 * Protocol (child_process.fork IPC):
 *   worker -> parent  { type: 'ready' }
 *   parent -> worker  { type: 'run', id, file, logPath }
 *   worker -> parent  { type: 'done', id, exitCode, secs, rssMb } (the file's output is in logPath; rssMb is the
 *                                                                resident memory after a garbage collection)
 *   parent -> worker  { type: 'quit' }
 *
 * What each file gets, so that it behaves as it would in a process of its own:
 *   - a clean module cache for everything except node_modules (jsdom stays loaded);
 *   - process.exit that stops the file: the FIRST exit code wins and later calls are ignored (a test's
 *     own `main().catch(() => process.exit(1))` would otherwise turn a clean exit(0) into exit 1);
 *   - the exit code of a file that never calls process.exit is process.exitCode (or 0), and the file
 *     ends when the event loop has nothing left to do (four files rely on that);
 *   - stdout and stderr written to one log as they are produced, in order (so a crash keeps the output so far);
 *   - setTimeout / setInterval / setImmediate handles cleared at the end, every jsdom window closed,
 *     globals the file installed deleted, process.env / argv / exitCode restored.
 * An uncaught error or unhandled rejection ends the file with exit code 1 and the stack in the log.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const realExit = process.exit.bind(process);
const realStdoutWrite = process.stdout.write.bind(process.stdout);
const realStderrWrite = process.stderr.write.bind(process.stderr);
const real = {
  setTimeout: global.setTimeout, clearTimeout: global.clearTimeout,
  setInterval: global.setInterval, clearInterval: global.clearInterval,
  setImmediate: global.setImmediate, clearImmediate: global.clearImmediate,
};
const baseGlobals = new Set(Object.getOwnPropertyNames(globalThis));
const baseEnv = Object.assign({}, process.env);
const baseArgv = process.argv.slice();

class ExitSignal {
  constructor(code) { this.code = code; }
}

// Close every window a test creates, not just global.window: pages are the main memory cost.
const jsdomInstances = [];
try {
  const jsdom = require('jsdom');
  const Original = jsdom.JSDOM;
  class TrackedJSDOM extends Original {
    constructor(...a) { super(...a); jsdomInstances.push(this); }
  }
  jsdom.JSDOM = TrackedJSDOM;
} catch (e) { /* a run without jsdom installed still works; tests that need it will say so */ }

let current = null;

function problem(err) {
  if (err instanceof ExitSignal) { if (current) current.finish(); return; }
  const text = 'UNCAUGHT: ' + ((err && err.stack) || err) + '\n';
  if (!current) { realStderrWrite('sharedWorker: error outside a test file: ' + text); return; }
  current.write(text);
  if (current.code === null) current.code = 1;
  current.finish();
}
process.on('uncaughtException', problem);
process.on('unhandledRejection', problem);

function clearUserModules() {
  for (const k of Object.keys(require.cache)) if (!k.includes(path.sep + 'node_modules' + path.sep)) delete require.cache[k];
}

function install(state) {
  process.exit = (code) => {
    if (state.code === null) state.code = code === undefined ? (process.exitCode || 0) : code;
    throw new ExitSignal(state.code);
  };
  const capture = (chunk, enc, cb) => {
    state.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    const done = typeof enc === 'function' ? enc : cb;
    if (typeof done === 'function') done();
    return true;
  };
  process.stdout.write = capture;
  process.stderr.write = capture;
  global.setTimeout = (...a) => { const h = real.setTimeout(...a); state.timers.add(h); return h; };
  global.setInterval = (...a) => { const h = real.setInterval(...a); state.intervals.add(h); return h; };
  global.setImmediate = (...a) => { const h = real.setImmediate(...a); state.immediates.add(h); return h; };
}

function uninstall() {
  process.exit = realExit;
  process.stdout.write = realStdoutWrite;
  process.stderr.write = realStderrWrite;
  global.setTimeout = real.setTimeout; global.setInterval = real.setInterval; global.setImmediate = real.setImmediate;
}

function reset(state) {
  for (const h of state.timers) real.clearTimeout(h);
  for (const h of state.intervals) real.clearInterval(h);
  for (const h of state.immediates) real.clearImmediate(h);
  while (jsdomInstances.length) { try { jsdomInstances.pop().window.close(); } catch (e) { /* already closed */ } }
  uninstall();
  for (const k of Object.getOwnPropertyNames(globalThis)) {
    if (!baseGlobals.has(k)) { try { delete globalThis[k]; } catch (e) { /* non-configurable */ } }
  }
  for (const k of Object.keys(process.env)) if (!(k in baseEnv)) delete process.env[k];
  Object.assign(process.env, baseEnv);
  process.argv = baseArgv.slice();
  process.exitCode = undefined;
  clearUserModules();
  // run.js starts the worker with --expose-gc: collect now, so the memory reported below is what is really retained.
  if (typeof global.gc === 'function') global.gc();
}

// Resources that do not mean "the test still has work to do": stdio and the IPC channel to the parent.
const IGNORED = new Set(['TTYWrap', 'PipeWrap']);

async function runFile(file, logPath) {
  // Output goes to the log as it is produced, so a file that kills the worker still leaves what it printed.
  const fd = fs.openSync(logPath, 'w');
  const state = { write: (text) => { try { fs.writeSync(fd, text); } catch (e) { /* log gone: nothing to do */ } }, code: null, timers: new Set(), intervals: new Set(), immediates: new Set(), finish: null };
  const finished = new Promise((resolve) => { state.finish = resolve; });
  current = state;
  clearUserModules();
  process.argv = [baseArgv[0], file];
  install(state);
  const t0 = Date.now();
  try { require(file); } catch (e) { problem(e); }
  // A file that never calls process.exit is finished when only the runner's own poll is left.
  let quiet = 0;
  const poll = real.setInterval(() => {
    const left = process.getActiveResourcesInfo().filter((r) => !IGNORED.has(r));
    quiet = left.length <= 1 ? quiet + 1 : 0;
    if (quiet >= 2 && state.code === null) { state.code = process.exitCode || 0; state.finish(); }
  }, 25);
  await finished;
  real.clearInterval(poll);
  const secs = (Date.now() - t0) / 1000;
  reset(state);
  current = null;
  fs.closeSync(fd);
  return { exitCode: state.code === null ? 1 : state.code, secs, rssMb: Math.round(process.memoryUsage().rss / 1048576) };
}

process.on('message', async (msg) => {
  if (msg.type === 'quit') { process.disconnect(); return; }
  if (msg.type !== 'run') return;
  const r = await runFile(msg.file, msg.logPath);
  process.send({ type: 'done', id: msg.id, exitCode: r.exitCode, secs: r.secs, rssMb: r.rssMb });
});
process.send({ type: 'ready' });

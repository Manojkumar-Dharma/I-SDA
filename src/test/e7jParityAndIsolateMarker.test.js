/**
 * e7jParityAndIsolateMarker.test.js - E7j (docs/sda-reference/FEATURE-ROADMAP.md).
 *
 * Two things that make the shared test worker (E7i) safe to rely on:
 *  - `// @isda-test: isolate` in a file's first lines gives that file a process of its own in --shared mode;
 *  - parity.js runs the same files both ways and reports any file whose result differs.
 *
 * The fixtures (src/test/fixtures/runner/) include a file that pollutes `Array.prototype`, which the worker
 * deliberately does not reset, and two files that look for the pollution: one without the marker (it passes
 * alone and fails behind the polluter in the shared worker) and one with it.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { check, failureCount } = require('./helpers/harness');

const root = path.join(__dirname, '..', '..');
const fixtures = path.join(__dirname, 'fixtures', 'runner');
const diffFixtures = path.join(__dirname, 'fixtures', 'runner-diff');

function node(script, args, cwd) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { cwd: cwd || root, encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}
const lineFor = (out, name) => (out.match(new RegExp('^--- ' + name.replace(/\./g, '\\.') + ': .*$', 'm')) || [''])[0];

// 1. One process per file: nothing is shared, so the polluter cannot hurt anyone.
let r = node('run.js', ['--isolate', '--dir', fixtures]);
check('isolated mode runs the four fixtures', /Files: 4 /.test(r.out));
check('isolated mode: the unmarked victim passes (it never sees the polluter)', /^--- a3Victim\.test\.js: 1 ok, 0 failed/m.test(r.out));
check('isolated mode exits 0', r.status === 0);
check('isolated mode does not mention markers', !/by marker/.test(r.out));

// 2. Shared mode (the default since E7l): the unmarked victim sees the pollution; the marked one gets its own process.
r = node('run.js', ['--dir', fixtures]);
check('shared mode is the default: the worker summary line is there without any flag', /^Shared workers: /m.test(r.out));
r = node('run.js', ['--shared', '--dir', fixtures]);
check('shared mode: the unmarked victim now fails because of the polluter before it', /^--- a3Victim\.test\.js: 0 ok, 1 failed/m.test(r.out));
check('shared mode: the marked victim passes', /^--- a3VictimMarked\.test\.js: 1 ok, 0 failed/m.test(r.out));
check('shared mode names the file it ran in its own process', /Run in their own process by marker: a3VictimMarked\.test\.js\r?\n/.test(r.out));
check('shared mode exits 1 because of the unmarked victim', r.status === 1);
check('shared mode: the plain file and the polluter still pass',
  /^--- a1Pass\.test\.js: 1 ok, 0 failed/m.test(r.out) && /^--- a2Pollute\.test\.js: 1 ok, 0 failed/m.test(r.out));

// 3. Parity finds the difference, and only that one.
r = node('parity.js', ['--dir', fixtures]);
check('parity compares all four files', /Parity: 4 file\(s\) compared/.test(r.out));
check('parity reports the file that differs', /^DIFF {2}a3Victim\.test\.js$/m.test(r.out));
check('parity shows both results for it', /isolated: 1 ok, 0 failed, passed/.test(r.out) && /shared: {3}0 ok, 1 failed, FAILED/.test(r.out));
check('parity does not report the marked file or the others', !/DIFF {2}a3VictimMarked/.test(r.out) && !/DIFF {2}a1Pass/.test(r.out) && !/DIFF {2}a2Pollute/.test(r.out));
check('parity says how many differ and what to do', /PARITY FAILED: 1 file\(s\) differ/.test(r.out) && /isda-test: isolate/.test(r.out));
check('parity exits 1', r.status === 1);

// 4. Parity is clean when the offending file is left out, or marked.
r = node('parity.js', ['--dir', fixtures, 'a1', 'a2', 'a3VictimMarked']);
check('parity over the clean subset compares three files', /Parity: 3 file\(s\) compared/.test(r.out));
check('and finds no difference', /PARITY OK/.test(r.out) && !/DIFF/.test(r.out));
check('and exits 0', r.status === 0);

// 4b. Parity notices a difference in each dimension on its own: the ok count, the failed count, the result.
r = node('parity.js', ['--dir', diffFixtures, 'a2', 'a4']);
check('a file whose ok count alone differs is reported', /^DIFF {2}a4OkOnly\.test\.js$/m.test(r.out) && /isolated: 1 ok, 0 failed, passed/.test(r.out) && /shared: {3}2 ok, 0 failed, passed/.test(r.out));
r = node('parity.js', ['--dir', diffFixtures, 'a2', 'a5']);
check('a file whose failed count alone differs is reported', /^DIFF {2}a5FailedOnly\.test\.js$/m.test(r.out) && /isolated: 0 ok, 1 failed, FAILED/.test(r.out) && /shared: {3}0 ok, 2 failed, FAILED/.test(r.out));
r = node('parity.js', ['--dir', diffFixtures, 'a2', 'a6']);
check('a file whose pass/fail result alone differs is reported', /^DIFF {2}a6ResultOnly\.test\.js$/m.test(r.out) && /isolated: 1 ok, 0 failed, passed/.test(r.out) && /shared: {3}1 ok, 0 failed, FAILED/.test(r.out));

// 4c. --dir given relative to where parity was started, from another directory.
r = node('parity.js', ['--dir', path.relative(os.tmpdir(), fixtures), 'a1', 'a2', 'a3VictimMarked'], os.tmpdir());
check('a relative --dir works when parity is started from another directory', /PARITY OK/.test(r.out) && r.status === 0);

// 5. Nothing to compare is a failure, not a pass.
r = node('parity.js', ['--dir', fixtures, 'zzNoSuchFile']);
check('parity with no matching files exits 1', r.status === 1);
check('and says there was nothing to compare', /nothing to compare/.test(r.out));

// 6. The marker only counts as a comment line near the top of the file.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isda-e7j-'));
fs.copyFileSync(path.join(fixtures, 'a2Pollute.test.js'), path.join(tmp, 'p1Pollute.test.js'));
const victim = fs.readFileSync(path.join(fixtures, 'a3Victim.test.js'), 'utf8');
fs.writeFileSync(path.join(tmp, 'p2LateMarker.test.js'), '\n'.repeat(40) + '// @isda-test: isolate\n' + victim);
fs.writeFileSync(path.join(tmp, 'p3QuotedMarker.test.js'), "const note = '// @isda-test: isolate';\n" + victim);
r = node('run.js', ['--shared', '--dir', tmp]);
check('a marker below the first lines is ignored', /^--- p2LateMarker\.test\.js: 0 ok, 1 failed/m.test(r.out));
check('a marker inside a string is ignored', /^--- p3QuotedMarker\.test\.js: 0 ok, 1 failed/m.test(r.out));
check('and no file is reported as run by marker', !/by marker/.test(r.out));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

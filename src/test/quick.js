/**
 * quick.js - E7d: the quick tier. `npm run test:quick` runs only the test files related to what you changed,
 * then hands them to the normal runner (src/test/run.js), so the output, summary and exit code are the same.
 *
 * Selection (see quickSelect.js): changed or new test files, plus test files that mention an identifier your
 * change adds or removes in `src/*.js|ts` and that appears in few test files; page-building files that take a
 * long time are left out unless the webview code changed. It is an edit-loop aid and can miss a test: the full
 * suite (`npm test`) stays the gate before a push.
 *
 *   npm run test:quick                   changes since HEAD (staged, unstaged, new files)
 *   npm run test:quick -- --base main    changes since a ref instead of HEAD
 *   npm run test:quick -- --budget P     use up to P percent of the last full run's time on matched files (default 5)
 *   npm run test:quick -- --wide         the same as --budget 15: three times the tests, more safety
 *   npm run test:quick -- --max-df N     ignore identifiers found in more than N test files (default 40)
 *   npm run test:quick -- --explain      print what would run and why, do not run it
 *   any other argument (--isolate, --jobs N, --slow N ...) goes to run.js
 *   --root <dir>                         take the repository from <dir> (used by the tests)
 *
 * Timings come from `.isda-test-times.json`, which every full `npm test` run refreshes (it is git-ignored).
 * Without it, every file that builds a webview page counts as heavy.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { select, changedLines, GENERATED } = require('./quickSelect');

const args = process.argv.slice(2);
let root = path.join(__dirname, '..', '..');
let base = 'HEAD';
let maxDf = 40;
let budgetPct = 5;
let explain = false;
const pass = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root') root = path.resolve(args[++i] || '.');
  else if (args[i] === '--base') base = args[++i] || 'HEAD';
  else if (args[i] === '--wide') budgetPct = 15;
  else if (args[i] === '--budget') {
    budgetPct = Number(args[++i]);
    if (!(budgetPct > 0)) { console.error('--budget needs a number above 0 (percent of the last full run)'); process.exit(2); }
  }
  else if (args[i] === '--max-df') {
    maxDf = Number(args[++i]);
    if (!Number.isInteger(maxDf) || maxDf < 1) { console.error('--max-df needs a whole number of at least 1'); process.exit(2); }
  } else if (args[i] === '--explain') explain = true;
  else pass.push(args[i]);
}

function git(argv) {
  const r = spawnSync('git', argv, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

const inside = git(['rev-parse', '--is-inside-work-tree']);
if (!inside) { console.error('test:quick needs a git checkout (it reads your changes from git). Run npm test instead.'); process.exit(2); }
const tracked = (git(['diff', '--name-only', base, '--']) || '').split('\n').filter(Boolean);
const untracked = (git(['ls-files', '--others', '--exclude-standard']) || '').split('\n').filter(Boolean);
const changedFiles = Array.from(new Set(tracked.concat(untracked)));

const srcChanged = changedFiles.filter((f) => /^src\/[^/]+\.(js|ts)$/.test(f) && !GENERATED.test(f));
let diffText = srcChanged.filter((f) => tracked.includes(f)).length > 0
  ? git(['diff', '-U0', base, '--'].concat(srcChanged.filter((f) => tracked.includes(f)))) || ''
  : '';
for (const f of srcChanged.filter((f) => !tracked.includes(f))) {
  try { diffText += '\n' + fs.readFileSync(path.join(root, f), 'utf8').split('\n').map((l) => '+' + l).join('\n'); } catch (e) { /* gone */ }
}

const testDir = path.join(root, 'src', 'test');
const tests = {};
for (const f of fs.readdirSync(testDir).filter((x) => x.endsWith('.test.js'))) tests[f] = fs.readFileSync(path.join(testDir, f), 'utf8');
let times = null;
try { times = JSON.parse(fs.readFileSync(path.join(root, '.isda-test-times.json'), 'utf8')); } catch (e) { /* none yet */ }

const sel = select({ changedFiles, diffText, tests, times, maxDf, budgetPct });
const total = Object.keys(tests).length;
let share = '';
if (times) {
  const all = Object.values(times).reduce((a, b) => a + b, 0);
  const mine = sel.selected.reduce((a, s) => a + (times[s.file] || 0), 0);
  if (all > 0) share = ', about ' + (100 * mine / all).toFixed(1) + '% of the last full run\'s time';
}
console.log('Quick tier: ' + changedFiles.length + ' changed file(s) since ' + base + '; ' + sel.selected.length + ' of ' + total + ' test files selected' + share + ' (budget ' + budgetPct + '%).');
if (!sel.usedTimes) console.log('No timings recorded yet (a full npm test run writes .isda-test-times.json): every file that builds a webview page counts as heavy.');
sel.selected.forEach((s) => console.log('  ' + s.file + '  - ' + s.why.join('; ')));
if (sel.cut.length > 0) console.log('Over budget, not run (' + sel.cut.length + ' more matched, least specific last): ' + sel.cut.slice(0, 4).join(', ') + (sel.cut.length > 4 ? ', ...' : '') + '. --wide or --budget P adds them.');
if (sel.heavySkipped.length > 0) console.log('Left out as heavy (webview code unchanged): ' + sel.heavySkipped.length + ' file(s) that matched; they run when the webview code changes, or with npm test.');
sel.notes.forEach((n) => console.log('Note: ' + n));
console.log('The quick tier can miss a test. Run npm test before you push.');

if (explain) process.exit(0);
if (sel.selected.length === 0) { console.log('Nothing to run.'); process.exit(0); }
const r = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), '--dir', testDir, ...pass, ...sel.selected.map((s) => s.file)], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);

/**
 * e7eSharding.test.js - E7e (docs/sda-reference/FEATURE-ROADMAP.md): `node src/test/run.js --shard I/N` runs a
 * deterministic slice of the suite, and the GitHub Actions workflow runs every slice. What has to hold: the N shards
 * are exactly the files of a plain run, each once; sizes differ by at most one file; bad specs are refused; a
 * shard runs through the normal runner (summary, exit code); and the workflow's matrix matches the shard syntax.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { check, failureCount } = require('./helpers/harness');

const root = path.join(__dirname, '..', '..');
const fx = (name) => path.join(__dirname, 'fixtures', name);

function runner(args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), ...args], { cwd: root, encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}
const listed = (args) => runner(['--list', ...args]).out.split('\n').filter((l) => /\.test\.js$/.test(l));

// 1. The split, on a fixture directory of five files.
const dir = ['--dir', fx('runner-recycle')];
const all = listed(dir);
check('the fixture directory has five files', all.length === 5);
for (const n of [1, 2, 3, 5, 7]) {
  const shards = [];
  for (let i = 1; i <= n; i++) shards.push(listed([...dir, '--shard', i + '/' + n]));
  const union = [].concat(...shards);
  check('n=' + n + ': the shards together are exactly the plain list, each file once', union.length === all.length && new Set(union).size === all.length && all.every((f) => union.includes(f)));
  const sizes = shards.map((s) => s.length);
  check('n=' + n + ': shard sizes differ by at most one file', Math.max(...sizes) - Math.min(...sizes) <= 1);
}
check('shard 1/2 takes the files at positions 0, 2, 4 of the sorted list', listed([...dir, '--shard', '1/2']).join() === [all[0], all[2], all[4]].join());
check('shard 2/2 takes positions 1 and 3', listed([...dir, '--shard', '2/2']).join() === [all[1], all[3]].join());
check('a shard header says which slice this is', /^Shard 2\/3: 2 of 5 test file\(s\)$/m.test(runner([...dir, '--shard', '2/3', '--list']).out));

// 2. The real suite: four shards are the whole suite.
const real = listed([]);
const four = [1, 2, 3, 4].map((i) => listed(['--shard', i + '/4']));
const union = [].concat(...four);
check('the real suite: four shards are every test file exactly once', real.length > 300 && union.length === real.length && new Set(union).size === real.length);
check('the real shards are within one file of each other', Math.max(...four.map((s) => s.length)) - Math.min(...four.map((s) => s.length)) <= 1);

// 2b. Read through a pipe, --list must always give the whole list (run.js used to call process.exit right after printing,
// which dropped the tail of large output: seen as 231 of 323 names about one run in ten).
const counts = [];
for (let k = 0; k < 12; k++) counts.push(listed([]).length);
check('--list through a pipe returns every file on each of 12 runs', counts.every((c) => c === real.length));

// 3. Filters apply before the split; an empty shard is not a failure.
const filtered = listed(['r1', 'r2', 'r3', ...dir]);
check('name filters are applied first, then the split', filtered.length === 3 && listed(['r1', 'r2', 'r3', ...dir, '--shard', '1/2']).length === 2);
let r = runner([...dir, '--shard', '7/7']);
check('a shard with no files exits 0 and says so', r.status === 0 && /No test files in this shard\./.test(r.out));
r = runner(['nomatch-anywhere', ...dir, '--shard', '1/2']);
check('a name filter that matches nothing is still an error under --shard', r.status === 1 && /No test files match/.test(r.out));

// 4. Validation.
for (const bad of ['0/4', '5/4', '1/0', 'a/b', '2', '2/', '/4', '-1/4']) {
  r = runner([...dir, '--shard', bad]);
  check('--shard ' + bad + ' is refused with exit 2', r.status === 2 && /--shard needs I\/N/.test(r.out));
}

// 5. A shard runs through the normal runner.
r = runner([...dir, '--shard', '1/2']);
check('a shard runs its files with the normal summary and exit 0', r.status === 0 && /Files: 3 {3}checks passed: 3/.test(r.out) && /ALL CHECKS PASSED/.test(r.out) && !/r2Pid\.test\.js ===/.test(r.out));
r = runner([...dir, '--shard', '2/2', '--isolate', '--jobs', '2']);
check('it combines with --isolate --jobs', r.status === 0 && /Files: 2 {3}checks passed: 2/.test(r.out) && /^Jobs: 2/m.test(r.out));

// 6. The workflow.
// The workflow belongs in .github/workflows/test.yml; until it can be pushed there (that needs a token with the `workflow`
// scope) the copy in docs/sda-reference/ci/ is the one checked.
const live = path.join(root, '.github', 'workflows', 'test.yml');
const wf = fs.readFileSync(fs.existsSync(live) ? live : path.join(root, 'docs', 'sda-reference', 'ci', 'test.yml'), 'utf8');
const matrix = (wf.match(/shard:\s*\[([^\]]*)\]/) || [])[1] || '';
const specs = matrix.split(',').map((x) => x.replace(/['\s]/g, '')).filter(Boolean);
check('the workflow runs on push to main, on pull requests and on request', /^on:/m.test(wf) && /push:\s*\n\s*branches: \[main\]/.test(wf) && /pull_request:/.test(wf) && /workflow_dispatch:/.test(wf));
check('its matrix lists every shard 1/N .. N/N exactly once', specs.length > 0 && specs.every((s, i) => s === (i + 1) + '/' + specs.length));
check('the suite job installs, compiles and runs the matrix shard', /npm ci/.test(wf) && /npm run compile/.test(wf) && /run: node src\/test\/run\.js --shard \$\{\{ matrix\.shard \}\}/.test(wf));
check('the keyword index check has its own job', /generate_keyword_index\.js --check/.test(wf));
check('the parity check is separate (scheduled or on request), not on every push', /npm run test:parity/.test(wf) && /github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/.test(wf));
check('the shard count in the workflow is what the README names', specs.length === 4 && /--shard I\/N/.test(fs.readFileSync(path.join(root, 'README.md'), 'utf8')));

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

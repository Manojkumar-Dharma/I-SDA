/**
 * e7dQuickTier.test.js - E7d (docs/sda-reference/FEATURE-ROADMAP.md): `npm run test:quick` picks the test files
 * related to a change. Part 1 drives the pure selection (quickSelect.js) with in-memory files; part 2 runs the
 * command line against a throw-away git repository.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { check, failureCount } = require('./helpers/harness');
const { select, changedLines } = require('./quickSelect');

const names = (r) => r.selected.map((s) => s.file);

// ---- Part 1: selection ------------------------------------------------------------------------------------
const tests = {
  'a1Alpha.test.js': "check('alphaWidgetCount is 3', alphaWidgetCount() === 3);",
  'a2Beta.test.js': "check('alphaWidgetCount and betaGizmoSize', alphaWidgetCount() && betaGizmoSize());",
  'a3Heavy.test.js': "const dom = newWebviewDom(html, {}); check('alphaWidgetCount in a page', true);",
  'a4Other.test.js': "check('nothing related', true);",
  'a5Common.test.js': "check('the commonHelperName', commonHelperName());",
  'a6Common.test.js': "check('the commonHelperName', commonHelperName());",
  'a7Common.test.js': "check('the commonHelperName', commonHelperName());",
};
const diff = '--- a/src/foo.js\n+++ b/src/foo.js\n@@ -1 +1 @@\n-function alphaWidgetCount() { return 2; }\n+function alphaWidgetCount() { return 3; }\n';

let r = select({ changedFiles: ['src/foo.js'], diffText: diff, tests, maxDf: 6 });
check('a changed identifier selects the tests that mention it', names(r).join() === 'a1Alpha.test.js,a2Beta.test.js');
check('the reason names the identifier', /alphaWidgetCount/.test(r.selected[0].why[0]));
check('a file that builds a page is left out when the webview code is unchanged (no timings)', r.heavySkipped.join() === 'a3Heavy.test.js' && !r.usedTimes);

r = select({ changedFiles: ['src/foo.js', 'src/buildWebviewTemplate.js'], diffText: diff, tests, maxDf: 6 });
check('it is eligible once webview code changed', names(r).includes('a3Heavy.test.js') && r.webview);

r = select({ changedFiles: ['src/foo.js'], diffText: diff, tests, times: { 'a1Alpha.test.js': 1, 'a2Beta.test.js': 20, 'a3Heavy.test.js': 1, 'a4Other.test.js': 1 }, maxDf: 6, budgetPct: 100 });
check('with timings, heavy means slow (a 20 s file is out, a quick page builder is in)', names(r).join() === 'a1Alpha.test.js,a3Heavy.test.js' && r.usedTimes);

r = select({ changedFiles: ['src/test/a4Other.test.js', 'src/foo.js'], diffText: diff, tests, maxDf: 6 });
check('a changed test file always runs, first', names(r)[0] === 'a4Other.test.js' && r.selected[0].why[0] === 'changed test file');

const commentOnly = '--- a/src/foo.js\n+++ b/src/foo.js\n@@ -1 +1 @@\n-// alphaWidgetCount used to return 2\n+// alphaWidgetCount returns 3 now\n';
check('comment-only lines are not used to pick tests', changedLines(commentOnly) === '' && select({ changedFiles: ['src/foo.js'], diffText: commentOnly, tests, maxDf: 6 }).selected.length === 0);

const common = '+x = commonHelperName();\n';
r = select({ changedFiles: ['src/foo.js'], diffText: common, tests, maxDf: 2 });
check('an identifier found in more than maxDf test files is ignored, and the run says why nothing was picked', r.selected.length === 0 && r.notes.some((n) => /No identifier/.test(n)));
check('...but is used when the limit allows it', select({ changedFiles: ['src/foo.js'], diffText: common, tests, maxDf: 3 }).selected.length === 3);

// Ranking and budget: 10 files of 1 s (total 10 s); budget 20% allows 2 s. The file that matches the rarest word comes first.
const many = {};
const times = {};
for (let i = 0; i < 10; i++) { many['m' + i + '.test.js'] = 'rareWord' + (i < 2 ? 'One' : '') + ' sharedWord'; times['m' + i + '.test.js'] = 1; }
r = select({ changedFiles: ['src/foo.js'], diffText: '+rareWordOne(); sharedWord();', tests: many, times, maxDf: 40, budgetPct: 20 });
check('matched files are taken until the time budget is used, the rest are reported as cut', r.selected.length === 2 && r.cut.length === 8);
check('the most specific matches (the two that mention the rare word) are the ones taken', names(r).join() === 'm0.test.js,m1.test.js');
r = select({ changedFiles: ['src/foo.js'], diffText: '+sharedWord();', tests: many, times, maxDf: 40, budgetPct: 1 });
check('the first matched file is taken even if it alone is over the budget', r.selected.length === 1);
r = select({ changedFiles: ['src/foo.js'], diffText: '+sharedWord();', tests: many, maxDf: 40, fallbackFiles: 4 });
check('without timings the cap is a number of files', r.selected.length === 4 && r.cut.length === 6);

r = select({ changedFiles: ['src/test/helpers/common.js'], diffText: '', tests, maxDf: 6 });
check('a changed shared test helper is flagged, not guessed at', r.selected.length === 0 && r.notes.some((n) => /shared test support/.test(n)));

// ---- Part 2: the command ----------------------------------------------------------------------------------
const gitOk = spawnSync('git', ['--version']).status === 0;
check('git is available', gitOk);
if (gitOk) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isda-e7d-'));
  const git = (...a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8' });
  fs.mkdirSync(path.join(tmp, 'src', 'test'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'foo.js'), 'function alphaWidgetCount() { return 2; }\nmodule.exports = { alphaWidgetCount };\n');
  const passing = (label) => "console.log('  ok  - " + label + "'); process.exit(0);\n";
  fs.writeFileSync(path.join(tmp, 'src', 'test', 'a1.test.js'), "// alphaWidgetCount\n" + passing('a1'));
  fs.writeFileSync(path.join(tmp, 'src', 'test', 'a2.test.js'), passing('a2'));
  fs.writeFileSync(path.join(tmp, 'src', 'test', 'a3Slow.test.js'), "// alphaWidgetCount\n" + passing('a3'));
  fs.writeFileSync(path.join(tmp, '.isda-test-times.json'), JSON.stringify({ 'a1.test.js': 1, 'a2.test.js': 1, 'a3Slow.test.js': 30 }));
  git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 't'); git('add', '-A'); git('commit', '-qm', 'base');
  const quick = (...a) => { const x = spawnSync(process.execPath, [path.join(__dirname, 'quick.js'), '--root', tmp, ...a], { encoding: 'utf8' }); return { out: (x.stdout || '') + (x.stderr || ''), status: x.status }; };

  let q = quick('--explain');
  check('no change: nothing is selected', /0 of 3 test files selected/.test(q.out) && q.status === 0);

  fs.writeFileSync(path.join(tmp, 'src', 'foo.js'), 'function alphaWidgetCount() { return 3; }\nmodule.exports = { alphaWidgetCount };\n');
  q = quick('--explain');
  check('a changed source line selects the fast test that mentions it, and says why', /1 of 3 test files selected/.test(q.out) && /a1\.test\.js {2}- mentions alphaWidgetCount/.test(q.out));
  check('the 30 s file that also matched is reported as left out', /Left out as heavy[^\n]*1 file/.test(q.out) && !/a3Slow\.test\.js {2}-/.test(q.out));
  check('the output says it can miss a test and shows the budget', /can miss a test/.test(q.out) && /budget 5%/.test(q.out));

  q = quick();
  check('without --explain the selected file runs through the normal runner (summary and exit 0)', q.status === 0 && /=== a1\.test\.js ===/.test(q.out) && /Files: 1 {3}checks passed: 1/.test(q.out) && !/a2\.test\.js ===/.test(q.out));

  fs.writeFileSync(path.join(tmp, 'src', 'test', 'a2.test.js'), "console.log('FAIL  - a2 broke'); process.exit(1);\n");
  q = quick();
  check('a changed test file runs too, and its failure fails the quick run', q.status === 1 && /=== a2\.test\.js ===/.test(q.out) && /FAILED FILES \(1\)/.test(q.out));

  git('checkout', '-q', '--', '.');
  git('commit', '-qam', 'again', '--allow-empty');
  fs.writeFileSync(path.join(tmp, 'src', 'bar.js'), 'function alphaWidgetCount2() {}\n');
  q = quick('--explain');
  check('a new, untracked source file counts as changed (its identifiers are used)', /1 changed file/.test(q.out) || /changed file\(s\)/.test(q.out));

  q = quick('--budget', '0');
  check('--budget needs a number above 0', q.status === 2);
  q = quick('--max-df', 'x');
  check('--max-df needs a whole number', q.status === 2);

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * quickSelect.js - E7d: which test files the quick tier (`npm run test:quick`) runs for a change.
 * Pure: everything it needs is passed in, so src/test/e7dQuickTier.test.js can drive it with in-memory data.
 *
 * A file is selected when
 *   1. it is a changed or new `*.test.js` file, or
 *   2. its text contains an identifier that the change adds or removes in the source files (comment-only lines
 *      do not count), where an identifier is a word of 5 or more characters found in at most `maxDf` test files
 *      (a word found in nearly every file says nothing about which file is related), and
 *   3. (for 2) it is not a heavy file - one that took more than `heavySecs` in the last full run, or, when no
 *      timings are known, one that builds a webview page - unless the change touches the webview code.
 * Files chosen by rule 2 are ranked by how specific their matches are (a match on a word found in 2 test files
 * counts for more than one found in 30) and taken in that order until `budgetPct` percent of the last full run's
 * time is used; the rest are reported as cut. Without timings the cap is `fallbackFiles` files.
 *
 * The quick tier is an edit-loop aid. It can miss a test that depends on the change through an identifier
 * the change does not spell out; the full suite (`npm test`) remains the gate before a push.
 */
'use strict';

const WORD = /[A-Za-z_][A-Za-z0-9_]{4,}/g;
const PAGE_BUILDER = /newWebviewDom\(|leaseDspfPage\(|webviewHtml\(|menuWebviewHtml\(|getWebviewHtml\(|getMenuWebviewHtml\(/;
const WEBVIEW_CODE = /^src\/(buildWebviewTemplate|buildMenuWebviewTemplate|webviewClientHelpers)\.js$|^src\/extension\.ts$|^src\/(webviewTemplate|menuWebviewTemplate)\.ts$/;
const GENERATED = /^src\/(webviewTemplate|menuWebviewTemplate)\.ts$/;

function words(text) {
  return new Set(text.match(WORD) || []);
}

/** Added and removed lines of a `git diff -U0` text, without the file headers. */
function changedLines(diffText) {
  return diffText.split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
    .filter((l) => !/^[+-]\s*(\/\/|\/\*|\*)/.test(l)) // comment-only lines name things loosely
    .join('\n');
}

/**
 * @param {object} o
 * @param {string[]} o.changedFiles   repo-relative paths that changed (tracked changes and new files)
 * @param {string} o.diffText         `git diff -U0` text for the changed source files (new source files: their text as + lines)
 * @param {Object<string,string>} o.tests   test file name -> its text
 * @param {Object<string,number>} [o.times] test file name -> seconds in the last full run
 * @param {number} [o.maxDf=40]
 * @param {number} [o.heavySecs=8]
 * @param {number} [o.budgetPct=5]       share of the last full run's time the rule-2 files may use
 * @param {number} [o.fallbackFiles=15]  cap on rule-2 files when no timings are known
 * @returns {{ cut: string[], selected: Array<{file:string, why:string[]}>, notes: string[], webview: boolean, heavySkipped: string[], usedTimes: boolean }}
 */
function select(o) {
  const maxDf = o.maxDf === undefined ? 40 : o.maxDf;
  const budgetPct = o.budgetPct === undefined ? 5 : o.budgetPct;
  const fallbackFiles = o.fallbackFiles === undefined ? 15 : o.fallbackFiles;
  const heavySecs = o.heavySecs === undefined ? 8 : o.heavySecs;
  const times = o.times && Object.keys(o.times).length > 0 ? o.times : null;
  const names = Object.keys(o.tests).sort();
  const notes = [];

  const isTestFile = (f) => /^src\/test\/[^/]+\.test\.js$/.test(f);
  const changedTests = o.changedFiles.filter(isTestFile).map((f) => f.slice('src/test/'.length)).filter((n) => o.tests[n] !== undefined);
  const srcFiles = o.changedFiles.filter((f) => /^src\/[^/]+\.(js|ts)$/.test(f));
  const webview = srcFiles.some((f) => WEBVIEW_CODE.test(f));
  o.changedFiles.filter((f) => /^src\/test\//.test(f) && !isTestFile(f) && !/\/fixtures\//.test(f)).forEach((f) => {
    notes.push(f + ' is shared test support (a helper, the runner or a worker): the quick tier cannot tell which files use it - run npm test.');
  });
  if (o.changedFiles.some((f) => /^src\/test\/fixtures\//.test(f))) notes.push('A runner fixture changed: run src/test/e7*.test.js or npm test.');

  const heavy = (n) => (times ? (times[n] !== undefined ? times[n] > heavySecs : PAGE_BUILDER.test(o.tests[n])) : PAGE_BUILDER.test(o.tests[n]));

  // Document frequency of every word over all test files.
  const df = new Map();
  const wordsOf = {};
  for (const n of names) {
    wordsOf[n] = words(o.tests[n]);
    wordsOf[n].forEach((w) => df.set(w, (df.get(w) || 0) + 1));
  }
  const matchedBy = new Map(); // test -> [identifiers]
  const score = new Map(); // test -> sum of 1/df over its matched identifiers
  const heavySkipped = new Set();
  const ids = Array.from(words(changedLines(o.diffText || ''))).sort();
  let usable = 0;
  for (const w of ids) {
    const d = df.get(w) || 0;
    if (d === 0 || d > maxDf) continue;
    usable++;
    for (const n of names) {
      if (!wordsOf[n].has(w)) continue;
      if (!webview && heavy(n)) { heavySkipped.add(n); continue; }
      if (!matchedBy.has(n)) matchedBy.set(n, []);
      matchedBy.get(n).push(w);
      score.set(n, (score.get(n) || 0) + 1 / d);
    }
  }
  if (srcFiles.length > 0 && usable === 0) notes.push('No identifier in the source change is found in a usable number of test files (1 to ' + maxDf + ') to pick tests by; only changed test files run. Run npm test.');
  if (webview) notes.push('Webview code changed: page-building test files are eligible.');

  const selected = [];
  const seen = new Set();
  for (const n of changedTests) { selected.push({ file: n, why: ['changed test file'] }); seen.add(n); }
  const total = times ? Object.values(times).reduce((a, b) => a + b, 0) : 0;
  const ranked = Array.from(matchedBy.keys()).filter((n) => !seen.has(n))
    .sort((a, b) => (score.get(b) - score.get(a)) || (a < b ? -1 : 1));
  const cut = [];
  let used = 0;
  let taken = 0;
  for (const n of ranked) {
    const t = times && times[n] !== undefined ? times[n] : 0;
    const over = times ? (used + t > total * budgetPct / 100) : (taken >= fallbackFiles);
    if (over && taken > 0) { cut.push(n); continue; }
    used += t; taken++;
    const w = matchedBy.get(n);
    selected.push({ file: n, why: ['mentions ' + w.slice(0, 3).join(', ') + (w.length > 3 ? ' (+' + (w.length - 3) + ')' : '')] });
  }
  const skipped = Array.from(heavySkipped).filter((n) => !seen.has(n) && !matchedBy.has(n)).sort();
  return { cut, selected, notes, webview, heavySkipped: skipped, usedTimes: !!times };
}

module.exports = { select, changedLines, words, GENERATED, WEBVIEW_CODE };

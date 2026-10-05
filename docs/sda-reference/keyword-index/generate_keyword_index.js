#!/usr/bin/env node
'use strict';
/**
 * generate_keyword_index.js - Task I-121t. Generates the three keyword-index files from
 * src/keywordIndexData.js (the curated placement table) - replacing build_index.py and
 * build_lookup_and_md.py, whose output (the I-40 baseline) this reproduces byte for byte:
 *
 *   KEYWORD-INDEX.json    level -> category -> keywords (the picker's own tab structure)
 *   KEYWORD-LOOKUP.json   flat keyword -> [ { level, category, ... } ]
 *   KEYWORD-INDEX.md      the readable rendering of both
 *
 * Usage (from the repo root):
 *   node docs/sda-reference/keyword-index/generate_keyword_index.js           write the three files
 *   node docs/sda-reference/keyword-index/generate_keyword_index.js --check   exit 1 if a file differs
 *   node docs/sda-reference/keyword-index/generate_keyword_index.js --date=YYYY-MM-DD   stamp that date
 *
 * Needs only Node. The JSON is written the way Python's json.dump(indent=2) wrote it (ASCII-only,
 * \uXXXX escapes) so a regeneration changes only the lines whose data changed.
 */
const fs = require('fs');
const path = require('path');

const DATA = require(path.join(__dirname, '../../../src/keywordIndexData.js'));
const OUT_DIR = __dirname;

/** JSON text exactly as Python's json.dump(value, indent=2) writes it (ensure_ascii on). */
function pyJson(value, indent) {
  indent = indent || 0;
  const pad = '  '.repeat(indent + 1);
  const end = '  '.repeat(indent);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)).replace(/\u007f/g, '\u007f');
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return '[\n' + value.map((v) => pad + pyJson(v, indent + 1)).join(',\n') + '\n' + end + ']';
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  return '{\n' + keys.map((k) => pad + pyJson(k, 0) + ': ' + pyJson(value[k], indent + 1)).join(',\n') + '\n' + end + '}';
}
// Python leaves U+007F as it is; the replace above would escape it, so the escape range starts at U+0080.
function pyJsonSafe(value) { return pyJson(value, 0).replace(/\\u007f/g, '\u007f'); }

function buildIndex(date) {
  const levels = DATA.LEVELS.map((l) => ({
    level: l.level,
    description: l.description,
    categories: l.categories.map((c) => ({
      category: c.category,
      description: c.description,
      sharedWith: c.sharedWith,
      screenshotDir: c.screenshotDir,
      keywords: c.keywords.map((k) => {
        const e = { keyword: k.keyword, description: k.description, parameters: k.parameters, repeatable: k.repeatable };
        if (k.s36e) e.s36e = k.s36e;
        return e;
      })
    }))
  }));
  return {
    meta: {
      title: DATA.META.title,
      purpose: DATA.META.purpose,
      generated: date || DATA.META.generated,
      source_repo: DATA.META.source_repo,
      notes: DATA.META_NOTES.slice(),
      totalCategories: levels.reduce((n, l) => n + l.categories.length, 0),
      totalKeywordEntries: levels.reduce((n, l) => n + l.categories.reduce((m, c) => m + c.keywords.length, 0), 0)
    },
    levels: levels
  };
}

function buildLookup(index) {
  const map = {};
  index.levels.forEach((l) => l.categories.forEach((c) => c.keywords.forEach((k) => {
    const entry = {
      level: l.level,
      category: c.category,
      description: k.description,
      parameters: k.parameters || '',
      repeatable: !!k.repeatable,
      screenshotDir: c.screenshotDir === undefined ? null : c.screenshotDir,
      sharedWith: c.sharedWith || []
    };
    if (k.s36e) entry.s36e = k.s36e;
    (map[k.keyword] = map[k.keyword] || []).push(entry);
  })));
  const sorted = {};
  Object.keys(map).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).forEach((k) => { sorted[k] = map[k]; });
  return {
    meta: {
      purpose: "Flat keyword -> location map for quick-find/navigation. Look up a keyword name (e.g. 'COLOR') to see every level/category it appears under in iSDA's UI.",
      uniqueKeywords: Object.keys(sorted).length,
      generated: index.meta.generated
    },
    keywords: sorted
  };
}

function buildMarkdown(index, lookup) {
  const esc = (s) => (s ? String(s).replace(/\|/g, '\\|') : s);
  const names = Object.keys(lookup.keywords);
  const L = [];
  L.push('# iSDA Keyword Index', '', index.meta.purpose, '');
  L.push('Generated ' + index.meta.generated + ' \u00b7 ' + index.meta.totalKeywordEntries + ' keyword entries across ' + index.meta.totalCategories + ' categories \u00b7 ' + names.length + ' unique keyword names.', '');
  L.push("For notes on scope/methodology, see the JSON files' own `meta` block: `KEYWORD-INDEX.json` (structured by level/category, matches iSDA's own UI tabs) and `KEYWORD-LOOKUP.json` (flat keyword -> location map, for quick search).", '', '---', '');
  L.push('## Quick keyword lookup (alphabetical)', '', '| Keyword | Level(s) / Category(ies) |', '|---|---|');
  names.forEach((name) => {
    const entries = lookup.keywords[name];
    const locs = entries.map((e) => e.level + ' \u2192 ' + esc(e.category)).join('; ');
    const marker = entries.some((e) => e.s36e) ? ' \u26a0\ufe0f' : '';
    L.push('| `' + name + '`' + marker + ' | ' + locs + ' |');
  });
  L.push('', '---', '', '## S36E-conditional keywords (S36-6)', '');
  L.push("The 7 keywords `USRDSPMGT` restricts, plus `USRDSPMGT` itself (marked \u26a0\ufe0f above and in the tables below). Full rule detail/citations live in Task S36-3's own rule table (`src/dspfWriter.js`'s `S36E_KEYWORD_RESTRICTIONS`) and its LIMITATIONS-PLAN.md row - this table is a pointer, not a restatement. All 7 are now verified (Task S36-3 update, using the official IBM PDF at `docs/sda-reference/source/DDS_Keyword_V7r6.pdf`), but only 3 (`CHANGE` record-level, `HELP`/`HLPRTN`, `PRINT`) are actually gated by `USRDSPMGT` and wired as hard UI blocks (S36-3/S36-4); the other 4 (`ALTNAME`, `MSGID`, `RETKEY`, `RETCMDKEY`) turned out to be general rules IBM documents alongside the S36E material, not conditioned on `USRDSPMGT` at all.", '');
  L.push('| Keyword | Status | Note |', '|---|---|---|');
  const seen = new Set();
  names.forEach((name) => lookup.keywords[name].forEach((e) => {
    if (e.s36e && !seen.has(name)) {
      seen.add(name);
      L.push('| `' + name + '` | ' + (DATA.S36E_STATUS[name] || 'verified') + ' | ' + esc(e.s36e) + ' |');
    }
  }));
  L.push('', '---', '', '## By level and category', '');
  index.levels.forEach((lvl) => {
    L.push('## ' + lvl.level.charAt(0).toUpperCase() + lvl.level.slice(1).toLowerCase() + '-level', '', lvl.description, '');
    lvl.categories.forEach((cat) => {
      L.push('### ' + cat.category, '', cat.description);
      if (cat.sharedWith && cat.sharedWith.length) L.push('', '*Shared with:* ' + cat.sharedWith.join(', '));
      if (cat.screenshotDir) L.push('', '*Reference screenshots:* `docs/sda-reference/' + cat.screenshotDir + '/`');
      L.push('', '| Keyword | Description | Parameters | Repeatable | S36E |', '|---|---|---|---|---|');
      cat.keywords.forEach((k) => {
        L.push('| `' + esc(k.keyword) + '` | ' + esc(k.description) + ' | ' + esc(k.parameters || '') + ' | ' + (k.repeatable ? 'yes' : '') + ' | ' + (k.s36e ? '\u26a0\ufe0f' : '') + ' |');
      });
      L.push('');
    });
  });
  return L.join('\n');
}

/** The three files' text, keyed by file name. */
function generate(date) {
  const index = buildIndex(date);
  const lookup = buildLookup(index);
  return {
    'KEYWORD-INDEX.json': pyJsonSafe(index),
    'KEYWORD-LOOKUP.json': pyJsonSafe(lookup),
    'KEYWORD-INDEX.md': buildMarkdown(index, lookup)
  };
}

module.exports = { generate: generate, buildIndex: buildIndex, buildLookup: buildLookup, buildMarkdown: buildMarkdown, pyJson: pyJsonSafe };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dateArg = args.filter((a) => a.indexOf('--date=') === 0)[0];
  const out = generate(dateArg ? dateArg.slice(7) : null);
  if (args.indexOf('--check') >= 0) {
    const stale = Object.keys(out).filter((f) => !fs.existsSync(path.join(OUT_DIR, f)) || fs.readFileSync(path.join(OUT_DIR, f), 'utf8') !== out[f]);
    if (stale.length) { console.error('Out of date with src/keywordIndexData.js: ' + stale.join(', ')); process.exit(1); }
    console.log('Keyword index files are up to date.');
  } else {
    Object.keys(out).forEach((f) => fs.writeFileSync(path.join(OUT_DIR, f), out[f]));
    console.log('Wrote ' + Object.keys(out).join(', '));
  }
}

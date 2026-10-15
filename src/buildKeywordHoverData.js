'use strict';
/**
 * buildKeywordHoverData.js - E1c. Builds dist/keywordHoverData.json, the data the hover (ddsHover.js) reads at run
 * time. docs/** is not in the VSIX, so what the hover needs from it is copied here once, at build time:
 *
 *   keywords    - docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json's keyword table (the generated keyword index:
 *                 level, category, description, parameter label, repeatable, System/36 note).
 *   references  - for each keyword, the title and line of its section in docs/sda-reference/source/DDS_Keyword_V7r6.txt
 *                 (IBM's DDS Reference text): the one hover citation. A keyword whose section heading this cannot
 *                 read has no entry, and the hover then cites the reference without a section.
 *
 * Run by `npm run build:webview-assets` (node src/buildKeywordHoverData.js); build() is exported for the tests.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOOKUP_PATH = path.join(ROOT, 'docs', 'sda-reference', 'keyword-index', 'KEYWORD-LOOKUP.json');
const REFERENCE_PATH = path.join(ROOT, 'docs', 'sda-reference', 'source', 'DDS_Keyword_V7r6.txt');
const OUT_PATH = path.join(ROOT, 'dist', 'keywordHoverData.json');

// The reference's own names for the keyword families the index lists as a range.
const FAMILY = { CAnn: 'CA01-CA24', CFnn: 'CF01-CF24' };

/** The keyword names a section heading covers: "PAGEDOWN/PAGEUP (Page Down/Page Up)" -> PAGEDOWN, PAGEUP. */
function namesOfHeading(prefix) {
  const names = [];
  const parts = prefix.split(/\s+\([^)]*\)|\s+and\s+|\/|,\s*/);
  for (const part of parts) {
    const p = part.trim();
    if (!/^[A-Z][A-Za-z0-9]*$/.test(p)) continue;
    names.push(FAMILY[p] || p);
  }
  return names;
}

/**
 * The last section heading of each keyword in the reference text. Every heading appears twice, once in the
 * table of contents (ending in dot leaders and a page number, which the pattern does not match) and once in the
 * body, and "Related reference" cross-links repeat it indented; only a heading in the first column counts, and
 * where one still repeats, the later line wins.
 */
function readReferences(text) {
  const raw = text.split(/\r\n|\r|\n/);
  // A real section heading starts in the first column (after the page-break character the text keeps); an
  // indented one is a "Related reference" cross-link or a table-of-contents entry.
  const atMargin = raw.map((l) => /^\f?\S/.test(l));
  const lines = raw.map((l) => l.replace(/^[\s\f]+|\s+$/g, ''));
  const found = {};
  const heading = /^(\S.*?\)(?: and \S+ \([^)]*\))?) keywords?(?: for display files)?$/i;
  for (let i = 0; i < lines.length; i++) {
    if (!atMargin[i]) continue;
    let title = lines[i];
    let m = heading.exec(title);
    if (!m && i + 1 < lines.length && /^(keywords?\b|files$)/i.test(lines[i + 1])) {
      // a heading wrapped over two lines ("... (Error Message Identifier)" / "keywords for display files")
      title = lines[i] + ' ' + lines[i + 1];
      m = heading.exec(title);
    }
    if (!m) continue;
    for (const name of namesOfHeading(m[1])) found[name] = { title, line: i + 1 };
  }
  return found;
}

function build() {
  const lookup = JSON.parse(fs.readFileSync(LOOKUP_PATH, 'utf8'));
  const referenceText = fs.readFileSync(REFERENCE_PATH, 'utf8');
  const all = readReferences(referenceText);
  const references = {};
  for (const name of Object.keys(lookup.keywords)) if (all[name]) references[name] = all[name];
  return { keywords: lookup.keywords, references };
}

if (require.main === module) {
  const data = build();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(data));
  console.log('Generated dist/keywordHoverData.json (' + Object.keys(data.keywords).length + ' keywords, ' +
    Object.keys(data.references).length + ' with a DDS Reference section)');
}

module.exports = { build, readReferences, namesOfHeading };

# Keyword Index

Full inventory of every DDS keyword iSDA's visual designer exposes, organized
by level (File/Record/Field) and by the exact UI category/tab iSDA shows it
under. Built to support two things directly:

1. **Comparison against real IBM i SDA** — each category links to its
   reference screenshot folder under `docs/sda-reference/screens/`, so a
   keyword's entry here can be checked side-by-side against the real 5250
   screen it came from.
2. **Quick keyword find/navigation** — `KEYWORD-LOOKUP.json` is a flat
   `keyword name -> [ { level, category, description, ... } ]` map, meant to
   back a "type a keyword, jump to its picker" search feature (not yet wired
   into the extension's own UI — this is the data layer for that, should it
   be built).

## Files

- **`KEYWORD-INDEX.json`** — structured by level → category → keywords,
  matching iSDA's own UI tab structure exactly (same category names shown in
  the app). This is the source of truth; everything else is derived from it.
- **`KEYWORD-LOOKUP.json`** — flat keyword-name → location(s) map, derived
  from `KEYWORD-INDEX.json`. A keyword that appears in several categories
  (e.g. `TEXT` at both file- and record-level, `CHECK` in five different
  panels) lists every one.
- **`KEYWORD-INDEX.md`** — human-readable rendering of both of the above:
  one big alphabetical lookup table, then the full level/category breakdown.
- **`build_index.py`** / **`build_lookup_and_md.py`** — the two scripts that
  generate all three files above from hand-curated data. Not run as part of
  `npm run compile` or `npm test` — this is documentation tooling, not part
  of the extension's runtime.

## Scope and accuracy

This was built by reading `src/webviewClientHelpers.js`'s panel-building
functions directly (`fileKeywordsPanelsHtml`, `recordKeywordsPanelsHtml`,
`sflCtlPanelsHtml`, `windowPanelsHtml`, `keyingOptionsHtml`, etc.) — the exact
same code that renders iSDA's own UI — rather than reconstructed from memory
or from the reference screenshots alone. Every keyword name and its
category placement is ground-truth as of the date in each JSON file's own
`meta.generated` field.

**This is a point-in-time snapshot, not a live view.** It does not
auto-regenerate when keywords are added, removed, or moved between panels.
If iSDA's own picker structure changes, re-run the extraction against the
current `webviewClientHelpers.js`/`dspfWriter.js` and update
`build_index.py` accordingly — treat a stale entry here as a documentation
bug, not a reflection of the extension's current behavior.

## Regenerating

```bash
python3 build_index.py            # writes KEYWORD-INDEX.json
python3 build_lookup_and_md.py    # writes KEYWORD-LOOKUP.json + KEYWORD-INDEX.md
```

Requires only Python 3's standard library (`json`, `datetime`, `collections`)
— no extra dependencies.

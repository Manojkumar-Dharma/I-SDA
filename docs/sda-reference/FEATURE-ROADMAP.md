# Feature roadmap: epics and sub-tasks (E-series)

The keyword-compliance audit (`I-` tasks, [`keywordFixes.md`](keywordFixes.md)) closed at v0.11.0.
This document tracks the **next body of work**: eleven feature epics, each split into sub-tasks that
parallel sessions can claim independently. It sits beside [`LIMITATIONS-PLAN.md`](LIMITATIONS-PLAN.md)
(accepted constraints, `L`/`M`/`P`/`S36-` tasks) and does not replace it: when an epic closes an
accepted limitation, the epic's release sub-task also updates that entry.

---

## How this document works

**IDs.** `E<n>` is a **main task (epic)**; `E<n><letter>` is one of its **sub-tasks** (`E1a`, `E1b`, ...).
IDs are unique across the repo (the `E` prefix is not used by any other series), are numbered in the
order they were *opened*, and are **never reused or renumbered**. A sub-task added later takes the next
free letter, even if it belongs earlier in the epic's story. The last sub-task of every epic is its
**Release** sub-task.

**Parallel work.**
- A sub-task is claimable on its own unless its *Depends on* column names something not yet `Done`.
- Claim with a `Claim E<id>` commit that sets the sub-task's row to `In progress` (Version `—`); push it
  immediately, as for `I-` tasks. `git fetch` and drift-check before every commit and every push.
- A sub-task marked **Decision first** starts with a short written proposal in its own section, and
  Manojkumar's answer is recorded there before any code is written.
- Research and decision sub-tasks may land as `Done (no code change)`.

**Definition of done for a sub-task.** Its new tests fail against the old code; `npm run compile` and the
full `npm test` pass with zero failures; this document (row + section) and `CHANGELOG.md` are updated; the
version is bumped in `package.json` and `package-lock.json`. A sub-task lands as the next **patch**
version (`0.11.x`); if the number is taken by a parallel session, bump again.

**Epic release (the "full version rollout").** An epic is finished only when every sub-task is `Done` and
its **Release** sub-task has landed. The Release sub-task: confirms the epic's acceptance list below is met,
runs the full suite, updates `README.md` (features, commands, settings) and `LIMITATIONS-PLAN.md` where the
epic closes a limitation, writes one summary line in `CHANGELOG.md`, bumps to the **next free minor version**
(`0.12.0`, `0.13.0`, ...; the number is taken when the release lands, not when the epic is opened), and builds
the `.vsix` (`npx --yes @vscode/vsce package --no-dependencies -o /home/claude/output/`).

**Status** values are the same closed vocabulary as `keywordFixes.md`: `Open`, `In progress`, `Done`,
`Done (no code change)`, `Done (no behaviour change)`. **Version** is `vX.Y.Z` for a Done row that landed in a release and `—` for Open, In progress and `Done (no code change)` rows, as in `keywordFixes.md`.

**Source stays clean.** No feature below may write design-time-only state (preview values, scenarios,
simulator settings) into the DDS source. Such state lives in VS Code workspace storage or a settings key,
never in columns 1-80 or the tag area.

---

## Status at a glance

9 of 11 epics done (E1, E2, E3, E4, E5, E7, E8, E9, E10); 75 sub-tasks done (E1a - E1j, E2a - E2i, E3a - E3l, E4a - E4g, E5a - E5g, E7a - E7m, E8a - E8g, E9a - E9e, E10a - E10f). Current version: **v0.18.0**.

| ID | Epic | Sub-tasks | Depends on | Status | Version |
|----|------|-----------|------------|--------|---------|
| [E1](#e1) | Editor-side DDS language support (diagnostics, hover, completion, outline, quick-fixes) | E1a - E1j | - | Done | v0.16.1 |
| [E2](#e2) | Compile-error feedback loop | E2a - E2i | E1a, E1b for the shared diagnostics collection | Done | v0.17.0 |
| [E3](#e3) | Indicator simulator (and program-to-system field values) | E3a - E3l | - | Done | v0.14.1 |
| [E4](#e4) | Message-file integration (`MSGID` / `ERRMSGID` / `CHKMSGID` / `SFLMSGID`) | E4a - E4g | E3f (soft) | Done | v0.15.6 |
| [E5](#e5) | Preview export (PNG / SVG / HTML / text) | E5a - E5g | E3 (soft, for indicator state) | Done | v0.18.0 |
| [E6](#e6) | Menu designer: command keys and `TYPE(*UIM)` | E6a - E6h | E2 (soft, for compile errors) | Open | - |
| [E7](#e7) | Faster test suite | E7a - E7m | - | Done | v0.12.2 |
| [E8](#e8) | `WINDOW(*DFT)` and runtime-valued window parameters | E8a - E8g | E3f | Done | v0.15.0 |
| [E9](#e9) | `EDTCDE(Y/W)` separator width | E9a - E9e | - | Done | v0.13.0 |
| [E10](#e10) | `CHCCTL` / `SFLCHCCTL` choice control values | E10a - E10f | E3f (E10f only) | Done | v0.14.0 |
| [E11](#e11) | System/36 `DSPF36` (SFGR) source in the designer and the editor | E11a - E11l (E11g in four slices, E11g1 - E11g4) | E1, E2, E3, E5 (soft, for reuse) | Open | - |

### Suggested order

1. **E7 first.** The full suite takes about 12 minutes (320 test files, run one after another); every other
   epic gets cheaper once E7b/E7d land. E9 is small and independent, so it is a good parallel companion.
2. **E1a and E3a/E3f next.** E1a (a pure diagnostics module) is the foundation for E1 and E2. E3f (program-to-system
   field value store) is the foundation for E8 and E10.
3. E2, E4, E5 and E6 can run in parallel once their foundations exist; E8 and E10 follow E3f.

### Shared foundations (build once, reused)

| Piece | First built in | Reused by |
|-------|----------------|-----------|
| `src/ddsDiagnostics.js`: source in, list of `{line, column, severity, code, message, keyword}` out; no `vscode` import, so it runs in Node and in tests | E1a | E1b - E1f, E2d, E4d |
| One `DiagnosticCollection` hub in the extension host (sources: `iSDA` rules, `CRTDSPF`, `CRTMNU`, message-file checks) | E1b (or E2d if it lands first; the second one reuses it) | E1, E2, E4 |
| Program-to-system field value store (design-time values, per file and record, kept in workspace storage) | E3f | E8, E10, E4c (message data) |
| Standalone-HTML/SVG serialiser of the preview grid | E5b | E5d - E5f |

---

## E1

**Editor-side DDS language support**

**Goal.** Everything the rule engine knows (`keywordSpec.js`, the writer guards, the keyword index) is usable
while editing DDS as plain text, not only inside the designers: errors in the Problems panel, hover help,
completion, an outline, quick-fixes.

**Acceptance for the release.** Opening a `.dspf` / `.mnudds` / member in the text editor shows rule violations
in Problems within one second for a 5,000-line source; hover and completion work for every keyword in the
generated index; the outline lists records and fields; at least the three most common violations offer a quick-fix;
all of it can be switched off with settings.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E1a | **Diagnostics core.** New pure module `src/ddsDiagnostics.js`: parse a source text and run the existing guard chain (`commitSourceChange` guards, spec conflict rules) in a read-only "report, don't refuse" mode. Output is a list of positioned diagnostics with a stable code per rule. Added to the `build:webview-assets` copy list. Results: [E1a results](#e1a-results). | - | Done | v0.15.7 |
| E1b | **Wire to VS Code.** `DiagnosticCollection` over `DDS_LANGUAGE_SELECTOR` documents, debounced on change and on open; settings `isda.diagnostics.enable` and a severity map; cleared on close. Creates the shared hub (see Shared foundations). Results: [E1b results](#e1b-results). | E1a | Done | v0.15.8 |
| E1c | **Hover.** Keyword hover from the generated keyword index: level, parameter grammar, option-indicator validity, `DDS_Keyword_V7r6` citation. Fixed-column awareness (hover only in the keyword area, columns 45-80 plus continuation lines). Results: [E1c results](#e1c-results). | E1a | Done | v0.15.9 |
| E1d | **Completion.** Keyword completion filtered by level, record type and field usage/data type using `keywordSpec.js`; parameter snippets; no suggestion for a keyword the guards would refuse here. Results: [E1d results](#e1d-results). | E1a | Done | v0.15.10 |
| E1e | **Outline and navigation.** `DocumentSymbolProvider` (records, fields, subfile pairs, help specifications); go-to-definition on record names inside `SFLCTL(...)`, `WINDOW(...)`, `MNUBARCHC(...)` (the `RECORD_REFERENCES` table already says where they sit). Results: [E1e results](#e1e-results). | E1a | Done | v0.15.11 |
| E1f | **Quick-fixes.** `CodeActionProvider` mapped from diagnostic codes: remove the conflicting keyword, add a missing required companion (for example `OVERLAY` for `PUTRETAIN`, `INDARA`), "Open in designer". Each fix is an edit through the same writer so source fidelity (I-202 - I-207) holds. Results: [E1f results](#e1f-results). | E1a, E1b | Done | v0.15.12 |
| E1g | **Column aids.** Decorations or ruler for the fixed DDS columns (5-6 type, 17 name type, 30-34 length, ...). **Decision taken:** decorations on the active line, off by default (not every line, not a CodeLens ruler, not dropped). Results: [E1g results](#e1g-results). | E1b | Done | v0.15.13 |
| E1h | **Performance and tests.** Latency budget on a 5,000-line and a 20,000-line source, incremental re-check of the edited record only, no-`vscode` unit tests for E1a, jsdom-free. **Decision taken:** a per-record cache (record-local guards asked about one record at a time and kept per record text; the guards that look across records stay whole-model); the budget is enforced by work counts plus loose clock ceilings. Results: [E1h results](#e1h-results). | E1a | Done | v0.15.14 |
| E1i | **Release** (next free minor; Manojkumar chose 0.16.0). Results against the acceptance paragraph: [E1i results](#e1i-results). | E1a - E1h | Done | v0.16.0 |
| E1j | **Run the remaining guards in the diagnostics** (follow-up to E1i). 80 of the 114 `*ConflictReason` guards were not run by `ddsDiagnostics.js` because their signature is not `(oldModel, newModel)`. **Decision taken:** run only what a static source can answer (each guard called with an empty old state at the level it applies to: field, record, file or model), and list every guard that stays out with a reason; the E1a coverage test fails for any exported guard that is neither run nor listed. Results: [E1j results](#e1j-results). | E1a, E1h | Done | v0.16.1 |

### E1a results

`src/ddsDiagnostics.js` (UMD, no `vscode` import; needs only `dspfWriter.js` and the compiled parser), tested by
`src/test/e1aDiagnosticsCore.test.js` (61 checks; 17 mutations of the module each fail it). Nothing calls it yet: E1b wires it to VS Code.

- **API.** `analyze(source, options)` returns `{ diagnostics, model, internalErrors }`. A diagnostic is
  `{ line, column, endColumn, severity, code, message, keyword, record, source: 'iSDA' }`: 1-based, `endColumn`
  exclusive, `keyword` / `record` null when the diagnostic is on a whole line or at file level. `options.severity`
  (`{ code: severity | 'off' }`), `options.disabled` (codes) and `options.model` (an already parsed file, so E1b - E1e can
  share one parse). The parsed `model` comes back for the same reason. It never throws: a guard that throws is skipped
  and named in `internalErrors`. `allCodes()` lists every stable code (`isda.<rule>`, plus `isda.parseError`);
  `coverage()` lists the registered guards by their `DspfWriter` export name.
- **What runs.** Parser errors; the 25 model guards of the `commitSourceChange` chain (`scrbarReserved` and
  `altKeyFileExclusion` plus the 23 in `windowDependencyGuardBlocks`), called as `guard(emptyModel, model)`. They are
  diff-based ("only a violation this edit introduces"), so against an empty old model every violation in the file counts;
  and nine record-keyword rules (`(keywordName, recordKeywords)`: the USRDFN / SFL / MNUBAR whitelists, the WINDOW /
  PULLDOWN / KEEP / ALWROL-CLRL-SLNO / SFLNXTCHG-SFLMSGRCD / DSPMOD mutexes) asked once per keyword of each record. Three
  of those guards answer yes for any keyword once the record carries the marker (they were only ever called for one
  keyword), so the registry limits them with `only`. Every rule reports `error`, the severity the compiler gives what the
  guards refuse.
- **Where it points.** A model guard returns one reason and no position, and only the first violation. Each reason is
  located by removal: file keywords one by one; then the records by bisection (the smallest prefix of records whose
  removal clears the reason, and the same from the other end, so a 700-record file takes about twenty guard calls), then
  the items of the chosen record, tested with the far-side records removed so a reason that needs several offenders gone
  (HLPRCD on three records) is still cleared by one item. When removing two different items clears it (a conflict between
  two fields or records), the one the reason names first wins, a name introduced by "field" or "record" before a bare
  one: `ALIAS(AA) on field F2 ... field F1 already uses it` points at F2. The offender is then removed from a working copy
  and the guard asked again, so one guard reports every violation, in source order. A clean source costs one call per
  guard.
- **Ranges.** A keyword is its text in the keyword area (columns 45-80), on its first line; a whole field, record or H
  specification is its name (columns 19-28); anything else is the whole line.
- **Measured.** 4,901 lines (700 records) with one violation: 110 - 170 ms; 4,900 clean lines: 100 - 160 ms (this
  machine, Node 22); the acceptance paragraph asks for under a second at 5,000 lines. E1h still owns the latency budget at
  20,000 lines and the incremental re-check.
- **Not covered yet.** 34 of the 114 `*ConflictReason` functions `DspfWriter` exports are registered; the other 80 have a
  different signature (`(oldKeywords, newKeywords)` on a field or a record, `(field, updates)`, the `*BasicEdit*` family,
  the float and EDTMSK families). Each needs a decision on which level it applies to before it can run on a static source.
  The test prints the size of that gap and fails if a new `(oldModel, newModel)` guard appears in `DspfWriter` without
  being registered (the other signatures are not checked). This is the one thing the acceptance paragraph's "rule violations" leans on that E1a does not finish; it
  wants a follow-up sub-task (proposed, not added).
- **Stand-ins in the tests.** No real guard yet reports a conflict between two records, so the cross-record paths of the
  search are tested with a stand-in guard swapped in for one `DspfWriter` export and restored afterwards.


### E1b results

`src/diagnosticsHub.js` (UMD; takes the vscode API as an argument, so it has fake-API tests in
`src/test/e1bDiagnosticsHub.test.js`, 50 checks, 12 mutations of the module each fail it; 8 more in `extension.test.js` run the
real `activate()` against the shared `vscode-mock.js`, which gained a diagnostic collection, `languages.match` and the open /
close events), wired in `activate()` of `src/extension.ts`. DDS sources opened in the text editor now show E1a's diagnostics in the Problems panel.

- **The hub.** `createHub(vscode, { shouldAnalyze, getSettings })` makes one `DiagnosticCollection` named `iSDA`.
  Diagnostics are kept per file and per source: `setSource(uri, source, diagnostics)` / `clearSource(uri, source)`
  are how the later sources (compile messages E2d, message-file checks E4d) join the same collection, and one source
  can be cleared without touching the others. E1b's own source is `rules`.
- **When it analyses.** On open, and 300 ms after the last change to a document (a timer per document, restarted by
  each change; the text is read when it fires, so it is always the current text). Documents already open when the
  extension starts are analysed at start. Closing a document clears its `rules` diagnostics and cancels a waiting analysis.
- **Which documents.** Those the DDS selector matches that the CodeLens already treats as a display or menu source
  (`isLikelyDisplayFile` / `isLikelyMenuFile`), except a MNUCMD member, which is not DDS.
- **Settings.** `isda.diagnostics.enable` (default on): off clears every `rules` diagnostic at once and stops analysing;
  on again re-analyses the open documents without reopening them. `isda.diagnostics.severity`: a map from rule code
  (`isda.windowDependency`, ...; the manifest lists exactly the codes `ddsDiagnostics.allCodes()` returns, a test keeps
  them in step) to `error` (the default), `warning`, `information`, `hint` or `off`; case does not matter and unknown
  codes or values are ignored. Both take effect on a settings change.
- **Positions.** E1a's 1-based line and column range becomes a zero-based VS Code `Range`; code and source (`iSDA`)
  are carried over, so E1f's quick-fixes can key off `diagnostic.code`.
- **A guard that throws** is skipped by E1a and reported on the extension host console, not shown to the user.
- **Not checked in a real VS Code.** The tests use a fake of the API, so `languages.match` on the live selector and the
  Problems panel itself were not exercised; a quick look in the Extension Development Host (open a `.dspf` with an
  `RMVWDW` and no `WINDOW`) would confirm it. The designer's custom editor also opens the text document, so a file open
  only in the designer shows its problems too.

### E1c results

`src/ddsHover.js` (UMD; the pure `hoverAt` has no `vscode` import, `createProvider` takes the API as an argument like the hub),
`src/buildKeywordHoverData.js` (builds the runtime data), tested by `src/test/e1cHover.test.js` (71 checks; 24 mutations of
`ddsHover.js` each fail it) and 8 more in `extension.test.js` that run the real `activate()`. Hovering a keyword in a DDS source
opened in the text editor now shows its help.

- **Which documents.** The same ones E1b analyses (`isDdsTextDocument` in `extension.ts`, now shared by the hub and the hover):
  the DDS selector matches and the CodeLens treats it as a display or menu source, a MNUCMD member excluded. Setting
  `isda.hover.enable` (default on) switches it off.
- **Where it answers.** Only in the keyword area: columns 45-80, and on continuation lines (a `+` / `-` in the last column, the next
  line's columns 7-44 blank, the parser's own rule). It follows a chain over any number of lines: `+` joins at the first
  nonblank of the next line and `-` at column 45 keeping the blanks, so a name split across two lines is one word. No hover on a comment
  (even where its text reaches column 45), on a quoted constant, on a blank between keywords, or on a word the index does not know.
- **The level.** One pass over the lines above the cursor, with the parser's column rules: `R` in column 17 is a record, `H` a help
  specification, a name in columns 19-28 a field, and a line with no name belongs to whatever came before it; lines before the first
  record are file level. The text picks the index entry for that level; when the keyword is not listed there the hover says so and
  names the levels it is listed at ("Not listed at the record level; it is a field keyword"), and a keyword listed at several levels
  names the others.
- **On a parameter.** Hovering anything inside a keyword's parameter list (a value, a parenthesis, a blank) gives that keyword's hover, with the
  range running from its name to the closing parenthesis, over several lines when the list continues. The exception is a `*`-value the
  index describes on its own (`*RSTCSR`, `*SLTIND`, ...), which answers for itself with its own range.
- **What it says.** The index's level and category, description, parameter label and repeatability and its System/36 note; the form
  (`parameterGrammar`) and option-indicator rule (`valid` / `not valid` / `required`) from `RECORD_TYPES` in `keywordSpec.js`, said only where the spec
  states them; and a citation of the DDS Reference (V7R6) section with its title and line in `DDS_Keyword_V7r6.txt`. `CA03` and `CF12` are
  described under the `CAnn` / `CFnn` family. Notes in the index that name an internal task (`Task I-39`, `S36-3`, "See ... .md") are dropped
  from the text.
- **The data.** `docs/**` is not in the VSIX, so `npm run build:webview-assets` runs `node src/buildKeywordHoverData.js`, which writes
  `dist/keywordHoverData.json`: the keyword table of `KEYWORD-LOOKUP.json` (185 entries) and, for each, the section heading in the DDS Reference
  text. A heading counts only in the first column (the text keeps indented copies as "Related reference" cross-links, which would otherwise win
  for WINDOW and UNLOCK); headings wrapped over two lines are joined. 171 of the 185 have a citation; the 13 `*`-values are not sections of their
  own, and IGCCNV's heading is indented (it sits in the DBCS chapter), so the first-column rule skips it. The extension reads the file on the first hover.
- **Measured.** A hover at the end of a 20,001-line source takes under 30 ms (the test allows 200 ms), since it is one pass over the lines above the
  cursor. No cache; E1h owns the latency budget and any incremental work.
- **Not checked in a real VS Code.** The tests use a fake of the API, so `languages.registerHoverProvider` on the live selector and how VS Code draws the
  markdown were not exercised; a quick look in the Extension Development Host (hover `DSPATR(HI)` in a `.dspf`) would confirm it.
- **Not covered.** The index describes 185 keywords; the DDS Reference has more (display-size condition names, the field data types). Hover on a
  column other than the keyword area (the data type in column 35, the usage in column 38) is E1g's decision, not this one's.


### E1d results

`src/ddsCompletion.js` (UMD; the pure `completionAt` has no `vscode` import, `createProvider` takes the API as an argument), tested by
`src/test/e1dCompletion.test.js` (78 checks; 25 mutations of the module each fail it) and 8 more in `extension.test.js` that run the real
`activate()`. Typing in the keyword area of a DDS source opened in the text editor now offers the keywords valid there.

- **Which documents, which place.** The documents the hover and the diagnostics use (`isDdsTextDocument`). It answers in the keyword area
  (columns 45-80 and continuation lines), at the end of a word being typed or on a blank, and not on a comment, inside a quoted constant,
  inside a parameter list or left of column 45. A short empty line (`     A`) has no column 45 to put the cursor on, so the cursor has to be
  moved there first. The word replaced runs from its start to the end of the identifier the cursor is in. The list is marked incomplete while a
  word is typed, so the client asks again as it grows. Settings `isda.completion.enable` (default on) and `isda.completion.filterByRules`
  (default on).
- **The level.** The hover module's line scan (`DdsHover.scan` / `chainText` / `tokenize` are now exported), so a source is read the same
  way by both: file, record, field or help specification, a blank line keeping the level above it. The candidates are the keywords the generated
  index lists at that level; `*` values are not keywords and are left out; `CA01-CA24` / `CF01-CF24` are offered one by one.
- **Three filters.** (1) A keyword the field, record or file level already has is left out unless the index says it is repeatable; the word being
  typed does not count. (2) For a named field whose usage or data type is filled in: `allowedUsage`, `blockedDataTypes`, `allowedDataTypes` and
  `requiredDataTypes` of `keywordSpec.js` (so BLANKS / CNTFLD / FLDCSRPRG disappear on an output field, FLTFIXDEC off a non-float field, EDTCDE off
  a field that is not data type Y); a blank usage or type filters nothing. (3) The guards: the keyword is put on a copy of the current record
  (the file-level lines plus the record; the whole source for a file-level keyword up to 4,000 lines) and `DdsDiagnostics.analyze` is run, with
  the diagnostics of the copy without it taken off. A keyword that adds a violation is not offered. A subfile record therefore offers exactly the
  keywords its whitelist allows, a window record offers WDWBORDER / WDWTITLE but not SFL or USRDFN, and PUTRETAIN appears once OVERLAY is there.
- **Parameter shape does not hide a keyword.** A bare keyword breaks every rule about its parameters, and a guard can say more than the
  parameter when the list is malformed (WDWBORDER also reports a missing WINDOW). So a keyword with a parameter list is tried bare and in seven
  shapes (a number, a name, a constant, the nested `(*COLOR ..)`, `(*DSPATR ..)`, `(*CHAR ..)`, `(*TEXT ..)` groups, plus the first value of an
  enumerated list) and refused only when one violation is common to every form the parser reads as that keyword. The record-keyword rules
  (`DdsDiagnostics.recordKeywordCodes()`, new) never read a parameter, so one of them on the bare form refuses at once. A form the parser does
  not read as the keyword is skipped.
- **Insert text.** No parameters: the bare name. An enumerated parameter (`COLOR`, `DATFMT`, `CHECK`, ...): a snippet with a choice. Another
  parameter: a snippet with a placeholder named from the index (`EDTMSK('mask')`). An optional parameter: the bare name. The documentation is the
  hover's text for that keyword and level.
- **Cost.** About 1 ms per analysis; a subfile record 91 analyses and 134 ms, a window record 177 and 229 ms, the last record of a 20,002-line
  source 252 ms. Verdicts are cached per context (the word being typed is blanked out of it, so typing more of a word reuses them), and a
  second request for the same place makes no analysis. `budgetMs` (default 400) bounds a request: keywords not reached are offered and counted in
  `unchecked`; a guard that throws leaves its keyword offered too.
- **Limits, by design or by data.** Only the guards E1a runs take part (34 of 114; `DdsDiagnostics.coverage()`), so a keyword another guard would
  refuse can still be offered. A keyword that needs a companion (a CHC keyword without SNGCHCFLD, ERASE without OVERLAY) is hidden until the
  companion is there, because the guards flag it; `isda.completion.filterByRules = false` lists everything of the level. The keyword
  index lists WRDWRAP and VALNUM at the file level only (both are field keywords), so they are not offered on a field, and the hover says
  "Not listed at the field level" for them; the index is the data to fix, not the completion. Values inside a parameter list (`*AUTOENT`,
  `DSPATR(` values) are not completed.
- **Not checked in a real VS Code.** The tests use a fake of the API, so how VS Code draws the list, the snippet choice and the incomplete
  re-query on the live selector were not exercised; typing `COL` after a field in the Extension Development Host would confirm it.


### E1e results

`src/ddsOutline.js` (UMD; `symbolsOf` and `definitionAt` are pure and have no `vscode` import, `createProvider` takes the API as an
argument), tested by `src/test/e1eOutline.test.js` (61 checks; 28 mutations of the module, 25 of them fail it and the other 3 are
equivalent: guards that a second guard already makes redundant) and 8 more in `extension.test.js` that run the real `activate()`.
Both features read the source with the parser (`DspfParser.parseDspf`, not the diagnostics' guards), so they cost milliseconds.

- **Outline** (`DocumentSymbolProvider`, shown in the Outline view, breadcrumbs and Go to Symbol). One node per record format, in
  source order, with its named fields, its constants (labelled by their text, shortened to 40 characters) and its help specifications as
  children, in source order. A record's `detail` says what it is: `subfile, control CTL1` / `subfile control for SFLREC` (the pair is
  found from `SFLCTL(record)`; several controls of one subfile are all named), `menu bar`, `pull-down`, `window`, `user-defined`, and
  combinations (`subfile control for SFLREC, window`). Ranges run from an entry's first line to its last content line, so the keyword
  continuation lines are in and the blank and comment lines that trail it are out; the selection range is the name in columns 19-28 (a
  ten-character name whole). File-level keywords are not a node. A source the parser cannot read gives an empty outline. Kinds: Struct for
  records, Field, String for constants, Interface for help specifications. Setting `isda.outline.enable` (default on).
- **Go to Definition** (`DefinitionProvider`, returning a `LocationLink`): on the record-format name inside `SFLCTL(...)`,
  `WINDOW(...)` or `MNUBARCHC(...)`. Which keywords, where the name sits and what counts as a name come from `keywordSpec.js` through
  `recordReferenceKeywords` / `recordReferenceLocator` / `recordReferenceName` (the RECORD_REFERENCES table), so a keyword added to the
  table is navigable without a change here. The origin range is the name only (so only it is underlined); the target is the name in that
  record's R line with the record's range. Names match whatever the case. No definition for a WINDOW given inline geometry or `*DFT`, for a
  name no record format of the source has, for a name inside a quoted constant or a comment, for the keyword name itself, or one
  character outside the name. A name continued over a `+` line is found on the line the cursor is on. Setting `isda.definition.enable`
  (default on).
- **Cost.** The outline of a 16,000-line source with 4,000 records and a definition inside it take well under a second (the test asserts
  2 s and 1 s; a run took 238 ms for the definition).
- **Limits.** Only the three RECORD_REFERENCES keywords are navigable: `HLPRCD(record)` and the other keywords that name a record format are
  not in that table, so they have no definition (adding them to the table is the fix, and would also make rename read them). A definition
  is found only in the same source, never in another member. There are no references or rename provider: the writer's
  `renameRecordReferences` already does the rewriting for the designers, but a text-editor rename is a later item.
- **Not checked in a real VS Code.** The tests use a fake of the API, so how the Outline view, breadcrumbs and the ctrl-click underline draw
  was not exercised; opening a `.dspf` in the Extension Development Host and ctrl-clicking the name in `SFLCTL(...)` would confirm it.

### E1f results

`src/ddsQuickFix.js` (UMD; `fixesFor` and `toTextEdit` are pure and have no `vscode` import, `createProvider` takes the API as an
argument), tested by `src/test/e1fQuickFix.test.js` (76 checks; 17 mutations of the module, 14 killed at first, the 3 survivors got
a test each and are killed now) and 8 more in `extension.test.js` that run the real `activate()`. A problem iSDA shows in the
Problems panel now has a lightbulb in the text editor.

- **Three actions.** (1) **Remove `<keyword>`** for any diagnostic that sits on a keyword (file, record, field or help specification).
  (2) **Add the missing companion**, preferred over removing because it keeps what the author wrote: `OVERLAY` to the record for
  `PUTRETAIN`, `ERASE`, `ERASEINP`, `PROTECT` and `MDTOFF`; `INDARA` to the file for `RETKEY` and `RETCMDKEY`. Both lists are read from the spec
  (`requiresRecordKeyword`, `requiresInFile`), not from the message text, and only a companion that is written bare is offered: `WINDOW` (needs
  geometry), `SFLCTL` (needs a record name), `HLPPNLGRP` and `PRINT` (need a name) are not invented. (3) **Open in designer**
  (`vscode.openWith` with the display or the menu designer's view type) on every iSDA problem, for the ones a text edit cannot settle.
- **Same writer, same settings.** A fix is made with `applyFileKeywordsUpdate` / `applyRecordUpdate` / `applyFieldUpdate`, then
  `applyModificationTracking`, with `keepRemovedLines` switched on and off around it exactly as the designers do (it is off while tracking
  is on, and the writer's own state is restored afterwards). So untouched lines stay verbatim (tags past column 80, data in columns 1-5),
  sequence numbers are re-stamped by the writer (I-203), the tag goes at the end or in columns 1-5 (I-204), and a removed keyword line stays as a
  comment with `isda.keepRemovedLines` (I-207). A keyword on the same line as its record or field has no line of its own to keep, so it is just taken off.
- **Verified before it is shown.** The fixed source is analysed again and the fix is offered only when the diagnostic's own kind (code, keyword,
  record) goes down and nothing appears that was not there before. A fix that trades one problem for another does not show. Cost: one more
  analysis per candidate fix (100 - 170 ms at 5,000 lines), only when the lightbulb is asked for; the analysis of the open version is cached per
  document version and shared by all the diagnostics of a request.
- **The edit.** `toTextEdit` reduces the whole-source result to one whole-line replace (common first and last lines are left alone), in the document's
  own line ending; an insertion, a deletion and a change at the very end of the document each have a correct range (the first version of the
  end-of-document case produced an end before its start; a check now applies every edit above to the text in both line endings and compares).
- **Settings.** `isda.quickFix.enable` (default on) and `isda.quickFix.openInDesigner` (default on). Documents are the ones the hover and the
  diagnostics use (`isDdsTextDocument`); a MNUCMD member gets nothing.
- **Limits.** Most diagnostics have only "Remove" (and "Open in designer"): only seven keywords have a bare companion in the spec. A diagnostic with
  no keyword (a record-level or whole-line one, for example `isda.helpKeywordRelation` on a record) has no edit, only "Open in designer". The remove
  fix removes the one keyword the diagnostic points at even when another keyword is the better one to drop (for a conflict between two keywords
  there is one lightbulb on each). No "fix all in file", no quick-fix for the parameter of a keyword (a wrong value), and no fix for the
  `CRTDSPF` / `CRTMNU` messages E2 will add (a different source, a different code space).
- **Not checked in a real VS Code.** The tests use a fake of the API, so the lightbulb, the preview of a `WorkspaceEdit` and the `vscode.openWith` call
  on the live custom editors were not exercised; putting the cursor on an `RMVWDW` with no `WINDOW` in the Extension Development Host would confirm it.

### E1g results

`src/ddsColumnAids.js` (UMD; `zonesAt`, `zoneAt` and `lineKind` are pure, `createHoverProvider` and `createController` take the `vscode` API as an argument), tested by `src/test/e1gColumnAids.test.js` (53 checks; 17 mutations of the module, all killed) and 5 more in `extension.test.js` that run the real `activate()`.

- **Decision (taken with Manojkumar).** Option 1 in a light form: the fixed DDS columns drawn as alternating subtle bands on the line the cursor is on, with a hover per band, **off by default** (`isda.columnAids.enable`). Rejected: decorations on every line (noise, clashes with the theme and the syntax colours), a ruler or CodeLens header (no sticky-header API for extensions; a CodeLens sits above a line, not over its columns), dropping it (E1c/E1d name the keyword and the field, but not what each fixed column is for).
- **Zones.** Sequence (1-5), form type (6), conditioning (7-16), name type (17), name (19-28), reference (29), length (30-34), data type (35), decimals (36-37), usage (38), line (39-41), position (42-44), keyword area (45-80). The layout depends on the line: a field line has all thirteen, a record or help-specification line six, a keyword-only line four, a continuation line only the keyword area, a comment or a blank line none. A continuation is a line with columns 7-44 blank under a keyword line that ends in `+` or `-` (comments in between are skipped, a specification line in between ends the chain, 60 lines of look-back at most).
- **Hover.** Names the column(s) and says what goes there. Only on the active line (the line with the bands), and not in the keyword area, which E1c's keyword hover owns.
- **Cost.** One line is classified per cursor move, selection change, active-editor change or edit of a visible document; no analysis, no parse of the whole file. Two decoration types are created on first use and disposed with the extension; switching the setting off clears the bands on the visible editors.
- **Limits.** The column text is fixed DDS; it does not change with the keyword at the line (no "this field is a date, so columns 36-37 are blank" hint). The bands are plain grey with transparency (`rgba(128, 128, 128, ...)`), not theme colours. A MNUCMD member gets nothing (same documents as the other E1 features). Only the active editor's cursor line is drawn, multiple cursors draw on the primary one.
- **Not checked in a real VS Code.** Tests use a fake API; how the bands look in a light and a dark theme and whether the hover collides with another extension's were not seen. Turn the setting on in the Extension Development Host to check.

### E1h results

`createAnalyzer()` in `src/ddsDiagnostics.js` (the one-shot `analyze()` is now an analyzer with an empty memory), used per open document by `src/diagnosticsHub.js`; tested by `src/test/e1hPerformance.test.js` (70 checks; 5 mutations of the module each fail it).

- **Decision (taken with Manojkumar).** A per-record cache, and a budget enforced by counting work (records analysed and reused, guard calls, records handed to guards) with only loose wall-clock ceilings, since the suite runs in parallel shards and a clock flakes.
- **What is incremental.** Ten of the 25 model guards give a record the same verdict whatever else is in the file (`RECORD_LOCAL_CODES`: windowDependency, sflctlDependency, outputControl, multiLevelEligibility, referenceField, initRetainReturn, commandFunctionParameter, retKey, commandFunctionPairing, optionIndicatorRequired), plus the nine record-keyword rules. They are asked about a one-record sandbox (the file keywords and that record) and the answer is kept by the record's text and conditions, and for as long as the lines above the first record are unchanged. After an edit only the records whose text changed are asked again; positions are kept relative to the record, so a record moved down by an insertion above it keeps its answer, except a diagnostic placed on a file keyword, which stays on its line. The same text again (a setting changed) is answered without parsing or asking a guard; settings (severity, off) are applied last so they never invalidate anything.
- **What is not.** The other 15 guards, the parse errors and the parse itself still run over the whole source on every edit: `subfileKeyword`, `subfileFoldDrop` (find the subfile record of a control record), `fieldKind` (`WINDOW(record)` borrows the width of another record), `commandKeyNumber`, `commandKeyRange`, `systemValueKeyword` (count across the file), `choiceMenuBar`, `windowHelpMenu` (resolve a record named in a parameter), `menuBarRecordRequired`, `fileHelp`, `helpSpec`, `helpKeywordRelation` (ask "anywhere in the file"), `scrbarReserved`, `fileLevelDisplay`, `altKeyFileExclusion` (file keywords only, already one cheap call). A guard added to `MODEL_GUARDS` is whole-model until someone reads it and lists it.
- **Behaviour change.** A record-local guard that conflicts a record with a FILE keyword (RETKEY with a file-level `PAGEDOWN`, `INVITE` at both levels) is now reported once per offending record, each on the file keyword; the whole-model run reported the first and then hid the others behind it. Everything else is identical (compared on 500 generated sources, messages included).
- **Evidence the classification is right, and its limit.** Each local guard's violation function was read, a static check fails if one starts handing the whole model to another function or reading `model.records` twice, and the per-record path equals the whole-model path (`reference: true`) on generated sources. Random keyword soup rarely builds the cross-record shapes a wrongly-local guard would break (a trial run classifying each whole-model guard as local missed all but one), so the comparison alone is not proof; the shapes it does reach (WINDOW borrowing, pairing, a display size on SFLDLT) are written out. State a guard keeps in a variable from one record to the next is checked by eye only.
- **Measured** (Node 22, this machine; whole-model run -> cold -> one-line edit with the memory warm): 5,000 lines clean 144 -> 117 -> 57 ms; 5,000 lines with 200 violations 437 -> 63 -> 46 ms; 20,000 lines clean 313 -> 254 -> 202 ms; 20,000 lines with 200 violations 1,530 -> 431 -> 168 ms. A one-line edit costs the 15 whole-model guards over all records plus one record for the rest (counted exactly in the test); with 200 violations the records handed to guards fall from about 9.4 million to about 76,000. At 20,000 lines the parse (about 90 ms) and the whole-model guards are what is left.
- **Latency budget.** Under a second at 5,000 lines (acceptance for the release; the edit takes about 60 ms) and about 200 ms at 20,000 lines. The test's ceilings are loose (edit 1 s / 2 s, cold 2 s / 4 s for 5,000 / 20,000 lines); the exact checks are the counts.
- **Hub.** One analyzer per open document, created on first analysis, dropped on close, when the feature is switched off, or when the document stops being DDS.
- **Not done.** An incremental parser, and cheaper whole-model guards (skipping a guard when the file has none of the keywords it is about), would take the 20,000-line edit lower; E1f's quick-fix still analyses in one shot per request. Not checked in a real VS Code: the tests use a fake of the API.

### E1i results

**Released as v0.16.0** (Manojkumar chose the minor number; the E1 work shipped as v0.15.7 - v0.15.14 and this entry rolls it up). Every sub-task E1a - E1h is Done. The acceptance paragraph, one criterion at a time:

| Acceptance criterion | Met by | Evidence |
|----------------------|--------|----------|
| Rule violations in Problems for a `.dspf` / `.mnudds` / member opened in the text editor | E1a (v0.15.7) the rules, E1b (v0.15.8) the Problems panel, over open, change (300 ms debounce) and close | `e1aDiagnosticsCore.test.js`, `e1bDiagnosticsHub.test.js`, 8 checks in `extension.test.js` that run the real `activate()` |
| ... within one second for a 5,000-line source | E1a, E1h (v0.15.14) | `e1iRelease.test.js`: 4,998 lines clean 178 ms and 5,049 lines with 50 violations 156 ms on the first run (nothing remembered); a one-line edit with the memory warm takes about 60 ms (`e1hPerformance.test.js`, counted exactly) |
| Hover works for every keyword in the generated index | E1c (v0.15.9) | `e1cHover.test.js`: every entry of `KEYWORD-LOOKUP.json` hovers at each level it is listed at (185 keywords) |
| Completion works for every keyword in the generated index | E1d (v0.15.10) | `e1iRelease.test.js`: each of the 213 index entries at the file, record, field and help-specification levels is offered at its level, on a line where its data type and usage fit (`EDTCDE` / `EDTWRD` need data type `Y`, `MAPVAL` needs `L`, `T` or `Z`). The `*` entries are parameter values, not keywords, and are not offered by design |
| The outline lists records and fields | E1e (v0.15.11) | `e1eOutline.test.js`: one node per record format in source order, its fields, constants and help specifications under it; go to definition on `SFLCTL(...)`, `WINDOW(...)`, `MNUBARCHC(...)` |
| At least the three most common violations offer a quick-fix | E1f (v0.15.12) | `e1fQuickFix.test.js`: **Remove `<keyword>`** on any problem that sits on a keyword, **Add the missing companion** (`OVERLAY` for `PUTRETAIN`, `ERASE`, `ERASEINP`, `PROTECT`, `MDTOFF`; `INDARA` for `RETKEY`, `RETCMDKEY`), **Open in designer** on every iSDA problem |
| All of it can be switched off with settings | E1b, E1c, E1d, E1e, E1f, E1g | `isda.diagnostics.enable`, `isda.hover.enable`, `isda.completion.enable`, `isda.outline.enable`, `isda.quickFix.enable` (all default on; `isda.columnAids.enable` is default off); `e1iRelease.test.js` checks each exists, is a boolean, has that default and is read by `extension.ts` |

**What E1 leaves open, by decision.**
- **80 of the 114 `*ConflictReason` guards are not run by the diagnostics** (E1a: they have another signature, `(oldKeywords, newKeywords)` on a field or record, `(field, updates)`, the `*BasicEdit*` family). The Problems panel shows the 34 that are registered; the others still refuse an edit inside the designers. This is the largest gap between "the designers" and "the text editor"; closed by [E1j](#e1j-results) (v0.16.1).
- **A conflict between a record and a file keyword** is reported for every offending record, on the file keyword (E1h); the designers' guard reports the first only.
- **Whole-model guards stay whole-model** (15 of the 25 model guards, and the parse): a one-line edit at 20,000 lines costs about 200 ms, most of it the parse. E1f's quick-fix still analyses in one shot per request.
- **Column aids are off by default** (E1g decision).
- **Not checked in a real VS Code.** Every E1 test uses a fake of the VS Code API. The Problems panel, the hover, the completion list, the outline, the lightbulb and the column bands were never seen in an Extension Development Host; a short manual pass (open a `.dspf` with a violation, hover `DSPATR(HI)`, complete a keyword, open the outline, use the lightbulb) is still owed before this ships to users.
- **Settings are read through `vscode.workspace.getConfiguration('isda')`**; changing one takes effect on the next request or, for the Problems panel, on the configuration-change event.

### E1j results

**Released as v0.16.1.** The follow-up to E1i: of the 114 `*ConflictReason` guards DspfWriter exports, the diagnostics ran 34. They now run 85, and the other 29 are listed, each with the reason it has nothing to say about a source on disk.

**Decision taken** (Manojkumar): run what a static source can answer; every guard that stays out is listed with a reason and the coverage test fails for a guard that is neither run nor listed; version 0.16.1.

| Where the 114 guards are | Count | Held by |
|---|---|---|
| `(oldModel, newModel)` model guards and `(keywordName, recordKeywords)` rules, registered since E1a | 34 | `MODEL_GUARDS`, `RECORD_KEYWORD_RULES` in `src/ddsDiagnostics.js` |
| run by the new item rules (`src/ddsItemRules.js`), 45 rules with codes `isda.*` | 51 | `e1jItemRules.test.js`: for every rule a broken source is reported on the right line and keyword and the mended one is not |
| edit-only, listed with a reason in `EDIT_ONLY` | 29 | `e1aDiagnosticsCore.test.js`, `e1jItemRules.test.js`: every exported guard is run, registered or listed, exactly once |

**How a guard is run.** The edit-time guards ask "what does this edit introduce"; with an empty old state, as the model guards already are, they name everything the source has. Each rule has a scope. **Field** and **record** rules look at one field or record and are kept per record text with the E1h cache (positions relative to the record, so an insertion above does not ask again). **File** and **model** rules look at the file keywords or across records (a control record against its subfile record, `PASSRCD` against a record, command keys against the file) and are asked on every analysis, which costs little because each guard is only called where its keyword is present. A guard answers with a reason and no position, so the keyword is found as in E1a, by removal: the keyword whose removal clears the reason, dropped from a working copy, asked again.

**What stays out, and why** (`EDIT_ONLY` in `src/ddsItemRules.js` has each guard's own line):
- guards that compare a value before and after an edit (the `*BasicEdit*` family, reorder, resolve): with no edit there is nothing to compare; for most the static twin is run (`isda.valnumEligibility` for `VALNUM`'s usage and data type, and so on);
- guards that answer "may this keyword be added" for any keyword name (`edtmskConflictReason`, `msgconConflictReason`, `windowConflictReason`, ...): the rule runs the one that judges what the field has;
- the second wording of a rule already run, and helpers a run guard calls.

**Three static gaps found on the way and closed.** `pshbtnfldBasicEditConflictReason`, `sflchcctlBasicEditConflictReason` and `chkmsgidBasicEditConflictReason` have no "new" twin, so a push-button field of the wrong data type, a choice-control field of the wrong shape and `CHKMSGID` on a usage that cannot take input were not reported at all. They run with an old definition no real field has, so each wrong attribute counts as changed (`isda.pshbtnfldShape`, `isda.sflchcctlShape`, `isda.chkmsgidUsage`); the message reads "... cannot set data type A (must be Y) ...".

**Checked.** 400 generated keyword-soup sources give the same diagnostics from the incremental path as from the whole-model run, with the item rules in; five of six deliberate breaks of the new code are caught by `e1jItemRules.test.js`, and the sixth (a blank usage defaulted to O) was redundant with the parser's own default and is covered by a check on a hand-built model. A 5,000-line source takes about 295 ms clean and 259 ms with 50 violations on the first run (178 and 156 ms before the item rules); the full suite is 359 files, 23,480 checks.

**Behaviour to know.**
- A conflict between two keywords is one diagnostic, on the first of them (`HLPDOC` with `HLPPNLGRP`, `DFT` with `DFTVAL`, `MOUBTN` with `ALTHELP`); `isda.menuBarKey` is reported on both the file-level and the record-level key, as each is wrong against the other.
- Some wordings were written for an edit ("cannot be added to ..."); they read a little off on a source that already has the fault, and were left as the guards say them, so the designers and the editor agree.
- Where an existing guard already reports the same fact (`helpKeywordRelation` against `isda.fileHelpExclusion`), both show; they carry different codes and wording.
- `package.json`'s `isda.diagnostics.severity` now lists 80 codes (35 before); the E1b test checks the list against `allCodes()`.

---

## E2

**Compile-error feedback loop**

**Goal.** A failed `CRTDSPF` / `CRTS36DSPF` / `CRTMNU` points back at the offending source line, in the editor
and in the designer, instead of leaving the user to read a joblog.

**Acceptance for the release.** After a failed compile of a remote member, each message that carries a source
sequence number appears as a diagnostic on the right line (editor) and as a badge on the right record/field
(designer); a successful recompile clears them; menu compile reports which of its steps failed.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E2a | **Capture source. Decision first.** Compare the three ways to get messages: the job log (`QSYS2.JOBLOG_INFO`), a compile listing (`OUTPUT(*PRINT)` spool), and the command's own error text from Code for i. Pick one primary and one fallback; record which messages carry statement/sequence numbers. Needs real samples: **Manojkumar to provide one failing listing and joblog** to use as fixtures. | - | Done (no code change) | — |
| E2b | **Message parser.** Pure module `src/compileMessages.js`: listing/joblog text to `{msgId, severity, sequence, text}`; fixtures from E2a; tolerant of unknown message layouts (never throws). | E2a | Done | v0.16.2 |
| E2c | **Sequence to line mapping.** Map a sequence number to a line in the member or local file, accounting for sequence numbers kept or re-applied by the writer (I-203), a tag in columns 1-5 (I-204), and removed-lines-kept-as-comments (I-207). Unmappable messages stay global. | E2b | Done | v0.16.5 |
| E2d | **Editor diagnostics.** Feed mapped messages into the shared `DiagnosticCollection` hub as source `CRTDSPF` / `CRTMNU`; an Output channel with the raw listing; cleared on edit of the line or on the next compile. | E2c, E2i, E1b | Done | v0.16.6 |
| E2e | **Designer surface.** A dismissible error banner in the webview; click selects the record/field on the canvas; badges on records/fields in the property panels; both UI styles. | E2c | Done | v0.16.7 |
| E2f | **Menu compile.** `CRTMNU` runs several steps (`CRTDSPF`, message file, `ADDMSGD`, `CRTMNU`); report which step failed and its messages, per step. | E2b | Done | v0.16.8 |
| E2g | **Tests.** Fake Code-for-i connection returning recorded fixtures; end-to-end: failing compile to diagnostic on the expected line. | E2d | Done | v0.16.9 |
| E2h | **Release** (next free minor: 0.17.0). Results against the acceptance paragraph: [E2h results](#e2h-results). | E2a - E2g, E2i | Done | v0.17.0 |
| E2i | **Listing fetch.** After a failed compile, get the compile listing (the spooled file named after the file being compiled) from the job that ran the command and hand its text to `parseListing`. Everything temporary lives in `ISDATEMP`, never `QTEMP`, and is dropped after use. See *E2i design* under *E2a results*. Added after E2a: the SQL session and the command run in different jobs. | E2b | Done | v0.16.4 |

### E2a results

**E2a (capture source, decision recorded, no code change).** Decided with Manojkumar. Real IBM i samples are still
outstanding (open question 1), so the IBM i behaviour below is a **hypothesis to confirm against fixtures**, not
something verified from this repo.

**What the code does today.** `extension.ts` runs `CRTDSPF`, `CRTS36DSPF` and the `CRTMNU` steps (`CRTDSPF`, `CRTMSGF`,
`ADDMSGD` / `CHGMSGD`, `CRTMNU`) through `connection.runCommand`. On a non-zero return code it shows
`stderr || stdout` in an error toast. Nothing is parsed, so no message is tied to a source line. The menu flow already
runs each step on its own and names the failing one (the base for E2f).

**Options compared.**

| Option | Sequence numbers | Main risk |
|--------|------------------|-----------|
| Command's own error text (`stderr` / `stdout`) | Probably none; likely only the final escape message | Too thin to map to lines |
| Job log (`QSYS2.JOBLOG_INFO`) | Probably in the diagnostic message text | `runCommand` may not run in the job whose log is read; unconfirmed |
| Compile listing (`OUTPUT(*PRINT)`), read back from spool | Normally shown beside each message in a fixed layout | Spool must be located and read (`QSYS2.SPOOLED_FILE_DATA`); layout differs between DDS and System/36 SFGR |

**Decision.**
1. **Primary:** the compile listing (`OUTPUT(*PRINT)`).
2. **Fallback:** the job log, used when no listing can be read.
3. **Last resort:** the command's own error text, which keeps feeding the existing toast and the "unmappable messages stay
   global" case in E2c.

**To confirm from fixtures before E2b.**
- Whether listing messages carry a sequence number in a fixed column or inside the message text.
- Whether `runCommand` shares a job with the later `QSYS2.JOBLOG_INFO` query, and how the spool file is named and found.
- Whether `CRTS36DSPF` (SFGR source) and `CRTMNU` produce the same layout or need their own parser branch.
- Which message IDs carry a sequence number at all (the roadmap's "record which messages carry statement/sequence
  numbers").

**Still needed from Manojkumar.** One failing `CRTDSPF` listing and its job log, with errors at known sequence numbers
(a `CRTS36DSPF` or `CRTMNU` failure as a bonus). E2b stays blocked until they arrive.

**Findings from the fixtures (added with E2b; supersede the "to confirm" list above).** The samples came in after the
decision was recorded: a failing `CRTDSPF` on IBM i V7R3M0 (`src/test/fixtures/compile/`). They confirm the decision and sharpen it.
- **Only the listing carries line numbers.** Each message sits right after the source line it belongs to as a marker line
  (`* CPD5237-**********`); the number is the SEQNBR of the source line above it. Text and severity are in the `Messages`
  section at the end, once per ID. The job log has **none** of the line-level `CPD` messages and no sequence numbers: it holds only
  `CPF7311` (errors in DDS not allowed with the generation severity level), `CPD4090` (printer) and the `CPF7302` escape.
  So the job log fallback can only ever give file-level messages.
- **The command's own error text already is the job log.** Code for i's text for the failed command contained `CPC3305`,
  `CPC2198`, `CPC2101`, `CPF7311`, `CPD4090`, `CPF7302` (the job log messages of that command), followed by two `SQL0443` lines
  (a trigger/routine error, source unknown) that are noise. The job log fallback therefore adds nothing for file-level messages, and
  a separate `QSYS2.JOBLOG_INFO('*')` query is only worth it if `runCommand` returns less on another setup. E2c still has to
  check that on a second connection; it is no longer on the critical path.
- **A listing is produced although the file is not created**, by the default `OPTION(*SRC *LIST)` (the header shows
  `*SOURCE *LIST *NOSECLVL *NOEVENTF`); nothing needs adding to the command. With the job's printer device `PRT01` missing
  (`CPD4090`) it went to `QPRINT` in `QGPL`, so the spooled file must be found by its own name, the file being compiled (`TESTDSP` in the fixture; Manojkumar confirmed the spool takes the object's name, not `QSYSPRT`), and by job, not by the user's
  output queue. How to read it (`QSYS2.SPOOLED_FILE_DATA` is not known to exist on V7R3; `CPYSPLF` to a temporary file is the
  alternative) is E2c's first check.
- **Severity decides failure.** The header says `DDS generation severity level . : 20`. Messages above that stop the file being
  created. In the fixture the severity 20 messages (`CPD7494`, `CPD7520`) are listed together with severity 30 ones on the same line. The
  listing's summary bands are 0-9 informational, 10-19 warning, 20-29 error, 30-99 severe.
- **Sequence numbers are the member's own**, not 100 times the line: the fixture starts at 500 and has inserted lines 1801, 1901,
  3101 and 3102. The Nth listed source line is the Nth line of the member (51 listed, 51 sent), so E2c maps through that
  position, which the parser returns as `ordinal`.
- **Still unknown:** what the asterisks and dots after the dash mean (kept raw, not used); whether a raw spool file lays out the same as the
  PDF the fixture was read from; the layouts of `CRTS36DSPF` (SFGR) and `CRTMNU`; where the `SQL0443` pair comes from.


**Decision after the job check (added with E2i).** Manojkumar confirmed on the V7R3 system that the SQL session runs in its own job and the
`CRTDSPF` command runs in a different one, so `QTEMP` objects are not shared between them and `JOB_NAME => '*'` in SQL does not name the
compile's job. Rule: **any temporary file the extension needs is created in `ISDATEMP` and dropped as soon as it has been read** (also when the read fails).
`QSYS2.SPOOLED_FILE_DATA` does not exist on V7R3 but `SYSTOOLS.SPOOLED_FILE_DATA` does, and `CPYSPLF` is preferred.

**E2i design (proposal, to confirm with a probe before it is built).**
1. Note the time before the compile. After a failure, find the newest spooled file of the connected user named after the compiled file (`SPOOLED_FILE_NAME` = the object name) created since then, with SQL
   (the spooled-file entries view or function; availability and column names on V7R3 are not yet confirmed), and take its qualified job name and file number.
2. `CPYSPLF FILE(<compiled file name>) TOFILE(ISDATEMP/<unique work file>) JOB(<number/user/name>) SPLNBR(<n>) MBROPT(*REPLACE)`, creating the work file in `ISDATEMP` first
   (`CRTPF`, record length wide enough for a 132-column listing) with a name that is unique per call so two compiles cannot meet.
3. Read the rows with SQL in the SQL job (the work file is a normal object, so any job sees it), then `DLTF` it in a `finally`, even when the read fails.
   The listing's own spooled file is left alone: it is the user's output. A name that is not the compiled file's (a spool left by an earlier compile of the same name) is told apart by its creation time and by the file number.
4. Anything missing (no spool file, `CPYSPLF` fails, the library cannot be created) returns `null`; the caller falls back to the command text
   (`parseCommandText`), so a compile error is still shown, as a file-level message.
5. `SYSTOOLS.SPOOLED_FILE_DATA(JOB_NAME => ..., SPOOLED_FILE_NAME => <compiled file name>, SPOOLED_FILE_NUMBER => ...)` is the alternative that needs no work file, but it is a
   SYSTOOLS object and may not be there on every system, so it is not the first choice.

### E2b results

**E2b (message parser).** New `src/compileMessages.js`, plain dependency-free UMD like `messageFile.js`, copied to `dist/` by
`build:webview-assets`. Nothing calls it yet (E2c and E2d do). Tested by `src/test/e2bCompileMessages.test.js` (55 checks) against the
E2a fixtures in `src/test/fixtures/compile/`: `testdsp.dds` (the 51-line failing source), `testdsp.listing.txt`, `testdsp.joblog.txt`
and `testdsp.toast.txt`.

**API.** Every function returns `{ kind, recognized, messages, header, summary, sourceSequences }` (plus `failed` and, only on an
internal error, `error`). A message is `{ msgId, severity, sequence, ordinal, text, source }` with `source` `'listing'`,
`'joblog'` or `'command'`, and a few extras (`marker`, `type`, `position`, `noise`).
- `parseListing(text)` reads the listing: header facts (file, library, source file and member, generation and flagging severity), the
  source lines (`sourceSequences`, in member order), the marker lines, the `Messages` section, the summary counts and the
  escape message. A message gets the SEQNBR of the source line above its marker as `sequence`, and that line's 1-based position as `ordinal`; the
  escape message and any marker before the first source line get `null` for both.
- `parseJobLog(textOrRows)` reads DSPJOBLOG-style rows (`27 CPF7302 ESCAPE 40 text`) or the rows of `QSYS2.JOBLOG_INFO`;
  oldest first; `sequence` and `ordinal` always `null`.
- `parseCommandText(text)` splits Code for i's `ID: text` runs (the lead-in `iSDA: CRTDSPF failed:` is not a message); no severity; `SQL...`
  IDs are flagged `noise: true`.
- `parse(input)` picks one of the three; `severityClass(n)` gives `info` / `warning` / `error` / `severe` / `unknown` by the listing's bands.

**Decisions.**
- The ordinal, not arithmetic, is what E2c maps from: the fixture's sequence numbers are irregular.
- Marker tails are stored raw in `marker`; no column range is derived, so a diagnostic covers the whole line until the tail is understood.
- Message text comes from the `Messages` section by ID. A marker whose ID is missing there keeps its place with severity `null` and empty text.
- Blank runs inside message text and headings collapse to one space, so a widely spaced raw spool file gives the same messages as the collapsed PDF text.
- A page header glued onto the end of a line (as the PDF export does) is split off before reading; a form feed or CRLF changes nothing.
- Never throws: junk, non-strings, binary and a 33,000-line text all return a result (the last in about 0.1 s).

**Not yet checked:** a raw spool file (CPYSPLF / `SPOOLED_FILE_DATA`) instead of PDF text; `CRTS36DSPF` and `CRTMNU` listings; wrapped message texts
(handled by an indentation rule that has no real sample).


### E2c results

**E2c (sequence to line mapping).** New `src/compileLineMap.js` (UMD, copied to `dist/` by `build:webview-assets`), tested by `src/test/e2cLineMap.test.js`
(60 checks) against the E2a fixtures and against listings built in the fixture's layout. Nothing calls it yet: E2d (editor) and E2e (designer) do. It works on text, so
whichever text the caller passes (the member as the editor holds it, or a local file) is the text that is mapped.

**API.** `mapMessages(parsed, source, options?)`: `parsed` is any E2b result, `source` the text or an array of lines. It returns
`{ ok, alignment, listedCount, lineCount, matchedCount, changed, messages, mapped, global }`; every message is a copy of the E2b one with
`line` (**1-based**, like `ddsDiagnostics.js`), `column` 1 and `endColumn` (the whole line, the same rule as there), `how` and `reason`. `how` is `ordinal`, `aligned`, `count` or `sequence`;
a message with no line has `line: null` and a `reason`: `file-level` (the escape message, job log and command text never had one), `line-changed`, `out-of-range`, `ambiguous-sequence`,
`sequence-not-found`, `no-sequence-numbers`. Options: `width` (80) and `maxEdits` (2000). `alignLines`, `splitSource`, `sequenceOf`, `isComment` and `prepareLine` are exported for the tests.

**How a message finds its line** (one rule for the whole listing, picked in this order).
1. **Ordinal (`identical`).** The Nth listed line is the Nth line of the source, comments and blank lines included. Taken when every listed line's text equals the source line at the same place.
2. **Aligned.** The source changed since the compile. The listed lines are matched to the current lines (common start and end, then Myers' shortest edit script), so a message moves with its line. A line that was
   itself edited or deleted has no match: its messages go global (`line-changed`), they do not land on a neighbour. Used when at least half of the listed lines match.
3. **Count.** The listing's text cannot be compared (under half match: an unknown layout, or another member) but the line counts agree: the ordinal as it stands.
4. **Sequence.** Only when the numbers are in the text: the line whose columns 1-5 are digits equal to the message's sequence. Comment lines are passed over; two live lines with one number is `ambiguous-sequence`.

**Change to E2b.** `parseListing` now also returns `sourceLines`, `{ sequence, text }` for each listed line (blanks collapsed, the source date taken off in `mm/dd/yy`, `dd.mm.yyyy`, `yy-mm-dd` and `yy/ddd`),
because the mapping checks its position against the text the compiler saw. Additive: nothing else in the result changed, the E2b test is untouched. The other readers return it empty.

**Decisions.**
- **The ordinal, not the number, is the key.** The listing's SEQNBR is the member's SRCSEQ; the digits in columns 1-5 of the text are a different thing, and the E2a fixture has both blank. So the three writer behaviours the roadmap names
  cost the main rule nothing, because the compiler listed every line the writer left in the source:
  a commented-out OR line (`A*O 22 ...`, I-203) and removed lines kept as comments with their number (I-207) are lines like any other; a tag in columns 1-5 (I-204) is part of the text that was compiled and the listing shows.
  They matter only in the sequence fallback: a kept or commented-out copy can share its number with the live line, so comments are skipped, and a tagged line has no number to find (`no-sequence-numbers` when no line has one).
- **A moved line is followed, an edited line is not guessed at.** Showing a message on the wrong line is worse than showing it for the file. Clearing a diagnostic when its line is edited stays with E2d.
- **Text is compared with blanks collapsed, with and without columns 1-5.** Whether the listing prints those columns is not confirmed against a raw spool file, so either reading counts.
- **The diff costs by lines changed, not by source length.** A first version with a full table gave up on two small edits 10,000 lines apart; Myers' diff maps a 33,000-line source with an insert and an edit in about 0.2 s, and
  a source more than `maxEdits` lines away from the compile keeps only its common start and end.

**Not yet checked:** a raw spool file instead of the PDF text of the fixture (spacing, whether columns 1-5 print, lines wider than 80 in a wider source file); `CRTS36DSPF` and `CRTMNU` listings; a real compile of a member that was edited after
its last save. The mapping has no column information: a diagnostic covers the whole line until the marker tails are understood.

### E2d results

**E2d (editor diagnostics).** A failed `CRTDSPF` / `CRTS36DSPF` now puts its messages in the Problems panel, on the lines they belong to. New `src/compileDiagnostics.js`
(UMD, no `vscode` import, copied to `dist/` by `build:webview-assets`), `setTrackedSource` / `clearTrackedSource` in `src/diagnosticsHub.js`, and the wiring in `compileDspf`
and the CRTDSPF step of `compileMenu` in `src/extension.ts`. Tested by `src/test/e2dCompileDiagnostics.test.js` (41 checks): the E2a fixtures, a fake IBM i end to end
(listing, no spooled file, a text that is not a listing, no mark, a source edited or shifted since the compile, a connection that throws), and the hub.

**Flow.** `beginCompile` runs just before the command. On failure `collectCompileFeedback` fetches the listing (E2i), parses it (E2b) and maps it to the text that was compiled (E2c).
Without a usable listing (no spooled file, or a text that is not a compile listing) it parses the command's own error text instead; those messages are all file-level. The
result goes to the hub under source `CRTDSPF` or `CRTS36DSPF` (a `DSPF36` member), the raw text to the **iSDA Compile** Output channel, the toast gets a **Show Compile Output**
button, and the designer's failure banner gets a "N messages in the Problems panel" line. A compile of the member (start or success) clears the earlier messages first.

**Rules.**
- A mapped message is a diagnostic on its whole line (the E2c rule), code = message ID. A message with no line (the escape message, a line edited since the compile, an unknown layout, command text)
  is **file-level**: line 1, `fileLevel: true`, with a short note in the text when the reason is not obvious.
- Severity from the listing's bands: 0-9 information, 10-19 warning, 20 and over error, unknown warning. Command text has no severity, so the message ID decides: CPC and CPI information, CPD warning, the rest error.
- `noise` messages (SQL) are left out. The function never rejects: a failure inside returns `ok: false` and the compile's own error handling goes on as before.

**Following edits (hub).** Tracked diagnostics keep their plain form so they can move: an edit that touches a line removes that line's messages (they were about text that no longer exists); a line break
inserted or removed above moves the lines below with it; a whole line typed in front of a flagged line moves it down and is not an edit of it; several changes in one event are applied later text first;
file-level messages never move or go. Closing the document clears them. The `rules` source is not touched by any of this.

**Decisions.**
- **Source names.** The roadmap row said `CRTDSPF` / `CRTMNU`. The messages come from the display file compile, so the sources are `CRTDSPF` and `CRTS36DSPF`; the menu's other steps are E2f's.
- **After a failed compile only.** A successful compile does not fetch its listing (a round trip per compile for warnings nobody asked for), it only clears.
- **Edit-following lives in the hub**, which already sees the change events, so a later source (the E2f menu steps) gets it without code of its own.

**Not yet checked:** a real compile against an IBM i (the fetch is the E2i one, still fake-connection tested); the designer click-through from a message to the record or field (E2e); the other `compileMenu` steps (E2f);
a diagnostic on a line while the designer, not the text editor, has the focus. The two timing checks in `e1dCompletion` and `e1iRelease` failed once when four test shards ran at the same time and pass on their own.

### E2e results

**E2e (designer surface).** The DSPF designer shows the compile messages of the last failed compile and lets you go from a message to the thing it is about. Pure part in
`src/webviewClientHelpers.js` (`locateLine`, `indexCompileMessages`, an optional badge map on `rebuildRecordSelect`), the panel, badges and selection in `src/buildWebviewTemplate.js`,
`onDidChangeTracked` / `getTracked` in `src/diagnosticsHub.js`, the forwarding in `DspfDesignerEditorProvider` (`src/extension.ts`). Tested by `src/test/e2eDesignerCompileMessages.test.js`
(44 checks: the mapping, the designer's own script in jsdom, the hub's change notifications).

**Where the messages come from.** Not from the compile call: the designer is told what the hub holds. The hub tells a listener every time the tracked messages of a document change, with the reason
(`set` a compile put them there, `edit` an edit moved or dropped some, `close`), and the provider posts `{ type: 'compileMessages', fresh, messages }` to the panel of that document (`fresh` only for `set`).
A designer opened after the compile asks on `ready` and gets what is in the Problems panel. So the designer and the Problems panel always agree, and the E2d rule (an edited line loses its messages, lines below move) applies
to the badges too, including edits the designer itself makes by dragging.

**What it shows.**
- **Panel** under the canvas message: "Compile: 2 errors, 1 warning", one row per message (severity, `line N` or `file`, code, text). It is **dismissible**; dismissing hides the panel only, the badges stay. An update that only
  moves or drops messages does not bring a dismissed panel back; a new compile (`fresh`) does. `render()` does not clear it (the old canvas message is cleared by every render; this one follows the host).
- **Click** on a row selects what the line belongs to: a field or help entry (any of its lines: positional text, continuation, conditions, keywords), a record (switching the record list to it), or the file properties. A message
  with no line (the escape message), or on a line that is no element (a comment), is shown but not clickable.
- **Badges:** a count on the record list entries (`NAME · 2 ⚠`, the option value stays the bare name), on the File / Record / Field crumbs of the breadcrumb, and a dashed outline on the canvas field. The messages about what the props panel
  shows (field, help entry, record, file) are listed under the breadcrumb, which every props view shares, so each of them gets it without code of its own.
- Colours come from the existing theme variables; the `modern` UI style gets rounded corners and a tinted header. Message text and codes are escaped.

**Decisions.**
- **The designer follows the hub, not the compile call.** Pushing a list once at the end of a compile would have left the badges on lines that have since moved.
- **A message is attached to the element, not the line.** `locateLine` takes every line an entry owns, so a message on the second line of a wrapped keyword lands on its field.
- **Record-list text, not a second control.** The record list is the one place all records are visible at once, and `rebuildRecordSelect` already serves both copies of it.
- **Menu designer not touched.** Its compile steps are E2f.

**Not yet checked:** how the `classic` and `modern` styles actually look (jsdom has no layout, so the tests check the DOM and classes, not the pixels); a very long list of messages in a narrow panel (the list scrolls
after about 150 px); the same screen with a real IBM i compile (E2g).

### E2i results

**E2i (listing fetch).** New `src/compileListing.js` (UMD, copied to `dist/` by `build:webview-assets`), tested by `src/test/e2iCompileListing.test.js`
(55 checks) against a fake IBM i that models the V7R3 probes. Nothing calls it yet: E2d calls it after a failed compile.

**What the probes on the V7R3 system showed (Manojkumar).**
- `QSYS2.OUTPUT_QUEUE_ENTRIES` is a view over every output queue, with the columns `OUTQ`, `OUTQLIB`, `CREATED`, `SPOOLNAME`, `USER_NAME`, `USER_DATA`, `STATUS`,
  `SIZE`, `PAGES`, `JOB_NAME` (`number/user/name`, for example `980099/MANOJK/QPADEV02T6`) and `FILENUM` (not `SPOOLED_FILE_NAME` / `CREATE_TIMESTAMP`).
- The listing is named after the compiled file (`TESTDSP`) and sat in `QPRINT` / `QGPL`; three compiles gave three entries, two of them (minutes apart) in the same job and the
  latest in another, so a job outlives a single command and a new session means a new job. The compile job is a `QPADEV...` job; the SQL session is not that job.
- The user profile is not the library name (`MANOJK` against `MANOJKUMAR`): the user comes from `CURRENT USER`, never from a library.

**API.**
- `beginCompile(connection)` -> `{ since, user }`: `CURRENT TIMESTAMP` and `CURRENT USER` from the IBM i, taken just before the compile (the spooled file's `CREATED` is on that clock, not on the PC's). Each is `null` when unknown.
- `fetchCompileListing(connection, { fileName, user?, since? }, hooks?)` -> `{ ok: true, text, job, fileNumber, created, cleanupError? }` or `{ ok: false, reason, error }`,
  reason one of `badParameter`, `notConnected`, `lookup`, `notFound`, `library`, `create`, `copy`, `read`, `empty`. Never rejects. `text` goes to `CompileMessages.parseListing`.
- Steps: look up the newest spooled file named `<fileName>` of the user created since the start (job name and file number) -> make sure `ISDATEMP` exists (`hooks.ensureLibrary`, else the standalone step in `jobDateFormat.js`,
  now exported) -> `CRTPF FILE(ISDATEMP/<work>) RCDLEN(200) SIZE(*NOMAX) TEXT('iSDA compile listing - safe to delete')` -> `CPYSPLF FILE(<fileName>) TOFILE(ISDATEMP/<work>) JOB(<job>) SPLNBR(<n>) MBROPT(*REPLACE)`
  -> read `SELECT T.* FROM ISDATEMP.<work> T ORDER BY RRN(T)` -> `DLTF` in a `finally`.

**Decisions.**
- Nothing temporary goes in `QTEMP` (the SQL session and the command are different jobs). The work file is unique per call (`L` + 6 + 3 characters), is created only after the spooled file was found (so a
  missing spool creates nothing), and is deleted on every path that created it. A failed `DLTF` is reported as `cleanupError`; it does not fail the fetch.
- `JOB(...)` always names the job found in the lookup, never `JOB(*)`. A job name, file number, user, file name or time that is not a plain IBM i value is refused before it reaches a command or statement.
- The listing's own spooled file is left in the output queue (it is the user's output; every compile already leaves one).
- Without a `user` or a `since` the two filters are left out and the newest spool of that name wins.

**Not yet checked on a real system:** the `CPYSPLF` output (whether `RCDLEN(200)` suffices, whether page breaks show as blank lines or are dropped; the parser copes with either), the case of the column keys `runSQL` returns
(both cases are handled), and the cost of the lookup on a system with a very large number of spooled files (it is bounded by the name and the start time, but the view is system-wide).

### E2f results

**E2f (menu compile, per step).** A failed menu compile now says which step failed, with that step's messages, and which steps did not run. New `src/menuCompileSteps.js`
(UMD, no `vscode` import, copied to `dist/` by `build:webview-assets`); `compileMenu` in `src/extension.ts` runs it instead of its own inline chain. Tested by
`src/test/e2fMenuCompileSteps.test.js` (60 checks) with a fake IBM i connection: the plan, every step failing in turn, a command that throws, the report texts, the diagnostics and the hub.

**Steps and commands.** `planSteps` builds the same commands the extension always ran, character for character: `CRTDSPF`, `CRTMSGF`, one `ADDMSGD` per option (`USRnnnn`, `SEV(00)`, apostrophes
doubled) with its `CHGMSGD` retry, `CRTMNU`. `runSteps` runs them in order and stops at the first failure; each step keeps `{ phase, verb, label, command, status, code, text, messages }`, the messages
being the E2b `parseCommandText` result without the SQL noise. Statuses: `ok`, `exists` (`CRTMSGF` on a message file that is already there: not a failure, as before), `recovered` (an `ADDMSGD` that failed and
whose `CHGMSGD` retry worked), `failed`, `skipped` (planned, never run).

**What the person sees.**
- **Toast:** `<step> failed (<message IDs>):` then the text exactly as IBM i gave it, then `Not run: <phases>.` When `ADDMSGD` and its `CHGMSGD` retry both fail, both texts are in it (as before).
- **Output channel "iSDA Compile":** one line per phase (`ok`, `FAILED`, `not run`, with counts for `ADDMSGD`), then a block per step that ran with its command, return code, text and message IDs. Skipped steps are counted, not listed
  (a 30-option menu would otherwise print 30 lines). The toast has the **Show Compile Output** button when something was published.
- **Problems panel:** the failed step's messages as file-level diagnostics on line 1 of the menu member, under the step's own source (`CRTMSGF`, `ADDMSGD` or `CRTMNU`; the `CHGMSGD` retry is `ADDMSGD`), code = message ID,
  severity from the ID (CPC/CPI information, CPD warning, the rest error, the E2d rule), text prefixed with the step (and the option). The next compile clears them, with the display file ones.
- **Display file step:** unchanged from E2d. It is reported as the failed step, but its messages stay line-level from the compile listing.

**Decisions.**
- **File-level, not mapped to the command member.** `ADDMSGD` and `CHGMSGD` messages are about an option's command, which lives in the companion MNUCMD member; mapping an option to its line there is a second
  mapping rule, and nothing has been seen of what those messages say. They stay on the menu member, naming the option in the text.
- **The step list is data.** The commands and their order are no longer inline in the extension, so the order, the retry and the "already exists" rule are tested without VS Code.
- **No change to what runs.** Same commands, same order, same stop at the first failure, same retry; only what is kept and shown changed.

**Not yet checked:** the failure texts of `CRTMSGF`, `ADDMSGD` and `CRTMNU` on a real IBM i (the tests use synthetic text in the layout E2a recorded; only the `CRTDSPF` text is a real sample); the menu
designer has no panel for these messages (E2e built the display file designer's; the menu designer still relies on the toast, the Problems panel and the Output channel); a menu member's diagnostics while the
designer, not the text editor, has the focus. E2g (end-to-end tests) should add a recorded `CRTMNU` failure to the fixtures when one is available.

### E2g results

**E2g (end-to-end tests).** Tests only: no extension code changed. New `src/test/helpers/fakeCodeForI.js`, a fake Code for i connection (`runCommand`, `runSQL`) that plays back recorded compile
results, and `src/test/e2gCompileEndToEnd.test.js` (70 checks). Each scenario runs the registered `dspfDesigner.compileDspf` or `dspfDesigner.compileMenu` command against the real
extension, the way a click does, and reads back what a user sees: the Problems panel (the shared "iSDA" collection), the "iSDA Compile" Output channel and the toast. `vscode-mock.js` gained
`window.createOutputChannel` (`__outputChannels`) and keeps the toast's buttons (`__lastErrorButtons`).

**The fake.** The compile commands return the result scripted for their phase; a result with a `listing` also leaves a spooled file named after the compiled file. The SQL side models what E2i
recorded on V7R3: it is another job than the compile (the clock and user probe, the `ISDATEMP` library check, the `OUTPUT_QUEUE_ENTRIES` lookup filtered by name, user and creation time exactly as the
statement says), `CPYSPLF` must name the job and file number the lookup returned, work files are 200 characters wide and `DLTF` removes them. The IBM i clock moves on with every compile, so a later
compile never finds an earlier listing by mistake. Everything received is kept in `log`.

**What the scenarios check.**
- **A. Failing `CRTDSPF`, recorded listing.** The six listing messages land on lines 15, 17, 31 (three) and 36, and each line is checked against the DDS text the message is about (the second `CUSTID`, the
  `30  2'F3=Exit'` constant, the second `R HDRREC`, the `DSPATR(XX)` line); the escape message is file-level; the Output channel has the raw listing; the toast offers **Show Compile Output**. On the wire:
  the clock is read before the compile and the lookup after it, the work file is in `ISDATEMP` (created on first use), never `QTEMP`, the copy names the compile's own job and file number, never `JOB(*)`,
  and the work file is dropped.
- **B. Edits.** An edit on a flagged line drops its messages, a line added above moves the rest, the file-level message stays.
- **C. Recompile.** A good compile clears the messages and fetches no listing; a second failure shows its own seven messages (not fourteen) and reads the newest spooled file (number 4).
- **D. No listing.** No spooled file, a lookup that throws, a work file that cannot be made, and a dead SQL job: the command's own text is shown, all file-level, the Output channel says why, the toast still
  appears, nothing rejects, nothing is left in `ISDATEMP`.
- **E. System/36.** `CRTS36DSPF DSPFILE(...)` runs, the messages are under source `CRTS36DSPF`, a good recompile clears them.
- **F. Menu.** A failing display file step stops the compile (no `CRTMSGF`, `ADDMSGD` or `CRTMNU`) with its messages under `CRTDSPF`; a failing `CRTMNU` runs every step in order first, then shows two file-level
  messages under `CRTMNU`, the toast names the step and its IDs, the channel has the per-step report, no listing is fetched, and a good recompile clears them; a failing `ADDMSGD` and its `CHGMSGD` retry
  stop the compile before `CRTMNU`.

**Recorded and stand-in.** Recorded (E2a, a real failing `CRTDSPF` on V7R3M0): the command text and the listing. Stand-ins, written in the test and marked there: the `CRTS36DSPF` text (the recorded
`CRTDSPF` text is reused), the display file step of a menu (same text, no listing), and every `CRTMNU`, `ADDMSGD` and `CHGMSGD` failure text.

**Decisions.**
- **Through the registered commands, not the modules.** The modules have their own tests (E2b - E2f, E2i); what none of them could show is that `extension.ts` calls them in the right order and shows the result.
- **One shared fake, the older ones left alone.** `e2d`, `e2f` and `e2i` keep their own small fakes: they switch single failures on for one module and the shared one is for whole flows. Moving them would have
  been a refactor of passing tests.
- **Lines are checked against the DDS text, not only numbers.** A listing that moved by one line would still pass a test that only compares numbers with numbers.

**Not yet checked:** a real IBM i (every answer here is a recording or a stand-in); a recorded `CRTS36DSPF` listing and a recorded `CRTMNU` / `ADDMSGD` failure (E2f's note still stands: add them when one is
available); the designer's click-through from a message to a field (E2e's test covers the designer; this file does not open one).

### E2h results

**Released as v0.17.0** (the next free minor after E1i's 0.16.0; the E2 work shipped as v0.16.2 - v0.16.9 and this entry rolls it up). Every sub-task E2a - E2g and E2i is Done. The acceptance paragraph, one criterion at a time:

| Acceptance criterion | Met by | Evidence |
|----------------------|--------|----------|
| After a failed compile of a remote member, each message that carries a source sequence number appears as a diagnostic on the right line (editor) | E2a decision, E2b parser (v0.16.2), E2c line map (v0.16.5), E2i listing fetch (v0.16.4), E2d Problems panel (v0.16.6) | `e2gCompileEndToEnd.test.js` scenario A: the six listing messages land on lines 15, 17, 31 (three) and 36 and each line is checked against the DDS text it is about; the escape message is file-level. Recorded from a real failing `CRTDSPF` on V7R3M0 |
| ... and as a badge on the right record/field (designer) | E2e (v0.16.7) | `e2eDesignerCompileMessages.test.js` (the designer's own script in jsdom: panel, click-to-select, record-list, breadcrumb and props badges, canvas outline); `e2hRelease.test.js` follows one compile to the designer: the same 7 messages reach the real designer provider's panel, and `indexCompileMessages` puts them on the field `CUSTID` (line 15), the `F3=Exit` constant (line 17), the `DSPATR(XX)` field (three messages), and the record `HDRREC` (line 36); record badges DTLREC 3 and HDRREC 3 |
| A successful recompile clears them | E2d, E2e | `e2gCompileEndToEnd.test.js` scenario C (Problems panel empty, no listing fetched); `e2hRelease.test.js` section 4: the designer is sent an empty fresh list |
| Menu compile reports which of its steps failed | E2f (v0.16.8) | `e2fMenuCompileSteps.test.js` (every step failing in turn) and `e2gCompileEndToEnd.test.js` scenario F: the toast names the step and its message IDs, the Output channel has the per-step report, the steps that did not run are listed |

Beyond the criteria: edits move or drop messages on both surfaces together (E2d hub, E2e; `e2hRelease.test.js` section 3), a designer opened after a failure is sent what is already in the Problems panel (section 5), the compile never leaves a work file behind and never uses `QTEMP` (E2i, E2g), and a failed listing fetch falls back to the command's own text without rejecting (E2g scenario D). `e2hRelease.test.js` (18 checks) was checked by breaking the designer's line mapping and the hub's fresh flag on a scratch copy: each break fails it.

**What E2 leaves open, by decision.**
- **Never run against a real IBM i by this repo's tests.** Every answer is a recording or a stand-in. Still unconfirmed on the V7R3 system: the `CPYSPLF` output layout (whether `RCDLEN(200)` suffices, how page breaks appear), the case of the column keys `runSQL` returns, and the cost of the spooled-file lookup on a system with a very large number of spooled files (E2i).
- **Stand-in failure texts.** Only the `CRTDSPF` listing and command text are recorded. The `CRTS36DSPF` text, the `CRTMSGF`, `ADDMSGD`, `CHGMSGD` and `CRTMNU` failures are written in the tests and marked there; a recorded `CRTS36DSPF` listing (SFGR layout may differ) and a recorded `CRTMNU` failure should replace them when available (E2f, E2g).
- **Menu messages are file-level.** `ADDMSGD` / `CHGMSGD` messages are about an option's command in the companion MNUCMD member; mapping an option to its line is a second rule and was not built (E2f). The menu designer has no panel for compile messages: it relies on the toast, the Problems panel and the Output channel.
- **Not checked in a real VS Code.** The tests use a fake of the VS Code API and jsdom has no layout, so the Problems panel, the designer's compile panel and its badges in the `classic` and `modern` styles were never seen in an Extension Development Host. A short manual pass (fail a `CRTDSPF`, read the Problems panel, click a message in the designer, fix and recompile) is still owed before this ships to users.
- **A diagnostic while the designer, not the text editor, has the focus** is covered by the hub (the designer follows it) but was not exercised in a real window.
- **Successful compiles fetch no listing**, so warnings from a good compile are not shown (E2d decision).
- **Two timing checks** (`e1dCompletion`, `e1iRelease`) failed once when four test shards ran at the same time and pass on their own (E2d note).

---

## E3

**Indicator simulator**

**Goal.** Let the designer flip indicators and program-to-system field values and see the screen the program
would produce, with an explanation of why each keyword is or is not in effect.

**Acceptance for the release.** A panel lists the indicators actually used in the file, labelled from `INDTXT`
where present; toggling one re-renders the preview; named scenarios can be saved and recalled without touching
the source; the keyword-reactivity table (E3d) has no `not reactive` row for a keyword that IBM says takes
option indicators and no `Gap` row owned by an E3 sub-task (a `Gap` that names a sub-task of another epic stays
open until that epic's release; at the E3 release that was `ERRMSGID`, `Gap (E4c)`, closed by the E4 release, v0.15.6); program-to-system field values
can be set and are shared with other features.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E3a | **Audit what exists.** The engine already takes an active-indicator set and the New UI has a conditioning-indicators preview (P5g). Write down exactly what is there, in both UI styles and the menu designer, and what is missing. Output: a gap list that scopes E3b - E3e. | - | Done (no code change) | — |
| E3b | **Indicator discovery panel.** Scan the file/record for every indicator referenced (including `N` negation and the 01-99 range), list only those, label from `INDTXT`; "show all 99" toggle; per-record vs file-wide view. | E3a | Done | v0.13.4 |
| E3c | **Scenarios.** Save, rename, delete and recall named indicator sets (for example "error state", "empty subfile"). **Decision first:** storage in VS Code `workspaceState` vs an optional sidecar file; the source is never written. | E3b | Done | v0.13.4 |
| E3d | **Keyword reactivity.** Table of every keyword IBM says accepts option indicators vs whether the engine reacts to it in the preview (`DSPATR`, `COLOR`, `ERRMSG`, `SFLDSP`/`SFLCLR`/`SFLEND`/`SFLDSPCTL`, `PROTECT`, ...); implement the gaps. The table lives in this document's E3d section and is checked by a test against `keywordSpec.js`. | E3a | Done | v0.13.6 |
| E3e | **Explain panel.** For the selected field/record: each keyword line, whether it is active under the current indicators, and the indicator expression that decided it. | E3b | Done | v0.13.9 |
| E3f | **Program-to-system field value store.** Design-time values for fields the program sets at run time (choice control fields, `WINDOW` position fields, `SFLSIZ`, message-data fields): a small store keyed by file, record and field, with an editor in the simulator panel. Used by E4c, E8 and E10. Same storage rule as E3c. | E3c (storage decision) | Done | v0.13.4 |
| E3g | **Menu designer parity.** Offer the panel in the menu designer where menu records carry conditioned content. **Decision first:** may be dropped if E3a shows menus have nothing to simulate. **Decision (Manojkumar): build it, full parity** (see E3g results). | E3b | Done | v0.13.10 |
| E3h | **Release** (next free version; Manojkumar chose a patch number). Results against the acceptance paragraph: [E3h results](#e3h-results). | E3a - E3g, E3i - E3l | Done | v0.14.1 |
| E3i | **`DFTVAL` default value.** Draw the default value in the field on the first output when its option indicator is on or absent (reference: "the specified value is displayed if the option indicator is on or has not been specified"). **Decision (settled):** the value replaces the field name, as on the real first output (the field name stands in for the unknown program value only when `DFTVAL` is not in effect); no "beside it" form. Built in `dspfEngine.js` (`dftvalText`): named `O` / `B` fields outside a subfile format, first instance whose condition holds, quoted value with `''` as one quote, cut to the field length, padded with blanks; an unquoted value (still being typed) keeps the name. Test: `e3iDftvalDefaultValue.test.js`. | E3d | Done | v0.13.8 |
| E3j | **Menu bar drawing.** `MNUBARSEP` (colour, attribute and character of the separator line under the menu bar) and `MNUBARDSP` (the menu bar of another record shown when this record is written), both honouring their option indicators. | E3d | Done | v0.13.7 |
| E3k | **Cursor position (`CSRLOC`).** Place the cursor marker from the two program fields' design-time values in the E3f store (a new `cursorLocation` namespace); an off `CSRLOC` leaves the default cursor. | E3d, E3f | Done | v0.13.11, v0.13.13 |
| E3l | **Record overlay keywords in display mode.** `OVERLAY`, `PROTECT`, `ERASE`, `ERASEINP`, `PUTOVR`, `PUTRETAIN` change what earlier records show, so they can only be drawn when several records are previewed together (the existing display mode); make that mode honour them under the active indicators. **Decision (settled):** draw `OVERLAY`, `ERASE`, `ERASEINP`; `PROTECT`, `PUTOVR`, `PUTRETAIN` stay Not drawn (see E3l results). | E3d | Done | v0.13.12 |


### E3a results

**E3a (audit, no code change).** What the designer had before E3b - E3f, read from `buildWebviewTemplate.js`,
`dspfEngine.js` and `buildMenuWebviewTemplate.js`.

| Area | What exists | Gap |
|------|-------------|-----|
| Engine | Every resolver takes one active-indicator set (`conditionsSatisfied`); `resolveScreen`, `resolveMultiScreen`, the function-key legend, SFLEND, fold / drop and the choice states all use it. | Nothing for program-to-system values except the E10c / E10d `choicePreviewStates` object. |
| Designer, both UI styles | One `active` set; a checkbox list (P5g) built into the aside `#indicatorList` and the toolbar `#toolbarIndicatorList`, scoped to the previewed record (the SFL side only when the SFLCTL side is on screen, an open pulldown, and the file-level keywords). | No `INDTXT` label; no way to turn on an indicator the screen does not use; no whole-file view; the set is lost when the designer closes; no saved scenarios; no list of what is stored. |
| Menu designer | Option rows carry a conditioning editor; nothing previews indicators. | Nothing to simulate yet: the option rows are not drawn conditioned (E3g decides). |
| `INDTXT` | In the spec (file, record and field level, `INDTXT(indicator 'text')`, text up to 50 characters) and in the writer's allowed-keyword lists; the engine never read it. | Needed for the labels (E3b). |
| Storage | `globalState` keeps only the UI style and theme. | No per-file storage (E3c decision). |

The gap list scoped E3b (labels, show all, scope), E3c (storage and scenarios) and E3f (the value store); E3d (keyword
reactivity), E3e (explain panel) and E3g (menu designer) are unchanged and still Open.

### E3b / E3c / E3f results

**E3b, E3c, E3f (built, v0.13.4).** One new pure module, `src/indicatorSim.js` (no `vscode`, no DOM; loads after
`dspfEngine.js` in both builds and is in the `dist` copy list), and one panel in the designer.

- **E3b, discovery.** `contextIndicators` (the P5g scoping rules, moved out of the webview and now unit-tested),
  `fileIndicators` (everything the file uses), `indicatorLabels` (from `INDTXT` at file, record, field and help
  level; the first text for an indicator wins; a doubled quote is one quote) and `indicatorEntries`
  (`{ number, label, used, on }`). The list in both copies of the panel has a scope selector (This screen / Whole
  file) and a "Show all 99" box; rows the scope does not use are dimmed. Each row keeps its `Ind NN` span; the label
  is a second span.
- **E3c, scenarios.** *Decision: VS Code `workspaceState`, one entry per file under `isda.simulatorState`, not a sidecar
  file.* The state is a design aid, not part of the project: nothing is added to the repository or beside the member
  (a remote IBM i member has no sibling files at all) and nothing but the extension can leave it stale. The cost is that
  it does not follow the project to another machine; a sidecar can be added later behind `loadFileState` /
  `saveFileState`. A scenario is `{ name, indicators }`: choosing one turns exactly its indicators on; Save stores the
  indicators that are on now under the typed name (an existing name, any case, is overwritten in place); Rename and
  Delete (confirmed) act on the chosen one. Names are at most 40 characters, case-insensitively unique, at most 50 per
  file; the 200 most recently saved files are kept.
- **E3f, the value store.** `{ namespace: { key: value } }`; a namespace belongs to one feature and states what a valid
  key and value are (`IndicatorSim.VALUE_NAMESPACES`), so a stored value is never a shape its reader does not expect.
  Values under an unknown namespace, a malformed key or an out-of-range value are dropped on load. First namespace:
  `choiceControl` (key `DspfEngine.choiceStateKey(record, field, choice or row)`, integer 0 - 4). **E4c (message data)
  and E8 (window position and size) register their own namespace here** instead of adding a second store. The
  simulator panel lists every stored value (`REC.FLD (choice / row n) = v`) with a remove button and "Clear all stored
  values". The extension host loads the file's state on `ready` (`simulatorState` message) and saves on every change
  (`saveSimulatorState`); loading posts nothing back.
- **Not done (still Open):** E3h release (E3d's gaps are E3i, E3k and E3l, all done). A value
  store editor for a new namespace is the job of the feature that adds the namespace.
- Tests: `e3IndicatorSim.test.js` (pure logic, a fake memento), `e3SimulatorPanel.test.js` (both panel copies,
  messages, reset).

### E3d results

**E3d (built, v0.13.6).** Every keyword IBM says takes option indicators is in the table below, with whether the
preview reacts to its indicator. The list is the union of the DDS Reference sections that say "Option indicators are
valid for this keyword" and the keywords whose `keywordSpec.js` entry says so (`optionIndicators: 'valid'` /
`optionIndicatorsValid`); `e3dKeywordReactivity.test.js` fails when a keyword is in one of them and not in the table, when
a row names a keyword neither says takes option indicators, and when a row's status disagrees with what the engine does.

Three statuses, nothing else:

- **Reactive** - the engine output changes with the indicator (the test turns the indicator on and off).
- **Not drawn** - the effect is not part of a static screen: a key assignment, an alarm, a run-time value, or a state
  that exists only while the cursor moves. The reason is in the row. The test checks the engine really does not change.
- **Gap (E3x)** - the effect can be drawn and the preview does not draw it yet; the sub-task that will is named.

The acceptance rule for the release (E3h) is: no `Gap` row owned by an E3 sub-task left (see the acceptance paragraph; the one `Gap` row that named another epic was `ERRMSGID`, `Gap (E4c)`, now Reactive: closed at the E4 release).

What E3d changed in the engine. Each of these read the keyword but ignored its condition before:

| Keyword | Before | Now |
|---------|--------|-----|
| `WDWTITLE`, `WDWBORDER` | the first instance was used whatever its indicator (the file-level `WDWBORDER` too) | the first instance whose condition holds; with none, the documented default |
| `CAnn`, `CFnn` | the legend listed every key | a key whose own condition does not hold is not listed and does not claim its number from a later instance |
| `CHOICE` (selection fields) | every choice was drawn | an off `CHOICE` is dropped and the list compresses ("When a CHOICE keyword is turned off, the list of choices is compressed") |
| `MNUBARCHC` | every choice was drawn | an off choice is dropped and the menu bar compresses |
| `SFLDSP` | the page of subfile records was always drawn | an off `SFLDSP` draws no subfile page |
| `SFLDSPCTL` | the control record was always drawn | an off `SFLDSPCTL` draws none of the control record (constants included) |

`ERRMSG` is reactive only on a window record: the preview draws an error line only inside a window's reserved message
line. A record without `WINDOW` has no error line to show; that is a limit of the preview, not a gap in the table.

| Keyword | IBM levels | Preview | Notes |
|---------|------------|---------|-------|
| ALARM | record | Not drawn | sounds the terminal alarm; nothing on the screen |
| ALWGPH | file, record | Not drawn | lets the device use graphics characters; no drawn difference |
| BLINK | record | Not drawn | the cursor flashes while the record is displayed; the preview draws no blinking cursor |
| CA01-CA24 | file, record | Reactive | the function-key legend drops a key whose own condition does not hold (E3d) |
| CF01-CF24 | file, record | Reactive | same as CAnn (E3d) |
| CHCAVAIL | field | Reactive | choice-state colours and attributes (E10c/E10d) |
| CHCSLT | field | Reactive | choice-state colours and attributes (E10c/E10d) |
| CHCUNAVAIL | field | Reactive | choice-state colours and attributes (E10c/E10d) |
| CHOICE | field | Reactive | an off CHOICE is dropped and the list compresses (E3d) |
| CLEAR | file, record | Not drawn | assigns the Clear key; a key assignment is not part of the drawn screen |
| COLOR | field | Reactive | field colour |
| CSRINPONLY | file, record | Not drawn | restricts where the cursor may go; no static drawing |
| CSRLOC | record | Reactive | the cursor is drawn at the line and position the two program fields hold (E3f `cursorLocation` values); an off CSRLOC leaves the default cursor (E3k) |
| DFTVAL | field | Reactive | the default value is drawn in the field in place of the field name while its condition holds (E3i) |
| DSPATR | field | Reactive | display attributes (HI, RI, UL, ND, PR, ...) |
| DSPMOD | record | Not drawn | switches the display size at run time; the preview has its own size selector |
| DUP | field | Not drawn | the Dup key behaviour for the field; no drawn difference |
| ENTFLDATR | field, record, file | Not drawn | the field changes attribute while the cursor is in it; an interaction state with no static form |
| ERASE | record | Reactive | with OVERLAY, erases the named records already on the display; shown in the stacked view with the write sequence on (E3l) |
| ERASEINP | record | Reactive | with OVERLAY, ERASEINP(*ALL) erases the unprotected input fields already on the display; shown in the stacked view (E3l) |
| ERRMSG | field | Reactive | the message line: a window's own last line, or the display's message line (last line, or `MSGLOC`) for a record without `WINDOW` or a window with `*NOMSGLIN` (E4c) |
| ERRMSGID | field | Reactive | the message text from the message file on the same message line as `ERRMSG`, after it in IBM's priority; with no text the line shows the ID and why (E4c) |
| FRCDTA | record | Not drawn | forces data to the display at output; no drawn difference |
| HELP | file, record | Not drawn | assigns the Help key; a key assignment is not part of the drawn screen |
| HLPBDY | help | Not drawn | help text area; online help is not previewed |
| HLPCLR | record | Not drawn | help text clearing; online help is not previewed |
| HLPDOC | file, help | Not drawn | help document; online help is not previewed |
| HLPEXCLD | help | Not drawn | help exclusion; online help is not previewed |
| HLPPNLGRP | file, help | Not drawn | help panel group; online help is not previewed |
| HLPRCD | file, help | Not drawn | help record; online help is not previewed |
| HLPRTN | file, record | Not drawn | assigns the Help-return key; a key assignment is not part of the drawn screen |
| HOME | file, record | Not drawn | assigns the Home key; a key assignment is not part of the drawn screen |
| INVITE | file, record | Not drawn | invites a device for input; no drawn difference |
| INZINP | record | Not drawn | initializes input fields at output; the preview draws no field values |
| LOCK | record | Not drawn | locks the keyboard; no drawn difference |
| LOGOUT | record | Not drawn | sign-off key; no drawn difference |
| MDTOFF | record | Not drawn | resets the modified-data tags; no drawn difference |
| MNUBARCHC | field | Reactive | an off choice is dropped and the menu bar compresses (E3d) |
| MNUBARDSP | record | Reactive | the menu bar of the named record is drawn with this record when the first instance in effect names it; on the menu-bar record itself an off MNUBARDSP shows no bar (E3j) |
| MNUBARSEP | field | Reactive | colour, attributes and character of the separator line under the menu bar; the first instance in effect is used; only `ND` hides it (E3j) |
| MNUBARSW | file, record | Not drawn | assigns the switch-to-menu-bar key; a key assignment is not part of the drawn screen |
| MNUCNL | file, record | Not drawn | assigns the cancel key for menus; a key assignment is not part of the drawn screen |
| MSGALARM | file, record | Not drawn | sounds the alarm for a message; nothing on the screen |
| OVERLAY | record | Reactive | records already on the display that share cells with this one are deleted; shown in the stacked view (E3l) |
| OVRATR | record, field | Not drawn | the program overrides the field attribute at run time |
| OVRDTA | record, field | Not drawn | the program overrides the field data at run time |
| PAGEDOWN | file, record | Not drawn | assigns the Page Down key (ROLLUP); a key assignment is not part of the drawn screen |
| PAGEUP | file, record | Not drawn | assigns the Page Up key (ROLLDOWN); a key assignment is not part of the drawn screen |
| PRINT | file, record | Not drawn | assigns the Print key; a key assignment is not part of the drawn screen |
| PROTECT | record | Not drawn | makes input fields of the records already shown output only, which changes input capability and not what is drawn |
| PSHBTNCHC | field | Reactive | an off push button is dropped and the buttons compress (I-57) |
| PUTOVR | record | Not drawn | output overrides (OVRDTA, OVRATR) take effect at run time from the program's data, which a preview does not have |
| PUTRETAIN | record, field | Not drawn | retains a run-time override across output operations; there is no override in a design-time preview |
| RETLCKSTS | record | Not drawn | returns the record-lock status to the program |
| RMVWDW | record | Not drawn | removes the window when the record is written; the preview shows one record |
| SFLDROP | record | Reactive | the subfile starts truncated (P6) |
| SFLDSP | record | Reactive | an off SFLDSP shows no page of subfile records (E3d) |
| SFLDSPCTL | record | Reactive | an off SFLDSPCTL shows none of the control record (E3d) |
| SFLFOLD | record | Reactive | the subfile starts folded (P6) |
| SFLINZ | record | Not drawn | initializes the subfile at output; the preview draws no record contents |
| SFLNXTCHG | record | Not drawn | marks the next record as changed; no drawn difference |
| USRRSTDSP | record | Not drawn | keeps the window from restoring the display under it; the preview shows one record |
| WDWBORDER | file, record | Reactive | window border colour, attributes and characters (E3d: honours the condition) |
| WDWTITLE | record | Reactive | window title (E3d: honours the condition) |

**Finding (not fixed here).** Six keywords the Reference says take option indicators have no `optionIndicators` /
`optionIndicatorsValid` fact in their `keywordSpec.js` entry, so `optionIndicatorsAllowed` answers false for them:
`DFTVAL`, `DSPATR`, `DSPMOD`, `DUP`, `HLPPNLGRP`, `PSHBTNCHC`. It is the same shape of finding as I-176 (the
`optionIndicatorsValid` spelling), one step further: an entry with no fact at all. The E3d test reads the Reference
for these six and does not depend on the spec for them.

### E3e results

**E3e (built, v0.13.9).** An **Explain (indicators)** accordion on the Keywords tab of the field panel and at the
bottom of the record panel's keywords (collapsed by default, both UI styles). It lists the selected field's or record's
keyword lines in source order, and for each: the option-indicator expression as written (`01 AND N02 OR 03`; `*DS3` /
`N*DS3` for a display-size condition), whether the line is **In effect** or **Not in effect** under the indicators being
previewed, and what decided it in words (`01 is off`, `N02: 02 is off`, `*DS4 is not the selected size`; with several
groups, the group that holds, or the failing fact of each group).

- **Same answer as the preview.** The panel is built on `conditionsSatisfied` (`DspfEngine.explainKeywords`,
  `explainConditions`, `conditionsExpression`), and a test compares the two for every combination of indicators. The
  panel is rebuilt by every `render()`, so ticking an indicator in the simulator refreshes it.
- **The owner's own condition comes first.** A field or record whose own conditions do not hold is not drawn, so every
  line says so ("not drawn: the field's own condition does not hold"); a hidden (`H`) or program-to-system (`P`) field
  says it is never drawn.
- **First-in-effect keywords.** `WDWTITLE`, `WDWBORDER`, `MNUBARDSP`, `CNTFLD` and `DFTVAL` are read as the first instance
  whose condition holds; a later instance that also holds is shown as active but not used ("an earlier DFTVAL is in
  effect"). Other repeatable keywords (`COLOR`, `DSPATR`, ...) are all listed with their own state.
- **Decision (Manojkumar).** An accordion in the field and record panels, not a separate pane; fields and records both; the
  menu designer is left to E3g.
- Not done: help-specification and file-level keyword lists have no explain section (the roadmap row says field / record).
- Tests: `e3eExplainPanel.test.js` (condition text and reasons, owner conditions, first-in-effect, agreement with
  `conditionsSatisfied`, the webview on a record and a field).

### E3g results

**E3g (built, v0.13.10).** The menu designer has the indicator simulator panel, so a menu's option rows can be
previewed under indicators.

- **Decision (Manojkumar): build it, with full parity.** The roadmap allowed dropping E3g if menus had nothing to
  simulate. They do: a menu option is a DDS constant and takes option indicators like any other field, the engine
  already honours them (`resolveScreen` with an active set), and the menu designer always called it with an empty set,
  so an option conditioned on `10` was never drawn and one conditioned on `N10` always was. The E3a note "the option
  rows are not drawn conditioned" was about the designer, not the engine. Full parity means everything E3b / E3c / E3f
  gave the DSPF designer, not just the checkbox list.
- **Panel.** An **Indicator simulator** section in the left panel of the menu designer (open by default, collapsible,
  both UI styles): the scope selector (This screen / Whole file), "Show all 99", the indicator checkboxes labelled from
  `INDTXT` (unused rows dimmed), the scenario row (Save, Rename, Delete) and the stored run-time values list. The
  screen is drawn under the ticked indicators; the ticked set is kept when the record or the section changes. Scope
  rules are the DSPF designer's (`IndicatorSim.contextIndicators`); the menu designer has no pull-down state.
- **Shared storage.** The host handles `saveSimulatorState` / `simulatorState` for the menu designer with the same
  `workspaceState` entry, keyed by the member's URI, as the DSPF designer. A `.mnudds` member opened in either designer
  shows the same scenarios and stored values. The DDS source is never written by the panel.
- **The Options list is unchanged.** It still shows one row per option number (the first constant found), so two
  variants of option 2 under `10` and `N10` are one row there; the preview is where the variants show. Changing the
  list to show variants would change what an edit to an option row means (which variant?), so it is not part of this
  task.
- **Not done.** The explain panel (E3e) has no menu-designer copy: the menu designer has no field or record keyword
  panel to put it in. The panel code is a copy of the DSPF designer's (inline in each template); moving both onto one
  shared builder in `webviewClientHelpers.js` is a possible refactor.
- Tests: `e3gMenuSimulator.test.js` (the preview under indicators, the list and labels, scope and show-all, record
  switch, scenarios, what is posted and loaded, stored values, nothing written to the source, the host handlers).

### E3h results

**Released as v0.14.1** (Manojkumar chose a patch number, 0.13.14, but E10e released v0.14.0 in a parallel session first, so the next
free number was used; the E3 work shipped as v0.13.4 - v0.13.13 and this entry rolls it up). Every sub-task E3a - E3l is Done. The acceptance paragraph, one criterion at a time:

| Acceptance criterion | Met by | Evidence |
|----------------------|--------|----------|
| A panel lists the indicators actually used in the file, labelled from `INDTXT` where present | E3b (v0.13.4), menu designer E3g (v0.13.10) | `e3IndicatorSim.test.js`, `e3SimulatorPanel.test.js`, `e3gMenuSimulator.test.js` |
| Toggling one re-renders the preview | E3b; the engine honours the indicator on every keyword in the table (E3d, E3i, E3j, E3k, E3l) | the same panel tests; `e3dKeywordReactivity.test.js` turns each indicator on and off against the engine |
| Named scenarios can be saved and recalled without touching the source | E3c (v0.13.4) | scenario checks in `e3SimulatorPanel.test.js`; both designers assert that no `applyEdit` is posted |
| The keyword-reactivity table has no `not reactive` row and no `Gap` row owned by E3 | E3d, E3i, E3j, E3k, E3l | the table's three statuses are checked against `keywordSpec.js` and the engine; the rows that were `Gap (E3k)` and `Gap (E3l)` are now Reactive or Not drawn with a reason |
| Program-to-system field values can be set and are shared with other features | E3f (v0.13.4), `cursorLocation` (E3k) | two namespaces in the store (`choiceControl` for E10, `cursorLocation` for `CSRLOC`); the menu designer reads and writes the same per-file entry |

**What E3 leaves open, by decision.**
- **`ERRMSGID` is `Gap (E4c)`** in the E3d table. Its text comes from a message file, which is the E4 epic (all of E4 is Open).
  Manojkumar chose to release E3 with that row owned by E4c, and the acceptance paragraph says so; E4g's release closes it
  (done in v0.15.6: the row is Reactive since E4c).
- **`PROTECT`, `PUTOVR`, `PUTRETAIN`** are Not drawn on purpose (E3l decision): they change nothing that is drawn.
- **No explain panel in the menu designer** (E3g: the menu designer has no field or record keyword panel to host it), and the
  help-specification and file-level keyword lists have no explain section (E3e).
- **Window records and `CSRLOC`** count from the window (v0.13.13); subfile and user-defined records cannot take the keyword.
- **Stored state does not follow the project to another machine** (E3c decision: `workspaceState`); a sidecar can be added
  behind `loadFileState` / `saveFileState`.

**Consumers of the store that are still to come:** E8 (window position and size) and E4c (message data) register their own
namespace in `IndicatorSim.VALUE_NAMESPACES`; they do not add a second store.

### E3l results

**E3l (built, v0.13.12).** The combined (stacked) preview can now be shown as a **write sequence**:
`DspfEngine.resolveMultiScreen(model, records, indicators, sizeIndex, { writeSequence: true })`. The records are written in
list order (the stacking order) and `OVERLAY`, `ERASE` and `ERASEINP` act on the records already on the display; the
result also carries `writeEffects` (`{ record, effect, records }[]`) saying what each removed. The webview's **Full
overlay** view turns it on and adds what was removed to its hint ("REC2 OVERLAY removes REC1."). The dimmed backdrop
view and any caller that passes no option are unchanged.

- **OVERLAY.** Records already on the display whose fields share at least one cell with this record's are deleted whole
  (a partial overlap deletes the record; records that share no cell stay) - IBM's own REC1..REC5 example is a test. OVERLAY
  conditioned and not selected: nothing acts, and `ERASE` / `ERASEINP` "cannot take effect" either.
- **ERASE(rec ...).** With OVERLAY in effect, the named records already on the display are removed; may repeat, a name that
  is not on the display is ignored, option indicators per instance.
- **ERASEINP.** With OVERLAY in effect, `ERASEINP(*ALL)` removes the unprotected input-capable fields (`I` / `B`, not
  `DSPATR(PR)`) of the earlier records; constants and output fields stay, and so do this record's own input fields. Plain
  `ERASEINP` and `ERASEINP(*MDTON)` erase only fields whose changed-data tag is on, which a design-time preview cannot know,
  so they erase none.
- **Decision (Manojkumar's go-ahead on the proposed split).** `PROTECT` (input capability), `PUTOVR` and `PUTRETAIN`
  (run-time overrides) change nothing that is drawn, so they stay Not drawn in the E3d table with that reason.
- **Decision (mine, easy to reverse).** The write sequence is opt-in and the default of the real display, deleting everything
  on a write without OVERLAY, is not applied: the combined view is a comparison that shows every record, and applying that
  default would hide all but the last record in every file that has no OVERLAY. Calling the option for a file with no
  OVERLAY / ERASE / ERASEINP changes nothing.
- Not done: window records are removed with their record but a window's own overlap with other records' cells is not
  considered; `ERASE` is not checked against the "cannot erase a CLRL record" case (no CLRL in the preview).
- Tests: `e3lWriteSequence.test.js` (overlap, IBM's example, ERASE, ERASEINP, indicators, the Full overlay hint), and the E3d
  table test now runs `OVERLAY` / `ERASE` / `ERASEINP` through the stacked view.

### E3k results

**E3k (built, v0.13.11; window records v0.13.13).** The preview draws the cursor a record's `CSRLOC(line-field position-field)` places.
Reference: CSRLOC in DDS for display files.

- **Where the values come from.** The two fields are program fields, so their values are design-time values in the E3f
  store: a new `cursorLocation` namespace, key `RECORD|FIELD` (upper case), integer 0 - 999 (the fields are 3-byte
  zoned decimal). `dspfFile.cursorLocationValues` carries them to the engine, the way `choicePreviewStates` carries
  the choice control values; nothing is written to the source. The store is per file, shared with the menu designer.
- **Editor.** In the simulator panel (aside and toolbar copies), a **Cursor (CSRLOC)** section appears for the
  previewed record when it names cursor location fields: one number box per field, empty removes the value, over 999
  is refused with the panel's usual message. The stored-values list shows them as `REC.FLD (CSRLOC)`.
- **Drawn.** A blinking block (the DSPATR(PC) look) on its own grid cell at the stored line and position
  (`resolveCursorLocation`, `screen.cursor`). Rules taken from the Reference: the first instance whose option
  indicators hold is in effect (an off `CSRLOC` leaves the default cursor); values outside the display make the
  keyword ignored; `CSRLOC` overrides `DSPATR(PC)`, so the PC marker is dropped while a `CSRLOC` cursor is drawn and
  stays when the keyword is ignored. Names written with `&` are read the same.
- **Window records (v0.13.13).** The line and position count from the window (Manojkumar): 1 / 1 is the window's
  first usable cell, the same origin its fields use, so `WINDOW(5 10 8 40)` with 2 / 3 draws at screen 6 / 12. The
  value must lie inside the window (1 - height, 1 - width); a value past the window is ignored even when the screen
  has room, and the cursor's tooltip says "of the window". v0.13.11 left window records undrawn because the origin was
  not known.
- **Not drawn.** Subfile and user-defined records (the keyword is invalid there); the several-records display mode,
  which has no single cursor. A keyword with other than two parameters is ignored.
- The E3d table row for `CSRLOC` is now Reactive (no `Gap` row is left for E3k).
- Tests: `e3kCursorLocation.test.js` (values, range, indicators, PC override, records that cannot take it, the store
  namespace, the editor and the drawn cursor in both panel copies); `e3dKeywordReactivity.test.js` probes `CSRLOC`
  with stored values.

### E3j results

**E3j (built, v0.13.7).** The preview now draws the menu bar's separator line and the menu bar a record displays.
Reference: `MNUBAR`, `MNUBARSEP`, `MNUBARDSP` in DDS for display files (both keywords say "Option indicators are valid
for this keyword"; `MNUBAR` says they are not).

- **Separator line.** `MNUBAR(*SEPARATOR)` is the default, so a menu-bar record draws one row of the separator character
  across the whole screen, on the line below the bar field: blue dashes unless `MNUBARSEP` says otherwise. `*NOSEPARATOR`
  draws none. `MNUBARSEP((*COLOR c) (*DSPATR a) (*CHAR 'x'))` sets colour, attributes (BL blinks, HI bold, UL underlined,
  RI a reverse-image bar) and character; the first instance whose option indicators hold is used.
- **`MNUBARDSP(menu-bar-record &choice-field [&pull-down-input])`** on an ordinary record draws the named `MNUBAR` record's
  bar and separator with it; the first instance in effect is used; a record that does not exist, or has no `MNUBAR`, draws
  nothing. **`MNUBARDSP[(&pull-down-input)]`** on the `MNUBAR` record decides whether that bar is displayed (an off instance
  and no other in effect: no bar, no separator; no `MNUBARDSP` at all: not gated). Both work in display mode too.
- **Decision (Manojkumar, option B).** The Reference says "Display attributes HI, RI, and UL cause a separator line not to
  be displayed", yet its own example specifies `(*DSPATR RI)` over blanks and describes "pink blanks displayed in reverse
  image". The example is followed: every attribute only styles the line, and only `ND` hides it. The same section also says
  "If more than one COLOR keyword is specified", which reads as text copied from `COLOR`.
- Tests: `e3jMenuBarSeparator.test.js`; the two rows in the E3d table are now Reactive and `e3dKeywordReactivity.test.js`
  probes them.

---

## E4

**Message-file integration**

**Goal.** Message IDs resolve to the real message text, so error lines and message lines preview as the user
will see them, and a message picker replaces typing IDs from memory.

**Acceptance for the release.** With a connection, `ERRMSGID` / `MSGID` / `SFLMSGID` / `CHKMSGID` fields show
the message's first-level text in the preview (with `&n` substitutions filled from sample data); a picker lists
messages from the named message file; an ID that does not exist is flagged; without a connection the feature
degrades to today's behaviour with a visible note.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E4a | **Source of message text. Decision first.** Options: SQL (`QSYS2` message-file service, to be **verified to exist on V7R3**), `RTVMSG` per ID, `DSPMSGD` to an outfile. Also decide offline behaviour: none, or an importable cache file. | - | Done (no code change) | — |
| E4b | **Resolver module.** `src/messageFile.js` with a fake-connection test seam (as `jobDateFormat.js` does): `*LIBL` and `lib/name` resolution, per-session cache, never throws. | E4a | Done | v0.15.1 |
| E4c | **Preview.** Show resolved text for the keywords above in the right place on the screen; `&1`-style substitution from E3f values or a placeholder; severity-colour only if the reference says it affects display. | E4b, E3f (soft) | Done | v0.15.2 |
| E4d | **Picker and validation.** Message-ID picker with text in the `ERRMSGID`, `MSGID`, `SFLMSGID`, `CHKMSGID` panels; an "ID not found in `<msgf>`" diagnostic through the E1 hub when available. | E4b | Done | v0.15.3 |
| E4e | **Menu designer.** Compile Menu already creates the `USRnnnn` messages with `ADDMSGD`; show the existing messages for a menu's options and flag drift between the menu text and the message. | E4b | Done | v0.15.4 |
| E4f | **Settings and degradation.** `isda.messageFiles` (default message files to search), a clear "message text unavailable (not connected)" state in the panels. | E4b | Done | v0.15.5 |
| E4g | **Release** (next free minor). Results against the acceptance paragraph: [E4g results](#e4g-results). | E4a - E4f | Done | v0.15.6 |

### E4a results

Decision (Manojkumar, v0.15.0 tree, docs only):

- **Source of text: SQL view first, `RTVMSG` per ID as the fallback.** `QSYS2.MESSAGE_FILE_DATA` (system name `MSGF_DATA`)
  has `MESSAGE_FILE`, `MESSAGE_FILE_LIBRARY`, `MESSAGE_ID`, `MESSAGE_TEXT` (first level), `MESSAGE_SECOND_LEVEL_TEXT`,
  `SEVERITY` and `MESSAGE_DATA`. One query by file and library returns every message, which is what the E4d picker needs.
  **Release floor: IBM i 7.3 TR6** (a 2019 write-up of the view says "only available for 7.3 TR6 and up"; IBM's page does
  not state the level, so E4b must detect absence at run time and not assume it). Below that, E4b falls back to
  `RTVMSG MSGID(...) MSGF(...)` per ID. The fallback gives text for the preview (E4c) but no list, so the picker (E4d)
  shows the "list unavailable on this release" state and still accepts a typed ID.
- **Not chosen:** `DSPMSGD` to an outfile (works everywhere, but writes a temp file into the user's library); SQL only
  (nothing below 7.3 TR6); `RTVMSG` only (no picker list).
- **Offline: per-session cache only.** No importable cache file. With no connection the panels show the existing
  behaviour plus a visible "message text unavailable (not connected)" note (E4f). Nothing is written to disk.
- **Effect on later rows:** E4b exposes `getText(id, msgf)` and `listMessages(msgf)`, and records which path (SQL or
  `RTVMSG`) answered; `listMessages` returns "unsupported" on the fallback path. E4f's cache location setting is dropped
  (memory only); `isda.messageFiles` stays.

### E4b results

`src/messageFile.js` (plain UMD JS, no dependencies beyond `qdbrtvfdParser.js` for EBCDIC decoding), tested by
`src/test/e4bMessageFile.test.js` (83 checks) against a fake connection. Nothing calls it yet: E4c, E4d and E4e do.

- **API.** `createResolver(connection, hooks)` returns `getText(id, msgf)`, `listMessages(msgf)`, `clear(msgf?)` and
  `mode()` (`'unknown'`, `'sql'` or `'api'`). `connection` is Code for i's connection or a function returning the current
  one (a later connect is picked up; cached text still answers after a disconnect). `hooks.ensureLibrary` is the same hook
  `jobDateFormat.js` takes, so `ISDATEMP` is created once for all procedures. Text keeps its `&1` markers; E4c fills them.
- **Never throws.** Every result is `{ ok: true, ... }` or `{ ok: false, code, error }` with code `not-connected`,
  `bad-id`, `bad-msgf`, `not-found`, `unsupported` or `error`. Bad IDs and message-file names are refused before any SQL
  (7-character ID, IBM i object names, `LIB/NAME`, bare name, `*LIBL`, `*CURLIB`).
- **Resolution.** `*LIBL` reads the library list once (`QSYS2.LIBRARY_LIST_INFO`) and asks for every library in one
  statement; the first library in list order that holds the file wins. `*CURLIB` uses the CURRENT entry.
- **Fallback.** Only an error that names `MESSAGE_FILE_DATA` as missing switches to `QMHRTVM` (format `RTVM0100`, through
  an `ISDATEMP` external CL procedure and a dump procedure, as `jobDateFormat.js` does) for the rest of the session. An
  authority or connection error is an error and switches nothing. On that path `listMessages` is `unsupported` and the
  message names 7.3 TR6.
- **Cache.** Per session, in memory. A found message is cached, a not-found answer is not (the message may be added
  later), concurrent asks share one query, `listMessages` primes the text cache, `clear(file)` after `ADDMSGD` /
  `CHGMSGD` drops one file, `clear()` drops everything.
- **Not checked against a real IBM i.** Three assumptions, each in one place: the `QSYS2.LIBRARY_LIST_INFO` column names
  (`SCHEMA_NAME`, `TYPE`, `ORDINAL_POSITION`), the `RTVM0100` offsets (`RTVM0100` constant) and the CPF ids for "file not
  found" (`CPF2407`) and "message not found" (`CPF2410`). A capture from a real system should confirm them before E4g
  releases; if one is wrong, it is a one-line change plus the matching test.

### E4c results

Decisions (Manojkumar): one display message line for all four keywords; `CHKMSGID` not drawn; a `MSGID` field shows its
text in the field; `&n` values from one stored string per field. Engine in `src/dspfEngine.js`, store namespace in
`src/indicatorSim.js`, host in `src/extension.ts`, panel in `src/buildWebviewTemplate.js`; tests in
`src/test/e4cMessagePreview.test.js` (81 checks).

- **Where it is drawn.** `ERRMSG`, `ERRMSGID`, `SFLMSG` and `SFLMSGID` go to the message line: the last display line, or
  `MSGLOC(line)` (never below the last line; 28 on a 24-line display is line 24). A window with its own message line keeps
  it (its last row, its width); a record without `WINDOW`, or a window with `*NOMSGLIN`, uses the display's line. This
  changes `ERRMSG` too: it used to be drawn only inside a window, and two `dspfEngine.test.js` checks that said so were
  rewritten.
- **Which one.** IBM's order, ERRMSG, ERRMSGID, SFLMSG, SFLMSGID; of the same keyword the first one in effect (the record,
  then fields in source order). `SFLMSG` / `SFLMSGID` need `SFLDSP` in effect ("the SFLDSP keyword must be in effect").
  A multi-record view has one display message line: the topmost record's.
- **The text.** From `dspfFile.messageTexts` (the host's answer, never written to the source). With no text the line shows
  `ID FILE - text unavailable (reason)`, dimmer, with the reason also in its title: `not loaded yet`, `not connected`,
  `not found`, `not supported on this release`, `lookup failed`. The `&1`, `&2` markers are filled from the msg-data
  field's stored value, read as values separated by `|` (`C1234|Pune`); an `&n` with no value stays as written.
  **That `|` convention is the preview's own: the real replacement text has no separator** (it is one string cut by the
  message's own field definitions, which the preview does not read), so say so in the panel hint if it confuses.
- **`MSGID` field.** The resolved text replaces the field name in the field, cut or padded to its length; `MSGID(*NONE)`
  is blank. The ID and file may be literals or fields (`USR &ID`, `&LIB/&FILE`); a field with no stored value leaves the
  field as it was. Output-capable named fields outside a subfile only; the first `MSGID` in effect.
- **`CHKMSGID`.** Not drawn and not looked up: it is issued when an input check fails, which the preview cannot know.
  E4d shows its text in the field's panel.
- **Store and panel.** New E3f namespace `messageData` (text, 256 characters, key `RECORD|FIELD`) holds the program fields
  the keywords name: the msg-data field, and a `MSGID`'s ID, library and file fields. The simulator panel's "Message values"
  section edits them for the previewed record. Not written to the DDS source.
- **Host.** The page sends `requestMessageTexts` (each message once; a not-connected answer is asked again when IBM i
  connects) and gets `messageTexts`. One `messageFile.js` resolver per connection. `messageFile.js` is now in the list of
  modules `build:webview-assets` copies to `dist/`; without that the extension would not load it.
- **Not done.** Nothing refreshes a message that changes on the system while the designer is open (a reload does; E4f can
  add a refresh). Message severity does not colour the line (the reference gives it no display effect). The menu designer
  has no message keywords.

---

### E4d results

Decisions (Manojkumar): a Browse... button opens a list; the text and the "not found" warning sit inline in each panel
(the E1 hub does not exist yet); only the four panels listed. Host in `src/extension.ts` (`listMessageFile` ->
`messageFileList`, at most 3000 messages, `truncated` and `total` reported), panels in `src/webviewClientHelpers.js`
(shared `messageTextLineHtml`, Browse button, hooks installed by the template), picker modal `showMessagePicker` in
`src/buildWebviewTemplate.js`; tests in `src/test/e4dMessagePicker.test.js`.

- **Text line.** Under the `ERRMSGID`, `SFLMSGID` and `CHKMSGID` references the message text; an ID the host says is not in
  the file shows "`ID` not found in `LIB/FILE`" as a warning; any other reason (not connected, not loaded, unsupported)
  is a dimmer "text unavailable (reason)". `CHKMSGID` is now looked up (still not drawn on the display).
- **Browse....** Opens a dialog with the library and file from the panel, lists the file at once, filters by ID or text,
  shows ID, severity and first-level text. Picking an `ERRMSGID` / `SFLMSGID` row writes ID, file and library; `CHKMSGID`
  only fills its boxes (nothing is written until Apply CHKMSGID). On a release without the view the list says it is not
  supported and the ID can still be typed.
- **`MSGID`.** Its ID is a prefix plus a field, so Browse sets that field's preview value (E3f `messageData`, prefix
  removed) and the line shows the text of prefix + value; the DDS source is never changed. A `MSGID` in the raw-text
  form has no picker. The inline-warning rule applies to literal IDs only.
- **For E1b.** Add "message ID not found in file" to the Problems panel from the same `messageTexts` answers, so it does not
  depend on the panel being open.

### E4e results

No decision was needed: the existing Compile Menu fixes what the message holds. Host in `src/extension.ts`
(`requestMenuMessages` -> `menuMessages`), state logic in `src/mnuCmdEngine.js`, panel in
`src/buildMenuWebviewTemplate.js`; tests in `src/test/e4eMenuMessages.test.js`.

- **What drifts.** Compile Menu writes one message per option, `USRnnnn` in a message file named like the menu member
  (same library), and its text is the option's mapped **command** (the `MNUCMD` line), not the label on the screen. So
  drift is a message that no longer says what the command says, because the command or the message was changed since the
  last compile. The roadmap row's "menu text" means this command.
- **Per option.** Under the `CMD>` box one line: matches; differs (shows the message text, with a "Use message text"
  button that writes it into the `MNUCMD` command - the screen source is untouched); not created yet (a command and no
  message; Compile Menu creates it); a message but no command mapped (flagged, button offered); text unavailable
  (reason). An option with neither a command nor a message shows nothing. The comparison is exact (ends trimmed): a command
  keeps its case.
- **Summary.** A line above the list: "Messages in LIB/MENU: 2 match, 1 differ, ...".
- **When it is read.** Once per option ID when the options are first shown; again after Compile Menu (the host clears
  that message file's cached text and the page asks again) and when IBM i connects (for messages that could not be
  read). A document that is not an IBM i member has no message file, so nothing is shown.
- **Not done.** Messages in the file that belong to no option (a `USRnnnn` with no matching option) are not listed; the
  lookup is per option ID, so it also works on a release without `QSYS2.MESSAGE_FILE_DATA`.

### E4f results

Decision taken (proposed before building, accepted by Manojkumar): `isda.messageFiles` feeds the message-ID picker and
nothing else; it is **not** a search path for IDs. `ERRMSGID`, `SFLMSGID` and `CHKMSGID` require a message file in the
DDS, and `MSGID` names it too, so there is never an ID with no file to look up. Setting parser in `src/messageFile.js`
(`parseMessageFilesSetting`), host in `src/extension.ts` (`sendMessageFiles`), picker in
`src/buildWebviewTemplate.js` (`showMessagePicker`); tests in `src/test/e4fMessageFiles.test.js`.

- **The setting.** An array of `LIB/MSGF` or `MSGF` (the library list is searched for the latter), default empty. The
  names are checked with the resolver's own rules (upper-cased, 10 characters, `*LIBL` / `*CURLIB` allowed as a
  library); duplicates are dropped; invalid entries are ignored and named in the picker ("Ignored in isda.messageFiles").
  Never written to the DDS. Changes reach open designers at once and are used the next time the picker opens.
- **In the picker.** A "Default message files..." list (choosing one fills the library and file and lists it). A panel
  that names no message file (a new CHKMSGID, say) opens the first default; a panel that names one keeps its own.
- **Not connected.** One note everywhere: "Message text unavailable (not connected) - connect to IBM i to see it."
  It replaces the per-panel "text unavailable (not connected)" in the ERRMSGID / SFLMSGID / MSGID / CHKMSGID panels, is the
  preview line's tooltip, is the picker's error (with "You can still type the message ID."), and is the menu designer's
  option line; the menu summary adds "text unavailable (not connected)". Other failures (not found, not supported, bad
  name) keep their own wording.
- **On connecting.** Panels and the menu designer already asked again (E4c / E4e); an open picker that could not list
  because IBM i was not connected now lists again. A picker that listed fine is left alone.
- **Not done.** Nothing refreshes a message that changes on the system while the designer is open (a reload does) -
  dropped from E4f: with the resolver's per-session cache that needs a visible refresh control, which the roadmap does
  not ask for. The setting is not read by the menu designer (its message file is fixed by Compile Menu).

### E4g results

**Released as v0.15.6.** E4 shipped as v0.15.1 (E4b) - v0.15.5 (E4f); this entry rolls it up. Every sub-task E4a - E4f is Done.
The acceptance paragraph, one criterion at a time:

| Acceptance criterion | Met by | Evidence |
|----------------------|--------|----------|
| With a connection, `ERRMSGID` / `MSGID` / `SFLMSGID` / `CHKMSGID` show the message's first-level text in the preview, `&n` filled from sample data | E4b resolver (v0.15.1), E4c preview (v0.15.2); the menu designer shows the `USRnnnn` text too (E4e, v0.15.4) | `e4bMessageFile.test.js`, `e4cMessagePreview.test.js`, `e4eMenuMessages.test.js` (the resolver against a fake connection; the real webview showing the text and the filled `&n` markers) |
| A picker lists messages from the named message file | E4d (v0.15.3); the files you use most are offered by `isda.messageFiles` (E4f, v0.15.5) | `e4dMessagePicker.test.js`, `e4fMessageFiles.test.js` |
| An ID that does not exist is flagged | E4d: "`ID` not found in `LIB/FILE`" as a warning inline in each of the four panels | `e4dMessagePicker.test.js` |
| Without a connection the feature degrades to today's behaviour with a visible note | E4c (the line shows the ID and why), E4f (one shared note in the panels, the picker and the menu designer; the picker lists again on connecting) | `e4cMessagePreview.test.js`, `e4fMessageFiles.test.js` |

The E3d reactivity table has no `Gap` row left: `ERRMSGID` has been Reactive since E4c, so the acceptance paragraph of E3
is met in full.

**What E4 leaves open, by decision.**
- **Not checked against a real IBM i** (see E4b results and E4c results). Three assumptions, each in one place: the
  `QSYS2.LIBRARY_LIST_INFO` column names (`SCHEMA_NAME`, `TYPE`, `ORDINAL_POSITION`), the `RTVM0100` offsets (`RTVM0100`
  constant) and the CPF ids for "file not found" (`CPF2407`) and "message not found" (`CPF2410`). The E4b results asked for a
  capture from a real system before this release; none was available, so the release goes out with them unverified. The
  resolver never throws, so a wrong one shows as "lookup failed" or "not found" in the panel, not as a crash; a fix is one
  line plus the matching test.
- **Problems panel.** "Message ID not found in file" is shown inline in the four panels only (the E1 hub does not exist yet);
  E1b can add it from the same `messageTexts` answers.
- **No refresh while a designer is open.** A message that changes on the system shows after a reload (the resolver caches a
  found message for the session; a not-found answer is not cached).
- **Menu designer.** Messages in the file that belong to no option are not listed; `isda.messageFiles` is not read there
  (its message file is fixed by Compile Menu).
- **The setting is a picker aid, not a search path** (E4f decision): the four keywords name the message file in the DDS.

## E5

**Preview export**

**Goal.** Get a screen out of the designer as an artefact for documentation, reviews and tickets.

**Acceptance for the release.** Command and toolbar button export the current record in the current indicator
state as PNG, SVG, self-contained HTML or plain text; a batch export writes every record (and every `DSPSIZ`)
to a folder with an index page; works from both designers and both UI styles.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E5a | **Scope and formats. Decision first.** Which formats ship, whether compare mode and the ruler/crosshair are included, background/theme (classic green-on-black vs the accent colours), font fallback stack, scale factors for PNG. | - | Done (no code change) | — |
| E5b | **Serialiser.** Pure function: the engine's resolved grid to standalone SVG and HTML (inline CSS, no remote assets, font fallback stack); snapshot tests. | E5a | Done | v0.17.1 |
| E5c | **PNG.** Rasterise the SVG in the webview via canvas, with a scale option; save from the extension host. | E5b | Done | v0.17.2 |
| E5d | **Plain-text dump.** The grid as an 80x24 / 132x27 text block, with an optional attribute legend (underline, reverse image, colours as letters). | E5a | Done | v0.17.3 |
| E5e | **UI and command.** `iSDA: Export Screen Preview`, toolbar button, save dialog, copy to clipboard, default format setting; menu designer included. | E5b | Done | v0.17.4 |
| E5f | **Batch export.** Every record and every `DSPSIZ` into a folder plus an `index.html`; progress notification; cancellable. | E5b, E5e | Done | v0.17.5 |
| E5g | **Release** (next free minor). | E5a - E5f | Done | v0.18.0 |

### E5a results

**E5a (scope and formats), decided.** No code changed. Three decisions were put to Manojkumar and answered; the rest are defaults proposed in the same message and not objected to (marked below), open to change in the sub-task that builds them.

**What exists today (audit).** There is no export feature of any kind. The preview is a DOM grid built in the webview: `render()` takes `DspfEngine.resolveScreen(...)`, an object `{ lines, columns, recordName, fields, availableSizes, ... }`, and `renderFieldDiv` turns each field (`line`, `column`, `length`, `height`, `text`, `style { color, hi, reverse, underline, blink, hidden, protect }`, `widget`, `cntfld`, `rowState`, `stackLayer`, `inWindow`) into a grid-positioned `div` with classes. Colours come from `COLOR_HEX` in `src/dspfEngine.js`; the default screen colour is the UI theme's accent (`body[data-ui-theme]`: green by default, amber, cyan, violet, white); the font is the `--mono` stack. The ruler, the crosshair and compare mode ("Show other record(s) dimmed behind") are webview chrome around that grid, not part of the engine's answer.

**Decisions (asked).**
- **Formats: all four ship.** SVG, self-contained HTML, PNG and plain text, as the acceptance paragraph says.
- **Content: the screen only, the ruler as an option.** An export holds what the engine resolved for the current record in the current indicator state (fields, constants, windows, pull-downs, stacked records exactly as the preview shows them). The ruler (row and column numbers, the same numbering as the designer's) is a toggle, off by default. Never exported: the crosshair, compare-mode dimmed records, the selection outline, compile badges and outlines (E2e), hover titles.
- **Colours: follow the designer's current accent theme.** The default field colour is the theme's accent at the moment of export; an explicit `COLOR` keyword keeps its `COLOR_HEX` value; the background is the preview's own (screen `#050705`, window `#0a0f0c`). The theme is an input of the serialiser, read from the webview's computed variables at export time, so the serialiser itself stays pure.

**Defaults (proposed, not asked).**
- **Font:** the `--mono` stack unchanged (`'IBM Plex Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`); no remote font, no embedded font file. Every export draws on a fixed character cell, so a fallback font changes the look but not the layout.
- **PNG scale:** 1x, 2x, 3x, default 2x (E5c).
- **Text dump:** `lines` x `columns` of the screen size (80x24, 132x27, ...), with an optional attribute legend (E5d).
- **Attributes in a still image:** `hi`, `reverse` and `underline` are drawn as in the preview; `blink` is static (the legend and the text dump mark it); `hidden` fields are left out.

**What this means for E5b - E5g.**
- **E5b** is a pure UMD module (proposed name `src/screenExport.js`, no `vscode` import, copied to `dist/` by `build:webview-assets`, like the E2 modules). Input: the `resolveScreen` result plus `{ theme, ruler }`; output: the SVG string and the HTML string. It follows `renderFieldDiv`'s rules for classes and attributes, so the two cannot drift: its test should compare the serialiser's attribute decisions with the engine's on the same screens.
- **E5c** rasterises the E5b SVG in the webview (canvas), so PNG needs the webview; the host only saves the bytes.
- **E5d** is pure and host-testable like E5b.
- **E5e** is the command, toolbar button, save dialog, clipboard and default-format setting, in both designers and both UI styles.
- **E5f** (batch) can write SVG, HTML and text from the host without a webview. Whether it also writes PNG (a webview round-trip per record and size) is E5f's decision; the default is that it does not.

**Not decided here:** the setting names and the command's exact title (E5e); the clipboard format per type (E5e); the menu designer's screen (E5e, the same serialiser on the menu's resolved screen).

### E5b results

**E5b (serialiser).** New `src/screenExport.js` (UMD, no `vscode`, no DOM, no engine import; copied to `dist/` by `build:webview-assets`), tested by `src/test/e5bScreenExport.test.js` (67 checks). Nothing calls it yet: E5c (PNG), E5d (text), E5e (command and toolbar) and E5f (batch) build on it.

**API.**
- `ScreenExport.buildSvg(screen, { theme?, ruler?, title?, idPrefix? })` -> the SVG document as a string. `screen` is what `DspfEngine.resolveScreen` / `resolveMultiScreen` returns. A `screen` that is not an object is a `TypeError`; a screen with no fields (record not found) is an empty screen.
- `ScreenExport.buildHtml(screen, opts)` -> the same drawing inside a standalone page (doctype, utf-8, title, the theme's background, no script, no link, no remote asset).
- Also exported: `METRICS`, `FONT_STACK`, `DEFAULT_THEME`, `brighten`, `parseColor`, `fieldClasses`.
- `theme`: `accent` (default colour of a field with no COLOR), `background`, `windowBackground`, `windowBorder`, `inkDim`, `warn`; each accepts `#rgb`, `#rrggbb` or the `rgb(r, g, b)` a webview reports, anything else falls back to the classic value (so a theme read from computed styles can never put markup into the file).

**What is drawn.** Fields and constants with HI (the preview's `brightness(1.6)` and a heavier weight), RI (field colour as background, screen colour on the text), UL, PR (0.65 opacity), the 5250 input underline for `I` / `B` fields, the DSPATR(PC) cursor block and the CSRLOC cursor; windows (the box with its offset shadow, dashed warning border when the position is set at runtime, WDWBORDER colour and HI, or the eight `*CHAR` border characters, and the title chip); stacked records (painted by layer, each field first paints the screen colour, P14); pull-down boxes and their fields; menu-bar separators; ERRMSG lines; the subfile preview with its "More..." line, `+` mark and scroll bar; the optional ruler (the designer's own numbering: a tens row, a ones row, two-digit line numbers).

**Decisions.**
- **HTML is the SVG in a page.** One drawing and two wrappers, so the formats cannot disagree, and the text stays selectable. The DOM preview (`renderScreenHtml`) stays the reference and is not reused: it carries hover titles, drag handles and `data-*` hooks that E5a excluded.
- **A fixed character cell: 9 x 20 px, 15 px font** (the preview uses 14 px and 1.4em, which are not whole pixels). Presentation only, so a PNG at 1x / 2x / 3x stays on the pixel grid.
- **Layout does not depend on the font.** Every text run carries `textLength` (characters x 9 px, `lengthAdjust="spacing"`), leading blanks become position, trailing blanks nothing, inner blanks are non-breaking so no renderer collapses them. A fallback font changes the look, never the layout.
- **Underlines are lines**, not `text-decoration`, which renderers draw differently.
- **Clipped to the `DSPSIZ` grid.** A field that runs past column 80 is cut there, as it would be on the terminal (in the recorded `HDRREC`, the `TIME` field at column 77 shows 4 of its characters). The designer lets such a field overflow; the picture does not.
- **A still image:** BL is not animated (the class says it was there), ND fields are left out (the engine already drops them).
- **Classes mirror the engine's** (`dspf-field dspf-hi dspf-usage-b ...`) on each field's `<g>`. They are not needed to draw it (every attribute is also written out); they exist so the drift guard can compare the serialiser with the engine, field by field.

**Tests.**
- **A - document:** well-formed XML, size from `lines` x `columns` (80x24 and 132x27), no remote font / image / script, clip, title and label, the ruler's gutter and its text equal to the engine's, the HTML wrapper, id prefix, input checks.
- **B - fields:** the cell grid, blanks, clipping, escaping, XML-illegal control characters, multi-line fields, colour and theme (including a hostile theme value), HI / RI / UL / PR / BL / ND / PC, input underline.
- **C - the rest:** stacking order and backing, windows (box, dashed, WDWBORDER colour, HI, `*CHAR`, a window list), pull-down, separator, ERRMSG, CSRLOC, subfile preview.
- **D - drift guard:** the engine's own `renderScreenHtml` and the serialiser on real parsed DDS (an inline corpus with every attribute and two indicator-conditioned keywords, `testdsp.dds`, `sample.dspf`), every record under five indicator sets: 30 screens, 226 fields, same fields in the same order with the same classes, on the same cells, in the same colours. Fields with nothing to paint have an element in the engine's HTML and none here; the guard accounts for that.
- Checked by breaking the serialiser three ways on a scratch copy (the input underline, hidden fields, the grid pinning): each fails the test.

**Not yet checked.** The images were seen only through a rasteriser that ignores `textLength` (cairosvg), so how browsers lay out the pinned text, and how the picture looks in the `classic` and `modern` themes, is E5c's first look (it rasterises in the webview). Choice-state colours (E10c), the inside of radio buttons, check boxes, push buttons and CNTFLD (drawn as their text), and the menu designer's screen (E5e wires it) are not drawn or not tried yet. No setting and no command exists yet.

### E5c results

**E5c (PNG).** New `src/screenPng.js` (UMD, no `vscode`; copied to `dist/` by `build:webview-assets`), tested by `src/test/e5cScreenPng.test.js` (97 checks). Nothing calls it yet: the command, toolbar button, save-dialog wiring and clipboard are E5e (decision: building blocks only).

**Webview half.** `ScreenPng.rasterise(svg, { scale })` draws the E5b SVG to a canvas at its final size (scale x the SVG's own width and height, so the browser rasterises the vector rather than stretching a small bitmap) and resolves `{ base64, width, height, scale }`. Scale is 1, 2 or 3 (also `'2x'`), default 2; anything else is a `RangeError`, so a setting can never pick a size silently. It refuses a picture past 16384 px on a side or 64 M pixels before touching a canvas, and rejects on an image load error, no 2D context, a canvas that cannot encode PNG, or a 15 s timeout. `toMessage(result, { name })` builds the `exportPng` message.

**Host half.** `parseMessage(msg)` checks the message (type, base64 shape, 32 MB cap, PNG signature and IHDR, width and height agree with the picture) and gives a safe file name (`NAME.png`, `NAME@2x.png`, `NAME@3x.png`; path characters replaced, Windows device names suffixed). `savePng({ showSaveDialog, writeFile }, msg, { defaultFolder })` asks where to save and writes the bytes; the two vscode calls are handed in by E5e, so it is tested without vscode. A cancelled dialog saves nothing.

**Real-browser check (the E5b "not yet checked" item).** The module was loaded into headless Chromium and run on 20 real screens (`sample.dspf`, `testdsp.dds`, a 132 x 27 screen, five accent themes, with and without the ruler, 1x / 2x / 3x): every PNG has exactly SVG size x scale, a malformed SVG is rejected with a clear message, and the pictures were looked at. Findings: the pinned text (`textLength`) holds the grid in a real browser (30 `W` and 30 `i` both fill 30 cells; the last column of a 132-wide screen lands where it should); the accent follows the theme (green, amber) while an explicit COLOR keeps its own; HI is bold, RI is a filled block, UL and the input underline are lines; the ruler lines up with the cells. No serialiser change was needed. Not tried: the `classic` / `modern` UI styles (the serialiser takes the theme as an input and does not read the page), and PNG from inside a real VS Code webview (E5e).

### E5d results

**E5d (plain-text dump).** New `src/screenText.js` (UMD, no `vscode`, no DOM, no engine import; copied to `dist/` by `build:webview-assets`), tested by `src/test/e5dScreenText.test.js` (70 checks). Nothing calls it yet: E5e (command, toolbar, clipboard) and E5f (batch, which can write text from the host without a webview) do.

**API.** `ScreenText.buildText(screen, { ruler?, legend?, pad?, ascii?, header?, title? })` returns the text (a string ending in a newline). `screen` is what `DspfEngine.resolveScreen` / `resolveMultiScreen` returns, the same object `ScreenExport.buildSvg` draws. A `screen` that is not an object is a `TypeError`; a size that is not a display size (over 512 columns or 256 lines) is a `RangeError`. Also exported: `colorLetter`, `ATTRIBUTE_BITS`, `COLOR_LETTERS`.

**The block.** `lines` rows of `columns` cells (80 x 24, 132 x 27, ...), one character per cell. Every row is written, so the block is always `lines` tall; trailing blanks are cut unless `pad` is set. The ruler (`ruler`) is the designer's own numbering, as in the picture: a tens row, a ones row and a two-digit line number before every row.

**It follows the picture.** Same paint order (a stack layer, else the default of the kind, then the order added), same clipping to the `DSPSIZ` grid, hidden fields left out, and blanks inside a field do not erase what is under them: only a stacked record's field (P14), a window and a pull-down clear their cells. Control characters in a field's text become blanks, so a dump can be pasted into a terminal; a character outside the BMP takes one cell.

**Drawn.** Fields and constants, multi-line fields, windows (a box with the record name and title in the top edge, a dashed border while the position is set at runtime, or the eight `WDWBORDER *CHAR` characters), pull-down boxes and their fields, menu-bar separators, ERRMSG lines, the subfile preview (its fields, the More... line right-aligned in its span, the `+` mark, the scroll bar with its thumb).

**Decisions.**
- **Legend, off by default (`legend`).** What a character grid cannot show goes in two planes of the same size, below the block: the *display attributes* as one hex digit per cell (the sum of 1 = HI, 2 = RI, 4 = UL, 8 = BL; `.` is plain text, a blank is nothing) and the *colours* as one letter per cell (B, R, G, T, Y, P, W for BLU, RED, GRN, TRQ, YLW, PNK, WHT; `.` is the screen colour, `*` a colour that is not a DDS one). The input underline of an `I` / `B` field counts as UL, as it does in the picture. A plane with nothing in it is replaced by one line saying so. Under the planes: the cursor (a `DSPATR(PC)` field, a `CSRLOC` position) and each window with its place, size, title and flags.
- **Blink is marked, not animated.** BL is digit 8 in the attribute plane (E5a: "the legend and the text dump mark it").
- **Window flags are in the legend, not the title.** The picture's title chip also carries "position set at runtime" and "window shared with"; cut to a window's width they read badly, so the chip here is the record name and the title only and the legend names the rest. A window with `*CHAR` border characters has no room for a title chip; the legend names it.
- **Borders are box-drawing characters; `ascii` gives `+ - |`** (and `^ v # :` for the scroll bar). Default is Unicode because the dump is saved as UTF-8 text; the setting for the default is E5e's.
- **No cursor mark in the grid.** The block shows characters only; the cursor is in the legend.

**Tests.** A the block (sizes, trim and pad, header, ruler, input checks); B fields (cell, clip, blanks, multi-line, hidden, control characters, stacking); C windows, pull-down, separator, ERRMSG, subfile; D the legend; E drift guard against the engine and E5b's picture, record by record under five indicator sets (30 screens, 2,722 cells): every character of the dump is where the picture has it, and on screens with no window, stacking or pull-down every character of the picture is in the dump; the ruler is the picture's ruler; the seven colour letters are the engine's `COLOR_HEX`. Checked by breaking the module four ways on a scratch copy (blanks erasing, hidden fields drawn, no input underline, a box that does not clear): each fails the test.

**Not decided here:** the clipboard format and the default format setting (E5e); whether batch export writes the legend (E5f).

### E5e results

**E5e (UI and command).** New `src/screenExportUi.js` (UMD, no `vscode`, no DOM of its own; copied to `dist/` by `build:webview-assets` after the three modules it needs and loaded into both designer pages after them), tested by `src/test/e5eExportUi.test.js` (108 checks). Four decisions were put to Manojkumar and answered (the first three are the "not decided here" items of E5a and E5d).

**Decisions.**
- **The button saves in the default format; a list beside it picks another.** One click on **Export screen** saves in `isda.export.defaultFormat`; the list offers *Save as* PNG, SVG, HTML and plain text, and *Copy* as image (PNG), SVG, HTML and text.
- **Copy: PNG as an image, the rest as text.** The image copy is the page's own (`navigator.clipboard.write` with a `ClipboardItem`; the host has no image clipboard). A page that refuses it, or has no clipboard, falls back to a save and the host says so. SVG, HTML and text are copied by the host as text.
- **Four settings:** `isda.export.defaultFormat` (`png` | `svg` | `html` | `text`, default `png`), `isda.export.pngScale` (1 | 2 | 3, default 2), `isda.export.ruler` (default off), `isda.export.textStyle` (`unicode` | `ascii`, default `unicode`). Each is checked on both ends; a value that is not one of the choices falls back to its default. The legend of the text dump has no setting (off).
- **The command exports the active designer's current record, in the default format.** Command title **iSDA: Export Screen Preview** (`dspfDesigner.exportScreenPreview`). The designer in front is the one asked; with none active, a single visible designer is used; with none open (or two visible and none active) a warning says to open a display file or a menu in the designer first. No quick pick of formats: the list beside the button does that.

**How it works.**
- **The page builds the file, the host saves it.** Each designer keeps the screen it last drew (the DSPF designer's `lastScreen`; the menu designer's now too) and `createController` builds SVG, HTML or text from it, or PNG through E5c's canvas. The theme colours (accent, dim ink, warning) come from the page's computed style at export time; a value that is not a colour is dropped by the serialiser. A screen with an error, or none, is an error message and not an export. A second click while a PNG is being drawn is ignored.
- **The export is what the preview shows now:** the record selected, under the indicators switched on in the simulator panel and the stored values (E3), with the ruler only when the setting says so. Compare-mode backdrops and overlays follow the preview (a full overlay exports the overlay); the crosshair, selection and badges are never part of it (E5a).
- **Both UI styles, both designers.** The screen designer has two genuine copies of the controls (the side panel for the classic UI, the pinned toolbar for the modern one, which the classic UI never shows); the menu designer has one (it has no separate toolbar).
- **Where it is saved.** The dialog opens in the member's own folder for a local file and in the first workspace folder for an IBM i member, with the name `MEMBER-RECORD` plus the format's extension (`CUSTMNT-HDRREC.svg`, `CUSTMNT-HDRREC@2x.png`, `.html`, `.txt`), made safe for Windows, macOS and Linux. A cancelled dialog writes nothing; a failed write is an error message. A save or copy ends with an information message.
- **The settings reach the page** on `ready` and again when `isda.export.*` changes, in both designers; a closed designer is forgotten (no stale command target, no listener left).

**Tests.** A settings and file names; B building every format from real screens (indicator state, ruler, text style, theme, a hostile theme value, PNG through a fake canvas, errors); C the controller (default save, the list, PNG copy and its fallbacks, the busy guard, the host's request); D the host half (message checks, text and PNG saves, copy, cancel, failed write); E the screen designer page in jsdom (both control copies, indicators, record switch, page theme); F the menu designer page; G the extension host on the vscode mock (settings, save, copy, cancel, the command with one, two and no designer, dispose); H `package.json` against the module. Checked by breaking the module three ways (theme not read, a cancelled dialog still writing, the member name not added): each fails the test.

**Not yet checked.** Nothing was tried in a real VS Code window: the save dialog, the clipboard image copy from inside a real webview (whose permission rules differ from a browser's, so the fallback to a save may be what users see), and how the two control copies look in the `classic` and `modern` styles. jsdom has no canvas, so a PNG is tested through a fake one; E5c's headless-Chromium check covers the real rasterising. Batch export (E5f) and the release (E5g) are open.

### E5f results

**E5f (batch export).** New `src/screenBatch.js` (UMD, no `vscode`, no DOM; copied to `dist/` by `build:webview-assets`), the command **iSDA: Export All Screen Previews** (`dspfDesigner.exportAllScreenPreviews`) and `src/test/e5fBatchExport.test.js` (80 checks). Four decisions were put to Manojkumar and answered; the first is the E5a open question and the last is E5d's.

**Decisions.**
- **Formats: SVG, HTML and plain text.** All three are built on the extension host with no webview. PNG is left out (it needs a canvas, so it would need an open designer for every screen).
- **Indicators: all off.** Deterministic and independent of the designer. A record whose own record-level condition needs an indicator (`A  10  R REC`) is drawn with that indicator on, and the index says "Drawn with indicator 10 on"; a record that is not shown at a size (a `*DS3` / `*DS4` condition) is listed as skipped for that size with its reason and gets no files. Saved scenarios (E3c) are not exported.
- **Entry point: the command only.** It acts on the designer in front (the same rule as Export Screen Preview) and uses that designer's current text, saved or not. No button was added.
- **Layout: one file per format, grouped by record.** `RECORD-LINESxCOLUMNS.svg` / `.html` / `.txt` for every record and every size, in a folder `MEMBER-screens`, plus `index.html`. The text dump has no legend (E5d's default, no setting).

**How it works.**
- **Plan, then write.** `prepare(model, { engine, memberName, themeName, ruler, textStyle })` resolves every record at every size and returns the entries without building any file; `run(plan, { createDirectory, writeFile }, { isCancelled, onProgress })` renders and writes one screen at a time (three files), then the index. Names are made safe for Windows, macOS and Linux and never collide, compared without case (`abc` and `ABC`; a record called `index` cannot replace `index.html`). More than 5,000 screens is refused before anything is built.
- **The files are the serialisers' own output** (E5b picture and page, E5d dump with its header), with the UI theme's accent (green, amber, cyan, violet or white, read from the stored UI theme) and the `isda.export.ruler` and `isda.export.textStyle` settings. A test compares each file with a direct call of the serialiser on the same screen.
- **The index** shows every record with its kind (record, window, pull-down, subfile, subfile control, user-defined), a picture per size linked to its HTML page, links to the three files, the indicators a record was drawn with, a note for a record with no fields, and the skipped screens with their reason. It carries no script and no remote file, and a name is escaped wherever it appears. A file that was not written is not linked.
- **The command.** A folder picker (opening in the member's folder, or the workspace folder for an IBM i member) chooses where `MEMBER-screens` goes; an existing folder asks first, modally, and only files with the same names are replaced. A progress notification shows the file being written and can be cancelled: the batch stops between screens, makes no index and says how many files were written. A file that cannot be written is recorded and the rest go on; the end message names the first failure. A successful run says how many screens were exported and how many were not shown at their size, with a Reveal folder button.

**Tests.** A planning (sizes, names, collisions, the folder name, input checks, the cap, themes); B records (indicator fallback, size conditions, empty, kinds); C the files against the serialisers; D the index (links, skipped screens, escaping, partial writes); E running (order, progress, cancel, failed write, failed render, sync and async file calls); F the command on the vscode mock (no designer, cancelled picker, a full run, theme and ruler, an existing folder, the editor's own text, cancel, a failed write, an IBM i member); G `package.json` and the module. Checked by breaking the module three ways (no indicator fallback, cancel never checked, names allowed to collide): each fails the test.

**Not yet checked.** Nothing was tried in a real VS Code window (the folder picker, the cancellable notification, Reveal folder), and the index was not opened in a browser. The designer's own state is not available to the host, so stored run-time values, message texts (E4c) and resolved `REFFLD` fields are drawn as the designer draws them before they are known. A pull-down record is exported as its own screen (its choices), not on top of its menu bar. The release is E5g.

### E5g results

**Released as v0.18.0.** E5 shipped as v0.17.1 (E5b) - v0.17.5 (E5f); this entry rolls it up. Every sub-task E5a - E5f is Done. The acceptance paragraph, one criterion at a time:

| Acceptance criterion | Met by | Evidence |
|----------------------|--------|----------|
| The command and the toolbar button export the current record in the current indicator state | E5e (v0.17.4): **iSDA: Export Screen Preview** and the Export screen button; the page builds the file from the screen it last drew | `e5eExportUi.test.js`; `e5gRelease.test.js` A and B (indicator 10 switched on in the page, the click and the command both give a file that says it is on) |
| As PNG, SVG, self-contained HTML or plain text | E5b (SVG, HTML), E5c (PNG), E5d (text) | `e5bScreenExport.test.js`, `e5cScreenPng.test.js`, `e5dScreenText.test.js`; `e5gRelease.test.js` A (all four formats through the real page and host handler, file names and bytes; the PNG is a real PNG at 2x the drawing; no script or remote file in SVG or HTML) |
| A batch export writes every record and every `DSPSIZ` to a folder with an index page | E5f (v0.17.5): **iSDA: Export All Screen Previews** | `e5fBatchExport.test.js`; `e5gRelease.test.js` C (16 files for the sample display file, every index link resolves, the screen not shown at 24x80 is listed as skipped) |
| Works from both designers and both UI styles | E5e wires the screen designer (side panel in classic, pinned toolbar in modern) and the menu designer | `e5gRelease.test.js` A, B and C run the screen designer in both UI styles and the menu designer |

**Not yet checked.** Nothing was tried in a real VS Code window (save and folder dialogs, the cancellable notification, the clipboard image copy, whose permission rules differ in a webview so a save may be what users see). jsdom has no canvas, so the release test fakes one; E5c's headless-Chromium check covers the real rasterising. A pull-down record is exported as its own screen, and the batch cannot see `REFFLD` fields, message texts or stored values (it draws them as the designer does before they are known).

---

## E6

**Menu designer: command keys and `TYPE(*UIM)`**

**Goal.** Re-examine the two accepted menu-designer limitations: no command-key (`CAxx`/`CFxx`) assignment, and
no support for `TYPE(*UIM)` menus. Each starts with research, because the current limitation text rests on
"CRTMNU menus do not use them in practice", which needs verifying before it is either lifted or reaffirmed.

**Acceptance for the release.** Command keys: either a working panel in the menu designer, or the accepted
limitation re-confirmed with a cited reason. UIM: at minimum open, outline, preview and edit options of a UIM
menu panel group with byte-faithful write-back, and compile through `CRTPNLGRP` + `CRTMNU TYPE(*UIM)`.
**If E6c decides the UIM designer is too large for one release, E6c records the split and the UIM work moves to
a new epic with its own release; E6 then releases with command keys and the UIM groundwork only.**

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E6a | **Command keys: research. Decision first.** Does menu DDS allow `CAxx`/`CFxx` and does real SDA's menu design offer them? Verify against the DDS Reference, real SDA screens in `docs/sda-reference/screens`, and the `CRTMNU` documentation. Outcome: build it, or reaffirm the limitation with citations. | - | Open | - |
| E6b | **Command-key panel.** Reuse the DSPF designer's command-key panel and the I-169 same-key guard in the menu designer; only if E6a says build. | E6a | Open | - |
| E6c | **UIM: research and scoping. Decision first.** Catalogue the UIM tags a menu panel group uses, from IBM's UIM reference (to be fetched; the site is bot-blocked, so **Manojkumar to provide the reference text** as was done for the DDS Reference). Decide: viewer only, structured editor, or full designer; and whether it stays in E6. | - | Open | - |
| E6d | **UIM engine.** `src/uimEngine.js`: tolerant parser and writer for the agreed tag subset; untouched lines come back verbatim (the I-206 rule); model for options, text, actions. | E6c | Open | - |
| E6e | **UIM preview.** Render a UIM menu panel in the menu designer's preview using the same grid code. | E6d | Open | - |
| E6f | **UIM editing and compile.** Edit options, text and commands; compile through `CRTPNLGRP` then `CRTMNU TYPE(*UIM)`; errors through E2 when available. | E6d, E6e | Open | - |
| E6g | **New-menu wizard.** "Create New Menu" asks for `*DSPF` or `*UIM`; starter members for each; README and limitation text updated. | E6d | Open | - |
| E6h | **Release** (next free minor). | E6a - E6g (or the split recorded in E6c) | Open | - |

---

## E7

**Faster test suite**

**Goal.** Cut the wall time of `npm test` (320 files, each in its own Node process, run one after another,
about 12 minutes) so every task's verify step is cheap, without losing a single check or the failure reporting.

**Acceptance for the release.** Full suite wall time at or below a target set in E7a from the measured baseline
(proposal: 4 minutes or less on 4 cores); `--jobs 1` reproduces today's behaviour exactly; check counts before
and after are identical; a quick tier exists for the edit loop; a CI workflow runs the full suite.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E7a | **Baseline.** Run `node src/test/run.js --slow 400` on a quiet machine; record per-file time, total, core count and the top 20 in the section; classify the cost (jsdom setup, compile or template build per file, the generated keyword matrix, repeated parsing of large fixtures). Set the numeric target. Results: [E7a baseline](#e7a-baseline-results). | - | Done (no code change) | - |
| E7b | **Parallel runner.** Worker pool in `src/test/run.js`: `--jobs N` (default cores minus one, `--jobs 1` = today). Each file still gets its own process and its own log file; output stays grouped per file and grep-friendly; the summary, the `FAIL  -` detection and the exit code are unchanged. Guard against tests that share a temp path or fixture. Result and scope: [E7b results](#e7b-results). | E7a | Done | v0.11.6 |
| E7c | **Cut shared setup cost.** From E7a's classification: share one webview template build instead of per-file rebuilds, lazy-load jsdom, memoise big parses in a helper. Each change must keep that file's check count identical. Outcome: [E7c findings](#e7c-findings): no change made, the rest moved to E7g and E7h. | E7a | Done (no code change) | - |
| E7d | **Quick tier.** `npm run test:quick`: runs only the test files related to changed source files (**Decision first:** a name-based map, an import-graph walk, or git-diff plus a hand-kept map). The full suite remains the gate before a push. Decision and results: [E7d results](#e7d-results). | E7b | Done | v0.11.7 |
| E7e | **Sharding and CI.** `--shard i/n` for the runner; a GitHub Actions workflow running compile, the sharded suite and `generate_keyword_index.js --check` on push and pull request. Results and what could not be run here: [E7e results](#e7e-results). | E7b | Done | v0.11.8, v0.11.10 |
| E7f | **Release** (next free minor). Records before/after wall time and check counts in the changelog line. Results against the revised targets: [E7f results](#e7f-results). | E7a - E7e, E7g - E7m | Done | v0.12.0 |
| E7g | **Shared-process test execution. Decision first.** Run several test files in one long-lived worker so jsdom is loaded once per worker (the E7a table puts jsdom loading at about 240 s of 1,860 s) and, optionally, keep one pooled webview page per worker. Needs a per-file reset of the globals the tests install (`document`, `window`, `Node`, `DspfWriter`, timers), a `process.exit` shim, per-file output and failure reporting as today, a per-file opt-out marker, and an `--isolate` switch that keeps today's one-process-per-file behaviour. The proposal compares `worker_threads`, `vm` contexts and a child-process pool before any code. Outcome: [E7g proposal](#e7g-proposal), approved; the build is E7i - E7l. | E7a | Done (no code change) | - |
| E7h | **Page reuse in the two heaviest files.** `dspfWebview.test.js` (73 pages, 139 s in the baseline) and `menuWebview.test.js` (24 pages, 31 s): build a page once per group of scenarios and load each scenario's source with the page's `externalUpdate` message, resetting the UI state the page keeps (selection, active tab, modification-tracking session flags). Success: identical check counts and results, timed A/B against a control run in the same session. Result and the part left out: [E7h results](#e7h-results). | E7a | Done | v0.11.5 |
| E7i | **Shared worker core.** `src/test/sharedWorker.js`: a worker process that runs a list of test files in order with the reset from the E7g proposal (clear the `require` cache except `node_modules`; first `process.exit` fixes the result and later ones are ignored; read and reset `process.exitCode`; idle detection for files that never exit; output capture per file; timer and interval cleanup; close `global.window`; delete installed globals). `run.js` gets `--shared` (opt-in at first); output blocks, `--- file: N ok, M failed` lines, summary and exit code identical to today. Results: [E7i results](#e7i-results). | E7g | Done | v0.11.1 |
| E7j | **Parity check and opt-out marker.** `// @isda-test: isolate` in a test file's first lines keeps that file in its own process in shared mode. A script (`npm run test:parity`) runs both modes and fails if any file's ok count, failed count or exit code differs; used by CI and by hand before the reset list changes. Results: [E7j results](#e7j-results). | E7i | Done | v0.11.2 |
| E7k | **Worker recycling.** Replace a shared worker with a fresh one after 60 files or when its resident memory (measured after a garbage collection) reaches 1,536 MB, both configurable (`--recycle-files`, `--recycle-mb`, 0 = off); keep per-file output ordering; a worker that dies fails only its current file and the run goes on with a new one. Results: [E7k results](#e7k-results). The pool scheduling that was part of this row's first wording moved to E7m, because it needs E7b. | E7i | Done | v0.11.3 |
| E7l | **Make shared mode the default.** After E7j's parity run is clean on the full suite: `--shared` becomes the default and `--isolate` the escape hatch; update the `run.js` header, `README.md` and `ways-of-working` notes; record the A/B against a same-session control run. Results: [E7l results](#e7l-results). | E7j, E7k | Done | v0.11.4 |
| E7m | **Pool integration.** Make the E7b `--jobs` pool schedule files onto shared workers (each worker recycled by E7k's rules), keeping per-file output ordering, the `--isolate` / marker behaviour and the parity guarantee from E7j. Results: [E7m results](#e7m-results). | E7b, E7k | Done | v0.11.9 |


### E7a baseline results

**Measured 2026-10-09** on the sandbox the sessions run in: **1 CPU core, 4 GB RAM, Node 22.22.2**, tree at
`v0.11.0` plus the roadmap commits, `node src/test/run.js --slow 400`, everything green.

| Measure | Value |
|---------|-------|
| Test files | 316 |
| Checks passed / failed | 21,206 / 0 |
| Wall time | 1,859.5 s (about 31 minutes); sum of per-file times 1,860.5 s |
| Median file | 4.5 s |

The "about 12 minutes" quoted in older notes was measured on a different, multi-core machine. On one core the
suite is the sum of its files, so **a parallel runner (E7b) cannot shorten a run here; only cutting CPU work
(E7c, E7d) can.** This is why the target below is stated in CPU time as well as wall time.

**Distribution.** 104 files finish in under 1 s, 65 in 1-5 s, 110 in 5-10 s and 37 take 10 s or more. The 147
files at 5 s or more account for 1,653 s (89% of the total). The top 5 files are 19.5% of the total, the top 10
are 27.9%, the top 20 are 38.5% and the top 50 are 56.0%.

**Top 20 files.**

| # | File | Checks | Seconds | Seconds per check |
|---|------|--------|---------|-------------------|
| 1 | `dspfWebview.test.js` | 1218 | 139.4 | 0.11 |
| 2 | `i122iGeneratedKeywordMatrix.test.js` | 2722 | 74.9 | 0.03 |
| 3 | `i159FileLevelDisplayIoRules.test.js` | 175 | 55.6 | 0.32 |
| 4 | `i163CommandFunctionParameterForms.test.js` | 153 | 48.9 | 0.32 |
| 5 | `i70ChridEligibilityGuard.test.js` | 118 | 43.5 | 0.37 |
| 6 | `i143MsgconRules.test.js` | 74 | 42.5 | 0.57 |
| 7 | `menuWebview.test.js` | 199 | 30.7 | 0.15 |
| 8 | `i153MsgconParameterForm.test.js` | 88 | 29.2 | 0.33 |
| 9 | `i69ChkmsgidDependencyGuard.test.js` | 83 | 28.6 | 0.34 |
| 10 | `i170ReferenceFieldRules.test.js` | 239 | 25.7 | 0.11 |
| 11 | `i97ErrmsgidSflmsgidDataFieldValidation.test.js` | 70 | 22.9 | 0.33 |
| 12 | `i99SflmsgidGrammar.test.js` | 74 | 22.3 | 0.30 |
| 13 | `i57PshbtnFieldKind.test.js` | 123 | 21.7 | 0.18 |
| 14 | `i89ChkmsgidDataFieldValidation.test.js` | 63 | 21.5 | 0.34 |
| 15 | `i122fHelpWindowFamilyKeywords.test.js` | 137 | 19.9 | 0.15 |
| 16 | `i162HelpKeywordRelations.test.js` | 56 | 19.8 | 0.35 |
| 17 | `i104RecordKeywordRowSweep.test.js` | 408 | 18.9 | 0.05 |
| 18 | `i100SflmsgResponseIndicator.test.js` | 47 | 16.9 | 0.36 |
| 19 | `i68HlprtnReverseGuard.test.js` | 29 | 16.8 | 0.58 |
| 20 | `multiSelect.test.js` | 48 | 16.2 | 0.34 |

**Cost classification.** Constants were measured separately on this sandbox: `node` start about 0.04 s;
`require('jsdom')` 1.23 s; loading `dspfWriter.js` and `keywordSpec.js` about 0.07 s; the first full webview
page in a process (`newWebviewDom` over the 2.3 MB generated page, scripts running) about 3.5 s including the
jsdom load, so about 2.3 s on top of it; each further page in the same process about 1.5 s. Test files that
reference jsdom: 195 of 316. `newWebviewDom(` is called 264 times across 167 files. The buckets
below combine those constants with the file counts; they are estimates, not a profile, and the last bucket is
what is left over.

| Bucket | How estimated | Seconds | Share |
|--------|---------------|---------|-------|
| Node process start | 316 files x 0.04 s | 13 | 1% |
| jsdom module load | 195 files x 1.23 s | 240 | 13% |
| Building a full webview page in jsdom | 167 first pages x 2.3 s + 97 further pages x 1.5 s | 530 | 28% |
| Everything else (the checks themselves, DOM work after the page exists, fixed waits, the generated keyword matrix) | remainder | 1078 | 58% |

**What the outliers show.**
- `dspfWebview.test.js` builds 73 pages (about 110 s of its 139 s) and `menuWebview.test.js` builds 24 (the 1.5 s
  constant would give 36 s against a measured 30.7 s, so it is an upper bound). Both are page-construction cost, which a shared page
  per group of checks would remove.
- `i122iGeneratedKeywordMatrix.test.js` (74.9 s, 2,722 checks) builds one page; its time is the matrix itself.
- Several files take 0.5 s or more per check for 30-90 checks (`i143`, `i153`, `i69`, `i97`, `i99`, `i89`,
  `i68`). A CPU profile of `i68HlprtnReverseGuard.test.js` (profiler overhead included, 21 s) put about 15% in
  garbage collection, about 13% in idle waits (`setTimeout`), and most of the rest inside jsdom's own DOM
  mutation code (`CharacterData.replaceData`, `SymbolTree`, mutation observers), not in the rules code. The
  per-check cost is rebuilding large panel DOM in jsdom, not the guards being tested.
- 169 files use `setTimeout`; nearly all literal delays are 0 or 50 ms, so fixed waits are a small share.

**Target (proposal; Manojkumar to confirm or change, E7f measures against it).** Check count unchanged or
higher, and:
1. **CPU work:** sum of per-file seconds at most **1,300 s** (down 30% from 1,860 s), measured on this sandbox.
2. **Wall time on 4 cores:** at most **6 minutes** for the full suite (needs E7b on top of 1).
3. **Quick tier (E7d):** at most **60 s** for a change confined to one keyword or one record type.

**Superseded:** the absolute numbers above did not survive a re-measurement; see the revised targets in [E7c findings](#e7c-findings).

**Consequences for E7b - E7e.**
- E7b is still worth building (CI and developer machines have more than one core) but will show no gain in this
  sandbox; its acceptance test must be run on a multi-core machine or a CI runner.
- E7c candidates, in order of expected return (each figure is an upper bound from the table above, to be
  verified): load jsdom once per worker instead of once per file (up to about 220 s); share one page per group
  of checks in `dspfWebview` and `menuWebview` instead of one per check (up to about 130 s); reduce the DOM
  rebuilt per check in the 0.5 s-per-check files; evaluate a V8 startup snapshot with jsdom preloaded (an
  experimental Node feature, so a fallback to the current runner is required). Any change that shares a process
  between files must reset the globals the tests install (`document`, `Node`, `DspfWriter`) and keep each file's
  `process.exit` behaviour.
- E7d should map the quick tier onto the buckets above, so the edit loop avoids the page-building files unless
  the change touches the webview code.

### E7c findings

**Measurement noise.** Four of the baseline files were re-run a few hours later on the same code: `i38` 3.4 s
(baseline 5.7 s), `i43` 2.8 s (4.5 s), `i67` 3.3 s (5.6 s), `menuWebview` 20.3 s (30.7 s), so 34-41% faster
with nothing changed. The sandbox's speed varies at least that much between runs, so the absolute seconds in
E7a, and any fixed-seconds target, are unreliable. **Every before/after comparison must be an A/B in one session**
(control run of the unchanged tree, then the changed tree, alternating where possible).

**Node compile cache: tried, not adopted.** `NODE_COMPILE_CACHE` set by `src/test/run.js` for the child
processes. Micro-measurements looked promising (`require('jsdom')` 0.84-0.98 s to 0.62-0.71 s; one webview page
2.2 s to 2.0 s), but running `i38`, `i43`, `i67` and `menuWebview` alternately with and without it gave 29.8 s
without and 29.2 s / 29.6 s with: no gain outside the noise. The runner is unchanged.

**Page construction has no hotspot.** A CPU profile of building one page for a one-record file (2.5 s) spreads
over jsdom parsing and DOM building, jsdom's own module compilation, garbage collection (about 11%), and idle
waits; nothing in iSDA's page script stands out, so editing the script will not shorten it.

**Ceiling of the one-process-per-file model.** Of the estimated 530 s spent building pages, 167 are first pages
(one per process, unavoidable in this model) and the 97 repeated pages cost about 146 s, under 8% of the suite.
Together with a small compile-cache effect that is nowhere near the 30% CPU target proposed in E7a. Getting
there needs processes shared between files (E7g). The page already accepts an `externalUpdate` message that
re-parses the source and re-renders, so reusing a page is possible (E7h), but the page also keeps UI state
(selection, active tab, modification-tracking session flags) that a reused page must reset.

**Revised targets (confirmed by Manojkumar after E7f, unchanged from the proposal).** All measured as an A/B against a control run in the same
session, check count identical or higher:
1. **CPU work:** at least 25% below the control (reachable only if E7g lands; E7h alone is worth about 5-8%).
2. **Wall time on 4 cores:** at least 3.5 times faster than the control (E7b).
3. **Quick tier (E7d):** at most 5% of the control's full-suite time for a change confined to one keyword or
   one record type.

### E7g proposal

**Status: approved by Manojkumar as proposed (option B, the `// @isda-test: isolate` marker, recycling after 60
files or 1.5 GB). No repository code was written for E7g;** the experiment below used a throwaway runner kept
outside the repository. The build is E7i - E7l.

**What was tried.** A runner that executes many test files in one Node process: before each file it clears the
`require` cache except `node_modules` (so jsdom stays loaded and warm), replaces `process.exit` with a function
that records the first exit code and stops the file, captures output, wraps timers so they can be cleared,
closes `global.window`, and deletes the globals the file installed. A file that never calls `process.exit`
(four of them) is finished when `process.getActiveResourcesInfo()` shows nothing but the runner's own timer.

**Results (one-core sandbox, so compare ratios, not seconds; see the noise note in E7c findings).**

| Run | Files | Checks passed / failed | Wall |
|-----|-------|------------------------|------|
| Current runner, 24 jsdom-using files | 24 | 1,790 / 0 | 130 s |
| Shared-process runner, same 24 files, two runs | 24 | 1,790 / 0 both times | 76 s and 77 s (42% less) |
| Shared-process runner, whole suite | 316 | 21,206 / 0 (equal to the baseline total) | 904 s, one run |

After the first file, the average file fell from 5.6 s to 3.2 s, and per-file check counts matched the current
runner for all 24 files. The whole-suite wall time cannot be compared with the 1,860 s baseline because of the
timing noise; the same-session ratio from the 24-file A/B (0.58) is the number to trust.

**Problems found, all solvable but each must be designed in:**
1. **A `process.exit` that throws can be caught by the test.** Ten files (`i57`, `i68`, `i69`, `i70`, `i87`,
   `i88`, `i89`, `i97`, `i99`, `i100`) end with `main().catch(e => process.exit(1))`. With the exit replaced by a
   throw, their own catch turned a clean `exit(0)` into exit 1 with 0 failed checks. Fix, verified on those ten:
   the first `process.exit` in a file fixes the result and later ones are ignored.
2. **Four files end by letting the event loop drain** instead of calling `process.exit` (for example
   `i128SflChoiceListReverseGuard`). Idle detection handles them; no test needs editing. 41 files also set
   `process.exitCode`, which the runner must read and reset.
3. **Memory.** Resident memory climbed from under 1 GB to about 3.1 GB over roughly 200 files, close to the
   sandbox's 4 GB, because pages and windows are retained. A worker must be recycled after N files or above a
   memory limit; a recycle also restores a clean jsdom.
4. **Isolation is weaker than a process per file.** Anything a test changes outside what the runner resets
   (built-in prototypes, `process.env`, jsdom-wide state) could leak into the next file. The suite showed no
   leak (identical counts), but a regression could appear later, so a parity check is part of the proposal.
5. **Only jsdom loading and warm-up are saved.** Each file still builds its own first webview page (about 2.3 s);
   sharing pages is E7h.

**Options compared.**

| Option | Verdict |
|--------|---------|
| A. One process per file (today) | Strongest isolation; about 240 s of the suite is jsdom being loaded again and again, plus cold JIT on every file. Stays available as `--isolate`. |
| B. Long-lived worker processes that run files one after another with the reset above | **Recommended.** Measured 42% less time on a 24-file sample, identical results on all 316 files. Works with E7b: the pool runs several such workers across cores. |
| C. `worker_threads`, one per file | Rejected: each thread has its own module cache, so jsdom loads every time; no gain. |
| D. V8 startup snapshot with jsdom preloaded | Not tried. Needs jsdom bundled into one file and uses an experimental Node feature; it would keep one process per file. Keep as a later experiment if B's isolation proves too weak. |
| E. `node --test` with isolation off | Rejected: `process.exit` in the tests would end the whole run, and nothing resets globals. |

**Proposed design (B).**
- A worker process takes a list of files and runs them in order with the reset above; the parent (the existing
  `run.js`) collects each file's output and result so the `=== file ===` blocks, the `--- file: N ok, M failed`
  lines, the summary and the exit code stay exactly as today.
- Recycle a worker after 60 files or when its resident memory passes 1.5 GB (both configurable; the numbers come
  from the observed growth of about 15 MB per file and are to be tuned).
- `--isolate` runs one process per file as today. A first-line comment `// @isda-test: isolate` marks a file that
  must never share a process.
- **Parity check:** a script that runs both modes and fails if any file's ok and failed counts or exit code
  differ; run in CI, and by hand before changing the reset list.
- No test file is edited for B.

**Sub-tasks opened on approval (E7i - E7l):** the shared worker and reset core; the parity check and
opt-out marker; wiring into the E7b pool and recycle rules; documentation (`README`, runner header comment).

**Questions for Manojkumar.**
1. Approve option B as the E7g design?
2. Is `// @isda-test: isolate` an acceptable opt-out marker?
3. Defaults of 60 files / 1.5 GB for recycling, or a different policy?

### E7i results

**Shipped as v0.11.1 (tests only, no change to the extension).** `src/test/sharedWorker.js` and
`node src/test/run.js --shared`; the default runner is unchanged and `--shared` stays opt-in until E7l.

**What the worker does** is the reset list from the E7g proposal: module cache cleared except `node_modules`; the
first `process.exit` wins; `process.exitCode` and event-loop-drain files handled; stdout and stderr captured
into one log per file; timers, intervals and immediates cleared; every jsdom window closed (the worker wraps
`JSDOM` to track them; jsdom has no `window.closed`, so the test checks that `window.document` is gone);
globals, `process.env` and `process.argv` restored. The parent receives only a small IPC message per file and
reads the output from a log file the worker wrote, for the same lost-tail reason the isolated runner uses files.

**Tests.** `e7iSharedWorker.test.js` (26 checks) drives one worker over IPC with 17 small fixture files in
`src/test/fixtures/sharedWorker/`: exit codes (including from a timer), drain with and without `exitCode`, the
first-exit-wins case, uncaught errors and rejections, stdout/stderr ordering, `argv`, and what leaks between files
(globals, env, a running interval, module state, jsdom windows). Seven deliberate breakages of the worker
(windows not closed, last exit wins, module cache kept, globals kept, env kept, intervals kept, exit code ignored)
were each caught; the intervals one as a hang.

**Parity on the full suite.** Isolated run: 317 files, 21,232 checks, 0 failed, 1,283 s. Shared run: the same 317
files with identical per-file ok/failed counts and no failed file (21,232 checks in total); one shared run was cut
at file 203 of 317 by a sandbox restart and its remaining 114 files were run afterwards, so the shared time is
not a clean single run. Summed per-file seconds were 1,286 s isolated against 876 s shared (about 32% less);
the cleaner same-session comparisons were 24 jsdom files (130 s to 76 s, 42% less) and 8 files (43.9 s to
33.4 s, 24% less).

**Known limits, left to the next sub-tasks.**
- No worker recycling yet (E7k). The interrupted run is a reminder: memory grew to about 3 GB over 200 files in
  the earlier experiment, and a restart during a long shared run is consistent with that, although the cause was
  not established.
- No opt-out marker or parity script yet (E7j); no `--jobs` pool yet (E7b, E7k).
- A file that fails with an uncaught error shows the error stack in its log rather than Node's own message
  format; its exit code is 1 as before.

### E7j results

**Shipped as v0.11.2 (tests only).**

- **Isolate marker.** In `--shared` mode a test file with `// @isda-test: isolate` as a comment line among its
  first 30 lines runs in a process of its own; a marker further down, or inside a string, is ignored. The
  summary names the files run that way.
- **Parity check.** `npm run test:parity` (`src/test/parity.js`) runs the same files one process per file and in
  the shared worker, then compares each file's ok count, failed count and pass/fail result. It prints a `DIFF`
  block for every file that differs and exits 1; it also exits 1 when no files were reported. It accepts the
  runner's file filters and `--dir`.
- **`run.js --dir <path>`** takes the test files from another directory (used by the runner's own tests).

**Tests.** `e7jParityAndIsolateMarker.test.js` (27 checks) uses fixtures in `src/test/fixtures/runner/` and
`runner-diff/`: a file that pollutes `Array.prototype` (the worker does not reset built-ins), a victim that
fails behind it in shared mode, the same victim with the marker, and three victims that differ from isolated
mode in exactly one of ok count, failed count and result. Nine deliberate breakages of `run.js` and `parity.js`
were each caught; the first version of the test missed four of them because its fixtures differed in every
dimension at once, which is why the single-dimension fixtures exist.

**Parity on the real suite.** All 318 test files were compared in four chunks of about 80 files (a single full
run was twice cut short by sandbox restarts): every chunk ended `PARITY OK`, so every file reported the same
counts and result in both modes. No file needs the marker today.

**Still open for the shared runner:** worker recycling and the `--jobs` pool (E7k), then making `--shared` the
default (E7l).

### E7k results

**Shipped as v0.11.3 (tests only).** E7k's first wording also covered scheduling files onto the E7b `--jobs`
pool; that part needs E7b, so it became E7m and E7k is the recycling.

- **Recycling.** `run.js --shared` replaces its worker with a fresh one after 60 files (`--recycle-files N`) or when
  the worker's resident memory reaches 1,536 MB after a file (`--recycle-mb M`); 0 turns either off, and a
  non-number or negative number is refused with exit 2. The worker is started with `--expose-gc` and collects
  garbage before it reports its memory, so the limit sees what is actually kept alive, not garbage waiting to be
  collected. The summary gains a line such as `Shared workers: 3 started (replaced: 2 after 60 files, 0 at 1536
  MB, 0 after a crash)`.
- **A worker that dies** fails only the file it was running (reported as failed with the output up to the
  crash); the run continues in a new worker. To make that output survive, the worker now writes each file's
  output to its log as it is produced instead of at the end.

**Tests.** `e7kWorkerRecycling.test.js` (22 checks) uses fixtures that print their process id (`runner-recycle/`,
`runner-memory/`, `runner-crash/`): replacement after 2 files, the default of 60, `--recycle-files 0`, a file that
really keeps 400 MB alive (the next file gets a new worker, files after that share it), `--recycle-mb 0` and
`--recycle-mb 1`, a worker killed with SIGKILL, refused flag values, and that the flags do nothing without
`--shared`. Eight deliberate breakages (each recycling rule off, no memory reported, crash not counted, the file
counter not reset, a changed default, flag values not validated, memory replacements counted as file
replacements) were each caught.

**Parity with recycling.** Two of the four parity chunks (158 of 318 files) were run again with
`--recycle-files 25`, so the shared pass used several workers per chunk: both ended `PARITY OK`.

**Choices made:** the defaults are those approved in E7g (60 files, 1,536 MB). The 60-file default was not
re-derived from a new measurement; a full shared run with the defaults, and a check of how often memory (rather
than the file count) triggers a replacement on the real suite, belong to E7l when shared mode becomes the default.

### E7l results

**Shipped as v0.11.4 (tests only).** `npm test` (`node src/test/run.js`) now runs in the shared worker by default.
`--isolate` gives every file a process of its own, as before; `--shared` is still accepted. `parity.js` passes
`--isolate` explicitly for its isolated pass. The runner header and the README's Development section describe
the modes, the `// @isda-test: isolate` marker and `npm run test:parity`. The three runner tests that assumed the
old default (`e7j`, `e7k`) were updated, and `e7j` gained a check that the worker summary line appears with no
flag. The "ways-of-working notes" named in this row are not in the repository and were not changed.

**The full suite in the new default** (`npm test`): 319 files, 21,281 checks, 0 failed, exit 0, 1,115 s. Six workers
were started: four replaced after 60 files, one replaced at the 1,536 MB limit (so the memory rule does fire on
the real suite), none after a crash.

**Same-session comparison (control first, then the new default), 80 files, identical per-file counts both times:**

| Mode | Files | Checks | Wall time |
|------|-------|--------|-----------|
| `--isolate` (control) | 80 | 7,965 / 0 failed | 372.7 s |
| shared (new default) | 80 | 7,965 / 0 failed | 319.0 s (14% less) |

One pair, control run before the other, so order and machine noise are not excluded. The gain is well below the
42% seen on the 24 jsdom-only files in E7g, because this chunk includes the heaviest files (the generated keyword
matrix, `i159`, `i143`, `i153`), whose time is the checks themselves, and because every file still builds its
own first webview page. **The E7a/E7c target of at least 25% less CPU work is therefore not reached by E7i - E7l
alone on this evidence;** the remaining levers are E7h (page reuse in the two heaviest files), E7d (quick tier
for the edit loop) and the E7b/E7m parallel pool for wall time on more cores. The full-suite A/B against a control
belongs to the E7f release.

**Guard against leaks.** Parity was clean on all 318 files at E7j and on 158 files again with recycling at 25
(E7k); the full suite passes in the default mode. Until E7e puts `npm run test:parity` into CI, running it after
adding a test that changes built-ins or other process-wide state is a manual step (the README says so).

---

### E7h results

**Shipped as v0.11.5 (tests, plus one message in the page script).** `dspfWebview.test.js` now builds one DSPF
designer page per process and resets it for each scenario instead of building 60 of its 73 pages.

**How it works.** The page script gained a `resetViewState` message (not sent by the extension host). It undoes
the toggles through their own change listeners, puts every session-only variable back (selection, tabs, compare
mode, ruler and crosshair, modification tracking, panels, the add-record form, UI style and theme, the echo-suppress
flag, host-pushed settings, the save and Code for IBM i badge state), empties the record and size selects, and
loads the new source. `leaseDspfPage(source, fileName, { posted, rect })` in `helpers/common.js` sends it twice
(the first pass with the message sink closed, so only the second render reaches the scenario) and then posts the
`ready` message a fresh page posts last. A lease taken before the previous scenario has started (two scenarios
launched back to back) gets a page of its own. `ISDA_NO_PAGE_REUSE=1` builds a fresh page for every lease.

**What was converted.** Scenarios whose page is the only one in use, built from `webviewHtml` with four arguments
and either no stubs or the standard 800x480 rectangle mock. Nested pages inside a scenario, pages built with a
UI style or theme argument, and scenarios that use `html` after building the page keep `newWebviewDom`.

**Guard.** `e7hResetParity.test.js` dirties a page as far as the UI allows and compares it after the reset with a
fresh page for nine source pairs (body markup, body data attributes and style, messages posted by the render). It
found four leaks in the first version of the reset (the dirty-state mark on Save, the Code for IBM i badge, the
ruler contents, the canvas message class) plus stale size-select options, and it checks that the dirtying steps
did change the page. A new piece of page state that is not added to `resetViewState` is expected to show up there
or in a `dspfWebview.test.js` scenario.

**Same-session A/B on `dspfWebview.test.js`, 1-core machine, identical 1,218 checks both times:**

| Mode | Checks | Wall time |
|------|--------|-----------|
| `ISDA_NO_PAGE_REUSE=1` (control) | 1,218 / 0 failed | 125.0 s |
| page reuse | 1,218 / 0 failed | 78.0 s (38% less) |

One pair, control first, so order and machine noise are not excluded (the second pair was lost when the sandbox
dropped the background job). The earlier baseline of 91 s was taken with a cold disk cache. **The full suite**
(`npm test`): 320 files, 21,338 checks (the 57 new ones are `e7hResetParity`), 0 failed, exit 0, 931 s.

**Not done: `menuWebview.test.js`.** Its page keeps the file names and the command-source status in `const`s
built into the script, so a reused page would show the wrong ones, and reuse would first need those turned into
state. The file builds 24 pages in about 20 s, so the possible gain is about 6 s, under 1% of the suite. Left as is.

---

### E7b results

**Shipped as v0.11.6 (tests only).** `node src/test/run.js --isolate --jobs N` runs up to N test files at once, each
in a process of its own, writing its output to its own log file as before.

**Behaviour.** The default is the number of cores minus one (at least 1); `--jobs 1` is the sequential run, with the
child environment untouched. A file's block (`=== file ===`, its output, the `--- file: ...` line and any
`*** FAILED ***` line) is printed when it and every file before it have finished, so blocks are whole, in file order
and grep-friendly. The summary, the `FAIL  -` detection and the exit code are the same; with more than one job the
summary adds a `Jobs:` line. `--jobs` needs a whole number of at least 1 (exit 2 otherwise).

**Guard against shared paths.** Each slot's children get their own temp directory (`TMPDIR`, `TMP`, `TEMP`), removed
at the end of the run. An audit of `src/test` found no test that writes a fixed path outside the temp directory; the
new fixture files write the same temp name on purpose, and three of four overwrite each other's file when run at
once without the private directory.

**Scope.** The pool applied to the process-per-file path only; shared mode took the same flag in E7m
([E7m results](#e7m-results)).

**Checks.** `e7bParallelRunner.test.js` (13 checks): 1 job against 4 on four 0.8 s files (output identical apart
from timings, 4 jobs clearly faster, private temp files), a failing file among passing ones in both modes,
`--jobs` validation, and the shared-mode note. Full suite, default mode: 321 files, 21,351 checks, 0 failed, exit 0,
954 s. Full suite through the pool (`--isolate --jobs 3`): 321 files, 21,351 checks, 0 failed, exit 0, 1,083 s.

**What this does not show.** The machine has one core, so the pool gave no speed-up on the real suite and the
1,083 s is not a comparison with anything. The speed claim for E7b still needs a timed A/B (`--isolate --jobs 1`
against `--jobs N`) on a multi-core machine; the sleeping fixtures only show that files overlap.

---

### E7d results

**Decision (taken here, confirmed by Manojkumar):** git diff plus identifiers, chosen over a name-based map and an
import-graph walk. **Shipped as v0.11.7 (tests only).** `npm run test:quick` (`src/test/quick.js`, selection in
`src/test/quickSelect.js`).

**Why not the other two.**
- *Name-based map:* test files are named after task ids (`i122...`, `i159...`), not modules or keywords, so a name
  gives nothing to key on.
- *Import-graph walk:* of 321 files, 191 (94% of the 910 s of per-file time) depend on the same four modules
  (`webviewTemplate`, `keywordSpec`, `dspfEngine`, `menuWebviewTemplate`); a change to `keywordSpec.js` would select
  237 files, about 69% of the suite.
- *Git diff plus identifiers* ranks by what the change actually says, needs no hand-kept map, and can be given a time
  budget.

**What it does.** Reads the change from git (staged, unstaged and new files, since `HEAD` or `--base <ref>`). Always
runs changed or new `*.test.js` files. Takes the identifiers (words of 5 or more characters, comment-only lines
ignored) that the change adds or removes in `src/*.js|ts`, ignores any found in more than 40 test files, and ranks the
test files that mention them by specificity (a match on a word found in 2 files counts for more than one found in 30).
It takes them in that order until their time reaches 5% of the last full run (`--budget P`; `--wide` is 15%); the rest
are listed as cut. Files that took over 8 s in the last run (or, without timings, files that build a webview page) join
only when the webview code changed. `--explain` shows the selection without running it. The chosen files go through the
normal runner, so output, summary and exit code are the same. Changes to shared test support (helpers, the runner) are
flagged rather than guessed at. `run.js` records per-file seconds in `.isda-test-times.json` (git-ignored).

**Measurements (timings from the 321-file default run, 910 s of per-file time).**
- *One keyword.* For each of the 197 keywords in `keywordSpec.js` that a test mentions, the files that mention it and
  took 8 s or less need a median **2.0%** of the suite's time (90th percentile 4.2%); 184 of 197 are within 5%. Without
  the heavy-file rule the median is 7.4% and only 81 of 197 are within 5%, so that rule is what makes the target
  reachable.
- *Real run.* A simulated one-line change mentioning `DSPMOD` in `keywordSpec.js` selected 12 files (11 matches plus the
  new test file), 447 checks, 27.7 s wall, 2.1% of the last full run's time by the recorded timings.
- *Against history.* On the 31 recent commits that changed at most 40 source lines and modified existing test files,
  the source diff alone (without being told which tests the commit changed) found **34 of the 50** modified tests (68%)
  at the 5% budget, mean 4.8% of the suite's time and never over it; at 15% it found 41 of 50 (82%), which is also
  where it stops improving: the other 9 are not reachable through identifiers.

**Limits, stated plainly.** A test that depends on the change through something the change does not spell out is not
found; about a third of the modified tests in recent small commits were missed at 5%. Heavy page-building files are
left out unless the webview code changed. Timings are per machine; the first run on a new checkout treats every file
that builds a page as heavy. **The full suite remains the gate before a push** and the README and the command's output
say so.

**Full suite after the change** (`npm test`): 322 files, 21,375 checks, 0 failed, exit 0, 1,066 s (this run also
built the timing file the quick tier reads; the 1,066 s is not comparable with the 954 s of the previous run on this
single shared core).

**Checks.** `e7dQuickTier.test.js` (24): the selection with in-memory files (identifier match, heavy rule with and
without timings, comment lines, the frequency limit, ranking and budget, helper changes) and the command against a
throw-away git repository (no change, a changed line, a left-out slow file, the normal runner's summary and exit code,
a failing changed test, new untracked files, flag validation).

---

### E7e results

**Shipped as v0.11.8 (sharding) and v0.11.10 (the workflow in place).** `--shard I/N` in `src/test/run.js` and
`.github/workflows/test.yml`. The workflow first went out as `docs/sda-reference/ci/test.yml` because the token used for the
v0.11.8 push had no `workflow` scope; with a token that has it, v0.11.10 moved it into `.github/workflows/`.

**The split.** After name filters, the sorted file list is cut round-robin: shard I takes the files whose position modulo N
is I-1. The N shards are therefore exactly the files of a plain run, each once, and the split depends only on the file
names, so every machine computes the same shards. Timing-based balancing was left out on purpose: a split that read a
local timing file would differ between machines and the shards might not add up to the suite. Measured on the recorded
per-file times of the 322-file suite, round-robin comes within **2%, 8% and 17%** of a perfectly even split for 2, 4 and
6 shards (name hashing: 19%, 65%, 59%; contiguous chunks: 17%, 19%, 42%). A shard prints `Shard I/N: k of m test file(s)`,
runs through the normal runner (summary, `FAIL  -` detection, exit code) and combines with `--isolate --jobs N`. A shard
with no files exits 0; a name filter that matches nothing is still an error; a bad spec exits 2.

**A runner bug found on the way.** `run.js --list` (and the summary's exit) called `process.exit` straight after printing, which
drops the tail of large output when stdout is a pipe; the first version of the shard test flaked on it (292, 246, 276 or 231
of 323 names in 4 of 40 probes, none in 40 after the fix). Every exit in the runner now waits for stdout to flush. CI logs
are pipes, so this mattered for the new workflow too.

**The workflow** (`.github/workflows/test.yml`). Three jobs. `keyword-index` runs `generate_keyword_index.js --check`. `suite` runs on a matrix of four
shards (`fail-fast: false`, so one shard's failure does not hide another's): checkout, Node 22, `npm ci`, `npm run
compile`, `node src/test/run.js --shard ${{ matrix.shard }}`. `parity` runs `npm run test:parity` weekly and on request
only, since it runs the suite twice; this is the CI step that E7j's note was waiting for. Triggers: push to `main`, pull
requests, manual run, and the weekly schedule. Pull-request runs cancel older runs of the same branch.

**What was checked here.** The workflow file parses as YAML. The steps were run by hand on a clean copy of the working tree
(tracked and untracked files only, no `node_modules`, no `dist`, no generated templates): keyword-index check, `npm ci` (330
packages), `npm run compile`, then shard 4/4: 80 of 323 files, 5,675 checks, 0 failed, exit 0, 348 s on one shared core.
`e7eSharding.test.js` (36 checks, including twelve `--list` runs through a pipe) covers the partition (fixture directory with 1, 2, 3, 5 and 7 shards, and the real
suite with 4: every file exactly once, sizes within one file), filters before the split, empty shards, spec validation,
a shard through the runner, and that the workflow's matrix lists every shard and its steps are the ones above. Full suite,
default mode (`npm test`, after the flush fix): 323 files, 21,411 checks, 0 failed, exit 0, 1,069 s (one shared core; not comparable with earlier runs).

**What was not run.** The workflow itself has not run on GitHub: this sandbox cannot start Actions. The first push to
`main` after this release is the real test; check that the four `Suite, shard I/4` jobs and `Keyword index is up to date`
go green, and that the repository allows Actions. The speed-up from four parallel jobs also needs that first run to be
read off (the expected shape is a quarter of the suite per job plus install and compile time, not a measurement).

---

### E7f results

**Released as v0.12.0.** The measurement the E7a baseline asked for, as an A/B in one session on the sandbox the sessions
run in (1 core, Node 22.22.2), because the E7c findings showed that seconds from different sessions differ by 34-41% with
nothing changed. Tree: v0.11.10 plus the E7f claim commit, so every E7 task is in.

| | Control | New default | Change |
|---|---|---|---|
| Command | `ISDA_NO_PAGE_REUSE=1 node src/test/run.js --isolate --jobs 1` (one process per file, a page per scenario: the suite as it ran before E7) | `npm test` (shared workers, page reuse) | |
| Files / checks passed / failed | 324 / 21,436 / 0 | 324 / 21,436 / 0 | identical; every file has the same check count in both runs |
| Wall time | 1,831.5 s | 1,431.2 s | **21.9% less** |
| Sum of per-file seconds | 1,833 s | 1,359 s | **25.9% less** |
| `dspfWebview.test.js` | 126.5 s | 86.1 s | 32% less |

**Against the revised targets (E7c findings, confirmed by Manojkumar unchanged).**
1. *CPU work at least 25% below the control:* **borderline, not shown to be met.** By the sum of per-file times, the measure the
   E7a baseline used, it is 25.9%; by wall time on one core, which also counts starting and replacing workers (about 72 s here), it
   is 21.9%. It is one pair, run in sequence (control first), so the 3-point gap between the two measures is inside what a repeat
   could move. The reductions that count on one core are the shared worker (E7i-E7l) and page reuse (E7h, 125 s to 78 s on
   `dspfWebview.test.js` in its own A/B); the pool (E7b, E7m) and shards (E7e) add no CPU work to
   save on one core.
2. *Wall time on 4 cores at least 3.5 times faster than the control:* **not measured; it cannot be on this machine.** The
   parallel pool is checked on one core only for correctness (barrier fixtures prove overlap). The number comes from the first
   GitHub Actions run of `.github/workflows/test.yml` (four shard jobs, each also paying `npm ci` and compile) or from
   `--jobs 4` on a four-core machine, set against `--isolate --jobs 1` on the same machine. Until then this target is open.
3. *Quick tier at most 5% of the control's full-suite time for a one-keyword change:* **met.** Taking the 197 keywords of
   `keywordSpec.js` that a test mentions, and selecting with `quick.js`'s rules from the control run's per-file times, the
   selection is a median 1.6% of the control total (90th percentile 3.3%, largest 4.9%, none over 5%); `DSPMOD` selects 9
   files, 1.2%. This is the selected files' recorded time, not a stopwatch run of the command (that ran 27.7 s on a DSPMOD change
   during E7d). Its limit stands: at the 5% budget the source diff alone found about two thirds of the existing tests that recent
   small commits had to modify.

**Context for the numbers.** Eight `e7*` test files that this work added are in both runs and cost 147 s of the control's time;
they are part of the suite now. Earlier full runs of the new default in this sandbox took 954-1,102 s against 1,432 s here, the
same drift E7c recorded, which is why only the paired runs above are compared.

**First GitHub Actions runs (added after the release).** The first three runs (v0.11.10, `febc920`, v0.12.0) failed in shards 3/4
and 4/4 on every push. Cause, reproduced here by faking a four-core machine (`NODE_OPTIONS=--require` a stub of
`os.cpus()`): `e7jParityAndIsolateMarker` and `e7kWorkerRecycling` run the runner inside a test and expect one worker, but the
runner's default `--jobs` is cores minus one, which is 1 on the one-core sandbox and 3 on a four-core runner. Fixed in v0.12.1: those
two tests set `ISDA_JOBS=1` (a new way to set the default job count). The run on that commit is green: four shards with test steps of
74, 77, 86 and 109 s (job totals 88-124 s including `npm ci`, about 7 s) and a whole-run wall of 127 s. That is the new way on a
four-core runner; it is **not** a comparison with the sandbox control (1,831 s on one core). A manual `control` job
(Actions, "Tests", Run workflow with "control" ticked) now times the old way on the same kind of runner; the quotient of its
wall time and the slowest shard job is the number target 2 asks for. The local full suite on v0.12.1: 324 files, 21,438 checks, 0 failed, 994 s.

**Repeat, new default on both sides of the control (same sandbox, same day).** Order: new default, then the old way, then new
default again (a first attempt at the control died when the sandbox session was reset and was started again, so the first
new-default run and the control are about 40 minutes apart; the second new-default run follows the control directly). 324 files,
21,438 checks, 0 failed in all three runs, and every file has the same check count in all three.

| | Wall time | Reduction vs control | Sum of per-file seconds | Reduction vs control |
|---|---|---|---|---|
| Control (`ISDA_NO_PAGE_REUSE=1 ... --isolate --jobs 1`) | 1,393.8 s | - | 1,395 s | - |
| New default, before the control | 1,083.2 s | 22.3% | 1,035 s | 25.8% |
| New default, after the control | 1,044.1 s | 25.1% | 1,001 s | 28.2% |

**Verdict on target 1 (CPU work at least 25% below the control), from all three paired comparisons.** *By the sum of per-file
seconds*, the measure of the E7a baseline: met each time (25.9%, 25.8%, 28.2%). *By wall time on one core*, which also counts
starting and replacing workers: 21.9%, 22.3% and 25.1%, so it clears 25% in one of three and averages 23%. The same old-way
command took 1,831 s in the first session and 1,394 s in the second, a 31% swing with no code change, which is why only paired
runs mean anything; with that noise, "about 22-28% depending on how it is counted" is what the data supports, and "at least 25%"
holds for per-file seconds but not reliably for wall time. If the target is read as wall time, it is not met on one core.

**Target 2, from the manual CI control run (2026-10-11, Actions run 38150069745, `workflow_dispatch` with "control" ticked, v0.12.1).**
The control job (old way: `ISDA_NO_PAGE_REUSE=1 ISDA_JOBS=1 ... --isolate --jobs 1`, one job on a four-core `ubuntu-latest` runner) timed
its test step at **685 s** (15:09:10 to 15:20:35 UTC). The four shard jobs of the same run, started at the same moment, took
**88, 98, 99 and 114 s** in total (job start to end, `npm ci` and compile included). Control divided by the slowest shard job:
**685 / 114 = 6.0 times faster**, against the target of at least 3.5 times: **met**. Measured against the slowest shard
that passed (99 s) it is 6.9 times. Caveat: this compares one job on one runner with four jobs on four runners, which is
what the workflow does for a person waiting for CI; it is not `--jobs 4` on one machine. The same run's parity job
(`npm run test:parity`, both modes over the whole suite, 829 s) agreed on every file. `parity.js --jobs` (the pool) was still
not run on the whole suite.

**A flaky check found in that run.** Shard 1/4 of the same run failed one check of `e7mPoolIntegration.test.js`: "the six
files ran in three different processes, two each". The fixture is six 0.5 s files on three pool slots and the check
assumed the clock splits them two and two; on a loaded runner a slot can take three files and another one. The check now
asserts what is guaranteed (all six files reported, by exactly three processes); the barrier check already proves the overlap.
Same check count, and the earlier runs on the same code were green, so it is a timing flake, not a pool bug.

**What is left open.** (a) ~~The four-core wall time~~ done above (target 2 met). (b) ~~A repeated pair~~ done above. (c) Targets
1-3 were confirmed as written. Target 1 reads as met by per-file seconds (25.8-28.2%) and not reliably by wall time on one core;
Manojkumar accepted the per-file reading on 2026-10-11, so the E7 epic is Done (v0.12.2). (d) Both loose ends are closed in v0.12.3: `parity.js --jobs 3` on the whole suite (324 files, isolated pool against shared pool)
agreed on every file, and the stray `ExitSignal { code: 0 }` line (11 files that end with `process.exit` in an async `main()` and a
`.catch` that prints the error) is dropped by the worker's output capture; it was cosmetic, the exit codes were right.

---

### E7m results

**Shipped as v0.11.9 (tests only).** `node src/test/run.js --jobs N` now also works in the default shared mode: up to N
shared workers run at once, one per pool slot, and files are handed to whichever slot is free, in file order. `--isolate
--jobs N` is as in E7b; `--jobs 1` (the default on a one-core machine) is the single worker as before.

**Behaviour.**
- *Slots.* Each slot owns at most one worker, started when the slot first gets a file. E7k's recycling is per worker: a
  slot's worker is replaced after 60 of *its own* files or when *its* memory reaches 1,536 MB (`--recycle-files`,
  `--recycle-mb` as before), and a worker that dies fails only the file it was running; the slot starts a new one for its next file.
- *Isolate marker.* A file with `// @isda-test: isolate` takes a pool slot like any other file and runs in a process of its own.
- *Temp directories.* With more than one job each slot's worker is started with its own `TMPDIR`/`TMP`/`TEMP` (the same
  private directory the isolated pool gives its processes, removed at the end), so two files that write a fixed name in the
  temp directory cannot meet. The worker resets `process.env` between files to what it started with, so the private
  directory survives the reset.
- *Output.* Unchanged from E7b: a file's block is printed when it and every file before it have finished, so blocks are
  whole and in file order. The summary adds `Jobs: N files at once, on shared workers (one per slot)`; the `Shared workers:` line
  now counts all slots, and the marker list is sorted by file name because marked files finish out of order.
- *The old note is gone.* Shared mode used to print that `--jobs` had no effect; it now does something.

**Memory.** N workers hold N times a worker's memory, up to N x 1,536 MB before the recycle limit replaces them. On a
machine with little memory, lower `--recycle-mb` or `--jobs`.

**Checks.** `e7mPoolIntegration.test.js` (25 checks; a barrier fixture proves the overlap on one core): six files on
one worker against three (a barrier of three files that wait for each other proves they run at once; same report apart from pids and timings, blocks in order, private
temp directories); recycling per worker (1-file and 2-file limits, a 1 MB memory limit); the isolate marker (listed, own
pid, took a slot, report equals the one-job run); a SIGKILLed worker (only that file fails, the other slot's files still
pass, the crash is counted, the run goes on); a failing file; `--isolate --jobs` unchanged. Five deliberate breakages were
each caught: every file on slot 0, no private `TMPDIR` for the workers, the file counter never reset, the marker ignored (these four
as failing checks) and a dead worker left in its slot (caught as a hang that the test's timeout ends). E7b's test was updated:
its shared-mode check now uses `--jobs 1`, since `--jobs 4` is no longer a no-op.

**Full-suite result and parity.** Full suite through the pool (`--jobs 3`, one shared core): the run was cut short at 316 of 324 files (sandbox
restart, no summary). Every reported file passed except one check in the new test's first version (a wall-clock comparison that
a loaded machine can fail; replaced by the barrier fixture, see above). The eight files that had not reported and the
edited `e7mPoolIntegration.test.js` (25 checks) ran afterwards through the pool: 12 files, 273 checks, 0 failed, exit 0.
No total check count is claimed for the interrupted run. `parity.js --jobs` was not run on the whole suite. The runner prints a
stray `ExitSignal { code: 0 }` line after some files; it appears the same way without this change (seen on `e7iSharedWorker`
before and after), so it is left for a separate task.

**What this does not show.** The machine has one core, so the pool gives no speed-up on the real suite; the speed claim for
E7m, like E7b's, still needs a timed A/B (`--jobs 1` against `--jobs N`) on a multi-core machine, and that is the number E7f
should record.

---

## E8

**`WINDOW(*DFT)` and runtime-valued window parameters**

**Goal.** Today a `WINDOW` whose position or size depends on a runtime value (`*DFT`, or a program-to-system
field) renders at a fixed dashed placeholder. Let the designer choose a design-time value for the preview, so
the screen can be checked as it will appear, without changing the source.

**Acceptance for the release.** Every runtime-valued `WINDOW` form listed in E8a can be given a preview value;
the dashed placeholder remains the default; nothing is written to the source; compare mode uses the chosen
values instead of staggering placeholders; the accepted-limitation entry is rewritten.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E8a | **Inventory.** From the `WINDOW` section of the DDS Reference: exactly which parameters can be `*DFT` or a program-to-system field (reference line, reference column, lines, columns, and the `WDWBORDER` interaction), and what IBM says `*DFT` means at run time. | - | Done (no code change) | — |
| E8b | **Preview value model.** Per-window design-time values in the E3f store; default behaviour unchanged when none is set. | E8a, E3f | Done | v0.14.2 |
| E8c | **Engine.** Geometry resolution accepts the preview values; the dashed border stays for unset parameters only; unit tests for every form in E8a. | E8b | Done | v0.14.3 |
| E8d | **UI. Decision first.** A "Set preview position" control on a placeholder window; whether drag/resize is allowed on a runtime-valued window and what it changes (preview value only, never source). | E8c | Done | v0.14.4 |
| E8e | **Compare mode.** Replace the per-window stagger with the chosen values where set. | E8c | Done | v0.14.5 |
| E8g | **Resize keeps the trailing options.** `DspfWriter.setWindowGeometry` rebuilds the parameter text from the numbers only, so resizing a window from the preview drops a trailing `*NOMSGLIN` / `*NORSTCSR` (found in E8a). Keep every token after the four numbers (three for `*DFT`); test both forms. | - | Done | v0.14.6 |
| E8f | **Release** (next free minor); rewrite the `WINDOW` entry in `LIMITATIONS-PLAN.md`. Results against the acceptance paragraph: [E8f results](#e8f-results). | E8a - E8e, E8g | Done | v0.15.0 |

### E8a results

**E8a (inventory, no code change).** Read against `DDS_Keyword_V7r6.txt` (`WINDOW` ~line 13583, `WDWBORDER` ~line 13293)
and `dspfEngine.resolveWindow` (~line 1262).

**The three forms.**

| Form | Position | Size | Resolved today |
|------|----------|------|----------------|
| `WINDOW(line pos lines positions [*MSGLIN\|*NOMSGLIN] [*RSTCSR\|*NORSTCSR])` | each of line and position is a number **or** `&field` | numbers | numbers: exact; any `&field`: placeholder |
| `WINDOW(*DFT lines positions [...])` | `*DFT` replaces **both** line and position as one token | numbers | placeholder |
| `WINDOW(record-format-name)` | inherited | inherited | exact, or the same placeholder as the record it names |

**Which parameters can be runtime-valued.**

| Parameter | Literal | `&field` | `*DFT` |
|-----------|---------|----------|--------|
| start line | yes | yes, **independently of the position** | yes (shared token) |
| start position | yes | yes, **independently of the line** | yes (shared token) |
| window lines | yes | no | no |
| window positions | yes | no | no |
| `*MSGLIN`/`*NOMSGLIN`, `*RSTCSR`/`*NORSTCSR` | yes | no | no |

So size is always known at design time; only the upper-left corner can be unknown. The field in a `&field` form must
exist in the record, be signed numeric (type S), usage P, length 3 or less (reference text). A search of
`keywordSpec.js` and `dspfWriter.js` found no guard for that; E8b should confirm and, if so, open it as its own task.

**What `*DFT` means at run time.** The system picks the start line and position, relative to the cursor location, like
an application help window. The exact rules are in IBM's *Application Display Programming* book, which is not part of
`DDS_Keyword_V7r6.txt`, so the preview cannot reproduce them. A design-time value is therefore a stand-in the designer
chooses, not a prediction.

**`WDWBORDER` interaction.** None on geometry. When both are on a record, the geometry stays on `WINDOW`, which must not
use the record-name form (reference: a warning is issued otherwise). The border ring is drawn around the window box
either way, so a preview position moves the border with the window.

**What the preview does today.** `resolveWindow` gives every runtime-valued window the fixed origin line 2, column 2
(`positionIsDefault`), staggered by 2 lines and 4 columns per window in compare mode, with a dashed border and
"position set at runtime" in the title. Two gaps:

1. **Mixed form loses the literal.** `WINDOW(4 &POS 9 30)` and `WINDOW(&LINE 20 9 30)` fall back to the placeholder
   for **both** coordinates, because the code tests the pair together. The model must hold line and position separately:
   a literal stays exact, only the runtime part takes a preview value. The dashed border stays while either part is unset.
2. **Resize drops options.** `setWindowGeometry` rewrites the text from the numbers only; a resize of
   `WINDOW(4 20 9 30 *NOMSGLIN *NORSTCSR)` gives `WINDOW(4 20 10 30)`. Opened as **E8g**. Moving or resizing is already
   refused for `&field` positions and for a position that is `*DFT` (height and width only), which E8d must decide about.

**Cases E8c must cover.** `*DFT`; both `&field`; `&field` line with literal position; literal line with `&field`
position; each with and without a stored preview value; record-name form inheriting from each of those; compare mode
with two or more runtime-valued windows.

**For E8b.** A namespace (for example `windowPosition`) in `IndicatorSim.VALUE_NAMESPACES`, keyed by record name, value
a line and a position that fit the display size (window must fit: line + lines + 1 within the rows, position +
positions + 3 within the columns). A record that names another window takes the stored value of the record it names.

### E8b results

**E8b (built, v0.14.2).** The value model for E8, in the E3f store; nothing is drawn differently yet.

- **Namespace `windowStart`** (`IndicatorSim.VALUE_NAMESPACES`). Key `RECORD|LINE` or `RECORD|POSITION`
  (`DspfEngine.windowStartKey`), value a whole number 1 - 132. One value per coordinate, so `WINDOW(4 &POS 9 30)` keeps its
  literal 4 and takes a stored value for the position alone (the E8a gap). The key is the record, not the field name, so a
  `*DFT` window and a `&field` window are stored the same way and renaming the field loses nothing.
- **`DspfEngine.windowStartParts(record)`** reads the record's own `WINDOW` keyword into `{ form, line, position, lines,
  positions, runtime }`, each coordinate `literal` / `field` / `dft`, and `runtime` lists the coordinates that need a value.
  It returns null for no `WINDOW`, the record-name form (that record takes the corner of the record it names, E8c) and a
  malformed keyword. Trailing `*MSGLIN` / `*NOMSGLIN` / `*RSTCSR` / `*NORSTCSR` are ignored.
- **Fit rule** (`windowStartMax`, `windowStartProblem`): the lower border is on line start + lines + 1 and the right border
  on position start + positions + 3 (reference, example 1), so on 24 x 80 a 9 x 30 window starts at line 14 or lower and
  position 47 or lower. The store accepts 1 - 132 because it does not know the display or the window; the fit is checked
  against the window and display size by `windowStartProblem`, and the engine (E8c) ignores a value that does not fit,
  as `CSRLOC` does.
- **Simulator panel.** The stored-value list shows the values (`WIN1 (window start line) = 6`) with the remove button and
  "Clear all stored values" with no panel change. The editor for them is E8d's job, as the E3f note says.
- **Not in this task.** Reading the values in `resolveWindow` and the dashed border for unset parts (E8c); the record-name
  form taking the stored value of the record it names (E8c); compare mode (E8e).
- Tests: `e8bWindowStartValues.test.js` (36 checks: every form, the fit limits on both display sizes, namespace keys and
  values, persistence, and that a stored value does not move a window yet).

### E8c results

**E8c (built, v0.14.3).** `DspfEngine.resolveWindow(record, dspfFile, depth, placeholderIndex, activeIndicators,
activeSizeName, displaySize)` takes a new last parameter, the display (`{ lines, columns }`); `resolveScreen` and
`resolveMultiScreen` pass theirs. With `dspfFile.windowStartValues` (the webview fills it from the E3f store in all three
places it already fills `cursorLocationValues`) each coordinate is resolved on its own:

| Coordinate in the keyword | Result |
|---------------------------|--------|
| literal | always exact; a stored value is ignored |
| `*DFT` or `&field`, value stored and `windowStartProblem` says it fits | the stored value |
| `*DFT` or `&field`, no value or one that does not fit | the placeholder (line 2, position 2, staggered per window in compare mode) |

- **Dashed border** (`positionIsDefault`) stays while any coordinate is on the placeholder, so a half-set window is still
  dashed. A new `previewStart` flag is true when a stored value was used; the window title then says "preview position"
  instead of "position set at runtime".
- **Mixed forms fixed.** `WINDOW(4 &POS 9 30)` and `WINDOW(&LINE 20 9 30)` keep their literal; only the runtime
  coordinate is a placeholder or a stored value (the gap E8a found).
- **Record-name form.** `WINDOW(W1)` takes the stored start of W1 (the recursion resolves W1 with W1's own key); a value
  stored under the referencing record is not used, because that record has no start of its own.
- **Display size.** The fit is checked on the display being drawn, so a start that only fits 27 x 132 is used there and
  ignored on 24 x 80. Callers that pass no display size (the four truthiness checks in the subfile code) get the
  placeholder as before.
- **Compare mode.** Each window uses its own stored values; windows without them keep the staggered placeholders.
  Replacing the stagger by chosen values for everything is E8e.
- **Fields** of a preview window are placed exactly as for the same window written out as literals (tested cell for cell).
- **Not in this task.** No editor for the values (E8d), so until then they can only come from the store itself; the
  move and resize handles on a window with a preview start still refuse a `*DFT` / `&field` position, as for a placeholder
  (E8d decides).
- **Decision (Manoj): keep the stricter, IBM rule.** The engine draws a window as a box of exactly lines x positions with the
  border inside it (`grid-row:6 / span 9` for `WINDOW(6 12 9 30)`), while the reference's own arithmetic puts the lower border
  on start + lines + 1 and the right border on start + positions + 3 (11 x 34 for 9 x 30, example 1). `windowStartMax` follows
  the reference, so a preview start is accepted only where IBM's full window fits; that stays. The drawn box size itself is
  unchanged here (pre-existing, affects literal windows too) and is not part of E8.
- Tests: `e8cWindowStartPreview.test.js` (37 checks: every form, display sizes, record-name form, markup, compare mode,
  the designer page loading stored values; 20 of them fail without the engine change).

### E8d results

**E8d (built, v0.14.4).** The editor for the E8b/E8c preview values. **Decision (Manoj, accepted the proposed default):**

1. **Set preview position.** A "Preview position" box in the Basic tab of a record whose own `WINDOW` start is runtime-valued
   (`DspfEngine.windowStartParts(record).runtime` not empty). One number box per runtime coordinate (`*DFT` and two
   `&field`s give both; a mixed form gives one); a literal start is listed as "fixed in the source". The box's `max` is
   `windowStartMax` for the display being drawn, a typed value is checked with `windowStartProblem` and a refusal shows its
   reason under the boxes (the store is not touched), an empty box removes that one value, and "Reset to placeholder" removes
   both. It works on a record that is not editable too, because it never touches the source.
2. **Drag.** The move handle is now active on a runtime-valued window (before: refused for `*DFT` / `&field`). A drag changes
   only the stored preview value: nothing is posted to the document, only the runtime axes move (a mixed form keeps its
   literal line or position), and the drag is clamped to the highest start at which the whole window still fits. The handle's
   tooltip says it moves the preview position only. A window with a fixed start still rewrites the `WINDOW` keyword, as before;
   a record-name window (`WINDOW(W1)`) is still inherited, so its handle stays off (set the position on W1).
3. **Resize is unchanged.** Height and width are always literals and still go to the source; keeping `*NOMSGLIN` /
   `*NORSTCSR` on resize is E8g.

- Code: `buildWindowPreviewStartHtml` / `wireWindowPreviewStart` and the `previewInfo` argument of `startWindowMove` in
  `buildWebviewTemplate.js`; no engine, writer or store change (the E3f store, the simulator panel list and compare mode work as
  they did).
- Tests: `e8dWindowPreviewPosition.test.js` (27 checks: the box for `*DFT` and the mixed form, fit check and reason, clear and
  reset, drag stored not written, literal axis kept, clamp, fixed-start window unchanged; the new-behaviour checks fail without the
  change).

### E8e results

**E8e (built, v0.14.5).** Compare mode and the preview positions. A window with chosen values was already drawn exactly
where chosen (E8c); what E8e fixes is the stagger of the windows that are still on the placeholder. Before, the stagger
step was the record's position in the compare list, so a chosen window, a fixed-start window, a record with no window and
a record not in effect each pushed the next placeholder along, and a backdrop placeholder window landed exactly on top of
the current record's own placeholder window (both at line 2, column 2). Now:

- **A slot is used only by a window that is really on the placeholder** (`positionIsDefault`, so a half-set window holds
  one). `resolveMultiScreen` counts the slots as it goes; the step itself is unchanged (2 lines, 4 columns per slot).
- **The current record's window counts first.** `resolveMultiScreen` takes `options.placeholderSlotsUsed`; the designer's
  compare backdrop passes 1 when the current record is itself on the placeholder, so the dimmed windows start at the second
  slot. Give the current record a preview position and the first backdrop window takes the first slot.
- **Unchanged:** nothing chosen and no other window in the list gives the same first, second, third slots as before; the
  read-only full overlay (`writeSequence`) call passes no held slot.
- **Not in this task.** Choosing the values for a dimmed record's window is still done on that record (select it, then
  Preview position); the shared record-name form follows the record it names as before. E8g and E8f remain.
- Tests: `e8eCompareModeValues.test.js` (14 checks: every slot rule, the held-slot option, the designer page; 6 fail without
  the change).

### E8g results

**E8g (built, v0.14.6).** `DspfWriter.setWindowGeometry` kept only the geometry numbers, so a resize (or a move) of
`WINDOW(4 20 9 30 *NOMSGLIN *NORSTCSR)` wrote `WINDOW(4 20 10 30)`. It now appends every token after the four geometry
tokens (after the three for `*DFT`) exactly as typed (`*MSGLIN` / `*NOMSGLIN`, `*RSTCSR` / `*NORSTCSR`, one or both).

- Nothing else changes: moving a `*DFT` window is still refused, a `&field` start still cannot be moved or resized, the
  record-name form still points at the record it names, and a window with no trailing option is rewritten as before.
- A long keyword wraps onto a continuation line at column 80 as it always did; the options survive the wrap.
- Tests: `e8gWindowGeometryKeepsOptions.test.js` (11 checks: both forms, move, resize, move and resize, one and both options,
  the refusal that remains, and a real resize drag on the designer page; 8 fail without the change).

### E8f results

**Released as v0.15.0.** The acceptance paragraph for the epic, checked against the code and the tests of the tree it ships
in (v0.14.6 plus the E8f claim):

1. *Every runtime-valued `WINDOW` form listed in E8a can be given a preview value.* **Met.** The forms are `*DFT` (one
   token for both coordinates), `&field` for the line, `&field` for the position, and the mixed forms; size, `*MSGLIN` /
   `*NOMSGLIN` and `*RSTCSR` / `*NORSTCSR` are always literals. The values live in the E3f store (`windowStart`
   namespace, E8b), the engine resolves each coordinate on its own (E8c), and the Basic tab's "Preview position" box and the
   move handle set them (E8d); `WINDOW(record-format-name)` takes the value chosen on the record it names.
   `e8bWindowStartValues.test.js`, `e8cWindowStartPreview.test.js` (37 checks), `e8dWindowPreviewPosition.test.js` (27).
2. *The dashed placeholder remains the default.* **Met.** With nothing stored the window is drawn at line 2, column 2
   with the dashed border exactly as before, and the border stays while either coordinate is unset (E8c).
3. *Nothing is written to the source.* **Met.** A preview value is stored in workspace storage only; a drag on a
   runtime-valued window posts nothing to the document (E8d). A window with a fixed start still rewrites `WINDOW` on move
   and resize, as it always did, and E8g makes that keep the trailing `*NOMSGLIN` / `*NORSTCSR`
   (`e8gWindowGeometryKeepsOptions.test.js`, 11 checks).
4. *Compare mode uses the chosen values instead of staggering placeholders.* **Met.** A window with chosen values is drawn
   where chosen; the stagger applies only to windows still on the placeholder, and the current record's own placeholder
   window holds the first slot (E8e, `e8eCompareModeValues.test.js`, 14 checks).
5. *The accepted-limitation entry is rewritten.* **Done.** The `WINDOW` entry in `LIMITATIONS-PLAN.md` now says what the
   preview does and what it cannot know.

**What the preview does not do (kept in the limitation entry).** For `*DFT` the system chooses the position at run time
from the cursor location by rules that are in IBM's *Application Display Programming* book and not in the DDS Reference, so
a preview value is a stand-in the designer chooses, never a prediction. A preview start is accepted only where IBM's full
window (start + lines + 1, start + positions + 3) fits the display being drawn (E8c decision), and the drawn box size itself
is unchanged. Choosing a value for a dimmed compare record is still done on that record.

**Open from E8a, not part of this release.** No guard checks that the field named in a `&field` start is signed numeric,
usage P, length 3 or less (E8a looked for one and found none).

---

## E9

**`EDTCDE(Y/W)` separator width**

**Goal.** `EDTCDE(Y)` and `EDTCDE(W)` fields are left at their coded length because the separator width depends
on the job's `DATSEP` attribute. The extension already reads the connected job's date format and separator
(`src/jobDateFormat.js`, used by the `DATE` keyword preview); extend that to these edit codes, with a setting as
the offline fallback.

**Acceptance for the release.** With a connection, `Y`/`W` fields render at the exact width for the job's
separator; offline, the width follows a setting and the panel says which source was used; the limitation entry
is rewritten.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E9a | **Rules.** From the `EDTCDE` section of the DDS Reference: what `Y` and `W` insert, how many positions each adds for 6-digit and 8-digit (and 4-digit, if allowed) fields, whether the separator is the job's `DATSEP` in both cases, and what changes with `DATFMT`. Output: a table in this section used as the test oracle. | - | Done (no code change) | — |
| E9b | **Separator source.** Reuse `fetchJobDateFormat()`; add a setting `isda.previewDateSeparator` (`/`, `-`, `.`, `,`, blank) for offline use; define precedence (job, then setting, then default) and keep the "proxy for the job the screen will run in" caveat. | E9a | Done | v0.13.0 |
| E9c | **Engine.** Use the separator in `editCodeDisplay` / display length for `Y` and `W`; output positions of the separators inside the rendered value; the `keywordSpec.js` `editCodeDisplay` entries lose their "runtime separator" marker only where now resolved. Tests against the E9a table. | E9a, E9b | Done | v0.13.0 |
| E9d | **UI.** A note in the field panel showing the separator source (job / setting / default); delete the corresponding text from the accepted-limitations list. | E9c | Done | v0.13.0 |
| E9e | **Release** (next free minor). | E9a - E9d | Done | v0.13.0 |

### E9 results

**E9a (rules, no code change).** The `EDTCDE` section of the DDS Reference (notes 2 and 3 of Table 6) gives the
patterns below; they were already in `keywordSpec.js` as `DATE_EDIT_CODE_PATTERNS` (I-154) and the engine already
sized `Y`/`W` fields from them, so the "left at coded length" text in `LIMITATIONS-PLAN.md` was stale. Widths are the
pattern lengths and do not depend on the separator character. A digit count with no pattern, or a field with
decimals, keeps its coded length.

| Code | Digits | Pattern | Width |
|------|--------|---------|-------|
| Y | 3 | `nn/n` | 4 |
| Y | 4 | `nn/nn` | 5 |
| Y | 5 | `nn/nn/n` | 7 |
| Y | 6 | `nn/nn/nn` | 8 |
| Y | 7 | `nnn/nn/nn` | 9 |
| Y | 8 | `nn/nn/nnnn` | 10 |
| W | 5 | `nn/nnn` | 6 |
| W | 6 | `nnnn/nn` | 7 |
| W | 7 | `nnnn/nnn` | 8 |
| W | 8 | `nnnn/nn/nn` | 10 |

**Decision (Manojkumar, E9 start): follow the job's `DATSEP` for both `Y` and `W`.** The Reference ties the job
attribute `DATSEP` to `EDTCDE(Y)` with `DATE` only, and says `W` inserts slashes. The epic as written applies the
separator to every `Y`/`W` field, so `W` follows it too (one place to revert: `systemValuePreviewText` in
`keywordSpec.js`). Checked against the Reference's own zero-suppression sentences
(Y: one left zero, two at 7 digits; W: one at 5 digits, three at 6 - 8, stopping at the first non-zero digit): the
engine agrees at every length, so there is no open finding; the cases are pinned in the E9 test.

**E9b - E9d (built).** `KeywordSpec.resolveDateSeparator(job, setting)` picks the separator: the connected job's
`DATSEP`, then the new `isda.previewDateSeparator` setting (`/ - . ,` or `blank`; unset by default), then `/`.
The webview gets the setting on `ready` and on a live change. `EDTCDE(Y/W)` field panels show a note naming the
source. The separator changes only the character drawn, never the width. Tests: `e9DateEditSeparatorSource.test.js`.

---

## E10

**`CHCCTL` / `SFLCHCCTL` choice control values**

**Goal.** `CHCCTL` and `SFLCHCCTL` set a choice's state at run time from a program-to-system field
(`0` available/unselected, `1` selected, `2`-`4` unavailable variants; the value table is already in
`keywordSpec.js` as `CHOICE_CONTROL_VALUES`). The accepted limitation says `CHCCTL` has "no visual
representation". Give the designer a way to set that value for the preview so the choice renders in the state the
program would give it, using `CHCAVAIL`, `CHCUNAVAIL` and `CHCSLT`.

> **To confirm with Manojkumar in E10a:** the request called this "the missing field-level indicator for
> `CHCCTL`". The reference describes a control *field value*, not an option indicator. E10a pins down exactly
> which gap was meant (preview state, a panel row, or a guard) before E10b - E10d are scoped.

**Acceptance for the release.** A choice field or subfile choice with `CHCCTL` / `SFLCHCCTL` can be previewed in
each state of the value table; the panel exposes the control field and choice number with the structural guards
the reference requires; the limitation entry is rewritten.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E10a | **Audit and scope.** What `CHCCTL` and `SFLCHCCTL` already have (spec entries, panel rows, guards such as the I-171 family) vs what the reference requires; pin down the gap named in the box above; list what each state looks like with and without `CHCAVAIL` / `CHCUNAVAIL` / `CHCSLT`; note that the cursor-restriction values only apply to an enhanced-interface controller. | - | Done (no code change) | — |
| E10b | **Advisory and help line.** The panel row, type check and raw-editor guards already exist (E10a). Add: a non-blocking advisory when a `CHCCTL` control field is not defined in the record (forward references stay accepted while typing), and one help line under the control field giving the 0 - 4 value table from `CHOICE_CONTROL_VALUES` with the enhanced-interface cursor note. Tests in a new `e10` file. | E10a | Done | v0.13.1 |
| E10c | **Preview states.** Draw a choice as available / selected / unavailable in the preview (radio, checkbox and push button), applying `CHCAVAIL`, `CHCUNAVAIL` and `CHCSLT` colours and attributes under the reference's own conditions; 2, 3 and 4 draw the same. The state comes from a preview-only per-choice selector in the field panel, held in the webview and not saved, defaulting to available so existing previews do not change. Unit tests for `0` - `4`. | E10a | Done | v0.13.2 |
| E10d | **`SFLCHCCTL`.** The same for subfile choice lists (`SFLSNGCHC` / `SFLMLTCHC`), including the structural requirements already in the spec. | E10c | Done | v0.13.3 |
| E10e | **Release** (next free minor); rewrite the `CHCCTL` entry in `LIMITATIONS-PLAN.md`. Results against the acceptance rule: [E10e results](#e10e-results). | E10a - E10d, E10f | Done | v0.14.0 |
| E10f | **Control value from the E3f store.** Replace E10c's preview-only selector with the design-time control value kept in the E3f store, keyed by file, record and control field; the selector becomes the editor for that value. Same default (available) when no value is set. | E10c, E3f | Done | v0.13.4 |


### E10a results

**E10a (audit and scope, no code change).** Read against `DDS_Keyword_V7r6.txt` (`CHCCTL` ~line 2833,
`SFLCHCCTL` ~line 10566, Tables 3 and 11, which print the same 0 - 4 value table).

**What already exists.**

| Area | `CHCCTL` (selection field, push-button field) | `SFLCHCCTL` (subfile record) |
|------|-----------------------------------------------|------------------------------|
| Spec | `RECORD_TYPES.CHCCTL`: choice 1 - 99, control field Y / 1 / 0 / `H` in the same record, message shapes, `CHOICE`/`PSHBTNCHC` companion, option indicators not valid; `CHOICE_CONTROL_VALUES` | `RECORD_TYPES.SFLCHCCTL`: first field, one per record, Y / 1 / 0 / `H`, `SFLNXTCHG` mutex; same `CHOICE_CONTROL_VALUES` |
| Panel | Per-choice text input for the control field plus message id / file / library on selection fields (`choiceKeywordRowHtml`); a separate `CHCCTL` editor on push-button fields | A checkbox on the field (`subfileFieldKeywordsHtml`) that sets Y / 1 / 0 / `H` when turned on |
| Guards | I-171 (control-field type, matching `CHOICE` / `PSHBTNCHC`), I-183 (number range, message-field shapes) | I-79 (shape, first field, one per record), I-86 (`SFLNXTCHG`), I-87 (reorder) |
| Preview | none | none |

**The gap.** The designer already lets you write and validate both keywords. What is missing is the *preview
state*: the preview draws a single-choice list with its first choice marked and a multiple-choice list with every
box empty, a push button always the same way, whatever the control value would be. `CHCAVAIL`, `CHCUNAVAIL` and
`CHCSLT` also have editors (I-65) but nothing in the preview applies their colours; `dspfEngine.js` never reads
them. So E10c is two jobs, not one: (1) draw a choice in the selected / unavailable state at all, and (2) apply the
state keywords to it. `LIMITATIONS-PLAN.md` ("no visual representation") is accurate for that reason.

**What each control value should look like** (reference text, applies to both keywords):

| Value | On output | Preview |
|-------|-----------|---------|
| 0 | available | normal; `CHCAVAIL` colour / attributes if present |
| 1 | selected | selected glyph; `CHCSLT` where the reference allows it (menu bar, or `PULLDOWN(*NOSLTIND)` selection field, or a subfile list) |
| 2, 3, 4 | unavailable | `CHCUNAVAIL` (default blue on a selection field; on monochrome the first character is overwritten with `*`); 2 / 3 / 4 differ only in cursor restriction |

The cursor restrictions (2 and 4) apply only on a controller with the enhanced interface, and the preview has no
cursor model, so 2, 3 and 4 render identically; the panel should say so. On input, 0 means unselected.

**Reading of "the missing field-level indicator for `CHCCTL`".** Not a missing option indicator: the reference says
option indicators are *not valid* for `CHCCTL` and `SFLCHCCTL`, and the spec already enforces that. The closest
real gaps, in the order I would pick them:

1. **A design-time value for the control field** that sets the preview state (the E3f store). This is the only
   one that gives the designer something visible, and it is what the epic's goal describes.
2. A **per-choice state toggle in the preview** (a quick "show unavailable" switch), if E3f is not wanted for this.
3. A guard gap: a `CHCCTL` naming a control field that is not defined yet is accepted as a forward reference
   (pinned by the I-171 and I-183 tests), so a typo is never reported. A file-level "control field not defined in
   this record" advisory would close it without refusing forward references while typing.

**Scope changes for the other sub-tasks.**

- **E10b** is smaller than written: the `CHCCTL` panel row, the field-existence-free type check and the raw-editor
  guards are already there. What remains is gap 3 (advisory) and, if wanted, one control-value help line.
- **E10c** is the main work and is blocked on E3f (still Open, itself waiting on the E3c storage decision). It
  should be split in two: the unavailable / selected drawing with `CHCAVAIL` / `CHCUNAVAIL` / `CHCSLT` applied
  (needs no store, can use a fixed default), then the store-driven value.
- **E10d** (`SFLCHCCTL`) only needs the subfile list drawing to take a per-record control value; the subfile
  preview repeats the record, so it also needs a decision on whether one value applies to every row or one per row.

**Decision (Manojkumar, after E10a): gap 1 is what was meant** - a design-time control value that sets the
preview state. E10c ships the drawing with a preview-only selector first, so it does not wait for E3f; E10f (new,
the next free letter) moves the value into the E3f store once that exists. E10b is reduced to the advisory and help line.


**E10b (built, v0.13.1).** `DspfWriter.chcctlUndefinedControlFieldNotes(fieldKeywords, recordFields)` returns one
note per `CHCCTL` whose control field is named but not defined in the record; the selection-field and push-button
`CHCCTL` panels show it as a `.hint-small.warn` line. It is an advisory only: a forward reference is still accepted
(pinned by the I-171 and I-183 tests), and a `CHCCTL` with no choice number is left to the existing number guard.
`KeywordSpec.choiceControlValues(name)` returns the shared 0 - 4 table (a copy) and
`DspfWriter.choiceControlValueHelp(name)` turns it into the help line, with the enhanced-interface note and the
remark that the preview draws 2, 3 and 4 the same. Both panels take the record's fields as a new last argument; with
none given there is no warning, so other callers are unchanged. Tests: `e10bControlFieldAdvisory.test.js`.


**E10c (built, v0.13.2).** `DspfEngine` reads `dspfFile.choicePreviewStates` (`{ 'RECORD|FIELD|number': value }`, keys
from `DspfEngine.choiceStateKey`) and gives each radio, checkbox and push-button choice a `stateValue`, `stateName`
(`available` / `selected` / `unavailable`) and `stateStyle` from `CHCAVAIL` / `CHCSLT` / `CHCUNAVAIL`, honouring their
option indicators; an unavailable choice with no `CHCUNAVAIL` takes the spec's default blue
(`KeywordSpec.choiceStateDefaultColor`). With no state set a single-choice list still marks its first entry and a
checkbox list stays empty; once a field has any state set, a choice is marked exactly when its value is 1. A choice
that is available with a `CHCAVAIL` is now drawn in that colour even with no state set (before, nothing drew these
keywords). The webview holds the values in `choicePreviewStates` (cleared by `resetViewState`), sets
`model.choicePreviewStates` before each engine call, and shows a "Preview state (CHCCTL)" accordion with one select
(default, 0 - 4) per choice that has a `CHCCTL`. 2, 3 and 4 draw the same. Not done here: the subfile selection
list (E10d), the stored value (E10f), `CHCSLT` rules for where a selected colour is allowed (the I-171 guard already
refuses it elsewhere). Tests: `e10cChoicePreviewStates.test.js`.


**E10d (built, v0.13.3).** For a control record with `SFLSNGCHC` / `SFLMLTCHC` whose subfile record has an
`SFLCHCCTL` field, each previewed row takes its control value from `dspfFile.choicePreviewStates`
(`choiceStateKey(subfileRecord, controlField, row)`, rows numbered from 1), so it reuses E10c's store, state names and
`choiceStateStyle`. The colour keywords are read from the control record (the reference's own placement) and from the
subfile record's fields. A row with a state is tagged on its output field(s) (`rowState`); with `*SLTIND` it also gets
a `data-choice-marker` (`( )` / `(` + `\u25CF` + `)` for single choice, `[ ]` / `[X]` for multiple), drawn by a CSS
`::before` so the layout does not move. `*NOSLTIND` (the default) draws no marker, as the reference says. The
selector is on the control record's SFLCTL tab because the hidden control field is never drawn; it has one select per
previewed row (SFLPAG, at most 24). Only the folded form is affected (`SFLDROP` / `SFLFOLD` are not allowed with a
selection list). Tests: `e10dSflChoiceStates.test.js`.


**E10f (built, v0.13.4).** The control value is the E3f store's `choiceControl` namespace instead of a webview-only
object: the per-choice and per-row selectors (E10c / E10d) now write it through `setFieldValue`, which validates (0 - 4),
persists the file's state to the extension host (workspaceState) and redraws; the engine still reads it as
`dspfFile.choicePreviewStates` (`IndicatorSim.namespaceValues`), so the drawing, the keys and the defaults are
unchanged. A value therefore survives closing and reopening the designer, can be removed from the simulator panel's
stored-values list, and is dropped by `resetViewState` on the page only (the stored state is not touched by it). The
value is never written to the DDS source. Tests: `e10fStoredControlValue.test.js`.


### E10e results

**Released as v0.14.0.** The acceptance rule for the epic, checked against the code and the tests of the tree it ships in
(v0.13.13 plus the E10e claim):

1. *A choice field with `CHCCTL` can be previewed in each state of the value table.* **Met.** The field panel's per-choice
   selector (E10c) writes the control value 0 - 4 into the E3f store (E10f); the engine draws 0 as available, 1 as selected
   and 2, 3 and 4 as unavailable, applying `CHCAVAIL`, `CHCSLT` and `CHCUNAVAIL` colours and attributes, for radio buttons,
   check boxes and push buttons. `e10cChoicePreviewStates.test.js` (31 checks).
2. *A subfile choice with `SFLCHCCTL` can be previewed in each state.* **Met.** A selection-list subfile
   (`SFLSNGCHC` / `SFLMLTCHC`) previews each row in the state its control value gives, with the `*SLTIND` markers; one
   selector per previewed row on the control record's SFLCTL tab (E10d). `e10dSflChoiceStates.test.js` (27 checks).
3. *The panel exposes the control field and choice number with the structural guards the reference requires.* **Met.** The
   panel row, type check and raw-editor guards were already there (E10a: the I-65, I-79, I-86, I-87 and I-171 families);
   E10b added the non-blocking advisory for a control field that is not defined in the record and the help line with the
   0 - 4 table. `e10bControlFieldAdvisory.test.js` (28 checks) and `i122gChoiceFamily.test.js` (154 checks).
4. *The limitation entry is rewritten.* **Done.** The `CHCCTL` entry in `LIMITATIONS-PLAN.md` no longer says there is no
   visual representation; it says what the preview does and what it cannot know.

**What the preview does not do (kept in the limitation entry).** The value is a program-to-system value at run time, so the
designer holds a design-time stand-in (per file, record and control field, workspace storage) that is never written to the DDS
source, and defaults to available. Values 2, 3 and 4 draw alike: they differ only in whether the cursor may be placed on the
choice, and that is not drawn (the reference says these cursor-restriction values apply only to an enhanced-interface
controller).

**Original question for E10a** ("the missing field-level indicator for `CHCCTL`"): settled in E10a - the reference describes
a control field value, not an option indicator, and the gap was the preview state, which E10c - E10f fill.

---

## E11

**System/36 `DSPF36` (SFGR) source in the designer and the editor**

**Goal.** A `DSPF36` member (or a `.dspf36` file) holds System/36 screen format generator (`$SFGR`) source, not DDS.
Today the extension only registers the extension and compiles it with `CRTS36DSPF` (S36-1, S36-5); the designer's
DDS parser reads the text as DDS and produces nonsense (checked on `source/stipfm.dspf36`: one record named
"une liste" with a field named "1367Y"). Give `DSPF36` source its own reader and writer, draw it in the existing
preview, edit it in the existing designer, and give the text editor SFGR-aware help, so S/36 display formats are
designed visually with the same quality as `DSPF` / `DSPF38`.

**Sources (in the repo, commit 344c171).** `docs/sda-reference/source/sc414730.pdf` (*System/36 Environment
Programming* V3R6; Appendix B, "$SFGR Specification Forms", and chapter 14, "Differences between System/36 SFGR and
DDS"), `sc414731.pdf` (*System/36 Environment Reference*; the `FORMAT` procedure and the `$SFGR` utility, Appendix D
SFGR messages) and the sample `stipfm.dspf36` (549 lines, French, CRLF, uses the continuation column). Convert the
PDFs with `pdftotext -layout` as for the DDS reference; the page layout is two-column, so column ranges are checked
against the sample, not taken from the text alone.

**What the source looks like.** Fixed columns, 80 wide, lines right-trimmed. Column 6 is the specification type: `S`
display control (format name 7 - 14, start line 17 - 18, lines to clear 19 - 20, alarm 25 - 26, enable function and
command keys 27 - 28, 132-column 39, key mask 64 - 79), `D` field definition (name 7 - 14, length 15 - 18, line 19 - 20,
column 21 - 22, output data 23 - 24, input allowed 26, data type 27, attributes 37 - 49, constant type 56, constant
text 57 - 79, continuation `X` in 80), `H` help area, `*` comment lines and `*DDS` pass-through lines. Several formats
stack on one screen through start line and lines to clear. The full column tables, checked against the sample, are in
[`SFGR-SPEC.md`](SFGR-SPEC.md) (E11a).

**Acceptance for the release.** `stipfm.dspf36` opens in the designer and every format draws with its constants and
fields in the right place, with the field attributes the source gives; every field, constant and format can be added,
moved, edited and deleted from the panels, and saving writes valid SFGR source in which every untouched line is
byte-identical to the original; DDS-only features do not appear for a `DSPF36` file; the text editor shows SFGR
diagnostics, hover and an outline; a failed `CRTS36DSPF` puts its messages on the right source lines; DDS tooling
never runs on SFGR source and SFGR tooling never runs on DDS.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E11a | **Specification and decisions.** **Decision first.** Write `docs/sda-reference/SFGR-SPEC.md`: the column tables for the S, D and H specs and the `*DDS` and comment lines, each value with its meaning, valid range and the DDS keyword (or none) it corresponds to; the continuation rule; which SFGR features have no DDS-model equivalent; every claim checked against `stipfm.dspf36`. Proposal and Manojkumar's answer to record in this section: (1) one shared model with SFGR as a second reader/writer, versus a separate model; (2) how a `DSPF36` file is told apart from DDS (extension, member source type, content sniff); (3) whether `*DDS` lines are shown as opaque blocks or parsed as DDS; (4) whether a "convert to DDS" command is in scope. May land as `Done (no code change)`. | - | Done (no code change) | - |
| E11b | **Format detection and guards.** Language id and file association for `.dspf36` and `DSPF36` members; one `isSfgrSource(uri, text)` helper; DDS diagnostics, hover, completion, outline and quick-fix providers (E1) and the DDS designer path stop running on SFGR source (today they produce false errors on it). Settings stay as they are. | E11a | Done | v0.18.2 |
| E11c | **Parser.** New pure module `src/sfgrParser.js`, no `vscode` import: source text in, formats out (S spec, D specs, H specs, comments, `*DDS` blocks), each carrying its original line text and line numbers, continuation lines joined, CRLF and LF kept as found. Reports unreadable lines instead of throwing. Tests read `stipfm.dspf36` and small hand-made fixtures. | E11a | Done | v0.18.1 |
| E11d | **Writer.** New pure module `src/sfgrWriter.js`: edit operations (set a column value, add, delete and move a spec, split and join continuation lines) that touch only the lines they change; untouched lines stay byte-identical, including trailing text in columns 64 - 80 and sequence numbers. Round-trip test over the whole sample. | E11c | Done | v0.18.4 |
| E11e | **Model and engine mapping.** Fill the existing record and field model (`dspfModel.ts`) from SFGR formats so `dspfEngine.js` draws them: one format = one record, constants and fields placed by row and column, output-data indicators 01 - 99 as conditions, 80- and 132-column formats. Where SFGR has a concept the DDS model lacks, extend the model rather than encode it in keywords. | E11c | Done | v0.18.3 |
| E11f | **Preview fidelity.** Draw the SFGR display attributes (high intensity, blink, nondisplay, reverse image, underline, column separators, lowercase), the start line and lines-to-clear stacking of several formats on one screen (Figure B-2), and the visual markers for input, output and input/output fields. Reuse the E3 simulator conditions for the indicators. | E11e | Done | v0.18.5 |
| E11g1 | **Designer panels, slice 1: wiring, read-only.** Open SFGR in the designer (the E11b notice goes): the host sends `sourceKind`, the page routes every parse through `parseSource`, SFGR modules embedded; canvas, simulator and exports work; DDS-only edit controls hidden or disabled with one banner; title button and lens back for `.dspf36`. See "E11g plan and decisions". | E11d, E11e, E11f | Done | v0.18.6 |
| E11g2 | **Designer panels, slice 2: format (S spec) panel**, with the key-mask editor; edits through `SfgrWriter.setValue`. | E11g1 | In progress | - |
| E11g3 | **Designer panels, slice 3: field and constant (D spec) panel**, constants through `setConstant`; values checked against the E11a ranges. | E11g1 | Open | - |
| E11g4 | **Designer panels, slice 4: help (H spec) panel and clean-up**: `*DDS` block locked, DDS-only panels and tabs absent for SFGR, SFGR labels. | E11g2, E11g3 | Open | - |
| E11h | **Editing operations.** Click-to-place and drag of fields and constants, new format, delete, duplicate, reorder, resize on the grid, undo and redo, all through the E11d writer; the Raw editor tab edits SFGR text with column rulers. | E11g | Open | - |
| E11i | **Simulator, export and batch.** The E3 indicator simulator, the E5 exports (SVG, HTML, PNG, text) and the batch export work on SFGR source; the saved scenarios stay outside the source (see "Source stays clean"). **Scope (Manojkumar, decided): host side + engine/export now** (batch and export commands routed by source kind, column separators in the SVG, HTML and text exports as a line / `|`, the 5292 colour mapping in the engine); the page-side simulator and export buttons follow E11g1 and are checked in a final test then. | E11f | In progress | - |
| E11j | **Editor language support.** SFGR rule checks as diagnostics (column values out of range, duplicate format names, field outside the screen, overlapping fields, key mask without the matching enable column, unmatched continuation), hover on a column (what it is and the allowed values), outline of formats and fields, quick-fix for the most common violations; same settings pattern as E1. | E11b, E11c | Open | - |
| E11k | **Compile messages.** Parse the `CRTS36DSPF` result (the `$SFGR` listing and the SYX messages of Appendix D of the Reference) and put the messages on the source lines, through the E2 diagnostics hub under source `CRTS36DSPF`. **Needs a real failing `CRTS36DSPF` listing as a fixture** (open question 3); until it arrives the parser can only be written against stand-in text, marked as such. | E11c, E2 | Open | - |
| E11l | **Release** (next free minor); update `README.md` (features, file types), `LIMITATIONS-PLAN.md` (S36 entries that this epic closes), `CHANGELOG.md`. Results against the acceptance rule above. | E11a - E11k | Open | - |


### E11a results

**Status.** The specification is written: [`SFGR-SPEC.md`](SFGR-SPEC.md) holds the S, D and H column tables, the
continuation rule, the key mask tables, the data type mapping and the line and encoding rules, each checked against
`stipfm.dspf36` or marked as manual-only. Findings that change the plan:

- 46 of the sample's 542 D lines are continuation lines (text from column 7), which is why the DDS parser invents
  fields on this file; the parser (E11c) has to join them before reading columns.
- Lines are right-trimmed, so the writer (E11d) must treat missing columns as blanks and never pad a line it did not
  change.
- The manuals give no SFGR-to-DDS keyword table, so the mapping to the designer's model is defined in E11e.
- The sample has no H spec, comment or `*DDS` line; those three rest on the manual and need their own fixtures.
- The manual's key mask table (2 = Page Down, 3 = Page Up) contradicts its own worked example on page B-8.

**Decisions (all accepted as proposed by Manojkumar).**

| # | Question | Proposal | Answer |
|---|----------|----------|--------|
| 1 | Model | One shared record and field model with SFGR as a second reader and writer; extend the model where SFGR has a concept DDS lacks | Accepted as proposed (Manojkumar) |
| 2 | Detection | Extension and member source type `DSPF36` first, content check (column 6 only `S` / `D` / `H` / `*`) as the fallback | Accepted as proposed (Manojkumar) |
| 3 | `*DDS` lines | Preserved in place and shown as a locked item; not parsed as DDS | Accepted as proposed (Manojkumar) |
| 4 | Key mask | Use the manual's table (2 = Page Down, 3 = Page Up) and note the contradiction | Accepted as proposed (Manojkumar) |
| 5 | DBCS and WSU-only entries | Read and kept as found; no designer support in E11 | Accepted as proposed (Manojkumar) |
| 6 | Convert to DDS | Out of scope for E11 | Accepted as proposed (Manojkumar) |

E11a is `Done (no code change)`: the specification and the decisions are recorded.


### E11b results

**E11b (format detection and guards).** New `src/sourceKind.js` (UMD, no `vscode`; copied to `dist/` by `build:webview-assets`) and `src/test/e11bSourceKind.test.js`; `extension.ts` asks it before any DDS tool runs.

**Decisions.**
- **The source type decides first** (E11a, answer 2): a `DSPF36` member or `.dspf36` file is SFGR; `.dspf`, `.dspf38`, `.mnudds` and any other known type are not, whatever the text looks like. Only with no type to read does the text decide: every record line has `S`, `D` or `H` in column 6 and at least one is an `S` (SFGR), or has `A` there and none of the three (DDS); anything else is unknown.
- **One refinement to answer 2:** a `.dspf36` file whose text is DDS stays DDS. This project used `.dspf36` for DDS files before S36-5 (LIMITATIONS-PLAN.md, S36-1 and S36-5), and those keep their diagnostics, lens and designer. A new empty `.dspf36` file is SFGR.
- **The text is read lazily:** never for a known non-`DSPF36` type, once for `DSPF36` (to spot DDS content) or when there is no type. A test document without `getText` is treated as having no text.

**What changed in the extension.** `isDdsTextDocument` (which gates the diagnostics, hover, completion, outline, quick-fixes and column aids) and `isLikelyDisplayFile` / `isLikelyMenuFile` (the **Open Screen Design** and **Open Menu Design** lenses and the quick-fix's designer target) return false for SFGR. The editor title button no longer matches `.dspf36` by extension (a `member:` or `streamfile:` document still shows it, and the command itself checks). **Open Screen Design** on SFGR shows "this is System/36 DSPF36 (SFGR) source, not DDS ..." and reopens the file as text. **Open With > iSDA Screen Design** on it shows a short notice page with no script instead of the DDS reading of the file. `compileDspf` is unchanged (it already chose `CRTS36DSPF` by the member's type, S36-5).

**Checked.** The DDS diagnostics report errors on `stipfm.dspf36` ("Field found before any record format", one per line), which is what the guard removes; the new tests fail without the `extension.ts` change (7 checks) and pass with it. E11g re-enables the designer for SFGR and replaces the notice.

### E11c results

**E11c (parser).** New `src/sfgrParser.js` (UMD, no `vscode`, no other module), tested by `src/test/e11cSfgrParser.test.js` (84 checks). Nothing calls it yet: the model mapping (E11e), the writer (E11d) and the diagnostics (E11j) are its users, so it is not in the `build:webview-assets` copy list yet (add it with the first caller that runs in the extension host or the webview).

**API.** `SfgrParser.parse(text)` returns `{ bom, eol, lines, entries, formats, problems }`. `lines` are the physical lines as found (text, number, line end); `entries` cover every line exactly once, in order, as `S`, `H`, `D`, `comment`, `dds` (a run of adjacent `*DDS` lines), `blank` or `unreadable`; `formats` group them by S specification (`s`, `help`, `fields`, `entries`, first and last line). Every entry carries `raw` (the original text of each of its lines), `lines`, `specType` and `format`. `toText(result)` writes the source back byte for byte. Helpers: `columnText`, `decodeColumn` (`A0` .. `D2` = 100 .. 132), `decodeKeyMask` (the manual's table, 2 = Page Down, 3 = Page Up) and the frozen column tables `S_COLUMNS`, `H_COLUMNS`, `D_COLUMNS` for the writer and the panels.

**What it reads.** Column values by range (`values`, trimmed; the constant text untrimmed), the numbers (`numbers`: start line, lines to clear, field length, line, column, null when blank or unreadable), H corners (`upperLeft`, `lowerRight`), message constants (`message.id`, `message.member`) and `role` (`constant` for type `C` or `M`, else `field`). Nothing is range-checked: a length of 9999 reads as 9999; E11j owns the rules.

**Continuation.** A D line with `X` in column 80 joins the next line when that line has `D` in column 6 (any text from column 7, so `* ...` after an `X` line is text, which is why a comment cannot follow one). The joined lines are one D entry (`lines`, `continuationLines`) and `constantText` is the whole constant: a piece that is followed by another keeps its full width, so blanks at the join survive although the file trims them; the end of the constant is trimmed (a constant of blanks reads as the empty string; its width is the field length).

**Problems, never an exception.** `unknownType` (error: column 6 is not S, H or D, e.g. DDS source), `orphanSpec` (error: D or H before the first S; kept, in no format), `unmatchedContinuation` (error: `X` and no D line after it), `notNumeric` (warning, with the column), `lineTooLong` (warning: text past column 80, kept in `raw`, not read), `tab` (warning). Each has a line, a column, a severity and a message. Non-string input reads as empty.

**Findings from the sample that change SFGR-SPEC.md** (corrected in the same commit). (1) The sample's last line **does** end with CRLF (549 lines, 549 CRLF); the spec said it did not. A source without a final line end reads the same and comes back without one. (2) A continuation line can carry `X` and continue again: four chains of three, two, two and two continuation lines (lines 177 - 180, 463 - 465, 468 - 470, 472 - 474), all blank-run constants. The 46 continuation lines are still 46 of the 542 D lines. (3) The blank-run constant on line 3 has no text at all; its width is the field length.

**Decisions.**
- **A `*DDS` run is one entry.** Adjacent `*DDS` lines are one block (`ddsLines` has each as the generator writes it: `A` in column 6, a blank in column 7); a writer moves or keeps the block whole. Column 6 of a `*DDS` line is not constrained.
- **A line with nothing from column 6 on is blank**, whatever is in the sequence columns, and is not a problem.
- **Trailing comments and blanks belong to the format above them** (up to the next S); `endLine` is the last line of its last entry. Whether a header comment belongs to the next format is left to the writer's move operation (E11d).
- **Line ends are per line** (`\r\n`, `\n`, or a lone `\r`); `eol` says `mixed` when they differ. A byte order mark is set aside and put back.
- **Columns count characters**, so a character outside the BMP is one column.

**Tests.** The whole sample (every figure of SFGR-SPEC.md section 6, plus an independent count of the D entries from the raw text); every line in exactly one entry; the source back byte for byte (CRLF, LF, lone CR, mixed, no final line end, BOM); continuation (joins, chains, blanks at the join, `*` after `X`, end of source, a non-D line after `X`, `X` on S and comment lines); H, comment and `*DDS` fixtures, which the sample does not have; unreadable lines; the helpers and tables; 300 random sources (no throw, each line once, the text back).

**Not done, left to the next sub-tasks.** Rule checks (ranges, order of S / H / D, duplicate names, overlap) are E11j. `*DDS` is passed through, not parsed as DDS (decision 3). DBCS shift characters at a join are not removed (decision 5).


### E11d results

**E11d (writer).** New `src/sfgrWriter.js` (UMD, no `vscode`; it needs `sfgrParser.js`, so both are now in the `build:webview-assets` copy list) and `src/test/e11dSfgrWriter.test.js` (112 checks). Nothing in the extension calls it yet; E11e (model), E11g (panels) and E11h (editing) are its users.

**API.** Every operation takes the source text and returns `{ ok: true, text, changed, touched }` or `{ ok: false, code, reason }`; none throws. `setValue(text, ref, key, value)` (S, H, D columns by the parser's column keys, and `text` on a comment line), `setConstant(text, ref, constantText, opts)`, `insertSpec`, `insertFormat` (flat objects: `{ s, help: [...], fields: [...] }`), `deleteEntry`, `deleteFormat`, `duplicateEntry`, `moveEntry`, `moveFormat`, plus `buildLines`, `constantPieces`, `encodeColumn`, `formatSpan`. A `ref` is `{ line }` (first line of the entry) or `{ entry }` (index in the parser's `entries`); a place is `{ before }`, `{ after }`, `{ format, at: 'end' }`, `{ beforeFormat }` or `{ atEnd }`.

**What it keeps.** A line an edit does not name is returned byte for byte, line end included. An edited line changes only the columns named: text past column 80, the sequence number and a right-trimmed or padded line all stay as they were. Line ends of new lines follow the line they sit next to; a source with no final line end keeps having none; a byte order mark is kept. Numbers are right-justified; an indicator column given a number 1 - 99 is written as two digits; a column above 99 is written `A0` - `D2`; an H corner can be given as `{ row, column }`.

**Constants.** 23 characters on the first line (columns 57 - 79), 73 on each continuation line (columns 7 - 79), `X` in column 80 while more follows. Finding from the sample: a constant can carry trailing blanks past its text on a continuation line (22 of the sample's D entries; a blank constant is a blank first line with an `X` and a blank `D` line after it), which the parser's trimmed `constantText` does not show. So `setConstant` leaves a constant whose trimmed text did not change alone, and a changed constant is written without trailing blanks; `opts.keepBlanks` writes the text as given, so a caller that read the raw lines can restore a source exactly. A line with no constant type that is given a constant gets type `C`.

**Decisions.**
- **Header comments.** A run of comment lines directly above an S specification (no blank line between) is that format's header: it moves and is deleted with that format, and a format's span stops before the next format's header. Resolves the question E11c left open.
- **Safety net.** After every structural edit the result is read again and refused (`wouldBreakSource`) if it has more parse errors than before, or (`helpOrder`) puts an H specification after a D specification of its format. Range, overlap and duplicate-name rules stay with E11j; the writer refuses only what it cannot write (a value wider than its columns, a control character, an unknown column or key).
- **An S specification** is deleted and moved only with its format (`deleteFormat`, `moveFormat`); a continuation line is not an entry and cannot be named as a place.

**Checked on the sample.** Re-setting every column of every S line and of a sample of D lines gives the same values and changes no other line (over 400 edits); all 41 continuation chains set away and back (raw text, blanks kept, type restored) give the sample byte for byte; every format moved to every place and back (42 moves) gives it byte for byte, with no line lost; setting every constant to its own text changes nothing. An edit re-reads the source, about 8 ms on the 549-line sample.

**Not done.** DBCS shift characters at a continuation join are not handled (decision 5). Nothing maps the SFGR entries to the designer's model (E11e).

### E11e results

**E11e (model and engine mapping).** New `src/sfgrModel.js` (UMD, reads `sfgrParser.js`, no `vscode`), tested by `src/test/e11eSfgrModel.test.js` (80 checks). `SfgrModel.buildModel(text or parse result)` returns the same `DspfFile` shape the DDS parser gives (checked key for key against the real parser), so `dspfEngine.js`, the simulator and the exports need no SFGR branch. `dspfModel.ts` gains optional `sfgr` additions (`SfgrFormatInfo` on a record, `SfgrFieldInfo` on a field, `sourceKind` and `sfgr.sizes` on the file); the engine gains `recordLineOffset` (start line). Nothing in the extension calls the module yet (designer wiring is E11f/E11g), so it is not in the `build:webview-assets` copy list; add it with its first caller.

**Decisions (Manojkumar, E11e).** (1) **Attributes are mapped to DDS keywords now**: protect `DSPATR(PR)`, high intensity `HI`, blink `BL`, nondisplay `ND`, reverse image `RI`, underline `UL`, column separators `CS`, position cursor `PC`, each with the indicator its column holds (Y unconditioned, N or blank none), plus `LOWER` on a non-numeric input field (D column 51, else S column 21). The engine and the E3 simulator draw and condition them unchanged. (2) **Relative lines plus a record start line**: a field keeps the line the source has; `record.sfgr.startLine` is added by the engine (`recordLineOffset`, the same mechanism a window uses, so row = start line + line - 1; blank and `V` are line 1). (3) **Mapping and engine only**; opening a DSPF36 file in the designer stays with E11f/E11g.

**The mapping.** One format is one record; one D specification is one field, or two. A constant (type C or M) with no input is a `CONSTANT` (text padded to the field length, so a blank run that carries an attribute is as wide as the source says); with an output indicator it is two entries at one place, the constant when `N nn` and a usage O field when `nn` (the manual's Figure B-7 / B-8); with input allowed it is a field whose `DFTVAL` is the constant; a message constant shows `[id]` (the engine's MSGCON stand-in) and keeps id and member in `sfgr.message`. A field is B (input and output), I, O (conditioned on its indicator when output is one) or H (neither; nothing draws it). Data types follow the manual's table (SFGR-SPEC.md section 4), the SFGR type is kept, and only S gets decimals (0). 132-column formats (S column 39) give `DSPSIZ(27 132 *DS4)`, a mixed file `DSPSIZ(24 80 *DS3 27 132 *DS4)`, and `sizeIndexOf(file, name)` says which size a format is drawn on. Kept in `record.sfgr`, not turned into keywords: the other S entries (alarm, enable keys, blink cursor, erase, override, suppress input, null fill), the decoded key mask, H specifications with corners and `*DDS` blocks; comments and the parser's errors come through. A column entry that is not one the column allows is read as off and reported in `errors`, once per specification.

**What the sample gives** (`stipfm.dspf36`): 7 records, 496 fields, no error. 280 `CONSTANT`s and 216 fields (172 O, 43 B, 1 I); 286 specifications are constants, and the 6 that allow input are fields with `DFTVAL`. The engine draws all 7 formats on 24 x 80 with no overlap; with no indicator on, the fields not drawn are the 7 nondisplay ones and the 3 whose output indicator is off. `SORTIE` (start line 18) is drawn from row 18.

**Findings for E11f.**
- Six constants run past the right edge (59, 89, 102, 112, 126 and 188 cells): SFGR fields wrap to the next lines, and the engine draws one box. Each wrapped end is still on the screen. The wrap is E11f's.
- The manual's SFGR `N` (numeric) maps to DDS `M`, which the engine draws with `X`, not `9`, placeholders (`NUMERIC_TYPES` has no `M`). Left alone so DDS previews do not change; E11f decides.
- High intensity + reverse image + underline together mean nondisplay (SFGR-SPEC.md section 4); the mapping emits the three keywords as written and the engine draws them, so that rule is not applied yet.
- A format's lines-to-clear (what a later format erases) is kept (`sfgr.linesToClear`) but not applied: only the start-line offset is.

### E11f results

**E11f (preview fidelity).** Changes in `src/dspfEngine.js` (plus the CSS in `src/buildWebviewTemplate.js` and the class mirror in `src/screenExport.js`), tested by `src/test/e11fPreviewFidelity.test.js` (40 checks); four E11e checks that counted the old drawing were updated. Nothing here needs SFGR-specific code in the panels: the rules read `record.sfgr` / `field.sfgr` that E11e sets, so a DDS record draws exactly as before.

**Decisions (Manojkumar, E11f).** (1) **Lines to clear: covered input fields are kept, dimmed and marked** ("covered by FORMAT (still accepts input)", dashed outline, 0.45 opacity in the SVG), because the manual says input fields a new format covers still allow data entry (B-2). (2) **I / O / B tick on SFGR fields only**, a small letter in the top-right corner (`data-usage-mark`), on top of today's underline for I and B; DDS previews unchanged. (3) **Split by meaning**: column separators (`DSPATR(CS)`) and `LOWER` are real DDS keywords and draw for DDS too; wrap and the HI + RI + UL rule apply to SFGR fields only.

**What is drawn.**
- **Wrap.** A field longer than the rest of its row continues on the next rows from column 1, one piece per row (`wrapIndex`, `wrapCount`, each keeping the field's source line and anchor, so a click on any piece is the field). The six long constants of the sample (188, 59, 89, 112, 126 and 102 cells) are 15 pieces and none is past the screen edge any more. 80 or 132 cells per row by the format.
- **Lines to clear.** In a stacked screen (`resolveMultiScreen`) a later SFGR format removes constants and output fields on the rows it clears (blank = every line, a number = that many lines from its start line, 0 = none, capped at the last line); input fields (I and B) stay, flagged `covered` with `coveredBy`. `screen.clears` lists `{ recordName, from, to }` for the panels. A single format never clears anything.
- **I / O / B tick**, **HI + RI + UL = nondisplay** (SFGR only, so an indicator on one of the three decides it), **column separators** (a thin line at the right of each cell), **lowercase** (a field with `LOWER` is filled with lowercase x), and **numeric placeholders** (an SFGR type N, S or D is filled with 9; the DDS table is unchanged, so a DDS `M` field still shows X).
- **Exports.** The SVG and text exports draw the wrapped pieces as ordinary fields (the sample exports without error), the SVG draws a covered field at 0.45 opacity, and `fieldClasses` mirrors the new classes; a drift check compares it with the engine on every sample format.

**Not done.** Column separators are a vertical line per cell in the preview only; the SVG and text exports do not draw them. The 5292 color mapping (manual Figure B-9) is not applied. Both are small and can follow with E11i (exports on SFGR source).


### E11g plan and decisions

**Status.** E11g is split into four slices (decisions below accepted); E11g1 is in progress.

**What the designer is (read from `buildWebviewTemplate.js`, `extension.ts`).** One webview page holds the whole designer. The extension host only creates it, sends the source text and writes back what the page sends (`applyEdit`: the full new text). The page parses the text itself (`DspfParser.parseDspf`, called in about 14 places), keeps `model`, and edits by changing DDS lines with `dspfWriter.js` and parsing again. The parser, engine, writer and helpers are inlined as scripts (`parserBundleJs`, `engineJs`, `writerJs`, ...), so adding `sfgrParser.js`, `sfgrModel.js` and `sfgrWriter.js` (all UMD, no `vscode`) is a matter of embedding them. The properties panel is chosen in `renderProps` (placement, file, multi-field, field, help, record). Today the E11b notice stands in for the page when the source is SFGR.

**What that means.** The preview already works for SFGR (E11e builds the same model, E11f draws it). What is missing is: the page knowing the source is SFGR; every DDS edit path staying away from SFGR text (they change DDS columns and would corrupt it); and the S, D and H panels writing through `sfgrWriter.js`.

**Proposed slices.**

| Slice | Scope |
|-------|-------|
| E11g1 | **Wiring, read-only.** Open SFGR in the designer (the E11b notice goes). The host sends `sourceKind`; the page gets one `parseSource(text)` that routes to `SfgrModel.buildModel` or `DspfParser.parseDspf`, used at every parse site. For SFGR the canvas, record list, size list, indicator simulator and exports work; every DDS-only edit control is hidden or disabled (canvas drag and resize, add field, keyword picker, resolve reference, compile-time DDS helpers) with one banner saying why; the title button and lens return for `.dspf36`. Nothing can write SFGR text yet. |
| E11g2 | **Format panel (S spec).** Record panel for an SFGR format: name, start line (blank / 1 - 24 / V), lines to clear, lowercase, return input, alarm, enable function keys and command keys with a key-mask editor (function keys 1 - 6, command keys A - Y), blink cursor, erase input, override, suppress input, null fill, 132 columns, right-to-left. Edits go through `SfgrWriter.setValue`; `sourceText` is replaced and parsed again (not the `lines` path). |
| E11g3 | **Field panel (D spec).** Field and constant panel: name, length, line, column, output (Y / N / indicator), input allowed, data type, mandatory fill and entry, self-check, adjust/fill, position cursor, dup key, controlled field exit, automatic record advance, protect, the five attributes, column separators, lowercase, constant type and constant text (through `setConstant`, with the 23 + 73 split shown), message constant id and member. Each value is a dropdown or an input checked against the E11a range; a value the writer refuses is shown, not applied. |
| E11g4 | **Help panel (H spec) and clean-up.** H specification panel (name or label, help file and library, the two corners, suppress selection, restore format, boundary, online document); a `*DDS` block shown as a locked item; the DDS-only panels and tabs absent for SFGR (file keywords, record keywords, keyword finder); breadcrumb and labels in SFGR words. |

Canvas operations (click-to-place, drag, resize, delete, duplicate, undo and redo) stay E11h; E11g covers the panels and the routing.

**Decisions (all accepted as proposed by Manojkumar).**

| # | Question | Proposal | Answer |
|---|----------|----------|--------|
| 1 | Slicing | Split E11g into E11g1 - E11g4 as above, each its own release | Accepted as proposed (Manojkumar) |
| 2 | Edit routing | The page keeps `sourceText` as the truth for SFGR; every edit is one `SfgrWriter` call, then `buildModel` again; `applyEdit` sends the full text as today | Accepted as proposed (Manojkumar) |
| 3 | Before E11h | In SFGR mode the canvas is read-only (select, inspect, simulate, export); drag, resize and add arrive with E11h | Accepted as proposed (Manojkumar) |
| 4 | Panel style | Same panel look as the DDS ones (tabs for Basic / Attributes / Constant), SFGR column names, the column number in a tooltip | Accepted as proposed (Manojkumar) |
| 5 | Indicators | One control for each Y / N / indicator column: a small select (No, Yes, Indicator) plus a 01 - 99 box when Indicator is chosen | Accepted as proposed (Manojkumar) |
| 6 | Key mask | Two rows of toggle buttons (function keys 1 - 6, command keys A - Y) with the enable columns beside them, so the mask and the Y / N meaning are edited together | Accepted as proposed (Manojkumar) |


### E11g1 results

**E11g1 (designer, slice 1: wiring, read-only).** Changes in `buildWebviewTemplate.js` (the page), `extension.ts` (the host), `package.json`; new test `src/test/e11g1SfgrDesigner.test.js`.

**The page.** `getWebviewHtml` takes a `sourceKind` (`'dds'` default, `'sfgr'`), baked into `<body data-source-kind>` so the CSS can hide the DDS-only controls before any script runs. The three SFGR modules are embedded after the DDS parser bundle (parser first: the model and the writer read it as a global). One `parseSource(text)` routes to `SfgrModel.buildModel` or `DspfParser.parseDspf`; all 13 parse sites in the page use it. The canvas, record and size lists, indicator simulator and exports are the existing ones: E11e gives the same model, E11f draws it.

**Nothing writes SFGR yet, and nothing writes it wrongly.** `sfgrReadOnlyBlocks()` is the first line of `commitSourceChange`, `commitGroupEdit`, `commitAlignEdit`, `commitMultiFieldKeywordEdit`, `commitCopySelection` and `commitPaste`; `startDrag` and `startGroupDrag` return at once. Keyboard shortcuts (Delete, nudge, cut, paste, duplicate) all end in those functions, so they are covered; a refused edit flashes the note in the left panel. The hidden controls are the buttons and rows listed in the CHANGELOG entry (CSS on `body[data-source-kind="sfgr"]`).

**Properties.** `renderProps` hands SFGR to `renderSfgrReadOnlyProps`: for a format, source lines, start line (blank / number / `V`), lines to clear, 80 or 132 columns, the display control columns with their column numbers, the key mask decoded into function and command keys, and counts of H specs and `*DDS` blocks; for a field or constant, source lines (with "continued"), line and column with the screen row (start line + line - 1), length, usage, SFGR and DDS data type, the constant's text, a message constant's id and member, and its attributes with their indicator conditions. E11g2 - E11g4 replace this with the panels that write.

**Host.** The E11b notice page and the "opens as text" message are gone; `openPreview`, "Open With" and the lens open the designer for SFGR (`isLikelyDisplayFile` is true for it again), and the title button matches `.dspf36` again. A `.dspf36` file whose text is DDS is still a DDS page (E11b's rule). The batch export (E5) reads SFGR through the SFGR model, so the images are no longer drawn from a DDS reading of it; its menu entry and the other exports stay with E11i. `sfgrModel.js` joins the copy list.

**Checked.** In jsdom on `stipfm.dspf36`: one record per format, fields drawn, the DDS-only controls computed `display: none`, the heading and compile buttons say DSPF36 and CRTS36DSPF, the format and a selected field show in Properties with no input to type into, Delete, nudge, cut, paste and duplicate post no `applyEdit`, the note flashes, an `externalUpdate` re-reads the new text as SFGR; a DDS page beside it is unchanged (note hidden, controls shown, Delete still edits).

**Not done (by design).** The keyword finder and the add-from-database path are hidden, not ported; the multi-field and record-level panels have no SFGR version (not needed while it is read-only); the explorer's host-side DDS helpers (referenced fields, menu) are unreachable from an SFGR page.

---

## Open questions

| # | Question | Needed by |
|---|----------|-----------|
| 1 | E2a: a real failing compile listing and joblog from the IBM i, as fixtures. | E2a |
| 2 | E6c: the IBM UIM reference text for menu panel groups (the IBM site is bot-blocked). | E6c |
| 3 | E11k: a real failing `CRTS36DSPF` listing (and the member's SFGR source) from the IBM i, as fixtures. | E11k |

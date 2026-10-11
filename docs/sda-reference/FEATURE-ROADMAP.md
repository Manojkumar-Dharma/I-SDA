# Feature roadmap: epics and sub-tasks (E-series)

The keyword-compliance audit (`I-` tasks, [`keywordFixes.md`](keywordFixes.md)) closed at v0.11.0.
This document tracks the **next body of work**: ten feature epics, each split into sub-tasks that
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

0 of 10 epics done; 7 sub-tasks done (E7a, E7c, E7g, E7i, E7j, E7k, E7l). Current version: **v0.11.4**.

| ID | Epic | Sub-tasks | Depends on | Status | Version |
|----|------|-----------|------------|--------|---------|
| [E1](#e1) | Editor-side DDS language support (diagnostics, hover, completion, outline, quick-fixes) | E1a - E1i | - | Open | - |
| [E2](#e2) | Compile-error feedback loop | E2a - E2h | E1a, E1b for the shared diagnostics collection | Open | - |
| [E3](#e3) | Indicator simulator (and program-to-system field values) | E3a - E3h | - | Open | - |
| [E4](#e4) | Message-file integration (`MSGID` / `ERRMSGID` / `CHKMSGID` / `SFLMSGID`) | E4a - E4g | E3f (soft) | Open | - |
| [E5](#e5) | Preview export (PNG / SVG / HTML / text) | E5a - E5g | E3 (soft, for indicator state) | Open | - |
| [E6](#e6) | Menu designer: command keys and `TYPE(*UIM)` | E6a - E6h | E2 (soft, for compile errors) | Open | - |
| [E7](#e7) | Faster test suite | E7a - E7m | - | In progress | - |
| [E8](#e8) | `WINDOW(*DFT)` and runtime-valued window parameters | E8a - E8f | E3f | Open | - |
| [E9](#e9) | `EDTCDE(Y/W)` separator width | E9a - E9e | - | Open | - |
| [E10](#e10) | `CHCCTL` / `SFLCHCCTL` choice control values | E10a - E10e | E3f | Open | - |

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
| Standalone-HTML/SVG serialiser of the preview grid | E5b | E5c - E5f |

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
| E1a | **Diagnostics core.** New pure module `src/ddsDiagnostics.js`: parse a source text and run the existing guard chain (`commitSourceChange` guards, spec conflict rules) in a read-only "report, don't refuse" mode. Output is a list of positioned diagnostics with a stable code per rule. Added to the `build:webview-assets` copy list. | - | Open | - |
| E1b | **Wire to VS Code.** `DiagnosticCollection` over `DDS_LANGUAGE_SELECTOR` documents, debounced on change and on open; settings `isda.diagnostics.enable` and a severity map; cleared on close. Creates the shared hub (see Shared foundations). | E1a | Open | - |
| E1c | **Hover.** Keyword hover from the generated keyword index: level, parameter grammar, option-indicator validity, `DDS_Keyword_V7r6` citation. Fixed-column awareness (hover only in the keyword area, columns 45-80 plus continuation lines). | E1a | Open | - |
| E1d | **Completion.** Keyword completion filtered by level, record type and field usage/data type using `keywordSpec.js`; parameter snippets; no suggestion for a keyword the guards would refuse here. | E1a | Open | - |
| E1e | **Outline and navigation.** `DocumentSymbolProvider` (records, fields, subfile pairs, help specifications); go-to-definition on record names inside `SFLCTL(...)`, `WINDOW(...)`, `MNUBARCHC(...)` (the `RECORD_REFERENCES` table already says where they sit). | E1a | Open | - |
| E1f | **Quick-fixes.** `CodeActionProvider` mapped from diagnostic codes: remove the conflicting keyword, add a missing required companion (for example `OVERLAY` for `PUTRETAIN`, `INDARA`), "Open in designer". Each fix is an edit through the same writer so source fidelity (I-202 - I-207) holds. | E1a, E1b | Open | - |
| E1g | **Column aids.** Decorations or ruler for the fixed DDS columns (5-6 type, 17 name type, 30-34 length, ...). **Decision first:** decorations vs a CodeLens-style header; may be dropped if E1c/E1d make it redundant. | E1b | Open | - |
| E1h | **Performance and tests.** Latency budget on a 5,000-line and a 20,000-line source, incremental re-check of the edited record only, no-`vscode` unit tests for E1a, jsdom-free. | E1a | Open | - |
| E1i | **Release** (next free minor). | E1a - E1h | Open | - |

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
| E2a | **Capture source. Decision first.** Compare the three ways to get messages: the job log (`QSYS2.JOBLOG_INFO`), a compile listing (`OUTPUT(*PRINT)` spool), and the command's own error text from Code for i. Pick one primary and one fallback; record which messages carry statement/sequence numbers. Needs real samples: **Manojkumar to provide one failing listing and joblog** to use as fixtures. | - | Open | - |
| E2b | **Message parser.** Pure module `src/compileMessages.js`: listing/joblog text to `{msgId, severity, sequence, text}`; fixtures from E2a; tolerant of unknown message layouts (never throws). | E2a | Open | - |
| E2c | **Sequence to line mapping.** Map a sequence number to a line in the member or local file, accounting for sequence numbers kept or re-applied by the writer (I-203), a tag in columns 1-5 (I-204), and removed-lines-kept-as-comments (I-207). Unmappable messages stay global. | E2b | Open | - |
| E2d | **Editor diagnostics.** Feed mapped messages into the shared `DiagnosticCollection` hub as source `CRTDSPF` / `CRTMNU`; an Output channel with the raw listing; cleared on edit of the line or on the next compile. | E2c, E1b | Open | - |
| E2e | **Designer surface.** A dismissible error banner in the webview; click selects the record/field on the canvas; badges on records/fields in the property panels; both UI styles. | E2c | Open | - |
| E2f | **Menu compile.** `CRTMNU` runs several steps (`CRTDSPF`, message file, `ADDMSGD`, `CRTMNU`); report which step failed and its messages, per step. | E2b | Open | - |
| E2g | **Tests.** Fake Code-for-i connection returning recorded fixtures; end-to-end: failing compile to diagnostic on the expected line. | E2d | Open | - |
| E2h | **Release** (next free minor). | E2a - E2g | Open | - |

---

## E3

**Indicator simulator**

**Goal.** Let the designer flip indicators and program-to-system field values and see the screen the program
would produce, with an explanation of why each keyword is or is not in effect.

**Acceptance for the release.** A panel lists the indicators actually used in the file, labelled from `INDTXT`
where present; toggling one re-renders the preview; named scenarios can be saved and recalled without touching
the source; the keyword-reactivity table (E3d) has no `not reactive` row for a keyword that IBM says takes
option indicators; program-to-system field values can be set and are shared with other features.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E3a | **Audit what exists.** The engine already takes an active-indicator set and the New UI has a conditioning-indicators preview (P5g). Write down exactly what is there, in both UI styles and the menu designer, and what is missing. Output: a gap list that scopes E3b - E3e. | - | Open | - |
| E3b | **Indicator discovery panel.** Scan the file/record for every indicator referenced (including `N` negation and the 01-99 range), list only those, label from `INDTXT`; "show all 99" toggle; per-record vs file-wide view. | E3a | Open | - |
| E3c | **Scenarios.** Save, rename, delete and recall named indicator sets (for example "error state", "empty subfile"). **Decision first:** storage in VS Code `workspaceState` vs an optional sidecar file; the source is never written. | E3b | Open | - |
| E3d | **Keyword reactivity.** Table of every keyword IBM says accepts option indicators vs whether the engine reacts to it in the preview (`DSPATR`, `COLOR`, `ERRMSG`, `SFLDSP`/`SFLCLR`/`SFLEND`/`SFLDSPCTL`, `PROTECT`, ...); implement the gaps. The table lives in this document's E3d section and is checked by a test against `keywordSpec.js`. | E3a | Open | - |
| E3e | **Explain panel.** For the selected field/record: each keyword line, whether it is active under the current indicators, and the indicator expression that decided it. | E3b | Open | - |
| E3f | **Program-to-system field value store.** Design-time values for fields the program sets at run time (choice control fields, `WINDOW` position fields, `SFLSIZ`, message-data fields): a small store keyed by file, record and field, with an editor in the simulator panel. Used by E4c, E8 and E10. Same storage rule as E3c. | E3c (storage decision) | Open | - |
| E3g | **Menu designer parity.** Offer the panel in the menu designer where menu records carry conditioned content. **Decision first:** may be dropped if E3a shows menus have nothing to simulate. | E3b | Open | - |
| E3h | **Release** (next free minor). | E3a - E3g | Open | - |

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
| E4a | **Source of message text. Decision first.** Options: SQL (`QSYS2` message-file service, to be **verified to exist on V7R3**), `RTVMSG` per ID, `DSPMSGD` to an outfile. Also decide offline behaviour: none, or an importable cache file. | - | Open | - |
| E4b | **Resolver module.** `src/messageFile.js` with a fake-connection test seam (as `jobDateFormat.js` does): `*LIBL` and `lib/name` resolution, per-session cache, never throws. | E4a | Open | - |
| E4c | **Preview.** Show resolved text for the keywords above in the right place on the screen; `&1`-style substitution from E3f values or a placeholder; severity-colour only if the reference says it affects display. | E4b, E3f (soft) | Open | - |
| E4d | **Picker and validation.** Message-ID picker with text in the `ERRMSGID`, `MSGID`, `SFLMSGID`, `CHKMSGID` panels; an "ID not found in `<msgf>`" diagnostic through the E1 hub when available. | E4b | Open | - |
| E4e | **Menu designer.** Compile Menu already creates the `USRnnnn` messages with `ADDMSGD`; show the existing messages for a menu's options and flag drift between the menu text and the message. | E4b | Open | - |
| E4f | **Settings and degradation.** `isda.messageFiles` (default message files to search), cache location, a clear "message text unavailable (not connected)" state in the panels. | E4b | Open | - |
| E4g | **Release** (next free minor). | E4a - E4f | Open | - |

---

## E5

**Preview export**

**Goal.** Get a screen out of the designer as an artefact for documentation, reviews and tickets.

**Acceptance for the release.** Command and toolbar button export the current record in the current indicator
state as PNG, SVG, self-contained HTML or plain text; a batch export writes every record (and every `DSPSIZ`)
to a folder with an index page; works from both designers and both UI styles.

| ID | Sub-task and scope | Depends on | Status | Version |
|----|--------------------|------------|--------|---------|
| E5a | **Scope and formats. Decision first.** Which formats ship, whether compare mode and the ruler/crosshair are included, background/theme (classic green-on-black vs the accent colours), font fallback stack, scale factors for PNG. | - | Open | - |
| E5b | **Serialiser.** Pure function: the engine's resolved grid to standalone SVG and HTML (inline CSS, no remote assets, font fallback stack); snapshot tests. | E5a | Open | - |
| E5c | **PNG.** Rasterise the SVG in the webview via canvas, with a scale option; save from the extension host. | E5b | Open | - |
| E5d | **Plain-text dump.** The grid as an 80x24 / 132x27 text block, with an optional attribute legend (underline, reverse image, colours as letters). | E5a | Open | - |
| E5e | **UI and command.** `iSDA: Export Screen Preview`, toolbar button, save dialog, copy to clipboard, default format setting; menu designer included. | E5b | Open | - |
| E5f | **Batch export.** Every record and every `DSPSIZ` into a folder plus an `index.html`; progress notification; cancellable. | E5b, E5e | Open | - |
| E5g | **Release** (next free minor). | E5a - E5f | Open | - |

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
| E7e | **Sharding and CI.** `--shard i/n` for the runner; a GitHub Actions workflow running compile, the sharded suite and `generate_keyword_index.js --check` on push and pull request. | E7b | Open | - |
| E7f | **Release** (next free minor). Records before/after wall time and check counts in the changelog line. | E7a - E7e, E7g - E7m | Open | - |
| E7g | **Shared-process test execution. Decision first.** Run several test files in one long-lived worker so jsdom is loaded once per worker (the E7a table puts jsdom loading at about 240 s of 1,860 s) and, optionally, keep one pooled webview page per worker. Needs a per-file reset of the globals the tests install (`document`, `window`, `Node`, `DspfWriter`, timers), a `process.exit` shim, per-file output and failure reporting as today, a per-file opt-out marker, and an `--isolate` switch that keeps today's one-process-per-file behaviour. The proposal compares `worker_threads`, `vm` contexts and a child-process pool before any code. Outcome: [E7g proposal](#e7g-proposal), approved; the build is E7i - E7l. | E7a | Done (no code change) | - |
| E7h | **Page reuse in the two heaviest files.** `dspfWebview.test.js` (73 pages, 139 s in the baseline) and `menuWebview.test.js` (24 pages, 31 s): build a page once per group of scenarios and load each scenario's source with the page's `externalUpdate` message, resetting the UI state the page keeps (selection, active tab, modification-tracking session flags). Success: identical check counts and results, timed A/B against a control run in the same session. Result and the part left out: [E7h results](#e7h-results). | E7a | Done | v0.11.5 |
| E7i | **Shared worker core.** `src/test/sharedWorker.js`: a worker process that runs a list of test files in order with the reset from the E7g proposal (clear the `require` cache except `node_modules`; first `process.exit` fixes the result and later ones are ignored; read and reset `process.exitCode`; idle detection for files that never exit; output capture per file; timer and interval cleanup; close `global.window`; delete installed globals). `run.js` gets `--shared` (opt-in at first); output blocks, `--- file: N ok, M failed` lines, summary and exit code identical to today. Results: [E7i results](#e7i-results). | E7g | Done | v0.11.1 |
| E7j | **Parity check and opt-out marker.** `// @isda-test: isolate` in a test file's first lines keeps that file in its own process in shared mode. A script (`npm run test:parity`) runs both modes and fails if any file's ok count, failed count or exit code differs; used by CI and by hand before the reset list changes. Results: [E7j results](#e7j-results). | E7i | Done | v0.11.2 |
| E7k | **Worker recycling.** Replace a shared worker with a fresh one after 60 files or when its resident memory (measured after a garbage collection) reaches 1,536 MB, both configurable (`--recycle-files`, `--recycle-mb`, 0 = off); keep per-file output ordering; a worker that dies fails only its current file and the run goes on with a new one. Results: [E7k results](#e7k-results). The pool scheduling that was part of this row's first wording moved to E7m, because it needs E7b. | E7i | Done | v0.11.3 |
| E7l | **Make shared mode the default.** After E7j's parity run is clean on the full suite: `--shared` becomes the default and `--isolate` the escape hatch; update the `run.js` header, `README.md` and `ways-of-working` notes; record the A/B against a same-session control run. Results: [E7l results](#e7l-results). | E7j, E7k | Done | v0.11.4 |
| E7m | **Pool integration.** Make the E7b `--jobs` pool schedule files onto shared workers (each worker recycled by E7k's rules), keeping per-file output ordering, the `--isolate` / marker behaviour and the parity guarantee from E7j. | E7b, E7k | Open | - |


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

**Revised targets (proposal; Manojkumar to confirm).** All measured as an A/B against a control run in the same
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

**Scope.** The pool applies to the process-per-file path. The default shared mode still runs one worker, so `--jobs`
has no effect there and says so; scheduling files onto several shared workers is E7m.

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
| E8a | **Inventory.** From the `WINDOW` section of the DDS Reference: exactly which parameters can be `*DFT` or a program-to-system field (reference line, reference column, lines, columns, and the `WDWBORDER` interaction), and what IBM says `*DFT` means at run time. | - | Open | - |
| E8b | **Preview value model.** Per-window design-time values in the E3f store; default behaviour unchanged when none is set. | E8a, E3f | Open | - |
| E8c | **Engine.** Geometry resolution accepts the preview values; the dashed border stays for unset parameters only; unit tests for every form in E8a. | E8b | Open | - |
| E8d | **UI. Decision first.** A "Set preview position" control on a placeholder window; whether drag/resize is allowed on a runtime-valued window and what it changes (preview value only, never source). | E8c | Open | - |
| E8e | **Compare mode.** Replace the per-window stagger with the chosen values where set. | E8c | Open | - |
| E8f | **Release** (next free minor); rewrite the `WINDOW` entry in `LIMITATIONS-PLAN.md`. | E8a - E8e | Open | - |

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
| E9a | **Rules.** From the `EDTCDE` section of the DDS Reference: what `Y` and `W` insert, how many positions each adds for 6-digit and 8-digit (and 4-digit, if allowed) fields, whether the separator is the job's `DATSEP` in both cases, and what changes with `DATFMT`. Output: a table in this section used as the test oracle. | - | Open | - |
| E9b | **Separator source.** Reuse `fetchJobDateFormat()`; add a setting `isda.previewDateSeparator` (`/`, `-`, `.`, `,`, blank) for offline use; define precedence (job, then setting, then default) and keep the "proxy for the job the screen will run in" caveat. | E9a | Open | - |
| E9c | **Engine.** Use the separator in `editCodeDisplay` / display length for `Y` and `W`; output positions of the separators inside the rendered value; the `keywordSpec.js` `editCodeDisplay` entries lose their "runtime separator" marker only where now resolved. Tests against the E9a table. | E9a, E9b | Open | - |
| E9d | **UI.** A note in the field panel showing the separator source (job / setting / default); delete the corresponding text from the accepted-limitations list. | E9c | Open | - |
| E9e | **Release** (next free minor). | E9a - E9d | Open | - |

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
| E10a | **Audit and scope.** What `CHCCTL` and `SFLCHCCTL` already have (spec entries, panel rows, guards such as the I-171 family) vs what the reference requires; pin down the gap named in the box above; list what each state looks like with and without `CHCAVAIL` / `CHCUNAVAIL` / `CHCSLT`; note that the cursor-restriction values only apply to an enhanced-interface controller. | - | Open | - |
| E10b | **Panel and guards.** A `CHCCTL` row (choice number plus `&field`) on choice fields, with the field-existence and type checks the reference requires, for both the panel and the raw editor. | E10a | Open | - |
| E10c | **Preview.** Render a choice in the state given by its control field's value from the E3f store; default state when no value is set; unit tests for `0` - `4`. | E10a, E3f | Open | - |
| E10d | **`SFLCHCCTL`.** The same for subfile choice lists (`SFLSNGCHC` / `SFLMLTCHC`), including the structural requirements already in the spec. | E10c | Open | - |
| E10e | **Release** (next free minor); rewrite the `CHCCTL` entry in `LIMITATIONS-PLAN.md`. | E10a - E10d | Open | - |

---

## Open questions

| # | Question | Needed by |
|---|----------|-----------|
| 1 | E2a: a real failing compile listing and joblog from the IBM i, as fixtures. | E2a |
| 2 | E6c: the IBM UIM reference text for menu panel groups (the IBM site is bot-blocked). | E6c |
| 3 | E10a: which exact gap was meant by "missing field-level indicator for `CHCCTL`". | E10a |
| 4 | E7a: is 4 minutes on 4 cores the right target for the full suite? | E7a |

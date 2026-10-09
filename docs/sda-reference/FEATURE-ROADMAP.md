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
`Done (no code change)`, `Done (no behaviour change)`. **Version** is `vX.Y.Z` for every Done row, `—` otherwise.

**Source stays clean.** No feature below may write design-time-only state (preview values, scenarios,
simulator settings) into the DDS source. Such state lives in VS Code workspace storage or a settings key,
never in columns 1-80 or the tag area.

---

## Status at a glance

0 of 10 epics done; 0 sub-tasks done. Current version: **v0.11.0**.

| ID | Epic | Sub-tasks | Depends on | Status | Version |
|----|------|-----------|------------|--------|---------|
| [E1](#e1) | Editor-side DDS language support (diagnostics, hover, completion, outline, quick-fixes) | E1a - E1i | - | Open | - |
| [E2](#e2) | Compile-error feedback loop | E2a - E2h | E1a, E1b for the shared diagnostics collection | Open | - |
| [E3](#e3) | Indicator simulator (and program-to-system field values) | E3a - E3h | - | Open | - |
| [E4](#e4) | Message-file integration (`MSGID` / `ERRMSGID` / `CHKMSGID` / `SFLMSGID`) | E4a - E4g | E3f (soft) | Open | - |
| [E5](#e5) | Preview export (PNG / SVG / HTML / text) | E5a - E5g | E3 (soft, for indicator state) | Open | - |
| [E6](#e6) | Menu designer: command keys and `TYPE(*UIM)` | E6a - E6h | E2 (soft, for compile errors) | Open | - |
| [E7](#e7) | Faster test suite | E7a - E7f | - | In progress | - |
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
| E7a | **Baseline.** Run `node src/test/run.js --slow 400` on a quiet machine; record per-file time, total, core count and the top 20 in the section; classify the cost (jsdom setup, compile or template build per file, the generated keyword matrix, repeated parsing of large fixtures). Set the numeric target. | - | In progress | - |
| E7b | **Parallel runner.** Worker pool in `src/test/run.js`: `--jobs N` (default cores minus one, `--jobs 1` = today). Each file still gets its own process and its own log file; output stays grouped per file and grep-friendly; the summary, the `FAIL  -` detection and the exit code are unchanged. Guard against tests that share a temp path or fixture. | E7a | Open | - |
| E7c | **Cut shared setup cost.** From E7a's classification: share one webview template build instead of per-file rebuilds, lazy-load jsdom, memoise big parses in a helper. Each change must keep that file's check count identical. | E7a | Open | - |
| E7d | **Quick tier.** `npm run test:quick`: runs only the test files related to changed source files (**Decision first:** a name-based map, an import-graph walk, or git-diff plus a hand-kept map). The full suite remains the gate before a push. | E7b | Open | - |
| E7e | **Sharding and CI.** `--shard i/n` for the runner; a GitHub Actions workflow running compile, the sharded suite and `generate_keyword_index.js --check` on push and pull request. | E7b | Open | - |
| E7f | **Release** (next free minor). Records before/after wall time and check counts in the changelog line. | E7a - E7e | Open | - |

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

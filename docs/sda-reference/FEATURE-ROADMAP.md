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

5 of 10 epics done (E3, E7, E8, E9, E10); 43 sub-tasks done (E3a - E3l, E7a - E7m, E8a - E8g, E9a - E9e, E10a - E10f). Current version: **v0.15.0**.

| ID | Epic | Sub-tasks | Depends on | Status | Version |
|----|------|-----------|------------|--------|---------|
| [E1](#e1) | Editor-side DDS language support (diagnostics, hover, completion, outline, quick-fixes) | E1a - E1i | - | Open | - |
| [E2](#e2) | Compile-error feedback loop | E2a - E2h | E1a, E1b for the shared diagnostics collection | Open | - |
| [E3](#e3) | Indicator simulator (and program-to-system field values) | E3a - E3l | - | Done | v0.14.1 |
| [E4](#e4) | Message-file integration (`MSGID` / `ERRMSGID` / `CHKMSGID` / `SFLMSGID`) | E4a - E4g | E3f (soft) | Open | - |
| [E5](#e5) | Preview export (PNG / SVG / HTML / text) | E5a - E5g | E3 (soft, for indicator state) | Open | - |
| [E6](#e6) | Menu designer: command keys and `TYPE(*UIM)` | E6a - E6h | E2 (soft, for compile errors) | Open | - |
| [E7](#e7) | Faster test suite | E7a - E7m | - | Done | v0.12.2 |
| [E8](#e8) | `WINDOW(*DFT)` and runtime-valued window parameters | E8a - E8g | E3f | Done | v0.15.0 |
| [E9](#e9) | `EDTCDE(Y/W)` separator width | E9a - E9e | - | Done | v0.13.0 |
| [E10](#e10) | `CHCCTL` / `SFLCHCCTL` choice control values | E10a - E10f | E3f (E10f only) | Done | v0.14.0 |

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
option indicators and no `Gap` row owned by an E3 sub-task (a `Gap` that names a sub-task of another epic stays
open until that epic's release; at the E3 release that is `ERRMSGID`, `Gap (E4c)`); program-to-system field values
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

The acceptance rule for the release (E3h) is: no `Gap` row owned by an E3 sub-task left (see the acceptance paragraph; the one `Gap` row that names another epic is `ERRMSGID`, `Gap (E4c)`).

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
| ERRMSG | field | Reactive | the error line of a window (E3d probes it; a record without WINDOW has no error line in the preview) |
| ERRMSGID | field | Gap (E4c) | the message text comes from the message file; E4c draws it |
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
  Manojkumar chose to release E3 with that row owned by E4c, and the acceptance paragraph says so; E4g's release closes it.
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
| E4a | **Source of message text. Decision first.** Options: SQL (`QSYS2` message-file service, to be **verified to exist on V7R3**), `RTVMSG` per ID, `DSPMSGD` to an outfile. Also decide offline behaviour: none, or an importable cache file. | - | In progress | - |
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

## Open questions

| # | Question | Needed by |
|---|----------|-----------|
| 1 | E2a: a real failing compile listing and joblog from the IBM i, as fixtures. | E2a |
| 2 | E6c: the IBM UIM reference text for menu panel groups (the IBM site is bot-blocked). | E6c |

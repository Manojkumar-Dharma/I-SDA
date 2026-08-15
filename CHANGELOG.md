# Changelog

All notable changes to the iSDA extension are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.9.6] - Unreleased

### Added
- **A screen-size toggle for display files that declare two `DSPSIZ` sizes.**
  `DSPSIZ` can declare both a normal and a large-terminal size in the same
  file (e.g. `DSPSIZ(24 80 *DS3 27 132 *DS4)`) - the DSPF designer only ever
  read the first one and silently discarded the second. When a file declares
  more than one size, a "Screen size" picker now appears in the sidebar (both
  the DSPF designer and the compare-mode preview); with only one declared
  size, as in the overwhelming majority of files, the picker stays hidden and
  behaves exactly as before. Field positions are absolute in DDS, so
  switching sizes changes the visible working area, not per-size field
  layout - see "Known limitations" below.

### Fixed
- **A large `SFLPAG` (or a `SFLSIZ`-driven "virtually unlimited" pattern like
  `SFLSIZ(9999)`) could render subfile preview rows straight past the bottom
  of the screen.** Both the `SFLCTL`-side protected preview and the `SFL`
  record's own "Preview SFLPAG rows" mode now cap the number of rendered
  rows to what actually fits within the display's working area for the
  current screen size, rather than trusting the declared `SFLPAG` value
  unconditionally. The status hint now says so explicitly when capping
  happens (e.g. "Previewing 22 of 9999 SFLPAG rows (capped to fit the
  24-line screen)").
- **The menu designer's "+ Add option" screen-space bound (added in 0.9.5)
  didn't actually read a file's real `DSPSIZ`.** Its row-limit regex
  (`/\\d+/g`, doubly-escaped) never matched a digit, so `getScreenRowLimit`
  silently fell back to the hardcoded 24-row default for every file
  regardless of its declared size - invisible in the 0.9.5 fixtures because
  they all happened to use a 24-line `DSPSIZ` already, which is exactly what
  the broken fallback also produced. Now delegates to the same centralized,
  tested `DSPSIZ` parser the DSPF designer's screen-size toggle uses
  (`DspfEngine.screenLinesForRecord`), which also correctly implements
  record-level-overrides-file-level precedence per real DDS semantics.
- Minor de-duplication: the DSPF designer's and menu designer's webviews
  shared two near-identical pieces of client-side code (`rebuildRecordSelect`
  and HTML-escaping) - now both call one shared implementation
  (`webviewClientHelpers.js` and `DspfEngine.escapeHtml` respectively) rather
  than keeping their own copies, directly addressing a bug class the project
  had hit twice before (see 0.9.4).

## [0.9.5] - Unreleased

### Fixed
- **Split-constant option text wasn't recognized, and editing it overwrote
  the number marker instead.** A real SDA layout pattern lays out a menu
  option's number and its label text as two SEPARATE DDS constants on the
  same line (e.g. `1.` at column 7, the label text at column 10 - for
  consistent column alignment across every option), not always as one
  combined `1. Label` constant. `extractMenuOptions()` only ever recognized
  the combined form; a split-form option's number marker matched with an
  empty captured label, so its real label text (sitting in the other
  constant) never showed up in the options panel, and editing the
  (apparently blank) label field overwrote the NUMBER marker's text
  instead of the actual label - silent data corruption on save. Now
  detects both forms: a number-only constant (`1.` with nothing else on
  it) is paired with the next constant to its right on the same source
  line, if one exists. Reading, editing, swapping, and the record-rename
  scan all go through the same option model either way, so every editing
  path in the designer treats both forms identically and correctly - only
  the exact constant that actually holds the label text ever gets
  rewritten. (A number marker with genuinely no paired constant yet - just
  `1.` with nothing to its right anywhere on the line - now inserts a new
  label constant next to it on first edit, rather than having nowhere to
  write the label at all.)
- **"+ Add option" could push a new option past the screen size, or land it
  directly on top of an existing field.** Previously it always placed a new
  option exactly one row below the last existing one, with no check against
  the screen's own `DSPSIZ` row limit or whether that row was already used
  by something else (a "Selection or command" prompt, function-key text,
  another field placed there for any reason) - silently producing an
  off-screen field or two DDS entries overlapping the same row/column
  either way. Now scans forward from that starting row for the first
  actually-free row, bounded by `DSPSIZ`'s row count (record-level keyword
  first, then file-level, defaulting to 24 if neither is present or
  parseable) - and if there's genuinely no room left before hitting that
  limit, shows an inline error explaining why and adds nothing, rather
  than corrupting the layout.
- Along the way, found (and ruled out as a false alarm after empirical
  verification) a suspected third instance of the recurring
  hand-typed-regex-escaping bug class - see 0.9.4's entry for the real
  one. Worth calling out because the investigation is a good example of
  why this project trusts test output and direct runtime verification
  over reasoning about the build pipeline's multiple re-parsing stages
  from first principles.
- `menuWebview.test.js` extended with dedicated fixtures for both: a
  split-constant menu (finds both options, edits the correct constant,
  leaves the number marker untouched) and a screen-space scenario (skips
  an occupied row and lands on the next free one; refuses outright, with
  no `applyEdit`, when there's genuinely no room left).

## [0.9.4] - Unreleased

### Added
- **Editable option label text**: the options panel's label field (previously
  read-only display text) is now an input - editing it rewrites the DDS
  constant's text in place via `DspfWriter.applyFieldUpdate({ constantValue })`,
  which already supported this (no new writer code needed - only the UI was
  missing). The option number stays fixed; only the label portion changes.
- **Drag-to-swap options**: drag one option row onto another to swap what's
  shown at each option NUMBER - label text and command together. Numbers
  stay put at their own screen position (so the options panel, which always
  lists by number, visibly shows the swap); MNUCMD is updated too, since the
  command is meant to follow its label. Dropping a row onto itself is a
  no-op. (An earlier version of this swapped which screen position held
  which number instead - technically well-defined, but invisible in a list
  that's always sorted by number, so not what "drag to reorder" should feel
  like; reworked before shipping.)
- **Rename a record format** (the menu's own name, which `CRTMNU
  TYPE(*DSPF)` requires to match the member name - see 0.9.3's compile
  guard): a new "Rename" control next to the record picker, backed by a new
  `DspfWriter.renameRecordFormat()`. Deliberately a SEPARATE function from
  the existing `applyRecordUpdate` rather than extending it - that function
  explicitly treats renaming as unsupported (see its own comment) because
  other parts of a file can reference a record by name (`SFLCTL(name)`,
  `WINDOW(... name ...)`, `MNUBARCHC(id name text)`) and wouldn't be
  updated by a blind rename. This still doesn't rewrite those references,
  but now scans the rest of the source for anything that looks like one and
  warns with the specific line numbers before proceeding, rather than
  silently leaving them dangling. Validates the new name is well-formed DDS
  (1-10 chars, starts with a letter or `$#@`) and not already in use.
- `src/test/dspfWriter.test.js` extended: `renameRecordFormat()` - renames
  correctly, preserves column alignment and every other line untouched.
- `menuWebview.test.js` extended: editable label (DOM round-trip + DDS
  output), drag-to-swap (both `applyEdit` and `applyMenuCmdEdit` fire, the
  right content ends up at the right number, self-drop is a no-op), record
  rename (happy path + validation), and a dedicated second-fixture scenario
  proving the cross-reference warning actually fires for a real `SFLCTL`
  reference and still applies the rename anyway (advisory, not a block).
- In the course of building this, found and fixed a genuine escaping bug in
  a dynamically-built regex (`name.replace(/\$/g, ...)` silently lost its
  backslashes when hand-typed inside the outer build-script template
  literal - the same class of bug hit twice earlier in this project, this
  time for `\$`/`\b` rather than `\r`/`\n`). Fixed by removing the dynamic
  regex construction entirely in favor of a plain substring scan with a
  manual word-boundary check, rather than fighting the escaping further.

## [0.9.3] - Unreleased

### Added
- **"Compile Menu (CRTMNU)"** for the menu designer - a command
  (`dspfDesigner.compileMenu`, also a button in the designer's sidebar) that
  runs the real IBM i compile sequence via Code for i's
  `code-for-ibmi.runCommand` API (https://codefori.github.io/docs/dev/examples/#running-commands-with-the-user-library-list):
  `CRTDSPF`, then rebuilds the message file (`DLTMSGF`/`CRTMSGF` - deleted
  and recreated fresh each time rather than diffed against whatever message
  IDs already happen to exist, same reasoning as 0.9.1's DSPF constants),
  one `ADDMSGD` per option using the `USRnnnn` message-ID format that
  `TYPE(*DSPF)` menus expect (confirmed against an IBM support document -
  see README), then `CRTMNU`. Only `TYPE(*DSPF)` menus are handled - not
  `TYPE(*UIM)` menus, a different source format entirely.
  Guards before anything runs: requires the document to be a `member:`-scheme
  MNUDDS source, requires the Code for i extension to be installed, and
  requires the DDS record format to be named exactly the same as the menu
  member (a real `CRTMNU TYPE(*DSPF)` requirement) - with an actionable
  error naming what it found instead of a cryptic IBM failure three steps
  in. Saves any dirty buffers (the MNUDDS document, and the companion
  MNUCMD document if it's open) before compiling, since the compile reads
  from the saved server-side member, not the live editor buffer. Stops at
  the first failing step and surfaces the real IBM i error text verbatim
  rather than a generic "compile failed." Warns (with a "Compile Anyway" /
  "Cancel" prompt) if there are no option-to-command mappings yet, since
  every option would show "not correct" when selected.
- `src/test/compileMenu.test.js`: covers every guard condition, the exact
  CL command sequence and parameter values for a full compile, the
  no-mappings warning's cancel/proceed paths, and stopping at the first
  failing step with the real error text preserved. In the course of writing
  it, caught two real bugs the manual testing so far had missed: the
  compiled `dist/extension.js` couldn't find `mnuCmdEngine.js` at runtime
  (the build script now copies it into `dist/` alongside the compiled
  output), and the registered command handler wasn't returning its promise,
  so nothing - including this test - could actually await compilation
  finishing before checking the result.
- `vscode` test mock extended: `extensions.getExtension`, a configurable
  `code-for-ibmi.runCommand` handler via `commands.executeCommand`,
  `window.withProgress`/`ProgressLocation`, `showInformationMessage`, a
  configurable `showWarningMessage` response (for the Compile Anyway/Cancel
  prompt), and `TextDocument.isDirty`/`.save()`.

## [0.9.2] - Unreleased

### Added
- **Companion MNUCMD member kept in sync when it's already open elsewhere**:
  previously, saving option-command edits always wrote the `QQ` member
  directly to disk via `workspace.fs`, which meant an already-open editor
  tab for that same member wouldn't reflect the change (or worse, could
  overwrite it back on save) - a limitation called out in 0.9.0. Now, if
  that document is open, edits go through a normal `WorkspaceEdit` against
  it instead (correct dirty-dot/undo/save behavior), and edits made to it
  from elsewhere (that tab, another tool) are echoed back into the options
  panel the same way external edits to the MNUDDS document already were.
- `menu.test.js` extended to cover the open-companion-document sync path:
  edits routed through `WorkspaceEdit` instead of `writeFile` when that
  document is open, and external changes to it echoed back to the webview
  (the `vscode` mock's `workspace.onDidChangeTextDocument` now supports
  multiple concurrent listeners and a `workspace.textDocuments` list,
  since it previously only ever tracked one subscriber).
- `menuWebview.test.js` extended to cover `externalCommandUpdate` re-rendering
  the options panel in a real DOM without touching the screen preview.

## [0.9.1] - Unreleased

### Added
- **"+ Add option" in the menu designer**: previously the options panel could
  only edit or clear the command for a numbered option that already existed
  as a constant on the screen. Now you can add a brand-new option directly -
  enter a number and label text, and it inserts a correctly-formatted DDS
  constant onto the screen (`DspfWriter.insertField()`, a new writer
  primitive: builds a field entry from scratch and splices it in, unlike
  `applyFieldUpdate` which only repositions/edits an existing one - handles
  column alignment and long-label line-continuation the same way the rest of
  the writer does) at a sensible default position (one row below the last
  option in that record, same column - or row 6/col 5 as a documented guess
  if the record has no options yet to anchor on). This closes the "adding a
  brand-new option ... isn't supported yet" limitation called out in 0.9.0 -
  reposition afterward with the screen designer if the guessed spot doesn't
  fit your layout. Duplicate option numbers are rejected with an inline
  message rather than silently overwritten.
- `src/test/dspfWriter.test.js`: direct coverage for `insertField()` -
  column formatting, placement with/without existing fields, long-label
  continuation wrapping and round-trip fidelity.
- `menuWebview.test.js` extended to exercise the "+ Add option" form
  end-to-end in jsdom: validation (missing number, duplicate option),
  the happy path, and the resulting DOM/postMessage output.

## [0.9.0] - Unreleased

### Changed
- **Subfile editing redesigned to match real SDA behavior.** Previously,
  selecting the `SFLCTL` record automatically merged in the paired `SFL`
  record's rows (repeated `SFLPAG` times) as editable content, and dragging
  any field in a rendered row moved every named field of that row together
  via a batched "whole-row drag" - regardless of which record you'd
  actually selected. This conflated two independently-defined record
  formats into one editable view: an edit made while "in" `SFLCTL` could
  actually write to the other record, which was both surprising and
  inconsistent with how every other field/record edits (independently).
  - Selecting `SFL` directly now renders it once (not repeated) by default,
    as a normal, independently-editable record.
  - Selecting `SFLCTL` shows the subfile detail area for visual reference
    (repeated `SFLPAG` times, correctly positioned) as a **protected,
    non-interactive overlay** - matching real SDA, where the control
    record's design view shows the subfile area but doesn't let you edit
    individual row fields from there. Only the control record's own fields
    (headers, footers, its own keywords) are editable in that view.

### Added
- **"Preview SFLPAG rows" toggle**: when viewing the `SFL` record directly,
  an opt-in toggle repeats it `SFLPAG` times (resolved from the paired
  `SFLCTL` record) for a realistic multi-row preview *while still editing
  the template*. Unlike the `SFLCTL`-side protected overlay, these rows
  ARE the template - dragging any field in any row instance moves every
  field of that row together (group-drag, reinstated specifically for this
  opt-in case), since every visible row instance corresponds to the one
  template that actually exists in the DDS source. Off by default (single
  row, ordinary independent per-field editing - see "Changed" above).
- **Compare mode**: a separate opt-in, explicitly read-only way to preview
  *several* record formats together at once (not just automatic subfile
  pairing) - check any combination of record formats to see them layered
  on the same grid, each field tagged with its source record. No
  click/drag/select wiring at all in this mode, by design: editing an
  arbitrary combination of independently-defined records is ambiguous
  (which record would an edit belong to?). Switch off "Compare" to return
  to normal single-record editing.
- `DspfEngine.resolveMultiScreen()`: the engine-level primitive behind
  compare mode - resolves several records' fields (respecting each one's
  own `WINDOW`/subfile-preview) without the single-record overlap
  resolution, since comparison mode is for eyeballing multiple formats,
  not simulating one specific runtime state.
- **Menu design tool (MNUDDS)**, a first minimal vertical slice: a new
  `dspfDesigner.menuEditor` custom editor (opened via **"iSDA: Open Menu
  Design Preview"** or a CodeLens that appears on menu-shaped source)
  previews an IBM i SDA-style menu's screen layout - reusing the existing
  `dspfParser.ts`/`dspfEngine.js` as-is, since a MNUDDS member is plain DDS -
  and lets you edit which command each numbered option runs. Confirmed
  against IBM i documentation/community sources that a menu is really two
  source members (MNUDDS for layout, a companion "MNUCMD" member
  conventionally named `<menu>QQ` mapping option numbers to commands, see
  https://wiki.midrange.com/index.php/Create_Menu_Message_FIle_(UTMNUMSGF));
  a new `src/mnuCmdEngine.js` (plain dependency-free JS, same UMD style as
  `dspfEngine.js`/`dspfWriter.js` so the identical code runs in Node and the
  webview) parses and round-trips that member. Only works for a MNUDDS
  member opened as a remote IBM i source member via Code for i - see README
  "Known limitations" for this and what's intentionally out of scope for v0
  (adding brand-new options on the screen itself, live sync back into an
  already-open `QQ` editor tab, `CRTMNU` compile integration).
- `src/test/menu.test.js`: exercises `mnuCmdEngine.js`'s parse/write logic
  directly, then `MenuDesignerEditorProvider` against the `vscode` mock
  (extended with `workspace.fs.readFile` and per-viewType custom editor
  provider tracking, since the mock previously only ever dealt with one).
- `src/test/menuWebview.test.js`: an end-to-end check that actually
  *executes* the generated menu webview's client-side script in jsdom,
  rather than only asserting on the HTML string - catches bugs in the
  option-extraction regex, DOM wiring, or the `postMessage` payload shape
  that string-contains checks can't.

Verified via jsdom: `SFL` viewed directly renders once and drags fields
independently by default (confirmed `ROWAMT` stays put while dragging
`ROWNAME`); enabling "Preview SFLPAG rows" correctly resolves the row count
from the paired `SFLCTL` even though `SFLCTL` isn't the record being
viewed, renders all 4 rows editable, and correctly group-drags both
`ROWNAME` and `ROWAMT` together by the identical delta; `SFLCTL` viewed
directly shows its own fields as editable plus an 8-field protected
overlay (4 rows × 2 fields) that correctly rejects a drag attempt (zero
messages posted); the preview-rows toggle correctly hides for non-SFL
records, resets when switching records, and stays hidden in compare mode;
compare mode correctly disables the record picker, combines multiple
records' fields, and rejects field interaction; toggling compare mode back
off correctly restores normal single-record editing. Full regression suite
across every fixture re-run clean.

## [0.8.1] - Unreleased

### Added
- Migrated from a plain `WebviewPanel` to `CustomTextEditorProvider`
  (`dspfDesigner.editor`, registered with `priority: "option"` so it doesn't
  replace normal text editing by default). The designer's webview tab is now
  a real editor from VS Code's perspective: its own dirty dot, a proper
  "save changes before closing?" prompt, and `Ctrl+Z`/`Ctrl+Y` routed to it
  when focused - none of which a plain `WebviewPanel` gets for free, even
  though document-content undo/redo already worked either way (that's a
  property of editing via `WorkspaceEdit`, not of the panel type).
  `dspfDesigner.openPreview` now opens it via the standard `vscode.openWith`
  command instead of manually managing a `Map` of open panels -
  `supportsMultipleEditorsPerDocument: false` gives the same
  reveal-existing-instance behavior for free.
- A real regression test for the extension host (`src/test/extension.test.js`,
  run via `npm test`): exercises `activate()` and
  `resolveCustomTextEditor()` - including the echo-suppression logic that
  prevents infinite webview↔document sync loops - against a minimal mock of
  the `vscode` module (`src/test/vscode-mock.js`), since there's no real VS
  Code instance available in this environment. Verified all three cases:
  our own in-flight edit is correctly suppressed, a genuinely external
  change after it settles correctly propagates, and changes to unrelated
  documents are correctly ignored.

## [0.7.0] - Unreleased

### Added
- **"Create New Display File" command** (`dspfDesigner.createNewDspf`):
  prompts for a filename, primary record format name, and screen title, then
  writes a minimal, verified-correct DDS boilerplate (`DSPSIZ`, one record
  format, a title constant, one sample output field) and opens it straight
  into the designer. Available from the command palette and from
  right-clicking a folder in the Explorer. The generated source is parsed
  with iSDA's own parser *before* being written, as a safety net against
  any bug in the boilerplate itself.
- Remote IBM i source members and IFS streamfiles (opened via the Code for i
  extension's `member:`/`streamfile:` URI schemes) are now recognized for
  the editor-title preview button and the CodeLens, not just local `.dspf`
  files. Verified the actual scheme names and the `dds.dspf` language ID
  (assigned by the optional companion "IBMi Languages" extension
  specifically to display-file source - `.pf`/`.dds` map to `dds.pf`,
  physical files, which is a different thing) against their real
  `package.json` before wiring this up, rather than assuming.

### Fixed
- The editor-title button's `when` clause previously also matched `.pf`/`.PF`
  (physical file DDS - database field definitions, not screen layouts) -
  narrowed to just display-file extensions (`.dspf`/`.DSPF`/`.dspf38`).
- Dropped the `workspaceContains:**/*.dspf` activation event (forces a full
  workspace file-tree scan on startup) in favor of `onLanguage:dds.dspf` -
  command-based activation is automatic in modern VS Code and didn't need
  an explicit activation event at all.

### Reviewed, already correct
- The CSP (`script-src 'nonce-...'`) is already the right pattern for this
  extension's architecture: the webview inlines `dspfEngine.js`,
  `dspfWriter.js`, and the bundled parser directly as `<script nonce="...">`
  content rather than loading external files, so there's nothing to grant
  `asWebviewUri()` permissions for.
- `jsdom` is a devDependency used only by this project's own verification
  scripts (never imported by anything under `dist/` or embedded into the
  generated webview) - confirmed via a repo-wide search before writing this
  down rather than just asserting it.

## [0.6.0] - Unreleased

### Added
- Full multi-group and >3-indicator conditioning is now editable, at every
  level (field, record, help entry, *and* individual keyword) - the
  "locked, edit the source directly" restriction is gone entirely.
  `buildConditionChunks` splits an arbitrary conditions array (any number of
  OR'd groups, each with any number of indicators) into the right sequence
  of indicator-only prefix lines plus a final line carrying the last chunk's
  indicator columns together with the actual content.

### Fixed
- **Real, silent data-loss bug**: editing any field that had a *keyword*
  with its own conditioning (e.g. a conditionally-applied `DSPATR(HI)`) -
  even when the field itself had no field-level conditions and so wasn't
  locked - would regenerate that keyword as unconditional, discarding its
  indicators with no warning. Per-keyword conditioning is now correctly
  preserved and independently editable; keywords are grouped by identical
  conditions and each group gets its own line(s), matching real DDS layout.
- **Real bug in line-range detection**: pure indicator-only lines that
  *precede* a field/record's own content line (needed whenever conditioning
  spans more than one line) were never included in
  `getFieldLineRange`/`getRecordLineRange`, since neither `field.sourceLine`
  nor any keyword's `sourceLines` captured them. An edit would regenerate a
  correct new prefix line while leaving the stale original one untouched,
  and re-parsing would then merge the two into one group with duplicated
  indicators. Fixed by tracking `sourceLines` on `DdsCondition` itself
  (parser change) and including those in the range calculation (writer
  change). Caught via round-trip testing before it shipped.
- Sequence numbers on lines that don't otherwise change are now preserved
  from the original source instead of being overwritten with the entry's
  first line's prefix - keeps diffs minimal (a length-only edit on a
  multi-line conditioned field/keyword now touches exactly one line, not
  every line the entry spans).

## [0.5.0] - Unreleased

### Added
- `WINDOW(record-format-name)` resolution: a record can now correctly
  inherit its window geometry from another record's `WINDOW` keyword,
  including transitively through chains and through a referenced record
  that itself uses `*DFT` or a field-name position.
- `WINDOW(*DFT height width)` and field-name-based dynamic positioning
  (`WINDOW(&line &col height width)`) now render at a placeholder origin
  with a dashed border and a "position set at runtime" label, instead of
  not rendering at all.

### Fixed
- Corrected a wrong assumption from earlier docs research: there is no
  `WDWDEFINE`/`WINDOW(*DEFINE...)` keyword in DDS. The real named-reference
  mechanism is `WINDOW(record-format-name)`, verified against IBM's actual
  WINDOW keyword reference before implementing, to avoid building against
  a keyword that doesn't exist.

## [0.4.0] - Unreleased

### Added
- Record-level property editing: the properties panel now shows the current
  record's keywords (add/remove) whenever no field is selected, instead of
  just a placeholder. Deselect a field by clicking the screen background to
  get back to it.
- Help entry (`H` specification) editing: each record's help entries are
  listed and clickable from the record view, opening a keyword editor for
  that specific entry (`HLPARA`, `HLPRCD`, `HLPTXT`, etc.).
- Fixed a real gap in the writer: `HELP`-type entries previously couldn't be
  serialized at all (`col 17` was hardcoded blank instead of `H`), so any
  edit to a field would have silently corrupted help specifications
  elsewhere in the file the next time the source was regenerated near them.
  This is now correct.
- Multiple record formats in one display file were already fully supported
  (the record picker has always listed every format) - confirmed still
  correct across the subfile/window/menu-bar fixtures, which all define
  several record formats at once.

### Known limitations
- Record renaming isn't supported (see README).
- Help-entry re-selection after an edit isn't preserved (help entries have
  no stable name to re-find by, unlike fields) - editing one returns you to
  the record view rather than keeping it open.

## [0.3.0] - Unreleased

### Added
- Menu-bar (`MNUBAR`) rendering: a field with `MNUBARCHC` keywords now
  renders as a horizontal row of clickable choices (in ascending numeric
  order, per DDS semantics), instead of a single plain-text field.
- Simulated menu-bar trigger: clicking a menu choice opens its linked
  `PULLDOWN` record as an overlay anchored just below the choice, with an
  auto-sized border (matching the real "system calculates the dimensions"
  behavior). Clicking the open choice again, clicking a different choice, or
  clicking elsewhere on the screen all close/switch it correctly.
- The pulldown overlay renders as a separate layer on top of the base
  screen rather than competing for grid cells with it, matching how a real
  pulldown visually covers whatever is underneath.
- Whole-row subfile drag: dragging any field within a rendered subfile row
  now moves every named field of that row's template together - visually
  during the drag and as one batched source edit - instead of moving just
  the one field grabbed. Unnamed constants in the row template are left in
  place (see README known limitations).

### Fixed
- The previous single-field-only subfile drag would silently leave sibling
  row fields behind, making a dragged row look consistent on screen but
  actually misaligned in the underlying DDS source relative to other fields
  in the same row.

### Known limitations
- Pulldown-overlay fields are preview-only (not draggable/editable) - edit
  the `PULLDOWN` record directly via the record picker instead.
- `CHCCTL` (per-choice runtime logic) has no visual representation.

## [0.2.0] - Unreleased

### Added
- Subfile (`SFL`/`SFLCTL`) rendering: the paired subfile record's row template
  is repeated `SFLPAG` times with correct vertical spacing, resolved from
  either side of the pairing (previewing the control record or the subfile
  record itself both work).
- `WINDOW` rendering: field positions are correctly interpreted as relative
  to the window's own origin (not absolute screen coordinates), with a
  bordered box drawn at the declared size and an optional `WDWTITLE` label.
- GUI-style widget rendering: `SNGCHCFLD`/`MLTCHCFLD` fields with `CHOICE`
  entries render as radio/checkbox groups; `PSHBTNFLD` fields render as
  buttons.
- Dragging now uses delta-based coordinate math instead of writing the
  absolute rendered position, so moving a windowed field correctly updates
  only its window-relative position (the `WINDOW` keyword itself is
  untouched), and moving any visible subfile row instance correctly moves
  the one template row that actually exists in the DDS source.
- Field selection/editing now resolves across all record formats, since a
  subfile row's fields belong to the paired `SFL` record rather than the
  currently-previewed `SFLCTL` record.

### Known limitations
- `WINDOW(*DEFINE ...)` named-window references aren't resolved.
- Menu-bar (`MNUBAR`/`MNUBARCHC`) cascading pulldown interaction isn't
  implemented - `PULLDOWN` records render their choice fields but there's no
  simulated menu-bar trigger.
- Dragging a subfile row moves one field at a time; there's no "drag the
  whole row" multi-field selection yet.

## [0.1.0] - Unreleased

### Added
- DDS display-file parser (`dspfParser.ts`): fixed-column format, multi-line
  AND/OR indicator conditioning, `+`/`-` keyword continuation, constants,
  file/record/field-level keywords.
- Screen resolver and HTML renderer (`dspfEngine.js`): indicator-conditioned
  visibility, relative (`+n`) column offsets, `COLOR`/`DSPATR` styling,
  position-sequence overlap resolution.
- Source write-back (`dspfWriter.js`): regenerates only the affected field's
  source line(s) and splices them back in, leaving everything else
  byte-identical.
- Interactive webview editor: click to select, drag to move, edit
  name/length/type/decimals/usage/keywords, with changes applied to the
  real document via `WorkspaceEdit`.
- Bidirectional sync between the visual editor and the text editor.

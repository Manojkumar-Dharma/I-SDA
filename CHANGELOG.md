# Changelog

All notable changes to the iSDA extension are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.9.25] - Unreleased

### Added
- **Per-keyword indicator conditioning.** Every keyword chip (field,
  record, file-attribute, and help-entry panels) now gets its own
  "Conditioning" toggle mounting the same `conditionsEditorHtml`/
  `wireConditionsEditor` pair the entity-level case already used, but
  scoped to that ONE keyword - e.g. conditioning just a field's `DSPATR`
  while its `COLOR` (and the field itself) stay unconditional. The
  parser/writer already round-tripped `keyword.conditions` correctly;
  this was purely the missing second mount point. `keywordEditorHtml`/
  `wireKeywordEditor` moved from `buildWebviewTemplate.js` into the
  shared `webviewClientHelpers.js` to carry this - same functions now
  back all four DSPF-designer panels (field/record/file/help) plus the
  menu designer's new file-attributes panel below. Toggle-expanded state
  survives re-renders via a caller-owned `Set`, same convention the menu
  designer's own per-option conditioning toggle already used.
- **Menu designer: File attributes panel.** A collapsible "File
  attributes" section in the sidebar (matching this designer's own
  toggle convention rather than the DSPF designer's separate
  properties-panel view, since there's no "click something, panel
  swaps" mechanism here) exposing the file's `fileKeywords` (`DSPSIZ`,
  `REF`, `PRINT`, etc.) via the same shared keyword-chip editor as
  above - nothing menu-specific about these keywords, so no separate
  primitive was needed.
- **Menu designer: Copy option.** Each option row gets a Copy button
  duplicating its underlying constant(s) via `DspfWriter.copyField` -
  the exact primitive the DSPF designer's own field/constant Copy button
  already used. Handles both option forms: a combined `"N. label"`
  single constant, and the split form (separate number-marker and label
  constants), copying and re-aligning both onto the same new row for the
  split case. Since two options can't share a number the way two
  arbitrary duplicated constants could, the copy's number is rewritten
  afterward to (current highest option number) + 1 - copyField itself
  doesn't need to know about that; it stays exactly what it already was.

### Fixed
- A handful of existing tests (`dspfWebview.test.js`) referenced the
  keyword editor's old, un-namespaced element ids (`p-keywords`,
  `p-add-kw`, etc.), which the shared-editor move above renamed to
  `ownerKey`-scoped ones; updated to match.

## [0.9.24] - Unreleased

### Changed
- **README's "Known limitations" section pruned to pending items only.**
  Reviewed every entry against the actual code (command keys, the
  function-key legend, indicator conditioning, `copyField`,
  `addDisplaySize`, the file-attributes panel, and `reorderFields` all
  verified as genuinely implemented and wired into the UI - not just
  claimed) and removed the completed ones rather than leaving them
  struck through; that history now lives only in CHANGELOG.md, where it
  was already recorded in full. What remains in the README: whole-record
  create/copy/delete, per-keyword indicator conditioning, the menu
  designer's still-missing file-attributes/copy-field panels, and the
  unchanged DSPF/menu-designer-only lists (window resize handles,
  `CNTFLD(n)` wrapping, "Create New Menu", etc.) - all re-checked against
  the code and still accurate as of this version.

## [0.9.23] - Unreleased

### Added
- **`DspfWriter.addDisplaySize()`** - the writer action called out in the
  README's known limitations: the size picker could only switch BETWEEN
  sizes a file already declared via `DSPSIZ`, with no way to add a second
  one to a single-size (or no-`DSPSIZ`) file. Shared between the DSPF and
  Menu designers (both already call into `dspfWriter.js`), since DDS's
  `DSPSIZ` keyword works identically in either file type and supports at
  most two sizes. Replaces an existing single-size `DSPSIZ` line in place;
  writes a brand-new one (anchored before the first record) when the file
  declares none at all; names a previously-unqualified single size `*DS3`
  so both sizes stay addressable (DDS requires a name once there's more
  than one); and throws rather than writing an invalid third size. Covered
  by 5 new cases in `dspfWriter.test.js`. UI wiring (an "Add size" action
  in the size-picker row) is not included yet - this is the backend
  primitive the README specifically flagged as missing.
- **Menu designer's Commands panel now works for IFS streamfiles**, not
  just remote source members and local files. A MNUDDS opened as an IFS
  streamfile through Code for i (`streamfile:` scheme) previously reported
  `"unsupported"` and disabled option editing entirely, even though a
  streamfile is just a real file with a real path - no different in shape
  from the local `file:` scheme case already supported since 0.9.15. Reuses
  that same sibling-file convention (`<basename>QQ.mnucmd` next to the
  `.mnudds` streamfile, in the same IFS directory), routed through
  `vscode.workspace.fs` so reads/writes go through Code for i's own
  FileSystemProvider for that scheme - no new I/O path needed. The
  remaining genuinely-unsupported case is a scheme with no sensible place
  to derive a companion file at all (e.g. `untitled:` - an unsaved buffer
  has no directory).
- `menu.test.js` extended: an IFS streamfile with no companion sibling yet
  reports `'missing'` (not `'unsupported'`) and derives the right filename;
  editing an option writes the sibling file to the correct IFS path;
  an existing sibling is picked up and reports `'loaded'`; and the
  remaining-unsupported case is re-verified against `untitled:` instead of
  `streamfile:`, since the latter is now a supported scheme.
- **Copy field/constant**, from the Aug 2026 SDA-parity audit's Common
  backlog (item 1 - "build once, both webviews benefit"). New
  `DspfWriter.copyField(record, sourceLines, field, options)` primitive:
  duplicates a field or constant with its length/type/decimals/usage/
  keywords/conditions intact, via the existing `insertField` placement
  rule (appended at the bottom of the record's field list). A named
  `FIELD` needs a distinct name - DDS doesn't allow two same-named fields
  in one record format - so a new `nextAvailableFieldName(record,
  baseName)` helper generates one (`CUSTNAME` -> `CUSTNAME2` ->
  `CUSTNAME3`, truncating to stay within the 10-char DDS name limit); a
  `CONSTANT` copies straight across since it has no name to collide on.
  `options.name`/`options.location` let a caller override either; the
  default location is one row below the original, same column - a
  starting point to drag from, not a placement guarantee (no collision/
  bounds checking, consistent with `insertField` itself).
  Wired into the DSPF designer's Properties panel: a "Copy field"/"Copy
  constant" button next to Apply changes, plus a Ctrl+D (Cmd+D on macOS)
  keyboard shortcut alongside the existing Delete/Backspace handler (same
  guards: not while typing in a props-panel input, not mid-drag). The
  copy is selected immediately after so it can be dragged into place. The
  menu designer doesn't consume this yet (duplicating an option means
  copying its number-marker *and* label constants together with a fresh
  option number, not a single field/constant copy) - left as future work,
  noted in the backlog.
  Tests: `dspfWriter.test.js` covers `copyField` directly (named-field
  auto-naming, explicit name/location overrides, back-to-back copies not
  colliding with each other, constant copying, and
  `nextAvailableFieldName`'s truncation); `dspfWebview.test.js` runs the
  actual generated client-side script in jsdom to cover the Copy button,
  the Ctrl+D shortcut, and the input-guard against firing while typing.

### Fixed
Investigated 5 issues reported against a real production DDS file,
reproducing each empirically before changing anything.

- **A bare `CONSTANT`'s resolved width was clamped to a 1-character
  placeholder instead of its real text length.** This wasn't just a
  rendering-width nuance - the same value drives the column position of
  any LATER field on the same line using relative-column syntax, so an
  under-counted constant could silently shift where a subsequent field
  actually lands. Root-caused and fixed in `resolveRecordFields` directly
  (removed the narrower workaround added in 0.9.12 only for
  `validateSizeBounds`, no longer needed there). This is what actually
  caused "two indicator-conditioned fields at the same screen position,
  neither one renders" - the underlying condition-evaluation logic was
  already correct once tested with correctly-typed indicator values.
- **Subfile preview rows spaced far apart instead of stacking
  immediately below one another.** Hidden/program-to-system fields
  (`usage(H)`/`usage(P)`) with no explicit position - a common real
  pattern, e.g. helper fields declared before a row's visible fields -
  fell back to "line 1" in the row-height calculation, badly inflating
  it. Reproduced directly against a real SFLCTL/SFL pair: rows landed 9
  lines apart instead of 1. Fixed in both places this row-height logic
  was duplicated (the SFLCTL-side preview and the SFL-side "Preview
  SFLPAG rows" mode).
- **The DSPF designer's Properties panel had no way to edit a
  constant's literal text at all** - only its position, via drag. The
  writer already fully supported it (`DspfWriter.applyFieldUpdate`'s
  `constantValue` handling); only the UI input was missing. Added a
  Text field for constants, replacing the Name/Length/Data type/Usage
  inputs that don't apply to one.
- **Menu options could be placed below the "Selection or command"
  prompt.** DDS has no keyword that specifically marks that prompt, so
  this uses the structural signal a real menu always has instead: the
  record's own lowest input-capable field (`usage(I)`/`usage(B)`) -
  virtually always the command-line input itself. New-option placement
  (both the auto-computed default AND a manually-typed row override) is
  now capped above that row, not just the raw `DSPSIZ` bound.
- Confirmed the reported "option text gets truncated in the sidebar" is
  **not a data bug** - the input's underlying value was always the full,
  correct text; only the visible box was too narrow for long labels.
  Added a `title` attribute so hovering reveals the full text.

15 new/updated tests across `dspfEngine.test.js`, `dspfWebview.test.js`,
and `menuWebview.test.js`. 309 assertions total, 0 failures.

### Added
- **Indicators & CAxx/CFxx pass**: command-key assignment (`CAxx`/`CFxx`)
  at both file level and per-record, with cross-scope exclusion (a key
  number claimed at one level is greyed out at the other, and switching a
  key's type CA&harr;CF never leaves a duplicate) via new
  `DspfWriter.setCommandKey`/`removeCommandKey`/`availableCommandKeyNumbers`,
  with a matching panel in both the DSPF and menu designer sidebars.
  `DspfEngine.resolveFunctionKeyLegend` merges file-level + record-level
  keys (record wins on a shared number) into an F-key legend strip above
  the preview in both designers, active/inactive styling driven by
  whichever indicators are currently simulated. New
  `getFileKeywordsLineRange`/`applyFileKeywordsUpdate` writer primitives
  give `dspfWriter.js` its first general way to rewrite the file's own
  keyword block at all (previously only surfaced through the Command keys
  panel - see the File-level attributes panel entry below for the
  general-purpose editor). Field/constant/record indicator conditioning
  (`field.conditions`/`record.conditions`) - previously silently ignored
  by `applyFieldUpdate`/`applyRecordUpdate` even though the parser/writer
  round-tripped it correctly - now has a shared editor (add/remove OR'd
  groups, AND'd indicators up to DDS's 9-per-entity limit, NOT flag per
  indicator) wired into the DSPF designer's field and record Properties
  panels, and into the menu designer's option rows (a menu option is a
  DDS constant under the hood, so it conditions the same way; applied to
  both the option's number marker and its label text together). This
  pass conditions the entity itself, not an individual keyword on it -
  that per-keyword case is still open (see README backlog).
- **File-level attributes panel** (DSPF designer). A new "File
  attributes" button in the sidebar opens a file-level keyword view in
  the Properties panel, reusing the same keyword-chip editor every other
  panel already has (add/remove commits immediately, no separate Apply
  button - same pattern the Record and Help-entry panels use), built on
  the `getFileKeywordsLineRange`/`applyFileKeywordsUpdate` primitives
  above. `fileKeywords` (`DSPSIZ`, `REF`, `PRINT`, etc.) were already
  parsed but had no general-purpose UI until now; `CAxx`/`CFxx` stay on
  their own dedicated Command keys panel, which has purpose-built
  add/remove controls the generic keyword editor doesn't. The menu
  designer's sidebar doesn't get this view yet - noted as remaining work
  in the README, same as Copy field/constant's menu-designer gap.
- **Sort elements within a record** (DSPF designer): a record's
  fields/constants can now be reordered in the DDS *source* (top-to-bottom
  file order - not their on-screen row/col, which this never touches).
  New `DspfWriter.reorderFields(record, sourceLines, orderedSourceLines)`
  primitive moves each field's own physical lines as a whole verbatim
  chunk (never regenerates them, so nothing about an individual field's
  content changes) into the requested order; throws rather than silently
  dropping a field if the given order isn't exactly a permutation of the
  record's current fields. Any `HELP` entries interleaved among the
  fields keep their own relative slot in the sequence rather than being
  reordered themselves - a caller reordering fields has no reason to
  expect help entries to move too. The "stable sort key convention" the
  backlog note asked for: explicit source order, changed one swap at a
  time via new Up/Down buttons in a "Field order (source)" list in the
  Record properties panel - deliberately simpler than drag-and-drop for a
  feature already flagged low-priority/UI-only.
  Tests: `dspfWriter.test.js` covers `reorderFields` directly (basic
  swap, HELP-entry interleaving, rejecting a bad permutation);
  `dspfWebview.test.js` runs the actual generated client-side script in
  jsdom to cover the File attributes button/panel/Back-to-record flow and
  the Field order Up/Down buttons reordering the real DDS source text.

## [0.9.19] - Unreleased

### Added
- **"+ Add option" now lets you choose where a new option lands**, instead
  of only ever computing its own position. Two new Row/Col fields sit below
  the option number and text - pre-filled with the same smart default the
  auto-placement logic already computed (unchanged if you leave them as-is),
  editable if you want it somewhere else. Choosing an occupied row or one
  past the screen's own `DSPSIZ` size is rejected with a specific reason
  (which row, and why) rather than a generic "no room" message, reusing the
  same bounds-checking `findSafeOptionRow`/`screenLinesForRecord` already
  relies on - no new placement logic, just a new front door to the existing
  validation.
- `menuWebview.test.js` extended: the Row/Col fields pre-fill correctly,
  leaving them untouched still places the option the same way as before,
  an explicit override is honored exactly, and both rejection cases (an
  occupied row, a row past the screen size) show the right specific error
  and post no edit.

## [0.9.18] - Unreleased

### Fixed
- **"+ Add option" now picks a smarter starting row for the FIRST option
  in a record.** Previously the first option always started its
  free-row search at a fixed row 6, regardless of what the record
  already contained - a taller title/header block (a common real layout:
  a title, a couple of info lines, a divider) could push the actual
  first free row well past 6, or the search would simply skip forward
  over occupied rows to find one that worked, landing wherever that
  happened to be rather than naturally right after the existing content.
  Now starts the search right after the record's own highest occupied
  row (falling back to the original row 6 only for a genuinely empty
  record, unchanged from before). The existing forward-search-for-a-
  free-row and DSPSIZ-bounds behavior (added in 0.9.5/0.9.9) already
  meant this was never a correctness bug - a field was never actually
  overwritten - just a worse starting guess than necessary.

## [0.9.17] - Unreleased

### Fixed
- **Date (`L`) field width now also honors record- and file-level
  `DATFMT`**, not just a `DATFMT` keyword on the field itself - closing
  the gap explicitly flagged as remaining when field-level `DATFMT`
  support was added (0.9.13). Follows real DDS precedence: field keyword,
  then record keyword, then file keyword, then the `*ISO` default if none
  is specified anywhere. Required threading `dspfFile` through
  `resolveRecordFields()` (5 call sites, all already had it in scope) so
  `displayLength()` could check all three levels.

## [0.9.16] - Unreleased

### Fixed
- **Multiple runtime-positioned `WINDOW`s (`*DFT`, or a program-to-system
  field name) no longer render exactly on top of each other in compare
  mode.** The actual runtime position genuinely can't be known at design
  time - that's not fixable - but every such window previously fell back
  to the identical fixed placeholder spot, so comparing two or more of
  them together made them visually indistinguishable, stacked precisely
  on top of one another. Each is now staggered from the others when more
  than one shows at once. Single-record preview (only one window ever on
  screen there) is completely unchanged - verified only the compare-mode
  code path was touched. Confirmed by tracing the actual drag/edit
  coordinate math (a delta-based commit that cancels out the window
  offset) before making any change - editing fields inside a
  placeholder-positioned window was already correct and untouched by this.

## [0.9.15] - Unreleased

### Added
- **Local `.mnudds` files now support the options panel**, not just remote
  IBM i members via Code for i. Previously opening a local `.mnudds` file
  showed the screen preview but the options panel reported "unsupported" -
  there was no local equivalent of the `<name>QQ` remote member
  convention. Now derives a local companion file the same way: a sibling
  file in the same directory named `<basename>QQ.mnucmd` (lowercase,
  matching how `.mnudds` itself is used locally) - e.g. `MYMENU.mnudds`
  pairs with `MYMENUQQ.mnucmd` next to it. Every existing options-panel
  code path (read, edit, external-edit echo, create-on-first-write) was
  already gated purely on whether a companion URI could be derived at
  all, with no other scheme-specific logic anywhere else - so deriving a
  valid local URI was the entire fix; nothing else needed to change.
  `dspfDesigner.compileMenu` deliberately stays remote-only (compiling
  genuinely requires a live IBM i connection) and is unaffected.
- `menu.test.js` extended: a local file with no companion sibling yet
  (reports "missing", not "unsupported"), editing an option writes the
  correct sibling path, a local file with an existing companion sibling
  loads its content, and a scheme with no known companion convention at
  all (e.g. a Code for i streamfile) still correctly reports "unsupported".

## [0.9.14] - Unreleased

### Fixed
- **"Compile Menu" no longer destructively rebuilds the message file on
  every compile.** Picked as the highest-priority remaining menu-designer
  gap - a real data-loss risk in the core compile workflow: any message ID
  added to the `QQ`-derived `*MSGF` by hand outside iSDA (or by another
  tool) was silently wiped on the next compile, since the previous
  implementation deleted and recreated the file from scratch every time.
  Now creates the message file only if it doesn't exist yet (tolerating an
  "already exists" failure rather than treating it as fatal), and updates
  each option's message in place - `ADDMSGD` first, falling back to
  `CHGMSGD` when that message ID is already there from a previous compile.
  Nothing outside the `USRnnnn` IDs iSDA actually writes is ever touched; a
  stale ID left behind after an option is deleted in the designer stays in
  the file, unused but harmless, rather than the whole file being wiped to
  remove it.
- `compileMenu.test.js` updated for the shorter, non-destructive command
  sequence, plus new coverage: `CRTMSGF` "already exists" is tolerated
  rather than fatal, and a failing `ADDMSGD` correctly falls back to
  `CHGMSGD` without failing the whole compile.

## [0.9.13] - Unreleased

### Fixed
- **Date (`L`) field display width now honors the field's own `DATFMT`
  keyword**, instead of always assuming 10 characters (correct for the
  `*ISO`/`*USA`/`*EUR`/`*JIS`/`*JOB` formats, but wrong for `*MDY`/`*DMY`/
  `*YMD` at 8 characters and `*JUL` at 6 - verified against IBM's own DDS/
  RPG/CL date-format references before implementing). This directly feeds
  the size-bounds validation added in 0.9.12 - a misjudged date field
  width could previously produce a wrong bounds warning (or miss a real
  one). Record- and file-level `DATFMT` inheritance isn't read yet, only
  a `DATFMT` keyword on the field itself.
- The decimal-point width rule for numeric fields (an extra position for
  a keyable decimal point) now also covers `usage(B)` fields, not just
  `usage(I)` - both are keyable, only `usage(O)` (output-only) isn't.

## [0.9.12] - Unreleased

### Added
- **Remote member creation for "Create New Display File"** - the command
  that could previously only write to local workspace folders now offers a
  destination choice (local workspace / connected IBM i system) whenever
  Code for i is installed and connected. The remote path prompts for
  library (blank uses the library list, `*LIBL`) and source physical file,
  runs `ADDPFM FILE(lib/file) MBR(member) SRCTYPE(DSPF)` via Code for i's
  `instance.getConnection().runCommand()`, then writes the generated
  boilerplate into the new member via its `member:` scheme URI and opens it
  straight into the designer - reusing the exact same `openDesigner()` path
  as local files, since the `CustomTextEditorProvider` doesn't care whether
  the underlying URI is `file:` or `member:`.
  - Deliberately scoped to **not** auto-create the source physical file
    (`CRTSRCPF`) if it doesn't exist - `ADDPFM` requires it to already
    exist, confirmed against IBM's own command reference before
    implementing rather than guessing, and inventing `CRTSRCPF` parameters
    (record length, etc.) I hadn't verified felt like the wrong kind of
    risk for a command that writes to a real, sometimes-shared IBM i
    system. `ADDPFM`'s real failure message is surfaced verbatim instead.
  - Access to Code for i's extension API (`vscode.extensions.getExtension('halcyontechltd.code-for-ibmi')`)
    is deliberately loosely-typed rather than taking a hard dependency on
    `@halcyontech/vscode-ibmi-types`, so the feature degrades gracefully
    (falls straight through to local creation, no behavior change) when
    Code for i isn't installed or isn't connected - verified via a new
    test file, `src/test/createNewDspf.test.js` (20 checks): the
    no-Code-for-i fallback, ADDPFM command construction (with and without
    an explicit library), the `member:` URI shape, ADDPFM failure handling
    (real CPF error surfaced, nothing written), and respecting an explicit
    "local" choice even when Code for i is connected.
- **Warns when an unconditioned field won't fit every declared `DSPSIZ`
  size.** Real DDS: a field's position is absolute and shared across every
  declared size unless it's explicitly display-size-conditioned, so a
  layout that compiles/renders fine at one size can silently fail to
  compile (or misrender) at the other - nothing in iSDA warned about this
  until now. The DSPF designer shows a warning banner under the
  screen-size picker (only for files that declare more than one size),
  checked against ALL declared sizes regardless of which one is currently
  being viewed, via a new `DspfEngine.validateSizeBounds()` that reuses
  `resolveScreen`'s own field-position resolution rather than re-deriving
  it - a field explicitly conditioned to one size only is naturally
  excluded from sizes it never renders at. Along the way, fixed a related
  latent inaccuracy this surfaced: the resolved field object's `.length`
  is a placeholder (clamped to 1) for a bare `CONSTANT`, since constants
  have no declared DDS `LENGTH` column - `validateSizeBounds` now uses the
  real rendered text length for those.

## [0.9.11] - Unreleased

### Added
- Deleting a named field now warns if something elsewhere looks like it
  still references it by name (e.g. `REFFLD(name)`) - same advisory scan
  rename already used, applied on delete. No auto-fix (there's nothing
  sensible to rewrite a deleted field's reference TO), just a heads-up.
  Doesn't apply to menu options - those are always unnamed constants, so
  there's nothing to search for.

## [0.9.10] - Unreleased

### Added
- **Record rename now auto-rewrites the cross-references it can safely
  identify**, instead of only warning about them. `SFLCTL(name)`,
  `WINDOW(record-format-name)`, and `MNUBARCHC(id record-name 'text')` are
  rewritten to the new name automatically - using the same structural
  parsing logic `dspfEngine.js` already relies on to resolve these
  keywords at render time, not a heuristic text scan, so it can't misfire
  on a comment or a constant's display text that happens to share the same
  characters. Anything outside those three shapes still gets the existing
  advisory warning, now shown only for what's genuinely left over after
  the auto-fix. New `DspfWriter.renameRecordReferences()`, wired into both
  designers' rename flow.

## [0.9.9] - Unreleased

### Fixed
- **Display-size condition names (`*DS3`/`*DS4`, or a user-defined name like
  `*LARGE`) were silently misparsed into garbage indicators, making any
  field conditioned this way invisible in the preview regardless of which
  screen size was selected.** Per IBM's own DDS reference, a display-size
  condition name occupies the SAME columns as regular indicator
  conditioning (positions 8-16) - a different interpretation of that
  space, not a separate column range - and the parser only ever understood
  the indicator interpretation. A field conditioned like:
  ```
       A  *DS4                            2 90'WIDE SCREEN ONLY'
  ```
  got read as two bogus pseudo-indicators (`"*D"` and `"04"`) instead of a
  display-size condition, which - since no real indicator is ever literally
  named `"*D"` - meant the field's condition could never be satisfied, in
  either screen size. Verified directly against the parser before fixing.
  Now recognized (detected by position 9 being `*`) and threaded through
  the whole rendering pipeline: `resolveScreen`/`resolveMultiScreen` pass
  the currently-selected size's own name (already exposed as `screen.sizeName`
  from the 0.9.6 dual-`DSPSIZ` work) down through `conditionsSatisfied` and
  `styleFromKeywords`, so a size-conditioned field or keyword now correctly
  shows only when its screen size is the active one - independent of, and
  alongside, ordinary indicator conditioning. Writer round-trips it
  correctly too (editing/dragging a size-conditioned field preserves its
  condition exactly, verified with a real edit-and-reparse test).
  - Handles the `N*DS4` (NOT) form and user-defined condition names
    (`*LARGE`/`*NORMAL`-style), not just the built-in `*DS3`/`*DS4`.
  - **Not yet covered**: boundary validation - IBM's guidance that an
    *unconditioned* field's position must fit within the smaller of the
    declared sizes (24x80 is the universal minimum) isn't checked or
    warned about; an oversized unconditioned field just renders wherever
    its coordinates say, same as before this fix. This would need webview
    UI work (a warning surfaced somewhere in the screen designer) that
    felt like a separate, smaller follow-up rather than bundling it into
    this fix, especially since that file is shared with active work from
    another session.
- `src/test/dspfParser.test.js` (new): direct parser coverage - the exact
  bug case (constant text unaffected, condition correctly recognized as
  `displaySizeCondition` not indicators), the NOT form, a user-defined
  name, confirms regular indicator conditioning is unaffected, and a
  writer round-trip through an edit.
- `dspfEngine.test.js` extended: a field/keyword shown only in one of two
  declared sizes renders correctly in both directions (present in one,
  absent in the other, and vice versa for an `N*DS4`-conditioned one), and
  a `DSPATR` keyword conditioned by size applies its style only when active.
- `src/fixtures/lineBuilder.js` extended with a `sizeCondition` option
  (e.g. `sizeCondition: '*DS4'` or `'N*DS4'`) for building test fixture
  lines - purely additive, existing `ind1`/`ind2`/`ind3` usage unchanged.

## [0.9.8] - Unreleased

### Added
- Record format rename in the DSPF/screen designer (Properties panel) -
  previously menu-designer only. Validates the name, checks for collisions,
  and warns (without rewriting) if other lines look like they reference the
  old name (`SFLCTL`, `WINDOW`, `MNUBARCHC`, etc.).
- Delete a field/constant in the DSPF designer via Delete/Backspace on the
  current selection.
- Delete a menu option via a × button per row - removes its DDS constant(s)
  and MNUCMD command mapping together.
- No confirmation prompts for delete - like every edit here, it's a
  `WorkspaceEdit`, so Ctrl+Z undoes it.

### Fixed
- Editing a wrapped multi-line constant (e.g. a long menu label) left
  orphaned duplicate lines behind instead of removing the old ones - the
  model didn't track a bare literal's continuation lines. Fixed via
  `entrySourceLines` on `DdsFieldBase`; found while building delete above,
  since deleting on the same bug would have corrupted files too.
- De-duplicated the menu designer's rename validation/cross-reference scan
  into `webviewClientHelpers.js`, shared by both designers now.
- De-duplicated four near-identical "apply this DDS edit" functions in the
  DSPF designer into one `commitSourceChange` helper.

## [0.9.7] - Unreleased

### Changed
- Redesigned the menu designer's options panel: card layout, number badges,
  persistent field labels (`Option text` / `CMD>`), drag-handle glyph,
  option count header. Purely visual - read/write logic unchanged; tests
  updated for the renamed `.option-num` → `.option-num-badge` selector.

## [0.9.6] - Unreleased

### Added
- Screen-size picker for display files that declare two `DSPSIZ` sizes
  (e.g. `DSPSIZ(24 80 *DS3 27 132 *DS4)`) - previously only the first was
  read. Hidden when a file declares only one size (the common case).
  Changes the visible working area only - field positions stay absolute.

### Fixed
- A large `SFLPAG` (or a `SFLSIZ(9999)`-style "unlimited" pattern) could
  render subfile rows past the bottom of the screen - now capped to the
  working area, with the status hint noting when capping occurs.
- The menu designer's "+ Add option" screen-space bound (0.9.5) never
  actually read `DSPSIZ` - a doubly-escaped regex (`/\\d+/g`) never matched
  a digit, so it silently used a 24-row fallback for every file. Now shares
  the same tested `DSPSIZ` parser as the screen-size picker.
- De-duplicated `rebuildRecordSelect` and HTML-escaping between the two
  webviews into `webviewClientHelpers.js` / `DspfEngine.escapeHtml`.

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

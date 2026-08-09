# Changelog

All notable changes to the iSDA extension are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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

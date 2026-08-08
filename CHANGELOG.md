# Changelog

All notable changes to the I-SDA extension are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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

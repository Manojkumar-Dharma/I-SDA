# Changelog

All notable changes to the iSDA extension are documented here. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

Entries here are intentionally terse — one line per version, what shipped
and why. For full implementation detail, rationale, and test-file
references on any entry, see `git log` (each version has a matching
commit) or `git show <tag/commit>`. Feature-level detail belongs in
[`README.md`](README.md); open/tracked work belongs in
[`docs/sda-reference/LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md).

## 2026-09-03 — Arrow-key nudge now respects window/subfile boundaries too (Tasks L39 + L40 follow-up)

- **0.10.26** — Follow-up to Tasks L39/L40 (0.10.22): the mouse-drag boundary fixes didn't cover arrow-key nudging, since `nudgeSelected` moves fields using source coordinates rather than `startDrag`'s render coordinates. A new `computeNudgeBounds` helper (source-coordinate sibling of `computeDragBounds`) now enforces the same two rules for arrow-key nudge, in both the single-field and multi-select paths: a field inside a `WINDOW` record can't be nudged on/outside the window's own border, and a field in a paired `SFL`/`SFLCTL` subfile can't be nudged onto a line the other half's own fields occupy.

## 2026-09-03 — Add-comment row can now enter the comment's text, not just where it lands (Task L46)

- **0.10.25** — Task L46: "+ Add comment" always inserted a blank comment line, even after L45 let you pick which line it landed on — you still had to type the wording in as a separate edit right after. Asked directly once L45 shipped ("Do I have option to enter the comment line text option in this build?"). The add-row now has its own text box alongside the line-number one, on both the file-level and record-level Comments tabs — type the line and the wording together, click Add, done. Leaving it blank still adds an empty comment line exactly like before.

## 2026-09-03 — Record-level comments get the same "insert at line #" option file-level already had (Task L45)

- **0.10.24** — Task L45: the "Line #" input next to "+ Add comment" (built generically by L42) only ever rendered on the file-level Comments tab — the record-level Comments section right below it in each record's Structure tab never had `allowCustomLine` turned on, and its own commit callback still silently dropped a line number even if one had somehow been supplied. Both are now wired through identically to the file-level tab: type a target line, the new comment lands exactly there.

## 2026-09-03 — Ctrl+D/Ctrl+V now ask where the copy lands too (Task L44)

- **0.10.23** — Task L44: the "Copy" button in the field props panel already lets you click the canvas to choose exactly where a copy lands (and, since L43, rename it there too) - but single-field Ctrl+D (duplicate) and Ctrl+V (paste) both skipped that and landed the copy one row below the original with no placement step at all. Both now go through the same click-to-place flow as the Copy button. Multi-select (2+ field) Ctrl+D/Ctrl+V are unchanged - there's no "place a whole block" UI yet, same as the Copy button itself only ever handling one field.

## 2026-09-03 — Field drag stays inside its own region (Tasks L39 + L40)

- **0.10.22** — Dragging a field/constant inside a `WINDOW` record can no longer be dropped on or outside the window's own border (Task L39); dragging a field belonging to either half of a paired `SFL`/`SFLCTL` subfile can no longer be dropped onto a line the OTHER half's own fields occupy (Task L40). Both match real SDA's own Design Image screen behavior. Applies to single-field drag, multi-select group drag, and the SFLPAG-preview group-drag path. Arrow-key nudging is not yet covered for either (tracked as a follow-up).

## 2026-09-03 — File-level conditioning indicators now shown, copy placement supports renaming (Task L43)

- **0.10.21** — Task L43: an indicator used only on a file-level keyword (a command key, `ALARM`, etc.) now shows up in the left panel's "Conditioning indicators (preview)" list — it was previously invisible there since only record/field-level conditioning was collected. The copy-placement panel (Task L36) now also lets you rename the copy (for a named field, pre-filled with the same auto-generated name it would otherwise use) or edit the text (for a literal constant, pre-filled with the original) before placing it, instead of always keeping the source's name/text unchanged.

## 2026-09-03 — Comment line numbers + choose-where-to-add (Task L42)

- **0.10.20** — Task L42: the file-level Comments tab's rows previously showed only the comment text with no indication of which source line each one lived at, and "+ Add comment" always appended after the last existing comment. Every comment row (file-level and record-level) now shows its own source line as a small "L{n}" badge, and the file-level tab gained an optional "Line #" input next to Add comment — type a target line and the new comment lands exactly there, pushing everything from that line down by one; left blank, it still appends at the end as before. `DspfWriter.addComment` gained an optional `desiredLine` parameter to support this, clamped to a safe range.

## 2026-09-02 — WDWBORDER real-world single-quoted *CHAR fix (Task L41)

- **0.10.19** — Task L41: a `WDWBORDER` whose `*CHAR` sub-parameter was written as ONE combined character string (real-world DDS's actual documented syntax, e.g. `(*CHAR '        ')`) rather than 8 separate quoted literals (this codebase's own written format) rendered no border at all — the whole string landed in position 0, wrongly triggering "char mode" for an all-blank border and suppressing the plain colored box border in favor of rendering nothing. `resolveWdwBorder`/`getWdwBorder` now split a single quoted group's own characters across the 8 positions; multiple quoted groups still map one-to-one, unchanged. Reported with reference screenshots (iSDA showing no border, real SDA showing a solid blue box, and the DDS source itself).

## 2026-09-02 — Source modification tracking (Task L38)

- **0.10.18** — Task L38: an optional way to keep edit history inside the DDS source itself. When "Track modifications" is on (a checkbox + 10-char tag box in the properties panel, or the `isda.trackSourceModifications`/`isda.modificationTag` settings), any edit that changes an existing source line now comments the original line out (column 7) immediately above the new one instead of silently overwriting it, and the new/changed line gets the typed tag written to columns 81-90 — past what the DDS compiler ever reads. Off by default; a global setting supplies the session's starting values, a per-session toggle in the panel overrides them without writing back. Scoped to the DSPF designer for this pass.

## 2026-09-02 — File-panel cleanup + "Find keyword" quick-nav (Task L37)

- **0.10.17** — Task L37: the "File" section-label in the left panel moved up next to the filename (right under the "Screen Design" heading) and is now bold, instead of sitting stranded near the bottom; the redundant standalone "File attributes" button was removed (the "File" crumb at the top of the properties panel already opens the same view one click away — the bold "File" label now does too). The properties panel also gained a "Find keyword" search box that jumps straight to a keyword wherever it lives — any tab/subtab, or the Advanced/raw-keywords list — switching tabs, opening accordions, and scrolling/flashing the match as needed.

## 2026-09-02 — Copy field/constant now asks where to place the copy (Task L36)

- **0.10.16** — Task L36: the "Copy field"/"Copy constant" button in the properties panel used to drop the copy one row directly below the original (same column), overlapping it on screen for single-line fields. It now reuses the same click-to-place flow "+ Field"/"+ Constant" already have — click Copy, then click the screen preview to choose where the copy lands (still editable as line/column numbers) before it's inserted. Ctrl+D, Ctrl+X/C/V, and multi-select "Duplicate selection" are unchanged.

## 2026-09-02 — Field-drag off-origin jump fix (Task L33)

- **0.10.15** — Task L33: field-dragging (`startDrag`/`startGroupDrag`) had the identical absolute-snap-to-cursor bug L30 fixed for window-dragging — grabbing a field anywhere other than its exact top-left cell jumped it instead of preserving the click offset. Both now thread the mousedown event through and compute moves as a delta from the grab point, same as `startWindowMove`. Deferred sliver from L30.

## 2026-09-02 — Partial WDWBORDER per-sub-parameter defaults (Task L32)

- **0.10.14** — Task L32: a `WDWBORDER` keyword that's present but only sets SOME of its sub-parameters (e.g. only `*DSPATR`, or only `*COLOR`) now gets IBM's own documented default for each sub-parameter group left unset (`*COLOR` -> blue, `*CHAR` -> the period/colon pattern), matching the "entirely absent" default L29 already applied — an explicit `*COLOR`/`*CHAR` still always wins. Deferred sliver from L29.

## 2026-09-02 — Cmd key multi-instance conditioning, CMP legacy synonym (Tasks L31, L34)

- **0.10.13** — Task L31: command keys (`CAnn`/`CFnn`) now support multiple independently-conditioned instances of the SAME key number (e.g. F3 reading "Exit" under one indicator and "Cancel" under another), a deferred sliver from L27. New index-based `setCommandKeyAt`/`removeCommandKeyAt` pair edits/removes one specific instance without disturbing a sibling instance of the same number; `allCommandKeyNumbers()` replaces the old already-used-number exclusion in the "+ Add command key" picker.
- **0.10.12** — Task L34: `CMP` (legacy `COMP` spelling, per IBM's own DDS Reference) was invisible to the Validity Check picker entirely; now recognized on read and normalized to `COMP` on write, same rule L22's ROLLUP/ROLLDOWN fix established.

## 2026-09-02 — Cmd key conditioning, panel reorder, window border/drag fixes (Tasks L27–L30)

- **0.10.11** — Task L27: command keys (`CAnn`/`CFnn`) can now carry indicator conditioning. Task L28: the open file's own name in the left panel moved up, right under the panel's own heading. Task L29: windows with no `WDWBORDER` anywhere now get the real DDS-documented default border (period/colon in blue) instead of a plain unstyled box. Task L30: fixed the window move handle snapping to the raw cursor position instead of preserving the drag's grab offset.

## 2026-09-01 — SDA keyword-audit round 2 (Tasks L18–L26)

Direct audit of every real-SDA reference screenshot against iSDA's own
panels, closing the remaining gaps found.

- **0.10.10** — Task L22: `ROLLUP`/`ROLLDOWN` (legacy `PAGEDOWN`/`PAGEUP` spellings) now recognized as the same keyword.
- **0.10.9** — Task L24: `MSGLOC` (message line per display size) was entirely missing; added.
- **0.10.8** — Task L12 follow-up: multi-select "Align" section was missing a Center option.
- **0.10.7** — Task L23: `KEYBRD` dropdown offered the wrong value list; corrected to SDA's actual N/A/X/W/I/D/M/J/O/E/G set.
- **0.10.6** — Task L21: `CHGINPDFT` gained its own HI/RI/CS/BL/UL/LC/ME/MF/FE sub-flag checkboxes.
- **0.10.5** — Overlap warning banner: real DDS silently drops a field overlapping another one; the preview now flags this instead of a field mysteriously vanishing.
- **0.10.4** — `CHKMSGID` (Check Message Identifier): overrides a validity check's default error message.
- **0.10.3** — Task L20: `CNTFLD` wasn't selectable anywhere in the properties panel; added to the General keywords accordion.
- **0.10.2** — Task L18: "IBM i: Connected/Not connected/Not installed" badge in both designer panels.
- **0.10.1** — `CNTFLD` ignored its own conditioning indicator; now correctly checks `kw.conditions` like every other keyword.
- **0.10.0** — Task L17: `DSPATR` on a hidden program-to-system field (`USAGE(P)`) wasn't shown in Color & attributes and got silently dropped on the next edit.

## 2026-08-29 – 30 — Editor-wide features, Create New Display File, comments panel

- **0.9.99** — A "Save" button in both designers' left panel.
- **0.9.98** — Task L14 follow-up: "Add fields from database file" mis-ordered/mixed fields from a multi-format file.
- **0.9.97** — Task L16: system-value constants (`*DATE`/`*TIME`/`*USER`/`*SYSTEM`/`*PAGNBR`) were corrupted by editing and couldn't be created.
- **0.9.96** — Task L14: bulk "+ Fields from database file" — real SDA's own F10 (Database) key, via `DSPFFD`.
- **0.9.95** — "Create New Display File"/"Create New Menu" could silently skip offering a connected IBM i destination.
- **0.9.94** — Task L15: `MNUBARCHC` picker's text input was effectively unusable at narrow panel widths.
- **0.9.93** — Task L10: multi-field select + block move/copy/delete/style, matching SDA's own "Design Image" block convention.
- **0.9.92** — Task L13: Comments panel (file-level and record-level DDS comment lines).
- **0.9.91** — Crosshair (Task L11 follow-up): a position-readout toggle next to "Show ruler".
- **0.9.90** — Task L11: ruler overlay (row/column numbers along the design canvas), matching SDA's own F14.
- **0.9.89** — Task L9 follow-up: "Create New Display File" record-type templates are now genuinely working worked examples, not bare keyword skeletons.
- **0.9.88** — Task M6: Menu designer's left/right panels can now be hidden or minimized.
- **0.9.87** — Command key (`CAxx`/`CFxx`) picker now follows real DDS/SDA scoping rules (a record may override a file-level key; different records may reuse the same number).
- **0.9.86** — Task L9: "Create New Display File" record-type picker (9 real SDA starting types).
- **0.9.85** — Task M3: deleting a menu option now scans for another record format defining the same option number.
- **0.9.84** — DSPF designer: arrow-key nudge and Ctrl+X/C/V cut/copy/paste for the selected field/constant.
- **0.9.82** — Copy option (menu designer) could silently drop the new option from the preview and select the wrong one.
- **0.9.81** — Task M1: menu designer options get the same dedicated-picker treatment DSPF keywords already have.
- **0.9.80** — Task M4: companion `QQ` commands-member concurrency fix (last-write-wins across three edit paths).
- **0.9.79** — Task L5d-ii: record-level "Application Help" picker was reading/writing the wrong keywords array.
- **0.9.78** — Left-panel indicator preview no longer mixes a subfile pairing's two record formats together.
- **0.9.77** — Task L8: `Compile Display File (CRTDSPF)` command, DSPF designer's own counterpart to Compile Menu.
- **0.9.76** — Task L5d-i: record-level Indicator/screen-control panel now uses Task L1's repeatable conditioned instances.
- **0.9.75** — Task L7: `WINDOW` picker's "Restrict cursor to window" checkbox now models the real DDS keyword (it previously wrote a bogus standalone `RSTCSR` line).
- **0.9.74** — Task L6: `WINDOW` picker's "Message line" row — `WINDOW`'s own trailing `*MSGLIN`/`*NOMSGLIN` parameter, not a separate keyword.
- **0.9.73** — Task L5: Input keywords, General keywords, and Database reference now surface per-keyword conditioning.
- **0.9.72** — Choice pulldown/menu: radio/checkbox choices inside a `PULLDOWN` record rendered as an empty box (CSS bug).

## 2026-08-26 – 27 — Task L1 series: multi-instance conditioned keywords

Real DDS allows multiple independently-conditioned instances of the same
keyword (e.g. `COLOR(RED)` under indicator 10 and `COLOR(GRN)` under
indicator 20 on the same field) — every dedicated picker had previously
only ever managed one instance at a time.

- **0.9.71** — Per-keyword Conditioning toggle surfaced across the ~85 remaining `flagRowHtml`/`wireFlagRow` call sites.
- **0.9.70** — Task L5 (piece 3): Message ID (`MSGID`) wired onto the L1 repeatable-instance component.
- **0.9.69** — Task L1d: Keying options picker (`CHECK`'s ME/ER/MF/FE/RB/RZ/RL/LC codes) wired onto L1; shared correctly with Validity check's own use of `CHECK`.
- **0.9.68** — `SNGCHCFLD`/`MLTCHCFLD` (radio/checkbox choice groups) rendered with clipped or wrapped text.
- **0.9.67** — `WDWBORDER`'s `*CHAR` group now renders visually as an actual character overlay.
- **0.9.66** — Constants/fields defaulted to a hardcoded gray instead of green.
- **0.9.65** — "+ OR condition" no longer silently defaults a new condition to indicator `01`.
- **0.9.64** — Task L1c: Subfile Messages panel (`SFLMSG`/`SFLMSGID`) wired onto L1, as two independently-repeatable groups.
- **0.9.63** — Keywords added to a record/field with existing keywords were being appended onto a shared `+`-continued line instead of getting their own line.
- **0.9.62** — Task L1b: Error message picker (`ERRMSG`/`ERRMSGID`) wired onto L1, replacing the old single-instance text box.
- **0.9.55** — File-level Command keys (`CAxx`/`CFxx`) moved into File attributes; foundational Task L1 component (`getRepeatableKeywordInstances`/`setRepeatableKeywordInstances`) built.

## 2026-08-26 – 28 — Record/field picker foundation (R/D-series, SDA parity plan)

Building out the dedicated SDA-style "Select/Define ___ Keywords" pickers
per `PICKER-SCREENS-PLAN.md`, replacing free-typed keyword entry.

- **0.9.54** — Task D4: Constant field wiring (Display Attributes, Colors, General + `HLPID`).
- **0.9.53** — Task R6: `SFLMSGCTL` wiring.
- **0.9.52** — Task R10: `PULLDOWN`-specific record picker.
- **0.9.51** — Task D5: Menu-bar choice fields (`MNB*`/`MNUACT`) — five new panels for `MNUBARCHC`/`MNUBARSEP`/`SNGCHCFLD`/`MLTCHCFLD`/`CHOICE`/`CHCCTL`/`CHCACCEL`/`CHCAVAIL`/`CHCUNAVAIL`/`CHCSLT`.
- **0.9.49** — Task R7: `WINDOW`-specific record picker (geometry, border parameters/color/attributes/characters).
- **0.9.48** — Task R1: Base Record Keywords picker (General/Indicator/App help/Help/Output/Input/Overlay/Print) — reused across `RECORD`/`SFLCTL`/`SFLMSGCTL`/`WINDOW`/`WNDSFCTL`/`PULLDOWN`/`PDNSFLCTL`/`MNUBAR`.
- **0.9.47** — Task R5: `SFLMSG` (message subfile) record-level picker.
- **0.9.46** — `isda.designerOpenColumn` now defaults to `"active"` (full-width, same tab).
- **0.9.44** — `EDTCDE`/`EDTWRD` numeric display width was a flat approximation; now exact.
- **0.9.43** — Full SDA record-type list for "+ Add record".
- **0.9.42** — Clicking a constant only ever selected the FIRST constant on its source line.
- **0.9.41** — Record type + dependent record format name options when creating a record.
- **0.9.40** — Resolve Referenced Field (and "Resolve All") via Code for i.
- **0.9.39** — SFLCTL-side subfile preview and PULLDOWN overlay are now editable.
- **0.9.38** — `isda.designerOpenColumn` setting added.
- **0.9.37** — "iSDA: Create New Menu" command.
- **0.9.36** — DSPF designer: properties panel reorganized into a breadcrumb + tabs/accordions.
- **0.9.35** — Window preview: fields rendered visually behind the window and were hard to select/edit.
- **0.9.34** — `CNTFLD(n)` wrapping in the preview (first implementation).
- **0.9.33** — True dimmed-overlay compare, replacing the old read-only side-by-side multi-select.
- **0.9.32** — Menu designer: options from one record could shadow/hide another record's same-numbered option.
- **0.9.31** — Change Window Title by clicking it directly on the preview.
- **0.9.30** — Window move/resize handles on the DSPF preview.
- **0.9.29** — DSPF designer: "+ Field" / "+ Constant" click-to-place buttons.
- **0.9.28** — Menu designer: whole-record create/copy/delete UI.
- **0.9.26** — Per-keyword indicator conditioning (foundation for the picker screens' Conditioning toggle).
- **0.9.24** — README's "Known limitations" section pruned to pending items only.
- **0.9.23** — `DspfWriter.addDisplaySize()` — add a second `DSPSIZ` size to a single-size (or no-`DSPSIZ`) file.

## 2026-08-25 and earlier — Foundation

The original parser/engine/writer, the menu designer, and the first round
of interactive editing (drag, resize, rename, DATFMT, remote connections).

- **0.9.19** — "+ Add option" now lets you choose where a new option lands.
- **0.9.18** — "+ Add option" now picks a smarter starting row for the first option in a record.
- **0.9.17** — Date (`L`) field width now also honors record- and file-level `DATFMT`, not just field-level.
- **0.9.16** — Multiple runtime-positioned `WINDOW`s no longer render exactly on top of each other in compare mode.
- **0.9.15** — Local `.mnudds` files now support the options panel, not just remote IBM i members.
- **0.9.14** — "Compile Menu" no longer destructively rebuilds the message file on every compile.
- **0.9.13** — Date (`L`) field display width now honors the field's own `DATFMT` keyword.
- **0.9.12** — Remote member creation for "Create New Display File".
- **0.9.11** — Deleting a named field now warns if something elsewhere looks like it references it.
- **0.9.10** — Record rename now auto-rewrites the cross-references it can safely identify.
- **0.9.9** — Display-size condition names (`*DS3`/`*DS4`/user-defined) were silently misparsed into garbage indicators.
- **0.9.8** — Record format rename in the DSPF/screen designer (previously menu-designer only).
- **0.9.7** — Redesigned the menu designer's options panel: card layout, number badges, persistent field labels.
- **0.9.6** — Screen-size picker for display files declaring two `DSPSIZ` sizes.
- **0.9.5** — Split-constant option text wasn't recognized; editing it overwrote the number marker.
- **0.9.4** — Editable option label text in the menu designer's options panel.
- **0.9.3** — "Compile Menu (CRTMNU)" for the menu designer.
- **0.9.2** — Companion MNUCMD member kept in sync when it's already open elsewhere.
- **0.9.1** — "+ Add option" in the menu designer.
- **0.9.0** — Subfile editing redesigned to match real SDA behavior.
- **0.8.1** — Migrated from a plain `WebviewPanel` to `CustomTextEditorProvider`.
- **0.7.0** — "Create New Display File" command.
- **0.6.0** — Fixed a silent data-loss bug when editing a field with independently-conditioned keywords.
- **0.5.0** — `WINDOW(record-format-name)` resolution: a record can inherit another record's window geometry, including transitively.
- **0.4.0** — Record-level property editing: the properties panel now shows the current record's own keywords.
- **0.3.0** — Menu-bar (`MNUBAR`) rendering: a field with `MNUBARCHC` keywords renders as a horizontal row of clickable choices.
- **0.2.0** — Subfile (`SFL`/`SFLCTL`) rendering: the paired record's row template repeats `SFLPAG` times, resolved from either side of the pairing.
- **0.1.0** — DDS display-file parser (`dspfParser.ts`): fixed-column format, multi-line continuation, the foundation everything else builds on.

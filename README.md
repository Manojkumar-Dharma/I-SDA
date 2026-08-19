# iSDA — Interactive Screen Design Aid

<img src="images/icon.png" alt="iSDA logo" width="120" />

A VS Code extension that replaces IBM i's traditional 5250 Screen Design Aid
(`STRSDA`) with a modern, file-backed, fully interactive DDS display-file
editor: parse the fixed-column DDS source, preview it as a live 5250-style
screen, click and drag fields around, edit their properties, and write
changes straight back into the original source — all inside VS Code.

## Status

Early but functional. The parser, screen resolver, and interactive editor
have been verified against IBM's own published DDS examples and round-trip
tested (edit → regenerate source lines → re-parse → confirm nothing else
changed).

## Architecture

| Piece | File | Responsibility |
|---|---|---|
| Parser | `src/dspfParser.ts` / `src/dspfModel.ts` | Fixed-column DDS source → structured model (records, fields, keywords, conditioning indicators, continuation lines) |
| Resolver / renderer | `src/dspfEngine.js` | Model + active indicators → resolved screen layout → HTML grid |
| Writer | `src/dspfWriter.js` | Edited field, record, or help-entry data → regenerated fixed-column source lines, spliced back into the original text with everything else untouched |
| Extension host | `src/extension.ts` | `CustomTextEditorProvider` for the designer webview, keeping it in sync with the real document in both directions via `WorkspaceEdit` |
| Webview | `src/buildWebviewTemplate.js` → `src/webviewTemplate.ts` (generated) | Bakes the engine/writer/parser into one self-contained webview HTML string |
| Menu options engine | `src/mnuCmdEngine.js` | Parses/writes the companion "MNUCMD" source (option number → command mapping) of an SDA-style menu |
| Menu webview | `src/buildMenuWebviewTemplate.js` → `src/menuWebviewTemplate.ts` (generated) | Same baking approach, for the menu designer |

The parser is TypeScript (compiled twice: once to CommonJS for Node/tests,
once bundled to a browser IIFE via esbuild for the webview). The
engine/writer/mnuCmdEngine are plain dependency-free JS so the exact same
code runs in Node (for testing) and in the webview (no bundler needed for
those).

### Menu design (MNUDDS)

An IBM i SDA-style menu is really two source members working together:
- The **MNUDDS** member is plain DDS - CRTMNU compiles it into a `*DSPF`
  like any other display file - so it's parsed and rendered by the exact
  same `dspfParser.ts`/`dspfEngine.js` the screen designer uses. iSDA treats
  any DDS constant shaped like `'1. Do a thing'` as a menu option.
- The **MNUCMD** member (conventionally named `<menu>QQ`, same source file
  and library) maps each option number to the command it runs. This is what
  `dspfDesigner.menuEditor` (opened via **"iSDA: Open Menu Design Preview"**,
  or the CodeLens on a menu-shaped source) lets you edit: pick an option,
  type the command, and it's written straight back to the `QQ` member.

Works for a MNUDDS member opened as a remote IBM i source member through
[Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi)
(`member:` scheme), a local `.mnudds` file (as of v0.9.15, deriving a
sibling `<basename>QQ.mnucmd` file instead), or an IFS streamfile opened
through Code for i (`streamfile:` scheme, same sibling-file convention as a
local file) - see Known limitations below.
**"Compile Menu (CRTMNU)"** (added v0.9.3) runs the real compile sequence
via Code for i's `code-for-ibmi.runCommand` API - `CRTDSPF`, updating the
message file in place (`ADDMSGD` per option, falling back to `CHGMSGD` for
one that's already there - see v0.9.14; the `USRnnnn` message-ID format
`TYPE(*DSPF)` menus expect is documented in [IBM's own note on adding a
menu option](https://www.ibm.com/support/pages/node/7267003)), then
`CRTMNU`. Compiling itself still requires a real, connected IBM i member,
regardless of how the menu was opened for editing.

## Getting started

```bash
npm install
npm run compile   # regenerates src/webviewTemplate.ts, src/menuWebviewTemplate.ts, src/fixtures/sample.dspf, and dist/
```

Then open this folder in VS Code and press **F5** to launch an Extension
Development Host. Either:
- Open an existing `.dspf`/`.dspf38` file (local, or a remote IBM i source
  member/streamfile via [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi))
  containing DDS display-file source, and run **"iSDA: Open Screen Design
  Preview"** from the command palette or click the preview icon in the
  editor title bar, or
- Open an existing MNUDDS source member (remote, via Code for i) and run
  **"iSDA: Open Menu Design Preview"**, or
- Run **"iSDA: Create New Display File"** from the command palette (or
  right-click a folder in the Explorer) to generate a starter display file
  and open it directly in the designer.

See `vsc-extension-quickstart.md` for more on the extension dev loop.

## Known limitations

### DSPF (screen) designer

- `WINDOW` positions that depend on a runtime value (`*DFT`, or a
  program-to-system field name) can't be known at design time, so they
  render at a fixed placeholder position with a dashed border (staggered
  from other placeholder windows in compare mode, so multiple ones don't
  render on top of each other - but the position itself is still a
  placeholder). `WINDOW(record-format-name)` (inheriting another record's
  geometry) is fully resolved.
- The pulldown-overlay preview (menu bar → clicked choice → dropdown) is
  read-only. Switch to previewing the `PULLDOWN` record directly to edit
  it.
- The subfile detail area is read-only when previewing the `SFLCTL`
  (control) record - switch to the `SFL` record to edit row layout. With
  "Preview SFLPAG rows" enabled, dragging a field moves every *named*
  field of that row together; unnamed constants in the row template stay
  put.
- `CHCCTL` (per-choice runtime field-setting logic) has no visual
  representation - it's a logic construct, not a layout one.
- Compare mode (previewing several record formats together) is read-only.
  Switch back to single-record mode to edit.
- Deleting a field only warns (never rewrites) if something else looks
  like it references it by name - unlike rename, there's nothing sensible
  to auto-fix a deleted field's reference TO. Only named fields are
  checked; deleting an unnamed constant never warns, since there's
  nothing to search for.
- "Create New Display File" won't create the source physical file itself
  if it doesn't exist yet (`CRTSRCPF`) - only adds a member to one that
  already exists.
- Numeric fields with an `EDTCDE` or `EDTWRD` edit code (commas, currency
  symbols, sign positions) use an approximated display width - real
  edit-code formatting is too varied to safely approximate without a live
  system to verify every case against.

### Menu designer

- No "Create New Menu" equivalent to the DSPF designer's "Create New
  Display File" - starting a new menu still requires an existing MNUDDS
  member (and its paired commands member) created some other way. Would
  need to generate both paired members together, unlike a display file's
  single-member case.
- As of v0.9.19, a brand-new option's Row/Col are shown and editable before
  adding it - pre-filled with a smart default (right after the record's
  existing content: the last option, or the last title/header line if
  there are no options yet). Choosing an occupied row or one past the
  screen size is rejected with the specific reason. Leaving the fields
  untouched places it exactly where the old auto-placement would have.
- The companion commands file (`QQ` member, or local/streamfile sibling)
  stays in sync if it's open in its own editor tab. Two menu designer
  instances racing to write it at once is unhandled.
- **Compile Menu (CRTMNU)** requires the DDS record format to be named
  exactly the same as the menu member (CRTMNU's own requirement). Only
  handles `TYPE(*DSPF)` menus.
- Deleting an option doesn't scan for other references to it (unlike
  rename, which does).

### Planned / not yet built (prioritized, Aug 2026 parity audit)

Audited against a full SDA-parity feature list. Split into **Common**
(engine/writer work in `dspfEngine.js` / `dspfWriter.js` that both designers
share - build once, both webviews benefit) and designer-specific gaps that
only make sense in one context. Within each list, roughly highest-value/most
requested first.

#### Done (Aug 2026 - indicators & CAxx/CFxx pass)

- **Assign command keys (CAxx/CFxx)**, at both file level and per-record,
  with cross-scope exclusion (a key number used at one level is greyed out
  at the other, and switching a key's type CA&harr;CF never leaves a
  duplicate) - `DspfWriter.setCommandKey`/`removeCommandKey`/
  `availableCommandKeyNumbers`, with a matching panel in both the DSPF and
  menu designer sidebars.
- **File-level keyword editing** - `dspfWriter.js` had no way to rewrite the
  file's own keyword block at all before this; `getFileKeywordsLineRange`/
  `applyFileKeywordsUpdate` now handle it (including inserting a fresh
  block when a file has none yet). Currently only surfaced through the
  Command keys panel, not a general file-attributes editor - see
  "File-level attributes panel" below, now a smaller remaining gap.
- **Function-key legend** - `DspfEngine.resolveFunctionKeyLegend` merges
  file-level + record-level CAxx/CFxx (record wins on a shared number),
  rendered as an F-key strip above the preview in both designers, active
  (solid) styling driven by whichever indicators are currently simulated.
- **Field/constant/record indicator conditioning UI** - `field.conditions`
  and `record.conditions` were previously silently *ignored* by
  `applyFieldUpdate`/`applyRecordUpdate` even though the parser/writer
  round-tripped them correctly; both now accept a `conditions` update, and
  a shared editor (add/remove OR'd groups, AND'd indicators up to DDS's
  9-per-entity limit, NOT flag per indicator) is wired into the DSPF
  designer's field and record Properties panels.
- **Indicator conditioning UI for menu options** - a menu option is a DDS
  constant under the hood, so it conditions the same way; each option row
  has a "Conditioning" toggle using the same shared editor, applied to
  both the option's number marker and its label text together so the
  whole option shows/hides as one unit.
- Scope cut made deliberately: this pass conditions the **entity itself**
  (a field, constant, or record's own conditioning), not an individual
  **keyword** on it (e.g. conditioning just one `DSPATR` while other
  keywords on the same field stay unconditional). That per-keyword case
  is real DDS and still has no UI - noted below.

#### Common (shared engine/writer - do these once, not twice)

1. ~~**Copy field/constant**~~ - **done** (0.9.20): `DspfWriter.copyField`
   duplicates a field/constant (keywords/conditions/length/type included),
   auto-generating a distinct name for named fields (`nextAvailableFieldName`)
   since constants have none to collide on. Wired into the DSPF designer's
   Properties panel (Copy button + Ctrl+D) - the copy lands one row below
   the original, selected and ready to drag into place. The writer
   primitive is generic enough for the menu designer to reuse for
   duplicating an option's constant(s), but that UI wiring isn't done yet.
2. **Create / copy / delete whole record formats** - `dspfWriter.js` has no
   record-insert or record-delete primitive at all today, only
   `applyRecordUpdate`/`renameRecordFormat` for an *existing* record's own
   keywords/name.
3. **Add Display Size (\*DS3/\*DS4)** - the size picker only switches
   between sizes a file *already* declares (`DSPSIZ`); there's no "add a
   second size to a single-size file" writer action. Shared DSPSIZ
   parsing/writing, useful for both file types.
4. ~~**File-level attributes panel**~~ - **done** (0.9.23, DSPF designer
   only): a new "File attributes" button in the sidebar opens a file-level
   keyword view in the Properties panel, reusing the same keyword-chip
   editor every other panel already has (add/remove commits immediately,
   same pattern the Record and Help-entry panels use) - built on top of
   the `getFileKeywordsLineRange`/`applyFileKeywordsUpdate` primitives
   from the command-keys pass above, rather than a separate primitive.
   `fileKeywords` (`DSPSIZ`, `REF`, `PRINT`, etc.) were already parsed but
   had no general-purpose UI until now; command keys (`CAxx`/`CFxx`) stay
   on their own dedicated panel since that has purpose-built add/remove
   controls the generic keyword editor doesn't. The menu designer's
   sidebar doesn't have this view yet - noted as remaining work, same as
   Copy field/constant's menu-designer gap above.
5. ~~**Sort elements**~~ - **done** (0.9.23, DSPF designer only): new
   `DspfWriter.reorderFields(record, sourceLines, orderedSourceLines)`
   moves whole verbatim field/constant chunks around in source order
   without regenerating them (any interleaved HELP entries keep their own
   slot in the sequence, untouched). The "stable sort key convention"
   picked: explicit DDS source order, changed one swap at a time via
   Up/Down buttons in a new "Field order (source)" list in the Record
   properties panel - simpler than drag-and-drop for a feature already
   flagged low-priority/UI-only. Doesn't touch on-screen row/col at all,
   only which order fields appear in the file.
6. **Per-keyword indicator conditioning** - conditioning a single keyword
   (e.g. one `DSPATR` or `COLOR` among several on the same field) rather
   than the whole field/constant/record - see the scope-cut note above.
   The parser/writer already round-trip `keyword.conditions` correctly;
   only the UI is missing, and the shared conditions editor built for the
   entity-level case above should mostly just need a second mount point.

#### Display (DSPF) designer only

1. **"+ Field" / "+ Constant" click-to-place buttons** on the preview
   canvas - `DspfWriter.insertField` already exists and is used by the menu
   designer's "+ Add option", but the DSPF designer has no equivalent
   entry point yet.
2. **Window resize handles**, aware of every declared display size at
   once - today a window can only be dragged (moved), never resized, from
   the preview.
3. **Change Window Title** by clicking it directly on the preview (`WDWTITLE`
   is read/rendered already; editing it means hand-typing the keyword).
4. **Center field/constant on screen** - no such action exists; position
   is only settable via explicit Row/Col or drag.
5. **Fill constant with characters** - no such action exists.
6. **Dedicated colors/attributes editor** (`COLOR`/`DSPATR` picker) -
   today these are only reachable via the generic "add any keyword by
   name/params" box.
7. **Dedicated validity-check / editing-keyword / error-message helpers**
   (`RANGE`/`COMP`/`VALUES`, `EDTCDE`/`EDTWRD`, `ERRMSG`) - same generic-
   keyword-box limitation as colors/attributes above.
8. **Resolve Referenced Field** (and "Resolve All") via Code for i - fetch
   a referenced field's real type/length/decimals from a connected IBM i.
   Not implemented anywhere in the DSPF designer today (Code for i is
   currently only used by the menu designer's Compile Menu command).
9. **`CNTFLD(n)` wrapping** in the preview (multi-line field wrap at n
   chars/line) - not implemented in `dspfEngine.js`.
10. **`ERRMSG` on a window's own reserved message line** (its last content
    row, unless `*NOMSGLIN`) - not implemented; nothing renders `ERRMSG`
    specially yet.
11. **True dimmed-overlay compare** (one record drawn dimmed behind the one
    being edited) - today's "Compare multiple formats" is a read-only,
    side-by-side multi-select, not an editable-record-plus-dimmed-backdrop
    view.

#### Menu designer only

1. **"Create New Menu"** equivalent to "Create New Display File" - still
   needs an existing MNUDDS member (+ paired commands member) created some
   other way; would need to generate both together.
2. Everything under **Common** above (copy option/constant, create/copy/
   delete records, Add Display Size, per-keyword conditioning, etc.)
   applies equally here once built.

## License

MIT — see `LICENSE`.


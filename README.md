# iSDA — Interactive Screen Design Aid

<img src="images/icon.png" alt="iSDA logo" width="120" />

A VS Code extension that replaces IBM i's traditional 5250 Screen Design Aid
(`STRSDA`) with a modern, file-backed, fully interactive DDS display-file
editor: parse the fixed-column DDS source, preview it as a live 5250-style
screen, click and drag fields around (or nudge the selection with the arrow
keys, and cut/copy/paste a field's whole definition between records with
Ctrl+X/C/V), edit their properties, and write changes straight back into the
original source — all inside VS Code.

## Status

Early but functional. The parser, screen resolver, and interactive editor
have been verified against IBM's own published DDS examples and round-trip
tested (edit → regenerate source lines → re-parse → confirm nothing else
changed). See [Features](#features) below for what's covered at each DDS
scoping level.

## Features

DDS scopes keywords at three levels — file, record, and field — and iSDA's
own dedicated pickers follow that same structure, replacing free-typed
keyword entry with pick-from-a-screen UI mapped against real SDA's own
"Select/Define ___ Keywords" panels. See
[`PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md) for
the full per-screen build history and
[`CHANGELOG.md`](CHANGELOG.md) for the version-by-version record. The
generic Keywords tab (free-text name/parameters) remains the catch-all for
anything without a dedicated screen yet.

### File-level

- All 9 real-SDA "Select File Keywords" categories in one picker: General,
  Indicator, Print, Help, Display Sizes, DBCS Conversion, Alternate, Window
  Border, Menu-bar.
- Multiple `DSPSIZ` display sizes with a size switcher, plus adding a
  second size to a file that only declares one (or none).
- `MSGLOC` (message line per display size).
- Command keys (`CAxx`/`CFxx`) with correct DDS override semantics — a
  record may redefine a number already used at the file level (a
  per-record override, not a conflict), and different records may reuse
  the same number independently.
- File-level comments (DDS `*`-column-7 comment lines).
- "IBM i: Connected/Not connected/Not installed" status badge.

### Record-level

- Base Record Keywords picker (General, Indicator, Application Help, Help,
  Output, Input, Overlay, Print) — one component reused across `RECORD`,
  `SFLCTL`, `SFLMSGCTL`, `WINDOW`, `WNDSFCTL`, `PULLDOWN`, `PDNSFLCTL`,
  `MNUBAR`, and `USRDFN`.
- Subfile (`SFL`/`SFLCTL`) editing that matches real SDA behavior: the
  paired record's row template repeats correctly, and both sides of the
  pairing (control record and detail record) are independently editable
  and previewable.
- `SFLMSG`/`SFLMSGCTL` message-subfile pickers.
- `WINDOW`-specific picker (size/roll, border parameters/color/attributes/
  characters, restrict-cursor, message line) plus drag/resize/move handles
  and click-to-rename window title directly on the preview.
- `PULLDOWN`/`MNUBAR`-specific pickers, with pull-down and menu-bar
  choices rendering visually rather than as an empty box.
- Record-level comments.
- Whole-record create/copy/delete, record rename with safe cross-reference
  rewriting, and a full SDA record-type list (including subfile/window/
  pull-down/menu-bar starter templates) for "+ Add record" and "Create New
  Display File".

### Field-level

- Field base keyword pickers: Display Attributes, Colors, Keying Options,
  Validity Check (`RANGE`/`COMP`/`VALUES`/`CHECK`/`CHKMSGID`), Input
  Keywords, General, Database Reference, Error Messages, Message ID —
  wired across character, numeric, and constant field types with the
  right subset for each.
- Multi-instance, independently-conditioned keywords: real DDS allows
  e.g. `COLOR(RED)` under indicator 10 and `COLOR(GRN)` under indicator 20
  on the same field — Color & attributes, Error messages, Subfile
  Messages, Keying options, Validity check, and Message ID all support
  this rather than collapsing to one instance.
- Menu-bar choice fields (`MNUBARCHC`/`MNUBARSEP`/`SNGCHCFLD`/
  `MLTCHCFLD`/`CHOICE`/`CHCCTL`/`CHCACCEL`/`CHCAVAIL`/`CHCUNAVAIL`/
  `CHCSLT`).
- `CNTFLD` (continued-entry field), wrapping correctly over multiple
  lines and respecting its own conditioning indicator.
- System-value constants (`*DATE`/`*TIME`/`*USER`/`*SYSTEM`/`*PAGNBR`).
- Resolve Referenced Field (and "Resolve All") plus bulk "+ Fields from
  database file" (real SDA's own F10 key), both via Code for i.
- Click-to-place, drag, arrow-key nudge (Shift+Arrow for 5 cells at a
  time), and Ctrl+X/C/V cut/copy/paste of a field's whole definition.

### Canvas-wide and menu designer

- Multi-field select (Shift/Ctrl-click or rubber-band drag) with block
  move/copy/delete/style, matching real SDA's own block-command
  convention.
- Overlap warning banner — real DDS silently drops an overlapping field;
  iSDA flags it instead of letting it vanish unexplained.
- Ruler overlay (row/column numbers, SDA's own F14) and a crosshair
  position readout.
- Dimmed-overlay compare mode, showing another record format behind the
  one being edited.
- A Save button, and Compile (`CRTDSPF`/`CRTMNU`) via Code for i.
- Menu designer (MNUDDS/MNUCMD): dedicated option-attribute pickers,
  editable option label text, whole-record create/copy/delete, collapsible
  panels, and message-file-safe `CRTMNU` compiling — see
  [Menu design (MNUDDS)](#menu-design-mnudds) below for the two-member
  model this all sits on.

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
local file) - see [`LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md)
for known constraints.
**"Compile Menu (CRTMNU)"** (added v0.9.3) runs the real compile sequence
via Code for i's `code-for-ibmi.runCommand` API - `CRTDSPF`, updating the
message file in place (`ADDMSGD` per option, falling back to `CHGMSGD` for
one that's already there - see v0.9.14; the `USRnnnn` message-ID format
`TYPE(*DSPF)` menus expect is documented in [IBM's own note on adding a
menu option](https://www.ibm.com/support/pages/node/7267003)), then
`CRTMNU`. Compiling itself still requires a real, connected IBM i member,
regardless of how the menu was opened for editing.

### Screen design (DSPF)

**"Compile Display File (CRTDSPF)"** (added v0.9.77) is the DSPF
designer's own counterpart to the menu designer's "Compile Menu" button
above - a single `CRTDSPF` via Code for i's `code-for-ibmi.runCommand`
API, with no message-file/`CRTMNU` steps (those are `MNUDDS`-specific).
Same requirement as "Compile Menu": a real, connected IBM i member.

**"+ Fields from database file"** (Task L14, added v0.9.96) - real
SDA's own F10 (Database) key: browse a PF/LF's field list (via Code for
i's `runCommand`/`runSQL`, same connection "Compile"/"Resolve Referenced
Field" already use) and place several fields on the screen at once as
`REFFLD`-based fields, rather than creating and referencing them one at
a time.

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
  and open it directly in the designer. Pick a starting record type (same
  9 types the designer's own "+ Add record" wizard offers - basic screen,
  subfile, window, pull-down menu, etc.) and iSDA writes the right starter
  keywords (and, for subfile types, an auto-named `SFLCTL` companion
  record) for you, or
- Run **"iSDA: Create New Menu"** from the command palette (or right-click
  a folder in the Explorer) to generate a starter MNUDDS member *and* its
  paired MNUCMD commands member together, and open the MNUDDS half
  directly in the menu designer.

By default the designer opens full-width in the same tab (`active`). If
you'd rather see the raw DDS source and the designer side by side, set
`isda.designerOpenColumn` (Settings) to `beside` to open it in a split
column next to the source instead, or to `newWindow` to have it
automatically pop out into its own window.

See `vsc-extension-quickstart.md` for more on the extension dev loop.

## Known limitations and planned work

Accepted constraints, inherent DDS/CRTMNU behaviors, and forward-looking
fixable work all live in
[`LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md) now,
rather than being duplicated here — that doc already tracks status
(`not started`/`in progress`/`done`) per item the same way it tracks
everything else, so it's the single place to check what's an accepted
constraint versus genuinely open work.

## License

MIT — see `LICENSE`.


# iSDA — Interactive Screen Design Aid

<img src="images/icon.png" alt="iSDA logo" width="120" />

A VS Code extension that replaces IBM i's 5250 Screen Design Aid (`STRSDA`) with a
modern, file-backed visual editor for **DDS display files** and **SDA-style menus**.
Open the source, see it as a live 5250 screen, click and drag fields, edit their
properties, and watch the changes written straight back into the original source.
Everything you didn't touch stays byte-for-byte as it was.

- **Screen designer** for `.dspf`, `.dspf38` and `.dspf36` (System/36 environment) files.
- **Menu designer** for `.mnudds` menus and their paired MNUCMD command members.
- **Keyword pickers** modelled on real SDA's "Select/Define ___ Keywords" screens, with
  IBM's own DDS Reference rules (usage, conditioning, mutual exclusions) enforced.
- Works on **local files** and on **remote IBM i members and IFS streamfiles** through
  [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi).

## Requirements

- VS Code 1.85 or later.
- Optional: [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi)
  for remote sources, **Compile**, **Resolve Referenced Field** and
  **+ Fields from database file**. Compile-related buttons are hidden while the
  "IBM i: Connected / Not connected / Not installed" badge isn't showing connected.

## Getting started

```bash
npm install
npm run compile
```

Open the folder in VS Code and press **F5** to launch an Extension Development Host, then
use any of these commands (Command Palette, editor title bar, or Explorer right-click):

| Command | What it does |
|---------|--------------|
| **iSDA: Open Screen Design Preview** | Opens the current DDS display file in the screen designer (also the preview icon in the editor title bar). |
| **iSDA: Open Menu Design Preview** | Opens the current MNUDDS member in the menu designer (also a CodeLens on menu-shaped sources). |
| **iSDA: Create New Display File** | Generates a starter display file — pick a record type (basic screen, subfile, window, pull-down, …) and iSDA writes the right starter keywords, including an auto-named `SFLCTL` companion for subfile types. |
| **iSDA: Create New Menu** | Generates a starter MNUDDS member and its paired MNUCMD member, and opens the MNUDDS half in the menu designer. |
| **iSDA: Compile Display File (CRTDSPF)** | Runs `CRTDSPF` on the connected IBM i member through Code for i. |
| **iSDA: Compile Menu (CRTMNU)** | Runs the full menu compile sequence (see [Menu design](#menu-design-mnudds)). |

### Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `isda.designerOpenColumn` | `active` | Where designers open: `active` (full width, same tab), `beside` (split next to the source) or `newWindow` (pop out automatically). |
| `isda.trackSourceModifications` | `false` | When an edit changes an existing source line, comment the original out and tag the new line in columns 81–90 (past what the compiler reads), so a line's history stays visible in the source. Also toggleable per session in the options panel. |
| `isda.modificationTag` | *(empty)* | Default 10-character marker for the modification tag above. |

## Features

DDS scopes keywords at three levels — file, record, field — and iSDA's pickers follow the
same structure. The generic **Keywords** tab (free-text name and parameters) remains the
catch-all for anything without a dedicated screen. Each keyword's level, usage and
conditioning rules are checked against IBM's DDS Reference (see
[Project documentation](#project-documentation)).

### File level

- All nine real-SDA "Select File Keywords" categories in one picker: General, Indicator,
  Print, Help, Display Sizes, DBCS Conversion, Alternate, Window Border, Menu-bar.
- Multiple `DSPSIZ` display sizes with a size switcher; `MSGLOC` per display size.
- Command keys (`CAxx`/`CFxx`) with correct DDS override semantics — a record may redefine a
  number used at file level, and different records may reuse a number independently.
- File-level comments with per-row source line numbers and insert-at-line.

### Record level

- One Base Record Keywords picker (General, Indicator, Application Help, Help, Output,
  Input, Overlay, Print) reused across `RECORD`, `SFLCTL`, `SFLMSGCTL`, `WINDOW`,
  `WNDSFCTL`, `PULLDOWN`, `PDNSFLCTL`, `MNUBAR` and `USRDFN`.
- Subfiles as real SDA treats them: the paired control and detail records are each
  editable and previewable, with the row template repeating correctly. Message subfiles
  and the selection-list keywords `SFLSNGCHC`/`SFLMLTCHC` are covered too.
- `WINDOW` picker (size/roll, border parameters/colour/attributes/characters, restrict
  cursor, message line) with drag, resize and click-to-rename on the preview.
- `PULLDOWN` and `MNUBAR` pickers; pull-down and menu-bar choices render visually.
- Repeatable, independently-conditioned instances for keywords such as `MNUBARDSP` and
  `HLPTITLE` (up to 15), not just one flat value.
- Whole-record create, copy, delete and rename (with safe cross-reference rewriting),
  from a full SDA record-type list including subfile, window, pull-down and menu-bar
  starter templates.
- Record-type restrictions IBM documents (for example `USRDFN`, `SFL` and `MNUBAR` each
  allow only a closed keyword list) are enforced in the pickers and the raw keyword editor.
  On those three record types the Keywords tab shows only the rows that list allows; the
  rest are not offered at all (a hand-written one stays listed in Advanced / raw keywords).

### Field level

- Base pickers for Display Attributes, Colours, Keying Options, Validity Check
  (`RANGE`/`COMP`/`VALUES`/`CHECK`/`CHKMSGID`), Input Keywords, General, Database
  Reference, Error Messages and Message ID — each showing the right subset for character,
  numeric, date/time, constant and menu-bar-choice fields, and for each Usage code.
- Multi-instance keywords: real DDS allows `COLOR(RED)` under indicator 10 and
  `COLOR(GRN)` under indicator 20 on one field; every relevant picker supports that
  instead of collapsing to one instance.
- Date/time formats (`DATFMT`/`DATSEP`/`TIMFMT`/`TIMSEP`), editing keywords
  (`EDTCDE`/`EDTWRD`/`EDTMSK`), `CNTFLD`, `SFLSCROLL`, `HTML`, and `WRDWRAP` with its
  mutual-exclusion rules enforced.
- Choice and push-button fields: menu-bar choices (`MNUBARCHC`, `SNGCHCFLD`, `MLTCHCFLD`,
  `CHOICE`, `CHC*`) and push-button fields (`PSHBTNFLD`/`PSHBTNCHC`, with a "Push button"
  field kind in the add-field panel and a layout-accurate preview).
- Constants with system values (`*DATE`, `*TIME`, `*USER`, `*SYSTEM`) and `MSGCON`.
- **Resolve Referenced Field** (and **Resolve All**) and bulk **+ Fields from database
  file** — real SDA's F10 key — both through Code for i. Resolve loads the referenced
  field's length, type, decimals and inherited keywords (`TEXT`, `ALIAS`, `CCSID`, editing,
  date/time formats) into the designer as a read-only view without changing the DDS source,
  so a `+n` / `-n` length on a reference field keeps working.
  Fields added from a database file are written as bare reference fields (`R` + `REFFLD`,
  no length, type or decimals) so they inherit editing and validity checking too; their
  definitions load into the designer the same way, straight after the insert.

### Canvas and editing

- Click-to-place, drag, arrow-key nudge (Shift+Arrow moves 5 cells), and Ctrl+D duplicate /
  Ctrl+X/C/V cut, copy and paste of a field's whole definition; a single duplicate or paste
  asks where to land it through the same click-to-place flow as the Copy button.
- Multi-field select (Shift/Ctrl-click or rubber-band) with block move, copy, delete and
  style, following real SDA's block-command convention.
- Overlap warning banner — real DDS silently drops an overlapping field; iSDA flags it.
- Ruler overlay (SDA's F14), crosshair position readout, and a dimmed compare mode that
  shows another record format behind the one being edited.
- Optional source modification tracking (see Settings).

### UI styles

Both designers offer two styles, switched live with no reload:

- **Classic** — the original three-column layout: left panel, canvas, properties panel.
- **New** — a two-column layout with a floating **toolbox** over the canvas (`+ Field`,
  `+ Constant`, `+ Add record`, `+ Fields from database file`, `Window`, `Menu`) and a
  **pinned toolbar** (Save, Compile, connection badge, Record and Screen-size selects,
  Find-field search, "Screen Design · N records" title) above a persistent View and UI
  Settings accordion zone.

Both share a **Green / Amber / Cyan / Violet / White accent colour**, matching ACS 5250's
session colours. An explicit `COLOR` keyword on a field always wins over the accent.

## Menu design (MNUDDS)

An SDA-style menu is two source members working together:

- The **MNUDDS** member is plain DDS — `CRTMNU` compiles it into a `*DSPF` — so it is parsed
  and rendered by the same parser and engine as the screen designer. Any constant shaped
  like `'1. Do a thing'` is treated as a menu option.
- The **MNUCMD** member (conventionally `<menu>QQ`, same source file and library) maps each
  option number to the command it runs. The menu designer edits it: pick an option, type
  the command, and it is written straight back.

MNUDDS opens from a remote member (`member:` scheme), a local `.mnudds` file (with a
sibling `<basename>QQ.mnucmd`), or an IFS streamfile (`streamfile:` scheme, same sibling
convention). **Compile Menu** runs `CRTDSPF`, updates the message file in place
(`ADDMSGD` per option, falling back to `CHGMSGD` when it already exists; the `USRnnnn`
message-ID format `TYPE(*DSPF)` menus expect is described in
[IBM's note on adding a menu option](https://www.ibm.com/support/pages/node/7267003)),
then `CRTMNU`. Compiling always needs a real, connected IBM i member, however the menu
was opened for editing.

## Architecture

| Piece | File | Responsibility |
|-------|------|----------------|
| Parser | `src/dspfParser.ts`, `src/dspfModel.ts` | Fixed-column DDS source → structured model (records, fields, keywords, conditioning indicators, continuation lines). |
| Resolver / renderer | `src/dspfEngine.js` | Model + active indicators → resolved screen layout → HTML grid. |
| Writer | `src/dspfWriter.js` | Edited field, record or help-entry data → regenerated source lines, spliced into the original text with everything else untouched. Also holds the DDS Reference conflict rules. |
| Webview client | `src/webviewClientHelpers.js` | Property-panel builders and event wiring for file, record and field keywords. |
| Webview templates | `src/buildWebviewTemplate.js` → `src/webviewTemplate.ts`; `src/buildMenuWebviewTemplate.js` → `src/menuWebviewTemplate.ts` (both generated) | Bake parser, engine, writer and client helpers into one self-contained webview HTML string per designer. |
| Menu options engine | `src/mnuCmdEngine.js` | Parses and writes the MNUCMD member. |
| Extension host | `src/extension.ts` | Custom text editor provider; keeps the webview and the real document in sync both ways via `WorkspaceEdit`; Code for i integration. |

The parser is TypeScript, compiled twice — CommonJS for Node and tests, and an esbuild
IIFE bundle for the webview. The engine, writer and menu engine are dependency-free plain
JS so the exact same code runs in Node (tests) and in the webview.

Code for i is a soft dependency. Compile, Resolve Referenced Field and Add-fields-from-database
call `.runCommand()` directly on the connection from `instance.getConnection()` rather than
through the `code-for-ibmi.runCommand` VS Code command, which Code for i registers late and
which could still be missing on an otherwise working connection.

## Development

```bash
npm install
npm run compile     # regenerates the webview templates, src/fixtures/sample.dspf, and dist/
npm test            # pure-Node test scripts, no framework; UI tests run the real webview in jsdom
npx vsce package --no-dependencies   # build a .vsix
```

- Never edit `src/webviewTemplate.ts` or `src/menuWebviewTemplate.ts` — they are generated.
- Client-side JS in `buildWebviewTemplate.js` and `buildMenuWebviewTemplate.js` (and the
  helpers they embed) lives inside Node template literals: **no backticks in comments or
  strings**, or the generated template breaks silently. Run `node -c <file>` before compiling.
- Every new test under `src/test/` must also be added to the `test` script in `package.json`.
- Test output is TAP-style: count passes with `grep -c "^  ok"` and failures with
  `grep -i "not ok"` (a test's own description text can contain "fail").
- See `vsc-extension-quickstart.md` for the general extension dev loop.

## Project documentation

| Document | What it tracks |
|----------|----------------|
| [`CHANGELOG.md`](CHANGELOG.md) | One line per released version, latest first. |
| [`docs/sda-reference/LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md) | Accepted constraints and every `L`/`M`/`P`/`S36-` task — designer bugs, features, the New UI migration and System/36 support. |
| [`docs/sda-reference/PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md) | The per-screen build history of the SDA-style pickers. |
| [`docs/sda-reference/keywordFixes.md`](docs/sda-reference/keywordFixes.md) | The keyword-compliance audit against IBM's DDS Reference (`I-` tasks): status table, open work, and one section per task. |
| [`docs/sda-reference/README.md`](docs/sda-reference/README.md) | Index of the reference material: real SDA screenshots, the IBM DDS Reference text, and the keyword index. |

**Status:** early but functional. The parser, resolver and editor are verified against IBM's
published DDS examples and round-trip tested (edit → regenerate source → re-parse →
confirm nothing else changed). All tracked `L`, `M`, `P` and `S36-` tasks and all picker
screens are done. The keyword audit is ongoing; its status table and open-work list in
[`keywordFixes.md`](docs/sda-reference/keywordFixes.md) are the place to see what remains.

## License

MIT — see [`LICENSE`](LICENSE).

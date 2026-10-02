# iSDA — Interactive Screen Design Aid

<img src="images/icon.png" alt="iSDA logo" width="120" />

A VS Code extension that replaces IBM i's 5250 Screen Design Aid (`STRSDA`) with a visual,
file-backed editor for **DDS display files** and **SDA-style menus**. Open the source, see it as a
live 5250 screen, drag fields around, edit their properties — the changes are written straight back
into the original source, and everything you didn't touch stays byte-for-byte as it was.

- **Screen designer** for `.dspf`, `.dspf38` and `.dspf36` (System/36 environment).
- **Menu designer** for `.mnudds` menus and their paired MNUCMD command members.
- **Keyword pickers** modelled on real SDA's "Select/Define ___ Keywords" screens, with IBM's DDS
  Reference rules (usage, conditioning, mutual exclusions) enforced.
- **Local files and remote IBM i** members and IFS streamfiles, through
  [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi).

## Quick start

Requires VS Code 1.85+. [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi)
is optional: it is needed only for remote sources, **Compile**, **Resolve Referenced Field** and
**+ Fields from database file**.

```bash
npm install
npm run compile
```

Open the folder in VS Code, press **F5** to launch an Extension Development Host, then run a
command from the Command Palette, the editor title bar, or the Explorer right-click menu. To build
an installable package: `npx vsce package --no-dependencies`.

| Command | What it does |
|---------|--------------|
| **iSDA: Open Screen Design Preview** | Opens the current DDS display file in the screen designer. |
| **iSDA: Open Menu Design Preview** | Opens the current MNUDDS member in the menu designer. |
| **iSDA: Create New Display File** | Generates a starter display file: pick a record type (basic screen, subfile, window, pull-down, ...) and get working starter keywords. |
| **iSDA: Create New Menu** | Generates a starter MNUDDS member and its MNUCMD pair, then opens it. |
| **iSDA: Compile Display File (CRTDSPF)** | Runs `CRTDSPF` on the connected member. |
| **iSDA: Compile Menu (CRTMNU)** | Runs the full menu compile sequence (see [Menu design](#menu-design-mnudds)). |

| Setting | Default | Purpose |
|---------|---------|---------|
| `isda.designerOpenColumn` | `active` | Where designers open: `active` (same tab), `beside`, or `newWindow`. |
| `isda.trackSourceModifications` | `false` | Comment out an edited source line and tag the new one in columns 81–90, so a line's history stays visible. |
| `isda.modificationTag` | *(empty)* | Default 10-character tag for the option above. |

## Features

DDS scopes keywords at three levels — file, record, field — and the pickers follow the same
structure. A generic **Keywords** tab remains the catch-all for anything without a dedicated screen.

**File level** — all nine real-SDA "Select File Keywords" categories in one picker; multiple
`DSPSIZ` sizes with a size switcher; command keys (`CAxx`/`CFxx`) with correct override semantics.

**Record level**
- One Base Record Keywords picker shared by `RECORD`, `SFLCTL`, `SFLMSGCTL`, `WINDOW`, `WNDSFCTL`,
  `PULLDOWN`, `PDNSFLCTL`, `MNUBAR` and `USRDFN`.
- Subfiles as SDA treats them: control and detail records are each editable and previewable,
  including message subfiles and the `SFLSNGCHC`/`SFLMLTCHC` selection lists.
- `WINDOW` picker (drag, resize and rename on the preview), plus `PULLDOWN` and `MNUBAR` pickers.
- Whole-record create, copy, delete and rename (cross-references rewritten safely).
- Closed keyword lists IBM documents (`USRDFN`, `SFL`, `MNUBAR`) enforced in the pickers and the raw editor.

**Field level**
- Pickers for display attributes, colours, keying options, validity checks, input keywords,
  database reference, error messages and message IDs, each showing the subset that fits the
  field's type and usage.
- Multi-instance keywords: `COLOR(RED)` under indicator 10 *and* `COLOR(GRN)` under indicator 20.
- Date/time formats, editing keywords (`EDTCDE`/`EDTWRD`/`EDTMSK`), `CNTFLD`, `SFLSCROLL`, `HTML`,
  `WRDWRAP`, choice and push-button fields (`PSHBTNFLD`/`PSHBTNCHC`), and system-value constants.
- **Resolve Referenced Field** and bulk **+ Fields from database file** (real SDA's F10). Fields
  are added as bare `R` + `REFFLD` and their definitions load into the designer read-only, so the
  source stays clean and `+n`/`-n` length adjustments keep working.

**Canvas and editing**
- Click-to-place, drag, arrow-key nudge, duplicate/cut/copy/paste, multi-select with block
  commands, an overlap warning (real DDS silently drops an overlapping field), a ruler, a
  crosshair readout, and a compare mode that dims another record behind the one you're editing.
- Two UI styles, switchable live: **Classic** (three columns) and **New** (floating toolbox over
  the canvas plus a pinned toolbar), each with a Green / Amber / Cyan / Violet / White accent.
  An explicit `COLOR` keyword always beats the accent.

## Menu design (MNUDDS)

An SDA-style menu is two members working together:

- The **MNUDDS** member is plain DDS (`CRTMNU` compiles it into a `*DSPF`), parsed and rendered by
  the same engine as the screen designer. A constant like `'1. Do a thing'` is a menu option.
- The **MNUCMD** member (conventionally `<menu>QQ`, same source file and library) maps each option
  number to a command. The menu designer edits it and writes it straight back.

MNUDDS opens from a remote member (`member:`), a local `.mnudds` file (with a sibling
`<basename>QQ.mnucmd`), or an IFS streamfile (`streamfile:`). **Compile Menu** runs `CRTDSPF`,
updates the message file (`ADDMSGD` per option, `CHGMSGD` if it exists — see
[IBM's note](https://www.ibm.com/support/pages/node/7267003) on the `USRnnnn` message IDs), then
`CRTMNU`. Compiling always needs a real, connected IBM i member.

## How it works

| Piece | File | Role |
|-------|------|------|
| Parser | `src/dspfParser.ts`, `src/dspfModel.ts` | Fixed-column DDS → structured model. |
| Engine | `src/dspfEngine.js` | Model + active indicators → resolved layout → HTML grid. |
| Writer | `src/dspfWriter.js` | Edits → regenerated source lines, spliced into the original text. Holds the DDS conflict rules. |
| Keyword spec | `src/keywordSpec.js` | Declarative per-keyword rules, each cited to the DDS Reference. The single source of truth the engine, writer and webview are being moved onto. |
| Webview client | `src/webviewClientHelpers.js` | Property-panel builders and event wiring. |
| Webview templates | `src/buildWebviewTemplate.js`, `src/buildMenuWebviewTemplate.js` | Bake the code above into one self-contained HTML string per designer (outputs `src/webviewTemplate.ts` / `src/menuWebviewTemplate.ts` are generated). |
| Menu engine | `src/mnuCmdEngine.js` | Parses and writes MNUCMD. |
| Extension host | `src/extension.ts` | Custom text editor; keeps webview and document in sync via `WorkspaceEdit`; Code for i integration. |

The parser is TypeScript, compiled twice (CommonJS for Node/tests, an esbuild IIFE for the webview).
Everything else is dependency-free plain JS, so the same code runs in Node and in the webview.
Code for i is a soft dependency: compile, resolve and add-from-database call `.runCommand()` on the
connection from `instance.getConnection()` directly, because the `code-for-ibmi.runCommand`
command registers late.

## Development

```bash
npm run compile   # regenerates webview templates, src/fixtures/sample.dspf and dist/
npm test          # pure-Node tests, no framework; UI tests run the real webview in jsdom
```

- Never edit `src/webviewTemplate.ts` or `src/menuWebviewTemplate.ts` — they are generated.
- Client JS in the two `build*WebviewTemplate.js` files (and the helpers they embed) lives inside
  Node template literals: **no backticks in comments or strings**, or the template breaks silently.
  Run `node -c <file>` before compiling.
- `npm test` runs `src/test/run.js`, which discovers every `src/test/*.test.js` (no registration).
  `node src/test/run.js i106 dspfWriter` runs matching files; `--list` lists; `--slow N` shows the
  slowest. Use the shared `check()` from `src/test/helpers/harness.js`; output is `  ok  - label` /
  `FAIL  - label`.
- See `vsc-extension-quickstart.md` for the general extension dev loop.

## Contributing: picking up work

Work is tracked in `docs/sda-reference/`, and every task is small enough to claim independently.

| Document | What it tracks |
|----------|----------------|
| [`CHANGELOG.md`](CHANGELOG.md) | One line per released version, latest first. |
| [`keywordFixes.md`](docs/sda-reference/keywordFixes.md) | The keyword-compliance audit (`I-` tasks): status table, open work, one section per task. **Start at its Open work table.** |
| [`LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md) | Accepted constraints and every `L`/`M`/`P`/`S36-` task. |
| [`PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md) | Build history of the SDA-style pickers. |
| [`docs/sda-reference/README.md`](docs/sda-reference/README.md) | Real SDA screenshots, IBM's DDS Reference text, and the keyword index. |

The standing rule: **IBM's DDS Reference is ground truth.** Verify a rule against
`docs/sda-reference/source/DDS_Keyword_V7r6.txt` rather than inferring it from the code, and if the
reference is ambiguous, log an open question instead of guessing. A task is done when its new tests
fail against the old code, the full suite passes, and `keywordFixes.md` and `CHANGELOG.md` are
updated.

The largest open item, **I-121** (one declarative rule spec per keyword), is split into slices
`I-121a` – `I-121t` that can be worked in parallel. Run
`python3 docs/sda-reference/keyword-index/check_spec_coverage.py` to confirm every keyword still
without a spec entry belongs to exactly one slice.

**Status:** early but functional. The parser, resolver and editor are verified against IBM's
published DDS examples and round-trip tested (edit → regenerate → re-parse → confirm nothing else
changed). The keyword audit is ongoing.

## License

MIT — see [`LICENSE`](LICENSE).

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
changed). Every DDS keyword category - file-, record-, and field-level -
now has a dedicated SDA-style picker screen mapped against real SDA's own
"Select/Define \_\_\_ Keywords" panels, replacing free-typed keyword entry
with pick-from-a-screen UI; see
[`PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md) and
[`CHANGELOG.md`](CHANGELOG.md) for the full task-by-task history. The
generic Keywords tab (free-text name/parameters) remains the catch-all
for anything without a dedicated screen.

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

### Screen design (DSPF)

**"Compile Display File (CRTDSPF)"** (added v0.9.77) is the DSPF
designer's own counterpart to the menu designer's "Compile Menu" button
above - a single `CRTDSPF` via Code for i's `code-for-ibmi.runCommand`
API, with no message-file/`CRTMNU` steps (those are `MNUDDS`-specific).
Same requirement as "Compile Menu": a real, connected IBM i member.

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
  and open it directly in the designer, or
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

## Known limitations

These are accepted constraints or inherent DDS/CRTMNU behaviors, not
open work - nothing actionable below is being tracked as a task. See
[Planned enhancements](#planned-enhancements) for the fixable gaps.

### DSPF (screen) designer

- `WINDOW` positions that depend on a runtime value (`*DFT`, or a
  program-to-system field name) can't be known at design time, so they
  render at a fixed placeholder position with a dashed border instead
  (staggered per-window in compare mode so multiple placeholders don't
  overlap). `WINDOW(record-format-name)` (inheriting another record's
  geometry) is fully resolved, as is every other `WINDOW`/`WDWBORDER`
  form.
- `CHCCTL` (per-choice runtime field-setting logic) has no visual
  representation - it's a logic construct, not a layout one.
- Deleting a named field that something else in the source looks like it
  references by name (e.g. `REFFLD`) is blocked on a confirmation dialog
  naming those lines, but confirming still doesn't rewrite the reference
  itself - there's nothing sensible to auto-fix it TO (same reasoning as
  rename's own limitation below).
- `EDTCDE(Y)`/`EDTCDE(W)` "date edit" codes are left at the field's coded
  length rather than a guessed display width, since their separator
  width depends on the job's runtime `DATSEP` attribute - not knowable
  at design time, the same ambiguity that keeps `WINDOW(*DFT)` a
  placeholder above. Every other `EDTCDE`/`EDTWRD` case gets an exact
  computed width.
- M/P (Message text/Program-to-system) field usages aren't covered by
  real SDA's own field-keyword "For Field Type" table, so their keyword
  panels fail open (show every category) by design rather than guessing
  which apply.
- Choice selection type (`SNGCHCFLD`/`MLTCHCFLD`), Choice keywords, and
  Choice colors & attributes stay constant-excluded, since they require
  real, named, indicator-controlled field semantics a constant
  structurally can't have.
- The real SDA `WINDOW` screen's "Roll" column isn't a DDS keyword at
  all - it turned out to be SDA's own in-terminal roll-key editing
  convenience, so there's nothing to model.

### Menu designer

- **Compile Menu (CRTMNU)** requires the DDS record format to be named
  exactly the same as the menu member - CRTMNU's own requirement, not an
  iSDA choice.
- No command-key (`CAxx`/`CFxx`) assignment UI, unlike the DSPF designer -
  CRTMNU-compiled numbered-option menus don't use them in practice (F3=Exit,
  F12=Cancel etc. are handled by CRTMNU's own generated program logic, not
  by DDS command keys the menu designer would let you assign).

## Planned enhancements

Forward-looking, fixable work - not yet started or still in progress.
Completed tasks (and their full implementation history) live in
[`LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md) alongside
this list, so this section only shows what's actually left. Pick one up,
mark it `in progress` there, and sync (`git fetch` + drift check) before
pushing to avoid colliding with other parallel sessions.

### DSPF (screen) designer

- **[Task L5d-ii, in progress]** Wire any remaining record-level picker
  panels not yet covered by Task L5d-i (App help, Help, Output, Input,
  Overlay, Print, and any other record-type-specific panel) onto whichever
  fix fits - L1's repeatable-conditioned-instance component, or the
  simpler per-keyword Conditioning toggle. Check each keyword's own real
  SDA screenshot first; L5d-i found genuinely repeatable rows where
  L5a/b/c found plain single-indicator flags, so don't assume either way.

### Menu designer

- **[Task M1]** Give menu options the same dedicated-picker treatment the
  DSPF designer's keywords already have.
- **[Task M2]** Port Task L4's `CRTSRCPF` fix to "Create New Menu"'s
  remote path.
- **[Task M3]** Deleting a menu option doesn't scan for other references
  to it, unlike rename - port Task L2's reference-check pattern.
- **[Task M4]** The companion commands (`QQ`) file only stays in sync if
  it's open in its own editor tab; two designer instances racing to write
  it at once is unhandled.
- **[Task M5]** Compile Menu only supports `TYPE(*DSPF)` - survey what
  else CRTMNU allows.

## License

MIT — see `LICENSE`.


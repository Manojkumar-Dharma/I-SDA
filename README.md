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

Forward-looking, fixable work - not yet started. Items tagged with a
task ID are tracked in
[`LIMITATIONS-PLAN.md`](docs/sda-reference/LIMITATIONS-PLAN.md) the same
way the picker screens were - pick one, mark it `in progress` there, and
sync before pushing to avoid colliding with other parallel sessions.
Untagged items aren't yet broken into a tracked task.

### DSPF (screen) designer

- **[High, Tasks L5a/L5b/L5c/L5d-i]** Most dedicated keyword pickers manage ONE
  instance of their keyword(s) at a time, conditioned as a whole via
  the generic keyword editor's Conditioning toggle, rather than the
  MULTIPLE independently-conditioned instances real SDA additionally
  allows for some keywords - e.g. `COLOR(RED)` under indicator 10 and
  `COLOR(GRN)` under indicator 20 on the same field. Six panels have
  moved onto the generic "repeatable conditioned instance" component
  (Task L1) that solves this - **Color & attributes** (Task L1a),
  **Error message** (Task L1b), SFLCTL's **Subfile Messages** panel
  (Task L1c), **Keying options**'s `CHECK` codes (ME/ER/MF/FE/RB/RZ/
  RL/LC, Task L1d - which, since `CHECK` is shared with **Validity
  check**'s own AB/VN/VNE/M10/M11 codes, converted both panels
  together onto one shared instance list), **Validity check**'s OWN
  validity keyword (`RANGE`/`COMP`/`VALUES`, unrelated to `CHECK`),
  and **Message ID** (`MSGID` - real DDS commonly carries several
  independently-conditioned `MSGID` keywords on one field, e.g. a
  message conditioned on an error indicator alongside an
  unconditioned `MSGID(*NONE)` fallback; unlike ERRMSG/ERRMSGID, its
  argument text needed no further decomposition, so this piece is
  just L1's foundation directly, with no new parsing). `KEYBRD`
  (Keying options' other keyword) was deliberately left single-
  instance in Task L1d - a single always-on-screen attribute rather
  than several message/condition pairs, so that's a scoping choice,
  not an oversight.
  **Tasks L5a, L5b, and L5c (Input keywords, General keywords, and
  Database reference) are also done - but NOT via L1's multi-instance
  component.** Checking their own real SDA screens
  (`screens/field-level/character/{input-keywords,
  database-reference}/`) showed each keyword (`DUP`/`BLANKS`/`CHANGE`/
  `CHGINPDFT`, `DLTCHK`/`DLTEDT`, `ALIAS`/`INDTXT`/`DFT`/`DFTVAL`/
  `FLDCSRPRG`/`HLPID` and friends) with exactly ONE "Resp" indicator
  slot, not a repeatable list - these are plain presence flags (or a
  single default value) with no different "state" to switch between
  the way `COLOR(RED)`/`COLOR(GRN)` do, so a single occurrence's own
  AND/OR indicator expression already covers everything real DDS
  allows. What they actually needed was the simpler fix directly
  below (per-keyword Conditioning toggles), which all three now have.
  **Task L5d (the record-level pickers) is now split - L5d-i (record-
  level Indicator / screen-control keywords panel) is done, the
  opposite finding from L5a/b/c: checking the real SDA "Define
  Indicator Keywords" screen (`screens/record-level/
  base-record-keywords/indicator/`) showed `CLEAR`/`PAGEDOWN`/
  `PAGEUP`/`HOME`/`HELP`/`HLPRTN`/`VLDCMDKEY`/`SETOF`/`CHANGE`/
  `INDTXT` genuinely ARE a repeatable row table there (even multiple
  rows of the same keyword under different indicators), so this piece
  DID need Task L1's multi-instance component after all - now wired
  into both the base Record Keywords panel's own Indicator tab and the
  SFLCTL picker's own Indicator tab (which shares this same fuller
  screen; SFL/SFLMSG/PDNSFLCTL keep their own narrower `INDTXT`/
  `SETOF`/`CHANGE`-only screen, Task R3's existing component,
  untouched). L5d-ii (the rest of the record-level panels) remains
  open** - not yet surveyed; check each keyword's own real SDA
  screenshot first before assuming it needs L1's component either way.
- Surface the per-keyword Conditioning toggle directly on every
  dedicated picker panel that manages plain flag/single-value keywords
  (as opposed to Task L5's repeatable-instance keywords above) - done.
  Previously this only lived in the raw Keywords tab, so conditioning
  a pick (e.g. a file-level keyword under indicator 10) required
  dropping into free-text keyword entry; every `flagRowHtml`/
  `wireFlagRow` call site across File Keywords, Base Record Keywords,
  SFL/SFLMSG, Window/RSTCSR, Menu-Bar, and (as of Tasks L5a/L5b/L5c
  above) field-level panels now threads its own Conditioning toggle
  through.
- **[Task L6]** Done - Verified via IBM's DDS Reference (`WINDOW`'s own
  optional trailing `*MSGLIN`/`*NOMSGLIN` parameter, defaulting to
  `*MSGLIN`) and cross-checked against `dspfEngine.js`'s own
  `resolveWindow`, which already reads that exact token for rendering -
  only the `WINDOW`-specific picker's reader/writer was missing it. The
  "Message line" row is now a checkbox on the Window Parameters panel,
  hidden for the "Referenced window" form (which has no room for the
  token and always inherits it from the referenced window instead).
- **[Task L7]** **`WINDOW`-specific picker's "Restrict cursor to window"
  checkbox models `RSTCSR` as a bogus standalone keyword line, not
  `WINDOW`'s own trailing `*RSTCSR`/`*NORSTCSR` sub-parameter** - real
  DDS has no standalone record-level `RSTCSR` keyword (confirmed
  alongside Task L6's own research into the same "Define Window
  Parameters" screen and its `[*MSGLIN|*NOMSGLIN] [*RSTCSR|*NORSTCSR]`
  syntax). This predates Task L6 (from Task R7) and has its own passing
  test coverage built on the current (incorrect) model, so fixing it
  needs its own careful pass rather than being folded into L6's smaller,
  already-scoped fix.

### Menu designer

- **[Task M1]** **Menu designer options get the same dedicated-picker treatment** the
  DSPF designer's keywords now have - its per-option Conditioning panel
  already follows a similar structure to build on.
- **[Task M2]** "Create New Menu" won't create the source physical file itself
  (`CRTSRCPF`) on the remote path, only adds members to one that already
  exists - the DSPF designer's "Create New Display File" already solved
  the identical gap (Task L4); this just needs the same fix applied to
  the menu wizard's remote path.
- **[Task M3]** Deleting an option doesn't scan for other references to it, unlike
  rename - the DSPF designer's field-deletion reference check (Task L2)
  is the precedent to follow here.
- **[Task M4]** The companion commands file (`QQ` member, or local/streamfile sibling)
  only stays in sync if it's open in its own editor tab; two menu
  designer instances racing to write it at once is unhandled.
- **[Task M5]** Support menu types beyond `TYPE(*DSPF)` (currently the only one Compile
  Menu handles).

## License

MIT — see `LICENSE`.


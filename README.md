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

### DSPF (screen) designer

- `WINDOW` positions that depend on a runtime value (`*DFT`, or a
  program-to-system field name) can't be known at design time, so they
  render at a fixed placeholder position with a dashed border (staggered
  from other placeholder windows in compare mode, so multiple ones don't
  render on top of each other - but the position itself is still a
  placeholder). `WINDOW(record-format-name)` (inheriting another record's
  geometry) is fully resolved.
- `CHCCTL` (per-choice runtime field-setting logic) has no visual
  representation - it's a logic construct, not a layout one.
- Compare mode (previewing several record formats together) has two
  styles: the default dimmed backdrop (the currently-edited record stays
  fully interactive; the others render behind it, dimmed and read-only),
  and an opt-in "Full overlay" toggle (as of v0.9.40) that instead shows
  every checked record together at full brightness, with nothing
  editable - closer to how SDA's own multi-format compare looked before
  the dimmed backdrop was added. Switch off "Full overlay" (or Compare
  entirely) to go back to editing.
- Deleting a field only warns (never rewrites) if something else looks
  like it references it by name - unlike rename, there's nothing sensible
  to auto-fix a deleted field's reference TO. Only named fields are
  checked; deleting an unnamed constant never warns, since there's
  nothing to search for.
- "Create New Display File" won't create the source physical file itself
  if it doesn't exist yet (`CRTSRCPF`) - only adds a member to one that
  already exists.
- As of v0.9.44, numeric fields with an `EDTCDE` or `EDTWRD` edit code get
  an exact display width - commas, decimal point, sign/CR reservation,
  and a floating currency symbol for `EDTCDE` (per IBM's own worked
  examples in the EDTCDE reference), and the literal template's own
  character count for `EDTWRD` - instead of the field's raw undecorated
  digit length. This also applies to `DATE`/`TIME`/`PAGNBR` system-value
  constants carrying `EDTCDE`/`EDTWRD` (e.g. slashes inserted into a
  `DATE` placeholder), since those parse as `CONSTANT` the same as an
  ordinary literal but commonly carry edit keywords in real DDS. The
  `EDTCDE(Y)`/`EDTCDE(W)` "date edit" codes are left at the field's coded
  length rather than guessed at, since their separator width depends on
  the job's `DATSEP` attribute - not knowable at design time, the same
  runtime-only ambiguity that keeps `WINDOW(*DFT)` a placeholder above.
- Field-level keyword panels (Color & attributes, Validity check, Error
  message, and the new v0.9.47 Keying options/Input keywords/General
  keywords/Database reference/Message ID panels - see task D1 in
  [`docs/sda-reference/PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md))
  each manage ONE instance of their keyword(s) at a time, conditioned as a
  whole via the generic keyword editor's Conditioning toggle. Real SDA
  additionally allows MULTIPLE independently-conditioned instances of the
  same keyword - e.g. `COLOR(RED)` under indicator 10 and `COLOR(GRN)`
  under indicator 20 on the same field, or several `ERRMSG`/`ERRMSGID`
  entries tried in order. Not modeled here; would need its own follow-up
  since it affects several keywords at once, not just one panel.
- As of v0.9.48, D1's field-keyword panels are gated by the field's
  current Usage (and, for Validity check, data type) to match real SDA's
  own "For Field Type" column (task D2 in
  [`docs/sda-reference/PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md);
  see `WebviewClientHelpers.fieldKeywordCategoryVisibility()`'s own doc
  comment for the exact rule table). This only hides panels for a field's
  CURRENT usage - it never deletes a keyword the field already carries
  just because Usage changed, and an already-set keyword from a now-
  hidden category stays intact and editable via the raw Keywords tab,
  which is never gated. Two scoping choices worth knowing: Error message
  is tied to Validity check's own gate (both live in one combined panel)
  rather than getting SDA's separately-listed Input/Output/Both rule,
  since an error message without an associated validity check has
  nothing to report; and M/P (Message text/Program-to-system) usages,
  which SDA's own table never covers, fail open (show every category)
  rather than guessing.
- As of v0.9.51, menu-bar choice fields (task D5) have dedicated panels:
  Menu-bar choices (`MNUBARCHC`) and Menu-bar separator (`MNUBARSEP`) on
  a field whose owning record carries `MNUBAR`; Choice selection type
  (`SNGCHCFLD`/`MLTCHCFLD`) always offered as the opt-in entry point,
  with Choice keywords (`CHOICE`/`CHCCTL`/`CHCACCEL`, merged into one row
  per choice number) and Choice colors & attributes (`CHCAVAIL`/
  `CHCUNAVAIL`/`CHCSLT`) appearing once a field is already one of those.
  Not modeled: `MNUBARCHC`'s "Text field"/"Return field" variable-
  argument forms shown on the real SDA screen - only the literal-text
  form (`id record 'text'`) is supported, matching what
  `DspfEngine.parseMenubarChoice` already renders on screen.

### Menu designer

- No command-key (`CAxx`/`CFxx`) assignment UI, unlike the DSPF designer -
  CRTMNU-compiled numbered-option menus don't use them in practice (F3=Exit,
  F12=Cancel etc. are handled by CRTMNU's own generated program logic, not
  by DDS command keys the menu designer would let you assign).
- "Create New Menu" won't create the source physical file itself
  (`CRTSRCPF`) on the remote path - only adds members to one that already
  exists.
- The companion commands file (`QQ` member, or local/streamfile sibling)
  stays in sync if it's open in its own editor tab. Two menu designer
  instances racing to write it at once is unhandled.
- **Compile Menu (CRTMNU)** requires the DDS record format to be named
  exactly the same as the menu member (CRTMNU's own requirement). Only
  handles `TYPE(*DSPF)` menus.
- Deleting an option doesn't scan for other references to it (unlike
  rename, which does).

### Editor UI / workflow

Filed from an SDA parity review (see
[`docs/sda-reference/`](docs/sda-reference/) "Issues" list) - fixed in
0.9.44:

- ~~The preview/compare default should be **Active** rather than
  **Beside** in settings.~~ Default flipped; `beside` remains available.
- ~~The left/right side panels need a hide/minimize control...~~ Each
  panel now has its own hide/minimize toggle.
- ~~The "Record type" + dependent-record-creation controls should only be
  visible when the Add-record button is selected...~~ Now behind a
  "+ Add record" toggle.
- ~~Adding a record should offer the real SDA record-type set...~~ Type
  picker now offers `RECORD`, `USRDFN`, `SFL`, `SFLMSG`, `WINDOW`,
  `WDWSFL`, `PULDWN`, `PDNSFL`, `MNUBAR`, and SFL-family types
  auto-create their paired `SFLCTL` record.

## Planned enhancements

Forward-looking work, distinct from Known limitations above (which
describes what's true about the current build) - not yet started, to be
picked up after the current round of fixes.

- **SDA-style picker screens for keywords, attributes, and conditioning**,
  replacing free-typed keyword entry with pick-from-a-screen UI, the way
  real SDA prompts for each keyword's own fields rather than having you
  type `COLOR(RED)` by hand. A few keyword categories already get this
  treatment - Color & attributes, Validity check (RANGE/COMP/VALUES), Edit
  code/word, Command keys, Window title, Error message - each with its own
  `getX`/`setX` pair in `dspfWriter.js` plus a dedicated panel in
  `webviewClientHelpers.js`. The generic Keywords tab (free-text
  name/parameters) remains the catch-all for anything without a dedicated
  screen yet.

  This round of the work is mapped directly against real SDA's own
  "Select Keywords" panels (from screenshots of an actual STRSDA session -
  see [`docs/sda-reference/`](docs/sda-reference/)) rather than from the
  DDS keyword reference alone, since SDA groups keywords by function
  differently than the reference does, and the same "Select/Define \_\_\_
  Keywords" screen repeats verbatim across many record types (e.g.
  General/Indicator/Application Help/Help/Output/Input/Overlay/Print looks
  and behaves identically on a plain `RECORD`, a `SFLCTL`, a `WINDOW`, or a
  `PULLDOWN` record). The work is split **by screen, not by record type**,
  so each screen is built once as a shared component and then wired into
  every record/field type that uses it - see
  [`docs/sda-reference/PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md)
  for the full task table, dependency waves, and a suggested 3-developer
  parallelization. Summary of the split:

  | Level | Component | Task ID(s) | Reused by |
  | --- | --- | --- | --- |
  | File | Single picker, all 9 categories | F1 ✅ | - (one record type only) |
  | Record | Base Record Keywords (General/Indicator/App Help/Help/Output/Input/Overlay/Print) | R1 | `RECORD`, `SFLCTL`, `SFLMSGCTL`, `WINDOW`, `WNDSFCTL`, `PULLDOWN`, `PDNSFLCTL`, `MNUBAR` (full or partial) |
  | Record | `USRDFN` wiring (subset of R1) | R2 | - |
  | Record | `SFL` (Subfile keywords + General + Indicator) | R3 | `WNDSFL`, `PULDWNSFL` |
  | Record | `SFLCTL` (Subfile Control: General/Display Layout/Subfile Messages) | R4 | `SFLMSGCTL`, `WNDSFCTL`, `PDNSFLCTL` |
  | Record | `SFLMSG` (Message Record + General + Indicator) | R5 | - |
  | Record | `WINDOW` (Window Parameters + Border set) | R7 | `WNDSFL`, `WNDSFCTL`, `PULLDOWN`, `PULDWNSFL`, `PDNSFLCTL` (border set) |
  | Record | `PULLDOWN` (General + Border, no window-parameters) | R10 | `PULDWNSFL`, `PDNSFLCTL` |
  | Record | `MNUBAR` (General + Menu-Bar Display Keywords) | R13 | - |
  | Record | Combination types (`SFLMSGCTL`, `WNDSFL`, `WNDSFCTL`, `PULDWNSFL`, `PDNSFLCTL`) | R6, R8, R9, R11, R12 | wiring-only, depend on the rows above |
  | Field | Field base keywords (Display Attrs/Colors/Keying Options/Validity Check/Input/General/Database Reference/Error Messages/Message ID) | D1 ✅ | Character (full set), Numeric & Constant (subsets) |
  | Field | Character wiring | D2 ✅ | - |
  | Field | Numeric (adds Editing Keywords + Subfile Keywords) | D3 | - |
  | Field | Constant (subset + Menu-Bar Keywords) | D4 | - |
  | Field | Menu-bar choice fields (`MNB*`/`MNUACT`) | D5 ✅ | - |

  Status per task is tracked in
  [`PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md)
  (`not started` / `in progress` / `done`) - update it there when picking
  up or finishing a task so parallel sessions don't duplicate work. Within
  each task: map every option shown on the real SDA screenshot to its
  underlying DDS keyword(s) (checking `dspfWriter.js` for an existing
  `getX`/`setX` pair before adding a new one - several keywords are
  already covered under a different panel's umbrella, e.g. `DSPATR` under
  Color & attributes), note anything genuinely new, then build the panel
  following the existing dedicated-picker pattern and wire it into the
  matching tab (Basic/Position/Attributes/Keywords for fields; Basic/
  Keywords/Cmd keys/Structure for records). Two further directions once
  all tasks are done:
  - Surface the per-keyword Conditioning toggle directly on each
    dedicated picker panel (today it only lives in the raw Keywords tab),
    so conditioning a color/attribute/edit-code pick doesn't require
    dropping into free-text keyword entry.
  - Menu designer options get the same treatment once the DSPF designer
    rows above are done - its per-option Conditioning panel already
    follows a similar structure to build on.

## License

MIT — see `LICENSE`.


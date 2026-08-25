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
  and an opt-in "Full overlay" toggle that instead shows every checked
  record together at full brightness, with nothing editable - closer to
  how SDA's own multi-format compare looked before the dimmed backdrop
  was added. Switch off "Full overlay" (or Compare entirely) to go back
  to editing.
- Deleting a field only warns (never rewrites) if something else looks
  like it references it by name - unlike rename, there's nothing sensible
  to auto-fix a deleted field's reference TO. Only named fields are
  checked; deleting an unnamed constant never warns, since there's
  nothing to search for.
- "Create New Display File" won't create the source physical file itself
  if it doesn't exist yet (`CRTSRCPF`) - only adds a member to one that
  already exists.
- Numeric fields with an `EDTCDE` or `EDTWRD` edit code get an exact
  display width - commas, decimal point, sign/CR reservation, and a
  floating currency symbol for `EDTCDE` (per IBM's own worked examples in
  the EDTCDE reference), and the literal template's own character count
  for `EDTWRD` - instead of the field's raw undecorated digit length.
  This also applies to `DATE`/`TIME`/`PAGNBR` system-value constants
  carrying `EDTCDE`/`EDTWRD` (e.g. slashes inserted into a `DATE`
  placeholder), since those parse as `CONSTANT` the same as an ordinary
  literal but commonly carry edit keywords in real DDS. The
  `EDTCDE(Y)`/`EDTCDE(W)` "date edit" codes are left at the field's coded
  length rather than guessed at, since their separator width depends on
  the job's `DATSEP` attribute - not knowable at design time, the same
  runtime-only ambiguity that keeps `WINDOW(*DFT)` a placeholder above.
- Every dedicated keyword picker (file-, record-, and field-level -
  Color & attributes, Validity check, Error message, Keying options,
  Input keywords, General keywords, Database reference, Message ID, and
  the record-level pickers) manages ONE instance of its keyword(s) at a
  time, conditioned as a whole via the generic keyword editor's
  Conditioning toggle. Real SDA additionally allows MULTIPLE
  independently-conditioned instances of the same keyword - e.g.
  `COLOR(RED)` under indicator 10 and `COLOR(GRN)` under indicator 20 on
  the same field, or several `ERRMSG`/`ERRMSGID` entries tried in order,
  or repeated `SFLMSG`/`SFLMSGID` instances on a subfile control record.
  Not modeled here; would need its own follow-up since it affects
  several keywords at once, not just one panel. The `SFL`-specific
  picker's `INDTXT`/`SETOF`/`CHANGE` rows are the one exception - real
  DDS allows multiple instances there (one indicator each), and the
  picker models that as a repeatable row list.
- The `WINDOW`-specific picker deliberately leaves out the real SDA
  screen's "Message line" row (DDS keyword not confidently verified) and
  its "Roll" column (turned out to be SDA's own in-terminal roll-key
  editing convenience, not a DDS keyword at all) - both still reachable
  via the raw Keywords editor.
- Field-keyword panels are gated by the field's current Usage (and, for
  Validity check, data type) to match real SDA's own "For Field Type"
  column (see `WebviewClientHelpers.fieldKeywordCategoryVisibility()`'s
  own doc comment for the exact rule table). This only hides panels for
  a field's CURRENT usage - it never deletes a keyword the field already
  carries just because Usage changed, and an already-set keyword from a
  now-hidden category stays intact and editable via the raw Keywords
  tab, which is never gated. Two scoping choices worth knowing: Error
  message is tied to Validity check's own gate (both live in one
  combined panel) rather than getting SDA's separately-listed
  Input/Output/Both rule, since an error message without an associated
  validity check has nothing to report; and M/P (Message text/
  Program-to-system) usages, which SDA's own table never covers, fail
  open (show every category) rather than guessing.
- Menu-bar choice fields' `MNUBARCHC` keyword only supports the
  literal-text form (`id record 'text'`) - its "Text field"/"Return
  field" variable-argument forms shown on the real SDA screen aren't
  modeled, matching what `DspfEngine.parseMenubarChoice` already renders
  on screen.
- Choice selection type (`SNGCHCFLD`/`MLTCHCFLD`), Choice keywords, and
  Choice colors & attributes stay constant-excluded, since they require
  real, named, indicator-controlled field semantics a constant
  structurally can't have.

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

## Planned enhancements

Forward-looking work, distinct from Known limitations above (which
describes what's true about the current build) - not yet started, to be
picked up after the current round of fixes.

- **SDA-style picker screens for keywords, attributes, and conditioning**,
  replacing free-typed keyword entry with pick-from-a-screen UI, the way
  real SDA prompts for each keyword's own fields rather than having you
  type `COLOR(RED)` by hand, mapped directly against real SDA's own
  "Select/Define \_\_\_ Keywords" screens (from screenshots of an actual
  STRSDA session - see [`docs/sda-reference/`](docs/sda-reference/))
  rather than from the DDS keyword reference alone, since SDA groups
  keywords by function differently than the reference does. The work is
  split **by screen, not by record/field type**, so each screen is built
  once as a shared component and wired into every type that uses it.

  Essentially done: the file-level picker, every field type (Character,
  Numeric, Constant, plus Menu-bar choice fields), and every record type
  (base Record Keywords plus every specific type - Subfile, Subfile
  Control, Message Subfile, Window, Pull-down, Menu Bar, and their
  combinations). The only piece left is **`PDNSFLCTL`** (a pull-down
  subfile's control record) - its siblings (`SFLMSGCTL`, `WNDSFL`,
  `WNDSFCTL`, `PULDWNSFL`) all turned out to be ordinary existing record
  types wearing two keywords at once, needing no new code beyond
  verification and test coverage; `PDNSFLCTL` likely follows the same
  pattern but isn't confirmed yet. The generic Keywords tab (free-text
  name/parameters) remains the catch-all for anything without a
  dedicated screen.

  Full task-by-task history and current status are tracked in
  [`PICKER-SCREENS-PLAN.md`](docs/sda-reference/PICKER-SCREENS-PLAN.md)
  and [`CHANGELOG.md`](CHANGELOG.md) - update the plan doc's Status
  column when picking up or finishing a task so parallel sessions don't
  duplicate work. Two further directions once `PDNSFLCTL` lands:
  - Surface the per-keyword Conditioning toggle directly on each
    dedicated picker panel (today it only lives in the raw Keywords tab),
    so conditioning a color/attribute/edit-code pick doesn't require
    dropping into free-text keyword entry.
  - Menu designer options get the same treatment - its per-option
    Conditioning panel already follows a similar structure to build on.

## License

MIT — see `LICENSE`.


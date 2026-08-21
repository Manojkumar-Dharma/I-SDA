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

By default the designer opens in a split column next to the source so
you can see both at once. If that feels cramped, set
`isda.designerOpenColumn` (Settings) to `active` to open it full-width in
the same tab instead, or to `newWindow` to have it automatically pop out
into its own window.

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
- As of v0.9.39, the pulldown-overlay preview (menu bar → clicked choice
  → dropdown) is editable directly: click a field inside it to select it
  (without the click closing the overlay), drag it to move it - the edit
  writes back to the `PULLDOWN` record itself, not the record that has the
  `MNUBARCHC` that opened it. You can still switch to previewing the
  `PULLDOWN` record directly if you prefer that view.
- As of v0.9.39, the subfile detail area is also editable when previewing
  the `SFLCTL` (control) record - no need to switch to the `SFL` record
  first. Dragging any field in the preview moves the whole row together,
  writing back to the paired `SFL` record automatically (same as the `SFL`
  record's own "Preview SFLPAG rows" toggle). With either, dragging a
  field moves every *named* field of that row together; unnamed constants
  in the row template stay put.
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

- No command-key (`CAxx`/`CFxx`) assignment UI, unlike the DSPF designer -
  CRTMNU-compiled numbered-option menus don't use them in practice (F3=Exit,
  F12=Cancel etc. are handled by CRTMNU's own generated program logic, not
  by DDS command keys the menu designer would let you assign). Removed in
  0.9.35 after initially being added generically alongside the DSPF
  designer's own command-key support.
- As of v0.9.36, "iSDA: Create New Menu" generates both paired members
  together (MNUDDS + its `QQ` MNUCMD companion) in one step - a local
  workspace pair (`<name>.mnudds` + `<name>QQ.mnucmd`), or both via ADDPFM
  on a connected IBM i system. Like "Create New Display File", it won't
  create the source physical file itself (`CRTSRCPF`) on the remote path -
  only adds members to one that already exists. If the companion ADDPFM
  fails after the menu member's own ADDPFM already succeeded, the menu
  member is still created and written; only a warning is shown, since the
  companion can be added separately later and iSDA will pick it up
  automatically.
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
requested first. (Completed items from this audit - command keys and the
function-key legend (DSPF designer only - see note below), indicator
conditioning (both entity-level and now per-keyword), copy field/constant,
Add Display Size, the file-attributes panel, whole-record create/copy/
delete, the Center/Fill/colors-attributes/validity-edit-error-message
field-panel helpers, "+ Field"/"+ Constant" click-to-place, window
move/resize handles, Change Window Title, true dimmed-overlay compare -
in both designers where applicable - plus sort elements, `CNTFLD(n)`
preview wrapping, and `ERRMSG` rendering on a window's own reserved
message line - have moved to CHANGELOG.md rather than staying listed
here as limitations. No Common items are currently pending.)

#### Display (DSPF) designer only

1. **Resolve Referenced Field** (and "Resolve All") via Code for i - fetch
   a referenced field's real type/length/decimals from a connected IBM i.
   Not implemented anywhere in the DSPF designer today (Code for i is
   currently only used by the menu designer's Compile Menu command).

No other Display-designer-only items are currently pending.

#### Menu designer only

No Menu-designer-only items are currently pending. ("Create New Menu",
generating the paired MNUDDS + MNUCMD members together, shipped in
v0.9.36 - see Known limitations above and CHANGELOG.md.)

## License

MIT — see `LICENSE`.


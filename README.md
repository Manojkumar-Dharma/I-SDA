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

This currently only works for a MNUDDS member opened as a remote IBM i
source member through [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi)
(`member:` scheme) - see Known limitations below. **"Compile Menu
(CRTMNU)"** (added v0.9.3) runs the real compile sequence via Code for i's
`code-for-ibmi.runCommand` API - `CRTDSPF`, a from-scratch rebuild of the
message file (`ADDMSGD` per option, using the `USRnnnn` message-ID format
`TYPE(*DSPF)` menus expect - see [IBM's own note on adding a menu
option](https://www.ibm.com/support/pages/node/7267003)), then `CRTMNU`.

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
  program-to-system field name) render at a placeholder position with a
  dashed border, since they can't be known at design time.
  `WINDOW(record-format-name)` (inheriting another record's geometry) is
  fully resolved.
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
- A file declaring two `DSPSIZ` sizes shows a screen-size picker. A field
  or keyword conditioned on a display-size condition name (`*DS3`/`*DS4`,
  or a user-defined name) now shows only for its own size (fixed in
  0.9.9 - previously misparsed into garbage indicators and never rendered
  in either size). An unconditioned field's position stays absolute and
  shared across every declared size, per DDS - not a limitation. Not yet
  checked: an unconditioned field's position must fit within the smaller
  declared size - iSDA doesn't warn if it doesn't.
- Rename auto-rewrites `SFLCTL(name)`, `WINDOW(record-format-name)`, and
  `MNUBARCHC(id record-name 'text')` references to the old record name
  elsewhere in the file, and warns (without rewriting) about anything else
  that looks like a reference but isn't one of those three shapes.
  Deleting a *named* field warns the same way (e.g. a `REFFLD(name)`
  reference) but never auto-fixes, since there's nothing to rewrite a
  deleted field's reference TO - review those manually. A bare, unnamed
  constant has nothing to search for, so deleting one never warns.
- "Create New Display File" only writes to local workspace folders - it
  can't create a source member directly on a remote IBM i system.
- Display-length rules for signed/edited numerics are approximated.

### Menu designer

- Only works for a MNUDDS member opened via Code for i's `member:` scheme.
  A local `.mnudds` file shows the screen preview, but the options panel
  reports "unsupported" (no local-workspace convention for where the
  companion `QQ` member would live).
- A brand-new option is placed at a default position, not a chosen one -
  reposition it via the screen designer's drag-to-move if it doesn't fit.
- The companion `QQ` member stays in sync if it's open in its own editor
  tab. Two menu designer instances racing to write it at once is
  unhandled.
- **Compile Menu (CRTMNU)** requires the DDS record format to be named
  exactly the same as the menu member (CRTMNU's own requirement). Only
  handles `TYPE(*DSPF)` menus. The message file is rebuilt from scratch
  every compile, so message IDs added to it by hand outside iSDA won't
  survive a compile from here.
- Rename shares the same auto-rewrite/advisory-warning behavior as the
  DSPF designer above. Deleting an option doesn't scan for other
  references to it either.

## License

MIT — see `LICENSE`.


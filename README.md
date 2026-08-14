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

## Known limitations (v0.9)

- `WINDOW` positions that depend on a runtime value - `*DFT` (system
  positions it relative to the cursor) or a program-to-system field name -
  can't be known at design time by definition, so they render at a
  placeholder position with a dashed border and a "position set at runtime"
  label rather than their real runtime position. `WINDOW(record-format-name)`
  (inheriting another record's geometry) is fully resolved, including
  through the inherited record's own `*DFT`/field-name cases.
- The pulldown-overlay preview (menu bar → clicked choice → dropdown) is
  read-only: you can't drag or edit fields while a pulldown is showing.
  Switch to previewing the `PULLDOWN` record directly to edit it.
- The subfile detail area is read-only when previewing the `SFLCTL`
  (control) record, matching real SDA - switch to previewing the `SFL`
  record itself to edit row layout. When previewing `SFL` with "Preview
  SFLPAG rows" enabled, dragging any field moves every *named* field of the
  row together; unnamed constants in the row template stay put (can't be
  reliably re-located by name across the sequential per-field edits a
  batch move applies).
- `CHCCTL` (per-choice runtime field-setting logic within a pulldown) has no
  visual representation, since it's a logic construct rather than a layout
  one.
- Compare mode (previewing several record formats together) is read-only by
  design - editing an arbitrary combination of independently-defined
  records is ambiguous (which record would an edit belong to?). Switch back
  to single-record mode to make an actual edit.
- Record renaming isn't supported (other keywords like `SFLCTL(name)`,
  `MNUBARCHC(id name text)`, `WINDOW(record-format-name)` reference records
  by name in plain text and wouldn't be updated) - the record name field is
  intentionally read-only.
- "Create New Display File" only writes to local workspace folders - it
  can't create a new source member directly on a remote IBM i system
  (that would mean integrating with Code for i's own member-creation APIs,
  not yet done). You can still preview/edit an already-existing remote
  member once it's open.
- Display-length rules for signed/edited numerics are approximated.

### Menu design (v0.9, updated v0.9.1-0.9.4)

- Only works for a MNUDDS member opened via Code for i's `member:` scheme
  (matches how these are actually edited in practice - SDA menus are IBM i
  source members, not local files). Opening a local `.mnudds` file shows the
  designer with the screen preview, but the options panel reports "unsupported"
  since there's no equivalent local-workspace convention for where the
  companion `QQ` member would live.
- New in v0.9.1: you can add a brand-new numbered option directly from the
  options panel (see Architecture above) - it's placed at a sensible default
  position, not a chosen one, so double-check it against your screen layout
  and reposition via the screen designer's drag-to-move if needed.
- New in v0.9.1: the companion `QQ` member stays in sync if it's also open
  in its own editor tab (edited via `WorkspaceEdit` instead of a raw file
  write, and external edits to it are echoed into the options panel). Two
  menu designer instances racing to write the same `QQ` member at once is
  still unhandled - a rarer case than "the plain text member is also open".
- New in v0.9.3: **"Compile Menu (CRTMNU)"**, a command and sidebar button
  that runs `CRTDSPF`, rebuilds the message file (`DLTMSGF`/`CRTMSGF` +
  `ADDMSGD` per option, `USRnnnn` message IDs), and `CRTMNU` on your
  connected IBM i via [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi)'s
  `code-for-ibmi.runCommand` API. Requires the DDS record format to be
  named exactly the same as the menu member (CRTMNU's own requirement, not
  iSDA's) - you'll get an actionable error rather than a cryptic IBM one if
  it isn't. Only handles `TYPE(*DSPF)` menus (the kind SDA/this tool
  builds) - not `TYPE(*UIM)` menus, an unrelated source format. The message
  file is rebuilt from scratch every compile rather than incrementally
  diffed, so any message IDs you added to it by hand outside of iSDA won't
  survive a compile from here.
- New in v0.9.4: option label text is editable directly in the options
  panel (not just the command); you can **drag one option row onto another
  to swap them** - label and command trade places between the two option
  numbers, numbers stay at their own screen position; and the record format
  itself can be **renamed** from the sidebar. Renaming only rewrites the
  record's own line - it scans the rest of the file for anything that looks
  like it references the old name (`SFLCTL`, `WINDOW`, `MNUBARCHC`) and
  warns with line numbers if it finds any, but doesn't rewrite them for you.

## License

MIT — see `LICENSE`.


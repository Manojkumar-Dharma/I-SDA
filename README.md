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

The parser is TypeScript (compiled twice: once to CommonJS for Node/tests,
once bundled to a browser IIFE via esbuild for the webview). The
engine/writer are plain dependency-free JS so the exact same code runs in
Node (for testing) and in the webview (no bundler needed for those two).

## Getting started

```bash
npm install
npm run compile   # regenerates src/webviewTemplate.ts, src/fixtures/sample.dspf, and dist/
```

Then open this folder in VS Code and press **F5** to launch an Extension
Development Host. Either:
- Open an existing `.dspf`/`.dspf38` file (local, or a remote IBM i source
  member/streamfile via [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi))
  containing DDS display-file source, and run **"iSDA: Open Screen Design
  Preview"** from the command palette or click the preview icon in the
  editor title bar, or
- Run **"iSDA: Create New Display File"** from the command palette (or
  right-click a folder in the Explorer) to generate a starter display file
  and open it directly in the designer.

See `vsc-extension-quickstart.md` for more on the extension dev loop.

## Known limitations (v0.8)

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
- `CHCCTL` (per-choice runtime field-setting logic within a pulldown) has no
  visual representation, since it's a logic construct rather than a layout
  one.
- Whole-row subfile drag moves every *named* field of the row together;
  unnamed constants within a subfile row template stay put (they can't be
  reliably re-located by name across the sequential per-field edits a batch
  move applies).
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

## License

MIT — see `LICENSE`.

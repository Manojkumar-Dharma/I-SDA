# iSDA — Interactive Screen Design Aid

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
| Writer | `src/dspfWriter.js` | Edited field data → regenerated fixed-column source lines, spliced back into the original text with everything else untouched |
| Extension host | `src/extension.ts` | Opens the webview, keeps it in sync with the real document in both directions via `WorkspaceEdit` |
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
Development Host. Open a `.dspf` (or `.pf`) file containing DDS display-file
source and run **"iSDA: Open Screen Design Preview"** from the
command palette, or click the preview icon in the editor title bar.

See `vsc-extension-quickstart.md` for more on the extension dev loop.

## Known limitations (v0.2)

- `WINDOW(*DEFINE ...)` named-window references aren't resolved yet (only
  the direct `WINDOW(line col height width)` form).
- Menu-bar (`MNUBAR`/`MNUBARCHC`) cascading pulldown interaction isn't
  implemented - `PULLDOWN` record choice fields render, but there's no
  simulated menu-bar trigger.
- Dragging a subfile row moves one field at a time, not the whole row as a
  group.
- The interactive editor supports `FIELD`/`CONSTANT` entries only; `RECORD`
  and `HELP` entries aren't editable through the UI yet.
- Fields with multi-group (OR'd) or more-than-3-indicator conditioning are
  intentionally locked read-only in the editor, to avoid corrupting
  conditioning the writer can't yet safely round-trip. Edit those directly
  in the DDS source.
- Display-length rules for signed/edited numerics are approximated.

## License

MIT — see `LICENSE`.

# iSDA — Extension Development Quickstart

## Setup

```bash
npm install
npm run compile
```

`npm run compile` runs three steps in order (see `package.json` → `scripts`):
1. `build:webview-assets` — regenerates `src/fixtures/sample.dspf` (a
   column-exact test fixture) and `src/webviewTemplate.ts` (bakes
   `dspfEngine.js` / `dspfWriter.js` / the bundled parser into one
   self-contained webview HTML string).
2. `tsc -p .` — compiles all TypeScript to `dist/`.
3. `esbuild` — bundles the parser to a browser IIFE at
   `dist/dspfParser.browser.js` for the webview.

## Run it

Open this folder in VS Code, then press **F5** (or Run → Start Debugging).
This launches an Extension Development Host with the extension loaded.

In that new window, open a `.dspf` or `.pf` file containing DDS display-file
source, then either:
- run **"iSDA: Open Screen Design Preview"** from the command palette, or
- click the preview icon in the editor title bar (shown automatically when
  the file looks like a DDS display file — see `isLikelyDisplayFile` in
  `src/extension.ts`)

## Making changes

- After editing any `.ts` file, re-run `npm run compile` (or set up a watch
  task) and reload the Extension Development Host window
  (`Cmd/Ctrl+R` or the Developer: Reload Window command).
- After editing `src/dspfEngine.js` or `src/dspfWriter.js`, you must re-run
  `npm run compile` — they get baked into the generated
  `src/webviewTemplate.ts`, they aren't loaded live.

## Tests

There's no formal test runner wired up yet; verification so far has been
via targeted Node scripts:
- `src/fixtures/smoketest.js` — parses the generated fixture and prints the
  resolved model for manual inspection.
- Round-trip checks (parse → edit via `dspfWriter` → re-parse → diff) were
  run ad hoc during development; worth formalizing into a real test suite
  (Jest, or Node's built-in `node:test`) as a next step.

## Packaging

```bash
npx @vscode/vsce package
```

`.vscodeignore` controls what's excluded from the packaged `.vsix`
(source files, config, `node_modules` — only `dist/` and the metadata files
are needed at runtime).

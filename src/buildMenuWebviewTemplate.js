const fs = require('fs');
const path = require('path');

const engineJs = fs.readFileSync(path.join(__dirname, 'dspfEngine.js'), 'utf8');
const writerJs = fs.readFileSync(path.join(__dirname, 'dspfWriter.js'), 'utf8');
const mnuCmdEngineJs = fs.readFileSync(path.join(__dirname, 'mnuCmdEngine.js'), 'utf8');
const clientHelpersJs = fs.readFileSync(path.join(__dirname, 'webviewClientHelpers.js'), 'utf8');
const parserBundleJs = fs.readFileSync(path.join(__dirname, '../dist/dspfParser.browser.js'), 'utf8');

// Same JSON-string-constant + token-substitution approach as buildWebviewTemplate.js,
// and for the same reason: the embedded JS source files contain literal backticks in
// their JSDoc comments, which would prematurely terminate a TS template literal.
const NONCE_TOKEN = '%%MNU_NONCE%%';
const CSP_TOKEN = '%%MNU_CSP_SOURCE%%';
const FILENAME_TOKEN = '%%MNU_FILENAME%%';
const INITIAL_SOURCE_JSON_TOKEN = '%%MNU_INITIAL_SOURCE_JSON%%';
const INITIAL_COMMAND_JSON_TOKEN = '%%MNU_INITIAL_COMMAND_JSON%%';
const COMMAND_STATUS_JSON_TOKEN = '%%MNU_COMMAND_STATUS_JSON%%';
const COMMAND_FILENAME_JSON_TOKEN = '%%MNU_COMMAND_FILENAME_JSON%%';

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${CSP_TOKEN} 'unsafe-inline'; script-src 'nonce-${NONCE_TOKEN}';" />
<title>Menu Design</title>
<style>
  :root {
    --bg: #0b0f0d; --panel: #111815; --panel-border: #23312b; --ink: #cfe8d8; --ink-dim: #6f8c7d;
    --accent: #33ff66; --warn: #ff8a5c;
    --mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--mono); display: grid; grid-template-columns: 200px 1fr 340px; min-height: 100vh; }
  aside, .options-panel { background: var(--panel); border-right: 1px solid var(--panel-border); padding: 16px; overflow-y: auto; }
  .options-panel { border-right: none; border-left: 1px solid var(--panel-border); }
  h1 { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 14px; color: var(--accent); font-weight: 600; }
  select { width: 100%; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); border-radius: 4px; padding: 6px 8px; font-family: var(--mono); font-size: 13px; }
  main { padding: 30px; display: flex; flex-direction: column; align-items: center; gap: 14px; overflow: auto; }
  .screen-frame { background: #050705; border: 1px solid #1c2a22; border-radius: 4px; padding: 20px; box-shadow: inset 0 0 40px rgba(0,0,0,0.6); }
  .dspf-screen { display: grid; font-family: var(--mono); font-size: 14px; line-height: 1.4em; position: relative; }
  .dspf-field { white-space: pre; color: var(--accent); user-select: none; border: 1px solid transparent; }
  .dspf-constant { color: #b7c9bf; }
  .dspf-hi { filter: brightness(1.6); font-weight: 600; }
  .dspf-reverse { background: currentColor; color: #050705 !important; }
  .dspf-underline { text-decoration: underline; }
  .dspf-blink { animation: dspf-blink 1s steps(1) infinite; }
  .dspf-protect { opacity: 0.65; }
  @keyframes dspf-blink { 50% { opacity: 0; } }
  .dspf-subfile-row { background: rgba(51,255,102,0.04); }
  .dspf-window-border {
    position: relative; border: 2px solid #3a5a45; background: #0a0f0c; border-radius: 2px;
    box-shadow: 3px 3px 0 rgba(0,0,0,0.5); pointer-events: none; z-index: 0;
  }
  .dspf-window-title {
    position: absolute; top: -1px; left: 8px; transform: translateY(-50%);
    background: #0a0f0c; padding: 0 6px; font-size: 11px; color: var(--ink-dim);
  }
  .status { color: var(--ink-dim); font-size: 11px; }
  .warn { color: var(--warn); font-size: 12px; margin-top: 8px; }
  .empty-state { color: var(--ink-dim); font-size: 13px; line-height: 1.5; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-dim); margin: 0 0 10px; }

  /* Options panel */
  .options-panel { display: flex; flex-direction: column; padding: 16px 14px; }
  .options-panel-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
  .options-panel-header h2 { margin: 0; }
  .option-count { font-size: 10px; color: var(--ink-dim); background: #0d1310; border: 1px solid var(--panel-border); border-radius: 10px; padding: 2px 9px; white-space: nowrap; }
  .options-hint { font-size: 11px; color: var(--ink-dim); line-height: 1.5; margin-bottom: 14px; }
  .options-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }

  .option-row {
    display: flex; align-items: flex-start; gap: 8px;
    background: #0d1310; border: 1px solid var(--panel-border); border-radius: 6px;
    padding: 9px 10px 9px 6px; cursor: grab;
    transition: border-color 0.12s ease, background-color 0.12s ease;
  }
  .option-row:hover { border-color: #33553f; }
  .option-row.drag-over { border-color: var(--accent); background: rgba(51,255,102,0.07); }
  .option-row.dragging { opacity: 0.4; }
  .option-drag-handle { flex: 0 0 12px; color: var(--ink-dim); font-size: 12px; line-height: 1.6; padding-top: 5px; user-select: none; text-align: center; letter-spacing: -1px; }
  .option-num-badge {
    flex: 0 0 26px; height: 26px; border-radius: 50%; background: #142018; border: 1px solid #2c4335;
    color: var(--accent); font-weight: 700; font-size: 11px; display: flex; align-items: center; justify-content: center;
  }
  .option-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  .option-field-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-dim); }
  .option-delete-btn { flex: 0 0 auto; align-self: flex-start; background: #1a1010; color: var(--warn); border: 1px solid var(--panel-border); padding: 4px 8px; font-family: var(--mono); font-size: 13px; cursor: pointer; line-height: 1; }
  .option-delete-btn:hover { border-color: var(--warn); }
  .option-copy-btn { flex: 0 0 auto; align-self: flex-start; background: #142018; color: var(--ink); border: 1px solid var(--panel-border); padding: 4px 8px; font-family: var(--mono); font-size: 13px; cursor: pointer; line-height: 1; }
  .option-copy-btn:hover { border-color: var(--accent); }
  .option-label-input {
    width: 100%; background: #050705; color: var(--ink); border: 1px solid var(--panel-border); border-radius: 3px;
    padding: 5px 7px; font-family: var(--mono); font-size: 12px;
  }
  .option-label-input:focus { border-color: var(--accent); outline: none; }
  .option-cmd-row { display: flex; align-items: center; gap: 6px; }
  .option-cmd-prompt { color: var(--ink-dim); font-size: 10px; flex: 0 0 auto; letter-spacing: 0.03em; }
  .option-cmd {
    flex: 1; min-width: 0; background: #050705; color: var(--accent); border: 1px solid var(--panel-border); border-radius: 3px;
    padding: 5px 7px; font-family: var(--mono); font-size: 12px;
  }
  .option-cmd:focus { border-color: var(--accent); outline: none; }
  .option-cmd::placeholder { color: #3d5346; }

  .add-option { border: 1px dashed var(--panel-border); border-radius: 6px; padding: 12px; }
  .add-option-header { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-dim); margin-bottom: 10px; }
  .add-option-row { display: flex; gap: 6px; margin-bottom: 8px; }
  .add-option-num { flex: 0 0 46px; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); border-radius: 4px; padding: 6px 6px; font-family: var(--mono); font-size: 12px; }
  .add-option-label { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); border-radius: 4px; padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .add-option-pos { flex: 1; min-width: 0; background: #0d1310; color: var(--ink-dim); border: 1px solid var(--panel-border); border-radius: 4px; padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .add-option-pos:focus { color: var(--ink); border-color: var(--accent); outline: none; }
  .add-option-btn { width: 100%; background: #142018; color: var(--accent); border: 1px solid var(--panel-border); border-radius: 4px; padding: 7px 8px; font-family: var(--mono); font-size: 12px; cursor: pointer; }
  .add-option-btn:hover { border-color: var(--accent); }
  .add-option-btn:disabled { opacity: 0.5; cursor: default; }
  .add-option-error { color: var(--warn); font-size: 11px; margin-top: 6px; min-height: 1.3em; }
  .compile-btn { width: 100%; background: #142018; color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 9px 8px; font-family: var(--mono); font-size: 12px; cursor: pointer; }
  .compile-btn:hover { background: #1b2c22; }
  .rename-row { display: flex; gap: 6px; margin-top: 8px; }
  .rename-input { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); border-radius: 4px; padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .rename-btn { background: #142018; color: var(--accent); border: 1px solid var(--panel-border); border-radius: 4px; padding: 6px 8px; font-family: var(--mono); font-size: 11px; cursor: pointer; }
  .rename-btn:hover { border-color: var(--accent); }
  .keyword-chip { display: inline-flex; align-items: center; gap: 6px; background: #0d1310; border: 1px solid var(--panel-border); padding: 3px 6px; border-radius: 3px; font-size: 11px; margin: 2px 4px 2px 0; }
  .keyword-chip button { padding: 0 4px; font-size: 11px; border: none; background: transparent; color: var(--warn); }
  .two-col { display: flex; gap: 6px; }
  .two-col > * { flex: 1; min-width: 0; }
  button.secondary { background: #142018; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 11px; cursor: pointer; border-radius: 3px; }
  button.secondary:hover { border-color: var(--accent); }
  .cond-group { border: 1px solid var(--panel-border); border-radius: 3px; padding: 6px 8px; margin-bottom: 6px; }
  .cond-group-label { font-size: 10px; color: var(--ink-dim); margin-bottom: 4px; }
  .cond-add-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
  .cond-add-row label { font-size: 11px; display: flex; align-items: center; gap: 2px; }
  .cond-add-row input.cond-ind-num { width: 36px; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 3px 4px; font-family: var(--mono); font-size: 11px; }
  .cond-group > button.cond-group-remove { display: block; margin-top: 6px; font-size: 11px; }
  .fkey-legend { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 12px; border-bottom: 1px solid var(--panel-border); }
  .fkey-chip { font-size: 11px; padding: 2px 8px; border: 1px solid var(--panel-border); border-radius: 3px; color: var(--ink-dim); }
  .fkey-chip.fkey-active { color: var(--accent); border-color: var(--accent); background: #0d1310; }
  .option-cond-toggle { font-size: 10px; color: var(--ink-dim); cursor: pointer; user-select: none; margin-top: 2px; }
  .option-cond-toggle:hover { color: var(--accent); }
  .option-cond-body { margin-top: 6px; }
  .cmdkeys-section { margin-top: 20px; }
  .hidden { display: none; }
  .kw-row { margin-bottom: 4px; }
  .kw-row-main { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .kw-cond-toggle { font-size: 10px; color: var(--ink-dim); cursor: pointer; user-select: none; }
  .kw-cond-toggle:hover { color: var(--accent); }
  .kw-cond-body { margin: 4px 0 8px 0; padding-left: 8px; border-left: 2px solid var(--panel-border); }
  .file-attrs-toggle { font-size: 11px; color: var(--ink-dim); cursor: pointer; user-select: none; margin-top: 16px; }
  .file-attrs-toggle:hover { color: var(--accent); }
  .file-attrs-body { margin-top: 8px; }
</style>
</head>
<body>
<aside>
  <h1>IBM i · MNUDDS</h1>
  <h2>Menu Design</h2>
  <div class="section-label">Record</div>
  <select id="recordSelect"></select>
  <div class="rename-row">
    <input type="text" class="rename-input" id="recordNameInput" />
    <button class="rename-btn" id="recordRenameBtn">Rename</button>
  </div>
  <div class="add-option-error" id="recordRenameError"></div>
  <button id="recordCopyBtn" class="secondary" style="width:100%;margin-top:8px;">Copy record</button>
  <button id="recordDeleteBtn" class="secondary" style="width:100%;margin-top:6px;color:var(--warn);">Delete record</button>
  <div class="rename-row" style="margin-top:12px;">
    <input type="text" class="rename-input" id="newRecordName" placeholder="New record name" maxlength="10" />
    <button class="rename-btn" id="newRecordBtn">+ Add record</button>
  </div>
  <div class="add-option-error" id="newRecordError"></div>
  <div class="cmdkeys-section" id="fileCommandKeys"></div>
  <div class="cmdkeys-section" id="recordCommandKeys"></div>
  <div class="file-attrs-toggle" id="fileAttrsToggle">File attributes &#x25be;</div>
  <div class="file-attrs-body hidden" id="fileAttrsBody"></div>
  <div class="section-label" style="margin-top:20px;">File</div>
  <div class="status" id="fileStatus">${FILENAME_TOKEN}</div>
  <div class="status" id="cmdStatus" style="margin-top:6px;"></div>
  <button class="compile-btn" id="compileBtn" style="margin-top:20px;">Compile Menu (CRTMNU)</button>
  <div class="status" style="margin-top:6px;">Runs CRTDSPF, rebuilds the message file, then CRTMNU on your connected IBM i. Requires Code for i.</div>
</aside>
<main>
  <div id="fkeyLegend"></div>
  <div class="screen-frame"><div id="screenOutput"></div></div>
  <div class="status">This is the menu layout as it will appear on the 5250 screen. Edit which command each numbered option runs in the panel on the right.</div>
</main>
<div class="options-panel">
  <div class="options-panel-header">
    <h2 style="font-size:13px;">Options</h2>
    <span class="option-count" id="optionCount"></span>
  </div>
  <div class="options-hint">Each option's number, text, and command. Drag ⣿ to swap two options.</div>
  <div class="options-list" id="optionsBody"></div>
  <div class="add-option">
    <div class="add-option-header">+ Add a new option</div>
    <div class="add-option-row">
      <input type="text" class="add-option-num" id="addOptionNum" placeholder="#" inputmode="numeric" />
      <input type="text" class="add-option-label" id="addOptionLabel" placeholder="Option text, e.g. Sign off" />
    </div>
    <div class="add-option-row">
      <input type="text" class="add-option-pos" id="addOptionRow" placeholder="Row" inputmode="numeric" title="Screen row - pre-filled with a suggested spot, edit to choose your own" />
      <input type="text" class="add-option-pos" id="addOptionCol" placeholder="Col" inputmode="numeric" title="Screen column - pre-filled with a suggested spot, edit to choose your own" />
    </div>
    <button class="add-option-btn" id="addOptionBtn">+ Add option</button>
    <div class="add-option-error" id="addOptionError"></div>
  </div>
</div>

<script nonce="${NONCE_TOKEN}">${parserBundleJs}</script>
<script nonce="${NONCE_TOKEN}">${engineJs}</script>
<script nonce="${NONCE_TOKEN}">${writerJs}</script>
<script nonce="${NONCE_TOKEN}">${mnuCmdEngineJs}</script>
<script nonce="${NONCE_TOKEN}">${clientHelpersJs}</script>
<script nonce="${NONCE_TOKEN}">
  const vscode = acquireVsCodeApi();
  let sourceText = ${INITIAL_SOURCE_JSON_TOKEN};
  let commandText = ${INITIAL_COMMAND_JSON_TOKEN};
  const commandStatus = ${COMMAND_STATUS_JSON_TOKEN};
  const commandFileName = ${COMMAND_FILENAME_JSON_TOKEN};
  let model = DspfParser.parseDspf(sourceText);
  let cmdModel = MnuCmdEngine.parseMnuCmd(commandText);

  const recordSelect = document.getElementById('recordSelect');
  const screenOutput = document.getElementById('screenOutput');
  const optionsBody = document.getElementById('optionsBody');
  const optionCountEl = document.getElementById('optionCount');
  const cmdStatusEl = document.getElementById('cmdStatus');
  const addOptionNumInput = document.getElementById('addOptionNum');
  const addOptionLabelInput = document.getElementById('addOptionLabel');
  const addOptionRowInput = document.getElementById('addOptionRow');
  const addOptionColInput = document.getElementById('addOptionCol');
  const addOptionBtn = document.getElementById('addOptionBtn');
  const addOptionError = document.getElementById('addOptionError');
  const recordNameInput = document.getElementById('recordNameInput');
  const recordRenameBtn = document.getElementById('recordRenameBtn');
  const recordRenameError = document.getElementById('recordRenameError');
  const recordCopyBtn = document.getElementById('recordCopyBtn');
  const recordDeleteBtn = document.getElementById('recordDeleteBtn');
  const newRecordName = document.getElementById('newRecordName');
  const newRecordBtn = document.getElementById('newRecordBtn');
  const newRecordError = document.getElementById('newRecordError');
  const fileCommandKeysEl = document.getElementById('fileCommandKeys');
  const recordCommandKeysEl = document.getElementById('recordCommandKeys');
  const fkeyLegendEl = document.getElementById('fkeyLegend');
  const fileAttrsToggle = document.getElementById('fileAttrsToggle');
  const fileAttrsBody = document.getElementById('fileAttrsBody');
  let fileAttrsExpanded = false; // survives renderAll() rebuilding everything else, same convention as expandedOptionConditioning below
  const expandedKeywordConditioning = new Set(); // "ownerKey:idx" strings whose per-keyword Conditioning panel is expanded, shared with the DSPF designer's own convention
  const expandedOptionConditioning = new Set(); // numberValues whose "Conditioning" panel is expanded - survives renderOptions() rebuilding all rows

  // A menu option is any DDS constant shaped like "1. Do a thing" or "12) Do a thing" -
  // that's the one thing that distinguishes menu-option text from any other constant
  // A menu option's NUMBER is a constant shaped like "1." or "12)" - by
  // itself when the number and label are two separate DDS constants (SDA
  // commonly lays out menus this way, e.g. one constant at col 7 for "1."
  // and a second one at col 10 for the label text, for consistent column
  // alignment across every option), or with the label text right on the
  // same constant ("1. Do a thing") when it isn't. NUMBER_ONLY_RE detects
  // the split form's number marker; COMBINED_RE detects the single-constant
  // form. Earlier versions of this file only recognized the combined form -
  // a split-form option's number marker matched COMBINED_RE too (with an
  // empty captured label), so its real label text sitting in a SEPARATE
  // constant was invisible to the options panel, and editing it overwrote
  // the number marker instead of the actual label. Fixed by detecting both
  // forms and pairing a number-only marker with the next constant to its
  // right on the same source line.
  const NUMBER_ONLY_RE = /^\\s*(\\d{1,2})[.\\)]\\s*$/;
  const COMBINED_RE = /^\\s*(\\d{1,2})[.\\)]\\s*(\\S.*)$/;
  const OPTION_RE = COMBINED_RE; // kept as an alias - existing add/rename code only ever needs the combined shape

  /**
   * Scans every CONSTANT field in the model for menu options in either
   * form. Returns one entry per option number with enough to both render
   * and edit correctly regardless of which form it's in:
   *   - numberField: the constant holding "N." or "N. label"
   *   - labelField: the constant holding the label text - same object as
   *     numberField for the combined form, a separate constant for the
   *     split form, or null if a number marker has no paired text at all
   *     (a bare "1." with nothing else on that line to its right)
   *   - label: the resolved label text either way
   */
  function extractMenuOptions(m) {
    const options = [];
    m.records.forEach((record) => {
      // Group this record's constants by source line, sorted left-to-right,
      // so a number-only marker can look for "the next constant on this
      // line" without a second pass over the whole record.
      const byLine = new Map();
      record.fields.forEach((f) => {
        if (f.nameType !== 'CONSTANT' || f.constantValue == null) return;
        if (!f.location || f.location.line == null) return;
        if (!byLine.has(f.location.line)) byLine.set(f.location.line, []);
        byLine.get(f.location.line).push(f);
      });
      byLine.forEach((lineFields) => lineFields.sort((a, b) => (a.location.column || 0) - (b.location.column || 0)));

      record.fields.forEach((f) => {
        if (f.nameType !== 'CONSTANT' || f.constantValue == null) return;
        const combined = COMBINED_RE.exec(f.constantValue);
        if (combined) {
          options.push({
            numberValue: parseInt(combined[1], 10),
            optionNumber: MnuCmdEngine.padOptionNumber(combined[1]),
            label: combined[2].trim(),
            recordName: record.name,
            line: f.location.line,
            column: f.location.column,
            numberField: f,
            labelField: f,
          });
          return;
        }
        const numberOnly = NUMBER_ONLY_RE.exec(f.constantValue);
        if (numberOnly) {
          const siblings = byLine.get(f.location.line) || [];
          const myCol = f.location.column || 0;
          const labelField = siblings.find((s) => s !== f && (s.location.column || 0) > myCol) || null;
          options.push({
            numberValue: parseInt(numberOnly[1], 10),
            optionNumber: MnuCmdEngine.padOptionNumber(numberOnly[1]),
            label: labelField ? labelField.constantValue.trim() : '',
            recordName: record.name,
            line: f.location.line,
            column: f.location.column,
            numberField: f,
            labelField: labelField,
          });
        }
      });
    });
    options.sort((a, b) => a.numberValue - b.numberValue);
    const seen = new Set();
    return options.filter((o) => {
      if (seen.has(o.numberValue)) return false;
      seen.add(o.numberValue);
      return true;
    });
  }

  function commandFor(numberValue) {
    const found = cmdModel.options.find((o) => o.numberValue === numberValue);
    return found ? found.command : '';
  }

  // Fresh lookup by option number (not a name - CONSTANT fields don't have
  // one) against a given model, rather than reusing a field reference from
  // before an edit - the same "re-fetch after each edit, don't trust a
  // stale reference" discipline the screen designer's group-drag uses,
  // since editing one field can shift source line numbers for others.
  function findOption(m, numberValue) {
    return extractMenuOptions(m).find((o) => o.numberValue === numberValue) || null;
  }

  /**
   * Writes a new label for an option, in whichever form it's actually in -
   * combined ("N. label", rewrite the one constant with the number prefix
   * kept), split with an existing label constant (rewrite just that
   * constant, verbatim, no number prefix - the number lives in its own
   * constant untouched), or split with NO label constant yet (insert a new
   * one right after the number marker on the same line, rather than
   * silently doing nothing).
   */
  function writeOptionLabel(currentLines, currentModel, option, newLabel) {
    const label = newLabel.trim();
    // Blank out silently ignored across every form, rather than leaving a
    // dangling "N. " (combined form) or an empty-string constant (split
    // form) - editing a label isn't how you clear one.
    if (!label) return currentLines;
    if (option.labelField === option.numberField) {
      return DspfWriter.applyFieldUpdate(option.numberField, currentLines, { constantValue: String(option.numberValue) + '. ' + label });
    }
    if (option.labelField) {
      return DspfWriter.applyFieldUpdate(option.labelField, currentLines, { constantValue: label });
    }
    const numberField = option.numberField;
    const gapColumn = (numberField.location.column || 1) + numberField.constantValue.length + 2;
    return DspfWriter.insertField(
      recordOfOption(currentModel, option),
      currentLines,
      { nameType: 'CONSTANT', constantValue: label, location: { line: option.line, column: gapColumn } }
    );
  }

  function recordOfOption(currentModel, option) {
    return currentModel.records.find((r) => r.name === option.recordName);
  }

  // DspfEngine.escapeHtml already escapes quotes as well as &/</>, so it
  // covers both text-node and attribute-value contexts - escapeAttr is kept
  // as a name (existing call sites use it) but no longer needs its own regex.
  function escapeHtml(s) { return DspfEngine.escapeHtml(s); }
  function escapeAttr(s) { return DspfEngine.escapeHtml(s); }

  function rebuildRecordSelect() {
    const value = WebviewClientHelpers.rebuildRecordSelect(recordSelect, model.records);
    if (recordNameInput) recordNameInput.value = value;
  }

  function renderScreen() {
    rebuildRecordSelect();
    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    if (!recordName) {
      screenOutput.innerHTML = '<div class="empty-state">No record formats found.</div>';
      fkeyLegendEl.innerHTML = '';
      renderFileCommandKeys(null);
      recordCopyBtn.disabled = true;
      recordDeleteBtn.disabled = true;
      return;
    }
    recordSelect.value = recordName;
    const currentRecord = model.records.find((r) => r.name === recordName);
    const recordEditable = DspfWriter.isEditable(currentRecord);
    recordCopyBtn.disabled = !recordEditable;
    recordCopyBtn.title = recordEditable ? '' : 'Multi-group or >3-indicator conditioning - copying this record is disabled to avoid corrupting it.';
    recordDeleteBtn.disabled = false;
    const screen = DspfEngine.resolveScreen(model, recordName, new Set(), null);
    if (screen.error) { screenOutput.innerHTML = '<div class="warn">' + escapeHtml(screen.error) + '</div>'; return; }
    screenOutput.innerHTML = DspfEngine.renderScreenHtml(screen);
    fkeyLegendEl.innerHTML = WebviewClientHelpers.functionKeyLegendHtml(DspfEngine.resolveFunctionKeyLegend(model, currentRecord, new Set()));
    renderFileCommandKeys(currentRecord);
    renderRecordCommandKeys(currentRecord);
  }

  function renderFileCommandKeys(currentRecord) {
    const recordKeywords = currentRecord ? currentRecord.keywords : [];
    const available = DspfWriter.availableCommandKeyNumbers(model.fileKeywords, recordKeywords);
    fileCommandKeysEl.innerHTML = WebviewClientHelpers.commandKeysSectionHtml('file-level', model.fileKeywords, available, 'file');
    WebviewClientHelpers.wireCommandKeysSection('file', model.fileKeywords, (newKeywords) => {
      let lines = sourceText.split(/\\r\\n|\\r|\\n/);
      lines = DspfWriter.applyFileKeywordsUpdate(model, lines, newKeywords);
      sourceText = lines.join('\\n');
      model = DspfParser.parseDspf(sourceText);
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      renderAll();
    });
  }

  function renderRecordCommandKeys(currentRecord) {
    if (!currentRecord) { recordCommandKeysEl.innerHTML = ''; return; }
    const available = DspfWriter.availableCommandKeyNumbers(model.fileKeywords, currentRecord.keywords);
    recordCommandKeysEl.innerHTML = WebviewClientHelpers.commandKeysSectionHtml('this record', currentRecord.keywords, available, 'record');
    WebviewClientHelpers.wireCommandKeysSection('record', currentRecord.keywords, (newKeywords) => {
      const recordName = currentRecord.name;
      let lines = sourceText.split(/\\r\\n|\\r|\\n/);
      const rec = model.records.find((r) => r.name === recordName);
      if (!rec) return;
      lines = DspfWriter.applyRecordUpdate(rec, lines, { keywords: newKeywords });
      sourceText = lines.join('\\n');
      model = DspfParser.parseDspf(sourceText);
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      renderAll();
    });
  }

  // File attributes (fileKeywords - DSPSIZ, REF, PRINT, etc.): a collapsible
  // section rather than the DSPF designer's own dedicated properties-panel
  // view, since this sidebar doesn't have a "click something, panel swaps
  // to its properties" mechanism the way the DSPF designer's field/record
  // click-to-select does - a toggle matches this file's own established UI
  // language (see .option-cond-toggle) better than inventing a new pattern.
  // Reuses the SAME keywordEditorHtml/wireKeywordEditor primitives the DSPF
  // designer's file/record/field panels use, including their per-keyword
  // Conditioning toggle - nothing menu-specific about DSPSIZ/REF/etc.
  function renderFileAttrs() {
    fileAttrsToggle.textContent = 'File attributes ' + (fileAttrsExpanded ? '\\u25b4' : '\\u25be');
    if (!fileAttrsExpanded) {
      fileAttrsBody.classList.add('hidden');
      fileAttrsBody.innerHTML = '';
      return;
    }
    fileAttrsBody.classList.remove('hidden');
    fileAttrsBody.innerHTML = WebviewClientHelpers.keywordEditorHtml(model.fileKeywords, 'file', expandedKeywordConditioning);
    WebviewClientHelpers.wireKeywordEditor(model.fileKeywords, (newKeywords) => {
      let lines = sourceText.split(/\\r\\n|\\r|\\n/);
      lines = DspfWriter.applyFileKeywordsUpdate(model, lines, newKeywords);
      sourceText = lines.join('\\n');
      model = DspfParser.parseDspf(sourceText);
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      renderAll();
    }, 'file', expandedKeywordConditioning, renderFileAttrs);
  }

  fileAttrsToggle.addEventListener('click', () => {
    fileAttrsExpanded = !fileAttrsExpanded;
    renderFileAttrs();
  });

  function updateOptionLabel(numberValue, newLabel) {
    const option = findOption(model, numberValue);
    if (!option) return;
    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = writeOptionLabel(lines, model, option, newLabel);
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });
    renderAll();
  }

  // A menu option is one or two DDS CONSTANTs (see extractMenuOptions) - conditioning
  // "the option" means conditioning both of them identically, so the number marker and
  // its label text always show/hide together rather than one lagging the other. Applied
  // to numberField first, then labelField (re-fetched from the freshly-reparsed model,
  // since the first edit shifts source line numbers for everything after it) only when
  // it's a genuinely separate constant from numberField (the combined "1. Do a thing"
  // form only has the one field to begin with).
  function updateOptionConditions(numberValue, newConditions) {
    const option = findOption(model, numberValue);
    if (!option) return;
    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.applyFieldUpdate(option.numberField, lines, { conditions: newConditions });
    let currentModel = DspfParser.parseDspf(lines.join('\\n'));
    if (option.labelField && option.labelField !== option.numberField) {
      const fresh = findOption(currentModel, numberValue);
      if (fresh && fresh.labelField) {
        lines = DspfWriter.applyFieldUpdate(fresh.labelField, lines, { conditions: newConditions });
        currentModel = DspfParser.parseDspf(lines.join('\\n'));
      }
    }
    sourceText = lines.join('\\n');
    model = currentModel;
    vscode.postMessage({ type: 'applyEdit', text: sourceText });
    renderAll();
  }


  // Deletes an option entirely: both its DDS constant(s) (the number-marker
  // and, for the split-constant form, the separate label constant too - see
  // extractMenuOptions) AND its MNUCMD command mapping if one exists. No
  // confirmation prompt and no renumbering of other options - deleting is a
  // normal WorkspaceEdit like every other change here, so Ctrl+Z undoes it
  // the same way.
  function deleteOption(numberValue) {
    const option = findOption(model, numberValue);
    if (!option) return;

    const fields = option.labelField && option.labelField !== option.numberField
      ? [option.numberField, option.labelField]
      : [option.numberField];
    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.deleteFields(fields, lines);
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });

    if (commandStatus !== 'unsupported' && commandFor(numberValue)) {
      commandText = MnuCmdEngine.applyOptionCommand(commandText, numberValue, '');
      cmdModel = MnuCmdEngine.parseMnuCmd(commandText);
      vscode.postMessage({ type: 'applyMenuCmdEdit', text: commandText });
    }

    renderAll();
  }

  // Duplicates an option's underlying constant(s) via DspfWriter.copyField -
  // the same primitive the DSPF designer's own field/constant Copy button
  // uses (see CHANGELOG "Copy field/constant") - reused here rather than a
  // second implementation, since an option's number-marker/label are plain
  // DDS constants underneath. copyField's own default placement (one row
  // below, same column) keeps the copy visually next to the original; the
  // one thing it can't do generically is pick a fresh OPTION NUMBER (two
  // options can't share one, unlike two arbitrary constants which can be
  // identical), so this rewrites just the copy's number afterward via
  // applyFieldUpdate - next-available is simply the current max + 1, same
  // "append past the end" convention addNewOption's own placement guess
  // uses elsewhere in this file.
  function copyOption(numberValue) {
    const option = findOption(model, numberValue);
    if (!option) return;
    const record = model.records.find((r) => r.name === option.recordName);
    if (!record) return;

    const existing = extractMenuOptions(model);
    const nextNum = Math.max.apply(null, existing.map((o) => o.numberValue)) + 1;
    if (nextNum > 9999) {
      vscode.postMessage({ type: 'error', message: 'iSDA: no option numbers left under 9999 to copy "' + numberValue + '" into.' });
      return;
    }
    const punctuation = /\\)\\s*$/.test(option.numberField.constantValue.trim()) ? ')' : '.';

    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.copyField(record, lines, option.numberField, {});
    let currentModel = DspfParser.parseDspf(lines.join('\\n'));
    let freshRec = currentModel.records.find((r) => r.name === option.recordName);
    const newNumberField = freshRec && freshRec.fields[freshRec.fields.length - 1];
    if (!newNumberField) return;

    const isCombined = !option.labelField || option.labelField === option.numberField;
    const newNumberValue = isCombined ? nextNum + punctuation + ' ' + option.label : String(nextNum) + punctuation;
    lines = DspfWriter.applyFieldUpdate(newNumberField, lines, { constantValue: newNumberValue });

    if (!isCombined) {
      // Split form: the label lives in its own constant - copy that one
      // too, placed on the SAME row the number copy just landed on (rather
      // than copyField's own default of "one row below ITS original"),
      // same column the original label used, so the pair stays aligned as
      // one visual option like the source did.
      currentModel = DspfParser.parseDspf(lines.join('\\n'));
      freshRec = currentModel.records.find((r) => r.name === option.recordName);
      const origLabelFresh = freshRec.fields.find(
        (f) => f.location && f.location.line === option.line && f.location.column === option.labelField.location.column && f !== newNumberField
      );
      if (origLabelFresh) {
        lines = DspfWriter.copyField(freshRec, lines, origLabelFresh, {
          location: { line: newNumberField.location.line + 1, column: origLabelFresh.location.column },
        });
      }
    }

    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });
    expandedOptionConditioning.delete(nextNum);
    renderAll();
  }

  // Swaps what's shown at two option NUMBERS - label text AND command -
  // while each number stays at its own screen position. This is what
  // actually reorders visibly in the options panel (which always lists by
  // number): dragging option 1 onto option 10 makes option 1's row show
  // what option 10 used to show, and vice versa. The alternative - swapping
  // which screen position holds which number - would leave the panel
  // looking identical (still sorted 1, 2, 10 either way) with the only
  // visible change buried in the screen preview, which isn't what dragging
  // items in a list is expected to do.
  //
  // Each side keeps its OWN form (combined vs. split constants) - only the
  // label text moves between them, via writeOptionLabel(), which already
  // knows how to write into either shape correctly.
  function swapOptions(numberA, numberB) {
    if (numberA === numberB) return;
    const optionA = findOption(model, numberA);
    const optionB = findOption(model, numberB);
    if (!optionA || !optionB) return;
    const labelA = optionA.label;
    const labelB = optionB.label;

    if (commandStatus === 'unsupported') {
      vscode.postMessage({ type: 'error', message: 'This document has no known companion-file convention (not a local .mnudds file or an IBM i member via Code for i), so there is nowhere to save the swapped commands.' });
      return;
    }

    // Later-in-file edit first, same reasoning as elsewhere (commitGroupEdit
    // in the screen designer, addNewOption above): editing the earlier
    // field first would shift source line numbers out from under the
    // second lookup.
    const aIsLater = (optionA.line || 0) >= (optionB.line || 0);
    const firstNum = aIsLater ? numberA : numberB;
    const firstNewLabel = aIsLater ? labelB : labelA;
    const secondNum = aIsLater ? numberB : numberA;
    const secondNewLabel = aIsLater ? labelA : labelB;

    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    let currentModel = model;

    let opt = findOption(currentModel, firstNum);
    lines = writeOptionLabel(lines, currentModel, opt, firstNewLabel);
    currentModel = DspfParser.parseDspf(lines.join('\\n'));

    opt = findOption(currentModel, secondNum);
    lines = writeOptionLabel(lines, currentModel, opt, secondNewLabel);
    currentModel = DspfParser.parseDspf(lines.join('\\n'));

    sourceText = lines.join('\\n');
    model = currentModel;
    vscode.postMessage({ type: 'applyEdit', text: sourceText });

    const commandA = commandFor(numberA);
    const commandB = commandFor(numberB);
    commandText = MnuCmdEngine.applyOptionCommand(commandText, numberA, commandB);
    commandText = MnuCmdEngine.applyOptionCommand(commandText, numberB, commandA);
    cmdModel = MnuCmdEngine.parseMnuCmd(commandText);
    vscode.postMessage({ type: 'applyMenuCmdEdit', text: commandText });

    renderAll();
  }

  function renderOptions() {
    const options = extractMenuOptions(model);
    optionsBody.innerHTML = '';
    if (optionCountEl) optionCountEl.textContent = options.length === 1 ? '1 option' : options.length + ' options';
    refreshAddOptionDefaults();
    if (options.length === 0) {
      optionsBody.innerHTML = '<div class="empty-state">No numbered options found on this screen yet. iSDA looks for constants shaped like "1. Do a thing" to build this list - add one in the DDS source, then reopen this designer.</div>';
      return;
    }
    options.forEach((opt) => {
      const row = document.createElement('div');
      row.className = 'option-row';
      row.draggable = true;
      const command = commandFor(opt.numberValue);
      const numLabel = String(opt.numberValue);
      const isExpanded = expandedOptionConditioning.has(opt.numberValue);
      const conditions = (opt.numberField && opt.numberField.conditions) || [];
      const condSummary = conditions.length > 0 ? ' (' + conditions.length + ')' : '';
      row.innerHTML =
        '<div class="option-drag-handle" title="Drag onto another option to swap them">\u28FF</div>' +
        '<div class="option-num-badge">' + numLabel + '</div>' +
        '<div class="option-fields">' +
        '<div class="option-field-label">Option text</div>' +
        '<input type="text" class="option-label-input" value="' + escapeAttr(opt.label) + '" title="' + escapeAttr(opt.label) + '" placeholder="Option text" />' +
        '<div class="option-cmd-row">' +
        '<span class="option-cmd-prompt">CMD&gt;</span>' +
        '<input type="text" class="option-cmd" value="' + escapeAttr(command) + '" placeholder="Command to run, e.g. CALL PGM1" />' +
        '</div>' +
        '<div class="option-cond-toggle" data-num="' + numLabel + '">Conditioning' + condSummary + (isExpanded ? ' \u25b4' : ' \u25be') + '</div>' +
        '<div class="option-cond-body' + (isExpanded ? '' : ' hidden') + '" id="opt-cond-body-' + numLabel + '"></div>' +
        '</div>' +
        '<button type="button" class="option-copy-btn" title="Copy option ' + numLabel + ' as a new option">&#x2398;</button>' +
        '<button type="button" class="option-delete-btn" title="Delete option ' + numLabel + '">&times;</button>';

      // Appended to the document BEFORE any wiring below - WebviewClientHelpers'
      // conditions-editor wiring uses global document.querySelector (shared with
      // the DSPF designer's props panel, which is always already attached), so a
      // detached row element would leave its "+ OR condition"/remove buttons unwired.
      optionsBody.appendChild(row);

      const condToggle = row.querySelector('.option-cond-toggle');
      const condBody = row.querySelector('.option-cond-body');
      if (isExpanded) {
        condBody.innerHTML = WebviewClientHelpers.conditionsEditorHtml(conditions, 'opt' + numLabel);
        WebviewClientHelpers.wireConditionsEditor('opt' + numLabel, conditions, (newConditions) => updateOptionConditions(opt.numberValue, newConditions));
      }
      condToggle.addEventListener('click', () => {
        if (expandedOptionConditioning.has(opt.numberValue)) expandedOptionConditioning.delete(opt.numberValue);
        else expandedOptionConditioning.add(opt.numberValue);
        renderOptions();
      });

      const deleteBtn = row.querySelector('.option-delete-btn');
      deleteBtn.addEventListener('click', () => deleteOption(opt.numberValue));

      const copyBtn = row.querySelector('.option-copy-btn');
      copyBtn.addEventListener('click', () => copyOption(opt.numberValue));

      const labelInput = row.querySelector('.option-label-input');
      labelInput.addEventListener('change', () => updateOptionLabel(opt.numberValue, labelInput.value));

      const input = row.querySelector('.option-cmd');
      input.addEventListener('change', () => {
        if (commandStatus === 'unsupported') {
          vscode.postMessage({ type: 'error', message: 'This document has no known companion-file convention (not a local .mnudds file or an IBM i member via Code for i), so there is nowhere to save option-to-command mappings.' });
          input.value = command;
          return;
        }
        commandText = MnuCmdEngine.applyOptionCommand(commandText, opt.numberValue, input.value);
        cmdModel = MnuCmdEngine.parseMnuCmd(commandText);
        vscode.postMessage({ type: 'applyMenuCmdEdit', text: commandText });
      });

      // Drag-to-swap: drop this row onto another to swap their (number +
      // label) screen positions - see swapOptions() above. Dragging starts
      // from anywhere on the row EXCEPT the two text inputs, so selecting
      // text to edit it doesn't accidentally start a drag.
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(opt.numberValue));
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const draggedNumber = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(draggedNumber)) swapOptions(draggedNumber, opt.numberValue);
      });
    });
  }

  function renderAll() {
    renderScreen();
    renderOptions();
    renderFileAttrs();
  }

  // Placement for a brand-new option: one row below the last existing option
  // in the target record (same column) - the common case for a stacked menu
  // list. With no existing options in that record yet to anchor on, this is
  // a guess (row 6, col 5); reposition it afterwards with the screen
  // designer (dspfDesigner.editor) if it doesn't fit your layout - see
  // README "Known limitations".
  // Delegates to DspfEngine.screenLinesForRecord for the actual DSPSIZ
  // parsing/precedence (record-level overrides file-level, falls back to
  // 24) - shared with the DSPF designer's own screen-size resolution rather
  // than this file keeping a second, separate DSPSIZ parser.
  function getScreenRowLimit(currentModel, record) {
    return DspfEngine.screenLinesForRecord(currentModel, record);
  }

  // The record's own DSPSIZ bound is a hard ceiling, but a real menu's
  // interactive area effectively ends well above that: the numbered
  // options are always followed by a "Selection or command" prompt (and
  // its input field) as the LAST interactive element, with the remaining
  // rows down to the bottom of the screen typically left blank for visual
  // framing. Those blank rows are technically free and within DSPSIZ, but
  // placing a new option there would put it below the prompt a user
  // actually types into - invisible in practice even though nothing
  // occupies that space. DDS has no keyword that specifically marks "the
  // command line prompt", so this uses the same structural signal a real
  // menu always has instead of matching on prompt text (fragile, and
  // wouldn't generalize past English): the record's own lowest
  // INPUT-CAPABLE field (usage I or B) - in a real menu that's virtually
  // always the command-line input itself, since nothing interactive
  // legitimately sits below it. A record with no input-capable field at
  // all (unusual for a menu, but not impossible) falls back to the plain
  // DSPSIZ bound, unchanged from before.
  function effectiveRowLimit(currentModel, record) {
    const dspsizLimit = getScreenRowLimit(currentModel, record);
    const inputRows = (record.fields || [])
      .filter((f) => (f.usage === 'I' || f.usage === 'B') && f.location && f.location.line != null)
      .map((f) => f.location.line);
    if (inputRows.length === 0) return dspsizLimit;
    return Math.min(dspsizLimit, Math.min.apply(null, inputRows) - 1);
  }

  // Finds the first row at or after startRow that isn't already occupied by
  // ANY field in the record (function-key text, a "Selection or command"
  // prompt, another option, etc.) and doesn't run past the effective row
  // limit (see effectiveRowLimit above). Returns null if there's no room,
  // so the caller can tell the user rather than silently placing a new
  // option off-screen, on top of something that's already there, or below
  // the command-line prompt - the symptoms this was written to fix (see
  // CHANGELOG).
  function findSafeOptionRow(currentModel, record, startRow) {
    const maxRows = effectiveRowLimit(currentModel, record);
    const occupiedRows = new Set();
    (record.fields || []).forEach((f) => {
      if (f.location && f.location.line != null) occupiedRows.add(f.location.line);
    });
    for (let row = startRow; row <= maxRows; row++) {
      if (!occupiedRows.has(row)) return row;
    }
    return null;
  }

  // The starting point for "+ Add option" - one row below the last existing
  // option in this record, same column (or row 6/col 5 as a guess with no
  // options yet to anchor on). Shared between the pre-filled Row/Col inputs
  // and validating whatever the user actually submits, so both always agree
  // on what "the suggested spot" means.
  function computeDefaultPlacement(recordName) {
    const record = model.records.find((r) => r.name === recordName);
    if (!record) return null;
    const existing = extractMenuOptions(model).filter((o) => o.recordName === recordName && o.line != null);
    let startRow = 6;
    let column = 5;
    if (existing.length > 0) {
      const last = existing.reduce((a, b) => (b.line > a.line ? b : a));
      startRow = last.line + 1;
      column = last.column != null ? last.column : 5;
    } else {
      // No options in this record yet - start right after whatever content
      // it already has (a title, header lines, a divider, etc.) instead of
      // a fixed guess that might land on top of that content or leave an
      // unnecessarily large gap below it. findSafeOptionRow() below still
      // searches forward from here regardless, so this can't make things
      // worse than the old fixed guess - it just makes the STARTING guess a
      // much better one for the common case (a menu record already has a
      // title before its first option is ever added).
      const occupiedLines = (record.fields || [])
        .map((f) => (f.location ? f.location.line : null))
        .filter((n) => n != null);
      if (occupiedLines.length > 0) startRow = Math.max.apply(null, occupiedLines) + 1;
    }
    return { line: findSafeOptionRow(model, record, startRow), column: column, startRow: startRow };
  }

  // Pre-fills the Row/Col inputs with the suggested spot - but only while
  // they're empty, so this never clobbers a value the user already typed in
  // (e.g. after a mid-form edit elsewhere triggers a re-render).
  function refreshAddOptionDefaults() {
    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    if (!recordName) return;
    const placement = computeDefaultPlacement(recordName);
    if (!placement) return;
    if (!addOptionRowInput.value && placement.line != null) addOptionRowInput.value = String(placement.line);
    if (!addOptionColInput.value) addOptionColInput.value = String(placement.column);
  }

  function isRowAvailable(currentModel, record, row) {
    const maxRows = effectiveRowLimit(currentModel, record);
    if (!Number.isInteger(row) || row < 1 || row > maxRows) return false;
    return !(record.fields || []).some((f) => f.location && f.location.line === row);
  }

  function addNewOption() {
    addOptionError.textContent = '';
    const numRaw = addOptionNumInput.value.trim();
    const label = addOptionLabelInput.value.trim();
    if (!/^[0-9]{1,4}$/.test(numRaw)) {
      addOptionError.textContent = 'Enter an option number (1-9999).';
      return;
    }
    if (!label) {
      addOptionError.textContent = 'Enter the option text.';
      return;
    }
    const numberValue = parseInt(numRaw, 10);
    const existing = extractMenuOptions(model);
    if (existing.some((o) => o.numberValue === numberValue)) {
      addOptionError.textContent = 'Option ' + numberValue + ' already exists - edit its command above, or its text via the screen designer.';
      return;
    }

    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    const record = model.records.find((r) => r.name === recordName);
    if (!record) {
      addOptionError.textContent = 'No record format selected.';
      return;
    }

    const placement = computeDefaultPlacement(recordName);
    const rowRaw = addOptionRowInput.value.trim();
    const colRaw = addOptionColInput.value.trim();
    const column = colRaw ? parseInt(colRaw, 10) : placement ? placement.column : 5;
    if (!Number.isInteger(column) || column < 1) {
      addOptionError.textContent = 'Enter a valid column number.';
      return;
    }

    let line;
    if (rowRaw) {
      // A row the user typed in themselves (whether they edited the
      // pre-filled suggestion or left it as-is) - validate it specifically,
      // naming the exact reason it doesn't work rather than silently
      // searching for a different spot instead of the one they asked for.
      line = parseInt(rowRaw, 10);
      if (!Number.isInteger(line) || line < 1) {
        addOptionError.textContent = 'Enter a valid row number.';
        return;
      }
      if (!isRowAvailable(model, record, line)) {
        const maxRows = effectiveRowLimit(model, record);
        addOptionError.textContent =
          line > maxRows
            ? 'Row ' + line + ' is past this screen\\'s usable area (row ' + maxRows + ' or above only - past that is either the screen size limit or the Selection-or-command prompt). Choose a smaller row, or add it manually via the screen designer.'
            : 'Row ' + line + ' is already used by another field on this screen. Choose a different row.';
        return;
      }
    } else {
      // Fields were cleared (or never pre-filled, e.g. no record selected
      // yet at the time) - fall back to the same auto-search as before.
      line = findSafeOptionRow(model, record, placement ? placement.startRow : 6);
      if (line == null) {
        addOptionError.textContent =
          'No room left on this screen for a new option - reposition something first, or add it manually via the screen designer.';
        return;
      }
    }

    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.insertField(record, lines, {
      nameType: 'CONSTANT',
      constantValue: numberValue + '. ' + label,
      location: { line: line, column: column },
    });
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });

    addOptionNumInput.value = '';
    addOptionLabelInput.value = '';
    addOptionRowInput.value = '';
    addOptionColInput.value = '';
    renderAll();
  }

  addOptionBtn.addEventListener('click', addNewOption);

  recordRenameBtn.addEventListener('click', () => {
    recordRenameError.textContent = '';
    const oldName = recordSelect.value;
    const newName = (recordNameInput.value || '').trim().toUpperCase();
    if (!oldName) return;
    if (!newName) {
      recordRenameError.textContent = 'Enter a record format name.';
      return;
    }
    if (newName === oldName) return;
    if (!WebviewClientHelpers.isValidDdsName(newName)) {
      recordRenameError.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).';
      return;
    }
    if (model.records.some((r) => r.name === newName)) {
      recordRenameError.textContent = 'A record format named ' + newName + ' already exists.';
      return;
    }

    const record = model.records.find((r) => r.name === oldName);
    if (!record) return;

    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.renameRecordReferences(model, lines, oldName, newName);
    lines = DspfWriter.renameRecordFormat(record, lines, newName);
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });

    // Re-scan AFTER both rewrites: anything findLikelyNameReferences still
    // finds genuinely couldn't be auto-fixed (not one of the SFLCTL/WINDOW/
    // MNUBARCHC shapes renameRecordReferences recognizes, or a reference
    // sitting inside a comment) and needs a manual look.
    const renamed = model.records.find((r) => r.name === newName);
    const ownRange = renamed ? DspfWriter.getRecordLineRange(renamed) : null;
    const remaining = WebviewClientHelpers.findLikelyNameReferences(sourceText, oldName, ownRange);
    if (remaining.length > 0) {
      vscode.postMessage({
        type: 'error',
        message:
          'iSDA: line(s) ' + remaining.join(', ') + ' in this source still look like they might reference "' + oldName +
          '" - not one of the SFLCTL/WINDOW/MNUBARCHC shapes this can auto-fix. Review those manually.',
      });
    }

    renderAll();
  });

  // Creates a brand-new, empty record format via DspfWriter.insertRecord
  // and immediately selects it - same pattern the DSPF designer's own
  // "+ Add record" uses. A name is required and must not collide with an
  // existing record in the file, checked client-side against the current
  // model first.
  newRecordBtn.addEventListener('click', () => {
    const name = (newRecordName.value || '').trim().toUpperCase();
    newRecordError.textContent = '';
    if (!name) { newRecordError.textContent = 'Enter a name for the new record format.'; return; }
    if (!WebviewClientHelpers.isValidDdsName(name)) { newRecordError.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).'; return; }
    if (model.records.some((r) => r.name === name)) { newRecordError.textContent = 'A record format named "' + name + '" already exists in this file.'; return; }

    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.insertRecord(model, lines, { name: name });
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });
    newRecordName.value = '';

    // Setting recordSelect.value to a name with no matching <option> yet is
    // a silent no-op (rebuildRecordSelect only "sticks" a value that's
    // already an existing <option>), so this has to happen AFTER the model
    // above has been reparsed and renderAll()'s own rebuildRecordSelect has
    // had a chance to run once first - same two-step fix the DSPF
    // designer's own record-selection bug required.
    renderAll();
    if (model.records.some((r) => r.name === name)) {
      recordSelect.value = name;
      renderAll();
    }
  });

  // Duplicates the whole record via DspfWriter.copyRecord (own conditions/
  // keywords + every field/constant/help entry it owns, verbatim, under a
  // fresh auto-generated name) and immediately selects the new record -
  // same primitive and "land on the copy, let the user pick it up from
  // there" spirit as the DSPF designer's own Copy record button. Disabled
  // (via renderScreen's own recordCopyBtn.disabled) when the record's own
  // conditioning is too complex to safely reserialize.
  recordCopyBtn.addEventListener('click', () => {
    if (recordCopyBtn.disabled) return;
    const recordName = recordSelect.value;
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;

    const copiedName = DspfWriter.nextAvailableRecordName(model, rec.name);
    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.copyRecord(model, lines, rec, { name: copiedName });
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });

    // Same "select only after the new <option> genuinely exists" gotcha as
    // "+ Add record" above.
    renderAll();
    if (model.records.some((r) => r.name === copiedName)) {
      recordSelect.value = copiedName;
      renderAll();
    }
  });

  // No confirmation prompt - same "it's a normal WorkspaceEdit, Ctrl+Z
  // undoes it" stance every other delete action in iSDA takes. Doesn't
  // auto-fix other keywords elsewhere in the file that might reference this
  // record by name (SFLCTL/WINDOW/MNUBARCHC) - only warns, using the same
  // advisory findLikelyNameReferences scan Rename already relies on above.
  // After deletion, falls back to whichever record rebuildRecordSelect's
  // own default picks (or the empty-file state if it was the last one).
  recordDeleteBtn.addEventListener('click', () => {
    const recordName = recordSelect.value;
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;

    const references = WebviewClientHelpers.findLikelyNameReferences(sourceText, rec.name, DspfWriter.getFullRecordLineRange(rec));
    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.deleteRecord(rec, lines);
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });

    if (references.length > 0) {
      vscode.postMessage({
        type: 'error',
        message:
          'iSDA: line(s) ' + references.join(', ') + ' in this source look like they might still reference "' + rec.name +
          '" (e.g. SFLCTL, WINDOW, MNUBARCHC) - deleting a record never rewrites other keywords that reference it. Review those manually.',
      });
    }

    renderAll();
  });

  const compileBtn = document.getElementById('compileBtn');
  compileBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'compileMenu' });
  });

  if (cmdStatusEl) {
    if (commandStatus === 'loaded') cmdStatusEl.textContent = 'Commands: ' + commandFileName;
    else if (commandStatus === 'missing') cmdStatusEl.textContent = 'Commands: ' + commandFileName + ' (will be created on first edit)';
    else cmdStatusEl.textContent = 'Commands: unsupported for this document type - open a local .mnudds file or an IBM i member (Code for i) to edit options';
  }

  recordSelect.addEventListener('change', renderAll);

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'externalUpdate') {
      sourceText = msg.text;
      model = DspfParser.parseDspf(sourceText);
      renderAll();
    } else if (msg.type === 'externalCommandUpdate') {
      // The companion MNUCMD member changed outside this designer (its own
      // editor tab, another tool) - re-render just the options panel against
      // the new mapping. The screen itself is untouched by this.
      commandText = msg.text;
      cmdModel = MnuCmdEngine.parseMnuCmd(commandText);
      renderOptions();
    }
  });

  renderAll();
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;

/**
 * Bakes dspfEngine.js and mnuCmdEngine.js (both plain, dependency-free JS -
 * see their own file headers) and the browser-bundled parser into a
 * self-contained HTML string with placeholder tokens, emitted as a small TS
 * module (menuWebviewTemplate.ts) that just does token substitution at
 * runtime. Same rationale as buildWebviewTemplate.js: uses a nonce-scoped
 * CSP (VS Code webview requirement) and postMessage to talk back to the
 * extension host, since a webview has no direct access to the filesystem or
 * the `vscode` module.
 */
const output = `// GENERATED FILE - do not edit directly. Run \`npm run build:webview-assets\` to regenerate
// (source: buildMenuWebviewTemplate.js, dspfEngine.js, dspfWriter.js, mnuCmdEngine.js, dist/dspfParser.browser.js).
const MNU_TEMPLATE: string = ${JSON.stringify(htmlTemplate)};

export type MenuCommandSourceStatus = 'loaded' | 'missing' | 'unsupported';

export function getMenuWebviewHtml(
  cspSource: string,
  nonce: string,
  initialSource: string,
  initialCommandSource: string,
  fileName: string,
  commandFileName: string,
  commandSourceStatus: MenuCommandSourceStatus
): string {
  return MNU_TEMPLATE
    .split(${JSON.stringify(NONCE_TOKEN)}).join(nonce)
    .split(${JSON.stringify(CSP_TOKEN)}).join(cspSource)
    .split(${JSON.stringify(FILENAME_TOKEN)}).join(fileName)
    .split(${JSON.stringify(INITIAL_SOURCE_JSON_TOKEN)}).join(JSON.stringify(initialSource))
    .split(${JSON.stringify(INITIAL_COMMAND_JSON_TOKEN)}).join(JSON.stringify(initialCommandSource))
    .split(${JSON.stringify(COMMAND_STATUS_JSON_TOKEN)}).join(JSON.stringify(commandSourceStatus))
    .split(${JSON.stringify(COMMAND_FILENAME_JSON_TOKEN)}).join(JSON.stringify(commandFileName));
}
`;

fs.writeFileSync(path.join(__dirname, 'menuWebviewTemplate.ts'), output);
console.log('Generated src/menuWebviewTemplate.ts');

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
  <div class="section-label" style="margin-top:20px;">File</div>
  <div class="status" id="fileStatus">${FILENAME_TOKEN}</div>
  <div class="status" id="cmdStatus" style="margin-top:6px;"></div>
  <button class="compile-btn" id="compileBtn" style="margin-top:20px;">Compile Menu (CRTMNU)</button>
  <div class="status" style="margin-top:6px;">Runs CRTDSPF, rebuilds the message file, then CRTMNU on your connected IBM i. Requires Code for i.</div>
</aside>
<main>
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
  const addOptionBtn = document.getElementById('addOptionBtn');
  const addOptionError = document.getElementById('addOptionError');
  const recordNameInput = document.getElementById('recordNameInput');
  const recordRenameBtn = document.getElementById('recordRenameBtn');
  const recordRenameError = document.getElementById('recordRenameError');

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
    if (!recordName) { screenOutput.innerHTML = '<div class="empty-state">No record formats found.</div>'; return; }
    recordSelect.value = recordName;
    const screen = DspfEngine.resolveScreen(model, recordName, new Set(), null);
    if (screen.error) { screenOutput.innerHTML = '<div class="warn">' + escapeHtml(screen.error) + '</div>'; return; }
    screenOutput.innerHTML = DspfEngine.renderScreenHtml(screen);
  }

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
      vscode.postMessage({ type: 'error', message: 'This menu was not opened from an IBM i source member (Code for i), so there is nowhere to save the swapped commands.' });
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
      row.innerHTML =
        '<div class="option-drag-handle" title="Drag onto another option to swap them">\u28FF</div>' +
        '<div class="option-num-badge">' + numLabel + '</div>' +
        '<div class="option-fields">' +
        '<div class="option-field-label">Option text</div>' +
        '<input type="text" class="option-label-input" value="' + escapeAttr(opt.label) + '" placeholder="Option text" />' +
        '<div class="option-cmd-row">' +
        '<span class="option-cmd-prompt">CMD&gt;</span>' +
        '<input type="text" class="option-cmd" value="' + escapeAttr(command) + '" placeholder="Command to run, e.g. CALL PGM1" />' +
        '</div>' +
        '</div>' +
        '<button type="button" class="option-delete-btn" title="Delete option ' + numLabel + '">&times;</button>';

      const deleteBtn = row.querySelector('.option-delete-btn');
      deleteBtn.addEventListener('click', () => deleteOption(opt.numberValue));

      const labelInput = row.querySelector('.option-label-input');
      labelInput.addEventListener('change', () => updateOptionLabel(opt.numberValue, labelInput.value));

      const input = row.querySelector('.option-cmd');
      input.addEventListener('change', () => {
        if (commandStatus === 'unsupported') {
          vscode.postMessage({ type: 'error', message: 'This menu was not opened from an IBM i source member (Code for i), so there is nowhere to save option-to-command mappings.' });
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

      optionsBody.appendChild(row);
    });
  }

  function renderAll() {
    renderScreen();
    renderOptions();
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

  // Finds the first row at or after startRow that isn't already occupied by
  // ANY field in the record (function-key text, a "Selection or command"
  // prompt, another option, etc.) and doesn't run past the screen's own row
  // limit. Returns null if there's no room, so the caller can tell the user
  // rather than silently placing a new option off-screen or on top of
  // something that's already there - the two symptoms this was written to
  // fix (see CHANGELOG).
  function findSafeOptionRow(currentModel, record, startRow) {
    const maxRows = getScreenRowLimit(currentModel, record);
    const occupiedRows = new Set();
    (record.fields || []).forEach((f) => {
      if (f.location && f.location.line != null) occupiedRows.add(f.location.line);
    });
    for (let row = startRow; row <= maxRows; row++) {
      if (!occupiedRows.has(row)) return row;
    }
    return null;
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

    const inThisRecord = existing.filter((o) => o.recordName === recordName && o.line != null);
    let startRow = 6;
    let column = 5;
    if (inThisRecord.length > 0) {
      const last = inThisRecord.reduce((a, b) => (b.line > a.line ? b : a));
      startRow = last.line + 1;
      column = last.column != null ? last.column : 5;
    }

    const line = findSafeOptionRow(model, record, startRow);
    if (line == null) {
      addOptionError.textContent =
        'No room left on this screen for a new option - row ' + startRow + ' and below are either already used by another field ' +
        '(a "Selection or command" prompt, function-key text, etc.) or past the screen size (DSPSIZ). Reposition something first, ' +
        'or add it manually via the screen designer.';
      return;
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
    const ownRange = DspfWriter.getRecordLineRange(record);
    const references = WebviewClientHelpers.findLikelyNameReferences(sourceText, oldName, ownRange);
    if (references.length > 0) {
      vscode.postMessage({
        type: 'error',
        message:
          'iSDA: line(s) ' + references.join(', ') + ' in this source look like they might reference "' + oldName +
          '" (SFLCTL, WINDOW, MNUBARCHC, etc.) - renaming only updates the record\\'s own line. Review those manually after renaming.',
      });
    }

    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.renameRecordFormat(record, lines, newName);
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });
    renderAll();
  });

  const compileBtn = document.getElementById('compileBtn');
  compileBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'compileMenu' });
  });

  if (cmdStatusEl) {
    if (commandStatus === 'loaded') cmdStatusEl.textContent = 'Commands: ' + commandFileName;
    else if (commandStatus === 'missing') cmdStatusEl.textContent = 'Commands: ' + commandFileName + ' (will be created on first edit)';
    else cmdStatusEl.textContent = 'Commands: unsupported - open the MNUDDS member from Code for i to edit options';
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

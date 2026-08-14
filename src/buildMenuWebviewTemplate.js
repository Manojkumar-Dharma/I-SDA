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
  select { width: 100%; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 13px; }
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
  .option-row { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--panel-border); cursor: grab; }
  .option-row.drag-over { background: rgba(51,255,102,0.08); border-top: 1px dashed var(--accent); }
  .option-row.dragging { opacity: 0.4; }
  .option-num { flex: 0 0 26px; color: var(--accent); font-weight: 600; font-size: 15px; text-align: right; padding-top: 4px; }
  .option-body { flex: 1; min-width: 0; }
  .option-label-input { width: 100%; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 12px; margin-bottom: 6px; }
  .option-label-input:focus { border-color: var(--accent); outline: none; }
  .option-cmd { width: 100%; background: #0d1310; color: var(--accent); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .option-cmd:focus { border-color: var(--accent); outline: none; }
  .add-option { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--panel-border); }
  .add-option-row { display: flex; gap: 6px; margin-bottom: 6px; }
  .add-option-num { flex: 0 0 46px; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 6px; font-family: var(--mono); font-size: 12px; }
  .add-option-label { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .add-option-btn { width: 100%; background: #142018; color: var(--accent); border: 1px solid var(--panel-border); padding: 7px 8px; font-family: var(--mono); font-size: 12px; cursor: pointer; }
  .add-option-btn:hover { border-color: var(--accent); }
  .add-option-btn:disabled { opacity: 0.5; cursor: default; }
  .add-option-error { color: var(--warn); font-size: 11px; margin-top: 6px; min-height: 1.3em; }
  .compile-btn { width: 100%; background: #142018; color: var(--accent); border: 1px solid var(--accent); padding: 9px 8px; font-family: var(--mono); font-size: 12px; cursor: pointer; }
  .compile-btn:hover { background: #1b2c22; }
  .rename-row { display: flex; gap: 6px; margin-top: 8px; }
  .rename-input { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .rename-btn { background: #142018; color: var(--accent); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 11px; cursor: pointer; }
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
  <h2 style="font-size:13px;">Options → Commands</h2>
  <div id="optionsBody"></div>
  <div class="add-option">
    <div class="section-label">Add a new option</div>
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
  // on the screen (there's no dedicated DDS keyword for it - SDA menus are plain DDS
  // plus a convention). See isLikelyMenuFile() in extension.ts for the same pattern
  // used to decide whether to offer this designer at all.
  const OPTION_RE = /^\\s*(\\d{1,2})[.\\)]\\s*(.*)$/;

  function extractMenuOptions(m) {
    const options = [];
    m.records.forEach((record) => {
      record.fields.forEach((f) => {
        if (f.nameType !== 'CONSTANT' || f.constantValue == null) return;
        const match = OPTION_RE.exec(f.constantValue);
        if (!match) return;
        options.push({
          numberValue: parseInt(match[1], 10),
          optionNumber: MnuCmdEngine.padOptionNumber(match[1]),
          label: match[2].trim(),
          recordName: record.name,
          line: f.location && f.location.line != null ? f.location.line : null,
          column: f.location && f.location.column != null ? f.location.column : null,
        });
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
  function findOptionField(m, numberValue) {
    for (const record of m.records) {
      for (const f of record.fields) {
        if (f.nameType !== 'CONSTANT' || f.constantValue == null) continue;
        const match = OPTION_RE.exec(f.constantValue);
        if (match && parseInt(match[1], 10) === numberValue) return f;
      }
    }
    return null;
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
    const field = findOptionField(model, numberValue);
    if (!field) return;
    const label = newLabel.trim();
    if (!label) return; // an empty label would leave a dangling "N. " - just ignore, same as leaving it unedited
    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    lines = DspfWriter.applyFieldUpdate(field, lines, { constantValue: MnuCmdEngine.padOptionNumber(numberValue).replace(/^0+(?=\\d)/, '') + '. ' + label });
    sourceText = lines.join('\\n');
    model = DspfParser.parseDspf(sourceText);
    vscode.postMessage({ type: 'applyEdit', text: sourceText });
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
  function swapOptions(numberA, numberB) {
    if (numberA === numberB) return;
    const fieldA = findOptionField(model, numberA);
    const fieldB = findOptionField(model, numberB);
    if (!fieldA || !fieldB) return;
    const matchA = OPTION_RE.exec(fieldA.constantValue);
    const matchB = OPTION_RE.exec(fieldB.constantValue);
    if (!matchA || !matchB) return;
    const labelA = matchA[2].trim();
    const labelB = matchB[2].trim();

    if (commandStatus === 'unsupported') {
      vscode.postMessage({ type: 'error', message: 'This menu was not opened from an IBM i source member (Code for i), so there is nowhere to save the swapped commands.' });
      return;
    }

    const paddedA = String(numberA);
    const paddedB = String(numberB);

    // Later-in-file edit first, same reasoning as elsewhere (commitGroupEdit
    // in the screen designer, addNewOption above): editing the earlier
    // field first would shift source line numbers out from under the
    // second lookup.
    const aIsLater = (fieldA.location.line || 0) >= (fieldB.location.line || 0);
    const firstNum = aIsLater ? numberA : numberB;
    const firstValue = aIsLater ? paddedA + '. ' + labelB : paddedB + '. ' + labelA;
    const secondNum = aIsLater ? numberB : numberA;
    const secondValue = aIsLater ? paddedB + '. ' + labelA : paddedA + '. ' + labelB;

    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    let currentModel = model;

    let f = findOptionField(currentModel, firstNum);
    lines = DspfWriter.applyFieldUpdate(f, lines, { constantValue: firstValue });
    currentModel = DspfParser.parseDspf(lines.join('\\n'));

    f = findOptionField(currentModel, secondNum);
    lines = DspfWriter.applyFieldUpdate(f, lines, { constantValue: secondValue });
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
        '<div class="option-num">' + numLabel + '</div>' +
        '<div class="option-body">' +
        '<input type="text" class="option-label-input" value="' + escapeAttr(opt.label) + '" placeholder="Option text" />' +
        '<input type="text" class="option-cmd" value="' + escapeAttr(command) + '" placeholder="Command to run, e.g. CALL PGM1" />' +
        '</div>';

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
    let line = 6;
    let column = 5;
    if (inThisRecord.length > 0) {
      const last = inThisRecord.reduce((a, b) => (b.line > a.line ? b : a));
      line = last.line + 1;
      column = last.column != null ? last.column : 5;
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

  // Best-effort advisory scan for other lines that might reference this
  // record by name (SFLCTL(name), WINDOW(... name ...), MNUBARCHC(id name
  // text), etc.) - renameRecordFormat() only rewrites the record's OWN
  // R-line, same reasoning DspfWriter.applyRecordUpdate already documents
  // for treating a rename as genuinely risky to fully automate. \\b treats
  // only [A-Za-z0-9_] as word characters, so a name starting/ending with
  // $/#/@ won't match as precisely - good enough for an advisory warning,
  // not a hard guarantee.
  function isDdsWordChar(ch) {
    return /[A-Z0-9_]/.test(ch);
  }

  // Deliberately not a dynamically-built regex - the name being searched for
  // is itself the variable part, and there's no need to fight regex
  // metacharacter escaping (DDS names can contain $#@) when a plain
  // case-insensitive substring scan with a manual word-boundary check does
  // the same job with nothing to get wrong.
  function findLikelyNameReferences(text, name, excludeLineRange) {
    if (!name) return [];
    const upperName = name.toUpperCase();
    const lines = text.split(/\\r\\n|\\r|\\n/);
    const hits = [];
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (excludeLineRange && lineNo >= excludeLineRange[0] && lineNo <= excludeLineRange[1]) return;
      const upperLine = line.toUpperCase();
      let searchFrom = 0;
      while (true) {
        const pos = upperLine.indexOf(upperName, searchFrom);
        if (pos === -1) break;
        const before = pos > 0 ? upperLine[pos - 1] : '';
        const after = pos + upperName.length < upperLine.length ? upperLine[pos + upperName.length] : '';
        if (!isDdsWordChar(before) && !isDdsWordChar(after)) {
          hits.push(lineNo);
          break;
        }
        searchFrom = pos + 1;
      }
    });
    return hits;
  }

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
    if (!/^[A-Z$#@][A-Z0-9$#@_]{0,9}$/.test(newName)) {
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
    const references = findLikelyNameReferences(sourceText, oldName, ownRange);
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

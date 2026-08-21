const fs = require('fs');
const path = require('path');

const engineJs = fs.readFileSync(path.join(__dirname, 'dspfEngine.js'), 'utf8');
const writerJs = fs.readFileSync(path.join(__dirname, 'dspfWriter.js'), 'utf8');
const clientHelpersJs = fs.readFileSync(path.join(__dirname, 'webviewClientHelpers.js'), 'utf8');
const parserBundleJs = fs.readFileSync(path.join(__dirname, '../dist/dspfParser.browser.js'), 'utf8');

// Build the full HTML at Node build time with plain-text placeholder tokens for the
// values only known at TS runtime (nonce, cspSource, fileName, initialSource).
//
// Deliberately NOT using TS template-literal syntax in the *generated* output: the
// embedded JS source files contain literal backtick characters in their JSDoc comments
// (e.g. `updates`), which would prematurely terminate a TS template literal if written
// out as raw backtick-delimited source. Instead the whole HTML is stored as one
// JSON.stringify'd string constant (backticks need no escaping inside a JSON string)
// and the placeholders are substituted at runtime with plain string .split/.join.
const NONCE_TOKEN = '%%DSPF_NONCE%%';
const CSP_TOKEN = '%%DSPF_CSP_SOURCE%%';
const FILENAME_TOKEN = '%%DSPF_FILENAME%%';
const INITIAL_SOURCE_JSON_TOKEN = '%%DSPF_INITIAL_SOURCE_JSON%%';

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${CSP_TOKEN} 'unsafe-inline'; script-src 'nonce-${NONCE_TOKEN}';" />
<title>DDS Screen Design</title>
<style>
  :root {
    --bg: #0b0f0d; --panel: #111815; --panel-border: #23312b; --ink: #cfe8d8; --ink-dim: #6f8c7d;
    --accent: #33ff66; --warn: #ff8a5c;
    --mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--mono); display: grid; grid-template-columns: 240px 1fr 300px; min-height: 100vh; }
  aside, .props-panel { background: var(--panel); border-right: 1px solid var(--panel-border); padding: 16px; overflow-y: auto; }
  .props-panel { border-right: none; border-left: 1px solid var(--panel-border); }
  h1 { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 14px; color: var(--accent); font-weight: 600; }
  select, input[type=text], input[type=number] { width: 100%; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 13px; }
  .field-row { margin-bottom: 10px; }
  .field-row label { display: block; font-size: 10px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  main { padding: 30px; display: flex; flex-direction: column; align-items: center; gap: 14px; overflow: auto; }
  .screen-frame { background: #050705; border: 1px solid #1c2a22; border-radius: 4px; padding: 20px; box-shadow: inset 0 0 40px rgba(0,0,0,0.6); }
  #screenOutput { position: relative; }
  .dspf-screen { display: grid; font-family: var(--mono); font-size: 14px; line-height: 1.4em; position: relative; z-index: 1; }
  .dspf-screen-backdrop-layer { position: absolute; top: 0; left: 0; opacity: 0.32; filter: grayscale(0.5); pointer-events: none; z-index: 0; }
  .dspf-screen-backdrop-layer .dspf-screen { z-index: 0; }
  .dspf-field { white-space: pre; color: var(--accent); cursor: grab; user-select: none; border: 1px solid transparent; position: relative; z-index: 1; }
  .dspf-field:hover { border-color: rgba(51,255,102,0.4); }
  .dspf-field.selected { border-color: var(--accent); background: rgba(51,255,102,0.08); }
  .dspf-field.dragging { cursor: grabbing; opacity: 0.7; }
  .dspf-field.locked { cursor: not-allowed; }
  .dspf-field.locked:hover { border-color: rgba(255,138,92,0.5); }
  .dspf-constant { color: #b7c9bf; }
  .dspf-hi { filter: brightness(1.6); font-weight: 600; }
  .dspf-reverse { background: currentColor; color: #050705 !important; }
  .dspf-underline { text-decoration: underline; }
  .dspf-blink { animation: dspf-blink 1s steps(1) infinite; }
  .dspf-protect { opacity: 0.65; }
  @keyframes dspf-blink { 50% { opacity: 0; } }
  .dspf-subfile-preview {
    background: repeating-linear-gradient(45deg, rgba(255,138,92,0.06), rgba(255,138,92,0.06) 4px, transparent 4px, transparent 8px);
    border: 1px dashed rgba(255,138,92,0.35) !important;
    cursor: not-allowed !important; pointer-events: none;
  }
  .dspf-field[data-tag^="subfile-edit-row-"] { border-color: rgba(51,255,102,0.15); }
  .dspf-field[data-tag^="subfile-edit-row-"]:hover { border-color: var(--accent); background: rgba(51,255,102,0.06); }
  .dspf-window-border {
    position: relative; border: 2px solid #3a5a45; background: #0a0f0c; border-radius: 2px;
    box-shadow: 3px 3px 0 rgba(0,0,0,0.5); pointer-events: none; z-index: 0;
  }
  .dspf-window-border.dspf-window-default-position { border-style: dashed; border-color: var(--warn); }
  .dspf-window-title {
    position: absolute; top: -1px; left: 8px; transform: translateY(-50%);
    background: #0a0f0c; padding: 0 6px; font-size: 11px; color: var(--ink-dim);
    pointer-events: auto;
  }
  .dspf-window-title.dspf-window-title-editable { cursor: pointer; }
  .dspf-window-title.dspf-window-title-editable:hover { color: var(--accent); }
  .dspf-window-move-handle {
    position: absolute; top: 0; left: 0; right: 0; height: 14px; cursor: move; pointer-events: auto; z-index: 1;
  }
  .dspf-window-resize-handle {
    position: absolute; bottom: -4px; right: -4px; width: 12px; height: 12px;
    background: #3a5a45; border: 1px solid var(--panel-border); border-radius: 2px;
    cursor: nwse-resize; pointer-events: auto; z-index: 1;
  }
  .dspf-window-resize-handle:hover, .dspf-window-move-handle:hover { background: var(--accent); }
  .dspf-window-border.dspf-window-locked .dspf-window-move-handle,
  .dspf-window-border.dspf-window-locked .dspf-window-resize-handle { cursor: not-allowed; opacity: 0.4; }
  .dspf-field.dspf-widget-radio, .dspf-field.dspf-widget-checkbox {
    display: flex; flex-direction: column; justify-content: center; white-space: normal; z-index: 1;
  }
  .dspf-choice-row { display: flex; align-items: center; gap: 4px; line-height: 1.3em; }
  .dspf-choice-glyph { color: var(--ink-dim); font-family: var(--mono); }
  .dspf-field.dspf-cntfld {
    display: flex; flex-direction: column; white-space: normal; z-index: 1;
  }
  .dspf-cntfld-line { line-height: 1.4em; }
  .dspf-window-msgline {
    white-space: pre; color: var(--warn); background: rgba(255,138,92,0.1);
    pointer-events: none; z-index: 1; overflow: hidden;
  }
  .dspf-field.dspf-widget-button { background: transparent; z-index: 1; }
  .dspf-widget-button {
    width: 100%; height: 100%; background: #14261c; color: var(--accent);
    border: 1px solid #3a5a45; border-radius: 3px; font-family: var(--mono);
    font-size: 12px; cursor: grab; padding: 2px 8px;
  }
  .dspf-field.dspf-widget-menubar { display: flex; align-items: center; white-space: nowrap; background: #10231a; z-index: 1; }
  .dspf-menubar-choice {
    display: inline-block; padding: 0 4px; cursor: pointer; color: var(--ink);
    box-sizing: border-box;
  }
  .dspf-menubar-choice:hover, .dspf-menubar-choice.dspf-menubar-open { background: var(--accent); color: #0a0f0c; }
  .dspf-pulldown-border { z-index: 2; }
  .dspf-pulldown-field { z-index: 3; }
  .dspf-field.dspf-pulldown-field.dspf-widget-radio, .dspf-field.dspf-pulldown-field.dspf-widget-checkbox { background: #0a0f0c; }
  .status { color: var(--ink-dim); font-size: 11px; }
  .warn { color: var(--warn); font-size: 12px; margin-top: 8px; }
  #sizeBoundsWarning { white-space: pre-line; }
  .rename-row { display: flex; gap: 6px; margin-top: 8px; }
  .rename-input { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .rename-btn { background: #142018; color: var(--accent); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 11px; cursor: pointer; }
  .rename-btn:hover { border-color: var(--accent); }
  .rename-error { color: var(--warn); font-size: 11px; margin-top: 6px; min-height: 1.3em; }
  .delete-hint { color: var(--ink-dim); font-size: 11px; margin-top: 10px; }
  button { background: #14261c; color: var(--accent); border: 1px solid #23482f; padding: 6px 10px; font-family: var(--mono); font-size: 12px; cursor: pointer; border-radius: 3px; }
  button:hover { background: #1b3324; }
  button.secondary { color: var(--ink); border-color: var(--panel-border); }
  .keyword-chip { display: inline-flex; align-items: center; gap: 6px; background: #0d1310; border: 1px solid var(--panel-border); padding: 3px 6px; border-radius: 3px; font-size: 11px; margin: 2px 4px 2px 0; }
  .keyword-chip button { padding: 0 4px; font-size: 11px; border: none; background: transparent; color: var(--warn); }
  .attr-checks { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 4px 0 12px; }
  .attr-check { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ink-dim); }
  .hint-small { font-size: 10px; color: var(--ink-dim); margin: 2px 0 10px; }
  .kw-row { margin-bottom: 4px; }
  .kw-row-main { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .kw-cond-toggle { font-size: 10px; color: var(--ink-dim); cursor: pointer; user-select: none; }
  .kw-cond-toggle:hover { color: var(--accent); }
  .kw-cond-body { margin: 4px 0 8px 0; padding-left: 8px; border-left: 2px solid var(--panel-border); }
  .empty-state { color: var(--ink-dim); font-size: 13px; }
  .help-entry-row {
    background: #0d1310; border: 1px solid var(--panel-border); border-radius: 3px;
    padding: 6px 8px; margin-bottom: 6px; font-size: 12px; cursor: pointer;
  }
  .help-entry-row:hover { border-color: var(--accent); }
  .field-order-row {
    display: flex; align-items: center; gap: 6px; background: #0d1310;
    border: 1px solid var(--panel-border); border-radius: 3px;
    padding: 4px 6px; margin-bottom: 4px; font-size: 12px;
  }
  .field-order-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field-order-row button {
    width: 22px; height: 22px; padding: 0; font-size: 12px; line-height: 1;
    border: 1px solid var(--panel-border); background: var(--panel); color: var(--ink);
    border-radius: 3px; cursor: pointer;
  }
  .field-order-row button:disabled { opacity: 0.35; cursor: default; }
  .field-order-row button:not(:disabled):hover { border-color: var(--accent); }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-dim); margin: 16px 0 8px; }
  .compare-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; margin-top: 4px; color: var(--ink-dim); }
  .compare-toggle input { accent-color: var(--warn); }
  #compareRecordList { margin-top: 8px; }
  .hidden { display: none; }
  .compare-record-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; cursor: pointer; }
  .hint-readonly { color: var(--warn); }
  .cond-group { border: 1px solid var(--panel-border); border-radius: 3px; padding: 6px 8px; margin-bottom: 6px; }
  .cond-group-label { font-size: 10px; color: var(--ink-dim); margin-bottom: 4px; }
  .cond-add-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
  .cond-add-row label { font-size: 11px; display: flex; align-items: center; gap: 2px; }
  .cond-add-row input.cond-ind-num { width: 36px; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 3px 4px; font-family: var(--mono); font-size: 11px; }
  .cond-group > button.cond-group-remove { display: block; margin-top: 6px; font-size: 11px; }
  .fkey-legend { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 12px; border-bottom: 1px solid var(--panel-border); }
  .fkey-chip { font-size: 11px; padding: 2px 8px; border: 1px solid var(--panel-border); border-radius: 3px; color: var(--ink-dim); }
  .fkey-chip.fkey-active { color: var(--accent); border-color: var(--accent); background: #0d1310; }
  .props-breadcrumb { font-size: 11px; color: var(--ink-dim); margin-bottom: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .props-breadcrumb .crumb { cursor: pointer; }
  .props-breadcrumb .crumb:hover { color: var(--accent); }
  .props-breadcrumb .crumb.current { color: var(--ink); cursor: default; font-weight: 600; }
  .props-breadcrumb .crumb-sep { color: var(--panel-border); }
  .props-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--panel-border); margin-bottom: 12px; flex-wrap: wrap; }
  .props-tab { background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--ink-dim); font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 8px; cursor: pointer; border-radius: 0; }
  .props-tab:hover { color: var(--ink); background: transparent; }
  .props-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .props-tab-panel { display: none; }
  .props-tab-panel.active { display: block; }
  .props-accordion { border: 1px solid var(--panel-border); border-radius: 3px; margin-bottom: 10px; }
  .props-accordion > summary { cursor: pointer; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-dim); list-style: none; }
  .props-accordion > summary::-webkit-details-marker { display: none; }
  .props-accordion > summary:hover { color: var(--accent); }
  .props-accordion[open] > summary { border-bottom: 1px solid var(--panel-border); color: var(--accent); }
  .props-accordion-body { padding: 8px; }
  .place-btn-row { display: flex; gap: 6px; margin-top: 8px; }
  .place-btn-row button { flex: 1; }
  .place-btn-row button.active { color: var(--accent); border-color: var(--accent); background: #0d1310; }
  .dspf-screen.placing { cursor: crosshair; }
</style>
</head>
<body>
<aside>
  <h1>IBM i · DDS</h1>
  <h2>Screen Design</h2>
  <div class="field-row"><label>Record</label><select id="recordSelect"></select></div>
  <div class="rename-row" style="margin-top:6px;">
    <input type="text" class="rename-input" id="newRecordName" placeholder="New record name" maxlength="10" />
    <button class="rename-btn" id="newRecordBtn">+ Add record</button>
  </div>
  <div class="rename-error" id="newRecordError"></div>
  <div class="field-row hidden" id="sizeSelectRow"><label>Screen size</label><select id="sizeSelect"></select></div>
  <div class="warn hidden" id="sizeBoundsWarning"></div>
  <div class="place-btn-row">
    <button class="secondary" id="placeFieldBtn">+ Field</button>
    <button class="secondary" id="placeConstantBtn">+ Constant</button>
  </div>
  <div class="hint-readonly hidden" id="placementHint">Click anywhere on the screen preview to place it there (Esc to cancel).</div>
  <label class="compare-toggle"><input type="checkbox" id="compareModeToggle" /> Show other record(s) dimmed behind</label>
  <label class="compare-toggle hidden" id="previewRowsRow"><input type="checkbox" id="previewRowsToggle" /> Preview SFLPAG rows</label>
  <div id="compareRecordList" class="hidden"></div>
  <div class="section-label">Conditioning indicators (preview)</div>
  <div id="indicatorList"></div>
  <div id="fileCommandKeys"></div>
  <div class="section-label">File</div>
  <div class="status" id="fileStatus">${FILENAME_TOKEN}</div>
  <button id="fileAttrsBtn" class="secondary" style="width:100%;margin-top:8px;">File attributes</button>
</aside>
<main>
  <div id="fkeyLegend"></div>
  <div class="screen-frame"><div id="screenOutput"></div></div>
  <div class="status" id="mainHint">Click a field to select it. Drag to move. Changes are written straight back into the open document.</div>
</main>
<div class="props-panel" id="propsPanel">
  <h2 style="font-size:13px;">Properties</h2>
  <div id="propsBreadcrumb"></div>
  <div id="propsBody"><div class="empty-state">Select a field to edit it.</div></div>
</div>

<script nonce="${NONCE_TOKEN}">${parserBundleJs}</script>
<script nonce="${NONCE_TOKEN}">${engineJs}</script>
<script nonce="${NONCE_TOKEN}">${writerJs}</script>
<script nonce="${NONCE_TOKEN}">${clientHelpersJs}</script>
<script nonce="${NONCE_TOKEN}">
  const vscode = acquireVsCodeApi();
  let sourceText = ${INITIAL_SOURCE_JSON_TOKEN};
  let model = DspfParser.parseDspf(sourceText);
  let selectedKey = null;
  let selectedHelpSourceLine = null;
  let showFileProps = false; // file-level (fileKeywords) view of the Properties panel, independent of any record/field/help selection
  let suppressNextExternalUpdate = false;
  let activePulldown = null; // { pulldownRecord, line, col, choiceKey } - simulates a clicked menu-bar choice
  let pulldownCloserAttached = false;
  let compareMode = false;
  const compareSelectedRecords = new Set();
  let previewMultipleRows = false;
  let selectedSizeIndex = 0; // which DSPSIZ-declared size is being viewed/edited (0 = first/default)
  let lastScreen = null; // most recently resolved screen ({lines, columns, ...}) - kept around so the props
                          // panel's "Center on screen" action knows the current record's width without
                          // re-resolving it itself (render() already does that work every call).
  const active = new Set();
  const expandedKeywordConditioning = new Set(); // "ownerKey:idx" strings whose per-keyword Conditioning panel is expanded - survives renderProps() rebuilding the panel, same convention as the menu designer's expandedOptionConditioning

  const recordSelect = document.getElementById('recordSelect');
  const indicatorList = document.getElementById('indicatorList');
  const screenOutput = document.getElementById('screenOutput');
  const propsBody = document.getElementById('propsBody');
  const propsBreadcrumb = document.getElementById('propsBreadcrumb');
  let activeFieldTab = 'basic';
  let activeRecordTab = 'basic';
  const compareModeToggle = document.getElementById('compareModeToggle');
  const compareRecordList = document.getElementById('compareRecordList');
  const mainHint = document.getElementById('mainHint');
  const previewRowsRow = document.getElementById('previewRowsRow');
  const previewRowsToggle = document.getElementById('previewRowsToggle');
  const sizeSelectRow = document.getElementById('sizeSelectRow');
  const sizeSelect = document.getElementById('sizeSelect');
  const sizeBoundsWarning = document.getElementById('sizeBoundsWarning');
  const fileAttrsBtn = document.getElementById('fileAttrsBtn');
  const fileCommandKeysEl = document.getElementById('fileCommandKeys');
  const fkeyLegendEl = document.getElementById('fkeyLegend');
  const newRecordName = document.getElementById('newRecordName');
  const newRecordBtn = document.getElementById('newRecordBtn');
  const newRecordError = document.getElementById('newRecordError');

  fileAttrsBtn.addEventListener('click', () => {
    showFileProps = true;
    selectedKey = null;
    selectedHelpSourceLine = null;
    renderProps(recordSelect.value);
  });

  // Creates a brand-new, empty record format (see DspfWriter.insertRecord's
  // own doc comment for placement rules) and immediately selects it, same
  // "land somewhere sensible, then let the user take it from there" spirit
  // as commitCopy selecting a freshly-copied field. A name is required
  // (unlike a field/constant copy, DDS record formats always have one) and
  // must not already be used by another record in the file - checked here
  // client-side against the CURRENT model rather than relying on the parser
  // to reject a genuine duplicate R-line after the fact.
  newRecordBtn.addEventListener('click', () => {
    const name = newRecordName.value.trim().toUpperCase();
    newRecordError.textContent = '';
    if (!name) { newRecordError.textContent = 'Enter a name for the new record format.'; return; }
    if (!WebviewClientHelpers.isValidDdsName(name)) { newRecordError.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).'; return; }
    if (model.records.some((r) => r.name === name)) { newRecordError.textContent = 'A record format named "' + name + '" already exists in this file.'; return; }
    commitSourceChange(
      (lines) => DspfWriter.insertRecord(model, lines, { name: name }),
      () => {
        newRecordName.value = '';
        selectedKey = null;
        selectedHelpSourceLine = null;
        showFileProps = false;
      }
    );
    // Setting recordSelect.value to a name with no matching <option> yet is a
    // silent no-op (it does NOT stick for rebuildRecordSelect to later pick up -
    // see commitCopyRecord's own comment on this same gotcha), so this has to
    // happen AFTER the commitSourceChange() call above returns - by then its own
    // render() has already run once and genuinely created the new <option>.
    if (model.records.some((r) => r.name === name)) {
      recordSelect.value = name;
      render();
    }
  });

  previewRowsToggle.addEventListener('change', () => {
    previewMultipleRows = previewRowsToggle.checked;
    selectedKey = null;
    selectedHelpSourceLine = null;
    showFileProps = false;
    render();
  });

  sizeSelect.addEventListener('change', () => {
    selectedSizeIndex = parseInt(sizeSelect.value, 10) || 0;
    selectedKey = null;
    selectedHelpSourceLine = null;
    showFileProps = false;
    render();
  });

  compareModeToggle.addEventListener('change', () => {
    compareMode = compareModeToggle.checked;
    compareRecordList.classList.toggle('hidden', !compareMode);
    render();
  });

  // Clicking the screen background (not a field) deselects, returning the
  // properties panel to record-level editing. Attached once since screenOutput
  // itself persists across re-renders (only its innerHTML is replaced).
  screenOutput.addEventListener('click', (e) => {
    if (e.target === screenOutput || (e.target.classList && e.target.classList.contains('dspf-screen'))) {
      selectedKey = null;
      selectedHelpSourceLine = null;
      showFileProps = false;
      render();
    }
  });

  // "+ Field" / "+ Constant" click-to-place: capture-phase so it runs before
  // any field's own click handler (selection) or the background-deselect
  // handler above, and stops propagation so placing on top of an existing
  // field doesn't also select that field. Converts the click's pixel
  // position into a line/column via the same gridMetrics() drag already
  // uses, then opens the placement form (renderPlacementProps) instead of
  // inserting immediately - a name/length/type (or constant text) is still
  // needed before there's anything to write.
  const placeFieldBtn = document.getElementById('placeFieldBtn');
  const placeConstantBtn = document.getElementById('placeConstantBtn');
  const placementHint = document.getElementById('placementHint');

  function setPlacementMode(mode) {
    placementMode = placementMode === mode ? null : mode; // clicking the active button again cancels
    pendingPlacement = null;
    placeFieldBtn.classList.toggle('active', placementMode === 'FIELD');
    placeConstantBtn.classList.toggle('active', placementMode === 'CONSTANT');
    placementHint.classList.toggle('hidden', !placementMode);
    const screenEl = screenOutput.querySelector('.dspf-screen');
    if (screenEl) screenEl.classList.toggle('placing', !!placementMode);
    render();
  }
  placeFieldBtn.addEventListener('click', () => setPlacementMode('FIELD'));
  placeConstantBtn.addEventListener('click', () => setPlacementMode('CONSTANT'));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (placementMode || pendingPlacement)) { setPlacementMode(null); pendingPlacement = null; render(); }
  });

  screenOutput.addEventListener('click', (e) => {
    if (!placementMode) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const screenEl = screenOutput.querySelector('.dspf-screen');
    if (!screenEl) return;
    const { rect, colWidth, rowHeight } = gridMetrics();
    const col = Math.max(1, Math.round((e.clientX - rect.left) / colWidth) + 1);
    const line = Math.max(1, Math.round((e.clientY - rect.top) / rowHeight) + 1);
    pendingPlacement = { kind: placementMode, line: line, column: col };
    placementMode = null;
    placeFieldBtn.classList.remove('active');
    placeConstantBtn.classList.remove('active');
    placementHint.classList.add('hidden');
    render();
  }, true);

  /** Indicators relevant to the CURRENTLY PREVIEWED context only - the primary record,
   *  plus its paired SFL/SFLCTL record if this is a subfile (indicators used there
   *  render together with the primary record, so toggling them needs to be possible
   *  from here), plus the active pulldown's record if one is open. Previously this
   *  collected indicators from every record in the whole file, which buried the
   *  handful actually relevant to what's on screen under everything else in the file. */
  function indicatorsForContext(recordName) {
    const set = new Set();
    const collect = (conds) => (conds || []).forEach((g) => g.indicators.forEach((i) => set.add(i.number)));
    const collectRecord = (rec) => {
      if (!rec) return;
      collect(rec.conditions);
      rec.fields.forEach((f) => { collect(f.conditions); f.keywords.forEach((k) => collect(k.conditions)); });
    };

    collectRecord(model.records.find((r) => r.name === recordName));

    const sflInfo = DspfEngine.findSflPairing(model, recordName);
    if (sflInfo) {
      collectRecord(sflInfo.sflRecord);
      collectRecord(sflInfo.sflCtlRecord);
    }

    if (activePulldown && activePulldown.pulldownRecord) {
      collectRecord(model.records.find((r) => r.name === activePulldown.pulldownRecord));
    }

    return Array.from(set).sort();
  }

  function rebuildRecordSelect() {
    WebviewClientHelpers.rebuildRecordSelect(recordSelect, model.records);
  }

  /**
   * Shows/populates the screen-size picker only when the file actually
   * declares more than one DSPSIZ size (the common case is one, where the
   * picker stays hidden and selectedSizeIndex is just always 0). Preserves
   * the current selection across re-renders where possible, same pattern as
   * rebuildRecordSelect.
   */
  function rebuildSizeSelect() {
    const sizes = DspfEngine.availableScreenSizes(model);
    if (sizes.length <= 1) {
      sizeSelectRow.classList.add('hidden');
      selectedSizeIndex = 0;
      return;
    }
    sizeSelectRow.classList.remove('hidden');
    if (selectedSizeIndex >= sizes.length) selectedSizeIndex = 0;
    sizeSelect.innerHTML = '';
    sizes.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = s.lines + ' x ' + s.columns + (s.name ? ' (' + s.name + ')' : '');
      sizeSelect.appendChild(opt);
    });
    sizeSelect.value = String(selectedSizeIndex);
  }

  /**
   * Checks the CURRENT record against every declared DSPSIZ size (not just
   * the one being viewed) and shows a warning banner if any field's
   * position exceeds one of the sizes it's actually active for. Real DDS:
   * a field position is absolute and shared across every size unless it's
   * explicitly display-size-conditioned, so a layout that looks fine at
   * the size you're currently viewing can still fail to compile (or render
   * wrong) for the OTHER declared size - this is the only way to surface
   * that without switching the picker back and forth and eyeballing it.
   * No-op (and stays hidden) for a file that only declares one size.
   */
  function updateSizeBoundsWarning(recordName) {
    const problems = DspfEngine.validateSizeBounds(model, recordName, active);
    if (problems.length === 0) {
      sizeBoundsWarning.classList.add('hidden');
      sizeBoundsWarning.textContent = '';
      return;
    }
    sizeBoundsWarning.classList.remove('hidden');
    const lines = problems.map((p) => '\\u2022 ' + p.message);
    sizeBoundsWarning.textContent =
      problems.length + (problems.length === 1 ? ' field position ' : ' field positions ') +
      "won't fit every declared screen size:\\n" + lines.join('\\n');
  }

  function rebuildIndicatorList(recordName) {
    rebuildIndicatorListFromSet(indicatorsForContext(recordName));
  }

  function rebuildIndicatorListFromSet(indicators) {
    indicatorList.innerHTML = '';
    if (indicators.length === 0) {
      indicatorList.innerHTML = '<div class="empty-state" style="font-size:11px;">None used on this screen</div>';
      return;
    }
    indicators.forEach((num) => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;font-size:12px;';
      label.innerHTML = '<input type="checkbox" ' + (active.has(num) ? 'checked' : '') + ' /> <span>Ind ' + num + '</span>';
      label.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) active.add(num); else active.delete(num);
        render();
      });
      indicatorList.appendChild(label);
    });
  }

  /** Read-only comparison mode: preview several record formats together, purely
   *  for visual reference. No click/drag/select wiring at all - editing an
   *  arbitrary combination of independently-defined records is ambiguous (which
   *  record does an edit belong to?), so this mode deliberately doesn't support it;
   *  switch back to single-record mode to make an actual edit. */
  // Rebuilds the checkbox list of "other" records available as a dimmed
  // backdrop - every record EXCEPT whichever one is currently being edited,
  // since that one is already shown normally (full opacity, interactive) as
  // the primary layer; showing it a second time, dimmed, behind itself
  // would be redundant. Rebuilt on every render (not just when compareMode
  // is on) so the list is already current the moment the user checks the
  // toggle, and so switching records updates which ones are offered without
  // needing its own special-case.
  function renderCompareRecordList(currentRecordName) {
    const prevScroll = compareRecordList.scrollTop;
    compareRecordList.innerHTML = '';
    model.records.filter((r) => r.name !== currentRecordName).forEach((r) => {
      const row = document.createElement('label');
      row.className = 'compare-record-row';
      row.innerHTML = '<input type="checkbox" ' + (compareSelectedRecords.has(r.name) ? 'checked' : '') + ' /> ' + r.name;
      row.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) compareSelectedRecords.add(r.name); else compareSelectedRecords.delete(r.name);
        render();
      });
      compareRecordList.appendChild(row);
    });
    compareRecordList.scrollTop = prevScroll;
  }

  // Renders every OTHER checked record as a single dimmed, non-interactive
  // backdrop layer sitting visually BEHIND the primary (editable) screen -
  // true overlay compare, not the old read-only side-by-side multi-select.
  // Reuses resolveMultiScreen (already merges several records' fields into
  // one screen, tagging each with sourceRecord) purely as a convenient way
  // to combine multiple backdrop records into one rendered layer; nothing
  // about it is read-only-mode-specific. Appended AFTER the primary's own
  // .dspf-screen in the DOM (not prepended) so every existing
  // screenOutput.querySelector('.dspf-screen') call elsewhere keeps
  // finding the PRIMARY one first, as it always did - the backdrop's own
  // stacking is purely a CSS z-index/opacity concern (see
  // .dspf-screen-backdrop-layer), not a DOM-order one.
  function renderCompareBackdrop(currentRecordName) {
    if (!compareMode) return;
    const others = Array.from(compareSelectedRecords).filter(
      (name) => name !== currentRecordName && model.records.some((r) => r.name === name)
    );
    if (others.length === 0) return;
    const backdropScreen = DspfEngine.resolveMultiScreen(model, others, active, selectedSizeIndex);
    screenOutput.insertAdjacentHTML(
      'beforeend',
      '<div class="dspf-screen-backdrop-layer" title="Dimmed reference: ' + others.join(', ') + '">' + DspfEngine.renderScreenHtml(backdropScreen) + '</div>'
    );
    // Deliberately no event wiring on anything inside this layer - it's a
    // read-only visual reference, not a second editable surface; the CSS's
    // own pointer-events:none on the wrapper backs this up too.
  }

  function renderFileCommandKeys(currentRecord) {
    const recordKeywords = currentRecord ? currentRecord.keywords : [];
    const available = DspfWriter.availableCommandKeyNumbers(model.fileKeywords, recordKeywords);
    fileCommandKeysEl.innerHTML = WebviewClientHelpers.commandKeysSectionHtml('file-level', model.fileKeywords, available, 'file');
    WebviewClientHelpers.wireCommandKeysSection('file', model.fileKeywords, (newKeywords) => commitFileKeywordsEdit(newKeywords));
  }

  function commitFileKeywordsEdit(newKeywords) {
    commitSourceChange((lines) => DspfWriter.applyFileKeywordsUpdate(model, lines, newKeywords));
  }

  function render() {
    mainHint.classList.remove('hint-readonly');
    mainHint.textContent = 'Click a field to select it. Drag to move. Changes are written straight back into the open document.';

    rebuildRecordSelect();
    rebuildSizeSelect();

    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    if (!recordName) { indicatorList.innerHTML = ''; fkeyLegendEl.innerHTML = ''; renderFileCommandKeys(null); screenOutput.innerHTML = '<div class="empty-state">No record formats found.</div>'; renderProps(null); return; }
    recordSelect.value = recordName;
    rebuildIndicatorList(recordName);
    updateSizeBoundsWarning(recordName);
    renderCompareRecordList(recordName);

    const currentRecord = model.records.find((r) => r.name === recordName);
    fkeyLegendEl.innerHTML = WebviewClientHelpers.functionKeyLegendHtml(DspfEngine.resolveFunctionKeyLegend(model, currentRecord, active));
    renderFileCommandKeys(currentRecord);

    const screen = DspfEngine.resolveScreen(model, recordName, active, activePulldown, previewMultipleRows, selectedSizeIndex);
    lastScreen = screen;
    if (screen.error) { screenOutput.innerHTML = '<div class="warn">' + screen.error + '</div>'; return; }
    previewRowsRow.classList.toggle('hidden', !screen.isSflRecord);
    if (!screen.isSflRecord && previewMultipleRows) { previewMultipleRows = false; previewRowsToggle.checked = false; }
    if (screen.isSflRecord && screen.previewRowCount) {
      mainHint.textContent = screen.previewRowCount < screen.declaredPreviewRowCount
        ? 'Previewing ' + screen.previewRowCount + ' of ' + screen.declaredPreviewRowCount + ' SFLPAG rows (capped to fit the ' + screen.lines + '-line screen). Drag any field to move the whole row - they all come from the same template.'
        : 'Previewing ' + screen.previewRowCount + ' subfile rows (SFLPAG). Drag any field to move the whole row - they all come from the same template.';
    } else if (screen.subfilePreview) {
      mainHint.textContent = 'Showing ' + screen.subfilePreview.pageRows + ' subfile rows from ' + screen.subfilePreview.sflRecordName +
        '. Drag any field here to move the whole row template - edits apply to ' + screen.subfilePreview.sflRecordName + ', not this control record.';
    }
    screenOutput.innerHTML = DspfEngine.renderScreenHtml(screen);
    renderCompareBackdrop(recordName);
    // Every wiring call below is scoped to primaryScreenEl (the FIRST
    // .dspf-screen in the DOM - see renderCompareBackdrop's own comment on
    // why it's always appended after, never before) rather than the whole
    // screenOutput subtree, specifically so none of it accidentally wires
    // click/drag/title-edit interactivity onto the dimmed backdrop layer's
    // own (structurally identical) .dspf-field/.dspf-window-title/etc divs -
    // that layer must stay purely a read-only visual reference.
    const primaryScreenEl = screenOutput.querySelector('.dspf-screen');
    if (placementMode) {
      primaryScreenEl.classList.add('placing');
    }

    primaryScreenEl.querySelectorAll('.dspf-field').forEach((el) => {
      const tag = el.getAttribute('data-tag') || '';
      const isPulldownField = tag === 'pulldown';

      const name = el.getAttribute('data-field');
      const anchorLine = parseInt(el.getAttribute('data-line'), 10);
      const anchorColumn = el.getAttribute('data-column') === '' ? null : parseInt(el.getAttribute('data-column'), 10);
      // data-line/data-column are the ANCHOR (source) coordinates set by resolveScreen -
      // for a plain field these equal field.location.line/.column; for a windowed field
      // or a repeated subfile row they're the window-relative / template-row source
      // position, which is what matching against field.location must use. A subfile
      // row's fields belong to the PAIRED SFL record, not the previewed SFLCTL record
      // (or vice versa), and a pulldown field belongs to the PULLDOWN record, not
      // whatever record has the MNUBARCHC that opened it - so the lookup searches
      // every record, primary one first.
      const primaryRec = model.records.find((r) => r.name === recordName);
      let underlying = primaryRec && (
        primaryRec.fields.find((f) => f.name === name && f.location.line === anchorLine) ||
        primaryRec.fields.find((f) => f.location.line === anchorLine && f.location.column === anchorColumn)
      );
      let ownerRecordName = recordName;
      if (!underlying) {
        for (const r of model.records) {
          const found = r.fields.find((f) => f.name === name && f.location.line === anchorLine) ||
                        r.fields.find((f) => f.location.line === anchorLine && f.location.column === anchorColumn);
          if (found) { underlying = found; ownerRecordName = r.name; break; }
        }
      }
      if (!underlying) return;
      const editable = DspfWriter.isEditable(underlying);
      if (!editable) el.classList.add('locked');
      if (selectedKey && selectedKey.sourceLine === underlying.sourceLine) el.classList.add('selected');

      const isEditableSflPreviewRow = tag.indexOf('subfile-edit-row-') === 0;
      const ownerRecord = model.records.find((r) => r.name === ownerRecordName);

      el.addEventListener('click', (e) => {
        // A pulldown field's click would otherwise bubble up to
        // screenOutput's own "click anywhere closes the pulldown" listener
        // (wired below, near activePulldown) and immediately undo the
        // selection this click was trying to make - stop it there, same as
        // the menu-bar choice's own click handler already does for the
        // same reason.
        if (isPulldownField) e.stopPropagation();
        if (dragState) return;
        selectedKey = { sourceLine: underlying.sourceLine };
        selectedHelpSourceLine = null;
        showFileProps = false;
        render();
      });
      el.addEventListener('mousedown', (e) => {
        if (isPulldownField) e.stopPropagation();
        if (!editable) return;
        e.preventDefault();
        if (isEditableSflPreviewRow && ownerRecord) {
          // Multi-row SFLPAG preview (either the SFLCTL-side preview, or the
          // SFL record's own "Preview SFLPAG rows" toggle): every rendered
          // row instance is the SAME template, so every field visible in
          // THIS row instance moves together, and every NAMED field of the
          // record is batch-committed together - see commitGroupEdit.
          const siblingEls = Array.from(primaryScreenEl.querySelectorAll('[data-tag="' + tag.replace(/"/g, '\\\\"') + '"]'));
          startGroupDrag(siblingEls, ownerRecord.fields.filter((f) => f.name), ownerRecordName);
        } else {
          // Also the pulldown-field path: unlike a subfile row, a PULLDOWN
          // record's fields aren't a repeated template - it's an ordinary
          // record shown as an overlay - so a plain single-field drag,
          // writing back to its own PULLDOWN record via ownerRecordName, is
          // the correct model here, not a group drag.
          startDrag(el, underlying, ownerRecordName);
        }
      });
    });

    // Menu-bar choices: clicking one simulates the real trigger, opening its
    // linked PULLDOWN record as an overlay anchored just below the choice.
    // Clicking the currently-open choice again, or clicking anywhere else on
    // the screen background, closes it.
    primaryScreenEl.querySelectorAll('.dspf-menubar-choice').forEach((el) => {
      const pulldownRecord = el.getAttribute('data-pulldown-record');
      const choiceKey = pulldownRecord + '#' + el.getAttribute('data-choice-id');
      if (activePulldown && activePulldown.choiceKey === choiceKey) el.classList.add('dspf-menubar-open');

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!pulldownRecord) return;
        if (activePulldown && activePulldown.choiceKey === choiceKey) {
          activePulldown = null;
        } else {
          activePulldown = {
            pulldownRecord: pulldownRecord,
            line: parseInt(el.getAttribute('data-anchor-line'), 10),
            col: parseInt(el.getAttribute('data-anchor-col'), 10),
            choiceKey: choiceKey,
          };
        }
        render();
      });
    });

    if (activePulldown && !pulldownCloserAttached) {
      pulldownCloserAttached = true;
      screenOutput.addEventListener('click', () => { activePulldown = null; pulldownCloserAttached = false; render(); }, { once: true });
    }
    if (!activePulldown) pulldownCloserAttached = false;

    // "Change Window Title" by clicking it directly on the preview - WDWTITLE
    // is read/rendered already (resolveWindowTitle), this just adds the
    // click. Navigates to the record's own Properties panel (which is where
    // the dedicated Window title field lives - see renderRecordProps) and
    // focuses that input, rather than a true inline floating editor: the
    // title div's rendered text is actually a mix of the record name, the
    // WDWTITLE text, and status hints (see renderScreenHtml), so it isn't
    // safe to edit that text directly in place.
    primaryScreenEl.querySelectorAll('.dspf-window-title').forEach((el) => {
      el.classList.add('dspf-window-title-editable');
      el.title = 'Click to edit the window title';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedKey = null;
        selectedHelpSourceLine = null;
        showFileProps = false;
        render();
        const input = document.getElementById('p-window-title');
        if (input) { input.focus(); input.select(); }
      });
    });

    // Window move/resize: only ever ONE interactive window border - the
    // primary's own (scoped via primaryScreenEl, same reasoning as above;
    // a dimmed backdrop record's window border, if it has one, must never
    // get move/resize handles wired). Disabled - handles rendered but
    // non-interactive - when the record's own conditioning is too complex
    // to safely reserialize (isEditable, same gate every other
    // record-level edit already uses) or when the WINDOW keyword itself has
    // no fixed geometry of its own to rewrite (inherited from another
    // record, or a runtime *DFT/field-name position - setWindowGeometry
    // is the final authority on exactly which operations that allows; this
    // client-side check only decides whether to attach a move handle vs. a
    // resize-only one, not whether the write itself will succeed).
    const windowEl = primaryScreenEl.querySelector('.dspf-window-border');
    if (windowEl && currentRecord) {
      const windowEditable = DspfWriter.isEditable(currentRecord) && !windowEl.getAttribute('data-window-inherited');
      const windowMovable = windowEditable && !windowEl.getAttribute('data-window-position-default');
      if (!windowEditable) windowEl.classList.add('dspf-window-locked');
      const moveHandle = windowEl.querySelector('.dspf-window-move-handle');
      const resizeHandle = windowEl.querySelector('.dspf-window-resize-handle');
      if (moveHandle && windowMovable) {
        moveHandle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startWindowMove(windowEl, currentRecord); });
      }
      if (resizeHandle && windowEditable) {
        resizeHandle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startWindowResize(windowEl, currentRecord); });
      }
    }

    renderProps(recordName);
  }

  let dragState = null;
  let placementMode = null; // null | 'FIELD' | 'CONSTANT' - set by the "+ Field"/"+ Constant"
                             // buttons; the next click on the screen preview background
                             // becomes the new field/constant's starting position.
  let pendingPlacement = null; // null | { kind, line, column } - set once that click lands,
                                // and cleared once the placement form commits or is cancelled.

  function gridMetrics() {
    const screenEl = screenOutput.querySelector('.dspf-screen');
    const rect = screenEl.getBoundingClientRect();
    const colMatch = screenEl.style.gridTemplateColumns.match(/repeat\\(([0-9]+)/);
    const rowMatch = screenEl.style.gridTemplateRows.match(/repeat\\(([0-9]+)/);
    const colWidth = rect.width / (colMatch ? parseInt(colMatch[1], 10) : 80);
    const rowHeight = rect.height / (rowMatch ? parseInt(rowMatch[1], 10) : 24);
    return { rect, colWidth, rowHeight };
  }

  // Dragging moves the field by a DELTA, not to an absolute grid position -
  // this is what makes it correct for windowed fields (only the window-relative
  // source position changes, the WINDOW keyword's own placement is untouched)
  // and for subfile rows (dragging any visible row instance moves the one
  // template row that actually exists in the DDS source, shifting every
  // rendered row together).
  function startDrag(el, field, recordName) {
    const { rect, colWidth, rowHeight } = gridMetrics();
    const origRenderLine = parseInt(el.getAttribute('data-render-line'), 10);
    const origRenderColumn = parseInt(el.getAttribute('data-render-column'), 10);
    const renderLength = parseInt(el.getAttribute('data-length'), 10) || field.length || 1;
    const renderHeight = parseInt(el.getAttribute('data-height'), 10) || 1;
    const origSourceLine = field.location.line != null ? field.location.line : 1;
    // Baseline for the column: exact if the field has an absolute column, otherwise
    // fall back to the rendered position (see buildWebviewTemplate.js comment near
    // commitEdit for the known limitation this implies for relative-offset columns
    // inside a window).
    const origSourceColumn = field.location.column != null ? field.location.column : origRenderColumn;
    el.classList.add('dragging');

    function onMove(e) {
      dragState = dragState || {};
      const newCol = Math.max(1, Math.round((e.clientX - rect.left) / colWidth) + 1);
      const newLine = Math.max(1, Math.round((e.clientY - rect.top) / rowHeight) + 1);
      el.style.gridColumn = newCol + ' / span ' + renderLength;
      el.style.gridRow = newLine + (renderHeight > 1 ? ' / span ' + renderHeight : '');
      dragState.renderLine = newLine; dragState.renderColumn = newCol;
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.classList.remove('dragging');
      if (dragState && (dragState.renderLine !== origRenderLine || dragState.renderColumn !== origRenderColumn)) {
        const deltaLine = dragState.renderLine - origRenderLine;
        const deltaColumn = dragState.renderColumn - origRenderColumn;
        commitEdit(recordName, field, { line: origSourceLine + deltaLine, column: origSourceColumn + deltaColumn });
      }
      setTimeout(() => { dragState = null; }, 0);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Drags the whole window frame by a delta - same delta-not-absolute
  // approach startDrag above uses, and for the same reason: only the
  // WINDOW keyword's own row/col changes, nothing about the record's
  // fields (which stay window-relative). Uses the window's OWN data-*
  // attributes (baked in by dspfEngine.js) as the drag's starting point,
  // not field-drag's data-render-line/-column, since a window has no
  // field-style anchor of its own.
  function startWindowMove(windowEl, record) {
    const { rect, colWidth, rowHeight } = gridMetrics();
    const origLine = parseInt(windowEl.getAttribute('data-window-line'), 10);
    const origCol = parseInt(windowEl.getAttribute('data-window-col'), 10);
    const height = parseInt(windowEl.getAttribute('data-window-height'), 10);
    const width = parseInt(windowEl.getAttribute('data-window-width'), 10);
    let newLine = origLine, newCol = origCol;
    windowEl.classList.add('dragging');

    function onMove(e) {
      newCol = Math.max(1, Math.round((e.clientX - rect.left) / colWidth) + 1);
      newLine = Math.max(1, Math.round((e.clientY - rect.top) / rowHeight) + 1);
      windowEl.style.gridColumn = newCol + ' / span ' + width;
      windowEl.style.gridRow = newLine + ' / span ' + height;
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      windowEl.classList.remove('dragging');
      if (newLine !== origLine || newCol !== origCol) {
        commitSourceChange((lines) => DspfWriter.setWindowGeometry(record, lines, { row: newLine, col: newCol }));
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Resizes from the bottom-right corner only (row/col - the window's own
  // origin - never change here, only height/width grow or shrink toward/away
  // from that fixed corner). Clamped to a 2x2 minimum so a window can never
  // be dragged down to something DDS wouldn't accept anyway.
  function startWindowResize(windowEl, record) {
    const { rect, colWidth, rowHeight } = gridMetrics();
    const line = parseInt(windowEl.getAttribute('data-window-line'), 10);
    const col = parseInt(windowEl.getAttribute('data-window-col'), 10);
    const origHeight = parseInt(windowEl.getAttribute('data-window-height'), 10);
    const origWidth = parseInt(windowEl.getAttribute('data-window-width'), 10);
    let newHeight = origHeight, newWidth = origWidth;
    windowEl.classList.add('dragging');

    function onMove(e) {
      newWidth = Math.max(2, Math.round((e.clientX - rect.left) / colWidth) + 1 - col);
      newHeight = Math.max(2, Math.round((e.clientY - rect.top) / rowHeight) + 1 - line);
      windowEl.style.gridColumn = col + ' / span ' + newWidth;
      windowEl.style.gridRow = line + ' / span ' + newHeight;
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      windowEl.classList.remove('dragging');
      if (newHeight !== origHeight || newWidth !== origWidth) {
        commitSourceChange((lines) => DspfWriter.setWindowGeometry(record, lines, { height: newHeight, width: newWidth }));
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Multi-row SFLPAG preview drag: moves every field of the record by the same
  // delta, visually together and as one batched source edit - every rendered row
  // instance corresponds to the SAME template, so this is really just "move the
  // template" with N visual copies following along, not N independent edits.
  function startGroupDrag(els, fields, recordName) {
    const { rect, colWidth, rowHeight } = gridMetrics();
    const originals = els.map((el) => ({
      el,
      origRenderLine: parseInt(el.getAttribute('data-render-line'), 10),
      origRenderColumn: parseInt(el.getAttribute('data-render-column'), 10),
      renderLength: parseInt(el.getAttribute('data-length'), 10) || 1,
      renderHeight: parseInt(el.getAttribute('data-height'), 10) || 1,
    }));
    const ref = originals[0];
    if (!ref) return;
    els.forEach((el) => el.classList.add('dragging'));

    function onMove(e) {
      dragState = dragState || {};
      const newCol = Math.max(1, Math.round((e.clientX - rect.left) / colWidth) + 1);
      const newLine = Math.max(1, Math.round((e.clientY - rect.top) / rowHeight) + 1);
      const deltaLine = newLine - ref.origRenderLine;
      const deltaColumn = newCol - ref.origRenderColumn;
      originals.forEach((o) => {
        o.el.style.gridColumn = (o.origRenderColumn + deltaColumn) + ' / span ' + o.renderLength;
        o.el.style.gridRow = (o.origRenderLine + deltaLine) + (o.renderHeight > 1 ? ' / span ' + o.renderHeight : '');
      });
      dragState.deltaLine = deltaLine;
      dragState.deltaColumn = deltaColumn;
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      els.forEach((el) => el.classList.remove('dragging'));
      if (dragState && (dragState.deltaLine || dragState.deltaColumn)) {
        commitGroupEdit(recordName, fields, dragState.deltaLine, dragState.deltaColumn);
      }
      setTimeout(() => { dragState = null; }, 0);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function commitGroupEdit(recordName, fields, deltaLine, deltaColumn) {
    try {
      const previousSelected = selectedKey ? findFieldBySourceLine(selectedKey.sourceLine) : null;
      const previousSelectedName = previousSelected && previousSelected.field.name;

      let lines = sourceText.split(/\\r\\n|\\r|\\n/);
      let currentModel = model;
      const fieldNames = fields.map((f) => f.name).filter(Boolean);

      // Each field is re-fetched from the freshly re-parsed model on every iteration,
      // since editing one field shifts source line numbers for everything after it -
      // a stale field reference from before this loop started would write to the wrong line.
      fieldNames.forEach((fieldName) => {
        const rec = currentModel.records.find((r) => r.name === recordName);
        const f = rec && rec.fields.find((x) => x.name === fieldName);
        if (!f) return;
        const newLine = (f.location.line != null ? f.location.line : 1) + deltaLine;
        // Baseline column: exact if absolute, otherwise 1 - known limitation for
        // relative-offset (+n) columns within a subfile row, same as single-field drag.
        const baseColumn = f.location.column != null ? f.location.column : 1;
        const newColumn = baseColumn + deltaColumn;
        lines = DspfWriter.applyFieldUpdate(f, lines, { line: newLine, column: newColumn });
        currentModel = DspfParser.parseDspf(lines.join('\\n'));
      });

      sourceText = lines.join('\\n');
      model = currentModel;

      if (previousSelectedName && fieldNames.indexOf(previousSelectedName) !== -1) {
        const rec = model.records.find((r) => r.name === recordName);
        const stillThere = rec && rec.fields.find((f) => f.name === previousSelectedName);
        selectedKey = stillThere ? { sourceLine: stillThere.sourceLine } : null;
      }

      activePulldown = null;
      suppressNextExternalUpdate = true;
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      render();
    } catch (err) {
      vscode.postMessage({ type: 'error', message: err.message });
    }
  }

  function findFieldBySourceLine(sourceLine) {
    for (const r of model.records) {
      const f = r.fields.find((x) => x.sourceLine === sourceLine);
      if (f) return { record: r, field: f };
    }
    return null;
  }

  function renderProps(recordName) {
    renderBreadcrumb(recordName);
    if (pendingPlacement) { renderPlacementProps(recordName); return; }
    if (showFileProps) { renderFileProps(); return; }
    if (selectedKey) { renderFieldProps(recordName); return; }
    if (selectedHelpSourceLine != null) { renderHelpProps(recordName); return; }
    renderRecordProps(recordName);
  }

  /**
   * Persistent "File > Record: X > Field: Y" trail above the props body -
   * lets you jump straight back to the record or file level without
   * deselecting on the canvas first. Rebuilt on every renderProps() call
   * (cheap - it's a handful of spans) so it always reflects current state.
   */
  function renderBreadcrumb(recordName) {
    const rec = model.records.find((r) => r.name === recordName);
    const atRecord = !showFileProps && !selectedKey && selectedHelpSourceLine == null && !pendingPlacement;
    let html = '<div class="props-breadcrumb">';
    html += '<span class="crumb' + (showFileProps ? ' current' : '') + '" id="crumb-file">File</span>';
    if (rec) {
      html += '<span class="crumb-sep">&rsaquo;</span>';
      html += '<span class="crumb' + (atRecord ? ' current' : '') + '" id="crumb-record">Record: ' + DspfEngine.escapeHtml(rec.name) + '</span>';
    }
    if (selectedKey) {
      const found = findFieldBySourceLine(selectedKey.sourceLine);
      const field = found && found.field;
      const rawLabel = field ? (field.nameType === 'CONSTANT' ? (field.constantValue || '(constant)') : (field.name || '(field)')) : '';
      const label = rawLabel.length > 18 ? rawLabel.slice(0, 18) + '\u2026' : rawLabel;
      html += '<span class="crumb-sep">&rsaquo;</span><span class="crumb current">Field: ' + DspfEngine.escapeHtml(label) + '</span>';
    } else if (selectedHelpSourceLine != null) {
      html += '<span class="crumb-sep">&rsaquo;</span><span class="crumb current">Help entry</span>';
    } else if (pendingPlacement) {
      html += '<span class="crumb-sep">&rsaquo;</span><span class="crumb current">New ' + (pendingPlacement.kind === 'CONSTANT' ? 'constant' : 'field') + '</span>';
    }
    html += '</div>';
    propsBreadcrumb.innerHTML = html;

    const fileCrumb = document.getElementById('crumb-file');
    if (fileCrumb) fileCrumb.addEventListener('click', () => {
      if (showFileProps) return;
      showFileProps = true;
      selectedKey = null;
      selectedHelpSourceLine = null;
      pendingPlacement = null;
      render();
    });
    const recordCrumb = document.getElementById('crumb-record');
    if (recordCrumb) recordCrumb.addEventListener('click', () => {
      if (atRecord) return;
      showFileProps = false;
      selectedKey = null;
      selectedHelpSourceLine = null;
      pendingPlacement = null;
      render();
    });
  }

  /** Builds a tab strip + its panels. tabs: [{id, label, content}]. */
  function tabsHtml(tabs, activeId) {
    let html = '<div class="props-tabs">';
    tabs.forEach((t) => { html += '<button type="button" class="props-tab' + (t.id === activeId ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>'; });
    html += '</div>';
    tabs.forEach((t) => { html += '<div class="props-tab-panel' + (t.id === activeId ? ' active' : '') + '" data-tab-panel="' + t.id + '">' + t.content + '</div>'; });
    return html;
  }

  /** Wires click handlers for a tabsHtml()-produced strip. onSwitch(id) fires after switching. */
  function wireTabs(root, onSwitch) {
    root.querySelectorAll('.props-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-tab');
        root.querySelectorAll('.props-tab').forEach((b) => b.classList.toggle('active', b === btn));
        root.querySelectorAll('.props-tab-panel').forEach((p) => p.classList.toggle('active', p.getAttribute('data-tab-panel') === id));
        if (onSwitch) onSwitch(id);
      });
    });
  }

  /** A collapsible <details> section for dense content (raw keywords, conditioning). */
  function accordionHtml(label, bodyHtml, openByDefault) {
    return '<details class="props-accordion"' + (openByDefault ? ' open' : '') + '><summary>' + label + '</summary><div class="props-accordion-body">' + bodyHtml + '</div></details>';
  }

  /**
   * File-level keywords (DSPSIZ, REF, CAxx, INDARA, PRINT, etc.) - the ones
   * that apply to the whole display file rather than any one record
   * format. Reuses the same generic keyword-chip editor every other panel
   * uses (keywordEditorHtml/wireKeywordEditor), applying immediately on
   * add/remove via DspfWriter.applyFileUpdate - same "no separate Apply
   * button, keywords commit themselves" pattern the Record and Help-entry
   * panels already use (they have nothing else to Apply either).
   */
  function renderFileProps() {
    let html = '<div class="status" style="margin-bottom:12px;">Keywords for the whole display file (DSPSIZ, REF, INDARA, PRINT, etc.) - not tied to any one record format. Command keys (CAxx/CFxx) have their own dedicated panel above and are best edited there.</div>';
    html += WebviewClientHelpers.keywordEditorHtml(model.fileKeywords, 'file', expandedKeywordConditioning);
    propsBody.innerHTML = html;

    WebviewClientHelpers.wireKeywordEditor(model.fileKeywords, (newKeywords) => commitFileEdit(newKeywords), 'file', expandedKeywordConditioning, () => renderFileProps());
  }

  function commitFileEdit(newKeywords) {
    commitSourceChange((lines) => DspfWriter.applyFileKeywordsUpdate(model, lines, newKeywords));
  }

  function renderFieldProps(recordName) {
    const found = findFieldBySourceLine(selectedKey.sourceLine);
    const field = found && found.field;
    const ownerRecordName = found && found.record.name;
    if (!field) { selectedKey = null; renderRecordProps(recordName); return; }

    const editable = DspfWriter.isEditable(field);
    const isConstant = field.nameType === 'CONSTANT';
    let html = '';
    if (!editable) html += '<div class="warn">Multi-group or &gt;3-indicator conditioning — editing this field is disabled to avoid corrupting it. Edit the source directly.</div>';

    // --- Basic tab: identity (name/text, length/decimals or fill, type/usage) ---
    let basicHtml = '';
    if (isConstant) {
      // A constant has no name/length/data type/usage of its own - its whole
      // identity IS its literal text, which was previously not editable
      // here at all (only its position, via drag). DspfWriter.applyFieldUpdate
      // already supported writing back a new constantValue; only the input
      // to drive it was missing.
      basicHtml += '<div class="field-row"><label>Text</label><input type="text" id="p-const-text" value="' + DspfEngine.escapeHtml(field.constantValue || '') + '" /></div>';
      // "Fill constant with characters" - repeats a single character across a
      // chosen length (e.g. a row of dashes as a visual divider). Populates
      // the Text input above rather than committing on its own, so it lines
      // up with "Center" below (Position tab) and the shared Apply changes
      // button - one commit for whatever combination of position/text/fill
      // was touched.
      basicHtml += '<div class="two-col"><div class="field-row"><label>Fill character</label><input type="text" id="p-fill-char" maxlength="1" value="." /></div>';
      basicHtml += '<div class="field-row"><label>Fill length</label><input type="number" id="p-fill-len" min="1" value="' + Math.max(1, (field.constantValue || '').length || 10) + '" /></div></div>';
      basicHtml += '<button id="p-fill" class="secondary" style="width:100%;margin-bottom:12px;">Fill</button>';
    } else {
      basicHtml += '<div class="field-row"><label>Name</label><input type="text" id="p-name" value="' + (field.name || '') + '" /></div>';
      basicHtml += '<div class="two-col"><div class="field-row"><label>Length</label><input type="number" id="p-length" value="' + (field.length != null ? field.length : '') + '" /></div>';
      basicHtml += '<div class="field-row"><label>Decimals</label><input type="number" id="p-dec" value="' + (field.decimalPositions != null ? field.decimalPositions : '') + '" /></div></div>';
      basicHtml += '<div class="two-col"><div class="field-row"><label>Data type</label><select id="p-type">' +
        ['', 'A', 'X', 'N', 'S', 'Y', 'I', 'D', 'M', 'F', 'L', 'T', 'Z'].map((t) => '<option value="' + t + '"' + (field.dataType === t || (!field.dataType && t === '') ? ' selected' : '') + '>' + (t || '(blank)') + '</option>').join('') + '</select></div>';
      basicHtml += '<div class="field-row"><label>Usage</label><select id="p-usage">' + ['O', 'I', 'B', 'H', 'M', 'P'].map((u) => '<option value="' + u + '"' + (field.usage === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div></div>';
    }

    // --- Position tab: line/col + center helper ---
    let positionHtml = '';
    positionHtml += '<div class="two-col"><div class="field-row"><label>Line</label><input type="number" id="p-line" value="' + (field.location.line != null ? field.location.line : '') + '" /></div>';
    positionHtml += '<div class="field-row"><label>Column</label><input type="number" id="p-col" value="' + (field.location.column != null ? field.location.column : '') + '" /></div></div>';
    // "Center field/constant on screen" - fills the Column input above with
    // the column that centers the current width within the record's screen,
    // same populate-then-Apply pattern as Fill above (and for the same
    // reason: centering AND retyping the text/length in the same visit
    // should commit as one edit, not two).
    positionHtml += '<button id="p-center" class="secondary" style="width:100%;margin-bottom:12px;">Center on screen</button>';

    // --- Attributes tab: display attributes / validity & edit keywords ---
    let attrsHtml = WebviewClientHelpers.colorAttrEditorHtml(field.keywords, 'field-' + field.sourceLine);
    if (!isConstant && field.isReference) {
      // Position 29 'R' - this field's length/type/decimals come from a
      // referenced database field (REF/REFFLD - see DspfEngine.resolveReferenceTarget)
      // rather than being typed in here. Offer to fetch the real values from
      // a connected IBM i and fill them in, same as real SDA does the moment
      // you type R and press Enter - see extension.ts's
      // handleResolveReferencedField for the Code for i round-trip itself.
      attrsHtml += '<button id="p-resolve-ref" class="secondary" style="width:100%;margin-bottom:12px;">Resolve Referenced Field (Code for i)</button>';
    }
    if (!isConstant) {
      attrsHtml += WebviewClientHelpers.validityAndEditHtml(field.keywords, 'field-' + field.sourceLine);
    }

    // --- Keywords tab: the dense raw-keyword chip editor + conditioning, each collapsed by default ---
    let keywordsHtml = accordionHtml('Keywords', WebviewClientHelpers.keywordEditorHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning), true);
    keywordsHtml += accordionHtml('Conditioning', WebviewClientHelpers.conditionsEditorHtml(field.conditions, 'field'), false);

    html += tabsHtml([
      { id: 'basic', label: isConstant ? 'Text' : 'Basic', content: basicHtml },
      { id: 'position', label: 'Position', content: positionHtml },
      { id: 'attrs', label: 'Attributes', content: attrsHtml },
      { id: 'keywords', label: 'Keywords', content: keywordsHtml },
    ], activeFieldTab);

    html += '<button id="p-apply" style="width:100%;margin-top:16px;" ' + (editable ? '' : 'disabled') + '>Apply changes</button>';
    html += '<button id="p-copy" class="secondary" style="width:100%;margin-top:8px;">Copy ' + (isConstant ? 'constant' : 'field') + '</button>';
    html += '<div class="delete-hint">Press Delete or Backspace to remove this field. Press Ctrl+D to copy it.</div>';
    propsBody.innerHTML = html;
    wireTabs(propsBody, (id) => { activeFieldTab = id; });
    if (!editable) return;

    document.getElementById('p-apply').addEventListener('click', () => {
      const updates = {
        line: document.getElementById('p-line').value === '' ? null : parseInt(document.getElementById('p-line').value, 10),
        column: document.getElementById('p-col').value === '' ? null : parseInt(document.getElementById('p-col').value, 10),
      };
      if (isConstant) {
        updates.constantValue = document.getElementById('p-const-text').value;
      } else {
        updates.name = document.getElementById('p-name').value.trim().toUpperCase();
        updates.length = document.getElementById('p-length').value === '' ? null : parseInt(document.getElementById('p-length').value, 10);
        updates.decimalPositions = document.getElementById('p-dec').value === '' ? null : parseInt(document.getElementById('p-dec').value, 10);
        updates.dataType = document.getElementById('p-type').value || null;
        updates.usage = document.getElementById('p-usage').value || null;
      }
      commitEdit(ownerRecordName, field, updates);
    });
    document.getElementById('p-copy').addEventListener('click', () => commitCopy(ownerRecordName, field));
    const resolveRefBtn = document.getElementById('p-resolve-ref');
    if (resolveRefBtn) {
      resolveRefBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'resolveReferencedField', recordName: ownerRecordName, fieldSourceLine: field.sourceLine });
      });
    }
    WebviewClientHelpers.wireKeywordEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
    WebviewClientHelpers.wireConditionsEditor('field', field.conditions, (newConditions) => commitEdit(ownerRecordName, field, { conditions: newConditions }));
    WebviewClientHelpers.wireColorAttrEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
    if (!isConstant) {
      WebviewClientHelpers.wireValidityAndEdit(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
    }

    if (isConstant) {
      document.getElementById('p-fill').addEventListener('click', () => {
        const ch = (document.getElementById('p-fill-char').value || '.').slice(0, 1) || '.';
        const len = Math.max(1, parseInt(document.getElementById('p-fill-len').value, 10) || 1);
        document.getElementById('p-const-text').value = ch.repeat(len);
      });
    }

    document.getElementById('p-center').addEventListener('click', () => {
      const columns = (lastScreen && lastScreen.columns) || 80;
      const width = isConstant
        ? (document.getElementById('p-const-text').value || '').length
        : Math.max(1, parseInt(document.getElementById('p-length').value, 10) || 1);
      const col = Math.max(1, Math.floor((columns - width) / 2) + 1);
      document.getElementById('p-col').value = String(col);
    });
  }

  function helpEntriesListHtml(rec) {
    if (!rec.helpEntries || rec.helpEntries.length === 0) return '';
    let html = '<div class="section-label">Help entries</div>';
    rec.helpEntries.forEach((h, idx) => {
      const summary = (h.keywords || []).map((k) => k.name).join(', ') || '(no keywords)';
      html += '<div class="help-entry-row" data-source-line="' + h.sourceLine + '">' + (idx + 1) + '. ' + summary + '</div>';
    });
    return html;
  }

  /**
   * Lists a record's fields/constants in their current DDS SOURCE order
   * (top-to-bottom in the file - unrelated to their on-screen row/col,
   * which this never touches), with Up/Down buttons to move one earlier
   * or later in that order via DspfWriter.reorderFields. This IS the
   * "stable sort key convention" the backlog note asked for: explicit,
   * user-driven source order, one swap at a time - simpler and less
   * error-prone than a full drag-and-drop reorder for a feature explicitly
   * called low-priority/UI-only.
   */
  function fieldOrderListHtml(rec) {
    if (!rec.fields || rec.fields.length < 2) return '';
    let html = '<div class="section-label">Field order (source)</div>';
    html += '<div id="p-field-order">';
    rec.fields.forEach((f, idx) => {
      const rawLabel = f.nameType === 'CONSTANT' ? (f.constantValue || '(constant)') : (f.name || '(field)');
      const label = rawLabel.length > 26 ? rawLabel.slice(0, 26) + '…' : rawLabel;
      html += '<div class="field-order-row" data-idx="' + idx + '">' +
        '<span class="field-order-label" title="' + DspfEngine.escapeHtml(rawLabel) + '">' + DspfEngine.escapeHtml(label) + '</span>' +
        '<button class="field-order-up" data-idx="' + idx + '" ' + (idx === 0 ? 'disabled' : '') + ' title="Move earlier in source order">&uarr;</button>' +
        '<button class="field-order-down" data-idx="' + idx + '" ' + (idx === rec.fields.length - 1 ? 'disabled' : '') + ' title="Move later in source order">&darr;</button>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /** Swaps the field at idx with its neighbor (idx+delta) in source order and commits via DspfWriter.reorderFields. */
  function moveField(recordName, idx, delta) {
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= rec.fields.length) return;
    const order = rec.fields.map((f) => f.sourceLine);
    const tmp = order[idx];
    order[idx] = order[newIdx];
    order[newIdx] = tmp;
    commitSourceChange((lines) => DspfWriter.reorderFields(rec, lines, order));
  }

  /**
   * "+ Field" / "+ Constant" click-to-place: the props panel while
   * pendingPlacement is set (line/col already chosen from the canvas
   * click, kept editable here in case the click landed a cell or two off).
   * Reuses DspfWriter.insertField exactly as commitCopy/newRecordBtn do -
   * appended at the bottom of the record's field list, then picked back up
   * by index and selected so it's immediately ready to drag into its final
   * spot, same "land somewhere sensible, then let the user refine it" flow.
   */
  function renderPlacementProps(recordName) {
    const kind = pendingPlacement.kind;
    let html = '<div class="section-label">' + (kind === 'CONSTANT' ? 'New constant' : 'New field') + '</div>';
    html += '<div class="two-col"><div class="field-row"><label>Line</label><input type="number" id="p-place-line" value="' + pendingPlacement.line + '" /></div>';
    html += '<div class="field-row"><label>Column</label><input type="number" id="p-place-col" value="' + pendingPlacement.column + '" /></div></div>';
    if (kind === 'CONSTANT') {
      html += '<div class="field-row"><label>Text</label><input type="text" id="p-place-text" placeholder="Constant text" /></div>';
    } else {
      html += '<div class="field-row"><label>Name</label><input type="text" id="p-place-name" maxlength="10" placeholder="FIELD1" /></div>';
      html += '<div class="two-col"><div class="field-row"><label>Length</label><input type="number" id="p-place-length" min="1" value="10" /></div>';
      html += '<div class="field-row"><label>Decimals</label><input type="number" id="p-place-decimals" min="0" placeholder="(none)" /></div></div>';
      html += '<div class="two-col"><div class="field-row"><label>Data type</label><select id="p-place-type">' +
        ['A', 'X', 'N', 'S', 'Y', 'I', 'D', 'M', 'F', 'L', 'T', 'Z'].map((t) => '<option value="' + t + '">' + t + '</option>').join('') + '</select></div>';
      html += '<div class="field-row"><label>Usage</label><select id="p-place-usage">' +
        ['B', 'I', 'O', 'H', 'M', 'P'].map((u) => '<option value="' + u + '">' + u + '</option>').join('') + '</select></div></div>';
    }
    html += '<div class="rename-error" id="p-place-error"></div>';
    html += '<button id="p-place-add" style="width:100%;margin-top:8px;">' + (kind === 'CONSTANT' ? 'Add constant' : 'Add field') + '</button>';
    html += '<button id="p-place-cancel" class="secondary" style="width:100%;margin-top:8px;">Cancel</button>';
    propsBody.innerHTML = html;

    document.getElementById('p-place-cancel').addEventListener('click', () => { pendingPlacement = null; render(); });
    document.getElementById('p-place-add').addEventListener('click', () => {
      const errorEl = document.getElementById('p-place-error');
      errorEl.textContent = '';
      const rec = model.records.find((r) => r.name === recordName);
      if (!rec) { errorEl.textContent = 'No record selected.'; return; }

      const line = Math.max(1, parseInt(document.getElementById('p-place-line').value, 10) || pendingPlacement.line);
      const column = Math.max(1, parseInt(document.getElementById('p-place-col').value, 10) || pendingPlacement.column);

      let newFieldSpec;
      if (kind === 'CONSTANT') {
        const text = document.getElementById('p-place-text').value;
        if (!text) { errorEl.textContent = 'Enter the constant text.'; return; }
        newFieldSpec = { nameType: 'CONSTANT', constantValue: text, location: { line: line, column: column } };
      } else {
        const name = document.getElementById('p-place-name').value.trim().toUpperCase();
        if (!name) { errorEl.textContent = 'Enter a name for the new field.'; return; }
        if (!WebviewClientHelpers.isValidDdsName(name)) { errorEl.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).'; return; }
        if (rec.fields.some((f) => f.name === name)) { errorEl.textContent = 'A field named "' + name + '" already exists in this record.'; return; }
        const length = Math.max(1, parseInt(document.getElementById('p-place-length').value, 10) || 1);
        const decimalsRaw = document.getElementById('p-place-decimals').value;
        const decimals = decimalsRaw !== '' ? Math.max(0, parseInt(decimalsRaw, 10) || 0) : null;
        newFieldSpec = {
          nameType: 'FIELD',
          name: name,
          length: length,
          decimalPositions: decimals,
          dataType: document.getElementById('p-place-type').value,
          usage: document.getElementById('p-place-usage').value,
          location: { line: line, column: column },
        };
      }

      commitSourceChange(
        (lines) => DspfWriter.insertField(rec, lines, newFieldSpec),
        () => {
          const freshRec = model.records.find((r) => r.name === recordName);
          const newField = freshRec && freshRec.fields[freshRec.fields.length - 1];
          pendingPlacement = null;
          selectedKey = newField ? { sourceLine: newField.sourceLine } : null;
        }
      );
    });
  }

  function renderRecordProps(recordName) {
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) { propsBody.innerHTML = '<div class="empty-state">No record selected.</div>'; return; }

    const editable = DspfWriter.isEditable(rec);
    const hasWindow = rec.keywords.some((k) => k.name === 'WINDOW');
    let html = '';
    if (!editable) html += '<div class="warn">Multi-group or &gt;3-indicator conditioning — editing this record is disabled to avoid corrupting it. Edit the source directly.</div>';

    // --- Basic tab: name, window title ---
    let basicHtml = '<div class="field-row"><label>Name</label>' +
      '<div class="rename-row"><input type="text" class="rename-input" id="p-record-name" value="' + rec.name + '" /><button class="rename-btn" id="p-record-rename">Rename</button></div>' +
      '<div class="rename-error" id="p-record-rename-error"></div></div>';
    if (hasWindow) {
      basicHtml += '<div class="field-row"><label>Window title</label>' +
        '<div class="rename-row"><input type="text" class="rename-input" id="p-window-title" value="' + DspfEngine.escapeHtml(DspfWriter.getWindowTitleText(rec.keywords)) + '" /><button class="rename-btn" id="p-window-title-save">Save</button></div></div>';
    }

    // --- Keywords tab: raw keyword chip editor + conditioning, collapsed by default ---
    let keywordsHtml = accordionHtml('Keywords', WebviewClientHelpers.keywordEditorHtml(rec.keywords, 'record-' + rec.name, expandedKeywordConditioning), true);
    keywordsHtml += accordionHtml('Conditioning', WebviewClientHelpers.conditionsEditorHtml(rec.conditions, 'record'), false);

    // --- Command keys tab ---
    const availableForRecord = DspfWriter.availableCommandKeyNumbers(model.fileKeywords, rec.keywords);
    const commandKeysHtml = WebviewClientHelpers.commandKeysSectionHtml('this record', rec.keywords, availableForRecord, 'record');

    // --- Structure tab: help entries + source field order + reference fields ---
    let structureHtml = helpEntriesListHtml(rec) + fieldOrderListHtml(rec);
    const referenceFieldCount = (rec.fields || []).filter((f) => f.isReference).length;
    if (referenceFieldCount > 0) {
      structureHtml += '<button id="p-resolve-all-ref" class="secondary" style="width:100%;margin-top:16px;">Resolve all referenced fields (' + referenceFieldCount + ')</button>';
    }

    html += tabsHtml([
      { id: 'basic', label: 'Basic', content: basicHtml },
      { id: 'keywords', label: 'Keywords', content: keywordsHtml },
      { id: 'commandkeys', label: 'Cmd keys', content: commandKeysHtml },
      { id: 'structure', label: 'Structure', content: structureHtml },
    ], activeRecordTab);

    html += '<button id="p-record-copy" class="secondary" style="width:100%;margin-top:16px;" ' + (editable ? '' : 'disabled title="Multi-group or >3-indicator conditioning — copying this record is disabled to avoid corrupting it."') + '>Copy record</button>';
    html += '<button id="p-record-delete" class="secondary" style="width:100%;margin-top:8px;color:var(--warn);">Delete record</button>';
    propsBody.innerHTML = html;
    wireTabs(propsBody, (id) => { activeRecordTab = id; });

    document.getElementById('p-record-rename').addEventListener('click', () => commitRecordRename(recordName));
    document.getElementById('p-record-copy').addEventListener('click', () => { if (editable) commitCopyRecord(recordName); });
    document.getElementById('p-record-delete').addEventListener('click', () => commitDeleteRecord(recordName));
    const resolveAllBtn = document.getElementById('p-resolve-all-ref');
    if (resolveAllBtn) {
      resolveAllBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'resolveAllReferencedFields', recordName: recordName });
      });
    }

    propsBody.querySelectorAll('.help-entry-row').forEach((el) => {
      el.addEventListener('click', () => {
        selectedHelpSourceLine = parseInt(el.getAttribute('data-source-line'), 10);
        renderProps(recordName);
      });
    });

    propsBody.querySelectorAll('.field-order-up').forEach((el) => {
      el.addEventListener('click', () => moveField(recordName, parseInt(el.getAttribute('data-idx'), 10), -1));
    });
    propsBody.querySelectorAll('.field-order-down').forEach((el) => {
      el.addEventListener('click', () => moveField(recordName, parseInt(el.getAttribute('data-idx'), 10), 1));
    });

    if (!editable) return;
    if (hasWindow) {
      document.getElementById('p-window-title-save').addEventListener('click', () => {
        commitRecordEdit(recordName, { keywords: DspfWriter.setWindowTitleText(rec.keywords, document.getElementById('p-window-title').value) });
      });
    }
    WebviewClientHelpers.wireCommandKeysSection('record', rec.keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }));
    WebviewClientHelpers.wireKeywordEditor(rec.keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), 'record-' + rec.name, expandedKeywordConditioning, () => renderRecordProps(recordName));
    WebviewClientHelpers.wireConditionsEditor('record', rec.conditions, (newConditions) => commitRecordEdit(recordName, { conditions: newConditions }));
  }

  function renderHelpProps(recordName) {
    const rec = model.records.find((r) => r.name === recordName);
    const help = rec && rec.helpEntries.find((h) => h.sourceLine === selectedHelpSourceLine);
    if (!help) { selectedHelpSourceLine = null; renderRecordProps(recordName); return; }

    const editable = DspfWriter.isEditable(help);
    let html = '<button id="p-back" class="secondary" style="width:100%;margin-bottom:12px;">&larr; Back to record</button>';
    html += '<div class="section-label">Help entry</div>';
    if (!editable) html += '<div class="warn">Multi-group or &gt;3-indicator conditioning — editing this help entry is disabled to avoid corrupting it. Edit the source directly.</div>';
    html += WebviewClientHelpers.keywordEditorHtml(help.keywords, 'help-' + help.sourceLine, expandedKeywordConditioning);
    propsBody.innerHTML = html;

    document.getElementById('p-back').addEventListener('click', () => { selectedHelpSourceLine = null; renderProps(recordName); });
    if (!editable) return;
    WebviewClientHelpers.wireKeywordEditor(help.keywords, (newKeywords) => commitHelpEdit(recordName, help, { keywords: newKeywords }), 'help-' + help.sourceLine, expandedKeywordConditioning, () => renderHelpProps(recordName));
  }

  // Shared commit skeleton for every DDS source edit made from this webview:
  // split into lines, let transform() produce the new lines from a DspfWriter
  // call, join/reparse, tell the extension host, then let afterReparse() (if
  // given) update local selection/UI state using the FRESH model before the
  // final render(). Previously four separate functions
  // (commitDelete/commitEdit/commitRecordEdit/commitHelpEdit) each
  // duplicated this exact split/transform/reparse/post/render skeleton,
  // differing only in which DspfWriter call they made and how they picked
  // what to reselect afterward - this is that skeleton, written once.
  // transform() returning null/undefined is treated as "nothing to do"
  // (e.g. the record wasn't found) - no message is posted, no re-render.
  function commitSourceChange(transform, afterReparse) {
    try {
      const lines = sourceText.split(/\\r\\n|\\r|\\n/);
      const newLines = transform(lines);
      if (!newLines) return;
      sourceText = newLines.join('\\n');
      model = DspfParser.parseDspf(sourceText);
      activePulldown = null;
      suppressNextExternalUpdate = true;
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      if (afterReparse) afterReparse();
      render();
    } catch (err) {
      vscode.postMessage({ type: 'error', message: err.message });
    }
  }

  // No confirmation prompt - deleting is a normal WorkspaceEdit like every
  // other change here, so Ctrl+Z undoes it the same way. Unlike rename,
  // there's no auto-fix target for a deleted field's references (nothing
  // sensible to rewrite them TO), so this only scans and warns - using the
  // same advisory findLikelyNameReferences scan rename falls back on. Only
  // runs for a genuinely named field (REFFLD and similar keywords reference
  // fields by name); a bare, unnamed constant has nothing to search for.
  function commitDelete(field) {
    const references = field.name
      ? WebviewClientHelpers.findLikelyNameReferences(sourceText, field.name, DspfWriter.getFieldLineRange(field))
      : [];
    commitSourceChange(
      (lines) => DspfWriter.deleteField(field, lines),
      () => {
        selectedKey = null;
        if (references.length > 0) {
          vscode.postMessage({
            type: 'error',
            message:
              'iSDA: line(s) ' + references.join(', ') + ' in this source look like they might still reference "' + field.name +
              '" (e.g. REFFLD) - deleting a field never rewrites other keywords that reference it. Review those manually.',
          });
        }
      }
    );
  }

  // Duplicates the selected field/constant via DspfWriter.copyField (default
  // placement: one row below, same column - the same "drag it into place
  // afterward" expectation insertField's own doc comment sets). The copy
  // always lands at the bottom of the record's field array (insertField's
  // placement rule), so it's picked back up the same way regardless of
  // whether it's a named field or an unnamed constant, then selected so the
  // user can immediately drag it where it actually belongs.
  function commitCopy(recordName, field) {
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;
    commitSourceChange(
      (lines) => DspfWriter.copyField(rec, lines, field, {}),
      () => {
        const freshRec = model.records.find((r) => r.name === recordName);
        const newField = freshRec && freshRec.fields[freshRec.fields.length - 1];
        selectedKey = newField ? { sourceLine: newField.sourceLine } : null;
      }
    );
  }

  function commitEdit(recordName, field, updates) {
    commitSourceChange(
      (lines) => DspfWriter.applyFieldUpdate(field, lines, updates),
      () => {
        const rec = model.records.find((r) => r.name === recordName);
        const stillThere = rec && field.name && rec.fields.find((f) => f.name === field.name);
        selectedKey = stillThere ? { sourceLine: stillThere.sourceLine } : null;
      }
    );
  }

  function commitRecordEdit(recordName, updates) {
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;
    commitSourceChange((lines) => DspfWriter.applyRecordUpdate(rec, lines, updates));
  }

  // First auto-rewrites every structurally-recognized reference to the old
  // name (SFLCTL/WINDOW/MNUBARCHC - see DspfWriter.renameRecordReferences),
  // then renames the record's own R-line, then re-scans what's left with
  // the advisory-only findLikelyNameReferences - anything reported at that
  // point genuinely couldn't be auto-fixed (an unusual keyword shape, or a
  // reference sitting inside a comment) and needs a manual look.
  function commitRecordRename(oldName) {
    const errorEl = document.getElementById('p-record-rename-error');
    const nameInput = document.getElementById('p-record-name');
    if (errorEl) errorEl.textContent = '';
    const newName = (nameInput.value || '').trim().toUpperCase();
    if (!newName) { if (errorEl) errorEl.textContent = 'Enter a record format name.'; return; }
    if (newName === oldName) return;
    if (!WebviewClientHelpers.isValidDdsName(newName)) {
      if (errorEl) errorEl.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).';
      return;
    }
    if (model.records.some((r) => r.name === newName)) {
      if (errorEl) errorEl.textContent = 'A record format named ' + newName + ' already exists.';
      return;
    }

    const rec = model.records.find((r) => r.name === oldName);
    if (!rec) return;

    commitSourceChange(
      (lines) => {
        const withRefs = DspfWriter.renameRecordReferences(model, lines, oldName, newName);
        return DspfWriter.renameRecordFormat(rec, withRefs, newName);
      },
      () => {
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
      }
    );
    // Setting recordSelect.value to newName here (before this commitSourceChange
    // call has returned) would be a silent no-op - the <option> for newName
    // doesn't exist until commitSourceChange's OWN render() call has rebuilt the
    // dropdown, and assigning .value to a name with no matching <option> yet just
    // leaves the select on whatever it already had selected instead of erroring
    // or clearing (this previously only "worked" by coincidence in single-record
    // files, where the freshly-rebuilt dropdown's own natural default happens to
    // be its one remaining option). Has to happen out here, after the call above
    // returns, same fix as commitCopyRecord/the "+ Add record" handler use.
    if (model.records.some((r) => r.name === newName)) {
      recordSelect.value = newName;
      render();
    }
  }

  // Duplicates the whole record via DspfWriter.copyRecord (own conditions/
  // keywords + every field/constant/help entry, all under a fresh
  // auto-generated name) and immediately selects the new record - same
  // "land somewhere sensible, then let the user pick it up from there"
  // spirit as commitCopy for a single field.
  function commitCopyRecord(recordName) {
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;
    let copiedName = null;
    commitSourceChange(
      (lines) => {
        copiedName = DspfWriter.nextAvailableRecordName(model, rec.name);
        return DspfWriter.copyRecord(model, lines, rec, { name: copiedName });
      },
      () => {
        selectedKey = null;
        selectedHelpSourceLine = null;
        showFileProps = false;
      }
    );
    // Same gotcha as "+ Add record" above: recordSelect.value only "sticks" once
    // the new <option> genuinely exists, which only happens after commitSourceChange's
    // OWN render() call above has already run - so this has to happen out here,
    // after that call returns, not inside the afterReparse callback passed into it.
    if (copiedName && model.records.some((r) => r.name === copiedName)) {
      recordSelect.value = copiedName;
      render();
    }
  }

  // No confirmation prompt - same "it's a normal WorkspaceEdit, Ctrl+Z
  // undoes it" stance commitDelete already takes for a single field, just
  // one level up. Doesn't scan for other keywords elsewhere in the file
  // that might reference this record by name (SFLCTL/WINDOW/MNUBARCHC) -
  // unlike a rename, there's no sensible auto-fix target for a deleted
  // record's references, so this is the same "advisory scan only" gap
  // commitDelete's own doc comment already documents for a deleted field;
  // a genuinely thorough warning here would need the same
  // findLikelyNameReferences-style scan run against the record's own name.
  // After deletion, falls back to whichever record recordSelect's own
  // rebuild picks as the new first option (or the empty-file state if that
  // was the last record in the file).
  function commitDeleteRecord(recordName) {
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;
    const references = WebviewClientHelpers.findLikelyNameReferences(sourceText, rec.name, DspfWriter.getFullRecordLineRange(rec));
    commitSourceChange(
      (lines) => DspfWriter.deleteRecord(rec, lines),
      () => {
        selectedKey = null;
        selectedHelpSourceLine = null;
        showFileProps = false;
        if (references.length > 0) {
          vscode.postMessage({
            type: 'error',
            message:
              'iSDA: line(s) ' + references.join(', ') + ' in this source look like they might still reference "' + rec.name +
              '" (e.g. SFLCTL, WINDOW, MNUBARCHC) - deleting a record never rewrites other keywords that reference it. Review those manually.',
          });
        }
      }
    );
  }

  function commitHelpEdit(recordName, help, updates) {
    commitSourceChange(
      (lines) => DspfWriter.applyFieldUpdate(help, lines, updates),
      () => {
        // Help entries have no stable name to re-find by (unlike fields), so
        // just return to the record view rather than guessing which entry to reselect.
        selectedHelpSourceLine = null;
      }
    );
  }

  // Delete/Backspace deletes the currently-selected field or constant;
  // Ctrl+D (Cmd+D on macOS) copies it - same guards as delete (not while
  // typing in a props-panel input, not mid-drag). Ctrl+D is the OS/browser's
  // own "bookmark this page" shortcut, but there's no bookmark bar inside a
  // VS Code webview for it to conflict with, so it's safe to claim here the
  // same way Delete/Backspace already are.
  document.addEventListener('keydown', (e) => {
    const isCopyShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd';
    const isDeleteShortcut = e.key === 'Delete' || e.key === 'Backspace';
    if (!isCopyShortcut && !isDeleteShortcut) return;
    if (dragState) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!selectedKey) return;
    const found = findFieldBySourceLine(selectedKey.sourceLine);
    if (!found) return;
    e.preventDefault();
    if (isCopyShortcut) commitCopy(found.record.name, found.field);
    else commitDelete(found.field);
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'externalUpdate') {
      if (suppressNextExternalUpdate) { suppressNextExternalUpdate = false; return; }
      sourceText = msg.text;
      model = DspfParser.parseDspf(sourceText);
      selectedKey = null;
      render();
    }
  });

  recordSelect.addEventListener('change', () => { selectedKey = null; selectedHelpSourceLine = null; showFileProps = false; activePulldown = null; previewMultipleRows = false; previewRowsToggle.checked = false; render(); });

  render();
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>
`;

const output = `/**
 * webviewTemplate.ts
 *
 * AUTO-GENERATED by src/buildWebviewTemplate.js - do not hand-edit.
 * Bakes dspfEngine.js, dspfWriter.js and the browser-bundled parser into a
 * single self-contained webview HTML string, so the extension host never
 * needs to read extra files at runtime.
 *
 * Uses a nonce-scoped CSP (VS Code webview requirement) and postMessage to
 * talk to the extension host instead of Blob downloads / free-form file access.
 *
 * The HTML is stored as one JSON-escaped string constant rather than a TS
 * template literal, because the embedded JS source contains literal backtick
 * characters (JSDoc code spans) that would otherwise break a backtick-delimited
 * literal. Runtime values are substituted via plain string .split/.join.
 */

const HTML_TEMPLATE: string = ${JSON.stringify(htmlTemplate)};

export function getWebviewHtml(cspSource: string, nonce: string, initialSource: string, fileName: string): string {
  return HTML_TEMPLATE
    .split(${JSON.stringify(CSP_TOKEN)}).join(cspSource)
    .split(${JSON.stringify(NONCE_TOKEN)}).join(nonce)
    .split(${JSON.stringify(FILENAME_TOKEN)}).join(fileName)
    .split(${JSON.stringify(INITIAL_SOURCE_JSON_TOKEN)}).join(JSON.stringify(initialSource));
}
`;

fs.writeFileSync(path.join(__dirname, 'webviewTemplate.ts'), output);
console.log('wrote src/webviewTemplate.ts (' + output.length + ' chars)');

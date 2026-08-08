const fs = require('fs');
const path = require('path');

const engineJs = fs.readFileSync(path.join(__dirname, 'dspfEngine.js'), 'utf8');
const writerJs = fs.readFileSync(path.join(__dirname, 'dspfWriter.js'), 'utf8');
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
  .dspf-screen { display: grid; font-family: var(--mono); font-size: 14px; line-height: 1.4em; position: relative; }
  .dspf-field { white-space: pre; color: var(--accent); cursor: grab; user-select: none; border: 1px solid transparent; }
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
  .dspf-subfile-row { background: rgba(51,255,102,0.04); }
  .dspf-window-border {
    position: relative; border: 2px solid #3a5a45; background: #0a0f0c; border-radius: 2px;
    box-shadow: 3px 3px 0 rgba(0,0,0,0.5); pointer-events: none; z-index: 0;
  }
  .dspf-window-title {
    position: absolute; top: -1px; left: 8px; transform: translateY(-50%);
    background: #0a0f0c; padding: 0 6px; font-size: 11px; color: var(--ink-dim);
  }
  .dspf-field.dspf-widget-radio, .dspf-field.dspf-widget-checkbox {
    display: flex; flex-direction: column; justify-content: center; white-space: normal; z-index: 1;
  }
  .dspf-choice-row { display: flex; align-items: center; gap: 4px; line-height: 1.3em; }
  .dspf-choice-glyph { color: var(--ink-dim); font-family: var(--mono); }
  .dspf-field.dspf-widget-button { background: transparent; z-index: 1; }
  .dspf-widget-button {
    width: 100%; height: 100%; background: #14261c; color: var(--accent);
    border: 1px solid #3a5a45; border-radius: 3px; font-family: var(--mono);
    font-size: 12px; cursor: grab; padding: 2px 8px;
  }
  .status { color: var(--ink-dim); font-size: 11px; }
  .warn { color: var(--warn); font-size: 12px; margin-top: 8px; }
  button { background: #14261c; color: var(--accent); border: 1px solid #23482f; padding: 6px 10px; font-family: var(--mono); font-size: 12px; cursor: pointer; border-radius: 3px; }
  button:hover { background: #1b3324; }
  button.secondary { color: var(--ink); border-color: var(--panel-border); }
  .keyword-chip { display: inline-flex; align-items: center; gap: 6px; background: #0d1310; border: 1px solid var(--panel-border); padding: 3px 6px; border-radius: 3px; font-size: 11px; margin: 2px 4px 2px 0; }
  .keyword-chip button { padding: 0 4px; font-size: 11px; border: none; background: transparent; color: var(--warn); }
  .empty-state { color: var(--ink-dim); font-size: 13px; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-dim); margin: 16px 0 8px; }
</style>
</head>
<body>
<aside>
  <h1>IBM i · DDS</h1>
  <h2>Screen Design</h2>
  <div class="field-row"><label>Record</label><select id="recordSelect"></select></div>
  <div class="section-label">Conditioning indicators (preview)</div>
  <div id="indicatorList"></div>
  <div class="section-label">File</div>
  <div class="status" id="fileStatus">${FILENAME_TOKEN}</div>
</aside>
<main>
  <div class="screen-frame"><div id="screenOutput"></div></div>
  <div class="status">Click a field to select it. Drag to move. Changes are written straight back into the open document.</div>
</main>
<div class="props-panel" id="propsPanel">
  <h2 style="font-size:13px;">Properties</h2>
  <div id="propsBody"><div class="empty-state">Select a field to edit it.</div></div>
</div>

<script nonce="${NONCE_TOKEN}">${parserBundleJs}</script>
<script nonce="${NONCE_TOKEN}">${engineJs}</script>
<script nonce="${NONCE_TOKEN}">${writerJs}</script>
<script nonce="${NONCE_TOKEN}">
  const vscode = acquireVsCodeApi();
  let sourceText = ${INITIAL_SOURCE_JSON_TOKEN};
  let model = DspfParser.parseDspf(sourceText);
  let selectedKey = null;
  let suppressNextExternalUpdate = false;
  const active = new Set();

  const recordSelect = document.getElementById('recordSelect');
  const indicatorList = document.getElementById('indicatorList');
  const screenOutput = document.getElementById('screenOutput');
  const propsBody = document.getElementById('propsBody');

  function allIndicators() {
    const set = new Set();
    const collect = (conds) => (conds || []).forEach((g) => g.indicators.forEach((i) => set.add(i.number)));
    model.records.forEach((r) => { collect(r.conditions); r.fields.forEach((f) => { collect(f.conditions); f.keywords.forEach((k) => collect(k.conditions)); }); });
    return Array.from(set).sort();
  }

  function rebuildRecordSelect() {
    const prev = recordSelect.value;
    recordSelect.innerHTML = '';
    model.records.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.name; opt.textContent = r.name;
      recordSelect.appendChild(opt);
    });
    if (model.records.some((r) => r.name === prev)) recordSelect.value = prev;
  }

  function rebuildIndicatorList() {
    indicatorList.innerHTML = '';
    allIndicators().forEach((num) => {
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

  function render() {
    rebuildRecordSelect();
    rebuildIndicatorList();

    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    if (!recordName) { screenOutput.innerHTML = '<div class="empty-state">No record formats found.</div>'; renderProps(null); return; }
    recordSelect.value = recordName;

    const screen = DspfEngine.resolveScreen(model, recordName, active);
    if (screen.error) { screenOutput.innerHTML = '<div class="warn">' + screen.error + '</div>'; return; }
    screenOutput.innerHTML = DspfEngine.renderScreenHtml(screen);

    screenOutput.querySelectorAll('.dspf-field').forEach((el) => {
      const name = el.getAttribute('data-field');
      const anchorLine = parseInt(el.getAttribute('data-line'), 10);
      const anchorColumn = el.getAttribute('data-column') === '' ? null : parseInt(el.getAttribute('data-column'), 10);
      // data-line/data-column are the ANCHOR (source) coordinates set by resolveScreen -
      // for a plain field these equal field.location.line/.column; for a windowed field
      // or a repeated subfile row they're the window-relative / template-row source
      // position, which is what matching against field.location must use. A subfile
      // row's fields belong to the PAIRED SFL record, not the previewed SFLCTL record
      // (or vice versa), so the lookup searches every record, primary one first.
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

      const ownerRecord = model.records.find((r) => r.name === ownerRecordName);
      const isSflRow = ownerRecord && ownerRecord.keywords.some((k) => k.name === 'SFL');
      const tag = el.getAttribute('data-tag');

      el.addEventListener('click', () => { if (dragState) return; selectedKey = { sourceLine: underlying.sourceLine }; render(); });
      el.addEventListener('mousedown', (e) => {
        if (!editable) return;
        e.preventDefault();
        if (isSflRow && tag) {
          // Whole-row drag: every field visible in this rendered row instance moves
          // together, and every NAMED field of the SFL template record is batch-committed
          // together (that's the one row definition that actually exists in the DDS
          // source - constants in the row are left in place, see commitGroupEdit).
          const siblingEls = Array.from(screenOutput.querySelectorAll('[data-tag="' + tag.replace(/"/g, '\\\\"') + '"]'));
          startGroupDrag(siblingEls, ownerRecord.fields.filter((f) => f.name), ownerRecordName);
        } else {
          startDrag(el, underlying, ownerRecordName);
        }
      });
    });

    renderProps(recordName);
  }

  let dragState = null;

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

  // Whole-row subfile drag: moves every field of the SFL template record by the
  // same delta, visually together and as one batched source edit.
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
    if (!selectedKey) { propsBody.innerHTML = '<div class="empty-state">Select a field to edit it.</div>'; return; }
    const found = findFieldBySourceLine(selectedKey.sourceLine);
    const field = found && found.field;
    const ownerRecordName = found && found.record.name;
    if (!field) { propsBody.innerHTML = '<div class="empty-state">Select a field to edit it.</div>'; return; }

    const editable = DspfWriter.isEditable(field);
    let html = '';
    if (!editable) html += '<div class="warn">Multi-group or &gt;3-indicator conditioning — editing this field is disabled to avoid corrupting it. Edit the source directly.</div>';
    html += '<div class="field-row"><label>Name</label><input type="text" id="p-name" value="' + (field.name || '') + '" ' + (field.nameType === 'CONSTANT' ? 'disabled' : '') + ' /></div>';
    html += '<div class="two-col"><div class="field-row"><label>Length</label><input type="number" id="p-length" value="' + (field.length != null ? field.length : '') + '" /></div>';
    html += '<div class="field-row"><label>Decimals</label><input type="number" id="p-dec" value="' + (field.decimalPositions != null ? field.decimalPositions : '') + '" /></div></div>';
    html += '<div class="two-col"><div class="field-row"><label>Line</label><input type="number" id="p-line" value="' + (field.location.line != null ? field.location.line : '') + '" /></div>';
    html += '<div class="field-row"><label>Column</label><input type="number" id="p-col" value="' + (field.location.column != null ? field.location.column : '') + '" /></div></div>';
    html += '<div class="two-col"><div class="field-row"><label>Data type</label><select id="p-type">' +
      ['', 'A', 'X', 'N', 'S', 'Y', 'I', 'D', 'M', 'F', 'L', 'T', 'Z'].map((t) => '<option value="' + t + '"' + (field.dataType === t || (!field.dataType && t === '') ? ' selected' : '') + '>' + (t || '(blank)') + '</option>').join('') + '</select></div>';
    html += '<div class="field-row"><label>Usage</label><select id="p-usage">' + ['O', 'I', 'B', 'H', 'M', 'P'].map((u) => '<option value="' + u + '"' + (field.usage === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div></div>';
    html += '<div class="section-label">Keywords</div><div id="p-keywords">';
    (field.keywords || []).forEach((k, idx) => { html += '<span class="keyword-chip">' + k.name + (k.parameters ? '(' + k.parameters + ')' : '') + '<button data-idx="' + idx + '" class="kw-remove">×</button></span>'; });
    html += '</div><div class="two-col" style="margin-top:8px;"><input type="text" id="p-new-kw-name" placeholder="KEYWORD" /><input type="text" id="p-new-kw-params" placeholder="params" /></div>';
    html += '<button id="p-add-kw" class="secondary" style="width:100%;margin-top:6px;">+ Add keyword</button>';
    html += '<button id="p-apply" style="width:100%;margin-top:16px;" ' + (editable ? '' : 'disabled') + '>Apply changes</button>';
    propsBody.innerHTML = html;
    if (!editable) return;

    document.getElementById('p-apply').addEventListener('click', () => {
      commitEdit(ownerRecordName, field, {
        name: document.getElementById('p-name').value.trim().toUpperCase(),
        length: document.getElementById('p-length').value === '' ? null : parseInt(document.getElementById('p-length').value, 10),
        decimalPositions: document.getElementById('p-dec').value === '' ? null : parseInt(document.getElementById('p-dec').value, 10),
        line: document.getElementById('p-line').value === '' ? null : parseInt(document.getElementById('p-line').value, 10),
        column: document.getElementById('p-col').value === '' ? null : parseInt(document.getElementById('p-col').value, 10),
        dataType: document.getElementById('p-type').value || null,
        usage: document.getElementById('p-usage').value || null,
      });
    });
    propsBody.querySelectorAll('.kw-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const newKeywords = field.keywords.slice();
        newKeywords.splice(idx, 1);
        commitEdit(ownerRecordName, field, { keywords: newKeywords });
      });
    });
    document.getElementById('p-add-kw').addEventListener('click', () => {
      const name = document.getElementById('p-new-kw-name').value.trim().toUpperCase();
      const params = document.getElementById('p-new-kw-params').value.trim();
      if (!name) return;
      commitEdit(ownerRecordName, field, { keywords: field.keywords.concat([{ name, parameters: params, conditions: [], raw: '', sourceLines: [] }]) });
    });
  }

  function commitEdit(recordName, field, updates) {
    try {
      const lines = sourceText.split(/\\r\\n|\\r|\\n/);
      const newLines = DspfWriter.applyFieldUpdate(field, lines, updates);
      sourceText = newLines.join('\\n');
      model = DspfParser.parseDspf(sourceText);
      const rec = model.records.find((r) => r.name === recordName);
      const stillThere = rec && field.name && rec.fields.find((f) => f.name === field.name);
      selectedKey = stillThere ? { sourceLine: stillThere.sourceLine } : null;
      suppressNextExternalUpdate = true;
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      render();
    } catch (err) {
      vscode.postMessage({ type: 'error', message: err.message });
    }
  }

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

  recordSelect.addEventListener('change', () => { selectedKey = null; render(); });

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

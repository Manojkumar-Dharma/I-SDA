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
// 'modern' or 'classic' - persisted extension-host-side (see extension.ts) and
// shared with the menu designer, so switching styles in one designer is
// reflected in the other next time it's opened. Baked into the initial HTML
// (rather than only set client-side) to avoid a flash of the wrong style.
const UI_STYLE_TOKEN = '%%DSPF_UI_STYLE%%';
// 'green' (default, no CSS override needed) | 'amber' | 'cyan' | 'violet'.
// Only ever affects --chrome-accent (panel chrome), never --accent (the
// grid emulation) - see the --chrome-accent comment in the <style> block.
// Same persistence/sharing story as UI_STYLE_TOKEN.
const UI_THEME_TOKEN = '%%DSPF_UI_THEME%%';

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
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
    /* Panel-chrome accent, separate from --accent above. --accent is the
       CLASSIC-UI screen default (fixed green, matching real IBM i SDA's
       own green-screen default for any unstyled constant/field). In
       modern ("New UI") style, the screen's own default color follows the
       chosen chrome theme too - see the body[data-ui-style="modern"]
       .dspf-field override further down - rather than staying pinned to
       green regardless of theme. --chrome-accent itself only ever changes
       via the body[data-ui-theme=...] block below; defaults to the same
       value as --accent so modern mode before a theme is picked still
       looks identical to classic. Either way, an explicit COLOR keyword on
       a field/constant always overrides both of these (applied as an
       inline style - see dspfEngine.js's renderFieldDiv), matching real
       DDS's own "explicit COLOR beats the green-screen default" behavior. */
    --chrome-accent: var(--accent);
    --chrome-accent-rgb: 51, 255, 102;
  }
  * { box-sizing: border-box; }
  /* Bug fix: body used to be "min-height: 100vh" (unbounded) with the three
     grid columns (aside / main / .props-panel) each individually marked
     "overflow-y: auto"/"overflow: auto" - but that overflow rule is INERT
     unless a column's own height is actually CONSTRAINED to something
     smaller than its content. Since nothing here bounded it, a screen with
     enough fields/keywords to overflow the viewport (the Properties panel
     grows with each field's keyword list - common for a real DSPF) just
     made the whole BODY grow taller than the viewport instead, so the
     browser's own page-level scrollbar took over and scrolled ALL THREE
     columns together as one unit - scrolling to see more properties dragged
     the screen preview in main up and out of view right along with it,
     even though nothing about the preview itself needed to move. Pinning
     body to the actual viewport height (not just a minimum) and clipping
     it is what makes each column's own "overflow-y: auto" actually take
     effect - now every column scrolls independently within its own space,
     and the screen preview stays put while the properties list scrolls.
     Same fix as buildMenuWebviewTemplate.js's copy of this comment. */
  html, body { height: 100vh; overflow: hidden; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--mono); display: grid; grid-template-columns: 240px 1fr 300px; }
  aside, .props-panel { background: var(--panel); border-right: 1px solid var(--panel-border); padding: 16px; overflow-y: auto; min-height: 0; }
  .props-panel { border-right: none; border-left: 1px solid var(--panel-border); }
  h1 { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 14px; color: var(--chrome-accent); font-weight: 600; }
  select, input[type=text], input[type=number] { width: 100%; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 13px; }
  .field-row { margin-bottom: 10px; }
  .field-row label { display: block; font-size: 10px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .choice-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  /* min-width:0 removes the default flex min-width floor so a genuinely
   * flexible field (style="flex:1" - the sibling CHOICE keyword editor's
   * text box, or MNUBARCHC's pulldown-record box, each the one field on
   * their row meant to use whatever space is left) can actually shrink
   * instead of overflowing its row. The only OTHER input on either of
   * these rows is the fixed-width id/# box, which still had the
   * browser's default flex-shrink:1, so once min-width:0 removed its
   * floor too, a narrow sidebar (see the properties panel) could
   * compress even that fixed box below its declared width (reported
   * bug: MNUBARCHC's id/# not fully visible in the picker).
   * flex-shrink:0 here stops that; the one field meant to flex sets
   * flex-shrink:1 itself via its inline "flex:1" shorthand,
   * which (inline style) always wins over this class rule for that field. */
  .choice-row input { min-width: 0; flex-shrink: 0; }
  .choice-row button { flex-shrink: 0; }
  main { padding: 30px; display: flex; flex-direction: column; align-items: center; gap: 14px; overflow: auto; min-height: 0; }
  .screen-frame { background: #050705; border: 1px solid #1c2a22; border-radius: 4px; padding: 20px; box-shadow: inset 0 0 40px rgba(0,0,0,0.6); }
  .ruler-wrap { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto 1fr; position: relative; }
  .ruler-corner, .ruler-cols, .ruler-rows { font-family: var(--mono); font-size: 14px; line-height: 1.4em; white-space: pre; color: var(--ink-dim); user-select: none; pointer-events: none; }
  .ruler-cols { letter-spacing: 0; }
  .ruler-rows { text-align: right; padding-right: 4px; }
  /* Crosshair (pairs with the ruler above - Task L11's own follow-up): two
     thin guide lines that track the mouse over the design canvas, anchored
     to .ruler-wrap (NOT .dspf-screen itself, which gets fully replaced on
     every render() - see updateCrosshairPosition's own comment) so they
     span the full ruler-wrap height/width, crossing through the column/row
     ruler labels too, not just the screen area - visually ties the cursor
     position back to the ruler's own numbers. */
  .crosshair-v, .crosshair-h { position: absolute; background: var(--accent); opacity: 0.35; pointer-events: none; z-index: 5; grid-column: 1 / -1; grid-row: 1 / -1; }
  .crosshair-v { width: 1px; top: 0; bottom: 0; }
  .crosshair-h { height: 1px; left: 0; right: 0; }
  .crosshair-readout { font-family: var(--mono); font-size: 12px; color: var(--ink-dim); margin-top: 4px; }
  #screenOutput { position: relative; }
  .dspf-screen { display: grid; font-family: var(--mono); font-size: 14px; line-height: 1.4em; position: relative; z-index: 1; }
  .dspf-screen-backdrop-layer { position: absolute; top: 0; left: 0; opacity: 0.32; filter: grayscale(0.5); pointer-events: none; z-index: 0; }
  .dspf-screen-backdrop-layer .dspf-screen { z-index: 0; }
  .dspf-field { white-space: pre; color: var(--dspf-fg, var(--accent)); cursor: grab; user-select: none; border: 1px solid transparent; position: relative; z-index: 1; }
  .dspf-field:hover { border-color: rgba(51,255,102,0.4); }
  .dspf-field.selected { border-color: var(--accent); background: rgba(51,255,102,0.08); }
  /* Task L10: rubber-band drag-select rectangle - fixed-position (drawn in
     viewport coordinates, not the grid) since it tracks the raw mouse
     position across a canvas that may itself be scrolled. */
  .dspf-rubber-band { position: fixed; border: 1px dashed var(--accent); background: rgba(51,255,102,0.08); pointer-events: none; z-index: 50; }
  .dspf-field.dragging { cursor: grabbing; opacity: 0.7; }
  .dspf-field.locked { cursor: not-allowed; }
  .dspf-field.locked:hover { border-color: rgba(255,138,92,0.5); }
  /* No color override here on purpose: a constant/field with no COLOR
     keyword of its own inherits .dspf-field's default color (green in
     classic UI, the chosen theme accent in modern UI - see the
     body[data-ui-style="modern"] override below), matching real IBM i
     SDA where an unstyled constant is just as green as an unstyled named
     field. A COLOR keyword, when present, is applied as an inline style
     by renderFieldDiv (dspfEngine.js) and always wins over both of these
     class rules regardless of specificity. */
  .dspf-hi { filter: brightness(1.6); font-weight: 600; }
  /* Real IBM i SDA reverse image swaps the field's OWN foreground/background: the
     field's assigned color becomes the background, and the screen's background
     becomes the text color - it stays readable and keeps the field's color
     identity. This used to read "background: currentColor" while ALSO setting
     "color: #050705 !important" in the very same rule - currentColor resolves
     against the FINAL cascaded color for the element, which (because of the
     !important here) was always that same near-black, so background and text
     ended up identical near-black-on-near-black, indistinguishable from the
     #050705 screen-frame background behind it - the field visually vanished
     instead of reversing. Reading --dspf-fg (the field's original color, set as
     its own custom property - see renderFieldDiv in dspfEngine.js) instead of
     currentColor sidesteps that entirely: it's independent of whatever color
     ends up being on this element. */
  .dspf-reverse { background: var(--dspf-fg, var(--accent)); color: #050705 !important; }
  .dspf-underline { text-decoration: underline; }
  .dspf-blink { animation: dspf-blink 1s steps(1) infinite; }
  .dspf-protect { opacity: 0.65; }
  /* DSPATR(PC) "position cursor" - real 5250 puts the cursor here on display; there's
     no text-attribute equivalent to render, so instead overlay a solid block at the
     field's first character that blinks like an actual terminal cursor. Only the one
     candidate resolveScreen's markFirstCursorField() picked (screen's first eligible
     PC field) gets this class, even if several fields in the DDS are marked PC. */
  .dspf-cursor-pos::before {
    content: '';
    position: absolute;
    left: 0; top: 0;
    width: 1ch; height: 100%;
    background: var(--dspf-fg, var(--accent));
    animation: dspf-blink 1s steps(1) infinite;
    pointer-events: none;
    z-index: 2;
  }
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
  /* WDWBORDER's *DSPATR - only HI (bolder border) and BL (blinking, reusing
     the same dspf-blink keyframes text fields already use) have a
     meaningful CSS-border equivalent; RI/UL/ND/CS aren't rendered here.
     *COLOR itself is applied as an inline style (see renderScreenHtml),
     since it varies per-window and always overrides these defaults. */
  .dspf-window-border.dspf-window-border-hi { border-width: 3px; }
  .dspf-window-border.dspf-window-border-blink { animation: dspf-blink 1s steps(1) infinite; }
  /* WDWBORDER's *CHAR group - once any of the 8 border-position characters
     is set, the plain CSS box border above is suppressed entirely (no
     border/shadow) in favor of the actual character overlay rendered as
     .dspf-window-char cells (see dspfEngine.js's renderWindowBorderCharsHtml) -
     the two are alternative representations of the same keyword group, not
     meant to be layered together. */
  .dspf-window-border.dspf-window-border-charmode { border-color: transparent; box-shadow: none; }
  .dspf-window-char {
    white-space: pre; color: var(--ink-dim); pointer-events: none; user-select: none;
    position: relative; z-index: 1; text-align: center;
  }
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
    width: 100%; height: 100%; background: #14261c; color: var(--chrome-accent);
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
  /* .dspf-pulldown-field must out-rank EVERY widget-type z-index rule above
   * (.dspf-field.dspf-widget-radio/-checkbox/-button/-menubar, .dspf-field.dspf-cntfld)
   * so a PULLDOWN overlay's own fields always paint above .dspf-pulldown-border's
   * opaque background - that's the whole point of z-index:3 here. A bare
   * .dspf-pulldown-field (one class, specificity 0,1,0) LOSES that fight
   * against those widget rules (two classes each, specificity 0,2,0) no
   * matter where it sits in this file - CSS specificity always beats source
   * order. The result: any SNGCHCFLD/MLTCHCFLD (radio/checkbox), button,
   * CNTFLD, or (in principle) menu-bar field placed inside a PULLDOWN record
   * silently computed z-index:1, one below the border's z-index:2, so the
   * border's own background painted OVER the choice text - it was still
   * there in the DOM with correct color/content, just visually hidden
   * behind the border (reported bug: "choice pulldown/menu showing empty").
   * Matching .dspf-field.dspf-pulldown-field here (still two classes, same
   * 0,2,0 specificity as every rule above) makes source order the
   * tiebreaker again - and this rule already sits after all of them. */
  .dspf-field.dspf-pulldown-field { z-index: 3; }
  .dspf-field.dspf-pulldown-field.dspf-widget-radio, .dspf-field.dspf-pulldown-field.dspf-widget-checkbox { background: #0a0f0c; }
  .status { color: var(--ink-dim); font-size: 11px; }
  .warn { color: var(--warn); font-size: 12px; margin-top: 8px; }
  /* Task L18 - "IBM i: Connected/Not connected/Not installed" badge. Chrome
     UI (aside panel), so this uses --chrome-accent/--warn/--ink-dim, never
     --accent (grid-only, see the --chrome-accent comment in :root above) -
     connected borrows the same chrome-accent styling save-btn/compile-btn
     already use for a "this works" affordance, not-connected reuses --warn
     (the same color the confirm-dialog/rename-error/size-bounds-warning
     already use for "needs attention"), unknown/not-installed is muted
     --ink-dim (a neutral "nothing to act on right now" state, not a warning -
     Compile/Resolve/Add-from-DB never being reachable without the extension
     installed isn't a per-session problem the badge should alarm about).
  */
  .codefori-badge {
    display: block; font-size: 11px; padding: 5px 8px; margin-bottom: 10px;
    border-radius: 4px; border: 1px solid var(--panel-border); color: var(--ink-dim);
  }
  .codefori-badge.connected { color: var(--chrome-accent); border-color: var(--chrome-accent); background: #142018; }
  .codefori-badge.disconnected { color: var(--warn); border-color: var(--warn); }
  .codefori-badge.unknown { color: var(--ink-dim); border-color: var(--panel-border); }
  #sizeBoundsWarning { white-space: pre-line; }
  #overlapWarning { white-space: pre-line; }
  .rename-row { display: flex; gap: 6px; margin-top: 8px; }
  .rename-input { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 12px; }
  .rename-btn { background: #142018; color: var(--chrome-accent); border: 1px solid var(--panel-border); padding: 6px 8px; font-family: var(--mono); font-size: 11px; cursor: pointer; }
  .rename-btn:hover { border-color: var(--chrome-accent); }
  .rename-error { color: var(--warn); font-size: 11px; margin-top: 6px; min-height: 1.3em; }
  .delete-hint { color: var(--ink-dim); font-size: 11px; margin-top: 10px; }
  .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .confirm-dialog { background: var(--panel); border: 1px solid var(--warn); border-radius: 6px; padding: 18px; max-width: 380px; font-family: var(--mono); }
  .confirm-dialog-title { color: var(--warn); font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .confirm-dialog-body { font-size: 12px; color: var(--ink); line-height: 1.5; margin-bottom: 14px; }
  .confirm-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .confirm-dialog-actions button.danger { color: var(--warn); border-color: var(--warn); }
  /* Task L14 - "Add fields from database file" picker. Reuses .confirm-overlay's
     own backdrop/centering, but its own wider/neutral dialog variant (not
     .confirm-dialog's warning-amber border/380px cap, which is specifically
     for destructive-action confirmations) since this is a neutral multi-step
     form, not a warning. */
  .dbfields-dialog { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 6px; padding: 18px; width: 480px; max-width: 90vw; max-height: 80vh; overflow-y: auto; font-family: var(--mono); }
  .dbfields-dialog-title { color: var(--chrome-accent); font-size: 13px; font-weight: 600; margin-bottom: 10px; }
  .dbfields-row { display: flex; gap: 8px; margin-bottom: 8px; }
  .dbfields-row input[type="text"] { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 5px 6px; font-family: var(--mono); font-size: 12px; }
  .dbfields-row input#dbf-library { flex: 0 0 100px; }
  .dbfields-list { border: 1px solid var(--panel-border); border-radius: 4px; margin: 10px 0; max-height: 260px; overflow-y: auto; }
  .dbfields-list-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; font-size: 11px; border-bottom: 1px solid var(--panel-border); cursor: pointer; }
  .dbfields-list-row:last-child { border-bottom: none; }
  .dbfields-list-row:hover { background: rgba(51,255,102,0.06); }
  .dbfields-list-row .fname { color: var(--accent); width: 90px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dbfields-list-row .fattrs { color: var(--ink-dim); width: 64px; flex-shrink: 0; }
  .dbfields-list-row .ftext { color: var(--ink-dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dbfields-status { color: var(--ink-dim); font-size: 11px; margin: 6px 0; }
  .dbfields-error { color: var(--warn); font-size: 11px; margin-top: 6px; }
  button { background: #14261c; color: var(--chrome-accent); border: 1px solid #23482f; padding: 6px 10px; font-family: var(--mono); font-size: 12px; cursor: pointer; border-radius: 3px; }
  button:hover { background: #1b3324; }
  button.secondary { color: var(--ink); border-color: var(--panel-border); }
  .compile-btn { background: #142018; color: var(--chrome-accent); border: 1px solid var(--chrome-accent); }
  .save-btn { background: #142018; color: var(--chrome-accent); border: 1px solid var(--chrome-accent); font-weight: 600; }
  .save-btn-dirty { background: #2a2410; color: var(--warn); border-color: var(--warn); animation: isda-save-pulse 1.8s ease-in-out infinite; }
  @keyframes isda-save-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
  .compile-btn:hover { background: #1b2c22; }
  .keyword-chip { display: inline-flex; align-items: center; gap: 6px; background: #0d1310; border: 1px solid var(--panel-border); padding: 3px 6px; border-radius: 3px; font-size: 11px; margin: 2px 4px 2px 0; }
  .keyword-chip button { padding: 0 4px; font-size: 11px; border: none; background: transparent; color: var(--warn); }
  .attr-checks { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 4px 0 12px; }
  .attr-check { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ink-dim); }
  .hint-small { font-size: 10px; color: var(--ink-dim); margin: 2px 0 10px; }
  .kw-row { margin-bottom: 4px; }
  .kw-row-main { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .kw-cond-toggle { font-size: 10px; color: var(--ink-dim); cursor: pointer; user-select: none; }
  .kw-cond-toggle:hover { color: var(--chrome-accent); }
  .kw-cond-body { margin: 4px 0 8px 0; padding-left: 8px; border-left: 2px solid var(--panel-border); }
  .empty-state { color: var(--ink-dim); font-size: 13px; }
  .help-entry-row {
    background: #0d1310; border: 1px solid var(--panel-border); border-radius: 3px;
    padding: 6px 8px; margin-bottom: 6px; font-size: 12px; cursor: pointer;
  }
  .help-entry-row:hover { border-color: var(--chrome-accent); }
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
  .field-order-row button:not(:disabled):hover { border-color: var(--chrome-accent); }
  /* Task L19 - "Find field" search results dropdown, right under the search
     box in the aside. Deliberately its own floating panel (not inline in
     normal document flow) so it overlays whatever's below it (the Record
     select etc.) rather than shoving the rest of the aside down while
     someone's mid-search - same reasoning a browser's own address-bar
     autocomplete dropdown floats instead of reflowing the page. */
  .field-search-results {
    position: absolute; left: 0; right: 0; z-index: 50;
    max-height: 240px; overflow-y: auto; background: var(--panel);
    border: 1px solid var(--panel-border); border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .field-search-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 6px 8px; font-size: 12px; cursor: pointer; border-bottom: 1px solid var(--panel-border);
  }
  .field-search-row:last-child { border-bottom: none; }
  .field-search-row:hover, .field-search-row.active { background: rgba(var(--chrome-accent-rgb), 0.12); }
  .field-search-row .fsr-name { color: var(--ink); font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field-search-row .fsr-meta { color: var(--ink-dim); font-size: 10px; white-space: nowrap; flex-shrink: 0; }
  .field-search-empty { padding: 8px; font-size: 11px; color: var(--ink-dim); }
  /* Task L13 - comment text input reuses .rename-input's own look (flex:1,
     same dark input styling) inside a .field-order-row so a comment row
     lines up visually with the Structure tab's other rows above it. */
  .comment-text-input { flex: 1; min-width: 0; background: #0d1310; color: var(--ink); border: 1px solid var(--panel-border); padding: 4px 6px; font-family: var(--mono); font-size: 12px; }
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
  .fkey-chip.fkey-active { color: var(--chrome-accent); border-color: var(--chrome-accent); background: #0d1310; }
  .props-breadcrumb { font-size: 11px; color: var(--ink-dim); margin-bottom: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .props-breadcrumb .crumb { cursor: pointer; }
  .props-breadcrumb .crumb:hover { color: var(--chrome-accent); }
  .props-breadcrumb .crumb.current { color: var(--ink); cursor: default; font-weight: 600; }
  .props-breadcrumb .crumb-sep { color: var(--panel-border); }
  .props-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--panel-border); margin-bottom: 12px; flex-wrap: wrap; }
  .props-tab { background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--ink-dim); font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 8px; cursor: pointer; border-radius: 0; }
  .props-tab:hover { color: var(--ink); background: transparent; }
  .props-tab.active { color: var(--chrome-accent); border-bottom-color: var(--chrome-accent); }
  .props-tab-panel { display: none; }
  .props-tab-panel.active { display: block; }
  /* A second, visually-lighter tab strip (subtabsHtml/wireSubTabs) for nesting inside
     one props-tab-panel - e.g. R1's 8 category panels living inside the record
     Properties panel's own Keywords tab. Distinct classes/attributes (not
     .props-tab/-panel) so wireTabs()'s querySelectorAll on the outer propsBody
     root can't also pick up (and mis-wire) these inner buttons/panels. */
  .props-subtabs { display: flex; gap: 2px; flex-wrap: wrap; margin-bottom: 10px; }
  .props-subtab { background: var(--panel-alt); border: 1px solid var(--panel-border); color: var(--ink-dim); font-family: var(--mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 7px; cursor: pointer; border-radius: 3px; }
  .props-subtab:hover { color: var(--ink); }
  .props-subtab.active { color: var(--chrome-accent); border-color: var(--chrome-accent); }
  .props-subtab-panel { display: none; }
  .props-subtab-panel.active { display: block; }
  .props-accordion { border: 1px solid var(--panel-border); border-radius: 3px; margin-bottom: 10px; }
  .props-accordion > summary { cursor: pointer; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-dim); list-style: none; }
  .props-accordion > summary::-webkit-details-marker { display: none; }
  .props-accordion > summary:hover { color: var(--chrome-accent); }
  .props-accordion[open] > summary { border-bottom: 1px solid var(--panel-border); color: var(--chrome-accent); }
  .props-accordion-body { padding: 8px; }
  .place-btn-row { display: flex; gap: 6px; margin-top: 8px; }
  .align-btn-row { display: flex; gap: 6px; margin-top: 6px; }
  .align-btn { flex: 1; font-size: 11px; padding: 6px 4px; white-space: nowrap; }
  .align-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .place-btn-row button { flex: 1; }
  .place-btn-row button.active { color: var(--chrome-accent); border-color: var(--chrome-accent); background: #0d1310; }
  .dspf-screen.placing { cursor: crosshair; }
  .panel-toggle-btn {
    position: sticky; top: 0; display: block; width: 100%; background: var(--panel); color: var(--ink-dim);
    border: none; border-bottom: 1px solid var(--panel-border); cursor: pointer; padding: 6px 0;
    font-family: var(--mono); font-size: 12px; z-index: 2; margin-bottom: 10px;
  }
  .panel-toggle-btn:hover { color: var(--chrome-accent); }
  aside.panel-collapsed, .props-panel.panel-collapsed { padding: 0; overflow: hidden; }
  .panel-collapsed .panel-body { display: none; }
  /* Task L19 - positions the "Find field" results dropdown (position:
     absolute) relative to the panel body rather than the whole page, so it
     floats just under the search box regardless of scroll position. */
  .panel-body { position: relative; }
  .panel-collapsed .panel-toggle-btn { margin-bottom: 0; writing-mode: vertical-rl; height: 100%; padding: 10px 0; }
  #newRecordForm { border: 1px solid var(--panel-border); border-radius: 3px; padding: 8px; margin-top: 8px; }

  /* ---------------------------------------------------------------------
   * "Modern" UI style layer - opt-in via body[data-ui-style="modern"],
   * toggled by #uiStyleToggle below and persisted in extension globalState
   * (see extension.ts). Purely additive: everything above this point is
   * the "classic" style and stays completely unchanged when the modern
   * layer is off.
   *
   * Scope is mostly limited to chrome - panels, buttons, tabs, chips,
   * inputs - so the STRSDA-accurate preview's layout/positions/keyword
   * rendering behave identically no matter which style is active. The one
   * deliberate exception is the screen's own DEFAULT text color (see the
   * .dspf-field override just below): classic UI keeps the fixed
   * green-screen default, modern UI follows the chosen chrome theme
   * instead - everything else about the preview (an explicit COLOR
   * keyword, window borders, field positions, etc.) is unaffected by
   * either style.
   * --------------------------------------------------------------------- */
  body[data-ui-style="modern"] .dspf-field { color: var(--dspf-fg, var(--chrome-accent)); }
  /* Same reasoning as classic's .dspf-reverse (see above) - modern's reverse-image
     background needs to fall back to the chrome theme's accent, not classic's fixed
     green, when the field has no explicit COLOR keyword of its own. */
  body[data-ui-style="modern"] .dspf-reverse { background: var(--dspf-fg, var(--chrome-accent)); }
  body[data-ui-style="modern"] .dspf-cursor-pos::before { background: var(--dspf-fg, var(--chrome-accent)); }
  .ui-style-toggle {
    width: 100%; background: var(--panel); color: var(--ink-dim); border: 1px solid var(--panel-border);
    border-radius: 3px; padding: 5px 9px; font-family: var(--mono); font-size: 11px; cursor: pointer;
  }
  .ui-style-toggle:hover { color: var(--chrome-accent); border-color: var(--chrome-accent); }
  #uiThemeRow { display: none; }
  body[data-ui-style="modern"] #uiThemeRow { display: block; }
  .ui-theme-select { width: 100%; }

  body[data-ui-style="modern"] button,
  body[data-ui-style="modern"] .rename-btn,
  body[data-ui-style="modern"] .props-tab,
  body[data-ui-style="modern"] .field-order-row button {
    transition: transform 160ms var(--ease-out), background-color 160ms var(--ease-out),
      border-color 160ms var(--ease-out), color 160ms var(--ease-out);
  }
  body[data-ui-style="modern"] button:active:not(:disabled) { transform: scale(0.97); }

  body[data-ui-style="modern"] select,
  body[data-ui-style="modern"] input[type=text],
  body[data-ui-style="modern"] input[type=number],
  body[data-ui-style="modern"] .rename-input {
    transition: border-color 150ms var(--ease-out);
  }

  body[data-ui-style="modern"] button:focus-visible,
  body[data-ui-style="modern"] select:focus-visible,
  body[data-ui-style="modern"] input:focus-visible,
  body[data-ui-style="modern"] .props-tab:focus-visible,
  body[data-ui-style="modern"] .props-subtab:focus-visible,
  body[data-ui-style="modern"] .props-breadcrumb .crumb:focus-visible {
    outline: 2px solid var(--chrome-accent); outline-offset: 1px;
  }

  body[data-ui-style="modern"] .props-tab-panel.active,
  body[data-ui-style="modern"] .props-subtab-panel.active {
    animation: isda-fade-in 150ms var(--ease-out);
  }
  @keyframes isda-fade-in { from { opacity: 0; } to { opacity: 1; } }

  body[data-ui-style="modern"] .props-accordion > summary {
    transition: color 150ms var(--ease-out), border-color 150ms var(--ease-out);
  }
  body[data-ui-style="modern"] .keyword-chip,
  body[data-ui-style="modern"] .field-order-row,
  body[data-ui-style="modern"] .help-entry-row,
  body[data-ui-style="modern"] .cond-group {
    transition: border-color 150ms var(--ease-out);
  }
  body[data-ui-style="modern"] .panel-toggle-btn { transition: color 150ms var(--ease-out); }

  /* Static (non-interaction) differences - these are the ones actually
     visible without hovering/clicking/tabbing, since everything above this
     point only changes appearance ON a state change. Kept intentionally
     modest so the retro/monospace identity still reads as the same app,
     not a redesign. */
  body[data-ui-style="modern"] .props-tab.active {
    background: rgba(var(--chrome-accent-rgb), 0.12);
    border-radius: 3px 3px 0 0;
  }
  body[data-ui-style="modern"] .keyword-chip {
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  }
  body[data-ui-style="modern"] .section-label {
    border-left: 2px solid var(--chrome-accent);
    padding-left: 6px;
  }
  body[data-ui-style="modern"] button:not(.ui-style-toggle):not(.panel-toggle-btn) {
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.3);
  }
  body[data-ui-style="modern"] .props-panel,
  body[data-ui-style="modern"] aside {
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.25);
  }

  /* Color themes - modern style only. Each only overrides --chrome-accent /
     --chrome-accent-rgb (see the :root comment above for why --accent
     itself is never touched), so every chrome rule above - already keyed
     off --chrome-accent - repaints automatically. "green" isn't listed
     since it's just the :root default with no override needed. The
     #uiThemeRow / .ui-theme-select rules that show/style the control
     itself live earlier in this stylesheet, next to .ui-style-toggle -
     both now live in the aside's "UI Settings" section rather than
     floating over the page (see below), so there's nothing display-related
     left to do here. */
  body[data-ui-style="modern"][data-ui-theme="amber"] { --chrome-accent: #ffb347; --chrome-accent-rgb: 255, 179, 71; }
  body[data-ui-style="modern"][data-ui-theme="cyan"] { --chrome-accent: #33d9ff; --chrome-accent-rgb: 51, 217, 255; }
  body[data-ui-style="modern"][data-ui-theme="violet"] { --chrome-accent: #b366ff; --chrome-accent-rgb: 179, 102, 255; }
</style>
</head>
<body data-ui-style="${UI_STYLE_TOKEN}" data-ui-theme="${UI_THEME_TOKEN}">
<aside>
  <button class="panel-toggle-btn" id="leftPanelToggle" title="Hide this panel">&#9664; Hide panel</button>
  <div class="panel-body" id="leftPanelBody">
  <h1>IBM i · DDS</h1>
  <h2>Screen Design</h2>
  <div class="status" id="fileStatus">${FILENAME_TOKEN}</div>
  <div class="codefori-badge unknown" id="codeForIBadge" title="Whether the Code for IBM i extension is installed and connected. Compile, Resolve Referenced Field, and Add fields from database file all need a live connection.">IBM i: checking…</div>
  <button id="saveDocBtn" class="save-btn" style="width:100%;margin-bottom:10px;" title="Save this file to disk (Ctrl+S/Cmd+S works too - this button exists because a webview panel doesn't show VS Code's own dirty-tab dot)">&#128190; Save</button>
  <div class="field-row">
    <label>Find field</label>
    <input type="text" id="fieldSearchInput" placeholder="Type a field or constant name…" autocomplete="off" />
  </div>
  <div id="fieldSearchResults" class="field-search-results hidden"></div>
  <div class="field-row"><label>Record</label><select id="recordSelect"></select></div>
  <button class="secondary" id="newRecordToggleBtn" style="width:100%;margin-top:6px;">+ Add record</button>
  <div class="hidden" id="newRecordForm">
    <div class="field-row">
      <label>Record type</label>
      <select id="newRecordType"></select>
    </div>
    <div class="field-row hidden" id="newRecordSflctlRow">
      <label id="newRecordSflctlLabel">Subfile control (SFLCTL) record name</label>
      <input type="text" class="rename-input" id="newRecordSflctlName" placeholder="SFLCTL record name" maxlength="10" />
    </div>
    <div class="field-row hidden" id="newRecordWindowRow">
      <label id="newRecordWindowLabel">Inherit geometry from</label>
      <select id="newRecordWindowSelect"></select>
    </div>
    <div class="hidden" id="newRecordSflmsgRow">
      <div class="two-col">
        <div class="field-row"><label>Line for first message</label><input type="number" id="newRecordSflmsgLine" min="1" max="27" value="24" /></div>
        <div class="field-row"><label class="compare-toggle"><input type="checkbox" id="newRecordSflmsg276" /> 276-byte queue field</label></div>
      </div>
      <div class="two-col">
        <div class="field-row"><label>Message key field name</label><input type="text" id="newRecordSflmsgKeyName" maxlength="10" value="MSGKEY" /></div>
        <div class="field-row"><label>Program queue field name</label><input type="text" id="newRecordSflmsgQueueName" maxlength="10" value="PGMQ" /></div>
      </div>
    </div>
    <div class="rename-row" style="margin-top:6px;">
      <input type="text" class="rename-input" id="newRecordName" placeholder="New record name" maxlength="10" />
      <button class="rename-btn" id="newRecordBtn">Create</button>
    </div>
    <div class="rename-error" id="newRecordError"></div>
  </div>
  <div class="field-row hidden" id="sizeSelectRow"><label>Screen size</label><select id="sizeSelect"></select></div>
  <div class="place-btn-row">
    <button class="secondary" id="placeFieldBtn">+ Field</button>
    <button class="secondary" id="placeConstantBtn">+ Constant</button>
  </div>
  <button class="secondary" id="addFromDbBtn" style="width:100%;margin-top:6px;" title="Task L14: real SDA's F10 (Database) key - browse a PF/LF's field list and place several at once as REFFLD-based fields">+ Fields from database file</button>
  <div class="hint-readonly hidden" id="placementHint">Click anywhere on the screen preview to place it there (Esc to cancel).</div>
  <label class="compare-toggle"><input type="checkbox" id="compareModeToggle" /> Show other record(s) dimmed behind</label>
  <label class="compare-toggle hidden" id="compareOverlayRow"><input type="checkbox" id="compareOverlayToggle" /> Full overlay instead (read-only)</label>
  <label class="compare-toggle hidden" id="previewRowsRow"><input type="checkbox" id="previewRowsToggle" /> Preview SFLPAG rows</label>
  <label class="compare-toggle"><input type="checkbox" id="rulerToggle" /> Show ruler (row/column numbers)</label>
  <label class="compare-toggle"><input type="checkbox" id="crosshairToggle" /> Show crosshair (position readout)</label>
  <div id="compareRecordList" class="hidden"></div>
  <div class="section-label">Conditioning indicators (preview)</div>
  <div id="indicatorList"></div>
  <div class="section-label">File</div>
  <button id="fileAttrsBtn" class="secondary" style="width:100%;margin-top:8px;">File attributes</button>
  <button id="compileDspfBtn" class="compile-btn" style="width:100%;margin-top:8px;">Compile Display File (CRTDSPF)</button>
  <details class="props-accordion" id="uiSettingsAccordion" style="margin-top:10px;">
    <summary>&#9881; UI Settings</summary>
    <div class="props-accordion-body">
      <div class="field-row">
        <label>Style</label>
        <button class="ui-style-toggle" id="uiStyleToggle" title="Switch UI style"></button>
      </div>
      <div class="field-row" id="uiThemeRow">
        <label>Theme</label>
        <select class="ui-theme-select" id="uiThemeSelect" title="Chrome color theme (modern style only)">
          <option value="green">Green</option>
          <option value="amber">Amber</option>
          <option value="cyan">Cyan</option>
          <option value="violet">Violet</option>
        </select>
      </div>
    </div>
  </details>
  </div>
</aside>
<main>
  <div id="fkeyLegend"></div>
  <div class="screen-frame"><div class="ruler-wrap" id="rulerWrap">
    <div class="ruler-corner hidden" id="rulerCorner"></div>
    <div class="ruler-cols hidden" id="rulerCols"></div>
    <div class="ruler-rows hidden" id="rulerRows"></div>
    <div id="screenOutput"></div>
    <div class="crosshair-v hidden" id="crosshairV"></div>
    <div class="crosshair-h hidden" id="crosshairH"></div>
  </div></div>
  <div class="crosshair-readout hidden" id="crosshairReadout"></div>
  <div class="status" id="mainHint">Click a field to select it. Drag to move. Changes are written straight back into the open document.</div>
  <div class="warn hidden" id="sizeBoundsWarning"></div>
  <div class="warn hidden" id="overlapWarning"></div>
</main>
<div class="props-panel" id="propsPanel">
  <button class="panel-toggle-btn" id="rightPanelToggle" title="Hide this panel">Hide panel &#9654;</button>
  <div class="panel-body" id="rightPanelBody">
  <h2 style="font-size:13px;">Properties</h2>
  <div id="propsBreadcrumb"></div>
  <div id="propsBody"><div class="empty-state">Select a field to edit it.</div></div>
  </div>
</div>

<script nonce="${NONCE_TOKEN}">${parserBundleJs}</script>
<script nonce="${NONCE_TOKEN}">${engineJs}</script>
<script nonce="${NONCE_TOKEN}">${writerJs}</script>
<script nonce="${NONCE_TOKEN}">${clientHelpersJs}</script>
<script nonce="${NONCE_TOKEN}">
  const vscode = acquireVsCodeApi();

  // UI style toggle (modern/classic - see the CSS block above for what "modern"
  // actually changes). Initial value comes from the extension-host-persisted
  // token baked into the body tag; vscode.getState() is only consulted as a
  // same-session override in case the user just toggled it and the webview
  // got rebuilt before the extension host's globalState round-trip landed.
  (function () {
    const toggleBtn = document.getElementById('uiStyleToggle');
    function labelFor(style) {
      return style === 'modern' ? 'Classic UI' : 'New UI \u2728';
    }
    let uiStyle = (vscode.getState() && vscode.getState().uiStyle) || document.body.dataset.uiStyle || 'modern';
    document.body.dataset.uiStyle = uiStyle;
    toggleBtn.textContent = labelFor(uiStyle);
    toggleBtn.title = uiStyle === 'modern'
      ? 'Switch back to the classic (no-animation) look'
      : 'Try the new animated look';
    toggleBtn.addEventListener('click', () => {
      uiStyle = uiStyle === 'modern' ? 'classic' : 'modern';
      document.body.dataset.uiStyle = uiStyle;
      toggleBtn.textContent = labelFor(uiStyle);
      toggleBtn.title = uiStyle === 'modern'
        ? 'Switch back to the classic (no-animation) look'
        : 'Try the new animated look';
      vscode.setState(Object.assign({}, vscode.getState(), { uiStyle }));
      vscode.postMessage({ type: 'setUiStyle', value: uiStyle });
    });
  })();

  // Color theme (modern style only) - same persistence pattern as the style
  // toggle above, in a separate globalState key so the two are independent.
  (function () {
    const select = document.getElementById('uiThemeSelect');
    let uiTheme = (vscode.getState() && vscode.getState().uiTheme) || document.body.dataset.uiTheme || 'green';
    document.body.dataset.uiTheme = uiTheme;
    select.value = uiTheme;
    select.addEventListener('change', () => {
      uiTheme = select.value;
      document.body.dataset.uiTheme = uiTheme;
      vscode.setState(Object.assign({}, vscode.getState(), { uiTheme }));
      vscode.postMessage({ type: 'setUiTheme', value: uiTheme });
    });
  })();

  let sourceText = ${INITIAL_SOURCE_JSON_TOKEN};
  let model = DspfParser.parseDspf(sourceText);
  let selectedKey = null;
  // Task L10: multi-field select, block move/copy/delete/style - real SDA's Design
  // Image screen convention (block-select via '- -'/'= =' line commands) generalized
  // to shift/ctrl-click and rubber-band drag-select on the canvas. selectedKey stays
  // the PRIMARY (most-recently-clicked) selection, exactly as every pre-L10 caller
  // already expects (single-field props panel, drag source, etc.) - selectedKeys is
  // the FULL selection set (always includes selectedKey's own sourceLine when
  // selectedKey is set) and is what the multi-field paths (nudge/delete/cut/copy/
  // duplicate/Style, group-drag, rubber-band) actually operate over. When
  // selectedKeys.length <= 1 every multi-field path collapses to the exact same
  // single-field behavior that existed before this task - see clearSelection/
  // setSingleSelection/toggleMultiSelection below, which every selection site in
  // this file now goes through instead of assigning selectedKey directly.
  let selectedKeys = [];
  let selectedHelpSourceLine = null;
  let showFileProps = false; // file-level (fileKeywords) view of the Properties panel, independent of any record/field/help selection
  let suppressNextExternalUpdate = false;
  let activePulldown = null; // { pulldownRecord, line, col, choiceKey } - simulates a clicked menu-bar choice
  let pulldownCloserAttached = false;
  let compareMode = false;
  // Full overlay: the OLDER (pre-dimmed-backdrop) compare behavior, kept
  // available as an opt-in alongside the dimmed backdrop rather than
  // replaced by it - every checked record (plus whichever is currently
  // selected) rendered together via resolveMultiScreen at full brightness,
  // same as renderCompareBackdrop already does for the dimmed layer, just
  // without the opacity/grayscale and without a separate "primary" record -
  // nothing is individually editable while this is on (see renderFullOverlay).
  let compareFullOverlay = false;
  const compareSelectedRecords = new Set();
  let previewMultipleRows = false;
  // Ruler overlay (Task L11): session-only, matching real SDA's own F14
  // toggle - never persisted, always starts off when the designer reopens.
  let rulerEnabled = false;
  // Crosshair (Task L11 follow-up): same session-only convention as the
  // ruler above - never persisted, always starts off.
  let crosshairEnabled = false;
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
  let activeFileTab = 'general';
  let activeRecordKwTab = 'general';
  const compareModeToggle = document.getElementById('compareModeToggle');
  const compareOverlayRow = document.getElementById('compareOverlayRow');
  const compareOverlayToggle = document.getElementById('compareOverlayToggle');
  const compareRecordList = document.getElementById('compareRecordList');
  const mainHint = document.getElementById('mainHint');
  const previewRowsRow = document.getElementById('previewRowsRow');
  const previewRowsToggle = document.getElementById('previewRowsToggle');
  const rulerToggle = document.getElementById('rulerToggle');
  const rulerWrap = document.getElementById('rulerWrap');
  const rulerCorner = document.getElementById('rulerCorner');
  const rulerCols = document.getElementById('rulerCols');
  const rulerRows = document.getElementById('rulerRows');
  const crosshairToggle = document.getElementById('crosshairToggle');
  const crosshairV = document.getElementById('crosshairV');
  const crosshairH = document.getElementById('crosshairH');
  const crosshairReadout = document.getElementById('crosshairReadout');
  const sizeSelectRow = document.getElementById('sizeSelectRow');
  const sizeSelect = document.getElementById('sizeSelect');
  const sizeBoundsWarning = document.getElementById('sizeBoundsWarning');
  const overlapWarning = document.getElementById('overlapWarning');
  const fileAttrsBtn = document.getElementById('fileAttrsBtn');
  const fkeyLegendEl = document.getElementById('fkeyLegend');
  const newRecordToggleBtn = document.getElementById('newRecordToggleBtn');
  const newRecordForm = document.getElementById('newRecordForm');
  const newRecordName = document.getElementById('newRecordName');
  const newRecordBtn = document.getElementById('newRecordBtn');
  const newRecordError = document.getElementById('newRecordError');
  const newRecordType = document.getElementById('newRecordType');
  const newRecordSflctlRow = document.getElementById('newRecordSflctlRow');
  const newRecordSflctlLabel = document.getElementById('newRecordSflctlLabel');
  const newRecordSflctlName = document.getElementById('newRecordSflctlName');
  const newRecordWindowRow = document.getElementById('newRecordWindowRow');
  const newRecordWindowSelect = document.getElementById('newRecordWindowSelect');
  const newRecordSflmsgRow = document.getElementById('newRecordSflmsgRow');
  const newRecordSflmsgLine = document.getElementById('newRecordSflmsgLine');
  const newRecordSflmsg276 = document.getElementById('newRecordSflmsg276');
  const newRecordSflmsgKeyName = document.getElementById('newRecordSflmsgKeyName');
  const newRecordSflmsgQueueName = document.getElementById('newRecordSflmsgQueueName');

  // Populate the Type picker with the real SDA record-type set (see
  // WebviewClientHelpers.RECORD_TYPES) rather than hardcoding <option>
  // markup in the HTML template above.
  newRecordType.innerHTML = WebviewClientHelpers.RECORD_TYPES.map(
    (t) => '<option value="' + t.value + '">' + t.label + '</option>'
  ).join('');

  // The Type picker + dependent-record controls (SFLCTL name / geometry)
  // only make sense once someone has actually asked to add a record - see
  // newRecordToggleBtn below. Collapsed by default so they don't crowd the
  // panel for the common case of just switching which existing record is
  // being edited.
  let addRecordMode = false;
  function setAddRecordMode(on) {
    addRecordMode = on;
    newRecordForm.classList.toggle('hidden', !on);
    newRecordToggleBtn.classList.toggle('active', on);
    newRecordToggleBtn.textContent = on ? '\u2212 Cancel' : '+ Add record';
    if (!on) {
      newRecordError.textContent = '';
      newRecordName.value = '';
      newRecordSflctlName.value = '';
      newRecordSflmsgLine.value = '24';
      newRecordSflmsg276.checked = false;
      newRecordSflmsgKeyName.value = 'MSGKEY';
      newRecordSflmsgQueueName.value = 'PGMQ';
      newRecordType.value = 'RECORD';
      rebuildNewRecordDepOptions();
    }
  }
  newRecordToggleBtn.addEventListener('click', () => setAddRecordMode(!addRecordMode));

  // Left/right side-panel hide controls - collapsing either one frees up
  // horizontal space for the screen preview on wide-but-short layouts (a
  // 27x132 *DS4 display is wider than either panel really needs to be
  // permanently docked at). Session-only (not persisted across reopens);
  // collapsing just shrinks the grid column to the toggle button's own
  // width and hides everything else in that panel via .panel-body.
  const leftPanelToggle = document.getElementById('leftPanelToggle');
  const rightPanelToggle = document.getElementById('rightPanelToggle');
  const asideEl = document.querySelector('aside');
  const propsPanelEl = document.getElementById('propsPanel');
  let leftPanelCollapsed = false;
  let rightPanelCollapsed = false;
  function applyPanelCollapse() {
    asideEl.classList.toggle('panel-collapsed', leftPanelCollapsed);
    propsPanelEl.classList.toggle('panel-collapsed', rightPanelCollapsed);
    document.body.style.gridTemplateColumns =
      (leftPanelCollapsed ? '28px' : '240px') + ' 1fr ' + (rightPanelCollapsed ? '28px' : '300px');
    leftPanelToggle.textContent = leftPanelCollapsed ? '\u25B6' : '\u25C0 Hide panel';
    leftPanelToggle.title = leftPanelCollapsed ? 'Show record/field panel' : 'Hide this panel';
    rightPanelToggle.textContent = rightPanelCollapsed ? '\u25C0' : 'Hide panel \u25B6';
    rightPanelToggle.title = rightPanelCollapsed ? 'Show properties panel' : 'Hide this panel';
  }
  leftPanelToggle.addEventListener('click', () => {
    leftPanelCollapsed = !leftPanelCollapsed;
    applyPanelCollapse();
  });
  rightPanelToggle.addEventListener('click', () => {
    rightPanelCollapsed = !rightPanelCollapsed;
    applyPanelCollapse();
  });
  applyPanelCollapse();

  fileAttrsBtn.addEventListener('click', () => {
    showFileProps = true;
    clearSelection();
    selectedHelpSourceLine = null;
    renderProps(recordSelect.value);
  });

  // Task L8 - "Compile Display File (CRTDSPF)" - mirrors the Menu designer's
  // own "Compile Menu (CRTMNU)" button/message pair (buildMenuWebviewTemplate.js's
  // compileBtn/'compileMenu'), just for a plain DSPF member instead of MNUDDS -
  // extension.ts's compileDspf() does the actual work host-side (this webview
  // has no IBM i connection of its own).
  const compileDspfBtn = document.getElementById('compileDspfBtn');
  if (compileDspfBtn) {
    compileDspfBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'compileDspf' });
    });
  }

  // Task L18 - "IBM i: Connected/Not connected/Not installed" badge. The
  // extension host is the only side that can actually check Code for i's
  // connection state (see extension.ts's getCodeForIStatus), so this
  // webview is purely a display for whatever it's told via the
  // 'codeForIStatus' message - sent on 'ready', after every Code-for-i
  // dependent action, and on a cheap poll, all from the host side.
  const codeForIBadge = document.getElementById('codeForIBadge');
  function updateCodeForIBadge(installed, connected) {
    if (!codeForIBadge) return;
    codeForIBadge.classList.remove('connected', 'disconnected', 'unknown');
    if (!installed) {
      codeForIBadge.classList.add('unknown');
      codeForIBadge.textContent = 'IBM i: not installed';
      codeForIBadge.title = 'Code for IBM i extension not found - Compile, Resolve Referenced Field, and Add fields from database file will not work until it is installed.';
    } else if (!connected) {
      codeForIBadge.classList.add('disconnected');
      codeForIBadge.textContent = 'IBM i: not connected';
      codeForIBadge.title = 'Code for IBM i is installed but not connected to a system - Compile, Resolve Referenced Field, and Add fields from database file will not work until you connect.';
    } else {
      codeForIBadge.classList.add('connected');
      codeForIBadge.textContent = 'IBM i: connected';
      codeForIBadge.title = 'Code for IBM i is connected - Compile, Resolve Referenced Field, and Add fields from database file are available.';
    }
  }

  // Task L19 - "Find field" search box: filters every record's fields/
  // constants by name as you type, so a screen with many fields doesn't
  // require scanning the canvas or scrolling the Structure tab's field
  // order list to find one. Deliberately searches the WHOLE model (every
  // record), not just the currently-shown one - the record you're looking
  // for might not be the one currently on screen, which is exactly the
  // case where a visual scan wouldn't have helped anyway.
  const fieldSearchInput = document.getElementById('fieldSearchInput');
  const fieldSearchResults = document.getElementById('fieldSearchResults');
  let fieldSearchMatches = [];
  let fieldSearchActiveIndex = -1;

  function fieldSearchLabel(f) {
    return f.nameType === 'CONSTANT' ? (f.constantValue || '(constant)') : (f.name || '(field)');
  }

  // Builds the flat searchable index fresh on every keystroke (cheap - even
  // a large DSPF source rarely has more than a few hundred fields total,
  // and this only runs while the search box has focus/input) rather than
  // caching it, so a field renamed/added/deleted moments ago is always
  // reflected without a separate invalidation path to keep in sync.
  function findFieldMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    model.records.forEach((rec) => {
      (rec.fields || []).forEach((f) => {
        const label = fieldSearchLabel(f);
        if (label.toLowerCase().indexOf(q) !== -1) {
          out.push({ recordName: rec.name, sourceLine: f.sourceLine, label: label, line: f.location && f.location.line, column: f.location && f.location.column });
        }
      });
    });
    return out;
  }

  function closeFieldSearchResults() {
    fieldSearchResults.classList.add('hidden');
    fieldSearchResults.innerHTML = '';
    fieldSearchMatches = [];
    fieldSearchActiveIndex = -1;
  }

  function renderFieldSearchResults() {
    if (!fieldSearchMatches.length) {
      fieldSearchResults.innerHTML = '<div class="field-search-empty">No matching fields or constants.</div>';
      fieldSearchResults.classList.remove('hidden');
      return;
    }
    const currentRecordName = recordSelect.value;
    fieldSearchResults.innerHTML = fieldSearchMatches.map((m, idx) => {
      const meta = m.recordName === currentRecordName
        ? (m.line != null ? 'Ln ' + m.line + (m.column != null ? '/' + m.column : '') : '')
        : m.recordName + (m.line != null ? ' · Ln ' + m.line : '');
      return '<div class="field-search-row' + (idx === fieldSearchActiveIndex ? ' active' : '') + '" data-idx="' + idx + '">' +
        '<span class="fsr-name">' + DspfEngine.escapeHtml(m.label) + '</span>' +
        '<span class="fsr-meta">' + DspfEngine.escapeHtml(meta) + '</span>' +
        '</div>';
    }).join('');
    fieldSearchResults.classList.remove('hidden');
    fieldSearchResults.querySelectorAll('.field-search-row[data-idx]').forEach((row) => {
      row.addEventListener('mousedown', (e) => {
        // mousedown (not click) fires before the input's own blur handler
        // would otherwise close the dropdown out from under the click.
        e.preventDefault();
        jumpToFieldMatch(fieldSearchMatches[parseInt(row.getAttribute('data-idx'), 10)]);
      });
    });
  }

  // Switches to the match's record if needed, selects the field the same
  // way every other jump-by-sourceLine flow does (setSingleSelection then
  // render, which both re-renders the props panel AND applies the
  // '.selected' canvas highlight - see the forEach in render() that checks
  // selectedKeys), then scrolls/centers it into view - render() rebuilds
  // the canvas DOM from scratch, so the element has to be re-queried AFTER
  // render() runs, not before.
  function jumpToFieldMatch(match) {
    if (!match) return;
    recordSelect.value = match.recordName;
    setSingleSelection(match.sourceLine);
    render();
    const primaryScreenEl = screenOutput.querySelector('.dspf-screen');
    const el = primaryScreenEl && primaryScreenEl.querySelector('.dspf-field[data-source-line="' + match.sourceLine + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center' });
    closeFieldSearchResults();
    fieldSearchInput.value = match.label;
  }

  fieldSearchInput.addEventListener('input', () => {
    fieldSearchMatches = findFieldMatches(fieldSearchInput.value);
    fieldSearchActiveIndex = fieldSearchMatches.length ? 0 : -1;
    if (fieldSearchInput.value.trim()) renderFieldSearchResults();
    else closeFieldSearchResults();
  });
  fieldSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFieldSearchResults();
      fieldSearchInput.blur();
    } else if (e.key === 'ArrowDown' && fieldSearchMatches.length) {
      e.preventDefault();
      fieldSearchActiveIndex = (fieldSearchActiveIndex + 1) % fieldSearchMatches.length;
      renderFieldSearchResults();
    } else if (e.key === 'ArrowUp' && fieldSearchMatches.length) {
      e.preventDefault();
      fieldSearchActiveIndex = (fieldSearchActiveIndex - 1 + fieldSearchMatches.length) % fieldSearchMatches.length;
      renderFieldSearchResults();
    } else if (e.key === 'Enter' && fieldSearchMatches.length) {
      e.preventDefault();
      jumpToFieldMatch(fieldSearchMatches[fieldSearchActiveIndex >= 0 ? fieldSearchActiveIndex : 0]);
    }
  });
  fieldSearchInput.addEventListener('blur', () => {
    // Deferred so a result row's own mousedown handler (which calls
    // preventDefault, but blur can still fire first in some browsers) gets
    // a chance to run its jump before the dropdown is torn down.
    setTimeout(closeFieldSearchResults, 150);
  });

  // "Save" - every edit already lands in the document's live buffer via
  // 'applyEdit' (marking it dirty, same as typing would), but nothing
  // actually writes that buffer to disk until VS Code's own Ctrl+S/Auto
  // Save fires - not obvious from inside a webview panel, which doesn't
  // show the editor tab's own dirty-dot. handleSaveDocument in extension.ts
  // does the actual document.save() host-side, same isDirty-guarded shape
  // "Compile"'s own save-before-compile step already uses.
  const saveDocBtn = document.getElementById('saveDocBtn');
  saveDocBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'saveDocument' });
  });

  // Suggestion C - dirty-state indicator on the Save button itself. The
  // extension host pushes a 'dirtyState' message (see postDirtyState in
  // extension.ts) on every document change AND on save, so this stays
  // correct whether the change/save came from THIS button, VS Code's own
  // Ctrl+S, or an edit made outside the designer entirely. Text swap
  // (rather than just a CSS dot) keeps it legible without needing a
  // legend, and .save-btn-dirty's own pulse animation (CSS) draws the eye
  // without being alarming - this is routine, not an error state.
  function updateSaveButtonDirtyState(isDirty) {
    saveDocBtn.classList.toggle('save-btn-dirty', !!isDirty);
    saveDocBtn.textContent = isDirty ? '\u{1F4BE} Save (unsaved changes)' : '\u{1F4BE} Save';
  }

  // Creates a brand-new, empty record format (see DspfWriter.insertRecord's
  // own doc comment for placement rules) and immediately selects it, same
  // "land somewhere sensible, then let the user take it from there" spirit
  // as commitCopy selecting a freshly-copied field. A name is required
  // (unlike a field/constant copy, DDS record formats always have one) and
  // must not already be used by another record in the file - checked here
  // client-side against the CURRENT model rather than relying on the parser
  // to reject a genuine duplicate R-line after the fact.
  // Builds the type-defining keyword(s) for the "+ Add record" wizard's
  // chosen TYPE, matching real SDA's own record types (see
  // WebviewClientHelpers.RECORD_TYPES) and their actual DDS keyword
  // combinations (verified against IBM's own DDS reference/examples):
  //   RECORD           -> no keyword
  //   USRDFN           -> USRDFN (parameter left blank - which field
  //                       carries the formatted data is set afterward via
  //                       the Keywords tab, same as any other keyword
  //                       parameter)
  //   SFL/SFLMSG/
  //   WDWSFL/PDNSFL     -> SFL on THIS record, plus an auto-created SFLCTL
  //                       companion record (see isSflFamilyRecordType) -
  //                       SFLCTL(this-record-name) always, plus
  //                       WINDOW(...) too for WDWSFL or PULLDOWN too for
  //                       PDNSFL (real SDA's own "Window subfile control"/
  //                       "Pull-down subfile control" records put BOTH
  //                       keywords on the control record - see e.g. IBM's
  //                       own worked example: SFLCTL(SFL1) ...
  //                       WINDOW(2 22 16 35)). SFLMSG additionally adds
  //                       SFLMSGRCD(line) on the main record plus TWO
  //                       synthesized hidden fields - a message-key field
  //                       (SFLMSGKEY) and a program-queue field
  //                       (SFLPGMQ) - see IBM's own "Example: A message
  //                       subfile using DDS"; sflmsgOpts carries the line
  //                       number/field names/276-byte choice gathered from
  //                       newRecordSflmsgRow.
  //   WINDOW           -> WINDOW(geometry-or-inherited-record-name)
  //   PULDWN           -> PULLDOWN (plain pull-down menu, no dependent)
  //   MNUBAR           -> MNUBAR (menu bar, no dependent)
  // Returns null if a required dependent (the SFLCTL companion's name)
  // isn't filled in yet - caller shows an error and doesn't commit.
  // extraFields is always an array (empty except for SFLMSG), each
  // { name, usage, keywords } ready to hand to DspfWriter.insertField once
  // the new record itself exists.
  // buildTypedRecordPlan/missingDependentMessage now live in
  // webviewClientHelpers.js (WebviewClientHelpers global, already loaded
  // before this script - see webviewTemplate.ts) so the extension host's
  // "Create New Display File" record-type picker can share the exact same
  // decision table instead of a second hand-maintained copy drifting from
  // this one.
  const buildTypedRecordPlan = WebviewClientHelpers.buildTypedRecordPlan;
  const missingDependentMessage = WebviewClientHelpers.missingDependentMessage;

  newRecordBtn.addEventListener('click', () => {
    const name = newRecordName.value.trim().toUpperCase();
    const type = newRecordType.value;
    const sflctlName = newRecordSflctlName.value.trim().toUpperCase();
    const windowDepValue = newRecordWindowSelect.value;
    newRecordError.textContent = '';
    if (!name) { newRecordError.textContent = 'Enter a name for the new record format.'; return; }
    if (!WebviewClientHelpers.isValidDdsName(name)) { newRecordError.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).'; return; }
    if (model.records.some((r) => r.name === name)) { newRecordError.textContent = 'A record format named "' + name + '" already exists in this file.'; return; }

    let sflmsgOpts = null;
    if (type === 'SFLMSG') {
      const lineNo = parseInt(newRecordSflmsgLine.value, 10);
      if (!lineNo || lineNo < 1 || lineNo > 27) { newRecordError.textContent = 'Enter a line number from 1 to 27 for the first message.'; return; }
      const keyName = newRecordSflmsgKeyName.value.trim().toUpperCase();
      const queueName = newRecordSflmsgQueueName.value.trim().toUpperCase();
      if (!keyName || !WebviewClientHelpers.isValidDdsName(keyName)) { newRecordError.textContent = 'Enter a valid name for the message key field.'; return; }
      if (!queueName || !WebviewClientHelpers.isValidDdsName(queueName)) { newRecordError.textContent = 'Enter a valid name for the program queue field.'; return; }
      if (keyName === queueName) { newRecordError.textContent = 'The message key and program queue fields need different names.'; return; }
      sflmsgOpts = { line: lineNo, keyName: keyName, queueName: queueName, use276: newRecordSflmsg276.checked };
    }

    const plan = buildTypedRecordPlan(type, name, sflctlName, windowDepValue, sflmsgOpts);
    if (!plan) { newRecordError.textContent = missingDependentMessage(type); return; }

    if (plan.dependent) {
      if (!WebviewClientHelpers.isValidDdsName(plan.dependent.name)) { newRecordError.textContent = 'The SFLCTL record name is not a valid DDS name (1-10 chars, starts with a letter or $#@).'; return; }
      if (plan.dependent.name === name) { newRecordError.textContent = 'The SFLCTL record needs a different name than the subfile record itself.'; return; }
      if (model.records.some((r) => r.name === plan.dependent.name)) { newRecordError.textContent = 'A record format named "' + plan.dependent.name + '" already exists in this file.'; return; }
    }

    commitSourceChange(
      (lines) => {
        let newLines = plan.dependent
          ? DspfWriter.insertTypedRecordWithDependent(model, lines, { name: name, keywords: plan.mainKeywords }, { name: plan.dependent.name, keywords: plan.dependent.keywords })
          : DspfWriter.insertTypedRecord(model, lines, { name: name, keywords: plan.mainKeywords }, null);
        // SFLMSG's two synthesized hidden fields (message key / program
        // queue) insert ONE AT A TIME with a reparse between each: the
        // freshly created record doesn't exist in 'model' yet, and after
        // the FIRST field lands, a stale (still-zero-fields) record
        // reference would place the second field back at the same spot
        // instead of after the first - reparsing prevents forming any
        // assumption about a record this transform itself just created.
        (plan.extraFields || []).forEach((spec) => {
          const midModel = DspfParser.parseDspf(newLines.join('\\n'));
          const rec = midModel.records.find((r) => r.name === name);
          if (!rec) return;
          newLines = DspfWriter.insertField(rec, newLines, {
            nameType: 'FIELD',
            name: spec.name,
            location: { line: null, column: null },
            usage: spec.usage,
            keywords: spec.keywords,
          });
        });
        return newLines;
      },
      () => {
        clearSelection();
        selectedHelpSourceLine = null;
        showFileProps = false;
        setAddRecordMode(false); // collapses the wizard back down and clears its fields
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
    clearSelection();
    selectedHelpSourceLine = null;
    showFileProps = false;
    render();
  });

  sizeSelect.addEventListener('change', () => {
    selectedSizeIndex = parseInt(sizeSelect.value, 10) || 0;
    clearSelection();
    selectedHelpSourceLine = null;
    showFileProps = false;
    render();
  });

  compareModeToggle.addEventListener('change', () => {
    compareMode = compareModeToggle.checked;
    compareRecordList.classList.toggle('hidden', !compareMode);
    compareOverlayRow.classList.toggle('hidden', !compareMode);
    render();
  });

  compareOverlayToggle.addEventListener('change', () => {
    compareFullOverlay = compareOverlayToggle.checked;
    render();
  });

  rulerToggle.addEventListener('change', () => {
    rulerEnabled = rulerToggle.checked;
    // No re-resolve needed - the ruler is purely derived from lastScreen's
    // own lines/columns, same size/shape math render() already did.
    updateRuler(lastScreen);
  });

  crosshairToggle.addEventListener('change', () => {
    crosshairEnabled = crosshairToggle.checked;
    if (!crosshairEnabled) hideCrosshair();
  });

  // Crosshair (Task L11 follow-up) - listens on rulerWrap, NOT screenOutput,
  // because screenOutput's own innerHTML (and therefore .dspf-screen) gets
  // fully replaced on every render() call; rulerWrap is the stable outer
  // grid container that never gets torn down, so its listener survives
  // across re-renders the same way updateRuler's own toggle-driven
  // visibility does. .dspf-screen is looked up fresh on every move (same
  // "always re-derive, never cache a stale element reference" pattern
  // gridMetrics() itself already uses for drag).
  rulerWrap.addEventListener('mousemove', (e) => {
    if (!crosshairEnabled) return;
    const screenEl = screenOutput.querySelector('.dspf-screen');
    if (!screenEl) { hideCrosshair(); return; }
    const { rect, colWidth, rowHeight } = gridMetrics();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      hideCrosshair();
      return;
    }
    // Same column/row math startDrag's own onMove uses, clamped the same
    // way (1-based minimum) - deliberately NOT clamped to the screen's own
    // max lines/columns, so hovering right at the screen's bottom/right
    // edge still reads the true last row/column instead of silently
    // stopping short of it.
    const col = Math.max(1, Math.round((e.clientX - rect.left) / colWidth) + 1);
    const line = Math.max(1, Math.round((e.clientY - rect.top) / rowHeight) + 1);
    // rect is viewport-relative (getBoundingClientRect), same coordinate
    // space wrapRect is in - the crosshair lines are positioned relative to
    // rulerWrap itself (their containing block, since rulerWrap has
    // position:relative - see its own CSS comment), so translate through
    // wrapRect rather than assuming .dspf-screen sits flush at rulerWrap's
    // own top-left corner (it doesn't - the column/row ruler occupy the
    // rest of that grid).
    const wrapRect = rulerWrap.getBoundingClientRect();
    const x = rect.left - wrapRect.left + (col - 1) * colWidth + colWidth / 2;
    const y = rect.top - wrapRect.top + (line - 1) * rowHeight + rowHeight / 2;
    crosshairV.style.left = x + 'px';
    crosshairH.style.top = y + 'px';
    crosshairV.classList.remove('hidden');
    crosshairH.classList.remove('hidden');
    crosshairReadout.textContent = 'Row ' + line + ', Column ' + col;
    crosshairReadout.classList.remove('hidden');
  });
  rulerWrap.addEventListener('mouseleave', hideCrosshair);

  function hideCrosshair() {
    crosshairV.classList.add('hidden');
    crosshairH.classList.add('hidden');
    crosshairReadout.classList.add('hidden');
  }

  // Clicking the screen background (not a field) deselects, returning the
  // properties panel to record-level editing. Attached once since screenOutput
  // itself persists across re-renders (only its innerHTML is replaced).
  screenOutput.addEventListener('click', (e) => {
    if (e.target === screenOutput || (e.target.classList && e.target.classList.contains('dspf-screen'))) {
      clearSelection();
      selectedHelpSourceLine = null;
      showFileProps = false;
      render();
    }
  });

  // Task L10: rubber-band drag-select - a mousedown on empty canvas that
  // MOVES becomes a selection rectangle (every field/constant whose rendered
  // bounds intersect it is added to the multi-select on mouseup); a
  // mousedown that never moves falls through unchanged to the plain
  // background-click handler above, which still clears the selection. Held
  // Shift/Ctrl/Cmd ADDS to whatever's already selected (same modifier
  // convention as the per-field click handler's own toggle) instead of
  // replacing it, so a rubber-band pass can be combined with shift-clicking
  // individual fields to build up one block selection. Attached once
  // (screenOutput persists across renders, same as the click handler above),
  // reading the live DOM at drag time rather than any per-render field list,
  // so it stays correct across re-renders mid-drag.
  screenOutput.addEventListener('mousedown', (e) => {
    if (placementMode || pendingPlacement || dragState) return;
    if (!(e.target === screenOutput || (e.target.classList && e.target.classList.contains('dspf-screen')))) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    let box = null;

    function onMove(ev) {
      if (!moved && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) {
        moved = true;
        box = document.createElement('div');
        box.className = 'dspf-rubber-band';
        document.body.appendChild(box);
      }
      if (!moved) return;
      const left = Math.min(startX, ev.clientX), top = Math.min(startY, ev.clientY);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = Math.abs(ev.clientX - startX) + 'px';
      box.style.height = Math.abs(ev.clientY - startY) + 'px';
    }
    function onUp(ev) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (box) box.remove();
      if (moved) {
        const left = Math.min(startX, ev.clientX), top = Math.min(startY, ev.clientY);
        const right = Math.max(startX, ev.clientX), bottom = Math.max(startY, ev.clientY);
        const primaryScreenEl = screenOutput.querySelector('.dspf-screen');
        const hitLines = [];
        if (primaryScreenEl) {
          primaryScreenEl.querySelectorAll('.dspf-field[data-source-line]').forEach((el) => {
            const r = el.getBoundingClientRect();
            const intersects = r.left < right && r.right > left && r.top < bottom && r.bottom > top;
            if (!intersects) return;
            const sl = parseInt(el.getAttribute('data-source-line'), 10);
            if (!isNaN(sl)) hitLines.push(sl);
          });
        }
        if (hitLines.length > 0) {
          if (!additive) clearSelection();
          addToMultiSelection(hitLines);
          selectedHelpSourceLine = null;
          showFileProps = false;
          render();
        } else if (!additive) {
          // An empty drag over blank canvas behaves like the plain
          // background click above - deselect everything.
          clearSelection();
          selectedHelpSourceLine = null;
          showFileProps = false;
          render();
        }
      }
      // moved === false: let the browser's own subsequent 'click' event fall
      // through to the plain background-click handler above unchanged.
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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

  document.getElementById('addFromDbBtn').addEventListener('click', () => {
    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    if (!recordName) return;
    showDatabaseFieldsPicker(recordName);
  });

  // Task L14 - "Add fields from database file" (real SDA's F10/Database
  // key). A two-step overlay: list the target file's fields (round-trip to
  // the extension host, which owns the actual Code for i network call - see
  // handleListDatabaseFields in extension.ts), then check the ones wanted
  // and commit. Reuses .confirm-overlay's own backdrop/centering (see this
  // file's own .dbfields-dialog CSS comment for why it's a separate dialog
  // class from .confirm-dialog). The result callback is stashed directly on
  // the overlay element (overlay.__onDatabaseFieldsResult) rather than in a
  // module-level variable, so a stray 'databaseFieldsResult' message
  // arriving after the dialog's already been closed/replaced has nothing to
  // call - the listener below only acts if a live overlay with that hook is
  // still in the DOM.
  function showDatabaseFieldsPicker(recordName) {
    const existing = document.querySelector('.dbfields-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay dbfields-overlay';
    overlay.innerHTML =
      '<div class="confirm-dialog dbfields-dialog">' +
      '<div class="dbfields-dialog-title">Add fields from database file</div>' +
      '<div class="dbfields-row"><input type="text" id="dbf-library" placeholder="Library (optional)" maxlength="10" /><input type="text" id="dbf-file" placeholder="File" maxlength="10" /></div>' +
      '<button class="secondary" id="dbf-list-btn" style="width:100%;">List fields</button>' +
      '<div class="dbfields-status hidden" id="dbf-status"></div>' +
      '<div class="dbfields-error hidden" id="dbf-error"></div>' +
      '<div class="dbfields-list hidden" id="dbf-formats"></div>' +
      '<div class="dbfields-list hidden" id="dbf-list"></div>' +
      '<label class="compare-toggle hidden" id="dbf-selectall-row"><input type="checkbox" id="dbf-selectall" /> Select all</label>' +
      '<div class="confirm-dialog-actions" style="margin-top:12px;">' +
      '<button class="secondary" id="dbf-cancel">Cancel</button>' +
      '<button id="dbf-add-btn" class="hidden" disabled>Add fields</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#dbf-cancel').addEventListener('click', () => overlay.remove());

    const libraryInput = overlay.querySelector('#dbf-library');
    const fileInput = overlay.querySelector('#dbf-file');
    const listBtn = overlay.querySelector('#dbf-list-btn');
    const statusEl = overlay.querySelector('#dbf-status');
    const errorEl = overlay.querySelector('#dbf-error');
    const formatsEl = overlay.querySelector('#dbf-formats');
    const listEl = overlay.querySelector('#dbf-list');
    const selectAllRow = overlay.querySelector('#dbf-selectall-row');
    const selectAllCb = overlay.querySelector('#dbf-selectall');
    const addBtn = overlay.querySelector('#dbf-add-btn');

    // The last-listed fields, WITH their full attributes (length/dataType/
    // decimalPositions/text) - kept here so "Add fields" can send those same
    // already-fetched objects straight back to the host instead of a second
    // DSPFFD round-trip for data the person already saw in this same list.
    let currentFields = [];
    // Set once a specific format is picked (either because the file only
    // had one to begin with, or the person picked one from dbf-formats
    // below) - included on every subsequent listDatabaseFields request so
    // a re-list (e.g. after fixing a typo) doesn't lose that choice.
    let recordFormat = null;

    function requestFieldList() {
      const file = fileInput.value.trim().toUpperCase();
      if (!file) {
        errorEl.textContent = 'Enter a file name.';
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');
      formatsEl.classList.add('hidden');
      listEl.classList.add('hidden');
      selectAllRow.classList.add('hidden');
      addBtn.classList.add('hidden');
      statusEl.textContent = 'Listing fields...';
      statusEl.classList.remove('hidden');
      vscode.postMessage({ type: 'listDatabaseFields', library: libraryInput.value.trim().toUpperCase() || null, file: file, recordFormat: recordFormat });
    }

    listBtn.addEventListener('click', () => { recordFormat = null; requestFieldList(); });

    overlay.__onDatabaseFieldsResult = (msg) => {
      statusEl.classList.add('hidden');
      if (msg.error) {
        errorEl.textContent = msg.error;
        errorEl.classList.remove('hidden');
        return;
      }
      // Task L14 follow-up - a multi-format file (a logical file with more
      // than one record format) has its own separate WHFLDO field-order
      // sequence PER format, so fields can't be listed until ONE format is
      // chosen - see fetchDatabaseFileFields' own doc comment in
      // extension.ts. Render each format name as its own clickable row,
      // reusing the same .dbfields-list-row styling the field checkboxes
      // use below, and re-request the list with that format once picked.
      if (msg.formats) {
        formatsEl.innerHTML =
          '<div class="dbfields-status" style="margin:4px 8px;">' + msg.formats.length + ' record formats found - pick one:</div>' +
          msg.formats.map((f) => '<div class="dbfields-list-row" data-format="' + DspfEngine.escapeHtml(f) + '"><span class="fname">' + DspfEngine.escapeHtml(f) + '</span></div>').join('');
        formatsEl.classList.remove('hidden');
        formatsEl.querySelectorAll('[data-format]').forEach((row) => {
          row.addEventListener('click', () => { recordFormat = row.getAttribute('data-format'); requestFieldList(); });
        });
        return;
      }
      currentFields = msg.fields;
      formatsEl.innerHTML = '';
      formatsEl.classList.add('hidden');
      listEl.innerHTML = currentFields.map((f, i) =>
        '<label class="dbfields-list-row"><input type="checkbox" class="dbf-field-cb" data-idx="' + i + '" checked />' +
        '<span class="fname">' + DspfEngine.escapeHtml(f.name) + '</span>' +
        '<span class="fattrs">' + DspfEngine.escapeHtml((f.dataType || 'A') + String(f.length) + (f.decimalPositions != null ? ',' + f.decimalPositions : '')) + '</span>' +
        '<span class="ftext">' + DspfEngine.escapeHtml(f.text) + '</span></label>'
      ).join('');
      listEl.classList.remove('hidden');
      selectAllRow.classList.remove('hidden');
      selectAllCb.checked = true;
      addBtn.classList.remove('hidden');
      addBtn.disabled = currentFields.length === 0;
      if (msg.recordFormat) {
        statusEl.textContent = 'Record format: ' + msg.recordFormat;
        statusEl.classList.remove('hidden');
      }
    };

    selectAllCb.addEventListener('change', () => {
      listEl.querySelectorAll('.dbf-field-cb').forEach((cb) => { cb.checked = selectAllCb.checked; });
    });

    addBtn.addEventListener('click', () => {
      const selected = [];
      listEl.querySelectorAll('.dbf-field-cb').forEach((cb) => {
        if (cb.checked) selected.push(currentFields[parseInt(cb.getAttribute('data-idx'), 10)]);
      });
      if (selected.length === 0) return;
      vscode.postMessage({
        type: 'addFieldsFromDatabase',
        recordName: recordName,
        library: libraryInput.value.trim().toUpperCase() || null,
        file: fileInput.value.trim().toUpperCase(),
        fields: selected,
      });
      overlay.remove();
    });
  }

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

  /** Indicators relevant to the CURRENTLY PREVIEWED context only - the primary
   *  record, plus (only when THAT primary record is the one actually drawing
   *  the other side of a subfile pairing on screen) the other side's own
   *  indicators too, plus the active pulldown's record if one is open.
   *  Previously this collected indicators from every record in the whole
   *  file, which buried the handful actually relevant to what's on screen
   *  under everything else in the file.
   *
   *  A subfile pairing is asymmetric: previewing SFLCTL draws the paired
   *  SFL record's fields too (see resolveSubfilePreview's repeated preview
   *  rows), so an indicator that ONLY conditions a field on the SFL side is
   *  still directly relevant while looking at SFLCTL - toggling it visibly
   *  changes what's on screen, so it needs to be toggleable from here.
   *  Previewing the SFL record on its own, though, never draws the SFLCTL
   *  record's own fields at all (resolveSubfilePreview only ever produces
   *  output for the SFLCTL side - see its own doc comment), so an
   *  indicator that only conditions something on the SFLCTL side has NO
   *  visible effect on an SFL-alone preview. Merging it in anyway (the old
   *  behavior) showed indicators here that did nothing when toggled from
   *  this screen, and mixed one record format's indicators into another's
   *  list, which is what this now avoids. */
  function indicatorsForContext(recordName) {
    const set = new Set();
    const collect = (conds) => (conds || []).forEach((g) => g.indicators.forEach((i) => set.add(i.number)));
    const collectRecord = (rec) => {
      if (!rec) return;
      collect(rec.conditions);
      // Record-level keywords (SFL, SFLCTL, WINDOW, ALARM, ERRMSG, etc.) can each
      // carry their own conditioning indicator(s) independent of any field - these
      // were previously skipped entirely, so an indicator ONLY used to condition a
      // record-level keyword never showed up here to toggle. See also help entries
      // below, which have the same field-like shape (conditions + keywords) but
      // live in their own array rather than rec.fields.
      rec.keywords.forEach((k) => collect(k.conditions));
      rec.fields.forEach((f) => { collect(f.conditions); f.keywords.forEach((k) => collect(k.conditions)); });
      (rec.helpEntries || []).forEach((f) => { collect(f.conditions); f.keywords.forEach((k) => collect(k.conditions)); });
    };

    collectRecord(model.records.find((r) => r.name === recordName));

    const sflInfo = DspfEngine.findSflPairing(model, recordName);
    if (sflInfo && sflInfo.sflCtlRecord && sflInfo.sflCtlRecord.name === recordName) {
      // Currently viewing the SFLCTL side - it draws the SFL record's own
      // fields too, so that record's indicators belong in this list.
      collectRecord(sflInfo.sflRecord);
    }
    // Currently viewing the SFL side on its own: the paired SFLCTL record's
    // fields never render here, so its indicators are correctly left out.

    if (activePulldown && activePulldown.pulldownRecord) {
      collectRecord(model.records.find((r) => r.name === activePulldown.pulldownRecord));
    }

    return Array.from(set).sort();
  }

  function rebuildRecordSelect() {
    WebviewClientHelpers.rebuildRecordSelect(recordSelect, model.records);
  }

  /**
   * Syncs the "+ Add record" record-TYPE picker's dependent-record
   * controls to the currently-selected type and the LIVE model: the
   * SFLCTL-name text row for SFL-family types (WebviewClientHelpers.
   * isSflFamilyRecordType), and the "inherit geometry from" dropdown for
   * WINDOW/WDWSFL (see WebviewClientHelpers.recordTypeDependentInfo's own
   * doc comment for what qualifies as a geometry candidate). Re-run on
   * every type change and every render() - a record created via the raw
   * Keywords tab could add/remove a WINDOW keyword that changes which
   * records qualify as geometry candidates, same "always rebuild off the
   * live model" spirit as rebuildRecordSelect.
   */
  function rebuildNewRecordDepOptions() {
    const type = newRecordType.value;
    const isSflFamily = WebviewClientHelpers.isSflFamilyRecordType(type);
    newRecordSflctlRow.classList.toggle('hidden', !isSflFamily);
    if (isSflFamily) {
      newRecordSflctlLabel.textContent = type === 'SFLMSG'
        ? 'Message subfile control (SFLCTL) record name'
        : 'Subfile control (SFLCTL) record name';
    }

    const win = WebviewClientHelpers.recordTypeDependentInfo(type, model.records);
    if (!win) {
      newRecordWindowRow.classList.add('hidden');
      newRecordWindowSelect.innerHTML = '';
    } else {
      newRecordWindowRow.classList.remove('hidden');
      const prevWin = newRecordWindowSelect.value;
      const winOptionsHtml = win.candidates.map((n) => '<option value="' + n + '">' + n + '</option>').join('');
      newRecordWindowSelect.innerHTML = '<option value="">(new geometry)</option>' + winOptionsHtml;
      if (win.candidates.some((n) => n === prevWin)) newRecordWindowSelect.value = prevWin;
    }

    newRecordSflmsgRow.classList.toggle('hidden', type !== 'SFLMSG');
  }

  newRecordType.addEventListener('change', rebuildNewRecordDepOptions);
  rebuildNewRecordDepOptions(); // initial sync for the default type (RECORD)

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

  /**
   * Suggestion A - real DDS silently drops a field that overlaps another
   * one already claiming the same screen cells (see resolveScreen's own
   * "Position-sequence overlap resolution" comment in dspfEngine.js) -
   * dragging or placing a field on top of another has always just made it
   * mysteriously vanish from the preview with no explanation. The 'screen'
   * argument is the SAME already-resolved object render() just built (its
   * new 'overlaps' array, populated by that same resolution pass - not a
   * second resolve call), so this never disagrees with what's actually
   * shown. Pass null to hide it (error/no-record-formats states, where
   * there's no resolved screen to check).
   */
  function updateOverlapWarning(screen) {
    const overlaps = (screen && screen.overlaps) || [];
    if (overlaps.length === 0) {
      overlapWarning.classList.add('hidden');
      overlapWarning.textContent = '';
      return;
    }
    overlapWarning.classList.remove('hidden');
    const lines = overlaps.map((o) => '\\u2022 ' + o.field + ' (line ' + o.line + ', col ' + o.column + ') is hidden behind ' + o.blockedBy + ' - they occupy the same screen cells.');
    overlapWarning.textContent =
      overlaps.length + (overlaps.length === 1 ? ' field is' : ' fields are') +
      " hidden by overlapping another field (DDS shows only the first one placed):\\n" + lines.join('\\n');
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
  // Ruler overlay (Task L11) - purely derived from whichever screen was just
  // resolved (screen.lines/screen.columns), independent of DspfWriter/model;
  // called after every place render()/renderFullOverlay() sets screenOutput's
  // content, and again directly from the toggle's own listener (no need to
  // re-resolve the screen just to flip visibility). No-op (hides) when there's
  // no screen to measure against - the error/no-records early-return paths.
  function updateRuler(screen) {
    const show = rulerEnabled && screen && !screen.error;
    rulerCorner.classList.toggle('hidden', !show);
    rulerCols.classList.toggle('hidden', !show);
    rulerRows.classList.toggle('hidden', !show);
    if (!show) return;
    rulerCols.innerHTML = DspfEngine.renderRulerColumnsHtml(screen.columns);
    rulerRows.innerHTML = DspfEngine.renderRulerRowsHtml(screen.lines);
  }

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

  // Full overlay compare (the older, pre-dimmed-backdrop behavior - see
  // compareFullOverlay's own doc comment above): every checked record PLUS
  // whichever is currently selected in the dropdown, combined via
  // resolveMultiScreen and rendered as the ONLY content of screenOutput -
  // no primary/backdrop distinction, no dimming, and (matching the
  // original's own design) no click/drag/select wiring at all: editing an
  // arbitrary combination of independently-defined records is ambiguous
  // (which record would an edit belong to?), so render() returns right
  // after this rather than falling through to the interactivity wiring
  // block below, the same way it already does for the empty "no record
  // formats found" case.
  function renderFullOverlay(recordName) {
    const included = [recordName].concat(
      Array.from(compareSelectedRecords).filter((n) => n !== recordName && model.records.some((r) => r.name === n))
    );
    fkeyLegendEl.innerHTML = '';
    const screen = DspfEngine.resolveMultiScreen(model, included, active, selectedSizeIndex);
    lastScreen = screen;
    mainHint.classList.add('hint-readonly');
    mainHint.textContent = included.length > 1
      ? 'Comparing ' + included.join(', ') + ' overlaid together at full brightness, read-only - switch off "Full overlay" or "Compare" to edit again.'
      : 'Check another record above to overlay it here at full brightness, read-only.';
    screenOutput.innerHTML = DspfEngine.renderScreenHtml(screen);
    updateRuler(screen);
    clearSelection();
    selectedHelpSourceLine = null;
    showFileProps = false;
    propsBreadcrumb.innerHTML = '';
    propsBody.innerHTML = '<div class="empty-state">Full overlay compare is read-only - nothing here is editable while it is on.</div>';
  }

  function render() {
    hideCrosshair();
    mainHint.classList.remove('hint-readonly');
    mainHint.textContent = 'Click a field to select it. Drag to move. Changes are written straight back into the open document.';

    rebuildRecordSelect();
    rebuildSizeSelect();
    rebuildNewRecordDepOptions();

    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    if (!recordName) { indicatorList.innerHTML = ''; fkeyLegendEl.innerHTML = ''; screenOutput.innerHTML = '<div class="empty-state">No record formats found.</div>'; updateRuler(null); updateOverlapWarning(null); renderProps(null); return; }
    recordSelect.value = recordName;
    rebuildIndicatorList(recordName);
    updateSizeBoundsWarning(recordName);
    renderCompareRecordList(recordName);

    if (compareMode && compareFullOverlay) {
      renderFullOverlay(recordName);
      return;
    }

    const currentRecord = model.records.find((r) => r.name === recordName);
    fkeyLegendEl.innerHTML = WebviewClientHelpers.functionKeyLegendHtml(DspfEngine.resolveFunctionKeyLegend(model, currentRecord, active));

    const screen = DspfEngine.resolveScreen(model, recordName, active, activePulldown, previewMultipleRows, selectedSizeIndex);
    lastScreen = screen;
    if (screen.error) { screenOutput.innerHTML = '<div class="warn">' + screen.error + '</div>'; updateRuler(screen); updateOverlapWarning(null); return; }
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
    updateRuler(screen);
    updateOverlapWarning(screen);
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

    // Task L10: maps a field's sourceLine to its rendered canvas element,
    // filled in as the forEach below resolves each element's 'underlying'
    // field - used by the group-drag branch in the mousedown handler below
    // to find every OTHER currently-selected field's element for a
    // multi-select block move, since canvas elements only carry
    // data-line/-column/-field (source-position/name), not a field's
    // sourceLine, unlike the Hidden-fields sidebar rows (data-source-line).
    // Safe to read from any mousedown handler below even though it's still
    // being populated during this same forEach pass, since listeners only
    // ever FIRE later, after the forEach (and this map) is already complete.
    const fieldElBySourceLine = {};
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
      // A CONSTANT's DDS name column is always blank (data-field=""), so
      // for constants 'name' here is '' - guarding this branch on 'name'
      // truthy forces every constant straight to the line+column match
      // below. Without the guard, f.name === name ('' === '') matched
      // the FIRST constant .find() happened to hit on that anchor line,
      // regardless of which constant was actually clicked, whenever two or
      // more constants shared a screen row - a real bug, not a stylistic
      // choice; a genuinely named field still matches by name first below.
      let underlying = primaryRec && (
        (name && primaryRec.fields.find((f) => f.name === name && f.location.line === anchorLine)) ||
        primaryRec.fields.find((f) => f.location.line === anchorLine && f.location.column === anchorColumn)
      );
      let ownerRecordName = recordName;
      if (!underlying) {
        for (const r of model.records) {
          const found = (name && r.fields.find((f) => f.name === name && f.location.line === anchorLine)) ||
                        r.fields.find((f) => f.location.line === anchorLine && f.location.column === anchorColumn);
          if (found) { underlying = found; ownerRecordName = r.name; break; }
        }
      }
      if (!underlying) return;
      const editable = DspfWriter.isEditable(underlying);
      if (!editable) el.classList.add('locked');
      if (selectedKeys.some((k) => k.sourceLine === underlying.sourceLine)) el.classList.add('selected');
      fieldElBySourceLine[underlying.sourceLine] = el;

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
        // Task L10: shift-click or ctrl/cmd-click (mirroring both common
        // multi-select conventions rather than picking just one) toggles
        // this field into/out of the current multi-select instead of
        // replacing it - real SDA's own block-select is a two-corner line
        // command on the Design Image screen ('- -'/'= ='), which has no
        // direct mouse-driven equivalent, so shift/ctrl-click plus the
        // rubber-band drag-select below (see the screenOutput mousedown
        // handler) are the mouse-native ways of building the same kind of
        // multi-field block iSDA didn't have before this task.
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          toggleMultiSelection(underlying.sourceLine);
        } else {
          setSingleSelection(underlying.sourceLine);
        }
        selectedHelpSourceLine = null;
        showFileProps = false;
        render();
      });
      el.addEventListener('mousedown', (e) => {
        if (isPulldownField) e.stopPropagation();
        if (!editable) return;
        // A modifier mousedown is about TOGGLING selection (handled by the
        // click listener above, which fires right after this on mouseup) -
        // never about starting a drag, so bail out here without
        // preventDefault so a plain click still lands normally.
        if (e.shiftKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        if (isEditableSflPreviewRow && ownerRecord) {
          // Multi-row SFLPAG preview (either the SFLCTL-side preview, or the
          // SFL record's own "Preview SFLPAG rows" toggle): every rendered
          // row instance is the SAME template, so every field visible in
          // THIS row instance moves together, and every NAMED field of the
          // record is batch-committed together - see commitGroupEdit.
          const siblingEls = Array.from(primaryScreenEl.querySelectorAll('[data-tag="' + tag.replace(/"/g, '\\\\"') + '"]'));
          startGroupDrag(siblingEls, ownerRecord.fields.filter((f) => f.name), ownerRecordName);
        } else if (selectedKeys.length > 1 && selectedKeys.some((k) => k.sourceLine === underlying.sourceLine)) {
          // Task L10: dragging a field that's already part of a multi-select
          // (built via shift/ctrl-click or rubber-band drag-select above)
          // moves the WHOLE block together by the same delta - real SDA's
          // own block-move convention (see this task's LIMITATIONS-PLAN.md
          // entry), reusing the exact same startGroupDrag/commitGroupEdit
          // "move N fields by one delta, one batched source edit" machinery
          // the SFLPAG preview-row branch above already established, just
          // triggered from an arbitrary multi-select instead of a repeated
          // row template. Scoped to fields owned by THIS SAME record - a
          // block select never spans records (see selectedKeys' own doc
          // comment) - so any stray cross-record entry is simply dropped.
          const selectedFields = getSelectedFields().filter((sf) => sf.record.name === ownerRecordName);
          const selectedEls = selectedFields.map((sf) => fieldElBySourceLine[sf.field.sourceLine]).filter(Boolean);
          if (selectedEls.length > 1) startGroupDrag(selectedEls, selectedFields.map((sf) => sf.field), ownerRecordName);
          else startDrag(el, underlying, ownerRecordName);
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
        clearSelection();
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
        moveHandle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startWindowMove(windowEl, currentRecord, e); });
      }
      if (resizeHandle && windowEditable) {
        resizeHandle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startWindowResize(windowEl, currentRecord); });
      }
    }

    renderProps(recordName);
  }

  let dragState = null;
  // In-memory clipboard for Cut/Copy/Paste (Ctrl+X/C/V) - deliberately NOT
  // the OS clipboard (navigator.clipboard is unreliable/permission-gated
  // inside a VS Code webview, and there's no need for cross-window paste
  // here anyway). Holds a plain-data snapshot of one or more fields/
  // constants - { fields: [...], recordName } (Task L10: always an ARRAY,
  // even for a single field, so commitPaste/pasteFieldsBlock have exactly
  // one path regardless of how many fields were copied/cut) - decoupled
  // from the live model so it survives edits made to the original field(s)
  // after copying, and so DspfWriter.copyField (which only reads a field's
  // own plain properties, not any live model reference - see its own doc
  // comment) can insert them into ANY record, not just the one they were
  // copied from. This is what makes Paste different from the existing
  // Ctrl+D "duplicate in place": Ctrl+D always inserts into the SAME record
  // immediately; Copy+Paste can move a field's definition across records.
  let clipboardField = null;
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
  //
  // Task L30 fix - reported as "when dragging windows I feel like it is
  // jumping to the right side": .dspf-window-move-handle spans the
  // window's ENTIRE top edge (left:0; right:0 in the CSS above - see
  // its own rule), not a small corner grip like the resize handle, so a
  // grab virtually never lands exactly on the window's own leftmost
  // pixel. The old 'onMove' snapped the window's ORIGIN straight to the
  // raw mouse position on every move ('newCol = round((mouseX-rect.left)
  // / colWidth) + 1'), as if the cursor itself WAS the window's top-left
  // corner - so the instant a drag started, the window jumped so that
  // grabbed point became its new left edge, shifting the whole window
  // right by exactly how far into the title strip it was grabbed (grab
  // the middle of a 30-wide window, the window jumps ~15 columns right).
  // Resize never had this problem since it already computed width/height
  // as a DIFFERENCE from the window's fixed, unmoving origin rather than
  // an absolute position. Fixed the same way here: capture the mouse's
  // own starting point at mousedown ('startEvent', now threaded through
  // from the moveHandle listener below) and the window's starting
  // origin, then every subsequent 'onMove' computes how far the MOUSE
  // itself has moved and applies that same delta to the original origin -
  // preserving wherever within the strip it was grabbed, the same
  // grab-offset-preserving idea 'startDrag' already gets right for fields
  // via its own onUp delta (though notably 'startDrag''s own onMove has
  // this identical absolute-snap pattern too - not touched here since
  // fields weren't part of this report and field-dragging has extensive
  // existing test coverage keyed to the current behavior; flagged as a
  // follow-up sliver in LIMITATIONS-PLAN.md rather than changed alongside
  // an unrelated, unrequested fix).
  function startWindowMove(windowEl, record, startEvent) {
    const { colWidth, rowHeight } = gridMetrics();
    const origLine = parseInt(windowEl.getAttribute('data-window-line'), 10);
    const origCol = parseInt(windowEl.getAttribute('data-window-col'), 10);
    const height = parseInt(windowEl.getAttribute('data-window-height'), 10);
    const width = parseInt(windowEl.getAttribute('data-window-width'), 10);
    const startX = startEvent.clientX, startY = startEvent.clientY;
    let newLine = origLine, newCol = origCol;
    windowEl.classList.add('dragging');

    function onMove(e) {
      const deltaCol = Math.round((e.clientX - startX) / colWidth);
      const deltaLine = Math.round((e.clientY - startY) / rowHeight);
      newCol = Math.max(1, origCol + deltaCol);
      newLine = Math.max(1, origLine + deltaLine);
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

  // Task L10: stable cross-reparse field IDENTITY - name for a named field;
  // nameType/location/constantValue for an unnamed constant, which has
  // nothing else stable to key off of (a constant's own DDS name column is
  // always blank). Used by any multi-field commit that needs to re-find the
  // SAME logical field after re-parsing the document mid-batch (a keyword
  // or position edit can change the source's line count, shifting every
  // later field's sourceLine - see commitGroupEdit's own doc comment, the
  // first caller this was factored out of). A field's own name/location/
  // constantValue don't change until THAT field's own turn in a batch, so
  // identity captured once at the start of a batch stays valid for finding
  // any field not yet processed.
  function identityOf(f) {
    return {
      name: f.name || null,
      nameType: f.nameType,
      constantValue: f.constantValue != null ? f.constantValue : null,
      line: f.location.line != null ? f.location.line : 1,
      column: f.location.column != null ? f.location.column : 1,
    };
  }
  function findByIdentity(rec, id) {
    if (id.name) return rec.fields.find((f) => f.name === id.name);
    return rec.fields.find((f) => f.nameType === 'CONSTANT' && f.constantValue === id.constantValue &&
      f.location.line === id.line && f.location.column === id.column);
  }

  function commitGroupEdit(recordName, fields, deltaLine, deltaColumn) {
    try {
      // Pre-L10 this only ever tracked named fields (the SFLPAG-preview
      // group-drag caller already filters to '.filter((f) => f.name)'), so
      // the name-only path in identityOf/findByIdentity above is exactly
      // the old behavior for that caller; the constant path only matters
      // for Task L10's own arbitrary multi-select group-drag/Style, which
      // can include constants.
      const identities = fields.map(identityOf);
      const wasSelected = fields.map((f) => selectedKeys.some((k) => k.sourceLine === f.sourceLine));

      let lines = sourceText.split(/\\r\\n|\\r|\\n/);
      let currentModel = model;

      // Each field is re-fetched from the freshly re-parsed model on every iteration,
      // since editing one field shifts source line numbers for everything after it -
      // a stale field reference from before this loop started would write to the wrong line.
      identities.forEach((id) => {
        const rec = currentModel.records.find((r) => r.name === recordName);
        const f = rec && findByIdentity(rec, id);
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

      // Re-select whichever of the moved fields were selected before the
      // move - by their EXPECTED post-move identity (original line/column
      // + the same delta everything just moved by) - so a multi-select
      // block move leaves the SAME set of fields selected afterward, not
      // just the single previously-primary one. Same "the edit shouldn't
      // silently drop the selection" guarantee the pre-L10 single-
      // selectedKey path already had.
      const rec = model.records.find((r) => r.name === recordName);
      const newSelected = [];
      identities.forEach((id, i) => {
        if (!wasSelected[i] || !rec) return;
        const expected = { name: id.name, constantValue: id.constantValue, line: id.line + deltaLine, column: id.column + deltaColumn };
        const found = findByIdentity(rec, expected);
        if (found) newSelected.push({ sourceLine: found.sourceLine });
      });
      selectedKeys = newSelected;
      selectedKey = newSelected.length ? newSelected[newSelected.length - 1] : null;

      activePulldown = null;
      suppressNextExternalUpdate = true;
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      render();
    } catch (err) {
      vscode.postMessage({ type: 'error', message: err.message });
    }
  }

  // Suggestion B - align/distribute a multi-select group, each field to
  // its OWN target line/column (not a uniform delta like commitGroupEdit
  // above) - the align/distribute counterpart, built on the exact same
  // identity-tracking reparse loop (see identityOf/findByIdentity's own
  // doc comment) since repositioning one field can shift every later
  // field's sourceLine, same as a delta move can. 'targets' is an array
  // parallel to a fields list, each entry { field, newLine, newColumn } -
  // computed ONCE up front from the group's ORIGINAL positions (by each
  // align/distribute button's own click handler below), not recomputed
  // mid-loop, so e.g. "align left" targets the group's own original
  // leftmost column, not a column that's already shifted by an earlier
  // field in this same batch. Re-selects whichever targets were selected
  // beforehand, same as commitGroupEdit - by each field's own NEW
  // (post-align) identity, since unlike a delta move the exact new
  // position differs per field.
  function commitAlignEdit(recordName, targets) {
    try {
      const identities = targets.map((t) => identityOf(t.field));
      const wasSelected = targets.map((t) => selectedKeys.some((k) => k.sourceLine === t.field.sourceLine));

      let lines = sourceText.split(/\\r\\n|\\r|\\n/);
      let currentModel = model;

      identities.forEach((id, i) => {
        const rec = currentModel.records.find((r) => r.name === recordName);
        const f = rec && findByIdentity(rec, id);
        if (!f) return;
        lines = DspfWriter.applyFieldUpdate(f, lines, { line: targets[i].newLine, column: targets[i].newColumn });
        currentModel = DspfParser.parseDspf(lines.join('\\n'));
      });

      sourceText = lines.join('\\n');
      model = currentModel;

      const rec = model.records.find((r) => r.name === recordName);
      const newSelected = [];
      identities.forEach((id, i) => {
        if (!wasSelected[i] || !rec) return;
        const expected = { name: id.name, constantValue: id.constantValue, line: targets[i].newLine, column: targets[i].newColumn };
        const found = findByIdentity(rec, expected);
        if (found) newSelected.push({ sourceLine: found.sourceLine });
      });
      selectedKeys = newSelected;
      selectedKey = newSelected.length ? newSelected[newSelected.length - 1] : null;

      activePulldown = null;
      suppressNextExternalUpdate = true;
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      render();
    } catch (err) {
      vscode.postMessage({ type: 'error', message: err.message });
    }
  }

  // Task L10: batch-applies a PER-FIELD keyword transform across every
  // field in 'fields', in one source edit/one undo step - the keyword
  // counterpart to commitGroupEdit's position delta above, built on the
  // exact same identity-tracking reparse loop (see identityOf/
  // findByIdentity's own doc comment) since a keyword rewrite can add or
  // remove condition lines and shift every later field's sourceLine, same
  // as a position edit can. 'computeNewKeywords(field)' receives each
  // field freshly re-fetched from the live re-parsed model (its CURRENT
  // keywords, not a stale pre-batch snapshot) and returns that field's own
  // new keyword array - this is what lets the Style panel below apply the
  // SAME target color/attribute state to every selected field while still
  // preserving each field's own OTHER keywords (VALUES, EDTCDE, REFFLD,
  // etc.), rather than overwriting one field's keyword list onto another's.
  // Re-selects whichever of 'fields' were selected beforehand, same as
  // commitGroupEdit.
  function commitMultiFieldKeywordEdit(recordName, fields, computeNewKeywords) {
    try {
      const identities = fields.map(identityOf);
      const wasSelected = fields.map((f) => selectedKeys.some((k) => k.sourceLine === f.sourceLine));

      let lines = sourceText.split(/\\r\\n|\\r|\\n/);
      let currentModel = model;

      identities.forEach((id) => {
        const rec = currentModel.records.find((r) => r.name === recordName);
        const f = rec && findByIdentity(rec, id);
        if (!f) return;
        const newKeywords = computeNewKeywords(f);
        lines = DspfWriter.applyFieldUpdate(f, lines, { keywords: newKeywords });
        currentModel = DspfParser.parseDspf(lines.join('\\n'));
      });

      sourceText = lines.join('\\n');
      model = currentModel;

      const rec = model.records.find((r) => r.name === recordName);
      const newSelected = [];
      identities.forEach((id, i) => {
        if (!wasSelected[i] || !rec) return;
        const found = findByIdentity(rec, id);
        if (found) newSelected.push({ sourceLine: found.sourceLine });
      });
      selectedKeys = newSelected;
      selectedKey = newSelected.length ? newSelected[newSelected.length - 1] : null;

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

  // Task L10 selection helpers - see selectedKeys' own doc comment above for why
  // every selection site goes through these instead of assigning selectedKey
  // directly. Deliberately record-agnostic here (a block select never crosses
  // records on screen, since only one record is ever shown at a time - see
  // recordSelect's own change handler clearing the selection).
  function clearSelection() {
    selectedKey = null;
    selectedKeys = [];
  }
  function setSingleSelection(sourceLine) {
    selectedKey = sourceLine != null ? { sourceLine } : null;
    selectedKeys = sourceLine != null ? [{ sourceLine }] : [];
  }
  function toggleMultiSelection(sourceLine) {
    const idx = selectedKeys.findIndex((k) => k.sourceLine === sourceLine);
    if (idx === -1) selectedKeys = selectedKeys.concat([{ sourceLine }]);
    else selectedKeys = selectedKeys.filter((k) => k.sourceLine !== sourceLine);
    // Primary stays the most-recently-toggled-ON field; if the toggle just
    // removed the primary, fall back to whatever's left (or null if empty) -
    // same "last one standing" rule a rubber-band selection's own anchor uses.
    selectedKey = selectedKeys.length ? selectedKeys[selectedKeys.length - 1] : null;
  }
  // Adds every field under 'sourceLines' to the selection (used by rubber-band
  // drag-select) without disturbing fields already selected from a prior
  // shift/ctrl-click or an earlier drag pass over a different area.
  function addToMultiSelection(sourceLines) {
    sourceLines.forEach((sl) => {
      if (!selectedKeys.some((k) => k.sourceLine === sl)) selectedKeys = selectedKeys.concat([{ sourceLine: sl }]);
    });
    if (selectedKeys.length) selectedKey = selectedKeys[selectedKeys.length - 1];
  }
  // Resolves selectedKeys against the CURRENT model, same staleness guard
  // findFieldBySourceLine's own callers already need after any edit - dropping
  // (not erroring on) any sourceLine that no longer resolves, since a group
  // delete/move can legitimately shrink the live selection out from under a
  // still-open multi-select. Every returned entry belongs to the SAME record
  // (a block select never spans records - see this function's own callers).
  function getSelectedFields() {
    const seen = {};
    const out = [];
    selectedKeys.forEach((k) => {
      if (seen[k.sourceLine]) return;
      seen[k.sourceLine] = true;
      const found = findFieldBySourceLine(k.sourceLine);
      if (found) out.push(found);
    });
    return out;
  }

  function renderProps(recordName) {
    renderBreadcrumb(recordName);
    if (pendingPlacement) { renderPlacementProps(recordName); return; }
    if (showFileProps) { renderFileProps(); return; }
    // Task L10: more than one field selected (shift/ctrl-click or
    // rubber-band drag-select on the canvas) shows a compact multi-field
    // panel instead of the single-field one - see renderMultiFieldProps' own
    // doc comment for why it only covers Style (Color & attributes) plus
    // delete/cut/copy/duplicate, not every single-field property.
    if (selectedKeys.length > 1) { renderMultiFieldProps(recordName); return; }
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
    if (selectedKeys.length > 1) {
      html += '<span class="crumb-sep">&rsaquo;</span><span class="crumb current">' + selectedKeys.length + ' fields selected</span>';
    } else if (selectedKey) {
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
      clearSelection();
      selectedHelpSourceLine = null;
      pendingPlacement = null;
      render();
    });
    const recordCrumb = document.getElementById('crumb-record');
    if (recordCrumb) recordCrumb.addEventListener('click', () => {
      if (atRecord) return;
      showFileProps = false;
      clearSelection();
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

  /** Same idea as tabsHtml() but with its own .props-subtab / .props-subtab-panel
   *  classes/attributes, so it can be nested INSIDE a single tabsHtml() panel
   *  (e.g. R1's 8 category panels living inside the record Properties
   *  panel's own Keywords tab) without wireTabs()'s querySelectorAll(root)
   *  also catching and mis-wiring these inner buttons. */
  function subtabsHtml(tabs, activeId) {
    let html = '<div class="props-subtabs">';
    tabs.forEach((t) => { html += '<button type="button" class="props-subtab' + (t.id === activeId ? ' active' : '') + '" data-subtab="' + t.id + '">' + t.label + '</button>'; });
    html += '</div>';
    tabs.forEach((t) => { html += '<div class="props-subtab-panel' + (t.id === activeId ? ' active' : '') + '" data-subtab-panel="' + t.id + '">' + t.content + '</div>'; });
    return html;
  }

  /** Wires click handlers for a subtabsHtml()-produced strip. Scope 'root' to
   *  just the subtabs' own container (not the whole propsBody) so an outer
   *  wireTabs() call sharing the same propsBody never sees these buttons. */
  function wireSubTabs(root, onSwitch) {
    root.querySelectorAll('.props-subtab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-subtab');
        root.querySelectorAll('.props-subtab').forEach((b) => b.classList.toggle('active', b === btn));
        root.querySelectorAll('.props-subtab-panel').forEach((p) => p.classList.toggle('active', p.getAttribute('data-subtab-panel') === id));
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
   *
   * Command keys (CAxx/CFxx) get their own "Cmd keys" tab here, the same
   * shape a record's own Command keys tab already uses (see
   * renderRecordProps) - this used to be a separate, always-visible panel
   * in the left-hand aside, independent of whether File attributes or
   * Record properties was showing on the right; moved here so File
   * attributes is the single place to find every file-level keyword,
   * command keys included, matching how record-level command keys already
   * live inside that record's own properties rather than somewhere else.
   * availableCommandKeyNumbers only needs the file's OWN keywords here - a
   * number already used by some record does NOT block adding it at the file
   * level too (that record's own definition simply keeps overriding the
   * file-level one it now shares a number with; see the comment above
   * DspfWriter.availableCommandKeyNumbers). Task L31: this now uses
   * DspfWriter.allCommandKeyNumbers() (always "01".."24") instead - a
   * number already used WITHIN this same scope no longer excludes it
   * either, since real SDA allows multiple independently-conditioned
   * instances of the same number (see setCommandKeyAt's own doc comment).
   */

  function renderFileProps() {
    const panels = WebviewClientHelpers.fileKeywordsPanelsHtml(model.fileKeywords, expandedKeywordConditioning);
    const availableForFile = DspfWriter.allCommandKeyNumbers();
    const commandKeysHtml = WebviewClientHelpers.commandKeysSectionHtml('file-level', model.fileKeywords, availableForFile, 'file', expandedKeywordConditioning);
    // Task L13 - file-level comment lines (the same "preamble" area file
    // keywords like DSPSIZ live in) get their own tab, same shape as the
    // record-level Structure tab's own Comments section below.
    const fileComments = DspfWriter.getFileComments(model);
    const fileCommentsHtml = commentsListHtml(fileComments, 'filecomments');
    let html = '<div class="status" style="margin-bottom:12px;">SDA-style keyword picker for the whole display file - not tied to any one record format.</div>';
    html += tabsHtml([
      { id: 'general', label: 'General', content: panels.general },
      { id: 'indicator', label: 'Indicator', content: panels.indicatorKeywords },
      { id: 'commandkeys', label: 'Cmd keys', content: commandKeysHtml },
      { id: 'print', label: 'Print', content: panels.print },
      { id: 'help', label: 'Help', content: panels.help },
      { id: 'sizes', label: 'Display sizes', content: panels.displaySizes },
      { id: 'dbcs', label: 'DBCS', content: panels.dbcsConversion },
      { id: 'alternate', label: 'Alternate', content: panels.alternate },
      { id: 'wdwborder', label: 'Window Border', content: panels.windowBorder },
      { id: 'menubar', label: 'Menu-bar', content: panels.menuBar },
      { id: 'comments', label: 'Comments', content: fileCommentsHtml },
    ], activeFileTab);
    html += accordionHtml('Advanced / raw keywords', WebviewClientHelpers.keywordEditorHtml(model.fileKeywords, 'file', expandedKeywordConditioning), false);
    propsBody.innerHTML = html;
    wireTabs(propsBody, (id) => { activeFileTab = id; });

    WebviewClientHelpers.wireFileKeywordsPanels(() => model.fileKeywords, (newKeywords) => commitFileEdit(newKeywords), expandedKeywordConditioning, () => renderFileProps());
    WebviewClientHelpers.wireCommandKeysSection('file', model.fileKeywords, (newKeywords) => commitFileEdit(newKeywords), expandedKeywordConditioning, () => renderFileProps());
    WebviewClientHelpers.wireKeywordEditor(model.fileKeywords, (newKeywords) => commitFileEdit(newKeywords), 'file', expandedKeywordConditioning, () => renderFileProps());
    wireCommentsSection(
      'filecomments',
      () => DspfWriter.getFileComments(model),
      0,
      (comments, fallbackAfterLine) => commitSourceChange((lines) => DspfWriter.addComment(lines, comments, fallbackAfterLine, '')),
      (line, text) => commitSourceChange((lines) => DspfWriter.updateComment(lines, line, text)),
      (line) => commitSourceChange((lines) => DspfWriter.deleteComment(lines, line))
    );
  }

  function commitFileEdit(newKeywords) {
    commitSourceChange((lines) => DspfWriter.applyFileKeywordsUpdate(model, lines, newKeywords));
  }

  function renderFieldProps(recordName) {
    const found = findFieldBySourceLine(selectedKey.sourceLine);
    const field = found && found.field;
    const ownerRecordName = found && found.record.name;
    if (!field) { clearSelection(); renderRecordProps(recordName); return; }

    const editable = DspfWriter.isEditable(field);
    const isConstant = field.nameType === 'CONSTANT';
    // A "system value" constant (DATE/TIME/USER/SYSNAME/PAGNBR) parses as a
    // plain CONSTANT (DDS leaves its name column blank, same as an ordinary
    // literal - see dspfParser.ts's nameTypeFor) but is fundamentally
    // different from one: its displayed value comes from the SYSTEM at
    // runtime, not from "constantValue" (which is null for these - there's
    // no literal text to store). Bug fixed here: this used to only
    // recognize DATE/TIME/PAGNBR, silently missing USER and SYSNAME -
    // which meant editing OR adding a *USER/*SYSNAME placeholder fell
    // through to the plain-literal-text code path below. That path always
    // sends "updates.constantValue" on every Apply click (even one that
    // only touched Line/Column), and DspfWriter.buildFunctionAreaText
    // writes ANY non-null constantValue as a quoted literal regardless of
    // what keywords are also present - so simply opening a *USER field and
    // clicking Apply for an unrelated reason silently corrupted it into
    // invalid DDS carrying BOTH an empty '' literal AND the USER keyword
    // on the same line. Now consistently recognized (matching
    // DspfEngine.fieldDisplayText's own list below) and given its own
    // dedicated, non-destructive UI instead of the free-text Text input.
    const SYSTEM_VALUE_KEYWORD_NAMES = ['DATE', 'TIME', 'USER', 'SYSNAME', 'PAGNBR'];
    const isSystemValueConstant = isConstant && field.keywords.some((k) => SYSTEM_VALUE_KEYWORD_NAMES.indexOf(k.name) !== -1);
    let html = '';
    if (!editable) html += '<div class="warn">Multi-group or &gt;3-indicator conditioning — editing this field is disabled to avoid corrupting it. Edit the source directly.</div>';

    // --- Basic tab: identity (name/text, length/decimals or fill, type/usage) ---
    let basicHtml = '';
    if (isSystemValueConstant) {
      // A system-value constant has no literal text at all - its whole
      // identity is WHICH system value it displays. Exactly one of these
      // five keywords is expected at a time (they're mutually exclusive
      // ways of filling in "the system supplies this"), so this is a
      // single-select dropdown, not a repeatable keyword list - switching
      // it removes whichever one was there and adds the newly chosen one
      // (see the Apply handler below). EDTCDE/EDTWRD (common on DATE/TIME/
      // PAGNBR - e.g. inserting slashes into a date) still live in the
      // Attributes tab below, unaffected by this dropdown.
      const currentSysKw = field.keywords.find((k) => SYSTEM_VALUE_KEYWORD_NAMES.indexOf(k.name) !== -1);
      const sysValueLabels = { DATE: 'DATE - current date', TIME: 'TIME - current time', USER: 'USER - signed-on user profile', SYSNAME: 'SYSNAME - system name', PAGNBR: 'PAGNBR - page number' };
      basicHtml += '<div class="field-row"><label>System value</label><select id="p-const-sysval">' +
        SYSTEM_VALUE_KEYWORD_NAMES.map((v) => '<option value="' + v + '"' + (currentSysKw && currentSysKw.name === v ? ' selected' : '') + '>' + sysValueLabels[v] + '</option>').join('') +
        '</select></div>';
      basicHtml += '<div class="hint-small">This field shows a system-supplied value, not literal text - the design preview shows a live placeholder (e.g. today\u2019s date), and the real value fills in at runtime.</div>';
    } else if (isConstant) {
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
    // D2: gate which of the D1 panels below even apply to this field's
    // CURRENT usage/data type, matching real SDA's own "For Field Type"
    // column (see WebviewClientHelpers.fieldKeywordCategoryVisibility's own
    // doc comment). Constants have no usage/dataType of their own
    // (undefined here), which the gate treats the same as blank - "show
    // everything except what's explicitly usage-restricted" - so this
    // doesn't change a constant's existing Color & attributes visibility.
    const catVis = WebviewClientHelpers.fieldKeywordCategoryVisibility(field.usage, field.dataType);
    let attrsHtml = '';
    if (catVis.colorAndAttributes) attrsHtml += WebviewClientHelpers.colorAttrStatesHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning);
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
      attrsHtml += WebviewClientHelpers.validityAndEditHtml(field.keywords, 'field-' + field.sourceLine, { includeValidity: catVis.validityAndErrorMessage, includeEditKeyword: catVis.editingKeywords }, expandedKeywordConditioning);
    } else if (isSystemValueConstant) {
      attrsHtml += WebviewClientHelpers.validityAndEditHtml(field.keywords, 'field-' + field.sourceLine, { includeValidity: false }, expandedKeywordConditioning);
    }
    if (!isConstant && catVis.errorMessages) {
      attrsHtml += accordionHtml('Error messages', WebviewClientHelpers.errorMessageInstancesHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning), false);
    }
    // Remaining SDA "Select Field Keywords" categories (docs/sda-reference/
    // task D1) - collapsed by default, same as the Keywords/Conditioning
    // accordions below, since these are reached far less often than
    // Color & attributes / Validity check. Each gated per D2's usage-based
    // applicability rules above.
    if (!isConstant && catVis.keyingOptions) {
      attrsHtml += accordionHtml('Keying options', WebviewClientHelpers.keyingOptionsHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning), false);
    }
    if (!isConstant && catVis.inputKeywords) {
      attrsHtml += accordionHtml('Input keywords', WebviewClientHelpers.inputKeywordsHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning), false);
    }
    if (catVis.generalKeywords) {
      attrsHtml += accordionHtml('General keywords', WebviewClientHelpers.generalFieldKeywordsHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning), false);
    }
    if (!isConstant && catVis.databaseReference) {
      let dbRefBody = '';
      if (field.isReference) dbRefBody += '<div class="hint-small">REFFLD/REF are managed by the Resolve Referenced Field button above.</div>';
      dbRefBody += WebviewClientHelpers.referenceOverridesHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning);
      attrsHtml += accordionHtml('Database reference', dbRefBody, false);
    }
    if (!isConstant && catVis.messageId) {
      attrsHtml += accordionHtml('Message ID', WebviewClientHelpers.messageIdInstancesHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning), false);
    }
    // Task D3 - Subfile Keywords (SFLRCDNBR/SFLROLVAL), for a numeric field
    // living directly in an SFL or SFLCTL record - gated on the OWNING
    // RECORD (found.record, computed just below), same convention as D5's
    // MNUBARCHC/MNUBARSEP gate.
    const isSflOrSflCtlRecord = !isConstant && (WebviewClientHelpers.isSflRecord(found.record) || WebviewClientHelpers.isSflCtlRecord(found.record));
    if (isSflOrSflCtlRecord) {
      attrsHtml += accordionHtml('Subfile keywords (SFLRCDNBR/SFLROLVAL)', WebviewClientHelpers.subfileFieldKeywordsHtml(field.keywords, 'field-' + field.sourceLine), false);
    }
    // D5 - Menu-bar choice fields (docs/sda-reference/ task D5). Two
    // distinct gates, since these serve two different field kinds:
    //   - MNUBARCHC/MNUBARSEP only make sense on a field OR CONSTANT that
    //     lives in a record carrying its own MNUBAR keyword (see the
    //     record-type wizard's MNUBAR/PULLDOWN/PDNSFL types) - gated on
    //     the OWNING RECORD, not the field itself, since a brand-new entry
    //     in that record hasn't been turned into the bar's own choice
    //     element yet. Constants ARE included here (task D4's own "Select
    //     Menu-Bar Keywords" screen shows the identical MNUBARCHC/
    //     MNUBARSEP/CHCAVAIL/CHCSLT set) - unlike Choice selection type
    //     below, MNUBARCHC/MNUBARSEP are valid DDS entries regardless of
    //     whether the entry has a name, so a constant serving as a
    //     menu-bar label/separator can carry them too.
    //   - Choice selection type is always offered for non-constant fields
    //     (it's the opt-in entry point, same spirit as D1's Keying options
    //     always being offered); the per-choice keyword list and the
    //     three color states only appear once a field IS already a
    //     SNGCHCFLD/MLTCHCFLD choice field, so a random unrelated field's
    //     Attributes tab doesn't get cluttered with an empty, confusing
    //     choice-list editor. These stay CONSTANT-EXCLUDED (unlike
    //     MNUBARCHC/MNUBARSEP above) because SNGCHCFLD/MLTCHCFLD are
    //     genuinely field semantics - a nameless constant structurally
    //     cannot be an interactive, indicator-controlled choice field.
    const ownerRecord = found.record;
    const isMenuBarRecord = ownerRecord.keywords.some((k) => k.name === 'MNUBAR');
    if (isMenuBarRecord) {
      attrsHtml += accordionHtml('Menu-bar choices (MNUBARCHC)', WebviewClientHelpers.menuBarChoicesHtml(field.keywords, 'field-' + field.sourceLine), false);
      attrsHtml += accordionHtml('Menu-bar separator (MNUBARSEP)', WebviewClientHelpers.menuBarSeparatorHtml(field.keywords, 'field-' + field.sourceLine), false);
    }
    if (!isConstant) {
      attrsHtml += accordionHtml('Choice selection type', WebviewClientHelpers.choiceSelectionTypeHtml(field.keywords, 'field-' + field.sourceLine), false);
      const isChoiceField = DspfWriter.getChoiceSelectionType(field.keywords).kind !== '';
      if (isChoiceField) {
        attrsHtml += accordionHtml('Choice keywords (CHOICE/CHCCTL/CHCACCEL)', WebviewClientHelpers.choiceKeywordsListHtml(field.keywords, 'field-' + field.sourceLine), false);
        attrsHtml += accordionHtml('Choice colors & attributes', WebviewClientHelpers.choiceColorStatesHtml(field.keywords, 'field-' + field.sourceLine), false);
      }
    }

    // --- Keywords tab: the dense raw-keyword chip editor + conditioning, each collapsed by default ---
    let keywordsHtml = accordionHtml('Keywords', WebviewClientHelpers.keywordEditorHtml(field.keywords, 'field-' + field.sourceLine, expandedKeywordConditioning), true);
    keywordsHtml += accordionHtml('Conditioning', WebviewClientHelpers.conditionsEditorHtml(field.conditions, 'field', expandedKeywordConditioning), false);

    html += tabsHtml([
      { id: 'basic', label: isConstant ? 'Text' : 'Basic', content: basicHtml },
      { id: 'position', label: 'Position', content: positionHtml },
      { id: 'attrs', label: 'Attributes', content: attrsHtml },
      { id: 'keywords', label: 'Keywords', content: keywordsHtml },
    ], activeFieldTab);

    html += '<button id="p-apply" style="width:100%;margin-top:16px;" ' + (editable ? '' : 'disabled') + '>Apply changes</button>';
    html += '<button id="p-copy" class="secondary" style="width:100%;margin-top:8px;">Copy ' + (isConstant ? 'constant' : 'field') + '</button>';
    html += '<div class="delete-hint">Press Delete or Backspace to remove this field. Ctrl+D duplicates it in place; Ctrl+X/C/V cut/copy/paste it (Ctrl+V pastes into whichever record is currently shown, even a different one). Arrow keys nudge its position (Shift = 5 cells).</div>';
    propsBody.innerHTML = html;
    wireTabs(propsBody, (id) => { activeFieldTab = id; });
    if (!editable) return;

    document.getElementById('p-apply').addEventListener('click', () => {
      const updates = {
        line: document.getElementById('p-line').value === '' ? null : parseInt(document.getElementById('p-line').value, 10),
        column: document.getElementById('p-col').value === '' ? null : parseInt(document.getElementById('p-col').value, 10),
      };
      if (isSystemValueConstant) {
        // Switching the dropdown replaces whichever system-value keyword
        // was there with the newly chosen one - constantValue is
        // deliberately left untouched (stays null/absent) so
        // buildFunctionAreaText never writes a literal alongside it. This
        // is the actual fix for the corruption bug described above: no
        // path here ever sets updates.constantValue for one of these.
        const chosen = document.getElementById('p-const-sysval').value;
        updates.keywords = field.keywords.filter((k) => SYSTEM_VALUE_KEYWORD_NAMES.indexOf(k.name) === -1).concat([{ name: chosen, parameters: '', conditions: [], sourceLines: [] }]);
      } else if (isConstant) {
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
    WebviewClientHelpers.wireConditionsEditor('field', field.conditions, (newConditions) => commitEdit(ownerRecordName, field, { conditions: newConditions }), expandedKeywordConditioning, () => renderFieldProps(recordName));
    WebviewClientHelpers.wireColorAttrStatesEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
    if (!isConstant) {
      WebviewClientHelpers.wireValidityAndEdit(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, { includeValidity: catVis.validityAndErrorMessage, includeEditKeyword: catVis.editingKeywords }, expandedKeywordConditioning, () => renderFieldProps(recordName));
    } else if (isSystemValueConstant) {
      WebviewClientHelpers.wireValidityAndEdit(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, { includeValidity: false }, expandedKeywordConditioning, () => renderFieldProps(recordName));
    }
    if (!isConstant && catVis.errorMessages) {
      WebviewClientHelpers.wireErrorMessageInstances(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
    }
    if (!isConstant) {
      WebviewClientHelpers.wireKeyingOptionsEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
      WebviewClientHelpers.wireInputKeywordsEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
    }
    WebviewClientHelpers.wireGeneralFieldKeywordsEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
    if (!isConstant) {
      WebviewClientHelpers.wireReferenceOverridesEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
      WebviewClientHelpers.wireMessageIdInstancesEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine, expandedKeywordConditioning, () => renderFieldProps(recordName));
    }
    if (isSflOrSflCtlRecord) {
      WebviewClientHelpers.wireSubfileFieldKeywords(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
    }
    if (isMenuBarRecord) {
      WebviewClientHelpers.wireMenuBarChoicesEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
      WebviewClientHelpers.wireMenuBarSeparatorEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
    }
    if (!isConstant) {
      WebviewClientHelpers.wireChoiceSelectionTypeEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
      if (DspfWriter.getChoiceSelectionType(field.keywords).kind !== '') {
        WebviewClientHelpers.wireChoiceKeywordsListEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
        WebviewClientHelpers.wireChoiceColorStatesEditor(field.keywords, (newKeywords) => commitEdit(ownerRecordName, field, { keywords: newKeywords }), 'field-' + field.sourceLine);
      }
    }

    if (isConstant && !isSystemValueConstant) {
      document.getElementById('p-fill').addEventListener('click', () => {
        const ch = (document.getElementById('p-fill-char').value || '.').slice(0, 1) || '.';
        const len = Math.max(1, parseInt(document.getElementById('p-fill-len').value, 10) || 1);
        document.getElementById('p-const-text').value = ch.repeat(len);
      });
    }

    document.getElementById('p-center').addEventListener('click', () => {
      const columns = (lastScreen && lastScreen.columns) || 80;
      // A system-value constant has no Text input to measure - its width
      // is whatever DspfEngine.displayLength itself would compute for it at
      // render time (DATE honors DATFMT via dateFieldLength, TIME is always
      // 8, etc. - see displayLength's own doc comment), so reuse that
      // directly rather than guessing a width here.
      const width = isSystemValueConstant
        ? DspfEngine.displayLength(field, found.record, model)
        : isConstant
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
   * Task L13 - lists a scope's own comment lines (already scoped by the
   * caller via DspfWriter.getFileComments/getRecordComments - this
   * function itself is scope-agnostic, just rendering whatever "comments"
   * array it's handed) as editable text rows, same visual shape as
   * fieldOrderListHtml's rows below it. Each row's own "data-source-line"
   * is the comment's actual physical line number - stable across
   * re-renders of THIS panel, but like every other source-line-keyed id
   * in this file, it shifts on any edit that adds/removes lines above it,
   * so it's only ever read at click/blur time, never cached.
   */
  function commentsListHtml(comments, idPrefix) {
    let html = '<div class="section-label">Comments</div>';
    if (comments.length === 0) {
      html += '<div class="empty-state">No comment lines yet.</div>';
    } else {
      comments.slice().sort((a, b) => a.line - b.line).forEach((c) => {
        html += '<div class="field-order-row" data-source-line="' + c.line + '">' +
          '<input type="text" class="comment-text-input" data-source-line="' + c.line + '" value="' + DspfEngine.escapeHtml(c.text) + '" placeholder="(blank comment line)" />' +
          '<button class="comment-delete-btn" data-source-line="' + c.line + '" title="Delete this comment line">&times;</button>' +
          '</div>';
      });
    }
    html += '<button id="' + idPrefix + '-add-comment" class="secondary" style="width:100%;margin-top:8px;">+ Add comment</button>';
    return html;
  }

  /**
   * Wires commentsListHtml's rows/add-button. "getComments()" re-reads the
   * CURRENT comments array fresh each call (mirroring getKeywords()-style
   * getters used throughout this file) rather than closing over a
   * snapshot, since a text edit reparses the whole model and every
   * comment's own "line" can shift as a result. "fallbackAfterLine" is
   * only consulted when the scope has NO existing comments yet - see
   * DspfWriter.addComment's own doc comment for the placement rule.
   */
  function wireCommentsSection(idPrefix, getComments, fallbackAfterLine, commitInsert, commitUpdate, commitDeleteLine) {
    propsBody.querySelectorAll('.comment-text-input[data-source-line]').forEach((el) => {
      el.addEventListener('change', () => {
        const line = parseInt(el.getAttribute('data-source-line'), 10);
        commitUpdate(line, el.value);
      });
    });
    propsBody.querySelectorAll('.comment-delete-btn[data-source-line]').forEach((el) => {
      el.addEventListener('click', () => {
        const line = parseInt(el.getAttribute('data-source-line'), 10);
        commitDeleteLine(line);
      });
    });
    const addBtn = document.getElementById(idPrefix + '-add-comment');
    if (addBtn) {
      addBtn.addEventListener('click', () => commitInsert(getComments(), fallbackAfterLine));
    }
  }

  /**
   * "Hidden fields" tab: usage=H fields (SFLMSGKEY/SFLPGMQ synthesized by
   * the SFLMSG record type, or any other hidden work field) never render
   * anything on the screen canvas, so there's nothing there to click to
   * select, delete, or even discover them - the canvas-click flow every
   * other field/constant uses simply doesn't apply. This is their own
   * add/select/delete surface: a list (name, length/type, its own
   * keywords) with each row clickable to select it into the SAME field
   * props panel every other field uses (selectedKey - Basic/Attributes/
   * Keywords tabs all still apply; only Position is irrelevant, and that's
   * already handled generically since a hidden field's line/col are simply
   * null - see insertField's own 'location' handling), a Delete button per
   * row, and its own inline "+ Add hidden field" form that skips the
   * canvas-click placement step entirely (a hidden field has no meaningful
   * position to click).
   */
  function hiddenFieldsSectionHtml(rec) {
    const hiddenFields = (rec.fields || []).filter((f) => f.usage === 'H');
    let html = '<div class="status" style="margin-bottom:12px;">Hidden (usage H) fields have no on-screen position, so they are managed here instead of by clicking the canvas.</div>';
    if (hiddenFields.length === 0) {
      html += '<div class="empty-state">No hidden fields in this record yet.</div>';
    } else {
      hiddenFields.forEach((f) => {
        const kwSummary = (f.keywords || []).map((k) => k.name).join(', ') || '(no keywords)';
        const typeSummary = (f.length != null ? f.length : '?') + (f.dataType || '');
        html += '<div class="field-order-row" data-source-line="' + f.sourceLine + '">' +
          '<span class="field-order-label" title="' + DspfEngine.escapeHtml(kwSummary) + '">' + DspfEngine.escapeHtml(f.name || '(unnamed)') + ' - ' + DspfEngine.escapeHtml(typeSummary) + ' - ' + DspfEngine.escapeHtml(kwSummary) + '</span>' +
          '<button class="hidden-field-delete" data-source-line="' + f.sourceLine + '" title="Delete this hidden field">&times;</button>' +
          '</div>';
      });
    }
    html += '<button id="p-add-hidden" class="secondary" style="width:100%;margin-top:12px;">+ Add hidden field</button>';
    html += '<div class="hidden" id="p-add-hidden-form" style="margin-top:8px;">' +
      '<div class="field-row"><label>Name</label><input type="text" id="p-add-hidden-name" maxlength="10" placeholder="FIELD1" /></div>' +
      '<div class="two-col"><div class="field-row"><label>Length</label><input type="number" id="p-add-hidden-length" min="1" value="10" /></div>' +
      '<div class="field-row"><label>Decimals</label><input type="number" id="p-add-hidden-decimals" min="0" placeholder="(none)" /></div></div>' +
      '<div class="field-row"><label>Data type</label><select id="p-add-hidden-type">' +
      ['A', 'X', 'N', 'S', 'Y', 'I', 'D', 'M', 'F', 'L', 'T', 'Z'].map((t) => '<option value="' + t + '">' + t + '</option>').join('') + '</select></div>' +
      '<div class="rename-error" id="p-add-hidden-error"></div>' +
      '<button id="p-add-hidden-confirm" style="width:100%;margin-top:8px;">Add</button>' +
      '<button id="p-add-hidden-cancel" class="secondary" style="width:100%;margin-top:8px;">Cancel</button>' +
      '</div>';
    return html;
  }

  function wireHiddenFieldsSection(recordName, rec) {
    propsBody.querySelectorAll('.field-order-row[data-source-line]').forEach((el) => {
      // Only the Hidden tab's own rows carry data-source-line (the Structure
      // tab's field-order-row reuse of the same class carries data-idx
      // instead) - clicking one selects it into the normal field props panel.
      el.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('hidden-field-delete')) return;
        setSingleSelection(parseInt(el.getAttribute('data-source-line'), 10));
        render();
      });
    });
    propsBody.querySelectorAll('.hidden-field-delete').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const sourceLine = parseInt(el.getAttribute('data-source-line'), 10);
        const found = findFieldBySourceLine(sourceLine);
        if (found) commitDelete(found.field);
      });
    });

    const addBtn = document.getElementById('p-add-hidden');
    const addForm = document.getElementById('p-add-hidden-form');
    if (!addBtn || !addForm) return;
    addBtn.addEventListener('click', () => { addForm.classList.remove('hidden'); addBtn.classList.add('hidden'); });
    document.getElementById('p-add-hidden-cancel').addEventListener('click', () => { addForm.classList.add('hidden'); addBtn.classList.remove('hidden'); });
    document.getElementById('p-add-hidden-confirm').addEventListener('click', () => {
      const errorEl = document.getElementById('p-add-hidden-error');
      errorEl.textContent = '';
      const name = document.getElementById('p-add-hidden-name').value.trim().toUpperCase();
      if (!name) { errorEl.textContent = 'Enter a name for the new hidden field.'; return; }
      if (!WebviewClientHelpers.isValidDdsName(name)) { errorEl.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).'; return; }
      if (rec.fields.some((f) => f.name === name)) { errorEl.textContent = 'A field named "' + name + '" already exists in this record.'; return; }
      const length = Math.max(1, parseInt(document.getElementById('p-add-hidden-length').value, 10) || 1);
      const decimalsRaw = document.getElementById('p-add-hidden-decimals').value;
      const decimals = decimalsRaw !== '' ? Math.max(0, parseInt(decimalsRaw, 10) || 0) : null;
      const dataType = document.getElementById('p-add-hidden-type').value;
      commitSourceChange(
        (lines) => DspfWriter.insertField(rec, lines, {
          nameType: 'FIELD',
          name: name,
          length: length,
          decimalPositions: decimals,
          dataType: dataType,
          usage: 'H',
          location: { line: null, column: null },
        }),
        () => {
          const freshRec = model.records.find((r) => r.name === recordName);
          const newField = freshRec && freshRec.fields[freshRec.fields.length - 1];
          setSingleSelection(newField ? newField.sourceLine : null);
        }
      );
    });
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
      // Task: *DATE/*TIME/*USER/*SYSTEM(SYSNAME)/*PAGNBR system-value
      // constants previously had NO way to be created here at all - "Enter
      // the constant text" was required, with nothing offering the
      // alternative of a keyword-only, no-text constant. A checkbox swaps
      // the Text input for a dropdown of the five real DDS keywords that
      // make a constant field display a system-supplied value instead of
      // literal text (see renderFieldProps's own isSystemValueConstant
      // doc comment for the full keyword list/reasoning).
      html += '<div class="field-row"><label><input type="checkbox" id="p-place-sysval-toggle" /> System value (date/time/user/etc.) instead of literal text</label></div>';
      html += '<div id="p-place-text-wrap" class="field-row"><label>Text</label><input type="text" id="p-place-text" placeholder="Constant text" /></div>';
      const sysValueLabels = { DATE: 'DATE - current date', TIME: 'TIME - current time', USER: 'USER - signed-on user profile', SYSNAME: 'SYSNAME - system name', PAGNBR: 'PAGNBR - page number' };
      html += '<div id="p-place-sysval-wrap" class="field-row" style="display:none;"><label>System value</label><select id="p-place-sysval">' +
        ['DATE', 'TIME', 'USER', 'SYSNAME', 'PAGNBR'].map((v) => '<option value="' + v + '">' + sysValueLabels[v] + '</option>').join('') +
        '</select></div>';
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
    const sysvalToggle = document.getElementById('p-place-sysval-toggle');
    if (sysvalToggle) {
      sysvalToggle.addEventListener('change', () => {
        document.getElementById('p-place-text-wrap').style.display = sysvalToggle.checked ? 'none' : '';
        document.getElementById('p-place-sysval-wrap').style.display = sysvalToggle.checked ? '' : 'none';
      });
    }
    document.getElementById('p-place-add').addEventListener('click', () => {
      const errorEl = document.getElementById('p-place-error');
      errorEl.textContent = '';
      const rec = model.records.find((r) => r.name === recordName);
      if (!rec) { errorEl.textContent = 'No record selected.'; return; }

      const line = Math.max(1, parseInt(document.getElementById('p-place-line').value, 10) || pendingPlacement.line);
      const column = Math.max(1, parseInt(document.getElementById('p-place-col').value, 10) || pendingPlacement.column);

      let newFieldSpec;
      if (kind === 'CONSTANT') {
        if (sysvalToggle && sysvalToggle.checked) {
          const chosen = document.getElementById('p-place-sysval').value;
          newFieldSpec = { nameType: 'CONSTANT', constantValue: null, keywords: [{ name: chosen, parameters: '', conditions: [], sourceLines: [] }], location: { line: line, column: column } };
        } else {
          const text = document.getElementById('p-place-text').value;
          if (!text) { errorEl.textContent = 'Enter the constant text.'; return; }
          newFieldSpec = { nameType: 'CONSTANT', constantValue: text, location: { line: line, column: column } };
        }
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
          setSingleSelection(newField ? newField.sourceLine : null);
        }
      );
    });
  }

  // Task L10: multi-field props panel, shown instead of renderFieldProps
  // whenever more than one field is selected (see renderProps' own branch
  // above). Deliberately narrower than the single-field panel - Name/
  // Length/Type/Position/Validity etc. only make sense for exactly ONE
  // field at a time (there's no single "position" for a block of fields at
  // different coordinates, and forcing every selected field to the same
  // name/length would be destructive) - real SDA's own block operations
  // (see this task's own LIMITATIONS-PLAN.md entry, the '- -'/'= =' line
  // commands) are move/copy/delete for exactly this reason: a block is
  // moved, duplicated, deleted, or restyled as a unit, but its individual
  // fields keep their own individual identities. So this panel covers
  // exactly that: a live count of the selection, Style (Color &
  // attributes) applied identically to every selected field via
  // commitMultiFieldKeywordEdit, and the same duplicate/cut/copy/delete
  // affordances the single-field panel's own footer already documents,
  // routed to their *Selection multi-field counterparts instead.
  function renderMultiFieldProps(recordName) {
    const selected = getSelectedFields().filter((s) => s.record.name === recordName);
    if (selected.length <= 1) { renderProps(recordName); return; }
    const fields = selected.map((s) => s.field);
    const editable = fields.every((f) => DspfWriter.isEditable(f));
    const primary = fields[0];

    let html = '<div class="status" style="margin-bottom:12px;">' + fields.length + ' fields selected. Shift/Ctrl-click ' +
      'or drag a rectangle on the canvas to change the selection; drag any selected field to move the whole block ' +
      'together.</div>';
    html += '<div class="section-label">Align</div>' +
      '<div class="align-btn-row">' +
      '<button class="secondary align-btn" id="p-align-left" title="Align left edges to the leftmost field in the selection">&#8676; Left</button>' +
      '<button class="secondary align-btn" id="p-align-right" title="Align right edges to the rightmost field in the selection">Right &#8677;</button>' +
      '<button class="secondary align-btn" id="p-align-top" title="Align top edges to the topmost field in the selection">&#8593; Top</button>' +
      '<button class="secondary align-btn" id="p-align-bottom" title="Align bottom edges to the bottommost field in the selection">&#8595; Bottom</button>' +
      '</div>' +
      '<div class="align-btn-row">' +
      '<button class="secondary align-btn" id="p-distribute-h" title="Space evenly between the leftmost and rightmost field, left-to-right" ' + (fields.length < 3 ? 'disabled' : '') + '>&#8596; Distribute horiz.</button>' +
      '<button class="secondary align-btn" id="p-distribute-v" title="Space evenly between the topmost and bottommost field, top-to-bottom" ' + (fields.length < 3 ? 'disabled' : '') + '>&#8597; Distribute vert.</button>' +
      '</div>' +
      // Task L12 leftover - the single-field Position tab's own "Center on
      // screen" (p-center) only makes sense for one field at a time; the
      // block counterpart flagged in L12 ("centering a BLOCK of multiple
      // selected fields together at once... fold into Task L10 once
      // multi-select lands") never actually got built when L10 landed -
      // Left/Right/Top/Bottom/Distribute all shipped but Center didn't.
      // This centers the WHOLE selection as one unit (same shape as
      // Align Left/Right above, not a per-field center) - every field
      // keeps its position relative to the others; the group's combined
      // bounding box (leftmost left edge to rightmost right edge) is
      // centered against the current screen width instead.
      '<div class="align-btn-row">' +
      '<button class="secondary align-btn" id="p-center-group" title="Center the whole selection as a block, keeping each field\u2019s position relative to the others">&#8596; Center on screen</button>' +
      '</div>';
    html += WebviewClientHelpers.colorAttrStatesHtml(primary.keywords, 'multiselect-colorattr', expandedKeywordConditioning);
    html += '<button id="p-multi-copy" class="secondary" style="width:100%;margin-top:16px;">Duplicate selection</button>';
    html += '<div class="delete-hint">Press Delete or Backspace to remove all ' + fields.length + ' selected fields. ' +
      'Ctrl+D duplicates the whole block in place; Ctrl+X/C/V cut/copy/paste it as one block (Ctrl+V pastes into ' +
      'whichever record is currently shown, even a different one). Arrow keys nudge the whole block together ' +
      '(Shift = 5 cells). Color &amp; attributes below applies to every selected field at once, replacing each ' +
      'field\u2019s own color/attribute state while leaving its other keywords untouched.</div>';
    propsBody.innerHTML = html;
    if (!editable) return;

    document.getElementById('p-multi-copy').addEventListener('click', () => commitCopySelection(recordName));

    // Suggestion B - align/distribute the selected group. Each button
    // computes its own 'targets' (per-field { field, newLine, newColumn })
    // from the group's CURRENT positions at click-time, then hands off to
    // commitAlignEdit (see its own doc comment for why targets are
    // computed up front rather than incrementally). Alignment/distribution
    // is column/line-only - a field's own length/height (and therefore its
    // right/bottom edge) come from resolveScreen's own field resolution,
    // not stored on the raw parsed field, so "align right"/"align bottom"
    // reuse the SAME rendered field list render() just built (via
    // lastScreen) to know each field's actual occupied width/height,
    // falling back to a width of 1 for a field lastScreen doesn't carry
    // (conditioned out at the moment, say) rather than skipping it.
    function occupiedWidthHeight(field) {
      const resolved = lastScreen && lastScreen.fields && lastScreen.fields.find((rf) => rf.sourceLine === field.sourceLine);
      return { width: resolved ? resolved.length : 1, height: resolved ? (resolved.height || 1) : 1 };
    }
    function currentLineCol(field) {
      return { line: field.location.line != null ? field.location.line : 1, column: field.location.column != null ? field.location.column : 1 };
    }
    const alignLeftBtn = document.getElementById('p-align-left');
    if (alignLeftBtn) alignLeftBtn.addEventListener('click', () => {
      const leftmost = Math.min(...fields.map((f) => currentLineCol(f).column));
      const targets = fields.map((f) => ({ field: f, newLine: currentLineCol(f).line, newColumn: leftmost }));
      commitAlignEdit(recordName, targets);
    });
    const alignRightBtn = document.getElementById('p-align-right');
    if (alignRightBtn) alignRightBtn.addEventListener('click', () => {
      const rightEdges = fields.map((f) => currentLineCol(f).column + occupiedWidthHeight(f).width - 1);
      const rightmostEdge = Math.max(...rightEdges);
      const targets = fields.map((f) => ({ field: f, newLine: currentLineCol(f).line, newColumn: Math.max(1, rightmostEdge - occupiedWidthHeight(f).width + 1) }));
      commitAlignEdit(recordName, targets);
    });
    const alignTopBtn = document.getElementById('p-align-top');
    if (alignTopBtn) alignTopBtn.addEventListener('click', () => {
      const topmost = Math.min(...fields.map((f) => currentLineCol(f).line));
      const targets = fields.map((f) => ({ field: f, newLine: topmost, newColumn: currentLineCol(f).column }));
      commitAlignEdit(recordName, targets);
    });
    const alignBottomBtn = document.getElementById('p-align-bottom');
    if (alignBottomBtn) alignBottomBtn.addEventListener('click', () => {
      const bottomEdges = fields.map((f) => currentLineCol(f).line + occupiedWidthHeight(f).height - 1);
      const bottommostEdge = Math.max(...bottomEdges);
      const targets = fields.map((f) => ({ field: f, newLine: Math.max(1, bottommostEdge - occupiedWidthHeight(f).height + 1), newColumn: currentLineCol(f).column }));
      commitAlignEdit(recordName, targets);
    });
    // Task L12 leftover (see the button's own HTML comment above) - center
    // the group's combined bounding box against the CURRENT screen width
    // (lastScreen.columns, same DSPSIZ-aware source the single-field
    // p-center button already uses), then shift every field by that same
    // delta so the block's internal layout is untouched - a straight
    // horizontal translation of the whole selection, not a per-field
    // "center each field individually" (which would destroy their
    // relative alignment).
    const centerGroupBtn = document.getElementById('p-center-group');
    if (centerGroupBtn) centerGroupBtn.addEventListener('click', () => {
      const columns = (lastScreen && lastScreen.columns) || 80;
      const leftEdges = fields.map((f) => currentLineCol(f).column);
      const rightEdges = fields.map((f) => currentLineCol(f).column + occupiedWidthHeight(f).width - 1);
      const leftmost = Math.min(...leftEdges);
      const rightmost = Math.max(...rightEdges);
      const groupWidth = rightmost - leftmost + 1;
      const newLeftmost = Math.max(1, Math.floor((columns - groupWidth) / 2) + 1);
      const delta = newLeftmost - leftmost;
      const targets = fields.map((f) => ({ field: f, newLine: currentLineCol(f).line, newColumn: Math.max(1, currentLineCol(f).column + delta) }));
      commitAlignEdit(recordName, targets);
    });
    // Distribute: spaces field CENTERS evenly between the leftmost and
    // rightmost (or topmost/bottommost) member's own center, left-to-right
    // (or top-to-bottom) by current position - the endpoints themselves
    // don't move, only what's between them. Needs at least 3 fields to mean
    // anything (2 fields have nothing "between" them to redistribute) - the
    // buttons are disabled below that, per their own 'disabled' attribute
    // in the HTML above.
    const distributeHBtn = document.getElementById('p-distribute-h');
    if (distributeHBtn) distributeHBtn.addEventListener('click', () => {
      if (fields.length < 3) return;
      const withCenters = fields.map((f) => ({ field: f, line: currentLineCol(f).line, center: currentLineCol(f).column + occupiedWidthHeight(f).width / 2 }))
        .sort((a, b) => a.center - b.center);
      const firstCenter = withCenters[0].center;
      const lastCenter = withCenters[withCenters.length - 1].center;
      const step = (lastCenter - firstCenter) / (withCenters.length - 1);
      const targets = withCenters.map((w, i) => ({
        field: w.field,
        newLine: w.line,
        newColumn: Math.max(1, Math.round(firstCenter + step * i - occupiedWidthHeight(w.field).width / 2)),
      }));
      commitAlignEdit(recordName, targets);
    });
    const distributeVBtn = document.getElementById('p-distribute-v');
    if (distributeVBtn) distributeVBtn.addEventListener('click', () => {
      if (fields.length < 3) return;
      const withCenters = fields.map((f) => ({ field: f, column: currentLineCol(f).column, center: currentLineCol(f).line + occupiedWidthHeight(f).height / 2 }))
        .sort((a, b) => a.center - b.center);
      const firstCenter = withCenters[0].center;
      const lastCenter = withCenters[withCenters.length - 1].center;
      const step = (lastCenter - firstCenter) / (withCenters.length - 1);
      const targets = withCenters.map((w, i) => ({
        field: w.field,
        newLine: Math.max(1, Math.round(firstCenter + step * i - occupiedWidthHeight(w.field).height / 2)),
        newColumn: w.column,
      }));
      commitAlignEdit(recordName, targets);
    });

    // The Style editor is built once, against the PRIMARY field's own
    // current color/attribute states (purely for what's shown pre-checked).
    // Task L10 follow-up (reported as "existing color and attributes are
    // removed and newly selected added"): this used to compute the
    // primary's FULL new state list and stamp that same list onto every
    // OTHER selected field too, silently discarding whatever THEY already
    // had. Now: oldStatesBeforeEdit captures primary's states as of this
    // render; each onChange only fires for ONE edit at a time (a color
    // change, one attribute checkbox, one "+ Add", or one "Remove" - see
    // wireRepeatableConditionedInstances' own onChange contract), so
    // DspfWriter.diffColorAttrStates turns that before/after pair into a
    // small structured diff of WHAT changed. Primary itself gets the
    // exact newKeywordsForPrimary already computed (no need to replay a
    // diff onto the field it came from); every OTHER selected field gets
    // that SAME diff replayed via DspfWriter.applyColorAttrStatesDiff,
    // which merges into (or removes from) whatever state IT already had
    // under the same conditions - preserving each field's own untouched
    // color/attrs instead of overwriting them with primary's. A diff
    // shape diffColorAttrStates can't confidently interpret (null) falls
    // back to the old uniform-replace, matching prior behavior rather
    // than guessing. fields[0] is always primary - commitMultiFieldKeywordEdit
    // walks the fields array in that exact order, so the first computeNewKeywords
    // call is guaranteed to be primary's own.
    const oldStatesBeforeEdit = DspfWriter.getColorAttrStates(primary.keywords);
    WebviewClientHelpers.wireColorAttrStatesEditor(primary.keywords, (newKeywordsForPrimary) => {
      const newStates = DspfWriter.getColorAttrStates(newKeywordsForPrimary);
      const diff = DspfWriter.diffColorAttrStates(oldStatesBeforeEdit, newStates);
      let callIndex = 0;
      commitMultiFieldKeywordEdit(recordName, fields, (f) => {
        const isPrimary = callIndex === 0;
        callIndex++;
        if (isPrimary) return newKeywordsForPrimary;
        if (!diff) return DspfWriter.setColorAttrStates(f.keywords, newStates);
        return DspfWriter.applyColorAttrStatesDiff(f.keywords, diff);
      });
    }, 'multiselect-colorattr', expandedKeywordConditioning, () => renderMultiFieldProps(recordName));
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

    // --- Keywords tab: Task R1's SDA-style category subtabs on top (the
    // "Select Record Keywords" picker), raw keyword chip editor + conditioning
    // collapsed underneath for anything not covered here. Task R2: a USRDFN
    // record's own "Select Record Keywords" menu only offers 4 of R1's 8
    // categories (see WebviewClientHelpers.isUsrDfnRecord's doc comment) -
    // narrow the subtabs to that subset for USRDFN records specifically.
    const rkPrefix = 'rk-' + rec.name;
    const rkPanels = WebviewClientHelpers.recordKeywordsPanelsHtml(rec.keywords, rkPrefix, expandedKeywordConditioning);
    const isUsrDfn = WebviewClientHelpers.isUsrDfnRecord(rec);
    const rkTabs = isUsrDfn
      ? [
          { id: 'general', label: 'General', content: rkPanels.general },
          { id: 'help', label: 'Help', content: rkPanels.help },
          { id: 'print', label: 'Print', content: rkPanels.print },
        ]
      : [
          { id: 'general', label: 'General', content: rkPanels.general },
          { id: 'indicator', label: 'Indicator', content: rkPanels.indicatorKeywords },
          { id: 'help', label: 'Help', content: rkPanels.help },
          { id: 'output', label: 'Output', content: rkPanels.output },
          { id: 'input', label: 'Input', content: rkPanels.input },
          { id: 'overlay', label: 'Overlay', content: rkPanels.overlay },
          { id: 'print', label: 'Print', content: rkPanels.print },
        ];
    const rkActiveTab = rkTabs.some((t) => t.id === activeRecordKwTab) ? activeRecordKwTab : rkTabs[0].id;
    let keywordsHtml = subtabsHtml(rkTabs, rkActiveTab);
    keywordsHtml += accordionHtml('Advanced / raw keywords', WebviewClientHelpers.keywordEditorHtml(rec.keywords, 'record-' + rec.name, expandedKeywordConditioning), false);
    keywordsHtml += accordionHtml('Conditioning', WebviewClientHelpers.conditionsEditorHtml(rec.conditions, 'record', expandedKeywordConditioning), false);

    // --- Command keys tab --- (only this record's own keywords exclude
    // numbers here; a number already used at the file level can still be
    // picked to override it for this record - see the comment above
    // DspfWriter.availableCommandKeyNumbers). Task L31: uses
    // DspfWriter.allCommandKeyNumbers() now - a number already used
    // WITHIN this record no longer excludes it either (multiple
    // independently-conditioned instances of the same number).
    const availableForRecord = DspfWriter.allCommandKeyNumbers();
    const commandKeysHtml = WebviewClientHelpers.commandKeysSectionHtml('this record', rec.keywords, availableForRecord, 'record', expandedKeywordConditioning);

    // --- Structure tab: help entries + source field order + reference fields + comments ---
    let structureHtml = helpEntriesListHtml(rec) + fieldOrderListHtml(rec);
    const referenceFieldCount = (rec.fields || []).filter((f) => f.isReference).length;
    if (referenceFieldCount > 0) {
      structureHtml += '<button id="p-resolve-all-ref" class="secondary" style="width:100%;margin-top:16px;">Resolve all referenced fields (' + referenceFieldCount + ')</button>';
    }
    // Task L13 - record-level comment lines, same section shape as the
    // file-level Comments tab in renderFileProps.
    const recPrefix = 'reccomments-' + rec.name;
    structureHtml += commentsListHtml(DspfWriter.getRecordComments(model, rec), recPrefix);

    // --- Hidden tab: usage=H fields have no on-screen footprint to click,
    // so they need their own add/select/delete surface separate from the
    // canvas-click flow every other field/constant uses.
    const hiddenHtml = hiddenFieldsSectionHtml(rec);

    // --- SFLMSG tab: only for message-subfile records (Task R5) - Message
    // Record/General/Indicator stacked as accordions within one tab, same
    // "several accordions in one tab" shape the Keywords tab above already
    // uses, rather than 3 more entries in the top-level tab bar.
    const isSflMsg = WebviewClientHelpers.isSflMsgRecord(rec);
    let sflMsgPanels = null;
    if (isSflMsg) {
      sflMsgPanels = WebviewClientHelpers.sflMsgPanelsHtml(rec, expandedKeywordConditioning);
    }

    // --- Window tab: only for records carrying WINDOW (Task R7) - Window
    // Parameters/Border Parameters stacked as accordions within one tab,
    // same shape as the SFLMSG tab above. Reuses hasWindow (already
    // computed above for the Basic tab's Window Title field) rather than
    // calling WebviewClientHelpers.isWindowRecord separately - same check.
    const rwPrefix = 'rw-' + rec.name;
    let windowPanels = null;
    if (hasWindow) {
      windowPanels = WebviewClientHelpers.windowPanelsHtml(rec.keywords, rwPrefix, expandedKeywordConditioning);
    }

    // --- Pull-down tab: only for records carrying PULLDOWN (Task R10) -
    // General (the PULLDOWN keyword's own *SLTIND/*RSTCSR sub-flags) and
    // Border Parameters (reusing R7's WDWBORDER panel) stacked as
    // accordions within one tab, same shape as the Window tab above.
    const rpdPrefix = 'rpd-' + rec.name;
    const isPulldown = WebviewClientHelpers.isPulldownRecord(rec);
    let pulldownPanels = null;
    if (isPulldown) {
      pulldownPanels = WebviewClientHelpers.pulldownPanelsHtml(rec.keywords, rpdPrefix);
    }

    // --- SFL tab: only for plain subfile records (Task R3) - not shown
    // for SFLMSG records, which get their own SFLMSG tab above covering
    // the same ground plus its own Message Record category.
    const isSfl = WebviewClientHelpers.isSflRecord(rec);
    let sflPanels = null;
    if (isSfl) {
      sflPanels = WebviewClientHelpers.sflKeywordsPanelsHtml(rec.keywords, 'sfl-' + rec.name, expandedKeywordConditioning);
    }

    // --- SFLCTL tab: only for subfile CONTROL records (Task R4) - General/
    // Indicator/Display Layout/Subfile Messages stacked as accordions
    // within one tab, same shape as the other record-type-specific tabs
    // above. General's own accordion folds in R3's Subfile Keywords
    // (SFLNXTCHG/LOGOUT/LOGINP/KEEP/CHECK) directly rather than showing a
    // separate "SFL" tab on a control record, which would be confusing.
    const sflCtlPrefix = 'sflctl-' + rec.name;
    const isSflCtl = WebviewClientHelpers.isSflCtlRecord(rec);
    let sflCtlPanels = null;
    if (isSflCtl) {
      sflCtlPanels = WebviewClientHelpers.sflCtlPanelsHtml(rec.keywords, sflCtlPrefix, expandedKeywordConditioning);
    }

    // --- MNUBAR tab: only for menu-bar records (Task R13) - single
    // General accordion (MNUBAR itself + reused MNUBARSW/MNUCNL). Menu-Bar
    // display keywords (MNUBARDSP) already live on R1's base General tab,
    // shown for every record including this one - not duplicated here.
    const mnuBarPrefix = 'mnubar-' + rec.name;
    const isMnuBar = WebviewClientHelpers.isMnuBarRecord(rec);
    let mnuBarPanels = null;
    if (isMnuBar) {
      mnuBarPanels = WebviewClientHelpers.mnuBarPanelsHtml(rec.keywords, mnuBarPrefix, expandedKeywordConditioning);
    }

    const tabs = [
      { id: 'basic', label: 'Basic', content: basicHtml },
      { id: 'keywords', label: 'Keywords', content: keywordsHtml },
      { id: 'commandkeys', label: 'Cmd keys', content: commandKeysHtml },
      { id: 'structure', label: 'Structure', content: structureHtml },
      { id: 'hidden', label: 'Hidden', content: hiddenHtml },
    ];
    if (isSflMsg) {
      const sflMsgHtml =
        accordionHtml('Message Record', sflMsgPanels.messageRecord, true) +
        accordionHtml('General', sflMsgPanels.general, false) +
        accordionHtml('Indicator', sflMsgPanels.indicator, false);
      tabs.push({ id: 'sflmsg', label: 'SFLMSG', content: sflMsgHtml });
    }
    if (hasWindow) {
      const windowHtml =
        accordionHtml('Window Parameters', windowPanels.windowParameters, true) +
        accordionHtml('Border Parameters', windowPanels.borderParameters, false);
      tabs.push({ id: 'window', label: 'Window', content: windowHtml });
    }
    if (isPulldown) {
      const pulldownHtml =
        accordionHtml('General', pulldownPanels.general, true) +
        accordionHtml('Border Parameters', pulldownPanels.borderParameters, false);
      tabs.push({ id: 'pulldown', label: 'Pull-down', content: pulldownHtml });
    }
    if (isSfl) {
      const sflHtml =
        accordionHtml('General', sflPanels.general, true) +
        accordionHtml('Indicator', sflPanels.indicator, false);
      tabs.push({ id: 'sfl', label: 'SFL', content: sflHtml });
    }
    if (isSflCtl) {
      const sflCtlHtml =
        accordionHtml('General', sflCtlPanels.general, true) +
        accordionHtml('Indicator', sflCtlPanels.indicator, false) +
        accordionHtml('Display Layout', sflCtlPanels.displayLayout, false) +
        accordionHtml('Subfile Messages', sflCtlPanels.subfileMessages, false);
      tabs.push({ id: 'sflctl', label: 'SFLCTL', content: sflCtlHtml });
    }
    if (isMnuBar) {
      const mnuBarHtml = accordionHtml('General', mnuBarPanels.general, true);
      tabs.push({ id: 'mnubar', label: 'MNUBAR', content: mnuBarHtml });
    }
    html += tabsHtml(tabs, activeRecordTab);

    html += '<button id="p-record-copy" class="secondary" style="width:100%;margin-top:16px;" ' + (editable ? '' : 'disabled title="Multi-group or >3-indicator conditioning — copying this record is disabled to avoid corrupting it."') + '>Copy record</button>';
    html += '<button id="p-record-delete" class="secondary" style="width:100%;margin-top:8px;color:var(--warn);">Delete record</button>';
    propsBody.innerHTML = html;
    wireTabs(propsBody, (id) => { activeRecordTab = id; });
    wireSubTabs(propsBody, (id) => { activeRecordKwTab = id; });

    document.getElementById('p-record-rename').addEventListener('click', () => commitRecordRename(recordName));
    document.getElementById('p-record-copy').addEventListener('click', () => { if (editable) commitCopyRecord(recordName); });
    document.getElementById('p-record-delete').addEventListener('click', () => commitDeleteRecord(recordName));
    const resolveAllBtn = document.getElementById('p-resolve-all-ref');
    if (resolveAllBtn) {
      resolveAllBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'resolveAllReferencedFields', recordName: recordName });
      });
    }

    wireHiddenFieldsSection(recordName, rec);

    // Task L13 - record-level comments. fallbackAfterLine is the record's
    // own header/keyword end line (getRecordLineRange, not
    // getFullRecordLineRange - i.e. right before the first field, same
    // spot insertField itself defaults to for a record with no fields
    // yet), only actually used when this record has NO existing comments.
    wireCommentsSection(
      recPrefix,
      () => {
        const freshRec = model.records.find((r) => r.name === recordName);
        return freshRec ? DspfWriter.getRecordComments(model, freshRec) : [];
      },
      DspfWriter.getRecordLineRange(rec)[1],
      (comments, fallbackAfterLine) => commitSourceChange((lines) => DspfWriter.addComment(lines, comments, fallbackAfterLine, '')),
      (line, text) => commitSourceChange((lines) => DspfWriter.updateComment(lines, line, text)),
      (line) => commitSourceChange((lines) => DspfWriter.deleteComment(lines, line))
    );

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
    WebviewClientHelpers.wireCommandKeysSection('record', rec.keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    WebviewClientHelpers.wireRecordKeywordsPanels(rkPrefix, () => model.records.find((r) => r.name === recordName).keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    WebviewClientHelpers.wireKeywordEditor(rec.keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), 'record-' + rec.name, expandedKeywordConditioning, () => renderRecordProps(recordName));
    WebviewClientHelpers.wireConditionsEditor('record', rec.conditions, (newConditions) => commitRecordEdit(recordName, { conditions: newConditions }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    if (isSflMsg) {
      WebviewClientHelpers.wireSflMsgPanels(() => model.records.find((r) => r.name === recordName).keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    }
    if (hasWindow) {
      WebviewClientHelpers.wireWindowPanels(rwPrefix, () => model.records.find((r) => r.name === recordName).keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    }
    if (isPulldown) {
      WebviewClientHelpers.wirePulldownPanels(rpdPrefix, () => model.records.find((r) => r.name === recordName).keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }));
    }
    if (isSfl) {
      WebviewClientHelpers.wireSflKeywordsPanels('sfl-' + rec.name, () => model.records.find((r) => r.name === recordName).keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    }
    if (isSflCtl) {
      WebviewClientHelpers.wireSflCtlPanels(sflCtlPrefix, () => model.records.find((r) => r.name === recordName).keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    }
    if (isMnuBar) {
      WebviewClientHelpers.wireMnuBarPanels(mnuBarPrefix, () => model.records.find((r) => r.name === recordName).keywords, (newKeywords) => commitRecordEdit(recordName, { keywords: newKeywords }), expandedKeywordConditioning, () => renderRecordProps(recordName));
    }
  }

  function renderHelpProps(recordName) {
    const rec = model.records.find((r) => r.name === recordName);
    const help = rec && rec.helpEntries.find((h) => h.sourceLine === selectedHelpSourceLine);
    if (!help) { selectedHelpSourceLine = null; renderRecordProps(recordName); return; }

    const editable = DspfWriter.isEditable(help);
    let html = '<button id="p-back" class="secondary" style="width:100%;margin-bottom:12px;">&larr; Back to record</button>';
    html += '<div class="section-label">Help entry</div>';
    if (!editable) html += '<div class="warn">Multi-group or &gt;3-indicator conditioning — editing this help entry is disabled to avoid corrupting it. Edit the source directly.</div>';
    // Task L5d-ii: the dedicated "Application help" fields
    // (HLPPNLGRP/HLPEXCLD/HLPBDY/HLPARA) live here now, against this HELP
    // entry's OWN keywords - not the record's - since that's the actual
    // DDS structure (see WebviewClientHelpers.applicationHelpFieldsHtml's
    // own doc comment). The raw keyword editor below still covers
    // anything else an H specification might carry.
    if (editable) html += WebviewClientHelpers.applicationHelpFieldsHtml(help.keywords, 'help-' + help.sourceLine, expandedKeywordConditioning);
    html += accordionHtml('Advanced / raw keywords', WebviewClientHelpers.keywordEditorHtml(help.keywords, 'help-' + help.sourceLine, expandedKeywordConditioning), false);
    propsBody.innerHTML = html;

    document.getElementById('p-back').addEventListener('click', () => { selectedHelpSourceLine = null; renderProps(recordName); });
    if (!editable) return;
    WebviewClientHelpers.wireApplicationHelpFields('help-' + help.sourceLine, () => model.records.find((r) => r.name === recordName).helpEntries.find((h) => h.sourceLine === selectedHelpSourceLine).keywords, (newKeywords) => commitHelpEdit(recordName, help, { keywords: newKeywords }), expandedKeywordConditioning, () => renderHelpProps(recordName));
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

  // Generic blocking confirmation dialog: a small modal overlay appended to
  // <body>, used before an action whose effects the DDS model can't verify
  // are actually safe (see commitDelete / Task L2 in
  // docs/sda-reference/LIMITATIONS-PLAN.md). A plain window.confirm() would
  // block the whole webview process and doesn't match this app's theme, so
  // this is a DOM-built equivalent instead. Removes any dialog already open
  // first (last one wins) rather than stacking them. Clicking the backdrop
  // or Cancel dismisses without calling onConfirm; only the confirm button
  // does.
  function showConfirmDialog(title, bodyText, confirmLabel, onConfirm) {
    const existing = document.querySelector('.confirm-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML =
      '<div class="confirm-dialog">' +
      '<div class="confirm-dialog-title">' + DspfEngine.escapeHtml(title) + '</div>' +
      '<div class="confirm-dialog-body">' + DspfEngine.escapeHtml(bodyText) + '</div>' +
      '<div class="confirm-dialog-actions">' +
      '<button class="secondary confirm-dialog-cancel">Cancel</button>' +
      '<button class="danger confirm-dialog-confirm">' + DspfEngine.escapeHtml(confirmLabel) + '</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-dialog-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.confirm-dialog-confirm').addEventListener('click', () => {
      overlay.remove();
      onConfirm();
    });
  }

  // Task L2 (docs/sda-reference/LIMITATIONS-PLAN.md): a field with likely
  // references elsewhere in the source (the same advisory
  // findLikelyNameReferences scan rename already falls back on) is no
  // longer deleted immediately with only a passive post-hoc warning toast -
  // it's blocked on an actionable confirmation FIRST, naming exactly which
  // lines look affected, so the person can back out before losing the field
  // rather than discovering the problem after the fact. There's still no
  // auto-fix target to rewrite those references TO (same reasoning rename
  // itself documents), so confirming still leaves them dangling - the
  // dialog says so up front. A field with NO detected references (the
  // common case) deletes immediately, exactly as before - this doesn't add
  // a click to the common path. Only runs for a genuinely named field
  // (REFFLD and similar keywords reference fields by name); a bare,
  // unnamed constant has nothing to search for and always deletes
  // immediately too.
  function commitDelete(field) {
    const references = field.name
      ? WebviewClientHelpers.findLikelyNameReferences(sourceText, field.name, DspfWriter.getFieldLineRange(field))
      : [];
    if (references.length > 0) {
      showConfirmDialog(
        'Delete "' + field.name + '"?',
        'Line(s) ' + references.join(', ') + ' in this source look like they might still reference "' + field.name +
          '" (e.g. REFFLD) - deleting a field never rewrites other keywords that reference it, so those references ' +
          'will be left dangling. Delete anyway?',
        'Delete anyway',
        () => performFieldDelete(field)
      );
      return;
    }
    performFieldDelete(field);
  }

  function performFieldDelete(field) {
    commitSourceChange(
      (lines) => DspfWriter.deleteField(field, lines),
      () => { clearSelection(); }
    );
  }

  // Task L10: multi-field delete - same reference-check-then-confirm flow
  // commitDelete uses for one field, just checked/reported across every
  // selected field at once (one combined dialog naming every affected
  // field, rather than one dialog per field) and committed via
  // DspfWriter.deleteFields (already existed before this task - see its own
  // doc comment for why a delete, unlike copy/paste, can safely compute
  // every field's line range up front and remove them bottom-to-top in one
  // pass, with no reparse loop needed).
  function commitDeleteSelection() {
    const selected = getSelectedFields();
    if (selected.length === 0) return;
    if (selected.length === 1) { commitDelete(selected[0].field); return; }
    const fields = selected.map((s) => s.field);
    const refPairs = fields
      .filter((f) => f.name)
      .map((f) => ({ name: f.name, lines: WebviewClientHelpers.findLikelyNameReferences(sourceText, f.name, DspfWriter.getFieldLineRange(f)) }))
      .filter((r) => r.lines.length > 0);
    const doDelete = () => {
      commitSourceChange(
        (lines) => DspfWriter.deleteFields(fields, lines),
        () => { clearSelection(); }
      );
    };
    if (refPairs.length > 0) {
      const detail = refPairs.map((r) => '"' + r.name + '" (line(s) ' + r.lines.join(', ') + ')').join('; ');
      showConfirmDialog(
        'Delete ' + fields.length + ' selected fields?',
        'Some of these look like they might still be referenced elsewhere in this source (e.g. REFFLD) - deleting never ' +
          'rewrites other keywords that reference a field, so those references will be left dangling: ' + detail + '. Delete anyway?',
        'Delete anyway',
        doDelete
      );
      return;
    }
    doDelete();
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
        setSingleSelection(newField ? newField.sourceLine : null);
      }
    );
  }

  // Task L10: inserts a SNAPSHOT of one or more fields/constants into
  // 'recordName', each shifted by the SAME uniform delta (default: one row
  // below its own original line, same column) - a uniform delta is what
  // keeps a pasted/duplicated BLOCK looking like the block it was copied
  // from (every field's position relative to its neighbors is preserved),
  // rather than every field independently landing "one row below itself"
  // and piling up on the same spot. Generalizes copyField/commitCopy's own
  // single-field "one row below, same column" default to N fields.
  //
  // Uses a per-field reparse loop, same as commitGroupEdit's own doc
  // comment explains: insertField's placement rule ("append after the
  // record's current last field") depends on the LIVE document state, so a
  // batch of inserts genuinely needs to re-parse between each one - unlike
  // deleteFields' up-front bottom-to-top pass, which works precisely
  // because a delete's line ranges are already fully known before anything
  // is removed. Appending always happens strictly AFTER every field
  // inserted so far (insertField never inserts above existing content), so
  // each newly-inserted field's own sourceLine stays valid against every
  // later iteration's reparsed model, and is still valid once the whole
  // loop (and this function) finishes - callers can trust the returned
  // sourceLine list against 'model'/'sourceText' as they stand afterward.
  //
  // Returns the array of new fields' sourceLine (same order as
  // 'fieldSnapshots', skipping any that failed to insert), so the caller
  // can select them.
  function pasteFieldsBlock(recordName, fieldSnapshots, deltaLine, deltaColumn) {
    deltaLine = deltaLine != null ? deltaLine : 1;
    deltaColumn = deltaColumn != null ? deltaColumn : 0;
    let lines = sourceText.split(/\\r\\n|\\r|\\n/);
    let currentModel = model;
    const insertedSourceLines = [];
    fieldSnapshots.forEach((f) => {
      const rec = currentModel.records.find((r) => r.name === recordName);
      if (!rec) return;
      const options = {};
      if (f.location && f.location.line != null && f.location.column != null) {
        options.location = { line: f.location.line + deltaLine, column: f.location.column + deltaColumn };
      }
      lines = DspfWriter.copyField(rec, lines, f, options);
      currentModel = DspfParser.parseDspf(lines.join('\\n'));
      const freshRec = currentModel.records.find((r) => r.name === recordName);
      const newField = freshRec && freshRec.fields[freshRec.fields.length - 1];
      if (newField) insertedSourceLines.push(newField.sourceLine);
    });
    sourceText = lines.join('\\n');
    model = currentModel;
    return insertedSourceLines;
  }

  // Task L10: Ctrl+D over a multi-select - duplicates every selected
  // field/constant together, in the SAME record, as one block (see
  // pasteFieldsBlock's own doc comment), then selects the whole new block -
  // same "land somewhere sensible, then drag it into place" spirit
  // commitCopy's own doc comment already sets for a single field.
  function commitCopySelection(recordName) {
    const selected = getSelectedFields().filter((s) => s.record.name === recordName);
    if (selected.length === 0) return;
    if (selected.length === 1) { commitCopy(recordName, selected[0].field); return; }
    try {
      const snapshots = selected.map((s) => JSON.parse(JSON.stringify(s.field)));
      const inserted = pasteFieldsBlock(recordName, snapshots);
      selectedKeys = inserted.map((sl) => ({ sourceLine: sl }));
      selectedKey = selectedKeys.length ? selectedKeys[selectedKeys.length - 1] : null;
      activePulldown = null;
      suppressNextExternalUpdate = true;
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      render();
    } catch (err) {
      vscode.postMessage({ type: 'error', message: err.message });
    }
  }

  // Arrow-key nudge: moves the selected field/constant by one grid cell per
  // press (Shift held = 5, a coarser "page" step for covering distance
  // quickly - the same 1-vs-bigger-step convention most design tools use for
  // keyboard nudging), committed the exact same way a drag's mouseup is -
  // commitEdit with an absolute { line, column } - so it's undo/redo-
  // equivalent to dragging that same distance. Clamped to a 1-based minimum,
  // same clamp startDrag's own onMove applies while the mouse is moving.
  // Task L10: when more than one field is selected, nudges the WHOLE
  // selection together by the same delta via commitGroupEdit (the exact
  // same "move N fields by one delta, one batched source edit" machinery
  // the multi-select group-drag mousedown handler above already uses) -
  // single-selection nudging keeps its original single-field path
  // unchanged, including its own relative-offset-column fallback (a
  // multi-field nudge always has an absolute baseline per field already,
  // via commitGroupEdit's own column fallback, so that fallback doesn't
  // need to be threaded through here too).
  function nudgeSelected(deltaLine, deltaColumn) {
    const selected = getSelectedFields();
    if (selected.length === 0) return;
    if (selected.length > 1) {
      const recordName = selected[0].record.name;
      const sameRecord = selected.filter((s) => s.record.name === recordName);
      commitGroupEdit(recordName, sameRecord.map((s) => s.field), deltaLine, deltaColumn);
      return;
    }
    const { record, field } = selected[0];
    const selectedEl = document.querySelector('.selected[data-render-column]');
    const origSourceLine = field.location.line != null ? field.location.line : 1;
    // Same fallback commitEdit's own drag counterpart (startDrag) uses: an
    // absolute column isn't always known (a field placed at a
    // relative-offset column inside a window - see the comment near
    // startDrag), so fall back to the rendered column actually on screen.
    const fallbackColumn = selectedEl ? parseInt(selectedEl.getAttribute('data-render-column'), 10) : 1;
    const origSourceColumn = field.location.column != null ? field.location.column : fallbackColumn;
    const newLine = Math.max(1, origSourceLine + deltaLine);
    const newColumn = Math.max(1, origSourceColumn + deltaColumn);
    if (newLine === origSourceLine && newColumn === origSourceColumn) return;
    commitEdit(record.name, field, { line: newLine, column: newColumn });
  }

  // Cut: same reference-check-then-confirm flow commitDelete already uses
  // (deleting a field never rewrites other keywords that reference it by
  // name, so that's still worth flagging before removing it). The
  // clipboard snapshot is only taken right before the field ACTUALLY gets
  // deleted (either path below) - not up front - so cancelling the
  // confirmation dialog leaves the clipboard untouched instead of loading
  // it with something that was never actually cut.
  function commitCut(recordName, field) {
    const references = field.name
      ? WebviewClientHelpers.findLikelyNameReferences(sourceText, field.name, DspfWriter.getFieldLineRange(field))
      : [];
    const doCut = () => {
      clipboardField = { recordName, fields: [JSON.parse(JSON.stringify(field))] };
      performFieldDelete(field);
    };
    if (references.length > 0) {
      showConfirmDialog(
        'Delete "' + field.name + '"?',
        'Line(s) ' + references.join(', ') + ' in this source look like they might still reference "' + field.name +
          '" (e.g. REFFLD) - deleting a field never rewrites other keywords that reference it, so those references ' +
          'will be left dangling. Cut anyway?',
        'Cut anyway',
        doCut
      );
      return;
    }
    doCut();
  }

  // Task L10: multi-field cut - same "snapshot into the clipboard right
  // before it actually gets deleted" ordering as single-field commitCut,
  // built on the same combined-confirmation multi-delete
  // commitDeleteSelection uses (see its own doc comment) so a multi-cut
  // that finds likely references gets ONE dialog naming every affected
  // field, not one per field.
  function commitCutSelection() {
    const selected = getSelectedFields();
    if (selected.length === 0) return;
    if (selected.length === 1) { commitCut(selected[0].record.name, selected[0].field); return; }
    const recordName = selected[0].record.name;
    const fields = selected.filter((s) => s.record.name === recordName).map((s) => s.field);
    const refPairs = fields
      .filter((f) => f.name)
      .map((f) => ({ name: f.name, lines: WebviewClientHelpers.findLikelyNameReferences(sourceText, f.name, DspfWriter.getFieldLineRange(f)) }))
      .filter((r) => r.lines.length > 0);
    const doCut = () => {
      clipboardField = { recordName, fields: fields.map((f) => JSON.parse(JSON.stringify(f))) };
      commitSourceChange(
        (lines) => DspfWriter.deleteFields(fields, lines),
        () => { clearSelection(); }
      );
    };
    if (refPairs.length > 0) {
      const detail = refPairs.map((r) => '"' + r.name + '" (line(s) ' + r.lines.join(', ') + ')').join('; ');
      showConfirmDialog(
        'Delete ' + fields.length + ' selected fields?',
        'Some of these look like they might still be referenced elsewhere in this source (e.g. REFFLD) - deleting never ' +
          'rewrites other keywords that reference a field, so those references will be left dangling: ' + detail + '. Cut anyway?',
        'Cut anyway',
        doCut
      );
      return;
    }
    doCut();
  }

  // Copy: snapshots the field into the in-memory clipboard without
  // touching the source - see clipboardField's own doc comment above for
  // why this is a plain-data snapshot rather than a live model reference.
  // Task L10: clipboardField now always holds a 'fields' ARRAY (even for a
  // single field) so commitPaste has one path to handle regardless of how
  // many fields were copied/cut - see clipboardField's own updated doc
  // comment above 'let clipboardField'.
  function commitClipboardCopy(recordName, field) {
    clipboardField = { recordName, fields: [JSON.parse(JSON.stringify(field))] };
  }

  // Task L10: multi-field copy (Ctrl+C) - snapshots every selected field
  // (scoped to one record - a block select never spans records) into the
  // clipboard together, so a subsequent Paste inserts the whole block at
  // once via pasteFieldsBlock, not one field at a time.
  function commitClipboardCopySelection() {
    const selected = getSelectedFields();
    if (selected.length === 0) return;
    if (selected.length === 1) { commitClipboardCopy(selected[0].record.name, selected[0].field); return; }
    const recordName = selected[0].record.name;
    const fields = selected.filter((s) => s.record.name === recordName).map((s) => s.field);
    clipboardField = { recordName, fields: fields.map((f) => JSON.parse(JSON.stringify(f))) };
  }

  // Paste: inserts the clipboard snapshot into whichever record is
  // CURRENTLY being viewed (recordSelect.value) - which may be a different
  // record than the one it was copied/cut from, unlike Ctrl+D's own
  // always-same-record duplicate. Reuses pasteFieldsBlock (Task L10 - see
  // its own doc comment) for both a single-field and a multi-field
  // clipboard, since a length-1 'fields' array degenerates to exactly the
  // old single-field behavior (copyField's own default placement - one row
  // below, same column - covers the same-record paste case as cleanly as
  // it covers duplicate; for a cross-record paste it's simply the pasted
  // field's own original position shifted down one row, since there's no
  // "one row below itself" to speak of in a different record).
  // copyField's own nextAvailableFieldName call handles a name collision
  // with the target record automatically - note it ALWAYS assigns a fresh
  // suffixed name (see its own doc comment), never reusing the original
  // exactly even if it's free again (e.g. after a Cut immediately followed
  // by a Paste back into the same record) - same behavior every other
  // copyField caller already has, so Paste doesn't special-case it.
  function commitPaste() {
    if (!clipboardField || !clipboardField.fields || clipboardField.fields.length === 0) return;
    const recordName = recordSelect.value || (model.records[0] && model.records[0].name);
    const rec = model.records.find((r) => r.name === recordName);
    if (!rec) return;
    try {
      const inserted = pasteFieldsBlock(recordName, clipboardField.fields);
      selectedKeys = inserted.map((sl) => ({ sourceLine: sl }));
      selectedKey = selectedKeys.length ? selectedKeys[selectedKeys.length - 1] : null;
      selectedHelpSourceLine = null;
      showFileProps = false;
      activePulldown = null;
      suppressNextExternalUpdate = true;
      vscode.postMessage({ type: 'applyEdit', text: sourceText });
      render();
    } catch (err) {
      vscode.postMessage({ type: 'error', message: err.message });
    }
  }

  function commitEdit(recordName, field, updates) {
    commitSourceChange(
      (lines) => DspfWriter.applyFieldUpdate(field, lines, updates),
      () => {
        const rec = model.records.find((r) => r.name === recordName);
        // A CONSTANT (including a system-value one - Task L16) has no
        // "name" at all, so matching by name here always failed for one -
        // selection silently dropped back to nothing after every single
        // edit, forcing a re-click each time. applyFieldUpdate only ever
        // rewrites a field's OWN existing line(s) in place - it never
        // inserts/removes lines elsewhere - so "sourceLine" is still a
        // valid, stable match for an unnamed field post-edit.
        const stillThere = rec && (field.name
          ? rec.fields.find((f) => f.name === field.name)
          : rec.fields.find((f) => f.sourceLine === field.sourceLine));
        // Task L10's own selectedKeys array must stay in sync with
        // selectedKey (see its own doc comment above) - going through
        // setSingleSelection/clearSelection here instead of assigning
        // selectedKey directly is what actually keeps that invariant, not
        // just updating selectedKey alone.
        setSingleSelection(stillThere ? stillThere.sourceLine : null);
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
        clearSelection();
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
        clearSelection();
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

  // Delete/Backspace deletes the currently-selected field/constant, or (Task
  // L10) every field in the current multi-select at once via
  // commitDeleteSelection; Ctrl+D (Cmd+D on macOS) duplicates the selection
  // in place, one row below, in the SAME record (see commitCopy/
  // commitCopySelection's own doc comments) - same guards as delete (not
  // while typing in a props-panel input, not mid-drag). Ctrl+X/C/V are a
  // SEPARATE cut/copy/paste pair built on top of the in-memory
  // clipboardField (see its own doc comment above) - unlike Ctrl+D, Ctrl+V's
  // paste target is whichever record is CURRENTLY being viewed, which may
  // differ from where the field(s) were cut/copied from. Arrow keys nudge
  // the selection by one grid cell (Shift = 5) - see nudgeSelected's own
  // doc comment for how a multi-select nudges as one block via
  // commitGroupEdit. None of Ctrl+D/X/C/V are the OS/browser's own reserved
  // shortcuts in any way that matters inside a webview with no text
  // selection or bookmark bar for them to collide with.
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const isDuplicateShortcut = mod && e.key.toLowerCase() === 'd';
    const isDeleteShortcut = e.key === 'Delete' || e.key === 'Backspace';
    const isCutShortcut = mod && e.key.toLowerCase() === 'x';
    const isCopyShortcut = mod && e.key.toLowerCase() === 'c';
    const isPasteShortcut = mod && e.key.toLowerCase() === 'v';
    const isArrowKey = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    if (!isDuplicateShortcut && !isDeleteShortcut && !isCutShortcut && !isCopyShortcut && !isPasteShortcut && !isArrowKey) return;
    if (dragState) return;
    if (document.querySelector('.confirm-overlay')) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (isPasteShortcut) {
      if (!clipboardField) return;
      e.preventDefault();
      commitPaste();
      return;
    }
    const selected = getSelectedFields();
    if (selected.length === 0) return;
    if (isArrowKey) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowUp') nudgeSelected(-step, 0);
      else if (e.key === 'ArrowDown') nudgeSelected(step, 0);
      else if (e.key === 'ArrowLeft') nudgeSelected(0, -step);
      else nudgeSelected(0, step);
      return;
    }
    e.preventDefault();
    if (isDuplicateShortcut) commitCopySelection(selected[0].record.name);
    else if (isCutShortcut) commitCutSelection();
    else if (isCopyShortcut) commitClipboardCopySelection();
    else commitDeleteSelection();
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'externalUpdate') {
      if (suppressNextExternalUpdate) { suppressNextExternalUpdate = false; return; }
      sourceText = msg.text;
      model = DspfParser.parseDspf(sourceText);
      clearSelection();
      render();
    } else if (msg.type === 'databaseFieldsResult') {
      // Task L14 - see showDatabaseFieldsPicker's own comment for why this
      // hook lives on the overlay element rather than module-level state.
      const overlay = document.querySelector('.dbfields-overlay');
      if (overlay && overlay.__onDatabaseFieldsResult) overlay.__onDatabaseFieldsResult(msg);
    } else if (msg.type === 'codeForIStatus') {
      updateCodeForIBadge(msg.installed, msg.connected);
    } else if (msg.type === 'dirtyState') {
      updateSaveButtonDirtyState(msg.isDirty);
    }
  });

  recordSelect.addEventListener('change', () => { clearSelection(); selectedHelpSourceLine = null; showFileProps = false; activePulldown = null; previewMultipleRows = false; previewRowsToggle.checked = false; render(); });

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

export function getWebviewHtml(cspSource: string, nonce: string, initialSource: string, fileName: string, uiStyle: string = 'modern', uiTheme: string = 'green'): string {
  return HTML_TEMPLATE
    .split(${JSON.stringify(CSP_TOKEN)}).join(cspSource)
    .split(${JSON.stringify(NONCE_TOKEN)}).join(nonce)
    .split(${JSON.stringify(FILENAME_TOKEN)}).join(fileName)
    .split(${JSON.stringify(INITIAL_SOURCE_JSON_TOKEN)}).join(JSON.stringify(initialSource))
    .split(${JSON.stringify(UI_STYLE_TOKEN)}).join(uiStyle)
    .split(${JSON.stringify(UI_THEME_TOKEN)}).join(uiTheme);
}
`;

fs.writeFileSync(path.join(__dirname, 'webviewTemplate.ts'), output);
console.log('wrote src/webviewTemplate.ts (' + output.length + ' chars)');

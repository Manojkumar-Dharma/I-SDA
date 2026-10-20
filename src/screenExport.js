/**
 * screenExport.js - E5b: the screen the designer previews, as a standalone SVG or HTML document.
 *
 * Input is what `DspfEngine.resolveScreen` / `resolveMultiScreen` returns (a plain object: `lines`, `columns`, `fields`, `windows`,
 * `stacked`, ...), so the engine's own decisions (indicators, DSPATR, COLOR, windows, stacking) are the ones drawn; nothing is re-resolved
 * here. No `vscode` import, no DOM, no engine import: it runs in Node (tests, the batch export of E5f) and in the webview (E5c raster).
 *
 *   var svg  = ScreenExport.buildSvg(screen, { theme: { accent: '#ffb347' }, ruler: false, title: 'CUSTMNT' });
 *   var html = ScreenExport.buildHtml(screen, opts);     // the same drawing, in a standalone page
 *
 * Decisions (E5a, roadmap):
 *   - The screen only. The ruler is `opts.ruler` (off by default). Never drawn: crosshair, compare-mode dimmed records, selection outline,
 *     compile badges, hover titles.
 *   - Colours follow the designer's theme: `opts.theme.accent` is the default field colour; an explicit COLOR keeps its own hex.
 *   - No remote asset, no embedded font: the `--mono` stack of the preview. Every text run is placed on the character grid with an explicit
 *     `textLength`, so a fallback font changes the look but never the layout.
 *   - A still image: BL (blink) is not animated; hidden fields are left out.
 *   - The HTML is the SVG inside a page, so the two formats cannot disagree.
 *
 * Drawn: fields and constants (with HI, RI, UL, PR, input underline, the DSPATR(PC) cursor block), the CSRLOC cursor, windows (box or
 * WDWBORDER *CHAR border, title), pull-down boxes and their fields, menu-bar separators, ERRMSG lines, the subfile preview and its
 * SFLEND marks (More..., +, scroll bar). Not drawn: the inside of radio buttons, check boxes, push buttons and CNTFLD (their text only),
 * and the per-row choice state colours (CHCAVAIL / CHCUNAVAIL / CHCSLT, E10c).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScreenExport = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The preview's own look (buildWebviewTemplate.js): font-size 14px / line-height 1.4em there; here whole pixels, so a PNG at 1x/2x/3x
  // stays on the pixel grid. All of it is presentation, none of it DDS.
  var METRICS = { cellWidth: 9, cellHeight: 20, fontSize: 15, baseline: 15, underlineOffset: 18, padding: 12, rulerColumns: 3, rulerRows: 2 };
  var FONT_STACK = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  var DEFAULT_THEME = {
    accent: '#33ff66',            // --accent: the default colour of a field with no COLOR keyword
    background: '#050705',        // the screen frame
    windowBackground: '#0a0f0c',  // inside a window
    windowBorder: '#3a5a45',
    inkDim: '#6f8c7d',            // ruler, window title, window border characters
    warn: '#ff8a5c'               // a window whose position is set at runtime, ERRMSG lines
  };

  function num(n) { return String(Math.round(n * 100) / 100); }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  /** XML text / attribute escaping; control characters other than tab, LF, CR are not legal in XML 1.0 and are dropped. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** '#rgb', '#rrggbb' or 'rgb(r, g, b)' (what getComputedStyle gives) to '#rrggbb'; anything else is the fallback. */
  function color(value, fallback) {
    var s = String(value == null ? '' : value).trim();
    var m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return '#' + m[1].split('').map(function (c) { return c + c; }).join('').toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i.exec(s);
    if (m) {
      return '#' + [m[1], m[2], m[3]].map(function (c) { var v = Math.min(255, Number(c)); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    }
    return fallback;
  }

  /** The CSS `filter: brightness(k)` of DSPATR(HI): every channel times k, capped at 255. */
  function brighten(hex, k) {
    var h = hex.replace('#', '');
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.min(255, Math.round(parseInt(h.substr(i * 2, 2), 16) * k));
      out += (v < 16 ? '0' : '') + v.toString(16);
    }
    return out;
  }

  function resolveTheme(theme) {
    var t = theme || {};
    var out = {};
    Object.keys(DEFAULT_THEME).forEach(function (k) { out[k] = color(t[k], DEFAULT_THEME[k]); });
    return out;
  }

  /**
   * The classes the preview gives a field (dspfEngine.js renderFieldDiv), minus the choice-state ones. They are not needed to draw
   * the SVG (every attribute is also written out), but they let a test compare this serialiser with the engine, field by field.
   */
  function fieldClasses(f) {
    var style = f.style || {};
    var classes = ['dspf-field', 'dspf-' + String(f.nameType || '').toLowerCase()];
    if (f.nameType === 'FIELD') {
      var u = String(f.usage || '').toUpperCase();
      if (u) classes.push('dspf-usage-' + u.toLowerCase());
      var dt = String(f.dataType || '').toUpperCase();
      classes.push(dt === 'S' || dt === 'Y' || dt === 'N' || dt === 'D' || dt === 'F' ? 'dspf-dtype-num' : 'dspf-dtype-char');
    }
    if (style.hi) classes.push('dspf-hi');
    if (style.reverse) classes.push('dspf-reverse');
    if (style.underline) classes.push('dspf-underline');
    if (style.blink) classes.push('dspf-blink');
    if (style.protect) classes.push('dspf-protect');
    if (f.showCursorIndicator) classes.push('dspf-cursor-pos');
    if (f.widget) classes.push('dspf-widget-' + f.widget.type);
    if (f.cntfld) classes.push('dspf-cntfld');
    if (f.tag === 'pulldown') classes.push('dspf-pulldown-field');
    return classes;
  }

  function Drawing(screen, opts) {
    this.screen = screen;
    this.theme = resolveTheme(opts && opts.theme);
    this.ruler = !!(opts && opts.ruler);
    this.columns = isNum(screen.columns) && screen.columns > 0 ? Math.floor(screen.columns) : 80;
    this.lines = isNum(screen.lines) && screen.lines > 0 ? Math.floor(screen.lines) : 24;
    this.ox = METRICS.padding + (this.ruler ? METRICS.rulerColumns * METRICS.cellWidth : 0);
    this.oy = METRICS.padding + (this.ruler ? METRICS.rulerRows * METRICS.cellHeight : 0);
    this.width = this.ox + this.columns * METRICS.cellWidth + METRICS.padding;
    this.height = this.oy + this.lines * METRICS.cellHeight + METRICS.padding;
    this.items = [];
  }

  Drawing.prototype.x = function (col) { return this.ox + (col - 1) * METRICS.cellWidth; };
  Drawing.prototype.y = function (line) { return this.oy + (line - 1) * METRICS.cellHeight; };
  /** Items are painted by z (a stack layer, else the default of their kind), then in the order they were added (the preview's DOM order). */
  Drawing.prototype.add = function (z, svg) { if (svg) this.items.push({ z: z, n: this.items.length, svg: svg }); };

  /** One run of text starting at a cell: leading and trailing blanks become position, the rest is pinned to its cells with textLength. */
  Drawing.prototype.text = function (line, col, text, maxCells, fill, extra) {
    var s = String(text == null ? '' : text).replace(/[\r\n\t]/g, ' ');
    if (maxCells != null) s = s.substring(0, Math.max(0, maxCells));
    var lead = s.length - s.replace(/^ +/, '').length;
    var body = s.replace(/^ +/, '').replace(/ +$/, '');
    if (!body) return '';
    return '<text x="' + num(this.x(col + lead)) + '" y="' + num(this.y(line) + METRICS.baseline) + '" textLength="' + num(body.length * METRICS.cellWidth) +
      '" lengthAdjust="spacing" fill="' + fill + '"' + (extra || '') + '>' + esc(body).replace(/ /g, '&#160;') + '</text>';
  };

  Drawing.prototype.rect = function (line, col, h, w, attrs) {
    return '<rect x="' + num(this.x(col)) + '" y="' + num(this.y(line)) + '" width="' + num(w * METRICS.cellWidth) + '" height="' + num(h * METRICS.cellHeight) + '" ' + attrs + '/>';
  };

  Drawing.prototype.underline = function (line, col, w, stroke) {
    var y = this.y(line) + METRICS.underlineOffset + 0.5;
    return '<line x1="' + num(this.x(col)) + '" y1="' + num(y) + '" x2="' + num(this.x(col + w)) + '" y2="' + num(y) + '" stroke="' + stroke + '" stroke-width="1"/>';
  };

  Drawing.prototype.field = function (f, defaultZ) {
    if (!f || !isNum(f.line) || !isNum(f.column) || !isNum(f.length) || f.length < 1) return;
    var style = f.style || {};
    if (style.hidden) return;
    var t = this.theme;
    var base = color(style.color, t.accent);
    var fg = style.hi ? brighten(base, 1.6) : base;
    var height = isNum(f.height) && f.height > 1 ? Math.floor(f.height) : 1;
    var parts = [];
    var cellBg = f.inWindow ? t.windowBackground : t.background;
    // A stacked (multi-record) screen: a later record overwrites the earlier one instead of printing over it (P14).
    if (this.screen.stacked) parts.push(this.rect(f.line, f.column, height, f.length, 'fill="' + cellBg + '"'));
    if (style.reverse) parts.push(this.rect(f.line, f.column, height, f.length, 'fill="' + fg + '"'));
    var textFill = style.reverse ? t.background : fg;
    var weight = style.hi ? ' font-weight="600"' : '';
    var rows = String(f.text == null ? '' : f.text).split('\n');
    var underlined = !!style.underline || (f.nameType === 'FIELD' && /^[IB]$/i.test(String(f.usage || '')));
    for (var r = 0; r < Math.min(rows.length, height); r++) {
      parts.push(this.text(f.line + r, f.column, rows[r], f.length, textFill, weight));
      if (underlined) parts.push(this.underline(f.line + r, f.column, f.length, textFill));
    }
    if (f.showCursorIndicator) parts.push(this.rect(f.line, f.column, 1, 1, 'fill="' + fg + '"'));
    parts = parts.filter(Boolean);
    if (!parts.length) return;
    this.add(isNum(f.stackLayer) ? f.stackLayer : defaultZ,
      '<g class="' + esc(fieldClasses(f).join(' ')) + '"' + (style.protect ? ' opacity="0.65"' : '') + '>' + parts.join('') + '</g>');
  };

  Drawing.prototype.window = function (w) {
    if (!w || !isNum(w.line) || !isNum(w.col) || !isNum(w.width) || !isNum(w.height) || w.width < 1 || w.height < 1) return;
    var t = this.theme;
    var border = w.border || { color: null, attrs: [], chars: [] };
    var attrs = border.attrs || [];
    var chars = border.chars || [];
    var charMode = chars.some(function (c) { return c && c !== ' '; });
    var explicit = border.color ? color(border.color, null) : null;
    var z = isNum(w.stackLayer) ? w.stackLayer : 0;
    var parts = [];
    var x = this.x(w.col), y = this.y(w.line), bw = w.width * METRICS.cellWidth, bh = w.height * METRICS.cellHeight;
    if (!charMode) parts.push('<rect x="' + num(x + 3) + '" y="' + num(y + 3) + '" width="' + num(bw) + '" height="' + num(bh) + '" fill="#000000" fill-opacity="0.5"/>');
    var stroke = charMode ? '' : ' stroke="' + (explicit || (w.positionIsDefault ? t.warn : t.windowBorder)) + '" stroke-width="' + (attrs.indexOf('HI') >= 0 ? 3 : 2) + '"' + (w.positionIsDefault ? ' stroke-dasharray="6 4"' : '');
    parts.push('<rect x="' + num(x) + '" y="' + num(y) + '" width="' + num(bw) + '" height="' + num(bh) + '" fill="' + t.windowBackground + '"' + stroke + '/>');
    var title = [];
    if (w.recordName) title.push(w.recordName);
    if (w.title) title.push(w.title);
    if (w.positionIsDefault) title.push('position set at runtime');
    else if (w.previewStart) title.push('preview position');
    if (w.inheritedFrom) title.push('window shared with ' + w.inheritedFrom);
    if (title.length) {
      var label = title.join(' \u00b7 ');
      var lw = label.length * 6.6;
      parts.push('<rect x="' + num(x + 8) + '" y="' + num(y - 7) + '" width="' + num(lw + 12) + '" height="14" fill="' + t.windowBackground + '"/>' +
        '<text x="' + num(x + 14) + '" y="' + num(y + 4) + '" font-size="11" textLength="' + num(lw) + '" lengthAdjust="spacing" fill="' + t.inkDim + '">' + esc(label).replace(/ /g, '&#160;') + '</text>');
    }
    this.add(z, '<g class="dspf-window-border' + (charMode ? ' dspf-window-border-charmode' : '') + '">' + parts.join('') + '</g>');
    if (!charMode) return;
    // WDWBORDER *CHAR: the eight border characters, one per cell: corners, then top/bottom, then left/right.
    var cells = [];
    var top = w.line, bottom = w.line + w.height - 1, left = w.col, right = w.col + w.width - 1;
    var put = function (line, col, ch) { if (ch && ch !== ' ') cells.push({ line: line, col: col, ch: ch }); };
    put(top, left, chars[0]); put(top, right, chars[2]); put(bottom, left, chars[5]); put(bottom, right, chars[7]);
    var c, r;
    for (c = left + 1; c <= right - 1; c++) { put(top, c, chars[1]); put(bottom, c, chars[6]); }
    for (r = top + 1; r <= bottom - 1; r++) { put(r, left, chars[3]); put(r, right, chars[4]); }
    var fill = explicit || t.inkDim;
    var self = this;
    this.add(isNum(w.stackLayer) ? w.stackLayer + 1 : 1,
      '<g class="dspf-window-chars">' + cells.map(function (cl) { return self.text(cl.line, cl.col, cl.ch, 1, fill); }).join('') + '</g>');
  };

  Drawing.prototype.menuBarSeparator = function (sp) {
    if (!sp || !isNum(sp.line) || !isNum(sp.width) || sp.width < 1 || !sp.char) return;
    var a = sp.attrs || [];
    var c = color(sp.color, this.theme.accent);
    var parts = [];
    if (a.indexOf('RI') !== -1) parts.push(this.rect(sp.line, 1, 1, sp.width, 'fill="' + c + '"'));
    parts.push(this.text(sp.line, 1, new Array(sp.width + 1).join(String(sp.char).charAt(0)), sp.width, a.indexOf('RI') !== -1 ? this.theme.windowBackground : c, a.indexOf('HI') !== -1 ? ' font-weight="bold"' : ''));
    if (a.indexOf('UL') !== -1) parts.push(this.underline(sp.line, 1, sp.width, c));
    this.add(isNum(sp.stackLayer) ? sp.stackLayer : 1, '<g class="dspf-menubar-sep">' + parts.filter(Boolean).join('') + '</g>');
  };

  Drawing.prototype.errorMessage = function (em) {
    if (!em || !isNum(em.line) || !isNum(em.col) || !isNum(em.width) || em.width < 1) return;
    var t = this.theme;
    this.add(isNum(em.stackLayer) ? em.stackLayer : 1,
      '<g class="dspf-window-msgline"' + (em.unresolved ? ' opacity="0.8"' : '') + '>' +
      this.rect(em.line, em.col, 1, em.width, 'fill="' + t.warn + '" fill-opacity="0.1"') +
      this.text(em.line, em.col, em.text, em.width, t.warn, em.unresolved ? ' font-style="italic"' : '') + '</g>');
  };

  Drawing.prototype.subfilePreview = function (sfp) {
    var self = this;
    var t = this.theme;
    (sfp.fields || []).forEach(function (f) { self.field(f, 1); });
    if (sfp.scrollbar && isNum(sfp.scrollbar.line) && isNum(sfp.scrollbar.col) && sfp.scrollbar.height > 0 && sfp.scrollbar.width > 0) {
      var sb = sfp.scrollbar;
      var x = this.x(sb.col), y = this.y(sb.line), w = sb.width * METRICS.cellWidth, h = sb.height * METRICS.cellHeight;
      var arrow = 12;
      var trackY = y + arrow + 2, trackH = Math.max(0, h - 2 * (arrow + 2)), trackW = w * 0.6, trackX = x + (w - trackW) / 2;
      var thumbH = Math.max(4, trackH * 0.35);
      var thumbY = sb.boxState === 'bottom' ? trackY + trackH - thumbH : sb.boxState === 'more' ? trackY + trackH - trackH * 0.35 - thumbH : trackY;
      this.add(1, '<g class="dspf-subfile-scrollbar">' +
        '<rect x="' + num(x) + '" y="' + num(y) + '" width="' + num(w) + '" height="' + num(h) + '" fill="' + t.accent + '" fill-opacity="0.08"/>' +
        '<line x1="' + num(x + 0.5) + '" y1="' + num(y) + '" x2="' + num(x + 0.5) + '" y2="' + num(y + h) + '" stroke="' + t.accent + '" stroke-opacity="0.4" stroke-dasharray="3 3"/>' +
        '<rect x="' + num(trackX) + '" y="' + num(trackY) + '" width="' + num(trackW) + '" height="' + num(trackH) + '" rx="2" fill="' + t.accent + '" fill-opacity="0.15"/>' +
        '<rect x="' + num(trackX) + '" y="' + num(thumbY) + '" width="' + num(trackW) + '" height="' + num(thumbH) + '" rx="2" fill="' + t.accent + '" fill-opacity="0.55"/>' +
        '<text x="' + num(x + w / 2) + '" y="' + num(y + 10) + '" font-size="11" text-anchor="middle" fill="' + t.accent + '" fill-opacity="0.85">\u25B2</text>' +
        '<text x="' + num(x + w / 2) + '" y="' + num(y + h - 3) + '" font-size="11" text-anchor="middle" fill="' + t.accent + '" fill-opacity="0.85">\u25BC</text></g>');
    }
    if (sfp.moreLine && isNum(sfp.moreLine.line) && isNum(sfp.moreLine.textCol) && sfp.moreLine.textWidth > 0) {
      var ml = sfp.moreLine;
      var text = String(ml.text == null ? '' : ml.text);
      var lead = Math.max(0, ml.textWidth - text.length); // right-aligned in its span
      this.add(1, '<g class="dspf-subfile-more-line" opacity="0.85">' + this.text(ml.line, ml.textCol + lead, text, ml.textWidth, t.accent, ' font-style="italic"') + '</g>');
    }
    if (sfp.plusMark && isNum(sfp.plusMark.line) && isNum(sfp.plusMark.col)) {
      this.add(1, '<g class="dspf-subfile-plus" opacity="0.85">' + this.text(sfp.plusMark.line, sfp.plusMark.col, '+', 1, t.accent, ' font-weight="bold"') + '</g>');
    }
  };

  Drawing.prototype.pulldown = function (pd) {
    var self = this;
    var b = pd.box;
    if (b && isNum(b.line) && isNum(b.col) && b.width > 0 && b.height > 0) {
      this.add(2, '<g class="dspf-pulldown-border">' + this.rect(b.line, b.col, b.height, b.width, 'fill="' + this.theme.windowBackground + '" stroke="' + this.theme.windowBorder + '" stroke-width="2"') + '</g>');
    }
    (pd.fields || []).forEach(function (f) { self.field(f, 3); });
  };

  Drawing.prototype.cursor = function (c) {
    if (!c || !isNum(c.line) || !isNum(c.col)) return;
    this.add(3, '<g class="dspf-csrloc-cursor">' + this.rect(c.line, c.col, 1, 1, 'fill="' + this.theme.accent + '"') + '</g>');
  };

  /** The two ruler rows (tens, ones) above the screen and the two-digit line numbers beside it: the designer's own numbering. */
  Drawing.prototype.rulerSvg = function () {
    var t = this.theme;
    var tens = '', ones = '', c, r, out = [];
    for (c = 1; c <= this.columns; c++) {
      tens += c % 10 === 0 ? String(Math.floor(c / 10) % 10) : ' ';
      ones += String(c % 10);
    }
    var y0 = METRICS.padding;
    var runTop = '<text x="' + num(this.ox) + '" y="' + num(y0 + METRICS.baseline) + '" textLength="' + num(this.columns * METRICS.cellWidth) + '" lengthAdjust="spacing" fill="' + t.inkDim + '">';
    out.push(runTop + esc(tens).replace(/ /g, '&#160;') + '</text>');
    out.push('<text x="' + num(this.ox) + '" y="' + num(y0 + METRICS.cellHeight + METRICS.baseline) + '" textLength="' + num(this.columns * METRICS.cellWidth) + '" lengthAdjust="spacing" fill="' + t.inkDim + '">' + esc(ones) + '</text>');
    for (r = 1; r <= this.lines; r++) {
      out.push('<text x="' + num(METRICS.padding) + '" y="' + num(this.y(r) + METRICS.baseline) + '" textLength="' + num(2 * METRICS.cellWidth) + '" lengthAdjust="spacing" fill="' + t.inkDim + '">' + (r < 10 ? '0' : '') + r + '</text>');
    }
    return '<g class="dspf-ruler">' + out.join('') + '</g>';
  };

  Drawing.prototype.build = function (title, idPrefix) {
    var s = this.screen;
    var self = this;
    var windows = s.windows || (s.window ? [s.window] : []);
    windows.forEach(function (w) { self.window(w); });
    (s.fields || []).forEach(function (f) { self.field(f, 1); });
    (s.menuBarSeparators || (s.menuBarSeparator ? [s.menuBarSeparator] : [])).forEach(function (sp) { self.menuBarSeparator(sp); });
    if (s.subfilePreview) this.subfilePreview(s.subfilePreview);
    if (s.pulldown) this.pulldown(s.pulldown);
    (s.errorMessages || (s.errorMessage ? [s.errorMessage] : [])).forEach(function (em) { self.errorMessage(em); });
    this.cursor(s.cursor);
    var ordered = this.items.slice().sort(function (a, b) { return a.z - b.z || a.n - b.n; });
    var clipId = idPrefix + '-screen';
    var label = 'Screen preview' + (title ? ': ' + title : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + this.width + '" height="' + this.height + '" viewBox="0 0 ' + this.width + ' ' + this.height +
      '" role="img" aria-label="' + esc(label) + '" font-family="' + esc(FONT_STACK) + '" font-size="' + METRICS.fontSize + '">\n' +
      '<title>' + esc(label) + '</title>\n' +
      '<defs><clipPath id="' + clipId + '"><rect x="' + this.ox + '" y="' + this.oy + '" width="' + this.columns * METRICS.cellWidth + '" height="' + this.lines * METRICS.cellHeight + '"/></clipPath></defs>\n' +
      '<rect width="' + this.width + '" height="' + this.height + '" fill="' + this.theme.background + '"/>\n' +
      (this.ruler ? this.rulerSvg() + '\n' : '') +
      '<g clip-path="url(#' + clipId + ')">\n' + ordered.map(function (i) { return i.svg; }).join('\n') + '\n</g>\n</svg>\n';
  };

  function check(screen) {
    if (!screen || typeof screen !== 'object') throw new TypeError('ScreenExport: a resolved screen is required');
  }

  function titleOf(screen, opts) {
    var t = opts && opts.title != null ? opts.title : screen.recordName;
    return t == null ? '' : String(t);
  }

  function idPrefixOf(opts) {
    var p = opts && opts.idPrefix ? String(opts.idPrefix).replace(/[^A-Za-z0-9_-]/g, '') : '';
    return p || 'isda';
  }

  /** The screen as a standalone SVG document (a string). Throws a TypeError only when `screen` is not an object. */
  function buildSvg(screen, opts) {
    check(screen);
    return new Drawing(screen, opts).build(titleOf(screen, opts), idPrefixOf(opts));
  }

  /** The same drawing in a standalone HTML page: no script, no remote asset, the theme's background around the screen. */
  function buildHtml(screen, opts) {
    check(screen);
    var drawing = new Drawing(screen, opts);
    var title = titleOf(screen, opts);
    var svg = drawing.build(title, idPrefixOf(opts));
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(title ? 'Screen preview: ' + title : 'Screen preview') + '</title>\n' +
      '<style>html,body{margin:0;background:' + drawing.theme.background + ';}body{display:flex;justify-content:center;padding:16px;}svg{max-width:100%;height:auto;}</style>\n' +
      '</head>\n<body>\n' + svg + '</body>\n</html>\n';
  }

  return {
    buildSvg: buildSvg,
    buildHtml: buildHtml,
    fieldClasses: fieldClasses,
    brighten: brighten,
    parseColor: color,
    METRICS: METRICS,
    FONT_STACK: FONT_STACK,
    DEFAULT_THEME: DEFAULT_THEME
  };
});

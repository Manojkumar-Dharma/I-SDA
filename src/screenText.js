/**
 * screenText.js - E5d: the screen the designer previews, as a plain-text block (one character per cell).
 *
 * Input is what `DspfEngine.resolveScreen` / `resolveMultiScreen` returns, the same object `ScreenExport.buildSvg` (E5b) draws, so the
 * engine's own decisions (indicators, DSPATR, COLOR, windows, stacking) are the ones shown; nothing is re-resolved here. No `vscode`
 * import, no DOM, no engine import: it runs in Node (tests, the batch export of E5f) and in the webview.
 *
 *   var text = ScreenText.buildText(screen);                                  // `lines` rows of `columns` cells, right-trimmed
 *   var full = ScreenText.buildText(screen, { ruler: true, legend: true });   // with the row/column numbers and the attribute legend
 *
 * Decisions (E5a, roadmap; E5d results):
 *   - The grid is `lines` x `columns` of the screen size (80x24, 132x27, ...). Every row is written, so the block is always `lines` tall;
 *     trailing blanks are cut unless `opts.pad` is set. The ruler is `opts.ruler` (off by default), numbered as the designer's is.
 *   - It follows the picture's rules (screenExport.js): same paint order, same clipping to the DSPSIZ grid, hidden fields left out, blanks
 *     inside a field do not erase what is under them (only a stacked record's field, a window and a pull-down do).
 *   - `opts.legend` adds what a character grid cannot show, as two planes of the same size (display attributes as one hex digit per cell,
 *     colour as a letter per cell) plus the cursor position and the windows. Off by default.
 *   - Window and pull-down borders use box-drawing characters (`opts.ascii` for + - |). A window with its own WDWBORDER *CHAR characters
 *     draws those instead.
 *   - Control characters in a field's text become blanks, so a dump can be pasted into a terminal without surprises.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScreenText = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_COLUMNS = 512;
  var MAX_LINES = 256;
  /** Display-attribute bits of the legend plane: the digit in a cell is the sum of the bits that apply. */
  var ATTRIBUTE_BITS = { HI: 1, RI: 2, UL: 4, BL: 8 };
  /** The seven DDS COLOR values by the hex the engine draws them in (COLOR_HEX in dspfEngine.js; a test compares the two). */
  var COLOR_LETTERS = { '#4a9eff': 'B', '#ff5c5c': 'R', '#33ff66': 'G', '#4de6e0': 'T', '#ffe14d': 'Y', '#ff6ec7': 'P', '#f2f2f2': 'W' };
  var COLOR_NAMES = { B: 'BLU blue', R: 'RED red', G: 'GRN green', T: 'TRQ turquoise', Y: 'YLW yellow', P: 'PNK pink', W: 'WHT white' };
  var PLAIN = '.';

  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function int(n) { return Math.floor(n); }

  /** The letter of a field's colour: '.' when the field has none (it follows the screen colour), '*' for a colour that is not a DDS one. */
  function colorLetter(hex) {
    if (hex == null || hex === '') return PLAIN;
    var s = String(hex).trim().toLowerCase();
    return COLOR_LETTERS[s] || '*';
  }

  /** A string as cells (one per code point), control characters as blanks. */
  function cells(text) {
    return Array.from(String(text == null ? '' : text)).map(function (c) {
      var code = c.codePointAt(0);
      return code < 32 || (code >= 0x7f && code < 0xa0) || code === 0x2028 || code === 0x2029 ? ' ' : c;
    });
  }

  function Grid(screen, opts) {
    this.screen = screen;
    this.opts = opts || {};
    this.columns = isNum(screen.columns) && screen.columns > 0 ? int(screen.columns) : 80;
    this.lines = isNum(screen.lines) && screen.lines > 0 ? int(screen.lines) : 24;
    if (this.columns > MAX_COLUMNS || this.lines > MAX_LINES) throw new RangeError('ScreenText: a screen of ' + this.lines + ' x ' + this.columns + ' is not a display size');
    var n = this.columns * this.lines;
    this.ch = new Array(n);
    this.painted = new Array(n);
    this.attr = new Array(n);
    this.colour = new Array(n);
    for (var i = 0; i < n; i++) { this.ch[i] = ' '; this.painted[i] = false; this.attr[i] = 0; this.colour[i] = PLAIN; }
    this.items = [];
    this.cursors = [];
    this.separators = [];
    this.windowList = [];
    this.ascii = !!this.opts.ascii;
  }

  Grid.prototype.index = function (line, col) {
    return line >= 1 && line <= this.lines && col >= 1 && col <= this.columns ? (line - 1) * this.columns + (col - 1) : -1;
  };
  /** Items are painted by z (a stack layer, else the default of their kind), then in the order they were added, as in the picture. */
  Grid.prototype.add = function (z, draw) { this.items.push({ z: z, n: this.items.length, draw: draw }); };

  /** Paint one cell: `ch` null keeps the character that is there (a blank cell that is only reversed or underlined). */
  Grid.prototype.put = function (line, col, ch, bits, letter) {
    var i = this.index(line, col);
    if (i < 0) return;
    if (ch != null) this.ch[i] = ch;
    this.painted[i] = true;
    this.attr[i] = bits;
    this.colour[i] = letter;
  };
  Grid.prototype.mark = function (line, col, bits, letter) {
    var i = this.index(line, col);
    if (i < 0) return;
    this.painted[i] = true;
    this.attr[i] |= bits;
    this.colour[i] = letter;
  };
  /** A rectangle that hides what is under it (a window's inside, a stacked record's field, a pull-down). */
  Grid.prototype.clear = function (line, col, h, w) {
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
      var i = this.index(line + r, col + c);
      if (i < 0) continue;
      this.ch[i] = ' '; this.painted[i] = false; this.attr[i] = 0; this.colour[i] = PLAIN;
    }
  };
  /** A reverse-image block: opaque, the characters under it are gone. */
  Grid.prototype.fill = function (line, col, h, w, bits, letter) {
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
      var i = this.index(line + r, col + c);
      if (i < 0) continue;
      this.ch[i] = ' '; this.painted[i] = true; this.attr[i] = bits; this.colour[i] = letter;
    }
  };

  /** A run of text from a cell: leading blanks are position, blanks inside do not erase, `maxCells` cuts it. */
  Grid.prototype.text = function (line, col, text, maxCells, bits, letter) {
    var s = cells(text);
    if (maxCells != null) s = s.slice(0, Math.max(0, maxCells));
    for (var k = 0; k < s.length; k++) if (s[k] !== ' ') this.put(line, col + k, s[k], bits, letter);
  };

  Grid.prototype.field = function (f, defaultZ) {
    var self = this;
    if (!f || !isNum(f.line) || !isNum(f.column) || !isNum(f.length) || f.length < 1) return;
    var style = f.style || {};
    if (style.hidden) return;
    var length = int(f.length);
    var height = isNum(f.height) && f.height > 1 ? int(f.height) : 1;
    var letter = colorLetter(style.color);
    var line = int(f.line), col = int(f.column);
    var rows = String(f.text == null ? '' : f.text).split('\n');
    var underlined = !!style.underline || (f.nameType === 'FIELD' && /^[IB]$/i.test(String(f.usage || '')));
    var textBits = (style.hi ? ATTRIBUTE_BITS.HI : 0) | (style.reverse ? ATTRIBUTE_BITS.RI : 0) | (style.blink ? ATTRIBUTE_BITS.BL : 0);
    var cs = !!style.columnSeparators; // E11i: a '|' in the field's blank cells and one legend line per separated field
    var lineBits = (style.reverse ? ATTRIBUTE_BITS.RI : 0) | (underlined ? ATTRIBUTE_BITS.UL : 0);
    this.add(isNum(f.stackLayer) ? f.stackLayer : defaultZ, function () {
      if (self.screen.stacked) self.clear(line, col, height, length);
      if (style.reverse) self.fill(line, col, height, length, ATTRIBUTE_BITS.RI, letter);
      for (var r = 0; r < Math.min(rows.length, height); r++) {
        self.text(line + r, col, rows[r], length, textBits | (underlined ? ATTRIBUTE_BITS.UL : 0), letter);
        if (underlined) for (var c = 0; c < length; c++) self.mark(line + r, col + c, lineBits, letter);
        if (cs) for (var k = 0; k < length; k++) {
          var ci = self.index(line + r, col + k);
          if (ci >= 0 && self.ch[ci] === ' ') { self.ch[ci] = '|'; self.painted[ci] = true; }
        }
      }
    });
    if (cs) this.separators.push({ line: line, col: col, width: length, height: height });
    if (f.showCursorIndicator) this.cursors.push({ line: line, col: col });
  };

  /** A box: its inside is cleared, its edge cells carry the border. `style` is 'solid' or 'dashed' (a window whose position is set at runtime). */
  Grid.prototype.box = function (line, col, h, w, dashed, bits, letter) {
    var A = this.ascii;
    var horizontal = dashed ? (A ? '.' : '\u2504') : (A ? '-' : '\u2500');
    var vertical = dashed ? (A ? ':' : '\u2506') : (A ? '|' : '\u2502');
    var corner = { tl: A ? '+' : '\u250c', tr: A ? '+' : '\u2510', bl: A ? '+' : '\u2514', br: A ? '+' : '\u2518' };
    this.clear(line, col, h, w);
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
      var top = r === 0, bottom = r === h - 1, left = c === 0, right = c === w - 1;
      if (!(top || bottom || left || right)) continue;
      var ch;
      if ((top || bottom) && (left || right)) ch = top ? (left ? corner.tl : corner.tr) : (left ? corner.bl : corner.br);
      else ch = top || bottom ? horizontal : vertical;
      this.put(line + r, col + c, ch, bits, letter);
    }
  };

  Grid.prototype.window = function (w) {
    var self = this;
    if (!w || !isNum(w.line) || !isNum(w.col) || !isNum(w.width) || !isNum(w.height) || w.width < 1 || w.height < 1) return;
    var border = w.border || { color: null, attrs: [], chars: [] };
    var attrs = border.attrs || [];
    var chars = border.chars || [];
    var charMode = chars.some(function (c) { return c && c !== ' '; });
    var letter = colorLetter(border.color);
    var bits = attrs.indexOf('HI') >= 0 ? ATTRIBUTE_BITS.HI : 0;
    var line = int(w.line), col = int(w.col), width = int(w.width), height = int(w.height);
    var z = isNum(w.stackLayer) ? w.stackLayer : 0;
    this.windowList.push(w);
    this.add(z, function () {
      if (charMode) self.clear(line, col, height, width);
      else self.box(line, col, height, width, !!w.positionIsDefault, bits, letter);
      var title = [];
      if (w.recordName) title.push(w.recordName);
      if (w.title) title.push(w.title);
      // The picture's title chip sits on the top edge; a box with *CHAR characters has no room for it. The chip here is the record name and
      // the title only: what the picture adds to it (position set at runtime, shared window) is in the legend, where it is not cut short.
      if (title.length && !charMode && width >= 8) {
        var chip = [' '].concat(cells(title.join(self.ascii ? ' - ' : ' \u00b7 ')).slice(0, width - 6), [' ']);
        for (var k = 0; k < chip.length; k++) self.put(line, col + 2 + k, chip[k], 0, PLAIN);
      }
    });
    if (!charMode) return;
    // WDWBORDER *CHAR: the eight border characters, one per cell: corners, then top/bottom, then left/right.
    this.add(isNum(w.stackLayer) ? w.stackLayer + 1 : 1, function () {
      var top = line, bottom = line + height - 1, left = col, right = col + width - 1;
      var put = function (l, c, ch) { if (ch && ch !== ' ') self.put(l, c, cells(ch)[0] || ' ', bits, letter); };
      put(top, left, chars[0]); put(top, right, chars[2]); put(bottom, left, chars[5]); put(bottom, right, chars[7]);
      var c, r;
      for (c = left + 1; c <= right - 1; c++) { put(top, c, chars[1]); put(bottom, c, chars[6]); }
      for (r = top + 1; r <= bottom - 1; r++) { put(r, left, chars[3]); put(r, right, chars[4]); }
    });
  };

  Grid.prototype.menuBarSeparator = function (sp) {
    var self = this;
    if (!sp || !isNum(sp.line) || !isNum(sp.width) || sp.width < 1 || !sp.char) return;
    var a = sp.attrs || [];
    var bits = (a.indexOf('RI') !== -1 ? ATTRIBUTE_BITS.RI : 0) | (a.indexOf('HI') !== -1 ? ATTRIBUTE_BITS.HI : 0) | (a.indexOf('UL') !== -1 ? ATTRIBUTE_BITS.UL : 0);
    var letter = colorLetter(sp.color);
    var ch = cells(String(sp.char).charAt(0))[0] || ' ';
    this.add(isNum(sp.stackLayer) ? sp.stackLayer : 1, function () {
      var line = int(sp.line);
      for (var c = 1; c <= int(sp.width); c++) {
        if (ch === ' ') self.mark(line, c, bits, letter); else self.put(line, c, ch, bits, letter);
      }
    });
  };

  Grid.prototype.errorMessage = function (em) {
    var self = this;
    if (!em || !isNum(em.line) || !isNum(em.col) || !isNum(em.width) || em.width < 1) return;
    this.add(isNum(em.stackLayer) ? em.stackLayer : 1, function () { self.text(int(em.line), int(em.col), em.text, int(em.width), 0, PLAIN); });
  };

  Grid.prototype.subfilePreview = function (sfp) {
    var self = this;
    (sfp.fields || []).forEach(function (f) { self.field(f, 1); });
    var sb = sfp.scrollbar;
    if (sb && isNum(sb.line) && isNum(sb.col) && sb.height > 0 && sb.width > 0) {
      this.add(1, function () {
        var line = int(sb.line), height = int(sb.height);
        var col = int(sb.col) + Math.floor((int(sb.width) - 1) / 2);
        var A = self.ascii;
        var up = A ? '^' : '\u25b2', down = A ? 'v' : '\u25bc', track = A ? ':' : '\u2591', thumb = A ? '#' : '\u2588';
        if (height === 1) { self.put(line, col, up, 0, PLAIN); return; }
        self.put(line, col, up, 0, PLAIN);
        self.put(line + height - 1, col, down, 0, PLAIN);
        var trackRows = height - 2;
        if (trackRows < 1) return;
        var thumbRows = Math.max(1, Math.round(trackRows * 0.35));
        var top = sb.boxState === 'bottom' ? trackRows - thumbRows : sb.boxState === 'more' ? Math.max(0, trackRows - thumbRows * 2) : 0;
        for (var r = 0; r < trackRows; r++) self.put(line + 1 + r, col, r >= top && r < top + thumbRows ? thumb : track, 0, PLAIN);
      });
    }
    var ml = sfp.moreLine;
    if (ml && isNum(ml.line) && isNum(ml.textCol) && ml.textWidth > 0) {
      this.add(1, function () {
        var text = cells(ml.text);
        var lead = Math.max(0, int(ml.textWidth) - text.length); // right-aligned in its span
        self.text(int(ml.line), int(ml.textCol) + lead, text.join(''), int(ml.textWidth), 0, PLAIN);
      });
    }
    if (sfp.plusMark && isNum(sfp.plusMark.line) && isNum(sfp.plusMark.col)) {
      this.add(1, function () { self.put(int(sfp.plusMark.line), int(sfp.plusMark.col), '+', 0, PLAIN); });
    }
  };

  Grid.prototype.pulldown = function (pd) {
    var self = this;
    var b = pd.box;
    if (b && isNum(b.line) && isNum(b.col) && b.width > 0 && b.height > 0) {
      this.add(2, function () { self.box(int(b.line), int(b.col), int(b.height), int(b.width), false, 0, PLAIN); });
    }
    (pd.fields || []).forEach(function (f) { self.field(f, 3); });
  };

  Grid.prototype.draw = function () {
    var s = this.screen;
    var self = this;
    var windows = s.windows || (s.window ? [s.window] : []);
    windows.forEach(function (w) { self.window(w); });
    (s.fields || []).forEach(function (f) { self.field(f, 1); });
    (s.menuBarSeparators || (s.menuBarSeparator ? [s.menuBarSeparator] : [])).forEach(function (sp) { self.menuBarSeparator(sp); });
    if (s.subfilePreview) this.subfilePreview(s.subfilePreview);
    if (s.pulldown) this.pulldown(s.pulldown);
    (s.errorMessages || (s.errorMessage ? [s.errorMessage] : [])).forEach(function (em) { self.errorMessage(em); });
    if (s.cursor && isNum(s.cursor.line) && isNum(s.cursor.col)) this.cursors.push({ line: int(s.cursor.line), col: int(s.cursor.col), csrloc: true });
    this.items.slice().sort(function (a, b) { return a.z - b.z || a.n - b.n; }).forEach(function (i) { i.draw(); });
  };

  /** The ruler's two rows, the designer's own numbering: tens above ones, then a two-digit line number and a blank in front of every row. */
  Grid.prototype.rulerRows = function () {
    var tens = '', ones = '';
    for (var c = 1; c <= this.columns; c++) {
      tens += c % 10 === 0 ? String(Math.floor(c / 10) % 10) : ' ';
      ones += String(c % 10);
    }
    return [tens, ones];
  };

  /** Rows of text for one plane (characters, attributes or colours), with the ruler and line numbers when asked. */
  Grid.prototype.rows = function (rowOf) {
    var ruler = !!this.opts.ruler, pad = !!this.opts.pad;
    var out = [];
    var cut = function (s) { return pad ? s : s.replace(/ +$/, ''); };
    if (ruler) { var rr = this.rulerRows(); out.push(cut('   ' + rr[0])); out.push(cut('   ' + rr[1])); }
    for (var l = 1; l <= this.lines; l++) {
      var body = rowOf(l).join('');
      out.push(ruler ? cut((l < 10 ? '0' : '') + l + ' ' + body) : cut(body));
    }
    return out;
  };

  Grid.prototype.charRow = function (l) {
    var row = [];
    for (var c = 1; c <= this.columns; c++) row.push(this.ch[this.index(l, c)]);
    return row;
  };
  Grid.prototype.planeRow = function (l, which) {
    var row = [];
    for (var c = 1; c <= this.columns; c++) {
      var i = this.index(l, c);
      if (!this.painted[i]) { row.push(' '); continue; }
      row.push(which === 'attr' ? (this.attr[i] ? this.attr[i].toString(16).toUpperCase() : PLAIN) : this.colour[i]);
    }
    return row;
  };

  Grid.prototype.legend = function () {
    var self = this;
    var out = [];
    var anyAttr = false, anyColour = false, usedColours = {};
    for (var i = 0; i < this.attr.length; i++) {
      if (!this.painted[i]) continue;
      if (this.attr[i]) anyAttr = true;
      if (this.colour[i] !== PLAIN) { anyColour = true; usedColours[this.colour[i]] = true; }
    }
    out.push('Legend');
    if (anyAttr) {
      out.push('Display attributes: one hex digit per cell, the sum of 1 = HI, 2 = RI, 4 = UL (also the input underline), 8 = BL; . = none');
      out = out.concat(this.rows(function (l) { return self.planeRow(l, 'attr'); }));
    } else {
      out.push('Display attributes: none (no high intensity, reverse image, underline or blink on this screen)');
    }
    if (anyColour) {
      var key = Object.keys(COLOR_NAMES).filter(function (k) { return usedColours[k]; }).map(function (k) { return k + ' = ' + COLOR_NAMES[k]; });
      if (usedColours['*']) key.push('* = a colour that is not a DDS COLOR value');
      out.push('Colours: one letter per cell (' + key.join(', ') + '); . = the screen colour');
      out = out.concat(this.rows(function (l) { return self.planeRow(l, 'colour'); }));
    } else {
      out.push('Colours: none (every field uses the screen colour)');
    }
    this.separators.forEach(function (sp) { out.push('Column separators: line ' + sp.line + (sp.height > 1 ? '-' + (sp.line + sp.height - 1) : '') + ', columns ' + sp.col + '-' + (sp.col + sp.width - 1) + ' (a | marks a blank cell of the field)'); });
    this.cursors.forEach(function (c) { out.push('Cursor: line ' + c.line + ', column ' + c.col + (c.csrloc ? ' (CSRLOC)' : ' (DSPATR(PC))')); });
    this.windowList.forEach(function (w) {
      var parts = ['Window' + (w.recordName ? ' ' + w.recordName : '') + ': line ' + w.line + ', column ' + w.col + ', ' + w.width + ' x ' + w.height];
      if (w.title) parts.push('title ' + cells(w.title).join(''));
      if (w.positionIsDefault) parts.push('position set at runtime');
      else if (w.previewStart) parts.push('preview position');
      if (w.inheritedFrom) parts.push('window shared with ' + w.inheritedFrom);
      if ((w.border && w.border.chars || []).some(function (c) { return c && c !== ' '; })) parts.push('border characters (WDWBORDER *CHAR)');
      out.push(parts.join('; '));
    });
    return out;
  };

  function check(screen) {
    if (!screen || typeof screen !== 'object') throw new TypeError('ScreenText: a resolved screen is required');
  }

  /**
   * The screen as plain text (a string ending in a newline). Options: `ruler`, `legend`, `pad` (keep the trailing blanks), `ascii`
   * (+ - | for borders and ^ v # : for the scroll bar), `header` (a first line naming the record and the size). Throws a TypeError only
   * when `screen` is not an object, a RangeError for a size that is not a display size.
   */
  function buildText(screen, opts) {
    check(screen);
    var g = new Grid(screen, opts);
    g.draw();
    var out = [];
    if (opts && opts.header) {
      var name = opts.title != null ? opts.title : screen.recordName;
      out.push('Screen preview' + (name ? ': ' + cells(name).join('') : '') + ' (' + g.lines + ' x ' + g.columns + ')');
      out.push('');
    }
    out = out.concat(g.rows(function (l) { return g.charRow(l); }));
    if (opts && opts.legend) { out.push(''); out = out.concat(g.legend()); }
    return out.join('\n') + '\n';
  }

  return {
    buildText: buildText,
    colorLetter: colorLetter,
    ATTRIBUTE_BITS: ATTRIBUTE_BITS,
    COLOR_LETTERS: COLOR_LETTERS,
    MAX_COLUMNS: MAX_COLUMNS,
    MAX_LINES: MAX_LINES
  };
});

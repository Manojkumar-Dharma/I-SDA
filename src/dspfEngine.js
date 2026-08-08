/**
 * dspfEngine.js
 *
 * Takes the DspfFile model produced by dspfParser.ts (plain JSON, no classes)
 * and turns one record format into a positioned screen grid, then renders
 * that grid to HTML. Written as plain, dependency-free JS (UMD-ish) so the
 * exact same code runs in Node for testing and is dropped straight into a
 * VS Code webview later with no bundler.
 *
 * Two responsibilities, kept separate on purpose:
 *   resolveScreen()   DDS model + active indicators  ->  ScreenModel (positions, text, style)
 *   renderScreenHtml()  ScreenModel                  ->  HTML string
 * so the resolver can be reused later for the interactive editor (hit-testing,
 * drag/drop) without dragging HTML string-building along with it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DspfEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_LINES = 24;
  var DEFAULT_COLUMNS = 80;

  var COLOR_HEX = {
    BLU: '#4a9eff',
    RED: '#ff5c5c',
    GRN: '#33ff66',
    TRQ: '#4de6e0',
    YLW: '#ffe14d',
    PNK: '#ff6ec7',
    WHT: '#f2f2f2',
  };
  var DEFAULT_COLOR = '#33ff66'; // classic green-screen default

  // ---------------------------------------------------------------------
  // Indicator evaluation
  // ---------------------------------------------------------------------

  /** @param {{relation:string, indicators:{number:string, not:boolean}[]}[]} conditions */
  function conditionsSatisfied(conditions, activeIndicators) {
    if (!conditions || conditions.length === 0) return true;
    // OR across groups; AND within a group.
    return conditions.some(function (group) {
      return group.indicators.every(function (ind) {
        var isOn = activeIndicators.has(ind.number);
        return ind.not ? !isOn : isOn;
      });
    });
  }

  // ---------------------------------------------------------------------
  // Display-size (DSPSIZ) handling
  // ---------------------------------------------------------------------

  function screenSizeFromFileKeywords(fileKeywords) {
    var dspsiz = fileKeywords.find(function (k) {
      return k.name === 'DSPSIZ';
    });
    if (!dspsiz) return { lines: DEFAULT_LINES, columns: DEFAULT_COLUMNS };
    // e.g. "27 132 *LARGE 24 80 *NORMAL" or "*DS4 *DS3" - take the first numeric pair if present.
    var m = dspsiz.parameters.match(/(\d+)\s+(\d+)/);
    if (m) return { lines: parseInt(m[1], 10), columns: parseInt(m[2], 10) };
    if (/\*DS4/.test(dspsiz.parameters)) return { lines: 27, columns: 132 };
    return { lines: DEFAULT_LINES, columns: DEFAULT_COLUMNS };
  }

  // ---------------------------------------------------------------------
  // Field -> display text / placeholder
  // ---------------------------------------------------------------------

  var CHARACTER_TYPES = { '': true, X: true, A: true, W: true, M: true, I: true };
  var NUMERIC_TYPES = { S: true, Y: true, N: true, D: true, F: true };

  function placeholderChar(field) {
    var t = (field.dataType || '').toUpperCase();
    if (t === 'L') return 'D'; // date
    if (t === 'T') return 'T'; // time
    if (t === 'Z') return 'Z'; // timestamp
    if (NUMERIC_TYPES[t]) return '9';
    return 'X';
  }

  function displayLength(field) {
    // Approximation of "display length" rules (position 35 + decimals can add
    // positions for sign/decimal point/exponent - see DDS position-35 reference).
    // TODO: refine per exact keyboard-shift rules once the editor needs pixel-exact widths.
    var len = field.length || 0;
    var t = (field.dataType || '').toUpperCase();
    if (t === 'F') return len + 7;
    if (t === 'L') return 10; // *ISO default; TODO honor DATFMT
    if (t === 'T') return 8;
    if (t === 'Z') return 26;
    if ((t === 'S' || t === 'N' || t === 'I' || t === '' ) && field.usage === 'I' && (field.decimalPositions || 0) > 0) {
      return len + 1;
    }
    return len;
  }

  function fieldDisplayText(field, len) {
    if (field.nameType === 'CONSTANT') {
      var text = field.constantValue;
      if (text == null) {
        var kwNames = field.keywords.map(function (k) { return k.name; });
        if (kwNames.indexOf('DATE') !== -1) text = new Date().toLocaleDateString();
        else if (kwNames.indexOf('TIME') !== -1) text = new Date().toLocaleTimeString();
        else if (kwNames.indexOf('USER') !== -1) text = '*USER';
        else if (kwNames.indexOf('SYSNAME') !== -1) text = '*SYSNAME';
        else text = '';
      }
      return text;
    }
    // Named field: show the field name inside its own box when it fits (design-time
    // convention, like SDA's field-definition mode), else placeholder chars.
    var name = field.name || '';
    if (name.length > 0 && name.length <= len) {
      return name + repeat(placeholderChar(field), len - name.length);
    }
    return repeat(placeholderChar(field), len);
  }

  function repeat(ch, n) {
    return n > 0 ? new Array(n + 1).join(ch) : '';
  }

  // ---------------------------------------------------------------------
  // Keyword-derived styling
  // ---------------------------------------------------------------------

  function styleFromKeywords(keywords, activeIndicators) {
    var style = { color: null, hi: false, reverse: false, underline: false, blink: false, hidden: false, protect: false };
    keywords.forEach(function (kw) {
      if (!conditionsSatisfied(kw.conditions, activeIndicators)) return;
      if (kw.name === 'COLOR') {
        var c = kw.parameters.trim().toUpperCase();
        if (COLOR_HEX[c]) style.color = COLOR_HEX[c];
      } else if (kw.name === 'DSPATR') {
        var attrs = kw.parameters.toUpperCase().split(/\s+/);
        attrs.forEach(function (a) {
          if (a === 'HI') style.hi = true;
          else if (a === 'RI') style.reverse = true;
          else if (a === 'UL') style.underline = true;
          else if (a === 'BL') style.blink = true;
          else if (a === 'ND') style.hidden = true;
          else if (a === 'PR') style.protect = true;
        });
      }
    });
    return style;
  }

  // ---------------------------------------------------------------------
  // resolveScreen: DspfFile + record name + active indicators -> ScreenModel
  // ---------------------------------------------------------------------

  /**
   * @param {object} dspfFile parsed model from dspfParser.parseDspf()
   * @param {string} recordName
   * @param {Set<string>} activeIndicators indicator numbers ("01".."99") currently ON
   * @returns {{lines:number, columns:number, recordName:string, fields:object[]}}
   */
  function resolveScreen(dspfFile, recordName, activeIndicators) {
    activeIndicators = activeIndicators || new Set();
    var size = screenSizeFromFileKeywords(dspfFile.fileKeywords);
    var record = dspfFile.records.find(function (r) {
      return r.name === recordName;
    });
    if (!record) {
      return { lines: size.lines, columns: size.columns, recordName: recordName, fields: [], error: 'Record not found: ' + recordName };
    }
    if (!conditionsSatisfied(record.conditions, activeIndicators)) {
      return { lines: size.lines, columns: size.columns, recordName: recordName, fields: [], suppressed: true };
    }

    var candidates = [];
    var previousColumnEnd = 1;

    record.fields.forEach(function (field) {
      if (!conditionsSatisfied(field.conditions, activeIndicators)) return;
      if (field.usage === 'H' || field.usage === 'P') return; // hidden / program-to-system: not drawn

      var len = displayLength(field);
      var line = field.location.line != null ? field.location.line : 1;
      var startCol;
      if (field.location.column != null) {
        startCol = field.location.column;
      } else if (field.location.relativeColumnOffset != null) {
        startCol = previousColumnEnd + field.location.relativeColumnOffset;
      } else {
        startCol = previousColumnEnd + 1;
      }
      previousColumnEnd = startCol + len;

      var style = styleFromKeywords(field.keywords, activeIndicators);
      if (style.hidden) return;

      candidates.push({
        name: field.name,
        nameType: field.nameType,
        usage: field.usage,
        line: line,
        column: startCol,
        length: Math.max(len, 1),
        text: fieldDisplayText(field, len),
        style: style,
        sourceLine: field.sourceLine,
      });
    });

    // Position-sequence overlap resolution: process in (line, column) order; the
    // first satisfied field to claim a cell range wins, later overlapping fields
    // are dropped for the overlapping cells. (See "Overlapping fields", DDS for
    // display files.) This drops the whole field rather than partial cells for v1.
    candidates.sort(function (a, b) {
      return a.line - b.line || a.column - b.column;
    });
    var occupied = {}; // "line:col" -> true
    var resolved = [];
    candidates.forEach(function (f) {
      var blocked = false;
      for (var c = f.column; c < f.column + f.length; c++) {
        if (occupied[f.line + ':' + c]) {
          blocked = true;
          break;
        }
      }
      if (blocked) return;
      for (var c2 = f.column; c2 < f.column + f.length; c2++) {
        occupied[f.line + ':' + c2] = true;
      }
      resolved.push(f);
    });

    return { lines: size.lines, columns: size.columns, recordName: recordName, fields: resolved };
  }

  // ---------------------------------------------------------------------
  // renderScreenHtml: ScreenModel -> HTML string (positioned via CSS grid)
  // ---------------------------------------------------------------------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderScreenHtml(screen) {
    var fieldDivs = screen.fields
      .map(function (f) {
        var classes = ['dspf-field', 'dspf-' + f.nameType.toLowerCase()];
        if (f.style.hi) classes.push('dspf-hi');
        if (f.style.reverse) classes.push('dspf-reverse');
        if (f.style.underline) classes.push('dspf-underline');
        if (f.style.blink) classes.push('dspf-blink');
        if (f.style.protect) classes.push('dspf-protect');
        var colorStyle = f.style.color ? 'color:' + f.style.color + ';' : '';
        var title = escapeHtml((f.name || '(constant)') + ' @ ' + f.line + '/' + f.column + (f.usage ? ' [' + f.usage + ']' : ''));
        return (
          '<div class="' +
          classes.join(' ') +
          '" style="grid-row:' +
          f.line +
          ';grid-column:' +
          f.column +
          ' / span ' +
          f.length +
          ';' +
          colorStyle +
          '" title="' +
          title +
          '" data-field="' +
          escapeHtml(f.name || '') +
          '" data-line="' +
          f.line +
          '" data-column="' +
          f.column +
          '">' +
          escapeHtml(f.text) +
          '</div>'
        );
      })
      .join('\n');

    return (
      '<div class="dspf-screen" style="grid-template-columns:repeat(' +
      screen.columns +
      ',1ch);grid-template-rows:repeat(' +
      screen.lines +
      ',1.4em);">\n' +
      fieldDivs +
      '\n</div>'
    );
  }

  return {
    conditionsSatisfied: conditionsSatisfied,
    resolveScreen: resolveScreen,
    renderScreenHtml: renderScreenHtml,
    COLOR_HEX: COLOR_HEX,
    DEFAULT_COLOR: DEFAULT_COLOR,
  };
});

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
  // GUI-style widget detection: MLTCHCFLD/SNGCHCFLD (checkbox/radio group),
  // PSHBTNFLD (push button). These are DDS's "graphical character-based
  // interface" keywords - CHOICE/PSHBTNCHC sub-entries are ordinary keywords
  // on the SAME field, already correctly bucketed there by the parser.
  // ---------------------------------------------------------------------

  /** Parses a CHOICE(id 'text') or CHOICE(id &variable) keyword's parameters. */
  function parseChoiceParams(parameters) {
    var literalMatch = parameters.match(/^(\d+)\s+'((?:[^']|'')*)'/);
    if (literalMatch) {
      return { id: literalMatch[1], text: literalMatch[2].replace(/''/g, "'") };
    }
    var varMatch = parameters.match(/^(\d+)\s+(&\S+)/);
    if (varMatch) {
      return { id: varMatch[1], text: varMatch[2] };
    }
    return { id: parameters.trim(), text: parameters.trim() };
  }

  /** PSHBTNCHC's parameter is just the button text (optionally quoted), with no leading choice-id - unlike CHOICE. */
  function parseQuotedOrRaw(parameters) {
    var m = parameters.trim().match(/^'((?:[^']|'')*)'/);
    return m ? m[1].replace(/''/g, "'") : parameters.trim();
  }

  /** MNUBARCHC(choice-id pulldown-record-name 'text') - note this is a field-level
   *  keyword even though it describes the whole menu bar; a menu-bar field
   *  typically has one MNUBARCHC per menu item. */
  function parseMenubarChoice(parameters) {
    var m = parameters.trim().match(/^(\d+)\s+(\S+)\s+'((?:[^']|'')*)'/);
    if (m) return { id: m[1], pulldownRecord: m[2], text: m[3].replace(/''/g, "'") };
    return { id: parameters.trim(), pulldownRecord: null, text: parameters.trim() };
  }

  function widgetFromKeywords(field) {
    var names = field.keywords.map(function (k) { return k.name; });
    if (names.indexOf('MNUBARCHC') !== -1) {
      var menuChoices = field.keywords
        .filter(function (k) { return k.name === 'MNUBARCHC'; })
        .map(function (k) { return parseMenubarChoice(k.parameters); })
        .sort(function (a, b) { return parseInt(a.id, 10) - parseInt(b.id, 10); }); // "displayed in ascending numeric order"
      return { type: 'menubar', choices: menuChoices };
    }
    if (names.indexOf('MLTCHCFLD') !== -1 || names.indexOf('SNGCHCFLD') !== -1) {
      var kind = names.indexOf('MLTCHCFLD') !== -1 ? 'checkbox' : 'radio';
      var choices = field.keywords
        .filter(function (k) { return k.name === 'CHOICE'; })
        .map(function (k) { return parseChoiceParams(k.parameters); });
      return { type: kind, choices: choices };
    }
    if (names.indexOf('PSHBTNFLD') !== -1) {
      var btnChoices = field.keywords
        .filter(function (k) { return k.name === 'PSHBTNCHC'; })
        .map(function (k) { return parseQuotedOrRaw(k.parameters); });
      var label = btnChoices.length > 0 ? btnChoices[0] : field.constantValue || field.name || 'Button';
      return { type: 'button', label: label };
    }
    return null;
  }

  /** @returns {boolean} true if this record has the PULLDOWN keyword (an auto-sized, auto-bordered dropdown). */
  function isPulldownRecord(record) {
    return record.keywords.some(function (k) { return k.name === 'PULLDOWN'; });
  }

  // ---------------------------------------------------------------------
  // WINDOW: field positions in a windowed record are relative to the
  // window's own top-left corner (window row 1 / col 1), which is itself
  // placed on the physical screen at the row/col given in the WINDOW keyword.
  //
  // Three forms exist (verified against IBM's WINDOW keyword reference):
  //   WINDOW(line col height width [options])       - direct geometry
  //   WINDOW(*DFT height width [options])            - *DFT replaces the
  //                                                     line/col PAIR as one
  //                                                     token; system positions
  //                                                     it relative to the
  //                                                     cursor at runtime
  //   WINDOW(record-format-name)                     - inherit the geometry
  //                                                     from another record
  //                                                     format's own WINDOW
  //                                                     keyword
  // line/col can also each be a program-to-system field name instead of a
  // literal, for positions computed at runtime. Neither *DFT nor a field-name
  // position is knowable at design time, so both fall back to a placeholder
  // origin (flagged via positionIsDefault) rather than failing to render at all.
  // ---------------------------------------------------------------------

  var PLACEHOLDER_WINDOW_LINE = 2;
  var PLACEHOLDER_WINDOW_COL = 2;

  function resolveWindowTitle(record) {
    var titleKw = record.keywords.find(function (k) { return k.name === 'WDWTITLE'; });
    if (!titleKw) return null;
    var m = titleKw.parameters.match(/'((?:[^']|'')*)'/);
    return m ? m[1].replace(/''/g, "'") : null;
  }

  /** @returns {{line:number, col:number, height:number, width:number, title:string|null, positionIsDefault:boolean, inheritedFrom:string|null}|null} */
  function resolveWindow(record, dspfFile, depth) {
    depth = depth || 0;
    if (depth > 5) return null; // guard against a reference cycle between records

    var kw = record.keywords.find(function (k) { return k.name === 'WINDOW'; });
    if (!kw) return null;
    var parts = kw.parameters.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    // Form: WINDOW(record-format-name) - a single bare token that's neither
    // a number nor *DFT means "use that record's window geometry".
    if (parts.length === 1 && !/^[+-]?\d+$/.test(parts[0]) && parts[0].toUpperCase() !== '*DFT') {
      var refRecord = dspfFile && dspfFile.records.find(function (r) { return r.name === parts[0]; });
      if (!refRecord) return null;
      var inherited = resolveWindow(refRecord, dspfFile, depth + 1);
      if (!inherited) return null;
      // WDWTITLE, if present, is still read from THIS record, not the referenced one.
      var ownTitle = resolveWindowTitle(record);
      return {
        line: inherited.line,
        col: inherited.col,
        height: inherited.height,
        width: inherited.width,
        title: ownTitle != null ? ownTitle : inherited.title,
        positionIsDefault: inherited.positionIsDefault,
        inheritedFrom: parts[0],
      };
    }

    var isDftPosition = parts[0].toUpperCase() === '*DFT';
    var height, width;
    if (isDftPosition) {
      height = parseInt(parts[1], 10);
      width = parseInt(parts[2], 10);
    } else {
      height = parseInt(parts[2], 10);
      width = parseInt(parts[3], 10);
    }
    if (Number.isNaN(height) || Number.isNaN(width)) return null;

    var line, col, positionIsDefault;
    if (isDftPosition) {
      line = PLACEHOLDER_WINDOW_LINE;
      col = PLACEHOLDER_WINDOW_COL;
      positionIsDefault = true;
    } else {
      var lineNum = parseInt(parts[0], 10);
      var colNum = parseInt(parts[1], 10);
      if (!Number.isNaN(lineNum) && !Number.isNaN(colNum)) {
        line = lineNum;
        col = colNum;
        positionIsDefault = false;
      } else {
        // A field name (program-to-system field) instead of a literal - its
        // runtime value isn't knowable at design time.
        line = PLACEHOLDER_WINDOW_LINE;
        col = PLACEHOLDER_WINDOW_COL;
        positionIsDefault = true;
      }
    }

    return { line: line, col: col, height: height, width: width, title: resolveWindowTitle(record), positionIsDefault: positionIsDefault, inheritedFrom: null };
  }

  // ---------------------------------------------------------------------
  // SFL / SFLCTL: a subfile is two paired record formats - the subfile
  // record (SFL keyword) defines one row's fields; the control record
  // (SFLCTL(subfile-record-name) keyword) carries SFLPAG (visible rows) plus
  // whatever static header/footer fields surround the subfile. Either record
  // name may be the one being previewed, so pairing is resolved from both directions.
  // ---------------------------------------------------------------------

  function findSflPairing(dspfFile, recordName) {
    var record = dspfFile.records.find(function (r) { return r.name === recordName; });
    if (!record) return null;

    var hasSfl = record.keywords.some(function (k) { return k.name === 'SFL'; });
    var sflCtlKw = record.keywords.find(function (k) { return k.name === 'SFLCTL'; });

    var sflRecord = null;
    var sflCtlRecord = null;

    if (sflCtlKw) {
      sflCtlRecord = record;
      var sflName = sflCtlKw.parameters.trim();
      sflRecord = dspfFile.records.find(function (r) { return r.name === sflName; }) || null;
    } else if (hasSfl) {
      sflRecord = record;
      sflCtlRecord = dspfFile.records.find(function (r) {
        return r.keywords.some(function (k) { return k.name === 'SFLCTL' && k.parameters.trim() === recordName; });
      }) || null;
    } else {
      return null;
    }
    if (!sflRecord) return null;

    var sflPag = 5; // sensible fallback if SFLPAG is missing or non-numeric (e.g. driven by a variable)
    if (sflCtlRecord) {
      var pagKw = sflCtlRecord.keywords.find(function (k) { return k.name === 'SFLPAG'; });
      if (pagKw) {
        var n = parseInt(pagKw.parameters.trim(), 10);
        if (!Number.isNaN(n)) sflPag = n;
      }
    }
    return { sflRecord: sflRecord, sflCtlRecord: sflCtlRecord, sflPag: sflPag };
  }

  /**
   * Resolves one record's fields into candidate screen entries, WITHOUT overlap
   * resolution (that happens once, after all contributing records - primary,
   * windowed, subfile rows - are merged). lineOffset/colOffset let callers place
   * a record's fields relative to a window origin or a repeated subfile row.
   */
  function resolveRecordFields(record, activeIndicators, lineOffset, colOffset, tag) {
    var candidates = [];
    var previousColumnEnd = 1;

    record.fields.forEach(function (field) {
      if (!conditionsSatisfied(field.conditions, activeIndicators)) return;
      if (field.usage === 'H' || field.usage === 'P') return; // hidden / program-to-system: not drawn

      var widget = widgetFromKeywords(field);
      var len = displayLength(field);
      var line = (field.location.line != null ? field.location.line : 1) + lineOffset;
      var startCol;
      if (field.location.column != null) {
        startCol = field.location.column;
      } else if (field.location.relativeColumnOffset != null) {
        startCol = previousColumnEnd + field.location.relativeColumnOffset;
      } else {
        startCol = previousColumnEnd + 1;
      }
      previousColumnEnd = startCol + len;
      startCol += colOffset;

      var style = styleFromKeywords(field.keywords, activeIndicators);
      if (style.hidden) return;

      // A choice/button/menubar widget needs room for its own content rather
      // than the raw field length: radio/checkbox stack vertically (one row per
      // choice), a menu bar lays its choices out horizontally on one line, and a
      // button just needs to fit its label.
      var renderLength = len;
      var renderHeight = 1;
      if (widget && widget.type === 'menubar') {
        var col = 0;
        widget.choices.forEach(function (c) {
          var w = c.text.length + 3; // padding between/around menu-bar items
          c.colOffset = col;
          c.width = w;
          col += w;
        });
        renderLength = Math.max(len, col, 1);
      } else if (widget && (widget.type === 'radio' || widget.type === 'checkbox')) {
        renderHeight = Math.max(widget.choices.length, 1);
        widget.choices.forEach(function (c) {
          renderLength = Math.max(renderLength, c.text.length + 4); // "( ) " / "[ ] " prefix
        });
      } else if (widget && widget.type === 'button') {
        renderLength = Math.max(len, widget.label.length + 2);
      }

      candidates.push({
        name: field.name,
        nameType: field.nameType,
        usage: field.usage,
        line: line,
        column: startCol,
        length: Math.max(renderLength, 1),
        height: renderHeight,
        text: fieldDisplayText(field, len),
        style: style,
        widget: widget,
        sourceLine: field.sourceLine,
        // Anchor coordinates: where an edit/drag should be written back to in the
        // DDS source, which may differ from rendered line/column for a repeated
        // subfile row (anchor = the template row) - drag handlers use these.
        anchorLine: field.location.line != null ? field.location.line : 1,
        anchorColumn: field.location.column,
        tag: tag || null,
      });
    });

    return candidates;
  }

  /**
   * @param {object} dspfFile parsed model from dspfParser.parseDspf()
   * @param {string} recordName
   * @param {Set<string>} activeIndicators indicator numbers ("01".."99") currently ON
   * @param {{pulldownRecord:string, line:number, col:number}|null} activePulldown
   *   simulates a menu-bar choice being "clicked": renders the named PULLDOWN
   *   record as an overlay anchored at line/col (the position just below/at the
   *   menu-bar choice that triggered it).
   * @returns {{lines:number, columns:number, recordName:string, fields:object[]}}
   */
  function resolveScreen(dspfFile, recordName, activeIndicators, activePulldown) {
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

    var windowBox = resolveWindow(record, dspfFile);
    var lineOffset = windowBox ? windowBox.line - 1 : 0;
    var colOffset = windowBox ? windowBox.col - 1 : 0;

    var candidates = resolveRecordFields(record, activeIndicators, lineOffset, colOffset, null);

    // Subfile: append repeated rows from the paired SFL record, if this record
    // participates in a subfile pairing (either side - SFL or SFLCTL).
    var sflInfo = findSflPairing(dspfFile, recordName);
    if (sflInfo && sflInfo.sflRecord.fields.length > 0) {
      var sflLines = sflInfo.sflRecord.fields
        .map(function (f) { return f.location.line != null ? f.location.line : 1; })
        .filter(function (n) { return n != null; });
      var rowHeight = sflLines.length > 0 ? Math.max.apply(null, sflLines) - Math.min.apply(null, sflLines) + 1 : 1;

      for (var row = 0; row < sflInfo.sflPag; row++) {
        var rowOffset = lineOffset + row * rowHeight;
        var rowCandidates = resolveRecordFields(sflInfo.sflRecord, activeIndicators, rowOffset, colOffset, 'subfile-row-' + row);
        candidates = candidates.concat(rowCandidates);
      }
    }

    // Position-sequence overlap resolution: process in (line, column) order; the
    // first satisfied field to claim a cell range wins, later overlapping fields
    // are dropped for the overlapping cells. (See "Overlapping fields", DDS for
    // display files.) This drops the whole field rather than partial cells for v1.
    // Multi-row widgets (choice groups) occupy `height` rows, not just 1.
    candidates.sort(function (a, b) {
      return a.line - b.line || a.column - b.column;
    });
    var occupied = {}; // "line:col" -> true
    var resolved = [];
    candidates.forEach(function (f) {
      var blocked = false;
      var h = f.height || 1;
      for (var r = 0; r < h && !blocked; r++) {
        for (var c = f.column; c < f.column + f.length; c++) {
          if (occupied[(f.line + r) + ':' + c]) { blocked = true; break; }
        }
      }
      if (blocked) return;
      for (var r2 = 0; r2 < h; r2++) {
        for (var c2 = f.column; c2 < f.column + f.length; c2++) {
          occupied[(f.line + r2) + ':' + c2] = true;
        }
      }
      resolved.push(f);
    });

    // Pulldown overlay: rendered as a SEPARATE layer, not subject to the overlap
    // resolution above, since a real pulldown genuinely draws on top of whatever
    // is underneath it - it does not compete for cells with the base screen.
    var pulldown = null;
    if (activePulldown && activePulldown.pulldownRecord) {
      var pdRecord = dspfFile.records.find(function (r) { return r.name === activePulldown.pulldownRecord; });
      if (pdRecord) {
        var pdLineOffset = activePulldown.line - 1;
        var pdColOffset = activePulldown.col - 1;
        var pdFields = resolveRecordFields(pdRecord, activeIndicators, pdLineOffset, pdColOffset, 'pulldown');
        if (pdFields.length > 0) {
          var maxLine = Math.max.apply(null, pdFields.map(function (f) { return f.line + (f.height || 1) - 1; }));
          var maxCol = Math.max.apply(null, pdFields.map(function (f) { return f.column + f.length - 1; }));
          pulldown = {
            recordName: activePulldown.pulldownRecord,
            fields: pdFields,
            box: { line: activePulldown.line, col: activePulldown.col, height: maxLine - activePulldown.line + 2, width: maxCol - activePulldown.col + 2 },
          };
        }
      }
    }

    return {
      lines: size.lines,
      columns: size.columns,
      recordName: recordName,
      fields: resolved,
      window: windowBox,
      subfile: sflInfo ? { pageRows: sflInfo.sflPag } : null,
      pulldown: pulldown,
    };
  }

  // ---------------------------------------------------------------------
  // renderScreenHtml: ScreenModel -> HTML string (positioned via CSS grid)
  // ---------------------------------------------------------------------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function widgetInnerHtml(f) {
    var w = f.widget;
    if (w.type === 'button') {
      return '<button type="button" class="dspf-widget-button" tabindex="-1">' + escapeHtml(w.label) + '</button>';
    }
    if (w.type === 'menubar') {
      return w.choices
        .map(function (c) {
          return (
            '<span class="dspf-menubar-choice" style="width:' +
            c.width +
            'ch;" data-pulldown-record="' +
            escapeHtml(c.pulldownRecord || '') +
            '" data-choice-id="' +
            escapeHtml(c.id) +
            '" data-anchor-line="' +
            (f.line + 1) +
            '" data-anchor-col="' +
            (f.column + c.colOffset) +
            '">' +
            escapeHtml(c.text) +
            '</span>'
          );
        })
        .join('');
    }
    var glyph = w.type === 'radio' ? function (i) { return '( ' + (i === 0 ? '\u25CF' : ' ') + ' )'; } : function () { return '[ ]'; };
    var rows = w.choices.length > 0 ? w.choices : [{ id: '', text: '(no CHOICE entries)' }];
    return rows
      .map(function (c, i) {
        return '<div class="dspf-choice-row"><span class="dspf-choice-glyph">' + glyph(i) + '</span> ' + escapeHtml(c.text) + '</div>';
      })
      .join('');
  }

  /** Builds one field's grid-positioned div. Shared by the base screen and the pulldown overlay layer. */
  function renderFieldDiv(f) {
    var classes = ['dspf-field', 'dspf-' + f.nameType.toLowerCase()];
    if (f.style.hi) classes.push('dspf-hi');
    if (f.style.reverse) classes.push('dspf-reverse');
    if (f.style.underline) classes.push('dspf-underline');
    if (f.style.blink) classes.push('dspf-blink');
    if (f.style.protect) classes.push('dspf-protect');
    if (f.widget) classes.push('dspf-widget-' + f.widget.type);
    if (f.tag && f.tag.indexOf('subfile-row-') === 0) classes.push('dspf-subfile-row');
    if (f.tag === 'pulldown') classes.push('dspf-pulldown-field');
    var colorStyle = f.style.color ? 'color:' + f.style.color + ';' : '';
    var title = escapeHtml((f.name || '(constant)') + ' @ ' + f.line + '/' + f.column + (f.usage ? ' [' + f.usage + ']' : ''));
    var innerHtml = f.widget ? widgetInnerHtml(f) : escapeHtml(f.text);
    var height = f.height || 1;
    return (
      '<div class="' +
      classes.join(' ') +
      '" style="grid-row:' +
      f.line +
      (height > 1 ? ' / span ' + height : '') +
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
      f.anchorLine +
      '" data-column="' +
      (f.anchorColumn != null ? f.anchorColumn : '') +
      '" data-render-line="' +
      f.line +
      '" data-render-column="' +
      f.column +
      '" data-length="' +
      f.length +
      '" data-height="' +
      height +
      '" data-tag="' +
      escapeHtml(f.tag || '') +
      '">' +
      innerHtml +
      '</div>'
    );
  }

  function renderScreenHtml(screen) {
    var fieldDivs = screen.fields.map(renderFieldDiv).join('\n');

    var windowDiv = '';
    if (screen.window) {
      var w = screen.window;
      var titleParts = [];
      if (w.title) titleParts.push(w.title);
      if (w.positionIsDefault) titleParts.push('position set at runtime');
      if (w.inheritedFrom) titleParts.push('window shared with ' + w.inheritedFrom);
      var titleHtml = titleParts.length > 0 ? '<div class="dspf-window-title">' + escapeHtml(titleParts.join(' \u00b7 ')) + '</div>' : '';
      var windowClasses = 'dspf-window-border' + (w.positionIsDefault ? ' dspf-window-default-position' : '');
      windowDiv =
        '<div class="' +
        windowClasses +
        '" style="grid-row:' +
        w.line +
        ' / span ' +
        w.height +
        ';grid-column:' +
        w.col +
        ' / span ' +
        w.width +
        ';">' +
        titleHtml +
        '</div>\n';
    }

    var pulldownHtml = '';
    if (screen.pulldown) {
      var pd = screen.pulldown;
      var pdFieldDivs = pd.fields.map(renderFieldDiv).join('\n');
      pulldownHtml =
        '<div class="dspf-window-border dspf-pulldown-border" style="grid-row:' +
        pd.box.line +
        ' / span ' +
        pd.box.height +
        ';grid-column:' +
        pd.box.col +
        ' / span ' +
        pd.box.width +
        ';"></div>\n' +
        pdFieldDivs +
        '\n';
    }

    return (
      '<div class="dspf-screen" style="grid-template-columns:repeat(' +
      screen.columns +
      ',1ch);grid-template-rows:repeat(' +
      screen.lines +
      ',1.4em);">\n' +
      windowDiv +
      fieldDivs +
      '\n' +
      pulldownHtml +
      '\n</div>'
    );
  }

  return {
    conditionsSatisfied: conditionsSatisfied,
    resolveScreen: resolveScreen,
    renderScreenHtml: renderScreenHtml,
    isPulldownRecord: isPulldownRecord,
    findSflPairing: findSflPairing,
    COLOR_HEX: COLOR_HEX,
    DEFAULT_COLOR: DEFAULT_COLOR,
  };
});

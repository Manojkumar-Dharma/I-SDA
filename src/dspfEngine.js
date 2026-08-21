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

  /** @param {{relation:string, indicators:{number:string, not:boolean}[], displaySizeCondition:{name:string,not:boolean}|null}[]} conditions
   *  @param {?string} activeSizeName the CURRENTLY SELECTED DSPSIZ size's own name (e.g. "*DS4"),
   *    if it has one - see screenSizeFromFileKeywords. A display-size-conditioned group is
   *    evaluated against this instead of activeIndicators; the two condition kinds are mutually
   *    exclusive per group (see dspfParser.ts's parseConditionGroup), so a group is always
   *    entirely one or the other, never a mix. */
  function conditionsSatisfied(conditions, activeIndicators, activeSizeName) {
    if (!conditions || conditions.length === 0) return true;
    // OR across groups; AND within a group.
    return conditions.some(function (group) {
      if (group.displaySizeCondition) {
        var matches = !!activeSizeName && group.displaySizeCondition.name.toUpperCase() === activeSizeName.toUpperCase();
        return group.displaySizeCondition.not ? !matches : matches;
      }
      return group.indicators.every(function (ind) {
        var isOn = activeIndicators.has(ind.number);
        return ind.not ? !isOn : isOn;
      });
    });
  }

  // ---------------------------------------------------------------------
  // Display-size (DSPSIZ) handling
  //
  // DSPSIZ can declare ONE size ("DSPSIZ(24 80)" or "DSPSIZ(24 80 *DS3)") or
  // TWO, when the same display file supports both a normal and a large
  // terminal ("DSPSIZ(24 80 *DS3 27 132 *DS4)") - the actual size used at
  // runtime depends on the terminal/device the program runs on. When two are
  // present, callers (the webview's size toggle) can ask for either by index;
  // index 0 (the first-declared size) is the default everywhere else in the
  // engine, matching the previous single-size behavior exactly.
  // ---------------------------------------------------------------------

  /** Walks the raw DSPSIZ parameter text and pulls out every "lines cols
   *  [*qualifier]" triple it finds, in declaration order. */
  function parseScreenSizes(paramText) {
    var tokens = paramText.trim().split(/\s+/).filter(Boolean);
    var sizes = [];
    var i = 0;
    while (i < tokens.length) {
      var t1 = tokens[i];
      var t2 = tokens[i + 1];
      if (/^\d+$/.test(t1) && t2 && /^\d+$/.test(t2)) {
        var name = null;
        var next = tokens[i + 2];
        if (next && next.charAt(0) === '*') {
          name = next;
          i += 3;
        } else {
          i += 2;
        }
        sizes.push({ lines: parseInt(t1, 10), columns: parseInt(t2, 10), name: name });
      } else {
        i++;
      }
    }
    return sizes;
  }

  /**
   * @param {number} [sizeIndex] which declared size to resolve to (0 = first,
   *   the previous always-used behavior). Ignored/clamped if out of range.
   * @returns {{lines:number, columns:number, name:?string, sizes:object[]}}
   *   `sizes` is every size DSPSIZ declared (length 1 in the common case),
   *   so callers can tell whether a size toggle is even worth showing.
   */
  function screenSizeFromFileKeywords(fileKeywords, sizeIndex) {
    var dspsiz = fileKeywords.find(function (k) {
      return k.name === 'DSPSIZ';
    });
    var fallback = { lines: DEFAULT_LINES, columns: DEFAULT_COLUMNS, name: null };
    if (!dspsiz) return { lines: fallback.lines, columns: fallback.columns, name: fallback.name, sizes: [fallback] };

    var sizes = parseScreenSizes(dspsiz.parameters);
    if (sizes.length === 0) {
      // No numeric pair at all - e.g. a bare "*DS4" referencing a system
      // default size by name only. *DS4 is the one well-known case worth a
      // fallback for; anything else falls through to the 24x80 default.
      sizes = [/\*DS4/.test(dspsiz.parameters) ? { lines: 27, columns: 132, name: '*DS4' } : fallback];
    }

    var idx = (typeof sizeIndex === 'number' && sizeIndex >= 0 && sizeIndex < sizes.length) ? sizeIndex : 0;
    var chosen = sizes[idx];
    return { lines: chosen.lines, columns: chosen.columns, name: chosen.name, sizes: sizes };
  }

  /**
   * Public helper for callers (the webview's size toggle) that just need to
   * know what sizes exist without resolving a whole screen - e.g. to decide
   * whether to show a size picker at all.
   */
  function availableScreenSizes(dspfFile) {
    return screenSizeFromFileKeywords(dspfFile.fileKeywords).sizes;
  }

  /**
   * Row limit (line count) for a specific record, respecting DDS's actual
   * DSPSIZ precedence: a record-level DSPSIZ overrides the file-level one
   * (rare but valid - a record can specify its own display size), falling
   * back to file-level, then to the 24-line default if neither is present.
   * Centralizes the "how many rows does this record actually have to work
   * with" question so screen-space-bounds logic (the menu designer's
   * "+ Add option" placement, subfile row clamping, etc.) has one correct
   * DSPSIZ parser to go through instead of each keeping its own copy.
   */
  function screenLinesForRecord(dspfFile, record) {
    var recordHasDspsiz = (record.keywords || []).some(function (k) { return k.name === 'DSPSIZ'; });
    var keywords = recordHasDspsiz ? record.keywords : (dspfFile.fileKeywords || []);
    return screenSizeFromFileKeywords(keywords).lines;
  }

  /**
   * How many subfile rows can actually fit between `startLine` and the
   * bottom of the display's working area (`totalLines`), given each row is
   * `rowHeight` lines tall. Always at least 1 - the template row itself has
   * to render somewhere even if the file's declared SFLPAG doesn't fit,
   * which is the "SFLSIZ(9999)-style" case this exists to guard against:
   * SFLPAG (or a large fallback) is what page size actually means, but
   * nothing previously stopped a large SFLPAG from rendering rows past the
   * bottom of the screen.
   */
  function maxRowsWithinWorkArea(startLine, rowHeight, totalLines) {
    if (rowHeight <= 0) return 1;
    var available = totalLines - startLine + 1;
    if (available < rowHeight) return 1;
    return Math.floor(available / rowHeight);
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

  // Real, IBM-documented DATFMT display lengths (consistent across the DDS,
  // RPG, and CL references) - *JOB is a special case: it ALWAYS reserves 10
  // screen positions even though the format it resolves to at runtime
  // (*MDY/*DMY/*YMD = 8 chars, *JUL = 6) displays fewer. No DATFMT keyword
  // at all defaults to *ISO (10) - same as explicitly writing DATFMT(*ISO).
  var DATFMT_LENGTHS = {
    '*ISO': 10, '*USA': 10, '*EUR': 10, '*JIS': 10, '*JOB': 10,
    '*MDY': 8, '*DMY': 8, '*YMD': 8,
    '*JUL': 6,
  };

  function dateFieldLength(field, record, dspfFile) {
    // DDS DATFMT precedence: field-level keyword, then record-level, then
    // file-level, then the *ISO system default if none is specified
    // anywhere - same precedence order already established for WINDOW's
    // own SFLCTL/WINDOW keyword lookups elsewhere in this file.
    var fieldKw = (field.keywords || []).find(function (k) { return k.name === 'DATFMT'; });
    if (fieldKw) return datfmtLength(fieldKw.parameters);
    var recordKw = record ? (record.keywords || []).find(function (k) { return k.name === 'DATFMT'; }) : null;
    if (recordKw) return datfmtLength(recordKw.parameters);
    var fileKw = dspfFile ? (dspfFile.fileKeywords || []).find(function (k) { return k.name === 'DATFMT'; }) : null;
    if (fileKw) return datfmtLength(fileKw.parameters);
    return DATFMT_LENGTHS['*ISO']; // unspecified anywhere defaults to *ISO
  }

  function datfmtLength(paramText) {
    var name = paramText.trim().toUpperCase();
    return DATFMT_LENGTHS[name] != null ? DATFMT_LENGTHS[name] : DATFMT_LENGTHS['*ISO'];
  }

  function displayLength(field, record, dspfFile) {
    // Approximation of "display length" rules for numeric edit codes/words
    // (EDTCDE/EDTWRD can insert commas, currency symbols, and sign
    // positions in ways too varied to safely approximate without a live
    // system to verify against - see position-35 reference).
    // TODO: refine per exact EDTCDE/EDTWRD rules once the editor needs
    // pixel-exact widths for edited numerics specifically.
    var len = field.length || 0;
    var t = (field.dataType || '').toUpperCase();
    if (t === 'F') return len + 7;
    if (t === 'L') return dateFieldLength(field, record, dspfFile); // honors DATFMT: field, then record, then file level
    if (t === 'T') return 8; // every TIMFMT value is 8 chars, including the *ISO default - already exact
    if (t === 'Z') return 26;
    if ((t === 'S' || t === 'N' || t === 'I' || t === '') && (field.usage === 'I' || field.usage === 'B') && (field.decimalPositions || 0) > 0) {
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
  // CNTFLD (Continued-Entry Field): wraps one field's declared length over
  // several screen lines, `lineWidth` characters per line (the field's own
  // LENGTH need not divide evenly - the last line is just whatever remains).
  // CNTFLD takes a single parameter, the characters-per-line count - see the
  // DDS Reference's "CNTFLD (Continued-Entry Field) keyword" entry.
  // ---------------------------------------------------------------------

  function cntfldFromKeywords(field, len) {
    var kw = (field.keywords || []).find(function (k) { return k.name === 'CNTFLD'; });
    if (!kw) return null;
    var lineWidth = parseInt(kw.parameters.trim(), 10);
    if (Number.isNaN(lineWidth) || lineWidth <= 0) return null;
    return { lineWidth: lineWidth, totalLines: Math.max(1, Math.ceil((len || 0) / lineWidth)) };
  }

  // ---------------------------------------------------------------------
  // Keyword-derived styling
  // ---------------------------------------------------------------------

  function styleFromKeywords(keywords, activeIndicators, activeSizeName) {
    var style = { color: null, hi: false, reverse: false, underline: false, blink: false, hidden: false, protect: false };
    keywords.forEach(function (kw) {
      if (!conditionsSatisfied(kw.conditions, activeIndicators, activeSizeName)) return;
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
  // How far successive placeholder-positioned windows are staggered from each
  // other (see the `placeholderIndex` param below) so they don't render
  // exactly on top of one another when more than one shows at once - compare
  // mode is the case this matters for; a single previewed record only ever
  // has one window on screen, so staggering isn't meaningful there.
  var PLACEHOLDER_WINDOW_STAGGER_LINE = 2;
  var PLACEHOLDER_WINDOW_STAGGER_COL = 4;

  function resolveWindowTitle(record) {
    var titleKw = record.keywords.find(function (k) { return k.name === 'WDWTITLE'; });
    if (!titleKw) return null;
    var m = titleKw.parameters.match(/'((?:[^']|'')*)'/);
    return m ? m[1].replace(/''/g, "'") : null;
  }

  /**
   * @param {number} [placeholderIndex] when this window's position can't be
   *   known at design time (*DFT or a field name - see below), which "slot"
   *   to stagger it into so it doesn't land exactly on top of another
   *   placeholder-positioned window shown at the same time (compare mode).
   *   0 (the default) is the original single fixed spot - every existing
   *   caller that doesn't pass this keeps the prior behavior exactly.
   * @returns {{line:number, col:number, height:number, width:number, title:string|null, positionIsDefault:boolean, inheritedFrom:string|null}|null}
   */
  function resolveWindow(record, dspfFile, depth, placeholderIndex) {
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
      var inherited = resolveWindow(refRecord, dspfFile, depth + 1, placeholderIndex);
      if (!inherited) return null;
      // WDWTITLE, if present, is still read from THIS record, not the referenced one.
      // *MSGLIN/*NOMSGLIN isn't an option this bare form can carry itself
      // (there's no room for one alongside the single record-name token), so
      // it's always inherited from the referenced window's own WINDOW keyword.
      var ownTitle = resolveWindowTitle(record);
      return {
        line: inherited.line,
        col: inherited.col,
        height: inherited.height,
        width: inherited.width,
        title: ownTitle != null ? ownTitle : inherited.title,
        positionIsDefault: inherited.positionIsDefault,
        inheritedFrom: parts[0],
        msgLine: inherited.msgLine,
      };
    }

    // *NOMSGLIN moves the message line out of the window entirely (to the
    // bottom of the display, or MSGLOC's location) - default is *MSGLIN,
    // which reserves the window's own last usable row for it. Can appear
    // anywhere among the trailing option tokens, so just scan for it.
    var msgLine = !parts.some(function (p) { return p.toUpperCase() === '*NOMSGLIN'; });

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
    var stagger = placeholderIndex || 0;
    if (isDftPosition) {
      line = PLACEHOLDER_WINDOW_LINE + stagger * PLACEHOLDER_WINDOW_STAGGER_LINE;
      col = PLACEHOLDER_WINDOW_COL + stagger * PLACEHOLDER_WINDOW_STAGGER_COL;
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
        line = PLACEHOLDER_WINDOW_LINE + stagger * PLACEHOLDER_WINDOW_STAGGER_LINE;
        col = PLACEHOLDER_WINDOW_COL + stagger * PLACEHOLDER_WINDOW_STAGGER_COL;
        positionIsDefault = true;
      }
    }

    return { line: line, col: col, height: height, width: width, title: resolveWindowTitle(record), positionIsDefault: positionIsDefault, inheritedFrom: null, msgLine: msgLine };
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
  function resolveRecordFields(record, activeIndicators, lineOffset, colOffset, tag, activeSizeName, dspfFile) {
    var candidates = [];
    var previousColumnEnd = 1;

    record.fields.forEach(function (field) {
      if (!conditionsSatisfied(field.conditions, activeIndicators, activeSizeName)) return;
      if (field.usage === 'H' || field.usage === 'P') return; // hidden / program-to-system: not drawn

      var widget = widgetFromKeywords(field);
      var len = displayLength(field, record, dspfFile);
      // A bare CONSTANT has no declared DDS LENGTH column - displayLength()
      // falls through to 0 for one, since that column simply isn't there to
      // read. Its real occupied width is implicit from the quoted literal
      // text itself. This isn't just a rendering-width nuance: `len` also
      // drives `previousColumnEnd` below, which the NEXT field's relative
      // column position (location.relativeColumnOffset) is computed from -
      // an under-counted constant width here would silently shift every
      // later relatively-positioned field on the same line too.
      if (field.nameType === 'CONSTANT' && field.constantValue) {
        len = Math.max(len, field.constantValue.length);
      }
      var cntfld = widget ? null : cntfldFromKeywords(field, len); // CNTFLD (named fields only) and a widget don't combine in practice
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

      var style = styleFromKeywords(field.keywords, activeIndicators, activeSizeName);
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
      } else if (cntfld) {
        renderLength = cntfld.lineWidth;
        renderHeight = cntfld.totalLines;
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
        cntfld: cntfld,
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
   * The subfile detail area, rendered as an EDITABLE reference layer - only
   * when `record` is itself the control (SFLCTL) side. Previously this was
   * protected/read-only (matching a stricter reading of real SDA); as of
   * the 0.9.39 fix it's editable, reusing the exact same tag prefix
   * ('subfile-edit-row-') and group-drag machinery the SFL-side "Preview
   * SFLPAG rows" toggle already uses below - dragging any field here moves
   * the whole row template, and the edit is written to the PAIRED SFL
   * record (resolved automatically: the webview's field-wiring loop
   * already falls back to searching every record by name+anchor-line when
   * a field isn't found on the currently-previewed record - see
   * buildWebviewTemplate.js's primaryScreenEl.querySelectorAll('.dspf-field')
   * loop), not this SFLCTL record, without switching records first.
   *
   * `totalLines` is the working area's line count for whichever DSPSIZ the
   * caller currently has selected - rendered rows are capped to what
   * actually fits above the bottom of the screen (see maxRowsWithinWorkArea),
   * rather than trusting SFLPAG (or its 5-row fallback) unconditionally. A
   * declared SFLPAG far larger than the screen (e.g. SFLPAG driven by
   * SFLSIZ-style "virtually unlimited" values) previously rendered straight
   * past the bottom of the screen instead of stopping at it.
   */
  function resolveSubfilePreview(dspfFile, record, activeIndicators, lineOffset, colOffset, totalLines, activeSizeName) {
    var sflCtlKw = record.keywords.find(function (k) { return k.name === 'SFLCTL'; });
    if (!sflCtlKw) return null;
    var sflName = sflCtlKw.parameters.trim();
    var sflRecord = dspfFile.records.find(function (r) { return r.name === sflName; });
    if (!sflRecord || sflRecord.fields.length === 0) return null;

    var declaredSflPag = 5; // sensible fallback if SFLPAG is missing or non-numeric (e.g. driven by a variable)
    var pagKw = record.keywords.find(function (k) { return k.name === 'SFLPAG'; });
    if (pagKw) {
      var n = parseInt(pagKw.parameters.trim(), 10);
      if (!Number.isNaN(n)) declaredSflPag = n;
    }

    // Only fields that actually occupy a VISIBLE row position count toward
    // row height - hidden/program-to-system fields (usage H/P, matching the
    // same exclusion resolveRecordFields uses when deciding what to draw at
    // all) commonly have no explicit line/col of their own (declared before
    // the row's visible fields, as helper/work fields), which would
    // otherwise fall back to line 1 and badly inflate rowHeight to whatever
    // the gap between line 1 and the row's real (later) line is - e.g. a
    // real row template only 1 line tall would wrongly compute as many
    // lines tall, spacing every preview row far apart instead of stacking
    // them immediately below one another.
    var sflLines = sflRecord.fields
      .filter(function (f) { return f.usage !== 'H' && f.usage !== 'P'; })
      .map(function (f) { return f.location.line != null ? f.location.line : 1; })
      .filter(function (n2) { return n2 != null; });
    var firstFieldLine = sflLines.length > 0 ? Math.min.apply(null, sflLines) : 1;
    var rowHeight = sflLines.length > 0 ? Math.max.apply(null, sflLines) - firstFieldLine + 1 : 1;

    var sflPag = declaredSflPag;
    if (totalLines != null) {
      sflPag = Math.min(declaredSflPag, maxRowsWithinWorkArea(lineOffset + firstFieldLine, rowHeight, totalLines));
    }

    var fields = [];
    for (var row = 0; row < sflPag; row++) {
      var rowOffset = lineOffset + row * rowHeight;
      fields = fields.concat(resolveRecordFields(sflRecord, activeIndicators, rowOffset, colOffset, 'subfile-edit-row-' + row, activeSizeName, dspfFile));
    }
    return { sflRecordName: sflRecord.name, pageRows: sflPag, declaredPageRows: declaredSflPag, fields: fields };
  }

  /**
   * @param {object} dspfFile parsed model from dspfParser.parseDspf()
   * @param {string} recordName
   * @param {Set<string>} activeIndicators indicator numbers ("01".."99") currently ON
   * @param {{pulldownRecord:string, line:number, col:number}|null} activePulldown
   *   simulates a menu-bar choice being "clicked": renders the named PULLDOWN
   *   record as an overlay anchored at line/col (the position just below/at the
   *   menu-bar choice that triggered it).
   * @param {boolean} [previewMultipleRows] when `recordName` is itself an SFL
   *   (detail) record, repeat its fields SFLPAG times (resolved from the paired
   *   SFLCTL record, if any - falls back to 5) for a realistic multi-row preview
   *   while still editing the template directly. Off by default (renders the row
   *   once) - unlike the SFLCTL-side preview, these rows are NOT protected: they
   *   ARE the template being edited, just shown repeated for visual context, so
   *   dragging one field moves every field in that same row instance together
   *   (see startGroupDrag/commitGroupEdit in the webview) since they all still
   *   correspond to the one template that actually exists in the DDS source.
   *   Rendered rows are capped to what fits within the working area for the
   *   selected DSPSIZ (see maxRowsWithinWorkArea) - a declared SFLPAG larger
   *   than the screen no longer renders past the bottom of it.
   * @param {number} [sizeIndex] which DSPSIZ-declared size to use when the
   *   file declares more than one (0 = first/default, matching every
   *   existing caller that doesn't pass this).
   * @returns {{lines:number, columns:number, recordName:string, fields:object[]}}
   */

  // ---------------------------------------------------------------------
  // ERRMSG: a field- (or record-) level keyword giving the message text to
  // show when that field/record fails validity checking (or is otherwise
  // flagged by the program). Inside a WINDOW, that message is shown on the
  // window's own reserved message line - its last usable row - UNLESS the
  // window specifies *NOMSGLIN (see resolveWindow), in which case the
  // message is shown elsewhere on the display (out of scope here - this
  // only renders the window's own message line).
  // Like any other keyword, ERRMSG's OWN conditioning indicators (position
  // 8-16 on its line) decide whether it's "active" right now, reusing the
  // same conditionsSatisfied() every other conditioned keyword goes through
  // - there's no live validity-check engine here to drive it any other way.
  // ---------------------------------------------------------------------

  function errMsgText(keywords, activeIndicators, activeSizeName) {
    var kw = (keywords || []).find(function (k) {
      return k.name === 'ERRMSG' && conditionsSatisfied(k.conditions, activeIndicators, activeSizeName);
    });
    if (!kw) return null;
    var m = kw.parameters.match(/'((?:[^']|'')*)'/);
    return m ? m[1].replace(/''/g, "'") : null;
  }

  /** Record-level ERRMSG wins first; otherwise the first field (in DDS source
   *  order) carrying a currently-active ERRMSG. Fields conditioned off aren't
   *  drawn at all, so their own ERRMSG can't be "the" active one either. */
  function resolveWindowErrorMessage(record, activeIndicators, activeSizeName) {
    var text = errMsgText(record.keywords, activeIndicators, activeSizeName);
    if (text != null) return text;
    for (var i = 0; i < record.fields.length; i++) {
      var field = record.fields[i];
      if (!conditionsSatisfied(field.conditions, activeIndicators, activeSizeName)) continue;
      text = errMsgText(field.keywords, activeIndicators, activeSizeName);
      if (text != null) return text;
    }
    return null;
  }

  /** @returns {{text:string, line:number, col:number, width:number}|null} */
  function resolveWindowErrorMessageLine(record, windowBox, activeIndicators, activeSizeName) {
    if (!windowBox || !windowBox.msgLine) return null;
    var text = resolveWindowErrorMessage(record, activeIndicators, activeSizeName);
    if (text == null) return null;
    return {
      text: text.length > windowBox.width ? text.slice(0, windowBox.width) : text,
      line: windowBox.line + windowBox.height - 1,
      col: windowBox.col,
      width: windowBox.width,
    };
  }

  // ---------------------------------------------------------------------
  // Resolve Referenced Field (REF/REFFLD, position 29 'R'): given a field
  // flagged as a database reference, works out WHICH field, in WHICH
  // library/file, its length/type/decimals should be resolved from - the
  // pure "where do I look" half of the "Resolve Referenced Field via Code
  // for i" action; the actual network round-trip (DSPFFD + an SQL lookup)
  // only makes sense on the extension host, so it lives in extension.ts,
  // built on top of this. See "When to specify REF and REFFLD keywords for
  // DDS files" in the DDS Reference for the precedence rules this follows:
  //   - REFFLD's own field-name parameter (defaulting to this field's own
  //     name in positions 19-28 when REFFLD isn't present at all - a bare
  //     R means "same-named field").
  //   - REFFLD's own [library/]file parameter, if given, OVERRIDES the
  //     file-level REF keyword's file.
  //   - REFFLD(field-name *SRC) means "search the file being defined" -
  //     there's no live database file to query for that, so this returns
  //     null (unresolvable via this feature) rather than guessing.
  //   - With no REFFLD file/library at all, falls back to the file-level
  //     REF keyword; with no REF either, there's nothing to resolve against.
  // ---------------------------------------------------------------------

  /** @returns {{fieldName:string, library:?string, file:string}|null} */
  function resolveReferenceTarget(dspfFile, record, field) {
    if (!field || !field.isReference) return null;

    var reffld = (field.keywords || []).find(function (k) { return k.name === 'REFFLD'; });
    var fieldName = field.name;
    var fileSpec = null;

    if (reffld) {
      var parts = reffld.parameters.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return null;
      fieldName = parts[0];
      if (parts.length > 1) {
        if (parts[1].toUpperCase() === '*SRC') return null; // "search this DDS file itself" - no live file to query
        fileSpec = parts[1];
      }
    }

    if (!fileSpec) {
      var refKw = (dspfFile.fileKeywords || []).find(function (k) { return k.name === 'REF'; });
      if (!refKw || !refKw.parameters.trim()) return null; // nothing to resolve against
      fileSpec = refKw.parameters.trim();
    }

    var slash = fileSpec.indexOf('/');
    var library = slash >= 0 ? fileSpec.slice(0, slash) : null;
    var file = slash >= 0 ? fileSpec.slice(slash + 1) : fileSpec;
    if (!file) return null;

    return { fieldName: fieldName, library: library, file: file };
  }

  function resolveScreen(dspfFile, recordName, activeIndicators, activePulldown, previewMultipleRows, sizeIndex) {
    activeIndicators = activeIndicators || new Set();
    var size = screenSizeFromFileKeywords(dspfFile.fileKeywords, sizeIndex);
    var record = dspfFile.records.find(function (r) {
      return r.name === recordName;
    });
    if (!record) {
      return { lines: size.lines, columns: size.columns, recordName: recordName, fields: [], error: 'Record not found: ' + recordName, availableSizes: size.sizes };
    }
    if (!conditionsSatisfied(record.conditions, activeIndicators, size.name)) {
      return { lines: size.lines, columns: size.columns, recordName: recordName, fields: [], suppressed: true, availableSizes: size.sizes };
    }

    var windowBox = resolveWindow(record, dspfFile);
    var lineOffset = windowBox ? windowBox.line - 1 : 0;
    var colOffset = windowBox ? windowBox.col - 1 : 0;

    var isSflRecord = record.keywords.some(function (k) { return k.name === 'SFL'; });
    var previewRowCount = null;
    var declaredPreviewRowCount = null;
    var candidates;

    if (isSflRecord && previewMultipleRows) {
      var pairing = findSflPairing(dspfFile, recordName);
      var declaredSflPag = pairing ? pairing.sflPag : 5; // fallback matches resolveSubfilePreview's own default
      // Same exclusion as resolveSubfilePreview above - hidden/program-to-
      // system fields (usage H/P) with no explicit position would otherwise
      // fall back to line 1 and badly inflate the computed row height.
      var ownLines = record.fields
        .filter(function (f) { return f.usage !== 'H' && f.usage !== 'P'; })
        .map(function (f) { return f.location.line != null ? f.location.line : 1; })
        .filter(function (n) { return n != null; });
      var firstFieldLine = ownLines.length > 0 ? Math.min.apply(null, ownLines) : 1;
      var rowHeight = ownLines.length > 0 ? Math.max.apply(null, ownLines) - firstFieldLine + 1 : 1;
      var sflPag = Math.min(declaredSflPag, maxRowsWithinWorkArea(lineOffset + firstFieldLine, rowHeight, size.lines));

      candidates = [];
      for (var row = 0; row < sflPag; row++) {
        candidates = candidates.concat(resolveRecordFields(record, activeIndicators, lineOffset + row * rowHeight, colOffset, 'subfile-edit-row-' + row, size.name, dspfFile));
      }
      previewRowCount = sflPag;
      declaredPreviewRowCount = declaredSflPag;
    } else {
      candidates = resolveRecordFields(record, activeIndicators, lineOffset, colOffset, null, size.name, dspfFile);
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

    // Subfile preview: a SEPARATE, non-interactive layer (see resolveSubfilePreview) -
    // like the pulldown overlay below, it doesn't compete for cells with the base screen.
    var subfilePreview = resolveSubfilePreview(dspfFile, record, activeIndicators, lineOffset, colOffset, size.lines, size.name);

    // Pulldown overlay: rendered as a SEPARATE layer, not subject to the overlap
    // resolution above, since a real pulldown genuinely draws on top of whatever
    // is underneath it - it does not compete for cells with the base screen.
    var pulldown = null;
    if (activePulldown && activePulldown.pulldownRecord) {
      var pdRecord = dspfFile.records.find(function (r) { return r.name === activePulldown.pulldownRecord; });
      if (pdRecord) {
        var pdLineOffset = activePulldown.line - 1;
        var pdColOffset = activePulldown.col - 1;
        var pdFields = resolveRecordFields(pdRecord, activeIndicators, pdLineOffset, pdColOffset, 'pulldown', size.name, dspfFile);
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

    // ERRMSG on the window's own reserved message line - see resolveWindowErrorMessageLine.
    var errorMessage = resolveWindowErrorMessageLine(record, windowBox, activeIndicators, size.name);

    return {
      lines: size.lines,
      columns: size.columns,
      sizeName: size.name,
      availableSizes: size.sizes,
      recordName: recordName,
      fields: resolved,
      window: windowBox,
      subfilePreview: subfilePreview,
      pulldown: pulldown,
      errorMessage: errorMessage,
      isSflRecord: isSflRecord,
      previewRowCount: previewRowCount,
      declaredPreviewRowCount: declaredPreviewRowCount,
    };
  }

  /**
   * For a file that declares more than one DSPSIZ size, resolves the
   * record at EVERY declared size and checks whether any field's occupied
   * region extends past that size's own working area. Real DDS: an
   * unconditioned field's position is absolute and shared across every
   * declared size (see the screen-size picker's own doc comment) - the
   * SAME field position that compiles fine for the larger size can be
   * rejected by CRTDSPF for the smaller one, and nothing in iSDA warned
   * about that until now. A field explicitly conditioned to one size only
   * (see the 0.9.9 display-size-condition work) is naturally excluded from
   * a size it never renders at, since resolveScreen already wouldn't
   * include it there.
   * Deliberately reuses resolveScreen's own field resolution (position math
   * for relative-column chains, hidden fields, widgets, etc.) rather than
   * re-deriving it, so this can never disagree with what's actually shown.
   * @returns {{sizeIndex:number, sizeName:?string, fieldName:string, sourceLine:number, message:string}[]}
   */
  function validateSizeBounds(dspfFile, recordName, activeIndicators) {
    var sizes = availableScreenSizes(dspfFile);
    if (sizes.length < 2) return [];
    var problems = [];
    sizes.forEach(function (size, idx) {
      var screen = resolveScreen(dspfFile, recordName, activeIndicators, null, false, idx);
      if (screen.error || screen.suppressed) return;
      screen.fields.forEach(function (f) {
        // f.length is now the real occupied width for every field type,
        // including bare constants (resolveRecordFields computes it from
        // the constant's own text - see the fix there).
        var bottom = f.line + f.height - 1;
        var right = f.column + f.length - 1;
        if (bottom > screen.lines || right > screen.columns) {
          problems.push({
            sizeIndex: idx,
            sizeName: size.name,
            fieldName: f.name || f.text || '(unnamed constant)',
            sourceLine: f.sourceLine,
            message: (f.name || f.text || 'This field') + ' extends past the ' + size.lines + 'x' + size.columns +
              (size.name ? ' (' + size.name + ')' : '') + ' working area (line ' + f.line + ', col ' + f.column + ').',
          });
        }
      });
    });
    return problems;
  }

  /**
   * Read-only combined preview of SEVERAL record formats at once - the opt-in
   * "display mode" for comparing/eyeballing multiple formats together (not just
   * automatic subfile pairing). No overlap resolution: every selected record's
   * fields are all shown even if they'd occupy the same cells, since this mode is
   * for comparison, not simulating one specific runtime state. Each field carries
   * `.sourceRecord` so the UI can show which record format it came from.
   * @param {number} [sizeIndex] which DSPSIZ-declared size to use - see resolveScreen.
   */
  function resolveMultiScreen(dspfFile, recordNames, activeIndicators, sizeIndex) {
    activeIndicators = activeIndicators || new Set();
    var size = screenSizeFromFileKeywords(dspfFile.fileKeywords, sizeIndex);
    var allFields = [];
    var windows = [];
    var errorMessages = [];

    recordNames.forEach(function (recordName, index) {
      var record = dspfFile.records.find(function (r) { return r.name === recordName; });
      if (!record) return;
      if (!conditionsSatisfied(record.conditions, activeIndicators, size.name)) return;

      var windowBox = resolveWindow(record, dspfFile, 0, index);
      var lineOffset = windowBox ? windowBox.line - 1 : 0;
      var colOffset = windowBox ? windowBox.col - 1 : 0;

      var fields = resolveRecordFields(record, activeIndicators, lineOffset, colOffset, null, size.name, dspfFile);
      fields.forEach(function (f) { f.sourceRecord = recordName; });
      allFields = allFields.concat(fields);
      if (windowBox) windows.push(Object.assign({ recordName: recordName }, windowBox));

      var preview = resolveSubfilePreview(dspfFile, record, activeIndicators, lineOffset, colOffset, size.lines, size.name);
      if (preview) {
        preview.fields.forEach(function (f) { f.sourceRecord = recordName; });
        allFields = allFields.concat(preview.fields);
      }

      var errorMessage = resolveWindowErrorMessageLine(record, windowBox, activeIndicators, size.name);
      if (errorMessage) errorMessages.push(Object.assign({ recordName: recordName }, errorMessage));
    });

    return { lines: size.lines, columns: size.columns, sizeName: size.name, availableSizes: size.sizes, fields: allFields, windows: windows, errorMessages: errorMessages };
  }

  // ---------------------------------------------------------------------
  // Function-key legend: every CAxx/CFxx command key available to a record
  // being previewed - its own record-level keys plus the file-level ones -
  // each flagged active/inactive against the currently-simulated indicators,
  // so the preview can show F3/F12/etc even when the key's own response
  // indicator condition isn't currently met (so it's still visible as
  // DEFINED), switching to a solid/active style only when it actually is.
  // ---------------------------------------------------------------------

  var COMMAND_KEY_RE = /^(CA|CF)(\d{2})$/;

  /**
   * @param {object} dspfFile parsed model
   * @param {object|null} record the record currently being previewed (record-level
   *   keys take precedence over a file-level key sharing the same number, matching
   *   how the writer's own commandKeyNumbersInUse treats one number as single-scope)
   * @param {Set<string>} activeIndicators currently-simulated indicator numbers
   * @returns {{type:'CA'|'CF', number:string, indicator:?string, text:?string, active:boolean}[]}
   *   sorted CA before CF, then by number.
   */
  function resolveFunctionKeyLegend(dspfFile, record, activeIndicators) {
    activeIndicators = activeIndicators || new Set();
    var seen = {};
    var keys = [];

    function collect(keywords) {
      (keywords || []).forEach(function (k) {
        var m = COMMAND_KEY_RE.exec(k.name);
        if (!m) return;
        if (seen[m[2]]) return; // a more-specific scope (record, collected first) already claimed this number
        seen[m[2]] = true;

        var params = (k.parameters || '').trim();
        var indicator = null;
        var text = null;
        if (params) {
          var pm = /^(\d{1,2})(?:\s+'((?:[^']|'')*)')?/.exec(params);
          if (pm) {
            indicator = pm[1].length < 2 ? '0' + pm[1] : pm[1];
            if (pm[2] != null) text = pm[2].replace(/''/g, "'");
          }
        }
        keys.push({
          type: m[1],
          number: m[2],
          indicator: indicator,
          text: text,
          active: indicator == null || activeIndicators.has(indicator),
        });
      });
    }

    if (record) collect(record.keywords);
    collect(dspfFile.fileKeywords);

    keys.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'CA' ? -1 : 1;
      return a.number < b.number ? -1 : a.number > b.number ? 1 : 0;
    });
    return keys;
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

  /** CNTFLD's rendering: the field's full-length placeholder/display text, wrapped
   *  every `lineWidth` characters onto its own row - one stacked row per line,
   *  mirroring how widgetInnerHtml lays out radio/checkbox choices. */
  function cntfldInnerHtml(f) {
    var width = f.cntfld.lineWidth;
    var text = f.text || '';
    var rows = [];
    for (var i = 0; i < text.length; i += width) {
      rows.push(text.substr(i, width));
    }
    if (rows.length === 0) rows.push('');
    return rows
      .map(function (r) {
        return '<div class="dspf-cntfld-line">' + escapeHtml(r) + '</div>';
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
    if (f.cntfld) classes.push('dspf-cntfld');
    if (f.tag === 'pulldown') classes.push('dspf-pulldown-field');
    var recordLabel = f.sourceRecord ? ' [' + f.sourceRecord + ']' : '';
    var colorStyle = f.style.color ? 'color:' + f.style.color + ';' : '';
    var title = escapeHtml((f.name || '(constant)') + ' @ ' + f.line + '/' + f.column + (f.usage ? ' [' + f.usage + ']' : '') + recordLabel);
    var innerHtml = f.widget ? widgetInnerHtml(f) : (f.cntfld ? cntfldInnerHtml(f) : escapeHtml(f.text));
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

    // Support both the single-record `window` (backward compatible) and the
    // multi-record `windows` array (display-comparison mode) with one code path.
    var windowList = screen.windows || (screen.window ? [screen.window] : []);
    var windowDiv = windowList
      .map(function (w) {
        var titleParts = [];
        if (w.recordName) titleParts.push(w.recordName);
        if (w.title) titleParts.push(w.title);
        if (w.positionIsDefault) titleParts.push('position set at runtime');
        if (w.inheritedFrom) titleParts.push('window shared with ' + w.inheritedFrom);
        var titleHtml = titleParts.length > 0 ? '<div class="dspf-window-title">' + escapeHtml(titleParts.join(' \u00b7 ')) + '</div>' : '';
        var windowClasses = 'dspf-window-border' + (w.positionIsDefault ? ' dspf-window-default-position' : '');
        var handleHtml = '<div class="dspf-window-move-handle" title="Drag to move"></div><div class="dspf-window-resize-handle" title="Drag to resize"></div>';
        return (
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
          ';" data-window-line="' +
          w.line +
          '" data-window-col="' +
          w.col +
          '" data-window-height="' +
          w.height +
          '" data-window-width="' +
          w.width +
          '" data-window-position-default="' +
          (w.positionIsDefault ? '1' : '') +
          '" data-window-inherited="' +
          (w.inheritedFrom ? '1' : '') +
          '">' +
          titleHtml +
          handleHtml +
          '</div>'
        );
      })
      .join('\n');

    // Subfile preview: a PROTECTED, non-interactive reference layer - shown when
    // viewing the SFLCTL (control) record, matching real SDA where the subfile
    // detail area is visible but not individually editable from that view. See
    // resolveSubfilePreview() - callers must not wire click/drag for these fields.
    var subfilePreviewHtml = '';
    if (screen.subfilePreview) {
      var sfp = screen.subfilePreview;
      subfilePreviewHtml = sfp.fields.map(renderFieldDiv).join('\n') + '\n';
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

    // ERRMSG on a window's own reserved message line - see resolveWindowErrorMessageLine.
    // Support both the single-record `errorMessage` and the multi-record
    // `errorMessages` array (display-comparison mode), same pattern as windowList above.
    var errorMessageList = screen.errorMessages || (screen.errorMessage ? [screen.errorMessage] : []);
    var errorMessageHtml = errorMessageList
      .map(function (em) {
        return (
          '<div class="dspf-window-msgline" style="grid-row:' +
          em.line +
          ';grid-column:' +
          em.col +
          ' / span ' +
          em.width +
          ';" title="ERRMSG">' +
          escapeHtml(em.text) +
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
      windowDiv +
      fieldDivs +
      '\n' +
      subfilePreviewHtml +
      pulldownHtml +
      errorMessageHtml +
      '\n</div>'
    );
  }

  return {
    conditionsSatisfied: conditionsSatisfied,
    resolveScreen: resolveScreen,
    resolveMultiScreen: resolveMultiScreen,
    resolveReferenceTarget: resolveReferenceTarget,
    renderScreenHtml: renderScreenHtml,
    isPulldownRecord: isPulldownRecord,
    findSflPairing: findSflPairing,
    escapeHtml: escapeHtml,
    availableScreenSizes: availableScreenSizes,
    validateSizeBounds: validateSizeBounds,
    screenLinesForRecord: screenLinesForRecord,
    resolveFunctionKeyLegend: resolveFunctionKeyLegend,
    COLOR_HEX: COLOR_HEX,
    DEFAULT_COLOR: DEFAULT_COLOR,
  };
});

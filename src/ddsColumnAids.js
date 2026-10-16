'use strict';
/**
 * ddsColumnAids.js - E1g. Column aids for DDS source opened in the text editor.
 *
 * Decision (E1g, taken before building): decorations on the line the cursor is on, not on every line and not a
 * CodeLens-style ruler. The active line gets its fixed columns drawn as alternating subtle bands (sequence number,
 * form type, conditioning, name type, name, reference, length, data type, decimals, usage, line, position,
 * keyword area), and hovering a band names the column and what goes there. It is off by default
 * (`isda.columnAids.enable`), costs one line per cursor move, and uses only the column positions the parser
 * already knows. A pinned ruler is not possible for an extension (no sticky header API) and a CodeLens sits above
 * a line, not over its columns.
 *
 * Same layering as E1a - E1f:
 *   - zonesAt(lineAt, index) and zoneAt(lineAt, index, character) are pure: no `vscode` import, no DOM.
 *   - createHoverProvider(vscode, deps) and createController(vscode, deps) are the thin VS Code side and take the
 *     API as an argument, so they run against a fake in tests.
 *
 * Positions are zero-based like VS Code's: column 45 is character 44; a zone's end is exclusive.
 * The keyword area (columns 45-80) is drawn but gets no hover from here; E1c's keyword hover owns it.
 *
 * Plain dependency-free JS (UMD).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DdsColumnAids = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEYWORD_AREA_START = 44;
  var KEYWORD_AREA_END = 80;
  var MAX_CHAIN_LOOKBACK = 60; // lines to look up for the line a continuation continues

  /** The fixed columns of a DDS line, in order; `info` is what the hover says. */
  var ZONES = {
    sequence: { name: 'Sequence number', start: 0, end: 5, info: 'Columns 1-5. Free for a sequence number or a modification tag (isda.modificationTagPosition = sequence).' },
    form: { name: 'Form type', start: 5, end: 6, info: 'Column 6. `A` for a DDS specification line.' },
    conditioning: { name: 'Conditioning', start: 6, end: 16, info: 'Columns 7-16. Column 7 `A` (AND) or `O` (OR), column 8 `N` (not), columns 9-10, 12-13 and 15-16 the option indicators; `*` in column 7 makes the line a comment.' },
    nameType: { name: 'Name type', start: 16, end: 17, info: 'Column 17. `R` record format, `H` help specification, blank for a field or a keyword line.' },
    name: { name: 'Name', start: 18, end: 28, info: 'Columns 19-28. The record format, help specification or field name.' },
    reference: { name: 'Reference', start: 28, end: 29, info: 'Column 29. `R` takes the field definition from the referenced field.' },
    length: { name: 'Length', start: 29, end: 34, info: 'Columns 30-34. Field length (right-justified), or the `+n` / `-n` adjustment on a referenced field.' },
    dataType: { name: 'Data type', start: 34, end: 35, info: 'Column 35. `A` character, `S` zoned, `P` packed, `B` binary, `F` float, `L` date, `T` time, `Z` timestamp, `O` / `J` / `E` / `G` DBCS, `H` hexadecimal.' },
    decimals: { name: 'Decimal positions', start: 35, end: 37, info: 'Columns 36-37. Decimal positions of a numeric field; blank for character.' },
    usage: { name: 'Usage', start: 37, end: 38, info: 'Column 38. `O` output, `I` input, `B` both, `H` hidden, `M` message, `P` program-to-system.' },
    line: { name: 'Line', start: 38, end: 41, info: 'Columns 39-41. The display line the field starts on.' },
    position: { name: 'Position', start: 41, end: 44, info: 'Columns 42-44. The position on the line the field starts at.' },
    functions: { name: 'Functions', start: KEYWORD_AREA_START, end: KEYWORD_AREA_END, info: 'Columns 45-80. Keywords and their parameters; a `+` or `-` in column 80 continues them on the next line.' },
  };

  var LAYOUTS = {
    field: ['sequence', 'form', 'conditioning', 'nameType', 'name', 'reference', 'length', 'dataType', 'decimals', 'usage', 'line', 'position', 'functions'],
    record: ['sequence', 'form', 'conditioning', 'nameType', 'name', 'functions'],
    keyword: ['sequence', 'form', 'conditioning', 'functions'],
    continuation: ['functions'],
  };

  function isBlank(text) {
    return /^\s*$/.test(text);
  }

  function continuationSign(raw) {
    var area = raw.length > KEYWORD_AREA_START ? raw.substring(KEYWORD_AREA_START) : '';
    area = area.replace(/\s+$/, '');
    var last = area.charAt(area.length - 1);
    return last === '+' || last === '-';
  }

  /**
   * What the line is: 'comment', 'blank', 'continuation' (columns 7-44 blank and the keyword line above ends in
   * + or -), 'record' (R or H in column 17), 'field' (a name in columns 19-28) or 'keyword' (anything else).
   * `lineAt(i)` returns the text of line i, or undefined past either end.
   */
  function lineKind(lineAt, index) {
    var raw = lineAt(index);
    if (raw === undefined || raw === null) return 'blank';
    if (raw.charAt(6) === '*') return 'comment';
    if (isBlank(raw.substring(6))) return 'blank';
    if (isBlank(raw.substring(6, KEYWORD_AREA_START))) {
      // Looks like a continuation only when the nearest specification line above asks for one.
      for (var i = index - 1, steps = 0; i >= 0 && steps < MAX_CHAIN_LOOKBACK; i--, steps++) {
        var above = lineAt(i);
        if (above === undefined || above === null) break;
        if (above.charAt(6) === '*' || isBlank(above.substring(6))) continue;
        if (continuationSign(above)) return 'continuation';
        break;
      }
    }
    var nameType = raw.charAt(16);
    if (nameType === 'R' || nameType === 'H') return 'record';
    if (!isBlank(raw.substring(18, 28))) return 'field';
    return 'keyword';
  }

  /** { kind, zones: [{ id, name, info, startCharacter, endCharacter }] } for one line; no zones for a comment or a blank. */
  function zonesAt(lineAt, index) {
    var kind = lineKind(lineAt, index);
    var layout = LAYOUTS[kind];
    if (!layout) return { kind: kind, zones: [] };
    return {
      kind: kind,
      zones: layout.map(function (id) {
        var z = ZONES[id];
        return { id: id, name: z.name, info: z.info, startCharacter: z.start, endCharacter: z.end };
      }),
    };
  }

  /** The zone under `character` on the line, or null. The keyword area is left to E1c's hover. */
  function zoneAt(lineAt, index, character) {
    var found = zonesAt(lineAt, index).zones.filter(function (z) {
      return z.id !== 'functions' && character >= z.startCharacter && character < z.endCharacter;
    })[0];
    return found || null;
  }

  function hoverMarkdown(zone) {
    var width = zone.endCharacter - zone.startCharacter;
    var where = width > 1 ? 'columns ' + (zone.startCharacter + 1) + '-' + zone.endCharacter : 'column ' + (zone.startCharacter + 1);
    return '**' + zone.name + '** (' + where + ')\n\n' + zone.info;
  }

  // ---------------------------------------------------------------------
  // The VS Code side.
  // ---------------------------------------------------------------------

  /**
   * `deps`: getSettings() -> { enable }, shouldProvide(document) -> boolean,
   * getActiveLine(document) -> the cursor's line index when the document is the active editor's, else -1.
   * The hover answers on the active line only, the line the bands are drawn on.
   */
  function createHoverProvider(vscodeApi, deps) {
    return {
      provideHover: function (document, position) {
        var settings = deps.getSettings();
        if (!settings || !settings.enable || !deps.shouldProvide(document)) return undefined;
        if (deps.getActiveLine(document) !== position.line) return undefined;
        var zone = zoneAt(function (i) { return i >= 0 && i < document.lineCount ? document.lineAt(i).text : undefined; }, position.line, position.character);
        if (!zone) return undefined;
        var range = new vscodeApi.Range(position.line, zone.startCharacter, position.line, zone.endCharacter);
        return new vscodeApi.Hover(new vscodeApi.MarkdownString(hoverMarkdown(zone)), range);
      },
    };
  }

  /**
   * Draws the active line's bands and keeps them current. `deps`: getSettings() -> { enable },
   * shouldProvide(document) -> boolean. Two decoration types alternate so neighbouring bands read as separate.
   * Returns { refresh(editor), refreshAll(), dispose() }; it registers its own listeners.
   */
  function createController(vscodeApi, deps) {
    var types = null;
    var disposables = [];

    function ensureTypes() {
      if (types) return types;
      types = [
        vscodeApi.window.createTextEditorDecorationType({ backgroundColor: 'rgba(128, 128, 128, 0.12)' }),
        vscodeApi.window.createTextEditorDecorationType({ backgroundColor: 'rgba(128, 128, 128, 0.24)' }),
      ];
      return types;
    }

    function clear(editor) {
      if (!types || !editor) return;
      types.forEach(function (t) { editor.setDecorations(t, []); });
    }

    function refresh(editor) {
      if (!editor || !editor.document) return;
      var settings = deps.getSettings();
      if (!settings || !settings.enable || !deps.shouldProvide(editor.document)) {
        clear(editor);
        return;
      }
      var t = ensureTypes();
      var document = editor.document;
      var line = editor.selection && editor.selection.active ? editor.selection.active.line : -1;
      var lineAt = function (i) { return i >= 0 && i < document.lineCount ? document.lineAt(i).text : undefined; };
      var zones = line >= 0 ? zonesAt(lineAt, line).zones : [];
      var bands = [[], []];
      zones.forEach(function (z, n) {
        bands[n % 2].push(new vscodeApi.Range(line, z.startCharacter, line, z.endCharacter));
      });
      editor.setDecorations(t[0], bands[0]);
      editor.setDecorations(t[1], bands[1]);
    }

    function refreshAll() {
      (vscodeApi.window.visibleTextEditors || []).forEach(refresh);
    }

    disposables.push(vscodeApi.window.onDidChangeTextEditorSelection(function (e) { refresh(e.textEditor); }));
    disposables.push(vscodeApi.window.onDidChangeActiveTextEditor(function (editor) { refresh(editor); }));
    disposables.push(vscodeApi.workspace.onDidChangeTextDocument(function (e) {
      (vscodeApi.window.visibleTextEditors || []).forEach(function (editor) {
        if (editor.document === e.document) refresh(editor);
      });
    }));
    disposables.push(vscodeApi.workspace.onDidChangeConfiguration(function (e) {
      if (e.affectsConfiguration('isda.columnAids')) refreshAll();
    }));

    return {
      refresh: refresh,
      refreshAll: refreshAll,
      dispose: function () {
        disposables.forEach(function (d) { d.dispose(); });
        disposables = [];
        (vscodeApi.window.visibleTextEditors || []).forEach(clear);
        if (types) types.forEach(function (t) { t.dispose(); });
        types = null;
      },
    };
  }

  return {
    zonesAt: zonesAt,
    zoneAt: zoneAt,
    lineKind: lineKind,
    hoverMarkdown: hoverMarkdown,
    createHoverProvider: createHoverProvider,
    createController: createController,
  };
});

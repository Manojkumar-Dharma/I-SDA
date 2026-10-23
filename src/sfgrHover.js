/**
 * sfgrHover.js (E11j2)
 *
 * Hover on System/36 SFGR source (the text of a DSPF36 member or a .dspf36 file): put the cursor on a column of an S, H
 * or D line and get what the column is, the values the manual allows, the DDS keyword it becomes (where the model has
 * one) and what the current value means. Pure module (no `vscode` import); the column ranges are the parser's (E11c)
 * and the values are the ones in docs/sda-reference/SFGR-SPEC.md (E11a), the same ones the E11j1 rule checks use.
 *
 *   hoverAt(text, line, character) -> { markdown, range } | null   (0-based line and UTF-16 character, like VS Code)
 *   createProvider(vscodeApi, options)  the VS Code HoverProvider; options = { getSettings(), shouldHover(document) }
 *   describeColumn(type, key)           the description of one column entry (tests, other tools)
 *
 * `range` is { startLine, startCharacter, endLine, endCharacter }, the columns of the entry cut at the end of the line.
 * Nothing here throws: text it cannot read gives null.
 *
 * DDS keywords. The manual gives no complete SFGR-to-DDS table (SFGR-SPEC.md section 7, point 1), so only what the
 * model of E11e really produces (or the manual states: ALTNAME, FRCDTA, CHECK(RLTB)) is named; the other entries say
 * they have no DDS keyword in the model.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sfgrParser.js'));
  } else {
    root.SfgrHover = factory(root.SfgrParser);
  }
})(typeof self !== 'undefined' ? self : this, function (Parser) {
  'use strict';

  var HAS_SURROGATE = /[\ud800-\udfff]/;
  var NO_DDS = null;

  // ---- what each column is -----------------------------------------------------------------------------------------
  // [title, text, DDS keyword or null, values {value: meaning} or null, indicator meaning or null]

  var NY = function (yes, no) { return { '': no, N: no, Y: yes }; };
  var IND = 'an indicator 01 - 99: applies while that indicator is on';

  var INFO = {
    S: {
      name: ['Display format name', 'Up to 8 characters; the first is A - Z, #, $ or @; no comma, single quote or blank; unique in the member.', 'the record format name (ALTNAME when DDS rejects the name)', null, null],
      startLine: ['Start line', 'The line the format starts on, 1 - 24 (27 on 132 columns), right-adjusted. A field\'s row is the start line + its line - 1.', NO_DDS, { '': 'line 1', V: 'set by the program (1 when it sets none)' }, null],
      linesToClear: ['Lines to clear', 'How many lines the format clears from its start line, 0 - 24 (27), right-adjusted.', NO_DDS, { '': 'clear all lines' }, null],
      lowercase: ['Lowercase (format default)', 'Lowercase letters are accepted in input fields. The D specification\'s column 51 wins.', 'LOWER (on input fields that are not numeric)', NY('lowercase allowed', 'uppercase only'), null],
      returnInput: ['Return input', 'Whether the program gets the input of a field only when something was typed.', NO_DDS, { '': 'always return', Y: 'always return', N: 'return only if data was typed' }, null],
      alarm: ['Sound alarm', 'The terminal alarm sounds when the format is shown.', NO_DDS, NY('alarm sounds', 'no alarm'), IND],
      enableFunctionKeys: ['Enable function keys', 'Which function keys (digits 1 - 6 in the key mask) are enabled.', NO_DDS, { '': 'all function keys', Y: 'only the keys in the key mask', N: 'all except the keys in the key mask', R: 'retain the previous state (the mask is ignored)' }, null],
      enableCommandKeys: ['Enable command keys', 'Which command keys (letters A - Y in the key mask) are enabled.', NO_DDS, { '': 'all command keys', Y: 'only the keys in the key mask', N: 'all except the keys in the key mask', R: 'retain the previous state (the mask is ignored)' }, null],
      blinkCursor: ['Blink cursor', 'The cursor blinks.', NO_DDS, NY('cursor blinks', 'cursor does not blink'), IND],
      eraseInput: ['Erase input fields', 'Input fields are erased when the format is shown.', NO_DDS, NY('input fields erased', 'not erased'), IND],
      overrideFields: ['Override fields', 'The fields of the format override the ones already on the screen.', NO_DDS, NY('fields override', 'no override'), IND],
      suppressInput: ['Suppress input', 'Input is not accepted. Y on a help format acts as N.', NO_DDS, NY('input suppressed', 'input accepted'), IND],
      nullFill: ['Null fill', 'Syntax-checked only; no effect on the AS/400.', NO_DDS, NY('null fill', 'no null fill'), IND],
      columns132: ['132-column format', 'The format is drawn on 132 columns (27 lines) instead of 80 (24 lines).', 'DSPSIZ(24 80 *DS3 27 132 *DS4)', NY('132 columns, 27 lines', '80 columns, 24 lines'), null],
      rightToLeft: ['Right-to-left display', 'Only the first format\'s value counts for the whole file.', 'CHECK(RLTB) (file level)', NY('right-to-left', 'left-to-right'), null],
      keyMask: ['Key mask', 'Function key digits (1 - 6) and command key letters (A - Y, no O), any order, no blank inside. Used by enable function keys (column 27) and enable command keys (column 28).', NO_DDS, null, null]
    },
    H: {
      name: ['Help format name or help text label', 'A display format name is exactly 8 characters, axxxxxnn (a = A - Z, nn = 00 - 99). A label is 1 - 8 characters, the first A - Z, #, $ or @, with no comma, quote or blank.', NO_DDS, null, null],
      helpFile: ['Help display file or online document name', 'Left-justified. Blank = the file in use. A document name is 1 - 8 characters, none of ? \' / . - = > , * or blank, and not ALL, SYSTEM, NEW or DIR.', NO_DDS, { '': 'the file in use' }, null],
      helpLibrary: ['Help library or folder name', 'A library only goes with a file name. A folder is not ALL, #LIBRARY, F1, READER, PRINT or DISK.', NO_DDS, null, null],
      upperLeft: ['Upper left corner (rrcc)', 'Row right-justified in the first two columns, column in the last two; columns above 99 as A0 (100) .. D2 (132). Rows are relative to the S specification\'s start line. Both corners blank = null help area.', NO_DDS, null, null],
      lowerRight: ['Lower right corner (rrcc)', 'Same rules as the upper left corner.', NO_DDS, null, null],
      suppressSelection: ['Suppress selection indicator', 'Blank, or an indicator 01 - 99 (Y and N are errors).', NO_DDS, { '': 'not suppressed' }, IND],
      restoreFormat: ['Restore display format', 'Syntax-checked, ignored on the AS/400.', NO_DDS, { '': 'restore', Y: 'restore', N: 'do not restore' }, IND],
      boundary: ['Boundary indicator', 'Marks the help area boundary.', NO_DDS, NY('boundary shown', 'no boundary'), IND],
      onlineDocument: ['Online document', 'Whether the H specification names an online document.', NO_DDS, { '': 'display format H specification', N: 'display format H specification', Y: 'online document H specification' }, null]
    },
    D: {
      name: ['Field name', 'Up to 8 characters; reference only. The first 6 should be unique for RPG.', 'the field name', null, null],
      length: ['Field length', '1 - 1919 (1 - 3563 on 132 columns), right-justified. Self-check fields: at most 32. Message fields: at least 6. Signed numeric input: 2 - 16.', 'the field length', null, null],
      line: ['Line', 'The line of the field, relative to the format\'s start line, right-justified.', 'the line of the field position', null, null],
      column: ['Column', '1 - 80, or 1 - 132 written A0 (100) .. D2 (132). Row 1 column 1 is never usable; leave one blank before each field for its attribute byte.', 'the column of the field position', null, null],
      output: ['Output data', 'Whether the program writes the field.', 'usage O, or B with input; with an indicator the field is conditioned on it', { '': 'not output', N: 'not output', Y: 'output' }, 'an indicator 01 - 99: output while that indicator is on'],
      inputAllowed: ['Input allowed', 'Whether the user can type into the field.', 'usage I, or B with output', NY('input allowed', 'no input'), null],
      dataType: ['Data type', 'The kind of data the field accepts. The DDS data type is the one the manual maps it to (B-18).', 'data type (position 35): B->A, A->X, M->N, N->M, S->S, R->I, Z->A, D->D, K->W, E and F->E, O->O, X->J',
        { '': 'any character (DDS blank)', B: 'any character (DDS A)', A: 'alphabetic (DDS X)', M: 'alphabetic with numeric shift (DDS N)', N: 'numeric (DDS M)', S: 'signed numeric (DDS S)', R: 'magnetic stripe (DDS I)', Z: 'right-to-left (DDS A)', D: 'digits only (DDS D)', K: 'Katakana (DDS W)', E: 'DBCS (DDS E)', F: 'DBCS (DDS E)', O: 'DBCS (DDS O)', X: 'DBCS (DDS J)' }, null],
      mandatoryFill: ['Mandatory fill', 'The user must fill the field completely.', NO_DDS, NY('mandatory fill', 'not required'), null],
      mandatoryEntry: ['Mandatory entry', 'The user must type something in the field.', NO_DDS, NY('mandatory entry', 'not required'), null],
      selfCheck: ['Self-check', 'Check digit test of the field (field length at most 32).', NO_DDS, { '': 'none', T: 'modulus 10', E: 'modulus 11' }, null],
      adjustFill: ['Adjust/fill', 'Right-justify the entry. Implies controlled field exit; not with mandatory fill.', NO_DDS, { '': 'none', Z: 'right-justify, zero fill', B: 'right-justify, blank fill' }, null],
      positionCursor: ['Position cursor', 'The cursor starts in this field (Y on one field only).', 'DSPATR(PC)', NY('cursor starts here', 'no'), IND],
      dupKey: ['Enable Dup key', 'The Dup key can be used in the field.', NO_DDS, NY('Dup key enabled', 'disabled'), null],
      controlledExit: ['Controlled field exit', 'The user has to press a field exit key to leave the field.', NO_DDS, NY('controlled exit', 'no'), null],
      autoAdvance: ['Automatic record advance', 'Typing the last character moves to the next record.', NO_DDS, NY('automatic advance', 'no'), null],
      protect: ['Protect field', 'Input fields only: the field cannot be changed.', 'DSPATR(PR)', NY('protected', 'not protected'), IND],
      highIntensity: ['High intensity', 'High intensity display.', 'DSPATR(HI)', NY('high intensity', 'normal intensity'), IND],
      blink: ['Blink field', 'The field blinks.', 'DSPATR(BL)', NY('blinks', 'does not blink'), IND],
      nondisplay: ['Nondisplay', 'The field is not shown. With high intensity, reverse image or underline it is nondisplay only.', 'DSPATR(ND)', NY('not displayed', 'displayed'), IND],
      reverseImage: ['Reverse image', 'Reverse image display.', 'DSPATR(RI)', NY('reverse image', 'normal'), IND],
      underline: ['Underline', 'The field is underlined.', 'DSPATR(UL)', NY('underlined', 'not underlined'), IND],
      columnSeparators: ['Column separators', 'Column separators are shown (Y or N only, no indicator).', 'DSPATR(CS)', NY('column separators', 'none'), null],
      lowercase: ['Lowercase', 'Input fields only, not numeric. Wins over the S specification\'s column 21.', 'LOWER', NY('lowercase allowed', 'uppercase only'), null],
      constantType: ['Constant type', 'Whether the constant data (columns 57 - 79) is text or a message.', 'a constant (text) or MSGCON (message)', { '': 'not a constant (a field)', C: 'constant text', M: 'message: columns 57 - 60 message id, 61 - 62 member (blank, U1, U2, P1, P2, M1, M2)' }, null],
      constantData: ['Constant data', 'Up to 23 characters; a longer constant continues on the next D line (column 80 = X). With a message constant: message id in 57 - 60, member identifier in 61 - 62.', 'the constant text, or DFTVAL on an input field', null, null],
      continuation: ['Continuation', 'X means the next D line continues the constant.', NO_DDS, { '': 'the constant ends here', X: 'the next D line continues the constant' }, null]
    }
  };

  var TYPE_NAME = { S: 'S specification (display control)', H: 'H specification (help area)', D: 'D specification (field or constant)' };
  var SPEC_TYPE_VALUES = { S: 'S: display control', H: 'H: help area', D: 'D: field or constant' };

  // ---- helpers -----------------------------------------------------------------------------------------------------

  function splitLines(text) {
    return String(text == null ? '' : text).replace(/^\ufeff/, '').split(/\r\n|\n|\r/);
  }

  function colText(line, from, to) { return Parser.columnText(line, from, to); }

  /** Character index (0-based, columns count characters) for a UTF-16 offset, and the reverse. */
  function unitToChar(line, unit) {
    if (!HAS_SURROGATE.test(line)) return unit;
    var chars = Array.from(line), u = 0;
    for (var i = 0; i < chars.length; i++) { if (u >= unit) return i; u += chars[i].length; }
    return chars.length;
  }
  function charToUnit(line, index) {
    if (!HAS_SURROGATE.test(line)) return index;
    return Array.from(line).slice(0, index).join('').length;
  }
  function charLength(line) { return HAS_SURROGATE.test(line) ? Array.from(line).length : line.length; }

  /** Per line: true when it continues the constant of the D line before it (that one has X in column 80). */
  function continuationFlags(lines, upTo) {
    var flags = [];
    for (var i = 0; i <= upTo; i++) {
      var prev = i > 0 ? lines[i - 1] : null;
      var is = false;
      if (prev !== null && colText(lines[i], 6, 6) === 'D' && colText(prev, 6, 6) === 'D' && colText(prev, 80, 80) === 'X') {
        is = flags[i - 1] || colText(prev, 7, 7) !== '*';
      }
      flags.push(is);
    }
    return flags;
  }

  function columnsLabel(from, to) { return from === to ? 'column ' + from : 'columns ' + from + ' - ' + to; }

  function code(text) { return '`' + String(text).replace(/`/g, "'") + '`'; }

  function allowedList(values, indicator) {
    var parts = [];
    Object.keys(values || {}).forEach(function (k) { if (k !== '') parts.push(code(k)); });
    var text = parts.length ? 'blank, ' + parts.join(', ') : 'blank';
    if (indicator) text += ', or an indicator 01 - 99';
    return text;
  }

  function meaningOf(type, key, entry, value) {
    var values = entry[3];
    if (key === 'keyMask') return keyMaskMeaning(value);
    if (key === 'column' || key === 'upperLeft' || key === 'lowerRight') return positionMeaning(key, value);
    if (value === '') return values && values[''] !== undefined ? 'blank: ' + values[''] : 'blank';
    if (values && Object.prototype.hasOwnProperty.call(values, value)) return values[value];
    if (entry[4] && /^\d{1,2}$/.test(value) && parseInt(value, 10) >= 1) return 'indicator ' + (value.length < 2 ? '0' + value : value) + ': ' + entry[4].replace(/^an indicator 01 - 99: /, '');
    if (values) return 'not an allowed value';
    return null;
  }

  function positionMeaning(key, value) {
    if (key === 'column') {
      var c = Parser.decodeColumn(value);
      return c === null ? (value === '' ? 'blank' : 'not a column') : 'column ' + c;
    }
    if (value.trim() === '') return 'blank (no corner)';
    var row = value.slice(0, 2).trim(), col = Parser.decodeColumn(value.slice(2));
    return /^\d+$/.test(row) && col !== null ? 'row ' + parseInt(row, 10) + ', column ' + col : null;
  }

  var FUNCTION_KEYS = { '1': 'Print', '2': 'Page Down', '3': 'Page Up', '4': 'Clear', '5': 'Help', '6': 'Home' };
  var COMMAND_LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXY';

  function keyMaskMeaning(value) {
    if (value === '') return 'blank: no keys listed';
    var parts = [], bad = [];
    Array.from(value).forEach(function (ch) {
      if (FUNCTION_KEYS[ch]) parts.push(ch + ' = ' + FUNCTION_KEYS[ch]);
      else if (COMMAND_LETTERS.indexOf(ch) >= 0) parts.push(ch + ' = command key ' + (COMMAND_LETTERS.indexOf(ch) + 1));
      else bad.push(ch);
    });
    var text = parts.join(', ');
    if (bad.length) text += (text ? '; ' : '') + 'not a key: ' + bad.map(code).join(' ');
    return text;
  }

  function describeColumn(type, key) {
    var entry = INFO[type] && INFO[type][key];
    return entry ? { title: entry[0], text: entry[1], dds: entry[2], values: entry[3], indicator: entry[4] } : null;
  }

  // ---- the hover ---------------------------------------------------------------------------------------------------

  function build(type, title, from, to, text, dds, entry, value, isContinuation) {
    var md = '**' + title + '** (' + columnsLabel(from, to) + (type ? ', ' + (isContinuation ? 'D continuation line' : type + ' specification') : '') + ')\n\n' + text;
    if (entry && entry[3]) md += '\n\nAllowed: ' + allowedList(entry[3], !!entry[4]) + '.';
    else if (entry && entry[4]) md += '\n\nAllowed: an indicator 01 - 99.';
    if (dds !== undefined) md += '\n\nDDS: ' + (dds ? dds : 'no DDS keyword in the model (kept in the SFGR data)') + '.';
    return md;
  }

  function userDdsText() {
    return '**User DDS line** (columns 1 - 80)\n\nSequence number `*DDS` with `*` in column 7: the line is copied into the generated DDS as it is, with column 6 replaced by A and column 7 by a blank. Only the first 80 characters are used.';
  }

  function hoverAt(text, line, character) {
    try {
      if (typeof text !== 'string') return null;
      var lines = splitLines(text);
      if (!(line >= 0 && line < lines.length) || !(character >= 0)) return null;
      var raw = lines[line];
      var length = charLength(raw);
      var col = unitToChar(raw, character) + 1;           // 1-based column of the cursor
      if (col > length || col > 80) return null;

      var flags = continuationFlags(lines, line);
      var type = colText(raw, 6, 6);
      var userDds = colText(raw, 1, 4) === '*DDS' && colText(raw, 5, 5) === ' ' && colText(raw, 7, 7) === '*';
      var rangeOf = function (from, to) {
        var end = Math.min(to, length);
        return { startLine: line, startCharacter: charToUnit(raw, from - 1), endLine: line, endCharacter: charToUnit(raw, end) };
      };

      if (colText(raw, 6, Math.max(80, length)).trim() === '') return null;

      if (col <= 5) {
        if (userDds) return { markdown: userDdsText(), range: rangeOf(1, 5) };
        return { markdown: build('', 'Sequence number', 1, 5, 'Not processed by the FORMAT procedure; kept as found.', undefined, null, '', false), range: rangeOf(1, 5) };
      }
      if (userDds) return { markdown: userDdsText(), range: rangeOf(6, 80) };
      if (type !== 'S' && type !== 'H' && type !== 'D') {
        if (col === 6) return { markdown: '**Specification type** (column 6)\n\nS, H or D is required here; ' + code(type) + ' is not one.', range: rangeOf(6, 6) };
        return null;
      }
      if (col === 6) {
        return { markdown: build(type, 'Specification type', 6, 6, 'S display control, H help area, D field or constant. The sample file holds only S and D.', undefined, null, '', false) + '\n\nCurrent value: ' + code(type) + ' - ' + SPEC_TYPE_VALUES[type] + '.', range: rangeOf(6, 6) };
      }
      var commentNext = colText(raw, 7, 7) === '*';
      var cont = type === 'D' && flags[line];
      if (commentNext && !cont) {
        return { markdown: '**Comment line** (' + columnsLabel(7, 80) + ')\n\n`*` in column 7 makes the whole ' + type + ' line a comment.', range: rangeOf(7, 80) };
      }

      if (cont) {
        if (col === 80) {
          var x = colText(raw, 80, 80);
          return { markdown: '**Continuation** (column 80, D continuation line)\n\nX means the next D line continues the constant.\n\nCurrent value: ' + (x === 'X' ? '`X`: the next D line continues the constant.' : 'blank: the constant ends here.'), range: rangeOf(80, 80) };
        }
        return { markdown: '**Constant continuation** (' + columnsLabel(7, 79) + ', D continuation line)\n\nThe previous D line has X in column 80, so this line is more of its constant, not a field definition. Columns 7 - 79 are text.', range: rangeOf(7, 79) };
      }

      var table = type === 'S' ? Parser.S_COLUMNS : type === 'H' ? Parser.H_COLUMNS : Parser.D_COLUMNS;
      var hit = null;
      for (var i = 0; i < table.length; i++) if (col >= table[i].from && col <= table[i].to) { hit = table[i]; break; }
      if (!hit) {
        var from = col, to = col;
        for (var j = 0; j < table.length; j++) { if (table[j].to < col) from = table[j].to + 1; if (table[j].from > col) { to = table[j].from - 1; break; } if (j === table.length - 1) to = 80; }
        from = Math.max(from, 7);
        return { markdown: '**Reserved** (' + columnsLabel(from, to) + ', ' + type + ' specification)\n\nNot used on this specification; keep it blank.', range: rangeOf(from, to) };
      }
      var entry = INFO[type][hit.key];
      if (!entry) return null;
      var value = colText(raw, hit.from, hit.to).trim();
      var md = build(type, entry[0], hit.from, hit.to, entry[1], entry[2], entry, value, false);
      if (hit.key === 'constantData' && type === 'D') {
        value = colText(raw, hit.from, hit.to).replace(/\s+$/, '');
        md += '\n\nCurrent value: ' + (value === '' ? 'blank' : code(value)) + '.';
      } else {
        var meaning = meaningOf(type, hit.key, entry, hit.key === 'upperLeft' || hit.key === 'lowerRight' ? colText(raw, hit.from, hit.to) : value);
        md += '\n\nCurrent value: ' + (value === '' ? 'blank' : code(value)) + (meaning ? ' - ' + meaning + '.' : '.');
      }
      return { markdown: md, range: rangeOf(hit.from, hit.to) };
    } catch (e) {
      return null;
    }
  }

  // ---- the provider ------------------------------------------------------------------------------------------------

  function createProvider(vscodeApi, options) {
    return {
      provideHover: function (textDocument, position) {
        var settings = options.getSettings();
        if (!settings || settings.enable === false) return undefined;
        if (!options.shouldHover(textDocument)) return undefined;
        var result = hoverAt(textDocument.getText(), position.line, position.character);
        if (!result) return undefined;
        var markdown = new vscodeApi.MarkdownString(result.markdown);
        var range = new vscodeApi.Range(result.range.startLine, result.range.startCharacter, result.range.endLine, result.range.endCharacter);
        return new vscodeApi.Hover(markdown, range);
      }
    };
  }

  return { hoverAt: hoverAt, createProvider: createProvider, describeColumn: describeColumn, INFO: INFO, TYPE_NAME: TYPE_NAME };
});

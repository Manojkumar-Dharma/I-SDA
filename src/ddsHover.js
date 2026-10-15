'use strict';
/**
 * ddsHover.js - E1c. Keyword hover for DDS source opened in the text editor.
 *
 * Two layers, like E1a / E1b:
 *   - hoverAt(source, line, character, options) is pure: no `vscode` import, runs in Node and in tests.
 *     It finds the keyword under a position in the keyword area (columns 45-80, plus +/- continuation lines),
 *     works out the level the line sits at (file, record, field or help specification) and describes the keyword
 *     from the generated keyword index (dist/keywordHoverData.json, built by buildKeywordHoverData.js) and the
 *     facts in keywordSpec.js (parameter grammar, option-indicator validity).
 *   - createProvider(vscode, ...) is the thin VS Code side: one HoverProvider that asks hoverAt.
 *
 * Positions are zero-based, like VS Code's: `line` is a line index, `character` a column index (column 45 is
 * character 44). A range comes back as { startLine, startCharacter, endLine, endCharacter }, end exclusive; it is
 * one line unless the keyword's parameter list continues onto the next line.
 *
 * Plain dependency-free JS (UMD).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DdsHover = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEYWORD_AREA_START = 44; // zero-based index of column 45
  var REFERENCE_NAME = 'DDS Reference (V7R6)';

  var LEVEL_LABEL = { file: 'file', record: 'record', field: 'field', 'help-specification': 'help specification' };

  // ---- which lines belong together, and at what level ----------------------------------------------------------

  function trimEnd(s) { return s.replace(/\s+$/, ''); }
  function isBlank(s) { return /^\s*$/.test(s); }

  /** The trailing continuation sign of a line's keyword area, '+', '-' or ''. */
  function continuationSign(line) {
    var area = trimEnd(line.length > KEYWORD_AREA_START ? line.substring(KEYWORD_AREA_START) : '');
    var last = area.charAt(area.length - 1);
    return last === '+' || last === '-' ? last : '';
  }

  /**
   * One pass over the lines up to `upTo`: for each, whether it continues the line above, the level it sits at and
   * the index of the line its keyword text starts on. Follows the parser's rules: a continuation line has columns 7
   * to 44 blank; a comment has '*' in column 7; column 17 'R' starts a record, 'H' a help specification, a name in
   * columns 19-28 a field, and a line with no name carries more keywords for whatever came before it.
   */
  function scan(lines, upTo) {
    var info = [];
    var level = 'file';
    var pending = false;
    var chainStart = 0;
    for (var i = 0; i <= upTo; i++) {
      var raw = lines[i];
      var entry = { comment: false, continuation: false, level: level, chainStart: i, blank: false };
      if (pending && isBlank(raw.substring(6, KEYWORD_AREA_START))) {
        entry.continuation = true;
        entry.chainStart = chainStart;
        entry.level = level;
        pending = continuationSign(raw) !== '';
        info.push(entry);
        continue;
      }
      pending = false;
      if (raw.charAt(6) === '*') { entry.comment = true; info.push(entry); continue; }
      if (isBlank(raw.substring(6))) { entry.blank = true; info.push(entry); continue; }
      var nameType = raw.charAt(16);
      var name = raw.substring(18, 28);
      if (nameType === 'R') level = 'record';
      else if (nameType === 'H') level = 'help-specification';
      else if (!isBlank(name)) level = 'field';
      entry.level = level;
      chainStart = i;
      entry.chainStart = i;
      pending = continuationSign(raw) !== '';
      info.push(entry);
    }
    return info;
  }

  // ---- tokens of one logical keyword area -----------------------------------------------------------------------

  /**
   * The keyword text of the chain that starts at `start`, as parallel arrays of characters and positions, with the
   * trailing +/- of each continued line left out. '+' drops the blanks that start the next line, '-' keeps them.
   */
  function chainText(lines, start) {
    var chars = [];
    var pos = [];
    var i = start;
    var dropLeading = false;
    for (;;) {
      var raw = lines[i];
      var from = KEYWORD_AREA_START;
      var area = raw.length > from ? raw.substring(from) : '';
      var sign = continuationSign(raw);
      var end = sign ? trimEnd(area).length - 1 : area.length;
      var startAt = 0;
      if (dropLeading) { while (startAt < end && area.charAt(startAt) === ' ') startAt++; }
      for (var c = startAt; c < end; c++) { chars.push(area.charAt(c)); pos.push({ line: i, character: from + c }); }
      if (!sign || i + 1 >= lines.length) break;
      var next = lines[i + 1];
      if (!isBlank(next.substring(6, KEYWORD_AREA_START))) break;
      dropLeading = sign === '+';
      i++;
    }
    return { chars: chars, pos: pos };
  }

  /**
   * Splits keyword text into tokens: each word outside a quoted literal, with its depth (0 at the top, 1 inside a
   * parameter list) and, for a top-level keyword with a parameter list, `close`: the index of the ')' that ends it.
   */
  function tokenize(chars) {
    var tokens = [];
    var inQuote = false;
    var depth = 0;
    var owner = null;
    var i = 0;
    while (i < chars.length) {
      var ch = chars[i];
      if (ch === "'") { inQuote = !inQuote; i++; continue; }
      if (inQuote) { i++; continue; }
      if (ch === '(') { depth++; i++; continue; }
      if (ch === ')') {
        if (depth > 0) depth--;
        if (depth === 0 && owner) { owner.close = i; owner = null; }
        i++;
        continue;
      }
      if (/[A-Za-z*]/.test(ch)) {
        var s = i;
        i++;
        while (i < chars.length && /[A-Za-z0-9_#@$]/.test(chars[i])) i++;
        var tok = { text: chars.slice(s, i).join(''), first: s, last: i - 1, depth: depth, owner: null };
        if (depth === 0) { tok.owner = tok; owner = tok; } else { tok.owner = owner; }
        tokens.push(tok);
        continue;
      }
      i++;
    }
    return tokens;
  }

  // ---- describing a keyword --------------------------------------------------------------------------------------

  /** Index notes that name an internal task are for the maintainers, not for the person hovering. */
  function clean(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/\s+-\s+Task [A-Z]*-?\d+[\s\S]*$/, '');
    s = s.replace(/\s*\([^)]*(?:\bTask [A-Z]*-?\d+|\bI-\d+\b|\bS36-\d+)[^)]*\)/g, '');
    s = s.replace(/\s*Verified, S36-\d+(?:\/S36-\d+)*\.?/g, '');
    s = s.replace(/\s*See [^.]*\.md\.?/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  /** The name the index knows `text` by (CA03 is under CA01-CA24), or null. */
  function indexName(text, data) {
    var up = String(text).toUpperCase();
    if (data.keywords[up]) return up;
    var m = /^C([AF])(0[1-9]|1\d|2[0-4])$/.exec(up);
    if (m) {
      var group = 'C' + m[1] + '01-C' + m[1] + '24';
      if (data.keywords[group]) return group;
    }
    return null;
  }

  function optionIndicatorFact(spec, name) {
    var e = spec && spec.RECORD_TYPES ? spec.RECORD_TYPES[name] : null;
    if (!e) return null;
    if (e.optionIndicators === 'valid' || e.optionIndicatorsValid === true) return 'valid';
    if (e.optionIndicators === 'notValid') return 'not valid';
    if (e.optionIndicators === 'required') return 'required';
    return null;
  }

  /** The markdown for one keyword at one level, or null when the index does not know it. */
  function describe(keywordText, level, data, spec) {
    var name = indexName(keywordText, data);
    if (!name) return null;
    var entries = data.keywords[name];
    var here = null;
    for (var i = 0; i < entries.length; i++) if (entries[i].level === level) { here = entries[i]; break; }
    var entry = here || entries[0];
    var specName = name === 'CA01-CA24' || name === 'CF01-CF24' ? name : String(keywordText).toUpperCase();
    var shown = name === 'CA01-CA24' || name === 'CF01-CF24' ? String(keywordText).toUpperCase() : name;

    var levelsListed = [];
    for (var j = 0; j < entries.length; j++) if (levelsListed.indexOf(entries[j].level) < 0) levelsListed.push(entries[j].level);
    var head = '**' + shown + '** - ' + LEVEL_LABEL[entry.level] + ' keyword' + (entry.category ? ' (' + clean(entry.category) + ')' : '');
    var lines = [head];
    var description = clean(entry.description);
    if (description) lines.push(description);
    if (!here) {
      lines.push('_Not listed at the ' + LEVEL_LABEL[level] + ' level; it is a ' + levelsListed.map(function (l) { return LEVEL_LABEL[l]; }).join(' / ') + ' keyword._');
    } else if (levelsListed.length > 1) {
      lines.push('_Also a ' + levelsListed.filter(function (l) { return l !== level; }).map(function (l) { return LEVEL_LABEL[l]; }).join(' / ') + ' keyword._');
    }

    var parameters = clean(entry.parameters);
    var specEntry = spec && spec.RECORD_TYPES ? spec.RECORD_TYPES[specName] : null;
    if (parameters && !/^no parameters$/i.test(parameters)) lines.push('**Parameters:** ' + parameters);
    else if (specEntry && specEntry.parameters === 'none') lines.push('**Parameters:** none');
    if (specEntry && typeof specEntry.parameterGrammar === 'string' && specEntry.parameterGrammar) {
      lines.push('**Form:** `' + specEntry.parameterGrammar.replace(/`/g, "'") + '`');
    }
    if (entry.repeatable) lines.push('**Repeatable:** yes - it may be given more than once.');
    var indicators = optionIndicatorFact(spec, specName);
    if (indicators) lines.push('**Option indicators:** ' + indicators);
    var s36 = clean(entry.s36e);
    if (s36) lines.push('**System/36:** ' + s36);

    var ref = data.references && data.references[name];
    if (ref) lines.push('---\n' + REFERENCE_NAME + ': "' + ref.title + '" (line ' + ref.line + ' of DDS_Keyword_V7r6.txt)');
    else lines.push('---\n' + REFERENCE_NAME);
    return { markdown: lines.join('\n\n').replace(/\n\n---\n\n/g, '\n\n---\n'), keyword: shown, level: level };
  }

  // ---- the hover itself ------------------------------------------------------------------------------------------

  /**
   * The hover for the character at (`line`, `character`) of `source`, or null when there is none: outside the
   * keyword area, on a comment, on a quoted constant, between keywords, or on a word the index does not know.
   * `options.data` is the generated hover data ({ keywords, references }); `options.spec` is keywordSpec.js.
   * Returns { markdown, keyword, level, range }.
   */
  function hoverAt(source, line, character, options) {
    var data = options && options.data;
    if (!data || !data.keywords) return null;
    var lines = String(source).split(/\r\n|\r|\n/);
    if (line < 0 || line >= lines.length || character < KEYWORD_AREA_START) return null;
    var info = scan(lines, line);
    var here = info[line];
    if (here.comment || here.blank) return null;
    var chain = chainText(lines, here.chainStart);
    var at = -1;
    for (var i = 0; i < chain.pos.length; i++) {
      if (chain.pos[i].line === line && chain.pos[i].character === character) { at = i; break; }
    }
    if (at < 0) return null;

    var tokens = tokenize(chain.chars);
    var hit = null;
    var enclosing = null;
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      if (at >= tok.first && at <= tok.last) { hit = tok; break; }
      if (tok.depth === 0 && tok.close !== undefined && at > tok.last && at <= tok.close) enclosing = tok;
    }
    var subject = null;
    var from = null;
    var to = null;
    if (hit && hit.depth > 0 && hit.text.charAt(0) === '*' && indexName(hit.text, data)) {
      // a *-value inside a parameter list that the index describes on its own
      subject = hit;
      from = hit.first; to = hit.last;
    } else if (hit) {
      subject = hit.owner || hit;
    } else if (enclosing) {
      subject = enclosing; // on a '(', ')', a number or a blank inside the keyword's own parameter list
    }
    if (!subject) return null;
    if (from === null) {
      from = subject.first;
      to = subject.close !== undefined ? subject.close : subject.last;
    }
    var described = describe(subject.text, here.level, data, options.spec);
    if (!described) return null;
    var a = chain.pos[from];
    var b = chain.pos[to];
    described.range = { startLine: a.line, startCharacter: a.character, endLine: b.line, endCharacter: b.character + 1 };
    return described;
  }

  // ---- the VS Code side ------------------------------------------------------------------------------------------

  /**
   * One HoverProvider for the DDS documents `shouldHover` accepts. `getSettings()` answers { enable }; `loadData()`
   * returns the hover data (read once, on the first hover), `spec` is keywordSpec.js.
   */
  function createProvider(vscodeApi, options) {
    var data = null;
    return {
      provideHover: function (textDocument, position) {
        var settings = options.getSettings();
        if (!settings || settings.enable === false) return undefined;
        if (!options.shouldHover(textDocument)) return undefined;
        if (!data) data = options.loadData();
        var result = hoverAt(textDocument.getText(), position.line, position.character, { data: data, spec: options.spec });
        if (!result) return undefined;
        var markdown = new vscodeApi.MarkdownString(result.markdown);
        var range = new vscodeApi.Range(result.range.startLine, result.range.startCharacter, result.range.endLine, result.range.endCharacter);
        return new vscodeApi.Hover(markdown, range);
      }
    };
  }

  return {
    hoverAt: hoverAt,
    describe: describe,
    indexName: indexName,
    clean: clean,
    createProvider: createProvider,
    KEYWORD_AREA_START: KEYWORD_AREA_START
  };
});

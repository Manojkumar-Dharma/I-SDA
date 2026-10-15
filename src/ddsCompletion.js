/**
 * ddsCompletion.js (E1d)
 *
 * Keyword completion for DDS sources opened in the text editor. Pure module (no `vscode` import): the
 * position in, the keywords that may be typed there out. `createProvider` is the VS Code side and takes the
 * API as an argument, like the hover and the diagnostics hub.
 *
 * Where it answers. In the keyword area (columns 45-80 and continuation lines), at the end of a word being
 * typed or on a blank, outside a quoted constant and outside a parameter list. The level (file, record, field,
 * help specification) comes from the hover module's line scan, so both read a source the same way.
 *
 * What it offers. The keywords the generated index lists at that level, then three filters:
 *   1. already there: a keyword the entity (the field, the record, the file level) already has, unless the
 *      index says it is repeatable;
 *   2. field usage and data type, from keywordSpec.js (`allowedUsage`, `blockedDataTypes`, `allowedDataTypes`,
 *      `requiredDataTypes`), applied only to a named field whose usage / data type is filled in;
 *   3. the guards: the keyword is added to a copy of the current record and the diagnostics core (E1a) is asked
 *      what that adds. A keyword that adds a violation is not offered. Keywords with a parameter list are
 *      tried in several forms and refused only for a violation that every form produces, so a rule about the
 *      parameter's shape (which a bare keyword always breaks) does not hide the keyword.
 *
 * Only the guards E1a runs take part in 3 (`DdsDiagnostics.coverage()` lists them). A keyword that the
 * remaining guards would refuse can still be offered.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ddsHover.js'), require('./ddsDiagnostics.js'));
  } else {
    root.DdsCompletion = factory(root.DdsHover, root.DdsDiagnostics);
  }
})(typeof self !== 'undefined' ? self : this, function (DdsHover, DdsDiagnostics) {
  'use strict';

  var KEYWORD_AREA_START = DdsHover.KEYWORD_AREA_START; // zero-based index of column 45
  var WORD_CHAR = /[A-Za-z0-9*#@$_]/;
  var DEFAULT_BUDGET_MS = 400;
  var FULL_SOURCE_LIMIT = 4000; // file-level completion analyses the whole source up to this many lines
  var CACHE_LIMIT = 8;
  var KEYWORD_LINE_PREFIX = '     A' + new Array(KEYWORD_AREA_START - 5).join(' '); // columns 7-44 blank

  // Parameter lists tried after the bare keyword: a number, a name, a constant, two words, and the nested groups
  // the colour / attribute / character / text parameters use. A guard that sees a malformed list can report
  // more than the list (WDWBORDER also says it needs WINDOW), so the more shapes tried, the fewer keywords are
  // hidden for a violation that only a wrong shape causes.
  var PROBE_PARAMETERS = ['(1)', '(A)', "('A')", '((*COLOR BLU))', '((*DSPATR HI))', "((*CHAR '.'))", "((*TEXT 'A'))"];

  var cache = [];

  function isBlank(s) { return /^\s*$/.test(s); }
  function spaces(n) { return new Array(Math.max(0, n) + 1).join(' '); }

  // ---- structure of the source ---------------------------------------------------------------------------------

  /** Whether the line starts a record (R), a help specification (H) or a field (a name in columns 19-28). */
  function headKind(raw, entry) {
    if (entry.comment || entry.blank || entry.continuation) return null;
    var nameType = raw.charAt(16);
    if (nameType === 'R') return 'R';
    if (nameType === 'H') return 'H';
    if (!isBlank(raw.substring(18, 28))) return 'F';
    return null;
  }

  /** Index of the last head at or before `line` (any kind), or -1 for the file level. */
  function entityStartOf(lines, info, line) {
    for (var i = line; i >= 0; i--) { if (headKind(lines[i], info[i])) return i; }
    return -1;
  }

  /** Index of the last record or help-specification head at or before `line`, or -1. */
  function blockStartOf(lines, info, line) {
    for (var i = line; i >= 0; i--) { var k = headKind(lines[i], info[i]); if (k === 'R' || k === 'H') return i; }
    return -1;
  }

  /** Exclusive end of the entity that starts at `start` (the next head, or the end of the source). */
  function entityEndOf(lines, info, start, line) {
    for (var i = Math.max(start + 1, line + 1); i < lines.length; i++) { if (headKind(lines[i], info[i])) return i; }
    return lines.length;
  }

  function blockEndOf(lines, info, from) {
    for (var i = from + 1; i < lines.length; i++) { var k = headKind(lines[i], info[i]); if (k === 'R' || k === 'H') return i; }
    return lines.length;
  }

  function firstHeadOf(lines, info) {
    for (var i = 0; i < lines.length; i++) { var k = headKind(lines[i], info[i]); if (k === 'R' || k === 'H') return i; }
    return lines.length;
  }

  // ---- the word under the cursor ---------------------------------------------------------------------------------

  /**
   * The state of the keyword text up to the cursor: whether the cursor is inside a quoted constant or a parameter
   * list, and the word being typed (it must lie on the cursor's line).
   */
  function wordBeforeCursor(lines, info, line, character) {
    var here = info[line];
    var chars = [];
    if (!here.blank) {
      var chain = DdsHover.chainText(lines, here.chainStart);
      for (var i = 0; i < chain.pos.length; i++) {
        var p = chain.pos[i];
        if (p.line < line || (p.line === line && p.character < character)) chars.push({ ch: chain.chars[i], line: p.line, character: p.character });
      }
    }
    var inQuote = false;
    var depth = 0;
    for (var c = 0; c < chars.length; c++) {
      var ch = chars[c].ch;
      if (ch === "'") inQuote = !inQuote;
      else if (!inQuote && ch === '(') depth++;
      else if (!inQuote && ch === ')' && depth > 0) depth--;
    }
    if (inQuote || depth > 0) return null;
    var n = chars.length;
    var start = n;
    while (start > 0 && WORD_CHAR.test(chars[start - 1].ch)) start--;
    var word = '';
    for (var w = start; w < n; w++) {
      if (chars[w].line !== line) return null; // a name split over a continuation is not completed
      word += chars[w].ch;
    }
    return { word: word };
  }

  // ---- candidates ------------------------------------------------------------------------------------------------

  function expandGroup(name) {
    var m = /^C([AF])01-C[AF]24$/.exec(name);
    if (!m) return [name];
    var out = [];
    for (var i = 1; i <= 24; i++) out.push('C' + m[1] + (i < 10 ? '0' + i : String(i)));
    return out;
  }

  /** [{ name, entry, repeatable }] for the keywords the index lists at `level`. */
  function candidatesFor(data, level) {
    var out = [];
    Object.keys(data.keywords).forEach(function (key) {
      if (key.charAt(0) === '*') return; // parameter values, not keywords
      var entries = data.keywords[key].filter(function (e) { return e.level === level; });
      if (!entries.length) return;
      var repeatable = entries.some(function (e) { return e.repeatable; });
      expandGroup(key).forEach(function (name) { out.push({ name: name, key: key, entry: entries[0], repeatable: repeatable }); });
    });
    return out;
  }

  /** The depth-0 keyword names the entity [start, end) already has, read from `lines`. */
  function presentKeywords(lines, info, start, end) {
    var present = {};
    for (var i = Math.max(start, 0); i < end && i < lines.length; i++) {
      var e = info[i];
      if (!e || e.comment || e.blank || e.chainStart !== i) continue;
      var chain = DdsHover.chainText(lines, i);
      DdsHover.tokenize(chain.chars).forEach(function (t) {
        if (t.depth === 0) present[t.text.toUpperCase()] = true;
      });
    }
    return present;
  }

  function fieldFacts(raw) {
    return { usage: raw.charAt(37).trim().toUpperCase(), dataType: raw.charAt(34).trim().toUpperCase() };
  }

  /** Whether the spec's usage and data-type facts rule `name` out for a field with these values. */
  function ruledOutByField(spec, name, facts) {
    if (!spec) return false;
    var usage = typeof spec.allowedUsage === 'function' ? spec.allowedUsage(name) : null;
    if (usage && facts.usage && usage.indexOf(facts.usage) < 0) return true;
    if (!facts.dataType) return false;
    var blocked = typeof spec.blockedDataTypes === 'function' ? spec.blockedDataTypes(name) : null;
    if (blocked && blocked.indexOf(facts.dataType) >= 0) return true;
    var allowed = typeof spec.allowedDataTypes === 'function' ? spec.allowedDataTypes(name) : null;
    if (allowed && allowed.indexOf(facts.dataType) < 0) return true;
    var required = typeof spec.requiredDataTypes === 'function' ? spec.requiredDataTypes(name) : null;
    if (required && required.indexOf(facts.dataType) < 0) return true;
    return false;
  }

  // ---- what the guards say ---------------------------------------------------------------------------------------

  function countKeyword(model, name) {
    var n = 0;
    function walk(list) { (list || []).forEach(function (k) { if (k && k.name === name) n++; }); }
    walk(model.fileKeywords);
    (model.records || []).forEach(function (r) {
      walk(r.keywords);
      (r.fields || []).forEach(function (f) { walk(f.keywords); });
      (r.helpEntries || []).forEach(function (h) { walk(h.keywords); });
    });
    return n;
  }

  /** { keys, model }: the violations of `source` (a parse error is not one) and the parsed model. */
  function analyzeSource(diagnostics, source) {
    var result = diagnostics.analyze(source);
    return {
      keys: result.diagnostics
        .filter(function (d) { return d.code !== 'isda.parseError'; })
        .map(function (d) { return d.code + '|' + d.message; }),
      model: result.model || {}
    };
  }

  function newKeys(baseline, keys) {
    var left = baseline.slice();
    var out = [];
    keys.forEach(function (k) { var i = left.indexOf(k); if (i >= 0) left.splice(i, 1); else out.push(k); });
    return out;
  }

  function enumeratedValues(parameters) {
    var m = /^([A-Z0-9*]+(?:\s*\|\s*[A-Z0-9*]+)+)/.exec(parameters);
    return m ? m[1].split(/\s*\|\s*/) : null;
  }

  /** The texts to try for a keyword: bare, then the shapes a parameter list can take. */
  function probeForms(name, entry) {
    var forms = [name];
    var parameters = DdsHover.clean(entry.parameters);
    if (!parameters || /^no parameters$/i.test(parameters)) return forms;
    var values = enumeratedValues(parameters);
    if (values) forms.push(name + '(' + values[0] + ')');
    PROBE_PARAMETERS.forEach(function (p) { forms.push(name + p); });
    return forms;
  }

  /**
   * Whether the guards refuse `candidate` in the context `ctx` ({ lines, insertAt, baseline }): true when every form
   * of the keyword adds a violation and one violation is common to all of them.
   */
  function refusedByGuards(diagnostics, ctx, candidate) {
    var common = null;
    var parsed = false;
    var forms = probeForms(candidate.name, candidate.entry);
    for (var f = 0; f < forms.length; f++) {
      var lines = ctx.lines.slice();
      lines.splice(ctx.insertAt, 0, KEYWORD_LINE_PREFIX + forms[f]);
      var tried = analyzeSource(diagnostics, lines.join('\n'));
      if (countKeyword(tried.model, candidate.name) <= countKeyword(ctx.baseline.model, candidate.name)) continue; // the parser did not read this form as the keyword
      parsed = true;
      var added = newKeys(ctx.baseline.keys, tried.keys);
      if (!added.length) return false;
      if (f === 0 && added.some(function (k) { return ctx.parameterFree.indexOf(k.split('|')[0]) >= 0; })) return true;
      common = common === null ? added : common.filter(function (k) { return added.indexOf(k) >= 0; });
      if (!common.length) return false;
    }
    return parsed && common !== null && common.length > 0;
  }

  // ---- snippets --------------------------------------------------------------------------------------------------

  function escapeSnippet(text) { return String(text).replace(/[\\$}]/g, '\\$&'); }

  /** { text, snippet } for inserting `name`: the keyword, with a parameter-list snippet when it takes parameters. */
  function insertFor(name, entry, spec) {
    var parameters = DdsHover.clean(entry.parameters);
    var noParameters = !parameters || /^no parameters$/i.test(parameters) ||
      (spec && typeof spec.takesNoParameters === 'function' && spec.takesNoParameters(name));
    if (noParameters) return { text: name, snippet: false };
    if (/\boptional\b/i.test(parameters) || parameters.charAt(0) === '[') return { text: name, snippet: false };
    var values = enumeratedValues(parameters);
    if (values) return { text: name + '(${1|' + values.join(',') + '|})', snippet: true };
    var label = parameters.replace(/\s*\(.*$/, '').replace(/[|]/g, '/').trim() || 'value';
    if (label.length > 40) label = label.substring(0, 40).replace(/\s+\S*$/, '');
    return { text: name + '(${1:' + escapeSnippet(label) + '})', snippet: true };
  }

  // ---- the completion --------------------------------------------------------------------------------------------

  function cacheFor(key) {
    for (var i = 0; i < cache.length; i++) if (cache[i].key === key) return cache[i];
    var entry = { key: key, refused: {} };
    cache.push(entry);
    if (cache.length > CACHE_LIMIT) cache.shift();
    return entry;
  }

  /**
   * The completion for the character position (`line`, `character`) of `source`, or null when there is none:
   * outside the keyword area, on a comment, inside a quoted constant or a parameter list. Returns
   * { items, range, level, word, incomplete, unchecked } where each item is
   * { label, name, detail, documentation, insertText, snippet, sortText, filterText }.
   *
   * options: data (the generated hover data), spec (keywordSpec.js), diagnostics (ddsDiagnostics.js, the default),
   * filterByRules (default true: step 3 above), budgetMs (default 400: the time the guard checks may take; keywords
   * not reached are offered and counted in `unchecked`), now (a clock, for tests).
   */
  function completionAt(source, line, character, options) {
    options = options || {};
    var data = options.data;
    if (!data || !data.keywords) return null;
    var diagnostics = options.diagnostics || DdsDiagnostics;
    var lines = String(source).split(/\r\n|\r|\n/);
    if (line < 0 || line >= lines.length || character < KEYWORD_AREA_START) return null;
    var raw = lines[line];
    if (character > raw.length) return null;
    var info = DdsHover.scan(lines, lines.length - 1);
    var here = info[line];
    if (here.comment) return null;
    var typed = wordBeforeCursor(lines, info, line, character);
    if (!typed) return null;
    var word = typed.word.toUpperCase();
    var level = here.level;

    // the replaced range: the word, and what follows the cursor of the same word
    var rest = 0;
    while (character + rest < raw.length && WORD_CHAR.test(raw.charAt(character + rest))) rest++;
    var startCharacter = character - typed.word.length;
    var endCharacter = character + rest;
    var work = lines.slice();
    work[line] = raw.substring(0, startCharacter) + spaces(endCharacter - startCharacter) + raw.substring(endCharacter);

    // the entity the keyword would join
    var entityStart = entityStartOf(lines, info, line);
    var entityEnd = entityEndOf(lines, info, entityStart, line);
    var present = presentKeywords(work, info, entityStart, entityEnd);
    var facts = level === 'field' && entityStart >= 0 ? fieldFacts(lines[entityStart]) : null;

    var candidates = candidatesFor(data, level).filter(function (c) {
      if (word && c.name.indexOf(word) !== 0) return false;
      if (present[c.name] && !c.repeatable) return false;
      if (facts && ruledOutByField(options.spec, c.name, facts)) return false;
      return true;
    });

    // the guards
    var unchecked = 0;
    var kept = candidates;
    if (options.filterByRules !== false && diagnostics && candidates.length) {
      var now = options.now || Date.now;
      var deadline = now() + (options.budgetMs === undefined ? DEFAULT_BUDGET_MS : options.budgetMs);
      var lastContent = entityStart;
      for (var i = Math.max(entityStart, 0); i < entityEnd; i++) {
        if (!info[i].comment && !info[i].blank && !(i === line && isBlank(work[i]))) lastContent = i;
      }
      var blockStart = blockStartOf(lines, info, line);
      var ctxLines;
      var insertAt;
      var wholeSource = level === 'file' && lines.length <= FULL_SOURCE_LIMIT;
      if (wholeSource) {
        ctxLines = work;
        insertAt = lastContent + 1;
      } else {
        var fileEnd = firstHeadOf(lines, info);
        var head = work.slice(0, fileEnd);
        if (blockStart < 0) {
          ctxLines = head;
          insertAt = lastContent + 1;
        } else {
          var block = work.slice(blockStart, blockEndOf(lines, info, blockStart));
          ctxLines = head.concat(block);
          insertAt = fileEnd + (lastContent + 1 - blockStart);
        }
      }
      var key = level + '\u0000' + insertAt + '\u0000' + ctxLines.join('\n');
      var memo = cacheFor(key);
      var ctx = {
        lines: ctxLines, insertAt: insertAt, baseline: null,
        parameterFree: typeof diagnostics.recordKeywordCodes === 'function' ? diagnostics.recordKeywordCodes() : []
      };
      kept = [];
      candidates.forEach(function (c) {
        if (Object.prototype.hasOwnProperty.call(memo.refused, c.name)) {
          if (!memo.refused[c.name]) kept.push(c);
          return;
        }
        if (now() > deadline) { unchecked++; kept.push(c); return; }
        try {
          if (ctx.baseline === null) ctx.baseline = analyzeSource(diagnostics, ctxLines.join('\n'));
          var refused = refusedByGuards(diagnostics, ctx, c);
          memo.refused[c.name] = refused;
          if (!refused) kept.push(c);
        } catch (e) {
          unchecked++; kept.push(c); // a guard that fails must not take the completion down
        }
      });
    }

    var items = kept.map(function (c) {
      var described = DdsHover.describe(c.name, level, data, options.spec);
      var insert = insertFor(c.name, c.entry, options.spec);
      return {
        label: c.name,
        name: c.name,
        detail: DdsHover.clean(c.entry.category) || (level + ' keyword'),
        documentation: described ? described.markdown : '',
        insertText: insert.text,
        snippet: insert.snippet,
        sortText: c.name,
        filterText: c.name
      };
    });
    return {
      items: items,
      range: { startLine: line, startCharacter: startCharacter, endLine: line, endCharacter: endCharacter },
      level: level,
      word: typed.word,
      incomplete: word.length > 0,
      unchecked: unchecked
    };
  }

  // ---- the VS Code side ------------------------------------------------------------------------------------------

  /**
   * One CompletionItemProvider for the DDS documents `shouldComplete` accepts. `getSettings()` answers
   * { enable, filterByRules }; `loadData()` returns the hover data (read once, on the first request); `spec` is
   * keywordSpec.js.
   */
  function createProvider(vscodeApi, options) {
    var data = null;
    return {
      provideCompletionItems: function (textDocument, position) {
        var settings = options.getSettings();
        if (!settings || settings.enable === false) return undefined;
        if (!options.shouldComplete(textDocument)) return undefined;
        if (!data) data = options.loadData();
        var result = completionAt(textDocument.getText(), position.line, position.character, {
          data: data,
          spec: options.spec,
          diagnostics: options.diagnostics,
          filterByRules: settings.filterByRules !== false
        });
        if (!result) return undefined;
        var range = new vscodeApi.Range(result.range.startLine, result.range.startCharacter, result.range.endLine, result.range.endCharacter);
        var items = result.items.map(function (it) {
          var item = new vscodeApi.CompletionItem(it.label, vscodeApi.CompletionItemKind.Keyword);
          item.detail = it.detail;
          if (it.documentation) item.documentation = new vscodeApi.MarkdownString(it.documentation);
          item.insertText = it.snippet ? new vscodeApi.SnippetString(it.insertText) : it.insertText;
          item.range = range;
          item.sortText = it.sortText;
          item.filterText = it.filterText;
          return item;
        });
        return new vscodeApi.CompletionList(items, result.incomplete);
      }
    };
  }

  function clearCache() { cache = []; }

  return {
    completionAt: completionAt,
    insertFor: insertFor,
    createProvider: createProvider,
    clearCache: clearCache,
    KEYWORD_AREA_START: KEYWORD_AREA_START
  };
});

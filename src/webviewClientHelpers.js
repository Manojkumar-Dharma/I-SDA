/**
 * webviewClientHelpers.js
 *
 * Small DOM-facing helpers shared between the DSPF designer webview
 * (buildWebviewTemplate.js) and the menu designer webview
 * (buildMenuWebviewTemplate.js). Kept separate from dspfEngine.js on
 * purpose: dspfEngine.js is DDS-model-in, HTML-string-out and has no
 * knowledge of live DOM elements, while this file is purely DOM glue.
 * Same UMD-ish wrapping as dspfEngine.js/dspfWriter.js so it can be
 * embedded verbatim as a <script> tag with no bundler, the same way
 * those files already are.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WebviewClientHelpers = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Rebuilds a <select> element's <option> list from `records` (each with a
   * `.name`), preserving the previously-selected value if it still exists
   * among the new records (falls back to whatever the browser selects by
   * default - typically the first option - otherwise). Both the DSPF
   * designer and menu designer keep a record-format picker in sync with the
   * live model on every render; this was previously two near-identical
   * copies of the same loop.
   *
   * @returns {string} the select's resulting value, for callers (like the
   *   menu designer) that need to sync a second control off the same value.
   */
  function rebuildRecordSelect(selectEl, records) {
    var prev = selectEl.value;
    selectEl.innerHTML = '';
    records.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name;
      selectEl.appendChild(opt);
    });
    if (records.some(function (r) { return r.name === prev; })) {
      selectEl.value = prev;
    }
    return selectEl.value || '';
  }

  /**
   * Whether `name` is a syntactically valid DDS record-format name: 1-10
   * characters, starting with a letter or $/#/@. Doesn't check for
   * collisions with an existing name in the file - callers that care (a
   * rename shouldn't collide with another record) check that separately.
   */
  function isValidDdsName(name) {
    return /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/.test(name || '');
  }

  function isDdsWordChar(ch) {
    return /[A-Z0-9_]/.test(ch);
  }

  /**
   * Best-effort advisory scan for lines that might reference `name` in
   * plain text - SFLCTL(name), WINDOW(... name ...), MNUBARCHC(id name
   * text), etc. Used to warn (not block) before a record rename, since
   * renameRecordFormat only ever rewrites the record's own R-line, never
   * text references to it elsewhere. Deliberately a plain case-insensitive
   * substring scan with a manual word-boundary check rather than a
   * dynamically-built regex - the name being searched for is itself the
   * variable part, and DDS names can contain $/#/@, which would need
   * escaping in a regex for no real benefit here. \\b-style word chars are
   * [A-Za-z0-9_] only, so a name starting/ending with $/#/@ won't match as
   * precisely - good enough for an advisory warning, not a hard guarantee.
   * @param {[number,number]} [excludeLineRange] inclusive 1-based line range
   *   to skip (typically the record's own line range, already known to
   *   "reference" its own name).
   * @returns {number[]} 1-based line numbers with a likely reference.
   */
  function findLikelyNameReferences(text, name, excludeLineRange) {
    if (!name) return [];
    var upperName = name.toUpperCase();
    var lines = text.split(/\r\n|\r|\n/);
    var hits = [];
    lines.forEach(function (line, idx) {
      var lineNo = idx + 1;
      if (excludeLineRange && lineNo >= excludeLineRange[0] && lineNo <= excludeLineRange[1]) return;
      var upperLine = line.toUpperCase();
      var searchFrom = 0;
      while (true) {
        var pos = upperLine.indexOf(upperName, searchFrom);
        if (pos === -1) break;
        var before = pos > 0 ? upperLine[pos - 1] : '';
        var after = pos + upperName.length < upperLine.length ? upperLine[pos + upperName.length] : '';
        if (!isDdsWordChar(before) && !isDdsWordChar(after)) {
          hits.push(lineNo);
          break;
        }
        searchFrom = pos + 1;
      }
    });
    return hits;
  }

  return {
    rebuildRecordSelect: rebuildRecordSelect,
    isValidDdsName: isValidDdsName,
    findLikelyNameReferences: findLikelyNameReferences,
  };
});

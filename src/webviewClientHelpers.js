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

  return {
    rebuildRecordSelect: rebuildRecordSelect,
  };
});

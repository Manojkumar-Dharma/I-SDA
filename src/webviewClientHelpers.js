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

  // -----------------------------------------------------------------------
  // Indicator conditioning editor - renders/edits an entity's OWN `conditions`
  // array (a field, constant, or record's conditioning - e.g. the "51" in a
  // line prefixed "A  51 ..."), NOT a specific keyword's conditions. Shared
  // by the DSPF designer's field/record Properties panel and the menu
  // designer's per-option editor, since a menu option's number/label are
  // just DDS constants and condition the same way. Every change is
  // committed immediately via `onChange(newConditions)`, matching how
  // keywordEditorHtml/wireKeywordEditor already behave elsewhere in both
  // webviews - there's no separate "save" step.
  //
  // DDS allows up to 9 AND'd indicators per condition group (wrapping onto
  // continuation lines 3-at-a-time - see dspfWriter's serializeConditionChunks),
  // and any number of OR'd groups. A display-size condition (e.g. *DS4)
  // occupies a whole group by itself, mutually exclusive with indicators in
  // that same group - handled as its own read-only-shaped chip with just a
  // remove button, since building one from scratch here isn't (yet) needed:
  // this editor's own "+ OR condition" always adds an indicator group.
  // -----------------------------------------------------------------------

  function conditionsEditorHtml(conditions, idPrefix) {
    var groups = conditions || [];
    var html = '<div class="section-label">Conditioning indicators</div><div id="' + idPrefix + '-cond-groups">';
    if (groups.length === 0) {
      html += '<div class="empty-state" style="margin-bottom:6px;">Unconditioned - always shown.</div>';
    }
    groups.forEach(function (g, gi) {
      html += '<div class="cond-group" data-group="' + gi + '">';
      html += '<div class="cond-group-label">' + (gi === 0 ? 'IF' : 'OR IF') + '</div>';
      if (g.displaySizeCondition) {
        html += '<span class="keyword-chip">' + (g.displaySizeCondition.not ? 'NOT ' : '') + escapeHtml(g.displaySizeCondition.name) +
          '<button class="cond-group-remove" data-prefix="' + idPrefix + '" data-group="' + gi + '">\u00d7</button></span>';
      } else {
        (g.indicators || []).forEach(function (ind, ii) {
          html += '<span class="keyword-chip">' + (ind.not ? 'N' : '') + escapeHtml(ind.number) +
            '<button class="cond-ind-remove" data-prefix="' + idPrefix + '" data-group="' + gi + '" data-idx="' + ii + '">\u00d7</button></span>';
        });
        var atLimit = (g.indicators || []).length >= 9;
        html += '<div class="cond-add-row">' +
          '<label><input type="checkbox" class="cond-ind-not" /> NOT</label>' +
          '<input type="text" class="cond-ind-num" placeholder="nn" maxlength="2" ' + (atLimit ? 'disabled' : '') + ' />' +
          '<button class="secondary cond-ind-add" data-prefix="' + idPrefix + '" data-group="' + gi + '" ' +
          (atLimit ? 'disabled title="DDS allows at most 9 ANDed indicators per condition"' : '') + '>+ indicator</button>' +
          '</div>';
      }
      html += '<button class="secondary cond-group-remove" data-prefix="' + idPrefix + '" data-group="' + gi + '">Remove this condition</button>';
      html += '</div>';
    });
    html += '</div>';
    html += '<button class="secondary cond-add-group" data-prefix="' + idPrefix + '" style="width:100%;">+ OR condition</button>';
    return html;
  }

  function cloneConditionGroups(groups) {
    return (groups || []).map(function (g) {
      return {
        relation: g.relation,
        displaySizeCondition: g.displaySizeCondition || null,
        indicators: (g.indicators || []).map(function (ind) { return { number: ind.number, not: !!ind.not }; }),
      };
    });
  }

  // Re-derives each group's `relation` from its position (group 0 is always
  // the unconditional "AND" start of the whole condition, every later group
  // is "OR") and drops empty groups - the client only ever manipulates
  // indicators/groups through this editor's own add/remove actions, so
  // relation never needs to be set explicitly by the caller.
  function normalizeConditionGroups(groups) {
    return groups
      .filter(function (g) { return g.displaySizeCondition || (g.indicators && g.indicators.length > 0); })
      .map(function (g, i) { return { relation: i === 0 ? 'AND' : 'OR', displaySizeCondition: g.displaySizeCondition, indicators: g.indicators }; });
  }

  function wireConditionsEditor(idPrefix, conditions, onChange) {
    var groups = conditions || [];

    document.querySelectorAll('.cond-ind-remove[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gi = parseInt(btn.getAttribute('data-group'), 10);
        var ii = parseInt(btn.getAttribute('data-idx'), 10);
        var next = cloneConditionGroups(groups);
        next[gi].indicators.splice(ii, 1);
        onChange(normalizeConditionGroups(next));
      });
    });

    document.querySelectorAll('.cond-group-remove[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gi = parseInt(btn.getAttribute('data-group'), 10);
        var next = cloneConditionGroups(groups);
        next.splice(gi, 1);
        onChange(normalizeConditionGroups(next));
      });
    });

    document.querySelectorAll('.cond-ind-add[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gi = parseInt(btn.getAttribute('data-group'), 10);
        var container = btn.closest('.cond-group');
        var numInput = container.querySelector('.cond-ind-num');
        var notInput = container.querySelector('.cond-ind-not');
        var num = (numInput.value || '').trim();
        if (!/^\d{1,2}$/.test(num)) return;
        var padded = num.length < 2 ? '0' + num : num;
        var next = cloneConditionGroups(groups);
        if (next[gi].indicators.length >= 9) return;
        next[gi].indicators.push({ number: padded, not: !!(notInput && notInput.checked) });
        onChange(normalizeConditionGroups(next));
      });
    });

    var addGroupBtn = document.querySelector('.cond-add-group[data-prefix="' + idPrefix + '"]');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', function () {
        var next = cloneConditionGroups(groups).concat([{ relation: 'OR', displaySizeCondition: null, indicators: [{ number: '01', not: false }] }]);
        onChange(normalizeConditionGroups(next));
      });
    }
  }

  // -----------------------------------------------------------------------
  // Command keys (CAxx/CFxx) - shared list+add-form editor for both a
  // file's own keys and a single record's keys. `availableNumbers` (from
  // DspfWriter.availableCommandKeyNumbers) is computed by the caller since
  // it needs BOTH scopes at once (file keywords + the specific record's
  // keywords) to enforce the cross-scope exclusion - this editor only
  // renders/wires whichever single scope's own keyword list it was given.
  // -----------------------------------------------------------------------

  function commandKeysSectionHtml(scopeLabel, keywords, availableNumbers, idPrefix) {
    var parsed = DspfWriter.parseCommandKeys(keywords);
    var html = '<div class="section-label">Command keys' + (scopeLabel ? ' (' + escapeHtml(scopeLabel) + ')' : '') + '</div>';
    html += '<div id="' + idPrefix + '-cmdkeys">';
    if (parsed.length === 0) {
      html += '<div class="empty-state" style="margin-bottom:6px;">None defined.</div>';
    }
    parsed.forEach(function (k) {
      var label = 'F' + parseInt(k.number, 10) + ' = ' + k.type + k.number + (k.indicator ? ' (ind ' + k.indicator + ')' : '') + (k.text ? " '" + k.text + "'" : '');
      html += '<span class="keyword-chip">' + escapeHtml(label) + '<button class="cmdkey-remove" data-prefix="' + idPrefix + '" data-number="' + k.number + '">\u00d7</button></span>';
    });
    html += '</div>';
    html += '<div class="two-col" style="margin-top:6px;">' +
      '<select class="cmdkey-type" data-prefix="' + idPrefix + '"><option value="CA">CA (attention)</option><option value="CF">CF (function)</option></select>' +
      '<select class="cmdkey-number" data-prefix="' + idPrefix + '">' +
      availableNumbers.map(function (n) { return '<option value="' + n + '">Key ' + n + '</option>'; }).join('') +
      '</select></div>';
    html += '<div class="two-col" style="margin-top:4px;">' +
      '<input type="text" class="cmdkey-indicator" data-prefix="' + idPrefix + '" placeholder="indicator (opt)" maxlength="2" />' +
      '<input type="text" class="cmdkey-text" data-prefix="' + idPrefix + '" placeholder="on-screen text (opt)" /></div>';
    html += '<button class="secondary cmdkey-add" data-prefix="' + idPrefix + '" style="width:100%;margin-top:6px;" ' +
      (availableNumbers.length === 0 ? 'disabled title="All 24 key numbers are already assigned"' : '') + '>+ Add command key</button>';
    return html;
  }

  function wireCommandKeysSection(idPrefix, keywords, onChange) {
    document.querySelectorAll('.cmdkey-remove[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        onChange(DspfWriter.removeCommandKey(keywords, btn.getAttribute('data-number')));
      });
    });
    var addBtn = document.querySelector('.cmdkey-add[data-prefix="' + idPrefix + '"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var type = document.querySelector('.cmdkey-type[data-prefix="' + idPrefix + '"]').value;
        var numberSel = document.querySelector('.cmdkey-number[data-prefix="' + idPrefix + '"]');
        var number = numberSel && numberSel.value;
        if (!number) return;
        var indicator = document.querySelector('.cmdkey-indicator[data-prefix="' + idPrefix + '"]').value.trim();
        var text = document.querySelector('.cmdkey-text[data-prefix="' + idPrefix + '"]').value.trim();
        onChange(DspfWriter.setCommandKey(keywords, type, number, indicator || null, text || null));
      });
    }
  }

  /** Renders DspfEngine.resolveFunctionKeyLegend()'s output as a row of F-key chips,
   *  solid/active when the key's own response indicator (if any) is currently on. */
  function functionKeyLegendHtml(entries) {
    if (!entries || entries.length === 0) return '';
    var html = '<div class="fkey-legend">';
    entries.forEach(function (e) {
      var label = 'F' + parseInt(e.number, 10) + (e.text ? '=' + e.text : '');
      html += '<span class="fkey-chip' + (e.active ? ' fkey-active' : '') + '" title="' + escapeHtml(e.type + e.number) + '">' + escapeHtml(label) + '</span>';
    });
    html += '</div>';
    return html;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    rebuildRecordSelect: rebuildRecordSelect,
    isValidDdsName: isValidDdsName,
    findLikelyNameReferences: findLikelyNameReferences,
    conditionsEditorHtml: conditionsEditorHtml,
    wireConditionsEditor: wireConditionsEditor,
    commandKeysSectionHtml: commandKeysSectionHtml,
    wireCommandKeysSection: wireCommandKeysSection,
    functionKeyLegendHtml: functionKeyLegendHtml,
  };
});

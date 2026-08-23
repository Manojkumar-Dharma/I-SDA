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
   * Drives the "+ Add record" record-TYPE picker's dependent-record
   * dropdown(s): given the chosen type and the CURRENT model's records,
   * returns which existing records are legitimate picks for each of up to
   * TWO independent dependent slots - matching real SDA's own "+ Add
   * record" flow and its actual DDS keyword combinations (verified against
   * IBM's own DDS reference/examples, not guessed):
   *
   * - `sfl` slot ("which SFL record"): shown for SFLCTL, SFL, WDWSFL,
   *   PDNSFL. SFLCTL/WDWSFL/PDNSFL ask which EXISTING record already
   *   declaring `SFL` this one controls (writes `SFLCTL(name)`); SFL asks
   *   which EXISTING record already declaring `SFLCTL` to pair back to
   *   (rewrites THAT record's SFLCTL parameter to point at the brand-new
   *   SFL record - see DspfWriter.insertTypedRecord's pairBack parameter).
   * - `window` slot ("inherit geometry from"): shown for WINDOW and
   *   WDWSFL. OPTIONAL - blank means "new geometry" (a sensible default
   *   box), picking a record means inherit its geometry
   *   (`WINDOW(record-name)`) - so only records that already own a
   *   WINDOW keyword are offered.
   *
   * Real SDA's own "Window subfile" (WDWSFL) and "Pull-down subfile"
   * (PDNSFL) record types put BOTH keywords on the subfile CONTROL record -
   * `SFLCTL(sflname) WINDOW(...)` for WDWSFL, `SFLCTL(sflname) PULLDOWN`
   * for PDNSFL (see e.g. IBM's own "Window/subfile control record" example:
   * `SFLCTL(SFL1) ... WINDOW(2 22 16 35)`) - the SFL detail record itself
   * stays a plain `SFL`, same as the existing SFL type. PULLDOWN (plain)
   * and MNUBAR are keyword-only, no dependent record at all.
   *
   * Returns null if the type has no dependent record at all (BASIC,
   * PULLDOWN, MNUBAR); otherwise `{ sfl: {...}|null, window: {...}|null }`.
   * Pure/DOM-free so it's unit-testable without jsdom; the webview itself
   * just pours each slot's `candidates` into its own <select>.
   */
  function recordTypeDependentInfo(type, records) {
    var sflSlot = null;
    if (type === 'SFLCTL' || type === 'WDWSFL' || type === 'PDNSFL') {
      sflSlot = {
        label: 'Controls subfile record',
        required: true,
        candidates: records.filter(function (r) { return r.keywords.some(function (k) { return k.name === 'SFL'; }); }).map(function (r) { return r.name; }),
      };
    } else if (type === 'SFL') {
      sflSlot = {
        label: 'Paired with control record',
        required: true,
        candidates: records.filter(function (r) { return r.keywords.some(function (k) { return k.name === 'SFLCTL'; }); }).map(function (r) { return r.name; }),
      };
    }

    var windowSlot = null;
    if (type === 'WINDOW' || type === 'WDWSFL') {
      windowSlot = {
        label: 'Inherit geometry from',
        required: false,
        candidates: records.filter(function (r) { return r.keywords.some(function (k) { return k.name === 'WINDOW'; }); }).map(function (r) { return r.name; }),
      };
    }

    if (!sflSlot && !windowSlot) return null;
    return { sfl: sflSlot, window: windowSlot };
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
  // Generic keyword-chip editor (add/remove any KEYWORD(params) pair) -
  // shared by the DSPF designer's field/record/file panels and the menu
  // designer's file-attributes panel. Each keyword chip also gets a
  // "Conditioning" toggle mounting the SAME conditionsEditorHtml/
  // wireConditionsEditor pair above, but scoped to that one keyword's own
  // `conditions` rather than the whole field/record/file (e.g. conditioning
  // just one DSPATR while a field's other keywords stay unconditional) -
  // the parser/writer already round-trip `keyword.conditions` correctly,
  // this is just the second mount point the CHANGELOG's entity-level pass
  // left as follow-up work.
  //
  // `ownerKey` must be unique per keyword LIST (e.g. "file",
  // "field-<sourceLine>", "record-<name>") so multiple keyword editors on
  // the same page (or across re-renders of different entities) don't
  // collide on element ids/selectors - same convention `idPrefix` follows
  // above. `expandedSet` is a caller-owned Set of "ownerKey:idx" strings
  // that survives across re-renders (same convention as the menu
  // designer's own expandedOptionConditioning), so the panel doesn't
  // collapse itself every time an unrelated field also re-renders.
  // `rerender` is called - never `onChange` - when a toggle flips, since
  // that's pure UI state, not a document edit.
  // -----------------------------------------------------------------------

  function keywordEditorHtml(keywords, ownerKey, expandedSet) {
    var list = keywords || [];
    var html = '<div class="section-label">Keywords</div><div id="kwed-' + ownerKey + '">';
    if (list.length === 0) {
      html += '<div class="empty-state" style="margin-bottom:6px;">None defined.</div>';
    }
    list.forEach(function (k, idx) {
      var conditions = k.conditions || [];
      var condSummary = conditions.length > 0 ? ' (' + conditions.length + ')' : '';
      var isExpanded = !!(expandedSet && expandedSet.has(ownerKey + ':' + idx));
      html += '<div class="kw-row">';
      html += '<div class="kw-row-main"><span class="keyword-chip">' + escapeHtml(k.name) +
        (k.parameters ? '(' + escapeHtml(k.parameters) + ')' : '') +
        '<button data-owner="' + ownerKey + '" data-idx="' + idx + '" class="kw-remove">\u00d7</button></span>' +
        '<span class="kw-cond-toggle" data-owner="' + ownerKey + '" data-idx="' + idx + '">Conditioning' + condSummary + (isExpanded ? ' \u25b4' : ' \u25be') + '</span></div>';
      if (isExpanded) {
        html += '<div class="kw-cond-body">' + conditionsEditorHtml(conditions, ownerKey + '-kw' + idx) + '</div>';
      }
      html += '</div>';
    });
    html += '</div><div class="two-col" style="margin-top:8px;"><input type="text" id="' + ownerKey + '-new-kw-name" placeholder="KEYWORD" /><input type="text" id="' + ownerKey + '-new-kw-params" placeholder="params" /></div>';
    html += '<button class="secondary kw-add" data-owner="' + ownerKey + '" style="width:100%;margin-top:6px;">+ Add keyword</button>';
    return html;
  }

  function wireKeywordEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var list = keywords || [];

    document.querySelectorAll('.kw-remove[data-owner="' + ownerKey + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var next = list.slice();
        next.splice(idx, 1);
        onChange(next);
      });
    });

    document.querySelectorAll('.kw-cond-toggle[data-owner="' + ownerKey + '"]').forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var expandKey = ownerKey + ':' + idx;
      btn.addEventListener('click', function () {
        if (expandedSet.has(expandKey)) expandedSet.delete(expandKey);
        else expandedSet.add(expandKey);
        if (rerender) rerender();
      });
      if (expandedSet && expandedSet.has(expandKey) && list[idx]) {
        wireConditionsEditor(ownerKey + '-kw' + idx, list[idx].conditions, function (newConditions) {
          var next = list.map(function (k, i) {
            if (i !== idx) return k;
            return { name: k.name, parameters: k.parameters, conditions: newConditions, raw: k.raw, sourceLines: k.sourceLines };
          });
          onChange(next);
        });
      }
    });

    var addBtn = document.querySelector('.kw-add[data-owner="' + ownerKey + '"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var nameInput = document.getElementById(ownerKey + '-new-kw-name');
        var paramsInput = document.getElementById(ownerKey + '-new-kw-params');
        var name = (nameInput.value || '').trim().toUpperCase();
        var params = (paramsInput.value || '').trim();
        if (!name) return;
        onChange(list.concat([{ name: name, parameters: params, conditions: [], raw: '', sourceLines: [] }]));
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

  // -----------------------------------------------------------------------
  // Colors & attributes (COLOR/DSPATR) - dedicated picker instead of the
  // generic keyword box. `ownerKey` must be unique per field/constant/record
  // the same way keywordEditorHtml's is, since it drives both element ids
  // (the color <select>) and a class name shared by the attribute checkboxes.
  // -----------------------------------------------------------------------

  var DSPATR_ATTRS = ['HI', 'RI', 'UL', 'BL', 'ND', 'PC', 'MDT'];
  var COLOR_VALUES = ['', 'BLU', 'RED', 'WHT', 'GRN', 'TRQ', 'YLW', 'PNK'];

  function colorAttrEditorHtml(keywords, ownerKey) {
    var state = DspfWriter.getColorAttr(keywords);
    var html = '<div class="section-label">Color &amp; attributes</div>';
    html += '<div class="field-row"><label>Color</label><select id="' + ownerKey + '-color">' +
      COLOR_VALUES.map(function (c) {
        return '<option value="' + c + '"' + (state.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="attr-checks">';
    DSPATR_ATTRS.forEach(function (a) {
      var checked = state.attrs.indexOf(a) >= 0;
      html += '<label class="attr-check"><input type="checkbox" class="' + ownerKey + '-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
    });
    html += '</div>';
    return html;
  }

  function wireColorAttrEditor(keywords, onChange, ownerKey) {
    function commit() {
      var colorSel = document.getElementById(ownerKey + '-color');
      var color = colorSel ? colorSel.value : '';
      var attrs = Array.prototype.slice
        .call(document.querySelectorAll('.' + ownerKey + '-attr:checked'))
        .map(function (el) { return el.value; });
      onChange(DspfWriter.setColorAttr(keywords, color, attrs));
    }
    var colorSel = document.getElementById(ownerKey + '-color');
    if (colorSel) colorSel.addEventListener('change', commit);
    document.querySelectorAll('.' + ownerKey + '-attr').forEach(function (el) {
      el.addEventListener('change', commit);
    });
  }

  // -----------------------------------------------------------------------
  // Validity check (RANGE/COMP/VALUES), edit code/word (EDTCDE/EDTWRD), and
  // error message (ERRMSG) - dedicated helpers instead of the generic
  // keyword box, for named fields (validity check + edit code/word + error
  // message) AND for DATE/TIME/PAGNBR system-value constants (edit
  // code/word only, via options.includeValidity: false - those aren't
  // data-entry fields, so a validity check/error message genuinely doesn't
  // apply, but real DDS commonly puts EDTCDE/EDTWRD on them, e.g. inserting
  // slashes into a DATE placeholder). All included fields commit together
  // via one "Apply" button, same as the field Row/Col/Name group does,
  // rather than each keystroke committing immediately like the
  // keyword-chip editor.
  // -----------------------------------------------------------------------

  function validityAndEditHtml(keywords, ownerKey, options) {
    var includeValidity = !options || options.includeValidity !== false;
    var ec = DspfWriter.getEditKeyword(keywords);

    var html = '';
    if (includeValidity) {
      var vc = DspfWriter.getValidityCheck(keywords);
      html += '<div class="section-label">Validity check</div>';
      html += '<div class="two-col">' +
        '<select id="' + ownerKey + '-vc-kind">' +
        ['', 'RANGE', 'COMP', 'VALUES'].map(function (k) {
          return '<option value="' + k + '"' + (vc.kind === k ? ' selected' : '') + '>' + (k || '(none)') + '</option>';
        }).join('') +
        '</select>' +
        '<input type="text" id="' + ownerKey + '-vc-params" placeholder="e.g. 1 99" value="' + escapeHtml(vc.parameters) + '" />' +
        '</div><div class="hint-small">RANGE low high &middot; COMP op value &middot; VALUES v1 v2 ...</div>';
    }

    html += '<div class="section-label"' + (includeValidity ? ' style="margin-top:10px;"' : '') + '>Edit code / word</div>';
    html += '<div class="two-col">' +
      '<select id="' + ownerKey + '-ec-kind">' +
      ['', 'EDTCDE', 'EDTWRD'].map(function (k) {
        return '<option value="' + k + '"' + (ec.kind === k ? ' selected' : '') + '>' + (k || '(none)') + '</option>';
      }).join('') +
      '</select>' +
      '<input type="text" id="' + ownerKey + '-ec-params" placeholder="e.g. J" value="' + escapeHtml(ec.parameters) + '" />' +
      '</div><div class="hint-small">EDTCDE: a single code letter (1-4, A-D, J-O, W, X, Y, Z) &middot; EDTWRD: full quoted substitution string</div>';

    if (includeValidity) {
      html += '<div class="section-label" style="margin-top:10px;">Error message</div>';
      var errText = DspfWriter.getErrorMessageText(keywords);
      html += '<input type="text" id="' + ownerKey + '-errmsg" placeholder="Shown when the validity check fails" style="width:100%;" value="' + escapeHtml(errText) + '" />';
    }

    html += '<button class="secondary ' + ownerKey + '-vc-apply" style="width:100%;margin-top:8px;">Apply ' + (includeValidity ? 'validity/edit/message' : 'edit code/word') + '</button>';
    return html;
  }

  function wireValidityAndEdit(keywords, onChange, ownerKey, options) {
    var includeValidity = !options || options.includeValidity !== false;
    var applyBtn = document.querySelector('.' + ownerKey + '-vc-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      // Same keyword insertion order as before includeValidity existed
      // (validity check, then edit code/word, then error message) - DDS
      // doesn't care about keyword order, but preserving it keeps output
      // byte-for-byte identical for the includeValidity:true (named-field)
      // path, rather than incidentally shifting where an 80-column
      // continuation wrap falls.
      var next = keywords;
      if (includeValidity) {
        var vcKind = document.getElementById(ownerKey + '-vc-kind').value;
        var vcParams = document.getElementById(ownerKey + '-vc-params').value;
        next = DspfWriter.setValidityCheck(next, vcKind, vcParams);
      }
      var ecKind = document.getElementById(ownerKey + '-ec-kind').value;
      var ecParams = document.getElementById(ownerKey + '-ec-params').value;
      next = DspfWriter.setEditKeyword(next, ecKind, ecParams);
      if (includeValidity) {
        var errText = document.getElementById(ownerKey + '-errmsg').value;
        next = DspfWriter.setErrorMessageText(next, errText);
      }
      onChange(next);
    });
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

  // -----------------------------------------------------------------------
  // Task F1 - File-level keyword picker ("Select File Keywords" + its 9
  // category screens - see docs/sda-reference/screens/file-level/ and
  // PICKER-SCREENS-PLAN.md). Every category commits through the SAME
  // `onChange(newFileKeywords)` callback the caller already uses for
  // commitFileEdit - each row's checkbox/input applies immediately on
  // change (same "no separate Apply button" convention as
  // colorAttrEditorHtml), reading the CURRENT full fileKeywords array off
  // the row's own data-* attributes rather than keeping local state, so
  // rows never go stale against edits made through another row or the
  // raw Keywords accordion.
  //
  // A small `flagRowHtml`/`readFlagRow` pair backs most rows (checkbox +
  // optional single text input); the handful of keywords with real
  // multi-field structure (REF, PRTFILE, WDWBORDER, Display sizes) get
  // their own markup below instead of being forced through that shape.
  // -----------------------------------------------------------------------

  /** One "label ... [ ] Y=Yes (+ optional param box)" row. `paramsPlaceholder`
   *  omitted entirely means the keyword takes no parameters at all. */
  function flagRowHtml(id, label, present, paramsValue, paramsPlaceholder) {
    var html = '<div class="field-row" style="margin-bottom:10px;">';
    html += '<label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:12px;color:var(--ink);">';
    html += '<input type="checkbox" id="' + id + '-on" ' + (present ? 'checked' : '') + ' /> ' + escapeHtml(label);
    html += '</label>';
    if (paramsPlaceholder !== undefined) {
      html += '<input type="text" id="' + id + '-params" placeholder="' + escapeHtml(paramsPlaceholder) + '" value="' + escapeHtml(paramsValue || '') + '" style="width:100%;margin-top:4px;" />';
    }
    html += '</div>';
    return html;
  }

  /** Wires a flagRowHtml() row so any change to its checkbox or param box
   *  re-derives the file's keyword array and commits it via `onChange`.
   *  `apply(keywords, present, paramsValue)` does the actual get/set call
   *  for this specific keyword (usually DspfWriter.setFileFlagKeyword). */
  function wireFlagRow(id, getKeywords, onChange, apply) {
    var onEl = document.getElementById(id + '-on');
    var paramsEl = document.getElementById(id + '-params');
    function commit() {
      var present = onEl.checked;
      var params = paramsEl ? paramsEl.value : '';
      onChange(apply(getKeywords(), present, params));
    }
    if (onEl) onEl.addEventListener('change', commit);
    if (paramsEl) paramsEl.addEventListener('change', commit);
  }

  var WDWBORDER_ATTRS = ['HI', 'RI', 'CS', 'BL', 'ND', 'UL'];
  var BORDER_POSITIONS = [
    { key: 0, label: 'Top-left-corner' },
    { key: 1, label: 'Top-border' },
    { key: 2, label: 'Top-right-corner' },
    { key: 3, label: 'Left-border' },
    { key: 4, label: 'Right-border' },
    { key: 5, label: 'Bottom-left-corner' },
    { key: 6, label: 'Bottom-border' },
    { key: 7, label: 'Bottom-right-corner' },
  ];

  /**
   * Builds all 9 category panels' inner HTML at once - { general,
   * indicatorKeywords, print, help, displaySizes, dbcsConversion,
   * alternate, windowBorder, menuBar }, keyed to match the tab ids the
   * caller wires up with tabsHtml(). Every panel is self-contained HTML;
   * wireFileKeywordsPanels() below wires all of them regardless of which
   * tab is currently visible (same "all panels exist in the DOM, CSS just
   * hides the inactive ones" approach tabsHtml already uses elsewhere).
   */
  function fileKeywordsPanelsHtml(fileKeywords) {
    var kw = fileKeywords || [];
    var panels = {};

    // --- General ---
    var refState = DspfWriter.getFileRefKeyword(kw);
    var g = '';
    g += flagRowHtml('fk-invite', 'Invite devices for later read', DspfWriter.getFileFlagKeyword(kw, 'INVITE').present);
    g += flagRowHtml('fk-alwgph', 'Allow graphics', DspfWriter.getFileFlagKeyword(kw, 'ALWGPH').present);
    g += flagRowHtml('fk-msgalarm', 'Sound alarm on messages', DspfWriter.getFileFlagKeyword(kw, 'MSGALARM').present);
    g += flagRowHtml('fk-indara', 'Separate indicators area (INDARA)', DspfWriter.getFileFlagKeyword(kw, 'INDARA').present);
    g += flagRowHtml('fk-usrdspmgt', 'Manage display in S/36 mode', DspfWriter.getFileFlagKeyword(kw, 'USRDSPMGT').present);
    g += flagRowHtml('fk-check-ab', 'Allow blanks', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present);
    g += flagRowHtml('fk-check-rltb', 'Move cursor right-left, top-bottom', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RLTB').present);
    g += flagRowHtml('fk-check-rl', 'Move cursor right to left', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present);
    g += flagRowHtml('fk-dsprl', 'Right to left processing (DSPRL)', DspfWriter.getFileFlagKeyword(kw, 'DSPRL').present);
    var chginpdft = DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT');
    g += flagRowHtml('fk-chginpdft', 'Change input defaults (CHGINPDFT)', chginpdft.present, chginpdft.parameters, 'parameters (optional)');
    var entfldatr = DspfWriter.getFileFlagKeyword(kw, 'ENTFLDATR');
    g += flagRowHtml('fk-entfldatr', 'Entry field attribute (ENTFLDATR)', entfldatr.present, entfldatr.parameters, 'e.g. UL');
    g += flagRowHtml('fk-errsfl', 'Write error messages to subfile (ERRSFL)', DspfWriter.getFileFlagKeyword(kw, 'ERRSFL').present);
    g += '<div class="section-label">Reference database file (REF)</div>';
    g += '<div class="two-col"><input type="text" id="fk-ref-library" placeholder="Library" value="' + escapeHtml(refState.library) + '" />' +
      '<input type="text" id="fk-ref-record" placeholder="Record/File name" value="' + escapeHtml(refState.record) + '" /></div>';
    g += '<div class="section-label">Record to pass unformatted data (PASSRCD)</div>';
    g += '<input type="text" id="fk-passrcd" placeholder="Record name" value="' + escapeHtml(DspfWriter.getFileFlagKeyword(kw, 'PASSRCD').parameters) + '" style="width:100%;" />';
    panels.general = g;

    // --- Indicator / screen-control keywords ---
    var ind = '<div class="status" style="margin-bottom:10px;">CA/CF command keys have their own dedicated panel above (Command keys) - this covers the remaining screen-control keywords.</div>';
    [
      ['fk-clear', 'CLEAR', 'Clear', '10-99, or 01-99'],
      ['fk-home', 'HOME', 'Home', '10-99'],
      ['fk-pagedown', 'PAGEDOWN', 'Page down / Roll up', '10-99'],
      ['fk-pageup', 'PAGEUP', 'Page up / Roll down', '10-99'],
      ['fk-help', 'HELP', 'Help', '10-99'],
      ['fk-hlprtn', 'HLPRTN', 'Help return', '10-99'],
      ['fk-vldcmdkey', 'VLDCMDKEY', 'Validity command key', '10-99'],
    ].forEach(function (row) {
      var state = DspfWriter.getFileFlagKeyword(kw, row[1]);
      ind += flagRowHtml(row[0], row[2] + ' (' + row[1] + ')', state.present, state.parameters, 'indicator (' + row[3] + ')');
    });
    var indtxt = DspfWriter.getFileFlagKeyword(kw, 'INDTXT');
    var indtxtParts = /^(\S+)\s*(?:'((?:[^']|'')*)')?/.exec((indtxt.parameters || '').trim()) || [];
    ind += '<div class="section-label">Indicator text (INDTXT)</div>';
    ind += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;"><input type="checkbox" id="fk-indtxt-on" ' + (indtxt.present ? 'checked' : '') + ' /> Enabled</label>';
    ind += '<div class="two-col"><input type="text" id="fk-indtxt-ind" placeholder="indicator" value="' + escapeHtml(indtxtParts[1] || '') + '" />' +
      '<input type="text" id="fk-indtxt-text" placeholder="text" value="' + escapeHtml((indtxtParts[2] || '').replace(/''/g, "'")) + '" /></div>';
    panels.indicatorKeywords = ind;

    // --- Print ---
    var print = flagRowHtml('fk-print', 'Enable Print key (PRINT)', DspfWriter.getFileFlagKeyword(kw, 'PRINT').present, DspfWriter.getFileFlagKeyword(kw, 'PRINT').parameters, 'response indicator (if program handles it)');
    var prtFile = DspfWriter.getFilePrtFileKeyword(kw);
    print += '<div class="section-label">System handles print (PRTFILE)</div>';
    print += '<div class="two-col"><input type="text" id="fk-prtfile-name" placeholder="Print file" value="' + escapeHtml(prtFile.name) + '" />' +
      '<input type="text" id="fk-prtfile-library" placeholder="Library" value="' + escapeHtml(prtFile.library) + '" /></div>';
    print += flagRowHtml('fk-openprt', 'Leave print file open until display file is closed (OPENPRT)', DspfWriter.getFileFlagKeyword(kw, 'OPENPRT').present);
    panels.print = print;

    // --- Help ---
    var hlppnlgrp = DspfWriter.getFileFlagKeyword(kw, 'HLPPNLGRP');
    var help = flagRowHtml('fk-hlppnlgrp', 'Help text in UIM panel group (HLPPNLGRP)', hlppnlgrp.present, hlppnlgrp.parameters, 'panel-group-name library module-name');
    var hlpschidx = DspfWriter.getFileFlagKeyword(kw, 'HLPSCHIDX');
    help += flagRowHtml('fk-hlpschidx', 'Enable search index (HLPSCHIDX)', hlpschidx.present, hlpschidx.parameters, 'search-index-object library');
    help += flagRowHtml('fk-hlpfull', 'Full screen help text (HLPFULL)', DspfWriter.getFileFlagKeyword(kw, 'HLPFULL').present);
    help += '<div class="section-label">Help title (HLPTITLE)</div>';
    help += '<input type="text" id="fk-hlptitle" placeholder="Help title text" value="' + escapeHtml(DspfWriter.getFileQuotedText(kw, 'HLPTITLE')) + '" style="width:100%;" />';
    panels.help = help;

    // --- Display sizes (DSPSIZ) ---
    var sizeList = DspfWriter.getDisplaySizesList(kw);
    function orderFor(name) {
      var idx = sizeList.findIndex(function (s) { return s.name === name; });
      return idx >= 0 ? String(idx + 1) : '';
    }
    var ds = '<div class="status" style="margin-bottom:10px;">Type an order number (1-2) to select a display size, blank to leave it out.</div>';
    ds += '<div class="two-col" style="font-size:10px;text-transform:uppercase;color:var(--ink-dim);margin-bottom:4px;"><span>Size</span><span>Order / Display name</span></div>';
    ds += '<div class="two-col" style="margin-bottom:8px;"><span style="align-self:center;">27x132</span><span style="display:flex;gap:4px;"><input type="text" id="fk-dspsiz-order-ds4" placeholder="Order" value="' + escapeHtml(orderFor('*DS4')) + '" style="width:50px;" /><input type="text" id="fk-dspsiz-name-ds4" value="' + escapeHtml((sizeList.find(function (s) { return s.name === '*DS4'; }) || {}).name || '*DS4') + '" style="width:70px;" /></span></div>';
    ds += '<div class="two-col"><span style="align-self:center;">24x80</span><span style="display:flex;gap:4px;"><input type="text" id="fk-dspsiz-order-ds3" placeholder="Order" value="' + escapeHtml(orderFor('*DS3')) + '" style="width:50px;" /><input type="text" id="fk-dspsiz-name-ds3" value="' + escapeHtml((sizeList.find(function (s) { return s.name === '*DS3'; }) || {}).name || '*DS3') + '" style="width:70px;" /></span></div>';
    ds += '<button class="secondary" id="fk-dspsiz-apply" style="width:100%;margin-top:10px;">Apply display sizes</button>';
    panels.displaySizes = ds;

    // --- DBCS conversion ---
    var igccnv = DspfWriter.getFileFlagKeyword(kw, 'IGCCNV');
    var igcParts = (igccnv.parameters || '').trim().split(/\s+/);
    var dbcs = flagRowHtml('fk-igccnv', 'DBCS Conversion (IGCCNV)', igccnv.present);
    dbcs += '<div class="two-col"><input type="text" id="fk-igccnv-key" placeholder="CF01-CF24" value="' + escapeHtml(igcParts[0] || '') + '" />' +
      '<input type="text" id="fk-igccnv-line" placeholder="line 1-24" value="' + escapeHtml(igcParts[1] || '') + '" /></div>';
    panels.dbcsConversion = dbcs;

    // --- Alternate keywords ---
    var althelp = DspfWriter.getFileFlagKeyword(kw, 'ALTHELP');
    var alt = flagRowHtml('fk-althelp', 'Alternative help (ALTHELP)', althelp.present, althelp.parameters, 'alternative key, CA01-CA24');
    var altpageup = DspfWriter.getFileFlagKeyword(kw, 'ALTPAGEUP');
    alt += flagRowHtml('fk-altpageup', 'Alternative page up (ALTPAGEUP)', altpageup.present, altpageup.parameters, 'alternative key, CF01-CF24');
    var altpagedwn = DspfWriter.getFileFlagKeyword(kw, 'ALTPAGEDWN');
    alt += flagRowHtml('fk-altpagedwn', 'Alternative page down (ALTPAGEDWN)', altpagedwn.present, altpagedwn.parameters, 'alternative key, CF01-CF24');
    panels.alternate = alt;

    // --- Window Border (WDWBORDER) ---
    var wb = DspfWriter.getWdwBorder(kw);
    var wbEnabled = { color: !!wb.color, attrs: wb.attrs.length > 0, chars: wb.chars.some(function (c) { return c; }) };
    var win = '<div class="section-label">Color</div>';
    win += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="fk-wdw-color-on" ' + (wbEnabled.color ? 'checked' : '') + ' /> Define parameters</label>';
    win += '<select id="fk-wdw-color">' + COLOR_VALUES.map(function (c) { return '<option value="' + c + '"' + (wb.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>'; }).join('') + '</select>';
    win += '<div class="section-label">Display attributes</div>';
    win += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="fk-wdw-attrs-on" ' + (wbEnabled.attrs ? 'checked' : '') + ' /> Define parameters</label>';
    win += '<div class="attr-checks">' + WDWBORDER_ATTRS.map(function (a) {
      var checked = wb.attrs.indexOf(a) >= 0;
      return '<label class="attr-check"><input type="checkbox" class="fk-wdw-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
    }).join('') + '</div>';
    win += '<div class="section-label">Border Characters</div>';
    win += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="fk-wdw-chars-on" ' + (wbEnabled.chars ? 'checked' : '') + ' /> Define parameters</label>';
    BORDER_POSITIONS.forEach(function (p) {
      win += '<div class="field-row" style="margin-bottom:6px;"><label>' + escapeHtml(p.label) + '</label><input type="text" maxlength="1" id="fk-wdw-char-' + p.key + '" value="' + escapeHtml(wb.chars[p.key] || '') + '" style="width:40px;" /></div>';
    });
    win += '<button class="secondary" id="fk-wdw-apply" style="width:100%;margin-top:8px;">Apply window border</button>';
    panels.windowBorder = win;

    // --- Menu-bar keywords ---
    var mnubarsw = DspfWriter.getFileFlagKeyword(kw, 'MNUBARSW');
    var mnubarswParts = (mnubarsw.parameters || '').trim().split(/\s+/);
    var mb = flagRowHtml('fk-mnubarsw', 'Menu-bar switch key (MNUBARSW)', mnubarsw.present);
    mb += '<div class="two-col"><input type="text" id="fk-mnubarsw-ind" placeholder="indicator" value="' + escapeHtml(mnubarswParts[0] || '') + '" />' +
      '<input type="text" id="fk-mnubarsw-cakey" placeholder="CA key 01-24" value="' + escapeHtml(mnubarswParts[1] || '') + '" /></div>';
    var mnucnl = DspfWriter.getFileFlagKeyword(kw, 'MNUCNL');
    var mnucnlParts = (mnucnl.parameters || '').trim().split(/\s+/);
    mb += flagRowHtml('fk-mnucnl', 'Menu-cancel key (MNUCNL)', mnucnl.present);
    mb += '<div class="two-col"><input type="text" id="fk-mnucnl-ind" placeholder="indicator" value="' + escapeHtml(mnucnlParts[0] || '') + '" />' +
      '<input type="text" id="fk-mnucnl-cakey" placeholder="CA key 01-24" value="' + escapeHtml(mnucnlParts[1] || '') + '" /></div>';
    mb += '<input type="text" id="fk-mnucnl-resp" placeholder="response indicator 01-99" value="' + escapeHtml(mnucnlParts[2] || '') + '" style="width:100%;margin-top:4px;" />';
    panels.menuBar = mb;

    return panels;
  }

  /** Wires every row across all 9 fileKeywordsPanelsHtml() panels.
   *  `getKeywords` returns the CURRENT fileKeywords array (a function, not
   *  a snapshot, so a commit from one row sees any change a previous
   *  commit in the same render already made) and `onChange` receives the
   *  new array to commit, same contract as every other dedicated picker
   *  here. */
  function wireFileKeywordsPanels(getKeywords, onChange) {
    function simple(id, name, placeholderIsParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, placeholderIsParams ? params : '');
      });
    }
    // General
    simple('fk-invite', 'INVITE');
    simple('fk-alwgph', 'ALWGPH');
    simple('fk-msgalarm', 'MSGALARM');
    simple('fk-indara', 'INDARA');
    simple('fk-usrdspmgt', 'USRDSPMGT');
    wireFlagRow('fk-check-ab', getKeywords, onChange, function (keywords, present) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB'); });
    wireFlagRow('fk-check-rltb', getKeywords, onChange, function (keywords, present) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RLTB'); });
    wireFlagRow('fk-check-rl', getKeywords, onChange, function (keywords, present) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL'); });
    simple('fk-dsprl', 'DSPRL');
    simple('fk-chginpdft', 'CHGINPDFT', true);
    simple('fk-entfldatr', 'ENTFLDATR', true);
    simple('fk-errsfl', 'ERRSFL');
    var refLib = document.getElementById('fk-ref-library');
    var refRec = document.getElementById('fk-ref-record');
    function commitRef() { onChange(DspfWriter.setFileRefKeyword(getKeywords(), refLib.value, refRec.value)); }
    if (refLib) refLib.addEventListener('change', commitRef);
    if (refRec) refRec.addEventListener('change', commitRef);
    var passrcd = document.getElementById('fk-passrcd');
    if (passrcd) passrcd.addEventListener('change', function () { onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'PASSRCD', !!passrcd.value.trim(), passrcd.value.trim())); });

    // Indicator / screen-control
    ['fk-clear:CLEAR', 'fk-home:HOME', 'fk-pagedown:PAGEDOWN', 'fk-pageup:PAGEUP', 'fk-help:HELP', 'fk-hlprtn:HLPRTN', 'fk-vldcmdkey:VLDCMDKEY'].forEach(function (pair) {
      var parts = pair.split(':');
      simple(parts[0], parts[1], true);
    });
    var indtxtOn = document.getElementById('fk-indtxt-on');
    var indtxtInd = document.getElementById('fk-indtxt-ind');
    var indtxtText = document.getElementById('fk-indtxt-text');
    function commitIndtxt() {
      var ind = (indtxtInd.value || '').trim();
      var text = (indtxtText.value || '').trim();
      var params = ind ? ind + (text ? " '" + text.replace(/'/g, "''") + "'" : '') : '';
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'INDTXT', indtxtOn.checked, params));
    }
    if (indtxtOn) indtxtOn.addEventListener('change', commitIndtxt);
    if (indtxtInd) indtxtInd.addEventListener('change', commitIndtxt);
    if (indtxtText) indtxtText.addEventListener('change', commitIndtxt);

    // Print
    simple('fk-print', 'PRINT', true);
    var prtName = document.getElementById('fk-prtfile-name');
    var prtLib = document.getElementById('fk-prtfile-library');
    function commitPrtFile() { onChange(DspfWriter.setFilePrtFileKeyword(getKeywords(), prtName.value, prtLib.value)); }
    if (prtName) prtName.addEventListener('change', commitPrtFile);
    if (prtLib) prtLib.addEventListener('change', commitPrtFile);
    simple('fk-openprt', 'OPENPRT');

    // Help
    simple('fk-hlppnlgrp', 'HLPPNLGRP', true);
    simple('fk-hlpschidx', 'HLPSCHIDX', true);
    simple('fk-hlpfull', 'HLPFULL');
    var hlptitle = document.getElementById('fk-hlptitle');
    if (hlptitle) hlptitle.addEventListener('change', function () { onChange(DspfWriter.setFileQuotedText(getKeywords(), 'HLPTITLE', hlptitle.value)); });

    // Display sizes
    var dspsizApply = document.getElementById('fk-dspsiz-apply');
    if (dspsizApply) {
      dspsizApply.addEventListener('click', function () {
        var rows = [
          { order: document.getElementById('fk-dspsiz-order-ds4').value, lines: 27, columns: 132, name: (document.getElementById('fk-dspsiz-name-ds4').value || '*DS4').trim() || '*DS4' },
          { order: document.getElementById('fk-dspsiz-order-ds3').value, lines: 24, columns: 80, name: (document.getElementById('fk-dspsiz-name-ds3').value || '*DS3').trim() || '*DS3' },
        ].filter(function (r) { return (r.order || '').trim() !== ''; });
        rows.sort(function (a, b) { return parseInt(a.order, 10) - parseInt(b.order, 10); });
        try {
          onChange(DspfWriter.setDisplaySizesList(getKeywords(), rows.map(function (r) { return { lines: r.lines, columns: r.columns, name: r.name }; })));
        } catch (e) {
          window.alert(e.message);
        }
      });
    }

    // DBCS conversion
    var igccnvOn = document.getElementById('fk-igccnv-on');
    var igccnvKey = document.getElementById('fk-igccnv-key');
    var igccnvLine = document.getElementById('fk-igccnv-line');
    function commitIgccnv() {
      var key = (igccnvKey.value || '').trim();
      var line = (igccnvLine.value || '').trim();
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'IGCCNV', igccnvOn.checked, [key, line].filter(Boolean).join(' ')));
    }
    if (igccnvOn) igccnvOn.addEventListener('change', commitIgccnv);
    if (igccnvKey) igccnvKey.addEventListener('change', commitIgccnv);
    if (igccnvLine) igccnvLine.addEventListener('change', commitIgccnv);

    // Alternate keywords
    simple('fk-althelp', 'ALTHELP', true);
    simple('fk-altpageup', 'ALTPAGEUP', true);
    simple('fk-altpagedwn', 'ALTPAGEDWN', true);

    // Window Border
    var wdwApply = document.getElementById('fk-wdw-apply');
    if (wdwApply) {
      wdwApply.addEventListener('click', function () {
        var attrs = Array.prototype.slice.call(document.querySelectorAll('.fk-wdw-attr:checked')).map(function (el) { return el.value; });
        var chars = BORDER_POSITIONS.map(function (p) { return (document.getElementById('fk-wdw-char-' + p.key).value || '').slice(0, 1); });
        var state = {
          colorEnabled: document.getElementById('fk-wdw-color-on').checked,
          color: document.getElementById('fk-wdw-color').value,
          attrsEnabled: document.getElementById('fk-wdw-attrs-on').checked,
          attrs: attrs,
          charsEnabled: document.getElementById('fk-wdw-chars-on').checked,
          chars: chars,
        };
        onChange(DspfWriter.setWdwBorder(getKeywords(), state));
      });
    }

    // Menu-bar
    var mnubarswOn = document.getElementById('fk-mnubarsw-on');
    var mnubarswInd = document.getElementById('fk-mnubarsw-ind');
    var mnubarswCakey = document.getElementById('fk-mnubarsw-cakey');
    function commitMnubarsw() {
      var params = [mnubarswInd.value, mnubarswCakey.value].map(function (s) { return (s || '').trim(); }).filter(Boolean).join(' ');
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'MNUBARSW', mnubarswOn.checked, params));
    }
    if (mnubarswOn) mnubarswOn.addEventListener('change', commitMnubarsw);
    if (mnubarswInd) mnubarswInd.addEventListener('change', commitMnubarsw);
    if (mnubarswCakey) mnubarswCakey.addEventListener('change', commitMnubarsw);

    var mnucnlOn = document.getElementById('fk-mnucnl-on');
    var mnucnlInd = document.getElementById('fk-mnucnl-ind');
    var mnucnlCakey = document.getElementById('fk-mnucnl-cakey');
    var mnucnlResp = document.getElementById('fk-mnucnl-resp');
    function commitMnucnl() {
      var params = [mnucnlInd.value, mnucnlCakey.value, mnucnlResp.value].map(function (s) { return (s || '').trim(); }).filter(Boolean).join(' ');
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'MNUCNL', mnucnlOn.checked, params));
    }
    if (mnucnlOn) mnucnlOn.addEventListener('change', commitMnucnl);
    if (mnucnlInd) mnucnlInd.addEventListener('change', commitMnucnl);
    if (mnucnlCakey) mnucnlCakey.addEventListener('change', commitMnucnl);
    if (mnucnlResp) mnucnlResp.addEventListener('change', commitMnucnl);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    rebuildRecordSelect: rebuildRecordSelect,
    recordTypeDependentInfo: recordTypeDependentInfo,
    isValidDdsName: isValidDdsName,
    findLikelyNameReferences: findLikelyNameReferences,
    conditionsEditorHtml: conditionsEditorHtml,
    wireConditionsEditor: wireConditionsEditor,
    keywordEditorHtml: keywordEditorHtml,
    wireKeywordEditor: wireKeywordEditor,
    commandKeysSectionHtml: commandKeysSectionHtml,
    wireCommandKeysSection: wireCommandKeysSection,
    functionKeyLegendHtml: functionKeyLegendHtml,
    colorAttrEditorHtml: colorAttrEditorHtml,
    wireColorAttrEditor: wireColorAttrEditor,
    validityAndEditHtml: validityAndEditHtml,
    wireValidityAndEdit: wireValidityAndEdit,
    fileKeywordsPanelsHtml: fileKeywordsPanelsHtml,
    wireFileKeywordsPanels: wireFileKeywordsPanels,
  };
});

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
   * The real SDA record-type set the "+ Add record" wizard's Type picker
   * offers, in display order. Deliberately NOT the raw DDS keyword names -
   * `RECORD` has no keyword at all, `PULDWN` writes a `PULLDOWN` keyword,
   * and the four SFL-family entries (SFL/SFLMSG/WDWSFL/PDNSFL) all write a
   * plain `SFL` keyword on the record being created plus an
   * auto-generated, separately-named `SFLCTL` companion record - see
   * isSflFamilyRecordType below and buildTypedRecordPlan in
   * buildWebviewTemplate.js for what each writes. `SFLCTL` itself is
   * intentionally absent from this list: real SDA never lets you create a
   * bare subfile control record by hand, only ever as the automatic
   * companion to one of the four SFL-family types.
   */
  var RECORD_TYPES = [
    { value: 'RECORD', label: 'Basic screen (RECORD)' },
    { value: 'USRDFN', label: 'User-defined (USRDFN)' },
    { value: 'SFL', label: 'Subfile (SFL)' },
    { value: 'SFLMSG', label: 'Message subfile (SFLMSG)' },
    { value: 'WINDOW', label: 'Window' },
    { value: 'WDWSFL', label: 'Window subfile (WDWSFL)' },
    { value: 'PULDWN', label: 'Pull-down menu (PULDWN)' },
    { value: 'PDNSFL', label: 'Pull-down subfile (PDNSFL)' },
    { value: 'MNUBAR', label: 'Menu bar (MNUBAR)' },
  ];

  /** SFL, SFLMSG, WDWSFL, and PDNSFL all describe an SFL-keyword detail
   *  record that needs a paired SFLCTL control record - the one real SDA
   *  auto-creates for you rather than making you create it separately (see
   *  RECORD_TYPES above). SFLMSG (message subfile) additionally writes
   *  SFLMSGRCD(line) on the main record and synthesizes two hidden
   *  (usage=H) fields - a message-key field (SFLMSGKEY) and a program-queue
   *  field (SFLPGMQ) - matching IBM's own "Example: A message subfile
   *  using DDS"; see buildTypedRecordPlan in buildWebviewTemplate.js for
   *  exactly what gets written. */
  function isSflFamilyRecordType(type) {
    return type === 'SFL' || type === 'SFLMSG' || type === 'WDWSFL' || type === 'PDNSFL';
  }

  /**
   * Drives the "+ Add record" record-TYPE picker's "inherit geometry from"
   * dropdown - the only dependent-record PICKER left in the wizard now
   * that SFL-family types auto-generate their SFLCTL companion by name
   * (see isSflFamilyRecordType) rather than pairing to an existing record.
   * Shown for WINDOW (the geometry lands on the record itself) and WDWSFL
   * (the geometry lands on the auto-generated SFLCTL companion, alongside
   * its `SFLCTL(...)` - matching real SDA's own "Window subfile control
   * record" example: `SFLCTL(SFL1) ... WINDOW(2 22 16 35)`, both keywords
   * together). OPTIONAL either way - blank means "new geometry" (a
   * sensible default box), picking a record means inherit its geometry
   * (`WINDOW(record-name)`) - so only records that already own a WINDOW
   * keyword are offered.
   *
   * Returns null if the type has no geometry slot at all; otherwise
   * `{ label, required: false, candidates: [...] }`. Pure/DOM-free so it's
   * unit-testable without jsdom; the webview itself just pours
   * `candidates` into the `<select>`.
   */
  function recordTypeDependentInfo(type, records) {
    if (type !== 'WINDOW' && type !== 'WDWSFL') return null;
    return {
      label: 'Inherit geometry from',
      required: false,
      candidates: records.filter(function (r) { return r.keywords.some(function (k) { return k.name === 'WINDOW'; }); }).map(function (r) { return r.name; }),
    };
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

  // Full DSPATR list, in the same order real SDA's "Select Display
  // Attributes" screen shows them (docs/sda-reference/screens/field-level/
  // character/display-attributes/) - CS/PR/OID/SP were missing from the
  // original 7-attribute set.
  var DSPATR_ATTRS = ['HI', 'RI', 'CS', 'BL', 'ND', 'UL', 'PC', 'MDT', 'PR', 'OID', 'SP'];
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

  // CHECK(...) codes real SDA's "Validity check" screen offers alongside
  // RANGE/COMP/VALUES (Allow blanks / Name field / Name extended field /
  // Modulus 10 / Modulus 11 - see DspfWriter.getCheckOptions) - a field can
  // carry one of RANGE/COMP/VALUES AND any of these at the same time, since
  // they're a different keyword (CHECK) entirely.
  // M10/M11 each have an "immediate" variant (M10F/M11F - checked as each
  // character is typed rather than at Enter) real SDA exposes as a
  // separate "Immed" column on the same row rather than a whole extra
  // checkbox - modeled here as { code, immedCode }, switched by the
  // ownerKey+'-check-'+code+'-immed' checkbox next to it.
  var VALIDITY_CHECK_CODES = [
    { code: 'AB', label: 'Allow blanks' },
    { code: 'VN', label: 'Name field' },
    { code: 'VNE', label: 'Name extended field' },
    { code: 'M10', immedCode: 'M10F', label: 'Modulus 10 self check' },
    { code: 'M11', immedCode: 'M11F', label: 'Modulus 11 self check' },
  ];

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

      var checkCodes = DspfWriter.getCheckOptions(keywords);
      html += '<div class="attr-checks" style="margin-top:6px;">';
      VALIDITY_CHECK_CODES.forEach(function (c) {
        var isImmed = !!c.immedCode && checkCodes.indexOf(c.immedCode) >= 0;
        var checked = checkCodes.indexOf(c.code) >= 0 || isImmed;
        html += '<label class="attr-check" title="' + escapeHtml(c.label) + '"><input type="checkbox" class="' + ownerKey + '-check-code" value="' + c.code + '" ' + (checked ? 'checked' : '') + '/>' + c.code + '</label>';
        if (c.immedCode) {
          html += '<label class="attr-check" title="Immediate (check each keystroke rather than at Enter)"><input type="checkbox" class="' + ownerKey + '-check-code-immed" data-for="' + c.code + '" data-immed-code="' + c.immedCode + '" ' + (isImmed ? 'checked' : '') + '/>Immed</label>';
        }
      });
      html += '</div>';
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

        // Merge: keep whatever CHECK codes this field already had that
        // AREN'T one of the validity-check codes shown here (e.g. a Keying
        // options code like ME set via the Input Keywords panel), then
        // apply the checkbox state for the validity-specific codes.
        var validityCodeValues = [];
        VALIDITY_CHECK_CODES.forEach(function (c) { validityCodeValues.push(c.code); if (c.immedCode) validityCodeValues.push(c.immedCode); });
        var existingNonValidity = DspfWriter.getCheckOptions(next).filter(function (c) { return validityCodeValues.indexOf(c) < 0; });
        var immedFor = {};
        Array.prototype.slice.call(document.querySelectorAll('.' + ownerKey + '-check-code-immed:checked')).forEach(function (el) {
          immedFor[el.getAttribute('data-for')] = el.getAttribute('data-immed-code');
        });
        var chosenValidity = Array.prototype.slice
          .call(document.querySelectorAll('.' + ownerKey + '-check-code:checked'))
          .map(function (el) { return immedFor[el.value] || el.value; });
        next = DspfWriter.setCheckOptions(next, existingNonValidity.concat(chosenValidity));
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

  // -----------------------------------------------------------------------
  // Field-level "Keying options" (CHECK's ME/ER/MF/FE/RB/RZ/RL/LC codes),
  // "Input Keywords" (DUP/BLANKS/CHANGE/CHGINPDFT), "General Keywords"
  // (ALIAS/INDTXT/DFT/DFTVAL/FLDCSRPRG + boolean flags), database-reference
  // overrides (DLTCHK/DLTEDT), and Message ID (MSGID) - the remaining SDA
  // "Select Field Keywords" categories from docs/sda-reference/ task D1,
  // built on the getX/setX pairs above the same way the panels above are.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // D2 - Character field wiring: real SDA's own "Select Field Keywords"
  // screen (docs/sda-reference/screens/field-level/character/_menu/image161.png)
  // shows a "For Field Type" column next to each category, meaning D1's
  // panels aren't ALL applicable to every field regardless of Usage - e.g.
  // Keying options only makes sense for Hidden/Input/Both, Message ID only
  // for Output/Both. fieldKeywordCategoryVisibility() is the pure,
  // DOM-free gate deciding which panels the caller should even render for
  // the field's CURRENT (last-committed) usage/data type, matching that
  // screenshot's table exactly:
  //   Display attributes / Colors - All except Hidden
  //   Keying options             - Hidden, Input, or Both
  //   Validity check             - Input or Both, not float
  //   Input keywords             - Input or Both
  //   General keywords           - All types (always)
  //   Database reference         - Hidden, Input, Output, or Both
  //   Error messages             - Input, Output, or Both
  //   Message ID                 - Output or Both
  // Deliberately gates only VISIBILITY, never deletes a keyword a field
  // already carries just because its Usage changed - an already-set
  // keyword from a now-inapplicable category stays intact and editable via
  // the raw Keywords tab, which is never gated. M/P (Message text/Program-
  // to-system) usages and any blank/unrecognized usage fail OPEN (treated
  // as "show everything") since SDA's own table never covers them and
  // hiding a category the user might still need is worse than an extra one
  // they can ignore. Error messages is tied to Validity check's own gate
  // here (both live in the same combined validityAndEditHtml panel) rather
  // than getting its own Input-or-Both-plus-Output rule split out - an
  // error message without an associated validity check to fail has nothing
  // to report, so this is a deliberate scoping choice, not an oversight.
  // -----------------------------------------------------------------------
  function fieldKeywordCategoryVisibility(usage, dataType) {
    var u = usage || '';
    var isKnownUsage = u === 'H' || u === 'I' || u === 'O' || u === 'B';
    if (!isKnownUsage) {
      // Blank (unset) or an unrecognized usage (M/P) - SDA's own table never
      // covers these, so show every category rather than guessing wrong.
      return {
        colorAndAttributes: true,
        keyingOptions: true,
        validityAndErrorMessage: dataType !== 'F',
        inputKeywords: true,
        generalKeywords: true,
        databaseReference: true,
        messageId: true,
      };
    }
    var isIOB = u === 'I' || u === 'B'; // Input or Both
    return {
      colorAndAttributes: u !== 'H',
      keyingOptions: u === 'H' || isIOB,
      validityAndErrorMessage: isIOB && dataType !== 'F',
      inputKeywords: isIOB,
      generalKeywords: true,
      databaseReference: true, // H/I/O/B are exactly SDA's own "Hidden, Input, Output, Both" list
      messageId: u === 'O' || u === 'B',
    };
  }


  var KEYING_OPTION_CODES = [
    { code: 'ME', label: 'Mandatory entry' },
    { code: 'ER', label: 'Automatic record advance' },
    { code: 'MF', label: 'Mandatory fill' },
    { code: 'FE', label: 'Field exit key required' },
    { code: 'RB', label: 'Right adjust blank fill' },
    { code: 'RZ', label: 'Right adjust zero fill' },
    { code: 'RL', label: 'Move cursor right to left' },
    { code: 'LC', label: 'Lowercase entry allowed' },
  ];

  /** "Select Keying Options" - CHECK's ME/ER/MF/FE/RB/RZ/RL/LC codes, sharing
   *  the same underlying CHECK(...) keyword as the Validity check panel's
   *  AB/VN/VNE/M10/M11 checkboxes (see DspfWriter.getCheckOptions) - each
   *  panel only touches ITS OWN slice of the code list, merging with
   *  whatever the other panel already set, the same way
   *  validityAndEditHtml's Apply handler merges back in. */
  function keyingOptionsHtml(keywords, ownerKey) {
    var codes = DspfWriter.getCheckOptions(keywords);
    var html = '<div class="section-label">Keying options</div>';
    html += '<div class="attr-checks">';
    KEYING_OPTION_CODES.forEach(function (c) {
      var checked = codes.indexOf(c.code) >= 0;
      html += '<label class="attr-check" title="' + escapeHtml(c.label) + '"><input type="checkbox" class="' + ownerKey + '-keying-code" value="' + c.code + '" ' + (checked ? 'checked' : '') + '/>' + c.code + '</label>';
    });
    html += '</div>';
    return html;
  }

  function wireKeyingOptionsEditor(keywords, onChange, ownerKey) {
    function commit() {
      var keyingCodeValues = KEYING_OPTION_CODES.map(function (c) { return c.code; });
      var existingOther = DspfWriter.getCheckOptions(keywords).filter(function (c) { return keyingCodeValues.indexOf(c) < 0; });
      var chosen = Array.prototype.slice
        .call(document.querySelectorAll('.' + ownerKey + '-keying-code:checked'))
        .map(function (el) { return el.value; });
      onChange(DspfWriter.setCheckOptions(keywords, existingOther.concat(chosen)));
    }
    document.querySelectorAll('.' + ownerKey + '-keying-code').forEach(function (el) {
      el.addEventListener('change', commit);
    });
  }

  /** "Select Input Keywords" - DUP/BLANKS/CHANGE/CHGINPDFT (see
   *  DspfWriter.getInputKeywords/setInputKeywords). Real DDS requires a
   *  response indicator on DUP/BLANKS/CHANGE - that's set the same way any
   *  other keyword's conditioning is, via the Conditioning accordion on
   *  the Keywords tab, once the keyword exists here. */
  function inputKeywordsHtml(keywords, ownerKey) {
    var state = DspfWriter.getInputKeywords(keywords);
    var html = '<div class="section-label">Input keywords</div>';
    html += '<div class="attr-checks">';
    html += '<label class="attr-check" title="Dup key duplicates the previous record\u2019s value into this field"><input type="checkbox" id="' + ownerKey + '-inp-dup" ' + (state.dup ? 'checked' : '') + '/>DUP</label>';
    html += '<label class="attr-check" title="Numeric field: let the program tell blank apart from zero"><input type="checkbox" id="' + ownerKey + '-inp-blanks" ' + (state.blanks ? 'checked' : '') + '/>BLANKS</label>';
    html += '<label class="attr-check" title="Response indicator turns on if the workstation user changed this field"><input type="checkbox" id="' + ownerKey + '-inp-change" ' + (state.change ? 'checked' : '') + '/>CHANGE</label>';
    html += '<label class="attr-check" title="Change input defaults"><input type="checkbox" id="' + ownerKey + '-inp-chginpdft" ' + (state.chginpdft ? 'checked' : '') + '/>CHGINPDFT</label>';
    html += '</div><div class="hint-small">DUP/BLANKS/CHANGE need a response indicator - condition the keyword once it\u2019s added (Keywords tab).</div>';
    return html;
  }

  function wireInputKeywordsEditor(keywords, onChange, ownerKey) {
    function commit() {
      onChange(DspfWriter.setInputKeywords(keywords, {
        dup: !!document.getElementById(ownerKey + '-inp-dup').checked,
        blanks: !!document.getElementById(ownerKey + '-inp-blanks').checked,
        change: !!document.getElementById(ownerKey + '-inp-change').checked,
        chginpdft: !!document.getElementById(ownerKey + '-inp-chginpdft').checked,
      }));
    }
    ['dup', 'blanks', 'change', 'chginpdft'].forEach(function (k) {
      var el = document.getElementById(ownerKey + '-inp-' + k);
      if (el) el.addEventListener('change', commit);
    });
  }

  /** "Select General Keywords" - ALIAS/INDTXT/DFT/DFTVAL/FLDCSRPRG (text,
   *  caller-supplied form - see DspfWriter.getGeneralFieldKeywords for why)
   *  + PUTRETAIN/OVRDTA/OVRATR/CHRID/IGCALTTYP/NOCCSID (booleans). Batch-
   *  commits via its own Apply button, same reasoning as
   *  validityAndEditHtml (several fields at once shouldn't each trigger
   *  their own edit). */
  function generalFieldKeywordsHtml(keywords, ownerKey) {
    var s = DspfWriter.getGeneralFieldKeywords(keywords);
    var html = '<div class="section-label">General keywords</div>';
    html += '<div class="field-row"><label>ALIAS</label><input type="text" id="' + ownerKey + '-gen-alias" placeholder="Alternative (long) name" value="' + escapeHtml(s.alias) + '" /></div>';
    html += '<div class="field-row"><label>INDTXT</label><input type="text" id="' + ownerKey + '-gen-indtxt" placeholder="e.g. 50 &#39;Amount valid&#39;" value="' + escapeHtml(s.indtxt) + '" /></div>';
    html += '<div class="field-row"><label>DFT <span class="hint-small">(input-only)</span></label><input type="text" id="' + ownerKey + '-gen-dft" placeholder="e.g. &#39;N/A&#39;" value="' + escapeHtml(s.dft) + '" /></div>';
    html += '<div class="field-row"><label>DFTVAL <span class="hint-small">(output/both)</span></label><input type="text" id="' + ownerKey + '-gen-dftval" placeholder="e.g. &#39;N/A&#39;" value="' + escapeHtml(s.dftval) + '" /></div>';
    html += '<div class="field-row"><label>FLDCSRPRG</label><input type="text" id="' + ownerKey + '-gen-fldcsrprg" placeholder="Cursor-progression field name" value="' + escapeHtml(s.fldcsrprg) + '" /></div>';
    html += '<div class="attr-checks" style="margin-top:6px;">';
    [
      ['putretain', 'PUTRETAIN', 'Retain field on display'],
      ['ovrdta', 'OVRDTA', 'Override data'],
      ['ovratr', 'OVRATR', 'Override attributes'],
      ['chrid', 'CHRID', 'Translate characters'],
      ['igcalttyp', 'IGCALTTYP', 'Alter IGC type'],
      ['noccsid', 'NOCCSID', 'No coded character set id'],
    ].forEach(function (row) {
      html += '<label class="attr-check" title="' + escapeHtml(row[2]) + '"><input type="checkbox" id="' + ownerKey + '-gen-' + row[0] + '" ' + (s[row[0]] ? 'checked' : '') + '/>' + row[1] + '</label>';
    });
    html += '</div>';
    html += '<button class="secondary ' + ownerKey + '-gen-apply" style="width:100%;margin-top:8px;">Apply general keywords</button>';
    return html;
  }

  function wireGeneralFieldKeywordsEditor(keywords, onChange, ownerKey) {
    var applyBtn = document.querySelector('.' + ownerKey + '-gen-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      onChange(DspfWriter.setGeneralFieldKeywords(keywords, {
        alias: document.getElementById(ownerKey + '-gen-alias').value,
        indtxt: document.getElementById(ownerKey + '-gen-indtxt').value,
        dft: document.getElementById(ownerKey + '-gen-dft').value,
        dftval: document.getElementById(ownerKey + '-gen-dftval').value,
        fldcsrprg: document.getElementById(ownerKey + '-gen-fldcsrprg').value,
        putretain: !!document.getElementById(ownerKey + '-gen-putretain').checked,
        ovrdta: !!document.getElementById(ownerKey + '-gen-ovrdta').checked,
        ovratr: !!document.getElementById(ownerKey + '-gen-ovratr').checked,
        chrid: !!document.getElementById(ownerKey + '-gen-chrid').checked,
        igcalttyp: !!document.getElementById(ownerKey + '-gen-igcalttyp').checked,
        noccsid: !!document.getElementById(ownerKey + '-gen-noccsid').checked,
      }));
    });
  }

  /** "Define Database Reference" overrides - DLTCHK/DLTEDT, alongside
   *  (not replacing) the existing Resolve Referenced Field button which
   *  owns REFFLD/REF itself. */
  function referenceOverridesHtml(keywords, ownerKey) {
    var s = DspfWriter.getReferenceOverrides(keywords);
    var html = '<div class="section-label" style="margin-top:10px;">Ignore previously specified</div>';
    html += '<div class="attr-checks">';
    html += '<label class="attr-check" title="Ignore the referenced field\u2019s own validity-check keywords"><input type="checkbox" id="' + ownerKey + '-ref-dltchk" ' + (s.dltchk ? 'checked' : '') + '/>DLTCHK</label>';
    html += '<label class="attr-check" title="Ignore the referenced field\u2019s own edit keywords"><input type="checkbox" id="' + ownerKey + '-ref-dltedt" ' + (s.dltedt ? 'checked' : '') + '/>DLTEDT</label>';
    html += '</div>';
    return html;
  }

  function wireReferenceOverridesEditor(keywords, onChange, ownerKey) {
    function commit() {
      onChange(DspfWriter.setReferenceOverrides(keywords, {
        dltchk: !!document.getElementById(ownerKey + '-ref-dltchk').checked,
        dltedt: !!document.getElementById(ownerKey + '-ref-dltedt').checked,
      }));
    }
    ['dltchk', 'dltedt'].forEach(function (k) {
      var el = document.getElementById(ownerKey + '-ref-' + k);
      if (el) el.addEventListener('change', commit);
    });
  }

  /** "Define Message ID" - MSGID, caller-supplied argument text (see
   *  DspfWriter.getMessageId for why it isn't decomposed further). */
  function messageIdHtml(keywords, ownerKey) {
    var text = DspfWriter.getMessageId(keywords);
    var html = '<div class="section-label">Message ID (MSGID)</div>';
    html += '<input type="text" id="' + ownerKey + '-msgid" placeholder="e.g. USR &amp;FLDNAME MSGF1 MYLIB, or *NONE" style="width:100%;" value="' + escapeHtml(text) + '" />';
    html += '<div class="hint-small">[msg-prefix] &amp;field-name, or [msgid-prefix] msg-id message-file [library]</div>';
    html += '<button class="secondary ' + ownerKey + '-msgid-apply" style="width:100%;margin-top:8px;">Apply message ID</button>';
    return html;
  }

  function wireMessageIdEditor(keywords, onChange, ownerKey) {
    var applyBtn = document.querySelector('.' + ownerKey + '-msgid-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      onChange(DspfWriter.setMessageId(keywords, document.getElementById(ownerKey + '-msgid').value));
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

  // -----------------------------------------------------------------------
  // Task R1 - Base Record Keywords picker (General, Indicator, Application
  // Help, Help, Output, Input, Overlay, Print - see docs/sda-reference/
  // screens/record-level/base-record-keywords/ and PICKER-SCREENS-PLAN.md).
  // Reuses flagRowHtml/wireFlagRow and DspfWriter.getFileFlagKeyword/
  // setFileFlagKeyword etc. from Task F1 above - those are generic over any
  // `keywords` array, not file-level-specific, so a record's PRINT/PRTFILE/
  // HLPTITLE take the exact same shape as the file-level ones. Only the ids
  // differ (rk- prefix instead of fk-) so a record's panel and the file
  // panel can coexist without id collisions if both are ever rendered at
  // once (they're on different tabs, but ids are still page-global).
  // -----------------------------------------------------------------------

  /**
   * Builds all 8 R1 category panels' inner HTML at once - { general,
   * indicatorKeywords, applicationHelp, help, output, input, overlay,
   * print }, keyed to match the subtabsHtml() ids the caller wires up.
   * `idPrefix` (e.g. 'rk-RECORD1') keeps element ids unique per record
   * when the props panel is rebuilt for a different record.
   */
  function recordKeywordsPanelsHtml(keywords, idPrefix) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    // --- General ---
    var g = '';
    g += flagRowHtml(p + '-inzrcd', 'If this record is not on display, write it to the display before issuing read (INZRCD)', DspfWriter.getFileFlagKeyword(kw, 'INZRCD').present);
    g += flagRowHtml(p + '-keep', 'Keep record on display (KEEP)', DspfWriter.getFileFlagKeyword(kw, 'KEEP').present);
    g += flagRowHtml(p + '-assume', 'Assume record is on display (ASSUME)', DspfWriter.getFileFlagKeyword(kw, 'ASSUME').present);
    g += flagRowHtml(p + '-alwrol', 'Allow rolling of lines (ALWROL)', DspfWriter.getFileFlagKeyword(kw, 'ALWROL').present);
    g += flagRowHtml(p + '-retkey', 'Retain CLEAR HELP HOME and ROLL keys (RETKEY)', DspfWriter.getFileFlagKeyword(kw, 'RETKEY').present);
    g += flagRowHtml(p + '-retcmdkey', 'Retain command function (CFnn and CAnn) keys (RETCMDKEY)', DspfWriter.getFileFlagKeyword(kw, 'RETCMDKEY').present);
    var chginpdft = DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT');
    g += flagRowHtml(p + '-chginpdft', 'Change input defaults (CHGINPDFT)', chginpdft.present, chginpdft.parameters, 'parameters (optional)');
    var mnubardsp = DspfWriter.getFileFlagKeyword(kw, 'MNUBARDSP');
    g += flagRowHtml(p + '-mnubardsp', 'Menu-Bar display (MNUBARDSP)', mnubardsp.present, mnubardsp.parameters, 'parameters (optional)');
    var entfldatr = DspfWriter.getFileFlagKeyword(kw, 'ENTFLDATR');
    g += flagRowHtml(p + '-entfldatr', 'Entry field attribute (ENTFLDATR)', entfldatr.present, entfldatr.parameters, 'e.g. UL');
    var rtncsrloc = DspfWriter.getFileTwoFieldKeyword(kw, 'RTNCSRLOC');
    g += '<div class="section-label">Return cursor location (RTNCSRLOC)</div>';
    g += '<div class="two-col"><input type="text" id="' + p + '-rtncsrloc-row" placeholder="Row field name" value="' + escapeHtml(rtncsrloc.a) + '" />' +
      '<input type="text" id="' + p + '-rtncsrloc-col" placeholder="Column field name" value="' + escapeHtml(rtncsrloc.b) + '" /></div>';
    panels.general = g;

    // --- Indicator / screen-control keywords ---
    var ind = '<div class="status" style="margin-bottom:10px;">CA/CF command keys have their own dedicated panel above (Command keys) - this covers the remaining screen-control keywords.</div>';
    [
      [p + '-clear', 'CLEAR', 'Clear', '10-99, or 01-99'],
      [p + '-home', 'HOME', 'Home', '10-99'],
      [p + '-pagedown', 'PAGEDOWN', 'Page down / Roll up', '10-99'],
      [p + '-pageup', 'PAGEUP', 'Page up / Roll down', '10-99'],
      [p + '-help', 'HELP', 'Help', '10-99'],
      [p + '-hlprtn', 'HLPRTN', 'Help return', '10-99'],
      [p + '-vldcmdkey', 'VLDCMDKEY', 'Validity command key', '10-99'],
      [p + '-setof', 'SETOF', 'Set off', '10-99'],
      [p + '-change', 'CHANGE', 'Change', '10-99'],
    ].forEach(function (row) {
      var state = DspfWriter.getFileFlagKeyword(kw, row[1]);
      ind += flagRowHtml(row[0], row[2] + ' (' + row[1] + ')', state.present, state.parameters, 'indicator (' + row[3] + ')');
    });
    var indtxt = DspfWriter.getFileFlagKeyword(kw, 'INDTXT');
    var indtxtParts = /^(\S+)\s*(?:'((?:[^']|'')*)')?/.exec((indtxt.parameters || '').trim()) || [];
    ind += '<div class="section-label">Indicator text (INDTXT)</div>';
    ind += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;"><input type="checkbox" id="' + p + '-indtxt-on" ' + (indtxt.present ? 'checked' : '') + ' /> Enabled</label>';
    ind += '<div class="two-col"><input type="text" id="' + p + '-indtxt-ind" placeholder="indicator" value="' + escapeHtml(indtxtParts[1] || '') + '" />' +
      '<input type="text" id="' + p + '-indtxt-text" placeholder="text" value="' + escapeHtml((indtxtParts[2] || '').replace(/''/g, "'")) + '" /></div>';
    panels.indicatorKeywords = ind;

    // --- Application help ---
    var hlppnlgrp = DspfWriter.getFileFlagKeyword(kw, 'HLPPNLGRP');
    var ah = flagRowHtml(p + '-hlppnlgrp', 'Help text in UIM panel group (HLPPNLGRP)', hlppnlgrp.present, hlppnlgrp.parameters, 'panel-group-name library module-name');
    ah += flagRowHtml(p + '-hlpexcld', 'Help text excluded (HLPEXCLD)', DspfWriter.getFileFlagKeyword(kw, 'HLPEXCLD').present);
    ah += flagRowHtml(p + '-hlpbdy', 'Help boundary (HLPBDY)', DspfWriter.getFileFlagKeyword(kw, 'HLPBDY').present);
    ah += flagRowHtml(p + '-hlpara', 'Define help area (HLPARA)', DspfWriter.getFileFlagKeyword(kw, 'HLPARA').present);
    panels.applicationHelp = ah;

    // --- Help ---
    var help = flagRowHtml(p + '-hlpclr', 'Clear previous help text records (HLPCLR)', DspfWriter.getFileFlagKeyword(kw, 'HLPCLR').present);
    var hlpseq = DspfWriter.getFileTwoFieldKeyword(kw, 'HLPSEQ');
    help += '<div class="section-label">Sequence of help text records (HLPSEQ)</div>';
    help += '<div class="two-col"><input type="text" id="' + p + '-hlpseq-group" placeholder="Help group name" value="' + escapeHtml(hlpseq.a) + '" />' +
      '<input type="text" id="' + p + '-hlpseq-num" placeholder="Sequence number 0-99" value="' + escapeHtml(hlpseq.b) + '" /></div>';
    help += flagRowHtml(p + '-hlpcmdkey', 'Return command key from help (HLPCMDKEY)', DspfWriter.getFileFlagKeyword(kw, 'HLPCMDKEY').present);
    help += '<div class="section-label">Define help title (HLPTITLE)</div>';
    help += '<input type="text" id="' + p + '-hlptitle" placeholder="Help title text" value="' + escapeHtml(DspfWriter.getFileQuotedText(kw, 'HLPTITLE')) + '" style="width:100%;" />';
    panels.help = help;

    // --- Output ---
    var out = flagRowHtml(p + '-blink', 'Blink cursor (BLINK)', DspfWriter.getFileFlagKeyword(kw, 'BLINK').present);
    out += flagRowHtml(p + '-alarm', 'Sound the alarm (ALARM)', DspfWriter.getFileFlagKeyword(kw, 'ALARM').present);
    out += flagRowHtml(p + '-msgalarm', 'Sound alarm on messages (MSGALARM)', DspfWriter.getFileFlagKeyword(kw, 'MSGALARM').present);
    out += flagRowHtml(p + '-lock', 'Do not unlock keyboard (LOCK)', DspfWriter.getFileFlagKeyword(kw, 'LOCK').present);
    out += flagRowHtml(p + '-logout', 'Write record to job log (LOGOUT)', DspfWriter.getFileFlagKeyword(kw, 'LOGOUT').present);
    out += flagRowHtml(p + '-invite', 'Invite devices for later read (INVITE)', DspfWriter.getFileFlagKeyword(kw, 'INVITE').present);
    out += flagRowHtml(p + '-alwgph', 'Allow graphics (ALWGPH)', DspfWriter.getFileFlagKeyword(kw, 'ALWGPH').present);
    out += flagRowHtml(p + '-frcdta', 'Put data before buffer is full (FRCDTA)', DspfWriter.getFileFlagKeyword(kw, 'FRCDTA').present);
    var dspmod = DspfWriter.getFileFlagKeyword(kw, 'DSPMOD');
    out += flagRowHtml(p + '-dspmod', 'Use alternate display mode (DSPMOD)', dspmod.present, dspmod.parameters, 'display name, e.g. *DS3');
    var csrloc = DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC');
    out += '<div class="section-label">Hidden fields with cursor position for output (CSRLOC)</div>';
    out += '<div class="two-col"><input type="text" id="' + p + '-csrloc-row" placeholder="Row field name" value="' + escapeHtml(csrloc.a) + '" />' +
      '<input type="text" id="' + p + '-csrloc-col" placeholder="Column field name" value="' + escapeHtml(csrloc.b) + '" /></div>';
    var slno = DspfWriter.getFileFlagKeyword(kw, 'SLNO');
    out += flagRowHtml(p + '-slno', 'Start line number (SLNO)', slno.present, slno.parameters, '*VAR or line number');
    var clrl = DspfWriter.getFileFlagKeyword(kw, 'CLRL');
    out += flagRowHtml(p + '-clrl', 'Clear previous display (CLRL)', clrl.present, clrl.parameters, 'line number, or nn ...');
    panels.output = out;

    // --- Input ---
    var inp = flagRowHtml(p + '-loginp', 'Write record to job log (LOGINP)', DspfWriter.getFileFlagKeyword(kw, 'LOGINP').present);
    var unlock = DspfWriter.getUnlockKeyword(kw);
    inp += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;"><input type="checkbox" id="' + p + '-unlock-on" ' + (unlock.present ? 'checked' : '') + ' /> Unlock keyboard after input operation (UNLOCK)</label>';
    inp += '<div style="display:flex;gap:14px;margin-bottom:10px;">' +
      '<label class="attr-check"><input type="checkbox" id="' + p + '-unlock-erase" ' + (unlock.erase ? 'checked' : '') + '/>Erase input capable fields (*ERASE)</label>' +
      '<label class="attr-check"><input type="checkbox" id="' + p + '-unlock-mdtoff" ' + (unlock.mdtoff ? 'checked' : '') + '/>Reset all modified data tags (*MDTOFF)</label></div>';
    inp += flagRowHtml(p + '-getretain', 'If UNLOCK, retain data on display (GETRETAIN)', DspfWriter.getFileFlagKeyword(kw, 'GETRETAIN').present);
    var retlcksts = DspfWriter.getFileFlagKeyword(kw, 'RETLCKSTS');
    inp += flagRowHtml(p + '-retlcksts', 'Retain LOCK status on next read (RETLCKSTS)', retlcksts.present, retlcksts.parameters, 'indicators (optional)');
    inp += flagRowHtml(p + '-check-ab', 'Allow blanks in input fields', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present);
    inp += flagRowHtml(p + '-check-rl', 'Move cursor right to left', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present);
    inp += flagRowHtml(p + '-rtndta', 'Return same input data on next read (RTNDTA)', DspfWriter.getFileFlagKeyword(kw, 'RTNDTA').present);
    panels.input = inp;

    // --- Overlay ---
    var ov = flagRowHtml(p + '-overlay', 'Overlay without erasing (OVERLAY)', DspfWriter.getFileFlagKeyword(kw, 'OVERLAY').present);
    ov += flagRowHtml(p + '-putretain', 'Retain data on re-display (PUTRETAIN)', DspfWriter.getFileFlagKeyword(kw, 'PUTRETAIN').present);
    ov += flagRowHtml(p + '-protect', 'Protect all input fields (PROTECT)', DspfWriter.getFileFlagKeyword(kw, 'PROTECT').present);
    ov += flagRowHtml(p + '-putovr', 'Activate OVRDTA and OVRATR (PUTOVR)', DspfWriter.getFileFlagKeyword(kw, 'PUTOVR').present);
    ov += flagRowHtml(p + '-ovrdta', 'Override Data (OVRDTA)', DspfWriter.getFileFlagKeyword(kw, 'OVRDTA').present);
    ov += flagRowHtml(p + '-ovratr', 'Override Attribute (OVRATR)', DspfWriter.getFileFlagKeyword(kw, 'OVRATR').present);
    ov += flagRowHtml(p + '-inzinp', 'Initialize input fields (INZINP)', DspfWriter.getFileFlagKeyword(kw, 'INZINP').present);
    var mdtoff = DspfWriter.getFileFlagKeyword(kw, 'MDTOFF');
    ov += flagRowHtml(p + '-mdtoff', 'Reset all modified data tags (MDTOFF)', mdtoff.present, mdtoff.parameters, '*UNPR or *ALL (optional)');
    var eraseinp = DspfWriter.getFileFlagKeyword(kw, 'ERASEINP');
    ov += flagRowHtml(p + '-eraseinp', 'Erase all input fields (ERASEINP)', eraseinp.present, eraseinp.parameters, '*MDTON or *ALL (optional)');
    ov += flagRowHtml(p + '-erase', 'Erase all records below (ERASE)', DspfWriter.getFileFlagKeyword(kw, 'ERASE').present);
    panels.overlay = ov;

    // --- Print ---
    var print = DspfWriter.getFileFlagKeyword(kw, 'PRINT');
    var pr = flagRowHtml(p + '-print', 'Enable Print key (PRINT)', print.present, print.parameters, 'response indicator (if program handles it)');
    var prtFile = DspfWriter.getFilePrtFileKeyword(kw);
    pr += '<div class="section-label">System handles print (PRTFILE)</div>';
    pr += '<div class="two-col"><input type="text" id="' + p + '-prtfile-name" placeholder="Print file" value="' + escapeHtml(prtFile.name) + '" />' +
      '<input type="text" id="' + p + '-prtfile-library" placeholder="Library" value="' + escapeHtml(prtFile.library) + '" /></div>';
    panels.print = pr;

    return panels;
  }

  // ---------------------------------------------------------------------
  // Task R5 - SFLMSG-specific picker (Message Record, General, Indicator).
  // Standalone per PICKER-SCREENS-PLAN.md: SFLMSG doesn't use the base
  // Record Keywords set (R1, built above) directly - it has its own
  // narrower screen set. Every keyword here has the same simple "present,
  // optionally with free-text parameters" shape DspfWriter.getFileFlagKeyword/
  // setFileFlagKeyword already handle generically (they operate on any
  // keywords[] array, not just a file's - "file" in the name is a holdover
  // from where they were first introduced), so no new dspfWriter.js
  // functions were needed for this task - reusing flagRowHtml/wireFlagRow
  // and the same INDTXT single-instance encoding the file-level Indicator
  // panel already uses.
  //
  // Two controls from the real "Define Message Record" screen are
  // deliberately NOT wired here: "Display size conditioning" (SFLMSGRCD's
  // parameter already accepts a plain field name as an alternative to a
  // 1-27 line number, which the single sm-sflmsgrcd text box already
  // covers - DDS doesn't document a SEPARATE conditioning slot beyond
  // that) and "Roll keyword" (its real DDS argument shape wasn't
  // confidently verified against IBM's own reference). Real SDA's
  // "Define Indicator Keywords" screen's CHANGE keyword is left out for
  // the same reason - only INDTXT and SETOF's shapes were confirmed.
  // Both gaps route through the raw Keywords editor accordion that sits
  // alongside this panel, same fallback every other uncertain-shape
  // keyword in this codebase uses.
  // ---------------------------------------------------------------------

  /** Whether `rec` is a message-subfile (SFLMSG) record - defined by
   *  carrying an SFLMSGRCD keyword, the one keyword unique to this record
   *  type (see buildTypedRecordPlan in buildWebviewTemplate.js, which
   *  writes it for every SFLMSG record the "+ Add record" wizard creates).
   *  Drives whether renderRecordProps shows the SFLMSG tab at all. */
  function isSflMsgRecord(rec) {
    return (rec.keywords || []).some(function (k) { return k.name === 'SFLMSGRCD'; });
  }

  // ---------------------------------------------------------------------
  // Task R2 - USRDFN wiring. Per PICKER-SCREENS-PLAN.md, USRDFN has no
  // picker screens of its own - real SDA's own "Select Record Keywords"
  // menu for a USRDFN record (docs/sda-reference/screens/record-level/
  // usrdfn/_menu-example/image26.png) offers only 4 of R1's 8 categories:
  // General, Application help, Help, Print (Indicator/Output/Input/
  // Overlay are absent from that menu entirely, not just empty). So R2 is
  // pure wiring - renderRecordProps narrows recordKeywordsPanelsHtml's
  // subtabs to that 4-of-8 subset when the record is USRDFN - not a new
  // getX/setX pair or a new panel. The USRDFN keyword's own parameter
  // (which field carries the formatted data - see buildTypedRecordPlan)
  // isn't part of any of the 4 screens either; it stays reachable through
  // the Advanced/raw keywords accordion, same "no screen of its own"
  // reasoning.
  // ---------------------------------------------------------------------

  /** Whether `rec` is a user-defined-format (USRDFN) record - defined by
   *  carrying a USRDFN keyword, the one keyword unique to this record type
   *  (see buildTypedRecordPlan, which writes it - always with blank
   *  parameters at creation time - for every USRDFN record the "+ Add
   *  record" wizard creates). Drives whether renderRecordProps narrows the
   *  R1 Keywords subtabs to USRDFN's own 4-of-8 subset. */
  function isUsrDfnRecord(rec) {
    return (rec.keywords || []).some(function (k) { return k.name === 'USRDFN'; });
  }

  /**
   * Builds the 3 SFLMSG sub-panels' inner HTML at once - { messageRecord,
   * general, indicator } - for the record properties panel's SFLMSG tab
   * (see isSflMsgRecord above for when that tab appears). Takes the whole
   * `rec` (not just rec.keywords) because the Message Record panel's
   * Message ID/Program message queue rows are read-only lookups of WHICH
   * FIELD carries the SFLMSGKEY/SFLPGMQ keyword (those are field-level
   * keywords the "+ Add record" wizard already writes onto two
   * synthesized hidden fields at creation time - see buildTypedRecordPlan)
   * rather than record-level state of their own; renaming/reassigning
   * them happens via the Hidden fields tab, not duplicated here.
   */
  function sflMsgPanelsHtml(rec) {
    var kw = rec.keywords || [];
    var panels = {};

    // --- Message Record ---
    var rcd = DspfWriter.getFileFlagKeyword(kw, 'SFLMSGRCD');
    var mr = '<div class="section-label">Line for first message, or a field name (SFLMSGRCD)</div>';
    mr += '<input type="text" id="sm-sflmsgrcd" placeholder="1-27, or a field name" value="' + escapeHtml(rcd.parameters) + '" style="width:100%;" />';
    mr += '<div class="hint-small">Real SDA also offers a "Roll keyword" here - its DDS argument shape wasn\u2019t confidently verified, so use the raw Keywords editor below if you need it.</div>';

    var keyField = (rec.fields || []).find(function (f) { return (f.keywords || []).some(function (k) { return k.name === 'SFLMSGKEY'; }); });
    var queueField = (rec.fields || []).find(function (f) { return (f.keywords || []).some(function (k) { return k.name === 'SFLPGMQ'; }); });
    var queueKw = queueField && queueField.keywords.find(function (k) { return k.name === 'SFLPGMQ'; });
    mr += '<div class="section-label">Message ID field (SFLMSGKEY)</div>';
    mr += '<div class="status">' + (keyField ? escapeHtml(keyField.name) : '(none yet - add via the Hidden tab)') + '</div>';
    mr += '<div class="section-label">Program message queue field (SFLPGMQ)</div>';
    mr += '<div class="status">' + (queueField ? escapeHtml(queueField.name) + ((queueKw && (queueKw.parameters || '').trim() === '276') ? ' (276-byte)' : '') : '(none yet - add via the Hidden tab)') + '</div>';
    mr += '<div class="hint-small">Rename or edit either field via the Hidden fields tab.</div>';
    panels.messageRecord = mr;

    // --- General ---
    var g = '';
    g += flagRowHtml('sm-sflnxtchg', 'Return this record on read next changed (SFLNXTCHG)', DspfWriter.getFileFlagKeyword(kw, 'SFLNXTCHG').present);
    g += flagRowHtml('sm-logout', 'Write this record to the job log on output (LOGOUT)', DspfWriter.getFileFlagKeyword(kw, 'LOGOUT').present);
    g += flagRowHtml('sm-loginp', 'Write this record to the job log on input (LOGINP)', DspfWriter.getFileFlagKeyword(kw, 'LOGINP').present);
    g += flagRowHtml('sm-keep', 'Keep records on display when closing the file (KEEP)', DspfWriter.getFileFlagKeyword(kw, 'KEEP').present);
    g += flagRowHtml('sm-check-ab', 'Allow blanks (CHECK AB)', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB').present);
    g += flagRowHtml('sm-check-rl', 'Move cursor right to left (CHECK RL)', DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL').present);
    var chginpdft = DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT');
    g += flagRowHtml('sm-chginpdft', 'Change input defaults (CHGINPDFT)', chginpdft.present, chginpdft.parameters, 'parameters (optional)');
    panels.general = g;

    // --- Indicator ---
    var indtxt = DspfWriter.getFileFlagKeyword(kw, 'INDTXT');
    var indtxtParts = /^(\S+)\s*(?:'((?:[^']|'')*)')?/.exec((indtxt.parameters || '').trim()) || [];
    var ind = '<div class="section-label">Indicator text (INDTXT)</div>';
    ind += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;"><input type="checkbox" id="sm-indtxt-on" ' + (indtxt.present ? 'checked' : '') + ' /> Enabled</label>';
    ind += '<div class="two-col"><input type="text" id="sm-indtxt-ind" placeholder="indicator" value="' + escapeHtml(indtxtParts[1] || '') + '" />' +
      '<input type="text" id="sm-indtxt-text" placeholder="text" value="' + escapeHtml((indtxtParts[2] || '').replace(/''/g, "'")) + '" /></div>';
    var setof = DspfWriter.getFileFlagKeyword(kw, 'SETOF');
    ind += '<div class="section-label">Set off indicators when record is written (SETOF)</div>';
    ind += flagRowHtml('sm-setof', 'Enabled', setof.present, setof.parameters, 'space-separated indicators, e.g. 30 31 32');
    ind += '<div class="hint-small">Real SDA\u2019s Indicator screen also lists CHANGE here - its record-level DDS argument shape wasn\u2019t confidently verified, so use the raw Keywords editor below if you need it.</div>';
    panels.indicator = ind;

    return panels;
  }

  /** Wires every row across all 8 recordKeywordsPanelsHtml() panels.
   *  `getKeywords`/`onChange` follow the same "current array, new array"
   *  contract as wireFileKeywordsPanels. `idPrefix` must match what was
   *  passed to recordKeywordsPanelsHtml(). */
  function wireRecordKeywordsPanels(idPrefix, getKeywords, onChange) {
    var p = idPrefix;
    function simple(id, name, hasParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, hasParams ? params : '');
      });
    }
    function wireTwoField(elIdA, elIdB, name) {
      var elA = document.getElementById(elIdA);
      var elB = document.getElementById(elIdB);
      function commit() { onChange(DspfWriter.setFileTwoFieldKeyword(getKeywords(), name, elA.value, elB.value)); }
      if (elA) elA.addEventListener('change', commit);
      if (elB) elB.addEventListener('change', commit);
    }

    // General
    simple(p + '-inzrcd', 'INZRCD');
    simple(p + '-keep', 'KEEP');
    simple(p + '-assume', 'ASSUME');
    simple(p + '-alwrol', 'ALWROL');
    simple(p + '-retkey', 'RETKEY');
    simple(p + '-retcmdkey', 'RETCMDKEY');
    simple(p + '-chginpdft', 'CHGINPDFT', true);
    simple(p + '-mnubardsp', 'MNUBARDSP', true);
    simple(p + '-entfldatr', 'ENTFLDATR', true);
    wireTwoField(p + '-rtncsrloc-row', p + '-rtncsrloc-col', 'RTNCSRLOC');

    // Indicator / screen-control
    [p + '-clear:CLEAR', p + '-home:HOME', p + '-pagedown:PAGEDOWN', p + '-pageup:PAGEUP', p + '-help:HELP', p + '-hlprtn:HLPRTN', p + '-vldcmdkey:VLDCMDKEY', p + '-setof:SETOF', p + '-change:CHANGE'].forEach(function (pair) {
      var idx = pair.lastIndexOf(':');
      simple(pair.slice(0, idx), pair.slice(idx + 1), true);
    });
    var indtxtOn = document.getElementById(p + '-indtxt-on');
    var indtxtInd = document.getElementById(p + '-indtxt-ind');
    var indtxtText = document.getElementById(p + '-indtxt-text');
    function commitIndtxt() {
      var ind = (indtxtInd.value || '').trim();
      var text = (indtxtText.value || '').trim();
      var params = ind ? ind + (text ? " '" + text.replace(/'/g, "''") + "'" : '') : '';
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'INDTXT', indtxtOn.checked, params));
    }
    if (indtxtOn) indtxtOn.addEventListener('change', commitIndtxt);
    if (indtxtInd) indtxtInd.addEventListener('change', commitIndtxt);
    if (indtxtText) indtxtText.addEventListener('change', commitIndtxt);

    // Application help
    simple(p + '-hlppnlgrp', 'HLPPNLGRP', true);
    simple(p + '-hlpexcld', 'HLPEXCLD');
    simple(p + '-hlpbdy', 'HLPBDY');
    simple(p + '-hlpara', 'HLPARA');

    // Help
    simple(p + '-hlpclr', 'HLPCLR');
    wireTwoField(p + '-hlpseq-group', p + '-hlpseq-num', 'HLPSEQ');
    simple(p + '-hlpcmdkey', 'HLPCMDKEY');
    var hlptitle = document.getElementById(p + '-hlptitle');
    if (hlptitle) hlptitle.addEventListener('change', function () { onChange(DspfWriter.setFileQuotedText(getKeywords(), 'HLPTITLE', hlptitle.value)); });

    // Output
    simple(p + '-blink', 'BLINK');
    simple(p + '-alarm', 'ALARM');
    simple(p + '-msgalarm', 'MSGALARM');
    simple(p + '-lock', 'LOCK');
    simple(p + '-logout', 'LOGOUT');
    simple(p + '-invite', 'INVITE');
    simple(p + '-alwgph', 'ALWGPH');
    simple(p + '-frcdta', 'FRCDTA');
    simple(p + '-dspmod', 'DSPMOD', true);
    wireTwoField(p + '-csrloc-row', p + '-csrloc-col', 'CSRLOC');
    simple(p + '-slno', 'SLNO', true);
    simple(p + '-clrl', 'CLRL', true);

    // Input
    simple(p + '-loginp', 'LOGINP');
    var unlockOn = document.getElementById(p + '-unlock-on');
    var unlockErase = document.getElementById(p + '-unlock-erase');
    var unlockMdtoff = document.getElementById(p + '-unlock-mdtoff');
    function commitUnlock() { onChange(DspfWriter.setUnlockKeyword(getKeywords(), unlockOn.checked, unlockErase.checked, unlockMdtoff.checked)); }
    if (unlockOn) unlockOn.addEventListener('change', commitUnlock);
    if (unlockErase) unlockErase.addEventListener('change', commitUnlock);
    if (unlockMdtoff) unlockMdtoff.addEventListener('change', commitUnlock);
    simple(p + '-getretain', 'GETRETAIN');
    simple(p + '-retlcksts', 'RETLCKSTS', true);
    wireFlagRow(p + '-check-ab', getKeywords, onChange, function (keywords, present) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB'); });
    wireFlagRow(p + '-check-rl', getKeywords, onChange, function (keywords, present) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL'); });
    simple(p + '-rtndta', 'RTNDTA');

    // Overlay
    simple(p + '-overlay', 'OVERLAY');
    simple(p + '-putretain', 'PUTRETAIN');
    simple(p + '-protect', 'PROTECT');
    simple(p + '-putovr', 'PUTOVR');
    simple(p + '-ovrdta', 'OVRDTA');
    simple(p + '-ovratr', 'OVRATR');
    simple(p + '-inzinp', 'INZINP');
    simple(p + '-mdtoff', 'MDTOFF', true);
    simple(p + '-eraseinp', 'ERASEINP', true);
    simple(p + '-erase', 'ERASE');

    // Print
    simple(p + '-print', 'PRINT', true);
    var prtName = document.getElementById(p + '-prtfile-name');
    var prtLib = document.getElementById(p + '-prtfile-library');
    function commitPrtFile() { onChange(DspfWriter.setFilePrtFileKeyword(getKeywords(), prtName.value, prtLib.value)); }
    if (prtName) prtName.addEventListener('change', commitPrtFile);
    if (prtLib) prtLib.addEventListener('change', commitPrtFile);
  }

  /** Wires every row across all 3 sflMsgPanelsHtml() panels - same
   *  "getKeywords is a function so a commit from one row sees any change
   *  a previous commit in the same render already made" contract as
   *  wireFileKeywordsPanels above. */
  function wireSflMsgPanels(getKeywords, onChange) {
    function simple(id, name, placeholderIsParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, placeholderIsParams ? params : '');
      });
    }

    var rcd = document.getElementById('sm-sflmsgrcd');
    if (rcd) {
      rcd.addEventListener('change', function () {
        var v = (rcd.value || '').trim();
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'SFLMSGRCD', !!v, v));
      });
    }

    simple('sm-sflnxtchg', 'SFLNXTCHG');
    simple('sm-logout', 'LOGOUT');
    simple('sm-loginp', 'LOGINP');
    simple('sm-keep', 'KEEP');
    wireFlagRow('sm-check-ab', getKeywords, onChange, function (keywords, present) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB'); });
    wireFlagRow('sm-check-rl', getKeywords, onChange, function (keywords, present) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL'); });
    simple('sm-chginpdft', 'CHGINPDFT', true);

    var indtxtOn = document.getElementById('sm-indtxt-on');
    var indtxtInd = document.getElementById('sm-indtxt-ind');
    var indtxtText = document.getElementById('sm-indtxt-text');
    function commitIndtxt() {
      var indv = (indtxtInd.value || '').trim();
      var text = (indtxtText.value || '').trim();
      var params = indv ? indv + (text ? " '" + text.replace(/'/g, "''") + "'" : '') : '';
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'INDTXT', indtxtOn.checked, params));
    }
    if (indtxtOn) indtxtOn.addEventListener('change', commitIndtxt);
    if (indtxtInd) indtxtInd.addEventListener('change', commitIndtxt);
    if (indtxtText) indtxtText.addEventListener('change', commitIndtxt);

    simple('sm-setof', 'SETOF', true);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    rebuildRecordSelect: rebuildRecordSelect,
    recordTypeDependentInfo: recordTypeDependentInfo,
    RECORD_TYPES: RECORD_TYPES,
    isSflFamilyRecordType: isSflFamilyRecordType,
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
    recordKeywordsPanelsHtml: recordKeywordsPanelsHtml,
    wireRecordKeywordsPanels: wireRecordKeywordsPanels,
    keyingOptionsHtml: keyingOptionsHtml,
    fieldKeywordCategoryVisibility: fieldKeywordCategoryVisibility,
    wireKeyingOptionsEditor: wireKeyingOptionsEditor,
    inputKeywordsHtml: inputKeywordsHtml,
    wireInputKeywordsEditor: wireInputKeywordsEditor,
    generalFieldKeywordsHtml: generalFieldKeywordsHtml,
    wireGeneralFieldKeywordsEditor: wireGeneralFieldKeywordsEditor,
    referenceOverridesHtml: referenceOverridesHtml,
    wireReferenceOverridesEditor: wireReferenceOverridesEditor,
    messageIdHtml: messageIdHtml,
    wireMessageIdEditor: wireMessageIdEditor,
    isSflMsgRecord: isSflMsgRecord,
    isUsrDfnRecord: isUsrDfnRecord,
    sflMsgPanelsHtml: sflMsgPanelsHtml,
    wireSflMsgPanels: wireSflMsgPanels,
  };
});

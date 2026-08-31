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
   * Decides exactly what keywords/companion-record/hidden-fields a
   * brand-new record of `type` needs - the "+ Add record" wizard's core
   * decision table, extracted here (rather than left inline in
   * buildWebviewTemplate.js's client script) so the SAME logic can also
   * drive "Create New Display File"'s record-type picker on the extension
   * host, without a second hand-maintained copy silently drifting from
   * this one. Pure/DOM-free: no reference to `model`, `kw`'s closure, or
   * any webview global other than isSflFamilyRecordType above.
   *
   * Returns `{ mainKeywords, dependent, extraFields }` where `dependent`
   * is `{ name, keywords }` or null, and `extraFields` is an array of
   * `{ name, usage, keywords }` (SFLMSG's two hidden fields; empty for
   * every other type) - or `null` if an SFL-family type was requested
   * without a `sflctlName` (the caller's cue to prompt for one, see
   * missingDependentMessage below).
   */
  function buildTypedRecordPlan(type, name, sflctlName, windowDepValue, sflmsgOpts) {
    var kw = function (kwName, parameters) { return { name: kwName, parameters: parameters, conditions: [], raw: '', sourceLines: [] }; };
    if (type === 'USRDFN') return { mainKeywords: [kw('USRDFN', '')], dependent: null, extraFields: [] };
    if (type === 'WINDOW') {
      // A dependent pick means "inherit geometry from" (WINDOW(record-name));
      // leaving it blank means "new geometry", landed at a sensible default
      // box the user can then drag/resize like any other window.
      return { mainKeywords: [kw('WINDOW', windowDepValue || '2 2 10 40')], dependent: null, extraFields: [] };
    }
    if (type === 'PULDWN') return { mainKeywords: [kw('PULLDOWN', '')], dependent: null, extraFields: [] };
    if (type === 'MNUBAR') return { mainKeywords: [kw('MNUBAR', '')], dependent: null, extraFields: [] };
    if (isSflFamilyRecordType(type)) {
      if (!sflctlName) return null;
      var dependentKeywords = [kw('SFLCTL', name)];
      if (type === 'WDWSFL') dependentKeywords.push(kw('WINDOW', windowDepValue || '2 2 10 40'));
      if (type === 'PDNSFL') dependentKeywords.push(kw('PULLDOWN', ''));
      var mainKeywords = [kw('SFL', '')];
      var extraFields = [];
      if (type === 'SFLMSG' && sflmsgOpts) {
        mainKeywords.push(kw('SFLMSGRCD', String(sflmsgOpts.line)));
        extraFields = [
          { name: sflmsgOpts.keyName, usage: 'H', keywords: [kw('SFLMSGKEY', '')] },
          // Bare SFLPGMQ defaults to a 10-byte field; an explicit 276
          // generates the larger field some message-handling APIs expect.
          { name: sflmsgOpts.queueName, usage: 'H', keywords: [kw('SFLPGMQ', sflmsgOpts.use276 ? '276' : '')] },
        ];
      }
      return { mainKeywords: mainKeywords, dependent: { name: sflctlName, keywords: dependentKeywords }, extraFields: extraFields };
    }
    return { mainKeywords: [], dependent: null, extraFields: [] }; // RECORD
  }

  // Wording for "you picked an SFL-family type but haven't named its
  // auto-created SFLCTL companion yet" - the only still-required dependent
  // now that SFL-family types generate their control record automatically
  // instead of pairing to an existing one.
  function missingDependentMessage(type) {
    if (type === 'SFLMSG') return 'Enter a name for the message subfile\u2019s SFLCTL control record - iSDA creates it for you, same as SDA.';
    return 'Enter a name for the subfile\u2019s SFLCTL control record - iSDA creates it for you, same as SDA.';
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

  // `pendingGroupSet` (optional) is the SAME caller-owned Set already used
  // for this owner's "Conditioning" expand/collapse state (e.g. keywordEditorHtml's
  // `expandedSet`) - reused here under the distinct key `idPrefix + ':pending-or'`
  // (never collides with the numeric ":idx" keys those callers use) to track
  // "user clicked + OR condition but hasn't picked an indicator yet" as pure UI
  // state. This used to be faked by immediately writing a real group seeded with
  // indicator 01 into `conditions` (see wireConditionsEditor's add-group handler),
  // because normalizeConditionGroups() below drops any group with zero indicators
  // and every change here commits straight to the DDS source - so a genuinely
  // empty group had nowhere to live between renders. That meant clicking "+ OR
  // condition" silently conditioned the entity on indicator 01 whether the user
  // wanted that indicator or not. Tracking the pending group in `pendingGroupSet`
  // instead lets the empty IF/OR-IF row render (and accept a typed indicator)
  // WITHOUT writing anything back until the user actually adds one.
  function conditionsEditorHtml(conditions, idPrefix, pendingGroupSet) {
    var groups = conditions || [];
    var pendingKey = idPrefix + ':pending-or';
    var hasPending = !!(pendingGroupSet && pendingGroupSet.has(pendingKey));
    var html = '<div class="section-label">Conditioning indicators</div><div id="' + idPrefix + '-cond-groups">';
    if (groups.length === 0 && !hasPending) {
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
    if (hasPending) {
      html += '<div class="cond-group" data-group="pending">';
      html += '<div class="cond-group-label">' + (groups.length === 0 ? 'IF' : 'OR IF') + '</div>';
      html += '<div class="cond-add-row">' +
        '<label><input type="checkbox" class="cond-ind-not" /> NOT</label>' +
        '<input type="text" class="cond-ind-num" placeholder="nn" maxlength="2" />' +
        '<button class="secondary cond-ind-add" data-prefix="' + idPrefix + '" data-group="pending">+ indicator</button>' +
        '</div>';
      html += '<button class="secondary cond-group-remove" data-prefix="' + idPrefix + '" data-group="pending">Cancel</button>';
      html += '</div>';
    }
    html += '</div>';
    html += '<button class="secondary cond-add-group" data-prefix="' + idPrefix + '" style="width:100%;" ' + (hasPending ? 'disabled title="Add an indicator to the pending condition first, or cancel it"' : '') + '>+ OR condition</button>';
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

  // `pendingGroupSet`/`rerender` (optional, but required together to get the
  // pending-OR-group behavior documented on conditionsEditorHtml above) - when
  // omitted, "+ OR condition" falls back to the old immediate-01-group behavior
  // so any caller that hasn't been updated to pass a Set/rerender still works.
  function wireConditionsEditor(idPrefix, conditions, onChange, pendingGroupSet, rerender) {
    var groups = conditions || [];
    var pendingKey = idPrefix + ':pending-or';

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
        if (btn.getAttribute('data-group') === 'pending') {
          // Cancelling the pending (not-yet-committed) OR group - pure UI
          // state, nothing was ever written to the document for it.
          if (pendingGroupSet) pendingGroupSet.delete(pendingKey);
          if (rerender) rerender();
          return;
        }
        var gi = parseInt(btn.getAttribute('data-group'), 10);
        var next = cloneConditionGroups(groups);
        next.splice(gi, 1);
        onChange(normalizeConditionGroups(next));
      });
    });

    document.querySelectorAll('.cond-ind-add[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var container = btn.closest('.cond-group');
        var numInput = container.querySelector('.cond-ind-num');
        var notInput = container.querySelector('.cond-ind-not');
        var num = (numInput.value || '').trim();
        if (!/^\d{1,2}$/.test(num)) return;
        var padded = num.length < 2 ? '0' + num : num;
        var groupAttr = btn.getAttribute('data-group');
        var next = cloneConditionGroups(groups);
        if (groupAttr === 'pending') {
          // First indicator typed into the pending OR group - this is the
          // moment it actually becomes a real group and gets written back.
          next.push({ relation: 'OR', displaySizeCondition: null, indicators: [{ number: padded, not: !!(notInput && notInput.checked) }] });
          if (pendingGroupSet) pendingGroupSet.delete(pendingKey);
        } else {
          var gi = parseInt(groupAttr, 10);
          if (next[gi].indicators.length >= 9) return;
          next[gi].indicators.push({ number: padded, not: !!(notInput && notInput.checked) });
        }
        onChange(normalizeConditionGroups(next));
      });
    });

    var addGroupBtn = document.querySelector('.cond-add-group[data-prefix="' + idPrefix + '"]');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', function () {
        if (pendingGroupSet && rerender) {
          pendingGroupSet.add(pendingKey);
          rerender();
          return;
        }
        // Fallback for callers not yet passing pendingGroupSet/rerender.
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
        html += '<div class="kw-cond-body">' + conditionsEditorHtml(conditions, ownerKey + '-kw' + idx, expandedSet) + '</div>';
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
        }, expandedSet, rerender);
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
  // DspfWriter.availableCommandKeyNumbers) is computed by the caller from
  // that ONE scope's own keyword list only - a record is allowed to (re)use
  // a number already defined at the file level, as a per-record override,
  // so file-level usage never blocks the record-level picker or vice versa.
  // This editor only renders/wires whichever single scope's keyword list
  // it was given.
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

  // Real DDS lets a DSPATR keyword's parameter be EITHER one or more of the
  // literal attribute codes above OR the name of a "program-to-system"
  // (hidden, USAGE(P)) field whose runtime value drives the attribute - real
  // SDA's own "Select Display Attributes" screen (docs/sda-reference/
  // screens/field-level/character/display-attributes) shows this as its own
  // "Program-to-system field" entry, separate from and above the HI/RI/...
  // checkboxes. DspfWriter.getColorAttr/getColorAttrStates don't distinguish
  // the two - `attrs` just comes back as whatever whitespace-separated
  // tokens DSPATR's parameters held - so splitAttrsAndPgmField() below picks
  // out any token that ISN'T one of the known codes and treats it as that
  // hidden field's name. Without this split, a hidden-field DSPATR silently
  // vanished from the panel (no checkbox matched it, so it never rendered)
  // and then got DROPPED the next time anything in the panel committed
  // (commit() only ever read the known checkboxes back out) - this restores
  // both.
  function splitAttrsAndPgmField(attrs) {
    var known = [];
    var pgmField = '';
    (attrs || []).forEach(function (a) {
      if (DSPATR_ATTRS.indexOf(a) >= 0) known.push(a);
      else if (a && !pgmField) pgmField = a; // at most one P-field name per real DDS
    });
    return { attrs: known, pgmField: pgmField };
  }

  function pgmFieldRowHtml(idPrefix, value) {
    return '<div class="field-row"><label>Program-to-system field</label>' +
      '<input type="text" id="' + idPrefix + '-pgmfield" value="' + escapeHtml(value || '') + '" placeholder="Hidden field name" /></div>';
  }

  function readPgmField(idPrefix) {
    var el = document.getElementById(idPrefix + '-pgmfield');
    return el ? el.value.trim().toUpperCase() : '';
  }

  function colorAttrEditorHtml(keywords, ownerKey) {
    var state = DspfWriter.getColorAttr(keywords);
    var split = splitAttrsAndPgmField(state.attrs);
    var html = '<div class="section-label">Color &amp; attributes</div>';
    html += '<div class="field-row"><label>Color</label><select id="' + ownerKey + '-color">' +
      COLOR_VALUES.map(function (c) {
        return '<option value="' + c + '"' + (state.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>';
      }).join('') + '</select></div>';
    html += pgmFieldRowHtml(ownerKey, split.pgmField);
    html += '<div class="attr-checks">';
    DSPATR_ATTRS.forEach(function (a) {
      var checked = split.attrs.indexOf(a) >= 0;
      html += '<label class="attr-check"><input type="checkbox" class="' + ownerKey + '-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
    });
    html += '</div>';
    return html;
  }

  function wireColorAttrEditor(keywords, onChange, ownerKey) {
    function commit() {
      var colorSel = document.getElementById(ownerKey + '-color');
      var color = colorSel ? colorSel.value : '';
      var pgmField = readPgmField(ownerKey);
      var attrs = Array.prototype.slice
        .call(document.querySelectorAll('.' + ownerKey + '-attr:checked'))
        .map(function (el) { return el.value; });
      if (pgmField) attrs = [pgmField].concat(attrs);
      onChange(DspfWriter.setColorAttr(keywords, color, attrs));
    }
    var colorSel = document.getElementById(ownerKey + '-color');
    if (colorSel) colorSel.addEventListener('change', commit);
    var pgmFieldEl = document.getElementById(ownerKey + '-pgmfield');
    if (pgmFieldEl) pgmFieldEl.addEventListener('change', commit);
    document.querySelectorAll('.' + ownerKey + '-attr').forEach(function (el) {
      el.addEventListener('change', commit);
    });
  }

  // -----------------------------------------------------------------------
  // Task L1a - multi-instance Color & attributes editor, built on Task L1's
  // repeatableConditionedInstancesHtml/wireRepeatableConditionedInstances
  // and DspfWriter.getColorAttrStates/setColorAttrStates. Renders each
  // independently-conditioned color/attribute state as its own card (color
  // select + DSPATR checkboxes as the payload, a Conditioning accordion
  // per card via the L1 shell) instead of colorAttrEditorHtml/
  // wireColorAttrEditor's single always-unconditioned pair above. Callers
  // choose between the two - this one for a full multi-state picker (see
  // its call site in the field/constant props panel), the single-pair one
  // above stays available for anywhere a simpler always-unconditioned
  // COLOR/DSPATR editor is still wanted.
  // -----------------------------------------------------------------------

  function colorAttrStatesHtml(keywords, ownerKey, expandedSet) {
    var states = DspfWriter.getColorAttrStates(keywords);
    var html = '<div class="section-label">Color &amp; attributes</div>';
    html += repeatableConditionedInstancesHtml(states, ownerKey + '-colorattr', function (inst, instIdPrefix) {
      var split = splitAttrsAndPgmField(inst.attrs);
      var payload = '<div class="field-row"><label>Color</label><select id="' + instIdPrefix + '-color">' +
        COLOR_VALUES.map(function (c) {
          return '<option value="' + c + '"' + (inst.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>';
        }).join('') + '</select></div>';
      payload += pgmFieldRowHtml(instIdPrefix, split.pgmField);
      payload += '<div class="attr-checks">';
      DSPATR_ATTRS.forEach(function (a) {
        var checked = split.attrs.indexOf(a) >= 0;
        payload += '<label class="attr-check"><input type="checkbox" class="' + instIdPrefix + '-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
      });
      payload += '</div>';
      return payload;
    }, expandedSet, '+ Add color/attribute state', function renderStaging(stagingIdPrefix) {
      // A permanently-visible "new state" row (same pattern
      // commandKeysSectionHtml uses for CAxx/CFxx) - "+ Add" reads THESE
      // inputs rather than appending a blank card, since a state with no
      // color and no attributes checked would write nothing and simply
      // vanish on the very next re-render (see readColorAttrStaging below).
      var staging = '<div class="field-row"><label>Color</label><select id="' + stagingIdPrefix + '-color">' +
        COLOR_VALUES.map(function (c) { return '<option value="' + c + '">' + (c || '(none)') + '</option>'; }).join('') + '</select></div>';
      staging += pgmFieldRowHtml(stagingIdPrefix, '');
      staging += '<div class="attr-checks">';
      DSPATR_ATTRS.forEach(function (a) {
        staging += '<label class="attr-check"><input type="checkbox" class="' + stagingIdPrefix + '-attr" value="' + a + '"/>' + a + '</label>';
      });
      staging += '</div>';
      return staging;
    });
    return html;
  }

  function wireColorAttrStatesEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var states = DspfWriter.getColorAttrStates(keywords);
    wireRepeatableConditionedInstances(ownerKey + '-colorattr', states, function (newStates) {
      onChange(DspfWriter.setColorAttrStates(keywords, newStates));
    }, function (instIdPrefix, inst, updatePayload) {
      var colorSel = document.getElementById(instIdPrefix + '-color');
      function commit() {
        var color = colorSel ? colorSel.value : '';
        var pgmField = readPgmField(instIdPrefix);
        var attrs = Array.prototype.slice
          .call(document.querySelectorAll('.' + instIdPrefix + '-attr:checked'))
          .map(function (el) { return el.value; });
        if (pgmField) attrs = [pgmField].concat(attrs);
        updatePayload({ color: color, attrs: attrs });
      }
      if (colorSel) colorSel.addEventListener('change', commit);
      var pgmFieldEl = document.getElementById(instIdPrefix + '-pgmfield');
      if (pgmFieldEl) pgmFieldEl.addEventListener('change', commit);
      document.querySelectorAll('.' + instIdPrefix + '-attr').forEach(function (el) {
        el.addEventListener('change', commit);
      });
    }, expandedSet, rerender, function readNewInstance(stagingIdPrefix) {
      var colorSel = document.getElementById(stagingIdPrefix + '-color');
      var color = colorSel ? colorSel.value : '';
      var pgmField = readPgmField(stagingIdPrefix);
      var attrs = Array.prototype.slice
        .call(document.querySelectorAll('.' + stagingIdPrefix + '-attr:checked'))
        .map(function (el) { return el.value; });
      if (pgmField) attrs = [pgmField].concat(attrs);
      if (!color && attrs.length === 0) return null; // nothing to add
      return { conditions: [], color: color, attrs: attrs };
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

  // -----------------------------------------------------------------------
  // Task L5 (piece 1) - RANGE/COMP/VALUES as Task L1's repeatable,
  // independently-conditioned instances - see
  // DspfWriter.getValidityCheckInstances/setValidityCheckInstances's own
  // doc comment for why no positional pairing is needed here (RANGE/COMP/
  // VALUES are mutually exclusive alternative keyword names, not two
  // keywords combined into one state the way COLOR+DSPATR are in L1a).
  // Modeled on errorMessageInstanceRowHtml/errorMessageInstancesHtml/
  // wireErrorMessageInstances (Task L1b) - a per-row "kind" selector that
  // reshapes the row's own fields, same idea as ERRMSG-vs-ERRMSGID there.
  // -----------------------------------------------------------------------

  function validityCheckInstanceRowHtml(inst, p) {
    var kind = inst.kind || 'RANGE';
    var placeholder = kind === 'RANGE' ? 'e.g. 1 99' : kind === 'COMP' ? 'e.g. GT 0' : "e.g. 'A' 'B' 'C'";
    var html = '<div class="two-col" style="margin-bottom:4px;">';
    html += '<select class="' + p + '-kind">' +
      ['RANGE', 'COMP', 'VALUES'].map(function (k) {
        return '<option value="' + k + '"' + (kind === k ? ' selected' : '') + '>' + k + '</option>';
      }).join('') +
      '</select>';
    html += '<input type="text" class="' + p + '-params" placeholder="' + placeholder + '" value="' + escapeHtml(inst.parameters || '') + '" />';
    html += '</div>';
    return html;
  }

  /** Validity check (RANGE/COMP/VALUES) panel (Task L5). */
  function validityCheckInstancesHtml(keywords, ownerKey, expandedSet) {
    var instances = DspfWriter.getValidityCheckInstances(keywords);
    return repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-rep',
      function renderPayload(inst, instIdPrefix) { return validityCheckInstanceRowHtml(inst, instIdPrefix); },
      expandedSet,
      '+ Add validity check'
    );
  }

  function wireValidityCheckInstances(keywords, onChange, ownerKey, expandedSet, rerender) {
    var instances = DspfWriter.getValidityCheckInstances(keywords);
    wireRepeatableConditionedInstances(
      ownerKey + '-rep',
      instances,
      function (next) { onChange(DspfWriter.setValidityCheckInstances(keywords, next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var kindEl = document.querySelector('.' + instIdPrefix + '-kind');
        if (kindEl) kindEl.addEventListener('change', function () { updatePayload({ kind: kindEl.value }); });
        var paramsEl = document.querySelector('.' + instIdPrefix + '-params');
        if (paramsEl) paramsEl.addEventListener('change', function () { updatePayload({ parameters: paramsEl.value }); });
      },
      expandedSet,
      rerender,
      function makeDefaultInstance() {
        // Non-blank placeholder parameters, not '' - this component
        // commits on every change immediately (no batch Apply, unlike
        // EDTCDE/EDTWRD/EDTMSK just below in this same panel), so a
        // genuinely blank RANGE() would be invalid DDS and the
        // freshly-added row would vanish again on the very next
        // re-render, before the user gets to type real bounds in - same
        // reasoning as L1b's own makeDefaultInstance for ERRMSG.
        return { kind: 'RANGE', conditions: [], parameters: '1 99' };
      }
    );
  }

  // -----------------------------------------------------------------------
  // Task L5d (piece i) - the base record's own "Define Indicator Keywords"
  // screen (CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN/VLDCMDKEY/SETOF/CHANGE/
  // INDTXT) as Task L1's repeatable, independently-conditioned instances -
  // see DspfWriter.getRecordIndicatorInstances/setRecordIndicatorInstances'
  // own doc comment in dspfWriter.js for why this differs from Task R3's
  // simpler indicatorTextRowsHtml (INDTXT/SETOF/CHANGE only, used by
  // SFL/SFLMSG/PDNSFLCTL's own narrower version of this same real screen).
  // Follows validityCheckInstanceRowHtml's own per-row "kind" selector
  // pattern immediately above.
  // -----------------------------------------------------------------------

  var RECORD_INDICATOR_INSTANCE_KEYWORDS = [
    ['CLEAR', 'Clear'],
    ['HOME', 'Home'],
    ['PAGEDOWN', 'Page down / Roll up'],
    ['PAGEUP', 'Page up / Roll down'],
    ['HELP', 'Help'],
    ['HLPRTN', 'Help return'],
    ['VLDCMDKEY', 'Validity command key'],
    ['SETOF', 'Set off'],
    ['CHANGE', 'Change'],
    ['INDTXT', 'Indicator text'],
  ];

  function recordIndicatorInstanceRowHtml(inst, p) {
    var kind = inst.kind || 'CLEAR';
    var html = '<div class="two-col" style="margin-bottom:4px;">';
    html += '<select class="' + p + '-kind">' +
      RECORD_INDICATOR_INSTANCE_KEYWORDS.map(function (pair) {
        return '<option value="' + pair[0] + '"' + (kind === pair[0] ? ' selected' : '') + '>' + pair[1] + ' (' + pair[0] + ')</option>';
      }).join('') +
      '</select>';
    html += '<input type="text" class="' + p + '-resp" placeholder="response indicator (10-99, or 01-99)" value="' + escapeHtml(inst.resp || '') + '" />';
    html += '</div>';
    if (kind === 'INDTXT') {
      html += '<input type="text" class="' + p + '-text" placeholder="text" value="' + escapeHtml(inst.text || '') + '" style="width:100%;" />';
    }
    return html;
  }

  /** Record-level Indicator/screen-control keywords panel (Task L5d). */
  function recordIndicatorInstancesHtml(keywords, ownerKey, expandedSet) {
    var instances = DspfWriter.getRecordIndicatorInstances(keywords);
    return repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-rep',
      function renderPayload(inst, instIdPrefix) { return recordIndicatorInstanceRowHtml(inst, instIdPrefix); },
      expandedSet,
      '+ Add indicator keyword'
    );
  }

  function wireRecordIndicatorInstances(keywords, onChange, ownerKey, expandedSet, rerender) {
    var instances = DspfWriter.getRecordIndicatorInstances(keywords);
    wireRepeatableConditionedInstances(
      ownerKey + '-rep',
      instances,
      function (next) { onChange(DspfWriter.setRecordIndicatorInstances(keywords, next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var kindEl = document.querySelector('.' + instIdPrefix + '-kind');
        if (kindEl) kindEl.addEventListener('change', function () { updatePayload({ kind: kindEl.value }); });
        var respEl = document.querySelector('.' + instIdPrefix + '-resp');
        if (respEl) respEl.addEventListener('change', function () { updatePayload({ resp: respEl.value }); });
        var textEl = document.querySelector('.' + instIdPrefix + '-text');
        if (textEl) textEl.addEventListener('change', function () { updatePayload({ text: textEl.value }); });
      },
      expandedSet,
      rerender,
      function makeDefaultInstance() {
        // Non-blank placeholder resp, not '' - same reasoning as every
        // other L1-based makeDefaultInstance in this file (e.g.
        // wireValidityCheckInstances above): this component commits on
        // every change immediately, so a genuinely blank CLEAR() would
        // be invalid DDS and the freshly-added row would vanish again on
        // the very next re-render, before the user gets to type a real
        // response indicator in.
        return { kind: 'CLEAR', conditions: [], resp: '10', text: '' };
      }
    );
  }

  function validityAndEditHtml(keywords, ownerKey, options, expandedSet) {
    var includeValidity = !options || options.includeValidity !== false;
    var includeEditKeyword = !options || options.includeEditKeyword !== false;
    var ec = DspfWriter.getEditKeyword(keywords);

    var html = '';
    if (includeValidity) {
      html += '<div class="section-label">Validity check</div>';
      html += '<div class="hint-small">RANGE low high &middot; COMP op value &middot; VALUES v1 v2 ...</div>';
      html += '<div style="margin-top:4px;">' + validityCheckInstancesHtml(keywords, ownerKey + '-vc', expandedSet) + '</div>';

      // Task L1d - CHECK's AB/VN/VNE/M10/M11 codes, as L1's repeatable
      // instances (see checkInstancesHtml/wireCheckInstancesEditor's own
      // doc comment for why this is shared with the Keying options
      // panel). Commits IMMEDIATELY per checkbox/field, same as Task L5's
      // RANGE/COMP/VALUES instances just above now do too - both live on
      // the L1 repeatable-instance component, which has no batching
      // mechanism of its own (unlike EDTCDE/EDTWRD/EDTMSK below, still
      // single-instance and still behind the "Apply" button).
      html += '<div style="margin-top:6px;">' + checkInstancesHtml(keywords, ownerKey + '-validity', expandedSet, VALIDITY_CHECK_CODES, '+ Add CHECK instance') + '</div>';

      // CHKMSGID - overrides the system-supplied error message a validity
      // check issues. Real SDA's own "Define Validity Check Keywords"
      // screen reaches this on a SECOND page (its "More..." key), but it's
      // the same field-level keyword picker as RANGE/COMP/VALUES/CHECK
      // just above, not a separate panel - see DspfWriter.getCheckMsgId's
      // own doc comment for the DDS format. Single-instance, own "Apply"
      // button (a genuinely different keyword than EDTCDE/EDTWRD/EDTMSK's
      // own Apply below, so bundling the two commits would be misleading).
      var cm = DspfWriter.getCheckMsgId(keywords);
      html += '<div class="section-label" style="margin-top:10px;">Check message identifier</div>';
      html += '<div class="two-col">' +
        '<input type="text" id="' + ownerKey + '-cm-msgid" placeholder="Message identifier" value="' + escapeHtml(cm.msgId) + '" />' +
        '<input type="text" id="' + ownerKey + '-cm-msgfile" placeholder="Message file" value="' + escapeHtml(cm.msgFile) + '" />' +
        '</div><div class="two-col" style="margin-top:4px;">' +
        '<input type="text" id="' + ownerKey + '-cm-library" placeholder="Library (optional, *LIBL if blank)" value="' + escapeHtml(cm.library) + '" />' +
        '<input type="text" id="' + ownerKey + '-cm-msgdata" placeholder="Message data field (optional)" value="' + escapeHtml(cm.msgDataField) + '" />' +
        '</div><div class="hint-small">Overrides the system-supplied validity-check error message - both message identifier and message file are required, or CHKMSGID is removed.</div>' +
        '<button class="secondary ' + ownerKey + '-cm-apply" style="width:100%;margin-top:8px;">Apply CHKMSGID</button>';
    }

    if (includeEditKeyword) {
      html += '<div class="section-label"' + (includeValidity ? ' style="margin-top:10px;"' : '') + '>Edit code / word / mask</div>';
      html += '<div class="two-col">' +
        '<select id="' + ownerKey + '-ec-kind">' +
        ['', 'EDTCDE', 'EDTWRD', 'EDTMSK'].map(function (k) {
          return '<option value="' + k + '"' + (ec.kind === k ? ' selected' : '') + '>' + (k || '(none)') + '</option>';
        }).join('') +
        '</select>' +
        '<input type="text" id="' + ownerKey + '-ec-params" placeholder="e.g. J" value="' + escapeHtml(ec.parameters) + '" />' +
        '</div><div class="hint-small">EDTCDE: a single code letter (1-4, A-D, J-O, W, X, Y, Z) &middot; EDTWRD: full quoted substitution string &middot; EDTMSK: full quoted mask string, e.g. \'(999) 999-9999\'</div>' +
        '<button class="secondary ' + ownerKey + '-vc-apply" style="width:100%;margin-top:8px;">Apply edit code/word/mask</button>';
    }
    return html;
  }

  function wireValidityAndEdit(keywords, onChange, ownerKey, options, expandedSet, rerender) {
    var includeValidity = !options || options.includeValidity !== false;
    var includeEditKeyword = !options || options.includeEditKeyword !== false;
    if (includeValidity) {
      wireValidityCheckInstances(keywords, onChange, ownerKey + '-vc', expandedSet, rerender);
      wireCheckInstancesEditor(keywords, onChange, ownerKey + '-validity', expandedSet, rerender, VALIDITY_CHECK_CODES);
      var cmApplyBtn = document.querySelector('.' + ownerKey + '-cm-apply');
      if (cmApplyBtn) {
        cmApplyBtn.addEventListener('click', function () {
          var msgId = document.getElementById(ownerKey + '-cm-msgid').value;
          var msgFile = document.getElementById(ownerKey + '-cm-msgfile').value;
          var library = document.getElementById(ownerKey + '-cm-library').value;
          var msgDataField = document.getElementById(ownerKey + '-cm-msgdata').value;
          onChange(DspfWriter.setCheckMsgId(keywords, msgId, library, msgFile, msgDataField));
        });
      }
    }
    if (!includeEditKeyword) return;
    var applyBtn = document.querySelector('.' + ownerKey + '-vc-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      // RANGE/COMP/VALUES no longer go through this Apply button (Task
      // L5 - they commit immediately via the repeatable-instance
      // component now, same as the CHECK codes just above already did),
      // so only the edit code/word/mask fields remain here.
      var ecKind = document.getElementById(ownerKey + '-ec-kind').value;
      var ecParams = document.getElementById(ownerKey + '-ec-params').value;
      onChange(DspfWriter.setEditKeyword(keywords, ecKind, ecParams));
    });
  }

  // -----------------------------------------------------------------------
  // Task L1b - ERRMSG/ERRMSGID wired onto the Task L1 generic repeatable-
  // conditioned-instance component (repeatableConditionedInstancesHtml/
  // wireRepeatableConditionedInstances further below). Real SDA's own
  // "Define Error Messages" screen (docs/sda-reference/screens/field-level/
  // character/error-messages/image171.png, identical for numeric fields)
  // shows two repeatable lists on ONE screen - up to 4 ERRMSG rows (message
  // text + a response indicator) and up to 4 ERRMSGID rows (msgid/file/
  // library/response indicator/&name) - each row independently conditioned
  // by up to 3 ANDed option indicators. This editor merges both lists into
  // ONE repeatable list with a per-row "kind" selector instead of two fixed
  // 4-row tables, since DspfWriter.getErrorMessageInstances/
  // setErrorMessageInstances already treats ERRMSG/ERRMSGID as one ordered
  // list and real DDS doesn't cap the count at 4 (SDA's own screen does,
  // being a fixed-size 3270-style form) - see that pair's own doc comment
  // in dspfWriter.js for the exact keyword shapes.
  // -----------------------------------------------------------------------

  function errorMessageInstanceRowHtml(inst, p) {
    var kind = inst.kind === 'ERRMSGID' ? 'ERRMSGID' : 'ERRMSG';
    var html = '<div class="two-col" style="margin-bottom:4px;">';
    html += '<select class="' + p + '-kind">' +
      '<option value="ERRMSG"' + (kind === 'ERRMSG' ? ' selected' : '') + '>ERRMSG (literal text)</option>' +
      '<option value="ERRMSGID"' + (kind === 'ERRMSGID' ? ' selected' : '') + '>ERRMSGID (by message ID)</option>' +
      '</select>';
    html += '<input type="text" class="' + p + '-respind" placeholder="Response ind. (opt.)" value="' + escapeHtml(inst.responseIndicator || '') + '" />';
    html += '</div>';
    if (kind === 'ERRMSG') {
      html += '<input type="text" class="' + p + '-text" placeholder="Message text" style="width:100%;" value="' + escapeHtml(inst.text || '') + '" />';
    } else {
      html += '<div class="two-col">' +
        '<input type="text" class="' + p + '-msgid" placeholder="Message ID" value="' + escapeHtml(inst.msgId || '') + '" />' +
        '<input type="text" class="' + p + '-msgfile" placeholder="Message file" value="' + escapeHtml(inst.msgFile || '') + '" />' +
        '</div>' +
        '<div class="two-col" style="margin-top:4px;">' +
        '<input type="text" class="' + p + '-library" placeholder="Library (opt.)" value="' + escapeHtml(inst.library || '') + '" />' +
        '<input type="text" class="' + p + '-msgdata" placeholder="&amp;field for replacement text (opt.)" value="' + escapeHtml(inst.msgDataField || '') + '" />' +
        '</div>';
    }
    return html;
  }

  /** Error Messages panel (Task L1b) - see doc comment above. */
  function errorMessageInstancesHtml(keywords, ownerKey, expandedSet) {
    var instances = DspfWriter.getErrorMessageInstances(keywords);
    return repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-errmsg',
      function renderPayload(inst, instIdPrefix) { return errorMessageInstanceRowHtml(inst, instIdPrefix); },
      expandedSet,
      '+ Add error message'
    );
  }

  function wireErrorMessageInstances(keywords, onChange, ownerKey, expandedSet, rerender) {
    var instances = DspfWriter.getErrorMessageInstances(keywords);
    wireRepeatableConditionedInstances(
      ownerKey + '-errmsg',
      instances,
      function (next) { onChange(DspfWriter.setErrorMessageInstances(keywords, next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var kindEl = document.querySelector('.' + instIdPrefix + '-kind');
        if (kindEl) {
          kindEl.addEventListener('change', function () {
            // Same non-blank-placeholder reasoning as makeDefaultInstance
            // above - switching TO ERRMSGID without also seeding its two
            // required fields (msgId/msgFile) would make this instance
            // round-trip to nothing and the row would vanish on the very
            // next re-render, before the user can fill them in.
            if (kindEl.value === 'ERRMSGID') {
              updatePayload({ kind: 'ERRMSGID', msgId: inst.msgId || 'MSGID', msgFile: inst.msgFile || 'MSGFILE' });
            } else {
              updatePayload({ kind: 'ERRMSG', text: inst.text || 'New message' });
            }
          });
        }
        var respIndEl = document.querySelector('.' + instIdPrefix + '-respind');
        if (respIndEl) respIndEl.addEventListener('change', function () { updatePayload({ responseIndicator: respIndEl.value }); });
        var textEl = document.querySelector('.' + instIdPrefix + '-text');
        if (textEl) textEl.addEventListener('change', function () { updatePayload({ text: textEl.value }); });
        var msgIdEl = document.querySelector('.' + instIdPrefix + '-msgid');
        if (msgIdEl) msgIdEl.addEventListener('change', function () { updatePayload({ msgId: msgIdEl.value }); });
        var msgFileEl = document.querySelector('.' + instIdPrefix + '-msgfile');
        if (msgFileEl) msgFileEl.addEventListener('change', function () { updatePayload({ msgFile: msgFileEl.value }); });
        var libraryEl = document.querySelector('.' + instIdPrefix + '-library');
        if (libraryEl) libraryEl.addEventListener('change', function () { updatePayload({ library: libraryEl.value }); });
        var msgDataEl = document.querySelector('.' + instIdPrefix + '-msgdata');
        if (msgDataEl) msgDataEl.addEventListener('change', function () { updatePayload({ msgDataField: msgDataEl.value }); });
      },
      expandedSet,
      rerender,
      function makeDefaultInstance() {
        // Non-blank placeholder text, not '' - this component commits on
        // EVERY change immediately (no batch Apply button, unlike e.g. the
        // MNUBARCHC list editor), so a genuinely blank ERRMSG would be
        // dropped by setErrorMessageInstances (matching real SDA: a blank
        // row on its own screen never emits a keyword either) and the
        // freshly-added row would vanish again on the very next re-render,
        // before the user gets a chance to type into it.
        return { kind: 'ERRMSG', conditions: [], text: 'New message', responseIndicator: '', msgId: '', library: '', msgFile: '', msgDataField: '' };
      }
    );
  }

  /** Task L5 - "Define Message ID" (MSGID) as Task L1's repeatable,
   *  independently-conditioned instances - see
   *  DspfWriter.getMessageIdInstances/setMessageIdInstances's own doc
   *  comment for why the argument text itself stays opaque (unchanged
   *  from the older single-instance getMessageId/setMessageId) while this
   *  adds the repeatable/independently-conditioned dimension. Uses the
   *  staging-row pattern (like colorAttrStatesHtml above) rather than
   *  L1b's non-blank-placeholder-default: MSGID's argument is raw keyword
   *  text with no single always-valid non-empty placeholder to seed (unlike
   *  ERRMSG's literal-text case, where "New message" is itself valid DDS),
   *  so a permanently-visible "new instance" text box that's only read
   *  (and only appended) when non-blank fits better here. */
  function messageIdInstancesHtml(keywords, ownerKey, expandedSet) {
    var instances = DspfWriter.getMessageIdInstances(keywords);
    var html = '<div class="section-label">Message ID (MSGID)</div>';
    html += repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-msgid',
      function renderPayload(inst, instIdPrefix) {
        var payload = '<input type="text" class="' + instIdPrefix + '-text" placeholder="e.g. USR &amp;FLDNAME MSGF1 MYLIB, or *NONE" style="width:100%;" value="' + escapeHtml(inst.parameters || '') + '" />';
        payload += '<div class="hint-small">[msg-prefix] &amp;field-name, or [msgid-prefix] msg-id message-file [library]</div>';
        return payload;
      },
      expandedSet,
      '+ Add message ID',
      function renderStaging(stagingIdPrefix) {
        var staging = '<input type="text" class="' + stagingIdPrefix + '-text" placeholder="e.g. USR &amp;FLDNAME MSGF1 MYLIB, or *NONE" style="width:100%;" value="" />';
        staging += '<div class="hint-small">[msg-prefix] &amp;field-name, or [msgid-prefix] msg-id message-file [library]</div>';
        return staging;
      }
    );
    return html;
  }

  function wireMessageIdInstancesEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var instances = DspfWriter.getMessageIdInstances(keywords);
    wireRepeatableConditionedInstances(
      ownerKey + '-msgid',
      instances,
      function (next) { onChange(DspfWriter.setMessageIdInstances(keywords, next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var textEl = document.querySelector('.' + instIdPrefix + '-text');
        if (textEl) textEl.addEventListener('change', function () { updatePayload({ parameters: textEl.value }); });
      },
      expandedSet,
      rerender,
      function readNewInstance(stagingIdPrefix) {
        var textEl = document.querySelector('.' + stagingIdPrefix + '-text');
        var parameters = textEl ? textEl.value.trim() : '';
        if (!parameters) return null; // nothing to add
        return { conditions: [], parameters: parameters };
      }
    );
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
        errorMessages: true,
        inputKeywords: true,
        generalKeywords: true,
        databaseReference: true,
        messageId: true,
        editingKeywords: true,
      };
    }
    var isIOB = u === 'I' || u === 'B'; // Input or Both
    return {
      colorAndAttributes: u !== 'H',
      keyingOptions: u === 'H' || isIOB,
      validityAndErrorMessage: isIOB && dataType !== 'F',
      // Task L1b - ERRMSG/ERRMSGID have their OWN, broader visibility rule
      // than the Validity check keywords just above: IBM's own DDS
      // reference states they're valid for output-only, input-only, or
      // output/input fields (not hidden, constant, program-to-system, or
      // message fields) - Output-only is explicitly included, unlike
      // validityAndErrorMessage's isIOB (Input or Both) gate, since a
      // RANGE/COMP/VALUES/CHECK validity check is inherently input-only
      // but an error message can still be shown for an output field.
      errorMessages: u === 'I' || u === 'O' || u === 'B',
      inputKeywords: isIOB,
      generalKeywords: true,
      databaseReference: true, // H/I/O/B are exactly SDA's own "Hidden, Input, Output, Both" list
      messageId: u === 'O' || u === 'B',
      // Task D3 - real SDA's numeric "For Field Type" column lists Editing
      // keywords (EDTCDE/EDTWRD/EDTMSK) as "Numeric Output or Both" - a
      // narrower, separate gate from validityAndErrorMessage's "Input or
      // Both, not float" (they cover different usages entirely: edit
      // keywords format OUTPUT values, validity checks constrain INPUT).
      // Only meaningful for numeric fields in practice, but the gate itself
      // doesn't need dataType - the caller only renders this section for
      // non-constant fields, and non-numeric fields simply won't carry
      // EDTCDE/EDTWRD/EDTMSK even if the section is technically reachable.
      editingKeywords: u === 'O' || u === 'B',
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

  // -----------------------------------------------------------------------
  // Task L1d - CHECK(...) as L1's repeatable, independently-conditioned
  // instances. CHECK's codes are split across TWO UI panels - Keying
  // options (KEYING_OPTION_CODES above) and Validity check
  // (VALIDITY_CHECK_CODES further below) - both reading and writing the
  // SAME underlying keyword. Converting only one panel to multi-instance
  // while leaving the other on the old single-merged-instance model would
  // be a real data-loss bug: the untouched panel's setX would collapse
  // every instance back into one on its very next edit (the exact same
  // class of trap Task L1a's own staging-row fix and L1b's placeholder
  // fix both address, just at the keyword level here instead of the
  // "freshly-added row" level).
  //
  // So both panels share ONE rendering/wiring pair
  // (checkInstancesHtml/wireCheckInstancesEditor), parameterized by which
  // code subset that particular panel owns (`codeSpecs`). Each only ever
  // reads/writes ITS OWN codes within an instance, always re-reading
  // (never caching) the OTHER panel's codes at commit time from a fresh
  // getRepeatableKeywordInstances() snapshot - so neither panel can ever
  // clobber the other's codes on the same instance, even though each
  // panel still renders its OWN independent Conditioning UI over the same
  // instance list (different ownerKey -> different idPrefix/expandedSet
  // keys per panel). That's a minor, harmless UI duplication - the same
  // instance's conditions are editable from either panel and always
  // in sync, since both read fresh state on every render - not a
  // data-integrity risk.
  // -----------------------------------------------------------------------
  function checkInstancesHtml(keywords, ownerKey, expandedSet, codeSpecs, addLabel) {
    var instances = DspfWriter.getRepeatableKeywordInstances(keywords, ['CHECK']);
    return repeatableConditionedInstancesHtml(instances, ownerKey + '-check-rep', function (inst, instIdPrefix) {
      var codes = DspfWriter.parseCheckCodes(inst.parameters);
      var html = '<div class="attr-checks">';
      codeSpecs.forEach(function (c) {
        var isImmed = !!c.immedCode && codes.indexOf(c.immedCode) >= 0;
        var checked = codes.indexOf(c.code) >= 0 || isImmed;
        html += '<label class="attr-check" title="' + escapeHtml(c.label) + '"><input type="checkbox" class="' + instIdPrefix + '-code" data-code="' + c.code + '" ' + (checked ? 'checked' : '') + '/>' + c.code + '</label>';
        if (c.immedCode) {
          html += '<label class="attr-check" title="Immediate (check each keystroke rather than at Enter)"><input type="checkbox" class="' + instIdPrefix + '-code-immed" data-for="' + c.code + '" data-immed-code="' + c.immedCode + '" ' + (isImmed ? 'checked' : '') + '/>Immed</label>';
        }
      });
      html += '</div>';
      return html;
    }, expandedSet, addLabel || '+ Add CHECK instance');
  }

  function wireCheckInstancesEditor(keywords, onChange, ownerKey, expandedSet, rerender, codeSpecs) {
    var idPrefix = ownerKey + '-check-rep';
    var instances = DspfWriter.getRepeatableKeywordInstances(keywords, ['CHECK']);
    var ownedCodes = [];
    codeSpecs.forEach(function (c) { ownedCodes.push(c.code); if (c.immedCode) ownedCodes.push(c.immedCode); });

    wireRepeatableConditionedInstances(idPrefix, instances, function (nextInstances) {
      onChange(DspfWriter.setRepeatableKeywordInstances(keywords, ['CHECK'], nextInstances));
    }, function (instIdPrefix, inst, updatePayload) {
      var codeInputs = document.querySelectorAll('.' + instIdPrefix + '-code');
      var immedInputs = document.querySelectorAll('.' + instIdPrefix + '-code-immed');
      function commit() {
        // Re-read THIS SAME instance's current full code list fresh, so any
        // code belonging to the OTHER panel survives untouched - only ever
        // replace the codes THIS panel owns (codeSpecs).
        var currentInstances = DspfWriter.getRepeatableKeywordInstances(keywords, ['CHECK']);
        var m = /-inst(\d+)$/.exec(instIdPrefix);
        var idx = m ? parseInt(m[1], 10) : -1;
        var currentCodes = currentInstances[idx] ? DspfWriter.parseCheckCodes(currentInstances[idx].parameters) : [];
        var otherCodes = currentCodes.filter(function (c) { return ownedCodes.indexOf(c) < 0; });
        var immedFor = {};
        immedInputs.forEach(function (el) { if (el.checked) immedFor[el.getAttribute('data-for')] = el.getAttribute('data-immed-code'); });
        var chosen = [];
        codeInputs.forEach(function (el) {
          if (!el.checked) return;
          var code = el.getAttribute('data-code');
          chosen.push(immedFor[code] || code);
        });
        updatePayload({ parameters: DspfWriter.formatCheckCodes(otherCodes.concat(chosen)) });
      }
      codeInputs.forEach(function (el) { el.addEventListener('change', commit); });
      immedInputs.forEach(function (el) { el.addEventListener('change', commit); });
    }, expandedSet, rerender, function makeDefaultCheckInstance() {
      // Non-blank placeholder (this panel's own FIRST code, checked by
      // default) rather than '' - same reasoning as every other L1-based
      // picker's makeDefaultInstance: setRepeatableKeywordInstances writes
      // every instance unconditionally, so a blank CHECK() the instant
      // "+ Add" is clicked would be invalid DDS (CHECK requires at least
      // one code). Unlike SFLMSG/SFLMSGID (Task L1c) there's no single
      // "obvious" default shared between the two owning panels, so each
      // seeds with its OWN first code - Keying options defaults to ME,
      // Validity check defaults to AB.
      return { name: 'CHECK', parameters: codeSpecs[0].code, conditions: [] };
    });
  }

  /** "Select Keying Options" - CHECK's ME/ER/MF/FE/RB/RZ/RL/LC codes, sharing
   *  the same underlying CHECK(...) keyword as the Validity check panel's
   *  AB/VN/VNE/M10/M11 checkboxes (see checkInstancesHtml/
   *  wireCheckInstancesEditor above for how the two panels safely share
   *  it) - each panel only touches ITS OWN slice of the code list per
   *  instance, merging with whatever the other panel already set there. */
  function keyingOptionsHtml(keywords, ownerKey, expandedSet) {
    var html = '<div class="section-label">Keying options</div>';
    html += checkInstancesHtml(keywords, ownerKey + '-keying', expandedSet, KEYING_OPTION_CODES, '+ Add CHECK instance');
    // Task D3 - Keyboard shift attribute (KEYBRD), numeric-only real DDS
    // keyword shown on the same "Select Keying Options" screen. Values are
    // exactly the single letters real SDA's screen shows (S/N/Y/I/D) -
    // modeled as a plain present/absent + one-letter-parameter keyword via
    // DspfWriter.getFileFlagKeyword/setFileFlagKeyword (generic over any
    // keywords array), same as several of Task R1's record-level keywords -
    // no dedicated getX/setX pair needed for a single-letter parameter.
    // Deliberately NOT converted to a repeatable instance alongside CHECK
    // above (Task L1d) - real DDS could in principle vary KEYBRD by
    // indicator too, but it's a single always-on-screen attribute rather
    // than several message/condition pairs, so this is a scoping choice,
    // not an oversight; see Known limitations in the README.
    var keybrd = DspfWriter.getFileFlagKeyword(keywords, 'KEYBRD');
    html += '<div class="section-label" style="margin-top:8px;">Keyboard shift attribute (KEYBRD)</div>';
    html += '<select class="' + ownerKey + '-keybrd">' +
      ['', 'S', 'N', 'Y', 'I', 'D'].map(function (v) {
        return '<option value="' + v + '"' + (keybrd.parameters === v ? ' selected' : '') + '>' + (v || '(none)') + '</option>';
      }).join('') +
      '</select>';
    return html;
  }

  function wireKeyingOptionsEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    wireCheckInstancesEditor(keywords, onChange, ownerKey + '-keying', expandedSet, rerender, KEYING_OPTION_CODES);
    var keybrdEl = document.querySelector('.' + ownerKey + '-keybrd');
    if (keybrdEl) {
      keybrdEl.addEventListener('change', function () {
        onChange(DspfWriter.setFileFlagKeyword(keywords, 'KEYBRD', !!keybrdEl.value, keybrdEl.value));
      });
    }
  }


  /** "Select Input Keywords" - DUP/BLANKS/CHANGE/CHGINPDFT, each its own
   *  flagRowHtml() row (matching the real SDA screen, which gives DUP/
   *  BLANKS/CHANGE each their own "Resp" indicator slot directly on this
   *  panel - see screens/field-level/character/input-keywords/image167.png
   *  - rather than a repeatable instance list; real DDS only ever needs
   *  ONE occurrence of a boolean-flag keyword like these, since its own
   *  indicator expression can already AND/OR multiple indicators together
   *  without a second occurrence - unlike COLOR/DSPATR (Task L1a) or
   *  MSGID (Task L5), which carry a DIFFERENT VALUE per occurrence).
   *  Previously these had no per-keyword Conditioning UI at all (plain
   *  checkboxes, condition only reachable via the raw Keywords tab) -
   *  this gives each its own toggle, the same fix the rest of the
   *  codebase's flagRowHtml call sites just got. Uses
   *  DspfWriter.getFileFlagKeyword/setFileFlagKeyword directly (generic
   *  over any keywords array, despite the name) rather than the older
   *  getInputKeywords/setInputKeywords (kept for backward compatibility,
   *  same as every other superseded getX/setX pair from earlier L5
   *  pieces), since a plain present/absent flag needs no dedicated
   *  parsing. */
  function inputKeywordsHtml(keywords, ownerKey, expandedSet) {
    var html = '<div class="section-label">Input keywords</div>';
    [
      ['dup', 'DUP', 'Dup key duplicates the previous record\u2019s value into this field'],
      ['blanks', 'BLANKS', 'Numeric field: let the program tell blank apart from zero'],
      ['change', 'CHANGE', 'Response indicator turns on if the workstation user changed this field'],
      ['chginpdft', 'CHGINPDFT', 'Change input defaults'],
    ].forEach(function (row) {
      var id = ownerKey + '-inp-' + row[0];
      var kw = DspfWriter.getFileFlagKeyword(keywords, row[1]);
      html += flagRowHtml(id, row[1], kw.present, undefined, undefined, kw.conditions, expandedSet);
    });
    return html;
  }

  function wireInputKeywordsEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    ['dup', 'blanks', 'change', 'chginpdft'].forEach(function (k, i) {
      var name = ['DUP', 'BLANKS', 'CHANGE', 'CHGINPDFT'][i];
      var id = ownerKey + '-inp-' + k;
      wireFlagRow(
        id,
        function () { return keywords; },
        onChange,
        function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, name, present, params, undefined, conditions); },
        DspfWriter.getFileFlagKeyword(keywords, name).conditions,
        expandedSet,
        rerender
      );
    });
  }

  /** "Select General Keywords" - ALIAS/INDTXT/DFT/DFTVAL/FLDCSRPRG/HLPID
   *  (text-bearing, caller-supplied form - see the old getGeneralFieldKeywords'
   *  own doc comment for why: they vary too much in shape - e.g. ALIAS/
   *  FLDCSRPRG/HLPID take a bare name, DFT/DFTVAL/INDTXT take a quoted
   *  string - to usefully auto-quote here) + PUTRETAIN/OVRDTA/OVRATR/
   *  CHRID/IGCALTTYP/NOCCSID (booleans). Each its own flagRowHtml() row
   *  (checkbox + optional text param + own Conditioning toggle) rather
   *  than the old batch-Apply-button panel with zero per-keyword
   *  conditioning - same fix Input keywords/Database reference above just
   *  got, and the same checkbox+param-box shape the file-level keyword
   *  editor's own CHGINPDFT/ENTFLDATR rows already use for a
   *  parameter-carrying flag. Uses DspfWriter.getFileFlagKeyword/
   *  setFileFlagKeyword directly, superseding getGeneralFieldKeywords/
   *  setGeneralFieldKeywords (kept for backward compatibility). Unlike
   *  Task L5's other pieces (MSGID, Validity check), none of these
   *  keywords needed the FULL repeatable-instance treatment: DFT/DFTVAL
   *  set a field's single default value, not several different defaults
   *  switched by state, so one occurrence (now independently
   *  conditionable, same as everything else here) is what real DDS itself
   *  supports. */
  var GENERAL_FIELD_KEYWORD_ROWS = [
    ['alias', 'ALIAS', 'Alternative (long) name', true],
    ['indtxt', 'INDTXT', "e.g. 50 'Amount valid'", true],
    ['dft', 'DFT', "e.g. 'N/A' (input-only)", true],
    ['dftval', 'DFTVAL', "e.g. 'N/A' (output/both)", true],
    // Bug fix (reported: "I don't find CNTFLD in right panel for selection"):
    // CNTFLD was entirely missing from this row list, so there was no way to
    // ADD or EDIT it from the properties panel at all - it could only exist
    // on a field if it was already in the raw DDS source text, imported
    // un-editably. Confirmed against real SDA's own "Select General
    // Keywords" screen (docs/sda-reference/screens/field-level/character/
    // general/image168.png), which lists CNTFLD right here, between DFTVAL
    // and FLDCSRPRG, taking a bare (unquoted) numeric parameter - the
    // characters-per-line count. dspfEngine.js's cntfldFromKeywords already
    // READS this keyword correctly for the continued-entry wrap preview
    // (see its own Task-L17-adjacent doc comment on conditioning), but
    // reading-for-render and offering-for-edit are different concerns; a
    // stale comment on getGeneralFieldKeywords below had conflated the two,
    // treating "rendering already handles CNTFLD" as if it meant "CNTFLD
    // editing is handled elsewhere" - it wasn't handled anywhere. See real
    // SDA's own CONSTANT general-keywords screen (.../constant/general/
    // image190.png) for why this row (like the pre-existing DFTVAL/
    // FLDCSRPRG rows above/below it) is field-semantics-only in real DDS -
    // this shared row list doesn't yet gate any of the three out for
    // constants, a pre-existing scope note, not something new here.
    ['cntfld', 'CNTFLD', 'e.g. 40 (characters per line)', true],
    ['fldcsrprg', 'FLDCSRPRG', 'Cursor-progression field name', true],
    ['hlpid', 'HLPID', 'e.g. FLDHELP1 (constant help identifier)', true],
    ['putretain', 'PUTRETAIN', 'Retain field on display', false],
    ['ovrdta', 'OVRDTA', 'Override data', false],
    ['ovratr', 'OVRATR', 'Override attributes', false],
    ['chrid', 'CHRID', 'Translate characters', false],
    ['igcalttyp', 'IGCALTTYP', 'Alter IGC type', false],
    ['noccsid', 'NOCCSID', 'No coded character set id', false],
  ];

  function generalFieldKeywordsHtml(keywords, ownerKey, expandedSet) {
    var html = '<div class="section-label">General keywords</div>';
    GENERAL_FIELD_KEYWORD_ROWS.forEach(function (row) {
      var key = row[0], name = row[1], placeholder = row[2], hasParam = row[3];
      var id = ownerKey + '-gen-' + key;
      var kw = DspfWriter.getFileFlagKeyword(keywords, name);
      html += flagRowHtml(id, name, kw.present, hasParam ? kw.parameters : undefined, hasParam ? placeholder : undefined, kw.conditions, expandedSet);
    });
    return html;
  }

  function wireGeneralFieldKeywordsEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    GENERAL_FIELD_KEYWORD_ROWS.forEach(function (row) {
      var key = row[0], name = row[1];
      var id = ownerKey + '-gen-' + key;
      wireFlagRow(
        id,
        function () { return keywords; },
        onChange,
        function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, name, present, params, undefined, conditions); },
        DspfWriter.getFileFlagKeyword(keywords, name).conditions,
        expandedSet,
        rerender
      );
    });
  }

  /** "Define Database Reference" overrides - DLTCHK/DLTEDT, alongside
   *  (not replacing) the existing Resolve Referenced Field button which
   *  owns REFFLD/REF itself. Each its own flagRowHtml() row - real SDA's
   *  own "Define Database Reference" screen (screens/field-level/
   *  character/database-reference/image170.png) shows DLTCHK/DLTEDT as
   *  single Y=Yes flags with no repeatable-instance list, same reasoning
   *  as Input keywords above - one occurrence's own indicator expression
   *  already covers every combination real DDS allows. Uses
   *  DspfWriter.getFileFlagKeyword/setFileFlagKeyword directly (generic
   *  over any keywords array), superseding getReferenceOverrides/
   *  setReferenceOverrides (kept for backward compatibility). */
  function referenceOverridesHtml(keywords, ownerKey, expandedSet) {
    var html = '<div class="section-label" style="margin-top:10px;">Ignore previously specified</div>';
    [
      ['dltchk', 'DLTCHK', 'Ignore the referenced field\u2019s own validity-check keywords'],
      ['dltedt', 'DLTEDT', 'Ignore the referenced field\u2019s own edit keywords'],
    ].forEach(function (row) {
      var id = ownerKey + '-ref-' + row[0];
      var kw = DspfWriter.getFileFlagKeyword(keywords, row[1]);
      html += flagRowHtml(id, row[1], kw.present, undefined, undefined, kw.conditions, expandedSet);
    });
    return html;
  }

  function wireReferenceOverridesEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    ['dltchk', 'dltedt'].forEach(function (k, i) {
      var name = ['DLTCHK', 'DLTEDT'][i];
      var id = ownerKey + '-ref-' + k;
      wireFlagRow(
        id,
        function () { return keywords; },
        onChange,
        function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, name, present, params, undefined, conditions); },
        DspfWriter.getFileFlagKeyword(keywords, name).conditions,
        expandedSet,
        rerender
      );
    });
  }

  // -----------------------------------------------------------------------
  // Task D3 - Subfile Keywords (numeric field, within an SFL/SFLCTL
  // record - docs/sda-reference/screens/field-level/numeric/
  // subfile-keywords/image186.png). SFLRCDNBR marks this field as the one
  // the operator can type a record number into to reposition the subfile
  // page - its own parameter is one of two fixed literal values (CURSOR:
  // put the cursor there too, *TOP: also reposition to the top of the
  // page), modeled as a select rather than free text since those are the
  // only two DDS accepts. SFLROLVAL marks this field as the one the
  // operator can type a roll value into. Both are simple present/absent
  // keywords - DspfWriter.getFileFlagKeyword/setFileFlagKeyword (generic
  // over any keywords array) cover them, no new primitives needed.
  // -----------------------------------------------------------------------

  function subfileFieldKeywordsHtml(keywords, ownerKey) {
    var rcdnbr = DspfWriter.getFileFlagKeyword(keywords, 'SFLRCDNBR');
    var rolval = DspfWriter.getFileFlagKeyword(keywords, 'SFLROLVAL');
    var html = '<div class="status" style="margin-bottom:8px;">For a field within a subfile (SFL) or subfile control (SFLCTL) record that lets the operator type a record number or roll value directly.</div>';
    html += '<div class="section-label">Operator can specify the record number to display (SFLRCDNBR)</div>';
    html += '<select id="' + ownerKey + '-sflrcdnbr">' +
      [
        ['', '(none)'],
        ['CURSOR', 'CURSOR - cursor at first input field'],
        ['*TOP', '*TOP - position to top of page'],
      ].map(function (opt) {
        return '<option value="' + opt[0] + '"' + (rcdnbr.parameters === opt[0] && rcdnbr.present ? ' selected' : '') + '>' + opt[1] + '</option>';
      }).join('') +
      '</select>';
    html += '<label class="attr-check" style="margin-top:8px;"><input type="checkbox" id="' + ownerKey + '-sflrolval" ' + (rolval.present ? 'checked' : '') + '/>Operator can specify the number of records to roll (SFLROLVAL)</label>';
    return html;
  }

  function wireSubfileFieldKeywords(keywords, onChange, ownerKey) {
    var rcdnbrEl = document.getElementById(ownerKey + '-sflrcdnbr');
    if (rcdnbrEl) {
      rcdnbrEl.addEventListener('change', function () {
        onChange(DspfWriter.setFileFlagKeyword(keywords, 'SFLRCDNBR', !!rcdnbrEl.value, rcdnbrEl.value));
      });
    }
    var rolvalEl = document.getElementById(ownerKey + '-sflrolval');
    if (rolvalEl) {
      rolvalEl.addEventListener('change', function () {
        onChange(DspfWriter.setFileFlagKeyword(keywords, 'SFLROLVAL', rolvalEl.checked));
      });
    }
  }

  // -----------------------------------------------------------------------
  // D5 - Menu-bar choice fields (MNB*/MNUACT). Two field kinds, five panels
  // (see DspfWriter's own D5 primitives doc comment for the exact DDS
  // shapes and which real SDA screenshot each panel matches):
  //   MNB* fields  - menuBarChoicesHtml (MNUBARCHC list), menuBarSeparatorHtml (MNUBARSEP)
  //   choice fields - choiceSelectionTypeHtml (SNGCHCFLD/MLTCHCFLD),
  //                   choiceKeywordsListHtml (CHOICE + CHCCTL + CHCACCEL, one row per choice),
  //                   choiceColorStatesHtml (CHCAVAIL/CHCUNAVAIL/CHCSLT, three side-by-side states)
  // -----------------------------------------------------------------------

  /** MNUBARCHC list editor - one row per top-level menu-bar choice
   *  (id, pulldown record name, text, optional return field). Rows commit
   *  together via one Apply button, same "batch-edit a list" pattern as
   *  the file-level Display Sizes editor - editing choice N shouldn't
   *  require N separate applies.
   *
   *  Task L3: real SDA's own "Define Menu-Bar Choice Keyword" screen
   *  (docs/sda-reference/screens/field-level/menu-bar-choice/
   *  choice-keyword/image193.png) shows "Text field" and "Text" as two
   *  separate, mutually-exclusive entry fields, plus a separate "Return
   *  field". This editor collapses "Text field"/"Text" into the SAME
   *  single text box - typing a &fieldname there is a text-field
   *  reference, anything else is a literal - matching the &-prefix
   *  convention this codebase already uses for the sibling CHOICE
   *  keyword's own text box (see choiceKeywordRowHtml above); "Return
   *  field" gets its own box since it's a genuinely separate DDS token.
   *
   *  Multi-line block layout (matching choiceKeywordRowHtml's own shape,
   *  not a single `.choice-row`): the properties panel's DEFAULT width
   *  (300px, minus its own 16px padding each side = 268px available) is
   *  already narrower than id(36px)+record(110px)+return-field(130px)'s
   *  combined fixed footprint (276px) BEFORE any width is left for the
   *  text box at all - a single-line flex row with those three fixed
   *  widths (needed so id/record/return-field don't clip - see the
   *  .choice-row input CSS rule's own comment) leaves the text box a
   *  negative flex-basis, which browsers clamp to ~0px: invisible,
   *  unclickable, looks broken (reported: "unable to type the text
   *  column", "record.record not displaying" - it's not that it's
   *  empty, it's that it's ~0px wide). Splitting id+record onto their own
   *  compact top line and giving text/return-field each a full-width line
   *  below removes the impossible single-line fit entirely, the same fix
   *  already applied to the sibling CHOICE keyword editor for the same
   *  reason. */
  function menuBarChoicesHtml(keywords, ownerKey) {
    var choices = DspfWriter.getMenubarChoices(keywords);
    var html = '<div class="section-label">Menu-bar choices (MNUBARCHC)</div>';
    html += '<div id="' + ownerKey + '-mnubarchc-rows">';
    choices.forEach(function (c, idx) {
      html += menuBarChoiceRowHtml(ownerKey, idx, c);
    });
    html += '</div>';
    html += '<button class="secondary ' + ownerKey + '-mnubarchc-add" style="width:100%;margin-top:6px;">+ Add choice</button>';
    html += '<button class="' + ownerKey + '-mnubarchc-apply" style="width:100%;margin-top:6px;">Apply menu-bar choices</button>';
    return html;
  }

  function menuBarChoiceRowHtml(ownerKey, idx, c) {
    c = c || { id: '', pulldownRecord: '', text: '', returnField: '' };
    var row = '<div class="choice-row-block" data-idx="' + idx + '" style="border:1px solid var(--border,#333);border-radius:4px;padding:8px;margin-bottom:8px;">';
    row += '<div class="choice-row">' +
      '<input type="text" class="' + ownerKey + '-mnubarchc-id" placeholder="#" maxlength="3" value="' + escapeHtml(c.id) + '" style="width:36px;" />' +
      '<input type="text" class="' + ownerKey + '-mnubarchc-record" placeholder="pulldown record" maxlength="10" value="' + escapeHtml(c.pulldownRecord) + '" style="flex:1;" />' +
      '<button class="secondary ' + ownerKey + '-mnubarchc-remove" data-idx="' + idx + '" title="Remove">&times;</button>' +
      '</div>';
    row += '<input type="text" class="' + ownerKey + '-mnubarchc-text" placeholder="text, or &field" value="' + escapeHtml(c.text) + '" style="width:100%;margin-top:6px;" />';
    row += '<input type="text" class="' + ownerKey + '-mnubarchc-returnfield" placeholder="return field (opt.)" maxlength="11" value="' + escapeHtml(c.returnField || '') + '" style="width:100%;margin-top:6px;" />';
    row += '</div>';
    return row;
  }

  function wireMenuBarChoicesEditor(keywords, onChange, ownerKey) {
    var container = document.getElementById(ownerKey + '-mnubarchc-rows');
    if (!container) return;
    var addBtn = document.querySelector('.' + ownerKey + '-mnubarchc-add');
    var applyBtn = document.querySelector('.' + ownerKey + '-mnubarchc-apply');
    if (addBtn) addBtn.addEventListener('click', function () {
      container.insertAdjacentHTML('beforeend', menuBarChoiceRowHtml(ownerKey, container.children.length, null));
      wireRemoveButtons();
    });
    function wireRemoveButtons() {
      document.querySelectorAll('.' + ownerKey + '-mnubarchc-remove').forEach(function (btn) {
        btn.onclick = function () { btn.closest('.choice-row-block').remove(); };
      });
    }
    wireRemoveButtons();
    if (applyBtn) applyBtn.addEventListener('click', function () {
      var rows = Array.prototype.slice.call(container.querySelectorAll('.choice-row-block'));
      var choices = rows.map(function (row) {
        return {
          id: row.querySelector('.' + ownerKey + '-mnubarchc-id').value,
          pulldownRecord: row.querySelector('.' + ownerKey + '-mnubarchc-record').value,
          text: row.querySelector('.' + ownerKey + '-mnubarchc-text').value,
          returnField: row.querySelector('.' + ownerKey + '-mnubarchc-returnfield').value,
        };
      });
      onChange(DspfWriter.setMenubarChoices(keywords, choices));
    });
  }

  /** MNUBARSEP - the menu-bar's own separator line. Same "enable checkbox
   *  per group, one Apply" shape as WDWBORDER (see fileKeywordsPanelsHtml's
   *  own windowBorder panel) but a single separator character instead of 8
   *  border positions, and no *CHAR-less alternative for a bare Y default -
   *  real SDA's own screen always pairs the Y flag with its own field. */
  function menuBarSeparatorHtml(keywords, ownerKey) {
    var sep = DspfWriter.getMenubarSeparator(keywords);
    var enabled = { color: !!sep.color, attrs: sep.attrs.length > 0, chars: !!sep.char };
    var html = '<div class="section-label">Menu-bar separator (MNUBARSEP)</div>';
    html += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="' + ownerKey + '-mnubarsep-color-on" ' + (enabled.color ? 'checked' : '') + ' /> Color</label>';
    html += '<select id="' + ownerKey + '-mnubarsep-color">' + COLOR_VALUES.map(function (c) {
      return '<option value="' + c + '"' + (sep.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>';
    }).join('') + '</select>';
    html += '<label style="display:flex;align-items:center;gap:6px;margin:8px 0 6px;font-size:12px;"><input type="checkbox" id="' + ownerKey + '-mnubarsep-attrs-on" ' + (enabled.attrs ? 'checked' : '') + ' /> Display attributes</label>';
    html += '<div class="attr-checks">' + WDWBORDER_ATTRS.map(function (a) {
      var checked = sep.attrs.indexOf(a) >= 0;
      return '<label class="attr-check"><input type="checkbox" class="' + ownerKey + '-mnubarsep-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
    }).join('') + '</div>';
    html += '<label style="display:flex;align-items:center;gap:6px;margin:8px 0 6px;font-size:12px;"><input type="checkbox" id="' + ownerKey + '-mnubarsep-char-on" ' + (enabled.chars ? 'checked' : '') + ' /> Separator character</label>';
    html += '<input type="text" maxlength="1" id="' + ownerKey + '-mnubarsep-char" value="' + escapeHtml(sep.char) + '" style="width:40px;" />';
    html += '<button class="secondary ' + ownerKey + '-mnubarsep-apply" style="width:100%;margin-top:8px;">Apply separator</button>';
    return html;
  }

  function wireMenuBarSeparatorEditor(keywords, onChange, ownerKey) {
    var applyBtn = document.querySelector('.' + ownerKey + '-mnubarsep-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      var attrs = Array.prototype.slice.call(document.querySelectorAll('.' + ownerKey + '-mnubarsep-attr:checked')).map(function (el) { return el.value; });
      onChange(DspfWriter.setMenubarSeparator(keywords, {
        colorEnabled: document.getElementById(ownerKey + '-mnubarsep-color-on').checked,
        color: document.getElementById(ownerKey + '-mnubarsep-color').value,
        attrsEnabled: document.getElementById(ownerKey + '-mnubarsep-attrs-on').checked,
        attrs: attrs,
        charEnabled: document.getElementById(ownerKey + '-mnubarsep-char-on').checked,
        char: document.getElementById(ownerKey + '-mnubarsep-char').value,
      }));
    });
  }

  // The *param flags real SDA's "Define Choice Selection Type" screen
  // offers (docs/sda-reference/screens/field-level/menu-bar-choice/
  // choice-selection-type/image205.png), grouped into the mutually-
  // exclusive radio pairs the screen itself shows them as (plus a blank
  // "not specified" option each group defaults to).
  var CHOICE_SELECTION_RADIO_GROUPS = [
    { name: 'rstcsr', label: 'Cursor restriction', options: [['', '(not specified)'], ['*RSTCSR', 'Restrict cursor to field'], ['*NORSTCSR', 'No restriction']] },
    { name: 'sltind', label: 'Select indicator', options: [['', '(not specified)'], ['*SLTIND', 'Display select indicator'], ['*NOSLTIND', 'No display']] },
    { name: 'autoslt', label: 'Auto-select', options: [['', '(not specified)'], ['*AUTOSLT', 'Select choice upon pressing Enter'], ['*NOAUTOSLT', 'No auto-select'], ['*AUTOSLTENH', 'Only with enhanced controller']] },
    { name: 'autoent', label: 'Auto-enter', options: [['', '(not specified)'], ['*AUTOENT', 'Enable auto-enter on all display'], ['*NOAUTOENT', 'No auto-enter'], ['*AUTOENTNN', 'Only with no numeric selection']] },
  ];

  /** SNGCHCFLD/MLTCHCFLD - marks a field as a single- or multiple-choice
   *  selection field and its own *param behavior flags. This is the entry
   *  point for the other choice panels below (choiceKeywordsListHtml/
   *  choiceColorStatesHtml only make sense once a field IS one of these). */
  function choiceSelectionTypeHtml(keywords, ownerKey) {
    var state = DspfWriter.getChoiceSelectionType(keywords);
    var html = '<div class="section-label">Choice selection type</div>';
    html += '<div class="field-row"><label>Type</label><select id="' + ownerKey + '-cst-kind">' +
      ['', 'SNGCHCFLD', 'MLTCHCFLD'].map(function (k) {
        var label = k === '' ? '(not a choice field)' : k === 'SNGCHCFLD' ? '1=SNGCHCFLD (single choice)' : '2=MLTCHCFLD (multiple choice)';
        return '<option value="' + k + '"' + (state.kind === k ? ' selected' : '') + '>' + label + '</option>';
      }).join('') + '</select></div>';
    CHOICE_SELECTION_RADIO_GROUPS.forEach(function (group) {
      var current = group.options.map(function (o) { return o[0]; }).find(function (v) { return v !== '' && state.flags.indexOf(v) >= 0; }) || '';
      html += '<div class="field-row"><label>' + escapeHtml(group.label) + '</label><select class="' + ownerKey + '-cst-' + group.name + '">' +
        group.options.map(function (opt) {
          return '<option value="' + opt[0] + '"' + (opt[0] === current ? ' selected' : '') + '>' + opt[1] + '</option>';
        }).join('') + '</select></div>';
    });
    html += '<div class="two-col">';
    html += '<div class="field-row"><label>Columns (*NUMCOL)</label><input type="number" min="1" max="999" id="' + ownerKey + '-cst-numcol" value="' + escapeHtml(state.numCol) + '" /></div>';
    html += '<div class="field-row"><label>Rows (*NUMROW)</label><input type="number" min="1" max="999" id="' + ownerKey + '-cst-numrow" value="' + escapeHtml(state.numRow) + '" /></div>';
    html += '</div>';
    html += '<div class="field-row"><label>Gutter (*GUTTER)</label><input type="number" min="2" max="999" id="' + ownerKey + '-cst-gutter" value="' + escapeHtml(state.gutter) + '" /></div>';
    html += '<button class="secondary ' + ownerKey + '-cst-apply" style="width:100%;margin-top:8px;">Apply choice selection type</button>';
    return html;
  }

  function wireChoiceSelectionTypeEditor(keywords, onChange, ownerKey) {
    var applyBtn = document.querySelector('.' + ownerKey + '-cst-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      var flags = [];
      CHOICE_SELECTION_RADIO_GROUPS.forEach(function (group) {
        var sel = document.querySelector('.' + ownerKey + '-cst-' + group.name);
        if (sel && sel.value) flags.push(sel.value);
      });
      onChange(DspfWriter.setChoiceSelectionType(keywords, {
        kind: document.getElementById(ownerKey + '-cst-kind').value,
        flags: flags,
        numCol: document.getElementById(ownerKey + '-cst-numcol').value,
        numRow: document.getElementById(ownerKey + '-cst-numrow').value,
        gutter: document.getElementById(ownerKey + '-cst-gutter').value,
      }));
    });
  }

  /** CHOICE + CHCCTL + CHCACCEL - one row per choice number, all three
   *  keywords for that choice edited together (a choice's text, its
   *  optional control field/message, and its optional accelerator text
   *  are all conceptually "the same choice", matching real SDA's own
   *  "Define Choice Keywords" screen which prompts for all three under one
   *  choice-number header). Rows commit together via one Apply, same
   *  batch-edit pattern as menuBarChoicesHtml. */
  function choiceKeywordsListHtml(keywords, ownerKey) {
    var choices = DspfWriter.getChoices(keywords);
    var controls = DspfWriter.getChoiceControls(keywords);
    var accelerators = DspfWriter.getChoiceAccelerators(keywords);
    var ids = {};
    choices.forEach(function (c) { ids[c.id] = true; });
    controls.forEach(function (c) { ids[c.id] = true; });
    accelerators.forEach(function (c) { ids[c.id] = true; });
    var merged = Object.keys(ids).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }).map(function (id) {
      var choice = choices.find(function (c) { return c.id === id; }) || { text: '' };
      var control = controls.find(function (c) { return c.id === id; }) || { controlField: '', messageId: '', messageFile: '', library: '' };
      var accel = accelerators.find(function (c) { return c.id === id; }) || { text: '' };
      return { id: id, text: choice.text, controlField: control.controlField, messageId: control.messageId, messageFile: control.messageFile, library: control.library, accelText: accel.text };
    });
    var html = '<div class="section-label">Choice keywords (CHOICE / CHCCTL / CHCACCEL)</div>';
    html += '<div id="' + ownerKey + '-choicekw-rows">';
    merged.forEach(function (c, idx) { html += choiceKeywordRowHtml(ownerKey, idx, c); });
    html += '</div>';
    html += '<button class="secondary ' + ownerKey + '-choicekw-add" style="width:100%;margin-top:6px;">+ Add choice</button>';
    html += '<button class="' + ownerKey + '-choicekw-apply" style="width:100%;margin-top:6px;">Apply choice keywords</button>';
    return html;
  }

  function choiceKeywordRowHtml(ownerKey, idx, c) {
    c = c || { id: '', text: '', controlField: '', messageId: '', messageFile: '', library: '', accelText: '' };
    var row = '<div class="choice-row-block" data-idx="' + idx + '" style="border:1px solid var(--border,#333);border-radius:4px;padding:8px;margin-bottom:8px;">';
    row += '<div class="choice-row">' +
      '<input type="text" class="' + ownerKey + '-choicekw-id" placeholder="#" maxlength="3" value="' + escapeHtml(c.id) + '" style="width:36px;" />' +
      '<input type="text" class="' + ownerKey + '-choicekw-text" placeholder="choice text (CHOICE)" value="' + escapeHtml(c.text) + '" style="flex:1;" />' +
      '<button class="secondary ' + ownerKey + '-choicekw-remove" data-idx="' + idx + '" title="Remove">&times;</button>' +
      '</div>';
    row += '<div class="two-col" style="margin-top:6px;">' +
      '<input type="text" class="' + ownerKey + '-choicekw-ctrl" placeholder="control field (CHCCTL)" value="' + escapeHtml(c.controlField) + '" />' +
      '<input type="text" class="' + ownerKey + '-choicekw-accel" placeholder="accelerator text (CHCACCEL)" value="' + escapeHtml(c.accelText) + '" />' +
      '</div>';
    row += '<div class="two-col" style="margin-top:6px;">' +
      '<input type="text" class="' + ownerKey + '-choicekw-msgid" placeholder="message ID" value="' + escapeHtml(c.messageId) + '" />' +
      '<input type="text" class="' + ownerKey + '-choicekw-msgfile" placeholder="message file" value="' + escapeHtml(c.messageFile) + '" />' +
      '</div>';
    row += '<input type="text" class="' + ownerKey + '-choicekw-lib" placeholder="library (optional)" value="' + escapeHtml(c.library) + '" style="width:100%;margin-top:6px;" />';
    row += '</div>';
    return row;
  }

  function wireChoiceKeywordsListEditor(keywords, onChange, ownerKey) {
    var container = document.getElementById(ownerKey + '-choicekw-rows');
    if (!container) return;
    var addBtn = document.querySelector('.' + ownerKey + '-choicekw-add');
    var applyBtn = document.querySelector('.' + ownerKey + '-choicekw-apply');
    if (addBtn) addBtn.addEventListener('click', function () {
      container.insertAdjacentHTML('beforeend', choiceKeywordRowHtml(ownerKey, container.children.length, null));
      wireRemoveButtons();
    });
    function wireRemoveButtons() {
      document.querySelectorAll('.' + ownerKey + '-choicekw-remove').forEach(function (btn) {
        btn.onclick = function () { btn.closest('.choice-row-block').remove(); };
      });
    }
    wireRemoveButtons();
    if (applyBtn) applyBtn.addEventListener('click', function () {
      var rows = Array.prototype.slice.call(container.querySelectorAll('.choice-row-block'));
      var choices = [], controls = [], accelerators = [];
      rows.forEach(function (row) {
        var id = row.querySelector('.' + ownerKey + '-choicekw-id').value;
        choices.push({ id: id, text: row.querySelector('.' + ownerKey + '-choicekw-text').value });
        controls.push({
          id: id,
          controlField: row.querySelector('.' + ownerKey + '-choicekw-ctrl').value,
          messageId: row.querySelector('.' + ownerKey + '-choicekw-msgid').value,
          messageFile: row.querySelector('.' + ownerKey + '-choicekw-msgfile').value,
          library: row.querySelector('.' + ownerKey + '-choicekw-lib').value,
        });
        accelerators.push({ id: id, text: row.querySelector('.' + ownerKey + '-choicekw-accel').value });
      });
      var next = DspfWriter.setChoices(keywords, choices);
      next = DspfWriter.setChoiceControls(next, controls);
      next = DspfWriter.setChoiceAccelerators(next, accelerators);
      onChange(next);
    });
  }

  // CHCAVAIL/CHCUNAVAIL/CHCSLT share one row shape (label, keyword suffix
  // for element ids, and the keyword name itself DspfWriter's
  // get/setChoiceColorState expects).
  var CHOICE_COLOR_STATES = [
    { key: 'avail', keyword: 'CHCAVAIL', label: 'Available' },
    { key: 'unavail', keyword: 'CHCUNAVAIL', label: 'Unavailable' },
    { key: 'slt', keyword: 'CHCSLT', label: 'Selected' },
  ];

  /** CHCAVAIL/CHCUNAVAIL/CHCSLT - the three whole-field color/attribute
   *  states a choice field's entries can be shown in (see DspfWriter's own
   *  getChoiceColorState doc comment). Three independent enable-checkbox +
   *  color + attrs groups side by side, one shared Apply. */
  function choiceColorStatesHtml(keywords, ownerKey) {
    var html = '<div class="section-label">Choice colors &amp; attributes</div>';
    CHOICE_COLOR_STATES.forEach(function (state) {
      var current = DspfWriter.getChoiceColorState(keywords, state.keyword);
      var enabled = !!current.color || current.attrs.length > 0;
      html += '<div style="margin-bottom:10px;">';
      html += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;font-weight:600;"><input type="checkbox" id="' + ownerKey + '-ccs-' + state.key + '-on" ' + (enabled ? 'checked' : '') + ' /> ' + state.label + ' (' + state.keyword + ')</label>';
      html += '<select id="' + ownerKey + '-ccs-' + state.key + '-color">' + COLOR_VALUES.map(function (c) {
        return '<option value="' + c + '"' + (current.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>';
      }).join('') + '</select>';
      html += '<div class="attr-checks">' + WDWBORDER_ATTRS.map(function (a) {
        var checked = current.attrs.indexOf(a) >= 0;
        return '<label class="attr-check"><input type="checkbox" class="' + ownerKey + '-ccs-' + state.key + '-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
      }).join('') + '</div>';
      html += '</div>';
    });
    html += '<button class="secondary ' + ownerKey + '-ccs-apply" style="width:100%;margin-top:6px;">Apply choice colors &amp; attributes</button>';
    return html;
  }

  function wireChoiceColorStatesEditor(keywords, onChange, ownerKey) {
    var applyBtn = document.querySelector('.' + ownerKey + '-ccs-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      var next = keywords;
      CHOICE_COLOR_STATES.forEach(function (state) {
        var on = document.getElementById(ownerKey + '-ccs-' + state.key + '-on').checked;
        var color = on ? document.getElementById(ownerKey + '-ccs-' + state.key + '-color').value : '';
        var attrs = on ? Array.prototype.slice.call(document.querySelectorAll('.' + ownerKey + '-ccs-' + state.key + '-attr:checked')).map(function (el) { return el.value; }) : [];
        next = DspfWriter.setChoiceColorState(next, state.keyword, color, attrs);
      });
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
   *  omitted entirely means the keyword takes no parameters at all.
   *  `conditions`/`expandedSet` (optional, must be passed together) add a
   *  "Conditioning" toggle identical in shape to the generic keyword
   *  editor's own per-keyword toggle (see keywordEditorHtml above) - pass
   *  `conditions` (even `[]`) to opt a given flag row into showing/editing
   *  indicator conditioning; omit it entirely (as most flag rows still do)
   *  to render the plain checkbox-only row unchanged. This exists because
   *  flag-row keywords like SFLDSP/SFLDSPCTL/SFLCLR CAN legally carry
   *  conditioning in real DDS, but until now this generic primitive had no
   *  way to show it - an existing indicator on one of these was invisible
   *  in the UI even though setFileFlagKeyword's old unconditional
   *  `conditions: []` meant it would have been silently deleted the next
   *  time anything on the panel was touched anyway (see setFileFlagKeyword's
   *  own comment in dspfWriter.js for that half of the bug). */
  function flagRowHtml(id, label, present, paramsValue, paramsPlaceholder, conditions, expandedSet) {
    var html = '<div class="field-row" style="margin-bottom:10px;">';
    html += '<label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:12px;color:var(--ink);">';
    html += '<input type="checkbox" id="' + id + '-on" ' + (present ? 'checked' : '') + ' /> ' + escapeHtml(label);
    html += '</label>';
    if (paramsPlaceholder !== undefined) {
      html += '<input type="text" id="' + id + '-params" placeholder="' + escapeHtml(paramsPlaceholder) + '" value="' + escapeHtml(paramsValue || '') + '" style="width:100%;margin-top:4px;" />';
    }
    if (conditions !== undefined) {
      var condSummary = conditions.length > 0 ? ' (' + conditions.length + ')' : '';
      var isExpanded = !!(expandedSet && expandedSet.has(id + ':cond'));
      html += '<span class="kw-cond-toggle" data-flag-id="' + id + '" style="margin-top:4px;">Conditioning' + condSummary + (isExpanded ? ' \u25b4' : ' \u25be') + '</span>';
      if (isExpanded) {
        html += '<div class="kw-cond-body">' + conditionsEditorHtml(conditions, id + '-cond', expandedSet) + '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  /** Wires just the Conditioning toggle + editor half of a flagRowHtml()
   *  row - factored out of wireFlagRow so callers that build a flag row's
   *  checkbox/param wiring by hand (MNUBARSW/MNUCNL in
   *  menuBarKeysPanelHtml, which combine multiple param inputs into one
   *  keyword parameter string and so can't use wireFlagRow's generic
   *  single-param-box commit) can still opt into the same Conditioning
   *  support. `onCommitConditions(newConditions)` is called with the
   *  freshly-edited conditions array; it's the caller's job to also send
   *  along whatever `present`/`parameters` state is currently on screen
   *  (see wireFlagRow below for the common case, or wireMenuBarKeysPanel
   *  for the hand-wired case). */
  function wireFlagRowConditioning(id, conditions, onCommitConditions, expandedSet, rerender) {
    if (conditions === undefined || !expandedSet || !rerender) return;
    var toggle = document.querySelector('.kw-cond-toggle[data-flag-id="' + id + '"]');
    var expandKey = id + ':cond';
    if (toggle) {
      toggle.addEventListener('click', function () {
        if (expandedSet.has(expandKey)) expandedSet.delete(expandKey);
        else expandedSet.add(expandKey);
        rerender();
      });
    }
    if (expandedSet.has(expandKey)) {
      wireConditionsEditor(id + '-cond', conditions, onCommitConditions, expandedSet, rerender);
    }
  }

  /** Wires a flagRowHtml() row so any change to its checkbox or param box
   *  re-derives the file's keyword array and commits it via `onChange`.
   *  `apply(keywords, present, paramsValue)` does the actual get/set call
   *  for this specific keyword (usually DspfWriter.setFileFlagKeyword) -
   *  called with only 3 args here, so any 4th `conditions` parameter
   *  `apply` itself accepts is left `undefined` and setFileFlagKeyword
   *  preserves whatever conditioning already existed (see its own comment).
   *  `conditions`/`expandedSet`/`rerender` (optional, matching
   *  flagRowHtml's own) wire the Conditioning toggle and, when expanded,
   *  the conditions editor - `apply` MUST accept a 4th `conditions` param
   *  and forward it (see sflCtlPanelsHtml's apply functions for the
   *  pattern) for a caller that passes these. */
  function wireFlagRow(id, getKeywords, onChange, apply, conditions, expandedSet, rerender) {
    var onEl = document.getElementById(id + '-on');
    var paramsEl = document.getElementById(id + '-params');
    function commit() {
      var present = onEl.checked;
      var params = paramsEl ? paramsEl.value : '';
      onChange(apply(getKeywords(), present, params));
    }
    if (onEl) onEl.addEventListener('change', commit);
    if (paramsEl) paramsEl.addEventListener('change', commit);

    wireFlagRowConditioning(id, conditions, function (newConditions) {
      var present = onEl.checked;
      var params = paramsEl ? paramsEl.value : '';
      onChange(apply(getKeywords(), present, params, newConditions));
    }, expandedSet, rerender);
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
   * Builds the Window Border (WDWBORDER) sub-panel's inner HTML - shared
   * between the file-level picker (Task F1) and the record-level WINDOW
   * picker (Task R7, screens/record-level/window/border-parameters etc -
   * identical "Define Window Border Parameters" screen, just scoped to a
   * record's keywords instead of the file's), rather than the two
   * duplicating this ~20-line block. `idPrefix` namespaces every element
   * id/class so two instances (one file-level, one per open WINDOW
   * record) can coexist in the DOM without id collisions - same
   * reasoning R1's recordKeywordsPanelsHtml takes an idPrefix for the
   * same purpose.
   */
  function windowBorderPanelHtml(keywords, idPrefix) {
    var wb = DspfWriter.getWdwBorder(keywords);
    var wbEnabled = { color: !!wb.color, attrs: wb.attrs.length > 0, chars: wb.chars.some(function (c) { return c; }) };
    var win = '<div class="section-label">Color</div>';
    win += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="' + idPrefix + '-color-on" ' + (wbEnabled.color ? 'checked' : '') + ' /> Define parameters</label>';
    win += '<select id="' + idPrefix + '-color">' + COLOR_VALUES.map(function (c) { return '<option value="' + c + '"' + (wb.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>'; }).join('') + '</select>';
    win += '<div class="section-label">Display attributes</div>';
    win += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="' + idPrefix + '-attrs-on" ' + (wbEnabled.attrs ? 'checked' : '') + ' /> Define parameters</label>';
    win += '<div class="attr-checks">' + WDWBORDER_ATTRS.map(function (a) {
      var checked = wb.attrs.indexOf(a) >= 0;
      return '<label class="attr-check"><input type="checkbox" class="' + idPrefix + '-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
    }).join('') + '</div>';
    win += '<div class="section-label">Border Characters</div>';
    win += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="' + idPrefix + '-chars-on" ' + (wbEnabled.chars ? 'checked' : '') + ' /> Define parameters</label>';
    BORDER_POSITIONS.forEach(function (p) {
      win += '<div class="field-row" style="margin-bottom:6px;"><label>' + escapeHtml(p.label) + '</label><input type="text" maxlength="1" id="' + idPrefix + '-char-' + p.key + '" value="' + escapeHtml(wb.chars[p.key] || '') + '" style="width:40px;" /></div>';
    });
    win += '<button class="secondary" id="' + idPrefix + '-apply" style="width:100%;margin-top:8px;">Apply window border</button>';
    return win;
  }

  /** Wires a windowBorderPanelHtml()-produced panel. Same `getKeywords`
   *  function / `onChange` callback contract every other dedicated picker
   *  here uses. */
  function wireWindowBorderPanel(idPrefix, getKeywords, onChange) {
    var wdwApply = document.getElementById(idPrefix + '-apply');
    if (!wdwApply) return;
    wdwApply.addEventListener('click', function () {
      var attrs = Array.prototype.slice.call(document.querySelectorAll('.' + idPrefix + '-attr:checked')).map(function (el) { return el.value; });
      var chars = BORDER_POSITIONS.map(function (p) { return (document.getElementById(idPrefix + '-char-' + p.key).value || '').slice(0, 1); });
      var state = {
        colorEnabled: document.getElementById(idPrefix + '-color-on').checked,
        color: document.getElementById(idPrefix + '-color').value,
        attrsEnabled: document.getElementById(idPrefix + '-attrs-on').checked,
        attrs: attrs,
        charsEnabled: document.getElementById(idPrefix + '-chars-on').checked,
        chars: chars,
      };
      onChange(DspfWriter.setWdwBorder(getKeywords(), state));
    });
  }

  /**
   * Builds the Menu-Bar switch/cancel key sub-panel's inner HTML -
   * MNUBARSW (switch key: indicator + CA key) and MNUCNL (cancel key:
   * indicator + CA key + response-indicator) - shared between the
   * file-level picker (Task F1) and the record-level MNUBAR picker (Task
   * R13, screens/record-level/menu-bar-record-mnubar/general - the same
   * two keywords repeated on a MNUBAR record's own General screen),
   * rather than the two duplicating this block. `idPrefix` namespaces
   * every element id, same reasoning windowBorderPanelHtml above takes an
   * idPrefix.
   */
  function menuBarKeysPanelHtml(keywords, idPrefix, expandedSet) {
    var mnubarsw = DspfWriter.getFileFlagKeyword(keywords, 'MNUBARSW');
    var mnubarswParts = (mnubarsw.parameters || '').trim().split(/\s+/);
    var mb = flagRowHtml(idPrefix + '-mnubarsw', 'Menu-bar switch key (MNUBARSW)', mnubarsw.present, undefined, undefined, mnubarsw.conditions, expandedSet);
    mb += '<div class="two-col"><input type="text" id="' + idPrefix + '-mnubarsw-ind" placeholder="indicator" value="' + escapeHtml(mnubarswParts[0] || '') + '" />' +
      '<input type="text" id="' + idPrefix + '-mnubarsw-cakey" placeholder="CA key 01-24" value="' + escapeHtml(mnubarswParts[1] || '') + '" /></div>';
    var mnucnl = DspfWriter.getFileFlagKeyword(keywords, 'MNUCNL');
    var mnucnlParts = (mnucnl.parameters || '').trim().split(/\s+/);
    mb += flagRowHtml(idPrefix + '-mnucnl', 'Menu-cancel key (MNUCNL)', mnucnl.present, undefined, undefined, mnucnl.conditions, expandedSet);
    mb += '<div class="two-col"><input type="text" id="' + idPrefix + '-mnucnl-ind" placeholder="indicator" value="' + escapeHtml(mnucnlParts[0] || '') + '" />' +
      '<input type="text" id="' + idPrefix + '-mnucnl-cakey" placeholder="CA key 01-24" value="' + escapeHtml(mnucnlParts[1] || '') + '" /></div>';
    mb += '<input type="text" id="' + idPrefix + '-mnucnl-resp" placeholder="response indicator 01-99" value="' + escapeHtml(mnucnlParts[2] || '') + '" style="width:100%;margin-top:4px;" />';
    return mb;
  }

  /** Wires a menuBarKeysPanelHtml()-produced panel. Same `getKeywords`/
   *  `onChange` contract every other dedicated picker here uses. */
  function wireMenuBarKeysPanel(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    var mnubarswOn = document.getElementById(idPrefix + '-mnubarsw-on');
    var mnubarswInd = document.getElementById(idPrefix + '-mnubarsw-ind');
    var mnubarswCakey = document.getElementById(idPrefix + '-mnubarsw-cakey');
    function commitMnubarsw(conditions) {
      var params = [mnubarswInd.value, mnubarswCakey.value].map(function (s) { return (s || '').trim(); }).filter(Boolean).join(' ');
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'MNUBARSW', mnubarswOn.checked, params, undefined, conditions));
    }
    if (mnubarswOn) mnubarswOn.addEventListener('change', function () { commitMnubarsw(); });
    if (mnubarswInd) mnubarswInd.addEventListener('change', function () { commitMnubarsw(); });
    if (mnubarswCakey) mnubarswCakey.addEventListener('change', function () { commitMnubarsw(); });
    wireFlagRowConditioning(idPrefix + '-mnubarsw', DspfWriter.getFileFlagKeyword(getKeywords(), 'MNUBARSW').conditions, commitMnubarsw, expandedSet, rerender);

    var mnucnlOn = document.getElementById(idPrefix + '-mnucnl-on');
    var mnucnlInd = document.getElementById(idPrefix + '-mnucnl-ind');
    var mnucnlCakey = document.getElementById(idPrefix + '-mnucnl-cakey');
    var mnucnlResp = document.getElementById(idPrefix + '-mnucnl-resp');
    function commitMnucnl(conditions) {
      var params = [mnucnlInd.value, mnucnlCakey.value, mnucnlResp.value].map(function (s) { return (s || '').trim(); }).filter(Boolean).join(' ');
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'MNUCNL', mnucnlOn.checked, params, undefined, conditions));
    }
    if (mnucnlOn) mnucnlOn.addEventListener('change', function () { commitMnucnl(); });
    if (mnucnlInd) mnucnlInd.addEventListener('change', function () { commitMnucnl(); });
    if (mnucnlCakey) mnucnlCakey.addEventListener('change', function () { commitMnucnl(); });
    if (mnucnlResp) mnucnlResp.addEventListener('change', function () { commitMnucnl(); });
    wireFlagRowConditioning(idPrefix + '-mnucnl', DspfWriter.getFileFlagKeyword(getKeywords(), 'MNUCNL').conditions, commitMnucnl, expandedSet, rerender);
  }

  /**
   * Builds all 9 category panels' inner HTML at once - { general,
   * indicatorKeywords, print, help, displaySizes, dbcsConversion,
   * alternate, windowBorder, menuBar }, keyed to match the tab ids the
   * caller wires up with tabsHtml(). Every panel is self-contained HTML;
   * wireFileKeywordsPanels() below wires all of them regardless of which
   * tab is currently visible (same "all panels exist in the DOM, CSS just
   * hides the inactive ones" approach tabsHtml already uses elsewhere).
   */
  function fileKeywordsPanelsHtml(fileKeywords, expandedSet) {
    var kw = fileKeywords || [];
    var panels = {};

    // --- General ---
    var refState = DspfWriter.getFileRefKeyword(kw);
    var g = '';
    var fInvite = DspfWriter.getFileFlagKeyword(kw, 'INVITE');
    g += flagRowHtml('fk-invite', 'Invite devices for later read', fInvite.present, undefined, undefined, fInvite.conditions, expandedSet);
    var fAlwgph = DspfWriter.getFileFlagKeyword(kw, 'ALWGPH');
    g += flagRowHtml('fk-alwgph', 'Allow graphics', fAlwgph.present, undefined, undefined, fAlwgph.conditions, expandedSet);
    var fMsgalarm = DspfWriter.getFileFlagKeyword(kw, 'MSGALARM');
    g += flagRowHtml('fk-msgalarm', 'Sound alarm on messages', fMsgalarm.present, undefined, undefined, fMsgalarm.conditions, expandedSet);
    var fIndara = DspfWriter.getFileFlagKeyword(kw, 'INDARA');
    g += flagRowHtml('fk-indara', 'Separate indicators area (INDARA)', fIndara.present, undefined, undefined, fIndara.conditions, expandedSet);
    var fUsrdspmgt = DspfWriter.getFileFlagKeyword(kw, 'USRDSPMGT');
    g += flagRowHtml('fk-usrdspmgt', 'Manage display in S/36 mode', fUsrdspmgt.present, undefined, undefined, fUsrdspmgt.conditions, expandedSet);
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml('fk-check-ab', 'Allow blanks', fCheckAb.present, undefined, undefined, fCheckAb.conditions, expandedSet);
    var fCheckRltb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RLTB');
    g += flagRowHtml('fk-check-rltb', 'Move cursor right-left, top-bottom', fCheckRltb.present, undefined, undefined, fCheckRltb.conditions, expandedSet);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml('fk-check-rl', 'Move cursor right to left', fCheckRl.present, undefined, undefined, fCheckRl.conditions, expandedSet);
    var fDsprl = DspfWriter.getFileFlagKeyword(kw, 'DSPRL');
    g += flagRowHtml('fk-dsprl', 'Right to left processing (DSPRL)', fDsprl.present, undefined, undefined, fDsprl.conditions, expandedSet);
    var chginpdft = DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT');
    g += flagRowHtml('fk-chginpdft', 'Change input defaults (CHGINPDFT)', chginpdft.present, chginpdft.parameters, 'parameters (optional)', chginpdft.conditions, expandedSet);
    var entfldatr = DspfWriter.getFileFlagKeyword(kw, 'ENTFLDATR');
    g += flagRowHtml('fk-entfldatr', 'Entry field attribute (ENTFLDATR)', entfldatr.present, entfldatr.parameters, 'e.g. UL', entfldatr.conditions, expandedSet);
    var fErrsfl = DspfWriter.getFileFlagKeyword(kw, 'ERRSFL');
    g += flagRowHtml('fk-errsfl', 'Write error messages to subfile (ERRSFL)', fErrsfl.present, undefined, undefined, fErrsfl.conditions, expandedSet);
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
      ind += flagRowHtml(row[0], row[2] + ' (' + row[1] + ')', state.present, state.parameters, 'indicator (' + row[3] + ')', state.conditions, expandedSet);
    });
    var indtxt = DspfWriter.getFileFlagKeyword(kw, 'INDTXT');
    var indtxtParts = /^(\S+)\s*(?:'((?:[^']|'')*)')?/.exec((indtxt.parameters || '').trim()) || [];
    ind += flagRowHtml('fk-indtxt', 'Indicator text (INDTXT)', indtxt.present, undefined, undefined, indtxt.conditions, expandedSet);
    ind += '<div class="two-col"><input type="text" id="fk-indtxt-ind" placeholder="indicator" value="' + escapeHtml(indtxtParts[1] || '') + '" />' +
      '<input type="text" id="fk-indtxt-text" placeholder="text" value="' + escapeHtml((indtxtParts[2] || '').replace(/''/g, "'")) + '" /></div>';
    panels.indicatorKeywords = ind;

    // --- Print ---
    var filePrint = DspfWriter.getFileFlagKeyword(kw, 'PRINT');
    var print = flagRowHtml('fk-print', 'Enable Print key (PRINT)', filePrint.present, filePrint.parameters, 'response indicator (if program handles it)', filePrint.conditions, expandedSet);
    var prtFile = DspfWriter.getFilePrtFileKeyword(kw);
    print += '<div class="section-label">System handles print (PRTFILE)</div>';
    print += '<div class="two-col"><input type="text" id="fk-prtfile-name" placeholder="Print file" value="' + escapeHtml(prtFile.name) + '" />' +
      '<input type="text" id="fk-prtfile-library" placeholder="Library" value="' + escapeHtml(prtFile.library) + '" /></div>';
    var fOpenprt = DspfWriter.getFileFlagKeyword(kw, 'OPENPRT');
    print += flagRowHtml('fk-openprt', 'Leave print file open until display file is closed (OPENPRT)', fOpenprt.present, undefined, undefined, fOpenprt.conditions, expandedSet);
    panels.print = print;

    // --- Help ---
    var hlppnlgrp = DspfWriter.getFileFlagKeyword(kw, 'HLPPNLGRP');
    var help = flagRowHtml('fk-hlppnlgrp', 'Help text in UIM panel group (HLPPNLGRP)', hlppnlgrp.present, hlppnlgrp.parameters, 'panel-group-name library module-name', hlppnlgrp.conditions, expandedSet);
    var hlpschidx = DspfWriter.getFileFlagKeyword(kw, 'HLPSCHIDX');
    help += flagRowHtml('fk-hlpschidx', 'Enable search index (HLPSCHIDX)', hlpschidx.present, hlpschidx.parameters, 'search-index-object library', hlpschidx.conditions, expandedSet);
    var fHlpfull = DspfWriter.getFileFlagKeyword(kw, 'HLPFULL');
    help += flagRowHtml('fk-hlpfull', 'Full screen help text (HLPFULL)', fHlpfull.present, undefined, undefined, fHlpfull.conditions, expandedSet);
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
    var dbcs = flagRowHtml('fk-igccnv', 'DBCS Conversion (IGCCNV)', igccnv.present, undefined, undefined, igccnv.conditions, expandedSet);
    dbcs += '<div class="two-col"><input type="text" id="fk-igccnv-key" placeholder="CF01-CF24" value="' + escapeHtml(igcParts[0] || '') + '" />' +
      '<input type="text" id="fk-igccnv-line" placeholder="line 1-24" value="' + escapeHtml(igcParts[1] || '') + '" /></div>';
    panels.dbcsConversion = dbcs;

    // --- Alternate keywords ---
    var althelp = DspfWriter.getFileFlagKeyword(kw, 'ALTHELP');
    var alt = flagRowHtml('fk-althelp', 'Alternative help (ALTHELP)', althelp.present, althelp.parameters, 'alternative key, CA01-CA24', althelp.conditions, expandedSet);
    var altpageup = DspfWriter.getFileFlagKeyword(kw, 'ALTPAGEUP');
    alt += flagRowHtml('fk-altpageup', 'Alternative page up (ALTPAGEUP)', altpageup.present, altpageup.parameters, 'alternative key, CF01-CF24', altpageup.conditions, expandedSet);
    var altpagedwn = DspfWriter.getFileFlagKeyword(kw, 'ALTPAGEDWN');
    alt += flagRowHtml('fk-altpagedwn', 'Alternative page down (ALTPAGEDWN)', altpagedwn.present, altpagedwn.parameters, 'alternative key, CF01-CF24', altpagedwn.conditions, expandedSet);
    panels.alternate = alt;

    // --- Window Border (WDWBORDER) ---
    panels.windowBorder = windowBorderPanelHtml(kw, 'fk-wdw');

    // --- Menu-bar keywords ---
    panels.menuBar = menuBarKeysPanelHtml(kw, 'fk', expandedSet);

    return panels;
  }

  /** Wires every row across all 9 fileKeywordsPanelsHtml() panels.
   *  `getKeywords` returns the CURRENT fileKeywords array (a function, not
   *  a snapshot, so a commit from one row sees any change a previous
   *  commit in the same render already made) and `onChange` receives the
   *  new array to commit, same contract as every other dedicated picker
   *  here. */
  function wireFileKeywordsPanels(getKeywords, onChange, expandedSet, rerender) {
    function simple(id, name, placeholderIsParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, placeholderIsParams ? params : '', undefined, conditions);
      }, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, expandedSet, rerender);
    }
    // General
    simple('fk-invite', 'INVITE');
    simple('fk-alwgph', 'ALWGPH');
    simple('fk-msgalarm', 'MSGALARM');
    simple('fk-indara', 'INDARA');
    simple('fk-usrdspmgt', 'USRDSPMGT');
    wireFlagRow('fk-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'AB').conditions, expandedSet, rerender);
    wireFlagRow('fk-check-rltb', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RLTB', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'RLTB').conditions, expandedSet, rerender);
    wireFlagRow('fk-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'RL').conditions, expandedSet, rerender);
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
    function commitIndtxt(conditions) {
      var ind = (indtxtInd.value || '').trim();
      var text = (indtxtText.value || '').trim();
      var params = ind ? ind + (text ? " '" + text.replace(/'/g, "''") + "'" : '') : '';
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'INDTXT', indtxtOn.checked, params, undefined, conditions));
    }
    if (indtxtOn) indtxtOn.addEventListener('change', function () { commitIndtxt(); });
    if (indtxtInd) indtxtInd.addEventListener('change', function () { commitIndtxt(); });
    if (indtxtText) indtxtText.addEventListener('change', function () { commitIndtxt(); });
    wireFlagRowConditioning('fk-indtxt', DspfWriter.getFileFlagKeyword(getKeywords(), 'INDTXT').conditions, commitIndtxt, expandedSet, rerender);

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
    function commitIgccnv(conditions) {
      var key = (igccnvKey.value || '').trim();
      var line = (igccnvLine.value || '').trim();
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'IGCCNV', igccnvOn.checked, [key, line].filter(Boolean).join(' '), undefined, conditions));
    }
    if (igccnvOn) igccnvOn.addEventListener('change', function () { commitIgccnv(); });
    if (igccnvKey) igccnvKey.addEventListener('change', function () { commitIgccnv(); });
    if (igccnvLine) igccnvLine.addEventListener('change', function () { commitIgccnv(); });
    wireFlagRowConditioning('fk-igccnv', DspfWriter.getFileFlagKeyword(getKeywords(), 'IGCCNV').conditions, commitIgccnv, expandedSet, rerender);

    // Alternate keywords
    simple('fk-althelp', 'ALTHELP', true);
    simple('fk-altpageup', 'ALTPAGEUP', true);
    simple('fk-altpagedwn', 'ALTPAGEDWN', true);

    // Window Border
    wireWindowBorderPanel('fk-wdw', getKeywords, onChange);

    // Menu-bar
    wireMenuBarKeysPanel('fk', getKeywords, onChange, expandedSet, rerender);
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
   * Builds all 7 R1 category panels' inner HTML at once - { general,
   * indicatorKeywords, help, output, input, overlay, print }, keyed to
   * match the subtabsHtml() ids the caller wires up. (Task L5d-ii moved
   * the former 8th category, Application help, off this record-level set
   * entirely - see applicationHelpFieldsHtml's own doc comment below for
   * why.) `idPrefix` (e.g. 'rk-RECORD1') keeps element ids unique per
   * record when the props panel is rebuilt for a different record.
   */
  function recordKeywordsPanelsHtml(keywords, idPrefix, expandedSet) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    // --- General ---
    var g = '';
    var fInzrcd = DspfWriter.getFileFlagKeyword(kw, 'INZRCD');
    g += flagRowHtml(p + '-inzrcd', 'If this record is not on display, write it to the display before issuing read (INZRCD)', fInzrcd.present, undefined, undefined, fInzrcd.conditions, expandedSet);
    var fKeep = DspfWriter.getFileFlagKeyword(kw, 'KEEP');
    g += flagRowHtml(p + '-keep', 'Keep record on display (KEEP)', fKeep.present, undefined, undefined, fKeep.conditions, expandedSet);
    var fAssume = DspfWriter.getFileFlagKeyword(kw, 'ASSUME');
    g += flagRowHtml(p + '-assume', 'Assume record is on display (ASSUME)', fAssume.present, undefined, undefined, fAssume.conditions, expandedSet);
    var fAlwrol = DspfWriter.getFileFlagKeyword(kw, 'ALWROL');
    g += flagRowHtml(p + '-alwrol', 'Allow rolling of lines (ALWROL)', fAlwrol.present, undefined, undefined, fAlwrol.conditions, expandedSet);
    var fRetkey = DspfWriter.getFileFlagKeyword(kw, 'RETKEY');
    g += flagRowHtml(p + '-retkey', 'Retain CLEAR HELP HOME and ROLL keys (RETKEY)', fRetkey.present, undefined, undefined, fRetkey.conditions, expandedSet);
    var fRetcmdkey = DspfWriter.getFileFlagKeyword(kw, 'RETCMDKEY');
    g += flagRowHtml(p + '-retcmdkey', 'Retain command function (CFnn and CAnn) keys (RETCMDKEY)', fRetcmdkey.present, undefined, undefined, fRetcmdkey.conditions, expandedSet);
    var chginpdft = DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT');
    g += flagRowHtml(p + '-chginpdft', 'Change input defaults (CHGINPDFT)', chginpdft.present, chginpdft.parameters, 'parameters (optional)', chginpdft.conditions, expandedSet);
    var mnubardsp = DspfWriter.getFileFlagKeyword(kw, 'MNUBARDSP');
    g += flagRowHtml(p + '-mnubardsp', 'Menu-Bar display (MNUBARDSP)', mnubardsp.present, mnubardsp.parameters, 'parameters (optional)', mnubardsp.conditions, expandedSet);
    var entfldatr = DspfWriter.getFileFlagKeyword(kw, 'ENTFLDATR');
    g += flagRowHtml(p + '-entfldatr', 'Entry field attribute (ENTFLDATR)', entfldatr.present, entfldatr.parameters, 'e.g. UL', entfldatr.conditions, expandedSet);
    var rtncsrloc = DspfWriter.getFileTwoFieldKeyword(kw, 'RTNCSRLOC');
    g += '<div class="section-label">Return cursor location (RTNCSRLOC)</div>';
    g += '<div class="two-col"><input type="text" id="' + p + '-rtncsrloc-row" placeholder="Row field name" value="' + escapeHtml(rtncsrloc.a) + '" />' +
      '<input type="text" id="' + p + '-rtncsrloc-col" placeholder="Column field name" value="' + escapeHtml(rtncsrloc.b) + '" /></div>';
    panels.general = g;

    // --- Indicator / screen-control keywords (Task L5d - repeatable,
    // independently-conditioned instances; see
    // DspfWriter.getRecordIndicatorInstances' own doc comment for why
    // this replaced the old one-flagRowHtml-per-keyword treatment) ---
    var ind = '<div class="status" style="margin-bottom:10px;">CA/CF command keys have their own dedicated panel above (Command keys) - this covers the remaining screen-control keywords. Each row below is independently conditioned and repeatable - add as many as needed, e.g. two CLEAR rows under different indicators.</div>';
    ind += recordIndicatorInstancesHtml(kw, p + '-recind', expandedSet);
    panels.indicatorKeywords = ind;

    // --- Application help ---
    // Task L5d-ii: HLPPNLGRP/HLPEXCLD/HLPBDY/HLPARA do NOT belong here.
    // Checking IBM's own DDS Reference against this codebase's own
    // dspfParser.ts (nameTypeFor -> 'HELP', record.helpEntries) showed
    // these four keywords are Help-SPECIFICATION-level, not record-level -
    // DDS's own syntax has an entirely separate "H" line-type (like R for
    // records or a field's own line) that begins a help specification,
    // and a record can carry SEVERAL of them (real SDA's own "Define
    // Application Help" screen's "Help number: N of M / Next help number"
    // fields, which this record-level tab never modeled, are literally
    // cycling through those - one full HLPPNLGRP/HLPEXCLD/HLPBDY/HLPARA
    // group per help specification, not a single shared occurrence per
    // record). Reading/writing them from/to the RECORD's own top-level
    // keywords (what this tab used to do) can't ever reflect real DDS
    // correctly and would write keywords that don't mean what the picker
    // implies. The dedicated fields for these four now live on each HELP
    // entry's own properties instead (`applicationHelpFieldsHtml`/
    // `wireApplicationHelpFields` below, called from buildWebviewTemplate.
    // js's `renderHelpProps` against that entry's own `keywords` array,
    // the same array `helpEntriesListHtml`'s add/select/delete flow and
    // the writer's H-spec serialization already treat as a genuine
    // separate DDS entry) - this record-level "App help" tab is removed
    // entirely rather than left showing something that never did
    // anything real. See `src/test/dspfWebview.test.js`'s Task L5d-ii
    // scenarios.

    // --- Help ---
    var fHlpclr = DspfWriter.getFileFlagKeyword(kw, 'HLPCLR');
    var help = flagRowHtml(p + '-hlpclr', 'Clear previous help text records (HLPCLR)', fHlpclr.present, undefined, undefined, fHlpclr.conditions, expandedSet);
    var hlpseq = DspfWriter.getFileTwoFieldKeyword(kw, 'HLPSEQ');
    help += '<div class="section-label">Sequence of help text records (HLPSEQ)</div>';
    help += '<div class="two-col"><input type="text" id="' + p + '-hlpseq-group" placeholder="Help group name" value="' + escapeHtml(hlpseq.a) + '" />' +
      '<input type="text" id="' + p + '-hlpseq-num" placeholder="Sequence number 0-99" value="' + escapeHtml(hlpseq.b) + '" /></div>';
    var fHlpcmdkey = DspfWriter.getFileFlagKeyword(kw, 'HLPCMDKEY');
    help += flagRowHtml(p + '-hlpcmdkey', 'Return command key from help (HLPCMDKEY)', fHlpcmdkey.present, undefined, undefined, fHlpcmdkey.conditions, expandedSet);
    help += '<div class="section-label">Define help title (HLPTITLE)</div>';
    help += '<input type="text" id="' + p + '-hlptitle" placeholder="Help title text" value="' + escapeHtml(DspfWriter.getFileQuotedText(kw, 'HLPTITLE')) + '" style="width:100%;" />';
    panels.help = help;

    // --- Output ---
    var fBlink = DspfWriter.getFileFlagKeyword(kw, 'BLINK');
    var out = flagRowHtml(p + '-blink', 'Blink cursor (BLINK)', fBlink.present, undefined, undefined, fBlink.conditions, expandedSet);
    var fAlarm = DspfWriter.getFileFlagKeyword(kw, 'ALARM');
    out += flagRowHtml(p + '-alarm', 'Sound the alarm (ALARM)', fAlarm.present, undefined, undefined, fAlarm.conditions, expandedSet);
    var fMsgalarm = DspfWriter.getFileFlagKeyword(kw, 'MSGALARM');
    out += flagRowHtml(p + '-msgalarm', 'Sound alarm on messages (MSGALARM)', fMsgalarm.present, undefined, undefined, fMsgalarm.conditions, expandedSet);
    var fLock = DspfWriter.getFileFlagKeyword(kw, 'LOCK');
    out += flagRowHtml(p + '-lock', 'Do not unlock keyboard (LOCK)', fLock.present, undefined, undefined, fLock.conditions, expandedSet);
    var fLogout = DspfWriter.getFileFlagKeyword(kw, 'LOGOUT');
    out += flagRowHtml(p + '-logout', 'Write record to job log (LOGOUT)', fLogout.present, undefined, undefined, fLogout.conditions, expandedSet);
    var fInvite = DspfWriter.getFileFlagKeyword(kw, 'INVITE');
    out += flagRowHtml(p + '-invite', 'Invite devices for later read (INVITE)', fInvite.present, undefined, undefined, fInvite.conditions, expandedSet);
    var fAlwgph = DspfWriter.getFileFlagKeyword(kw, 'ALWGPH');
    out += flagRowHtml(p + '-alwgph', 'Allow graphics (ALWGPH)', fAlwgph.present, undefined, undefined, fAlwgph.conditions, expandedSet);
    var fFrcdta = DspfWriter.getFileFlagKeyword(kw, 'FRCDTA');
    out += flagRowHtml(p + '-frcdta', 'Put data before buffer is full (FRCDTA)', fFrcdta.present, undefined, undefined, fFrcdta.conditions, expandedSet);
    var dspmod = DspfWriter.getFileFlagKeyword(kw, 'DSPMOD');
    out += flagRowHtml(p + '-dspmod', 'Use alternate display mode (DSPMOD)', dspmod.present, dspmod.parameters, 'display name, e.g. *DS3', dspmod.conditions, expandedSet);
    var csrloc = DspfWriter.getFileTwoFieldKeyword(kw, 'CSRLOC');
    out += '<div class="section-label">Hidden fields with cursor position for output (CSRLOC)</div>';
    out += '<div class="two-col"><input type="text" id="' + p + '-csrloc-row" placeholder="Row field name" value="' + escapeHtml(csrloc.a) + '" />' +
      '<input type="text" id="' + p + '-csrloc-col" placeholder="Column field name" value="' + escapeHtml(csrloc.b) + '" /></div>';
    var slno = DspfWriter.getFileFlagKeyword(kw, 'SLNO');
    out += flagRowHtml(p + '-slno', 'Start line number (SLNO)', slno.present, slno.parameters, '*VAR or line number', slno.conditions, expandedSet);
    var clrl = DspfWriter.getFileFlagKeyword(kw, 'CLRL');
    out += flagRowHtml(p + '-clrl', 'Clear previous display (CLRL)', clrl.present, clrl.parameters, 'line number, or nn ...', clrl.conditions, expandedSet);
    panels.output = out;

    // --- Input ---
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    var inp = flagRowHtml(p + '-loginp', 'Write record to job log (LOGINP)', fLoginp.present, undefined, undefined, fLoginp.conditions, expandedSet);
    var unlock = DspfWriter.getUnlockKeyword(kw);
    inp += flagRowHtml(p + '-unlock', 'Unlock keyboard after input operation (UNLOCK)', unlock.present, undefined, undefined, unlock.conditions, expandedSet);
    inp += '<div style="display:flex;gap:14px;margin-bottom:10px;">' +
      '<label class="attr-check"><input type="checkbox" id="' + p + '-unlock-erase" ' + (unlock.erase ? 'checked' : '') + '/>Erase input capable fields (*ERASE)</label>' +
      '<label class="attr-check"><input type="checkbox" id="' + p + '-unlock-mdtoff" ' + (unlock.mdtoff ? 'checked' : '') + '/>Reset all modified data tags (*MDTOFF)</label></div>';
    var fGetretain = DspfWriter.getFileFlagKeyword(kw, 'GETRETAIN');
    inp += flagRowHtml(p + '-getretain', 'If UNLOCK, retain data on display (GETRETAIN)', fGetretain.present, undefined, undefined, fGetretain.conditions, expandedSet);
    var retlcksts = DspfWriter.getFileFlagKeyword(kw, 'RETLCKSTS');
    inp += flagRowHtml(p + '-retlcksts', 'Retain LOCK status on next read (RETLCKSTS)', retlcksts.present, retlcksts.parameters, 'indicators (optional)', retlcksts.conditions, expandedSet);
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    inp += flagRowHtml(p + '-check-ab', 'Allow blanks in input fields', fCheckAb.present, undefined, undefined, fCheckAb.conditions, expandedSet);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    inp += flagRowHtml(p + '-check-rl', 'Move cursor right to left', fCheckRl.present, undefined, undefined, fCheckRl.conditions, expandedSet);
    var fRtndta = DspfWriter.getFileFlagKeyword(kw, 'RTNDTA');
    inp += flagRowHtml(p + '-rtndta', 'Return same input data on next read (RTNDTA)', fRtndta.present, undefined, undefined, fRtndta.conditions, expandedSet);
    panels.input = inp;

    // --- Overlay ---
    var fOverlay = DspfWriter.getFileFlagKeyword(kw, 'OVERLAY');
    var ov = flagRowHtml(p + '-overlay', 'Overlay without erasing (OVERLAY)', fOverlay.present, undefined, undefined, fOverlay.conditions, expandedSet);
    var fPutretain = DspfWriter.getFileFlagKeyword(kw, 'PUTRETAIN');
    ov += flagRowHtml(p + '-putretain', 'Retain data on re-display (PUTRETAIN)', fPutretain.present, undefined, undefined, fPutretain.conditions, expandedSet);
    var fProtect = DspfWriter.getFileFlagKeyword(kw, 'PROTECT');
    ov += flagRowHtml(p + '-protect', 'Protect all input fields (PROTECT)', fProtect.present, undefined, undefined, fProtect.conditions, expandedSet);
    var fPutovr = DspfWriter.getFileFlagKeyword(kw, 'PUTOVR');
    ov += flagRowHtml(p + '-putovr', 'Activate OVRDTA and OVRATR (PUTOVR)', fPutovr.present, undefined, undefined, fPutovr.conditions, expandedSet);
    var fOvrdta = DspfWriter.getFileFlagKeyword(kw, 'OVRDTA');
    ov += flagRowHtml(p + '-ovrdta', 'Override Data (OVRDTA)', fOvrdta.present, undefined, undefined, fOvrdta.conditions, expandedSet);
    var fOvratr = DspfWriter.getFileFlagKeyword(kw, 'OVRATR');
    ov += flagRowHtml(p + '-ovratr', 'Override Attribute (OVRATR)', fOvratr.present, undefined, undefined, fOvratr.conditions, expandedSet);
    var fInzinp = DspfWriter.getFileFlagKeyword(kw, 'INZINP');
    ov += flagRowHtml(p + '-inzinp', 'Initialize input fields (INZINP)', fInzinp.present, undefined, undefined, fInzinp.conditions, expandedSet);
    var mdtoff = DspfWriter.getFileFlagKeyword(kw, 'MDTOFF');
    ov += flagRowHtml(p + '-mdtoff', 'Reset all modified data tags (MDTOFF)', mdtoff.present, mdtoff.parameters, '*UNPR or *ALL (optional)', mdtoff.conditions, expandedSet);
    var eraseinp = DspfWriter.getFileFlagKeyword(kw, 'ERASEINP');
    ov += flagRowHtml(p + '-eraseinp', 'Erase all input fields (ERASEINP)', eraseinp.present, eraseinp.parameters, '*MDTON or *ALL (optional)', eraseinp.conditions, expandedSet);
    var fErase = DspfWriter.getFileFlagKeyword(kw, 'ERASE');
    ov += flagRowHtml(p + '-erase', 'Erase all records below (ERASE)', fErase.present, undefined, undefined, fErase.conditions, expandedSet);
    panels.overlay = ov;

    // --- Print ---
    var print = DspfWriter.getFileFlagKeyword(kw, 'PRINT');
    var pr = flagRowHtml(p + '-print', 'Enable Print key (PRINT)', print.present, print.parameters, 'response indicator (if program handles it)', print.conditions, expandedSet);
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
  // usrdfn/_menu-example/image26.png) offers only 4 of R1's original 8
  // categories: General, Application help, Help, Print (Indicator/
  // Output/Input/Overlay are absent from that menu entirely, not just
  // empty). So R2 is pure wiring - renderRecordProps narrows
  // recordKeywordsPanelsHtml's subtabs to the matching subset when the
  // record is USRDFN - not a new getX/setX pair or a new panel. (Task
  // L5d-ii later moved Application help off THIS record-level set
  // entirely, for every record type including USRDFN - see
  // applicationHelpFieldsHtml's own doc comment - so today's narrowed
  // USRDFN subset is General/Help/Print, 3 of R1's remaining 7; that's a
  // side effect of L5d-ii's correctness fix, not a re-litigation of this
  // task's own finding about what real SDA's menu shows.) The USRDFN
  // keyword's own parameter (which field carries the formatted data -
  // see buildTypedRecordPlan) isn't part of any of these screens either;
  // it stays reachable through the Advanced/raw keywords accordion, same
  // "no screen of its own"
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
  function sflMsgPanelsHtml(rec, expandedSet) {
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
    var fSflnxtchg = DspfWriter.getFileFlagKeyword(kw, 'SFLNXTCHG');
    g += flagRowHtml('sm-sflnxtchg', 'Return this record on read next changed (SFLNXTCHG)', fSflnxtchg.present, undefined, undefined, fSflnxtchg.conditions, expandedSet);
    var fLogout = DspfWriter.getFileFlagKeyword(kw, 'LOGOUT');
    g += flagRowHtml('sm-logout', 'Write this record to the job log on output (LOGOUT)', fLogout.present, undefined, undefined, fLogout.conditions, expandedSet);
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    g += flagRowHtml('sm-loginp', 'Write this record to the job log on input (LOGINP)', fLoginp.present, undefined, undefined, fLoginp.conditions, expandedSet);
    var fKeep = DspfWriter.getFileFlagKeyword(kw, 'KEEP');
    g += flagRowHtml('sm-keep', 'Keep records on display when closing the file (KEEP)', fKeep.present, undefined, undefined, fKeep.conditions, expandedSet);
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml('sm-check-ab', 'Allow blanks (CHECK AB)', fCheckAb.present, undefined, undefined, fCheckAb.conditions, expandedSet);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml('sm-check-rl', 'Move cursor right to left (CHECK RL)', fCheckRl.present, undefined, undefined, fCheckRl.conditions, expandedSet);
    var chginpdft = DspfWriter.getFileFlagKeyword(kw, 'CHGINPDFT');
    g += flagRowHtml('sm-chginpdft', 'Change input defaults (CHGINPDFT)', chginpdft.present, chginpdft.parameters, 'parameters (optional)', chginpdft.conditions, expandedSet);
    panels.general = g;

    // --- Indicator ---
    // Repeatable INDTXT/SETOF/CHANGE row list (see indicatorTextRowsHtml
    // above) - real DDS takes exactly one indicator per SETOF/CHANGE
    // instance (multiple instances for multiple indicators, not a
    // space-separated list in one keyword), and CHANGE's shape is now
    // verified (indicator-only, no text) rather than the "not confidently
    // verified" placeholder this screen originally shipped with.
    panels.indicator = indicatorTextRowsHtml(kw, 'sm-ind', ['INDTXT', 'SETOF', 'CHANGE'], 6);

    return panels;
  }

  /** Wires every row across all 8 recordKeywordsPanelsHtml() panels.
   *  `getKeywords`/`onChange` follow the same "current array, new array"
   *  contract as wireFileKeywordsPanels. `idPrefix` must match what was
   *  passed to recordKeywordsPanelsHtml(). */
  function wireRecordKeywordsPanels(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    var p = idPrefix;
    function simple(id, name, hasParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, hasParams ? params : '', undefined, conditions);
      }, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, expandedSet, rerender);
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

    // Indicator / screen-control (Task L5d)
    wireRecordIndicatorInstances(getKeywords(), onChange, p + '-recind', expandedSet, rerender);

    // Application help - Task L5d-ii moved this to each HELP entry's own
    // properties (see wireApplicationHelpFields below); nothing to wire
    // here anymore.

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
    function commitUnlock(conditions) { onChange(DspfWriter.setUnlockKeyword(getKeywords(), unlockOn.checked, unlockErase.checked, unlockMdtoff.checked, conditions)); }
    if (unlockOn) unlockOn.addEventListener('change', function () { commitUnlock(); });
    if (unlockErase) unlockErase.addEventListener('change', function () { commitUnlock(); });
    if (unlockMdtoff) unlockMdtoff.addEventListener('change', function () { commitUnlock(); });
    wireFlagRowConditioning(p + '-unlock', DspfWriter.getUnlockKeyword(getKeywords()).conditions, commitUnlock, expandedSet, rerender);
    simple(p + '-getretain', 'GETRETAIN');
    simple(p + '-retlcksts', 'RETLCKSTS', true);
    wireFlagRow(p + '-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'AB').conditions, expandedSet, rerender);
    wireFlagRow(p + '-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'RL').conditions, expandedSet, rerender);
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

  /**
   * Task L5d-ii: the four "Define Application Help" keywords
   * (`HLPPNLGRP`/`HLPEXCLD`/`HLPBDY`/`HLPARA`), scoped to a SINGLE help
   * specification's own `keywords` array - see the doc comment on the
   * (now-removed) record-level "Application help" tab in
   * `recordKeywordsPanelsHtml` for why a record's own top-level keywords
   * was the wrong place for these. Real SDA's own screen shows exactly
   * ONE "Resp" indicator slot per keyword here (same shape as L5a/b/c's
   * own keywords), so - like those - this is plain `flagRowHtml`/
   * `wireFlagRow` over `DspfWriter.getFileFlagKeyword`/
   * `setFileFlagKeyword`, just pointed at a help entry's own keywords
   * instead of a record's. `getKeywords`/`onChange` are passed in
   * (rather than this taking a raw keywords array + returning a new one,
   * the shape every OTHER dedicated picker's *Html half uses) only for
   * the read side (`applicationHelpFieldsHtml`) needing just the current
   * array to render from - `wireApplicationHelpFields` needs the getter/
   * setter pair the same way `wireRecordKeywordsPanels` does, since each
   * row's checkbox commits independently and immediately rather than via
   * a shared Apply button.
   */
  function applicationHelpFieldsHtml(keywords, idPrefix, expandedSet) {
    var kw = keywords || [];
    var p = idPrefix;
    var hlppnlgrp = DspfWriter.getFileFlagKeyword(kw, 'HLPPNLGRP');
    var html = flagRowHtml(p + '-hlppnlgrp', 'Help text in UIM panel group (HLPPNLGRP)', hlppnlgrp.present, hlppnlgrp.parameters, 'panel-group-name library module-name', hlppnlgrp.conditions, expandedSet);
    var fHlpexcld = DspfWriter.getFileFlagKeyword(kw, 'HLPEXCLD');
    html += flagRowHtml(p + '-hlpexcld', 'Help text excluded (HLPEXCLD)', fHlpexcld.present, undefined, undefined, fHlpexcld.conditions, expandedSet);
    var fHlpbdy = DspfWriter.getFileFlagKeyword(kw, 'HLPBDY');
    html += flagRowHtml(p + '-hlpbdy', 'Help boundary (HLPBDY)', fHlpbdy.present, undefined, undefined, fHlpbdy.conditions, expandedSet);
    var fHlpara = DspfWriter.getFileFlagKeyword(kw, 'HLPARA');
    html += flagRowHtml(p + '-hlpara', 'Define help area (HLPARA)', fHlpara.present, undefined, undefined, fHlpara.conditions, expandedSet);
    return html;
  }

  function wireApplicationHelpFields(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    var p = idPrefix;
    function simple(id, name, hasParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, hasParams ? params : '', undefined, conditions);
      }, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, expandedSet, rerender);
    }
    simple(p + '-hlppnlgrp', 'HLPPNLGRP', true);
    simple(p + '-hlpexcld', 'HLPEXCLD');
    simple(p + '-hlpbdy', 'HLPBDY');
    simple(p + '-hlpara', 'HLPARA');
  }

  /** Renders a fixed-size (`rowCount`, default 6) repeatable table of
   *  { keyword dropdown (one of `names`), indicator, text } rows, backed
   *  by DspfWriter.getIndicatorTextRows/setIndicatorTextRows - real DDS
   *  allows MULTIPLE INDTXT/SETOF/CHANGE keywords on one record (a
   *  different response indicator each), which a single flagRowHtml()
   *  checkbox can't express. Shared between Task R3's SFL panel and Task
   *  R5's SFLMSG panel (same underlying category on both real SDA
   *  screens) rather than duplicated - `idPrefix` keeps their DOM ids
   *  from colliding when both could theoretically render at once. Text
   *  only applies to INDTXT (see setIndicatorTextRows) - the Text column
   *  stays enabled for every row regardless of which keyword is picked,
   *  same as real SDA's own screen; a stray value there is silently
   *  dropped for SETOF/CHANGE rows rather than erroring. */
  function indicatorTextRowsHtml(keywords, idPrefix, names, rowCount) {
    rowCount = rowCount || 6;
    var rows = DspfWriter.getIndicatorTextRows(keywords, names);
    var html = '<div class="section-label">' + names.join(' / ') + ' (repeatable)</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr><th style="text-align:left;">Keyword</th><th style="text-align:left;">Indicator</th><th style="text-align:left;">Text</th></tr></thead><tbody>';
    for (var i = 0; i < rowCount; i++) {
      var r = rows[i] || { keyword: '', indicator: '', text: '' };
      html += '<tr>';
      html += '<td><select id="' + idPrefix + '-row' + i + '-kw" style="width:100%;">';
      html += '<option value=""' + (r.keyword ? '' : ' selected') + '></option>';
      names.forEach(function (n) {
        html += '<option value="' + n + '"' + (r.keyword === n ? ' selected' : '') + '>' + n + '</option>';
      });
      html += '</select></td>';
      html += '<td><input type="text" id="' + idPrefix + '-row' + i + '-ind" value="' + escapeHtml(r.indicator) + '" placeholder="nn" style="width:100%;" /></td>';
      html += '<td><input type="text" id="' + idPrefix + '-row' + i + '-text" value="' + escapeHtml(r.text) + '" placeholder="text (INDTXT only)" style="width:100%;" /></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    html += '<button class="secondary ' + idPrefix + '-apply" style="width:100%;margin-top:8px;">Apply</button>';
    return html;
  }

  /** Wires an indicatorTextRowsHtml() table's Apply button - reads all
   *  `rowCount` rows and replaces every existing instance of any keyword
   *  in `names` via DspfWriter.setIndicatorTextRows in one commit
   *  (batch, same convention as the other multi-field Apply-button
   *  panels - see wireGeneralFieldKeywordsEditor). */
  function wireIndicatorTextRows(idPrefix, names, rowCount, getKeywords, onChange) {
    rowCount = rowCount || 6;
    var applyBtn = document.querySelector('.' + idPrefix + '-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      var rows = [];
      for (var i = 0; i < rowCount; i++) {
        var kwEl = document.getElementById(idPrefix + '-row' + i + '-kw');
        if (!kwEl) continue;
        var indEl = document.getElementById(idPrefix + '-row' + i + '-ind');
        var textEl = document.getElementById(idPrefix + '-row' + i + '-text');
        rows.push({ keyword: kwEl.value, indicator: indEl ? indEl.value : '', text: textEl ? textEl.value : '' });
      }
      onChange(DspfWriter.setIndicatorTextRows(getKeywords(), names, rows));
    });
  }

  // -----------------------------------------------------------------------
  // Task L1 - generic "repeatable conditioned instance" component. The
  // foundation piece any dedicated picker panel can wrap around its own
  // getX/setX pair to move from managing ONE instance of a keyword
  // (conditioned as a whole via keywordEditorHtml's own Conditioning
  // toggle - see e.g. colorAttrEditorHtml) to managing MULTIPLE
  // independently-conditioned instances - e.g. COLOR(RED) under indicator
  // 10 and COLOR(GRN) under indicator 20 on the same field. This
  // generalizes indicatorTextRowsHtml/wireIndicatorTextRows just above
  // (fixed-row table, one bare indicator per row, SFL-specific) two ways:
  // full AND/OR conditioning per instance (reusing the SAME
  // conditionsEditorHtml/wireConditionsEditor pair the generic keyword
  // editor's Conditioning toggle already uses, instead of a plain text
  // box), and an arbitrary caller-supplied payload per instance, so it
  // isn't tied to indicator+text shape or the SFL panel.
  //
  // This component owns the repeatable-list shell (add/remove an instance,
  // expand/collapse its Conditioning accordion) and delegates the
  // keyword-specific part entirely to the caller:
  //   - `renderPayload(instance, instIdPrefix)` returns the HTML for one
  //     instance's own fields (e.g. a COLOR select + DSPATR checkboxes) -
  //     called once per instance during rendering.
  //   - `wirePayload(instIdPrefix, instance, updatePayload)` wires those
  //     fields' event listeners - called once per instance after render.
  //     `updatePayload(partialFields)` merges `partialFields` onto that ONE
  //     instance (shallow, e.g. `updatePayload({ parameters: 'RED' })`) and
  //     commits the whole instances array via `onChange`.
  //   - `renderStaging(idPrefix)` (optional) returns HTML for a
  //     PERMANENTLY-VISIBLE "new instance" input row, rendered just above
  //     the "+ Add" button - same shape commandKeysSectionHtml/
  //     wireCommandKeysSection already use for CAxx/CFxx (type/number/
  //     indicator/text inputs sit there always, "+ Add command key" reads
  //     them). This is NOT optional in practice for any instance whose
  //     payload can be entirely empty (e.g. Color & attributes, where "no
  //     color, no attributes" is indistinguishable from "nothing to
  //     write") - creating a blank instance and committing it immediately,
  //     the way an earlier version of this component did, means an empty
  //     instance just evaporates on the very next re-render, since the
  //     document has nothing to re-parse it back out of. Reading a
  //     filled-in staging row instead sidesteps that entirely: nothing
  //     commits until there's something real to write.
  //   - `readNewInstance(idPrefix)` (paired with `renderStaging`) reads
  //     that staging row's current values when "+ Add" is clicked and
  //     returns the new instance to append, or a falsy value to no-op
  //     (mirrors commandKeysSectionHtml's own `if (!number) return;`
  //     validation gate) - e.g. Color & attributes returns falsy when
  //     BOTH the color is blank and no attribute is checked, since that
  //     combination has nothing to add.
  //
  // `instances` is expected in the shape DspfWriter.
  // getRepeatableKeywordInstances returns (or any caller-defined object
  // that carries its own `conditions` array the same way) - this component
  // never reads/writes DDS keyword text itself, only the `conditions`
  // field and whatever `renderPayload`/`wirePayload`/`renderStaging`/
  // `readNewInstance` choose to look at.
  // `idPrefix` follows the same per-owner-uniqueness convention as
  // keywordEditorHtml/indicatorTextRowsHtml above. `expandedSet` is a
  // caller-owned Set of "idPrefix:idx" strings that survives across
  // re-renders (same convention keywordEditorHtml's own Conditioning
  // toggle uses) so the accordion doesn't collapse itself on an unrelated
  // re-render; `rerender` (never `onChange`) is called when a toggle
  // flips, since that's pure UI state, not a document edit.
  // -----------------------------------------------------------------------

  function repeatableConditionedInstancesHtml(instances, idPrefix, renderPayload, expandedSet, addLabel, renderStaging) {
    var list = instances || [];
    var html = '<div id="' + idPrefix + '-instances">';
    if (list.length === 0) {
      html += '<div class="empty-state" style="margin-bottom:6px;">None defined.</div>';
    }
    list.forEach(function (inst, idx) {
      var conditions = inst.conditions || [];
      var condSummary = conditions.length > 0 ? ' (' + conditions.length + ')' : '';
      var isExpanded = !!(expandedSet && expandedSet.has(idPrefix + ':' + idx));
      var instIdPrefix = idPrefix + '-inst' + idx;
      html += '<div class="repeat-inst" data-prefix="' + idPrefix + '" data-idx="' + idx + '">';
      html += '<div class="repeat-inst-main">';
      html += renderPayload(inst, instIdPrefix);
      html += '<span class="repeat-inst-cond-toggle" data-prefix="' + idPrefix + '" data-idx="' + idx + '">Conditioning' + condSummary + (isExpanded ? ' \u25b4' : ' \u25be') + '</span>';
      html += '<button class="repeat-inst-remove" data-prefix="' + idPrefix + '" data-idx="' + idx + '">\u00d7 Remove</button>';
      html += '</div>';
      if (isExpanded) {
        html += '<div class="repeat-inst-cond-body">' + conditionsEditorHtml(conditions, instIdPrefix, expandedSet) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    if (renderStaging) html += renderStaging(idPrefix + '-new');
    html += '<button class="secondary repeat-inst-add" data-prefix="' + idPrefix + '" style="width:100%;margin-top:8px;">' + (addLabel || '+ Add instance') + '</button>';
    return html;
  }

  function wireRepeatableConditionedInstances(idPrefix, instances, onChange, wirePayload, expandedSet, rerender, readNewInstance) {
    var list = instances || [];

    function replaceAt(idx, updater) {
      var next = list.map(function (inst, i) { return i === idx ? updater(inst) : inst; });
      onChange(next);
    }

    document.querySelectorAll('.repeat-inst-remove[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var next = list.slice();
        next.splice(idx, 1);
        onChange(next);
      });
    });

    document.querySelectorAll('.repeat-inst-cond-toggle[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var expandKey = idPrefix + ':' + idx;
      btn.addEventListener('click', function () {
        if (expandedSet.has(expandKey)) expandedSet.delete(expandKey);
        else expandedSet.add(expandKey);
        if (rerender) rerender();
      });
      if (expandedSet && expandedSet.has(expandKey) && list[idx]) {
        wireConditionsEditor(idPrefix + '-inst' + idx, list[idx].conditions, function (newConditions) {
          replaceAt(idx, function (inst) {
            var copy = {};
            for (var k in inst) { if (Object.prototype.hasOwnProperty.call(inst, k)) copy[k] = inst[k]; }
            copy.conditions = newConditions;
            return copy;
          });
        }, expandedSet, rerender);
      }
    });

    if (wirePayload) {
      list.forEach(function (inst, idx) {
        wirePayload(idPrefix + '-inst' + idx, inst, function (partialFields) {
          replaceAt(idx, function (existing) {
            var copy = {};
            for (var k in existing) { if (Object.prototype.hasOwnProperty.call(existing, k)) copy[k] = existing[k]; }
            for (var pk in partialFields) { if (Object.prototype.hasOwnProperty.call(partialFields, pk)) copy[pk] = partialFields[pk]; }
            return copy;
          });
        });
      });
    }

    var addBtn = document.querySelector('.repeat-inst-add[data-prefix="' + idPrefix + '"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var fresh = readNewInstance ? readNewInstance(idPrefix + '-new') : { conditions: [] };
        if (!fresh) return;
        onChange(list.concat([fresh]));
      });
    }
  }

  /** True for a plain SFL (subfile) record - has the SFL keyword but is
   *  NOT an SFLMSG record (SFLMSG records carry SFL too, but get their
   *  own SFLMSG tab from sflMsgPanelsHtml instead of this one, since real
   *  SDA's SFLMSG screen already covers this same ground plus its own
   *  Message Record category - showing both would be redundant). */
  function isSflRecord(rec) {
    return (rec.keywords || []).some(function (k) { return k.name === 'SFL'; }) && !isSflMsgRecord(rec);
  }

  /** Builds Task R3's 2 SFL-specific sub-panels' inner HTML at once -
   *  { general, indicator } - for the record properties panel's SFL tab
   *  (see isSflRecord above for when that tab appears). CHGINPDFT (shown
   *  on real SDA's own "Select Subfile Keywords \u2192 General" screen) is
   *  deliberately NOT repeated here - it's already on Task R1's base
   *  Record Keywords \u2192 General tab, shown for every record type
   *  including SFL, so adding it again here would just be two controls
   *  fighting over the same keyword. */
  function sflKeywordsPanelsHtml(keywords, idPrefix, expandedSet) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    var g = '';
    var fSflnxtchg = DspfWriter.getFileFlagKeyword(kw, 'SFLNXTCHG');
    g += flagRowHtml(p + '-sflnxtchg', 'Return this record on read next changed (SFLNXTCHG)', fSflnxtchg.present, undefined, undefined, fSflnxtchg.conditions, expandedSet);
    var fLogout = DspfWriter.getFileFlagKeyword(kw, 'LOGOUT');
    g += flagRowHtml(p + '-logout', 'Write this record to the job log on output (LOGOUT)', fLogout.present, undefined, undefined, fLogout.conditions, expandedSet);
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    g += flagRowHtml(p + '-loginp', 'Write this record to the job log on input (LOGINP)', fLoginp.present, undefined, undefined, fLoginp.conditions, expandedSet);
    var fKeep = DspfWriter.getFileFlagKeyword(kw, 'KEEP');
    g += flagRowHtml(p + '-keep', 'Keep records on display when closing the file (KEEP)', fKeep.present, undefined, undefined, fKeep.conditions, expandedSet);
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml(p + '-check-ab', 'Allow blanks (CHECK AB)', fCheckAb.present, undefined, undefined, fCheckAb.conditions, expandedSet);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml(p + '-check-rl', 'Move cursor right to left (CHECK RL)', fCheckRl.present, undefined, undefined, fCheckRl.conditions, expandedSet);
    g += '<div class="hint-small">Change input defaults (CHGINPDFT) is on the base Record Keywords \u2192 General tab above - shared across every record type.</div>';
    panels.general = g;

    panels.indicator = indicatorTextRowsHtml(kw, p + '-ind', ['INDTXT', 'SETOF', 'CHANGE'], 6);

    return panels;
  }

  /** Wires every row across both sflKeywordsPanelsHtml() panels. */
  function wireSflKeywordsPanels(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    var p = idPrefix;
    function simple(id, name, hasParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, hasParams ? params : '', undefined, conditions);
      }, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, expandedSet, rerender);
    }
    simple(p + '-sflnxtchg', 'SFLNXTCHG');
    simple(p + '-logout', 'LOGOUT');
    simple(p + '-loginp', 'LOGINP');
    simple(p + '-keep', 'KEEP');
    wireFlagRow(p + '-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, '', 'AB', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'AB').conditions, expandedSet, rerender);
    wireFlagRow(p + '-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, '', 'RL', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'RL').conditions, expandedSet, rerender);
    wireIndicatorTextRows(p + '-ind', ['INDTXT', 'SETOF', 'CHANGE'], 6, getKeywords, onChange);
  }

  /** Wires every row across all 3 sflMsgPanelsHtml() panels - same
   *  "getKeywords is a function so a commit from one row sees any change
   *  a previous commit in the same render already made" contract as
   *  wireFileKeywordsPanels above. */
  function wireSflMsgPanels(getKeywords, onChange, expandedSet, rerender) {
    function simple(id, name, placeholderIsParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, placeholderIsParams ? params : '', undefined, conditions);
      }, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, expandedSet, rerender);
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
    wireFlagRow('sm-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'AB').conditions, expandedSet, rerender);
    wireFlagRow('sm-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'RL').conditions, expandedSet, rerender);
    simple('sm-chginpdft', 'CHGINPDFT', true);

    wireIndicatorTextRows('sm-ind', ['INDTXT', 'SETOF', 'CHANGE'], 6, getKeywords, onChange);
  }

  // -----------------------------------------------------------------------
  // Task R7 - WINDOW-specific picker (Window Parameters: size/roll +
  // Border Parameters/Color/Attributes/Characters - see docs/sda-reference/
  // screens/record-level/window/ and PICKER-SCREENS-PLAN.md). Border
  // Parameters/Color/Attributes/Characters reuse windowBorderPanelHtml/
  // wireWindowBorderPanel above as-is (confirmed identical to the
  // file-level WDWBORDER screen). Window Title already has its own
  // dedicated panel on the record's Basic tab (getWindowTitleText/
  // setWindowTitleText) - not rebuilt here.
  // -----------------------------------------------------------------------

  /** Whether `rec` carries a WINDOW keyword - drives whether
   *  renderRecordProps shows the "Window" tab at all (parallel to
   *  isSflMsgRecord above for the SFLMSG tab). */
  function isWindowRecord(rec) {
    return (rec.keywords || []).some(function (k) { return k.name === 'WINDOW'; });
  }

  /**
   * Builds the 2 Window sub-panels' inner HTML at once - { windowParameters,
   * borderParameters } - for the record properties panel's Window tab (see
   * isWindowRecord above for when that tab appears). `idPrefix` namespaces
   * every element id, same reasoning as recordKeywordsPanelsHtml.
   */
  function windowPanelsHtml(keywords, idPrefix, expandedSet) {
    var panels = {};

    // --- Window Parameters (the WINDOW keyword's own parameters) ---
    var geom = DspfWriter.getWindowParamsKeyword(keywords);
    var mode = geom.mode === 'none' ? 'positioned' : geom.mode; // no WINDOW yet -> default to filling in an explicit position
    var wp = '<div class="section-label">Window definition</div>';
    [
      ['reference', 'Referenced window - inherit another WINDOW record\u2019s geometry'],
      ['sized', 'Default start positioning - system positions it, you set the size'],
      ['positioned', 'Start line / Start position - explicit top-left position and size'],
    ].forEach(function (opt) {
      wp += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;"><input type="radio" name="' + idPrefix + '-mode" class="' + idPrefix + '-mode" value="' + opt[0] + '" ' + (mode === opt[0] ? 'checked' : '') + ' /> ' + opt[1] + '</label>';
    });
    wp += '<div class="' + idPrefix + '-mode-reference" style="margin-top:6px;' + (mode === 'reference' ? '' : 'display:none;') + '"><input type="text" id="' + idPrefix + '-reference" placeholder="Referenced window record name" value="' + escapeHtml(geom.referenceName || '') + '" style="width:100%;" /></div>';
    wp += '<div class="' + idPrefix + '-mode-position" style="margin-top:6px;' + (mode === 'positioned' ? '' : 'display:none;') + '"><div class="two-col"><input type="text" id="' + idPrefix + '-startline" placeholder="Start line (1-25, or a field name)" value="' + escapeHtml(geom.startLine || '') + '" /><input type="text" id="' + idPrefix + '-startcol" placeholder="Start position (1-128, or a field name)" value="' + escapeHtml(geom.startColumn || '') + '" /></div></div>';
    wp += '<div class="' + idPrefix + '-mode-size" style="margin-top:6px;' + (mode === 'reference' ? 'display:none;' : '') + '"><div class="two-col"><input type="text" id="' + idPrefix + '-lines" placeholder="Window lines (1-25)" value="' + escapeHtml(geom.lines || '') + '" /><input type="text" id="' + idPrefix + '-cols" placeholder="Window position/width (1-128)" value="' + escapeHtml(geom.columns || '') + '" /></div></div>';
    // Task L6 - "Message line" row (WINDOW's own optional trailing
    // *MSGLIN/*NOMSGLIN token - see DspfWriter.getWindowParamsKeyword's
    // doc comment). Not offered on the bare "Referenced window" form,
    // same reasoning the size/position fields above already hide for it.
    wp += '<div class="' + idPrefix + '-msgline-wrap" style="margin-top:6px;' + (mode === 'reference' ? 'display:none;' : '') + '"><label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" id="' + idPrefix + '-msgline" ' + (geom.msgLine === false ? '' : 'checked') + ' /> Message line (reserve the window\u2019s own last line for messages)</label></div>';
    // Task L7 - "Restrict cursor to window" is WINDOW's own optional
    // trailing *RSTCSR/*NORSTCSR token (see DspfWriter.getWindowParamsKeyword's
    // doc comment), NOT a standalone keyword - it lives on this same
    // Window Parameters panel/Apply button, right next to Message line,
    // rather than as its own independently-committed flag row.
    wp += '<div class="' + idPrefix + '-rstcsr-wrap" style="margin-top:6px;' + (mode === 'reference' ? 'display:none;' : '') + '"><label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" id="' + idPrefix + '-rstcsr" ' + (geom.rstcsr === false ? '' : 'checked') + ' /> Restrict cursor to window (beep and snap the cursor back when it leaves the window)</label></div>';
    if (geom.mode === 'other') {
      wp += '<div class="hint-small">This record\u2019s WINDOW keyword has a parameter shape the picker doesn\u2019t recognize (' + escapeHtml(geom.raw) + ') - edit it via the raw Keywords editor below instead of this panel.</div>';
    }
    wp += '<button class="secondary" id="' + idPrefix + '-apply" style="width:100%;margin-top:10px;">Apply window parameters</button>';
    wp += '<div class="hint-small">Real SDA\u2019s Window Parameters screen also shows per-row "Display size"/"Roll" columns - "Roll" is SDA\u2019s own in-terminal editing convenience (not a DDS keyword), and "Display size" conditions a value by *DS3/*DS4 (multiple conditioned keyword instances, the same cross-cutting limitation R1/F1/D1 already defer) - both still left for the raw Keywords editor. "Message line" and "Restrict cursor to window" are now modeled above (Tasks L6/L7).</div>';
    panels.windowParameters = wp;

    // --- Border Parameters (shared with F1's file-level Window Border) ---
    panels.borderParameters = windowBorderPanelHtml(keywords, idPrefix + '-wdw');

    return panels;
  }

  /** Wires both windowPanelsHtml() panels. Same `getKeywords`/`onChange`
   *  contract every other dedicated picker here uses. */
  function wireWindowPanels(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    // Window Parameters
    document.querySelectorAll('.' + idPrefix + '-mode').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var refDiv = document.querySelector('.' + idPrefix + '-mode-reference');
        var posDiv = document.querySelector('.' + idPrefix + '-mode-position');
        var sizeDiv = document.querySelector('.' + idPrefix + '-mode-size');
        var msglineDiv = document.querySelector('.' + idPrefix + '-msgline-wrap');
        var rstcsrDiv = document.querySelector('.' + idPrefix + '-rstcsr-wrap');
        if (refDiv) refDiv.style.display = radio.value === 'reference' ? '' : 'none';
        if (posDiv) posDiv.style.display = radio.value === 'positioned' ? '' : 'none';
        if (sizeDiv) sizeDiv.style.display = radio.value === 'reference' ? 'none' : '';
        if (msglineDiv) msglineDiv.style.display = radio.value === 'reference' ? 'none' : '';
        if (rstcsrDiv) rstcsrDiv.style.display = radio.value === 'reference' ? 'none' : '';
      });
    });
    var wpApply = document.getElementById(idPrefix + '-apply');
    if (wpApply) {
      wpApply.addEventListener('click', function () {
        var modeEl = document.querySelector('.' + idPrefix + '-mode:checked');
        var msglineEl = document.getElementById(idPrefix + '-msgline');
        var rstcsrEl = document.getElementById(idPrefix + '-rstcsr');
        var state = {
          mode: modeEl ? modeEl.value : 'positioned',
          referenceName: document.getElementById(idPrefix + '-reference').value,
          startLine: document.getElementById(idPrefix + '-startline').value,
          startColumn: document.getElementById(idPrefix + '-startcol').value,
          lines: document.getElementById(idPrefix + '-lines').value,
          columns: document.getElementById(idPrefix + '-cols').value,
          msgLine: msglineEl ? msglineEl.checked : true,
          rstcsr: rstcsrEl ? rstcsrEl.checked : true,
        };
        onChange(DspfWriter.setWindowParamsKeyword(getKeywords(), state));
      });
    }

    // Border Parameters
    wireWindowBorderPanel(idPrefix + '-wdw', getKeywords, onChange);
  }

  // -----------------------------------------------------------------------
  // Task R10 - PULLDOWN-specific picker (General keywords - PULLDOWN's own
  // *SLTIND/*RSTCSR sub-flags - plus Window borders/WDWBORDER - see
  // docs/sda-reference/screens/record-level/pulldown-puldwn/ and
  // PICKER-SCREENS-PLAN.md). Border Parameters reuse windowBorderPanelHtml/
  // wireWindowBorderPanel above as-is, same reasoning R7's Window tab
  // already takes for the identical screen. "Select record keywords" (R1's
  // base 8 categories) needs no wiring of its own here - renderRecordProps'
  // Keywords tab already shows recordKeywordsPanelsHtml for every record
  // type except USRDFN, so a PULLDOWN record gets it automatically.
  // -----------------------------------------------------------------------

  /** Whether `rec` carries a PULLDOWN keyword - drives whether
   *  renderRecordProps shows the "Pull-down" tab at all (parallel to
   *  isWindowRecord above for the Window tab). */
  function isPulldownRecord(rec) {
    return (rec.keywords || []).some(function (k) { return k.name === 'PULLDOWN'; });
  }

  /**
   * Builds the 2 Pull-down sub-panels' inner HTML at once - { general,
   * borderParameters } - for the record properties panel's Pull-down tab
   * (see isPulldownRecord above for when that tab appears). `idPrefix`
   * namespaces every element id, same reasoning windowPanelsHtml takes.
   */
  function pulldownPanelsHtml(keywords, idPrefix) {
    var panels = {};

    // --- General (PULLDOWN's own *SLTIND/*RSTCSR sub-flags) ---
    var pd = DspfWriter.getPulldownKeyword(keywords);
    var g = '<div class="section-label">Pull-down (PULLDOWN)</div>';
    g += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="' + idPrefix + '-on" ' + (pd.present ? 'checked' : '') + ' /> Pull-down record</label>';
    g += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;padding-left:16px;"><input type="checkbox" id="' + idPrefix + '-sltind" ' + (pd.sltind ? 'checked' : '') + ' /> Selection indicators (*SLTIND)</label>';
    g += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;padding-left:16px;"><input type="checkbox" id="' + idPrefix + '-rstcsr" ' + (pd.rstcsr ? 'checked' : '') + ' /> Restrict cursor to pull-down (*RSTCSR)</label>';
    panels.general = g;

    // --- Border Parameters (shared with F1/R7's Window Border) ---
    panels.borderParameters = windowBorderPanelHtml(keywords, idPrefix + '-wdw');

    return panels;
  }

  /** Wires both pulldownPanelsHtml() panels. Same `getKeywords`/`onChange`
   *  contract every other dedicated picker here uses. */
  function wirePulldownPanels(idPrefix, getKeywords, onChange) {
    function commitGeneral() {
      var on = document.getElementById(idPrefix + '-on');
      var sltind = document.getElementById(idPrefix + '-sltind');
      var rstcsr = document.getElementById(idPrefix + '-rstcsr');
      onChange(DspfWriter.setPulldownKeyword(getKeywords(), on.checked, sltind.checked, rstcsr.checked));
    }
    var on = document.getElementById(idPrefix + '-on');
    var sltind = document.getElementById(idPrefix + '-sltind');
    var rstcsr = document.getElementById(idPrefix + '-rstcsr');
    if (on) on.addEventListener('change', commitGeneral);
    if (sltind) sltind.addEventListener('change', commitGeneral);
    if (rstcsr) rstcsr.addEventListener('change', commitGeneral);

    // Border Parameters
    wireWindowBorderPanel(idPrefix + '-wdw', getKeywords, onChange);
  }

  // -----------------------------------------------------------------------
  // Task R4 - SFLCTL-specific picker (Subfile Control menu: General/
  // Display Layout/Subfile Messages - see docs/sda-reference/screens/
  // record-level/subfile-control-sflctl/ and PICKER-SCREENS-PLAN.md).
  // Indicator reuses indicatorTextRowsHtml/wireIndicatorTextRows (R3) as-is
  // for the same INDTXT/SETOF/CHANGE rows - see dspfWriter.js's own Task R4
  // section comment for why these apply to SFLCTL too, and why SFLMSG/
  // SFLMSGID are single-instance here rather than repeatable despite the
  // real screen showing 4 blank rows of each.
  // -----------------------------------------------------------------------

  /** Whether `rec` is a subfile CONTROL record - carries SFLCTL, distinct
   *  from isSflRecord above (which is the plain SFL DETAIL record and
   *  explicitly excludes SFLMSG records). Drives whether renderRecordProps
   *  shows the "SFLCTL" tab at all. */
  function isSflCtlRecord(rec) {
    return (rec.keywords || []).some(function (k) { return k.name === 'SFLCTL'; });
  }

  /**
   * Builds the 4 SFLCTL sub-panels' inner HTML at once - { general,
   * indicator, displayLayout, subfileMessages } - for the record
   * properties panel's SFLCTL tab (see isSflCtlRecord above for when that
   * tab appears). `idPrefix` namespaces every element id.
   */
  function sflCtlPanelsHtml(keywords, idPrefix, expandedSet) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    // --- General (SFLCTL's own keywords + R3's Subfile Keywords, reused) ---
    var g = '<div class="section-label">Subfile control</div>';
    var fSflctl = DspfWriter.getFileFlagKeyword(kw, 'SFLCTL');
    g += flagRowHtml(p + '-sflctl', 'Related subfile record (SFLCTL)', fSflctl.present, fSflctl.parameters, 'subfile record name', fSflctl.conditions, expandedSet);
    var fSflcsrrrn = DspfWriter.getFileFlagKeyword(kw, 'SFLCSRRRN');
    g += flagRowHtml(p + '-sflcsrrrn', 'Subfile cursor relative record number field (SFLCSRRRN)', fSflcsrrrn.present, fSflcsrrrn.parameters, 'field name', fSflcsrrrn.conditions, expandedSet);
    var fSflmode = DspfWriter.getFileFlagKeyword(kw, 'SFLMODE');
    g += flagRowHtml(p + '-sflmode', 'Subfile mode field (SFLMODE)', fSflmode.present, fSflmode.parameters, 'field name', fSflmode.conditions, expandedSet);
    g += '<div class="section-label">Subfile display state</div>';
    var fSfldsp = DspfWriter.getFileFlagKeyword(kw, 'SFLDSP');
    g += flagRowHtml(p + '-sfldsp', 'Display subfile records (SFLDSP)', fSfldsp.present, undefined, undefined, fSfldsp.conditions, expandedSet);
    var fSfldspctl = DspfWriter.getFileFlagKeyword(kw, 'SFLDSPCTL');
    g += flagRowHtml(p + '-sfldspctl', 'Display control record (SFLDSPCTL)', fSfldspctl.present, undefined, undefined, fSfldspctl.conditions, expandedSet);
    var fSflinz = DspfWriter.getFileFlagKeyword(kw, 'SFLINZ');
    g += flagRowHtml(p + '-sflinz', 'Initialize subfile fields (SFLINZ)', fSflinz.present, undefined, undefined, fSflinz.conditions, expandedSet);
    var fSfldlt = DspfWriter.getFileFlagKeyword(kw, 'SFLDLT');
    g += flagRowHtml(p + '-sfldlt', 'Delete subfile area (SFLDLT)', fSfldlt.present, undefined, undefined, fSfldlt.conditions, expandedSet);
    var fSflclr = DspfWriter.getFileFlagKeyword(kw, 'SFLCLR');
    g += flagRowHtml(p + '-sflclr', 'Clear subfile records (SFLCLR)', fSflclr.present, undefined, undefined, fSflclr.conditions, expandedSet);
    var fSflrna = DspfWriter.getFileFlagKeyword(kw, 'SFLRNA');
    g += flagRowHtml(p + '-sflrna', 'Record not active (SFLRNA)', fSflrna.present, undefined, undefined, fSflrna.conditions, expandedSet);
    var fSflend = DspfWriter.getFileFlagKeyword(kw, 'SFLEND');
    g += flagRowHtml(p + '-sflend', 'Indicate more records (SFLEND)', fSflend.present, fSflend.parameters, '*MORE, *SCRBAR, or blank', fSflend.conditions, expandedSet);
    g += '<div class="section-label">Subfile behavior</div>';
    var fSfldrop = DspfWriter.getFileFlagKeyword(kw, 'SFLDROP');
    g += flagRowHtml(p + '-sfldrop', 'Subfile initially truncated (SFLDROP)', fSfldrop.present, fSfldrop.parameters, 'CFnn or CAnn', fSfldrop.conditions, expandedSet);
    var fSflfold = DspfWriter.getFileFlagKeyword(kw, 'SFLFOLD');
    g += flagRowHtml(p + '-sflfold', 'Subfile initially folded (SFLFOLD)', fSflfold.present, fSflfold.parameters, 'CFnn or CAnn', fSflfold.conditions, expandedSet);
    var fSflenter = DspfWriter.getFileFlagKeyword(kw, 'SFLENTER');
    g += flagRowHtml(p + '-sflenter', 'Use instead of Enter key (SFLENTER)', fSflenter.present, fSflenter.parameters, 'CFnn or CAnn', fSflenter.conditions, expandedSet);
    g += '<div class="section-label">Subfile Keywords (shared with plain SFL records)</div>';
    var fSflnxtchg = DspfWriter.getFileFlagKeyword(kw, 'SFLNXTCHG');
    g += flagRowHtml(p + '-sflnxtchg', 'Return this record on read next changed (SFLNXTCHG)', fSflnxtchg.present, undefined, undefined, fSflnxtchg.conditions, expandedSet);
    var fLogout = DspfWriter.getFileFlagKeyword(kw, 'LOGOUT');
    g += flagRowHtml(p + '-logout', 'Write this record to the job log on output (LOGOUT)', fLogout.present, undefined, undefined, fLogout.conditions, expandedSet);
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    g += flagRowHtml(p + '-loginp', 'Write this record to the job log on input (LOGINP)', fLoginp.present, undefined, undefined, fLoginp.conditions, expandedSet);
    var fKeep = DspfWriter.getFileFlagKeyword(kw, 'KEEP');
    g += flagRowHtml(p + '-keep', 'Keep records on display when closing the file (KEEP)', fKeep.present, undefined, undefined, fKeep.conditions, expandedSet);
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml(p + '-check-ab', 'Allow blanks (CHECK AB)', fCheckAb.present, undefined, undefined, fCheckAb.conditions, expandedSet);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml(p + '-check-rl', 'Move cursor right to left (CHECK RL)', fCheckRl.present, undefined, undefined, fCheckRl.conditions, expandedSet);
    g += '<div class="hint-small">Change input defaults (CHGINPDFT) is on the base Record Keywords \u2192 General tab above - shared across every record type.</div>';
    panels.general = g;

    // --- Indicator (Task L5d - SFLCTL's own real "Define Indicator
    // Keywords" screen, docs/sda-reference/screens/record-level/
    // base-record-keywords/indicator/image41.png, shows the SAME fuller
    // repeatable keyword set as the base record's own version of this
    // screen (image19.png) - CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN/
    // VLDCMDKEY/SETOF/CHANGE/INDTXT, not the narrower INDTXT/SETOF/CHANGE-
    // only screen SFL/SFLMSG/PDNSFLCTL get (see indicatorTextRowsHtml's
    // own doc comment) - so this now reuses the same
    // recordIndicatorInstancesHtml/wireRecordIndicatorInstances pair the
    // base Record Keywords panel uses, replacing the too-narrow R3 table
    // this tab used before. ---
    panels.indicator = '<div class="status" style="margin-bottom:10px;">Each row below is independently conditioned and repeatable - add as many as needed, e.g. two CLEAR rows under different indicators.</div>' +
      recordIndicatorInstancesHtml(kw, p + '-recind', expandedSet);

    // --- Display Layout ---
    var layout = DspfWriter.getSflDisplayLayout(kw);
    var dl = '<div class="field-row"><label>Records in subfile (SFLSIZ)</label><input type="text" id="' + p + '-sflsiz" placeholder="number, or a field name" value="' + escapeHtml(layout.sflsiz) + '" /></div>';
    dl += '<div class="field-row"><label>Records per display (SFLPAG)</label><input type="text" id="' + p + '-sflpag" placeholder="number, or a field name" value="' + escapeHtml(layout.sflpag) + '" /></div>';
    dl += '<div class="field-row"><label>Spaces between records (SFLLIN)</label><input type="text" id="' + p + '-sfllin" placeholder="0 or 1" value="' + escapeHtml(layout.sfllin) + '" /></div>';
    dl += '<button class="secondary" id="' + p + '-layout-apply" style="width:100%;margin-top:8px;">Apply display layout</button>';
    panels.displayLayout = dl;

    // --- Subfile Messages (Task L1c - repeatable, independently
    // conditioned SFLMSG/SFLMSGID instances via the generic L1 component;
    // see dspfWriter.js's own Task L1c section comment for why these two
    // are NOT paired into one shared instance list the way e.g. a future
    // Color & attributes picker would pair COLOR+DSPATR - SFLMSG and
    // SFLMSGID each repeat independently in real DDS). ---
    var sflMsgInstances = DspfWriter.getRepeatableKeywordInstances(kw, ['SFLMSG']);
    var sflMsgIdInstances = DspfWriter.getRepeatableKeywordInstances(kw, ['SFLMSGID']);
    var sm = '<div class="section-label">Message text (SFLMSG)</div>';
    sm += repeatableConditionedInstancesHtml(sflMsgInstances, p + '-sflmsg-rep', function (inst, instIdPrefix) {
      return '<input type="text" id="' + instIdPrefix + '-text" placeholder="message text" value="' + escapeHtml(DspfWriter.unquoteDdsLiteral(inst.parameters)) + '" style="width:100%;" />';
    }, expandedSet, '+ Add SFLMSG instance');
    sm += '<div class="section-label" style="margin-top:14px;">Message ID (SFLMSGID)</div>';
    sm += repeatableConditionedInstancesHtml(sflMsgIdInstances, p + '-sflmsgid-rep', function (inst, instIdPrefix) {
      var parsed = DspfWriter.parseSflMsgIdParams(inst.parameters);
      var html = '<div class="two-col">';
      html += '<input type="text" id="' + instIdPrefix + '-id" placeholder="message ID" value="' + escapeHtml(parsed.msgId) + '" />';
      html += '<input type="text" id="' + instIdPrefix + '-file" placeholder="message file" value="' + escapeHtml(parsed.msgFile) + '" />';
      html += '</div>';
      html += '<input type="text" id="' + instIdPrefix + '-lib" placeholder="library (optional)" value="' + escapeHtml(parsed.library) + '" style="width:100%;margin-top:4px;" />';
      return html;
    }, expandedSet, '+ Add SFLMSGID instance');
    sm += '<div class="hint-small">Each instance above is independently conditioned (its own Conditioning toggle) - add as many as needed for different messages/message-IDs under different indicators. Real SDA also shows "Ind"/"Name" columns for SFLMSGID beyond msgid/message-file/library - not modeled here (getting a keyword\'s parameter order wrong risks writing invalid DDS); use the raw Keywords editor below for those.</div>';
    panels.subfileMessages = sm;

    return panels;
  }

  /** Wires every row across all 4 sflCtlPanelsHtml() panels. Same
   *  `getKeywords`/`onChange` contract every other dedicated picker here
   *  uses. */
  function wireSflCtlPanels(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    var p = idPrefix;

    // General
    wireFlagRow(p + '-sflctl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLCTL', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLCTL').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflcsrrrn', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLCSRRRN', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLCSRRRN').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflmode', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLMODE', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLMODE').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sfldsp', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDSP', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDSP').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sfldspctl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDSPCTL', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDSPCTL').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflinz', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLINZ', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLINZ').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sfldlt', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDLT', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDLT').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflclr', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLCLR', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLCLR').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflrna', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLRNA', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLRNA').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflend', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLEND', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLEND').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sfldrop', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDROP', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDROP').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflfold', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLFOLD', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLFOLD').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflenter', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLENTER', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLENTER').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflnxtchg', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLNXTCHG', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLNXTCHG').conditions, expandedSet, rerender);
    wireFlagRow(p + '-logout', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'LOGOUT', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'LOGOUT').conditions, expandedSet, rerender);
    wireFlagRow(p + '-loginp', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'LOGINP', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'LOGINP').conditions, expandedSet, rerender);
    wireFlagRow(p + '-keep', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'KEEP', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'KEEP').conditions, expandedSet, rerender);
    wireFlagRow(p + '-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'AB').conditions, expandedSet, rerender);
    wireFlagRow(p + '-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'RL').conditions, expandedSet, rerender);

    // Indicator (Task L5d)
    wireRecordIndicatorInstances(getKeywords(), onChange, p + '-recind', expandedSet, rerender);

    // Display Layout
    var layoutApply = document.getElementById(p + '-layout-apply');
    if (layoutApply) {
      layoutApply.addEventListener('click', function () {
        var state = {
          sflsiz: document.getElementById(p + '-sflsiz').value,
          sflpag: document.getElementById(p + '-sflpag').value,
          sfllin: document.getElementById(p + '-sfllin').value,
        };
        onChange(DspfWriter.setSflDisplayLayout(getKeywords(), state));
      });
    }

    // Subfile Messages (Task L1c)
    wireRepeatableConditionedInstances(p + '-sflmsg-rep', DspfWriter.getRepeatableKeywordInstances(getKeywords(), ['SFLMSG']), function (nextInstances) {
      onChange(DspfWriter.setRepeatableKeywordInstances(getKeywords(), ['SFLMSG'], nextInstances));
    }, function (instIdPrefix, inst, updatePayload) {
      var input = document.getElementById(instIdPrefix + '-text');
      if (!input) return;
      input.addEventListener('change', function () {
        updatePayload({ parameters: DspfWriter.quoteDdsLiteral(input.value) });
      });
    }, expandedSet, rerender, function makeDefaultSflMsg() {
      // Non-blank placeholder text, not '' - unlike Error messages (Task
      // L1b, see makeDefaultInstance's own comment above), a blank SFLMSG
      // wouldn't vanish on the next re-render (setRepeatableKeywordInstances
      // writes every instance unconditionally, blank or not) - but it WOULD
      // write a bare `SFLMSG` keyword with no parameter at all, which is
      // invalid DDS (SFLMSG requires a quoted message-text parameter). Same
      // fix as L1b's, different failure mode it prevents.
      return { name: 'SFLMSG', parameters: DspfWriter.quoteDdsLiteral('New message'), conditions: [] };
    });

    wireRepeatableConditionedInstances(p + '-sflmsgid-rep', DspfWriter.getRepeatableKeywordInstances(getKeywords(), ['SFLMSGID']), function (nextInstances) {
      onChange(DspfWriter.setRepeatableKeywordInstances(getKeywords(), ['SFLMSGID'], nextInstances));
    }, function (instIdPrefix, inst, updatePayload) {
      var idInput = document.getElementById(instIdPrefix + '-id');
      var fileInput = document.getElementById(instIdPrefix + '-file');
      var libInput = document.getElementById(instIdPrefix + '-lib');
      if (!idInput || !fileInput || !libInput) return;
      function commit() {
        var formatted = DspfWriter.formatSflMsgIdParams({ msgId: idInput.value, msgFile: fileInput.value, library: libInput.value });
        // Mirrors the superseded setSflMsgId's own guarantee: never write an
        // incomplete SFLMSGID (blank msgId or msgFile is invalid DDS - a
        // keyword needs SOME parameter). formatSflMsgIdParams returns '' in
        // that case; skip the commit entirely rather than writing a blank-
        // parameters instance - the instance card stays in the UI mid-edit
        // (so the user can keep typing), it just doesn't hit the document
        // until both fields are filled. Deliberately blanking it back out
        // is what the card's own Remove (\u00d7) button is for.
        if (!formatted) return;
        updatePayload({ parameters: formatted });
      }
      idInput.addEventListener('change', commit);
      fileInput.addEventListener('change', commit);
      libInput.addEventListener('change', commit);
    }, expandedSet, rerender, function makeDefaultSflMsgId() {
      // Same non-blank-placeholder reasoning as makeDefaultSflMsg above,
      // and matching L1b's own 'MSGID'/'MSGFILE' convention for ERRMSGID -
      // formatSflMsgIdParams needs BOTH msgId and msgFile non-blank to
      // produce anything at all, so a blank default here would leave the
      // freshly-added instance's commit() guard (above) skipping every
      // change until the user fills both fields from scratch anyway;
      // seeding valid placeholders means the instance is immediately
      // syntactically valid DDS, ready to be overwritten.
      return { name: 'SFLMSGID', parameters: DspfWriter.formatSflMsgIdParams({ msgId: 'MSGID', msgFile: 'MSGFILE' }), conditions: [] };
    });
  }

  // -----------------------------------------------------------------------
  // Task R13 - MNUBAR-specific picker (General + Menu-Bar Display Keywords -
  // see docs/sda-reference/screens/record-level/menu-bar-record-mnubar/ and
  // PICKER-SCREENS-PLAN.md). Menu-Bar Display Keywords (MNUBARDSP) is
  // deliberately NOT rebuilt here - it's already on Task R1's base Record
  // Keywords -> General tab (present for every record type including
  // MNUBAR, via the existing flag+free-text-parameters row), and real
  // SDA's own "Select Menu-Bar Record Keywords" menu (_menu/image148.png)
  // only lists General + Select record keywords anyway - the dedicated
  // "Define Menu-Bar Display Keywords" sub-screen is reached FROM
  // MNUBARDSP's own "Select parameters" flag, not a separate top-level
  // category, so R1's existing free-text parameters box already reaches
  // it (its one sub-field, "Pull-down input field" - a field name - fits
  // there directly). MNUBARSW/MNUCNL reuse menuBarKeysPanelHtml/
  // wireMenuBarKeysPanel above as-is (confirmed identical to the
  // file-level Menu-bar screen, just scoped to the record's own
  // keywords).
  //
  // MNUBAR itself (the record-defining keyword) is modeled as a plain
  // present/absent flag with an optional free-text parameter - the real
  // screen's "Display separator" sub-row wasn't confidently matched to a
  // specific literal DDS parameter value, so it's left reachable through
  // that free-text box (or the raw Keywords editor) rather than guessed
  // at, same fallback this codebase uses for every other keyword whose
  // exact argument shape isn't nailed down.
  // -----------------------------------------------------------------------

  /** Whether `rec` is a menu-bar record - carries the MNUBAR keyword.
   *  Drives whether renderRecordProps shows the "MNUBAR" tab at all. */
  function isMnuBarRecord(rec) {
    return (rec.keywords || []).some(function (k) { return k.name === 'MNUBAR'; });
  }

  /**
   * Builds the MNUBAR tab's single General sub-panel's inner HTML - just
   * { general } for symmetry with the other record-type-specific panel
   * builders (see isMnuBarRecord above for when the tab appears).
   */
  function mnuBarPanelsHtml(keywords, idPrefix, expandedSet) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    var mnubar = DspfWriter.getFileFlagKeyword(kw, 'MNUBAR');
    var g = flagRowHtml(p + '-mnubar', 'Menu-bar (MNUBAR)', mnubar.present, mnubar.parameters, 'parameters (optional - e.g. the display-separator value)', mnubar.conditions, expandedSet);
    g += '<div class="hint-small">Real SDA\u2019s own screen shows a separate "Display separator" toggle here - its exact DDS parameter value wasn\u2019t confidently verified, so use the parameters box above or the raw Keywords editor below if you need it.</div>';
    g += '<div class="section-label" style="margin-top:14px;"></div>';
    g += menuBarKeysPanelHtml(kw, p, expandedSet);
    g += '<div class="hint-small">Menu-Bar display (MNUBARDSP) is on the base Record Keywords \u2192 General tab above - shared across every record type.</div>';
    panels.general = g;

    return panels;
  }

  /** Wires the mnuBarPanelsHtml() panel. Same `getKeywords`/`onChange`
   *  contract every other dedicated picker here uses. */
  function wireMnuBarPanels(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    wireFlagRow(idPrefix + '-mnubar', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'MNUBAR', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'MNUBAR').conditions, expandedSet, rerender);
    wireMenuBarKeysPanel(idPrefix, getKeywords, onChange, expandedSet, rerender);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    rebuildRecordSelect: rebuildRecordSelect,
    recordTypeDependentInfo: recordTypeDependentInfo,
    RECORD_TYPES: RECORD_TYPES,
    isSflFamilyRecordType: isSflFamilyRecordType,
    buildTypedRecordPlan: buildTypedRecordPlan,
    missingDependentMessage: missingDependentMessage,
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
    colorAttrStatesHtml: colorAttrStatesHtml,
    wireColorAttrStatesEditor: wireColorAttrStatesEditor,
    validityAndEditHtml: validityAndEditHtml,
    wireValidityAndEdit: wireValidityAndEdit,
    validityCheckInstancesHtml: validityCheckInstancesHtml,
    wireValidityCheckInstances: wireValidityCheckInstances,
    recordIndicatorInstancesHtml: recordIndicatorInstancesHtml,
    wireRecordIndicatorInstances: wireRecordIndicatorInstances,
    errorMessageInstancesHtml: errorMessageInstancesHtml,
    wireErrorMessageInstances: wireErrorMessageInstances,
    fileKeywordsPanelsHtml: fileKeywordsPanelsHtml,
    wireFileKeywordsPanels: wireFileKeywordsPanels,
    recordKeywordsPanelsHtml: recordKeywordsPanelsHtml,
    wireRecordKeywordsPanels: wireRecordKeywordsPanels,
    applicationHelpFieldsHtml: applicationHelpFieldsHtml,
    wireApplicationHelpFields: wireApplicationHelpFields,
    keyingOptionsHtml: keyingOptionsHtml,
    fieldKeywordCategoryVisibility: fieldKeywordCategoryVisibility,
    wireKeyingOptionsEditor: wireKeyingOptionsEditor,
    inputKeywordsHtml: inputKeywordsHtml,
    wireInputKeywordsEditor: wireInputKeywordsEditor,
    generalFieldKeywordsHtml: generalFieldKeywordsHtml,
    wireGeneralFieldKeywordsEditor: wireGeneralFieldKeywordsEditor,
    referenceOverridesHtml: referenceOverridesHtml,
    wireReferenceOverridesEditor: wireReferenceOverridesEditor,
    messageIdInstancesHtml: messageIdInstancesHtml,
    wireMessageIdInstancesEditor: wireMessageIdInstancesEditor,
    subfileFieldKeywordsHtml: subfileFieldKeywordsHtml,
    wireSubfileFieldKeywords: wireSubfileFieldKeywords,
    menuBarChoicesHtml: menuBarChoicesHtml,
    wireMenuBarChoicesEditor: wireMenuBarChoicesEditor,
    menuBarSeparatorHtml: menuBarSeparatorHtml,
    wireMenuBarSeparatorEditor: wireMenuBarSeparatorEditor,
    choiceSelectionTypeHtml: choiceSelectionTypeHtml,
    wireChoiceSelectionTypeEditor: wireChoiceSelectionTypeEditor,
    choiceKeywordsListHtml: choiceKeywordsListHtml,
    wireChoiceKeywordsListEditor: wireChoiceKeywordsListEditor,
    choiceColorStatesHtml: choiceColorStatesHtml,
    wireChoiceColorStatesEditor: wireChoiceColorStatesEditor,
    isSflMsgRecord: isSflMsgRecord,
    isUsrDfnRecord: isUsrDfnRecord,
    sflMsgPanelsHtml: sflMsgPanelsHtml,
    wireSflMsgPanels: wireSflMsgPanels,
    windowBorderPanelHtml: windowBorderPanelHtml,
    wireWindowBorderPanel: wireWindowBorderPanel,
    isWindowRecord: isWindowRecord,
    windowPanelsHtml: windowPanelsHtml,
    wireWindowPanels: wireWindowPanels,
    isPulldownRecord: isPulldownRecord,
    pulldownPanelsHtml: pulldownPanelsHtml,
    wirePulldownPanels: wirePulldownPanels,
    isSflCtlRecord: isSflCtlRecord,
    sflCtlPanelsHtml: sflCtlPanelsHtml,
    wireSflCtlPanels: wireSflCtlPanels,
    isMnuBarRecord: isMnuBarRecord,
    mnuBarPanelsHtml: mnuBarPanelsHtml,
    wireMnuBarPanels: wireMnuBarPanels,
    isSflRecord: isSflRecord,
    sflKeywordsPanelsHtml: sflKeywordsPanelsHtml,
    wireSflKeywordsPanels: wireSflKeywordsPanels,
    indicatorTextRowsHtml: indicatorTextRowsHtml,
    wireIndicatorTextRows: wireIndicatorTextRows,
    repeatableConditionedInstancesHtml: repeatableConditionedInstancesHtml,
    wireRepeatableConditionedInstances: wireRepeatableConditionedInstances,
  };
});

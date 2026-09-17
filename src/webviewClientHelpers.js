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
   * A collapsible <details> wrapper, identical markup to
   * buildWebviewTemplate.js's own accordionHtml() (props-accordion /
   * props-accordion-body classes, data-accordion-key attribute, and the
   * same open/closed persistence contract - see that function's own doc
   * comment for the full story on why this needed to exist at all: the
   * props panel fully re-renders on every commit, so without SOME memory
   * of what the person had open, every accordion snaps shut again on the
   * very next edit inside it). `openState` is optional and Map-like (only
   * `.has(key)`/`.get(key)` are used) - the caller passes its own
   * accordionOpenState through; omitted entirely (as every Node-based
   * unit test in src/test/ that calls colorAttrStatesHtml et al directly
   * does), this just falls back to `openByDefault` every time, same as
   * before this existed.
   * Duplicated as a small local helper rather than calling
   * buildWebviewTemplate.js's copy directly: that copy is a plain
   * top-level function declaration inside the webview's OWN inline
   * <script> tag, not something this module exports/imports - in the
   * browser the two happen to share one global scope, but this file is
   * also require()'d directly under plain Node for the test suite, where
   * no such global (or its accordionOpenState) exists. The native
   * <details> toggle events these emit are picked up by ONE delegated
   * listener buildWebviewTemplate.js wires on `document` (not per-file,
   * not per-render) - it doesn't care which file generated the markup, so
   * these behave identically to buildWebviewTemplate.js's own accordions
   * without this file needing any listener-wiring of its own.
   */
  function accordionWrapHtml(key, label, bodyHtml, openByDefault, openState) {
    var isOpen = !!openByDefault;
    if (openState && typeof openState.has === 'function' && openState.has(key)) {
      isOpen = !!openState.get(key);
    }
    return '<details class="props-accordion" data-accordion-key="' + escapeHtml(key) + '"' + (isOpen ? ' open' : '') + '><summary>' + label + '</summary><div class="props-accordion-body">' + bodyHtml + '</div></details>';
  }

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
   * Task P2 (LIMITATIONS-PLAN.md's P series) - the shared "click-to-place a
   * whole template" primitive the new floating-toolbox Window (P3) and Menu
   * (P4) tools need: a new record format (optionally plus an SFLCTL-style
   * dependent record, optionally plus child fields/constants) landing
   * together as ONE unit, from one click, as one undo step. Generalizes the
   * "+ Add record" wizard's own multi-step insert - newRecordBtn's click
   * handler in buildWebviewTemplate.js now delegates to this instead of
   * keeping its own copy of the same reparse-between-inserts loop - rather
   * than building a second pattern from scratch (see this task's own
   * LIMITATIONS-PLAN.md entry).
   *
   * Kept here (DOM-free, like buildTypedRecordPlan above) rather than in
   * dspfWriter.js, since dspfWriter.js deliberately has zero parser
   * dependency (see its own file-header comment) - inserting more than one
   * extra field needs a fresh reparse between each insert (a field spec's
   * insertion point depends on the record's CURRENT field list, and the
   * record this function may have just created doesn't exist in the
   * caller's stale `dspfFile` yet - same "never assume a record this
   * transform itself just created" reasoning newRecordBtn's own old inline
   * loop already documented). `reparse` is injected instead: the caller
   * already has DspfParser in scope, this only generalizes the
   * ORCHESTRATION, not the parsing itself.
   *
   * `template` shape:
   *   {
   *     mainRecord: { name?, baseName?, keywords?, conditions? } - required;
   *       give either an explicit `name` or a `baseName` for
   *       DspfWriter.nextAvailableRecordName to auto-number off of (P3/P4's
   *       single-click tools have no name-entry step at all, unlike the "+
   *       Add record" wizard which always asks for one explicitly)
   *     dependent: { name?, baseName?, keywords?, conditions? } | null -
   *       same name-or-baseName choice; mirrors insertTypedRecordWithDependent's
   *       own `dependentRecord` (e.g. an auto-generated SFLCTL companion)
   *     extraFields: [ { ...insertField's own newField shape
   *       (nameType/name/length/dataType/... or nameType:'CONSTANT'/
   *       constantValue/...), offset: { dLine, dColumn } } ] - `offset` is
   *       relative to `anchor`, NOT an absolute location, so the exact same
   *       template object can be dropped at any clicked position; OMIT
   *       `offset` (and give an explicit `location` instead, same as
   *       insertField's own newField shape already allows, including
   *       `{ line: null, column: null }` for a positionless hidden field -
   *       see buildTypedRecordPlan's SFLMSG fields) for an extra field that
   *       has no meaningful screen position of its own, so this never
   *       forces every extra field onto the clicked anchor
   *   }
   * `anchor` is the `{ line, column }` the person actually clicked - same
   * shape pendingPlacement already uses in buildWebviewTemplate.js.
   *
   * Returns `{ lines, mainRecordName, dependentRecordName }` - the
   * resulting spliced source lines plus the actual (post-auto-naming)
   * names, so a caller can select/scroll to what it just created the same
   * way newRecordBtn already does with its own `name` today.
   */
  function placeRecordTemplate(DspfWriter, dspfFile, sourceLines, template, anchor, reparse) {
    var mainSpec = template.mainRecord;
    var mainName = mainSpec.name || DspfWriter.nextAvailableRecordName(dspfFile, mainSpec.baseName || 'REC');
    var mainRecord = { name: mainName, keywords: mainSpec.keywords || [], conditions: mainSpec.conditions || [] };

    var dependentName = null;
    var newLines;
    if (template.dependent) {
      var depSpec = template.dependent;
      dependentName = depSpec.name || DspfWriter.nextAvailableRecordName(dspfFile, depSpec.baseName || mainName);
      var dependentRecord = { name: dependentName, keywords: depSpec.keywords || [], conditions: depSpec.conditions || [] };
      newLines = DspfWriter.insertTypedRecordWithDependent(dspfFile, sourceLines, mainRecord, dependentRecord);
    } else {
      newLines = DspfWriter.insertTypedRecord(dspfFile, sourceLines, mainRecord, null);
    }

    (template.extraFields || []).forEach(function (spec) {
      // Reparse fresh each time - see the doc comment above for why a
      // stale record reference (from before this loop's own prior insert)
      // isn't safe to reuse.
      var midModel = reparse(newLines.join('\n'));
      var rec = midModel.records.filter(function (r) { return r.name === mainName; })[0];
      if (!rec) return;
      var fieldSpec = {};
      Object.keys(spec).forEach(function (k) { if (k !== 'offset') fieldSpec[k] = spec[k]; });
      // Only derive a location from `anchor`+`offset` when the caller
      // actually gave an offset - an extra field with no meaningful screen
      // position (e.g. SFLMSG's hidden key/queue fields) instead supplies
      // its own explicit `location` (typically `{ line: null, column: null
      // }`), which is left untouched here rather than forced onto the
      // clicked anchor.
      if (spec.offset) {
        fieldSpec.location = {
          line: Math.max(1, anchor.line + (spec.offset.dLine || 0)),
          column: Math.max(1, anchor.column + (spec.offset.dColumn || 0)),
        };
      }
      newLines = DspfWriter.insertField(rec, newLines, fieldSpec);
    });

    return { lines: newLines, mainRecordName: mainName, dependentRecordName: dependentName };
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

  function commandKeysSectionHtml(scopeLabel, keywords, availableNumbers, idPrefix, expandedSet) {
    var parsed = DspfWriter.parseCommandKeys(keywords);
    var html = '<div class="section-label">Command keys' + (scopeLabel ? ' (' + escapeHtml(scopeLabel) + ')' : '') + '</div>';
    html += '<div id="' + idPrefix + '-cmdkeys">';
    if (parsed.length === 0) {
      html += '<div class="empty-state" style="margin-bottom:6px;">None defined.</div>';
    }
    // Task L31: `idx` (this instance's own 0-based position among ALL
    // command-key instances, in source order - the SAME numbering
    // setCommandKeyAt/removeCommandKeyAt use) is each row's real identity
    // now, not `k.number` - real SDA allows multiple instances of the
    // SAME number (e.g. F3 reading "Exit" under one indicator and
    // "Cancel" under another), so `data-number` alone can no longer
    // uniquely pick a row. `data-number` is kept on every element below
    // too (display, and so any pre-L31 selector matching a still-unique
    // number in a file with no duplicates keeps working unchanged), but
    // wireCommandKeysSection's own remove/conditioning wiring always acts
    // on `data-index`.
    parsed.forEach(function (k, idx) {
      var label = 'F' + parseInt(k.number, 10) + ' = ' + k.type + k.number + (k.indicator ? ' (ind ' + k.indicator + ')' : '') + (k.text ? " '" + k.text + "'" : '');
      var condExpandKey = idPrefix + '-cmdkey-' + idx + ':cond';
      var condSummary = k.conditions.length > 0 ? ' (' + k.conditions.length + ')' : '';
      var condExpanded = !!(expandedSet && expandedSet.has(condExpandKey));
      html += '<div class="cmdkey-row" data-prefix="' + idPrefix + '" data-number="' + k.number + '" data-index="' + idx + '" style="margin-bottom:6px;">';
      html += '<span class="keyword-chip">' + escapeHtml(label) + '<button class="cmdkey-remove" data-prefix="' + idPrefix + '" data-number="' + k.number + '" data-index="' + idx + '">\u00d7</button></span>';
      html += '<span class="kw-cond-toggle cmdkey-cond-toggle" data-prefix="' + idPrefix + '" data-number="' + k.number + '" data-index="' + idx + '" style="margin-left:6px;">Conditioning' + condSummary + (condExpanded ? ' \u25b4' : ' \u25be') + '</span>';
      if (condExpanded) {
        html += '<div class="kw-cond-body">' + conditionsEditorHtml(k.conditions, idPrefix + '-cmdkey-' + idx + '-cond', expandedSet) + '</div>';
      }
      html += '</div>';
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
    html += '<button class="secondary cmdkey-add" data-prefix="' + idPrefix + '" style="width:100%;margin-top:6px;">+ Add command key</button>';
    // Task L31: a number already in use is no longer excluded from
    // `availableNumbers` (see allCommandKeyNumbers/
    // availableCommandKeyNumbers's own updated doc comments) - adding
    // another, independently-conditioned instance of an already-used
    // number is the whole point, so the "+ Add" button is never disabled
    // for that reason anymore (only if somehow 0 numbers were passed in
    // at all, which no current caller does).
    return html;
  }

  function wireCommandKeysSection(idPrefix, keywords, onChange, expandedSet, rerender) {
    document.querySelectorAll('.cmdkey-remove[data-prefix="' + idPrefix + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        onChange(DspfWriter.removeCommandKeyAt(keywords, parseInt(btn.getAttribute('data-index'), 10)));
      });
    });

    // Each existing key's own Conditioning toggle/editor (Task L27: "cmd
    // keys can also have conditionings"). Task L31: this now edits the
    // ONE instance at this row's own `data-index` via setCommandKeyAt
    // (same type/number/indicator/text, only the conditions change),
    // rather than setCommandKey's older "replace whatever has this
    // number" behavior, which would have silently deleted a SIBLING
    // instance of the same number (e.g. editing "Exit"'s conditioning
    // would have wiped out the separate "Cancel" instance of the same
    // key). Deliberately still no equivalent staging step on the "+ Add"
    // form itself - conditionsEditorHtml/wireConditionsEditor commit
    // immediately on every click (no batched-until-Add mode, unlike
    // repeatableConditionedInstancesHtml's own staging row), so there's
    // no stable place to hold a not-yet-created key's conditions between
    // edits; add the key first (unconditioned, same as always), then
    // expand ITS OWN Conditioning toggle below - matches flagRowHtml's
    // own precedent, which likewise only conditions an existing row,
    // never a staging/creation step.
    if (expandedSet && rerender) {
      document.querySelectorAll('.cmdkey-cond-toggle[data-prefix="' + idPrefix + '"]').forEach(function (toggle) {
        var index = parseInt(toggle.getAttribute('data-index'), 10);
        var expandKey = idPrefix + '-cmdkey-' + index + ':cond';
        toggle.addEventListener('click', function () {
          if (expandedSet.has(expandKey)) expandedSet.delete(expandKey);
          else expandedSet.add(expandKey);
          rerender();
        });
        if (expandedSet.has(expandKey)) {
          var existing = DspfWriter.parseCommandKeys(keywords)[index];
          if (existing) {
            wireConditionsEditor(idPrefix + '-cmdkey-' + index + '-cond', existing.conditions, function (newConditions) {
              onChange(DspfWriter.setCommandKeyAt(keywords, index, existing.type, existing.number, existing.indicator, existing.text, newConditions));
            }, expandedSet, rerender);
          }
        }
      });
    }

    var addBtn = document.querySelector('.cmdkey-add[data-prefix="' + idPrefix + '"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var type = document.querySelector('.cmdkey-type[data-prefix="' + idPrefix + '"]').value;
        var numberSel = document.querySelector('.cmdkey-number[data-prefix="' + idPrefix + '"]');
        var number = numberSel && numberSel.value;
        if (!number) return;
        var indicator = document.querySelector('.cmdkey-indicator[data-prefix="' + idPrefix + '"]').value.trim();
        var text = document.querySelector('.cmdkey-text[data-prefix="' + idPrefix + '"]').value.trim();
        // Task L31: append (index === current count) rather than
        // setCommandKey's replace-by-number, so adding a second instance
        // of an already-used number keeps the first one intact instead
        // of overwriting it.
        var count = DspfWriter.parseCommandKeys(keywords).length;
        onChange(DspfWriter.setCommandKeyAt(keywords, count, type, number, indicator || null, text || null));
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
    return dataKwWrap(['COLOR', 'DSPATR'], html);
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

  // Task I-30: IBM's own DDS Reference: "Option indicators are valid for
  // this [DSPATR] keyword, except when the attributes OID or SP are the
  // only display attributes specified." COLOR's own conditioning is
  // unconditionally valid, always - but this UI writes COLOR and DSPATR
  // from ONE shared state (color + attrs + one conditions array), so a
  // state with a color set AND an OID/SP-only DSPATR portion can't be
  // split cleanly: blocking conditioning there would also block COLOR's
  // own always-valid conditioning, so this predicate only blocks the
  // clean case (DSPATR-only, no color) where nothing legitimate is lost.
  // A state combining both a color AND OID/SP-only attributes remains
  // conditionable - a known, documented edge case (see keywordFixes.md's
  // I-30 write-up), not silently declared fixed.
  function colorAttrStateIsConditionable(inst) {
    if (inst.color) return true;
    var split = splitAttrsAndPgmField(inst.attrs);
    if (split.attrs.length === 0) return true;
    return !split.attrs.every(function (a) { return a === 'OID' || a === 'SP'; });
  }

  function colorAttrStatesHtml(keywords, ownerKey, expandedSet, openState) {
    var states = DspfWriter.getColorAttrStates(keywords);
    var html = '';
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
    }, colorAttrStateIsConditionable);
    // Bug fix - was always-expanded raw HTML (the only one of these
    // panels that wasn't a collapsible <details>, unlike Error messages/
    // Keying options right below it); now the same collapsible accordion
    // as those, collapsed by default. The accordion wraps dataKwWrap's own
    // div (not the other way around) so Find-keyword's
    // ".closest('details.props-accordion')" - triggered off a match on
    // this element's own [data-kw] attribute - actually finds an ancestor
    // details to open, not a sibling/child.
    return accordionWrapHtml(ownerKey + '::colorattr', 'Color &amp; attributes', dataKwWrap(['COLOR', 'DSPATR'], html), false, openState);
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
    }, colorAttrStateIsConditionable);
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

  /** Validity check (RANGE/COMP/VALUES) panel (Task L5).
   *  Task I-30: none of the three are ever conditionable - IBM's own DDS
   *  Reference states "Option indicators are not valid for this keyword"
   *  for RANGE, COMP, AND VALUES individually (three separate statements,
   *  not one shared one, but all three say the same thing) - unlike
   *  CHECK's own AB/VN/VNE/M10/M11 codes just below in the same visual
   *  panel, which have their own separate (partial) exception. */
  function validityCheckInstancesHtml(keywords, ownerKey, expandedSet) {
    var instances = DspfWriter.getValidityCheckInstances(keywords);
    return dataKwWrap(['RANGE', 'COMP', 'VALUES'], repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-rep',
      function renderPayload(inst, instIdPrefix) { return validityCheckInstanceRowHtml(inst, instIdPrefix); },
      expandedSet,
      '+ Add validity check',
      undefined,
      function isConditionable() { return false; }
    ));
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
      },
      function isConditionable() { return false; }
    );
  }

  // -----------------------------------------------------------------------
  // Task I-5 - MOUBTN (Mouse Buttons), one of the 5 confirmed-missing
  // file-level keywords from docs/sda-reference/keywordFixes.md. Format
  // per IBM's DDS reference: MOUBTN(EVENT [TRAILING-EVENT]
  // {Command key | EVENT-ID} [*QUEUE | *NOQUEUE]). Built on the same
  // generic repeatable-instance primitive (getRepeatableKeywordInstances/
  // setRepeatableKeywordInstances, repeatableConditionedInstancesHtml/
  // wireRepeatableConditionedInstances) validityCheckInstancesHtml above
  // uses for RANGE/COMP/VALUES - MOUBTN can legitimately repeat (one
  // instance per pointer event) and each instance conditions independently,
  // same shape.
  // -----------------------------------------------------------------------

  var MOUBTN_EVENTS = ['*ULP', '*ULR', '*ULD', '*UMP', '*UMR', '*UMD', '*URP', '*URR', '*URD',
    '*SLP', '*SLR', '*SLD', '*SMP', '*SMR', '*SMD', '*SRP', '*SRR', '*SRD'];

  /** Splits one MOUBTN instance's raw `parameters` text into its 4 logical
   *  pieces. TRAILING-EVENT is optional and, when present, is itself one of
   *  MOUBTN_EVENTS' own `*xxx` values, so token count alone (3 vs 2, after
   *  any trailing QUEUE flag is peeled off) distinguishes "two-event" from
   *  "single-event" instances without needing to inspect the token shape. */
  function parseMoubtnParams(text) {
    var tokens = (text || '').trim().split(/\s+/).filter(Boolean);
    var queue = '';
    if (tokens.length && /^\*(NO)?QUEUE$/i.test(tokens[tokens.length - 1])) {
      queue = tokens.pop().toUpperCase();
    }
    var event = tokens[0] || '';
    var trailing = '', key = '';
    if (tokens.length === 3) { trailing = tokens[1].toUpperCase(); key = tokens[2]; }
    else if (tokens.length === 2) { key = tokens[1]; }
    return { event: event.toUpperCase(), trailing: trailing, key: key, queue: queue };
  }

  /** Inverse of parseMoubtnParams - returns '' (meaning "drop this
   *  instance, nothing meaningful to write") when EVENT or the Command
   *  key/EVENT-ID is blank, since both are required by IBM's own format. */
  function composeMoubtnParams(f) {
    var event = (f.event || '').trim().toUpperCase();
    var key = (f.key || '').trim().toUpperCase();
    if (!event || !key) return '';
    var parts = [event];
    var trailing = (f.trailing || '').trim().toUpperCase();
    if (trailing) parts.push(trailing);
    parts.push(key);
    var queue = (f.queue || '').trim().toUpperCase();
    if (queue) parts.push(queue);
    return parts.join(' ');
  }

  function moubtnInstanceRowHtml(inst, p) {
    var f = parseMoubtnParams(inst.parameters);
    function eventOptions(selected, allowNone) {
      var html = allowNone ? '<option value=""' + (selected === '' ? ' selected' : '') + '>(single event)</option>' : '';
      html += MOUBTN_EVENTS.map(function (e) {
        return '<option value="' + e + '"' + (selected === e ? ' selected' : '') + '>' + e + '</option>';
      }).join('');
      return html;
    }
    var html = '<div style="margin-bottom:4px;">';
    html += '<div class="two-col">';
    html += '<select class="' + p + '-event">' + eventOptions(f.event, false) + '</select>';
    html += '<select class="' + p + '-trailing">' + eventOptions(f.trailing, true) + '</select>';
    html += '</div>';
    html += '<div class="two-col" style="margin-top:4px;">';
    html += '<input type="text" class="' + p + '-key" placeholder="Command key or EVENT-ID (CFnn/CAnn/ROLLUP/ROLLDOWN/HELP/HOME/PRINT/CLEAR/ENTER/E00-E15)" value="' + escapeHtml(f.key) + '" />';
    html += '<select class="' + p + '-queue">' +
      '<option value=""' + (f.queue === '' ? ' selected' : '') + '>(default *NOQUEUE)</option>' +
      '<option value="*QUEUE"' + (f.queue === '*QUEUE' ? ' selected' : '') + '>*QUEUE</option>' +
      '<option value="*NOQUEUE"' + (f.queue === '*NOQUEUE' ? ' selected' : '') + '>*NOQUEUE</option>' +
      '</select>';
    html += '</div></div>';
    return html;
  }

  /** MOUBTN panel (Task I-5), file-level. */
  function moubtnPanelHtml(keywords, ownerKey, expandedSet) {
    var instances = DspfWriter.getRepeatableKeywordInstances(keywords, ['MOUBTN']);
    return dataKwWrap(['MOUBTN'], repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-moubtn-rep',
      function renderPayload(inst, instIdPrefix) { return moubtnInstanceRowHtml(inst, instIdPrefix); },
      expandedSet,
      '+ Add mouse button event'
    ));
  }

  function wireMoubtnPanel(getKeywords, onChange, ownerKey, expandedSet, rerender) {
    var instances = DspfWriter.getRepeatableKeywordInstances(getKeywords(), ['MOUBTN']);
    wireRepeatableConditionedInstances(
      ownerKey + '-moubtn-rep',
      instances,
      function (next) { onChange(DspfWriter.setRepeatableKeywordInstances(getKeywords(), ['MOUBTN'], next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var eventEl = document.querySelector('.' + instIdPrefix + '-event');
        var trailingEl = document.querySelector('.' + instIdPrefix + '-trailing');
        var keyEl = document.querySelector('.' + instIdPrefix + '-key');
        var queueEl = document.querySelector('.' + instIdPrefix + '-queue');
        function commit() {
          var f = { event: eventEl.value, trailing: trailingEl.value, key: keyEl.value, queue: queueEl.value };
          updatePayload({ name: 'MOUBTN', parameters: composeMoubtnParams(f) });
        }
        if (eventEl) eventEl.addEventListener('change', commit);
        if (trailingEl) trailingEl.addEventListener('change', commit);
        if (keyEl) keyEl.addEventListener('change', commit);
        if (queueEl) queueEl.addEventListener('change', commit);
      },
      expandedSet,
      rerender,
      function makeDefaultInstance() {
        // Non-blank placeholder (Task L1b's own makeDefaultInstance
        // reasoning: this component commits on every change immediately,
        // so a genuinely blank MOUBTN() would be invalid DDS and vanish
        // again on the very next re-render before the user can fill it in).
        return { name: 'MOUBTN', conditions: [], parameters: '*ULP CF01' };
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

  // Task I-20: of the ten kinds this shared repeatable-row model covers,
  // VLDCMDKEY/SETOF/CHANGE/INDTXT each state their own "Option indicators
  // are not valid for this keyword" line in the DDS Reference (CLEAR/HOME/
  // PAGEDOWN/PAGEUP/HELP/HLPRTN all instead say "are valid") - I-7 flagged
  // this shared component as not kind-aware (one uniform Conditioning
  // toggle for every kind regardless), deferred to this task. See
  // repeatableConditionedInstancesHtml/wireRepeatableConditionedInstances'
  // own `isConditionable` doc comment above for how a mixed list like this
  // one opts individual rows out.
  var RECORD_INDICATOR_NO_CONDITIONING_KINDS = ['VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'];
  function recordIndicatorInstanceIsConditionable(inst) {
    return RECORD_INDICATOR_NO_CONDITIONING_KINDS.indexOf(inst.kind) < 0;
  }

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
    return dataKwWrap(['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'], repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-rep',
      function renderPayload(inst, instIdPrefix) { return recordIndicatorInstanceRowHtml(inst, instIdPrefix); },
      expandedSet,
      '+ Add indicator keyword',
      undefined,
      recordIndicatorInstanceIsConditionable
    ));
  }

  function wireRecordIndicatorInstances(keywords, onChange, ownerKey, expandedSet, rerender, getFileKeywords) {
    var instances = DspfWriter.getRecordIndicatorInstances(keywords);
    wireRepeatableConditionedInstances(
      ownerKey + '-rep',
      instances,
      function (next) { onChange(DspfWriter.setRecordIndicatorInstances(keywords, next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var kindEl = document.querySelector('.' + instIdPrefix + '-kind');
        var respEl = document.querySelector('.' + instIdPrefix + '-resp');
        var textEl = document.querySelector('.' + instIdPrefix + '-text');
        // Task S36-4: HELP and CHANGE's response indicator ('resp' here) is
        // a verified S36E rule (see checkS36EResponseIndicatorViolation's
        // own comment) - hard-blocked (direct user request: reject, not
        // warn) regardless of which field triggered the change: switching
        // `kind` TO Help/Change while a resp is already typed, or editing
        // `resp` while `kind` is already Help/Change, both run through this
        // same check using whatever's CURRENTLY on screen for the other
        // field. `getFileKeywords` (optional - only Task L5d's record-level
        // panel and Task R3's SFLCTL panel pass it, both of which have a
        // file to check USRDSPMGT against) is skipped gracefully when
        // absent, same "no-op without the file context" pattern this file
        // uses elsewhere.
        function guardedUpdate(partial) {
          var nextKind = partial.kind !== undefined ? partial.kind : (kindEl ? kindEl.value : inst.kind);
          var nextResp = partial.resp !== undefined ? partial.resp : (respEl ? respEl.value : inst.resp);
          if (getFileKeywords && (nextKind === 'HELP' || nextKind === 'CHANGE')) {
            var violation = DspfWriter.checkS36EResponseIndicatorViolation(getFileKeywords(), nextKind, nextResp);
            if (violation) {
              window.alert(violation.message);
              if (kindEl) kindEl.value = inst.kind;
              if (respEl) respEl.value = inst.resp;
              return;
            }
          }
          // Task I-20 finding (b): I-13's own PULLDOWN audit found CLEAR on
          // PULLDOWN's own 27-keyword forbidden list, but couldn't wire
          // DspfWriter.pulldownConflictReason onto it because CLEAR lives
          // in this shared, not-kind-aware component rather than a plain
          // flagRowHtml row - deferred to this task. `keywords` (this
          // function's own outer closure variable, the record's current
          // keyword array) is exactly what pulldownConflictReason needs;
          // the reverse direction (turning PULLDOWN on while a CLEAR
          // instance already exists) was already covered for free, since
          // wirePulldownPanels' own guard scans this same keywords array
          // for ANY keyword named CLEAR regardless of which UI wrote it.
          if (nextKind === 'CLEAR') {
            var pulldownReason = DspfWriter.pulldownConflictReason('CLEAR', keywords);
            if (pulldownReason) {
              window.alert(pulldownReason);
              if (kindEl) kindEl.value = inst.kind;
              return;
            }
          }
          updatePayload(partial);
        }
        if (kindEl) kindEl.addEventListener('change', function () { guardedUpdate({ kind: kindEl.value }); });
        if (respEl) respEl.addEventListener('change', function () { guardedUpdate({ resp: respEl.value }); });
        if (textEl) textEl.addEventListener('change', function () { updatePayload({ text: textEl.value }); });
      },
      expandedSet,
      rerender,
      function makeDefaultInstance() {
        // Task I-20 finding (b): the default kind is CLEAR, but CLEAR is
        // on PULLDOWN's own 27-keyword forbidden list - unlike a plain
        // on/off flag row (where "blocked" just means the checkbox
        // reverts and the person picks something else), silently
        // no-op'ing "+ Add indicator keyword" here would look broken -
        // the button visibly does nothing and no row appears. Falling
        // back to HOME instead (not on PULLDOWN's forbidden list) keeps
        // "+ Add always seeds something" true for every record type;
        // the guardedUpdate check above still blocks anyone who
        // explicitly picks CLEAR from the kind dropdown afterward.
        var kind = DspfWriter.pulldownConflictReason('CLEAR', keywords) ? 'HOME' : 'CLEAR';
        // Non-blank placeholder resp, not '' - same reasoning as every
        // other L1-based makeDefaultInstance in this file (e.g.
        // wireValidityCheckInstances above): this component commits on
        // every change immediately, so a genuinely blank CLEAR() would
        // be invalid DDS and the freshly-added row would vanish again on
        // the very next re-render, before the user gets to type a real
        // response indicator in.
        return { kind: kind, conditions: [], resp: '10', text: '' };
      },
      recordIndicatorInstanceIsConditionable
    );
  }

  /** Bug fix - "Validity check" (RANGE/COMP/VALUES + CHECK's AB/VN/VNE/
   *  M10/M11 codes) as its own collapsible accordion, split out of what
   *  used to be one always-expanded validityAndEditHtml() blob so it can
   *  collapse independently of Check message identifier/Edit code-word-
   *  mask below - same "collapsed by default" treatment Error messages/
   *  Keying options already got. */
  function validityCheckSectionHtml(keywords, ownerKey, expandedSet, openState) {
    var html = '<div class="hint-small">RANGE low high &middot; COMP op value &middot; VALUES v1 v2 ...</div>';
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
    return accordionWrapHtml(ownerKey + '::validity-check', 'Validity check', html, false, openState);
  }

  /** Bug fix - CHKMSGID split into its own collapsible accordion (see
   *  validityCheckSectionHtml's own doc comment above for why). */
  function checkMsgIdSectionHtml(keywords, ownerKey, openState) {
    // CHKMSGID - overrides the system-supplied error message a validity
    // check issues. Real SDA's own "Define Validity Check Keywords"
    // screen reaches this on a SECOND page (its "More..." key), but it's
    // the same field-level keyword picker as RANGE/COMP/VALUES/CHECK
    // just above, not a separate panel - see DspfWriter.getCheckMsgId's
    // own doc comment for the DDS format. Single-instance, own "Apply"
    // button (a genuinely different keyword than EDTCDE/EDTWRD/EDTMSK's
    // own Apply below, so bundling the two commits would be misleading).
    var cm = DspfWriter.getCheckMsgId(keywords);
    var html = '<div class="two-col">' +
      '<input type="text" id="' + ownerKey + '-cm-msgid" placeholder="Message identifier" value="' + escapeHtml(cm.msgId) + '" />' +
      '<input type="text" id="' + ownerKey + '-cm-msgfile" placeholder="Message file" value="' + escapeHtml(cm.msgFile) + '" />' +
      '</div><div class="two-col" style="margin-top:4px;">' +
      '<input type="text" id="' + ownerKey + '-cm-library" placeholder="Library (optional, *LIBL if blank)" value="' + escapeHtml(cm.library) + '" />' +
      '<input type="text" id="' + ownerKey + '-cm-msgdata" placeholder="Message data field (optional)" value="' + escapeHtml(cm.msgDataField) + '" />' +
      '</div><div class="hint-small">Overrides the system-supplied validity-check error message - both message identifier and message file are required, or CHKMSGID is removed.</div>' +
      '<button class="secondary ' + ownerKey + '-cm-apply" style="width:100%;margin-top:8px;">Apply CHKMSGID</button>';
    return accordionWrapHtml(ownerKey + '::check-msgid', 'Check message identifier', html, false, openState);
  }

  /** Bug fix - EDTCDE/EDTWRD/EDTMSK split into its own collapsible
   *  accordion (see validityCheckSectionHtml's own doc comment above for
   *  why).
   *
   *  Task I-31 finding: EDTMSK used to be folded into the SAME mutually-
   *  exclusive 'kind' dropdown as EDTCDE/EDTWRD (the old option list was
   *  ['', 'EDTCDE', 'EDTWRD', 'EDTMSK']) - but IBM's own DDS Reference
   *  states EDTMSK "must also contain the EDTCDE or EDTWRD keywords"; it
   *  can never stand alone. Treating it as a third alternative to
   *  EDTCDE/EDTWRD meant selecting it always wiped out whichever of the
   *  other two the field already carried (and vice versa), so this UI
   *  could never actually produce a valid EDTCDE+EDTMSK or EDTWRD+EDTMSK
   *  combination. EDTMSK now gets its own independent input, backed by
   *  DspfWriter.getEditMask/setEditMask, with DspfWriter.
   *  editMaskConflictReason enforcing both of EDTMSK's own documented
   *  requirements (usage I or B; an EDTCDE or EDTWRD keyword already
   *  present) at Apply time. */
  function editKeywordSectionHtml(keywords, ownerKey, openState) {
    var ec = DspfWriter.getEditKeyword(keywords);
    var em = DspfWriter.getEditMask(keywords);
    var html = '<div class="two-col">' +
      '<select id="' + ownerKey + '-ec-kind">' +
      ['', 'EDTCDE', 'EDTWRD'].map(function (k) {
        return '<option value="' + k + '"' + (ec.kind === k ? ' selected' : '') + '>' + (k || '(none)') + '</option>';
      }).join('') +
      '</select>' +
      '<input type="text" id="' + ownerKey + '-ec-params" placeholder="e.g. J" value="' + escapeHtml(ec.parameters) + '" />' +
      '</div><div class="hint-small">EDTCDE: a single code letter (1-4, A-D, J-O, W, X, Y, Z) &middot; EDTWRD: full quoted substitution string</div>' +
      '<input type="text" id="' + ownerKey + '-em-mask" placeholder="Edit mask (EDTMSK) - full quoted mask string, e.g. \'(999) 999-9999\'" value="' + escapeHtml(em.text) + '" style="width:100%;margin-top:6px;" />' +
      '<div class="hint-small">EDTMSK requires usage I or B and an EDTCDE or EDTWRD keyword already on the field (per the DDS Reference) - independent of the edit code/word above, not a third alternative to it.</div>' +
      '<button class="secondary ' + ownerKey + '-vc-apply" style="width:100%;margin-top:8px;">Apply edit code/word/mask</button>';
    return accordionWrapHtml(ownerKey + '::edit-keyword', 'Edit code / word / mask', html, false, openState);
  }

  function validityAndEditHtml(keywords, ownerKey, options, expandedSet, openState) {
    var includeValidity = !options || options.includeValidity !== false;
    var includeEditKeyword = !options || options.includeEditKeyword !== false;

    var html = '';
    if (includeValidity) {
      html += validityCheckSectionHtml(keywords, ownerKey, expandedSet, openState);
      html += checkMsgIdSectionHtml(keywords, ownerKey, openState);
    }
    if (includeEditKeyword) {
      html += editKeywordSectionHtml(keywords, ownerKey, openState);
    }
    return html;
  }

  function wireValidityAndEdit(keywords, onChange, ownerKey, options, expandedSet, rerender, dataType, usage) {
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
      var emText = document.getElementById(ownerKey + '-em-mask').value;
      var prevEc = DspfWriter.getEditKeyword(keywords);
      var prevEm = DspfWriter.getEditMask(keywords);
      function revert() {
        document.getElementById(ownerKey + '-ec-kind').value = prevEc.kind;
        document.getElementById(ownerKey + '-ec-params').value = prevEc.parameters;
        document.getElementById(ownerKey + '-em-mask').value = prevEm.text;
      }
      // L82 - symmetric side of L81's DFT/DFTVAL guard: EDTCDE/EDTWRD
      // are blocked from being selected here while the field already
      // carries DFT or DFTVAL, using the exact same
      // DspfWriter.dftGroupConflictReason L81 already established -
      // just called from this panel's own side of the relationship now.
      // Switching back to '(none)' or re-applying an unchanged kind is
      // never blocked.
      if (ecKind === 'EDTCDE' || ecKind === 'EDTWRD') {
        var reason = DspfWriter.dftGroupConflictReason(ecKind, keywords, dataType);
        if (reason) { window.alert(reason); revert(); return; }
      }
      // Task I-31 - EDTMSK's own two documented requirements (usage I/B;
      // an EDTCDE/EDTWRD keyword present), checked against what THIS
      // apply is about to leave on the field, not just its current
      // saved state - a same-click "add EDTCDE and EDTMSK together"
      // must be allowed, so editMaskConflictReason is called against
      // `pendingKeywords` (post setEditKeyword, pre setEditMask), not
      // the stale outer `keywords`. Clearing the mask back to blank is
      // never blocked.
      var pendingKeywords = DspfWriter.setEditKeyword(keywords, ecKind, ecParams);
      if (emText) {
        var maskReason = DspfWriter.editMaskConflictReason(pendingKeywords, usage);
        if (maskReason) { window.alert(maskReason); revert(); return; }
      }
      onChange(DspfWriter.setEditMask(pendingKeywords, emText));
    });
  }

  // -----------------------------------------------------------------------
  // I-32 - DATFMT/DATSEP (date fields, data type L) and TIMFMT/TIMSEP
  // (time fields, data type T). Gated entirely by dataType, not by usage
  // or any fieldKeywordCategoryVisibility() category - unlike every other
  // field-level section on this panel, these two keyword pairs are each
  // valid for exactly one data type and no others (confirmed against
  // DATFMT's/TIMFMT's own DDS Reference text - see dspfWriter.js's own
  // doc comment on this keyword group), so the caller passes `dataType`
  // directly rather than routing through the shared visibility gate.
  // Timestamp (Z) fields get neither section - there is no DATFMT/TIMFMT/
  // DATSEP/TIMSEP customization for Z at all in the DDS Reference.
  // -----------------------------------------------------------------------

  var DATE_FORMAT_VALUES = ['', '*JOB', '*MDY', '*DMY', '*YMD', '*JUL', '*ISO', '*USA', '*EUR', '*JIS'];
  var DATE_FORMAT_LABELS = { '': '(unspecified - defaults to *ISO)', '*JOB': '*JOB - job default', '*MDY': '*MDY - mm/dd/yy', '*DMY': '*DMY - dd/mm/yy', '*YMD': '*YMD - yy/mm/dd', '*JUL': '*JUL - yy/ddd (Julian)', '*ISO': '*ISO - yyyy-mm-dd', '*USA': '*USA - mm/dd/yyyy', '*EUR': '*EUR - dd.mm.yyyy', '*JIS': '*JIS - yyyy-mm-dd' };
  // TIMFMT has no *JOB value at all - confirmed by its own format table in
  // the DDS Reference, which lists only *HMS/*ISO/*USA/*EUR/*JIS.
  var TIME_FORMAT_VALUES = ['', '*HMS', '*ISO', '*USA', '*EUR', '*JIS'];
  var TIME_FORMAT_LABELS = { '': '(unspecified - defaults to *ISO)', '*HMS': '*HMS - hh:mm:ss', '*ISO': '*ISO - hh.mm.ss', '*USA': '*USA - hh:mm AM/PM', '*EUR': '*EUR - hh.mm.ss', '*JIS': '*JIS - hh:mm:ss' };
  // DATSEP and TIMSEP share the same *JOB | 'separator-char' grammar and
  // the same documented valid-character set for the quoted form (a slash,
  // dash, period, comma, or blank for dates; a colon, period, comma, or
  // blank for times - DATSEP's own list includes the slash TIMSEP's own
  // list omits, since a slash has no meaning between hour/minute/second).
  var DATE_SEP_VALUES = ['', '*JOB', '/', '-', '.', ',', ' '];
  var DATE_SEP_LABELS = { '': '(unspecified - *JOB default)', '*JOB': '*JOB', '/': '/ (slash)', '-': '- (dash)', '.': '. (period)', ',': ', (comma)', ' ': '(blank)' };
  var TIME_SEP_VALUES = ['', '*JOB', ':', '.', ',', ' '];
  var TIME_SEP_LABELS = { '': '(unspecified - *JOB default)', '*JOB': '*JOB', ':': ': (colon)', '.': '. (period)', ',': ', (comma)', ' ': '(blank)' };

  function dateTimeFormatHtml(keywords, ownerKey, dataType, openState) {
    if (dataType === 'L') {
      var dfmt = DspfWriter.getDateFormat(keywords);
      var dsep = DspfWriter.getDateSeparator(keywords);
      var html = '<div class="two-col">' +
        '<div class="field-row"><label>DATFMT</label><select id="' + ownerKey + '-datfmt">' +
        DATE_FORMAT_VALUES.map(function (v) { return '<option value="' + v + '"' + (dfmt === v ? ' selected' : '') + '>' + DATE_FORMAT_LABELS[v] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field-row"><label>DATSEP</label><select id="' + ownerKey + '-datsep">' +
        DATE_SEP_VALUES.map(function (v) { return '<option value="' + v + '"' + (dsep === v ? ' selected' : '') + '>' + DATE_SEP_LABELS[v] + '</option>'; }).join('') +
        '</select></div></div>' +
        '<div class="hint-small">DATSEP cannot be set when DATFMT is *ISO/*USA/*EUR/*JIS - those formats have a fixed separator (per the DDS Reference).</div>' +
        '<button class="secondary ' + ownerKey + '-dtfmt-apply" style="width:100%;margin-top:8px;">Apply date format</button>';
      return accordionWrapHtml(ownerKey + '::date-format', 'Date format (DATFMT / DATSEP)', html, false, openState);
    }
    if (dataType === 'T') {
      var tfmt = DspfWriter.getTimeFormat(keywords);
      var tsep = DspfWriter.getTimeSeparator(keywords);
      var html2 = '<div class="two-col">' +
        '<div class="field-row"><label>TIMFMT</label><select id="' + ownerKey + '-timfmt">' +
        TIME_FORMAT_VALUES.map(function (v) { return '<option value="' + v + '"' + (tfmt === v ? ' selected' : '') + '>' + TIME_FORMAT_LABELS[v] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field-row"><label>TIMSEP</label><select id="' + ownerKey + '-timsep">' +
        TIME_SEP_VALUES.map(function (v) { return '<option value="' + v + '"' + (tsep === v ? ' selected' : '') + '>' + TIME_SEP_LABELS[v] + '</option>'; }).join('') +
        '</select></div></div>' +
        '<div class="hint-small">TIMSEP cannot be set when TIMFMT is *ISO/*USA/*EUR/*JIS - those formats have a fixed separator (per the DDS Reference). TIMFMT has no *JOB value (unlike DATFMT).</div>' +
        '<button class="secondary ' + ownerKey + '-dtfmt-apply" style="width:100%;margin-top:8px;">Apply time format</button>';
      return accordionWrapHtml(ownerKey + '::time-format', 'Time format (TIMFMT / TIMSEP)', html2, false, openState);
    }
    return '';
  }

  function wireDateTimeFormat(keywords, onChange, ownerKey, dataType) {
    var applyBtn = document.querySelector('.' + ownerKey + '-dtfmt-apply');
    if (!applyBtn) return;
    if (dataType === 'L') {
      applyBtn.addEventListener('click', function () {
        var dfmt = document.getElementById(ownerKey + '-datfmt').value;
        var dsep = document.getElementById(ownerKey + '-datsep').value;
        if (dsep) {
          var reason = DspfWriter.dateSeparatorConflictReason(dfmt);
          if (reason) {
            window.alert(reason);
            document.getElementById(ownerKey + '-datsep').value = DspfWriter.getDateSeparator(keywords);
            return;
          }
        }
        onChange(DspfWriter.setDateSeparator(DspfWriter.setDateFormat(keywords, dfmt), dsep));
      });
    } else if (dataType === 'T') {
      applyBtn.addEventListener('click', function () {
        var tfmt = document.getElementById(ownerKey + '-timfmt').value;
        var tsep = document.getElementById(ownerKey + '-timsep').value;
        if (tsep) {
          var reason = DspfWriter.timeSeparatorConflictReason(tfmt);
          if (reason) {
            window.alert(reason);
            document.getElementById(ownerKey + '-timsep').value = DspfWriter.getTimeSeparator(keywords);
            return;
          }
        }
        onChange(DspfWriter.setTimeSeparator(DspfWriter.setTimeFormat(keywords, tfmt), tsep));
      });
    }
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

  /** L79 - "Define Message ID" (MSGID) as Task L1's repeatable,
   *  independently-conditioned instances (see DspfWriter.
   *  getMessageIdInstances/setMessageIdInstances's own doc comment for
   *  the repeatable/conditioning dimension) with MSGID's own parameters
   *  now broken out into the same structured prompts real SDA's "Define
   *  Message ID" screen shows (screens/field-level/character/message-id/
   *  image171.png): Message prefix, Message identifier (&field name),
   *  Message file, Library - see DspfWriter.parseMsgIdParams/
   *  formatMsgIdParams's own doc comment for MSGID's exact grammar and
   *  why a rarer combined-field form still falls back to raw text. */
  function messageIdInstancesHtml(keywords, ownerKey, expandedSet) {
    var instances = DspfWriter.getMessageIdInstances(keywords);
    var html = '<div class="section-label">Message ID (MSGID)</div>';
    html += repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-msgid',
      function renderPayload(inst, instIdPrefix) {
        return msgIdPayloadHtml(inst.parameters, instIdPrefix);
      },
      expandedSet,
      '+ Add message ID',
      function renderStaging(stagingIdPrefix) {
        return msgIdPayloadHtml('', stagingIdPrefix);
      }
    );
    return html;
  }

  /** Renders one MSGID instance's payload - the structured Message
   *  prefix/identifier/file/Library prompts for the common form, or (see
   *  DspfWriter.parseMsgIdParams's own doc comment) a raw-text fallback
   *  for the rarer combined-&field form this can't safely decompose. */
  function msgIdPayloadHtml(parameters, idPrefix) {
    var parsed = DspfWriter.parseMsgIdParams(parameters);
    if (!parsed.structured) {
      return (
        '<div class="hint-small">This MSGID uses a form (e.g. more than one &amp;field reference) too varied to edit as separate fields - edit its raw text below.</div>' +
        '<input type="text" class="' + idPrefix + '-text" style="width:100%;" value="' + escapeHtml(parameters || '') + '" />'
      );
    }
    var html = '<label class="attr-check"><input type="checkbox" class="' + idPrefix + '-none" ' + (parsed.none ? 'checked' : '') + '/>*NONE (no message text)</label>';
    html += '<div class="' + idPrefix + '-fields" style="margin-top:6px;' + (parsed.none ? 'display:none;' : '') + '">';
    html += '<div class="two-col"><div class="field-row"><label>Message prefix</label><input type="text" class="' + idPrefix + '-prefix" value="' + escapeHtml(parsed.prefix) + '" /></div>';
    html += '<div class="field-row"><label>Message identifier (&amp;field name)</label><input type="text" class="' + idPrefix + '-fieldname" value="' + escapeHtml(parsed.fieldName) + '" placeholder="FLDNAME" /></div></div>';
    html += '<div class="two-col"><div class="field-row"><label>Message file</label><input type="text" class="' + idPrefix + '-msgfile" value="' + escapeHtml(parsed.msgFile) + '" /></div>';
    html += '<div class="field-row"><label>Library</label><input type="text" class="' + idPrefix + '-library" value="' + escapeHtml(parsed.library) + '" placeholder="*LIBL" /></div></div>';
    html += '</div>';
    return html;
  }

  function wireMessageIdInstancesEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var instances = DspfWriter.getMessageIdInstances(keywords);
    wireRepeatableConditionedInstances(
      ownerKey + '-msgid',
      instances,
      function (next) { onChange(DspfWriter.setMessageIdInstances(keywords, next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        wireMsgIdPayload(instIdPrefix, updatePayload);
      },
      expandedSet,
      rerender,
      function readNewInstance(stagingIdPrefix) {
        var parameters = readMsgIdPayload(stagingIdPrefix);
        if (!parameters) return null; // nothing to add
        return { conditions: [], parameters: parameters };
      }
    );
  }

  /** Reads the CURRENT values out of one MSGID payload's structured
   *  fields (or its raw-text fallback input, whichever is present in the
   *  DOM for this instance - see msgIdPayloadHtml). */
  function readMsgIdStructuredState(idPrefix) {
    var noneEl = document.querySelector('.' + idPrefix + '-none');
    var prefixEl = document.querySelector('.' + idPrefix + '-prefix');
    var fieldNameEl = document.querySelector('.' + idPrefix + '-fieldname');
    var msgFileEl = document.querySelector('.' + idPrefix + '-msgfile');
    var libraryEl = document.querySelector('.' + idPrefix + '-library');
    return {
      none: !!(noneEl && noneEl.checked),
      prefix: prefixEl ? prefixEl.value : '',
      fieldName: fieldNameEl ? fieldNameEl.value.trim().toUpperCase() : '',
      msgFile: msgFileEl ? msgFileEl.value.trim().toUpperCase() : '',
      library: libraryEl ? libraryEl.value.trim().toUpperCase() : '',
    };
  }

  function readMsgIdPayload(idPrefix) {
    var rawEl = document.querySelector('.' + idPrefix + '-text');
    if (rawEl) return rawEl.value.trim();
    return DspfWriter.formatMsgIdParams(readMsgIdStructuredState(idPrefix)).trim();
  }

  function wireMsgIdPayload(idPrefix, updatePayload) {
    var rawEl = document.querySelector('.' + idPrefix + '-text');
    if (rawEl) {
      rawEl.addEventListener('change', function () { updatePayload({ parameters: rawEl.value }); });
      return;
    }
    var noneEl = document.querySelector('.' + idPrefix + '-none');
    var fieldsEl = document.querySelector('.' + idPrefix + '-fields');
    function commit() {
      updatePayload({ parameters: DspfWriter.formatMsgIdParams(readMsgIdStructuredState(idPrefix)) });
    }
    if (noneEl) {
      noneEl.addEventListener('change', function () {
        if (fieldsEl) fieldsEl.style.display = noneEl.checked ? 'none' : '';
        commit();
      });
    }
    ['-prefix', '-fieldname', '-msgfile', '-library'].forEach(function (suffix) {
      var el = document.querySelector('.' + idPrefix + suffix);
      if (el) el.addEventListener('change', commit);
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
  // the raw Keywords tab, which is never gated.
  // Task I-35 - M (Message) and P (Program-to-system) usage USED to fail
  // open here (show every category), on the reasoning that "SDA's own
  // table never covers them" (real SDA's own screenshot table only has
  // columns for O/I/B/H). That reasoning doesn't hold up against IBM's
  // own DDS Reference, which is far MORE restrictive for M/P than any
  // other usage, not less: M's own section states "Only the following
  // keywords are valid for a message field: ALIAS, INDTXT, OVRDTA,
  // REFFLD, TEXT" and P's own section states "The only keywords allowed
  // on a program-to-system field are: ALIAS, TEXT, INDTXT, REFFLD" (no
  // OVRDTA) - five and four keywords respectively, nothing else, not even
  // DSPATR/COLOR/CHECK/DUP/MSGID/EDTCDE. Failing open for M/P was backwards
  // - every category below EXCEPT General Keywords and Database Reference
  // is now hidden outright for M/P, and those two remaining categories
  // still need keyword-level filtering of their own (neither is a "some of
  // this category" match - GENERAL_FIELD_KEYWORD_ROWS's own new mpScope
  // column and referenceOverridesHtml's own new usage param, both below,
  // handle that finer grain this category-level function can't express).
  // Genuinely blank/unset usage (no DDS position-38 entry, which is
  // Output-only per IBM's own default) is NOT the same case as M/P and
  // keeps the old fail-open posture below it - unset usage on a field
  // still being drafted isn't one of IBM's six defined codes to look up a
  // fixed list for, unlike M/P which A) have both a code AND a fixed list.
  // -----------------------------------------------------------------------
  function fieldKeywordCategoryVisibility(usage, dataType) {
    var u = usage || '';
    if (u === 'M' || u === 'P') {
      return {
        colorAndAttributes: false,
        keyingOptions: false,
        validityAndErrorMessage: false,
        errorMessages: false,
        inputKeywords: false,
        generalKeywords: true,
        databaseReference: true,
        messageId: false,
        editingKeywords: false,
      };
    }
    var isKnownUsage = u === 'H' || u === 'I' || u === 'O' || u === 'B';
    if (!isKnownUsage) {
      // Blank (unset) usage - not one of IBM's six defined codes yet (a
      // field still being drafted), so show every category rather than
      // guessing wrong. M/P are handled above, NOT here, now that I-35
      // found IBM documents fixed keyword lists for both.
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
  // Task I-30: "Option indicators are valid only for CHECK(ER) and
  // CHECK(ME)" per IBM's own DDS Reference - every other code (AB/VN/VNE/
  // M10/M10F/M11/M11F/MF/FE/RB/RZ/RL/LC) is not conditionable at all. An
  // instance mixing an ER/ME code with any other code doesn't get a pass
  // either - IBM's statement names ONLY CHECK(ER) and CHECK(ME) as valid,
  // not "CHECK(ER ...)"/"CHECK(ME ...)" combined with something else, so
  // conditionable requires the instance's code set to be a non-empty
  // subset of exactly {ER, ME} (M10F/M11F don't apply here - they're
  // Immed variants of M10/M11, never combinable with ER/ME's own Immed-
  // less shape in this UI).
  function checkInstanceIsConditionable(inst) {
    var codes = DspfWriter.parseCheckCodes(inst.parameters);
    if (codes.length === 0) return false;
    return codes.every(function (c) { return c === 'ER' || c === 'ME'; });
  }

  function checkInstancesHtml(keywords, ownerKey, expandedSet, codeSpecs, addLabel) {
    var instances = DspfWriter.getRepeatableKeywordInstances(keywords, ['CHECK']);
    return dataKwWrap(['CHECK'], repeatableConditionedInstancesHtml(instances, ownerKey + '-check-rep', function (inst, instIdPrefix) {
      var codes = DspfWriter.parseCheckCodes(inst.parameters);
      var html = '<div class="attr-checks">';
      codeSpecs.forEach(function (c) {
        var isImmed = !!c.immedCode && codes.indexOf(c.immedCode) >= 0;
        var checked = codes.indexOf(c.code) >= 0 || isImmed;
        html += '<label class="attr-check" title="' + escapeHtml(c.label) + '"><input type="checkbox" class="' + instIdPrefix + '-code" data-code="' + c.code + '" ' + (checked ? 'checked' : '') + '/>' + c.code + '</label>';
        // Bug fix - Immed only makes sense once its own code (M10/M11) is
        // actually selected, so it's now hidden until then instead of
        // always showing regardless of whether the checkbox next to it is
        // even checked. Re-rendered fresh (this whole panel re-renders on
        // every commit - see commitSourceChange's own render() call), so
        // checking the code checkbox immediately reveals Immed on the very
        // next render, no separate live-toggle wiring needed here.
        if (c.immedCode && checked) {
          html += '<label class="attr-check" title="Immediate (check each keystroke rather than at Enter)"><input type="checkbox" class="' + instIdPrefix + '-code-immed" data-for="' + c.code + '" data-immed-code="' + c.immedCode + '" ' + (isImmed ? 'checked' : '') + '/>Immed</label>';
        }
      });
      html += '</div>';
      return html;
    }, expandedSet, addLabel || '+ Add CHECK instance', undefined, checkInstanceIsConditionable));
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
    }, checkInstanceIsConditionable);
  }

  /** "Select Keying Options" - CHECK's ME/ER/MF/FE/RB/RZ/RL/LC codes, sharing
   *  the same underlying CHECK(...) keyword as the Validity check panel's
   *  AB/VN/VNE/M10/M11 checkboxes (see checkInstancesHtml/
   *  wireCheckInstancesEditor above for how the two panels safely share
   *  it) - each panel only touches ITS OWN slice of the code list per
   *  instance, merging with whatever the other panel already set there. */
  function keyingOptionsHtml(keywords, ownerKey, expandedSet, dataType) {
    var html = '<div class="section-label">Keying options</div>';
    html += checkInstancesHtml(keywords, ownerKey + '-keying', expandedSet, KEYING_OPTION_CODES, '+ Add CHECK instance');
    // Task D3 - "Keyboard shift attribute", the other prompt real SDA's
    // "Select Keying Options" screen shows alongside CHECK's codes.
    //
    // Bug fix (L79): this was previously written out as a made-up
    // "KEYBRD" keyword via DspfWriter.getFileFlagKeyword/setFileFlagKeyword
    // - but KEYBRD is not a real DDS keyword at all. Per the DDS
    // Reference's own "Data type/keyboard shift for display files
    // (position 35)" entry, the keyboard shift attribute IS the field's
    // data-type column itself (position 35) - the exact same column the
    // Basic tab's "Data type" dropdown already edits (field.dataType,
    // written via DspfWriter.applyFieldUpdate's `dataType` update, not a
    // keyword). Real SDA shows this prompt on the Keying Options screen
    // too purely for convenience (it's a common thing to set alongside
    // CHECK), so this selector is kept here, but now wired to the SAME
    // field.dataType that dropdown already owns, instead of ever writing
    // a keyword - selecting a value here and reopening the Basic tab now
    // shows the identical value there, and vice versa, since there's only
    // ever the one underlying column.
    //
    // Bug fix (found during the L20/L21/L22 keyword-inventory audit): the
    // CHARACTER field value list here previously read ['S','N','Y','I','D']
    // - wrong on every count against real SDA's own CHARACTER screen
    // (docs/sda-reference/screens/field-level/character/keying-options/
    // image164.png), which shows N/A/X/W/I/D/M/J/O/E/G (11 letters, no S or
    // Y at all). Fixed to match that screenshot for character fields.
    //
    // Bug fix (Task A2 - SDA screenshot keyword-inventory audit follow-up):
    // that fix was applied unconditionally to BOTH character and numeric
    // fields, but real SDA's NUMERIC "Select Keying Options" screen
    // (screens/field-level/numeric/keying-options/image176.png) shows a
    // DIFFERENT, shorter value list - S/N/Y/I/D (5 letters, confirmed
    // identical again on the numeric Database Reference screen's own "New
    // keyboard shift" override column, image183.png) - so numeric fields
    // were being offered 6 character-only values (A/X/W/M/J/O/E/G minus the
    // ones shared with numeric) that don't apply to them, while genuinely
    // losing S and Y entirely (neither letter existed anywhere in the old
    // unconditional 11-value list). `dataType` (the field's own position-
    // 35 data type/keyboard-shift column - the Basic tab's Data type
    // dropdown writes exactly one of '', 'A', 'X', 'N', 'S', 'Y', 'I',
    // 'D', 'M', 'F', 'L', 'T', 'Z', per IBM's own "Data type and keyboard
    // shift for display files (position 35)" table) picks the correct
    // list; a missing/unrecognized dataType falls back to the character
    // list (the wider of the two, so nothing already-set becomes
    // unselectable) rather than guessing wrong in the narrower direction.
    //
    // Task I-31 finding: this used to also test dataType === 'B'/'P' -
    // neither letter is a real position-35 entry (IBM's table above has
    // no B or P row at all, and the Basic tab's own dropdown - the only
    // place dataType is ever set - never offers either), so both arms
    // were dead code that could never actually match. Removed. L/T/Z
    // (Date/Time/Timestamp) are kept in this "numeric-ish" grouping,
    // confirmed correct for keyboard-shift purposes specifically: IBM's
    // own numeric Database Reference screen (image183.png, cited above)
    // and Keying Options screen (image176.png) are the only two SDA
    // screens offering a keyboard-shift override at all, and L/T/Z
    // fields have no screen of their own in real SDA (see
    // docs/sda-reference/screens/field-level's four categories -
    // character/numeric/constant/menu-bar-choice only) - they fall under
    // "numeric" for every field-level UI purpose in real SDA, this one
    // included.
    var isNumericField = dataType === 'S' || dataType === 'Y' || dataType === 'L' || dataType === 'T' || dataType === 'Z' || dataType === 'F';
    var shiftValues = isNumericField ? ['', 'S', 'N', 'Y', 'I', 'D'] : ['', 'N', 'A', 'X', 'W', 'I', 'D', 'M', 'J', 'O', 'E', 'G'];
    html += '<div class="section-label" style="margin-top:8px;">Keyboard shift attribute</div>';
    html += '<div class="hint-small">Not a keyword - this is the field\u2019s own data type (position 35), the same value the Basic tab\u2019s Data type dropdown edits.</div>';
    html += '<select class="' + ownerKey + '-keyboard-shift">' +
      shiftValues.map(function (v) {
        return '<option value="' + v + '"' + ((dataType || '') === v ? ' selected' : '') + '>' + (v || '(none)') + '</option>';
      }).join('') +
      '</select>';
    return html;
  }

  function wireKeyingOptionsEditor(keywords, onChange, ownerKey, expandedSet, rerender, onDataTypeChange) {
    wireCheckInstancesEditor(keywords, onChange, ownerKey + '-keying', expandedSet, rerender, KEYING_OPTION_CODES);
    var shiftEl = document.querySelector('.' + ownerKey + '-keyboard-shift');
    if (shiftEl && onDataTypeChange) {
      shiftEl.addEventListener('change', function () {
        onDataTypeChange(shiftEl.value || null);
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
    // Task I-30: DUP is the only one of these three IBM marks
    // conditionable ("Option indicators are valid for this keyword") -
    // BLANKS and CHANGE (field-level) are both "not valid for this
    // keyword" per their own DDS Reference entries, same restriction
    // record-level CHANGE already had correctly enforced
    // (RECORD_INDICATOR_NO_CONDITIONING_KINDS above) before this fix.
    [
      ['dup', 'DUP', 'Dup key duplicates the previous record\u2019s value into this field', true],
      ['blanks', 'BLANKS', 'Numeric field: let the program tell blank apart from zero', false],
      ['change', 'CHANGE', 'Response indicator turns on if the workstation user changed this field', false],
    ].forEach(function (row) {
      var id = ownerKey + '-inp-' + row[0];
      var kw = DspfWriter.getFileFlagKeyword(keywords, row[1]);
      html += flagRowHtml(id, row[1], kw.present, undefined, undefined, row[3] ? kw.conditions : undefined, expandedSet);
    });
    // Bug fix: CHGINPDFT gets its own dedicated sub-flag checkboxes (see
    // chgInpDftFlagHtml's own comment) instead of the bare on/off row
    // above - it's the one keyword in this list whose real DDS syntax
    // takes parameters at all.
    html += chgInpDftFlagHtml(keywords, ownerKey + '-inp-chginpdft', 'CHGINPDFT', expandedSet);
    return html;
  }

  function wireInputKeywordsEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    ['dup', 'blanks', 'change'].forEach(function (k, i) {
      var name = ['DUP', 'BLANKS', 'CHANGE'][i];
      var id = ownerKey + '-inp-' + k;
      wireFlagRow(
        id,
        function () { return keywords; },
        onChange,
        function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, name, present, params, undefined, conditions); },
        name === 'DUP' ? DspfWriter.getFileFlagKeyword(keywords, name).conditions : undefined,
        expandedSet,
        rerender
      );
    });
    wireChgInpDftFlag(function () { return keywords; }, onChange, ownerKey + '-inp-chginpdft', expandedSet, rerender);
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
  // Task I-30: sixth element is `conditionable` - whether IBM's own DDS
  // Reference says "Option indicators are valid for this keyword" for
  // that row. Checked individually against each keyword's own DDS
  // Reference entry: only DFTVAL/PUTRETAIN/OVRDTA/OVRATR are - the other
  // ten (ALIAS/INDTXT/DFT/CNTFLD/TEXT/FLDCSRPRG/HLPID/CHRID/IGCALTTYP/
  // NOCCSID) are each explicitly "not valid for this keyword", but were
  // all wrongly offering a Conditioning toggle before this fix, since
  // this row list previously passed every row's own `kw.conditions`
  // through unconditionally.
  //
  // I-33 - the 5th element (added after I-30's 5th-element conditionable
  // flag, so shifted to 6th here) is each row's constant-field
  // applicability, confirmed against each keyword's own opening/
  // restriction text in docs/sda-reference/source/DDS_Keyword_V7r6.txt
  // (not inferred from real SDA's "Select General Keywords" screenshots,
  // which are scope-only, per this task's own ground-truth caveat -
  // though the two happen to agree here): 'all' (offered for both
  // constants and named fields), 'named' (explicitly restricted to
  // named/input-output-capable fields - DFTVAL: "You can only use this
  // keyword to initialize named fields. It is not allowed on constant
  // fields."; CNTFLD: "must be defined as an input-capable field with
  // the data type A"; FLDCSRPRG: "is defined as an input-capable
  // field"; CHRID: "is not valid on constant fields..."; IGCALTTYP:
  // "Specify this keyword only for input- and output-capable fields"),
  // or 'constant' (HLPID's own text: "You use this CONSTANT field-level
  // keyword..." - the inverse gap, previously offered to named fields
  // too even though it's constant-only by definition).
  // Task I-35 - the 7th element is each row's Usage M(essage)/
  // P(rogram-to-system) applicability, per IBM's own fixed keyword lists
  // for those two usages (see fieldKeywordCategoryVisibility's own I-35
  // doc comment for the exact DDS Reference wording): 'all' (ALIAS/INDTXT/
  // TEXT - valid for M AND P), 'msg-only' (OVRDTA - valid for M but NOT
  // P, per M's own list including it and P's own list explicitly not),
  // or 'none' (every other row here - DFT/DFTVAL/CNTFLD/FLDCSRPRG/HLPID/
  // PUTRETAIN/OVRATR/CHRID/IGCALTTYP/NOCCSID are on neither usage's fixed
  // list). Only consulted for M/P fields (generalFieldKeywordsHtml/
  // wireGeneralFieldKeywordsEditor's own new `usage` filtering) - this
  // category stays visible as a whole for every other usage, where all 14
  // rows are already correctly gated by 'all'/'named'/'constant' above.
  var GENERAL_FIELD_KEYWORD_ROWS = [
    ['alias', 'ALIAS', 'Alternative (long) name', true, 'all', false, 'all'],
    ['indtxt', 'INDTXT', "e.g. 50 'Amount valid'", true, 'all', false, 'all'],
    ['dft', 'DFT', "e.g. 'N/A' (input-only)", true, 'all', false, 'none'],
    ['dftval', 'DFTVAL', "e.g. 'N/A' (output/both)", true, 'named', true, 'none'],
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
    ['cntfld', 'CNTFLD', 'e.g. 40 (characters per line)', true, 'named', false, 'none'],
    // Bug fix (L22 keyword-inventory audit): TEXT was entirely missing -
    // a pure documentation keyword (no compiled/runtime effect at all,
    // per IBM's own DDS Reference - it's purely for people reading the
    // source later), same bare-quoted-string shape as DFT/DFTVAL above,
    // so it follows their same raw-text-box convention (type the quotes
    // yourself) rather than the auto-quoting getFileQuotedText/
    // setFileQuotedText pair used for the File/Record-level TEXT rows in
    // fileKeywordsPanelsHtml/recordKeywordsPanelsHtml - this row list's
    // own mechanism (getFileFlagKeyword/setFileFlagKeyword) is uniformly
    // raw-text for every quoted keyword already in it, so TEXT matches
    // its neighbors instead of introducing a second convention here.
    ['text', 'TEXT', "e.g. 'Customer number' (documentation only)", true, 'all', false, 'all'],
    ['fldcsrprg', 'FLDCSRPRG', 'Cursor-progression field name', true, 'named', false, 'none'],
    ['hlpid', 'HLPID', 'e.g. FLDHELP1 (constant help identifier)', true, 'constant', false, 'none'],
    ['putretain', 'PUTRETAIN', 'Retain field on display', false, 'all', true, 'none'],
    ['ovrdta', 'OVRDTA', 'Override data', false, 'all', true, 'msg-only'],
    ['ovratr', 'OVRATR', 'Override attributes', false, 'all', true, 'none'],
    ['chrid', 'CHRID', 'Translate characters', false, 'named', false, 'none'],
    ['igcalttyp', 'IGCALTTYP', 'Alter IGC type', false, 'named', false, 'none'],
    ['noccsid', 'NOCCSID', 'No coded character set id', false, 'all', false, 'none'],
    // Task I-39 - BLKFOLD/FLTFIXDEC/FLTPCN/MAPVAL were confirmed entirely
    // missing from iSDA (no getter/setter, no row, no mention anywhere in
    // the codebase) by a full-text audit of DDS_Keyword_V7r6.txt against
    // actual code, cross-checked against KEYWORD-INDEX.md (which had
    // simply never been updated to include them). All four are
    // "Option indicators are not valid for this keyword" per their own
    // DDS Reference entries, so `conditionable` (6th element) is false
    // for each, same as most of this row list's other flag-only rows.
    // The 8th element (`dtScope`, new here - every existing row above
    // implicitly defaults to 'all' since row[7] is simply undefined for
    // them) narrows a row to fields of a particular data type, the same
    // way `mpScope` (7th element) narrows by Usage M/P: 'float-only'
    // (FLTFIXDEC/FLTPCN - IBM's own text: "floating-point field(s)
    // only"/"valid for floating-point fields only"), 'non-float'
    // (BLKFOLD - "You cannot specify the BLKFOLD keyword on a
    // floating-point field"), or 'datetime-only' (MAPVAL - "only valid
    // with the date (L), time (T), or timestamp (Z) data types").
    // FLTPCN's own fixed *SINGLE|*DOUBLE parameter and MAPVAL's own
    // parenthesized value-pair list are both offered as a raw text box
    // (hasParam=true) rather than a dedicated select/list editor here -
    // same "type the DDS text yourself" convention this row list already
    // uses for DFT/DFTVAL/TEXT above, kept deliberately simple for this
    // first pass; a follow-up task can add a friendlier editor for either
    // if it turns out to be worth it.
    ['blkfold', 'BLKFOLD', undefined, false, 'named', false, 'none', 'non-float'],
    ['fltfixdec', 'FLTFIXDEC', undefined, false, 'named', false, 'none', 'float-only'],
    ['fltpcn', 'FLTPCN', '*SINGLE or *DOUBLE', true, 'named', false, 'none', 'float-only'],
    ['mapval', 'MAPVAL', "e.g. ('01/01/40' *BLANK)", true, 'named', false, 'none', 'datetime-only'],
  ];

  /** Task I-39 - resolves GENERAL_FIELD_KEYWORD_ROWS's own 8th element
   *  (`dtScope`) against a field's actual `dataType`, `undefined` (row
   *  omits it, defaulting to 'all') included. Shared by
   *  generalFieldKeywordsHtml/wireGeneralFieldKeywordsEditor so the two
   *  can never disagree about which rows are visible for a given field. */
  function generalFieldKeywordRowMatchesDataType(dtScope, dataType) {
    if (!dtScope || dtScope === 'all') return true;
    if (dtScope === 'float-only') return dataType === 'F';
    if (dtScope === 'non-float') return dataType !== 'F';
    if (dtScope === 'datetime-only') return dataType === 'L' || dataType === 'T' || dataType === 'Z';
    return true;
  }

  // L81 - DFT/DFTVAL are the only two rows here subject to DDS's own
  // documented mutual-exclusion/floating-point restriction (see
  // DspfWriter.dftGroupConflictReason's own doc comment) - both need the
  // field's dataType, which none of this panel's other (purely
  // text/boolean) rows ever needed before.
  var DFT_GROUP_KEYS = { dft: 'DFT', dftval: 'DFTVAL' };

  function generalFieldKeywordsHtml(keywords, ownerKey, expandedSet, dataType, usage, recordKeywords, isConstant) {
    var html = '<div class="section-label">General keywords</div>';
    GENERAL_FIELD_KEYWORD_ROWS.forEach(function (row) {
      var key = row[0], name = row[1], placeholder = row[2], hasParam = row[3], scope = row[4], conditionable = row[5], mpScope = row[6], dtScope = row[7];
      if (scope === 'named' && isConstant) return;
      if (scope === 'constant' && !isConstant) return;
      // Task I-35: Usage M/P each have a fixed, much smaller keyword list
      // than every other usage (see fieldKeywordCategoryVisibility's own
      // I-35 doc comment) - mpScope, unlike scope above, only ever
      // NARROWS what's shown for M/P specifically; every other usage's
      // own visibility is untouched by this check.
      if (usage === 'M' && mpScope === 'none') return;
      if (usage === 'P' && mpScope !== 'all') return;
      // Task I-39 - dtScope narrows a row to fields of a particular data
      // type (see GENERAL_FIELD_KEYWORD_ROWS's own I-39 comment).
      if (!generalFieldKeywordRowMatchesDataType(dtScope, dataType)) return;
      var id = ownerKey + '-gen-' + key;
      var kw = DspfWriter.getFileFlagKeyword(keywords, name);
      html += flagRowHtml(id, name, kw.present, hasParam ? kw.parameters : undefined, hasParam ? placeholder : undefined, conditionable ? kw.conditions : undefined, expandedSet);
      if (key === 'dft' && kw.present) {
        // L83 - advisory only (see DspfWriter.dftOutputRequirementNote's
        // own doc comment for why this isn't a hard block like L81's).
        var note = DspfWriter.dftOutputRequirementNote(usage, keywords, recordKeywords);
        if (note) html += '<div class="hint-small">' + escapeHtml(note) + '</div>';
      }
    });
    return html;
  }

  function wireGeneralFieldKeywordsEditor(keywords, onChange, ownerKey, expandedSet, rerender, dataType, isConstant, usage) {
    GENERAL_FIELD_KEYWORD_ROWS.forEach(function (row) {
      var key = row[0], name = row[1], scope = row[4], conditionable = row[5], mpScope = row[6], dtScope = row[7];
      if (scope === 'named' && isConstant) return;
      if (scope === 'constant' && !isConstant) return;
      // Task I-35 - see generalFieldKeywordsHtml's own I-35 comment above;
      // must match its own skip logic exactly or a row could render (or
      // fail to render) without a matching wire-up.
      if (usage === 'M' && mpScope === 'none') return;
      if (usage === 'P' && mpScope !== 'all') return;
      // Task I-39 - must match generalFieldKeywordsHtml's own dtScope skip
      // logic exactly, same reasoning as the mpScope comment just above.
      if (!generalFieldKeywordRowMatchesDataType(dtScope, dataType)) return;
      var id = ownerKey + '-gen-' + key;
      if (DFT_GROUP_KEYS[key]) {
        // L81 - guarded wiring (alert + revert, same idiom S36-4's own
        // guardedSimple established), instead of the generic wireFlagRow:
        // turning DFT/DFTVAL ON is blocked when the field is a
        // floating-point field or already carries one of the other
        // conflicting keywords (DspfWriter.dftGroupConflictReason).
        // Turning it OFF, editing its own text, or editing an ALREADY-on
        // one's Conditioning is never blocked - only the on-transition
        // can create a NEW conflict.
        var onEl = document.getElementById(id + '-on');
        var paramsEl = document.getElementById(id + '-params');
        var commit = function () {
          var present = onEl.checked;
          var params = paramsEl ? paramsEl.value : '';
          if (present) {
            var reason = DspfWriter.dftGroupConflictReason(name, keywords, dataType);
            if (reason) {
              window.alert(reason);
              var prev = DspfWriter.getFileFlagKeyword(keywords, name);
              onEl.checked = prev.present;
              if (paramsEl) paramsEl.value = prev.parameters;
              return;
            }
          }
          onChange(DspfWriter.setFileFlagKeyword(keywords, name, present, params));
        };
        if (onEl) onEl.addEventListener('change', commit);
        if (paramsEl) paramsEl.addEventListener('change', commit);
        // Task I-30: DFT itself is "not valid for this keyword" per IBM's
        // own DDS Reference, unlike DFTVAL just below it in this same
        // shared branch - only wire the Conditioning control when this
        // row's own `conditionable` flag says so.
        if (conditionable) {
          wireFlagRowConditioning(id, DspfWriter.getFileFlagKeyword(keywords, name).conditions, function (newConditions) {
            onChange(DspfWriter.setFileFlagKeyword(keywords, name, onEl.checked, paramsEl ? paramsEl.value : '', undefined, newConditions));
          }, expandedSet, rerender);
        }
        return;
      }
      wireFlagRow(
        id,
        function () { return keywords; },
        onChange,
        function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, name, present, params, undefined, conditions); },
        conditionable ? DspfWriter.getFileFlagKeyword(keywords, name).conditions : undefined,
        expandedSet,
        rerender
      );
    });
  }

  /** "Define Database Reference" overrides - DLTCHK/DLTEDT. Kept as its
   *  own function (used internally by databaseReferenceHtml below, and
   *  exported for backward compatibility with any existing caller still
   *  on the DLTCHK/DLTEDT-only shape) - real SDA's own "Define Database
   *  Reference" screen (screens/field-level/character/database-reference/
   *  image170.png) shows DLTCHK/DLTEDT as single Y=Yes flags with no
   *  repeatable-instance list, same reasoning as Input keywords above -
   *  one occurrence's own indicator expression already covers every
   *  combination real DDS allows. Uses DspfWriter.getFileFlagKeyword/
   *  setFileFlagKeyword directly (generic over any keywords array),
   *  superseding getReferenceOverrides/setReferenceOverrides (kept for
   *  backward compatibility). */
  function referenceOverridesHtml(keywords, ownerKey, expandedSet) {
    var html = '<div class="section-label" style="margin-top:10px;">Ignore previously specified</div>';
    // Task I-30: both "Option indicators are not valid for this keyword"
    // per their own DDS Reference entries - conditioning was previously
    // offered unconditionally.
    [
      ['dltchk', 'DLTCHK', 'Ignore the referenced field\u2019s own validity-check keywords'],
      ['dltedt', 'DLTEDT', 'Ignore the referenced field\u2019s own edit keywords'],
    ].forEach(function (row) {
      var id = ownerKey + '-ref-' + row[0];
      var kw = DspfWriter.getFileFlagKeyword(keywords, row[1]);
      html += flagRowHtml(id, row[1], kw.present, undefined, undefined, undefined, expandedSet);
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
        undefined,
        expandedSet,
        rerender
      );
    });
  }

  /** L79 - "Define Database Reference", now covering REFFLD itself (see
   *  DspfWriter.getReffldState/applyReffldState's own doc comments for
   *  REFFLD's exact grammar), alongside (not replacing) DLTCHK/DLTEDT
   *  (referenceOverridesHtml above, unchanged).
   *
   *  Bug fix: this panel previously showed ONLY DLTCHK/DLTEDT - REFFLD
   *  itself was reachable solely via the "Resolve Referenced Field"
   *  button, which (a) only works on a field that's ALREADY flagged as a
   *  reference and (b) needs a live Code for i connection just to fill
   *  anything in. Real SDA's own screen (screens/field-level/character/
   *  database-reference/image170.png) lets you type REFFLD's field name/
   *  database file/library/record directly with no live connection at
   *  all - and that screen is ALSO the only place SDA lets you turn a
   *  field INTO a reference field (position 29 'R') to begin with;
   *  "Resolve Referenced Field" can only ever refresh one that already
   *  is. Takes the whole `field` (not just field.keywords), since
   *  `isReference` lives on the field itself, not as a keyword.
   *
   *  Real SDA's own "Override existing field definition" (New field
   *  length/New decimal positions/New keyboard shift) is deliberately
   *  NOT duplicated here - those three are the field's own length/
   *  decimal-positions/data-type columns (positions 25-34/35), already
   *  editable for every field (reference or not) via the Basic tab's
   *  Length/Decimals/Data type inputs. There's no separate field-level
   *  keyword for "override the referenced field's length" - real SDA
   *  writes the override directly into the SAME columns other DDS tools
   *  read as this field's own length/type/decimals, exactly what the
   *  Basic tab already does. */
  function databaseReferenceHtml(field, ownerKey, expandedSet) {
    var state = DspfWriter.getReffldState(field);
    var html = '<div class="section-label">Reference field (REFFLD)</div>';
    html += '<label class="attr-check"><input type="checkbox" id="' + ownerKey + '-reffld-on" ' + (state.isReference ? 'checked' : '') + '/>This field\u2019s length/type/decimals come from a referenced database field (position 29 \u2018R\u2019)</label>';
    html += '<div id="' + ownerKey + '-reffld-fields" style="margin-top:6px;' + (state.isReference ? '' : 'display:none;') + '">';
    html += '<label class="attr-check"><input type="checkbox" id="' + ownerKey + '-reffld-src" ' + (state.useSrc ? 'checked' : '') + '/>Reference current DDS source (*SRC)</label>';
    html += '<div class="two-col" style="margin-top:6px;"><div class="field-row"><label>Field (if different)</label><input type="text" id="' + ownerKey + '-reffld-fieldname" value="' + escapeHtml(state.fieldName) + '" placeholder="' + escapeHtml(field.name || '') + '" /></div>';
    html += '<div class="field-row"><label>Record</label><input type="text" id="' + ownerKey + '-reffld-record" value="' + escapeHtml(state.recordFormat) + '" /></div></div>';
    html += '<div class="two-col" id="' + ownerKey + '-reffld-filelib" style="' + (state.useSrc ? 'display:none;' : '') + '"><div class="field-row"><label>Database file</label><input type="text" id="' + ownerKey + '-reffld-file" value="' + escapeHtml(state.file) + '" /></div>';
    html += '<div class="field-row"><label>Library</label><input type="text" id="' + ownerKey + '-reffld-library" value="' + escapeHtml(state.library) + '" placeholder="*LIBL" /></div></div>';
    html += '<div class="hint-small">Field name is required whenever any of these is filled in (defaults to this field\u2019s own name if left blank) - or leave everything here blank, with just the checkbox above on, for a bare \u2018same-named field\u2019 reference.</div>';
    html += '</div>';
    // Task I-35: DLTCHK/DLTEDT are NOT on Usage M/P's own fixed keyword
    // lists (unlike REFFLD above, which IS - see
    // fieldKeywordCategoryVisibility's own I-35 doc comment) - skipped
    // for M/P fields specifically, matching wireDatabaseReferenceEditor's
    // own matching skip just below.
    if (field.usage !== 'M' && field.usage !== 'P') {
      html += referenceOverridesHtml(field.keywords, ownerKey, expandedSet);
    }
    return html;
  }

  /** `onFieldChange(updates)` receives a partial field update (e.g.
   *  `{ isReference, keywords }`) suitable for DspfWriter.applyFieldUpdate/
   *  the webview's own commitEdit wrapper around it - NOT just a keywords
   *  array, since toggling "Reference field" needs to touch
   *  field.isReference too. DLTCHK/DLTEDT's own edits (via
   *  wireReferenceOverridesEditor, unchanged) are wrapped to the same
   *  callback as a keywords-only update. */
  function wireDatabaseReferenceEditor(field, onFieldChange, ownerKey, expandedSet, rerender) {
    var onEl = document.getElementById(ownerKey + '-reffld-on');
    var fieldsEl = document.getElementById(ownerKey + '-reffld-fields');
    var srcEl = document.getElementById(ownerKey + '-reffld-src');
    var fileLibEl = document.getElementById(ownerKey + '-reffld-filelib');
    var fieldNameEl = document.getElementById(ownerKey + '-reffld-fieldname');
    var recordEl = document.getElementById(ownerKey + '-reffld-record');
    var fileEl = document.getElementById(ownerKey + '-reffld-file');
    var libraryEl = document.getElementById(ownerKey + '-reffld-library');

    function readState() {
      return {
        isReference: !!(onEl && onEl.checked),
        useSrc: !!(srcEl && srcEl.checked),
        fieldName: fieldNameEl ? fieldNameEl.value.trim().toUpperCase() : '',
        recordFormat: recordEl ? recordEl.value.trim().toUpperCase() : '',
        file: fileEl ? fileEl.value.trim().toUpperCase() : '',
        library: libraryEl ? libraryEl.value.trim().toUpperCase() : '',
      };
    }

    function commit() {
      var state = readState();
      var newKeywords = DspfWriter.applyReffldState(field.keywords, field.name, state);
      onFieldChange({ isReference: state.isReference, keywords: newKeywords });
    }

    if (onEl) {
      onEl.addEventListener('change', function () {
        if (fieldsEl) fieldsEl.style.display = onEl.checked ? '' : 'none';
        commit();
      });
    }
    if (srcEl) {
      srcEl.addEventListener('change', function () {
        if (fileLibEl) fileLibEl.style.display = srcEl.checked ? 'none' : '';
        commit();
      });
    }
    [fieldNameEl, recordEl, fileEl, libraryEl].forEach(function (el) {
      if (el) el.addEventListener('change', commit);
    });

    // Task I-35: skip wiring DLTCHK/DLTEDT for M/P fields - matches
    // databaseReferenceHtml's own matching skip (neither keyword is on
    // Usage M/P's fixed list, so their rows are never rendered there).
    if (field.usage !== 'M' && field.usage !== 'P') {
      wireReferenceOverridesEditor(field.keywords, function (newKeywords) { onFieldChange({ keywords: newKeywords }); }, ownerKey, expandedSet, rerender);
    }
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
  //
  // Task I-26 added SFLSCROLL to this same screen - also a simple
  // present/absent flag, no parameters - since it shares the same "one
  // hidden numeric field within SFL/SFLCTL" shape and IBM's own DDS
  // Reference explicitly groups it with SFLRCDNBR/SFLROLVAL ("You cannot
  // specify the SFLROLVAL, the SFLSCROLL and the SFLRCDNBR keywords for
  // the same field"). `siblingFieldsKeywords` (every OTHER field's own
  // keywords array in the same record) is needed only for SFLSCROLL's own
  // extra "only one per record" rule - see
  // DspfWriter.sflScrollFieldConflictReason's own doc comment.
  // -----------------------------------------------------------------------

  function subfileFieldKeywordsHtml(keywords, ownerKey) {
    var rcdnbr = DspfWriter.getFileFlagKeyword(keywords, 'SFLRCDNBR');
    var rolval = DspfWriter.getFileFlagKeyword(keywords, 'SFLROLVAL');
    var scroll = DspfWriter.getFileFlagKeyword(keywords, 'SFLSCROLL');
    // Task I-39 - SFLCHCCTL/SFLCSRPRG were confirmed entirely missing from
    // iSDA (no getter/setter, no row, no mention anywhere) by a full-text
    // audit of DDS_Keyword_V7r6.txt against actual code. Both are simple,
    // no-parameter, non-conditionable field-level flags ("Option
    // indicators are not valid for this keyword" per each's own DDS
    // Reference entry) that only make sense on a field within an SFL/
    // SFLCTL record - same shape and same panel as SFLRCDNBR/SFLROLVAL/
    // SFLSCROLL just above, so they're added here rather than as a new
    // accordion. SFLCHCCTL has real structural requirements this first
    // pass doesn't hard-block (must be the record's first field, length 1,
    // data type Y, decimal positions 0, usage H) - surfaced as a hint
    // rather than a guard, same "close the entirely-missing gap first"
    // scope I-39's own claim comment in keywordFixes.md documents.
    var chcctl = DspfWriter.getFileFlagKeyword(keywords, 'SFLCHCCTL');
    var csrprg = DspfWriter.getFileFlagKeyword(keywords, 'SFLCSRPRG');
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
    html += '<label class="attr-check" style="margin-top:8px;"><input type="checkbox" id="' + ownerKey + '-sflscroll" ' + (scroll.present ? 'checked' : '') + '/>Return top-of-subfile record number on scroll (SFLSCROLL)</label>';
    html += '<div class="hint-small">SFLROLVAL, SFLSCROLL, and SFLRCDNBR cannot share one field, and only one field in the whole record can carry SFLSCROLL.</div>';
    html += '<label class="attr-check" style="margin-top:8px;"><input type="checkbox" id="' + ownerKey + '-sflchcctl" ' + (chcctl.present ? 'checked' : '') + '/>Choice control field for a selection list (SFLCHCCTL)</label>';
    html += '<div class="hint-small">Must be the first field in the subfile record: length 1, data type Y (zoned numeric), 0 decimal positions, usage H (hidden). Only one field per record can carry this.</div>';
    html += '<label class="attr-check" style="margin-top:8px;"><input type="checkbox" id="' + ownerKey + '-sflcsrprg" ' + (csrprg.present ? 'checked' : '') + '/>Cursor progresses to same field in next subfile record (SFLCSRPRG)</label>';
    html += '<div class="hint-small">Ignored on displays not attached to a controller with an enhanced data stream. Not allowed in a record that also carries SFLLIN.</div>';
    return html;
  }

  function wireSubfileFieldKeywords(keywords, onChange, ownerKey, siblingFieldsKeywords) {
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
    var scrollEl = document.getElementById(ownerKey + '-sflscroll');
    if (scrollEl) {
      scrollEl.addEventListener('change', function () {
        if (scrollEl.checked) {
          var reason = DspfWriter.sflScrollFieldConflictReason(keywords, siblingFieldsKeywords);
          if (reason) {
            window.alert(reason);
            scrollEl.checked = false;
            return;
          }
        }
        onChange(DspfWriter.setFileFlagKeyword(keywords, 'SFLSCROLL', scrollEl.checked));
      });
    }
    // Task I-39 - SFLCHCCTL/SFLCSRPRG (see subfileFieldKeywordsHtml's own
    // I-39 comment above). Neither is conditionable per IBM's own DDS
    // Reference, and neither has real structural guards wired here yet
    // (see the same comment for why) - a plain present/absent toggle,
    // same as SFLROLVAL just above.
    var chcctlEl = document.getElementById(ownerKey + '-sflchcctl');
    if (chcctlEl) {
      chcctlEl.addEventListener('change', function () {
        onChange(DspfWriter.setFileFlagKeyword(keywords, 'SFLCHCCTL', chcctlEl.checked));
      });
    }
    var csrprgEl = document.getElementById(ownerKey + '-sflcsrprg');
    if (csrprgEl) {
      csrprgEl.addEventListener('change', function () {
        onChange(DspfWriter.setFileFlagKeyword(keywords, 'SFLCSRPRG', csrprgEl.checked));
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
  function menuBarChoicesHtml(keywords, ownerKey, expandedSet) {
    var choices = DspfWriter.getMenubarChoices(keywords);
    var html = '<div class="section-label">Menu-bar choices (MNUBARCHC)</div>';
    html += '<div id="' + ownerKey + '-mnubarchc-rows">';
    choices.forEach(function (c, idx) {
      html += menuBarChoiceRowHtml(ownerKey, idx, c, expandedSet);
    });
    html += '</div>';
    html += '<button class="secondary ' + ownerKey + '-mnubarchc-add" style="width:100%;margin-top:6px;">+ Add choice</button>';
    html += '<button class="' + ownerKey + '-mnubarchc-apply" style="width:100%;margin-top:6px;">Apply menu-bar choices</button>';
    return html;
  }

  function menuBarChoiceRowHtml(ownerKey, idx, c, expandedSet) {
    c = c || { id: '', pulldownRecord: '', text: '', returnField: '', conditions: [] };
    var conditions = c.conditions || [];
    var row = '<div class="choice-row-block" data-idx="' + idx + '" data-choice-id="' + escapeHtml(c.id) + '" style="border:1px solid var(--border,#333);border-radius:4px;padding:8px;margin-bottom:8px;">';
    row += '<div class="choice-row">' +
      '<input type="text" class="' + ownerKey + '-mnubarchc-id" placeholder="#" maxlength="3" value="' + escapeHtml(c.id) + '" style="width:36px;" />' +
      '<input type="text" class="' + ownerKey + '-mnubarchc-record" placeholder="pulldown record" maxlength="10" value="' + escapeHtml(c.pulldownRecord) + '" style="flex:1;" />' +
      '<button class="secondary ' + ownerKey + '-mnubarchc-remove" data-idx="' + idx + '" title="Remove">&times;</button>' +
      '</div>';
    row += '<input type="text" class="' + ownerKey + '-mnubarchc-text" placeholder="text, or &field" value="' + escapeHtml(c.text) + '" style="width:100%;margin-top:6px;" />';
    row += '<input type="text" class="' + ownerKey + '-mnubarchc-returnfield" placeholder="return field (opt.)" maxlength="11" value="' + escapeHtml(c.returnField || '') + '" style="width:100%;margin-top:6px;" />';
    // Task I-34: MNUBARCHC is documented "Option indicators are valid for
    // this keyword" - a per-choice Conditioning toggle, same kw-cond-
    // toggle/kw-cond-body markup entFldAtrHtml's own single-instance
    // toggle uses, keyed by choice-id (not idx) since
    // setMenubarChoiceConditions targets the MNUBARCHC keyword by
    // choice-number, not ordinal position - only rendered once the row
    // has a real id (a brand-new "+ Add choice" row has nothing to key
    // conditioning against until it's been given a number and applied).
    if (c.id) {
      var condKey = ownerKey + '-mnubarchc-cond-' + c.id;
      var condSummary = conditions.length > 0 ? ' (' + conditions.length + ')' : '';
      var condExpanded = !!(expandedSet && expandedSet.has(condKey + ':cond'));
      row += '<span class="kw-cond-toggle" data-flag-id="' + condKey + '" style="display:inline-block;margin-top:6px;">Conditioning' + condSummary + (condExpanded ? ' \u25b4' : ' \u25be') + '</span>';
      if (condExpanded) {
        row += '<div class="kw-cond-body">' + conditionsEditorHtml(conditions, condKey + '-cond', expandedSet) + '</div>';
      }
    }
    row += '</div>';
    return row;
  }

  function wireMenuBarChoicesEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var container = document.getElementById(ownerKey + '-mnubarchc-rows');
    if (!container) return;
    var addBtn = document.querySelector('.' + ownerKey + '-mnubarchc-add');
    var applyBtn = document.querySelector('.' + ownerKey + '-mnubarchc-apply');
    if (addBtn) addBtn.addEventListener('click', function () {
      container.insertAdjacentHTML('beforeend', menuBarChoiceRowHtml(ownerKey, container.children.length, null, expandedSet));
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
    // Task I-34: per-choice Conditioning toggle, commits immediately via
    // DspfWriter.setMenubarChoiceConditions (id-keyed), independent of
    // the batch "Apply menu-bar choices" button above - same "Conditioning
    // commits immediately, other fields commit via Apply" split
    // wireEntFldAtrEditor already uses.
    var menuChoices = DspfWriter.getMenubarChoices(keywords);
    document.querySelectorAll('.choice-row-block[data-choice-id]').forEach(function (block) {
      var id = block.getAttribute('data-choice-id');
      if (!id) return;
      var existing = menuChoices.find(function (c) { return c.id === id; });
      var condKey = ownerKey + '-mnubarchc-cond-' + id;
      wireFlagRowConditioning(condKey, existing ? existing.conditions : [], function (newConditions) {
        onChange(DspfWriter.setMenubarChoiceConditions(keywords, id, newConditions));
      }, expandedSet, rerender);
    });
  }

  /** MNUBARSEP - the menu-bar's own separator line. Same "enable checkbox
   *  per group, one Apply" shape as WDWBORDER (see fileKeywordsPanelsHtml's
   *  own windowBorder panel) but a single separator character instead of 8
   *  border positions, and no *CHAR-less alternative for a bare Y default -
   *  real SDA's own screen always pairs the Y flag with its own field. */
  function menuBarSeparatorHtml(keywords, ownerKey, expandedSet) {
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
    // Task I-34: MNUBARSEP is documented "Option indicators are valid for
    // this keyword" - reverse gap, no toggle existed before. Same single-
    // instance kw-cond-toggle/kw-cond-body shape entFldAtrHtml uses.
    var condSummary = sep.conditions.length > 0 ? ' (' + sep.conditions.length + ')' : '';
    var condExpanded = !!(expandedSet && expandedSet.has(ownerKey + '-mnubarsep:cond'));
    html += '<span class="kw-cond-toggle" data-flag-id="' + ownerKey + '-mnubarsep" style="display:inline-block;margin:8px 0 0;">Conditioning' + condSummary + (condExpanded ? ' \u25b4' : ' \u25be') + '</span>';
    if (condExpanded) {
      html += '<div class="kw-cond-body">' + conditionsEditorHtml(sep.conditions, ownerKey + '-mnubarsep-cond', expandedSet) + '</div>';
    }
    html += '<button class="secondary ' + ownerKey + '-mnubarsep-apply" style="width:100%;margin-top:8px;">Apply separator</button>';
    return html;
  }

  function wireMenuBarSeparatorEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var applyBtn = document.querySelector('.' + ownerKey + '-mnubarsep-apply');
    if (applyBtn) {
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
    // Task I-34: Conditioning commits immediately (id-less - MNUBARSEP is
    // a single instance), independent of the "Apply separator" button
    // above - same split wireEntFldAtrEditor uses.
    wireFlagRowConditioning(ownerKey + '-mnubarsep', DspfWriter.getMenubarSeparator(keywords).conditions, function (newConditions) {
      var current = DspfWriter.getMenubarSeparator(keywords);
      onChange(DspfWriter.setMenubarSeparator(keywords, {
        colorEnabled: !!current.color, color: current.color,
        attrsEnabled: current.attrs.length > 0, attrs: current.attrs,
        charEnabled: !!current.char, char: current.char,
        conditions: newConditions,
      }));
    }, expandedSet, rerender);
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

  /** Task I-34: IBM's MLTCHCFLD format string has no *AUTOSLT/*AUTOENT
   *  family at all - those two radio groups exist ONLY on SNGCHCFLD.
   *  Mirrors DspfWriter.SNGCHCFLD_ONLY_FLAGS' own group names. */
  var SNGCHCFLD_ONLY_GROUPS = { autoslt: true, autoent: true };

  /** SNGCHCFLD/MLTCHCFLD - marks a field as a single- or multiple-choice
   *  selection field and its own *param behavior flags. This is the entry
   *  point for the other choice panels below (choiceKeywordsListHtml/
   *  choiceColorStatesHtml only make sense once a field IS one of these).
   *  No Conditioning toggle here (and correctly so): IBM's own SNGCHCFLD/
   *  MLTCHCFLD reference text states "Option indicators are not valid for
   *  this keyword" for both. */
  function choiceSelectionTypeHtml(keywords, ownerKey) {
    var state = DspfWriter.getChoiceSelectionType(keywords);
    var html = '<div class="section-label">Choice selection type</div>';
    html += '<div class="field-row"><label>Type</label><select id="' + ownerKey + '-cst-kind">' +
      ['', 'SNGCHCFLD', 'MLTCHCFLD'].map(function (k) {
        var label = k === '' ? '(not a choice field)' : k === 'SNGCHCFLD' ? '1=SNGCHCFLD (single choice)' : '2=MLTCHCFLD (multiple choice)';
        return '<option value="' + k + '"' + (state.kind === k ? ' selected' : '') + '>' + label + '</option>';
      }).join('') + '</select></div>';
    CHOICE_SELECTION_RADIO_GROUPS.forEach(function (group) {
      // Task I-34: *AUTOSLT/*AUTOENT only exist on SNGCHCFLD's own format
      // string - don't even render the group when the field is MLTCHCFLD
      // (or not yet a choice field), so there's nothing stale left in the
      // DOM for wireChoiceSelectionTypeEditor's own kind-based guard to
      // have to filter out.
      if (state.kind !== 'SNGCHCFLD' && SNGCHCFLD_ONLY_GROUPS[group.name]) return;
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
      var kind = document.getElementById(ownerKey + '-cst-kind').value;
      var flags = [];
      CHOICE_SELECTION_RADIO_GROUPS.forEach(function (group) {
        // Task I-34: re-check kind here too, not just by omitting the
        // <select> from the rendered HTML above - if the Type dropdown
        // is switched away from SNGCHCFLD client-side without a full
        // rerender in between, a stale autoslt/autoent <select> left
        // over from the PREVIOUS render could otherwise still be read.
        if (kind !== 'SNGCHCFLD' && SNGCHCFLD_ONLY_GROUPS[group.name]) return;
        var sel = document.querySelector('.' + ownerKey + '-cst-' + group.name);
        if (sel && sel.value) flags.push(sel.value);
      });
      onChange(DspfWriter.setChoiceSelectionType(keywords, {
        kind: kind,
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
  function choiceKeywordsListHtml(keywords, ownerKey, expandedSet) {
    var choices = DspfWriter.getChoices(keywords);
    var controls = DspfWriter.getChoiceControls(keywords);
    var accelerators = DspfWriter.getChoiceAccelerators(keywords);
    var ids = {};
    choices.forEach(function (c) { ids[c.id] = true; });
    controls.forEach(function (c) { ids[c.id] = true; });
    accelerators.forEach(function (c) { ids[c.id] = true; });
    var merged = Object.keys(ids).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }).map(function (id) {
      var choice = choices.find(function (c) { return c.id === id; }) || { text: '', spaceBefore: false, conditions: [] };
      var control = controls.find(function (c) { return c.id === id; }) || { controlField: '', messageId: '', messageFile: '', library: '' };
      var accel = accelerators.find(function (c) { return c.id === id; }) || { text: '' };
      return { id: id, text: choice.text, spaceBefore: choice.spaceBefore, controlField: control.controlField, messageId: control.messageId, messageFile: control.messageFile, library: control.library, accelText: accel.text, conditions: choice.conditions || [] };
    });
    var html = '<div class="section-label">Choice keywords (CHOICE / CHCCTL / CHCACCEL)</div>';
    html += '<div id="' + ownerKey + '-choicekw-rows">';
    merged.forEach(function (c, idx) { html += choiceKeywordRowHtml(ownerKey, idx, c, expandedSet); });
    html += '</div>';
    html += '<button class="secondary ' + ownerKey + '-choicekw-add" style="width:100%;margin-top:6px;">+ Add choice</button>';
    html += '<button class="' + ownerKey + '-choicekw-apply" style="width:100%;margin-top:6px;">Apply choice keywords</button>';
    return html;
  }

  function choiceKeywordRowHtml(ownerKey, idx, c, expandedSet) {
    c = c || { id: '', text: '', spaceBefore: false, controlField: '', messageId: '', messageFile: '', library: '', accelText: '', conditions: [] };
    var conditions = c.conditions || [];
    var row = '<div class="choice-row-block" data-idx="' + idx + '" data-choice-id="' + escapeHtml(c.id) + '" style="border:1px solid var(--border,#333);border-radius:4px;padding:8px;margin-bottom:8px;">';
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
    // Task I-34: *SPACEB - CHOICE's own optional trailing flag ("insert a
    // blank space/line before this choice"), previously unmodeled.
    row += '<label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;"><input type="checkbox" class="' + ownerKey + '-choicekw-spaceb" ' + (c.spaceBefore ? 'checked' : '') + ' /> Insert blank before this choice (*SPACEB)</label>';
    // Task I-34: CHOICE is documented "Option indicators are valid for
    // this keyword" - a per-choice Conditioning toggle, same kw-cond-
    // toggle/kw-cond-body markup menuBarChoiceRowHtml's own per-instance
    // toggle uses, keyed by choice-id (not idx) since setChoiceConditions
    // targets the CHOICE keyword by choice-number, not ordinal position -
    // only rendered once the row has a real id.
    if (c.id) {
      var condKey = ownerKey + '-choicekw-cond-' + c.id;
      var condSummary = conditions.length > 0 ? ' (' + conditions.length + ')' : '';
      var condExpanded = !!(expandedSet && expandedSet.has(condKey + ':cond'));
      row += '<span class="kw-cond-toggle" data-flag-id="' + condKey + '" style="display:inline-block;margin-top:6px;">Conditioning' + condSummary + (condExpanded ? ' \u25b4' : ' \u25be') + '</span>';
      if (condExpanded) {
        row += '<div class="kw-cond-body">' + conditionsEditorHtml(conditions, condKey + '-cond', expandedSet) + '</div>';
      }
    }
    row += '</div>';
    return row;
  }

  function wireChoiceKeywordsListEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var container = document.getElementById(ownerKey + '-choicekw-rows');
    if (!container) return;
    var addBtn = document.querySelector('.' + ownerKey + '-choicekw-add');
    var applyBtn = document.querySelector('.' + ownerKey + '-choicekw-apply');
    if (addBtn) addBtn.addEventListener('click', function () {
      container.insertAdjacentHTML('beforeend', choiceKeywordRowHtml(ownerKey, container.children.length, null, expandedSet));
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
        var spacebEl = row.querySelector('.' + ownerKey + '-choicekw-spaceb');
        choices.push({ id: id, text: row.querySelector('.' + ownerKey + '-choicekw-text').value, spaceBefore: !!(spacebEl && spacebEl.checked) });
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
    // Task I-34: per-choice Conditioning toggle, commits immediately via
    // DspfWriter.setChoiceConditions (id-keyed), independent of the batch
    // "Apply choice keywords" button above - same split wireEntFldAtrEditor
    // already uses.
    var choiceList = DspfWriter.getChoices(keywords);
    document.querySelectorAll('.choice-row-block[data-choice-id]').forEach(function (block) {
      var id = block.getAttribute('data-choice-id');
      if (!id) return;
      var existing = choiceList.find(function (c) { return c.id === id; });
      var condKey = ownerKey + '-choicekw-cond-' + id;
      wireFlagRowConditioning(condKey, existing ? existing.conditions : [], function (newConditions) {
        onChange(DspfWriter.setChoiceConditions(keywords, id, newConditions));
      }, expandedSet, rerender);
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
  function choiceColorStatesHtml(keywords, ownerKey, expandedSet) {
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
      // Task I-34: CHCAVAIL/CHCUNAVAIL/CHCSLT are each documented "Option
      // indicators are valid for this keyword" - getChoiceColorState/
      // setChoiceColorState already carry a `conditions` field (added
      // during I-3's ENTFLDATR fix, since they share the same generic
      // function), but no panel ever rendered a toggle for THESE three
      // callers until now - a reverse gap same shape as ENTFLDATR's own.
      var condId = ownerKey + '-ccs-' + state.key;
      var condSummary = current.conditions.length > 0 ? ' (' + current.conditions.length + ')' : '';
      var condExpanded = !!(expandedSet && expandedSet.has(condId + ':cond'));
      html += '<span class="kw-cond-toggle" data-flag-id="' + condId + '" style="display:inline-block;margin-top:4px;">Conditioning' + condSummary + (condExpanded ? ' \u25b4' : ' \u25be') + '</span>';
      if (condExpanded) {
        html += '<div class="kw-cond-body">' + conditionsEditorHtml(current.conditions, condId + '-cond', expandedSet) + '</div>';
      }
      html += '</div>';
    });
    html += '<button class="secondary ' + ownerKey + '-ccs-apply" style="width:100%;margin-top:6px;">Apply choice colors &amp; attributes</button>';
    return html;
  }

  function wireChoiceColorStatesEditor(keywords, onChange, ownerKey, expandedSet, rerender) {
    var applyBtn = document.querySelector('.' + ownerKey + '-ccs-apply');
    if (applyBtn) {
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
    // Task I-34: Conditioning commits immediately per state, independent
    // of the shared Apply button above - same split wireEntFldAtrEditor
    // already uses.
    CHOICE_COLOR_STATES.forEach(function (state) {
      var condId = ownerKey + '-ccs-' + state.key;
      wireFlagRowConditioning(condId, DspfWriter.getChoiceColorState(keywords, state.keyword).conditions, function (newConditions) {
        var current = DspfWriter.getChoiceColorState(keywords, state.keyword);
        onChange(DspfWriter.setChoiceColorState(keywords, state.keyword, current.color, current.attrs, newConditions));
      }, expandedSet, rerender);
    });
  }

  // Bug fix (L21's own follow-up note, now resolved via web research rather
  // than guessed): ENTFLDATR's real DDS syntax is
  // `ENTFLDATR((*COLOR color) (*DSPATR attr attr...))` - confirmed via a
  // real-world DDS source example (`ENTFLDATR((*COLOR BLU) (*DSPATR HI
  // UL))`) plus IBM's own keyword-reference table listing ENTFLDATR as
  // valid at File, Record, AND Field level - i.e. the EXACT SAME
  // `(*COLOR c) (*DSPATR a a)` shape CHCAVAIL/CHCUNAVAIL/CHCSLT already
  // use, which is why this reuses DspfWriter.getChoiceColorState/
  // setChoiceColorState directly rather than writing a near-duplicate
  // getEntFldAtr/setEntFldAtr pair - those functions are already generic
  // over `keywordName` (nothing "choice"-specific inside them despite the
  // name), so passing 'ENTFLDATR' just works. The *DSPATR checkbox subset
  // reuses WDWBORDER_ATTRS (HI/RI/CS/BL/ND/UL) - the same restricted
  // subset this codebase already offers for every OTHER compound
  // (*COLOR)/(*DSPATR) keyword (WDWBORDER, CHCAVAIL/CHCUNAVAIL/CHCSLT) -
  // rather than the full 11-value DSPATR_ATTRS list, since none of those
  // precedents ever offer PC/MDT/PR/OID/SP as a *DSPATR sub-value either.
  // Task I-3: ENTFLDATR is documented by IBM as "Option indicators are
  // valid for this keyword" - a reverse gap (unlike I-3's other findings,
  // this keyword needed a Conditioning toggle ADDED, since entFldAtrHtml's
  // custom Apply-button shape never had one at all). Reuses flagRowHtml's
  // own toggle markup/id convention (`ownerKey + '-cond'` etc.) so
  // wireFlagRowConditioning can wire it unchanged, the same as every
  // flagRowHtml-based row already does.
  function entFldAtrHtml(keywords, ownerKey, expandedSet) {
    var current = DspfWriter.getChoiceColorState(keywords, 'ENTFLDATR');
    var enabled = !!current.color || current.attrs.length > 0;
    var html = '<div class="section-label">Entry field attribute (ENTFLDATR)</div>';
    html += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="' + ownerKey + '-on" ' + (enabled ? 'checked' : '') + ' /> Change attributes while the cursor is in the field</label>';
    html += '<select id="' + ownerKey + '-color">' + COLOR_VALUES.map(function (c) {
      return '<option value="' + c + '"' + (current.color === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>';
    }).join('') + '</select>';
    html += '<div class="attr-checks">' + WDWBORDER_ATTRS.map(function (a) {
      var checked = current.attrs.indexOf(a) >= 0;
      return '<label class="attr-check"><input type="checkbox" class="' + ownerKey + '-attr" value="' + a + '" ' + (checked ? 'checked' : '') + '/>' + a + '</label>';
    }).join('') + '</div>';
    var condSummary = current.conditions.length > 0 ? ' (' + current.conditions.length + ')' : '';
    var isExpanded = !!(expandedSet && expandedSet.has(ownerKey + ':cond'));
    html += '<span class="kw-cond-toggle" data-flag-id="' + ownerKey + '" style="margin-top:4px;">Conditioning' + condSummary + (isExpanded ? ' \u25b4' : ' \u25be') + '</span>';
    if (isExpanded) {
      html += '<div class="kw-cond-body">' + conditionsEditorHtml(current.conditions, ownerKey + '-cond', expandedSet) + '</div>';
    }
    html += '<button class="secondary ' + ownerKey + '-apply" style="width:100%;margin-top:8px;">Apply entry field attribute</button>';
    return html;
  }

  function wireEntFldAtrEditor(getKeywords, onChange, ownerKey, expandedSet, rerender) {
    var applyBtn = document.querySelector('.' + ownerKey + '-apply');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', function () {
      var on = document.getElementById(ownerKey + '-on').checked;
      var color = on ? document.getElementById(ownerKey + '-color').value : '';
      var attrs = on ? Array.prototype.slice.call(document.querySelectorAll('.' + ownerKey + '-attr:checked')).map(function (el) { return el.value; }) : [];
      onChange(DspfWriter.setChoiceColorState(getKeywords(), 'ENTFLDATR', color, attrs));
    });
    wireFlagRowConditioning(ownerKey, DspfWriter.getChoiceColorState(getKeywords(), 'ENTFLDATR').conditions, function (newConditions) {
      var current = DspfWriter.getChoiceColorState(getKeywords(), 'ENTFLDATR');
      onChange(DspfWriter.setChoiceColorState(getKeywords(), 'ENTFLDATR', current.color, current.attrs, newConditions));
    }, expandedSet, rerender);
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
  // multi-field structure (REF, PRINT's print-file form, WDWBORDER,
  // Display sizes) get their own markup below instead of being forced
  // through that shape.
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

  // Bug fix (reported: user's own screenshot of real SDA's "Change Input
  // Defaults" screen for CHGINPDFT): every wireFlagRow call site for
  // CHGINPDFT offered only a bare on/off checkbox (or, at File/Record
  // level, a raw free-text parameter box) - there was no way to pick
  // CHGINPDFT's own 9 sub-flags (HI/RI/CS/BL/UL/LC/ME/MF/FE) the way real
  // SDA's dedicated "Select parameters" sub-screen does, confirmed
  // against the uploaded screenshot ("Field . . . : D1_DESC"). One shared
  // component here, reused at every CHGINPDFT call site (File-level,
  // Record General, SFLMSG General, Field Input keywords) per this
  // codebase's own "build once, wire in many places" convention (see
  // PICKER-SCREENS-PLAN.md) - CHGINPDFT's shape doesn't vary by level.
  var CHGINPDFT_CODES = ['HI', 'RI', 'CS', 'BL', 'UL', 'LC', 'ME', 'MF', 'FE'];
  var CHGINPDFT_LABELS = {
    HI: 'High intensity', RI: 'Reverse image', CS: 'Column separators', BL: 'Blink',
    UL: 'Underline', LC: 'Lowercase allowed', ME: 'Mandatory entry', MF: 'Mandatory fill',
    FE: 'Field exit key required',
  };

  /** flagRowHtml's own checkbox+Conditioning row for CHGINPDFT, PLUS its 9
   *  sub-flag checkboxes (same `.attr-checks`/`.attr-check` markup
   *  colorAttrEditorHtml already uses for DSPATR, so it inherits that
   *  styling for free). flagRowHtml itself is called with NO visible
   *  params box (paramsPlaceholder omitted) - a hidden input carries the
   *  space-joined code list instead, so wireFlagRow's existing
   *  id+'-params' commit wiring can stay completely unchanged; the
   *  checkboxes just keep that hidden input in sync (see
   *  wireChgInpDftFlag below). */
  function chgInpDftFlagHtml(keywords, id, label, expandedSet) {
    var kw = DspfWriter.getFileFlagKeyword(keywords, 'CHGINPDFT');
    var codes = (kw.parameters || '').trim().length ? kw.parameters.trim().split(/\s+/) : [];
    // Task I-3: CHGINPDFT - "Option indicators are not valid for this
    // keyword" per IBM's own DDS Reference - no Conditioning toggle.
    var html = flagRowHtml(id, label, kw.present, undefined, undefined, undefined, undefined);
    html += '<input type="hidden" id="' + id + '-params" value="' + escapeHtml(kw.parameters || '') + '" />';
    html += '<div class="attr-checks" style="margin:2px 0 10px 22px;">';
    CHGINPDFT_CODES.forEach(function (code) {
      var checked = codes.indexOf(code) >= 0;
      html += '<label class="attr-check" title="' + escapeHtml(CHGINPDFT_LABELS[code]) + '"><input type="checkbox" class="' + id + '-code" value="' + code + '" ' + (checked ? 'checked' : '') + '/>' + code + '</label>';
    });
    html += '</div>';
    return html;
  }

  /** Wires chgInpDftFlagHtml's row exactly like any other flagRowHtml (via
   *  wireFlagRow, unchanged) PLUS the 9 sub-flag checkboxes: each one
   *  recomputes the space-joined code list into the hidden params input
   *  and dispatches 'change' on it, which wireFlagRow's own existing
   *  paramsEl listener already picks up - no new commit path needed.
   *  Checking any code also force-checks the main on/off box (a code with
   *  CHGINPDFT absent would otherwise be silently dropped by
   *  setFileFlagKeyword's own `if (present)` gate - see its doc comment).
   *  `getKeywords` is a FUNCTION (matching wireFlagRow's own contract, and
   *  every other 'simple'-style call site in this file) rather than a
   *  plain array, so a commit always reflects whatever else has already
   *  been committed on this same render - callers with only a captured
   *  array in scope just wrap it as `function () { return keywords; }`. */
  function wireChgInpDftFlag(getKeywords, onChange, id, expandedSet, rerender) {
    // Task I-3: CHGINPDFT - "Option indicators are not valid for this
    // keyword" - no Conditioning toggle wired (matches
    // chgInpDftFlagHtml's own conditions:undefined for this row).
    wireFlagRow(
      id,
      getKeywords,
      onChange,
      function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, 'CHGINPDFT', present, params, undefined, conditions); },
      undefined,
      undefined,
      undefined
    );
    document.querySelectorAll('.' + id + '-code').forEach(function (el) {
      el.addEventListener('change', function () {
        var codes = Array.prototype.slice.call(document.querySelectorAll('.' + id + '-code:checked')).map(function (e) { return e.value; });
        var onEl = document.getElementById(id + '-on');
        if (codes.length && onEl && !onEl.checked) onEl.checked = true;
        var paramsEl = document.getElementById(id + '-params');
        if (paramsEl) {
          paramsEl.value = codes.join(' ');
          paramsEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
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
  function windowBorderPanelHtml(keywords, idPrefix, expandedSet) {
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
    // Task I-3: WDWBORDER is documented by IBM as "Option indicators are
    // valid for this keyword" - a reverse gap (this panel never had a
    // Conditioning toggle at all). Same flagRowHtml-compatible markup as
    // entFldAtrHtml's own addition above.
    var condSummary = wb.conditions.length > 0 ? ' (' + wb.conditions.length + ')' : '';
    var isExpanded = !!(expandedSet && expandedSet.has(idPrefix + ':cond'));
    win += '<span class="kw-cond-toggle" data-flag-id="' + idPrefix + '" style="margin-top:4px;">Conditioning' + condSummary + (isExpanded ? ' \u25b4' : ' \u25be') + '</span>';
    if (isExpanded) {
      win += '<div class="kw-cond-body">' + conditionsEditorHtml(wb.conditions, idPrefix + '-cond', expandedSet) + '</div>';
    }
    win += '<button class="secondary" id="' + idPrefix + '-apply" style="width:100%;margin-top:8px;">Apply window border</button>';
    return dataKwWrap(['WDWBORDER'], win);
  }

  /** Wires a windowBorderPanelHtml()-produced panel. Same `getKeywords`
   *  function / `onChange` callback contract every other dedicated picker
   *  here uses. */
  function wireWindowBorderPanel(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    var wdwApply = document.getElementById(idPrefix + '-apply');
    if (!wdwApply) return;
    function apply(conditions) {
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
      onChange(DspfWriter.setWdwBorder(getKeywords(), state, conditions));
    }
    wdwApply.addEventListener('click', function () { apply(undefined); });
    wireFlagRowConditioning(idPrefix, DspfWriter.getWdwBorder(getKeywords()).conditions, apply, expandedSet, rerender);
  }

  /**
   * Builds the Menu-Bar switch/cancel key sub-panel's inner HTML -
   * MNUBARSW (switch key: CA key only) and MNUCNL (cancel key: CA key +
   * optional response-indicator) - shared between the file-level picker
   * (Task F1) and the record-level MNUBAR picker (Task R13,
   * screens/record-level/menu-bar-record-mnubar/general - the same two
   * keywords repeated on a MNUBAR record's own General screen), rather
   * than the two duplicating this block. `idPrefix` namespaces every
   * element id, same reasoning windowBorderPanelHtml above takes an
   * idPrefix.
   *
   * Task I-4 (keyword parameter/sub-parameter completeness audit): this
   * used to also render a leading "indicator" input for both keywords and
   * write it as the FIRST token inside the parens (`MNUBARSW(50 CA03)`,
   * `MNUCNL(51 CA04 90)`). Confirmed against IBM's own DDS Reference that
   * this was invalid DDS, not just an incomplete picker - the documented
   * formats are `MNUBARSW[(CAnn)]` (ONE optional parameter, the CA key
   * only) and `MNUCNL[(CAnn [response-indicator])]` (CA key, then an
   * OPTIONAL response indicator - never a leading indicator token at
   * all). The option/conditioning indicator that DOES apply to these
   * keywords is a completely different mechanism - positions 7-16,
   * already correctly modeled by `conditions`/`wireFlagRowConditioning`
   * below, the same as every other conditionable keyword in this file -
   * so the stray "indicator" field was a duplicate, WRONG modeling of
   * that same concept, silently corrupting the keyword's own real
   * parameter list. Removed entirely; no legacy-format read-compat is
   * needed since a file carrying the old 2-/3-token form was already
   * invalid DDS that would never have compiled.
   */
  function menuBarKeysPanelHtml(keywords, idPrefix, expandedSet) {
    var mnubarsw = DspfWriter.getFileFlagKeyword(keywords, 'MNUBARSW');
    var mnubarswParts = (mnubarsw.parameters || '').trim().split(/\s+/);
    var mb = flagRowHtml(idPrefix + '-mnubarsw', 'Menu-bar switch key (MNUBARSW)', mnubarsw.present, undefined, undefined, mnubarsw.conditions, expandedSet);
    mb += '<input type="text" id="' + idPrefix + '-mnubarsw-cakey" placeholder="CA key 01-24 (default CA10)" value="' + escapeHtml(mnubarswParts[0] || '') + '" style="width:100%;" />';
    var mnucnl = DspfWriter.getFileFlagKeyword(keywords, 'MNUCNL');
    var mnucnlParts = (mnucnl.parameters || '').trim().split(/\s+/);
    mb += flagRowHtml(idPrefix + '-mnucnl', 'Menu-cancel key (MNUCNL)', mnucnl.present, undefined, undefined, mnucnl.conditions, expandedSet);
    mb += '<div class="two-col"><input type="text" id="' + idPrefix + '-mnucnl-cakey" placeholder="CA key 01-24 (default CA12)" value="' + escapeHtml(mnucnlParts[0] || '') + '" />' +
      '<input type="text" id="' + idPrefix + '-mnucnl-resp" placeholder="response indicator (opt)" value="' + escapeHtml(mnucnlParts[1] || '') + '" /></div>';
    return mb;
  }

  /** Wires a menuBarKeysPanelHtml()-produced panel. Same `getKeywords`/
   *  `onChange` contract every other dedicated picker here uses.
   *  `getFileKeywords`/`getRecordScopes` are optional (Task I-18's
   *  mnuBarKeyConflictReason guard, wired below): `getFileKeywords`
   *  returns the file-level keyword set to check against (for the
   *  file-level caller, that's the same array `getKeywords` already
   *  returns; for the record-level MNUBAR caller, a separate accessor
   *  onto the file's own keywords); `getRecordScopes` returns an array
   *  of keyword-arrays for the record-level side of the check (the
   *  file-level caller passes every record's own keywords, since a
   *  file-level assignment extends to all of them; the record-level
   *  caller passes an array holding just its own record's keywords).
   *  Both are omitted-safe (no guard fires if either is absent) so
   *  existing callers keep working unchanged if this panel is ever
   *  reused somewhere that can't supply them. */
  function wireMenuBarKeysPanel(idPrefix, getKeywords, onChange, expandedSet, rerender, getFileKeywords, getRecordScopes) {
    var mnubarswOn = document.getElementById(idPrefix + '-mnubarsw-on');
    var mnubarswCakey = document.getElementById(idPrefix + '-mnubarsw-cakey');
    function revertMnubarsw() {
      var existing = DspfWriter.getFileFlagKeyword(getKeywords(), 'MNUBARSW');
      mnubarswOn.checked = existing.present;
      mnubarswCakey.value = (existing.parameters || '').trim().split(/\s+/)[0] || '';
    }
    function commitMnubarsw(conditions) {
      var params = (mnubarswCakey.value || '').trim();
      if (mnubarswOn.checked && getFileKeywords && getRecordScopes) {
        var reason = DspfWriter.mnuBarKeyConflictReason('MNUBARSW', params, getFileKeywords(), getRecordScopes());
        if (reason) {
          window.alert(reason);
          revertMnubarsw();
          return;
        }
      }
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'MNUBARSW', mnubarswOn.checked, params, undefined, conditions));
    }
    if (mnubarswOn) mnubarswOn.addEventListener('change', function () { commitMnubarsw(); });
    if (mnubarswCakey) mnubarswCakey.addEventListener('change', function () { commitMnubarsw(); });
    wireFlagRowConditioning(idPrefix + '-mnubarsw', DspfWriter.getFileFlagKeyword(getKeywords(), 'MNUBARSW').conditions, commitMnubarsw, expandedSet, rerender);

    var mnucnlOn = document.getElementById(idPrefix + '-mnucnl-on');
    var mnucnlCakey = document.getElementById(idPrefix + '-mnucnl-cakey');
    var mnucnlResp = document.getElementById(idPrefix + '-mnucnl-resp');
    function revertMnucnl() {
      var existing = DspfWriter.getFileFlagKeyword(getKeywords(), 'MNUCNL');
      var parts = (existing.parameters || '').trim().split(/\s+/);
      mnucnlOn.checked = existing.present;
      mnucnlCakey.value = parts[0] || '';
      mnucnlResp.value = parts[1] || '';
    }
    function commitMnucnl(conditions) {
      var params = [mnucnlCakey.value, mnucnlResp.value].map(function (s) { return (s || '').trim(); }).filter(Boolean).join(' ');
      if (mnucnlOn.checked && getFileKeywords && getRecordScopes) {
        var reason = DspfWriter.mnuBarKeyConflictReason('MNUCNL', mnucnlCakey.value, getFileKeywords(), getRecordScopes());
        if (reason) {
          window.alert(reason);
          revertMnucnl();
          return;
        }
      }
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'MNUCNL', mnucnlOn.checked, params, undefined, conditions));
    }
    if (mnucnlOn) mnucnlOn.addEventListener('change', function () { commitMnucnl(); });
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
    // Task I-3: INDARA - IBM's DDS Reference states "Option indicators are
    // not valid for this keyword" - no Conditioning toggle offered (see
    // keywordFixes.md's I-3 section for the full per-keyword audit this
    // and every other conditions-omitted row below is based on).
    var fIndara = DspfWriter.getFileFlagKeyword(kw, 'INDARA');
    g += flagRowHtml('fk-indara', 'Separate indicators area (INDARA)', fIndara.present, undefined, undefined, undefined, undefined);
    // Task I-3: USRDSPMGT - "Option indicators are not valid for this keyword."
    var fUsrdspmgt = DspfWriter.getFileFlagKeyword(kw, 'USRDSPMGT');
    g += flagRowHtml('fk-usrdspmgt', 'Manage display in S/36 mode', fUsrdspmgt.present, undefined, undefined, undefined, undefined);
    // Task I-3: CHECK - IBM's own summary line ("Option indicators are valid
    // only for CHECK(ER) and CHECK(ME)") plus each individual code's own
    // restated line confirm AB/MF/RL/RLTB are all NOT eligible - only ER and
    // ME are, and iSDA doesn't currently implement either of those two codes
    // at all (only AB/RLTB/RL), so none of the 3 rows below should offer
    // conditioning.
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml('fk-check-ab', 'Allow blanks', fCheckAb.present, undefined, undefined, undefined, undefined);
    var fCheckRltb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RLTB');
    g += flagRowHtml('fk-check-rltb', 'Move cursor right-left, top-bottom', fCheckRltb.present, undefined, undefined, undefined, undefined);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml('fk-check-rl', 'Move cursor right to left', fCheckRl.present, undefined, undefined, undefined, undefined);
    // Task I-3: DSPRL - "Option indicators are not valid for this keyword."
    var fDsprl = DspfWriter.getFileFlagKeyword(kw, 'DSPRL');
    g += flagRowHtml('fk-dsprl', 'Right to left processing (DSPRL)', fDsprl.present, undefined, undefined, undefined, undefined);
    // Bug fix: dedicated sub-flag checkboxes for CHGINPDFT (see
    // chgInpDftFlagHtml's own comment) instead of a bare free-text box.
    g += chgInpDftFlagHtml(kw, 'fk-chginpdft', 'Change input defaults (CHGINPDFT)', expandedSet);
    g += entFldAtrHtml(kw, 'fk-entfldatr', expandedSet);
    // Task I-3: ERRSFL - "Option indicators are not valid for this keyword."
    var fErrsfl = DspfWriter.getFileFlagKeyword(kw, 'ERRSFL');
    g += flagRowHtml('fk-errsfl', 'Write error messages to subfile (ERRSFL)', fErrsfl.present, undefined, undefined, undefined, undefined);
    // Task I-39 - CSRINPONLY was confirmed entirely missing from iSDA (no
    // getter/setter, no row, no mention anywhere) by a full-text audit of
    // DDS_Keyword_V7r6.txt against actual code. File- or record-level flag
    // (this is the file-level row; recordKeywordsPanelsHtml below adds the
    // matching record-level row), no parameters, and - unlike ERRSFL just
    // above - IBM's own DDS Reference explicitly states "Option indicators
    // are valid for this keyword", so this row keeps its Conditioning
    // toggle (expandedSet passed through, matching INVITE/ALWGPH's own
    // rows just above in this same panel).
    var fCsrinponly = DspfWriter.getFileFlagKeyword(kw, 'CSRINPONLY');
    g += flagRowHtml('fk-csrinponly', 'Restrict cursor to input-capable positions (CSRINPONLY)', fCsrinponly.present, undefined, undefined, fCsrinponly.conditions, expandedSet);
    g += '<div class="section-label">Reference database file (REF)</div>';
    g += '<div class="two-col"><input type="text" id="fk-ref-library" placeholder="Library (opt)" value="' + escapeHtml(refState.library) + '" />' +
      '<input type="text" id="fk-ref-record" placeholder="Database file name" value="' + escapeHtml(refState.record) + '" /></div>';
    // Task I-4: REF's own third, optional sub-parameter - which record
    // format to use when the referenced file has more than one - used to
    // have no field of its own at all (only reachable by typing an extra
    // space-separated token into the "record" box above, unlabeled).
    g += '<input type="text" id="fk-ref-format" placeholder="Record format name (opt, if file has several)" value="' + escapeHtml(refState.recordFormat) + '" style="width:100%;margin-top:4px;" />';
    g += '<div class="section-label">Record to pass unformatted data (PASSRCD)</div>';
    g += '<input type="text" id="fk-passrcd" placeholder="Record name" value="' + escapeHtml(DspfWriter.getFileFlagKeyword(kw, 'PASSRCD').parameters) + '" style="width:100%;" />';
    // Task I-6 (keyword compliance audit): file-level TEXT was REMOVED
    // here - Task L22 added it believing it was a confirmed-missing
    // keyword, but IBM's DDS Reference explicitly documents TEXT as
    // "this record- or field-level keyword" ("valid for any record
    // format or field, except a SFLMSGKEY or SFLPGMQ field") with no
    // file-level form mentioned at all - confirmed consistently across
    // every IBM edition checked (v5r4 through the local v7r6 PDF) and
    // every real-world DDS example found; nowhere documents or
    // demonstrates a file-level TEXT keyword. No live IBM i connection
    // was available to directly test CRTDSPF (the task's own preferred
    // verification method), so this is the "authoritative alternate
    // source" the task allows instead - the same evidentiary bar S36-5
    // used for CRTS36DSPF vs CRTDSPF. Record-level TEXT (recordKeywordsPanelsHtml,
    // further down) is correct and unaffected - only the file-level row
    // is removed.
    // Task I-5: VALNUM/WRDWRAP were confirmed-missing file-level keywords -
    // both are plain no-parameter flags and IBM's reference explicitly
    // states "Option indicators are not valid for this keyword" for each,
    // so `conditions` is passed as `undefined` here (not fValnum.conditions/
    // fWrdwrap.conditions) - flagRowHtml only renders the Conditioning
    // toggle when its `conditions` argument is defined, so this simply
    // never offers it, matching IBM's rule from the start rather than
    // relying on I-3's still-in-progress systemic eligibility fix.
    var fValnum = DspfWriter.getFileFlagKeyword(kw, 'VALNUM');
    g += flagRowHtml('fk-valnum', 'Enhanced numeric error checking (VALNUM)', fValnum.present, undefined, undefined, undefined, expandedSet);
    var fWrdwrap = DspfWriter.getFileFlagKeyword(kw, 'WRDWRAP');
    g += flagRowHtml('fk-wrdwrap', 'Word wrap for continued-entry fields (WRDWRAP)', fWrdwrap.present, undefined, undefined, undefined, expandedSet);
    panels.general = g;

    // Indicator / screen-control keywords
    var ind = '<div class="status" style="margin-bottom:10px;">CA/CF command keys have their own dedicated panel above (Command keys) - this covers the remaining screen-control keywords.</div>';
    [
      ['fk-clear', 'CLEAR', 'Clear', '10-99, or 01-99'],
      ['fk-home', 'HOME', 'Home', '10-99'],
      // Bug fix (L22 remaining item): PAGEDOWN/PAGEUP have legacy alternate
      // spellings ROLLUP/ROLLDOWN - real SDA's own "Define Indicator
      // Keywords" screen (screens/file-level/02-indicator-keywords/
      // image5.png) lists them together as "PAGEDOWN/ROLLUP" and
      // "PAGEUP/ROLLDOWN", the same keyword under two names. altNames
      // (4th arg) below is what makes getFileFlagKeyword recognize a
      // legacy-spelled instance as this row's own state.
      ['fk-pagedown', 'PAGEDOWN', 'Page down / Roll up', '10-99', ['ROLLUP']],
      ['fk-pageup', 'PAGEUP', 'Page up / Roll down', '10-99', ['ROLLDOWN']],
      ['fk-help', 'HELP', 'Help', '10-99'],
      ['fk-hlprtn', 'HLPRTN', 'Help return', '10-99'],
      // Task I-3: VLDCMDKEY - "Option indicators are not valid for this
      // keyword" - marked below so the forEach can skip passing conditions
      // for this one row while every other row here (all confirmed valid)
      // keeps its Conditioning toggle.
      ['fk-vldcmdkey', 'VLDCMDKEY', 'Validity command key', '10-99', undefined, true],
    ].forEach(function (row) {
      // Task I-4: all seven of these keywords are documented as
      // `KEYWORD[(response-indicator ['text'])]` - the same optional
      // descriptive-text shape INDTXT gets its own dedicated field for
      // right below - but this loop used to render only a single free-
      // text "indicator" box with no way to reach the 'text' at all.
      // Split the same way INDTXT is (indicator + optional quoted text),
      // reusing the identical parsing regex.
      var state = DspfWriter.getFileFlagKeyword(kw, row[1], undefined, row[4]);
      // Task I-3: some rows (VLDCMDKEY) don't allow option-indicator
      // conditioning at all - row[5] marks those so Conditioning is
      // omitted for just that row.
      var noConditioning = row[5];
      // Task I-4: all seven of these keywords are documented as
      // `KEYWORD[(response-indicator ['text'])]` - the same optional
      // descriptive-text shape INDTXT gets its own dedicated field for
      // right below - but this loop used to render only a single free-
      // text "indicator" box with no way to reach the 'text' at all.
      // Split the same way INDTXT is (indicator + optional quoted text),
      // reusing the identical parsing regex.
      var parts = /^(\S*)\s*(?:'((?:[^']|'')*)')?/.exec((state.parameters || '').trim()) || [];
      ind += flagRowHtml(row[0], row[2] + ' (' + row[1] + ')', state.present, undefined, undefined, noConditioning ? undefined : state.conditions, noConditioning ? undefined : expandedSet);
      ind += '<div class="two-col"><input type="text" id="' + row[0] + '-ind" placeholder="indicator (' + row[3] + ')" value="' + escapeHtml(parts[1] || '') + '" />' +
        '<input type="text" id="' + row[0] + '-text" placeholder="text (opt)" value="' + escapeHtml((parts[2] || '').replace(/''/g, "'")) + '" /></div>';
    });
    // Task I-3: INDTXT - "Option indicators are not valid for this keyword."
    var indtxt = DspfWriter.getFileFlagKeyword(kw, 'INDTXT');
    var indtxtParts = /^(\S+)\s*(?:'((?:[^']|'')*)')?/.exec((indtxt.parameters || '').trim()) || [];
    ind += flagRowHtml('fk-indtxt', 'Indicator text (INDTXT)', indtxt.present, undefined, undefined, undefined, undefined);
    ind += '<div class="two-col"><input type="text" id="fk-indtxt-ind" placeholder="indicator" value="' + escapeHtml(indtxtParts[1] || '') + '" />' +
      '<input type="text" id="fk-indtxt-text" placeholder="text" value="' + escapeHtml((indtxtParts[2] || '').replace(/''/g, "'")) + '" /></div>';
    // Task I-5: MOUBTN was a confirmed-missing file-level keyword -
    // associates a pointer-device (mouse) event with a Command key or
    // EVENT-ID. Real DDS allows several MOUBTN instances per file (one per
    // event), each independently conditioned, so this reuses the generic
    // repeatable-instance primitive (DspfWriter.getRepeatableKeywordInstances/
    // setRepeatableKeywordInstances) the same way validityCheckInstancesHtml
    // above reuses it for RANGE/COMP/VALUES - no dedicated MOUBTN get/set
    // pair needed in dspfWriter.js.
    ind += '<div class="section-label">Mouse buttons (MOUBTN)</div>';
    ind += moubtnPanelHtml(kw, 'fk', expandedSet);
    panels.indicatorKeywords = ind;

    // --- Print ---
    // Task I-2 (keywordFixes.md): "System handles print" writes PRINT's
    // own *PGM/[library/]printer-file-name parameter form, not a separate
    // PRTFILE keyword (never real DDS - see getFilePrintFileForm's own
    // comment in dspfWriter.js). Matches real SDA's "Define Print
    // Keywords" screen, whose "Print file" field also accepts *PGM.
    var filePrint = DspfWriter.getFileFlagKeyword(kw, 'PRINT');
    var filePrintFileForm = DspfWriter.getFilePrintFileForm(kw);
    var print = flagRowHtml('fk-print', 'Enable Print key (PRINT)', filePrint.present, filePrint.parameters, 'response indicator (if program handles it)', filePrint.conditions, expandedSet);
    print += '<div class="section-label">System handles print</div>';
    print += '<div class="two-col"><input type="text" id="fk-print-file" placeholder="Print file (name or *PGM)" value="' + escapeHtml(filePrintFileForm.isPgm ? '*PGM' : filePrintFileForm.printFile) + '" />' +
      '<input type="text" id="fk-print-library" placeholder="Library" value="' + escapeHtml(filePrintFileForm.library) + '" /></div>';
    // Task I-3: OPENPRT - "Option indicators are not valid for this keyword."
    var fOpenprt = DspfWriter.getFileFlagKeyword(kw, 'OPENPRT');
    print += flagRowHtml('fk-openprt', 'Leave print file open until display file is closed (OPENPRT)', fOpenprt.present, undefined, undefined, undefined, undefined);
    panels.print = print;

    // --- Help ---
    // Task I-4: HLPPNLGRP/HLPSCHIDX used to be single free-text boxes
    // whose placeholder hints gave the parameter order BACKWARDS relative
    // to IBM's documented `help-module-name [library-name/]panel-group-
    // name` and `[library-name/]search-index-object` shapes. Split into
    // their own labeled Module/Library/Panel-group and Library/Search-
    // index fields (see getFileHlpPnlGrpKeyword/getFileHlpSchIdxKeyword's
    // own comments), matching REF's own library/record/format split above.
    var hlppnlgrp = DspfWriter.getFileFlagKeyword(kw, 'HLPPNLGRP');
    var hlppnlgrpState = DspfWriter.getFileHlpPnlGrpKeyword(kw);
    var help = flagRowHtml('fk-hlppnlgrp', 'Help text in UIM panel group (HLPPNLGRP)', hlppnlgrp.present, undefined, undefined, hlppnlgrp.conditions, expandedSet);
    help += '<input type="text" id="fk-hlppnlgrp-module" placeholder="Help module name" value="' + escapeHtml(hlppnlgrpState.moduleName) + '" style="width:100%;" />';
    help += '<div class="two-col" style="margin-top:4px;"><input type="text" id="fk-hlppnlgrp-library" placeholder="Library (opt)" value="' + escapeHtml(hlppnlgrpState.library) + '" />' +
      '<input type="text" id="fk-hlppnlgrp-panelgroup" placeholder="Panel group name" value="' + escapeHtml(hlppnlgrpState.panelGroup) + '" /></div>';
    // Task I-3: HLPSCHIDX - "Option indicators are not valid for this keyword."
    var hlpschidx = DspfWriter.getFileFlagKeyword(kw, 'HLPSCHIDX');
    var hlpschidxState = DspfWriter.getFileHlpSchIdxKeyword(kw);
    help += flagRowHtml('fk-hlpschidx', 'Enable search index (HLPSCHIDX)', hlpschidx.present, undefined, undefined, undefined, undefined);
    help += '<div class="two-col"><input type="text" id="fk-hlpschidx-library" placeholder="Library (opt)" value="' + escapeHtml(hlpschidxState.library) + '" />' +
      '<input type="text" id="fk-hlpschidx-searchindex" placeholder="Search index object" value="' + escapeHtml(hlpschidxState.searchIndex) + '" /></div>';
    // Task I-3: HLPFULL - "Option indicators are not valid for this keyword."
    var fHlpfull = DspfWriter.getFileFlagKeyword(kw, 'HLPFULL');
    help += flagRowHtml('fk-hlpfull', 'Full screen help text (HLPFULL)', fHlpfull.present, undefined, undefined, undefined, undefined);
    help += '<div class="section-label">Help title (HLPTITLE)</div>';
    help += '<input type="text" id="fk-hlptitle" placeholder="Help title text" value="' + escapeHtml(DspfWriter.getFileQuotedText(kw, 'HLPTITLE')) + '" style="width:100%;" />';
    // Task I-5: HLPRCD was a confirmed-missing file-level keyword (IBM's
    // reference documents it as file-level or help-specification-level -
    // record specified here displays when no active H-specification's
    // HLPARA covers the cursor location). Parsed/composed the same
    // checkbox-plus-hand-split-parameters way menuBarKeysPanelHtml already
    // does for MNUBARSW/MNUCNL just above in this same file, rather than
    // adding a dedicated dspfWriter.js getter/setter - HLPRCD is a single-
    // instance keyword whose only structure is "record-format-name
    // [[library/]file-name]", the same shape REF already reuses generic
    // setFileFlagKeyword for. Option indicators are valid for this keyword.
    var hlprcd = DspfWriter.getFileFlagKeyword(kw, 'HLPRCD');
    var hlprcdParts = (hlprcd.parameters || '').trim().split(/\s+/).filter(Boolean);
    var hlprcdSecond = (hlprcdParts[1] || '').split('/');
    var hlprcdLibrary = hlprcdSecond.length > 1 ? hlprcdSecond[0] : '';
    var hlprcdFile = hlprcdSecond.length > 1 ? hlprcdSecond.slice(1).join('/') : (hlprcdSecond[0] || '');
    help += flagRowHtml('fk-hlprcd', 'Help record (HLPRCD)', hlprcd.present, undefined, undefined, hlprcd.conditions, expandedSet);
    help += '<div class="two-col"><input type="text" id="fk-hlprcd-record" placeholder="Record format name" value="' + escapeHtml(hlprcdParts[0] || '') + '" />' +
      '<input type="text" id="fk-hlprcd-library" placeholder="Library (optional)" value="' + escapeHtml(hlprcdLibrary) + '" /></div>';
    help += '<input type="text" id="fk-hlprcd-file" placeholder="File name (optional, defaults to this file)" value="' + escapeHtml(hlprcdFile) + '" style="width:100%;margin-top:4px;" />';
    // Task I-38: HLPDOC was entirely absent from iSDA (confirmed missing
    // from I-1's own original file-level baseline, not something I-1/I-5
    // already found and deferred). IBM's own format,
    // HLPDOC(label document-name folder-name), has all three parts
    // required (unlike HLPRCD's own optional library/file) - parsed/
    // composed the same checkbox-plus-hand-split-parameters way HLPRCD
    // just above already does, rather than a dedicated getter/setter.
    // Option indicators ARE valid (unlike HLPFULL/HLPTITLE just above).
    var hlpdoc = DspfWriter.getFileFlagKeyword(kw, 'HLPDOC');
    var hlpdocParts = (hlpdoc.parameters || '').trim().split(/\s+/).filter(Boolean);
    help += flagRowHtml('fk-hlpdoc', 'Help document (HLPDOC)', hlpdoc.present, undefined, undefined, hlpdoc.conditions, expandedSet);
    help += '<input type="text" id="fk-hlpdoc-label" placeholder="Online help text label name" value="' + escapeHtml(hlpdocParts[0] || '') + '" style="width:100%;" />';
    help += '<div class="two-col" style="margin-top:4px;"><input type="text" id="fk-hlpdoc-document" placeholder="Document name" value="' + escapeHtml(hlpdocParts[1] || '') + '" />' +
      '<input type="text" id="fk-hlpdoc-folder" placeholder="Folder name" value="' + escapeHtml(hlpdocParts[2] || '') + '" /></div>';
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
    // Bug fix (L22 keyword-inventory audit): MSGLOC was entirely missing -
    // real SDA's own "Select Display Sizes" screen shows a "Message Line"
    // column right alongside Order/Display name for exactly this reason
    // (confirmed via IBM's own DDS Reference: MSGLOC is a genuinely
    // separate file-level keyword, not a 4th DSPSIZ triple value - see
    // getFileMsgLocLines/setFileMsgLocLines's own doc comment in
    // dspfWriter.js). Whichever size is order 1 (the system default) gets
    // the unconditioned "primary" MSGLOC; order 2 (if any) gets its own
    // MSGLOC conditioned by that size's own *DSx name - matching the DDS
    // Reference's own `MSGLOC(1)` / `A *DS4 MSGLOC(1)` example exactly.
    var msgLoc = DspfWriter.getFileMsgLocLines(kw);
    function msgLocFor(name) {
      var idx = sizeList.findIndex(function (s) { return s.name === name; });
      if (idx === 0) return msgLoc.primary;
      if (idx > 0) return msgLoc.bySizeName[name] || '';
      return '';
    }
    ds += '<div class="two-col" style="font-size:10px;text-transform:uppercase;color:var(--ink-dim);margin:8px 0 4px;"><span></span><span>Message line (MSGLOC)</span></div>';
    ds += '<div class="two-col" style="margin-bottom:8px;"><span></span><input type="text" id="fk-msgloc-ds4" placeholder="e.g. 28" value="' + escapeHtml(msgLocFor('*DS4')) + '" style="width:70px;" /></div>';
    ds += '<div class="two-col"><span></span><input type="text" id="fk-msgloc-ds3" placeholder="e.g. 25" value="' + escapeHtml(msgLocFor('*DS3')) + '" style="width:70px;" /></div>';
    ds += '<button class="secondary" id="fk-dspsiz-apply" style="width:100%;margin-top:10px;">Apply display sizes</button>';
    panels.displaySizes = ds;

    // --- DBCS conversion ---
    // Task I-3: IGCCNV - "Option indicators are not allowed with this
    // keyword" (IBM phrases this one as "not allowed" rather than the usual
    // "not valid", but it's the same rule).
    var igccnv = DspfWriter.getFileFlagKeyword(kw, 'IGCCNV');
    var igcParts = (igccnv.parameters || '').trim().split(/\s+/);
    var dbcs = flagRowHtml('fk-igccnv', 'DBCS Conversion (IGCCNV)', igccnv.present, undefined, undefined, undefined, undefined);
    dbcs += '<div class="two-col"><input type="text" id="fk-igccnv-key" placeholder="CF01-CF24" value="' + escapeHtml(igcParts[0] || '') + '" />' +
      '<input type="text" id="fk-igccnv-line" placeholder="line 1-24" value="' + escapeHtml(igcParts[1] || '') + '" /></div>';
    panels.dbcsConversion = dbcs;

    // --- Alternate keywords ---
    // Task I-3: ALTHELP - "Option indicators are not valid for this
    // keyword." ALTPAGEDWN/ALTPAGEUP share one section in IBM's reference
    // and its own line reads "Option indicators are not valid for these
    // keywords" (plural, covering both).
    var althelp = DspfWriter.getFileFlagKeyword(kw, 'ALTHELP');
    var alt = flagRowHtml('fk-althelp', 'Alternative help (ALTHELP)', althelp.present, althelp.parameters, 'alternative key, CA01-CA24', undefined, undefined);
    var altpageup = DspfWriter.getFileFlagKeyword(kw, 'ALTPAGEUP');
    alt += flagRowHtml('fk-altpageup', 'Alternative page up (ALTPAGEUP)', altpageup.present, altpageup.parameters, 'alternative key, CF01-CF24', undefined, undefined);
    var altpagedwn = DspfWriter.getFileFlagKeyword(kw, 'ALTPAGEDWN');
    alt += flagRowHtml('fk-altpagedwn', 'Alternative page down (ALTPAGEDWN)', altpagedwn.present, altpagedwn.parameters, 'alternative key, CF01-CF24', undefined, undefined);
    panels.alternate = alt;

    // --- Window Border (WDWBORDER) ---
    panels.windowBorder = windowBorderPanelHtml(kw, 'fk-wdw', expandedSet);

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
  function wireFileKeywordsPanels(getKeywords, onChange, expandedSet, rerender, getModel) {
    // Task I-3: `noConditioning` (5th arg) opts a keyword whose row still
    // uses the generic flagRowHtml/wireFlagRow shape out of the Conditioning
    // toggle entirely, for keywords IBM's DDS Reference documents as
    // "Option indicators are not valid for this keyword" - matching
    // fileKeywordsPanelsHtml's own conditions:undefined for the same row
    // (see keywordFixes.md's I-3 section for the full per-keyword audit).
    function simple(id, name, placeholderIsParams, altNames, noConditioning) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, placeholderIsParams ? params : '', undefined, conditions, altNames);
      }, noConditioning ? undefined : DspfWriter.getFileFlagKeyword(getKeywords(), name, undefined, altNames).conditions, noConditioning ? undefined : expandedSet, noConditioning ? undefined : rerender);
    }
    // Task S36-4 - hard-blocks S36-3's verified rules in this keyword's own
    // panel (direct user request: reject, not warn). Hand-rolled rather
    // than reusing wireFlagRow (its own commit() always calls
    // onChange(apply(...)), even when apply "blocks" by returning the
    // keywords array unchanged - that still round-trips through
    // commitFileEdit and posts an edit, just a no-op one; skipping
    // onChange entirely is the only way to make a block actually free of
    // side effects) - window.alert(...) plus reverting the input to its
    // last good value, same "alert on invalid, don't commit" idiom this
    // file already uses for DSPSIZ's own try/catch above. Only meaningful
    // for keywords S36E_KEYWORD_RESTRICTIONS marks
    // `appliesTo: 'response-indicator'` (currently HELP and PRINT at file
    // level - CHANGE has no file-level row at all, see
    // wireRecordIndicatorInstances' own S36-4 guard).
    function guardedSimple(id, name) {
      var onEl = document.getElementById(id + '-on');
      var paramsEl = document.getElementById(id + '-params');
      function commit() {
        var present = onEl.checked;
        var params = paramsEl ? paramsEl.value : '';
        var violation = present ? DspfWriter.checkS36EResponseIndicatorViolation(getKeywords(), name, params) : null;
        if (violation) {
          window.alert(violation.message);
          var prev = DspfWriter.getFileFlagKeyword(getKeywords(), name);
          onEl.checked = prev.present;
          if (paramsEl) paramsEl.value = prev.parameters;
          return;
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), name, present, params));
      }
      if (onEl) onEl.addEventListener('change', commit);
      if (paramsEl) paramsEl.addEventListener('change', commit);
      wireFlagRowConditioning(id, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, function (newConditions) {
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), name, onEl.checked, paramsEl ? paramsEl.value : '', undefined, newConditions));
      }, expandedSet, rerender);
    }
    // General
    simple('fk-invite', 'INVITE');
    simple('fk-alwgph', 'ALWGPH');
    simple('fk-msgalarm', 'MSGALARM');
    simple('fk-indara', 'INDARA', false, undefined, true);
    // Task S36-4: turning USRDSPMGT ON is blocked (not just warned) when a
    // keyword value ALREADY set elsewhere in the file would violate a
    // verified S36E rule once USRDSPMGT is active - the symmetric half of
    // this task's own direct user request. Hand-wired rather than
    // `simple()`/`guardedSimple()` since it needs the WHOLE model (every
    // record), not just the file's own keywords - see
    // DspfWriter.findS36EConflictInModel's own doc comment.
    (function wireUsrdspmgt() {
      var onEl = document.getElementById('fk-usrdspmgt-on');
      if (!onEl) return;
      onEl.addEventListener('change', function () {
        if (onEl.checked && getModel) {
          var conflict = DspfWriter.findS36EConflictInModel(getModel());
          if (conflict) {
            window.alert('Cannot turn on "Manage display in S/36 mode" (USRDSPMGT) - ' + conflict.location + '\u2019s ' + conflict.keyword + ' keyword already conflicts with its S36E rule:\n\n' + conflict.message);
            onEl.checked = false;
            return;
          }
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'USRDSPMGT', onEl.checked));
      });
      // Task I-3: USRDSPMGT - "Option indicators are not valid for this
      // keyword" - no Conditioning toggle wired (matches
      // fileKeywordsPanelsHtml's conditions:undefined for this row).
    })();
    // Task I-3: CHECK - option indicators are documented as valid only for
    // CHECK(ER)/CHECK(ME), neither of which iSDA implements yet (only
    // AB/RLTB/RL) - none of these 3 rows should offer conditioning.
    wireFlagRow('fk-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, undefined, undefined, undefined);
    wireFlagRow('fk-check-rltb', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RLTB', conditions); }, undefined, undefined, undefined);
    wireFlagRow('fk-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, undefined, undefined, undefined);
    simple('fk-dsprl', 'DSPRL', false, undefined, true);
    wireChgInpDftFlag(getKeywords, onChange, 'fk-chginpdft', expandedSet, rerender);
    wireEntFldAtrEditor(getKeywords, onChange, 'fk-entfldatr', expandedSet, rerender);
    simple('fk-errsfl', 'ERRSFL', false, undefined, true);
    simple('fk-csrinponly', 'CSRINPONLY');
    var refLib = document.getElementById('fk-ref-library');
    var refRec = document.getElementById('fk-ref-record');
    var refFormat = document.getElementById('fk-ref-format');
    function commitRef() { onChange(DspfWriter.setFileRefKeyword(getKeywords(), refLib.value, refRec.value, refFormat.value)); }
    if (refLib) refLib.addEventListener('change', commitRef);
    if (refRec) refRec.addEventListener('change', commitRef);
    if (refFormat) refFormat.addEventListener('change', commitRef);
    var passrcd = document.getElementById('fk-passrcd');
    if (passrcd) passrcd.addEventListener('change', function () {
      var newVal = passrcd.value.trim();
      // Task I-24 - WINDOW cannot be specified for the record named by
      // file-level PASSRCD (per the DDS Reference). This is the reverse
      // on-transition from the "+ Add record" wizard's own I-24 guard
      // (buildWebviewTemplate.js's newRecordBtn handler): retyping PASSRCD
      // itself to name a record that already carries WINDOW. getModel
      // gives access to model.records to find that record, if any.
      // Task I-36 extended this to ALWROL/CLRL/SLNO too, which share the
      // identical DDS Reference restriction - checked in this fixed
      // order (WINDOW first, matching I-24's own original wording) so
      // the alert names whichever keyword is actually present first,
      // but a record is only ever expected to carry one of these four
      // in practice.
      if (newVal && getModel) {
        var targetRec = (getModel().records || []).find(function (r) {
          return r.name && r.name.toUpperCase() === newVal.toUpperCase();
        });
        var conflict = null;
        if (targetRec) {
          ['WINDOW', 'ALWROL', 'CLRL', 'SLNO'].some(function (kwName) {
            if ((targetRec.keywords || []).some(function (k) { return k.name === kwName; })) {
              conflict = DspfWriter.passrcdRecordConflictReason(kwName, newVal, targetRec.name);
              return true;
            }
            return false;
          });
        }
        if (conflict) {
          window.alert('Cannot set PASSRCD(' + newVal.toUpperCase() + ') - ' + conflict);
          passrcd.value = DspfWriter.getFileFlagKeyword(getKeywords(), 'PASSRCD').parameters;
          return;
        }
      }
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'PASSRCD', !!newVal, newVal));
    });
    // Task I-6: file-level TEXT wiring removed - see fileKeywordsPanelsHtml's
    // own I-6 comment for the full finding. getFileQuotedText/
    // setFileQuotedText themselves are untouched (still used by other
    // legitimate file-level quoted-text keywords).
    simple('fk-valnum', 'VALNUM');
    simple('fk-wrdwrap', 'WRDWRAP');

    // Indicator / screen-control
    // Task I-4: these rows moved from a single "-params" free-text box
    // (what `simple`/`guardedSimple` above wire) to dedicated "-ind"/
    // "-text" fields exposing the documented optional 'text' sub-
    // parameter (see fileKeywordsPanelsHtml's own comment) - custom
    // commit functions here build the combined `indicator ['text']`
    // parameter string instead.
    function commitIndicatorTextRow(id, name, altNames, guarded, noConditioning) {
      var onEl = document.getElementById(id + '-on');
      var indEl = document.getElementById(id + '-ind');
      var textEl = document.getElementById(id + '-text');
      function buildParams() {
        var indVal = (indEl.value || '').trim();
        var textVal = (textEl.value || '').trim();
        return indVal + (textVal ? " '" + textVal.replace(/'/g, "''") + "'" : '');
      }
      function commit(conditions) {
        var present = onEl.checked;
        var indVal = (indEl.value || '').trim();
        if (guarded && present) {
          var violation = DspfWriter.checkS36EResponseIndicatorViolation(getKeywords(), name, indVal);
          if (violation) {
            window.alert(violation.message);
            var prev = DspfWriter.getFileFlagKeyword(getKeywords(), name, undefined, altNames);
            onEl.checked = prev.present;
            var prevParts = /^(\S*)\s*(?:'((?:[^']|'')*)')?/.exec((prev.parameters || '').trim()) || [];
            indEl.value = prevParts[1] || '';
            textEl.value = (prevParts[2] || '').replace(/''/g, "'");
            return;
          }
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), name, present, buildParams(), undefined, conditions, altNames));
      }
      if (onEl) onEl.addEventListener('change', function () { commit(); });
      if (indEl) indEl.addEventListener('change', function () { commit(); });
      if (textEl) textEl.addEventListener('change', function () { commit(); });
      // Task I-3: VLDCMDKEY (`noConditioning`) doesn't allow option-
      // indicator conditioning at all - skip wiring the toggle entirely,
      // same as `simple`'s own noConditioning branch above.
      if (!noConditioning) {
        wireFlagRowConditioning(id, DspfWriter.getFileFlagKeyword(getKeywords(), name, undefined, altNames).conditions, commit, expandedSet, rerender);
      }
    }
    [
      ['fk-clear', 'CLEAR'],
      ['fk-home', 'HOME'],
      ['fk-pagedown', 'PAGEDOWN', ['ROLLUP']],
      ['fk-pageup', 'PAGEUP', ['ROLLDOWN']],
      ['fk-hlprtn', 'HLPRTN'],
      // Task I-3: VLDCMDKEY - "Option indicators are not valid for this
      // keyword" - `noConditioning` (5th simple() arg) below.
      ['fk-vldcmdkey', 'VLDCMDKEY', undefined, true],
    ].forEach(function (row) {
      commitIndicatorTextRow(row[0], row[1], row[2], undefined, row[3]);
    });
    // Task S36-4: HELP's response indicator is a verified S36E rule (see
    // guardedSimple's own comment, still used elsewhere) - split out of
    // the forEach above so this one row alone gets the hard-block
    // treatment.
    commitIndicatorTextRow('fk-help', 'HELP', undefined, true);
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
    // Task I-3: INDTXT - "Option indicators are not valid for this keyword"
    // - no Conditioning toggle wired.
    wireMoubtnPanel(getKeywords, onChange, 'fk', expandedSet, rerender);

    // Print
    // Task I-2 (keywordFixes.md): PRINT's "System handles print" fields
    // (Print file / Library) write PRINT's OWN *PGM/[library/]printer-
    // file-name parameter form, mutually exclusive with the response-
    // indicator field above (same as real SDA's screen) - both commit
    // through the one guarded path below so S36-4's verified rule (a
    // response indicator on PRINT is restricted under USRDSPMGT - *PGM
    // is its own carved-out special value per S36-3's correction, not a
    // response indicator, so it is never blocked here either) keeps
    // covering both forms via the one shared check function.
    (function wireFilePrint() {
      var onEl = document.getElementById('fk-print-on');
      var paramsEl = document.getElementById('fk-print-params');
      var fileEl = document.getElementById('fk-print-file');
      var libEl = document.getElementById('fk-print-library');
      function assembleParams() {
        var respInd = (paramsEl ? paramsEl.value : '').trim();
        if (respInd) return respInd;
        var printFile = (fileEl ? fileEl.value : '').trim();
        if (/^\*PGM$/i.test(printFile)) return '*PGM';
        if (printFile) {
          var lib = (libEl ? libEl.value : '').trim();
          return lib ? lib + '/' + printFile : printFile;
        }
        return '';
      }
      function commit() {
        var present = onEl.checked;
        var params = assembleParams();
        var violation = present ? DspfWriter.checkS36EResponseIndicatorViolation(getKeywords(), 'PRINT', params) : null;
        if (violation) {
          window.alert(violation.message);
          var prev = DspfWriter.getFileFlagKeyword(getKeywords(), 'PRINT');
          var prevForm = DspfWriter.getFilePrintFileForm(getKeywords());
          onEl.checked = prev.present;
          if (paramsEl) paramsEl.value = /^\d/.test(prev.parameters || '') ? prev.parameters : '';
          if (fileEl) fileEl.value = prevForm.isPgm ? '*PGM' : prevForm.printFile;
          if (libEl) libEl.value = prevForm.library;
          return;
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'PRINT', present, params));
      }
      if (onEl) onEl.addEventListener('change', commit);
      if (paramsEl) paramsEl.addEventListener('change', commit);
      if (fileEl) fileEl.addEventListener('change', commit);
      if (libEl) libEl.addEventListener('change', commit);
      wireFlagRowConditioning('fk-print', DspfWriter.getFileFlagKeyword(getKeywords(), 'PRINT').conditions, function (newConditions) {
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'PRINT', onEl.checked, assembleParams(), undefined, newConditions));
      }, expandedSet, rerender);
    })();
    simple('fk-openprt', 'OPENPRT', false, undefined, true);

    // Help
    // Task I-4: HLPPNLGRP/HLPSCHIDX moved from simple()'s single free-text
    // box to their own Module/Library/Panel-group and Library/Search-
    // index fields (see fileKeywordsPanelsHtml's own comment) - the
    // checkbox still independently controls presence, same as INDTXT/
    // MNUBARSW/MNUCNL above, so the entered values aren't lost by
    // unchecking then rechecking.
    var hlppnlgrpOn = document.getElementById('fk-hlppnlgrp-on');
    var hlppnlgrpModule = document.getElementById('fk-hlppnlgrp-module');
    var hlppnlgrpLibrary = document.getElementById('fk-hlppnlgrp-library');
    var hlppnlgrpPanelgroup = document.getElementById('fk-hlppnlgrp-panelgroup');
    function commitHlppnlgrp(conditions) {
      // Cross-verify follow-up (alongside HLPRCD's own commitHlprcd
      // below): IBM's text states a file cannot contain both HLPPNLGRP
      // and HLPRCD, nor HLPPNLGRP and HLPDOC - hlprcdConflictReason
      // covers the HLPRCD half (new); hlpdocConflictReason already
      // covered the HLPDOC half but was only ever wired for HLPDOC's own
      // "turning on" direction (I-38) - wired here for HLPPNLGRP's own
      // side of that same pairing now too.
      if (hlppnlgrpOn.checked) {
        var rcdReason = DspfWriter.hlprcdConflictReason('HLPPNLGRP', getKeywords());
        if (rcdReason) {
          window.alert(rcdReason);
          hlppnlgrpOn.checked = DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPPNLGRP').present;
          return;
        }
        var docReason = DspfWriter.hlpdocConflictReason('HLPPNLGRP', getKeywords());
        if (docReason) {
          window.alert(docReason);
          hlppnlgrpOn.checked = DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPPNLGRP').present;
          return;
        }
      }
      var mod = (hlppnlgrpModule.value || '').trim();
      var lib = (hlppnlgrpLibrary.value || '').trim();
      var pg = (hlppnlgrpPanelgroup.value || '').trim();
      var params = mod + (pg ? ' ' + (lib ? lib + '/' + pg : pg) : '');
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'HLPPNLGRP', hlppnlgrpOn.checked, params, undefined, conditions));
    }
    if (hlppnlgrpOn) hlppnlgrpOn.addEventListener('change', function () { commitHlppnlgrp(); });
    if (hlppnlgrpModule) hlppnlgrpModule.addEventListener('change', function () { commitHlppnlgrp(); });
    if (hlppnlgrpLibrary) hlppnlgrpLibrary.addEventListener('change', function () { commitHlppnlgrp(); });
    if (hlppnlgrpPanelgroup) hlppnlgrpPanelgroup.addEventListener('change', function () { commitHlppnlgrp(); });
    wireFlagRowConditioning('fk-hlppnlgrp', DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPPNLGRP').conditions, commitHlppnlgrp, expandedSet, rerender);

    // Task I-3: HLPSCHIDX - "Option indicators are not valid for this
    // keyword" - no wireFlagRowConditioning call below (matches
    // fileKeywordsPanelsHtml's own undefined/undefined render for this
    // row's Conditioning toggle).
    var hlpschidxOn = document.getElementById('fk-hlpschidx-on');
    var hlpschidxLibrary = document.getElementById('fk-hlpschidx-library');
    var hlpschidxSearchindex = document.getElementById('fk-hlpschidx-searchindex');
    function commitHlpschidx() {
      var lib = (hlpschidxLibrary.value || '').trim();
      var si = (hlpschidxSearchindex.value || '').trim();
      var params = lib && si ? lib + '/' + si : si;
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'HLPSCHIDX', hlpschidxOn.checked, params));
    }
    if (hlpschidxOn) hlpschidxOn.addEventListener('change', commitHlpschidx);
    if (hlpschidxLibrary) hlpschidxLibrary.addEventListener('change', commitHlpschidx);
    if (hlpschidxSearchindex) hlpschidxSearchindex.addEventListener('change', commitHlpschidx);
    // Task I-3: HLPFULL - "Option indicators are not valid for this keyword."
    simple('fk-hlpfull', 'HLPFULL', false, undefined, true);
    var hlptitle = document.getElementById('fk-hlptitle');
    if (hlptitle) hlptitle.addEventListener('change', function () { onChange(DspfWriter.setFileQuotedText(getKeywords(), 'HLPTITLE', hlptitle.value)); });
    // Task I-5: HLPRCD - same "-on" checkbox drives presence regardless of
    // whether the sub-fields have anything typed yet" contract INDTXT's
    // own commitIndtxt above already follows, so a user can type the
    // record name first and tick the box after (or vice versa) without
    // either write silently reverting the other's edit.
    //
    // Cross-verified against IBM's own format,
    // HLPRCD(record-format-name [[library-name/]file-name]) - two real
    // gaps found and fixed here: (1) record-format-name is NOT in
    // brackets at all, so it's mandatory whenever the checkbox is on,
    // but nothing enforced that - a checked HLPRCD with a blank record
    // field used to write malformed DDS (e.g. a leading-space
    // `HLPRCD( HELPFILE)` with no record name, or bare `HLPRCD` with no
    // parens at all if file/library were also blank, since
    // setFileFlagKeyword only omits the parens entirely when parameters
    // is blank). (2) library-name is only valid nested inside
    // `[library-name/]file-name` - it has no meaning on its own - but
    // the old `second = file ? (library ? library + '/' + file : file)
    // : ''` line silently DROPPED a typed library value with zero
    // feedback whenever file was left blank, which reads like a bug to
    // whoever typed it, not a deliberate no-op. Guarded the same
    // alertAndRevert idiom hlpdocConflictReason's own callers below use.
    var hlprcdOn = document.getElementById('fk-hlprcd-on');
    var hlprcdRecord = document.getElementById('fk-hlprcd-record');
    var hlprcdLibraryEl = document.getElementById('fk-hlprcd-library');
    var hlprcdFileEl = document.getElementById('fk-hlprcd-file');
    function commitHlprcd(conditions) {
      var record = (hlprcdRecord.value || '').trim();
      var library = (hlprcdLibraryEl.value || '').trim();
      var file = (hlprcdFileEl.value || '').trim();
      if (hlprcdOn.checked) {
        var reason = DspfWriter.hlprcdConflictReason('HLPRCD', getKeywords());
        if (reason) {
          window.alert(reason);
          hlprcdOn.checked = DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPRCD').present;
          return;
        }
        if (!record) {
          window.alert('HLPRCD requires a record format name (per the DDS Reference).');
          hlprcdOn.checked = DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPRCD').present;
          return;
        }
        if (library && !file) {
          window.alert("HLPRCD's library name only applies together with a file name - enter a file name too, or clear the library (per the DDS Reference's [[library-name/]file-name] form).");
          return;
        }
      }
      var second = file ? (library ? library + '/' + file : file) : '';
      var params = second ? record + ' ' + second : record;
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'HLPRCD', hlprcdOn.checked, params, undefined, conditions));
    }
    // Task I-43 fix: a sub-field's own `change` event used to call
    // commitHlprcd() unconditionally, even while the checkbox is off. With
    // hlprcdOn.checked false, that call falls straight through to the
    // unconditional onChange(...setFileFlagKeyword(..., false, ...)) at the
    // bottom - present:false discards whatever was just typed, and
    // commitSourceChange's own synchronous render() then regenerates this
    // whole panel from the (still-HLPRCD-less) model, wiping the input back
    // to blank. The checkbox's own listener still always commits (both
    // turning on AND off must go through, to actually add/remove the
    // keyword) - only the three sub-field listeners are guarded here, so
    // typing while the checkbox is off is a pure no-op that never touches
    // onChange/render, leaving whatever the user typed sitting untouched in
    // the DOM until they check the box (at which point commitHlprcd reads
    // it fresh and has something real to validate against).
    if (hlprcdOn) hlprcdOn.addEventListener('change', function () { commitHlprcd(); });
    if (hlprcdRecord) hlprcdRecord.addEventListener('change', function () { if (!hlprcdOn.checked) return; commitHlprcd(); });
    if (hlprcdLibraryEl) hlprcdLibraryEl.addEventListener('change', function () { if (!hlprcdOn.checked) return; commitHlprcd(); });
    if (hlprcdFileEl) hlprcdFileEl.addEventListener('change', function () { if (!hlprcdOn.checked) return; commitHlprcd(); });
    wireFlagRowConditioning('fk-hlprcd', DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPRCD').conditions, commitHlprcd, expandedSet, rerender);

    // Task I-38: HLPDOC - same "-on" checkbox drives presence regardless
    // of whether the sub-fields are filled in yet" contract as HLPRCD's
    // own commitHlprcd just above. Guarded (per hlpdocConflictReason)
    // against HLPPNLGRP/HLPRTN already being present, same alertAndRevert
    // idiom wireUsrdfnGuardedFlag uses elsewhere - only the "turning
    // HLPDOC on" direction is guarded here; the reverse (blocking
    // HLPPNLGRP/HLPRTN while HLPDOC is already on) is now wired for
    // HLPPNLGRP just below (HLPRTN's own file-level row goes through the
    // shared commitIndicatorTextRow helper, which has no per-keyword
    // conflict hook - left as-is).
    //
    // Cross-check follow-up: all three parts (label/document/folder) are
    // required by IBM's own format - unlike HLPRCD's own bracketed,
    // genuinely-optional second parameter above, HLPDOC's format has NO
    // brackets around any of its three parts at all. This used to write
    // whatever was typed so far the moment the checkbox went on -
    // including nothing at all, producing a bare `HLPDOC` with no
    // parens (setFileFlagKeyword omits parens entirely when parameters
    // is blank) or a 1-/2-part fragment, both invalid DDS. Now blocked
    // with the same alertAndRevert idiom as the conflict check just
    // above, checked every time the checkbox is (or stays) on - not just
    // at the moment it's first ticked - so blanking a previously-filled
    // part back out while still checked is caught too.
    var hlpdocOn = document.getElementById('fk-hlpdoc-on');
    var hlpdocLabel = document.getElementById('fk-hlpdoc-label');
    var hlpdocDocument = document.getElementById('fk-hlpdoc-document');
    var hlpdocFolder = document.getElementById('fk-hlpdoc-folder');
    function commitHlpdoc(conditions) {
      if (hlpdocOn.checked) {
        var reason = DspfWriter.hlpdocConflictReason('HLPDOC', getKeywords());
        if (reason) {
          window.alert(reason);
          hlpdocOn.checked = DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPDOC').present;
          return;
        }
      }
      var label = (hlpdocLabel.value || '').trim();
      var doc2 = (hlpdocDocument.value || '').trim();
      var folder = (hlpdocFolder.value || '').trim();
      if (hlpdocOn.checked && (!label || !doc2 || !folder)) {
        window.alert('HLPDOC requires all three parts - online help text label name, document name, and folder name (per the DDS Reference).');
        hlpdocOn.checked = DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPDOC').present;
        return;
      }
      var parts = [label, doc2, folder].filter(Boolean);
      onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'HLPDOC', hlpdocOn.checked, parts.join(' '), undefined, conditions));
    }
    // Task I-43 fix: same catch-22 as HLPRCD's own sub-fields just above -
    // see that fix's comment for the full mechanism (unconditional
    // onChange(...present:false...) -> synchronous render() wipes the
    // field). Only the checkbox's own listener commits unconditionally;
    // the three sub-field listeners no-op while the checkbox is off.
    if (hlpdocOn) hlpdocOn.addEventListener('change', function () { commitHlpdoc(); });
    if (hlpdocLabel) hlpdocLabel.addEventListener('change', function () { if (!hlpdocOn.checked) return; commitHlpdoc(); });
    if (hlpdocDocument) hlpdocDocument.addEventListener('change', function () { if (!hlpdocOn.checked) return; commitHlpdoc(); });
    if (hlpdocFolder) hlpdocFolder.addEventListener('change', function () { if (!hlpdocOn.checked) return; commitHlpdoc(); });
    wireFlagRowConditioning('fk-hlpdoc', DspfWriter.getFileFlagKeyword(getKeywords(), 'HLPDOC').conditions, commitHlpdoc, expandedSet, rerender);

    // Display sizes
    var dspsizApply = document.getElementById('fk-dspsiz-apply');
    if (dspsizApply) {
      dspsizApply.addEventListener('click', function () {
        var msglocByName = {
          '*DS4': (document.getElementById('fk-msgloc-ds4').value || '').trim(),
          '*DS3': (document.getElementById('fk-msgloc-ds3').value || '').trim(),
        };
        var rows = [
          { order: document.getElementById('fk-dspsiz-order-ds4').value, lines: 27, columns: 132, name: (document.getElementById('fk-dspsiz-name-ds4').value || '*DS4').trim() || '*DS4' },
          { order: document.getElementById('fk-dspsiz-order-ds3').value, lines: 24, columns: 80, name: (document.getElementById('fk-dspsiz-name-ds3').value || '*DS3').trim() || '*DS3' },
        ].filter(function (r) { return (r.order || '').trim() !== ''; });
        rows.sort(function (a, b) { return parseInt(a.order, 10) - parseInt(b.order, 10); });
        try {
          var next = DspfWriter.setDisplaySizesList(getKeywords(), rows.map(function (r) { return { lines: r.lines, columns: r.columns, name: r.name }; }));
          // Bug fix (L22): MSGLOC follows DSPSIZ's own order - order 1 (the
          // system default) is unconditioned ("primary"), order 2 (if any)
          // is conditioned by its own *DSx name - see getFileMsgLocLines/
          // setFileMsgLocLines's own doc comment for the DDS Reference
          // example this mirrors.
          var primary = rows.length > 0 ? (msglocByName[rows[0].name] || '') : '';
          var bySizeName = {};
          if (rows.length > 1) bySizeName[rows[1].name] = msglocByName[rows[1].name] || '';
          next = DspfWriter.setFileMsgLocLines(next, primary, bySizeName);
          onChange(next);
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
    // Task I-3: IGCCNV - "Option indicators are not allowed with this
    // keyword" - no Conditioning toggle wired.

    // Alternate keywords
    // Task I-3: ALTHELP - "not valid"; ALTPAGEDWN/ALTPAGEUP's shared
    // section - "Option indicators are not valid for these keywords."
    simple('fk-althelp', 'ALTHELP', true, undefined, true);
    simple('fk-altpageup', 'ALTPAGEUP', true, undefined, true);
    simple('fk-altpagedwn', 'ALTPAGEDWN', true, undefined, true);

    // Window Border
    wireWindowBorderPanel('fk-wdw', getKeywords, onChange, expandedSet, rerender);

    // Menu-bar
    // Task I-18: file-level MNUBARSW/MNUCNL editing needs to check every
    // record's own copy too (a file-level assignment extends to all of
    // them, per each keyword's own DDS Reference section) - getModel
    // gives access to model.records for that; getKeywords here already IS
    // the file-level keyword set, so it doubles as its own getFileKeywords.
    wireMenuBarKeysPanel('fk', getKeywords, onChange, expandedSet, rerender, getKeywords, function () {
      return getModel ? getModel().records.map(function (r) { return r.keywords; }) : [];
    });
  }

  // -----------------------------------------------------------------------
  // Task R1 - Base Record Keywords picker (General, Indicator, Application
  // Help, Help, Output, Input, Overlay, Print - see docs/sda-reference/
  // screens/record-level/base-record-keywords/ and PICKER-SCREENS-PLAN.md).
  // Reuses flagRowHtml/wireFlagRow and DspfWriter.getFileFlagKeyword/
  // setFileFlagKeyword etc. from Task F1 above - those are generic over any
  // `keywords` array, not file-level-specific, so a record's PRINT/
  // HLPTITLE take the exact same shape as the file-level ones. Only the ids
  // differ (rk- prefix instead of fk-) so a record's panel and the file
  // panel can coexist without id collisions if both are ever rendered at
  // once (they're on different tabs, but ids are still page-global).
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Task I-17 - MNUBARDSP's own documented repeatability ("Option
  // indicators are valid for the MNUBARDSP keyword, and more than one
  // MNUBARDSP keyword can be specified on the record if all are
  // optioned. If more than one MNUBARDSP keyword is in effect when the
  // record is written, the first one in effect is used.") wasn't modeled
  // by Task L76/I-4's own single-instance fix (getFileFlagKeyword/
  // setFileFlagKeyword + getMnubardspFields/setMnubardspFields) - this
  // reuses the same generic DspfWriter.getRepeatableKeywordInstances/
  // setRepeatableKeywordInstances primitive moubtnPanelHtml/
  // wireMoubtnPanel above already use for MOUBTN (a plain repeatable
  // single-keyword-name list, no pairing with another keyword the way
  // Color & attributes needs), rather than a bespoke get/set pair.
  //
  // MNUBARDSP keeps its own two mutually-exclusive parameter SHAPES (see
  // getMnubardspFields's own comment in dspfWriter.js for the full
  // citation: a single optional pull-down-input name on a record that
  // itself carries MNUBAR, vs. 2 required + 1 optional trailing name on
  // any other record) - that per-record-type shape choice is orthogonal
  // to repeatability, so `isMnuBarRec` is threaded through unchanged from
  // recordKeywordsPanelsHtml's own existing check, and each instance's
  // raw `parameters` text is parsed/composed locally here rather than
  // through getMnubardspFields/setMnubardspFields (which read/write the
  // single keyword directly on a `keywords` array, not a bare parameter
  // string one repeatable instance owns).
  // -----------------------------------------------------------------------

  /** Splits one MNUBARDSP instance's raw `parameters` text into its
   *  positional fields for whichever of the two shapes applies. */
  function parseMnubardspInstanceParams(text, isMnuBarRec) {
    var parts = (text || '').trim().split(/\s+/).filter(Boolean);
    if (isMnuBarRec) return { menuBarRecord: '', choiceField: '', pullDownField: parts[0] || '' };
    return { menuBarRecord: parts[0] || '', choiceField: parts[1] || '', pullDownField: parts[2] || '' };
  }

  /** Inverse of parseMnubardspInstanceParams - joins whichever fields
   *  apply back into raw parameter text, dropping trailing blanks (so a
   *  blank pullDownField on the non-MNUBAR-record shape writes just
   *  "REC1 CHC1", not "REC1 CHC1 "). */
  function composeMnubardspInstanceParams(f, isMnuBarRec) {
    if (isMnuBarRec) return (f.pullDownField || '').trim();
    var parts = [(f.menuBarRecord || '').trim(), (f.choiceField || '').trim(), (f.pullDownField || '').trim()];
    while (parts.length && !parts[parts.length - 1]) parts.pop();
    return parts.join(' ');
  }

  function mnubardspInstanceRowHtml(inst, p, isMnuBarRec) {
    var f = parseMnubardspInstanceParams(inst.parameters, isMnuBarRec);
    if (isMnuBarRec) {
      return '<input type="text" class="' + p + '-pull" placeholder="Pull-down input field (name, optional)" value="' + escapeHtml(f.pullDownField) + '" style="width:100%;" />';
    }
    return '<div class="three-col">' +
      '<input type="text" class="' + p + '-rec" placeholder="Menu-bar record (name)" value="' + escapeHtml(f.menuBarRecord) + '" />' +
      '<input type="text" class="' + p + '-chc" placeholder="Choice field (name)" value="' + escapeHtml(f.choiceField) + '" />' +
      '<input type="text" class="' + p + '-pull" placeholder="Pull-down input field (name, optional)" value="' + escapeHtml(f.pullDownField) + '" />' +
      '</div>';
  }

  /** MNUBARDSP panel (Task I-17), record-level - shared verbatim across
   *  every record type via recordKeywordsPanelsHtml's own General tab,
   *  same as the single-instance version it replaces. */
  function mnubardspPanelHtml(keywords, ownerKey, expandedSet) {
    var kw = keywords || [];
    var isMnuBarRec = kw.some(function (k) { return k.name === 'MNUBAR'; });
    var instances = DspfWriter.getRepeatableKeywordInstances(kw, ['MNUBARDSP']);
    return repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-mnubardsp-rep',
      function renderPayload(inst, instIdPrefix) { return mnubardspInstanceRowHtml(inst, instIdPrefix, isMnuBarRec); },
      expandedSet,
      '+ Add Menu-Bar display (MNUBARDSP)'
    );
  }

  function wireMnubardspPanel(getKeywords, onChange, ownerKey, expandedSet, rerender) {
    var kw = getKeywords();
    var isMnuBarRec = kw.some(function (k) { return k.name === 'MNUBAR'; });
    var instances = DspfWriter.getRepeatableKeywordInstances(kw, ['MNUBARDSP']);
    wireRepeatableConditionedInstances(
      ownerKey + '-mnubardsp-rep',
      instances,
      function (next) { onChange(DspfWriter.setRepeatableKeywordInstances(getKeywords(), ['MNUBARDSP'], next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var pullEl = document.querySelector('.' + instIdPrefix + '-pull');
        if (isMnuBarRec) {
          if (pullEl) pullEl.addEventListener('change', function () {
            updatePayload({ name: 'MNUBARDSP', parameters: composeMnubardspInstanceParams({ pullDownField: pullEl.value }, true) });
          });
          return;
        }
        var recEl = document.querySelector('.' + instIdPrefix + '-rec');
        var chcEl = document.querySelector('.' + instIdPrefix + '-chc');
        function commit() {
          updatePayload({
            name: 'MNUBARDSP',
            parameters: composeMnubardspInstanceParams({
              menuBarRecord: recEl ? recEl.value : '',
              choiceField: chcEl ? chcEl.value : '',
              pullDownField: pullEl ? pullEl.value : ''
            }, false)
          });
        }
        if (recEl) recEl.addEventListener('change', commit);
        if (chcEl) chcEl.addEventListener('change', commit);
        if (pullEl) pullEl.addEventListener('change', commit);
      },
      expandedSet,
      rerender,
      function makeDefaultInstance() {
        // Unlike MOUBTN/record-indicator's own makeDefaultInstance (which
        // need a non-blank placeholder so the new row survives the next
        // re-render), MNUBARDSP's meaning never depends on its parameters
        // being non-blank - setRepeatableKeywordInstances always writes
        // one entry per instance with a `name`, regardless of whether
        // `parameters` is empty, so a freshly-added blank instance is
        // never dropped. Left blank rather than fabricating a fake
        // record/field/CA-key-style generic placeholder, since (unlike a
        // response indicator number or a command key) there's no
        // generic valid value for a menu-bar record or field name - it
        // has to be a real name from this DSPF, which only the person
        // filling in the row can know.
        return { name: 'MNUBARDSP', conditions: [], parameters: '' };
      }
    );
  }

  // -----------------------------------------------------------------------
  // Task I-27 - record-level HLPTITLE's own documented repeatability
  // ("Option indicators are allowed on record-level HLPTITLE keywords and
  // must be specified on each HLPTITLE keyword if the record contains
  // multiple HLPTITLE keywords. You can specify a maximum of 15 HLPTITLE
  // keywords on a record if all have option indicators.") wasn't modeled
  // by I-21's own single-instance fix (getFileQuotedText/setFileQuotedText
  // gaining a `conditions` parameter, which correctly lets ONE record-level
  // HLPTITLE be conditioned but can't represent a second one at all). This
  // reuses the same generic DspfWriter.getRepeatableKeywordInstances/
  // setRepeatableKeywordInstances primitive mnubardspPanelHtml/
  // wireMnubardspPanel above already use for MNUBARDSP, rather than a
  // bespoke get/set pair - HLPTITLE is simpler than MNUBARDSP in one way
  // (a single plain quoted-text parameter, no per-record-type shape
  // variation to thread through) and reuses quoteDdsLiteral/
  // unquoteDdsLiteral (the same quoting getFileQuotedText/setFileQuotedText
  // already use) to keep each instance's `parameters` as plain edited text
  // rather than raw DDS quote-escaping.
  //
  // Like I-17's own MNUBARDSP panel, this only models the repeatable LIST
  // mechanically - it does NOT enforce "all instances must carry option
  // indicators once there's more than one" or "an unconditioned instance
  // must be the record's only one" (surfaced instead as a non-blocking
  // hint below the list, same posture MNUBARDSP's own repeatable panel
  // already takes for its own analogous "all optioned if more than one"
  // rule).
  // -----------------------------------------------------------------------

  function hlptitleInstanceRowHtml(inst, p) {
    return '<input type="text" class="' + p + '-text" placeholder="Help title text" value="' + escapeHtml(DspfWriter.unquoteDdsLiteral(inst.parameters)) + '" style="width:100%;" />';
  }

  /** Record-level HLPTITLE panel (Task I-27) - shared verbatim across
   *  every record type via recordKeywordsPanelsHtml's own Help tab, same
   *  as the single-instance version it replaces. */
  function hlptitlePanelHtml(keywords, ownerKey, expandedSet) {
    var kw = keywords || [];
    var instances = DspfWriter.getRepeatableKeywordInstances(kw, ['HLPTITLE']);
    var html = repeatableConditionedInstancesHtml(
      instances,
      ownerKey + '-hlptitle-rep',
      function renderPayload(inst, instIdPrefix) { return hlptitleInstanceRowHtml(inst, instIdPrefix); },
      expandedSet,
      '+ Add help title (HLPTITLE)'
    );
    html += '<div class="hint-small">IBM: more than one HLPTITLE on this record is only valid if EVERY instance carries option indicators (e.g. an indicator and its complement, like 90/N90, selecting between title variants) - an unconditioned HLPTITLE is still valid but must then be the record\u2019s only one. Not enforced here.</div>';
    return html;
  }

  function wireHlptitlePanel(getKeywords, onChange, ownerKey, expandedSet, rerender) {
    var kw = getKeywords();
    var instances = DspfWriter.getRepeatableKeywordInstances(kw, ['HLPTITLE']);
    wireRepeatableConditionedInstances(
      ownerKey + '-hlptitle-rep',
      instances,
      function (next) { onChange(DspfWriter.setRepeatableKeywordInstances(getKeywords(), ['HLPTITLE'], next)); },
      function wirePayload(instIdPrefix, inst, updatePayload) {
        var textEl = document.querySelector('.' + instIdPrefix + '-text');
        if (textEl) textEl.addEventListener('change', function () {
          updatePayload({ name: 'HLPTITLE', parameters: DspfWriter.quoteDdsLiteral(textEl.value) });
        });
      },
      expandedSet,
      rerender,
      function makeDefaultInstance() {
        // Non-blank placeholder text, not '' - HLPTITLE's own DDS format
        // (`HLPTITLE('text')`) requires a quoted-string argument; unlike
        // MNUBARDSP's own makeDefaultInstance (where a bare, argument-less
        // MNUBARDSP is real, documented DDS), a blank HLPTITLE would
        // serialize as bare `HLPTITLE` with no parens at all - invalid -
        // same "give it a real, editable starting value" reasoning as
        // record-indicator's own makeDefaultInstance above.
        return { name: 'HLPTITLE', conditions: [], parameters: DspfWriter.quoteDdsLiteral('Help title') };
      }
    );
  }


  function recordKeywordsPanelsHtml(keywords, idPrefix, expandedSet) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    // --- General ---
    var g = '';
    var fInzrcd = DspfWriter.getFileFlagKeyword(kw, 'INZRCD');
    g += flagRowHtml(p + '-inzrcd', 'If this record is not on display, write it to the display before issuing read (INZRCD)', fInzrcd.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
    var fKeep = DspfWriter.getFileFlagKeyword(kw, 'KEEP');
    g += flagRowHtml(p + '-keep', 'Keep record on display (KEEP)', fKeep.present, undefined, undefined, undefined, undefined); // I-28: option and response indicators not valid
    var fAssume = DspfWriter.getFileFlagKeyword(kw, 'ASSUME');
    g += flagRowHtml(p + '-assume', 'Assume record is on display (ASSUME)', fAssume.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
    var fAlwrol = DspfWriter.getFileFlagKeyword(kw, 'ALWROL');
    g += flagRowHtml(p + '-alwrol', 'Allow rolling of lines (ALWROL)', fAlwrol.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
    var fRetkey = DspfWriter.getFileFlagKeyword(kw, 'RETKEY');
    g += flagRowHtml(p + '-retkey', 'Retain CLEAR HELP HOME and ROLL keys (RETKEY)', fRetkey.present, undefined, undefined, fRetkey.conditions, expandedSet);
    var fRetcmdkey = DspfWriter.getFileFlagKeyword(kw, 'RETCMDKEY');
    g += flagRowHtml(p + '-retcmdkey', 'Retain command function (CFnn and CAnn) keys (RETCMDKEY)', fRetcmdkey.present, undefined, undefined, fRetcmdkey.conditions, expandedSet);
    // Task I-39 - CSRINPONLY was confirmed entirely missing from iSDA (no
    // getter/setter, no row, no mention anywhere) by a full-text audit of
    // DDS_Keyword_V7r6.txt against actual code. This is the record-level
    // row (see fileKeywordsPanelsHtml's own I-39 comment for the matching
    // file-level row); IBM's own DDS Reference documents CSRINPONLY as a
    // "file-level or record-level keyword", both independently valid, and
    // states "Option indicators are valid for this keyword", so this row
    // keeps its Conditioning toggle same as RETKEY/RETCMDKEY just above.
    var fCsrinponly = DspfWriter.getFileFlagKeyword(kw, 'CSRINPONLY');
    g += flagRowHtml(p + '-csrinponly', 'Restrict cursor to input-capable positions (CSRINPONLY)', fCsrinponly.present, undefined, undefined, fCsrinponly.conditions, expandedSet);
    g += chgInpDftFlagHtml(kw, p + '-chginpdft', 'Change input defaults (CHGINPDFT)', expandedSet);
    // Bug fix (Task L76 - real SDA's "Define Menu-Bar Display Keywords"
    // screenshot, docs/sda-reference/screens/record-level/menu-bar-record-
    // mnubar/menu-bar-display-keywords/image151.png) superseded by
    // Task I-17 below - real DDS gives MNUBARDSP
    // two different parameter shapes depending on whether the record
    // itself carries MNUBAR (see getMnubardspFields's own comment in
    // dspfWriter.js for the full citation), AND (per Task I-17's own
    // audit) allows more than one MNUBARDSP on the same record if all
    // are optioned - mnubardspPanelHtml/wireMnubardspPanel below cover
    // both: shape selection is still the same isMnuBarRec check L76
    // introduced, now threaded through a repeatable-instance list built
    // on the same generic primitive moubtnPanelHtml already uses for
    // MOUBTN, rather than the single getFileFlagKeyword/
    // getMnubardspFields pair this replaces.
    g += '<div class="section-label">Menu-Bar display (MNUBARDSP)</div>';
    g += mnubardspPanelHtml(kw, p, expandedSet);
    g += entFldAtrHtml(kw, p + '-entfldatr', expandedSet);
    // Bug fix + feature (Task L77): the old row here used
    // DspfWriter.getFileTwoFieldKeyword (CSRLOC's own plain row/col pair
    // shape) and labeled the two boxes "Row field name"/"Column field
    // name" - but per IBM's own DDS reference, RTNCSRLOC's bare 2-field
    // form is actually the *RECNAME variant's first 2 names (record,
    // field), never row/col at all; that mislabeling was itself part of
    // this task's own bug. RTNCSRLOC really has 2 independent parameter
    // shapes that can BOTH be specified at once as 2 separate keyword
    // instances on the same record (see findRtncsrlocInstance's own
    // comment in dspfWriter.js for the confirming DDS citations), so this
    // is now 2 independent rows rather than one.
    var rtncsrlocRec = DspfWriter.getRtncsrlocRecNameFields(kw);
    g += '<div class="section-label">Return cursor location - record/field (RTNCSRLOC *RECNAME)</div>';
    g += '<label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:12px;color:var(--ink);">' +
      '<input type="checkbox" id="' + p + '-rtncsrloc-rn-on" ' + (rtncsrlocRec.present ? 'checked' : '') + ' /> *RECNAME</label>';
    g += '<div class="three-col" style="margin-top:4px;">' +
      '<input type="text" id="' + p + '-rtncsrloc-rn-rec" placeholder="Cursor record field (name)" value="' + escapeHtml(rtncsrlocRec.cursorRecord) + '" />' +
      '<input type="text" id="' + p + '-rtncsrloc-rn-fld" placeholder="Cursor field field (name)" value="' + escapeHtml(rtncsrlocRec.cursorField) + '" />' +
      '<input type="text" id="' + p + '-rtncsrloc-rn-pos" placeholder="Cursor position field (name, optional)" value="' + escapeHtml(rtncsrlocRec.cursorPosition) + '" />' +
      '</div>';

    var rtncsrlocWm = DspfWriter.getRtncsrlocWindowMouseFields(kw);
    g += '<div class="section-label" style="margin-top:10px;">Return cursor location - position (RTNCSRLOC *WINDOW/*MOUSE)</div>';
    g += '<div style="display:flex;align-items:center;gap:10px;">';
    g += '<label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:12px;color:var(--ink);">' +
      '<input type="checkbox" id="' + p + '-rtncsrloc-wm-on" ' + (rtncsrlocWm.present ? 'checked' : '') + ' /> Enabled</label>';
    g += '<select id="' + p + '-rtncsrloc-wm-type">' +
      '<option value="WINDOW"' + (rtncsrlocWm.type === 'WINDOW' ? ' selected' : '') + '>*WINDOW</option>' +
      '<option value="MOUSE"' + (rtncsrlocWm.type === 'MOUSE' ? ' selected' : '') + '>*MOUSE</option>' +
      '</select>';
    g += '</div>';
    g += '<div class="two-col" style="margin-top:4px;">' +
      '<input type="text" id="' + p + '-rtncsrloc-wm-row1" placeholder="Cursor row 1 field (name)" value="' + escapeHtml(rtncsrlocWm.cursorRow) + '" />' +
      '<input type="text" id="' + p + '-rtncsrloc-wm-col1" placeholder="Cursor column 1 field (name)" value="' + escapeHtml(rtncsrlocWm.cursorColumn) + '" />' +
      '</div>';
    g += '<div class="two-col" style="margin-top:4px;">' +
      '<input type="text" id="' + p + '-rtncsrloc-wm-row2" placeholder="Cursor row 2 field (name, optional)" value="' + escapeHtml(rtncsrlocWm.cursorRow2) + '" />' +
      '<input type="text" id="' + p + '-rtncsrloc-wm-col2" placeholder="Cursor column 2 field (name, optional - needs row 2)" value="' + escapeHtml(rtncsrlocWm.cursorColumn2) + '" />' +
      '</div>';
    // Bug fix (L22 keyword-inventory audit): TEXT (record-level) - see
    // the file-level TEXT row's own comment above for the full rationale.
    g += '<div class="section-label">Record text (TEXT)</div>';
    g += '<input type="text" id="' + p + '-text" placeholder="Documentation text - no effect on the compiled object" value="' + escapeHtml(DspfWriter.getFileQuotedText(kw, 'TEXT')) + '" style="width:100%;" />';
    // Bug fix (Task A1 - SDA screenshot keyword-inventory audit): ALTNAME
    // (Alternative Record Name - ALTNAME('alternative-name')) sits right
    // beside TEXT on real SDA's "Select Record Keywords" screen for every
    // record type (base RECORD, PULLDOWN, PDNSFLCTL, USRDFN all show it -
    // see docs/sda-reference/screens/record-level/base-record-keywords/
    // _menu-example-RECORD/image17.png) but was completely missing from
    // this codebase. Confirmed against IBM's own DDS reference: a single
    // quoted-string parameter, no sub-parameters, used to give a record an
    // alternate name for program-described-file I/O (e.g. System/36
    // compatibility) - the exact same "one quoted literal" shape TEXT/
    // HLPTITLE/WDWTITLE already use, so this reuses
    // DspfWriter.getFileQuotedText/setFileQuotedText directly rather than
    // adding a new getX/setX pair.
    g += '<div class="section-label">Alternative record name (ALTNAME)</div>';
    g += '<input type="text" id="' + p + '-altname" placeholder="Alternative name for program-described-file I/O" value="' + escapeHtml(DspfWriter.getFileQuotedText(kw, 'ALTNAME')) + '" style="width:100%;" />';
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
    help += flagRowHtml(p + '-hlpcmdkey', 'Return command key from help (HLPCMDKEY)', fHlpcmdkey.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
    help += '<div class="section-label">Define help title (HLPTITLE)</div>';
    // Task I-27: record-level HLPTITLE rebuilt as a genuine repeatable,
    // independently-conditioned instance list (see hlptitlePanelHtml's
    // own doc comment above for the full IBM citation and why) -
    // replaces I-21's own single-instance row (a plain text input plus
    // one shared Conditioning toggle), which correctly let ONE
    // record-level HLPTITLE be conditioned but couldn't represent a
    // second one at all.
    help += hlptitlePanelHtml(kw, p, expandedSet);
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
    // Task I-21: CSRLOC is individually documented by IBM as "Option
    // indicators are valid for this keyword" (display size condition
    // names are NOT valid) - getFileTwoFieldKeyword/setFileTwoFieldKeyword
    // didn't carry a conditions parameter at all until this task, so no
    // Conditioning UI was ever offered here even though real DDS allows
    // it. Reuses flagRowHtml's own toggle markup/id convention
    // (ownerKey + '-cond' etc.) so wireFlagRowConditioning can wire it
    // unchanged - the same hand-rolled-row shape entFldAtrHtml already
    // established for ENTFLDATR above.
    var csrlocCondSummary = csrloc.conditions.length > 0 ? ' (' + csrloc.conditions.length + ')' : '';
    var csrlocExpanded = !!(expandedSet && expandedSet.has(p + '-csrloc:cond'));
    out += '<span class="kw-cond-toggle" data-flag-id="' + p + '-csrloc" style="margin-top:4px;">Conditioning' + csrlocCondSummary + (csrlocExpanded ? ' \u25b4' : ' \u25be') + '</span>';
    if (csrlocExpanded) {
      out += '<div class="kw-cond-body">' + conditionsEditorHtml(csrloc.conditions, p + '-csrloc-cond', expandedSet) + '</div>';
    }
    var slno = DspfWriter.getFileFlagKeyword(kw, 'SLNO');
    out += flagRowHtml(p + '-slno', 'Start line number (SLNO)', slno.present, slno.parameters, '*VAR or line number', undefined, undefined); // I-7: option indicators not valid
    var clrl = DspfWriter.getFileFlagKeyword(kw, 'CLRL');
    out += flagRowHtml(p + '-clrl', 'Clear previous display (CLRL)', clrl.present, clrl.parameters, 'line number, or nn ...', undefined, undefined); // I-7: option indicators not valid
    panels.output = out;

    // --- Input ---
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    var inp = flagRowHtml(p + '-loginp', 'Write record to job log (LOGINP)', fLoginp.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
    var unlock = DspfWriter.getUnlockKeyword(kw);
    inp += flagRowHtml(p + '-unlock', 'Unlock keyboard after input operation (UNLOCK)', unlock.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
    inp += '<div style="display:flex;gap:14px;margin-bottom:10px;">' +
      '<label class="attr-check"><input type="checkbox" id="' + p + '-unlock-erase" ' + (unlock.erase ? 'checked' : '') + '/>Erase input capable fields (*ERASE)</label>' +
      '<label class="attr-check"><input type="checkbox" id="' + p + '-unlock-mdtoff" ' + (unlock.mdtoff ? 'checked' : '') + '/>Reset all modified data tags (*MDTOFF)</label></div>';
    var fGetretain = DspfWriter.getFileFlagKeyword(kw, 'GETRETAIN');
    inp += flagRowHtml(p + '-getretain', 'If UNLOCK, retain data on display (GETRETAIN)', fGetretain.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
    var retlcksts = DspfWriter.getFileFlagKeyword(kw, 'RETLCKSTS');
    // Task I-50: RETLCKSTS's own DDS Reference text states "This keyword
    // has no parameters" - the params box (previously rendered here
    // unconditionally, matching the pre-fix hasParams=true wiring below)
    // was a pre-existing bug, not real DDS syntax. Dropped both
    // paramsValue and paramsPlaceholder so flagRowHtml renders this as a
    // plain flag+conditioning row, same shape as LOGOUT/BLINK/etc. above.
    inp += flagRowHtml(p + '-retlcksts', 'Retain LOCK status on next read (RETLCKSTS)', retlcksts.present, undefined, undefined, retlcksts.conditions, expandedSet);
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    inp += flagRowHtml(p + '-check-ab', 'Allow blanks in input fields', fCheckAb.present, undefined, undefined, undefined, undefined); // I-7: option indicators valid only for CHECK(ER)/CHECK(ME)
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    inp += flagRowHtml(p + '-check-rl', 'Move cursor right to left', fCheckRl.present, undefined, undefined, undefined, undefined); // I-7: option indicators valid only for CHECK(ER)/CHECK(ME)
    var fRtndta = DspfWriter.getFileFlagKeyword(kw, 'RTNDTA');
    inp += flagRowHtml(p + '-rtndta', 'Return same input data on next read (RTNDTA)', fRtndta.present, undefined, undefined, undefined, undefined); // I-7: option indicators not valid
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
    // Task I-2 (keywordFixes.md): see file-level Print's own comment -
    // "System handles print" writes PRINT's own parameter form, not a
    // separate (non-existent) PRTFILE keyword.
    var print = DspfWriter.getFileFlagKeyword(kw, 'PRINT');
    var printFileForm = DspfWriter.getFilePrintFileForm(kw);
    var pr = flagRowHtml(p + '-print', 'Enable Print key (PRINT)', print.present, print.parameters, 'response indicator (if program handles it)', print.conditions, expandedSet);
    pr += '<div class="section-label">System handles print</div>';
    pr += '<div class="two-col"><input type="text" id="' + p + '-print-file" placeholder="Print file (name or *PGM)" value="' + escapeHtml(printFileForm.isPgm ? '*PGM' : printFileForm.printFile) + '" />' +
      '<input type="text" id="' + p + '-print-library" placeholder="Library" value="' + escapeHtml(printFileForm.library) + '" /></div>';
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
  // One control from the real "Define Message Record" screen is
  // deliberately NOT wired here: "Roll keyword" (its real DDS argument
  // shape wasn't confidently verified against IBM's own reference). Real
  // SDA's "Define Indicator Keywords" screen's CHANGE keyword is left out
  // for the same reason - only INDTXT and SETOF's shapes were confirmed.
  // Both route through the raw Keywords editor accordion that sits
  // alongside this panel, same fallback every other uncertain-shape
  // keyword in this codebase uses. "Display size conditioning" (SFLMSGRCD's
  // own DSPSIZ conditioning, further down in sflMsgPanelsHtml/
  // wireSflMsgPanels) IS wired - see getSflMsgRcdLines/setSflMsgRcdLines's
  // own doc comment in dspfWriter.js for the DDS Reference citation and
  // this task's own bug-fix history (an earlier version only tracked one
  // of the file's two possible display sizes and silently lost the other's
  // conditioned value on edit).
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
   * Task L74 - shared "Program message queue field (SFLPGMQ)" mini-panel,
   * extracted out of Task L73's Message Record work once L74 confirmed
   * (against IBM's own DDS reference - "you use this field-level keyword
   * on the second (and last) field in the subfile record format... In
   * addition, SFLPGMQ can be specified on the subfile-control record
   * format when SFLINZ is specified") that SFLPGMQ is a FIELD-level
   * keyword in BOTH places, never the record-level "keyword whose own
   * parameter names a field" shape SFLCSRRRN/SFLMODE use - so this is
   * genuinely the same lookup/render/commit shape in both the SFLMSG tab
   * and the SFLCTL tab, not two similar-looking but structurally
   * different features. `idPrefix` namespaces the row's 3 element ids
   * (name input, its error slot, the 276-byte checkbox) so both tabs can
   * render this panel without colliding.
   */
  function sflPgmqFieldHtml(rec, idPrefix) {
    var queueField = (rec.fields || []).find(function (f) { return (f.keywords || []).some(function (k) { return k.name === 'SFLPGMQ'; }); });
    var queueKw = queueField && queueField.keywords.find(function (k) { return k.name === 'SFLPGMQ'; });
    var html = '<div class="section-label">Program message queue field (SFLPGMQ)</div>';
    if (queueField) {
      html += '<input type="text" id="' + idPrefix + '-name" value="' + escapeHtml(queueField.name) + '" style="width:100%;" />';
      html += '<div class="rename-error" id="' + idPrefix + '-error"></div>';
      var is276 = !!(queueKw && (queueKw.parameters || '').trim() === '276');
      html += '<label style="display:flex;align-items:center;gap:6px;margin-top:6px;text-transform:none;font-size:12px;color:var(--ink);">' +
        '<input type="checkbox" id="' + idPrefix + '-276" ' + (is276 ? 'checked' : '') + ' /> Generate a 276 byte field</label>';
    } else {
      html += '<div class="status">(none yet - add via the Hidden tab)</div>';
    }
    return html;
  }

  /** Wires sflPgmqFieldHtml()'s rename input + 276-byte checkbox -
   *  `commitFieldUpdate(field, updates)` is the same field-level commit
   *  path wireSflMsgFieldRefs already takes (see its own doc comment).
   *  The rename validation (non-blank, valid DDS name, not already used
   *  by another field in the record) is the same 3 checks the Hidden
   *  tab's own add-field form and wireSflMsgFieldRefs's `wireRename`
   *  already apply, duplicated here in this shared function's own scope
   *  rather than importing wireSflMsgFieldRefs's closure. */
  function wireSflPgmqField(rec, idPrefix, commitFieldUpdate) {
    var queueField = (rec.fields || []).find(function (f) { return (f.keywords || []).some(function (k) { return k.name === 'SFLPGMQ'; }); });
    if (!queueField) return;

    var nameInput = document.getElementById(idPrefix + '-name');
    if (nameInput) {
      nameInput.addEventListener('change', function () {
        var errorEl = document.getElementById(idPrefix + '-error');
        if (errorEl) errorEl.textContent = '';
        var newName = (nameInput.value || '').trim().toUpperCase();
        if (!newName) {
          if (errorEl) errorEl.textContent = 'Enter a name.';
          nameInput.value = queueField.name;
          return;
        }
        if (newName === queueField.name) return;
        if (!isValidDdsName(newName)) {
          if (errorEl) errorEl.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).';
          nameInput.value = queueField.name;
          return;
        }
        if ((rec.fields || []).some(function (f) { return f !== queueField && f.name === newName; })) {
          if (errorEl) errorEl.textContent = 'A field named "' + newName + '" already exists in this record.';
          nameInput.value = queueField.name;
          return;
        }
        commitFieldUpdate(queueField, { name: newName });
      });
    }

    var queue276 = document.getElementById(idPrefix + '-276');
    if (queue276) {
      queue276.addEventListener('change', function () {
        var newKeywords = DspfWriter.setFileFlagKeyword(queueField.keywords, 'SFLPGMQ', true, queue276.checked ? '276' : '');
        commitFieldUpdate(queueField, { keywords: newKeywords });
      });
    }
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
  function sflMsgPanelsHtml(rec, expandedSet, fileKeywords) {
    var kw = rec.keywords || [];
    var panels = {};

    // --- Message Record ---
    // Line for first message (SFLMSGRCD): an unconditioned "primary" value,
    // PLUS - since DDS DSPSIZ allows at most two sizes - one more input per
    // declared size, each independently conditioned by that size's own
    // name. Bug fix: this used to only ever expose ONE conditioned input
    // (for the file's *second* declared size), silently treating the
    // *first* size as if it were always the unconditioned "primary" value.
    // Real DDS - and real SDA's own generated output - can condition BOTH
    // sizes explicitly with NO unconditioned entry at all (e.g. `*DS3
    // SFLMSGRCD(24)` / `*DS4 SFLMSGRCD(26)`, reported directly against a
    // screenshot of exactly that). With the old single-conditioned-input
    // UI, the first size's own conditioned value was invisible (hidden
    // behind the blank "primary" box) and got silently DESTROYED the
    // moment either input was edited - either dropped outright, or
    // resurrected as a bogus unconditioned SFLMSGRCD that duplicates/
    // conflicts with the second size's own conditioned one. Now renders
    // (and wireSflMsgPanels commits) one input per size in `sizeList`,
    // independently of the always-present unconditioned primary input -
    // see getSflMsgRcdLines/setSflMsgRcdLines's own doc comment in
    // dspfWriter.js, whose `{primary, bySizeName}` shape already supported
    // this correctly; only this UI layer had the bug.
    var rcdLines = DspfWriter.getSflMsgRcdLines(kw);
    var sizeList = DspfWriter.getDisplaySizesList(fileKeywords || []);
    var mr = '<div class="section-label">Line for first message, or a field name (SFLMSGRCD)</div>';
    mr += '<input type="text" id="sm-sflmsgrcd" placeholder="1-27, or a field name" value="' + escapeHtml(rcdLines.primary) + '" style="width:100%;" />';
    if (sizeList.length > 1) {
      sizeList.forEach(function (size, idx) {
        mr += '<div class="section-label" style="margin-top:6px;">Display size conditioning (' + escapeHtml(size.name) + ')</div>';
        mr += '<input type="text" id="sm-sflmsgrcd-ds' + idx + '" placeholder="1-27, or a field name, for ' + escapeHtml(size.name) + '" value="' + escapeHtml(rcdLines.bySizeName[size.name] || '') + '" style="width:100%;" />';
      });
      mr += '<div class="hint-small">Required if the line number changes between the file\u2019s two display sizes - leave a size\u2019s own input blank to fall back to the unconditioned value above for that size.</div>';
    } else {
      mr += '<div class="hint-small">Add a second display size (file-level Display Sizes picker) to condition this by DSPSIZ.</div>';
    }
    mr += '<div class="hint-small">Real SDA also offers a "Roll keyword" here - its DDS argument shape wasn\u2019t confidently verified, so use the raw Keywords editor below if you need it.</div>';

    var keyField = (rec.fields || []).find(function (f) { return (f.keywords || []).some(function (k) { return k.name === 'SFLMSGKEY'; }); });
    // Task L73: this used to be read-only status text pointing the person
    // at the Hidden fields tab to rename the field - real SDA's own
    // "Define Message Record" screen shows it as a directly editable Name
    // input right here. Renaming a hidden field is safe with a plain
    // DspfWriter.applyFieldUpdate({name}) - unlike a RECORD rename (see
    // renameRecordReferences), nothing else in this codebase's three
    // RECORD_REFERENCE_LOCATORS references a hidden field by name, so no
    // reference-rewrite pass is needed here. See wireSflMsgFieldRefs below
    // for the commit/validation half of this.
    mr += '<div class="section-label">Message ID field (SFLMSGKEY)</div>';
    if (keyField) {
      mr += '<input type="text" id="sm-msgkey-name" value="' + escapeHtml(keyField.name) + '" style="width:100%;" />';
      mr += '<div class="rename-error" id="sm-msgkey-error"></div>';
    } else {
      mr += '<div class="status">(none yet - add via the Hidden tab)</div>';
    }
    // Task L74: the Program message queue field row itself is now the
    // shared sflPgmqFieldHtml (see its own comment) - SFLCTL's own tab
    // renders the exact same row for its own copy of this field.
    mr += sflPgmqFieldHtml(rec, 'sm-pgmq');
    mr += '<div class="hint-small">Renaming either field here updates it in place. Add a missing field, or edit its length/type, via the Hidden fields tab.</div>';
    panels.messageRecord = mr;

    // --- General ---
    var g = '';
    var fSflnxtchg = DspfWriter.getFileFlagKeyword(kw, 'SFLNXTCHG');
    g += flagRowHtml('sm-sflnxtchg', 'Return this record on read next changed (SFLNXTCHG)', fSflnxtchg.present, undefined, undefined, fSflnxtchg.conditions, expandedSet);
    var fLogout = DspfWriter.getFileFlagKeyword(kw, 'LOGOUT');
    g += flagRowHtml('sm-logout', 'Write this record to the job log on output (LOGOUT)', fLogout.present, undefined, undefined, fLogout.conditions, expandedSet);
    // Task I-23: this record already has SFLMSGRCD (it's a message
    // subfile), and IBM's own DDS Reference documents LOGOUT as ignored
    // in that case - advisory only, see
    // DspfWriter.loginpLogoutSflMsgRcdIgnoredNote's own doc comment.
    if (fLogout.present) {
      var logoutNote = DspfWriter.loginpLogoutSflMsgRcdIgnoredNote('LOGOUT', kw);
      if (logoutNote) g += '<div class="hint-small">' + escapeHtml(logoutNote) + '</div>';
    }
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    g += flagRowHtml('sm-loginp', 'Write this record to the job log on input (LOGINP)', fLoginp.present, undefined, undefined, fLoginp.conditions, expandedSet);
    if (fLoginp.present) {
      var loginpNote = DspfWriter.loginpLogoutSflMsgRcdIgnoredNote('LOGINP', kw);
      if (loginpNote) g += '<div class="hint-small">' + escapeHtml(loginpNote) + '</div>';
    }
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml('sm-check-ab', 'Allow blanks (CHECK AB)', fCheckAb.present, undefined, undefined, fCheckAb.conditions, expandedSet);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml('sm-check-rl', 'Move cursor right to left (CHECK RL)', fCheckRl.present, undefined, undefined, fCheckRl.conditions, expandedSet);
    g += chgInpDftFlagHtml(kw, 'sm-chginpdft', 'Change input defaults (CHGINPDFT)', expandedSet);
    // Task I-25: KEEP (shown on real SDA's own "Select Subfile Message
    // Keywords" screen) is deliberately NOT repeated here anymore - it's
    // already on Task R1's base Record Keywords -> General tab, shown for
    // every record type including this one, so a second live copy here was
    // just two controls fighting over the same keyword (same rationale
    // I-25 applied to the SFL/SFLCTL tabs' own KEEP copies below).
    g += '<div class="hint-small">Keep records on display when closing the file (KEEP) is on the base Record Keywords \u2192 General tab above - shared across every record type.</div>';
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
  function wireRecordKeywordsPanels(idPrefix, getKeywords, onChange, expandedSet, rerender, getFileKeywords) {
    var p = idPrefix;
    // Task I-7: several keywords below were noConditioning=true under the
    // old plain simple() wiring - IBM's own DDS Reference states "Option
    // indicators are not valid for this keyword" for each (INZRCD/ASSUME/
    // ALWROL/HLPCMDKEY/SLNO/CLRL/LOGINP/GETRETAIN/RTNDTA), same pattern
    // I-3 already established at file level for CHGINPDFT/OPENPRT/etc.
    // Task I-44: this panel's own local simple() helper (a thin wrapper
    // around wireFlagRow with no USRDFN check) has been removed - every
    // row that used it now goes through wireUsrdfnGuardedFlag/
    // wireUsrdfnGuardedTwoField/wirePulldownGuardedFlag instead (see each
    // row's own I-44 comment below for why), so nothing in this function
    // calls plain wireFlagRow directly anymore except the two
    // CHECK(AB)/CHECK(RL) rows and the Print row below, neither of which
    // this task's 33-keyword list names.
    /** `ownerKey`/`condExpandedSet`/`condRerender` (optional, Task I-21) add
     *  a Conditioning toggle identical in shape to wireFlagRow's own -
     *  omit all three (as HLPSEQ's own guarded wrapper below still does,
     *  since IBM documents HLPSEQ as NOT eligible for option-indicator
     *  conditioning) to keep the plain text-only wiring unchanged. */
    function wireTwoField(elIdA, elIdB, name, ownerKey, condExpandedSet, condRerender) {
      var elA = document.getElementById(elIdA);
      var elB = document.getElementById(elIdB);
      function commit(conditions) { onChange(DspfWriter.setFileTwoFieldKeyword(getKeywords(), name, elA.value, elB.value, conditions)); }
      if (elA) elA.addEventListener('change', function () { commit(); });
      if (elB) elB.addEventListener('change', function () { commit(); });
      if (ownerKey) {
        wireFlagRowConditioning(ownerKey, DspfWriter.getFileTwoFieldKeyword(getKeywords(), name).conditions, commit, condExpandedSet, condRerender);
      }
    }
    // Task I-8/I-13: ALWROL/ASSUME/HLPCMDKEY are each individually
    // documented by the DDS Reference as incompatible with a USRDFN
    // record (usrdfnConflictReason), and ALWROL/ASSUME (but not
    // HLPCMDKEY) are separately individually documented as incompatible
    // with a PULLDOWN record too (pulldownConflictReason) - see each
    // function's own doc comment for citations. Checking both here is
    // harmless for HLPCMDKEY (pulldownConflictReason returns null for it,
    // it's not on PULLDOWN's own forbidden list). Same alert+revert idiom
    // as I-11's SFLNXTCHG guard; plain simple()/wireFlagRow has no hook to
    // intercept the on-transition, so these are hand-wired here instead.
    // Task I-12: ALWROL/ASSUME are ALSO individually documented as
    // incompatible with a WINDOW record (see DspfWriter.
    // windowConflictReason's own doc comment) - `alsoCheckWindow` lets
    // those two call sites layer that third check on top of the
    // existing USRDFN/PULLDOWN ones, without dragging WINDOW into
    // HLPCMDKEY's own guard below (WINDOW's own DDS Reference text
    // doesn't name HLPCMDKEY at all).
    // Task I-28: ALWROL is ALSO individually documented as incompatible
    // with KEEP (see DspfWriter.keepMutexConflictReason's own doc
    // comment) - `alsoCheckKeep` layers that fourth check on top of the
    // existing USRDFN/PULLDOWN/WINDOW ones, without dragging KEEP into
    // ASSUME's or HLPCMDKEY's own guards below (neither is on KEEP's own
    // exclusion list).
    // Task I-36: ALWROL is ALSO individually documented as incompatible
    // with the record named by file-level PASSRCD (see DspfWriter.
    // passrcdRecordConflictReason's own doc comment, and I-24's own
    // WINDOW-vs-PASSRCD guard this reuses the same primitive for) -
    // `alsoCheckPassrcd` layers a fifth check on top, using `p`/
    // `getFileKeywords` already in this outer function's own closure to
    // get this record's own name and the file's current PASSRCD value.
    // Task I-37: ALWROL/CLRL/SLNO's own DDS Reference sections also list
    // ASSUME/SFL/SFLCTL/USRDFN as mutually exclusive with themselves,
    // and ASSUME's own section confirms the reverse for ALWROL/CLRL/
    // SLNO - see DspfWriter.alwrolClrlSlnoConflictReason's own doc
    // comment. Deliberately unconditional (not behind a 6th alsoCheckX
    // param): it returns null for every keywordName other than ALWROL/
    // CLRL/SLNO/ASSUME, so it's a safe no-op for this function's other
    // caller (HLPCMDKEY).
    // Task I-44: two new trailing params, both defaulting to the exact
    // prior behavior (no params box, no Conditioning toggle) so ASSUME/
    // ALWROL/HLPCMDKEY above are completely unaffected. `hasParams` mirrors
    // simple()'s/wirePulldownGuardedFlag's own flag for the I-44 call
    // site that needs it (DSPMOD; RETLCKSTS's own hasParams=true was fixed
    // to false by I-50, since RETLCKSTS's own DDS Reference text says
    // "This keyword has no parameters"). `withConditioning` wires the same live Conditioning toggle
    // simple()'s own noConditioning=false default provides, for the I-44
    // call sites whose keyword is individually documented "Option
    // indicators are valid for this keyword" (unlike ASSUME/ALWROL/
    // HLPCMDKEY, none of which offered a toggle here before either).
    function wireUsrdfnGuardedFlag(id, name, alsoCheckWindow, alsoCheckKeep, alsoCheckPassrcd, hasParams, withConditioning) {
      var onEl = document.getElementById(id + '-on');
      var paramsEl = hasParams ? document.getElementById(id + '-params') : null;
      function commit(conditions) {
        var present = onEl.checked;
        var params = paramsEl ? paramsEl.value : '';
        if (present) {
          var reason = DspfWriter.usrdfnConflictReason(name, getKeywords()) ||
            DspfWriter.pulldownConflictReason(name, getKeywords()) ||
            (alsoCheckWindow ? DspfWriter.windowConflictReason(name, getKeywords()) : null) ||
            (alsoCheckKeep ? DspfWriter.keepMutexConflictReason(name, getKeywords()) : null) ||
            (alsoCheckPassrcd && getFileKeywords ? DspfWriter.passrcdRecordConflictReason(name, DspfWriter.getFileFlagKeyword(getFileKeywords(), 'PASSRCD').parameters, p.slice(3)) : null) ||
            DspfWriter.alwrolClrlSlnoConflictReason(name, getKeywords());
          if (reason) {
            window.alert(reason);
            onEl.checked = DspfWriter.getFileFlagKeyword(getKeywords(), name).present;
            return;
          }
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), name, present, hasParams ? params : '', undefined, conditions));
      }
      if (onEl) onEl.addEventListener('change', function () { commit(); });
      if (paramsEl) paramsEl.addEventListener('change', function () { commit(); });
      if (withConditioning) {
        wireFlagRowConditioning(id, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, commit, expandedSet, rerender);
      }
    }
    // Task I-8/I-13: HLPSEQ's own guard - same rule (and, per I-13, HLPSEQ
    // is ALSO individually on PULLDOWN's own forbidden list, unlike
    // HLPCMDKEY above), but HLPSEQ has no on/off checkbox of its own
    // (getFileTwoFieldKeyword/setFileTwoFieldKeyword's "present" is
    // implied by either text box being non-blank, per their own doc
    // comments), so the on-transition here is "either box just became
    // non-blank" rather than a checkbox flipping true.
    // Task I-44: three new trailing params (mirroring wireTwoField's own
    // ownerKey/condExpandedSet/condRerender shape) so this can replace
    // CSRLOC's own plain wireTwoField call without dropping its existing
    // live Conditioning toggle - CSRLOC is individually documented "Option
    // indicators are valid for this keyword" (unlike HLPSEQ below, whose
    // own call site omits all three and keeps its pre-existing
    // noConditioning behavior unchanged).
    function wireUsrdfnGuardedTwoField(elIdA, elIdB, name, ownerKey, condExpandedSet, condRerender) {
      var elA = document.getElementById(elIdA);
      var elB = document.getElementById(elIdB);
      function commit(conditions) {
        var aVal = elA ? elA.value : '';
        var bVal = elB ? elB.value : '';
        if ((aVal || '').trim() || (bVal || '').trim()) {
          var reason = DspfWriter.usrdfnConflictReason(name, getKeywords()) || DspfWriter.pulldownConflictReason(name, getKeywords());
          if (reason) {
            window.alert(reason);
            var existing = DspfWriter.getFileTwoFieldKeyword(getKeywords(), name);
            if (elA) elA.value = existing.a;
            if (elB) elB.value = existing.b;
            return;
          }
        }
        onChange(DspfWriter.setFileTwoFieldKeyword(getKeywords(), name, aVal, bVal, conditions));
      }
      if (elA) elA.addEventListener('change', function () { commit(); });
      if (elB) elB.addEventListener('change', function () { commit(); });
      if (ownerKey) {
        wireFlagRowConditioning(ownerKey, DspfWriter.getFileTwoFieldKeyword(getKeywords(), name).conditions, commit, condExpandedSet, condRerender);
      }
    }
    // Task I-13 - PULLDOWN record-level keyword audit. The remaining
    // keywords on this shared RECORD panel that IBM's own DDS Reference
    // individually lists, in the PULLDOWN keyword's own section, as
    // unable to be specified on a record that carries PULLDOWN (and none
    // of which have any OTHER project already guarding them, unlike
    // ALWROL/ASSUME/HLPSEQ above) - see
    // DspfWriter.pulldownConflictReason's own doc comment for the full
    // citation and keyword list. Same alert+revert idiom, hand-wired here
    // instead of simple()/wireFlagRow for the same reason as above.
    // `hasParams` mirrors simple()'s own flag for the handful of these
    // (SLNO/CLRL/MDTOFF/ERASEINP) that carry a free-text parameter box.
    // Task I-28: SLNO and CLRL are ALSO individually documented as
    // incompatible with KEEP (see DspfWriter.keepMutexConflictReason's
    // own doc comment) - `alsoCheckKeep` layers that check on top of the
    // existing PULLDOWN one for just those two call sites below, without
    // dragging KEEP into every other keyword this same function wires
    // (none of the rest is on KEEP's own exclusion list).
    // Task I-36: SLNO and CLRL are ALSO individually documented as
    // incompatible with the record named by file-level PASSRCD - same
    // `alsoCheckPassrcd` pattern as wireUsrdfnGuardedFlag's own I-36
    // addition just above, reusing `p`/`getFileKeywords` from this outer
    // function's own closure.
    // Task I-37: CLRL/SLNO's own DDS Reference sections also list
    // ASSUME/SFL/SFLCTL/USRDFN as mutually exclusive with themselves -
    // see wireUsrdfnGuardedFlag's own I-37 comment above and
    // DspfWriter.alwrolClrlSlnoConflictReason's own doc comment.
    // Deliberately unconditional here too, same reasoning.
    // Task I-44: usrdfnConflictReason is ALSO deliberately unconditional
    // here (not behind a 7th alsoCheckX param) for the exact same reason -
    // USRDFN's own DDS Reference section is a blanket whitelist ("No
    // file- or record-level keywords apply to this record except
    // INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and
    // TEXT"), not a short per-keyword exclusion list, so usrdfnConflictReason
    // correctly returns null for every one of this function's 15 I-44
    // call sites regardless (none is on that whitelist), making this a
    // safe, uniform addition rather than something needing per-caller
    // opt-in like alsoCheckKeep/alsoCheckPassrcd above.
    function wirePulldownGuardedFlag(id, name, hasParams, alsoCheckKeep, alsoCheckPassrcd) {
      var onEl = document.getElementById(id + '-on');
      var paramsEl = hasParams ? document.getElementById(id + '-params') : null;
      function commit() {
        var present = onEl.checked;
        if (present) {
          var reason = DspfWriter.usrdfnConflictReason(name, getKeywords()) ||
            DspfWriter.pulldownConflictReason(name, getKeywords()) ||
            (alsoCheckKeep ? DspfWriter.keepMutexConflictReason(name, getKeywords()) : null) ||
            (alsoCheckPassrcd && getFileKeywords ? DspfWriter.passrcdRecordConflictReason(name, DspfWriter.getFileFlagKeyword(getFileKeywords(), 'PASSRCD').parameters, p.slice(3)) : null) ||
            DspfWriter.alwrolClrlSlnoConflictReason(name, getKeywords());
          if (reason) {
            window.alert(reason);
            onEl.checked = DspfWriter.getFileFlagKeyword(getKeywords(), name).present;
            return;
          }
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), name, present, paramsEl ? paramsEl.value : ''));
      }
      if (onEl) onEl.addEventListener('change', commit);
      if (paramsEl) paramsEl.addEventListener('change', commit);
    }
    // Task I-28: KEEP's own guard - same alert+revert idiom as
    // wireUsrdfnGuardedFlag/wirePulldownGuardedFlag above, hand-wired
    // separately (rather than adding a 5th param to one of those) since
    // KEEP itself isn't on USRDFN's or PULLDOWN's own forbidden lists -
    // only DspfWriter.keepMutexConflictReason applies to it.
    function wireKeepGuardedFlag(id, name) {
      var onEl = document.getElementById(id + '-on');
      function commit() {
        var present = onEl.checked;
        if (present) {
          var reason = DspfWriter.keepMutexConflictReason(name, getKeywords());
          if (reason) {
            window.alert(reason);
            onEl.checked = DspfWriter.getFileFlagKeyword(getKeywords(), name).present;
            return;
          }
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), name, present, ''));
      }
      if (onEl) onEl.addEventListener('change', commit);
    }

    // General
    // Task I-13: INZRCD is on PULLDOWN's own forbidden-keyword list -
    // wirePulldownGuardedFlag replaces the plain simple() this used to
    // go through (was already noConditioning=true per I-7, unaffected).
    wirePulldownGuardedFlag(p + '-inzrcd', 'INZRCD', false);
    // Task I-28: KEEP's own row no longer goes through plain simple() -
    // see wireKeepGuardedFlag's own doc comment above, and
    // recordKeywordsPanelsHtml's matching I-28 comment on the build side
    // for the Conditioning-toggle half of this same fix.
    wireKeepGuardedFlag(p + '-keep', 'KEEP');
    wireUsrdfnGuardedFlag(p + '-assume', 'ASSUME', true);
    wireUsrdfnGuardedFlag(p + '-alwrol', 'ALWROL', true, true, true);
    // Task I-44: RETKEY/RETCMDKEY/CSRINPONLY are each individually
    // record-level keywords with no exclusion list of their own naming
    // any OTHER specific keyword - the gap was purely USRDFN's own
    // unenforced whitelist (see wireUsrdfnGuardedFlag's own I-44 comment
    // above), so plain simple() is replaced here with no other
    // alsoCheckX flags needed. All three keep their existing Conditioning
    // toggle (each individually documented "Option indicators are valid
    // for this keyword" - CSRINPONLY's own DDS Reference section says so
    // explicitly; RETKEY/RETCMDKEY's shared section doesn't say either
    // way, so their pre-existing toggle is left exactly as it was).
    wireUsrdfnGuardedFlag(p + '-retkey', 'RETKEY', false, false, false, false, true);
    wireUsrdfnGuardedFlag(p + '-retcmdkey', 'RETCMDKEY', false, false, false, false, true);
    wireUsrdfnGuardedFlag(p + '-csrinponly', 'CSRINPONLY', false, false, false, false, true);
    wireChgInpDftFlag(getKeywords, onChange, p + '-chginpdft', expandedSet, rerender);
    // Task L76 (superseded by Task I-17 below) - hand-wired panel/wire
    // pair rather than the generic wireFlagRow/simple() helpers above,
    // now further replaced by mnubardspPanelHtml/wireMnubardspPanel's own
    // repeatable-instance shell (see recordKeywordsPanelsHtml's matching
    // comment on the build side).
    wireMnubardspPanel(getKeywords, onChange, p, expandedSet, rerender);
    wireEntFldAtrEditor(getKeywords, onChange, p + '-entfldatr', expandedSet, rerender);
    // Task L77 - hand-wired (like MNUBARDSP above) since RTNCSRLOC's two
    // independent variants each need their own "present" checkbox + name
    // fields, not a single wireTwoField pair. The two IIFEs are
    // independent commits - editing one variant's fields never touches
    // the other's keyword instance (see setRtncsrlocRecNameFields/
    // setRtncsrlocWindowMouseFields's own "left untouched" comments).
    (function wireRtncsrlocRecName() {
      var onEl = document.getElementById(p + '-rtncsrloc-rn-on');
      var recEl = document.getElementById(p + '-rtncsrloc-rn-rec');
      var fldEl = document.getElementById(p + '-rtncsrloc-rn-fld');
      var posEl = document.getElementById(p + '-rtncsrloc-rn-pos');
      function commit() {
        onChange(DspfWriter.setRtncsrlocRecNameFields(getKeywords(), onEl.checked, recEl ? recEl.value : '', fldEl ? fldEl.value : '', posEl ? posEl.value : ''));
      }
      if (onEl) onEl.addEventListener('change', commit);
      if (recEl) recEl.addEventListener('change', commit);
      if (fldEl) fldEl.addEventListener('change', commit);
      if (posEl) posEl.addEventListener('change', commit);
    })();
    (function wireRtncsrlocWindowMouse() {
      var onEl = document.getElementById(p + '-rtncsrloc-wm-on');
      var typeEl = document.getElementById(p + '-rtncsrloc-wm-type');
      var row1El = document.getElementById(p + '-rtncsrloc-wm-row1');
      var col1El = document.getElementById(p + '-rtncsrloc-wm-col1');
      var row2El = document.getElementById(p + '-rtncsrloc-wm-row2');
      var col2El = document.getElementById(p + '-rtncsrloc-wm-col2');
      function commit() {
        onChange(DspfWriter.setRtncsrlocWindowMouseFields(getKeywords(), onEl.checked, typeEl ? typeEl.value : 'WINDOW', row1El ? row1El.value : '', col1El ? col1El.value : '', row2El ? row2El.value : '', col2El ? col2El.value : ''));
      }
      if (onEl) onEl.addEventListener('change', commit);
      if (typeEl) typeEl.addEventListener('change', commit);
      if (row1El) row1El.addEventListener('change', commit);
      if (col1El) col1El.addEventListener('change', commit);
      if (row2El) row2El.addEventListener('change', commit);
      if (col2El) col2El.addEventListener('change', commit);
    })();
    var pText = document.getElementById(p + '-text');
    if (pText) pText.addEventListener('change', function () { onChange(DspfWriter.setFileQuotedText(getKeywords(), 'TEXT', pText.value)); });
    // Task I-13: ALTNAME is on PULLDOWN's own forbidden-keyword list -
    // same alert+revert guard as wirePulldownGuardedFlag above, but
    // ALTNAME is a plain text keyword (setFileQuotedText), not a
    // checkbox, so "present" here means the box just became non-blank.
    var pAltname = document.getElementById(p + '-altname');
    if (pAltname) pAltname.addEventListener('change', function () {
      var val = pAltname.value;
      if ((val || '').trim()) {
        var reason = DspfWriter.pulldownConflictReason('ALTNAME', getKeywords());
        if (reason) {
          window.alert(reason);
          pAltname.value = DspfWriter.getFileQuotedText(getKeywords(), 'ALTNAME');
          return;
        }
      }
      onChange(DspfWriter.setFileQuotedText(getKeywords(), 'ALTNAME', val));
    });

    // Indicator / screen-control (Task L5d)
    wireRecordIndicatorInstances(getKeywords(), onChange, p + '-recind', expandedSet, rerender, getFileKeywords);

    // Application help - Task L5d-ii moved this to each HELP entry's own
    // properties (see wireApplicationHelpFields below); nothing to wire
    // here anymore.

    // Help
    // Task I-13: HLPCLR is on PULLDOWN's own forbidden-keyword list (I-8
    // confirmed it has no USRDFN-side restriction, but PULLDOWN is a
    // separate, unrelated conflict).
    wirePulldownGuardedFlag(p + '-hlpclr', 'HLPCLR', false);
    wireUsrdfnGuardedTwoField(p + '-hlpseq-group', p + '-hlpseq-num', 'HLPSEQ');
    wireUsrdfnGuardedFlag(p + '-hlpcmdkey', 'HLPCMDKEY');
    // Task I-27: record-level HLPTITLE rebuilt as a repeatable instance
    // list - see hlptitlePanelHtml's own doc comment above. (This
    // replaces the old single `#p-hlptitle` input/listener pair I-21 had
    // wired here; wireFileKeywordsPanel's own file-level HLPTITLE row - a
    // different, correctly single-instance, unconditioned keyword per
    // IBM - is untouched and still uses that same id pattern.)
    wireHlptitlePanel(getKeywords, onChange, p, expandedSet, rerender);

    // Output
    // Task I-13: ALARM/INVITE/ALWGPH/FRCDTA/SLNO/CLRL are each on
    // PULLDOWN's own forbidden-keyword list - wirePulldownGuardedFlag
    // replaces the plain simple() these used to go through (noConditioning
    // status per I-3/I-7 is unaffected: SLNO/CLRL still pass no
    // conditions/expandedSet/rerender, matching simple()'s own
    // noConditioning=true behavior).
    // Task I-44: BLINK/MSGALARM/LOCK/LOGOUT are each individually
    // record-level keywords with their own DDS Reference section
    // confirming "Option indicators are valid for this keyword" and no
    // OTHER specific-keyword exclusion list - same USRDFN-whitelist-only
    // gap as RETKEY/RETCMDKEY/CSRINPONLY above, so their existing
    // Conditioning toggle is preserved via wireUsrdfnGuardedFlag's own
    // withConditioning flag.
    wireUsrdfnGuardedFlag(p + '-blink', 'BLINK', false, false, false, false, true);
    wirePulldownGuardedFlag(p + '-alarm', 'ALARM', false);
    wireUsrdfnGuardedFlag(p + '-msgalarm', 'MSGALARM', false, false, false, false, true);
    wireUsrdfnGuardedFlag(p + '-lock', 'LOCK', false, false, false, false, true);
    wireUsrdfnGuardedFlag(p + '-logout', 'LOGOUT', false, false, false, false, true);
    wirePulldownGuardedFlag(p + '-invite', 'INVITE', false);
    wirePulldownGuardedFlag(p + '-alwgph', 'ALWGPH', false);
    wirePulldownGuardedFlag(p + '-frcdta', 'FRCDTA', false);
    // Task I-45 (split off from this same I-44 finding): DSPMOD has its
    // own separate unchecked DSPSIZ(*DS3 *DS4) prerequisite, unrelated to
    // USRDFN - out of scope here, logged for later pickup. This row only
    // gains the USRDFN-whitelist guard; hasParams=true and the existing
    // Conditioning toggle are both preserved unchanged.
    wireUsrdfnGuardedFlag(p + '-dspmod', 'DSPMOD', false, false, false, true, true);
    // Task I-44: CSRLOC's own DDS Reference section explicitly lists
    // "User-defined record formats (identified by the USRDFN keyword)"
    // as invalid for this keyword, and separately confirms "Option
    // indicators are valid for this keyword" - wireUsrdfnGuardedTwoField
    // (extended this task to also accept the ownerKey/conditioning trio,
    // see its own doc comment above) replaces the plain wireTwoField this
    // used to go through, preserving the existing Conditioning toggle.
    wireUsrdfnGuardedTwoField(p + '-csrloc-row', p + '-csrloc-col', 'CSRLOC', p + '-csrloc', expandedSet, rerender);
    // Task I-28: SLNO/CLRL are ALSO individually documented as
    // incompatible with KEEP - see wirePulldownGuardedFlag's own I-28
    // comment above. Task I-36: also PASSRCD - see its own I-36 comment.
    wirePulldownGuardedFlag(p + '-slno', 'SLNO', true, true, true);
    wirePulldownGuardedFlag(p + '-clrl', 'CLRL', true, true, true);

    // Input
    // Task I-44: LOGINP is individually record-level with no per-keyword
    // exclusion list of its own (only the USRDFN-whitelist gap applies) -
    // this row was already noConditioning=true per I-7/I-9 (LOGINP's own
    // DDS Reference text: "Option indicators are not valid for this
    // keyword"), so no hasParams/withConditioning flags are needed -
    // wireUsrdfnGuardedFlag's own defaults already match simple()'s prior
    // noConditioning behavior exactly.
    wireUsrdfnGuardedFlag(p + '-loginp', 'LOGINP');
    var unlockOn = document.getElementById(p + '-unlock-on');
    var unlockErase = document.getElementById(p + '-unlock-erase');
    var unlockMdtoff = document.getElementById(p + '-unlock-mdtoff');
    function commitUnlock(conditions) { onChange(DspfWriter.setUnlockKeyword(getKeywords(), unlockOn.checked, unlockErase.checked, unlockMdtoff.checked, conditions)); }
    if (unlockOn) unlockOn.addEventListener('change', function () { commitUnlock(); });
    if (unlockErase) unlockErase.addEventListener('change', function () { commitUnlock(); });
    if (unlockMdtoff) unlockMdtoff.addEventListener('change', function () { commitUnlock(); });
    // Task I-7: UNLOCK - "Option indicators are not valid for this
    // keyword" - no Conditioning toggle wired (was previously wired here,
    // a bug).
    // Task I-44: GETRETAIN - same shape as LOGINP just above (individually
    // record-level, no other exclusion list, was already noConditioning=
    // true per I-7 - "Option indicators are not valid for this keyword").
    wireUsrdfnGuardedFlag(p + '-getretain', 'GETRETAIN');
    // Task I-44: RETLCKSTS - individually record-level, "Option
    // indicators are valid for this keyword" per its own DDS Reference
    // text, so withConditioning=true preserves the existing toggle.
    // Task I-50: hasParams flipped to false (was true) - that same DDS
    // Reference text also says "This keyword has no parameters", and the
    // params box was a pre-existing bug (logged separately, not
    // introduced or fixed by I-44). Any parameter text an old DSPF might
    // already carry on this keyword is dropped the next time this row is
    // edited, matching the fact it was never valid DDS syntax to begin
    // with.
    wireUsrdfnGuardedFlag(p + '-retlcksts', 'RETLCKSTS', false, false, false, false, true);
    // Task I-7: CHECK's AB/RL sub-flags - "Option indicators are valid
    // only for CHECK(ER) and CHECK(ME)" per IBM's own DDS Reference,
    // neither of which iSDA implements (same finding I-3 already made for
    // file-level CHECK) - no Conditioning toggle for these two rows.
    wireFlagRow(p + '-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, undefined, undefined, undefined);
    wireFlagRow(p + '-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, undefined, undefined, undefined);
    // Task I-13: RTNDTA is on PULLDOWN's own forbidden-keyword list.
    wirePulldownGuardedFlag(p + '-rtndta', 'RTNDTA', false);

    // Overlay
    // Task I-13: OVERLAY/PUTRETAIN/PUTOVR/OVRDTA/OVRATR/MDTOFF/ERASEINP/
    // ERASE are each on PULLDOWN's own forbidden-keyword list - PROTECT
    // and INZINP are NOT on that list (checked individually against their
    // own DDS Reference sections), left on plain simple().
    wirePulldownGuardedFlag(p + '-overlay', 'OVERLAY', false);
    wirePulldownGuardedFlag(p + '-putretain', 'PUTRETAIN', false);
    // Task I-44: PROTECT/INZINP are each individually record-level with
    // "Option indicators are valid for this keyword" per their own DDS
    // Reference sections and no other specific-keyword exclusion list
    // (confirmed not on PULLDOWN's own forbidden list either, matching
    // this same panel's pre-existing I-13 comment above) - same
    // USRDFN-whitelist-only gap, existing Conditioning toggle preserved.
    wireUsrdfnGuardedFlag(p + '-protect', 'PROTECT', false, false, false, false, true);
    wirePulldownGuardedFlag(p + '-putovr', 'PUTOVR', false);
    wirePulldownGuardedFlag(p + '-ovrdta', 'OVRDTA', false);
    wirePulldownGuardedFlag(p + '-ovratr', 'OVRATR', false);
    wireUsrdfnGuardedFlag(p + '-inzinp', 'INZINP', false, false, false, false, true);
    wirePulldownGuardedFlag(p + '-mdtoff', 'MDTOFF', true);
    wirePulldownGuardedFlag(p + '-eraseinp', 'ERASEINP', true);
    wirePulldownGuardedFlag(p + '-erase', 'ERASE', false);

    // Print
    // Task S36-4: PRINT's response indicator (including the literal
    // '*PGM' text) is a verified S36E rule, hard-blocked here the same
    // hand-rolled (not wireFlagRow) way as the file-level PRINT row (see
    // wireFileKeywordsPanels' own guardedSimple comment for why).
    // Task I-2 (keywordFixes.md): "Print file"/"Library" write PRINT's
    // own *PGM/[library/]printer-file-name parameter form (mutually
    // exclusive with the response indicator field), not a separate
    // (non-existent) PRTFILE keyword - see the file-level wireFilePrint
    // this mirrors for the full rationale.
    (function wireRecordPrint() {
      var onEl = document.getElementById(p + '-print-on');
      var paramsEl = document.getElementById(p + '-print-params');
      var fileEl = document.getElementById(p + '-print-file');
      var libEl = document.getElementById(p + '-print-library');
      function assembleParams() {
        var respInd = (paramsEl ? paramsEl.value : '').trim();
        if (respInd) return respInd;
        var printFile = (fileEl ? fileEl.value : '').trim();
        if (/^\*PGM$/i.test(printFile)) return '*PGM';
        if (printFile) {
          var lib = (libEl ? libEl.value : '').trim();
          return lib ? lib + '/' + printFile : printFile;
        }
        return '';
      }
      function commit() {
        var present = onEl.checked;
        var params = assembleParams();
        var violation = present ? DspfWriter.checkS36EResponseIndicatorViolation(getFileKeywords ? getFileKeywords() : [], 'PRINT', params) : null;
        if (violation) {
          window.alert(violation.message);
          var prev = DspfWriter.getFileFlagKeyword(getKeywords(), 'PRINT');
          var prevForm = DspfWriter.getFilePrintFileForm(getKeywords());
          onEl.checked = prev.present;
          if (paramsEl) paramsEl.value = /^\d/.test(prev.parameters || '') ? prev.parameters : '';
          if (fileEl) fileEl.value = prevForm.isPgm ? '*PGM' : prevForm.printFile;
          if (libEl) libEl.value = prevForm.library;
          return;
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'PRINT', present, params));
      }
      if (onEl) onEl.addEventListener('change', commit);
      if (paramsEl) paramsEl.addEventListener('change', commit);
      if (fileEl) fileEl.addEventListener('change', commit);
      if (libEl) libEl.addEventListener('change', commit);
      wireFlagRowConditioning(p + '-print', DspfWriter.getFileFlagKeyword(getKeywords(), 'PRINT').conditions, function (newConditions) {
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'PRINT', onEl.checked, assembleParams(), undefined, newConditions));
      }, expandedSet, rerender);
    })();
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

  // Task I-20: `isConditionable(inst)` is an OPTIONAL per-instance predicate
  // (defaults to "always true" when omitted, so every other caller of this
  // shared component - Color & attributes, Validity check, MOUBTN, etc,
  // none of which mix conditionable and non-conditionable kinds in one
  // list - is unaffected). It lets a single repeatable-instance list mix
  // kinds that DO allow option-indicator conditioning with kinds that
  // don't (e.g. the record Indicator-keywords panel's CLEAR, which does,
  // alongside VLDCMDKEY/SETOF/CHANGE/INDTXT, none of which do per their
  // own "Option indicators are not valid for this keyword" DDS Reference
  // lines) without a second parallel component. An instance this predicate
  // rejects gets no Conditioning toggle at all - same "pass undefined
  // instead of the real conditions" idiom flagRowHtml callers already use
  // for a flatly-non-conditionable keyword (see e.g. I-7/I-9's own fixes),
  // just expressed per-row instead of per-keyword. Existing conditions
  // already present on such an instance (e.g. read from a pre-existing
  // file that carries invalid conditioning) are left completely alone -
  // this only prevents ADDING new conditioning through this UI, matching
  // the same "omitted conditions preserves whatever already existed"
  // convention I-14's own MNUBAR fix already established.
  function repeatableConditionedInstancesHtml(instances, idPrefix, renderPayload, expandedSet, addLabel, renderStaging, isConditionable) {
    var list = instances || [];
    var html = '<div id="' + idPrefix + '-instances">';
    if (list.length === 0) {
      html += '<div class="empty-state" style="margin-bottom:6px;">None defined.</div>';
    }
    list.forEach(function (inst, idx) {
      var conditionable = !isConditionable || isConditionable(inst);
      var conditions = inst.conditions || [];
      var condSummary = conditions.length > 0 ? ' (' + conditions.length + ')' : '';
      var isExpanded = conditionable && !!(expandedSet && expandedSet.has(idPrefix + ':' + idx));
      var instIdPrefix = idPrefix + '-inst' + idx;
      html += '<div class="repeat-inst" data-prefix="' + idPrefix + '" data-idx="' + idx + '">';
      html += '<div class="repeat-inst-main">';
      html += renderPayload(inst, instIdPrefix);
      if (conditionable) {
        html += '<span class="repeat-inst-cond-toggle" data-prefix="' + idPrefix + '" data-idx="' + idx + '">Conditioning' + condSummary + (isExpanded ? ' \u25b4' : ' \u25be') + '</span>';
      } else {
        html += '<span class="hint-small">Option indicators are not valid for this keyword.</span>';
      }
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

  function wireRepeatableConditionedInstances(idPrefix, instances, onChange, wirePayload, expandedSet, rerender, readNewInstance, isConditionable) {
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

    // Task I-20: a non-conditionable instance (see isConditionable above)
    // never rendered a `.repeat-inst-cond-toggle` element in the first
    // place, so this querySelectorAll naturally skips it - no extra guard
    // needed here beyond what repeatableConditionedInstancesHtml already
    // decided at render time.
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
   *  (see isSflRecord above for when that tab appears). CHGINPDFT and (as
   *  of Task I-25) KEEP - both shown on real SDA's own "Select Subfile
   *  Keywords \u2192 General" screen - are deliberately NOT repeated here;
   *  each is already on Task R1's base Record Keywords \u2192 General tab,
   *  shown for every record type including SFL, so adding either again
   *  here would just be two controls fighting over the same keyword. */
  function sflKeywordsPanelsHtml(keywords, idPrefix, expandedSet) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    var g = '';
    var fSflnxtchg = DspfWriter.getFileFlagKeyword(kw, 'SFLNXTCHG');
    g += flagRowHtml(p + '-sflnxtchg', 'Return this record on read next changed (SFLNXTCHG)', fSflnxtchg.present, undefined, undefined, fSflnxtchg.conditions, expandedSet);
    var fLogout = DspfWriter.getFileFlagKeyword(kw, 'LOGOUT');
    g += flagRowHtml(p + '-logout', 'Write this record to the job log on output (LOGOUT)', fLogout.present, undefined, undefined, fLogout.conditions, expandedSet);
    // Task I-9: LOGINP - "Option indicators are not valid for this keyword."
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    g += flagRowHtml(p + '-loginp', 'Write this record to the job log on input (LOGINP)', fLoginp.present, undefined, undefined, undefined, undefined);
    // Task I-25: KEEP (shown on real SDA's own "Select Subfile Keywords ->
    // General" screen) is deliberately NOT repeated here anymore - it's
    // already on Task R1's base Record Keywords -> General tab, shown for
    // every record type including SFL, so a second live copy here was just
    // two controls fighting over the same keyword (same rationale
    // sflKeywordsPanelsHtml's own top comment already applied to
    // CHGINPDFT below).
    // Task I-9: CHECK - same rule as I-3's file-level finding ("Option
    // indicators are valid only for CHECK(ER) and CHECK(ME)") - AB/RL
    // aren't either of those, so neither offers conditioning here either.
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml(p + '-check-ab', 'Allow blanks (CHECK AB)', fCheckAb.present, undefined, undefined, undefined, undefined);
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml(p + '-check-rl', 'Move cursor right to left (CHECK RL)', fCheckRl.present, undefined, undefined, undefined, undefined);
    g += '<div class="hint-small">Keep records on display when closing the file (KEEP) and change input defaults (CHGINPDFT) are on the base Record Keywords \u2192 General tab above - shared across every record type.</div>';
    panels.general = g;

    panels.indicator = indicatorTextRowsHtml(kw, p + '-ind', ['INDTXT', 'SETOF', 'CHANGE'], 6);

    return panels;
  }

  /** Wires every row across both sflKeywordsPanelsHtml() panels. */
  function wireSflKeywordsPanels(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    var p = idPrefix;
    function simple(id, name, hasParams, noConditioning) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, hasParams ? params : '', undefined, conditions);
      }, noConditioning ? undefined : DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, noConditioning ? undefined : expandedSet, noConditioning ? undefined : rerender);
    }
    simple(p + '-sflnxtchg', 'SFLNXTCHG');
    simple(p + '-logout', 'LOGOUT');
    // Task I-9: LOGINP - "Option indicators are not valid for this keyword."
    simple(p + '-loginp', 'LOGINP', false, true);
    // Task I-25: KEEP no longer has a live row on this panel - see
    // sflKeywordsPanelsHtml's own comment.
    // Task I-9: CHECK(AB)/CHECK(RL) - not eligible (see sflKeywordsPanelsHtml's
    // own comment - same rule I-3 already established for file-level CHECK).
    wireFlagRow(p + '-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, '', 'AB', conditions); }, undefined, undefined, undefined);
    wireFlagRow(p + '-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, '', 'RL', conditions); }, undefined, undefined, undefined);
    wireIndicatorTextRows(p + '-ind', ['INDTXT', 'SETOF', 'CHANGE'], 6, getKeywords, onChange);
  }

  /** Wires every row across all 3 sflMsgPanelsHtml() panels - same
   *  "getKeywords is a function so a commit from one row sees any change
   *  a previous commit in the same render already made" contract as
   *  wireFileKeywordsPanels above. */
  function wireSflMsgPanels(getKeywords, onChange, expandedSet, rerender, getFileKeywords) {
    function simple(id, name, placeholderIsParams) {
      wireFlagRow(id, getKeywords, onChange, function (keywords, present, params, conditions) {
        return DspfWriter.setFileFlagKeyword(keywords, name, present, placeholderIsParams ? params : '', undefined, conditions);
      }, DspfWriter.getFileFlagKeyword(getKeywords(), name).conditions, expandedSet, rerender);
    }

    // SFLMSGRCD: an unconditioned primary value, plus one input per
    // declared display size (ids 'sm-sflmsgrcd-ds0'/'-ds1' - only rendered
    // by sflMsgPanelsHtml when the file has 2+ sizes). All commit together
    // through setSflMsgRcdLines so editing any ONE input never silently
    // drops another's already-saved value - this used to only track the
    // *second* size's own conditioned value, silently destroying the
    // first size's conditioned entry (reported directly against a
    // screenshot of a real `*DS3 SFLMSGRCD(24)` / `*DS4 SFLMSGRCD(26)`
    // file). See getSflMsgRcdLines/setSflMsgRcdLines's own doc comment in
    // dspfWriter.js.
    var rcd = document.getElementById('sm-sflmsgrcd');
    if (rcd) {
      var commitRcd = function () {
        var sizeList = DspfWriter.getDisplaySizesList((getFileKeywords ? getFileKeywords() : []) || []);
        var bySizeName = {};
        if (sizeList.length > 1) {
          sizeList.forEach(function (size, idx) {
            var sizeInput = document.getElementById('sm-sflmsgrcd-ds' + idx);
            if (sizeInput) bySizeName[size.name] = sizeInput.value || '';
          });
        }
        onChange(DspfWriter.setSflMsgRcdLines(getKeywords(), rcd.value || '', bySizeName));
      };
      rcd.addEventListener('change', commitRcd);
      var sizeListForWiring = DspfWriter.getDisplaySizesList((getFileKeywords ? getFileKeywords() : []) || []);
      if (sizeListForWiring.length > 1) {
        sizeListForWiring.forEach(function (size, idx) {
          var sizeInput = document.getElementById('sm-sflmsgrcd-ds' + idx);
          if (sizeInput) sizeInput.addEventListener('change', commitRcd);
        });
      }
    }

    // Task I-11: SFLNXTCHG is hard-blocked from being turned ON here -
    // this panel only ever renders for a record where SFLMSGRCD is
    // already present (isSflMsgRecord's own definition), and the DDS
    // Reference states outright "You cannot specify SFLNXTCHG with the
    // SFLMSGRCD keyword." Same alert+revert idiom as L81's own
    // DFT_GROUP_KEYS guard - turning it OFF (if it somehow got set some
    // other way, e.g. hand-edited DDS) is never blocked, only the
    // on-transition.
    (function () {
      var onEl = document.getElementById('sm-sflnxtchg-on');
      var commit = function () {
        var present = onEl.checked;
        if (present) {
          var reason = DspfWriter.sflNxtchgSflMsgRcdConflictReason('SFLNXTCHG', getKeywords());
          if (reason) {
            window.alert(reason);
            onEl.checked = DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLNXTCHG').present;
            return;
          }
        }
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'SFLNXTCHG', present, ''));
      };
      if (onEl) onEl.addEventListener('change', commit);
      wireFlagRowConditioning('sm-sflnxtchg', DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLNXTCHG').conditions, function (newConditions) {
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'SFLNXTCHG', onEl.checked, '', undefined, newConditions));
      }, expandedSet, rerender);
    })();
    simple('sm-logout', 'LOGOUT');
    simple('sm-loginp', 'LOGINP');
    // Task I-25: KEEP no longer has a live row on this panel - see
    // sflMsgPanelsHtml's own comment.
    wireFlagRow('sm-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'AB').conditions, expandedSet, rerender);
    wireFlagRow('sm-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'CHECK', 'RL').conditions, expandedSet, rerender);
    wireChgInpDftFlag(getKeywords, onChange, 'sm-chginpdft', expandedSet, rerender);

    wireIndicatorTextRows('sm-ind', ['INDTXT', 'SETOF', 'CHANGE'], 6, getKeywords, onChange);
  }

  /** Wires the Message Record panel's Task L73 additions - renaming the
   *  SFLMSGKEY/SFLPGMQ hidden fields in place, and the queue field's
   *  "Generate a 276 byte field" checkbox. Separate from wireSflMsgPanels
   *  above because these two rows commit FIELD-level updates (a rename,
   *  or a change to the queue field's own SFLPGMQ parameter), not the
   *  SFLMSG record's own keywords array - `commitFieldUpdate(field,
   *  updates)` is the caller's `DspfWriter.applyFieldUpdate` commit path
   *  (see buildWebviewTemplate.js's own commitEdit), the same one the
   *  Basic tab's Name input already uses for every other field. */
  function wireSflMsgFieldRefs(rec, commitFieldUpdate) {
    var keyField = (rec.fields || []).find(function (f) { return (f.keywords || []).some(function (k) { return k.name === 'SFLMSGKEY'; }); });

    function wireRename(inputId, errorId, field) {
      var input = document.getElementById(inputId);
      if (!input || !field) return;
      input.addEventListener('change', function () {
        var errorEl = document.getElementById(errorId);
        if (errorEl) errorEl.textContent = '';
        var newName = (input.value || '').trim().toUpperCase();
        if (!newName) {
          if (errorEl) errorEl.textContent = 'Enter a name.';
          input.value = field.name;
          return;
        }
        if (newName === field.name) return;
        if (!isValidDdsName(newName)) {
          if (errorEl) errorEl.textContent = 'Not a valid DDS name (1-10 chars, starts with a letter or $#@).';
          input.value = field.name;
          return;
        }
        if ((rec.fields || []).some(function (f) { return f !== field && f.name === newName; })) {
          if (errorEl) errorEl.textContent = 'A field named "' + newName + '" already exists in this record.';
          input.value = field.name;
          return;
        }
        commitFieldUpdate(field, { name: newName });
      });
    }

    wireRename('sm-msgkey-name', 'sm-msgkey-error', keyField);
    // Task L74: the queue field's rename + 276-byte checkbox are now the
    // shared wireSflPgmqField (see its own comment above sflPgmqFieldHtml).
    wireSflPgmqField(rec, 'sm-pgmq', commitFieldUpdate);
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
    // Bug fix (Task A1 - SDA screenshot keyword-inventory audit, WNDSFCTL's
    // own "Select General Keywords" screen: docs/sda-reference/screens/
    // record-level/window-subfile-control-wndsfctl/general/image87.png):
    // RMVWDW (Remove Window - record-level, no parameters, removes every
    // window already on the display before this record is written; only
    // meaningful alongside a real WINDOW keyword, per IBM's own DDS
    // reference) and USRRSTDSP (User Restore Display - record-level, no
    // parameters, tells the system the PROGRAM will handle restoring the
    // display around a window instead of the system suspending/restoring
    // it automatically) were shown right alongside WINDOW/WDWBORDER on that
    // screen but were entirely missing from this codebase - not parsed,
    // not exposed in any picker, not even reachable as a documented gap.
    // Both are plain present/absent flags (option indicators valid, no
    // parameters), the exact shape DspfWriter.getFileFlagKeyword/
    // setFileFlagKeyword already handle generically, so no new dspfWriter.js
    // functions were needed - same pattern as every other simple flag
    // keyword in this file. Placed in the Window Parameters panel (rather
    // than a new accordion) since real SDA shows them on the SAME screen as
    // WINDOW itself, immediately after Border Parameters' own "Select
    // parameters" toggle.
    wp += '<div class="section-label" style="margin-top:10px;">Window control</div>';
    var fRmvwdw = DspfWriter.getFileFlagKeyword(keywords, 'RMVWDW');
    wp += flagRowHtml(idPrefix + '-rmvwdw', 'Remove existing windows before this record is displayed (RMVWDW)', fRmvwdw.present, undefined, undefined, fRmvwdw.conditions, expandedSet);
    var fUsrrstdsp = DspfWriter.getFileFlagKeyword(keywords, 'USRRSTDSP');
    wp += flagRowHtml(idPrefix + '-usrrstdsp', 'Program handles display restore around this window (USRRSTDSP)', fUsrrstdsp.present, undefined, undefined, fUsrrstdsp.conditions, expandedSet);
    panels.windowParameters = wp;

    // --- Border Parameters (shared with F1's file-level Window Border) ---
    panels.borderParameters = windowBorderPanelHtml(keywords, idPrefix + '-wdw', expandedSet);

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

    // Window control (Task A1 bug fix - RMVWDW/USRRSTDSP)
    wireFlagRow(
      idPrefix + '-rmvwdw',
      getKeywords,
      onChange,
      function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, 'RMVWDW', present, params, undefined, conditions); },
      DspfWriter.getFileFlagKeyword(getKeywords(), 'RMVWDW').conditions,
      expandedSet,
      rerender
    );
    wireFlagRow(
      idPrefix + '-usrrstdsp',
      getKeywords,
      onChange,
      function (kws, present, params, conditions) { return DspfWriter.setFileFlagKeyword(kws, 'USRRSTDSP', present, params, undefined, conditions); },
      DspfWriter.getFileFlagKeyword(getKeywords(), 'USRRSTDSP').conditions,
      expandedSet,
      rerender
    );

    // Border Parameters
    wireWindowBorderPanel(idPrefix + '-wdw', getKeywords, onChange, expandedSet, rerender);
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
  function pulldownPanelsHtml(keywords, idPrefix, expandedSet) {
    var panels = {};

    // --- General (PULLDOWN's own *SLTIND/*RSTCSR sub-flags) ---
    var pd = DspfWriter.getPulldownKeyword(keywords);
    var g = '<div class="section-label">Pull-down (PULLDOWN)</div>';
    g += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;"><input type="checkbox" id="' + idPrefix + '-on" ' + (pd.present ? 'checked' : '') + ' /> Pull-down record</label>';
    g += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;padding-left:16px;"><input type="checkbox" id="' + idPrefix + '-sltind" ' + (pd.sltind ? 'checked' : '') + ' /> Selection indicators (*SLTIND)</label>';
    g += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;padding-left:16px;"><input type="checkbox" id="' + idPrefix + '-rstcsr" ' + (pd.rstcsr ? 'checked' : '') + ' /> Restrict cursor to pull-down (*RSTCSR)</label>';
    panels.general = g;

    // --- Border Parameters (shared with F1/R7's Window Border) ---
    panels.borderParameters = windowBorderPanelHtml(keywords, idPrefix + '-wdw', expandedSet);

    return panels;
  }

  /** Wires both pulldownPanelsHtml() panels. Same `getKeywords`/`onChange`
   *  contract every other dedicated picker here uses. */
  function wirePulldownPanels(idPrefix, getKeywords, onChange, expandedSet, rerender) {
    // Task I-13: turning PULLDOWN itself on is blocked if the record
    // already carries any of the 27 keywords IBM's own DDS Reference
    // documents as incompatible with it (see
    // DspfWriter.pulldownConflictReason's own doc comment) - same
    // alert+revert idiom as the individual keyword-side guards in
    // wireRecordKeywordsPanels. Turning PULLDOWN off is never blocked.
    function commitGeneral() {
      var on = document.getElementById(idPrefix + '-on');
      var sltind = document.getElementById(idPrefix + '-sltind');
      var rstcsr = document.getElementById(idPrefix + '-rstcsr');
      if (on.checked) {
        var reason = DspfWriter.pulldownConflictReason('PULLDOWN', getKeywords());
        if (reason) {
          window.alert(reason);
          on.checked = DspfWriter.getPulldownKeyword(getKeywords()).present;
          return;
        }
      }
      onChange(DspfWriter.setPulldownKeyword(getKeywords(), on.checked, sltind.checked, rstcsr.checked));
    }
    var on = document.getElementById(idPrefix + '-on');
    var sltind = document.getElementById(idPrefix + '-sltind');
    var rstcsr = document.getElementById(idPrefix + '-rstcsr');
    if (on) on.addEventListener('change', commitGeneral);
    if (sltind) sltind.addEventListener('change', commitGeneral);
    if (rstcsr) rstcsr.addEventListener('change', commitGeneral);

    // Border Parameters
    wireWindowBorderPanel(idPrefix + '-wdw', getKeywords, onChange, expandedSet, rerender);
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
   * tab appears). Takes the whole `rec` (not just rec.keywords), since
   * Task L74's SFLPGMQ row needs `rec.fields` the same way sflMsgPanelsHtml
   * already does (see sflPgmqFieldHtml's own comment for why). `idPrefix`
   * namespaces every element id. `fileKeywords` (Task I-22) is the whole
   * file's own keywords array, needed only to read the file's declared
   * DSPSIZ sizes for the Display Layout panel's own per-size SFLSIZ/
   * SFLPAG/SFLLIN rows - same optional-parameter convention
   * sflMsgPanelsHtml already uses for its own SFLMSGRCD per-size rows.
   */
  /** Task I-26 - SFLSNGCHC/SFLMLTCHC section within the SFLCTL General
   *  tab: a type selector (none/single/multiple) plus each type's own
   *  sub-controls, shown/hidden via plain CSS rather than separate
   *  accordions since only one type can ever be active at a time (see
   *  DspfWriter.sflChoiceListConflictReason). `rec` (not just its
   *  keywords) is needed only to compute isPulldownRecord's own effective-
   *  default hint text. No Conditioning toggle anywhere here - neither
   *  keyword documents option indicators as valid. */
  function sflChoiceListPanelHtml(rec, p) {
    var kw = rec.keywords || [];
    var sngchc = DspfWriter.getSflSngChcKeyword(kw);
    var mltchc = DspfWriter.getSflMltChcKeyword(kw);
    var inPulldown = isPulldownRecord(rec);
    var current = sngchc.present ? 'SFLSNGCHC' : (mltchc.present ? 'SFLMLTCHC' : '');
    var rstcsrDefaultHint = inPulldown ? '*RSTCSR (this record is in a pull-down)' : '*NORSTCSR (this record is not in a pull-down)';
    var autoSltDefaultHint = inPulldown ? '*AUTOSLT (this record is in a pull-down)' : '*NOAUTOSLT (this record is not in a pull-down)';

    var html = '<select id="' + p + '-selchc-type">' +
      [
        ['', '(none)'],
        ['SFLSNGCHC', 'Single-choice list (SFLSNGCHC)'],
        ['SFLMLTCHC', 'Multiple-choice list (SFLMLTCHC)'],
      ].map(function (opt) {
        return '<option value="' + opt[0] + '"' + (current === opt[0] ? ' selected' : '') + '>' + opt[1] + '</option>';
      }).join('') +
      '</select>';
    html += '<div class="hint-small" style="margin:4px 0 8px;">Mutually exclusive with SFLDROP/SFLFOLD and with each other - selecting one here blocks turning the other on above.</div>';

    // Task I-39 - SFLRTNSEL was confirmed entirely missing from iSDA (no
    // getter/setter, no row, no mention anywhere) by a full-text audit of
    // DDS_Keyword_V7r6.txt against actual code. Record-level flag on the
    // SFLCTL record, no parameters, not conditionable ("Option indicators
    // are not valid for this keyword"). IBM's own DDS Reference: "If this
    // keyword is specified then SFLMLTCHC or SFLSNGCHC must be specified" -
    // surfaced as a hint rather than a hard block for this first pass
    // (same "close the entirely-missing gap first" scope noted elsewhere
    // in this task), so it's placed right here alongside the selector that
    // drives both.
    var fSflrtnsel = DspfWriter.getFileFlagKeyword(kw, 'SFLRTNSEL');
    html += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;"><input type="checkbox" id="' + p + '-sflrtnsel" ' + (fSflrtnsel.present ? 'checked' : '') + ' /> Return all selected choices, including unchanged defaults (SFLRTNSEL)</label>';
    if (!current) html += '<div class="hint-small" style="margin-bottom:8px;">Requires SFLSNGCHC or SFLMLTCHC (selected above) to have any effect.</div>';

    function rstcsrSelect(idBase, value) {
      return '<select id="' + idBase + '-rstcsr" style="margin-top:4px;">' +
        [
          ['', 'Restrict cursor: (default - ' + rstcsrDefaultHint + ')'],
          ['RSTCSR', '*RSTCSR - arrow keys stay inside the list'],
          ['NORSTCSR', '*NORSTCSR - arrow keys can leave the list'],
        ].map(function (opt) {
          return '<option value="' + opt[0] + '"' + (value === opt[0] ? ' selected' : '') + '>' + opt[1] + '</option>';
        }).join('') +
        '</select>';
    }
    function sltindCheckbox(idBase, checked) {
      return '<label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;"><input type="checkbox" id="' + idBase + '-sltind" ' + (checked ? 'checked' : '') + ' /> Selection indicators on color graphical displays (*SLTIND)</label>';
    }

    html += '<div id="' + p + '-selchc-sngchc" style="' + (current === 'SFLSNGCHC' ? '' : 'display:none;') + 'padding-left:16px;">';
    html += rstcsrSelect(p + '-selchc-sngchc', sngchc.rstcsr);
    html += sltindCheckbox(p + '-selchc-sngchc', sngchc.sltind);
    html += '<select id="' + p + '-selchc-sngchc-autoslt" style="margin-top:6px;">' +
      [
        ['', 'Auto-select: (default - ' + autoSltDefaultHint + ')'],
        ['AUTOSLT', '*AUTOSLT - Enter key selects the highlighted choice'],
        ['NOAUTOSLT', '*NOAUTOSLT - user must explicitly select'],
        ['AUTOSLTENH', '*AUTOSLTENH - auto-select only on an enhanced controller'],
      ].map(function (opt) {
        return '<option value="' + opt[0] + '"' + (sngchc.autoslt === opt[0] ? ' selected' : '') + '>' + opt[1] + '</option>';
      }).join('') +
      '</select>';
    html += '</div>';

    html += '<div id="' + p + '-selchc-mltchc" style="' + (current === 'SFLMLTCHC' ? '' : 'display:none;') + 'padding-left:16px;">';
    html += '<input type="text" id="' + p + '-selchc-mltchc-numsel" placeholder="hidden field name (4,0 signed numeric) - optional" value="' + (mltchc.numberSelectedField || '') + '" style="width:100%;box-sizing:border-box;margin-bottom:4px;" />';
    html += '<div class="hint-small">Number selected (&number-selected) - counts how many items the user picked. Must name a hidden field, length 4, type Y, 0 decimals.</div>';
    html += rstcsrSelect(p + '-selchc-mltchc', mltchc.rstcsr);
    html += sltindCheckbox(p + '-selchc-mltchc', mltchc.sltind);
    html += '</div>';

    return html;
  }

  /** Wires sflChoiceListPanelHtml. Turning the type selector to SFLSNGCHC
   *  or SFLMLTCHC is blocked (alert + revert) by
   *  DspfWriter.sflChoiceListConflictReason, same alertAndRevert idiom
   *  I-13's own PULLDOWN guard uses; turning it back to "(none)" is never
   *  blocked. */
  function wireSflChoiceListPanel(p, getKeywords, onChange) {
    // Task I-39 - SFLRTNSEL (see sflChoiceListPanelHtml's own I-39 comment
    // above). Plain present/absent toggle, wired independently of
    // commit()/the type selector since it never itself changes SFLSNGCHC/
    // SFLMLTCHC's own state.
    var sflrtnselEl = document.getElementById(p + '-sflrtnsel');
    if (sflrtnselEl) {
      sflrtnselEl.addEventListener('change', function () {
        onChange(DspfWriter.setFileFlagKeyword(getKeywords(), 'SFLRTNSEL', sflrtnselEl.checked));
      });
    }
    function commit() {
      var typeEl = document.getElementById(p + '-selchc-type');
      if (!typeEl) return;
      var type = typeEl.value;
      var keywords = getKeywords();
      if (type) {
        // Strip the OTHER choice-list keyword (if any) before checking for
        // conflicts - this dropdown is the sole UI for both, so switching
        // from one to the other is always allowed; only an external
        // SFLDROP/SFLFOLD should ever block the switch.
        var strippedKeywords = keywords.filter(function (kw) { return kw.name !== 'SFLSNGCHC' && kw.name !== 'SFLMLTCHC'; });
        var reason = DspfWriter.sflChoiceListConflictReason(type, strippedKeywords);
        if (reason) {
          window.alert(reason);
          typeEl.value = DspfWriter.getSflSngChcKeyword(keywords).present ? 'SFLSNGCHC' : (DspfWriter.getSflMltChcKeyword(keywords).present ? 'SFLMLTCHC' : '');
          return;
        }
      }
      if (type === 'SFLSNGCHC') {
        var sRstcsr = document.getElementById(p + '-selchc-sngchc-rstcsr');
        var sSltind = document.getElementById(p + '-selchc-sngchc-sltind');
        var sAutoslt = document.getElementById(p + '-selchc-sngchc-autoslt');
        keywords = DspfWriter.setSflMltChcKeyword(keywords, false);
        keywords = DspfWriter.setSflSngChcKeyword(keywords, true, sRstcsr ? sRstcsr.value : '', sSltind ? sSltind.checked : false, sAutoslt ? sAutoslt.value : '');
      } else if (type === 'SFLMLTCHC') {
        var mNumsel = document.getElementById(p + '-selchc-mltchc-numsel');
        var mRstcsr = document.getElementById(p + '-selchc-mltchc-rstcsr');
        var mSltind = document.getElementById(p + '-selchc-mltchc-sltind');
        keywords = DspfWriter.setSflSngChcKeyword(keywords, false);
        keywords = DspfWriter.setSflMltChcKeyword(keywords, true, mNumsel ? mNumsel.value : '', mRstcsr ? mRstcsr.value : '', mSltind ? mSltind.checked : false);
      } else {
        keywords = DspfWriter.setSflSngChcKeyword(keywords, false);
        keywords = DspfWriter.setSflMltChcKeyword(keywords, false);
      }
      onChange(keywords);
    }
    var typeEl = document.getElementById(p + '-selchc-type');
    if (typeEl) {
      typeEl.addEventListener('change', function () {
        var sngchcDiv = document.getElementById(p + '-selchc-sngchc');
        var mltchcDiv = document.getElementById(p + '-selchc-mltchc');
        if (sngchcDiv) sngchcDiv.style.display = typeEl.value === 'SFLSNGCHC' ? '' : 'none';
        if (mltchcDiv) mltchcDiv.style.display = typeEl.value === 'SFLMLTCHC' ? '' : 'none';
        commit();
      });
    }
    ['-selchc-sngchc-rstcsr', '-selchc-sngchc-sltind', '-selchc-sngchc-autoslt', '-selchc-mltchc-numsel', '-selchc-mltchc-rstcsr', '-selchc-mltchc-sltind'].forEach(function (suffix) {
      var el = document.getElementById(p + suffix);
      if (el) el.addEventListener('change', commit);
    });
  }

  function sflCtlPanelsHtml(rec, idPrefix, expandedSet, fileKeywords) {
    var kw = rec.keywords || [];
    var p = idPrefix;
    var panels = {};

    // --- General (SFLCTL's own keywords + R3's Subfile Keywords, reused) ---
    var g = '<div class="section-label">Subfile control</div>';
    var fSflctl = DspfWriter.getFileFlagKeyword(kw, 'SFLCTL');
    g += flagRowHtml(p + '-sflctl', 'Related subfile record (SFLCTL)', fSflctl.present, fSflctl.parameters, 'subfile record name', undefined, undefined); // I-10: option indicators not valid
    var fSflcsrrrn = DspfWriter.getFileFlagKeyword(kw, 'SFLCSRRRN');
    g += flagRowHtml(p + '-sflcsrrrn', 'Subfile cursor relative record number field (SFLCSRRRN)', fSflcsrrrn.present, fSflcsrrrn.parameters, 'field name', fSflcsrrrn.conditions, expandedSet); // I-10: no explicit option-indicator statement found either way in the DDS Reference - left as-is rather than guessing, same as I-7's RETKEY/RETCMDKEY/KEEP precedent
    var fSflmode = DspfWriter.getFileFlagKeyword(kw, 'SFLMODE');
    g += flagRowHtml(p + '-sflmode', 'Subfile mode field (SFLMODE)', fSflmode.present, fSflmode.parameters, 'field name', undefined, undefined); // I-10: option indicators not valid
    // Task L74: SFLPGMQ is documented by IBM as a FIELD-level keyword even
    // when it's coded on the SFLCTL record ("SFLPGMQ can be specified on
    // the subfile-control record format when SFLINZ is specified...it can
    // be anywhere within the record specification") - NOT a record-level
    // keyword naming a field the way SFLCSRRRN/SFLMODE above are, despite
    // sitting right alongside them on real SDA's own screen. So this reuses
    // the exact same sflPgmqFieldHtml/wireSflPgmqField pair Task L73 built
    // for SFLMSG's identical field-level SFLPGMQ, rather than a third
    // flagRowHtml row that would write it as a bogus record-level keyword.
    g += sflPgmqFieldHtml(rec, p + '-sflpgmq');
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
    g += flagRowHtml(p + '-sflrna', 'Record not active (SFLRNA)', fSflrna.present, undefined, undefined, undefined, undefined); // I-10: option indicators not valid
    var fSflend = DspfWriter.getFileFlagKeyword(kw, 'SFLEND');
    g += flagRowHtml(p + '-sflend', 'Indicate more records (SFLEND)', fSflend.present, fSflend.parameters, '*MORE, *SCRBAR, or blank', fSflend.conditions, expandedSet);
    g += '<div class="section-label">Subfile behavior</div>';
    var fSfldrop = DspfWriter.getFileFlagKeyword(kw, 'SFLDROP');
    g += flagRowHtml(p + '-sfldrop', 'Subfile initially truncated (SFLDROP)', fSfldrop.present, fSfldrop.parameters, 'CFnn or CAnn', fSfldrop.conditions, expandedSet);
    var fSflfold = DspfWriter.getFileFlagKeyword(kw, 'SFLFOLD');
    g += flagRowHtml(p + '-sflfold', 'Subfile initially folded (SFLFOLD)', fSflfold.present, fSflfold.parameters, 'CFnn or CAnn', fSflfold.conditions, expandedSet);
    var fSflenter = DspfWriter.getFileFlagKeyword(kw, 'SFLENTER');
    g += flagRowHtml(p + '-sflenter', 'Use instead of Enter key (SFLENTER)', fSflenter.present, fSflenter.parameters, 'CFnn or CAnn', undefined, undefined); // I-10: option indicators not valid
    g += '<div class="section-label">Selection List (SFLSNGCHC / SFLMLTCHC)</div>' + sflChoiceListPanelHtml(rec, p);
    g += '<div class="section-label">Subfile Keywords (shared with plain SFL records)</div>';
    var fSflnxtchg = DspfWriter.getFileFlagKeyword(kw, 'SFLNXTCHG');
    g += flagRowHtml(p + '-sflnxtchg', 'Return this record on read next changed (SFLNXTCHG)', fSflnxtchg.present, undefined, undefined, fSflnxtchg.conditions, expandedSet);
    var fLogout = DspfWriter.getFileFlagKeyword(kw, 'LOGOUT');
    g += flagRowHtml(p + '-logout', 'Write this record to the job log on output (LOGOUT)', fLogout.present, undefined, undefined, fLogout.conditions, expandedSet);
    var fLoginp = DspfWriter.getFileFlagKeyword(kw, 'LOGINP');
    g += flagRowHtml(p + '-loginp', 'Write this record to the job log on input (LOGINP)', fLoginp.present, undefined, undefined, undefined, undefined); // I-10: propagates I-9's own finding (not eligible) - this SFLCTL copy never got it
    // Task I-25: KEEP is no longer repeated on this panel - see
    // sflCtlPanelsHtml's own comment below (same rationale as the SFL and
    // SFLMSG tabs' own I-25 removals).
    var fCheckAb = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'AB');
    g += flagRowHtml(p + '-check-ab', 'Allow blanks (CHECK AB)', fCheckAb.present, undefined, undefined, undefined, undefined); // I-10: propagates I-9's own finding (not eligible) - this SFLCTL copy never got it
    var fCheckRl = DspfWriter.getFileFlagKeyword(kw, 'CHECK', 'RL');
    g += flagRowHtml(p + '-check-rl', 'Move cursor right to left (CHECK RL)', fCheckRl.present, undefined, undefined, undefined, undefined); // I-10: propagates I-9's own finding (not eligible) - this SFLCTL copy never got it
    g += '<div class="hint-small">Keep records on display when closing the file (KEEP) and change input defaults (CHGINPDFT) are on the base Record Keywords \u2192 General tab above - shared across every record type.</div>';
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

    // --- Display Layout (Task I-22: SFLSIZ/SFLPAG/SFLLIN each also
    // accept a display-size (*DSx) condition name for a second value that
    // applies only to the file's secondary DSPSIZ size - required if the
    // value actually differs between the two. See
    // getDisplaySizeConditionedValue's own doc comment in dspfWriter.js
    // for the full citation. Same "extra row(s) only when 2+ sizes are
    // declared" shape sflMsgPanelsHtml's own SFLMSGRCD rows already use.
    // Real screen (docs/sda-reference/screens/record-level/
    // subfile-control-sflctl/display-layout/) confirms SFLSIZ alone gets
    // its own separate "Program-to-system field" alternate-entry row -
    // SFLPAG/SFLLIN don't get one, matching their own DDS Reference
    // sections (neither documents a field-name form at all) - so only
    // SFLSIZ's placeholder mentions a field name. That same screen also
    // shows a "Roll" column this task doesn't have a confirmed citation
    // for - left alone rather than guessed at, flagged in keywordFixes.md
    // for a future task instead of implemented here. ---
    var layout = DspfWriter.getSflDisplayLayout(kw);
    var dlSizeList = DspfWriter.getDisplaySizesList(fileKeywords || []);
    function displayLayoutRowHtml(idBase, label, placeholder, entry, numericOnlySizeInputs) {
      var html = '<div class="field-row"><label>' + label + '</label><input type="text" id="' + idBase + '" placeholder="' + placeholder + '" value="' + escapeHtml(entry.primary) + '" /></div>';
      if (dlSizeList.length > 1) {
        dlSizeList.forEach(function (size, idx) {
          var v = entry.bySizeName[size.name] || '';
          var sizePlaceholder = (numericOnlySizeInputs ? 'number only' : placeholder) + ' for ' + escapeHtml(size.name);
          html += '<div class="field-row"><label style="padding-left:16px;">for ' + escapeHtml(size.name) + '</label><input type="text" id="' + idBase + '-ds' + idx + '" placeholder="' + sizePlaceholder + '" value="' + escapeHtml(v) + '" /></div>';
        });
      }
      return html;
    }
    var dl = displayLayoutRowHtml(p + '-sflsiz', 'Records in subfile (SFLSIZ)', 'number, or a field name', layout.sflsiz, true);
    dl += displayLayoutRowHtml(p + '-sflpag', 'Records per display (SFLPAG)', 'number', layout.sflpag, false);
    dl += displayLayoutRowHtml(p + '-sfllin', 'Spaces between records (SFLLIN)', '0 or 1', layout.sfllin, false);
    if (dlSizeList.length > 1) {
      dl += '<div class="hint-small">Display size condition names are required if a value changes between the file\u2019s two display sizes - leave a size\u2019s own input blank to fall back to the unconditioned value above for that size. A size-conditioned SFLSIZ value must be a plain number, not a field name.</div>';
    } else {
      dl += '<div class="hint-small">Add a second display size (file-level Display Sizes picker) to condition these by DSPSIZ.</div>';
    }
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
  function wireSflCtlPanels(idPrefix, getKeywords, onChange, expandedSet, rerender, getFileKeywords) {
    var p = idPrefix;

    // General
    // I-10: SFLCTL - "Option indicators are not valid for this keyword."
    wireFlagRow(p + '-sflctl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLCTL', present, params, undefined, conditions); }, undefined, undefined, undefined);
    // I-10: SFLCSRRRN - no explicit option-indicator statement found either way in the DDS Reference; left as-is rather than guessing (I-7's RETKEY/RETCMDKEY/KEEP precedent).
    wireFlagRow(p + '-sflcsrrrn', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLCSRRRN', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLCSRRRN').conditions, expandedSet, rerender);
    // I-10: SFLMODE - "Option indicators are not valid for this keyword."
    wireFlagRow(p + '-sflmode', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLMODE', present, params, undefined, conditions); }, undefined, undefined, undefined);
    wireFlagRow(p + '-sfldsp', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDSP', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDSP').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sfldspctl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDSPCTL', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDSPCTL').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflinz', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLINZ', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLINZ').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sfldlt', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDLT', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDLT').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflclr', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLCLR', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLCLR').conditions, expandedSet, rerender);
    // I-10: SFLRNA - "Option indicators are not valid for this keyword."
    wireFlagRow(p + '-sflrna', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLRNA', present, '', undefined, conditions); }, undefined, undefined, undefined);
    wireFlagRow(p + '-sflend', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLEND', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLEND').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sfldrop', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLDROP', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLDROP').conditions, expandedSet, rerender);
    wireFlagRow(p + '-sflfold', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLFOLD', present, params, undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLFOLD').conditions, expandedSet, rerender);
    // I-10: SFLENTER - "Option indicators are not valid for this keyword."
    wireFlagRow(p + '-sflenter', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLENTER', present, params, undefined, conditions); }, undefined, undefined, undefined);
    // Task I-26: SFLSNGCHC/SFLMLTCHC selection list
    wireSflChoiceListPanel(p, getKeywords, onChange);
    wireFlagRow(p + '-sflnxtchg', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'SFLNXTCHG', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'SFLNXTCHG').conditions, expandedSet, rerender);
    wireFlagRow(p + '-logout', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'LOGOUT', present, '', undefined, conditions); }, DspfWriter.getFileFlagKeyword(getKeywords(), 'LOGOUT').conditions, expandedSet, rerender);
    // I-10: LOGINP/CHECK(AB,RL) - propagates I-9's own finding (not
    // eligible for option indicators) to this SFLCTL panel's own copy of
    // these shared keywords, which never got the fix when I-9 landed it on
    // the plain SFL panel's copy.
    wireFlagRow(p + '-loginp', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'LOGINP', present, '', undefined, conditions); }, undefined, undefined, undefined);
    // Task I-25: KEEP no longer has a live row on this panel - see
    // sflCtlPanelsHtml's own comment.
    wireFlagRow(p + '-check-ab', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'AB', conditions); }, undefined, undefined, undefined);
    wireFlagRow(p + '-check-rl', getKeywords, onChange, function (keywords, present, params, conditions) { return DspfWriter.setFileFlagKeyword(keywords, 'CHECK', present, null, 'RL', conditions); }, undefined, undefined, undefined);

    // Indicator (Task L5d)
    wireRecordIndicatorInstances(getKeywords(), onChange, p + '-recind', expandedSet, rerender, getFileKeywords);

    // Display Layout (Task L75 - was the one row in this whole panel that
    // needed a separate "Apply" button instead of committing immediately
    // like every other keyword row here; that inconsistency was flagged
    // as a possible cause of the suspected accordion-collapse regression
    // (SFLSIZ/SFLPAG/SFLLIN's own Apply click sits inside the accordion,
    // a different commit path than every sibling row's plain 'change'
    // listener) - removed rather than investigated further, since a
    // single shared commit path across the whole panel is simpler and
    // more consistent regardless of whether it was the actual cause.
    // setSflDisplayLayout rewrites all 3 keywords together (see its own
    // doc comment), so each input's own 'change' commits every value
    // CURRENTLY in the panel, not just the one that changed - editing
    // SFLPAG must not silently drop an already-edited, not-yet-committed
    // SFLSIZ/SFLLIN value sitting in a sibling input.
    //
    // Task I-22: extended (not replaced) for the new per-size (`-ds0`/
    // `-ds1`) inputs sflCtlPanelsHtml only renders once the file declares
    // 2+ DSPSIZ sizes - same shared-commit function now also reads
    // whichever of those are present. A size-conditioned SFLSIZ input is
    // hard-blocked (alert + revert just that one value, same idiom as
    // I-8/I-11/I-12/I-13) if given a non-numeric value - see
    // sflsizConditionedFieldNameConflictReason's own doc comment in
    // dspfWriter.js. SFLPAG/SFLLIN have no such restriction (neither has
    // a program-to-system field form to begin with).
    var sflsizEl = document.getElementById(p + '-sflsiz');
    var sflpagEl = document.getElementById(p + '-sflpag');
    var sfllinEl = document.getElementById(p + '-sfllin');
    if (sflsizEl && sflpagEl && sfllinEl) {
      var commitLayout = function () {
        var sizeList = DspfWriter.getDisplaySizesList((getFileKeywords ? getFileKeywords() : []) || []);
        function bySizeNameFor(idBase, numericOnly) {
          var bySizeName = {};
          if (sizeList.length <= 1) return bySizeName;
          sizeList.forEach(function (size, idx) {
            var el = document.getElementById(idBase + '-ds' + idx);
            if (!el) return;
            var v = el.value || '';
            if (numericOnly) {
              var reason = DspfWriter.sflsizConditionedFieldNameConflictReason(v);
              if (reason) {
                window.alert(reason);
                var existing = DspfWriter.getSflDisplayLayout(getKeywords()).sflsiz.bySizeName[size.name] || '';
                el.value = existing;
                v = existing;
              }
            }
            bySizeName[size.name] = v;
          });
          return bySizeName;
        }
        onChange(DspfWriter.setSflDisplayLayout(getKeywords(), {
          sflsiz: { primary: sflsizEl.value, bySizeName: bySizeNameFor(p + '-sflsiz', true) },
          sflpag: { primary: sflpagEl.value, bySizeName: bySizeNameFor(p + '-sflpag', false) },
          sfllin: { primary: sfllinEl.value, bySizeName: bySizeNameFor(p + '-sfllin', false) },
        }));
      };
      sflsizEl.addEventListener('change', commitLayout);
      sflpagEl.addEventListener('change', commitLayout);
      sfllinEl.addEventListener('change', commitLayout);
      var sizeListForWiring = DspfWriter.getDisplaySizesList((getFileKeywords ? getFileKeywords() : []) || []);
      if (sizeListForWiring.length > 1) {
        sizeListForWiring.forEach(function (size, idx) {
          ['sflsiz', 'sflpag', 'sfllin'].forEach(function (field) {
            var el = document.getElementById(p + '-' + field + '-ds' + idx);
            if (el) el.addEventListener('change', commitLayout);
          });
        });
      }
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
  // MNUBAR), and real SDA's own "Select Menu-Bar Record Keywords" menu
  // (_menu/image148.png) only lists General + Select record keywords
  // anyway - the dedicated "Define Menu-Bar Display Keywords" sub-screen
  // is reached FROM MNUBARDSP's own "Select parameters" flag, not a
  // separate top-level category, so R1's row already reaches it. (Task
  // L76 later gave that R1 row its own structured inputs - a single
  // "Pull-down input field" name on a MNUBAR record same as before, 3
  // Name inputs on any other record - rather than the one flat free-text
  // box this comment originally described; see recordKeywordsPanelsHtml's
  // own comment for the two-format rationale.) MNUBARSW/MNUCNL reuse
  // menuBarKeysPanelHtml/
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
  function mnuBarPanelsHtml(keywords, idPrefix, expandedSet, fields) {
    var kw = keywords || [];
    var p = idPrefix;
    var panels = {};

    // Task I-14: confirmed against IBM's own DDS Reference ("MNUBAR (Menu
    // Bar) keyword for display files") that the parameter is
    // `[*SEPARATOR | *NOSEPARATOR]` (optional, default *SEPARATOR - a
    // separator line placed below the last menu-bar choice line unless
    // *NOSEPARATOR is given), and that "Option indicators are not valid
    // for this keyword" - so unlike MNUBARSW/MNUCNL/MNUBARDSP just below
    // (all three explicitly documented as conditionable), MNUBAR itself
    // must NOT get a Conditioning toggle. The row used to pass
    // `mnubar.conditions` through to flagRowHtml, wrongly offering one;
    // passing `undefined` (the same "not eligible" idiom I-7/I-8/I-9/I-10
    // use elsewhere in this file) removes it. The previous placeholder's
    // own hint text calling the parameter "not confidently verified" is
    // replaced with the now-confirmed values.
    var mnubar = DspfWriter.getFileFlagKeyword(kw, 'MNUBAR');
    var g = flagRowHtml(p + '-mnubar', 'Menu-bar (MNUBAR)', mnubar.present, mnubar.parameters, '*SEPARATOR or *NOSEPARATOR (optional, default *SEPARATOR)', undefined, expandedSet);
    g += '<div class="section-label" style="margin-top:14px;"></div>';
    g += menuBarKeysPanelHtml(kw, p, expandedSet);
    g += '<div class="hint-small">Menu-Bar display (MNUBARDSP) is on the base Record Keywords \u2192 General tab above - shared across every record type.</div>';
    // Task I-19: advisory-only field-shape note (see
    // DspfWriter.mnubarFieldShapeNote's own doc comment for why this is a
    // note rather than a hard block) - recomputed from the record's
    // current field list on every render, so it stays in sync as fields
    // are added/removed without any dedicated wiring of its own.
    var shapeNote = DspfWriter.mnubarFieldShapeNote(fields);
    if (shapeNote) {
      g += '<div class="hint-small warn">' + escapeHtml(shapeNote) + '</div>';
    }
    panels.general = g;

    return panels;
  }

  /** Wires the mnuBarPanelsHtml() panel. Same `getKeywords`/`onChange`
   *  contract every other dedicated picker here uses. `getFileKeywords`
   *  (Task I-18, same optional-param convention as
   *  wireRecordKeywordsPanels/wireSflCtlPanels elsewhere in this file) is
   *  threaded straight through to wireMenuBarKeysPanel below, along with
   *  a `getRecordScopes` that resolves to just this record's own
   *  keywords - see wireMenuBarKeysPanel's own doc comment for why a
   *  record-level edit only ever needs to check its OWN record, not
   *  every other one. */
  function wireMnuBarPanels(idPrefix, getKeywords, onChange, expandedSet, rerender, getFileKeywords) {
    // Task I-14: MNUBAR takes no Conditioning toggle (see mnuBarPanelsHtml's
    // own comment) - `conditions` passed as `undefined` here matches that,
    // and setFileFlagKeyword's own "conditions omitted preserves whatever
    // conditioning already existed" contract means an existing DSPF that
    // (invalidly) already carried option-indicator conditioning on MNUBAR
    // is left untouched rather than silently stripped by this fix.
    wireFlagRow(idPrefix + '-mnubar', getKeywords, onChange, function (keywords, present, params) { return DspfWriter.setFileFlagKeyword(keywords, 'MNUBAR', present, params); }, undefined, expandedSet, rerender);
    wireMenuBarKeysPanel(idPrefix, getKeywords, onChange, expandedSet, rerender, getFileKeywords, function () { return [getKeywords()]; });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Bug fix (Find keyword feature request, follow-up to the L37 quick-nav):
  // findKeywordMatches (buildWebviewTemplate.js) searches the rendered
  // propsBody DOM for label/.section-label/.keyword-chip text, on the
  // theory that every picker row already shows its own keyword code. That
  // holds for plain flagRowHtml rows ("Blink cursor (BLINK)"), but several
  // panels intentionally show human-friendly labels or per-VALUE checkbox
  // codes instead of the group's own DDS keyword name anywhere visible -
  // COLOR/DSPATR's own "Color & attributes" section label never says
  // "COLOR" or "DSPATR" literally; RANGE/COMP/VALUES' hint text lives in a
  // <div class="hint-small"> that findKeywordMatches' selector doesn't even
  // look at; WDWBORDER/CHCAVAIL/CHCUNAVAIL/CHCSLT/the record Indicator
  // panel's 10 codes are only visible as <option> text inside a closed
  // <select>. Each of those meant the keyword could never be FOUND unless
  // it happened to already be set (then only visible via the Advanced/raw
  // keywords editor's own .keyword-chip) - useless for jumping to a keyword
  // you want to ADD. dataKwWrap tags the group's own outer container with
  // a `data-kw="CODE1 CODE2 ..."` attribute so findKeywordMatches can match
  // on the real keyword code regardless of what the visible label says or
  // whether the keyword is currently present - see its own updated comment
  // in buildWebviewTemplate.js for the DOM-search side of this fix.
  function dataKwWrap(codes, innerHtml) {
    return '<div data-kw="' + escapeHtml(codes.join(' ')) + '">' + innerHtml + '</div>';
  }

  return {
    rebuildRecordSelect: rebuildRecordSelect,
    recordTypeDependentInfo: recordTypeDependentInfo,
    RECORD_TYPES: RECORD_TYPES,
    isSflFamilyRecordType: isSflFamilyRecordType,
    buildTypedRecordPlan: buildTypedRecordPlan,
    missingDependentMessage: missingDependentMessage,
    placeRecordTemplate: placeRecordTemplate,
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
    dateTimeFormatHtml: dateTimeFormatHtml,
    wireDateTimeFormat: wireDateTimeFormat,
    validityCheckInstancesHtml: validityCheckInstancesHtml,
    wireValidityCheckInstances: wireValidityCheckInstances,
    recordIndicatorInstancesHtml: recordIndicatorInstancesHtml,
    wireRecordIndicatorInstances: wireRecordIndicatorInstances,
    hlptitlePanelHtml: hlptitlePanelHtml,
    wireHlptitlePanel: wireHlptitlePanel,
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
    databaseReferenceHtml: databaseReferenceHtml,
    wireDatabaseReferenceEditor: wireDatabaseReferenceEditor,
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
    wireSflMsgFieldRefs: wireSflMsgFieldRefs,
    sflPgmqFieldHtml: sflPgmqFieldHtml,
    sflChoiceListPanelHtml: sflChoiceListPanelHtml,
    wireSflChoiceListPanel: wireSflChoiceListPanel,    wireSflPgmqField: wireSflPgmqField,
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

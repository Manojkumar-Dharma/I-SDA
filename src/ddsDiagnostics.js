/**
 * ddsDiagnostics.js (E1a)
 *
 * Pure diagnostics core for editor-side DDS support: DDS source text in, a list of positioned
 * diagnostics out. No `vscode` import, so it runs in Node, in tests and (later) in the extension
 * host behind a DiagnosticCollection (E1b), a hover (E1c), completion (E1d) and quick-fixes (E1f).
 *
 * What it runs. The rules already live in DspfWriter as guards that REFUSE an edit. This module runs
 * the same functions in "report, don't refuse" mode over a whole source:
 *
 *   1. parser errors (DspfFile.errors);
 *   2. the model guards (`*NewConflictReason(oldModel, newModel)`, the exact chain
 *      commitSourceChange runs) called with an EMPTY old model. They are diff-based - "only a
 *      violation this edit introduces" - so against an empty old model every violation in the
 *      file counts as introduced;
 *   3. the record-keyword rules (`*ConflictReason(keywordName, recordKeywords)`: USRDFN / SFL /
 *      MNUBAR whitelists, WINDOW / PULLDOWN / KEEP mutexes, ...) for every keyword of every record.
 *
 * Where it points. A model guard answers with one reason string and no position, and only the
 * first violation it finds. So each reason is located by removal: the offending record is found by
 * bisecting on a prefix of the records, the offending keyword or field inside it by removing items
 * one at a time, until the reason goes away. The offender is then removed from the working copy
 * and the guard is asked again, so one guard can report several violations. A clean source costs
 * one call per guard; the search only runs when a guard fires.
 *
 * Not covered yet (the registry is the extension point): the guards with other signatures -
 * `(oldKeywords, newKeywords)` on fields, `(field, updates)` and the `*BasicEdit*` family. Each
 * needs a decision on which level it applies to; coverage() lists what is registered, so a new
 * guard in DspfWriter cannot be missed silently (the E1a test compares the two lists).
 *
 * Positions are 1-based lines and columns; `endColumn` is exclusive.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var parser;
    try { parser = require('./dspfParser.js'); } catch (e) { parser = require('../dist/dspfParser.js'); }
    module.exports = factory(require('./dspfWriter.js'), parser);
  } else {
    root.DdsDiagnostics = factory(root.DspfWriter, root.DspfParser);
  }
})(typeof self !== 'undefined' ? self : this, function (DspfWriter, DspfParser) {
  'use strict';

  var SOURCE = 'iSDA';
  var KEYWORD_AREA_START = 45; // 1-based, as in dspfWriter.js
  var NAME_START = 19; // 1-based: positions 19-28 hold the name
  var MAX_PER_GUARD = 500;

  // ---------------------------------------------------------------------
  // Registry. `code` is the stable identifier (a quick-fix, a severity override and a test all key
  // off it); `fn` is the DspfWriter export it runs.
  // ---------------------------------------------------------------------

  /** The commitSourceChange chain, in its own order: (oldModel, newModel) -> reason | null. */
  var MODEL_GUARDS = [
    ['isda.scrbarReserved', 'scrbarReservedNewConflictReason'],
    ['isda.altKeyFileExclusion', 'altKeyFileExclusionNewConflictReason'],
    ['isda.windowDependency', 'windowDependencyNewConflictReason'],
    ['isda.sflctlDependency', 'sflctlDependencyNewConflictReason'],
    ['isda.subfileKeyword', 'subfileKeywordNewConflictReason'],
    ['isda.subfileFoldDrop', 'subfileFoldDropNewConflictReason'],
    ['isda.outputControl', 'outputControlNewConflictReason'],
    ['isda.multiLevelEligibility', 'multiLevelEligibilityNewConflictReason'],
    ['isda.referenceField', 'referenceFieldNewConflictReason'],
    ['isda.choiceMenuBar', 'choiceMenuBarNewConflictReason'],
    ['isda.windowHelpMenu', 'windowHelpMenuNewConflictReason'],
    ['isda.initRetainReturn', 'initRetainReturnNewConflictReason'],
    ['isda.fileLevelDisplay', 'fileLevelDisplayNewConflictReason'],
    ['isda.commandFunctionParameter', 'commandFunctionParameterNewConflictReason'],
    ['isda.retKey', 'retKeyNewConflictReason'],
    ['isda.menuBarRecordRequired', 'menuBarRecordRequiredNewConflictReason'],
    ['isda.fileHelp', 'fileHelpNewConflictReason'],
    ['isda.helpSpec', 'helpSpecNewConflictReason'],
    ['isda.helpKeywordRelation', 'helpKeywordRelationNewConflictReason'],
    ['isda.fieldKind', 'fieldKindNewConflictReason'],
    ['isda.commandFunctionPairing', 'commandFunctionPairingNewConflictReason'],
    ['isda.commandKeyNumber', 'commandKeyNumberNewConflictReason'],
    ['isda.commandKeyRange', 'commandKeyRangeNewConflictReason'],
    ['isda.optionIndicatorRequired', 'optionIndicatorRequiredNewConflictReason'],
    ['isda.systemValueKeyword', 'systemValueKeywordNewConflictReason'],
  ];

  /**
   * Record-keyword rules: (keywordName, recordKeywords) -> reason | null, asked once per keyword of
   * each record. `only` limits a rule to the keywords it was written for: some guards answer
   * "yes" for any keyword name once the record has the marker keyword (they were only ever called
   * for one specific keyword), which is right as an edit-time check and wrong as a sweep.
   */
  var RECORD_KEYWORD_RULES = [
    { code: 'isda.usrdfnWhitelist', fn: 'usrdfnWhitelistConflictReason' },
    { code: 'isda.sflWhitelist', fn: 'sflWhitelistConflictReason' },
    { code: 'isda.mnubarWhitelist', fn: 'mnubarWhitelistConflictReason' },
    { code: 'isda.windowMutex', fn: 'windowMutexConflictReason' },
    { code: 'isda.pulldownMutex', fn: 'pulldownConflictReason' },
    { code: 'isda.keepMutex', fn: 'keepMutexConflictReason' },
    { code: 'isda.alwrolClrlSlnoMutex', fn: 'alwrolClrlSlnoConflictReason', only: ['ALWROL', 'CLRL', 'SLNO', 'ASSUME'] },
    { code: 'isda.sflNxtchgSflMsgRcd', fn: 'sflNxtchgSflMsgRcdConflictReason', only: ['SFLNXTCHG', 'SFLMSGRCD'] },
    { code: 'isda.dspmodSfl', fn: 'dspmodSflConflictReason', only: ['DSPMOD'] },
  ];

  var PARSE_ERROR_CODE = 'isda.parseError';

  /** Every code this module can emit, for a settings schema or a severity map. */
  function allCodes() {
    return [PARSE_ERROR_CODE]
      .concat(MODEL_GUARDS.map(function (g) { return g[0]; }))
      .concat(RECORD_KEYWORD_RULES.map(function (r) { return r.code; }));
  }

  /** What is registered, by DspfWriter export name - the E1a test compares it with every
   *  `*ConflictReason` DspfWriter exports so an unregistered guard shows up as a named gap. */
  function coverage() {
    return {
      model: MODEL_GUARDS.map(function (g) { return g[1]; }),
      recordKeyword: RECORD_KEYWORD_RULES.map(function (r) { return r.fn; }),
    };
  }

  // ---------------------------------------------------------------------
  // Model copies for the removal search. Shallow: only the arrays on the path to the removed item
  // are copied, everything else is shared and never mutated.
  // ---------------------------------------------------------------------

  function emptyModel() {
    return { fileKeywords: [], records: [], comments: [], errors: [] };
  }

  function withoutIndex(list, i) {
    return list.slice(0, i).concat(list.slice(i + 1));
  }

  function copyModel(model, changes) {
    return {
      fileKeywords: changes.fileKeywords || model.fileKeywords,
      records: changes.records || model.records,
      comments: model.comments,
      errors: model.errors,
    };
  }

  function copyRecord(rec, changes) {
    var out = {};
    Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
    Object.keys(changes).forEach(function (k) { out[k] = changes[k]; });
    return out;
  }

  function copyField(field, keywords) {
    var out = {};
    Object.keys(field).forEach(function (k) { out[k] = field[k]; });
    out.keywords = keywords;
    return out;
  }

  /** A removal is {kind, ri, fi?, ki?, help?}: a file keyword, a record keyword, a field (or help
   *  entry), or one keyword of a field. `apply` returns the model without it. */
  function applyRemoval(model, rm) {
    if (rm.kind === 'fileKeyword') {
      return copyModel(model, { fileKeywords: withoutIndex(model.fileKeywords, rm.ki) });
    }
    var rec = model.records[rm.ri];
    var newRec;
    if (rm.kind === 'recordKeyword') {
      newRec = copyRecord(rec, { keywords: withoutIndex(rec.keywords || [], rm.ki) });
    } else if (rm.kind === 'record') {
      return copyModel(model, { records: withoutIndex(model.records, rm.ri) });
    } else {
      var listName = rm.help ? 'helpEntries' : 'fields';
      var list = rec[listName] || [];
      var changed;
      if (rm.kind === 'field') {
        changed = withoutIndex(list, rm.fi);
      } else { // fieldKeyword
        changed = list.slice();
        changed[rm.fi] = copyField(list[rm.fi], withoutIndex(list[rm.fi].keywords || [], rm.ki));
      }
      var patch = {};
      patch[listName] = changed;
      newRec = copyRecord(rec, patch);
    }
    var records = model.records.slice();
    records[rm.ri] = newRec;
    return copyModel(model, { records: records });
  }

  // ---------------------------------------------------------------------
  // Locating a model-guard reason.
  // ---------------------------------------------------------------------

  function guardReason(fn, model) {
    return fn(emptyModel(), model) || null;
  }

  /** How early `name` is mentioned in `reason`: a mention introduced by "field" or "record" (the
   *  way the guards word it: "on field F2", "record format R1") ranks before a bare whole-word
   *  match, which a field named like a keyword (ALIAS) would otherwise win. Infinity when absent. */
  function mentionIndex(reason, name) {
    if (!name) return Infinity;
    var q = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var edge = '(?![A-Za-z0-9_$#@])';
    var introduced = new RegExp('\\b(?:field|record format|record|format)\\s+' + q + edge).exec(reason);
    if (introduced) return introduced.index;
    var bare = new RegExp('(^|[^A-Za-z0-9_$#@])' + q + edge).exec(reason);
    return bare ? 1e6 + bare.index + bare[1].length : Infinity;
  }

  /** A conflict between two items clears when either is removed, but the reason is written about
   *  one of them ("ALIAS(AA) on field F2 ... field F1 already uses it"): of the removals that
   *  clear it, the one whose entity the reason names first is the one the message is about. */
  function pickByMention(candidates, reason, nameOf) {
    var best = candidates[0];
    var bestAt = mentionIndex(reason, nameOf(best));
    for (var i = 1; i < candidates.length; i++) {
      var at = mentionIndex(reason, nameOf(candidates[i]));
      if (at < bestAt) { best = candidates[i]; bestAt = at; }
    }
    return best;
  }

  /**
   * The removal that makes `reason` go away, or null. File keywords first (a few, tested one by
   * one), then the records: the smallest prefix of records whose removal clears the reason
   * (bisection, so a 500-record file takes about nine guard calls) and, the same from the other
   * end, the smallest suffix - the two records a conflict between records involves - then that
   * record's own items.
   */
  function locate(fn, model, reason) {
    var i;
    var cleared = function (m) { return guardReason(fn, m) !== reason; };

    if (model.fileKeywords.length && cleared(copyModel(model, { fileKeywords: [] }))) {
      var fileHits = [];
      for (i = 0; i < model.fileKeywords.length; i++) {
        var fk = { kind: 'fileKeyword', ki: i };
        if (cleared(applyRemoval(model, fk))) fileHits.push(fk);
      }
      if (!fileHits.length) return { kind: 'fileKeyword', ki: 0 };
      return pickByMention(fileHits, reason, function (rm) { return model.fileKeywords[rm.ki].name; });
    }

    var n = model.records.length;
    if (!n || !cleared(copyModel(model, { records: [] }))) return null;
    var lo = 0;
    var hi = n - 1; // records[0..hi] removed clears it
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (cleared(copyModel(model, { records: model.records.slice(mid + 1) }))) hi = mid; else lo = mid + 1;
    }
    var firstRi = lo;
    lo = 0;
    hi = n - 1; // records[lo..n-1] removed clears it, for the largest lo
    while (lo < hi) {
      var mid2 = (lo + hi + 1) >> 1;
      if (cleared(copyModel(model, { records: model.records.slice(0, mid2) }))) lo = mid2; else hi = mid2 - 1;
    }
    // The two ends are the first and last record involved (which is which depends on whether the
    // reason clears when any one of them goes or only when all do); ties go to the earlier one.
    var ends = firstRi === lo ? [firstRi] : [Math.min(firstRi, lo), Math.max(firstRi, lo)];
    var ri = pickByMention(ends, reason, function (idx) { return model.records[idx].name; });

    // Inside that record, test each item with the records on the far side of the other end
    // removed, so a reason that needs several offenders gone to clear (HLPRCD on three records)
    // is still cleared by removing the one item of this record.
    var base;
    var baseRi;
    if (ri === firstRi) { // the first record whose removal, together with all before it, clears it
      base = copyModel(model, { records: model.records.slice(ri) });
      baseRi = 0;
    } else {
      base = copyModel(model, { records: model.records.slice(0, ri + 1) });
      baseRi = ri;
    }
    var rec = model.records[ri];
    var inBase = function (rm) { var c = {}; Object.keys(rm).forEach(function (k) { c[k] = rm[k]; }); c.ri = baseRi; return c; };
    var cleared2 = function (rm) { return cleared(applyRemoval(base, inBase(rm))); };

    var hits = [];
    var kws = rec.keywords || [];
    for (i = 0; i < kws.length; i++) {
      var rk = { kind: 'recordKeyword', ri: ri, ki: i };
      if (cleared2(rk)) hits.push({ rm: rk, name: rec.name });
    }
    var lists = [['fields', false], ['helpEntries', true]];
    for (var l = 0; l < lists.length; l++) {
      var list = rec[lists[l][0]] || [];
      for (var fi = 0; fi < list.length; fi++) {
        var whole = { kind: 'field', ri: ri, fi: fi, help: lists[l][1] };
        if (!cleared2(whole)) continue;
        var fkws = list[fi].keywords || [];
        var found = false;
        for (var ki = 0; ki < fkws.length; ki++) {
          var one = { kind: 'fieldKeyword', ri: ri, fi: fi, ki: ki, help: lists[l][1] };
          if (cleared2(one)) { hits.push({ rm: one, name: list[fi].name }); found = true; break; }
        }
        if (!found) hits.push({ rm: whole, name: list[fi].name });
      }
    }
    if (!hits.length) return { kind: 'record', ri: ri };
    return pickByMention(hits, reason, function (h) { return h.name; }).rm;
  }

  // ---------------------------------------------------------------------
  // Positions.
  // ---------------------------------------------------------------------

  function lineText(lines, line) {
    return (lines[line - 1] || '').replace(/\s+$/, '');
  }

  function wholeLine(lines, line) {
    var len = lineText(lines, line).length;
    return { line: line, column: 1, endColumn: Math.max(len + 1, 2) };
  }

  /** A keyword: its name in the keyword area of its first line, ending with its own text there. */
  function keywordRange(lines, kw) {
    var line = (kw.sourceLines && kw.sourceLines[0]) || 1;
    var text = lineText(lines, line);
    var name = String(kw.name || '');
    var at = text.indexOf(name, KEYWORD_AREA_START - 1);
    if (at < 0) at = text.indexOf(name, 6);
    if (at < 0) return wholeLine(lines, line);
    var raw = String(kw.raw || name).split(/\r\n|\r|\n/)[0];
    var len = Math.max(name.length, Math.min(raw.length, text.length - at));
    return { line: line, column: at + 1, endColumn: at + len + 1 };
  }

  /** A record or field: its name (positions 19-28) on its own line, else the whole line. */
  function entityRange(lines, entity) {
    var line = entity.sourceLine || 1;
    var text = lineText(lines, line);
    var name = String(entity.name || '');
    if (name && text.substr(NAME_START - 1, name.length) === name) {
      return { line: line, column: NAME_START, endColumn: NAME_START + name.length };
    }
    return wholeLine(lines, line);
  }

  function rangeFor(lines, model, rm) {
    if (!rm) return wholeLine(lines, 1);
    if (rm.kind === 'fileKeyword') return keywordRange(lines, model.fileKeywords[rm.ki]);
    var rec = model.records[rm.ri];
    if (rm.kind === 'recordKeyword') return keywordRange(lines, rec.keywords[rm.ki]);
    if (rm.kind === 'record') return entityRange(lines, rec);
    var list = rm.help ? rec.helpEntries : rec.fields;
    if (rm.kind === 'field') return entityRange(lines, list[rm.fi]);
    return keywordRange(lines, list[rm.fi].keywords[rm.ki]);
  }

  function describe(model, rm) {
    var out = { keyword: null, record: null };
    if (!rm) return out;
    if (rm.kind === 'fileKeyword') {
      out.keyword = model.fileKeywords[rm.ki].name;
      return out;
    }
    var rec = model.records[rm.ri];
    out.record = rec.name || null;
    if (rm.kind === 'recordKeyword') out.keyword = rec.keywords[rm.ki].name;
    else if (rm.kind === 'fieldKeyword') out.keyword = (rm.help ? rec.helpEntries : rec.fields)[rm.fi].keywords[rm.ki].name;
    return out;
  }

  // ---------------------------------------------------------------------
  // Running the registry.
  // ---------------------------------------------------------------------

  function runModelGuards(lines, model, push, internalErrors) {
    MODEL_GUARDS.forEach(function (entry) {
      var code = entry[0];
      var fn = DspfWriter[entry[1]];
      if (typeof fn !== 'function') { internalErrors.push(entry[1] + ' is not exported by DspfWriter'); return; }
      var cur = model;
      try {
        // One reason can be true of several places at once (HLPRCD on two records), so the same
        // reason may come round again; each round removes what it reported, so it ends.
        for (var n = 0; n < MAX_PER_GUARD; n++) {
          var reason = guardReason(fn, cur);
          if (!reason) break;
          var rm = locate(fn, cur, reason);
          var range = rangeFor(lines, cur, rm);
          var who = describe(cur, rm);
          push(code, reason, range, who.keyword, who.record);
          if (!rm) break;
          cur = applyRemoval(cur, rm);
        }
      } catch (e) {
        internalErrors.push(entry[1] + ': ' + (e && e.message ? e.message : e));
      }
    });
  }

  function runRecordKeywordRules(lines, model, push, internalErrors) {
    RECORD_KEYWORD_RULES.forEach(function (rule) {
      var fn = DspfWriter[rule.fn];
      if (typeof fn !== 'function') { internalErrors.push(rule.fn + ' is not exported by DspfWriter'); return; }
      model.records.forEach(function (rec) {
        var kws = rec.keywords || [];
        kws.forEach(function (kw) {
          var name = kw.name;
          if (rule.only && rule.only.indexOf(name) < 0) return;
          try {
            var reason = fn(name, kws);
            if (reason) push(rule.code, reason, keywordRange(lines, kw), name, rec.name || null);
          } catch (e) {
            internalErrors.push(rule.fn + ': ' + (e && e.message ? e.message : e));
          }
        });
      });
    });
  }

  // ---------------------------------------------------------------------
  // Entry points.
  // ---------------------------------------------------------------------

  /**
   * analyze(source, options?) -> { diagnostics, model, internalErrors }
   *
   * diagnostic: { line, column, endColumn, severity, code, message, keyword, record, source }
   *   severity  'error' | 'warning' | 'information' | 'hint'
   *   keyword   the keyword the diagnostic is on, or null (a record, a field, the whole line)
   *   record    the record format it is in, or null (file level)
   *
   * options:
   *   severity  { code: severity | 'off' } overrides (the default for every rule is 'error', the
   *             DDS compiler refuses what the guards refuse)
   *   disabled  array of codes to skip entirely
   *   model     an already parsed DspfFile for this source, to skip the parse
   *
   * Never throws: a source that will not parse gives the parser's error list as diagnostics, and a
   * guard that throws is skipped and named in `internalErrors`.
   */
  function analyze(source, options) {
    options = options || {};
    var text = source == null ? '' : String(source);
    var lines = text.split(/\r\n|\r|\n/);
    var severityMap = options.severity || {};
    var disabled = options.disabled || [];
    var diagnostics = [];
    var internalErrors = [];

    function push(code, message, range, keyword, record) {
      if (disabled.indexOf(code) >= 0) return;
      var severity = severityMap[code] || 'error';
      if (severity === 'off') return;
      diagnostics.push({
        line: range.line,
        column: range.column,
        endColumn: range.endColumn,
        severity: severity,
        code: code,
        message: message,
        keyword: keyword || null,
        record: record || null,
        source: SOURCE,
      });
    }

    var model = options.model || null;
    if (!model) {
      try {
        model = DspfParser.parseDspf(text);
      } catch (e) {
        internalErrors.push('parseDspf: ' + (e && e.message ? e.message : e));
        return { diagnostics: [], model: null, internalErrors: internalErrors };
      }
    }

    (model.errors || []).forEach(function (err) {
      push(PARSE_ERROR_CODE, err.message, wholeLine(lines, err.line || 1), null, null);
    });
    runModelGuards(lines, model, push, internalErrors);
    runRecordKeywordRules(lines, model, push, internalErrors);

    diagnostics.sort(function (a, b) {
      return a.line - b.line || a.column - b.column || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
    });
    return { diagnostics: diagnostics, model: model, internalErrors: internalErrors };
  }

  return {
    analyze: analyze,
    allCodes: allCodes,
    coverage: coverage,
    PARSE_ERROR_CODE: PARSE_ERROR_CODE,
  };
});

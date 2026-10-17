/**
 * ddsItemRules.js (E1j)
 *
 * The `*ConflictReason` guards of DspfWriter that are not `(oldModel, newModel)` model guards and not
 * `(keywordName, recordKeywords)` record-keyword rules, made runnable over a static source.
 *
 * Those guards were written for an EDIT: most take `(oldKeywords, newKeywords, ...)` and blame only what the
 * edit introduces. A source on disk has no edit, so each is called the way the model guards are - with an
 * EMPTY old state - and what it then names is every violation the source has. A guard that only compares
 * an old value with a new one (`*BasicEdit*`, reorder, resolve) has nothing to say about a static source;
 * the same fact is held by a sibling that judges the field as it is, and the pair is listed in
 * EDIT_ONLY / COVERED_BY with the reason.
 *
 * A rule has a scope, which says what the guard may look at and so how it can be cached (E1h):
 *   field   one field and its record's keywords      cached per record text with the record-local guards
 *   record  one record                                cached per record text
 *   file    the file keywords only                    asked once per analysis
 *   model   other records, the file keywords, help specifications   asked on every analysis
 *
 * `run(ctx)` returns findings `{ reason, kw, target }`: `kw` is the keyword the reason is about (a position
 * on its line), else `target` is 'field' | 'record' | 'file'. A guard answers with one reason and no
 * position, so, as in ddsDiagnostics, the keyword is found by removal: the keyword whose removal makes the
 * reason go away, the offender is dropped from a working copy and the guard is asked again.
 *
 * Pure: no `vscode`, no DOM.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dspfWriter.js'), require('./keywordSpec.js'));
  } else {
    root.DdsItemRules = factory(root.DspfWriter, root.KeywordSpec);
  }
})(typeof self !== 'undefined' ? self : this, function (W, KeywordSpec) {
  'use strict';

  var MAX_PER_LIST = 25;

  function has(kws, name) { return (kws || []).some(function (k) { return k && k.name === name; }); }
  function without(list, i) { return list.slice(0, i).concat(list.slice(i + 1)); }

  /** The candidate whose keyword name the reason mentions first (a conflict clears when either side
   *  goes; the message is written about one of them), else the first. */
  function pickByMention(list, hits, reason) {
    var best = hits[0];
    var bestAt = Infinity;
    hits.forEach(function (i) {
      var name = String(list[i].name || '');
      var m = new RegExp('(^|[^A-Za-z0-9_$#@])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_$#@])').exec(reason);
      var at = m ? m.index + m[1].length : Infinity;
      if (at < bestAt) { best = i; bestAt = at; }
    });
    return best;
  }

  /**
   * Every violation `call(keywords)` names in a keyword list, each pinned on the keyword whose removal
   * clears it. `call` is asked about the whole list and returns a reason or a falsy value.
   */
  function blame(keywords, call, target) {
    var out = [];
    var cur = (keywords || []).slice();
    for (var n = 0; n < MAX_PER_LIST; n++) {
      var reason = call(cur);
      if (!reason) break;
      var hits = [];
      for (var i = 0; i < cur.length; i++) {
        if (call(without(cur, i)) !== reason) hits.push(i);
      }
      if (!hits.length) { out.push({ reason: reason, kw: null, target: target }); break; }
      var at = pickByMention(cur, hits, reason);
      out.push({ reason: reason, kw: cur[at], target: target });
      cur = without(cur, at);
    }
    return out;
  }

  /** `fn(kw.name, kw.parameters, ...)` for each keyword named in `names`; the reason sits on that keyword. */
  function eachKeyword(keywords, names, ask) {
    var out = [];
    (keywords || []).forEach(function (kw) {
      if (!kw || names.indexOf(kw.name) < 0) return;
      var reason = ask(kw);
      if (reason) out.push({ reason: reason, kw: kw, target: null });
    });
    return out;
  }

  function norm(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function fieldKind(f) {
    return { usage: f.usage, dataType: f.dataType, isConstant: f.nameType === 'CONSTANT' };
  }
  function isSflCtl(rec) { return has(rec.keywords, 'SFLCTL'); }

  var NO_USAGE = '\u0001';
  var NO_FIELD = { dataType: NO_USAGE, length: -1, decimalPositions: -1, usage: NO_USAGE };
  function definitionOf(f) {
    return { dataType: f.dataType, length: f.length, decimalPositions: f.decimalPositions, usage: f.usage };
  }

  var HELP_KEYWORDS = ['HLPDOC', 'HLPBDY', 'HLPPNLGRP', 'HLPRCD', 'HLPRTN'];
  /** The other help keyword a reason names: a pair of mutually exclusive keywords is one violation, so it is
   *  reported on the first of the two the source has and not again from the other. */
  function pairKey(name, reason) {
    var other = HELP_KEYWORDS.filter(function (n) { return n !== name && new RegExp('\\b' + n + '\\b').test(reason); })[0] || '';
    return [name, other].sort().join('+');
  }
  function dedupePairs(findings) {
    var seen = {};
    return findings.filter(function (f) {
      var key = pairKey(f.kw ? f.kw.name : '', f.reason);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function fn(name) {
    var f = W[name];
    if (typeof f !== 'function') throw new Error(name + ' is not exported by DspfWriter');
    return f;
  }

  // ---------------------------------------------------------------------
  // The rules. `code` is the stable identifier (severity map, quick-fix, test); `fns` the DspfWriter exports
  // it runs.
  // ---------------------------------------------------------------------
  var RULES = [
    // ---- field scope: ctx = { field, rec, index, before } (before: the fields above it in the record) ----
    { code: 'isda.edtmskKeywords', scope: 'field', fns: ['edtmskNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('edtmskNewConflictReason')([], k); }, 'field'); } },
    { code: 'isda.edtmskDefinition', scope: 'field', fns: ['editMaskConflictReason'],
      run: function (c) {
        return blame(c.field.keywords, function (k) {
          return has(k, 'EDTMSK') ? fn('editMaskConflictReason')(k, c.field.usage || 'O') : null;
        }, 'field');
      } },
    { code: 'isda.msgidExclusion', scope: 'field', fns: ['msgidExclusionConflictReason'],
      run: function (c) {
        return blame(c.field.keywords, function (k) {
          return has(k, 'MSGID') ? fn('msgidExclusionConflictReason')('MSGID', k, c.rec.keywords) : null;
        }, 'field');
      } },
    { code: 'isda.chkmsgidQualifier', scope: 'field', fns: ['chkmsgidNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('chkmsgidNewConflictReason')([], k); }, 'field'); } },
    { code: 'isda.pshbtnfld', scope: 'field', fns: ['pshbtnfldConflictReason'],
      run: function (c) {
        return eachKeyword(c.field.keywords, ['PSHBTNFLD', 'PSHBTNCHC'], function (kw) {
          return fn('pshbtnfldConflictReason')(kw.name, kw.parameters, c.field.keywords);
        });
      } },
    { code: 'isda.layoutParameters', scope: 'field', fns: ['layoutParametersNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('layoutParametersNewConflictReason')([], k); }, 'field'); } },
    { code: 'isda.valnumEligibility', scope: 'field', fns: ['valnumNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('valnumNewConflictReason')([], k, fieldKind(c.field)); }, 'field'); } },
    { code: 'isda.dateTimeFormat', scope: 'field', fns: ['dateTimeFormatNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('dateTimeFormatNewConflictReason')([], k, fieldKind(c.field)); }, 'field'); } },
    { code: 'isda.dateTimeUsage', scope: 'field', fns: ['dateTimeUsageConflictReason'],
      run: function (c) {
        var reason = fn('dateTimeUsageConflictReason')(c.field.dataType, c.field.usage || 'O');
        return reason ? [{ reason: reason, kw: null, target: 'field' }] : [];
      } },
    { code: 'isda.igcalttyp', scope: 'field', fns: ['igcalttypNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('igcalttypNewConflictReason')([], k, fieldKind(c.field)); }, 'field'); } },
    { code: 'isda.editKeywordDataType', scope: 'field', fns: ['editKeywordDataTypeNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('editKeywordDataTypeNewConflictReason')([], k, fieldKind(c.field)); }, 'field'); } },
    { code: 'isda.floatField', scope: 'field',
      fns: ['dupFloatNewConflictReason', 'blkfoldFloatNewConflictReason', 'dftGroupFloatNewConflictReason', 'rangeFloatNewConflictReason',
        'compFloatNewConflictReason', 'valuesFloatNewConflictReason', 'checkAbFloatIncompatibleNewConflictReason'],
      run: function (c) {
        if (norm(c.field.dataType) !== 'F') return [];
        var names = ['dupFloatNewConflictReason', 'blkfoldFloatNewConflictReason', 'dftGroupFloatNewConflictReason', 'rangeFloatNewConflictReason',
          'compFloatNewConflictReason', 'valuesFloatNewConflictReason', 'checkAbFloatIncompatibleNewConflictReason'];
        return blame(c.field.keywords, function (k) {
          for (var i = 0; i < names.length; i++) {
            var r = fn(names[i])({ dataType: '', keywords: [] }, { dataType: c.field.dataType, keywords: k });
            if (r) return r;
          }
          return null;
        }, 'field');
      } },
    { code: 'isda.dftGroup', scope: 'field', fns: ['dftGroupConflictReason'],
      run: function (c) {
        // The group's keywords exclude one another: one violation, on the first of them the field has. The
        // floating-point clause of the guard is the float rule's, so the guard is asked about a non-F type.
        var names = ['DFT'].concat(KeywordSpec.groupMutexKeywords('DFT'));
        var out = [];
        (c.field.keywords || []).some(function (kw) {
          if (names.indexOf(kw.name) < 0) return false;
          var reason = fn('dftGroupConflictReason')(kw.name, c.field.keywords, '');
          if (reason) { out.push({ reason: reason, kw: kw, target: null }); return true; }
          return false;
        });
        return out;
      } },
    { code: 'isda.wrdwrapField', scope: 'field', fns: ['wrdwrapFieldConflictReason'],
      run: function (c) {
        return eachKeyword(c.field.keywords, ['WRDWRAP'], function (kw) {
          // The usage as parsed: a blank usage is already O.
          return fn('wrdwrapFieldConflictReason')('WRDWRAP', c.field.keywords, c.field.dataType, c.field.usage, c.rec.keywords);
        });
      } },
    { code: 'isda.chrid', scope: 'field', fns: ['chridNewConflictReason'],
      run: function (c) {
        return blame(c.field.keywords, function (k) {
          return fn('chridNewConflictReason')([], k, { usage: c.field.usage, decimalPositions: c.field.decimalPositions, isConstant: c.field.nameType === 'CONSTANT' });
        }, 'field');
      } },
    { code: 'isda.msgcon', scope: 'field', fns: ['msgconNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('msgconNewConflictReason')([], k, c.field.nameType); }, 'field'); } },
    { code: 'isda.errmsgidData', scope: 'field', fns: ['messageIdMsgDataNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('messageIdMsgDataNewConflictReason')('ERRMSGID', [], k, c.rec.fields); }, 'field'); } },
    { code: 'isda.chkmsgidData', scope: 'field', fns: ['chkmsgidMsgDataNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('chkmsgidMsgDataNewConflictReason')([], k, c.rec.fields); }, 'field'); } },
    { code: 'isda.subfileControlOnlyField', scope: 'field', fns: ['subfileControlOnlyFieldNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('subfileControlOnlyFieldNewConflictReason')([], k, isSflCtl(c.rec)); }, 'field'); } },
    { code: 'isda.sflmsgkeyField', scope: 'field', fns: ['sflmsgkeyFieldNewConflictReason'],
      run: function (c) {
        return blame(c.field.keywords, function (k) {
          return fn('sflmsgkeyFieldNewConflictReason')({ keywords: [], conditions: [] }, { keywords: k, conditions: c.field.conditions || [] });
        }, 'field');
      } },
    { code: 'isda.sflscrollField', scope: 'field', fns: ['sflscrollNewConflictReason', 'sflScrollFieldConflictReason'],
      run: function (c) {
        var out = blame(c.field.keywords, function (k) { return fn('sflscrollNewConflictReason')([], k, c.field, c.rec.keywords); }, 'field');
        // Only the first SFLSCROLL field of a record is unremarkable: a later one is the one blamed. The record's
        // SFLSIZ / SFLPAG clause is the line above's, so the guard is not given the record's keywords here.
        eachKeyword(c.field.keywords, ['SFLSCROLL'], function () {
          var reason = fn('sflScrollFieldConflictReason')(c.field.keywords, c.before().map(function (f) { return f.keywords; }), null);
          return reason || null;
        }).forEach(function (f) { out.push(f); });
        return out;
      } },
    { code: 'isda.sflrcdnbrField', scope: 'field', fns: ['sflrcdnbrNewConflictReason'],
      run: function (c) { return blame(c.field.keywords, function (k) { return fn('sflrcdnbrNewConflictReason')([], k, c.field); }, 'field'); } },
    { code: 'isda.sflchcctlField', scope: 'field', fns: ['sflchcctlFieldConflictReason'],
      run: function (c) {
        var firstNamed = (c.rec.fields || []).filter(function (f) { return f.nameType !== 'CONSTANT'; })[0];
        var isFirst = firstNamed === c.field;
        return eachKeyword(c.field.keywords, ['SFLCHCCTL'], function () {
          return fn('sflchcctlFieldConflictReason')(isFirst, c.before().map(function (f) { return f.keywords; }), c.rec.keywords) || null;
        });
      } },
    // The three guards below compare a field's definition before and after an edit and name what the edit set
    // wrong. A field on disk has no "before", so each is asked with an old definition no real field has
    // (every wrong attribute then counts as changed): the reason reads "cannot set data type A (must be Y)".
    { code: 'isda.pshbtnfldShape', scope: 'field', fns: ['pshbtnfldBasicEditConflictReason'],
      run: function (c) {
        return eachKeyword(c.field.keywords, ['PSHBTNFLD'], function () {
          return fn('pshbtnfldBasicEditConflictReason')(c.field.keywords, NO_FIELD, definitionOf(c.field)) || null;
        });
      } },
    { code: 'isda.sflchcctlShape', scope: 'field', fns: ['sflchcctlBasicEditConflictReason'],
      run: function (c) {
        return eachKeyword(c.field.keywords, ['SFLCHCCTL'], function () {
          return fn('sflchcctlBasicEditConflictReason')(c.field.keywords, NO_FIELD, definitionOf(c.field)) || null;
        });
      } },
    { code: 'isda.chkmsgidUsage', scope: 'field', fns: ['chkmsgidBasicEditConflictReason'],
      run: function (c) {
        return eachKeyword(c.field.keywords, ['CHKMSGID'], function () {
          return fn('chkmsgidBasicEditConflictReason')(c.field.keywords, NO_USAGE, c.field.usage) || null;
        });
      } },
    { code: 'isda.html', scope: 'field', fns: ['htmlConflictReason'],
      run: function (c) {
        return eachKeyword(c.field.keywords, ['HTML'], function () {
          return fn('htmlConflictReason')('HTML', c.field.keywords, c.rec.keywords);
        });
      } },
    { code: 'isda.fieldOptionIndicators', scope: 'field', fns: ['noOptionIndicatorsNewConflictReason'],
      run: function (c) { return optionIndicators(c.field.keywords); } },
    { code: 'isda.editCodeFill', scope: 'field', fns: ['editCodeFillConflictReason'],
      run: function (c) {
        return eachKeyword(c.field.keywords, ['EDTCDE'], function (kw) {
          var parts = W.splitEditCode(kw.parameters);
          return fn('editCodeFillConflictReason')('EDTCDE', parts.code, parts.fill);
        });
      } },

    // ---- record scope: ctx = { rec } ----
    { code: 'isda.sflend', scope: 'record', fns: ['sflendNewConflictReason'],
      run: function (c) { return blame(c.rec.keywords, function (k) { return fn('sflendNewConflictReason')([], k); }, 'record'); } },
    { code: 'isda.sflrtnsel', scope: 'record', fns: ['sflrtnselNewConflictReason'],
      run: function (c) { return blame(c.rec.keywords, function (k) { return fn('sflrtnselNewConflictReason')([], k); }, 'record'); } },
    { code: 'isda.sflChoiceList', scope: 'record', fns: ['sflChoiceListNewConflictReason'],
      run: function (c) { return blame(c.rec.keywords, function (k) { return fn('sflChoiceListNewConflictReason')([], k); }, 'record'); } },
    { code: 'isda.sflcsrrrn', scope: 'record', fns: ['sflcsrrrnNewConflictReason'],
      run: function (c) { return blame(c.rec.keywords, function (k) { return fn('sflcsrrrnNewConflictReason')([], k, c.rec.fields); }, 'record'); } },
    { code: 'isda.sflmsgidData', scope: 'record', fns: ['messageIdMsgDataNewConflictReason'],
      run: function (c) { return blame(c.rec.keywords, function (k) { return fn('messageIdMsgDataNewConflictReason')('SFLMSGID', [], k, c.rec.fields); }, 'record'); } },
    { code: 'isda.recordOptionIndicators', scope: 'record', fns: ['noOptionIndicatorsNewConflictReason'],
      run: function (c) { return optionIndicators(c.rec.keywords); } },
    { code: 'isda.sflsizCondition', scope: 'record', fns: ['sflsizConditionedFieldNameConflictReason'],
      run: function (c) {
        return eachKeyword(c.rec.keywords, ['SFLSIZ'], function (kw) {
          var sized = (kw.conditions || []).some(function (g) { return g && g.displaySizeCondition; });
          return sized ? fn('sflsizConditionedFieldNameConflictReason')(kw.parameters) : null;
        });
      } },

    // ---- file scope: ctx = { fileKeywords } ----
    { code: 'isda.fileHelpExclusion', scope: 'file', fns: ['hlpdocConflictReason', 'hlprcdConflictReason'],
      run: function (c) {
        return dedupePairs(eachKeyword(c.fileKeywords, ['HLPDOC', 'HLPPNLGRP', 'HLPRTN', 'HLPRCD'], function (kw) {
          return fn('hlpdocConflictReason')(kw.name, c.fileKeywords) || fn('hlprcdConflictReason')(kw.name, c.fileKeywords) || null;
        }));
      } },
    { code: 'isda.fileOptionIndicators', scope: 'file', fns: ['noOptionIndicatorsNewConflictReason'],
      run: function (c) { return optionIndicators(c.fileKeywords, 'file'); } },

    // ---- model scope: ctx = { model, fileKeywords } ----
    { code: 'isda.helpSpecExclusion', scope: 'model', fns: ['hlpdocHspecConflictReason', 'hlprcdHspecConflictReason'],
      run: function (c) {
        var out = [];
        (c.model.records || []).forEach(function (rec) {
          (rec.helpEntries || []).forEach(function (h) {
            var found = eachKeyword(h.keywords, ['HLPDOC', 'HLPBDY', 'HLPPNLGRP', 'HLPRCD'], function (kw) {
              return fn('hlpdocHspecConflictReason')(kw.name, h.keywords, c.model, h.sourceLine) ||
                fn('hlprcdHspecConflictReason')(kw.name, h.keywords, c.model, h.sourceLine) || null;
            });
            found.forEach(function (f) { f.recordName = rec.name || null; out.push(f); });
          });
        });
        return dedupePairs(out);
      } },
    { code: 'isda.sflctlNxtchg', scope: 'model', fns: ['sflctlNxtchgSflchcctlConflictReason'],
      run: function (c) {
        var out = [];
        (c.model.records || []).forEach(function (rec) {
          eachKeyword(rec.keywords, ['SFLNXTCHG'], function () {
            return fn('sflctlNxtchgSflchcctlConflictReason')(rec.keywords, c.model.records) || null;
          }).forEach(function (f) { f.recordName = rec.name || null; out.push(f); });
        });
        return out;
      } },
    { code: 'isda.sfllin', scope: 'model', fns: ['sfllinRecordEditConflictReason'],
      run: function (c) {
        var out = [];
        (c.model.records || []).forEach(function (rec) {
          eachKeyword(rec.keywords, ['SFLLIN'], function () {
            return fn('sfllinRecordEditConflictReason')({ keywords: [], fields: rec.fields }, rec.keywords, c.model.records) || null;
          }).forEach(function (f) { f.recordName = rec.name || null; out.push(f); });
        });
        return out;
      } },
    { code: 'isda.sflcsrprgField', scope: 'model', fns: ['sflcsrprgFieldEditConflictReason'],
      run: function (c) {
        var out = [];
        (c.model.records || []).forEach(function (rec) {
          (rec.fields || []).forEach(function (f) {
            eachKeyword(f.keywords, ['SFLCSRPRG'], function () {
              return fn('sflcsrprgFieldEditConflictReason')(rec.name, [], f.keywords, c.model.records) || null;
            }).forEach(function (x) { x.recordName = rec.name || null; out.push(x); });
          });
        });
        return out;
      } },
    { code: 'isda.passrcdRecord', scope: 'model', fns: ['passrcdRecordConflictReason'],
      run: function (c) {
        var pass = (c.fileKeywords || []).filter(function (k) { return k.name === 'PASSRCD'; })[0];
        if (!pass) return [];
        var out = [];
        var restricted = W.passrcdRestrictedKeywords();
        (c.model.records || []).forEach(function (rec) {
          eachKeyword(rec.keywords, restricted, function (kw) {
            return fn('passrcdRecordConflictReason')(kw.name, pass.parameters, rec.name) || null;
          }).forEach(function (f) { f.recordName = rec.name || null; out.push(f); });
        });
        return out;
      } },
    { code: 'isda.menuBarKey', scope: 'model', fns: ['mnuBarKeyConflictReason'],
      run: function (c) {
        var out = [];
        var allScopes = (c.model.records || []).map(function (r) { return r.keywords || []; });
        eachKeyword(c.fileKeywords, ['MNUBARSW', 'MNUCNL'], function (kw) {
          return fn('mnuBarKeyConflictReason')(kw.name, kw.parameters, c.fileKeywords, allScopes) || null;
        }).forEach(function (f) { out.push(f); });
        (c.model.records || []).forEach(function (rec) {
          eachKeyword(rec.keywords, ['MNUBARSW', 'MNUCNL'], function (kw) {
            return fn('mnuBarKeyConflictReason')(kw.name, kw.parameters, c.fileKeywords, [rec.keywords]) || null;
          }).forEach(function (f) { f.recordName = rec.name || null; out.push(f); });
        });
        return out;
      } },
    { code: 'isda.moubtnCommandKey', scope: 'model', fns: ['moubtnCommandKeyConflictReason'],
      run: function (c) {
        var exclusion = KeywordSpec.moubtnCommandKeyExclusion();
        if (!exclusion) return [];
        var names = ['MOUBTN'].concat(exclusion.partners.map(function (p) { return p.keyword; }));
        var out = [];
        var allScopes = (c.model.records || []).map(function (r) { return r.keywords || []; });
        eachKeyword(c.fileKeywords, names, function (kw) {
          return fn('moubtnCommandKeyConflictReason')({ name: kw.name, parameters: kw.parameters }, c.fileKeywords, allScopes) || null;
        }).forEach(function (f) { out.push(f); });
        (c.model.records || []).forEach(function (rec) {
          eachKeyword(rec.keywords, names, function (kw) {
            return fn('moubtnCommandKeyConflictReason')({ name: kw.name, parameters: kw.parameters }, c.fileKeywords, [rec.keywords]) || null;
          }).forEach(function (f) { f.recordName = rec.name || null; out.push(f); });
        });
        // The reason names both keywords, and is the same from either: one violation, on the first.
        var seen = {};
        return out.filter(function (f) { if (seen[f.reason]) return false; seen[f.reason] = true; return true; });
      } },
  ];

  /** Option indicators on a keyword that may not carry any: asked of each conditioned keyword with an empty
   *  old condition list. */
  function optionIndicators(keywords, level) {
    return eachKeyword(keywords, (keywords || []).filter(function (k) { return (k.conditions || []).length; }).map(function (k) { return k.name; }), function (kw) {
      if (!(kw.conditions || []).length) return null;
      return fn('noOptionIndicatorsNewConflictReason')(kw.name, [], kw.conditions, level);
    });
  }

  // ---------------------------------------------------------------------
  // The guards that stay out, each with the reason. A guard is either run (a rule above names it in `fns`)
  // or listed here; the E1a coverage test fails for any exported `*ConflictReason` that is neither.
  // ---------------------------------------------------------------------
  var EDIT_ONLY = {
    // old value against new value: with no edit there is nothing to compare
    valnumBasicEditConflictReason: 'compares a field\'s usage / data type before and after an edit; isda.valnumEligibility judges the field as it is',
    dateTimeFormatBasicEditConflictReason: 'a data-type change against the format keywords; isda.dateTimeFormat judges the field as it is',
    igcalttypBasicEditConflictReason: 'a usage / data-type change; isda.igcalttyp judges the field as it is',
    editKeywordDataTypeBasicEditConflictReason: 'a data-type change; isda.editKeywordDataType judges the field as it is',
    chridBasicEditConflictReason: 'a usage / decimals change; isda.chrid judges the field as it is',
    wrdwrapBasicEditConflictReason: 'a usage / data-type change; isda.wrdwrapField judges the field as it is',
    sflscrollBasicEditConflictReason: 'a definition change; isda.sflscrollField judges the field as it is',
    sflrcdnbrBasicEditConflictReason: 'a definition change; isda.sflrcdnbrField judges the field as it is',
    pshbtnfldRemovalConflictReason: 'removing PSHBTNFLD or its last PSHBTNCHC; isda.pshbtnfld reports a PSHBTNCHC without PSHBTNFLD',
    pshbtnfldNewConflictReason: 'blames keywords added to a field that already had PSHBTNFLD; isda.pshbtnfld reports the same fact from the field as it is',
    wrdwrapNewConflictReason: 'blames keywords added to a field that already had WRDWRAP; isda.wrdwrapField reports the same fact',
    edtmskConflictReason: 'asks "may this keyword be added" for any keyword name; isda.edtmskKeywords reports what the field has',
    sflchcctlReorderConflictReason: 'asks whether moving a field would break the first-field rule; there is no move in a source',
    referencedFieldResolveConflictReason: 'asks whether resolving a referenced field would break the field; chains the guards listed above',
    sflscrollSizeRecordEditConflictReason: 'a record edit against the SFLSCROLL field; isda.sflscrollField asks the same of the field with the record\'s keywords',
    // a sibling that sees the whole fact runs
    msgidSflNewConflictReason: 'a MSGID added to a subfile record; isda.msgidExclusion asks it with the record\'s keywords',
    msgidExclusionNewConflictReason: 'the same check as msgidExclusionConflictReason without the subfile clause; isda.msgidExclusion runs the full one',
    sflNxtchgSflchcctlConflictReason: 'asks it of the fields of one record; isda.sflctlNxtchg asks it from the control record, where SFLNXTCHG is',
    sflrcdnbrFieldConflictReason: 'the mutex of SFLRCDNBR and SFLROLVAL; isda.sflrcdnbrField asks it through sflrcdnbrNewConflictReason',
    passrcdWindowConflictReason: 'WINDOW is one of the passrcdRestrictedKeywords; isda.passrcdRecord covers it',
    wrdwrapReverseConflictReason: 'the reverse direction of isda.wrdwrapField',
    dateSeparatorConflictReason: 'called by dateTimeFormatNewConflictReason (isda.dateTimeFormat)',
    timeSeparatorConflictReason: 'called by dateTimeFormatNewConflictReason (isda.dateTimeFormat)',
    sflChoiceListConflictReason: 'the same mutex as sflChoiceListNewConflictReason, asked per keyword name (isda.sflChoiceList)',
    msgconConflictReason: 'asks "may this keyword be added" for any keyword name; isda.msgcon reports what the field has',
    igcalttypConflictReason: 'asks "may this keyword be added" for any keyword name; isda.igcalttyp reports what the field has',
    floatIncompatibleKeywordNewConflictReason: 'the shared body of the float rules, called by each (isda.floatField)',
    // answers for any keyword once the marker is there: right at edit time, wrong as a sweep
    usrdfnConflictReason: 'the USRDFN whitelist with another wording (isda.usrdfnWhitelist runs the registered one)',
    windowConflictReason: 'answers "yes" for any keyword name once the record has WINDOW; isda.windowMutex names the keywords',
  };

  /** Every export name a rule runs. */
  function runExports() {
    var out = [];
    RULES.forEach(function (r) { (r.fns || []).forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); }); });
    return out;
  }

  function coverage() {
    return { run: runExports(), editOnly: Object.keys(EDIT_ONLY), reasons: EDIT_ONLY };
  }

  function allCodes() { return RULES.map(function (r) { return r.code; }); }

  return { RULES: RULES, EDIT_ONLY: EDIT_ONLY, coverage: coverage, allCodes: allCodes, blame: blame };
});

/**
 * indicatorSim.js
 *
 * The pure logic behind the indicator simulator (roadmap epic E3). No vscode, no DOM: the same code runs in
 * Node for the tests and is inlined into the designer webview.
 *
 *   E3b  discovery   which indicators a screen (or the whole file) uses, labelled from INDTXT
 *   E3c  scenarios   named indicator sets - list operations on a plain array
 *   E3f  values      design-time values for the fields a program sets at run time - a namespaced store
 *
 * Persistence is the extension host's job (VS Code workspaceState, one entry per file, see extension.ts); this
 * module only normalises what comes back so a hand-edited or older state can never reach the webview in a
 * shape it does not expect. The DDS source is never written by any of it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dspfEngine.js'));
  } else {
    root.IndicatorSim = factory(root.DspfEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (DspfEngine) {
  'use strict';

  var MAX_SCENARIOS = 50;
  var MAX_SCENARIO_NAME = 40;
  var MAX_VALUE_TEXT = 256;
  var MAX_VALUES_PER_NAMESPACE = 2000;

  // ---------------------------------------------------------------------------------------------
  // Indicators
  // ---------------------------------------------------------------------------------------------

  /** '1', 1, '01', ' 07 ' -> '01' / '07'; anything outside 01 - 99 -> null. */
  function normalizeIndicator(value) {
    var text = String(value == null ? '' : value).trim();
    if (!/^\d{1,2}$/.test(text)) return null;
    var n = parseInt(text, 10);
    if (n < 1 || n > 99) return null;
    return (n < 10 ? '0' : '') + n;
  }

  /** Every number 01 - 99, in order. */
  function allIndicatorNumbers() {
    var out = [];
    for (var i = 1; i <= 99; i++) out.push((i < 10 ? '0' : '') + i);
    return out;
  }

  /** Sorted, de-duplicated, valid indicator numbers from an array / Set / iterable. */
  function normalizeIndicatorSet(values) {
    var seen = {};
    Array.from(values || []).forEach(function (v) {
      var n = normalizeIndicator(v);
      if (n) seen[n] = true;
    });
    return Object.keys(seen).sort();
  }

  function collectConditions(conditions, into) {
    (conditions || []).forEach(function (group) {
      (group.indicators || []).forEach(function (ind) { into[ind.number] = true; });
    });
  }

  function collectOwner(owner, into) {
    if (!owner) return;
    collectConditions(owner.conditions, into);
    (owner.keywords || []).forEach(function (k) { collectConditions(k.conditions, into); });
  }

  /** Indicators one record uses: its own conditions and keywords, its fields, its help entries. */
  function recordIndicators(record, into) {
    into = into || {};
    if (!record) return into;
    collectOwner(record, into);
    (record.fields || []).forEach(function (f) { collectOwner(f, into); });
    (record.helpEntries || []).forEach(function (f) { collectOwner(f, into); });
    return into;
  }

  function fileLevelIndicators(model, into) {
    (model && model.fileKeywords || []).forEach(function (k) { collectConditions(k.conditions, into); });
    return into;
  }

  /**
   * The indicators relevant to the record being previewed: the record, the other side of a subfile pairing only when
   * the SFLCTL side is on screen (it draws the SFL record's fields), an open pulldown's record, and the file-level
   * keywords (they apply to every record). Previewing an SFL record on its own never draws its SFLCTL's fields, so
   * that side's indicators are left out - they would do nothing when toggled.
   */
  function contextIndicators(model, recordName, activePulldownRecord) {
    var into = {};
    fileLevelIndicators(model, into);
    var records = (model && model.records) || [];
    recordIndicators(records.find(function (r) { return r.name === recordName; }), into);
    var pairing = model && DspfEngine && DspfEngine.findSflPairing ? DspfEngine.findSflPairing(model, recordName) : null;
    if (pairing && pairing.sflCtlRecord && pairing.sflCtlRecord.name === recordName) recordIndicators(pairing.sflRecord, into);
    if (activePulldownRecord) recordIndicators(records.find(function (r) { return r.name === activePulldownRecord; }), into);
    return Object.keys(into).sort();
  }

  /** Every indicator the whole file uses (file-level keywords and every record). */
  function fileIndicators(model) {
    var into = {};
    fileLevelIndicators(model, into);
    ((model && model.records) || []).forEach(function (r) { recordIndicators(r, into); });
    return Object.keys(into).sort();
  }

  /** "01 'Customer on hold'" -> { number: '01', text: 'Customer on hold' } (a doubled quote is one quote); else null. */
  function parseIndtxt(parameters) {
    var m = /^\s*(\d{1,2})\s+'((?:[^']|'')*)'\s*$/.exec(String(parameters == null ? '' : parameters));
    if (!m) return null;
    var number = normalizeIndicator(m[1]);
    if (!number) return null;
    return { number: number, text: m[2].replace(/''/g, "'") };
  }

  /** { '01': 'text' } from every INDTXT in the file (file, record, field, help level); the first one for an indicator wins. */
  function indicatorLabels(model) {
    var labels = {};
    var take = function (keywords) {
      (keywords || []).forEach(function (k) {
        if (k.name !== 'INDTXT') return;
        var parsed = parseIndtxt(k.parameters);
        if (parsed && !Object.prototype.hasOwnProperty.call(labels, parsed.number)) labels[parsed.number] = parsed.text;
      });
    };
    take(model && model.fileKeywords);
    ((model && model.records) || []).forEach(function (r) {
      take(r.keywords);
      (r.fields || []).forEach(function (f) { take(f.keywords); });
      (r.helpEntries || []).forEach(function (f) { take(f.keywords); });
    });
    return labels;
  }

  /**
   * The rows of the indicator list: { number, label, used, on }.
   *   opts.scope               'screen' (default) - what the previewed record uses - or 'file' - everything the file uses
   *   opts.showAll             list 01 - 99 (rows the scope does not use have used:false)
   *   opts.active              the indicators that are ON (Set / array)
   *   opts.activePulldownRecord  see contextIndicators
   * An indicator that is ON but not used by the scope still appears when showAll is set, because it is in the list of 99.
   */
  function indicatorEntries(model, recordName, opts) {
    opts = opts || {};
    var usedNumbers = opts.scope === 'file' ? fileIndicators(model) : contextIndicators(model, recordName, opts.activePulldownRecord);
    var used = {};
    usedNumbers.forEach(function (n) { used[n] = true; });
    var on = {};
    normalizeIndicatorSet(opts.active).forEach(function (n) { on[n] = true; });
    var labels = indicatorLabels(model);
    var numbers = opts.showAll ? allIndicatorNumbers() : usedNumbers;
    return numbers.map(function (n) {
      return { number: n, label: Object.prototype.hasOwnProperty.call(labels, n) ? labels[n] : '', used: !!used[n], on: !!on[n] };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Scenarios (E3c) - { name, indicators: ['01', ...] }, kept in the order they were created
  // ---------------------------------------------------------------------------------------------

  function cleanScenarioName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  }

  /** Array of { name, indicators } from anything: invalid entries, duplicate names (case-insensitive) and overflow dropped. */
  function normalizeScenarios(raw) {
    var out = [];
    var seen = {};
    (Array.isArray(raw) ? raw : []).forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      var name = cleanScenarioName(s.name);
      if (!name || name.length > MAX_SCENARIO_NAME) return;
      var key = name.toLowerCase();
      if (seen[key] || out.length >= MAX_SCENARIOS) return;
      seen[key] = true;
      out.push({ name: name, indicators: normalizeIndicatorSet(s.indicators) });
    });
    return out;
  }

  /** Why a name cannot be used, or '' when it can. exceptName is the scenario being renamed / overwritten. */
  function scenarioNameProblem(scenarios, name, exceptName) {
    var clean = cleanScenarioName(name);
    if (!clean) return 'Enter a name for the scenario.';
    if (clean.length > MAX_SCENARIO_NAME) return 'A scenario name is at most ' + MAX_SCENARIO_NAME + ' characters.';
    var except = exceptName == null ? null : cleanScenarioName(exceptName).toLowerCase();
    var clash = (scenarios || []).some(function (s) {
      var k = s.name.toLowerCase();
      return k === clean.toLowerCase() && k !== except;
    });
    return clash ? 'A scenario named "' + clean + '" already exists.' : '';
  }

  function findScenario(scenarios, name) {
    var key = cleanScenarioName(name).toLowerCase();
    return (scenarios || []).find(function (s) { return s.name.toLowerCase() === key; }) || null;
  }

  /**
   * Saves the indicator set under a name. A name that already exists is overwritten in place (same position);
   * a new name is appended. Returns { ok, scenarios, error }; scenarios is a new array, the input is untouched.
   */
  function saveScenario(scenarios, name, indicators) {
    var list = normalizeScenarios(scenarios);
    var clean = cleanScenarioName(name);
    if (!clean) return { ok: false, scenarios: list, error: 'Enter a name for the scenario.' };
    if (clean.length > MAX_SCENARIO_NAME) return { ok: false, scenarios: list, error: 'A scenario name is at most ' + MAX_SCENARIO_NAME + ' characters.' };
    var entry = { name: clean, indicators: normalizeIndicatorSet(indicators) };
    var existing = findScenario(list, clean);
    if (existing) {
      return { ok: true, scenarios: list.map(function (s) { return s === existing ? entry : s; }), error: '' };
    }
    if (list.length >= MAX_SCENARIOS) return { ok: false, scenarios: list, error: 'At most ' + MAX_SCENARIOS + ' scenarios can be saved for a file.' };
    return { ok: true, scenarios: list.concat([entry]), error: '' };
  }

  function renameScenario(scenarios, oldName, newName) {
    var list = normalizeScenarios(scenarios);
    var target = findScenario(list, oldName);
    if (!target) return { ok: false, scenarios: list, error: 'That scenario no longer exists.' };
    var problem = scenarioNameProblem(list, newName, oldName);
    if (problem) return { ok: false, scenarios: list, error: problem };
    var clean = cleanScenarioName(newName);
    return { ok: true, scenarios: list.map(function (s) { return s === target ? { name: clean, indicators: s.indicators } : s; }), error: '' };
  }

  function deleteScenario(scenarios, name) {
    var list = normalizeScenarios(scenarios);
    var target = findScenario(list, name);
    if (!target) return { ok: false, scenarios: list, error: 'That scenario no longer exists.' };
    return { ok: true, scenarios: list.filter(function (s) { return s !== target; }), error: '' };
  }

  // ---------------------------------------------------------------------------------------------
  // Program-to-system values (E3f)
  //
  // The store is { namespace: { key: value } }. A namespace belongs to one feature and says what a valid key and
  // value look like, so a stored value can never be a shape its reader does not understand. Later features (E4c
  // message data, E8 window position / size, SFLSIZ) register a namespace here; values under an unknown namespace
  // are dropped on load, which is the safe direction for a state that comes from disk.
  // ---------------------------------------------------------------------------------------------

  var VALUE_NAMESPACES = {
    // CHCCTL / SFLCHCCTL control value; key = DspfEngine.choiceStateKey(record, field, choice number or row)
    choiceControl: {
      label: 'Choice control value (CHCCTL / SFLCHCCTL)',
      keyPattern: /^[^|]+\|[^|]+\|[1-9]\d*$/,
      kind: 'integer',
      min: 0,
      max: 4
    },
    // CSRLOC(line-field position-field): the value one of the two program fields holds when the record is written;
    // key = DspfEngine.cursorLocationKey(record, field). 3-byte zoned decimal fields, so 0 - 999 (the engine ignores a
    // value outside the screen, as the Reference says the keyword is then ignored).
    cursorLocation: {
      label: 'Cursor location field value (CSRLOC)',
      keyPattern: /^[^|]+\|[^|]+$/,
      kind: 'integer',
      min: 0,
      max: 999
    },
    // E4c: the value a program sets in a character field a message keyword names: the msg-data field of ERRMSGID /
    // SFLMSGID (replacement text, read as values for &1, &2 ... separated by '|') and the message-id / file / library
    // fields of MSGID (the plain text); key = DspfEngine.messageDataKey(record, field). Up to 256 characters, the
    // largest message data a message can take.
    messageData: {
      label: 'Message keyword field value (ERRMSGID / SFLMSGID / MSGID)',
      keyPattern: /^[^|]+\|[^|]+$/,
      kind: 'text'
    },
    // WINDOW(*DFT ...) / WINDOW(&line-field &position-field ...) (E8): the start line or start position the preview
    // gives a runtime-valued window; key = DspfEngine.windowStartKey(record, 'line' | 'position'). Largest display is
    // 27 x 132, so 1 - 132; whether a value fits THIS window on THIS display is DspfEngine.windowStartProblem's job.
    windowStart: {
      label: 'Window start line / position (WINDOW)',
      keyPattern: /^[^|]+\|(LINE|POSITION)$/,
      kind: 'integer',
      min: 1,
      max: 132
    }
  };

  function validateValue(spec, value) {
    if (spec.kind === 'integer') {
      var n = typeof value === 'number' ? value : (typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? parseInt(value, 10) : NaN);
      if (!isFinite(n) || Math.floor(n) !== n) return { ok: false };
      if (spec.min != null && n < spec.min) return { ok: false };
      if (spec.max != null && n > spec.max) return { ok: false };
      return { ok: true, value: n };
    }
    if (spec.kind === 'text') {
      if (typeof value !== 'string' || value.length > MAX_VALUE_TEXT) return { ok: false };
      return { ok: true, value: value };
    }
    return { ok: false };
  }

  function emptyValues() {
    return {};
  }

  /** A clean store from anything: unknown namespaces, malformed keys and out-of-range values are dropped. */
  function normalizeValues(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(VALUE_NAMESPACES).forEach(function (ns) {
      var spec = VALUE_NAMESPACES[ns];
      var src = raw[ns];
      if (!src || typeof src !== 'object') return;
      var kept = {};
      var count = 0;
      Object.keys(src).forEach(function (key) {
        if (count >= MAX_VALUES_PER_NAMESPACE || !spec.keyPattern.test(key)) return;
        var v = validateValue(spec, src[key]);
        if (!v.ok) return;
        kept[key] = v.value;
        count++;
      });
      if (count > 0) out[ns] = kept;
    });
    return out;
  }

  /** The stored value, or undefined when none is set. */
  function getValue(values, namespace, key) {
    var ns = values && values[namespace];
    return ns && Object.prototype.hasOwnProperty.call(ns, key) ? ns[key] : undefined;
  }

  /** The whole namespace as { key: value } (a copy; {} when nothing is stored) - what an engine reads. */
  function namespaceValues(values, namespace) {
    var ns = values && values[namespace];
    return ns ? Object.assign({}, ns) : {};
  }

  /**
   * A new store with one value set, or removed when value is null / undefined / ''. Returns { ok, values, error }.
   * An unknown namespace, a malformed key or an out-of-range value is refused and the store is returned unchanged.
   */
  function setValue(values, namespace, key, value) {
    var current = normalizeValues(values);
    var spec = VALUE_NAMESPACES[namespace];
    if (!spec) return { ok: false, values: current, error: 'Unknown value namespace "' + namespace + '".' };
    if (!spec.keyPattern.test(String(key))) return { ok: false, values: current, error: 'Not a valid key for ' + spec.label + '.' };
    var next = Object.assign({}, current);
    var ns = Object.assign({}, next[namespace] || {});
    if (value === null || value === undefined || value === '') {
      delete ns[key];
    } else {
      var v = validateValue(spec, value);
      if (!v.ok) return { ok: false, values: current, error: 'Not a valid value for ' + spec.label + '.' };
      if (!Object.prototype.hasOwnProperty.call(ns, key) && Object.keys(ns).length >= MAX_VALUES_PER_NAMESPACE) {
        return { ok: false, values: current, error: 'Too many stored values for ' + spec.label + '.' };
      }
      ns[key] = v.value;
    }
    if (Object.keys(ns).length === 0) delete next[namespace]; else next[namespace] = ns;
    return { ok: true, values: next, error: '' };
  }

  /** A new store without one namespace's values (all namespaces when none is named). */
  function clearValues(values, namespace) {
    if (!namespace) return {};
    var next = Object.assign({}, normalizeValues(values));
    delete next[namespace];
    return next;
  }

  /** Flat rows for the editor: { namespace, label, key, value }, ordered by namespace then key. */
  function valueRows(values) {
    var clean = normalizeValues(values);
    var rows = [];
    Object.keys(VALUE_NAMESPACES).forEach(function (ns) {
      Object.keys(clean[ns] || {}).sort().forEach(function (key) {
        rows.push({ namespace: ns, label: VALUE_NAMESPACES[ns].label, key: key, value: clean[ns][key] });
      });
    });
    return rows;
  }

  /** A readable name for a stored key: 'REC|FLD|2' -> 'REC.FLD (choice 2)'. */
  function describeValueKey(namespace, key) {
    var parts = String(key).split('|');
    if (namespace === 'choiceControl' && parts.length === 3) return parts[0] + '.' + parts[1] + ' (choice / row ' + parts[2] + ')';
    if (namespace === 'cursorLocation' && parts.length === 2) return parts[0] + '.' + parts[1] + ' (CSRLOC)';
    if (namespace === 'messageData' && parts.length === 2) return parts[0] + '.' + parts[1] + ' (message value)';
    if (namespace === 'windowStart' && parts.length === 2) return parts[0] + ' (window start ' + parts[1].toLowerCase() + ')';
    return String(key);
  }

  // ---------------------------------------------------------------------------------------------
  // The persisted state of one file: { scenarios, values }
  // ---------------------------------------------------------------------------------------------

  function normalizeState(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    return { scenarios: normalizeScenarios(src.scenarios), values: normalizeValues(src.values) };
  }

  function isEmptyState(state) {
    var s = normalizeState(state);
    return s.scenarios.length === 0 && Object.keys(s.values).length === 0;
  }

  // ---------------------------------------------------------------------------------------------
  // Storage (E3c decision): VS Code workspaceState, one entry per file, under one key. workspaceState was chosen over
  // an optional sidecar file because the state is a design aid and not part of the project - nothing is added to the
  // repository or next to the DDS member (which may be a remote IBM i member that has no sibling files at all) and
  // nothing but the extension can leave it stale. The cost - it does not follow the project to another machine - is
  // accepted; a sidecar can be added later behind the same two functions. These take anything with get / update
  // (a vscode.Memento, or a plain fake in the tests).
  // ---------------------------------------------------------------------------------------------

  var STATE_KEY = 'isda.simulatorState';
  var MAX_STORED_FILES = 200;

  function loadFileState(memento, fileKey) {
    var all = memento && typeof memento.get === 'function' ? memento.get(STATE_KEY) : null;
    var entry = all && typeof all === 'object' ? all[fileKey] : null;
    return normalizeState(entry);
  }

  /** Stores the state for one file (an empty state removes the entry); the most recently saved MAX_STORED_FILES files are kept. */
  function saveFileState(memento, fileKey, state) {
    var all = memento && typeof memento.get === 'function' ? memento.get(STATE_KEY) : null;
    var next = {};
    Object.keys(all && typeof all === 'object' ? all : {}).forEach(function (k) { if (k !== fileKey) next[k] = all[k]; });
    var clean = normalizeState(state);
    if (!isEmptyState(clean)) next[fileKey] = clean;
    var keys = Object.keys(next);
    if (keys.length > MAX_STORED_FILES) keys.slice(0, keys.length - MAX_STORED_FILES).forEach(function (k) { delete next[k]; });
    return memento.update(STATE_KEY, Object.keys(next).length ? next : undefined);
  }

  return {
    STATE_KEY: STATE_KEY,
    MAX_STORED_FILES: MAX_STORED_FILES,
    loadFileState: loadFileState,
    saveFileState: saveFileState,
    MAX_SCENARIOS: MAX_SCENARIOS,
    MAX_SCENARIO_NAME: MAX_SCENARIO_NAME,
    VALUE_NAMESPACES: VALUE_NAMESPACES,
    normalizeIndicator: normalizeIndicator,
    normalizeIndicatorSet: normalizeIndicatorSet,
    allIndicatorNumbers: allIndicatorNumbers,
    contextIndicators: contextIndicators,
    fileIndicators: fileIndicators,
    parseIndtxt: parseIndtxt,
    indicatorLabels: indicatorLabels,
    indicatorEntries: indicatorEntries,
    normalizeScenarios: normalizeScenarios,
    scenarioNameProblem: scenarioNameProblem,
    findScenario: findScenario,
    saveScenario: saveScenario,
    renameScenario: renameScenario,
    deleteScenario: deleteScenario,
    emptyValues: emptyValues,
    normalizeValues: normalizeValues,
    getValue: getValue,
    namespaceValues: namespaceValues,
    setValue: setValue,
    clearValues: clearValues,
    valueRows: valueRows,
    describeValueKey: describeValueKey,
    normalizeState: normalizeState,
    isEmptyState: isEmptyState
  };
});

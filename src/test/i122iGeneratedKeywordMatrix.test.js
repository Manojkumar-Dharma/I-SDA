/**
 * i122iGeneratedKeywordMatrix.test.js
 *
 * Task I-122i - the generated keyword x dimension matrix. Unlike the hand-written I-122
 * batches, nothing here names a keyword: the cells are generated at test time from
 * `KeywordSpec.RECORD_TYPES` and the DDS Reference text (helpers/keywordMatrix.js), for every
 * keyword no hand-written I-122 file mentions (MATRIX_ALL=1 runs all of them).
 *
 *   L1  spec vs reference vs writer: the keyword has a Reference section; the spec's levels,
 *       option-indicator mode and "no parameters" agree with what the section says and with the
 *       writer's own tables (noOptionIndicatorsReason, optionIndicatorsAllowed, takesNoParameters).
 *   L2  parse / write round trip at every file / record / field level the keyword is valid at:
 *       parse finds it at that level (parameters byte-exact, the option indicator carried), the
 *       writer re-serialises the unchanged keyword list to the same text, and removing the
 *       keyword leaves its neighbours' lines alone.
 *   L3  display (jsdom): the keyword's chip is listed, "No option indicators" instead of a
 *       Conditioning toggle exactly where option indicators are not valid, and a warning when a
 *       hand-written keyword carries one it may not.
 *   L4  commit (jsdom, raw keyword editor): a bare add of an unconstrained keyword is accepted;
 *       every other add is either written with the keyword present or refused with a reason -
 *       never both, never neither.
 *
 * Disagreements the matrix finds are NOT asserted as correct. They are listed in KNOWN_GAPS with
 * the task that logs them, so a new disagreement fails here while a known one is reported.
 *
 * Run with: node src/test/i122iGeneratedKeywordMatrix.test.js
 */
'use strict';
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const M = require('./helpers/keywordMatrix');

const SELF = path.basename(__filename);
const ALL = !!process.env.MATRIX_ALL;
const names = M.matrixKeywords({ all: ALL, selfFile: SELF });
const facts = names.map((n) => M.resolve(n));

// Disagreements found while generating the matrix, each logged as a task in keywordFixes.md.
// key: '<KEYWORD>:<cell>' -> the task. A listed gap is reported, not asserted; an unlisted one fails.
const KNOWN_GAPS = {};
const gapReported = [];
function gap(keyword, cell, ok, label) {
  const id = keyword + ':' + cell;
  if (ok) { check(label, true); return; }
  if (KNOWN_GAPS[id]) { gapReported.push(id + ' (' + KNOWN_GAPS[id] + ')'); return; }
  check(label, false);
}

const parse = (t) => DspfParser.parseDspf(t);
const kwOf = (kws, n) => (kws || []).filter((k) => k.name === n);
const levelArg = (level) => (level === 'file' ? 'file' : undefined);

console.log('=== inventory ===');
console.log('  keywords in RECORD_TYPES:', Object.keys(require('../keywordSpec.js').RECORD_TYPES).length);
console.log('  keywords in this matrix :', names.length + (ALL ? ' (MATRIX_ALL)' : ''));
check('the matrix has keywords to run on (or MATRIX_ALL is set)', names.length > 0);

const noLevels = facts.filter((f) => !f.levels);
const helpOnly = facts.filter((f) => f.levels && f.placeable.length === 0);
console.log('  no levels fact in spec or reference (L2-L4 skipped):', noLevels.map((f) => f.name).join(' ') || '-');
console.log('  help-specification level only (covered by the help batch):', helpOnly.map((f) => f.name).join(' ') || '-');

console.log('\n=== L1 spec vs reference vs writer ===');
const refSilentOI = [];
const refSilentParams = [];
facts.forEach((f) => {
  const n = f.name;
  // The reference section exists, except for the few keywords the reference documents under another heading.
  if (!f.ref.found) return;
  check(n + ': the Reference section was found and is not empty', f.ref.text.length > 40);

  // levels
  if (f.spec.levels && f.ref.levels) {
    gap(n, 'levels', JSON.stringify(f.spec.levels) === JSON.stringify(f.ref.levels),
      n + ': spec levels ' + f.spec.levels.join('/') + ' = Reference levels ' + f.ref.levels.join('/'));
  }

  // option indicators: only an explicit sentence in the section is compared
  const oi = f.spec.optionIndicators;
  const refOI = f.ref.optionIndicators;
  if (refOI === 'notValid' || refOI === 'valid') {
    (f.placeable.length ? f.placeable : ['record']).forEach((lv) => {
      const mode = oi && oi[lv];
      if (!mode) return;
      const specSays = mode === 'notValid' ? 'notValid' : 'valid';
      gap(n, 'oi-' + lv, specSays === refOI, n + ' (' + lv + '): spec option indicators ' + mode + ' agree with the Reference (' + refOI + ')');
    });
  } else if (oi) {
    refSilentOI.push(n);
  }

  // parameters: compared when the section speaks to them (says "no parameters", shows NAME(...), or mentions parameters)
  if (f.spec.parameters === 'none') {
    const speaks = f.ref.noParameters || new RegExp(n + '\\(').test(f.ref.text) || /\bparameters?\b/i.test(f.ref.text);
    if (speaks) {
      gap(n, 'params', f.ref.noParameters, n + ': spec says no parameters; the Reference says "This keyword has no parameters"');
    } else {
      refSilentParams.push(n);
    }
  }
});

facts.forEach((f) => {
  const n = f.name;
  const oi = f.spec.optionIndicators;
  if (oi) {
    f.placeable.forEach((lv) => {
      const mode = oi[lv];
      if (!mode) return;
      const reason = DspfWriter.noOptionIndicatorsReason(n, levelArg(lv));
      gap(n, 'writer-oi-' + lv, (mode === 'notValid') === !!reason,
        n + ' (' + lv + '): the writer ' + (reason ? 'refuses' : 'allows') + ' option indicators, spec says ' + mode);
    });
  }
  if (f.spec.parameters) {
    gap(n, 'writer-params', DspfWriter.takesNoParameters(n) === (f.spec.parameters === 'none'),
      n + ': DspfWriter.takesNoParameters agrees with the spec (' + f.spec.parameters + ')');
  }
});
console.log('  option indicators stated by the spec but not in the Reference section (not compared):', refSilentOI.join(' ') || '-');
console.log('  "no parameters" stated by the spec, Reference section silent (not compared):', refSilentParams.join(' ') || '-');

console.log('\n=== L2 parse / write round trip ===');
let l2Cells = 0;
facts.forEach((f) => {
  f.placeable.forEach((level) => {
    const n = f.name;
    const { source } = M.placement(f, level);
    const lines = source.split('\n');
    const model = parse(source);
    const rec = model.records[0];
    const owner = level === 'file' ? model : level === 'record' ? rec : rec.fields[0];
    const list = level === 'file' ? model.fileKeywords : owner.keywords;
    const mine = kwOf(list, n);
    const tag = n + ' @' + level;
    l2Cells++;
    check(tag + ': parsed twice (bare, then under N10), nothing else lost', mine.length === 2 && list.length === 2);
    if (mine.length !== 2) return;
    const wantParams = f.bare ? '' : M.SAMPLE_PARAMETER;
    check(tag + ': parameters are byte-exact (' + (f.bare ? 'none' : wantParams) + ')', mine.every((k) => k.parameters === wantParams));
    check(tag + ': the second one carries indicator 10 negated, the first no condition',
      mine[0].conditions.length === 0 && mine[1].conditions.length === 1 &&
      mine[1].conditions[0].indicators[0].number === '10' && mine[1].conditions[0].indicators[0].not === true);

    // write the unchanged list back: the same keywords come back, and a second write changes nothing
    // (the writer may move the first unconditioned keyword onto the R / field line - that is its format)
    const write = (m, ls, kws) => {
      const r0 = m.records[0];
      if (level === 'file') return DspfWriter.applyFileKeywordsUpdate(m, ls, kws);
      if (level === 'record') return DspfWriter.applyRecordUpdate(r0, ls, { keywords: kws });
      return DspfWriter.applyFieldUpdate(r0.fields[0], ls, { keywords: kws });
    };
    const listOf = (m) => (level === 'file' ? m.fileKeywords : level === 'record' ? m.records[0].keywords : m.records[0].fields[0].keywords);
    const shape = (kws) => JSON.stringify(kws.map((k) => [k.name, k.parameters, k.conditions.map((c) => c.indicators.map((i) => (i.not ? 'N' : '') + i.number))]));
    const out = write(model, lines, list);
    const again = parse(out.join('\n') + '\n');
    check(tag + ': writing the unchanged keyword list back re-parses to the same keywords (name, parameters, conditions)', shape(listOf(again)) === shape(list));
    const out2 = write(again, out, listOf(again));
    check(tag + ': a second write is a fixed point', out2.join('\n') === out.join('\n'));
    check(tag + ': the record and field survive the write', again.records.length === 1 && again.records[0].fields.length === 1 && again.records[0].name === 'REC1');

    // a neighbour added to the list is written, and this keyword's two entries are unchanged
    const probe = { name: 'ZPROBE', parameters: '', conditions: [], raw: '', sourceLines: [] };
    const grown = parse(write(model, lines, list.concat([probe])).join('\n') + '\n');
    check(tag + ': adding a neighbour keyword writes it and keeps both entries of this one',
      kwOf(listOf(grown), 'ZPROBE').length === 1 && shape(kwOf(listOf(grown), n)) === shape(mine));

    // remove both: only this keyword's lines go
    const rest = list.filter((k) => k.name !== n);
    let cut;
    if (level === 'file') cut = DspfWriter.applyFileKeywordsUpdate(model, lines, rest);
    else if (level === 'record') cut = DspfWriter.applyRecordUpdate(rec, lines, { keywords: rest });
    else cut = DspfWriter.applyFieldUpdate(owner, lines, { keywords: rest });
    const cutModel = parse(cut.join('\n') + '\n');
    const cutRec = cutModel.records[0];
    const cutList = level === 'file' ? cutModel.fileKeywords : level === 'record' ? cutRec.keywords : cutRec.fields[0].keywords;
    check(tag + ': removing it leaves no trace of it, and the record and field survive',
      kwOf(cutList, n).length === 0 && cutModel.records.length === 1 && cutRec.fields.length === 1 && cutRec.name === 'REC1');
  });
});
console.log('  L2 cells generated:', l2Cells);


// ---------------------------------------------------------------------------------------------
// L3 / L4: one composite source holds every keyword at every level it is valid at, so a single
// jsdom page serves all the display and commit cells.
// ---------------------------------------------------------------------------------------------
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const { dds, R, FLD, K, KI } = M;

const fileKw = facts.filter((f) => f.placeable.includes('file'));
const recKw = facts.filter((f) => f.placeable.includes('record'));
const fldKw = facts.filter((f) => f.placeable.includes('field'));

const lines = [];
fileKw.forEach((f) => { lines.push(K(M.keywordText(f)), KI(M.keywordText(f))); });
const recName = {};
recKw.forEach((f, i) => {
  recName[f.name] = 'RK' + String(i).padStart(3, '0');
  lines.push(R(recName[f.name]), K(M.keywordText(f)), KI(M.keywordText(f)), FLD('F1', 1));
});
const fieldAt = {};      // keyword -> { record, field name }
const PER_REC = 8;
fldKw.forEach((f, i) => {
  const g = Math.floor(i / PER_REC);
  if (i % PER_REC === 0) lines.push(R('RF' + String(g).padStart(3, '0')));
  const fname = 'FK' + String(i).padStart(3, '0');
  fieldAt[f.name] = { record: 'RF' + String(g).padStart(3, '0'), field: fname, row: 1 + (i % PER_REC) * 2 };
  lines.push(FLD(fname, fieldAt[f.name].row), K(M.keywordText(f)), KI(M.keywordText(f)));
});
lines.push(R('HOST'), FLD('HF1', 1));
const SOURCE = lines.join('\n') + '\n';
const model = parse(SOURCE);
const fieldLine = {};   // keyword -> source line of its field
fldKw.forEach((f) => {
  const rec = model.records.find((r) => r.name === fieldAt[f.name].record);
  fieldLine[f.name] = rec.fields.find((x) => x.name === fieldAt[f.name].field).sourceLine;
});
const hostRec = model.records.find((r) => r.name === 'HOST');
check('composite source parses with every placement (' + fileKw.length + ' file, ' + recKw.length + ' record, ' + fldKw.length + ' field)',
  model.fileKeywords.length === fileKw.length * 2 && recKw.every((f) => model.records.some((r) => r.name === recName[f.name] && kwOf(r.keywords, f.name).length === 2)) &&
  fldKw.every((f) => !!fieldLine[f.name]));

const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => { alerts.push(String(m)); };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const sel = doc.getElementById('recordSelect');
  const selectRecord = (name) => { sel.value = name; fire(sel); };
  const selectField = (line) => { const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]'); if (box) box.click(); return !!box; };
  const showFile = () => fire(doc.getElementById('crumb-file'), 'click');
  const rowsOf = (owner, name) => Array.from(doc.querySelectorAll('#kwed-' + owner + ' .kw-row')).filter((row) => {
    const t = row.querySelector('.keyword-chip').textContent;
    return t.startsWith(name) && /^[(\u00d7]/.test(t.slice(name.length));
  });
  const lastEdit = () => posted.filter((m) => m.type === 'applyEdit').pop();

  console.log('\n=== L3 display: the raw keyword list of each owner ===');
  function displayCells(f, level, owner) {
    const rows = rowsOf(owner, f.name);
    const tag = f.name + ' @' + level;
    check(tag + ': listed twice in the raw keyword list (bare, then under N10)', rows.length === 2);
    if (rows.length !== 2) return;
    const reason = DspfWriter.noOptionIndicatorsReason(f.name, levelArg(level));
    const bareNone = !!rows[0].querySelector('.kw-cond-none');
    const bareToggle = !!rows[0].querySelector('.kw-cond-toggle');
    check(tag + ': bare - ' + (reason ? '"No option indicators" in place of the Conditioning toggle' : 'a Conditioning toggle'),
      reason ? (bareNone && !bareToggle) : (bareToggle && !bareNone));
    const condToggle = rows[1].querySelector('.kw-cond-toggle');
    check(tag + ': under N10 - the Conditioning toggle stays and shows (1)', !!condToggle && /Conditioning\s*\(1\)/.test(condToggle.textContent));
    check(tag + ': under N10 - ' + (reason ? 'flagged with a warning' : 'no warning'), reason ? !!rows[1].parentElement.querySelector('.kw-cond-warning') || !!rows[1].nextElementSibling && rows[1].nextElementSibling.classList.contains('kw-cond-warning') : !rows[1].nextElementSibling || !rows[1].nextElementSibling.classList.contains('kw-cond-warning'));
    const oi = f.spec.optionIndicators && f.spec.optionIndicators[level];
    if (oi) gap(f.name, 'ui-oi-' + level, (oi === 'notValid') === !!reason, tag + ': the UI hides the toggle exactly where the spec says option indicators are not valid (' + oi + ')');
  }
  showFile();
  fileKw.forEach((f) => displayCells(f, 'file', 'file'));
  recKw.forEach((f) => { selectRecord(recName[f.name]); displayCells(f, 'record', 'record-' + recName[f.name]); });
  fldKw.forEach((f) => {
    selectRecord(fieldAt[f.name].record);
    if (!selectField(fieldLine[f.name])) { check(f.name + ' @field: its field is on the canvas', false); return; }
    displayCells(f, 'field', 'field-' + fieldLine[f.name]);
  });

  console.log('\n=== L4 commit: the raw keyword editor, one add per keyword and level ===');
  const outcome = { accepted: 0, refused: 0 };
  function rawAdd(owner, f) {
    doc.getElementById(owner + '-new-kw-name').value = f.name;
    const pe = doc.getElementById(owner + '-new-kw-params');
    if (pe) pe.value = f.bare ? '' : M.SAMPLE_PARAMETER.replace(/^'|'$/g, "'");
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
    const e = lastEdit();
    return { text: e ? e.text : null, alert: alerts.length ? alerts[alerts.length - 1] : null };
  }
  // The webview applies its own edit to its in-page model, so adds would accumulate; each cell starts from
  // the composite source again. The first externalUpdate is swallowed as the echo of an own edit (and applies
  // when nothing was posted), the second always applies.
  function resetPage() {
    for (let i = 0; i < 2; i++) dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'externalUpdate', text: SOURCE } }));
  }
  const unconstrained = (f) => f.bare && f.spec.found && f.spec.constraints.length === 0;
  function commitCells(f, level, owner) {
    const tag = f.name + ' @' + level;
    const r = rawAdd(owner, f);
    resetPage();
    const written = r.text !== null;
    check(tag + ': a raw add is either written or refused with a reason, never both and never neither', written !== (r.alert !== null) && (r.alert === null || r.alert.length > 0));
    if (written) {
      const m = parse(r.text);
      const rec = level === 'file' ? null : m.records.find((x) => x.name === 'HOST');
      const list = level === 'file' ? m.fileKeywords : level === 'record' ? rec.keywords : rec.fields[0].keywords;
      const added = kwOf(list, f.name);
      const before = level === 'file' ? kwOf(model.fileKeywords, f.name).length : 0;
      const sizeOk = level === 'file' ? list.length === model.fileKeywords.length + 1 : list.length === 1;
      if (process.env.MATRIX_DEBUG && !(added.length === before + 1 && sizeOk)) console.log('    debug', tag, 'added', added.length, 'before', before, 'list', list.map((k) => k.name).join(), 'records', m.records.length, model.records.length);
      check(tag + ': written - exactly one new ' + f.name + ' at the ' + level + ' level, nothing else lost',
        added.length === before + 1 && m.records.length === model.records.length && sizeOk);
      outcome.accepted++;
    } else {
      outcome.refused++;
      if (unconstrained(f)) gap(f.name, 'commit-' + level, false, tag + ': a bare add of a keyword with no relational constraint is accepted (refused: ' + r.alert + ')');
    }
    if (written && unconstrained(f)) check(tag + ': a bare add of a keyword with no relational constraint is accepted', true);
  }
  fileKw.forEach((f) => { showFile(); commitCells(f, 'file', 'file'); });
  recKw.forEach((f) => { selectRecord('HOST'); commitCells(f, 'record', 'record-HOST'); });
  const hostField = hostRec.fields[0];
  fldKw.forEach((f) => {
    selectRecord('HOST');
    if (!selectField(hostField.sourceLine)) { check(f.name + ' @field: the host field is on the canvas', false); return; }
    commitCells(f, 'field', 'field-' + hostField.sourceLine);
  });
  console.log('  L4 outcomes: ' + outcome.accepted + ' written, ' + outcome.refused + ' refused with a reason');

  if (gapReported.length) console.log('\n  known gaps reported (not asserted): ' + gapReported.join(', '));
  console.log('\n  failures:', failureCount());
  process.exit(failureCount() === 0 ? 0 : 1);
}, 1500);

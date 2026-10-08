/**
 * helpers/keywordMatrix.js - the generator behind the I-122i keyword x dimension matrix.
 *
 * The matrix is generated at TEST TIME from `KeywordSpec.RECORD_TYPES` plus the IBM DDS
 * Reference text in the repo (decision recorded in I-122i: nothing generated is committed,
 * so a spec change moves the matrix with it and there is no second copy to drift).
 *
 *   referenceFacts(name)   what the keyword's own DDS Reference section says, extracted by
 *                          fixed patterns: levels, option-indicator statement, "no parameters"
 *   specFacts(name)        what the spec entry says, normalised: levels, option indicators
 *                          (per level), parameters; plus which constraint facts it carries
 *   resolve(name)          the facts the cells run on: spec first, reference where the spec has
 *                          no `levels`; every fact is tagged with where it came from
 *   matrixKeywords(opts)   the keyword names the matrix covers (default: those no other
 *                          hand-written I-122 file mentions; MATRIX_ALL=1 runs all 175)
 *   build*Source(...)      fixed-column DDS sources that place a keyword at a level
 *
 * Nothing here asserts anything; the test file does.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../../keywordSpec.js'));

const T = KeywordSpec.RECORD_TYPES;
const REF_PATH = path.join(__dirname, '../../../docs/sda-reference/source/DDS_Keyword_V7r6.txt');

// ---- the reference text -------------------------------------------------------------------

let sectionCache = null;
/** { NAME: normalised section text } - each "NAME (Title) keyword for display files" heading to the next. */
function referenceSections() {
  if (sectionCache) return sectionCache;
  const lines = fs.readFileSync(REF_PATH, 'utf8').replace(/\f/g, ' ').split('\n');
  const all = [];
  lines.forEach((l, i) => {
    const m = /^([A-Z][A-Z0-9]*) \(([^)]+)\) keyword for (display files|menu)\s*$/.exec(l.trim());
    if (m) all.push({ name: m[1], i: i, flush: /^\S/.test(l) });
  });
  // The page running header repeats a section's heading, indented, in the middle of the section; where a
  // name also has an unindented heading, only the unindented ones start and end a section (I-191).
  const flushNames = new Set(all.filter((h) => h.flush).map((h) => h.name));
  const heads = all.filter((h) => h.flush || !flushNames.has(h.name));
  const out = {};
  heads.forEach((h, j) => {
    const end = j + 1 < heads.length ? heads[j + 1].i : lines.length;
    if (!out[h.name]) out[h.name] = lines.slice(h.i + 1, end).join(' ').replace(/\s+/g, ' ');
  });
  sectionCache = out;
  return out;
}

/** The levels the section's first "...level..." sentence names: file / record / field / help. */
function referenceLevels(text) {
  const s = text.slice(0, 600);
  const sent = /[^.]*\blevel\b[^.]*\./.exec(s);
  if (!sent) return null;
  const out = new Set();
  for (const m of sent[0].matchAll(/\b(file|record|field|help-specification)(?:-level|\s+level|-(?:,|\s)|,)/gi)) {
    out.add(m[1].toLowerCase() === 'help-specification' ? 'help' : m[1].toLowerCase());
  }
  for (const m of sent[0].matchAll(/\b(file|record|field)-\s*(?:,\s*)?(?:or|and)\b/gi)) out.add(m[1].toLowerCase());
  return Array.from(out).sort();
}

/**
 * What the section says about option indicators: 'notValid' (the exact "not valid for this
 * keyword" sentence), 'valid' ("are valid for this keyword" / "are allowed on this keyword"),
 * 'ambiguous' (both - the section talks about another keyword's indicators too) or 'silent'.
 */
function referenceOptionIndicators(text) {
  const notValid = /Option indicators are not valid for this keyword/.test(text);
  const valid = /Option indicators are (?:valid for|allowed on) this keyword/.test(text);
  if (notValid && valid) return 'ambiguous';
  if (notValid) return 'notValid';
  if (valid) return 'valid';
  return 'silent';
}

function referenceFacts(name) {
  const text = referenceSections()[name];
  if (!text) return { found: false };
  return {
    found: true,
    text: text,
    levels: referenceLevels(text),
    optionIndicators: referenceOptionIndicators(text),
    noParameters: /This keyword has no parameters/.test(text),
  };
}

// ---- the spec ------------------------------------------------------------------------------

// Facts that tie a keyword to another keyword, record type, usage or data type: a bare add of a
// keyword carrying any of them may legitimately be refused, so the "must be accepted" cell skips it.
const CONSTRAINT_FACTS = [
  'requiresOnRecord', 'requiresInFile', 'requiresHelpSpecification', 'requiresRecordKeyword', 'requiresKeywordAtLevels',
  'requiresWithSflinz', 'requiresBareKeyword', 'requiresReferenceFlag', 'requiredFor', 'requiredOnSubfileControl',
  'excludesOnRecord', 'excludesOnFileAndRecord', 'excludesInFile', 'excludesOnRecordTypes', 'excludesWithKeyword',
  'excludesWhenSizeEqualsPage', 'excludesWithFieldSelection', 'mutex', 'conditionalMutex', 'notOnRecordTypes',
  'notAllowedInRecordType', 'notAllowedInRecordTypes', 'notAtBothFileAndRecordLevel', 'passrcdRestricted',
  'cannotCoexistWith', 'notInSubfile', 'onRecordType', 'allowedUsage', 'allowedDataTypes', 'requiredDataTypes',
  'blockedDataTypes', 'constantFieldOnly', 'validOnlyOnConstantField', 'validOnlyInSubfileControlRecord',
  'crossRecordExclusion', 'ineligibleUsage', 'ineligibleOnConstant', 'notAllowedOnFloatingPointField',
  'fieldLevelEligibility', 'qualifyingNames', 'definitionRequirements', 'requiresOnHelpSpecification',
  'onSubfileControlRecordRequiresOneOf', 'requiresOneOfOnField', 'requiresOnField', 'pairedWith',
  'notWithRecordLevel', 'notWithAlternateName', 'excludesWithKeyword', 'ownSectionRestrictedKeywords',
];

function oiModes(entry) {
  if (!entry) return null;
  const o = entry.optionIndicators;
  if (o && typeof o === 'object') return { file: o.file || null, record: o.record || null, field: o.field || null };
  const mode = o || (entry.optionIndicatorsValid === true ? 'valid' : null);
  return mode ? { file: mode, record: mode, field: mode } : null;
}

function specFacts(name) {
  const e = Object.prototype.hasOwnProperty.call(T, name) ? T[name] : null;
  if (!e) return { found: false };
  let params = null;
  if (e.noParameters === true || e.parameters === 'none') params = 'none';
  else if (e.parameters) params = 'some';
  return {
    found: true,
    entry: e,
    levels: Array.isArray(e.levels) ? e.levels.slice().sort() : null,
    optionIndicators: oiModes(e),
    parameters: params,
    constraints: CONSTRAINT_FACTS.filter((k) => Object.prototype.hasOwnProperty.call(e, k)),
  };
}

/** Normalised facts for one keyword, each tagged with its source ('spec' | 'reference' | null). */
function resolve(name) {
  const s = specFacts(name);
  const r = referenceFacts(name);
  const out = { name: name, spec: s, ref: r, levels: null, levelsFrom: null };
  if (s.levels) { out.levels = s.levels; out.levelsFrom = 'spec'; }
  else if (r.found && r.levels && r.levels.length) { out.levels = r.levels; out.levelsFrom = 'reference'; }
  out.placeable = (out.levels || []).filter((l) => l === 'file' || l === 'record' || l === 'field');
  out.bare = s.parameters === 'none' || (s.parameters === null && r.found && r.noParameters);
  return out;
}

// ---- which keywords the matrix covers -----------------------------------------------------

// Taken by another I-122 batch that has not landed yet (claim commits on origin); skipped by
// default so two sessions do not write the same cells. Once that batch lands, the dynamic scan
// below finds its names and these entries are redundant but harmless.
const CLAIMED_ELSEWHERE = [
  'CA01-CA24', 'CF01-CF24', 'ALTPAGEDWN', 'ALTPAGEUP', 'DLTCHK', 'DLTEDT', 'RETCMDKEY', 'MNUBARSW', 'MNUCNL', 'GETRETAIN',
];

/** Names of RECORD_TYPES mentioned by another hand-written i122*.test.js (not this matrix, not the helper). */
function handCoveredNames(selfFile) {
  const dir = path.join(__dirname, '..');
  const text = fs.readdirSync(dir)
    .filter((f) => /^i122.*\.test\.js$/.test(f) && f !== selfFile)
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  return Object.keys(T).filter((n) => new RegExp('(?:^|[^A-Za-z0-9])' + n.replace(/[-]/g, '\\-') + '(?![A-Za-z0-9])').test(text));
}

// Keywords whose hand-written duplicate checks were retired in I-122j because the matrix covers the
// same assertion (each retirement backed by a mutation run). They stay in the default matrix even
// when another hand-written I-122 file mentions them, so the coverage cannot silently drop out.
const RETAINED = ['DSPSIZ', 'ERRSFL', 'MSGLOC', 'SFLCTL', 'SFLSIZ', 'INZRCD', 'TEXT', 'SFLMSGKEY', 'HLPTITLE',
  // I-193: their hand-written "off removes only X" / "round trips as a bare flag" checks were retired
  // because the matrix's flag-path cells (L5) now run the same assertion on them.
  'SFLRNA', 'SFLRCDNBR', 'HLPSCHIDX', 'HLPBDY', 'IGCCNV', 'DLTCHK', 'SFLCHCCTL'];

function matrixKeywords(opts) {
  const o = opts || {};
  const all = Object.keys(T);
  if (o.all) return all;
  const skip = new Set(handCoveredNames(o.selfFile).concat(CLAIMED_ELSEWHERE));
  RETAINED.forEach((n) => skip.delete(n));
  return all.filter((n) => !skip.has(n));
}

// ---- fixtures ---------------------------------------------------------------------------

/** One fixed-column DDS line (column 6 'A'). */
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) put(8, o.ind);
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.use) put(38, o.use);
  if (o.line) put(39, String(o.line).padStart(3));
  if (o.col) put(42, String(o.col).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}

const SAMPLE_PARAMETER = "'Text one'";
/** The keyword as written in the source: bare when the spec/reference says it takes no parameters. */
function keywordText(facts) {
  return facts.name + (facts.bare ? '' : '(' + SAMPLE_PARAMETER + ')');
}

const IND = 'N10';
const R = (name) => dds({ t: 'R', name: name });
const FLD = (name, line) => dds({ name: name, len: 10, type: 'A', use: 'B', line: line, col: 2 });
const K = (fn) => dds({ fn: fn });
const KI = (fn) => dds({ ind: IND, fn: fn });

/** { text, expect } placements of `facts.name` at one level, bare then under an option indicator. */
function placement(facts, level) {
  const kw = keywordText(facts);
  if (level === 'file') {
    return { source: [K(kw), KI(kw), R('REC1'), FLD('F1', 1)].join('\n') + '\n' };
  }
  if (level === 'record') {
    return { source: [R('REC1'), K(kw), KI(kw), FLD('F1', 1)].join('\n') + '\n' };
  }
  return { source: [R('REC1'), FLD('F1', 1), K(kw), KI(kw)].join('\n') + '\n' };
}

module.exports = {
  referenceSections, referenceFacts, referenceLevels, referenceOptionIndicators,
  specFacts, resolve, matrixKeywords, handCoveredNames, CLAIMED_ELSEWHERE, RETAINED, CONSTRAINT_FACTS,
  dds, R, FLD, K, KI, IND, SAMPLE_PARAMETER, keywordText, placement,
};

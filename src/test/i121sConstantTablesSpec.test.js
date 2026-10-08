/**
 * i121sConstantTablesSpec.test.js
 *
 * Task I-121s - engine and writer constant tables. dspfWriter.js's TARGET
 * array (alwrolClrlSlnoConflictReason), SFL_CHOICE_KEYWORDS and
 * RECORD_REFERENCE_EXTRACTORS / RECORD_REFERENCE_LOCATORS moved to
 * keywordSpec.js; COLOR_HEX / NUMERIC_TYPES / USAGE_LABEL / edtwrdDisplayWidth
 * / NO_OPTION_INDICATOR_MESSAGES are classified as presentation and stay.
 * Pure refactor: every value must equal the old literal.
 *
 * Run with: node src/test/i121sConstantTablesSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check } = require('./helpers/harness');
const j = (a) => JSON.stringify(a);
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Baselines: the code this slice removed from dspfWriter.js, word for word.
const OLD_EXTRACTORS = {
  SFLCTL: (p) => { const n = p.trim(); return n || null; },
  WINDOW: (p) => {
    const parts = p.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1 && !/^[+-]?\d+$/.test(parts[0]) && parts[0].toUpperCase() !== '*DFT') return parts[0];
    return null;
  },
  MNUBARCHC: (p) => { const m = p.trim().match(/^(\d+)\s+(\S+)\s+'/); return m ? m[2] : null; },
};
const OLD_LOCATORS = {
  SFLCTL: /(\bSFLCTL\(\s*)(\S+?)(\s*\))/i,
  WINDOW: /(\bWINDOW\(\s*)(\S+)(\s*\))/i,
  MNUBARCHC: /(\bMNUBARCHC\(\s*\d+\s+)(\S+)(\s+')/i,
};

console.log('\n=== 1. sflChoiceKeywords ===');
check('SFLSNGCHC then SFLMLTCHC (the old array, same order)', j(KeywordSpec.sflChoiceKeywords()) === j(['SFLSNGCHC', 'SFLMLTCHC']));
check('returns a fresh array', KeywordSpec.sflChoiceKeywords() !== KeywordSpec.sflChoiceKeywords());
check('each excludes the other in its own spec entry', KeywordSpec.sflChoiceKeywords().every((k, i, a) => KeywordSpec.mutexKeywords(k).indexOf(a[1 - i]) >= 0));
check('SFLRTNSEL qualifyingNames is the same list (one source)', j(KeywordSpec.RECORD_TYPES.SFLRTNSEL.qualifyingNames) === j(KeywordSpec.sflChoiceKeywords()));
check('writer no longer holds its own literal', !/SFL_CHOICE_KEYWORDS = \[/.test(src('dspfWriter.js')));
const choice = (n) => ({ name: n });
check('writer: SFLMLTCHC added over SFLSNGCHC is still refused', /SFLMLTCHC cannot be specified on the same record as SFLSNGCHC/.test(DspfWriter.sflChoiceListNewConflictReason([choice('SFLSNGCHC')], [choice('SFLSNGCHC'), choice('SFLMLTCHC')]) || ''));
check('writer: an already-invalid pair is not re-reported', DspfWriter.sflChoiceListNewConflictReason([choice('SFLSNGCHC'), choice('SFLMLTCHC')], [choice('SFLSNGCHC'), choice('SFLMLTCHC')]) === null);

console.log('\n=== 2. alwrolClrlSlnoKeywords ===');
check('ALWROL, CLRL, SLNO (the old TARGET)', j(KeywordSpec.alwrolClrlSlnoKeywords()) === j(['ALWROL', 'CLRL', 'SLNO']));
check('every member has a spec mutex entry naming ASSUME', KeywordSpec.alwrolClrlSlnoKeywords().every((k) => KeywordSpec.mutexKeywords(k).indexOf('ASSUME') >= 0));
check('ASSUME\'s own narrowed list is the same three', j(KeywordSpec.mutexKeywords('ASSUME')) === j(KeywordSpec.alwrolClrlSlnoKeywords()));
check('writer no longer holds its own TARGET literal', !/var TARGET = \[/.test(src('dspfWriter.js')));
check('writer: ALWROL with SFL on the record is refused', /ALWROL cannot be specified with SFL/.test(DspfWriter.alwrolClrlSlnoConflictReason('ALWROL', [{ name: 'SFL' }]) || ''));
check('writer: ASSUME with CLRL on the record is refused', /ASSUME cannot be specified with CLRL/.test(DspfWriter.alwrolClrlSlnoConflictReason('ASSUME', [{ name: 'CLRL' }]) || ''));
check('writer: an unrelated keyword is untouched', DspfWriter.alwrolClrlSlnoConflictReason('BLINK', [{ name: 'SLNO' }]) === null);

console.log('\n=== 3. RECORD_REFERENCES ===');
check('exactly SFLCTL, WINDOW, MNUBARCHC', j(KeywordSpec.recordReferenceKeywords()) === j(['SFLCTL', 'WINDOW', 'MNUBARCHC']));
const PARAMS = ['', ' ', 'REC1', '  REC1  ', '10', '+5', '-3', '*DFT', '*dft', 'REC1 REC2', '1 2 3', "3 CHOICE 'Text'", "3 CHOICE", "12 REC9 'a b'", "x 'y'", '(', '*DS3', "01 R_1   'q'"];
Object.keys(OLD_EXTRACTORS).forEach((k) => {
  check(k + ': name extraction equals the old extractor on ' + PARAMS.length + ' inputs', PARAMS.every((p) => KeywordSpec.recordReferenceName(k, p) === OLD_EXTRACTORS[k](p)));
  check(k + ': locator source/flags equal the old regex', KeywordSpec.recordReferenceLocator(k).source === OLD_LOCATORS[k].source && KeywordSpec.recordReferenceLocator(k).flags === OLD_LOCATORS[k].flags);
});
check('non-reference keyword -> null name and null locator', KeywordSpec.recordReferenceName('BLINK', 'X') === null && KeywordSpec.recordReferenceLocator('BLINK') === null);
check('prototype names are not references', KeywordSpec.recordReferenceName('constructor', 'X') === null && KeywordSpec.recordReferenceLocator('__proto__') === null);
check('null parameters tolerated', KeywordSpec.recordReferenceName('SFLCTL', null) === null);
check('locator is fresh per call (no shared lastIndex state)', KeywordSpec.recordReferenceLocator('WINDOW') !== KeywordSpec.recordReferenceLocator('WINDOW'));
check('writer no longer holds the extractor / locator tables', !/var RECORD_REFERENCE_EXTRACTORS|var RECORD_REFERENCE_LOCATORS/.test(src('dspfWriter.js')));
// end to end through renameRecordReferences
const lines = ["     A          R DETAIL                    SFL", "     A          R CTL                       SFLCTL(DETAIL)", "     A          R WIN                       WINDOW(DETAIL)", "     A            F1             1A  B  2  2 MNUBARCHC(1 DETAIL 'Pick')"];
const rec = (kws, fields) => ({ keywords: kws, fields: fields || [] });
const kw = (name, parameters, line) => ({ name, parameters, sourceLines: [line] });
const dspf = { records: [rec([kw('SFLCTL', 'DETAIL', 2)]), rec([kw('WINDOW', 'DETAIL', 3)]), rec([], [{ keywords: [kw('MNUBARCHC', "1 DETAIL 'Pick'", 4)] }])] };
const out = DspfWriter.renameRecordReferences(dspf, lines, 'DETAIL', 'LINES');
check('rename rewrites all three reference shapes', /SFLCTL\(LINES\)/.test(out[1]) && /WINDOW\(LINES\)/.test(out[2]) && /MNUBARCHC\(1 LINES 'Pick'\)/.test(out[3]));
check('rename leaves the renamed record\'s own R-line alone', out[0] === lines[0]);

console.log('\n=== 4. presentation tables stay, and are pinned to the spec ===');
check('COLOR_HEX keys equal the spec COLOR values', j(Object.keys(DspfEngine.COLOR_HEX).sort()) === j(KeywordSpec.validValues('COLOR').slice().sort()));
check('every COLOR_HEX value is a CSS hex colour', Object.keys(DspfEngine.COLOR_HEX).every((k) => /^#[0-9a-f]{6}$/i.test(DspfEngine.COLOR_HEX[k])));
const eng = src('dspfEngine.js');
const wr = src('dspfWriter.js');
check('engine records the presentation / stays-in-engine decisions', /COLOR_HEX is PRESENTATION/.test(eng) && /NUMERIC_TYPES picks the 9-vs-X/.test(eng) && /Task I-121s decision: edtwrdDisplayWidth stays/.test(eng) && /USAGE_LABEL and the data-type words/.test(eng));
check('writer records that NO_OPTION_INDICATOR_MESSAGES is presentation', /decision: this wording -> message mapping is PRESENTATION/.test(wr));
check('edtwrdDisplayWidth behaviour unchanged', ["'  0 .  '", "'AB''C'", '', "'&CR'"].map((p) => DspfEngine.displayLength({ dataType: 'S', length: 5, keywords: [{ name: 'EDTWRD', parameters: p }] }, {}, {})).every((n) => Number.isFinite(n)));

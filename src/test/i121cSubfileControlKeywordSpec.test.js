/**
 * i121cSubfileControlKeywordSpec.test.js
 *
 * Task I-121c - "One declarative rule spec per keyword", subfile control
 * keywords slice: SFLPAG, SFLCLR, SFLDSP, SFLDSPCTL, SFLEND, SFLINZ, SFLDLT
 * (SFLCTL is I-141's entry). Each now has a RECORD_TYPES entry read from
 * DDS_Keyword_V7r6.txt. Pure refactor: SFLDLT's stand-alone
 * OPTION_INDICATOR_REQUIRED table (I-141) is folded into SFLDLT's own entry and
 * the I-141 guard reads it from there, unchanged. Rules the reference states
 * that no guard enforces are recorded as facts and logged as findings.
 *
 * Parts: (1) entries against the reference text; (2) sweeps against
 * NO_OPTION_INDICATORS, KEYWORD-LOOKUP.json and the engine's SFLEND reading;
 * (3) accessors; (4) SFLDLT's folded fact and the I-141 guard unchanged.
 *
 * Run with: node src/test/i121cSubfileControlKeywordSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

const SEVEN = ['SFLPAG', 'SFLCLR', 'SFLDSP', 'SFLDSPCTL', 'SFLEND', 'SFLINZ', 'SFLDLT'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, '').replace(/\s+/g, ' ');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;

// ---- 1. entries against the reference text ----
check('the slice owns exactly the seven keywords, in order', KeywordSpec.subfileControlKeywords().join() === SEVEN.join());
SEVEN.forEach((n) => {
  const e = KeywordSpec.RECORD_TYPES[n];
  check(n + ': has an entry, record level, on the subfile-control record, with a citation', !!e && e.levels.join() === 'record' && e.onRecordType === 'SFLCTL' && /~line \d+/.test(e.ddsReference));
  check(n + ': record-type accessor says SFLCTL', KeywordSpec.subfileControlRecordType(n) === 'SFLCTL');
  check(n + ': heading exists in the reference', has(n + ' (Subfile') || has(n + ' ('));
});
check('SFLPAG: required on the subfile-control record', has('This keyword is required for the subfile-control record format.') && KeywordSpec.requiredOnSubfileControl('SFLPAG'));
check('SFLPAG: takes a required parameter', has('SFLPAG(number-of-records-to-be-displayed)') && KeywordSpec.parameterMode('SFLPAG') === 'required');
check('SFLPAG: SFLSIZ=SFLPAG list is SFLDROP, SFLFOLD, SFLROLVAL', has('the following keywords are not allowed: SFLDROP SFLFOLD SFLROLVAL') && KeywordSpec.excludedWhenSizeEqualsPage().join() === 'SFLDROP,SFLFOLD,SFLROLVAL');
check('SFLPAG: field-selection list is SFLDROP, SFLFOLD, SFLINZ, SFLLIN, SFLRCDNBR', has('not valid on the subfile- control record format: SFLDROP SFLFOLD SFLINZ SFLLIN SFLRCDNBR') || has('not valid on the subfile-control record format: SFLDROP SFLFOLD SFLINZ SFLLIN SFLRCDNBR') || KeywordSpec.excludedWithFieldSelection().join() === 'SFLDROP,SFLFOLD,SFLINZ,SFLLIN,SFLRCDNBR');
check('SFLCLR: option indicator required, display size names not valid, no parameters', has('An option indicator is required for this keyword to prevent') && KeywordSpec.optionIndicatorMode('SFLCLR') === 'required' && KeywordSpec.displaySizeNamesMode('SFLCLR') === 'notValid' && KeywordSpec.parameterMode('SFLCLR') === 'none');
check('SFLDSP: required, indicators valid, display size names not valid', has('This keyword is required and is valid only for the subfile-control record format.') && KeywordSpec.requiredOnSubfileControl('SFLDSP') && KeywordSpec.optionIndicatorMode('SFLDSP') === 'valid' && KeywordSpec.displaySizeNamesMode('SFLDSP') === 'notValid');
check('SFLDSPCTL: optional, indicators valid, display size names not valid', has('This optional keyword is valid only for the subfile-control record format. Display size condition names are not valid for this keyword.') && !KeywordSpec.requiredOnSubfileControl('SFLDSPCTL') && KeywordSpec.optionIndicatorMode('SFLDSPCTL') === 'valid');
check('SFLINZ: indicators valid, display size names not valid, no parameters', has('Option indicators are valid for this keyword. Display size condition names are not valid.') && KeywordSpec.optionIndicatorMode('SFLINZ') === 'valid' && KeywordSpec.displaySizeNamesMode('SFLINZ') === 'notValid' && KeywordSpec.parameterMode('SFLINZ') === 'none');
check('SFLDLT: indicators required, display size names not valid', has('Option indicators are required for this keyword; display size condition names are not valid.') && KeywordSpec.optionIndicatorMode('SFLDLT') === 'required' && KeywordSpec.displaySizeNamesMode('SFLDLT') === 'notValid');
check('SFLEND: grammar text and "option indicator must be specified"', has('SFLEND[(*PLUS | *MORE | {*SCRBAR [*SCRBAR | *PLUS |*MORE ]})]') && has('An option indicator must be specified for this keyword.') && KeywordSpec.optionIndicatorMode('SFLEND') === 'required');
const g = KeywordSpec.sflendGrammar();
check('SFLEND grammar: first/second sets, defaults, second only after *SCRBAR', g.first.join() === '*PLUS,*MORE,*SCRBAR' && g.second.join() === '*SCRBAR,*PLUS,*MORE' && g.defaultFirst === '*PLUS' && g.defaultSecond === '*SCRBAR' && g.secondOnlyAfter === '*SCRBAR');
check('SFLEND grammar: 3 reserved columns, 3 minimum lines, *MORE adds one line', g.scrollBarReservedColumns === 3 && g.scrollBarMinimumLines === 3 && g.moreAddsLines === 1 && has('the last 3 columns of the lines that the subfile is using is reserved') && has('the subfile must occupy at least 3 lines') && has('the subfile takes up one more line on the screen (SFLPAG + 1)'));

// ---- 2. sweeps ----
const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
SEVEN.forEach((n) => check(n + ': in KEYWORD-LOOKUP.json', Object.prototype.hasOwnProperty.call(lookup, n)));
SEVEN.forEach((n) => {
  const noInd = !!KeywordSpec.noOptionIndicatorsFact(n);
  check(n + ': spec option-indicator mode agrees with the no-option-indicators table (' + (noInd ? 'notValid' : 'accepted') + ')', noInd === (KeywordSpec.optionIndicatorMode(n) === 'notValid'));
});
check('SFLPAG is the only one of the seven in the no-option-indicators table', SEVEN.filter((n) => KeywordSpec.noOptionIndicatorsFact(n)).join() === 'SFLPAG');
check('every keyword SFLPAG excludes has its own lookup entry', KeywordSpec.excludedWhenSizeEqualsPage().concat(KeywordSpec.excludedWithFieldSelection()).every((k) => Object.prototype.hasOwnProperty.call(lookup, k)));
check('SFLCTL requiredFor does not list the four not yet guarded (no behaviour change)', ['SFLPAG', 'SFLCLR', 'SFLDSP', 'SFLDSPCTL', 'SFLEND'].every((k) => KeywordSpec.sflctlDependentKeywords().indexOf(k) === -1));
// the engine's reading of every valid SFLEND parameter combination agrees with the grammar
(function () {
  const combos = [''];
  g.first.forEach((a) => { combos.push('(' + a + ')'); if (a === g.secondOnlyAfter) g.second.forEach((b) => combos.push('(' + a + ' ' + b + ')')); });
  let ok = 0;
  combos.forEach((c) => {
    const params = c.replace(/^\(|\)$/g, '');
    const lines = [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
      buildLine({ seq: '00101', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '3', col: '2' }),
      buildLine({ seq: '00200', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }),
      buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
      buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
      buildLine({ seq: '00203', func: 'SFLDSP' }),
      buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
      buildLine({ seq: '00205', func: 'SFLEND' + c })
    ];
    const m = DspfParser.parseDspf(lines.join('\n') + '\n');
    const sfp = DspfEngine.resolveScreen(m, 'SFLCTLR', new Set(), null, false, 0).subfilePreview;
    const st = sfp && sfp.sflEnd;
    const first = params.trim().split(/\s+/)[0] || g.defaultFirst;
    const agree = !!st && !!sfp.scrollbar === (first === '*SCRBAR') && !!sfp.moreLine === (first === '*MORE' || /\*SCRBAR \*MORE/.test(params)) && ((first === '*PLUS' || params.trim() === '') ? !!sfp.plusMark : true);
    if (agree) ok++;
    else console.log('  engine disagrees for SFLEND' + c);
  });
  check('engine reads all ' + combos.length + ' valid SFLEND parameter forms as the grammar says', ok === combos.length);
})();

// ---- 3. accessors ----
check('accessors are case/blank safe and null for other keywords', KeywordSpec.parameterMode('sflpag') === 'required' && KeywordSpec.parameterMode('') === null && KeywordSpec.parameterMode(null) === null && KeywordSpec.optionIndicatorMode('SFLSIZ') === null && KeywordSpec.displaySizeNamesMode('SFLCTL') === null && KeywordSpec.subfileControlRecordType('SFLCTL') === null && KeywordSpec.requiredOnSubfileControl('SFLEND') === false);
check('list accessors return copies', (() => { const a = KeywordSpec.excludedWhenSizeEqualsPage(); a.push('X'); const b = KeywordSpec.subfileControlKeywords(); b.pop(); return KeywordSpec.excludedWhenSizeEqualsPage().length === 3 && KeywordSpec.subfileControlKeywords().length === 7; })());
check('sflendGrammar returns copies', (() => { const x = KeywordSpec.sflendGrammar(); x.first.push('Z'); return KeywordSpec.sflendGrammar().first.length === 3; })());

// ---- 4. SFLDLT's folded fact; the I-141 guard unchanged ----
const f = KeywordSpec.optionIndicatorRequiredFact('sfldlt');
check('SFLDLT fact still {required, noDisplaySize, ddsReference}', !!f && f.required === true && f.noDisplaySize === true && /required for this keyword/.test(f.ddsReference));
check('it now lives on the SFLDLT entry', KeywordSpec.RECORD_TYPES.SFLDLT.optionIndicatorRequired === f);
check('SFLCLR / SFLEND (same wording, unguarded) and others still return null', ['SFLCLR', 'SFLEND', 'SFLINZ', 'RMVWDW', '', null].every((k) => KeywordSpec.optionIndicatorRequiredFact(k) === null));
(function () {
  const mk = (n) => ({ records: [{ name: 'R', keywords: [{ name: n, parameters: '', conditions: [{ displaySizeCondition: true, indicators: [] }] }] }] });
  const none = (n) => ({ records: [{ name: 'R', keywords: [{ name: n, parameters: '', conditions: [] }] }] });
  check('adding a display size name to SFLDLT is refused (I-141, unchanged)', !!DspfWriter.optionIndicatorRequiredNewConflictReason(none('SFLDLT'), mk('SFLDLT')));
  check('the same edit on SFLCLR is not refused (no behaviour change; finding logged)', DspfWriter.optionIndicatorRequiredNewConflictReason(none('SFLCLR'), mk('SFLCLR')) === null);
})();

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

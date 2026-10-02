/**
 * i121S36eRestrictionSpec.test.js
 *
 * Task I-121p - the System/36 environment (S36E) restriction table moved
 * from dspfWriter.js (S36E_KEYWORD_RESTRICTIONS) into keywordSpec.js
 * (S36E_RESTRICTIONS). Pure refactor, no behaviour change. Verifies:
 *  1. the spec table holds exactly the eight keywords, in the old order,
 *     with the gated/ungated split and severities the writer always had.
 *  2. the accessors agree with the table (case-insensitive, blank-safe).
 *  3. PRINT's *PGM carve-out is now the spec fact `excludedResponseValues`,
 *     and only PRINT has one.
 *  4. DspfWriter.getS36ERestriction returns the spec's own entry.
 *  5. the writer's violation message / USRDSPMGT checks / whole-model scan
 *     behave exactly as before (CHANGE/HELP/PRINT only, *PGM exempt).
 *
 * Run with: node src/test/i121S36eRestrictionSpec.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

console.log('\nKeywordSpec.S36E_RESTRICTIONS shape');
{
  const names = ['ALTNAME', 'CHANGE', 'HELP', 'HLPRTN', 'MSGID', 'PRINT', 'RETKEY', 'RETCMDKEY'];
  check('table holds exactly the eight keywords, in the original order',
    JSON.stringify(KeywordSpec.s36eRestrictedKeywords()) === JSON.stringify(names));
  const gated = { ALTNAME: false, CHANGE: true, HELP: true, HLPRTN: true, MSGID: false, PRINT: true, RETKEY: false, RETCMDKEY: false };
  const severity = { CHANGE: 'warning', HELP: 'error', PRINT: 'warning' };
  names.forEach(function (n) {
    const e = KeywordSpec.S36E_RESTRICTIONS[n];
    check(n + ' is verified and names itself', e.verified === true && e.keyword === n);
    check(n + ' gatedByUsrdspmgt matches IBM text', e.gatedByUsrdspmgt === gated[n]);
    check(n + ' severity', e.severity === (severity[n] || null));
    check(n + ' appliesTo', e.appliesTo === (severity[n] ? 'response-indicator' : null));
    check(n + ' has a rule and a source citation', typeof e.rule === 'string' && e.rule.length > 0 && /DDS_Keyword_V7r6/.test(e.source));
  });
}

console.log('\nKeywordSpec accessors');
{
  check('s36eRestriction is case-insensitive', KeywordSpec.s36eRestriction('change') === KeywordSpec.S36E_RESTRICTIONS.CHANGE);
  check('unknown / blank / undefined give null', KeywordSpec.s36eRestriction('INDARA') === null && KeywordSpec.s36eRestriction('') === null && KeywordSpec.s36eRestriction() === null);
  ['CHANGE', 'HELP', 'PRINT', 'help'].forEach(function (n) {
    check(n + ' is a response-indicator keyword', KeywordSpec.isS36eResponseIndicatorKeyword(n));
  });
  ['HLPRTN', 'ALTNAME', 'MSGID', 'RETKEY', 'RETCMDKEY', 'CLEAR', '', undefined].forEach(function (n) {
    check(String(n) + ' is not a response-indicator keyword', !KeywordSpec.isS36eResponseIndicatorKeyword(n));
  });
}

console.log('\nPRINT *PGM carve-out is a spec fact');
{
  check('PRINT.excludedResponseValues is [*PGM]', JSON.stringify(KeywordSpec.S36E_RESTRICTIONS.PRINT.excludedResponseValues) === '["*PGM"]');
  check('no other entry has excludedResponseValues', KeywordSpec.s36eRestrictedKeywords().every(function (n) { return n === 'PRINT' || !KeywordSpec.S36E_RESTRICTIONS[n].excludedResponseValues; }));
  check('*PGM / *pgm / padded are excluded on PRINT', KeywordSpec.isS36eExcludedResponseValue('PRINT', '*PGM') && KeywordSpec.isS36eExcludedResponseValue('print', ' *pgm '));
  check('a numeric indicator is not excluded on PRINT', !KeywordSpec.isS36eExcludedResponseValue('PRINT', '30'));
  check('*PGM is not excluded on HELP or CHANGE', !KeywordSpec.isS36eExcludedResponseValue('HELP', '*PGM') && !KeywordSpec.isS36eExcludedResponseValue('CHANGE', '*PGM'));
}

console.log('\nDspfWriter consumers read the spec, behaviour unchanged');
{
  check('getS36ERestriction returns the spec entry itself', DspfWriter.getS36ERestriction('HELP') === KeywordSpec.S36E_RESTRICTIONS.HELP);
  check('getS36ERestriction(unknown) is null', DspfWriter.getS36ERestriction('NOPE') === null);
  const rule = KeywordSpec.S36E_RESTRICTIONS.HELP.rule;
  check('HELP + response indicator -> the spec rule text', DspfWriter.s36ERuleViolationMessage('HELP', '30') === rule);
  check('PRINT *PGM -> no message', DspfWriter.s36ERuleViolationMessage('PRINT', '*PGM') === null);
  check('PRINT numeric -> message', DspfWriter.s36ERuleViolationMessage('PRINT', '30') === KeywordSpec.S36E_RESTRICTIONS.PRINT.rule);
  check('blank -> no message', DspfWriter.s36ERuleViolationMessage('CHANGE', '  ') === null);
  check('HLPRTN / ALTNAME / unknown never violate', ['HLPRTN', 'ALTNAME', 'MSGID', 'RETKEY', 'RETCMDKEY', 'NOPE'].every(function (n) { return DspfWriter.s36ERuleViolationMessage(n, '30') === null; }));

  const on = [{ name: 'USRDSPMGT', parameters: '' }];
  check('USRDSPMGT on + HELP indicator -> error', (DspfWriter.checkS36EResponseIndicatorViolation(on, 'HELP', '30') || {}).severity === 'error');
  check('USRDSPMGT on + CHANGE indicator -> warning', (DspfWriter.checkS36EResponseIndicatorViolation(on, 'CHANGE', '30') || {}).severity === 'warning');
  check('USRDSPMGT off -> nothing', DspfWriter.checkS36EResponseIndicatorViolation([], 'HELP', '30') === null);
}

console.log('\nfindS36EConflictInModel scan (unchanged)');
{
  const rec = function (kw) { return { name: 'REC1', keywords: kw, fields: [] }; };
  const help = { name: 'HELP', parameters: '30', conditions: [] };
  const change = { name: 'CHANGE', parameters: '40', conditions: [] };
  const hit = function (model) { return DspfWriter.findS36EConflictInModel(model); };
  check('empty model -> null', hit({ fileKeywords: [], records: [] }) === null);
  const r1 = hit({ fileKeywords: [help], records: [] });
  check('file-level HELP indicator found', r1 && r1.keyword === 'HELP' && r1.location === 'File-level keywords');
  const r2 = hit({ fileKeywords: [{ name: 'PRINT', parameters: '*PGM', conditions: [] }], records: [] });
  check('file-level PRINT(*PGM) not a conflict', r2 === null);
  const r3 = hit({ fileKeywords: [], records: [rec([change])] });
  check('record-level CHANGE instance found', r3 && r3.keyword === 'CHANGE' && r3.location === 'Record REC1');
  const r4 = hit({ fileKeywords: [], records: [rec([{ name: 'PRINT', parameters: '50', conditions: [] }])] });
  check('record-level PRINT numeric found', r4 && r4.keyword === 'PRINT');
  const r5 = hit({ fileKeywords: [], records: [rec([{ name: 'CLEAR', parameters: '50', conditions: [] }])] });
  check('other indicator kinds (CLEAR) ignored', r5 === null);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i121bInitRetainReturnSpec.test.js
 *
 * Task I-121b - "One declarative rule spec per keyword", initialize / retain /
 * return keywords slice: INZRCD, INZINP, GETRETAIN, RTNDTA, RETLCKSTS, RETKEY,
 * RETCMDKEY. Each now has a RECORD_TYPES entry (level, no parameters,
 * option-indicator validity, and every relation its own DDS Reference section
 * states), read from DDS_Keyword_V7r6.txt rather than from the code.
 *
 * One real finding: RETKEY / RETCMDKEY's shared section ends "Option
 * indicators are not valid for these keywords", but I-44 read it as silent and
 * left a Conditioning toggle on both rows. They are now in the no-option-
 * indicators table and the toggle is gone; RETLCKSTS and INZINP, which do take
 * option indicators, keep theirs. The toggle for all seven is now the spec's
 * `optionIndicators` fact, not a per-call literal.
 *
 * Parts:
 *  1. the spec entries against the reference text.
 *  2. sweep: every one of the seven agrees with NO_OPTION_INDICATORS in both
 *     directions, with the KEYWORD-LOOKUP.json inventory, and with the SFL /
 *     USRDFN whitelists (the record types RETKEY / RETCMDKEY refuse).
 *  3. accessors (fresh copies, case/blank safety) and the writer re-exports.
 *  4. the writer refuses option indicators on RETKEY / RETCMDKEY.
 *  5. the rendered record panels: Conditioning toggle present exactly where
 *     the spec says option indicators are valid; no params box anywhere.
 *
 * Run with: node src/test/i121bInitRetainReturnSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const SEVEN = ['INZRCD', 'INZINP', 'GETRETAIN', 'RTNDTA', 'RETLCKSTS', 'RETKEY', 'RETCMDKEY'];
const VALID = ['INZINP', 'RETLCKSTS'];
const NOT_VALID = ['INZRCD', 'GETRETAIN', 'RTNDTA', 'RETKEY', 'RETCMDKEY'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');

/** The keyword's own section: page breaks and page footers removed, whitespace collapsed,
 *  from the heading to the next "... keyword(s) for display files" heading. */
const NORM = REF.replace(/\f/g, ' ').replace(/\n\s*\d+ IBM i: Programming\s*\n/g, '\n').replace(/\n\s*DDS for display files \d+\s*\n/g, '\n').replace(/\s+/g, ' ');
function section(heading, length) {
  // The real section, not the table of contents or a "Related reference" line: of the places the
  // heading is followed by a description, the one whose first 1500 characters say "no parameters".
  let from = 0;
  let i = -1;
  for (;;) {
    const at = NORM.indexOf(heading + ' You use', from);
    if (at < 0) break;
    if (/no parameters/.test(NORM.slice(at, at + 1500))) { i = at; break; }
    from = at + 1;
  }
  if (i < 0) throw new Error('section not found: ' + heading);
  const rest = NORM.slice(i + heading.length);
  const next = rest.search(/ [A-Z][A-Za-z0-9/]+ \([^)]*\) keywords? for display files /);
  return rest.slice(0, length || (next > 0 ? next : 8000));
}
const oneLine = (t) => t.replace(/\s+/g, ' ');

console.log('\nPart 1. the entries against the DDS Reference');
{
  check('the slice owns exactly the seven keywords, in order', KeywordSpec.initRetainReturnKeywords().join() === SEVEN.join());
  check('initRetainReturnKeywords returns a fresh array', (() => { const a = KeywordSpec.initRetainReturnKeywords(); a.pop(); return KeywordSpec.initRetainReturnKeywords().length === 7; })());
  SEVEN.forEach((n) => {
    const e = KeywordSpec.RECORD_TYPES[n];
    check(n + ' has a RECORD_TYPES entry: record level, no parameters, a citation', !!e && e.levels.join() === 'record' && e.noParameters === true && /line/.test(e.ddsReference));
  });

  const inzrcd = oneLine(section('INZRCD (Initialize Record) keyword for display files'));
  check('INZRCD: reference says no parameters and option indicators not valid', /This keyword has no parameters/.test(inzrcd) && /Option indicators are not valid for this keyword/.test(inzrcd));
  check('INZRCD: spec agrees', KeywordSpec.takesNoParameters('INZRCD') && !KeywordSpec.optionIndicatorsAllowed('INZRCD'));

  const inzinp = oneLine(section('INZINP (Initialize Input) keyword for display files'));
  check('INZINP: reference says no parameters', /This keyword has no parameters/.test(inzinp));
  check('INZINP: reference requires PUTOVR, OVERLAY and ERASEINP(*ALL) at the record level', /requires the PUTOVR, OVERLAY, and ERASEINP\(\*ALL\) keywords to be specified at the record level/.test(inzinp));
  check('INZINP: reference never says option indicators are not valid, and says to give it the same ones as ERASEINP(*ALL)', !/Option indicators are not valid/.test(inzinp) && /same option indicators for INZINP as for ERASEINP/.test(inzinp));
  check('INZINP: spec requires exactly those three, indicators valid', KeywordSpec.recordRequires('INZINP').join() === 'PUTOVR,OVERLAY,ERASEINP(*ALL)' && KeywordSpec.optionIndicatorsAllowed('INZINP'));

  const getretain = oneLine(section('GETRETAIN (Get Retain) keyword for display files'));
  check('GETRETAIN: reference needs UNLOCK without parameters, no parameters, indicators not valid', /must specify the UNLOCK keyword without any parameters when using GETRETAIN/.test(getretain) && /This keyword has no parameters/.test(getretain) && /Option indicators are not valid/.test(getretain));
  check('GETRETAIN: spec requires UNLOCK, bare', KeywordSpec.recordRequires('GETRETAIN').join() === 'UNLOCK' && KeywordSpec.requiresBareKeyword('GETRETAIN') === 'UNLOCK' && !KeywordSpec.optionIndicatorsAllowed('GETRETAIN'));

  const rtndta = oneLine(section('RTNDTA (Return Data) keyword for display files'));
  check('RTNDTA: reference says it cannot be specified with UNLOCK and has no parameters', /If the UNLOCK keyword is specified, the RTNDTA keyword cannot be specified/.test(rtndta) && /This keyword has no parameters/.test(rtndta));
  check('RTNDTA: spec excludes UNLOCK on the record', KeywordSpec.recordExcludes('RTNDTA').join() === 'UNLOCK' && !KeywordSpec.optionIndicatorsAllowed('RTNDTA'));

  const retlcksts = oneLine(section('RETLCKSTS (Retain Lock Status) keyword for display files'));
  check('RETLCKSTS: reference says no parameters and option indicators ARE valid', /This keyword has no parameters\. Option indicators are valid for this keyword/.test(retlcksts));
  check('RETLCKSTS: spec agrees and states no relations', KeywordSpec.takesNoParameters('RETLCKSTS') && KeywordSpec.optionIndicatorsAllowed('RETLCKSTS') && KeywordSpec.recordRequires('RETLCKSTS').length === 0 && KeywordSpec.recordExcludes('RETLCKSTS').length === 0);

  const ret = oneLine(section('RETKEY (Retain Function Keys) and RETCMDKEY (Retain Command Keys) keywords', 5000));
  check('RETKEY/RETCMDKEY: reference says no parameters and option indicators not valid for these keywords', /These keywords have no parameters/.test(ret) && /Option indicators are not valid for these keywords/.test(ret));
  check('RETKEY: reference lists CLEAR HELP HOME PAGEUP PAGEDOWN ROLLDOWN ROLLUP on the file level or the record, and PRINT on the record', /cannot specify RETKEY with a CLEAR, HELP, HOME, PAGEUP, PAGEDOWN, ROLLDOWN, or ROLLUP keyword on the file level or on this record format\. PRINT is not allowed on the same record format with RETKEY/.test(ret));
  check('RETKEY: spec lists the same seven (file + record) and PRINT (record only)', KeywordSpec.fileAndRecordExcludes('RETKEY').join() === 'CLEAR,HELP,HOME,PAGEUP,PAGEDOWN,ROLLDOWN,ROLLUP' && KeywordSpec.recordExcludes('RETKEY').join() === 'PRINT');
  check('RETCMDKEY: reference lists CAnn/CFnn on the file level or the record, and CAnn CFnn SFLDROP SFLENTER SFLFOLD on the record', /cannot specify the CAnn or CFnn keywords with the RETCMDKEY on the file level or on this record format\. You cannot specify any CAnn, CFnn, SFLDROP, SFLENTER, or SFLFOLD keywords on the record being defined/.test(ret));
  check('RETCMDKEY: spec lists CAnn/CFnn (file + record) and SFLDROP/SFLENTER/SFLFOLD (record)', KeywordSpec.fileAndRecordExcludes('RETCMDKEY').join() === 'CAnn,CFnn' && KeywordSpec.recordExcludes('RETCMDKEY').join() === 'SFLDROP,SFLENTER,SFLFOLD');
  check('both: reference needs INDARA, refuses SFL / USRDFN and ALTHELP / ALTPAGEUP / ALTPAGEDWN', /must specify a separate indicator area \(INDARA keyword\)/.test(ret) && /Neither keyword is allowed on a subfile format \(SFL keyword\) or on a user-defined record \(USRDFN keyword\)/.test(ret) && /cannot specify either RETKEY or RETCMDKEY in a file that contains the ALTHELP, ALTPAGEUP, or ALTPAGEDWN keyword/.test(ret));
  ['RETKEY', 'RETCMDKEY'].forEach((n) => {
    check(n + ': spec needs INDARA, refuses SFL + USRDFN and the three alt keys in the file', KeywordSpec.fileRequires(n).join() === 'INDARA' && KeywordSpec.notOnRecordTypes(n).join() === 'SFL,USRDFN' && KeywordSpec.fileExcludes(n).join() === 'ALTHELP,ALTPAGEUP,ALTPAGEDWN');
  });
  check('the S36E notes for RETKEY / RETCMDKEY stay in the S36E table, not copied here', !!KeywordSpec.s36eRestriction('RETKEY') && !!KeywordSpec.s36eRestriction('RETCMDKEY') && SEVEN.every((n) => !/System\/36/.test(KeywordSpec.RECORD_TYPES[n].ddsReference)));
}

console.log('\nPart 2. sweep - agreement with the rest of the spec, both directions');
{
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
  SEVEN.forEach((n) => {
    const inTable = !!KeywordSpec.noOptionIndicatorsFact(n);
    check(n + ': optionIndicators fact and NO_OPTION_INDICATORS agree (' + (inTable ? 'not valid' : 'valid') + ')', inTable === !KeywordSpec.optionIndicatorsAllowed(n));
    check(n + ': the writer refuses a new option indicator exactly when the spec says they are not valid', (DspfWriter.noOptionIndicatorsReason(n) !== null) === !KeywordSpec.optionIndicatorsAllowed(n));
    const rows = lookup[n] || [];
    check(n + ': in KEYWORD-LOOKUP.json as a record-level keyword with no parameter text apart from indicators', rows.length > 0 && rows.every((r) => r.level === 'record' && /^(|indicators \(optional\))$/.test(r.parameters)));
    check(n + ': lookup says it takes parameters nowhere', KeywordSpec.takesNoParameters(n) === rows.every((r) => !/\w/.test(String(r.parameters).replace(/indicators \(optional\)/, ''))));
  });
  check('exactly INZINP and RETLCKSTS accept option indicators', SEVEN.filter((n) => KeywordSpec.optionIndicatorsAllowed(n)).join() === VALID.join() && NOT_VALID.every((n) => !KeywordSpec.optionIndicatorsAllowed(n)));
  ['RETKEY', 'RETCMDKEY'].forEach((n) => {
    KeywordSpec.notOnRecordTypes(n).forEach((t) => {
      check(n + ' is refused on ' + t + ' by that record type\'s own whitelist (the spec relation and the guard agree)', KeywordSpec.isWhitelisted(t, n) === false);
    });
  });
  check('GETRETAIN / INZRCD / RTNDTA / RETLCKSTS / INZINP are refused on SFL and USRDFN by those whitelists too (no relation to record)', ['GETRETAIN', 'INZRCD', 'RTNDTA', 'RETLCKSTS', 'INZINP'].every((n) => !KeywordSpec.isWhitelisted('SFL', n) && !KeywordSpec.isWhitelisted('USRDFN', n)));
  check('PULLDOWN\'s mutex list still names INZRCD and RTNDTA (not duplicated here)', KeywordSpec.isMutex('PULLDOWN', 'INZRCD') && KeywordSpec.isMutex('PULLDOWN', 'RTNDTA') && !KeywordSpec.RECORD_TYPES.INZRCD.mutex && !KeywordSpec.RECORD_TYPES.RTNDTA.mutex);
  check('no keyword the seven name is itself invented: every excluded / required name is in the lookup (CAnn / CFnn are the CA01-CA24 / CF01-CF24 patterns; ROLLUP / ROLLDOWN are PAGEDOWN / PAGEUP synonyms)', (() => {
    const names = [];
    SEVEN.forEach((n) => ['recordRequires', 'recordExcludes', 'fileAndRecordExcludes', 'fileExcludes', 'fileRequires'].forEach((f) => names.push(...KeywordSpec[f](n))));
    // ROLLUP / ROLLDOWN are the documented synonyms of PAGEDOWN / PAGEUP, not separate lookup entries.
    return names.every((x) => /nn$/.test(x) || /\(\*ALL\)$/.test(x) || x === 'ROLLUP' || x === 'ROLLDOWN' || !!lookup[x]);
  })());
}

console.log('\nPart 3. accessors');
{
  check('lookups are case-insensitive and trim', KeywordSpec.takesNoParameters(' retkey ') && KeywordSpec.optionIndicatorsAllowed(' Inzinp '));
  ['MSGCON', 'DFT', 'UNLOCK', 'USRDFN', '', 'constructor', '__proto__', 'toString', null, undefined, 4].forEach((n) => {
    check(JSON.stringify(n) + ' is none of the seven: no parameters fact, no relations', KeywordSpec.takesNoParameters(n) === false && KeywordSpec.optionIndicatorsAllowed(n) === false && KeywordSpec.recordRequires(n).length === 0 && KeywordSpec.recordExcludes(n).length === 0 && KeywordSpec.fileExcludes(n).length === 0 && KeywordSpec.notOnRecordTypes(n).length === 0 && KeywordSpec.requiresBareKeyword(n) === null);
  });
  const a = KeywordSpec.recordExcludes('RETCMDKEY'); a.push('X');
  const b = KeywordSpec.notOnRecordTypes('RETKEY'); b.pop();
  check('list accessors return copies (mutating one leaves the spec alone)', KeywordSpec.recordExcludes('RETCMDKEY').length === 3 && KeywordSpec.notOnRecordTypes('RETKEY').length === 2);
  check('DspfWriter re-exports agree with the spec', DspfWriter.initRetainReturnKeywords().join() === SEVEN.join() && SEVEN.every((n) => DspfWriter.takesNoParameters(n) === true && DspfWriter.optionIndicatorsAllowed(n) === KeywordSpec.optionIndicatorsAllowed(n)));
}

console.log('\nPart 4. option indicators on RETKEY / RETCMDKEY are refused');
{
  const G1 = [{ indicators: [{ number: '01', not: false }] }];
  ['RETKEY', 'RETCMDKEY'].forEach((n) => {
    const r = DspfWriter.noOptionIndicatorsReason(n);
    check(n + ': reason names the keyword and says "not valid"', !!r && r.indexOf(n) >= 0 && /not valid/.test(r));
    check(n + ': gaining an indicator is refused; losing or keeping one is not', !!DspfWriter.noOptionIndicatorsNewConflictReason(n, [], G1) && DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, []) === null && DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, G1) === null);
  });
  ['INZINP', 'RETLCKSTS'].forEach((n) => check(n + ': still accepts an indicator', DspfWriter.noOptionIndicatorsReason(n) === null && DspfWriter.noOptionIndicatorsNewConflictReason(n, [], G1) === null));
}

console.log('\nPart 5. the rendered record panels');
{
  const PANELS = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'];
  const root = document.getElementById('root');
  const keywords = [];
  const expanded = new Set();
  const panels = Helpers.recordKeywordsPanelsHtml(keywords, 'rec', expanded);
  root.innerHTML = PANELS.map((k) => '<div data-panel="' + k + '">' + (panels[k] || '') + '</div>').join('');
  Helpers.wireRecordKeywordsPanels('rec', () => keywords, () => {}, expanded, () => {}, () => []);
  const stem = (n) => 'rec-' + n.toLowerCase();
  SEVEN.forEach((n) => {
    check(n + ': the row is rendered', !!document.getElementById(stem(n) + '-on'));
    check(n + ': no parameters box', !document.getElementById(stem(n) + '-params'));
    const toggle = document.querySelector('.kw-cond-toggle[data-flag-id="' + stem(n) + '"]');
    check(n + ': Conditioning toggle ' + (KeywordSpec.optionIndicatorsAllowed(n) ? 'present' : 'absent') + ' (the spec fact)', !!toggle === KeywordSpec.optionIndicatorsAllowed(n));
  });
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i121fFileDisplayIoSpec.test.js
 *
 * Task I-121f - "One declarative rule spec per keyword", file-level display and
 * I/O keywords slice: IGCCNV, DSPRL, DSPSIZ, ERRSFL, INDARA, MSGLOC, OPENPRT,
 * REF. Each now has a RECORD_TYPES entry read from DDS_Keyword_V7r6.txt rather
 * than from the code.
 *
 *  1. the entries against the reference text (and each cited line number).
 *  2. sweep: option-indicator facts agree with NO_OPTION_INDICATORS and with the
 *     writer's refusal (IGCCNV was missing from the table), no-parameter facts,
 *     DSPSIZ against DSPSIZ_DOMAIN, KEYWORD-LOOKUP.json.
 *  3. accessors (fresh copies) and the writer re-exports.
 *  4. the rendered file panels: the Conditioning toggle is present exactly
 *     where the spec says option indicators are valid.
 *  5. the rows FOLLOW the spec: flip a fact, re-render, the row changes.
 *
 * Run with: node src/test/i121fFileDisplayIoSpec.test.js
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

const EIGHT = ['IGCCNV', 'DSPRL', 'DSPSIZ', 'ERRSFL', 'INDARA', 'MSGLOC', 'OPENPRT', 'REF'];
const NO_PARAMS = ['DSPRL', 'ERRSFL', 'INDARA', 'OPENPRT'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const NORM = REF.replace(/\f/g, ' ').replace(/\n\s*\d+ IBM i: Programming\s*\n/g, '\n').replace(/\n\s*DDS for display files \d+\s*\n/g, '\n').replace(/\s+/g, ' ');
/** The real section for `heading`: the first occurrence followed (within the section) by `mustContain`. */
function section(heading, mustContain) {
  let from = 0;
  for (;;) {
    const at = NORM.indexOf(heading, from);
    if (at < 0) throw new Error('section not found: ' + heading + ' / ' + mustContain);
    const rest = NORM.slice(at + heading.length);
    const next = rest.search(/ [A-Z][A-Za-z0-9/-]+ \([^)]*\) keywords?(?: for display files)? (?:You use|This|The)/);
    const body = rest.slice(0, next > 0 ? next : 9000);
    if (mustContain.test(body)) return body;
    from = at + 1;
  }
}

console.log('\nPart 1. the entries against the DDS Reference');
{
  check('the slice owns exactly the eight keywords, in order', KeywordSpec.fileDisplayIoKeywords().join() === EIGHT.join());
  check('fileDisplayIoKeywords returns a fresh array', (() => { const a = KeywordSpec.fileDisplayIoKeywords(); a.pop(); return KeywordSpec.fileDisplayIoKeywords().length === 8; })());
  EIGHT.forEach((n) => {
    const e = KeywordSpec.RECORD_TYPES[n];
    check(n + ' has a RECORD_TYPES entry: file level only, a citation with a line number', !!e && e.levels.join() === 'file' && /line \d+/.test(e.ddsReference));
  });
  const rawLines = REF.split('\n');
  const HEAD = {
    IGCCNV: /^\s*IGCCNV \(DBCS Conversion\) keyword\s*$/, DSPRL: /^DSPRL \(Display Right to Left\)/, DSPSIZ: /^DSPSIZ \(Display Size\)/,
    ERRSFL: /^ERRSFL \(Error Subfile\)/, INDARA: /^INDARA \(Indicator Area\)/, MSGLOC: /^MSGLOC \(Message Location\)/,
    OPENPRT: /^OPENPRT \(Open Printer File\)/, REF: /^REF \(Reference\) keyword for display files/
  };
  EIGHT.forEach((n) => {
    const m = /\(~line (\d+)\)/.exec(KeywordSpec.RECORD_TYPES[n].ddsReference);
    check(n + ': the cited section line (' + (m && m[1]) + ') is that keyword\'s heading in the reference', !!m && HEAD[n].test(rawLines[Number(m[1]) - 1] || ''));
  });

  const igc = section('IGCCNV (DBCS Conversion) keyword This file-level keyword', /24 x 80/);
  const igcE = KeywordSpec.RECORD_TYPES.IGCCNV;
  check('IGCCNV: format IGCCNV(CFnn line-number), a CF key CF01-CF24 not already assigned', /IGCCNV\(CFnn line-number\)/.test(igc) && /Specify any CF key \(CF01 through CF24\)/.test(igc) && /Do not specify a CF key that has already been assigned/.test(igc) && igcE.parameters.commandKey.keyTypes.join() === 'CF' && igcE.parameters.commandKey.first === 'CF01' && igcE.parameters.commandKey.last === 'CF24' && igcE.parameters.commandKey.notAlreadyAssigned === true);
  check('IGCCNV: DBCS stations only, an input-capable DBCS field or IGCALTTYP, 24 x 80, not over USRDFN', /only with files displayed on DBCS display stations/.test(igc) && /input-capable DBCS field, or an input-capable field specified with the IGCALTTYP keyword/.test(igc) && /You must define the file for a 24 x 80 display/.test(igc) && /Do not display the DBCS conversion format over a format that uses the USRDFN/.test(igc) && igcE.requiresDbcsDisplay && igcE.requiresDbcsInputField && igcE.requiresDisplaySize24x80 && igcE.notDisplayedOverRecordTypes.join() === 'USRDFN');
  check('IGCCNV: avoid with CHECK(ME) and with CHECK, CMP, RANGE, VALUES', /Avoid using the IGCCNV keyword with the CHECK\(ME\) keyword/.test(igc) && /field validation keywords \(CHECK, CMP, RANGE, and VALUES\)/.test(igc) && igcE.avoidWith.join() === 'CHECK(ME),CHECK,CMP,RANGE,VALUES');
  check('IGCCNV: option indicators are "not allowed" (the table wording) and the spec agrees', /Option indicators are not allowed with this keyword/.test(igc) && igcE.optionIndicators === 'notValid' && KeywordSpec.noOptionIndicatorsFact('IGCCNV').kind === 'notAllowed');

  const rl = section('DSPRL (Display Right to Left) keyword for display files', /bidirectional/);
  check('DSPRL: file level, no parameters, no option indicators, bidirectional device only', /file-level keyword/.test(rl) && /This keyword has no parameters/.test(rl) && /Option indicators are not valid for this keyword/.test(rl) && /only be used on a bidirectional device/.test(rl) && KeywordSpec.RECORD_TYPES.DSPRL.noParameters && KeywordSpec.RECORD_TYPES.DSPRL.bidirectionalDeviceOnly);

  const sz = section('DSPSIZ (Display Size) keyword for display files You use', /Primary and secondary display sizes/);
  const sp = KeywordSpec.RECORD_TYPES.DSPSIZ.parameters;
  check('DSPSIZ: the two formats', /DSPSIZ\(\*DSw \[\*DSx\]\)/.test(sz) && /DSPSIZ\(lines positions\[condition-name-1\]\[lines positions\[condition-name-2\]\]\)/.test(sz) && sp.formats.length === 2);
  check('DSPSIZ: up to two of *DS3 / *DS4, at least one, never twice; the spec takes both from DSPSIZ_DOMAIN', /Specify up to two parameter values as \*DS3 or \*DS4 in any order\. At least one parameter value is required\. You cannot specify a parameter value twice/.test(sz) && sp.standardNames.join() === '*DS3,*DS4' && sp.maxSizes === 2 && sp.standardNameMayRepeat === false && sp.maxSizes === KeywordSpec.maxDisplaySizes());
  check('DSPSIZ: only 24 x 80 and 27 x 132 are valid', /only 24 x 80, and 27 x 132 are valid/.test(sz) && KeywordSpec.standardDisplaySizes().map((z) => z.lines + 'x' + z.columns).join() === '24x80,27x132');
  check('DSPSIZ: user-defined names are 2 to 8 characters and start with an asterisk', /must be from 2 to 8 characters long, and the first character must be an asterisk/.test(sz) && sp.userNameLength.min === 2 && sp.userNameLength.max === 8 && sp.userNameFirstCharacter === '*');
  check('DSPSIZ: first size primary, second secondary; no DSPSIZ means 24 x 80 only', /the first display size you specify is the primary display size/.test(sz) && sp.firstSizeIsPrimary === true && /can be opened only to display devices with a 24 x 80 display size/.test(sz) && KeywordSpec.RECORD_TYPES.DSPSIZ.absentMeans === '24 x 80 only');
  check('DSPSIZ: user-defined names exclude the IBM names for conditioning; option indicators not valid', /you cannot use IBM-supplied display size condition names for conditioning/.test(sz) && KeywordSpec.RECORD_TYPES.DSPSIZ.userNamesExcludeStandardNamesForConditioning === true && /Option indicators are not valid for this keyword/.test(sz) && KeywordSpec.RECORD_TYPES.DSPSIZ.optionIndicators === 'notValid');

  const er = section('ERRSFL (Error Subfile) keyword for display files', /no parameters/);
  const ee = KeywordSpec.RECORD_TYPES.ERRSFL;
  check('ERRSFL: no parameters, no option indicators, ignored when the message line overlaps a record', /This keyword has no parameters/.test(er) && /Option indicators are not valid for this keyword/.test(er) && /the ERRSFL keyword is ignored/.test(er) && ee.noParameters && ee.ignoredWhenMessageLineOverlapsRecord === true);

  const ia = section('INDARA (Indicator Area) keyword for display files', /separate indicator area/);
  check('INDARA: no parameters, no option indicators, LOGINP / LOGOUT do not log indicators', /This keyword has no parameters/.test(ia) && /Option indicators are not valid for this keyword/.test(ia) && /LOGINP and LOGOUT keywords do not log response or option indicators/.test(ia) && KeywordSpec.RECORD_TYPES.INDARA.loggingOmitsIndicators.join() === 'LOGINP,LOGOUT');

  const ml = section('MSGLOC (Message Location) keyword for display files', /message line/);
  const mp = KeywordSpec.RECORD_TYPES.MSGLOC.parameters;
  check('MSGLOC: required line number 1 through 28 for any display size', /The parameter value is required and must be in the range 1 through 28/.test(ml) && /regardless of the display sizes specified on the DSPSIZ keyword/.test(ml) && mp.lineNumber.required && mp.lineNumber.min === 1 && mp.lineNumber.max === 28);
  check('MSGLOC: diagnostic for 26 to 28 on 24 x 80; defaults 25 and 28', /message location is in the 26 to 28 range for a 24 x 80 display size/.test(ml) && mp.diagnosticOn24x80.min === 26 && mp.diagnosticOn24x80.max === 28 && /24 x 80 display size: line 25 27 x 132 display size: line 28/.test(ml) && mp.defaultLine.map((d) => d.line).join() === '25,28');
  check('MSGLOC: display size condition names are needed for a secondary size that differs from the default; the spec allows them', /Display size condition names must be specified if the message line for the secondary display size is different/.test(ml) && KeywordSpec.RECORD_TYPES.MSGLOC.displaySizeNames === 'valid' && KeywordSpec.RECORD_TYPES.MSGLOC.repeatable === true);
  check('MSGLOC: option indicators are not valid (its section, read from the raw file)', /Option indicators are not valid for this keyword\./.test(REF.slice(REF.indexOf('MSGLOC (Message Location) keyword for display files\n'), REF.indexOf('NOCCSID (No Coded Character Set Identifier) keyword for display files\n'))) && KeywordSpec.RECORD_TYPES.MSGLOC.optionIndicators === 'notValid');
  check('MSGLOC with ERRSFL: 25 (24 x 80) and 28 (27 x 132) refused; default then 24 and 27', /you cannot specify a message location value of 25 for the 24 x 80 display size or 28 for the 27 x 132 display size/.test(ml) && /24 x 80 display size: line 24 27 x 132 display size: line 27/.test(ml) && KeywordSpec.errsflRefusedMsgLocs().map((d) => d.line).join() === '25,28' && KeywordSpec.RECORD_TYPES.ERRSFL.msglocDefaultWithErrsfl.map((d) => d.line).join() === '24,27');

  const op = section('OPENPRT (Open Printer File) keyword for display files', /file-level PRINT keyword/);
  const oe = KeywordSpec.RECORD_TYPES.OPENPRT;
  check('OPENPRT: no parameters, no option indicators, valid only with a file-level PRINT naming a printer file, not record-level PRINT', /This keyword has no parameters/.test(op) && /valid only if you have specified a file-level PRINT keyword with a printer file parameter/.test(op) && /not valid with record-level PRINT keywords/.test(op) && oe.noParameters && oe.requiresInFile.join() === 'PRINT' && oe.requiresPrintFileParameter && oe.notWithRecordLevel.join() === 'PRINT');

  const rf = section('REF (Reference) keyword for display files You use', /database-file-name is a required parameter/);
  const rp = KeywordSpec.RECORD_TYPES.REF.parameters;
  check('REF: format, database file required, library and record format optional, once only', /REF\(\[library-name\/\]database-file-name \[record-format-name\]\)/.test(rf) && /database-file-name is a required parameter/.test(rf) && /library-name and the record-\s?format-name are optional/.test(rf) && /REF can be specified only once/.test(rf) && rp.databaseFileName.required && !rp.libraryName.required && !rp.recordFormatName.required && KeywordSpec.RECORD_TYPES.REF.repeatable === false);
  check('REF: a DDM file may be used, an IDDU file may not; library defaults to *LIBL', /You can specify a distributed data management \(DDM\) file/.test(rf) && /IDDU files cannot be used as reference files/.test(rf) && rp.ddmFileAllowed === true && rp.iddFileAllowed === false && rp.libraryName.default === '*LIBL');
  check('REF: option indicators not valid', /Option indicators are not valid for this keyword/.test(rf) && KeywordSpec.RECORD_TYPES.REF.optionIndicators === 'notValid');
}

console.log('\nPart 2. sweep against the table, the writer and KEYWORD-LOOKUP.json');
{
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8'));
  const names = Array.isArray(lookup) ? lookup.map((k) => k.name || k.keyword || k) : Object.keys(lookup.keywords || lookup);
  const tableNames = DspfWriter.noOptionIndicatorKeywordNames();
  EIGHT.forEach((n) => {
    const inTable = tableNames.indexOf(n) >= 0;
    check(n + ': optionIndicators fact and NO_OPTION_INDICATORS agree (' + (inTable ? 'not valid' : 'valid') + ')', inTable === (KeywordSpec.RECORD_TYPES[n].optionIndicators === 'notValid') && inTable === !KeywordSpec.optionIndicatorsAllowed(n));
    check(n + ': the writer refuses an option indicator added to it', !!DspfWriter.noOptionIndicatorsNewConflictReason(n, [], [{ indicators: [{ number: '01', not: false }] }], 'file'));
    check(n + ': takesNoParameters agrees with the entry (' + NO_PARAMS.includes(n) + ')', KeywordSpec.takesNoParameters(n) === NO_PARAMS.includes(n));
    check(n + ' is in KEYWORD-LOOKUP.json', names.indexOf(n) >= 0);
  });
  check('IGCCNV\'s refusal uses the "not allowed" wording', /not allowed with IGCCNV/.test(DspfWriter.noOptionIndicatorsReason('IGCCNV')));
  check('a display-size condition is still no option indicator on MSGLOC and DSPSIZ', ['MSGLOC', 'DSPSIZ'].every((n) => DspfWriter.noOptionIndicatorsNewConflictReason(n, [], [{ displaySizeCondition: { name: '*DS4', not: false }, indicators: [] }], 'file') === null));
  check('DSPSIZ\'s entry copies DSPSIZ_DOMAIN (names, maximum)', KeywordSpec.RECORD_TYPES.DSPSIZ.parameters.standardNames.join() === KeywordSpec.standardDisplaySizes().map((z) => z.name).join());
  check('setDisplaySizesList still refuses a third size (the spec maximum is 2)', (() => { try { DspfWriter.setDisplaySizesList([], [{ lines: 24, columns: 80 }, { lines: 27, columns: 132 }, { lines: 24, columns: 80 }]); return false; } catch (e) { return /at most two/.test(e.message); } })());
}

console.log('\nPart 3. accessors and writer re-exports');
{
  const l = KeywordSpec.msgLocLimits();
  check('msgLocLimits: 1..28, diagnostic 26..28, defaults 25 / 28', l.min === 1 && l.max === 28 && l.diagnosticMin === 26 && l.diagnosticMax === 28 && l.defaults.map((d) => d.line).join() === '25,28');
  l.defaults.pop(); l.min = 99;
  check('msgLocLimits returns fresh copies', KeywordSpec.msgLocLimits().defaults.length === 2 && KeywordSpec.msgLocLimits().min === 1);
  const r = KeywordSpec.errsflRefusedMsgLocs(); r[0].line = 99;
  check('errsflRefusedMsgLocs returns fresh copies', KeywordSpec.errsflRefusedMsgLocs()[0].line === 25);
  const u = KeywordSpec.dspsizUserNameRule();
  check('dspsizUserNameRule: 2..8 characters, first "*"', u.min === 2 && u.max === 8 && u.firstCharacter === '*');
  check('the writer re-exports all four', DspfWriter.fileDisplayIoKeywords().join() === EIGHT.join() && DspfWriter.msgLocLimits().max === 28 && DspfWriter.errsflRefusedMsgLocs().length === 2 && DspfWriter.dspsizUserNameRule().max === 8);
  check('takesNoParameters / optionIndicatorsAllowed are false for a name outside every slice (unchanged)', KeywordSpec.takesNoParameters('NOSUCH') === false && KeywordSpec.optionIndicatorsAllowed('NOSUCH') === false);
}

console.log('\nPart 4. the rendered file panels');
function render(kw) {
  const root = document.getElementById('root');
  const expanded = new Set();
  const panels = Helpers.fileKeywordsPanelsHtml(kw, expanded);
  root.innerHTML = Object.keys(panels).map((k) => '<div data-panel="' + k + '">' + panels[k] + '</div>').join('');
  Helpers.wireFileKeywordsPanels(() => kw, () => {}, expanded, () => {}, () => ({ records: [] }));
}
const toggle = (id) => document.querySelector('.kw-cond-toggle[data-flag-id="' + id + '"]');
{
  render([]);
  ['indara', 'dsprl', 'errsfl', 'openprt', 'igccnv'].forEach((s) => {
    const n = s.toUpperCase();
    check(n + ': the row is rendered', !!document.getElementById('fk-' + s + '-on'));
    check(n + ': Conditioning toggle absent (the spec says option indicators are not valid)', !toggle('fk-' + s));
  });
  check('INVITE (control): still has its Conditioning toggle', !!toggle('fk-invite'));
  check('REF, MSGLOC and DSPSIZ rows are rendered', !!document.getElementById('fk-ref-library') && !!document.getElementById('fk-msgloc-ds3') && !!document.getElementById('fk-dspsiz-apply'));
  check('the IGCCNV key placeholder names the CF range', document.getElementById('fk-igccnv-key').getAttribute('placeholder') === 'CF01-CF24');
}

console.log('\nPart 5. the rows follow the spec (change a fact, the panel follows)');
{
  const ia = KeywordSpec.RECORD_TYPES.INDARA, ig = KeywordSpec.RECORD_TYPES.IGCCNV;
  const saved = [ia.optionIndicators, ig.optionIndicators];
  try {
    ia.optionIndicators = 'valid'; ig.optionIndicators = 'valid';
    render([]);
    check('INDARA flipped to "valid" in the spec: a Conditioning toggle appears', !!toggle('fk-indara'));
    check('IGCCNV flipped to "valid" in the spec: a Conditioning toggle appears', !!toggle('fk-igccnv'));
    check('DSPRL left alone: still none', !toggle('fk-dsprl'));
  } finally {
    ia.optionIndicators = saved[0]; ig.optionIndicators = saved[1];
  }
  render([]);
  check('restored: no toggle on INDARA or IGCCNV', !toggle('fk-indara') && !toggle('fk-igccnv'));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i121gHelpCommandKeySpec.test.js
 *
 * Task I-121g - "One declarative rule spec per keyword", file-level help,
 * program-control and command-key slice: PASSRCD, USRDSPMGT, HLPFULL, HLPRCD,
 * HLPSCHIDX, and the two command-key patterns CA01-CA24 / CF01-CF24 (one entry
 * each, not 48). Each now has a RECORD_TYPES entry read from DDS_Keyword_V7r6.txt.
 *
 *  1. the entries against the reference text (and each cited line number).
 *  2. sweep: option-indicator facts agree with NO_OPTION_INDICATORS and the writer,
 *     no-parameter facts, KEYWORD-LOOKUP.json, the PASSRCD cross-check against the
 *     other entries' passrcdRestricted flags, the HLP family against its neighbours.
 *  3. accessors (fresh copies, pattern resolution) and the writer re-exports.
 *  4. the rendered file panels: the Conditioning toggle is present exactly where the
 *     spec says option indicators are valid.
 *  5. the rows FOLLOW the spec: flip a fact, re-render, the row changes.
 *
 * Run with: node src/test/i121gHelpCommandKeySpec.test.js
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

const SEVEN = ['PASSRCD', 'USRDSPMGT', 'HLPFULL', 'HLPRCD', 'HLPSCHIDX', 'CA01-CA24', 'CF01-CF24'];
const NO_PARAMS = ['USRDSPMGT', 'HLPFULL'];
const NO_INDICATORS = ['PASSRCD', 'USRDSPMGT', 'HLPFULL', 'HLPSCHIDX'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const RAW = REF.split('\n');
const NORM = REF.replace(/\f/g, ' ').replace(/\n\s*\d+ IBM i: Programming\s*\n/g, '\n').replace(/\n\s*DDS for display files \d+\s*\n/g, '\n').replace(/\s+/g, ' ');
/** The real section for `heading`: the first occurrence whose body (up to the next keyword heading) matches `mustContain`. */
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
/** Raw reference lines [from, to] (1-based, inclusive), whitespace-collapsed - for sections whose end the heading search cannot find. */
const rawSlice = (from, to) => RAW.slice(from - 1, to).join(' ').replace(/\s+/g, ' ');

console.log('\nPart 1. the entries against the DDS Reference');
{
  check('the slice owns exactly the seven keywords, in order', KeywordSpec.fileHelpCommandKeywords().join() === SEVEN.join());
  check('fileHelpCommandKeywords returns a fresh array', (() => { const a = KeywordSpec.fileHelpCommandKeywords(); a.pop(); return KeywordSpec.fileHelpCommandKeywords().length === 7; })());
  SEVEN.forEach((n) => {
    const e = KeywordSpec.RECORD_TYPES[n];
    check(n + ' has a RECORD_TYPES entry with a citation carrying a line number', !!e && /line \d+/.test(e.ddsReference));
  });
  const HEAD = {
    PASSRCD: /^PASSRCD \(Passed Record\) keyword for display files/, USRDSPMGT: /^USRDSPMGT \(User Display Management\) keyword for display files/,
    HLPFULL: /^HLPFULL \(Help Full\) keyword for display files/, HLPRCD: /^HLPRCD \(Help Record\) keyword for display files/,
    HLPSCHIDX: /^HLPSCHIDX \(Help Search Index\) keyword for display files/, 'CA01-CA24': /^CAnn \(Command Attention\) keyword for display files/,
    'CF01-CF24': /^CFnn \(Command Function\) keyword for display files/
  };
  SEVEN.forEach((n) => {
    const m = /\(~line (\d+)/.exec(KeywordSpec.RECORD_TYPES[n].ddsReference);
    check(n + ': the first cited line (' + (m && m[1]) + ') is that keyword\'s heading in the reference', !!m && HEAD[n].test(RAW[Number(m[1]) - 1] || ''));
  });
  check('USRDSPMGT: the second cited line (14167) is the System/36 copy of the heading', /^USRDSPMGT \(User Display Management\) keyword\s*$/.test(RAW[14166] || '') && /~line 14167/.test(KeywordSpec.RECORD_TYPES.USRDSPMGT.ddsReference));

  const pr = section('PASSRCD (Passed Record) keyword for display files', /record-format-name is a required parameter/);
  const pe = KeywordSpec.RECORD_TYPES.PASSRCD;
  check('PASSRCD: format, name required and must exist in the file', /PASSRCD\(record-format-name\)/.test(pr) && /record-format-name is a required parameter value for this keyword and must exist in the file/.test(pr) && pe.parameters.recordFormatName.required && pe.parameters.recordFormatName.mustExistInFile);
  check('PASSRCD: ALWROL, CLRL and SLNO cannot be on the record; option indicators not valid', /following keywords cannot be specified on the record format: ALWROL CLRL SLNO/.test(pr) && pe.ownSectionRestrictedKeywords.join() === 'ALWROL,CLRL,SLNO' && /Option indicators are not valid for this keyword/.test(pr) && pe.optionIndicators === 'notValid');
  check('PASSRCD: processed only if the first request is an input without a record format name', /processed only if your program's first request after file open is an input operation without a record format name/.test(pr) && pe.passedDataProcessedOnlyIfFirstRequestIsInputWithoutFormat === true);

  const um1 = section('USRDSPMGT (User Display Management) keyword for display files', /held until the data is overwritten or cleared by using the CLRL keyword/);
  const um2 = rawSlice(14167, 14195);
  const ue = KeywordSpec.RECORD_TYPES.USRDSPMGT;
  check('USRDSPMGT: data held until overwritten or cleared with CLRL; no parameters (first section)', /all data written to the display is held until the data is overwritten or cleared by using the CLRL keyword/.test(um1) && /This keyword has no parameters/.test(um1) && ue.noParameters === true);
  check('USRDSPMGT: its own list of eight forbidden keywords (System/36 copy)', /You cannot use USRDSPMGT in display files containing any of the following keywords: ASSUME ERASE HLPCMDKEY IGCCNV KEEP PUTRETAIN SFL SFLCTL/.test(um2) && ue.cannotCoexistWith.join() === 'ASSUME,ERASE,HLPCMDKEY,IGCCNV,KEEP,PUTRETAIN,SFL,SFLCTL');
  const cons = rawSlice(13897, 13912);
  check('USRDSPMGT: the System/36 considerations list of twelve (the eight plus ERRSFL, MNUBAR, PULLDOWN, SNGCHCFLD)', /ASSUME\s+MNUBAR ERASE\s+PULLDOWN ERRSFL\s+PUTRETAIN HLPCMDKEY\s+SFL IGCCNV\s+SFLCTL KEEP\s+SNGCHCFLD/.test(cons) && ue.cannotCoexistWithConsiderationsList.length === 12 && ue.cannotCoexistWith.every((k) => ue.cannotCoexistWithConsiderationsList.indexOf(k) >= 0) && ['ERRSFL', 'MNUBAR', 'PULLDOWN', 'SNGCHCFLD'].every((k) => ue.cannotCoexistWithConsiderationsList.indexOf(k) >= 0));
  check('USRDSPMGT: OVERLAY ignored; option indicators not valid (stated in the System/36 copy only)', /the OVERLAY keyword is ignored\. Option indicators are not valid for this keyword/.test(um2) && !/Option indicators/.test(um1) && ue.overlayIgnored && ue.optionIndicators === 'notValid');

  const hf = section('HLPFULL (Help Full) keyword for display files', /full screen/);
  const hfe = KeywordSpec.RECORD_TYPES.HLPFULL;
  check('HLPFULL: no parameters, no option indicators, full screen instead of windows', /file-level keyword/.test(hf) && /This keyword has no parameters/.test(hf) && /Option indicators are not valid for this keyword/.test(hf) && hfe.noParameters && hfe.optionIndicators === 'notValid');
  check('HLPFULL: HLPPNLGRP required at the file or help specification level; absent means a window unless *HLPFULL', /you must specify the HLPPNLGRP keyword either at the file level or at the help specification level/.test(hf) && hfe.requiresKeywordAtLevels.keyword === 'HLPPNLGRP' && hfe.requiresKeywordAtLevels.levels.join() === 'file,helpSpecification' && /displayed in a window unless the \*HLPFULL option is specified for the user profile/.test(hf) && /\*HLPFULL/.test(hfe.absentMeans));

  const hr = section('HLPRCD (Help Record) keyword for display files', /record-format-name \[\[library-name\/\]file-name\]/);
  const hre = KeywordSpec.RECORD_TYPES.HLPRCD;
  check('HLPRCD: file or help-specification level; format; record format required', /file-level or help-specification-level keyword/.test(hr) && /HLPRCD\(record-format-name \[\[library-name\/\]file-name\]\)/.test(hr) && hre.levels.join() === 'file,help' && hre.parameters.recordFormatName.required);
  check('HLPRCD: file defaults to the file being defined; library defaults to *LIBL', /If you do not specify the file name, the record format must exist in the file being defined/.test(hr) && /The current library list \(\*LIBL\) at program run time is used if you do not specify the library name/.test(hr) && !hre.parameters.fileName.required && !hre.parameters.libraryName.required && hre.parameters.libraryName.default === '*LIBL');
  check('HLPRCD: the file-level record shows when no help area holds the cursor; option indicators ARE valid', /file-level HLPRCD keyword is displayed when no help area for the active records contains the current cursor location/.test(hr) && hre.fileLevelShownWhenNoHelpAreaHoldsCursor === true && /Option indicators are valid for this keyword/.test(hr) && hre.optionIndicators === 'valid');

  const hs = section('HLPSCHIDX (Help Search Index) keyword for display files', /index search function/);
  const hse = KeywordSpec.RECORD_TYPES.HLPSCHIDX;
  check('HLPSCHIDX: format; F11 index search; library *LIBL; object need not exist at creation', /HLPSCHIDX\(\[library-name\/\]search-index-object\)/.test(hs) && /index search function \(F11 on the Help display\)/.test(hs) && /If you do not specify a library name, \*LIBL is used/.test(hs) && /search index object need not exist when the display file is created/.test(hs) && hse.enablesIndexSearchKey === 'F11' && hse.parameters.libraryName.default === '*LIBL' && hse.parameters.searchIndexObject.mustExistAtCreation === false);
  check('HLPSCHIDX: needs at least one HLPPNLGRP; cannot be with HLPSHELF; option indicators not valid', /valid only when at least one HLPPNLGRP keyword is specified in the file/.test(hs) && /cannot be specified with the HLPSHELF keyword/.test(hs) && hse.requiresInFile.join() === 'HLPPNLGRP' && hse.excludesInFile.join() === 'HLPSHELF' && /Option indicators are not valid for this keyword/.test(hs) && hse.optionIndicators === 'notValid');

  const ca = section('CAnn (Command Attention) keyword for display files', /Command Attention|command attention/);
  const cf = section('CFnn (Command Function) keyword for display files', /command function/);
  [['CA01-CA24', ca, 'CA', /CAnn\[\(response-indicator \['text'\]\)\]/, /CA01 through CA24/, /for example, CA04/, /No input data is transmitted from the device/, false],
   ['CF01-CF24', cf, 'CF', /CFnn\[\(response-indicator \['text'\]\)\]/, /CF01 through CF24/, /for example, CF03/, /Data is placed in the input buffer according to data received from the device/, true]].forEach(([name, body, type, fmt, range, zero, transmit, transmits]) => {
    const e = KeywordSpec.RECORD_TYPES[name];
    check(name + ': file or record level, format, key range, leading zero', /file-level or record-level keyword/.test(body) && fmt.test(body) && range.test(body) && zero.test(body) && e.levels.join() === 'file,record' && e.pattern.type === type && e.pattern.first === 1 && e.pattern.last === 24 && e.pattern.digits === 2 && e.parameters.keyNumberMustHaveLeadingZero === true);
    check(name + ': response indicators 01-99 valid, optional', /Response indicators 01 through 99 are valid/.test(body) && e.parameters.responseIndicator.min === 1 && e.parameters.responseIndicator.max === 99 && e.parameters.responseIndicator.required === false);
    check(name + ': ' + (transmits ? 'transmits changed input data' : 'transmits no input data'), transmit.test(body) && e.transmitsInputData === transmits);
    check(name + ': the same key number cannot be both CA and CF; file-level keys extend to the record level', /you cannot specify the same key number as both/.test(body) && /File level CA and CF keys are extended to the record level/.test(body) && e.sameKeyNumberAsOtherType === 'notAllowed' && e.fileLevelKeysExtendToRecordLevel === true);
    check(name + ': option indicators are valid (the section says so)', /Option indicators are valid for this keyword/.test(body) && e.optionIndicators === 'valid');
  });
}

console.log('\nPart 2. sweep against the table, the writer, KEYWORD-LOOKUP.json and the neighbouring entries');
{
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8'));
  const names = Object.keys(lookup.keywords || lookup);
  const tableNames = DspfWriter.noOptionIndicatorKeywordNames();
  SEVEN.forEach((n) => {
    const inTable = tableNames.indexOf(n) >= 0;
    check(n + ': optionIndicators fact and NO_OPTION_INDICATORS agree (' + (inTable ? 'not valid' : 'valid') + ')', inTable === (KeywordSpec.RECORD_TYPES[n].optionIndicators === 'notValid') && inTable === !KeywordSpec.optionIndicatorsAllowed(n) && inTable === (NO_INDICATORS.indexOf(n) >= 0));
    check(n + ': takesNoParameters agrees with the entry (' + NO_PARAMS.includes(n) + ')', KeywordSpec.takesNoParameters(n) === NO_PARAMS.includes(n));
    check(n + ' is in KEYWORD-LOOKUP.json', names.indexOf(n) >= 0);
  });
  NO_INDICATORS.forEach((n) => check(n + ': the writer refuses an option indicator added to it', !!DspfWriter.noOptionIndicatorsNewConflictReason(n, [], [{ indicators: [{ number: '01', not: false }] }], 'file')));
  ['HLPRCD'].forEach((n) => check(n + ': the writer does NOT refuse an option indicator (valid)', DspfWriter.noOptionIndicatorsNewConflictReason(n, [], [{ indicators: [{ number: '01', not: false }] }], 'file') === null));
  check('the pattern names are not in the option-indicator table (the table is keyed by concrete names; their facts live on the entries)', tableNames.indexOf('CA01-CA24') < 0 && tableNames.indexOf('CF01-CF24') < 0 && tableNames.indexOf('CA01') < 0);

  // PASSRCD cross-check: the section lists three, WINDOW's own section adds the fourth.
  const flagged = KeywordSpec.passrcdRestrictedKeywords().slice().sort().join();
  check('PASSRCD cross-check: its own three plus WINDOW are exactly the passrcdRestricted entries', flagged === KeywordSpec.passrcdOwnSectionRestricted().concat(['WINDOW']).sort().join());
  check('PASSRCD cross-check: each of its own three is flagged on its own entry', KeywordSpec.passrcdOwnSectionRestricted().every((k) => KeywordSpec.isPassrcdRestricted(k)));

  // HLP family: one owner per pair.
  check('the HLPPNLGRP / HLPRCD exclusion has one owner (HLPPNLGRP), not repeated on HLPRCD', KeywordSpec.RECORD_TYPES.HLPPNLGRP.mutex.indexOf('HLPRCD') >= 0 && !KeywordSpec.RECORD_TYPES.HLPRCD.mutex);
  check('HLPSCHIDX and HLPFULL both depend on HLPPNLGRP in their own sections; HLPSCHIDX excludes HLPSHELF', KeywordSpec.fileRequires('HLPSCHIDX').join() === 'HLPPNLGRP' && KeywordSpec.fileExcludes('HLPSCHIDX').join() === 'HLPSHELF' && KeywordSpec.RECORD_TYPES.HLPFULL.requiresKeywordAtLevels.keyword === 'HLPPNLGRP');
  // USRDSPMGT: neighbours that already carry the exclusion agree with its list.
  check('HLPCMDKEY\'s own excludesInFile USRDSPMGT agrees with USRDSPMGT\'s list naming HLPCMDKEY', KeywordSpec.fileExcludes('HLPCMDKEY').indexOf('USRDSPMGT') >= 0 && KeywordSpec.usrdspmgtForbiddenKeywords().own.indexOf('HLPCMDKEY') >= 0);
  check('ASSUME\'s section also lists USRDSPMGT; USRDSPMGT lists ASSUME (both directions stated)', /ALWROL, CLRL, SFL, SLNO, USRDFN, USRDSPMGT/.test(KeywordSpec.RECORD_TYPES.ASSUME.ddsReference) && KeywordSpec.usrdspmgtForbiddenKeywords().own.indexOf('ASSUME') >= 0);
  check('the S36E response-restriction table (I-121p) is untouched: still eight keywords', KeywordSpec.s36eRestrictedKeywords().length === 8);
}

console.log('\nPart 3. accessors and writer re-exports');
{
  const a = KeywordSpec.commandKeyEntry('CA05');
  check('commandKeyEntry resolves CA05 to the CA pattern entry and CF24 to the CF one', a === KeywordSpec.RECORD_TYPES['CA01-CA24'] && KeywordSpec.commandKeyEntry('CF24') === KeywordSpec.RECORD_TYPES['CF01-CF24'] && KeywordSpec.commandKeyEntry('CA01') === a);
  check('commandKeyEntry refuses CA00, CA25, CF99, lowercase, padding and non-keys', ['CA00', 'CA25', 'CF99', 'ca05', ' CA05', 'CA5', 'CAnn', 'SFLDROP', '', null, undefined, 5].every((t) => KeywordSpec.commandKeyEntry(t) === null));
  const o = KeywordSpec.usrdspmgtForbiddenKeywords(); o.own.pop(); o.considerations.pop();
  check('usrdspmgtForbiddenKeywords returns fresh copies (8 and 12)', KeywordSpec.usrdspmgtForbiddenKeywords().own.length === 8 && KeywordSpec.usrdspmgtForbiddenKeywords().considerations.length === 12);
  const p = KeywordSpec.passrcdOwnSectionRestricted(); p.pop();
  check('passrcdOwnSectionRestricted returns a fresh copy', KeywordSpec.passrcdOwnSectionRestricted().length === 3);
  check('the writer re-exports all four', DspfWriter.fileHelpCommandKeywords().join() === SEVEN.join() && DspfWriter.commandKeyEntry('CF01') === KeywordSpec.RECORD_TYPES['CF01-CF24'] && DspfWriter.passrcdOwnSectionRestricted().length === 3 && DspfWriter.usrdspmgtForbiddenKeywords().own.length === 8);
  check('the pattern entries do not disturb the existing command-key grammar', KeywordSpec.parseCommandKey('CA05').type === 'CA' && KeywordSpec.isCommandKeyName('CF24') && !KeywordSpec.isCommandKeyName('CA01-CA24'));
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
  ['usrdspmgt', 'hlpfull', 'hlpschidx'].forEach((s) => {
    check(s.toUpperCase() + ': the row is rendered', !!document.getElementById('fk-' + s + '-on'));
    check(s.toUpperCase() + ': Conditioning toggle absent (the spec says option indicators are not valid)', !toggle('fk-' + s));
  });
  check('PASSRCD: the record-name box is rendered', !!document.getElementById('fk-passrcd'));
  check('HLPRCD: Conditioning toggle present (the spec says option indicators are valid)', !!toggle('fk-hlprcd'));
  check('INVITE (control): still has its Conditioning toggle', !!toggle('fk-invite'));
}

console.log('\nPart 5. the rows follow the spec (change a fact, the panel follows)');
{
  const names = ['USRDSPMGT', 'HLPFULL', 'HLPSCHIDX'];
  const saved = names.map((n) => KeywordSpec.RECORD_TYPES[n].optionIndicators);
  try {
    names.forEach((n) => { KeywordSpec.RECORD_TYPES[n].optionIndicators = 'valid'; });
    render([]);
    names.forEach((n) => check(n + ' flipped to "valid" in the spec: a Conditioning toggle appears', !!toggle('fk-' + n.toLowerCase())));
  } finally {
    names.forEach((n, i) => { KeywordSpec.RECORD_TYPES[n].optionIndicators = saved[i]; });
  }
  render([]);
  check('restored: no toggle on USRDSPMGT, HLPFULL or HLPSCHIDX', names.every((n) => !toggle('fk-' + n.toLowerCase())));
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

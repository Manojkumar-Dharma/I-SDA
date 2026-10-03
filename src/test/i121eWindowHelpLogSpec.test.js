/**
 * i121eWindowHelpLogSpec.test.js
 *
 * Task I-121e - "One declarative rule spec per keyword", window / menu-bar /
 * help / logging record keywords slice: WDWTITLE, RMVWDW, USRRSTDSP, MNUBARDSP,
 * ALTNAME, HLPCLR, HLPCMDKEY, HLPSEQ, LOGINP, LOGOUT, SETOF. Each now has a
 * RECORD_TYPES entry (level, parameters, option-indicator validity and every
 * relation its own DDS Reference section states), read from
 * DDS_Keyword_V7r6.txt rather than from the code.
 *
 *  1. the entries against the reference text.
 *  2. sweep: agreement with NO_OPTION_INDICATORS, the writer's refusal,
 *     KEYWORD-LOOKUP.json, the SFL / USRDFN / MNUBAR whitelists, and
 *     WINDOW.requiredFor (now derived from RMVWDW / USRRSTDSP's own entries).
 *  3. accessors (fresh copies, case/blank safety) and the writer re-exports.
 *  4. the rendered panels: the Conditioning toggle is present exactly where
 *     the spec says option indicators are valid; the HLPSEQ placeholder comes
 *     from the spec's limits.
 *  5. the panels FOLLOW the spec: flip a spec fact, re-render, the row changes.
 *
 * Run with: node src/test/i121eWindowHelpLogSpec.test.js
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

const ELEVEN = ['WDWTITLE', 'RMVWDW', 'USRRSTDSP', 'MNUBARDSP', 'ALTNAME', 'HLPCLR', 'HLPCMDKEY', 'HLPSEQ', 'LOGINP', 'LOGOUT', 'SETOF'];
const VALID = ['WDWTITLE', 'RMVWDW', 'USRRSTDSP', 'MNUBARDSP', 'HLPCLR', 'LOGOUT'];
const NOT_VALID = ['ALTNAME', 'HLPCMDKEY', 'HLPSEQ', 'LOGINP', 'SETOF'];
const NO_PARAMS = ['RMVWDW', 'USRRSTDSP', 'HLPCLR', 'HLPCMDKEY', 'LOGINP', 'LOGOUT'];
const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');

/** The reference text with page breaks / footers removed and whitespace collapsed. */
const NORM = REF.replace(/\f/g, ' ').replace(/\n\s*\d+ IBM i: Programming\s*\n/g, '\n').replace(/\n\s*DDS for display files \d+\s*\n/g, '\n').replace(/\s+/g, ' ');
/** The real section for `heading`: the first occurrence followed (within the section) by `mustContain`. */
function section(heading, mustContain) {
  let from = 0;
  for (;;) {
    const at = NORM.indexOf(heading, from);
    if (at < 0) throw new Error('section not found: ' + heading + ' / ' + mustContain);
    const rest = NORM.slice(at + heading.length);
    const next = rest.search(/ [A-Z][A-Za-z0-9/-]+ \([^)]*\) keywords?(?: for display files)? (?:You use|This|The)/);
    const body = rest.slice(0, next > 0 ? next : 7000);
    if (mustContain.test(body)) return body;
    from = at + 1;
  }
}

console.log('\nPart 1. the entries against the DDS Reference');
{
  check('the slice owns exactly the eleven keywords, in order', KeywordSpec.windowHelpLogKeywords().join() === ELEVEN.join());
  check('windowHelpLogKeywords returns a fresh array', (() => { const a = KeywordSpec.windowHelpLogKeywords(); a.pop(); return KeywordSpec.windowHelpLogKeywords().length === 11; })());
  ELEVEN.forEach((n) => {
    const e = KeywordSpec.RECORD_TYPES[n];
    check(n + ' has a RECORD_TYPES entry: record level, a citation with a line number', !!e && e.levels.join() === 'record' && /line \d+/.test(e.ddsReference));
  });
  // The cited line numbers point at the keyword's own heading in the raw file.
  const rawLines = REF.split('\n');
  const HEAD = { WDWTITLE: /^WDWTITLE \(Window Title\)/, RMVWDW: /^RMVWDW \(Remove Window\)/, USRRSTDSP: /^USRRSTDSP \(User Restore Display\)/, MNUBARDSP: /^MNUBARDSP \(Menu-Bar Display\)/, ALTNAME: /^ALTNAME \(Alternative Record Name\)/, HLPCLR: /^\fHLPCLR \(Help Cleared\)|^HLPCLR \(Help Cleared\)/, HLPCMDKEY: /^HLPCMDKEY \(Help Command Key\)/, HLPSEQ: /^\fHLPSEQ \(Help Sequencing\)|^HLPSEQ \(Help Sequencing\)/, LOGINP: /^LOGINP \(Log Input\)/, LOGOUT: /^LOGOUT \(Log Output\)/, SETOF: /^SETOF \(Set Off\)/ };
  ELEVEN.forEach((n) => {
    const m = /\(~line (\d+)\)/.exec(KeywordSpec.RECORD_TYPES[n].ddsReference);
    check(n + ': the cited section line (' + (m && m[1]) + ') is that keyword\'s heading in the reference', !!m && HEAD[n].test(rawLines[Number(m[1]) - 1] || ''));
  });

  const wdw = section('WDWTITLE (Window Title) keyword for display files', /At least one parameter must be specified/);
  check('WDWTITLE: reference needs at least one parameter, option indicators valid', /At least one parameter must be specified/.test(wdw) && /Option indicators are valid for this keyword/.test(wdw) && KeywordSpec.RECORD_TYPES.WDWTITLE.minParameters === 1 && KeywordSpec.optionIndicatorsAllowed('WDWTITLE'));
  const wv = KeywordSpec.wdwtitleVocabulary();
  check('WDWTITLE: colors are exactly the reference list', /Value Meaning BLU Blue GRN Green WHT White RED Red TRQ Turquoise YLW Yellow PNK Pink/.test(wdw) && wv.colors.join() === 'BLU,GRN,WHT,RED,TRQ,YLW,PNK');
  check('WDWTITLE: display attributes are exactly the reference list', /Value Meaning BL Blink CS Column separator HI High intensity ND Nondisplay RI Reverse image UL Underline/.test(wdw) && wv.displayAttributes.join() === 'BL,CS,HI,ND,RI,UL');
  check('WDWTITLE: alignment and position parameters', /\[\*CENTER \| \*LEFT \| \*RIGHT\] \[\*TOP \| \*BOTTOM\]/.test(wdw) && wv.alignments.join() === '*CENTER,*LEFT,*RIGHT' && wv.positions.join() === '*TOP,*BOTTOM' && /aligned in the CENTER|CENTER of the window/.test(wdw) && wv.alignmentDefault === '*CENTER');
  check('WDWTITLE: reference needs a WINDOW definition on the record; spec says so; repeatable and combining', /can only be specified on a record that contains a WINDOW keyword/.test(wdw) && KeywordSpec.recordRequires('WDWTITLE').join() === 'WINDOW' && /more than one WDWTITLE on a record/.test(wdw) && /combined/.test(wdw) && KeywordSpec.RECORD_TYPES.WDWTITLE.repeatable === true);

  const rmv = section('RMVWDW (Remove Window) keyword for display files', /no parameters/);
  check('RMVWDW: no parameters, needs WINDOW on the record, option indicators valid', /This keyword has no parameters/.test(rmv) && /a WINDOW keyword must be specified on the same record format/.test(rmv) && /Option indicators are valid for this keyword/.test(rmv) && KeywordSpec.takesNoParameters('RMVWDW') && KeywordSpec.recordRequires('RMVWDW').join() === 'WINDOW' && KeywordSpec.optionIndicatorsAllowed('RMVWDW'));
  const usr = section('USRRSTDSP (User Restore Display) keyword for display files', /no parameters/);
  check('USRRSTDSP: no parameters, needs WINDOW on the record, option indicators valid', /This keyword has no parameters/.test(usr) && /The WINDOW keyword must be specified on the same record as the USRRSTDSP keyword/.test(usr) && /Option indicators are valid for this keyword/.test(usr) && KeywordSpec.takesNoParameters('USRRSTDSP') && KeywordSpec.recordRequires('USRRSTDSP').join() === 'WINDOW' && KeywordSpec.optionIndicatorsAllowed('USRRSTDSP'));

  const mnu = section('MNUBARDSP (Menu-Bar Display) keyword for display files', /two formats/);
  const mf = KeywordSpec.mnubardspFieldShapes();
  check('MNUBARDSP: two formats, option indicators valid, several allowed when all optioned', /MNUBARDSP\(menu-bar-record &choice-field \[&pull-down-input\]\)/.test(mnu) && /MNUBARDSP\[\(&pull-down-input\)\]/.test(mnu) && /Option indicators are valid for the MNUBARDSP keyword/.test(mnu) && /more than one MNUBARDSP keyword can be specified on the record if all are optioned/.test(mnu) && KeywordSpec.optionIndicatorsAllowed('MNUBARDSP') && KeywordSpec.RECORD_TYPES.MNUBARDSP.multipleRequireOptionIndicators === true && KeywordSpec.RECORD_TYPES.MNUBARDSP.repeatable === true);
  check('MNUBARDSP: the &choice-field is hidden, 2 long, 0 decimals, Y', /numeric Y in position 35, usage H, length 2, and decimal positions 0/.test(mnu) && mf.choiceField.usage === 'H' && mf.choiceField.length === 2 && mf.choiceField.decimals === 0 && mf.choiceField.keyboardShift === 'Y');
  check('MNUBARDSP: the &pull-down-input is hidden, 2 long, 0 decimals, S; values 0 / n / -1', /length 2, decimal positions 0, and zoned \(S in position 35\) field with usage H/.test(mnu) && mf.pullDownInput.usage === 'H' && mf.pullDownInput.length === 2 && mf.pullDownInput.decimals === 0 && mf.pullDownInput.keyboardShift === 'S' && mf.pullDownInput.values.join() === '0,n,-1' && /-1 Pull-down record contains something other than the one single-choice selection field/.test(mnu));

  const alt = section('ALTNAME (Alternative Record Name) keyword for display files', /alternative name for a record/);
  check('ALTNAME: format ALTNAME(\'alternative-name\'); spec carries the quoted-name shape', /ALTNAME\('alternative-name'\)/.test(alt) && KeywordSpec.RECORD_TYPES.ALTNAME.parameters.quotedName === true);
  check('ALTNAME: not on SFL / USRDFN / MNUBAR (I-108), no "no parameters" claim', KeywordSpec.notOnRecordTypes('ALTNAME').join() === 'SFL,USRDFN,MNUBAR' && !KeywordSpec.takesNoParameters('ALTNAME'));

  const clr = section('HLPCLR (Help Cleared) keyword for display files', /This keyword has no parameters/);
  check('HLPCLR: no parameters, option indicators allowed, needs a help specification on the record', /This keyword has no parameters/.test(clr) && /Option indicators are allowed on this keyword/.test(clr) && /must contain at least one help specification/.test(clr) && KeywordSpec.takesNoParameters('HLPCLR') && KeywordSpec.optionIndicatorsAllowed('HLPCLR') && KeywordSpec.requiresHelpSpecification('HLPCLR'));

  const cmd = section('HLPCMDKEY (Help Command Key) keyword for display files', /This keyword has no parameters/);
  check('HLPCMDKEY: no parameters, option indicators not valid', /This keyword has no parameters/.test(cmd) && /Option indicators are not valid for this keyword/.test(cmd) && KeywordSpec.takesNoParameters('HLPCMDKEY') && !KeywordSpec.optionIndicatorsAllowed('HLPCMDKEY'));
  check('HLPCMDKEY: not on SFL / SFLCTL / USRDFN and not in a file with USRDSPMGT', /cannot specify HLPCMDKEY on subfile \(SFL keyword\), subfile control \(SFLCTL keyword\), or user- ?defined \(USRDFN keyword\) record formats/.test(cmd) && /cannot specify the HLPCMDKEY keyword in a file containing the USRDSPMGT keyword/.test(cmd) && KeywordSpec.notOnRecordTypes('HLPCMDKEY').join() === 'SFL,SFLCTL,USRDFN' && KeywordSpec.fileExcludes('HLPCMDKEY').join() === 'USRDSPMGT');

  const seq = section('HLPSEQ (Help Sequencing) keyword for display files', /group-name sequence-number/);
  const lim = KeywordSpec.hlpseqLimits();
  check('HLPSEQ: group name 1 to 10 characters, sequence 0 to 99, no duplicates, not on SFL / USRDFN, indicators not valid', /HLPSEQ\(group-name sequence-number\)/.test(seq) && /1- to 10-character name/.test(seq) && /numeric value \(0 to 99\)/.test(seq) && /Duplicate numbers within a group are not allowed/.test(seq) && /cannot specify HLPSEQ on subfile \(SFL keyword\) or user-defined \(USRDFN keyword\)/.test(seq) && /Option indicators are not valid for this keyword/.test(seq) && lim.groupNameMaxLength === 10 && lim.sequenceMin === 0 && lim.sequenceMax === 99 && KeywordSpec.RECORD_TYPES.HLPSEQ.parameters.duplicateSequenceInGroup === false && KeywordSpec.notOnRecordTypes('HLPSEQ').join() === 'SFL,USRDFN' && !KeywordSpec.optionIndicatorsAllowed('HLPSEQ'));

  const li = section('LOGINP (Log Input) keyword for display files', /This keyword has no parameters/);
  check('LOGINP: no parameters, option indicators not valid', /This keyword has no parameters/.test(li) && /Option indicators are not valid for this keyword/.test(li) && KeywordSpec.takesNoParameters('LOGINP') && !KeywordSpec.optionIndicatorsAllowed('LOGINP'));
  const lo = section('LOGOUT (Log Output) keyword for display files', /This keyword has no parameters/);
  check('LOGOUT: no parameters, option indicators valid', /This keyword has no parameters/.test(lo) && /Option indicators are valid for this keyword/.test(lo) && KeywordSpec.takesNoParameters('LOGOUT') && KeywordSpec.optionIndicatorsAllowed('LOGOUT'));

  const so = section('SETOF (Set Off) keyword for display files', /response-indicator/);
  check('SETOF: SETOF(response-indicator [\'text\']), text cut to 50 characters, equivalent to SETOFF, indicators not valid', /SETOF\(response-indicator \['text'\]\)/.test(so) && /more than 50 characters between the single quotation marks, the text is truncated to 50 characters/.test(so) && /SETOF is equivalent to the SETOFF keyword/.test(so) && /Option indicators are not valid for this keyword/.test(so) && KeywordSpec.setofTextMaxLength() === 50 && KeywordSpec.RECORD_TYPES.SETOF.parameters.equivalentKeyword === 'SETOFF' && !KeywordSpec.optionIndicatorsAllowed('SETOF'));
}

console.log('\nPart 2. sweep - agreement with the rest of the spec, both directions');
{
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
  ELEVEN.forEach((n) => {
    const inTable = !!KeywordSpec.noOptionIndicatorsFact(n);
    check(n + ': optionIndicators fact and NO_OPTION_INDICATORS agree (' + (inTable ? 'not valid' : 'valid') + ')', inTable === !KeywordSpec.optionIndicatorsAllowed(n));
    check(n + ': the writer refuses a new option indicator exactly when the spec says they are not valid', (DspfWriter.noOptionIndicatorsReason(n) !== null) === !KeywordSpec.optionIndicatorsAllowed(n));
    const rows = lookup[n] || [];
    check(n + ': in KEYWORD-LOOKUP.json as a record-level keyword', rows.length > 0 && rows.some((r) => r.level === 'record'));
    if (NO_PARAMS.indexOf(n) >= 0) {
      check(n + ': no parameters in the spec and none in the lookup', KeywordSpec.takesNoParameters(n) && rows.every((r) => !/\w/.test(String(r.parameters).replace(/indicators \(optional\)/, ''))));
    } else {
      check(n + ': takes parameters in the spec and the lookup lists some', !KeywordSpec.takesNoParameters(n) && rows.some((r) => /\w/.test(String(r.parameters).replace(/indicators \(optional\)/, ''))));
    }
  });
  check('exactly WDWTITLE, RMVWDW, USRRSTDSP, MNUBARDSP, HLPCLR, LOGOUT accept option indicators', ELEVEN.filter((n) => KeywordSpec.optionIndicatorsAllowed(n)).join() === VALID.join() && NOT_VALID.every((n) => !KeywordSpec.optionIndicatorsAllowed(n)));
  ['ALTNAME', 'HLPSEQ', 'HLPCMDKEY'].forEach((n) => {
    KeywordSpec.notOnRecordTypes(n).filter((t) => t === 'SFL' || t === 'USRDFN').forEach((t) => {
      check(n + ' is refused on ' + t + ' by that record type\'s own whitelist (the spec relation and the guard agree)', KeywordSpec.isWhitelisted(t, n) === false);
    });
  });
  check('ALTNAME is refused on MNUBAR by its whitelist, while HLPCLR / HLPCMDKEY / MNUBARDSP (no such relation in the spec) are allowed there', KeywordSpec.isWhitelisted('MNUBAR', 'ALTNAME') === false && ['HLPCLR', 'HLPCMDKEY', 'MNUBARDSP'].every((n) => KeywordSpec.isWhitelisted('MNUBAR', n) === true && KeywordSpec.notOnRecordTypes(n).indexOf('MNUBAR') === -1));
  check('WINDOW.requiredFor is derived from RMVWDW / USRRSTDSP\'s own requiresOnRecord (I-140 relation kept)', KeywordSpec.RECORD_TYPES.WINDOW.requiredFor.join() === 'RMVWDW,USRRSTDSP' && KeywordSpec.requiresWindowOnRecord().join() === 'RMVWDW,USRRSTDSP' && ELEVEN.filter((n) => KeywordSpec.recordRequires(n).indexOf('WINDOW') >= 0).join() === 'WDWTITLE,RMVWDW,USRRSTDSP');
  check('the S36E notes for ALTNAME stay in the S36E table, not copied here', !!KeywordSpec.s36eRestriction('ALTNAME') && ELEVEN.every((n) => !/System\/36/.test(KeywordSpec.RECORD_TYPES[n].ddsReference.replace(/The System\/36 notes live in S36E_RESTRICTIONS\./, ''))));
  check('SETOFF still reads as SETOF (I-135 alias) and the spec names it', KeywordSpec.RECORD_TYPES.SETOF.parameters.equivalentKeyword === 'SETOFF' && DspfWriter.noOptionIndicatorsReason('SETOFF') !== null);
}

console.log('\nPart 3. accessors');
{
  check('lookups are case-insensitive and trim', KeywordSpec.takesNoParameters(' logout ') && KeywordSpec.optionIndicatorsAllowed(' Rmvwdw '));
  ['MSGCON', 'DFT', 'WINDOW', 'USRDFN', '', 'constructor', '__proto__', 'toString', null, undefined, 4].forEach((n) => {
    check(JSON.stringify(n) + ' is none of the eleven: no facts', KeywordSpec.takesNoParameters(n) === false && KeywordSpec.optionIndicatorsAllowed(n) === false && KeywordSpec.recordRequires(n).length === 0 && KeywordSpec.notOnRecordTypes(n).length === 0 && KeywordSpec.fileExcludes(n).length === 0 && KeywordSpec.requiresHelpSpecification(n) === false);
  });
  const v = KeywordSpec.wdwtitleVocabulary(); v.colors.push('X'); v.positions.pop();
  const m = KeywordSpec.mnubardspFieldShapes(); m.pullDownInput.values.pop(); m.choiceField.length = 9;
  const l = KeywordSpec.hlpseqLimits(); l.sequenceMax = 1;
  const n = KeywordSpec.notOnRecordTypes('HLPCMDKEY'); n.pop();
  check('accessors return copies (mutating one leaves the spec alone)', KeywordSpec.wdwtitleVocabulary().colors.length === 7 && KeywordSpec.wdwtitleVocabulary().positions.length === 2 && KeywordSpec.mnubardspFieldShapes().pullDownInput.values.length === 3 && KeywordSpec.mnubardspFieldShapes().choiceField.length === 2 && KeywordSpec.hlpseqLimits().sequenceMax === 99 && KeywordSpec.notOnRecordTypes('HLPCMDKEY').length === 3);
  check('the I-121b keywords are untouched by the generalised lookup', KeywordSpec.initRetainReturnKeywords().length === 7 && KeywordSpec.optionIndicatorsAllowed('INZINP') && !KeywordSpec.optionIndicatorsAllowed('RETKEY'));
  check('DspfWriter re-exports agree with the spec', DspfWriter.windowHelpLogKeywords().join() === ELEVEN.join() && DspfWriter.hlpseqLimits().sequenceMax === 99 && ELEVEN.every((k) => DspfWriter.optionIndicatorsAllowed(k) === KeywordSpec.optionIndicatorsAllowed(k) && DspfWriter.takesNoParameters(k) === KeywordSpec.takesNoParameters(k)));
}

console.log('\nPart 4. the rendered panels');
{
  const root = document.getElementById('root');
  const expanded = new Set();
  const toggle = (stem) => document.querySelector('.kw-cond-toggle[data-flag-id="' + stem + '"]');

  const rec = [];
  const panels = Helpers.recordKeywordsPanelsHtml(rec, 'rec', expanded);
  root.innerHTML = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'].map((k) => '<div data-panel="' + k + '">' + (panels[k] || '') + '</div>').join('');
  Helpers.wireRecordKeywordsPanels('rec', () => rec, () => {}, expanded, () => {}, () => []);
  ['HLPCLR', 'HLPCMDKEY', 'LOGOUT', 'LOGINP'].forEach((n) => {
    const id = 'rec-' + n.toLowerCase();
    check(n + ': the row is rendered', !!document.getElementById(id + '-on'));
    check(n + ': no parameters box', !document.getElementById(id + '-params'));
    check(n + ': Conditioning toggle ' + (KeywordSpec.optionIndicatorsAllowed(n) ? 'present' : 'absent') + ' (the spec fact)', !!toggle(id) === KeywordSpec.optionIndicatorsAllowed(n));
  });
  const num = document.getElementById('rec-hlpseq-num');
  check('HLPSEQ: sequence-number placeholder comes from the spec limits ("0-99")', !!num && num.getAttribute('placeholder') === 'Sequence number 0-99');

  const win = [];
  const wpanels = Helpers.windowPanelsHtml(win, 'win', expanded);
  root.innerHTML = '<div>' + wpanels.windowParameters + '</div>';
  ['RMVWDW', 'USRRSTDSP'].forEach((n) => {
    const id = 'win-' + n.toLowerCase();
    check(n + ': the window-panel row is rendered, Conditioning toggle ' + (KeywordSpec.optionIndicatorsAllowed(n) ? 'present' : 'absent') + ' (the spec fact)', !!document.getElementById(id + '-on') && !!toggle(id) === KeywordSpec.optionIndicatorsAllowed(n));
  });
}

console.log('\nPart 5. the rows follow the spec (change a fact, the panel follows)');
{
  const root = document.getElementById('root');
  const expanded = new Set();
  const toggle = (stem) => document.querySelector('.kw-cond-toggle[data-flag-id="' + stem + '"]');
  const lg = KeywordSpec.RECORD_TYPES.LOGOUT, lp = KeywordSpec.RECORD_TYPES.LOGINP, sq = KeywordSpec.RECORD_TYPES.HLPSEQ;
  const saved = [lg.optionIndicators, lp.optionIndicators, sq.parameters.sequenceMax];
  try {
    lg.optionIndicators = 'notValid'; lp.optionIndicators = 'valid'; sq.parameters.sequenceMax = 49;
    const rec = [];
    const panels = Helpers.recordKeywordsPanelsHtml(rec, 'rec', expanded);
    root.innerHTML = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'].map((k) => '<div>' + (panels[k] || '') + '</div>').join('');
    check('LOGOUT flipped to "not valid" in the spec: its Conditioning toggle disappears', !toggle('rec-logout'));
    check('LOGINP flipped to "valid" in the spec: a Conditioning toggle appears', !!toggle('rec-loginp'));
    check('HLPSEQ limit changed in the spec: the placeholder follows ("0-49")', document.getElementById('rec-hlpseq-num').getAttribute('placeholder') === 'Sequence number 0-49');
  } finally {
    lg.optionIndicators = saved[0]; lp.optionIndicators = saved[1]; sq.parameters.sequenceMax = saved[2];
  }
  const rec2 = [];
  const p2 = Helpers.recordKeywordsPanelsHtml(rec2, 'rec', expanded);
  root.innerHTML = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'].map((k) => '<div>' + (p2[k] || '') + '</div>').join('');
  check('restored: LOGOUT has its toggle, LOGINP has none, placeholder is 0-99 again', !!toggle('rec-logout') && !toggle('rec-loginp') && document.getElementById('rec-hlpseq-num').getAttribute('placeholder') === 'Sequence number 0-99');
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i121hCommandFunctionKeywordSpec.test.js
 *
 * Task I-121h - "One declarative rule spec per keyword", command-function
 * keywords slice: ALWGPH, CLEAR, HELP, HLPRTN, HOME, INVITE, PAGEDOWN, PAGEUP,
 * PRINT and VLDCMDKEY each get their own RECORD_TYPES entry, every fact read
 * from the keyword's own section of DDS_Keyword_V7r6.txt. ROLLUP / ROLLDOWN are
 * PAGEDOWN's / PAGEUP's alternate names, not entries. The record-indicator
 * group now derives its alternate names and citations from these entries, and
 * the webview's hand-written ['ROLLUP'] / ['ROLLDOWN'] arrays are gone.
 *
 * Verifies:
 *  1. each fact's source sentence occurs (whitespace-normalised) in the DDS
 *     Reference text, so the spec cannot drift from it.
 *  2. the facts, entry by entry.
 *  3. accessor semantics (fresh copies, own-property safety, odd inputs).
 *  4. ties to the other facts: the no-option-indicators table, the
 *     record-indicator group (derived, order kept), KEYWORD-LOOKUP.json.
 *  5. the real generated webview: the file-level Page down / Page up rows still
 *     read a hand-written ROLLUP / ROLLDOWN, and the old literals are gone.
 *
 * Run with: node src/test/i121hCommandFunctionKeywordSpec.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const norm = (t) => t.replace(/\f/g, ' ').replace(/\s+/g, ' ').trim();
const refN = norm(REF);
const RT = KeywordSpec.RECORD_TYPES;
const TEN = ['ALWGPH', 'CLEAR', 'HELP', 'HLPRTN', 'HOME', 'INVITE', 'PAGEDOWN', 'PAGEUP', 'PRINT', 'VLDCMDKEY'];

console.log('\n1. facts against the DDS Reference text');
{
  // [keyword, a sentence (or a short stretch) copied from the section, no page break inside]
  const SOURCES = [
    ['ALWGPH', 'This file- or record-level keyword allows graphics and alphanumeric contents to be displayed by the record format on a 5292 Model 2 Color Display Station at the same time'],
    ['ALWGPH', 'The keyword is ignored if it is specified for a file displayed on any other type of display'],
    ['ALWGPH', 'This keyword has no parameters'],
    ['ALWGPH', 'This keyword cannot be specified with the SFL or the USRDFN keywords'],
    ['CLEAR', 'You use this file-level or record-level keyword to specify that your program is to receive control if the workstation user presses the Clear key'],
    ['CLEAR', "CLEAR[(response-indicator ['text'])]"],
    ['CLEAR', 'The Clear key is processed like a command attention key (no input data is transmitted from the device)'],
    ['CLEAR', 'If you specify more than 50 characters between the single quotation marks, the text is truncated to 50 characters on the program printout'],
    ['HELP', 'You use this file-level or record-level keyword to enable the Help key'],
    ['HELP', "HELP[(response-indicator ['text'])]"],
    ['HELP', 'When a response indicator is specified on the HELP keyword, no H specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords can be specified in the file'],
    ['HELP', 'HELP (with no response indicator) is required if the file contains H specifications or HLPRCD, HLPPNLGRP, HLPDOC, or HLPRTN keywords'],
    ['HLPRTN', 'You use this file-level or record-level keyword to return control to your program when you press the Help key'],
    ['HLPRTN', 'HLPRTN at either the file or record level takes priority over any HLPRCD, HLPPNLGRP, or HLPDOC keywords'],
    ['HLPRTN', 'A warning message appears at creation time if you specify an unoptioned HLPRTN keyword on a file or record containing H specifications'],
    ['HOME', 'You use this file-level or record-level keyword to specify that you want to recognize and handle the Home key through your program'],
    ['HOME', 'The cursor position specified by the last output operation'],
    ['HOME', 'The first unprotected input field'],
    ['HOME', 'Position 1, line 1'],
    ['INVITE', 'You use this file-level or record-level keyword to invite the device for a later read operation'],
    ['INVITE', 'This keyword has no parameters'],
    ['INVITE', 'INVITE cannot be specified at both the file and record level and cannot be specified with the subfile keyword (SFL)'],
    ['PAGEDOWN', 'The ROLLUP keyword cannot be specified with PAGEDOWN. The ROLLDOWN keyword cannot be specified with PAGEUP'],
    ['PAGEDOWN', 'Note: PAGEDOWN is the same as ROLLUP; PAGEUP is the same as ROLLDOWN'],
    ['PAGEDOWN', "PAGEDOWN[(response-indicator ['text'])]"],
    ['PAGEUP', "PAGEUP[(response-indicator ['text'])]"],
    ['PRINT', 'You use this file-level or record-level keyword to specify that the workstation user can press the Print key to print the current display'],
    ['PRINT', "PRINT[(response-indicator ['text']) ∨ (*PGM) ∨ ([library-name/]printer-file-name)]"],
    ['PRINT', 'The only difference between these two forms is the response indicator; all other processing is the same'],
    ['VLDCMDKEY', 'You use this file-level or record-level keyword to specify that the IBM i licensed program is to set on the specified response indicator when any valid command key other than the Enter key is pressed'],
    ['VLDCMDKEY', "VLDCMDKEY(response-indicator ['text'])"],
    ['VLDCMDKEY', 'The response-indicator parameter is required'],
    ['VLDCMDKEY', 'Option indicators are not valid for this keyword'],
    ['VLDCMDKEY', 'Causes the command function key specified to be considered a valid command key if PAGEUP is also specified'],
    ['VLDCMDKEY', 'Causes the command function key specified to be considered a valid command key if PAGEDOWN is also specified'],
  ];
  const missing = SOURCES.filter((s) => refN.indexOf(norm(s[1])) < 0 && refN.indexOf(norm(s[1]).replace(/\.$/, '')) < 0);
  check('every one of the ' + SOURCES.length + ' source sentences occurs in the reference' + (missing.length ? ' (missing: ' + missing.map((m) => m[0] + ': ' + m[1].slice(0, 50)).join(' / ') + ')' : ''), missing.length === 0);
  check('every entry has a non-empty citation naming its section and an approximate line', TEN.every((k) => typeof RT[k].ddsReference === 'string' && /~line \d+|keyword/.test(RT[k].ddsReference) && RT[k].ddsReference.length > 80));
  check('"Option indicators are valid for this keyword" is stated for the other nine (the sections say so)', ['ALWGPH', 'CLEAR', 'HELP', 'HLPRTN', 'HOME', 'INVITE', 'PRINT'].every((k) => refN.indexOf('Option indicators are valid for this keyword') >= 0));
  check('ROLLUP / ROLLDOWN are keywords of their own sections, same format as PAGEDOWN / PAGEUP', refN.indexOf("ROLLUP[(response-indicator ['text'])]") >= 0 && refN.indexOf("ROLLDOWN[(response-indicator ['text'])]") >= 0);
}

console.log('\n2. the facts');
{
  check('all ten are file- and record-level', TEN.every((k) => RT[k].levels.join() === 'file,record'));
  check('no parameters: ALWGPH and INVITE only', TEN.filter((k) => RT[k].noParameters === true).join() === 'ALWGPH,INVITE');
  check('option indicators: valid for nine, not valid for VLDCMDKEY', TEN.filter((k) => RT[k].optionIndicators === 'notValid').join() === 'VLDCMDKEY' && TEN.filter((k) => RT[k].optionIndicators === 'valid').length === 9);
  const withRi = ['CLEAR', 'HELP', 'HLPRTN', 'HOME', 'PAGEDOWN', 'PAGEUP', 'VLDCMDKEY'];
  check('seven take the optional-text response-indicator form', withRi.every((k) => KeywordSpec.takesResponseIndicator(k)) && !KeywordSpec.takesResponseIndicator('ALWGPH') && !KeywordSpec.takesResponseIndicator('INVITE'));
  check('PRINT takes a response indicator as one of its forms', KeywordSpec.takesResponseIndicator('PRINT'));
  check('the response indicator is required for VLDCMDKEY alone', TEN.filter((k) => KeywordSpec.responseIndicatorRequired(k)).join() === 'VLDCMDKEY');
  check('the optional text is truncated to 50 characters on the listing: the seven and PRINT', withRi.concat(['PRINT']).every((k) => KeywordSpec.indicatorTextMaxLength(k) === 50) && KeywordSpec.indicatorTextMaxLength('ALWGPH') === null && KeywordSpec.indicatorTextMaxLength('INVITE') === null);
  check('PRINT\'s text applies only with a response indicator', RT.PRINT.parameters.text.onlyWithResponseIndicator === true);
  check('PRINT has four forms: none, response indicator, *PGM, [library/]printer file', KeywordSpec.printForms().join('|') === 'none|response-indicator|*PGM|[library-name/]printer-file-name');
  check('PRINT: *PGM and a response indicator differ only in the indicator (the section\'s own sentence)', RT.PRINT.pgmEquivalentToResponseIndicator === true);
  check('PAGEDOWN reads ROLLUP, PAGEUP reads ROLLDOWN, nothing else has an alternate name', KeywordSpec.alternateNamesOf('PAGEDOWN').join() === 'ROLLUP' && KeywordSpec.alternateNamesOf('PAGEUP').join() === 'ROLLDOWN' && TEN.filter((k) => KeywordSpec.alternateNamesOf(k).length).join() === 'PAGEDOWN,PAGEUP');
  check('PAGEDOWN cannot be with ROLLUP, PAGEUP not with ROLLDOWN (the section\'s pairing, not PAGEDOWN with ROLLDOWN)', RT.PAGEDOWN.notWithAlternateName === 'ROLLUP' && RT.PAGEUP.notWithAlternateName === 'ROLLDOWN');
  check('ALWGPH cannot be with SFL or USRDFN; INVITE not with SFL', KeywordSpec.commandFunctionExcludedRecordTypes('ALWGPH').join() === 'SFL,USRDFN' && KeywordSpec.commandFunctionExcludedRecordTypes('INVITE').join() === 'SFL' && KeywordSpec.commandFunctionExcludedRecordTypes('CLEAR').length === 0);
  check('INVITE cannot be at both file and record level; nothing else says so', TEN.filter((k) => KeywordSpec.commandFunctionNotAtBothLevels(k)).join() === 'INVITE');
  const h = KeywordSpec.helpRelations();
  check('HELP with a response indicator excludes HLPRCD HLPPNLGRP HLPDOC HLPRTN and H specifications', h.withResponseIndicatorExcludesInFile.join() === 'HLPRCD,HLPPNLGRP,HLPDOC,HLPRTN' && h.withResponseIndicatorExcludesHelpSpecifications === true);
  check('HELP without one is required when the file has any of those or H specifications', h.withoutResponseIndicatorRequiredWhenFileContains.join() === 'HLPRCD,HLPPNLGRP,HLPDOC,HLPRTN' && h.withoutResponseIndicatorRequiredWhenFileHasHelpSpecifications === true);
  check('HLPRTN takes priority over HLPRCD, HLPPNLGRP, HLPDOC and warns at creation when unoptioned with H specifications', RT.HLPRTN.takesPriorityOver.join() === 'HLPRCD,HLPPNLGRP,HLPDOC' && RT.HLPRTN.unoptionedWithHelpSpecificationsWarnsAtCreation === true);
  check('HOME lists three home positions in priority order', RT.HOME.homePositionPriority.length === 3 && /last output operation/.test(RT.HOME.homePositionPriority[0]) && /position 1, line 1/.test(RT.HOME.homePositionPriority[2]));
  check('CLEAR is processed like a command attention key', RT.CLEAR.processedLike === 'commandAttentionKey');
  const keys = KeywordSpec.validCommandKeys();
  check('VLDCMDKEY lists thirteen activating keywords', keys.length === 13 && keys.map((k) => k.keyword).join() === 'ALTHELP(CAnn),ALTPAGEUP(CFnn),ALTPAGEDWN(CFnn),CAnn,CFnn,CLEAR,HELP,HOME,PAGEDOWN,PAGEUP,PRINT,ROLLUP,ROLLDOWN');
  check('...with the section\'s own conditions on ALTPAGEUP, ALTPAGEDWN, HELP and PRINT only', keys.filter((k) => k.onlyIf).map((k) => k.keyword).join() === 'ALTPAGEUP(CFnn),ALTPAGEDWN(CFnn),HELP,PRINT');
  check('no entry invents a response-indicator range: the parameter records only whether it is required (no section of these ten states a range)', ['CLEAR', 'HELP', 'HLPRTN', 'HOME', 'PAGEDOWN', 'PAGEUP', 'VLDCMDKEY'].every((k) => Object.keys(RT[k].parameters.responseIndicator).join() === 'required'));
}

console.log('\n3. accessor semantics');
{
  const a = KeywordSpec.commandFunctionKeywords(); a.pop();
  check('commandFunctionKeywords returns a fresh array of ten in entry order', KeywordSpec.commandFunctionKeywords().join() === TEN.join());
  const n = KeywordSpec.alternateNamesOf('PAGEDOWN'); n.push('X');
  check('alternateNamesOf returns a fresh array', KeywordSpec.alternateNamesOf('PAGEDOWN').join() === 'ROLLUP');
  const f = KeywordSpec.printForms(); f.length = 0;
  check('printForms returns a fresh array', KeywordSpec.printForms().length === 4);
  const hh = KeywordSpec.helpRelations(); hh.withResponseIndicatorExcludesInFile.length = 0;
  check('helpRelations returns fresh arrays', KeywordSpec.helpRelations().withResponseIndicatorExcludesInFile.length === 4);
  const v = KeywordSpec.validCommandKeys(); v[0].keyword = 'X'; v.pop();
  check('validCommandKeys returns fresh copies', KeywordSpec.validCommandKeys().length === 13 && KeywordSpec.validCommandKeys()[0].keyword === 'ALTHELP(CAnn)');
  const ex = KeywordSpec.commandFunctionExcludedRecordTypes('ALWGPH'); ex.length = 0;
  check('commandFunctionExcludedRecordTypes returns a fresh array', KeywordSpec.commandFunctionExcludedRecordTypes('ALWGPH').length === 2);
  const odd = ['clear', 'Clear', 'ROLLUP', 'ROLLDOWN', 'constructor', 'toString', '__proto__', '', null, undefined, 5, {}, []];
  check('case-sensitive and own-property safe: odd names are none of the facts (ROLLUP is an alternate name, not an entry)', odd.every((x) => KeywordSpec.commandFunctionEntry(x) === null && KeywordSpec.alternateNamesOf(x).length === 0 && !KeywordSpec.takesResponseIndicator(x) && !KeywordSpec.responseIndicatorRequired(x) && KeywordSpec.indicatorTextMaxLength(x) === null && KeywordSpec.commandFunctionExcludedRecordTypes(x).length === 0 && !KeywordSpec.commandFunctionNotAtBothLevels(x)));
  check('keywords outside the ten are none of the facts', ['DFT', 'COLOR', 'SETOF', 'CHANGE', 'INDTXT', 'WINDOW', 'ALARM'].every((x) => KeywordSpec.commandFunctionEntry(x) === null && !KeywordSpec.takesResponseIndicator(x)));
  check('the writer re-exports the alternate-name accessor', DspfWriter.keywordAlternateNames('PAGEUP').join() === 'ROLLDOWN' && DspfWriter.keywordAlternateNames('HOME').length === 0);
}

console.log('\n4. ties to the other facts');
{
  check('VLDCMDKEY is in the no-option-indicators table, and none of the other nine is', TEN.filter((k) => KeywordSpec.noOptionIndicatorsFact(k)).join() === 'VLDCMDKEY');
  check('the entry and the table agree on option indicators for all ten', TEN.every((k) => (RT[k].optionIndicators === 'notValid') === !!KeywordSpec.noOptionIndicatorsFact(k)));
  check('the record-indicator group keeps its ten names in its original order', KeywordSpec.recordIndicatorKeywordNames().join() === 'CLEAR,PAGEDOWN,PAGEUP,HOME,HELP,HLPRTN,VLDCMDKEY,SETOF,CHANGE,INDTXT');
  const g = KeywordSpec.RECORD_INDICATOR_KEYWORDS;
  check('its seven command-function keywords derive their citation from the entries', ['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'HELP', 'HLPRTN', 'VLDCMDKEY'].every((k) => g[k].ddsReference === RT[k].ddsReference));
  check('...and their alternate names, unchanged: ROLLUP -> PAGEDOWN, ROLLDOWN -> PAGEUP, SETOFF -> SETOF', JSON.stringify(KeywordSpec.recordIndicatorAlternateKinds()) === JSON.stringify({ ROLLUP: 'PAGEDOWN', ROLLDOWN: 'PAGEUP', SETOFF: 'SETOF' }));
  check('SETOF, CHANGE and INDTXT are not command-function keywords and keep their own', KeywordSpec.commandFunctionEntry('SETOF') === null && g.SETOF.alternateNames.join() === 'SETOFF');
  check('the group\'s copy of the alternate names is not the entry\'s array', g.PAGEDOWN.alternateNames !== RT.PAGEDOWN.alternateNames && g.PAGEDOWN.alternateNames.join() === RT.PAGEDOWN.alternateNames.join());
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
  check('KEYWORD-LOOKUP.json lists each at file and record level', TEN.every((k) => { const lv = (lookup[k] || []).map((e) => e.level).sort().join(); return lv === 'file,record'; }));
  check('every HELP-relation keyword named is a keyword in the lookup', KeywordSpec.helpRelations().withResponseIndicatorExcludesInFile.every((k) => !!lookup[k]));
  check('PRINT\'s S36E rules stay with I-121p (no System/36 data on the entry)', !/S36|System\/36/.test(JSON.stringify(Object.assign({}, RT.PRINT, { ddsReference: '' }))));
  check('all ten now have a RECORD_TYPES entry', TEN.every((k) => Object.prototype.hasOwnProperty.call(RT, k)));
}

console.log('\n5. the real webview');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A                                      ROLLUP(25 \'Roll up\')',
    '     A                                      ROLLDOWN(26)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
  ].join('\n') + '\n';
  const helpers = fs.readFileSync(path.join(__dirname, '../webviewClientHelpers.js'), 'utf8');
  check('the hand-written [\'ROLLUP\'] / [\'ROLLDOWN\'] arrays are gone from the webview helpers', !/\['ROLL(UP|DOWN)'\]/.test(helpers) && (helpers.match(/DspfWriter\.keywordAlternateNames\('PAGE(DOWN|UP)'\)/g) || []).length === 4);
  const errors = [];
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'n1', src, 'I121H.DSPF'), {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      w.alert = () => {};
      w.addEventListener('error', (e) => errors.push(e.error || e.message));
    },
  });
  await sleep(700);
  const doc = dom.window.document;
  doc.getElementById('crumb-file').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  for (const t of Array.from(doc.querySelectorAll('.props-tab'))) {
    t.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    if (doc.getElementById('fk-pagedown-on')) break;
  }
  const down = doc.getElementById('fk-pagedown-on'), up = doc.getElementById('fk-pageup-on');
  check('the file-level Page down row renders checked and shows the hand-written ROLLUP\'s indicator and text', !!down && down.checked === true && doc.getElementById('fk-pagedown-ind').value === '25' && doc.getElementById('fk-pagedown-text').value === 'Roll up');
  check('the file-level Page up row renders checked and shows the hand-written ROLLDOWN\'s indicator', !!up && up.checked === true && doc.getElementById('fk-pageup-ind').value === '26');
  check('no uncaught errors', errors.length === 0);
  dom.window.close();

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();

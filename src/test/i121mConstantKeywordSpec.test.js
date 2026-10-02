/**
 * i121mConstantKeywordSpec.test.js
 *
 * Task I-121m - "One declarative rule spec per keyword", constant and
 * system-value field keywords slice: DATE, TIME, USER, SYSNAME, MSGCON and
 * NOCCSID each get their own RECORD_TYPES entry, every fact checked against
 * DDS_Keyword_V7r6.txt itself. MSGCON's 1-132 length bound, hand-written
 * three times in the webview, now comes from the spec.
 *
 * Verifies:
 *  1. each entry's citation text occurs (whitespace-normalised) in the DDS
 *     Reference text, so the spec cannot drift from the source.
 *  2. the facts: constant-only keywords, listed companions (TIME alone is
 *     "only"), no-parameter keywords, DATE's two parameter domains, USER 10 /
 *     SYSNAME 8, MSGCON's length range and exclusion list.
 *  3. accessor semantics: fresh copies, case-sensitive, own-property safe,
 *     non-strings, unrelated keywords.
 *  4. ties to the other facts: the v0.10.280 system-value list, the
 *     no-option-indicators table, HTML's and MSGID's lists, KEYWORD-LOOKUP.
 *  5. the rendered MSGCON length inputs (constant panel, Add form) carry the
 *     spec's min and max; the writer re-export agrees.
 *
 * Run with: node src/test/i121mConstantKeywordSpec.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const norm = (t) => t.replace(/\s+/g, ' ').trim();
const refN = norm(ref);
const RT = KeywordSpec.RECORD_TYPES;

console.log('\n1. citations against the DDS Reference text');
{
  // Each spec citation is a join of sentences from one section; test each
  // sentence (split on ". ") occurs in the reference.
  ['DATE', 'TIME', 'USER', 'SYSNAME', 'MSGCON', 'NOCCSID'].forEach((k) => {
    const sentences = norm(RT[k].ddsReference).split(/(?<=\.) (?=[A-Z])/).filter(Boolean);
    const missing = sentences.filter((s) => refN.indexOf(s.replace(/\.$/, '')) < 0);
    check(k + ': every sentence of its citation occurs in DDS_Keyword_V7r6.txt' + (missing.length ? ' (missing: ' + missing.join(' / ') + ')' : ''), missing.length === 0);
  });
  check('MSGCON optionIndicatorNote occurs in the reference', refN.indexOf(norm(RT.MSGCON.optionIndicatorNote).replace(/\.$/, '')) >= 0);
}

console.log('\n2. the facts');
{
  check('constant-only keywords are DATE, TIME, USER, SYSNAME, MSGCON in entry order', KeywordSpec.constantFieldOnlyKeywords().join() === 'DATE,TIME,USER,SYSNAME,MSGCON');
  check('NOCCSID is not constant-only (it applies to named fields too)', !KeywordSpec.isConstantFieldOnlyKeyword('NOCCSID'));
  check('DATE companions: EDTCDE EDTWRD COLOR DSPATR TEXT', KeywordSpec.listedCompanionKeywords('DATE').join() === 'EDTCDE,EDTWRD,COLOR,DSPATR,TEXT');
  check('TIME companions: the same five', KeywordSpec.listedCompanionKeywords('TIME').join() === 'EDTCDE,EDTWRD,COLOR,DSPATR,TEXT');
  check('USER companions: COLOR DSPATR TEXT', KeywordSpec.listedCompanionKeywords('USER').join() === 'COLOR,DSPATR,TEXT');
  check('SYSNAME companions: COLOR DSPATR TEXT', KeywordSpec.listedCompanionKeywords('SYSNAME').join() === 'COLOR,DSPATR,TEXT');
  check('MSGCON and NOCCSID list no companions', KeywordSpec.listedCompanionKeywords('MSGCON') === null && KeywordSpec.listedCompanionKeywords('NOCCSID') === null);
  check('only TIME states its companions as exclusive ("can specify only")', ['DATE', 'TIME', 'USER', 'SYSNAME', 'MSGCON', 'NOCCSID'].filter((k) => KeywordSpec.companionsStatedAsOnly(k)).join() === 'TIME');
  check('"you can specify only the location of the field, TIME" is in the reference', refN.indexOf('You can specify only the location of the field, TIME') >= 0);
  check('no-parameter keywords: TIME USER SYSNAME NOCCSID', ['DATE', 'TIME', 'USER', 'SYSNAME', 'MSGCON', 'NOCCSID'].filter((k) => KeywordSpec.constantKeywordTakesNoParameters(k)).join() === 'TIME,USER,SYSNAME,NOCCSID');
  const d = KeywordSpec.dateParameters();
  check('DATE parameters: *JOB|*SYS and *Y|*YY, defaults *JOB and *Y', d.source.join() === '*JOB,*SYS' && d.year.join() === '*Y,*YY' && d.defaults.source === '*JOB' && d.defaults.year === '*Y');
  check('the DATE format line is in the reference', refN.indexOf('DATE([*JOB|*SYS] [*Y|*YY])') >= 0);
  check('USER is 10 long, SYSNAME 8, the others state no length', KeywordSpec.fixedDisplayLength('USER') === 10 && KeywordSpec.fixedDisplayLength('SYSNAME') === 8 && ['DATE', 'TIME', 'MSGCON', 'NOCCSID'].every((k) => KeywordSpec.fixedDisplayLength(k) === null));
  check('MSGCON length range is 1 to 132', JSON.stringify(KeywordSpec.msgconLengthRange()) === '{"min":1,"max":132}');
  check('MSGCON mutex: DATE DFT EDTCDE EDTWRD TIME', KeywordSpec.mutexKeywords('MSGCON').join() === 'DATE,DFT,EDTCDE,EDTWRD,TIME');
  check('isMutex agrees with that list, both ways round for an outside keyword', KeywordSpec.isMutex('MSGCON', 'DFT') && !KeywordSpec.isMutex('MSGCON', 'USER') && !KeywordSpec.isMutex('MSGCON', 'COLOR'));
}

console.log('\n3. accessor semantics');
{
  const a = KeywordSpec.constantFieldOnlyKeywords(); a.pop();
  check('constantFieldOnlyKeywords returns a fresh array', KeywordSpec.constantFieldOnlyKeywords().length === 5);
  const c = KeywordSpec.listedCompanionKeywords('DATE'); c.length = 0;
  check('listedCompanionKeywords returns a fresh array', KeywordSpec.listedCompanionKeywords('DATE').length === 5);
  const d = KeywordSpec.dateParameters(); d.source.length = 0; d.defaults.source = 'X';
  check('dateParameters returns a fresh object', KeywordSpec.dateParameters().source.length === 2 && KeywordSpec.dateParameters().defaults.source === '*JOB');
  const m = KeywordSpec.msgconLengthRange(); m.max = 1;
  check('msgconLengthRange returns a fresh object', KeywordSpec.msgconLengthRange().max === 132);
  const odd = ['date', 'Date', 'constructor', 'toString', '__proto__', 'hasOwnProperty', '', null, undefined, 5, {}, []];
  check('case-sensitive and own-property safe: odd names are none of the facts', odd.every((n) => !KeywordSpec.isConstantFieldOnlyKeyword(n) && KeywordSpec.listedCompanionKeywords(n) === null && !KeywordSpec.constantKeywordTakesNoParameters(n) && KeywordSpec.fixedDisplayLength(n) === null && !KeywordSpec.companionsStatedAsOnly(n)));
  check('keywords outside the slice are none of the facts', ['DFT', 'COLOR', 'HTML', 'MSGID', 'WINDOW', 'EDTCDE'].every((n) => !KeywordSpec.isConstantFieldOnlyKeyword(n) && !KeywordSpec.constantKeywordTakesNoParameters(n) && KeywordSpec.fixedDisplayLength(n) === null));
}

console.log('\n4. ties to the other facts');
{
  const sys = KeywordSpec.systemValueConstantKeywords();
  check('the system-value list (v0.10.280) is the constant-only list without MSGCON', sys.join() === KeywordSpec.constantFieldOnlyKeywords().filter((k) => k !== 'MSGCON').join());
  sys.forEach((k) => {
    const f = KeywordSpec.noOptionIndicatorsFact(k);
    check(k + ': option indicators not valid for the keyword, field still conditionable (I-101 table)', !!f && f.kind === 'notValidFieldConditionable' && f.levels.join() === 'field');
  });
  check('MSGCON and NOCCSID are not in the no-option-indicators table (their sections state no such rule)', KeywordSpec.noOptionIndicatorsFact('MSGCON') === null && KeywordSpec.noOptionIndicatorsFact('NOCCSID') === null);
  const html = KeywordSpec.mutexKeywords('HTML');
  check('HTML mutex names all six', ['DATE', 'TIME', 'USER', 'SYSNAME', 'MSGCON', 'NOCCSID'].every((k) => html.indexOf(k) >= 0));
  check('MSGID mutex names MSGCON (the same pair from MSGID\'s side)', KeywordSpec.isMutex('MSGID', 'MSGCON'));
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'), 'utf8')).keywords;
  ['DATE', 'TIME', 'USER', 'SYSNAME', 'MSGCON', 'NOCCSID'].forEach((k) => {
    const levels = (lookup[k] || []).map((e) => e.level);
    check(k + ': a field-level keyword in KEYWORD-LOOKUP.json', levels.indexOf('field') >= 0);
  });
  check('every MSGCON mutex keyword is a keyword in KEYWORD-LOOKUP.json', KeywordSpec.mutexKeywords('MSGCON').every((k) => !!lookup[k]));
  check('all six now have a RECORD_TYPES entry', ['DATE', 'TIME', 'USER', 'SYSNAME', 'MSGCON', 'NOCCSID'].every((k) => Object.prototype.hasOwnProperty.call(RT, k)));
}

console.log('\n5. rendered MSGCON length inputs read the spec');
{
  const range = KeywordSpec.msgconLengthRange();
  check('writer re-export agrees with the spec', JSON.stringify(DspfWriter.msgconLengthRange()) === JSON.stringify(range));
  const src = [
    '     A          R RECORD1',
    "     A                                  1  2MSGCON(20 MSG0001 MSGF)",
    "     A                                  2  2'Hello'",
  ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'I121M.DSPF');
  const errors = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      window.alert = () => {};
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  const doc = dom.window.document;
  const boxes = Array.from(doc.querySelectorAll('.dspf-field'));
  check('setup: two field boxes (MSGCON and the literal)', boxes.length === 2);
  boxes[0].click();
  const len = doc.getElementById('p-const-msgcon-length');
  check('constant panel has the MSGCON Length input with value 20', !!len && len.value === '20');
  check('its min and max are the spec\'s', !!len && len.getAttribute('min') === String(range.min) && len.getAttribute('max') === String(range.max));
  doc.getElementById('placeConstantBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  doc.querySelector('.dspf-screen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 195 }));
  const place = doc.getElementById('p-place-msgcon-length');
  check('Add form has the MSGCON Length input', !!place);
  check('its min and max are the spec\'s', !!place && place.getAttribute('min') === String(range.min) && place.getAttribute('max') === String(range.max));
  check('no script errors while rendering', errors.length === 0);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

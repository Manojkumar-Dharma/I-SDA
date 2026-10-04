/**
 * i163CommandFunctionParameterForms.test.js
 *
 * Task I-163 - the parameter forms of the command-function keywords, which
 * I-121h found unenforced (every bad case below was accepted and written
 * before, probed in the file-level raw keyword editor):
 *   ALWGPH, INVITE   "This keyword has no parameters."
 *   VLDCMDKEY        "The response-indicator parameter is required."
 *   CLEAR HELP HLPRTN HOME PAGEDOWN PAGEUP (ROLLUP / ROLLDOWN)
 *                    NAME[(response-indicator ['text'])], quotes required
 *   PRINT            none | response-indicator ['text'] | *PGM | [library/]file
 * Where the sections state nothing (a response-indicator range, an object-name
 * rule, a limit on the text) nothing is enforced and the spec records an open
 * question. Diff-based: only a violation the edit adds, file and record level.
 *
 * Run with: node src/test/i163CommandFunctionParameterForms.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const { buildLine } = require('../fixtures/lineBuilder');

const REF_TEXT = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');
const has = (t) => REF_TEXT.indexOf(t) !== -1;

const fl = (kw) => '     A'.padEnd(44) + kw;
const file = (...kws) => kws.map(fl).concat(['     A          R REC1', '     A            F1            10A  B  2  2']).join('\n') + '\n';
const rec = (...kws) => ['     A          R REC1'].concat(kws.map(fl), ['     A            F1            10A  B  2  2']).join('\n') + '\n';
const parse = (t) => DspfParser.parseDspf(t);
const g = (a, b) => DspfWriter.commandFunctionParameterNewConflictReason(parse(a), parse(b));
const bad = (a, b, re) => { const r = g(a, b); return !!r && re.test(r); };
const P = DspfWriter.commandFunctionParamProblem;

console.log('=== 1. the facts, against the DDS Reference ===');
{
  const shapes = KeywordSpec.commandFunctionParameterShapes();
  check('ALWGPH and INVITE: "This keyword has no parameters."', has('This keyword has no parameters.') && shapes.noParameters.join() === 'ALWGPH,INVITE');
  check('VLDCMDKEY: the response-indicator parameter is required', has('The response-indicator parameter is required.') && shapes.required.join() === 'VLDCMDKEY');
  check('the other six take an optional indicator', shapes.optional.join() === 'CLEAR,HELP,HLPRTN,HOME,PAGEDOWN,PAGEUP');
  check('"The single quotation marks are required."', has('The single quotation marks are required.'));
  ['CLEAR', 'HOME', 'PAGEDOWN', 'PAGEUP', 'HELP', 'HLPRTN'].forEach((n) => {
    const fmt = KeywordSpec.commandFunctionEntry(n).parameters.format;
    check(n + ': the spec format "' + fmt + '" is in the reference (or PAGEDOWN/PAGEUP\'s shared section)', has(fmt) || /^PAGE(DOWN|UP)\[/.test(fmt) || has(fmt.replace('HELP', 'HELP').replace(/\s+/g, ' ')));
  });
  check('VLDCMDKEY format is in the reference', has("VLDCMDKEY(response-indicator ['text'])"));
  check('PRINT: the four-form format line is in the reference',
    has("PRINT[(response-indicator ['text'])") && has('(*PGM)') && has('([library-name/]printer-file-name)]'));
  check('PRINT: the four examples (bare, response indicator with text, *PGM, library/file)',
    has("PRINT(01 'User presses Print key')") && has('PRINT(*PGM)') && has('PRINT(LIB1/PRINTFILE1)'));
  check('the text is only truncated on the listing (no refusal): 50 characters', has('the text is truncated to 50 characters on the program computer printout') && KeywordSpec.RECORD_TYPES.CLEAR.parameters.text.maxPrintedLength === 50);
  check('the spec records no response-indicator range and no object-name rule', !('range' in KeywordSpec.RECORD_TYPES.CLEAR.parameters.responseIndicator) && !('nameRule' in KeywordSpec.RECORD_TYPES.PRINT.parameters));
  check('the open questions are recorded on CLEAR and PRINT', KeywordSpec.RECORD_TYPES.CLEAR.openQuestions.length === 2 && KeywordSpec.RECORD_TYPES.PRINT.openQuestions.length === 2);
  check('the shapes accessor returns fresh arrays', (() => { const a = KeywordSpec.commandFunctionParameterShapes(); a.optional.push('X'); return KeywordSpec.commandFunctionParameterShapes().optional.length === 6; })());
}

console.log('\n=== 2. ALWGPH and INVITE take no parameters ===');
['ALWGPH', 'INVITE'].forEach((n) => {
  check(n + ' with no parameters is accepted', P(n, '') === null && g(file(), file(n)) === null);
  ['X', '25', "25 'text'", '(1)'].forEach((v) => check(n + '(' + v + ') is refused at file level', bad(file(), file(n + '(' + v + ')'), new RegExp(n + ' has no parameters; "' + v.replace(/[()']/g, '\\$&') + '" is not allowed \\(per the DDS Reference\\)\\.'))));
  check(n + '(X) is refused at record level, naming the record', bad(rec(), rec(n + '(X)'), new RegExp(n + ' has no parameters.*\\(record format REC1\\)')));
});

console.log('\n=== 3. VLDCMDKEY needs its response indicator ===');
check("VLDCMDKEY(25), VLDCMDKEY(25 'text') are accepted", P('VLDCMDKEY', '25') === null && P('VLDCMDKEY', "25 'Any valid key'") === null);
check('a bare VLDCMDKEY is refused', bad(file(), file('VLDCMDKEY'), /VLDCMDKEY needs a response indicator: VLDCMDKEY\(response-indicator \['text'\]\) - the response-indicator parameter is required \(per the DDS Reference\)\./));
check('...at record level too', bad(rec(), rec('VLDCMDKEY'), /VLDCMDKEY needs a response indicator.*\(record format REC1\)/));
check("text with no indicator is refused: VLDCMDKEY('text')", bad(file(), file("VLDCMDKEY('only text')"), /VLDCMDKEY's parameter must be VLDCMDKEY\(response-indicator \['text'\]\) with the indicator first/));
check('removing the parameter from a good VLDCMDKEY is refused', bad(file('VLDCMDKEY(25)'), file('VLDCMDKEY'), /needs a response indicator/));
check('fixing a bare VLDCMDKEY is accepted', g(file('VLDCMDKEY'), file('VLDCMDKEY(25)')) === null);
check('an already-bare hand-written VLDCMDKEY does not block an unrelated edit', g(file('VLDCMDKEY'), file('VLDCMDKEY', 'INDARA')) === null);

console.log('\n=== 4. the optional-indicator keywords: NAME[(response-indicator [\'text\'])] ===');
['CLEAR', 'HELP', 'HLPRTN', 'HOME', 'PAGEDOWN', 'PAGEUP', 'ROLLUP', 'ROLLDOWN'].forEach((n) => {
  check(n + ': bare, (25) and (25 \'text\') are accepted', P(n, '') === null && P(n, '25') === null && P(n, "25 'Roll up key'") === null);
  check(n + ": a doubled quote inside the text is accepted: 25 'it''s'", P(n, "25 'it''s fine'") === null);
  check(n + ': unquoted text is refused', /with the indicator first and the text in single quotation marks; "25 unquoted" is not/.test(P(n, '25 unquoted') || ''));
  check(n + ": text with no indicator is refused", /indicator first/.test(P(n, "'text only'") || ''));
  check(n + ': an unbalanced quote is refused', /single quotation marks/.test(P(n, "25 'unbalanced") || ''));
  check(n + ': a third part is refused', /single quotation marks/.test(P(n, "25 'a' 'b'") || '') && /single quotation marks/.test(P(n, '25 26 27') || ''));
});
check('the refusal names the form the section gives', bad(file(), file('CLEAR(25 unquoted)'), /CLEAR's parameter must be CLEAR\[\(response-indicator \['text'\]\)\] with the indicator first/));
check('ROLLUP (PAGEDOWN\'s alternate name) is judged the same', bad(file(), file('ROLLUP(25 unquoted)'), /ROLLUP's parameter must be ROLLUP\[/));
check('...at record level', bad(rec(), rec('HOME(25 unquoted)'), /HOME's parameter.*\(record format REC1\)/));
console.log('  (nothing invented)');
['0', '100', 'X', 'ABC', '1234', '-5', '9999999'].forEach((v) => check('CLEAR(' + v + ') is accepted: the sections state no response-indicator range', P('CLEAR', v) === null && g(file(), file('CLEAR(' + v + ')')) === null));
check("text longer than 50 characters is accepted (only truncated on the listing)", P('CLEAR', "25 '" + 'x'.repeat(80) + "'") === null);
check('editing a good CLEAR to unquoted text is refused', bad(file("CLEAR(25 'ok')"), file('CLEAR(25 ok)'), /CLEAR's parameter/));
check('fixing it is accepted', g(file('CLEAR(25 ok)'), file("CLEAR(25 'ok')")) === null);
check('an already-invalid CLEAR does not block an unrelated edit', g(file('CLEAR(25 ok)'), file('CLEAR(25 ok)', 'INDARA')) === null);
check('removing an invalid CLEAR is accepted', g(file('CLEAR(25 ok)'), file()) === null);
check('a second, new violation is reported', bad(file('CLEAR(25 ok)'), file('CLEAR(25 ok)', 'ALWGPH(X)'), /ALWGPH has no parameters/));

console.log('\n=== 5. PRINT: none | response-indicator [\'text\'] | *PGM | [library/]printer-file ===');
['', '*PGM', '*pgm', '01', "01 'User presses Print key'", 'PRTFILE', 'LIB1/PRINTFILE1', 'QSYSPRT', 'a/b', 'ABCDEFGHIJK', 'AVERYLONGLIBRARYNAME/AVERYLONGFILENAME'].forEach((v) => check('PRINT(' + v + ') is accepted' + (v === 'ABCDEFGHIJK' ? ' (no object-name rule is stated)' : ''), P('PRINT', v) === null));
check('PRINT(1234 5678 9) is refused: it is none of the four forms', /PRINT's parameter must be one of its four forms - none, a response indicator \['text'\], \*PGM, or \[library-name\/\]printer-file-name; "1234 5678 9" is none of them \(per the DDS Reference\)\./.test(P('PRINT', '1234 5678 9') || ''));
['PRTFILE other', "'text only'", "01 'a' 'b'", "01 'unbalanced"].forEach((v) => check('PRINT(' + v + ') is refused', /one of its four forms/.test(P('PRINT', v) || '')));
['/PRTFILE', 'LIB/', '/', 'A/B/C', 'LIB//F'].forEach((v) => check('PRINT(' + v + ') is refused: the printer file must be [library-name/]printer-file-name', /printer file must be written printer-file-name or library-name\/printer-file-name/.test(P('PRINT', v) || '')));
check("PRINT(*PGM 'text') is refused: the text goes with a response indicator", /PRINT\(\*PGM\) takes no text/.test(P('PRINT', "*PGM 'x'") || ''));
check("PRINT(LIB/FILE 'text') is refused: the text goes with a response indicator", /text goes only with a response indicator, not with a printer file/.test(P('PRINT', "LIB/FILE 'x'") || ''));
check("PRINT(PRTFILE 'text') is accepted: a single token may be a response indicator (range not stated)", P('PRINT', "PRTFILE 'x'") === null);
check('through the guard, file level and record level', bad(file(), file('PRINT(1234 5678 9)'), /one of its four forms/) && bad(rec(), rec('PRINT(A/B/C)'), /printer-file-name.*\(record format REC1\)/));
check('an already-invalid PRINT does not block an unrelated edit', g(file('PRINT(1 2 3)'), file('PRINT(1 2 3)', 'INDARA')) === null);
check('the I-159 OPENPRT rules still hold beside the new form check', DspfWriter.fileLevelDisplayNewConflictReason(parse(file('PRINT(PRTFILE)')), parse(file('PRINT(PRTFILE)', 'OPENPRT'))) === null);

console.log('\n=== 6. the guard itself ===');
check('fail-safe on odd models', [undefined, null, {}, { fileKeywords: null }, { fileKeywords: [{ name: 'CLEAR' }] }, { records: [{ name: 'R', keywords: null }] }, { fileKeywords: [{ name: null, parameters: null }] }].every((m) => {
  try { const r = DspfWriter.commandFunctionParameterNewConflictReason(null, m); return r === null || typeof r === 'string'; } catch (e) { return false; }
}));
check('a clean model returns null', g(file(), file('ALWGPH', 'INVITE', "VLDCMDKEY(25 'k')", "CLEAR(26 'c')", 'HOME', 'PAGEDOWN(27)', 'PRINT(PRTF)')) === null);
check('keywords this guard does not own are ignored', g(file(), file('MSGLOC(abc)', 'ALARM(X)')) === null);
check('the webview commit choke point calls the guard', fs.readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8').indexOf('DspfWriter.commandFunctionParameterNewConflictReason(model, candidate)') !== -1);

console.log('\n=== 7. the real webview in jsdom (file-level raw keyword editor) ===');
const SRC = [
  buildLine({ seq: '00010', nameType: 'R', name: 'RECORD1' }),
  buildLine({ seq: '00020', name: 'F1', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2' }),
].join('\n') + '\n';
function session() {
  const posted = [];
  const alerts = [];
  const html = webviewHtml('vscode-webview://fake', 'n' + Math.random(), SRC, 'I163.DSPF');
  const dom = newWebviewDom(html, {
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      w.alert = (m) => alerts.push(m);
      w.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  const doc = dom.window.document;
  const Ev = dom.window.Event;
  return {
    posted, alerts, dom, doc,
    open() { const c = doc.getElementById('crumb-file'); if (c) c.dispatchEvent(new Ev('click', { bubbles: true })); },
    add(name, params) {
      doc.getElementById('file-new-kw-name').value = name;
      const p = doc.getElementById('file-new-kw-params'); if (p) p.value = params || '';
      posted.length = 0; alerts.length = 0;
      doc.querySelector('.kw-add[data-owner="file"]').dispatchEvent(new Ev('click', { bubbles: true }));
      return { alert: alerts[0] || null, edited: posted.some((m) => m.type === 'applyEdit'), text: (posted.filter((m) => m.type === 'applyEdit').pop() || {}).text };
    },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const refused = [
    ['ALWGPH', 'X', /ALWGPH has no parameters/], ['INVITE', 'X', /INVITE has no parameters/], ['VLDCMDKEY', '', /needs a response indicator/],
    ['PRINT', '1234 5678 9', /one of its four forms/], ['PRINT', 'A/B/C', /printer file must be written/], ['CLEAR', '25 unquoted', /CLEAR's parameter/],
    ['CLEAR', "'text only'", /indicator first/], ['HOME', "25 'unbalanced", /HOME's parameter/], ['PAGEDOWN', '25 x', /PAGEDOWN's parameter/], ['ROLLUP', '25 x', /ROLLUP's parameter/],
  ];
  for (const [n, p, re] of refused) {
    const s = session(); await wait(700); s.open();
    const r = s.add(n, p);
    check('raw editor: ' + n + '(' + p + ') is refused, nothing written', !r.edited && re.test(r.alert || ''));
  }
  const accepted = [['ALWGPH', ''], ['INVITE', ''], ['VLDCMDKEY', "25 'any valid key'"], ['PRINT', '*PGM'], ['PRINT', "01 'User presses Print key'"], ['PRINT', 'LIB1/PRINTFILE1'], ['PRINT', 'ABCDEFGHIJK'], ['CLEAR', '0'], ['CLEAR', '100'], ['CLEAR', "25 'text'"], ['HOME', ''], ['HELP', '26']];
  for (const [n, p] of accepted) {
    const s = session(); await wait(700); s.open();
    const r = s.add(n, p);
    check('raw editor: ' + n + '(' + p + ') is written, no alert', r.edited && !r.alert && new RegExp(n).test(r.text || ''));
  }
  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
})();

/**
 * E11k - the messages of a failed CRTS36DSPF on the SFGR source lines. The catalogue is Appendix D of the Reference
 * (SC41-4731). NO REAL FAILING PRINTOUT HAS BEEN RECORDED YET (roadmap open question 3): every listing text below is a
 * STAND-IN written from one sentence of the manual ("the message is printed immediately following the statement that
 * caused the error"), marked STAND-IN where it is made. When a real QPUTSFGR arrives it replaces these.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const M = require('../sfgrCompileMessages.js');
const CompileListing = require('../compileListing.js');
const CD = require('../compileDiagnostics.js');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const rows = SOURCE.split(/\r?\n/);

console.log('the catalogue (Appendix D)');
const ids = Object.keys(M.CATALOG);
check('271 message ids, all SYX and four digits', ids.length === 271 && ids.every((i) => /^SYX\d{4}$/.test(i)));
check('letters are T, W, I (one unknown)', ids.every((i) => ['T', 'W', 'I', '?'].indexOf(M.CATALOG[i][0]) >= 0) && ids.filter((i) => M.CATALOG[i][0] === '?').length === 1);
check('SYX5051 is a terminal message on the S specification', M.describe('SYX5051').letter === 'T' && M.describe('SYX5051').specType === 'S' && /FIRST CHARACTER/.test(M.describe('SYX5051').text));
check('a message that wraps in the manual is one text', /SPECIFIED FOR THIS RUN OF \$SFGR\.$/.test(M.describe('SYX5056').text) && !/- /.test(M.describe('SYX5056').text));
check('an unknown id is null', M.describe('SYX9999') === null);

// STAND-IN: a printout in which each statement is followed by its messages (the manual's one sentence), with a page heading
const at = (n) => rows[n - 1];
const standIn = [
  '                        $SFGR  SOURCE LISTING                        PAGE    1',
  at(1), at(2),
  '  SYX5051 T INVALID FIRST CHARACTER IN DISPLAY SCREEN FORMAT NAME',
  '            ENTRY. MUST BE ALPHABETIC, @, # OR $.',
  at(3),
  '  SYX5071 W FIRST POSITION IN SOUND ALARM ENTRY IS N. SECOND POSITION',
  '            IS NOT BLANK AND IS IGNORED.',
  '  SYX5072 W SECOND POSITION IN SOUND ALARM ENTRY IS ZERO OR NOT NUMERIC. NO IS ASSUMED.',
  at(4), at(5)
].join('\n');
const parsed = M.parseListing(standIn);
check('a printout with SYX lines is recognized, a DDS listing text is not', parsed.recognized && !M.parseListing('5738SS1 V7R3M0 Data Description Source\nSEQNBR').recognized);
check('three messages, the wrapped text is joined from the catalogue', parsed.messages.length === 3 && parsed.messages[1].text === M.describe('SYX5071').text);
check('each message keeps the statement printed before it', parsed.messages[0].statement === at(2) && parsed.messages[1].statement === at(3) && parsed.messages[2].statement === at(3));
const mapped = M.mapToSource(parsed.messages, SOURCE);
check('mapped to source lines 2 and 3 (1-based), in order', mapped[0].line === 2 && mapped[1].line === 3 && mapped[2].line === 3);
check('severity from the letter: T error, W warning', mapped[0].severity === 'error' && mapped[1].severity === 'warning');

console.log('\nnot placed');
const edited = SOURCE.replace(at(2), at(2).slice(0, 10) + 'ZZ' + at(2).slice(12));
const late = M.mapToSource(parsed.messages, edited);
check('a statement edited since the compile is file-level (line-changed), the others still mapped', late[0].line === null && late[0].reason === 'line-changed' && late[1].line === 3);
const none = M.mapToSource(M.parseListing('SYX5050 T VALUE SPECIFIED IN FORM TYPE ENTRY IS INVALID. MUST BE S.').messages, SOURCE);
check('a message with no statement before it is file-level (no-statement)', none[0].line === null && none[0].reason === 'no-statement');
check('a statement with other text in columns 1-5 still maps', M.mapToSource([{ id: 'SYX5071', letter: 'W', text: 't', statement: '00020' + at(2).slice(5) }], SOURCE)[0].line === 2);

console.log('\nthe same statement twice');
const dup = [at(2), '  SYX5071 W X', at(2), '  SYX5072 W Y'].join('\n');
const sameRows = SOURCE.split(/\r?\n/);
const twice = [sameRows[0], sameRows[1], sameRows[1]].join('\n');
const dm = M.mapToSource(M.parseListing(dup).messages, twice);
check('two messages under identical statements go to the first, then the next identical line', dm[0].line === 2 && dm[1].line === 3);

console.log('\ndiagnostics');
const d = M.toDiagnostics(parsed, SOURCE, { source: 'CRTS36DSPF' });
check('one diagnostic per message, on the whole line, code = id, source CRTS36DSPF', d.diagnostics.length === 3 && d.mapped === 3 && d.fileLevel === 0 && d.diagnostics[0].line === 2 && d.diagnostics[0].code === 'SYX5051' && d.diagnostics[0].source === 'CRTS36DSPF' && d.diagnostics[0].column === 1 && d.diagnostics[0].endColumn === at(2).length + 1);
check('  error and warning severities', d.diagnostics[0].severity === 'error' && d.diagnostics[1].severity === 'warning');
const df = M.toDiagnostics(M.parseListing(standIn), edited, {});
check('a file-level one lands on line 1 with a note', df.fileLevel === 1 && df.diagnostics[0].fileLevel === true && df.diagnostics[0].line === 1 && /not in the source any more/.test(df.diagnostics[0].message));

console.log('\nthe E2 pipeline');
(async () => {
  const real = CompileListing.fetchCompileListing;
  CompileListing.fetchCompileListing = async () => ({ ok: true, text: standIn, job: 'J1' });
  const out = await CD.collectCompileFeedback({ runSQL() {} }, { fileName: 'T.DSPF36', source: 'CRTS36DSPF', sourceText: SOURCE, mark: { since: '2026-01-01', user: 'U' }, commandText: 'CPF0000 x' }, {});
  check('CRTS36DSPF with a SYX printout: via listing, sfgr, three diagnostics mapped', out.ok && out.via === 'listing' && out.sfgr === true && out.diagnostics.length === 3 && out.mapped === 3);
  check('  the raw printout goes to the Output channel', out.raw === standIn);
  const other = await CD.collectCompileFeedback({ runSQL() {} }, { fileName: 'T.DSPF', source: 'CRTDSPF', sourceText: SOURCE, mark: {}, commandText: 'CPD7B34 Error found in DDS' }, {});
  check('CRTDSPF with the same text does not use the SFGR parser', other.ok && !other.sfgr);
  CompileListing.fetchCompileListing = async () => ({ ok: true, text: 'nothing that looks like a listing' });
  const plain = await CD.collectCompileFeedback({ runSQL() {} }, { fileName: 'T.DSPF36', source: 'CRTS36DSPF', sourceText: SOURCE, mark: {}, commandText: 'CPF7B34 Error found' }, {});
  check('CRTS36DSPF with a text that is no printout falls back to the command text, as before', plain.ok && plain.via === 'command' && !plain.sfgr);
  CompileListing.fetchCompileListing = real;
  process.exit(process.exitCode || 0);
})();

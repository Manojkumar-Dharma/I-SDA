/**
 * E12e - the recorded $SFGR and CRTDSPF printouts (docs/sda-reference/source/compile-fixtures): the listing parser reads
 * them all, every message lands on the line the compiler meant, the designer's own checks predict what the compiler
 * stopped on (and stay quiet where it compiled), comment lines are not errors, the edit code column is read, and the
 * DDS listing's reference column is the SFGR source line.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check } = require('./helpers/harness');
const Messages = require('../sfgrCompileMessages.js');
const Parser = require('../sfgrParser.js');
const Diagnostics = require('../sfgrDiagnostics.js');

const DIR = path.join(__dirname, '../../docs/sda-reference/source/compile-fixtures');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const stipfm = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const analyze = (t) => { const r = Diagnostics.analyze(t); return r.diagnostics || r.problems || r; };
const tally = (list) => list.reduce((o, m) => { o[m.id] = (o[m.id] || 0) + 1; return o; }, {});

console.log('the printouts are read');
const sets = [
  ['stipfm', stipfm, { SYX5317: 73, SYX5318: 26, SYX5077: 3 }],
  ['edtall', read('edtall.dspf36'), { SYX5150: 1 }],
  ['ddsrow', read('ddsrow.dspf36'), { SYX5094: 1, SYX5150: 1 }],
  ['ddsovl', read('ddsovl.dspf36'), { SYX5102: 1 }],
  ['ddsnum', read('ddsnum.dspf36'), { SYX5182: 1 }],
  ['ddspc', read('ddspc.dspf36'), { SYX5078: 1 }],
  ['ddslc', read('ddslc.dspf36'), { SYX5293: 1 }],
  ['dbcs1-draft', read('dbcs1draft.dspf36'), { SYX5150: 1 }],
  ['ddsedge', read('ddsedge.dspf36'), {}],
  ['dbcs1', read('dbcs1.dspf36'), {}]
];
const parsedOf = {};
sets.forEach(([name, source, expected]) => {
  const parsed = Messages.parseListing(read(name + '-sfgr-listing.txt'));
  parsedOf[name] = parsed;
  check(name + ': the messages are the ones the compiler printed', JSON.stringify(tally(parsed.messages)) === JSON.stringify(expected));
  const mapped = Messages.mapToSource(parsed.messages, source);
  check('  every one is placed on a source line', mapped.every((m) => typeof m.line === 'number'));
});
const dsp = Messages.parseListing(read('dspfall-sfgr-listing.txt'));
check('dspfall: 149 messages in 40 + ids, all read, all placed', dsp.messages.length === 149 && Messages.mapToSource(dsp.messages, read('dspfall.dspf36')).every((m) => typeof m.line === 'number'));
check('  the terminal ones are the failure, the others are warnings', dsp.messages.some((m) => m.letter === 'T') && dsp.messages.some((m) => m.letter === 'W'));

console.log('\nwhere they land');
const line = (name, id) => Messages.mapToSource(parsedOf[name].messages, sets.find((s) => s[0] === name)[1]).filter((m) => m.id === id).map((m) => m.line);
check('EDTALL SYX5150 is on the TOTAL: line (62)', JSON.stringify(line('edtall', 'SYX5150')) === '[62]');
check('a page break between a statement and its message keeps the statement (STIPFM page 9)', Messages.mapToSource(parsedOf.stipfm.messages, stipfm).length === 102);
check('DDSOVL SYX5102 is on the second field (line 3)', JSON.stringify(line('ddsovl', 'SYX5102')) === '[3]');
const diag = Messages.toDiagnostics(parsedOf.ddsovl, read('ddsovl.dspf36')).diagnostics[0];
check('the diagnostic marks the line and column entries (19 - 22), not the whole line', diag.line === 3 && diag.column === 19 && diag.endColumn === 23);
check('  and carries the explanation of the Reference row', /SYX5102 is terminal/.test(diag.explanation) && /SYX5102 is terminal/.test(diag.message));
const pc = Messages.toDiagnostics(parsedOf.ddspc, read('ddspc.dspf36')).diagnostics[0];
check('position cursor (SYX5078) marks columns 32 - 33', pc.column === 32 && pc.endColumn === 34);
const cols = Parser.D_COLUMNS;
const colOf = (k) => cols.find ? cols.find((c) => c.key === k || c[0] === k) : cols[k];
const range = (k) => { const c = colOf(k); return c ? [c.from !== undefined ? c.from : c[1], c.to !== undefined ? c.to : c[2]] : null; };
check('the column ranges agree with the D column table', JSON.stringify(Messages.MESSAGE_COLUMNS.SYX5078.D) === JSON.stringify(range('positionCursor')) && JSON.stringify(Messages.MESSAGE_COLUMNS.SYX5293.D) === JSON.stringify(range('lowercase')) && JSON.stringify(Messages.MESSAGE_COLUMNS.SYX5182.D) === JSON.stringify(range('length')) && JSON.stringify(Messages.MESSAGE_COLUMNS.SYX5317.D) === JSON.stringify(range('name')));

console.log('\nthe designer predicts the compiler');
const flagged = (t, re) => analyze(t).filter((d) => re.test(d.message)).map((d) => d.line || (d.range && d.range.line));
const dspfallSource = read('dspfall.dspf36');
const compilerLines = dsp.messages.length && Messages.mapToSource(dsp.messages.filter((m) => m.id === 'SYX5150'), dspfallSource).map((m) => m.line).sort((a, b) => a - b);
const ourLines = flagged(dspfallSource, /SYX5150/).sort((a, b) => a - b);
check('DSPFALL: the 40 SYX5150 lines are exactly the ones we flag', compilerLines.length === 40 && JSON.stringify(compilerLines) === JSON.stringify(ourLines));
check('EDTALL: only the TOTAL: line is flagged', JSON.stringify(flagged(read('edtall.dspf36'), /SYX5150/)) === '[62]' && analyze(read('edtall.dspf36')).length === 1);
check('DBCS1 draft (constant without Y): SYX5150 predicted; the corrected member is clean', flagged(read('dbcs1draft.dspf36'), /SYX5150/).length === 1 && analyze(read('dbcs1.dspf36')).length === 0);
check('DDSNUM: type S length 32 is flagged (SYX5182)', flagged(read('ddsnum.dspf36'), /SYX5182/).length === 1);
check('DDSPC: the second position cursor Y is flagged (SYX5078)', JSON.stringify(flagged(read('ddspc.dspf36'), /SYX5078/)) === '[3]');
check('DDSLC: lowercase on a signed numeric field is a warning (SYX5293)', analyze(read('ddslc.dspf36')).some((d) => /SYX5293/.test(d.message) && d.severity === 'warning'));
check('DDSOVL and DDSROW are predicted by the overlap and last-row checks', analyze(read('ddsovl.dspf36')).length === 1 && analyze(read('ddsrow.dspf36')).some((d) => /below the last row/.test(d.message)));
check('what compiled stays clean: STIPFM, DDSEDGE', analyze(stipfm).length === 0 && analyze(read('ddsedge.dspf36')).length === 0);

console.log('\ncomment lines and the edit code');
const commentLines = dspfallSource.split(/\r?\n/).map((l, i) => [l, i + 1]).filter(([l]) => /^.{5} \*/.test(l)).map(([, n]) => n);
const diagLines = new Set(analyze(dspfallSource).map((d) => d.line));
check('DSPFALL has comment lines the compiler passed over silently', commentLines.length > 10);
check('  and none of them is an error here', commentLines.every((n) => !diagLines.has(n)));
const edt = Parser.parse(read('edtall.dspf36'));
const codes = edt.entries.filter((e) => e.kind === 'D').map((e) => e.values.editCode);
check('EDTALL: the edit code column (25) is read', codes[0] === '1' && codes.includes('A') && codes.includes('Z') && codes.includes('j'));

console.log('\nthe DDS listing');
const ddsLines = read('stipfm-dds-listing.txt').split('\n');
let compared = 0, agreed = 0;
ddsLines.forEach((l) => {
  const m = /^\s*\d+\s+(\d{4}) A\s{2,}([A-Z$#@][A-Z0-9$#@]*)\s+\d+[A-Z]?\s+[IOB]\s/.exec(l);
  if (!m) return;
  const entry = Parser.parse(stipfm).entries.find((e) => e.kind === 'D' && e.line === +m[1]);
  if (!entry) return;
  compared++;
  if (String(entry.values.name).trim().replace(',', '$') === m[2]) agreed++;
});
check('the reference column of a DDS line is the SFGR source line (' + agreed + ' of ' + compared + ' named fields)', compared > 100 && agreed >= compared - 40 && agreed > 60);
check('the CPD8018 marker is printed twice for a one-format member (DDSEDGE)', (read('ddsedge-dds-listing.txt').match(/CPD8018-\*/g) || []).length === 2);
check('type K becomes a W field in DDS and E, F, O, X plain A (DBCS1)', /FLDK\s+10W/.test(read('dbcs1-dds-listing.txt')) && /FLDE\s+10A/.test(read('dbcs1-dds-listing.txt')));

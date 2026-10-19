/**
 * e2cLineMap.test.js
 *
 * E2c - put a compile message on the line it belongs to (src/compileLineMap.js), working from the E2b
 * parse result (src/compileMessages.js) and the text of the member or local file.
 *
 * Verifies:
 *  1. the E2a fixture (TESTDSP, a real failing CRTDSPF on IBM i V7R3M0): the six line-level messages land on the
 *     DDS lines they belong to, by ordinal (the sequence numbers are not 100 x line), checked against the line
 *     text itself; the escape message stays global; lines are 1-based with the whole-line range.
 *  2. the source changed since the compile: lines inserted or removed move the messages with their lines, an edited
 *     line takes its messages global (`line-changed`), repeated lines keep their order, the diff is capped.
 *  3. the three writer behaviours the roadmap names: a commented-out OR line `A*O` (I-203), a tag in columns 1-5
 *     instead of digits (I-204), removed lines kept as comments with their number (I-207).
 *  4. the fallbacks: line counts that agree while the listing text cannot be compared, then the numbers in
 *     columns 1-5 (comment lines passed over, ambiguity, no numbers, not found).
 *  5. messages that never had a line (job log, command text, the escape message) are global.
 *  6. tolerance: arrays, CRLF, a trailing line break, null and junk, input never modified, speed on big sources.
 *  7. E2b's new `sourceLines` (the text each listed line printed): all 51 fixture lines, the date taken off in
 *     each layout, a blank line, a line across a page break.
 *
 * Run with: node src/test/e2cLineMap.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CompileMessages = require(path.join(__dirname, '../compileMessages.js'));
const CompileLineMap = require(path.join(__dirname, '../compileLineMap.js'));
const { check, failureCount } = require('./helpers/harness');

const dir = path.join(__dirname, 'fixtures/compile');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const listingText = read('testdsp.listing.txt');
const joblogText = read('testdsp.joblog.txt');
const toastText = read('testdsp.toast.txt');
const ddsText = read('testdsp.dds');
const ddsLines = ddsText.split('\n').filter((l) => l.length > 0);

/** A listing in the shape of the fixture: header, source lines with their date, markers under their line, messages, escape. */
function makeListing(lines, opts) {
  opts = opts || {};
  const seqs = opts.seqs || lines.map((_, i) => (i + 1) * 100);
  const marks = opts.marks || [];
  const texts = opts.texts || {};
  const out = [];
  out.push('5770SS1 V7R3M0 160422 Data Description MANOJKUMAR/TESTDSP 10/18/26 12:10:07 Page 1');
  out.push('File name . . . . . . . . . . . . . . . . . . . . . : TESTDSP');
  out.push(' Data Description Source');
  out.push('SEQNBR *...+....1....+....2....+....3....+....4....+....5....+....6....+....7....+....8 Date');
  lines.forEach((l, i) => {
    const shown = opts.fromColumn ? l.slice(opts.fromColumn - 1) : l;       // a listing that does not print columns 1-5 (not confirmed either way)
    out.push(' ' + seqs[i] + ' ' + shown.replace(/\s+$/, '') + ' ' + (opts.date || '10/18/26'));
    marks.filter((m) => m.after === i + 1).forEach((m) => out.push('* ' + m.id + '-**********'));
  });
  out.push(' * * * * * E N D O F S O U R C E * * * * *');
  out.push(' Messages');
  out.push(' ID Severity Number');
  const ids = [];
  marks.forEach((m) => { if (ids.indexOf(m.id) < 0) ids.push(m.id); });
  ids.forEach((id) => out.push('* ' + id + ' ' + (texts[id] ? texts[id][0] : 30) + ' 1 Message . . . . : ' + (texts[id] ? texts[id][1] : 'Text of ' + id + '.')));
  out.push(' Message Summary');
  out.push(' Total Informational Warning Error Severe');
  out.push(' (0-9) (10-19) (20-29) (30-99)');
  out.push(' ' + (ids.length) + ' 0 0 0 ' + ids.length);
  out.push('* CPF7302 40 Message . . . . : File TESTDSP not created in library MANOJKUMAR.');
  out.push(' * * * * * E N D O F C O M P I L A T I O N * * * * *');
  return out.join('\n');
}

/** Parse a made listing and map it against `source`. */
function mapListing(listingLines, marks, source, opts) {
  const parsed = CompileMessages.parseListing(makeListing(listingLines, { marks: marks, seqs: opts && opts.seqs }));
  return { parsed: parsed, result: CompileLineMap.mapMessages(parsed, source, opts && opts.mapOptions) };
}

const byId = (result) => {
  const o = {};
  result.messages.forEach((m) => { (o[m.msgId] = o[m.msgId] || []).push(m); });
  return o;
};

// ---- 1. the fixture ------------------------------------------------------------

const parsedFixture = CompileMessages.parseListing(listingText);
const R = CompileLineMap.mapMessages(parsedFixture, ddsText);
const F = byId(R);

check('fixture: ok, the source is what was compiled (identical, nothing changed), 51 listed / 51 source lines all matched',
  R.ok === true && R.alignment === 'identical' && R.changed === false && R.listedCount === 51 && R.lineCount === 51 && R.matchedCount === 51);
check('fixture: seven messages, six on a line and the escape message global', R.messages.length === 7 && R.mapped.length === 6 && R.global.length === 1);
check('fixture: the escape message CPF7302 is global because it has no line (file-level)',
  R.global[0].msgId === 'CPF7302' && R.global[0].line === null && R.global[0].reason === 'file-level' && R.global[0].how === null);
check('fixture: CPD5237 duplicate field (sequence 1801) is line 15, the second CUSTID field',
  F.CPD5237[0].line === 15 && /CUSTID\s+5S 0B\s+5 30/.test(ddsLines[14]));
check('fixture: CPD7830 start line too large (sequence 1901) is line 17, the row 30 constant',
  F.CPD7830[0].line === 17 && /30\s+2'F3=Exit'/.test(ddsLines[16]));
check('fixture: the three DSPATR(XX) messages (sequence 3102) are all line 31',
  ['CPD7850', 'CPD7520', 'CPD7494'].every((id) => F[id][0].line === 31) && /DSPATR\(XX\)/.test(ddsLines[30]));
check('fixture: CPD5236 duplicate record (sequence 3600) is line 36, the second HDRREC',
  F.CPD5236[0].line === 36 && /R HDRREC/.test(ddsLines[35]));
check('fixture: every line-level message was found by ordinal', R.mapped.every((m) => m.how === 'ordinal' && m.reason === null));
check('fixture: the sequence number is not the line (1801 is the 15th line, not 18); the ordinal is what maps',
  F.CPD5237[0].sequence === 1801 && F.CPD5237[0].line !== Math.round(F.CPD5237[0].sequence / 100) && F.CPD5237[0].ordinal === 15);
check('fixture: lines are 1-based and each message covers the whole line (column 1 to the end of its text, like ddsDiagnostics)',
  R.mapped.every((m) => m.column === 1 && m.endColumn === Math.max(ddsLines[m.line - 1].replace(/\s+$/, '').length + 1, 2)));
check('fixture: the message fields of E2b are all still there (id, severity, text, sequence, ordinal, source, marker)',
  F.CPD5237[0].severity === 30 && F.CPD5237[0].text === 'Field or ALIAS name specified more than once in record.' && F.CPD5237[0].source === 'listing' && F.CPD5237[0].sequence === 1801 && typeof F.CPD5237[0].marker === 'string');
check('fixture: mapped and global together are the messages, in the order the parser gave them',
  R.messages.map((m) => m.msgId).join() === parsedFixture.messages.map((m) => m.msgId).join() && R.mapped.length + R.global.length === R.messages.length);

// ---- 2. the source changed since the compile ------------------------------------

function edited(fn) {
  const lines = ddsText.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  fn(lines);
  return CompileLineMap.mapMessages(parsedFixture, lines.join('\n'));
}
const lineOf = (res, id) => byId(res)[id][0].line;

const ins = edited((l) => l.splice(3, 0, '     A* a comment added after the compile'));
check('a line inserted above: aligned, changed, every message moved down by one with its line',
  ins.alignment === 'aligned' && ins.changed === true && ins.matchedCount === 51 &&
  lineOf(ins, 'CPD5237') === 16 && lineOf(ins, 'CPD7830') === 18 && lineOf(ins, 'CPD7494') === 32 && lineOf(ins, 'CPD5236') === 37);
check('a line inserted above: the moved message still sits on the same text', ins.mapped.every((m) => m.how === 'aligned'));

const del = edited((l) => l.splice(0, 5));
check('five lines removed from the top: messages move up by five',
  del.alignment === 'aligned' && lineOf(del, 'CPD5237') === 10 && lineOf(del, 'CPD7830') === 12 && lineOf(del, 'CPD5236') === 31 && del.mapped.length === 6);

const gone = edited((l) => l.splice(14, 1));
check('the message\'s own line deleted: that message is global (line-changed), the others follow their lines up',
  byId(gone).CPD5237[0].line === null && byId(gone).CPD5237[0].reason === 'line-changed' && lineOf(gone, 'CPD7830') === 16 && lineOf(gone, 'CPD5236') === 35);

const edit1 = edited((l) => { l[16] = l[16].replace('F3=Exit', 'F3=Quit'); });
check('the line a message is on edited: that message is global, the others stay where they were',
  byId(edit1).CPD7830[0].reason === 'line-changed' && lineOf(edit1, 'CPD5237') === 15 && lineOf(edit1, 'CPD5236') === 36 && edit1.changed === true && edit1.mapped.length === 5);

const edit2 = edited((l) => { l[1] = l[1].replace('BLINK', 'BLINK '); l[5] = '     A                                  1 26\'CUSTOMER INFO\''; });
check('an unrelated line edited: all six messages stay on their lines, flagged as aligned',
  edit2.alignment === 'aligned' && edit2.mapped.length === 6 && lineOf(edit2, 'CPD5237') === 15 && lineOf(edit2, 'CPD5236') === 36);

const blanks = edited((l) => { l[2] = '     A                                      BLINK   '; });
check('blanks changed inside a line are not an edit (the text is compared with blanks collapsed)', blanks.alignment === 'identical' && blanks.changed === false);

// repeated lines keep their order: three identical COLOR(BLU) lines, the message is on the second one
const dupLines = ['     A          R REC1', '     A                                      COLOR(BLU)', '     A                                      COLOR(BLU)', '     A                                      COLOR(BLU)', '     A            F1         5A  B  2  5'];
const dupMarks = [{ after: 3, id: 'CPD1111' }];
const dupAbove = mapListing(dupLines, dupMarks, ['     A* new'].concat(dupLines).join('\n'));
check('repeated lines: a line added at the top, the message stays on the second COLOR(BLU) (now line 4)',
  dupAbove.result.alignment === 'aligned' && byId(dupAbove.result).CPD1111[0].line === 4);
const dupBelow = mapListing(dupLines, dupMarks, dupLines.concat(['     A* new at the end']).join('\n'));
check('repeated lines: a line added at the end changes nothing for the message (still line 3)', byId(dupBelow.result).CPD1111[0].line === 3 && dupBelow.result.alignment === 'aligned');

// the diff is capped: with a tiny cell budget only the common start and end are matched
const capped = edited((l) => { l.splice(20, 0, '     A* one'); l.splice(22, 1); });
const cappedSmall = CompileLineMap.mapMessages(parsedFixture, (() => { const l = ddsText.split('\n'); l.pop(); l.splice(20, 0, '     A* one'); l.splice(22, 1); return l.join('\n'); })(), { maxEdits: 1 });
check('an edit in the middle (one line added, one removed) is followed through the diff', capped.alignment === 'aligned' && lineOf(capped, 'CPD5236') === 36 && lineOf(capped, 'CPD5237') === 15);
check('with the diff capped (maxEdits) the common start and end still map; the middle goes global',
  cappedSmall.alignment === 'aligned' && lineOf(cappedSmall, 'CPD5237') === 15 && lineOf(cappedSmall, 'CPD5236') === 36);
const alignDirect = CompileLineMap.alignLines(['a', 'x', 'y', 'b'], ['a', 'p', 'q', 'b'].map((t) => CompileLineMap.prepareLine(t, 80)), 1);
check('alignLines: limited is reported when the middle differs by more than maxEdits, and only the ends are matched',
  alignDirect.limited === true && alignDirect.matched === 2 && alignDirect.map.join() === '0,-1,-1,3');

// the diff against a reference: Myers' result has the length of the longest common subsequence, in order, on equal text
function lcsLength(a, b) {
  const dp = [];
  for (let i = 0; i <= a.length; i++) dp.push(new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return dp[0][0];
}
let seed = 20261019;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let diffOk = true;
let diffCases = 0;
for (let c = 0; c < 400; c++) {
  const a = []; const b = [];
  const na = rnd(14); const nb = rnd(14);
  for (let i = 0; i < na; i++) a.push('abc'.charAt(rnd(3)));
  for (let i = 0; i < nb; i++) b.push('abc'.charAt(rnd(3)));
  const r = CompileLineMap.alignLines(a, b.map((t) => CompileLineMap.prepareLine(t, 80)), 1000);
  let last = -1;
  const increasing = r.map.every((j) => { if (j < 0) return true; const ok = j > last; last = j; return ok; });
  const equalText = r.map.every((j, i) => j < 0 || a[i] === b[j]);
  if (r.limited || !increasing || !equalText || r.matched !== lcsLength(a, b)) { diffOk = false; console.log('  diff case', c, JSON.stringify(a), JSON.stringify(b), JSON.stringify(r)); }
  diffCases++;
}
check('alignLines: on 400 random cases with many repeated lines the matches are in order, equal text, and as many as the longest common subsequence', diffOk && diffCases === 400);

// ---- 3. the writer behaviours: I-203, I-204, I-207 ------------------------------

const seqLines = [
  '00100A          R REC1',
  '00200A            FLD1       5A  B  2  5',
  '00300A  21                                  COLOR(RED)',
  '00400A*O 22                                  COLOR(GRN)',     // I-203: a commented-out OR line, the * in front of the O
  '00500A  22                                  COLOR(GRN)',
  '00600A            FLD2       5A  B  3  5'
];
const i203 = mapListing(seqLines, [{ after: 5, id: 'CPD2222' }, { after: 6, id: 'CPD3333' }], seqLines.join('\n'));
check('I-203: a commented-out OR line (`A*O`) is a line the compiler listed, so it counts: the message under line 6 is line 6',
  i203.result.alignment === 'identical' && byId(i203.result).CPD3333[0].line === 6 && byId(i203.result).CPD2222[0].line === 5);
check('I-203: the helpers read the commented-out OR line as a comment and the others as live',
  CompileLineMap.isComment(seqLines[3]) === true && CompileLineMap.isComment(seqLines[4]) === false && CompileLineMap.isComment(seqLines[2]) === false);
const i203moved = mapListing(seqLines, [{ after: 6, id: 'CPD3333' }], ['00000A* added'].concat(seqLines).join('\n'));
check('I-203: with a line added above, the message still follows its line past the shifted `A*O` text (line 7)', byId(i203moved.result).CPD3333[0].line === 7);

const tagged = seqLines.map((l, i) => ([2, 4, 5].indexOf(i) >= 0 ? 'MK102' + l.slice(5) : l));     // I-204: tag in columns 1-5 on changed lines
const i204 = mapListing(tagged, [{ after: 3, id: 'CPD4444' }, { after: 6, id: 'CPD3333' }], tagged.join('\n'));
check('I-204: a tag in columns 1-5 does not matter to the ordinal: the line the compiler listed is the line',
  i204.result.alignment === 'identical' && byId(i204.result).CPD4444[0].line === 3 && byId(i204.result).CPD3333[0].line === 6);
check('I-204: columns 1-5 with a tag are not a sequence number, digits are',
  CompileLineMap.sequenceOf(tagged[2]) === null && CompileLineMap.sequenceOf(tagged[1]) === 200 && CompileLineMap.sequenceOf('     A          R X') === null && CompileLineMap.sequenceOf('  500A') === 500);
const from6 = CompileLineMap.mapMessages(CompileMessages.parseListing(makeListing(tagged, { fromColumn: 6, marks: [{ after: 3, id: 'CPD4444' }, { after: 6, id: 'CPD3333' }] })), tagged.join('\n'));
check('a listing that prints only from column 6 (no digits or tag) still matches the source: identical, same lines',
  from6.alignment === 'identical' && byId(from6).CPD4444[0].line === 3 && byId(from6).CPD3333[0].line === 6);
const from6moved = CompileLineMap.mapMessages(CompileMessages.parseListing(makeListing(seqLines, { fromColumn: 6, marks: [{ after: 6, id: 'CPD3333' }] })), ['00000A* added'].concat(seqLines).join('\n'));
check('the same listing against a source with a line added: aligned, the message moves to line 7', from6moved.alignment === 'aligned' && byId(from6moved).CPD3333[0].line === 7);
const allTagged = seqLines.map((l) => 'MK102' + l.slice(5));
const noNumbers = CompileLineMap.mapMessages({ kind: 'listing', recognized: true, sourceSequences: [1, 2, 3, 4, 5, 6, 7], messages: [{ msgId: 'CPD9999', sequence: 300, ordinal: 3, source: 'listing' }] }, allTagged.join('\n'));
check('I-204: counts differ and no line has a number in columns 1-5 (all tagged): global, no-sequence-numbers',
  noNumbers.alignment === 'sequence' && noNumbers.messages[0].line === null && noNumbers.messages[0].reason === 'no-sequence-numbers');
const someTagged = CompileLineMap.mapMessages({ kind: 'listing', recognized: true, sourceSequences: [100, 200, 300, 400, 500, 600, 700], messages: [{ msgId: 'CPD1', sequence: 200, ordinal: 2, source: 'listing' }, { msgId: 'CPD2', sequence: 300, ordinal: 3, source: 'listing' }] }, tagged.join('\n'));
check('I-204: with only some lines tagged, a numbered line is found by sequence and a tagged one is not found',
  someTagged.messages[0].line === 2 && someTagged.messages[0].how === 'sequence' && someTagged.messages[1].line === null && someTagged.messages[1].reason === 'sequence-not-found');

const keptRemoved = [
  '00100A          R REC1',
  '00200A            FLD1       5A  B  2  5',
  '00300A*                                     COLOR(RED)',     // I-207: a removed keyword kept as a comment, with its number
  '00300A                                      COLOR(GRN)',     // the line that replaced it carries the same number
  '00400A            FLD2       5A  B  3  5'
];
const i207 = mapListing(keptRemoved, [{ after: 4, id: 'CPD5555' }, { after: 5, id: 'CPD6666' }], keptRemoved.join('\n'));
check('I-207: kept-removed comment lines are lines the compiler listed, so the ordinal maps straight across them',
  i207.result.alignment === 'identical' && byId(i207.result).CPD5555[0].line === 4 && byId(i207.result).CPD6666[0].line === 5);
const i207seq = CompileLineMap.mapMessages({ kind: 'listing', recognized: true, sourceSequences: [100, 200, 300, 300, 400, 500], messages: [{ msgId: 'CPD5555', sequence: 300, ordinal: 4, source: 'listing' }] }, keptRemoved.join('\n'));
check('I-207: by sequence, the kept comment sharing number 300 is passed over and the live line (line 4) is found',
  i207seq.alignment === 'sequence' && i207seq.messages[0].line === 4 && i207seq.messages[0].how === 'sequence');
const twoLive = ['00100A          R REC1', '00200A            FLD1       5A  B  2  5', '00200A                                      COLOR(RED)', '00300A            FLD2       5A  B  3  5'];
const ambiguous = CompileLineMap.mapMessages({ kind: 'listing', recognized: true, sourceSequences: [100, 200, 300, 400, 500], messages: [{ msgId: 'CPD7777', sequence: 200, ordinal: 2, source: 'listing' }] }, twoLive.join('\n'));
check('two live lines with the same number (not comments): ambiguous-sequence, global',
  ambiguous.messages[0].line === null && ambiguous.messages[0].reason === 'ambiguous-sequence');

// ---- 4. the fallbacks ---------------------------------------------------------

const garbage = JSON.parse(JSON.stringify(parsedFixture));
garbage.sourceLines.forEach((s) => { s.text = 'unrecognisable ' + s.sequence; });
const byCount = CompileLineMap.mapMessages(garbage, ddsText);
check('listing text that matches nothing but the same number of lines: the ordinal is used as it is (count)',
  byCount.alignment === 'count' && byCount.changed === null && lineOf(byCount, 'CPD5237') === 15 && lineOf(byCount, 'CPD5236') === 36 && byCount.mapped.every((m) => m.how === 'count'));
const noTexts = JSON.parse(JSON.stringify(parsedFixture));
delete noTexts.sourceLines;
const byCountNoTexts = CompileLineMap.mapMessages(noTexts, ddsText);
check('a parse result without sourceLines (older E2b output) and equal counts: count', byCountNoTexts.alignment === 'count' && lineOf(byCountNoTexts, 'CPD7830') === 17);
const wrongMember = CompileLineMap.mapMessages(garbage, ddsText + '\n     A* one more');
check('listing text that matches nothing and different counts: sequence is tried, there are no numbers, so global',
  wrongMember.alignment === 'sequence' && wrongMember.mapped.length === 0 && wrongMember.global.every((m) => m.reason === 'no-sequence-numbers' || m.reason === 'file-level'));
const numbered = CompileLineMap.mapMessages({ kind: 'listing', recognized: true, sourceSequences: [100, 200, 300, 400, 500, 600, 700], messages: [{ msgId: 'CPD8888', sequence: 500, ordinal: 5, source: 'listing' }, { msgId: 'CPD8889', sequence: 999, ordinal: 8, source: 'listing' }] }, seqLines.join('\n'));
check('by sequence: the line whose columns 1-5 are 00500 is line 5; a number nobody has is sequence-not-found',
  numbered.messages[0].line === 5 && numbered.messages[0].how === 'sequence' && numbered.messages[1].line === null && numbered.messages[1].reason === 'sequence-not-found');
const outOfRange = CompileLineMap.mapMessages({ kind: 'listing', recognized: true, sourceSequences: [100, 200], sourceLines: [{ sequence: 100, text: 'A R REC1' }, { sequence: 200, text: 'A FLD' }], messages: [{ msgId: 'CPD1', sequence: 100, ordinal: 1 }, { msgId: 'CPD2', sequence: 900, ordinal: 9 }] }, ['     A          R REC1', '     A            FLD']);
check('an ordinal beyond the listed lines is out-of-range, not a crash', outOfRange.messages[0].line === 1 && outOfRange.messages[1].line === null && outOfRange.messages[1].reason === 'out-of-range');

// ---- 5. messages that never had a line ------------------------------------------

const jobLog = CompileMessages.parseJobLog(joblogText);
const rJob = CompileLineMap.mapMessages(jobLog, ddsText);
check('job log messages: all global (file-level), nothing mapped, alignment none',
  rJob.ok === true && rJob.kind === 'joblog' && rJob.alignment === 'none' && rJob.mapped.length === 0 && rJob.global.length === jobLog.messages.length && rJob.global.every((m) => m.reason === 'file-level'));
const cmd = CompileMessages.parseCommandText(toastText);
const rCmd = CompileLineMap.mapMessages(cmd, ddsText);
check('command text messages: all global (file-level), the noise flag is kept',
  rCmd.ok === true && rCmd.kind === 'command' && rCmd.mapped.length === 0 && rCmd.global.length === cmd.messages.length && rCmd.global.some((m) => m.noise === true));
const clean = CompileLineMap.mapMessages(CompileMessages.parseListing(makeListing(['     A          R REC1'], {})), '     A          R REC1');
check('a listing with no messages gives an empty result without error (only the escape message is global)', clean.ok === true && clean.mapped.length === 0 && clean.global.length === 1);

// ---- 6. tolerance ---------------------------------------------------------------

const asArray = CompileLineMap.mapMessages(parsedFixture, ddsLines);
const asCrlf = CompileLineMap.mapMessages(parsedFixture, ddsLines.join('\r\n') + '\r\n');
const asNoEnd = CompileLineMap.mapMessages(parsedFixture, ddsLines.join('\n'));
const sig = (r) => r.messages.map((m) => m.msgId + ':' + m.line).join();
check('the source as an array of lines, with CRLF and a trailing line break, or without one: the same result',
  sig(asArray) === sig(R) && sig(asCrlf) === sig(R) && sig(asNoEnd) === sig(R) && asCrlf.alignment === 'identical' && asNoEnd.lineCount === 51);
const extraBlank = CompileLineMap.mapMessages(parsedFixture, ddsText + '\n');
check('an extra blank line at the end of the source is just another line (aligned, same lines)', sig(extraBlank) === sig(R) && extraBlank.alignment === 'aligned');

const bad = [null, undefined, 5, 'x', {}, [], { messages: 'no' }, { messages: [null, 5, 'x', {}] }];
let threw = false;
const badResults = [];
try { bad.forEach((b) => { badResults.push(CompileLineMap.mapMessages(b, ddsText)); badResults.push(CompileLineMap.mapMessages(parsedFixture, b)); }); } catch (e) { threw = true; }
check('never throws on null, numbers, strings, empty objects, junk messages or junk sources', threw === false && badResults.length === 16);
check('junk parse results are not ok and carry an error; junk messages inside a list are all global',
  badResults[0].ok === false && typeof badResults[0].error === 'string' && badResults[12].ok === false && badResults[12].error !== undefined &&
  badResults[14].ok === true && badResults[14].mapped.length === 0 && badResults[14].global.length === 4);
const junkSource = CompileLineMap.mapMessages(parsedFixture, null);
check('a source that is not text maps nothing (all global) instead of failing', junkSource.ok === true && junkSource.lineCount === 0 && junkSource.mapped.length === 0 && junkSource.global.length === 7);

const frozen = JSON.stringify(parsedFixture);
CompileLineMap.mapMessages(parsedFixture, ddsText);
edited((l) => l.splice(2, 1));
check('the parse result is not modified, and a mapped message is a copy', JSON.stringify(parsedFixture) === frozen && R.messages[0] !== parsedFixture.messages[0]);

// speed on big sources
const bigLines = [];
for (let i = 0; i < 33000; i++) bigLines.push(i % 7 === 0 ? '     A          R REC' + i : '     A            FLD' + i + '       5A  B  2  5');
const bigParsed = CompileMessages.parseListing(makeListing(bigLines, { seqs: bigLines.map((_, i) => i + 1), marks: [{ after: 20000, id: 'CPD1234' }, { after: 32999, id: 'CPD1235' }] }));
let t0 = Date.now();
const bigSame = CompileLineMap.mapMessages(bigParsed, bigLines.join('\n'));
const tSame = Date.now() - t0;
check('33,000 lines, source as compiled: identical and quick', bigSame.alignment === 'identical' && lineOf(bigSame, 'CPD1234') === 20000 && lineOf(bigSame, 'CPD1235') === 32999 && tSame < 3000);
const bigEdited = bigLines.slice();
bigEdited.splice(15000, 0, '     A* inserted');
bigEdited[25000] = '     A* edited';
t0 = Date.now();
const bigAligned = CompileLineMap.mapMessages(bigParsed, bigEdited.join('\n'));
const tEdit = Date.now() - t0;
check('33,000 lines with one insert and one edit: aligned, the message after both moves by one, quick',
  bigAligned.alignment === 'aligned' && lineOf(bigAligned, 'CPD1234') === 20001 && lineOf(bigAligned, 'CPD1235') === 33000 && tEdit < 5000);

// ---- 7. E2b's sourceLines --------------------------------------------------------

check('sourceLines: one entry per listed line, in step with sourceSequences',
  parsedFixture.sourceLines.length === 51 && parsedFixture.sourceLines.every((s, i) => s.sequence === parsedFixture.sourceSequences[i]));
check('sourceLines: every one of the 51 texts is the DDS line with blanks collapsed (and without the date), page break included',
  parsedFixture.sourceLines.every((s, i) => s.text === ddsLines[i].replace(/\s+/g, ' ').trim()));
check('sourceLines: the line that ends a page (33) has no page header glued on', parsedFixture.sourceLines[32].text === 'A CUSTSTAT 10A O 13 30');
const dateOf = (tail) => CompileMessages.parseListing(makeListing(['     A          R REC1'], { date: tail })).sourceLines[0].text;
check('sourceLines: the source date is taken off in the formats a job can print (mm/dd/yy, dd.mm.yyyy, yy-mm-dd, yy/ddd)',
  dateOf('10/18/26') === 'A R REC1' && dateOf('18.10.2026') === 'A R REC1' && dateOf('26-10-18') === 'A R REC1' && dateOf('26/291') === 'A R REC1');
const blankParsed = CompileMessages.parseListing(makeListing(['     A          R REC1', '', '     A            F1         5A  B  2  5'], {}));
check('sourceLines: a blank source line (only its number and date) has empty text', blankParsed.sourceLines.length === 3 && blankParsed.sourceLines[1].text === '');
check('sourceLines: text that merely contains a date in a literal keeps it',
  CompileMessages.parseListing(makeListing(["     A                                      TEXT('on 10/18/26')"], {})).sourceLines[0].text === "A TEXT('on 10/18/26')");
check('sourceLines: other readers return it empty (job log, command text, junk)',
  jobLog.sourceLines.length === 0 && cmd.sourceLines.length === 0 && CompileMessages.parse(null).sourceLines.length === 0);

process.exit(failureCount() === 0 ? 0 : 1);

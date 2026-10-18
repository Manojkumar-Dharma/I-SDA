/**
 * e2bCompileMessages.test.js
 *
 * E2b - the compile-message parser (src/compileMessages.js): a CRTDSPF listing, the job log and the
 * command's own error text to { msgId, severity, sequence, ordinal, text, source }. The fixtures in
 * src/test/fixtures/compile are the E2a samples from a real failing compile on IBM i V7R3M0
 * (TESTDSP: duplicate field, duplicate record, row 30 on a 24-row display, DSPATR(XX)); the listing
 * was read from a PDF, so its column spacing is collapsed and page headers are glued onto line ends.
 *
 * Verifies:
 *  1. the listing: header, the 51 source lines, the six messages and where each one lands (sequence and
 *     ordinal, checked against the DDS source line itself), text and severity from the Messages section, the
 *     summary counts and the line-less escape message, in the order the listing prints them.
 *  2. the sequence numbers are the member's, not 100 * line: the ordinal is what maps them.
 *  3. the job log (text rows and QSYS2.JOBLOG_INFO rows): only file-level messages, no sequence.
 *  4. the command text: ID / text runs, SQL noise flagged, no severity.
 *  5. parse() picks the right reader; severityClass bands.
 *  6. tolerance: CRLF, form feeds, collapsed or widened spacing, wrapped message text, a listing with no
 *     errors, and never throwing on anything (null, numbers, objects, junk, binary, a very long text).
 *
 * Run with: node src/test/e2bCompileMessages.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CompileMessages = require(path.join(__dirname, '../compileMessages.js'));
const { check, failureCount } = require('./helpers/harness');

const dir = path.join(__dirname, 'fixtures/compile');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const listingText = read('testdsp.listing.txt');
const joblogText = read('testdsp.joblog.txt');
const toastText = read('testdsp.toast.txt');
const ddsLines = read('testdsp.dds').split('\n').filter((l) => l.length > 0);

// ---- 1. the listing ----------------------------------------------------------

const L = CompileMessages.parseListing(listingText);
check('listing: recognised, kind listing', L.recognized === true && L.kind === 'listing');
check('listing: header names the file, library, source file, member and severity levels',
  L.header.fileName === 'TESTDSP' && L.header.library === 'MANOJKUMAR' && L.header.sourceFile === 'QDDSSRC' &&
  L.header.sourceLibrary === 'MANOJKUMAR' && L.header.member === 'TESTDSP' && L.header.generationSeverity === 20 && L.header.flaggingSeverity === 0);
check('listing: 51 source lines, one per DDS line, across the page break', L.sourceSequences.length === 51 && ddsLines.length === 51);
check('listing: the sequence numbers are the member\'s (start at 500, 1801 and 3102 are inserted lines)',
  L.sourceSequences[0] === 500 && L.sourceSequences.indexOf(1801) === 14 && L.sourceSequences.indexOf(3102) === 30 && L.sourceSequences[50] === 5200);
check('listing: the expanded-source section is not read as source lines (no duplicates of 2200 / 3101)',
  L.sourceSequences.filter((s) => s === 2200).length === 1 && L.sourceSequences.filter((s) => s === 3101).length === 1);
check('listing: seven messages (six line-level, one escape)', L.messages.length === 7);

const byId = {};
L.messages.forEach((m) => { (byId[m.msgId] = byId[m.msgId] || []).push(m); });
function at(id) { return byId[id] && byId[id][0]; }

check('CPD5237 duplicate field: sequence 1801, severity 30, text from the Messages section',
  at('CPD5237').sequence === 1801 && at('CPD5237').severity === 30 && at('CPD5237').text === 'Field or ALIAS name specified more than once in record.');
check('CPD7830 start line too large: sequence 1901', at('CPD7830').sequence === 1901 && at('CPD7830').severity === 30 && at('CPD7830').text === 'Start line number too large.');
check('CPD5236 duplicate record: sequence 3600', at('CPD5236').sequence === 3600 && at('CPD5236').severity === 30);
check('DSPATR(XX) gives three messages on sequence 3102: CPD7850, CPD7520, CPD7494',
  ['CPD7850', 'CPD7520', 'CPD7494'].every((id) => at(id) && at(id).sequence === 3102) &&
  at('CPD7850').severity === 30 && at('CPD7520').severity === 20 && at('CPD7494').severity === 20);
check('messages come in the order the listing prints them',
  L.messages.map((m) => m.msgId).join(' ') === 'CPD5237 CPD7830 CPD7850 CPD7520 CPD7494 CPD5236 CPF7302');

// the ordinal is the line of the member: check it against the DDS text itself
function ddsLine(m) { return ddsLines[m.ordinal - 1]; }
check('CPD5237 ordinal 15 is the second CUSTID field', L.messages[0].ordinal === 15 && /CUSTID\s+5S 0B\s+5 30/.test(ddsLine(L.messages[0])));
check('CPD7830 ordinal 17 is the row-30 constant', at('CPD7830').ordinal === 17 && /30\s+2'F3=Exit'/.test(ddsLine(at('CPD7830'))));
check('CPD7494 ordinal 31 is the DSPATR(XX) line', at('CPD7494').ordinal === 31 && /DSPATR\(XX\)/.test(ddsLine(at('CPD7494'))));
check('CPD5236 ordinal 36 is the second R HDRREC', at('CPD5236').ordinal === 36 && /R HDRREC/.test(ddsLine(at('CPD5236'))));
check('ordinal and sequence agree: sourceSequences[ordinal - 1] === sequence for every line-level message',
  L.messages.filter((m) => m.sequence !== null).every((m) => L.sourceSequences[m.ordinal - 1] === m.sequence));
check('the raw marker tail is kept (meaning unknown), e.g. CPD7850 keeps its dots', at('CPD7850').marker === '********** . .' && at('CPD7494').marker === '*');

const esc = at('CPF7302');
check('the escape message has severity 40 and text, but no sequence and no ordinal',
  esc.severity === 40 && esc.sequence === null && esc.ordinal === null && esc.text === 'File TESTDSP not created in library MANOJKUMAR.');
check('summary: 6 messages, 0 info, 0 warning, 2 error, 4 severe', JSON.stringify(L.summary) === JSON.stringify({ total: 6, info: 0, warning: 0, error: 2, severe: 4 }));
check('summary counts match the line-level messages by band',
  ['info', 'warning', 'error', 'severe'].every((b) => L.messages.filter((m) => m.sequence !== null && CompileMessages.severityClass(m.severity) === b).length === L.summary[b]));
check('failed: the file was not created (escape severity 40)', L.failed === true);
check('every message says where it came from', L.messages.every((m) => m.source === 'listing'));

// ---- 3. the job log -----------------------------------------------------------

const J = CompileMessages.parseJobLog(joblogText);
check('job log: three rows, oldest first (CPF7311, CPD4090, CPF7302)', J.recognized && J.messages.map((m) => m.msgId).join(' ') === 'CPF7311 CPD4090 CPF7302');
check('job log: type and severity read from the columns',
  J.messages[0].type === 'DIAGNOSTIC' && J.messages[0].severity === 30 && J.messages[1].severity === 10 && J.messages[2].type === 'ESCAPE' && J.messages[2].severity === 40);
check('job log: no sequence number and no ordinal on any row (the line-level CPD messages are not in the job log)',
  J.messages.every((m) => m.sequence === null && m.ordinal === null && m.source === 'joblog'));
check('job log: a failed compile is recognised from the escape message', J.failed === true);
check('job log: the printer message keeps its text without the trailing period it was cut at', J.messages[1].text.indexOf('Output queue changed to QPRINT in library QGPL') > 0);

const rows = [
  { ORDINAL_POSITION: 27, MESSAGE_ID: 'CPF7302   ', MESSAGE_TYPE: 'ESCAPE', SEVERITY: 40, MESSAGE_TEXT: 'File TESTDSP not created in library MANOJKUMAR.  ', MESSAGE_SECOND_LEVEL_TEXT: 'Cause . . . . . :' },
  { ORDINAL_POSITION: 25, MESSAGE_ID: 'CPF7311', MESSAGE_TYPE: 'DIAGNOSTIC', SEVERITY: 30, MESSAGE_TEXT: 'Errors in DDS not allowed with specified GENLVL.' },
  { ORDINAL_POSITION: 26, MESSAGE_ID: null, MESSAGE_TYPE: 'COMPLETION', SEVERITY: 0, MESSAGE_TEXT: 'no id' },
  null, 'junk', 7
];
const JR = CompileMessages.parseJobLog(rows);
check('job log rows: ordered by position, blanks trimmed, rows without an ID skipped',
  JR.messages.length === 2 && JR.messages[0].msgId === 'CPF7311' && JR.messages[1].msgId === 'CPF7302' && JR.messages[1].text === 'File TESTDSP not created in library MANOJKUMAR.' && JR.failed === true);

// ---- 4. the command text ---------------------------------------------------------

const T = CompileMessages.parseCommandText(toastText);
check('command text: eight ID / text runs from the iSDA toast', T.recognized && T.messages.length === 8);
check('command text: the lead-in "iSDA: CRTDSPF failed:" is not a message', T.messages[0].msgId === 'CPC3305' && T.messages[0].text === '1 files deleted. 0 files not deleted.');
check('command text: texts are cut at the next ID', T.messages[3].msgId === 'CPF7311' && T.messages[3].text === 'Errors in DDS not allowed with specified GENLVL.' && T.messages[5].text === 'File TESTDSP not created in library MANOJKUMAR.');
check('command text: the SQL0443 job-log-query noise is flagged, nothing else is', T.messages.filter((m) => m.noise).map((m) => m.msgId).join(' ') === 'SQL0443 SQL0443' && T.messages.slice(0, 6).every((m) => !m.noise));
check('command text: no severity, no sequence', T.messages.every((m) => m.severity === null && m.sequence === null && m.source === 'command'));
check('command text: a plain sentence with no IDs is not recognised', CompileMessages.parseCommandText('Something went wrong: try again later').recognized === false);

// ---- 5. parse() and severityClass -------------------------------------------------

check('parse: a listing', CompileMessages.parse(listingText).kind === 'listing');
check('parse: job log rows as text', CompileMessages.parse(joblogText).kind === 'joblog');
check('parse: job log rows as an array', CompileMessages.parse(rows).kind === 'joblog');
check('parse: the toast text', CompileMessages.parse(toastText).kind === 'command');
check('parse: a listing with only a header is still a listing candidate but yields nothing, so falls through safely', CompileMessages.parse('5770SS1 V7R3M0 160422 Data Description A/B 10/18/26 12:00:00 Page 1\n').messages.length === 0);
check('severityClass bands: 0-9 info, 10-19 warning, 20-29 error, 30 and over severe',
  ['0', 9, 10, 19, 20, 29, 30, 40, 99].map((s) => CompileMessages.severityClass(s)).join(' ') === 'info info warning warning error error severe severe severe');
check('severityClass: junk is unknown', CompileMessages.severityClass(null) === 'unknown' && CompileMessages.severityClass('x') === 'unknown' && CompileMessages.severityClass(-1) === 'unknown');

// ---- 6. tolerance ------------------------------------------------------------------

function sameMessages(a, b) {
  const key = (m) => [m.msgId, m.severity, m.sequence, m.ordinal, m.text].join('|');
  return a.messages.length === b.messages.length && a.messages.every((m, i) => key(m) === key(b.messages[i]));
}
check('CRLF line ends give the same messages', sameMessages(L, CompileMessages.parseListing(listingText.replace(/\n/g, '\r\n'))));
check('form feeds before the page headers give the same messages', sameMessages(L, CompileMessages.parseListing(listingText.replace(/(5770SS1)/g, '\f$1'))));
check('page headers on their own line (not glued) give the same messages', sameMessages(L, CompileMessages.parseListing(listingText.replace(/(\S)(5770SS1)/g, '$1\n$2'))));
const widened = listingText.split('\n').map((l) => l.replace(/ (?=\S)/g, '    ')).join('\n');
check('widened spacing (as in a raw spool file) gives the same messages', sameMessages(L, CompileMessages.parseListing(widened)));
check('trailing blanks on every line give the same messages', sameMessages(L, CompileMessages.parseListing(listingText.split('\n').map((l) => l + '      ').join('\n'))));

const wrapped = listingText.replace('* CPD7830 30 1 Message . . . . : Start line number too large.', '* CPD7830 30 1 Message . . . . : Start line number\n                    too large.');
check('a message text wrapped onto an indented line is joined', CompileMessages.parseListing(wrapped).messages.find((m) => m.msgId === 'CPD7830').text === 'Start line number too large.');

const clean = [
  '5770SS1 V7R3M0 160422 Data Description LIB/OK 10/18/26 12:00:00 Page 1',
  'File name . . . . . . : OK',
  ' Data Description Source',
  'SEQNBR *...+....1', ' 100 A R REC1', ' 200 A 1 2\'Hi\'',
  ' * * * * * E N D O F S O U R C E * * * * *',
  ' Message Summary', ' Total Informational Warning Error Severe', ' 0 0 0 0 0',
  ' * * * * * E N D O F C O M P I L A T I O N * * * * *'
].join('\n');
const C = CompileMessages.parseListing(clean);
check('a clean listing: recognised, two source lines, no messages, not failed, summary all zero',
  C.recognized && C.sourceSequences.length === 2 && C.messages.length === 0 && C.failed === false && C.summary.total === 0);

const noText = CompileMessages.parseListing(listingText.replace(/\* CPD7494 20 1 Message[^\n]*\n/, ''));
check('a marker whose ID is missing from the Messages section keeps its place with no severity or text',
  noText.messages.find((m) => m.msgId === 'CPD7494').severity === null && noText.messages.find((m) => m.msgId === 'CPD7494').text === '' && noText.messages.find((m) => m.msgId === 'CPD7494').sequence === 3102);

const twice = listingText.replace(' 3200 A 13 5\'Account Status. . . . :\' 10/18/26', ' 3200 A 13 5\'Account Status. . . . :\' 10/18/26\n* CPD7494-*');
check('the same ID on two lines gives two messages, each with its own sequence',
  CompileMessages.parseListing(twice).messages.filter((m) => m.msgId === 'CPD7494').map((m) => m.sequence).join() === '3102,3200');

const junk = [undefined, null, 0, 42, true, {}, [], [null], ['x'], 'x', '', '\0\0\u0001\uffff', '* CPD1234-', '* CPD1234 xx Message', 'SEQNBR', ' Data Description Source\n* CPD5237-**\n', '27 CPF7302', { MESSAGE_ID: 'CPF1234' }, () => 1];
let threw = false;
junk.forEach((j) => { ['parse', 'parseListing', 'parseJobLog', 'parseCommandText'].forEach((fn) => { try { const r = CompileMessages[fn](j); if (!r || !Array.isArray(r.messages)) threw = true; } catch (e) { threw = true; } }); });
check('never throws and always returns a messages array, whatever it is given', threw === false);
check('a marker before any source line has no sequence and no ordinal',
  (() => { const r = CompileMessages.parseListing(' Data Description Source\n* CPD5237-**\n 100 A R X\n'); const m = r.messages[0]; return m && m.sequence === null && m.ordinal === null; })());
check('unknown layout: not recognised, empty messages', (() => { const r = CompileMessages.parse('hello world'); return r.recognized === false && r.messages.length === 0; })());

const big = listingText.repeat(300);
const t0 = Date.now();
const BR = CompileMessages.parseListing(big);
check('a 33,000-line text parses quickly (under 2 s) and does not throw', Date.now() - t0 < 2000 && BR.messages.length > 0);

const frozen = JSON.stringify(rows);
CompileMessages.parseJobLog(rows);
check('the input rows are not modified', JSON.stringify(rows) === frozen);

process.exit(failureCount() === 0 ? 0 : 1);

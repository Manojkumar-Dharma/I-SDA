/**
 * E11c - the SFGR parser (src/sfgrParser.js). Pure Node: no vscode, no DOM.
 *
 *  1. the whole sample (stipfm.dspf36): every figure SFGR-SPEC.md gives for it, read back from the parse, and an
 *     independent count from the raw text that the parse has to agree with;
 *  2. every line is in exactly one entry, and the source comes back byte for byte (CRLF, LF, lone CR, mixed,
 *     no final line end, a byte order mark);
 *  3. continuation: joined into one D entry, chains, blank runs, internal blanks kept, and the cases that do not
 *     join (end of source, next line not a D line);
 *  4. the parts the sample does not have, from hand-made fixtures: H specifications, comments, *DDS lines;
 *  5. lines that cannot be read are reported, not thrown (unknown column 6, orphan specs, tabs, long lines);
 *  6. the helpers (columnText, decodeColumn, decodeKeyMask) and the column tables;
 *  7. text that is not a source at all never throws.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const SfgrParser = require('../sfgrParser.js');

const SAMPLE = path.join(__dirname, '..', '..', 'docs', 'sda-reference', 'source', 'stipfm.dspf36');
const sampleText = fs.readFileSync(SAMPLE, 'utf8');

/** A fixed-column line: parts is [[column, text], ...]; the line is right-trimmed like the sample's. */
function mk(type, parts) {
  const a = new Array(80).fill(' ');
  a[5] = type;
  parts.forEach(([col, text]) => { for (let k = 0; k < text.length; k++) a[col - 1 + k] = text[k]; });
  return a.join('').replace(/\s+$/, '');
}
const S = (name, parts) => mk('S', [[7, name]].concat(parts || []));
const D = (name, parts) => mk('D', [[7, name]].concat(parts || []));
const parse = (lines, eol) => SfgrParser.parse(lines.join(eol === undefined ? '\n' : eol));
const kinds = (r) => r.entries.map((e) => e.kind).join(',');
const codes = (r) => r.problems.map((p) => p.code).join(',');

// ---- 1. the sample ---------------------------------------------------------------------------------------------------
{
  const r = SfgrParser.parse(sampleText);
  const d = r.entries.filter((e) => e.kind === 'D');
  check('sample: 549 lines, CRLF throughout', r.lines.length === 549 && r.eol === '\r\n');
  check('sample: the last line has its line end too (the file ends with CRLF)', r.lines[548].eol === '\r\n');
  check('sample: no problem reported on a real source', r.problems.length === 0);
  check('sample: 7 formats named in order',
    r.formats.map((f) => f.name).join(',') === 'CHOIX1,CHOIX,SAISIE,SELECT,ECRDI,SORTIE,CHOIX2');
  check('sample: 7 S entries, 496 D entries, nothing else', r.entries.filter((e) => e.kind === 'S').length === 7 &&
    d.length === 496 && r.entries.length === 7 + 496);
  check('sample: 46 continuation lines are part of D entries, not entries of their own',
    d.reduce((n, e) => n + e.continuationLines, 0) === 46 && 496 + 46 + 7 === 549);
  check('sample: constant type C on 286 D entries, none other', d.filter((e) => e.values.constantType === 'C').length === 286 &&
    d.filter((e) => e.role === 'constant').length === 286 && d.filter((e) => e.role === 'field').length === 210);
  check('sample: start lines blank except SORTIE = 18',
    r.formats.map((f) => f.s.values.startLine).join(',') === ',,,,,18,' &&
    r.formats.map((f) => f.s.numbers.startLine).join(',') === ',,,,,18,');
  check('sample: lines to clear 24 or 0',
    r.formats.map((f) => f.s.numbers.linesToClear).join(',') === '24,24,0,24,0,0,24');
  check('sample: alarm indicator 64 on CHOIX and CHOIX2 only',
    r.formats.map((f) => f.s.values.alarm).join(',') === ',64,,,,,64');
  check('sample: enable command keys Y on all but SORTIE',
    r.formats.map((f) => f.s.values.enableCommandKeys).join(',') === 'Y,Y,Y,Y,Y,,Y');
  check('sample: key masks CV, C, BE, ACEIJ, C, none, C',
    r.formats.map((f) => f.s.values.keyMask).join(',') === 'CV,C,BE,ACEIJ,C,,C');
  check('sample: a key mask is decoded (ACEIJ = command keys 1, 3, 5, 9, 10)',
    r.formats[3].s.keyMask.commandKeys.map((k) => k.number).join(',') === '1,3,5,9,10' &&
    r.formats[3].s.keyMask.invalid.length === 0);
  check('sample: the formats cover the file without a gap (S line to the line before the next S)',
    r.formats[0].startLine === 1 && r.formats[0].endLine === 54 && r.formats[1].startLine === 55 &&
    r.formats[6].endLine === 549 && r.formats.every((f, i) => i === 0 || f.startLine === r.formats[i - 1].endLine + 1));
  check('sample: format field counts add up to the D entries',
    r.formats.reduce((n, f) => n + f.fields.length, 0) === 496 && r.formats.every((f) => f.help.length === 0));

  // a field and its numbers (line 2: FA0001, length 1, line 2, column 2, output Y, input allowed Y, protect Y)
  const first = d[0];
  check('sample: line 2 is read column by column', first.line === 2 && first.values.name === 'FA0001' &&
    first.numbers.length === 1 && first.numbers.line === 2 && first.numbers.column === 2 &&
    first.values.output === 'Y' && first.values.inputAllowed === 'Y' && first.values.protect === 'Y' &&
    first.values.nondisplay === 'Y' && first.values.constantType === 'C' && first.constantText === '1');
  check('sample: an entry carries its original line text and number', first.raw.length === 1 &&
    first.raw[0] === sampleText.split('\r\n')[1] && first.lines.join() === '2' && first.specType === 'D');

  // lines 3 - 4: a blank-run constant (length 50) that continues on a line holding only `D`
  const blankRun = d[1];
  check('sample: lines 3 and 4 are one D entry; the continuation line is joined, not read as a field',
    blankRun.lines.join() === '3,4' && blankRun.continuationLines === 1 && blankRun.raw.length === 2);
  check('sample: line 3 keeps its own columns (name FA0001, length 50, line 3, column 17)',
    blankRun.values.name === 'FA0001' && blankRun.numbers.length === 50 && blankRun.numbers.line === 3 &&
    blankRun.numbers.column === 17 && blankRun.constantText === '');

  // lines 16 - 17: text that runs across the join, with a blank at the join kept and an accented text
  const split = d.find((e) => e.line === 16);
  check('sample: a constant across two lines joins with its internal blanks',
    split.lines.join() === '16,17' && split.constantText === 'Des Produits ont déjà été cochés dans');

  // chains: a continuation line with X in column 80 continues again (lines 177 - 180, 463 - 465, ...)
  const chain = d.find((e) => e.line === 177);
  check('sample: a continuation line that carries X continues again (177 - 180 is one entry)',
    chain.lines.join() === '177,178,179,180' && chain.continuationLines === 3);
  check('sample: four chains of more than one continuation line',
    d.filter((e) => e.continuationLines >= 2).map((e) => e.line).join() === '177,463,468,472');

  // an independent count: D lines whose previous line does not end in X are the entries
  const physical = sampleText.split('\r\n').slice(0, 549);
  let starts = 0;
  let prevX = false;
  physical.forEach((l) => {
    if (l.charAt(5) === 'D') {
      if (!prevX) starts++;
      prevX = l.length >= 80 && l.charAt(79) === 'X';
    } else prevX = false;
  });
  check('sample: an independent count of D lines that start an entry agrees (496)', starts === 496);
  check('sample: accented and broken-bar characters are read as one column each',
    d.some((e) => e.constantText.indexOf('¦') >= 0) && d.some((e) => /[éà°]/.test(e.constantText)));
}

// ---- 2. every line once, and the source back ---------------------------------------------------------------------------
{
  const r = SfgrParser.parse(sampleText);
  const seen = new Array(550).fill(0);
  r.entries.forEach((e) => e.lines.forEach((n) => { seen[n]++; }));
  check('every line of the sample is in exactly one entry', seen.slice(1, 550).every((c) => c === 1) && seen[0] === 0);
  check('entries are in file order and do not overlap', r.entries.every((e, i) =>
    e.line === e.lines[0] && e.endLine === e.lines[e.lines.length - 1] &&
    (i === 0 || e.line === r.entries[i - 1].endLine + 1)));
  check('the sample comes back byte for byte', SfgrParser.toText(r) === sampleText);

  const lf = sampleText.replace(/\r\n/g, '\n');
  const rLf = SfgrParser.parse(lf);
  check('the same source with LF is read the same and comes back with LF', rLf.eol === '\n' &&
    SfgrParser.toText(rLf) === lf && rLf.entries.length === r.entries.length &&
    rLf.formats.map((f) => f.name).join() === r.formats.map((f) => f.name).join());

  const noFinal = sampleText.replace(/\r\n$/, '');
  const rNo = SfgrParser.parse(noFinal);
  check('no line end after the last line: same 549 lines, the last one has none, text comes back',
    rNo.lines.length === 549 && rNo.lines[548].eol === '' && SfgrParser.toText(rNo) === noFinal &&
    rNo.entries.length === r.entries.length);

  const cr = SfgrParser.parse('     SA\r     DF  1 1 1\r');
  check('a lone CR ends a line', cr.lines.length === 2 && cr.eol === '\r' && SfgrParser.toText(cr) === '     SA\r     DF  1 1 1\r');

  const mixedText = ['     SA', '     DF1', '     DF2'].join('\n').replace('\nDF1', '\r\nDF1') + '\n';
  const mixed = SfgrParser.parse('     SA\r\n     DF1\n     DF2\r\n');
  check('mixed line ends are reported as mixed and kept per line', mixed.eol === 'mixed' &&
    mixed.lines.map((l) => JSON.stringify(l.eol)).join() === '"\\r\\n","\\n","\\r\\n"' &&
    SfgrParser.toText(mixed) === '     SA\r\n     DF1\n     DF2\r\n' && mixedText.length > 0);

  const bom = SfgrParser.parse('﻿' + sampleText);
  check('a byte order mark is kept aside and put back; the first line is read as usual', bom.bom === true &&
    bom.formats[0].name === 'CHOIX1' && SfgrParser.toText(bom) === '﻿' + sampleText);
  check('no BOM, no eol: flags say so', SfgrParser.parse('     SA').bom === false && SfgrParser.parse('     SA').eol === '');
}

// ---- 3. continuation --------------------------------------------------------------------------------------------------
{
  // a constant of 30 characters: 23 on the first line (the last one is a blank, the file keeps it), the rest on the next
  const text = 'ABCDEFGHIJKLMNOPQRSTUV ';           // 23 characters, the last a blank
  const l1 = D('FLD1', [[15, '  30'], [19, ' 1'], [21, ' 2'], [56, 'C'], [57, text], [80, 'X']]);
  const l2 = mk('D', [[7, 'WXYZ']]);
  const r = parse([S('FMT1'), l1, l2, D('FLD2', [[15, '   3'], [19, ' 2'], [21, ' 2'], [56, 'C'], [57, 'END']])]);
  check('continuation: two lines are one D entry, the next D line is a new one', kinds(r) === 'S,D,D' &&
    r.entries[1].lines.join() === '2,3' && r.entries[2].line === 4);
  check('continuation: the blank at the end of the first piece is kept when the next piece is joined',
    r.entries[1].constantText === 'ABCDEFGHIJKLMNOPQRSTUV WXYZ');
  check('continuation: the continuation line is not read as columns (its text is not a length or a line)',
    r.problems.length === 0 && r.entries[1].numbers.length === 30 && r.entries[1].raw.length === 2 && r.entries[1].raw[1] === l2);

  // a continuation line starting with an asterisk or a digit is still text, not a comment
  const star = parse([S('F'), D('A', [[56, 'C'], [57, 'abc'], [80, 'X']]), mk('D', [[7, '* not a comment 12345']])]);
  check('continuation: text from column 7 that starts with * is text, not a comment line', kinds(star) === 'S,D' &&
    star.entries[1].constantText.slice(23) === '* not a comment 12345' && star.problems.length === 0);

  // X on the last line of the source, and X before a line that is not a D line
  const atEnd = parse([S('F'), D('A', [[56, 'C'], [57, 'abc'], [80, 'X']])]);
  check('continuation: X on the last line is reported, the entry stays one line', codes(atEnd) === 'unmatchedContinuation' &&
    atEnd.problems[0].line === 2 && atEnd.problems[0].severity === 'error' && atEnd.entries[1].continuationLines === 0);
  const notD = parse([S('F'), D('A', [[56, 'C'], [57, 'abc'], [80, 'X']]), D('B', [[56, 'C'], [57, 'xyz']]).replace('D', 'S')]);
  check('continuation: X before a line that is not a D line is reported and that line is read as itself',
    codes(notD) === 'unmatchedContinuation' && kinds(notD) === 'S,D,S' && notD.formats.length === 2);
  const comment = parse([S('F'), D('A', [[56, 'C'], [57, 'abc'], [80, 'X']]), mk('D', [[7, '* x']]), D('B', [[56, 'C']])]);
  check('continuation: a D line that follows X is the continuation, which is why a comment cannot follow it',
    kinds(comment) === 'S,D,D' && comment.entries[1].lines.join() === '2,3');
  const blankAfterX = parse([S('F'), D('A', [[56, 'C'], [57, 'abc'], [80, 'X']]), '', D('B', [[56, 'C']])]);
  check('continuation: a blank line after X is not a D line', codes(blankAfterX) === 'unmatchedContinuation' &&
    kinds(blankAfterX) === 'S,D,blank,D');

  // X on lines that are not constants of a D specification means nothing
  const sx = parse([S('F', [[80, 'X']]), D('A', [[15, '   1'], [19, ' 1'], [21, ' 2']])]);
  check('continuation: X in column 80 of an S line is kept as found and joins nothing', kinds(sx) === 'S,D' &&
    sx.problems.length === 0 && sx.formats[0].fields.length === 1);
  const cx = parse([S('F'), mk('D', [[7, '* a comment'], [80, 'X']]), D('A', [[15, '   1']])]);
  check('continuation: a comment line does not continue', kinds(cx) === 'S,comment,D' && cx.problems.length === 0);

  // a message constant
  const msg = parse([S('F'), D('M1', [[15, '  40'], [19, ' 5'], [21, ' 2'], [56, 'M'], [57, 'ABC1'], [61, 'U2']])]);
  check('constant type M: message id and member identifier are read', msg.entries[1].role === 'constant' &&
    msg.entries[1].message.id === 'ABC1' && msg.entries[1].message.member === 'U2');
}

// ---- 4. H specifications, comments, *DDS lines (not in the sample) -----------------------------------------------------
{
  const h = mk('H', [[7, 'HELP01'], [16, 'MYHLP'], [25, 'MYLIB'], [34, ' 5 3'], [39, '2078'], [44, '12'], [47, 'N'], [50, 'Y'], [53, 'N']]);
  const hOnline = mk('H', [[7, 'DOCLBL'], [16, 'MYDOC'], [25, 'MYFLD'], [34, '10A5'], [39, '24D2'], [53, 'Y']]);
  const hNull = mk('H', [[7, 'NULLHLP']]);
  const hComment = mk('H', [[7, '* a help comment']]);
  const r = parse([S('FMT1'), h, hOnline, hNull, hComment, D('FLD', [[15, '   2'], [19, ' 3'], [21, ' 4']])]);
  check('H: three H entries and a comment, in the format that owns them', kinds(r) === 'S,H,H,H,comment,D' &&
    r.formats[0].help.length === 3 && r.formats[0].fields.length === 1 && r.problems.length === 0);
  const hv = r.entries[1];
  check('H: columns', hv.values.name === 'HELP01' && hv.values.helpFile === 'MYHLP' && hv.values.helpLibrary === 'MYLIB' &&
    hv.values.suppressSelection === '12' && hv.values.restoreFormat === 'N' && hv.values.boundary === 'Y' &&
    hv.values.onlineDocument === 'N');
  check('H: corners rrcc, row right-justified', hv.upperLeft.row === 5 && hv.upperLeft.column === 3 &&
    hv.lowerRight.row === 20 && hv.lowerRight.column === 78);
  check('H: columns above 99 as A0 .. D2, and the online document flag', r.entries[2].upperLeft.row === 10 &&
    r.entries[2].upperLeft.column === 105 && r.entries[2].lowerRight.row === 24 && r.entries[2].lowerRight.column === 132 &&
    r.entries[2].values.onlineDocument === 'Y');
  check('H: both corners blank is a null help area, not a problem', r.entries[3].upperLeft === null &&
    r.entries[3].lowerRight === null && r.problems.length === 0);
  check('H: * in column 7 is a comment with its text', r.entries[4].kind === 'comment' && r.entries[4].text === ' a help comment' &&
    r.entries[4].specType === 'H');
  const badCorner = parse([S('F'), mk('H', [[7, 'HLP'], [34, 'xx05']])]);
  check('H: a corner that is not a number is reported (and read as null parts)', codes(badCorner) === 'notNumeric' &&
    badCorner.entries[1].upperLeft.row === null && badCorner.entries[1].upperLeft.column === 5);

  // comments of the three spec types, and a comment before the first S spec
  const c = parse([mk('S', [[7, '* a header comment']]), S('F'), mk('D', [[7, '*field comment']]), '     S* trailing', S('G')]);
  check('comments: * in column 7 of an S, D or H line, also before the first format', kinds(c) === 'comment,S,comment,comment,S' &&
    c.entries[0].format === -1 && c.entries[1].format === 0 && c.formats.length === 2 && c.problems.length === 0);
  check('comments: text is columns 8 - 80', c.entries[0].text === ' a header comment' && c.entries[2].text === 'field comment');
  check('comments: they belong to the format above them (up to the next S)', c.formats[0].entries.length === 2 &&
    c.formats[0].endLine === 4 && c.formats[1].startLine === 5);

  // *DDS lines
  const dds = [
    '*DDS A*    FRCDTA',          // col 1-4 *DDS, col 6 A, col 7 *
    '*DDS D*        R TEST'
  ];
  const sx = parse([S('FMT1'), mk('D', [[7, 'X']]).replace('DX', 'D '), dds[0], dds[1], D('FLD', [[15, '   2']])]);
  const ddsEntry = sx.entries.find((e) => e.kind === 'dds');
  check('*DDS: two adjacent lines are one block entry', ddsEntry && ddsEntry.lines.length === 2 && ddsEntry.raw[0] === dds[0] &&
    kinds(sx).split(',').filter((k) => k === 'dds').length === 1);
  check('*DDS: the generated DDS line has A in column 6 and a blank in column 7, the rest unchanged (*DDS stays)',
    ddsEntry.ddsLines[0] === '*DDS AA     FRCDTA'.slice(0, 5) + 'A ' + '    FRCDTA' && ddsEntry.ddsLines.length === 2 &&
    ddsEntry.ddsLines[0].charAt(5) === 'A' && ddsEntry.ddsLines[0].charAt(6) === ' ' && ddsEntry.ddsLines[0].slice(0, 4) === '*DDS');
  check('*DDS: it is not a problem and not a comment, and the format keeps it', sx.problems.length === 0 &&
    sx.formats[0].entries.indexOf(ddsEntry) >= 0);
  const notDds = parse([S('F'), '*DDS D FLD (no asterisk in column 7)']);
  check('*DDS: without * in column 7 the line is an ordinary line (here a D line)', kinds(notDds) === 'S,D');
  const seqOnly = parse([S('F'), '*DDS ', '00010', '     ']);
  check('a line with only a sequence number, or only blanks, is blank', kinds(seqOnly) === 'S,blank,blank,blank' &&
    seqOnly.problems.length === 0);
}

// ---- 5. lines that cannot be read --------------------------------------------------------------------------------------
{
  const ddsLine = '     A          R REC1';
  const r = parse([S('F'), ddsLine, D('X', [[15, '   1']])]);
  check('unreadable: DDS source (A in column 6) is reported and kept, the parse goes on',
    kinds(r) === 'S,unreadable,D' && codes(r) === 'unknownType' && r.problems[0].line === 2 && r.problems[0].column === 6 &&
    r.problems[0].severity === 'error' && r.entries[1].raw[0] === ddsLine && r.formats[0].fields.length === 1);
  check('unreadable: the message names column 6', /Column 6 is "A"/.test(r.problems[0].message));
  const lower = parse([S('F'), mk('d', [[7, 'FLD']])]);
  check('unreadable: lowercase d is not a specification type', codes(lower) === 'unknownType');
  const stray = parse(['     X text in column 7 and a blank type'.replace('X', ' ')]);
  check('unreadable: text with a blank column 6 is reported', kinds(stray) === 'unreadable' && codes(stray) === 'unknownType');

  const orphan = parse([D('A', [[15, '   1']]), mk('H', [[7, 'HLP']]), S('F')]);
  check('orphan: D and H before the first S are kept, reported and in no format', kinds(orphan) === 'D,H,S' &&
    codes(orphan) === 'orphanSpec,orphanSpec' && orphan.entries[0].format === -1 && orphan.formats.length === 1 &&
    orphan.formats[0].fields.length === 0 && orphan.formats[0].help.length === 0);

  const tab = parse([S('F'), D('A\tB', [[15, '   1']])]);
  check('tab: reported with its column, the line is still read by character position', codes(tab) === 'tab' &&
    tab.problems[0].column === 8 && tab.problems[0].severity === 'warning' && tab.entries[1].kind === 'D');
  const longLine = parse([S('F'), D('A', [[15, '   1'], [56, 'C'], [57, 'abc']]) + ' '.repeat(30) + 'tail text']);
  check('long line: text past column 80 is reported, kept in raw, and not read as columns', codes(longLine) === 'lineTooLong' &&
    longLine.problems[0].column === 81 && longLine.entries[1].raw[0].endsWith('tail text') &&
    longLine.entries[1].values.continuation === '' && longLine.entries[1].constantText === 'abc');
  const blankPast80 = parse([S('F'), mk('D', [[7, 'A']]) + ' '.repeat(90)]);
  check('long line: blanks past column 80 are harmless', blankPast80.problems.length === 0);

  const nums = parse([S('F', [[17, 'ab'], [19, ' x']]), D('A', [[15, '  1x'], [19, '1a'], [21, 'E1']])]);
  check('numbers: a column that is not a number is reported with its column and read as null', nums.problems.map((p) => p.code).join() ===
    'notNumeric,notNumeric,notNumeric,notNumeric,notNumeric' && nums.problems.map((p) => p.column).join() === '17,19,15,19,21' &&
    nums.entries[0].numbers.startLine === null && nums.entries[1].numbers.length === null &&
    nums.problems.every((p) => p.severity === 'warning'));
  check('numbers: nothing is range-checked (length 9999, column D3, line 99)', (() => {
    const q = parse([S('F'), D('A', [[15, '9999'], [19, '99'], [21, 'D3']])]);
    return q.problems.length === 0 && q.entries[1].numbers.length === 9999 && q.entries[1].numbers.line === 99 && q.entries[1].numbers.column === 133;
  })());
  const v = parse([S('F', [[17, ' V']])]);
  check('S: start line V is variable, not a number and not a problem', v.formats[0].s.startLineVariable === true &&
    v.formats[0].s.numbers.startLine === null && v.problems.length === 0);
  const km = parse([S('F', [[64, 'A1Z O9']])]);
  check('S: invalid key mask characters are listed (Z, an embedded blank, O - there is no O - and 9, no such function key)', km.formats[0].s.keyMask.invalid.join('|') === 'Z| |O|9');
}

// ---- 6. helpers and tables ---------------------------------------------------------------------------------------------
{
  check('columnText: 1-based inclusive range, padded with blanks past the end of a short line',
    SfgrParser.columnText('     SABC', 7, 9) === 'ABC' && SfgrParser.columnText('     SABC', 7, 12) === 'ABC   ' &&
    SfgrParser.columnText('', 1, 3) === '   ' && SfgrParser.columnText(null, 1, 2) === '  ');
  check('columnText: a character outside the BMP is one column', SfgrParser.columnText('ab\u{1F600}cd', 3, 4) === '\u{1F600}c' &&
    SfgrParser.columnText('ab\u{1F600}', 3, 5) === '\u{1F600}  ');
  check('decodeColumn: 1 - 99 as numbers, A0 .. D2 as 100 .. 132, anything else null', SfgrParser.decodeColumn(' 5') === 5 &&
    SfgrParser.decodeColumn('A0') === 100 && SfgrParser.decodeColumn('B5') === 115 && SfgrParser.decodeColumn('D2') === 132 &&
    SfgrParser.decodeColumn('E0') === null && SfgrParser.decodeColumn('A') === null && SfgrParser.decodeColumn('') === null &&
    SfgrParser.decodeColumn('9A') === null);
  const km = SfgrParser.decodeKeyMask('21CMNPY');
  check('decodeKeyMask: function keys by the manual\'s table (2 = Page Down, 3 = Page Up)',
    SfgrParser.decodeKeyMask('23').functionKeys.map((k) => k.name).join() === 'Page Down,Page Up' &&
    SfgrParser.decodeKeyMask('1456').functionKeys.map((k) => k.name).join() === 'Print,Clear,Help,Home');
  check('decodeKeyMask: command keys A..L = 1..12, M N = 13 14, P..Y = 15..24, in the order written',
    km.commandKeys.map((k) => k.char + k.number).join() === 'C3,M13,N14,P15,Y24' && km.functionKeys.map((k) => k.char).join('') === '21' &&
    km.invalid.length === 0 && SfgrParser.decodeKeyMask('  ').text === '' && SfgrParser.decodeKeyMask(null).commandKeys.length === 0);

  const allTables = [SfgrParser.S_COLUMNS, SfgrParser.H_COLUMNS, SfgrParser.D_COLUMNS];
  check('tables: each key once, columns in order, inside 7 - 80, no overlap', allTables.every((t) =>
    new Set(t.map((c) => c.key)).size === t.length && t.every((c, i) => c.from <= c.to && c.from >= 7 && c.to <= 80 &&
    (i === 0 || c.from > t[i - 1].to))));
  check('tables: D has the constant data at 57 - 79 (untrimmed) and the continuation at 80', (() => {
    const cd = SfgrParser.D_COLUMNS.find((c) => c.key === 'constantData');
    const co = SfgrParser.D_COLUMNS.find((c) => c.key === 'continuation');
    return cd.from === 57 && cd.to === 79 && cd.raw === true && co.from === 80 && co.to === 80;
  })());
  check('tables: S has the key mask at 64 - 79 and the name at 7 - 14', (() => {
    const km2 = SfgrParser.S_COLUMNS.find((c) => c.key === 'keyMask');
    const nm = SfgrParser.S_COLUMNS.find((c) => c.key === 'name');
    return km2.from === 64 && km2.to === 79 && nm.from === 7 && nm.to === 14;
  })());
  check('tables: they cannot be changed from outside', Object.isFrozen(SfgrParser.D_COLUMNS) && Object.isFrozen(SfgrParser.D_COLUMNS[0]));
  check('the module has no vscode and no other module to load', !/require\(\s*['"]vscode['"]\s*\)/.test(fs.readFileSync(path.join(__dirname, '..', 'sfgrParser.js'), 'utf8')) &&
    !/require\(/.test(fs.readFileSync(path.join(__dirname, '..', 'sfgrParser.js'), 'utf8')));
}

// ---- 7. never throws ---------------------------------------------------------------------------------------------------
{
  const bad = [null, undefined, '', 42, {}, [], '\n', '\r\n\r\n', 'x', '*DDS', '     ', '﻿', '﻿\n'];
  let threw = 0;
  bad.forEach((v) => { try { const r = SfgrParser.parse(v); if (SfgrParser.toText(r) !== (typeof v === 'string' ? v : (v == null ? '' : String(v)))) threw++; } catch (e) { threw++; } });
  check('input that is not a source (null, a number, an object, empty, only line ends) is read without throwing', threw === 0);
  check('empty text: no lines, no formats, no problems', (() => {
    const r = SfgrParser.parse('');
    return r.lines.length === 0 && r.entries.length === 0 && r.formats.length === 0 && r.problems.length === 0 && r.eol === '';
  })());

  // deterministic noise: random lines built from characters that matter to the reader
  let seed = 11;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const alphabet = ['S', 'D', 'H', '*', 'X', ' ', ' ', ' ', 'A', '1', '9', '\t', 'é', '\u{1F600}', 'D2', 'DDS', '\r', '\n', '\r\n'];
  let bad2 = 0;
  for (let n = 0; n < 300; n++) {
    let s = '';
    const len = rnd(400);
    for (let k = 0; k < len; k++) s += alphabet[rnd(alphabet.length)];
    try {
      const r = SfgrParser.parse(s);
      const covered = new Array(r.lines.length + 1).fill(0);
      r.entries.forEach((e) => e.lines.forEach((x) => { covered[x]++; }));
      const ok = SfgrParser.toText(r) === s && covered.slice(1).every((c) => c === 1) &&
        r.formats.every((f) => f.s.kind === 'S') && r.problems.every((p) => p.line >= 1 && p.line <= r.lines.length);
      if (!ok) bad2++;
    } catch (e) { bad2++; }
  }
  check('300 random sources: no throw, each line in one entry, the text comes back, problems point at real lines', bad2 === 0);
}

process.exit(failureCount() === 0 ? 0 : 1);

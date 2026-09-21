/**
 * i116Qdbrtvfd.test.js
 *
 * Task I-116 - the QDBRTVFD (FILD0200) receiver parser, src/qdbrtvfdParser.js.
 *
 * Golden data: docs/sda-reference/source/Block B.txt, a real capture of the
 * receiver for a 16-field physical file built from the DDS in
 * "iSDA IBMi functionality.sql" (the passing insert). The expectations below are
 * written by hand FROM THAT DDS (name, type, length, digits, decimals, buffer
 * position, and the validity keywords as the DDS spells them), never from the
 * parser's own output, so a parser that decodes the wrong bytes cannot agree
 * with them by accident.
 *
 * Also covers the failure paths: a receiver that is too small (bytes available
 * > returned), a corrupted entry, a validity code the parser has not seen, a COMP
 * operator that was never captured (must be left out, not guessed), and the
 * hex-row reader.
 *
 * What this does NOT cover (needs more real captures - see keywordFixes.md I-116):
 * the other COMP operators, the other CHECK codes, an explicit FLTPCN that
 * differs from the default, keyed files, other releases / CCSIDs.
 */
const fs = require('fs');
const path = require('path');
const P = require('../qdbrtvfdParser.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const capture = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'sda-reference', 'source', 'Block B.txt'), 'utf8');

// name, type, length (bytes), digits, decimals, buffer position, keywords "as the DDS spells them"
const EXPECTED = [
  ['FLDME',    'A', 10, 0, 0,  0, ['CHECK(ME)']],
  ['FLDRANGE', 'S',  5, 5, 0, 10, ['RANGE(1 99999)']],
  ['FLDVALS',  'A',  1, 0, 0, 15, ["VALUES('A' 'B' 'C')"]],
  ['FLDCOMP',  'P',  4, 7, 2, 16, ['COMP(GT 0)']],
  ['FLDCOMPC', 'A',  3, 0, 0, 20, ["COMP(EQ 'XYZ')"]],
  ['FLDNEG',   'S',  7, 7, 2, 23, ['RANGE(-5.5 100.25)']],
  ['FLDM10',   'S',  6, 6, 0, 30, ['CHECK(M10)']],
  ['FLDVN',    'A',  9, 0, 0, 36, ['CHECK(VN)']],
  ['FLDAB',    'A',  5, 0, 0, 45, ["VALUES('A' 'B')", 'CHECK(AB)']],
  ['FLDMSG',   'S',  5, 5, 0, 50, ['RANGE(10 20)', 'CHKMSGID(CPF9897 QSYS/QCPFMSG)']],
  ['FLDMSGD',  'S',  5, 5, 0, 55, ['VALUES(1 2 3)', 'CHKMSGID(CPF9897 QCPFMSG &FLDDTA)']],
  ['FLDDTA',   'A', 20, 0, 0, 60, []],
  ['FLDMULT',  'S',  5, 5, 0, 80, ['RANGE(1 99)', 'CHECK(ME)']],
  ['FLDSGL',   'F',  4, 7, 2, 85, []],
  ['FLDDBL',   'F',  8, 15, 2, 89, []],
  ['FLDNONE',  'A',  5, 0, 0, 97, []]
];
const kw = (f) => P.inheritableValidityKeywords(f).map((k) => k.name + '(' + k.parameters + ')');

console.log('Golden capture (Block B.txt)');
const bytes = P.bytesFromHexRows(capture);
check('the hex rows reassemble into 8192 bytes', !!bytes && bytes.length === 8192);
const res = P.parseFild0200(bytes);
check('parses ok with no error and no warnings', res.ok === true && !res.error && res.warnings.length === 0);
check('header: 6175 bytes returned = 6175 available, not truncated', res.bytesReturned === 6175 && res.bytesAvailable === 6175 && res.truncated === false);
check('header: record length 102 (the DDS lengths sum to 102)', res.recordLength === 102);
check('16 fields, in DDS order', res.fields.length === 16 && res.fields.map((f) => f.name).join() === EXPECTED.map((e) => e[0]).join());
EXPECTED.forEach((e, i) => {
  const f = res.fields[i] || {};
  check(e[0] + ': ' + e[1] + ' length ' + e[2] + ', digits ' + e[3] + ', decimals ' + e[4] + ', buffer position ' + e[5],
    f.type === e[1] && f.length === e[2] && f.digits === e[3] && f.decimals === e[4] && f.bufferPosition === e[5]);
  check('  ...keywords ' + (e[6].join(' ') || '(none)'), JSON.stringify(kw(f)) === JSON.stringify(e[6]));
  check('  ...fields with no checks carry no validity section', (e[6].length === 0) === (f.validity === null));
});
const parts = (f) => P.inheritableValidityKeywords(f);
check('keyword shape matches the DSPFFD path: {name, parameters} with bare parameters', parts(res.fields[1])[0].name === 'RANGE' && parts(res.fields[1])[0].parameters === '1 99999');
check('a negative numeric value is signed and scaled by the field decimals (-5.5, not -550)', parts(res.fields[5])[0].parameters === '-5.5 100.25');
check('CHKMSGID with no library keeps the message file bare; the data-field reference keeps its &', parts(res.fields[10])[1].parameters === 'CPF9897 QCPFMSG &FLDDTA');
check('nothing in the golden capture is undecoded', res.fields.every((f) => !f.validity || f.validity.undecoded === 0));
check('floating point: 7F -> *SINGLE (4 bytes), 15F -> *DOUBLE (8 bytes), non-F -> null',
  res.fields[13].floatPrecision === '*SINGLE' && res.fields[14].floatPrecision === '*DOUBLE' && res.fields[0].floatPrecision === null);

console.log('\nFailure paths');
function copy() { return Uint8Array.from(bytes); }
const put32 = (b, o, v) => { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };

let r = P.parseFild0200(bytes.slice(0, 100));
check('a receiver shorter than the header is refused', r.ok === false && /shorter/.test(r.error));
r = P.parseFild0200(null);
check('null is refused, not thrown on', r.ok === false);

let small = copy(); put32(small, 4, 40000);
r = P.parseFild0200(small);
check('bytes available > returned -> truncated, error says how much was needed', r.ok === false && r.truncated === true && /40000/.test(r.error));

let over = copy(); put32(over, 0, 9000); put32(over, 4, 9000);
r = P.parseFild0200(over);
check('bytes returned larger than the buffer we hold -> truncated', r.ok === false && r.truncated === true);

let noNames = copy(); noNames[256 + 34] = 0xc1;   // second name copy no longer matches the first
r = P.parseFild0200(noNames);
check('an entry whose two name copies disagree is refused (layout mismatch)', r.ok === false && /observed entry layout/.test(r.error));

let badLen = copy(); put32(badLen, 256, 100);
r = P.parseFild0200(badLen);
check('an entry length below the fixed part is refused', r.ok === false && /impossible entry length/.test(r.error));

let noFields = copy(); noFields[143] = 0; noFields[144] = 0;
r = P.parseFild0200(noFields);
check('a header with no fields is refused', r.ok === false && /no fields/.test(r.error));

// FLDME (entry at 256): change its CHECK code (section starts at 256+252, entry code at +16)
let unk = copy(); unk[256 + 252 + 16] = 0x99;
r = P.parseFild0200(unk);
check('an unknown validity code still parses, with a warning', r.ok === true && r.warnings.some((w) => /unknown validity entry code 0x99/.test(w)));
check('  ...and the unknown entry is left out of the keywords, and counted as undecoded', kw(r.fields[0]).length === 0 && r.fields[0].validity.undecoded === 1);

// FLDCOMP (entry at 1377): an operator code we have never captured must not be guessed
let comp = copy(); comp[1377 + 252 + 16] = 0x76;
r = P.parseFild0200(comp);
const compField = r.fields[3];
check('a COMP code that was never captured is left out (no guessed operator)', r.ok === true && kw(compField).length === 0 && compField.validity.undecoded === 1);
check('  ...but a COMP code that was captured still decodes', kw(res.fields[3])[0] === 'COMP(GT 0)' && kw(res.fields[4])[0] === "COMP(EQ 'XYZ')");

let badSec = copy(); badSec[256 + 231] = 0x21;   // section length says 33, but the entry length says 32
r = P.parseFild0200(badSec);
check('a validity-section length that disagrees with the entry length is refused', r.ok === false && /observed entry layout/.test(r.error));

let badEntry = copy(); put32(badEntry, 256 + 252 + 16 + 1, 0); badEntry[256 + 252 + 16 + 4] = 0x08;  // entry length 8 < its own 16-byte header
r = P.parseFild0200(badEntry);
check('a validity entry shorter than its own header is refused, not read past', r.ok === false && /validity-check section could not be read/.test(r.error));

r = P.parseFild0200(bytes, { decode: (b, s, e) => 'X'.repeat(e - s) });
check('options.decode replaces the built-in CCSID 037 decoding', r.ok === true && r.fields[0].name === 'XXXXXXXXXX');

console.log('\nHex-row reader');
check('non-contiguous rows are refused', P.bytesFromHexRows('RCV\t0\t00\nRCV\t64\t00\n') === null);
check('DIAG rows are ignored, RCV rows are data', P.bytesFromHexRows('DIAG\t0\tSQLCODE=0\nRCV\t0\t00ff\nRCV\t2\t10\n') instanceof Uint8Array);
check('CRLF line endings are fine', P.bytesFromHexRows('RCV\t0\t0102\r\nRCV\t2\t03\r\n').length === 3);
check('empty input -> null', P.bytesFromHexRows('') === null);
check('EBCDIC 037 spot checks: FLDME, digits, ampersand, asterisk', P.decodeEbcdic037(Uint8Array.from([0xc6, 0xd3, 0xc4, 0xd4, 0xc5]), 0, 5) === 'FLDME' && P.decodeEbcdic037(Uint8Array.from([0xf0, 0xf9, 0x50, 0x5c]), 0, 4) === '09&*');

if (failures === 0) {
  console.log('\nALL CHECKS PASSED');
} else {
  console.log('\n' + failures + ' CHECK(S) FAILED');
  process.exitCode = 1;
}

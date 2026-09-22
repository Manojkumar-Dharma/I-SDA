/**
 * qdbrtvfdParser.js
 *
 * Task I-116 - decodes the receiver variable of the IBM i "Retrieve Database
 * File Description" API (QDBRTVFD, format FILD0200) far enough to read a
 * referenced field's validity-checking keywords (CHECK / COMP / RANGE / VALUES
 * / CHKMSGID) and its floating-point precision. DSPFFD's OUTFILE carries none
 * of these (I-112: only a count, WHVCNE), which is why the REFFLD-inherited
 * panel had to say "not listed here".
 *
 * NOT built from IBM's published structure layout. It was worked out from three
 * real captures on IBM i 7.3, CCSID 37 (docs/sda-reference/source/Block B.txt,
 * "Block - TESTPF2.txt" and "Block - TESTPFK.txt": 46 fields total, FILD0200)
 * cross-checked against the DDS that produced them (docs/sda-reference/source/
 * "iSDA IBMi functionality.sql") and, for two of the findings below, against a
 * DSPFFD OUTFILE capture ("DSPFFD outfile.txt"). Every offset and code is
 * therefore "observed", not "documented"; the parser is defensive on purpose -
 * anything that does not line up returns ok:false with a reason (and a code it
 * does not know becomes an explicit "unknown" entry rather than a guess) so the
 * caller can fall back to the documented limit instead of showing something
 * wrong.
 *
 * Findings from the DSPFFD OUTFILE capture (answers two questions I-112 left
 * open): WHVCNE is the count of validity-check keyword ENTRIES on the field
 * (CHECK(AB) VALUES('A' 'B') is 2, not the 2 values inside VALUES) - it matches
 * field.validity.entries.length exactly for all 16 Block B fields. WHCSID is 37
 * (the job CCSID) for character fields and the sentinel 65535 ("no CCSID
 * applies") for every numeric field, not a real per-field CCSID.
 *
 * Finding from TESTPFK (Block B's 16 fields plus a K spec on FLDME): byte-for-
 * byte identical to Block B's own receiver, same header, same field entries.
 * FILD0200 does not surface key information at all; a keyed file needs a
 * different call (or a different format) if that is ever needed.
 *
 * Still open (see keywordFixes.md I-116): an explicit FLTPCN cannot be told
 * apart from the implicit default - FLDFLTIMPL (7F 2, no FLTPCN keyword) came
 * back byte-identical to Block B's FLDSGL (7F 2, explicit FLTPCN(*SINGLE));
 * other releases / CCSIDs are still unconfirmed.
 *
 * Layout as observed (offsets in bytes, big-endian):
 *   header       0..255   u32 bytes-returned @0, u32 bytes-available @4,
 *                         u16 field count @143, u16 record length @68.
 *   field entry  starts at 256, one after another, each prefixed by its own u32
 *                length. Fixed part = 312 bytes; entry length - 312 = the size
 *                of the validity-check section spliced in at +252:
 *     +4  name (10, EBCDIC)          +34 name again      +64 u16 type code
 *     +67 u32 buffer position (+71 repeats it)   +75 u16 length in bytes
 *     +77 u16 digits                 +79 u16 decimal positions
 *   (these attribute fields are byte-packed, so they are not aligned to their size)
 *     +228 u16 offset of the trailing name copy (= 252 + section length)
 *     +230 u16 validity section length (0 when the field has no checks)
 *     +252 validity section (below); the trailing name copy follows it
 *   section      u16 entry count @0, then entries from +16. Every entry starts
 *                with a 16-byte header: u8 code, u16 item count, u16 entry
 *                length (header included), 11 reserved bytes. RANGE / VALUES /
 *                COMP / CHKMSGID entries then carry items: u16 length, 14
 *                reserved bytes, that many value bytes. CHECK entries have no
 *                items (length 16).
 *   value bytes  character values as EBCDIC text; numeric values as zoned
 *                digits with no decimal point (the field's own decimal positions
 *                place it) and a D zone on the last byte for a negative value.
 *
 * Dependency-free and UMD-wrapped like mnuCmdEngine.js, so the same code runs in
 * the extension host, in tests and (if ever needed) in the webview.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QdbrtvfdParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HEADER_LENGTH = 256;
  var FIELD_COUNT_OFFSET = 143;
  var FIXED_ENTRY_LENGTH = 312;
  var VCHK_SECTION_OFFSET = 252;
  var ENTRY_HEADER_LENGTH = 16;
  var ITEM_HEADER_LENGTH = 16;

  // Observed type codes only (1-4); anything else stays typeCode with type null.
  var TYPE_LETTERS = { 1: 'F', 2: 'S', 3: 'P', 4: 'A' };

  // Validity entry codes seen in the capture.
  var CODE_CHKMSGID = 0x63;
  var CODE_RANGE = 0x71;
  var CODE_VALUES = 0x72;
  var CHECK_CODES = { 0x64: 'ME', 0xa0: 'M10', 0xa1: 'M11', 0xa2: 'VN', 0xa3: 'AB', 0xa5: 'VNE', 0xa6: 'M10F', 0xa7: 'M11F' };
  // All 8 comparison operators, captured both numeric and character (character used
  // the same codes as numeric - confirmed with GT and NE). ER/FE/LC/RB/RZ/RL/RLTB (the
  // DDS Reference's keyboard/cursor-control CHECK codes, equivalent to AUTO/LOWER/
  // CHGINPDFT/WRDWRAP/roll keywords) were not captured: those are workstation
  // behaviours with no meaning on a physical file's own field, so REFFLD has nothing
  // to inherit there and they are left undecoded (defense in depth) rather than guessed.
  var COMP_OPERATOR_CODES = { 0x73: 'GT', 0x74: 'GE', 0x75: 'EQ', 0x76: 'NE', 0x77: 'LE', 0x78: 'LT', 0x79: 'NL', 0x7a: 'NG' };

  // CCSID 037 -> UTF-16 code units. The job / column CCSID on a real system can
  // differ; callers can pass options.decode instead.
  var EBCDIC_037 =
    '\u0000\u0001\u0002\u0003\u009c\u0009\u0086\u007f\u0097\u008d\u008e\u000b\u000c\u000d\u000e\u000f' +
    '\u0010\u0011\u0012\u0013\u009d\u0085\u0008\u0087\u0018\u0019\u0092\u008f\u001c\u001d\u001e\u001f' +
    '\u0080\u0081\u0082\u0083\u0084\u000a\u0017\u001b\u0088\u0089\u008a\u008b\u008c\u0005\u0006\u0007' +
    '\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009a\u009b\u0014\u0015\u009e\u001a' +
    '\u0020\u00a0\u00e2\u00e4\u00e0\u00e1\u00e3\u00e5\u00e7\u00f1\u00a2\u002e\u003c\u0028\u002b\u007c' +
    '\u0026\u00e9\u00ea\u00eb\u00e8\u00ed\u00ee\u00ef\u00ec\u00df\u0021\u0024\u002a\u0029\u003b\u00ac' +
    '\u002d\u002f\u00c2\u00c4\u00c0\u00c1\u00c3\u00c5\u00c7\u00d1\u00a6\u002c\u0025\u005f\u003e\u003f' +
    '\u00f8\u00c9\u00ca\u00cb\u00c8\u00cd\u00ce\u00cf\u00cc\u0060\u003a\u0023\u0040\u0027\u003d\u0022' +
    '\u00d8\u0061\u0062\u0063\u0064\u0065\u0066\u0067\u0068\u0069\u00ab\u00bb\u00f0\u00fd\u00fe\u00b1' +
    '\u00b0\u006a\u006b\u006c\u006d\u006e\u006f\u0070\u0071\u0072\u00aa\u00ba\u00e6\u00b8\u00c6\u00a4' +
    '\u00b5\u007e\u0073\u0074\u0075\u0076\u0077\u0078\u0079\u007a\u00a1\u00bf\u00d0\u00dd\u00de\u00ae' +
    '\u005e\u00a3\u00a5\u00b7\u00a9\u00a7\u00b6\u00bc\u00bd\u00be\u005b\u005d\u00af\u00a8\u00b4\u00d7' +
    '\u007b\u0041\u0042\u0043\u0044\u0045\u0046\u0047\u0048\u0049\u00ad\u00f4\u00f6\u00f2\u00f3\u00f5' +
    '\u007d\u004a\u004b\u004c\u004d\u004e\u004f\u0050\u0051\u0052\u00b9\u00fb\u00fc\u00f9\u00fa\u00ff' +
    '\u005c\u00f7\u0053\u0054\u0055\u0056\u0057\u0058\u0059\u005a\u00b2\u00d4\u00d6\u00d2\u00d3\u00d5' +
    '\u0030\u0031\u0032\u0033\u0034\u0035\u0036\u0037\u0038\u0039\u00b3\u00db\u00dc\u00d9\u00da\u009f';

  function decodeEbcdic037(bytes, start, end) {
    var s = '';
    for (var i = start; i < end; i++) s += EBCDIC_037.charAt(bytes[i]);
    return s;
  }

  function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function u32(b, o) { return ((b[o] * 16777216) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])); }

  /**
   * The bytes of a QDBRTVFD receiver dumped as rows of "K<TAB>OFFSET<TAB>HEX"
   * (the shape RTVFD_DIAG2 in the SQL capture returns; only "RCV" rows are
   * data, "DIAG" rows are ignored). Returns a Uint8Array, or null if the rows
   * are not contiguous from offset 0.
   */
  function bytesFromHexRows(text) {
    var rows = {};
    String(text).split(/\r?\n/).forEach(function (line) {
      var p = line.split('\t');
      if (p[0] === 'RCV' && p.length >= 3) rows[parseInt(p[1], 10)] = p[2].replace(/\s+/g, '');
    });
    var offsets = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    var hex = '';
    for (var i = 0; i < offsets.length; i++) {
      if (offsets[i] * 2 !== hex.length) return null;
      hex += rows[offsets[i]];
    }
    if (!hex.length || hex.length % 2) return null;
    var out = new Uint8Array(hex.length / 2);
    for (var j = 0; j < out.length; j++) out[j] = parseInt(hex.substr(j * 2, 2), 16);
    return out;
  }

  // Zoned digits with no decimal point -> a minimal decimal string ("-5.5", "100.25", "0").
  function decodeNumeric(bytes, start, end, decimals) {
    var digits = '';
    var negative = false;
    for (var i = start; i < end; i++) {
      digits += String(bytes[i] & 0x0f);
      if (i === end - 1 && (bytes[i] >> 4) === 0x0d) negative = true;
    }
    if (decimals > 0) {
      while (digits.length <= decimals) digits = '0' + digits;
      digits = digits.slice(0, digits.length - decimals) + '.' + digits.slice(digits.length - decimals);
    }
    digits = digits.replace(/^0+(?=\d)/, '');
    if (digits.indexOf('.') >= 0) digits = digits.replace(/0+$/, '').replace(/\.$/, '');
    if (digits === '0') negative = false;
    return (negative ? '-' : '') + digits;
  }

  function quote(text) { return "'" + text.replace(/'/g, "''") + "'"; }

  function readItems(bytes, from, entryEnd, count, decode) {
    var items = [];
    var o = from;
    for (var i = 0; i < count; i++) {
      if (o + ITEM_HEADER_LENGTH > entryEnd) return null;
      var len = u16(bytes, o);
      var vStart = o + ITEM_HEADER_LENGTH;
      if (vStart + len > entryEnd) return null;
      items.push({ start: vStart, end: vStart + len });
      o = vStart + len;
    }
    return items;
  }

  function parseValidityEntries(bytes, secStart, secLength, field, decode, warnings) {
    var out = { entries: [], msgId: null };
    var declared = u16(bytes, secStart);
    var o = secStart + ENTRY_HEADER_LENGTH;
    var end = secStart + secLength;
    var numeric = field.type === 'S' || field.type === 'P';
    for (var n = 0; n < declared; n++) {
      if (o + ENTRY_HEADER_LENGTH > end) { warnings.push(field.name + ': validity entry ' + n + ' runs past its section'); return null; }
      var code = bytes[o];
      var count = u16(bytes, o + 1);
      var len = u16(bytes, o + 3);
      if (len < ENTRY_HEADER_LENGTH || o + len > end) { warnings.push(field.name + ': validity entry ' + n + ' has a bad length (' + len + ')'); return null; }
      var entryEnd = o + len;
      var entry = { code: code };
      if (CHECK_CODES[code] !== undefined) {
        entry.kind = 'CHECK';
        entry.check = CHECK_CODES[code];
      } else if (code === CODE_RANGE || code === CODE_VALUES || COMP_OPERATOR_CODES[code] !== undefined) {
        var items = readItems(bytes, o + ENTRY_HEADER_LENGTH, entryEnd, count, decode);
        if (!items) { warnings.push(field.name + ': validity entry ' + n + ' items do not fit'); return null; }
        entry.kind = code === CODE_RANGE ? 'RANGE' : code === CODE_VALUES ? 'VALUES' : 'COMP';
        if (entry.kind === 'COMP') entry.operator = COMP_OPERATOR_CODES[code];
        entry.values = items.map(function (it) {
          return numeric ? decodeNumeric(bytes, it.start, it.end, field.decimals) : decode(bytes, it.start, it.end).replace(/\s+$/, '');
        });
        entry.numeric = numeric;
      } else if (code === CODE_CHKMSGID) {
        var m = readItems(bytes, o + ENTRY_HEADER_LENGTH, entryEnd, count, decode);
        if (!m || m.length < 3) { warnings.push(field.name + ': CHKMSGID entry is not msgid / file / library [/ &field]'); return null; }
        var t = m.map(function (it) { return decode(bytes, it.start, it.end).replace(/\s+$/, ''); });
        entry.kind = 'CHKMSGID';
        entry.messageId = t[0];
        entry.messageFile = t[1];
        entry.library = t[2];
        entry.dataField = t.length > 3 ? t[3] : null;
        out.msgId = entry;
      } else {
        // A code we have never seen: keep it visibly unknown instead of guessing what it means.
        entry.kind = 'UNKNOWN';
        warnings.push(field.name + ': unknown validity entry code 0x' + code.toString(16));
      }
      out.entries.push(entry);
      o = entryEnd;
    }
    return out;
  }

  function entryToKeyword(e) {
    if (e.kind === 'CHECK') return { name: 'CHECK', parameters: e.check };
    if (e.kind === 'RANGE') return { name: 'RANGE', parameters: e.values.map(function (v, i) { return e.numeric ? v : quote(v); }).join(' ') };
    if (e.kind === 'VALUES') return { name: 'VALUES', parameters: e.values.map(function (v) { return e.numeric ? v : quote(v); }).join(' ') };
    if (e.kind === 'COMP' && e.operator) return { name: 'COMP', parameters: e.operator + ' ' + (e.numeric ? e.values[0] : quote(e.values[0])) };
    if (e.kind === 'CHKMSGID') {
      var file = (e.library && e.library !== '*LIBL') ? e.library + '/' + e.messageFile : e.messageFile;
      return { name: 'CHKMSGID', parameters: e.messageId + ' ' + file + (e.dataField ? ' ' + e.dataField : '') };
    }
    return null;
  }

  /**
   * [{name, parameters}] for the validity keywords one parsed field carries, in
   * the same shape dspfEngine.inheritableKeywordsFromDspffdRow returns (bare
   * parameter text, no parentheses). Entries the parser could not decode (an
   * unknown code, a COMP operator that has not been captured yet) are left out
   * rather than shown wrongly; see field.validity.undecoded for how many.
   */
  function inheritableValidityKeywords(field) {
    var out = [];
    if (!field || !field.validity) return out;
    field.validity.entries.forEach(function (e) {
      var k = entryToKeyword(e);
      if (k) out.push(k);
    });
    return out;
  }

  /**
   * Parse a FILD0200 receiver for the FIRST record format. Returns
   * { ok, error?, bytesReturned, bytesAvailable, truncated, recordLength, fields, warnings }.
   * fields[i] = { name, typeCode, type, length, digits, decimals, bufferPosition,
   *   validity: { entries, undecoded } | null }.
   * options.decode(bytes, start, end) -> string overrides the built-in CCSID 037 decoding.
   */
  function parseFild0200(bytes, options) {
    var decode = (options && options.decode) || decodeEbcdic037;
    var warnings = [];
    var res = { ok: false, fields: [], warnings: warnings, bytesReturned: 0, bytesAvailable: 0, truncated: false, recordLength: 0 };
    if (!bytes || bytes.length < HEADER_LENGTH) { res.error = 'receiver is shorter than the ' + HEADER_LENGTH + '-byte header'; return res; }
    res.bytesReturned = u32(bytes, 0);
    res.bytesAvailable = u32(bytes, 4);
    res.recordLength = u16(bytes, 68);
    // Not enough room: the caller should call again with a receiver of bytesAvailable bytes.
    res.truncated = res.bytesReturned < res.bytesAvailable || res.bytesReturned > bytes.length;
    if (res.truncated) { res.error = 'receiver too small: ' + res.bytesAvailable + ' bytes available, ' + Math.min(res.bytesReturned, bytes.length) + ' returned'; return res; }
    var count = u16(bytes, FIELD_COUNT_OFFSET);
    if (count === 0) { res.error = 'header reports no fields'; return res; }

    var o = HEADER_LENGTH;
    for (var i = 0; i < count; i++) {
      if (o + FIXED_ENTRY_LENGTH > res.bytesReturned) { res.error = 'field ' + (i + 1) + ' of ' + count + ' runs past the returned data'; return res; }
      var len = u32(bytes, o);
      if (len < FIXED_ENTRY_LENGTH || o + len > res.bytesReturned) { res.error = 'field ' + (i + 1) + ' has an impossible entry length (' + len + ')'; return res; }
      var name = decode(bytes, o + 4, o + 14).replace(/\s+$/, '');
      var name2 = decode(bytes, o + 34, o + 44).replace(/\s+$/, '');
      var sectionLength = u16(bytes, o + 230);
      if (!name || name !== name2 || len !== FIXED_ENTRY_LENGTH + sectionLength || u16(bytes, o + 228) !== VCHK_SECTION_OFFSET + sectionLength) {
        res.error = 'field ' + (i + 1) + ' does not match the observed entry layout';
        return res;
      }
      var typeCode = u16(bytes, o + 64);
      var field = {
        name: name,
        typeCode: typeCode,
        type: TYPE_LETTERS[typeCode] || null,
        length: u16(bytes, o + 75),
        digits: u16(bytes, o + 77),
        decimals: u16(bytes, o + 79),
        bufferPosition: u32(bytes, o + 67),
        validity: null
      };
      // FLTPCN is not stored as a flag anywhere in the entry: the only trace is the storage length
      // (4 = single, 8 = double in the capture, where FLTPCN always matched the default for the
      // digits), so an explicit FLTPCN that differs from the default cannot be told apart yet.
      field.floatPrecision = typeCode === 1 ? (field.length === 4 ? '*SINGLE' : field.length === 8 ? '*DOUBLE' : null) : null;
      if (!field.type) warnings.push(name + ': unknown data type code ' + typeCode);
      if (sectionLength > 0) {
        var v = parseValidityEntries(bytes, o + VCHK_SECTION_OFFSET, sectionLength, field, decode, warnings);
        if (!v) { res.error = name + ': validity-check section could not be read'; return res; }
        v.undecoded = v.entries.filter(function (e) { return entryToKeyword(e) === null; }).length;
        field.validity = v;
      }
      res.fields.push(field);
      o += len;
    }
    res.ok = true;
    return res;
  }

  return {
    parseFild0200: parseFild0200,
    inheritableValidityKeywords: inheritableValidityKeywords,
    bytesFromHexRows: bytesFromHexRows,
    decodeEbcdic037: decodeEbcdic037,
    HEADER_LENGTH: HEADER_LENGTH,
    FIXED_ENTRY_LENGTH: FIXED_ENTRY_LENGTH
  };
});

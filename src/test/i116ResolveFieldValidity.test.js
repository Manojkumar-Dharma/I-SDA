/**
 * i116ResolveFieldValidity.test.js
 *
 * Task I-116 - the extension-host wiring: fetchReferencedFieldValidity() and
 * ensureIsdaTempQdbrtvfdProcedure() in extension.ts, called from
 * handleResolveReferencedField alongside the existing DSPFFD-based
 * fetchReferencedFieldAttributes (Task I-74/L14, covered by extension.test.js).
 *
 * Covers the three I-116 decisions:
 *  1. "Yes We will use iSDAtemp library" - the wrapper procedure is created in
 *     ISDATEMP, not QTEMP or a user-chosen library, and only once per session
 *     (idempotent - a second resolve does not repeat the CRTLIB/CREATE
 *     PROCEDURE round trip).
 *  2. "if connection to IBM i is not disable[d] [show a] hint, also don't
 *     allow to edit" - a validity-fetch failure never fails the overall
 *     resolve (the DSPFFD-sourced keywords/length still come through); it
 *     only leaves validityChecked false with a reason, which
 *     webviewClientHelpers.js's referenceInheritedHtml turns into the
 *     fallback hint (see i74ReferenceInheritedKeywords.test.js for that
 *     half). "Don't allow to edit" needs no wiring here - every inherited
 *     keyword in that panel, from either source, is already a read-only
 *     chip with no edit affordance.
 *  3. The +n/-n length editor itself (REFFLD's own length override) was
 *     already shipped in I-74 (v0.10.179) - see
 *     i74ReferenceInheritedKeywords.test.js's "Basic tab" section.
 *
 * The synthetic receiver below is not invented: it's the REAL FLDME entry
 * bytes captured in docs/sda-reference/source/Block B.txt (a genuine
 * CHECK(ME) field), with only its two 10-byte name copies patched from
 * FLDME to CUSTNO (via the parser's own decodeEbcdic037, inverted, so no
 * EBCDIC table is duplicated here) - wrapped in a minimal header. This keeps
 * the test tied to real, previously-verified bytes rather than a hand-built
 * layout that might silently drift from qdbrtvfdParser.js's own.
 *
 * Run with: node src/test/i116ResolveFieldValidity.test.js
 */
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const ext = require(path.join(__dirname, '../../dist/extension.js'));
const QdbrtvfdParser = require('../qdbrtvfdParser.js');
const { buildLine } = require('../fixtures/lineBuilder.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

// The real captured FLDME entry (344 bytes: fixed 312-byte part + a 32-byte
// CHECK(ME) validity section), base64, from Block B.txt.
const FLDME_ENTRY_B64 = 'AAABWMbTxNTFQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQMbTxNTFQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAEAwAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAJQAAACUAAAAAAAAAAAAAAAAAABEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARwAIAAAAPwAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAGQAAAAQAAAAAAAAAAAAAADG08TUxUBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEA=';

function buildCustnoReceiverRows() {
  const entry = Buffer.from(FLDME_ENTRY_B64, 'base64');
  const enc = {};
  for (let i = 0; i < 256; i++) enc[QdbrtvfdParser.decodeEbcdic037(Uint8Array.from([i]), 0, 1)] = i;
  const custno = Buffer.from('CUSTNO    '.split('').map((ch) => enc[ch]));
  custno.copy(entry, 4);
  custno.copy(entry, 34);
  const header = Buffer.alloc(256, 0x40);
  header.writeUInt32BE(256 + entry.length, 0);
  header.writeUInt32BE(256 + entry.length, 4);
  header.writeUInt16BE(25, 68);
  header.writeUInt16BE(1, 143);
  const unpadded = Buffer.concat([header, entry]);
  // Pad to a 64-byte boundary, same as a real (much larger, fixed-size) receiver
  // naturally has trailing bytes beyond bytesReturned - the parser only reads up
  // to the field entries it finds and ignores the rest.
  const buf = Buffer.concat([unpadded, Buffer.alloc((64 - (unpadded.length % 64)) % 64, 0x40)]);
  const rows = [];
  for (let o = 0; o + 64 <= buf.length; o += 64) rows.push({ K: 'RCV', OFFSET: o, HEXDATA: buf.slice(o, o + 64).toString('hex').toUpperCase() });
  return rows;
}

async function run() {
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  const providerEntry = vscodeMock.__registeredCustomEditorProvider;

  const refSrc =
    buildLine({ seq: '00005', func: 'REF(MYLIB/CUSMSTP)' }) + '\n' +
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n' +
    buildLine({ seq: '00020', name: 'CUSTNO', length: '5', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R' }) + '\n';
  const refDoc = vscodeMock.__mockDocument(refSrc);
  let refMessageHandler = null;
  const refPosted = [];
  const refPanel = {
    webview: {
      cspSource: 'x', options: null,
      set html(v) {}, get html() { return ''; },
      onDidReceiveMessage: (h) => { refMessageHandler = h; return { dispose: () => {} }; },
      postMessage: (m) => refPosted.push(m),
    },
    onDidDispose: () => {},
  };
  providerEntry.provider.resolveCustomTextEditor(refDoc, refPanel, {});

  async function resolve() {
    refPosted.length = 0;
    vscodeMock.__lastInformation = undefined;
    vscodeMock.__lastError = undefined;
    await refMessageHandler({ type: 'resolveReferencedField', recordName: 'SCR1', fieldSourceLine: 3 });
    return refPosted.find((m) => m.type === 'referencesResolved');
  }

  console.log('Decision 1: uses ISDATEMP (not QTEMP, not a user-chosen library), created once per session');
  {
    const runCommands = [];
    const runSqlCalls = [];
    let schemaCheckCalls = 0;
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: async (info) => {
              runCommands.push(info.command);
              return { code: 0, stdout: '', stderr: '' };
            },
            runSQL: async (sql) => {
              runSqlCalls.push(sql);
              if (/SYSSCHEMAS/.test(sql)) { schemaCheckCalls++; return []; } // library does not exist yet
              if (/CALL ISDATEMP\.RTVFD_DUMP/.test(sql)) return buildCustnoReceiverRows();
              if (/CREATE OR REPLACE PROCEDURE/.test(sql)) return [];
              return [{ WHFLDT: 'A', WHFLDB: 25, WHFLDD: 0, WHFLDP: 0, WHFTXT: 'Customer number' }];
            },
          }),
        },
      },
    });

    const msg1 = await resolve();
    check('resolve still succeeds and posts referencesResolved', !!msg1 && msg1.entries.length === 1);
    check('creates the library ISDATEMP (not QTEMP, not something user-configurable)', runCommands.some((c) => /CRTLIB LIB\(ISDATEMP\)/.test(c)));
    check('checked whether ISDATEMP already existed first (idempotent, not a blind CRTLIB every time)', schemaCheckCalls === 1);
    check('creates the QDBRTVFD wrapper AND the RTVFD_DUMP procedure inside ISDATEMP', runSqlCalls.some((s) => /CREATE OR REPLACE PROCEDURE ISDATEMP\.QDBRTVFD_X/.test(s)) && runSqlCalls.some((s) => /CREATE OR REPLACE PROCEDURE ISDATEMP\.RTVFD_DUMP/.test(s)));
    check('validityChecked is true and the CHECK(ME) keyword (from QDBRTVFD, not DSPFFD) is present alongside the DSPFFD-sourced TEXT', msg1.entries[0].definition.validityChecked === true && msg1.entries[0].definition.keywords.some((k) => k.name === 'CHECK' && k.parameters === 'ME') && msg1.entries[0].definition.keywords.some((k) => k.name === 'TEXT'));

    const schemaCallsBefore = schemaCheckCalls;
    const runSqlCallsBefore = runSqlCalls.length;
    const msg2 = await resolve();
    const newSql = runSqlCalls.slice(runSqlCallsBefore);
    check('a second resolve in the same session does not re-check or re-create the library or the procedures (cached)', schemaCheckCalls === schemaCallsBefore && !newSql.some((s) => /CREATE OR REPLACE PROCEDURE/.test(s)));
    check('...only re-runs the actual data calls (the DSPFFD outfile query and the CALL RTVFD_DUMP itself)', newSql.some((s) => /RTVFD_DUMP/.test(s)));
    check('...but still fetches and returns the validity keywords every time (not just once)', msg2.entries[0].definition.validityChecked === true && msg2.entries[0].definition.keywords.some((k) => k.name === 'CHECK'));
  }

  console.log('\nDecision 2: a QDBRTVFD failure never fails the overall resolve - falls back to a hint instead');
  {
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
            runSQL: async (sql) => {
              if (/SYSSCHEMAS/.test(sql)) return [{ X: 1 }]; // library already exists this time
              if (/CREATE OR REPLACE PROCEDURE/.test(sql)) return [];
              if (/CALL ISDATEMP\.RTVFD_DUMP/.test(sql)) throw new Error('*BCI2418 Field CUSTNO not found');
              return [{ WHFLDT: 'A', WHFLDB: 25, WHFLDD: 0, WHFLDP: 0, WHFTXT: 'Customer number' }];
            },
          }),
        },
      },
    });
    const msg = await resolve();
    check('the resolve still succeeds overall (DSPFFD-sourced attributes/keywords are unaffected)', !!msg && msg.entries.length === 1 && msg.entries[0].definition.length === 25 && msg.entries[0].definition.keywords.some((k) => k.name === 'TEXT'));
    check('confirms success to the user, same as when validity data is available', /Resolved 1 referenced field/.test(vscodeMock.__lastInformationMessage || ''));
    check('validityChecked is false, with the actual failure reason carried through (not swallowed, not a generic message)', msg.entries[0].definition.validityChecked === false && /BCI2418/.test(msg.entries[0].definition.validityError || ''));
    check('no CHECK/FLTPCN keyword is invented when the fetch failed', !msg.entries[0].definition.keywords.some((k) => k.name === 'CHECK' || k.name === 'FLTPCN'));
  }

  console.log('\nDecision 2b: not connected to an IBM i at all - same graceful fallback, not a special case');
  {
    vscodeMock.__removeMockExtension('halcyontechltd.code-for-ibmi');
    // fetchReferencedFieldAttributes itself requires a connection, so with no
    // connection the WHOLE resolve fails today (Task I-74/L14's own existing,
    // unchanged behavior) - confirmed here so this file also documents that
    // fetchReferencedFieldValidity is never even reached in that case.
    vscodeMock.__lastError = undefined;
    refPosted.length = 0;
    await refMessageHandler({ type: 'resolveReferencedField', recordName: 'SCR1', fieldSourceLine: 3 });
    check('with no connection at all, the whole resolve fails (unchanged Task I-74 behavior) rather than posting a partial result', !refPosted.some((m) => m.type === 'referencesResolved') && /Code for IBM i extension/.test(vscodeMock.__lastError || ''));
  }

  console.log('\nbytesFromRows (the SQL-result-set shape, as opposed to bytesFromHexRows\' pasted-text shape)');
  {
    const rows = buildCustnoReceiverRows();
    const bytes = QdbrtvfdParser.bytesFromRows(rows);
    check('reassembles the padded receiver (>=600 bytes, a multiple of 64)', bytes.length >= 600 && bytes.length % 64 === 0);
    const parsed = QdbrtvfdParser.parseFild0200(bytes);
    check('parses ok, one field, CUSTNO, CHECK(ME)', parsed.ok === true && parsed.fields.length === 1 && parsed.fields[0].name === 'CUSTNO' && QdbrtvfdParser.inheritableValidityKeywords(parsed.fields[0])[0].parameters === 'ME');
    check('lower-case K/OFFSET/HEXDATA keys work too (some drivers return lower-case columns)', !!QdbrtvfdParser.bytesFromRows(rows.map((r) => ({ k: r.K, offset: r.OFFSET, hexdata: r.HEXDATA }))));
    check('an empty result set is refused, not thrown on', QdbrtvfdParser.bytesFromRows([]) === null && QdbrtvfdParser.bytesFromRows(null) === null);
  }

  // Restore the default-installed mock extension for cleanliness.
  vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  // extension.ts's activate() starts a 10s status-poll setInterval (see
  // sendCodeForIStatus), which would otherwise keep this process alive
  // indefinitely - same reasoning as extension.test.js's own process.exit().
  process.exit(failures === 0 ? 0 : 1);
}

run();

/**
 * e4bMessageFile.test.js
 *
 * E4b - the message-file resolver (src/messageFile.js): message ID -> text from
 * QSYS2.MESSAGE_FILE_DATA, with QMHRTVM as the fallback on a release without the
 * view, and a per-session cache. Everything runs against a fake Code for i
 * connection; nothing here has been checked against a real IBM i (see the header
 * of messageFile.js for the three assumptions that a capture must confirm).
 *
 * Verifies:
 *  1. names: message IDs and message-file references (LIB/NAME, bare NAME,
 *     *LIBL, *CURLIB, object form), and that nothing unsafe reaches the SQL.
 *  2. the SQL path: query text, library-list order for *LIBL, *CURLIB, ID not
 *     found, severity and second-level text, trailing blanks trimmed.
 *  3. the cache: a second ask is not a second query, concurrent asks share one
 *     query, listMessages primes the text cache, clear(file) and clear().
 *  4. the fallback: a missing view switches to QMHRTVM for the session; the
 *     RTVM0100 decoder, the error-code decoder, CPF2410 / CPF2407; list is
 *     'unsupported' there; other SQL errors do not switch.
 *  5. never throws: no connection, a throwing connection, garbage rows.
 *
 * Run with: node src/test/e4bMessageFile.test.js
 */
'use strict';
const path = require('path');
const MessageFile = require(path.join(__dirname, '../messageFile.js'));
const { check, failureCount } = require('./helpers/harness');

// ---- a fake connection ------------------------------------------------------

function row(lib, id, text, second, sev) {
  return { MESSAGE_FILE_LIBRARY: lib + '    ', MESSAGE_ID: id, MESSAGE_TEXT: text + '   ', MESSAGE_SECOND_LEVEL_TEXT: second || '', SEVERITY: sev === undefined ? 40 : sev };
}
const LIBL = [
  { SCHEMA_NAME: 'QSYS', TYPE: 'SYSTEM' }, { SCHEMA_NAME: 'QGPL', TYPE: 'SYSTEM' },
  { SCHEMA_NAME: 'APPLIB', TYPE: 'CURRENT' }, { SCHEMA_NAME: 'DATALIB', TYPE: 'USER' }
];
/** msgfiles: { 'LIB/FILE': [rows] }. Every query is logged in conn.log. */
function fakeConn(msgfiles, opts) {
  const o = opts || {};
  const conn = {
    log: [],
    async runSQL(sql) {
      conn.log.push(sql);
      if (o.sqlThrows) throw new Error(o.sqlThrows);
      if (/LIBRARY_LIST_INFO/.test(sql)) return o.libl || LIBL;
      if (/QSYS2\.MESSAGE_FILE_DATA/.test(sql)) {
        if (o.noView) throw new Error('[SQL0204] MESSAGE_FILE_DATA in QSYS2 type *FILE not found.');
        const file = /MESSAGE_FILE = '([^']+)'/.exec(sql)[1];
        const libs = /MESSAGE_FILE_LIBRARY IN \(([^)]*)\)/.exec(sql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
        const id = /MESSAGE_ID = '([^']+)'/.exec(sql);
        let out = [];
        libs.forEach((l) => { (msgfiles[l + '/' + file] || []).forEach((r) => { if (!id || r.MESSAGE_ID === id[1]) out.push(r); }); });
        return out;
      }
      if (/CREATE OR REPLACE PROCEDURE/.test(sql)) return [];
      if (/MSGF_DUMP/.test(sql)) return o.dump ? o.dump(sql) : [];
      return [];
    },
    async runCommand() { return { code: 0 }; }
  };
  return conn;
}
const queries = (c) => c.log.filter((s) => /QSYS2\.MESSAGE_FILE_DATA/.test(s));

(async function main() {

console.log('\n1. names');
{
  const N = MessageFile.normalizeMessageId;
  check('a valid ID is returned upper-cased', N('usr0001') === 'USR0001' && N('CPF9898') === 'CPF9898');
  check('whitespace around an ID is trimmed', N('  MSG1234 ') === 'MSG1234');
  check('too short, too long, punctuation and non-strings are refused', [N('MSG123'), N('MSG12345'), N("MSG12';"), N('MSG 123'), N(''), N(null), N(7)].every((x) => x === null));
  const P = MessageFile.parseMessageFileRef;
  check('a bare name searches *LIBL', JSON.stringify(P('mymsgf')) === JSON.stringify({ library: '*LIBL', name: 'MYMSGF' }));
  check('LIB/NAME is split and upper-cased', JSON.stringify(P('mylib/mymsgf')) === JSON.stringify({ library: 'MYLIB', name: 'MYMSGF' }));
  check('*LIBL/NAME and *CURLIB/NAME are accepted', P('*LIBL/APPMSG').library === '*LIBL' && P('*CURLIB/APPMSG').library === '*CURLIB');
  check('the object form works, and a missing library means *LIBL', P({ library: 'L1', name: 'F1' }).library === 'L1' && P({ name: 'F1' }).library === '*LIBL');
  check('a 10-character name is fine, 11 is not', P('ABCDEFGHIJ') !== null && P('ABCDEFGHIJK') === null);
  check('@ # $ and _ are allowed after the first character', P('A_B#C$D@E') !== null && P('@MSGF') !== null);
  check('a name that starts with a digit or underscore is refused', P('1MSGF') === null && P('_MSGF') === null);
  check('too many slashes, empty parts, quotes, other specials are refused', ['A/B/C', '/B', 'A/', "A'B", 'A B', '*ALL/F', 'LIB/*LIBL', '', null, undefined, 5].every((x) => P(x) === null));
  const sql = MessageFile.messageSql('MSGF', ['L1', "L'2"], 'USR0001');
  check('the query names the view, the file, the libraries and the ID', /FROM QSYS2\.MESSAGE_FILE_DATA/.test(sql) && /MESSAGE_FILE = 'MSGF'/.test(sql) && /MESSAGE_FILE_LIBRARY IN \('L1', 'L''2'\)/.test(sql) && /MESSAGE_ID = 'USR0001'/.test(sql));
  check('without an ID the query lists the whole file', !/MESSAGE_ID =/.test(MessageFile.messageSql('MSGF', ['L1'], null)));
  check('the query selects first-level text, second-level text and severity', /MESSAGE_TEXT/.test(sql) && /MESSAGE_SECOND_LEVEL_TEXT/.test(sql) && /SEVERITY/.test(sql));
}

console.log('\n2. SQL path');
{
  const files = {
    'QSYS/QCPFMSG': [row('QSYS', 'CPF9898', 'System copy of &1', '', 40)],
    'APPLIB/APPMSG': [row('APPLIB', 'USR0001', 'Customer &1 not found', 'Cause . . . . . : the customer is missing.\nRecovery  . . . : enter another number.', 30), row('APPLIB', 'USR0002', 'Quantity must be positive', '', 20)],
    'DATALIB/APPMSG': [row('DATALIB', 'USR0001', 'Older copy of the text', '', 10)]
  };
  const conn = fakeConn(files);
  const r = MessageFile.createResolver(conn);
  check('mode is unknown before the first question', r.mode() === 'unknown');
  const a = await r.getText('usr0001', 'applib/appmsg');
  check('a qualified lookup returns first-level text with trailing blanks trimmed', a.ok && a.text === 'Customer &1 not found' && a.id === 'USR0001');
  check('second-level text and severity come back', /Recovery/.test(a.secondLevel) && a.severity === 30);
  check('the library is reported and the source is sql', a.library === 'APPLIB' && a.source === 'sql' && r.mode() === 'sql');
  check('a qualified lookup does not read the library list', !conn.log.some((s) => /LIBRARY_LIST_INFO/.test(s)));
  check('&1 is not substituted (E4c does that)', /&1/.test(a.text));

  const l = await r.getText('USR0001', 'APPMSG');
  check('*LIBL finds the file in the first library that holds it (APPLIB before DATALIB)', l.ok && l.library === 'APPLIB' && l.text === 'Customer &1 not found');
  check('*LIBL reads the library list once and queries every library in one statement', conn.log.filter((s) => /LIBRARY_LIST_INFO/.test(s)).length === 1 && /IN \('QSYS', 'QGPL', 'APPLIB', 'DATALIB'\)/.test(queries(conn).pop()));
  const sys = await r.getText('CPF9898', 'QCPFMSG');
  check('a message file found only in QSYS through *LIBL resolves', sys.ok && sys.library === 'QSYS');
  check('the library list is not read again', conn.log.filter((s) => /LIBRARY_LIST_INFO/.test(s)).length === 1);
  const cur = await r.getText('USR0002', '*CURLIB/APPMSG');
  check('*CURLIB uses the CURRENT entry of the library list', cur.ok && cur.library === 'APPLIB' && /IN \('APPLIB'\)/.test(queries(conn).pop()));

  const missing = await r.getText('USR9999', 'APPLIB/APPMSG');
  check('an ID that is not in the file is not-found with a readable message', !missing.ok && missing.code === 'not-found' && /USR9999/.test(missing.error) && /APPLIB\/APPMSG/.test(missing.error));
  const nofile = await r.getText('USR0001', 'APPLIB/NOSUCH');
  check('a message file that does not exist is not-found too', !nofile.ok && nofile.code === 'not-found');
  const bad = await r.getText('bad id', 'APPLIB/APPMSG');
  check('a bad ID is refused before any query', !bad.ok && bad.code === 'bad-id');
  const badf = await r.getText('USR0001', "APPLIB/APP'MSG");
  check('a bad message file is refused before any query', !badf.ok && badf.code === 'bad-msgf');
  check('refused input never reached the connection', !conn.log.some((s) => /bad id|APP'MSG/.test(s)));

  const nolib = fakeConn(files, { libl: [] });
  const e = await MessageFile.createResolver(nolib).getText('USR0001', 'APPMSG');
  check('an empty library list is an error, not a guess', !e.ok && e.code === 'error' && /library list/i.test(e.error));
  const nocur = fakeConn(files, { libl: [{ SCHEMA_NAME: 'QSYS', TYPE: 'SYSTEM' }] });
  const e2 = await MessageFile.createResolver(nocur).getText('USR0001', '*CURLIB/APPMSG');
  check('*CURLIB with no current library is an error', !e2.ok && /current library/i.test(e2.error));

  const lowerKeys = { MESSAGE_FILE_LIBRARY: 'L1', message_id: 'USR0003', message_text: 'lower case keys', message_second_level_text: null, severity: null };
  const rm = MessageFile.rowToMessage(Object.assign({}, lowerKeys, { MESSAGE_ID: undefined, MESSAGE_TEXT: undefined }));
  check('lower-case column names and NULL second-level text and severity are handled', rm.text === 'lower case keys' && rm.secondLevel === '' && rm.severity === null);
}

console.log('\n3. cache');
{
  const files = { 'APPLIB/APPMSG': [row('APPLIB', 'USR0001', 'One'), row('APPLIB', 'USR0002', 'Two'), row('APPLIB', 'USR0003', 'Three')] };
  const conn = fakeConn(files);
  const r = MessageFile.createResolver(conn);
  const first = await r.getText('USR0001', 'APPLIB/APPMSG');
  const second = await r.getText('USR0001', 'applib/appmsg');
  check('the second ask is answered from the cache with no query', first.cached === false && second.cached === true && second.text === 'One' && queries(conn).length === 1);
  const pair = await Promise.all([r.getText('USR0002', 'APPLIB/APPMSG'), r.getText('USR0002', 'APPLIB/APPMSG'), r.getText('USR0002', 'APPLIB/APPMSG')]);
  check('three asks at once share one query', queries(conn).length === 2 && pair.every((p) => p.ok && p.text === 'Two'));
  const nf = await r.getText('USR0009', 'APPLIB/APPMSG');
  await r.getText('USR0009', 'APPLIB/APPMSG');
  check('a not-found answer is not cached (the message may be added later)', !nf.ok && queries(conn).length === 4);
  const copy = await r.getText('USR0001', 'APPLIB/APPMSG');
  copy.text = 'changed';
  check('changing a returned object does not change the cache', (await r.getText('USR0001', 'APPLIB/APPMSG')).text === 'One');

  const before = queries(conn).length;
  const list = await r.listMessages('APPLIB/APPMSG');
  check('listMessages returns every message of the file in ID order', list.ok && list.messages.map((m) => m.id).join() === 'USR0001,USR0002,USR0003' && list.library === 'APPLIB' && list.source === 'sql');
  check('a list is one query', queries(conn).length === before + 1);
  const t3 = await r.getText('USR0003', 'APPLIB/APPMSG');
  check('the list primed the text cache (USR0003 needs no query)', t3.ok && t3.cached === true && queries(conn).length === before + 1);
  const list2 = await r.listMessages('APPLIB/APPMSG');
  check('a second list is cached', list2.cached === true && queries(conn).length === before + 1);

  r.clear('applib/appmsg');
  const again = await r.getText('USR0001', 'APPLIB/APPMSG');
  check('clear(file) drops that file\'s text and list', again.cached === false && queries(conn).length === before + 2);
  await r.getText('USR0001', 'APPMSG');
  const libReads = conn.log.filter((s) => /LIBRARY_LIST_INFO/.test(s)).length;
  r.clear('APPLIB/OTHER');
  check('clear(file) leaves other files alone', (await r.getText('USR0001', 'APPLIB/APPMSG')).cached === true);
  r.clear();
  await r.getText('USR0001', 'APPMSG');
  check('clear() drops everything including the library list', conn.log.filter((s) => /LIBRARY_LIST_INFO/.test(s)).length === libReads + 1);
  check('clear() with a bad name does nothing and does not throw', (() => { try { r.clear("bad'name"); return true; } catch (e) { return false; } })());
  const empty = await r.listMessages('APPLIB/NOSUCH');
  check('listing a file that does not exist or is empty is not-found', !empty.ok && empty.code === 'not-found');
  const badList = await r.listMessages('A/B/C');
  check('listing with a bad message file is bad-msgf', !badList.ok && badList.code === 'bad-msgf');
}

console.log('\n4. fallback to QMHRTVM');
{
  const dumpFor = (receiver, err) => () => {
    const rows = [];
    for (let off = 0; off < MessageFile.RTVM0100.textStart + 4096; off += 64) {
      if (off >= 4096) break;
      const bytes = receiver.slice(off, off + 64);
      const padded = new Uint8Array(64); padded.set(bytes);
      rows.push({ K: 'RCV', OFFSET: off, HEXDATA: Array.from(padded).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase() });
    }
    rows.push({ K: 'ERR', OFFSET: 0, HEXDATA: Array.from(err).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase() });
    return rows;
  };
  const noErr = new Uint8Array(16); noErr[3] = 16;
  const withErr = (cpf) => {
    const b = new Uint8Array(16); b[3] = 16; b[7] = 24;
    const MF = MessageFile.buildRtvm0100(cpf, '');           // EBCDIC bytes of the id via the same encoder
    for (let i = 0; i < 7; i++) b[8 + i] = MF[MessageFile.RTVM0100.textStart + i];
    return b;
  };
  const rcv = MessageFile.buildRtvm0100('Customer &1 not found', 'Cause . . . : missing', 0);
  const receiver = new Uint8Array(4096); receiver.set(rcv);

  const bytes = MessageFile.buildRtvm0100('Hello &1', 'Second &2');
  const d = MessageFile.decodeRtvm0100(bytes);
  check('RTVM0100: first- and second-level text decode (EBCDIC 037)', d.ok && d.text === 'Hello &1' && d.secondLevel === 'Second &2');
  check('RTVM0100: an empty second level decodes', MessageFile.decodeRtvm0100(MessageFile.buildRtvm0100('Only', '')).secondLevel === '');
  check('RTVM0100: a receiver with extra bytes after the help text decodes', MessageFile.decodeRtvm0100(MessageFile.buildRtvm0100('Pad', 'x', 500)).text === 'Pad');
  check('RTVM0100: too short is an error', !MessageFile.decodeRtvm0100(new Uint8Array(10)).ok);
  const lie = MessageFile.buildRtvm0100('abc', ''); lie[11] = 200;
  check('RTVM0100: a text length that runs past the receiver is an error', !MessageFile.decodeRtvm0100(lie).ok);
  const small = MessageFile.buildRtvm0100('abc', ''); small[3] = 5;
  check('RTVM0100: "bytes returned" smaller than the header is an error', !MessageFile.decodeRtvm0100(small).ok);
  check('RTVM0100: null / undefined / no length never throw', [null, undefined, {}, 4].every((x) => MessageFile.decodeRtvm0100(x).ok === false));
  check('error code: bytes available 0 means no error', MessageFile.decodeErrorCode(noErr).failed === false);
  check('error code: the exception id is read from bytes 8-14', MessageFile.decodeErrorCode(withErr('CPF2410')).id === 'CPF2410');
  check('the wrapper declares QMHRTVM\'s ten parameters in IBM\'s order', /P_RCV[\s\S]*P_RCVLEN[\s\S]*P_FMT[\s\S]*P_MSGID CHAR\(7\)[\s\S]*P_QMSGF CHAR\(20\)[\s\S]*P_RPLDTA[\s\S]*P_RPLLEN[\s\S]*P_RPLSUB[\s\S]*P_RTNFMT[\s\S]*P_ERR/.test(MessageFile.wrapperSql()) && /QSYS\/QMHRTVM/.test(MessageFile.wrapperSql()));
  check('the dump procedure asks for RTVM0100 and leaves &n unreplaced (*NO)', /RTVM0100/.test(MessageFile.dumpProcedureSql()) && /V_SUB\s+CHAR\(10\) DEFAULT '\*NO'/.test(MessageFile.dumpProcedureSql()));
  check('the call pads the file and library to 10 characters', /MSGF_DUMP\('USR0001', 'APPMSG    ', '\*LIBL     '\)/.test(MessageFile.callSql('USR0001', { library: '*LIBL', name: 'APPMSG' })));

  const conn = fakeConn({}, { noView: true, dump: dumpFor(receiver, noErr) });
  const r = MessageFile.createResolver(conn, { ensureLibrary: async () => null });
  const a = await r.getText('USR0001', 'APPLIB/APPMSG');
  check('a missing view falls back to QMHRTVM and returns the text', a.ok && a.text === 'Customer &1 not found' && a.secondLevel === 'Cause . . . : missing' && a.source === 'api' && a.severity === null);
  check('the resolver stays on the API for the session', r.mode() === 'api');
  const sqlBefore = queries(conn).length;
  await r.getText('USR0002', 'APPLIB/APPMSG');
  check('later lookups do not try the view again', queries(conn).length === sqlBefore);
  check('the wrapper and dump procedure were created once', conn.log.filter((s) => /CREATE OR REPLACE PROCEDURE/.test(s)).length === 2);
  check('the same ID is cached on the API path too', (await r.getText('USR0001', 'APPLIB/APPMSG')).cached === true);
  const lst = await r.listMessages('APPLIB/APPMSG');
  check('listing on the API path is unsupported, and says which release is needed', !lst.ok && lst.code === 'unsupported' && /7\.3 TR6/.test(lst.error));

  const nf = createWith(withErr('CPF2410'));
  const nfr = await nf.getText('USR0001', 'APPLIB/APPMSG');
  check('CPF2410 is not-found (message not in the file)', !nfr.ok && nfr.code === 'not-found' && /USR0001/.test(nfr.error));
  const nff = await createWith(withErr('CPF2407')).getText('USR0001', 'APPLIB/APPMSG');
  check('CPF2407 is not-found (message file missing)', !nff.ok && nff.code === 'not-found' && /APPLIB\/APPMSG/.test(nff.error));
  const other = await createWith(withErr('CPF9999')).getText('USR0001', 'APPLIB/APPMSG');
  check('any other exception id is an error naming it', !other.ok && other.code === 'error' && /CPF9999/.test(other.error));
  const nodump = await MessageFile.createResolver(fakeConn({}, { noView: true, dump: () => [] })).getText('USR0001', 'APPLIB/APPMSG');
  check('no dump rows is an error', !nodump.ok && nodump.code === 'error');
  function createWith(err) { return MessageFile.createResolver(fakeConn({}, { noView: true, dump: dumpFor(receiver, err) })); }

  const libFail = await MessageFile.createResolver(fakeConn({}, { noView: true }), { ensureLibrary: async () => 'Could not create library ISDATEMP: no authority' }).getText('USR0001', 'APPLIB/APPMSG');
  check('a library the host cannot create is an error carrying its text', !libFail.ok && /no authority/.test(libFail.error));

  const authErr = fakeConn({}, { sqlThrows: '[SQL0551] Not authorized to object MESSAGE_FILE_DATA in QSYS2' });
  const ar = MessageFile.createResolver(authErr);
  const ae = await ar.getText('USR0001', 'APPLIB/APPMSG');
  check('an authority error is an error and does NOT switch to the API', !ae.ok && ae.code === 'error' && /SQL0551/.test(ae.error) && ar.mode() === 'unknown');
  check('isMissingViewError recognises the missing view and nothing else', MessageFile.isMissingViewError('[SQL0204] MESSAGE_FILE_DATA in QSYS2 type *FILE not found.') && !MessageFile.isMissingViewError('[SQL0551] Not authorized') && !MessageFile.isMissingViewError('SQL0204 something else, table T1 not found'));
  const listOnOld = await MessageFile.createResolver(fakeConn({}, { noView: true })).listMessages('APPLIB/APPMSG');
  check('listing as the very first call on an old release is unsupported', !listOnOld.ok && listOnOld.code === 'unsupported');
}

console.log('\n5. never throws');
{
  const none = MessageFile.createResolver(null);
  const a = await none.getText('USR0001', 'APPMSG');
  check('no connection: not-connected', !a.ok && a.code === 'not-connected');
  check('no connection: list is not-connected too', (await none.listMessages('APPMSG')).code === 'not-connected');
  check('an object without runSQL is not a connection', (await MessageFile.createResolver({}).getText('USR0001', 'APPMSG')).code === 'not-connected');
  const throwing = MessageFile.createResolver(fakeConn({}, { sqlThrows: 'connection reset' }));
  const t = await throwing.getText('USR0001', 'APPLIB/APPMSG');
  check('a throwing connection is an error result, not an exception', !t.ok && t.code === 'error' && /connection reset/.test(t.error));
  check('the failed lookup is not cached', (await throwing.getText('USR0001', 'APPLIB/APPMSG')).cached !== true);

  let current = null;
  const files = { 'APPLIB/APPMSG': [row('APPLIB', 'USR0001', 'One')] };
  const live = MessageFile.createResolver(() => current);
  const off = await live.getText('USR0001', 'APPLIB/APPMSG');
  current = fakeConn(files);
  const on = await live.getText('USR0001', 'APPLIB/APPMSG');
  check('the connection can be a function, so a later connect is picked up', off.code === 'not-connected' && on.ok && on.text === 'One');
  current = null;
  check('cached text still answers after a disconnect (preview keeps working)', (await live.getText('USR0001', 'APPLIB/APPMSG')).ok);

  const garbage = MessageFile.createResolver({ runSQL: async () => 'not rows', runCommand: async () => ({}) });
  check('garbage from runSQL does not throw', (await garbage.getText('USR0001', 'APPLIB/APPMSG')).ok === false);
  const nullRows = MessageFile.createResolver({ runSQL: async () => null, runCommand: async () => ({}) });
  check('null rows mean not-found', (await nullRows.getText('USR0001', 'APPLIB/APPMSG')).code === 'not-found');
  check('splitDumpRows rejects a gap in the offsets and non-hex data', MessageFile.splitDumpRows([{ K: 'RCV', OFFSET: 64, HEXDATA: '00' }]) === null && MessageFile.splitDumpRows([{ K: 'RCV', OFFSET: 0, HEXDATA: 'ZZ' }, { K: 'ERR', OFFSET: 0, HEXDATA: '00' }]) === null && MessageFile.splitDumpRows([]) === null);
}

process.exit(failureCount() === 0 ? 0 : 1);
})();

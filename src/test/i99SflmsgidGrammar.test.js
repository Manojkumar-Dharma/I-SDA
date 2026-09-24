/**
 * i99SflmsgidGrammar.test.js
 *
 * Task I-99 - the SFLMSGID panel used to read and write the wrong grammar.
 * IBM's format is
 *     SFLMSGID(msgid [library-name/]msg-file [response-indicator] [&msg-data])
 * but parseSflMsgIdParams/formatSflMsgIdParams treated the third
 * space-separated token as the library (`MSGID MSGF QGPL`), which is a
 * response indicator's position. So a library typed into the panel produced
 * invalid DDS, and a hand-written `SFLMSGID(USR1234 QGPL/USRMSGS 30 &FLD)`
 * was read as file `QGPL/USRMSGS` + library `30`, and changing the message
 * id in the panel silently dropped `&FLD`. ERRMSGID's own parser
 * (getErrorMessageInstances) already had it right.
 *
 * A. the pure functions in dspfWriter.js
 * B. the real generated webview in jsdom (SFLCTL tab -> Subfile Messages)
 *
 * Run with: node src/test/i99SflmsgidGrammar.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ===========================================================================
// A. Pure functions
// ===========================================================================
console.log('\nA1. parseSflMsgIdParams reads IBM\'s grammar');
{
  const parse = DspfWriter.parseSflMsgIdParams;
  check(
    'the exact case from the finding: USR1234 QGPL/USRMSGS 30 &FLD',
    same(parse('USR1234 QGPL/USRMSGS 30 &FLD'), { msgId: 'USR1234', msgFile: 'USRMSGS', library: 'QGPL', responseIndicator: '30', msgDataField: '&FLD' })
  );
  check('message id + plain file', same(parse('USR1234 USRMSGS'), { msgId: 'USR1234', msgFile: 'USRMSGS', library: '', responseIndicator: '', msgDataField: '' }));
  check('response indicator only', parse('U1 MF 05').responseIndicator === '05' && parse('U1 MF 05').msgDataField === '' && parse('U1 MF 05').library === '');
  check('&msg-data only', parse('U1 MF &FLD').msgDataField === '&FLD' && parse('U1 MF &FLD').responseIndicator === '');
  check('library-qualified file, nothing else', parse('U1 LIB/MF').library === 'LIB' && parse('U1 LIB/MF').msgFile === 'MF');
  check('extra whitespace is tolerated', same(parse('  U1   LIB/MF   30   &FLD  '), parse('U1 LIB/MF 30 &FLD')));
  check('blank / undefined parameters give all-blank fields', same(parse(''), { msgId: '', msgFile: '', library: '', responseIndicator: '', msgDataField: '' }) && parse(undefined).msgId === '');
  check('a numeric third token is NEVER read as a library (the old bug)', parse('U1 QGPL/MF 30').library === 'QGPL' && parse('U1 MF 30').library === '');
}

console.log('\nA2. Files written by earlier versions (bare third token = library) are repaired, not lost');
{
  const parse = DspfWriter.parseSflMsgIdParams;
  const format = DspfWriter.formatSflMsgIdParams;
  const old = parse('MSGID MSGF QGPL');
  check('a bare non-numeric third token still shows up in the library box', old.library === 'QGPL' && old.msgFile === 'MSGF' && old.responseIndicator === '');
  check('writing it back gives valid DDS: MSGID QGPL/MSGF', format(old) === 'MSGID QGPL/MSGF');
  check('the message file\'s own qualifier wins over a stray bare token', parse('U1 REAL/MF STRAY').library === 'REAL');
  check('but it does not swallow a response indicator or &msg-data', parse('U1 MF QGPL 30 &FLD').responseIndicator === '30' && parse('U1 MF QGPL 30 &FLD').msgDataField === '&FLD');
}

console.log('\nA3. formatSflMsgIdParams writes IBM\'s grammar');
{
  const f = DspfWriter.formatSflMsgIdParams;
  check('all five parts', f({ msgId: 'NEW0001', msgFile: 'USRMSGS', library: 'QGPL', responseIndicator: '30', msgDataField: '&FLD' }) === 'NEW0001 QGPL/USRMSGS 30 &FLD');
  check('the library is the file\'s slash-qualifier, never a third token', f({ msgId: 'A', msgFile: 'F', library: 'L' }) === 'A L/F');
  check('no library: plain file', f({ msgId: 'A', msgFile: 'F' }) === 'A F');
  check('an & is added to a msg-data field typed without one', f({ msgId: 'A', msgFile: 'F', msgDataField: 'FLD' }) === 'A F &FLD');
  check('an existing & is not doubled', f({ msgId: 'A', msgFile: 'F', msgDataField: '&FLD' }) === 'A F &FLD');
  check('response indicator without msg-data', f({ msgId: 'A', msgFile: 'F', responseIndicator: '07' }) === 'A F 07');
  check('a file already typed LIB/FILE with no separate library is written as typed', f({ msgId: 'A', msgFile: 'L/F' }) === 'A L/F');
  check('a separate library replaces the file\'s own qualifier (they never stack)', f({ msgId: 'A', msgFile: 'OLD/F', library: 'NEW' }) === 'A NEW/F');
  check('a blank message id gives an empty payload', f({ msgId: '', msgFile: 'F' }) === '');
  check('a blank message file gives an empty payload', f({ msgId: 'A', msgFile: '   ', library: 'L', responseIndicator: '30' }) === '');
  check('null state gives an empty payload', f(null) === '' && f(undefined) === '');
}

console.log('\nA4. round trip: format(parse(x)) === x for every valid shape, and no part is dropped');
{
  ['U1 F', 'U1 L/F', 'U1 F 30', 'U1 L/F 30', 'U1 F &D', 'U1 L/F &D', 'U1 F 30 &D', 'USR1234 QGPL/USRMSGS 30 &FLD'].forEach((x) => {
    check(x, DspfWriter.formatSflMsgIdParams(DspfWriter.parseSflMsgIdParams(x)) === x);
  });
  // The reported data loss: changing only the message id must keep the rest.
  const p = DspfWriter.parseSflMsgIdParams('USR1234 QGPL/USRMSGS 30 &FLD');
  p.msgId = 'NEW0001';
  check('changing only the message id keeps the library, the indicator and &FLD', DspfWriter.formatSflMsgIdParams(p) === 'NEW0001 QGPL/USRMSGS 30 &FLD');
}

console.log('\nA5. sflMsgIdResponseIndicatorProblem');
{
  const prob = DspfWriter.sflMsgIdResponseIndicatorProblem;
  check('blank is fine', prob('') === null && prob('   ') === null && prob(undefined) === null && prob(null) === null);
  check('01 and 99 (the ends of the range) and 30 are fine', prob('01') === null && prob('99') === null && prob('30') === null);
  check('00 is refused', /01 to 99/.test(prob('00') || ''));
  check('a single digit is refused (an indicator is two digits)', /01 to 99/.test(prob('7') || ''));
  check('three digits are refused', prob('100') !== null);
  check('letters and an &-name are refused (they would be read back as a library / msg-data)', prob('AB') !== null && prob('&FLD') !== null && prob('QGPL') !== null);
  check('the message names what was typed', /ABC/.test(prob('ABC') || ''));
}

console.log('\nA6. I-97\'s &msg-data reader agrees with what the writer produces');
{
  const written = DspfWriter.formatSflMsgIdParams({ msgId: 'U1', msgFile: 'F', library: 'L', responseIndicator: '30', msgDataField: 'CMSGFLD' });
  check('messageIdMsgDataNames finds the name in a keyword this panel wrote', same(DspfWriter.messageIdMsgDataNames([{ name: 'SFLMSGID', parameters: written }], 'SFLMSGID'), ['CMSGFLD']));
}

// ===========================================================================
// B. Real generated webview
// ===========================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function source(ctlKeywords) {
  const lines = [
    buildLine({ seq: '00050', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
    buildLine({ seq: '00051', name: 'SF1', length: '5', dataType: 'A', usage: 'O', line: '8', col: '2' }),
    buildLine({ seq: '00060', nameType: 'R', name: 'CTLREC', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00061', func: 'SFLSIZ(10)' }),
    buildLine({ seq: '00062', func: 'SFLPAG(5)' }),
  ];
  ctlKeywords.forEach((t, i) => lines.push(buildLine({ seq: String(63 + i).padStart(5, '0'), func: t })));
  lines.push(buildLine({ seq: '00070', name: 'CMSGFLD', length: '12', dataType: 'A', usage: 'P' }));
  lines.push(buildLine({ seq: '00071', name: 'COUTFLD', length: '8', dataType: 'A', usage: 'O', line: '3', col: '2' }));
  return lines.join('\n') + '\n';
}
async function scenario(ctlKeywords, fn) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce99', source(ctlKeywords), 'SM99.DSPF');
  const posted = [], alerts = [], errors = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} });
    },
  });
  await sleep(450);
  const doc = dom.window.document;
  const Ev = dom.window.Event;
  const P = 'sflctl-CTLREC-sflmsgid-rep-inst0';
  const c = {
    doc, posted, alerts,
    click: (el) => el.dispatchEvent(new Ev('click', { bubbles: true })),
    fire: (el) => el.dispatchEvent(new Ev('change', { bubbles: true })),
    reset: () => { posted.length = 0; alerts.length = 0; },
    lastEdit: () => posted.filter((m) => m.type === 'applyEdit').pop() || null,
    sflmsgid: () => {
      const e = c.lastEdit();
      const rec = e ? DspfParser.parseDspf(e.text).records.find((r) => r.name === 'CTLREC') : null;
      return rec ? rec.keywords.filter((k) => k.name === 'SFLMSGID').map((k) => k.parameters.trim()) : null;
    },
    box: (suffix) => doc.getElementById(P + '-' + suffix),
    type: (suffix, value) => {
      const el = c.box(suffix);
      el.value = value;
      c.fire(el);
    },
  };
  const sel = doc.getElementById('recordSelect');
  sel.value = 'CTLREC';
  sel.dispatchEvent(new Ev('change', { bubbles: true }));
  const tab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLCTL');
  if (tab) c.click(tab);
  await fn(c);
  check('no uncaught errors in this scenario', errors.length === 0);
  dom.window.close();
}

async function main() {
  console.log('\nB1. hand-written SFLMSGID(U1 QGPL/MF 30 &CMSGFLD): every part is read into its own box');
  await scenario(['SFLMSGID(U1 QGPL/MF 30 &CMSGFLD)'], async (c) => {
    check('message id box', c.box('id') && c.box('id').value === 'U1');
    check('message file box holds the file only, not LIB/FILE', c.box('file') && c.box('file').value === 'MF');
    check('library box holds QGPL', c.box('lib') && c.box('lib').value === 'QGPL');
    check('response indicator box holds 30 (not shown as the library, the old misreading)', c.box('resp') && c.box('resp').value === '30');
    check('message data field box holds &CMSGFLD', c.box('data') && c.box('data').value === '&CMSGFLD');

    console.log('\nB2. changing only the message id no longer drops the rest');
    c.reset();
    c.type('id', 'V2');
    check('written as V2 QGPL/MF 30 &CMSGFLD, nothing lost', same(c.sflmsgid(), ['V2 QGPL/MF 30 &CMSGFLD']));
    check('no alert', c.alerts.length === 0);
  });

  console.log('\nB3. a library typed into the panel is written as LIB/FILE, not a bare third token');
  await scenario(['SFLMSGID(U1 MF)'], async (c) => {
    c.reset();
    c.type('lib', 'QGPL');
    check('written as U1 QGPL/MF', same(c.sflmsgid(), ['U1 QGPL/MF']));
    c.reset();
    c.type('lib', '');
    check('clearing the library goes back to U1 MF', same(c.sflmsgid(), ['U1 MF']));
  });

  console.log('\nB4. response indicator: written, and validated (alert + revert, no edit posted)');
  await scenario(['SFLMSGID(U1 MF)'], async (c) => {
    c.reset();
    c.type('resp', '30');
    check('30 is written as the third token', same(c.sflmsgid(), ['U1 MF 30']));
    c.reset();
    c.type('resp', 'ABC');
    check('ABC is refused with an alert', c.alerts.length === 1 && /01 to 99/.test(c.alerts[0]));
    check('no edit was posted', c.lastEdit() === null);
    check('the box is put back to its saved value (30)', c.box('resp').value === '30');
    c.reset();
    c.type('resp', '7');
    check('a single digit is refused too', c.alerts.length === 1 && c.lastEdit() === null);
    c.reset();
    c.type('resp', '');
    check('clearing it removes the token again', same(c.sflmsgid(), ['U1 MF']) && c.alerts.length === 0);
  });

  console.log('\nB5. message data field: I-97\'s rule now applies to the box the panel finally has');
  await scenario(['SFLMSGID(U1 MF 30)'], async (c) => {
    c.reset();
    c.type('data', 'CMSGFLD');
    check('a character usage-P field of this record is written (with its &), the indicator kept', same(c.sflmsgid(), ['U1 MF 30 &CMSGFLD']) && c.alerts.length === 0);
    c.reset();
    c.type('data', 'cmsgfld');
    check('matched case-insensitively', c.alerts.length === 0);
  });
  await scenario(['SFLMSGID(U1 MF)'], async (c) => {
    c.reset();
    c.type('data', 'NOSUCH');
    check('a field that does not exist is refused', c.alerts.length === 1 && /SFLMSGID message data field &NOSUCH does not exist/.test(c.alerts[0]) && c.lastEdit() === null);
    c.reset();
    c.type('data', 'COUTFLD');
    check('a field that is not usage P is refused', c.alerts.length === 1 && /its usage is O/.test(c.alerts[0]) && c.lastEdit() === null);
  });

  console.log('\nB6. all five parts together, and the file reads back the same');
  await scenario(['SFLMSGID(U1 MF)'], async (c) => {
    c.reset();
    c.type('id', 'MSG0001');
    c.type('file', 'USRMSGS');
    c.type('lib', 'QGPL');
    c.type('resp', '30');
    c.type('data', '&CMSGFLD');
    const written = c.sflmsgid();
    check('MSG0001 QGPL/USRMSGS 30 &CMSGFLD', same(written, ['MSG0001 QGPL/USRMSGS 30 &CMSGFLD']));
    check('parseSflMsgIdParams reads it back into the same five parts', same(DspfWriter.parseSflMsgIdParams(written[0]), { msgId: 'MSG0001', msgFile: 'USRMSGS', library: 'QGPL', responseIndicator: '30', msgDataField: '&CMSGFLD' }));
  });

  console.log('\nB7. a file written by an earlier version (SFLMSGID(U1 MF QGPL)) opens with its library and is repaired on the next edit');
  await scenario(['SFLMSGID(U1 MF QGPL)'], async (c) => {
    check('the library box shows QGPL', c.box('lib') && c.box('lib').value === 'QGPL');
    check('the response indicator box is empty (QGPL is not an indicator)', c.box('resp') && c.box('resp').value === '');
    c.reset();
    c.type('id', 'V2');
    check('the next edit writes valid DDS: V2 QGPL/MF', same(c.sflmsgid(), ['V2 QGPL/MF']));
  });

  console.log('\nB8. \"+ Add\" still seeds a valid placeholder, and two instances stay independent');
  await scenario([], async (c) => {
    c.reset();
    c.click(c.doc.querySelector('.repeat-inst-add[data-prefix="sflctl-CTLREC-sflmsgid-rep"]'));
    check('a freshly added SFLMSGID has a non-blank msgid + file placeholder', /^\S+ \S+$/.test((c.sflmsgid() || [''])[0]));
    c.reset();
    c.type('resp', '11');
    check('the new instance takes a response indicator', /^\S+ \S+ 11$/.test((c.sflmsgid() || [''])[0]));
  });

  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

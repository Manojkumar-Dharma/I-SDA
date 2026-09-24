/**
 * i100SflmsgResponseIndicator.test.js
 *
 * Task I-100 - the SFLMSG panel (Subfile Messages, on the subfile-control
 * record) dropped a hand-written response indicator the moment its text was
 * edited: SFLMSG('No records' 30) was rewritten as SFLMSG('new text'). IBM's
 * format is SFLMSG('message-text' [response-indicator]) - the same shape as
 * ERRMSG's - but the text box committed quoteDdsLiteral(text) alone and the
 * panel had no response-indicator input at all. Same failure shape as I-99's
 * SFLMSGID one.
 *
 * A. the pure functions in dspfWriter.js
 * B. the real generated webview in jsdom (SFLCTL tab -> Subfile Messages)
 *
 * Run with: node src/test/i100SflmsgResponseIndicator.test.js
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
console.log('\nA1. parseSflMsgParams reads SFLMSG(\'message-text\' [response-indicator])');
{
  const parse = DspfWriter.parseSflMsgParams;
  check("the case from the finding: 'No records' 30", same(parse("'No records' 30"), { text: 'No records', responseIndicator: '30' }));
  check('text only', same(parse("'No records'"), { text: 'No records', responseIndicator: '' }));
  check("a doubled quote is undone: 'It''s empty' 05", same(parse("'It''s empty' 05"), { text: "It's empty", responseIndicator: '05' }));
  check('a number INSIDE the text is text, not an indicator', same(parse("'Code 30 failed' 12"), { text: 'Code 30 failed', responseIndicator: '12' }) && parse("'Code 30 failed'").responseIndicator === '');
  check('extra whitespace is tolerated', same(parse("   'A b'    07  "), { text: 'A b', responseIndicator: '07' }));
  check('anything after the text that is not a number is ignored (as for ERRMSG)', same(parse("'A' &X"), { text: 'A', responseIndicator: '' }));
  check('blank / undefined parameters give blanks', same(parse(''), { text: '', responseIndicator: '' }) && parse(undefined).text === '');
  check('agrees with ERRMSG\'s own reading of the same string', (() => {
    const e = DspfWriter.getErrorMessageInstances([{ name: 'ERRMSG', parameters: "'No records' 30", conditions: [] }])[0];
    return e.text === parse("'No records' 30").text && e.responseIndicator === parse("'No records' 30").responseIndicator;
  })());
}

console.log('\nA2. formatSflMsgParams writes it back');
{
  const f = DspfWriter.formatSflMsgParams;
  check('text + indicator', f({ text: 'No records', responseIndicator: '30' }) === "'No records' 30");
  check('text only', f({ text: 'No records' }) === "'No records'");
  check('a blank indicator is not written', f({ text: 'No records', responseIndicator: '  ' }) === "'No records'");
  check("an apostrophe is doubled", f({ text: "It's empty", responseIndicator: '05' }) === "'It''s empty' 05");
  check('blank text gives an empty payload, exactly as quoteDdsLiteral alone did before', f({ text: '', responseIndicator: '30' }) === '' && f({ text: '   ' }) === '' && f(null) === '' && f(undefined) === '');
  check('with no indicator it is byte-for-byte quoteDdsLiteral (no behaviour change for existing files)', ['a', "b'c", '  padded  ', 'x y z'].every((t) => f({ text: t }) === DspfWriter.quoteDdsLiteral(t)));
}

console.log('\nA3. round trip: format(parse(x)) === x, and editing only the text keeps the indicator (the reported data loss)');
{
  ["'No records'", "'No records' 30", "'It''s empty' 05", "'Code 30 failed' 12"].forEach((x) => {
    check(x, DspfWriter.formatSflMsgParams(DspfWriter.parseSflMsgParams(x)) === x);
  });
  const p = DspfWriter.parseSflMsgParams("'No records' 30");
  p.text = 'New text';
  check("changing only the text: 'New text' 30", DspfWriter.formatSflMsgParams(p) === "'New text' 30");
}

console.log('\nA4. messageResponseIndicatorProblem names the keyword; SFLMSGID\'s own function is unchanged');
{
  const prob = DspfWriter.messageResponseIndicatorProblem;
  check('blank, 01, 30 and 99 are fine', prob('SFLMSG', '') === null && prob('SFLMSG', '01') === null && prob('SFLMSG', '30') === null && prob('SFLMSG', '99') === null);
  check('00, a single digit, three digits and letters are refused', ['00', '7', '100', 'AB', '&X'].every((v) => prob('SFLMSG', v) !== null));
  check('the message names SFLMSG and what was typed', /^SFLMSG\u2019s response indicator/.test(prob('SFLMSG', 'ABC') || '') && /ABC/.test(prob('SFLMSG', 'ABC') || ''));
  check('SFLMSGID\'s wrapper gives the same answers and still names SFLMSGID', DspfWriter.sflMsgIdResponseIndicatorProblem('30') === null && /^SFLMSGID\u2019s response indicator/.test(DspfWriter.sflMsgIdResponseIndicatorProblem('7') || ''));
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
  return lines.join('\n') + '\n';
}
async function scenario(ctlKeywords, fn) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce100', source(ctlKeywords), 'SM100.DSPF');
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
  const c = {
    doc, posted, alerts,
    click: (el) => el.dispatchEvent(new Ev('click', { bubbles: true })),
    fire: (el) => el.dispatchEvent(new Ev('change', { bubbles: true })),
    reset: () => { posted.length = 0; alerts.length = 0; },
    lastEdit: () => posted.filter((m) => m.type === 'applyEdit').pop() || null,
    sflmsg: () => {
      const e = c.lastEdit();
      const rec = e ? DspfParser.parseDspf(e.text).records.find((r) => r.name === 'CTLREC') : null;
      return rec ? rec.keywords.filter((k) => k.name === 'SFLMSG').map((k) => k.parameters.trim()) : null;
    },
    box: (n, suffix) => doc.getElementById('sflctl-CTLREC-sflmsg-rep-inst' + n + '-' + suffix),
    type: (n, suffix, value) => {
      const el = c.box(n, suffix);
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
  console.log("\nB1. hand-written SFLMSG('No records' 30): text and indicator are read into their own boxes");
  await scenario(["SFLMSG('No records' 30)"], async (c) => {
    check('text box holds the text only (no quotes, no indicator)', c.box(0, 'text') && c.box(0, 'text').value === 'No records');
    check('response indicator box holds 30', c.box(0, 'resp') && c.box(0, 'resp').value === '30');

    console.log('\nB2. editing only the text keeps the indicator (the reported data loss)');
    c.reset();
    c.type(0, 'text', 'New text');
    check("written as 'New text' 30", same(c.sflmsg(), ["'New text' 30"]));
    check('no alert', c.alerts.length === 0);
  });

  console.log('\nB3. the response indicator box: change, clear, and validation (alert + revert, no edit posted)');
  await scenario(["SFLMSG('No records' 30)"], async (c) => {
    c.reset();
    c.type(0, 'resp', '45');
    check("changed to 45, text kept: 'No records' 45", same(c.sflmsg(), ["'No records' 45"]));
    c.reset();
    c.type(0, 'resp', 'ABC');
    check('ABC is refused with an alert naming SFLMSG and the range', c.alerts.length === 1 && /^SFLMSG\u2019s response indicator/.test(c.alerts[0]) && /01 to 99/.test(c.alerts[0]));
    check('no edit was posted', c.lastEdit() === null);
    check('the box is put back to its saved value (45)', c.box(0, 'resp').value === '45');
    c.reset();
    c.type(0, 'resp', '7');
    check('a single digit is refused too', c.alerts.length === 1 && c.lastEdit() === null);
    c.reset();
    c.type(0, 'resp', '');
    check("clearing it removes the token: 'No records'", same(c.sflmsg(), ["'No records'"]) && c.alerts.length === 0);
  });

  console.log('\nB4. a text with an apostrophe round-trips, with the indicator');
  await scenario(["SFLMSG('Empty' 30)"], async (c) => {
    c.reset();
    c.type(0, 'text', "It's empty");
    check("written as 'It''s empty' 30", same(c.sflmsg(), ["'It''s empty' 30"]));
  });

  console.log('\nB5. two instances stay independent');
  await scenario(["SFLMSG('First' 11)", "SFLMSG('Second')"], async (c) => {
    check('setup: instance 0 has indicator 11, instance 1 has none', c.box(0, 'resp').value === '11' && c.box(1, 'resp').value === '');
    c.reset();
    c.type(1, 'text', 'Second edited');
    check("only the second changed; the first keeps 'First' 11", same(c.sflmsg(), ["'First' 11", "'Second edited'"]));
    c.reset();
    c.type(1, 'resp', '22');
    check("giving the second an indicator leaves the first alone", same(c.sflmsg(), ["'First' 11", "'Second edited' 22"]));
  });

  console.log('\nB6. a file with no indicator anywhere behaves exactly as before');
  await scenario(["SFLMSG('Plain')"], async (c) => {
    check('indicator box is empty', c.box(0, 'resp').value === '');
    c.reset();
    c.type(0, 'text', 'Plain 2');
    check("text-only edit still writes a bare quoted string: 'Plain 2'", same(c.sflmsg(), ["'Plain 2'"]));
  });

  console.log('\nB7. \"+ Add\" still seeds a valid placeholder, which then takes an indicator');
  await scenario([], async (c) => {
    c.reset();
    c.click(c.doc.querySelector('.repeat-inst-add[data-prefix="sflctl-CTLREC-sflmsg-rep"]'));
    check("a freshly added SFLMSG has a non-blank, validly quoted placeholder", /^'.+'$/.test((c.sflmsg() || [''])[0]));
    c.reset();
    c.type(0, 'resp', '11');
    check('the new instance takes a response indicator', /^'.+' 11$/.test((c.sflmsg() || [''])[0]));
  });

  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

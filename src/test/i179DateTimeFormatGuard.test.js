/**
 * i179DateTimeFormatGuard.test.js
 *
 * Task I-179 - DATFMT / DATSEP (date fields, data type L) and TIMFMT / TIMSEP
 * (time fields, data type T): the rules their own DDS Reference sections state,
 * enforced through the commitEdit choke point.
 *
 *   eligibility   DATFMT / DATSEP only on data type L, TIMFMT / TIMSEP only on T
 *                 (a blank data type is a character field, so refused)
 *   values        DATFMT: *JOB *MDY *DMY *YMD *JUL *ISO *USA *EUR *JIS;
 *                 TIMFMT: *HMS *ISO *USA *EUR *JIS (no *JOB); DATSEP / TIMSEP:
 *                 *JOB or one separator in single quotes (/ - . , blank for the
 *                 date, : . , blank for the time); a bare keyword is refused
 *   pairing       *ISO *USA *EUR *JIS (fixed separator) cannot go with DATSEP /
 *                 TIMSEP, in both directions
 *   decision      DATSEP with no DATFMT is allowed (the panel treats a blank
 *                 format as fine; DATFMT's default *ISO is not a specified value)
 *   Basic tab     a data type change that would strand a keyword is refused
 *
 * Diff-based: a hand-written field that already carries a problem stays
 * editable, and removal is always allowed.
 *
 * Run with: node src/test/i179DateTimeFormatGuard.test.js
 */
const path = require('path');
const W = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const K = (name, parameters) => ({ name, parameters: parameters === undefined ? '' : parameters, conditions: [], raw: '', sourceLines: [] });
const has = (s, re) => re.test(s || '');
const newR = (oldK, newK, dt) => W.dateTimeFormatNewConflictReason(oldK, newK, { dataType: dt });

console.log('=== writer: eligibility (data type L / T) ===');
{
  check('DATFMT on L is accepted', newR([], [K('DATFMT', '*MDY')], 'L') === null);
  check('DATFMT on A is refused, naming DATFMT and data type L', has(newR([], [K('DATFMT', '*MDY')], 'A'), /DATFMT/) && has(newR([], [K('DATFMT', '*MDY')], 'A'), /data type L/));
  check('DATFMT on a blank data type is refused ("not blank")', has(newR([], [K('DATFMT', '*MDY')], ''), /not blank/));
  check('DATFMT on T and on Z is refused', !!newR([], [K('DATFMT', '*MDY')], 'T') && !!newR([], [K('DATFMT', '*MDY')], 'Z'));
  check('DATSEP on L accepted, on A and T refused', newR([], [K('DATSEP', "'/'")], 'L') === null && !!newR([], [K('DATSEP', "'/'")], 'A') && !!newR([], [K('DATSEP', "'/'")], 'T'));
  check('TIMFMT on T accepted; on L, A and blank refused, naming data type T',
    newR([], [K('TIMFMT', '*HMS')], 'T') === null && has(newR([], [K('TIMFMT', '*HMS')], 'L'), /data type T/) && !!newR([], [K('TIMFMT', '*HMS')], 'A') && !!newR([], [K('TIMFMT', '*HMS')], ''));
  check('TIMSEP on T accepted, on L and A refused', newR([], [K('TIMSEP', "':'")], 'T') === null && !!newR([], [K('TIMSEP', "':'")], 'L') && !!newR([], [K('TIMSEP', "':'")], 'A'));
  check('lower-case data type letters are read the same way', newR([], [K('DATFMT', '*MDY')], 'l') === null);
}

console.log('\n=== writer: value domain ===');
{
  ['*JOB', '*MDY', '*DMY', '*YMD', '*JUL', '*ISO', '*USA', '*EUR', '*JIS'].forEach((v) => {
    check('DATFMT(' + v + ') alone is accepted on L', newR([], [K('DATFMT', v)], 'L') === null);
  });
  check('DATFMT(*FOO) is refused and the message lists the valid values', has(newR([], [K('DATFMT', '*FOO')], 'L'), /\*FOO/) && has(newR([], [K('DATFMT', '*FOO')], 'L'), /\*MDY/));
  check('DATFMT with no parameter is refused', has(newR([], [K('DATFMT', '')], 'L'), /needs a parameter/));
  check('DATFMT(*iso) in lower case is accepted', newR([], [K('DATFMT', '*iso')], 'L') === null);
  ['*HMS', '*ISO', '*USA', '*EUR', '*JIS'].forEach((v) => check('TIMFMT(' + v + ') alone is accepted on T', newR([], [K('TIMFMT', v)], 'T') === null));
  check('TIMFMT(*JOB) is refused (TIMFMT has no *JOB)', has(newR([], [K('TIMFMT', '*JOB')], 'T'), /TIMFMT\(\*JOB\)/));
  check('TIMFMT(*MDY) and a bare TIMFMT are refused', !!newR([], [K('TIMFMT', '*MDY')], 'T') && !!newR([], [K('TIMFMT', '')], 'T'));
  ["'/'", "'-'", "'.'", "','", "' '", '*JOB'].forEach((v) => check('DATSEP(' + v + ') is accepted on L', newR([], [K('DATSEP', v)], 'L') === null));
  check("DATSEP('x') is refused", has(newR([], [K('DATSEP', "'x'")], 'L'), /not a valid separator/));
  check('DATSEP(/) without quotes is refused (single quotes must enclose the parameter)', !!newR([], [K('DATSEP', '/')], 'L'));
  check("DATSEP('//') (two characters) and a bare DATSEP are refused", !!newR([], [K('DATSEP', "'//'")], 'L') && has(newR([], [K('DATSEP', '')], 'L'), /needs a parameter/));
  check("DATSEP(':') is refused (colon is a time separator)", !!newR([], [K('DATSEP', "':'")], 'L'));
  [`':'`, `'.'`, `','`, `' '`, '*JOB'].forEach((v) => check('TIMSEP(' + v + ') is accepted on T', newR([], [K('TIMSEP', v)], 'T') === null));
  check("TIMSEP('/') is refused (no slash for time) and TIMSEP('x') too", !!newR([], [K('TIMSEP', "'/'")], 'T') && !!newR([], [K('TIMSEP', "'x'")], 'T'));
  check('the message names the separators the keyword allows, blank spelled out', has(newR([], [K('TIMSEP', "'x'")], 'T'), /blank/));
}

console.log('\n=== writer: fixed-separator pairing, both directions ===');
{
  ['*ISO', '*USA', '*EUR', '*JIS'].forEach((f) => {
    check('adding DATFMT(' + f + ') to a field with DATSEP is refused', has(newR([K('DATSEP', "'/'")], [K('DATSEP', "'/'"), K('DATFMT', f)], 'L'), /fixed date separator/));
    check('adding DATSEP to a field with DATFMT(' + f + ') is refused', has(newR([K('DATFMT', f)], [K('DATFMT', f), K('DATSEP', "'/'")], 'L'), /DATSEP cannot be specified with DATFMT/));
    check('adding TIMFMT(' + f + ') to a field with TIMSEP is refused', has(newR([K('TIMSEP', "':'")], [K('TIMSEP', "':'"), K('TIMFMT', f)], 'T'), /fixed time separator/));
    check('adding TIMSEP to a field with TIMFMT(' + f + ') is refused', has(newR([K('TIMFMT', f)], [K('TIMFMT', f), K('TIMSEP', "':'")], 'T'), /TIMSEP cannot be specified with TIMFMT/));
  });
  check('DATSEP(*JOB) beside DATFMT(*ISO) is refused too (any DATSEP counts)', !!newR([K('DATFMT', '*ISO')], [K('DATFMT', '*ISO'), K('DATSEP', '*JOB')], 'L'));
  ['*MDY', '*DMY', '*YMD', '*JUL', '*JOB'].forEach((f) => check('DATFMT(' + f + ') with DATSEP is accepted', newR([K('DATSEP', "'/'")], [K('DATSEP', "'/'"), K('DATFMT', f)], 'L') === null));
  check('TIMFMT(*HMS) with TIMSEP is accepted', newR([K('TIMSEP', "':'")], [K('TIMSEP', "':'"), K('TIMFMT', '*HMS')], 'T') === null);
  check('decision: DATSEP with no DATFMT is accepted', newR([], [K('DATSEP', "'/'")], 'L') === null);
  check('decision: TIMSEP with no TIMFMT is accepted', newR([], [K('TIMSEP', "':'")], 'T') === null);
  check('both added in one edit with a fixed format are refused', !!newR([], [K('DATFMT', '*USA'), K('DATSEP', "'/'")], 'L'));
  check('both added in one edit with a free format are accepted', newR([], [K('DATFMT', '*DMY'), K('DATSEP', "'-'")], 'L') === null);
}

console.log('\n=== writer: diff-based - existing problems stay editable ===');
{
  const bad = [K('DATFMT', '*ISO'), K('DATSEP', "'/'")];
  check('an edit that leaves an already-conflicting pair alone is not re-reported', newR(bad, bad.concat([K('BLANKS')]), 'L') === null);
  check('changing a conflicting pair to another conflicting pair is not newly blocked', newR(bad, [K('DATFMT', '*USA'), K('DATSEP', "'/'")], 'L') === null);
  check('removing DATSEP, or DATFMT, from a conflicting pair is accepted', newR(bad, [K('DATFMT', '*ISO')], 'L') === null && newR(bad, [K('DATSEP', "'/'")], 'L') === null);
  check('removal on an ineligible field is always accepted', newR([K('DATFMT', '*MDY')], [], 'A') === null);
  const wrongType = [K('DATFMT', '*MDY')];
  check('a hand-written DATFMT on a character field stays editable (unrelated keyword added)', newR(wrongType, wrongType.concat([K('BLANKS')]), 'A') === null);
  check('...but introducing DATSEP beside it is judged (new keyword, data type A)', !!newR(wrongType, wrongType.concat([K('DATSEP', "'/'")]), 'A'));
  check('a hand-written bad value stays editable while its parameter is unchanged', newR([K('DATFMT', '*FOO')], [K('DATFMT', '*FOO'), K('BLANKS')], 'L') === null);
  check('...and changing it to another bad value is judged, to a good one accepted', !!newR([K('DATFMT', '*FOO')], [K('DATFMT', '*BAR')], 'L') && newR([K('DATFMT', '*FOO')], [K('DATFMT', '*MDY')], 'L') === null);
  check('panel-style change *MDY + / to *JUL + - is accepted', newR([K('DATFMT', '*MDY'), K('DATSEP', "'/'")], [K('DATFMT', '*JUL'), K('DATSEP', "'-'")], 'L') === null);
  check('panel-style change *MDY + / to *ISO + / is refused (the pair becomes conflicting)', !!newR([K('DATFMT', '*MDY'), K('DATSEP', "'/'")], [K('DATFMT', '*ISO'), K('DATSEP', "'/'")], 'L'));
  check('null / undefined keyword lists and field kind do not throw', newR(null, null, 'L') === null && W.dateTimeFormatNewConflictReason(undefined, [K('DATFMT', '*MDY')], undefined) !== undefined);
  check('unrelated keywords are never judged', newR([], [K('BLANKS'), K('EDTCDE', '1')], 'A') === null);
}

console.log('\n=== writer: Basic tab data type change ===');
{
  const b = (kws, from, to) => W.dateTimeFormatBasicEditConflictReason(kws, { dataType: from }, { dataType: to });
  const D = [K('DATFMT', '*MDY'), K('DATSEP', "'/'")];
  check('L -> A on a field with DATFMT / DATSEP is refused, "Remove DATFMT first"', has(b(D, 'L', 'A'), /Remove DATFMT first/) && has(b(D, 'L', 'A'), /data type L/));
  check('L -> blank is refused too', has(b(D, 'L', ''), /Remove DATFMT first/));
  check('L -> T on a DATSEP-only field is refused, naming DATSEP', has(b([K('DATSEP', "'/'")], 'L', 'T'), /Remove DATSEP first/));
  check('T -> A on a field with TIMFMT is refused', has(b([K('TIMFMT', '*HMS')], 'T', 'A'), /Remove TIMFMT first/));
  check('T -> L on a TIMSEP field is refused', has(b([K('TIMSEP', "':'")], 'T', 'L'), /Remove TIMSEP first/));
  check('L -> A on a field without the keywords is accepted', b([], 'L', 'A') === null);
  check('A -> L on a field without the keywords is accepted', b([], 'A', 'L') === null);
  check('a change that keeps the type (L -> L, case change) is accepted', b(D, 'L', 'L') === null && b(D, 'L', 'l') === null);
  check('a usage-only update (no dataType key) is accepted', W.dateTimeFormatBasicEditConflictReason(D, { dataType: 'L' }, { usage: 'O' }) === null);
  check('a hand-written DATFMT on type A can move to L (fixing it) without a refusal', b([K('DATFMT', '*MDY')], 'A', 'L') === null);
  check('null / undefined arguments do not throw', W.dateTimeFormatBasicEditConflictReason(null, null, null) === null);
}

console.log('\n=== webview: raw keyword editor and Basic tab (jsdom) ===');
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const fld = (name, len, type, line, fn) => dds({ name, len, type, usage: 'B', line, pos: 2, fn });
const SOURCE = [
  dds({ rec: 1, name: 'R1' }),
  fld('D1', 6, 'L', 3, "DATFMT(*MDY) DATSEP('/')"),
  fld('D2', 10, 'L', 5),
  fld('D3', 10, 'L', 7, "DATSEP('/')"),
  fld('T1', 8, 'T', 9, "TIMFMT(*HMS) TIMSEP(':')"),
  fld('T2', 8, 'T', 11),
  fld('A9', 10, 'A', 13),
  fld('A8', 10, 'A', 15),
].join('\n') + '\n';

const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'I179.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (t) => { alerts.push(String(t)); };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (e, type) => e.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const el = (id) => doc.getElementById(id);
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const fieldFrom = (t, n) => (t ? DspfParser.parseDspf(t).records[0].fields.find((f) => f.name === n) : null);
  const kwOf = (f, n) => (f && f.keywords || []).find((k) => k.name === n);
  const sel = el('recordSelect');
  const cur = {};
  const pick = (n) => {
    sel.value = 'R1'; fire(sel);
    const box = doc.querySelector('.dspf-field[data-field="' + n + '"]');
    if (!box) { check('setup: ' + n + ' is on the preview canvas', false); return false; }
    cur[n] = box.getAttribute('data-source-line');
    box.click();
    posted.length = 0; alerts.length = 0;
    return true;
  };
  const own = (n) => 'field-' + cur[n];
  function rawAdd(n, name, params) {
    el(own(n) + '-new-kw-name').value = name;
    const pe = el(own(n) + '-new-kw-params'); if (pe) pe.value = params || '';
    posted.length = 0; alerts.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + own(n) + '"]'), 'click');
  }
  const refused = (re) => lastText() === null && alerts.some((a) => re.test(a));

  sel.value = 'R1'; fire(sel);
  check('setup: all seven fixture fields are on the canvas', ['D1', 'D2', 'D3', 'T1', 'T2', 'A9', 'A8'].every((n) => !!doc.querySelector('.dspf-field[data-field="' + n + '"]')));

  console.log('  -- raw editor: eligibility');
  pick('A9'); rawAdd('A9', 'DATFMT', '*MDY');
  check('DATFMT on the character field A9 is refused: no edit, message names DATFMT and data type L', refused(/DATFMT/) && alerts.some((a) => /data type L/.test(a)));
  pick('A9'); rawAdd('A9', 'DATSEP', "'/'");
  check('DATSEP on A9 is refused', refused(/DATSEP/));
  pick('A9'); rawAdd('A9', 'TIMFMT', '*HMS');
  check('TIMFMT on A9 is refused, naming data type T', refused(/TIMFMT/) && alerts.some((a) => /data type T/.test(a)));
  pick('A9'); rawAdd('A9', 'TIMSEP', "':'");
  check('TIMSEP on A9 is refused', refused(/TIMSEP/));
  pick('D2'); rawAdd('D2', 'TIMFMT', '*HMS');
  check('TIMFMT on the date field D2 is refused', refused(/data type T/));
  pick('T2'); rawAdd('T2', 'DATFMT', '*MDY');
  check('DATFMT on the time field T2 is refused', refused(/data type L/));

  console.log('  -- raw editor: values');
  pick('D2'); rawAdd('D2', 'DATFMT', '*FOO');
  check('DATFMT(*FOO) on D2 is refused', refused(/DATFMT\(\*FOO\)/));
  pick('D2'); rawAdd('D2', 'DATSEP', "'x'");
  check("DATSEP('x') on D2 is refused", refused(/not a valid separator/));
  pick('T2'); rawAdd('T2', 'TIMFMT', '*JOB');
  check('TIMFMT(*JOB) on T2 is refused', refused(/TIMFMT\(\*JOB\)/));
  pick('T2'); rawAdd('T2', 'TIMSEP', "'/'");
  check("TIMSEP('/') on T2 is refused", refused(/not a valid separator/));

  console.log('  -- raw editor: pairing');
  pick('D3'); rawAdd('D3', 'DATFMT', '*ISO');
  check("raw-adding DATFMT(*ISO) to D3, which has DATSEP('/'), is refused", refused(/fixed date separator/));
  pick('D3'); rawAdd('D3', 'DATFMT', '*MDY');
  {
    const f = fieldFrom(lastText(), 'D3');
    check('raw-adding DATFMT(*MDY) to D3 is accepted and written beside DATSEP', alerts.length === 0 && !!f && kwOf(f, 'DATFMT').parameters === '*MDY' && !!kwOf(f, 'DATSEP'));
  }
  pick('T2'); rawAdd('T2', 'TIMFMT', '*USA');
  {
    const f = fieldFrom(lastText(), 'T2');
    check('TIMFMT(*USA) alone on T2 is accepted', alerts.length === 0 && !!f && kwOf(f, 'TIMFMT').parameters === '*USA');
  }
  pick('T2'); rawAdd('T2', 'TIMSEP', "':'");
  check('...and TIMSEP added next, beside the now-fixed TIMFMT(*USA), is refused', refused(/TIMSEP cannot be specified with TIMFMT/));
  pick('D2'); rawAdd('D2', 'DATSEP', "'-'");
  {
    const f = fieldFrom(lastText(), 'D2');
    check("decision: DATSEP('-') alone on D2 (no DATFMT) is accepted and written", alerts.length === 0 && !!f && kwOf(f, 'DATSEP').parameters === "'-'");
  }
  pick('D2'); rawAdd('D2', 'DATFMT', '*JUL');
  {
    const f = fieldFrom(lastText(), 'D2');
    check('valid DATFMT(*JUL) on a date field is accepted and written', alerts.length === 0 && !!f && kwOf(f, 'DATFMT').parameters === '*JUL');
  }

  console.log('  -- Basic tab: data type change');
  const apply = (vals) => {
    Object.keys(vals).forEach((id) => { el(id).value = vals[id]; });
    posted.length = 0; alerts.length = 0;
    fire(el('p-apply'), 'click');
  };
  pick('D1');
  check('setup: D1 data type is L', el('p-type').value === 'L');
  apply({ 'p-type': 'A' });
  check('D1 (DATFMT, DATSEP) L -> A is refused: no edit, "Remove DATFMT first"', refused(/Remove DATFMT first/));
  pick('T1');
  apply({ 'p-type': 'A' });
  check('T1 (TIMFMT, TIMSEP) T -> A is refused: "Remove TIMFMT first"', refused(/Remove TIMFMT first/));
  pick('T1');
  apply({ 'p-type': 'L' });
  check('T1 T -> L is refused', refused(/Remove TIMFMT first/));
  pick('A8');
  apply({ 'p-type': 'L', 'p-length': '10' });
  {
    const f = fieldFrom(lastText(), 'A8');
    check('A8 (no date/time keyword) A -> L is accepted and written', alerts.length === 0 && !!f && f.dataType === 'L');
  }
  pick('D1');
  apply({ 'p-usage': 'I' });
  {
    const f = fieldFrom(lastText(), 'D1');
    check('a usage-only change on D1 keeps DATFMT and DATSEP and is accepted', alerts.length === 0 && !!f && f.dataType === 'L' && !!kwOf(f, 'DATFMT') && !!kwOf(f, 'DATSEP'));
  }
  pick('D1');
  el('p-type').value = 'L';
  {
    // The panel Apply with a fixed format and a separator still stops at the panel (alert, no edit).
    const applyBtn = doc.querySelector('[class*="' + own('D1') + '-dtfmt-apply"]');
    el(own('D1') + '-datfmt').value = '*USA'; el(own('D1') + '-datsep').value = '/';
    posted.length = 0; alerts.length = 0; fire(applyBtn, 'click');
    check('the date panel Apply with *USA and a separator is still refused (panel and guard agree)', lastText() === null && alerts.some((a) => /fixed date separator/.test(a)));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

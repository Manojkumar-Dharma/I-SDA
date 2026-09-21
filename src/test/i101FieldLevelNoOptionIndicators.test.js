/**
 * i101FieldLevelNoOptionIndicators.test.js
 *
 * Task I-101, batch 3 - the field-level-only keywords. Batches 1 and 2 closed
 * the raw keyword editor's Conditioning toggle for the file-level (14) and
 * record-level (30) keywords; this batch adds 35 field-level-only keywords whose
 * own section of DDS_Keyword_V7r6.txt says "Option indicators are not valid for
 * this keyword":
 *   plain (23):  ALIAS BLANKS BLKFOLD CHCACCEL CHCCTL CHKMSGID CNTFLD COMP
 *                DLTCHK DLTEDT EDTCDE EDTMSK EDTWRD FLDCSRPRG FLTFIXDEC HLPID
 *                MLTCHCFLD PSHBTNFLD RANGE SFLCHCCTL SFLCSRPRG SNGCHCFLD VALUES
 *   "...although option indicators can be used to condition the field" (12):
 *                CHRID DATE DATFMT DATSEP DFT HTML MAPVAL SYSNAME TIME TIMFMT
 *                TIMSEP USER
 * The second wording is the field-level subtlety: the FIELD may be conditioned
 * (its indicators sit on its own line and belong to the field, not to a
 * first-line keyword), only the keyword on a line of its own may not - so this
 * test also proves a conditioned field is never flagged.
 * (CNTFLD's extracted text shows a "valid" sentence after its own "not valid"
 * one - that is the NEXT keyword's, GRDATR's, text spilling past the section
 * boundary; Part 1b proves it.)
 * Held back on purpose: MSGCON (indicators are valid for the message's
 * presence) and MSGID (conditional, I-73).
 *
 * Part 1: the table, checked AGAINST the reference text itself.
 * Part 2: the raw editor in a plain jsdom document.
 * Part 3: the real generated designer - the field raw editor, and a pin that no
 *         structured field panel puts a Conditioning control on any of them.
 * Run with: node src/test/i101FieldLevelNoOptionIndicators.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const PLAIN = ['ALIAS', 'BLANKS', 'BLKFOLD', 'CHCACCEL', 'CHCCTL', 'CHKMSGID', 'CNTFLD', 'COMP', 'DLTCHK', 'DLTEDT', 'EDTCDE', 'EDTMSK', 'EDTWRD', 'FLDCSRPRG', 'FLTFIXDEC', 'HLPID', 'MLTCHCFLD', 'PSHBTNFLD', 'RANGE', 'SFLCHCCTL', 'SFLCSRPRG', 'SNGCHCFLD', 'VALUES'];
const FIELD_COND = ['CHRID', 'DATE', 'DATFMT', 'DATSEP', 'DFT', 'HTML', 'MAPVAL', 'SYSNAME', 'TIME', 'TIMFMT', 'TIMSEP', 'USER'];
const BATCH = PLAIN.concat(FIELD_COND);
const EARLIER = ['ALTHELP', 'ALTPAGEDWN', 'ALTPAGEUP', 'DSPRL', 'DSPSIZ', 'ERRSFL', 'HLPFULL', 'HLPSCHIDX', 'INDARA', 'MSGLOC', 'OPENPRT', 'PASSRCD', 'REF', 'USRDSPMGT', 'IGCALTTYP',
  'ALWROL', 'ASSUME', 'CLRL', 'GETRETAIN', 'GRDRCD', 'HLPCMDKEY', 'HLPSEQ', 'INZRCD', 'LOGINP', 'MNUBAR', 'PULLDOWN', 'RTNCSRLOC', 'RTNDTA', 'SETOF', 'SFL', 'SFLCTL', 'SFLENTER', 'SFLMLTCHC', 'SFLMODE', 'SFLRNA', 'SFLRTNSEL', 'SFLSNGCHC', 'SLNO', 'UNLOCK', 'USRDFN', 'SFLLIN', 'SFLMSGRCD', 'SFLPAG', 'SFLSIZ', 'WINDOW'];

// ===========================================================================
// Part 1 - the table, against the DDS Reference
// ===========================================================================
console.log('\nPart 1a. the table');
{
  const names = DspfWriter.noOptionIndicatorKeywordNames();
  check('every batch keyword is listed (35 = 23 plain + 12 field-conditionable)', BATCH.length === 35 && BATCH.every((n) => names.indexOf(n) >= 0));
  check('batches 1 and 2 and IGCALTTYP are still listed (45)', EARLIER.length === 45 && EARLIER.every((n) => names.indexOf(n) >= 0));
  check('nothing from batches 1-3 is missing (80 = 35 + 45; batch 4 adds the multi-level ones - see i101MultiLevelNoOptionIndicators)', names.length >= BATCH.length + EARLIER.length);
  check('each reason names its keyword and says "not valid"', BATCH.every((n) => {
    const r = DspfWriter.noOptionIndicatorsReason(n);
    return !!r && r.indexOf(n) >= 0 && /not valid/.test(r);
  }));
  check('the twelve field-conditionable reasons also say they can condition the field', FIELD_COND.every((n) => /condition the field/.test(DspfWriter.noOptionIndicatorsReason(n))));
  check('the 23 plain reasons do not', PLAIN.every((n) => !/condition the field/.test(DspfWriter.noOptionIndicatorsReason(n))));
  check('lookup is case-insensitive and trims', DspfWriter.noOptionIndicatorsReason(' datfmt ') === DspfWriter.noOptionIndicatorsReason('DATFMT'));
  const G1 = [{ indicators: [{ number: '01', not: false }] }];
  check('the diff check fires for a batch keyword that gains an indicator', BATCH.every((n) => !!DspfWriter.noOptionIndicatorsNewConflictReason(n, [], G1)));
  check('...but not for one that only loses it or is unchanged', BATCH.every((n) => DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, []) === null && DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, G1) === null));
  check('held back: MSGCON and MSGID are not in the table', ['MSGCON', 'MSGID'].every((n) => !DspfWriter.noOptionIndicatorsReason(n)));
  check('unlisted keywords stay null (DSPATR, COLOR, CHECK, DUP, DFTVAL, PUTRETAIN, HLPTITLE, CA01)', ['DSPATR', 'COLOR', 'CHECK', 'DUP', 'DFTVAL', 'PUTRETAIN', 'HLPTITLE', 'CA01'].every((n) => DspfWriter.noOptionIndicatorsReason(n) === null));
}

console.log('\nPart 1b. every entry is backed by its own field-level section of DDS_Keyword_V7r6.txt');
{
  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
  const anyHeading = /^\f?[A-Z][A-Za-z0-9/]+ \([^)\n]*\)[^\n]*\bkeywords?\b/m;
  function sections(name) {
    const out = [];
    const rx = new RegExp('^\\f?' + name + ' \\(', 'mg');
    let m;
    while ((m = rx.exec(ref))) {
      const rest = ref.slice(m.index + 20, m.index + 14000);
      const nxt = anyHeading.exec(rest);
      out.push((nxt ? ref.slice(m.index, m.index + 20 + nxt.index) : ref.slice(m.index, m.index + 14000)).replace(/\s+/g, ' '));
    }
    return out;
  }
  // The table-of-contents / index fragments share the heading; the real
  // section is the one that describes itself as a "<level>-level keyword".
  const levelOf = (s) => { const m = /\b(file|record|field|help[- ]specification)[- ]?level keyword/i.exec(s.slice(0, 900)); return m ? m[1].toLowerCase() : null; };
  const fieldText = (n) => sections(n).filter((s) => levelOf(s) === 'field').join(' ');
  BATCH.forEach((n) => {
    const all = sections(n).filter((s) => levelOf(s));
    const fld = all.filter((s) => levelOf(s) === 'field');
    check(n + ': described as a field-level keyword, and no section of it describes another level', fld.length >= 1 && fld.length === all.length);
    // CNTFLD's later fragment runs on into GRDATR's text (see the check below):
    // use its first section, up to its own Example.
    const text = n === 'CNTFLD' ? fld[0].split(' Example ')[0] : fieldText(n);
    if (PLAIN.indexOf(n) >= 0) {
      check(n + ': says "Option indicators are not valid for this keyword"', /Option indicators are not valid for (?:this|these) keywords?\./.test(text));
    } else {
      check(n + ': says "not valid for this keyword", and that the field can be conditioned', /Option indicators are not valid for this keyword/.test(text) &&
        (/although (?:option indicators can be used to condition the field|you can use option indicators to condition the field)/.test(text) || (n === 'HTML' && /option indicators are allowed on the constant field/.test(text))));
    }
    // HTML's own section adds "option indicators are allowed on the constant field": about the field, not the keyword.
    const stripped = text.replace(/However, option indicators are allowed on the constant field\./, '');
    check(n + ': no field-level section of it says option indicators ARE valid for the keyword', !/Option indicators are (?:valid|allowed)/i.test(stripped));
    check(n + ': it does not mention display size conditions', !/display size condition/i.test(text));
  });
  check('CNTFLD: the later "valid" sentence belongs to GRDATR (its Example follows), not to CNTFLD',
    /Option indicators are valid for this keyword\. Example The following example shows how to specify the GRDATR keyword/.test(fieldText('CNTFLD')) && /the maximum number of input fields is 256/.test(fieldText('CNTFLD')) && /Option indicators are not valid for this keyword\. DDS for display files \d+ Although/.test(fieldText('CNTFLD')));
  check('MSGCON (held back): valid for conditioning the presence of the message', /they are valid for conditioning the presence or absence of the message/.test(fieldText('MSGCON')));
  check('MSGID (held back): not allowed only on the last (or only) MSGID', /Option indicators are not allowed on the last \(or only\) MSGID/.test(fieldText('MSGID')));
}

// ===========================================================================
// Part 2 - the raw editor helpers in a plain jsdom document
// ===========================================================================
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

function kwd(name, parameters, conditions) {
  return { name: name, parameters: parameters || '', conditions: conditions || [], raw: '', sourceLines: [] };
}
const G = (...nums) => ({ indicators: nums.map((n) => ({ number: n, not: false })) });

function mount(keywords) {
  const state = { keywords: keywords, changes: 0 };
  const expanded = new Set();
  const root = document.getElementById('root');
  function render() {
    root.innerHTML = Helpers.keywordEditorHtml(state.keywords, 'kwt', expanded);
    Helpers.wireKeywordEditor(state.keywords, onChange, 'kwt', expanded, render);
  }
  function onChange(next) { state.keywords = next; state.changes++; render(); }
  render();
  return state;
}
function withAlertCapture(fn) {
  let msg = null;
  const original = global.window.alert;
  global.window.alert = function (m) { msg = m; };
  try { fn(); } finally { global.window.alert = original; }
  return msg;
}
const click = (el) => el.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
const toggleOf = (idx) => document.querySelector('.kw-cond-toggle[data-owner="kwt"][data-idx="' + idx + '"]');
const rowOf = (idx) => { const t = document.querySelector('.kw-remove[data-owner="kwt"][data-idx="' + idx + '"]'); return t ? t.closest('.kw-row') : null; };
const indicatorsOf = (k) => (k.conditions || []).reduce((n, g) => n + ((g.indicators || []).length), 0);

console.log('\nPart 2a. each of the 35, with no condition: no Conditioning toggle, a note instead');
BATCH.forEach((n) => {
  mount([kwd(n), kwd('DUP')]);
  check(n + ': no Conditioning toggle', !toggleOf(0));
  check(n + ': shows the "No option indicators" note', !!rowOf(0) && /No option indicators/.test(rowOf(0).textContent));
  check(n + ': the neighbouring unlisted keyword keeps its toggle', !!toggleOf(1));
  check(n + ': no warning', !document.querySelector('.kw-cond-warning'));
});

console.log('\nPart 2b. each of the 35, hand-written WITH an indicator: toggle kept, warning names the keyword, adding refused, removing allowed');
BATCH.forEach((n) => {
  const st = mount([kwd(n, '', [G('01')])]);
  check(n + ': the toggle is kept (so the indicator can be removed)', !!toggleOf(0));
  check(n + ': a warning names ' + n, !!document.querySelector('.kw-cond-warning') && document.querySelector('.kw-cond-warning').textContent.indexOf(n) >= 0);
  click(toggleOf(0));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '02';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check(n + ': adding indicator 02 is refused with an alert naming it', !!msg && msg.indexOf(n) >= 0 && st.changes === before && indicatorsOf(st.keywords[0]) === 1);
  const msg2 = withAlertCapture(() => click(document.querySelector('.cond-ind-remove')));
  check(n + ': removing the indicator is allowed, no alert', !msg2 && indicatorsOf(st.keywords[0]) === 0 && st.keywords.length === 1);
  check(n + ': with none left the toggle is gone again', !toggleOf(0));
});

console.log('\nPart 2c. adding a batch keyword through "+ Add keyword" still works, and it starts with no toggle');
{
  const st = mount([]);
  document.getElementById('kwt-new-kw-name').value = 'DATFMT';
  document.getElementById('kwt-new-kw-params').value = '*ISO';
  const msg = withAlertCapture(() => click(document.querySelector('.kw-add[data-owner="kwt"]')));
  check('no alert', !msg);
  check('added, unconditioned, no toggle', st.keywords.length === 1 && st.keywords[0].name === 'DATFMT' && !toggleOf(0));
  click(document.querySelector('.kw-remove[data-owner="kwt"][data-idx="0"]'));
  check('and it can be removed again', st.keywords.length === 0);
}

console.log('\nPart 2d. the held-back keywords are unchanged (MSGCON, MSGID)');
{
  const st = mount([kwd('MSGID', 'ABC1234 MSGF', [G('03')]), kwd('MSGCON', '10 MSG0001 QQMSG', [G('02')])]);
  check('no warnings on MSGID / MSGCON', !document.querySelector('.kw-cond-warning'));
  check('both keep their toggles', !!toggleOf(0) && !!toggleOf(1));
  click(toggleOf(1));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '09';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('an indicator can still be added to MSGCON (it conditions the message presence)', !msg && st.changes === before + 1);
}

// ===========================================================================
// Part 3 - the real generated designer
// ===========================================================================
const lines = [];
const at = {};
function add(name, spec) { at[name] = lines.length + 1; lines.push(buildLine(Object.assign({ seq: String((lines.length + 1) * 10).padStart(5, '0') }, spec))); }
add('R1', { nameType: 'R', name: 'REC1' });
// A numeric field that is itself conditioned (N10, on its own line), with one
// first-line keyword and continuation keywords, one of them hand-written WITH an
// indicator.
add('NUMF', { ind1: 'N10', name: 'NUMF', length: '7', dataType: 'S', decimals: '2', usage: 'B', line: '3', col: '2', func: 'EDTCDE(J)' });
add('NUMF_DFT', { ind1: '30', func: 'DFT(0)' });
add('NUMF_RANGE', { func: 'RANGE(1 9)' });
add('NUMF_DUP', { func: 'DUP' });
add('DATF', { name: 'DATF', length: '10', dataType: 'L', usage: 'B', line: '5', col: '2', func: 'DATFMT(*ISO)' });
add('DATF_SEP', { func: "DATSEP('-')" });
add('CHRF', { name: 'CHRF', length: '10', dataType: 'A', usage: 'B', line: '7', col: '2', func: 'BLKFOLD' });
add('CONST', { line: '9', col: '2', func: "'A constant'" });
add('TIMF', { name: 'TIMF', length: '8', dataType: 'T', usage: 'B', line: '11', col: '2', func: 'TIMFMT(*ISO)' });
add('SNGF', { name: 'SNGF', length: '1', dataType: 'A', usage: 'B', line: '13', col: '2', func: 'SNGCHCFLD' });
add('PSHF', { name: 'PSHF', length: '1', dataType: 'A', usage: 'B', line: '14', col: '2', func: 'PSHBTNFLD' });
add('R2', { nameType: 'R', name: 'SFLR', func: 'SFL' });
add('SFLF', { name: 'SFLF', length: '5', dataType: 'A', usage: 'B', line: '1', col: '2', func: 'SFLCSRPRG(SFLF)' });
const SRC = lines.join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce101c', SRC, 'I101C.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);
const errors = [];
const webDom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
    window.alert = () => {};
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const d = webDom.window.document;
  const parsed = DspfParser.parseDspf(SRC);
  const rec1 = parsed.records.find((r) => r.name === 'REC1');
  const numf = rec1.fields.find((f) => f.name === 'NUMF');
  console.log('\nPart 3. real designer, field-level raw editor');
  check('setup: NUMF is itself conditioned (N10) and carries EDTCDE, DFT (with indicator 30), RANGE, DUP',
    !!numf && numf.conditions.length === 1 && numf.keywords.map((k) => k.name).join(',') === 'EDTCDE,DFT,RANGE,DUP');
  check('setup: the field\'s own indicator is NOT on its first-line keyword, and DFT carries only its own (30)',
    indicatorsOf(numf.keywords[0]) === 0 && indicatorsOf(numf.keywords[1]) === 1 && indicatorsOf(numf.keywords[2]) === 0);

  const select = (line) => {
    const box = Array.from(d.querySelectorAll('.dspf-field')).find((b) => b.getAttribute('data-source-line') === String(line));
    if (box) box.click();
    return 'field-' + line;
  };
  const tog = (owner, idx) => d.querySelector('.kw-cond-toggle[data-owner="' + owner + '"][data-idx="' + idx + '"]');
  const rowText = (owner, idx) => { const b = d.querySelector('.kw-remove[data-owner="' + owner + '"][data-idx="' + idx + '"]'); return b ? b.closest('.kw-row').textContent : ''; };

  const oN = select(at.NUMF);
  check('EDTCDE(J) on a conditioned field: no toggle, note shown, no warning (the field\'s own indicator is not the keyword\'s)',
    /EDTCDE/.test(rowText(oN, 0)) && !tog(oN, 0) && /No option indicators/.test(rowText(oN, 0)) && !d.querySelector('.kw-row .kw-cond-warning[data-idx="0"]'));
  check('DFT(0) hand-written with indicator 30: toggle kept and a warning names DFT', /DFT/.test(rowText(oN, 1)) && !!tog(oN, 1) && /DFT/.test((d.querySelector('.kw-cond-warning') || { textContent: '' }).textContent));
  check('RANGE(1 9): no toggle, note shown', /RANGE/.test(rowText(oN, 2)) && !tog(oN, 2) && /No option indicators/.test(rowText(oN, 2)));
  check('DUP (unlisted): keeps its Conditioning toggle', /DUP/.test(rowText(oN, 3)) && !!tog(oN, 3));

  const oD = select(at.DATF);
  check('DATFMT(*ISO) and DATSEP(\'-\'): no toggle, note shown', !tog(oD, 0) && !tog(oD, 1) && /No option indicators/.test(rowText(oD, 0)) && /No option indicators/.test(rowText(oD, 1)));
  const oC = select(at.CHRF);
  check('BLKFOLD: no toggle, note shown', /BLKFOLD/.test(rowText(oC, 0)) && !tog(oC, 0) && /No option indicators/.test(rowText(oC, 0)));
  const oT = select(at.TIMF);
  check('TIMFMT: no toggle, note shown', !tog(oT, 0) && /No option indicators/.test(rowText(oT, 0)));
  const oS = select(at.SNGF);
  check('SNGCHCFLD: no toggle, note shown', !tog(oS, 0) && /No option indicators/.test(rowText(oS, 0)));
  const oP = select(at.PSHF);
  check('PSHBTNFLD: no toggle, note shown', !tog(oP, 0) && /No option indicators/.test(rowText(oP, 0)));

  // ----- the pin: no structured field panel conditions any batch keyword -----
  console.log('\nPart 3b. structured field panels: no Conditioning control belongs to a batch keyword');
  const lower = BATCH.map((n) => n.toLowerCase());
  const seen = [];
  const sel = d.getElementById('recordSelect');
  ['REC1', 'SFLR'].forEach((recName) => {
    sel.value = recName;
    sel.dispatchEvent(new webDom.window.Event('change', { bubbles: true }));
    Array.from(d.querySelectorAll('.dspf-field')).forEach((b) => {
      b.click();
      const flag = Array.from(d.querySelectorAll('.kw-cond-toggle')).filter((e) => !e.getAttribute('data-owner')).map((e) => e.getAttribute('data-flag-id'));
      const rep = Array.from(d.querySelectorAll('.repeat-inst-cond-toggle')).map((e) => e.getAttribute('data-prefix'));
      seen.push({ flag: flag, rep: rep, field: b.getAttribute('data-source-line') });
    });
  });
  check('setup: the scan visited the fields of both records', seen.length >= 8);
  const stem = (id) => String(id).slice(String(id).lastIndexOf('-') + 1);
  const hits = [];
  seen.forEach((s) => {
    s.flag.forEach((id) => { if (lower.indexOf(stem(id)) >= 0) hits.push(id); });
    s.rep.forEach((p) => { if (lower.some((l) => String(p).indexOf('-' + l + '-') >= 0 || String(p).slice(-(l.length + 1)) === '-' + l)) hits.push(p); });
  });
  check('no flag row or repeatable row conditions any of the 35 (hits: ' + (hits.join(',') || 'none') + ')', hits.length === 0);
  check('pin: the same scan does see other field toggles (DUP, ENTFLDATR, ...), so it can find them', seen.some((s) => s.flag.some((id) => /-inp-dup$/.test(id))) && seen.some((s) => s.flag.some((id) => /-entfldatr$/.test(id))));

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 700);

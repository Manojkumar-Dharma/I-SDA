/**
 * i101MultiLevelNoOptionIndicators.test.js
 *
 * Task I-101, batch 4 - the keywords that exist at more than one level, and the
 * three whose sections word the rule differently. Batches 1-3 closed the raw
 * keyword editor's Conditioning toggle for keywords that live at ONE level. This
 * batch, following DDS_Keyword_V7r6.txt to the letter:
 *
 *   same rule at every level, so a name-keyed entry is right (12):
 *     CHANGE (record, field)            CHGINPDFT INDTXT VALNUM WRDWRAP (file, record, field)
 *     TEXT (record, field)              VLDCMDKEY (file, record)
 *     REFFLD SFLRCDNBR SFLROLVAL SFLSCROLL (field)     ALTNAME (record)
 *     HLPARA (help specification - the one level the earlier batches never
 *       touched; its four siblings say option indicators ARE valid)
 *   HLPTITLE: "not valid on a file-level HLPTITLE keyword ... allowed on
 *     record-level HLPTITLE keywords" -> level-aware: the raw editor's FILE-level
 *     list refuses, every other list is untouched.
 *   SFLMSGKEY: "not valid for this keyword OR WITH THE ASSOCIATED FIELD" -> the
 *     keyword entry, and a guard so a field that carries SFLMSGKEY takes no
 *     option indicators of its own (both directions, at commitEdit).
 *   SFLPGMQ: "Option indicators AND DISPLAY SIZE CONDITION NAMES are not valid"
 *     -> the entry, and a display-size condition counts as a violation too.
 * Held back / nothing to add: CSRLOC CHOICE GRDCLR HOME WDWTITLE MSGCON (valid),
 * MSGID and CHECK (conditional, own checks I-73 / I-30).
 *
 * Part 1: the table and the new helpers, checked AGAINST the reference text.
 * Part 2: the raw editor in a plain jsdom document.
 * Part 3: no structured panel puts a Conditioning control on any of them, and
 *         the record-level HLPTITLE panel stays conditionable (it is allowed).
 * Part 4: the real generated designer (file-level HLPTITLE, the SFLMSGKEY field
 *         guard through the real commitEdit).
 * Run with: node src/test/i101MultiLevelNoOptionIndicators.test.js
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

// keyword -> the levels its section(s) describe
const LEVELS = {
  ALTNAME: ['record'], CHANGE: ['field', 'record'], CHGINPDFT: ['field', 'file', 'record'], INDTXT: ['field', 'file', 'record'],
  REFFLD: ['field'], SFLRCDNBR: ['field'], SFLROLVAL: ['field'], SFLSCROLL: ['field'], TEXT: ['field', 'record'],
  VALNUM: ['field', 'file', 'record'], VLDCMDKEY: ['file', 'record'], WRDWRAP: ['field', 'file', 'record'],
};
const MULTI = Object.keys(LEVELS);
const SPECIAL = ['SFLMSGKEY', 'SFLPGMQ'];
const BATCH = MULTI.concat(['HLPARA'], SPECIAL);
const EARLIER = ['ALTHELP', 'ALTPAGEDWN', 'ALTPAGEUP', 'DSPRL', 'DSPSIZ', 'ERRSFL', 'HLPFULL', 'HLPSCHIDX', 'INDARA', 'MSGLOC', 'OPENPRT', 'PASSRCD', 'REF', 'USRDSPMGT', 'IGCALTTYP',
  'ALWROL', 'ASSUME', 'CLRL', 'GETRETAIN', 'GRDRCD', 'HLPCMDKEY', 'HLPSEQ', 'INZRCD', 'LOGINP', 'MNUBAR', 'PULLDOWN', 'RTNCSRLOC', 'RTNDTA', 'SETOF', 'SFL', 'SFLCTL', 'SFLENTER', 'SFLMLTCHC', 'SFLMODE', 'SFLRNA', 'SFLRTNSEL', 'SFLSNGCHC', 'SLNO', 'UNLOCK', 'USRDFN', 'SFLLIN', 'SFLMSGRCD', 'SFLPAG', 'SFLSIZ', 'WINDOW',
  'ALIAS', 'BLANKS', 'BLKFOLD', 'CHCACCEL', 'CHCCTL', 'CHKMSGID', 'CNTFLD', 'COMP', 'DLTCHK', 'DLTEDT', 'EDTCDE', 'EDTMSK', 'EDTWRD', 'FLDCSRPRG', 'FLTFIXDEC', 'HLPID', 'MLTCHCFLD', 'PSHBTNFLD', 'RANGE', 'SFLCHCCTL', 'SFLCSRPRG', 'SNGCHCFLD', 'VALUES',
  'CHRID', 'DATE', 'DATFMT', 'DATSEP', 'DFT', 'HTML', 'MAPVAL', 'SYSNAME', 'TIME', 'TIMFMT', 'TIMSEP', 'USER'];

// ===========================================================================
// Part 1 - the table and helpers, against the DDS Reference
// ===========================================================================
console.log('\nPart 1a. the table and the new helpers');
{
  const names = DspfWriter.noOptionIndicatorKeywordNames();
  check('every batch keyword is listed (15 = 12 multi/single-level + HLPARA + SFLMSGKEY + SFLPGMQ)', BATCH.length === 15 && BATCH.every((n) => names.indexOf(n) >= 0));
  check('batches 1-3 are still listed (80)', EARLIER.length === 80 && EARLIER.every((n) => names.indexOf(n) >= 0));
  check('nothing else is (95 = 15 + 80)', names.length === BATCH.length + EARLIER.length);
  check('each reason names its keyword and says "not valid"', BATCH.every((n) => {
    const r = DspfWriter.noOptionIndicatorsReason(n);
    return !!r && r.indexOf(n) >= 0 && /not valid/.test(r);
  }));
  check('SFLMSGKEY\'s reason says "or with the field it is on"', /with the field it is on/.test(DspfWriter.noOptionIndicatorsReason('SFLMSGKEY')));
  check('SFLPGMQ\'s reason says display size condition names are not valid either', /display size condition names are not valid/.test(DspfWriter.noOptionIndicatorsReason('SFLPGMQ')));
  const G1 = [{ indicators: [{ number: '01', not: false }] }];
  const DSC = [{ displaySizeCondition: { name: '*DS4', not: false }, indicators: [] }];
  check('the diff check fires for every batch keyword that gains an option indicator', BATCH.every((n) => !!DspfWriter.noOptionIndicatorsNewConflictReason(n, [], G1)));
  check('...but not for one that only loses it or is unchanged', BATCH.every((n) => DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, []) === null && DspfWriter.noOptionIndicatorsNewConflictReason(n, G1, G1) === null));
  check('a display-size condition is refused for SFLPGMQ only', !!DspfWriter.noOptionIndicatorsNewConflictReason('SFLPGMQ', [], DSC) && MULTI.concat(['HLPARA', 'SFLMSGKEY']).every((n) => DspfWriter.noOptionIndicatorsNewConflictReason(n, [], DSC) === null));
  check('...and an existing SFLPGMQ display-size condition is reported as present, and can be removed', !!DspfWriter.noOptionIndicatorsPresentReason('SFLPGMQ', DSC) && DspfWriter.noOptionIndicatorsNewConflictReason('SFLPGMQ', DSC, []) === null && DspfWriter.noOptionIndicatorsNewConflictReason('SFLPGMQ', DSC, DSC) === null);
  check('a display-size condition is NOT reported as present for the other batch keywords', MULTI.concat(['HLPARA']).every((n) => DspfWriter.noOptionIndicatorsPresentReason(n, DSC) === null));
  check('an option indicator is reported as present for every batch keyword', BATCH.every((n) => !!DspfWriter.noOptionIndicatorsPresentReason(n, G1)));
  // HLPTITLE - level-aware
  check('HLPTITLE is NOT in the every-level table (allowed on record-level ones)', names.indexOf('HLPTITLE') < 0 && DspfWriter.noOptionIndicatorsReason('HLPTITLE') === null && DspfWriter.noOptionIndicatorsReason('HLPTITLE', 'record') === null);
  check('...but it is refused at the file level', /file-level HLPTITLE/.test(DspfWriter.noOptionIndicatorsReason('HLPTITLE', 'file')) && DspfWriter.noOptionIndicatorFileLevelKeywordNames().join(',') === 'HLPTITLE');
  check('the file-level diff check fires for HLPTITLE, the record-level one does not', !!DspfWriter.noOptionIndicatorsNewConflictReason('HLPTITLE', [], G1, 'file') && DspfWriter.noOptionIndicatorsNewConflictReason('HLPTITLE', [], G1) === null && DspfWriter.noOptionIndicatorsNewConflictReason('HLPTITLE', [], G1, 'record') === null);
  check('the level argument changes nothing for an every-level keyword', DspfWriter.noOptionIndicatorsReason('TEXT', 'file') === DspfWriter.noOptionIndicatorsReason('TEXT'));
  check('unlisted keywords stay null (CSRLOC, CHOICE, GRDCLR, HOME, WDWTITLE, MSGCON, MSGID, CHECK, KEEP, DUP, HELP)', ['CSRLOC', 'CHOICE', 'GRDCLR', 'HOME', 'WDWTITLE', 'MSGCON', 'MSGID', 'CHECK', 'KEEP', 'DUP', 'HELP'].every((n) => DspfWriter.noOptionIndicatorsReason(n) === null));
}

console.log('\nPart 1b. the SFLMSGKEY field guard (sflmsgkeyFieldNewConflictReason)');
{
  const G1 = [{ indicators: [{ number: '01', not: false }] }];
  const G2 = [{ indicators: [{ number: '01', not: false }, { number: '02', not: false }] }];
  const kw = (n) => ({ name: n, parameters: '', conditions: [] });
  const plain = { keywords: [kw('SFLMSGKEY')], conditions: [] };
  const cond = { keywords: [kw('SFLMSGKEY')], conditions: G1 };
  const ordinary = { keywords: [kw('DUP')], conditions: [] };
  check('indicators added to a SFLMSGKEY field are refused', /not valid on a field that carries SFLMSGKEY/.test(DspfWriter.sflmsgkeyFieldNewConflictReason(plain, { conditions: G1 }) || ''));
  check('more indicators added to an already-conditioned SFLMSGKEY field are refused', !!DspfWriter.sflmsgkeyFieldNewConflictReason(cond, { conditions: G2 }));
  check('SFLMSGKEY added to a conditioned field is refused (reverse direction)', /cannot be added to a field that has option indicators/.test(DspfWriter.sflmsgkeyFieldNewConflictReason({ keywords: [], conditions: G1 }, { keywords: [kw('SFLMSGKEY')] }) || ''));
  check('...and both together in one edit are refused', !!DspfWriter.sflmsgkeyFieldNewConflictReason(ordinary, { keywords: [kw('SFLMSGKEY')], conditions: G1 }));
  check('removing the field\'s indicators is allowed', DspfWriter.sflmsgkeyFieldNewConflictReason(cond, { conditions: [] }) === null);
  check('leaving a hand-written field with both unchanged is not re-reported', DspfWriter.sflmsgkeyFieldNewConflictReason(cond, { conditions: G1 }) === null && DspfWriter.sflmsgkeyFieldNewConflictReason(cond, { usage: 'H' }) === null);
  check('removing SFLMSGKEY from a conditioned field is allowed', DspfWriter.sflmsgkeyFieldNewConflictReason(cond, { keywords: [] }) === null);
  check('an ordinary field takes indicators freely; an edit with neither key is ignored; bad input is null',
    DspfWriter.sflmsgkeyFieldNewConflictReason(ordinary, { conditions: G1 }) === null && DspfWriter.sflmsgkeyFieldNewConflictReason(plain, { name: 'X' }) === null &&
    DspfWriter.sflmsgkeyFieldNewConflictReason(null, { conditions: G1 }) === null && DspfWriter.sflmsgkeyFieldNewConflictReason(plain, null) === null);
}

console.log('\nPart 1c. every entry is backed by its own section of DDS_Keyword_V7r6.txt');
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
  // "You use this file-level, record-level, or field-level keyword" / "record-
  // or field-level keyword" -> the set of levels the phrase names
  const levelsOf = (s) => {
    const head = s.slice(0, 900);
    const i = head.search(/level keyword/i);
    if (i < 0) return null;
    const pre = head.slice(Math.max(0, i - 70), i + 5);
    const phrase = pre.slice(Math.max(pre.toLowerCase().lastIndexOf('this '), pre.toLowerCase().lastIndexOf('is a ')) + 1);
    const lv = Array.from(new Set((phrase.match(/file|record|field/gi) || []).map((x) => x.toLowerCase()))).sort();
    return lv.length ? lv : null;
  };
  const real = (n) => sections(n).filter((s) => levelsOf(s));
  MULTI.forEach((n) => {
    const secs = real(n);
    const lv = Array.from(new Set([].concat.apply([], secs.map(levelsOf)))).sort();
    check(n + ': described at exactly the levels ' + LEVELS[n].join('/') + ' (found ' + lv.join('/') + ')', JSON.stringify(lv) === JSON.stringify(LEVELS[n]));
    const text = secs.join(' ');
    check(n + ': says "Option indicators are not valid for this keyword"', /Option indicators are not valid for (?:this|these) keywords?\./.test(text) || /Option indicators are not valid for this keyword/.test(text));
    check(n + ': no section of it says option indicators ARE valid', !/Option indicators are (?:valid|allowed)/i.test(text));
    check(n + ': it does not mention display size conditions', !/display size condition/i.test(text));
  });
  const hara = sections('HLPARA').filter((x) => /help-specification-level keyword/.test(x.slice(0, 900))).join(' ');
  check('HLPARA: a help-specification-level keyword (the only level it exists at)', /You use this help-specification-level keyword/.test(hara));
  check('HLPARA: says "Option indicators are not valid for this keyword", no "valid" sentence', /Option indicators are not valid for this keyword\./.test(hara) && !/Option indicators are (?:valid|allowed)/i.test(hara));
  ['HLPPNLGRP', 'HLPEXCLD', 'HLPBDY', 'HLPDOC', 'HLPRCD'].forEach((n) => {
    check(n + ' (nothing to add): its section says option indicators ARE valid', /Option indicators are valid for this keyword\./.test(sections(n).filter((x) => /level keyword/.test(x.slice(0, 900))).join(' ')));
  });
  const hlp = real('HLPTITLE').join(' ');
  check('HLPTITLE: described at the file and record levels', JSON.stringify(Array.from(new Set([].concat.apply([], real('HLPTITLE').map(levelsOf)))).sort()) === JSON.stringify(['file', 'record']));
  check('HLPTITLE: "Option indicators are not valid on a file-level HLPTITLE keyword"', /Option indicators are not valid on a file-level HLPTITLE keyword/.test(hlp));
  check('HLPTITLE: "Option indicators are allowed on record-level HLPTITLE keywords"', /Option indicators are allowed on record-level HLPTITLE keywords/.test(hlp));
  const key = real('SFLMSGKEY').join(' ');
  check('SFLMSGKEY: field-level, "not valid for this keyword or with the associated field"', JSON.stringify(levelsOf(real('SFLMSGKEY')[0])) === JSON.stringify(['field']) && /Option indicators are not valid for this keyword or with the associated field/.test(key));
  const pgm = real('SFLPGMQ').join(' ');
  check('SFLPGMQ: field-level, "Option indicators and display size condition names are not valid for this keyword"', JSON.stringify(levelsOf(real('SFLPGMQ')[0])) === JSON.stringify(['field']) && /Option indicators and display size condition names are not valid for this keyword/.test(pgm));
  ['CSRLOC', 'CHOICE', 'GRDCLR', 'HOME', 'WDWTITLE'].forEach((n) => {
    check(n + ' (nothing to add): its section says option indicators ARE valid', /Option indicators are valid for this keyword/.test(real(n).join(' ')));
  });
  check('MSGCON (nothing to add): valid for the presence of the message', /they are valid for conditioning the presence or absence of the message/.test(real('MSGCON').join(' ')));
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
const DS = (name) => ({ displaySizeCondition: { name: name, not: false }, indicators: [] });

let OWNER = 'kwt';
function mount(keywords, owner) {
  OWNER = owner || 'kwt';
  const state = { keywords: keywords, changes: 0 };
  const expanded = new Set();
  const root = document.getElementById('root');
  function render() {
    root.innerHTML = Helpers.keywordEditorHtml(state.keywords, OWNER, expanded);
    Helpers.wireKeywordEditor(state.keywords, onChange, OWNER, expanded, render);
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
const toggleOf = (idx) => document.querySelector('.kw-cond-toggle[data-owner="' + OWNER + '"][data-idx="' + idx + '"]');
const rowOf = (idx) => { const t = document.querySelector('.kw-remove[data-owner="' + OWNER + '"][data-idx="' + idx + '"]'); return t ? t.closest('.kw-row') : null; };
const indicatorsOf = (k) => (k.conditions || []).reduce((n, g) => n + ((g.indicators || []).length), 0);

console.log('\nPart 2a. each of the 15, with no condition: no Conditioning toggle, a note instead');
BATCH.forEach((n) => {
  mount([kwd(n), kwd('DUP')]);
  check(n + ': no Conditioning toggle', !toggleOf(0));
  check(n + ': shows the "No option indicators" note', !!rowOf(0) && /No option indicators/.test(rowOf(0).textContent));
  check(n + ': the neighbouring unlisted keyword keeps its toggle', !!toggleOf(1));
  check(n + ': no warning', !document.querySelector('.kw-cond-warning'));
});

console.log('\nPart 2b. each of the 15, hand-written WITH an indicator: toggle kept, warning names the keyword, adding refused, removing allowed');
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

console.log('\nPart 2c. SFLPGMQ: a hand-written display-size condition is invalid too - warned, kept, removable');
{
  const st = mount([kwd('SFLPGMQ', '', [DS('*DS4')])]);
  check('the toggle is kept while it carries the condition', !!toggleOf(0) && !/No option indicators/.test(rowOf(0).textContent));
  check('a warning names SFLPGMQ and says display size condition names are not valid', !!document.querySelector('.kw-cond-warning') && /SFLPGMQ/.test(document.querySelector('.kw-cond-warning').textContent) && /display size condition names/.test(document.querySelector('.kw-cond-warning').textContent));
  click(toggleOf(0));
  const msg = withAlertCapture(() => click(document.querySelector('.cond-group-remove')));
  check('removing it is allowed, then the toggle is gone', !msg && st.keywords[0].conditions.length === 0 && !toggleOf(0));
  // contrast: the earlier display-size keyword (SFLSIZ, batch 2) is NOT warned for a *DS condition
  mount([kwd('SFLSIZ', '10', [DS('*DS4')])]);
  check('contrast: SFLSIZ with a *DS4 condition is not warned (it takes those)', !document.querySelector('.kw-cond-warning') && !!toggleOf(0));
  mount([kwd('TEXT', "'x'", [DS('*DS4')])]);
  check('contrast: TEXT with a *DS4 condition is not warned either (only indicators are invalid)', !document.querySelector('.kw-cond-warning'));
}

console.log('\nPart 2d. HLPTITLE is level-aware: refused in the FILE-level list, untouched everywhere else');
{
  let st = mount([kwd('HLPTITLE', "'T'")], 'file');
  check('file-level, no condition: no Conditioning toggle, a note', !toggleOf(0) && /No option indicators/.test(rowOf(0).textContent));
  st = mount([kwd('HLPTITLE', "'T'", [G('01')])], 'file');
  check('file-level, hand-written with an indicator: toggle kept and a warning names file-level HLPTITLE', !!toggleOf(0) && /file-level HLPTITLE/.test((document.querySelector('.kw-cond-warning') || { textContent: '' }).textContent));
  click(toggleOf(0));
  document.querySelector('.cond-add-row .cond-ind-num').value = '02';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('file-level: adding an indicator is refused', !!msg && /file-level HLPTITLE/.test(msg) && indicatorsOf(st.keywords[0]) === 1);
  const msg2 = withAlertCapture(() => click(document.querySelector('.cond-ind-remove')));
  check('file-level: removing it is allowed', !msg2 && indicatorsOf(st.keywords[0]) === 0);
  for (const owner of ['record-R', 'field-3', 'help-1']) {
    st = mount([kwd('HLPTITLE', "'T'")], owner);
    check(owner + ': the same keyword keeps its Conditioning toggle (allowed on record-level)', !!toggleOf(0) && !/No option indicators/.test(rowOf(0).textContent));
    click(toggleOf(0));
    const before = st.changes;
    document.querySelector('.cond-add-group').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const num = document.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    num.value = '05';
    const m = withAlertCapture(() => click(document.querySelector('.cond-group[data-group="pending"] .cond-ind-add')));
    check(owner + ': an indicator can be added, no alert', !m && st.changes === before + 1 && indicatorsOf(st.keywords[0]) === 1);
  }
  st = mount([kwd('HLPARA', '*RCD')], 'help-1');
  check('help-entry raw editor: HLPARA has no Conditioning toggle, a note instead', !toggleOf(0) && /No option indicators/.test(rowOf(0).textContent));
  st = mount([kwd('TEXT', "'x'")], 'file');
  check('a file-level list gives every-level keywords the same treatment as before (TEXT: note, no toggle)', !toggleOf(0) && /No option indicators/.test(rowOf(0).textContent));
}

console.log('\nPart 2e. adding a batch keyword through "+ Add keyword" still works, unconditioned');
{
  const st = mount([]);
  document.getElementById('kwt-new-kw-name').value = 'TEXT';
  document.getElementById('kwt-new-kw-params').value = "'Customer name'";
  const msg = withAlertCapture(() => click(document.querySelector('.kw-add[data-owner="kwt"]')));
  check('no alert; added, unconditioned, no toggle', !msg && st.keywords.length === 1 && st.keywords[0].name === 'TEXT' && !toggleOf(0));
}

console.log('\nPart 2f. keywords that need no entry are unchanged (CSRLOC, CHOICE, GRDCLR, HOME, WDWTITLE, MSGCON)');
{
  const names = ['CSRLOC', 'CHOICE', 'GRDCLR', 'HOME', 'WDWTITLE', 'MSGCON'];
  const st = mount(names.map((n, i) => kwd(n, '', [G('0' + (i + 1))])));
  check('no warnings, all six keep their toggles', !document.querySelector('.kw-cond-warning') && names.every((n, i) => !!toggleOf(i)));
  click(toggleOf(0));
  const before = st.changes;
  document.querySelector('.cond-add-row .cond-ind-num').value = '09';
  const msg = withAlertCapture(() => click(document.querySelector('.cond-ind-add')));
  check('an indicator can still be added to CSRLOC', !msg && st.changes === before + 1);
}

// ===========================================================================
// Part 3 - structured panels
// ===========================================================================
console.log('\nPart 3. structured panels: no Conditioning control belongs to a batch keyword; record-level HLPTITLE stays conditionable');
{
  const expanded = new Set();
  const all = BATCH.concat(['HLPTITLE']).map((n) => kwd(n, n === 'TEXT' ? "'x'" : ''));
  const inst = [kwd('CHANGE', '10'), kwd('INDTXT', "10 'x'"), kwd('VLDCMDKEY', '10'), kwd('SETOF', '10')];
  const scan = (panels) => {
    const html = Object.keys(panels).map((k) => (typeof panels[k] === 'string' ? panels[k] : '')).join('');
    const d = new dom.window.DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    return {
      flag: Array.from(d.querySelectorAll('.kw-cond-toggle')).map((e) => e.getAttribute('data-flag-id')).filter(Boolean),
      rep: Array.from(d.querySelectorAll('.repeat-inst-cond-toggle')).map((e) => e.getAttribute('data-prefix')),
    };
  };
  const builders = {
    'file keywords': scan(Helpers.fileKeywordsPanelsHtml(all, expanded)),
    'record keywords + instances': scan(Helpers.recordKeywordsPanelsHtml(all.concat(inst), 'rk-R', expanded)),
    'SFL tab': scan(Helpers.sflKeywordsPanelsHtml([kwd('SFL')].concat(inst), 'sfl-R', expanded)),
    'SFLCTL tab': scan(Helpers.sflCtlPanelsHtml({ name: 'R', keywords: [kwd('SFLCTL')].concat(inst), fields: [] }, 'sflctl-R', expanded, [])),
    'SFLMSG tab': scan(Helpers.sflMsgPanelsHtml({ name: 'R', keywords: [kwd('SFL'), kwd('SFLMSGRCD', 'X')].concat(inst), fields: [] }, expanded, [])),
    'MNUBAR tab': scan(Helpers.mnuBarPanelsHtml([kwd('MNUBAR')].concat(inst), 'mnubar-R', expanded, [])),
    'Pull-down tab': scan(Helpers.pulldownPanelsHtml([kwd('PULLDOWN')].concat(inst), 'rpd-R', expanded)),
    'Window tab': scan(Helpers.windowPanelsHtml([kwd('WINDOW', '1 1 5 5')].concat(inst), 'rw-R', expanded)),
  };
  const lower = BATCH.map((n) => n.toLowerCase());
  const stem = (id) => String(id).slice(String(id).lastIndexOf('-') + 1);
  Object.keys(builders).forEach((label) => {
    const b = builders[label];
    const hits = b.flag.filter((id) => lower.indexOf(stem(id)) >= 0)
      .concat(b.rep.filter((p) => lower.some((l) => String(p).indexOf('-' + l + '-') >= 0 || String(p).slice(-(l.length + 1)) === '-' + l)));
    check(label + ': no toggle belongs to a batch keyword (' + (b.flag.length + b.rep.length) + ' toggles, hits: ' + (hits.join(',') || 'none') + ')', hits.length === 0);
  });
  const rec = Helpers.recordIndicatorInstancesHtml(inst, 'rk-R-recind', expanded);
  check('CHANGE / INDTXT / VLDCMDKEY / SETOF rows in the record-indicator list carry no Conditioning toggle', !/repeat-inst-cond-toggle/.test(rec));
  check('the record-level HLPTITLE panel is still conditionable (allowed on record-level)', builders['record keywords + instances'].rep.some((p) => /-hlptitle-rep$/.test(p)));
  const help = scan({ h: Helpers.applicationHelpFieldsHtml([kwd('HLPARA', '*RCD'), kwd('HLPPNLGRP', 'M G L'), kwd('HLPEXCLD'), kwd('HLPBDY')], 'help-7', expanded) });
  check('help-entry panel: HLPARA has no Conditioning toggle (its section says not valid)', !help.flag.some((id) => /-hlpara$/.test(id)));
  check('help-entry panel: HLPPNLGRP, HLPEXCLD and HLPBDY keep theirs (their sections say valid)', ['hlppnlgrp', 'hlpexcld', 'hlpbdy'].every((k) => help.flag.some((id) => new RegExp('-' + k + '$').test(id))));
  check('pin: the file-level panels draw no HLPTITLE panel at all', !builders['file keywords'].rep.some((p) => /hlptitle/.test(p)));
  check('pin: the scan does find other toggles (record: csrloc; file: invite), so it can see them', builders['record keywords + instances'].flag.some((id) => /-csrloc$/.test(id)) && builders['file keywords'].flag.some((id) => /-invite$/.test(id)));
}

// ===========================================================================
// Part 4 - the real generated designer
// ===========================================================================
const lines = [];
const at = {};
function add(name, spec) { at[name] = lines.length + 1; lines.push(buildLine(Object.assign({ seq: String((lines.length + 1) * 10).padStart(5, '0') }, spec))); }
add('FILE_HLP', { func: "HLPTITLE('Help')" });
add('R1', { nameType: 'R', name: 'REC1' });
add('PLAINF', { name: 'PLAINF', length: '10', dataType: 'A', usage: 'B', line: '3', col: '2', func: 'DUP' });
add('KEYF', { name: 'KEYF', length: '4', dataType: 'S', decimals: '0', usage: 'B', line: '5', col: '2', func: 'SFLMSGKEY' });
add('CONDF', { ind1: 'N10', name: 'CONDF', length: '10', dataType: 'A', usage: 'B', line: '7', col: '2', func: 'DUP' });
add('TEXTF', { name: 'TEXTF', length: '10', dataType: 'A', usage: 'B', line: '9', col: '2', func: "TEXT('Name')" });
add('R2', { nameType: 'R', name: 'REC2', func: "HLPTITLE('Record help')" });
add('R2F', { name: 'R2F', length: '5', dataType: 'A', usage: 'B', line: '2', col: '2' });
const SRC = lines.join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce101d', SRC, 'I101D.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);
const errors = [];
const alerts = [];
const posted = [];
const webDom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => alerts.push(String(m));
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const d = webDom.window.document;
  const Ev = webDom.window.Event;
  const parsed = DspfParser.parseDspf(SRC);
  console.log('\nPart 4. real designer');
  check('setup: a file-level HLPTITLE, a SFLMSGKEY field, a conditioned (N10) field, a TEXT field and a record-level HLPTITLE parsed',
    parsed.fileKeywords.some((k) => k.name === 'HLPTITLE') && parsed.records[0].fields.find((f) => f.name === 'KEYF').keywords[0].name === 'SFLMSGKEY' &&
    parsed.records[0].fields.find((f) => f.name === 'CONDF').conditions.length === 1 && parsed.records[1].keywords.some((k) => k.name === 'HLPTITLE'));

  // ----- file-level raw editor -----
  // The file-level Properties view is opened from the "File" breadcrumb.
  const crumb = d.getElementById('crumb-file');
  if (crumb) crumb.dispatchEvent(new Ev('click', { bubbles: true }));
  const fb = d.querySelector('.kw-remove[data-owner="file"][data-idx="0"]');
  const fh = fb ? fb.closest('.kw-row') : null;
  check('file-level raw editor: HLPTITLE has no Conditioning toggle and shows the note', !!fh && /HLPTITLE/.test(fh.textContent) && !fh.querySelector('.kw-cond-toggle') && /No option indicators/.test(fh.textContent));

  // ----- record-level HLPTITLE stays conditionable -----
  const sel = d.getElementById('recordSelect');
  sel.value = 'REC2';
  sel.dispatchEvent(new Ev('change', { bubbles: true }));
  check('record-level HLPTITLE panel still has its Conditioning toggle', !!d.querySelector('.repeat-inst-cond-toggle[data-prefix$="-hlptitle-rep"]'));
  sel.value = 'REC1';
  sel.dispatchEvent(new Ev('change', { bubbles: true }));

  const select = (line) => {
    const box = Array.from(d.querySelectorAll('.dspf-field')).find((b) => b.getAttribute('data-source-line') === String(line));
    if (box) box.click();
    return !!box;
  };
  const edits = () => posted.filter((m) => m.type === 'applyEdit').length;
  const addFieldIndicator = (groupSel, num) => {
    const g = d.querySelector('.cond-group[data-group="' + groupSel + '"]');
    if (!g) return false;
    g.querySelector('.cond-ind-num').value = num;
    g.querySelector('.cond-ind-add').dispatchEvent(new Ev('click', { bubbles: true }));
    return true;
  };

  // ----- TEXT field: chip has no toggle -----
  check('setup: the TEXT field box exists', select(at.TEXTF));
  const tr = Array.from(d.querySelectorAll('.kw-remove[data-owner="field-' + at.TEXTF + '"]')).map((b) => b.closest('.kw-row'))[0];
  check('a field-level TEXT chip has no Conditioning toggle, a note instead', !!tr && !tr.querySelector('.kw-cond-toggle') && /No option indicators/.test(tr.textContent));

  // ----- SFLMSGKEY field guard, forward direction -----
  check('setup: the SFLMSGKEY field box exists', select(at.KEYF));
  const kr = d.querySelector('.kw-remove[data-owner="field-' + at.KEYF + '"]').closest('.kw-row');
  check('SFLMSGKEY chip: no Conditioning toggle, a note instead', !kr.querySelector('.kw-cond-toggle') && /No option indicators/.test(kr.textContent));
  let a0 = alerts.length, e0 = edits();
  d.querySelector('.cond-add-group[data-prefix="field"]').dispatchEvent(new Ev('click', { bubbles: true }));
  const added = addFieldIndicator('pending', '05');
  check('setup: the field Conditioning editor took the click', added);
  check('an indicator on the SFLMSGKEY field itself is refused with an alert, and no edit is posted',
    alerts.length === a0 + 1 && /not valid on a field that carries SFLMSGKEY/.test(alerts[alerts.length - 1]) && edits() === e0);

  // ----- control: an ordinary field takes the same indicator -----
  select(at.PLAINF);
  a0 = alerts.length; e0 = edits();
  d.querySelector('.cond-add-group[data-prefix="field"]').dispatchEvent(new Ev('click', { bubbles: true }));
  addFieldIndicator('pending', '05');
  check('control: the same indicator on an ordinary field is accepted (an edit is posted, no alert)', alerts.length === a0 && edits() === e0 + 1);

  // ----- SFLMSGKEY field guard, reverse direction (raw editor add onto a conditioned field) -----
  select(at.CONDF);
  a0 = alerts.length; e0 = edits();
  d.getElementById('field-' + at.CONDF + '-new-kw-name').value = 'SFLMSGKEY';
  d.getElementById('field-' + at.CONDF + '-new-kw-params').value = '';
  d.querySelector('.kw-add[data-owner="field-' + at.CONDF + '"]').dispatchEvent(new Ev('click', { bubbles: true }));
  check('adding SFLMSGKEY to a conditioned (N10) field through the raw editor is refused, and no edit is posted',
    alerts.length === a0 + 1 && /cannot be added to a field that has option indicators/.test(alerts[alerts.length - 1]) && edits() === e0);

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 700);

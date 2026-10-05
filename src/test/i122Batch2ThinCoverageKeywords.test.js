/**
 * i122Batch2ThinCoverageKeywords.test.js
 *
 * Task I-122, batch 2 - the keywords mentioned in the fewest test files
 * (found by counting mentions of every RECORD_TYPES name across src/test/):
 * MSGALARM, CSRINPONLY, RETLCKSTS, MAPVAL, INZINP and HLPEXCLD.  Each cell
 * is traced to the keyword's own DDS Reference section (DDS_Keyword_V7r6.txt):
 *
 *   MSGALARM    file- or record-level, no parameters, option indicators valid.
 *   CSRINPONLY  file- or record-level, no parameters, option indicators valid.
 *   RETLCKSTS   record-level only, no parameters, option indicators valid.
 *   MAPVAL      field-level, only for date (L), time (T) and timestamp (Z)
 *               fields; option indicators are NOT valid on the keyword.
 *   INZINP      record-level, no parameters; needs PUTOVR, OVERLAY and
 *               ERASEINP(*ALL) on the same record.
 *   HLPEXCLD    help-specification-level, no parameters, only on an H
 *               specification that has HLPPNLGRP, not together with HLPBDY.
 *
 * KEYBRD was in the first candidate list but is not a DDS keyword (the spec
 * records it as position 35 of the DDS specification), so it is not tested here.
 *
 *  L1/L2 writer: parse, flag round trip, neighbours untouched, conditions kept.
 *  L3    display: which level shows which row, saved state, Conditioning
 *        toggle present or absent as the spec says.
 *  L4    commit paths: checkbox, Conditioning, raw keyword editor, and an
 *        unrelated edit leaves the keyword (and its indicator) intact.
 *
 * Run with: node src/test/i122Batch2ThinCoverageKeywords.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// Fixed-column DDS line builder (see i122NoTestKeywordsBatch1.test.js).
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.ind) { put(8, o.neg ? 'N' : ' '); put(9, o.ind); }
  if (o.rec) put(17, 'R');
  if (o.h) put(17, 'H');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}

const SOURCE = [
  dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
  dds({ ind: '05', fn: 'MSGALARM' }),
  dds({ fn: 'CSRINPONLY' }),
  dds({ rec: 1, name: 'R1' }),
  dds({ ind: '12', fn: 'MSGALARM' }),
  dds({ fn: 'CSRINPONLY' }),
  dds({ ind: '13', neg: 1, fn: 'RETLCKSTS' }),
  dds({ name: 'F1', len: 10, type: 'A', usage: 'B', line: 2, pos: 2 }),
  dds({ rec: 1, name: 'R2' }),
  dds({ name: 'D1', len: 8, type: 'L', usage: 'B', line: 3, pos: 2, fn: "DATFMT(*MDY) DATSEP('/')" }),
  dds({ fn: "MAPVAL(('01/01/40' *BLANK))" }),
  dds({ name: 'A1', len: 10, type: 'A', usage: 'B', line: 5, pos: 2 }),
].join('\n') + '\n';

const model = DspfParser.parseDspf(SOURCE);
const rec = (name) => model.records.find((r) => r.name === name);
const kwOf = (kws, name) => (kws || []).find((k) => k.name === name);
const names = (kws) => kws.map((k) => k.name);
const fld = (r, n) => r.fields.find((f) => f.name === n);

console.log('=== spec: what the DDS Reference says about each keyword ===');
{
  const T = KeywordSpec.RECORD_TYPES;
  check('MSGALARM: file and record level, no parameters, option indicators valid', T.MSGALARM.levels.join() === 'file,record' && T.MSGALARM.parameters === 'none' && T.MSGALARM.optionIndicators === 'valid');
  check('CSRINPONLY: file and record level, no parameters, option indicators valid', T.CSRINPONLY.levels.join() === 'file,record' && T.CSRINPONLY.parameters === 'none' && T.CSRINPONLY.optionIndicators === 'valid');
  check('RETLCKSTS: record level only, no parameters, option indicators valid', T.RETLCKSTS.levels.join() === 'record' && T.RETLCKSTS.noParameters === true && T.RETLCKSTS.optionIndicators === 'valid');
  check('MAPVAL: date, time and timestamp fields only', T.MAPVAL.requiredDataTypes.join() === 'L,T,Z');
  check('INZINP: record level, no parameters, needs PUTOVR / OVERLAY / ERASEINP(*ALL)', T.INZINP.levels.join() === 'record' && T.INZINP.noParameters === true && T.INZINP.requiresOnRecord.join() === 'PUTOVR,OVERLAY,ERASEINP(*ALL)');
  check('HLPEXCLD: help-specification level, no parameters, needs HLPPNLGRP', T.HLPEXCLD.levels.join() === 'help' && T.HLPEXCLD.noParameters === true && T.HLPEXCLD.requiresOnHelpSpecification.join() === 'HLPPNLGRP');
  check('HLPEXCLD and HLPBDY are mutually exclusive on one H specification', T.HLPEXCLD.atMostOneOfPerHelpSpecification.join() === 'HLPBDY,HLPEXCLD');
  check('KEYBRD is recorded as not a DDS keyword', T.KEYBRD.notADdsKeyword === true);
  // takesNoParameters / optionIndicatorsAllowed read only the I-121b table, so they
  // answer for RETLCKSTS and INZINP but not for the others; that gap is logged as a
  // finding in keywordFixes.md and deliberately not asserted here.
  check('the accessors agree with the spec for the two I-121b keywords (RETLCKSTS, INZINP)', ['RETLCKSTS', 'INZINP'].every((k) => DspfWriter.takesNoParameters(k) && DspfWriter.optionIndicatorsAllowed(k)));
}

console.log('\n=== L1/L2 writer: parse and flag round trip ===');
{
  check('file level: MSGALARM parsed with indicator 05, CSRINPONLY bare', kwOf(model.fileKeywords, 'MSGALARM').conditions[0].indicators[0].number === '05' && kwOf(model.fileKeywords, 'CSRINPONLY').conditions.length === 0);
  check('record level: MSGALARM(12), CSRINPONLY, RETLCKSTS with N13 parsed on R1', kwOf(rec('R1').keywords, 'MSGALARM').conditions[0].indicators[0].number === '12' && !!kwOf(rec('R1').keywords, 'CSRINPONLY') && (() => { const i = kwOf(rec('R1').keywords, 'RETLCKSTS').conditions[0].indicators[0]; return i.number === '13' && i.not === true; })());
  check('none of the three carries parameters', ['MSGALARM', 'CSRINPONLY', 'RETLCKSTS'].every((k) => kwOf(rec('R1').keywords, k).parameters.trim() === ''));
  check('MAPVAL parsed on the date field with its parameter text intact', kwOf(fld(rec('R2'), 'D1').keywords, 'MAPVAL').parameters.trim() === "('01/01/40' *BLANK)");
  check('MAPVAL is absent on R2\'s alpha field', !kwOf(fld(rec('R2'), 'A1').keywords, 'MAPVAL'));

  const g = (kws, n) => DspfWriter.getFileFlagKeyword(kws, n);
  check('getFileFlagKeyword reads each flag and its conditions', g(rec('R1').keywords, 'RETLCKSTS').present && g(rec('R1').keywords, 'RETLCKSTS').conditions.length === 1 && g(model.fileKeywords, 'MSGALARM').conditions.length === 1);
  check('...and reports absent ones as not present', !g(rec('R2').keywords, 'RETLCKSTS').present && !g(rec('R2').keywords, 'MSGALARM').present);

  const added = DspfWriter.setFileFlagKeyword(rec('R2').keywords, 'RETLCKSTS', true, '', undefined, undefined);
  check('RETLCKSTS is added as a bare keyword', names(added).join() === 'RETLCKSTS' && added[0].parameters.trim() === '');
  const removed = DspfWriter.setFileFlagKeyword(rec('R1').keywords, 'MSGALARM', false, '', undefined, undefined);
  check('removing MSGALARM leaves CSRINPONLY and RETLCKSTS exactly as they were', names(removed).join() === 'CSRINPONLY,RETLCKSTS' && removed[1].conditions.length === 1);
  const again = DspfWriter.setFileFlagKeyword(rec('R1').keywords, 'CSRINPONLY', true, '', undefined, undefined);
  check('turning an already-present flag on again is idempotent', again.filter((k) => k.name === 'CSRINPONLY').length === 1 && again.length === rec('R1').keywords.length);
  const kept = DspfWriter.setFileFlagKeyword(rec('R1').keywords, 'MSGALARM', true, '', undefined, undefined);
  check('...and the indicator on the existing MSGALARM is kept', kwOf(kept, 'MSGALARM').conditions[0].indicators[0].number === '12');
  const cond = DspfWriter.setFileFlagKeyword(rec('R2').keywords, 'CSRINPONLY', true, '', undefined, [{ indicators: [{ number: '40', negated: false }] }]);
  check('a condition passed in is kept on the new keyword', kwOf(cond, 'CSRINPONLY').conditions[0].indicators[0].number === '40');
  const fileOff = DspfWriter.setFileFlagKeyword(model.fileKeywords, 'CSRINPONLY', false, '', undefined, undefined);
  check('file level: removing CSRINPONLY leaves MSGALARM(05) alone', names(fileOff).join() === 'DSPSIZ,MSGALARM' && fileOff[1].conditions.length === 1);
}

console.log('\n=== L1 INZINP: needs PUTOVR, OVERLAY and ERASEINP(*ALL) ===');
{
  const text = (kws) => [dds({ rec: 1, name: 'RI' })].concat(kws.map((k) => dds({ fn: k }))).concat([dds({ name: 'X', len: 5, type: 'A', usage: 'B', line: 1, pos: 1 })]).join('\n') + '\n';
  const parse = (kws) => DspfParser.parseDspf(text(kws));
  const none = parse([]);
  const full = parse(['PUTOVR', 'OVERLAY', 'ERASEINP(*ALL)', 'INZINP']);
  const noOverlay = parse(['PUTOVR', 'ERASEINP(*ALL)', 'INZINP']);
  const wrongErase = parse(['PUTOVR', 'OVERLAY', 'ERASEINP(1)', 'INZINP']);
  check('INZINP with all three requirements is accepted', DspfWriter.initRetainReturnNewConflictReason(none, full) === null);
  const r1 = DspfWriter.initRetainReturnNewConflictReason(none, noOverlay);
  check('INZINP without OVERLAY is refused, naming INZINP and OVERLAY', !!r1 && /INZINP/.test(r1) && /OVERLAY/.test(r1));
  const r2 = DspfWriter.initRetainReturnNewConflictReason(none, wrongErase);
  check('INZINP with ERASEINP(1) instead of ERASEINP(*ALL) is refused', !!r2 && /ERASEINP/.test(r2));
  check('an already-invalid hand-written record is not re-reported by an unchanged edit', DspfWriter.initRetainReturnNewConflictReason(noOverlay, noOverlay) === null);
  check('removing OVERLAY from a valid INZINP record is refused (the other direction)', !!DspfWriter.initRetainReturnNewConflictReason(full, noOverlay));
}

console.log('\n=== L1 HLPEXCLD: only with HLPPNLGRP, not with HLPBDY ===');
{
  const hs = (kws) => DspfParser.parseDspf([dds({ rec: 1, name: 'RH' }), dds({ h: 1, fn: 'HLPARA(1 2 3 4)' })].concat(kws.map((k) => dds({ fn: k }))).concat([dds({ name: 'X', len: 5, type: 'A', usage: 'B', line: 1, pos: 1 })]).join('\n') + '\n');
  const base = hs(['HLPPNLGRP(R1 PNLA)']);
  const ok = hs(['HLPPNLGRP(R1 PNLA)', 'HLPEXCLD']);
  const noPnl = hs(['HLPEXCLD']);
  const both = hs(['HLPPNLGRP(R1 PNLA)', 'HLPBDY', 'HLPEXCLD']);
  check('HLPEXCLD beside HLPPNLGRP is accepted', DspfWriter.helpSpecNewConflictReason(base, ok) === null);
  const a = DspfWriter.helpSpecNewConflictReason(base, noPnl);
  check('HLPEXCLD on an H specification without HLPPNLGRP is refused', !!a);
  const b = DspfWriter.helpSpecNewConflictReason(ok, both);
  check('adding HLPBDY beside HLPEXCLD is refused, naming both', !!b && /HLPBDY/.test(b) && /HLPEXCLD/.test(b));
  check('an already-invalid hand-written H specification is not re-reported', DspfWriter.helpSpecNewConflictReason(noPnl, noPnl) === null);
}

console.log('\n=== L3/L4 the panels (jsdom) ===');
const html = webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF');
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const sel = doc.getElementById('recordSelect');
  const selectRecord = (name) => { sel.value = name; fire(sel); };
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const parsed = (text) => (text ? DspfParser.parseDspf(text) : null);
  const recFrom = (text, name) => (text ? parsed(text).records.find((r) => r.name === name) : null);
  const toggle = (id, on) => { const el = doc.getElementById(id + '-on'); posted.length = 0; el.checked = on; fire(el); return lastText(); };
  const condToggle = (flagId) => doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  const raw = (owner, name, params) => {
    doc.getElementById(owner + '-new-kw-name').value = name;
    doc.getElementById(owner + '-new-kw-params').value = params || '';
    posted.length = 0;
    fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
    return lastText();
  };

  console.log('  -- record level: saved keywords are displayed');
  selectRecord('R1');
  check('R1: MSGALARM, CSRINPONLY and RETLCKSTS rows show checked', ['msgalarm', 'csrinponly', 'retlcksts'].every((k) => doc.getElementById('rk-R1-' + k + '-on') && doc.getElementById('rk-R1-' + k + '-on').checked));
  check('R1: Conditioning count (1) on MSGALARM and RETLCKSTS, none on CSRINPONLY', /Conditioning\s*\(1\)/.test(condToggle('rk-R1-msgalarm').textContent) && /Conditioning\s*\(1\)/.test(condToggle('rk-R1-retlcksts').textContent) && !/\(1\)/.test(condToggle('rk-R1-csrinponly').textContent));
  selectRecord('R2');
  check('R2: the same three rows exist and are unchecked', ['msgalarm', 'csrinponly', 'retlcksts'].every((k) => doc.getElementById('rk-R2-' + k + '-on') && !doc.getElementById('rk-R2-' + k + '-on').checked));
  check('the record rows are labelled with their DDS names', /\(MSGALARM\)/.test(doc.body.innerHTML) && /\(CSRINPONLY\)/.test(doc.body.innerHTML) && /\(RETLCKSTS\)/.test(doc.body.innerHTML));

  console.log('  -- record level: checkbox commits');
  {
    const t = toggle('rk-R2-retlcksts', true);
    const r = recFrom(t, 'R2');
    check('RETLCKSTS on R2: written as a bare keyword; the field and its MAPVAL untouched', !!r && names(r.keywords).join() === 'RETLCKSTS' && kwOf(fld(r, 'D1').keywords, 'MAPVAL').parameters.trim() === "('01/01/40' *BLANK)");
    check('the first keyword of a keyword-less record goes on the record-format line itself', t.split('\n').includes(dds({ rec: 1, name: 'R2', fn: 'RETLCKSTS' })));
    check('R1 was not touched by an edit on R2', recFrom(t, 'R1').keywords.length === rec('R1').keywords.length);
    const t2 = toggle('rk-R2-retlcksts', false);
    check('RETLCKSTS off returns the source to its original text', t2 === SOURCE);
    selectRecord('R1');
    const t3 = toggle('rk-R1-msgalarm', false);
    const r3 = recFrom(t3, 'R1');
    check('MSGALARM off removes it and its indicator line; the other two stay with their conditions', !!r3 && names(r3.keywords).join() === 'CSRINPONLY,RETLCKSTS' && !/12.*MSGALARM/.test(t3) && kwOf(r3.keywords, 'RETLCKSTS').conditions.length === 1);
    check('the file-level MSGALARM(05) was not touched by the record edit', kwOf(parsed(t3).fileKeywords, 'MSGALARM').conditions[0].indicators[0].number === '05');
    selectRecord('R1');
    const t4 = toggle('rk-R1-msgalarm', true);
    const r4 = recFrom(t4, 'R1');
    check('MSGALARM on again is a bare unconditioned keyword at record level', !!r4 && kwOf(r4.keywords, 'MSGALARM').conditions.length === 0 && kwOf(r4.keywords, 'MSGALARM').parameters.trim() === '');
  }

  console.log('  -- record level: Conditioning (option indicators)');
  {
    selectRecord('R2');
    // The flag is off, so conditioning needs the keyword on first.
    const on = toggle('rk-R2-csrinponly', true);
    check('CSRINPONLY on R2 is written first (the precondition for conditioning it)', !!recFrom(on, 'R2') && !!kwOf(recFrom(on, 'R2').keywords, 'CSRINPONLY'));
    selectRecord('R2');
    fire(condToggle('rk-R2-csrinponly'), 'click');
    fire(doc.querySelector('.cond-add-group[data-prefix="rk-R2-csrinponly-cond"]'), 'click');
    doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = '07';
    posted.length = 0;
    fire(doc.querySelector('.cond-ind-add[data-prefix="rk-R2-csrinponly-cond"][data-group="pending"]'), 'click');
    const t = lastText();
    check('CSRINPONLY conditioned on indicator 07 (option indicators are valid for it)', (t || '').split('\n').some((l) => /^ {5}A  07 {2}.*CSRINPONLY$/.test(l) || l === dds({ ind: '07', fn: 'CSRINPONLY' })) && kwOf(recFrom(t, 'R2').keywords, 'CSRINPONLY').conditions[0].indicators[0].number === '07');
  }

  console.log('  -- record level: raw keyword editor');
  {
    selectRecord('R1');
    const t = raw('record-R1', 'MSGALARM');
    check('raw-adding a second MSGALARM to R1 does not drop the existing flags', !t || ['CSRINPONLY', 'RETLCKSTS'].every((k) => kwOf(recFrom(t, 'R1').keywords, k)));
    selectRecord('R2');
    const t2 = raw('record-R2', 'RETLCKSTS');
    check('raw-adding RETLCKSTS on R2 is accepted as a bare keyword', !!t2 && !!kwOf(recFrom(t2, 'R2').keywords, 'RETLCKSTS') && kwOf(recFrom(t2, 'R2').keywords, 'RETLCKSTS').parameters.trim() === '');
  }

  console.log('  -- file level');
  {
    fire(doc.getElementById('crumb-file'), 'click');
    check('the file panel has MSGALARM and CSRINPONLY rows, both checked', ['msgalarm', 'csrinponly'].every((k) => doc.getElementById('fk-' + k + '-on') && doc.getElementById('fk-' + k + '-on').checked));
    check('the file panel has no RETLCKSTS row (record-level only)', !doc.getElementById('fk-retlcksts-on'));
    check('MSGALARM shows its Conditioning count (1) at file level, CSRINPONLY has a toggle too', /Conditioning\s*\(1\)/.test(condToggle('fk-msgalarm').textContent) && !!condToggle('fk-csrinponly'));
    const t = toggle('fk-csrinponly', false);
    const p = parsed(t);
    check('file level: CSRINPONLY off removes only it; MSGALARM(05) and every record stay', !!p && names(p.fileKeywords).join() === 'DSPSIZ,MSGALARM' && kwOf(p.fileKeywords, 'MSGALARM').conditions.length === 1 && p.records.length === 2);
    check('...and the record-level CSRINPONLY on R1 was not touched', !!kwOf(recFrom(t, 'R1').keywords, 'CSRINPONLY'));
    const t2 = toggle('fk-csrinponly', true);
    check('file level: CSRINPONLY on again is a bare file-level keyword', names(parsed(t2).fileKeywords).includes('CSRINPONLY'));
  }

  console.log('  -- MAPVAL (field level, date / time / timestamp only)');
  {
    // Back to the record view and select the date field D1.
    const crumbRecord = doc.querySelector('.crumb:not(.current):not(#crumb-file)');
    selectRecord('R2');
    const d1 = doc.querySelector('#screenOutput .dspf-field[data-field="D1"]');
    check('D1 is on the preview canvas', !!d1);
    if (d1) fire(d1, 'click');
    const ids = Array.from(doc.querySelectorAll('[id]')).map((e) => e.id).filter((i) => /gen-mapval-(on|params)$/.test(i));
    check('the date field shows a MAPVAL row with a text box', ids.length === 2);
    const onId = ids.find((i) => /-on$/.test(i));
    const parId = ids.find((i) => /-params$/.test(i));
    check('MAPVAL shows checked with its saved parameter text', doc.getElementById(onId).checked && doc.getElementById(parId).value === "('01/01/40' *BLANK)");
    check('MAPVAL has no Conditioning toggle (option indicators are not valid for it)', !condToggle(onId.replace(/-on$/, '')));
    const rowFlag = onId.replace(/-on$/, '');
    posted.length = 0;
    doc.getElementById(parId).value = "('12/31/99' *CUR)";
    fire(doc.getElementById(onId));
    const t = lastText();
    const f = t ? fld(recFrom(t, 'R2'), 'D1') : null;
    check('changing the parameter text rewrites exactly that MAPVAL and keeps DATFMT / DATSEP', !!f && kwOf(f.keywords, 'MAPVAL').parameters.trim() === "('12/31/99' *CUR)" && names(f.keywords).join() === 'DATFMT,DATSEP,MAPVAL');
    posted.length = 0;
    doc.getElementById(onId).checked = false;
    fire(doc.getElementById(onId));
    const t2 = lastText();
    const f2 = t2 ? fld(recFrom(t2, 'R2'), 'D1') : null;
    check('MAPVAL off removes only MAPVAL; DATFMT(*MDY) and DATSEP(\'/\') stay', !!f2 && names(f2.keywords).join() === 'DATFMT,DATSEP' && kwOf(f2.keywords, 'DATFMT').parameters.trim() === '*MDY');
    check('the alpha field in the same record was never touched', !!t2 && fld(recFrom(t2, 'R2'), 'A1').keywords.length === 0);
    void crumbRecord; void rowFlag;
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

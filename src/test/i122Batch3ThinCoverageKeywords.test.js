/**
 * i122Batch3ThinCoverageKeywords.test.js
 *
 * Task I-122, batch 3 - the next-thinnest keywords by the same inventory
 * batch 2 used (RECORD_TYPES names counted across src/test/ files):
 * HLPFULL, MNUBARSEP, LOCK, DSPRL, FRCDTA and ALWGPH.  Each cell is traced to
 * the keyword's own DDS Reference section (DDS_Keyword_V7r6.txt):
 *
 *   HLPFULL    file-level, no parameters, option indicators NOT valid; needs
 *              HLPPNLGRP at the file level or on a help specification.
 *   DSPRL      file-level, no parameters, option indicators NOT valid; only
 *              meaningful on a bidirectional device.
 *   LOCK       record-level, no parameters, option indicators valid.
 *   FRCDTA     record-level, no parameters, option indicators valid, once per
 *              record format.
 *   ALWGPH     file- or record-level, no parameters, option indicators valid;
 *              not with SFL or USRDFN.
 *   MNUBARSEP  field-level on a menu-bar field, [*COLOR] [*DSPATR] [*CHAR]
 *              groups, option indicators valid.
 *
 *  L1/L2 writer: guards, parse, flag / separator round trip, neighbours and
 *        conditions kept.
 *  L3    display: which level shows which row, saved state, Conditioning
 *        toggle present or absent as the spec says.
 *  L4    commit paths: checkbox, Conditioning, Apply separator, raw editor.
 *
 * Gaps found while writing it are NOT asserted as correct; they are logged in
 * docs/sda-reference/keywordFixes.md (I-175 and I-176).
 *
 * Run with: node src/test/i122Batch3ThinCoverageKeywords.test.js
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
const field = (n, line) => dds({ name: n, len: 10, type: 'A', usage: 'B', line: line || 2, pos: 2 });
const build = (lines) => lines.join('\n') + '\n';
const parse = (lines) => DspfParser.parseDspf(build(lines));
const kwOf = (kws, name) => (kws || []).find((k) => k.name === name);
const names = (kws) => kws.map((k) => k.name);
const S = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });

const SOURCE = build([
  dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
  dds({ fn: 'DSPRL' }),
  dds({ ind: '05', fn: 'ALWGPH' }),
  dds({ rec: 1, name: 'R1' }),
  dds({ ind: '14', fn: 'LOCK' }),
  dds({ fn: 'FRCDTA' }),
  dds({ fn: 'ALWGPH' }),
  field('F1'),
  dds({ rec: 1, name: 'MB', fn: 'MNUBAR' }),
  dds({ name: 'MNB1', len: 10, type: 'A', usage: 'B', line: 1, pos: 2, fn: 'SNGCHCFLD' }),
  dds({ fn: "MNUBARSEP((*COLOR RED) (*CHAR '='))" }),
]);
const model = DspfParser.parseDspf(SOURCE);
const rec = (n) => model.records.find((r) => r.name === n);

console.log('=== spec: what the DDS Reference says about each keyword ===');
{
  const T = KeywordSpec.RECORD_TYPES;
  check('HLPFULL: file level, no parameters, option indicators not valid', T.HLPFULL.levels.join() === 'file' && T.HLPFULL.noParameters === true && T.HLPFULL.optionIndicators === 'notValid');
  check('HLPFULL needs HLPPNLGRP at the file or help-specification level', T.HLPFULL.requiresKeywordAtLevels.keyword === 'HLPPNLGRP' && T.HLPFULL.requiresKeywordAtLevels.levels.join() === 'file,helpSpecification');
  check('DSPRL: file level, no parameters, option indicators not valid, bidirectional device only', T.DSPRL.levels.join() === 'file' && T.DSPRL.noParameters === true && T.DSPRL.optionIndicators === 'notValid' && T.DSPRL.bidirectionalDeviceOnly === true);
  check('LOCK: record level, no parameters, option indicators valid', T.LOCK.levels.join() === 'record' && T.LOCK.noParameters === true && T.LOCK.optionIndicatorsValid === true);
  check('FRCDTA: record level, no parameters, option indicators valid, once per record format', T.FRCDTA.levels.join() === 'record' && T.FRCDTA.noParameters === true && T.FRCDTA.optionIndicatorsValid === true && T.FRCDTA.oncePerRecordFormat === true);
  check('ALWGPH: file and record level, no parameters, option indicators valid, not with SFL or USRDFN', T.ALWGPH.levels.join() === 'file,record' && T.ALWGPH.noParameters === true && T.ALWGPH.optionIndicators === 'valid' && T.ALWGPH.excludesOnRecordTypes.join() === 'SFL,USRDFN');
  check('MNUBARSEP: field level, parameters required, option indicators valid, needs MNUBAR on the record', T.MNUBARSEP.levels.join() === 'field' && T.MNUBARSEP.parameters === 'required' && T.MNUBARSEP.optionIndicators === 'valid' && T.MNUBARSEP.requiresOnRecord.join() === 'MNUBAR');
  check('MNUBARSEP: colours, attributes and the one-character separator as the reference lists them', T.MNUBARSEP.color.values.join() === 'BLU,GRN,PNK,RED,TRQ,YLW,WHT' && T.MNUBARSEP.displayAttribute.values.join() === 'BL,CS,HI,ND,RI,UL' && T.MNUBARSEP.character.length === 1);
  check('MNUBARSEP: HI, RI and UL hide the separator line', T.MNUBARSEP.attributesThatHideSeparator.join() === 'HI,RI,UL');
  check('the accessors agree with the spec for the two I-121f file keywords (HLPFULL, DSPRL)', ['HLPFULL', 'DSPRL'].every((k) => DspfWriter.takesNoParameters(k) && !DspfWriter.optionIndicatorsAllowed(k)));
  // I-174 made the accessors read each keyword's own entry.
  check('takesNoParameters: true for HLPFULL, DSPRL, LOCK, FRCDTA and ALWGPH, false for MNUBARSEP (parameters required)', ['HLPFULL', 'DSPRL', 'LOCK', 'FRCDTA', 'ALWGPH'].every((k) => DspfWriter.takesNoParameters(k) === true) && DspfWriter.takesNoParameters('MNUBARSEP') === false);
  check('optionIndicatorsAllowed: false for HLPFULL and DSPRL (not valid), true for ALWGPH and MNUBARSEP (valid)', !DspfWriter.optionIndicatorsAllowed('HLPFULL') && !DspfWriter.optionIndicatorsAllowed('DSPRL') && DspfWriter.optionIndicatorsAllowed('ALWGPH') && DspfWriter.optionIndicatorsAllowed('MNUBARSEP'));
  // Not asserted (logged as I-176): LOCK and FRCDTA state `optionIndicatorsValid: true`, a spelling the
  // accessor does not read, so optionIndicatorsAllowed answers false for them.
}

console.log('\n=== L1/L2 writer: parse, and flag round trip ===');
{
  check('file level: DSPRL bare, ALWGPH with indicator 05', !!kwOf(model.fileKeywords, 'DSPRL') && kwOf(model.fileKeywords, 'DSPRL').parameters.trim() === '' && kwOf(model.fileKeywords, 'ALWGPH').conditions[0].indicators[0].number === '05');
  check('record level on R1: LOCK(14), FRCDTA and ALWGPH, none with parameters', names(rec('R1').keywords).join() === 'LOCK,FRCDTA,ALWGPH' && kwOf(rec('R1').keywords, 'LOCK').conditions[0].indicators[0].number === '14' && rec('R1').keywords.every((k) => k.parameters.trim() === ''));
  const g = (kws, n) => DspfWriter.getFileFlagKeyword(kws, n);
  check('getFileFlagKeyword reads each flag with its conditions', g(rec('R1').keywords, 'LOCK').present && g(rec('R1').keywords, 'LOCK').conditions.length === 1 && g(model.fileKeywords, 'ALWGPH').conditions.length === 1 && !g(model.fileKeywords, 'HLPFULL').present);

  const removed = DspfWriter.setFileFlagKeyword(rec('R1').keywords, 'LOCK', false, '', undefined, undefined);
  check('removing LOCK leaves FRCDTA and ALWGPH exactly as they were', names(removed).join() === 'FRCDTA,ALWGPH');
  const again = DspfWriter.setFileFlagKeyword(rec('R1').keywords, 'FRCDTA', true, '', undefined, undefined);
  check('turning an already-present FRCDTA on again is idempotent', again.filter((k) => k.name === 'FRCDTA').length === 1 && again.length === 3);
  const kept = DspfWriter.setFileFlagKeyword(rec('R1').keywords, 'LOCK', true, '', undefined, undefined);
  check('...and the indicator on the existing LOCK is kept', kwOf(kept, 'LOCK').conditions[0].indicators[0].number === '14');
  const cond = DspfWriter.setFileFlagKeyword(rec('R1').keywords, 'FRCDTA', true, '', undefined, [{ indicators: [{ number: '40', negated: false }] }]);
  check('a condition passed in is kept on the keyword', kwOf(cond, 'FRCDTA').conditions[0].indicators[0].number === '40');
  const dsprlOff = DspfWriter.setFileFlagKeyword(model.fileKeywords, 'DSPRL', false, '', undefined, undefined);
  check('file level: DSPRL off leaves DSPSIZ and ALWGPH(05) alone', names(dsprlOff).join() === 'DSPSIZ,ALWGPH' && dsprlOff[1].conditions.length === 1);
  const hfOn = DspfWriter.setFileFlagKeyword(model.fileKeywords, 'HLPFULL', true, '', undefined, undefined);
  check('file level: HLPFULL is added as a bare keyword', names(hfOn).includes('HLPFULL') && kwOf(hfOn, 'HLPFULL').parameters.trim() === '' && kwOf(hfOn, 'HLPFULL').conditions.length === 0);
}

console.log('\n=== L1 HLPFULL: needs HLPPNLGRP at the file level or on a help specification ===');
{
  const base = [dds({ fn: 'DSPSIZ(24 80 *DS3)' })];
  const tail = [dds({ rec: 1, name: 'R1' }), field('F1')];
  const none = parse(base.concat(tail));
  const noPnl = parse(base.concat([dds({ fn: 'HLPFULL' })], tail));
  const atFile = parse(base.concat([dds({ fn: 'HLPPNLGRP(R1 PNLA)' }), dds({ fn: 'HLPFULL' })], tail));
  const atHelp = parse(base.concat([dds({ fn: 'HLPFULL' })], tail, [dds({ h: 1, fn: 'HLPARA(1 2 3 4)' }), dds({ fn: 'HLPPNLGRP(R1 PNLA)' })]));
  const pnlOnly = parse(base.concat([dds({ fn: 'HLPPNLGRP(R1 PNLA)' })], tail));
  const reason = DspfWriter.fileHelpNewConflictReason(none, noPnl);
  check('HLPFULL with no HLPPNLGRP anywhere is refused, naming both', !!reason && /HLPFULL/.test(reason) && /HLPPNLGRP/.test(reason));
  check('HLPFULL beside a file-level HLPPNLGRP is accepted', DspfWriter.fileHelpNewConflictReason(pnlOnly, atFile) === null);
  check('HLPFULL with HLPPNLGRP on a help specification is accepted', DspfWriter.fileHelpNewConflictReason(none, atHelp) === null);
  check('an already-invalid hand-written HLPFULL is not re-reported by an unchanged edit', DspfWriter.fileHelpNewConflictReason(noPnl, noPnl) === null);
  check('removing HLPPNLGRP from a valid HLPFULL file is refused (the other direction)', !!DspfWriter.fileHelpNewConflictReason(atFile, noPnl));
}

console.log('\n=== L1 ALWGPH / LOCK / FRCDTA: record-type rules ===');
{
  const sfl = [S('SFL')], usr = [S('USRDFN')], bar = [S('MNUBAR')];
  const w = DspfWriter;
  check('ALWGPH is refused on a subfile record format, naming ALWGPH and SFL', /ALWGPH/.test(w.sflWhitelistConflictReason('ALWGPH', sfl) || '') && /SFL/.test(w.sflWhitelistConflictReason('ALWGPH', sfl) || ''));
  check('ALWGPH is refused on a USRDFN record format', /ALWGPH/.test(w.usrdfnWhitelistConflictReason('ALWGPH', usr) || ''));
  check('ALWGPH is refused on a menu-bar record format', /ALWGPH/.test(w.mnubarWhitelistConflictReason('ALWGPH', bar) || ''));
  check('LOCK is refused on a USRDFN record format', /LOCK/.test(w.usrdfnWhitelistConflictReason('LOCK', usr) || ''));
  check('LOCK is allowed on a menu-bar record format (it is on the menu-bar list)', w.mnubarWhitelistConflictReason('LOCK', bar) === null);
  check('FRCDTA is refused on a menu-bar record format', /FRCDTA/.test(w.mnubarWhitelistConflictReason('FRCDTA', bar) || ''));
  const one = parse([dds({ rec: 1, name: 'R1', fn: 'FRCDTA' }), field('F1')]);
  const two = parse([dds({ rec: 1, name: 'R1', fn: 'FRCDTA' }), dds({ fn: 'FRCDTA' }), field('F1')]);
  const zero = parse([dds({ rec: 1, name: 'R1' }), field('F1')]);
  check('a first FRCDTA on a record is accepted', w.outputControlNewConflictReason(zero, one) === null);
  const twice = w.outputControlNewConflictReason(one, two);
  check('a second FRCDTA on the same record is refused ("once per record format")', !!twice && /FRCDTA/.test(twice) && /once/.test(twice));
  check('an already-invalid record with two FRCDTA is not re-reported by an unchanged edit', w.outputControlNewConflictReason(two, two) === null);
}

console.log('\n=== L1/L2 MNUBARSEP: parameter groups round trip ===');
{
  const f = rec('MB').fields[0];
  const sep = DspfWriter.getMenubarSeparator(f.keywords);
  check('MNUBARSEP((*COLOR RED) (*CHAR \'=\')) reads as colour RED, no attributes, character =', sep.color === 'RED' && sep.attrs.length === 0 && sep.char === '=');
  check('the neighbouring SNGCHCFLD is untouched by the read', names(f.keywords).join() === 'SNGCHCFLD,MNUBARSEP');
  const all = DspfWriter.setMenubarSeparator(f.keywords, { colorEnabled: true, color: 'TRQ', attrsEnabled: true, attrs: ['UL', 'BL'], charEnabled: true, char: '*' });
  check('all three groups are written in the reference\'s order', kwOf(all, 'MNUBARSEP').parameters === "(*COLOR TRQ) (*DSPATR UL BL) (*CHAR '*')");
  check('SNGCHCFLD stays first and there is still one MNUBARSEP', names(all).join() === 'SNGCHCFLD,MNUBARSEP');
  const attrsOnly = DspfWriter.setMenubarSeparator(f.keywords, { colorEnabled: false, color: 'RED', attrsEnabled: true, attrs: ['HI'], charEnabled: false, char: '=' });
  check('a group that is not enabled is not written', kwOf(attrsOnly, 'MNUBARSEP').parameters === '(*DSPATR HI)');
  const none = DspfWriter.setMenubarSeparator(f.keywords, { colorEnabled: false, color: '', attrsEnabled: false, attrs: [], charEnabled: false, char: '' });
  check('with no group enabled MNUBARSEP is removed and SNGCHCFLD stays', names(none).join() === 'SNGCHCFLD');
  const multi = DspfWriter.setMenubarSeparator(f.keywords, { colorEnabled: true, color: 'RED', attrsEnabled: false, attrs: [], charEnabled: true, char: '=@' });
  check('the character group keeps one character only', kwOf(multi, 'MNUBARSEP').parameters === "(*COLOR RED) (*CHAR '=')");
  const withCond = f.keywords.map((k) => (k.name === 'MNUBARSEP' ? { name: k.name, parameters: k.parameters, conditions: [{ indicators: [{ number: '21', negated: false }] }] } : k));
  const kept = DspfWriter.setMenubarSeparator(withCond, { colorEnabled: true, color: 'GRN', attrsEnabled: false, attrs: [], charEnabled: true, char: '=' });
  check('rewriting the groups keeps the existing indicator when conditions are omitted', kwOf(kept, 'MNUBARSEP').conditions[0].indicators[0].number === '21');
  const replaced = DspfWriter.setMenubarSeparator(withCond, { colorEnabled: true, color: 'GRN', attrsEnabled: false, attrs: [], charEnabled: true, char: '=', conditions: [] });
  check('...and an explicit empty condition list clears it', kwOf(replaced, 'MNUBARSEP').conditions.length === 0);
  check('the separator reads as empty on a field that has none', DspfWriter.getMenubarSeparator(rec('R1').fields[0].keywords).color === '' && DspfWriter.getMenubarSeparator(rec('R1').fields[0].keywords).char === '');
}

console.log('\n=== L3/L4 the panels (jsdom) ===');
const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (t) => { alerts.push(String(t)); };
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
  const toggle = (id, on) => { const el = doc.getElementById(id + '-on'); posted.length = 0; alerts.length = 0; el.checked = on; fire(el); return lastText(); };
  const condToggle = (flagId) => doc.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  const has = (id) => !!doc.getElementById(id);

  console.log('  -- file level');
  fire(doc.getElementById('crumb-file'), 'click');
  check('the file panel has HLPFULL, DSPRL and ALWGPH rows', has('fk-hlpfull-on') && has('fk-dsprl-on') && has('fk-alwgph-on'));
  check('DSPRL and ALWGPH show checked, HLPFULL unchecked', doc.getElementById('fk-dsprl-on').checked && doc.getElementById('fk-alwgph-on').checked && !doc.getElementById('fk-hlpfull-on').checked);
  check('no LOCK or FRCDTA row at file level (record-level only)', !has('fk-lock-on') && !has('fk-frcdta-on'));
  check('ALWGPH shows its Conditioning count (1)', !!condToggle('fk-alwgph') && /Conditioning\s*\(1\)/.test(condToggle('fk-alwgph').textContent));
  check('HLPFULL and DSPRL have no Conditioning toggle (option indicators not valid)', !condToggle('fk-hlpfull') && !condToggle('fk-dsprl'));
  {
    const t = toggle('fk-dsprl', false);
    const p = parsed(t);
    check('DSPRL off removes only DSPRL; ALWGPH(05) and every record stay', !!p && names(p.fileKeywords).join() === 'DSPSIZ,ALWGPH' && kwOf(p.fileKeywords, 'ALWGPH').conditions.length === 1 && p.records.length === 2);
    const t2 = toggle('fk-dsprl', true);
    check('DSPRL on again is a bare file-level keyword with no indicator', !!t2 && kwOf(parsed(t2).fileKeywords, 'DSPRL').parameters.trim() === '' && kwOf(parsed(t2).fileKeywords, 'DSPRL').conditions.length === 0);
  }
  {
    const t = toggle('fk-alwgph', false);
    const p = parsed(t);
    check('file level: ALWGPH off removes it and its indicator line; DSPRL stays', !!p && names(p.fileKeywords).join() === 'DSPSIZ,DSPRL' && !/05 .*ALWGPH/.test(t.split('\n').slice(0, 3).join('\n')));
    check('...and the record-level ALWGPH on R1 was not touched', !!kwOf(recFrom(t, 'R1').keywords, 'ALWGPH'));
  }
  {
    const t = toggle('fk-hlpfull', true);
    check('HLPFULL on in a file with no HLPPNLGRP is refused: no edit is posted', t === null);
    check('...and the refusal names HLPFULL and HLPPNLGRP', alerts.some((a) => /HLPFULL/.test(a) && /HLPPNLGRP/.test(a)));
  }

  console.log('  -- record level');
  selectRecord('R1');
  check('R1 has LOCK, FRCDTA and ALWGPH rows, all checked', ['lock', 'frcdta', 'alwgph'].every((k) => has('rk-R1-' + k + '-on') && doc.getElementById('rk-R1-' + k + '-on').checked));
  check('the rows are labelled with their DDS names', /\(LOCK\)/.test(doc.body.innerHTML) && /\(FRCDTA\)/.test(doc.body.innerHTML) && /\(ALWGPH\)/.test(doc.body.innerHTML));
  check('LOCK shows its Conditioning count (1); FRCDTA and ALWGPH have a toggle and no count', /Conditioning\s*\(1\)/.test(condToggle('rk-R1-lock').textContent) && !!condToggle('rk-R1-frcdta') && !/\(\d\)/.test(condToggle('rk-R1-frcdta').textContent) && !!condToggle('rk-R1-alwgph'));
  check('no HLPFULL or DSPRL row at record level (file-level only)', !has('rk-R1-hlpfull-on') && !has('rk-R1-dsprl-on'));
  {
    const t = toggle('rk-R1-lock', false);
    const r = recFrom(t, 'R1');
    check('LOCK off removes it and its indicator line; FRCDTA and ALWGPH stay', !!r && names(r.keywords).join() === 'FRCDTA,ALWGPH' && !/14 .*LOCK/.test(t));
    // the file-level ALWGPH was switched off earlier in this run, so the file keywords are DSPSIZ and DSPRL
    check('the file-level keywords were not touched by the record edit', names(parsed(t).fileKeywords).join() === 'DSPSIZ,DSPRL');
    selectRecord('R1');
    const t2 = toggle('rk-R1-lock', true);
    const r2 = recFrom(t2, 'R1');
    check('LOCK on again is a bare unconditioned keyword', !!r2 && kwOf(r2.keywords, 'LOCK').conditions.length === 0 && kwOf(r2.keywords, 'LOCK').parameters.trim() === '');
  }
  {
    selectRecord('R1');
    const t = toggle('rk-R1-frcdta', false);
    // LOCK was switched off and on again above, so it now sits after ALWGPH and has no indicator
    check('FRCDTA off removes only FRCDTA', !!recFrom(t, 'R1') && names(recFrom(t, 'R1').keywords).slice().sort().join() === 'ALWGPH,LOCK');
    selectRecord('R1');
    const t2 = toggle('rk-R1-frcdta', true);
    check('FRCDTA on again leaves exactly one FRCDTA on R1', !!recFrom(t2, 'R1') && recFrom(t2, 'R1').keywords.filter((k) => k.name === 'FRCDTA').length === 1);
  }
  {
    selectRecord('R1');
    fire(condToggle('rk-R1-frcdta'), 'click');
    fire(doc.querySelector('.cond-add-group[data-prefix="rk-R1-frcdta-cond"]'), 'click');
    doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num').value = '07';
    posted.length = 0;
    fire(doc.querySelector('.cond-ind-add[data-prefix="rk-R1-frcdta-cond"][data-group="pending"]'), 'click');
    const t = lastText();
    const k = t ? kwOf(recFrom(t, 'R1').keywords, 'FRCDTA') : null;
    check('FRCDTA conditioned on indicator 07 (option indicators are valid for it); LOCK and ALWGPH still present', !!k && k.conditions[0].indicators[0].number === '07' && !!kwOf(recFrom(t, 'R1').keywords, 'LOCK') && !!kwOf(recFrom(t, 'R1').keywords, 'ALWGPH'));
  }
  {
    selectRecord('R1');
    const owner = Array.from(doc.querySelectorAll('.kw-add')).map((e) => e.getAttribute('data-owner')).find((o) => o === 'record-R1');
    check('the record raw keyword editor is reachable', !!owner);
    if (owner) {
      doc.getElementById(owner + '-new-kw-name').value = 'FRCDTA';
      doc.getElementById(owner + '-new-kw-params').value = '';
      posted.length = 0; alerts.length = 0;
      fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
      check('raw-adding a second FRCDTA to R1 is refused (once per record format): no edit posted', lastText() === null);
      check('...with a message naming FRCDTA', alerts.some((a) => /FRCDTA/.test(a)));
    }
  }

  console.log('  -- menu-bar record');
  selectRecord('MB');
  check('MB (a MNUBAR record) is offered LOCK', has('rk-MB-lock-on') && !doc.getElementById('rk-MB-lock-on').checked);
  check('MB is not offered FRCDTA or ALWGPH (they are not on the menu-bar list)', !has('rk-MB-frcdta-on') && !has('rk-MB-alwgph-on'));
  {
    const t = toggle('rk-MB-lock', true);
    check('LOCK on a menu-bar record is accepted and written bare', !!recFrom(t, 'MB') && kwOf(recFrom(t, 'MB').keywords, 'LOCK') && names(recFrom(t, 'MB').keywords).join() === 'MNUBAR,LOCK');
    toggle('rk-MB-lock', false);
  }

  console.log('  -- MNUBARSEP (field level, on the menu-bar field)');
  {
    selectRecord('MB');
    const f = doc.querySelector('#screenOutput .dspf-field[data-field="MNB1"]');
    check('MNB1 is on the preview canvas', !!f);
    if (f) fire(f, 'click');
    const id = (Array.from(doc.querySelectorAll('[id]')).map((e) => e.id).find((i) => /-mnubarsep-color-on$/.test(i)) || '').replace(/-color-on$/, '');
    check('the menu-bar field shows the separator group with its three enable boxes', !!id && has(id + '-color-on') && has(id + '-attrs-on') && has(id + '-char-on'));
    check('saved state: colour RED and character = enabled, attributes not', doc.getElementById(id + '-color-on').checked && doc.getElementById(id + '-color').value === 'RED' && !doc.getElementById(id + '-attrs-on').checked && doc.getElementById(id + '-char-on').checked && doc.getElementById(id + '-char').value === '=');
    check('the character box takes one character', doc.getElementById(id + '-char').getAttribute('maxlength') === '1');
    check('MNUBARSEP has a Conditioning toggle (option indicators are valid)', !!condToggle(id));
    const apply = () => fire(doc.querySelector('.' + id + '-apply'), 'click');
    // attributes on + UL, character changed
    doc.getElementById(id + '-attrs-on').checked = true;
    const ul = Array.from(doc.querySelectorAll('.' + id + '-attr')).find((e) => e.value === 'UL');
    // the panel lists them in screen order (HI RI CS BL ND UL), the same six values as the reference
    check('the attribute check boxes are the six the reference lists', Array.from(doc.querySelectorAll('.' + id + '-attr')).map((e) => e.value).sort().join() === 'BL,CS,HI,ND,RI,UL');
    ul.checked = true;
    doc.getElementById(id + '-char').value = '+';
    posted.length = 0;
    apply();
    const t = lastText();
    const k = t ? kwOf(recFrom(t, 'MB').fields[0].keywords, 'MNUBARSEP') : null;
    check('Apply separator rewrites the one MNUBARSEP with all three groups', !!k && k.parameters === "(*COLOR RED) (*DSPATR UL) (*CHAR '+')");
    check('SNGCHCFLD and the MNUBAR record keyword were not touched', !!t && names(recFrom(t, 'MB').fields[0].keywords).join() === 'SNGCHCFLD,MNUBARSEP' && names(recFrom(t, 'MB').keywords).join() === 'MNUBAR');
    selectRecord('MB');
    fire(doc.querySelector('#screenOutput .dspf-field[data-field="MNB1"]'), 'click');
    const id2 = (Array.from(doc.querySelectorAll('[id]')).map((e) => e.id).find((i) => /-mnubarsep-color-on$/.test(i)) || '').replace(/-color-on$/, '');
    doc.getElementById(id2 + '-color-on').checked = false;
    doc.getElementById(id2 + '-attrs-on').checked = false;
    doc.getElementById(id2 + '-char-on').checked = false;
    posted.length = 0;
    fire(doc.querySelector('.' + id2 + '-apply'), 'click');
    const t2 = lastText();
    check('Apply with every group unchecked removes MNUBARSEP and keeps SNGCHCFLD', !!t2 && names(recFrom(t2, 'MB').fields[0].keywords).join() === 'SNGCHCFLD');
  }
  // Not asserted (logged as I-175): MNUBARSEP is accepted beside MNUBAR(*NOSEPARATOR) and
  // by the raw keyword editor on a field of a record that has no MNUBAR.

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

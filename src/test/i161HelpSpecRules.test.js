/**
 * i161HelpSpecRules.test.js
 *
 * Task I-161 - the help-specification (H specification) rules the I-121k slice
 * recorded as facts (KeywordSpec.helpSpecificationRules + the HLPARA / HLPBDY /
 * HLPEXCLD entries) that no guard enforced, and the HLPARA parameter box.
 * The guard (DspfWriter.helpSpecNewConflictReason) is spec-driven and
 * diff-based (the I-140 / I-148 / I-160 shape).
 *
 *  1. the facts, against the DDS Reference.
 *  2. the guard on parsed DDS: H specification composition, SFL / message
 *     subfile, every HLPARA form and its checks, display size conditioning.
 *  3. the real webview: the help entry's HLPARA row has a parameter box and the
 *     commit is refused / accepted by the guard.
 *
 * Run with: node src/test/i161HelpSpecRules.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const RAWREF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8');
const REF = RAWREF.replace(/\f/g, ' ').replace(/\s+/g, ' ').replace(/- /g, '-');
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ').replace(/- /g, '-')) !== -1;

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.cond) put(7, o.cond);
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.use) put(38, o.use);
  if (o.line) put(39, String(o.line).padStart(3));
  if (o.col) put(42, String(o.col).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const R = (name, fn) => dds({ t: 'R', name, fn });
const H = (fn, cond) => dds({ t: 'H', fn, cond });
const K = (fn, cond) => dds({ fn, cond });
const F = (name, use, fn) => dds({ name, use, fn });
const C = (text, fn) => dds({ line: 1, col: 2, fn: "'" + text + "'" + (fn ? ' ' + fn : '') });
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.helpSpecNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');
// A record R1 with a field F1 (CHOICE 1) and the given H specification lines (first one is the H line).
const withH = (hLines, rec) => src(R('R1', rec), ...hLines, F('F1', 'B'), K("CHOICE(1 'One')"), C('Title', 'HLPID(7)'));
const base = withH([]);
const hspec = (area, ...more) => [H(area)].concat(more.map((m) => K(m)));

console.log('=== 1. the facts, against the DDS Reference ===');
{
  const r = KeywordSpec.helpSpecificationRules();
  check('each H specification: exactly one HLPRCD / HLPPNLGRP / HLPDOC, up to one HLPBDY or HLPEXCLD, at least one HLPARA',
    has('Each H specification must have exactly one HLPRCD, HLPPNLGRP, or HLPDOC keyword, up to one HLPBDY or HLPEXCLD keyword, and at least one HLPARA keyword.') &&
    r.exactlyOneOf.join() === 'HLPRCD,HLPPNLGRP,HLPDOC' && r.atMostOneOf.join() === 'HLPBDY,HLPEXCLD' && r.atLeastOne.join() === 'HLPARA');
  check('no H specification in SFL records or in the SFLCTL record of a message subfile',
    has('You cannot use H specifications in subfile (SFL keyword) record formats. H specifications are not allowed in subfile control formats associated with message subfiles (SFLMSGRCD keyword).') &&
    r.notOnRecordTypes.join() === 'SFL' && r.notOnSflctlWith === 'SFLMSGRCD');
  check('HLPEXCLD: allowed only on H specifications that specify HLPPNLGRP',
    has('This keyword is allowed only on help-specifications that specify a HLPPNLGRP keyword') && KeywordSpec.RECORD_TYPES.HLPEXCLD.requiresOnHelpSpecification.join() === 'HLPPNLGRP');
  const hl = KeywordSpec.RECORD_TYPES.HLPARA;
  check('HLPARA: line and position values within the display size; top not after bottom, left not after right',
    has('The line and position values must be within the display size.') && has('The top line must not exceed the bottom line and the left position must not exceed the right position.') &&
    hl.coordinates.withinDisplaySize && hl.coordinates.topLineNotAfterBottomLine && hl.coordinates.leftPositionNotAfterRightPosition);
  check('HLPARA(*RCD) not valid for SFLCTL or USRDFN; needs a displayable field (not H / M / P, SFLPGMQ, SFLMSGKEY)',
    has('HLPARA(*RCD) is not valid for subfile control (SFLCTL) or user-defined (USRDFN) record formats.') && has('must contain at least one displayable field for the primary display size') &&
    hl.rcd.notOnRecordTypes.join() === 'SFLCTL,USRDFN' && hl.rcd.recordNeedsDisplayableField);
  check('HLPARA(*FLD): the field must exist in the record; the choice number is 1 to 99 and must be on that field\'s MNUBARCHC / CHOICE',
    has('The field must exist in the record containing the H specification.') && has('Valid values for the choice number are positive integers greater than 0 and less than 100.') &&
    hl.fld.fieldMustExistInRecord && hl.fld.choiceNumber.min === 1 && hl.fld.choiceNumber.max === 99 && hl.fld.choiceNumber.onlyForFieldsWith.join() === 'MNUBARCHC,CHOICE');
  check('HLPARA(*CNST): a constant field of the record with the same HLPID',
    has('The constant field must exist in the record containing the H specification, and it must have the HLPID keyword specified with the same help-identifier.') && hl.cnst.constantFieldNeedsKeyword === 'HLPID');
  check('HLPARA: several per H specification need display size conditioning',
    has('When you specify multiple HLPARA keywords for each H specification, you must use display size conditioning.') && hl.multipleNeedDisplaySizeConditioning);
  check('SLNO adjusts the top and bottom lines (so the line bound is not judged on a record with SLNO)', has('If you specify the SLNO(n) keyword on the record, the top-line and bottom-line values are adjusted'));
}

console.log('\n=== 2. the guard on parsed DDS ===');
{
  const ok = (label, hl, more) => check(label, guard(base, withH(hspec(hl, 'HLPRCD(H1)').concat((more || []).map((m) => K(m))))) === null);
  const no = (label, re, hl, more, rec, from) => check(label, say(re, guard(from || base, withH(hspec(hl, ...(more || ['HLPRCD(H1)'])), rec))));
  // coordinates
  ok('HLPARA(1 5 3 15) is accepted', 'HLPARA(1 5 3 15)');
  ok('HLPARA(1 1 24 80), the whole 24 x 80 display, is accepted', 'HLPARA(1 1 24 80)');
  no('a position past 80 is refused', /position 81 is outside the 24 x 80 display size/, 'HLPARA(1 5 3 81)');
  no('a line past 24 is refused', /line 25 is outside the 24 x 80 display size/, 'HLPARA(1 5 25 20)');
  no('top after bottom is refused', /top line must not exceed the bottom line/, 'HLPARA(5 5 3 15)');
  no('left after right is refused', /left position must not exceed the right position/, 'HLPARA(1 20 3 15)');
  no('line or position 0 is refused', /at least 1/, 'HLPARA(0 5 3 15)');
  no('three numbers are refused', /four whole numbers/, 'HLPARA(1 5 3)');
  no('a non-number is refused', /four whole numbers/, 'HLPARA(1 5 X 15)');
  no('an unknown special value is refused', /does not accept \*ALL/, 'HLPARA(*ALL)');
  no('a bare HLPARA is refused', /needs a parameter/, 'HLPARA');
  no('*RCD with another parameter is refused', /takes no other parameter/, 'HLPARA(*RCD 3)');
  ok('HLPARA(*NONE) is accepted', 'HLPARA(*NONE)');
  check('the line bound is not judged on a record with SLNO (it adjusts the lines)', guard(withH([], 'SLNO(5)'), withH(hspec('HLPARA(1 5 25 20)', 'HLPRCD(H1)'), 'SLNO(5)')) === null);
  check('the position bound still holds on a record with SLNO', say(/position 81/, guard(withH([], 'SLNO(5)'), withH(hspec('HLPARA(1 5 3 81)', 'HLPRCD(H1)'), 'SLNO(5)'))));
  // display sizes
  const big = (hl) => src(K('DSPSIZ(*DS3 *DS4)'), R('R1'), ...hspec(hl, 'HLPRCD(H1)'), F('F1', 'B'));
  const bigBase = src(K('DSPSIZ(*DS3 *DS4)'), R('R1'), F('F1', 'B'));
  check('with DSPSIZ(*DS3 *DS4) an unconditioned HLPARA is judged against the primary 24 x 80 size', say(/position 100/, guard(bigBase, big('HLPARA(1 5 3 100)'))));
  // Display size conditions are set on the parsed model (the DDS column for them is not what is under test).
  const dsc = (name, not) => [{ displaySizeCondition: { name, not: !!not }, indicators: [] }];
  function modelWith(areas) {
    const m = parse(src(K('DSPSIZ(*DS3 *DS4)'), R('R1'), ...hspec('HLPARA(1 1 1 1)', 'HLPRCD(H1)'), F('F1', 'B')));
    const h = m.records[0].helpEntries[0];
    h.keywords = h.keywords.filter((k) => k.name !== 'HLPARA').concat(areas.map((a) => ({ name: 'HLPARA', parameters: a[0], conditions: a[1] || [], raw: '', sourceLines: [] })));
    return m;
  }
  const noH = parse(src(K('DSPSIZ(*DS3 *DS4)'), R('R1'), F('F1', 'B')));
  const gm = (areas) => DspfWriter.helpSpecNewConflictReason(noH, modelWith(areas));
  check('a primary HLPARA plus a *DS4-conditioned one is accepted', gm([['1 5 3 20'], ['1 5 3 20', dsc('*DS4')]]) === null);
  check('a *DS4-conditioned HLPARA is judged against 27 x 132 (position 100 and line 27 fit)', gm([['1 5 27 100', dsc('*DS4')]]) === null);
  check('a *DS3-conditioned HLPARA is judged against 24 x 80 (position 100 does not fit)', say(/position 100 is outside the 24 x 80/, gm([['1 5 3 100', dsc('*DS3')]])));
  check('a *DS4-conditioned HLPARA past 132 is refused', say(/position 133 is outside the 27 x 132/, gm([['1 5 3 133', dsc('*DS4')]])));
  check('two HLPARA for the same display size are refused', say(/only one HLPARA for display size \*DS4/, gm([['1 1 1 1', dsc('*DS4')], ['2 2 2 2', dsc('*DS4')]])));
  check('two unconditioned HLPARA are refused even when a third is conditioned', say(/each beyond the first needs a display size condition/, gm([['1 1 1 1'], ['2 2 2 2'], ['1 1 1 1', dsc('*DS4')]])));
  // *RCD
  check('HLPARA(*RCD) with a displayable field is accepted', guard(base, withH(hspec('HLPARA(*RCD)', 'HLPRCD(H1)'))) === null);
  check('HLPARA(*RCD) on a record whose only field is hidden is refused', say(/at least one displayable field/, guard(src(R('R1'), F('F1', 'H')), src(R('R1'), ...hspec('HLPARA(*RCD)', 'HLPRCD(H1)'), F('F1', 'H')))));
  check('HLPARA(*RCD) on a record whose only fields are message and program-to-system is refused', say(/at least one displayable field/, guard(src(R('R1'), F('F1', 'M'), F('F2', 'P')), src(R('R1'), ...hspec('HLPARA(*RCD)', 'HLPRCD(H1)'), F('F1', 'M'), F('F2', 'P')))));
  check('HLPARA(*RCD) on a record whose only field has SFLPGMQ is refused', say(/at least one displayable field/, guard(src(R('R1'), F('F1', 'B', 'SFLPGMQ')), src(R('R1'), ...hspec('HLPARA(*RCD)', 'HLPRCD(H1)'), F('F1', 'B', 'SFLPGMQ')))));
  check('HLPARA(*RCD) on a SFLCTL record is refused', say(/not valid for a SFLCTL record format/, guard(withH([], 'SFLCTL(S1)'), withH(hspec('HLPARA(*RCD)', 'HLPRCD(H1)'), 'SFLCTL(S1)'))));
  check('HLPARA(*RCD) on a USRDFN record is refused', say(/not valid for a USRDFN record format/, guard(withH([], 'USRDFN'), withH(hspec('HLPARA(*RCD)', 'HLPRCD(H1)'), 'USRDFN'))));
  check('removing the last displayable field while HLPARA(*RCD) stays is refused (the other direction)', say(/at least one displayable field/, guard(src(R('R1'), ...hspec('HLPARA(*RCD)', 'HLPRCD(H1)'), F('F1', 'B')), src(R('R1'), ...hspec('HLPARA(*RCD)', 'HLPRCD(H1)')))));
  // *FLD
  check('HLPARA(*FLD F1) is accepted', guard(base, withH(hspec('HLPARA(*FLD F1)', 'HLPRCD(H1)'))) === null);
  check('HLPARA(*FLD f1) (lowercase) is accepted', guard(base, withH(hspec('HLPARA(*FLD f1)', 'HLPRCD(H1)'))) === null);
  check('HLPARA(*FLD F1 1) is accepted (CHOICE 1 is on F1)', guard(base, withH(hspec('HLPARA(*FLD F1 1)', 'HLPRCD(H1)'))) === null);
  check('HLPARA(*FLD NOPE) names a field the record does not have: refused', say(/NOPE is not a field of record format R1/, guard(base, withH(hspec('HLPARA(*FLD NOPE)', 'HLPRCD(H1)')))));
  check('HLPARA(*FLD F1 2): choice 2 is not on any CHOICE of F1: refused', say(/choice 2 is not specified on a MNUBARCHC or CHOICE keyword of field F1/, guard(base, withH(hspec('HLPARA(*FLD F1 2)', 'HLPRCD(H1)')))));
  check('HLPARA(*FLD F1 0) and (*FLD F1 100) are refused (choice number 1 to 99)', ['0', '100'].every((n) => say(/choice number must be a whole number from 1 to 99/, guard(base, withH(hspec('HLPARA(*FLD F1 ' + n + ')', 'HLPRCD(H1)'))))));
  check('HLPARA(*FLD F1 1 2) is refused (too many parameters)', say(/takes a field name and an optional choice number/, guard(base, withH(hspec('HLPARA(*FLD F1 1 2)', 'HLPRCD(H1)')))));
  check('deleting the field HLPARA(*FLD F1) names is refused (the other direction)', say(/F1 is not a field/, guard(withH(hspec('HLPARA(*FLD F1)', 'HLPRCD(H1)')), src(R('R1'), ...hspec('HLPARA(*FLD F1)', 'HLPRCD(H1)'), C('Title', 'HLPID(7)')))));
  check('the reference example 2 (several *FLD choices and a *CNST) is accepted as written', guard(src(R('R'), F('F1', 'B', 'SNGCHCFLD'), K("CHOICE(1 'Choice 1')"), K("CHOICE(2 'Choice 2')"), K("CHOICE(3 'Choice 3')"), F('F2', 'B'), C('Title', 'HLPID(1)')),
    src(R('R'), ...hspec('HLPARA(*FLD F1 1)', 'HLPRCD(UNDOHLP HLPLIB/HLPFILE)'), ...hspec('HLPARA(*FLD F1 2)', 'HLPRCD(MARKHLP HLPLIB/HLPFILE)'), ...hspec('HLPARA(*FLD F1 3)', 'HLPRCD(COPYHLP HLPLIB/HLPFILE)'), ...hspec('HLPARA(*FLD F2)', 'HLPRCD(F2HLP HLPLIB/HLPFILE)'), ...hspec('HLPARA(*CNST 1)', 'HLPRCD(TITLEHLP HLPLIB/HLPFILE)'), F('F1', 'B', 'SNGCHCFLD'), K("CHOICE(1 'Choice 1')"), K("CHOICE(2 'Choice 2')"), K("CHOICE(3 'Choice 3')"), F('F2', 'B'), C('Title', 'HLPID(1)'))) === null);
  // *CNST
  check('HLPARA(*CNST 7) is accepted (a constant has HLPID(7))', guard(base, withH(hspec('HLPARA(*CNST 7)', 'HLPRCD(H1)'))) === null);
  check('HLPARA(*CNST 8) with no constant HLPID(8) is refused', say(/no constant field with HLPID\(8\)/, guard(base, withH(hspec('HLPARA(*CNST 8)', 'HLPRCD(H1)')))));
  check('HLPARA(*CNST X) is refused (the help identifier is a number)', say(/one whole-number help identifier/, guard(base, withH(hspec('HLPARA(*CNST X)', 'HLPRCD(H1)')))));
  // composition
  check('HLPRCD with HLPPNLGRP on one H specification is refused', say(/only one of HLPRCD, HLPPNLGRP, HLPDOC/, guard(base, withH(hspec('HLPARA(*NONE)', 'HLPRCD(H1)', 'HLPPNLGRP(P1 LIBA/PNL1)')))));
  check('HLPPNLGRP with HLPEXCLD is accepted', guard(base, withH(hspec('HLPARA(*NONE)', 'HLPPNLGRP(P1 LIBA/PNL1)', 'HLPEXCLD'))) === null);
  check('HLPEXCLD on an H specification with HLPRCD is refused', say(/HLPEXCLD is allowed only on an H specification that specifies HLPPNLGRP/, guard(base, withH(hspec('HLPARA(*NONE)', 'HLPRCD(H1)', 'HLPEXCLD')))));
  check('removing the HLPPNLGRP while HLPEXCLD stays is refused (the other direction)', say(/HLPEXCLD is allowed only/, guard(withH(hspec('HLPARA(*NONE)', 'HLPPNLGRP(P1 LIBA/PNL1)', 'HLPEXCLD')), withH(hspec('HLPARA(*NONE)', 'HLPEXCLD')))));
  check('HLPBDY and HLPEXCLD together are refused', say(/only one of HLPBDY and HLPEXCLD/, guard(base, withH(hspec('HLPARA(*NONE)', 'HLPPNLGRP(P1 LIBA/PNL1)', 'HLPBDY', 'HLPEXCLD')))));
  check('HLPBDY alone with HLPRCD is accepted', guard(base, withH(hspec('HLPARA(*NONE)', 'HLPRCD(H1)', 'HLPBDY'))) === null);
  check('an incomplete H specification (no HLPARA yet, no HLPRCD yet) is not refused: the lower bounds are not enforced', guard(base, withH([H('')])) === null);
  // display size conditioning
  check('two unconditioned HLPARA on one H specification are refused', say(/each beyond the first needs a display size condition/, guard(base, withH(hspec('HLPARA(*NONE)', 'HLPARA(1 1 1 1)', 'HLPRCD(H1)')))));
  // record types
  check('an H specification in an SFL record is refused', say(/subfile \(SFL\) record format, which cannot have an H specification/, guard(src(R('R1', 'SFL'), F('F1', 'B')), src(R('R1', 'SFL'), ...hspec('HLPARA(*NONE)', 'HLPRCD(H1)'), F('F1', 'B')))));
  check('adding SFL to a record that has an H specification is refused (the other direction)', say(/cannot have an H specification/, guard(src(R('R1'), ...hspec('HLPARA(*NONE)', 'HLPRCD(H1)'), F('F1', 'B')), src(R('R1', 'SFL'), ...hspec('HLPARA(*NONE)', 'HLPRCD(H1)'), F('F1', 'B')))));
  const msgBase = src(R('RCDMSG', 'SFL SFLMSGRCD(3)'), F('FLDKEY', 'O', 'SFLMSGKEY'), R('SFLCTL1', 'SFLCTL(RCDMSG)'), F('FLDPGM', 'O', 'SFLPGMQ'));
  const msgWith = src(R('RCDMSG', 'SFL SFLMSGRCD(3)'), F('FLDKEY', 'O', 'SFLMSGKEY'), R('SFLCTL1', 'SFLCTL(RCDMSG)'), ...hspec('HLPARA(*NONE)', 'HLPRCD(H1)'), F('FLDPGM', 'O', 'SFLPGMQ'));
  check('an H specification in the SFLCTL record of a message subfile (SFLMSGRCD) is refused', say(/subfile control record of a message subfile \(SFLMSGRCD\)/, guard(msgBase, msgWith)));
  check('an H specification in an ordinary SFLCTL record (its SFL has no SFLMSGRCD) is accepted', guard(src(R('S1', 'SFL'), F('F1', 'B'), R('C1', 'SFLCTL(S1)'), F('F2', 'O')), src(R('S1', 'SFL'), F('F1', 'B'), R('C1', 'SFLCTL(S1)'), ...hspec('HLPARA(*NONE)', 'HLPRCD(H1)'), F('F2', 'O'))) === null);
  // diff behaviour
  const bad = withH(hspec('HLPARA(1 5 3 81)', 'HLPRCD(H1)'));
  check('an already-invalid H specification does not block an unrelated edit', guard(bad, src(K('DSPRL'), bad)) === null);
  check('inserting an H specification above an invalid one does not make the invalid one look new', guard(bad, withH(hspec('HLPARA(*NONE)', 'HLPRCD(H0)').concat(hspec('HLPARA(1 5 3 81)', 'HLPRCD(H1)')))) === null);
  check('the guard reads the spec: nothing is returned for a file with no H specification', guard(base, src(K('DSPRL'), base)) === null);
}

console.log('\n=== 3. the real webview ===');
const SOURCE = src(R('R1'), H('HLPRCD(H1)'), F('F1', 'B'), K("CHOICE(1 'One')"));
const html = webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'HELPSPEC.DSPF');
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
  function withAlert(fn) {
    const orig = dom.window.alert; let msg = null;
    dom.window.alert = (m) => { msg = m; }; fn(); dom.window.alert = orig; return msg;
  }
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const sel = doc.getElementById('recordSelect'); sel.value = 'R1'; fire(sel);
  fire(Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure'), 'click');
  const row = doc.querySelector('.help-entry-row');
  check('the record lists its H specification', !!row);
  fire(row, 'click');
  const prefix = 'help-' + row.getAttribute('data-source-line');
  const box = () => doc.getElementById(prefix + '-hlpara-params');
  const on = () => doc.getElementById(prefix + '-hlpara-on');
  check('the HLPARA row now has a parameter box (it was a bare checkbox)', !!box() && !!on());
  check('the parameter box names the five forms in its placeholder', /\*RCD/.test(box().getAttribute('placeholder')) && /\*FLD/.test(box().getAttribute('placeholder')) && /\*CNST/.test(box().getAttribute('placeholder')));
  function tick(params) {
    box().value = params; on().checked = true; posted.length = 0;
    return withAlert(() => fire(on()));
  }
  let msg = tick('');
  check('ticking HLPARA with an empty box is refused, nothing written', say(/HLPARA needs a parameter/, msg) && lastText() === null);
  msg = tick('*FLD NOPE');
  check('HLPARA(*FLD NOPE) is refused, nothing written', say(/NOPE is not a field of record format R1/, msg) && lastText() === null);
  msg = tick('1 5 3 81');
  check('HLPARA(1 5 3 81) is refused, nothing written', say(/position 81 is outside the 24 x 80 display size/, msg) && lastText() === null);
  msg = tick('*FLD F1 2');
  check('HLPARA(*FLD F1 2) is refused (choice 2 is not on F1), nothing written', say(/choice 2 is not specified/, msg) && lastText() === null);
  msg = tick('1 5 3 15');
  check('HLPARA(1 5 3 15) goes through and is written with its parameter', msg === null && /HLPARA\(1 5 3 15\)/.test(lastText() || ''));
  const out = parse(lastText() || SOURCE);
  check('the written source parses back to the same H specification (HLPARA and HLPRCD)', out.records[0].helpEntries[0].keywords.some((k) => k.name === 'HLPARA' && k.parameters === '1 5 3 15') && out.records[0].helpEntries[0].keywords.some((k) => k.name === 'HLPRCD'));
  const fails = failureCount();
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);

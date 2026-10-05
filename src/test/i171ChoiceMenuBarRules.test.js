/**
 * i171ChoiceMenuBarRules.test.js
 *
 * Task I-171 - raised by I-121l. The choice and menu-bar companion-keyword rules the
 * spec recorded as facts are now enforced (diff-based, like I-140 / I-151 / I-165):
 *   CHCAVAIL / CHCUNAVAIL / CHCSLT  need their choice keyword on the field (record level:
 *                                   SFLSNGCHC or SFLMLTCHC); CHCSLT with CHOICE (no MNUBARCHC)
 *                                   needs PULLDOWN(*NOSLTIND) on the record
 *   CHCACCEL                        needs SNGCHCFLD on the field and PULLDOWN on the record
 *   CHCCTL                          needs a CHOICE / PSHBTNCHC with the same number; a control
 *                                   field that exists must be hidden Y 1,0
 *   MNUBARCHC                       the record it names, when it exists, must have PULLDOWN
 * A control field / pull-down record that does not exist yet is a forward reference and is NOT refused.
 *
 * Covers: 1. spec accessors  2. model guard (diff semantics)  3. the committed-edit hook (jsdom)
 *
 * Run with: node src/test/i171ChoiceMenuBarRules.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require('../../dist/dspfParser.js');

console.log('=== 1. spec accessors ===');
const cc = (n) => KeywordSpec.choiceCompanionRules(n);
check('CHCAVAIL: one of PSHBTNCHC, CHOICE, MNUBARCHC; record level SFLSNGCHC / SFLMLTCHC', cc('CHCAVAIL').oneOfOnField.join() === 'PSHBTNCHC,CHOICE,MNUBARCHC' && cc('CHCAVAIL').subfileControlRecordOneOf.join() === 'SFLSNGCHC,SFLMLTCHC');
check('CHCUNAVAIL: one of CHOICE, PSHBTNCHC', cc('CHCUNAVAIL').oneOfOnField.join() === 'CHOICE,PSHBTNCHC');
check('CHCSLT: one of MNUBARCHC, CHOICE, and PULLDOWN(*NOSLTIND) when it is CHOICE', cc('CHCSLT').oneOfOnField.join() === 'MNUBARCHC,CHOICE' && cc('CHCSLT').choiceWithoutMnubarchcRecordNeeds === 'PULLDOWN(*NOSLTIND)');
check('CHCACCEL: SNGCHCFLD on the field, PULLDOWN on the record', cc('CHCACCEL').allOfOnField.join() === 'SNGCHCFLD' && cc('CHCACCEL').onRecord.join() === 'PULLDOWN');
check('CHCCTL rules: hidden Y 1,0 control field; CHOICE or PSHBTNCHC with the same number', JSON.stringify(KeywordSpec.chcctlRules()) === JSON.stringify({ controlField: { dataType: 'Y', length: 1, decimalPositions: 0, usage: 'H' }, sameNumberOneOf: ['CHOICE', 'PSHBTNCHC'] }));
check('MNUBARCHC: the named record must carry PULLDOWN', KeywordSpec.mnubarchcPullDownRecordKeyword() === 'PULLDOWN');
check('accessors return copies and null for unrelated keywords', cc('DUP') === null && (() => { cc('CHCSLT').oneOfOnField.pop(); return cc('CHCSLT').oneOfOnField.length === 2; })());

console.log('\n=== 2. model guard (diff semantics) ===');
const mk = (t) => DspfParser.parseDspf(t);
const A = '     A';
const L = (s) => A + s;
const base = [
  L('          R PULLEDIT                  PULLDOWN'),
  L("            F1             2Y 0B  1  2SNGCHCFLD"),
  L("                                      CHOICE(1 '>Undo')"),
  L('            CTL1           1Y 0H'),
  L('          R MENUBAR                   MNUBAR'),
  L('            MNUFLD         2Y 0B  1  2'),
  L("                                      MNUBARCHC(1 PULLEDIT 'Edit')"),
].join('\n') + '\n';
const after = (t, anchor, line) => t.replace(anchor, anchor + '\n' + line);
const reason = (a, b) => DspfWriter.choiceMenuBarNewConflictReason(mk(a), mk(b));
const KW = (s) => L('                                      ' + s);
const CHOICE1 = "CHOICE(1 '>Undo')";

console.log('  -- CHCACCEL');
{
  const withAcc = after(base, CHOICE1, KW("CHCACCEL(1 'F4')"));
  check('CHCACCEL on a SNGCHCFLD field in a PULLDOWN record is accepted', reason(base, withAcc) === null);
  check('removing SNGCHCFLD while CHCACCEL is present is refused', /CHCACCEL on field F1 needs SNGCHCFLD/.test(reason(withAcc, withAcc.replace('SNGCHCFLD', '         ')) || ''));
  check('removing PULLDOWN while CHCACCEL is present is refused', /CHCACCEL on field F1 needs PULLDOWN on record format PULLEDIT/.test(reason(withAcc, withAcc.replace('PULLDOWN', '        ')) || ''));
  check('adding CHCACCEL to a MLTCHCFLD field is refused', /needs SNGCHCFLD/.test(reason(base.replace('SNGCHCFLD', 'MLTCHCFLD'), after(base.replace('SNGCHCFLD', 'MLTCHCFLD'), CHOICE1, KW("CHCACCEL(1 'F4')"))) || ''));
}
console.log('  -- CHCAVAIL / CHCUNAVAIL / CHCSLT companions');
{
  const colour = KW('CHCAVAIL((*COLOR YLW))');
  check('CHCAVAIL on a field with CHOICE is accepted', reason(base, after(base, CHOICE1, colour)) === null);
  check('CHCAVAIL on a field with MNUBARCHC is accepted', reason(base, after(base, "MNUBARCHC(1 PULLEDIT 'Edit')", colour)) === null);
  check('CHCAVAIL on a field with no choice keyword is refused', /CHCAVAIL on field CTL1 needs PSHBTNCHC, CHOICE or MNUBARCHC/.test(reason(base, after(base, '1Y 0H', colour)) || ''));
  check('CHCUNAVAIL on a MNUBARCHC field is refused (it needs CHOICE or PSHBTNCHC)', /CHCUNAVAIL on field MNUFLD needs CHOICE or PSHBTNCHC/.test(reason(base, after(base, "MNUBARCHC(1 PULLEDIT 'Edit')", KW('CHCUNAVAIL((*COLOR TRQ))'))) || ''));
  check('CHCSLT on a field with MNUBARCHC is accepted', reason(base, after(base, "MNUBARCHC(1 PULLEDIT 'Edit')", KW('CHCSLT((*COLOR PNK))'))) === null);
  check('CHCSLT with CHOICE in a record without PULLDOWN(*NOSLTIND) is refused', /CHCSLT on field F1 with CHOICE \(and no MNUBARCHC\) needs PULLDOWN\(\*NOSLTIND\)/.test(reason(base, after(base, CHOICE1, KW('CHCSLT((*COLOR PNK))'))) || ''));
  const nosl = base.replace('PULLDOWN', 'PULLDOWN(*NOSLTIND)');
  check('CHCSLT with CHOICE in a PULLDOWN(*NOSLTIND) record is accepted', reason(nosl, after(nosl, CHOICE1, KW('CHCSLT((*COLOR PNK))'))) === null);
  const withSlt = after(nosl, CHOICE1, KW('CHCSLT((*COLOR PNK))'));
  check('removing *NOSLTIND while CHCSLT sits on a CHOICE field is refused', /needs PULLDOWN\(\*NOSLTIND\)/.test(reason(withSlt, withSlt.replace('PULLDOWN(*NOSLTIND)', 'PULLDOWN          ')) || ''));
  const push = [L('          R PUSH'), L('            P1             4A  B  1  2PSHBTNFLD'), KW("PSHBTNCHC(1 'OK')")].join('\n') + '\n';
  check('CHCAVAIL and CHCUNAVAIL on a push-button field are accepted (PSHBTNCHC is a companion)', reason(push, after(after(push, "PSHBTNCHC(1 'OK')", KW('CHCAVAIL((*COLOR YLW))')), 'CHCAVAIL((*COLOR YLW))', KW('CHCUNAVAIL((*COLOR TRQ))'))) === null);
  check('CHCSLT on a push-button field is refused (the reference gives it no push button)', /CHCSLT on field P1 needs MNUBARCHC or CHOICE/.test(reason(push, after(push, "PSHBTNCHC(1 'OK')", KW('CHCSLT((*COLOR PNK))'))) || ''));
  const sfl = [L('          R SFL1                      SFL'), L('            S1             2Y 0O  5  2'), L('          R CTL1                      SFLCTL(SFL1)'), KW('SFLSNGCHC'), KW('SFLDSP SFLDSPCTL')].join('\n') + '\n';
  check('record-level CHCAVAIL on a subfile control record with SFLSNGCHC is accepted', reason(sfl, after(sfl, 'SFLSNGCHC', KW('CHCAVAIL((*COLOR YLW))'))) === null);
  const noChc = sfl.replace('SFLSNGCHC', '         ');
  check('record-level CHCSLT on a record with neither SFLSNGCHC nor SFLMLTCHC is refused', /CHCSLT on record format CTL1 needs SFLSNGCHC or SFLMLTCHC/.test(reason(noChc, after(noChc, 'SFLDSP SFLDSPCTL', KW('CHCSLT((*COLOR PNK))'))) || ''));
  const chcOk = after(sfl, 'SFLSNGCHC', KW('CHCAVAIL((*COLOR YLW))'));
  check('removing SFLSNGCHC while the record-level CHCAVAIL remains is refused', /needs SFLSNGCHC or SFLMLTCHC/.test(reason(chcOk, chcOk.replace('SFLSNGCHC', '         ')) || ''));
}
console.log('  -- CHCCTL');
{
  check('CHCCTL with a matching CHOICE and a hidden Y 1,0 control field is accepted', reason(base, after(base, CHOICE1, KW('CHCCTL(1 &CTL1)'))) === null);
  check('CHCCTL(2 ...) with no CHOICE 2 on the field is refused', /CHCCTL\(2\) on field F1 needs a CHOICE or PSHBTNCHC keyword with the same choice number/.test(reason(base, after(base, CHOICE1, KW('CHCCTL(2 &CTL1)'))) || ''));
  const withCtl = after(base, CHOICE1, KW('CHCCTL(1 &CTL1)'));
  check('changing the control field to 2 digits is refused', /control field CTL1 must be a hidden 1-byte numeric field/.test(reason(withCtl, withCtl.replace('1Y 0H', '2Y 0H')) || ''));
  check('changing the control field to usage B is refused', /control field CTL1 must be a hidden 1-byte numeric field/.test(reason(withCtl, withCtl.replace('1Y 0H', '1Y 0B')) || ''));
  check('changing the control field to data type A is refused', /control field CTL1 must be a hidden 1-byte numeric field/.test(reason(withCtl, withCtl.replace('1Y 0H', '1A   H')) || ''));
  check('a control field that does not exist yet is a forward reference, not refused', reason(base, after(base, CHOICE1, KW('CHCCTL(1 &NOTYET)'))) === null);
  check('the "&" on the control field name is optional in the match', reason(base, after(base, CHOICE1, KW('CHCCTL(1 CTL1)'))) === null);
  check('choice numbers match numerically (01 and 1)', reason(base, after(base.replace(CHOICE1, "CHOICE(01 '>Undo')"), "CHOICE(01 '>Undo')", KW('CHCCTL(1 &CTL1)'))) === null);
  check('removing the CHOICE the CHCCTL points at is refused', /CHCCTL\(1\) on field F1 needs a CHOICE or PSHBTNCHC/.test(reason(withCtl, withCtl.replace(L('                                      ' + CHOICE1) + '\n', '')) || ''));
}
console.log('  -- MNUBARCHC');
{
  check('MNUBARCHC naming a PULLDOWN record is accepted (the fixture)', DspfWriter.choiceMenuBarNewConflictReason(mk(''), mk(base)) === null);
  check('MNUBARCHC naming an existing record without PULLDOWN is refused', /MNUBARCHC on field MNUFLD names record format MENUBAR, which has no PULLDOWN/.test(reason(base, base.replace("MNUBARCHC(1 PULLEDIT", 'MNUBARCHC(1 MENUBAR')) || ''));
  check('removing PULLDOWN from the record a MNUBARCHC names is refused', /names record format PULLEDIT, which has no PULLDOWN/.test(reason(base, base.replace('PULLDOWN', '        ')) || ''));
  check('MNUBARCHC naming a record that does not exist yet is a forward reference, not refused', reason(base, base.replace("MNUBARCHC(1 PULLEDIT", 'MNUBARCHC(1 LATER')) === null);
}
console.log('  -- diff semantics');
{
  const bad = after(base, CHOICE1, KW("CHCACCEL(1 'F4')")).replace('SNGCHCFLD', '         ');
  check('an already-invalid hand-written file is reported by neither the same model twice nor an unrelated edit', reason(bad, bad) === null && reason(bad, bad.replace("'>Undo'", "'>Redo'")) === null);
  check('the same violation is not reported when it was already there', reason(bad, after(bad, CHOICE1, KW('CHCAVAIL((*COLOR YLW))'))) === null);
  check('a null / empty model is harmless', DspfWriter.choiceMenuBarNewConflictReason(null, null) === null && DspfWriter.choiceMenuBarNewConflictReason({}, { records: [] }) === null);
}

console.log('\n=== 3. the committed-edit hook (jsdom, raw keyword editor) ===');
const SRC = [
  L('          R PULLEDIT                  PULLDOWN'),
  L("            F1             2Y 0B  1  2SNGCHCFLD"),
  L("                                      CHOICE(1 '>Undo')"),
  L('            CTL1           1Y 0H'),
  L('            F2             5A  B  3  2'),
].join('\n') + '\n';
const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I171.DSPF');
const posted = [];
const alerts = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => alerts.push(m);
    window.Element.prototype.getBoundingClientRect = function () {
      return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
    };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const el = (id) => doc.getElementById(id);
  function selectField(line) {
    const box = doc.querySelector('.dspf-field[data-source-line="' + line + '"]');
    if (!box) { check('setup: field on source line ' + line + ' is on the canvas', false); return false; }
    box.click();
    posted.length = 0;
    alerts.length = 0;
    return true;
  }
  const lastEdit = () => posted.filter((m) => m.type === 'applyEdit').pop();
  function rawAdd(line, name, params) {
    el('field-' + line + '-new-kw-name').value = name;
    const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  }
  // Raw keyword chips carry data-owner / data-idx only, so match on the chip's own text ("NAME" or "NAME(params)").
  function removeKw(line, name) {
    const chip = Array.from(doc.querySelectorAll('.kw-remove[data-owner="field-' + line + '"]')).find((c) => {
      const t = c.parentElement.textContent.trim().replace(/\u00d7$/, '');
      return t === name || t.indexOf(name + '(') === 0;
    });
    if (chip) chip.dispatchEvent(new Event('click', { bubbles: true }));
    return !!chip;
  }
  const fieldNamed = (text, name) => { const out = []; DspfParser.parseDspf(text).records.forEach((r) => r.fields.forEach((f) => out.push(f))); return out.find((f) => f.name === name); };

  // Refusals first: a refused edit posts nothing and leaves the source (and so every source line number) alone.
  console.log('  -- refusals');
  check('fixture: F1 is on the canvas', selectField(2));
  rawAdd(2, 'CHCCTL', '2 &CTL1');
  check('raw-adding CHCCTL(2 ...) with no CHOICE 2 is refused with the DDS wording', alerts.length === 1 && /CHCCTL\(2\) on field F1 needs a CHOICE or PSHBTNCHC keyword with the same choice number/.test(alerts[0]) && !lastEdit());
  check('fixture: F2 (a plain field; the hidden CTL1 is not drawn) is on the canvas', selectField(5));
  rawAdd(5, 'CHCAVAIL', '(*COLOR YLW)');
  check('raw-adding CHCAVAIL to a field with no choice keyword is refused', alerts.length === 1 && /CHCAVAIL on field F2 needs PSHBTNCHC, CHOICE or MNUBARCHC/.test(alerts[0]) && !lastEdit());
  check('fixture: F1 selectable again', selectField(2));
  rawAdd(2, 'CHCSLT', '(*COLOR PNK)');
  check('raw-adding CHCSLT to a CHOICE field in a record without PULLDOWN(*NOSLTIND) is refused', alerts.length === 1 && /CHCSLT on field F1 with CHOICE \(and no MNUBARCHC\) needs PULLDOWN\(\*NOSLTIND\)/.test(alerts[0]) && !lastEdit());

  console.log('  -- accepted edits');
  check('F1 selectable once more', selectField(2));
  rawAdd(2, 'CHCACCEL', "1 'F4'");
  check('raw-adding CHCACCEL to the SNGCHCFLD field in the PULLDOWN record is accepted, no alert', alerts.length === 0 && !!lastEdit() && fieldNamed(lastEdit().text, 'F1').keywords.some((k) => k.name === 'CHCACCEL'));
  check('F1 selectable after the edit', selectField(2));
  rawAdd(2, 'CHCCTL', '1 &CTL1');
  check('raw-adding CHCCTL(1 &CTL1) beside CHOICE 1 is accepted, no alert', alerts.length === 0 && !!lastEdit() && fieldNamed(lastEdit().text, 'F1').keywords.some((k) => k.name === 'CHCCTL'));

  console.log('  -- removing what a keyword depends on');
  check('F1 selectable for the removal', selectField(2));
  const removed = removeKw(2, 'SNGCHCFLD');
  check('the SNGCHCFLD chip is there to remove', removed);
  check('removing SNGCHCFLD while CHCACCEL is present is refused, and nothing is posted', alerts.length === 1 && /CHCACCEL on field F1 needs SNGCHCFLD/.test(alerts[0]) && !lastEdit());

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

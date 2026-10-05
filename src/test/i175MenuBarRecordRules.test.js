/**
 * i175MenuBarRecordRules.test.js
 *
 * Task I-175 - MNUBARSEP and MNUBARCHC need MNUBAR on their record ("The MNUBAR keyword must be on
 * the record" / "required at the record level"), and MNUBARSEP cannot be used where MNUBAR says
 * *NOSEPARATOR. The I-121l spec recorded both; nothing enforced them.
 *
 * Covers: 1. spec accessor  2. model guard (both directions, diff semantics)  3. raw keyword editor (jsdom)
 *
 * Run with: node src/test/i175MenuBarRecordRules.test.js
 */
'use strict';

const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
global.DspfWriter = DspfWriter;
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require('../../dist/dspfParser.js');

console.log('=== 1. spec accessor ===');
const sep = KeywordSpec.menuBarRecordRules('MNUBARSEP');
const chc = KeywordSpec.menuBarRecordRules('mnubarchc');
check('MNUBARSEP: MNUBAR required on the record, *NOSEPARATOR conflicts', sep && sep.requiresOnRecord.join() === 'MNUBAR' && sep.conflictsWithMnubarParameter === '*NOSEPARATOR');
check('MNUBARCHC (any case): MNUBAR required on the record, no parameter conflict', chc && chc.requiresOnRecord.join() === 'MNUBAR' && chc.conflictsWithMnubarParameter === null);
check('any other keyword -> null', KeywordSpec.menuBarRecordRules('CHOICE') === null && KeywordSpec.menuBarRecordRules('') === null && KeywordSpec.menuBarRecordRules(undefined) === null);
check('the accessor returns copies', (() => { const r = KeywordSpec.menuBarRecordRules('MNUBARSEP'); r.requiresOnRecord.push('X'); return KeywordSpec.menuBarRecordRules('MNUBARSEP').requiresOnRecord.length === 1; })());

const A = '     A';
const L = (s) => A + s;
const KW = (s) => L('                                      ' + s);
const mk = (t) => DspfParser.parseDspf(t);
// o.mnubar: undefined -> 'MNUBAR', null -> no MNUBAR keyword, string -> MNUBAR + that text
// o.sep / o.chc: the field carries MNUBARSEP / MNUBARCHC
function src(o) {
  o = o || {};
  const mb = o.mnubar === null ? '' : (o.mnubar === undefined ? 'MNUBAR' : 'MNUBAR' + o.mnubar);
  const lines = [L('          R MENUBAR                   ' + mb), L('            MNUFLD         2Y 0B  1  2')];
  if (o.chc) lines.push(KW("MNUBARCHC(1 P 'File')"));
  if (o.sep) lines.push(KW("MNUBARSEP(*CHAR '-')"));
  return lines.join('\n') + '\n';
}
const reason = (a, b) => DspfWriter.choiceMenuBarNewConflictReason(mk(a), mk(b));

console.log('\n=== 2. model guard ===');
check('MNUBARSEP beside MNUBAR(*NOSEPARATOR) is refused with the DDS wording', /MNUBARSEP on field MNUFLD cannot be used while MNUBAR on record format MENUBAR specifies \*NOSEPARATOR \(per the DDS Reference\)/.test(reason(src({ mnubar: '(*NOSEPARATOR)' }), src({ mnubar: '(*NOSEPARATOR)', sep: true })) || ''));
check('adding *NOSEPARATOR to an MNUBAR whose field has MNUBARSEP is refused', /\*NOSEPARATOR/.test(reason(src({ sep: true }), src({ mnubar: '(*NOSEPARATOR)', sep: true })) || ''));
check('MNUBARSEP beside MNUBAR(*SEPARATOR) is accepted', reason(src({ mnubar: '(*SEPARATOR)' }), src({ mnubar: '(*SEPARATOR)', sep: true })) === null);
check('MNUBARSEP beside a plain MNUBAR is accepted', reason(src(), src({ sep: true })) === null);
check('the parameter match is case-insensitive (lower case in source)', /\*NOSEPARATOR/.test(reason(src({ mnubar: '(*noseparator)' }), src({ mnubar: '(*noseparator)', sep: true })) || ''));
check('MNUBARSEP on a record with no MNUBAR is refused', /MNUBARSEP on field MNUFLD needs MNUBAR on record format MENUBAR: the MNUBAR keyword must be on the record \(per the DDS Reference\)/.test(reason(src({ mnubar: null }), src({ mnubar: null, sep: true })) || ''));
check('MNUBARCHC on a record with no MNUBAR is refused', /MNUBARCHC on field MNUFLD needs MNUBAR on record format MENUBAR/.test(reason(src({ mnubar: null }), src({ mnubar: null, chc: true })) || ''));
check('removing MNUBAR while MNUBARSEP stays is refused', /needs MNUBAR/.test(reason(src({ sep: true }), src({ mnubar: null, sep: true })) || ''));
check('removing MNUBAR while MNUBARCHC stays is refused', /MNUBARCHC on field MNUFLD needs MNUBAR/.test(reason(src({ chc: true }), src({ mnubar: null, chc: true })) || ''));
check('MNUBARCHC with MNUBAR is accepted', reason(src(), src({ chc: true })) === null);
check('MNUBARCHC beside MNUBAR(*NOSEPARATOR) is accepted (only MNUBARSEP conflicts)', reason(src({ mnubar: '(*NOSEPARATOR)' }), src({ mnubar: '(*NOSEPARATOR)', chc: true })) === null);
check('an already-invalid hand-written record does not block an unrelated edit', reason(src({ mnubar: null, sep: true }), src({ mnubar: null, sep: true, chc: false })) === null);
check('MNUBARSEP on a record that is already invalid is not re-reported, a new violation still is', (() => {
  const before = src({ mnubar: null, sep: true });
  return reason(before, before) === null && /MNUBARCHC/.test(reason(before, src({ mnubar: null, sep: true, chc: true })) || '');
})());
check('no menu-bar keywords at all -> nothing to report', reason(src(), src()) === null);

console.log('\n=== 3. the committed-edit hook (jsdom, raw keyword editor) ===');
const SRC = src({ mnubar: '(*NOSEPARATOR)', chc: true });
const html = webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I175.DSPF');
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
  const lastEdit = () => posted.filter((m) => m.type === 'applyEdit').pop();
  const box = doc.querySelector('.dspf-field[data-source-line="2"]');
  check('fixture: the menu-bar field is on the canvas', !!box);
  if (!box) { process.exit(1); }
  box.click();
  posted.length = 0; alerts.length = 0;
  function rawAdd(line, name, params) {
    el('field-' + line + '-new-kw-name').value = name;
    const pe = el('field-' + line + '-new-kw-params'); if (pe) pe.value = params || '';
    doc.querySelector('.kw-add[data-owner="field-' + line + '"]').dispatchEvent(new Event('click', { bubbles: true }));
  }
  rawAdd(2, 'MNUBARSEP', "*CHAR '-'");
  check('raw-adding MNUBARSEP under MNUBAR(*NOSEPARATOR) is refused with the DDS wording and posts nothing', alerts.length === 1 && /MNUBARSEP on field MNUFLD cannot be used while MNUBAR on record format MENUBAR specifies \*NOSEPARATOR/.test(alerts[0]) && !lastEdit());
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

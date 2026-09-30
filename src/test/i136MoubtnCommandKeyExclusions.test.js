/**
 * i136MoubtnCommandKeyExclusions.test.js
 *
 * Task I-136 - MOUBTN's DDS Reference section lists the keywords that
 * cannot be specified when a Command key is used on MOUBTN: CFxx excludes
 * ALTHELP(CAyy) and CAxx, CAxx excludes ALTPAGEDWN(CFyy), ALTPAGEUP(CFyy)
 * and CFxx (xx = yy), and CF01 / CA07 / CA08 exclude the alt keys written
 * with no parameter (their defaults). Every row is one rule: a MOUBTN
 * Command key and a partner claiming the SAME number as the OPPOSITE type.
 *
 *  1. the spec fact (partners, defaults, plain key types, citation, copy).
 *  2. DspfWriter.moubtnCommandKeyConflictReason: every table row from both
 *     sides, same-type pairs allowed, non-key MOUBTN targets ignored,
 *     scope (file vs record vs other record), singleton replacement,
 *     queue-flag stripping, fail-safe input.
 *  3. the panels in jsdom: MOUBTN key edit, alt-key rows, "+ Add command
 *     key" all refuse a clash (alert + no applyEdit) and accept a clean edit.
 *
 * Run with: node src/test/i136MoubtnCommandKeyExclusions.test.js
 */
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const why = (candidate, file, records) => DspfWriter.moubtnCommandKeyConflictReason(candidate, file || [], records || []);

console.log('=== 1. the spec fact ===');
{
  const e = KeywordSpec.moubtnCommandKeyExclusion();
  check('rule name', e.rule === 'oppositeTypeSameNumber');
  check('partners and defaults from the alt-key sections', JSON.stringify(e.partners) === JSON.stringify([
    { keyword: 'ALTHELP', keyType: 'CA', defaultKey: 'CA01' },
    { keyword: 'ALTPAGEDWN', keyType: 'CF', defaultKey: 'CF08' },
    { keyword: 'ALTPAGEUP', keyType: 'CF', defaultKey: 'CF07' }]));
  check('plain key types', JSON.stringify(e.plainKeyTypes) === '["CA","CF"]');
  check('citation names the table rows', /CFxx/.test(e.ddsReference) && /ALTHELP\(CAyy\)/.test(e.ddsReference) && /CA07/.test(e.ddsReference));
  e.partners.push({ keyword: 'X' }); e.plainKeyTypes.push('X');
  check('accessor returns copies', KeywordSpec.moubtnCommandKeyExclusion().partners.length === 3 && KeywordSpec.moubtnCommandKeyExclusion().plainKeyTypes.length === 2);
  check('ALTHELP defaults agree with the ALTHELP alt-key spec (CA type = CA key)', e.partners[0].keyType === 'CA');
}

console.log('\n=== 2. the writer guard ===');
console.log('  -- MOUBTN Command key CFxx vs ALTHELP(CAyy) / CAxx (xx = yy)');
check('MOUBTN CF05 vs ALTHELP(CA05)', /CF05|CA05/.test(why(kw('MOUBTN', '*ULP CF05'), [kw('ALTHELP', 'CA05')]) || ''));
check('MOUBTN CF05 vs ALTHELP(CA06) is fine', why(kw('MOUBTN', '*ULP CF05'), [kw('ALTHELP', 'CA06')]) === null);
check('MOUBTN CF05 vs CA05', !!why(kw('MOUBTN', '*ULP CF05'), [kw('CA05')]));
check('MOUBTN CF05 vs CA06 is fine', why(kw('MOUBTN', '*ULP CF05'), [kw('CA06')]) === null);
console.log('  -- MOUBTN Command key CAxx vs ALTPAGEDWN(CFyy) / ALTPAGEUP(CFyy) / CFxx');
check('MOUBTN CA09 vs ALTPAGEDWN(CF09)', !!why(kw('MOUBTN', '*ULP CA09'), [kw('ALTPAGEDWN', 'CF09')]));
check('MOUBTN CA09 vs ALTPAGEUP(CF09)', !!why(kw('MOUBTN', '*ULP CA09'), [kw('ALTPAGEUP', 'CF09')]));
check('MOUBTN CA09 vs CF09', !!why(kw('MOUBTN', '*ULP CA09'), [kw('CF09')]));
check('MOUBTN CA09 vs ALTPAGEDWN(CF10) is fine', why(kw('MOUBTN', '*ULP CA09'), [kw('ALTPAGEDWN', 'CF10')]) === null);
console.log('  -- the no-parameter rows (defaults)');
check('MOUBTN CF01 vs ALTHELP with no parameter', /default CA01/.test(why(kw('MOUBTN', '*ULP CF01'), [kw('ALTHELP')]) || ''));
check('MOUBTN CA07 vs ALTPAGEUP with no parameter', /default CF07/.test(why(kw('MOUBTN', '*ULP CA07'), [kw('ALTPAGEUP')]) || ''));
check('MOUBTN CA08 vs ALTPAGEDWN with no parameter', /default CF08/.test(why(kw('MOUBTN', '*ULP CA08'), [kw('ALTPAGEDWN')]) || ''));
check('MOUBTN CF08 vs ALTPAGEDWN with no parameter (same type) is fine', why(kw('MOUBTN', '*ULP CF08'), [kw('ALTPAGEDWN')]) === null);
console.log('  -- from the other side (adding the partner while MOUBTN exists)');
check('add ALTHELP (default CA01) with MOUBTN CF01', !!why(kw('ALTHELP'), [kw('MOUBTN', '*ULP CF01')]));
check('add ALTHELP(CA02) with MOUBTN CF01 is fine', why(kw('ALTHELP', 'CA02'), [kw('MOUBTN', '*ULP CF01')]) === null);
check('add ALTPAGEUP (default CF07) with MOUBTN CA07', !!why(kw('ALTPAGEUP'), [kw('MOUBTN', '*ULP CA07')]));
check('add ALTPAGEDWN(CF03) with MOUBTN CA03', !!why(kw('ALTPAGEDWN', 'CF03'), [kw('MOUBTN', '*ULP CA03')]));
check('add plain CA04 with MOUBTN CF04', !!why(kw('CA04'), [kw('MOUBTN', '*ULP CF04')]));
check('add plain CF04 with MOUBTN CF04 (same type) is fine', why(kw('CF04'), [kw('MOUBTN', '*ULP CF04')]) === null);
console.log('  -- what is not a Command-key clash');
check('MOUBTN with ENTER / ROLLUP / an EVENT-ID never clashes', ['ENTER', 'ROLLUP', 'ROLLDOWN', 'HELP', 'HOME', 'PRINT', 'CLEAR', 'E05'].every((k) => why(kw('MOUBTN', '*ULP ' + k), [kw('ALTHELP'), kw('CA01'), kw('CF01'), kw('ALTPAGEUP')]) === null));
check('a queue flag after the key is stripped', !!why(kw('MOUBTN', '*ULP CF05 *QUEUE'), [kw('CA05')]) && !!why(kw('MOUBTN', '*ULP *URP CF05 *NOQUEUE'), [kw('CA05')]));
check('MOUBTN never clashes with another MOUBTN', why(kw('MOUBTN', '*ULP CF05'), [kw('MOUBTN', '*URP CA05')]) === null);
check('lowercase key text is read', !!why(kw('MOUBTN', '*ULP cf05'), [kw('CA05')]));
check('an unfinished MOUBTN (one token) is ignored', why(kw('MOUBTN', '*ULP'), [kw('ALTHELP')]) === null);
console.log('  -- scope');
check('record MOUBTN vs file-level ALTHELP (extends to every record)', !!why(kw('MOUBTN', '*ULP CF01'), [kw('ALTHELP')], [[]]));
check('record MOUBTN vs same-record CA03', !!why(kw('MOUBTN', '*ULP CF03'), [], [[kw('CA03')]]));
check('record MOUBTN vs a DIFFERENT record\'s CA03 is fine when the caller passes only its own record', why(kw('MOUBTN', '*ULP CF03'), [], [[]]) === null);
check('file-level MOUBTN vs any record\'s CA03 (a file-level MOUBTN reaches all records)', !!why(kw('MOUBTN', '*ULP CF03'), [], [[kw('CA01')], [kw('CA03')]]));
check('file-level ALTHELP(CA02) vs a record MOUBTN CF02', !!why(kw('ALTHELP', 'CA02'), [], [[kw('MOUBTN', '*ULP CF02')]]));
check('editing ALTHELP does not conflict with its own old value', why(kw('ALTHELP', 'CA05'), [kw('ALTHELP', 'CA01'), kw('MOUBTN', '*ULP CF03')]) === null);
check('changing ALTHELP away from a clashing key is allowed', why(kw('ALTHELP', 'CA02'), [kw('ALTHELP', 'CA01'), kw('MOUBTN', '*ULP CF01')]) === null);
console.log('  -- fail-safe');
check('unrelated keyword / null / empty inputs give null', why(kw('DUP'), [kw('MOUBTN', '*ULP CF01')]) === null && why(null) === null && why({}) === null && why(kw('MOUBTN'), undefined, undefined) === null);
check('message names both keywords, the number, both types and the reference', (() => {
  const r = why(kw('MOUBTN', '*ULP CF05'), [kw('CA05')]);
  return /MOUBTN\(\*ULP CF05\)/.test(r) && /CA05/.test(r) && /05/.test(r) && /CF and CA|CA and CF/.test(r) && /cannot be combined/.test(r);
})());

console.log('\n=== 3. the panels (jsdom) ===');
const dspfSource = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A          R SCR1',
  "     A                                  1  2'MAIN SCREEN'",
].join('\n') + '\n';
const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;
  function withAlert(fn) {
    const orig = dom.window.alert;
    let msg = null;
    dom.window.alert = (m) => { msg = m; };
    fn();
    dom.window.alert = orig;
    return msg;
  }
  const lastEdit = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e && DspfParser.parseDspf(e.text); };
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));

  console.log('  -- add a MOUBTN (placeholder *ULP CF01) then an ALTHELP with no parameter');
  posted.length = 0;
  doc.querySelector('.repeat-inst-add[data-prefix="fk-moubtn-rep"]').dispatchEvent(new Event('click', { bubbles: true }));
  {
    const r = lastEdit();
    check('MOUBTN(*ULP CF01) added', !!r && r.fileKeywords.some((k) => k.name === 'MOUBTN' && /CF01/.test(k.parameters)));
  }
  posted.length = 0;
  {
    const onEl = doc.getElementById('fk-althelp-on');
    onEl.checked = true;
    const alertMsg = withAlert(() => fire(onEl, 'change'));
    check('ALTHELP with no parameter refused: alert names ALTHELP, the default CA01 and MOUBTN', /ALTHELP/.test(alertMsg || '') && /CA01/.test(alertMsg || '') && /MOUBTN/.test(alertMsg || ''));
    check('no applyEdit posted for the refused ALTHELP', !posted.some((m) => m.type === 'applyEdit'));
  }
  posted.length = 0;
  {
    const onEl = doc.getElementById('fk-althelp-on');
    const paramsEl = doc.getElementById('fk-althelp-params');
    onEl.checked = true;
    paramsEl.value = 'CA02';
    const alertMsg = withAlert(() => fire(onEl, 'change'));
    const r = lastEdit();
    check('ALTHELP(CA02) accepted, no alert', alertMsg === null && !!r && r.fileKeywords.some((k) => k.name === 'ALTHELP' && /CA02/.test(k.parameters)));
  }

  console.log('  -- alt page keys');
  posted.length = 0;
  {
    // Re-query: the panel re-renders after each commit.
    const onEl = doc.getElementById('fk-altpageup-on');
    onEl.checked = true;
    const alertMsg = withAlert(() => fire(onEl, 'change'));
    check('ALTPAGEUP (default CF07) is fine while the only MOUBTN key is CF01', alertMsg === null && !!lastEdit() && lastEdit().fileKeywords.some((k) => k.name === 'ALTPAGEUP'));
  }

  console.log('  -- editing the MOUBTN key into a clash');
  posted.length = 0;
  {
    const keyEl = doc.querySelector('.fk-moubtn-rep-inst0-key');
    keyEl.value = 'CF02';
    const alertMsg = withAlert(() => fire(keyEl, 'change'));
    check('MOUBTN CF02 refused against ALTHELP(CA02)', /CF02/.test(alertMsg || '') && /ALTHELP\(CA02\)/.test(alertMsg || ''));
    check('no applyEdit posted for the refused key edit', !posted.some((m) => m.type === 'applyEdit'));
  }
  posted.length = 0;
  {
    const keyEl = doc.querySelector('.fk-moubtn-rep-inst0-key');
    keyEl.value = 'CA07';
    const alertMsg = withAlert(() => fire(keyEl, 'change'));
    check('MOUBTN CA07 refused against ALTPAGEUP with no parameter (default CF07)', /CA07/.test(alertMsg || '') && /default CF07/.test(alertMsg || ''));
  }
  posted.length = 0;
  {
    const keyEl = doc.querySelector('.fk-moubtn-rep-inst0-key');
    keyEl.value = 'CF08';
    const alertMsg = withAlert(() => fire(keyEl, 'change'));
    const r = lastEdit();
    check('MOUBTN CF08 accepted (same type as the alt keys, no clash)', alertMsg === null && !!r && r.fileKeywords.some((k) => k.name === 'MOUBTN' && /CF08/.test(k.parameters)));
  }

  console.log('  -- "+ Add command key" (file level)');
  function addKey(type, number) {
    doc.querySelector('.cmdkey-type[data-prefix="file"]').value = type;
    doc.querySelector('.cmdkey-number[data-prefix="file"]').value = number;
    return withAlert(() => doc.querySelector('.cmdkey-add[data-prefix="file"]').dispatchEvent(new Event('click', { bubbles: true })));
  }
  posted.length = 0;
  {
    const alertMsg = addKey('CA', '08');
    check('adding CA08 refused while MOUBTN uses CF08', /CA08/.test(alertMsg || '') && /CF08/.test(alertMsg || ''));
    check('no applyEdit posted for the refused CA08', !posted.some((m) => m.type === 'applyEdit'));
  }
  posted.length = 0;
  {
    const alertMsg = addKey('CF', '08');
    const r = lastEdit();
    check('adding CF08 (same type) accepted', alertMsg === null && !!r && r.fileKeywords.some((k) => k.name === 'CF08'));
  }
  posted.length = 0;
  {
    const alertMsg = addKey('CA', '09');
    const r = lastEdit();
    check('adding CA09 (no MOUBTN on 09) accepted', alertMsg === null && !!r && r.fileKeywords.some((k) => k.name === 'CA09'));
  }

  console.log('  -- record level');
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'SCR1';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  posted.length = 0;
  {
    const add = doc.querySelector('.repeat-inst-add[data-prefix$="-moubtn-rep"]:not([data-prefix="fk-moubtn-rep"])');
    check('setup: the record has its own MOUBTN "+ Add"', !!add);
    if (add) add.dispatchEvent(new Event('click', { bubbles: true }));
    const r = lastEdit();
    const rec = r && r.records.find((x) => x.name === 'SCR1');
    check('record MOUBTN placeholder added (file has ALTHELP(CA02) only, so CF01 is clean)', !!rec && rec.keywords.some((k) => k.name === 'MOUBTN'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

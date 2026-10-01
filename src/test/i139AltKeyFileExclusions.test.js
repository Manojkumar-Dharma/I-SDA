/**
 * i139AltKeyFileExclusions.test.js
 *
 * Task I-139 - ALTHELP, ALTPAGEDWN and ALTPAGEUP each claim a command key
 * (the written one, or the documented default CA01 / CF08 / CF07), and their
 * own DDS Reference sections list the keywords that "cannot be specified in
 * a file with" them on the same key number. This task enforces the whole
 * table as a model-diff check on every committed edit (I-136 had covered
 * only the MOUBTN rows, in two panels).
 *
 *  1. the spec fact: per alt key, type / default / the IBM-listed keywords
 *     and each one's relation (any / caOnly / opposite), copies, citations.
 *  2. every IBM list, row by row, from the three sections' text (default
 *     rows and same-number rows) against the writer, plus the negatives
 *     (different number; opposite-only keywords with the same key type).
 *  3. scope and shape: file / record / field level, diff-based reporting,
 *     counts, message content, fail-safe input.
 *  4. the committed-edit hook in jsdom: refuses a clash (alert, no
 *     applyEdit), accepts clean and unrelated edits, tolerates an already-
 *     invalid hand-written file.
 *
 * Run with: node src/test/i139AltKeyFileExclusions.test.js
 */
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require('../../dist/dspfParser.js');

const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });
const model = (fileKeywords, records) => ({ fileKeywords: fileKeywords || [], records: records || [] });
const rec = (name, keywords, fields) => ({ name, keywords: keywords || [], fields: fields || [] });
const fld = (name, keywords) => ({ name, keywords: keywords || [] });
const clash = (m) => DspfWriter.altKeyFileExclusionNewConflictReason(model(), m);
const f = (...kws) => model(kws);

console.log('=== 1. the spec fact ===');
const ex = KeywordSpec.altKeyFileExclusions();
check('one entry per alt key', Object.keys(ex).join() === 'ALTHELP,ALTPAGEDWN,ALTPAGEUP');
check('claimed key types and defaults', ex.ALTHELP.keyType === 'CA' && ex.ALTHELP.defaultKey === 'CA01' && ex.ALTPAGEDWN.keyType === 'CF' && ex.ALTPAGEDWN.defaultKey === 'CF08' && ex.ALTPAGEUP.keyType === 'CF' && ex.ALTPAGEUP.defaultKey === 'CF07');
const names = (k) => ex[k].excluded.map((x) => x.keyword).sort().join();
check('ALTHELP excluded set (IBM list, 11)', names('ALTHELP') === 'ALTPAGEDWN,ALTPAGEUP,CAnn,CFnn,MNUBARSW,MNUCNL,MOUBTN,PSHBTNCHC,SFLDROP,SFLENTER,SFLFOLD');
check('ALTPAGEDWN excluded set (IBM list, 11)', names('ALTPAGEDWN') === 'ALTHELP,ALTPAGEUP,CAnn,CFnn,MNUBARSW,MNUCNL,MOUBTN,PSHBTNCHC,SFLDROP,SFLENTER,SFLFOLD');
check('ALTPAGEUP excluded set (IBM list, 11)', names('ALTPAGEUP') === 'ALTHELP,ALTPAGEDWN,CAnn,CFnn,MNUBARSW,MNUCNL,MOUBTN,PSHBTNCHC,SFLDROP,SFLENTER,SFLFOLD');
const rel = (k, n) => ex[k].excluded.find((x) => x.keyword === n).relation;
check('relations: MOUBTN / PSHBTNCHC opposite, MNUCNL / MNUBARSW caOnly, the rest any', ['ALTHELP', 'ALTPAGEDWN', 'ALTPAGEUP'].every((k) =>
  rel(k, 'MOUBTN') === 'opposite' && rel(k, 'PSHBTNCHC') === 'opposite' && rel(k, 'MNUCNL') === 'caOnly' && rel(k, 'MNUBARSW') === 'caOnly'
  && ['CAnn', 'CFnn', 'SFLDROP', 'SFLENTER', 'SFLFOLD'].every((n) => rel(k, n) === 'any')));
check('every alt key lists the other two as "any"', rel('ALTHELP', 'ALTPAGEDWN') === 'any' && rel('ALTPAGEDWN', 'ALTHELP') === 'any' && rel('ALTPAGEUP', 'ALTPAGEDWN') === 'any');
check('citations quote the section list', ['ALTHELP', 'ALTPAGEDWN', 'ALTPAGEUP'].every((k) => /cannot be specified in a file with/.test(ex[k].ddsReference) && /SFLFOLD/.test(ex[k].ddsReference)));
ex.ALTHELP.excluded.push({ keyword: 'X' });
check('accessor returns copies', KeywordSpec.altKeyFileExclusions().ALTHELP.excluded.length === 11);
const moubtn = KeywordSpec.moubtnCommandKeyExclusion();
check('agrees with I-136: same default keys, MOUBTN relation is the opposite type', moubtn.partners.every((p) => ex[p.keyword].defaultKey === p.defaultKey && ex[p.keyword].keyType === p.keyType));

console.log('\n=== 2. IBM lists, row by row ===');
// Each row: the text IBM prints, as [keyword, parameter-or-key].
function row(spec) {
  if (/^C[AF]\d\d$/.test(spec)) return { place: 'file', keyword: kw(spec) };
  const m = /^([A-Z]+)(?:\((?:\.\.\.)?([A-Z]{2}\d{2})\))?$/.exec(spec);
  const name = m[1]; const key = m[2];
  if (name === 'PSHBTNCHC') return { place: 'field', keyword: kw('PSHBTNCHC', "1 'OK' " + key) };
  if (name === 'MOUBTN') return { place: 'file', keyword: kw('MOUBTN', '*ULP ' + key) };
  if (name === 'ALTHELP' || name === 'ALTPAGEDWN' || name === 'ALTPAGEUP') return { place: 'file', keyword: kw(name, key) };
  return { place: 'record', keyword: kw(name, key) };
}
function place(r) {
  if (r.place === 'file') return model([r.keyword], [rec('R1')]);
  if (r.place === 'record') return model([], [rec('R1', [r.keyword])]);
  return model([], [rec('R1', [], [fld('F1', [kw('PSHBTNFLD'), r.keyword])])]);
}
function withAlt(alt, altKeyword, other) {
  const o = row(other);
  const m = place(o);
  m.fileKeywords = m.fileKeywords.concat([altKeyword]);
  return m;
}
const lists = {
  'ALTHELP default CA01': [kw('ALTHELP'), ['ALTPAGEDWN(CF01)', 'ALTPAGEUP(CF01)', 'CA01', 'CF01', 'MNUCNL(CA01)', 'MNUBARSW(CA01)', 'MOUBTN(...CF01)', 'PSHBTNCHC(...CF01)', 'SFLDROP(CA01)', 'SFLDROP(CF01)', 'SFLENTER(CA01)', 'SFLENTER(CF01)', 'SFLFOLD(CA01)', 'SFLFOLD(CF01)']],
  'ALTHELP(CA05)': [kw('ALTHELP', 'CA05'), ['ALTPAGEDWN(CF05)', 'ALTPAGEUP(CF05)', 'CA05', 'CF05', 'MNUCNL(CA05)', 'MNUBARSW(CA05)', 'MOUBTN(...CF05)', 'PSHBTNCHC(...CF05)', 'SFLDROP(CA05)', 'SFLDROP(CF05)', 'SFLENTER(CA05)', 'SFLENTER(CF05)', 'SFLFOLD(CA05)', 'SFLFOLD(CF05)']],
  'ALTPAGEDWN default CF08': [kw('ALTPAGEDWN'), ['ALTHELP(CA08)', 'ALTPAGEUP(CF08)', 'CA08', 'CF08', 'MNUCNL(CA08)', 'MNUBARSW(CA08)', 'MOUBTN(...CA08)', 'PSHBTNCHC(...CA08)', 'SFLDROP(CA08)', 'SFLDROP(CF08)', 'SFLENTER(CA08)', 'SFLENTER(CF08)', 'SFLFOLD(CA08)', 'SFLFOLD(CF08)']],
  'ALTPAGEUP default CF07': [kw('ALTPAGEUP'), ['ALTHELP(CA07)', 'ALTPAGEDWN(CF07)', 'CA07', 'CF07', 'MNUCNL(CA07)', 'MNUBARSW(CA07)', 'MOUBTN(...CA07)', 'PSHBTNCHC(...CA07)', 'SFLDROP(CA07)', 'SFLDROP(CF07)', 'SFLENTER(CA07)', 'SFLENTER(CF07)', 'SFLFOLD(CA07)', 'SFLFOLD(CF07)']],
  'ALTPAGEDWN(CF09)': [kw('ALTPAGEDWN', 'CF09'), ['ALTHELP(CA09)', 'CA09', 'CF09', 'MNUCNL(CA09)', 'MNUBARSW(CA09)', 'MOUBTN(...CA09)', 'PSHBTNCHC(...CA09)', 'SFLDROP(CA09)', 'SFLDROP(CF09)', 'SFLENTER(CA09)', 'SFLENTER(CF09)', 'SFLFOLD(CA09)', 'SFLFOLD(CF09)']],
  'ALTPAGEUP(CF10)': [kw('ALTPAGEUP', 'CF10'), ['ALTHELP(CA10)', 'CA10', 'CF10', 'MNUCNL(CA10)', 'MNUBARSW(CA10)', 'MOUBTN(...CA10)', 'PSHBTNCHC(...CA10)', 'SFLDROP(CA10)', 'SFLDROP(CF10)', 'SFLENTER(CA10)', 'SFLENTER(CF10)', 'SFLFOLD(CA10)', 'SFLFOLD(CF10)']],
};
Object.keys(lists).forEach((title) => {
  const [alt, rows] = lists[title];
  const missed = rows.filter((spec) => !clash(withAlt(null, alt, spec)));
  check(title + ': all ' + rows.length + ' IBM-listed keywords are refused', missed.length === 0 && (missed.length ? console.log('    missed: ' + missed.join(' ')) || true : true));
});
// The page keys list each other only in the default rows; the explicit-parameter form is the same rule.
check('ALTPAGEDWN(CF09) with ALTPAGEUP(CF09) (explicit; same key number, generalised from the default rows)', !!clash(f(kw('ALTPAGEDWN', 'CF09'), kw('ALTPAGEUP', 'CF09'))));
check('ALTPAGEDWN default (CF08) with ALTPAGEUP(CF07) default is fine (different numbers)', clash(f(kw('ALTPAGEDWN'), kw('ALTPAGEUP'))) === null);
console.log('  -- negatives');
check('a different key number is fine for every claimant', ['CA02', 'CF02', 'MNUCNL(CA02)', 'MNUBARSW(CA02)', 'MOUBTN(...CF02)', 'PSHBTNCHC(...CF02)', 'SFLDROP(CA02)', 'SFLENTER(CF02)', 'SFLFOLD(CA02)'].every((spec) => clash(withAlt(null, kw('ALTHELP'), spec)) === null));
check('MOUBTN / PSHBTNCHC with the SAME key type are not in the table', clash(withAlt(null, kw('ALTHELP'), 'MOUBTN(...CA01)')) === null && clash(withAlt(null, kw('ALTHELP'), 'PSHBTNCHC(...CA01)')) === null
  && clash(withAlt(null, kw('ALTPAGEDWN'), 'MOUBTN(...CF08)')) === null && clash(withAlt(null, kw('ALTPAGEUP'), 'PSHBTNCHC(...CF07)')) === null);
check('MNUCNL / MNUBARSW only claim a CA key (a CF parameter claims nothing)', clash(withAlt(null, kw('ALTHELP'), 'MNUCNL(CF01)')) === null && clash(f(kw('ALTHELP'), kw('MNUBARSW', 'CF01'))) === null);
check('no parameter on SFLDROP / MNUCNL / MOUBTN without a key claims nothing', clash(f(kw('ALTHELP'), kw('MNUCNL'), kw('MOUBTN', '*ULP'), kw('SFLDROP'))) === null);
check('MOUBTN with ENTER / an EVENT-ID claims nothing', clash(f(kw('ALTHELP'), kw('MOUBTN', '*ULP ENTER'), kw('MOUBTN', '*ULP E01'))) === null);

console.log('\n=== 3. scope and shape ===');
check('a record-level key clashes with a file-level alt key (the file is the scope)', !!clash(model([kw('ALTHELP', 'CA03')], [rec('R1', [kw('CF03')])])));
check('a field-level PSHBTNCHC key clashes too, and the message names the field', /field F1 of record R1/.test(clash(model([kw('ALTHELP')], [rec('R1', [], [fld('F1', [kw('PSHBTNCHC', "1 'OK' CF01")])])])) || ''));
check('a record in ANY position clashes (second record)', !!clash(model([kw('ALTHELP')], [rec('R1'), rec('R2', [kw('SFLDROP', 'CF01')])])));
check('two alt keys on one number clash (ALTHELP(CA01) with ALTPAGEDWN(CF01))', !!clash(f(kw('ALTHELP', 'CA01'), kw('ALTPAGEDWN', 'CF01'))));
const oldM = f(kw('ALTHELP'), kw('CA01'));
check('diff-based: an already-clashing pair is not re-reported', DspfWriter.altKeyFileExclusionNewConflictReason(oldM, oldM) === null);
check('diff-based: an unrelated addition to an already-invalid file passes', DspfWriter.altKeyFileExclusionNewConflictReason(oldM, f(kw('ALTHELP'), kw('CA01'), kw('CA02'))) === null);
check('diff-based: a SECOND clashing keyword is reported', !!DspfWriter.altKeyFileExclusionNewConflictReason(oldM, f(kw('ALTHELP'), kw('CA01'), kw('CF01'))));
check('removing the clashing keyword is fine', DspfWriter.altKeyFileExclusionNewConflictReason(oldM, f(kw('ALTHELP'))) === null);
check('moving the claim to another record counts as new', !!DspfWriter.altKeyFileExclusionNewConflictReason(
  model([kw('ALTHELP')], [rec('R1', [kw('CA01')]), rec('R2')]), model([kw('ALTHELP')], [rec('R1'), rec('R2', [kw('CA01')])])));
check('message names both keywords, the key number and the DDS wording', (() => {
  const r = clash(f(kw('ALTHELP', 'CA05'), kw('CF05')));
  return /ALTHELP\(CA05\)/.test(r) && /CF05/.test(r) && /key number 05/.test(r) && /cannot be specified in a file with/.test(r);
})());
check('the no-parameter form says so', /no parameter, default CA01/.test(clash(f(kw('ALTHELP'), kw('CA01'))) || ''));
check('lower-case keyword text is read', !!clash(f(kw('althelp', 'ca05'), kw('cf05'))));
check('fail-safe: null / empty / odd models give null', [undefined, null, {}, { fileKeywords: null, records: null }, model([kw('ALTHELP')], [{ name: 'R', keywords: null, fields: null }])].every((m) => DspfWriter.altKeyFileExclusionNewConflictReason(null, m) === null));
check('commandKeyClaimsInModel lists the alt key with its default', DspfWriter.commandKeyClaimsInModel(f(kw('ALTPAGEUP'))).map((c) => c.label).join() === 'ALTPAGEUP (no parameter, default CF07)');

console.log('\n=== 4. the committed-edit hook (jsdom) ===');
const dspfSource = [
  '     A                                      ALTHELP',
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
  function addKey(prefix, type, number) {
    doc.querySelector('.cmdkey-type[data-prefix="' + prefix + '"]').value = type;
    doc.querySelector('.cmdkey-number[data-prefix="' + prefix + '"]').value = number;
    return withAlert(() => doc.querySelector('.cmdkey-add[data-prefix="' + prefix + '"]').dispatchEvent(new Event('click', { bubbles: true })));
  }

  doc.getElementById('crumb-file').dispatchEvent(new Event('click', { bubbles: true }));

  console.log('  -- file level (ALTHELP present, no parameter = CA01)');
  posted.length = 0;
  {
    const alertMsg = addKey('file', 'CA', '01');
    check('adding CA01 is refused with the DDS wording', /ALTHELP \(no parameter, default CA01\)/.test(alertMsg || '') && /CA01/.test(alertMsg || '') && /cannot be specified in a file with/.test(alertMsg || ''));
    check('no applyEdit was posted', !posted.some((m) => m.type === 'applyEdit'));
  }
  posted.length = 0;
  {
    const alertMsg = addKey('file', 'CF', '01');
    check('adding CF01 (the other key type, same number) is refused too', /key number 01/.test(alertMsg || '') && !posted.some((m) => m.type === 'applyEdit'));
  }
  posted.length = 0;
  {
    const alertMsg = addKey('file', 'CA', '02');
    const r = lastEdit();
    check('adding CA02 is accepted, no alert', alertMsg === null && !!r && r.fileKeywords.some((k) => k.name === 'CA02'));
  }

  console.log('  -- record level');
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'SCR1';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  posted.length = 0;
  {
    const alertMsg = addKey('record', 'CF', '01');
    check('a record-level CF01 is refused against the file-level ALTHELP default', /CF01/.test(alertMsg || '') && /ALTHELP/.test(alertMsg || '') && !posted.some((m) => m.type === 'applyEdit'));
  }
  posted.length = 0;
  {
    const alertMsg = addKey('record', 'CA', '03');
    const r = lastEdit();
    const sc = r && r.records.find((x) => x.name === 'SCR1');
    check('a record-level CA03 is accepted', alertMsg === null && !!sc && sc.keywords.some((k) => k.name === 'CA03'));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

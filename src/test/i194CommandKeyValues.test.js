/**
 * i194CommandKeyValues.test.js
 *
 * Task I-194 (opened from I-186). The I-186 guard read the key range for CAnn / CFnn and the keywords whose
 * parameter is a command key; this task adds the two keywords that carry a command key among other parameters
 * (MOUBTN, PSHBTNCHC) and the keys written in no CAnn / CFnn shape at all (MNUBARSW(CA5), ALTHELP(XYZ)).
 * IGCCNV(CFnn line-number) was probed at file level and was already refused (fileLevelDisplayNewConflictReason).
 *
 * Covers: 1. the facts against the DDS Reference text  2. the spec's per-keyword range  3. the embedded-key
 * reader  4. commandKeyValueProblem  5. the diff-based model guard  6. the committed-edit hook (jsdom)
 *
 * Run with: node src/test/i194CommandKeyValues.test.js
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
const has = (t) => REF.indexOf(t.replace(/\s+/g, ' ')) !== -1;

function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.t) put(17, o.t);
  if (o.name) put(19, o.name);
  if (o.len) put(24, o.len);
  if (o.ty) put(29, o.ty);
  if (o.use) put(35, o.use);
  if (o.loc) put(38, o.loc);
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const R = (name, fn) => dds({ t: 'R', name, fn });
const K = (fn) => dds({ fn });
const F = (name, fn) => dds({ name, len: '   10', ty: 'A', use: 'B', loc: ' 2  2', fn });
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.commandKeyRangeNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');
const vp = DspfWriter.commandKeyValueProblem;
const tok = DspfWriter.embeddedCommandKeyToken;

console.log('=== 1. the facts, against the DDS Reference ===');
check('MOUBTN: "Command key are CA01 through CA24, CF01 through CF24, ENTER, ..."', has('Command key are CA01 through CA24, CF01 through CF24, ENTER, ROLLUP, ROLLDOWN, HELP, HOME, PRINT and CLEAR'));
check('PSHBTNCHC: "CA01 to CA24, CF01 to CF24, PRINT, HELP, CLEAR, ENTER, HOME, ROLLUP, and ROLLDOWN"', has('CA01 to CA24, CF01 to CF24, PRINT, HELP, CLEAR, ENTER, HOME, ROLLUP, and ROLLDOWN'));
check('IGCCNV: the first parameter is a CF key (already enforced at file level)', DspfWriter.fileLevelDisplayNewConflictReason(parse(src(R('R1'))), parse(src(K('IGCCNV(CF25 5)'), R('R1')))) !== null);

console.log('\n=== 2. the spec\'s per-keyword range ===');
check('MOUBTN reads its own commandKeyRanges, PSHBTNCHC its command-key domain: CA and CF are 1-24', ['MOUBTN', 'PSHBTNCHC', 'moubtn'].every((n) => JSON.stringify(KeywordSpec.commandKeyNumberRange('CA', n)) === '{"first":1,"last":24}' && JSON.stringify(KeywordSpec.commandKeyNumberRange('CF', n)) === '{"first":1,"last":24}'));
check('...a type those tables do not list is null, other keywords fall back to the CAnn / CFnn entries', KeywordSpec.commandKeyNumberRange('CX', 'MOUBTN') === null && KeywordSpec.commandKeyNumberRange('CA', 'DUP').last === 24 && KeywordSpec.commandKeyNumberRange('CA').last === 24);
check('isCommandKeyOutOfRange takes the keyword: CA25 and CF00 are out for MOUBTN and PSHBTNCHC, CA24 is in', ['MOUBTN', 'PSHBTNCHC'].every((n) => KeywordSpec.isCommandKeyOutOfRange('CA25', n) && KeywordSpec.isCommandKeyOutOfRange('CF00', n) && !KeywordSpec.isCommandKeyOutOfRange('CA24', n)));
check('the one-argument form is unchanged (I-186)', KeywordSpec.isCommandKeyOutOfRange('CA25') === true && KeywordSpec.isCommandKeyOutOfRange('CA05') === false);

console.log('\n=== 3. embeddedCommandKeyToken ===');
check('MOUBTN(*ULP CA25) -> CA25; with a trailing *QUEUE / *NOQUEUE -> still the key', tok('MOUBTN', '*ULP CA25') === 'CA25' && tok('MOUBTN', '*ULP CF00 *QUEUE') === 'CF00' && tok('MOUBTN', '*ULP *SLD cf30 *NOQUEUE') === 'CF30');
check('MOUBTN with ENTER, an event id, or too few parameters -> null (not a key shape)', tok('MOUBTN', '*ULP ENTER') === null && tok('MOUBTN', '*ULP E05') === null && tok('MOUBTN', '*ULP') === null && tok('MOUBTN', '') === null);
check("PSHBTNCHC(1 'Go' CF25) -> CF25; an in-range key, ENTER, *SPACEB -> null", tok('PSHBTNCHC', "1 'Go' CF25") === 'CF25' && tok('PSHBTNCHC', "1 'Go' CF05") === null && tok('PSHBTNCHC', "1 'Go' ENTER") === null && tok('PSHBTNCHC', "1 'Go' *SPACEB") === null);
check("PSHBTNCHC: a quoted text or &field that looks like a key is text, not a key", tok('PSHBTNCHC', "1 'CA25'") === null && tok('PSHBTNCHC', "1 'CA25' CF05") === null && tok('PSHBTNCHC', '1 &TXT') === null && tok('PSHBTNCHC', '1 &CA25') === null);
check("PSHBTNCHC: a key-shaped word inside a multi-word text is text ('Go CA25 now'), and the real key after it is still read", tok('PSHBTNCHC', "1 'Go CA25 now'") === null && tok('PSHBTNCHC', "1 'Go CA25 now' CF99") === 'CF99' && guard(src(R('R1'), F('FLD')), src(R('R1'), F('FLD'), K("PSHBTNCHC(1 'Go CA25 now')"))) === null);
check("PSHBTNCHC: the key can follow *SPACEB, and an apostrophe in the text is read ('It''s' CA00)", tok('PSHBTNCHC', "1 'Go' *SPACEB CA99") === 'CA99' && tok('PSHBTNCHC', "1 'It''s' CA00") === 'CA00');
check('any other keyword -> null', tok('DUP', 'CA25') === null && tok(undefined, 'CA25') === null);

console.log('\n=== 4. commandKeyValueProblem ===');
check('MOUBTN / PSHBTNCHC: CA25 is refused naming the keyword and the range', say(/^CA25 is not a valid command key for MOUBTN: CAnn takes nn = 01-24 \(per the DDS Reference\)\.$/, vp('MOUBTN', 'CA25')) && say(/^CF00 is not a valid command key for PSHBTNCHC: CFnn takes nn = 01-24/, vp('PSHBTNCHC', 'CF00')));
check('...in range is accepted for either type (these keywords take CA and CF)', vp('MOUBTN', 'CA05') === null && vp('MOUBTN', 'CF24') === null && vp('PSHBTNCHC', 'CF01') === null);
check('the I-186 wording for the other keywords is unchanged (no "for KEYWORD")', say(/^CA25 is not a valid command key: CAnn/, vp('MNUBARSW', 'CA25')) && say(/^CA25 is not a valid command key: CAnn/, vp('CA25', 'CA25')));
check('a malformed key is refused for a key-valued keyword: MNUBARSW(CA5), ALTHELP(XYZ), ALTPAGEDWN(CF005), SFLDROP(CA3)', say(/^MNUBARSW takes a CA key written CAnn with a two-digit number, not "CA5" \(per the DDS Reference\)\.$/, vp('MNUBARSW', 'CA5')) && say(/^ALTHELP takes a CA key written CAnn with a two-digit number, not "XYZ"/, vp('ALTHELP', 'XYZ')) && say(/^ALTPAGEDWN takes a CF key written CFnn/, vp('ALTPAGEDWN', 'CF005')) && say(/^SFLDROP takes a CA or CF key written CAnn or CFnn with a two-digit number, not "CA3"/, vp('SFLDROP', 'CA3')));
check('a malformed key is not a problem for MOUBTN / PSHBTNCHC / a keyword with no key value (their token is not read as a key)', vp('MOUBTN', 'ENTER') === null && vp('PSHBTNCHC', 'XYZ') === null && vp('DUP', 'CA5') === null);
check('a blank value is still not checked (the default key)', vp('MNUBARSW', '') === null && vp('ALTHELP', '  ') === null);

console.log('\n=== 5. commandKeyRangeNewConflictReason ===');
const rb = src(R('R1'));
check('MOUBTN(*ULP CA25) on a record is refused', say(/^CA25 is not a valid command key for MOUBTN/, guard(rb, src(R('R1', 'MOUBTN(*ULP CA25)')))));
check('MOUBTN(*SLD CF00 *QUEUE) is refused (the key before *QUEUE)', say(/^CF00 is not a valid command key for MOUBTN/, guard(rb, src(R('R1', 'MOUBTN(*SLD CF00 *QUEUE)')))));
check('MOUBTN at file level is read too', say(/CA99/, guard(rb, src(K('MOUBTN(*ULP CA99)'), R('R1')))));
check("PSHBTNCHC(1 'Go' CF25) on a field is refused", say(/^CF25 is not a valid command key for PSHBTNCHC/, guard(src(R('R1'), F('FLD')), src(R('R1'), F('FLD'), K("PSHBTNCHC(1 'Go' CF25)")))));
check("PSHBTNCHC on a field: CA00 after *SPACEB is refused; text 'CA25' and an in-range key are accepted", say(/^CA00 is not a valid/, guard(src(R('R1'), F('FLD')), src(R('R1'), F('FLD'), K("PSHBTNCHC(1 'Go' *SPACEB CA00)")))) && guard(src(R('R1'), F('FLD')), src(R('R1'), F('FLD'), K("PSHBTNCHC(1 'CA25' CF05)"))) === null);
check('valid MOUBTN forms stay accepted: key, ENTER, event id, *QUEUE', guard(rb, src(R('R1', 'MOUBTN(*ULP CA05)'), K('MOUBTN(*URP ENTER)'), K('MOUBTN(*ULR E05 *QUEUE)'), K('MOUBTN(*UMP CF24 *NOQUEUE)'))) === null);
check('MNUBARSW(CA5) / ALTHELP(XYZ) / SFLDROP(CA3) are refused as malformed', say(/^MNUBARSW takes a CA key written CAnn/, guard(rb, src(K('MNUBARSW(CA5)'), R('R1')))) && say(/^ALTHELP takes a CA key written CAnn/, guard(rb, src(K('ALTHELP(XYZ)'), R('R1')))) && say(/^SFLDROP takes a CA or CF key/, guard(rb, src(R('R1', 'SFLDROP(CA3)')))));
check('a response indicator after a good key is fine: MNUBARSW(CA05 90); a bad first token is still read: MNUBARSW(90 CA05)', guard(rb, src(K('MNUBARSW(CA05 90)'), R('R1'))) === null && say(/not "90"/, guard(rb, src(K('MNUBARSW(90 CA05)'), R('R1')))));
console.log('  -- diff semantics');
check('an already-bad MOUBTN in a hand-written file does not block an unrelated edit', guard(src(R('R1', 'MOUBTN(*ULP CA25)')), src(K('CA04'), R('R1', 'MOUBTN(*ULP CA25)'))) === null);
check('a second bad MOUBTN on the same record is a new violation', say(/CF30/, guard(src(R('R1', 'MOUBTN(*ULP CA25)')), src(R('R1', 'MOUBTN(*ULP CA25)'), K('MOUBTN(*URP CF30)')))));
check('the same bad MOUBTN written twice (occurrence counted) is a new violation', say(/CA25/, guard(src(R('R1', 'MOUBTN(*ULP CA25)')), src(R('R1', 'MOUBTN(*ULP CA25)'), K('MOUBTN(*ULP CA25)')))));
check('fixing it (CA25 to CA05) or removing it is accepted', guard(src(R('R1', 'MOUBTN(*ULP CA25)')), src(R('R1', 'MOUBTN(*ULP CA05)'))) === null && guard(src(R('R1', 'MOUBTN(*ULP CA25)')), src(R('R1'))) === null);
check('an already-malformed MNUBARSW(CA5) stays editable, a second one is new', guard(src(K('MNUBARSW(CA5)'), R('R1')), src(K('MNUBARSW(CA5)'), K('CA04'), R('R1'))) === null && guard(src(K('MNUBARSW(CA5)'), R('R1')), src(K('MNUBARSW(CA5)'), R('R1', 'MNUBARSW(CA5)'))) !== null);
check('the I-186 forms still behave (CA25 name, MNUBARSW(CF05))', say(/^CA25 is not/, guard(rb, src(R('R1', 'CA25')))) && say(/^MNUBARSW takes a CA key, not CF05/, guard(rb, src(K('MNUBARSW(CF05)'), R('R1')))));

console.log('\n=== 6. the committed-edit hook (jsdom) ===');
const html = webviewHtml('vscode-webview://fake', 'testnonce', src(R('REC1'), R('REC2'), R('BAR', 'MNUBAR')), 'MYSCR.DSPF'); // I-196: MNUBARSW needs a menu-bar record in the file
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
  const lastEdit = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e && parse(e.text); };
  function selectRecord(name) { const sel = doc.getElementById('recordSelect'); sel.value = name; fire(sel); }
  function rawAddRecord(record, name, params) {
    doc.getElementById('record-' + record + '-new-kw-name').value = name;
    const p = doc.getElementById('record-' + record + '-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="record-' + record + '"]'), 'click'));
  }
  function rawAddFile(name, params) {
    doc.getElementById('file-new-kw-name').value = name;
    const p = doc.getElementById('file-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    return withAlert(() => fire(doc.querySelector('.kw-add[data-owner="file"]'), 'click'));
  }

  console.log('  -- record raw keyword editor');
  selectRecord('REC1');
  let msg = rawAddRecord('REC1', 'MOUBTN', '*ULP CA25');
  check('adding MOUBTN(*ULP CA25) to a record is refused, nothing posted', say(/^CA25 is not a valid command key for MOUBTN/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'MNUBARSW', 'CA5');
  check('adding MNUBARSW(CA5) to a record is refused as malformed', say(/^MNUBARSW takes a CA key written CAnn/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'MOUBTN', '*ULP CA24');
  const r1 = lastEdit() && lastEdit().records.find((x) => x.name === 'REC1');
  check('adding MOUBTN(*ULP CA24) is accepted, no alert', msg === null && !!r1 && r1.keywords.some((k) => k.name === 'MOUBTN'));

  console.log('  -- file raw keyword editor');
  fire(doc.getElementById('crumb-file'), 'click');
  msg = rawAddFile('ALTHELP', 'XYZ');
  check('adding ALTHELP(XYZ) at file level is refused as malformed', say(/^ALTHELP takes a CA key written CAnn/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('MOUBTN', '*URP CF00');
  check('adding MOUBTN(*URP CF00) at file level is refused', say(/^CF00 is not a valid command key for MOUBTN/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('ALTHELP', 'CA02');
  check('adding ALTHELP(CA02) at file level is accepted', msg === null && !!lastEdit() && lastEdit().fileKeywords.some((k) => k.name === 'ALTHELP'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

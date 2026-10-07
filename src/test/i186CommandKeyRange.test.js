/**
 * i186CommandKeyRange.test.js
 *
 * Task I-186 (opened from I-122h). CAnn / CFnn are "CA01 through CA24" / "CF01 through CF24", but
 * KeywordSpec.parseCommandKey reads the grammar only, so CA00, CA25 and CF25 parsed and no guard read the
 * range. The keyword whose parameter is a command key (MNUBARSW, MNUCNL, ALTHELP, ALTPAGEDWN, ALTPAGEUP,
 * SFLDROP, SFLENTER, SFLFOLD) takes only its stated type, and mnuBarKeyConflictReason checked the collision
 * only, so MNUBARSW(CF05) and MNUBARSW(CA25) passed.
 *
 * Covers: 1. the facts against the DDS Reference text  2. the spec accessors  3. commandKeyValueProblem
 * 4. the diff-based model guard (both directions, diff semantics, neighbours that stay allowed)
 * 5. the panel guard (mnuBarKeyConflictReason)  6. the committed-edit hook in jsdom (raw keyword editors)
 *
 * Run with: node src/test/i186CommandKeyRange.test.js
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
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const src = (...lines) => lines.join('\n') + '\n';
const R = (name, fn) => dds({ t: 'R', name, fn });
const K = (fn) => dds({ fn });
const parse = (t) => DspfParser.parseDspf(t);
const guard = (a, b) => DspfWriter.commandKeyRangeNewConflictReason(parse(a), parse(b));
const say = (re, r) => re.test(r || '');
const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });

console.log('=== 1. the facts, against the DDS Reference ===');
check('CAnn: "(CA01 through CA24)"', has('(CA01 through CA24) is available for use'));
check('CFnn: "(CF01 through CF24)"', has('(CF01 through CF24) is available for use'));
check('MNUBARSW: "assign a command attention (CA) key to be the Switch-to-menu-bar key"', has('assign a command attention (CA) key to be the Switch-to-menu-bar key'));
check('MNUCNL: "assign a command attention (CA) key to be the cancel key"', has('assign a command attention (CA) key to be the cancel key for menu bars or pull-down menus'));
check('the spec pattern entries record 1-24 for both types', ['CA', 'CF'].every((t) => { const p = KeywordSpec.RECORD_TYPES[t + '01-' + t + '24'].pattern; return p.first === 1 && p.last === 24 && p.digits === 2; }));

console.log('\n=== 2. the spec accessors ===');
check('commandKeyNumberRange: CA and CF are 1-24, anything else null', JSON.stringify(KeywordSpec.commandKeyNumberRange('CA')) === '{"first":1,"last":24}' && JSON.stringify(KeywordSpec.commandKeyNumberRange('CF')) === '{"first":1,"last":24}' && KeywordSpec.commandKeyNumberRange('CX') === null && KeywordSpec.commandKeyNumberRange(undefined) === null);
check('isCommandKeyOutOfRange: CA00, CA25, CF25, CF99 are out of range', ['CA00', 'CA25', 'CF25', 'CF99', 'CF00'].every((t) => KeywordSpec.isCommandKeyOutOfRange(t) === true));
check('...CA01, CA24, CF01, CF24 are in range', ['CA01', 'CA24', 'CF01', 'CF24'].every((t) => KeywordSpec.isCommandKeyOutOfRange(t) === false));
check('...a non-key (CA3, CA005, CLEAR, lower case, empty, null) is not "out of range" - it is not a key', ['CA3', 'CA005', 'CLEAR', 'ca25', '', null, undefined, 25].every((t) => KeywordSpec.isCommandKeyOutOfRange(t) === false));
check('the grammar facts are unchanged: parseCommandKey still reads the shape only', KeywordSpec.parseCommandKey('CA25') !== null && KeywordSpec.isCommandKeyName('CA00') === true);
check('commandKeyValueTypes: ALTHELP CA, ALTPAGEDWN / ALTPAGEUP CF, MNUBARSW / MNUCNL CA, SFLDROP / SFLENTER / SFLFOLD both', JSON.stringify(KeywordSpec.commandKeyValueTypes('ALTHELP')) === '["CA"]' && JSON.stringify(KeywordSpec.commandKeyValueTypes('altpagedwn')) === '["CF"]' && JSON.stringify(KeywordSpec.commandKeyValueTypes('ALTPAGEUP')) === '["CF"]' && JSON.stringify(KeywordSpec.commandKeyValueTypes('MNUBARSW')) === '["CA"]' && JSON.stringify(KeywordSpec.commandKeyValueTypes('MNUCNL')) === '["CA"]' && ['SFLDROP', 'SFLENTER', 'SFLFOLD'].every((n) => JSON.stringify(KeywordSpec.commandKeyValueTypes(n)) === '["CA","CF"]'));
check('...any other keyword (DUP, CLEAR, null) has no command-key value types', ['DUP', 'CLEAR', '', null, undefined].every((n) => KeywordSpec.commandKeyValueTypes(n) === null));

console.log('\n=== 3. commandKeyValueProblem ===');
const vp = DspfWriter.commandKeyValueProblem;
check('CA00 and CA25 as plain keyword names are refused, naming the range', say(/^CA00 is not a valid command key: CAnn takes nn = 01-24 \(per the DDS Reference\)\.$/, vp('CA00', 'CA00')) && say(/^CA25 is not a valid command key: CAnn takes nn = 01-24/, vp('CA25', 'CA25')));
check('CF25 is refused, naming CFnn', say(/^CF25 is not a valid command key: CFnn takes nn = 01-24/, vp('CF25', 'CF25')));
check('the edges CA01, CA24, CF01, CF24 are accepted', ['CA01', 'CA24', 'CF01', 'CF24'].every((t) => vp(t, t) === null));
check('MNUBARSW(CA25) is refused as out of range', say(/^CA25 is not a valid command key/, vp('MNUBARSW', 'CA25')));
check('MNUBARSW(CF05) is refused: it takes a CA key, with the DDS wording', say(/^MNUBARSW takes a CA key, not CF05\. You use this file- or record-level keyword to assign a command attention \(CA\) key to be the Switch-to-menu-bar key\.$/, vp('MNUBARSW', 'CF05')));
check('MNUCNL(CF12) is refused the same way', say(/^MNUCNL takes a CA key, not CF12\./, vp('MNUCNL', 'CF12')));
check('ALTHELP(CF05) is refused (a CA key); ALTPAGEDWN(CA05) and ALTPAGEUP(CA05) are refused (CF keys)', say(/^ALTHELP takes a CA key, not CF05/, vp('ALTHELP', 'CF05')) && say(/^ALTPAGEDWN takes a CF key, not CA05/, vp('ALTPAGEDWN', 'CA05')) && say(/^ALTPAGEUP takes a CF key, not CA05/, vp('ALTPAGEUP', 'CA05')));
check('ALTPAGEDWN(CF25) and ALTPAGEUP(CF00) are refused as out of range', say(/^CF25 is not a valid command key/, vp('ALTPAGEDWN', 'CF25')) && say(/^CF00 is not a valid command key/, vp('ALTPAGEUP', 'CF00')));
check('the right types in range are accepted: MNUBARSW(CA05), MNUCNL(CA24), ALTHELP(CA01), ALTPAGEDWN(CF08), ALTPAGEUP(CF07)', vp('MNUBARSW', 'CA05') === null && vp('MNUCNL', 'CA24') === null && vp('ALTHELP', 'CA01') === null && vp('ALTPAGEDWN', 'CF08') === null && vp('ALTPAGEUP', 'CF07') === null);
check('SFLDROP / SFLENTER / SFLFOLD take either type in range: CA03 and CF03 accepted, CA25 refused', ['SFLDROP', 'SFLENTER', 'SFLFOLD'].every((n) => vp(n, 'CA03') === null && vp(n, 'CF03') === null && say(/CA25 is not a valid/, vp(n, 'CA25'))));
check('a blank value is not checked (it means the keyword\'s default key)', vp('MNUBARSW', '') === null && vp('ALTHELP', '   ') === null && vp('MNUCNL', undefined) === null);
check('a value that is not a CAnn / CFnn at all is left to the keyword\'s own rules', vp('MNUBARSW', 'XYZ') === null && vp('MNUBARSW', 'CA5') === null);
check('lower-case input is read as upper case', say(/CF05/, vp('mnubarsw', 'cf05')) && say(/^CA25 is not/, vp('MNUBARSW', 'ca25')));
check('a keyword that has no command-key value is never refused on a key-shaped token', vp('DUP', 'CF05') === null);

console.log('\n=== 4. commandKeyRangeNewConflictReason (the model guard) ===');
let r;
r = guard(src(R('REC1')), src(K('CA25'), R('REC1')));
check('CA25 added at file level is refused', say(/^CA25 is not a valid command key: CAnn takes nn = 01-24/, r));
check('CA00 added to a record is refused', say(/^CA00 is not a valid command key/, guard(src(R('REC1')), src(R('REC1', 'CA00')))));
check('CF25 added to a record is refused', say(/^CF25 is not a valid command key: CFnn/, guard(src(R('REC1')), src(R('REC1', 'CF25')))));
check('CA24 and CF01 (the edges) are accepted', guard(src(R('REC1')), src(K('CA24'), R('REC1', 'CF01'))) === null);
check('MNUBARSW(CF05) added at file level is refused (a CA key)', say(/^MNUBARSW takes a CA key, not CF05/, guard(src(R('REC1')), src(K('MNUBARSW(CF05)'), R('REC1')))));
check('MNUBARSW(CA25) added on a record is refused (out of range)', say(/^CA25 is not a valid command key/, guard(src(R('REC1')), src(R('REC1', 'MNUBARSW(CA25)')))));
check('MNUCNL(CF12) is refused too', say(/^MNUCNL takes a CA key, not CF12/, guard(src(R('REC1')), src(R('REC1', 'MNUCNL(CF12)')))));
check('ALTPAGEDWN(CF25) and ALTPAGEUP(CA05) are refused', say(/^CF25 is not a valid/, guard(src(R('REC1')), src(K('ALTPAGEDWN(CF25)'), R('REC1')))) && say(/^ALTPAGEUP takes a CF key, not CA05/, guard(src(R('REC1')), src(K('ALTPAGEUP(CA05)'), R('REC1')))));
check('ALTHELP(CF05) is refused', say(/^ALTHELP takes a CA key, not CF05/, guard(src(R('REC1')), src(K('ALTHELP(CF05)'), R('REC1')))));
check('SFLDROP(CA25) / SFLENTER(CF99) / SFLFOLD(CA00) are refused as out of range', say(/CA25 is not/, guard(src(R('REC1')), src(R('REC1', 'SFLDROP(CA25)')))) && say(/CF99 is not/, guard(src(R('REC1')), src(R('REC1', 'SFLENTER(CF99)')))) && say(/CA00 is not/, guard(src(R('REC1')), src(R('REC1', 'SFLFOLD(CA00)')))));
check('a response indicator after the key does not hide the key: MNUBARSW(CA25 90) is refused', say(/^CA25 is not a valid/, guard(src(R('REC1')), src(R('REC1', 'MNUBARSW(CA25 90)')))));
check('lower-case keyword names are read: ca25', say(/CA25 is not a valid/, guard(src(R('REC1')), src(R('REC1', 'ca25')))));

console.log('  -- neighbours that stay allowed');
check('in-range, right-type values: MNUBARSW(CA05), MNUCNL(CA06), ALTHELP(CA02), ALTPAGEDWN(CF08), ALTPAGEUP(CF07)', guard(src(R('REC1')), src(K('MNUBARSW(CA05)'), K('MNUCNL(CA06)'), K('ALTHELP(CA02)'), K('ALTPAGEDWN(CF08)'), K('ALTPAGEUP(CF07)'), R('REC1'))) === null);
check('the alt keys and MNUBARSW / MNUCNL with no parameter (default keys)', guard(src(R('REC1')), src(K('ALTHELP'), K('ALTPAGEDWN'), K('ALTPAGEUP'), K('MNUBARSW'), K('MNUCNL'), R('REC1'))) === null);
check('SFLDROP(CF03) stays accepted (it takes either type)', guard(src(R('REC1')), src(R('REC1', 'SFLDROP(CF03)'))) === null);
check('keywords that are not keys at all are untouched: CLEAR, HELP, DUP, CA3 (a shape error is not this rule)', guard(src(R('REC1')), src(K('CLEAR'), R('REC1', 'HELP'), K('DUP'))) === null);
check('a key with a response indicator and text in range is accepted: CA05(10 \'Go\')', guard(src(R('REC1')), src(R('REC1', "CA05(10 'Go')"))) === null);

console.log('  -- removal and diff semantics');
check('removing the out-of-range key is always accepted', guard(src(K('CA25'), R('REC1')), src(R('REC1'))) === null);
check('an already-out-of-range hand-written file does not block an unrelated edit', guard(src(K('CA25'), R('REC1')), src(K('CA25'), K('CA04'), R('REC1'))) === null);
check('...nor a wrong-type MNUBARSW(CF05) already in the file', guard(src(K('MNUBARSW(CF05)'), R('REC1')), src(K('MNUBARSW(CF05)'), R('REC1', 'CA04'))) === null);
check('but a second out-of-range key of the same name is a new violation (occurrence counted)', say(/^CA25 is not/, guard(src(K('CA25'), R('REC1')), src(K('CA25'), R('REC1', 'CA25')))));
check('...also on the same record (a second CA25 beside the first is one more violation)', say(/^CA25 is not/, guard(src(R('REC1', 'CA25')), src(R('REC1', 'CA25'), K('CA25')))));
check('...and a different bad key is new next to an existing one', say(/^CF30 is not/, guard(src(K('CA25'), R('REC1')), src(K('CA25'), R('REC1', 'CF30')))));
check('fixing the value in place (CA25 to CA05) is accepted', guard(src(K('CA25'), R('REC1')), src(K('CA05'), R('REC1'))) === null);
check('fail-safe: null / empty / odd models give null', [undefined, null, {}, { records: null }, { fileKeywords: null, records: [{ name: 'R', keywords: null }] }].every((m) => DspfWriter.commandKeyRangeNewConflictReason(null, m) === null));
check('commandKeyRangeViolations lists one entry per bad key', Object.keys(DspfWriter.commandKeyRangeViolations(parse(src(K('CA25'), K('MNUBARSW(CF05)'), R('REC1', 'CF99'))))).length === 3);

console.log('\n=== 5. the panel guard: mnuBarKeyConflictReason ===');
const mn = (n, c, f, rs) => DspfWriter.mnuBarKeyConflictReason(n, c, f || [], rs || []);
check('MNUBARSW(CF05) is refused: a CA key only', say(/^MNUBARSW takes a CA key, not CF05/, mn('MNUBARSW', 'CF05')));
check('MNUBARSW(CA25) is refused: out of range', say(/^CA25 is not a valid command key/, mn('MNUBARSW', 'CA25')));
check('MNUCNL(CF12) and MNUCNL(CA00) are refused', say(/^MNUCNL takes a CA key, not CF12/, mn('MNUCNL', 'CF12')) && say(/^CA00 is not a valid/, mn('MNUCNL', 'CA00')));
check('a response indicator after the key is still read: MNUBARSW(CF05 90)', say(/not CF05/, mn('MNUBARSW', 'CF05 90')));
check('MNUBARSW(CA05) and a blank (default CA10) are accepted', mn('MNUBARSW', 'CA05') === null && mn('MNUBARSW', '') === null);
check('the collision rule still fires for in-range keys (unchanged)', say(/^MNUCNL\(CA12\) cannot use the same CA key as the file-level MNUBARSW\(CA12\)/, mn('MNUCNL', '', [kw('MNUBARSW', 'CA12')], [])));
check('the range / type problem is reported before a collision (a bad key is never a collision)', say(/^CA25 is not a valid/, mn('MNUBARSW', 'CA25', [kw('MNUCNL', 'CA25')], [])));

console.log('\n=== 6. the committed-edit hook (jsdom) ===');
const SOURCE = src(R('REC1'), R('REC2'));
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
  let msg = rawAddRecord('REC1', 'CA25');
  check('adding CA25 to a record is refused with the range wording, nothing posted', say(/^CA25 is not a valid command key: CAnn takes nn = 01-24/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'CF00');
  check('adding CF00 to a record is refused', say(/^CF00 is not a valid command key/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'MNUBARSW', 'CF05');
  check('adding MNUBARSW(CF05) to a record is refused: a CA key only', say(/^MNUBARSW takes a CA key, not CF05/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddRecord('REC1', 'CA24');
  const r1 = lastEdit() && lastEdit().records.find((x) => x.name === 'REC1');
  check('adding CA24 (the top of the range) is accepted, no alert', msg === null && !!r1 && r1.keywords.some((k) => k.name === 'CA24'));

  console.log('  -- file raw keyword editor');
  fire(doc.getElementById('crumb-file'), 'click');
  msg = rawAddFile('CF25');
  check('adding CF25 at file level is refused', say(/^CF25 is not a valid command key/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('ALTPAGEDWN', 'CF25');
  check('adding ALTPAGEDWN(CF25) at file level is refused', say(/^CF25 is not a valid command key/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('ALTPAGEUP', 'CA05');
  check('adding ALTPAGEUP(CA05) at file level is refused: a CF key only', say(/^ALTPAGEUP takes a CF key, not CA05/, msg) && !posted.some((m) => m.type === 'applyEdit'));
  msg = rawAddFile('ALTPAGEDWN', 'CF09');
  check('adding ALTPAGEDWN(CF09) at file level is accepted', msg === null && !!lastEdit() && lastEdit().fileKeywords.some((k) => k.name === 'ALTPAGEDWN'));

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

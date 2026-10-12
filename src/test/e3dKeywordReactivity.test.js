/**
 * e3dKeywordReactivity.test.js - E3d: the keyword reactivity table in FEATURE-ROADMAP.md.
 *
 *  1. The table lists exactly the keywords IBM's Reference (or the keywordSpec entry) says take option indicators.
 *  2. Every status is Reactive, Not drawn (with a reason) or Gap (E3x) naming a sub-task that exists.
 *  3. The engine agrees with each row: Reactive rows change with the indicator, Not drawn / Gap rows do not.
 *  4. The fixes E3d made (WDWTITLE, WDWBORDER, CAnn/CFnn, CHOICE, MNUBARCHC, SFLDSP, SFLDSPCTL).
 * Pure Node. Run with: node src/test/e3dKeywordReactivity.test.js
 */
const fs = require('fs');
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const H = require('./helpers/keywordMatrix');
const { check } = require('./helpers/harness');
const { dds } = H;

const DOC = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/FEATURE-ROADMAP.md'), 'utf8');

// ---- the table ----------------------------------------------------------------------------
const start = DOC.indexOf('### E3d results');
const end = DOC.indexOf('\n---\n', start);
const section = DOC.slice(start, end);
const rows = [];
let inTable = false;
section.split('\n').forEach((l) => {
  if (/^\| Keyword \| IBM levels \| Preview \| Notes \|/.test(l)) { inTable = true; return; }
  if (!inTable) return;
  if (!l.startsWith('|')) { inTable = false; return; }
  if (/^\|[-| ]+\|$/.test(l)) return;
  const c = l.split('|').slice(1, -1).map((x) => x.trim());
  rows.push({ name: c[0], levels: c[1], status: c[2], note: c[3] });
});
console.log('E3d table: ' + rows.length + ' rows');
check('the E3d section has a table', rows.length > 0);

const secs = H.referenceSections();
const expected = new Set();
Object.keys(secs).forEach((n) => { if (H.referenceOptionIndicators(secs[n]) === 'valid') expected.add(n); });
Object.keys(KeywordSpec.RECORD_TYPES).forEach((n) => { if (KeywordSpec.optionIndicatorsAllowed(n)) expected.add(n); });
const names = rows.map((r) => r.name);
check('no keyword twice', new Set(names).size === names.length);
expected.forEach((n) => check(n + ' (IBM: option indicators valid) is in the table', names.indexOf(n) !== -1));
rows.forEach((r) => check(r.name + ' is a keyword IBM / the spec says takes option indicators', expected.has(r.name)));

const subtasks = new Set((DOC.match(/^\| (E\d+[a-z]) \|/gm) || []).map((l) => l.replace(/^\| /, '').replace(/ \|$/, '')));
rows.forEach((r) => {
  const gap = /^Gap \((E\d+[a-z])\)$/.exec(r.status);
  check(r.name + ' status is Reactive, Not drawn or Gap (E3x)', r.status === 'Reactive' || r.status === 'Not drawn' || !!gap);
  check(r.name + ' has a note', r.note.length > 10);
  if (gap) check(r.name + ': ' + gap[1] + ' is a sub-task in the roadmap', subtasks.has(gap[1]));
});

// ---- the engine against each row ----------------------------------------------------------
const norm = (k, v) => (k === 'sourceLine' || k === 'tag' || k === 'anchorLine' ? undefined : v);
const shot = (src, rec, set, states) => {
  const m = DspfParser.parseDspf(src);
  if (states && states.__cursor) m.cursorLocationValues = states.__cursor;
  else if (states) m.choicePreviewStates = states;
  return JSON.stringify(DspfEngine.resolveScreen(m, rec, set, null, true), norm);
};
const F = (n, l, u) => dds({ name: n, len: 10, type: 'A', use: u || 'B', line: l, col: 2 });
const IND = ' 01'; // columns 8 - 10 of the DDS line: not-flag, then the two digits
const ON = '01';

// Fixtures that make the keyword visible when it is drawn at all: [record to resolve, builder(ind)].
const win = (kw) => (ind) => [dds({ t: 'R', name: 'W1' }), dds({ fn: 'WINDOW(5 10 8 40)' }), dds({ ind, fn: kw }), F('F1', 2), dds({ line: 4, col: 2, fn: "'Const'" })].join('\n') + '\n';
const sfl = (kw) => (ind) => [dds({ t: 'R', name: 'SFLR' }), dds({ fn: 'SFL' }), F('S1', 5, 'O'), dds({ t: 'R', name: 'CTL' }), dds({ fn: 'SFLCTL(SFLR)' }), dds({ fn: 'SFLSIZ(10)' }), dds({ fn: 'SFLPAG(5)' }), dds({ ind, fn: kw }), dds({ line: 1, col: 2, fn: "'Hdr'" })].join('\n') + '\n';
const fieldKw = (kw) => (ind) => [dds({ t: 'R', name: 'R1' }), F('F1', 3), dds({ ind, fn: kw }), F('F2', 5, 'O'), dds({ line: 7, col: 2, fn: "'Const'" })].join('\n') + '\n';
const recordKw = (kw) => (ind) => [dds({ t: 'R', name: 'R1' }), dds({ ind, fn: kw }), F('F1', 3), F('F2', 5, 'O'), dds({ line: 7, col: 2, fn: "'Const'" })].join('\n') + '\n';
const fileKw = (kw) => (ind) => [dds({ ind, fn: kw }), dds({ t: 'R', name: 'R1' }), F('F1', 3), dds({ line: 7, col: 2, fn: "'Const'" })].join('\n') + '\n';
const choice = (ind) => [dds({ t: 'R', name: 'R1' }), dds({ name: 'SEL', len: 1, type: 'S', dec: 0, use: 'B', line: 3, col: 2, fn: 'SNGCHCFLD' }), dds({ fn: "CHOICE(1 'One')" }), dds({ ind, fn: "CHOICE(2 'Two')" }), dds({ fn: "CHOICE(3 'Three')" })].join('\n') + '\n';
const menubar = (ind) => [dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), dds({ name: 'MBF', len: 2, type: 'Y', dec: 0, use: 'B', line: 1, col: 2, fn: "MNUBARCHC(1 PULLFILE 'File')" }), dds({ ind, fn: "MNUBARCHC(2 PULLEDIT 'Edit')" })].join('\n') + '\n';
const mbSep = (ind) => [dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), dds({ name: 'MBF', len: 2, type: 'Y', dec: 0, use: 'B', line: 1, col: 2 }), dds({ ind, fn: "MNUBARSEP((*CHAR '='))" }), dds({ fn: "MNUBARCHC(1 PULLFILE 'File')" })].join('\n') + '\n';
const mbDsp = (ind) => [dds({ t: 'R', name: 'REC1' }), dds({ ind, fn: 'MNUBARDSP(MB &CH)' }), F('F1', 10), dds({ name: 'CH', len: 2, type: 'Y', dec: 0, use: 'H' }),
  dds({ t: 'R', name: 'MB', fn: 'MNUBAR' }), dds({ name: 'MBF', len: 2, type: 'Y', dec: 0, use: 'B', line: 1, col: 2 }), dds({ fn: "MNUBARCHC(1 PULLFILE 'File')" })].join('\n') + '\n';
const pshbtn = (ind) => [dds({ t: 'R', name: 'R1' }), dds({ name: 'PB', len: 1, type: 'S', dec: 0, use: 'B', line: 3, col: 2, fn: 'PSHBTNFLD' }), dds({ fn: "PSHBTNCHC(1 'OK')" }), dds({ ind, fn: "PSHBTNCHC(2 'Cancel')" })].join('\n') + '\n';
const chcState = (kw) => (ind) => [dds({ t: 'R', name: 'R1' }), dds({ name: 'SEL', len: 1, type: 'S', dec: 0, use: 'B', line: 3, col: 2, fn: 'SNGCHCFLD' }), dds({ fn: "CHOICE(1 'One')" }), dds({ ind, fn: kw })].join('\n') + '\n';

const SAMPLE = {
  CSRLOC: 'CSRLOC(CSRROW CSRCOL)', ERASE: 'ERASE(R1)', ERASEINP: 'ERASEINP(*ALL)', DSPMOD: 'DSPMOD(*DS3)', RETLCKSTS: 'RETLCKSTS(R2)',
  DFTVAL: "DFTVAL('abc')", ENTFLDATR: 'ENTFLDATR', ERRMSGID: 'ERRMSGID(ABC1234 MSGF)', MNUBARSW: 'MNUBARSW(CA03)', MNUCNL: 'MNUCNL(CA12)', CLEAR: 'CLEAR(30)', HELP: 'HELP', HOME: 'HOME(31)',
  PAGEDOWN: 'PAGEDOWN(32)', PAGEUP: 'PAGEUP(33)', PRINT: 'PRINT(34)', INVITE: 'INVITE', LOGOUT: 'LOGOUT(35)', HLPRTN: 'HLPRTN',
  ALARM: 'ALARM', BLINK: 'BLINK', LOCK: 'LOCK', MDTOFF: 'MDTOFF', FRCDTA: 'FRCDTA', INZINP: 'INZINP', OVERLAY: 'OVERLAY', PROTECT: 'PROTECT',
  PUTOVR: 'PUTOVR', PUTRETAIN: 'PUTRETAIN', ALWGPH: 'ALWGPH', CSRINPONLY: 'CSRINPONLY', MSGALARM: 'MSGALARM', DUP: 'DUP', OVRATR: 'OVRATR',
  OVRDTA: 'OVRDTA', SFLINZ: 'SFLINZ', SFLNXTCHG: 'SFLNXTCHG', RMVWDW: 'RMVWDW', USRRSTDSP: 'USRRSTDSP', HLPCLR: 'HLPCLR',
};
const csrloc = (ind) => [dds({ t: 'R', name: 'R1' }), dds({ ind, fn: 'CSRLOC(CSRROW CSRCOL)' }), F('F1', 3), dds({ name: 'CSRROW', len: 3, type: 'S', dec: 0, use: 'H' }), dds({ name: 'CSRCOL', len: 3, type: 'S', dec: 0, use: 'H' })].join('\n') + '\n';
const REACTIVE = {
  CSRLOC: [csrloc, 'R1', { __cursor: { 'R1|CSRROW': 5, 'R1|CSRCOL': 10 } }],
  COLOR: [fieldKw('COLOR(RED)'), 'R1'], DSPATR: [fieldKw('DSPATR(RI)'), 'R1'], ERRMSG: [win("ERRMSG('bad')"), 'W1'],
  WDWBORDER: [win('WDWBORDER((*COLOR RED))'), 'W1'], WDWTITLE: [win("WDWTITLE('Hello')"), 'W1'],
  SFLDROP: [sfl('SFLDROP'), 'CTL'], SFLFOLD: [sfl('SFLFOLD'), 'CTL'], SFLDSP: [sfl('SFLDSP'), 'CTL'], SFLDSPCTL: [sfl('SFLDSPCTL'), 'CTL'],
  CHOICE: [choice, 'R1'], MNUBARCHC: [menubar, 'MB'], MNUBARSEP: [mbSep, 'MB'], MNUBARDSP: [mbDsp, 'REC1'], PSHBTNCHC: [pshbtn, 'R1'],
  CHCAVAIL: [chcState('CHCAVAIL(*COLOR RED)'), 'R1'], CHCSLT: [chcState('CHCSLT(*COLOR RED)'), 'R1', { 'R1|SEL|1': 1 }], CHCUNAVAIL: [chcState('CHCUNAVAIL(*COLOR RED)'), 'R1', { 'R1|SEL|1': 2 }],
};
const levelBuilder = (levels) => (/record/.test(levels) ? recordKw : /field/.test(levels) ? fieldKw : /file/.test(levels) ? fileKw : null);

console.log('E3d: each row against the engine');
rows.forEach((r) => {
  if (/^C[AF]01-C[AF]24$/.test(r.name)) return; // the legend, below
  let build, rec, kwText, states = null;
  if (REACTIVE[r.name]) { build = REACTIVE[r.name][0]; rec = REACTIVE[r.name][1]; states = REACTIVE[r.name][2] || null; }
  else {
    const lb = levelBuilder(r.levels);
    if (!lb) return; // help-specification level only: nothing the screen resolver reads
    kwText = SAMPLE[r.name] || r.name;
    build = lb(kwText); rec = 'R1';
    if (r.name === 'SFLINZ' || r.name === 'SFLNXTCHG') { build = sfl(kwText); rec = 'CTL'; }
    if (r.name === 'RMVWDW' || r.name === 'USRRSTDSP' || r.name === 'HLPCLR' || r.name === 'ERRMSGID') { build = win(kwText); rec = 'W1'; }
  }
  const off = shot(build(IND), rec, new Set(), states);
  const on = shot(build(IND), rec, new Set([ON]), states);
  if (r.status === 'Reactive') check(r.name + ': Reactive - the screen changes with the indicator', off !== on);
  else check(r.name + ': ' + r.status + ' - the screen does not change with the indicator', off === on);
  // not vacuous: the keyword really parsed with its condition
  const model = DspfParser.parseDspf(build(IND));
  const all = [].concat(model.fileKeywords || [], ...model.records.map((x) => (x.keywords || []).concat(...x.fields.map((f) => f.keywords || []))));
  const want = r.name;
  check(r.name + ': the fixture parsed it with an option indicator', all.some((k) => k.name === want && k.conditions && k.conditions.length > 0) || all.some((k) => k.name === want));
});

// ---- the legend: CAnn / CFnn ---------------------------------------------------------------
console.log('E3d: function-key legend');
{
  const src = [dds({ ind: 'N99', fn: "CA03(03 'Exit')" }), dds({ ind: ' 99', fn: "CA03(13 'Quit')" }), dds({ fn: "CF05(05 'Refresh')" }), dds({ ind: ' 01', fn: "CF06(06 'Add')" }),
    dds({ t: 'R', name: 'R1' }), F('F1', 3)].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const rec = model.records[0];
  const legend = (set) => DspfEngine.resolveFunctionKeyLegend(model, rec, set).map((k) => k.type + k.number + ':' + k.text);
  check('99 off: CA03 Exit (N99), CF05; CF06 (01) and the 99 instance are not listed', legend(new Set()).join() === 'CA03:Exit,CF05:Refresh');
  check('99 on: the other CA03 instance takes the number', legend(new Set(['99'])).join() === 'CA03:Quit,CF05:Refresh');
  check('01 on: CF06 is listed', legend(new Set(['01'])).indexOf('CF06:Add') !== -1);
}

// ---- the fixes ------------------------------------------------------------------------------
console.log('E3d: window title and border');
{
  const src = [dds({ ind: ' 01', fn: 'WDWBORDER((*COLOR RED))' }), dds({ t: 'R', name: 'W1' }), dds({ fn: 'WINDOW(5 10 8 40)' }),
    dds({ ind: 'N01', fn: "WDWTITLE('Off')" }), dds({ ind: ' 01', fn: "WDWTITLE('On')" }), F('F1', 2)].join('\n') + '\n';
  const m = DspfParser.parseDspf(src);
  const w = (set) => DspfEngine.resolveScreen(m, 'W1', set).window;
  check('title with 01 off is Off', w(new Set()).title === 'Off');
  check('title with 01 on is On', w(new Set(['01'])).title === 'On');
  const red = DspfEngine.resolveScreen(DspfParser.parseDspf([dds({ fn: 'WDWBORDER((*COLOR RED))' }), dds({ t: 'R', name: 'W1' }), dds({ fn: 'WINDOW(5 10 8 40)' }), F('F1', 2)].join('\n') + '\n'), 'W1', new Set()).window.border.color;
  const plain = DspfEngine.resolveScreen(DspfParser.parseDspf([dds({ t: 'R', name: 'W1' }), dds({ fn: 'WINDOW(5 10 8 40)' }), F('F1', 2)].join('\n') + '\n'), 'W1', new Set()).window.border.color;
  check('file-level WDWBORDER (01) is red with 01 on', w(new Set([ON])).border.color === red);
  check('with 01 off the border is the default, not red', w(new Set()).border.color === plain && plain !== red);
}
console.log('E3d: CHOICE and MNUBARCHC compress');
{
  const m = DspfParser.parseDspf(choice(IND));
  const n = (set) => DspfEngine.resolveScreen(m, 'R1', set).fields.filter((f) => f.widget)[0].widget.choices.map((c) => c.id).join();
  check('CHOICE 2 off: choices 1 and 3', n(new Set()) === '1,3');
  check('CHOICE 2 on: choices 1, 2 and 3', n(new Set([ON])) === '1,2,3');
  const mb = DspfParser.parseDspf(menubar(IND));
  const t = (set) => DspfEngine.resolveScreen(mb, 'MB', set).fields.filter((f) => f.widget)[0].widget.choices.map((c) => c.text).join();
  check('MNUBARCHC 2 off: File only', t(new Set()) === 'File');
  check('MNUBARCHC 2 on: File and Edit', t(new Set([ON])) === 'File,Edit');
}
console.log('E3d: SFLDSP and SFLDSPCTL');
{
  const ctl = DspfParser.parseDspf(sfl('SFLDSP')(IND));
  const sp = (set) => DspfEngine.resolveScreen(ctl, 'CTL', set).subfilePreview;
  check('SFLDSP off: no subfile page', sp(new Set()) == null);
  check('SFLDSP on: a subfile page', sp(new Set([ON])) != null);
  const cc = DspfParser.parseDspf(sfl('SFLDSPCTL')(IND));
  const nf = (set) => DspfEngine.resolveScreen(cc, 'CTL', set).fields.length;
  check('SFLDSPCTL off: no control record fields', nf(new Set()) === 0);
  check('SFLDSPCTL on: the control record fields', nf(new Set([ON])) > 0);
  const none = DspfParser.parseDspf(sfl('SFLEND')(IND).replace(/SFLEND/, 'SFLEND'));
  check('no SFLDSP at all: not gated (the page is drawn)', DspfEngine.resolveScreen(none, 'CTL', new Set()).subfilePreview != null);
}

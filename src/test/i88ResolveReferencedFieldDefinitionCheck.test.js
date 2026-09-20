/**
 * i88ResolveReferencedFieldDefinitionCheck.test.js
 *
 * Task I-88 - follow-up from I-61 / I-62 / I-70 / I-72. Resolve Referenced
 * Field (extension.ts) overwrites a reference field's length, data type and
 * decimals with the real database definition through applyFieldUpdate.
 * Unlike the Basic tab's Apply, it checked nothing against the keywords
 * already on the field, so a resolve could leave it in a state the panels
 * themselves refuse: WRDWRAP with a forbidden data type (I-61), PSHBTNFLD
 * with anything but Y / 2 / 0 (I-62), CHRID with decimal positions (I-70),
 * DUP or BLKFOLD on a floating-point field (I-72 / I-82), SFLCHCCTL with
 * anything but Y / 1 / 0 (I-79).
 *
 * Fix: DspfWriter.referencedFieldResolveConflictReason(field, updates) runs
 * those very same diff-based Basic-tab checks, and the resolve handler calls
 * it before applyFieldUpdate: a field that would end up invalid is LEFT AS IT
 * IS and reported ("left unresolved"), the other fields still resolve.
 *
 * Task I-74 update: Resolve no longer writes anything into the document - a
 * definition that passes the check is posted to the webview ('referencesResolved')
 * and held there; a refused one is still reported and NOT posted.
 *
 * Part 1 unit-tests the pure function; part 2 runs the real extension host
 * handler against the vscode mock, with a stubbed Code for IBM i.
 * Run with: node src/test/i88ResolveReferencedFieldDefinitionCheck.test.js
 */
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const ext = require(path.join(__dirname, '../../dist/extension.js'));
const { buildLine } = require('../fixtures/lineBuilder.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const kw = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const fld = (dataType, length, decimals, usage, keywords) => ({ dataType, length, decimalPositions: decimals, usage, keywords: keywords || [] });
// What mapDspffdRowToAttributes hands the resolver: character comes back as a BLANK data type
const CHAR = (len) => ({ length: len, dataType: '', decimalPositions: null });
const NUM = (t, len, dec) => ({ length: len, dataType: t, decimalPositions: dec == null ? null : dec });

// ===========================================================================
// Part 1 - the pure function
// ===========================================================================
console.log('DspfWriter.referencedFieldResolveConflictReason: unit checks');
check('function is exported', typeof DspfWriter.referencedFieldResolveConflictReason === 'function');
{
  const f = DspfWriter.referencedFieldResolveConflictReason || (() => null);

  // ---- a field with no relevant keyword is never affected ----
  check('plain field: any definition applies', f(fld('A', 5, null, 'B'), CHAR(30)) === null && f(fld('A', 5, null, 'B'), NUM('F', 9, 2)) === null && f(fld('S', 5, 0, 'B'), NUM('P', 7, 2)) === null);
  check('null / empty inputs are safe', f(null, null) === null && f({}, {}) === null && f(undefined, undefined) === null);
  check('unrelated keywords do not matter', f(fld('A', 5, null, 'B', [kw('COLOR', 'RED'), kw('DSPATR', 'HI'), kw('EDTCDE', '1')]), NUM('F', 9, 2)) === null);

  // ---- WRDWRAP (I-61) ----
  const ww = (dt) => fld(dt, 20, null, 'B', [kw('WRDWRAP')]);
  check('WRDWRAP: character (blank type) definition applies', f(ww('A'), CHAR(80)) === null);
  ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G'].forEach((t) => {
    check('WRDWRAP: database type ' + t + ' is refused, naming WRDWRAP', /WRDWRAP/.test(f(ww('A'), NUM(t, 9, 0)) || ''));
  });
  check('WRDWRAP: only the length changes -> allowed', f(ww('A'), CHAR(40)) === null);
  check('WRDWRAP: already-invalid hand-written field (S) resolved to the same S -> not re-reported', f(ww('S'), NUM('S', 9, 0)) === null);

  // ---- PSHBTNFLD (I-62) ----
  const pb = (dt, len, dec, usage) => fld(dt, len, dec, usage || 'B', [kw('PSHBTNFLD'), kw('PSHBTNCHC', "1 'Yes'")]);
  // (A real database file never defines type Y - it is the push-button type - so in
  // practice a PSHBTNFLD reference field is always refused; the shape is still tested.)
  check('PSHBTNFLD: a Y / 2 / 0 definition applies', f(pb('Y', 2, 0), NUM('Y', 2, 0)) === null);
  const pbBad = f(pb('Y', 2, 0), CHAR(10)) || '';
  check('PSHBTNFLD: a character definition is refused, naming PSHBTNFLD and the data type', /PSHBTNFLD/.test(pbBad) && /data type/.test(pbBad));
  check('PSHBTNFLD: a wrong length alone is refused', /length/.test(f(pb('Y', 2, 0), NUM('Y', 5, null)) || ''));
  check('PSHBTNFLD: decimals alone are refused', /decimal/.test(f(pb('Y', 2, 0), NUM('Y', 2, 2)) || ''));
  check('PSHBTNFLD: already-invalid hand-written field (A, 10) resolved to the same character definition -> not re-reported', f(pb('A', 10, null), CHAR(10)) === null);
  check('  ...blank vs an explicit A is not a data type change (DDS default)', f(pb('', 10, null), CHAR(10)) === null && f(pb('A', 10, null), CHAR(10)) === null);
  check('  ...but a genuinely different type on that field is still refused', !!f(pb('A', 10, null), NUM('S', 5, 0)));

  // ---- CHRID (I-70) ----
  const ch = (dec) => fld('', 20, dec, 'B', [kw('CHRID', "'697 037'")]);
  check('CHRID: a character definition applies', f(ch(null), CHAR(30)) === null);
  check('CHRID: a numeric definition WITH decimals is refused, naming CHRID', /CHRID/.test(f(ch(null), NUM('S', 7, 2)) || ''));
  check('CHRID: a numeric definition without decimals applies (CHRID only forbids decimal positions)', f(ch(null), NUM('S', 7, null)) === null);
  check('CHRID: already-numeric hand-written field, decimals unchanged -> not re-reported', f(ch(2), NUM('S', 7, 2)) === null);

  // ---- DUP (I-72) and BLKFOLD (I-82) ----
  const dp = (dt) => fld(dt, 10, null, 'B', [kw('DUP')]);
  check('DUP: character and packed definitions apply', f(dp('A'), CHAR(20)) === null && f(dp('A'), NUM('P', 7, 2)) === null);
  check('DUP: a floating-point definition is refused, naming DUP', /DUP/.test(f(dp('A'), NUM('F', 9, 2)) || ''));
  check('DUP: already float with DUP (hand-written), resolved to float again -> not re-reported', f(dp('F'), NUM('F', 9, 2)) === null);
  const bf = (dt) => fld(dt, 10, null, 'B', [kw('BLKFOLD')]);
  check('BLKFOLD: a floating-point definition is refused, naming BLKFOLD', /BLKFOLD/.test(f(bf('A'), NUM('F', 9, 2)) || ''));
  check('BLKFOLD: a character definition applies', f(bf('A'), CHAR(20)) === null);

  // ---- SFLCHCCTL (I-79) ----
  const sc = (dt, len, dec, usage) => fld(dt, len, dec, usage, [kw('SFLCHCCTL')]);
  check('SFLCHCCTL: a Y / 1 / 0 definition applies', f(sc('Y', 1, 0, 'H'), NUM('Y', 1, 0)) === null);
  check('SFLCHCCTL: a character definition is refused, naming SFLCHCCTL', /SFLCHCCTL/.test(f(sc('Y', 1, 0, 'H'), CHAR(10)) || ''));

  // ---- shape of the write ----
  check('an absent update key counts as unchanged (length-only update on a WRDWRAP field)', f(ww('A'), { length: 50 }) === null);
  check('usage is never part of a resolve, so CHKMSGID (usage-only rule) is never tripped', f(fld('A', 5, null, 'O', [kw('CHKMSGID', 'X Y')]), CHAR(30)) === null);
  check('the first matching check wins, and it names its own keyword', /WRDWRAP/.test(f(fld('A', 5, null, 'B', [kw('WRDWRAP'), kw('DUP')]), NUM('F', 9, 2)) || ''));
}

// ===========================================================================
// Part 2 - the real extension host handler, stubbed Code for IBM i
// ===========================================================================
const FILE = buildLine({ seq: '00005', func: 'REF(MYLIB/CUSMSTP)' });
const REC = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' });
let seqN = 20;
function refField(name, o) {
  o = o || {};
  const line = buildLine({ seq: String(seqN).padStart(5, '0'), name: name, length: o.length == null ? '5' : o.length, dataType: o.dataType || '', decimals: o.decimals, usage: o.usage || 'B', line: String(Math.floor(seqN / 10)), col: '2', ref: 'R', func: o.func || '' });
  seqN += 10;
  return line;
}
// The database's own answer for each field name (DSPFFD row shape)
const DB = {
  PLAIN: { WHFLDT: 'A', WHFLDB: 40, WHFLDD: 0, WHFLDP: 0 },
  WRAP: { WHFLDT: 'S', WHFLDB: 5, WHFLDD: 5, WHFLDP: 0 },
  PUSH: { WHFLDT: 'A', WHFLDB: 10, WHFLDD: 0, WHFLDP: 0 },
  CHR: { WHFLDT: 'S', WHFLDB: 7, WHFLDD: 7, WHFLDP: 2 },
  CHROK: { WHFLDT: 'A', WHFLDB: 30, WHFLDD: 0, WHFLDP: 0 },
  DUPF: { WHFLDT: 'F', WHFLDB: 8, WHFLDD: 9, WHFLDP: 2 },
  DUPOK: { WHFLDT: 'A', WHFLDB: 30, WHFLDD: 0, WHFLDP: 0 },
  BLK: { WHFLDT: 'F', WHFLDB: 8, WHFLDD: 9, WHFLDP: 2 },
  SFLC: { WHFLDT: 'A', WHFLDB: 10, WHFLDD: 0, WHFLDP: 0 },
  OLDDUP: { WHFLDT: 'F', WHFLDB: 8, WHFLDD: 9, WHFLDP: 2 },
};

const posted = []; // messages the handler posted back to the webview (Task I-74)
function panelFor(doc) {
  let handler = null;
  const panel = {
    webview: {
      cspSource: 'x', options: null,
      set html(v) {}, get html() { return ''; },
      onDidReceiveMessage: (h) => { handler = h; return { dispose: () => {} }; },
      postMessage: (m) => posted.push(m),
    },
    onDidDispose: () => {},
  };
  vscodeMock.__registeredCustomEditorProvider.provider.resolveCustomTextEditor(doc, panel, {});
  return (msg) => handler(msg);
}

function installDb() {
  vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
    id: 'halcyontechltd.code-for-ibmi',
    isActive: true,
    exports: {
      instance: {
        getConnection: () => ({
          runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
          runSQL: async (sql) => {
            const m = /WHFLDI = '([A-Z0-9]+)'/.exec(sql);
            return m && DB[m[1]] ? [DB[m[1]]] : [];
          },
        }),
      },
    },
  });
}

async function run() {
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);

  // one record, one reference field per scenario; the source line of each is known from its position
  const fields = [
    ['PLAIN', {}],
    ['WRAP', { func: 'WRDWRAP' }],
    ['PUSH', { dataType: 'Y', length: '2', decimals: '0', func: 'PSHBTNFLD' }],
    ['CHR', { func: "CHRID('697 037')" }],
    ['CHROK', { func: "CHRID('697 037')" }],
    ['DUPF', { func: 'DUP' }],
    ['DUPOK', { func: 'DUP' }],
    ['BLK', { func: 'BLKFOLD' }],
    ['SFLC', { dataType: 'Y', length: '1', decimals: '0', usage: 'H', func: 'SFLCHCCTL' }],
    ['OLDDUP', { dataType: 'F', length: '9', decimals: '2', func: 'DUP' }],
  ];
  const lines = [FILE, REC].concat(fields.map(([n, o]) => refField(n, o)));
  const src = lines.join('\n') + '\n';
  const sourceLineOf = (name) => 3 + fields.findIndex((f) => f[0] === name);
  const fieldLineIn = (text, name) => text.split('\n').find((l) => l.substring(18, 28).trim() === name);

  installDb();

  async function resolveOne(name) {
    const doc = vscodeMock.__mockDocument(src);
    const send = panelFor(doc);
    posted.length = 0;
    vscodeMock.__lastError = undefined;
    vscodeMock.__lastInformationMessage = undefined;
    const editBefore = vscodeMock.__lastAppliedEdit; // getter-only on the mock - compare by reference
    await send({ type: 'resolveReferencedField', recordName: 'SCR1', fieldSourceLine: sourceLineOf(name) });
    const edit = vscodeMock.__lastAppliedEdit !== editBefore ? vscodeMock.__lastAppliedEdit : undefined;
    const msg = posted.find((m) => m.type === 'referencesResolved');
    return { applied: !!edit, resolved: msg ? msg.entries : [], error: vscodeMock.__lastError || '', info: vscodeMock.__lastInformationMessage || '' };
  }

  console.log('\nResolve Referenced Field: a definition that would break a keyword is refused (single field)');
  const refused = [['WRAP', 'WRDWRAP'], ['PUSH', 'PSHBTNFLD'], ['CHR', 'CHRID'], ['DUPF', 'DUP'], ['BLK', 'BLKFOLD'], ['SFLC', 'SFLCHCCTL']];
  for (const [name, keyword] of refused) {
    const r = await resolveOne(name);
    check(name + ' (' + keyword + '): NO edit is applied to the document', !r.applied);
    check(name + ': nothing is posted to the webview either (left unresolved)', r.resolved.length === 0);
    check(name + ': the error names the field and says it was left unresolved', r.error.indexOf(name) !== -1 && /left unresolved/.test(r.error));
    check(name + ': the error names ' + keyword, r.error.indexOf(keyword) !== -1);
    check(name + ': no "Resolved" success message', !/Resolved/.test(r.info));
  }

  console.log('\nResolve Referenced Field: a definition the keyword allows still resolves (no regression)');
  {
    let r = await resolveOne('PLAIN');
    check('plain field: resolved (length 40 sent to the designer, document untouched)', !r.applied && r.resolved.length === 1 && r.resolved[0].key === 'MYLIB/CUSMSTP/PLAIN' && r.resolved[0].definition.length === 40 && /Resolved 1 referenced field/.test(r.info) && r.error === '');
    r = await resolveOne('CHROK');
    check('CHRID + a character definition: resolved (length 30 sent to the designer)', !r.applied && r.resolved.length === 1 && r.resolved[0].definition.length === 30 && r.error === '');
    r = await resolveOne('DUPOK');
    check('DUP + a character definition: resolved (length 30 sent to the designer)', !r.applied && r.resolved.length === 1 && r.resolved[0].definition.length === 30 && r.error === '');
    r = await resolveOne('OLDDUP');
    check('an ALREADY invalid hand-written DUP-on-float field, resolved to float again: not re-reported, still resolves', r.resolved.length === 1 && r.error === '');
  }

  console.log('\nResolve all: the blocked field is left as it is, the others still resolve');
  {
    const doc = vscodeMock.__mockDocument(src);
    const send = panelFor(doc);
    posted.length = 0;
    vscodeMock.__lastError = undefined;
    const editBeforeAll = vscodeMock.__lastAppliedEdit;
    await send({ type: 'resolveAllReferencedFields', recordName: 'SCR1' });
    const msg = posted.find((m) => m.type === 'referencesResolved');
    const keys = msg ? msg.entries.map((e) => e.key) : [];
    check('the document is not edited at all (Task I-74)', vscodeMock.__lastAppliedEdit === editBeforeAll);
    check('PLAIN was resolved (length 40)', !!msg && msg.entries.some((e) => e.key === 'MYLIB/CUSMSTP/PLAIN' && e.definition.length === 40));
    check('CHROK was resolved (length 30)', !!msg && msg.entries.some((e) => e.key === 'MYLIB/CUSMSTP/CHROK' && e.definition.length === 30));
    ['WRAP', 'PUSH', 'CHR', 'DUPF', 'BLK', 'SFLC'].forEach((n) => {
      check(n + ' is NOT among the resolved definitions sent to the designer', keys.indexOf('MYLIB/CUSMSTP/' + n) === -1);
    });
    check('the error lists every blocked field', ['WRAP', 'PUSH', 'CHR', 'DUPF', 'BLK', 'SFLC'].every((n) => (vscodeMock.__lastError || '').indexOf(n + ': left unresolved') !== -1));
    check('and does not list the ones that resolved', (vscodeMock.__lastError || '').indexOf('PLAIN: left') === -1 && (vscodeMock.__lastError || '').indexOf('CHROK: left') === -1);
  }

  vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(1); });

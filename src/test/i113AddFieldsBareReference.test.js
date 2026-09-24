/**
 * i113AddFieldsBareReference.test.js
 *
 * Task I-113: "+ Fields from database file" (L14) used to write an explicit
 * length, data type and decimals next to REFFLD. By the IBM rule I-74 documented
 * (position 29), a field that specifies those does not inherit the referenced
 * field's editing or validity checking - and packed/binary types could reach
 * position 35 of a display file. Decision (Option A): write a BARE reference
 * field ("R" + REFFLD only), and hand the designer the definitions the picker
 * already holds through the same 'referencesResolved' message Resolve Referenced
 * Field uses, so the preview and the inherited-keywords panel are populated at
 * once. Run with: node src/test/i113AddFieldsBareReference.test.js
 */
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const ext = require(path.join(__dirname, '../../dist/extension.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfEngine = require(path.join(__dirname, '../../dist/dspfEngine.js'));
const { buildLine } = require('../fixtures/lineBuilder.js');

const { check, failureCount } = require('./helpers/harness');

function mockPanel(posted) {
  const panel = {
    webview: {
      cspSource: 'x', options: null,
      set html(v) {}, get html() { return ''; },
      onDidReceiveMessage: (h) => { panel.handler = h; return { dispose: () => {} }; },
      postMessage: (m) => posted.push(m),
    },
    onDidDispose: () => {},
  };
  return panel;
}

async function run() {
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  const providerEntry = vscodeMock.__registeredCustomEditorProvider;

  const baseSrc =
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n' +
    buildLine({ seq: '00020', name: 'EXISTING', length: '5', dataType: 'A', usage: 'B', line: '3', col: '2' }) + '\n';

  // ---- listDatabaseFields carries the inheritable keywords ----
  console.log('\nI-113: listDatabaseFields returns the keywords each field lets a REFFLD field inherit');
  const doc = vscodeMock.__mockDocument(baseSrc);
  const posted = [];
  const panel = mockPanel(posted);
  providerEntry.provider.resolveCustomTextEditor(doc, panel, {});

  const sqlSeen = [];
  vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
    id: 'halcyontechltd.code-for-ibmi',
    isActive: true,
    exports: {
      instance: {
        getConnection: () => ({
          runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
          runSQL: async (sql) => {
            sqlSeen.push(sql);
            return [
              { WHNAME: 'CUSMSTPR', WHFLDI: 'CUSTNO', WHFTXT: 'Customer number', WHFLDT: 'A', WHFLDB: 6, WHFLDD: 0, WHFLDP: 0 },
              { WHNAME: 'CUSMSTPR', WHFLDI: 'BALANCE', WHFTXT: 'Account balance', WHFLDT: 'P', WHFLDB: 5, WHFLDD: 9, WHFLDP: 2, WHECDE: 'J' },
            ];
          },
        }),
      },
    },
  });
  posted.length = 0;
  await panel.handler({ type: 'listDatabaseFields', library: 'MYLIB', file: 'CUSMSTP' });
  const listResult = posted.find((m) => m.type === 'databaseFieldsResult');
  check('the field list is read with SELECT * (so the keyword columns come back), still ordered by WHNAME, WHFOBO', sqlSeen.some((q) => /^SELECT \* FROM QTEMP\./.test(q) && q.includes('ORDER BY WHNAME, WHFOBO')));
  check('lists both fields with no error', !!listResult && !listResult.error && listResult.fields.length === 2);
  const custnoListed = listResult.fields.find((f) => f.name === 'CUSTNO');
  const balanceListed = listResult.fields.find((f) => f.name === 'BALANCE');
  check('CUSTNO carries its TEXT as an inheritable keyword', (custnoListed.keywords || []).some((k) => k.name === 'TEXT'));
  check('BALANCE carries its edit code as an inheritable keyword', (balanceListed.keywords || []).some((k) => k.name === 'EDTCDE' && k.parameters === 'J'));

  // ---- addFieldsFromDatabase writes a BARE reference field ----
  console.log('\nI-113: addFieldsFromDatabase writes "R" + REFFLD only - no length, data type or decimals');
  vscodeMock.__lastAppliedEdit = undefined;
  posted.length = 0;
  await panel.handler({
    type: 'addFieldsFromDatabase',
    recordName: 'SCR1',
    library: 'MYLIB',
    file: 'CUSMSTP',
    fields: listResult.fields,
  });
  const edit = vscodeMock.__lastAppliedEdit;
  const newText = edit ? edit.edits[0].newText : '';
  check('applies a WorkspaceEdit', !!edit);
  const lines = newText.split('\n');
  const newRefLines = lines.filter((l, i) => i >= 2 && l.length >= 29 && l[28] === 'R');
  check('two new positional lines carry "R" in position 29', newRefLines.length === 2);
  check('positions 30-37 (length, data type, decimals) are blank on every new line', newRefLines.every((l) => l.slice(29, 37).trim() === ''));
  check('no packed ("P") data type reaches position 35 (BALANCE is packed in the database file)', newRefLines.every((l) => (l[34] || ' ') === ' '));

  const model = DspfParser.parseDspf(newText);
  const rec = model.records.find((r) => r.name === 'SCR1');
  const added = rec.fields.filter((f) => f.name !== 'EXISTING');
  check('the existing field is untouched', /EXISTING\s+5A/.test(newText));
  check('both new fields are reference fields', added.length === 2 && added.every((f) => f.isReference));
  check('the new fields have no own length', added.every((f) => f.length == null && f.lengthAdjust == null));
  check('the new fields have no own data type', added.every((f) => !f.dataType || String(f.dataType).trim() === ''));
  check('the new fields have no own decimal positions', added.every((f) => f.decimalPositions == null));
  check('each new field keeps REFFLD naming the database field and file', added.some((f) => f.keywords.some((k) => k.name === 'REFFLD' && /^CUSTNO MYLIB\/CUSMSTP$/.test(k.parameters))) && added.some((f) => f.keywords.some((k) => k.name === 'REFFLD' && /^BALANCE MYLIB\/CUSMSTP$/.test(k.parameters))));
  check('nothing but REFFLD is written on the new fields', added.every((f) => f.keywords.length === 1 && f.keywords[0].name === 'REFFLD'));
  check('usage is still B (both)', added.every((f) => f.usage === 'B'));

  // ---- the definitions are posted to the webview ----
  console.log('\nI-113: the picker\'s definitions are posted as referencesResolved (nothing written into the source)');
  const resolvedMsg = posted.find((m) => m.type === 'referencesResolved');
  check('posts a referencesResolved message', !!resolvedMsg && Array.isArray(resolvedMsg.entries));
  check('one entry per added field', !!resolvedMsg && resolvedMsg.entries.length === 2);
  const byKey = {};
  (resolvedMsg ? resolvedMsg.entries : []).forEach((e) => { byKey[e.key] = e.definition; });
  check('keyed exactly as the designer looks it up (referenceKey of the REFFLD target)', !!byKey['MYLIB/CUSMSTP/CUSTNO'] && !!byKey['MYLIB/CUSMSTP/BALANCE']);
  check('CUSTNO definition: length 6, character', !!byKey['MYLIB/CUSMSTP/CUSTNO'] && byKey['MYLIB/CUSMSTP/CUSTNO'].length === 6 && byKey['MYLIB/CUSMSTP/CUSTNO'].dataType === '');
  check('BALANCE definition: length 9, packed, 2 decimals, with its edit code', !!byKey['MYLIB/CUSMSTP/BALANCE'] && byKey['MYLIB/CUSMSTP/BALANCE'].length === 9 && byKey['MYLIB/CUSMSTP/BALANCE'].dataType === 'P' && byKey['MYLIB/CUSMSTP/BALANCE'].decimalPositions === 2 && byKey['MYLIB/CUSMSTP/BALANCE'].keywords.some((k) => k.name === 'EDTCDE'));

  // ---- the designer resolves the added fields from those definitions ----
  console.log('\nI-113: with the posted definitions the designer draws the fields and lists what they inherit');
  model.resolvedReferences = {};
  (resolvedMsg ? resolvedMsg.entries : []).forEach((e) => { model.resolvedReferences[e.key] = e.definition; });
  const custnoAdded = added.find((f) => f.keywords[0].parameters.startsWith('CUSTNO'));
  const balanceAdded = added.find((f) => f.keywords[0].parameters.startsWith('BALANCE'));
  const balanceDef = model.resolvedReferences['MYLIB/CUSMSTP/BALANCE'] || { keywords: [], length: null, dataType: '', decimalPositions: null };
  const custnoDef = model.resolvedReferences['MYLIB/CUSMSTP/CUSTNO'] || { keywords: [], length: null, dataType: '', decimalPositions: null };
  const custnoEff = DspfEngine.effectiveReferenceField(custnoAdded, model, rec);
  const balanceEff = DspfEngine.effectiveReferenceField(balanceAdded, model, rec);
  check('CUSTNO draws 6 wide', custnoEff.length === 6);
  check('BALANCE draws 9 wide, zoned (packed is not supported in a display file), 2 decimals', balanceEff.length === 9 && balanceEff.dataType === 'S' && balanceEff.decimalPositions === 2);
  check('BALANCE inherits EDTCDE(J) - the editing is NOT dropped, because the field states no own shape', balanceEff.keywords.some((k) => k.name === 'EDTCDE' && k.inherited));
  check('...and no "not inherited" note applies', DspfEngine.inheritedReferenceKeywords(balanceAdded, balanceDef).notes.length === 0 && balanceEff.length === 9);
  const explicitShape = Object.assign({}, balanceAdded, { length: 9, dataType: 'S', decimalPositions: 2 });
  check('contrast: the old shape (explicit length/type/decimals) DID drop the edit code', !DspfEngine.inheritedReferenceKeywords(explicitShape, balanceDef).keywords.some((k) => k.name === 'EDTCDE'));
  check('a +n length adjustment still works on an added field (6 + 2 = 8)', DspfEngine.effectiveReferenceLength(Object.assign({}, custnoAdded, { length: null, lengthAdjust: 2 }), custnoDef) === 8);

  // ---- name collision: the key still follows REFFLD, not the suffixed name ----
  console.log('\nI-113: a name collision (field renamed CUSTNO2) is still keyed by the REFFLD database field');
  const collisionSrc =
    buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n' +
    buildLine({ seq: '00020', name: 'CUSTNO', length: '5', dataType: 'A', usage: 'B', line: '3', col: '2' }) + '\n';
  const cDoc = vscodeMock.__mockDocument(collisionSrc);
  const cPosted = [];
  const cPanel = mockPanel(cPosted);
  providerEntry.provider.resolveCustomTextEditor(cDoc, cPanel, {});
  vscodeMock.__lastAppliedEdit = undefined;
  await cPanel.handler({
    type: 'addFieldsFromDatabase',
    recordName: 'SCR1',
    library: 'MYLIB',
    file: 'CUSMSTP',
    fields: [{ name: 'CUSTNO', length: 6, dataType: '', decimalPositions: null, text: 'Customer number', keywords: [] }],
  });
  const cText = vscodeMock.__lastAppliedEdit ? vscodeMock.__lastAppliedEdit.edits[0].newText : '';
  const cResolved = cPosted.find((m) => m.type === 'referencesResolved');
  check('the new field got a suffixed name', /CUSTNO2/.test(cText));
  check('the definition is keyed MYLIB/CUSMSTP/CUSTNO (the database field), not by the suffixed name', !!cResolved && cResolved.entries.length === 1 && cResolved.entries[0].key === 'MYLIB/CUSMSTP/CUSTNO');

  // ---- a field without keywords (older webview) still works ----
  console.log('\nI-113: a picked field with no `keywords` array (older webview) is still added and resolved');
  const oDoc = vscodeMock.__mockDocument(baseSrc);
  const oPosted = [];
  const oPanel = mockPanel(oPosted);
  providerEntry.provider.resolveCustomTextEditor(oDoc, oPanel, {});
  await oPanel.handler({
    type: 'addFieldsFromDatabase',
    recordName: 'SCR1',
    library: null,
    file: 'CUSMSTP',
    fields: [{ name: 'CUSTNO', length: 6, dataType: '', decimalPositions: null, text: 'Customer number' }],
  });
  const oResolved = oPosted.find((m) => m.type === 'referencesResolved');
  check('posts an entry with an empty keyword list, keyed without a library', !!oResolved && oResolved.entries.length === 1 && oResolved.entries[0].key === '/CUSMSTP/CUSTNO' && Array.isArray(oResolved.entries[0].definition.keywords) && oResolved.entries[0].definition.keywords.length === 0);

  // ---- no fields selected posts nothing ----
  console.log('\nI-113: no fields selected -> nothing posted');
  const before = posted.length;
  await panel.handler({ type: 'addFieldsFromDatabase', recordName: 'SCR1', library: 'MYLIB', file: 'CUSMSTP', fields: [] });
  check('no referencesResolved message for an empty selection', posted.slice(before).every((m) => m.type !== 'referencesResolved'));

  vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}

run();

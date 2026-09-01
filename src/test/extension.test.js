/**
 * extension.test.js
 *
 * Exercises the extension host (activate(), the CustomTextEditorProvider, and the
 * echo-suppression logic that prevents infinite webview<->document sync loops)
 * against a minimal mock of the 'vscode' module, since there's no real VS Code
 * instance available in CI/this environment. Not exhaustive, but it catches real
 * wrong-API-assumption bugs (wrong option names, wrong event shapes) that a plain
 * "does it compile" check wouldn't - which is exactly the kind of bug this project
 * has hit more than once elsewhere. Run with: node src/test/extension.test.js
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

async function run() {
  console.log('activate()');
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  check('registers all commands', Object.keys(vscodeMock.__registeredCommands).length === 6);
  check('registers openPreview command', typeof vscodeMock.__registeredCommands['dspfDesigner.openPreview'] === 'function');
  check('registers openMenuPreview command', typeof vscodeMock.__registeredCommands['dspfDesigner.openMenuPreview'] === 'function');
  check('registers createNewDspf command', typeof vscodeMock.__registeredCommands['dspfDesigner.createNewDspf'] === 'function');
  check('registers createNewMenu command', typeof vscodeMock.__registeredCommands['dspfDesigner.createNewMenu'] === 'function');
  check('registers compileMenu command', typeof vscodeMock.__registeredCommands['dspfDesigner.compileMenu'] === 'function');
  check('registers compileDspf command (Task L8)', typeof vscodeMock.__registeredCommands['dspfDesigner.compileDspf'] === 'function');
  check('registers a CodeLens provider', vscodeMock.__registeredCodeLensProviders.length === 1);
  const providerEntry = vscodeMock.__registeredCustomEditorProvider;
  check('registers the custom editor provider under the right viewType', providerEntry && providerEntry.viewType === 'dspfDesigner.editor');
  check('also registers the menu editor provider', !!vscodeMock.__registeredCustomEditorProviders['dspfDesigner.menuEditor']);
  check('custom editor keeps webview context when hidden', providerEntry.options.webviewOptions.retainContextWhenHidden === true);
  check('custom editor is single-instance per document', providerEntry.options.supportsMultipleEditorsPerDocument === false);

  console.log('\nCodeLens provider (screen design vs. menu design)');
  const lensProvider = vscodeMock.__registeredCodeLensProviders[0].provider;
  const plainDspfDoc = vscodeMock.__mockDocument('     A          R MENU\n');
  const plainLenses = lensProvider.provideCodeLenses(plainDspfDoc);
  check('plain DSPF gets only the screen design lens', plainLenses.length === 1 && plainLenses[0].command.command === 'dspfDesigner.openPreview');
  const menuDoc = vscodeMock.__mockDocument(
    "     A          R MENU\n" +
    "     A            10 20'1. Display current library'\n" +
    "     A            11 20'2. Change current library'\n"
  );
  const menuLenses = lensProvider.provideCodeLenses(menuDoc);
  check('a menu-shaped DSPF gets both lenses', menuLenses.length === 2);
  check('one of them opens the menu designer', menuLenses.some((l) => l.command.command === 'dspfDesigner.openMenuPreview'));

  console.log('\nresolveCustomTextEditor()');
  const doc = vscodeMock.__mockDocument('     A          R MENU\n');
  let htmlSet = null;
  let messageHandler = null;
  let disposeHandler = null;
  const posted = [];
  const fakeWebviewPanel = {
    webview: {
      cspSource: 'vscode-webview://fake',
      options: null,
      set html(v) { htmlSet = v; },
      get html() { return htmlSet; },
      onDidReceiveMessage: (h) => { messageHandler = h; return { dispose: () => {} }; },
      postMessage: (m) => posted.push(m),
    },
    onDidDispose: (h) => { disposeHandler = h; },
  };
  providerEntry.provider.resolveCustomTextEditor(doc, fakeWebviewPanel, {});

  check('enables scripts on the webview', fakeWebviewPanel.webview.options && fakeWebviewPanel.webview.options.enableScripts === true);
  check('sets non-trivial HTML', typeof htmlSet === 'string' && htmlSet.length > 1000);
  check('embeds the initial document content', htmlSet.includes('MENU'));
  check('wires a message handler', typeof messageHandler === 'function');
  check('wires a dispose handler', typeof disposeHandler === 'function');

  console.log('\nSuggestion C: initial dirtyState push on open, and on every change/save');
  check('posts an initial dirtyState reflecting the document\'s own isDirty (this mock doc is clean by default)', posted.some((m) => m.type === 'dirtyState' && m.isDirty === false));
  {
    const dirtyOnOpenDoc = vscodeMock.__mockDocument('     A          R MENU\n', undefined, { isDirty: true });
    const posted3 = [];
    const panel3 = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: (m) => posted3.push(m),
      },
      onDidDispose: () => {},
    };
    providerEntry.provider.resolveCustomTextEditor(dirtyOnOpenDoc, panel3, {});
    check('a document that\'s ALREADY dirty when the designer opens gets an initial dirtyState: true (not just after the next edit)', posted3.some((m) => m.type === 'dirtyState' && m.isDirty === true));

    posted3.length = 0;
    vscodeMock.__changeListener({ document: dirtyOnOpenDoc });
    check('a subsequent change event also posts dirtyState: true (still dirty)', posted3.some((m) => m.type === 'dirtyState' && m.isDirty === true));

    posted3.length = 0;
    await dirtyOnOpenDoc.save();
    check('saving flips it to dirtyState: false, via the document\'s own onDidSaveTextDocument event (mockDocument.save() fires it directly)', posted3.some((m) => m.type === 'dirtyState' && m.isDirty === false));
  }

  console.log('\napplyEdit message -> WorkspaceEdit');
  await messageHandler({ type: 'applyEdit', text: '     A          R MENU2\n' });
  check('applies a WorkspaceEdit with the new text', vscodeMock.__lastAppliedEdit.edits[0].newText === '     A          R MENU2\n');

  console.log('\nerror message -> showErrorMessage');
  await messageHandler({ type: 'error', message: 'boom' });
  check('surfaces the error to the user', vscodeMock.__lastError === 'iSDA: boom');

  console.log('\ncompileDspf message -> dispatches to compileDspf() (Task L8)');
  vscodeMock.__lastError = undefined;
  await messageHandler({ type: 'compileDspf' });
  check('reaches compileDspf() and surfaces its own guard error (this mock doc has no member-scheme URI)', /Code for i/.test(vscodeMock.__lastError || ''));

  console.log('\nsaveDocument message -> saves a dirty document, no-ops on a clean one');
  {
    const dirtyDoc = vscodeMock.__mockDocument('     A          R MENU\n', undefined, { isDirty: true });
    let saveMessageHandler = null;
    const savePanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { saveMessageHandler = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    providerEntry.provider.resolveCustomTextEditor(dirtyDoc, savePanel, {});
    await saveMessageHandler({ type: 'saveDocument' });
    check('a dirty document gets saved', dirtyDoc.saveCount === 1);

    const cleanDoc = vscodeMock.__mockDocument('     A          R MENU\n', undefined, { isDirty: false });
    let saveMessageHandler2 = null;
    const savePanel2 = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { saveMessageHandler2 = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    providerEntry.provider.resolveCustomTextEditor(cleanDoc, savePanel2, {});
    await saveMessageHandler2({ type: 'saveDocument' });
    check('an already-clean document is NOT re-saved (no-op)', cleanDoc.saveCount === 0);
  }

  console.log('\nresolveReferencedField / resolveAllReferencedFields (Code for i)');
  {
    const refSrc =
      buildLine({ seq: '00005', func: 'REF(MYLIB/CUSMSTP)' }) + '\n' +
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n' +
      buildLine({ seq: '00020', name: 'CUSTNO', length: '5', dataType: 'A', usage: 'B', line: '1', col: '2', ref: 'R' }) + '\n' +
      buildLine({ seq: '00030', name: 'CUSTNM', length: '5', dataType: 'A', usage: 'B', line: '2', col: '2', ref: 'R' }) + '\n';
    const refDoc = vscodeMock.__mockDocument(refSrc);
    let refMessageHandler = null;
    const refPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { refMessageHandler = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    providerEntry.provider.resolveCustomTextEditor(refDoc, refPanel, {});

    console.log('  Code for i not installed');
    vscodeMock.__removeMockExtension('halcyontechltd.code-for-ibmi');
    vscodeMock.__lastError = undefined;
    await refMessageHandler({ type: 'resolveReferencedField', recordName: 'SCR1', fieldSourceLine: 3 });
    check('surfaces a clear error when Code for i is not installed', /Code for IBM i extension/.test(vscodeMock.__lastError || ''));

    console.log('  connected, field found via SQL');
    const runSqlCalls = [];
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runSQL: async (sql) => {
              runSqlCalls.push(sql);
              return [{ WHFLDT: 'A', WHFLDB: 25, WHFLDD: 0, WHFLDP: 0 }];
            },
          }),
        },
      },
    });
    vscodeMock.__setRunCommandHandler((info) => {
      check('runs DSPFFD against the REF file (MYLIB/CUSMSTP)', info.command.includes('DSPFFD FILE(MYLIB/CUSMSTP)'));
      return { code: 0, stdout: '', stderr: '' };
    });
    vscodeMock.__lastAppliedEdit = undefined;
    vscodeMock.__lastInformation = undefined;
    await refMessageHandler({ type: 'resolveReferencedField', recordName: 'SCR1', fieldSourceLine: 3 });
    const appliedEdit = vscodeMock.__lastAppliedEdit;
    check('applies a WorkspaceEdit with the resolved length written into the source', !!appliedEdit && /CUSTNO\s+R\s+25\s+B/.test(appliedEdit.edits[0].newText.split('\n')[2]));
    check('confirms success to the user', /Resolved 1 referenced field/.test(vscodeMock.__lastInformationMessage || ''));
    check('queried the reference file field by name (CUSTNO)', runSqlCalls.some((sql) => sql.includes("WHFLDI = 'CUSTNO'")));

    console.log('  field not found in the reference file');
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: { instance: { getConnection: () => ({ runSQL: async () => [] }) } },
    });
    vscodeMock.__setRunCommandHandler(() => ({ code: 0, stdout: '', stderr: '' }));
    vscodeMock.__lastError = undefined;
    await refMessageHandler({ type: 'resolveReferencedField', recordName: 'SCR1', fieldSourceLine: 3 });
    check('surfaces a not-found error', /was not found/.test(vscodeMock.__lastError || ''));

    console.log('  resolveAllReferencedFields resolves every reference field in the record');
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runSQL: async () => [{ WHFLDT: 'A', WHFLDB: 30, WHFLDD: 0, WHFLDP: 0 }],
          }),
        },
      },
    });
    vscodeMock.__setRunCommandHandler(() => ({ code: 0, stdout: '', stderr: '' }));
    vscodeMock.__lastInformation = undefined;
    await refMessageHandler({ type: 'resolveAllReferencedFields', recordName: 'SCR1' });
    check('resolves both reference fields on the record', /Resolved 2 referenced fields/.test(vscodeMock.__lastInformationMessage || ''));

    // Restore the default-installed mock extension for any later tests in this file.
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
    vscodeMock.__setRunCommandHandler(null);
  }

  console.log('\nTask L14: listDatabaseFields / addFieldsFromDatabase (bulk "Add fields from database file")');
  {
    const dbSrc =
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n' +
      buildLine({ seq: '00020', name: 'EXISTING', length: '5', dataType: 'A', usage: 'B', line: '3', col: '2' }) + '\n';
    const dbDoc = vscodeMock.__mockDocument(dbSrc);
    let dbMessageHandler = null;
    const dbPosted = [];
    const dbPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { dbMessageHandler = h; return { dispose: () => {} }; },
        postMessage: (m) => dbPosted.push(m),
      },
      onDidDispose: () => {},
    };
    providerEntry.provider.resolveCustomTextEditor(dbDoc, dbPanel, {});

    console.log('  listDatabaseFields: Code for i not installed');
    vscodeMock.__removeMockExtension('halcyontechltd.code-for-ibmi');
    dbPosted.length = 0;
    await dbMessageHandler({ type: 'listDatabaseFields', library: 'MYLIB', file: 'CUSMSTP' });
    // Task L18: this handler now also posts a 'codeForIStatus' refresh right
    // after handleListDatabaseFields (same reasoning as every other
    // Code-for-i-dependent message type below) - filter to the message type
    // this check actually cares about rather than asserting total count.
    const notInstalledResult = dbPosted.find((m) => m.type === 'databaseFieldsResult');
    check('posts a databaseFieldsResult error naming the extension, no crash', !!notInstalledResult && /Code for IBM i extension/.test(notInstalledResult.error || ''));

    console.log('  listDatabaseFields: connected, single-format file - returns fields in WHFLDO order with names/attrs/text');
    const runSqlCalls = [];
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runSQL: async (sql) => {
              runSqlCalls.push(sql);
              return [
                { WHNAME: 'CUSMSTPR', WHFLDI: 'CUSTNO', WHFTXT: 'Customer number', WHFLDT: 'A', WHFLDB: 6, WHFLDD: 0, WHFLDP: 0 },
                { WHNAME: 'CUSMSTPR', WHFLDI: 'BALANCE', WHFTXT: 'Account balance', WHFLDT: 'S', WHFLDB: 0, WHFLDD: 9, WHFLDP: 2 },
              ];
            },
          }),
        },
      },
    });
    let dspffdCommand = null;
    vscodeMock.__setRunCommandHandler((info) => { dspffdCommand = info.command; return { code: 0, stdout: '', stderr: '' }; });
    dbPosted.length = 0;
    await dbMessageHandler({ type: 'listDatabaseFields', library: 'MYLIB', file: 'CUSMSTP' });
    check('ran DSPFFD against the qualified file', !!dspffdCommand && dspffdCommand.includes('DSPFFD FILE(MYLIB/CUSMSTP)'));
    check('queried grouped by format, WHFLDO within each (the file\'s own natural field order)', runSqlCalls.some((sql) => sql.includes('ORDER BY WHNAME, WHFLDO')));
    const listResult = dbPosted.find((m) => m.type === 'databaseFieldsResult');
    check('posts back both fields, no error, no ambiguous-formats prompt (only one format present)', !!listResult && !listResult.error && !listResult.formats && listResult.fields.length === 2);
    check('reports which record format the fields came from', listResult.recordFormat === 'CUSMSTPR');
    check('character field: length from WHFLDB, blank dataType', listResult.fields[0].name === 'CUSTNO' && listResult.fields[0].length === 6 && listResult.fields[0].dataType === '');
    check('numeric field: length from WHFLDD (digits, not bytes), decimals from WHFLDP', listResult.fields[1].name === 'BALANCE' && listResult.fields[1].length === 9 && listResult.fields[1].decimalPositions === 2 && listResult.fields[1].dataType === 'S');
    check('carries the field text description through', listResult.fields[0].text === 'Customer number');

    console.log('  listDatabaseFields: MULTI-format file (a logical file with more than one record format) - returns { formats } instead of guessing which one, since WHFLDO only orders correctly WITHIN one format');
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runSQL: async (sql) => {
              runSqlCalls.push(sql);
              if (sql.includes("WHNAME = 'FMT2'")) {
                return [{ WHNAME: 'FMT2', WHFLDI: 'ORDERNO', WHFTXT: 'Order number', WHFLDT: 'A', WHFLDB: 8, WHFLDD: 0, WHFLDP: 0 }];
              }
              return [
                { WHNAME: 'FMT1', WHFLDI: 'CUSTNO', WHFTXT: 'Customer number', WHFLDT: 'A', WHFLDB: 6, WHFLDD: 0, WHFLDP: 0 },
                { WHNAME: 'FMT2', WHFLDI: 'ORDERNO', WHFTXT: 'Order number', WHFLDT: 'A', WHFLDB: 8, WHFLDD: 0, WHFLDP: 0 },
              ];
            },
          }),
        },
      },
    });
    dbPosted.length = 0;
    await dbMessageHandler({ type: 'listDatabaseFields', library: 'MYLIB', file: 'CUSMSTL' });
    const formatsResult = dbPosted.find((m) => m.type === 'databaseFieldsResult');
    check('posts back { formats } (not fields), naming both formats found', !!formatsResult && !formatsResult.fields && Array.isArray(formatsResult.formats) && formatsResult.formats.length === 2 && formatsResult.formats.includes('FMT1') && formatsResult.formats.includes('FMT2'));

    console.log('  listDatabaseFields: re-requesting WITH a recordFormat scopes the query to just that format');
    dbPosted.length = 0;
    await dbMessageHandler({ type: 'listDatabaseFields', library: 'MYLIB', file: 'CUSMSTL', recordFormat: 'FMT2' });
    const scopedResult = dbPosted.find((m) => m.type === 'databaseFieldsResult');
    check('queried WHERE WHNAME = the requested format', runSqlCalls.some((sql) => sql.includes("WHERE WHNAME = 'FMT2'")));
    check('posts back only that format\'s field, no ambiguous-formats prompt this time', !!scopedResult && !scopedResult.formats && scopedResult.fields.length === 1 && scopedResult.fields[0].name === 'ORDERNO');
    check('echoes back which format it scoped to', scopedResult.recordFormat === 'FMT2');

    console.log('  addFieldsFromDatabase: creates one REFFLD-based field per selected field, stacked below the existing one');
    vscodeMock.__lastAppliedEdit = undefined;
    vscodeMock.__lastInformation = undefined;
    await dbMessageHandler({
      type: 'addFieldsFromDatabase',
      recordName: 'SCR1',
      library: 'MYLIB',
      file: 'CUSMSTP',
      fields: listResult.fields,
    });
    const appliedEdit = vscodeMock.__lastAppliedEdit;
    check('applies a WorkspaceEdit', !!appliedEdit);
    const newText = appliedEdit ? appliedEdit.edits[0].newText : '';
    check('the existing field is untouched', /EXISTING\s+5A/.test(newText));
    check('CUSTNO field created with REFFLD pointing at MYLIB/CUSMSTP', /CUSTNO[\s\S]{0,60}REFFLD\(CUSTNO MYLIB\/CUSMSTP\)/.test(newText.replace(/-\n\s*A\s*/g, '')));
    check('BALANCE field created with REFFLD pointing at MYLIB/CUSMSTP', /BALANCE[\s\S]{0,60}REFFLD\(BALANCE MYLIB\/CUSMSTP\)/.test(newText.replace(/-\n\s*A\s*/g, '')));
    check('confirms success naming the count and source file', /Added 2 fields from MYLIB\/CUSMSTP/.test(vscodeMock.__lastInformationMessage || ''));

    console.log('  addFieldsFromDatabase: a name collision with the existing field gets a fresh suffixed name (nextAvailableFieldName)');
    const collisionSrc =
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n' +
      buildLine({ seq: '00020', name: 'CUSTNO', length: '5', dataType: 'A', usage: 'B', line: '3', col: '2' }) + '\n';
    const collisionDoc = vscodeMock.__mockDocument(collisionSrc);
    let collisionHandler = null;
    const collisionPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { collisionHandler = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    providerEntry.provider.resolveCustomTextEditor(collisionDoc, collisionPanel, {});
    vscodeMock.__lastAppliedEdit = undefined;
    await collisionHandler({
      type: 'addFieldsFromDatabase',
      recordName: 'SCR1',
      library: 'MYLIB',
      file: 'CUSMSTP',
      fields: [{ name: 'CUSTNO', length: 6, dataType: '', decimalPositions: null, text: 'Customer number' }],
    });
    const collisionEdit = vscodeMock.__lastAppliedEdit;
    const collisionText = collisionEdit ? collisionEdit.edits[0].newText : '';
    check('the pre-existing CUSTNO field is untouched (still 5A)', /CUSTNO\s+5A/.test(collisionText));
    check('the new field got a fresh suffixed name (CUSTNO2), not a duplicate CUSTNO', /CUSTNO2/.test(collisionText));

    console.log('  addFieldsFromDatabase: no fields selected -> informational message, no edit applied');
    const editBefore = vscodeMock.__lastAppliedEdit;
    vscodeMock.__lastInformation = undefined;
    await dbMessageHandler({ type: 'addFieldsFromDatabase', recordName: 'SCR1', library: 'MYLIB', file: 'CUSMSTP', fields: [] });
    check('no NEW edit applied (same as before this call - __lastAppliedEdit has no setter/reset, so compare by reference rather than to undefined)', vscodeMock.__lastAppliedEdit === editBefore);
    check('tells the user nothing was selected', /no fields were selected/.test(vscodeMock.__lastInformationMessage || ''));

    // Restore the default-installed mock extension for any later tests in this file.
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
    vscodeMock.__setRunCommandHandler(null);
  }

  console.log('\nTask L18: getCodeForIStatus() / \'codeForIStatus\' badge push - distinguishes not-installed from installed-but-not-connected (getConnectedCodeForIBMi() collapses those into one "undefined")');
  {
    const statusSrc = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n';
    const statusDoc = vscodeMock.__mockDocument(statusSrc);
    let statusMessageHandler = null;
    let statusDisposeHandler = null;
    const statusPosted = [];
    const statusPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { statusMessageHandler = h; return { dispose: () => {} }; },
        postMessage: (m) => statusPosted.push(m),
      },
      onDidDispose: (h) => { statusDisposeHandler = h; },
    };
    providerEntry.provider.resolveCustomTextEditor(statusDoc, statusPanel, {});

    console.log('  \'ready\' triggers a status push, before anything is clicked (so the badge is populated upfront)');
    vscodeMock.__removeMockExtension('halcyontechltd.code-for-ibmi');
    statusPosted.length = 0;
    await statusMessageHandler({ type: 'ready' });
    let statusMsg = statusPosted.find((m) => m.type === 'codeForIStatus');
    check('posts codeForIStatus on ready', !!statusMsg);
    check('not installed: installed=false, connected=false', statusMsg && statusMsg.installed === false && statusMsg.connected === false);

    console.log('  installed but no live connection (getConnection() returns undefined, or missing runCommand)');
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: { instance: { getConnection: () => undefined } },
    });
    statusPosted.length = 0;
    await statusMessageHandler({ type: 'ready' });
    statusMsg = statusPosted.find((m) => m.type === 'codeForIStatus');
    check('installed=true, connected=false - a genuinely different, actionable state from "not installed"', statusMsg && statusMsg.installed === true && statusMsg.connected === false);

    console.log('  installed AND connected (getConnection() returns a usable connection with runCommand)');
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: { instance: { getConnection: () => ({ runCommand: async () => ({ code: 0, stdout: '', stderr: '' }) }) } },
    });
    statusPosted.length = 0;
    await statusMessageHandler({ type: 'ready' });
    statusMsg = statusPosted.find((m) => m.type === 'codeForIStatus');
    check('installed=true, connected=true', statusMsg && statusMsg.installed === true && statusMsg.connected === true);

    console.log('  a Code-for-i-dependent action (compileDspf) also refreshes the badge, not just \'ready\' and the poll');
    statusPosted.length = 0;
    await statusMessageHandler({ type: 'compileDspf' });
    check('a fresh codeForIStatus follows the compile attempt', statusPosted.some((m) => m.type === 'codeForIStatus'));

    console.log('  dispose cleans up the poll interval / extensions.onDidChange subscription without throwing');
    let statusDisposeThrew = false;
    try {
      statusDisposeHandler();
    } catch (e) {
      statusDisposeThrew = true;
    }
    check('disposes cleanly', !statusDisposeThrew);

    // Restore the default-installed mock extension for any later tests in this file.
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
    vscodeMock.__setRunCommandHandler(null);
  }

  console.log('\necho-suppression (the core anti-infinite-loop mechanism)');
  const posted2 = [];
  fakeWebviewPanel.webview.postMessage = (m) => posted2.push(m);
  const editPromise = messageHandler({ type: 'applyEdit', text: 'NEW TEXT' });
  vscodeMock.__changeListener({ document: doc }); // our own edit's change event, fired synchronously in the window before the edit "settles"
  // Suggestion C's own dirtyState push is DELIBERATELY not suppressed here -
  // our own edit genuinely does make the document dirty, same as anyone
  // else's edit would, so the Save button's indicator should reflect that
  // immediately rather than waiting for the edit to "settle". What IS still
  // suppressed is externalUpdate specifically - re-echoing our own just-
  // applied text back into the webview as if it were a foreign change,
  // which is the actual infinite-loop risk this mechanism exists for.
  check('suppresses externalUpdate for our own in-flight edit (dirtyState still fires - that\'s fine, see comment above)', !posted2.some((m) => m.type === 'externalUpdate'));
  await editPromise;
  vscodeMock.__changeListener({ document: doc }); // a genuinely external change after our edit settled
  check('propagates a genuinely external change after settling', posted2.some((m) => m.type === 'externalUpdate'));

  const otherDoc = vscodeMock.__mockDocument('other');
  otherDoc.uri = { toString: () => 'file:///unrelated.dspf' };
  const countBefore = posted2.length;
  vscodeMock.__changeListener({ document: otherDoc });
  check('ignores change events for unrelated documents', posted2.length === countBefore);

  console.log('\ndispose');
  let threw = false;
  try {
    disposeHandler();
  } catch (e) {
    threw = true;
  }
  check('disposes cleanly', !threw);

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run();

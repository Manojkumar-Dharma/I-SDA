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

const { check, failureCount } = require('./helpers/harness');

async function run() {
  console.log('activate()');
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  check('registers all commands', Object.keys(vscodeMock.__registeredCommands).length === 7);
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

  console.log('\nTask L-40: narrowed CodeLens scope to specific IBM i source types (DSPF/DSPF38/DSPF36, MNUDDS/MNUCMD) instead of any member/streamfile');
  const rpgleUri = new vscodeMock.Uri('member', '/MYLIB/QRPGLESRC/SOMEPGM.RPGLE');
  const rpgleDoc = vscodeMock.__mockDocument(
    "     A          R MENU\n" +
    "     A            10 20'1. Display current library'\n" +
    "     A            11 20'2. Change current library'\n",
    rpgleUri
  );
  check('a non-DSPF-family member type gets NEITHER lens, even with menu/DSPF-shaped content', lensProvider.provideCodeLenses(rpgleDoc).length === 0);

  const dspf38Uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/SCREEN1.DSPF38');
  const dspf38Doc = vscodeMock.__mockDocument('not actually DDS-shaped text at all', dspf38Uri);
  check('a DSPF38 member type gets the screen design lens even when content doesn\'t match the DDS sniff (type is trusted over content)', lensProvider.provideCodeLenses(dspf38Doc).some((l) => l.command.command === 'dspfDesigner.openPreview'));

  const dspf36Uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/SCREEN2.DSPF36');
  const dspf36Doc = vscodeMock.__mockDocument('not actually DDS-shaped text at all', dspf36Uri);
  check('a DSPF36 member type also gets the screen design lens', lensProvider.provideCodeLenses(dspf36Doc).some((l) => l.command.command === 'dspfDesigner.openPreview'));

  const mnuddsTypeUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
  const mnuddsTypeDoc = vscodeMock.__mockDocument('not menu-shaped content, no numbered options', mnuddsTypeUri);
  check('an MNUDDS member type gets the menu design lens even without the numbered-option content sniff (type is trusted)', lensProvider.provideCodeLenses(mnuddsTypeDoc).some((l) => l.command.command === 'dspfDesigner.openMenuPreview'));

  const mnucmdUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD');
  const mnucmdDoc = vscodeMock.__mockDocument('0001 DSPLIBL\n', mnucmdUri);
  const mnucmdLenses = lensProvider.provideCodeLenses(mnucmdDoc);
  check('an MNUCMD member gets ONLY the menu design lens (not the screen design lens - MNUCMD is not DDS)', mnucmdLenses.length === 1 && mnucmdLenses[0].command.command === 'dspfDesigner.openMenuPreview');

  const clleUri = new vscodeMock.Uri('member', '/MYLIB/QCLSRC/SOMECMD.CLLE');
  const clleDoc = vscodeMock.__mockDocument('PGM\nENDPGM\n', clleUri);
  check('a CLLE member gets no lenses at all', lensProvider.provideCodeLenses(clleDoc).length === 0);

  const streamfileUri = new vscodeMock.Uri('streamfile', '/home/user/screens/customer.dspf');
  const streamfileDoc = vscodeMock.__mockDocument('     A          R MENU\n', streamfileUri);
  check('a streamfile with a .dspf extension still gets the screen design lens (file/streamfile schemes use the ordinary extension as the type)', lensProvider.provideCodeLenses(streamfileDoc).some((l) => l.command.command === 'dspfDesigner.openPreview'));

  console.log('\nTask L-40: opening an MNUCMD member/file directly resolves to its paired MNUDDS and opens THAT in the menu designer, rather than trying to parse MNUCMD\'s own non-DDS content');
  {
    const openMenuPreview = vscodeMock.__registeredCommands['dspfDesigner.openMenuPreview'];

    vscodeMock.window.activeTextEditor = { document: mnucmdDoc };
    vscodeMock.__lastExecutedCommand = undefined;
    openMenuPreview();
    const resolvedUri = vscodeMock.__lastExecutedCommand && vscodeMock.__lastExecutedCommand.args[0];
    check('resolves MYMENUQQ.MNUCMD to MYMENU.MNUDDS (same library/source file) and opens that, not the MNUCMD itself', !!resolvedUri && resolvedUri.path === '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    check('opens it in the menu designer (vscode.openWith)', vscodeMock.__lastExecutedCommand && vscodeMock.__lastExecutedCommand.id === 'vscode.openWith');

    console.log('  a plain MNUDDS member (not MNUCMD) still opens itself directly, unchanged');
    vscodeMock.window.activeTextEditor = { document: mnuddsTypeDoc };
    vscodeMock.__lastExecutedCommand = undefined;
    openMenuPreview();
    const directUri = vscodeMock.__lastExecutedCommand && vscodeMock.__lastExecutedCommand.args[0];
    check('opens the MNUDDS member itself, not a resolved companion', !!directUri && directUri.path === '/MYLIB/QDDSSRC/MYMENU.MNUDDS');

    console.log('  an MNUCMD member whose name does not follow the "<menu>QQ" convention warns instead of guessing');
    const oddMnucmdUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/RANDOMNAME.MNUCMD');
    const oddMnucmdDoc = vscodeMock.__mockDocument('0001 DSPLIBL\n', oddMnucmdUri);
    vscodeMock.window.activeTextEditor = { document: oddMnucmdDoc };
    vscodeMock.__lastWarning = undefined;
    vscodeMock.__lastExecutedCommand = undefined;
    openMenuPreview();
    check('does not attempt to open anything for an unresolvable MNUCMD name', vscodeMock.__lastExecutedCommand === undefined);
    check('warns the user instead', typeof vscodeMock.__lastWarning === 'string' && vscodeMock.__lastWarning.length > 0);
  }

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
        postMessage: (m) => refPosted.push(m),
      },
      onDidDispose: () => {},
    };
    const refPosted = [];
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
            runCommand: async (info) => {
              check('runs DSPFFD against the REF file (MYLIB/CUSMSTP)', info.command.includes('DSPFFD FILE(MYLIB/CUSMSTP)'));
              return { code: 0, stdout: '', stderr: '' };
            },
            runSQL: async (sql) => {
              runSqlCalls.push(sql);
              return [{ WHFLDT: 'A', WHFLDB: 25, WHFLDD: 0, WHFLDP: 0, WHFTXT: 'Customer number' }];
            },
          }),
        },
      },
    });
    vscodeMock.__lastInformation = undefined;
    const editBeforeResolve = vscodeMock.__lastAppliedEdit; // getter-only on the mock - compare by reference (see the L14 test below)
    await refMessageHandler({ type: 'resolveReferencedField', recordName: 'SCR1', fieldSourceLine: 3 });
    const appliedEdit = vscodeMock.__lastAppliedEdit !== editBeforeResolve ? vscodeMock.__lastAppliedEdit : undefined;
    // Task I-74: nothing is written into the source any more - the resolved
    // definition (and the keywords it passes on) goes back to the webview.
    check('Task I-74: does NOT edit the document (no WorkspaceEdit)', !appliedEdit);
    const resolvedMsg = refPosted.find((m) => m.type === 'referencesResolved');
    check('Task I-74: posts a referencesResolved message to the webview', !!resolvedMsg && resolvedMsg.entries.length === 1);
    check('Task I-74: keyed by library/file/field', !!resolvedMsg && resolvedMsg.entries[0].key === 'MYLIB/CUSMSTP/CUSTNO');
    check('Task I-74: carries the resolved length (25)', !!resolvedMsg && resolvedMsg.entries[0].definition.length === 25);
    check('Task I-74: carries the inheritable keywords (TEXT from WHFTXT)', !!resolvedMsg && resolvedMsg.entries[0].definition.keywords.some((k) => k.name === 'TEXT' && k.parameters === "'Customer number'"));
    check('confirms success to the user', /Resolved 1 referenced field/.test(vscodeMock.__lastInformationMessage || ''));
    check('queried the reference file field by name (CUSTNO)', runSqlCalls.some((sql) => sql.includes("WHFLDI = 'CUSTNO'")));

    console.log('  field not found in the reference file');
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: { instance: { getConnection: () => ({ runCommand: async () => ({ code: 0, stdout: '', stderr: '' }), runSQL: async () => [] }) } },
    });
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
            runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
            runSQL: async () => [{ WHFLDT: 'A', WHFLDB: 30, WHFLDD: 0, WHFLDP: 0 }],
          }),
        },
      },
    });
    vscodeMock.__lastInformation = undefined;
    await refMessageHandler({ type: 'resolveAllReferencedFields', recordName: 'SCR1' });
    check('resolves both reference fields on the record', /Resolved 2 referenced fields/.test(vscodeMock.__lastInformationMessage || ''));

    // Restore the default-installed mock extension for any later tests in this file.
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
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

    console.log('  listDatabaseFields: connected, single-format file - returns fields in WHFOBO order with names/attrs/text');
    const runSqlCalls = [];
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: async (info) => { dspffdCommand = info.command; return { code: 0, stdout: '', stderr: '' }; },
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
    dbPosted.length = 0;
    await dbMessageHandler({ type: 'listDatabaseFields', library: 'MYLIB', file: 'CUSMSTP' });
    check('ran DSPFFD against the qualified file', !!dspffdCommand && dspffdCommand.includes('DSPFFD FILE(MYLIB/CUSMSTP)'));
    check('queried grouped by format, WHFOBO within each (the file\'s own natural field order)', runSqlCalls.some((sql) => sql.includes('ORDER BY WHNAME, WHFOBO')));
    const listResult = dbPosted.find((m) => m.type === 'databaseFieldsResult');
    check('posts back both fields, no error, no ambiguous-formats prompt (only one format present)', !!listResult && !listResult.error && !listResult.formats && listResult.fields.length === 2);
    check('reports which record format the fields came from', listResult.recordFormat === 'CUSMSTPR');
    check('character field: length from WHFLDB, blank dataType', listResult.fields[0].name === 'CUSTNO' && listResult.fields[0].length === 6 && listResult.fields[0].dataType === '');
    check('numeric field: length from WHFLDD (digits, not bytes), decimals from WHFLDP', listResult.fields[1].name === 'BALANCE' && listResult.fields[1].length === 9 && listResult.fields[1].decimalPositions === 2 && listResult.fields[1].dataType === 'S');
    check('carries the field text description through', listResult.fields[0].text === 'Customer number');

    console.log('  listDatabaseFields: MULTI-format file (a logical file with more than one record format) - returns { formats } instead of guessing which one, since WHFOBO only orders correctly WITHIN one format');
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
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

    console.log('  addFieldsFromDatabase: Task L53 - an explicit `location` (from the webview\'s click-to-place flow) starts the batch there instead of one row below the existing field');
    const locationSrc =
      buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n' +
      buildLine({ seq: '00020', name: 'EXISTING', length: '5', dataType: 'A', usage: 'B', line: '3', col: '2' }) + '\n';
    const locationDoc = vscodeMock.__mockDocument(locationSrc);
    let locationHandler = null;
    const locationPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { locationHandler = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    providerEntry.provider.resolveCustomTextEditor(locationDoc, locationPanel, {});
    vscodeMock.__lastAppliedEdit = undefined;
    await locationHandler({
      type: 'addFieldsFromDatabase',
      recordName: 'SCR1',
      library: 'MYLIB',
      file: 'CUSMSTP',
      fields: [
        { name: 'CUSTNO', length: 6, dataType: '', decimalPositions: null, text: 'Customer number' },
        { name: 'BALANCE', length: 9, dataType: 'S', decimalPositions: 2, text: 'Account balance' },
      ],
      location: { line: 10, column: 40 },
    });
    const locationEdit = vscodeMock.__lastAppliedEdit;
    const locationText = locationEdit ? locationEdit.edits[0].newText : '';
    const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
    const locationModel = DspfParser.parseDspf(locationText);
    const locationRec = locationModel.records.find((r) => r.name === 'SCR1');
    // nextAvailableFieldName always suffixes (see its own doc comment in dspfWriter.js) -
    // same pre-existing behavior Copy/Paste already relies on - so the created fields are
    // CUSTNO2/BALANCE2, not bare CUSTNO/BALANCE; match by prefix rather than exact name.
    const custnoField = locationRec.fields.find((f) => f.name.startsWith('CUSTNO'));
    const balanceField = locationRec.fields.find((f) => f.name.startsWith('BALANCE'));
    check('the existing field is untouched, still at its own original position', /EXISTING\s+5A/.test(locationText));
    check('CUSTNO lands at the clicked line/column, not one row below EXISTING', custnoField && custnoField.location.line === 10 && custnoField.location.column === 40);
    check('BALANCE stacks one row below CUSTNO, same column', balanceField && balanceField.location.line === 11 && balanceField.location.column === 40);

    // Restore the default-installed mock extension for any later tests in this file.
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
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
  }

  console.log('\nTask L38: getModTrackingConfig() / \'modTrackingConfig\' push - reads isda.trackSourceModifications/isda.modificationTag, resends on live config changes (DSPF designer)');
  {
    vscodeMock.__clearMockConfig();
    const modSrc = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' }) + '\n';
    const modDoc = vscodeMock.__mockDocument(modSrc);
    let modMessageHandler = null;
    let modDisposeHandler = null;
    const modPosted = [];
    const modPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { modMessageHandler = h; return { dispose: () => {} }; },
        postMessage: (m) => modPosted.push(m),
      },
      onDidDispose: (h) => { modDisposeHandler = h; },
    };
    providerEntry.provider.resolveCustomTextEditor(modDoc, modPanel, {});

    console.log('  \'ready\' pushes the current setting values, defaulting to off/blank when unset');
    modPosted.length = 0;
    await modMessageHandler({ type: 'ready' });
    let modMsg = modPosted.find((m) => m.type === 'modTrackingConfig');
    check('posts modTrackingConfig on ready', !!modMsg);
    check('defaults to enabled=false, tag=\'\' when neither setting is configured', modMsg && modMsg.enabled === false && modMsg.tag === '');

    console.log('  reflects isda.trackSourceModifications/isda.modificationTag when set');
    vscodeMock.__setMockConfig('isda.trackSourceModifications', true);
    vscodeMock.__setMockConfig('isda.modificationTag', 'JDOE0902XX');
    modPosted.length = 0;
    await modMessageHandler({ type: 'ready' });
    modMsg = modPosted.find((m) => m.type === 'modTrackingConfig');
    check('enabled reflects the setting', modMsg && modMsg.enabled === true);
    check('tag reflects the setting, capped at 10 characters', modMsg && modMsg.tag === 'JDOE0902XX'.slice(0, 10));

    console.log('  a live settings.json change while the panel is open pushes a fresh modTrackingConfig, without needing another ready');
    vscodeMock.__setMockConfig('isda.trackSourceModifications', false);
    modPosted.length = 0;
    vscodeMock.__fireConfigChange('isda.trackSourceModifications');
    modMsg = modPosted.find((m) => m.type === 'modTrackingConfig');
    check('config-change listener re-sends without waiting for another ready', !!modMsg && modMsg.enabled === false);

    console.log('  the tag position (isda.modificationTagPosition) defaults to the end of the line and is pushed with the rest');
    check('position defaults to end', modMsg && modMsg.position === 'end');
    vscodeMock.__setMockConfig('isda.modificationTagPosition', 'sequence');
    modPosted.length = 0;
    vscodeMock.__fireConfigChange('isda.modificationTagPosition');
    modMsg = modPosted.find((m) => m.type === 'modTrackingConfig');
    check('changing the position re-sends it as sequence', !!modMsg && modMsg.position === 'sequence');
    vscodeMock.__setMockConfig('isda.modificationTagPosition', 'bogus');
    modPosted.length = 0;
    await modMessageHandler({ type: 'ready' });
    modMsg = modPosted.find((m) => m.type === 'modTrackingConfig');
    check('an unknown position value falls back to end', !!modMsg && modMsg.position === 'end');

    console.log('  isda.keepRemovedLines defaults to on and is pushed with the rest');
    modPosted.length = 0;
    await modMessageHandler({ type: 'ready' });
    modMsg = modPosted.find((m) => m.type === 'modTrackingConfig');
    check('keepRemoved defaults to true', !!modMsg && modMsg.keepRemoved === true);
    vscodeMock.__setMockConfig('isda.keepRemovedLines', false);
    modPosted.length = 0;
    vscodeMock.__fireConfigChange('isda.keepRemovedLines');
    modMsg = modPosted.find((m) => m.type === 'modTrackingConfig');
    check('turning it off re-sends keepRemoved false', !!modMsg && modMsg.keepRemoved === false);
    vscodeMock.__setMockConfig('isda.keepRemovedLines', true);

    console.log('  an unrelated config change does not trigger a resend');
    modPosted.length = 0;
    vscodeMock.__fireConfigChange('isda.designerOpenColumn');
    check('no modTrackingConfig sent for an unrelated setting', !modPosted.some((m) => m.type === 'modTrackingConfig'));

    console.log('  dispose cleans up the config-change subscription without throwing');
    let modDisposeThrew = false;
    try {
      modDisposeHandler();
    } catch (e) {
      modDisposeThrew = true;
    }
    check('disposes cleanly', !modDisposeThrew);

    vscodeMock.__clearMockConfig();
  }

  console.log('\nTask M8: the SAME modTrackingConfig push/resend, ported to the menu designer (MenuDesignerEditorProvider) - shares the exact same isda.* settings as the DSPF designer above');
  {
    vscodeMock.__clearMockConfig();
    const menuProviderEntry = vscodeMock.__registeredCustomEditorProviders['dspfDesigner.menuEditor'];
    const mnuSrc = "     A          R MENU\n     A            10 20'1. Display current library'\n";
    const mnuUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MODMENU.MNUDDS');
    vscodeMock.__setMockFile(new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MODMENUQQ.MNUCMD'), '0001 DSPLIBL\n');
    const mnuDoc = vscodeMock.__mockDocument(mnuSrc, mnuUri);
    let mnuModMessageHandler = null;
    let mnuModDisposeHandler = null;
    const mnuModPosted = [];
    const mnuModPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { mnuModMessageHandler = h; return { dispose: () => {} }; },
        postMessage: (m) => mnuModPosted.push(m),
      },
      onDidDispose: (h) => { mnuModDisposeHandler = h; },
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(mnuDoc, mnuModPanel, {});

    console.log('  \'ready\' pushes the current setting values, defaulting to off/blank when unset');
    mnuModPosted.length = 0;
    await mnuModMessageHandler({ type: 'ready' });
    let mnuModMsg = mnuModPosted.find((m) => m.type === 'modTrackingConfig');
    check('posts modTrackingConfig on ready', !!mnuModMsg);
    check('defaults to enabled=false, tag=\'\' when neither setting is configured', mnuModMsg && mnuModMsg.enabled === false && mnuModMsg.tag === '');

    console.log('  reflects isda.trackSourceModifications/isda.modificationTag when set - the SAME settings the DSPF designer reads, confirming they are shared rather than duplicated per-designer');
    vscodeMock.__setMockConfig('isda.trackSourceModifications', true);
    vscodeMock.__setMockConfig('isda.modificationTag', 'JDOE0902XX');
    mnuModPosted.length = 0;
    await mnuModMessageHandler({ type: 'ready' });
    mnuModMsg = mnuModPosted.find((m) => m.type === 'modTrackingConfig');
    check('enabled reflects the setting', mnuModMsg && mnuModMsg.enabled === true);
    check('tag reflects the setting, capped at 10 characters', mnuModMsg && mnuModMsg.tag === 'JDOE0902XX'.slice(0, 10));

    console.log('  a live settings.json change while the panel is open pushes a fresh modTrackingConfig, without needing another ready');
    vscodeMock.__setMockConfig('isda.trackSourceModifications', false);
    mnuModPosted.length = 0;
    vscodeMock.__fireConfigChange('isda.trackSourceModifications');
    mnuModMsg = mnuModPosted.find((m) => m.type === 'modTrackingConfig');
    check('config-change listener re-sends without waiting for another ready', !!mnuModMsg && mnuModMsg.enabled === false);

    console.log('  the same position setting reaches the menu designer');
    vscodeMock.__setMockConfig('isda.modificationTagPosition', 'sequence');
    mnuModPosted.length = 0;
    vscodeMock.__fireConfigChange('isda.modificationTagPosition');
    mnuModMsg = mnuModPosted.find((m) => m.type === 'modTrackingConfig');
    check('changing the position re-sends it as sequence', !!mnuModMsg && mnuModMsg.position === 'sequence');

    console.log('  an unrelated config change does not trigger a resend');
    mnuModPosted.length = 0;
    vscodeMock.__fireConfigChange('isda.designerOpenColumn');
    check('no modTrackingConfig sent for an unrelated setting', !mnuModPosted.some((m) => m.type === 'modTrackingConfig'));

    console.log('  dispose cleans up the config-change subscription without throwing (alongside the menu designer\'s other own subscriptions)');
    let mnuModDisposeThrew = false;
    try {
      mnuModDisposeHandler();
    } catch (e) {
      mnuModDisposeThrew = true;
    }
    check('disposes cleanly', !mnuModDisposeThrew);

    vscodeMock.__clearMockConfig();
  }

  console.log('\nBug fix (direct request) - clicking the MNUCMD source name above the Compile Menu button opens that companion source, resolved from THIS document\'s own library/source file via getMenuCommandMemberUri() - never anything separately configured');
  {
    const menuProviderEntry = vscodeMock.__registeredCustomEditorProviders['dspfDesigner.menuEditor'];
    const mnuSrc = "     A          R MENU\n     A            10 20'1. Display current library'\n";
    const mnuUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MODMENU.MNUDDS');
    const expectedCommandUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MODMENUQQ.MNUCMD');
    vscodeMock.__setMockFile(expectedCommandUri, '0001 DSPLIBL\n');
    const mnuDoc = vscodeMock.__mockDocument(mnuSrc, mnuUri);
    let cmdMessageHandler = null;
    const cmdPanel = {
      webview: {
        cspSource: 'x', options: null,
        set html(v) {}, get html() { return ''; },
        onDidReceiveMessage: (h) => { cmdMessageHandler = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(mnuDoc, cmdPanel, {});

    console.log('  the companion member exists: opens it directly, resolved to the SAME library/source file as the open MNUDDS member, just the MNUCMD member name swapped in');
    vscodeMock.workspace.fs.stat = () => Promise.resolve({});
    vscodeMock.__lastShowTextDocument = undefined;
    vscodeMock.__lastInformation = undefined;
    vscodeMock.__lastWarning = undefined;
    await cmdMessageHandler({ type: 'openCommandSource' });
    check('opens a document (showTextDocument called)', !!vscodeMock.__lastShowTextDocument);
    check('...resolved to the correct library/source file/member (MODMENUQQ.MNUCMD, same library+source file as MODMENU.MNUDDS)', vscodeMock.__lastShowTextDocument && vscodeMock.__lastShowTextDocument.toString() === expectedCommandUri.toString());
    check('opened not in preview mode (stays open on further clicks elsewhere)', !!vscodeMock.__lastShowTextDocumentOptions && vscodeMock.__lastShowTextDocumentOptions.preview === false);
    check('no "doesn\'t exist yet" info message when it DOES exist', !vscodeMock.__lastInformation);

    console.log('  the companion member does not exist yet: tells the person instead of trying (and failing) to open it');
    vscodeMock.workspace.fs.stat = () => Promise.reject(new Error('not found'));
    vscodeMock.__lastShowTextDocument = undefined;
    vscodeMock.__lastInformation = undefined;
    await cmdMessageHandler({ type: 'openCommandSource' });
    check('does NOT call showTextDocument for a member that does not exist', !vscodeMock.__lastShowTextDocument);
    check('tells the person it will be created on first edit instead', !!vscodeMock.__lastInformation && /doesn't exist yet/i.test(vscodeMock.__lastInformation));

    vscodeMock.workspace.fs.stat = () => Promise.reject(new Error('not found'));
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

  console.log('\nE1b: diagnostics hub');
  const diagCollections = vscodeMock.__diagnosticCollections;
  check('activate() creates one diagnostic collection, named iSDA', diagCollections.length >= 1 && diagCollections[diagCollections.length - 1].name === 'iSDA');
  const diagCollection = diagCollections[diagCollections.length - 1];
  const badDds = [buildLine({ nameType: 'R', name: 'REC1' }), buildLine({ func: 'RMVWDW' })].join('\n');
  const diagDoc = vscodeMock.__mockDocument(badDds);
  vscodeMock.__setOpenTextDocuments([diagDoc]);
  vscodeMock.__fireConfigChange('isda.diagnostics.enable');
  check('a document the DDS selector does not match is not analysed', diagCollection.get(diagDoc.uri) === undefined);
  vscodeMock.__setLanguageMatch(() => 10);
  vscodeMock.__fireConfigChange('isda.diagnostics.enable');
  const diagList = diagCollection.get(diagDoc.uri) || [];
  check('a DDS display source with a violation is published to the Problems panel', diagList.length === 1 && diagList[0].code === 'isda.windowDependency' && diagList[0].source === 'iSDA');
  const cmdDoc = vscodeMock.__mockDocument(badDds, new vscodeMock.Uri('member', '/MYLIB/QMNUSRC/MYMENU.MNUCMD'));
  const rpgDoc = vscodeMock.__mockDocument(badDds, new vscodeMock.Uri('member', '/MYLIB/QRPGLESRC/PGM.RPGLE'));
  vscodeMock.__setOpenTextDocuments([diagDoc, cmdDoc, rpgDoc]);
  vscodeMock.__fireConfigChange('isda.diagnostics');
  check('a MNUCMD member is not analysed', diagCollection.get(cmdDoc.uri) === undefined);
  check('  nor a member of another source type (RPGLE)', diagCollection.get(rpgDoc.uri) === undefined);
  check('  while the DSPF source still is', (diagCollection.get(diagDoc.uri) || []).length === 1);
  vscodeMock.__setMockConfig('isda.diagnostics.severity', { 'isda.windowDependency': 'warning' });
  vscodeMock.__fireConfigChange('isda.diagnostics.severity');
  check('isda.diagnostics.severity is read from the settings', (diagCollection.get(diagDoc.uri) || [{}])[0].severity === vscodeMock.DiagnosticSeverity.Warning);
  vscodeMock.__setMockConfig('isda.diagnostics.enable', false);
  vscodeMock.__fireConfigChange('isda.diagnostics.enable');
  check('isda.diagnostics.enable = false clears the diagnostics', diagCollection.get(diagDoc.uri) === undefined);
  vscodeMock.__clearMockConfig();
  vscodeMock.__setLanguageMatch(null);
  vscodeMock.__setOpenTextDocuments([]);
  vscodeMock.__fireConfigChange('isda.diagnostics');

  console.log('\nE1c: keyword hover');
  const hoverEntries = vscodeMock.__registeredHoverProviders;
  // The keyword hover (E1c) is registered first, the column-aid hover (E1g) after it.
  check('activate() registers the keyword hover provider over the DDS selector', hoverEntries.length >= 2 && !!hoverEntries[hoverEntries.length - 2].selector);
  const hoverProvider = hoverEntries[hoverEntries.length - 2].provider;
  const hoverDds = [buildLine({ nameType: 'R', name: 'REC1' }), buildLine({ name: 'FLD1', length: 10, dataType: 'A', usage: 'B', line: 2, col: 2, func: 'DSPATR(HI)' })].join('\n');
  const hoverDoc = vscodeMock.__mockDocument(hoverDds);
  check('a document the DDS selector does not match gets no hover', hoverProvider.provideHover(hoverDoc, { line: 1, character: 46 }) === undefined);
  vscodeMock.__setLanguageMatch(() => 10);
  const hv = hoverProvider.provideHover(hoverDoc, { line: 1, character: 46 });
  check('a DDS display source hovers a keyword from the built data file', hv && hv.contents.value.indexOf('**DSPATR**') === 0 && hv.range.start.line === 1 && hv.range.start.character === 44);
  check('  citing its DDS Reference section', hv && /DDS Reference \(V7R6\): "DSPATR \(Display Attribute\) keyword for display files" \(line \d+ of DDS_Keyword_V7r6\.txt\)/.test(hv.contents.value));
  const hoverCmd = vscodeMock.__mockDocument(hoverDds, new vscodeMock.Uri('member', '/MYLIB/QMNUSRC/MYMENU.MNUCMD'));
  check('a MNUCMD member gets no hover', hoverProvider.provideHover(hoverCmd, { line: 1, character: 46 }) === undefined);
  const hoverRpg = vscodeMock.__mockDocument(hoverDds, new vscodeMock.Uri('member', '/MYLIB/QRPGLESRC/PGM.RPGLE'));
  check('  nor a member of another source type (RPGLE)', hoverProvider.provideHover(hoverRpg, { line: 1, character: 46 }) === undefined);
  check('no hover outside the keyword area', hoverProvider.provideHover(hoverDoc, { line: 1, character: 10 }) === undefined);
  vscodeMock.__setMockConfig('isda.hover.enable', false);
  check('isda.hover.enable = false gives no hover', hoverProvider.provideHover(hoverDoc, { line: 1, character: 46 }) === undefined);
  vscodeMock.__clearMockConfig();

  vscodeMock.__setLanguageMatch(null);
  console.log('\nE1d: keyword completion');
  const completionEntries = vscodeMock.__registeredCompletionProviders;
  check('activate() registers one completion provider over the DDS selector', completionEntries.length >= 1 && !!completionEntries[completionEntries.length - 1].selector);
  const completionProvider = completionEntries[completionEntries.length - 1].provider;
  const compLines = [buildLine({ nameType: 'R', name: 'REC1' }), buildLine({ name: 'FLD1', length: 10, dataType: 'A', usage: 'B', line: 2, col: 2, func: 'DSPA' })];
  const compDoc = vscodeMock.__mockDocument(compLines.join('\n'));
  check('a document the DDS selector does not match gets no completion', completionProvider.provideCompletionItems(compDoc, { line: 1, character: 48 }) === undefined);
  vscodeMock.__setLanguageMatch(() => 10);
  const cl = completionProvider.provideCompletionItems(compDoc, { line: 1, character: 48 });
  check('a DDS display source completes a keyword from the built data file', cl && cl.items.length === 1 && cl.items[0].label === 'DSPATR' && cl.items[0].insertText.value.indexOf('DSPATR(${1:') === 0);
  const compCmd = vscodeMock.__mockDocument(compLines.join('\n'), new vscodeMock.Uri('member', '/MYLIB/QMNUSRC/MYMENU.MNUCMD'));
  check('a MNUCMD member gets no completion', completionProvider.provideCompletionItems(compCmd, { line: 1, character: 48 }) === undefined);
  check('no completion outside the keyword area', completionProvider.provideCompletionItems(compDoc, { line: 1, character: 10 }) === undefined);
  vscodeMock.__setMockConfig('isda.completion.enable', false);
  check('isda.completion.enable = false gives no completion', completionProvider.provideCompletionItems(compDoc, { line: 1, character: 48 }) === undefined);
  vscodeMock.__clearMockConfig();
  vscodeMock.__setLanguageMatch(() => 10);
  const sflDoc = vscodeMock.__mockDocument([buildLine({ nameType: 'R', name: 'REC1' }), buildLine({ func: 'SFL' }), '     A' + ' '.repeat(38), buildLine({ name: 'FLD1', length: 10, dataType: 'A', usage: 'B', line: 2, col: 2 })].join('\n'));
  const guarded = completionProvider.provideCompletionItems(sflDoc, { line: 2, character: 44 });
  vscodeMock.__setMockConfig('isda.completion.filterByRules', false);
  const unguarded = completionProvider.provideCompletionItems(sflDoc, { line: 2, character: 44 });
  check('isda.completion.filterByRules reaches the provider (a subfile record offers fewer keywords with the rules on)', guarded.items.length > 0 && unguarded.items.length > guarded.items.length);
  vscodeMock.__clearMockConfig();

  console.log('\nE1e: outline and definition');
  vscodeMock.__setLanguageMatch(null);
  const symbolEntries = vscodeMock.__registeredSymbolProviders;
  const definitionEntries = vscodeMock.__registeredDefinitionProviders;
  check('activate() registers a document symbol provider and a definition provider over the DDS selector', symbolEntries.length >= 1 && definitionEntries.length >= 1 &&
    !!symbolEntries[symbolEntries.length - 1].selector && !!definitionEntries[definitionEntries.length - 1].selector);
  check('  the symbol provider carries a label', !!(symbolEntries[symbolEntries.length - 1].metadata && symbolEntries[symbolEntries.length - 1].metadata.label));
  const navProvider = symbolEntries[symbolEntries.length - 1].provider;
  const navLines = [buildLine({ nameType: 'R', name: 'SFLREC' }), buildLine({ func: 'SFL' }), buildLine({ nameType: 'R', name: 'CTL1' }), buildLine({ func: 'SFLCTL(SFLREC)' }), buildLine({ name: 'F1', length: 10, dataType: 'A', usage: 'B', line: 2, col: 2 })];
  const navDoc = vscodeMock.__mockDocument(navLines.join('\n'));
  check('a document the DDS selector does not match gets no outline and no definition', navProvider.provideDocumentSymbols(navDoc) === undefined && navProvider.provideDefinition(navDoc, { line: 3, character: 52 }) === undefined);
  vscodeMock.__setLanguageMatch(() => 10);
  const outlineSymbols = navProvider.provideDocumentSymbols(navDoc);
  check('a DDS display source gets its record formats as the outline', outlineSymbols && outlineSymbols.length === 2 && outlineSymbols[0].name === 'SFLREC' && outlineSymbols[1].children.length === 1);
  const navLinks = navProvider.provideDefinition(navDoc, { line: 3, character: 52 });
  check('Go to Definition on the record name in SFLCTL(...) answers a link to that record format', navLinks && navLinks.length === 1 && navLinks[0].targetSelectionRange.start.line === 0 && navLinks[0].targetSelectionRange.start.character === 18);
  const navCmd = vscodeMock.__mockDocument(navLines.join('\n'), new vscodeMock.Uri('member', '/MYLIB/QMNUSRC/MYMENU.MNUCMD'));
  check('a MNUCMD member gets neither', navProvider.provideDocumentSymbols(navCmd) === undefined && navProvider.provideDefinition(navCmd, { line: 3, character: 52 }) === undefined);
  vscodeMock.__setMockConfig('isda.outline.enable', false);
  check('isda.outline.enable = false gives no outline (the definition stays)', navProvider.provideDocumentSymbols(navDoc) === undefined && navProvider.provideDefinition(navDoc, { line: 3, character: 52 }).length === 1);
  vscodeMock.__clearMockConfig();
  vscodeMock.__setMockConfig('isda.definition.enable', false);
  check('isda.definition.enable = false gives no definition (the outline stays)', navProvider.provideDefinition(navDoc, { line: 3, character: 52 }) === undefined && navProvider.provideDocumentSymbols(navDoc).length === 2);
  vscodeMock.__clearMockConfig();
  vscodeMock.__setLanguageMatch(null);

  console.log('\nE1f: quick-fixes');
  vscodeMock.__setLanguageMatch(() => 10);
  const quickFixEntries = vscodeMock.__registeredCodeActionProviders;
  check('activate() registers one code action provider over the DDS selector, offering quick-fix actions', quickFixEntries.length >= 1 && !!quickFixEntries[quickFixEntries.length - 1].selector &&
    JSON.stringify(quickFixEntries[quickFixEntries.length - 1].metadata) === JSON.stringify({ providedCodeActionKinds: ['quickfix'] }));
  const quickFixProvider = quickFixEntries[quickFixEntries.length - 1].provider;
  const qfLines = ['     A          R REC1', '     A                                      PUTRETAIN', '     A            F1            10A  B  2  2'];
  const qfDoc = vscodeMock.__mockDocument(qfLines.join('\n'));
  const qfDiagnostic = { range: { start: { line: 1, character: 44 }, end: { line: 1, character: 53 } }, source: 'iSDA', code: 'isda.multiLevelEligibility' };
  const qfActions = quickFixProvider.provideCodeActions(qfDoc, null, { diagnostics: [qfDiagnostic] });
  check('a PUTRETAIN problem gets "Add OVERLAY", "Remove PUTRETAIN" and "Open in designer" from the real activate()', qfActions.map((a) => a.title).join('|') === 'Add OVERLAY to record format REC1|Remove PUTRETAIN|Open in designer');
  check('  "Open in designer" opens the display designer (a .dspf is a display source)', qfActions[2].command.command === 'vscode.openWith' && qfActions[2].command.arguments[1] === 'dspfDesigner.editor');
  vscodeMock.__setMockConfig('isda.keepRemovedLines', false);
  const qfNoKeep = quickFixProvider.provideCodeActions(qfDoc, null, { diagnostics: [qfDiagnostic] });
  check('isda.keepRemovedLines = false reaches the edit (the removed line is not kept as a comment)', qfNoKeep[1].edit.edits[0].newText === '' && /^ {5}A\* +PUTRETAIN\n$/.test(qfActions[1].edit.edits[0].newText));
  vscodeMock.__clearMockConfig();
  vscodeMock.__setMockConfig('isda.trackSourceModifications', true);
  vscodeMock.__setMockConfig('isda.modificationTag', 'MK');
  const qfTracked = quickFixProvider.provideCodeActions(qfDoc, null, { diagnostics: [qfDiagnostic] });
  check('isda.trackSourceModifications and isda.modificationTag reach the edit (the added line is tagged)', /OVERLAY\s+MK/.test(qfTracked[0].edit.edits[0].newText));
  vscodeMock.__clearMockConfig();
  vscodeMock.__setMockConfig('isda.quickFix.openInDesigner', false);
  check('isda.quickFix.openInDesigner = false removes "Open in designer"', quickFixProvider.provideCodeActions(qfDoc, null, { diagnostics: [qfDiagnostic] }).length === 2);
  vscodeMock.__clearMockConfig();
  vscodeMock.__setMockConfig('isda.quickFix.enable', false);
  check('isda.quickFix.enable = false offers nothing', quickFixProvider.provideCodeActions(qfDoc, null, { diagnostics: [qfDiagnostic] }).length === 0);
  vscodeMock.__clearMockConfig();
  const qfCmd = vscodeMock.__mockDocument(qfLines.join('\n'), new vscodeMock.Uri('member', '/MYLIB/QMNUSRC/MYMENU.MNUCMD'));
  check('a MNUCMD member gets no quick-fix', quickFixProvider.provideCodeActions(qfCmd, null, { diagnostics: [qfDiagnostic] }).length === 0);
  vscodeMock.__setLanguageMatch(null);

  console.log('\nE1g: column aids');
  vscodeMock.__setLanguageMatch(() => 10);
  check('activate() draws nothing by default (isda.columnAids.enable is off): no decoration type is created', vscodeMock.__decorationTypes.length === 0);
  const caHover = vscodeMock.__registeredHoverProviders ? vscodeMock.__registeredHoverProviders[vscodeMock.__registeredHoverProviders.length - 1] : null;
  check('activate() registers the column-aid hover provider', !!caHover);
  const caLines = ['     A          R REC1', '     A            F1            10A  B  2  2'];
  const caDoc = vscodeMock.__mockDocument(caLines.join('\n'));
  caDoc.lineCount = caLines.length;
  caDoc.lineAt = (i) => ({ text: caLines[i] });
  vscodeMock.window.activeTextEditor = { document: caDoc, selection: { active: { line: 1 } }, setDecorations: () => {} };
  check('the hover says nothing while the setting is off', caHover.provider.provideHover(caDoc, { line: 1, character: 31 }) === undefined);
  vscodeMock.__setMockConfig('isda.columnAids.enable', true);
  const caHit = caHover.provider.provideHover(caDoc, { line: 1, character: 31 });
  check('with isda.columnAids.enable on, hovering the length column of the active line names it', !!caHit && /^\*\*Length\*\*/.test(caHit.contents.value));
  check('  no column hover off the active line', caHover.provider.provideHover(caDoc, { line: 0, character: 17 }) === undefined);
  vscodeMock.window.activeTextEditor = null;
  vscodeMock.__clearMockConfig();
  vscodeMock.__setLanguageMatch(null);

  console.log('\ndispose');
  let threw = false;
  try {
    disposeHandler();
  } catch (e) {
    threw = true;
  }
  check('disposes cleanly', !threw);

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}

run();

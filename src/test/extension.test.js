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
  check('registers all commands', Object.keys(vscodeMock.__registeredCommands).length === 5);
  check('registers openPreview command', typeof vscodeMock.__registeredCommands['dspfDesigner.openPreview'] === 'function');
  check('registers openMenuPreview command', typeof vscodeMock.__registeredCommands['dspfDesigner.openMenuPreview'] === 'function');
  check('registers createNewDspf command', typeof vscodeMock.__registeredCommands['dspfDesigner.createNewDspf'] === 'function');
  check('registers createNewMenu command', typeof vscodeMock.__registeredCommands['dspfDesigner.createNewMenu'] === 'function');
  check('registers compileMenu command', typeof vscodeMock.__registeredCommands['dspfDesigner.compileMenu'] === 'function');
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

  console.log('\napplyEdit message -> WorkspaceEdit');
  await messageHandler({ type: 'applyEdit', text: '     A          R MENU2\n' });
  check('applies a WorkspaceEdit with the new text', vscodeMock.__lastAppliedEdit.edits[0].newText === '     A          R MENU2\n');

  console.log('\nerror message -> showErrorMessage');
  await messageHandler({ type: 'error', message: 'boom' });
  check('surfaces the error to the user', vscodeMock.__lastError === 'iSDA: boom');

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
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi' });
    vscodeMock.__setRunCommandHandler(null);
  }

  console.log('\necho-suppression (the core anti-infinite-loop mechanism)');
  const posted2 = [];
  fakeWebviewPanel.webview.postMessage = (m) => posted2.push(m);
  const editPromise = messageHandler({ type: 'applyEdit', text: 'NEW TEXT' });
  vscodeMock.__changeListener({ document: doc }); // our own edit's change event, fired synchronously in the window before the edit "settles"
  check('suppresses the change event our own in-flight edit produces', posted2.length === 0);
  await editPromise;
  vscodeMock.__changeListener({ document: doc }); // a genuinely external change after our edit settled
  check('propagates a genuinely external change after settling', posted2.length === 1 && posted2[0].type === 'externalUpdate');

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

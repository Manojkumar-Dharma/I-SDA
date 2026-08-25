/**
 * menu.test.js
 *
 * Covers the menu-design vertical slice: mnuCmdEngine.js's parse/write logic
 * directly (pure functions, no vscode involved), then MenuDesignerEditorProvider
 * against the vscode mock the same way extension.test.js exercises
 * DspfDesignerEditorProvider - including reading/writing the companion MNUCMD
 * member via workspace.fs, since that document is never an open TextDocument
 * the way the MNUDDS one is. Run with: node src/test/menu.test.js
 */
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const MnuCmdEngine = require(path.join(__dirname, '../mnuCmdEngine.js'));
const ext = require(path.join(__dirname, '../../dist/extension.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

function run() {
  console.log('mnuCmdEngine.parseMnuCmd()');
  const sample = '0001 DSPLIBL\n0002 CHGCURLIB\n* a comment, left alone\n\n0010 CALL PGM1\n';
  const parsed = MnuCmdEngine.parseMnuCmd(sample);
  check('parses all three option lines', parsed.options.length === 3);
  check('preserves numeric option identity', parsed.options[0].optionNumber === '0001' && parsed.options[0].numberValue === 1);
  check('captures the command text verbatim', parsed.options[1].command === 'CHGCURLIB');
  check('sorts options numerically', parsed.options.map((o) => o.numberValue).join(',') === '1,2,10');
  check('does not misparse the comment line as an option', parsed.errors.length === 0);

  console.log('\nmnuCmdEngine.applyOptionCommand() - update existing');
  const updated = MnuCmdEngine.applyOptionCommand(sample, 2, 'CHGCURLIB2');
  const reparsedUpdated = MnuCmdEngine.parseMnuCmd(updated);
  check('updates the command in place', reparsedUpdated.options.find((o) => o.numberValue === 2).command === 'CHGCURLIB2');
  check('leaves the untouched lines byte-for-byte alone', updated.includes('* a comment, left alone'));
  check('does not disturb option 1', reparsedUpdated.options.find((o) => o.numberValue === 1).command === 'DSPLIBL');

  console.log('\nmnuCmdEngine.applyOptionCommand() - insert new, in numeric order');
  const withNewOption = MnuCmdEngine.applyOptionCommand(sample, 5, 'CALL PGM5');
  const reparsedNew = MnuCmdEngine.parseMnuCmd(withNewOption);
  check('adds the new option', reparsedNew.options.some((o) => o.numberValue === 5 && o.command === 'CALL PGM5'));
  check('keeps everything sorted numerically after insertion', reparsedNew.options.map((o) => o.numberValue).join(',') === '1,2,5,10');

  console.log('\nmnuCmdEngine.applyOptionCommand() - clearing a command removes the line');
  const cleared = MnuCmdEngine.applyOptionCommand(sample, 1, '   ');
  const reparsedCleared = MnuCmdEngine.parseMnuCmd(cleared);
  check('removes the option entirely rather than leaving a blank command', !reparsedCleared.options.some((o) => o.numberValue === 1));

  console.log('\nmnuCmdEngine.applyOptionCommand() - starting from nothing (no companion member yet)');
  const fromScratch = MnuCmdEngine.applyOptionCommand('', 1, 'DSPLIBL');
  check('creates a well-formed single-line file', fromScratch === '0001 DSPLIBL\n');

  console.log('\nactivate()');
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  const menuProviderEntry = vscodeMock.__registeredCustomEditorProviders['dspfDesigner.menuEditor'];
  check('registers the menu editor provider under the right viewType', !!menuProviderEntry);
  check('menu editor keeps webview context when hidden', menuProviderEntry.options.webviewOptions.retainContextWhenHidden === true);

  console.log('\nresolveCustomTextEditor() - member with an existing companion MNUCMD');
  const menuSource =
    "     A          R MENU\n" +
    "     A            10 20'1. Display current library'\n" +
    "     A            11 20'2. Change current library'\n";
  const menuUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
  vscodeMock.__setMockFile(new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD'), '0001 DSPLIBL\n');
  const doc = vscodeMock.__mockDocument(menuSource, menuUri);

  let htmlSet = null;
  let messageHandler = null;
  const fakeWebviewPanel = {
    webview: {
      cspSource: 'vscode-webview://fake',
      options: null,
      set html(v) { htmlSet = v; },
      get html() { return htmlSet; },
      onDidReceiveMessage: (h) => { messageHandler = h; return { dispose: () => {} }; },
      postMessage: () => {},
    },
    onDidDispose: () => {},
  };

  return menuProviderEntry.provider.resolveCustomTextEditor(doc, fakeWebviewPanel, {}).then(async () => {
    check('enables scripts on the menu webview', fakeWebviewPanel.webview.options && fakeWebviewPanel.webview.options.enableScripts === true);
    check('sets non-trivial HTML', typeof htmlSet === 'string' && htmlSet.length > 1000);
    check('embeds the initial MNUDDS content', htmlSet.includes('MYMENU') || htmlSet.includes('Display current library'));
    check('embeds the loaded companion command source', htmlSet.includes('DSPLIBL'));
    check("reports the command source as 'loaded'", htmlSet.includes('"loaded"'));

    console.log('\napplyMenuCmdEdit message -> companion member written via workspace.fs');
    await messageHandler({ type: 'applyMenuCmdEdit', text: '0001 DSPLIBL\n0002 CHGCURLIB\n' });
    check(
      'writes the updated command source to the QQ companion member',
      vscodeMock.__lastWrittenFile &&
        vscodeMock.__lastWrittenFile.uri.path === '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD' &&
        vscodeMock.__lastWrittenFile.text === '0001 DSPLIBL\n0002 CHGCURLIB\n'
    );

    console.log('\nresolveCustomTextEditor() - companion MNUCMD member ALSO open in its own editor tab');
    const openCompanionUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD');
    const openCompanionDoc = vscodeMock.__mockDocument('0001 DSPLIBL\n', openCompanionUri);
    vscodeMock.__setOpenTextDocuments([openCompanionDoc]);

    let htmlSet4 = null;
    let messageHandler4 = null;
    const postedToWebview4 = [];
    const fakeWebviewPanel4 = {
      webview: {
        cspSource: 'vscode-webview://fake',
        options: null,
        set html(v) { htmlSet4 = v; },
        get html() { return htmlSet4; },
        onDidReceiveMessage: (h) => { messageHandler4 = h; return { dispose: () => {} }; },
        postMessage: (m) => { postedToWebview4.push(m); },
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(doc, fakeWebviewPanel4, {});

    const writtenFileBefore = vscodeMock.__lastWrittenFile;
    await messageHandler4({ type: 'applyMenuCmdEdit', text: '0001 DSPLIBL\n0002 CHGCURLIB\n' });
    const applied = vscodeMock.__lastAppliedEdit;
    check(
      'edits the OPEN companion document via WorkspaceEdit instead of writeFile',
      applied &&
        applied.edits.length > 0 &&
        applied.edits[applied.edits.length - 1].uri.toString() === openCompanionUri.toString() &&
        applied.edits[applied.edits.length - 1].newText === '0001 DSPLIBL\n0002 CHGCURLIB\n'
    );
    check('does NOT fall back to workspace.fs.writeFile when the document is open', vscodeMock.__lastWrittenFile === writtenFileBefore);

    console.log('\nexternal edit to the open companion document -> echoed into the options panel');
    vscodeMock.__changeListener({ document: vscodeMock.__mockDocument('0001 DSPLIBL\n0002 CALL PGM2\n', openCompanionUri) });
    const externalMsg = postedToWebview4.find((m) => m.type === 'externalCommandUpdate');
    check('posts externalCommandUpdate with the new command source', externalMsg && externalMsg.text === '0001 DSPLIBL\n0002 CALL PGM2\n');

    vscodeMock.__setOpenTextDocuments([]); // reset for the scenarios below, which assume no open companion doc

    console.log('\nresolveCustomTextEditor() - member with NO companion MNUCMD yet');
    vscodeMock.__clearMockFiles();
    let htmlSet2 = null;
    const fakeWebviewPanel2 = {
      webview: {
        cspSource: 'vscode-webview://fake',
        options: null,
        set html(v) { htmlSet2 = v; },
        get html() { return htmlSet2; },
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(doc, fakeWebviewPanel2, {});
    check("reports the command source as 'missing' rather than erroring", htmlSet2.includes('"missing"'));

    console.log('\nresolveCustomTextEditor() - local file (no companion sibling file yet)');
    let htmlSet3 = null;
    let messageHandler3 = null;
    const localDoc = vscodeMock.__mockDocument(menuSource, vscodeMock.Uri.file('/workspace/MYMENU.mnudds'));
    const fakeWebviewPanel3 = {
      webview: {
        cspSource: 'vscode-webview://fake',
        options: null,
        set html(v) { htmlSet3 = v; },
        get html() { return htmlSet3; },
        onDidReceiveMessage: (h) => { messageHandler3 = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(localDoc, fakeWebviewPanel3, {});
    check(
      "local .mnudds files are supported now (0.9.15) - reports 'missing', not 'unsupported'",
      htmlSet3.includes('"missing"') && !htmlSet3.includes('"unsupported"')
    );
    check('embeds the derived local companion filename (MYMENUQQ.mnucmd)', htmlSet3.includes('MYMENUQQ.mnucmd'));

    console.log('  editing an option on a local file writes the sibling MYMENUQQ.mnucmd file');
    await messageHandler3({ type: 'applyMenuCmdEdit', text: '0001 DSPLIBL\n' });
    check(
      'writes to the sibling file in the same directory, lowercase .mnucmd extension',
      vscodeMock.__lastWrittenFile &&
        vscodeMock.__lastWrittenFile.uri.path === '/workspace/MYMENUQQ.mnucmd' &&
        vscodeMock.__lastWrittenFile.text === '0001 DSPLIBL\n'
    );

    console.log('\nresolveCustomTextEditor() - local file WITH an existing companion sibling file');
    vscodeMock.__setMockFile(vscodeMock.Uri.file('/workspace/MYMENUQQ.mnucmd'), '0001 DSPLIBL\n0002 CHGCURLIB\n');
    let htmlSetLocalExisting = null;
    const fakeWebviewPanelLocalExisting = {
      webview: {
        cspSource: 'vscode-webview://fake',
        options: null,
        set html(v) { htmlSetLocalExisting = v; },
        get html() { return htmlSetLocalExisting; },
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(localDoc, fakeWebviewPanelLocalExisting, {});
    check("reports 'loaded' when the local sibling file already exists", htmlSetLocalExisting.includes('"loaded"'));
    check('embeds the existing local companion content', htmlSetLocalExisting.includes('DSPLIBL') && htmlSetLocalExisting.includes('CHGCURLIB'));

    console.log('\nresolveCustomTextEditor() - IFS streamfile (no companion sibling file yet)');
    let htmlSetStreamfile = null;
    let messageHandlerStreamfile = null;
    const streamfileDoc = vscodeMock.__mockDocument(menuSource, new vscodeMock.Uri('streamfile', '/home/user/MYMENU.mnudds'));
    const fakeWebviewPanelStreamfile = {
      webview: {
        cspSource: 'vscode-webview://fake',
        options: null,
        set html(v) { htmlSetStreamfile = v; },
        get html() { return htmlSetStreamfile; },
        onDidReceiveMessage: (h) => { messageHandlerStreamfile = h; return { dispose: () => {} }; },
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(streamfileDoc, fakeWebviewPanelStreamfile, {});
    check(
      "IFS streamfiles are supported now - reports 'missing', not 'unsupported'",
      htmlSetStreamfile.includes('"missing"') && !htmlSetStreamfile.includes('"unsupported"')
    );
    check('embeds the derived streamfile companion filename (MYMENUQQ.mnucmd)', htmlSetStreamfile.includes('MYMENUQQ.mnucmd'));

    console.log('  editing an option on a streamfile writes the sibling MYMENUQQ.mnucmd file');
    await messageHandlerStreamfile({ type: 'applyMenuCmdEdit', text: '0001 DSPLIBL\n' });
    check(
      'writes to the sibling file in the same IFS directory, lowercase .mnucmd extension',
      vscodeMock.__lastWrittenFile &&
        vscodeMock.__lastWrittenFile.uri.path === '/home/user/MYMENUQQ.mnucmd' &&
        vscodeMock.__lastWrittenFile.uri.scheme === 'streamfile' &&
        vscodeMock.__lastWrittenFile.text === '0001 DSPLIBL\n'
    );

    console.log('\nresolveCustomTextEditor() - IFS streamfile WITH an existing companion sibling file');
    vscodeMock.__setMockFile(new vscodeMock.Uri('streamfile', '/home/user/MYMENUQQ.mnucmd'), '0001 DSPLIBL\n0002 CHGCURLIB\n');
    let htmlSetStreamfileExisting = null;
    const fakeWebviewPanelStreamfileExisting = {
      webview: {
        cspSource: 'vscode-webview://fake',
        options: null,
        set html(v) { htmlSetStreamfileExisting = v; },
        get html() { return htmlSetStreamfileExisting; },
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(streamfileDoc, fakeWebviewPanelStreamfileExisting, {});
    check("reports 'loaded' when the streamfile sibling already exists", htmlSetStreamfileExisting.includes('"loaded"'));
    check('embeds the existing streamfile companion content', htmlSetStreamfileExisting.includes('DSPLIBL') && htmlSetStreamfileExisting.includes('CHGCURLIB'));

    console.log('\nresolveCustomTextEditor() - a scheme with no companion convention at all (e.g. untitled) still reports unsupported');
    let htmlSetUntitled = null;
    const untitledDoc = vscodeMock.__mockDocument(menuSource, new vscodeMock.Uri('untitled', 'Untitled-1'));
    const fakeWebviewPanelUntitled = {
      webview: {
        cspSource: 'vscode-webview://fake',
        options: null,
        set html(v) { htmlSetUntitled = v; },
        get html() { return htmlSetUntitled; },
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        postMessage: () => {},
      },
      onDidDispose: () => {},
    };
    await menuProviderEntry.provider.resolveCustomTextEditor(untitledDoc, fakeWebviewPanelUntitled, {});
    check("a scheme with no known companion convention (untitled) still reports 'unsupported'", htmlSetUntitled.includes('"unsupported"'));

    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  });
}

run();

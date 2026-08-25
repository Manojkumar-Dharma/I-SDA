/**
 * designerOpenColumn.test.js
 *
 * Coverage for the isda.designerOpenColumn setting (package.json), which
 * lets a person choose where openPreview/openMenuPreview place the designer
 * webview: full-width "active" (same tab group, no split - the default),
 * split "beside" the source, or automatically popped out into its own
 * "newWindow". Run with:
 * node src/test/designerOpenColumn.test.js
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
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  const openPreview = vscodeMock.__registeredCommands['dspfDesigner.openPreview'];

  const docUri = vscodeMock.Uri.file('/workspace/SCREEN1.dspf');
  vscodeMock.window.activeTextEditor = { document: { uri: docUri } };

  console.log('\ndefault (no setting configured) -> active, same column, no split');
  {
    vscodeMock.__clearMockConfig();
    vscodeMock.__executedCommands.length = 0;
    await openPreview();
    const openWithCall = vscodeMock.__executedCommands.find((c) => c.id === 'vscode.openWith');
    check('called vscode.openWith', !!openWithCall);
    check('with ViewColumn.Active', openWithCall && openWithCall.args[2] === vscodeMock.ViewColumn.Active);
    check('did NOT try to pop out a new window', !vscodeMock.__executedCommands.some((c) => c.id === 'workbench.action.moveEditorToNewWindow'));
  }

  console.log('\nisda.designerOpenColumn = "beside" -> split column next to the source');
  {
    vscodeMock.__setMockConfig('isda.designerOpenColumn', 'beside');
    vscodeMock.__executedCommands.length = 0;
    await openPreview();
    const openWithCall = vscodeMock.__executedCommands.find((c) => c.id === 'vscode.openWith');
    check('called vscode.openWith with ViewColumn.Beside', openWithCall && openWithCall.args[2] === vscodeMock.ViewColumn.Beside);
    check('did not pop out a new window', !vscodeMock.__executedCommands.some((c) => c.id === 'workbench.action.moveEditorToNewWindow'));
  }

  console.log('\nisda.designerOpenColumn = "newWindow" -> opens, then pops out automatically');
  {
    vscodeMock.__setMockConfig('isda.designerOpenColumn', 'newWindow');
    vscodeMock.__executedCommands.length = 0;
    await openPreview();
    const openWithIndex = vscodeMock.__executedCommands.findIndex((c) => c.id === 'vscode.openWith');
    const moveIndex = vscodeMock.__executedCommands.findIndex((c) => c.id === 'workbench.action.moveEditorToNewWindow');
    check('called vscode.openWith', openWithIndex >= 0);
    check('then called workbench.action.moveEditorToNewWindow', moveIndex >= 0);
    check('in that order (open first, then move out)', openWithIndex >= 0 && moveIndex > openWithIndex);
  }

  console.log('\nan unrecognized setting value falls back to "active" rather than erroring');
  {
    vscodeMock.__setMockConfig('isda.designerOpenColumn', 'bogus-value');
    vscodeMock.__executedCommands.length = 0;
    await openPreview();
    const openWithCall = vscodeMock.__executedCommands.find((c) => c.id === 'vscode.openWith');
    check('falls back to ViewColumn.Active', openWithCall && openWithCall.args[2] === vscodeMock.ViewColumn.Active);
  }

  vscodeMock.__clearMockConfig();

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run();

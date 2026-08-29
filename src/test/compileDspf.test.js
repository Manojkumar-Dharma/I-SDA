/**
 * compileDspf.test.js
 *
 * Covers dspfDesigner.compileDspf (Task L8): the guard conditions (not a
 * member, no Code for i), the happy path's single CRTDSPF command, and
 * surfacing a failure verbatim. Driven through the registered command the
 * same way a user (or the "Compile Display File (CRTDSPF)" button in the
 * webview) would invoke it - compileDspf() itself isn't exported, and
 * testing through the same surface VS Code actually calls is the point,
 * same reasoning compileMenu.test.js already uses for its own command.
 * Run with: node src/test/compileDspf.test.js
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

function freshContext() {
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  return vscodeMock.__registeredCommands['dspfDesigner.compileDspf'];
}

async function run() {
  console.log('guard: not a member-scheme document');
  {
    vscodeMock.__lastError = undefined;
    const compileDspf = freshContext();
    await compileDspf(vscodeMock.Uri.file('/workspace/MYSCREEN.dspf'));
    check('shows an error naming the requirement', /Code for i/.test(vscodeMock.__lastError || ''));
    check('runs no CL commands', vscodeMock.__executedCommands.filter((c) => c.id === 'code-for-ibmi.runCommand').length === 0);
  }

  console.log('\nguard: Code for i extension not installed');
  {
    vscodeMock.__removeMockExtension('halcyontechltd.code-for-ibmi');
    vscodeMock.__lastError = undefined;
    const compileDspf = freshContext();
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYSCREEN.DSPF');
    await compileDspf(uri);
    check('shows an error naming the extension', /halcyontechltd\.code-for-ibmi/.test(vscodeMock.__lastError || ''));
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
  }

  console.log('\nhappy path: a single CRTDSPF command, no record-name-matching requirement (unlike CRTMNU)');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYSCREEN.DSPF');
    const dspfSource =
      [
        "     A                                      DSPSIZ(24 80 *DS3)",
        "     A          R DIFFERENTNAME",
        "     A                                  1  2'HELLO'",
      ].join('\n') + '\n';
    const doc = vscodeMock.__mockDocument(dspfSource, uri, { isDirty: true });
    vscodeMock.__setOpenTextDocuments([doc]);

    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => { calls.push(args.command); return { code: 0, stdout: '', stderr: '' }; });
    vscodeMock.__lastInformation = undefined;
    vscodeMock.__lastError = undefined;

    const compileDspf = freshContext();
    await compileDspf(uri);

    check('saves the dirty document before compiling', doc.saveCount === 1);
    check('runs exactly 1 CL command (CRTDSPF only)', calls.length === 1);
    check('CRTDSPF references the right file/library/member/REPLACE(*YES)', calls[0] === 'CRTDSPF FILE(MYLIB/MYSCREEN) SRCFILE(MYLIB/QDDSSRC) SRCMBR(MYSCREEN) REPLACE(*YES)');
    check('no record-format-name-matching requirement (record name differs from member name, unlike CRTMNU TYPE(*DSPF))', !vscodeMock.__lastError);
    check('shows a success message mentioning the compiled object', /MYLIB\/MYSCREEN/.test(vscodeMock.__lastInformation || ''));

    vscodeMock.__setOpenTextDocuments([]);
  }

  console.log('\nCode for i installed but NOT YET ACTIVE this session (bug fix - previously failed with a confusing "command not found" error even though Code for i is installed and works fine once active)');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYSCREEN.DSPF');
    vscodeMock.__clearMockFiles();
    vscodeMock.__setMockFile(uri, "     A                                      DSPSIZ(24 80 *DS3)\n     A          R DIFFERENTNAME\n     A                                  1  2'HELLO'\n");

    let activateCalled = false;
    const extStub = {
      id: 'halcyontechltd.code-for-ibmi',
      isActive: false,
      activate: () => { activateCalled = true; extStub.isActive = true; return Promise.resolve(); },
    };
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', extStub);

    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => { calls.push(args.command); return { code: 0, stdout: '', stderr: '' }; });
    vscodeMock.__lastError = undefined;
    vscodeMock.__lastInformation = undefined;

    const compileDspf = freshContext();
    await compileDspf(uri);

    check('activate() was called before attempting the compile', activateCalled);
    check('CRTDSPF actually ran once activated (previously would have thrown "command not found")', calls.length === 1 && calls[0].startsWith('CRTDSPF'));
    check('shows a success message, no error', !vscodeMock.__lastError && /MYLIB\/MYSCREEN/.test(vscodeMock.__lastInformation || ''));

    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() });
  }

  console.log('\nfailure is surfaced verbatim, no success message shown');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYSCREEN.DSPF');
    vscodeMock.__clearMockFiles();
    vscodeMock.__setMockFile(uri, "     A                                      DSPSIZ(24 80 *DS3)\n     A          R MYSCREEN\n");

    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => {
      calls.push(args.command);
      return { code: -1, stdout: '', stderr: 'CPF5813: File already exists and REPLACE(*NO) implied.' };
    });
    vscodeMock.__lastError = undefined;
    vscodeMock.__lastInformation = undefined;

    const compileDspf = freshContext();
    await compileDspf(uri);

    check('runs exactly 1 CL command before stopping', calls.length === 1);
    check('surfaces the real IBM i error text verbatim', /CPF5813/.test(vscodeMock.__lastError || ''));
    check('shows no success message on failure', !vscodeMock.__lastInformation);

    vscodeMock.__setRunCommandHandler(null);
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run();

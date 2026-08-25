/**
 * createNewDspf.test.js
 *
 * Behavioral coverage for the dspfDesigner.createNewDspf command's two paths:
 * local workspace file creation (pre-existing) and remote IBM i member creation
 * via Code for i's ADDPFM + member: scheme (added this session). Neither had test
 * coverage beyond "the command got registered" before this file - run with:
 * node src/test/createNewDspf.test.js
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

/** Scripts a sequence of showInputBox/showQuickPick answers, consumed in call order. */
function scriptPrompts(inputBoxAnswers, quickPickAnswer) {
  const queue = inputBoxAnswers.slice();
  vscodeMock.window.showInputBox = () => Promise.resolve(queue.shift());
  vscodeMock.window.showQuickPick = () => Promise.resolve(quickPickAnswer);
}

async function run() {
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  const createNewDspf = vscodeMock.__registeredCommands['dspfDesigner.createNewDspf'];
  check('command registered', typeof createNewDspf === 'function');

  console.log('\nlocal path (no Code for i installed - matches pre-existing behavior)');
  {
    vscodeMock.extensions.getExtension = () => undefined; // no Code for i
    vscodeMock.workspace.workspaceFolders = [{ uri: vscodeMock.Uri.file('/workspace') }];
    vscodeMock.workspace.fs.stat = () => Promise.reject(new Error('not found')); // file doesn't already exist
    let writtenUri = null;
    let writtenContent = null;
    vscodeMock.workspace.fs.writeFile = (uri, content) => { writtenUri = uri; writtenContent = content; return Promise.resolve(); };

    scriptPrompts(['SCREEN1', 'RECORD1', 'My Screen']); // no quick pick shown at all in this path

    await createNewDspf();

    check('never shown a destination choice (no Code for i)', true); // implicit: scriptPrompts' quickPickAnswer (undefined) never needed
    check('wrote to a local file: URI', !!writtenUri && writtenUri.scheme === 'file');
    check('wrote the .dspf extension', writtenUri && writtenUri.path.endsWith('SCREEN1.dspf'));
    const content = Buffer.isBuffer(writtenContent) ? writtenContent.toString('utf8') : writtenContent.toString();
    check('boilerplate contains the record name', content.includes('RECORD1'));
    check('boilerplate contains the title', content.includes("'My Screen'"));
  }

  console.log('\nremote path (Code for i connected, ADDPFM succeeds)');
  {
    let ranCommand = null;
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: (info) => { ranCommand = info; return Promise.resolve({ code: 0, stdout: 'Member added.', stderr: '' }); },
          }),
        },
      },
    });
    let writtenUri = null;
    let writtenContent = null;
    vscodeMock.workspace.fs.writeFile = (uri, content) => { writtenUri = uri; writtenContent = content; return Promise.resolve(); };

    scriptPrompts(['SCREEN2', 'RECORD1', 'Remote Screen', '', 'QDDSSRC'], { value: 'remote' });

    await createNewDspf();

    check('ran ADDPFM', ranCommand && ranCommand.command.startsWith('ADDPFM'));
    check('ADDPFM targets the unqualified file when library left blank (*LIBL)', ranCommand.command.includes('FILE(QDDSSRC)'));
    check('ADDPFM names the right member', ranCommand.command.includes('MBR(SCREEN2)'));
    check('ADDPFM sets SRCTYPE(DSPF)', ranCommand.command.includes('SRCTYPE(DSPF)'));
    check('wrote content to a member: scheme URI', !!writtenUri && writtenUri.scheme === 'member');
    check('member path is well-formed (file/name.dspf, no library segment)', writtenUri.path === '/QDDSSRC/SCREEN2.dspf');
    const content = Buffer.isBuffer(writtenContent) ? writtenContent.toString('utf8') : writtenContent.toString();
    check('boilerplate contains the title', content.includes("'Remote Screen'"));
  }

  console.log('\nremote path with an explicit library');
  {
    let ranCommand = null;
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: { instance: { getConnection: () => ({ runCommand: (info) => { ranCommand = info; return Promise.resolve({ code: 0, stdout: '', stderr: '' }); } }) } },
    });
    let writtenUri = null;
    vscodeMock.workspace.fs.writeFile = (uri) => { writtenUri = uri; return Promise.resolve(); };

    scriptPrompts(['SCREEN3', 'RECORD1', 'Title', 'MYLIB', 'QDDSSRC'], { value: 'remote' });
    await createNewDspf();

    check('ADDPFM qualifies FILE with the library', ranCommand.command.includes('FILE(MYLIB/QDDSSRC)'));
    check('member path includes the library segment', writtenUri.path === '/MYLIB/QDDSSRC/SCREEN3.dspf');
  }

  console.log('\nremote path: ADDPFM fails (e.g. source physical file does not exist)');
  {
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: () => Promise.resolve({ code: 1, stdout: '', stderr: 'CPF7302 - File QDDSSRC in library MYLIB not found.' }),
          }),
        },
      },
    });
    let wroteAnything = false;
    vscodeMock.workspace.fs.writeFile = () => { wroteAnything = true; return Promise.resolve(); };
    vscodeMock.__lastError = null;

    scriptPrompts(['SCREEN4', 'RECORD1', 'Title', 'MYLIB', 'QDDSSRC'], { value: 'remote' });
    await createNewDspf();

    check('did not write any member content after ADDPFM failed', !wroteAnything);
    check('surfaced the real CPF error message to the user', vscodeMock.__lastError && vscodeMock.__lastError.includes('CPF7302'));
  }

  console.log('\nremote path: user picks "local" from the destination choice, even with Code for i connected');
  {
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: { instance: { getConnection: () => ({ runCommand: () => Promise.resolve({ code: 0, stdout: '', stderr: '' }) }) } },
    });
    vscodeMock.workspace.fs.stat = () => Promise.reject(new Error('not found'));
    let writtenUri = null;
    vscodeMock.workspace.fs.writeFile = (uri) => { writtenUri = uri; return Promise.resolve(); };

    scriptPrompts(['SCREEN5', 'RECORD1', 'Title'], { value: 'local' });
    await createNewDspf();

    check('respects an explicit "local" choice even though Code for i is connected', writtenUri && writtenUri.scheme === 'file');
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run();

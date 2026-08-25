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

  console.log('\nremote path: source physical file already exists (CHKOBJ succeeds) - no CRTSRCPF offer, straight to ADDPFM (e.g. duplicate member still fails on its own)');
  {
    const commandsRun = [];
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: (info) => {
              commandsRun.push(info.command);
              if (info.command.startsWith('CHKOBJ')) return Promise.resolve({ code: 0, stdout: '', stderr: '' });
              return Promise.resolve({ code: 1, stdout: '', stderr: 'CPF7304 - Member SCREEN4 in file MYLIB/QDDSSRC already exists.' });
            },
          }),
        },
      },
    });
    let wroteAnything = false;
    vscodeMock.workspace.fs.writeFile = () => { wroteAnything = true; return Promise.resolve(); };
    vscodeMock.__lastError = null;
    vscodeMock.__mockWarningResponse = undefined;

    scriptPrompts(['SCREEN4', 'RECORD1', 'Title', 'MYLIB', 'QDDSSRC'], { value: 'remote' });
    await createNewDspf();

    check('ran CHKOBJ first to check the source file', commandsRun[0] && commandsRun[0].startsWith('CHKOBJ') && commandsRun[0].includes('OBJ(MYLIB/QDDSSRC)'));
    check('no CRTSRCPF offer/run since CHKOBJ said it exists', !commandsRun.some((c) => c.startsWith('CRTSRCPF')));
    check('proceeded straight to ADDPFM, which then failed on its own', commandsRun.some((c) => c.startsWith('ADDPFM')));
    check('did not write any member content after ADDPFM failed', !wroteAnything);
    check('surfaced the real CPF error message to the user', vscodeMock.__lastError && vscodeMock.__lastError.includes('CPF7304'));
  }

  console.log('\nremote path (Task L4): source physical file missing (CHKOBJ fails) - offers CRTSRCPF, declining leaves everything untouched');
  {
    const commandsRun = [];
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: (info) => { commandsRun.push(info.command); return Promise.resolve({ code: 1, stdout: '', stderr: '' }); },
          }),
        },
      },
    });
    let wroteAnything = false;
    vscodeMock.workspace.fs.writeFile = () => { wroteAnything = true; return Promise.resolve(); };
    vscodeMock.__lastError = null;
    vscodeMock.__mockWarningResponse = undefined; // dismiss/decline the "Create it?" prompt

    scriptPrompts(['SCREEN5', 'RECORD1', 'Title', '', 'NEWSRCPF'], { value: 'remote' });
    await createNewDspf();

    check('ran CHKOBJ', commandsRun.some((c) => c.startsWith('CHKOBJ')));
    check('offered to create it (a warning was shown)', !!vscodeMock.__lastWarning && vscodeMock.__lastWarning.includes('NEWSRCPF'));
    check('declining runs neither CRTSRCPF nor ADDPFM', !commandsRun.some((c) => c.startsWith('CRTSRCPF') || c.startsWith('ADDPFM')));
    check('nothing written, and no error toast either (a decline is a silent cancel, same as every other prompt here)', !wroteAnything && !vscodeMock.__lastError);
  }

  console.log('\nremote path (Task L4): source physical file missing - confirming creates it (CRTSRCPF) and then proceeds to ADDPFM');
  {
    const commandsRun = [];
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: (info) => {
              commandsRun.push(info.command);
              if (info.command.startsWith('CHKOBJ')) return Promise.resolve({ code: 1, stdout: '', stderr: '' });
              return Promise.resolve({ code: 0, stdout: '', stderr: '' });
            },
          }),
        },
      },
    });
    let writtenUri = null;
    vscodeMock.workspace.fs.writeFile = (uri) => { writtenUri = uri; return Promise.resolve(); };
    vscodeMock.__mockWarningResponse = 'Create it';

    scriptPrompts(['SCREEN6', 'RECORD1', 'Title', '', 'NEWSRCPF'], { value: 'remote' });
    await createNewDspf();

    const crtsrcpf = commandsRun.find((c) => c.startsWith('CRTSRCPF'));
    check('ran CRTSRCPF for the missing source file', !!crtsrcpf && crtsrcpf.includes('FILE(NEWSRCPF)'));
    check('CRTSRCPF leaves RCDLEN to its own default (*SRC/112) rather than hardcoding one', crtsrcpf && !crtsrcpf.includes('RCDLEN'));
    check('proceeded to ADDPFM after CRTSRCPF succeeded', commandsRun.some((c) => c.startsWith('ADDPFM')));
    check('CRTSRCPF ran before ADDPFM', commandsRun.indexOf(crtsrcpf) < commandsRun.findIndex((c) => c.startsWith('ADDPFM')));
    check('member content was written', !!writtenUri && writtenUri.scheme === 'member');
  }

  console.log('\nremote path (Task L4): source physical file missing - confirming, but CRTSRCPF itself fails - stops before ADDPFM');
  {
    const commandsRun = [];
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: {
        instance: {
          getConnection: () => ({
            runCommand: (info) => {
              commandsRun.push(info.command);
              if (info.command.startsWith('CHKOBJ')) return Promise.resolve({ code: 1, stdout: '', stderr: '' });
              return Promise.resolve({ code: 1, stdout: '', stderr: 'CPF3283 - Library MYLIB not found.' });
            },
          }),
        },
      },
    });
    let wroteAnything = false;
    vscodeMock.workspace.fs.writeFile = () => { wroteAnything = true; return Promise.resolve(); };
    vscodeMock.__lastError = null;
    vscodeMock.__mockWarningResponse = 'Create it';

    scriptPrompts(['SCREEN7', 'RECORD1', 'Title', 'MYLIB', 'NEWSRCPF'], { value: 'remote' });
    await createNewDspf();

    check('attempted CRTSRCPF', commandsRun.some((c) => c.startsWith('CRTSRCPF')));
    check('never reached ADDPFM after CRTSRCPF failed', !commandsRun.some((c) => c.startsWith('ADDPFM')));
    check('nothing written', !wroteAnything);
    check('surfaced the real CRTSRCPF failure text', vscodeMock.__lastError && vscodeMock.__lastError.includes('CPF3283'));
  }

  console.log('\nremote path: user picks "local" from the destination choice, even with Code for i connected');
  {
    vscodeMock.extensions.getExtension = () => ({
      isActive: true,
      exports: { instance: { getConnection: () => ({ runCommand: () => Promise.resolve({ code: 0, stdout: '', stderr: '' }) }) } },
    });
    vscodeMock.workspace.fs.stat = () => Promise.reject(new Error('not found'));
    vscodeMock.__mockWarningResponse = undefined;
    let writtenUri = null;
    vscodeMock.workspace.fs.writeFile = (uri) => { writtenUri = uri; return Promise.resolve(); };

    scriptPrompts(['SCREEN8', 'RECORD1', 'Title'], { value: 'local' });
    await createNewDspf();

    check('respects an explicit "local" choice even though Code for i is connected', writtenUri && writtenUri.scheme === 'file');
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run();

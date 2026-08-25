/**
 * compileMenu.test.js
 *
 * Covers dspfDesigner.compileMenu: the guard conditions (not a member, no
 * Code for i, record/member name mismatch), the happy path's exact CL
 * command sequence, the no-mappings warning prompt, and stopping at the
 * first failing step. Driven through the registered command the same way a
 * user (or the "Compile Menu" button in the webview) would invoke it -
 * compileMenu() itself isn't exported, and testing through the same surface
 * VS Code actually calls is the point. Run with: node src/test/compileMenu.test.js
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

const menuSource =
  [
    "     A                                      DSPSIZ(24 80 *DS3)",
    "     A          R MYMENU",
    "     A                                  1  2'MAIN MENU'",
    "     A                                  3  5'1. Display library list'",
    "     A                                  4  5'2. Change current library'",
  ].join('\n') + '\n';

function freshContext() {
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  return vscodeMock.__registeredCommands['dspfDesigner.compileMenu'];
}

async function run() {
  console.log('guard: not a member-scheme document');
  {
    vscodeMock.__lastError = undefined;
    const compileMenu = freshContext();
    await compileMenu(vscodeMock.Uri.file('/workspace/MYMENU.mnudds'));
    check('shows an error naming the requirement', /Code for i/.test(vscodeMock.__lastError || ''));
    check('runs no CL commands', vscodeMock.__executedCommands.filter((c) => c.id === 'code-for-ibmi.runCommand').length === 0);
  }

  console.log('\nguard: Code for i extension not installed');
  {
    vscodeMock.__removeMockExtension('halcyontechltd.code-for-ibmi');
    vscodeMock.__lastError = undefined;
    const compileMenu = freshContext();
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    await compileMenu(uri);
    check('shows an error naming the extension', /halcyontechltd\.code-for-ibmi/.test(vscodeMock.__lastError || ''));
    vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', { id: 'halcyontechltd.code-for-ibmi' });
  }

  console.log('\nguard: record format name must match the member name (CRTMNU TYPE(*DSPF) requirement)');
  {
    vscodeMock.__lastError = undefined;
    vscodeMock.__setOpenTextDocuments([]);
    const compileMenu = freshContext();
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/WRONGNAME.MNUDDS');
    vscodeMock.__setMockFile(uri, menuSource); // fallback read path when the doc isn't open
    await compileMenu(uri);
    check('shows an actionable error naming the record it found', /WRONGNAME/.test(vscodeMock.__lastError || '') && /MYMENU/.test(vscodeMock.__lastError || ''));
    check('runs no CL commands', vscodeMock.__executedCommands.filter((c) => c.id === 'code-for-ibmi.runCommand').length === 0);
  }

  console.log('\nhappy path: CRTDSPF -> CRTMSGF -> ADDMSGD... -> CRTMNU sequence (no destructive rebuild)');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    const doc = vscodeMock.__mockDocument(menuSource, uri, { isDirty: true });
    const commandUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD');
    const commandDoc = vscodeMock.__mockDocument('0001 DSPLIBL\n0002 CHGCURLIB\n', commandUri, { isDirty: true });
    vscodeMock.__setOpenTextDocuments([doc, commandDoc]);

    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => { calls.push(args.command); return { code: 0, stdout: '', stderr: '' }; });
    vscodeMock.__lastInformation = undefined;

    const compileMenu = freshContext();
    await compileMenu(uri);

    check('saves the dirty MNUDDS document before compiling', doc.saveCount === 1);
    check('saves the dirty companion MNUCMD document before compiling', commandDoc.saveCount === 1);
    check('runs exactly 5 CL commands (CRTDSPF, CRTMSGF, 2x ADDMSGD, CRTMNU) - no DLTMSGF', calls.length === 5);
    check('CRTDSPF references the right file/library/member', /^CRTDSPF FILE\(MYLIB\/MYMENU\) SRCFILE\(MYLIB\/QDDSSRC\) SRCMBR\(MYMENU\)/.test(calls[0]));
    check('never deletes the message file', !calls.some((c) => c.startsWith('DLTMSGF')));
    check('creates the message file (tolerates it already existing)', calls[1].startsWith('CRTMSGF MSGF(MYLIB/MYMENU)'));
    check('adds one ADDMSGD per option using the USRnnnn message ID format', calls[2].includes('MSGID(USR0001)') && calls[2].includes("MSG('DSPLIBL')") && calls[3].includes('MSGID(USR0002)') && calls[3].includes("MSG('CHGCURLIB')"));
    check('CRTMNU ties the DSPF and MSGF together as TYPE(*DSPF)', calls[4].includes('CRTMNU MENU(MYLIB/MYMENU)') && calls[4].includes('TYPE(*DSPF)') && calls[4].includes('DSPF(MYLIB/MYMENU)') && calls[4].includes('MSGF(MYLIB/MYMENU)'));
    check('shows a success message mentioning the compiled object', /MYLIB\/MYMENU/.test(vscodeMock.__lastInformation || ''));

    vscodeMock.__setOpenTextDocuments([]);
  }

  console.log('\nCRTMSGF already existing is tolerated, not treated as a failure');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    vscodeMock.__clearMockFiles();
    vscodeMock.__setMockFile(uri, menuSource);
    const commandUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD');
    vscodeMock.__setMockFile(commandUri, '0001 DSPLIBL\n0002 CHGCURLIB\n');

    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => {
      calls.push(args.command);
      if (args.command.startsWith('CRTMSGF')) return { code: -1, stdout: '', stderr: 'CPF2issue: Message file already exists in library MYLIB.' };
      return { code: 0, stdout: '', stderr: '' };
    });
    vscodeMock.__lastError = undefined;

    const compileMenu = freshContext();
    await compileMenu(uri);
    check('proceeds past the "already exists" CRTMSGF failure to ADDMSGD/CRTMNU', calls.some((c) => c.startsWith('ADDMSGD')) && calls.some((c) => c.startsWith('CRTMNU')));
    check('does not show an error for the tolerated already-exists case', !vscodeMock.__lastError);
  }

  console.log('\nADDMSGD failing (message ID already there from a previous compile) falls back to CHGMSGD');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    vscodeMock.__clearMockFiles();
    vscodeMock.__setMockFile(uri, menuSource);
    const commandUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD');
    vscodeMock.__setMockFile(commandUri, '0001 DSPLIBL\n0002 CHGCURLIB\n');

    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => {
      calls.push(args.command);
      if (args.command.startsWith('ADDMSGD') && args.command.includes('USR0001')) return { code: -1, stdout: '', stderr: 'CPF2431: Message description already exists.' };
      return { code: 0, stdout: '', stderr: '' };
    });
    vscodeMock.__lastInformation = undefined;

    const compileMenu = freshContext();
    await compileMenu(uri);
    check('retries the failed option with CHGMSGD instead of failing the whole compile', calls.some((c) => c.startsWith('CHGMSGD') && c.includes('USR0001')));
    check('option 2 still just uses ADDMSGD (it succeeded first try)', calls.some((c) => c.startsWith('ADDMSGD') && c.includes('USR0002')) && !calls.some((c) => c.startsWith('CHGMSGD') && c.includes('USR0002')));
    check('compile still completes successfully overall', /MYLIB\/MYMENU/.test(vscodeMock.__lastInformation || ''));
  }

  console.log('\nno option-to-command mappings yet -> warns and requires confirmation');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    vscodeMock.__clearMockFiles();
    vscodeMock.__setMockFile(uri, menuSource);
    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => { calls.push(args.command); return { code: 0, stdout: '', stderr: '' }; });

    console.log('  declining the prompt stops the compile');
    vscodeMock.__setWarningResponse('Cancel');
    let compileMenu = freshContext();
    await compileMenu(uri);
    check('runs no CL commands when the user cancels', calls.length === 0);

    console.log('  accepting the prompt proceeds (with zero ADDMSGD calls)');
    vscodeMock.__setWarningResponse('Compile Anyway');
    compileMenu = freshContext();
    await compileMenu(uri);
    check('proceeds with CRTDSPF/CRTMSGF/CRTMNU but no ADDMSGD', calls.length === 3 && !calls.some((c) => c.startsWith('ADDMSGD')));
    vscodeMock.__setWarningResponse(undefined);
  }

  console.log('\nstops at the first failing step');
  {
    const uri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    vscodeMock.__clearMockFiles();
    vscodeMock.__setMockFile(uri, menuSource);
    const commandUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD');
    vscodeMock.__setMockFile(commandUri, '0001 DSPLIBL\n');

    const calls = [];
    vscodeMock.__setRunCommandHandler((args) => {
      calls.push(args.command);
      if (args.command.startsWith('CRTDSPF')) return { code: -1, stdout: '', stderr: 'CPF5813: File already exists and REPLACE(*NO) implied.' };
      return { code: 0, stdout: '', stderr: '' };
    });
    vscodeMock.__lastError = undefined;

    const compileMenu = freshContext();
    await compileMenu(uri);

    check('stops after the failing CRTDSPF - no further steps run', calls.length === 1);
    check('surfaces the real IBM i error text verbatim', /CPF5813/.test(vscodeMock.__lastError || ''));

    vscodeMock.__setRunCommandHandler(null);
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run();

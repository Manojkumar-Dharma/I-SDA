// Minimal mock of the 'vscode' module - just enough surface area to actually
// RUN activate() and resolveCustomTextEditor() outside a real VS Code host,
// so we can catch wrong-API-assumption bugs before shipping, not just syntax errors.
const registeredCommands = {};
const registeredCodeLensProviders = [];
let registeredCustomEditorProvider = null;

class Range {
  constructor(startLine, startChar, endLine, endChar) {
    this.start = { line: startLine, character: startChar };
    this.end = { line: endLine, character: endChar };
  }
}

class WorkspaceEdit {
  constructor() { this.edits = []; }
  replace(uri, range, newText) { this.edits.push({ uri, range, newText }); }
}

class CodeLens {
  constructor(range, command) { this.range = range; this.command = command; }
}

class Uri {
  static file(p) { return new Uri('file', p); }
  static joinPath(base, ...segments) { return new Uri(base.scheme, base.path + '/' + segments.join('/')); }
  constructor(scheme, path) { this.scheme = scheme; this.path = path; }
  toString() { return this.scheme + '://' + this.path; }
}

let lastAppliedEdit = null;

const vscodeMock = {
  Range,
  WorkspaceEdit,
  CodeLens,
  Uri,
  ViewColumn: { Beside: -2, One: 1 },
  FileType: { Directory: 2, File: 1 },
  window: {
    activeTextEditor: null,
    showWarningMessage: (msg) => { vscodeMock.__lastWarning = msg; return Promise.resolve(undefined); },
    showErrorMessage: (msg) => { vscodeMock.__lastError = msg; return Promise.resolve(undefined); },
    showInputBox: () => Promise.resolve(undefined),
    showWorkspaceFolderPick: () => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
    registerCustomEditorProvider: (viewType, provider, options) => {
      registeredCustomEditorProvider = { viewType, provider, options };
      return { dispose: () => {} };
    },
  },
  commands: {
    registerCommand: (id, handler) => {
      registeredCommands[id] = handler;
      return { dispose: () => {} };
    },
    executeCommand: (id, ...args) => {
      vscodeMock.__lastExecutedCommand = { id, args };
      return Promise.resolve();
    },
  },
  languages: {
    registerCodeLensProvider: (selector, provider) => {
      registeredCodeLensProviders.push({ selector, provider });
      return { dispose: () => {} };
    },
  },
  workspace: {
    workspaceFolders: [{ uri: new Uri('file', '/workspace') }],
    fs: {
      stat: () => Promise.reject(new Error('not found')),
      writeFile: () => Promise.resolve(),
    },
    openTextDocument: () => Promise.resolve(mockDocument('')),
    applyEdit: (edit) => { lastAppliedEdit = edit; return Promise.resolve(true); },
    onDidChangeTextDocument: (handler) => { vscodeMock.__changeListener = handler; return { dispose: () => {} }; },
  },
  __registeredCommands: registeredCommands,
  __registeredCodeLensProviders: registeredCodeLensProviders,
  get __registeredCustomEditorProvider() { return registeredCustomEditorProvider; },
  get __lastAppliedEdit() { return lastAppliedEdit; },
};

function mockDocument(text) {
  return {
    uri: new Uri('file', '/workspace/TEST.dspf'),
    fileName: '/workspace/TEST.dspf',
    getText: () => text,
    positionAt: (offset) => ({ line: 0, character: offset }),
    lineAt: (n) => ({ text: '' }),
  };
}

module.exports = vscodeMock;
module.exports.__mockDocument = mockDocument;

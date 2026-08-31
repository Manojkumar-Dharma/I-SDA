// Minimal mock of the 'vscode' module - just enough surface area to actually
// RUN activate() and resolveCustomTextEditor() outside a real VS Code host,
// so we can catch wrong-API-assumption bugs before shipping, not just syntax errors.
const registeredCommands = {};
const registeredCodeLensProviders = [];
const registeredCustomEditorProviders = {}; // keyed by viewType, since the extension now registers more than one

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
  static from(components) { return new Uri(components.scheme, components.path, components.query); }
  constructor(scheme, path, query) { this.scheme = scheme; this.path = path; this.query = query || ''; }
  with(changes) {
    return new Uri(
      changes && changes.scheme !== undefined ? changes.scheme : this.scheme,
      changes && changes.path !== undefined ? changes.path : this.path,
      changes && changes.query !== undefined ? changes.query : this.query
    );
  }
  toString() { return this.scheme + '://' + this.path; }
}

let lastAppliedEdit = null;
let lastWrittenFile = null;
const mockFiles = {}; // uri.toString() -> text content, for workspace.fs.readFile in tests
const mockConfig = {}; // 'section.key' -> value, for workspace.getConfiguration(...).get(...) in tests
const changeListeners = []; // every registered workspace.onDidChangeTextDocument handler
const openTextDocuments = []; // simulates vscode.workspace.textDocuments
const executedCommands = []; // every vscode.commands.executeCommand call, for assertions
let runCommandHandler = null; // test-supplied handler for 'code-for-ibmi.runCommand'
// Simulates the Code for i extension being installed by default (the common
// case) - tests that need "not installed" delete this entry first.
const mockExtensions = { 'halcyontechltd.code-for-ibmi': { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() } };

const vscodeMock = {
  Range,
  WorkspaceEdit,
  CodeLens,
  Uri,
  ViewColumn: { Active: -1, Beside: -2, One: 1 },
  extensions: {
    // Simulates "Code for i not installed" by default; tests can override this
    // (vscodeMock.extensions.getExtension = () => ({...})) to simulate a connection.
    getExtension: () => undefined,
  },
  FileType: { Directory: 2, File: 1 },
  window: {
    activeTextEditor: null,
    showWarningMessage: (msg, ...buttons) => {
      vscodeMock.__lastWarning = msg;
      const resp = vscodeMock.__mockWarningResponse;
      return Promise.resolve(typeof resp === 'function' ? resp(msg, buttons) : resp);
    },
    showErrorMessage: (msg) => { vscodeMock.__lastError = msg; return Promise.resolve(undefined); },
    showInformationMessage: (msg) => { vscodeMock.__lastInformation = msg; return Promise.resolve(undefined); },
    showInputBox: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    showWorkspaceFolderPick: () => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
    withProgress: (options, task) => task({ report: () => {} }, { isCancellationRequested: false }),
    registerCustomEditorProvider: (viewType, provider, options) => {
      registeredCustomEditorProviders[viewType] = { viewType, provider, options };
      return { dispose: () => {} };
    },
  },
  ProgressLocation: { Notification: 15 },
  extensions: {
    getExtension: (id) => (Object.prototype.hasOwnProperty.call(mockExtensions, id) ? mockExtensions[id] : undefined),
    // Task L18 - the connection-status badge subscribes to this to catch
    // Code for i being installed/uninstalled while a designer panel is
    // already open; no test currently needs to actually FIRE it, so a
    // no-op listener (still returning a disposable, same shape every other
    // mock event registration here uses) is enough to keep
    // resolveCustomTextEditor() from throwing.
    onDidChange: () => ({ dispose: () => {} }),
  },
  commands: {
    registerCommand: (id, handler) => {
      registeredCommands[id] = handler;
      return { dispose: () => {} };
    },
    // Simulates 'code-for-ibmi.runCommand' (and any other command an
    // extension might executeCommand out to) via a test-supplied handler -
    // see __setRunCommandHandler. Realistically rejects (matching VS Code's
    // own "command not found" behavior) when the mock Code for i extension
    // isn't active - code-for-ibmi.runCommand is registered at activation
    // time, not declared in contributes.commands, so VS Code's own
    // auto-activate-on-command mechanism does NOT apply to it; calling it
    // before Code for i has activated genuinely throws in the real world.
    // Everything else no-ops successfully, same as before this was
    // extended for the compile-menu feature.
    executeCommand: (id, ...args) => {
      const call = { id, args };
      executedCommands.push(call);
      vscodeMock.__lastExecutedCommand = call;
      if (id === 'code-for-ibmi.runCommand') {
        const ext = mockExtensions['halcyontechltd.code-for-ibmi'];
        if (!ext || !ext.isActive) {
          return Promise.reject(new Error("command 'code-for-ibmi.runCommand' not found"));
        }
        if (runCommandHandler) {
          const result = runCommandHandler(args[0]);
          return result && typeof result.then === 'function' ? result : Promise.resolve(result);
        }
      }
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
    getConfiguration: (section) => ({
      get: (key, defaultValue) => {
        const full = section ? `${section}.${key}` : key;
        return Object.prototype.hasOwnProperty.call(mockConfig, full) ? mockConfig[full] : defaultValue;
      },
    }),
    fs: {
      stat: () => Promise.reject(new Error('not found')),
      writeFile: (uri, bytes) => {
        lastWrittenFile = { uri, text: Buffer.isBuffer(bytes) ? bytes.toString('utf8') : Buffer.from(bytes).toString('utf8') };
        mockFiles[uri.toString()] = lastWrittenFile.text;
        return Promise.resolve();
      },
      readFile: (uri) => {
        const key = uri.toString();
        if (Object.prototype.hasOwnProperty.call(mockFiles, key)) {
          return Promise.resolve(Buffer.from(mockFiles[key], 'utf8'));
        }
        return Promise.reject(new Error('ENOENT: no such file, ' + key));
      },
    },
    openTextDocument: () => Promise.resolve(mockDocument('')),
    applyEdit: (edit) => { lastAppliedEdit = edit; return Promise.resolve(true); },
    onDidChangeTextDocument: (handler) => {
      changeListeners.push(handler);
      return { dispose: () => { const i = changeListeners.indexOf(handler); if (i >= 0) changeListeners.splice(i, 1); } };
    },
    get textDocuments() { return openTextDocuments; },
  },
  __registeredCommands: registeredCommands,
  __registeredCodeLensProviders: registeredCodeLensProviders,
  __registeredCustomEditorProviders: registeredCustomEditorProviders,
  // Back-compat for the original (pre-menu-editor) test suite, which only ever
  // dealt with one registered custom editor provider.
  get __registeredCustomEditorProvider() { return registeredCustomEditorProviders['dspfDesigner.editor']; },
  get __lastAppliedEdit() { return lastAppliedEdit; },
  get __lastWrittenFile() { return lastWrittenFile; },
  __setMockFile: (uri, text) => { mockFiles[uri.toString()] = text; },
  __clearMockFiles: () => { Object.keys(mockFiles).forEach((k) => delete mockFiles[k]); },
  __setMockConfig: (fullKey, value) => { mockConfig[fullKey] = value; },
  __clearMockConfig: () => { Object.keys(mockConfig).forEach((k) => delete mockConfig[k]); },
  __setOpenTextDocuments: (docs) => { openTextDocuments.length = 0; openTextDocuments.push(...docs); },
  get __executedCommands() { return executedCommands; },
  __setRunCommandHandler: (fn) => { runCommandHandler = fn; },
  __setMockExtension: (id, ext) => { mockExtensions[id] = ext; },
  __removeMockExtension: (id) => { delete mockExtensions[id]; },
  __setWarningResponse: (respOrFn) => { vscodeMock.__mockWarningResponse = respOrFn; },
  get __lastInformationMessage() { return vscodeMock.__lastInformation; },
  // Fires every currently-registered onDidChangeTextDocument listener with the
  // given event, same as VS Code notifying every subscriber - NOT just the
  // most recently registered one (earlier versions of this mock only tracked
  // a single listener, which silently broke once the extension started
  // registering more than one at a time).
  get __changeListener() { return (event) => { changeListeners.slice().forEach((h) => h(event)); }; },
};

function mockDocument(text, uri, options) {
  const docUri = uri || new Uri('file', '/workspace/TEST.dspf');
  const opts = options || {};
  let saveCount = 0;
  return {
    uri: docUri,
    fileName: docUri.path,
    getText: () => text,
    positionAt: (offset) => ({ line: 0, character: offset }),
    lineAt: (n) => ({ text: '' }),
    isDirty: !!opts.isDirty,
    save: () => { saveCount++; return Promise.resolve(true); },
    get saveCount() { return saveCount; },
  };
}

module.exports = vscodeMock;
module.exports.__mockDocument = mockDocument;
// In-memory globalState mock, matching the subset of vscode.ExtensionContext
// the extension actually uses (getUiStyle()/setUiStyle handling in
// extension.ts). Each call returns a fresh store so tests stay isolated from
// one another, mirroring a real ExtensionContext's per-activation state.
module.exports.__mockExtensionContext = function () {
  const store = new Map();
  return {
    subscriptions: [],
    globalState: {
      get: (key, defaultValue) => (store.has(key) ? store.get(key) : defaultValue),
      update: (key, value) => { store.set(key, value); return Promise.resolve(); },
    },
  };
};

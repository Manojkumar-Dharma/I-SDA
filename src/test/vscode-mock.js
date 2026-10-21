// Minimal mock of the 'vscode' module - just enough surface area to actually
// RUN activate() and resolveCustomTextEditor() outside a real VS Code host,
// so we can catch wrong-API-assumption bugs before shipping, not just syntax errors.
const registeredCommands = {};
const registeredCodeLensProviders = [];
const registeredHoverProviders = [];
const registeredCompletionProviders = [];
const registeredCodeActionProviders = [];
const selectionListeners = [];
const activeEditorListeners = [];
const decorationTypes = [];
const registeredSymbolProviders = [];
const registeredDefinitionProviders = [];
const registeredCustomEditorProviders = {}; // keyed by viewType, since the extension now registers more than one

class Diagnostic {
  constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; }
}

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

class CodeAction {
  constructor(title, kind) { this.title = title; this.kind = kind; }
}
const CodeActionKind = { QuickFix: 'quickfix' };

class MarkdownString {
  constructor(value) { this.value = value; }
}

class Hover {
  constructor(contents, range) { this.contents = contents; this.range = range; }
}

class DocumentSymbol {
  constructor(name, detail, kind, range, selectionRange) {
    this.name = name; this.detail = detail; this.kind = kind; this.range = range; this.selectionRange = selectionRange; this.children = [];
  }
}

class CompletionItem {
  constructor(label, kind) { this.label = label; this.kind = kind; }
}

class CompletionList {
  constructor(items, isIncomplete) { this.items = items; this.isIncomplete = !!isIncomplete; }
}

class SnippetString {
  constructor(value) { this.value = value; }
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
  // E5e: the host reads fsPath to offer the member's own folder in the save dialog (the same as path on Linux and macOS).
  get fsPath() { return this.path; }
  toString() { return this.scheme + '://' + this.path; }
}

let lastAppliedEdit = null;
let lastWrittenFile = null;
const mockDirs = new Set(); // uri.toString() of every directory made by workspace.fs.createDirectory (E5f)
const mockFiles = {}; // uri.toString() -> text content, for workspace.fs.readFile in tests
const mockConfig = {}; // 'section.key' -> value, for workspace.getConfiguration(...).get(...) in tests
const changeListeners = []; // every registered workspace.onDidChangeTextDocument handler
const saveListeners = []; // every registered workspace.onDidSaveTextDocument handler
const configChangeListeners = []; // every registered workspace.onDidChangeConfiguration handler
const openTextDocuments = []; // simulates vscode.workspace.textDocuments
const diagnosticCollections = []; // every languages.createDiagnosticCollection(...) result (E1b)
const outputChannels = []; // every window.createOutputChannel(...) result (E2g)
let languageMatch = () => 0; // languages.match(selector, document); 0 = no match, as for a document the selector does not cover
const executedCommands = []; // every vscode.commands.executeCommand call, for assertions
let runCommandHandler = null; // test-supplied handler for 'code-for-ibmi.runCommand'
// Bug fix follow-up: the extension no longer calls
// vscode.commands.executeCommand('code-for-ibmi.runCommand', ...) - it calls
// .runCommand() directly on the connection object from
// ext.exports.instance.getConnection() instead (see extension.ts's own
// comments on fetchReferencedFieldAttributes/fetchDatabaseFileFields/
// compileMenu/compileDspf for why). This mock connection routes through the
// SAME runCommandHandler tests already use via __setRunCommandHandler, so
// every existing test that only ever set up isActive/activate (no explicit
// exports.instance.getConnection of its own) keeps working unchanged -
// getExtension() below only attaches this default connection when a test
// hasn't already supplied its own exports.
function makeDefaultConnection() {
  return {
    runCommand: (args) => {
      const result = runCommandHandler ? runCommandHandler(args) : { code: 0, stdout: '', stderr: '' };
      return result && typeof result.then === 'function' ? result : Promise.resolve(result);
    },
  };
}
// Simulates the Code for i extension being installed by default (the common
// case) - tests that need "not installed" delete this entry first.
const mockExtensions = { 'halcyontechltd.code-for-ibmi': { id: 'halcyontechltd.code-for-ibmi', isActive: true, activate: () => Promise.resolve() } };

const vscodeMock = {
  Range,
  Diagnostic,
  MarkdownString,
  Hover,
  DocumentSymbol,
  SymbolKind: { Struct: 22, Field: 7, String: 14, Interface: 10 },
  CompletionItem,
  CompletionList,
  SnippetString,
  CompletionItemKind: { Keyword: 13 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  WorkspaceEdit,
  CodeAction,
  CodeActionKind,
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
    visibleTextEditors: [],
    createTextEditorDecorationType: (options) => {
      const type = { options, disposed: false, dispose() { this.disposed = true; } };
      decorationTypes.push(type);
      return type;
    },
    onDidChangeTextEditorSelection: (handler) => {
      selectionListeners.push(handler);
      return { dispose: () => { const i = selectionListeners.indexOf(handler); if (i >= 0) selectionListeners.splice(i, 1); } };
    },
    onDidChangeActiveTextEditor: (handler) => {
      activeEditorListeners.push(handler);
      return { dispose: () => { const i = activeEditorListeners.indexOf(handler); if (i >= 0) activeEditorListeners.splice(i, 1); } };
    },
    showWarningMessage: (msg, ...buttons) => {
      vscodeMock.__lastWarning = msg;
      const resp = vscodeMock.__mockWarningResponse;
      return Promise.resolve(typeof resp === 'function' ? resp(msg, buttons) : resp);
    },
    showErrorMessage: (msg, ...buttons) => { vscodeMock.__lastError = msg; vscodeMock.__lastErrorButtons = buttons; return Promise.resolve(undefined); },
    // E2g: an Output channel that keeps what was written to it, so a test can read the "iSDA Compile" channel.
    createOutputChannel: (name) => {
      const channel = {
        name,
        lines: [],
        shown: 0,
        appendLine: (line) => { channel.lines.push(String(line)); },
        append: (text) => { channel.lines.push(String(text)); },
        clear: () => { channel.lines.length = 0; },
        show: () => { channel.shown++; },
        hide: () => {},
        dispose: () => { channel.disposed = true; },
      };
      outputChannels.push(channel);
      return channel;
    },
    showInformationMessage: (msg) => { vscodeMock.__lastInformation = msg; return Promise.resolve(undefined); },
    // E5e: the save dialog of the screen preview export; a test sets __setSaveDialogResponse (a Uri, undefined = cancelled, or a function of the options).
    // E5f: the folder picker of the batch export; a test sets __setOpenDialogResponse (an array of Uris, undefined = cancelled).
    showOpenDialog: (options) => {
      vscodeMock.__lastOpenDialog = options;
      const resp = vscodeMock.__openDialogResponse;
      return Promise.resolve(typeof resp === 'function' ? resp(options) : resp);
    },
    showSaveDialog: (options) => {
      vscodeMock.__lastSaveDialog = options;
      const resp = vscodeMock.__saveDialogResponse;
      return Promise.resolve(typeof resp === 'function' ? resp(options) : resp);
    },
    showInputBox: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    showWorkspaceFolderPick: () => Promise.resolve(undefined),
    showTextDocument: (docOrUri, options) => { vscodeMock.__lastShowTextDocument = docOrUri; vscodeMock.__lastShowTextDocumentOptions = options; return Promise.resolve(undefined); },
    withProgress: (options, task) => task({ report: () => {} }, { isCancellationRequested: false }),
    registerCustomEditorProvider: (viewType, provider, options) => {
      registeredCustomEditorProviders[viewType] = { viewType, provider, options };
      return { dispose: () => {} };
    },
  },
  ProgressLocation: { Notification: 15 },
  // E5e: only the clipboard, as text (what Copy writes for SVG, HTML and Text).
  env: {
    clipboard: {
      writeText: (text) => { vscodeMock.__clipboardText = text; return Promise.resolve(); },
    },
  },
  extensions: {
    getExtension: (id) => {
      if (!Object.prototype.hasOwnProperty.call(mockExtensions, id)) return undefined;
      const ext = mockExtensions[id];
      // Only synthesize a default connection for the well-known Code for i
      // id, and only when the test hasn't already supplied its own `exports`
      // (tests exercising the L14 database-fields/resolve-referenced-field
      // flows, or connection-specific scenarios, set exports.instance
      // themselves and that must win untouched). Mutates the SAME object
      // (rather than returning a spread copy) so it still works for tests
      // whose extStub.activate() flips isActive to true asynchronously
      // AFTER this first getExtension() call already happened - extension.ts
      // holds onto that one `ext` reference throughout, exactly like real
      // VS Code's Extension objects are live/stable, not point-in-time
      // snapshots.
      if (id === 'halcyontechltd.code-for-ibmi' && ext && !ext.exports) {
        ext.exports = { instance: { getConnection: () => makeDefaultConnection() } };
      }
      return ext;
    },
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
    createDiagnosticCollection: (name) => {
      const entries = new Map();
      const collection = {
        name,
        set: (uri, list) => { entries.set(uri.toString(), list); },
        delete: (uri) => { entries.delete(uri.toString()); },
        get: (uri) => entries.get(uri.toString()),
        dispose: () => { entries.clear(); },
      };
      diagnosticCollections.push(collection);
      return collection;
    },
    match: (selector, document) => languageMatch(selector, document),
    registerCodeLensProvider: (selector, provider) => {
      registeredCodeLensProviders.push({ selector, provider });
      return { dispose: () => {} };
    },
    registerDocumentSymbolProvider: (selector, provider, metadata) => {
      registeredSymbolProviders.push({ selector, provider, metadata });
      return { dispose: () => {} };
    },
    registerDefinitionProvider: (selector, provider) => {
      registeredDefinitionProviders.push({ selector, provider });
      return { dispose: () => {} };
    },
    registerCodeActionsProvider: (selector, provider, metadata) => {
      registeredCodeActionProviders.push({ selector, provider, metadata });
      return { dispose: () => {} };
    },
    registerCompletionItemProvider: (selector, provider) => {
      registeredCompletionProviders.push({ selector, provider });
      return { dispose: () => {} };
    },
    registerHoverProvider: (selector, provider) => {
      registeredHoverProviders.push({ selector, provider });
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
      // E5f: a directory made by createDirectory exists afterwards; anything else is not found, as before.
      stat: (uri) => (mockDirs.has(uri.toString()) ? Promise.resolve({ type: 2 }) : Promise.reject(new Error('not found'))),
      createDirectory: (uri) => { mockDirs.add(uri.toString()); return Promise.resolve(); },
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
    // Suggestion C - fires when a mockDocument's own save() runs (see
    // mockDocument below - it's the one that actually pushes into this
    // array), matching real VS Code's own onDidSaveTextDocument, which
    // fires after a document's isDirty flips back to false.
    onDidSaveTextDocument: (handler) => {
      saveListeners.push(handler);
      return { dispose: () => { const i = saveListeners.indexOf(handler); if (i >= 0) saveListeners.splice(i, 1); } };
    },
    // Task L38 - minimal support for the real vscode.workspace.onDidChangeConfiguration
    // API: registered handlers are called with a ConfigurationChangeEvent-shaped
    // object whose affectsConfiguration(key) does a simple prefix/exact match
    // against whatever key __fireConfigChange was told changed - enough for
    // resolveCustomTextEditor's own e.affectsConfiguration('isda.xxx') checks.
    onDidChangeConfiguration: (handler) => {
      configChangeListeners.push(handler);
      return { dispose: () => { const i = configChangeListeners.indexOf(handler); if (i >= 0) configChangeListeners.splice(i, 1); } };
    },
    get textDocuments() { return openTextDocuments; },
    // Open / close events are never fired by this mock (E1b subscribes to both).
    onDidOpenTextDocument: () => ({ dispose: () => {} }),
    onDidCloseTextDocument: () => ({ dispose: () => {} }),
  },
  __diagnosticCollections: diagnosticCollections,
  __outputChannels: outputChannels,
  __setLanguageMatch: (fn) => { languageMatch = fn || (() => 0); },
  __registeredCommands: registeredCommands,
  __registeredCodeLensProviders: registeredCodeLensProviders,
  __registeredHoverProviders: registeredHoverProviders,
  __registeredCompletionProviders: registeredCompletionProviders,
  __registeredCodeActionProviders: registeredCodeActionProviders,
  __selectionListeners: selectionListeners,
  __decorationTypes: decorationTypes,
  __registeredSymbolProviders: registeredSymbolProviders,
  __registeredDefinitionProviders: registeredDefinitionProviders,
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
  __fireConfigChange: (changedKey) => {
    const event = { affectsConfiguration: (key) => changedKey === key || changedKey.indexOf(key + '.') === 0 || key.indexOf(changedKey + '.') === 0 };
    configChangeListeners.slice().forEach((handler) => handler(event));
  },
  __setOpenTextDocuments: (docs) => { openTextDocuments.length = 0; openTextDocuments.push(...docs); },
  get __executedCommands() { return executedCommands; },
  __setRunCommandHandler: (fn) => { runCommandHandler = fn; },
  __setMockExtension: (id, ext) => { mockExtensions[id] = ext; },
  __removeMockExtension: (id) => { delete mockExtensions[id]; },
  __setWarningResponse: (respOrFn) => { vscodeMock.__mockWarningResponse = respOrFn; },
  __setOpenDialogResponse: (respOrFn) => { vscodeMock.__openDialogResponse = respOrFn; },
  __markDirectory: (uri) => { mockDirs.add(uri.toString()); },
  __clearMockDirs: () => { mockDirs.clear(); },
  __setSaveDialogResponse: (respOrFn) => { vscodeMock.__saveDialogResponse = respOrFn; },
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
  // Suggestion C - isDirty is now a real mutable flag (was a fixed boolean
  // set once at construction) so save() can realistically flip it back to
  // clean, matching real vscode.TextDocument's own isDirty/save() contract -
  // needed to test the dirty-state push flow end-to-end, not just its
  // initial value.
  let dirty = !!opts.isDirty;
  const doc = {
    uri: docUri,
    fileName: docUri.path,
    getText: () => text,
    positionAt: (offset) => ({ line: 0, character: offset }),
    lineAt: (n) => ({ text: '' }),
    get isDirty() { return dirty; },
    save: () => {
      saveCount++;
      dirty = false;
      saveListeners.slice().forEach((h) => h(doc));
      return Promise.resolve(true);
    },
    get saveCount() { return saveCount; },
  };
  return doc;
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

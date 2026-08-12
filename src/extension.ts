/**
 * extension.ts
 *
 * Extension host entry point. Opens a webview beside a DDS display-file
 * source, keeps it in sync with the document in both directions:
 *   - edits made in the visual designer are applied to the real document
 *     via a WorkspaceEdit (so undo/redo, save, and any other extension
 *     watching the document all behave normally)
 *   - edits made directly in the text editor (or by any other tool) are
 *     pushed into the webview so the visual preview never goes stale
 */
import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewTemplate';
import { getMenuWebviewHtml, MenuCommandSourceStatus } from './menuWebviewTemplate';
import { parseDspf } from './dspfParser';

// Matches local .dspf/.mnudds files by extension/language, PLUS remote IBM i
// source members and IFS streamfiles opened through Code for i (scheme
// 'member' / 'streamfile' - see https://codefori.github.io/docs/dev/examples/).
// Those don't reliably carry a matching resourceExtname in every case, so the
// scheme match is intentionally broader; isLikelyDisplayFile()/isLikelyMenuFile()
// below are the actual content-based filters that keep each CodeLens precise.
// 'dds.dspf' is the language ID the (optional) companion "IBMi Languages"
// extension assigns to display-file source specifically - verified against
// its package.json rather than assumed, since e.g. plain '.pf'/'.dds' map to
// 'dds.pf' (physical files, not display files) and would be the wrong match.
// A MNUDDS member is *also* plain DDS (see isLikelyMenuFile), so it's matched
// by 'dds.dspf' too when the IBMi Languages extension is present.
const DDS_LANGUAGE_SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', pattern: '**/*.{dspf,DSPF,dspf38,mnudds,MNUDDS}' },
  { language: 'dds.dspf' },
  { scheme: 'member' },
  { scheme: 'streamfile' },
];

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DspfDesignerEditorProvider();
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(DspfDesignerEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      // Text-backed documents: VS Code owns save/revert/undo entirely through the
      // normal TextDocument mechanism once we edit via WorkspaceEdit, so there's
      // no custom backup/serialization to implement here.
      supportsMultipleEditorsPerDocument: false,
    })
  );

  const menuProvider = new MenuDesignerEditorProvider();
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MenuDesignerEditorProvider.viewType, menuProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dspfDesigner.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a DDS display file source (.dspf) first.');
        return;
      }
      openDesigner(editor.document.uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dspfDesigner.openMenuPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a menu source (MNUDDS) first.');
        return;
      }
      vscode.commands.executeCommand(
        'vscode.openWith',
        editor.document.uri,
        MenuDesignerEditorProvider.viewType,
        vscode.ViewColumn.Beside
      );
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand('dspfDesigner.createNewDspf', (targetUri?: vscode.Uri) => createNewDspf(targetUri)));

  // Convenience: an editor title button when the active file looks like a DSPF or
  // MNUDDS source. Both lenses can appear together - a menu source IS a display
  // file (see isLikelyMenuFile), so offering both designers is intentional, not a bug.
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(DDS_LANGUAGE_SELECTOR, {
      provideCodeLenses(document) {
        const range = new vscode.Range(0, 0, 0, 0);
        const lenses: vscode.CodeLens[] = [];
        if (isLikelyDisplayFile(document)) {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '$(open-preview) Open Screen Design',
              command: 'dspfDesigner.openPreview',
            })
          );
        }
        if (isLikelyMenuFile(document)) {
          lenses.push(
            new vscode.CodeLens(range, {
              title: '$(list-selection) Open Menu Design',
              command: 'dspfDesigner.openMenuPreview',
            })
          );
        }
        return lenses;
      },
    })
  );
}

function isLikelyDisplayFile(document: vscode.TextDocument): boolean {
  // DDS display files declare record formats with 'R' in column 17; a quick,
  // cheap heuristic rather than a full parse just to decide whether to show the CodeLens.
  const text = document.getText();
  return /^.{16}R\s+\S/m.test(text) || /DSPSIZ\(/i.test(text);
}

/**
 * An IBM i SDA-style menu (MNUDDS source) is *plain DDS* - CRTMNU just compiles
 * it into a *DSPF like any other display file - so there's no structural marker
 * that says "this is a menu" the way e.g. a MSGF source would declare its type.
 * The one thing that reliably distinguishes a menu screen is that it lays its
 * options out as constants shaped like "1. Do a thing" / "12) Do a thing" -
 * each of those numbers is what the companion MNUCMD member's option-to-command
 * mapping keys off of (see mnuCmdEngine.js). Two or more such constants is a
 * good enough signal to offer the menu designer without false-triggering on
 * ordinary numbered lists that occasionally show up on non-menu screens.
 * Also trusts a '.mnudds' extension outright, local or remote (member/streamfile
 * URIs carry the IBM i source type as the path's extension, not a real file
 * extension - see getMemberUri in codefori/vscode-ibmi).
 */
function isLikelyMenuFile(document: vscode.TextDocument): boolean {
  if (/\.mnudds$/i.test(document.uri.path)) return true;
  if (!isLikelyDisplayFile(document)) return false;
  const matches = document.getText().match(/'\s*\d{1,2}[.)]\s+\S/g);
  return !!matches && matches.length >= 2;
}

/**
 * SDA stores a menu's option-to-command mapping in a companion source member
 * named "<menu>QQ", type MNUCMD, in the SAME source file/library as the MNUDDS
 * member (see https://wiki.midrange.com/index.php/Create_Menu_Message_FIle_(UTMNUMSGF)
 * and CHANGELOG for how this was confirmed). Only meaningful for remote IBM i
 * members opened through Code for i (scheme 'member' - see DDS_LANGUAGE_SELECTOR
 * above); returns null for anything else, which callers treat as "nowhere to
 * save option commands for this document" rather than guessing a local sibling
 * file, since there's no equivalent local-workspace convention to fall back to.
 */
function getMenuCommandMemberUri(uri: vscode.Uri): vscode.Uri | null {
  if (uri.scheme !== 'member') return null;
  const segments = uri.path.split('/').filter(Boolean);
  if (segments.length < 3) return null; // not a well-formed .../LIBRARY/FILE/NAME.TYPE member path
  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf('.');
  if (dot <= 0) return null; // no source type to key off of
  const name = last.slice(0, dot);
  const newSegments = segments.slice(0, -1).concat(`${name}QQ.MNUCMD`);
  return uri.with({ path: '/' + newSegments.join('/') });
}

/** Opens the visual designer beside the current editor via the standard "open with a
 *  specific custom editor" command, rather than a plain WebviewPanel - see
 *  DspfDesignerEditorProvider for why: this way our webview participates as a real
 *  editor (dirty dot on its own tab, close-with-unsaved-changes prompt, Ctrl+Z/Y
 *  routed to it when focused) instead of being a second-class companion panel.
 *  supportsMultipleEditorsPerDocument:false above means a second call for the same
 *  URI reveals the existing instance rather than opening a duplicate. */
function openDesigner(uri: vscode.Uri): void {
  vscode.commands.executeCommand('vscode.openWith', uri, DspfDesignerEditorProvider.viewType, vscode.ViewColumn.Beside);
}

/**
 * CustomTextEditorProvider for the visual designer. The underlying vscode.TextDocument
 * remains the single source of truth throughout: this class only ever reads it (to
 * build the initial/refreshed webview HTML) and writes to it via WorkspaceEdit (via
 * the same 'applyEdit' message handling the plain-WebviewPanel version used) - it never
 * holds its own separate copy of "the real state" the way a binary CustomEditorProvider
 * document model would.
 */
class DspfDesignerEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'dspfDesigner.editor';

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): void {
    webviewPanel.webview.options = { enableScripts: true };

    const nonce = getNonce();
    const fileName = document.fileName.split(/[\\/]/).pop() || '';
    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview.cspSource, nonce, document.getText(), fileName);

    // Scoped per editor instance (resolveCustomTextEditor runs once per opened tab),
    // same echo-suppression pattern as before: ignore the onDidChangeTextDocument
    // event our OWN applyEdit call below produces, so we don't immediately re-push
    // the just-applied text back into the webview as if it were an external change.
    let applyingFromWebview = false;

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (applyingFromWebview) return;
      webviewPanel.webview.postMessage({ type: 'externalUpdate', text: e.document.getText() });
    });

    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'applyEdit') {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, msg.text);
        applyingFromWebview = true;
        await vscode.workspace.applyEdit(edit);
        applyingFromWebview = false;
      } else if (msg.type === 'error') {
        vscode.window.showErrorMessage('iSDA: ' + msg.message);
      }
      // 'ready' needs no response; initial content was already embedded in the HTML.
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      messageSub.dispose();
    });
  }
}

/**
 * CustomTextEditorProvider for the menu designer. The MNUDDS document itself
 * follows the exact same single-source-of-truth / WorkspaceEdit pattern as
 * DspfDesignerEditorProvider (it IS a DSPF, reusing the same parser/engine in
 * the webview - see menuWebviewTemplate.ts). The companion MNUCMD member is
 * different: it's a *separate* document that usually isn't open in any editor,
 * so rather than requiring it be open to edit (as WorkspaceEdit would), this
 * writes to it directly via vscode.workspace.fs - the same approach
 * createNewDspf() below already uses to create a brand-new file. Known
 * limitation of that choice: if the companion member also happens to be open
 * in its own text editor tab, this won't update that buffer or go through its
 * undo stack - documented in the README rather than solved here, since
 * reconciling two independently-open documents that describe the same object
 * is a bigger problem than this vertical slice needs to take on yet.
 */
class MenuDesignerEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'dspfDesigner.menuEditor';

  async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };

    const nonce = getNonce();
    const fileName = document.fileName.split(/[\\/]/).pop() || '';
    const commandUri = getMenuCommandMemberUri(document.uri);
    const commandFileName = commandUri ? commandUri.path.split('/').pop() || '' : '';

    let commandSource = '';
    let commandStatus: MenuCommandSourceStatus = 'unsupported';
    if (commandUri) {
      try {
        const bytes = await vscode.workspace.fs.readFile(commandUri);
        commandSource = Buffer.from(bytes).toString('utf8');
        commandStatus = 'loaded';
      } catch {
        commandStatus = 'missing'; // no MNUCMD member yet - created on first edit
      }
    }

    webviewPanel.webview.html = getMenuWebviewHtml(
      webviewPanel.webview.cspSource,
      nonce,
      document.getText(),
      commandSource,
      fileName,
      commandFileName,
      commandStatus
    );

    // Same echo-suppression pattern as DspfDesignerEditorProvider, scoped to this
    // editor instance's own applyEdit calls against the MNUDDS document. The
    // companion MNUCMD write below deliberately does NOT participate in this -
    // see the class doc comment on why it's a separate, simpler write path.
    let applyingFromWebview = false;

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (applyingFromWebview) return;
      webviewPanel.webview.postMessage({ type: 'externalUpdate', text: e.document.getText() });
    });

    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'applyEdit') {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, msg.text);
        applyingFromWebview = true;
        await vscode.workspace.applyEdit(edit);
        applyingFromWebview = false;
      } else if (msg.type === 'applyMenuCmdEdit') {
        if (!commandUri) {
          vscode.window.showErrorMessage(
            'iSDA: this menu was not opened from an IBM i source member, so there is nowhere to save option-to-command mappings.'
          );
          return;
        }
        try {
          await vscode.workspace.fs.writeFile(commandUri, Buffer.from(msg.text, 'utf8'));
        } catch (err) {
          vscode.window.showErrorMessage(`iSDA: failed to save menu commands to ${commandUri.path}: ${err}`);
        }
      } else if (msg.type === 'error') {
        vscode.window.showErrorMessage('iSDA: ' + msg.message);
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      messageSub.dispose();
    });
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

// ---------------------------------------------------------------------
// Create New Display File
// ---------------------------------------------------------------------

interface DdsLineSpec {
  seq?: string;
  comment?: string;
  nameType?: string;
  name?: string;
  length?: string;
  dataType?: string;
  decimals?: string;
  usage?: string;
  line?: string;
  col?: string;
  func?: string;
}

/** Places each value at its exact 1-based DDS column - the same discipline as the
 *  test fixtures use, since fixed-column DDS punishes hand-spaced strings badly
 *  and a boilerplate is exactly the kind of thing that should never be hand-typed. */
function buildDdsLine(spec: DdsLineSpec): string {
  const chars: string[] = new Array(80).fill(' ');
  const put = (startCol: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      const idx = startCol - 1 + i;
      if (idx < 80) chars[idx] = text[i];
    }
  };
  put(1, (spec.seq ?? '').padEnd(5, ' ').slice(0, 5));
  put(6, 'A');
  if (spec.comment !== undefined) {
    put(7, '*');
    put(8, spec.comment);
    return chars.join('').replace(/\s+$/, '');
  }
  put(17, spec.nameType ?? ' ');
  put(19, spec.name ?? '');
  put(30, (spec.length ?? '').toString().padStart(5, ' ').slice(-5));
  put(35, spec.dataType ?? '');
  put(36, (spec.decimals ?? '').toString().padStart(2, ' ').slice(-2));
  put(38, spec.usage ?? '');
  put(39, (spec.line ?? '').toString().padStart(3, ' ').slice(-3));
  put(42, (spec.col ?? '').toString().padStart(3, ' ').slice(-3));
  put(45, spec.func ?? '');
  return chars.join('').replace(/\s+$/, '');
}

function buildBoilerplateDspf(recordName: string, titleText: string): string {
  const lines = [
    buildDdsLine({ seq: '00010', comment: ' Generated by iSDA - Interactive Screen Design Aid' }),
    buildDdsLine({ seq: '00020', func: 'DSPSIZ(24 80 *DS3)' }),
    buildDdsLine({ seq: '00030', nameType: 'R', name: recordName }),
    buildDdsLine({ seq: '00040', line: '1', col: '2', func: "'" + titleText.replace(/'/g, "''") + "'" }),
    buildDdsLine({ seq: '00050', func: 'DSPATR(HI)' }),
    buildDdsLine({ seq: '00060', name: 'FIELD1', length: '10', dataType: 'A', usage: 'O', line: '3', col: '2' }),
  ];
  return lines.join('\n') + '\n';
}

/** DDS names: up to 10 chars, must start with a letter, alphanumeric plus @#$ after that. */
function validateDdsName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Required';
  if (trimmed.length > 10) return 'Cannot exceed 10 characters';
  if (!/^[A-Za-z][A-Za-z0-9@#$]*$/.test(trimmed)) return 'Must start with a letter, and contain only letters, digits, @, #, $';
  return null;
}

async function createNewDspf(targetUri?: vscode.Uri): Promise<void> {
  let folderUri = targetUri;
  if (folderUri) {
    const stat = await vscode.workspace.fs.stat(folderUri);
    if (stat.type !== vscode.FileType.Directory) {
      folderUri = vscode.Uri.joinPath(folderUri, '..');
    }
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('iSDA: open a workspace folder before creating a display file.');
      return;
    }
    folderUri =
      workspaceFolders.length === 1
        ? workspaceFolders[0].uri
        : (await vscode.window.showWorkspaceFolderPick())?.uri;
    if (!folderUri) return; // user cancelled the folder pick
  }

  const fileNameInput = await vscode.window.showInputBox({
    prompt: 'Display file name',
    placeHolder: 'SCREEN1.dspf',
    value: 'SCREEN1.dspf',
    validateInput: (value) => {
      const base = value.trim().replace(/\.dspf$/i, '');
      return validateDdsName(base);
    },
  });
  if (!fileNameInput) return;
  const baseName = fileNameInput.trim().replace(/\.dspf$/i, '');
  const fileName = baseName + '.dspf';

  const recordName = await vscode.window.showInputBox({
    prompt: 'Primary record format name',
    placeHolder: 'RECORD1',
    value: 'RECORD1',
    validateInput: validateDdsName,
  });
  if (!recordName) return;

  const titleText = (await vscode.window.showInputBox({
    prompt: 'Screen title (shown as a constant on the first line)',
    placeHolder: baseName,
    value: baseName,
  })) ?? baseName;

  const source = buildBoilerplateDspf(recordName.trim().toUpperCase(), titleText);

  // Belt-and-suspenders: parse what we're about to write before writing it, so a
  // boilerplate bug fails loudly here rather than shipping a broken starter file.
  const parsed = parseDspf(source);
  if (parsed.errors.length > 0) {
    vscode.window.showErrorMessage('iSDA: generated boilerplate failed to parse - not writing the file. This is a bug in iSDA itself, please report it.');
    return;
  }

  const fileUri = vscode.Uri.joinPath(folderUri, fileName);
  try {
    await vscode.workspace.fs.stat(fileUri);
    const overwrite = await vscode.window.showWarningMessage(`${fileName} already exists. Overwrite?`, { modal: true }, 'Overwrite');
    if (overwrite !== 'Overwrite') return;
  } catch {
    // File doesn't exist - normal case, proceed.
  }

  try {
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(source, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    openDesigner(doc.uri);
  } catch (err) {
    vscode.window.showErrorMessage(`iSDA: failed to create display file: ${err}`);
  }
}

export function deactivate(): void {}

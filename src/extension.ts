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
import { parseDspf } from './dspfParser';

// Matches local .dspf files by extension/language, PLUS remote IBM i source
// members and IFS streamfiles opened through Code for i (scheme 'member' /
// 'streamfile' - see https://codefori.github.io/docs/dev/examples/). Those
// don't reliably carry a matching resourceExtname in every case, so the
// scheme match is intentionally broader; isLikelyDisplayFile() below is the
// actual content-based filter that keeps the CodeLens itself precise.
// 'dds.dspf' is the language ID the (optional) companion "IBMi Languages"
// extension assigns to display-file source specifically - verified against
// its package.json rather than assumed, since e.g. plain '.pf'/'.dds' map to
// 'dds.pf' (physical files, not display files) and would be the wrong match.
const DDS_LANGUAGE_SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', pattern: '**/*.{dspf,DSPF,dspf38}' },
  { language: 'dds.dspf' },
  { scheme: 'member' },
  { scheme: 'streamfile' },
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dspfDesigner.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a DDS display file source (.dspf) first.');
        return;
      }
      openDesigner(context, editor.document);
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand('dspfDesigner.createNewDspf', (targetUri?: vscode.Uri) => createNewDspf(context, targetUri)));

  // Convenience: an editor title button when the active file looks like a DSPF source.
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(DDS_LANGUAGE_SELECTOR, {
      provideCodeLenses(document) {
        if (!isLikelyDisplayFile(document)) return [];
        const range = new vscode.Range(0, 0, 0, 0);
        return [
          new vscode.CodeLens(range, {
            title: '$(open-preview) Open Screen Design',
            command: 'dspfDesigner.openPreview',
          }),
        ];
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

const openPanels = new Map<string, vscode.WebviewPanel>();

function openDesigner(context: vscode.ExtensionContext, document: vscode.TextDocument): void {
  const key = document.uri.toString();
  const existing = openPanels.get(key);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Beside);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'dspfDesigner',
    'iSDA: ' + document.fileName.split(/[\\/]/).pop(),
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  openPanels.set(key, panel);

  const nonce = getNonce();
  panel.webview.html = getWebviewHtml(panel.webview.cspSource, nonce, document.getText(), document.fileName.split(/[\\/]/).pop() || '');

  // Text-editor -> webview: reflect external edits (typing in the source, git checkout, etc.)
  let applyingFromWebview = false;
  const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.toString() !== key) return;
    if (applyingFromWebview) return; // avoid echoing our own edit back in
    panel.webview.postMessage({ type: 'externalUpdate', text: e.document.getText() });
  });

  // Webview -> text-editor: apply designer edits as a real WorkspaceEdit.
  const messageSub = panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'applyEdit') {
      const doc = await vscode.workspace.openTextDocument(document.uri);
      const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, fullRange, msg.text);
      applyingFromWebview = true;
      await vscode.workspace.applyEdit(edit);
      applyingFromWebview = false;
    } else if (msg.type === 'error') {
      vscode.window.showErrorMessage('iSDA: ' + msg.message);
    }
    // 'ready' needs no response; initial content was already embedded in the HTML.
  });

  panel.onDidDispose(() => {
    changeSub.dispose();
    messageSub.dispose();
    openPanels.delete(key);
  });

  context.subscriptions.push(panel);
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

async function createNewDspf(context: vscode.ExtensionContext, targetUri?: vscode.Uri): Promise<void> {
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
    openDesigner(context, doc);
  } catch (err) {
    vscode.window.showErrorMessage(`iSDA: failed to create display file: ${err}`);
  }
}

export function deactivate(): void {}

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

const DDS_LANGUAGE_SELECTOR: vscode.DocumentSelector = [{ scheme: 'file', pattern: '**/*.{dspf,DSPF,pf,PF}' }];

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
    'Screen Design: ' + document.fileName.split(/[\\/]/).pop(),
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
      vscode.window.showErrorMessage('DDS Designer: ' + msg.message);
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

export function deactivate(): void {}

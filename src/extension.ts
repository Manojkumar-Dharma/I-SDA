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
// Plain dependency-free JS (see its own file header) - required directly
// rather than ported to TS, so the exact same parsing logic the webview uses
// client-side also runs here on the extension host for the compile command.
const MnuCmdEngine: {
  parseMnuCmd(text: string): { options: Array<{ optionNumber: string; numberValue: number; command: string }> };
  applyOptionCommand(text: string, numberValue: number, command: string): string;
} = require('./mnuCmdEngine.js');
// Same reasoning: DspfEngine.resolveReferenceTarget and DspfWriter.applyFieldUpdate are
// plain, dependency-free JS shared verbatim with the webview (see their own file headers) -
// required directly here for the extension-host half of Resolve Referenced Field (the
// network round-trip to Code for i can only happen host-side; the webview only sends
// "resolve this field" and receives the refreshed document back via the normal
// onDidChangeTextDocument -> 'externalUpdate' plumbing already in place below).
const DspfEngine: {
  resolveReferenceTarget(dspfFile: any, record: any, field: any): { fieldName: string; library: string | null; file: string } | null;
} = require('./dspfEngine.js');
const DspfWriter: {
  applyFieldUpdate(field: any, sourceLines: string[], updates: any): string[];
  insertField(record: any, sourceLines: string[], newField: any): string[];
  nextAvailableFieldName(record: any, baseName: string): string;
  insertTypedRecord(dspfFile: any, sourceLines: string[], newRecord: { name: string; keywords: any[] }, pairBack: any): string[];
  insertTypedRecordWithDependent(dspfFile: any, sourceLines: string[], mainRecord: { name: string; keywords: any[] }, dependentRecord: { name: string; keywords: any[] }): string[];
} = require('./dspfWriter.js');
// Same reasoning as MnuCmdEngine/DspfEngine above: plain dependency-free JS
// shared verbatim with the webview. buildTypedRecordPlan is the "+ Add
// record" wizard's own record-type decision table (what keywords/companion
// SFLCTL record/hidden fields each of the 9 real-SDA record types needs) -
// reused here for "Create New Display File"'s record-type picker so the two
// entry points can never silently drift into different starter DDS for the
// same type.
const WebviewClientHelpers: {
  RECORD_TYPES: Array<{ value: string; label: string }>;
  isSflFamilyRecordType(type: string): boolean;
  buildTypedRecordPlan(
    type: string,
    name: string,
    sflctlName: string | null,
    windowDepValue: string | null,
    sflmsgOpts: { line: number; keyName: string; queueName: string; use276: boolean } | null
  ): { mainKeywords: any[]; dependent: { name: string; keywords: any[] } | null; extraFields: Array<{ name: string; usage: string; keywords: any[] }> } | null;
} = require('./webviewClientHelpers.js');

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

// Shared between the DSPF and menu designers, so toggling the UI style in
// either one is reflected in the other next time it's opened. Defaults to
// 'modern' - the animation/focus/spacing layer added on top of the original
// (now 'classic') look - with a one-click way back via #uiStyleToggle in
// each webview.
const UI_STYLE_KEY = 'isda.uiStyle';
// Independent of UI_STYLE_KEY - a theme picked while in modern style is
// remembered even if the person later reverts to classic and comes back.
const UI_THEME_KEY = 'isda.uiTheme';

function getUiStyle(context: vscode.ExtensionContext): string {
  return context.globalState.get<string>(UI_STYLE_KEY, 'modern');
}

function getUiTheme(context: vscode.ExtensionContext): string {
  return context.globalState.get<string>(UI_THEME_KEY, 'green');
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DspfDesignerEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(DspfDesignerEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      // Text-backed documents: VS Code owns save/revert/undo entirely through the
      // normal TextDocument mechanism once we edit via WorkspaceEdit, so there's
      // no custom backup/serialization to implement here.
      supportsMultipleEditorsPerDocument: false,
    })
  );

  const menuProvider = new MenuDesignerEditorProvider(context);
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
      openMenuDesigner(editor.document.uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dspfDesigner.compileMenu', (targetUri?: vscode.Uri) => {
      const uri = targetUri || vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        vscode.window.showWarningMessage('Open a menu source (MNUDDS) first.');
        return;
      }
      return compileMenu(uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dspfDesigner.compileDspf', (targetUri?: vscode.Uri) => {
      const uri = targetUri || vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        vscode.window.showWarningMessage('Open a display file source (DSPF) first.');
        return;
      }
      return compileDspf(uri);
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand('dspfDesigner.createNewDspf', (targetUri?: vscode.Uri) => createNewDspf(targetUri)));

  context.subscriptions.push(vscode.commands.registerCommand('dspfDesigner.createNewMenu', (targetUri?: vscode.Uri) => createNewMenu(targetUri)));

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
 * and CHANGELOG for how this was confirmed). For a remote `member:` scheme
 * document that's a literal derivation of the real IBM i naming convention.
 * For a local `file:` scheme document, or a Code for i IFS `streamfile:`
 * scheme document, there's no equivalent IBM i source-member convention to
 * derive from (streamfiles aren't source members - they don't have a
 * companion "<n>QQ" member the way a MNUDDS source member does), so both use
 * the closest local analogue instead: a sibling file in the same directory
 * named `<basename>QQ.mnucmd` (lowercase, matching how `.mnudds` itself is
 * used locally) - e.g. `MYMENU.mnudds` pairs with `MYMENUQQ.mnucmd` next to
 * it. Returns null for anything else (there's no equivalent workspace
 * convention for other schemes, e.g. `untitled:` has no directory to place a
 * sibling in), which callers treat as "nowhere to save option commands for
 * this document".
 */
function getMenuCommandMemberUri(uri: vscode.Uri): vscode.Uri | null {
  if (uri.scheme === 'member') {
    const segments = uri.path.split('/').filter(Boolean);
    if (segments.length < 3) return null; // not a well-formed .../LIBRARY/FILE/NAME.TYPE member path
    const last = segments[segments.length - 1];
    const dot = last.lastIndexOf('.');
    if (dot <= 0) return null; // no source type to key off of
    const name = last.slice(0, dot);
    const newSegments = segments.slice(0, -1).concat(`${name}QQ.MNUCMD`);
    return uri.with({ path: '/' + newSegments.join('/') });
  }
  if (uri.scheme === 'file' || uri.scheme === 'streamfile') {
    // IFS streamfiles (Code for i's 'streamfile' scheme) are real files with a
    // real path/extension, same shape as a local 'file' scheme URI - just
    // backed by a different FileSystemProvider (vscode.workspace.fs already
    // routes reads/writes through whichever provider owns the scheme, so no
    // extra branching is needed below this function). No IBM i naming
    // convention applies to streamfiles the way it does to source members, so
    // this reuses the same local-analogue sibling-file convention as 'file'.
    const lastSlash = uri.path.lastIndexOf('/');
    const dir = uri.path.slice(0, lastSlash + 1);
    const fileName = uri.path.slice(lastSlash + 1);
    const dot = fileName.lastIndexOf('.');
    if (dot <= 0) return null; // no extension to key off of
    const base = fileName.slice(0, dot);
    return uri.with({ path: dir + base + 'QQ.mnucmd' });
  }
  return null;
}

/**
 * Breaks a `member:` scheme URI's path (`/LIBRARY/FILE/NAME.TYPE`, or with a
 * leading ASP name) into its parts, for building CL commands. See
 * getMemberUri in codefori/vscode-ibmi for the URI shape this mirrors.
 */
function parseMemberUri(uri: vscode.Uri): { library: string; file: string; name: string; extension: string } | null {
  if (uri.scheme !== 'member') return null;
  const segments = uri.path.split('/').filter(Boolean);
  if (segments.length < 3) return null;
  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf('.');
  if (dot <= 0) return null;
  const file = segments[segments.length - 2];
  const library = segments[segments.length - 3];
  if (!file || !library) return null;
  return { library, file, name: last.slice(0, dot), extension: last.slice(dot + 1) };
}

/**
 * Compiles an SDA-style menu (CRTMNU) from the two source members iSDA edits.
 * Uses Code for i's `code-for-ibmi.runCommand` API (see
 * https://codefori.github.io/docs/dev/examples/#running-commands-with-the-user-library-list) -
 * NOT a shipped IBM utility for the display-file -> message-file step (there
 * isn't a universally-installed one; UTMNUMSGF, sometimes mentioned for this,
 * is a third-party MidrangeWiki tool most shops won't have) - instead it
 * rebuilds the message file directly with ADDMSGD, one message per option,
 * using the `USRnnnn` message ID format that TYPE(*DSPF) menus expect
 * (confirmed against an IBM support document - see README/CHANGELOG). The
 * message file is deleted and recreated each compile rather than diffed
 * against whatever IDs already happen to exist there, since idempotent
 * beats clever for a "compile" button. Every step's real IBM i error text is
 * surfaced verbatim (via CommandResult.stderr/stdout) rather than swallowed
 * or reworded, and the whole thing stops at the first failing step.
 */
async function compileMenu(uri: vscode.Uri): Promise<void> {
  const parsed = parseMemberUri(uri);
  if (!parsed) {
    vscode.window.showErrorMessage('iSDA: Compile Menu only works for a MNUDDS member opened from an IBM i connection (Code for i).');
    return;
  }
  const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
  if (!ext) {
    vscode.window.showErrorMessage(
      'iSDA: Compile Menu requires the Code for IBM i extension (halcyontechltd.code-for-ibmi) to be installed and connected.'
    );
    return;
  }
  // Same reasoning as getConnectedCodeForIBMi()/fetchReferencedFieldAttributes():
  // code-for-ibmi.runCommand is registered at Code for i's OWN activation
  // time, not declared in contributes.commands, so VS Code's usual
  // auto-activate-on-command mechanism doesn't cover it - calling
  // executeCommand on it before Code for i has activated genuinely throws
  // "command not found", surfacing as a confusing "CRTDSPF failed: command
  // ... not found" error rather than the clear guard message above, even
  // though Code for i is installed and would work fine once active. A
  // lazily-activated extension simply not having activated yet in this
  // VS Code session isn't the same as "not installed".
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      // fall through - the executeCommand calls below will surface any
      // real problem with a specific error, same as always
    }
  }

  // Compiles read from the SAVED member on the IBM i, not this editor's live
  // buffer - save first (both source members, if open/dirty) so the compile
  // picks up whatever's currently showing in the designer, not stale content.
  const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (openDoc?.isDirty) await openDoc.save();
  const commandUri = getMenuCommandMemberUri(uri);
  const openCommandDoc = commandUri ? vscode.workspace.textDocuments.find((d) => d.uri.toString() === commandUri.toString()) : undefined;
  if (openCommandDoc?.isDirty) await openCommandDoc.save();

  // CRTMNU TYPE(*DSPF) requires the display file's own record format to be
  // named the same as the menu object - a hard IBM requirement, not an iSDA
  // choice, so this is checked up front with an actionable message rather
  // than left to fail cryptically partway through the compile sequence.
  const sourceText = openDoc ? openDoc.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  const model = parseDspf(sourceText);
  const objectName = parsed.name;
  const hasMatchingRecord = model.records.some((r) => r.name.toUpperCase() === objectName.toUpperCase());
  if (!hasMatchingRecord) {
    vscode.window.showErrorMessage(
      `iSDA: CRTMNU requires a record format named exactly "${objectName.toUpperCase()}" (same as the menu member) - found: ${
        model.records.map((r) => r.name).join(', ') || '(none)'
      }. Rename the record format (or the member) and try again.`
    );
    return;
  }

  let commandSource = '';
  if (commandUri) {
    try {
      commandSource = openCommandDoc ? openCommandDoc.getText() : Buffer.from(await vscode.workspace.fs.readFile(commandUri)).toString('utf8');
    } catch {
      commandSource = '';
    }
  }
  const commands = MnuCmdEngine.parseMnuCmd(commandSource).options;
  if (commands.length === 0) {
    const proceed = await vscode.window.showWarningMessage(
      'iSDA: no option-to-command mappings found for this menu - every option will show "not correct" when selected. Compile anyway?',
      'Compile Anyway',
      'Cancel'
    );
    if (proceed !== 'Compile Anyway') return;
  }

  const library = parsed.library;
  const srcFile = parsed.file;

  async function run(command: string, label: string): Promise<{ ok: boolean; message: string }> {
    try {
      const result: any = await vscode.commands.executeCommand('code-for-ibmi.runCommand', { command, environment: 'ile' });
      if (result && typeof result.code === 'number' && result.code !== 0) {
        return { ok: false, message: `${label} failed:\n${result.stderr || result.stdout || 'unknown error'}` };
      }
      return { ok: true, message: '' };
    } catch (err) {
      return { ok: false, message: `${label} failed: ${err}` };
    }
  }

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `iSDA: Compiling menu ${library}/${objectName}` }, async (progress) => {
    progress.report({ message: 'Creating display file (CRTDSPF)...' });
    let step = await run(`CRTDSPF FILE(${library}/${objectName}) SRCFILE(${library}/${srcFile}) SRCMBR(${parsed.name}) REPLACE(*YES)`, 'CRTDSPF');
    if (!step.ok) {
      vscode.window.showErrorMessage('iSDA: ' + step.message);
      return;
    }

    progress.report({ message: 'Updating message file...' });
    // Previously deleted and recreated the message file from scratch on every
    // compile - simple, but genuinely destructive: any message ID a user (or
    // another tool) added to it by hand outside iSDA would be silently wiped
    // on the next compile from here. Now creates it only if it doesn't exist
    // yet, and updates messages in place (ADDMSGD, falling back to CHGMSGD
    // when that message ID is already there) - nothing outside the option
    // numbers iSDA is actually writing is ever touched.
    step = await run(`CRTMSGF MSGF(${library}/${objectName})`, 'CRTMSGF');
    if (!step.ok && !/already exist/i.test(step.message)) {
      vscode.window.showErrorMessage('iSDA: ' + step.message);
      return;
    }

    for (const opt of commands) {
      const msgId = 'USR' + opt.optionNumber; // USRnnnn - the format TYPE(*DSPF) menus expect
      const escapedCommand = opt.command.replace(/'/g, "''");
      const addStep = await run(`ADDMSGD MSGID(${msgId}) MSGF(${library}/${objectName}) MSG('${escapedCommand}') SEV(00)`, `ADDMSGD for option ${opt.numberValue}`);
      if (!addStep.ok) {
        // Most likely means this message ID already exists from a previous
        // compile - update it in place instead of treating that as fatal.
        const changeStep = await run(`CHGMSGD MSGID(${msgId}) MSGF(${library}/${objectName}) MSG('${escapedCommand}') SEV(00)`, `CHGMSGD for option ${opt.numberValue}`);
        if (!changeStep.ok) {
          vscode.window.showErrorMessage(`iSDA: ${addStep.message}\n\nAlso tried CHGMSGD: ${changeStep.message}`);
          return;
        }
      }
    }

    progress.report({ message: 'Creating menu object (CRTMNU)...' });
    step = await run(`CRTMNU MENU(${library}/${objectName}) TYPE(*DSPF) DSPF(${library}/${objectName}) MSGF(${library}/${objectName}) REPLACE(*YES)`, 'CRTMNU');
    if (!step.ok) {
      vscode.window.showErrorMessage('iSDA: ' + step.message);
      return;
    }

    vscode.window.showInformationMessage(`iSDA: Menu ${library}/${objectName} compiled. Try it with GO ${library}/${objectName}.`);
  });
}

/**
 * Task L8 - Compiles a plain DSPF member (CRTDSPF), the single-step
 * counterpart to compileMenu() above for a MNUDDS member. Uses the exact
 * same Code for i `code-for-ibmi.runCommand` API, save-dirty-editor-first,
 * and verbatim-error-surfacing pattern - just without any of compileMenu()'s
 * MNUDDS-specific steps (no record-format-name-matching requirement to
 * pre-validate - that's a CRTMNU-only constraint - and no message-file
 * rebuild/CRTMNU afterward, since a plain DSPF member has neither).
 */
async function compileDspf(uri: vscode.Uri): Promise<void> {
  const parsed = parseMemberUri(uri);
  if (!parsed) {
    vscode.window.showErrorMessage('iSDA: Compile Display File only works for a DSPF member opened from an IBM i connection (Code for i).');
    return;
  }
  const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
  if (!ext) {
    vscode.window.showErrorMessage(
      'iSDA: Compile Display File requires the Code for IBM i extension (halcyontechltd.code-for-ibmi) to be installed and connected.'
    );
    return;
  }
  // Same reasoning as compileMenu() above (see its own comment) -
  // code-for-ibmi.runCommand needs Code for i to have already activated,
  // which VS Code's usual auto-activate-on-command mechanism doesn't
  // guarantee for a command that isn't declared in contributes.commands.
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      // fall through - the executeCommand call below will surface any
      // real problem with a specific error, same as always
    }
  }

  // Same reasoning as compileMenu(): compiles read from the SAVED member on
  // the IBM i, not this editor's live buffer - save first (if dirty) so the
  // compile picks up whatever's currently showing in the designer.
  const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (openDoc?.isDirty) await openDoc.save();

  const library = parsed.library;
  const srcFile = parsed.file;
  const objectName = parsed.name;

  async function run(command: string, label: string): Promise<{ ok: boolean; message: string }> {
    try {
      const result: any = await vscode.commands.executeCommand('code-for-ibmi.runCommand', { command, environment: 'ile' });
      if (result && typeof result.code === 'number' && result.code !== 0) {
        return { ok: false, message: `${label} failed:\n${result.stderr || result.stdout || 'unknown error'}` };
      }
      return { ok: true, message: '' };
    } catch (err) {
      return { ok: false, message: `${label} failed: ${err}` };
    }
  }

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `iSDA: Compiling display file ${library}/${objectName}` }, async (progress) => {
    progress.report({ message: 'Creating display file (CRTDSPF)...' });
    const step = await run(`CRTDSPF FILE(${library}/${objectName}) SRCFILE(${library}/${srcFile}) SRCMBR(${parsed.name}) REPLACE(*YES)`, 'CRTDSPF');
    if (!step.ok) {
      vscode.window.showErrorMessage('iSDA: ' + step.message);
      return;
    }
    vscode.window.showInformationMessage(`iSDA: Display file ${library}/${objectName} compiled.`);
  });
}

/** Controls where openDesigner()/openMenuDesigner() below place the webview -
 *  see the isda.designerOpenColumn setting (package.json). Defaults to
 *  "active" - full-width in the same tab group, no split - since the
 *  designer's own side panels (record/field lists, properties) already give
 *  people the context a split source view would otherwise provide, and a
 *  full-width designer avoids the two of them fighting over horizontal
 *  space on any but the widest terminals. "beside" restores the original
 *  split-column-next-to-the-source behavior for people who want to see the
 *  raw DDS while they work, and "newWindow" pops the designer straight out
 *  into its own OS window. */
type DesignerOpenMode = 'beside' | 'active' | 'newWindow';

function getDesignerOpenMode(): DesignerOpenMode {
  const value = vscode.workspace.getConfiguration('isda').get<string>('designerOpenColumn', 'active');
  return value === 'beside' || value === 'newWindow' ? value : 'active';
}

/** Opens the visual designer via the standard "open with a specific custom
 *  editor" command, rather than a plain WebviewPanel - see
 *  DspfDesignerEditorProvider for why: this way our webview participates as a
 *  real editor (dirty dot on its own tab, close-with-unsaved-changes prompt,
 *  Ctrl+Z/Y routed to it when focused) instead of being a second-class
 *  companion panel. supportsMultipleEditorsPerDocument:false above means a
 *  second call for the same URI reveals the existing instance rather than
 *  opening a duplicate. Where exactly it opens is governed by
 *  getDesignerOpenMode() above. */
async function openInDesigner(uri: vscode.Uri, viewType: string): Promise<void> {
  const mode = getDesignerOpenMode();
  const column = mode === 'beside' ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  await vscode.commands.executeCommand('vscode.openWith', uri, viewType, column);
  if (mode === 'newWindow') {
    // Operates on whichever editor is currently active - the openWith above
    // just made the designer webview that editor, so this pops IT out (not
    // the original source tab, which is left behind in the original window).
    await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
  }
}

/**
 * Field metadata fetched from a live IBM i for one referenced field - the
 * result half of "Resolve Referenced Field via Code for i". `dataType` is
 * already the real DDS position-35 type code (not a generic SQL type name -
 * see fetchReferencedFieldAttributes' own comment for why DSPFFD's OUTFILE
 * is used instead of the QSYS2.SYSCOLUMNS SQL catalog for this).
 */
type ReferencedFieldAttributes = { length: number; dataType: string; decimalPositions: number | null };

/**
 * Interprets one DSPFFD OUTFILE row (QADSPFFD/QWHDRFFD format) into DDS's
 * own length/type/decimals shape - shared by fetchReferencedFieldAttributes
 * (one named field) and fetchDatabaseFileFields (Task L14 - every field in
 * a file at once) so this char-vs-numeric interpretation only lives in one
 * place. See fetchReferencedFieldAttributes' own doc comment below for why
 * DSPFFD's OUTFILE is used at all instead of the QSYS2.SYSCOLUMNS SQL
 * catalog, and for what WHFLDB vs WHFLDD/WHFLDP each mean.
 */
function mapDspffdRowToAttributes(row: any): ReferencedFieldAttributes {
  const rowValue = (key: string) => (row[key] !== undefined ? row[key] : row[key.toLowerCase()]);
  const whfldt = String(rowValue('WHFLDT') || '').trim().toUpperCase();
  const whfldb = Number(rowValue('WHFLDB'));
  const whfldd = Number(rowValue('WHFLDD'));
  const whfldp = Number(rowValue('WHFLDP'));

  if (whfldt === 'A') {
    // Character: DDS's LENGTH column means bytes here.
    return { length: whfldb, dataType: '', decimalPositions: null };
  }
  // Numeric (and everything else): DDS's LENGTH column means total digits,
  // not bytes - WHFLDD, not WHFLDB (see this function's own doc comment).
  return { length: whfldd, dataType: whfldt, decimalPositions: whfldp > 0 ? whfldp : null };
}

/**
 * Fetches one referenced field's real length/type/decimals from a connected
 * IBM i via Code for IBM i - the network half of "Resolve Referenced Field",
 * kept separate from DspfEngine.resolveReferenceTarget (which only works out
 * WHERE to look, with no I/O of its own, so it can be unit tested without a
 * live connection).
 *
 * Deliberately uses DSPFFD's classic OUTFILE (QADSPFFD/QWHDRFFD format)
 * rather than the QSYS2.SYSCOLUMNS SQL catalog: SYSCOLUMNS reports generic
 * SQL type names (CHARACTER, DECIMAL, ...), which would need a lossy
 * best-guess mapping back to DDS's own single-character type codes
 * (position 35 - P/S/B/F/L/T/Z/blank). DSPFFD's OUTFILE instead reports the
 * field's ACTUAL DDS type code directly in WHFLDT - the same information
 * real SDA itself reads when resolving a reference field - so no mapping or
 * guessing is needed.
 */
async function fetchReferencedFieldAttributes(
  target: { fieldName: string; library: string | null; file: string }
): Promise<ReferencedFieldAttributes | { error: string }> {
  const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
  if (!ext) {
    return { error: 'Resolve Referenced Field requires the Code for IBM i extension (halcyontechltd.code-for-ibmi), installed and connected.' };
  }
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      // fall through - exports may still be usable, or the getConnection() check below will catch it
    }
  }
  const instance: any = ext.exports && ext.exports.instance;
  const connection = instance && typeof instance.getConnection === 'function' ? instance.getConnection() : undefined;
  if (!connection) {
    return { error: 'Not connected to an IBM i - connect via the Code for IBM i panel first.' };
  }

  const qualifiedFile = (target.library ? target.library + '/' : '') + target.file;
  const tempMember = 'ISDARFFD';
  const dspffdCmd = `DSPFFD FILE(${qualifiedFile}) OUTPUT(*OUTFILE) OUTFILE(QTEMP/${tempMember}) OUTMBR(*FIRST *REPLACE)`;
  let cmdResult: any;
  try {
    cmdResult = await vscode.commands.executeCommand('code-for-ibmi.runCommand', { command: dspffdCmd, environment: 'ile' });
  } catch (err) {
    return { error: `DSPFFD failed for ${qualifiedFile}: ${err}` };
  }
  if (cmdResult && typeof cmdResult.code === 'number' && cmdResult.code !== 0) {
    return { error: `DSPFFD failed for ${qualifiedFile}: ${cmdResult.stderr || cmdResult.stdout || 'unknown error'}` };
  }

  const escapedField = target.fieldName.toUpperCase().replace(/'/g, "''");
  const sql = `SELECT WHFLDT, WHFLDB, WHFLDD, WHFLDP FROM QTEMP.${tempMember} WHERE WHFLDI = '${escapedField}' FETCH FIRST 1 ROW ONLY`;
  let rows: any[];
  try {
    rows = await connection.runSQL(sql);
  } catch (err) {
    return { error: `Could not read field metadata for "${target.fieldName}" in ${qualifiedFile}: ${err}` };
  }
  if (!rows || rows.length === 0) {
    return { error: `Field "${target.fieldName}" was not found in ${qualifiedFile}.` };
  }

  return mapDspffdRowToAttributes(rows[0]);
}

/**
 * One field's metadata as listed from a database file - Task L14's own
 * result shape, a superset of ReferencedFieldAttributes (adds the field's
 * own name and description text, since unlike fetchReferencedFieldAttributes
 * this isn't looking up ONE already-known name, it's discovering every
 * field a file has).
 */
type DatabaseFileField = ReferencedFieldAttributes & { name: string; text: string };

/**
 * Task L14 - "Add fields from database file". Lists EVERY field in a PF/LF
 * (not just one already-named field, unlike fetchReferencedFieldAttributes
 * above, which this otherwise mirrors closely - same DSPFFD OUTFILE
 * approach, same activation handling, same attribute mapping via
 * mapDspffdRowToAttributes). WHFLDO is DSPFFD's own field-ORDER column, so
 * results come back in the file's own natural field order, matching what
 * you'd see paging through the file's fields in real SDA's own F10
 * (Database) picker rather than some arbitrary SQL ordering - but WHFLDO
 * only orders correctly WITHIN one record format (a multi-format logical
 * file has its own separate 1-based WHFLDO sequence PER format), so a
 * SPECIFIC format must be selected first if the file has more than one -
 * see the `recordFormat` parameter and its own reasoning below.
 *
 * `recordFormat` is optional. When omitted and the file turns out to have
 * only one format (by far the common case - most files a REFFLD points to
 * are physical files, which structurally can only ever have one), nothing
 * changes from before this scoping existed. When omitted and the file has
 * MULTIPLE formats, returns `{ formats: [...] }` instead of `{ fields }` -
 * an explicit "pick one" response - rather than silently mixing fields
 * from every format together (which would misorder WHFLDO across formats)
 * or silently guessing the first one (which could pick the WRONG format
 * for what the person actually wanted, with no indication anything was
 * even ambiguous).
 */
async function fetchDatabaseFileFields(
  library: string | null,
  file: string,
  recordFormat?: string
): Promise<{ fields: DatabaseFileField[]; recordFormat: string } | { formats: string[] } | { error: string }> {
  const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
  if (!ext) {
    return { error: 'Add fields from database file requires the Code for IBM i extension (halcyontechltd.code-for-ibmi), installed and connected.' };
  }
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      // fall through - exports may still be usable, or the getConnection() check below will catch it
    }
  }
  const instance: any = ext.exports && ext.exports.instance;
  const connection = instance && typeof instance.getConnection === 'function' ? instance.getConnection() : undefined;
  if (!connection) {
    return { error: 'Not connected to an IBM i - connect via the Code for IBM i panel first.' };
  }

  const qualifiedFile = (library ? library + '/' : '') + file;
  const tempMember = 'ISDADBFF';
  const dspffdCmd = `DSPFFD FILE(${qualifiedFile}) OUTPUT(*OUTFILE) OUTFILE(QTEMP/${tempMember}) OUTMBR(*FIRST *REPLACE)`;
  let cmdResult: any;
  try {
    cmdResult = await vscode.commands.executeCommand('code-for-ibmi.runCommand', { command: dspffdCmd, environment: 'ile' });
  } catch (err) {
    return { error: `DSPFFD failed for ${qualifiedFile}: ${err}` };
  }
  if (cmdResult && typeof cmdResult.code === 'number' && cmdResult.code !== 0) {
    return { error: `DSPFFD failed for ${qualifiedFile}: ${cmdResult.stderr || cmdResult.stdout || 'unknown error'}` };
  }

  // WHNAME is DSPFFD's own record-format-name column (confirmed against a
  // published DSPFFD-outfile reader program's own field list - it reads
  // WHNAME per row and compares it to the previous row's to detect a
  // format change, exactly the "group by format" this function itself
  // needs to do next).
  const sql = recordFormat
    ? `SELECT WHFLDI, WHFTXT, WHFLDT, WHFLDB, WHFLDD, WHFLDP FROM QTEMP.${tempMember} WHERE WHNAME = '${recordFormat.toUpperCase().replace(/'/g, "''")}' ORDER BY WHFLDO`
    : `SELECT WHNAME, WHFLDI, WHFTXT, WHFLDT, WHFLDB, WHFLDD, WHFLDP FROM QTEMP.${tempMember} ORDER BY WHNAME, WHFLDO`;
  let rows: any[];
  try {
    rows = await connection.runSQL(sql);
  } catch (err) {
    return { error: `Could not read field list for ${qualifiedFile}: ${err}` };
  }
  if (!rows || rows.length === 0) {
    return recordFormat
      ? { error: `Record format "${recordFormat}" was not found in ${qualifiedFile}.` }
      : { error: `${qualifiedFile} has no fields, or wasn't found.` };
  }

  const rowValue = (row: any, key: string) => (row[key] !== undefined ? row[key] : row[key.toLowerCase()]);

  if (!recordFormat) {
    const distinctFormats = Array.from(new Set(rows.map((row) => String(rowValue(row, 'WHNAME') || '').trim())));
    if (distinctFormats.length > 1) {
      return { formats: distinctFormats };
    }
  }

  const fields: DatabaseFileField[] = rows.map((row) => ({
    name: String(rowValue(row, 'WHFLDI') || '').trim(),
    text: String(rowValue(row, 'WHFTXT') || '').trim(),
    ...mapDspffdRowToAttributes(row),
  }));
  return { fields, recordFormat: recordFormat || String(rowValue(rows[0], 'WHNAME') || '').trim() };
}



/**
 * Handles a 'resolveReferencedField'/'resolveAllReferencedFields' message
 * from either designer's webview: re-parses the CURRENT document (not
 * whatever model the webview last had - a network round-trip means the
 * document could have changed underneath this by the time results come
 * back), resolves each target field's real attributes over Code for i, and
 * applies every successful one as a single WorkspaceEdit. Re-parses again
 * after EACH field when resolving several at once, same "never trust a
 * stale sourceLine after an edit" discipline the webview's own multi-step
 * edits (e.g. menu option swap) already follow - one field's edit can never
 * change how many lines an unrelated field spans (only its own positional
 * columns), but re-parsing defensively costs little and rules that out for
 * good rather than relying on that invariant staying true forever.
 */
async function handleResolveReferencedField(document: vscode.TextDocument, msg: { type: string; recordName: string; fieldSourceLine?: number }): Promise<void> {
  const initialModel = parseDspf(document.getText());
  const initialRecord = initialModel.records.find((r) => r.name === msg.recordName);
  if (!initialRecord) {
    vscode.window.showErrorMessage('iSDA: record not found.');
    return;
  }

  const targetFieldNames: string[] =
    msg.type === 'resolveAllReferencedFields'
      ? initialRecord.fields.filter((f: any) => f.isReference).map((f: any) => f.name)
      : initialRecord.fields.filter((f: any) => f.sourceLine === msg.fieldSourceLine).map((f: any) => f.name);

  if (targetFieldNames.length === 0) {
    vscode.window.showInformationMessage('iSDA: no reference fields (position 29 "R") to resolve on this record.');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'iSDA: Resolving referenced field(s) via Code for IBM i' },
    async (progress) => {
      let text = document.getText();
      let currentModel = parseDspf(text);
      const failures: string[] = [];
      let resolvedCount = 0;

      for (const fieldName of targetFieldNames) {
        const rec = currentModel.records.find((r) => r.name === msg.recordName);
        const field = rec && rec.fields.find((f: any) => f.name === fieldName);
        const target = field ? DspfEngine.resolveReferenceTarget(currentModel, rec, field) : null;
        if (!field || !target) {
          failures.push(`${fieldName || '(field)'}: no REF/REFFLD file to resolve against.`);
          continue;
        }

        progress.report({ message: `${target.fieldName} from ${target.library ? target.library + '/' : ''}${target.file}...` });
        const outcome = await fetchReferencedFieldAttributes(target);
        if ('error' in outcome) {
          failures.push(`${fieldName}: ${outcome.error}`);
          continue;
        }

        let lines = text.split(/\r\n|\r|\n/);
        lines = DspfWriter.applyFieldUpdate(field, lines, {
          length: outcome.length,
          dataType: outcome.dataType,
          decimalPositions: outcome.decimalPositions,
        });
        text = lines.join('\n');
        currentModel = parseDspf(text);
        resolvedCount++;
      }

      if (resolvedCount > 0) {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, text);
        // Deliberately NOT wrapped in the 'applyingFromWebview' suppression flag the
        // 'applyEdit' message handler below uses: this edit originates from the HOST
        // (a button click plus an async network round-trip), and the webview needs
        // the resolved attributes pushed back to it via the normal onDidChangeTextDocument
        // -> 'externalUpdate' path, not silently swallowed like a webview-originated edit.
        await vscode.workspace.applyEdit(edit);
      }

      if (failures.length > 0) {
        vscode.window.showErrorMessage('iSDA: ' + failures.join(' | '));
      } else if (resolvedCount > 0) {
        vscode.window.showInformationMessage(`iSDA: Resolved ${resolvedCount} referenced field${resolvedCount === 1 ? '' : 's'}.`);
      }
    }
  );
}

/**
 * Task L14 - handles the 'listDatabaseFields' request from the DSPF
 * designer's webview: a pure read-only lookup (no document edits, so no
 * re-parse/model juggling needed here), just fetches the field list and
 * posts it straight back for the webview's own picker to render. `msg`
 * carries an optional `recordFormat` (blank/absent means "auto-detect" -
 * see fetchDatabaseFileFields' own doc comment for what happens for a
 * multi-format file when it's omitted).
 */
async function handleListDatabaseFields(
  webview: vscode.Webview,
  msg: { library: string | null; file: string; recordFormat?: string }
): Promise<void> {
  const outcome = await fetchDatabaseFileFields(msg.library, msg.file, msg.recordFormat);
  if ('error' in outcome) {
    webview.postMessage({ type: 'databaseFieldsResult', error: outcome.error });
  } else if ('formats' in outcome) {
    webview.postMessage({ type: 'databaseFieldsResult', library: msg.library, file: msg.file, formats: outcome.formats });
  } else {
    webview.postMessage({ type: 'databaseFieldsResult', library: msg.library, file: msg.file, recordFormat: outcome.recordFormat, fields: outcome.fields });
  }
}

/**
 * Task L14 - handles the 'addFieldsFromDatabase' commit: creates one new
 * REFFLD-based field per selected database field, stacked one screen-row
 * below the previous (starting one row below the record's own current last
 * field, or its header line if it has none yet), same fixed column for all
 * of them - a starting point, not a final layout; each is individually
 * draggable/editable afterward like any other field, same framing Task
 * L14's own plan-doc row uses. `fields` already carries every attribute
 * (length/dataType/decimalPositions/text) from the 'listDatabaseFields'
 * round-trip the webview's picker already displayed - reusing that instead
 * of re-querying DSPFFD a second time here, since it's the exact same data
 * the person already saw and picked from a moment ago.
 *
 * Re-parses the model after EACH field is inserted, same "never trust a
 * stale record/field reference after an edit" discipline
 * handleResolveReferencedField above already follows - inserting one field
 * shifts every subsequent source line number, so nextAvailableFieldName's
 * own collision check (and the running "next free screen line" count) both
 * need the freshly-reparsed record, not the one from before this field's
 * own insert.
 */
async function handleAddFieldsFromDatabase(
  document: vscode.TextDocument,
  msg: {
    recordName: string;
    library: string | null;
    file: string;
    fields: Array<{ name: string; length: number; dataType: string; decimalPositions: number | null; text: string }>;
  }
): Promise<void> {
  const initialModel = parseDspf(document.getText());
  const initialRecord = initialModel.records.find((r) => r.name === msg.recordName);
  if (!initialRecord) {
    vscode.window.showErrorMessage('iSDA: record not found.');
    return;
  }
  if (!msg.fields || msg.fields.length === 0) {
    vscode.window.showInformationMessage('iSDA: no fields were selected.');
    return;
  }

  let text = document.getText();
  let currentModel = parseDspf(text);
  // Screen row to place the NEXT field at - starts one row below whichever
  // row is currently lowest among the record's own existing fields (or row
  // 1 if it has none yet), then increments by 1 for each field this call
  // adds, so the whole batch stacks down the screen one row per field
  // rather than landing on top of each other.
  let nextLine = 1;
  (initialRecord.fields || []).forEach((f: any) => {
    if (f.location && typeof f.location.line === 'number' && f.location.line >= nextLine) nextLine = f.location.line + 1;
  });
  const PLACEMENT_COLUMN = 2;

  for (const dbField of msg.fields) {
    const rec = currentModel.records.find((r: any) => r.name === msg.recordName);
    if (!rec) break;
    const fieldName = DspfWriter.nextAvailableFieldName(rec, dbField.name);
    const qualifiedFile = (msg.library ? msg.library + '/' : '') + msg.file;
    const reffldParams = dbField.name.toUpperCase() + ' ' + qualifiedFile;

    const lines = text.split(/\r\n|\r|\n/);
    const newLines = DspfWriter.insertField(rec, lines, {
      nameType: 'FIELD',
      name: fieldName,
      length: dbField.length,
      dataType: dbField.dataType,
      decimalPositions: dbField.decimalPositions,
      usage: 'B',
      isReference: true,
      location: { line: nextLine, column: PLACEMENT_COLUMN },
      keywords: [{ name: 'REFFLD', parameters: reffldParams }],
    });
    text = newLines.join('\n');
    currentModel = parseDspf(text);
    nextLine++;
  }

  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, text);
  // Same reasoning as handleResolveReferencedField's own apply-edit above:
  // this originates from the HOST (a button click plus a network
  // round-trip), not the webview's own 'applyEdit' message path, so it's
  // deliberately NOT wrapped in the applyingFromWebview suppression flag -
  // the webview needs the new fields pushed back to it via the normal
  // onDidChangeTextDocument -> 'externalUpdate' path.
  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(`iSDA: Added ${msg.fields.length} field${msg.fields.length === 1 ? '' : 's'} from ${msg.library ? msg.library + '/' : ''}${msg.file}.`);
}

/**
 * Handles a 'saveDocument' message from either designer's own left-panel
 * "Save" button. Every edit already lands in the document's live buffer
 * via 'applyEdit' (a WorkspaceEdit), which marks it dirty the same as
 * typing would - but nothing was actually WRITING that buffer to disk
 * until now; the only place document.save() was ever called was as a
 * side effect of "Compile", which needs the on-disk copy since a compile
 * command reads the SAVED member, not this editor's live buffer (see
 * compileDspf/compileMenu's own comments for that same reasoning). A
 * dedicated Save button doesn't need that "compile reads from disk"
 * justification - it exists simply because relying on VS Code's own
 * Ctrl+S (or Auto Save) isn't obvious from inside a webview panel, which
 * doesn't show the tab's own dirty-dot the way a normal text editor does.
 * No-ops quietly if a document is already clean (nothing to save) -
 * matches isDirty guards elsewhere in this file rather than calling
 * save() unconditionally. `companionDocument` covers the menu designer's
 * own MNUCMD companion (only passed when it's actually open, same as
 * compileMenu's own openCommandDoc handling above) - the button saves
 * BOTH documents together, same scope "Compile" already saves before it
 * reads from disk.
 */
async function handleSaveDocument(document: vscode.TextDocument, companionDocument?: vscode.TextDocument): Promise<void> {
  if (document.isDirty) {
    await document.save();
  }
  if (companionDocument && companionDocument.isDirty) {
    await companionDocument.save();
  }
}

/**
 * Suggestion C - pushes the Save button's own dirty-state indicator. The
 * button we just added has no visual signal for whether there's actually
 * anything TO save - this closes that gap. `docs` is every document the
 * button's own save covers (see handleSaveDocument above - one for the
 * DSPF designer, up to two for the menu designer's own MNUDDS+MNUCMD
 * pair) - dirty if ANY of them is.
 */
function postDirtyState(webview: vscode.Webview, ...docs: vscode.TextDocument[]): void {
  webview.postMessage({ type: 'dirtyState', isDirty: docs.some((d) => d.isDirty) });
}

function openDesigner(uri: vscode.Uri): void {
  void openInDesigner(uri, DspfDesignerEditorProvider.viewType);
}

/** Same as openDesigner() above, but for the menu designer's custom editor. */
function openMenuDesigner(uri: vscode.Uri): void {
  void openInDesigner(uri, MenuDesignerEditorProvider.viewType);
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

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): void {
    webviewPanel.webview.options = { enableScripts: true };

    const nonce = getNonce();
    const fileName = document.fileName.split(/[\\/]/).pop() || '';
    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview.cspSource, nonce, document.getText(), fileName, getUiStyle(this.context), getUiTheme(this.context));

    // Scoped per editor instance (resolveCustomTextEditor runs once per opened tab),
    // same echo-suppression pattern as before: ignore the onDidChangeTextDocument
    // event our OWN applyEdit call below produces, so we don't immediately re-push
    // the just-applied text back into the webview as if it were an external change.
    let applyingFromWebview = false;

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      // Dirty-state push (Suggestion C) happens regardless of applyingFromWebview
      // below - our OWN applyEdit calls mark the document dirty exactly the same
      // way a real edit would, so the Save button's own indicator needs to know
      // about it too, not just externally-originated changes.
      postDirtyState(webviewPanel.webview, e.document);
      if (applyingFromWebview) return;
      webviewPanel.webview.postMessage({ type: 'externalUpdate', text: e.document.getText() });
    });
    // Catches the "just saved, now clean" transition - onDidChangeTextDocument
    // alone doesn't fire on save (no text changes), so without this the Save
    // button's indicator would keep showing dirty after a successful save,
    // whether via this panel's own Save button or VS Code's native Ctrl+S.
    const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString()) return;
      postDirtyState(webviewPanel.webview, saved);
    });
    // Initial state - the document could already be dirty when the designer
    // opens (e.g. edited just before opening it here), so the button needs to
    // reflect that from the very first render, not just after the next edit.
    postDirtyState(webviewPanel.webview, document);

    // Task L18: pushes a fresh "IBM i: Connected/Not connected/Not
    // installed" status to the webview's badge. Called on 'ready' (so the
    // badge is populated immediately, before the person clicks anything
    // that needs a connection), right after every Code-for-i-dependent
    // action below (so a just-established or just-dropped connection is
    // reflected without waiting for the next poll), on a cheap poll while
    // the panel is open (catches a connection made/lost from OUTSIDE this
    // panel - e.g. Code for i's own connection tree), and on
    // vscode.extensions.onDidChange (catches Code for i being installed or
    // uninstalled while this panel is already open).
    const sendCodeForIStatus = async () => {
      const status = await getCodeForIStatus();
      webviewPanel.webview.postMessage({ type: 'codeForIStatus', installed: status.installed, connected: status.connected });
    };
    const statusPollInterval = setInterval(() => { void sendCodeForIStatus(); }, 10000);
    const extChangeSub = vscode.extensions.onDidChange(() => { void sendCodeForIStatus(); });

    // Task L38: pushes the global modification-tracking defaults to the
    // webview - once up front (on 'ready', same timing sendCodeForIStatus
    // uses) and again whenever either setting changes while this panel is
    // still open, so a settings.json edit made mid-session is reflected
    // without needing to reopen the designer. The webview's own session
    // state (checkbox/tag box) only reads this as a STARTING value - see
    // getModTrackingConfig's own doc comment.
    const sendModTrackingConfig = () => {
      const cfg = getModTrackingConfig();
      webviewPanel.webview.postMessage({ type: 'modTrackingConfig', enabled: cfg.enabled, tag: cfg.tag });
    };
    const modTrackingConfigSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('isda.trackSourceModifications') || e.affectsConfiguration('isda.modificationTag')) {
        sendModTrackingConfig();
      }
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
      } else if (msg.type === 'resolveReferencedField' || msg.type === 'resolveAllReferencedFields') {
        await handleResolveReferencedField(document, msg);
        await sendCodeForIStatus();
      } else if (msg.type === 'listDatabaseFields') {
        await handleListDatabaseFields(webviewPanel.webview, msg);
        await sendCodeForIStatus();
      } else if (msg.type === 'addFieldsFromDatabase') {
        await handleAddFieldsFromDatabase(document, msg);
        await sendCodeForIStatus();
      } else if (msg.type === 'compileDspf') {
        await compileDspf(document.uri);
        await sendCodeForIStatus();
      } else if (msg.type === 'saveDocument') {
        await handleSaveDocument(document);
      } else if (msg.type === 'setUiStyle') {
        await this.context.globalState.update(UI_STYLE_KEY, msg.value);
      } else if (msg.type === 'setUiTheme') {
        await this.context.globalState.update(UI_THEME_KEY, msg.value);
      } else if (msg.type === 'ready') {
        await sendCodeForIStatus();
        sendModTrackingConfig();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      saveSub.dispose();
      messageSub.dispose();
      clearInterval(statusPollInterval);
      extChangeSub.dispose();
      modTrackingConfigSub.dispose();
    });
  }
}

/**
 * CustomTextEditorProvider for the menu designer. The MNUDDS document itself
 * follows the exact same single-source-of-truth / WorkspaceEdit pattern as
 * DspfDesignerEditorProvider (it IS a DSPF, reusing the same parser/engine in
 * the webview - see menuWebviewTemplate.ts). The companion MNUCMD member is
 * different: it's a *separate* document that usually isn't open in any
 * editor, so this writes to it directly via vscode.workspace.fs by default -
 * the same approach createNewDspf() below already uses to create a brand-new
 * file - EXCEPT when that member happens to already be open in its own
 * editor tab, in which case it's edited via WorkspaceEdit against that
 * document instead (keeping its buffer, dirty-dot, and undo stack correct),
 * and external edits to it are echoed back into the options panel the same
 * way external edits to the MNUDDS document already are. What's still not
 * handled: reconciling the companion member being open in a *second* menu
 * designer at the same time (two designer instances racing to write it) -
 * a genuinely rarer case than "someone has the plain text member open",
 * left for later.
 */
class MenuDesignerEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'dspfDesigner.menuEditor';

  constructor(private readonly context: vscode.ExtensionContext) {}

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
      commandStatus,
      getUiStyle(this.context),
      getUiTheme(this.context)
    );

    // Same echo-suppression pattern as DspfDesignerEditorProvider, scoped to this
    // editor instance's own applyEdit calls against the MNUDDS document.
    let applyingFromWebview = false;
    // Same idea, scoped to our own writes to the companion MNUCMD document -
    // only meaningful when that document is actually open (see below).
    let applyingCommandFromWebview = false;

    // Suggestion C - the Save button covers BOTH documents for the menu
    // designer (see handleSaveDocument's own doc comment), so its dirty
    // indicator needs to reflect BOTH too - dirty if either is. The
    // companion document only has meaningful isDirty/save semantics while
    // it's actually open in some editor (same "only meaningful when open"
    // scoping commandChangeSub below already uses) - vscode.workspace.
    // textDocuments is searched fresh each call rather than cached, since
    // whether it's open can change over this panel's own lifetime.
    function pushMenuDirtyState(): void {
      const openCommandDoc = commandUri ? vscode.workspace.textDocuments.find((d) => d.uri.toString() === commandUri!.toString()) : undefined;
      postDirtyState(webviewPanel.webview, document, ...(openCommandDoc ? [openCommandDoc] : []));
    }

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      pushMenuDirtyState();
      if (applyingFromWebview) return;
      webviewPanel.webview.postMessage({ type: 'externalUpdate', text: e.document.getText() });
    });

    // If someone edits the companion MNUCMD member directly (its own editor
    // tab, another extension, etc.) while this menu designer is open, reflect
    // that back into the options panel - the same "stay in sync with the real
    // document" contract the MNUDDS side already has via changeSub above.
    const commandChangeSub = commandUri
      ? vscode.workspace.onDidChangeTextDocument((e) => {
          if (!commandUri || e.document.uri.toString() !== commandUri.toString()) return;
          pushMenuDirtyState();
          if (applyingCommandFromWebview) return;
          webviewPanel.webview.postMessage({ type: 'externalCommandUpdate', text: e.document.getText() });
        })
      : undefined;

    // Task L18: same badge-status pattern as DspfDesignerEditorProvider -
    // Compile Menu (CRTMNU) is this designer's own Code-for-i-dependent
    // action, so the same reasoning applies (upfront visibility beats
    // finding out via a failed compile).
    const sendCodeForIStatus = async () => {
      const status = await getCodeForIStatus();
      webviewPanel.webview.postMessage({ type: 'codeForIStatus', installed: status.installed, connected: status.connected });
    };
    const statusPollInterval = setInterval(() => { void sendCodeForIStatus(); }, 10000);
    const extChangeSub = vscode.extensions.onDidChange(() => { void sendCodeForIStatus(); });

    // Same "just saved, now clean" transition as the DSPF designer's own
    // saveSub - covers both documents, since either one being saved
    // (independently - e.g. someone Ctrl+S's just the MNUCMD tab) should
    // update the SAME combined indicator.
    const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString() && (!commandUri || saved.uri.toString() !== commandUri.toString())) return;
      pushMenuDirtyState();
    });
    pushMenuDirtyState();


    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'applyEdit') {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, msg.text);
        applyingFromWebview = true;
        await vscode.workspace.applyEdit(edit);
        applyingFromWebview = false;
      } else if (msg.type === 'applyMenuCmdOptionEdit') {
        // Task M4 - concurrency-safe companion-file writes. The webview no
        // longer computes the full new command source itself (which would
        // mean applying its own edit against a commandText/cmdModel copy
        // that was only ever fresh at resolveCustomTextEditor() time,
        // possibly minutes ago) - it sends the structured edit(s) instead
        // (`{ numberValue, command }[]` - a delete/single-option-change
        // sends one, a swap sends two, applied together as one write so a
        // reader never observes a half-swapped intermediate state), and
        // THIS handler always re-reads the current base text immediately
        // before applying, right here, every time. That's what actually
        // closes the race: a second menu designer instance (a different
        // VS Code window/session, or a Code for i member editor, open on
        // the SAME menu's companion member) may have written a newer
        // version since this webview's own commandSource was captured: the
        // fresh read means an edit to option 3 from over here can no
        // longer clobber an edit to option 7 that landed over there in the
        // meantime - each write starts from whatever is actually on disk
        // (or in the open document's live buffer, if it's open) right now.
        // A genuinely concurrent edit to the EXACT SAME option is still
        // last-write-wins (no CRDT/OT here), which is an acceptable,
        // inherent limit for a plain-text companion file - the data-loss
        // risk this task called out was UNRELATED edits stomping each
        // other, and that's what this fixes.
        if (!commandUri) {
          vscode.window.showErrorMessage(
            'iSDA: this menu was not opened from an IBM i source member, so there is nowhere to save option-to-command mappings.'
          );
          return;
        }
        const openCommandDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === commandUri!.toString());
        let baseText: string;
        if (openCommandDoc) {
          baseText = openCommandDoc.getText();
        } else {
          try {
            const bytes = await vscode.workspace.fs.readFile(commandUri);
            baseText = Buffer.from(bytes).toString('utf8');
          } catch {
            baseText = ''; // no companion member yet - this edit creates it, same as before
          }
        }
        let newText = baseText;
        for (const oneEdit of msg.edits as { numberValue: number; command: string }[]) {
          newText = MnuCmdEngine.applyOptionCommand(newText, oneEdit.numberValue, oneEdit.command);
        }
        try {
          if (openCommandDoc) {
            const fullRange = new vscode.Range(openCommandDoc.positionAt(0), openCommandDoc.positionAt(openCommandDoc.getText().length));
            const edit = new vscode.WorkspaceEdit();
            edit.replace(openCommandDoc.uri, fullRange, newText);
            applyingCommandFromWebview = true;
            await vscode.workspace.applyEdit(edit);
            applyingCommandFromWebview = false;
          } else {
            await vscode.workspace.fs.writeFile(commandUri, Buffer.from(newText, 'utf8'));
          }
          // applyingCommandFromWebview (open-doc path) and the plain
          // writeFile path (no listener at all) both mean THIS webview
          // never gets its own write echoed back via commandChangeSub - so
          // tell it directly what the new merged truth is, both to keep
          // its own commandText/cmdModel from drifting stale after its own
          // edit, and so the NEXT edit from this same webview (before any
          // further external change) still starts from accurate data even
          // though the fresh-read above is what actually guarantees safety.
          webviewPanel.webview.postMessage({ type: 'menuCmdSaved', text: newText });
        } catch (err) {
          vscode.window.showErrorMessage(`iSDA: failed to save menu commands to ${commandUri.path}: ${err}`);
        }
      } else if (msg.type === 'compileMenu') {
        await compileMenu(document.uri);
        await sendCodeForIStatus();
      } else if (msg.type === 'saveDocument') {
        const openCommandDocForSave = commandUri ? vscode.workspace.textDocuments.find((d) => d.uri.toString() === commandUri!.toString()) : undefined;
        await handleSaveDocument(document, openCommandDocForSave);
      } else if (msg.type === 'error') {
        vscode.window.showErrorMessage('iSDA: ' + msg.message);
      } else if (msg.type === 'setUiStyle') {
        await this.context.globalState.update(UI_STYLE_KEY, msg.value);
      } else if (msg.type === 'setUiTheme') {
        await this.context.globalState.update(UI_THEME_KEY, msg.value);
      } else if (msg.type === 'ready') {
        await sendCodeForIStatus();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      commandChangeSub?.dispose();
      saveSub.dispose();
      messageSub.dispose();
      clearInterval(statusPollInterval);
      extChangeSub.dispose();
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

/** Fallback boilerplate for the plain 'RECORD' type (and buildTypedBoilerplateDspf's
 *  own defensive fallback below) - a title constant plus one sample output field,
 *  hand-built via buildDdsLine since there's no companion record or hidden fields
 *  to worry about for this type. */
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

/** Auto-generates a companion record name at CREATE time by appending
 *  `suffix`, truncating the main name to leave room within DDS's 10-char
 *  name limit, and falling back to a numbered variant on the vanishingly
 *  unlikely collision (e.g. a main name already ending in the same
 *  suffix after truncation). Shared by defaultSflctlName (SFL-family's
 *  SFLCTL companion) and buildTypedBoilerplateDspf's own MNUBAR-\>PULDWN
 *  companion below. */
function deriveCompanionName(mainName: string, suffix: string): string {
  const room = Math.max(1, 10 - suffix.length);
  const base = mainName.length > room ? mainName.slice(0, room) : mainName;
  const candidate = (base + suffix).slice(0, 10);
  if (candidate !== mainName) return candidate;
  const shorterRoom = Math.max(1, room - 1);
  return (base.slice(0, shorterRoom) + suffix + '2').slice(0, 10);
}

/** Auto-generates the SFLCTL companion record name for an SFL-family type
 *  at CREATE time, rather than prompting for it (unlike the in-designer "+
 *  Add record" wizard, which always asks) - "Create New Display File" stays
 *  a fast, few-question start; the name can be changed afterward in the
 *  designer like any other record. */
function defaultSflctlName(mainName: string): string {
  return deriveCompanionName(mainName, 'CTL');
}

/** Plain keyword-object literal shape every DspfWriter insert* function
 *  expects (same shape WebviewClientHelpers.buildTypedRecordPlan's own
 *  internal `kw` closure builds) - a bare valueless keyword when
 *  `parameters` is ''. */
function kw(name: string, parameters: string): any {
  return { name, parameters, conditions: [], raw: '', sourceLines: [] };
}

/** A single-choice pulldown/menu-bar-dropdown field: SNGCHCFLD plus three
 *  sample CHOICE(id 'text') entries ('New'/'Open'/'Save', the same
 *  placeholder trio a blank Windows-style File menu would show) - the
 *  real, functioning content a PULDWN record's own field needs (matching
 *  the CHOICE(id 'text')/SNGCHCFLD shape already verified elsewhere in
 *  this codebase - see dspfEngine.js's parseChoiceParams), not just a
 *  bare keyword with nothing to look at. `name` lets the MNUBAR case
 *  below and the standalone PULDWN case share this without a field-name
 *  collision when both exist in the same file. */
function sampleChoiceField(name: string, line: number): any {
  return {
    nameType: 'FIELD',
    name,
    length: 2,
    dataType: 'Y',
    decimalPositions: 0,
    usage: 'B',
    location: { line, column: 2 },
    keywords: [kw('SNGCHCFLD', ''), kw('CHOICE', "1 'New'"), kw('CHOICE', "2 'Open'"), kw('CHOICE', "3 'Save'")],
  };
}

/** Builds starter DDS source for a brand-new display file whose primary record
 *  is one of WebviewClientHelpers.RECORD_TYPES - reusing buildTypedRecordPlan,
 *  the exact same keywords/companion-record/hidden-fields decision table the
 *  in-designer "+ Add record" wizard uses, so the two entry points can't
 *  silently drift into different starter DDS for the same *structural*
 *  shape (SFLCTL companion, SFLMSG's hidden fields, etc.). On top of that
 *  shared foundation, this function adds a fuller, type-specific WORKED
 *  EXAMPLE - deliberately NOT pushed into buildTypedRecordPlan itself,
 *  since that table is shared with the in-designer "+ Add record" wizard
 *  (adding a record to a screen that already has content), where a full
 *  illustrative example would be unwanted clutter; a brand-new, otherwise
 *  empty display file benefits from one:
 *   - RECORD/USRDFN/WINDOW: title constant + one sample output field
 *     (unchanged from the original plain boilerplate).
 *   - SFL/SFLMSG/WDWSFL/PDNSFL: the SFLCTL companion gets the keyword set
 *     an SFL-family record actually needs to DISPLAY anything at runtime
 *     (`SFLSIZ`/`SFLPAG`/`SFLDSP`/`SFLDSPCTL`/`SFLCLR` - the in-designer
 *     wizard leaves these for the user to add via the SFLCTL picker's own
 *     panels, appropriate there since it's editing an already-considered
 *     screen; a brand-new file gets a subfile that actually WORKS out of
 *     the box) plus a title and "Opt"/"Description" column headers
 *     (skipped for SFLMSG, which has no user-defined columns); the detail
 *     record gets a numbered `OPTN` option field ahead of the sample
 *     output field, the standard SDA 1=Select/2=Change/4=Delete
 *     convention's own field (skipped entirely for SFLMSG, which needs no
 *     visible field beyond its two hidden ones - the message text itself
 *     is drawn by the system via `SFLMSGRCD`).
 *   - PULDWN: a real `SNGCHCFLD`/`CHOICE` selection field (sampleChoiceField)
 *     in place of the generic title+field - a title constant doesn't
 *     serve a standalone dropdown the way it does a full screen.
 *   - MNUBAR: keeps its title constant, but replaces the generic sample
 *     field with one real `MNUBARCHC` choice field wired to a NEW,
 *     auto-created PULDWN companion record (deriveCompanionName, 'P1'
 *     suffix) - inserted alongside it in this same call, itself carrying
 *     the same sampleChoiceField content as the standalone PULDWN case -
 *     so opening the designer shows an actual working "File" menu-bar
 *     item with a dropdown under it, not just a bare unwired keyword.
 *     This wiring is Create-New-Display-File-only, same reasoning as
 *     above: the in-designer wizard's own MNUBAR/PULDWN entries in
 *     RECORD_TYPES stay independently created, matching real SDA. */
function buildTypedBoilerplateDspf(recordName: string, titleText: string, type: string): string {
  let sourceLines = [
    buildDdsLine({ seq: '00010', comment: ' Generated by iSDA - Interactive Screen Design Aid' }),
    buildDdsLine({ seq: '00020', func: 'DSPSIZ(24 80 *DS3)' }),
  ];
  const baseModel = parseDspf(sourceLines.join('\n') + '\n');

  const sflFamily = WebviewClientHelpers.isSflFamilyRecordType(type);
  const sflctlName = sflFamily ? defaultSflctlName(recordName) : null;
  const sflmsgOpts = type === 'SFLMSG' ? { line: 24, keyName: 'MSGKEY', queueName: 'PGMQ', use276: false } : null;
  const plan = WebviewClientHelpers.buildTypedRecordPlan(type, recordName, sflctlName, null, sflmsgOpts);
  if (!plan) {
    // Shouldn't happen - sflctlName is always supplied above whenever the
    // type needs one - but a plain record is a safe, always-valid fallback
    // rather than throwing.
    return buildBoilerplateDspf(recordName, titleText);
  }

  // The SFLCTL companion's keyword set gets the "actually displays at
  // runtime" additions here (SFLSIZ/SFLPAG/SFLDSP/SFLDSPCTL/SFLCLR) -
  // appended to plan.dependent's own keywords rather than folded into
  // buildTypedRecordPlan itself, since that table is shared with the
  // in-designer wizard (see this function's own header comment for why).
  const dependent = plan.dependent
    ? { name: plan.dependent.name, keywords: plan.dependent.keywords.concat([kw('SFLSIZ', '0011'), kw('SFLPAG', '0010'), kw('SFLDSP', ''), kw('SFLDSPCTL', ''), kw('SFLCLR', '')]) }
    : null;

  sourceLines = dependent
    ? DspfWriter.insertTypedRecordWithDependent(baseModel, sourceLines, { name: recordName, keywords: plan.mainKeywords }, dependent)
    : DspfWriter.insertTypedRecord(baseModel, sourceLines, { name: recordName, keywords: plan.mainKeywords }, null);

  // SFLMSG's two hidden fields, one at a time with a reparse between each -
  // same reasoning as the in-designer wizard (buildWebviewTemplate.js): the
  // freshly created record doesn't exist in a stale model reference yet,
  // and skipping the reparse would place the second field back at the same
  // spot as the first.
  (plan.extraFields || []).forEach((spec) => {
    const midModel = parseDspf(sourceLines.join('\n') + '\n');
    const rec = midModel.records.find((r: any) => r.name === recordName);
    if (!rec) return;
    sourceLines = DspfWriter.insertField(rec, sourceLines, {
      nameType: 'FIELD',
      name: spec.name,
      location: { line: null, column: null },
      usage: spec.usage,
      keywords: spec.keywords,
    });
  });

  // PULDWN skips the generic title+field entirely in favor of a real
  // SNGCHCFLD/CHOICE selection field - a title constant doesn't serve a
  // standalone dropdown record the way it does a full screen.
  if (type === 'PULDWN') {
    const midModel = parseDspf(sourceLines.join('\n') + '\n');
    const rec = midModel.records.find((r: any) => r.name === recordName);
    if (rec) sourceLines = DspfWriter.insertField(rec, sourceLines, sampleChoiceField('PULOPT', 1));
    return sourceLines.join('\n') + '\n';
  }

  const titleRecordName = dependent ? dependent.name : recordName;
  let midModel = parseDspf(sourceLines.join('\n') + '\n');
  const titleRecord = midModel.records.find((r: any) => r.name === titleRecordName);
  if (titleRecord) {
    sourceLines = DspfWriter.insertField(titleRecord, sourceLines, {
      nameType: 'CONSTANT',
      constantValue: titleText,
      location: { line: 1, column: 2 },
      keywords: [kw('DSPATR', 'HI')],
    });
  }

  // SFL-family list types get "Opt"/"Description" column headers on the
  // control record (matching the OPTN/FIELD1 pair landed on the detail
  // record below) - skipped for SFLMSG, which has no user-defined columns
  // (the message text itself is drawn by the system via SFLMSGRCD).
  if (sflFamily && type !== 'SFLMSG' && titleRecord) {
    midModel = parseDspf(sourceLines.join('\n') + '\n');
    const ctlRecord = midModel.records.find((r: any) => r.name === titleRecordName);
    if (ctlRecord) {
      sourceLines = DspfWriter.insertField(ctlRecord, sourceLines, { nameType: 'CONSTANT', constantValue: 'Opt', location: { line: 3, column: 2 } });
      const afterOpt = parseDspf(sourceLines.join('\n') + '\n');
      const ctlRecord2 = afterOpt.records.find((r: any) => r.name === titleRecordName);
      if (ctlRecord2) sourceLines = DspfWriter.insertField(ctlRecord2, sourceLines, { nameType: 'CONSTANT', constantValue: 'Description', location: { line: 3, column: 8 } });
    }
  }

  // Sample content on the record the picked type is actually FOR: SFL-family
  // list types get a numbered OPTN option field (the standard SDA
  // 1=Select/2=Change/4=Delete convention's own field) ahead of a wider
  // FIELD1, matching a real subfile detail line - SFLMSG needs neither (no
  // visible field beyond its own two hidden ones). MNUBAR gets one real
  // MNUBARCHC choice field wired to a new PULDWN companion instead of the
  // generic field. Everything else keeps the original plain FIELD1.
  midModel = parseDspf(sourceLines.join('\n') + '\n');
  const mainRecord = midModel.records.find((r: any) => r.name === recordName);
  if (!mainRecord) return sourceLines.join('\n') + '\n';

  if (sflFamily && type === 'SFLMSG') {
    // Nothing further - the two hidden fields above are all this record needs.
  } else if (sflFamily) {
    sourceLines = DspfWriter.insertField(mainRecord, sourceLines, { nameType: 'FIELD', name: 'OPTN', length: 2, dataType: 'Y', decimalPositions: 0, usage: 'B', location: { line: 1, column: 2 } });
    const afterOptn = parseDspf(sourceLines.join('\n') + '\n');
    const detailRecord = afterOptn.records.find((r: any) => r.name === recordName);
    if (detailRecord) sourceLines = DspfWriter.insertField(detailRecord, sourceLines, { nameType: 'FIELD', name: 'FIELD1', length: 30, dataType: 'A', usage: 'O', location: { line: 1, column: 8 } });
  } else if (type === 'MNUBAR') {
    const pulldownName = deriveCompanionName(recordName, 'P1');
    sourceLines = DspfWriter.insertTypedRecord(parseDspf(sourceLines.join('\n') + '\n'), sourceLines, { name: pulldownName, keywords: [] }, null);
    const afterPulldown = parseDspf(sourceLines.join('\n') + '\n');
    const pulldownRecord = afterPulldown.records.find((r: any) => r.name === pulldownName);
    if (pulldownRecord) sourceLines = DspfWriter.insertField(pulldownRecord, sourceLines, sampleChoiceField('PULOPT', 1));
    const withPulldownField = parseDspf(sourceLines.join('\n') + '\n');
    const mnubarRecord = withPulldownField.records.find((r: any) => r.name === recordName);
    if (mnubarRecord) {
      sourceLines = DspfWriter.insertField(mnubarRecord, sourceLines, {
        nameType: 'FIELD',
        name: 'MNUFLD',
        length: 2,
        dataType: 'Y',
        decimalPositions: 0,
        usage: 'B',
        location: { line: 2, column: 2 },
        keywords: [kw('MNUBARCHC', "1 " + pulldownName + " 'File'")],
      });
    }
  } else {
    sourceLines = DspfWriter.insertField(mainRecord, sourceLines, {
      nameType: 'FIELD',
      name: 'FIELD1',
      length: 10,
      dataType: 'A',
      usage: 'O',
      location: { line: titleRecordName === recordName ? 3 : 1, column: 2 },
    });
  }

  return sourceLines.join('\n') + '\n';
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
  const codeForIBMi = await getConnectedCodeForIBMi();

  let destination: 'local' | 'remote' = 'local';
  if (codeForIBMi) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(folder) Local workspace', value: 'local' as const },
        { label: '$(server) Connected IBM i system', value: 'remote' as const, description: 'Adds a member via ADDPFM' },
      ],
      { placeHolder: 'Where should the new display file be created?' }
    );
    if (!choice) return;
    destination = choice.value;
  }

  const recordInfo = await promptForRecordInfo(destination === 'remote' ? 'SCREEN1' : 'SCREEN1');
  if (!recordInfo) return;
  const { source, baseName } = recordInfo;

  if (destination === 'remote') {
    await createRemoteMember(codeForIBMi!, baseName, source);
  } else {
    await createLocalFile(targetUri, baseName, source);
  }
}

/** Prompts for member/file name, record TYPE, record name, and title; returns
 *  the built, self-validated boilerplate source (parsed with our own parser
 *  before being handed back, so a boilerplate bug fails loudly here rather
 *  than shipping a broken starter file either locally or - worse - as a real
 *  member on the IBM i).
 *
 *  The record-type step reuses WebviewClientHelpers.RECORD_TYPES - the same
 *  9 real-SDA types the in-designer "+ Add record" wizard offers - so a new
 *  display file can start from a subfile, window, pull-down menu, etc.
 *  instead of always the plain basic-screen boilerplate. Deliberately stays
 *  a fast, few-question flow: SFL-family types auto-name their SFLCTL
 *  companion and SFLMSG takes the wizard's own defaults (line 24,
 *  MSGKEY/PGMQ fields, no 276-byte queue) rather than prompting for any of
 *  that up front - all of it can be changed afterward in the designer like
 *  any other record/field. */
async function promptForRecordInfo(defaultBaseName: string): Promise<{ baseName: string; source: string } | undefined> {
  const nameInput = await vscode.window.showInputBox({
    prompt: 'Display file / member name',
    placeHolder: defaultBaseName,
    value: defaultBaseName,
    validateInput: (value) => validateDdsName(value.trim().replace(/\.dspf$/i, '')),
  });
  if (!nameInput) return undefined;
  const baseName = nameInput.trim().replace(/\.dspf$/i, '').toUpperCase();

  const typeChoice = await vscode.window.showQuickPick(
    WebviewClientHelpers.RECORD_TYPES.map((t) => ({ label: t.label, value: t.value })),
    { placeHolder: 'Starting record type (same as the designer\u2019s "+ Add record" wizard - you can add more records afterward)' }
  );
  if (!typeChoice) return undefined;
  const type = typeChoice.value;

  const recordName = await vscode.window.showInputBox({
    prompt: 'Primary record format name',
    placeHolder: 'RECORD1',
    value: 'RECORD1',
    validateInput: validateDdsName,
  });
  if (!recordName) return undefined;

  const titleText = (await vscode.window.showInputBox({
    prompt: 'Screen title (shown as a constant on the first line)',
    placeHolder: baseName,
    value: baseName,
  })) ?? baseName;

  const source = buildTypedBoilerplateDspf(recordName.trim().toUpperCase(), titleText, type);

  const parsed = parseDspf(source);
  if (parsed.errors.length > 0) {
    vscode.window.showErrorMessage('iSDA: generated boilerplate failed to parse - not writing anything. This is a bug in iSDA itself, please report it.');
    return undefined;
  }

  return { baseName, source };
}

async function createLocalFile(targetUri: vscode.Uri | undefined, baseName: string, source: string): Promise<void> {
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

  const fileName = baseName + '.dspf';
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

// ---------------------------------------------------------------------
// Create New Menu
// ---------------------------------------------------------------------

/** Menu-shaped boilerplate: same DDS mechanics as buildBoilerplateDspf(), but
 *  with two numbered option constants instead of an input field, so the
 *  result satisfies isLikelyMenuFile()'s own "2+ numbered-option constants"
 *  heuristic the moment it's created (verified again in promptForMenuInfo()
 *  below rather than just assumed). recordName MUST equal the menu member
 *  name - CRTMNU's own requirement (see "Compile Menu" in README/CHANGELOG) -
 *  so unlike buildBoilerplateDspf() there's no separate record-name prompt. */
function buildBoilerplateMnu(recordName: string, titleText: string): string {
  const lines = [
    buildDdsLine({ seq: '00010', comment: ' Generated by iSDA - Interactive Screen Design Aid' }),
    buildDdsLine({ seq: '00020', func: 'DSPSIZ(24 80 *DS3)' }),
    buildDdsLine({ seq: '00030', nameType: 'R', name: recordName }),
    buildDdsLine({ seq: '00040', line: '1', col: '2', func: "'" + titleText.replace(/'/g, "''") + "'" }),
    buildDdsLine({ seq: '00050', func: 'DSPATR(HI)' }),
    buildDdsLine({ seq: '00060', line: '4', col: '5', func: "'1. Option 1'" }),
    buildDdsLine({ seq: '00070', line: '5', col: '5', func: "'2. Option 2'" }),
  ];
  return lines.join('\n') + '\n';
}

/** The companion MNUCMD member starts empty (just a header comment - a
 *  comment line round-trips fine through mnuCmdEngine.parseMnuCmd, see its
 *  own header) rather than pre-guessing commands for the two starter
 *  options: the menu designer already handles an empty/missing companion
 *  member gracefully (an option with no mapped command just shows "not
 *  correct" if selected, and Compile Menu warns rather than failing - see
 *  compileMenu() above), so there's nothing meaningful to fill in here
 *  without inventing a command the person didn't ask for. */
function buildBoilerplateMnuCmd(): string {
  return '* Generated by iSDA - Interactive Screen Design Aid\n';
}

/** Same self-validation discipline as promptForRecordInfo(): the built
 *  boilerplate is parsed with our own parser, AND checked against the same
 *  "2+ numbered-option constants" shape isLikelyMenuFile() looks for,
 *  before ever being handed back to write anywhere. */
async function promptForMenuInfo(defaultBaseName: string): Promise<{ baseName: string; source: string; commandSource: string } | undefined> {
  const nameInput = await vscode.window.showInputBox({
    prompt: 'Menu / member name (also the DDS record format name - CRTMNU requires them to match)',
    placeHolder: defaultBaseName,
    value: defaultBaseName,
    validateInput: (value) => validateDdsName(value.trim().replace(/\.mnudds$/i, '')),
  });
  if (!nameInput) return undefined;
  const baseName = nameInput.trim().replace(/\.mnudds$/i, '').toUpperCase();

  const titleText = (await vscode.window.showInputBox({
    prompt: 'Menu title (shown as a constant on the first line)',
    placeHolder: baseName,
    value: baseName,
  })) ?? baseName;

  const source = buildBoilerplateMnu(baseName, titleText);
  const commandSource = buildBoilerplateMnuCmd();

  const parsed = parseDspf(source);
  if (parsed.errors.length > 0) {
    vscode.window.showErrorMessage('iSDA: generated menu boilerplate failed to parse - not writing anything. This is a bug in iSDA itself, please report it.');
    return undefined;
  }
  const optionMatches = source.match(/'\s*\d{1,2}[.)]\s+\S/g);
  if (!optionMatches || optionMatches.length < 2) {
    vscode.window.showErrorMessage('iSDA: generated menu boilerplate did not look like a menu - not writing anything. This is a bug in iSDA itself, please report it.');
    return undefined;
  }

  return { baseName, source, commandSource };
}

async function createNewMenu(targetUri?: vscode.Uri): Promise<void> {
  const codeForIBMi = await getConnectedCodeForIBMi();

  let destination: 'local' | 'remote' = 'local';
  if (codeForIBMi) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(folder) Local workspace', value: 'local' as const },
        { label: '$(server) Connected IBM i system', value: 'remote' as const, description: 'Adds both members via ADDPFM' },
      ],
      { placeHolder: 'Where should the new menu be created?' }
    );
    if (!choice) return;
    destination = choice.value;
  }

  const menuInfo = await promptForMenuInfo('MENU1');
  if (!menuInfo) return;
  const { baseName, source, commandSource } = menuInfo;

  if (destination === 'remote') {
    await createRemoteMenuMembers(codeForIBMi!, baseName, source, commandSource);
  } else {
    await createLocalMenuFiles(targetUri, baseName, source, commandSource);
  }
}

/** Writes the MNUDDS member and its paired MNUCMD companion together, since
 *  (per README's "Known limitations") a menu is unusable without both - the
 *  whole point of this command. Local convention (see getMenuCommandMemberUri)
 *  is a sibling `<basename>QQ.mnucmd` file next to `<basename>.mnudds`. */
async function createLocalMenuFiles(targetUri: vscode.Uri | undefined, baseName: string, source: string, commandSource: string): Promise<void> {
  let folderUri = targetUri;
  if (folderUri) {
    const stat = await vscode.workspace.fs.stat(folderUri);
    if (stat.type !== vscode.FileType.Directory) {
      folderUri = vscode.Uri.joinPath(folderUri, '..');
    }
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('iSDA: open a workspace folder before creating a menu.');
      return;
    }
    folderUri =
      workspaceFolders.length === 1
        ? workspaceFolders[0].uri
        : (await vscode.window.showWorkspaceFolderPick())?.uri;
    if (!folderUri) return; // user cancelled the folder pick
  }

  const fileName = baseName + '.mnudds';
  const commandFileName = baseName + 'QQ.mnucmd';
  const fileUri = vscode.Uri.joinPath(folderUri, fileName);
  const commandFileUri = vscode.Uri.joinPath(folderUri, commandFileName);

  const existingNames: string[] = [];
  for (const candidate of [
    { uri: fileUri, name: fileName },
    { uri: commandFileUri, name: commandFileName },
  ]) {
    try {
      await vscode.workspace.fs.stat(candidate.uri);
      existingNames.push(candidate.name);
    } catch {
      // Doesn't exist - normal case, proceed.
    }
  }
  if (existingNames.length > 0) {
    const verb = existingNames.length > 1 ? 'already exist' : 'already exists';
    const overwrite = await vscode.window.showWarningMessage(`${existingNames.join(' and ')} ${verb}. Overwrite?`, { modal: true }, 'Overwrite');
    if (overwrite !== 'Overwrite') return;
  }

  try {
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(source, 'utf8'));
    await vscode.workspace.fs.writeFile(commandFileUri, Buffer.from(commandSource, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    openMenuDesigner(doc.uri);
  } catch (err) {
    vscode.window.showErrorMessage(`iSDA: failed to create menu: ${err}`);
  }
}

/**
 * Minimal, loosely-typed access to the Code for i extension's API - deliberately not
 * importing @halcyontech/vscode-ibmi-types, since this integration must degrade
 * gracefully (no hard dependency) when Code for i isn't installed or isn't connected,
 * and the API surface is explicitly documented as subject to change between versions.
 * See https://codefori.github.io/docs/dev/api/ and .../dev/examples/.
 */
// Deliberately mirrors fetchReferencedFieldAttributes' own activation
// handling below - a soft/lazy-activated extension like Code for i may
// simply not have activated yet in this VS Code session (e.g. its own
// panel hasn't been opened), which is NOT the same as "not installed" or
// "not connected". Without the activate() attempt here, Create New Display
// File/Menu would silently never offer the "Connected IBM i system" option
// even when Code for i is installed and would connect fine once active -
// no error shown, just a missing choice, which is exactly what made this
// bug hard to notice.
async function getConnectedCodeForIBMi(): Promise<{ runCommand: (info: { command: string; environment: string }) => Promise<{ code: number; stdout: string; stderr: string }> } | undefined> {
  const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
  if (!ext) return undefined;
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      // fall through - exports may still be usable, or the checks below will catch it
    }
  }
  if (!ext.exports) return undefined;
  const instance = ext.exports.instance;
  const connection = instance && typeof instance.getConnection === 'function' ? instance.getConnection() : undefined;
  if (!connection || typeof connection.runCommand !== 'function') return undefined;
  return connection;
}

/** Task L18 (docs/sda-reference/LIMITATIONS-PLAN.md): drives the "IBM i:
 *  Connected/Not connected/Not installed" badge in both designer panels.
 *  Deliberately a thin sibling of getConnectedCodeForIBMi() above rather
 *  than a rename of it - that function's callers all want "give me a
 *  usable connection or undefined" and don't care WHY it's missing, while
 *  the badge specifically needs to distinguish "extension not installed"
 *  from "installed but not connected" (different, actionable states for
 *  the person reading the badge - one says "install Code for i", the
 *  other says "connect to a system"). Cheap to call often: no round trip
 *  to the IBM i itself, just an extension-registry lookup and (if already
 *  active) a plain in-memory connection-object check - the one exception
 *  is the same lazy-activation nudge getConnectedCodeForIBMi() already
 *  documents above, which only ever runs once per extension host session
 *  (ext.isActive stays true after the first successful activate()).
 */
async function getCodeForIStatus(): Promise<{ installed: boolean; connected: boolean }> {
  const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
  if (!ext) return { installed: false, connected: false };
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      // fall through - same reasoning as getConnectedCodeForIBMi(): exports
      // may still be usable, or the checks below correctly report "not connected"
    }
  }
  if (!ext.exports) return { installed: true, connected: false };
  const instance = ext.exports.instance;
  const connection = instance && typeof instance.getConnection === 'function' ? instance.getConnection() : undefined;
  const connected = !!(connection && typeof connection.runCommand === 'function');
  return { installed: true, connected };
}

/** Task L38 (docs/sda-reference/LIMITATIONS-PLAN.md): reads the two global
 *  modification-tracking settings - these are only ever the STARTING values
 *  a designer session's own Properties-panel checkbox/tag box initialize
 *  from (see commitSourceChange's own use of DspfWriter.applyModificationTracking
 *  in buildWebviewTemplate.js); toggling them in the panel is session-only
 *  and never writes back here, the same relationship Task L11's ruler
 *  toggle already has with nothing in settings at all. */
function getModTrackingConfig(): { enabled: boolean; tag: string } {
  const config = vscode.workspace.getConfiguration('isda');
  return {
    enabled: !!config.get<boolean>('trackSourceModifications', false),
    tag: (config.get<string>('modificationTag', '') || '').slice(0, 10),
  };
}

/** Task L4 (docs/sda-reference/LIMITATIONS-PLAN.md): ADDPFM (used below to
 *  add the new member) requires the source physical file to already exist -
 *  it doesn't create one. This checks first (CHKOBJ) and, if the file
 *  doesn't appear to exist, offers to create it (CRTSRCPF) before the
 *  caller proceeds to ADDPFM, rather than letting ADDPFM fail with a raw
 *  CPF error the person then has to go create the file to fix manually.
 *  Returns true if the caller should proceed (the file already existed, or
 *  was just created); false if the caller should stop - either the person
 *  declined, or CRTSRCPF itself failed (that failure is already surfaced to
 *  the person here, same pattern as every other command failure in this
 *  file). A CHKOBJ failure (non-zero code, or a thrown error) is treated
 *  the same as "doesn't exist" - it also covers cases like insufficient
 *  authority to even check, where offering to create it (and letting
 *  CRTSRCPF's own error, if any, speak for itself) is more useful than
 *  silently proceeding straight to ADDPFM and letting THAT fail instead
 *  with a less specific error. RCDLEN is left off CRTSRCPF deliberately -
 *  its own default (*SRC, 112) is exactly the standard DDS source PF record
 *  length. */
async function ensureSourcePhysicalFileExists(
  connection: { runCommand: (info: { command: string; environment: string }) => Promise<{ code: number; stdout: string; stderr: string }> },
  qualifiedFile: string
): Promise<boolean> {
  let checkResult: { code: number; stdout: string; stderr: string };
  try {
    checkResult = await connection.runCommand({ command: `CHKOBJ OBJ(${qualifiedFile}) OBJTYPE(*FILE)`, environment: 'ile' });
  } catch {
    checkResult = { code: 1, stdout: '', stderr: '' };
  }
  if (checkResult.code === 0) return true; // already exists - nothing to do

  const create = await vscode.window.showWarningMessage(
    `Source physical file ${qualifiedFile} was not found. Create it now (CRTSRCPF)?`,
    { modal: true },
    'Create it'
  );
  if (create !== 'Create it') return false;

  let createResult: { code: number; stdout: string; stderr: string };
  try {
    createResult = await connection.runCommand({
      command: `CRTSRCPF FILE(${qualifiedFile}) TEXT('Created by iSDA - Interactive Screen Design Aid')`,
      environment: 'ile',
    });
  } catch (err) {
    vscode.window.showErrorMessage(`iSDA: failed to run CRTSRCPF: ${err}`);
    return false;
  }
  if (createResult.code !== 0) {
    vscode.window.showErrorMessage(`iSDA: CRTSRCPF failed - ${(createResult.stderr || createResult.stdout || 'unknown error').trim()}`);
    return false;
  }
  return true;
}

async function createRemoteMember(connection: { runCommand: (info: { command: string; environment: string }) => Promise<{ code: number; stdout: string; stderr: string }> }, memberName: string, source: string): Promise<void> {
  const library = (await vscode.window.showInputBox({
    prompt: 'Library (blank uses the library list, *LIBL)',
    placeHolder: '*LIBL',
  })) ?? '';

  const sourceFile = await vscode.window.showInputBox({
    prompt: 'Source physical file (created automatically with CRTSRCPF if it doesn\'t already exist)',
    placeHolder: 'QDDSSRC',
    validateInput: validateDdsName,
  });
  if (!sourceFile) return;

  const qualifiedFile = library.trim() ? `${library.trim().toUpperCase()}/${sourceFile.trim().toUpperCase()}` : sourceFile.trim().toUpperCase();

  if (!(await ensureSourcePhysicalFileExists(connection, qualifiedFile))) return;

  const command = `ADDPFM FILE(${qualifiedFile}) MBR(${memberName}) SRCTYPE(DSPF) TEXT('Generated by iSDA')`;

  let result: { code: number; stdout: string; stderr: string };
  try {
    result = await connection.runCommand({ command, environment: 'ile' });
  } catch (err) {
    vscode.window.showErrorMessage(`iSDA: failed to run ADDPFM: ${err}`);
    return;
  }
  if (result.code !== 0) {
    vscode.window.showErrorMessage(`iSDA: ADDPFM failed - ${(result.stderr || result.stdout || 'unknown error').trim()}`);
    return;
  }

  const memberPath = library.trim()
    ? `/${library.trim().toUpperCase()}/${sourceFile.trim().toUpperCase()}/${memberName}.dspf`
    : `/${sourceFile.trim().toUpperCase()}/${memberName}.dspf`;
  const memberUri = vscode.Uri.from({ scheme: 'member', path: memberPath });

  try {
    await vscode.workspace.fs.writeFile(memberUri, Buffer.from(source, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(memberUri);
    await vscode.window.showTextDocument(doc);
    openDesigner(doc.uri);
  } catch (err) {
    vscode.window.showErrorMessage(`iSDA: member ${memberName} was created via ADDPFM but writing its content failed: ${err}`);
  }
}

/** Same ADDPFM approach as createRemoteMember() above, but issues it twice -
 *  once per member - into the SAME source file/library, matching the real
 *  SDA convention the README documents (MNUDDS + companion "<menu>QQ" MNUCMD
 *  member, side by side). If the companion ADDPFM fails after the menu member
 *  already succeeded, this doesn't roll the first one back (ADDPFM isn't
 *  transactional either, and the menu member is still perfectly valid on its
 *  own) - it just warns and skips writing companion content, leaving the menu
 *  designer to pick the companion up automatically once it's created some
 *  other way (getMenuCommandMemberUri() treats a missing companion as "no
 *  mappings yet", not an error).
 *
 *  Task M2: ports createRemoteMember()'s own CRTSRCPF fallback (Task L4) here
 *  too - same ensureSourcePhysicalFileExists() call, same "created
 *  automatically" prompt wording, run once before EITHER ADDPFM (the menu
 *  member and its companion commands member share the same qualifiedFile, so
 *  one CHKOBJ/CRTSRCPF pass covers both - no need to repeat it per member). */
async function createRemoteMenuMembers(
  connection: { runCommand: (info: { command: string; environment: string }) => Promise<{ code: number; stdout: string; stderr: string }> },
  baseName: string,
  source: string,
  commandSource: string
): Promise<void> {
  const library = (await vscode.window.showInputBox({
    prompt: 'Library (blank uses the library list, *LIBL)',
    placeHolder: '*LIBL',
  })) ?? '';

  const sourceFile = await vscode.window.showInputBox({
    prompt: 'Source physical file (created automatically with CRTSRCPF if it doesn\'t already exist). Both the menu and its commands member go in this same file.',
    placeHolder: 'QDDSSRC',
    validateInput: validateDdsName,
  });
  if (!sourceFile) return;

  const qualifiedFile = library.trim() ? `${library.trim().toUpperCase()}/${sourceFile.trim().toUpperCase()}` : sourceFile.trim().toUpperCase();
  const commandMemberName = baseName + 'QQ';

  if (!(await ensureSourcePhysicalFileExists(connection, qualifiedFile))) return;

  async function addMember(memberName: string, srcType: string, text: string): Promise<{ code: number; stdout: string; stderr: string } | null> {
    const command = `ADDPFM FILE(${qualifiedFile}) MBR(${memberName}) SRCTYPE(${srcType}) TEXT('${text}')`;
    try {
      return await connection.runCommand({ command, environment: 'ile' });
    } catch (err) {
      vscode.window.showErrorMessage(`iSDA: failed to run ADDPFM for ${memberName}: ${err}`);
      return null;
    }
  }

  const menuResult = await addMember(baseName, 'MNUDDS', 'Generated by iSDA');
  if (!menuResult) return;
  if (menuResult.code !== 0) {
    vscode.window.showErrorMessage(`iSDA: ADDPFM failed - ${(menuResult.stderr || menuResult.stdout || 'unknown error').trim()}`);
    return;
  }

  const commandResult = await addMember(commandMemberName, 'MNUCMD', 'Generated by iSDA - menu commands');
  const commandMemberCreated = !!commandResult && commandResult.code === 0;
  if (!commandMemberCreated) {
    const detail = commandResult ? (commandResult.stderr || commandResult.stdout || 'unknown error').trim() : 'ADDPFM did not run';
    vscode.window.showWarningMessage(
      `iSDA: menu member ${baseName} was created, but the companion commands member ${commandMemberName} failed - ${detail}. Create it separately (SRCTYPE(MNUCMD)) and iSDA will pick it up automatically.`
    );
  }

  const memberPath = (name: string) =>
    library.trim()
      ? `/${library.trim().toUpperCase()}/${sourceFile.trim().toUpperCase()}/${name}`
      : `/${sourceFile.trim().toUpperCase()}/${name}`;
  const memberUri = vscode.Uri.from({ scheme: 'member', path: memberPath(`${baseName}.MNUDDS`) });

  try {
    await vscode.workspace.fs.writeFile(memberUri, Buffer.from(source, 'utf8'));
    if (commandMemberCreated) {
      const commandMemberUri = vscode.Uri.from({ scheme: 'member', path: memberPath(`${commandMemberName}.MNUCMD`) });
      await vscode.workspace.fs.writeFile(commandMemberUri, Buffer.from(commandSource, 'utf8'));
    }
    const doc = await vscode.workspace.openTextDocument(memberUri);
    await vscode.window.showTextDocument(doc);
    openMenuDesigner(doc.uri);
  } catch (err) {
    vscode.window.showErrorMessage(`iSDA: member ${baseName} was created via ADDPFM but writing its content failed: ${err}`);
  }
}

export function deactivate(): void {}

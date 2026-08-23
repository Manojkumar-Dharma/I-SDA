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
const MnuCmdEngine: { parseMnuCmd(text: string): { options: Array<{ optionNumber: string; numberValue: number; command: string }> } } = require('./mnuCmdEngine.js');
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
} = require('./dspfWriter.js');

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
  if (!vscode.extensions.getExtension('halcyontechltd.code-for-ibmi')) {
    vscode.window.showErrorMessage(
      'iSDA: Compile Menu requires the Code for IBM i extension (halcyontechltd.code-for-ibmi) to be installed and connected.'
    );
    return;
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
 * guessing is needed. WHFLDB is the field's length in BYTES (right for
 * character fields); WHFLDD/WHFLDP are DIGITS/decimal-positions (right for
 * numeric fields, which is what DDS's own LENGTH column means for a numeric
 * type) - see the WHFLDT='A' branch below for exactly which pair applies.
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

  const row = rows[0];
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
      } else if (msg.type === 'resolveReferencedField' || msg.type === 'resolveAllReferencedFields') {
        await handleResolveReferencedField(document, msg);
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
    // editor instance's own applyEdit calls against the MNUDDS document.
    let applyingFromWebview = false;
    // Same idea, scoped to our own writes to the companion MNUCMD document -
    // only meaningful when that document is actually open (see below).
    let applyingCommandFromWebview = false;

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
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
          if (applyingCommandFromWebview) return;
          webviewPanel.webview.postMessage({ type: 'externalCommandUpdate', text: e.document.getText() });
        })
      : undefined;

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
        // If the companion member is ALSO open in its own editor tab, edit
        // that document directly (WorkspaceEdit) rather than writing the file
        // out from under it - keeps that tab's buffer, dirty-dot, and undo
        // stack correct instead of silently going stale until reloaded (the
        // gap called out in the 0.9.0/0.9.1 README notes). Otherwise, same
        // direct workspace.fs.writeFile as before - there's no buffer to keep
        // in sync with in that case.
        const openCommandDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === commandUri!.toString());
        try {
          if (openCommandDoc) {
            const fullRange = new vscode.Range(openCommandDoc.positionAt(0), openCommandDoc.positionAt(openCommandDoc.getText().length));
            const edit = new vscode.WorkspaceEdit();
            edit.replace(openCommandDoc.uri, fullRange, msg.text);
            applyingCommandFromWebview = true;
            await vscode.workspace.applyEdit(edit);
            applyingCommandFromWebview = false;
          } else {
            await vscode.workspace.fs.writeFile(commandUri, Buffer.from(msg.text, 'utf8'));
          }
        } catch (err) {
          vscode.window.showErrorMessage(`iSDA: failed to save menu commands to ${commandUri.path}: ${err}`);
        }
      } else if (msg.type === 'compileMenu') {
        await compileMenu(document.uri);
      } else if (msg.type === 'error') {
        vscode.window.showErrorMessage('iSDA: ' + msg.message);
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      commandChangeSub?.dispose();
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
  const codeForIBMi = getConnectedCodeForIBMi();

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

/** Prompts for member/file name, record name, and title; returns the built,
 *  self-validated boilerplate source (parsed with our own parser before being
 *  handed back, so a boilerplate bug fails loudly here rather than shipping a
 *  broken starter file either locally or - worse - as a real member on the IBM i). */
async function promptForRecordInfo(defaultBaseName: string): Promise<{ baseName: string; source: string } | undefined> {
  const nameInput = await vscode.window.showInputBox({
    prompt: 'Display file / member name',
    placeHolder: defaultBaseName,
    value: defaultBaseName,
    validateInput: (value) => validateDdsName(value.trim().replace(/\.dspf$/i, '')),
  });
  if (!nameInput) return undefined;
  const baseName = nameInput.trim().replace(/\.dspf$/i, '').toUpperCase();

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

  const source = buildBoilerplateDspf(recordName.trim().toUpperCase(), titleText);

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
  const codeForIBMi = getConnectedCodeForIBMi();

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
function getConnectedCodeForIBMi(): { runCommand: (info: { command: string; environment: string }) => Promise<{ code: number; stdout: string; stderr: string }> } | undefined {
  const ext = vscode.extensions.getExtension('halcyontechltd.code-for-ibmi');
  if (!ext || !ext.isActive || !ext.exports) return undefined;
  const instance = ext.exports.instance;
  const connection = instance && typeof instance.getConnection === 'function' ? instance.getConnection() : undefined;
  if (!connection || typeof connection.runCommand !== 'function') return undefined;
  return connection;
}

async function createRemoteMember(connection: { runCommand: (info: { command: string; environment: string }) => Promise<{ code: number; stdout: string; stderr: string }> }, memberName: string, source: string): Promise<void> {
  const library = (await vscode.window.showInputBox({
    prompt: 'Library (blank uses the library list, *LIBL)',
    placeHolder: '*LIBL',
  })) ?? '';

  const sourceFile = await vscode.window.showInputBox({
    prompt: 'Source physical file (must already exist - ADDPFM does not create it)',
    placeHolder: 'QDDSSRC',
    validateInput: validateDdsName,
  });
  if (!sourceFile) return;

  const qualifiedFile = library.trim() ? `${library.trim().toUpperCase()}/${sourceFile.trim().toUpperCase()}` : sourceFile.trim().toUpperCase();
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
 *  mappings yet", not an error). */
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
    prompt: 'Source physical file (must already exist - ADDPFM does not create it). Both the menu and its commands member go in this same file.',
    placeHolder: 'QDDSSRC',
    validateInput: validateDdsName,
  });
  if (!sourceFile) return;

  const qualifiedFile = library.trim() ? `${library.trim().toUpperCase()}/${sourceFile.trim().toUpperCase()}` : sourceFile.trim().toUpperCase();
  const commandMemberName = baseName + 'QQ';

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
